/* FODO OS V4 Phase 2 (v50.2): Client Success and Support on top of the existing help desk (help_tickets / help_messages).
   Adds SLA deadlines by priority, escalation of overdue tickets, satisfaction (CSAT) on solved tickets, internal notes,
   a Workspace view of the client's own tickets, and the support queue for staff. The help desk's own API, mail-in and
   admin pages are untouched. Nothing is "sent" unless the mail provider confirms (mailTicket already behaves that way). */
import { nowIso } from "../accounts.js";
import { notify } from "../biz.js";
import * as HP from "../help.js";
import { osdb, one, all, run, clip, err, int, rid, ORG } from "./db.js";
import { authorize, allows, has, isEmployee } from "./authz.js";
import { audit, emit } from "./audit.js";

export const SLA_HOURS = { urgent: 4, high: 8, normal: 24, low: 72 }, FLOW = ["open", "pending", "solved", "closed"];
const slaOf = (prio, from) => new Date(new Date(from || nowIso()).getTime() + (SLA_HOURS[prio] || 24) * 3600e3).toISOString();
async function hdb(env) { await HP.hdb(env); return osdb(env); }
/* a client (or anyone signed in) creates a ticket from the Workspace */
export async function create(env, P, b, origin) {
  const d = await hdb(env), subject = clip(b.subject, 160), text = clip(b.text, 4000); if (!subject || !text) throw err("Subject and message are required."); const prio = SLA_HOURS[b.priority] ? b.priority : "normal";
  const t = await HP.createTicket(env, { userId: P.user.id, email: P.user.email, name: P.user.name || "", subject, category: clip(b.category, 60) || "Other", priority: prio, channel: "workspace", text });
  await run(d, "UPDATE help_tickets SET sla_due=?2 WHERE id=?1", t.id, slaOf(prio, t.created_at)); await emit(env, P, "ticket.created", { kind: "ticket", id: t.id }, { subject, priority: prio }); return { id: t.id, sla_due: slaOf(prio, t.created_at) };
}
export async function mine(env, P) { const d = await hdb(env); return { items: await all(d, "SELECT id, subject, status, priority, category, channel, created_at, updated_at, sla_due, csat FROM help_tickets WHERE user_id=?1 OR email=?2 ORDER BY updated_at DESC LIMIT 100", P.user.id, P.user.email) }; }
export async function thread(env, P, id) { const d = await hdb(env), t = await one(d, "SELECT * FROM help_tickets WHERE id=?1", id); if (!t) throw err("Not found.", 404); const own = t.user_id === P.user.id || (t.email && t.email === P.user.email), staff = isEmployee(P) && has(P, "client", "view", "assigned"); if (!own && !staff) throw err("Not your ticket.", 403);
  const msgs = await all(d, "SELECT id, dir, source, author, text, created_at FROM help_messages WHERE ticket_id=?1" + (staff ? "" : " AND dir<>'note'") + " ORDER BY id", id); return { ticket: t, messages: msgs, staff }; }
export async function reply(env, P, id, b, origin) {
  const d = await hdb(env), t = await one(d, "SELECT * FROM help_tickets WHERE id=?1", id); if (!t) throw err("Not found.", 404); const own = t.user_id === P.user.id || (t.email && t.email === P.user.email), staff = isEmployee(P) && has(P, "client", "view", "assigned"); if (!own && !staff) throw err("Not your ticket.", 403);
  const text = clip(b.text, 4000); if (!text) throw err("Write a message."); const note = staff && b.note === true;
  await HP.addMessage(env, t, { dir: note ? "note" : (own && !staff ? "in" : "out"), source: "workspace", author: P.user.email, text }); const now = nowIso();
  if (note) return { ok: true, note: true };
  if (staff) { await run(d, "UPDATE help_tickets SET assignee_user_id=COALESCE(assignee_user_id,?2) WHERE id=?1", id, P.user.id); if (t.user_id) notify(env, t.user_id, "message", "Reply on your ticket: " + t.subject, "/workspace/#support?id=" + id).catch(() => {}); let mailed = false; try { mailed = !!(await HP.mailTicket(env, origin, t, text, {})); } catch (e) {} return { ok: true, mailed }; }
  if (["solved", "closed"].indexOf(t.status) > -1) await run(d, "UPDATE help_tickets SET sla_due=?2 WHERE id=?1", id, slaOf(t.priority, now)); await emit(env, P, "ticket.client_replied", { kind: "ticket", id }, {}); return { ok: true };
}
export async function setStatus(env, P, id, b) {
  await authorize(env, P, { resource: "client", action: "view" }); if (!isEmployee(P)) throw err("Staff only.", 403); const d = await hdb(env), t = await one(d, "SELECT * FROM help_tickets WHERE id=?1", id); if (!t) throw err("Not found.", 404); const o = {}; if (b.status && FLOW.indexOf(b.status) > -1) o.status = b.status; if (b.priority && SLA_HOURS[b.priority]) { o.priority = b.priority; o.sla_due = slaOf(b.priority, t.created_at); } if (b.assignee_user_id !== undefined) o.assignee_user_id = clip(b.assignee_user_id, 40) || null; if (b.category) o.category = clip(b.category, 60);
  const ks = Object.keys(o); if (!ks.length) throw err("Nothing to change."); await run(d, "UPDATE help_tickets SET " + ks.map((k, i) => k + "=?" + (i + 2)).join(", ") + ", updated_at=?" + (ks.length + 2) + " WHERE id=?1", id, ...ks.map((k) => o[k]), nowIso());
  await audit(env, P, "TICKET_UPDATED", { kind: "ticket", id }, ks.reduce((a, k) => { a[k] = t[k]; return a; }, {}), o, b.reason); if (o.status === "solved" && t.user_id) notify(env, t.user_id, "message", "Solved: " + t.subject + ". How did we do? Rate it in Support.", "/workspace/#support?id=" + id).catch(() => {}); if (o.assignee_user_id && o.assignee_user_id !== P.user.id) notify(env, o.assignee_user_id, "task", "Ticket assigned to you: " + t.subject, "/workspace/#support?id=" + id).catch(() => {}); return { ok: true };
}
export async function rate(env, P, id, b) { const d = await hdb(env), t = await one(d, "SELECT * FROM help_tickets WHERE id=?1", id); if (!t) throw err("Not found.", 404); if (t.user_id !== P.user.id && t.email !== P.user.email) throw err("Not your ticket.", 403); if (["solved", "closed"].indexOf(t.status) < 0) throw err("Rate a ticket once it is solved."); const n = int(b.csat, 1, 5); if (n == null) throw err("Rating must be 1 to 5."); await run(d, "UPDATE help_tickets SET csat=?2, csat_note=?3 WHERE id=?1", id, n, clip(b.note, 500)); await emit(env, P, "ticket.rated", { kind: "ticket", id }, { csat: n }); return { ok: true }; }
/* staff queue: open tickets, SLA state, unassigned, CSAT trend */
export async function queue(env, P, q) {
  await authorize(env, P, { resource: "client", action: "view" }); const d = await hdb(env), now = nowIso(), W = ["1=1"], args = []; if (q.status) { args.push(clip(q.status, 10)); W.push("t.status=?" + args.length); } else W.push("t.status IN ('open','pending')"); if (q.mine === "1") { args.push(P.user.id); W.push("t.assignee_user_id=?" + args.length); }
  const rows = await all(d, "SELECT t.id, t.subject, t.status, t.priority, t.category, t.channel, t.email, t.name, t.assignee_user_id, (SELECT name FROM os_members m WHERE m.user_id=t.assignee_user_id) AS assignee, t.created_at, t.updated_at, t.first_reply_at, t.sla_due, t.escalated_at, t.last_from, t.msgs FROM help_tickets t WHERE " + W.join(" AND ") + " ORDER BY CASE WHEN t.sla_due<?" + (args.length + 1) + " THEN 0 ELSE 1 END, t.sla_due LIMIT 200", ...args, now);
  const csat = await one(d, "SELECT round(avg(csat),2) avg, count(csat) n FROM help_tickets WHERE csat IS NOT NULL AND updated_at>?1", new Date(Date.now() - 30 * 864e5).toISOString());
  return { items: rows.map((t) => Object.assign(t, { breached: !!(t.sla_due && t.sla_due < now && !t.first_reply_at), due_in_h: t.sla_due ? Math.round((new Date(t.sla_due) - new Date(now)) / 36e5) : null })), csat30: csat && csat.n ? { avg: csat.avg, n: csat.n } : null, sla: SLA_HOURS };
}
/* hourly job: breached SLA → escalate once to the Customer Success manager, then the owner; backfill sla_due for old tickets */
export async function slaCheck(env) {
  const d = await hdb(env), now = nowIso(); await run(d, "UPDATE help_tickets SET sla_due=datetime(created_at, '+24 hours') WHERE sla_due IS NULL AND status IN ('open','pending')").catch(() => {});
  const rows = await all(d, "SELECT * FROM help_tickets WHERE status IN ('open','pending') AND first_reply_at IS NULL AND sla_due<?1 AND escalated_at IS NULL LIMIT 50", now); let n = 0;
  for (const t of rows) { const dp = await one(d, "SELECT manager_user_id FROM os_departments WHERE org_id=?1 AND slug IN ('customer_success','operations') AND manager_user_id IS NOT NULL ORDER BY slug LIMIT 1", ORG); const to = (dp && dp.manager_user_id) || (await one(d, "SELECT user_id FROM os_members WHERE org_id=?1 AND status='active' AND user_id IS NOT NULL AND id IN (SELECT member_id FROM os_member_roles WHERE role_id=(SELECT id FROM os_roles WHERE org_id=?1 AND slug='owner')) LIMIT 1", ORG) || {}).user_id;
    await run(d, "UPDATE help_tickets SET escalated_at=?2, priority=CASE WHEN priority='low' THEN 'normal' ELSE priority END WHERE id=?1", t.id, now); if (to) notify(env, to, "approval", "Support SLA missed: " + t.subject + " (no first reply by " + t.sla_due.slice(0, 16).replace("T", " ") + ")", "/workspace/#support?id=" + t.id, { dedupe: "sla:" + t.id }).catch(() => {}); await audit(env, null, "TICKET_ESCALATED", { kind: "ticket", id: t.id }, null, { to, sla_due: t.sla_due }, "SLA breached", { source: "job" }); n++; }
  return { escalated: n };
}
