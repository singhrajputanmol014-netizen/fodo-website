/* FODO OS V4 Phase 1 (v50.1): the authorization layer. Every protected OS request resolves identity → membership → roles → permissions →
   scope → relationship to the target, then allows or denies. Front-end permissions are only for UX; this file is the truth.
   principal(env, u)        -> who is asking (member row, roles, the permission set, legacy marketplace roles, impersonation)
   allows(P, res, act)      -> the widest scope granted for resource.action, or null
   authorize(env, P, {resource, action, target}) -> { scope } or throws 403; target = { kind, id } or a loaded row
   The owner always resolves to scope "all" but every write is still audited (audit.js). */
import { isOwner, nowIso } from "../accounts.js";
import { rolesOf } from "../biz.js";
import { osdb, one, all, run, J, ORG, linkMember, backfillLegacy, err } from "./db.js";
import { REGISTRY, RANK, SCOPES, TEMPLATES, LEGACY, perm } from "./permissions.js";

const tplPerms = {}; TEMPLATES.forEach((t) => { tplPerms[t.slug] = t.perms; });

export async function principal(env, u, opt) {
  opt = opt || {}; const d = await osdb(env), R = opt.R || await rolesOf(env, u);
  const P = { user: u, member: null, roles: [], perms: new Set(), dept: null, manager: null, isOwner: isOwner(u), legacy: R, kind: "client", home: "overview", readOnly: false, impersonator: null, org: ORG };
  let m = await linkMember(d, u);
  if (!m && R.roles.some((r) => r !== "client" && LEGACY[r])) { try { await backfillLegacy(d, null, null, String(u.email || "").toLowerCase()); m = await linkMember(d, u); } catch (e) {} }   /* staff added to the old tables after set-up: provisioned on first sight */
  if (m && m.status === "active") { P.member = m; P.kind = m.kind || "employee"; P.dept = m.department_id; P.manager = m.manager_user_id;
    const roles = await all(d, "SELECT r.id, r.slug, r.name, r.home FROM os_member_roles mr JOIN os_roles r ON r.id=mr.role_id WHERE mr.member_id=?1 AND r.status='active'", m.id);
    P.roles = roles.map((r) => r.slug); if (roles[0] && roles[0].home) P.home = roles[0].home;
    if (roles.length) for (const p of await all(d, "SELECT DISTINCT perm FROM os_role_perms WHERE role_id IN (" + roles.map(() => "?").join(",") + ")", ...roles.map((r) => r.id))) P.perms.add(p.perm);
    for (const g of await all(d, "SELECT perm, expires_at FROM os_member_perms WHERE member_id=?1 AND revoked_at IS NULL", m.id)) if (!g.expires_at || g.expires_at > nowIso()) P.perms.add(g.perm);
    if (P.roles.indexOf("owner") > -1) P.isOwner = true;
    if (!opt.quiet) run(d, "UPDATE os_members SET last_active_at=?2 WHERE id=?1", m.id, nowIso()).catch(() => {});
  } else if (m && m.status !== "active") { P.suspended = m.status; }
  /* legacy marketplace roles keep working exactly as before (fallback for staff without an OS row), clients and Pros get their templates */
  if (!P.member) { const lg = R.roles.filter((r) => r !== "client" && LEGACY[r]); if (lg.length) { P.kind = "employee"; lg.forEach((r) => { tplPerms[LEGACY[r]].forEach((p) => P.perms.add(p)); P.roles.push(LEGACY[r]); }); } }
  if (R.pro) { tplPerms.fodo_pro.forEach((p) => P.perms.add(p)); if (!P.member) P.kind = "pro"; }
  tplPerms.client.forEach((p) => P.perms.add(p));
  if (P.isOwner) { P.kind = "employee"; P.home = "command"; }
  P.R = R; return P;
}
/* widest scope the principal holds for resource.action (null = none) */
export function allows(P, res, act) {
  if (!REGISTRY[res] || !REGISTRY[res][act]) return null; if (P.isOwner) return "all";
  let best = null; for (const s of SCOPES) if (P.perms.has(perm(res, act, s)) && (best == null || RANK[s] > RANK[best])) best = s; return best;
}
export const has = (P, res, act, scope) => { const s = allows(P, res, act); return !!s && RANK[s] >= RANK[scope || "own"]; };
export const isEmployee = (P) => P.kind === "employee" || P.isOwner;

/* the relationships the principal has to a target: a set of scope names */
export async function relationOf(env, P, target) {
  const rel = new Set(["all"]); if (!target) return rel; const d = await osdb(env), uid = P.user.id, k = target.kind, row = target.row || null, id = target.id || (row && row.id);
  if (isEmployee(P) && P.member) rel.add("organization");
  const own = (r) => r && [r.user_id, r.owner_id, r.client_id, r.created_by, r.owner_user_id, r.requester_user_id].indexOf(uid) > -1;
  if (k === "project") { const pj = row || await one(d, "SELECT id, client_id, owner_user_id, department_id, pro_id, kind FROM biz_projects WHERE id=?1", id); if (!pj) return rel;
    if (own(pj)) rel.add("own"); if (pj.department_id && pj.department_id === P.dept) rel.add("department");
    if (P.R.pro && (pj.pro_id === P.R.pro.id || await one(d, "SELECT 1 x FROM biz_project_pros WHERE project_id=?1 AND pro_id=?2 AND status IN ('accepted','lead')", pj.id, P.R.pro.id))) rel.add("assigned");
    if (await one(d, "SELECT 1 x FROM biz_tasks WHERE project_id=?1 AND assignee_user_id=?2", pj.id, uid) || await one(d, "SELECT 1 x FROM os_team_members tm JOIN os_teams t ON t.id=tm.team_id WHERE t.project_id=?1 AND tm.user_id=?2", pj.id, uid)) rel.add("assigned");
    if (await one(d, "SELECT 1 x FROM os_teams t WHERE t.project_id=?1 AND (t.manager_user_id=?2 OR EXISTS (SELECT 1 FROM os_team_members tm JOIN os_team_members me ON me.team_id=tm.team_id WHERE tm.team_id=t.id AND me.user_id=?2))", pj.id, uid)) rel.add("team");
    if (pj.owner_user_id && P.member && await one(d, "SELECT 1 x FROM os_members WHERE user_id=?1 AND manager_user_id=?2 AND org_id=?3", pj.owner_user_id, uid, ORG)) rel.add("team");
    if (P.member && await one(d, "SELECT 1 x FROM biz_tasks t JOIN os_members m ON m.user_id=t.assignee_user_id WHERE t.project_id=?1 AND m.manager_user_id=?2 AND m.org_id=?3", pj.id, uid, ORG)) rel.add("team");
    if (await one(d, "SELECT 1 x FROM biz_tasks WHERE project_id=?1 AND created_by=?2", pj.id, uid)) rel.add("assigned");
    return rel; }
  if (k === "task") { const t = row || await one(d, "SELECT id, project_id, assignee_user_id, created_by, department_id FROM biz_tasks WHERE id=?1", id); if (!t) return rel;
    if (t.assignee_user_id === uid) rel.add("assigned"); if (t.created_by === uid) rel.add("own"); if (t.department_id && t.department_id === P.dept) rel.add("department");
    if (t.assignee_user_id && P.member && await one(d, "SELECT 1 x FROM os_members WHERE user_id=?1 AND manager_user_id=?2", t.assignee_user_id, uid)) rel.add("team");
    if (t.project_id) for (const s of await relationOf(env, P, { kind: "project", id: t.project_id })) if (s !== "all") rel.add(s === "own" ? "assigned" : s); return rel; }
  if (k === "member" || k === "user") { const m = row || await one(d, "SELECT id, user_id, manager_user_id, department_id FROM os_members WHERE " + (k === "user" ? "user_id" : "id") + "=?1", id); if (!m) return rel;
    if (m.user_id === uid) rel.add("own"); if (m.manager_user_id === uid) rel.add("team"); if (m.department_id && m.department_id === P.dept) rel.add("department"); return rel; }
  if (k === "approval") { const a = row || await one(d, "SELECT * FROM os_approvals WHERE id=?1", id); if (!a) return rel; if (a.requester_user_id === uid) rel.add("own"); if (a.approver_user_id === uid) rel.add("assigned"); if (a.department_id && a.department_id === P.dept) rel.add("department"); return rel; }
  if (k === "expense") { const x = row || await one(d, "SELECT * FROM os_expenses WHERE id=?1", id); if (!x) return rel; if (x.user_id === uid) rel.add("own"); if (x.department_id && x.department_id === P.dept) rel.add("department"); if (x.project_id) for (const s of await relationOf(env, P, { kind: "project", id: x.project_id })) if (s === "team" || s === "assigned") rel.add(s); return rel; }
  if (k === "deliverable") { const x = row || await one(d, "SELECT * FROM os_deliverables WHERE id=?1", id); if (!x) return rel; if (x.owner_user_id === uid || x.created_by === uid) rel.add("own"); for (const s of await relationOf(env, P, { kind: "project", id: x.project_id })) if (s !== "all") rel.add(s === "own" ? "assigned" : s); return rel; }
  if (k === "department") { if (id && id === P.dept) rel.add("department"); return rel; }
  if (k === "pro") { const p = row || await one(d, "SELECT id, user_id FROM biz_pros WHERE id=?1", id); if (!p) return rel; if (p.user_id === uid) rel.add("own"); if (P.member && await one(d, "SELECT 1 x FROM biz_projects pj WHERE (pj.pro_id=?1 OR EXISTS (SELECT 1 FROM biz_project_pros pp WHERE pp.project_id=pj.id AND pp.pro_id=?1 AND pp.status IN ('accepted','lead'))) AND (pj.owner_user_id=?2 OR EXISTS (SELECT 1 FROM biz_tasks t WHERE t.project_id=pj.id AND t.assignee_user_id=?2))", p.id, uid)) rel.add("assigned"); return rel; }
  if (k === "client") { const c = row || await one(d, "SELECT id FROM acct_users WHERE id=?1", id); if (!c) return rel; if (c.id === uid) rel.add("own"); if (await one(d, "SELECT 1 x FROM biz_projects WHERE client_id=?1 AND (owner_user_id=?2 OR EXISTS (SELECT 1 FROM biz_tasks t WHERE t.project_id=biz_projects.id AND t.assignee_user_id=?2))", c.id, uid)) rel.add("assigned"); return rel; }
  if (row && own(row)) rel.add("own"); return rel;
}
/* allow or deny. Returns { scope } (the widest granted scope) so callers can filter lists the same way. */
export async function authorize(env, P, o) {
  if (P.suspended) throw err("This account is " + P.suspended + ". Ask a FODO owner.", 403);
  const s = allows(P, o.resource, o.action); if (!s) throw err("You don't have access to " + o.resource + " (" + o.action + ").", 403);
  if (s === "all" || !o.target) return { scope: s };
  const rel = await relationOf(env, P, o.target); for (const r of rel) if (r !== "all" && RANK[r] <= RANK[s]) return { scope: s, via: r };
  throw err("You don't have access to this " + (o.target.kind || o.resource) + ".", 403);
}
export const canSee = async (env, P, resource, action, target) => { try { await authorize(env, P, { resource, action, target }); return true; } catch (e) { return false; } };
/* fields that never leave the server for people without the matching permission */
const PRIVATE = { finance: ["cost", "cost_rate", "margin", "commission", "net", "gross", "internal_cost", "client_margin", "profit"], people: ["employment_type", "started_at"], note: ["internal_note", "private_notes", "note_internal"] };
export function cleanFor(P, row, what) { if (!row || typeof row !== "object") return row; const out = Object.assign({}, row);
  (what || ["finance", "people", "note"]).forEach((w) => { if (w === "finance" && has(P, "finance", "view", "department")) return; if (w === "people" && has(P, "people", "manage", "organization")) return; if (w === "note" && isEmployee(P)) return; PRIVATE[w].forEach((f) => { delete out[f]; }); });
  return out; }
/* a short description of the principal for /me and the UI (no permission strings for clients, nothing secret) */
export function describe(P) {
  return { kind: P.kind, home: P.home, owner: P.isOwner, roles: P.roles, department: P.dept, memberId: P.member ? P.member.id : null, name: P.member ? P.member.name : "", title: P.member ? P.member.title : "", readOnly: P.readOnly, impersonating: P.impersonator ? { by: P.impersonator.email, until: P.impersonator.until, name: P.user.name || P.user.email } : null,
    can: Object.keys(REGISTRY).reduce((o, r) => { Object.keys(REGISTRY[r]).forEach((a) => { const s = allows(P, r, a); if (s) o[r + "." + a] = s; }); return o; }, {}) };
}
