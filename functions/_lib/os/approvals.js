/* FODO OS v49: the central approval engine. One object for creative, client, budget, payment, payout, campaign, site_publish,
   contract, refund, production, task and expense approvals: requester, approver, object, deadline, decision.
   Overdue approvals escalate along the configured hierarchy (approver → their manager → department manager → Operations
   manager → owner), one notification per step, never a broadcast. The existing marketplace decisions (quote accept, contract
   sign, milestone approve, application decide, Brain confirm) stay where they are; this engine does not move them. */
import { nowIso, OWNER_EMAILS } from "../accounts.js";
import { notify } from "../biz.js";
import { osdb, one, all, run, clip, err, DAY, rid, ORG } from "./db.js";
import { authorize, allows, has, isEmployee } from "./authz.js";
import { audit, emit } from "./audit.js";

export const KINDS = ["creative", "client", "budget", "payment", "payout", "campaign", "site_publish", "contract", "refund", "production", "task", "expense", "content", "purchase", "document"], STATES = ["pending", "approved", "rejected", "expired", "cancelled"];
const SEL = "a.*, (SELECT name FROM os_members m WHERE m.user_id=a.requester_user_id AND m.org_id='" + ORG + "') AS requester, (SELECT name FROM os_members m WHERE m.user_id=a.approver_user_id AND m.org_id='" + ORG + "') AS approver";

export async function request(env, P, b, opt) {
  opt = opt || {}; const d = await osdb(env), kind = clip(b.kind, 20); if (KINDS.indexOf(kind) < 0) throw err("Unknown approval kind."); if (!opt.system) await authorize(env, P, { resource: "approval", action: "request" });
  const title = clip(b.title, 160); if (!title) throw err("Give the approval a title."); const approver = clip(b.approver_user_id, 40) || (P.manager) || null; if (!approver) throw err("Pick an approver (or set the requester's manager).");
  if (approver === P.user.id && !opt.system) throw err("You cannot approve your own request."); const ap = await one(d, "SELECT user_id FROM os_members WHERE user_id=?1 AND org_id=?2 AND status='active'", approver, ORG); if (!ap) throw err("The approver must be an active FODO member.");
  const deadline = b.deadline ? (DAY.test(b.deadline) ? b.deadline : null) : new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10); if (b.deadline && !deadline) throw err("Deadline must be YYYY-MM-DD.");
  const id = rid("ap"), now = nowIso(); await run(d, "INSERT INTO os_approvals (id, org_id, kind, object_kind, object_id, title, detail, requester_user_id, approver_user_id, status, deadline, escalation, department_id, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'pending',?10,0,?11,?12,?12)", id, ORG, kind, clip(b.object_kind, 30) || null, clip(b.object_id, 60) || null, title, clip(b.detail, 2000), P.user.id, approver, deadline, clip(b.department_id, 40) || P.dept || null, now);
  await audit(env, P, "APPROVAL_REQUESTED", { kind: "approval", id }, null, { kind, title, approver }, null, opt.system ? { source: "system" } : null); await emit(env, P, "approval.created", { kind: "approval", id }, { kind, title, approver_user_id: approver, object_kind: b.object_kind, object_id: b.object_id });
  notify(env, approver, "approval", "Approval needed: " + title + " (by " + deadline + ")", "/workspace/#approvals?id=" + id).catch(() => {}); return { id, deadline };
}
export async function get(env, P, id) { const d = await osdb(env), a = await one(d, "SELECT " + SEL + " FROM os_approvals a WHERE a.id=?1", id); if (!a) throw err("Not found.", 404); await authorize(env, P, { resource: "approval", action: "request", target: { kind: "approval", row: a } }); return { approval: a, canDecide: a.status === "pending" && (a.approver_user_id === P.user.id || has(P, "approval", "decide", "department") && a.department_id === P.dept || has(P, "approval", "decide", "organization")) }; }
export async function decide(env, P, id, b) {
  const d = await osdb(env), a = await one(d, "SELECT * FROM os_approvals WHERE id=?1", id); if (!a) throw err("Not found.", 404); if (a.status !== "pending") throw err("This approval is already " + a.status + ".", 409);
  const decision = b.decision === "approve" ? "approved" : b.decision === "reject" ? "rejected" : null; if (!decision) throw err("Decision must be approve or reject.");
  if (a.approver_user_id !== P.user.id) { await authorize(env, P, { resource: "approval", action: "decide", target: { kind: "approval", row: a } }); if (!P.isOwner && !(has(P, "approval", "decide", "department") && a.department_id === P.dept) && !has(P, "approval", "decide", "organization")) throw err("Only the approver (or their manager) decides this.", 403); }
  if (a.requester_user_id === P.user.id && !P.isOwner) throw err("You cannot approve your own request.", 403);
  if (["payment", "payout", "refund"].indexOf(a.kind) > -1 && !has(P, "finance", "manage", "organization") && !P.isOwner) throw err("Money approvals need finance management rights.", 403);
  const note = clip(b.note, 1000); if (decision === "rejected" && !note) throw err("Say why you are rejecting."); const now = nowIso();
  if (a.object_kind === "purchase" && a.object_id) await (await import("./procure.js")).checkDecide(env, P, a, decision);   /* v50.7 */
  const r = await run(d, "UPDATE os_approvals SET status=?2, decision_note=?3, decided_by=?4, decided_at=?5, updated_at=?5 WHERE id=?1 AND status='pending'", id, decision, note, P.user.id, now); if (!r.meta.changes) throw err("Already decided.", 409);
  await audit(env, P, decision === "approved" ? "APPROVAL_APPROVED" : "APPROVAL_REJECTED", { kind: "approval", id }, { status: "pending" }, { status: decision, object: a.object_kind + ":" + a.object_id }, note); await emit(env, P, "approval." + decision, { kind: "approval", id }, { kind: a.kind, object_kind: a.object_kind, object_id: a.object_id, requester_user_id: a.requester_user_id, note });
  /* side effects on the object */
  if (a.object_kind === "task" && a.object_id) await run(d, "UPDATE biz_tasks SET status=?2, updated_at=?3, completed_at=CASE WHEN ?2='approved' THEN ?3 ELSE NULL END WHERE id=?1 AND status='review'", a.object_id, decision === "approved" ? "approved" : "doing", now);
  if (a.object_kind === "expense" && a.object_id) await run(d, "UPDATE os_expenses SET status=?2, decided_by=?3, decided_at=?4 WHERE id=?1 AND status='submitted'", a.object_id, decision === "approved" ? "approved" : "rejected", P.user.id, now);
  if (a.object_kind === "deliverable" && a.object_id) await run(d, "UPDATE os_deliverables SET status=?2, updated_at=?3 WHERE id=?1 AND status='review'", a.object_id, decision === "approved" ? "approved" : "submitted", now);
  if (a.object_kind === "campaign" && a.object_id) await run(d, "UPDATE os_campaign_flow SET state=?2, updated_at=?3 WHERE campaign_id=?1", a.object_id, decision === "approved" ? "approved" : "creative_ready", now);
  if (a.object_kind === "purchase" && a.object_id) await (await import("./procure.js")).onDecided(env, P, a, decision, note);   /* v50.7 */
  if (a.object_kind === "document" && a.object_id) await (await import("./docs.js")).onDecided(env, P, a, decision, note);
  if (a.object_kind === "content" && a.object_id) await run(d, "UPDATE biz_content SET status=?2, updated_at=?3 WHERE id=?1 AND status='review'", a.object_id, decision === "approved" ? "approved" : "production", now);
  notify(env, a.requester_user_id, "approval", (decision === "approved" ? "Approved: " : "Rejected: ") + a.title + (note ? " · " + note.slice(0, 80) : ""), "/workspace/#approvals?id=" + id).catch(() => {}); return { ok: true, status: decision };
}
export async function cancel(env, P, id) { const d = await osdb(env), a = await one(d, "SELECT * FROM os_approvals WHERE id=?1", id); if (!a) throw err("Not found.", 404); if (a.requester_user_id !== P.user.id && !P.isOwner) throw err("Only the requester cancels it.", 403); if (a.status !== "pending") throw err("Already " + a.status + ".", 409); await run(d, "UPDATE os_approvals SET status='cancelled', updated_at=?2 WHERE id=?1", id, nowIso()); await audit(env, P, "APPROVAL_CANCELLED", { kind: "approval", id }, { status: "pending" }, { status: "cancelled" }); return { ok: true }; }
export async function list(env, P, q) {
  const d = await osdb(env), uid = P.user.id, lim = Math.min(200, Math.max(1, +(q.limit || 100))), s = allows(P, "approval", "decide"), W = [], args = [uid];
  if (q.box === "requested") W.push("a.requester_user_id=?1"); else if (q.box === "mine" || !s) W.push("(a.approver_user_id=?1 OR a.requester_user_id=?1)");
  else if (s === "team") W.push("(a.approver_user_id=?1 OR a.requester_user_id=?1 OR a.requester_user_id IN (SELECT user_id FROM os_members WHERE manager_user_id=?1))"); else if (s === "department") { W.push("(a.approver_user_id=?1 OR a.requester_user_id=?1 OR a.department_id=?2)"); args.push(P.dept || "-"); } else W.push("?1=?1");
  if (q.status) W.push("a.status='" + (STATES.indexOf(q.status) > -1 ? q.status : "pending") + "'"); if (q.kind && KINDS.indexOf(q.kind) > -1) W.push("a.kind='" + q.kind + "'");
  const rows = await all(d, "SELECT " + SEL + " FROM os_approvals a WHERE " + W.join(" AND ") + " ORDER BY a.status='pending' DESC, COALESCE(a.deadline,'9999'), a.created_at DESC LIMIT " + lim, ...args);
  return { items: rows.map((a) => Object.assign(a, { overdue: a.status === "pending" && a.deadline && a.deadline < nowIso().slice(0, 10), mine: a.approver_user_id === uid })), pending: rows.filter((a) => a.status === "pending" && a.approver_user_id === uid).length };
}
/* escalation (section 42), run by the hourly job: overdue → next person in the chain, at most once a day per step */
export async function escalateDue(env, limit) {
  const d = await osdb(env), today = nowIso().slice(0, 10), rows = await all(d, "SELECT * FROM os_approvals WHERE status='pending' AND deadline<?1 AND (escalated_at IS NULL OR escalated_at<?2) AND escalation<4 ORDER BY deadline LIMIT " + Math.min(100, limit || 25), today, new Date(Date.now() - 20 * 3600e3).toISOString());
  let n = 0; for (const a of rows) { const next = await nextApprover(d, a); if (!next) { await run(d, "UPDATE os_approvals SET escalated_at=?2, escalation=4 WHERE id=?1", a.id, nowIso()); continue; }
    await run(d, "UPDATE os_approvals SET approver_user_id=?2, escalation=escalation+1, escalated_at=?3, updated_at=?3 WHERE id=?1", a.id, next.user_id, nowIso()); await audit(env, null, "APPROVAL_ESCALATED", { kind: "approval", id: a.id }, { approver: a.approver_user_id }, { approver: next.user_id, step: a.escalation + 1 }, "overdue since " + a.deadline, { source: "job" });
    notify(env, next.user_id, "approval", "Escalated to you (overdue): " + a.title, "/workspace/#approvals?id=" + a.id).catch(() => {}); n++; }
  const exp = await run(d, "UPDATE os_approvals SET status='expired', updated_at=?1 WHERE status='pending' AND escalation>=4 AND deadline<?2", nowIso(), new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10));
  return { escalated: n, expired: exp.meta.changes };
}
async function nextApprover(d, a) {
  const cur = await one(d, "SELECT user_id, manager_user_id, department_id FROM os_members WHERE user_id=?1 AND org_id=?2 AND status='active'", a.approver_user_id, ORG), steps = [];
  if (cur && cur.manager_user_id) steps.push(cur.manager_user_id); if (a.department_id) { const dp = await one(d, "SELECT manager_user_id FROM os_departments WHERE id=?1", a.department_id); if (dp && dp.manager_user_id) steps.push(dp.manager_user_id); }
  const ops = await one(d, "SELECT manager_user_id FROM os_departments WHERE org_id=?1 AND slug='operations'", ORG); if (ops && ops.manager_user_id) steps.push(ops.manager_user_id);
  for (const e of OWNER_EMAILS) { const o = await one(d, "SELECT id FROM acct_users WHERE email=?1", e); if (o) steps.push(o.id); }
  const chain = steps.filter((u, i) => u && u !== a.approver_user_id && u !== a.requester_user_id && steps.indexOf(u) === i); const pick = chain[Math.min(a.escalation, chain.length - 1)]; if (!pick) return null; return one(d, "SELECT user_id FROM os_members WHERE user_id=?1 AND org_id=?2 AND status='active'", pick, ORG);
}
