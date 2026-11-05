// v50.2 FODO OS V4 Phase 2: clients (Customer 360, health, pipeline, handover gate), task engine 2.0 (dependencies, approvals), approvals engine
// (escalation), My FODO, queues, calendar, workload, project lifecycle (brief, scope, deliverables, risks, daily reports, progress, health,
// closure), support SLA (tickets, replies, notes, CSAT, escalation), Command Centre, Control Tower, global search, OS jobs.
// v50.1 FODO OS V4 Phase 1: permission registry, os_* tables + seeds + legacy backfill, principal / authorize matrix, People & Access
// (invite, roles, grants with expiry, suspend + session revoke, offboarding handoff, departments, custom roles), view-as (read-only,
// audited), structured audit + event bus (marketplace writes become events), notification categories + dedupe, kill switch,
// module switches, role-aware navigation, OWNER_CAN_ACCESS_ALL_SYSTEM_MODULES. Every rule is enforced on the server.
// Run: node --no-warnings tests/v502.test.mjs
import { DatabaseSync } from "node:sqlite";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as bizApi } from "../functions/api/biz/[[path]].js";
import fs from "node:fs";
import { onRequest as osApi, ROUTES } from "../functions/api/os/[[path]].js";
import { REGISTRY, SCOPES, TEMPLATES, validPerm, LEGACY, MODULES } from "../functions/_lib/os/permissions.js";
import { osdb, ORG } from "../functions/_lib/os/db.js";
import { principal, allows, authorize, has, relationOf, cleanFor } from "../functions/_lib/os/authz.js";
import { emit, on, events } from "../functions/_lib/os/audit.js";
import { HANDLERS, enqueue, runDue } from "../functions/_lib/jobs.js";
import * as TK from "../functions/_lib/os/tasks.js";
import * as PJ from "../functions/_lib/os/projects.js";
import { notify, rolesOf, navFor, bdb } from "../functions/_lib/biz.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
console.log = ((orig) => (...a) => { if (typeof a[0] === "string" && a[0].charAt(0) === "{" && !process.env.DBG) return; orig(...a); })(console.log);
console.error = process.env.DBG ? console.log.bind(console) : () => {};
function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, a = []) => ({ bind: (...x) => st(sql, x.map((v) => v === undefined ? null : v)), run: async () => { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }), _x: () => db.prepare(sql).run(...a) });
  return { db, prepare: (s) => st(s), batch: async (l) => l.map((s) => (s._x(), { success: true })) };
}
const SITE = "https://www.fodo.co.in", jars = {}, H = { account, biz: bizApi, os: osApi };
const call = async (path, body, o = {}) => {
  const who = o.as || "a", h = Object.keys(H).filter((k) => path.indexOf(k + "/") === 0)[0] || "account", p = h === "account" ? path : path.slice(h.length + 1);
  const method = o.method || (body !== undefined ? "POST" : "GET");
  const req = new Request(SITE + "/api/" + h + "/" + p, { method, headers: Object.assign({ origin: SITE, "cf-connecting-ip": "9.9.9.9" }, body !== undefined ? { "content-type": "application/json" } : {}, jars[who] ? { cookie: jars[who] } : {}, o.headers || {}), body: body === undefined ? undefined : JSON.stringify(body) });
  const r = await H[h]({ request: req, env, params: { path: p.split("?")[0].split("/") } }); const sc = r.headers.get("set-cookie"); if (sc && h === "account") jars[who] = sc.split(";")[0];
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, j, t };
};
const login = (email, plan, who) => call("test-login", Object.assign({ email }, plan ? { plan } : {}), { as: who });
const mails = []; globalThis.fetch = async (u, o = {}) => { if (/resend/.test(String(u))) { mails.push(JSON.parse(o.body)); return new Response("{}", { status: 200 }); } return new Response("x", { status: 599 }); };
const KV = new Map(), CHAT_KV = { get: async (k) => KV.get(k) || null, put: async (k, v) => { KV.set(k, v); }, getWithMetadata: async (k) => ({ value: KV.get(k) || null, metadata: null }), delete: async (k) => KV.delete(k), list: async () => ({ keys: [] }) };
const env = { XRAY_DB: d1(), CHAT_KV, ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", API_DEBUG: process.env.DBG ? "1" : "", MAIL_FROM: "FODO <hello@fodo.co.in>", RESEND_API_KEY: "re_test" };
const O = (p, body, who, o) => call("os/" + p, body, Object.assign({ as: who || "own" }, o || {}));
const Z = (p, body, who, o) => call("biz/" + p, body, Object.assign({ as: who || "c" }, o || {}));
const q1 = (sql, ...a) => env.XRAY_DB.db.prepare(sql).get(...a), qa = (sql, ...a) => env.XRAY_DB.db.prepare(sql).all(...a), qr = (sql, ...a) => env.XRAY_DB.db.prepare(sql).run(...a);
const uid = (email) => (q1("SELECT id FROM acct_users WHERE email=?", email) || {}).id;

/* ---------- 1. registry ---------- */
const U = (e) => q1("SELECT * FROM acct_users WHERE email=?", e), Pof = async (e) => principal(env, U(e), { R: await rolesOf(env, U(e)) });
const mem = (e) => q1("SELECT * FROM os_members WHERE email=?", e);
/* ---------- people set-up ---------- */
await login("anmol@fodo.co.in", null, "own"); await login("client@biz.in", null, "c"); await login("other@biz.in", null, "o"); await bdb(env); await osdb(env);
const dept = (slug) => q1("SELECT id FROM os_departments WHERE slug=?", slug).id;
await O("people", { email: "pm@fodo.co.in", name: "Priya PM", roles: ["project_manager"], department_id: dept("operations") }); await login("pm@fodo.co.in", null, "pm"); await O("me", undefined, "pm");
await O("people", { email: "dev@fodo.co.in", name: "Dev Designer", roles: ["designer"], department_id: dept("design"), manager_user_id: uid("pm@fodo.co.in") }); await login("dev@fodo.co.in", null, "dev"); await O("me", undefined, "dev");
await O("people", { email: "fin@fodo.co.in", name: "Fiona Finance", roles: ["finance_manager"], department_id: dept("finance") }); await login("fin@fodo.co.in", null, "fin"); await O("me", undefined, "fin");
await O("people", { email: "ops@fodo.co.in", name: "Om Ops", roles: ["operations_manager"], department_id: dept("operations") }); await login("ops@fodo.co.in", null, "ops"); await O("me", undefined, "ops");
await O("departments/" + dept("operations"), { manager_user_id: uid("ops@fodo.co.in") });

/* ---------- 1. clients: canonical record, 360, health, pipeline ---------- */
qr("INSERT INTO biz_projects (id, client_id, pro_id, title, status, created_at, updated_at) VALUES ('pjM', ?, 'proX', 'Reels for Cafe', 'in_progress', '2026-01-01', '2026-01-01')", uid("client@biz.in"));
let r = await O("clients"); ok(r.status === 200 && r.j.items.length === 1 && r.j.items[0].email === "client@biz.in" && r.j.items[0].active_projects === 1, "clients list backfills one canonical record per client with projects");
const clId = r.j.items[0].id; r = await O("clients"); ok(r.j.items.length === 1, "backfill is idempotent");
r = await O("clients", { name: "Acme Retail", email: "buyer@acme.in", industry: "Retail / D2C", city: "Delhi", status: "lead" }); ok(r.status === 200 && r.j.id, "staff creates a lead client by hand");
const acme = r.j.id; r = await O("clients", { name: "Dup", email: "client@biz.in" }); ok(r.status === 409, "second record for the same account refused");
r = await O("clients/" + acme); ok(r.status === 200 && r.j.health && r.j.health.score === null && /No account|Insufficient/i.test(r.j.health.reason || ""), "a lead without an account: health says what is missing instead of inventing a score");
r = await O("clients/" + clId); ok(r.status === 200 && r.j.projects.length === 1 && r.j.health.score === 100 && r.j.health.factors.length === 1 && r.j.health.factors[0].factor === "Project outcomes", "Customer 360 shows projects; with one project and no money data only the outcomes factor is scored (coverage shown)");
qr("INSERT INTO biz_invoices (id, number, kind, title, client_id, total, status, issue_date, created_at, due_date) VALUES ('inv1','FI-1','invoice','Milestone 1', ?, 1000000, 'issued', '2026-01-01', '2026-01-01', '2026-01-10')", uid("client@biz.in"));
r = await O("clients/" + clId); ok(r.j.health.score === 81 && r.j.health.factors[0].factor === "Payment behaviour" && r.j.health.factors[0].score === 65 && r.j.health.churnRisk === "low" && r.j.health.previous === 100, "health formula: one overdue invoice → payment 65 (weight 30) with outcomes 100 (weight 25) → 81; previous score kept; factors explained");
r = await O("clients/" + clId, undefined, "fin"); ok(r.status === 200 && r.j.invoices.length === 1, "finance manager sees the client's invoices");
r = await O("clients/" + clId, undefined, "dev"); ok(r.status === 403, "designer with no relation to the client gets 403");
r = await O("clients/" + clId, undefined, "c"); ok(r.status === 403, "a client cannot open the 360 view of another client's... or own internal record (client.view own is not a 360 right)");
r = await O("clients/" + acme, { status: "active", account_manager_user_id: uid("pm@fodo.co.in"), requirements: { goals: "Launch D2C store", budget: "3L" }, reason: "kick-off" }); ok(r.status === 200 && q1("SELECT status, account_manager_user_id a FROM os_clients WHERE id=?", acme).a === uid("pm@fodo.co.in"), "client updated with requirements and account manager");
r = await O("clients", undefined, "pm"); ok(r.j.items.length === 1 && r.j.items[0].id === acme && r.j.scope === "team", "PM (client.view team) sees only clients she manages");
qr("INSERT INTO crm_contacts (id, user_id, name, email, company, created_at, updated_at) VALUES ('ct1', ?, 'Ravi', 'ravi@acme.in', 'Acme Retail', '2026-01-01', '2026-01-01')", uid("pm@fodo.co.in")); qr("INSERT INTO crm_deals (id, user_id, contact_id, title, value, stage, prob, created_at, updated_at) VALUES ('dl1', ?, 'ct1', 'Acme store launch', 300000, 'proposal', 50, '2026-01-01', '2026-01-01')", uid("pm@fodo.co.in"));
r = await O("clients/pipeline", undefined, "ops"); ok(r.status === 200 && r.j.stages.find((s) => s.stage === "proposal").items.length === 1 && r.j.stages.find((s) => s.stage === "proposal").value === 300000, "FODO sales pipeline aggregates staff deals by stage");
r = await O("clients/pipeline", undefined, "dev"); ok(r.status === 200 && r.j.scope === "own" && r.j.stages.every((s) => !s.items.length), "designer only sees her own (empty) deals, never the team pipeline");
/* handover gate */
r = await O("clients/handover", { deal_id: "dl1", client_id: acme, type: "website", goal: "Launch the store", deliverables: ["Shop site", "Launch campaign"], due: "2026-12-31", budget: 300000, pm_user_id: uid("pm@fodo.co.in") }, "ops"); ok(r.status === 200 && r.j.blocked && r.j.missing.some((m) => /not won/.test(m)), "handover blocked while the deal is not won (missing list returned, nothing created)");
qr("UPDATE crm_deals SET stage='won', closed_at=?, updated_at=? WHERE id='dl1'", new Date().toISOString(), new Date().toISOString()); r = await O("clients/handover", { deal_id: "dl1", client_id: acme, type: "website", goal: "Launch the store", deliverables: ["Shop site", "Launch campaign"], due: "2026-12-31", budget: 300000 }, "ops"); ok(r.j.blocked && r.j.missing.indexOf("project manager") > -1, "handover blocked without a project manager");
r = await O("clients/handover", { deal_id: "dl1", client_id: acme, type: "website", goal: "Launch the store", deliverables: ["Shop site", "Launch campaign"], due: "2026-12-31", budget: 300000, pm_user_id: uid("pm@fodo.co.in") }, "ops"); ok(r.status === 200 && r.j.project_id && r.j.client_id === acme, "handover creates the project once everything is in place");
const pjW = r.j.project_id; ok(q1("SELECT count(*) n FROM biz_tasks WHERE project_id=?", pjW).n === 6 && q1("SELECT count(*) n FROM os_scope_items WHERE project_id=?", pjW).n === 2 && q1("SELECT goal FROM os_project_briefs WHERE project_id=?", pjW).goal === "Launch the store", "website type → 6 default tasks, 2 scope items from the brief, brief stored");
ok(q1("SELECT owner_user_id o, lifecycle, kind FROM biz_projects WHERE id=?", pjW).o === uid("pm@fodo.co.in") && q1("SELECT lifecycle FROM biz_projects WHERE id=?", pjW).lifecycle === "planning" && q1("SELECT kind FROM biz_projects WHERE id=?", pjW).kind === "internal", "project owned by the PM, lifecycle planning, kind internal");

/* ---------- 2. project lifecycle, brief, scope, deliverables, risks, reports, progress, health, closure ---------- */
r = await O("projects", undefined, "pm"); ok(r.status === 200 && r.j.items.some((p) => p.id === pjW) && r.j.items.find((p) => p.id === pjW).progress.pct === 0, "PM lists her project with progress 0%");
r = await O("projects/" + pjW, undefined, "pm"); ok(r.status === 200 && r.j.next.indexOf("active") > -1 && r.j.closure && !r.j.closure.ready && r.j.closure.blocking.length === 1, "project page: next states and closure checklist (6 open tasks block completion)");
r = await O("projects/" + pjW, { lifecycle: "completed" }, "pm"); ok(r.status === 409, "planning → completed is not a valid transition");
r = await O("projects/" + pjW, { lifecycle: "on_hold" }, "pm"); ok(r.status === 400 && /why/i.test(r.j.reason), "on hold needs a reason");
r = await O("projects/" + pjW, { lifecycle: "active" }, "pm"); ok(r.status === 200 && q1("SELECT to_state t FROM os_project_status_log WHERE project_id=? ORDER BY id DESC LIMIT 1", pjW).t === "active", "planning → active logged with who");
r = await O("projects/" + pjW, { lifecycle: "delivered", reason: "skip" }, "pm"); ok(r.status === 409, "a PM cannot jump states even with a reason");
r = await O("projects/" + pjW, { lifecycle: "delivered", reason: "owner override for test" }); ok(r.status === 200 && q1("SELECT count(*) n FROM os_audit WHERE action='OWNER_OVERRIDE' AND target_id=?", pjW).n === 1, "owner may override a transition; it is audited as OWNER_OVERRIDE with the reason");
await O("projects/" + pjW, { lifecycle: "revision", reason: "back" }); await O("projects/" + pjW, { lifecycle: "production", reason: "x" });
r = await O("projects/" + pjW, undefined, "dev"); ok(r.status === 403, "designer not on the project → 403");
const t6 = qa("SELECT id, title FROM biz_tasks WHERE project_id=? ORDER BY created_at", pjW); r = await O("tasks/" + t6[0].id, { assignee_user_id: uid("dev@fodo.co.in") }, "pm"); ok(r.status === 200 && r.j.task.assignee_user_id === uid("dev@fodo.co.in"), "PM assigns the first task to her designer");
r = await O("projects/" + pjW, undefined, "dev"); ok(r.status === 200 && r.j.canEdit === false, "designer now sees the project (assigned) but cannot edit it");
r = await O("projects/" + pjW + "/brief", { audience: "Delhi shoppers", mode: "hybrid", budget: 350000 }, "pm"); ok(r.status === 200 && q1("SELECT mode, budget, goal FROM os_project_briefs WHERE project_id=?", pjW).mode === "hybrid" && q1("SELECT goal FROM os_project_briefs WHERE project_id=?", pjW).goal === "Launch the store", "brief updated field by field, earlier fields kept");
r = await O("projects/" + pjW + "/scope", { title: "Extra landing page", change: true, amount: 25000, days: 5 }, "pm"); ok(r.status === 200 && r.j.change_id && q1("SELECT status FROM biz_changes WHERE id=?", r.j.change_id).status === "proposed" && q1("SELECT status FROM os_scope_items WHERE change_id=?", r.j.change_id).status === "requested", "out-of-scope work becomes a change request, not silent extra work");
r = await O("projects/" + pjW + "/deliverable", { title: "Homepage design", owner_user_id: uid("dev@fodo.co.in"), due: "2026-12-01" }, "pm"); ok(r.status === 200 && r.j.id, "PM creates a deliverable owned by the designer"); const dl = r.j.id;
r = await O("projects/" + pjW + "/deliverable", { id: dl, action: "approve_internal" }, "pm"); ok(r.status === 409, "cannot approve a draft (state machine)");
r = await O("projects/" + pjW + "/deliverable", { id: dl, action: "submit" }, "dev"); ok(r.status === 200 && r.j.status === "submitted", "designer submits her deliverable");
ok(q1("SELECT count(*) n FROM biz_tasks WHERE project_id=? AND kind='review'", pjW).n === 1, "automation: a review task was created on submission");
r = await O("projects/" + pjW + "/deliverable", { id: dl, action: "review" }, "dev"); ok(r.status === 403, "the designer cannot review her own work (needs approval rights)");
await O("projects/" + pjW + "/deliverable", { id: dl, action: "review" }, "pm"); r = await O("projects/" + pjW + "/deliverable", { id: dl, action: "reject" }, "pm"); ok(r.status === 400, "a rejection needs a note");
r = await O("projects/" + pjW + "/deliverable", { id: dl, action: "approve_internal" }, "pm"); ok(r.status === 200 && r.j.status === "client_review", "internal approval → client review");
r = await O("projects/" + pjW + "/deliverable", { id: dl, action: "client_approve" }, "pm"); ok(r.status === 403, "staff cannot approve on the client's behalf");
await login("buyer@acme.in", null, "buyer"); qr("UPDATE biz_projects SET client_id=? WHERE id=?", uid("buyer@acme.in"), pjW); qr("UPDATE os_clients SET primary_user_id=? WHERE id=?", uid("buyer@acme.in"), acme);
r = await O("projects/" + pjW, undefined, "buyer"); ok(r.status === 200 && r.j.deliverables.length === 1 && r.j.risks.length === 0 && r.j.finance === null && !r.j.reports.length, "the client sees her project and deliverables, never risks, reports or finance");
r = await O("projects/" + pjW + "/deliverable", { id: dl, action: "client_approve", note: "Love it" }, "buyer"); ok(r.status === 200 && r.j.status === "approved" && q1("SELECT by_role FROM os_deliverable_reviews WHERE deliverable_id=? ORDER BY created_at DESC LIMIT 1", dl).by_role === "client", "client approves; the review row is immutable and marked client");
ok(q1("SELECT count(*) n FROM os_deliverable_reviews WHERE deliverable_id=?", dl).n === 4, "every review action kept (submit, review, approve_internal, client_approve)");
r = await O("projects/" + pjW + "/risk", { title: "Payment gateway KYC pending", severity: 4, likelihood: 3, mitigation: "Start KYC now" }, "pm"); ok(r.status === 200 && r.j.id, "PM logs a risk");
r = await O("projects/" + pjW + "/report", { done: "Homepage approved", blockers: "Waiting for product photos" }, "pm"); ok(r.status === 200 && q1("SELECT count(*) n FROM os_daily_reports WHERE project_id=?", pjW).n === 1, "daily PM report stored"); await O("projects/" + pjW + "/report", { done: "Homepage approved, photos chased", blockers: "" }, "pm"); ok(q1("SELECT count(*) n FROM os_daily_reports WHERE project_id=?", pjW).n === 1 && q1("SELECT blockers FROM os_daily_reports WHERE project_id=?", pjW).blockers === "", "same day report updates in place");
qr("UPDATE biz_tasks SET due='2020-01-01' WHERE id=?", t6[1].id); r = await O("projects/" + pjW, undefined, "pm"); ok(r.j.project.health.score < 100 && r.j.project.health.reasons.some((x) => /overdue task/.test(x)) && r.j.project.health.reasons.some((x) => /high risk/.test(x)) && r.j.project.health.reasons.some((x) => /change request/.test(x)) && r.j.project.health.formula, "health engine explains every deduction (overdue task, high risk, pending change request) and shows its formula");
ok(r.j.project.progress.parts.some((x) => x.name === "deliverables" && x.pct === 100) && r.j.project.progress.pct > 0, "progress engine from tasks and deliverables, not a typed number");

/* ---------- 3. task engine ---------- */
r = await O("tasks", { title: "Standalone design task", assignee_user_id: uid("dev@fodo.co.in"), priority: "high", due: "2026-12-05", estimated_min: 120, checklist: ["Sketch", "Export"] }, "pm"); ok(r.status === 200 && r.j.task.status === "todo" && r.j.task.checklist.length === 2 && r.j.task.department_id === dept("design"), "PM creates a task for her designer; department follows the assignee"); const tA = r.j.task.id;
r = await O("tasks", { title: "Nope", assignee_user_id: uid("fin@fodo.co.in") }, "dev"); ok(r.status === 403, "designer cannot assign a task to someone she does not manage");
r = await O("tasks", { title: "My own note" }, "dev"); ok(r.status === 200 && r.j.task.assignee_user_id === uid("dev@fodo.co.in"), "designer creates a task for herself"); const tB = r.j.task.id;
r = await O("tasks", { title: "Client task" }, "c"); ok(r.status === 403, "clients cannot create standalone staff tasks");
r = await O("tasks/" + tB + "/deps", { depends_on: tA }, "dev"); ok(r.status === 200 && q1("SELECT status FROM biz_tasks WHERE id=?", tB).status === "blocked", "a dependency on an open task blocks the task automatically");
r = await O("tasks/" + tA + "/deps", { depends_on: tB }, "pm"); ok(r.status === 409, "dependency loops refused");
r = await O("tasks/" + tB + "/status", { status: "done" }, "dev"); ok(r.status === 409 && /Blocked/.test(r.j.reason), "cannot finish a blocked task");
r = await O("tasks/" + tA + "/status", { status: "doing" }, "dev"); ok(r.status === 200 && r.j.task.status === "doing", "assignee moves her task to in progress");
r = await O("tasks/" + tA + "/status", { status: "done", note: "exported" }, "dev"); ok(r.status === 200 && r.j.task.status === "done" && q1("SELECT status FROM biz_tasks WHERE id=?", tB).status === "todo", "finishing the predecessor unblocks the dependent task");
ok(q1("SELECT count(*) n FROM os_task_comments WHERE task_id=?", tA).n === 1 && q1("SELECT count(*) n FROM os_events WHERE kind='task.completed' AND subject_id=?", tA).n === 1, "status note stored as a comment; task.completed event emitted");
r = await O("tasks/" + tA + "/cancel", {}, "dev"); ok(r.status === 403, "designer cannot delete (team scope)"); r = await O("tasks/" + tB + "/comment", { body: "On it" }, "dev"); ok(r.status === 200, "comment added");
r = await O("tasks", { title: "Needs sign-off", assignee_user_id: uid("dev@fodo.co.in"), approval_required: true }, "pm"); const tC = r.j.task.id; r = await O("tasks/" + tC + "/status", { status: "done" }, "dev"); ok(r.status === 200 && r.j.task.status === "review" && q1("SELECT approver_user_id a, status FROM os_approvals WHERE object_id=?", tC).a === uid("pm@fodo.co.in"), "approval_required: done becomes review and opens an approval for the manager");
const apT = q1("SELECT id FROM os_approvals WHERE object_id=?", tC).id; r = await O("approvals/" + apT + "/decide", { decision: "approve" }, "dev"); ok(r.status === 403, "the requester cannot approve her own request");
r = await O("approvals/" + apT + "/decide", { decision: "approve", note: "good" }, "pm"); ok(r.status === 200 && q1("SELECT status FROM biz_tasks WHERE id=?", tC).status === "approved", "manager approves → task approved");
r = await O("tasks", undefined, "dev"); ok(r.status === 200 && r.j.scope === "assigned" && r.j.items.every((t) => t.assignee_user_id === uid("dev@fodo.co.in") || t.created_by === uid("dev@fodo.co.in") || t.project_id), "designer's list is her own / assigned work");
r = await O("tasks/board", undefined, "pm"); ok(r.status === 200 && r.j.columns.length === 8 && r.j.columns.find((c) => c.id === "done").items.length >= 1, "board groups by the 8 statuses");
r = await O("tasks", undefined, "fin"); ok(r.status === 200 && r.j.scope === "organization" && r.j.items.length >= 8, "finance manager (task.view organization) lists every open staff task");
r = await O("tasks", undefined, "c"); ok(r.status === 200 && r.j.items.length === 0, "a client sees no staff tasks");

/* ---------- 4. approvals engine ---------- */
r = await O("approvals", { kind: "budget", title: "Extra ₹25,000 for photos", approver_user_id: uid("ops@fodo.co.in"), deadline: "2020-01-01", detail: "Product shoot" }, "pm"); ok(r.status === 200 && r.j.id, "PM requests a budget approval from Ops"); const apB = r.j.id;
r = await O("approvals", { kind: "payout", title: "Pay pro", approver_user_id: uid("ops@fodo.co.in") }, "pm"); const apP = r.j.id; r = await O("approvals/" + apP + "/decide", { decision: "approve" }, "ops"); ok(r.status === 403 && /finance/i.test(r.j.reason), "money approvals need finance management rights even for the named approver");
r = await O("approvals/" + apB + "/decide", { decision: "reject" }, "ops"); ok(r.status === 400, "rejection needs a reason");
r = await O("approvals", undefined, "ops"); ok(r.j.items.some((a) => a.id === apB && a.overdue && a.mine), "Ops sees the overdue approval as hers");
const esc = await (await import("../functions/_lib/os/approvals.js")).escalateDue(env, 25); ok(esc.escalated >= 1 && q1("SELECT approver_user_id a, escalation FROM os_approvals WHERE id=?", apB).a !== uid("ops@fodo.co.in") && q1("SELECT escalation e FROM os_approvals WHERE id=?", apB).e === 1, "escalation moves an overdue approval up the chain (Ops → owner) once");
const esc2 = await (await import("../functions/_lib/os/approvals.js")).escalateDue(env, 25); ok(q1("SELECT escalation e FROM os_approvals WHERE id=?", apB).e === 1, "no second escalation within a day (not a broadcast)");
r = await O("approvals/" + apB + "/decide", { decision: "approve", note: "ok" }); ok(r.status === 200 && q1("SELECT count(*) n FROM biz_notes WHERE user_id=? AND kind='approval'", uid("pm@fodo.co.in")).n >= 1, "owner (escalated approver) approves; requester notified");
r = await O("approvals/" + apB + "/decide", { decision: "approve", note: "again" }); ok(r.status === 409, "already decided");
r = await O("approvals/" + apP + "/cancel", {}, "dev"); ok(r.status === 403, "only the requester cancels"); r = await O("approvals/" + apP + "/cancel", {}, "pm"); ok(r.status === 200, "requester cancels her payout request");

/* ---------- 5. My FODO, queues, calendar, workload ---------- */
r = await O("my", undefined, "dev"); ok(r.status === 200 && r.j.today && r.j.work && r.j.quick.length >= 3 && r.j.notifications && typeof r.j.notifications.unread === "number" && r.j.today.overdue.length === 0 && r.j.work.projects.some((p) => p.id === pjW), "My FODO: today, my work (assigned project), quick actions, split notifications");
r = await O("my", undefined, "c"); ok(r.status === 200, "a client can open My FODO too (own scope, empty)");
r = await O("queues", undefined, "dev"); ok(r.status === 200 && r.j.items.length === 0, "designer (no team scope) has no department queues");
r = await O("queues", undefined, "pm"); ok(r.j.items.length >= 4 && !r.j.items.some((q) => q.id === "finance"), "PM sees department queues but not the finance queue");
r = await O("queue/finance", undefined, "pm"); ok(r.status === 403, "finance queue needs finance.view"); r = await O("queue/finance", undefined, "fin"); ok(r.status === 200 && r.j.sections.some((s) => s.name === "Invoices open" && s.items.length === 1), "finance manager's queue lists the open invoice");
r = await O("queue/design", undefined, "pm"); ok(r.status === 200 && r.j.sections.length === 4 && Array.isArray(r.j.tasks), "design queue has its four sections and the department's open tasks");
r = await O("queue/nope", undefined, "pm"); ok(r.status === 404, "unknown queue");
r = await O("calendar?from=2026-11-01&to=2026-12-31", undefined, "dev"); ok(r.status === 200 && r.j.items.some((e) => e.kind === "task" && e.day === "2026-12-05") === false && r.j.items.some((e) => e.kind === "project" && e.day === "2026-12-31"), "designer's calendar: her project deadline; the finished task is not there");
r = await O("calendar?from=2026-11-01&to=2026-12-31", undefined, "pm"); ok(r.j.items.some((e) => e.kind === "task") && r.j.days.length >= 1, "PM's calendar has team task due dates grouped by day");
r = await O("workload", undefined, "dev"); ok(r.status === 403, "designer has no workload view"); r = await O("workload", undefined, "pm"); ok(r.status === 200 && r.j.items.some((m) => m.email === "dev@fodo.co.in") && r.j.items.every((m) => m.cost_rate === undefined) && r.j.thresholds, "PM sees her team's workload with thresholds, never cost rates");
const wl = r.j.items.find((m) => m.email === "dev@fodo.co.in"); ok(wl.open_tasks >= 1 && wl.state && wl.available_min === 2400, "workload maths: 40 h = 2400 min available, state computed");

/* ---------- 6. support: tickets, SLA, notes, CSAT, escalation ---------- */
r = await O("support", { subject: "Site is slow", text: "Pages take 10 seconds", priority: "high" }, "buyer"); ok(r.status === 200 && r.j.id && r.j.sla_due, "client opens a ticket from the Workspace with an SLA deadline"); const tk1 = r.j.id;
ok(q1("SELECT channel, status, priority FROM help_tickets WHERE id=?", tk1).channel === "workspace" && q1("SELECT sla_due FROM help_tickets WHERE id=?", tk1).sla_due, "ticket stored in the existing help desk with sla_due (8 h for high)");
r = await O("support", undefined, "buyer"); ok(r.j.items.length === 1, "client lists her tickets"); r = await O("support/" + tk1, undefined, "c"); ok(r.status === 403, "another client cannot read it");
r = await O("support/" + tk1 + "/reply", { text: "Checking the server now", note: true }, "pm"); ok(r.status === 200 && r.j.note, "staff adds an internal note"); r = await O("support/" + tk1, undefined, "buyer"); ok(r.j.messages.length === 1, "the client does not see internal notes");
r = await O("support/" + tk1 + "/reply", { text: "We found it, fixing today." }, "pm"); ok(r.status === 200 && q1("SELECT first_reply_at f, assignee_user_id a FROM help_tickets WHERE id=?", tk1).f && q1("SELECT assignee_user_id a FROM help_tickets WHERE id=?", tk1).a === uid("pm@fodo.co.in"), "first staff reply sets first_reply_at and assigns the ticket");
r = await O("support/" + tk1 + "/rate", { csat: 5 }, "buyer"); ok(r.status === 400, "cannot rate before solved"); r = await O("support/" + tk1 + "/status", { status: "solved" }, "pm"); ok(r.status === 200, "staff marks solved"); r = await O("support/" + tk1 + "/rate", { csat: 5, note: "fast" }, "buyer"); ok(r.status === 200 && q1("SELECT csat FROM help_tickets WHERE id=?", tk1).csat === 5, "client rates the solved ticket");
r = await O("support", { subject: "Invoice question", text: "Wrong GST", priority: "urgent" }, "buyer"); const tk2 = r.j.id; qr("UPDATE help_tickets SET sla_due='2020-01-01T00:00:00.000Z' WHERE id=?", tk2); const sla = await (await import("../functions/_lib/os/support.js")).slaCheck(env); ok(sla.escalated === 1 && q1("SELECT escalated_at e FROM help_tickets WHERE id=?", tk2).e && q1("SELECT count(*) n FROM biz_notes WHERE user_id=? AND text LIKE 'Support SLA missed%'", uid("ops@fodo.co.in")).n === 1, "SLA breach escalates once to the Operations manager");
r = await O("support/queue", undefined, "pm"); ok(r.status === 200 && r.j.items.some((t) => t.id === tk2 && t.breached) && r.j.csat30 && r.j.csat30.n === 1, "support queue shows breached tickets and the CSAT average");
r = await O("support/queue", undefined, "buyer"); ok(r.status === 403, "clients cannot open the staff queue");

/* ---------- 7. Command Centre, Control Tower, search ---------- */
r = await O("command"); ok(r.status === 200 && r.j.items.length >= 3 && r.j.items.every((i) => i.what && i.severity && i.href && i.next), "Command Centre lists exceptions with what, severity, record link and next action");
ok(r.j.items.some((i) => i.kind === "invoice") && r.j.items.some((i) => i.kind === "task" && /overdue/.test(i.what)) && r.j.items.some((i) => i.kind === "ticket") && r.j.sections.business.finance && r.j.sections.business.finance.outstanding === 1000000, "overdue invoice, overdue task and SLA ticket surface; finance section for the owner");
r = await O("command", undefined, "pm"); ok(r.status === 200 && r.j.sections.business.finance === null && !r.j.items.some((i) => i.kind === "invoice"), "a PM gets the centre without finance figures or invoice items");
r = await O("command", undefined, "dev"); ok(r.status === 403, "designer has no analytics.view");
r = await O("tower"); ok(r.status === 200 && r.j.indicators.length >= 5 && r.j.indicators.every((i) => i.formula) && r.j.indicators.find((i) => i.name === "Project delivery").score != null && r.j.indicators.find((i) => /Sales/.test(i.name)).score === 100, "Control Tower: every indicator has a formula; sales = 1 won / 1 closed = 100");
const snap = await (await import("../functions/_lib/os/command.js")).snapshot(env); ok(snap.saved >= 5, "daily snapshot stored"); r = await O("tower"); ok(r.j.indicators[0].previous != null, "previous score comes from the snapshot");
r = await O("search?q=store", undefined, "pm"); ok(r.status === 200 && r.j.groups.some((g) => g.name === "Projects" && g.items.some((x) => x.id === pjW)), "global search finds the project by title");
r = await O("search?q=acme", undefined, "pm"); ok(r.j.groups.some((g) => g.name === "Clients"), "search finds clients"); r = await O("search?q=acme", undefined, "dev"); ok(!r.j.groups.some((g) => g.name === "Clients"), "the designer's search never returns clients (no permission)");
r = await O("search?q=FI-1", undefined, "fin"); ok(r.j.groups.some((g) => g.name === "Invoices"), "finance search finds invoices"); r = await O("search?q=FI-1", undefined, "pm"); ok(!r.j.groups.some((g) => g.name === "Invoices"), "PM search never returns invoices");

/* ---------- 8. jobs ---------- */
ok(HANDLERS.os_hourly && HANDLERS.os_daily, "OS job kinds registered"); const j1 = await enqueue(env, "os_hourly", {}, { key: "os_hourly:test" }); const ran = await runDue(env, 10); ok(ran.ran >= 1 && q1("SELECT status FROM biz_jobs WHERE id=?", j1.id).status === "done", "os_hourly runs through the queue and completes");
const j2 = await enqueue(env, "os_daily", {}, { key: "os_daily:test" }); await runDue(env, 10); ok(q1("SELECT status, result FROM biz_jobs WHERE id=?", j2.id).status === "done" && q1("SELECT count(*) n FROM os_health_log").n >= 2, "os_daily snapshot runs");

/* ---------- 9. router hygiene for the new routes ---------- */
ok(ROUTES.every((r) => r[2] === "self" || (r[2] && REGISTRY[r[2].resource] && REGISTRY[r[2].resource][r[2].action])), "every Phase 2 route declares a valid permission");
const ownerRoutes = []; for (const [rm, re, need] of ROUTES) if (rm === "GET" && need !== "self") { const p = String(re).replace(/^\/\^|\$\/$/g, "").replace(/\\\//g, "/"); if (!/\(/.test(p)) ownerRoutes.push(p); }
let ownerOk = 0, bad = []; for (const p of ownerRoutes) { const rr = await O(p); if (rr.status === 200) ownerOk++; else bad.push(p + ":" + rr.status); } ok(ownerOk === ownerRoutes.length, "OWNER_CAN_VIEW_ALL: owner GETs every list route (" + ownerOk + "/" + ownerRoutes.length + ")" + (bad.length ? " bad " + bad.join(",") : ""));
/* ---------- 10. UI wiring: every /api/os path the lazy module calls exists in the router; the views are registered ---------- */
{ const ui = fs.readFileSync(new URL("../js/ws-os.js", import.meta.url), "utf8"), ws = fs.readFileSync(new URL("../js/workspace.js", import.meta.url), "utf8");
  const paths = new Set(); for (const m of ui.matchAll(/oapi\("([a-z\-]+(?:\/[a-z\-]+)*)/g)) paths.add(m[1]); for (const m of ui.matchAll(/"([a-z\-]+)\/" \+ [a-zA-Z.]+ \+ "\/([a-z\-]+(?:\/[a-z\-]+)?)"/g)) paths.add(m[1] + "/x/" + m[2]);
  const routes = ROUTES.map((r) => r[1]); const missing = [...paths].filter((p) => !routes.some((re) => re.test(p) || re.test(p.replace(/\/x\//, "/abc123/")) || re.test(p + "/abc") || re.source.indexOf("^" + p.replace(/\//g, "\\/") + "\\/") === 0));
  ok(missing.length === 0, "ws-os.js calls only routes the OS router has" + (missing.length ? " (missing: " + missing.join(", ") + ")" : ""));
  ok(/ws-os\.js/.test(ws) && ["my-fodo", "tasks", "approvals", "work", "calendar", "workload", "os-projects", "os-project", "clients", "support", "command", "tower"].every((v) => ws.indexOf('"' + v + '"') > -1), "workspace.js registers all 12 OS views on the lazy module");
  ok(!/\bworker\b/i.test(ui) && !/—/.test(ui), "ws-os.js: no 'worker', no long dash in user-facing text");
  ok(/window\.FODO_WS_OS\s*=/.test(ui), "ws-os.js exposes window.FODO_WS_OS"); }
console.log(`\nv50.2: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
