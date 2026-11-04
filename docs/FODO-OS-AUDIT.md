# FODO OS: audit of the existing codebase (before any FODO OS change)

Version audited: **FODO v47.6.1** (2 November 2026). Written against the real files, not from memory. Every number below was taken from the repository on the day of the audit.

Purpose: the FODO OS master prompt asks for "one operating system, many role-based workspaces, one Owner control plane". This audit records what already exists, what is missing, where the prompt conflicts with the live system, and how to migrate without breaking anything. The implementation plan is in `docs/FODO-OS-IMPLEMENTATION-PLAN.md`.

---

## 1. Current architecture

- **Hosting:** Cloudflare Pages (static site, repo root is the build output) + Pages Functions in `functions/`. One D1 database `XRAY_DB` (145 tables), KV `CHAT_KV`, Workers AI, optional R2 `FILES` / `MEDIA`, optional Queue `JOBS`.
- **Second project** `fodo-sites` (client websites), optional `fodo-runner` Worker.
- **API layout:** one catch-all per area: `functions/api/account/`, `admin/`, `biz/` (303 lines, the marketplace + workspace), `help/`, `lab/`, `owner-brain/`, `sites/`, `xray/`, plus `monitor/tick.js` and `monitor/jobs.js` for cron. Single-file endpoints for chat, leads, stats, exports.
- **Server libraries:** 43 files in `functions/_lib/` (+ `brain/`). Business logic is in the libraries; the catch-alls route and check roles.
- **Front end:** generated HTML shells (`scripts/build_pages.py`) + plain JS SPAs: `js/workspace.js` (710 lines, Workspace / Pros / Admin, hash routing, lazy `ws-*.js` modules), `js/admin.js`, `js/owner-brain*.js`, `js/website-builder.js` + `wb-*.js`.
- **Background work:** D1 job queue `biz_jobs` (v47.6) run by the hourly GitHub workflow and the daily tick; optional Cloudflare Queue hand-off.
- **Verdict:** the platform is already one backend, one database and one identity system. What is missing is one **permission system** (today: role lists per area) and one **employee model** (today: staff are e-mail rows).

## 2. Current authentication

- `functions/_lib/accounts.js`: Google sign-in, e-mail code, Firebase providers. Sessions in `acct_sessions (token_hash, user_id, created_at, expires_at, ip_hash)`, cookie-based. `sessionUser(env, request)` resolves the user.
- Test login `/api/account/test-login` only in `XRAY_TEST_MODE`.
- CSRF: every non-GET needs same origin + JSON content type (raw uploads need `x-fodo-upload: 1`). Rate limits through `count()` in KV.
- Owner identity: `OWNER_EMAILS = ["anmol@fodo.co.in", "singhrajputanmol014@gmail.com"]`, `isOwner(u)`.
- **Gaps against the prompt:** no session list / revoke-all per user (offboarding step 2), no impersonation, no "last active" per member, no per-user preferences table (theme is `localStorage`).

## 3. Current user model

- `acct_users` (id, email, name, plan, credits ...). `acct_clients` (website clients of the builder). `acct_team (owner_id, email)`: a Growth Lab plan owner can add seat e-mails. `acct_admins (email, role)`: FODO staff for the admin dashboard (`admin` or other).
- **Marketplace roles** (`functions/_lib/biz.js` `rolesOf`): everyone is `client`; `owner` (OWNER_EMAILS) also gets `admin, moderator, finance`; `acct_admins.role = admin` gets `admin, moderator, finance`; other `acct_admins` rows get `viewer`; `biz_staff (email, role)` adds `moderator | finance | viewer` (only owners set it); a `biz_pros` row adds `pro`.
- **Website Builder** has its own membership: `site_members (site_id, email, role)`.
- **Owner Brain** has its own membership: `brain_members (email, role, perms JSON)`.
- **Organizations (v47.6)** `biz_orgs` / `biz_org_members (owner | admin | member)` are **client-side** organizations (a client company sharing quotes, contracts and invoices with colleagues). They are not FODO's internal organization.
- **Gaps:** no departments, no employee record (title, manager, employment type, start date), no custom roles, no permission + scope model, no temporary access. Four separate membership tables (`acct_admins`, `biz_staff`, `site_members`, `brain_members`) answer "who may do what" in four different ways.

## 4. Current admin system

- `/admin/` (`js/admin.js`, `functions/api/admin/[[path]].js`): FODO team dashboard: accounts, orders, X-Ray runs, help desk, analytics, config (`lab_config`), bot metrics. Guarded by `acct_admins` / owner.
- `/workspace/#admin` "Marketplace admin" (`ws-market-admin.js`, `ws-mission.js`, ...): tabs mission, analytics, quotes, teams, finance, catalog, applications, pros, invites, payouts, disputes, settings.
- **Mission Control (v47.5)** already is an exception-driven attention list (overdue invitations, failed payouts, open disputes, expiring quotes, unreviewed applications ...), with staff **Ctrl+K search** across clients, pros, projects, quotes, contracts, invoices and a jump list (`ADMIN_JUMP`), plus 13 audited CSV exports (`mission.js EXPORTS`).
- **Admin ≠ Owner already holds:** pricing rules, badge rules, commission, staff roles, act-on-behalf are owner-only (`isOwner(u)` appears 31 times across functions).
- **Gaps:** two admin surfaces (`/admin/` and Workspace admin) with different role sources; no "People & Access" screen; no system-health page (there is `mon_*` monitoring and `csp_reports`, but no single view); no audit-log viewer.

## 5. Current Owner Brain

- `/owner-brain/`, `functions/api/owner-brain/`, `functions/_lib/brain/*`. 106 registered tools in `brain/tools.js`: **74 level 0 (read), 23 level 1 (draft / low-risk write), 9 level 2 (owner confirmation)**. Memory, Google / social connectors, voice, Website Engineer (opens PRs), `brain_audit`, `brain_actions` (pending actions), `brain_automations`.
- Access: owners, plus `brain_members` with explicit `perms`.
- Brain marketplace tools (v47.4 / v47.5) read applications, Mission Control, search and hiring data, and can decide an application at level 2.
- **This already matches the prompt's read / write / high-risk split.** Gap: the Brain reads marketplace data through module functions, not through a permission layer, so a future "FODO Assistant" for employees cannot reuse the tools safely without one.

## 6. Current Workspace

- `/workspace/` (clients and staff) and `/fodo-pros/` (same code, `data-mode="pro"`). Navigation comes from the server (`navFor(R)` in biz.js, 19 entries). Views: overview, builder, X-Ray, Growth Lab, content & ads, AI Studio, Build a Team, Hire FODO Pros, projects, quotes, CRM, Brand Kit, files, My Pro profile, apply, billing, notifications, settings, admin.
- Lazy modules: `ws-builder`, `ws-market-admin`, `ws-teams`, `ws-finance`, `ws-proapps`, `ws-mission`, `ws-sync`.
- Design: `css/workspace.css` on site tokens, classes `ws-*`, `pb-*`, `tm-*`, `fn-*`, `pa-*`, `mc-*`, `sy-*`. **The v48 redesign was rejected by the owner; the current design must stay.**
- **Gaps:** no employee dashboard ("My FODO"); every signed-in person sees the client navigation; staff see the admin tab in addition. No role-based default workspace, no breadcrumbs, no context switcher.

## 7. Current projects

- `biz_projects` + `biz_milestones` + `biz_project_pros` + `biz_bookings` (v40), Projects 2.0 (`projects2.js`: `biz_tasks`, `biz_changes` change requests, `biz_time`, retainers, refunds state machine), Build a Team drafts `biz_builds`, teams `biz_teams` / `biz_team_members` / `biz_team_events`, equipment holds, contracts, payment plan from contract, settlements.
- **Project tabs today:** overview, milestones, team, tasks, messages (`biz_messages`), files (`biz_files` per project), change requests, time, contract, invoices. So the "project as container" idea exists for the marketplace flow.
- **Tasks today** (`biz_tasks`): `id, project_id, title, who (client|pro), due, status (todo|done), created_by`. Up to 200 per project. **No** assignee user, department, priority, dependencies, checklist, estimates, comments, or approval flag. Only inside a project.
- **Gaps:** no internal (non-client) projects, no project types, no brief / deliverables objects, no department queues, no capacity view.

## 8. Current FODO Pros

- `biz_pros` (profile 2.0 fields, badges, recommended), packages, portfolio, case studies, applications pipeline (`proapps.js`, state machine with checks), availability rules + `bookDays` (unique index prevents double booking), equipment, team invitations, earnings, payouts (encrypted methods), reviews, disputes, calendar feed.
- Pros are never public; `/fodo-pros/` is invite-gated.
- **Gap:** Pro status is spread over `biz_pros.status`, application state and bookings; the prompt's lifecycle (Applicant → Approved → Available → Assigned → Booked → Active → Completed → Suspended) is derivable but not stored as one field.

## 9. Current payments and finance

- Already separated objects: payments (`acct_orders`), milestones (held funds), refunds (`biz_refunds`, states `refund_requested → refund_processing → refunded | refund_failed`), settlements (`biz_settlements` + lines), payouts (`biz_payouts`, Cashfree Payouts / RazorpayX adapters, Easy Split `via_split`), append-only ledger (`biz_ledger`, DB triggers), invoices `FI-` + credit notes `CN-`, reconciliation, quotes `FQ-` (versioned, immutable once sent), contracts `CT-` (versions, amendments, typed-name signing, cancellation calculator).
- Provider confirmation before state changes, idempotent guarded updates (`UPDATE ... WHERE status=?`), webhook secrets.
- **Sections 35 to 40 of the prompt are largely done.** Gaps: no `expenses` object, no project profitability view, invoice statuses are `draft | issued | paid | cancelled` (no viewed / partially paid / overdue).

## 10. Current files

- `files.js`: private files on R2 `FILES` (KV fallback to 10 MB), type sniffed from bytes, versions, multipart up to 1 GB, signed by session (no public URLs). Files belong to a user and optionally a project (`biz_files.project_id`); media for sites in `site_media`; Brain media in `brain_media`.
- **Gaps:** no file ↔ task / client / contract / deliverable links, no comments / approval on files, no inherited permissions beyond "owner or project party".

## 11. Current Website Builder

- Separate SPA (`js/website-builder.js` + `wb-*.js`, `functions/api/sites/`, `_lib/sites.js`, `shop.js`), per-site membership `site_members`, tenant rule documented in `docs/tenant-security.md`, performance fixes (double-buffered canvas, scroll preservation, slider debounce, autosave protection, retry/backoff, safe canvas messages, error reporting `site_client_errors`).
- Owner and admins can list all sites through `/admin/`.
- **Must not be touched** except to add permission mapping (`site.view / edit / publish`) on top of `site_members`.

## 12. Current Growth Lab

- Public tools + signed-in Pro tools, plans and credits (`lab_*`, `usage.js`), monitoring (`mon_*`), GSC connector, AI visibility. Accessed from Workspace (`growth`, `xray` views) and public pages.
- **Gap:** nothing ties a Growth Lab run to a client record or project.

## 13. Current Business X-Ray

- `xray_*` tables (reports, scores, findings, evidence, competitors, opportunities), background runner, `xray_bg`. Owner / admins see all runs through `/admin/`; a client sees their own.
- **Gap:** same as Growth Lab: no link to CRM / project / campaign.

## 14. Current database schema (families)

145 `CREATE TABLE IF NOT EXISTS` statements: `acct_*` (12), `biz_*` (62: marketplace + workspace), `brain_*` (22), `site_*` / `sites` (16), `xray_*` (13), `lab_*` (6), `help_*` (5), `crm_*` (3: contacts, deals, acts), `mon_*` (2), `web_*` (3), `privacy_log`, `csp_reports`, `api_usage`, `fodo_leads`, `schema_migrations`.

Migrations: `migrateOnce(d, MIG)` per module (hash of each statement in `schema_migrations`), additive only. Every module's set-up (`bdb`, `pdb`, `qdb`, `fdb`, `jdb`, `odb` ...) must be called before touching its tables.

Indexes: present on the hot marketplace tables (bookings unique index, ledger, jobs, quotes). No cursor pagination anywhere: lists use `LIMIT` (50 to 300) with offsets or "latest N".

## 15. Existing APIs (what the OS layer must keep working)

- `/api/biz/*`: me, nav, overview, brand, content, campaigns, studio, pros, market, projects (+ milestones, tasks, messages, files, changes, time), quotes, builder (Build a Team), catalog, teams, availability, equipment, contracts, settlements, payouts, ledger, invoices, reconciliation, apply, case-studies, badges, admin/* (overview, mission, search, hiring, export, applications, jobs, staff, settings), files (+ multipart), calendar, org/*, notifications, privacy.
- `/api/admin/*`, `/api/account/*`, `/api/owner-brain/*`, `/api/sites/*`, `/api/lab/*`, `/api/xray/*`, `/api/help/*`, `/api/monitor/tick | jobs`.
- 62 inline `can(R, [...])` checks in `biz/[[path]].js` and the libraries, 31 `isOwner(u)` checks. This is the "scattered permission checks" the prompt wants centralised. They are correct today and must stay as the fallback during migration.

## 16. Existing Workers / background

- Pages Functions only (no separate Worker in the main project). `runner/` optional Worker for X-Rays. GitHub workflows: monitor (daily), brain (hourly, also runs jobs), browsers, engineer, runner, tests.
- Job queue `biz_jobs` with retries, backoff, dead letter, admin retry / run now. Handlers: mail, notify, upload_sweep, team_housekeeping, refund_check, payout_check, webhook.
- **Gap:** no event bus. Modules call each other directly (`notify()`, `enqueue()`), which is fine, but there is no `events` table or `emit()` that automations could subscribe to.

## 17. Existing permissions (summary table)

| Area | Source of truth | Check style | Owner bypass |
|---|---|---|---|
| Marketplace / Workspace | `rolesOf()` (OWNER_EMAILS, acct_admins, biz_staff, biz_pros) | `can(R, [roles])` inline, `isOwner(u)` | yes (owner gets every role) |
| Admin dashboard | `acct_admins` | per route | yes |
| Website Builder | `site_members` + owner | `sites.js` tenant rule | yes (admin list) |
| Owner Brain | OWNER_EMAILS + `brain_members.perms` | `brain/access.js` | yes |
| Organizations (clients) | `biz_org_members` | `orgs.js` `mayAct`, `peersOf` | n/a (client feature) |
| Growth Lab seats | `acct_team` | plan owner check | yes |

Scopes exist implicitly (own record, project party, org peer, staff) but are not named. There is **no permission registry** and no way to grant one permission without a code change.

## 18. Existing tests

- 74 suite files in `tests/`, runner `tests/run.mjs` (groups unit, integration, store, builder, brain, xray, security, e2e). Last full run (v47.6): **4,514 checks, 0 failures**. CI workflow `fodo-tests.yml`. Static checks `scripts/check.mjs`.
- Security suites already cover IDOR on projects, quotes, contracts, files, org isolation, tenant isolation for sites, Brain tool levels, CSRF, rate limits.
- **Gap:** no test that enumerates every module for the owner (`OWNER_CAN_ACCESS_ALL_SYSTEM_MODULES`), no negative matrix for employee / manager / department roles (they do not exist yet).

## 19. Conflicts between the master prompt and the live system

1. **Route structure.** The prompt recommends `/fodo/*` pages. The live Workspace is a single hash-routed SPA at `/workspace/#view`, Pros at `/fodo-pros/`, Brain at `/owner-brain/`, Builder at `/website-builder/`, team dashboard at `/admin/`. Rebuilding as `/fodo/*` would mean a second shell and a second router. **Decision:** keep the existing shells; add OS views inside `/workspace/` (hash routes `#my-fodo`, `#work`, `#people`, `#approvals`, `#calendar`, `#command`). Add `/fodo/*` only as redirect aliases (`_redirects`) to the matching hash routes, so the prompt's URLs work without a new app.
2. **Visual design.** Section 94 asks for a "premium modern OS" feel. The owner rejected the v48 redesign and asked for the existing design. **Decision:** every new screen uses the existing `ws-*` design system (same cards, rows, tabs, pills). No new visual language. Any change to navigation layout is shown as a screenshot first and shipped only after "haan".
3. **`organizations` table name.** The prompt's `organizations / organization_members` would collide in meaning with the existing client-side `biz_orgs / biz_org_members` (v47.6, live). **Decision:** FODO's internal organization lives in new `os_orgs / os_members` tables (prefix `os_`). The client organizations stay as they are. `organization_id` on business objects is added only where the OS writes them.
4. **Admin role duplication.** `acct_admins` and `biz_staff` both describe staff. **Decision:** `os_members` becomes the single source; a compatibility shim derives the old role list from it, and the old tables keep working (read as fallback) until every staff member has an `os_members` row.
5. **Task engine.** `biz_tasks` (client ↔ pro tasks inside a marketplace project) is live and tested. The prompt's task engine needs assignee, department, priority, dependencies, checklists, estimates. **Decision:** extend `biz_tasks` additively (new nullable columns + `os_task_deps`, `os_task_checks`) and allow `project_id` to be NULL for standalone department work. The old project task API keeps its shape.
6. **Approval engine.** Approvals exist as states on quotes (accept), contracts (sign), milestones (approve), applications (approve), case studies (moderate), Brain actions (confirm). **Decision:** do not move those; add a generic `os_approvals` object for the new kinds (creative, budget, campaign, website publish, production) and link existing ones by reference where useful.
7. **Scale of the prompt.** 117 sections cover six to nine months of product work. **Decision:** ten phases, each a shippable `v49.x` release with its own tests and report, exactly like the V47 programme. Nothing is marked "done" that is not real (rule 11, no feature theatre).
8. **"Admin impersonation".** The prompt wants secure impersonation. The live session model is one cookie per user. **Decision:** implement as an *owner-only read-as* mode (server returns data as the target user would see it, writes refused), with banner, audit, 30-minute expiry. No session swap, so nothing can escalate.
9. **Communication system.** `biz_messages` exists per project (client ↔ FODO ↔ pro). The prompt wants contextual threads for task / client / team / department / direct. **Decision:** add a nullable `context_kind / context_id` to messages instead of a new chat system.
10. **Cursor pagination / no `SELECT *`.** Many list functions use `SELECT *` with `LIMIT`. Rewriting all of them is out of scope and risky. **Decision:** new OS queries use explicit columns + keyset pagination; existing ones are changed only when a phase touches them.

## 20. Migration plan (summary; details in the implementation plan)

```
v47.6.1 (live)
  ↓ Phase 1  v49.1  os_* tables, permission registry, authorize(), compatibility shim, audit viewer      (backend + one admin tab)
  ↓ Phase 2  v49.2  My FODO view, task engine 2.0, notifications filters, approvals object, calendar view, workload
  ↓ Phase 3  v49.3  Project OS: internal projects, project types, brief / deliverables, context threads, project activity
  ↓ Phase 4  v49.4  People & Talent: employee onboarding / offboarding, Pro lifecycle field, team assembly from OS roles
  ↓ Phase 5  v49.5  Finance: expenses, invoice statuses, profitability (private), finance queue, permissions mapped
  ↓ Phase 6  v49.6  Creative / Production: content workflow, production checklist automation, equipment in projects
  ↓ Phase 7  v49.7  Marketing: CRM pipeline stages, campaign workflow states (honest), marketing queue
  ↓ Phase 8  v49.8  Platform: builder / Growth Lab / X-Ray mapped to permissions and linked to clients / projects
  ↓ Phase 9  v49.9  Owner Command Center (exception-driven, widgets), All Systems map, system health, activity feed
  ↓ Phase 10 v49.10 Owner Brain on the OS policy layer + role-scoped FODO Assistant
```

Each phase: implement → migrate (additive) → new `tests/v49x.test.mjs` → security tests → full suite → visual check (screenshots shown before any navigation change) → `docs/FODO-V49.x-REPORT.md` → zip + commit.

Rollback for every phase: revert the commit (tables are additive and ignored by older code); `OS_ENABLED` setting (owner, `biz_settings`) switches the OS navigation off while the data stays.
