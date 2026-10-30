/* FODO admin dashboard API (v15) — /api/admin/*
 * Who may open it:
 *   owner  = the two FODO owner logins (OWNER_EMAILS in _lib/accounts.js): see everything, block/unblock, give any plan, credits or feature free, add viewers
 *   viewer = an email an owner added under Team: read-only, cannot change anything
 *   anyone else → 403 (customers never see other customers' data)
 *   admin  = an email an owner/admin made "Admin" under Team: same controls as an owner (except owners can't be blocked or removed)
 * GET  me | overview | users?q=&offset= | user/<id> | runs?q= | orders | leads | viewers
 * POST user/<id>/block {blocked, note} | user/<id>/grant {type: plan|credits|features|unlimited, ...} | viewers {email, remove?}   (owners only)
 * v17: GET costs?days= (API usage, cost per report/tool/provider, profitability) | health (data sources: healthy / degraded / down)
 *      GET config · POST config {plans:{id:{price,xrays,monitors}}, packs:{id:{price,xrays}}, tools:{id:bool}, reset?}  (prices are admin-controlled)
 *      GET monitoring (every monitored site + recent changes) · GET quality (reports with low data completeness)
 * v17.1: GET lab?days= (every Growth Lab tool: views, starts, completions, users, X-Ray stats, revenue funnel, industries, locations)
 *        GET businesses?q= · GET business/<domain> · GET findings?days=&industry= · GET report/<job> · POST report/<job>/qc {status, note}
 *        GET prompts · POST prompts {key, text, note} | {key, reset} | {key, activate: id}  (owners only) · GET insights (next best actions)
 */
import { bgOn, bdb } from "../../_lib/bg.js";
import { PRODUCTS } from "../../_lib/products.js";
import { json, accountsOn, db, sessionUser, sameOrigin, isOwner, logEvent, cleanEmail, nowIso, activePlan, extraFeatures, randId } from "../../_lib/accounts.js";
import { PLANS, FEATURE_INFO, ORDER } from "../../_lib/plans.js";
import { log } from "../../_lib/xray-core.js";
import { report as trafficReport } from "../../_lib/traffic.js";
import { usageReport, usdInr, LIST_USD, listPrice } from "../../_lib/usage.js";
import { applyConfig, current as cfgCurrent, saveConfig, defaults as cfgDefaults, toolOn } from "../../_lib/config.js";
import { providers } from "../../_lib/xray-core.js";
import { engines as aiEngines } from "../../_lib/aivis.js";
import { gscOn } from "../../_lib/gsc.js";
import { DEFAULTS as PROMPTS, getPrompt, savePrompt, resetPrompt, activatePrompt, pdb } from "../../_lib/prompts.js";
import { istDay } from "../../_lib/traffic.js";

const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString();

export async function onRequest(ctx) {
  const { request, env, params } = ctx, path = [].concat(params.path || []), m = request.method;
  try {
    if (!accountsOn(env)) return json({ ok: false, disabled: true, reason: "Accounts are not switched on yet." }, 503);
    await applyConfig(env);
    if (m === "POST" && (!sameOrigin(request) || !/json/.test(request.headers.get("content-type") || ""))) return json({ ok: false, reason: "Bad request." }, 403);
    const u = await sessionUser(env, request);
    if (!u) return json({ ok: false, login: true, reason: "Please log in." }, 401);
    const d = await db(env), row = !isOwner(u) && u.email ? await d.prepare("SELECT role FROM acct_admins WHERE email=?1").bind(u.email).first() : null;
    const role = isOwner(u) ? "owner" : row ? (row.role === "admin" ? "admin" : "viewer") : null, canEdit = role === "owner" || role === "admin";
    if (!role) return json({ ok: false, forbidden: true, reason: "This dashboard is only for the FODO team." }, 403);
    const p0 = path[0] || "", q = new URL(request.url).searchParams;
    if (m === "GET") {
      if (p0 === "me") return json({ ok: true, role, email: u.email, name: u.name, plans: ORDER.map((id) => ({ id, name: PLANS[id].name, price: PLANS[id].price })), features: Object.keys(FEATURE_INFO).map((id) => ({ id, label: FEATURE_INFO[id].label })) });
      if (p0 === "overview") return json(Object.assign({ ok: true, role }, await overview(d)));
      if (p0 === "users") return json({ ok: true, role, items: (await users(d, clean(q.get("q"), 80), Math.max(0, +q.get("offset") || 0), q.get("filter"), q.get("all") === "1")).map((x) => Object.assign(x, { owner: isOwner(x) })) });
      if (p0 === "user" && path[1]) return userDetail(d, String(path[1]), role);
      if (p0 === "runs") { const s = clean(q.get("q"), 80); const r = await d.prepare("SELECT r.job_id, r.domain, r.tier, r.credit, r.score, r.completeness, r.status, r.created_at, r.client_id, u.email, u.id AS uid FROM acct_runs r LEFT JOIN acct_users u ON u.id = r.user_id" + (s ? " WHERE r.domain LIKE ?1 OR u.email LIKE ?1" : "") + " ORDER BY r.created_at DESC LIMIT 200").bind(...(s ? ["%" + s + "%"] : [])).all(); return json({ ok: true, items: r.results || [] }); }
      if (p0 === "orders") { const r = await d.prepare("SELECT o.order_id, o.kind, o.item, o.amount, o.status, o.created_at, o.paid_at, u.email, u.id AS uid FROM acct_orders o LEFT JOIN acct_users u ON u.id = o.user_id ORDER BY o.created_at DESC LIMIT 200").all(); return json({ ok: true, items: r.results || [] }); }
      if (p0 === "leads") return json({ ok: true, items: await leads(d) });
      if (p0 === "traffic") return json(Object.assign({ ok: true, role }, await trafficReport(env, Math.round(+q.get("days") || 30))));
      if (p0 === "events") { const r = await d.prepare("SELECT e.kind, e.detail, e.created_at, u.email, u.phone, u.name, u.id AS uid FROM acct_events e LEFT JOIN acct_users u ON u.id = e.user_id ORDER BY e.id DESC LIMIT ?1").bind(Math.min(5000, Math.max(1, +q.get("limit") || 200))).all(); return json({ ok: true, items: r.results || [] }); }
      if (p0 === "viewers") { const r = await d.prepare("SELECT email, role, added_by, added_at FROM acct_admins ORDER BY added_at").all(); return json({ ok: true, role, items: r.results || [] }); }
      if (p0 === "costs") return json(Object.assign({ role }, await costs(env, d, Math.round(+q.get("days") || 30))));
      if (p0 === "health") return json(Object.assign({ ok: true, role }, await health(env)));
      if (p0 === "config") return json({ ok: true, role, canEdit, config: cfgCurrent(), defaults: cfgDefaults() });
      if (p0 === "monitoring") return json(Object.assign({ ok: true, role }, await monitoringAll(d)));
      if (p0 === "lab") return json(Object.assign({ ok: true, role }, await labStats(env, d, Math.round(+q.get("days") || 30))));
      if (p0 === "businesses") return json({ ok: true, role, items: await businesses(d, clean(q.get("q"), 80)) });
      if (p0 === "business" && path[1]) return json(Object.assign({ ok: true, role }, await businessDetail(env, d, clean(decodeURIComponent(path.slice(1).join("/")), 120))));
      if (p0 === "findings") return json(Object.assign({ ok: true, role }, await findings(d, Math.round(+q.get("days") || 90), clean(q.get("industry"), 80))));
      if (p0 === "report" && path[1]) return json(Object.assign({ role }, await reportDetail(env, d, String(path[1]))));
      if (p0 === "prompts") return json(Object.assign({ ok: true, role, canEditPrompts: role === "owner" }, await promptsList(env, d)));
      if (p0 === "insights") return json(Object.assign({ ok: true, role }, await insights(env, d)));
      if (p0 === "quality") { const r = await d.prepare("SELECT r.job_id, r.domain, r.tier, r.score, r.completeness, r.status, r.created_at, u.email FROM acct_runs r LEFT JOIN acct_users u ON u.id = r.user_id WHERE r.status != 'COMPLETE' OR r.completeness IS NULL OR r.completeness < ?1 ORDER BY r.created_at DESC LIMIT 200").bind(Math.min(100, Math.max(1, +q.get("below") || 60))).all(); return json({ ok: true, items: r.results || [] }); }
      return json({ ok: false, reason: "Not found." }, 404);
    }
    if (m !== "POST") return json({ ok: false }, 405);
    if (!canEdit) return json({ ok: false, readOnly: true, reason: "View-only access: ask a FODO owner or admin to make the change." }, 403);
    const body = await request.json().catch(() => ({}));
    if (p0 === "report" && path[1] && path[2] === "qc") {
      const st = String(body.status || ""); if (["verified", "needs_review", "failed", ""].indexOf(st) < 0) return json({ ok: false, reason: "Status: verified, needs_review or failed." }, 400);
      const r = await d.prepare("UPDATE acct_runs SET qc=?2, qc_note=?3, qc_by=?4, qc_at=?5 WHERE job_id=?1").bind(String(path[1]), st || null, clean(body.note, 300), u.email, nowIso()).run();
      if (!r.meta || !r.meta.changes) return json({ ok: false, reason: "Report not found." }, 404);
      await logEvent(env, u.id, "admin_qc", String(path[1]) + " → " + (st || "cleared")); return json({ ok: true, qc: st || null });
    }
    if (p0 === "prompts") {   // security-sensitive: owners only (not admins)
      if (role !== "owner") return json({ ok: false, readOnly: true, reason: "Only the two FODO owner logins can change AI prompts." }, 403);
      const key = String(body.key || ""); if (!PROMPTS[key]) return json({ ok: false, reason: "Unknown prompt." }, 400);
      const r = body.reset ? await resetPrompt(env, key, u.email) : body.activate ? await activatePrompt(env, key, +body.activate, u.email) : await savePrompt(env, key, body.text, u.email, body.note);
      if (r.ok) await logEvent(env, u.id, "admin_prompt", key + " → " + (body.reset ? "default" : r.ver || "restored")); return json(r, r.ok ? 200 : 400);
    }
    if (p0 === "config") { const r = await saveConfig(env, body, u.email); if (r.ok) await logEvent(env, u.id, "admin_config", (body.reset ? "reset to defaults" : JSON.stringify({ plans: body.plans || {}, packs: body.packs || {}, tools: body.tools || {} })).slice(0, 280)); return json(r, r.ok ? 200 : 400); }
    if (p0 === "viewers") {
      const email = cleanEmail(body.email); if (!email) return json({ ok: false, reason: "Enter a valid email." }, 400);
      if (isOwner({ email })) return json({ ok: false, reason: "That is a FODO owner login — it always has full control." }, 409);
      if (body.remove) await d.prepare("DELETE FROM acct_admins WHERE email=?1").bind(email).run();
      else await d.prepare("INSERT OR REPLACE INTO acct_admins (email, role, added_by, added_at) VALUES (?1,?2,?3,?4)").bind(email, body.role === "admin" ? "admin" : "viewer", u.email, nowIso()).run();
      return json({ ok: true });
    }
    if (p0 === "user" && path[1] && path[2]) {
      const t = await d.prepare("SELECT * FROM acct_users WHERE id=?1").bind(String(path[1])).first(); if (!t) return json({ ok: false, reason: "User not found." }, 404);
      if (path[2] === "block") {
        if (isOwner(t)) return json({ ok: false, reason: "Owner logins cannot be blocked." }, 409);
        const on = !!body.blocked;
        await d.prepare("UPDATE acct_users SET blocked=?2, admin_note=COALESCE(NULLIF(?3,''),admin_note) WHERE id=?1").bind(t.id, on ? 1 : 0, clean(body.note, 200)).run();
        if (on) await d.prepare("DELETE FROM acct_sessions WHERE user_id=?1").bind(t.id).run();   // logged out everywhere at once
        await logEvent(env, t.id, "admin_block", (on ? "blocked" : "unblocked") + " by " + u.email + (body.note ? " — " + clean(body.note, 120) : ""));
        return json({ ok: true, blocked: on });
      }
      if (path[2] === "grant") return grant(env, d, u, t, body);
    }
    return json({ ok: false, reason: "Not found." }, 404);
  } catch (e) { log({ route: "admin/" + path.join("/"), ok: false, err: String(e && e.message || e).slice(0, 200) }); return json({ ok: false, reason: "The admin service hit an error." }, 500); }
}

async function grant(env, d, admin, t, b) {
  const type = String(b.type || ""), by = " (given free by " + admin.email + ")";
  if (type === "plan") {
    const plan = String(b.plan || ""), days = Math.min(3650, Math.max(1, Math.round(+b.days || 30)));
    if (!PLANS[plan]) return json({ ok: false, reason: "Unknown plan." }, 400);
    if (plan === "free") await d.prepare("UPDATE acct_users SET plan='free', plan_until=NULL, monthly_left=0 WHERE id=?1").bind(t.id).run();
    else await d.prepare("UPDATE acct_users SET plan=?2, plan_until=?3, monthly_left=?4 WHERE id=?1").bind(t.id, plan, new Date(Date.now() + days * 864e5).toISOString(), PLANS[plan].xrays).run();
    if (plan !== "free") await d.prepare("INSERT OR IGNORE INTO acct_ledger (user_id, kind, delta, ref, note, created_at) VALUES (?1,'monthly',?2,?3,?4,?5)").bind(t.id, PLANS[plan].xrays, "admin:" + randId(12), PLANS[plan].name + " for " + days + " days" + by, nowIso()).run();
    await logEvent(env, t.id, "admin_grant", "plan " + plan + (plan === "free" ? "" : " for " + days + " days") + " by " + admin.email);
    return json({ ok: true });
  }
  if (type === "credits") {
    const n = Math.round(+b.n || 0); if (!n || Math.abs(n) > 1000) return json({ ok: false, reason: "Give between 1 and 1000 X-Rays (or a negative number to take some back)." }, 400);
    await d.prepare("UPDATE acct_users SET pack_left = MAX(0, pack_left + ?2) WHERE id=?1").bind(t.id, n).run();
    await d.prepare("INSERT OR IGNORE INTO acct_ledger (user_id, kind, delta, ref, note, created_at) VALUES (?1,'pack',?2,?3,?4,?5)").bind(t.id, n, "admin:" + randId(12), (n > 0 ? n + " X-Rays" : "Removed " + -n + " X-Rays") + by, nowIso()).run();
    await logEvent(env, t.id, "admin_grant", (n > 0 ? "+" : "") + n + " X-Rays by " + admin.email);
    return json({ ok: true });
  }
  if (type === "features") {
    const f = (Array.isArray(b.features) ? b.features : []).map(String).filter((x) => FEATURE_INFO[x]);
    await d.prepare("UPDATE acct_users SET extra_features=?2 WHERE id=?1").bind(t.id, JSON.stringify([...new Set(f)])).run();
    await logEvent(env, t.id, "admin_grant", "features: " + (f.join(", ") || "none") + " by " + admin.email);
    return json({ ok: true, features: f });
  }
  if (type === "unlimited") {
    await d.prepare("UPDATE acct_users SET unlimited=?2 WHERE id=?1").bind(t.id, b.on ? 1 : 0).run();
    await logEvent(env, t.id, "admin_grant", (b.on ? "unlimited X-Rays on" : "unlimited X-Rays off") + " by " + admin.email);
    return json({ ok: true });
  }
  return json({ ok: false, reason: "Unknown grant." }, 400);
}

const one = async (d, sql, ...a) => (await d.prepare(sql).bind(...a).first()) || {};
const all = async (d, sql, ...a) => (await d.prepare(sql).bind(...a).all()).results || [];
async function overview(d) {
  const now = nowIso(), d7 = daysAgo(7), d30 = daysAgo(30), m0 = now.slice(0, 7);
  const [U, R, O, act7, act1, plans, series, sRuns, sLogins, sRev, feats, doms, tiers, recent, funnel, owners] = await Promise.all([
    one(d, "SELECT count(*) total, sum(created_at >= ?1) new7, sum(created_at >= ?2) new30, sum(blocked = 1) blocked, sum(plan != 'free' AND plan_until > ?3) paid, sum(unlimited = 1) gifted FROM acct_users", d7, d30, now),
    one(d, "SELECT count(*) total, sum(created_at >= ?1) last7, sum(status = 'COMPLETE') done, sum(status = 'refunded') refunded, round(avg(score)) avgScore FROM acct_runs", d7),
    one(d, "SELECT count(*) paidOrders, coalesce(sum(amount),0) revenue, coalesce(sum(CASE WHEN substr(paid_at,1,7) = ?1 THEN amount END),0) month FROM acct_orders WHERE status = 'PAID'", m0),
    one(d, "SELECT count(DISTINCT user_id) n FROM acct_events WHERE created_at >= ?1", d7),
    one(d, "SELECT count(DISTINCT user_id) n FROM acct_events WHERE created_at >= ?1", daysAgo(1)),
    all(d, "SELECT CASE WHEN plan != 'free' AND plan_until > ?1 THEN plan ELSE 'free' END p, count(*) n FROM acct_users GROUP BY p", now),
    all(d, "SELECT substr(created_at,1,10) day, count(*) n FROM acct_users WHERE created_at >= ?1 GROUP BY day", d30),
    all(d, "SELECT substr(created_at,1,10) day, count(*) n FROM acct_runs WHERE created_at >= ?1 GROUP BY day", d30),
    all(d, "SELECT substr(created_at,1,10) day, count(DISTINCT user_id) n FROM acct_events WHERE created_at >= ?1 AND kind LIKE 'login_%' GROUP BY day", d30),
    all(d, "SELECT substr(paid_at,1,10) day, sum(amount) n FROM acct_orders WHERE status='PAID' AND paid_at >= ?1 GROUP BY day", d30),
    all(d, "SELECT kind, count(*) n, count(DISTINCT user_id) users FROM acct_events WHERE created_at >= ?1 GROUP BY kind ORDER BY n DESC", d30),
    all(d, "SELECT domain, count(*) n, round(avg(score)) score, max(created_at) last FROM acct_runs GROUP BY domain ORDER BY n DESC LIMIT 12"),
    all(d, "SELECT tier, count(*) n FROM acct_runs GROUP BY tier"),
    all(d, "SELECT e.kind, e.detail, e.created_at, u.email, u.phone, u.name, u.id AS uid FROM acct_events e LEFT JOIN acct_users u ON u.id = e.user_id ORDER BY e.id DESC LIMIT 40"),
    one(d, "SELECT (SELECT count(*) FROM acct_users) signed, (SELECT count(DISTINCT user_id) FROM acct_runs) ran1, (SELECT count(*) FROM (SELECT user_id FROM acct_runs GROUP BY user_id HAVING count(*) >= 2)) ran2, (SELECT count(DISTINCT user_id) FROM acct_events WHERE kind='limit_hit') limited, (SELECT count(DISTINCT user_id) FROM acct_orders WHERE status='PAID') paid"),
    one(d, "SELECT 1 x"),
  ]);
  const days = []; for (let i = 29; i >= 0; i--) days.push(daysAgo(i).slice(0, 10));
  const map = (rows) => { const o = {}; rows.forEach((r) => { o[r.day] = r.n; }); return days.map((x) => o[x] || 0); };
  return { users: U, runs: R, money: O, active7: act7.n || 0, active1: act1.n || 0, plans, days, series: { signups: map(series), xrays: map(sRuns), logins: map(sLogins), revenue: map(sRev) }, features: feats, domains: doms, tiers, recent, funnel };
}
async function users(d, s, offset, filter, everyone) {
  const now = nowIso(), where = [], args = [];
  if (s) { args.push("%" + s + "%"); where.push("(u.email LIKE ?" + args.length + " OR u.name LIKE ?" + args.length + " OR u.phone LIKE ?" + args.length + ")"); }
  if (filter === "paid") { args.push(now); where.push("u.plan != 'free' AND u.plan_until > ?" + args.length); }
  if (filter === "blocked") where.push("u.blocked = 1");
  if (filter === "gifted") where.push("(u.unlimited = 1 OR (u.extra_features IS NOT NULL AND u.extra_features != '[]'))");
  args.push(offset);
  return all(d, "SELECT u.id, u.email, u.name, u.phone, u.login_via, u.picture, u.plan, u.plan_until, u.monthly_left, u.pack_left, u.free_left, u.blocked, u.unlimited, u.extra_features, u.created_at, u.last_login, " +
    "(SELECT count(*) FROM acct_runs r WHERE r.user_id = u.id) runs, (SELECT count(*) FROM acct_events e WHERE e.user_id = u.id) events, (SELECT coalesce(sum(amount),0) FROM acct_orders o WHERE o.user_id = u.id AND o.status='PAID') paid " +
    "FROM acct_users u" + (where.length ? " WHERE " + where.join(" AND ") : "") + " ORDER BY coalesce(u.last_login, u.created_at) DESC LIMIT " + (everyone ? 5000 : 100) + " OFFSET ?" + args.length, ...args);
}
async function userDetail(d, id, role) {
  const t = await d.prepare("SELECT * FROM acct_users WHERE id=?1").bind(id).first(); if (!t) return json({ ok: false, reason: "User not found." }, 404);
  const [usage, events, runs, orders, ledger, team, sessions] = await Promise.all([
    all(d, "SELECT kind, count(*) n, max(created_at) last FROM acct_events WHERE user_id=?1 GROUP BY kind ORDER BY n DESC", id),
    all(d, "SELECT kind, detail, created_at FROM acct_events WHERE user_id=?1 ORDER BY id DESC LIMIT 150", id),
    all(d, "SELECT job_id, domain, tier, credit, score, status, created_at FROM acct_runs WHERE user_id=?1 OR owner_id=?1 ORDER BY created_at DESC LIMIT 100", id),
    all(d, "SELECT order_id, kind, item, amount, status, created_at, paid_at FROM acct_orders WHERE user_id=?1 ORDER BY created_at DESC LIMIT 50", id),
    all(d, "SELECT kind, delta, note, created_at FROM acct_ledger WHERE user_id=?1 ORDER BY id DESC LIMIT 60", id),
    all(d, "SELECT email, added_at FROM acct_team WHERE owner_id=?1", id),
    one(d, "SELECT count(*) n, max(created_at) last FROM acct_sessions WHERE user_id=?1 AND expires_at > ?2", id, Date.now()),
  ]);
  return json({ ok: true, role, user: { id: t.id, email: t.email, name: t.name, picture: t.picture, phone: t.phone, plan: activePlan(t), rawPlan: t.plan, planUntil: t.plan_until, monthly: t.monthly_left, packs: t.pack_left, free: t.free_left, blocked: !!t.blocked, unlimited: !!t.unlimited, owner: isOwner(t), features: extraFeatures(t), note: t.admin_note || "", created: t.created_at, lastLogin: t.last_login, google: !!t.google_sub, sessions: sessions.n || 0 },
    usage, events, runs, orders, ledger, team });
}
/* people who ran out of free X-Rays (or hit the hourly limit) and have not paid — warm sales leads */
async function leads(d) {
  return all(d, "SELECT u.id, u.email, u.name, u.phone, u.created_at, max(e.created_at) last_hit, count(e.id) hits, (SELECT count(*) FROM acct_runs r WHERE r.user_id = u.id) runs, (SELECT group_concat(DISTINCT r.domain) FROM acct_runs r WHERE r.user_id = u.id) domains " +
    "FROM acct_events e JOIN acct_users u ON u.id = e.user_id WHERE e.kind = 'limit_hit' AND NOT EXISTS (SELECT 1 FROM acct_orders o WHERE o.user_id = u.id AND o.status = 'PAID') GROUP BY u.id ORDER BY last_hit DESC LIMIT 200");
}

/* ---------- v17: API cost + profitability (prompt §57–59, §105) — estimates are labelled; revenue is real paid orders ---------- */
async function costs(env, d, days) {
  const U = await usageReport(env, days); if (!U.ok) return U;
  const rate = usdInr(env), since = U.since + "T00:00:00.000Z";
  const runs = (await d.prepare("SELECT job_id, domain, tier, credit, user_id, created_at, status, completeness FROM acct_runs WHERE created_at >= ?1 ORDER BY created_at DESC LIMIT 2000").bind(since).all()).results || [];
  const orders = (await d.prepare("SELECT kind, item, amount FROM acct_orders WHERE status='PAID' AND paid_at >= ?1").bind(since).all()).results || [];
  const byJob = {}; U.perJob.forEach((j) => { byJob[j.job_id] = j; });
  const revenue = orders.reduce((s, o) => s + (+o.amount || 0), 0), apiUsd = +U.totals.cost || 0, apiInr = apiUsd * rate;
  const paidRuns = runs.filter((r) => r.credit === "monthly" || r.credit === "pack").length, freeRuns = runs.filter((r) => r.credit === "free").length, giftRuns = runs.filter((r) => r.credit === "owner" || r.credit === "gift").length;
  const costed = runs.filter((r) => byJob[r.job_id]), avgUsd = costed.length ? costed.reduce((s, r) => s + (+byJob[r.job_id].cost || 0), 0) / costed.length : null;
  const tiers = {}; runs.forEach((r) => { const t = tiers[r.tier || "free"] = tiers[r.tier || "free"] || { runs: 0, cost: 0, costed: 0 }; t.runs++; if (byJob[r.job_id]) { t.cost += +byJob[r.job_id].cost || 0; t.costed++; } });
  const plans = ORDER.map((id) => { const p = PLANS[id], t = tiers[id] || { runs: 0, cost: 0, costed: 0 }, perUsd = t.costed ? t.cost / t.costed : avgUsd, perInr = perUsd == null ? null : perUsd * rate, priceEach = id === "free" ? 0 : p.price / Math.max(1, p.xrays);
    return { id, name: p.name, price: p.price, xrays: p.xrays, pricePerXray: Math.round(priceEach * 100) / 100, runs: t.runs, avgCostInr: perInr == null ? null : Math.round(perInr * 100) / 100, contributionPerXray: perInr == null ? null : Math.round((priceEach - perInr) * 100) / 100, marginPct: perInr == null || !priceEach ? null : Math.round((priceEach - perInr) / priceEach * 1000) / 10 }; });
  const reports = runs.slice(0, 100).map((r) => ({ job_id: r.job_id, domain: r.domain, tier: r.tier, credit: r.credit, created_at: r.created_at, completeness: r.completeness, calls: byJob[r.job_id] ? byJob[r.job_id].calls : 0, cached: byJob[r.job_id] ? byJob[r.job_id].cached : 0, costInr: byJob[r.job_id] ? Math.round(byJob[r.job_id].cost * rate * 100) / 100 : 0 }));
  const users = {}; runs.forEach((r) => { if (!byJob[r.job_id]) return; const x = users[r.user_id] = users[r.user_id] || { user_id: r.user_id, runs: 0, cost: 0 }; x.runs++; x.cost += +byJob[r.job_id].cost || 0; });
  const emails = {}; const ids = Object.keys(users).slice(0, 50); for (const id of ids) { const e = await d.prepare("SELECT email, phone FROM acct_users WHERE id=?1").bind(id).first(); emails[id] = e ? e.email || e.phone : id; }
  return { ok: true, days: U.days, rate, prices: Object.keys(LIST_USD).map((k) => ({ provider: k, usd: listPrice(env, k) })),
    totals: { calls: U.totals.calls || 0, cached: U.totals.cached || 0, failed: U.totals.failed || 0, failedCostInr: Math.round((+U.totals.failedCost || 0) * rate * 100) / 100, costUsd: Math.round(apiUsd * 10000) / 10000, costInr: Math.round(apiInr * 100) / 100, actualUsd: +U.totals.actual || 0,
      cacheRate: U.totals.calls ? Math.round((U.totals.cached || 0) / U.totals.calls * 1000) / 10 : 0, avgReportCostInr: avgUsd == null ? null : Math.round(avgUsd * rate * 100) / 100, reports: runs.length, paidRuns, freeRuns, giftRuns,
      revenue, contribution: Math.round((revenue - apiInr) * 100) / 100, marginPct: revenue ? Math.round((revenue - apiInr) / revenue * 1000) / 10 : null, infraInr: 0 },
    byProvider: U.byProvider.map((x) => Object.assign(x, { costInr: Math.round((+x.cost || 0) * rate * 100) / 100, ms: x.ms == null ? null : Math.round(x.ms) })), byTool: U.byTool.map((x) => Object.assign(x, { costInr: Math.round((+x.cost || 0) * rate * 100) / 100 })),
    byDay: U.byDay.map((x) => Object.assign(x, { costInr: Math.round((+x.cost || 0) * rate * 100) / 100 })), plans, reports, byUser: Object.keys(users).map((k) => ({ who: emails[k] || k, user_id: k, runs: users[k].runs, costInr: Math.round(users[k].cost * rate * 100) / 100 })).sort((a, b) => b.costInr - a.costInr).slice(0, 25) };
}
/* ---------- v17: system health (prompt §93): configured? + last 24 h success rate per data source ---------- */
/* v19 background runner: is it connected, and what happened to background X-Rays in the last 24 h */
async function bgHealth(env) {
  if (!bgOn(env)) return { id: "runner", name: "Background X-Rays (runner Worker)", configured: false, status: "not connected", calls: null, failed: null, last: null, note: "Add RUNNER_URL + RUNNER_KEY (see runner/README.md). Until then X-Rays run in the visitor's browser." };
  const since = new Date(Date.now() - 864e5).toISOString(), m = {};
  (await safeAll(await bdb(env), "SELECT status, COUNT(*) n, MAX(enqueued_at) t FROM xray_bg WHERE enqueued_at >= ?1 GROUP BY status", since)).forEach((x) => { m[x.status] = x; });
  const n = (k) => (m[k] ? m[k].n : 0), all = Object.keys(m).reduce((a, k) => a + m[k].n, 0), last = Object.keys(m).map((k) => m[k].t).sort().pop() || null;
  let up = null; try { const r = await fetch(String(env.RUNNER_URL).replace(/\/$/, "") + "/health", { signal: AbortSignal.timeout(5000) }); up = r.ok ? await r.json() : null; } catch (e) {}
  const st = !up ? "down" : !all ? "no calls (24 h)" : n("failed") / all >= 0.5 ? "down" : n("failed") / all >= 0.1 || n("waiting") > 3 ? "degraded" : "healthy";
  return { id: "runner", name: "Background X-Rays (runner Worker)", configured: true, status: st, calls: all, failed: n("failed"), last,
    note: (up ? "Queue " + (up.queue ? "✓" : "✗") + " · browser " + (up.browser ? "✓" : "✗") + " · GitHub fallback " + (up.github ? "on" : "off") : "The runner Worker did not answer") + " · 24 h: " + n("done") + " done, " + n("running") + " running, " + n("waiting") + " waiting, " + n("queued") + " queued, " + n("failed") + " failed (refunded)." };
}
async function health(env) {
  const P = providers(env), U = await usageReport(env, 1), h = {}; (U.health || []).forEach((x) => { h[x.provider] = x; });
  const row = (id, name, configured, keys, note) => { const all = keys.map((k) => h[k]).filter(Boolean), calls = all.reduce((s, x) => s + x.calls, 0), failed = all.reduce((s, x) => s + x.failed, 0), last = all.map((x) => x.last).sort().pop() || null;
    const st = !configured ? "not connected" : !calls ? "no calls (24 h)" : failed / calls >= 0.5 ? "down" : failed / calls >= 0.1 ? "degraded" : "healthy";
    return { id, name, configured: !!configured, status: st, calls, failed, last, note: note || "" }; };
  let dbOk = false; try { await env.XRAY_DB.prepare("SELECT 1").first(); dbOk = true; } catch (e) {}
  const eng = aiEngines(env, toolOn).map((e) => e.id);
  return { sources: [
    row("crawler", "Website reader (crawler)", true, ["site"], "Pages are read through the X-Ray server; failures show as unreadable sites in reports."),
    row("search", "Search results (" + (P.searchName || "none") + ")", !!P.search, ["serper", "brave"], env.BRAVE_API_KEY && env.SERPER_API_KEY ? "Brave is the automatic backup." : ""),
    row("places", "Local listings (Google Maps via Serper)", !!env.SERPER_API_KEY && toolOn("places"), ["serper_places"]),
    row("pagespeed", "Google PageSpeed Insights", true, ["pagespeed"], env.PAGESPEED_API_KEY ? "" : "No PAGESPEED_API_KEY: works at a low shared quota."),
    row("ai", "AI (Workers AI" + (eng.indexOf("groq") > -1 ? " + Groq" : "") + (eng.indexOf("gemini") > -1 ? " + Gemini" : "") + ")", !!env.AI, ["workers-ai", "groq", "gemini"]),
    row("gsc", "Google Search Console", gscOn(env) && toolOn("gsc"), ["gsc"], gscOn(env) ? "" : "Needs GOOGLE_CLIENT_SECRET."),
    row("opr", "Open PageRank", !!env.OPR_API_KEY, ["opr"]),
    row("seo", "DataForSEO (search volume)", !!P.seo, ["dataforseo"], "Paid provider — optional."),
    { id: "db", name: "Database (D1)", configured: !!env.XRAY_DB, status: dbOk ? "healthy" : "down", calls: null, failed: null, last: null, note: "" },
    { id: "payments", name: "Payments (Cashfree)", configured: !!(env.CASHFREE_APP_ID && env.CASHFREE_SECRET_KEY), status: env.CASHFREE_APP_ID && env.CASHFREE_SECRET_KEY ? (env.CASHFREE_ENV === "production" ? "live" : "sandbox") : "not connected", note: "" },
    { id: "email", name: "Email (Resend)", configured: !!env.RESEND_API_KEY, status: env.RESEND_API_KEY ? "configured" : "not connected", note: "" },
    await bgHealth(env),
    { id: "cron", name: "Monitoring scheduler", configured: !!env.CRON_KEY, status: env.CRON_KEY ? "configured" : "not connected", note: env.CRON_KEY ? "Runs from GitHub Actions daily." : "Add CRON_KEY + the GitHub secret to run checks automatically ('Check now' works without it)." },
  ] };
}
async function monitoringAll(d) {
  try {
    const t = (await d.prepare("SELECT m.id, m.domain, m.kind, m.last_check, m.last_status, m.checks, u.email FROM mon_targets m LEFT JOIN acct_users u ON u.id = m.user_id ORDER BY m.created_at DESC LIMIT 300").all()).results || [];
    const e = (await d.prepare("SELECT e.domain, e.t, e.kind, e.severity, e.what, u.email FROM mon_events e LEFT JOIN acct_users u ON u.id = e.user_id ORDER BY e.id DESC LIMIT 200").all()).results || [];
    return { targets: t, events: e };
  } catch (x) { return { targets: [], events: [] }; }
}

/* ================= v17.1 Growth Lab analytics in admin ================= */
const TOOLSTAT = [["growth-lab", "Growth Lab home", "/growth-lab/", null], ["business-xray", "Business X-Ray", "/business-x-ray/", "xray"], ["growth-score", "Growth Score", "/growth-score/", "score"], ["roi", "ROI Calculator", "/roi-calculator/", "roi"],
  ["competitor-finder", "Competitor Finder", "/competitor-finder/", "competitor_finder"], ["budget", "Marketing Budget Planner", "/marketing-budget/", "budget"], ["quiz", "Marketing Quiz", "/marketing-quiz/", "quiz"], ["game", "FODO Challenge", "/fodo-challenge/", "game"], ["plans", "Plans & pricing", "/plans/", null], ["account", "Account (My Growth Lab)", "/account/", null]];
const safeAll = async (d, sql, ...a) => { try { return await all(d, sql, ...a); } catch (e) { return []; } };
const safeOne = async (d, sql, ...a) => { try { return await one(d, sql, ...a); } catch (e) { return {}; } };
async function labStats(env, d, days) {
  days = Math.max(1, Math.min(365, days)); const sinceDay = istDay(Date.now() - (days - 1) * 864e5), since = daysAgo(days);
  const W = {}; (await safeAll(d, "SELECT dim, k, sum(n) n FROM web_daily WHERE day >= ?1 AND dim IN ('page','evd','ev','tsum','tcnt','uv','pv','ses','conv','conv_kind') GROUP BY dim, k", sinceDay)).forEach((r) => { (W[r.dim] = W[r.dim] || {})[r.k] = r.n; });
  const g = (dim, k) => (W[dim] && W[dim][k]) || 0;
  const ev = {}; (await safeAll(d, "SELECT kind, detail, user_id FROM acct_events WHERE created_at >= ?1 AND kind IN ('tool_use','xray_start','xray_done','xray_refund','limit_hit','checkout','paid','monitor_add','gsc_connect','export_pdf','export_xlsx','share','upgrade_click','report_view','monthly_report','budget_plan','finder_export')", since)).forEach((r) => {
    const k = r.kind === "tool_use" ? "tool_use:" + String(r.detail || "").split(/[\s:·]/)[0] : r.kind, x = ev[k] = ev[k] || { n: 0, users: {} }; x.n++; if (r.user_id) x.users[r.user_id] = 1; });
  const E = (k) => ev[k] ? { n: ev[k].n, users: Object.keys(ev[k].users).length } : { n: 0, users: 0 };
  const tools = TOOLSTAT.map(([id, name, path, key]) => { const views = g("page", path), done = key ? g("evd", "tool_complete|" + key) : 0, started = key ? g("evd", "tool_start|" + key) : 0, li = key ? E("tool_use:" + key) : { n: 0, users: 0 };
    return { id, name, path, views, started, completed: done, loggedInUses: li.n, users: li.users, completionRate: views ? Math.round(done / views * 1000) / 10 : null, avgTimeSec: g("tcnt", path) ? Math.round(g("tsum", path) / g("tcnt", path)) : null }; });
  const R = await safeOne(d, "SELECT count(*) runs, sum(status='COMPLETE') done, sum(status='refunded') refunded, sum(status='running' AND created_at < ?2) stuck, round(avg(score)) avgScore, round(avg(completeness)) avgData, round(avg(duration_ms)/1000) avgSec, count(DISTINCT user_id) users, count(DISTINCT domain) sites, sum(credit IN ('monthly','pack')) paid, sum(credit='free') free, sum(credit IN ('owner','gift')) gift, sum(qc='verified') verified, sum(qc='needs_review') review, sum(qc='failed') qcFailed FROM acct_runs WHERE created_at >= ?1", since, daysAgo(1 / 24));
  const tiers = await safeAll(d, "SELECT tier, count(*) n, round(avg(score)) score, round(avg(completeness)) data FROM acct_runs WHERE created_at >= ?1 GROUP BY tier ORDER BY n DESC", since);
  const O = await safeOne(d, "SELECT count(*) n, coalesce(sum(amount),0) revenue, sum(kind='plan') plans, sum(kind='pack') packs FROM acct_orders WHERE status='PAID' AND paid_at >= ?1", since);
  const S = await safeOne(d, "SELECT count(*) n FROM acct_users WHERE created_at >= ?1", since);
  const industries = await safeAll(d, "SELECT coalesce(NULLIF(b.industry,''),'(unknown)') k, count(*) n FROM xray_businesses b JOIN acct_runs r ON r.job_id = b.job_id WHERE r.created_at >= ?1 GROUP BY k ORDER BY n DESC LIMIT 15", since);
  const locations = await safeAll(d, "SELECT coalesce(NULLIF(b.location,''),'(unknown)') k, count(*) n FROM xray_businesses b JOIN acct_runs r ON r.job_id = b.job_id WHERE r.created_at >= ?1 GROUP BY k ORDER BY n DESC LIMIT 15", since);
  const mon = await safeOne(d, "SELECT count(*) n, count(DISTINCT user_id) users FROM mon_targets"), gscN = await safeOne(d, "SELECT count(*) n FROM lab_gsc"), actN = await safeOne(d, "SELECT count(*) n, sum(status='done') done, count(DISTINCT user_id) users FROM lab_actions");
  const toolDone = Object.keys(W.evd || {}).filter((k) => /^tool_complete\|/.test(k)).reduce((s0, k) => s0 + W.evd[k], 0);
  const leads = Object.keys(W.conv_kind || {}).filter((k) => /generate_lead|form_submit|whatsapp_click|booking_click|phone_click|email_click|audit_cta_click|service_cta_click/.test(k)).reduce((s0, k) => s0 + W.conv_kind[k], 0);
  // revenue funnel (prompt §102): each step from its own source; steps are counts in the period, not one tracked cohort
  const funnel = [["Visitors", g("uv", "all"), "Unique visitors a day, summed (first-party analytics)"], ["Used a free tool", toolDone, "Completed Growth Score, ROI, quiz, game, Competitor Finder or Budget Planner"],
    ["Signed up", S.n || 0, "New Growth Lab accounts"], ["Saw the plans page", g("page", "/plans/"), "Views of /plans/"], ["Started checkout", E("checkout").n, "Opened Cashfree checkout"], ["Paid", O.n || 0, "Paid orders"],
    ["Got a report", R.done || 0, "X-Rays completed"], ["Started monitoring", E("monitor_add").n, "Websites added to monitoring"], ["Asked FODO for help", leads, "Contact, WhatsApp, call, booking and lead-form actions"]].map((x) => ({ step: x[0], n: x[1], note: x[2] }));
  // v18 standalone tools: runs (reused vs fresh scan), bought runs and revenue per tool
  const TR = await safeAll(d, "SELECT tool, source, status, reused, COUNT(*) n FROM lab_tool_runs WHERE created_at >= ?1 GROUP BY tool, source, status, reused", since);
  const TO = await safeAll(d, "SELECT item, COUNT(*) n, SUM(amount) amt FROM acct_orders WHERE kind='tool' AND status='PAID' AND created_at >= ?1 GROUP BY item", since);
  const products = Object.keys(PRODUCTS).map((id) => { const r = TR.filter((x) => x.tool === id), o = TO.filter((x) => x.item === id)[0] || {}, sum = (f) => r.filter(f).reduce((a, x) => a + x.n, 0);
    return { id, name: PRODUCTS[id].name, price: PRODUCTS[id].price, on: PRODUCTS[id].on !== false, runs: sum(() => true), reused: sum((x) => x.reused === 1), fresh: sum((x) => x.reused !== 1), done: sum((x) => x.status === "done"), viaPlan: sum((x) => x.source === "included" || x.source === "xray"), bought: o.n || 0, revenue: o.amt || 0 }; });
  return { days, since: sinceDay, products, tools, xray: Object.assign({}, R, { starts: E("xray_start").n, limitHits: E("limit_hit"), exportsPdf: E("export_pdf").n, exportsXlsx: E("export_xlsx").n, shares: E("share").n }), tiers, money: O, signups: S.n || 0, industries, locations,
    monitoring: { sites: mon.n || 0, users: mon.users || 0 }, gscConnected: gscN.n || 0, actions: { n: actN.n || 0, done: actN.done || 0, users: actN.users || 0 }, funnel, eventsTotal: Object.keys(ev).map((k) => ({ kind: k, n: ev[k].n, users: Object.keys(ev[k].users).length })).sort((a, b) => b.n - a.n) };
}
async function businesses(d, q) {
  const args = [], w = q ? (args.push("%" + q + "%"), " WHERE r.domain LIKE ?1") : "";
  return safeAll(d, "SELECT r.domain, count(*) runs, count(DISTINCT r.user_id) users, max(r.created_at) last, (SELECT score FROM acct_runs x WHERE x.domain = r.domain AND x.status='COMPLETE' ORDER BY x.created_at DESC LIMIT 1) score, (SELECT completeness FROM acct_runs x WHERE x.domain = r.domain AND x.status='COMPLETE' ORDER BY x.created_at DESC LIMIT 1) data, (SELECT industry FROM xray_businesses b JOIN acct_runs y ON y.job_id=b.job_id WHERE y.domain=r.domain ORDER BY y.created_at DESC LIMIT 1) industry, (SELECT location FROM xray_businesses b JOIN acct_runs y ON y.job_id=b.job_id WHERE y.domain=r.domain ORDER BY y.created_at DESC LIMIT 1) location, (SELECT name FROM xray_businesses b JOIN acct_runs y ON y.job_id=b.job_id WHERE y.domain=r.domain ORDER BY y.created_at DESC LIMIT 1) name FROM acct_runs r" + w + " GROUP BY r.domain ORDER BY last DESC LIMIT 300", ...args);
}
async function businessDetail(env, d, domain) {
  const runs = await safeAll(d, "SELECT r.job_id, r.tier, r.credit, r.score, r.completeness, r.duration_ms, r.status, r.qc, r.created_at, u.email, u.id AS uid FROM acct_runs r LEFT JOIN acct_users u ON u.id = r.user_id WHERE r.domain=?1 ORDER BY r.created_at DESC LIMIT 50", domain);
  const last = runs.filter((r) => r.status === "COMPLETE")[0]; let summary = null;
  if (last) { const row = await safeOne(d, "SELECT report FROM xray_reports WHERE job_id=?1", last.job_id); try { const R = JSON.parse(row.report || "null"); if (R) summary = { name: R.business && R.business.name && R.business.name.value, industry: R.business && R.business.industry && R.business.industry.value, city: R.business && R.business.city, scores: Object.keys(R.scores.areas).map((k) => ({ name: R.scores.areas[k].name, score: R.scores.areas[k].score })), overall: R.scores.overall,
    top: (R.opportunities || []).slice(0, 5).map((o) => ({ title: o.title, priority: o.priority, category: o.category })), competitors: (R.competitors || []).map((c) => ({ name: c.name, domain: c.domain, score: c.score })), completeness: R.completeness ? R.completeness.overall : null,
    ai: R.visibility && R.visibility.score ? R.visibility.score.score : null, local: R.local && R.local.me ? { rating: R.local.me.rating, reviews: R.local.me.reviews, median: R.local.medianRating } : null }; } catch (e) {} }
  const events = await safeAll(d, "SELECT e.t, e.kind, e.severity, e.what, u.email FROM mon_events e LEFT JOIN acct_users u ON u.id = e.user_id WHERE e.domain=?1 ORDER BY e.id DESC LIMIT 30", domain);
  const watchers = await safeAll(d, "SELECT m.kind, m.last_check, u.email FROM mon_targets m LEFT JOIN acct_users u ON u.id = m.user_id WHERE m.domain=?1", domain);
  const actions = await safeOne(d, "SELECT count(*) n, sum(status='done') done, sum(status='doing') doing FROM lab_actions WHERE domain=?1", domain);
  const jobs = runs.map((r) => r.job_id); let cost = 0; if (jobs.length) { const c = await safeOne(d, "SELECT sum(cost_usd) c FROM api_usage WHERE job_id IN (" + jobs.map((_, i) => "?" + (i + 1)).join(",") + ")", ...jobs); cost = (+c.c || 0) * usdInr(env); }
  return { domain, runs, summary, events, watchers, actions, costInr: Math.round(cost * 100) / 100 };
}
async function findings(d, days, industry) {
  const since = daysAgo(days), args = [since], ind = industry ? (args.push(industry), " AND b.industry = ?2") : "";
  const base = "FROM acct_runs r LEFT JOIN xray_businesses b ON b.job_id = r.job_id WHERE r.created_at >= ?1 AND r.status='COMPLETE'" + ind;
  const total = (await safeOne(d, "SELECT count(*) n " + base, ...args)).n || 0;
  const opps = await safeAll(d, "SELECT json_extract(o.data,'$.title') title, count(DISTINCT o.job_id) reports, round(avg(o.score)) score, sum(o.priority='P0') p0 FROM xray_opportunities o JOIN (SELECT r.job_id " + base + ") j ON j.job_id = o.job_id GROUP BY title ORDER BY reports DESC, score DESC LIMIT 40", ...args);
  const checks = await safeAll(d, "SELECT f.id, json_extract(f.data,'$.name') name, f.area, sum(f.status='fail') fails, sum(f.status='warn') warns, count(DISTINCT f.job_id) reports FROM xray_findings f JOIN (SELECT r.job_id " + base + ") j ON j.job_id = f.job_id GROUP BY f.id ORDER BY fails DESC, warns DESC LIMIT 40", ...args);
  const comps = await safeAll(d, "SELECT c.domain, count(DISTINCT c.job_id) reports, round(avg(c.confidence)*100) fit FROM xray_competitors c JOIN (SELECT r.job_id " + base + ") j ON j.job_id = c.job_id GROUP BY c.domain ORDER BY reports DESC LIMIT 25", ...args);
  const inds = await safeAll(d, "SELECT b.industry k, count(*) n FROM xray_businesses b JOIN acct_runs r ON r.job_id=b.job_id WHERE r.created_at >= ?1 AND b.industry != '' GROUP BY k ORDER BY n DESC LIMIT 30", since);
  return { days, industry: industry || null, reports: total, opportunities: opps.map((o) => Object.assign(o, { share: total ? Math.round(o.reports / total * 100) : 0 })), checks, competitors: comps, industries: inds };
}
async function reportDetail(env, d, job) {
  if (!/^[a-z0-9]{20}$/.test(job)) return { ok: false, reason: "Bad id." };
  const run = await safeOne(d, "SELECT r.*, u.email, u.name, u.id AS uid FROM acct_runs r LEFT JOIN acct_users u ON u.id = r.user_id WHERE r.job_id=?1", job);
  const jobRow = await safeOne(d, "SELECT input, status, stage, note, created_at, updated_at FROM xray_jobs WHERE id=?1", job);
  const calls = await safeAll(d, "SELECT t, provider, endpoint, tool, status, ok, ms, cached, cost_usd, cost_kind, units FROM api_usage WHERE job_id=?1 ORDER BY id", job);
  const row = await safeOne(d, "SELECT report FROM xray_reports WHERE job_id=?1", job); let R = null; try { R = JSON.parse(row.report || "null"); } catch (e) {}
  if (!run.job_id && !jobRow.status) return { ok: false, reason: "Report not found." };
  const rate = usdInr(env), sum = calls.reduce((s0, c) => s0 + (+c.cost_usd || 0), 0);
  const pay = run.uid ? await safeAll(d, "SELECT order_id, kind, item, amount, status, paid_at FROM acct_orders WHERE user_id=?1 AND status='PAID' ORDER BY paid_at DESC LIMIT 5", run.uid) : [];
  return { ok: true, job, run, input: (() => { try { return JSON.parse(jobRow.input || "{}"); } catch (e) { return {}; } })(), job_status: jobRow, calls: calls.map((c) => Object.assign(c, { costInr: Math.round((+c.cost_usd || 0) * rate * 10000) / 10000 })), costInr: Math.round(sum * rate * 100) / 100, payments: pay,
    report: R ? { version: R.version, createdAt: R.createdAt, durationMs: R.durationMs, providers: R.providers, overall: R.scores.overall, status: R.scores.status, areas: Object.keys(R.scores.areas).map((k) => ({ name: R.scores.areas[k].name, score: R.scores.areas[k].score, quality: R.scores.areas[k].quality, note: R.scores.areas[k].note })),
      completeness: R.completeness || null, modules: R.modules || {}, dataQuality: R.dataQuality || {}, evidence: (R.evidence || []).length, sources: (R.sources || []).length, opportunities: (R.opportunities || []).slice(0, 15).map((o) => ({ id: o.id, title: o.title, priority: o.priority, score: o.priorityScore, label: o.label, evidence: o.evidence.length })),
      checks: { fail: (R.checks || []).filter((c) => c.status === "fail").length, warn: (R.checks || []).filter((c) => c.status === "warn").length, pass: (R.checks || []).filter((c) => c.status === "pass").length }, competitors: (R.competitors || []).map((c) => ({ name: c.name, domain: c.domain, score: c.score })),
      synthesisBy: R.synthesisBy, synthesisDropped: (R.synthesisDropped || []).length, ai: R.visibility ? { tested: R.visibility.tested, brandIn: R.visibility.brandIn, score: R.visibility.score && R.visibility.score.score, engines: (R.visibility.engines || []).map((e) => e.name) } : null, crawl: R.crawl ? { pages: R.crawl.pages, blocked: R.crawl.blocked, errors: R.crawl.errors, limitsHit: R.crawl.limitsHit } : null } : null };
}
async function promptsList(env, d) {
  await pdb(env); const since = daysAgo(30);
  const hist = await safeAll(d, "SELECT id, pkey, ver, note, created_by, created_at, active, length(text) len FROM lab_prompts ORDER BY id DESC LIMIT 200");
  const stats = {}; (await safeAll(d, "SELECT tool, count(*) calls, sum(ok=0) failed, round(avg(units),2) dropped, round(avg(ms)) ms, max(t) last FROM api_usage WHERE tool LIKE 'prompt:%' AND t >= ?1 GROUP BY tool", since)).forEach((r) => { stats[r.tool] = r; });
  const out = [];
  for (const k of Object.keys(PROMPTS)) { const P = await getPrompt(env, k), def = await getPrompt({}, k);
    const vers = Object.keys(stats).filter((t) => t.indexOf("prompt:" + k + "@") === 0).map((t) => Object.assign({ ver: t.split("@")[1] }, stats[t]));
    out.push({ key: k, name: PROMPTS[k].name, ver: P.ver, custom: P.custom, defaultVer: def.ver, text: P.text, model: "Workers AI (Llama 3.3 70B → 3.1 8B fallback)" + (k === "visibility" ? " + Groq + Gemini" : ""), versions: vers, history: hist.filter((h) => h.pkey === k).slice(0, 20) }); }
  return { prompts: out, note: "Output-format rules (JSON shape, evidence-id checks) are fixed in code and always appended — editing a prompt cannot switch off FODO's checks." };
}
/* next best actions for the FODO team (rule-based, from the data) */
async function insights(env, d) {
  const out = [], add = (level, title, detail, link) => out.push({ level, title, detail, link });
  const lim = await safeOne(d, "SELECT count(DISTINCT e.user_id) n FROM acct_events e LEFT JOIN acct_orders o ON o.user_id = e.user_id AND o.status='PAID' WHERE e.kind='limit_hit' AND e.created_at >= ?1 AND o.order_id IS NULL", daysAgo(30));
  if (lim.n) add("money", lim.n + " user(s) ran out of free X-Rays and have not paid", "Send them a plan or pack offer — they already saw the value.", "users");
  const low = await safeOne(d, "SELECT count(*) n FROM acct_runs WHERE status='COMPLETE' AND completeness < 60 AND created_at >= ?1 AND (qc IS NULL OR qc='')", daysAgo(30));
  if (low.n) add("quality", low.n + " report(s) with data completeness under 60% not reviewed", "Open them in Quality — usually a missing data source or a site that blocks readers.", "quality");
  const stuck = await safeOne(d, "SELECT count(*) n FROM acct_runs WHERE status='running' AND created_at >= ?1 AND created_at < ?2", daysAgo(7), daysAgo(1 / 24));
  if (stuck.n) add("quality", stuck.n + " X-Ray(s) never finished", "Visitors closed the tab or a step failed. Check Costs → System health.", "xrays");
  const ai = await safeOne(d, "SELECT count(*) calls, sum(ok=0) failed FROM api_usage WHERE t >= ?1 AND (provider IN ('workers-ai','groq','gemini'))", daysAgo(1));
  if (ai.calls >= 10 && ai.failed / ai.calls > 0.2) add("health", "AI engines failing " + Math.round(ai.failed / ai.calls * 100) + "% of the time (24 h)", "Check keys and quotas in Costs → System health.", "costs");
  if (!env.GROQ_API_KEY) add("setup", "Groq not connected (free)", "Add GROQ_API_KEY — a second AI engine for AI Visibility.", "settings");
  if (!env.GEMINI_API_KEY) add("setup", "Gemini not connected (free tier)", "Add GEMINI_API_KEY — answers from live Google Search with citations.", "settings");
  if (!gscOn(env)) add("setup", "Search Console connection is off", "Add GOOGLE_CLIENT_SECRET so customers can add their real clicks and impressions.", "settings");
  if (!env.CRON_KEY) add("setup", "Monitoring runs only when users press “Check now”", "Add CRON_KEY in Cloudflare and FODO_CRON_KEY in GitHub for daily checks.", "monitoring");
  if (!(env.CASHFREE_APP_ID && env.CASHFREE_SECRET_KEY)) add("money", "Payments are not connected", "Finish Cashfree KYC and add the keys — plans can't be bought yet.", "payments");
  const hi = await safeOne(d, "SELECT count(*) n FROM mon_events WHERE severity='high' AND t >= ?1", daysAgo(7));
  if (hi.n) add("customers", hi.n + " high-severity change(s) found for customers this week", "Good moment to reach out with help (noindex, downtime, competitor price moves).", "monitoring");
  const repeat = await safeOne(d, "SELECT count(*) n FROM (SELECT user_id FROM acct_runs WHERE created_at >= ?1 GROUP BY user_id HAVING count(DISTINCT domain) >= 3)", daysAgo(30));
  if (repeat.n) add("money", repeat.n + " user(s) X-Rayed 3+ different websites this month", "Likely agencies — offer the Agency plan (white-label, bulk, client folders).", "users");
  return { items: out };
}
