# FODO v50.2 report: OS Phase 2 (Operations core)

Phase 2 of the FODO OS V4 plan (`docs/FODO-OS-V4-IMPLEMENTATION-PLAN.md`). Everything runs on the Phase 1 permission layer; nothing in the marketplace, billing or public site changed. Design unchanged: the new views reuse the existing `ws-*` system.

## What is new

| Area | Library | Routes (`/api/os/`) | View |
| --- | --- | --- | --- |
| My FODO | `os/work.js` `my()` | `my` | `#my-fodo`: today (overdue, due, blocked, review, approvals, next 7 days), my work, notifications grouped by urgency, quick actions |
| Task engine | `os/tasks.js` | `tasks`, `tasks/board`, `tasks/:id`, `/status`, `/deps`, `/deps/remove`, `/comment`, `/cancel` | `#tasks` list + board, task page (checklist, dependencies, subtasks, comments, status, manager approval) |
| Approvals | `os/approvals.js` | `approvals`, `approvals/:id`, `/decide`, `/cancel` | `#approvals` boxes (for me / mine / all), decision with note, escalation shown |
| Work queues | `os/work.js` `queue()` | `queues`, `queue/:name` | `#work`: per-department sections from real tables + open tasks |
| Calendar / workload | `os/work.js` | `calendar`, `workload` | `#calendar` (tasks, milestones, shoots, deadlines, teams, quote expiry, bookings), `#workload` (allocated vs available, thresholds owner-tunable via `biz_settings.workload`) |
| Projects | `os/projects.js` | `projects`, `projects/:id`, `/brief`, `/scope`, `/deliverable`, `/risk`, `/report` | `#os-projects` list (progress + explained health), `#os-project` control centre: overview, brief & scope (+ change requests), tasks, deliverables (draft → submitted → review → client review → approved → delivered, immutable review log), files, risks, daily reports, activity, finance (finance.view), closure gate |
| Clients | `os/clients.js` | `clients`, `clients/:id`, `clients/pipeline`, `clients/handover` | `#clients` list, Customer 360 (projects, quotes, contracts, invoices, tickets, contacts, activity, health with weighted factors), pipeline by stage, sales-to-delivery handover gate |
| Support | `os/support.js` | `support`, `support/:id`, `/reply`, `/status`, `/rate`, `support/queue` | `#support`: my tickets, thread (internal notes hidden from clients), team queue with SLA (urgent 4 h, high 8 h, normal 24 h, low 72 h), CSAT after solved |
| Command Centre / Control Tower | `os/command.js` | `command`, `tower`, `search` | `#command` exception feed + sections; `#tower` indicators with formulas and previous snapshot; Ctrl+K merges OS search |
| Jobs | `jobs.js` | `os_hourly` (escalations, SLA check, grant expiry, deadline reminders), `os_daily` (tower snapshot) | enqueued by `/api/monitor/jobs` |

## Honest states
- Finance cards show ledger data only; "Phase 4 adds payables, cash position and forecast" is written on the card.
- Health and progress scores print their formula and their deductions. "Insufficient data" when there is none.
- Support mail is sent only when mail is configured; the reply is always visible in the Workspace.

## Fix found by the visual check (important)
`os/db.js setups()` used a *variable* dynamic import. The Pages bundler cannot resolve that, so on the real runtime none of the module set-ups ran and OS routes failed with "no such table" (the Node test shim resolved them fine). Now literal `import("../x.js")` calls. Rule added to CLAUDE.md: dynamic imports must be string literals.

## Tests
- `tests/v502.test.mjs`: 123 checks (clients, health, pipeline, handover, lifecycle, brief, scope, deliverables, risks, reports, tasks, dependencies, approvals + escalation, My FODO, queues, calendar, workload, support SLA/CSAT, command, tower, search, jobs, router hygiene, owner-can-view-all, UI wiring).
- `tests/v501.test.mjs`: 119 (unchanged).
- Visual: 31 screenshots, desktop + 390 px, zero console errors.

## Phase 1 backlog carried
- Managers to be named by the owner in People & Access; roles confirmed by owner.
