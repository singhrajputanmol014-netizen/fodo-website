# FODO OS V4: implementation plan (Phase 0 audit, part 5)

Built on `FODO-OS-V4-EXISTING-ARCHITECTURE.md`, `-FEATURE-INVENTORY.md`, `-TECHNICAL-DEBT.md`, `-SECURITY-AUDIT.md`. The permission model, data model and draft modules of the earlier design (`FODO-OS-ARCHITECTURE.md`, 9 draft files in `FODO-OS-Architecture-Pack.zip`) are reused as Phase 1.

**Status: proposal. Nothing is built. Waiting for the owner's approval (section 10).**

---

## 1. Honest scope statement

The V4 prompt describes an enterprise suite (ERP + CRM + PSA + HRMS + marketplace + finance + BI + automation + AI governance). Measured against the inventory, about 35 % already exists and is tested, 25 % is additive extension of existing modules, and 40 % is new modules. In FODO's delivery rhythm (one release per phase, each tested and zipped) this is **eight phases over roughly 12 to 16 release cycles**. Each release is useful on its own. Nothing is marked done that is not real; a partial module is labelled partial in its report and in the UI.

Three V4 requirements cannot be satisfied by code alone and are flagged, not promised: ad-platform attribution (needs Meta / Google Ads API access and approved apps), DPDP compliance (needs legal review), and simulation / forecasting (only honest once a few months of real finance records exist).

## 2. Decisions the owner must make before Phase 1

| # | Decision | Options | Recommendation |
|---|---|---|---|
| 1 | **Design.** V4 section 4 asks for a premium light theme, page transitions, skeletons and a six-division navigation. The owner rejected the v48 redesign and asked to keep the current design. | (a) keep the current design system exactly; new screens use it; no theme work · (b) allow a **light-theme polish only** (colours and contrast in `workspace.css`, no layout change), shown as screenshots first · (c) full V4 design pass | **(b)**, screenshot-approved per screen; (c) only if the owner explicitly asks again |
| 2 | **Navigation.** V4 section 38 lists six divisions. | (a) keep the sidebar, add collapsible groups (Command, Operations, People, Finance, Growth, Platform) · (b) new shell | **(a)**; employees see only their groups; clients and Pros unchanged |
| 3 | **Who is staff.** The backfill guesses roles from `acct_admins` / `biz_staff`. | owner confirms each person's role in People & Access after Phase 1 | required |
| 4 | **Departments and managers** (13 seeded names) | edit list, name a manager per department (approval escalation uses them) | required |
| 5 | **Cost rates and weekly hours** per employee (profitability and workload need them; finance-only visibility) | enter or skip | enter at least hours |
| 6 | **R2 bucket** `fodo-files` | create + uncomment `FILES` | required before Phase 5 (assets) |
| 7 | **Ad platforms.** Meta Marketing API / Google Ads API apps | apply or defer | defer; campaign workflow stops at Ready with "Not connected" |
| 8 | **Legal review** for contracts / DPDP texts | engage | required before claiming compliance (Phase 7) |
| 9 | **Phase order.** Finance (Phase 4) before People (Phase 3)? | see section 4 | keep the order below; swap only if finance urgency is higher |

## 3. Target architecture in one picture

```
Browser: /workspace/ (one SPA, lazy ws-*.js modules) · /fodo-pros/ · /owner-brain/ · /website-builder/ · /admin/
   │  /api/biz/* (existing)        /api/os/* (new, every handler → authorize())
API: session → CSRF → rate limit → view-as → principal() → authorize({resource, action, target}) → module → ok()
OS core (_lib/os/): permissions.js · db.js · authz.js · audit.js (audit + events + automations) · policy.js
OS modules: people · tasks · approvals · work (my, queues, calendar, workload) · clients (Customer 360) · projects (lifecycle, scope,
            progress, health, daily reports) · support (SLA) · hr · pros2 (passport, matching) · finance2 (expenses, budgets,
            receivables, forecast, profitability, leakage) · assets (rights) · knowledge · documents · vendors · inbox · workflows ·
            problems (detection) · decisions (simulation, journal) · risks · search · integrations · command (centre, tower, reports) · agents
Existing libs unchanged in behaviour; they emit events at write points and expose read models.
Storage: D1 (os_* tables + nullable columns) · KV · R2 · Queue · Workers AI.   Jobs: biz_jobs (+ new kinds).   Events: os_events.
```

Universal record fields (V4 section 5.2) are met by convention, not by one table: every `os_*` business table has `id, org_id, status, created_by, owner_user_id, created_at, updated_at`; relations through typed `(kind, id)` references; activity through `os_events`; attachments through `biz_files.context_*`; comments through `os_comments (context_kind, context_id)`.

Canonical client record: new `os_clients` (company, industry, location, account manager, health, renewal) with `client_id` added (nullable) to `biz_projects`, `crm_contacts`, `crm_deals`, `biz_quotes`, `biz_contracts`, `biz_invoices`, `help_tickets`, `xray_reports`, `lab` runs, `sites`. Existing `client_id` columns that today hold a *user* id stay; `os_clients.primary_user_id` links the two.

## 4. Phases, versions, deliverables

| Phase | Version | Builds | New tables | Reuses | Report |
|---|---|---|---|---|---|
| 0 | docs only | these five documents + dependency map | none | | this file |
| 1 Unified foundation | v50.1 | permissions registry, `os_orgs/departments/roles/members/member_roles/member_perms`, `authorize()`, `os_audit`, `os_events` + `emit()`, `os_comments`, view-as, session revoke, People & Access UI, role-aware navigation groups, theme polish (if decision 1b), notification `category / urgency / dedupe_key`, `/api/os` router with kill switch, FTS probe | 12 | 9 draft files | V50.1 |
| 2 Command Centre + operations | v50.2 | `os_clients` (Customer 360) + canonicalisation backfill, sales pipeline stages (new, contacted, qualified, discovery, proposal, negotiation, won, lost, nurture) on `crm_deals`, requirements → brief, client health (formula documented), task engine 2.0 (`os_task_deps`, `os_task_comments`), approvals + escalation, My FODO, department queues, calendar views, project lifecycle (13 states, validated, reasoned), scope object + change-request gate, progress + health engines (formulas), daily PM reports, closure checklist, support SLA / escalation / CSAT + Workspace ticket list, client portal approvals, Command Centre v1 (exception feed from real signals, action centre), Control Tower v1 (project delivery, client, workforce, pipeline health with formulas; finance health marked "insufficient data" until Phase 4), global search v1 | 14 | Mission Control, projects2, help, crm | V50.2 |
| 3 People + Pros | v50.3 | employee profile + onboarding / offboarding + handoff, leave requests, attendance (optional, off by default), performance reviews, training records, skills matrix, resource calendar + heatmap + capacity, team assembly with employees, Pro lifecycle + passport (on-time, repeat, verified projects; appeal flow), two-stage matching (hard constraints then ranked, explained), booking engine extensions (hours, time zone, notice, buffer, reschedule, cancel), Pro workroom (tasks, deliverables) | 10 | proapps, teams, availability, production | V50.3 |
| 4 Finance | v50.4 | `os_expenses`, budgets, payables (vendor + payout liabilities), receivables (invoice `due_date`, viewed, partial, overdue), cash position (ledger + bank balances entered), forecast with three scenarios and stated assumptions, project costing + profitability (estimate vs confirmed), revenue leakage rules with evidence, service / client / department analytics, invoice PDF archive, webhook replay guard | 8 | finance, payouts, ledger | V50.4 |
| 5 Growth + production | v50.5 | content versions + review history, campaign workflow (honest states, adapters only when configured), marketing workspace, asset rights (releases, licenses, expiry) on files, deliverable versions + immutable approvals + QA checklists, client reporting (period, definitions, freshness, drill-down, PDF / CSV), Growth Lab + X-Ray + sites linked to clients / projects | 7 | content, campaigns, files, lab, xray, sites | V50.5 |
| 6 Automation + AI | v50.6 | Workflow Studio (`os_workflows`, `os_workflow_runs`: trigger → conditions → actions → approval, history, retry, pause, limits), Brain on the permission layer (tools declare permissions), `os_agents` registry (limits, cost, tokens, prompt versions, kill switch), FODO Assistant (role-scoped), problem detection engine (`os_problems` with evidence, owner, resolution), decision journal, simulation v1 (hiring / discount / price change with assumptions; labelled estimate; refuses without enough finance data), business memory graph = typed relations over source records (no duplicate memory) | 8 | brain/*, jobs | V50.6 |
| 7 Advanced platform | v50.7 | vendors + procurement (requests, approvals, POs, vendor invoices, ratings), integration registry (status, last sync, token expiry, revoke), subscriptions tracker, knowledge base / SOPs (versions, owners, review dates, AI citations), document centre (templates, approvals, expiry alerts, access logs; e-sign adapter only when configured), unified inbox v1 (Gmail read through the existing Brain connector, WhatsApp when configured, conversation → task), risk register + incident log + continuity procedure, DPDP workflows (consent records, retention, rights requests, grievance) pending legal review | 12 | brain connectors, help mail, contracts | V50.7 |
| 8 Hardening + release | v50.8 | full regression, security matrix, performance test with seeded 10k projects / 50k tasks, browser matrix, enforced CSP on the public site, backup / restore rehearsal (D1 export + R2 list), release checklist, monitoring dashboard, final docs | 0 | | V50.8 + test report |

Each phase: implement → migrate (additive) → new `tests/v50x.test.mjs` → security tests → full suite → desktop + 390 px screenshots (navigation changes shown before packaging) → report → zip + commit. Kill switch `os_enabled` and per-module switches from Phase 1.

## 5. Dependency graph (phases and modules)

```
P1 permissions/people/audit/events ──┬──> P2 clients ──> P2 projects lifecycle ──> P2 command centre v1
                                      ├──> P2 tasks/approvals ──> P2 my fodo/queues ──> P3 workload/capacity
                                      ├──> P3 employees/HR ──> P3 team assembly ──> P4 employee cost in profitability
                                      ├──> P3 pros passport/matching/booking ──> P4 payables
                                      ├──> P4 expenses/receivables/cash/forecast ──> P6 simulation, P7 subscriptions
                                      ├──> P5 content/campaign/assets/reporting (needs P2 clients, P4 for client reports with money)
                                      ├──> P6 workflows (needs events P1, approvals P2), agents (needs authorize P1), problems (needs P2 to P4 signals)
                                      └──> P7 vendors/knowledge/documents/inbox/compliance (needs P1, P2 clients; inbox needs Brain connectors)
P8 hardening needs everything.
```

Critical path: P1 → P2 clients → P2 projects → P4 finance → P6 problems / simulation. Everything else can slide without blocking the Command Centre.

## 6. Development backlog, Phase 1 (detailed)

| ID | Module | Description | Depends on | Priority | Files | DB | API | Acceptance | Tests |
|---|---|---|---|---|---|---|---|---|---|
| P1-01 | permissions | registry `resource.action.scope`, scopes, 17 templates, `validPerm` | | P0 | `+_lib/os/permissions.js` | | `GET /api/os/registry` | registry served; invalid strings rejected | unit: every template perm valid |
| P1-02 | db | `osdb()`: `os_orgs, os_departments, os_roles, os_role_perms, os_members, os_member_roles, os_member_perms, os_teams, os_team_members, os_audit, os_events, os_comments, os_user_prefs, os_flags, os_modules, os_impersonations`; seeds; legacy staff backfill | P1-01 | P0 | `+_lib/os/db.js` | 16 tables + indexes | | seed idempotent; backfill maps roles; owners present | integration: run twice, same rows |
| P1-03 | authz | `principal()`, `allows()`, `authorize()`, `relationOf()`, `cleanFor()`, legacy fallback | P1-02 | P0 | `+_lib/os/authz.js`, `+policy.js` | | | matrix passes; no member row → legacy roles still work | security: role × resource matrix, negative cases |
| P1-04 | audit + events | `audit()` structured, merged viewer, `emit()` + `on()`; existing libs emit `project.*`, `task.*`, `payment.*`, `payout.*`, `booking.*`, `file.*`, `contract.*` at their write points | P1-02 | P0 | `+_lib/os/audit.js`, `~biz.js, projects2.js, finance.js, payouts.js, teams.js, files.js` (one `emit` line each) | | `GET audit`, `GET activity` | timeline shows real events per record | integration: each write emits once |
| P1-05 | people | members, invite (onboarding tasks later), update, roles, suspend (+ session revoke), temporary grants with expiry job, sessions list / revoke, departments, roles + Access Builder, directory | P1-03 | P0 | `+_lib/os/people.js`, `~accounts.js` (`last_seen`) | `acct_sessions.last_seen` | `people/*`, `departments/*`, `roles/*` | owner invites a designer who sees only assigned work | integration + security (grant escalation refused) |
| P1-06 | view-as | owner read-only impersonation, banner, expiry, audit; `/api/biz` and `/api/os` honour it for GET, refuse writes | P1-03 | P1 | `+_lib/os/impersonate.js`, `~api/biz/[[path]].js` (3 lines) | | `view-as`, `view-as/stop` | write during view-as → 403; audit rows | security |
| P1-07 | router | `functions/api/os/[[path]].js` with the standard chain; kill switch `biz_settings.os_enabled`; static check that every handler calls `authorize` | P1-03 | P0 | `+api/os/[[path]].js`, `~scripts/check.mjs` | | all `os/*` | off switch → 503 and hidden nav | integration |
| P1-08 | notifications | `biz_notes.category / urgency / dedupe_key`; `notify()` 6th arg; dedupe within 1 h | | P1 | `~biz.js`, `~alerts.js` | 3 columns | | duplicate notify within window stored once | unit |
| P1-09 | navigation | `navFor(P)`: groups Command / Operations / People / Finance / Growth / Platform, collapsible; employees see permitted groups; clients and Pros unchanged; `_redirects` aliases | P1-03 | P1 | `~biz.js`, `~js/workspace.js`, `~_redirects` | | `me` carries `os` block | screenshots approved at 1440 + 390 | e2e: client nav identical to v47.6.2 |
| P1-10 | People & Access UI | list, member drawer, departments, roles, Access Builder tree, grants, sessions, audit viewer, view-as banner | P1-05 | P1 | `+js/ws-people.js`, `~workspace.js` (lazy + routes) | | | all actions work end to end | e2e |
| P1-11 | theme polish (decision 1b) | light-theme colour / contrast pass on `workspace.css` tokens only | | P2 | `~css/workspace.css` | | | screenshots approved | visual |
| P1-12 | FTS probe | detect FTS5 in D1 at set-up; record in `os_flags.system.fts` | P1-02 | P2 | `~db.js` | | | flag set correctly | unit |
| P1-13 | owner tests | OWNER_CAN_ACCESS_ALL_SYSTEM_MODULES and OWNER_CAN_VIEW_ALL_* | P1-07 | P0 | `+tests/v501.test.mjs` | | | every registry resource and nav id allowed for owner | security |
| P1-14 | docs | `FODO-OS-V4-PERMISSIONS.md`, `-DATA-MODEL.md` (v1), `-API-REFERENCE.md` (v1), `-SECURITY.md` (v1), `V50.1-REPORT.md`, `CLAUDE.md` update | all | P0 | docs | | | docs match code | review |

Phase 2 to 7 backlogs are written at the start of each phase in the same format (the inventory already names the modules and sizes); writing them all now would be planning fiction.

## 7. Database and integration changes (summary)

- **Additive only.** 16 tables in Phase 1, about 60 `os_*` tables by Phase 7, plus nullable columns on `biz_tasks`, `biz_projects`, `biz_messages`, `biz_files`, `biz_notes`, `biz_pros`, `biz_invoices`, `biz_equipment`, `biz_campaigns`, `biz_content`, `crm_contacts`, `crm_deals`, `help_tickets`, `acct_sessions`. No rename, no drop, no primary-key change.
- **Indexes** on every new `org_id, client_id, user_id, assignee, department_id, status, due, created_at`. Keyset pagination for every new list.
- **High-risk backfills** (rehearsed on a schema copy, owner go-ahead each): staff → `os_members` (P1), client canonicalisation (P2), invoice status derivation (P4).
- **Integrations:** nothing new is required for Phases 1 to 4. Phase 5 to 7 add adapters only when the owner provides credentials (ad platforms, e-sign, accounting, Outlook); each shows Not connected until then. R2 bucket needed from Phase 5.
- **Jobs:** new kinds `approval_escalate`, `grant_expiry`, `deadline_reminder`, `health_probe`, `sla_check`, `workflow_run`, `problem_scan`, `report_digest`; all through `biz_jobs`.

## 8. Testing strategy

Per phase: new suite on the existing D1-shim harness; permission matrix extended; negative cases from the security audit; the full suite stays green (4,514 at v47.6, 2,111 e2e at v47.6.2); flaky runtime e2e rerun alone and reported as such; results reported as passed / failed / skipped / blocked, never "passed" for skipped. Journeys 1 to 7 of V4 section 39.3 become e2e suites in the phase that completes each journey (1 and 2 in P2, 3 and 4 in P3, 5 in P4, 6 and 7 in P6). Phase 8 adds seeded-scale performance tests and a browser matrix.

## 9. Rollback

One commit per phase; GitHub Desktop revert. Tables additive; legacy role tables stay populated through Phase 2, so any revert restores today's permissions exactly. `os_enabled` and module switches turn parts off without a deploy. Backfills are idempotent and re-runnable.

## 10. Approval requested

Reply with the decisions of section 2 (at least 1, 2, 3, 4) and "Phase 1 start karo". Phase 1 is backend-heavy: the only visible changes are the People & Access tab, the grouped navigation for staff (shown as screenshots before packaging) and, if chosen, the light-theme polish. Clients and Pros see no change.
