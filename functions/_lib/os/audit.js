/* FODO OS V4 Phase 1 (v50.1): structured audit log (who, what, when, target, before, after, reason, source) + the event bus with automations.
   audit() never throws (a failed audit write must not break the action). emit() records the event and runs the registered
   automations for that kind inline, each in its own try/catch; slow work goes to the job queue. */
import { nowIso } from "../accounts.js";
import { osdb, one, all, run, J, clip, ORG } from "./db.js";

const scrub = (o) => { if (!o || typeof o !== "object") return o; const out = {}; Object.keys(o).forEach((k) => { if (/secret|token|password|key|bank|account_no|ifsc|vpa/i.test(k)) return; const v = o[k]; out[k] = typeof v === "string" ? v.slice(0, 300) : v; }); return out; };
export async function audit(env, P, action, target, before, after, reason, meta) {
  try { const d = await osdb(env); await run(d, "INSERT INTO os_audit (org_id, actor_user_id, actor_email, action, target_kind, target_id, before, after, reason, source, session_hash, ip_hash, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
    ORG, P && P.user ? P.user.id : null, P && P.user ? P.user.email : "system", clip(action, 60), target ? clip(target.kind, 30) : null, target ? clip(target.id, 60) : null, before == null ? null : JSON.stringify(scrub(before)).slice(0, 2000), after == null ? null : JSON.stringify(scrub(after)).slice(0, 2000), clip(reason, 300) || null, (meta && meta.source) || (P && P.impersonator ? "read-as" : "api"), (meta && meta.session) || null, (meta && meta.ip) || null, nowIso()); } catch (e) {}
}
/* the merged viewer: OS audit + marketplace audit + Brain audit, newest first, keyset pagination on created_at */
export async function auditList(env, q) {
  const d = await osdb(env), lim = Math.min(200, Math.max(1, +(q.limit || 60))), before = /^\d{4}-/.test(q.before || "") ? q.before : "9999", like = (s) => "%" + clip(s, 60) + "%";
  const os = await all(d, "SELECT id, actor_email AS actor, action, target_kind, target_id, before, after, reason, source, created_at, 'os' AS src FROM os_audit WHERE created_at<?1" + (q.actor ? " AND actor_email LIKE ?2" : " AND ?2=?2") + (q.action ? " AND action LIKE ?3" : " AND ?3=?3") + (q.target ? " AND (target_id=?4 OR target_kind=?4)" : " AND ?4=?4") + " ORDER BY created_at DESC LIMIT " + lim, before, q.actor ? like(q.actor) : 1, q.action ? like(q.action) : 1, q.target ? clip(q.target, 60) : 1);
  const biz = q.src === "os" ? [] : await all(d, "SELECT id, actor, action, '' AS target_kind, target AS target_id, NULL AS before, detail AS after, NULL AS reason, 'marketplace' AS source, created_at, 'biz' AS src FROM biz_audit WHERE created_at<?1" + (q.actor ? " AND actor LIKE ?2" : " AND ?2=?2") + (q.action ? " AND action LIKE ?3" : " AND ?3=?3") + (q.target ? " AND target=?4" : " AND ?4=?4") + " ORDER BY created_at DESC LIMIT " + lim, before, q.actor ? like(q.actor) : 1, q.action ? like(q.action) : 1, q.target ? clip(q.target, 60) : 1).catch(() => []);
  const brain = q.src === "os" ? [] : await all(d, "SELECT id, owner AS actor, kind || ':' || COALESCE(tool,'') AS action, 'brain' AS target_kind, COALESCE(tool,'') AS target_id, NULL AS before, detail AS after, NULL AS reason, 'brain' AS source, t AS created_at, 'brain' AS src FROM brain_audit WHERE t<?1" + (q.actor ? " AND owner LIKE ?2" : " AND ?2=?2") + " ORDER BY created_at DESC LIMIT " + lim, before, q.actor ? like(q.actor) : 1).catch(() => []);
  const items = os.concat(biz, brain).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, lim).map((r) => Object.assign(r, { before: J(r.before, r.before), after: r.src === "os" ? J(r.after, r.after) : r.after }));
  return { items, next: items.length === lim ? items[items.length - 1].created_at : null };
}
export const timeline = (env, kind, id, n) => osdb(env).then((d) => all(d, "SELECT actor_email AS actor, action, before, after, reason, created_at FROM os_audit WHERE target_kind=?1 AND target_id=?2 ORDER BY created_at DESC LIMIT " + Math.min(200, n || 50), kind, id).then((L) => L.map((r) => Object.assign(r, { before: J(r.before, null), after: J(r.after, null) }))));

/* ---------- events + automations ---------- */
export const AUTOMATIONS = {};   /* kind -> [async (env, ev) => {}] registered by the modules that react */
export const on = (kind, fn) => { (AUTOMATIONS[kind] = AUTOMATIONS[kind] || []).push(fn); };
export async function emit(env, P, kind, subject, payload) {
  const d = await osdb(env), ev = { org_id: ORG, kind: clip(kind, 60), subject_kind: subject ? clip(subject.kind, 30) : null, subject_id: subject ? clip(subject.id, 60) : null, actor_user_id: P && P.user ? P.user.id : null, actor_name: P && P.user ? clip(P.user.name || P.user.email, 80) : "system", payload: payload || {}, created_at: nowIso() };
  try { await run(d, "INSERT INTO os_events (org_id, kind, subject_kind, subject_id, actor_user_id, actor_name, payload, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)", ev.org_id, ev.kind, ev.subject_kind, ev.subject_id, ev.actor_user_id, ev.actor_name, JSON.stringify(scrub(ev.payload)).slice(0, 4000), ev.created_at); } catch (e) {}
  const ran = []; for (const fn of (AUTOMATIONS[kind] || []).concat(AUTOMATIONS["*"] || [])) { try { const r = await fn(env, ev, P); if (r) ran.push(r); } catch (e) { ran.push({ error: String(e && e.message || e).slice(0, 120) }); } }
  try { const WF = await import("./workflows.js"); const r = await WF.dispatch(env, ev); if (r) ran.push({ workflows: r }); } catch (e) { ran.push({ error: "workflows: " + String(e && e.message || e).slice(0, 100) }); }   /* v50.6 */
  return { event: kind, automations: ran };
}
export async function events(env, q) {
  const d = await osdb(env), lim = Math.min(200, Math.max(1, +(q.limit || 60))), before = /^\d{4}-/.test(q.before || "") ? q.before : "9999";
  const rows = await all(d, "SELECT id, kind, subject_kind, subject_id, actor_user_id, actor_name, payload, created_at FROM os_events WHERE created_at<?1" + (q.kind ? " AND kind LIKE ?2" : " AND ?2=?2") + (q.actor ? " AND (actor_user_id=?3 OR actor_name LIKE ?3)" : " AND ?3=?3") + (q.subject ? " AND subject_id=?4" : " AND ?4=?4") + " ORDER BY created_at DESC LIMIT " + lim, before, q.kind ? clip(q.kind, 40) + "%" : 1, q.actor ? clip(q.actor, 80) : 1, q.subject ? clip(q.subject, 60) : 1);
  return { items: rows.map((r) => Object.assign(r, { payload: J(r.payload, {}) })), next: rows.length === lim ? rows[rows.length - 1].created_at : null };
}
