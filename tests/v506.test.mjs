// v50.6 FODO OS V4 Phase 6: Workflow Studio, problem detection, decision journal, simulation, AI agent registry + kill switch,
// FODO Assistant (permission-aware, works without AI), Brain OS tools on the permission layer, jobs, navigation.
// Run: node --no-warnings tests/v506.test.mjs
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
import * as WF from "../functions/_lib/os/workflows.js";
import * as PB from "../functions/_lib/os/problems.js";
import * as AI from "../functions/_lib/os/ai.js";
import * as BT from "../functions/_lib/brain/tools.js";
import * as RP from "../functions/_lib/replay.js";
import * as PS from "../functions/_lib/os/pros.js";
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
await O("people", { email: "hr@fodo.co.in", name: "Hema HR", roles: ["hr_talent_manager"], department_id: dept("hr") }); await login("hr@fodo.co.in", null, "hr"); await O("me", undefined, "hr");
await O("people", { email: "ops@fodo.co.in", name: "Om Ops", roles: ["operations_manager"], department_id: dept("operations") }); await login("ops@fodo.co.in", null, "ops"); await O("me", undefined, "ops");
await O("departments/" + dept("operations"), { manager_user_id: uid("ops@fodo.co.in") });
const today = new Date().toISOString().slice(0, 10), plus = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
let r;
await O("people", { email: "smm@fodo.co.in", name: "Sana Social", roles: ["social_media_manager"], department_id: dept("marketing") }); await login("smm@fodo.co.in", null, "smm"); await O("me", undefined, "smm");
await O("people", { email: "perf@fodo.co.in", name: "Parth Perf", roles: ["performance_marketer"], department_id: dept("marketing") }); await login("perf@fodo.co.in", null, "perf"); await O("me", undefined, "perf");
await O("people", { email: "cd@fodo.co.in", name: "Cira Creative", roles: ["creative_director"], department_id: dept("creative") }); await login("cd@fodo.co.in", null, "cd"); await O("me", undefined, "cd");
const back = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const tasksCount = () => q1("SELECT count(*) n FROM biz_tasks").n;
const userRow = (e) => q1("SELECT id, email, name FROM acct_users WHERE email=?", e);

/* ---------- 1. registry, templates, navigation ---------- */
ok(REGISTRY.workflow && REGISTRY.workflow.manage.indexOf("team") < 0 && REGISTRY.agent.manage.join() === "all" && REGISTRY.decision, "registry: workflow (view team+, manage department+), decision, agent (manage: owner only)");
const T = (s) => TEMPLATES.find((t) => t.slug === s).perms; ok(T("operations_manager").indexOf("workflow.manage.organization") > -1 && T("finance_manager").indexOf("workflow.manage.department") > -1 && T("project_manager").indexOf("workflow.view.team") > -1 && T("designer").indexOf("decision.view.own") > -1, "templates: ops builds workflows org-wide, department leads for their department, managers see them");
r = await Z("me", undefined, "dev"); ok(r.j.nav.some((n) => n.id === "assistant") && r.j.nav.some((n) => n.id === "decisions") && !r.j.nav.some((n) => n.id === "automation" || n.id === "problems" || n.id === "ai-agents"), "designer: Assistant and Decisions, no Workflow Studio, Problems or AI agents");
r = await Z("me", undefined, "pm"); ok(r.j.nav.some((n) => n.id === "problems") && r.j.nav.some((n) => n.id === "automation"), "PM: Problems and Workflow Studio (view)");
r = await Z("me", undefined, "own"); ok(["problems", "decisions", "ai-agents", "automation", "assistant"].every((id) => r.j.nav.some((n) => n.id === id)) && r.j.os.groups.find((g) => g.id === "command").items.some((n) => n.id === "problems"), "owner: all Phase 6 entries; Problems in Command");
r = await Z("me", undefined, "c"); ok(!r.j.nav.some((n) => ["assistant", "decisions", "problems", "automation"].indexOf(n.id) > -1), "client sidebar unchanged");

/* ---------- 2. Workflow Studio ---------- */
const wfDef = { name: "Big expense: finance check", trigger_kind: "event", trigger_event: "expense.submitted", conditions: [{ field: "payload.amount", op: "gt", value: "25000" }], actions: [{ type: "create_task", params: { title: "Check big expense ₹{{payload.amount}} ({{payload.category}})", assignee: "role:finance_manager", due_in_days: "2", priority: "high" } }, { type: "notify", params: { to: "manager", text: "{{actor.name}} claimed ₹{{payload.amount}}", urgency: "action" } }] };
r = await O("workflows", wfDef, "pm"); ok(r.status === 403, "a PM (team view) cannot build workflows");
r = await O("workflows", Object.assign({}, wfDef, { actions: [{ type: "send_payout", params: {} }] }), "ops"); ok(r.status === 400 && /Unknown action/.test(r.j.reason), "only registered internal actions (no payouts, mail or webhooks)");
r = await O("workflows", Object.assign({}, wfDef, { trigger_event: "anything.happens" }), "ops"); ok(r.status === 400, "only listed triggers");
r = await O("workflows", Object.assign({}, wfDef, { actions: [{ type: "comment_task", params: { text: "x" } }] }), "ops"); ok(r.status === 400, "comment-on-task only on task events");
r = await O("workflows", Object.assign({}, wfDef, { conditions: [{ field: "require('x')", op: "eq", value: "1" }] }), "ops"); ok(r.status === 400, "condition fields are plain paths");
r = await O("workflows", wfDef, "ops"); ok(r.status === 200 && r.j.version === 1 && q1("SELECT status FROM os_workflows WHERE id=?", r.j.id).status === "draft", "operations creates the workflow as a draft"); const wf1 = r.j.id;
const n0 = tasksCount(); r = await O("workflows/" + wf1 + "/test", { payload: { amount: 30000, category: "venue" } }, "ops"); ok(r.status === 200 && r.j.matched && r.j.would.length === 2 && /Check big expense ₹30000 \(venue\)/.test(r.j.would[0].would) && tasksCount() === n0, "test run: conditions match, actions rendered, nothing created");
r = await O("workflows/" + wf1 + "/test", { payload: { amount: 100 } }, "ops"); ok(r.j.matched === false && r.j.would.length === 0, "test run: a small expense does not match");
qr("INSERT INTO os_members (id, org_id, user_id, email, name, kind, status, created_at) SELECT 'mX', org_id, NULL, 'x@x', 'x', 'employee', 'invited', created_at FROM os_members LIMIT 1");
r = await O("expenses", { amount: 30000, category: "venue", note: "before activation" }, "dev"); ok(tasksCount() === n0, "a draft workflow does not run");
r = await O("workflows/" + wf1 + "/status", { status: "active" }, "ops"); ok(r.status === 200 && r.j.run_as === "ops@fodo.co.in" && q1("SELECT 1 x FROM os_audit WHERE action='WORKFLOW_ACTIVE'"), "activated; it runs as the person who activated it; audited");
r = await O("expenses", { amount: 42000, category: "talent", note: "model fee" }, "dev"); const tk = q1("SELECT title, assignee_user_id a, priority FROM biz_tasks WHERE title LIKE 'Check big expense%'"); ok(tk && tk.title === "Check big expense ₹42000 (talent)" && tk.a === uid("fin@fodo.co.in") && tk.priority === "high", "a ₹42,000 claim creates the finance task with the rendered title");
ok(q1("SELECT 1 x FROM biz_notes WHERE user_id=? AND text LIKE 'Dev Designer claimed ₹42000%'", uid("pm@fodo.co.in")), "and notifies the claimant's manager");
let runs = qa("SELECT status FROM os_workflow_runs WHERE workflow_id=? AND status<>'test'", wf1); ok(runs.length === 1 && runs[0].status === "done", "one run logged as done");
await O("expenses", { amount: 1200, category: "travel" }, "dev"); ok(qa("SELECT id FROM os_workflow_runs WHERE workflow_id=? AND status<>'test'", wf1).length === 1, "a small claim does not run it");
r = await O("workflows", Object.assign({ id: wf1 }, wfDef, { max_runs_per_hour: 1 }), "ops"); ok(r.status === 200 && r.j.version === 2 && /pause/.test(r.j.note) && q1("SELECT status FROM os_workflows WHERE id=?", wf1).status === "paused", "editing an active workflow bumps the version and pauses it");
await O("workflows/" + wf1 + "/status", { status: "active" }, "ops"); await O("expenses", { amount: 50000, category: "venue" }, "dev"); ok(qa("SELECT status FROM os_workflow_runs WHERE workflow_id=? AND status='skipped'", wf1).length === 1, "rate limit: over the hourly cap a run is skipped and logged");
r = await O("workflows/" + wf1, undefined, "pm"); ok(r.status === 200 && r.j.runs.length >= 3 && !r.j.canManage, "a PM can read a workflow and its runs");
r = await O("workflows/" + wf1, undefined, "dev"); ok(r.status === 403, "a designer cannot");

const wf2 = (await O("workflows", { name: "Urgent ticket needs owner OK", trigger_kind: "event", trigger_event: "ticket.created", conditions: [{ field: "payload.priority", op: "eq", value: "urgent" }], actions: [{ type: "notify", params: { to: "role:operations_manager", text: "Urgent: {{payload.subject}}", urgency: "urgent" } }], approval_required: true }, "ops")).j.id;
r = await O("workflows/" + wf2 + "/status", { status: "active" }, "ops"); ok(r.status === 409, "an approval step needs an approver before activation");
await O("workflows", { id: wf2, name: "Urgent ticket needs owner OK", trigger_kind: "event", trigger_event: "ticket.created", conditions: [{ field: "payload.priority", op: "eq", value: "urgent" }], actions: [{ type: "notify", params: { to: "role:operations_manager", text: "Urgent: {{payload.subject}}", urgency: "urgent" } }], approval_required: true, approver_user_id: uid("anmol@fodo.co.in") }, "ops"); await O("workflows/" + wf2 + "/status", { status: "active" }, "ops");
await O("support", { subject: "Site down", category: "Bug / something broken", priority: "urgent", text: "Our site is down" }, "c"); let wr = q1("SELECT * FROM os_workflow_runs WHERE workflow_id=? ORDER BY created_at DESC LIMIT 1", wf2); ok(wr && wr.status === "waiting_approval" && wr.approval_id && !q1("SELECT 1 x FROM biz_notes WHERE user_id=? AND text='Urgent: Site down'", uid("ops@fodo.co.in")), "with an approval step the run waits; nothing is sent yet");
r = await O("approvals/" + wr.approval_id + "/decide", { decision: "approve" }, "own"); wr = q1("SELECT status FROM os_workflow_runs WHERE id=?", wr.id); ok(r.status === 200 && wr.status === "done" && q1("SELECT 1 x FROM biz_notes WHERE user_id=? AND text='Urgent: Site down'", uid("ops@fodo.co.in")), "the owner approves; the run continues and notifies operations");
await O("support", { subject: "Login broken", category: "Bug / something broken", priority: "urgent", text: "Cannot log in" }, "c"); wr = q1("SELECT * FROM os_workflow_runs WHERE workflow_id=? ORDER BY created_at DESC LIMIT 1", wf2); await O("approvals/" + wr.approval_id + "/decide", { decision: "reject", note: "Handled by phone" }, "own"); ok(q1("SELECT status FROM os_workflow_runs WHERE id=?", wr.id).status === "rejected" && !q1("SELECT 1 x FROM biz_notes WHERE user_id=? AND text='Urgent: Login broken'", uid("ops@fodo.co.in")), "rejected: the run stops");

const wf3 = (await O("workflows", { name: "Loop test", trigger_kind: "event", trigger_event: "task.created", conditions: [], actions: [{ type: "create_task", params: { title: "Follow-up for {{payload.title}}", assignee: "me" } }] }, "ops")).j.id; await O("workflows/" + wf3 + "/status", { status: "active" }, "ops");
const n1 = tasksCount(); await O("tasks", { title: "Seed task" }, "ops"); ok(tasksCount() === n1 + 2 && q1("SELECT 1 x FROM biz_tasks WHERE title='Follow-up for Seed task'"), "a workflow's own task does not trigger workflows again (no loops)");
await O("workflows/" + wf3 + "/status", { status: "paused" }, "ops");
const wf4 = (await O("workflows", { name: "Hourly check", trigger_kind: "schedule", schedule: "hourly", actions: [{ type: "create_task", params: { title: "Hourly check", assignee: "me" } }] }, "ops")).j.id; await O("workflows/" + wf4 + "/status", { status: "active" }, "ops");
let sr = await WF.runScheduled(env, "hourly"); ok(sr.ran >= 1 && q1("SELECT count(*) n FROM biz_tasks WHERE title='Hourly check'").n === 1, "a scheduled workflow runs on its schedule"); sr = await WF.runScheduled(env, "hourly"); ok(q1("SELECT count(*) n FROM biz_tasks WHERE title='Hourly check'").n === 1, "and once per period");
ok(/runScheduled\(env, "hourly"\)/.test(fs.readFileSync(new URL("../functions/_lib/jobs.js", import.meta.url), "utf8")) && /runScheduled\(env, "daily"\)/.test(fs.readFileSync(new URL("../functions/_lib/jobs.js", import.meta.url), "utf8")), "hourly and daily OS jobs run schedules");
qr("UPDATE os_workflows SET run_as_user_id=? WHERE id=?", uid("dev@fodo.co.in"), wf1); qr("UPDATE os_workflows SET max_runs_per_hour=50 WHERE id=?", wf1); await O("expenses", { amount: 33000, category: "venue" }, "pm"); ok(q1("SELECT status FROM os_workflows WHERE id=?", wf1).status === "paused" && q1("SELECT status FROM os_workflow_runs WHERE workflow_id=? ORDER BY created_at DESC LIMIT 1", wf1).status === "failed", "if the run-as person loses workflow rights, the run fails and the workflow pauses");
r = await O("workflows", undefined, "ops"); ok(r.j.templates.length === 5 && r.j.catalogue.actions.length === 5 && r.j.catalogue.triggers.length > 20, "catalogue of triggers, actions and 5 starter templates");
r = await O("workflows/install", { key: "weekly_review" }, "ops"); ok(r.status === 200 && q1("SELECT status, schedule FROM os_workflows WHERE id=?", r.j.id).schedule === "weekly", "a template installs as a draft");

/* ---------- 3. problems ---------- */
const pj = (await O("projects", { title: "Late project", type: "custom", owner_user_id: uid("pm@fodo.co.in"), due: back(3) }, "pm")).j; qr("UPDATE biz_projects SET lifecycle='active' WHERE id=?", pj.id);
for (const t of ["A", "B", "C"]) await O("tasks", { title: "Late " + t, project_id: pj.id, assignee_user_id: uid("dev@fodo.co.in"), due: back(2) }, "pm");
qr("UPDATE os_approvals SET deadline=? WHERE status='pending'", back(1)); await O("approvals", { kind: "budget", title: "Old approval", approver_user_id: uid("pm@fodo.co.in"), deadline: back(1) }, "dev").catch(() => {}); qr("UPDATE os_approvals SET deadline=? WHERE title='Old approval'", back(1));
qr("UPDATE help_tickets SET sla_due=? WHERE subject='Site down'", new Date(Date.now() - 3600e3).toISOString());
let sc = await PB.scan(env); ok(sc.found >= 4 && sc.opened >= 4, "scan finds problems from real rows (" + sc.found + ")");
r = await O("problems", undefined, "ops"); const P1 = (rule) => r.j.items.find((x) => x.rule === rule); ok(r.status === 200 && P1("project_overdue_tasks") && P1("project_overdue_tasks").owner === "Priya PM" && P1("project_past_due") && P1("sla_breach") && P1("sla_breach").severity === "critical" && P1("approval_overdue"), "problems: overdue tasks, past deadline, SLA breach (critical for urgent), approval overdue; owners set");
ok(r.j.items[0].severity === "critical" && r.j.counts.critical >= 1 && P1("project_overdue_tasks").fix && P1("project_overdue_tasks").href, "sorted by severity, each with a fix and a link");
ok(q1("SELECT 1 x FROM biz_notes WHERE user_id=? AND text LIKE 'Problem: Late project is past its deadline%'", uid("pm@fodo.co.in")), "the owner of a new high problem is notified");
sc = await PB.scan(env); ok(sc.opened === 0 && q1("SELECT count(*) n FROM os_problems WHERE rule='project_overdue_tasks'").n === 1, "a second scan does not duplicate");
r = await O("problems", undefined, "pm"); ok(r.status === 200 && r.j.items.every((x) => !x.owner_user_id || x.owner_user_id === uid("pm@fodo.co.in") || x.owner_user_id === uid("dev@fodo.co.in")), "a PM sees problems owned by them or their team");
r = await O("problems", undefined, "dev"); ok(r.status === 403, "a designer has no problems list");
const pid = q1("SELECT id FROM os_problems WHERE rule='project_overdue_tasks'").id;
r = await O("problems/" + pid, { action: "resolve" }, "pm"); ok(r.status === 400, "resolving needs a note");
r = await O("problems/" + pid, { action: "acknowledge", note: "Re-planning today" }, "pm"); ok(r.status === 200 && q1("SELECT status FROM os_problems WHERE id=?", pid).status === "acknowledged", "owner acknowledges");
r = await O("problems/" + pid, { action: "assign", user_id: uid("ops@fodo.co.in") }, "ops"); ok(r.status === 200 && q1("SELECT 1 x FROM biz_notes WHERE user_id=? AND text LIKE 'Problem assigned to you%'", uid("ops@fodo.co.in")), "a lead re-assigns it");
qr("UPDATE biz_tasks SET status='done' WHERE title LIKE 'Late %'"); sc = await PB.scan(env); ok(sc.cleared >= 1 && q1("SELECT status FROM os_problems WHERE id=?", pid).status === "resolved", "when the tasks are done the next scan clears it automatically");
r = await O("problems/scan", {}, "pm"); ok(r.status === 403, "team scope cannot force a scan"); r = await O("problems/scan", {}, "ops"); ok(r.status === 200 && r.j.at, "operations can");
ok(/PB\.scan\(env\)/.test(fs.readFileSync(new URL("../functions/_lib/jobs.js", import.meta.url), "utf8")), "the daily job runs the scan");

/* ---------- 4. decision journal ---------- */
r = await O("decisions", { title: "Move to retainers", decision: "Offer 3 retainer tiers from December", visibility: "leadership" }, "ops"); ok(r.status === 400 && /why/.test(r.j.reason), "a decision needs its rationale");
r = await O("decisions", { title: "Move to retainers", decision: "Offer 3 retainer tiers from December", rationale: "Smoother cash, 60% of clients are repeat", visibility: "leadership" }, "ops"); ok(r.status === 400 && /look back/.test(r.j.reason), "and a review date");
r = await O("decisions", { title: "Move to retainers", context: "Project revenue swings month to month.", options: [{ name: "Retainers", pros: "steady", cons: "less flexible" }, { name: "Stay project-based" }], decision: "Offer 3 retainer tiers from December", rationale: "Smoother cash, 60% of clients are repeat", expected: "Retainers are 40% of revenue by March", review_on: back(1), visibility: "leadership" }, "ops"); ok(r.status === 200 && r.j.status === "decided", "operations records a leadership decision"); const dc1 = r.j.id;
r = await O("decisions", { title: "Which stock site?", visibility: "private" }, "dev"); ok(r.status === 200 && r.j.status === "open", "a designer records an open private question"); const dc2 = r.j.id;
r = await O("decisions", { title: "Team lunch Fridays", decision: "Yes, from next week", rationale: "Team asked", review_on: plus(60), visibility: "team" }, "ops"); const dc3 = r.j.id;
r = await O("decisions", undefined, "dev"); ok(r.j.items.some((x) => x.id === dc2) && r.j.items.some((x) => x.id === dc3) && !r.j.items.some((x) => x.id === dc1), "a designer sees their own and team decisions, not leadership ones");
r = await O("decisions", undefined, "cd"); ok(r.j.items.some((x) => x.id === dc1) && !r.j.items.some((x) => x.id === dc2), "a department lead sees leadership decisions, not someone's private ones");
r = await O("decisions/" + dc1, undefined, "dev"); ok(r.status === 404, "a hidden decision cannot be opened");
r = await O("decisions", { id: dc1, title: "Move to retainers", decision: "Something else", rationale: "x", review_on: plus(5) }, "ops"); ok(r.status === 409, "a recorded decision cannot be rewritten (mark it reversed and record a new one)");
const dr = await (await import("../functions/_lib/os/decide.js")).reminders(env); ok(dr.reminded >= 1 && q1("SELECT 1 x FROM biz_notes WHERE user_id=? AND text LIKE 'Time to review the decision: Move to retainers'", uid("ops@fodo.co.in")), "a due review reminds its owner");
r = await O("decisions/" + dc1 + "/review", { outcome: "better", note: "x" }, "ops"); ok(r.status === 400, "a review needs what happened");
r = await O("decisions/" + dc1 + "/review", { outcome: "too_early", note: "Only two retainers signed so far." }, "ops"); ok(r.status === 200 && q1("SELECT status, review_on FROM os_decisions WHERE id=?", dc1).status === "decided" && q1("SELECT review_on r FROM os_decisions WHERE id=?", dc1).r > new Date().toISOString().slice(0, 10), "too early: stays decided with a later review date");
r = await O("decisions/" + dc1 + "/review", { outcome: "better", note: "Retainers reached 45% of revenue." }, "cd"); ok(r.status === 403, "only the owner reviews it");
r = await O("decisions/" + dc1 + "/review", { outcome: "better", note: "Retainers reached 45% of revenue in February." }, "ops"); ok(r.status === 200 && q1("SELECT status FROM os_decisions WHERE id=?", dc1).status === "reviewed", "reviewed with the real outcome");

/* ---------- 5. simulation ---------- */
r = await O("simulate", { kind: "discount", discount_pct: 10, monthly_revenue: 100000, margin_pct: 40 }, "dev"); ok(r.status === 403, "simulations need finance access");
r = await O("simulate", { kind: "discount", discount_pct: 10, monthly_revenue: 100000, margin_pct: 40 }, "fin"); ok(r.status === 200 && r.j.result.gross_profit_before === 40000 && r.j.result.gross_profit_after === 30000 && r.j.result.uplift_needed_to_break_even_pct === 33.3 && r.j.formulas.length === 3 && /not a forecast/.test(r.j.label), "discount: 10% off at 40% margin loses ₹10,000 gross profit; needs 33.3% more volume; formulas shown");
r = await O("simulate", { kind: "discount", discount_pct: 50, monthly_revenue: 100000, margin_pct: 40 }, "fin"); ok(r.j.result.uplift_needed_to_break_even_pct === null && /loses money/.test(r.j.note), "a discount above the margin is flagged");
r = await O("simulate", { kind: "price", change_pct: 10, monthly_revenue: 100000, margin_pct: 40 }, "fin"); ok(r.j.result.volume_you_can_lose_before_revenue_falls_pct === 9.1 && r.j.result.volume_you_can_lose_before_profit_falls_pct === 20 && r.j.result.revenue_after === 110000, "price +10%: can lose 9.1% volume before revenue falls, 20% before profit falls");
r = await O("simulate", { kind: "hire", monthly_cost: 60000, hours_per_week: 40, monthly_revenue: 300000, margin_pct: 30, department_id: dept("design") }, "fin"); ok(r.status === 200 && r.j.result.break_even_extra_revenue === 200000 && r.j.result.added_capacity_hours_month === 173 && r.j.result.utilisation && r.j.result.utilisation.after_pct <= (r.j.result.utilisation.before_pct || 0) && r.j.result.months.length === 6, "hire: break-even extra revenue = cost / margin; capacity and department load before/after");
r = await O("simulate", { kind: "hire" }, "fin"); ok(r.status === 400, "a hire needs its monthly cost"); r = await O("simulate", { kind: "magic" }, "fin"); ok(r.status === 400, "unknown kind refused");
r = await O("simulate/baseline", undefined, "fin"); ok(r.status === 200 && r.j.window === "last 3 months" && typeof r.j.monthly_revenue === "number", "baseline from FODO's own numbers, with its window");

/* ---------- 6. AI registry + kill switch ---------- */
r = await O("ai/agents", undefined, "fin"); ok(r.status === 403, "only owners see the AI registry");
r = await O("ai/agents", undefined, "own"); ok(r.status === 200 && r.j.items.length === 4 && r.j.items.find((a) => a.id === "assistant").usage && r.j.items.find((a) => a.id === "brain").usage_note && r.j.kill === false && r.j.ai_bound === false, "registry: 4 agents, real usage for the Assistant, others point to their own logs; AI not bound in tests");
r = await O("ai/kill", { on: true }, "own"); ok(r.status === 400, "switching AI off needs a reason");

/* ---------- 7. FODO Assistant ---------- */
const late = await O("tasks", { title: "Overdue banner", assignee_user_id: uid("dev@fodo.co.in"), due: back(2) }, "pm");
r = await O("assistant", { q: "what is overdue?" }, "dev"); ok(r.status === 200 && r.j.intent === "overdue" && r.j.items.some((x) => x.title === "Overdue banner") && r.j.used_ai === false && /not bound/.test(r.j.ai_note), "assistant answers from the person's own data without AI, and says AI is not bound");
r = await O("assistant", { q: "aaj kya karna hai" }, "dev"); ok(r.j.intent === "my_work" && /overdue/.test(r.j.answer), "Hinglish works (rule-based)");
r = await O("assistant", { q: "invoices outstanding" }, "dev"); ok(r.j.refused && !/₹/.test(r.j.answer), "a designer asking about invoices is told it is finance-only (no numbers leak)");
r = await O("assistant", { q: "invoices outstanding" }, "fin"); ok(r.j.intent === "receivables" && /Outstanding ₹/.test(r.j.answer) && r.j.items.length >= 0, "finance gets the receivables answer");
r = await O("assistant", { q: "status of the Late project" }, "pm"); ok(r.j.intent === "project" && /Late project/.test(r.j.answer), "project status by name");
r = await O("assistant", { q: "status of the Late project" }, "cd"); ok(r.j.items.length === 0, "someone outside the project finds nothing");
r = await O("assistant", { q: "my leave balance" }, "dev"); ok(r.j.intent === "leave" && /casual/.test(r.j.answer), "leave balance");
r = await O("assistant", { q: "approvals waiting for me" }, "pm"); ok(r.j.intent === "approvals", "approvals");
r = await O("assistant", { q: "tell me a joke" }, "dev"); ok(r.j.intent === "unknown" && /tasks, approvals/.test(r.j.answer), "unknown questions get the list of what it can answer");
ok(q1("SELECT count(*) n FROM os_ai_calls WHERE agent='assistant'").n >= 9, "every question is logged for the registry");
env.AI = { run: async (m, x) => ({ response: "Aapke 1 kaam overdue hain: Overdue banner." }) };
r = await O("assistant", { q: "what is overdue?" }, "dev"); ok(r.j.used_ai === true && /Overdue banner/.test(r.j.answer) && r.j.plain, "with Workers AI bound the answer is rephrased from the same facts (plain answer kept)");
r = await O("ai/kill", { on: true, reason: "Testing the switch" }, "own"); ok(r.status === 200 && r.j.kill, "owner switches all AI off");
r = await O("assistant", { q: "what is overdue?" }, "dev"); ok(r.j.used_ai === false && /switched off/.test(r.j.ai_note) && r.j.items.length >= 1, "kill switch: answers still come, without AI");
await O("ai/kill", { on: false }, "own"); r = await O("ai/agents/assistant", { status: "paused", owner_note: "pause" }, "own"); ok(r.status === 200, "owner pauses the Assistant's AI");
r = await O("assistant", { q: "what is overdue?" }, "dev"); ok(r.j.used_ai === false && /paused/.test(r.j.ai_note), "paused agent: no AI");
await O("ai/agents/assistant", { status: "active", monthly_call_limit: 1 }, "own"); r = await O("assistant", { q: "what is overdue?" }, "dev"); ok(r.j.used_ai === false && /limit/.test(r.j.ai_note), "monthly AI limit reached: no AI");
r = await O("ai/agents/assistant", { status: "active" }, "fin"); ok(r.status === 403, "only an owner changes agents"); delete env.AI;
r = await O("assistant", { q: "what is overdue?" }, "c"); ok(r.status === 403 || (r.j.items || []).length === 0, "a client cannot use the team assistant for team data");

/* ---------- 8. Brain OS tools on the permission layer ---------- */
const bc = (email) => ({ env, owner: userRow(email), settings: {} });
let bt = await BT.execute(bc("dev@fodo.co.in"), "os_finance_overview", {}); ok(bt.ok === false && bt.refused && /finance\.view\.department/.test(bt.error), "Brain tool refused when the person lacks the OS permission");
bt = await BT.execute(bc("fin@fodo.co.in"), "os_finance_overview", {}); ok(bt.ok === true && bt.result && bt.result.receivables, "allowed for finance");
bt = await BT.execute(bc("anmol@fodo.co.in"), "os_problems", {}); ok(bt.ok === true && Array.isArray(bt.result), "owner reads problems through the Brain");
bt = await BT.execute(bc("anmol@fodo.co.in"), "os_create_task", { title: "Brain-made task", assignee_email: "dev@fodo.co.in" }); ok(bt.ok === true && q1("SELECT assignee_user_id a FROM biz_tasks WHERE title='Brain-made task'").a === uid("dev@fodo.co.in"), "a low-risk OS action through the Brain creates the task");
bt = await BT.execute(bc("anmol@fodo.co.in"), "os_simulate", { kind: "price", change_pct: 5, monthly_revenue: 100000, margin_pct: 30 }); ok(bt.ok === true && bt.result.result.revenue_after === 105000, "simulation through the Brain");
ok(Object.keys(BT.TOOLS).filter((k) => /^os_/.test(k)).every((k) => BT.TOOLS[k].os && BT.TOOLS[k].level <= 1), "every OS Brain tool declares its OS permission and is read or low-risk (nothing moves money)");

/* ---------- 9. router hygiene + UI wiring ---------- */
ok(ROUTES.every((x) => x[2] === "self" || (x[2] && REGISTRY[x[2].resource] && REGISTRY[x[2].resource][x[2].action])), "every route declares a valid permission"); ok(ROUTES.filter((x) => x[2] === "self").length <= 8, "no more than 8 self routes");
{ const ui = fs.readFileSync(new URL("../js/ws-os.js", import.meta.url), "utf8"); const paths = new Set(); for (const m of ui.matchAll(/oapi\("([a-z\-]+(?:\/[a-z\-]+)*)/g)) paths.add(m[1]); for (const m of ui.matchAll(/"([a-z\-]+(?:\/[a-z\-]+)?)\/" \+ [a-zA-Z.]+ \+ "\/([a-z\-]+(?:\/[a-z\-]+)?)"/g)) paths.add(m[1] + "/x/" + m[2]); const routes = ROUTES.map((x) => x[1]); const missing = [...paths].filter((p) => !routes.some((re) => re.test(p) || re.test(p.replace(/\/x\//, "/abc123/")) || re.test(p + "/abc") || re.source.indexOf("^" + p.replace(/\//g, "\\/") + "\\/") === 0)); ok(missing.length === 0, "ws-os.js calls only routes the router has" + (missing.length ? ": " + missing.join(", ") : "")); ok(["automation: automation", "problems: problems", "decisions: decisions", "assistant: assistant", '"ai-agents": aiAgents'].every((k) => ui.indexOf(k) > -1), "ws-os.js renders the five Phase 6 views"); ok(!/\bworker\b/i.test(ui) && !/—/.test(ui), "no 'worker', no long dash"); }
console.log(`\nv50.6: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
