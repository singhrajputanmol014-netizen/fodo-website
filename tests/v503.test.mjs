// v50.3 FODO OS V4 Phase 3: HR (leave + balances + policy, reviews, training, skills matrix, onboarding checklists, capacity, attendance off by default),
// FODO Pros in the OS (lifecycle, passport, appeals, two-stage matching, booking changes, hours, team assembly with employees, workroom), navigation.
// Run: node --no-warnings tests/v503.test.mjs
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
import * as HR from "../functions/_lib/os/hr.js";
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

/* ---------- 1. registry + navigation ---------- */
ok(REGISTRY.hr && REGISTRY.hr.view.indexOf("own") === 0 && REGISTRY.hr.manage.indexOf("own") < 0 && REGISTRY.pro.view.indexOf("own") === 0, "registry: hr.view own..all, hr.manage team..all, pro.view gains own");
ok(TEMPLATES.find((t) => t.slug === "designer").perms.indexOf("hr.view.own") > -1 && TEMPLATES.find((t) => t.slug === "project_manager").perms.indexOf("hr.manage.team") > -1 && TEMPLATES.find((t) => t.slug === "hr_talent_manager").perms.indexOf("hr.manage.organization") > -1 && TEMPLATES.find((t) => t.slug === "fodo_pro").perms.indexOf("pro.view.own") > -1, "templates: employee own, manager team, HR organisation, Pro own passport");
ok(MODULES.some((m) => m[0] === "hr"), "HR is a switchable module");
r = await Z("me", undefined, "dev"); ok(r.j.nav.some((n) => n.id === "hr") && !r.j.nav.some((n) => n.id === "os-pros"), "designer navigation: HR (own leave etc.) but no FODO Pros list");
r = await Z("me", undefined, "pm"); ok(r.j.nav.some((n) => n.id === "hr") && r.j.os.groups.find((g) => g.id === "people").items.some((n) => n.id === "hr"), "PM: HR appears in the People group");
r = await Z("me", undefined, "own"); ok(r.j.nav.some((n) => n.id === "os-pros") && r.j.nav.some((n) => n.id === "hr"), "owner: HR and FODO Pros entries");

/* ---------- 2. leave: policy, balance, request, approve, reject, cancel, clash ---------- */
r = await O("hr/policy", undefined, "dev"); ok(r.status === 200 && r.j.policy.casual === 12 && r.j.attendance === false, "default leave policy (12 casual, 8 sick, 15 earned); attendance off");
r = await O("hr/policy", { casual: 10 }, "hr"); ok(r.status === 403, "HR manager cannot change the policy (owner only)");
r = await O("hr/policy", { casual: 10, sick: 8 }, "own"); ok(r.status === 200 && r.j.policy.casual === 10 && q1("SELECT action FROM os_audit WHERE action='OWNER_LEAVE_POLICY'"), "owner changes the policy; audited");
r = await O("hr/leave", { kind: "casual", from_day: plus(7), to_day: plus(9), reason: "Family function" }, "dev"); ok(r.status === 200 && r.j.approver_user_id === uid("pm@fodo.co.in") && r.j.days >= 2, "designer requests casual leave; goes to the manager; working days counted (" + r.j.days + ")");
const lv1 = r.j.id; r = await O("hr/leave", { kind: "casual", from_day: plus(8), to_day: plus(8) }, "dev"); ok(r.status === 409, "overlapping request refused");
r = await O("hr/balance", undefined, "dev"); ok(r.status === 200 && r.j.items.find((x) => x.kind === "casual").pending >= 2 && r.j.items.find((x) => x.kind === "casual").left === 10, "balance shows pending days; nothing used yet");
r = await O("hr/leave/" + lv1 + "/decide", { decision: "approve" }, "dev"); ok(r.status === 403, "nobody approves their own leave");
r = await O("hr/leave/" + lv1 + "/decide", { decision: "approve" }, "fin"); ok(r.status === 403, "finance manager (no hr.manage over the designer) cannot approve");
r = await O("hr/leave?box=team", undefined, "pm"); ok(r.status === 200 && r.j.items.length === 1 && r.j.canApprove, "manager sees her team's requests");
r = await O("hr/leave/" + lv1 + "/decide", { decision: "approve" }, "pm"); ok(r.status === 200 && r.j.status === "approved" && q1("SELECT 1 x FROM biz_notes WHERE user_id=? AND text LIKE 'Leave approved%'", uid("dev@fodo.co.in")), "manager approves; designer notified");
r = await O("hr/balance", undefined, "dev"); ok(r.j.items.find((x) => x.kind === "casual").used >= 2 && r.j.items.find((x) => x.kind === "casual").left <= 8, "approved days move from pending to used");
r = await O("hr/leave", { kind: "casual", from_day: plus(20), to_day: plus(40), reason: "long" }, "dev"); ok(r.status === 400 && /left this year/.test(r.j.reason), "request over the remaining balance refused with the number left");
r = await O("hr/leave", { kind: "sick", from_day: plus(1), to_day: plus(1), half_day: true }, "dev"); ok(r.status === 200 && r.j.days === 0.5, "half day sick leave");
const lv2 = r.j.id; r = await O("hr/leave/" + lv2 + "/decide", { decision: "reject" }, "pm"); ok(r.status === 400, "rejecting needs a note");
r = await O("hr/leave/" + lv2 + "/decide", { decision: "reject", note: "Shoot day, please move it" }, "hr"); ok(r.status === 200 && r.j.status === "rejected", "HR manager (organisation hr.manage) can decide too");
r = await O("hr/leave", { kind: "wfh", from_day: plus(3) }, "dev"); const lv3 = r.j.id; r = await O("hr/leave/" + lv3 + "/cancel", {}, "pm"); ok(r.status === 403, "only the requester cancels");
r = await O("hr/leave/" + lv3 + "/cancel", {}, "dev"); ok(r.status === 200, "requester cancels a pending request");
r = await O("hr/leave", { kind: "casual", from_day: plus(2) }, "c"); ok(r.status === 403, "a client has no hr access at all");

/* ---------- 3. reviews ---------- */
r = await O("hr/reviews", { user_id: uid("dev@fodo.co.in"), kind: "quarterly", period: "2026-Q4", goals: ["Ship the brand kit", { t: "Mentor an intern" }] }, "dev"); ok(r.status === 403, "an employee cannot open a review on themselves (hr.manage)");
r = await O("hr/reviews", { user_id: uid("dev@fodo.co.in"), kind: "quarterly", period: "2026-Q4", goals: ["Ship the brand kit", { t: "Mentor an intern" }] }, "pm"); ok(r.status === 200 && r.j.id, "manager opens a quarterly review with goals");
const rv = r.j.id; r = await O("hr/reviews/" + rv, undefined, "dev"); ok(r.status === 200 && r.j.isSubject && r.j.review.status === "self" && r.j.review.goals.length === 2 && r.j.review.reviewer === "Priya PM", "the person sees the review in self stage");
r = await O("hr/reviews/" + rv, { manager_text: "x", rating: 4 }, "dev"); ok(r.status === 403, "the subject cannot write the manager's part");
r = await O("hr/reviews/" + rv, { self_text: "Delivered 3 brand kits, learned motion." }, "dev"); ok(r.status === 200 && q1("SELECT status FROM os_reviews WHERE id=?", rv).status === "manager", "self-assessment moves it to the manager stage");
r = await O("hr/reviews/" + rv, { complete: true }, "pm"); ok(r.status === 400, "completing needs a rating");
r = await O("hr/reviews/" + rv, { manager_text: "Strong quarter.", rating: 4, goals: [{ t: "Ship the brand kit", done: true }, { t: "Mentor an intern", done: false }], complete: true }, "pm"); ok(r.status === 200 && q1("SELECT status, rating FROM os_reviews WHERE id=?", rv).status === "done", "manager rates and completes");
r = await O("hr/reviews/" + rv, { self_text: "late" }, "dev"); ok(r.status === 409, "a completed review is read only");
r = await O("hr/reviews/" + rv, undefined, "fin"); ok(r.status === 403, "finance cannot read a designer's review");
r = await O("hr/reviews", undefined, "hr"); ok(r.status === 200 && r.j.items.length === 1 && r.j.items[0].rating === 4, "HR lists reviews across the organisation");

/* ---------- 4. training + skills ---------- */
r = await O("hr/training", { user_id: uid("dev@fodo.co.in"), title: "After Effects fundamentals", kind: "course", provider: "Domestika", due: plus(30), cost: 2500 }, "pm"); ok(r.status === 200 && r.j.id, "manager assigns training with a due date");
const tr = r.j.id; r = await O("hr/training", { title: "Colour grading basics", kind: "workshop" }, "dev"); ok(r.status === 200, "an employee records their own training");
r = await O("hr/training/" + tr, { status: "done", cert_url: "https://example.com/cert/1" }, "dev"); ok(r.status === 200 && q1("SELECT status, completed_at c FROM os_training WHERE id=?", tr).c, "completing sets completed_at");
r = await O("hr/training?box=mine", undefined, "dev"); ok(r.j.items.length === 2, "my training list");
r = await O("hr/skills", { skills: [{ name: "Motion design", level: 4 }, { name: "Brand identity", level: 3 }, { name: "Photography", level: 2 }] }, "dev"); ok(r.status === 200 && r.j.skills.length === 3, "employee sets own skills with levels");
r = await O("hr/skills", { user_id: uid("pm@fodo.co.in"), skills: [{ name: "Photography", level: 5 }] }, "dev"); ok(r.status === 403, "cannot set someone else's skills without hr.manage");
r = await O("hr/skills", { user_id: uid("pm@fodo.co.in"), skills: [{ name: "Project management", level: 5 }, { name: "Photography", level: 2 }] }, "hr"); ok(r.status === 200, "HR sets a manager's skills");
r = await O("hr/skills", undefined, "hr"); ok(r.status === 200 && r.j.matrix.find((x) => x.name === "Photography").people === 2 && r.j.matrix.find((x) => x.name === "Photography").gap === true && r.j.matrix.find((x) => x.name === "Motion design").experts === 1, "skills matrix aggregates people per skill and flags gaps (nobody expert in Photography)");
r = await O("hr/skills", undefined, "dev"); ok(r.j.people.length === 1 && r.j.people[0].user_id === uid("dev@fodo.co.in"), "with own scope the matrix is just me");

/* ---------- 5. onboarding checklists ---------- */
r = await O("hr/checklists", { user_id: uid("dev@fodo.co.in") }, "pm"); ok(r.status === 200 && r.j.items.length === HR.DEFAULT_ONBOARDING.length, "manager starts the default onboarding checklist");
const ck = r.j.id; r = await O("hr/checklists", { user_id: uid("dev@fodo.co.in") }, "pm"); ok(r.status === 409, "one open checklist per kind");
r = await O("hr/checklists/" + ck + "/tick", { idx: 0, done: true }, "dev"); ok(r.status === 200 && r.j.items[0].done && r.j.status === "open", "the person ticks items");
for (let i = 1; i < HR.DEFAULT_ONBOARDING.length; i++) r = await O("hr/checklists/" + ck + "/tick", { idx: i, done: true }, "pm"); ok(r.j.status === "done" && q1("SELECT completed_at c FROM os_checklists WHERE id=?", ck).c, "all ticked → done with completed_at");
r = await O("hr/profile?user_id=" + uid("dev@fodo.co.in"), undefined, "pm"); ok(r.status === 200 && r.j.member.manager === "Priya PM" && r.j.leave.length >= 2 && r.j.reviews.length === 1 && r.j.training.length === 2 && r.j.checklists[0].done === r.j.checklists[0].total && r.j.canManage, "employee profile gathers leave, reviews, training, checklist");
r = await O("hr/profile?user_id=" + uid("dev@fodo.co.in"), undefined, "fin"); ok(r.status === 403, "profile is scoped (finance cannot read design)");

/* ---------- 6. capacity + attendance ---------- */
await O("tasks", { title: "Capacity task", assignee_user_id: uid("dev@fodo.co.in"), due: today, estimated_min: 1200 }, "pm");
r = await O("hr/capacity?weeks=2", undefined, "pm"); ok(r.status === 200 && r.j.weeks.length === 2 && r.j.people.some((p) => p.user_id === uid("dev@fodo.co.in") && p.weeks[0].allocated_min >= 1200 && p.weeks[0].level), "capacity heatmap: weeks x people with allocated minutes and a level");
const dw = r.j.people.find((p) => p.user_id === uid("dev@fodo.co.in")); ok(dw.weeks.some((w) => w.leave_days > 0 && w.available_min < 2400), "approved leave reduces available minutes in that week");
r = await O("hr/attendance", undefined, "dev"); ok(r.status === 200 && r.j.enabled === false, "attendance is off by default and says so");
r = await O("hr/attendance", { action: "in" }, "dev"); ok(r.status === 409, "marking attendance while off is refused");
r = await O("hr/attendance/enable", { enabled: true }, "hr"); ok(r.status === 403, "only an owner switches attendance on");
r = await O("hr/attendance/enable", { enabled: true }, "own"); ok(r.status === 200 && r.j.enabled, "owner switches it on");
r = await O("hr/attendance", { action: "in" }, "dev"); ok(r.status === 200 && r.j.in_at, "check in"); r = await O("hr/attendance", { action: "in" }, "dev"); ok(r.status === 400, "double check-in refused");
r = await O("hr/attendance", { action: "out" }, "dev"); ok(r.status === 200 && r.j.out_at, "check out"); r = await O("hr/attendance?box=team", undefined, "pm"); ok(r.j.items.length === 1 && r.j.items[0].who === "Dev Designer", "manager sees team attendance");
await O("hr/attendance/enable", { enabled: false }, "own");

/* ---------- 7. Pros: set-up, lifecycle, passport ---------- */
await login("pro@studio.in", null, "p"); await login("pro2@studio.in", null, "p2");
qr("INSERT INTO biz_pros (id, user_id, name, title, role, status, city, remote, onsite, skills, langs, rate_day, days, created_at, updated_at, rating_sum, rating_n, done_n) VALUES ('proA', ?, 'Aarav Lens', 'Cinematographer', 'Videographer', 'approved', 'Delhi', 1, 1, '[\"gimbal\",\"colour grading\"]', '[\"hindi\",\"english\"]', 12000, '[]', '2026-01-01', '2026-01-01', 18, 4, 4)", uid("pro@studio.in"));
qr("INSERT INTO biz_pros (id, user_id, name, title, role, status, city, remote, onsite, skills, langs, rate_day, days, created_at, updated_at) VALUES ('proB', ?, 'Bina Frame', 'Videographer', 'Videographer', 'approved', 'Mumbai', 0, 0, '[\"drone\"]', '[\"marathi\"]', 30000, '[]', '2026-01-01', '2026-01-01')", uid("pro2@studio.in"));
await Z("me", undefined, "p"); await Z("me", undefined, "p2");
for (let i = 1; i <= 4; i++) { qr("INSERT INTO biz_projects (id, client_id, pro_id, title, status, created_at, updated_at) VALUES (?, ?, 'proA', ?, 'completed', '2026-01-0" + i + "', '2026-01-0" + i + "')", "pjA" + i, i < 4 ? uid("client@biz.in") : uid("other@biz.in"), "Project A" + i); qr("INSERT INTO biz_milestones (id, project_id, idx, title, amount, due, status, submitted_at, approved_at) VALUES (?, ?, 1, 'M1', 10000, '2026-02-10', 'approved', ?, '2026-02-12')", "msA" + i, "pjA" + i, i === 4 ? "2026-02-15" : "2026-02-09"); }
r = await O("pros", undefined, "dev"); ok(r.status === 403, "designer (no pro.view) cannot list Pros");
r = await O("pros", undefined, "p"); ok(r.status === 403, "a Pro cannot list other Pros (own scope only)");
r = await O("pros", undefined, "ops"); ok(r.status === 200 && r.j.items.length === 2 && r.j.items[0].rateDay && r.j.canManage, "operations lists Pros with lifecycle and (for production.manage) day rates");
r = await O("pros", undefined, "hr"); ok(r.status === 200 && r.j.items[0].rateDay === undefined, "HR sees Pros without fees");
r = await O("pros/proA/passport", undefined, "p"); ok(r.status === 200 && r.j.isMe && r.j.passport.metrics[0].value === 75 && r.j.passport.metrics[1].value === 4 && r.j.passport.metrics[2].value === 1 && r.j.passport.metrics[3].value === 4.5 && r.j.passport.score != null && r.j.passport.formula, "the Pro's own passport: on-time 75% (3 of 4), 4 completed, 1 repeat client, rating 4.5, a score with its formula");
r = await O("pros/proB/passport", undefined, "p"); ok(r.status === 403, "a Pro cannot read another Pro's passport");
r = await O("pros/proB/passport", undefined, "ops"); ok(r.status === 200 && r.j.passport.score === null && /insufficient/.test(r.j.passport.level), "a Pro without history: insufficient data, no score invented");
r = await O("pros/proA/lifecycle", { to: "paused" }, "ops"); ok(r.status === 400, "lifecycle change needs a reason");
r = await O("pros/proA/lifecycle", { to: "suspended", reason: "Two no-shows" }, "pm"); ok(r.status === 403, "PM cannot change a Pro's lifecycle");
r = await O("pros/proB/lifecycle", { to: "paused", reason: "Travelling until December" }, "ops"); ok(r.status === 200 && q1("SELECT lifecycle FROM biz_pros WHERE id='proB'").lifecycle === "paused" && q1("SELECT 1 x FROM os_audit WHERE action='PRO_LIFECYCLE'") && q1("SELECT 1 x FROM biz_notes WHERE user_id=? AND text LIKE '%now paused%'", uid("pro2@studio.in")), "operations pauses a Pro with a reason; audited; Pro notified");
r = await O("pros/appeals", { metric: "on_time", text: "Milestone 4 was late because the client moved the shoot by a week." }, "p"); ok(r.status === 200 && r.j.id, "the Pro appeals a passport metric");
const apl = r.j.id; r = await O("pros/appeals", { metric: "rating", text: "Another appeal while one is open should not be allowed." }, "p"); ok(r.status === 409, "one open appeal at a time");
r = await O("pros/appeals/" + apl + "/decide", { decision: "accept", note: "Confirmed with the client; noted on the passport." }, "ops"); ok(r.status === 200 && r.j.status === "accepted", "operations decides the appeal with a note the Pro sees");
r = await O("pros/proA/passport", undefined, "ops"); ok(r.j.appeals.length === 1 && r.j.appeals[0].status === "accepted" && r.j.previous && r.j.previous.score === r.j.passport.score, "passport shows the appeal and the previous snapshot");

/* ---------- 8. two-stage matching ---------- */
const roleId = q1("SELECT id FROM biz_roles WHERE id='videographer'").id;
r = await O("pros/match", { roleId, city: "Delhi", mode: "onsite", date: plus(10), days: 2, budget: 15000, must_skills: ["gimbal"] }, "ops"); ok(r.status === 200 && r.j.considered === 2 && r.j.items.length === 1 && r.j.items[0].pro.id === "proA" && r.j.eliminated.length === 1 && r.j.eliminated[0].pro.id === "proB" && r.j.eliminated[0].reasons.some((x) => /paused/.test(x)) && r.j.eliminated[0].reasons.some((x) => /Missing required skill/.test(x)), "stage 1 eliminates with every reason (paused, missing skill, location); stage 2 ranks the survivor");
ok(r.j.items[0].why.some((w) => /Passport \d+/.test(w)) && typeof r.j.items[0].base === "number" && r.j.items[0].pro.rateDay === 12000 && r.j.note, "ranking is explained with the passport; operations sees the day rate; the method is written out");
r = await O("pros/match", { roleId, city: "Delhi", mode: "onsite", date: plus(10), days: 2 }, "hr"); ok(r.status === 200 && r.j.items[0].pro.rateDay === undefined, "HR (no fee right) gets the ranking without day rates");
r = await O("pros/match", { roleId }, "pm"); ok(r.status === 403, "PM without pro.view cannot match");
r = await O("pros/match", { roleId }, "dev"); ok(r.status === 403, "matching needs pro.view");
qr("INSERT INTO biz_bookings (id, pro_id, project_id, day, created_at, slot) VALUES ('bkX', 'proA', 'teamZ', ?, '2026-01-01', '')", plus(10));
r = await O("pros/match", { roleId, city: "Delhi", mode: "onsite", date: plus(10), days: 1 }, "ops"); ok(r.j.items.length === 0 && r.j.eliminated.some((e) => e.pro.id === "proA" && /Already booked/.test(e.reasons[0])), "availability is a hard constraint with the date in the reason");

/* ---------- 9. booking changes + hours ---------- */
r = await O("pros/bookings/reschedule", { ref: "teamZ", days: [plus(12)], reason: "Client moved the shoot" }, "p"); ok(r.status === 200 && r.j.status === "requested" && r.j.late === false, "a Pro requests a reschedule (outside the notice window); operations confirms");
const bc = r.j.id; r = await O("pros/bookings", undefined, "p"); ok(r.j.items.length === 1 && r.j.items[0].status === "requested", "the Pro sees their change requests");
r = await O("pros/bookings/" + bc + "/decide", { decision: "accept" }, "dev"); ok(r.status === 403, "an employee without production.manage cannot decide a booking change");
r = await O("pros/bookings/" + bc + "/decide", { decision: "accept" }, "ops"); ok(r.status === 200 && q1("SELECT day FROM biz_bookings WHERE pro_id='proA' AND project_id='teamZ'").day === plus(12) && q1("SELECT 1 x FROM os_audit WHERE action='BOOKING_CHANGE_ACCEPTED'"), "operations accepts: the booking moves, audited");
r = await O("pros/bookings/reschedule", { ref: "teamZ", pro_id: "proA", days: [plus(14), plus(15)], reason: "Weather" }, "ops"); ok(r.status === 200 && r.j.status === "done" && qa("SELECT day FROM biz_bookings WHERE pro_id='proA' AND project_id='teamZ'").length === 2, "staff reschedule directly (all-or-nothing booking)");
qr("UPDATE biz_pros SET notice_days=30 WHERE id='proA'"); r = await O("pros/bookings/cancel", { ref: "teamZ", reason: "Ill" }, "p"); ok(r.status === 200 && r.j.late === true && /notice window/.test(r.j.note), "a Pro cancelling inside their notice window is flagged late (reliability)");
r = await O("pros/bookings/cancel", { ref: "teamZ", pro_id: "proA", reason: "Project cancelled by client" }, "ops"); ok(r.status === 200 && r.j.status === "done" && qa("SELECT day FROM biz_bookings WHERE pro_id='proA' AND project_id='teamZ'").length === 0, "staff cancel releases the days");
r = await O("pros/proA/hours", { hours_from: "10:00", hours_to: "09:00" }, "p"); ok(r.status === 400, "hours must end after they start");
r = await O("pros/proA/hours", { hours_from: "10:00", hours_to: "19:00" }, "p"); ok(r.status === 200, "a Pro sets working hours"); r = await O("pros/proA/rules", undefined, "ops"); ok(r.j.rules.hours_from === "10:00" && r.j.rules.notice === 30, "rules show hours, notice, horizon");
r = await O("pros/proA/hours", { hours_from: "09:00", hours_to: "18:00" }, "p2"); ok(r.status === 403, "another Pro cannot change them");

/* ---------- 10. team assembly with employees ---------- */
qr("INSERT INTO biz_teams (id, client_id, title, status, start_day, days, city, mode, created_at, updated_at) VALUES ('tmA', ?, 'Cafe launch shoot', 'draft', ?, 2, 'Delhi', 'onsite', '2026-01-01', '2026-01-01')", uid("client@biz.in"), plus(20));
qr("INSERT INTO biz_team_members (id, team_id, slot, role_id, role_name, status, created_at, updated_at) VALUES ('tmA1', 'tmA', 1, 'videographer', 'Videographer', 'open', '2026-01-01', '2026-01-01')"); qr("INSERT INTO biz_team_members (id, team_id, slot, role_id, role_name, status, created_at, updated_at) VALUES ('tmA2', 'tmA', 2, 'photographer', 'Photographer', 'open', '2026-01-01', '2026-01-01')");
r = await O("teams/tmA/assembly", undefined, "dev"); ok(r.status === 403, "assembly needs production.manage");
r = await O("teams/tmA/assembly", undefined, "pm"); ok(r.status === 200 && r.j.slots.length === 2 && r.j.slots[1].employees.some((e) => e.user_id === uid("pm@fodo.co.in") || e.user_id === uid("dev@fodo.co.in")), "assembly lists slots and suggests employees whose skills match the role (Photography)");
r = await O("teams/tmA/assign", { slot: 2, user_id: uid("dev@fodo.co.in") }, "pm"); ok(r.status === 200 && q1("SELECT status, user_id, member_kind k FROM biz_team_members WHERE id='tmA2'").k === "employee" && q1("SELECT 1 x FROM biz_team_events WHERE team_id='tmA' AND kind='assigned_employee'") && q1("SELECT 1 x FROM biz_notes WHERE user_id=? AND text LIKE 'You are on the team%'", uid("dev@fodo.co.in")), "an employee is assigned to a slot directly (accepted), logged on the team, notified");
r = await O("teams/tmA/assign", { slot: 1, user_id: uid("dev@fodo.co.in") }, "pm"); ok(r.status === 409, "the same employee cannot fill two slots");
r = await O("teams/tmA/assembly", undefined, "pm"); ok(r.j.slots[1].employee && r.j.slots[1].employee.name === "Dev Designer" && r.j.slots[1].kind === "employee" && r.j.slots[0].status === "open", "assembly shows the employee on the slot");
r = await O("teams/tmA/unassign", { member_id: "tmA2", reason: "Conflict" }, "pm"); ok(r.status === 200 && q1("SELECT status FROM biz_team_members WHERE id='tmA2'").status === "open", "unassign reopens the slot");
r = await Z("admin/teams/tmA", undefined, "own"); ok(r.status === 200 || r.status === 404, "legacy team page still answers (" + r.status + ")");

/* ---------- 11. Pro workroom ---------- */
await O("people", { email: "pro@studio.in", name: "Aarav Lens", roles: ["fodo_pro"], kind: "contractor" }, "own").catch(() => {});
qr("INSERT INTO biz_bookings (id, pro_id, project_id, day, created_at, slot) VALUES ('bkW', 'proA', 'pjA1', ?, '2026-01-01', '')", plus(5)); qr("UPDATE biz_projects SET status='in_progress' WHERE id='pjA1'");
r = await O("pros/workroom", undefined, "p"); ok(r.status === 200 && r.j.pro.id === "proA" && r.j.projects.length === 1 && r.j.bookings.length === 1 && r.j.changes.length >= 2 && Array.isArray(r.j.tasks) && Array.isArray(r.j.deliverables), "the Pro workroom: active projects, bookings, change history, tasks, deliverables");
r = await O("pros/workroom", undefined, "dev"); ok(r.status === 403, "an employee has no workroom");
r = await Z("me", undefined, "p"); ok(r.j.nav.some((n) => n.id === "workroom"), "a Pro's navigation gains Workroom");

/* ---------- 12. router hygiene + UI wiring ---------- */
ok(ROUTES.every((x) => x[2] === "self" || (x[2] && REGISTRY[x[2].resource] && REGISTRY[x[2].resource][x[2].action])), "every route declares a valid permission");
ok(ROUTES.filter((x) => x[2] === "self").length <= 8, "no more than 8 self routes");
{ const ui = fs.readFileSync(new URL("../js/ws-os.js", import.meta.url), "utf8"); const paths = new Set(); for (const m of ui.matchAll(/oapi\("([a-z\-]+(?:\/[a-z\-]+)*)/g)) paths.add(m[1]); for (const m of ui.matchAll(/"([a-z\-]+(?:\/[a-z\-]+)?)\/" \+ [a-zA-Z.]+ \+ "\/([a-z\-]+(?:\/[a-z\-]+)?)"/g)) paths.add(m[1] + "/x/" + m[2]); const routes = ROUTES.map((x) => x[1]); const missing = [...paths].filter((p) => !routes.some((re) => re.test(p) || re.test(p.replace(/\/x\//, "/abc123/")) || re.test(p + "/abc") || re.source.indexOf("^" + p.replace(/\//g, "\\/") + "\\/") === 0)); ok(missing.length === 0, "ws-os.js (v50.3 views included) calls only routes the router has" + (missing.length ? ": " + missing.join(", ") : "")); ok(!/\bworker\b/i.test(ui) && !/—/.test(ui), "no 'worker', no long dash"); }
console.log(`\nv50.3: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
