/* FODO OWNER BRAIN, proactive layer: daily briefing, alerts (anomalies, failures, costs, support), all from real data.
   Alerts are de-duplicated by key (one per problem per day) and stay until the owner acknowledges them.
   The daily briefing also runs from the existing daily scheduler (POST /api/monitor/tick, 06:47 IST), no new infrastructure. */
import { brainDb, nowIso, rid, clip, istDay, audit, getSettings } from "./store.js";
import { execute, systemCheck, fodoToday } from "./tools.js";
import { listTasks } from "./memory.js";
import { brainAI, availableProviders } from "./models.js";
import { getPrompt } from "../prompts.js";
import { OWNER_EMAILS, sha256, randId } from "../accounts.js";

async function upsertAlert(env, a) {
  const d = await brainDb(env), now = nowIso(), key = a.key + "|" + istDay();
  const ex = await d.prepare("SELECT id, status FROM brain_alerts WHERE akey=?1").bind(key).first();
  if (ex) { await d.prepare("UPDATE brain_alerts SET reason=?2, evidence=?3, updated_at=?4 WHERE id=?1").bind(ex.id, a.reason, a.evidence, now).run(); return ex.id; }
  const id = "al_" + rid(10);
  await d.prepare("INSERT INTO brain_alerts (id, akey, severity, title, reason, evidence, action, status, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'open',?8,?8)").bind(id, key, a.severity, clip(a.title, 160), clip(a.reason, 500), clip(a.evidence, 800), clip(a.action, 300), now).run();
  try { await (await import("./automations.js")).onEvent(env, "alert", null, a.severity + ": " + a.title + ": " + a.reason); } catch (e) {}   // a new alert can trigger automations (e.g. email me on critical)
  return id;
}
export async function listAlerts(env, all) { const d = await brainDb(env); return ((await d.prepare("SELECT * FROM brain_alerts WHERE (?1 = 1 OR status='open') ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'important' THEN 1 ELSE 2 END, created_at DESC LIMIT 60").bind(all ? 1 : 0).all()).results || []); }
export async function ackAlert(env, id) { const d = await brainDb(env); await d.prepare("UPDATE brain_alerts SET status='acknowledged', updated_at=?2 WHERE id=?1").bind(id, nowIso()).run(); }

/* detect problems and changes worth the owner's attention, thresholds avoid noise */
export async function scan(ctx, health, today) {
  const env = ctx.env, found = [];
  const push = (a) => found.push(a);
  (health && health.checks || []).filter((c) => c.status === "FAIL").forEach((c) => push({ key: "fail:" + c.id, severity: "critical", title: c.name + " is failing", reason: "The system check failed for " + c.name + ".", evidence: c.evidence, action: "Open Diagnostics and fix " + c.name + " first." }));
  try {
    const d = env.XRAY_DB, since = new Date(Date.now() - 864e5).toISOString();
    const bad = await d.prepare("SELECT count(*) n, group_concat(domain) doms FROM acct_runs WHERE created_at >= ?1 AND status IN ('refunded','FAILED','failed')").bind(since).first();
    if (bad && bad.n >= 2) push({ key: "xray-fail", severity: "important", title: bad.n + " X-Rays failed in 24 h", reason: "Several X-Rays could not finish (credits were refunded).", evidence: clip(bad.doms, 300), action: "Check Admin → Quality and the data sources." });
    const c1 = await d.prepare("SELECT coalesce(sum(cost_usd),0) c FROM api_usage WHERE t >= ?1").bind(since).first(), c7 = await d.prepare("SELECT coalesce(sum(cost_usd),0) c FROM api_usage WHERE t >= ?1 AND t < ?2").bind(new Date(Date.now() - 8 * 864e5).toISOString(), since).first();
    const avg = (c7 && c7.c || 0) / 7; if (c1 && c1.c > 0.5 && avg > 0 && c1.c > 2.5 * avg) push({ key: "cost-spike", severity: "important", title: "API cost spike", reason: "The last 24 h cost $" + c1.c.toFixed(2) + " vs a daily average of $" + avg.toFixed(2) + ".", evidence: "api_usage, last 8 days", action: "Open Admin → Costs to see which provider or report." });
  } catch (e) {}
  if (today) {
    const h = today.helpDesk; if (h && h.unansweredOver24h > 0) push({ key: "support-wait", severity: "important", title: h.unansweredOver24h + " customer ticket(s) waiting over 24 h", reason: "Customers are waiting for a reply.", evidence: "Help desk", action: "Reply in Admin → Help desk." });
    const x = today.xrays && today.xrays.daily, s = today.users && today.users.signups;
    if (x && x.previous7days >= 7 && x.last7days <= x.previous7days * 0.4) push({ key: "xray-drop", severity: "important", title: "X-Ray usage dropped", reason: x.last7days + " X-Rays in the last 7 days vs " + x.previous7days + " the week before.", evidence: "acct_runs daily series", action: "Check the X-Ray page, traffic and any errors." });
    if (s && s.today >= 5 && s.today >= 3 * Math.max(1, s.last7days / 7)) push({ key: "signup-spike", severity: "info", title: "Sign-up spike today", reason: s.today + " sign-ups today vs about " + Math.round(s.last7days / 7) + " a day.", evidence: "acct_users", action: "See where they came from in Traffic." });
    const rv = today.revenueINR && today.revenueINR.daily; if (rv && rv.today > 0) push({ key: "revenue-today", severity: "info", title: "₹" + rv.today.toLocaleString("en-IN") + " revenue today", reason: "New paid orders today.", evidence: "acct_orders", action: "Welcome the new customers." });
  }
  for (const a of found) await upsertAlert(env, a);
  return found;
}

/* the executive briefing: real numbers + health + alerts + tasks + insights (+ an AI summary when available) */
export async function briefing(ctx, o) {
  o = o || {};
  const env = ctx.env, d = await brainDb(env), dayKey = istDay();
  const prev = await d.prepare("SELECT * FROM brain_briefings WHERE day=?1").bind(dayKey).first();   // numbers are always live; only the AI-written text is reused
  const [health, today, ins, tasks] = await Promise.all([systemCheck(ctx, false).catch(() => null), fodoToday(ctx).catch(() => null), execute(ctx, "admin_insights", {}).catch(() => null), listTasks(env, {}).catch(() => [])]);
  const settings = await getSettings(env);
  if (settings.alerts !== "off") await scan(ctx, health, today).catch(() => []);
  const alerts = await listAlerts(env);
  const data = { day: dayKey, health: health && { overall: health.overall, checks: health.checks }, today, insights: ins && ins.ok ? ins.result : [], tasks: tasks.slice(0, 8).map((t) => ({ id: t.id, title: t.title, priority: t.priority, status: t.status, project: t.project })), alerts: alerts.slice(0, 10) };
  let text = prev && !o.force ? prev.text || "" : "", textAt = prev && !o.force ? prev.created_at : null, av = availableProviders(env);
  if ((o.force || !prev) && o.ai !== false && (av["workers-ai"] || av.groq || av.gemini)) {
    try { const P = await getPrompt(env, "brainCore");
      const a = await brainAI(env, { kind: "deep", purpose: "briefing", provider: settings.provider, max: 700, messages: [{ role: "system", content: P.text }, { role: "user", content: "Write today's executive briefing for the owner from this data only (max 160 words): one line on system health, the key business numbers, anything that needs attention, then 'Recommended:' with 3 numbered actions grounded in the data. If a number is missing, don't invent it.\n\nDATA:\n" + clip(JSON.stringify(data), 9000) }] });
      text = a.text.trim(); textAt = nowIso(); } catch (e) { text = ""; }
  }
  if (o.force || !prev || text !== (prev && prev.text)) await d.prepare("INSERT INTO brain_briefings (day, data, text, created_at) VALUES (?1,?2,?3,?4) ON CONFLICT(day) DO UPDATE SET data=?2, text=?3, created_at=?4").bind(dayKey, JSON.stringify(data), text, textAt || nowIso()).run();
  if (o.force) await audit(env, { owner: ctx.owner.email, kind: "briefing", tool: "briefing", status: "ok", detail: (health && health.overall) + " · " + alerts.length + " alerts" });
  return Object.assign(data, { text, at: textAt || nowIso() });
}

/* called by the daily scheduler (monitor tick), runs once a day as the first owner account, with a short-lived internal session */
export async function brainDaily(env, request) {
  try {
    if (String(env.BRAIN_ENABLED || "1") === "0" || !env.XRAY_DB) return { skipped: "brain off" };
    const d = await brainDb(env), dayKey = istDay(), done = await d.prepare("SELECT v FROM brain_settings WHERE k='lastDaily'").first(); if (done && done.v === dayKey) return { skipped: "already done today" };
    if ((await getSettings(env)).briefing === "off") return { skipped: "briefing off" };
    const owner = await env.XRAY_DB.prepare("SELECT * FROM acct_users WHERE lower(email) IN (" + OWNER_EMAILS.map((_, i) => "?" + (i + 1)).join(",") + ") ORDER BY created_at LIMIT 1").bind(...OWNER_EMAILS).first();
    if (!owner) return { skipped: "no owner account yet" };
    await d.prepare("INSERT INTO brain_settings (k, v, updated_at) VALUES ('lastDaily', ?1, ?2) ON CONFLICT(k) DO UPDATE SET v=?1, updated_at=?2").bind(dayKey, nowIso()).run();   // the day marker first: a failure never repeats every tick
    const tok = randId(40), th = await sha256(tok);
    await env.XRAY_DB.prepare("INSERT INTO acct_sessions (token_hash, user_id, created_at, expires_at, ip_hash) VALUES (?1,?2,?3,?4,'brain-cron')").bind(th, owner.id, nowIso(), Date.now() + 5 * 60e3).run();
    try {
      const req = new Request(new URL(request.url).origin + "/api/owner-brain/briefing", { headers: { cookie: "fodo_s=" + tok } });
      const b = await briefing({ env, request: req, owner }, { force: true });
      return { ok: true, alerts: (b.alerts || []).length, health: b.health && b.health.overall };
    } finally { await env.XRAY_DB.prepare("DELETE FROM acct_sessions WHERE token_hash=?1").bind(th).run(); }
  } catch (e) { return { ok: false, error: clip(e.message, 200) }; }
}
