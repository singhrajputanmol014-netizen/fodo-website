/* FODO OS V4 Phase 1 (v50.1): database set-up (additive), seeds and shared helpers.
   osdb(env) runs bdb() first (the marketplace tables), then creates the os_* tables, applies the additive columns on existing
   tables through migrateOnce, and seeds once: the FODO organization, the departments, the role templates, the owners, and a
   backfill of every legacy staff row (acct_admins / biz_staff) as an OS member. Old tables are never dropped or rewritten. */
import { migrateOnce, nowIso, randId, OWNER_EMAILS } from "../accounts.js";
import { bdb } from "../biz.js";
import { TEMPLATES, DEPARTMENTS, LEGACY, validPerm } from "./permissions.js";

export const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
export const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
export const all = async (d, sql, ...a) => (await d.prepare(sql).bind(...a).all()).results || [];
export const one = (d, sql, ...a) => d.prepare(sql).bind(...a).first();
export const run = (d, sql, ...a) => d.prepare(sql).bind(...a).run();
export const err = (m, s) => Object.assign(new Error(m), { status: s || 400 });
export const int = (v, lo, hi) => { const n = Math.round(+v); return isFinite(n) && n >= lo && n <= hi ? n : null; };
export const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const slugOf = (s) => clip(s, 60).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "x";
export const ORG = "fodo";

const DDL = [
  "CREATE TABLE IF NOT EXISTS os_orgs (id TEXT PRIMARY KEY, name TEXT, slug TEXT UNIQUE, status TEXT, settings TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS os_departments (id TEXT PRIMARY KEY, org_id TEXT, name TEXT, slug TEXT, manager_user_id TEXT, status TEXT, created_at TEXT)",
  "CREATE UNIQUE INDEX IF NOT EXISTS os_departments_slug ON os_departments(org_id, slug)",
  "CREATE TABLE IF NOT EXISTS os_roles (id TEXT PRIMARY KEY, org_id TEXT, name TEXT, slug TEXT, department_id TEXT, template TEXT, home TEXT, dashboard TEXT, status TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE UNIQUE INDEX IF NOT EXISTS os_roles_slug ON os_roles(org_id, slug)",
  "CREATE TABLE IF NOT EXISTS os_role_perms (role_id TEXT, perm TEXT, PRIMARY KEY (role_id, perm))",
  "CREATE TABLE IF NOT EXISTS os_members (id TEXT PRIMARY KEY, org_id TEXT, user_id TEXT, email TEXT, name TEXT, department_id TEXT, manager_user_id TEXT, title TEXT, kind TEXT, status TEXT, employment_type TEXT, started_at TEXT, weekly_hours INTEGER DEFAULT 40, cost_rate INTEGER, skills TEXT, last_active_at TEXT, invited_by TEXT, created_at TEXT, updated_at TEXT, offboarded_at TEXT)",
  "CREATE UNIQUE INDEX IF NOT EXISTS os_members_email ON os_members(org_id, email)",
  "CREATE INDEX IF NOT EXISTS os_members_user ON os_members(user_id)",
  "CREATE INDEX IF NOT EXISTS os_members_dept ON os_members(org_id, department_id, status)",
  "CREATE TABLE IF NOT EXISTS os_member_roles (member_id TEXT, role_id TEXT, PRIMARY KEY (member_id, role_id))",
  "CREATE TABLE IF NOT EXISTS os_member_perms (id TEXT PRIMARY KEY, member_id TEXT, perm TEXT, expires_at TEXT, reason TEXT, granted_by TEXT, created_at TEXT, revoked_at TEXT)",
  "CREATE INDEX IF NOT EXISTS os_member_perms_m ON os_member_perms(member_id, revoked_at)",
  "CREATE TABLE IF NOT EXISTS os_teams (id TEXT PRIMARY KEY, org_id TEXT, name TEXT, department_id TEXT, manager_user_id TEXT, project_id TEXT, status TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS os_team_members (team_id TEXT, user_id TEXT, pro_id TEXT, role_label TEXT, added_at TEXT, PRIMARY KEY (team_id, user_id, pro_id))",
  "CREATE TABLE IF NOT EXISTS os_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT, actor_user_id TEXT, actor_email TEXT, action TEXT, target_kind TEXT, target_id TEXT, before TEXT, after TEXT, reason TEXT, source TEXT, session_hash TEXT, ip_hash TEXT, created_at TEXT)",
  "CREATE INDEX IF NOT EXISTS os_audit_t ON os_audit(created_at)",
  "CREATE INDEX IF NOT EXISTS os_audit_target ON os_audit(target_kind, target_id)",
  "CREATE TABLE IF NOT EXISTS os_user_prefs (user_id TEXT, k TEXT, v TEXT, updated_at TEXT, PRIMARY KEY (user_id, k))",
  "CREATE TABLE IF NOT EXISTS os_events (id INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT, kind TEXT, subject_kind TEXT, subject_id TEXT, actor_user_id TEXT, actor_name TEXT, payload TEXT, created_at TEXT)",
  "CREATE INDEX IF NOT EXISTS os_events_t ON os_events(created_at)",
  "CREATE INDEX IF NOT EXISTS os_events_s ON os_events(subject_kind, subject_id)",
  "CREATE TABLE IF NOT EXISTS os_flags (key TEXT, scope_kind TEXT, scope_id TEXT, on_ INTEGER, note TEXT, updated_by TEXT, updated_at TEXT, PRIMARY KEY (key, scope_kind, scope_id))",
  "CREATE TABLE IF NOT EXISTS os_modules (key TEXT PRIMARY KEY, enabled INTEGER DEFAULT 1, note TEXT, updated_by TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS os_task_deps (task_id TEXT, depends_on TEXT, PRIMARY KEY (task_id, depends_on))",
  "CREATE TABLE IF NOT EXISTS os_task_comments (id TEXT PRIMARY KEY, task_id TEXT, user_id TEXT, name TEXT, body TEXT, created_at TEXT)",
  "CREATE INDEX IF NOT EXISTS os_task_comments_t ON os_task_comments(task_id, created_at)",
  "CREATE TABLE IF NOT EXISTS os_approvals (id TEXT PRIMARY KEY, org_id TEXT, kind TEXT, object_kind TEXT, object_id TEXT, title TEXT, detail TEXT, requester_user_id TEXT, approver_user_id TEXT, status TEXT, deadline TEXT, decision_note TEXT, decided_by TEXT, decided_at TEXT, escalation INTEGER DEFAULT 0, escalated_at TEXT, department_id TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE INDEX IF NOT EXISTS os_approvals_a ON os_approvals(approver_user_id, status)",
  "CREATE INDEX IF NOT EXISTS os_approvals_r ON os_approvals(requester_user_id, status)",
  "CREATE TABLE IF NOT EXISTS os_project_briefs (project_id TEXT PRIMARY KEY, goal TEXT, deliverables TEXT, start_day TEXT, end_day TEXT, location TEXT, mode TEXT, budget INTEGER, roles TEXT, equipment TEXT, hours TEXT, priority TEXT, updated_by TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS os_deliverables (id TEXT PRIMARY KEY, project_id TEXT, title TEXT, status TEXT, owner_user_id TEXT, file_id TEXT, revision INTEGER DEFAULT 0, due TEXT, note TEXT, created_by TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE INDEX IF NOT EXISTS os_deliverables_p ON os_deliverables(project_id, status)",
  "CREATE TABLE IF NOT EXISTS os_expenses (id TEXT PRIMARY KEY, org_id TEXT, project_id TEXT, department_id TEXT, user_id TEXT, category TEXT, amount INTEGER, note TEXT, file_id TEXT, status TEXT, approval_id TEXT, created_at TEXT, decided_by TEXT, decided_at TEXT, reimbursed_at TEXT)",
  "CREATE INDEX IF NOT EXISTS os_expenses_p ON os_expenses(project_id, status)",
  "CREATE TABLE IF NOT EXISTS os_campaign_flow (campaign_id TEXT PRIMARY KEY, strategy_ready INTEGER DEFAULT 0, creative_ready INTEGER DEFAULT 0, tracking_ready INTEGER DEFAULT 0, approval_id TEXT, state TEXT, updated_by TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS os_impersonations (id TEXT PRIMARY KEY, owner_user_id TEXT, target_user_id TEXT, reason TEXT, started_at TEXT, expires_at TEXT, ended_at TEXT)",
  "CREATE TABLE IF NOT EXISTS os_health_log (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS os_ai_calls (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, question TEXT, tools TEXT, ok INTEGER, ms INTEGER, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS os_comments (id TEXT PRIMARY KEY, context_kind TEXT, context_id TEXT, user_id TEXT, name TEXT, body TEXT, created_at TEXT)",
  /* Phase 2 (v50.2) */
  "CREATE TABLE IF NOT EXISTS os_clients (id TEXT PRIMARY KEY, org_id TEXT, name TEXT, email TEXT, primary_user_id TEXT, client_org_id TEXT, status TEXT, industry TEXT, city TEXT, website TEXT, account_manager_user_id TEXT, renewal_at TEXT, notes TEXT, requirements TEXT, tags TEXT, health INTEGER, health_at TEXT, created_by TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE UNIQUE INDEX IF NOT EXISTS os_clients_user ON os_clients(primary_user_id)", "CREATE INDEX IF NOT EXISTS os_clients_am ON os_clients(account_manager_user_id, status)",
  "CREATE TABLE IF NOT EXISTS os_project_status_log (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, from_state TEXT, to_state TEXT, by_user_id TEXT, reason TEXT, created_at TEXT)", "CREATE INDEX IF NOT EXISTS os_psl_p ON os_project_status_log(project_id, created_at)",
  "CREATE TABLE IF NOT EXISTS os_scope_items (id TEXT PRIMARY KEY, project_id TEXT, title TEXT, kind TEXT, revisions INTEGER, status TEXT, change_id TEXT, created_by TEXT, created_at TEXT)", "CREATE INDEX IF NOT EXISTS os_scope_p ON os_scope_items(project_id)",
  "CREATE TABLE IF NOT EXISTS os_deliverable_reviews (id TEXT PRIMARY KEY, deliverable_id TEXT, project_id TEXT, revision INTEGER, action TEXT, by_user_id TEXT, by_role TEXT, note TEXT, created_at TEXT)", "CREATE INDEX IF NOT EXISTS os_dr_d ON os_deliverable_reviews(deliverable_id, created_at)",
  "CREATE TABLE IF NOT EXISTS os_risks (id TEXT PRIMARY KEY, org_id TEXT, project_id TEXT, title TEXT, kind TEXT, severity INTEGER, likelihood INTEGER, impact TEXT, mitigation TEXT, owner_user_id TEXT, status TEXT, review_at TEXT, created_by TEXT, created_at TEXT, updated_at TEXT)", "CREATE INDEX IF NOT EXISTS os_risks_p ON os_risks(project_id, status)",
  "CREATE TABLE IF NOT EXISTS os_daily_reports (id TEXT PRIMARY KEY, project_id TEXT, user_id TEXT, day TEXT, done TEXT, pending TEXT, blockers TEXT, client_update TEXT, team_issues TEXT, next_plan TEXT, budget_note TEXT, risk_note TEXT, created_at TEXT)", "CREATE UNIQUE INDEX IF NOT EXISTS os_dreport_u ON os_daily_reports(project_id, user_id, day)",
  "CREATE INDEX IF NOT EXISTS os_comments_ctx ON os_comments(context_kind, context_id, created_at)",
  /* v50.8: indexes found missing by the 10,000-project / 50,000-task test (each of these was a full table scan) */
  "CREATE INDEX IF NOT EXISTS biz_tasks_project ON biz_tasks(project_id, status)", "CREATE INDEX IF NOT EXISTS biz_tasks_creator ON biz_tasks(created_by)",
  "CREATE INDEX IF NOT EXISTS os_members_mgr ON os_members(manager_user_id)", "CREATE INDEX IF NOT EXISTS os_team_members_u ON os_team_members(user_id)",
  "CREATE INDEX IF NOT EXISTS biz_milestones_project ON biz_milestones(project_id)", "CREATE INDEX IF NOT EXISTS os_teams_project ON os_teams(project_id)"
];
/* additive columns on existing tables (v49). migrateOnce skips the ones that already exist. */
const MIG = [
  "ALTER TABLE biz_tasks ADD COLUMN assignee_user_id TEXT", "ALTER TABLE biz_tasks ADD COLUMN department_id TEXT", "ALTER TABLE biz_tasks ADD COLUMN priority TEXT", "ALTER TABLE biz_tasks ADD COLUMN description TEXT",
  "ALTER TABLE biz_tasks ADD COLUMN start_date TEXT", "ALTER TABLE biz_tasks ADD COLUMN estimated_min INTEGER", "ALTER TABLE biz_tasks ADD COLUMN actual_min INTEGER", "ALTER TABLE biz_tasks ADD COLUMN approval_required INTEGER DEFAULT 0",
  "ALTER TABLE biz_tasks ADD COLUMN checklist TEXT", "ALTER TABLE biz_tasks ADD COLUMN parent_id TEXT", "ALTER TABLE biz_tasks ADD COLUMN completed_at TEXT", "ALTER TABLE biz_tasks ADD COLUMN org_id TEXT", "ALTER TABLE biz_tasks ADD COLUMN kind TEXT",
  "CREATE INDEX IF NOT EXISTS biz_tasks_assignee ON biz_tasks(assignee_user_id, status)", "CREATE INDEX IF NOT EXISTS biz_tasks_dept ON biz_tasks(department_id, status)", "CREATE INDEX IF NOT EXISTS biz_tasks_due ON biz_tasks(status, due)",
  "ALTER TABLE biz_projects ADD COLUMN org_id TEXT", "ALTER TABLE biz_projects ADD COLUMN type TEXT", "ALTER TABLE biz_projects ADD COLUMN department_id TEXT", "ALTER TABLE biz_projects ADD COLUMN owner_user_id TEXT", "ALTER TABLE biz_projects ADD COLUMN priority TEXT", "ALTER TABLE biz_projects ADD COLUMN due TEXT", "ALTER TABLE biz_projects ADD COLUMN archived_at TEXT",
  "ALTER TABLE biz_projects ADD COLUMN kind TEXT", "ALTER TABLE biz_projects ADD COLUMN lifecycle TEXT", "ALTER TABLE biz_projects ADD COLUMN os_client_id TEXT", "CREATE INDEX IF NOT EXISTS biz_projects_client2 ON biz_projects(os_client_id)",
  "CREATE INDEX IF NOT EXISTS biz_projects_owner ON biz_projects(owner_user_id, status)", "CREATE INDEX IF NOT EXISTS biz_projects_dept ON biz_projects(department_id, status)",
  "ALTER TABLE biz_messages ADD COLUMN context_kind TEXT", "ALTER TABLE biz_messages ADD COLUMN context_id TEXT", "CREATE INDEX IF NOT EXISTS biz_messages_ctx ON biz_messages(context_kind, context_id)",
  "ALTER TABLE biz_files ADD COLUMN context_kind TEXT", "ALTER TABLE biz_files ADD COLUMN context_id TEXT",
  "ALTER TABLE biz_pros ADD COLUMN lifecycle TEXT",
  "ALTER TABLE biz_invoices ADD COLUMN due_date TEXT", "ALTER TABLE biz_invoices ADD COLUMN viewed_at TEXT", "ALTER TABLE biz_invoices ADD COLUMN paid_amount INTEGER",
  "ALTER TABLE biz_equipment ADD COLUMN condition TEXT", "ALTER TABLE biz_equipment ADD COLUMN location TEXT", "ALTER TABLE biz_equipment ADD COLUMN maintenance_due TEXT",
  "ALTER TABLE biz_campaigns ADD COLUMN workflow TEXT",
  "CREATE TABLE IF NOT EXISTS os_links (kind TEXT, ref TEXT, project_id TEXT, client_id TEXT, linked_by TEXT, created_at TEXT, PRIMARY KEY (kind, ref, project_id))",
  "ALTER TABLE os_project_briefs ADD COLUMN audience TEXT", "ALTER TABLE os_project_briefs ADD COLUMN expectations TEXT", "ALTER TABLE os_project_briefs ADD COLUMN success_metrics TEXT", "ALTER TABLE os_project_briefs ADD COLUMN constraints TEXT",
  "ALTER TABLE acct_sessions ADD COLUMN last_seen TEXT",
  "ALTER TABLE help_tickets ADD COLUMN sla_due TEXT", "ALTER TABLE help_tickets ADD COLUMN escalated_at TEXT", "ALTER TABLE help_tickets ADD COLUMN csat INTEGER", "ALTER TABLE help_tickets ADD COLUMN csat_note TEXT", "ALTER TABLE help_tickets ADD COLUMN assignee_user_id TEXT"
];
const ready = new WeakSet();
/* every module set-up the OS reads from (the "no such table" trap of CLAUDE.md 9.3), once per isolate */
/* every module whose tables the OS reads. Literal import paths: the bundler cannot resolve a variable import, which silently skipped all of these on the real runtime (caught in v50.2 visual check). */
const SETUPS = [() => import("../production.js").then((m) => m.pdb), () => import("../quotes.js").then((m) => m.qdb), () => import("../finance.js").then((m) => m.fdb), () => import("../payouts.js").then((m) => m.pdb), () => import("../jobs.js").then((m) => m.jdb), () => import("../crm.js").then((m) => m.cdb), () => import("../files.js").then((m) => m.fdb), () => import("../orgs.js").then((m) => m.odb), () => import("../help.js").then((m) => m.hdb), () => import("../sites.js").then((m) => m.sdb)];
async function setups(env) { for (const load of SETUPS) { let fn = null; try { fn = await load(); } catch (e) { fn = null; } if (typeof fn === "function") await fn(env); } }
export async function osdb(env) {
  const d = await bdb(env); if (ready.has(d)) return d; await setups(env);
  for (const q of DDL) await d.prepare(q).run();
  await migrateOnce(d, MIG);
  await seed(d); await ftsProbe(d); ready.add(d); return d;
}
export const rid = (p) => p + randId(14);

/* ---------- seeds (idempotent) ---------- */
async function seed(d) {
  const now = nowIso();
  if (!(await one(d, "SELECT id FROM os_orgs WHERE id=?1", ORG))) await run(d, "INSERT INTO os_orgs (id, name, slug, status, settings, created_at) VALUES (?1,'FODO','fodo','active','{}',?2)", ORG, now);
  const depts = {}; for (const r of await all(d, "SELECT id, slug FROM os_departments WHERE org_id=?1", ORG)) depts[r.slug] = r.id;
  for (const n of DEPARTMENTS) { const s = slugOf(n); if (!depts[s]) { const id = rid("dp"); await run(d, "INSERT INTO os_departments (id, org_id, name, slug, status, created_at) VALUES (?1,?2,?3,?4,'active',?5)", id, ORG, n, s, now); depts[s] = id; } }
  const roles = {}; for (const r of await all(d, "SELECT id, slug FROM os_roles WHERE org_id=?1", ORG)) roles[r.slug] = r.id;
  for (const t of TEMPLATES) { if (roles[t.slug]) continue; const id = rid("rl"); await run(d, "INSERT INTO os_roles (id, org_id, name, slug, department_id, template, home, dashboard, status, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?4,?6,'[]','active',?7,?7)", id, ORG, t.name, t.slug, t.dept ? depts[slugOf(t.dept)] || null : null, t.home, now); roles[t.slug] = id;
    await pairs(d, "os_role_perms", [...new Set(t.perms.filter(validPerm))].map((p) => [id, p])); }
  await syncTemplates(d, roles);
  /* owners and legacy staff become members once; later changes are made in People & Access, never by the seed again */
  await backfillLegacy(d, depts, roles);
}
/* v50.7: template upgrades reach roles that already exist. The seed above creates a role once and never touches it again, so a
   permission added to a template in a later release (asset, report, workflow, decision, agent, and the Phase 7 resources) never
   reached the live roles. os_template_sync remembers every template permission ever handed to a role: a permission the template
   gains later is added once; one the owner removed is never added back. First run: the role's current permissions plus the
   Phase 1 resources count as already handed out, so owner edits made before this release stay as they are. */
/* multi-row INSERT OR IGNORE of (role_id, perm) pairs, 45 rows per statement (D1: at most 100 bound values) */
async function pairs(d, table, rows) { for (let k = 0; k < rows.length; k += 45) { const part = rows.slice(k, k + 45); await d.prepare("INSERT OR IGNORE INTO " + table + " (role_id, perm) VALUES " + part.map((_, n) => "(?" + (2 * n + 1) + ",?" + (2 * n + 2) + ")").join(",")).bind(...[].concat(...part)).run(); } }
export const LATER = ["asset", "report", "workflow", "decision", "agent", "vendor", "purchase", "integration", "subscription", "knowledge", "document", "inbox", "risk", "incident", "privacy"];
export async function syncTemplates(d, roles) {
  await d.prepare("CREATE TABLE IF NOT EXISTS os_template_sync (role_id TEXT, perm TEXT, PRIMARY KEY (role_id, perm))").run(); let added = 0;
  if (!roles) { roles = {}; for (const r of await all(d, "SELECT id, slug FROM os_roles WHERE org_id=?1", ORG)) roles[r.slug] = r.id; }
  /* three reads in total, writes in multi-row batches (D1 allows 100 bound values per statement), so a cold start stays cheap */
  const seenAll = {}, curAll = {}; for (const r of await all(d, "SELECT role_id, perm FROM os_template_sync")) (seenAll[r.role_id] = seenAll[r.role_id] || new Set()).add(r.perm);
  for (const r of await all(d, "SELECT role_id, perm FROM os_role_perms")) (curAll[r.role_id] = curAll[r.role_id] || new Set()).add(r.perm);
  const toSync = [], toGrant = [];
  for (const t of TEMPLATES) { const id = roles[t.slug]; if (!id) continue; const perms = t.perms.filter(validPerm), seen = seenAll[id] || new Set(), cur = curAll[id] || new Set();
    if (!seen.size) { for (const p of perms) if (cur.has(p) || LATER.indexOf(p.split(".")[0]) < 0) { seen.add(p); toSync.push([id, p]); } }
    for (const p of perms) { if (seen.has(p)) continue; seen.add(p); toSync.push([id, p]); if (!cur.has(p)) { toGrant.push([id, p]); added++; } } }
  await pairs(d, "os_role_perms", toGrant); await pairs(d, "os_template_sync", toSync); return { added };
}
/* legacy staff (OWNER_EMAILS, acct_admins, biz_staff) become members once; also called lazily by principal() for a staff e-mail
   that was added to the old tables after the OS set-up ran, so nobody loses access during the migration */
export async function backfillLegacy(d, depts, roles, onlyEmail) {
  const now = nowIso(); if (!depts) { depts = {}; for (const r of await all(d, "SELECT id, slug FROM os_departments WHERE org_id=?1", ORG)) depts[r.slug] = r.id; } if (!roles) { roles = {}; for (const r of await all(d, "SELECT id, slug FROM os_roles WHERE org_id=?1", ORG)) roles[r.slug] = r.id; }
  const have = {}; for (const m of await all(d, "SELECT id, email FROM os_members WHERE org_id=?1", ORG)) have[m.email] = m.id;
  const add = async (email, roleSlug, kind, title) => { if (onlyEmail && email !== onlyEmail) return; email = String(email || "").toLowerCase(); if (!email || have[email]) return; const u = await one(d, "SELECT id, name FROM acct_users WHERE email=?1", email).catch(() => null), id = rid("mb");
    await run(d, "INSERT INTO os_members (id, org_id, user_id, email, name, department_id, title, kind, status, employment_type, started_at, weekly_hours, skills, invited_by, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'active','full_time',?9,40,'[]','seed',?9,?9)", id, ORG, u ? u.id : null, email, (u && u.name) || "", depts[slugOf((TEMPLATES.find((t) => t.slug === roleSlug) || {}).dept || "Management")] || null, title, kind, now);
    await run(d, "INSERT OR IGNORE INTO os_member_roles (member_id, role_id) VALUES (?1,?2)", id, roles[roleSlug]); have[email] = id; };
  for (const e of OWNER_EMAILS) await add(e, "owner", "employee", "Owner");
  for (const a of await all(d, "SELECT email, role FROM acct_admins").catch(() => [])) await add(a.email, a.role === "admin" ? "admin" : "viewer", "employee", a.role === "admin" ? "Admin" : "Viewer");
  for (const s of await all(d, "SELECT email, role FROM biz_staff").catch(() => [])) await add(s.email, LEGACY[s.role] || "viewer", "employee", s.role);
}
/* link a member row to its account once the person signs in (invited by e-mail before the account existed) */
export async function linkMember(d, u) { if (!u || !u.email) return null; const m = await one(d, "SELECT * FROM os_members WHERE org_id=?1 AND email=?2", ORG, String(u.email).toLowerCase()); if (!m) return null;
  if (!m.user_id || !m.name || m.status === "invited") { await run(d, "UPDATE os_members SET user_id=?2, name=COALESCE(NULLIF(name,''),?3), last_active_at=?4, status=CASE WHEN status='invited' THEN 'active' ELSE status END WHERE id=?1", m.id, u.id, clip(u.name, 80), nowIso()); m.user_id = u.id; if (m.status === "invited") m.status = "active"; }
  return m; }
export const prefGet = async (d, userId, k, dflt) => { const r = await one(d, "SELECT v FROM os_user_prefs WHERE user_id=?1 AND k=?2", userId, k); return r ? J(r.v, dflt) : dflt; };
export const prefSet = (d, userId, k, v) => run(d, "INSERT OR REPLACE INTO os_user_prefs (user_id, k, v, updated_at) VALUES (?1,?2,?3,?4)", userId, k, JSON.stringify(v), nowIso());
/* P1-12: does this D1 have FTS5? Recorded once as a system flag; global search (Phase 2) reads it instead of guessing */
async function ftsProbe(d) { if (await one(d, "SELECT 1 x FROM os_flags WHERE key='fts5' AND scope_kind='system'")) return; let on = 0; try { await d.prepare("CREATE VIRTUAL TABLE IF NOT EXISTS os_fts_probe USING fts5(t)").run(); await d.prepare("DROP TABLE IF EXISTS os_fts_probe").run(); on = 1; } catch (e) { on = 0; }
  await run(d, "INSERT OR IGNORE INTO os_flags (key, scope_kind, scope_id, on_, note, updated_by, updated_at) VALUES ('fts5','system','',?1,'probed at set-up','system',?2)", on, nowIso()); }
export const flagOn = async (d, key, scopes) => { const rows = await all(d, "SELECT scope_kind, scope_id, on_ FROM os_flags WHERE key=?1", key); let v = null; for (const r of rows) { if (r.scope_kind === "system") v = v == null ? !!r.on_ : v; for (const [k, id] of scopes || []) if (r.scope_kind === k && r.scope_id === id) v = !!r.on_; } return !!v; };
