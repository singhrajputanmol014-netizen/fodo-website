/* FODO OS V4, Phase 1 (v50.1): /api/os/*. Every request: session → CSRF (same origin + JSON on writes) → rate limit → view-as →
   principal() → the route's declared permission (authorize) → module → { ok }. Deny by default: a route without a `need`
   entry cannot be registered (scripts/check.mjs fails the build), and `need: "self"` is allowed only for the handful of
   routes that return the caller's own data. Kill switch: biz_settings.os_enabled = "0" answers 503 for everything but the
   owner's settings call, so FODO OS can be switched off without a deploy.
   GET  registry · me · modules (owner) · people[?q&status&department] · people/<id> · people/<id>/handoff · directory[?q] · departments · roles · roles/<id>
        audit[?actor&action&target&before&src] · activity[?kind&actor&subject&before] · prefs · settings (owner) · health (owner, Phase 1 subset)
   POST people (invite) · people/<id> (edit, roles) · people/<id>/status {status, reason} · people/<id>/grant {perm, days, reason} · people/<id>/grant/<gid>/revoke
        people/<id>/sessions/revoke · people/<id>/offboard {replacement_user_id, reason} · departments · departments/<id> · roles · roles/<id>
        view-as {user, reason} · view-as/stop · prefs {k, v} · settings {os_enabled} (owner) · modules {key, enabled} (owner) */
import { json, accountsOn, sessionUser, sameOrigin, count, nowIso, payOn } from "../../_lib/accounts.js";
import * as B from "../../_lib/biz.js";
import { osdb, one, run, J, clip, prefGet, prefSet } from "../../_lib/os/db.js";
import { principal, authorize, describe } from "../../_lib/os/authz.js";
import { audit, auditList, events } from "../../_lib/os/audit.js";
import * as PE from "../../_lib/os/people.js";
import * as IM from "../../_lib/os/impersonate.js";
import { moduleList, modulesOff } from "../../_lib/os/nav.js";
import * as TK from "../../_lib/os/tasks.js";
import * as AP from "../../_lib/os/approvals.js";
import * as WK from "../../_lib/os/work.js";
import * as CL from "../../_lib/os/clients.js";
import * as PJ from "../../_lib/os/projects.js";
import * as SP from "../../_lib/os/support.js";
import * as CC from "../../_lib/os/command.js";
import * as HR from "../../_lib/os/hr.js";
import * as PS from "../../_lib/os/pros.js";

const err = (reason, status) => json({ ok: false, reason }, status || 400);
/* route table: method, path pattern, permission needed (resource + action, or "self"), handler(ctx, match) */
export const ROUTES = [
  ["GET", /^registry$/, "self", () => PE.registry()],
  ["GET", /^me$/, "self", (c) => ({ me: describe(c.P), enabled: true })],
  ["GET", /^prefs$/, "self", async (c) => ({ prefs: await prefGet(await osdb(c.env), c.P.user.id, "ui", {}) })],
  ["POST", /^prefs$/, "self", async (c) => { const d = await osdb(c.env), cur = await prefGet(d, c.P.user.id, "ui", {}), k = clip(c.body.k, 40); if (!k) throw Object.assign(new Error("Missing key."), { status: 400 }); cur[k] = c.body.v == null ? undefined : (typeof c.body.v === "string" ? clip(c.body.v, 200) : c.body.v); await prefSet(d, c.P.user.id, "ui", JSON.parse(JSON.stringify(cur))); return { prefs: cur }; }],
  ["GET", /^people$/, { resource: "people", action: "view" }, (c) => PE.members(c.env, c.P, c.q)],
  ["GET", /^directory$/, "self", (c) => PE.directory(c.env, c.P, c.q)],
  ["POST", /^people$/, { resource: "people", action: "manage" }, (c) => PE.invite(c.env, c.P, c.body, c.origin)],
  ["GET", /^people\/([a-z0-9]+)$/, { resource: "people", action: "view" }, (c, m) => PE.member(c.env, c.P, m[1])],
  ["GET", /^people\/([a-z0-9]+)\/handoff$/, { resource: "people", action: "manage" }, (c, m) => PE.handoffPreview(c.env, c.P, m[1])],
  ["POST", /^people\/([a-z0-9]+)$/, { resource: "people", action: "manage" }, (c, m) => PE.update(c.env, c.P, m[1], c.body)],
  ["POST", /^people\/([a-z0-9]+)\/status$/, { resource: "people", action: "manage" }, (c, m) => PE.setStatus(c.env, c.P, m[1], c.body.status, c.body.reason)],
  ["POST", /^people\/([a-z0-9]+)\/grant$/, { resource: "people", action: "manage" }, (c, m) => PE.grant(c.env, c.P, m[1], c.body)],
  ["POST", /^people\/([a-z0-9]+)\/grant\/([a-z0-9]+)\/revoke$/, { resource: "people", action: "manage" }, (c, m) => PE.revokeGrant(c.env, c.P, m[1], m[2])],
  ["POST", /^people\/([a-z0-9]+)\/sessions\/revoke$/, { resource: "people", action: "manage" }, (c, m) => PE.revokeSessions(c.env, c.P, m[1])],
  ["POST", /^people\/([a-z0-9]+)\/offboard$/, { resource: "people", action: "manage" }, (c, m) => PE.offboard(c.env, c.P, m[1], c.body)],
  ["GET", /^departments$/, { resource: "people", action: "view" }, (c) => PE.departments(c.env, c.P)],
  ["POST", /^departments$/, { resource: "people", action: "manage" }, (c) => PE.saveDepartment(c.env, c.P, null, c.body)],
  ["POST", /^departments\/([a-z0-9]+)$/, { resource: "people", action: "manage" }, (c, m) => PE.saveDepartment(c.env, c.P, m[1], c.body)],
  ["GET", /^roles$/, { resource: "people", action: "view" }, (c) => PE.roles(c.env, c.P)],
  ["GET", /^roles\/([a-z0-9]+)$/, { resource: "people", action: "view" }, (c, m) => PE.role(c.env, c.P, m[1])],
  ["POST", /^roles$/, { resource: "people", action: "manage" }, (c) => PE.saveRole(c.env, c.P, null, c.body)],
  ["POST", /^roles\/([a-z0-9]+)$/, { resource: "people", action: "manage" }, (c, m) => PE.saveRole(c.env, c.P, m[1], c.body)],
  ["GET", /^audit$/, { resource: "audit", action: "view" }, (c) => auditList(c.env, c.q)],
  ["GET", /^activity$/, { resource: "audit", action: "view" }, (c) => events(c.env, c.q)],
  ["POST", /^view-as$/, { resource: "system", action: "impersonate" }, (c) => IM.start(c.env, c.P, c.body)],
  ["POST", /^view-as\/stop$/, "self", (c) => IM.stop(c.env, { user: c.P.impersonator ? c.P.impersonator.user : c.P.user })],
  ["GET", /^settings$/, { resource: "system", action: "settings" }, async (c) => ({ settings: { os_enabled: await enabled(c.env) } })],
  ["POST", /^settings$/, { resource: "system", action: "settings" }, async (c) => { const d = await osdb(c.env), on = c.body.os_enabled === false || c.body.os_enabled === "0" ? "0" : "1"; await run(d, "INSERT OR REPLACE INTO biz_settings (k, v) VALUES ('os_enabled', ?1)", on); await audit(c.env, c.P, "OWNER_CHANGED_SYSTEM_SETTING", { kind: "setting", id: "os_enabled" }, null, { os_enabled: on }, c.body.reason); return { settings: { os_enabled: on === "1" } }; }],
  ["GET", /^health$/, { resource: "system", action: "health" }, (c) => health(c.env)],
  /* ---- Phase 2 (v50.2) ---- */
  ["GET", /^my$/, { resource: "task", action: "view" }, (c) => WK.my(c.env, c.P)],
  ["GET", /^tasks$/, { resource: "task", action: "view" }, (c) => TK.list(c.env, c.P, c.q)],
  ["GET", /^tasks\/board$/, { resource: "task", action: "view" }, (c) => TK.board(c.env, c.P, c.q)],
  ["POST", /^tasks$/, { resource: "task", action: "create" }, (c) => TK.create(c.env, c.P, c.body)],
  ["GET", /^tasks\/([a-z0-9]+)$/, { resource: "task", action: "view" }, (c, m) => TK.get(c.env, c.P, m[1])],
  ["POST", /^tasks\/([a-z0-9]+)$/, { resource: "task", action: "update" }, (c, m) => TK.update(c.env, c.P, m[1], c.body)],
  ["POST", /^tasks\/([a-z0-9]+)\/status$/, { resource: "task", action: "update" }, (c, m) => TK.setStatus(c.env, c.P, m[1], c.body.status, c.body.note)],
  ["POST", /^tasks\/([a-z0-9]+)\/deps$/, { resource: "task", action: "update" }, (c, m) => TK.addDep(c.env, c.P, m[1], clip(c.body.depends_on, 40))],
  ["POST", /^tasks\/([a-z0-9]+)\/deps\/remove$/, { resource: "task", action: "update" }, (c, m) => TK.removeDep(c.env, c.P, m[1], clip(c.body.depends_on, 40))],
  ["POST", /^tasks\/([a-z0-9]+)\/comment$/, { resource: "task", action: "view" }, (c, m) => TK.comment(c.env, c.P, m[1], c.body.body)],
  ["POST", /^tasks\/([a-z0-9]+)\/cancel$/, { resource: "task", action: "delete" }, (c, m) => TK.remove(c.env, c.P, m[1])],
  ["GET", /^approvals$/, { resource: "approval", action: "request" }, (c) => AP.list(c.env, c.P, c.q)],
  ["POST", /^approvals$/, { resource: "approval", action: "request" }, (c) => AP.request(c.env, c.P, c.body)],
  ["GET", /^approvals\/([a-z0-9]+)$/, { resource: "approval", action: "request" }, (c, m) => AP.get(c.env, c.P, m[1])],
  ["POST", /^approvals\/([a-z0-9]+)\/decide$/, { resource: "approval", action: "request" }, (c, m) => AP.decide(c.env, c.P, m[1], c.body)],
  ["POST", /^approvals\/([a-z0-9]+)\/cancel$/, { resource: "approval", action: "request" }, (c, m) => AP.cancel(c.env, c.P, m[1])],
  ["GET", /^queues$/, { resource: "task", action: "view" }, (c) => ({ items: WK.queuesFor(c.P) })],
  ["GET", /^queue\/([a-z]+)$/, { resource: "task", action: "view" }, (c, m) => WK.queue(c.env, c.P, m[1])],
  ["GET", /^calendar$/, { resource: "calendar", action: "view" }, (c) => WK.calendar(c.env, c.P, c.q)],
  ["GET", /^workload$/, { resource: "workload", action: "view" }, (c) => WK.workload(c.env, c.P, c.q)],
  ["GET", /^clients$/, { resource: "client", action: "view" }, (c) => CL.list(c.env, c.P, c.q)],
  ["POST", /^clients$/, { resource: "client", action: "manage" }, (c) => CL.save(c.env, c.P, null, c.body)],
  ["GET", /^clients\/pipeline$/, { resource: "crm", action: "view" }, (c) => CL.pipeline(c.env, c.P)],
  ["POST", /^clients\/handover$/, { resource: "project", action: "create" }, (c) => CL.handover(c.env, c.P, c.body)],
  ["GET", /^clients\/([a-z0-9]+)$/, { resource: "client", action: "view" }, (c, m) => CL.get(c.env, c.P, m[1])],
  ["POST", /^clients\/([a-z0-9]+)$/, { resource: "client", action: "manage" }, (c, m) => CL.save(c.env, c.P, m[1], c.body)],
  ["GET", /^projects$/, { resource: "project", action: "view" }, (c) => PJ.list(c.env, c.P, c.q)],
  ["POST", /^projects$/, { resource: "project", action: "create" }, (c) => PJ.create(c.env, c.P, c.body)],
  ["GET", /^projects\/([a-z0-9]+)$/, { resource: "project", action: "view" }, (c, m) => PJ.get(c.env, c.P, m[1])],
  ["POST", /^projects\/([a-z0-9]+)$/, { resource: "project", action: "update" }, (c, m) => PJ.update(c.env, c.P, m[1], c.body)],
  ["POST", /^projects\/([a-z0-9]+)\/brief$/, { resource: "project", action: "update" }, (c, m) => PJ.saveBrief(c.env, c.P, m[1], c.body)],
  ["POST", /^projects\/([a-z0-9]+)\/scope$/, { resource: "project", action: "update" }, (c, m) => PJ.scopeAdd(c.env, c.P, m[1], c.body)],
  ["POST", /^projects\/([a-z0-9]+)\/deliverable$/, { resource: "project", action: "view" }, (c, m) => PJ.deliverable(c.env, c.P, m[1], c.body)],
  ["POST", /^projects\/([a-z0-9]+)\/risk$/, { resource: "project", action: "update" }, (c, m) => PJ.risk(c.env, c.P, m[1], c.body)],
  ["POST", /^projects\/([a-z0-9]+)\/report$/, { resource: "project", action: "update" }, (c, m) => PJ.dailyReport(c.env, c.P, m[1], c.body)],
  ["GET", /^support$/, { resource: "message", action: "read" }, (c) => SP.mine(c.env, c.P)],
  ["POST", /^support$/, { resource: "message", action: "write" }, (c) => SP.create(c.env, c.P, c.body, c.origin)],
  ["GET", /^support\/queue$/, { resource: "client", action: "view" }, (c) => SP.queue(c.env, c.P, c.q)],
  ["GET", /^support\/([A-Za-z0-9_-]+)$/, { resource: "message", action: "read" }, (c, m) => SP.thread(c.env, c.P, m[1])],
  ["POST", /^support\/([A-Za-z0-9_-]+)\/reply$/, { resource: "message", action: "write" }, (c, m) => SP.reply(c.env, c.P, m[1], c.body, c.origin)],
  ["POST", /^support\/([A-Za-z0-9_-]+)\/status$/, { resource: "client", action: "view" }, (c, m) => SP.setStatus(c.env, c.P, m[1], c.body)],
  ["POST", /^support\/([A-Za-z0-9_-]+)\/rate$/, { resource: "message", action: "write" }, (c, m) => SP.rate(c.env, c.P, m[1], c.body)],
  ["GET", /^command$/, { resource: "analytics", action: "view" }, (c) => CC.centre(c.env, c.P)],
  ["GET", /^tower$/, { resource: "analytics", action: "view" }, (c) => CC.tower(c.env, c.P)],
  ["GET", /^search$/, { resource: "task", action: "view" }, (c) => CC.search(c.env, c.P, c.q)],
  /* v50.3 Phase 3: HR */
  ["GET", /^hr\/policy$/, { resource: "hr", action: "view" }, async (c) => ({ policy: await HR.policy(c.env, c.P), attendance: await HR.attendanceEnabled(c.env) })],
  ["POST", /^hr\/policy$/, { resource: "system", action: "settings" }, (c) => HR.savePolicy(c.env, c.P, c.body)],
  ["POST", /^hr\/attendance\/enable$/, { resource: "system", action: "settings" }, (c) => HR.setAttendance(c.env, c.P, !!c.body.enabled)],
  ["GET", /^hr\/balance$/, { resource: "hr", action: "view" }, (c) => HR.balance(c.env, c.P, c.q.user_id ? clip(c.q.user_id, 40) : null)],
  ["GET", /^hr\/leave$/, { resource: "hr", action: "view" }, (c) => HR.leaveList(c.env, c.P, c.q)],
  ["POST", /^hr\/leave$/, { resource: "hr", action: "view" }, (c) => HR.leaveCreate(c.env, c.P, c.body)],
  ["POST", /^hr\/leave\/([A-Za-z0-9_-]+)\/decide$/, { resource: "hr", action: "view" }, (c, m) => HR.leaveDecide(c.env, c.P, m[1], c.body.decision, c.body.note)],
  ["POST", /^hr\/leave\/([A-Za-z0-9_-]+)\/cancel$/, { resource: "hr", action: "view" }, (c, m) => HR.leaveCancel(c.env, c.P, m[1])],
  ["GET", /^hr\/reviews$/, { resource: "hr", action: "view" }, (c) => HR.reviewList(c.env, c.P, c.q)],
  ["POST", /^hr\/reviews$/, { resource: "hr", action: "manage" }, (c) => HR.reviewCreate(c.env, c.P, c.body)],
  ["GET", /^hr\/reviews\/([A-Za-z0-9_-]+)$/, { resource: "hr", action: "view" }, (c, m) => HR.reviewGet(c.env, c.P, m[1])],
  ["POST", /^hr\/reviews\/([A-Za-z0-9_-]+)$/, { resource: "hr", action: "view" }, (c, m) => HR.reviewUpdate(c.env, c.P, m[1], c.body)],
  ["GET", /^hr\/training$/, { resource: "hr", action: "view" }, (c) => HR.trainingList(c.env, c.P, c.q)],
  ["POST", /^hr\/training$/, { resource: "hr", action: "view" }, (c) => HR.trainingCreate(c.env, c.P, c.body)],
  ["POST", /^hr\/training\/([A-Za-z0-9_-]+)$/, { resource: "hr", action: "view" }, (c, m) => HR.trainingUpdate(c.env, c.P, m[1], c.body)],
  ["GET", /^hr\/skills$/, { resource: "hr", action: "view" }, (c) => HR.skills(c.env, c.P, c.q)],
  ["POST", /^hr\/skills$/, { resource: "hr", action: "view" }, (c) => HR.setSkills(c.env, c.P, c.body.user_id ? clip(c.body.user_id, 40) : null, c.body.skills)],
  ["GET", /^hr\/checklists$/, { resource: "hr", action: "view" }, (c) => HR.checklists(c.env, c.P, c.q)],
  ["POST", /^hr\/checklists$/, { resource: "hr", action: "manage" }, (c) => HR.checklistStart(c.env, c.P, c.body)],
  ["POST", /^hr\/checklists\/([A-Za-z0-9_-]+)\/tick$/, { resource: "hr", action: "view" }, (c, m) => HR.checklistTick(c.env, c.P, m[1], c.body.idx, !!c.body.done)],
  ["GET", /^hr\/capacity$/, { resource: "workload", action: "view" }, (c) => HR.capacity(c.env, c.P, c.q)],
  ["GET", /^hr\/attendance$/, { resource: "hr", action: "view" }, (c) => HR.attendance(c.env, c.P, c.q)],
  ["POST", /^hr\/attendance$/, { resource: "hr", action: "view" }, (c) => HR.attendanceMark(c.env, c.P, c.body)],
  ["GET", /^hr\/profile$/, { resource: "hr", action: "view" }, (c) => HR.profile(c.env, c.P, c.q.user_id ? clip(c.q.user_id, 40) : null)],
  /* v50.3 Phase 3: FODO Pros in the OS */
  ["GET", /^pros$/, { resource: "pro", action: "view" }, (c) => PS.list(c.env, c.P, c.q)],
  ["POST", /^pros\/match$/, { resource: "pro", action: "view" }, (c) => PS.match(c.env, c.P, c.body)],
  ["GET", /^pros\/bookings$/, { resource: "calendar", action: "view" }, (c) => PS.bookingChanges(c.env, c.P, c.q)],
  ["POST", /^pros\/bookings\/reschedule$/, { resource: "calendar", action: "view" }, (c) => PS.reschedule(c.env, c.P, c.body)],
  ["POST", /^pros\/bookings\/cancel$/, { resource: "calendar", action: "view" }, (c) => PS.cancelBooking(c.env, c.P, c.body)],
  ["POST", /^pros\/bookings\/([A-Za-z0-9_-]+)\/decide$/, { resource: "production", action: "manage" }, (c, m) => PS.decideChange(c.env, c.P, m[1], c.body)],
  ["POST", /^pros\/appeals$/, { resource: "pro", action: "view" }, (c) => PS.appeal(c.env, c.P, c.body)],
  ["POST", /^pros\/appeals\/([A-Za-z0-9_-]+)\/decide$/, { resource: "pro", action: "manage" }, (c, m) => PS.decideAppeal(c.env, c.P, m[1], c.body)],
  ["GET", /^pros\/workroom$/, { resource: "pro", action: "view" }, (c) => PS.workroom(c.env, c.P)],
  ["GET", /^pros\/([A-Za-z0-9_-]+)\/passport$/, { resource: "pro", action: "view" }, (c, m) => PS.passport(c.env, c.P, m[1])],
  ["POST", /^pros\/([A-Za-z0-9_-]+)\/lifecycle$/, { resource: "pro", action: "manage" }, (c, m) => PS.setLifecycle(c.env, c.P, m[1], c.body)],
  ["GET", /^pros\/([A-Za-z0-9_-]+)\/rules$/, { resource: "pro", action: "view" }, (c, m) => PS.rules(c.env, c.P, m[1])],
  ["POST", /^pros\/([A-Za-z0-9_-]+)\/hours$/, { resource: "pro", action: "view" }, (c, m) => PS.saveHours(c.env, c.P, m[1], c.body)],
  ["GET", /^teams\/([A-Za-z0-9_-]+)\/assembly$/, { resource: "production", action: "manage" }, (c, m) => PS.assembly(c.env, c.P, m[1])],
  ["POST", /^teams\/([A-Za-z0-9_-]+)\/assign$/, { resource: "production", action: "manage" }, (c, m) => PS.assignEmployee(c.env, c.P, m[1], c.body)],
  ["POST", /^teams\/([A-Za-z0-9_-]+)\/unassign$/, { resource: "production", action: "manage" }, (c, m) => PS.unassignEmployee(c.env, c.P, m[1], c.body)],
  ["GET", /^modules$/, { resource: "system", action: "modules" }, async (c) => { const off = await modulesOff(c.env); return { modules: moduleList().map((m) => Object.assign(m, { enabled: !off.has(m.key) })) }; }],
  ["POST", /^modules$/, { resource: "system", action: "modules" }, async (c) => { const key = clip(c.body.key, 30); if (!moduleList().some((m) => m.key === key)) throw Object.assign(new Error("Unknown module."), { status: 400 }); const on = c.body.enabled ? 1 : 0, d = await osdb(c.env); await run(d, "INSERT OR REPLACE INTO os_modules (key, enabled, note, updated_by, updated_at) VALUES (?1,?2,?3,?4,?5)", key, on, clip(c.body.note, 200), c.P.user.email, nowIso()); await audit(c.env, c.P, "OWNER_CHANGED_SYSTEM_SETTING", { kind: "module", id: key }, null, { enabled: on }, c.body.reason); const off = await modulesOff(c.env); return { modules: moduleList().map((m) => Object.assign(m, { enabled: !off.has(m.key) })) }; }]
];
export async function enabled(env) { try { const r = await one(await B.bdb(env), "SELECT v FROM biz_settings WHERE k='os_enabled'"); return !(r && String(J(r.v, r.v)) === "0"); } catch (e) { return true; } }
/* Phase 1 subset of the health page: honest configured / not configured / failing per probe, no numbers invented */
async function health(env) {
  const out = { at: nowIso(), probes: {} }, p = out.probes; try { await (await B.bdb(env)).prepare("SELECT 1").first(); p.d1 = "ok"; } catch (e) { p.d1 = "failing"; }
  try { if (!env.CHAT_KV) p.kv = "not configured"; else { await env.CHAT_KV.put("os:health", "1", { expirationTtl: 60 }); p.kv = (await env.CHAT_KV.get("os:health")) === "1" ? "ok" : "failing"; } } catch (e) { p.kv = "failing"; }
  p.r2_files = env.FILES ? "ok" : "not configured"; p.queue = env.JOBS ? "ok" : "not configured (hourly workflow runs jobs)"; p.mail = env.RESEND_API_KEY ? "configured" : "not configured"; p.whatsapp = env.WA_NUMBER && env.WA_TOKEN && env.WA_PHONE_ID && env.WA_APP_SECRET ? "configured" : "not configured";
  p.payments = payOn(env) ? "configured" : "not configured"; p.payouts = B.payoutsOn(env) ? "configured" : "not configured"; p.test_mode = env.XRAY_TEST_MODE === "1" ? "ON (must be off in production)" : "off";
  try { const d = await (await import("../../_lib/jobs.js")).jdb(env), j = await one(d, "SELECT sum(status='queued') q, sum(status='failed') f, sum(status='dead') dd, sum(status='running') r FROM biz_jobs"); p.jobs = j ? { queued: j.q || 0, failed: j.f || 0, dead: j.dd || 0, running: j.r || 0 } : "no jobs table"; } catch (e) { p.jobs = "not set up"; }
  try { const d = await B.bdb(env), c = await one(d, "SELECT coalesce(sum(n),0) n FROM csp_reports WHERE last_at>?1", new Date(Date.now() - 864e5).toISOString()); p.csp_reports_24h = c ? c.n : 0; } catch (e) { p.csp_reports_24h = "n/a"; }
  try { const d = await osdb(env), f = await one(d, "SELECT on_ FROM os_flags WHERE key='fts5' AND scope_kind='system'"); p.fts5 = f ? (f.on_ ? "available" : "not available") : "not probed"; } catch (e) { p.fts5 = "n/a"; }
  return out;
}

export async function onRequest({ request, env, params }) {
  try {
    const m = request.method, path = [].concat(params.path || []), p = path.join("/");
    if (!accountsOn(env)) return err("FODO accounts are not switched on.", 503);
    const u0 = await sessionUser(env, request); if (!u0) return json({ ok: false, reason: "Log in to use FODO OS.", login: true }, 401);
    if (m !== "GET" && (!sameOrigin(request) || !/json/.test(request.headers.get("content-type") || ""))) return err("Bad request.", 403);
    if (m !== "GET" && (await count(env, "os:" + u0.id, 400, 3600))) return err("Too many changes this hour, slow down a little.", 429);
    if (m === "GET" && (await count(env, "osg:" + u0.id, 3000, 3600))) return err("Too many requests.", 429);
    const body = m === "POST" || m === "PUT" ? (await request.json().catch(() => null)) || {} : {}, q = Object.fromEntries(new URL(request.url).searchParams), origin = new URL(request.url).origin;
    /* view-as: the owner's cookie stays; GETs answer as the viewed person, writes are refused until the owner stops */
    const imp = await IM.readAs(env, u0); let u = u0; if (imp) { if (m !== "GET" && p !== "view-as/stop") return err("View-as is read-only. Stop viewing as " + (imp.user.email || "this person") + " first.", 403); u = imp.user; }
    const R = await B.rolesOf(env, u), P = await principal(env, u, { R, quiet: m === "GET" }); if (imp) { P.readOnly = true; P.impersonator = { user: u0, email: u0.email, until: imp.until }; }
    const on = await enabled(env); if (!on && !(P.isOwner && !imp && /^settings$/.test(p)) && p !== "me") return err("FODO OS is switched off. An owner can switch it on under Settings.", 503);
    if (!on && p === "me") return json({ ok: true, me: describe(P), enabled: false });
    for (const [rm, re, need, fn] of ROUTES) { if (rm !== m) continue; const mt = re.exec(p); if (!mt) continue;
      if (need !== "self") await authorize(env, P, need);
      const ctx = { env, request, P, R, body, q, origin, u }; const out = await fn(ctx, mt); return json(Object.assign({ ok: true }, out), 200, { "cache-control": "no-store" }); }
    return err("Not found.", 404);
  } catch (e) { if (env.XRAY_TEST_MODE === "1" && env.API_DEBUG === "1") console.error("OS API", e && e.stack); return err(e && e.status ? e.message : "Something went wrong. Try again.", e && e.status ? e.status : 500); }
}
