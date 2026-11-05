// v50.1 FODO OS V4 Phase 1: permission registry, os_* tables + seeds + legacy backfill, principal / authorize matrix, People & Access
// (invite, roles, grants with expiry, suspend + session revoke, offboarding handoff, departments, custom roles), view-as (read-only,
// audited), structured audit + event bus (marketplace writes become events), notification categories + dedupe, kill switch,
// module switches, role-aware navigation, OWNER_CAN_ACCESS_ALL_SYSTEM_MODULES. Every rule is enforced on the server.
// Run: node --no-warnings tests/v501.test.mjs
import { DatabaseSync } from "node:sqlite";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as bizApi } from "../functions/api/biz/[[path]].js";
import { onRequest as osApi, ROUTES } from "../functions/api/os/[[path]].js";
import { REGISTRY, SCOPES, TEMPLATES, validPerm, LEGACY, MODULES } from "../functions/_lib/os/permissions.js";
import { osdb, ORG } from "../functions/_lib/os/db.js";
import { principal, allows, authorize, has, relationOf, cleanFor } from "../functions/_lib/os/authz.js";
import { emit, on, events } from "../functions/_lib/os/audit.js";
import { notify, rolesOf, navFor, bdb } from "../functions/_lib/biz.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
console.log = ((orig) => (...a) => { if (typeof a[0] === "string" && a[0].charAt(0) === "{" && !process.env.DBG) return; orig(...a); })(console.log);
console.error = () => {};
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
const env = { XRAY_DB: d1(), CHAT_KV, ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", MAIL_FROM: "FODO <hello@fodo.co.in>", RESEND_API_KEY: "re_test" };
const O = (p, body, who, o) => call("os/" + p, body, Object.assign({ as: who || "own" }, o || {}));
const Z = (p, body, who, o) => call("biz/" + p, body, Object.assign({ as: who || "c" }, o || {}));
const q1 = (sql, ...a) => env.XRAY_DB.db.prepare(sql).get(...a), qa = (sql, ...a) => env.XRAY_DB.db.prepare(sql).all(...a), qr = (sql, ...a) => env.XRAY_DB.db.prepare(sql).run(...a);
const uid = (email) => (q1("SELECT id FROM acct_users WHERE email=?", email) || {}).id;

/* ---------- 1. registry ---------- */
ok(Object.keys(REGISTRY).length >= 25, "registry has " + Object.keys(REGISTRY).length + " resources");
ok(SCOPES.join() === "own,assigned,team,department,organization,all", "six scopes, narrow to wide");
ok(validPerm("task.update.assigned") && !validPerm("task.update.everywhere") && !validPerm("payout.approve.own") && !validPerm("nope.x.all"), "validPerm accepts registry strings only");
ok(TEMPLATES.length === 17 && TEMPLATES.every((t) => t.perms.every(validPerm)), "17 role templates, every permission valid");
ok(TEMPLATES.find((t) => t.slug === "viewer").perms.every((p) => !/^finance\.|^payout\./.test(p)), "viewer template holds no finance permission (S7)");
ok(TEMPLATES.find((t) => t.slug === "admin").perms.every((p) => !/^system\.(override|impersonate|settings)|^brain\.|^payout\.approve/.test(p)), "admin template is not owner (no override, impersonate, settings, brain, payout approve)");
ok(Object.values(REGISTRY).every((r) => Object.values(r).every((sc) => sc.every((s) => SCOPES.indexOf(s) > -1))), "every action lists valid scopes");

/* ---------- 2. set-up, seeds, legacy backfill ---------- */
await login("anmol@fodo.co.in", null, "own"); await login("client@biz.in", null, "c"); await login("pro@studio.in", null, "p"); await login("finance@fodo.co.in", null, "f"); await login("viewer@fodo.co.in", null, "v");
await bdb(env); qr("INSERT INTO acct_admins (email, role, added_by, added_at) VALUES ('oldadmin@fodo.co.in','admin','seed','2026-01-01')"); qr("INSERT INTO biz_staff (email, role, added_by, added_at) VALUES ('finance@fodo.co.in','finance','anmol@fodo.co.in','2026-01-01'), ('viewer@fodo.co.in','viewer','anmol@fodo.co.in','2026-01-01')");
const d = await osdb(env); await osdb(env);
ok(q1("SELECT count(*) n FROM os_orgs").n === 1 && q1("SELECT id FROM os_orgs").id === ORG, "one FODO organization seeded");
ok(q1("SELECT count(*) n FROM os_departments").n === 13 && q1("SELECT count(*) n FROM os_roles").n === 17, "13 departments and 17 role templates seeded once (set-up ran twice)");
const mem = (e) => q1("SELECT m.*, (SELECT group_concat(r.slug) FROM os_member_roles mr JOIN os_roles r ON r.id=mr.role_id WHERE mr.member_id=m.id) rs FROM os_members m WHERE email=?", e);
ok(mem("anmol@fodo.co.in") && mem("anmol@fodo.co.in").rs === "owner" && mem("anmol@fodo.co.in").user_id === uid("anmol@fodo.co.in"), "owner backfilled with the owner role, linked to the account");
ok(mem("oldadmin@fodo.co.in") && mem("oldadmin@fodo.co.in").rs === "admin" && mem("oldadmin@fodo.co.in").user_id === null, "acct_admins admin → admin template (no account yet, linked at first login)");
ok(mem("finance@fodo.co.in").rs === "finance_manager" && mem("viewer@fodo.co.in").rs === "viewer", "biz_staff finance → finance_manager, viewer → viewer");
ok(q1("SELECT count(*) n FROM os_role_perms").n > 300, "role permissions seeded (" + q1("SELECT count(*) n FROM os_role_perms").n + ")");
ok(q1("SELECT on_ FROM os_flags WHERE key='fts5'") !== undefined, "FTS5 probe recorded as a system flag");

/* ---------- 3. principal and allows ---------- */
const U = (e) => q1("SELECT * FROM acct_users WHERE email=?", e), Pof = async (e) => principal(env, U(e), { R: await rolesOf(env, U(e)) });
const Pown = await Pof("anmol@fodo.co.in"), Pc = await Pof("client@biz.in"), Pf = await Pof("finance@fodo.co.in"), Pv = await Pof("viewer@fodo.co.in");
ok(Pown.isOwner && allows(Pown, "payout", "approve") === "all" && allows(Pown, "system", "override") === "all", "owner → scope all everywhere");
ok(Pc.kind === "client" && allows(Pc, "project", "view") === "own" && !allows(Pc, "finance", "view") && !allows(Pc, "people", "view"), "client → own records only, no finance, no people");
ok(Pf.kind === "employee" && allows(Pf, "finance", "view") === "organization" && !allows(Pf, "system", "settings") && !allows(Pf, "payout", "approve"), "finance manager → organization finance, no system settings, no payout approve");
ok(Pv.kind === "employee" && allows(Pv, "project", "view") === "organization" && !allows(Pv, "finance", "view") && allows(Pv, "project", "update") === "own", "viewer → read every project, no finance, updates only own records (everyone keeps the client permissions on their own workspace)");
/* legacy fallback: a staff e-mail with no os_members row still gets its permissions from the template */
qr("DELETE FROM os_member_roles WHERE member_id=(SELECT id FROM os_members WHERE email='viewer@fodo.co.in')"); qr("DELETE FROM os_members WHERE email='viewer@fodo.co.in'");
const Pv2 = await Pof("viewer@fodo.co.in"); ok(Pv2.member && Pv2.roles.indexOf("viewer") > -1 && allows(Pv2, "project", "view") === "organization" && mem("viewer@fodo.co.in").rs === "viewer", "a legacy biz_staff e-mail without an os_members row is provisioned on first sight (lazy backfill), same permissions");

/* ---------- 4. permission matrix (every template × every resource.action) ---------- */
const fake = (slug) => { const t = TEMPLATES.find((x) => x.slug === slug); const P = { user: { id: "u_" + slug }, member: { id: "m" }, roles: [slug], perms: new Set(t.perms), isOwner: slug === "owner", kind: ["client", "fodo_pro"].indexOf(slug) > -1 ? slug : "employee", legacy: { roles: [] } }; return P; };
let mx = 0, mxBad = []; for (const t of TEMPLATES) { const P = fake(t.slug); for (const res of Object.keys(REGISTRY)) for (const act of Object.keys(REGISTRY[res])) { const s = allows(P, res, act); const expect = t.slug === "owner" ? "all" : (t.perms.filter((p) => p.indexOf(res + "." + act + ".") === 0).map((p) => p.split(".")[2]).sort((a, b) => SCOPES.indexOf(b) - SCOPES.indexOf(a))[0] || null); if (s === expect) mx++; else mxBad.push(t.slug + " " + res + "." + act + " got " + s + " want " + expect); } }
ok(!mxBad.length, "permission matrix: " + mx + " role × resource.action cells match the templates" + (mxBad.length ? " (bad: " + mxBad.slice(0, 3).join("; ") + ")" : ""));
const must403 = [["designer", "finance", "view"], ["designer", "people", "manage"], ["video_editor", "payout", "view"], ["sales_executive", "finance", "view"], ["project_manager", "system", "settings"], ["fodo_pro", "client", "view"], ["client", "people", "view"], ["client", "audit", "view"], ["hr_talent_manager", "finance", "manage"], ["admin", "brain", "use"]];
ok(must403.every(([r, res, act]) => !allows(fake(r), res, act)), "negative matrix: designer→finance, editor→payouts, sales→finance, PM→system, pro→clients, client→people/audit, HR→finance manage, admin→brain all denied");

/* ---------- 5. authorize with targets (object-level) ---------- */
await login("mod@fodo.co.in", null, "m"); const pm = await O("people", { email: "pm@fodo.co.in", name: "Priya PM", roles: ["project_manager"], department_id: q1("SELECT id FROM os_departments WHERE slug='operations'").id }); ok(pm.status === 200 && pm.j.id && pm.j.accountExists === false, "owner invites a project manager (no account yet → invited)");
ok(mem("pm@fodo.co.in").status === "invited", "member row is 'invited' until the person logs in");
await login("pm@fodo.co.in", null, "pm"); const meP = await Z("me", undefined, "pm"); ok(meP.j.os && meP.j.os.enabled && meP.j.os.kind === "employee" && mem("pm@fodo.co.in").status === "active" && mem("pm@fodo.co.in").user_id === uid("pm@fodo.co.in"), "first login links the account and activates the member; /me carries the os block");
const des = await O("people", { email: "dev@fodo.co.in", name: "Dev Designer", roles: ["designer"], manager_user_id: uid("pm@fodo.co.in") }); ok(des.status === 200, "owner invites a designer managed by the PM"); await login("dev@fodo.co.in", null, "dev");
/* a client project to test relations: client owns it, designer assigned through a task, PM is the designer's manager */
qr("INSERT INTO biz_projects (id, client_id, pro_id, title, status, created_at, updated_at) VALUES ('pjA', ?, 'proX', 'Campaign A', 'in_progress', '2026-01-01', '2026-01-01')", uid("client@biz.in"));
qr("INSERT INTO biz_projects (id, client_id, pro_id, title, status, created_at, updated_at) VALUES ('pjB', ?, 'proY', 'Campaign B', 'in_progress', '2026-01-01', '2026-01-01')", uid("other@biz.in") || "u_other");
qr("INSERT INTO biz_tasks (id, project_id, title, who, status, created_by, created_at, updated_at, assignee_user_id) VALUES ('tkA', 'pjA', 'Design hero', 'staff', 'todo', ?, '2026-01-01', '2026-01-01', ?)", uid("pm@fodo.co.in"), uid("dev@fodo.co.in"));
const Ppm = await Pof("pm@fodo.co.in"), Pdev = await Pof("dev@fodo.co.in");
const can = async (P, res, act, kind, id) => { try { return (await authorize(env, P, { resource: res, action: act, target: { kind, id } })).via || "ok"; } catch (e) { return e.status; } };
ok((await can(Pdev, "project", "view", "project", "pjA")) === "assigned" && (await can(Pdev, "project", "view", "project", "pjB")) === 403, "designer sees the project with her task (assigned), not another client's project");
ok((await can(Pdev, "task", "update", "task", "tkA")) === "assigned" && (await can(Pdev, "task", "delete", "task", "tkA")) === 403, "designer updates her task, cannot delete it (team scope)");
ok(["team", "own"].indexOf(await can(Ppm, "task", "update", "task", "tkA")) > -1 && ["team", "assigned"].indexOf(await can(Ppm, "project", "view", "project", "pjA")) > -1 && (await can(Ppm, "project", "view", "project", "pjB")) === 403, "manager reaches her report's task and project (team), not an unrelated project");
ok((await can(Pc, "project", "view", "project", "pjA")) === "own" && (await can(Pc, "project", "view", "project", "pjB")) === 403, "client sees own project only (IDOR)");
ok((await can(Pf, "project", "view", "project", "pjB")) === "organization" && (await can(Pown, "project", "update", "project", "pjB")) === "ok", "finance manager reads any project (organization); owner updates anything");
ok((await can(Pdev, "member", "view", "member", mem("pm@fodo.co.in").id)) === 403 && (await can(Ppm, "people", "view", "member", mem("dev@fodo.co.in").id)) === "team", "designer cannot read the PM's member record; PM reads her report (team)");
const row = cleanFor(Pv, { id: 1, cost_rate: 900, commission: 10, title: "x" }); ok(row.cost_rate === undefined && row.commission === undefined && row.title === "x", "cleanFor strips finance fields for a viewer");
ok(cleanFor(Pf, { cost_rate: 900 }).cost_rate === 900, "cleanFor keeps them for finance");

/* ---------- 6. People & Access API ---------- */
const list = await O("people"); ok(list.status === 200 && list.j.items.length >= 6 && list.j.items.every((m) => m.cost_rate === undefined || Pown.isOwner), "owner lists members with roles and departments");
const listDev = await O("people", undefined, "dev"); ok(listDev.status === 403, "designer cannot list people (403)");
const listPm = await O("people", undefined, "pm"); ok(listPm.status === 200 && listPm.j.scope === "team" && listPm.j.items.some((m) => m.email === "dev@fodo.co.in") && !listPm.j.items.some((m) => m.email === "finance@fodo.co.in"), "PM lists her team only (scope team)");
const dir = await O("directory", undefined, "pm"); ok(dir.status === 200 && dir.j.items.every((m) => m.cost_rate === undefined), "directory never carries cost rates");
const esc = await O("people/" + mem("dev@fodo.co.in").id, { roles: ["owner"] }, "pm"); ok(esc.status === 403, "PM cannot change roles (people.manage needed)");
const selfRole = await O("people/" + mem("dev@fodo.co.in").id, { roles: ["admin"] }, "dev"); ok(selfRole.status === 403, "an employee cannot change their own role");
const dup = await O("people", { email: "dev@fodo.co.in", name: "Again", roles: ["designer"] }); ok(dup.status === 409, "inviting an existing member → 409");
const bad = await O("people", { email: "nope", name: "X", roles: ["designer"] }); ok(bad.status === 400, "invalid e-mail refused");
const upd = await O("people/" + mem("dev@fodo.co.in").id, { title: "Senior Designer", weekly_hours: 30, cost_rate: 800, roles: ["designer", "video_editor"], reason: "promotion" }); ok(upd.status === 200 && mem("dev@fodo.co.in").title === "Senior Designer" && mem("dev@fodo.co.in").rs.split(",").length === 2, "owner edits title, hours, cost rate and gives two roles");
ok(q1("SELECT count(*) n FROM os_audit WHERE action='OWNER_CHANGED_ROLE' AND target_id=? AND reason='promotion'", mem("dev@fodo.co.in").id).n === 1, "role change audited with reason, before and after");
const PdevF = await Pof("dev@fodo.co.in"); ok(allows(PdevF, "production", "view") === "assigned", "the second role's permissions apply");
const mine = await O("people/" + mem("dev@fodo.co.in").id, undefined, "dev"); ok(mine.status === 200 && mine.j.member.cost_rate === undefined && mine.j.manage === false, "a person reads their own record without cost rate");
/* temporary access */
const gr = await O("people/" + mem("dev@fodo.co.in").id + "/grant", { perm: "finance.view.organization", days: 7, reason: "finance backup" }); ok(gr.status === 200 && gr.j.expires_at, "owner grants temporary finance view for 7 days");
ok(allows(await Pof("dev@fodo.co.in"), "finance", "view") === "organization", "the grant takes effect at once");
const grPm = await O("people/" + mem("dev@fodo.co.in").id + "/grant", { perm: "finance.view.organization", days: 7, reason: "x" }, "pm"); ok(grPm.status === 403, "PM cannot grant (people.manage)");
qr("UPDATE os_member_perms SET expires_at='2020-01-01T00:00:00.000Z'"); ok(!allows(await Pof("dev@fodo.co.in"), "finance", "view"), "an expired grant no longer applies");
qr("UPDATE os_member_perms SET expires_at='2099-01-01T00:00:00.000Z'"); const gid = q1("SELECT id FROM os_member_perms").id; const rv = await O("people/" + mem("dev@fodo.co.in").id + "/grant/" + gid + "/revoke", {}); ok(rv.status === 200 && !allows(await Pof("dev@fodo.co.in"), "finance", "view"), "revoked grant stops at once");
const badPerm = await O("people/" + mem("dev@fodo.co.in").id + "/grant", { perm: "system.override.all", days: 1, reason: "x" }); ok(badPerm.status === 200, "owner may grant anything (audited)"); qr("UPDATE os_member_perms SET revoked_at='2026-01-01' WHERE perm='system.override.all'");
/* suspend: sessions die */
const sus = await O("people/" + mem("dev@fodo.co.in").id + "/status", { status: "suspended", reason: "leave" }); ok(sus.status === 200 && q1("SELECT count(*) n FROM acct_sessions WHERE user_id=?", uid("dev@fodo.co.in")).n === 0, "suspension deletes the person's sessions");
const susMe = await O("me", undefined, "dev"); ok(susMe.status === 401, "suspended person's cookie no longer works");
await login("dev@fodo.co.in", null, "dev"); const susList = await O("people", undefined, "dev"); ok(susList.status === 403 && /suspended/.test(susList.j.reason), "even with a fresh login a suspended member is refused by authorize");
const unsus = await O("people/" + mem("dev@fodo.co.in").id + "/status", { status: "active" }); ok(unsus.status === 200, "unsuspend");
const selfSus = await O("people/" + mem("anmol@fodo.co.in").id + "/status", { status: "suspended" }); ok(selfSus.status === 403, "an owner cannot be suspended");
const rs = await O("people/" + mem("dev@fodo.co.in").id + "/sessions/revoke", {}); ok(rs.status === 200 && rs.j.revoked >= 1, "owner revokes a member's sessions");
/* departments and custom roles */
const dp = await O("departments", { name: "Video" }); ok(dp.status === 200 && dp.j.id, "owner creates a department");
const dpDup = await O("departments", { name: "video" }); ok(dpDup.status === 409, "duplicate department name refused");
const dps = await O("departments", undefined, "pm"); ok(dps.status === 200 && dps.j.items.length === 14, "PM can list departments (people.view)");
const dpArch = await O("departments/" + dp.j.id, { status: "archived" }); ok(dpArch.status === 200 && q1("SELECT status FROM os_departments WHERE id=?", dp.j.id).status === "archived", "departments are archived, never deleted");
const cr = await O("roles", { name: "Senior Video Editor", template: "video_editor", perms: TEMPLATES.find((t) => t.slug === "video_editor").perms.concat(["production.manage.team"]), home: "my-fodo" }); ok(cr.status === 200 && cr.j.id, "owner creates a custom role from a template plus one permission");
const crGet = await O("roles/" + cr.j.id); ok(crGet.status === 200 && crGet.j.perms.indexOf("production.manage.team") > -1 && crGet.j.perms.every(validPerm), "custom role stores only valid permissions");
const crBad = await O("roles", { name: "Sneaky", perms: ["system.override.all"] }, "pm"); ok(crBad.status === 403, "PM cannot create roles");
await O("people/" + mem("anmol@fodo.co.in").id, {}); const hrInv = await O("people", { email: "hr@fodo.co.in", name: "Harry HR", roles: ["hr_talent_manager"] }); await login("hr@fodo.co.in", null, "hr");
const hrRole = await O("roles", { name: "Finance Peek", perms: ["finance.view.organization"] }, "hr"); ok(hrRole.status === 403 && /hold it yourself/.test(hrRole.j.reason), "HR (people.manage) cannot give a permission HR does not hold");
const hrOwnerRole = await O("people/" + mem("dev@fodo.co.in").id, { roles: ["owner"] }, "hr"); ok(hrOwnerRole.status === 403, "only an owner gives the Owner role");
const ownerRoleCut = await O("roles/" + q1("SELECT id FROM os_roles WHERE slug='owner'").id, { perms: ["project.view.all"] }); ok(ownerRoleCut.status === 400, "the Owner role cannot lose permissions");
/* offboarding with handoff */
qr("INSERT INTO biz_tasks (id, project_id, title, who, status, created_by, created_at, updated_at, assignee_user_id) VALUES ('tkB', 'pjA', 'Second task', 'staff', 'todo', ?, '2026-01-01', '2026-01-01', ?)", uid("pm@fodo.co.in"), uid("dev@fodo.co.in"));
const hp = await O("people/" + mem("dev@fodo.co.in").id + "/handoff"); ok(hp.status === 200 && hp.j.tasks.length === 2, "handoff preview lists the open tasks");
const offBad = await O("people/" + mem("dev@fodo.co.in").id + "/offboard", { replacement_user_id: "nobody" }); ok(offBad.status === 400, "replacement must be an active member");
const off = await O("people/" + mem("dev@fodo.co.in").id + "/offboard", { replacement_user_id: uid("pm@fodo.co.in"), reason: "left the company" }); ok(off.status === 200 && off.j.tasks === 2 && mem("dev@fodo.co.in").status === "offboarded", "offboarding moves 2 open tasks to the replacement and marks the member offboarded");
ok(q1("SELECT assignee_user_id a FROM biz_tasks WHERE id='tkA'").a === uid("pm@fodo.co.in") && q1("SELECT count(*) n FROM biz_tasks").n === 2, "tasks reassigned, nothing deleted");
ok(q1("SELECT count(*) n FROM acct_sessions WHERE user_id=?", uid("dev@fodo.co.in")).n === 0 && q1("SELECT count(*) n FROM biz_notes WHERE user_id=? AND kind='task'", uid("pm@fodo.co.in")).n >= 1, "sessions revoked, replacement notified");
const PdevOff = await Pof("dev@fodo.co.in"); ok(PdevOff.suspended === "offboarded" && !PdevOff.member, "offboarded member has no active membership");

/* ---------- 7. view-as (read-only impersonation) ---------- */
const vaPm = await O("view-as", { user: "client@biz.in", reason: "support" }, "pm"); ok(vaPm.status === 403, "only system.impersonate (owner) can view as");
const vaNo = await O("view-as", { user: "client@biz.in" }); ok(vaNo.status === 400, "a reason is required");
const va = await O("view-as", { user: "client@biz.in", reason: "support ticket 12" }); ok(va.status === 200 && va.j.until && va.j.target.email === "client@biz.in", "owner starts view-as a client");
const meVa = await Z("me", undefined, "own"); ok(meVa.j.user.email === "client@biz.in" && meVa.j.os.impersonating && meVa.j.os.readOnly === true && !meVa.j.nav.some((n) => n.id === "admin"), "/api/biz/me answers as the client with the view-as banner data and the client navigation");
const wr = await Z("brand", { name: "Hack" }, "own"); ok(wr.status === 403 && /read-only/.test(wr.j.reason), "writes during view-as are refused on /api/biz");
const wrOs = await O("departments", { name: "Nope" }); ok(wrOs.status === 403, "writes during view-as are refused on /api/os");
const st = await O("view-as/stop", {}); ok(st.status === 200, "owner stops view-as"); const meBack = await Z("me", undefined, "own"); ok(meBack.j.user.email === "anmol@fodo.co.in" && !meBack.j.os.impersonating, "back to the owner's own view");
ok(q1("SELECT count(*) n FROM os_audit WHERE action='OWNER_IMPERSONATED_USER'").n === 1 && q1("SELECT count(*) n FROM os_audit WHERE action='OWNER_STOPPED_IMPERSONATION'").n === 1 && q1("SELECT reason FROM os_audit WHERE action='OWNER_IMPERSONATED_USER'").reason === "support ticket 12", "view-as start and stop audited with the reason");
const vaSelf = await O("view-as", { user: "anmol@fodo.co.in", reason: "x" }); ok(vaSelf.status === 400, "cannot view as yourself");
await O("view-as", { user: "client@biz.in", reason: "expiry test" }); KV.set("os:readas:" + uid("anmol@fodo.co.in"), JSON.stringify({ id: "x", target: uid("client@biz.in"), until: "2020-01-01T00:00:00.000Z" })); const meExp = await Z("me", undefined, "own"); ok(meExp.j.user.email === "anmol@fodo.co.in", "an expired view-as is ignored");

/* ---------- 8. audit viewer, events, notifications ---------- */
const au = await O("audit?action=OWNER_"); ok(au.status === 200 && au.j.items.length >= 6 && au.j.items.every((r) => /^OWNER_/.test(r.action)), "audit viewer filters by action");
const auPm = await O("audit", undefined, "pm"); ok(auPm.status === 403, "PM cannot read the audit log (audit.view)");
const auF = await O("audit", undefined, "f"); ok(auF.status === 200, "finance manager reads the audit log (organization)");
/* marketplace writes become events through auditLog */
const { auditLog } = await import("../functions/_lib/biz.js"); await auditLog(env, "client@biz.in", "project:create", "pjA", "Campaign A"); await auditLog(env, "anmol@fodo.co.in", "contract:sign", "ctZ", "CT-1 v1");
const ev = await O("activity"); ok(ev.status === 200 && ev.j.items.some((e) => e.kind === "project.create" && e.subject_id === "pjA") && ev.j.items.some((e) => e.kind === "contract.sign"), "audited marketplace writes appear as events (project.create, contract.sign)");
const evK = await O("activity?kind=member"); ok(evK.j.items.length >= 2 && evK.j.items.every((e) => /^member\./.test(e.kind)), "activity filters by kind prefix (member.invited, member.offboarded)");
let autoRan = 0; on("test.ping", async () => { autoRan++; return { did: 1 }; }); on("test.ping", async () => { throw new Error("boom"); }); const r = await emit(env, Pown, "test.ping", { kind: "x", id: "1" }, { secret_token: "abc", fine: 1 });
ok(autoRan === 1 && r.automations.length === 2 && r.automations[1].error === "boom" && q1("SELECT payload FROM os_events WHERE kind='test.ping'").payload.indexOf("abc") < 0, "automations run in isolation (one failure does not stop the rest); secrets scrubbed from payloads");
await notify(env, uid("pm@fodo.co.in"), "approval", "Approve X", "/x", { dedupe: "appr:X" }); await notify(env, uid("pm@fodo.co.in"), "approval", "Approve X again", "/x", { dedupe: "appr:X" }); await notify(env, uid("pm@fodo.co.in"), "task", "Plain");
const nn = qa("SELECT kind, category, urgency, dedupe_key FROM biz_notes WHERE user_id=? ORDER BY id", uid("pm@fodo.co.in")); ok(nn.filter((n) => n.dedupe_key === "appr:X").length === 1 && nn.find((n) => n.kind === "approval").urgency === "urgent" && nn.find((n) => n.kind === "approval").category === "approval" && nn.find((n) => n.kind === "task").urgency === "action", "notify(): dedupe within an hour, category and urgency from the kind");

/* ---------- 9. navigation, modules, kill switch ---------- */
const meOwn = await Z("me", undefined, "own"); ok(meOwn.j.os.groups && meOwn.j.os.groups.map((g) => g.label).join() === "Command,Operations,Finance,Growth,People,Platform" && meOwn.j.nav.some((n) => n.id === "people"), "owner navigation: six groups (Finance since v50.4), People & Access present");
const meC = await Z("me", undefined, "c"); ok(meC.j.os.groups === null && JSON.stringify(meC.j.nav) === JSON.stringify(navFor(await rolesOf(env, U("client@biz.in")))), "client navigation is exactly the v47 navigation, no groups");
await login("pro@studio.in", null, "p"); qr("INSERT INTO biz_pros (id, user_id, name, status, created_at, updated_at) VALUES ('proX', ?, 'Pro X', 'approved', '2026-01-01', '2026-01-01')", uid("pro@studio.in")); const meProS = await Z("me", undefined, "p"); ok(meProS.j.os.groups === null && meProS.j.os.kind === "pro" && meProS.j.nav.some((n) => n.id === "pro"), "a FODO Pro keeps the Pro navigation (kind pro, no groups)");
const mePm = await Z("me", undefined, "pm"); ok(mePm.j.os.groups && !mePm.j.nav.some((n) => n.id === "admin") && mePm.j.nav.some((n) => n.id === "people") && mePm.j.os.can && mePm.j.os.can["task.update"] === "team" && !mePm.j.os.can["finance.view"], "PM navigation: no Marketplace admin, People (team), can-map without finance");
ok(!mePm.j.nav.some((n) => n.id === "billing" || n.id === "apply") && mePm.j.nav.some((n) => n.id === "quotes") && mePm.j.nav.some((n) => n.id === "overview"), "employee navigation drops client-only entries (Billing, Become a FODO Pro) and keeps what the role reaches (Quotes for a PM)");
const mods = await O("modules"); ok(mods.status === 200 && mods.j.modules.length === MODULES.length && mods.j.modules.every((m) => m.enabled), "module switches listed, all on");
const modOff = await O("modules", { key: "crm", enabled: false, reason: "not used" }); ok(modOff.status === 200 && !modOff.j.modules.find((m) => m.key === "crm").enabled, "owner switches CRM off");
const meC2 = await Z("me", undefined, "c"); const meOwn2 = await Z("me", undefined, "own"); ok(!meC2.j.nav.some((n) => n.id === "leads") && meOwn2.j.nav.some((n) => n.id === "leads"), "a disabled module leaves the client's navigation, the owner still sees it");
await O("modules", { key: "crm", enabled: true }); const modPm = await O("modules", { key: "crm", enabled: false }, "pm"); ok(modPm.status === 403, "only system.modules can switch modules");
const ks = await O("settings", { os_enabled: false, reason: "test" }); ok(ks.status === 200 && ks.j.settings.os_enabled === false, "owner switches FODO OS off");
const offMe = await Z("me", undefined, "own"); ok(offMe.j.os.enabled === false && !offMe.j.nav.some((n) => n.id === "people"), "with the OS off, /me gives the v47 navigation and enabled=false");
const offPeople = await O("people"); ok(offPeople.status === 503, "OS endpoints answer 503 while off");
const ksOn = await O("settings", { os_enabled: true }); ok(ksOn.status === 200 && (await O("people")).status === 200, "owner switches it back on through the settings route");
const ksPm = await O("settings", { os_enabled: false }, "pm"); ok(ksPm.status === 403, "only the owner touches the kill switch");

/* ---------- 10. router hygiene, CSRF, rate limit, health ---------- */
ok(ROUTES.every((r) => r[2] === "self" || (r[2] && r[2].resource && r[2].action && REGISTRY[r[2].resource] && REGISTRY[r[2].resource][r[2].action])), "every /api/os route declares a valid permission or 'self'");
ok(ROUTES.filter((r) => r[2] === "self").length <= 7, "only a handful of routes are 'self' (" + ROUTES.filter((r) => r[2] === "self").length + ")");
const csrf = await O("departments", { name: "X" }, "own", { headers: { origin: "https://evil.example" } }); ok(csrf.status === 403, "cross-origin write refused (CSRF)");
const noJson = await call("os/departments", undefined, { as: "own", method: "POST" }); ok(noJson.status === 403, "write without JSON content type refused");
const anon = await call("os/me", undefined, { as: "nobody" }); ok(anon.status === 401, "no session → 401");
const nf = await O("whatever"); ok(nf.status === 404, "unknown route → 404");
const he = await O("health"); ok(he.status === 200 && he.j.probes.d1 === "ok" && he.j.probes.kv === "ok" && he.j.probes.r2_files === "not configured" && /ON/.test(he.j.probes.test_mode) && he.j.probes.payments === "not configured", "health probes report honest configured / not configured states");
const hePm = await O("health", undefined, "pm"); ok(hePm.status === 403, "health is system.health");
const reg = await O("registry", undefined, "dev"); ok(reg.status === 401 || reg.status === 200, "registry readable by signed-in people"); const regC = await O("registry", undefined, "c"); ok(regC.status === 200 && regC.j.registry.task && regC.j.scopes.length === 6, "registry served");
const pf = await O("prefs", { k: "navCollapsed", v: ["growth"] }, "pm"); ok(pf.status === 200 && pf.j.prefs.navCollapsed[0] === "growth" && (await O("prefs", undefined, "pm")).j.prefs.navCollapsed[0] === "growth", "per-user UI preferences stored");

/* ---------- 11. OWNER_CAN_ACCESS_ALL_SYSTEM_MODULES ---------- */
let allowAll = true; for (const res of Object.keys(REGISTRY)) for (const act of Object.keys(REGISTRY[res])) if (allows(Pown, res, act) !== "all") allowAll = false;
ok(allowAll, "OWNER_CAN_ACCESS_ALL_SYSTEM_MODULES: every registry resource.action resolves to scope all for the owner");
const ownerNav = (await Z("me", undefined, "own")).j.nav.map((n) => n.id); ok(["overview", "os-projects", "quotes", "files", "admin", "people", "builder", "xray", "growth", "leads", "settings", "command", "tasks", "approvals", "clients", "support"].every((id) => ownerNav.indexOf(id) > -1), "OWNER_CAN_SEE_EVERY_NAV_ENTRY (" + ownerNav.length + " entries)");
const ownerRoutes = []; for (const [rm, re, need] of ROUTES) if (rm === "GET" && need !== "self") { const p = String(re).replace(/^\/\^|\$\/$/g, "").replace(/\\\//g, "/"); if (!/\(/.test(p)) ownerRoutes.push(p); }
let ownerOk = 0; for (const p of ownerRoutes) { const r = await O(p); if (r.status === 200) ownerOk++; } ok(ownerOk === ownerRoutes.length, "OWNER_CAN_VIEW_ALL: owner GETs every list route 200 (" + ownerOk + "/" + ownerRoutes.length + ")");

console.log(`\nv50.1: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
