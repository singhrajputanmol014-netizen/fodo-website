// v50.8 FODO OS V4 Phase 8: security matrix (every /api/os route × every role: deny by default, never a 500, no secret in any
// response), negative cases, performance at scale (10,000 projects / 50,000 tasks), query plans, release hygiene.
// Run: node --no-warnings tests/v508.test.mjs
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
import * as PC from "../functions/_lib/os/procure.js";
import * as PL from "../functions/_lib/os/platform.js";
import * as KB from "../functions/_lib/os/kb.js";
import * as DO from "../functions/_lib/os/docs.js";
import * as CP from "../functions/_lib/os/comply.js";
import { syncTemplates } from "../functions/_lib/os/db.js";
import * as MON from "../functions/_lib/os/monitor.js";
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
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
await O("people", { email: "view@fodo.co.in", name: "Vik Viewer", roles: ["viewer"], department_id: dept("management") }); await login("view@fodo.co.in", null, "vw"); await O("me", undefined, "vw");
await O("people", { email: "devop@fodo.co.in", name: "Dina Dev", roles: ["developer"], department_id: dept("technology") }); await login("devop@fodo.co.in", null, "tech"); await O("me", undefined, "tech");
const ROLES = { own: "anmol@fodo.co.in", ops: "ops@fodo.co.in", pm: "pm@fodo.co.in", dev: "dev@fodo.co.in", fin: "fin@fodo.co.in", hr: "hr@fodo.co.in", smm: "smm@fodo.co.in", cd: "cd@fodo.co.in", vw: "view@fodo.co.in", tech: "devop@fodo.co.in", c: "client@biz.in" };
const P0 = {}; for (const k of Object.keys(ROLES)) P0[k] = await Pof(ROLES[k]);
/* a concrete path for a route regex: capture groups become a harmless id that does not exist */
function sample(re) { let s = re.source.replace(/^\^/, "").replace(/\$$/, ""); s = s.replace(/\((?!\?)([^()]*)\)/g, (m, g) => (/\|/.test(g) && !/[\[\\]/.test(g) ? g.split("|")[0] : "zznope")).replace(/\(\?:[^()]*\)\??/g, "").replace(/\\\//g, "/").replace(/\\\./g, ".").replace(/\\-/g, "-"); return re.test(s) ? s : null; }

/* ---------- 1. security matrix: GET ---------- */
{ const rows = ROUTES.filter((x) => x[0] === "GET"); let samples = 0, five = [], leak = [], wrong = [], narrowed = 0, cells = 0;
  for (const [, re, need, ] of rows) { const pth = sample(re); if (!pth) continue; samples++;
    for (const k of Object.keys(ROLES)) { const res = await O(pth, undefined, k); cells++;
      if (res.status >= 500) five.push(k + " " + pth + " " + res.status + " " + (res.j && res.j.reason));
      if (need !== "self" && !allows(P0[k], need.resource, need.action) && res.status !== 403) wrong.push(k + " " + pth + " → " + res.status);
      if (need !== "self" && allows(P0[k], need.resource, need.action) && res.status === 403) narrowed++;
      if (/re_test|vis-key|PAYOUT_ENC/.test(res.t)) leak.push(k + " " + pth); } }
  ok(samples === rows.length, "matrix: a sample path for every GET route (" + samples + "/" + rows.length + ")");
  ok(!five.length, "matrix: " + cells + " GET calls (every route × 11 roles), never a 5xx" + (five.length ? ": " + five.slice(0, 5).join(" | ") : ""));
  ok(!wrong.length, "matrix: every GET without the route's permission answers 403 (deny by default)" + (wrong.length ? ": " + wrong.slice(0, 6).join(" | ") : ""));
  ok(!leak.length, "matrix: no secret value appears in any response" + (leak.length ? ": " + leak.slice(0, 4).join(", ") : ""));
  console.log("info: " + narrowed + " GET calls had the route permission but were narrowed to 403 by the module (object or scope checks)"); }

/* ---------- 2. security matrix: POST without permission is refused before anything runs ---------- */
{ const rows = ROUTES.filter((x) => x[0] === "POST" && x[2] !== "self"); let five = [], wrong = [], cells = 0; const before = q1("SELECT count(*) n FROM os_audit").n;
  for (const k of ["dev", "c", "vw", "smm", "tech"]) for (const [, re, need] of rows) { if (allows(P0[k], need.resource, need.action)) continue; const pth = sample(re); if (!pth) continue; const res = await O(pth, {}, k); cells++; if (res.status >= 500) five.push(k + " " + pth); if (res.status !== 403) wrong.push(k + " " + pth + " → " + res.status); }
  ok(cells > 300 && !wrong.length && !five.length, "matrix: " + cells + " POST calls without the permission all answer 403" + (wrong.length ? ": " + wrong.slice(0, 6).join(" | ") : ""));
  ok(q1("SELECT count(*) n FROM os_audit").n === before, "matrix: refused writes leave no trace (nothing ran)"); }
ok(ROUTES.filter((x) => x[2] === "self").length <= 8 && ROUTES.every((x) => x[2] === "self" || (REGISTRY[x[2].resource] && REGISTRY[x[2].resource][x[2].action])), "every route declares a valid permission; at most 8 self routes");
{ const seen = new Set(), dup = []; for (const [m, re] of ROUTES) { const k = m + " " + re.source; if (seen.has(k)) dup.push(k); seen.add(k); } ok(!dup.length, "no duplicate routes" + (dup.length ? ": " + dup.join(", ") : "")); }

/* ---------- 3. negative cases ---------- */
r = await call("os/me", undefined, { as: "nobody" }); ok(r.status === 401, "no session → 401");
r = await call("os/tasks", { title: "x" }, { as: "own", headers: { origin: "https://evil.example" } }); ok(r.status === 403, "cross-origin write → 403 (CSRF)");
{ const req = new Request(SITE + "/api/os/tasks", { method: "POST", headers: { origin: SITE, "content-type": "text/plain", cookie: jars.own }, body: "{}" }); const res = await osApi({ request: req, env, params: { path: ["tasks"] } }); ok(res.status === 403, "non-JSON write → 403"); }
r = await O("tasks", { title: "Shared task", assignee_user_id: uid("dev@fodo.co.in") }, "pm"); const TID = (r.j.task || {}).id;
r = await O("tasks/" + TID, undefined, "smm"); ok(r.status === 403 || r.status === 404, "a colleague outside the task's team cannot read it");
r = await Z("projects", { title: "Client A project", type: "website" }, "c"); const PA = (r.j.project || r.j).id;
r = await O("projects/" + PA, undefined, "o"); ok(r.status === 403 || r.status === 404, "tenant isolation: another client cannot open client A's project");
r = await O("tasks", undefined, "o"); ok(r.status === 200 ? !JSON.stringify(r.j).includes(PA) : r.status === 403, "tenant isolation: another client's task list has nothing of client A");
r = await O("view-as", { user: uid("dev@fodo.co.in"), reason: "checking the designer view" }, "own"); r = await O("tasks", { title: "should not save" }, "own"); ok(r.status === 403 && /read-only/.test(r.j.reason), "view-as: writes refused"); await O("view-as/stop", {}, "own");
r = await O("people/" + mem("smm@fodo.co.in").id + "/status", { status: "suspended", reason: "security test" }, "own"); r = await O("tasks", undefined, "smm"); ok(r.status === 403 || r.status === 401, "suspended member is refused"); await O("people/" + mem("smm@fodo.co.in").id + "/status", { status: "active", reason: "test over" }, "own");
r = await call("test-login", { email: "x@y.in" }, { as: "z" }); ok(r.status === 200, "(test mode on in tests: test-login works)"); { const e2 = Object.assign({}, env, { XRAY_TEST_MODE: "0" }); const req = new Request(SITE + "/api/account/test-login", { method: "POST", headers: { origin: SITE, "content-type": "application/json" }, body: JSON.stringify({ email: "x@y.in" }) }); const res = await account({ request: req, env: e2, params: { path: ["test-login"] } }); ok(res.status >= 400, "test-login is closed when test mode is off (production)"); }
{ const src = ["functions/_lib/os", "js"].map((d) => fs.readdirSync(new URL("../" + d + "/", import.meta.url)).filter((f) => f.endsWith(".js")).map((f) => d + "/" + f)).flat(); const bad = src.filter((f) => /(sk_live_|re_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA )?PRIVATE)/.test(fs.readFileSync(new URL("../" + f, import.meta.url), "utf8"))); ok(!bad.length, "no API keys in the code (" + src.length + " files)" + (bad.length ? ": " + bad.join(", ") : "")); }

/* ---------- 4. performance at scale: 10,000 projects, 50,000 tasks, 200 people ---------- */
{ const db = env.XRAY_DB.db, t0 = Date.now(), now = new Date().toISOString(), depts = qa("SELECT id FROM os_departments").map((x) => x.id), role = q1("SELECT id FROM os_roles WHERE slug='designer'").id, members = [];
  db.exec("BEGIN");
  const iu = db.prepare("INSERT INTO acct_users (id, email, name, created_at) VALUES (?,?,?,?)"), im = db.prepare("INSERT INTO os_members (id, org_id, user_id, email, name, department_id, manager_user_id, kind, status, employment_type, weekly_hours, skills, created_at, updated_at) VALUES (?,?,?,?,?,?,?,'employee','active','full_time',40,'[]',?,?)"), imr = db.prepare("INSERT INTO os_member_roles (member_id, role_id) VALUES (?,?)");
  for (let i = 0; i < 200; i++) { const u = "uS" + i, e = "staff" + i + "@fodo.co.in"; iu.run(u, e, "Staff " + i, now); im.run("mS" + i, ORG, u, e, "Staff " + i, depts[i % depts.length], i < 20 ? uid("pm@fodo.co.in") : "uS" + (i % 20), now, now); imr.run("mS" + i, role); members.push(u); }
  const ip = db.prepare("INSERT INTO biz_projects (id, client_id, title, type, status, lifecycle, owner_user_id, department_id, kind, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)"), it = db.prepare("INSERT INTO biz_tasks (id, project_id, title, who, due, status, created_by, created_at, updated_at, assignee_user_id, department_id, priority, org_id, kind) VALUES (?,?,?,'staff',?,?,?,?,?,?,?,?,?,'work')");
  const ST = ["todo", "doing", "blocked", "review", "done", "done", "done"], LC = ["active", "production", "client_review", "completed", "planning"];
  for (let i = 0; i < 10000; i++) ip.run("pS" + i, "uC" + (i % 900), "Scale project " + i, "campaign", i % 5 === 3 ? "completed" : "active", LC[i % 5], members[i % 200], depts[i % depts.length], "client", now, now);
  for (let i = 0; i < 50000; i++) it.run("tS" + i, "pS" + (i % 10000), "Scale task " + i, new Date(Date.now() + ((i % 40) - 20) * 864e5).toISOString().slice(0, 10), ST[i % 7], members[(i * 7) % 200], now, now, members[i % 200], depts[i % depts.length], ["low", "normal", "high", "urgent"][i % 4], ORG);
  db.exec("COMMIT"); console.log("info: seeded 200 people, 10,000 projects, 50,000 tasks in " + (Date.now() - t0) + " ms");
  ok(q1("SELECT count(*) n FROM biz_tasks").n >= 50000 && q1("SELECT count(*) n FROM biz_projects").n >= 10000, "scale data seeded");
  await login("staff5@fodo.co.in", null, "s5"); await login("staff1@fodo.co.in", null, "s1");
  const T = {}, time = async (label, fn, budget) => { const a = Date.now(); const res = await fn(); const ms = Date.now() - a; T[label] = ms; ok(res && res.status === 200 && ms < budget, "perf: " + label + " " + ms + " ms (budget " + budget + " ms)" + (res && res.status !== 200 ? " status " + res.status + " " + (res.j && res.j.reason) : "")); return res; };
  await time("owner task list (all, first page)", () => O("tasks", undefined, "own"), 1500);
  await time("staff member: my tasks", () => O("tasks", undefined, "s5"), 800);
  await time("team lead: team task list", () => O("tasks?box=team", undefined, "s1"), 1500);
  await time("owner project list", () => O("projects", undefined, "own"), 2500);
  await time("staff member: My FODO", () => O("my", undefined, "s5"), 1500);
  await time("owner Command Centre", () => O("command", undefined, "own"), 3000);
  await time("owner workload", () => O("workload", undefined, "own"), 3000);
  { const a = Date.now(); await PB.scan(env); const ms = Date.now() - a; T["problem scan"] = ms; ok(ms < 8000, "perf: daily problem scan over 50,000 tasks " + ms + " ms (budget 8000 ms)"); }
  console.log("info: timings " + JSON.stringify(T));
  fs.writeFileSync(new URL("./.perf-v508.json", import.meta.url), JSON.stringify({ at: new Date().toISOString(), projects: 10000, tasks: 50000, people: 200, ms: T }, null, 1));
  /* query plans: the hot lookups use an index, never a full table scan */
  const plan = (sql, ...a) => qa("EXPLAIN QUERY PLAN " + sql, ...a).map((x) => x.detail).join(" | ");
  for (const [label, sql] of [["tasks by assignee", "SELECT id FROM biz_tasks WHERE assignee_user_id='uS5' AND status='todo'"], ["tasks by project", "SELECT id FROM biz_tasks WHERE project_id='pS5'"], ["tasks created by", "SELECT 1 FROM biz_tasks WHERE project_id='pS5' AND created_by='uS5'"], ["projects by owner", "SELECT id FROM biz_projects WHERE owner_user_id='uS5'"], ["projects by client", "SELECT id FROM biz_projects WHERE client_id='uC5'"], ["members by manager", "SELECT user_id FROM os_members WHERE manager_user_id='uS1'"], ["approvals by approver", "SELECT id FROM os_approvals WHERE approver_user_id='uS1' AND status='pending'"], ["team members by user", "SELECT team_id FROM os_team_members WHERE user_id='uS1'"], ["milestones by project", "SELECT id FROM biz_milestones WHERE project_id='pS5'"]]) {
    const p = plan(sql); ok(!/^SCAN (biz_tasks|biz_projects|os_members|os_approvals|os_team_members|biz_milestones)\b/.test(p) && !/\| SCAN (biz_tasks|biz_projects|os_members|os_approvals|os_team_members|biz_milestones)\b/.test(p), "query plan: " + label + " uses an index (" + p + ")"); }
}

/* ---------- 5. backup / restore rehearsal on the full test database (every FODO table, 60,000+ rows) ---------- */
{ const BK = await import("../scripts/backup.mjs"), os2 = await import("node:os"), f = (await import("node:path")).join(os2.tmpdir(), "fodo-v508-src-" + process.pid + ".sqlite"); if (fs.existsSync(f)) fs.rmSync(f);
  env.XRAY_DB.db.exec("VACUUM INTO '" + f.replace(/'/g, "''") + "'"); const rep = BK.rehearse(f);
  ok(rep.ok && rep.integrity === "ok" && rep.tables > 100 && rep.rows > 60000, "backup rehearsal: dump → restore → " + rep.tables + " tables, " + rep.rows + " rows identical, integrity ok (" + rep.ms + " ms, " + Math.round(rep.dump_bytes / 1048576) + " MB)" + (rep.mismatches.length ? " mismatches: " + rep.mismatches.slice(0, 4).join(", ") : ""));
  fs.writeFileSync(new URL("./.backup-rehearsal-v508.json", import.meta.url), JSON.stringify(Object.assign({}, rep, { dump: undefined, restored: undefined }), null, 1)); fs.rmSync(rep.dump); fs.rmSync(rep.restored); fs.rmSync(f); }

/* ---------- 6. monitoring ---------- */
r = await O("monitoring", undefined, "own"); ok(r.status === 200 && r.j.attention.some((a) => /No backup recorded/.test(a.text)) && r.j.data.tasks >= 50000 && r.j.probes.d1 === "ok", "monitoring: real data sizes, probes, and 'no backup recorded yet'");
ok(r.j.attention.some((a) => /Test mode is ON/.test(a.text)), "monitoring: test mode ON is flagged critical");
await MON.recordError(env, "GET tasks", 500, new Error("boom for anmol@fodo.co.in id 12345678")); await MON.recordError(env, "GET tasks", 500, new Error("boom again"));
r = await O("monitoring", undefined, "own"); { const t = r.j.errors.top.find((x) => x.route === "GET tasks"); ok(r.j.errors.last_24h >= 2 && t && t.n === 2 && !/anmol@|12345678/.test(t.last_message || ""), "monitoring: server errors counted per route, message scrubbed of emails and numbers"); }
r = await O("monitoring/backup", { file: "fodo-xray-" + today + ".sql" }, "tech"); ok(r.status === 403, "only an owner records a backup");
r = await O("monitoring/backup", { file: "fodo-xray-" + today + ".sql", rows: 67549, verified: true }, "own"); r = await O("monitoring", undefined, "own"); ok(r.j.backup && r.j.backup.age_days === 0 && !r.j.attention.some((a) => /No backup/.test(a.text)), "backup recorded; the warning clears");
r = await O("monitoring", undefined, "dev"); ok(r.status === 403, "designers don't see monitoring");
r = await Z("me", undefined, "tech"); ok(r.j.nav.some((n) => n.id === "monitoring"), "developers see Monitoring in the sidebar");
{ const src = fs.readFileSync(new URL("../functions/api/os/[[path]].js", import.meta.url), "utf8"); ok(/MON\.recordError\(env, routeKey/.test(src), "the router records every 5xx"); }

/* ---------- 7. release hygiene ---------- */
{ const v = fs.readFileSync(new URL("../VERSION", import.meta.url), "utf8").trim(); ok(v === "FODO v50.8", "VERSION is FODO v50.8"); }
{ const run = fs.readFileSync(new URL("./run.mjs", import.meta.url), "utf8"); ok(/"v508"/.test(run) && /"v508-csp\.js"/.test(run), "run.mjs runs the Phase 8 suites"); }
for (const f of ["docs/FODO-V50.8-REPORT.md", "docs/RELEASE-CHECKLIST.md", "docs/BACKUP-RESTORE.md", "scripts/backup.mjs"]) ok(fs.existsSync(new URL("../" + f, import.meta.url)), f + " exists");
console.log(`\nv50.8: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
