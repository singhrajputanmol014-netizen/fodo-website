/* FODO admin dashboard API (v15) — /api/admin/*
 * Who may open it:
 *   owner  = the two FODO owner logins (OWNER_EMAILS in _lib/accounts.js): see everything, block/unblock, give any plan, credits or feature free, add viewers
 *   viewer = an email an owner added under Team: read-only, cannot change anything
 *   anyone else → 403 (customers never see other customers' data)
 *   admin  = an email an owner/admin made "Admin" under Team: same controls as an owner (except owners can't be blocked or removed)
 * GET  me | overview | users?q=&offset= | user/<id> | runs?q= | orders | leads | viewers
 * POST user/<id>/block {blocked, note} | user/<id>/grant {type: plan|credits|features|unlimited, ...} | viewers {email, remove?}   (owners only)
 */
import { json, accountsOn, db, sessionUser, sameOrigin, isOwner, logEvent, cleanEmail, nowIso, activePlan, extraFeatures, randId } from "../../_lib/accounts.js";
import { PLANS, FEATURE_INFO, ORDER } from "../../_lib/plans.js";
import { log } from "../../_lib/xray-core.js";
import { report as trafficReport } from "../../_lib/traffic.js";

const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString();

export async function onRequest(ctx) {
  const { request, env, params } = ctx, path = [].concat(params.path || []), m = request.method;
  try {
    if (!accountsOn(env)) return json({ ok: false, disabled: true, reason: "Accounts are not switched on yet." }, 503);
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
      if (p0 === "runs") { const s = clean(q.get("q"), 80); const r = await d.prepare("SELECT r.job_id, r.domain, r.tier, r.credit, r.score, r.status, r.created_at, r.client_id, u.email, u.id AS uid FROM acct_runs r LEFT JOIN acct_users u ON u.id = r.user_id" + (s ? " WHERE r.domain LIKE ?1 OR u.email LIKE ?1" : "") + " ORDER BY r.created_at DESC LIMIT 200").bind(...(s ? ["%" + s + "%"] : [])).all(); return json({ ok: true, items: r.results || [] }); }
      if (p0 === "orders") { const r = await d.prepare("SELECT o.order_id, o.kind, o.item, o.amount, o.status, o.created_at, o.paid_at, u.email, u.id AS uid FROM acct_orders o LEFT JOIN acct_users u ON u.id = o.user_id ORDER BY o.created_at DESC LIMIT 200").all(); return json({ ok: true, items: r.results || [] }); }
      if (p0 === "leads") return json({ ok: true, items: await leads(d) });
      if (p0 === "traffic") return json(Object.assign({ ok: true, role }, await trafficReport(env, Math.round(+q.get("days") || 30))));
      if (p0 === "events") { const r = await d.prepare("SELECT e.kind, e.detail, e.created_at, u.email, u.phone, u.name, u.id AS uid FROM acct_events e LEFT JOIN acct_users u ON u.id = e.user_id ORDER BY e.id DESC LIMIT ?1").bind(Math.min(5000, Math.max(1, +q.get("limit") || 200))).all(); return json({ ok: true, items: r.results || [] }); }
      if (p0 === "viewers") { const r = await d.prepare("SELECT email, role, added_by, added_at FROM acct_admins ORDER BY added_at").all(); return json({ ok: true, role, items: r.results || [] }); }
      return json({ ok: false, reason: "Not found." }, 404);
    }
    if (m !== "POST") return json({ ok: false }, 405);
    if (!canEdit) return json({ ok: false, readOnly: true, reason: "View-only access: ask a FODO owner or admin to make the change." }, 403);
    const body = await request.json().catch(() => ({}));
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
