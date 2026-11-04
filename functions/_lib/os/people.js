/* FODO OS V4 Phase 1 (v50.1): People & Access. Members (employees, contractors), departments, roles (templates + custom), the Access
   Builder (permissions with scopes), temporary grants with expiry, sessions, onboarding and offboarding with handoff.
   Every write goes through authorize() and is audited with before / after. Owners are never restricted; nobody can
   grant a permission they do not hold themselves (no self-escalation through role editing). */
import { nowIso, sendMail, cleanEmail, OWNER_EMAILS } from "../accounts.js";
import { notify } from "../biz.js";
import { osdb, one, all, run, J, clip, err, int, DAY, rid, slugOf, ORG } from "./db.js";
import { authorize, allows, has, relationOf } from "./authz.js";
import { audit, emit } from "./audit.js";
import { REGISTRY, SCOPES, RANK, validPerm, TEMPLATES } from "./permissions.js";

export const KINDS = ["employee", "contractor"], EMP = ["full_time", "part_time", "contract", "intern", "freelance"], STATUS = ["invited", "active", "suspended", "offboarded"];
const memberOut = (m, P) => { const o = Object.assign({}, m, { skills: J(m.skills, []) }); if (!has(P, "people", "manage", "organization")) { delete o.cost_rate; delete o.employment_type; } return o; };

/* ---------- members ---------- */
export async function members(env, P, q) {
  const { scope } = await authorize(env, P, { resource: "people", action: "view" }); if (scope === "own") throw err("You can see your own record only (People & Access needs team access).", 403); const d = await osdb(env), lim = Math.min(200, Math.max(1, +(q.limit || 100)));
  let where = "m.org_id=?1", args = [ORG]; if (scope === "team") { where += " AND (m.manager_user_id=?2 OR m.user_id=?2)"; args.push(P.user.id); } else if (scope === "department") { where += " AND m.department_id=?2"; args.push(P.dept || "-"); }
  if (q.q) { where += " AND (m.name LIKE ?" + (args.length + 1) + " OR m.email LIKE ?" + (args.length + 1) + " OR m.title LIKE ?" + (args.length + 1) + ")"; args.push("%" + clip(q.q, 60) + "%"); }
  if (q.status) { where += " AND m.status=?" + (args.length + 1); args.push(clip(q.status, 20)); }
  if (q.department) { where += " AND m.department_id=?" + (args.length + 1); args.push(clip(q.department, 40)); }
  const rows = await all(d, "SELECT m.*, dp.name AS department, (SELECT group_concat(r.name, ', ') FROM os_member_roles mr JOIN os_roles r ON r.id=mr.role_id WHERE mr.member_id=m.id) AS roles, (SELECT name FROM os_members x WHERE x.user_id=m.manager_user_id AND x.org_id=m.org_id) AS manager FROM os_members m LEFT JOIN os_departments dp ON dp.id=m.department_id WHERE " + where + " ORDER BY m.status='active' DESC, m.name, m.email LIMIT " + lim, ...args);
  return { items: rows.map((m) => memberOut(m, P)), scope };
}
export async function member(env, P, id) {
  const d = await osdb(env), m = await one(d, "SELECT m.*, dp.name AS department, (SELECT x.name FROM os_members x WHERE x.user_id=m.manager_user_id AND x.org_id=m.org_id) AS manager FROM os_members m LEFT JOIN os_departments dp ON dp.id=m.department_id WHERE m.id=?1 AND m.org_id=?2", id, ORG); if (!m) throw err("Not found.", 404);
  await authorize(env, P, { resource: "people", action: "view", target: { kind: "member", row: m } });
  const roles = await all(d, "SELECT r.id, r.slug, r.name FROM os_member_roles mr JOIN os_roles r ON r.id=mr.role_id WHERE mr.member_id=?1", m.id), grants = await all(d, "SELECT id, perm, expires_at, reason, granted_by, created_at FROM os_member_perms WHERE member_id=?1 AND revoked_at IS NULL ORDER BY created_at DESC", m.id);
  const manage = has(P, "people", "manage", "organization"), sessions = manage && m.user_id ? await all(d, "SELECT created_at, expires_at, last_seen FROM acct_sessions WHERE user_id=?1 AND expires_at>?2 ORDER BY created_at DESC LIMIT 20", m.user_id, Date.now()) : [];
  const open = m.user_id ? { tasks: ((await one(d, "SELECT count(*) n FROM biz_tasks WHERE assignee_user_id=?1 AND status NOT IN ('done','cancelled','approved')", m.user_id)) || {}).n || 0, projects: ((await one(d, "SELECT count(*) n FROM biz_projects WHERE owner_user_id=?1 AND status NOT IN ('completed','cancelled') AND archived_at IS NULL", m.user_id)) || {}).n || 0, approvals: ((await one(d, "SELECT count(*) n FROM os_approvals WHERE approver_user_id=?1 AND status='pending'", m.user_id)) || {}).n || 0 } : { tasks: 0, projects: 0, approvals: 0 };
  return { member: memberOut(m, P), roles, grants: manage ? grants : [], sessions, open, manage };
}
function cleanMember(b) {
  const o = {}; if (b.name != null) o.name = clip(b.name, 80); if (b.title != null) o.title = clip(b.title, 80); if (b.department_id !== undefined) o.department_id = clip(b.department_id, 40) || null; if (b.manager_user_id !== undefined) o.manager_user_id = clip(b.manager_user_id, 40) || null;
  if (b.kind != null) { if (KINDS.indexOf(b.kind) < 0) throw err("Kind must be employee or contractor."); o.kind = b.kind; } if (b.employment_type != null) { if (EMP.indexOf(b.employment_type) < 0) throw err("Unknown employment type."); o.employment_type = b.employment_type; }
  if (b.started_at != null) { if (b.started_at && !DAY.test(b.started_at)) throw err("Start date must be YYYY-MM-DD."); o.started_at = b.started_at || null; } if (b.weekly_hours != null) { const h = int(b.weekly_hours, 1, 80); if (h == null) throw err("Weekly hours must be 1 to 80."); o.weekly_hours = h; }
  if (b.cost_rate != null) { const c = b.cost_rate === "" ? null : int(b.cost_rate, 0, 100000); if (b.cost_rate !== "" && c == null) throw err("Cost rate must be 0 to 100000 per hour."); o.cost_rate = c; } if (b.skills != null) o.skills = JSON.stringify([].concat(b.skills || []).map((s) => clip(s, 40)).filter(Boolean).slice(0, 30));
  return o;
}
/* onboarding: membership + roles + onboarding checklist tasks + invitation + notification preferences (section 75) */
export async function invite(env, P, b, origin) {
  await authorize(env, P, { resource: "people", action: "manage" }); const d = await osdb(env), email = cleanEmail(b.email); if (!email) throw err("Enter a valid email.");
  if (await one(d, "SELECT id FROM os_members WHERE org_id=?1 AND email=?2", ORG, email)) throw err("This person is already a member.", 409);
  const o = cleanMember(b); if (!o.name) throw err("Enter the person's name."); const roleIds = await roleIdsFor(d, P, b.roles || b.role); if (!roleIds.length) throw err("Pick at least one role.");
  if (o.department_id && !(await one(d, "SELECT id FROM os_departments WHERE id=?1 AND org_id=?2 AND status='active'", o.department_id, ORG))) throw err("Unknown department.");
  const u = await one(d, "SELECT id, name FROM acct_users WHERE email=?1", email).catch(() => null), id = rid("mb"), now = nowIso();
  await run(d, "INSERT INTO os_members (id, org_id, user_id, email, name, department_id, manager_user_id, title, kind, status, employment_type, started_at, weekly_hours, cost_rate, skills, invited_by, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?17,?10,?11,?12,?13,?14,?15,?16,?16)", id, ORG, u ? u.id : null, email, o.name, o.department_id || null, o.manager_user_id || P.user.id, o.title || "", o.kind || "employee", o.employment_type || "full_time", o.started_at || now.slice(0, 10), o.weekly_hours || 40, o.cost_rate == null ? null : o.cost_rate, o.skills || "[]", P.user.email, now, u ? "active" : "invited");
  for (const r of roleIds) await run(d, "INSERT OR IGNORE INTO os_member_roles (member_id, role_id) VALUES (?1,?2)", id, r);
  /* without an account yet the row stays 'invited'; linkMember() activates it at the person's first login with this email */
  const tasks = [];   /* onboarding checklist tasks arrive with the task engine (Phase 2 / 3) */
  if (u) { try { await notify(env, u.id, "system", "Welcome to FODO. Your workspace is ready: " + (await rolesNamed(d, roleIds)).join(", ") + ".", "/workspace/#my-fodo"); } catch (e) {} }
  try { await sendMail(env, email, "You have been added to FODO", "<p>Hi " + clip(o.name, 80) + ",</p><p>" + clip(P.user.name || P.user.email, 80) + " added you to the FODO workspace as " + (await rolesNamed(d, roleIds)).join(", ") + ".</p><p>Log in with this email address: <a href=\"" + (origin || "https://www.fodo.co.in") + "/workspace/\">" + (origin || "https://www.fodo.co.in") + "/workspace/</a></p>", "Log in at " + (origin || "https://www.fodo.co.in") + "/workspace/ with this email address."); } catch (e) {}
  await audit(env, P, "OWNER_INVITED_MEMBER", { kind: "member", id }, null, { email, roles: roleIds, department: o.department_id }, b.reason); await emit(env, P, "member.invited", { kind: "member", id }, { email, tasks: tasks.length });
  return { id, email, onboardingTasks: tasks.length, accountExists: !!u };
}
async function roleIdsFor(d, P, roles) { const want = [].concat(roles || []).map((r) => clip(r, 60)).filter(Boolean); if (!want.length) return []; const rows = await all(d, "SELECT id, slug FROM os_roles WHERE org_id=?1 AND status='active' AND (id IN (" + want.map(() => "?").join(",") + ") OR slug IN (" + want.map(() => "?").join(",") + "))", ORG, ...want, ...want);
  if (rows.some((r) => r.slug === "owner") && !P.isOwner) throw err("Only an owner can give the Owner role.", 403); return rows.map((r) => r.id); }
const rolesNamed = async (d, ids) => ids.length ? (await all(d, "SELECT name FROM os_roles WHERE id IN (" + ids.map(() => "?").join(",") + ")", ...ids)).map((r) => r.name) : [];

export async function update(env, P, id, b) {
  const d = await osdb(env), m = await one(d, "SELECT * FROM os_members WHERE id=?1 AND org_id=?2", id, ORG); if (!m) throw err("Not found.", 404);
  await authorize(env, P, { resource: "people", action: "manage", target: { kind: "member", row: m } }); if (OWNER_EMAILS.indexOf(m.email) > -1 && !P.isOwner) throw err("Only an owner can change an owner.", 403);
  const o = cleanMember(b), keys = Object.keys(o); if (keys.length) await run(d, "UPDATE os_members SET " + keys.map((k, i) => k + "=?" + (i + 2)).join(", ") + ", updated_at=?" + (keys.length + 2) + " WHERE id=?1", id, ...keys.map((k) => o[k]), nowIso());
  if (b.roles) { const ids = await roleIdsFor(d, P, b.roles); if (!ids.length) throw err("Pick at least one role."); await run(d, "DELETE FROM os_member_roles WHERE member_id=?1", id); for (const r of ids) await run(d, "INSERT OR IGNORE INTO os_member_roles (member_id, role_id) VALUES (?1,?2)", id, r); o.roles = ids; }
  await audit(env, P, b.roles ? "OWNER_CHANGED_ROLE" : "OWNER_CHANGED_MEMBER", { kind: "member", id }, pick(m, keys.concat(b.roles ? ["roles"] : [])), o, b.reason); return { ok: true };
}
const pick = (o, ks) => ks.reduce((a, k) => { a[k] = o[k]; return a; }, {});
export async function setStatus(env, P, id, status, reason) {
  if (["active", "suspended"].indexOf(status) < 0) throw err("Status must be active or suspended."); const d = await osdb(env), m = await one(d, "SELECT * FROM os_members WHERE id=?1 AND org_id=?2", id, ORG); if (!m) throw err("Not found.", 404);
  await authorize(env, P, { resource: "people", action: "manage", target: { kind: "member", row: m } }); if (OWNER_EMAILS.indexOf(m.email) > -1) throw err("An owner cannot be suspended.", 403); if (m.user_id === P.user.id) throw err("You cannot suspend yourself.");
  await run(d, "UPDATE os_members SET status=?2, updated_at=?3 WHERE id=?1", id, status, nowIso()); if (status === "suspended" && m.user_id) await run(d, "DELETE FROM acct_sessions WHERE user_id=?1", m.user_id);
  await audit(env, P, status === "suspended" ? "OWNER_SUSPENDED_MEMBER" : "OWNER_UNSUSPENDED_MEMBER", { kind: "member", id }, { status: m.status }, { status }, reason); return { ok: true, status };
}
/* temporary access: a permission the person's roles do not include, with an expiry and a reason; revoked automatically */
export async function grant(env, P, id, b) {
  const d = await osdb(env), m = await one(d, "SELECT * FROM os_members WHERE id=?1 AND org_id=?2", id, ORG); if (!m) throw err("Not found.", 404); await authorize(env, P, { resource: "people", action: "manage", target: { kind: "member", row: m } });
  const p = clip(b.perm, 80); if (!validPerm(p)) throw err("Unknown permission."); const [res, act, sc] = p.split("."); if (!P.isOwner && !has(P, res, act, sc)) throw err("You cannot grant more than you hold yourself.", 403);
  const days = int(b.days, 1, 365); if (days == null) throw err("Days must be 1 to 365."); const reason = clip(b.reason, 200); if (!reason) throw err("Give a reason."); const gid = rid("gr"), exp = new Date(Date.now() + days * 864e5).toISOString();
  await run(d, "INSERT INTO os_member_perms (id, member_id, perm, expires_at, reason, granted_by, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)", gid, id, p, exp, reason, P.user.email, nowIso());
  await audit(env, P, "OWNER_CHANGED_PERMISSION", { kind: "member", id }, null, { grant: p, expires_at: exp }, reason); if (m.user_id) notify(env, m.user_id, "system", "Temporary access: " + p + " until " + exp.slice(0, 10) + ".", "/workspace/#my-fodo").catch(() => {}); return { id: gid, expires_at: exp };
}
export async function revokeGrant(env, P, id, gid) { const d = await osdb(env), g = await one(d, "SELECT g.*, m.org_id FROM os_member_perms g JOIN os_members m ON m.id=g.member_id WHERE g.id=?1 AND g.member_id=?2", gid, id); if (!g) throw err("Not found.", 404); await authorize(env, P, { resource: "people", action: "manage", target: { kind: "member", id } }); await run(d, "UPDATE os_member_perms SET revoked_at=?2 WHERE id=?1", gid, nowIso()); await audit(env, P, "OWNER_CHANGED_PERMISSION", { kind: "member", id }, { grant: g.perm }, { revoked: true }); return { ok: true }; }
export async function expireGrants(env) { const d = await osdb(env), r = await run(d, "UPDATE os_member_perms SET revoked_at=?1 WHERE revoked_at IS NULL AND expires_at<?1", nowIso()); return (r.meta && r.meta.changes) || 0; }
export async function revokeSessions(env, P, id) { const d = await osdb(env), m = await one(d, "SELECT * FROM os_members WHERE id=?1 AND org_id=?2", id, ORG); if (!m) throw err("Not found.", 404); await authorize(env, P, { resource: "people", action: "manage", target: { kind: "member", row: m } }); const r = m.user_id ? await run(d, "DELETE FROM acct_sessions WHERE user_id=?1", m.user_id) : { meta: { changes: 0 } }; await audit(env, P, "OWNER_REVOKED_SESSIONS", { kind: "member", id }, null, { sessions: r.meta.changes }); return { revoked: r.meta.changes }; }

/* offboarding (section 76): disable, revoke sessions and grants, hand over open work to a replacement, keep every record */
export async function offboard(env, P, id, b) {
  const d = await osdb(env), m = await one(d, "SELECT * FROM os_members WHERE id=?1 AND org_id=?2", id, ORG); if (!m) throw err("Not found.", 404); await authorize(env, P, { resource: "people", action: "manage", target: { kind: "member", row: m } });
  if (OWNER_EMAILS.indexOf(m.email) > -1) throw err("An owner cannot be offboarded.", 403); if (m.user_id === P.user.id) throw err("You cannot offboard yourself.");
  const to = b.replacement_user_id ? await one(d, "SELECT * FROM os_members WHERE user_id=?1 AND org_id=?2 AND status='active'", clip(b.replacement_user_id, 40), ORG) : null; if (b.replacement_user_id && !to) throw err("The replacement must be an active member.");
  const now = nowIso(), moved = { tasks: 0, projects: 0, approvals: 0, members: 0 };
  if (m.user_id) {
    await run(d, "DELETE FROM acct_sessions WHERE user_id=?1", m.user_id); await run(d, "UPDATE os_member_perms SET revoked_at=?2 WHERE member_id=?1 AND revoked_at IS NULL", id, now);
    if (to) { moved.tasks = (await run(d, "UPDATE biz_tasks SET assignee_user_id=?2, updated_at=?3 WHERE assignee_user_id=?1 AND status NOT IN ('done','cancelled','approved')", m.user_id, to.user_id, now)).meta.changes; moved.projects = (await run(d, "UPDATE biz_projects SET owner_user_id=?2, updated_at=?3 WHERE owner_user_id=?1 AND status NOT IN ('completed','cancelled')", m.user_id, to.user_id, now)).meta.changes;
      moved.approvals = (await run(d, "UPDATE os_approvals SET approver_user_id=?2, updated_at=?3 WHERE approver_user_id=?1 AND status='pending'", m.user_id, to.user_id, now)).meta.changes; moved.members = (await run(d, "UPDATE os_members SET manager_user_id=?2 WHERE manager_user_id=?1 AND org_id=?4 AND id<>?3", m.user_id, to.user_id, id, ORG)).meta.changes;
      await run(d, "UPDATE os_departments SET manager_user_id=?2 WHERE manager_user_id=?1 AND org_id=?3", m.user_id, to.user_id, ORG); }
  }
  await run(d, "UPDATE os_members SET status='offboarded', offboarded_at=?2, updated_at=?2 WHERE id=?1", id, now);
  for (const mg of await all(d, "SELECT DISTINCT manager_user_id AS u FROM os_members WHERE id=?1 AND manager_user_id IS NOT NULL", id)) if (mg.u) notify(env, mg.u, "system", clip(m.name || m.email, 80) + " was offboarded" + (to ? "; open work moved to " + clip(to.name || to.email, 80) : "") + ".", "/workspace/#people").catch(() => {});
  if (to && to.user_id) notify(env, to.user_id, "task", "Work handed over to you from " + clip(m.name || m.email, 80) + ": " + moved.tasks + " tasks, " + moved.projects + " projects, " + moved.approvals + " approvals.", "/workspace/#my-fodo").catch(() => {});
  await audit(env, P, "OWNER_OFFBOARDED_MEMBER", { kind: "member", id }, { status: m.status }, Object.assign({ status: "offboarded", replacement: to ? to.user_id : null }, moved), b.reason); await emit(env, P, "member.offboarded", { kind: "member", id }, moved);
  return Object.assign({ ok: true }, moved);
}
/* what would move if this person left (the handoff preview) */
export async function handoffPreview(env, P, id) { const d = await osdb(env), m = await one(d, "SELECT * FROM os_members WHERE id=?1 AND org_id=?2", id, ORG); if (!m) throw err("Not found.", 404); await authorize(env, P, { resource: "people", action: "manage", target: { kind: "member", row: m } }); if (!m.user_id) return { tasks: [], projects: [], approvals: [], reports: [] };
  return { tasks: await all(d, "SELECT id, title, due, status FROM biz_tasks WHERE assignee_user_id=?1 AND status NOT IN ('done','cancelled','approved') ORDER BY COALESCE(due,'9999') LIMIT 100", m.user_id), projects: await all(d, "SELECT id, title, status FROM biz_projects WHERE owner_user_id=?1 AND status NOT IN ('completed','cancelled') LIMIT 50", m.user_id), approvals: await all(d, "SELECT id, title, kind, deadline FROM os_approvals WHERE approver_user_id=?1 AND status='pending' LIMIT 50", m.user_id), reports: await all(d, "SELECT id, name, email FROM os_members WHERE manager_user_id=?1 AND org_id=?2 AND status='active' LIMIT 50", m.user_id, ORG) }; }

/* ---------- departments ---------- */
export async function departments(env, P) { await authorize(env, P, { resource: "people", action: "view" }); const d = await osdb(env); return { items: await all(d, "SELECT dp.*, (SELECT count(*) FROM os_members m WHERE m.department_id=dp.id AND m.status='active') AS members, (SELECT name FROM os_members x WHERE x.user_id=dp.manager_user_id AND x.org_id=dp.org_id) AS manager FROM os_departments dp WHERE dp.org_id=?1 ORDER BY dp.status='active' DESC, dp.name", ORG) }; }
export async function saveDepartment(env, P, id, b) {
  await authorize(env, P, { resource: "people", action: "manage" }); const d = await osdb(env), name = clip(b.name, 60), now = nowIso();
  if (!id) { if (!name) throw err("Enter a department name."); const nid = rid("dp"), slug = slugOf(name); if (await one(d, "SELECT id FROM os_departments WHERE org_id=?1 AND slug=?2", ORG, slug)) throw err("A department with this name exists.", 409); await run(d, "INSERT INTO os_departments (id, org_id, name, slug, manager_user_id, status, created_at) VALUES (?1,?2,?3,?4,?5,'active',?6)", nid, ORG, name, slug, clip(b.manager_user_id, 40) || null, now); await audit(env, P, "OWNER_CREATED_DEPARTMENT", { kind: "department", id: nid }, null, { name }); return { id: nid }; }
  const dp = await one(d, "SELECT * FROM os_departments WHERE id=?1 AND org_id=?2", id, ORG); if (!dp) throw err("Not found.", 404); const o = {}; if (name) o.name = name; if (b.manager_user_id !== undefined) o.manager_user_id = clip(b.manager_user_id, 40) || null; if (b.status && ["active", "archived"].indexOf(b.status) > -1) o.status = b.status;
  const ks = Object.keys(o); if (ks.length) await run(d, "UPDATE os_departments SET " + ks.map((k, i) => k + "=?" + (i + 2)).join(", ") + " WHERE id=?1", id, ...ks.map((k) => o[k])); await audit(env, P, "OWNER_CHANGED_DEPARTMENT", { kind: "department", id }, pick(dp, ks), o); return { ok: true };
}
/* ---------- roles and the Access Builder ---------- */
export async function roles(env, P) { await authorize(env, P, { resource: "people", action: "view" }); const d = await osdb(env); const rows = await all(d, "SELECT r.*, dp.name AS department, (SELECT count(*) FROM os_member_roles mr JOIN os_members m ON m.id=mr.member_id WHERE mr.role_id=r.id AND m.status='active') AS members, (SELECT count(*) FROM os_role_perms p WHERE p.role_id=r.id) AS perms FROM os_roles r LEFT JOIN os_departments dp ON dp.id=r.department_id WHERE r.org_id=?1 ORDER BY r.template IS NULL, r.name", ORG); return { items: rows, templates: TEMPLATES.map((t) => ({ slug: t.slug, name: t.name, dept: t.dept, home: t.home, perms: t.perms.length })) }; }
export async function role(env, P, id) { await authorize(env, P, { resource: "people", action: "view" }); const d = await osdb(env), r = await one(d, "SELECT * FROM os_roles WHERE id=?1 AND org_id=?2", id, ORG); if (!r) throw err("Not found.", 404); return { role: r, perms: (await all(d, "SELECT perm FROM os_role_perms WHERE role_id=?1 ORDER BY perm", id)).map((x) => x.perm), members: await all(d, "SELECT m.id, m.name, m.email FROM os_member_roles mr JOIN os_members m ON m.id=mr.member_id WHERE mr.role_id=?1 AND m.status='active' ORDER BY m.name LIMIT 100", id) }; }
export async function saveRole(env, P, id, b) {
  await authorize(env, P, { resource: "people", action: "manage" }); const d = await osdb(env), now = nowIso();
  const perms = b.perms == null ? null : [].concat(b.perms).map((p) => clip(p, 80)).filter(validPerm);
  if (perms) { if (!P.isOwner) for (const p of perms) { const [res, act, sc] = p.split("."); if (!has(P, res, act, sc)) throw err("You cannot give " + p + ": you do not hold it yourself.", 403); } if (perms.some((p) => /^system\.(override|impersonate|settings)|^brain\./.test(p)) && !P.isOwner) throw err("Only an owner can give system or Brain permissions.", 403); }
  const home = b.home ? clip(b.home, 30) : null, dept = b.department_id !== undefined ? clip(b.department_id, 40) || null : undefined, dash = b.dashboard ? JSON.stringify([].concat(b.dashboard).map((w) => clip(w, 30)).slice(0, 12)) : null;
  if (!id) { const name = clip(b.name, 60); if (!name) throw err("Enter a role name."); const slug = slugOf(name); if (await one(d, "SELECT id FROM os_roles WHERE org_id=?1 AND slug=?2", ORG, slug)) throw err("A role with this name exists.", 409); const nid = rid("rl");
    const base = b.template ? TEMPLATES.find((t) => t.slug === b.template) : null; await run(d, "INSERT INTO os_roles (id, org_id, name, slug, department_id, template, home, dashboard, status, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,NULL,?6,?7,'active',?8,?8)", nid, ORG, name, slug, dept || null, home || (base ? base.home : "my-fodo"), dash || "[]", now);
    for (const p of (perms || (base ? base.perms : []))) await run(d, "INSERT OR IGNORE INTO os_role_perms (role_id, perm) VALUES (?1,?2)", nid, p); await audit(env, P, "OWNER_CREATED_ROLE", { kind: "role", id: nid }, null, { name, perms: (perms || (base ? base.perms : [])).length }); return { id: nid }; }
  const r = await one(d, "SELECT * FROM os_roles WHERE id=?1 AND org_id=?2", id, ORG); if (!r) throw err("Not found.", 404); if (r.slug === "owner" && !P.isOwner) throw err("Only an owner edits the Owner role.", 403);
  const o = {}; if (b.name) o.name = clip(b.name, 60); if (home) o.home = home; if (dept !== undefined) o.department_id = dept; if (dash) o.dashboard = dash; if (b.status && ["active", "archived"].indexOf(b.status) > -1 && r.slug !== "owner") o.status = b.status; const ks = Object.keys(o);
  if (ks.length) await run(d, "UPDATE os_roles SET " + ks.map((k, i) => k + "=?" + (i + 2)).join(", ") + ", updated_at=?" + (ks.length + 2) + " WHERE id=?1", id, ...ks.map((k) => o[k]), now);
  let before = null; if (perms) { before = (await all(d, "SELECT perm FROM os_role_perms WHERE role_id=?1", id)).map((x) => x.perm); if (r.slug === "owner" && perms.length < before.length) throw err("The Owner role keeps every permission."); await run(d, "DELETE FROM os_role_perms WHERE role_id=?1", id); for (const p of perms) await run(d, "INSERT OR IGNORE INTO os_role_perms (role_id, perm) VALUES (?1,?2)", id, p); }
  await audit(env, P, "OWNER_CHANGED_ROLE", { kind: "role", id }, Object.assign(pick(r, ks), perms ? { perms: before } : {}), Object.assign(o, perms ? { perms } : {})); return { ok: true };
}
export const registry = () => ({ registry: REGISTRY, scopes: SCOPES, templates: TEMPLATES.map((t) => ({ slug: t.slug, name: t.name, dept: t.dept, home: t.home })) });
/* people the current person may pick as assignee / manager / replacement (never cost or employment data) */
export async function directory(env, P, q) { const d = await osdb(env), lim = 200; if (!has(P, "people", "view", "team") && !has(P, "task", "assign", "team")) return { items: P.member ? [{ user_id: P.user.id, name: P.member.name || P.user.email, email: P.user.email }] : [] };
  return { items: await all(d, "SELECT m.user_id, m.name, m.email, m.title, dp.name AS department FROM os_members m LEFT JOIN os_departments dp ON dp.id=m.department_id WHERE m.org_id=?1 AND m.status='active' AND m.user_id IS NOT NULL" + (q && q.q ? " AND (m.name LIKE ?2 OR m.email LIKE ?2)" : " AND ?2=?2") + " ORDER BY m.name LIMIT " + lim, ORG, q && q.q ? "%" + clip(q.q, 40) + "%" : 1) }; }
