# FODO OS: complete architecture (build guide)

**Status:** design approved for later. Nothing of FODO OS is live. The live site is v47.6.1.
**Read with:** `docs/FODO-OS-AUDIT.md` (what exists today) and `docs/FODO-OS-IMPLEMENTATION-PLAN.md` (phases and files).
**Starter code:** `fodo-os-starter/functions/_lib/os/` (9 files, about 690 lines, syntax-checked, **not wired, not tested, not deployed**). Copy it into `functions/_lib/os/` when the build starts, then follow section 16.

This document is the single description of how FODO OS is built. A new Claude session can build it from this file alone.

---

## 0. One-paragraph summary

FODO OS is a **layer under the existing FODO platform**, not a new app. It adds four things the platform lacks: (1) one **permission system** (resource.action.scope) that every API checks on the server, (2) one **people model** (FODO organization, departments, members, roles, temporary access), (3) one **work model** (tasks with dependencies, approvals, queues, calendar, workload) shared by every department, and (4) an **owner control plane** (Command Center, audit, health, view-as, modules, flags) plus a role-scoped AI assistant. Everything else (marketplace, finance, Builder, Growth Lab, X-Ray, Brain, Pros) already exists and is **connected, not rebuilt**.

---

## 1. Principles (non-negotiable)

1. **Preserve what works.** Additive tables and columns only. No renames, no drops, no rewrites of the Builder, Growth Lab, X-Ray, Brain or payments.
2. **Server is the authority.** The browser only hides buttons. Every protected call resolves identity → member → roles → permissions → scope → relationship → allow / deny.
3. **Deny by default.** No permission, no access. Unknown resource or action = 403.
4. **Owner is unrestricted but audited.** The owner always gets scope `all`; every sensitive write still lands in the audit log with before / after / reason.
5. **Admin is not Owner.** Admin has broad operations; system settings, override, impersonation, Brain and payout approval stay owner-only by default.
6. **Role is not permission.** Roles are bundles of permission strings stored as data. A new business role needs no code change.
7. **No feature theatre.** States like Connected, Live, Published appear only after the provider confirms. Otherwise: Not connected, Setup required, Ready, Pending, Failed.
8. **No new design language.** Every new screen uses the existing `ws-*` components in `css/workspace.css`. Any navigation change is shown as a screenshot and approved by the owner before it ships (the v48 redesign was rejected).
9. **Small, testable releases.** Each phase is a version with its own test suite, report and rollback.

---

## 2. Layer diagram

```
                 ┌──────────────────────────────────────────────────────────────┐
   Browser       │ /workspace/ (one SPA, hash routes)  /fodo-pros/  /owner-brain/ │
                 │  existing views  +  OS views (lazy): ws-os.js ws-people.js     │
                 │                                       ws-command.js            │
                 └───────────────────────────────┬──────────────────────────────┘
                                                 │ fetch /api/biz/*  /api/os/*
                 ┌───────────────────────────────▼──────────────────────────────┐
   API router    │ session → CSRF (same origin + JSON) → rate limit → view-as     │
   (Pages Fn)    │ → principal(env,u) → authorize({resource,action,target})       │
                 └───────────────────────────────┬──────────────────────────────┘
                 ┌───────────────────────────────▼──────────────────────────────┐
   OS core       │ permissions.js (registry)  authz.js (principal, allows,       │
   _lib/os/      │ authorize, relationOf, cleanFor)  audit.js (audit, emit,      │
                 │ automations)  db.js (osdb, seeds, backfill)                   │
                 ├──────────────────────────────────────────────────────────────┤
   OS modules    │ people.js  impersonate.js  tasks.js  approvals.js  work.js    │
                 │ projects.js  finance-os.js  content.js  campaigns.js           │
                 │ command.js  health.js  flags.js  assistant.js                  │
                 ├──────────────────────────────────────────────────────────────┤
   Existing libs │ biz.js projects2.js production.js quotes.js teams.js           │
   (unchanged    │ availability.js finance.js payouts.js proapps.js mission.js    │
    behaviour)   │ files.js jobs.js calendar.js orgs.js crm.js sites.js xray...   │
                 └───────────────────────────────┬──────────────────────────────┘
                 ┌───────────────────────────────▼──────────────────────────────┐
   Storage       │ D1 XRAY_DB (biz_*, acct_*, ... + new os_*)  KV CHAT_KV         │
                 │ R2 FILES (optional)  Queue JOBS (optional)  Workers AI         │
                 └──────────────────────────────────────────────────────────────┘
   Background:  hourly GitHub workflow → /api/monitor/jobs  (biz_jobs: escalation, grant expiry, reminders, health)
```

---

## 3. Identity and people model

### 3.1 Who is who

| Kind | Source | Default workspace | Sees |
|---|---|---|---|
| Owner | `OWNER_EMAILS` or `owner` role | Command Center | everything |
| Employee | `os_members` kind employee | from role (`home`) | only modules their permissions allow |
| Contractor | `os_members` kind contractor | My FODO | assigned work only |
| FODO Pro | `biz_pros` row | `/fodo-pros/` (unchanged) | assigned projects, own calendar, earnings |
| Client | everyone signed in | `/workspace/#overview` (unchanged) | own projects, quotes, contracts, invoices, sites |

Rule: a FODO employee is never turned into a client and a client never becomes staff by accident. The OS organization (`os_orgs`, id `fodo`) is **separate** from the client organizations of v47.6 (`biz_orgs`).

### 3.2 Hierarchy

```
User (acct_users) → Member (os_members, org "fodo") → Department (os_departments)
                 → Roles (os_member_roles → os_roles → os_role_perms)
                 → Temporary grants (os_member_perms, expiry + reason)
                 → Manager (os_members.manager_user_id)  → Teams (os_teams / os_team_members)
```

### 3.3 Departments (seeded, editable, archive not delete)
Management, Operations, Production, Creative, Design, Post Production, Marketing, Sales, Finance, HR, Technology, AI, Customer Success. Each has an optional manager (used by approval escalation).

### 3.4 Role templates (seeded once as data)
owner, admin, operations_manager, project_manager, production_manager, creative_director, designer, video_editor, performance_marketer, social_media_manager, sales_executive, finance_manager, hr_talent_manager, developer, viewer, fodo_pro, client. Each template: name, department, home view, permission list. Defined in `permissions.js` `TEMPLATES`.

### 3.5 Compatibility with today's staff
On first run, the seed **backfills**: owners → `owner` role; `acct_admins` role admin → `admin`; other `acct_admins` → `viewer`; `biz_staff` moderator → `operations_manager`, finance → `finance_manager`, viewer → `viewer`. Old tables stay untouched. Until a person has an `os_members` row, `principal()` derives their permissions from the legacy roles, so **every existing `can(R, [...])` check keeps working**.

---

## 4. Permission system

### 4.1 Format
`resource.action.scope`, for example `task.update.assigned`. Scopes, narrow to wide:

```
own < assigned < team < department < organization < all
```

| Scope | Means |
|---|---|
| own | I created it or it is mine |
| assigned | I am the assignee, a project member, or an accepted Pro on it |
| team | someone I manage, or a team I am in / manage |
| department | same `department_id` as me |
| organization | anything in the FODO organization |
| all | everything, including client-owned records (owner by default) |

### 4.2 Registry (single source of truth: `functions/_lib/os/permissions.js`)
Resources and actions: project (view, create, update, assign, delete, archive) · task (view, create, update, assign, delete) · file (read, upload, manage) · approval (request, decide) · message (read, write) · client (view, manage) · crm (view, manage) · quote (view, manage) · contract (view, manage) · finance (view, manage) · expense (view, submit, approve) · payout (view, approve) · pro (view, manage) · people (view, manage) · calendar (view) · campaign (view, manage, publish) · content (view, manage, approve) · site (view, edit, publish) · growthlab (view, run) · xray (view, run) · analytics (view, export) · equipment (view, manage) · production (view, manage) · workload (view) · audit (view) · system (settings, override, impersonate, health, modules, flags) · brain (use) · assistant (use).

Each action lists which scopes are allowed (e.g. `payout.approve` only `all`). `validPerm()` rejects anything outside the registry. The UI reads it from `GET /api/os/registry`. A static check (`scripts/check.mjs`) will fail the build if a permission string appears outside `os/`.

### 4.3 Authorization flow (`authz.js`)

```
principal(env, u)
  ├─ member = os_members (link by email on first login, invited → active)
  ├─ roles  = os_member_roles → os_roles (status active)
  ├─ perms  = os_role_perms ∪ unexpired os_member_perms
  ├─ legacy = rolesOf(u)  (fallback perms from templates when no member row)
  ├─ + fodo_pro template if biz_pros row, + client template always
  └─ owner → isOwner = true, scope "all"

allows(P, res, act)          → widest scope held, or null
authorize(env, P, {resource, action, target})
  ├─ suspended → 403
  ├─ no scope  → 403
  ├─ scope all or no target → allow
  └─ relationOf(P, target) ∩ scopes ≤ held scope → allow, else 403
cleanFor(P, row)             → strips cost, margin, commission, salary, payout, internal notes for people without the right
```

`relationOf` knows these target kinds: project, task, member / user, approval, expense, deliverable, department, client. New kinds are added there, nowhere else.

### 4.4 Policy helpers
Thin wrappers for readability: `canViewProject`, `canEditProject`, `canAssignTask`, `canViewFinance`, `canManagePro`, `canPublishSite`, `canApprovePayment`, `canManageUsers`. They only call `authorize`.

### 4.5 Escalation guards
- Nobody can grant a permission they do not hold (role editing and temporary grants both check this).
- Only owners give the Owner role, `system.*` or `brain.*` permissions.
- The Owner role can never lose permissions. Owners cannot be suspended or offboarded.
- Nobody approves their own request. Money approvals (payment, payout, refund) need `finance.manage.organization`.
- `system.override` (owner only) is the explicit "override the workflow" switch; every use writes `OWNER_OVERRIDE` with a reason.

---

## 5. Data model (all additive)

### 5.1 New tables (prefix `os_`)

| Table | Key columns | Purpose |
|---|---|---|
| os_orgs | id, name, slug, status, settings | FODO internal organization (one row `fodo`) |
| os_departments | id, org_id, name, slug, manager_user_id, status | configurable departments |
| os_roles | id, org_id, name, slug, department_id, template, home, dashboard, status | role templates + custom roles |
| os_role_perms | role_id, perm | permissions of a role |
| os_members | id, org_id, user_id, email, name, department_id, manager_user_id, title, kind, status (invited/active/suspended/offboarded), employment_type, started_at, weekly_hours, cost_rate, skills, last_active_at | employees and contractors |
| os_member_roles | member_id, role_id | roles of a member |
| os_member_perms | id, member_id, perm, expires_at, reason, granted_by, revoked_at | temporary / extra access |
| os_teams, os_team_members | team, department, manager, optional project; user or Pro members | reusable or project teams |
| os_audit | actor, action, target_kind/id, before, after, reason, source, session_hash, ip_hash, created_at | structured audit |
| os_events | kind, subject, actor, payload, created_at | event bus / activity feed |
| os_user_prefs | user_id, k, v | dashboard layout, filters, timezone |
| os_flags | key, scope_kind (system/org/department/role/user), scope_id, on_ | feature flags |
| os_modules | key, enabled | owner module switches |
| os_task_deps, os_task_comments | task dependencies, comments | task engine |
| os_approvals | kind, object, requester, approver, status, deadline, decision, escalation, department | approval engine |
| os_project_briefs | goal, deliverables, dates, location, mode, budget, roles, equipment, hours, priority | project brief |
| os_deliverables | project, title, status, owner, file, revision, due | deliverables |
| os_expenses | project, department, user, category, amount, receipt file, status, approval | expenses |
| os_campaign_flow | campaign, strategy/creative/tracking ready, state | honest campaign workflow |
| os_impersonations | owner, target, reason, started, expires, ended | view-as log |
| os_links | kind (xray, growthlab, site), ref, project_id, client_id | connect platform records to projects |
| os_health_log, os_ai_calls | probe results, assistant audit | operations |

Full DDL with indexes is in `fodo-os-starter/functions/_lib/os/db.js`.

### 5.2 New nullable columns on existing tables (through `migrateOnce`)
- `biz_tasks`: assignee_user_id, department_id, priority, description, start_date, estimated_min, actual_min, approval_required, checklist, parent_id, completed_at, org_id, kind. OS tasks use `who='staff'`; the old client ↔ Pro tasks (`who` client / pro) and their API in `projects2.js` are untouched.
- `biz_projects`: org_id, type, department_id, owner_user_id, priority, due, archived_at (internal projects have no client).
- `biz_messages`, `biz_files`: context_kind, context_id (messages and files attached to task / client / team / department).
- `biz_notes`: category, urgency.
- `biz_pros`: lifecycle (applicant, approved, available, assigned, booked, active, completed, suspended), kept in sync by existing transitions.
- `biz_invoices`: due_date, viewed_at, paid_amount (statuses viewed, partially paid, overdue derived).
- `biz_equipment`: condition, location, maintenance_due.
- `biz_campaigns`: workflow. `acct_sessions`: last_seen.

Indexes on every new high-volume column (org_id, user_id, assignee, department, status, due, created_at). New lists use explicit columns and keyset pagination (`?before=<timestamp>&limit=`), never offset scans.

---

## 6. Work model

### 6.1 Tasks (one engine for every department)
Statuses: `backlog → todo → doing (In progress) → review → approved → done`, plus `blocked` and `cancelled`.
- Fields: title, description, project (optional), department, assignee, creator, priority (low/normal/high/urgent), start, due, estimate, actual, checklist, parent (subtasks), approval_required, comments.
- **Dependencies:** adding an open predecessor blocks the task; moving to doing / review / done with open predecessors is refused (409); finishing a predecessor unblocks dependents automatically and notifies them. Loop detection on insert.
- **Approval:** a task with approval_required goes to review and opens an approval for the assignee's manager; the decision moves it to approved or back to doing.
- Lists filter by the person's task.view scope (own / assigned / team / department / organization).

### 6.2 Approvals (one object for all new kinds)
Kinds: creative, client, budget, payment, payout, campaign, site_publish, contract, refund, production, task, expense, content. Statuses: pending, approved, rejected, expired, cancelled.
- Reject needs a reason. Self-approval refused. Decision updates the linked object (task, expense, deliverable, campaign, content).
- **Escalation** (hourly job): overdue → approver's manager → department manager → Operations manager → owner. One notification per step, at most one step per day, expired after 14 days at the top.
- Existing marketplace decisions (quote accept, contract sign, milestone approve, application decide, Brain confirm) **stay where they are**.

### 6.3 Queues (read models, no new tables)
Production (team dates, open crew slots, equipment holds) · Design (briefs, in production, reviews, approved) · Post Production (footage, edit tasks, deliverables in review) · Marketing (campaigns, creative requests, content to publish) · Sales (quote requests, expiring quotes, open deals) · Finance (payments pending, open invoices, refunds, settlements, payouts, expenses). Each queue also lists open tasks of its department. A queue is visible only with its permission.

### 6.4 Calendar
One feed of: task due dates, approval deadlines, milestones, shoot / booking days, project deadlines, team dates, quote expiry, Pro bookings. Day / week / month / timeline are views of the same payload. Visibility by calendar.view scope. The existing private iCal feeds (`calendar.js`) stay and can later include tasks.

### 6.5 Workload
Per member: open tasks, allocated minutes (estimates of open tasks due within 7 days, 60 min when no estimate), available minutes (weekly hours), percentage, state underutilised / healthy / overloaded (thresholds owner-tunable in `biz_settings.workload`). Managers see their team, department heads their department. Cost rates are never shown here.

### 6.6 Projects as the container
A project page shows every context in tabs: Overview · Brief · Team · Schedule · Tasks · Files · Communication · Deliverables · Approvals · Equipment · Budget · Quote · Contract · Payments · Analytics · Activity. Existing tabs keep their names and order; new tabs are appended. Project types (advertising, shoot, content, social, website, branding, campaign, business setup, custom) create default tasks through an automation (shoot tasks are chained as dependencies: approval → payment → crew → equipment → call sheet → shoot → footage → edit → internal review → client review → delivery).

### 6.7 Team assembly
The existing Build a Team engine (`production.js match()`) gets employees as candidates next to Pros (skills from `os_members.skills`), with the same "Recommended because" reasons (skill, city, available, budget, similar projects, rating). Add / remove / replace / compare / assign stay in the existing team UI.

---

## 7. Events and automations

- `emit(env, P, kind, subject, payload)` writes `os_events` and runs registered automations (`on(kind, fn)`), each in its own try / catch so one failure never blocks the action. Slow work is queued in `biz_jobs`.
- Event names: project.created / updated / status_changed · task.created / updated / completed / blocked / unblocked · approval.created / approved / rejected · payment.succeeded / failed · payout.created / completed / failed · booking.created / cancelled · file.uploaded / approved · member.invited / offboarded · deliverable.submitted.
- First automations: project.created → default tasks · deliverable.submitted → review task + approval · file.uploaded (footage) → notify editor · shoot approved → production checklist · deadline in 2 days → notify assignee and manager · payment received → milestone funded (already done by the payment code, the event only records it).
- New job kinds in `jobs.js`: `approval_escalate`, `grant_expiry`, `deadline_reminder`, `health_probe` (queued daily / hourly by the existing tick).

---

## 8. Owner control plane

| Piece | What it does | Source |
|---|---|---|
| Command Center | exception list only: critical, needs attention, blocked, at risk, pending approval, financial risk, security risk, system error, deadline risk; then sections Business, Operations, Marketplace, Sales, Marketing, Finance, Technology, AI | Mission Control (`mission.js`) + tasks + approvals + finance + jobs + monitoring. Real counts only |
| All Systems map | one page listing every module with its state and a link | module registry |
| Global search + Ctrl+K | extends the existing staff search with people, tasks, approvals, deliverables, expenses; commands shown only if permitted | `mission.js adminSearch` + OS search |
| Activity feed | live list of os_events, filters person / project / department / type / time | `os_events` |
| Audit viewer | os_audit + biz_audit + brain_audit merged, filters, keyset pagination | `audit.js auditList` |
| People & Access | members, departments, roles, Access Builder tree (resource → action → scope), temporary access, sessions, onboarding, offboarding with handoff | `people.js` |
| View as | owner-only, read-only, 30 minutes, banner, audited, writes refused, no session swap | `impersonate.js` |
| System health | API, jobs (queued / failed / dead), D1, KV, R2, payment provider configured, mail, WhatsApp, OAuth tokens, builder publishing, AI providers, CSP reports, client errors; each probe says configured / not configured / failing | new `health.js` |
| Modules + flags | owner switches a module off (navigation hides it for non-owners); flags by system / org / department / role / user | `os_modules`, `os_flags` |
| Exports | existing 13 audited CSVs + JSON; PDF only where it makes sense | `mission.js` |
| Kill switch | `biz_settings.os_enabled` off → OS navigation hidden, `/api/os/*` answers 503, data kept | router |

---

## 9. AI layer

```
                  FODO OS (authorize)
                     │
        ┌────────────┴────────────┐
   FODO Assistant             Owner Brain (existing)
   every employee             owners + brain_members
   level 0 + level 1 tools    level 0 / 1 / 2 tools
   only if authorize passes   level 2 needs owner confirmation
   no memory of others        never moves money, never signs
```

- Every OS-aware Brain tool declares the permission it needs (`resource.action`) and calls `authorize` for the acting person before running. AI requests never bypass authorization.
- The Assistant reuses the same tool registry, filtered to tools the employee's permissions allow ("show my pending design tasks", "which projects are at risk", "show unpaid invoices" only for finance). Each call is logged in `os_ai_calls`.
- High-risk actions (payout, refund, delete, role / permission escalation, financial changes, deployment) stay level 2: explicit owner confirmation.

---

## 10. API design

- New namespace **`/api/os/*`** in a new catch-all `functions/api/os/[[path]].js` (keeps the 303-line biz router untouched). Same pattern as biz: session → CSRF → rate limit → view-as → `principal` → module call → `{ ok: true, ... }` or `{ ok: false, reason }`.
- Endpoints:
  - `GET registry` · `GET me` (kind, home, roles, `can` map, view-as banner)
  - People: `GET people` · `GET people/<id>` · `POST people` (invite) · `POST people/<id>` (edit, roles) · `POST people/<id>/status` · `POST people/<id>/grant` · `POST people/<id>/grant/<gid>/revoke` · `POST people/<id>/sessions/revoke` · `GET people/<id>/handoff` · `POST people/<id>/offboard` · `GET directory`
  - `GET/POST departments[/<id>]` · `GET/POST roles[/<id>]`
  - Work: `GET my` · `GET tasks` · `GET tasks/board` · `POST tasks` · `GET/POST tasks/<id>` · `POST tasks/<id>/status|deps|deps/remove|comment|cancel` · `GET/POST approvals[/<id>]` · `POST approvals/<id>/decide|cancel` · `GET queues` · `GET queue/<name>` · `GET calendar?from&to` · `GET workload`
  - Projects: `POST projects` (internal) · `GET/POST projects/<id>/brief|deliverables|team|activity`
  - Finance: `GET/POST expenses` · `GET profitability/<projectId>` (finance only)
  - Owner: `GET command` · `GET systems` · `GET activity` · `GET audit` · `GET health` · `GET/POST modules` · `GET/POST flags` · `POST view-as` · `POST view-as/stop` · `GET search?q`
  - `POST assistant` (chat)
- Existing `/api/biz/*`, `/api/admin/*`, `/api/sites/*`, `/api/owner-brain/*` keep their paths and payloads. They move to `authorize()` route by route; the old check is removed only after its suite passes on the new one.
- Responses never include fields the caller may not see (`cleanFor`). Writes that create approvals or money records accept an `Idempotency-Key` header.
- During view-as, `/api/os/*` and `/api/biz/*` answer GETs as the target user and refuse every non-GET with 403 "View-as is read-only".

---

## 11. Front-end design

- **Same shell, same CSS.** `/workspace/` stays the single SPA. New lazy modules (loaded only when opened, so clients and Pros download nothing extra):
  - `js/ws-os.js`: My FODO, Tasks (list + board + drawer), Approvals, Work queues, Calendar, Workload, Assistant panel.
  - `js/ws-people.js`: People & Access (list, member drawer, departments, roles, Access Builder, temporary access, onboarding, offboarding handoff), Audit viewer, view-as banner.
  - `js/ws-command.js`: Command Center (widget engine), All Systems, Activity, System Health, Modules, Flags.
- **Navigation is role-aware and built on the server** (`navFor(P)` from permissions + module switches). Clients and Pros keep exactly today's navigation.
  - Owner: Command Center, My FODO, Work, Projects, Clients / CRM, Pros, Production, Creative, Marketing, Website Builder, Growth Lab, Business X-Ray, Finance, Files, People, Analytics, Automations, Owner Brain, Admin, Settings.
  - Employee example (Designer): My FODO, My Tasks, Projects, Creative queue, Files, Calendar, Notifications, Settings.
- **Landing:** employees land on their role's home (`my-fodo`, `work`, `people`, `command`); clients on Overview; Pros on the Pro dashboard.
- **My FODO layout:** Today (due today, overdue, blocked, in review, approvals waiting, events) · My Work (projects, upcoming tasks, waiting on others, recent files, conversations) · Quick actions · Notifications split Urgent / Action required / Info.
- **Routes:** hash views `#my-fodo #tasks #approvals #work #calendar #workload #people #access #audit #command #systems #activity #health`; `_redirects` aliases `/fodo` → `/workspace/#my-fodo`, `/fodo/work`, `/fodo/projects`, `/fodo/people`, `/fodo/owner` → `#command`, `/fodo/finance`, `/fodo/admin` → `#admin`. No second app.
- Breadcrumbs through the existing `head()` helper (FODO / Projects / ABC Campaign / Creative). Context switcher only for people in more than one department or team.
- Tables, boards, drawers and timelines where they fit; cards only for figures. Empty states with a role-aware action. Errors say what failed, why and what to do (never a stack trace). 390 px phone check for every new screen.

---

## 12. Security checklist (applies to every OS endpoint)

- Session cookie only, CSRF (same origin + JSON) on every non-GET, KV rate limits.
- Never trust client-provided role, organization id, scope, or query parameters for authorization; the principal is always rebuilt on the server.
- Object-level checks on every read and write (`authorize` with a target). Lists filtered in SQL by scope.
- Sensitive fields removed at the data layer (`cleanFor`): cost_rate, margins, commission, payout data, bank details, salaries, internal notes.
- Suspended or offboarded members: sessions deleted, grants revoked, `authorize` refuses.
- Audit every sensitive action: OWNER_CHANGED_ROLE, OWNER_CHANGED_PERMISSION, OWNER_INVITED_MEMBER, OWNER_SUSPENDED_MEMBER, OWNER_OFFBOARDED_MEMBER, OWNER_REVOKED_SESSIONS, OWNER_IMPERSONATED_USER, OWNER_STOPPED_IMPERSONATION, OWNER_CHANGED_SYSTEM_SETTING, OWNER_OVERRIDE, OWNER_EXPORTED_DATA, OWNER_CHANGED_BRAIN_PERMISSION, TASK_*, APPROVAL_*. Secrets, tokens and bank fields are scrubbed from audit payloads.
- Financial actions keep the existing rules: provider confirmation, idempotency, append-only ledger, webhook verification. The Brain and the Assistant never move money.
- Files keep private signed access (no predictable URLs); context files inherit the parent's permission.

---

## 13. Testing strategy

- New suites on the existing `node:sqlite` D1 shim harness (copy the head of `tests/v476.test.mjs`), registered in `tests/run.mjs`.
- **Permission matrix:** every role template × every resource × each action → expected allow / 403.
- **Must-fail cases:** employee → finance (403); Pro → internal notes (field absent); client → margin (field absent); employee edits own role (403); manager → other department's task (403); member → another organization's object (404); self-approval (403); granting a permission you lack (403); view-as write (403); suspended member (403).
- **Owner tests:** OWNER_CAN_ACCESS_ALL_SYSTEM_MODULES (iterates the registry and every nav id), OWNER_CAN_VIEW_ALL_PROJECTS / PEOPLE / PROS / FINANCE / FILES / ANALYTICS, OWNER_CAN_MANAGE_PERMISSIONS / SYSTEM, OWNER_CAN_ACCESS_OWNER_BRAIN.
- Behaviour tests: seed idempotence and legacy backfill, invite → active on first login, temporary grant expiry, offboarding handoff counts, dependency block / unblock / loop refusal, approval escalation chain, queue scoping, calendar visibility, workload maths, honest health states.
- Regression: the whole existing suite (4,514 checks at v47.6) must stay green; flaky e2e suites rerun alone.

---

## 14. Performance rules

- Lazy modules only; no growth of `workspace.js` beyond routing lines.
- Every list has `LIMIT` and keyset pagination; explicit columns; indexes listed in section 5.
- `principal()` is computed once per request (a few indexed queries); cache the role → permissions map per isolate if profiling shows it matters.
- Do not touch the Website Builder performance code (double-buffered canvas, scroll preservation, slider debounce, autosave protection, retry / backoff, safe canvas messages).

---

## 15. What is essential (build these first, in this order)

These are the "zaruri" pieces. Without them nothing else in FODO OS is safe to build.

| # | Essential piece | Why it comes first | Starter file |
|---|---|---|---|
| 1 | Permission registry + role templates | the single vocabulary every check uses | `permissions.js` ✓ drafted |
| 2 | `os_*` tables, seeds, legacy backfill | people and roles must exist as data; current staff keep access | `db.js` ✓ drafted |
| 3 | `principal()` + `authorize()` + `relationOf()` + `cleanFor()` | the server-side gate; deny by default | `authz.js` ✓ drafted |
| 4 | Audit log + event bus | owner actions must be traceable from day one | `audit.js` ✓ drafted |
| 5 | People & Access (invite, roles, departments, temporary access, suspend, sessions, offboarding) | the owner needs to add employees before they can work | `people.js` ✓ drafted |
| 6 | `/api/os/*` router + `os_enabled` kill switch | one entry point, one rollback lever | to write |
| 7 | Permission matrix tests + owner access tests | proves no one can bypass permissions | to write |
| 8 | Task engine + approvals | the shared work primitives every department uses | `tasks.js`, `approvals.js` ✓ drafted |
| 9 | My FODO + queues + calendar + workload | what employees actually open every day | `work.js` ✓ drafted (backend) |
| 10 | Role-aware navigation + People & Access UI + My FODO UI | makes the above usable | to write (screenshots first) |

Everything after that (Project OS tabs, expenses and profitability, content and campaign workflows, platform links, Command Center widgets, health, flags, Assistant) builds on these ten and can ship phase by phase.

**Also essential, outside code (owner decisions before the build):**
1. Confirm the departments list and who manages each.
2. Confirm which role each current staff member gets (the backfill guesses from today's roles).
3. Decide working hours per person (workload) and whether cost rates are entered (profitability).
4. Confirm the approval chain (who is the Operations manager; owner as final step).
5. Approve the navigation screenshot for employees before it ships.

---

## 16. How to start the build (for the next session)

1. Confirm the repo is v47.6.1 or later and the full suite passes.
2. Copy `fodo-os-starter/functions/_lib/os/` into `functions/_lib/os/`. Read every file; they are drafts and must be reviewed, not trusted.
3. Known gaps in the drafts to fix first:
   - `tasks.js` uses `rid("")` to build ids; replace with `"tk" + randId(12)` from accounts.js.
   - `work.js` queue SQL references some marketplace tables (`biz_settlements`, `biz_refunds`, `biz_equipment_holds`); call `qdb` / `fdb` / payouts `pdb` set-ups first (same trap as mission.js) or wrap each in `.catch(() => [])`.
   - `relationOf()` for clients and messages needs tests against real marketplace rows.
   - `principal()` runs `linkMember` on every request; keep it, but make sure `quiet` is passed for GET-heavy paths.
4. Write `functions/api/os/[[path]].js` (section 10) and the kill switch.
5. Write `tests/v49.test.mjs`: permission matrix, owner tests, must-fail cases, behaviour tests (section 13). Make it pass.
6. Run the full suite, then build the three lazy UI modules, screenshot desktop + 390 px, show the owner, wait for "haan".
7. Write `docs/FODO-OS-PERMISSIONS.md`, `FODO-OS-ROLES.md`, `FODO-OS-DATA-MODEL.md`, `FODO-OS-API.md`, `FODO-OS-SECURITY.md`, `FODO-OS-MIGRATION.md`, `FODO-OS-OPERATIONS.md`, `FODO-OS-OWNER-GUIDE.md`, `FODO-OS-EMPLOYEE-GUIDE.md` from this file, update `CLAUDE.md`, `VERSION`, deliver the zip.

---

## 17. Rollback

- Every phase is one commit; GitHub Desktop → Revert → Push.
- Tables and columns are additive; older code ignores them. Legacy role tables stay populated, so reverting restores today's permissions exactly.
- `os_enabled` off hides FODO OS without a deploy. Modules and flags switch off one part at a time.
