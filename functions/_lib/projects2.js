/* FODO v44 Projects 2.0: team projects (several professionals), tasks, change requests, hourly time tracking, monthly
   retainers, refunds (through the payment provider when it answers, otherwise a recorded manual refund by FODO finance).
   Called from biz.projectAction after projectFor() decided who the user is on this project (client / pro / invited / staff).
   Money rules: amounts always come from the database (rate × logged time, the retainer fee, the accepted change request);
   a refund never exceeds what was paid for that milestone; nothing is shown as "refunded" until the provider or FODO
   finance confirms it. */
import { nowIso, randId, db as adb, cfOn, rzp, cf } from "./accounts.js";
import { err, can, settings, payoutsOn, monthName } from "./biz.js";

export const ACTS = ["task_add", "task_set", "task_del", "change_add", "change_answer", "change_withdraw", "time_add", "time_del", "time_bill", "retainer_next", "complete",
  "add_pro", "member_answer", "remove_pro", "accept_member", "decline_member", "refund_request", "refund_answer", "refund_process", "refund_manual"];
const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const int = (v, lo, hi) => { const n = Math.round(+v); return isFinite(n) && n >= lo && n <= hi ? n : null; };
const all = async (d, sql, ...a) => (await d.prepare(sql).bind(...a).all()).results || [];
const one = (d, sql, ...a) => d.prepare(sql).bind(...a).first();
const run = (d, sql, ...a) => d.prepare(sql).bind(...a).run();
const DAY = /^\d{4}-\d{2}-\d{2}$/, ACTIVE = ["accepted", "in_progress", "delivered"];
export const TASK_STATES = ["todo", "doing", "done"];

/* ---------- read models for getProject ---------- */
export async function team(d, pj) {
  const lead = await one(d, "SELECT id, name, role FROM biz_pros WHERE id=?1", pj.pro_id);
  return (lead ? [{ id: lead.id, name: lead.name, role: lead.role, status: "lead" }] : []).concat(await all(d, "SELECT p.id, p.name, COALESCE(x.role, p.role) AS role, x.status FROM biz_project_pros x JOIN biz_pros p ON p.id=x.pro_id WHERE x.project_id=?1 AND x.status IN ('invited','accepted','declined') ORDER BY x.created_at", pj.id));
}
export const tasks = (d, id) => all(d, "SELECT id, title, who, due, status, created_by_side, updated_at FROM (SELECT t.*, CASE WHEN t.created_by=j.client_id THEN 'client' ELSE 'pro' END AS created_by_side FROM biz_tasks t JOIN biz_projects j ON j.id=t.project_id WHERE t.project_id=?1) ORDER BY CASE status WHEN 'done' THEN 1 ELSE 0 END, COALESCE(due,'9999'), created_at LIMIT 300", id);
export const changes = (d, id) => all(d, "SELECT c.id, c.by_side, c.pro_id, p.name AS pro_name, c.title, c.detail, c.amount, c.days, c.status, c.milestone_id, c.created_at, c.decided_at FROM biz_changes c LEFT JOIN biz_pros p ON p.id=c.pro_id WHERE c.project_id=?1 ORDER BY c.created_at DESC LIMIT 100", id);
export const time = (d, id) => all(d, "SELECT id, day, minutes, note, status, milestone_id, created_at FROM biz_time WHERE project_id=?1 ORDER BY day DESC, created_at DESC LIMIT 500", id);
export const refunds = (d, id) => all(d, "SELECT r.id, r.milestone_id, m.title, r.amount, r.reason, r.status, r.provider, r.note, r.created_at, r.done_at FROM biz_refunds r JOIN biz_milestones m ON m.id=r.milestone_id WHERE r.project_id=?1 ORDER BY r.created_at DESC LIMIT 100", id);

/* ---------- actions ---------- */
export async function action(env, u, act, b, C) {
  const { d, pj, side, mine, lead, link } = C, note = (who, kind, text) => C.notify(env, who, kind, text, link), now = nowIso();
  const proUser = async (proId) => ((await one(d, "SELECT user_id FROM biz_pros WHERE id=?1", proId || pj.pro_id)) || {}).user_id;
  const notStaff = () => { if (side === "staff") throw err("FODO staff can read this project but not change it.", 403); };
  const active = () => { if (ACTIVE.indexOf(pj.status) < 0) throw err("This works while the project is accepted or in progress.", 409); };

  /* ----- tasks: a shared checklist (client and professionals) ----- */
  if (act === "task_add") { notStaff(); const t = clip(b.title, 140); if (t.length < 2) throw err("Write the task.");
    if ((((await one(d, "SELECT count(*) n FROM biz_tasks WHERE project_id=?1", pj.id)) || {}).n || 0) >= 200) throw err("Up to 200 tasks per project.");
    await run(d, "INSERT INTO biz_tasks (id, project_id, title, who, due, status, created_by, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,'todo',?6,?7,?7)", "tk" + randId(12), pj.id, t, b.who === "client" ? "client" : "pro", DAY.test(b.due || "") ? b.due : null, u.id, now); return; }
  if (act === "task_set") { notStaff(); const t = await one(d, "SELECT * FROM biz_tasks WHERE id=?1 AND project_id=?2", clip(b.taskId, 40), pj.id); if (!t) throw err("Task not found.", 404);
    const st = TASK_STATES.indexOf(b.status) > -1 ? b.status : t.status, title = b.title != null && t.created_by === u.id ? clip(b.title, 140) || t.title : t.title, due = b.due !== undefined && t.created_by === u.id ? (DAY.test(b.due || "") ? b.due : null) : t.due;
    await run(d, "UPDATE biz_tasks SET status=?2, title=?3, due=?4, updated_at=?5 WHERE id=?1", t.id, st, title, due, now); return; }
  if (act === "task_del") { notStaff(); const r = await run(d, "DELETE FROM biz_tasks WHERE id=?1 AND project_id=?2 AND created_by=?3", clip(b.taskId, 40), pj.id, u.id); if (!r.meta.changes) throw err("Only the person who added a task can delete it.", 403); return; }

  /* ----- change requests: scope / price / time changes after acceptance, the other side decides ----- */
  if (act === "change_add") { notStaff(); active(); const t = clip(b.title, 140), detail = clip(b.detail, 2000), amount = +b.amount ? int(b.amount, 100, 1e8) : 0, days = int(b.days, 0, 365) || 0;
    if (t.length < 3) throw err("Give the change a short title."); if (amount == null) throw err("An extra amount must be ₹100 or more (or 0).");
    let proId = side === "pro" ? mine.id : pj.pro_id; if (side === "client" && b.proId) { const ok = b.proId === pj.pro_id || (await one(d, "SELECT 1 x FROM biz_project_pros WHERE project_id=?1 AND pro_id=?2 AND status='accepted'", pj.id, b.proId)); if (!ok) throw err("That professional isn't on this project."); proId = b.proId; }
    if ((((await one(d, "SELECT count(*) n FROM biz_changes WHERE project_id=?1 AND status='open'", pj.id)) || {}).n || 0) >= 20) throw err("Too many open change requests.");
    await run(d, "INSERT INTO biz_changes (id, project_id, by_side, by_id, pro_id, title, detail, amount, days, status, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'open',?10)", "cr" + randId(12), pj.id, side, u.id, proId, t, detail, amount, days, now);
    await note(side === "client" ? await proUser(proId) : pj.client_id, "change", "Change request on " + pj.title + ": " + t); return; }
  if (act === "change_answer" || act === "change_withdraw") { notStaff(); const c = await one(d, "SELECT * FROM biz_changes WHERE id=?1 AND project_id=?2", clip(b.changeId, 40), pj.id); if (!c || c.status !== "open") throw err("This change request is no longer open.", 409);
    if (act === "change_withdraw") { if (c.by_id !== u.id) throw err("Only its author can withdraw it.", 403); await run(d, "UPDATE biz_changes SET status='withdrawn', decided_at=?2 WHERE id=?1", c.id, now); return; }
    const mayAnswer = c.by_side === "client" ? side === "pro" && mine.id === c.pro_id : side === "client"; if (!mayAnswer) throw err(c.by_side === "client" ? "The professional it is for answers it." : "The client answers it.", 403);
    if (!b.accept) { await run(d, "UPDATE biz_changes SET status='declined', decided_at=?2 WHERE id=?1", c.id, now); await note(c.by_side === "client" ? pj.client_id : await proUser(c.pro_id), "change", "Change request declined: " + c.title); return; }
    active(); let msId = null;
    if (c.amount > 0) { msId = "ms" + randId(14); const base = ((await one(d, "SELECT MAX(idx) n FROM biz_milestones WHERE project_id=?1", pj.id)) || {}).n || 0;
      await run(d, "INSERT INTO biz_milestones (id, project_id, idx, title, amount, status, pro_id, kind, note) VALUES (?1,?2,?3,?4,?5,'pending',?6,'change',?7)", msId, pj.id, base + 1, "Change: " + c.title, c.amount, c.pro_id === pj.pro_id ? null : c.pro_id, c.days ? "+" + c.days + " days" : null);
      await run(d, "UPDATE biz_projects SET budget=COALESCE(budget,0)+?2 WHERE id=?1", pj.id, c.amount); if (pj.status === "delivered") await C.move("in_progress"); }
    await run(d, "UPDATE biz_changes SET status='accepted', decided_at=?2, milestone_id=?3 WHERE id=?1", c.id, now, msId);
    await note(c.by_side === "client" ? pj.client_id : await proUser(c.pro_id), "change", "Change request accepted: " + c.title + (c.amount ? " (new milestone to pay)" : "")); return; }

  /* ----- hourly: the lead professional logs time, then bills it; the client pays and approves ----- */
  if (act === "time_add") { if (side !== "pro" || !lead) throw err("The lead professional logs time.", 403); if (pj.mode !== "hourly") throw err("This isn't an hourly project.", 409); active();
    const day = DAY.test(b.day || "") ? b.day : null, min = Math.round((+b.hours || 0) * 60); if (!day || day > now.slice(0, 10) || day < String(pj.created_at).slice(0, 10)) throw err("Pick a day between the project start and today.");
    if (!(min >= 15 && min <= 960)) throw err("Log between 0.25 and 16 hours per entry.");
    const used = ((await one(d, "SELECT COALESCE(SUM(minutes),0) n FROM biz_time WHERE project_id=?1", pj.id)) || {}).n || 0; if (pj.cap && used + min > pj.cap * 60) throw err("That goes over the agreed " + pj.cap + " hours. Send a change request first.", 409);
    await run(d, "INSERT INTO biz_time (id, project_id, pro_id, day, minutes, note, status, created_at) VALUES (?1,?2,?3,?4,?5,?6,'open',?7)", "tm" + randId(12), pj.id, mine.id, day, min, clip(b.note, 300), now);
    if (pj.status === "accepted") await C.move("in_progress"); return; }
  if (act === "time_del") { if (side !== "pro") throw err("Not allowed.", 403); const r = await run(d, "DELETE FROM biz_time WHERE id=?1 AND project_id=?2 AND pro_id=?3 AND status='open'", clip(b.timeId, 40), pj.id, mine.id); if (!r.meta.changes) throw err("Only open (not billed) entries can be removed.", 409); return; }
  if (act === "time_bill") { if (side !== "pro" || !lead) throw err("The lead professional bills time.", 403); if (pj.mode !== "hourly" || !pj.rate) throw err("This isn't an hourly project.", 409);
    const L = await all(d, "SELECT * FROM biz_time WHERE project_id=?1 AND status='open' ORDER BY day", pj.id), min = L.reduce((a, x) => a + x.minutes, 0), amount = Math.round(min / 60 * pj.rate);
    if (!L.length) throw err("No open hours to bill.", 409); if (amount < 100) throw err("Bill at least ₹100 at a time.", 409);
    const msId = "ms" + randId(14), base = ((await one(d, "SELECT MAX(idx) n FROM biz_milestones WHERE project_id=?1", pj.id)) || {}).n || 0, h = Math.round(min / 6) / 10, span = L[0].day === L[L.length - 1].day ? L[0].day : L[0].day + " to " + L[L.length - 1].day;
    await run(d, "INSERT INTO biz_milestones (id, project_id, idx, title, amount, status, kind, note) VALUES (?1,?2,?3,?4,?5,'pending','hours',?6)", msId, pj.id, base + 1, "Hours: " + h + " h (" + span + ")", amount, h + " h × ₹" + pj.rate + "/h");
    for (const x of L) await run(d, "UPDATE biz_time SET status='billed', milestone_id=?2 WHERE id=?1 AND status='open'", x.id, msId);
    await note(pj.client_id, "hours", "Hours billed on " + pj.title + ": " + h + " h, ₹" + amount.toLocaleString("en-IN")); return; }

  /* ----- retainer: one milestone per month, created on request (never charged automatically) ----- */
  if (act === "retainer_next") { if (!(side === "client" || (side === "pro" && lead))) throw err("Not allowed.", 403); if (pj.mode !== "retainer" || !pj.rate) throw err("This isn't a retainer.", 409); active();
    const R = await all(d, "SELECT period, status FROM biz_milestones WHERE project_id=?1 AND kind='retainer' ORDER BY period", pj.id), last = R[R.length - 1];
    if (last && ["approved", "refunded"].indexOf(last.status) < 0) throw err("Finish " + monthName(last.period) + " first (approve or refund it).", 409);
    if (pj.cap && R.length >= pj.cap) throw err("The agreed " + pj.cap + " months are done. Send a change request to extend.", 409);
    let per = last ? last.period : nowIso().slice(0, 7); if (last) { const [y, m] = per.split("-").map(Number); per = (m === 12 ? y + 1 : y) + "-" + String(m === 12 ? 1 : m + 1).padStart(2, "0"); }
    const base = ((await one(d, "SELECT MAX(idx) n FROM biz_milestones WHERE project_id=?1", pj.id)) || {}).n || 0;
    await run(d, "INSERT INTO biz_milestones (id, project_id, idx, title, amount, status, kind, period) VALUES (?1,?2,?3,?4,?5,'pending','retainer',?6)", "ms" + randId(14), pj.id, base + 1, "Retainer: " + monthName(per), pj.rate, per);
    if (pj.status === "delivered") await C.move("in_progress");
    await note(side === "client" ? await proUser() : pj.client_id, "retainer", "Retainer " + monthName(per) + " added to " + pj.title); return; }
  if (act === "complete") { if (side !== "client") throw err("The client completes the project.", 403); active();
    if (await one(d, "SELECT 1 x FROM biz_milestones WHERE project_id=?1 AND status IN ('proposed','pending','funded','submitted')", pj.id)) throw err("Some milestones are still open (pay, approve or remove them first).", 409);
    if (await one(d, "SELECT 1 x FROM biz_time WHERE project_id=?1 AND status='open'", pj.id)) throw err("There are unbilled hours. Ask the professional to bill or remove them.", 409);
    if (pj.status === "accepted") await C.move("in_progress"); if (pj.status === "in_progress") await C.move("delivered"); await C.move("completed");
    for (const x of await all(d, "SELECT DISTINCT COALESCE(pro_id, ?2) p FROM biz_milestones WHERE project_id=?1 AND status='approved'", pj.id, pj.pro_id)) await run(d, "UPDATE biz_pros SET done_n=done_n+1 WHERE id=?1", x.p);
    await note(await proUser(), "completed", "Project completed: " + pj.title); return; }

  /* ----- team: the client adds more professionals; each sends and is paid for their own milestones ----- */
  if (act === "add_pro") { if (side !== "client") throw err("The client builds the team.", 403); if (["completed", "cancelled", "disputed"].indexOf(pj.status) > -1) throw err("This project is " + pj.status + ".", 409);
    const p = await one(d, "SELECT * FROM biz_pros WHERE id=?1", clip(b.proId, 40)); if (!p || ["approved", "published"].indexOf(p.status) < 0) throw err("This professional isn't available.", 404);
    if (p.id === pj.pro_id || p.user_id === u.id) throw err("Already on this project.", 409); const ex = await one(d, "SELECT status FROM biz_project_pros WHERE project_id=?1 AND pro_id=?2", pj.id, p.id); if (ex && ["invited", "accepted"].indexOf(ex.status) > -1) throw err("Already invited.", 409);
    if ((((await one(d, "SELECT count(*) n FROM biz_project_pros WHERE project_id=?1 AND status IN ('invited','accepted')", pj.id)) || {}).n || 0) >= 8) throw err("Up to 8 more professionals per project.");
    await run(d, "INSERT OR REPLACE INTO biz_project_pros (project_id, pro_id, role, status, added_by, created_at) VALUES (?1,?2,?3,'invited',?4,?5)", pj.id, p.id, clip(b.role, 60) || p.role, u.id, now);
    await C.notify(env, p.user_id, "team", "You're invited to join a project team: " + pj.title, link); await C.auditLog(env, u.email, "project:add_pro", pj.id, p.id); return; }
  if (act === "member_answer") { if (side !== "invited") throw err("No open invitation.", 409); await run(d, "UPDATE biz_project_pros SET status=?3 WHERE project_id=?1 AND pro_id=?2 AND status='invited'", pj.id, mine.id, b.accept ? "accepted" : "declined");
    await note(pj.client_id, "team", mine.name + (b.accept ? " joined " : " declined ") + pj.title); return; }
  if (act === "remove_pro") { if (side !== "client") throw err("The client manages the team.", 403); const pid = clip(b.proId, 40);
    if (await one(d, "SELECT 1 x FROM biz_milestones WHERE project_id=?1 AND pro_id=?2 AND status IN ('funded','submitted','approved')", pj.id, pid)) throw err("This professional has paid work on the project. Finish or refund it first.", 409);
    const r = await run(d, "UPDATE biz_project_pros SET status='removed' WHERE project_id=?1 AND pro_id=?2 AND status IN ('invited','accepted','declined')", pj.id, pid); if (!r.meta.changes) throw err("Not on this project.", 404);
    await run(d, "DELETE FROM biz_milestones WHERE project_id=?1 AND pro_id=?2 AND status IN ('proposed','pending')", pj.id, pid); await note(await proUser(pid), "team", "You were removed from " + pj.title); return; }
  if (act === "accept_member" || act === "decline_member") { if (side !== "client") throw err("Only the client.", 403); const pid = clip(b.proId, 40);
    if (act === "accept_member") { const r = await run(d, "UPDATE biz_milestones SET status='pending' WHERE project_id=?1 AND pro_id=?2 AND status='proposed'", pj.id, pid); if (!r.meta.changes) throw err("No milestones to accept.", 409); if (pj.status === "delivered") await C.move("in_progress"); }
    else await run(d, "DELETE FROM biz_milestones WHERE project_id=?1 AND pro_id=?2 AND status='proposed'", pj.id, pid);
    await note(await proUser(pid), "proposal", "Your milestones on " + pj.title + " were " + (act === "accept_member" ? "accepted" : "declined")); return; }

  /* ----- refunds ----- */
  if (act === "refund_request") { if (side !== "client" && side !== "pro") throw err("Not allowed.", 403); const m = await msOf(d, pj, b.milestoneId);
    if (["funded", "submitted"].indexOf(m.status) < 0) throw err("Only a paid milestone that isn't approved yet can be refunded.", 409);
    if (side === "pro" && (m.pro_id || pj.pro_id) !== mine.id) throw err("This milestone belongs to another professional.", 403);
    if (await one(d, "SELECT 1 x FROM biz_refunds WHERE milestone_id=?1 AND status IN ('requested','processing','needs_manual')", m.id)) throw err("A refund for this milestone is already in progress.", 409);
    const reason = clip(b.reason, 1000); if (side === "client" && reason.length < 5) throw err("Tell the professional why (5+ characters).");
    const id = "rf" + randId(12); await run(d, "INSERT INTO biz_refunds (id, project_id, milestone_id, amount, reason, status, by_id, created_at) VALUES (?1,?2,?3,?4,?5,'requested',?6,?7)", id, pj.id, m.id, m.amount, reason || "Refund offered by the professional", u.id, now);
    if (side === "pro") { await process(env, d, u, pj, m, id, m.amount, C); return; }   // the professional gives the money back: no need to ask
    await note(await proUser(m.pro_id), "refund", "Refund requested for “" + m.title + "”. Accept or decline."); return; }
  if (act === "refund_answer") { if (side !== "pro") throw err("The professional answers.", 403); const r = await one(d, "SELECT * FROM biz_refunds WHERE id=?1 AND project_id=?2 AND status='requested'", clip(b.refundId, 40), pj.id); if (!r) throw err("No open refund request.", 409);
    const m = await msOf(d, pj, r.milestone_id); if ((m.pro_id || pj.pro_id) !== mine.id) throw err("This milestone belongs to another professional.", 403);
    if (!b.accept) { await run(d, "UPDATE biz_refunds SET status='declined', done_at=?2 WHERE id=?1", r.id, now); await note(pj.client_id, "refund", "Refund declined for “" + m.title + "”. You can open a dispute, FODO will review both sides."); return; }
    await process(env, d, u, pj, m, r.id, r.amount, C); return; }
  if (act === "refund_process" || act === "refund_manual") { if (!can(C.R, ["admin", "finance"])) throw err("Only FODO finance or admins.", 403);
    if (act === "refund_manual") { const ref = clip(b.ref, 80); if (ref.length < 4) throw err("Enter the refund reference from the bank or gateway.");
      const x = await run(d, "UPDATE biz_refunds SET status='refunded', provider_ref=?2, done_at=?3, note=COALESCE(note,'') || ' · manual' WHERE id=?1 AND project_id=?4 AND status IN ('needs_manual','processing')", clip(b.refundId, 40), ref, now, pj.id); if (!x.meta.changes) throw err("Nothing to mark.", 409);
      await C.auditLog(env, u.email, "refund:manual", clip(b.refundId, 40), ref); await note(pj.client_id, "refund", "Your refund was sent (reference " + ref + ")."); return; }
    const m = await msOf(d, pj, b.milestoneId); if (["funded", "submitted"].indexOf(m.status) < 0) throw err("Only a paid milestone that isn't approved yet can be refunded.", 409);
    const amt = b.amount == null || b.amount === "" ? m.amount : int(b.amount, 1, m.amount); if (amt == null) throw err("The refund can be ₹1 up to ₹" + m.amount + ".");
    let r = await one(d, "SELECT id FROM biz_refunds WHERE milestone_id=?1 AND status='requested'", m.id); const id = r ? r.id : "rf" + randId(12);
    if (!r) await run(d, "INSERT INTO biz_refunds (id, project_id, milestone_id, amount, reason, status, by_id, created_at) VALUES (?1,?2,?3,?4,?5,'requested',?6,?7)", id, pj.id, m.id, amt, clip(b.reason, 1000) || "FODO decision", u.id, now);
    await process(env, d, u, pj, m, id, amt, C); return; }
  throw err("Unknown action.");
}
async function msOf(d, pj, id) { const m = await one(d, "SELECT * FROM biz_milestones WHERE id=?1 AND project_id=?2", clip(id, 40), pj.id); if (!m) throw err("Milestone not found.", 404); return m; }

/* take the money out of escrow for this milestone, ask the payment provider to refund it, record what really happened */
async function process(env, d, u, pj, m, refundId, amount, C) {
  const now = nowIso(), up = await run(d, "UPDATE biz_milestones SET status='refunded', refunded=?2 WHERE id=?1 AND status IN ('funded','submitted')", m.id, amount); if (!up.meta.changes) throw err("This milestone changed meanwhile, reload.", 409);
  if (amount < m.amount) { const c = (await settings(env)).commission, rest = m.amount - amount, com = Math.round(rest * c / 100);   // partial refund (FODO decision): the rest goes to the professional
    await run(d, "INSERT OR IGNORE INTO biz_payouts (id, milestone_id, pro_id, gross, commission, net, status, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)", "po" + randId(12), m.id, m.pro_id || pj.pro_id, rest, com, rest - com, payoutsOn(env) ? "queued" : "awaiting_provider", now); }
  let status = "needs_manual", provider = null, ref = null, why = "";
  try { const r = await providerRefund(env, m.order_id, amount, refundId, pj.title + ": " + m.title); if (r) { provider = r.provider; ref = r.ref; status = r.done ? "refunded" : "processing"; } else why = "no gateway order for this payment"; }
  catch (e) { why = String(e.message || e).slice(0, 160); }
  await run(d, "UPDATE biz_refunds SET status=?2, amount=?3, provider=?4, provider_ref=?5, note=?6, done_at=CASE WHEN ?2='refunded' THEN ?7 ELSE NULL END WHERE id=?1", refundId, status, amount, provider, ref, why || null, now);
  await C.auditLog(env, u.email, "refund:" + status, refundId, m.id + " ₹" + amount + (why ? " · " + why : ""));
  await C.notify(env, pj.client_id, "refund", status === "needs_manual" ? "Refund of ₹" + amount.toLocaleString("en-IN") + " approved for “" + m.title + "”. FODO finance will send it and share the reference." : "Refund of ₹" + amount.toLocaleString("en-IN") + " started with the payment gateway for “" + m.title + "”. Banks usually take 5 to 7 working days.", "#project=" + pj.id);
  const pu = await one(d, "SELECT user_id FROM biz_pros WHERE id=?1", m.pro_id || pj.pro_id); if (pu && pu.user_id !== u.id) await C.notify(env, pu.user_id, "refund", "Milestone “" + m.title + "” was refunded to the client (₹" + amount.toLocaleString("en-IN") + ").", "#project=" + pj.id);
}
/* the real refund call. Razorpay: refund the captured payment of the order. Cashfree: refund the order. null = no gateway order */
export async function providerRefund(env, orderId, amount, refundId, noteText) {
  if (!orderId) return null; const d = await adb(env), o = await d.prepare("SELECT * FROM acct_orders WHERE order_id=?1 AND status='PAID'").bind(orderId).first(); if (!o) return null;
  if (/^order_/.test(o.cf_order_id || "")) {
    const P = await rzp(env, "GET", "/orders/" + encodeURIComponent(o.cf_order_id) + "/payments"), pay = (P.items || []).find((x) => x.status === "captured"); if (!pay) throw new Error("Razorpay: no captured payment");
    const r = await rzp(env, "POST", "/payments/" + encodeURIComponent(pay.id) + "/refund", { amount: Math.round(amount * 100), receipt: refundId, notes: { fodo: noteText.slice(0, 200) } });
    return { provider: "razorpay", ref: r.id || null, done: r.status === "processed" };
  }
  if (!cfOn(env)) return null;
  const r = await cf(env, "POST", "/orders/" + encodeURIComponent(orderId) + "/refunds", { refund_amount: amount, refund_id: refundId, refund_note: noteText.slice(0, 100) }, refundId);
  return { provider: "cashfree", ref: r.cf_refund_id ? String(r.cf_refund_id) : refundId, done: r.refund_status === "SUCCESS" };
}
