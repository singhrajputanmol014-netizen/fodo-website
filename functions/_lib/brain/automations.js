/* FODO OWNER BRAIN, automations: WHEN (an event on the site, or a schedule) → IF (optional condition) → THEN (a safe action).
   Events arrive in real time from logEvent() (payments, sign-ups hitting the free limit, help tickets, X-Rays, monitoring…);
   schedules run from POST /api/owner-brain/tick (hourly GitHub workflow + the daily 06:47 scheduler).
   Actions are deliberately limited to safe ones: notify the owner (in-app + email), create a task, send the daily briefing by
   email, start an X-Ray in the background. No automation can email customers, change prices or delete anything:
   those always need the owner. Every run is audited; a run never triggers another automation (no loops). */
import { brainDb, nowIso, rid, clip, clean, audit, istDay, getSettings } from "./store.js";
import { createTask } from "./memory.js";
import { OWNER_EMAILS, sendMail } from "../accounts.js";

export const EVENTS = { paid: "A payment succeeded", checkout: "Someone started a checkout", limit_hit: "A user used up their free X-Rays (warm lead)", help_ticket: "A new help ticket", xray_start: "An X-Ray started", xray_done: "An X-Ray finished", xray_refund: "An X-Ray failed (credit refunded)", monitor_check: "A monitored competitor changed", blocked_try: "A blocked user tried to log in", upgrade_click: "Someone clicked upgrade", gsc_connect: "A customer connected Search Console", alert: "The Brain raised an alert" };
export const ACTIONS = { notify: "Notify me (in the Brain + email if on)", email_owner: "Email me", create_task: "Create a task", briefing_email: "Email me the daily briefing", start_xray: "Start a background X-Ray of a website" };
export const DEFAULTS = [
  { name: "Tell me about every payment", trigger_type: "event", trigger_value: "paid", action: "notify", action_args: { text: "New payment received" }, enabled: 1 },
  { name: "New support ticket → task", trigger_type: "event", trigger_value: "help_ticket", action: "create_task", action_args: { title: "Reply to the new support ticket", priority: "P1" }, enabled: 1 },
  { name: "Warm lead → follow-up task", trigger_type: "event", trigger_value: "limit_hit", action: "create_task", action_args: { title: "Follow up with a warm lead (out of free X-Rays)", priority: "P2" }, enabled: 0 },
  { name: "Critical alert → email me", trigger_type: "event", trigger_value: "alert", cond: { contains: "critical" }, action: "email_owner", action_args: { text: "FODO Brain found a critical problem" }, enabled: 1 },
  { name: "Morning briefing by email (08:00)", trigger_type: "schedule", trigger_value: "daily 08:00", action: "briefing_email", action_args: {}, enabled: 0 },
];
export async function seed(env) {
  const d = await brainDb(env), n = await d.prepare("SELECT count(*) n FROM brain_automations").first(); if (n && n.n) return;
  for (const a of DEFAULTS) await save(env, a);
}
/* next run for "daily HH:MM" (IST) or "hourly" or "weekly mon HH:MM" */
export function nextRun(spec, from) {
  const s = String(spec || "").toLowerCase().trim(), now = from || Date.now(), IST = 5.5 * 3600e3;
  if (s === "hourly") return new Date(Math.floor(now / 3600e3) * 3600e3 + 3600e3).toISOString();
  const m = /^(daily|weekly (mon|tue|wed|thu|fri|sat|sun))\s+(\d{1,2}):(\d{2})$/.exec(s); if (!m) return null;
  const ist = new Date(now + IST); let t = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), +m[3], +m[4]) - IST;
  if (m[2]) { const want = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(m[2]); while (new Date(t + IST).getUTCDay() !== want || t <= now) t += 864e5; }
  else while (t <= now) t += 864e5;
  return new Date(t).toISOString();
}
export async function save(env, a) {
  const d = await brainDb(env), id = a.id || "au_" + rid(10);
  const tt = a.trigger_type === "schedule" ? "schedule" : "event", tv = clean(a.trigger_value, 40).toLowerCase();
  if (tt === "event" && !EVENTS[tv]) throw new Error("Unknown event “" + tv + "”. Use one of: " + Object.keys(EVENTS).join(", "));
  if (tt === "schedule" && !nextRun(tv)) throw new Error("Schedule must look like “daily 08:00”, “weekly mon 09:30” or “hourly”.");
  if (!ACTIONS[a.action]) throw new Error("Unknown action. Use one of: " + Object.keys(ACTIONS).join(", "));
  const args = a.action_args && typeof a.action_args === "object" ? a.action_args : {};
  await d.prepare("INSERT INTO brain_automations (id, name, trigger_type, trigger_value, cond, action, action_args, enabled, next_run, runs, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,0,?10) ON CONFLICT(id) DO UPDATE SET name=?2, trigger_type=?3, trigger_value=?4, cond=?5, action=?6, action_args=?7, enabled=?8, next_run=?9")
    .bind(id, clip(clean(a.name || ACTIONS[a.action], 100), 100), tt, tv, a.cond ? JSON.stringify(a.cond) : null, a.action, JSON.stringify(args), a.enabled === 0 || a.enabled === false ? 0 : 1, tt === "schedule" ? nextRun(tv) : null, nowIso()).run();
  return await d.prepare("SELECT * FROM brain_automations WHERE id=?1").bind(id).first();
}
export async function list(env) { await seed(env); const d = await brainDb(env); return ((await d.prepare("SELECT * FROM brain_automations ORDER BY trigger_type, created_at").all()).results || []); }
export async function remove(env, id) { const d = await brainDb(env); await d.prepare("DELETE FROM brain_automations WHERE id=?1").bind(id).run(); }
export async function toggle(env, id, on) { const d = await brainDb(env); await d.prepare("UPDATE brain_automations SET enabled=?2 WHERE id=?1").bind(id, on ? 1 : 0).run(); }

async function ownerEmail(env) { const d = env.XRAY_DB; try { const r = await d.prepare("SELECT email FROM acct_users WHERE lower(email) IN (" + OWNER_EMAILS.map((_, i) => "?" + (i + 1)).join(",") + ") ORDER BY last_login DESC LIMIT 1").bind(...OWNER_EMAILS).first(); return (r && r.email) || OWNER_EMAILS[0]; } catch (e) { return OWNER_EMAILS[0]; } }
export async function notifyOwner(env, title, body, severity) {
  const d = await brainDb(env), id = "al_" + rid(10), now = nowIso();
  await d.prepare("INSERT INTO brain_alerts (id, akey, severity, title, reason, evidence, action, status, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,'automation','','open',?6,?6)").bind(id, "auto|" + id, severity || "info", clip(title, 160), clip(body, 500), now).run();
  const st = await getSettings(env); let mailed = false;
  if (st.notifyEmail !== "off" && (severity === "critical" || severity === "email")) { try { await sendMail(env, await ownerEmail(env), "FODO Brain: " + clip(title, 120), "<p><b>" + clip(title, 200).replace(/</g, "&lt;") + "</b></p><p>" + clip(body, 1500).replace(/</g, "&lt;").replace(/\n/g, "<br>") + '</p><p><a href="https://www.fodo.co.in/owner-brain/#alerts">Open FODO Brain</a></p>', title + "\n\n" + body, { kind: "brain" }); mailed = true; } catch (e) {} }
  return { alert: id, mailed };
}
async function runAction(env, a, ev) {
  const args = JSON.parse(a.action_args || "{}"), what = ev ? (EVENTS[ev.kind] || ev.kind) + (ev.detail ? ": " + ev.detail : "") : "";
  if (a.action === "notify") return notifyOwner(env, clip(args.text || a.name, 140), what || a.name, args.email ? "email" : "info");
  if (a.action === "email_owner") return notifyOwner(env, clip(args.text || a.name, 140), what || a.name, "email");
  if (a.action === "create_task") return createTask(env, { title: clip((args.title || a.name) + (ev && ev.detail ? ": " + ev.detail : ""), 190), priority: args.priority || "P2", project: args.project || "", source: "automation: " + a.name });
  if (a.action === "briefing_email") {
    const b = await env.XRAY_DB.prepare("SELECT text, data FROM brain_briefings WHERE day=?1").bind(istDay()).first();
    const text = b && b.text ? b.text : "Today's briefing hasn't been written yet, open FODO Brain → Overview → Write today's briefing.";
    return notifyOwner(env, "Your FODO briefing: " + istDay(), text, "email");
  }
  if (a.action === "start_xray") return { skipped: "background X-Rays from automations run when the runner is set up", website: args.website };
  return { skipped: "unknown action" };
}
/* called from logEvent() for every site event, cheap when no automation listens */
export async function onEvent(env, kind, userId, detail) {
  if (String(env.BRAIN_ENABLED || "1") === "0" || !EVENTS[kind]) return;
  const d = await brainDb(env);
  const L = (await d.prepare("SELECT * FROM brain_automations WHERE enabled=1 AND trigger_type='event' AND trigger_value=?1").bind(kind).all()).results || [];
  if (!L.length) return;
  const ev = { kind, userId, detail: clip(String(detail || ""), 200) };
  for (const a of L) {
    const c = a.cond ? JSON.parse(a.cond) : null; if (c && c.contains && String(ev.detail).toLowerCase().indexOf(String(c.contains).toLowerCase()) < 0) continue;
    let r; try { r = await runAction(env, a, ev); } catch (e) { r = { error: e.message }; }
    await d.prepare("UPDATE brain_automations SET last_run=?2, runs=runs+1, last_result=?3 WHERE id=?1").bind(a.id, nowIso(), clip(JSON.stringify(r), 300)).run();
    await audit(env, { owner: "automation", kind: "automation", tool: a.action, intent: a.name, status: r && r.error ? "error" : "ok", detail: kind + " · " + ev.detail });
  }
}
/* scheduled automations: POST /api/owner-brain/tick (cron) */
export async function tick(env) {
  await seed(env);
  const d = await brainDb(env), now = nowIso(), due = (await d.prepare("SELECT * FROM brain_automations WHERE enabled=1 AND trigger_type='schedule' AND next_run <= ?1").bind(now).all()).results || [], out = [];
  for (const a of due) {
    await d.prepare("UPDATE brain_automations SET next_run=?2 WHERE id=?1").bind(a.id, nextRun(a.trigger_value)).run();   // reschedule first: a failure never loops
    let r; try { r = await runAction(env, a, null); } catch (e) { r = { error: e.message }; }
    await d.prepare("UPDATE brain_automations SET last_run=?2, runs=runs+1, last_result=?3 WHERE id=?1").bind(a.id, now, clip(JSON.stringify(r), 300)).run();
    await audit(env, { owner: "automation", kind: "automation", tool: a.action, intent: a.name, status: r && r.error ? "error" : "ok" });
    out.push({ id: a.id, name: a.name, ok: !(r && r.error) });
  }
  // overdue commitments / tasks → one reminder alert per day
  const od = (await d.prepare("SELECT title, assignee, due FROM brain_tasks WHERE status IN ('todo','doing') AND due IS NOT NULL AND due < ?1 ORDER BY due LIMIT 10").bind(istDay()).all()).results || [];
  if (od.length) { const key = "overdue|" + istDay(); const ex = await d.prepare("SELECT id FROM brain_alerts WHERE akey=?1").bind(key).first();
    if (!ex) await d.prepare("INSERT INTO brain_alerts (id, akey, severity, title, reason, evidence, action, status, created_at, updated_at) VALUES (?1,?2,'important',?3,?4,'tasks','Open Tasks and update or reschedule them.','open',?5,?5)").bind("al_" + rid(10), key, od.length + " task(s) / commitment(s) overdue", od.map((t) => t.title + (t.assignee ? " (" + t.assignee + ")" : "") + ", due " + t.due).join("; "), now).run(); }
  return { ran: out, overdue: od.length };
}
