# FODO v50.1: FODO OS V4, Phase 1 (unified foundation)

The first release of FODO OS V4 (`docs/FODO-OS-V4-IMPLEMENTATION-PLAN.md`, Phase 1). Backend-heavy: one permission system, one people model, structured audit and events, People & Access, view-as, role-aware navigation. Clients and FODO Pros see no change.

## 1. What is new

**Permission system** (`functions/_lib/os/permissions.js`, `authz.js`): permissions are `resource.action.scope` strings (29 resources, 6 scopes own → all), bundled into roles. 17 role templates seeded as data (owner, admin, operations manager, project manager, production manager, creative director, designer, video editor, performance marketer, social media manager, sales executive, finance manager, HR / talent manager, developer, viewer, FODO Pro, client). `authorize()` decides every `/api/os` request on the server, object by object (assigned task, managed report, same department, own project), deny by default. The old marketplace checks keep working untouched; the viewer role no longer reaches finance (audit finding S7).

**People model** (`os_*` tables): FODO organization, 13 departments, members with roles, manager, title, hours, skills, cost rate (finance only). Current staff were backfilled from `acct_admins` / `biz_staff` (owner → Owner, admin → Admin, moderator → Operations Manager, finance → Finance Manager, viewer → Viewer); a staff e-mail added to the old tables later is provisioned on first sight.

**People & Access** (Workspace → People & Access, `js/ws-people.js`): people list and record (open work, temporary access, sessions, history), add a person (roles, department, manager, invitation mail), edit, suspend / reactivate (sessions end), temporary access with expiry and reason, log out everywhere, offboarding with handoff (open tasks, projects, approvals and reports move to a chosen person; nothing deleted), departments (archive, manager), roles with the Access Builder (every resource · action · scope in one table; custom roles from templates), audit log viewer (OS + marketplace + Brain merged, filters), activity feed, System (owner: FODO OS on / off, module switches, health probes).

**View-as:** an owner can view the Workspace as any person for 30 minutes, read-only, with a banner; every write is refused on both APIs; start and stop audited with the reason.

**Audit and events:** `os_audit` with before / after / reason / source (secrets scrubbed); every audited marketplace write (`project:create`, `contract:sign`, `payout:paid`, ...) now also lands in `os_events`, the activity timeline of Phase 2.

**Navigation:** staff see the same entries in collapsible groups (Command · Operations · Growth · People · Platform); employees only see modules their permissions reach; owners see everything; clients and Pros keep the v47 navigation exactly. Group state is remembered per browser.

**Notifications:** `notify()` gains category and urgency (urgent / action / info) and a dedupe key (same key within an hour is stored once).

**Safety:** `biz_settings.os_enabled = 0` switches FODO OS off without a deploy (503 on `/api/os`, v47 navigation). Owner module switches hide a module from non-owner navigation. Health probes report configured / not configured / ok / failing, never a number without a source.

## 2. Decisions taken (owner said "start", recommendations applied)
Design unchanged, light theme reviewed on the new screens (no token change needed); sidebar kept with groups; roles to be confirmed by the owner in People & Access; departments seeded (managers to be named by the owner).

## 3. Database
Additive only: 16 Phase 1 tables (+ the Phase 2 tables created empty), nullable columns on `biz_notes`, `biz_tasks`, `biz_projects`, `biz_messages`, `biz_files`, `biz_pros`, `biz_invoices`, `biz_equipment`, `biz_campaigns`, `acct_sessions`. Details: `docs/FODO-OS-V4-DATA-MODEL.md`.

## 4. Tests
- New `tests/v501.test.mjs`: **119 checks** (registry, seeds and backfill, permission matrix for every template, negative matrix, object-level relations, cleanFor, People API incl. escalation guards, grants, suspension, offboarding, view-as, audit, events, automations isolation, notification dedupe, navigation, modules, kill switch, router hygiene, CSRF, health, prefs, OWNER_CAN_ACCESS_ALL_SYSTEM_MODULES).
- `scripts/check.mjs` rule 5: every `/api/os` route declares a permission; no permission string outside `functions/_lib/os/`.
- Full suite and visual checks: see the delivery note (results are recorded there, not guessed here).

## 5. Rollback
Revert the commit. Tables and columns are additive and ignored by older code; the legacy role tables were never changed. Or keep the code and switch FODO OS off in People & Access → System.

## 6. What Phase 1 does not do (on purpose)
No task engine, approvals, My FODO, Command Centre, client record, support SLA yet (Phase 2). Onboarding checklist tasks arrive with the task engine. The Brain is not yet on the permission layer (Phase 6). The 62 legacy `can()` checks stay until each route is migrated with its suite.
