# FODO OS V4: data model (v50.1, Phase 1)

All tables are created by `osdb()` in `functions/_lib/os/db.js` (after `bdb()`), additively, with `CREATE TABLE IF NOT EXISTS` and `migrateOnce` for columns on existing tables. Nothing existing is renamed or dropped. Every `os_*` business table carries `org_id` ('fodo'), `created_at` and, where it has an owner, `created_by` / `*_user_id`.

## 1. New tables (Phase 1)

| Table | Columns | Purpose |
|---|---|---|
| os_orgs | id PK, name, slug UNIQUE, status, settings JSON, created_at | FODO internal organization. One row `fodo`. Separate from `biz_orgs` (client companies). |
| os_departments | id PK, org_id, name, slug, manager_user_id, status (active / archived), created_at; UNIQUE(org_id, slug) | 13 seeded, configurable, archived never deleted |
| os_roles | id PK, org_id, name, slug, department_id, template (slug of the seed or NULL for custom), home, dashboard JSON, status, created_at, updated_at; UNIQUE(org_id, slug) | templates + custom roles |
| os_role_perms | role_id, perm; PK(role_id, perm) | permissions of a role (`resource.action.scope`) |
| os_members | id PK, org_id, user_id (acct_users.id, NULL until first login), email, name, department_id, manager_user_id, title, kind (employee / contractor), status (invited / active / suspended / offboarded), employment_type, started_at, weekly_hours (40), cost_rate (₹/hour, finance only), skills JSON, last_active_at, invited_by, created_at, updated_at, offboarded_at; UNIQUE(org_id, email); INDEX user_id; INDEX (org_id, department_id, status) | the people model |
| os_member_roles | member_id, role_id; PK | roles of a member |
| os_member_perms | id PK, member_id, perm, expires_at, reason, granted_by, created_at, revoked_at; INDEX(member_id, revoked_at) | temporary access |
| os_teams | id PK, org_id, name, department_id, manager_user_id, project_id, status, created_at | reusable or project teams (used from Phase 2) |
| os_team_members | team_id, user_id, pro_id, role_label, added_at; PK(team_id, user_id, pro_id) | employees or Pros in a team |
| os_audit | id AUTOINCREMENT, org_id, actor_user_id, actor_email, action, target_kind, target_id, before JSON, after JSON, reason, source (api / job / system / read-as), session_hash, ip_hash, created_at; INDEX created_at; INDEX(target_kind, target_id) | structured audit; secrets, tokens, bank fields scrubbed |
| os_events | id AUTOINCREMENT, org_id, kind, subject_kind, subject_id, actor_user_id, actor_name, payload JSON, created_at; INDEX created_at; INDEX(subject_kind, subject_id) | event bus / activity feed. Every `auditLog()` call in the marketplace also writes one (`project:create` → `project.create`) |
| os_comments | id PK, context_kind, context_id, user_id, name, body, created_at; INDEX(context_kind, context_id, created_at) | comments on any record (Phase 2 UI) |
| os_user_prefs | user_id, k, v JSON, updated_at; PK(user_id, k) | per-user UI preferences (`ui` key: collapsed navigation groups, filters) |
| os_flags | key, scope_kind (system / org / department / role / user), scope_id, on_, note, updated_by, updated_at; PK(key, scope_kind, scope_id) | feature flags; `fts5` system flag written by the FTS probe |
| os_modules | key PK, enabled (1), note, updated_by, updated_at | owner module switches (builder, growthlab, xray, pros, crm, studio, content, finance, approvals, assistant, expenses) |
| os_impersonations | id PK, owner_user_id, target_user_id, reason, started_at, expires_at, ended_at | view-as log (the live token is in KV `os:readas:<ownerUserId>`, 30 min) |
| os_task_deps, os_task_comments, os_approvals, os_project_briefs, os_deliverables, os_expenses, os_campaign_flow, os_links, os_health_log, os_ai_calls | created now, **used from Phase 2 onward** (empty in v50.1) | so later phases add no DDL surprises |

## 2. Columns added to existing tables (nullable, additive)

| Table | Columns | Used by |
|---|---|---|
| biz_notes | category, urgency (urgent / action / info), dedupe_key; INDEX(user_id, dedupe_key, created_at) | `notify()` v50.1 |
| biz_tasks | assignee_user_id, department_id, priority, description, start_date, estimated_min, actual_min, approval_required, checklist JSON, parent_id, completed_at, org_id, kind; indexes on assignee, department, (status, due) | `relationOf` (assigned / team) now; task engine Phase 2 |
| biz_projects | org_id, type, department_id, owner_user_id, priority, due, archived_at; indexes on owner, department | `relationOf` now; project OS Phase 2 |
| biz_messages | context_kind, context_id; INDEX | Phase 2 |
| biz_files | context_kind, context_id | Phase 2 |
| biz_pros | lifecycle | Phase 3 |
| biz_invoices | due_date, viewed_at, paid_amount | Phase 4 |
| biz_equipment | condition, location, maintenance_due | Phase 3 |
| biz_campaigns | workflow | Phase 5 |
| acct_sessions | last_seen | People & Access sessions list |

## 3. Seeds (idempotent, run once per isolate after DDL)

1. `os_orgs` row `fodo`.
2. 13 departments: Management, Operations, Production, Creative, Design, Post Production, Marketing, Sales, Finance, HR, Technology, AI, Customer Success.
3. 17 role templates with their permissions.
4. Members: `OWNER_EMAILS` → owner; `acct_admins` (role admin → admin, others → viewer); `biz_staff` (moderator → operations_manager, finance → finance_manager, viewer → viewer). A legacy staff e-mail added to the old tables later is provisioned on first sight by `principal()`.
5. FTS5 probe → `os_flags('fts5', 'system')`.

## 4. Record relationships used by `relationOf`

```
project: own = biz_projects.client_id / owner_user_id = me · assigned = my task on it, task I created on it, os_team_members me, accepted Pro (biz_project_pros / pro_id)
         team = os_teams I manage or share, project owner reports to me, a task assignee reports to me · department = biz_projects.department_id = mine
task:    assigned = assignee me · own = created_by me · team = assignee reports to me · department = task.department_id = mine · plus the project's relations (own → assigned)
member:  own = my row · team = reports to me · department = same department
approval / expense / deliverable: own = requester / submitter / owner · assigned = approver · department · project relations
client:  own = me · assigned = I own or work a task on one of their projects
```

## 5. Kill switch and settings

`biz_settings.k = 'os_enabled'` (`"0"` = off). Off: `/api/os/*` answers 503 (except the owner's settings call), `/api/biz/me` returns the v47 navigation with `os.enabled = false`. Module switches in `os_modules` hide entries from non-owner navigation.
