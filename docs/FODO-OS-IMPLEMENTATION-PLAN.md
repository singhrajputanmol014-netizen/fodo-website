# FODO OS: implementation plan

Companion to `docs/FODO-OS-AUDIT.md`. This plan turns the FODO OS master prompt into ten shippable releases (v49.1 to v49.10) on top of v47.6.1, without rewriting anything that works.

Ground rules carried from `CLAUDE.md`: additive database changes only, server-side authorization, no fake states, no visual redesign (new screens reuse the existing `ws-*` design system; any navigation change is screenshot-approved first), "FODO Pro" never "worker", no long dash in product copy, every phase ships with its own test suite and report.

---

## 1. Permission architecture (the foundation everything else uses)

### 1.1 Registry: single source of truth

New file `functions/_lib/os/permissions.js` exports one object `REGISTRY`:

```js
export const SCOPES = ["own", "assigned", "team", "department", "organization", "all"];
export const REGISTRY = {
  project:   { view: SCOPES, create: ["team","department","organization","all"], update: SCOPES, delete: ["organization","all"], archive: ["department","organization","all"] },
  task:      { view: SCOPES, create: SCOPES.slice(1), update: SCOPES, assign: ["team","department","organization","all"], delete: ["team","department","organization","all"] },
  file:      { read: SCOPES, upload: SCOPES, manage: ["team","department","organization","all"] },
  approval:  { request: SCOPES, decide: ["team","department","organization","all"] },
  client:    { view: ["assigned","team","department","organization","all"], manage: ["department","organization","all"] },
  crm:       { view: ["own","team","department","organization","all"], manage: ["own","team","department","organization","all"] },
  quote:     { view: ["assigned","department","organization","all"], manage: ["department","organization","all"] },
  contract:  { view: ["assigned","department","organization","all"], manage: ["department","organization","all"] },
  finance:   { view: ["department","organization","all"], manage: ["organization","all"] },
  payout:    { view: ["organization","all"], approve: ["all"] },
  pro:       { view: ["assigned","department","organization","all"], manage: ["department","organization","all"] },
  people:    { view: ["team","department","organization","all"], manage: ["organization","all"] },
  calendar:  { view: SCOPES },
  campaign:  { view: SCOPES.slice(1), manage: ["team","department","organization","all"], publish: ["department","organization","all"] },
  content:   { view: SCOPES, manage: SCOPES, approve: ["team","department","organization","all"] },
  site:      { view: ["assigned","organization","all"], edit: ["assigned","organization","all"], publish: ["assigned","organization","all"] },
  growthlab: { view: ["assigned","organization","all"], run: ["assigned","organization","all"] },
  xray:      { view: ["assigned","organization","all"], run: ["assigned","organization","all"] },
  analytics: { view: ["team","department","organization","all"], export: ["organization","all"] },
  equipment: { view: ["department","organization","all"], manage: ["department","organization","all"] },
  system:    { settings: ["all"], override: ["all"], impersonate: ["all"], audit: ["organization","all"], health: ["organization","all"], modules: ["all"], flags: ["all"] },
  brain:     { use: ["all"] }, assistant: { use: ["own"] }
};
```

A permission string is `resource.action.scope` (for example `task.update.assigned`). `validPerm(s)` checks it against the registry. The registry is also served read-only at `GET /api/biz/os/registry` for the Access Builder UI, so the UI never hardcodes it.

### 1.2 Data model (all new tables carry the `os_` prefix; nothing existing is renamed)

```
os_orgs           (id, name, slug, status, settings JSON, created_at)                      -- FODO internal organization(s); one row "fodo" seeded
os_departments    (id, org_id, name, slug, manager_user_id, status, created_at)             -- configurable, archive not delete
os_roles          (id, org_id, name, slug, department_id, template, dashboard JSON, workspace, created_at)
os_role_perms     (role_id, perm)                                                           -- perm = resource.action.scope
os_members        (id, org_id, user_id, email, department_id, manager_user_id, title, kind (employee|contractor|pro|client),
                   status (invited|active|suspended|offboarded), employment_type, started_at, last_active_at, created_at)
os_member_roles   (member_id, role_id)
os_member_perms   (id, member_id, perm, expires_at, reason, granted_by, created_at)         -- temporary / extra grants (section 49)
os_teams          (id, org_id, name, department_id, manager_user_id, project_id NULL, status, created_at)
os_team_members   (team_id, member_id NULL, pro_id NULL, email NULL, role_label, added_at)
os_audit          (id, org_id, actor_user_id, actor_email, action, target_kind, target_id, before JSON, after JSON, reason, source, session_hash, ip_hash, created_at)
os_sessions_view  -> not a table; GET os/people/<id>/sessions reads acct_sessions by user_id (revoke = DELETE)
os_user_prefs     (user_id, k, v, updated_at)                                               -- dashboard layout, filters, timezone
os_events         (id, org_id, kind, subject_kind, subject_id, actor_user_id, payload JSON, created_at)   -- event bus (section 45)
os_flags          (id, key, scope_kind (system|org|department|role|user), scope_id, on INTEGER, note, updated_by, updated_at)
os_modules        (key, enabled INTEGER, note, updated_by, updated_at)                      -- owner module switches (section 105)
```

`biz_audit` and `brain_audit` stay; `os_audit` is the structured one for OS actions and the audit viewer reads all three.

Existing objects get **nullable** columns, added through `migrateOnce`: `biz_projects.org_id, kind, type, department_id, owner_member_id`; `biz_tasks.assignee_user_id, department_id, priority, description, start_date, estimated_min, actual_min, approval_required, checklist JSON, parent_id, completed_at` (`project_id` becomes nullable for department work); `biz_messages.context_kind, context_id`; `biz_files.context_kind, context_id`; `crm_deals.stage`.

### 1.3 Authorization middleware

New file `functions/_lib/os/authz.js`:

```js
export async function principal(env, u)       // -> { user, member, roles:[...slugs], perms:Set, dept, manager, isOwner, legacy: rolesOf() result }
export function allows(P, resource, action)   // -> highest scope granted or null   (owner -> "all"; checks os_member_perms expiry)
export async function authorize(env, P, { resource, action, target })   // target = { kind, id } -> { scope } or throws err(403)
```

`authorize` resolves the relationship between the principal and the target through one `relationOf(env, P, target)` helper (own = creator / owner id; assigned = task assignee or `biz_project_pros` / `os_team_members` row; team = same `os_teams` row; department = same `department_id`; organization = same `org_id`). It returns the matched scope so queries can be filtered the same way (`scopeFilter(P, scope)` adds `WHERE` fragments). Deny by default.

Policy functions (section 90) in `functions/_lib/os/policy.js`: `canViewProject(env,P,id)`, `canEditProject`, `canAssignTask`, `canViewFinance`, `canManagePro`, `canPublishSite`, `canApprovePayment`, `canManageUsers` ... all thin wrappers over `authorize`.

**Compatibility shim (the key to not breaking anything):** `rolesOf()` in biz.js stays. In Phase 1 `principal()` builds the legacy roles array from `os_members` when a row exists and falls back to the existing `acct_admins` / `biz_staff` logic when it does not. The 62 existing `can(R, [...])` checks therefore keep working unchanged; they are migrated route by route in later phases to `authorize()` and the old check is removed only when its suite passes on the new one.

### 1.4 Owner

Owner = OWNER_EMAILS (unchanged) **or** an `os_member_roles` row for the seeded `owner` role (so a future second owner is data, not code). `allows()` short-circuits to scope `all` for owners, but every write still goes through `audit()`; `system.override` use writes `OWNER_OVERRIDE` with the reason.

### 1.5 Role templates (data, seeded once, editable)

owner, admin, operations_manager, project_manager, production_manager, creative_director, designer, video_editor, performance_marketer, social_media_manager, sales_executive, finance_manager, hr_talent_manager, developer, fodo_pro, client. Seed file `functions/_lib/os/role-seed.js` (tagged `template`, same idea as `catalog-seed.js`). Changing a template later only affects new roles.

---

## 2. Route architecture

- Workspace stays at `/workspace/` with hash routes. New OS views: `#my-fodo`, `#work` (queue), `#tasks`, `#approvals`, `#calendar`, `#people`, `#access` (role / permission editor), `#audit`, `#health`, `#command` (Owner Command Center), `#all-systems`, `#activity`, `#flags`.
- `GET /api/biz/me` returns `nav` built by `navFor(P)` from the registry (employees see only modules they hold a `view` permission for; clients and pros keep their current navigation exactly).
- `_redirects` aliases: `/fodo` → `/workspace/#my-fodo`, `/fodo/work` → `/workspace/#work`, `/fodo/projects` → `/workspace/#projects`, `/fodo/people` → `/workspace/#people`, `/fodo/owner` → `/workspace/#command`, `/fodo/admin` → `/workspace/#admin`, `/fodo/finance` → `/workspace/#finance` ... (public, harmless, no new shell).
- API: everything under `/api/biz/os/*` (`os/registry`, `os/me`, `os/people`, `os/roles`, `os/departments`, `os/teams`, `os/grants`, `os/audit`, `os/events`, `os/flags`, `os/modules`, `os/health`, `os/impersonate`, `os/tasks`, `os/approvals`, `os/queue`, `os/calendar`, `os/workload`, `os/command`, `os/search`). Existing endpoints keep their paths and payload shapes.
- Breadcrumbs: `FODO_WS.head()` already renders a view header; Phase 2 adds a `crumbs` array to it (FODO / Projects / ABC Campaign / Creative). Context switcher appears in Phase 3 only for members in more than one department / team; single-context users never see it.

---

## 3. UI architecture

- Same shell, same `css/workspace.css`, same `ws-*` classes, same lazy-module pattern. New modules: `js/ws-os.js` (My FODO, work queue, tasks, approvals, calendar, workload), `js/ws-people.js` (People & Access, Access Builder tree, onboarding / offboarding, impersonation banner), `js/ws-command.js` (Owner Command Center widgets, All Systems map, system health, activity feed, flags / modules). Each lazy-loaded through `lazy()`; no bundle growth for clients and pros.
- Ctrl+K: the existing staff search (`ADMIN_JUMP` + `admin/search`) is extended with commands filtered by permission (section 27). No new palette component.
- Widgets (section 72): one `WIDGETS` registry in `ws-command.js` (tasks, projects, revenue, approvals, calendar, capacity, campaigns, payments, applications, jobs); per-role default list from `os_roles.dashboard`, owner layout saved in `os_user_prefs`.
- Mobile: every new view is checked at 390 px like every V47 phase (no horizontal scroll).
- Empty states: `FODO_WS.empty()` already exists; each new list uses it with a role-aware action.
- **Nothing in the public site, Pros portal, Builder, Owner Brain or client Workspace looks different** unless a phase explicitly asks for it and the screenshot is approved.

---

## 4. Phases: exact files to change and create

Conventions: `+` new file, `~` edited (additively), `T` tests, `D` docs. Every phase ends with `VERSION`, `docs/FODO-V49.x-REPORT.md`, `tests/run.mjs` registration, full suite, visual check, zip.

### Phase 1: Foundation (v49.1)
- `+ functions/_lib/os/permissions.js` registry + `validPerm` + `SCOPES`
- `+ functions/_lib/os/db.js` `osdb(env)` (calls `bdb` first), `MIG` with the `os_*` tables of 1.2, seeded org `fodo`, departments (Management, Operations, Production, Creative, Design, Post Production, Marketing, Sales, Finance, HR, Technology, AI, Customer Success), role templates, owner members from OWNER_EMAILS, and **backfill**: every `acct_admins` / `biz_staff` row becomes an `os_members` row with the matching template (admin → admin, moderator → operations_manager (view scopes only), finance → finance_manager, viewer → a read-only `viewer` role). Old rows are kept.
- `+ functions/_lib/os/authz.js` `principal`, `allows`, `authorize`, `relationOf`, `scopeFilter`
- `+ functions/_lib/os/policy.js` the `can*` policy functions
- `+ functions/_lib/os/audit.js` `audit(env, P, action, target, before, after, reason)` + `auditList` (merges `os_audit`, `biz_audit`, `brain_audit` with filters, keyset pagination)
- `+ functions/_lib/os/people.js` members CRUD (invite, edit, suspend, unsuspend, role assign, department change, temporary grant with expiry, remove = offboard step 1 to 3: status, session revoke, grants cleared), departments CRUD, roles CRUD (custom roles from the registry), `sessionsOf`, `revokeSessions`
- `+ functions/_lib/os/impersonate.js` owner-only "read as": token in KV (30 min), `principal()` honours it for GET only, banner flag in `me`, audit on start / stop
- `~ functions/_lib/biz.js` `rolesOf` consults `os_members` first (shim), `navFor` accepts the principal, exports unchanged
- `~ functions/api/biz/[[path]].js` routes `os/registry|me|people|departments|roles|grants|audit|impersonate`, all behind `authorize({ resource: "people" | "system" })`
- `~ functions/_lib/brain/tools.js` the Brain's marketplace tools call `allows()` for the acting owner (no behaviour change for owners, groundwork for Phase 10)
- `~ js/workspace.js` lazy `ws-people.js`; admin tab **People & Access** (new tab, same tab bar style; screenshot first); impersonation banner (plain `ws-pill` bar at the top, "Viewing as <name>, read-only · Stop")
- `+ js/ws-people.js` People list (employee, department, role, manager, status, last active, access level), member drawer (edit, suspend, roles, department, temporary access with expiry + reason, sessions revoke), Departments, Roles & Access Builder (tree from `os/registry`, scope select per permission), Audit viewer (filters: actor, action, target, date)
- `~ scripts/build_pages.py` nothing visual; `_redirects` gets the `/fodo/*` aliases
- `T tests/v491.test.mjs` registry validity, seed idempotence, backfill of legacy staff, `authorize` matrix (owner / admin / manager / employee / pro / client × every resource), temporary grant expiry, suspend blocks login use, session revoke, impersonation read-only + audit + expiry, audit viewer filters, legacy routes unchanged (replays the v47 suites), `OWNER_CAN_ACCESS_ALL_SYSTEM_MODULES` (iterates the registry and every nav id)
- `D docs/FODO-OS-PERMISSIONS.md`, `docs/FODO-OS-ROLES.md`, `docs/FODO-OS-DATA-MODEL.md` (first versions), `docs/FODO-V49.1-REPORT.md`

### Phase 2: My FODO (v49.2)
- `+ functions/_lib/os/tasks.js` task engine 2.0 on `biz_tasks` (+ `os_task_deps`, `os_task_comments`): statuses backlog / todo / in_progress / blocked / review / approved / done / cancelled (existing `todo | done` values stay valid), assignee, priority, dates, estimates, checklist, dependencies (cycle check, auto-`blocked` when a predecessor is open, auto-unblock on completion), comments, approval flag → creates an `os_approvals` row
- `+ functions/_lib/os/approvals.js` generic approvals (kinds creative, client, budget, payment, payout, campaign, site_publish, contract, refund, production; statuses pending / approved / rejected / expired / cancelled; escalation chain approver → manager → department head → operations → owner, run by a new job kind `approval_escalate`, one notification per step, never a broadcast)
- `+ functions/_lib/os/queue.js` work queues per department (SQL views over tasks, approvals, shoots, invitations, files, invoices by department)
- `+ functions/_lib/os/calendar2.js` unified calendar events (tasks due, milestones, shoot / booked days, team dates, approvals deadlines, quote expiry) filtered by `authorize` scope; day / week / month / timeline payloads; iCal feeds reuse `calendar.js`
- `+ functions/_lib/os/workload.js` allocated vs available minutes per member (from task estimates + working hours in `os_members`), underutilised / healthy / overloaded thresholds (owner-tunable in `biz_settings.workload`)
- `~ functions/_lib/biz.js` notifications get `category` (task, project, approval, payment, booking, message, system, security) and `urgency` (urgent, action, info); `notify()` signature stays, new optional 6th argument
- `~ functions/_lib/jobs.js` handler `approval_escalate`, `deadline_reminder`
- `~ functions/api/biz/[[path]].js` routes `os/tasks*`, `os/approvals*`, `os/queue`, `os/calendar`, `os/workload`, `os/my`
- `+ js/ws-os.js` **My FODO** (Today, My Work, Quick actions, Notifications split urgent / action required / info), Work queue, Tasks (board + list + drawer), Approvals, Calendar (day / week / month / timeline), Workload (managers)
- `~ js/workspace.js` employees (os_members of kind employee) land on `#my-fodo` instead of `#overview`; clients and pros unchanged; notifications view gets the filter row
- `T tests/v492.test.mjs` state machine, dependencies and blockers, approval escalation timing, queue scoping (designer never sees finance rows), calendar visibility per scope, workload maths, notification categories
- `D docs/FODO-OS-EMPLOYEE-GUIDE.md` (first version), `docs/FODO-V49.2-REPORT.md`

### Phase 3: Project OS (v49.3)
- `~ functions/_lib/projects2.js` internal projects (`kind = internal`, no client, no payment plan), project types (advertising, shoot, content, social, website, branding, campaign, business_setup, custom), `os_project_briefs` (goal, deliverables JSON, dates, location, mode online / offline / hybrid, budget, required roles, equipment, working hours, priority), `os_deliverables` (status draft / submitted / review / approved / delivered, file links, revision count), project activity timeline (reads `os_events`)
- `~ functions/_lib/production.js` the Build a Team builder accepts the brief and suggests employees as well as Pros (`match()` gets `os_members` candidates with skills from `os_member_skills`; reasons shown as today)
- `~ functions/_lib/biz.js` messages with `context_kind / context_id` (project, task, client, team, department, direct); files with context links and inherited permission (`authorize` on the parent)
- `+ functions/_lib/os/events.js` `emit(env, kind, subject, payload)` + subscribers table in code (`AUTOMATIONS`: project.created → default tasks by type; deliverable.submitted → review task; file.uploaded (footage) → notify editor; deadline.near → notify manager); all run through `biz_jobs`
- `~ js/workspace.js` project page gets the tab set Overview / Brief / Team / Schedule / Tasks / Files / Communication / Deliverables / Approvals / Equipment / Budget / Quote / Contract / Payments / Activity (existing tabs keep their names and order; new tabs appended; screenshot first)
- `T tests/v493.test.mjs` internal project without client, briefs, deliverables lifecycle, context threads isolation, automations fire once, activity timeline, breadcrumbs payload
- `D docs/FODO-OS-ARCHITECTURE.md`, `docs/FODO-V49.3-REPORT.md`

### Phase 4: People & Talent (v49.4)
- `~ functions/_lib/os/people.js` onboarding (name, email, department, role, manager, employment type, start date → membership, default permissions, onboarding checklist tasks, invitation mail, notification preferences); offboarding steps 4 to 10 (reassign tasks / projects / approvals / clients to a chosen replacement, preserve history, notify managers, never delete records); skills per member
- `~ functions/_lib/proapps.js` + `biz.js` Pro lifecycle field `biz_pros.lifecycle` (applicant, approved, available, assigned, booked, active, completed, suspended) kept in sync by the existing transitions (no new rules, one derived column + backfill)
- `~ functions/_lib/teams.js` teams can hold employees (`os_team_members.member_id`) next to Pros; invitations to employees are notifications, not e-mail-only
- `+ js/ws-people.js` onboarding wizard, offboarding handoff screen, skills, HR / Talent workspace (employees, Pros, applications, availability, rates (role-gated), contracts)
- `T tests/v494.test.mjs` onboarding creates everything once, offboarding reassigns and preserves, lifecycle sync against every existing transition, employee in a team, rates hidden from non-HR
- `D docs/FODO-V49.4-REPORT.md`

### Phase 5: Finance (v49.5)
- `~ functions/_lib/finance.js` `os_expenses` (project / department, category, amount, receipt file, status submitted / approved / reimbursed, approval through `os_approvals`); invoice statuses extended (viewed, partially_paid, overdue computed from due date, existing values untouched); profitability per project (client price − FODO fee − Pro cost − employee cost (from `os_members.cost_rate`, finance-only) − equipment − travel − expenses − taxes), stored as a computed read, never shown to clients or Pros
- `~ functions/api/biz/[[path]].js` finance routes move to `authorize({ resource: "finance" | "payout" })`; the old `can(R, ["admin","finance","viewer"])` checks removed only after the v47.3 suite passes on the new checks
- `~ js/ws-finance.js` Finance workspace entry (queue: payments pending, invoices, refunds, settlements, payouts, reconciliation), expenses, profitability card (finance / owner only)
- `T tests/v495.test.mjs` expenses lifecycle, invoice status computation, profitability maths and visibility (client 403, pro 403, employee 403, finance ok), all v47.3 finance checks replayed through `authorize`
- `D docs/FODO-V49.5-REPORT.md`

### Phase 6: Creative / Production (v49.6)
- `+ functions/_lib/os/content.js` content items (idea → brief → assigned → production → review → approved → scheduled → published → analytics), each stage can create tasks (automations), publish state honest: `scheduled` only when a connected social account exists (Brain social connectors), otherwise `ready`
- `~ functions/_lib/teams.js` / `availability.js` production checklist automation (shoot approved → call sheet, crew, equipment, location tasks), equipment assigned to projects (existing holds) visible in the project Equipment tab, maintenance / condition fields on `biz_equipment`
- `+ js/ws-os.js` Creative Studio / Design / Post Production / Production queues (same queue component, department filters)
- `T tests/v496.test.mjs` content workflow, honest publish states, production checklist automation, equipment fields
- `D docs/FODO-V49.6-REPORT.md`

### Phase 7: Marketing (v49.7)
- `~ functions/_lib/crm.js` pipeline stages (new, contacted, qualified, discovery, proposal, negotiation, won, lost) on `crm_deals.stage`, objects lead / prospect / client / contact / company / opportunity / proposal mapped onto `crm_contacts` + `crm_deals` with `kind`; scope through `authorize({ resource: "crm" })` (own / team / department)
- `~ functions/_lib/biz.js` campaigns get the workflow draft → strategy_ready → creative_ready → tracking_ready → approval → connected_account → launching → live → paused → completed; `live` only when a connected ads account reports it (Meta / Google connectors through the Brain; otherwise the state stops at `ready` with "Not connected")
- `~ js/workspace.js` Sales and Growth / Social workspaces (CRM pipeline board, campaigns list with honest states, marketing queue)
- `T tests/v497.test.mjs` pipeline transitions, CRM scoping, campaign states never fake `live`
- `D docs/FODO-V49.7-REPORT.md`

### Phase 8: FODO platform (v49.8)
- `~ functions/_lib/sites.js` `site.view / edit / publish` resolved through `authorize` with `site_members` as the "assigned" relation (tenant rule unchanged, performance code untouched)
- `~ functions/_lib/usage.js` / `xray-core.js` runs and reports can carry `client_id / project_id` (nullable) so a Growth Lab audit or X-Ray appears on the client and project pages; employees see only assigned ones
- `~ js/workspace.js` project page Analytics tab shows linked X-Rays / Growth Lab runs / site; Builder, Growth Lab, X-Ray reachable from the OS navigation for members with the permission
- `T tests/v498.test.mjs` builder permissions matrix (client own site only, employee assigned, owner all), X-Ray linkage and scoping, builder regression suites unchanged
- `D docs/FODO-V49.8-REPORT.md`

### Phase 9: Owner Command Center (v49.9)
- `+ functions/_lib/os/command.js` exception-driven summary (critical, needs attention, blocked, at risk, pending approval, financial risk, security risk, system error, deadline risk) built from Mission Control + tasks + approvals + finance + jobs + monitoring; sections Business, Operations, Marketplace, Sales, Marketing, Finance, Technology, AI; every figure comes from real tables (no estimates); All Systems map; activity feed from `os_events` with filters; system health (API, jobs, D1 reachability, R2 / KV, payment provider configured, mail, WhatsApp, OAuth tokens present, builder publish last status, AI keys present, failed jobs, CSP reports, client errors) reported as configured / not configured / failing, never "connected" without a real probe
- `~ functions/_lib/mission.js` exports gain JSON and audited PDF where appropriate (owner data export, section 92)
- `+ js/ws-command.js` Command Center with the widget engine, All Systems, Activity, System Health, Feature flags, Modules (enable / disable; disabled modules vanish from navigation for non-owners)
- `T tests/v499.test.mjs` exception rules, health probes honest states, widget defaults per role, flags scoping, module switch hides navigation, exports audited
- `D docs/FODO-OS-OPERATIONS.md`, `docs/FODO-OS-OWNER-GUIDE.md`, `docs/FODO-V49.9-REPORT.md`

### Phase 10: Owner Brain + FODO Assistant (v49.10)
- `~ functions/_lib/brain/tools.js` every OS-aware tool declares `resource.action` and calls `authorize` for the acting principal; levels stay (0 read, 1 write, 2 owner confirmation); new tools for tasks, approvals, people (read), workload, command summary, health; money tools unchanged (the Brain never moves money)
- `+ functions/_lib/os/assistant.js` FODO Assistant: same tool registry, restricted to level 0 and level 1 tools whose `authorize` passes for the employee; no memory of other users; audit of every call; rate limits
- `~ functions/api/biz/[[path]].js` `os/assistant` (chat endpoint, Workers AI / configured LLM, same honest fallback as the site bot)
- `~ js/ws-os.js` Assistant panel in My FODO (role-aware examples)
- `T tests/v4910.test.mjs` Brain tools cannot bypass `authorize`, assistant scope (designer asks for invoices → refused), levels unchanged, audit of AI calls
- `D docs/FODO-OS-API.md`, `docs/FODO-OS-SECURITY.md`, `docs/FODO-OS-MIGRATION.md` (final), `docs/FODO-V49.10-REPORT.md`

---

## 5. Database migration order (all additive, all through `migrateOnce`)

1. v49.1: `os_orgs, os_departments, os_roles, os_role_perms, os_members, os_member_roles, os_member_perms, os_teams, os_team_members, os_audit, os_user_prefs, os_events, os_flags, os_modules` + indexes (`org_id`, `user_id`, `email`, `department_id`, `status`, `created_at`, `expires_at`) + seeds + backfill of legacy staff.
2. v49.2: `biz_tasks` new nullable columns, `os_task_deps`, `os_task_comments`, `os_approvals`, `biz_notes.category / urgency`, indexes on `assignee_user_id, department_id, status, due`.
3. v49.3: `biz_projects.kind / type / department_id / org_id`, `os_project_briefs`, `os_deliverables`, `biz_messages.context_*`, `biz_files.context_*`, `os_member_skills`.
4. v49.4: `biz_pros.lifecycle` + backfill, `os_members.cost_rate / working_hours`, `os_onboarding` checklist rows as tasks (no table).
5. v49.5: `os_expenses`, `biz_invoices.viewed_at / paid_amount`.
6. v49.6: `os_content`, `biz_equipment.condition / maintenance_due / location`.
7. v49.7: `crm_deals.stage / kind`, `biz_campaigns.workflow`.
8. v49.8: `xray_reports.client_id / project_id`, `lab_tool_runs.project_id`.
9. v49.9: `os_health_log` (probe results), nothing else.
10. v49.10: `os_ai_calls` (assistant audit).

Never: rename or drop a column, change a primary key, or rewrite rows of live tables other than the explicit backfills above (each backfill is idempotent and tested on a copy of the schema).

---

## 6. API changes (summary)

- New namespace `/api/biz/os/*` (full list in section 2). Every handler: session → CSRF → rate limit → `principal()` → `authorize()` → library → `ok()`.
- Existing endpoints: same paths, same responses. Fields a caller may not see are filtered at the query layer (`scopeFilter`) or removed in `cleanFor(P, row)` before `ok()` (cost, margin, salary, payout data, private notes, bank details).
- Keyset pagination for every new list: `?after=<created_at|id>&limit=50`.
- Idempotency: write endpoints that create money or approval records accept `Idempotency-Key` (stored in KV for 24 h), as payouts already do.

---

## 7. Testing strategy

- Each phase: new `tests/v49x.test.mjs` on the existing `node:sqlite` D1-shim harness, registered in BUILDER / SECURITY / INTEGRATION lists; the full suite (currently 4,514 checks) must stay green; flaky e2e suites rerun alone as documented.
- Permission matrix test (from Phase 1, extended every phase): for each role template × each registry resource × view / manage, assert allow or 403; includes the negative cases from the prompt (employee → finance 403, pro → internal notes 403, client → margin 403, employee changes own role 403, manager → other department 403, member → other organization 404).
- `OWNER_CAN_ACCESS_ALL_SYSTEM_MODULES` + `OWNER_CAN_VIEW_ALL_*` (projects, people, pros, finance, files, analytics, permissions, system, brain).
- Security suites rerun every phase (IDOR, CSRF, rate limits, tenant isolation, builder isolation).
- Visual: desktop 1440 and phone 390 screenshots of every new or changed screen; navigation changes shown to the owner before packaging.
- CI (`fodo-tests.yml`) unchanged; `scripts/check.mjs` extended with "no raw permission strings outside the registry" (grep for `\.\w+\.(own|assigned|team|department|organization|all)` outside `os/`).

---

## 8. Rollback strategy

- Every phase is one commit on `main`; rollback = GitHub Desktop → revert → push (1 to 2 minutes).
- Tables are additive: older code ignores `os_*` tables and the new nullable columns. The legacy role tables stay populated during the whole programme, so reverting to any earlier version restores the old permission behaviour exactly.
- Kill switch without deploy: owner setting `biz_settings.os_enabled` (default on after Phase 1). Off = OS navigation hidden, `principal()` returns the legacy roles only, `/api/biz/os/*` answers 503 "FODO OS is switched off". Data is kept.
- Module switches (`os_modules`) and feature flags (`os_flags`) allow turning one part off (for example approvals escalation) without touching the rest.
- Backfills are re-runnable; a failed migration statement is recorded in `schema_migrations` only on success, so a retry on the next request is automatic.

---

## 9. What will NOT be done (said plainly)

- No second shell at `/fodo/*` (aliases only), no new design language, no rewrite of the Builder, Growth Lab, X-Ray, Brain or payments.
- No "Connected" or "Live" state for ads, social, WhatsApp, payouts or publishing until the provider confirms (existing rule).
- No real-time push / WebSocket layer; "live" activity refreshes on an interval like Mission Control does.
- No full-text search index in D1 beyond `LIKE` with limits (D1 FTS5 availability is checked in Phase 9; if present, the search uses it, else the existing staff search stays).
- No Slack-style chat; threads stay attached to objects.

---

## 10. Order of work for the next session

1. Owner confirms this plan (or the phases to run first).
2. Phase 1 (v49.1) is built end to end: backend, People & Access tab, tests, report, zip. Screenshot of the new admin tab is shown before packaging.
3. Each following phase starts only after the previous zip is deployed and the owner has tested it ("next phase start kardo").
