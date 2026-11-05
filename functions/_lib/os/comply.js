/* FODO OS V4 Phase 7 (v50.7): risk register, incident log, continuity, and DPDP workflows.
   Risks: one register for company risks (os_risks with no project) next to the open project risks; score = severity × likelihood.
   Incidents: anyone reports; owners and operations are told at once; a timeline; personal-data incidents carry a clock and the
   "Data Protection Board / affected people informed" steps, which must be recorded (or a written reason) before closing.
   Continuity: the signed-off procedures from Knowledge, live system checks and who to call.
   DPDP: privacy notice versions (published only after an owner records a legal review), consent records per purpose (people grant
   and withdraw their own), retention rules (suggestions are marked "pending legal review"; nothing is deleted automatically, an
   owner applies a reviewed rule by hand), rights requests and grievances with a due date, assignee and response.
   FODO provides the workflow. Whether FODO complies with the DPDP Act and Rules is a legal question for FODO's lawyer. */
import { nowIso } from "../accounts.js";
import { notify } from "../biz.js";
import { osdb, one, all, run, J, clip, err, int, DAY, rid, ORG } from "./db.js";
import { has, allows } from "./authz.js";
import { audit, emit } from "./audit.js";
import { today, addDays, numberFor, scopeWhere, nameOf, holders, ownerIds, setting, settingSet, EMAIL } from "./kit.js";

const DDL = [
  "CREATE TABLE IF NOT EXISTS os_incidents (id TEXT PRIMARY KEY, org_id TEXT, number TEXT, title TEXT, kind TEXT, severity TEXT, status TEXT, detected_at TEXT, summary TEXT, reported_by TEXT, owner_user_id TEXT, personal_data INTEGER DEFAULT 0, affected_count INTEGER, root_cause TEXT, board_informed_at TEXT, people_informed_at TEXT, not_informed_reason TEXT, contained_at TEXT, resolved_at TEXT, closed_at TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS os_incident_log (id INTEGER PRIMARY KEY AUTOINCREMENT, incident_id TEXT, by_user_id TEXT, kind TEXT, text TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS os_privacy_notices (id TEXT PRIMARY KEY, version INTEGER, title TEXT, body TEXT, status TEXT, legal_reviewer TEXT, legal_reviewed_at TEXT, published_at TEXT, created_by TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS os_consents (id TEXT PRIMARY KEY, user_id TEXT, email TEXT, purpose TEXT, notice_version INTEGER, status TEXT, source TEXT, granted_at TEXT, withdrawn_at TEXT, updated_at TEXT)",
  "CREATE UNIQUE INDEX IF NOT EXISTS os_consents_u ON os_consents(user_id, purpose)",
  "CREATE TABLE IF NOT EXISTS os_retention (id TEXT PRIMARY KEY, category TEXT UNIQUE, label TEXT, keep_days INTEGER, basis TEXT, action TEXT, legal_reviewed INTEGER DEFAULT 0, reviewer TEXT, last_applied_at TEXT, last_applied_rows INTEGER, updated_by TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS os_rights_requests (id TEXT PRIMARY KEY, number TEXT, kind TEXT, user_id TEXT, email TEXT, name TEXT, detail TEXT, status TEXT, verified INTEGER DEFAULT 0, due_on TEXT, assignee_user_id TEXT, response TEXT, created_at TEXT, updated_at TEXT, closed_at TEXT)",
  "CREATE INDEX IF NOT EXISTS os_rr_s ON os_rights_requests(status, due_on)"
];
const made = new WeakSet();
export async function cdb(env) { const d = await osdb(env); if (!made.has(d)) { for (const q of DDL) await d.prepare(q).run(); await seedRetention(d); made.add(d); } return d; }

/* ---------------- risk register ---------------- */
export const RISK_KINDS = ["strategic", "operational", "financial", "legal", "security", "people", "client", "compliance"];
const level = (s) => (s >= 15 ? "high" : s >= 8 ? "medium" : "low");
export async function risks(env, P, q) {
  const s = allows(P, "risk", "view"); if (!s) throw err("You don't have access to the risk register.", 403); const d = await cdb(env), args = [], W = ["r.org_id='" + ORG + "'", "r.status<>'closed'"];
  if (s !== "organization" && s !== "all") W.push("(" + scopeWhere(P, s, "r.owner_user_id", args) + ")"); if (q && q.scope === "company") W.push("r.project_id IS NULL"); if (q && q.status === "closed") W[1] = "r.status='closed'";
  const rows = await all(d, "SELECT r.*, " + nameOf("r.owner_user_id") + " AS owner, (SELECT title FROM biz_projects p WHERE p.id=r.project_id) AS project FROM os_risks r WHERE " + W.join(" AND ") + " ORDER BY (COALESCE(r.severity,3)*COALESCE(r.likelihood,3)) DESC, r.created_at LIMIT 300", ...args), t = today();
  const items = rows.map((r) => { const sc = (r.severity || 3) * (r.likelihood || 3); return Object.assign(r, { score: sc, level: level(sc), review_due: r.review_at && r.review_at <= t }); });
  const heat = []; for (let sv = 5; sv >= 1; sv--) { const row = []; for (let lk = 1; lk <= 5; lk++) row.push(items.filter((r) => (r.severity || 3) === sv && (r.likelihood || 3) === lk).length); heat.push(row); }
  return { items, heat, kinds: RISK_KINDS, canManage: has(P, "risk", "manage", "department") };
}
export async function riskSave(env, P, b) {
  const d = await cdb(env), now = nowIso(), sev = int(b.severity, 1, 5), lik = int(b.likelihood, 1, 5), review = DAY.test(b.review_at || "") ? b.review_at : null;
  if (b.id) { const r = await one(d, "SELECT * FROM os_risks WHERE id=?1 AND org_id=?2", clip(b.id, 40), ORG); if (!r) throw err("Not found.", 404); if (r.project_id) throw err("Project risks are edited on the project page.", 409); if (!(r.owner_user_id === P.user.id || has(P, "risk", "manage", "department"))) throw err("The risk owner or a lead updates it.", 403);
    const st = ["open", "mitigating", "accepted", "closed"].indexOf(b.status) > -1 ? b.status : r.status; if (st === "accepted" && clip(b.note, 300).length < 5) throw err("Accepting a risk needs a reason."); if (st === "closed" && r.status !== "closed" && clip(b.note, 300).length < 5) throw err("Say why the risk is closed.");
    await run(d, "UPDATE os_risks SET title=?2, kind=?3, severity=?4, likelihood=?5, impact=?6, mitigation=?7, owner_user_id=?8, status=?9, review_at=?10, updated_at=?11 WHERE id=?1", r.id, clip(b.title, 160) || r.title, RISK_KINDS.indexOf(b.kind) > -1 ? b.kind : r.kind, sev || r.severity, lik || r.likelihood, b.impact == null ? r.impact : clip(b.impact, 500), b.mitigation == null ? r.mitigation : clip(b.mitigation, 1000), clip(b.owner_user_id, 40) || r.owner_user_id, st, review || r.review_at, now);
    await audit(env, P, "RISK_UPDATED", { kind: "risk", id: r.id }, { status: r.status, score: r.severity * r.likelihood }, { status: st, score: (sev || r.severity) * (lik || r.likelihood) }, clip(b.note, 300)); return { id: r.id }; }
  if (!has(P, "risk", "manage", "department")) throw err("Department leads and operations add company risks.", 403); const title = clip(b.title, 160); if (!title) throw err("Describe the risk."); if (!sev || !lik) throw err("Rate severity and likelihood from 1 to 5."); const mit = clip(b.mitigation, 1000); if (sev * lik >= 15 && mit.length < 5) throw err("A high risk needs a mitigation plan.");
  const id = rid("rk"); await run(d, "INSERT INTO os_risks (id, org_id, project_id, title, kind, severity, likelihood, impact, mitigation, owner_user_id, status, review_at, created_by, created_at, updated_at) VALUES (?1,?2,NULL,?3,?4,?5,?6,?7,?8,?9,'open',?10,?11,?12,?12)", id, ORG, title, RISK_KINDS.indexOf(b.kind) > -1 ? b.kind : "operational", sev, lik, clip(b.impact, 500), mit, clip(b.owner_user_id, 40) || P.user.id, review || addDays(today(), 90), P.user.id, now);
  await audit(env, P, "RISK_ADDED", { kind: "risk", id }, null, { title, score: sev * lik }); await emit(env, P, "risk.created", { kind: "risk", id }, { title, score: sev * lik, level: level(sev * lik) }); return { id, level: level(sev * lik) };
}

/* ---------------- incidents ---------------- */
export const INC_KINDS = ["security", "data", "outage", "client", "payment", "safety", "legal", "other"], SEV = ["low", "medium", "high", "critical"];
const incManage = (P, x) => P.isOwner || has(P, "incident", "manage", "organization") || (x && x.owner_user_id === P.user.id) || (has(P, "incident", "manage", "department") && x && x.reporter_dept === P.dept);
export async function incidents(env, P, q) {
  const s = allows(P, "incident", "view"); if (!s) throw err("You don't have access to incidents.", 403); const d = await cdb(env), args = [], W = ["i.org_id='" + ORG + "'"];
  if (s === "own") { args.push(P.user.id); W.push("(i.reported_by=?1 OR i.owner_user_id=?1)"); } else if (s !== "organization" && s !== "all") { const sw = scopeWhere(P, s, "i.reported_by", args); args.push(P.user.id); W.push("(" + sw + " OR i.owner_user_id=?" + args.length + ")"); }
  if (q && q.status === "closed") W.push("i.status='closed'"); else W.push("i.status<>'closed'");
  const rows = await all(d, "SELECT i.*, " + nameOf("i.owner_user_id") + " AS owner, " + nameOf("i.reported_by") + " AS reporter FROM os_incidents i WHERE " + W.join(" AND ") + " ORDER BY CASE i.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, i.detected_at DESC LIMIT 200", ...args);
  return { items: rows.map(clockOf), kinds: INC_KINDS, severities: SEV, canManage: has(P, "incident", "manage", "department") };
}
/* the personal-data clock: hours since detection, and whether the informing steps are recorded */
function clockOf(x) { if (!x.personal_data) return x; const h = Math.floor((Date.now() - new Date(x.detected_at).getTime()) / 36e5); return Object.assign(x, { hours_open: h, informing: { board: x.board_informed_at || null, people: x.people_informed_at || null, reason: x.not_informed_reason || null }, informing_note: "Personal data was involved. Under the DPDP Rules the Data Protection Board and the affected people must be informed; confirm the timeline with FODO's lawyer." }); }
export async function report(env, P, b) {
  if (!has(P, "incident", "report", "own")) throw err("You can't report incidents.", 403); const d = await cdb(env), now = nowIso(), title = clip(b.title, 160), summary = clip(b.summary, 3000); if (!title) throw err("What happened (one line)?"); if (summary.length < 10) throw err("Describe what happened and what you saw.");
  const sev = SEV.indexOf(b.severity) > -1 ? b.severity : "medium", kind = INC_KINDS.indexOf(b.kind) > -1 ? b.kind : "other", det = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(b.detected_at || "") ? new Date(b.detected_at).toISOString() : now; if (det > now) throw err("Detection time is in the future.");
  const pd = b.personal_data ? 1 : 0, id = rid("in"), number = await numberFor(d, "os_incidents", "number", "INC"), ops = await holders(d, ["operations_manager"], 3), owner = ops[0] || (await ownerIds(d))[0] || P.user.id;
  await run(d, "INSERT INTO os_incidents (id, org_id, number, title, kind, severity, status, detected_at, summary, reported_by, owner_user_id, personal_data, affected_count, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,'open',?7,?8,?9,?10,?11,?12,?13,?13)", id, ORG, number, title, kind, sev, det, summary, P.user.id, owner, pd, int(b.affected_count, 0, 1e9), now);
  await run(d, "INSERT INTO os_incident_log (incident_id, by_user_id, kind, text, created_at) VALUES (?1,?2,'reported',?3,?4)", id, P.user.id, summary.slice(0, 500), now);
  for (const u of (await ownerIds(d)).concat(ops).filter((u, i, a) => a.indexOf(u) === i)) if (u !== P.user.id) await notify(env, u, "system", (sev === "critical" || sev === "high" ? "URGENT " : "") + "Incident " + number + " (" + sev + (pd ? ", personal data" : "") + "): " + title, "/workspace/#risks?tab=incidents&id=" + id, { category: "system", urgency: sev === "low" ? "info" : "action", dedupe: "inc-" + id }).catch(() => {});
  await audit(env, P, "INCIDENT_REPORTED", { kind: "incident", id }, null, { number, severity: sev, personal_data: !!pd }); await emit(env, P, "incident.reported", { kind: "incident", id }, { number, severity: sev, kind, personal_data: !!pd });
  if (sev === "critical" || sev === "high") { try { const PB = await import("./problems.js"); await PB.raise(env, { rule: "incident_open", key: id, title: "Incident " + number + ": " + title, detail: summary.slice(0, 300), fix: "Contain it, then record the root cause.", severity: sev === "critical" ? "critical" : "high", subject_kind: "incident", subject_id: id, href: "#risks?tab=incidents&id=" + id, owner_user_id: owner, manual: true }); } catch (e) {} }
  return { id, number };
}
export async function incident(env, P, id) {
  const d = await cdb(env), x = await one(d, "SELECT i.*, " + nameOf("i.owner_user_id") + " AS owner, " + nameOf("i.reported_by") + " AS reporter, (SELECT department_id FROM os_members m WHERE m.user_id=i.reported_by AND m.org_id='" + ORG + "') AS reporter_dept FROM os_incidents i WHERE i.id=?1 AND i.org_id=?2", clip(id, 40), ORG); if (!x) throw err("Not found.", 404);
  const s = allows(P, "incident", "view"); if (!(P.isOwner || x.reported_by === P.user.id || x.owner_user_id === P.user.id || s === "organization" || s === "all" || (s === "department" && x.reporter_dept === P.dept) || (s === "team" && await one(d, "SELECT 1 x FROM os_members WHERE user_id=?1 AND manager_user_id=?2", x.reported_by, P.user.id)))) throw err("Not found.", 404);
  const log = await all(d, "SELECT l.kind, l.text, l.created_at, " + nameOf("l.by_user_id") + " AS who FROM os_incident_log l WHERE l.incident_id=?1 ORDER BY l.id", x.id); return { incident: clockOf(x), log, canManage: incManage(P, x) };
}
export async function incidentUpdate(env, P, id, b) {
  const d = await cdb(env), x = await one(d, "SELECT i.*, (SELECT department_id FROM os_members m WHERE m.user_id=i.reported_by AND m.org_id='" + ORG + "') AS reporter_dept FROM os_incidents i WHERE i.id=?1 AND i.org_id=?2", clip(id, 40), ORG); if (!x) throw err("Not found.", 404); if (!incManage(P, x)) throw err("The incident owner, operations or an owner updates it.", 403);
  const now = nowIso(), text = clip(b.note, 2000), o = {}, notes = [];
  if (b.owner_user_id && b.owner_user_id !== x.owner_user_id) { if (!(await one(d, "SELECT 1 x FROM os_members WHERE user_id=?1 AND org_id=?2 AND status='active'", clip(b.owner_user_id, 40), ORG))) throw err("Pick an active team member."); o.owner_user_id = clip(b.owner_user_id, 40); notes.push("owner changed"); notify(env, o.owner_user_id, "system", "You now own incident " + x.number + ": " + x.title, "/workspace/#risks?tab=incidents&id=" + x.id).catch(() => {}); }
  if (b.severity && SEV.indexOf(b.severity) > -1 && b.severity !== x.severity) { o.severity = b.severity; notes.push("severity " + x.severity + " → " + b.severity); }
  if (b.personal_data != null && !!b.personal_data !== !!x.personal_data) { o.personal_data = b.personal_data ? 1 : 0; notes.push(b.personal_data ? "personal data involved" : "no personal data"); }
  if (b.affected_count != null) o.affected_count = int(b.affected_count, 0, 1e9);
  if (b.board_informed_at) { if (!DAY.test(String(b.board_informed_at).slice(0, 10))) throw err("Date the Board was informed."); o.board_informed_at = String(b.board_informed_at).slice(0, 10); notes.push("Data Protection Board informed " + o.board_informed_at); }
  if (b.people_informed_at) { if (!DAY.test(String(b.people_informed_at).slice(0, 10))) throw err("Date the affected people were informed."); o.people_informed_at = String(b.people_informed_at).slice(0, 10); notes.push("affected people informed " + o.people_informed_at); }
  if (b.not_informed_reason) { o.not_informed_reason = clip(b.not_informed_reason, 500); notes.push("not informed: " + o.not_informed_reason); }
  if (b.root_cause) o.root_cause = clip(b.root_cause, 2000);
  const FLOW = { open: ["contained", "resolved"], contained: ["resolved", "open"], resolved: ["closed", "open"], closed: [] };
  if (b.status && b.status !== x.status) { if ((FLOW[x.status] || []).indexOf(b.status) < 0) throw err("An " + x.status + " incident can't become " + b.status + ".", 409); const m = Object.assign({}, x, o);
    if (b.status === "closed") { if (!m.root_cause || m.root_cause.length < 10) throw err("Write the root cause before closing."); if (m.personal_data && !((m.board_informed_at && m.people_informed_at) || (m.not_informed_reason && m.not_informed_reason.length >= 10))) throw err("Personal data was involved: record when the Data Protection Board and the affected people were informed, or why they were not (as advised by your lawyer).", 409); }
    o.status = b.status; o[b.status + "_at"] = now; notes.push("status " + x.status + " → " + b.status); }
  const ks = Object.keys(o).filter((k) => ["owner_user_id", "severity", "personal_data", "affected_count", "board_informed_at", "people_informed_at", "not_informed_reason", "root_cause", "status", "contained_at", "resolved_at", "closed_at"].indexOf(k) > -1);
  if (!ks.length && !text) throw err("Nothing to update."); if (ks.length) await run(d, "UPDATE os_incidents SET " + ks.map((k, i) => k + "=?" + (i + 2)).join(", ") + ", updated_at=?" + (ks.length + 2) + " WHERE id=?1", x.id, ...ks.map((k) => o[k]), now);
  await run(d, "INSERT INTO os_incident_log (incident_id, by_user_id, kind, text, created_at) VALUES (?1,?2,?3,?4,?5)", x.id, P.user.id, o.status ? "status" : "note", [notes.join(" · "), text].filter(Boolean).join(" · ").slice(0, 2500), now);
  await audit(env, P, "INCIDENT_UPDATED", { kind: "incident", id: x.id }, { status: x.status, severity: x.severity }, { status: o.status || x.status, severity: o.severity || x.severity }, text.slice(0, 300));
  if (o.status === "resolved" || o.status === "closed") { try { const PB = await import("./problems.js"); const p0 = await (await import("./problems.js")).pdb(env); await run(p0, "UPDATE os_problems SET status='resolved', resolved_at=?2 WHERE rule='incident_open' AND key=?1 AND status<>'resolved'", x.id, now); } catch (e) {} }
  return { ok: true, status: o.status || x.status };
}
/* continuity: signed-off procedures, live checks, who to call */
export async function continuity(env, P) {
  if (!has(P, "incident", "view", "own")) throw err("Not allowed.", 403); const d = await cdb(env), K = await import("./kb.js"); await K.kdb(env);
  const procs = await all(d, "SELECT id, title, version, status, signed_off_by, signed_version, signed_off_at, review_on FROM os_kb_articles WHERE org_id=?1 AND kind='procedure' AND status<>'archived' ORDER BY title", ORG);
  const people = []; for (const [slug, label] of [["owner", "Owner"], ["operations_manager", "Operations"], ["finance_manager", "Finance"], ["developer", "Technology"]]) for (const u of await holders(d, [slug], 3)) { const m = await one(d, "SELECT name, email FROM os_members WHERE user_id=?1 AND org_id=?2", u, ORG); if (m) people.push({ role: label, name: m.name || m.email, email: m.email }); }
  const checks = { database: "ok", kv: env.CHAT_KV ? "configured" : "not configured", files_r2: env.FILES ? "configured" : "not configured (large files can't be stored)", mail: env.RESEND_API_KEY ? "configured" : "not configured (no emails go out)", jobs_queue: env.JOBS ? "configured" : "not configured (hourly jobs run on the schedule)" };
  const last = await one(d, "SELECT number, title, severity, status, detected_at FROM os_incidents WHERE org_id=?1 ORDER BY detected_at DESC LIMIT 1", ORG);
  return { procedures: procs.map((p) => Object.assign(p, { signed_current: !!(p.signed_off_by && p.signed_version === p.version) })), signed: procs.some((p) => p.status === "published" && p.signed_off_by && p.signed_version === p.version), people, checks, last_incident: last, backups: "Cloudflare D1 keeps point-in-time recovery (Time Travel) for the database; R2 files are not versioned unless you turn it on. Test a restore and write the steps in a signed-off procedure." };
}

/* ---------------- DPDP ---------------- */
export const PURPOSES = { marketing_email: "Marketing emails from FODO", whatsapp_updates: "Updates on WhatsApp", case_study: "Using my project work in FODO's portfolio / case studies", analytics: "Product analytics beyond what is needed to run the service", testimonials: "Publishing my feedback as a testimonial" };
export const REQUEST_KINDS = { access: "A summary / copy of my personal data", correction: "Correct or complete my data", erasure: "Erase my personal data", withdraw_consent: "Withdraw a consent", nominee: "Nominate someone to act for me", grievance: "Complaint (grievance)" };
const privManage = (P) => P.isOwner || has(P, "privacy", "manage", "organization");
const privView = (P) => P.isOwner || has(P, "privacy", "view", "organization");
async function seedRetention(d) {
  const S = [["ai_questions", "Assistant questions (os_ai_calls)", 365], ["chat_logs", "Help chat transcripts", 365], ["os_events", "Activity events (not the audit log)", 730], ["support_tickets", "Support tickets and mail", 1095], ["financial_records", "Invoices, payments, payouts (tax law)", null], ["audit_log", "Audit log", null]];
  for (const [k, l, days] of S) await run(d, "INSERT OR IGNORE INTO os_retention (id, category, label, keep_days, basis, action, legal_reviewed, updated_at) VALUES (?1,?2,?3,?4,?5,?6,0,?7)", rid("rt"), k, l, days, days ? "Suggestion, pending legal review" : "Kept as required by law; pending legal review", days ? "review" : "keep", nowIso());
}
/* the tables a rule can act on; financial records and the audit log are never touched here */
const TARGET = { ai_questions: { count: "SELECT count(*) n FROM os_ai_calls WHERE created_at<?1", del: "DELETE FROM os_ai_calls WHERE created_at<?1", anon: "UPDATE os_ai_calls SET question='(removed)', user_id=NULL WHERE created_at<?1" }, chat_logs: { count: "SELECT count(*) n FROM help_chat_msgs WHERE t<?1", del: "DELETE FROM help_chat_msgs WHERE t<?1", anon: "UPDATE help_chat_msgs SET text='(removed)' WHERE t<?1" }, os_events: { count: "SELECT count(*) n FROM os_events WHERE created_at<?1", del: "DELETE FROM os_events WHERE created_at<?1", anon: "UPDATE os_events SET payload='{}', actor_name=NULL WHERE created_at<?1" }, support_tickets: { count: "SELECT count(*) n FROM help_tickets WHERE updated_at<?1 AND status IN ('solved','closed')", del: null, anon: "UPDATE help_tickets SET email=NULL, name='(removed)' WHERE updated_at<?1 AND status IN ('solved','closed')" } };
export async function privacyOverview(env, P) {
  if (!privView(P)) throw err("The privacy desk is for owners and the people they name.", 403); const d = await cdb(env), t = today(), set = await settings(d);
  const reqs = await all(d, "SELECT r.*, " + nameOf("r.assignee_user_id") + " AS assignee FROM os_rights_requests r ORDER BY r.status IN ('completed','rejected'), r.due_on LIMIT 300");
  const consents = await all(d, "SELECT purpose, sum(status='granted') granted, sum(status='withdrawn') withdrawn FROM os_consents GROUP BY purpose");
  const notices = await all(d, "SELECT id, version, title, status, legal_reviewer, legal_reviewed_at, published_at, created_at FROM os_privacy_notices ORDER BY version DESC LIMIT 20");
  const rules = []; for (const r of await all(d, "SELECT * FROM os_retention ORDER BY category")) { let due = null; const T = TARGET[r.category]; if (T && r.keep_days) { try { due = ((await one(d, T.count, new Date(Date.now() - r.keep_days * 864e5).toISOString())) || {}).n || 0; } catch (e) { due = null; } } rules.push(Object.assign(r, { past_retention: due, can_apply: !!(T && r.keep_days && r.legal_reviewed && (r.action === "delete" ? T.del : r.action === "anonymise" ? T.anon : null)) })); }
  return { requests: reqs.map((r) => Object.assign(r, { overdue: ["completed", "rejected"].indexOf(r.status) < 0 && r.due_on && r.due_on < t })), consents, purposes: PURPOSES, kinds: REQUEST_KINDS, notices, retention: rules, settings: set, canManage: privManage(P), legal_note: "FODO provides these workflows. Response times, retention periods and notice texts must be confirmed by FODO's lawyer before FODO claims DPDP compliance." };
}
async function settings(d) { return Object.assign({ response_days: 30, grievance_officer_user_id: null, response_days_legal_reviewed: false }, await setting(d, "privacy_settings", {})); }
export async function settingsSave(env, P, b) {
  if (!P.isOwner) throw err("Only an owner changes privacy settings.", 403); const d = await cdb(env), cur = await settings(d), next = Object.assign({}, cur), days = int(b.response_days, 1, 180); if (days != null) next.response_days = days;
  if (b.grievance_officer_user_id !== undefined) { const u = clip(b.grievance_officer_user_id, 40) || null; if (u && !(await one(d, "SELECT 1 x FROM os_members WHERE user_id=?1 AND org_id=?2 AND status='active'", u, ORG))) throw err("Pick an active team member.");
    if (u && !(await ownerIds(d)).includes(u) && !(await one(d, "SELECT 1 x FROM os_members m WHERE m.user_id=?1 AND m.org_id=?2 AND (EXISTS (SELECT 1 FROM os_member_roles mr JOIN os_role_perms rp ON rp.role_id=mr.role_id WHERE mr.member_id=m.id AND rp.perm IN ('privacy.view.organization','privacy.view.all','privacy.manage.organization','privacy.manage.all')) OR EXISTS (SELECT 1 FROM os_member_perms g WHERE g.member_id=m.id AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>?3) AND g.perm LIKE 'privacy.%'))", u, ORG, nowIso()))) throw err("The grievance officer needs the Privacy permission first (People & Access).", 409);
    next.grievance_officer_user_id = u; }
  if (b.response_days_legal_reviewed != null) next.response_days_legal_reviewed = !!b.response_days_legal_reviewed; await settingSet(d, "privacy_settings", next); await audit(env, P, "PRIVACY_SETTINGS", { kind: "setting", id: "privacy" }, cur, next); return { settings: next };
}
/* notices: draft → (owner records legal review) → published; one published at a time */
export async function noticeSave(env, P, b) {
  if (!privManage(P)) throw err("Not allowed.", 403); const d = await cdb(env), title = clip(b.title, 160), body = String(b.body || "").slice(0, 60000).trim(); if (!title || body.length < 100) throw err("Write the notice (title and the full text).");
  const v = (((await one(d, "SELECT max(version) v FROM os_privacy_notices")) || {}).v || 0) + 1, id = rid("pn"); await run(d, "INSERT INTO os_privacy_notices (id, version, title, body, status, created_by, created_at) VALUES (?1,?2,?3,?4,'draft',?5,?6)", id, v, title, body, P.user.id, nowIso());
  await audit(env, P, "PRIVACY_NOTICE_DRAFTED", { kind: "privacy_notice", id }, null, { version: v }); return { id, version: v };
}
export async function noticePublish(env, P, id, b) {
  if (!P.isOwner) throw err("Only an owner publishes the privacy notice.", 403); const d = await cdb(env), n = await one(d, "SELECT * FROM os_privacy_notices WHERE id=?1", clip(id, 40)); if (!n) throw err("Not found.", 404); if (n.status !== "draft") throw err("Already " + n.status + ".", 409);
  const who = clip(b.reviewer, 120); if (who.length < 3) throw err("Name the lawyer or firm who reviewed this text. A notice is published only after a legal review."); const now = nowIso();
  await run(d, "UPDATE os_privacy_notices SET status='retired' WHERE status='published'"); await run(d, "UPDATE os_privacy_notices SET status='published', legal_reviewer=?2, legal_reviewed_at=?3, published_at=?3 WHERE id=?1", n.id, who, now);
  await audit(env, P, "PRIVACY_NOTICE_PUBLISHED", { kind: "privacy_notice", id: n.id }, null, { version: n.version, reviewer: who }); return { ok: true, version: n.version };
}
export async function noticeCurrent(env) { const d = await cdb(env); return one(d, "SELECT version, title, body, published_at FROM os_privacy_notices WHERE status='published' ORDER BY version DESC LIMIT 1"); }
/* consents: a person's own, any signed-in user (clients, Pros, team) */
export async function myPrivacy(env, u) {
  const d = await cdb(env), rows = await all(d, "SELECT purpose, status, notice_version, granted_at, withdrawn_at FROM os_consents WHERE user_id=?1", u.id), by = {}; rows.forEach((r) => { by[r.purpose] = r; });
  const reqs = await all(d, "SELECT number, kind, status, due_on, response, created_at, closed_at FROM os_rights_requests WHERE user_id=?1 ORDER BY created_at DESC LIMIT 20", u.id), n = await noticeCurrent(env);
  return { consents: Object.keys(PURPOSES).map((k) => ({ purpose: k, label: PURPOSES[k], status: by[k] ? by[k].status : "not_asked", at: by[k] ? by[k].withdrawn_at || by[k].granted_at : null })), requests: reqs, kinds: REQUEST_KINDS, notice: n ? { version: n.version, title: n.title, published_at: n.published_at } : null };
}
export async function consentSet(env, u, b) {
  const purpose = clip(b.purpose, 30); if (!PURPOSES[purpose]) throw err("Unknown purpose."); const d = await cdb(env), now = nowIso(), n = await noticeCurrent(env), granted = !!b.granted, cur = await one(d, "SELECT * FROM os_consents WHERE user_id=?1 AND purpose=?2", u.id, purpose);
  if (cur) await run(d, "UPDATE os_consents SET status=?3, notice_version=?4, source='self', granted_at=CASE WHEN ?3='granted' THEN ?5 ELSE granted_at END, withdrawn_at=CASE WHEN ?3='withdrawn' THEN ?5 ELSE NULL END, updated_at=?5 WHERE user_id=?1 AND purpose=?2", u.id, purpose, granted ? "granted" : "withdrawn", n ? n.version : null, now);
  else await run(d, "INSERT INTO os_consents (id, user_id, email, purpose, notice_version, status, source, granted_at, withdrawn_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,'self',?7,?8,?9)", rid("cn"), u.id, String(u.email || "").toLowerCase(), purpose, n ? n.version : null, granted ? "granted" : "withdrawn", granted ? now : null, granted ? null : now, now);
  await audit(env, { user: u }, granted ? "CONSENT_GRANTED" : "CONSENT_WITHDRAWN", { kind: "consent", id: u.id + ":" + purpose }, cur ? { status: cur.status } : null, { status: granted ? "granted" : "withdrawn", notice: n ? n.version : null }); return { ok: true, status: granted ? "granted" : "withdrawn" };
}
/* is this person's consent for this purpose on record? (for any module that wants to ask before e.g. a case study) */
export async function consentOf(env, userId, purpose) { const d = await cdb(env), r = await one(d, "SELECT status FROM os_consents WHERE user_id=?1 AND purpose=?2", userId, purpose); return r ? r.status === "granted" : false; }
/* rights requests and grievances */
export async function requestCreate(env, u, b) {
  const kind = clip(b.kind, 20); if (!REQUEST_KINDS[kind]) throw err("Pick what you are asking for."); const detail = clip(b.detail, 3000); if (detail.length < 10) throw err("Tell us a little more so we can act on it.");
  const d = await cdb(env), open = ((await one(d, "SELECT count(*) n FROM os_rights_requests WHERE user_id=?1 AND status NOT IN ('completed','rejected')", u.id)) || {}).n || 0; if (open >= 5) throw err("You have 5 open requests; we will answer those first.", 429);
  const set = await settings(d), id = rid("rr"), number = await numberFor(d, "os_rights_requests", "number", "DPR"), now = nowIso(), due = addDays(today(), set.response_days || 30), assignee = set.grievance_officer_user_id || (await ownerIds(d))[0] || null;
  await run(d, "INSERT INTO os_rights_requests (id, number, kind, user_id, email, name, detail, status, verified, due_on, assignee_user_id, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'received',1,?8,?9,?10,?10)", id, number, kind, u.id, String(u.email || "").toLowerCase(), clip(u.name, 80), detail, due, assignee, now);
  await audit(env, { user: u }, "PRIVACY_REQUEST_RECEIVED", { kind: "rights_request", id }, null, { number, kind }); if (assignee) await notify(env, assignee, "approval", "Privacy request " + number + " (" + REQUEST_KINDS[kind] + "), answer by " + due, "/workspace/#privacy-desk?id=" + id, { category: "approval", urgency: "action", dedupe: "rr-" + id }).catch(() => {});
  return { number, due_on: due, note: "Signed in, so your identity is already verified. " + (kind === "access" ? "You can also download your data yourself under Settings & privacy." : kind === "erasure" ? "You can also delete your account yourself under Settings & privacy." : "") };
}
export async function requestUpdate(env, P, id, b) {
  if (!privManage(P) && !(await one(await cdb(env), "SELECT 1 x FROM os_rights_requests WHERE id=?1 AND assignee_user_id=?2", clip(id, 40), P.user.id))) throw err("Not allowed.", 403); const d = await cdb(env), r = await one(d, "SELECT * FROM os_rights_requests WHERE id=?1", clip(id, 40)); if (!r) throw err("Not found.", 404); if (["completed", "rejected"].indexOf(r.status) > -1) throw err("This request is closed.", 409);
  const to = ["received", "in_progress", "completed", "rejected"].indexOf(b.status) > -1 ? b.status : r.status, resp = clip(b.response, 3000), now = nowIso(); if ((to === "completed" || to === "rejected") && resp.length < 10) throw err("Write the answer sent to the person (it is shown to them).");
  if (b.assignee_user_id) { if (!privManage(P)) throw err("Only the privacy desk reassigns.", 403); if (!(await one(d, "SELECT 1 x FROM os_members WHERE user_id=?1 AND org_id=?2 AND status='active'", clip(b.assignee_user_id, 40), ORG))) throw err("Pick an active team member."); }
  await run(d, "UPDATE os_rights_requests SET status=?2, response=COALESCE(NULLIF(?3,''), response), assignee_user_id=COALESCE(?4, assignee_user_id), updated_at=?5, closed_at=CASE WHEN ?2 IN ('completed','rejected') THEN ?5 ELSE NULL END WHERE id=?1", r.id, to, resp, clip(b.assignee_user_id, 40) || null, now);
  await audit(env, P, "PRIVACY_REQUEST_" + to.toUpperCase(), { kind: "rights_request", id: r.id }, { status: r.status }, { status: to }, resp.slice(0, 300));
  if (to === "completed" || to === "rejected") { if (r.user_id) await notify(env, r.user_id, "system", "Your privacy request " + r.number + " is " + to + ".", "/workspace/#settings").catch(() => {}); if (r.kind === "withdraw_consent" && to === "completed" && r.user_id) await run(d, "UPDATE os_consents SET status='withdrawn', withdrawn_at=?2, updated_at=?2 WHERE user_id=?1 AND status='granted'", r.user_id, now); }
  let blockers = null; if (r.kind === "erasure" && r.user_id) { try { const PV = await import("../privacy.js"); blockers = await PV.blockers(env, { id: r.user_id, email: r.email }); } catch (e) { blockers = null; } }
  return { ok: true, status: to, blockers };
}
export async function retentionSave(env, P, b) {
  if (!P.isOwner) throw err("Only an owner changes retention rules.", 403); const d = await cdb(env), r = await one(d, "SELECT * FROM os_retention WHERE category=?1", clip(b.category, 30)); if (!r) throw err("Unknown category.", 404);
  if (["financial_records", "audit_log"].indexOf(r.category) > -1 && b.action && b.action !== "keep") throw err("Financial records and the audit log are kept; FODO never deletes them from here.", 409);
  const days = b.keep_days === null || b.keep_days === "" ? null : int(b.keep_days, 30, 36500), act = ["keep", "review", "anonymise", "delete"].indexOf(b.action) > -1 ? b.action : r.action, rev = clip(b.reviewer, 120);
  if ((act === "delete" || act === "anonymise") && !days) throw err("Set how many days to keep before deleting or anonymising."); if (act === "delete" && !TARGET[r.category].del) throw err("This category can only be anonymised (other records point to it).", 409);
  await run(d, "UPDATE os_retention SET keep_days=?2, action=?3, basis=?4, legal_reviewed=?5, reviewer=?6, updated_by=?7, updated_at=?8 WHERE id=?1", r.id, days, act, clip(b.basis, 300) || r.basis, rev.length >= 3 ? 1 : 0, rev || null, P.user.id, nowIso());
  await audit(env, P, "RETENTION_RULE_SET", { kind: "retention", id: r.category }, { keep_days: r.keep_days, action: r.action }, { keep_days: days, action: act, legal_reviewed: rev.length >= 3 }); return { ok: true, legal_reviewed: rev.length >= 3 };
}
/* an owner applies a legally reviewed rule by hand; the row count is recorded */
export async function retentionApply(env, P, cat, b) {
  if (!P.isOwner) throw err("Only an owner applies a retention rule.", 403); const d = await cdb(env), r = await one(d, "SELECT * FROM os_retention WHERE category=?1", clip(cat, 30)); if (!r) throw err("Unknown category.", 404); const T = TARGET[r.category];
  if (!T || !r.keep_days || ["delete", "anonymise"].indexOf(r.action) < 0) throw err("This rule does not delete or anonymise anything.", 409); if (!r.legal_reviewed) throw err("Record the legal review of this rule first.", 409); if (b.confirm !== r.category) throw err("Type the category name to confirm.");
  const cut = new Date(Date.now() - r.keep_days * 864e5).toISOString(), res = await run(d, r.action === "delete" ? T.del : T.anon, cut), n = (res.meta && res.meta.changes) || 0;
  await run(d, "UPDATE os_retention SET last_applied_at=?2, last_applied_rows=?3 WHERE id=?1", r.id, nowIso(), n); await audit(env, P, "RETENTION_APPLIED", { kind: "retention", id: r.category }, null, { action: r.action, rows: n, before: cut }); return { rows: n, action: r.action };
}
/* daily: risk reviews due, privacy requests due within 3 days or late */
export async function daily(env) {
  const d = await cdb(env), t = today(); let risksDue = 0, reqs = 0;
  for (const r of await all(d, "SELECT id, title, owner_user_id, review_at FROM os_risks WHERE project_id IS NULL AND status IN ('open','mitigating','accepted') AND review_at IS NOT NULL AND review_at<=?1", t)) { if (r.owner_user_id) { await notify(env, r.owner_user_id, "system", "Review the risk: " + r.title, "/workspace/#risks", { category: "system", urgency: "info", dedupe: "rk-" + r.id + "-" + r.review_at }).catch(() => {}); risksDue++; } }
  for (const r of await all(d, "SELECT id, number, due_on, assignee_user_id FROM os_rights_requests WHERE status NOT IN ('completed','rejected') AND due_on<=?1", addDays(t, 3))) { const to = r.assignee_user_id ? [r.assignee_user_id] : await ownerIds(d); for (const u of to) await notify(env, u, "approval", "Privacy request " + r.number + (r.due_on < t ? " is late (was due " : " is due ") + r.due_on, "/workspace/#privacy-desk?id=" + r.id, { category: "approval", urgency: "action", dedupe: "rr-due-" + r.id + "-" + t }).catch(() => {}); reqs++; }
  return { risks_due: risksDue, privacy_due: reqs };
}
