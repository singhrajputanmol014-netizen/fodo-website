# FODO v50.6 report: OS Phase 6 (Automation + AI)

Phase 6 of `docs/FODO-OS-V4-IMPLEMENTATION-PLAN.md`. Libraries `os/workflows.js`, `os/problems.js`, `os/decide.js`, `os/ai.js`; Brain OS tools in `brain/tools.js`. Views `#automation`, `#problems`, `#decisions`, `#assistant`, `#ai-agents`. Design unchanged (ws-* system).

## What is new
| Area | Routes (`/api/os/`) | What it does | Safety |
| --- | --- | --- | --- |
| Workflow Studio | `workflows`, `/install`, `/<id>`, `/status`, `/test` | Trigger (27 OS events or hourly / daily / weekly schedule) → conditions (`payload.x gt 25000` style) → optional approval → actions: create task, notify, request approval, comment on task, raise problem. Templates with `{{payload.amount}}`, `{{actor.name}}`. 5 starter templates. Every run logged with per-action results. | Internal actions only (no money, mail, messages, webhooks). Runs with the permissions of the person who activated it; pauses itself if that person loses workflow rights. Editing an active workflow bumps the version and pauses it. Hourly rate limit. Test runs change nothing. A workflow never triggers another workflow (no loops). |
| Problem detection | `problems`, `/scan`, `/<id>` | 13 rules on real rows: overdue task clusters, projects past deadline, overdue approvals, SLA breaches, overloaded people, budgets over, invoices 30+ days late, expired rights on scheduled content, campaigns over budget, dead jobs, stale bank balances, leave waiting, decision reviews due. One problem per subject with evidence, owner, fix and link; owners of new high / critical problems are notified; acknowledge, assign, resolve (note), ignore (note). Cleared automatically when the cause goes away. Runs daily and on demand. | No AI decides anything. |
| Decision journal | `decisions`, `/<id>`, `/review` | Title, context, options with pros / cons, decision, rationale, expected outcome, review date, visibility (private / leadership / team). Recorded decisions cannot be rewritten (reverse + record a new one). Review: as expected / better / worse / mixed / too early (re-schedules). Daily reminder when a review is due. | |
| Simulation v1 | `simulate`, `simulate/baseline` | What if we hire (capacity, break-even extra revenue, department load before / after), give a discount (gross profit change, volume uplift needed), change prices (volume you can lose before revenue / profit falls). Baseline from FODO's last 3 months or your own numbers. Formulas and assumptions returned. | Labelled "simulation, not a forecast". Finance access needed. Saves nothing. |
| AI agent registry | `ai/agents`, `ai/agents/<id>`, `ai/kill` | FODO Assistant, Owner Brain, X-Ray writer, Growth Lab helper: purpose, model, tools, risk, monthly limit, status, real usage (Assistant) or where usage is tracked. Owners pause an agent, set a limit, or switch all AI off (reason required, audited). | Owner only. |
| FODO Assistant | `assistant` | Plain English / Hinglish questions: overdue, today, approvals, leave balance, project status, invoices (finance), problems, campaigns. Answers come from the same OS functions the screens use, so it only sees what the person may see. Works without AI; with Workers AI bound, the agent active, the kill switch off and under the limit, it may rephrase the same facts (no new numbers). Every question logged. | Finance numbers refused to non-finance people. |
| Brain on the permission layer | Brain tools `os_command_centre`, `os_problems`, `os_my_work`, `os_finance_overview`, `os_project_status`, `os_simulate`, `os_create_task`, `os_record_decision` | Each declares the OS permission it needs; the Brain checks it against the asking person's OS principal before running. | Read or low-risk only; nothing moves money. |

## Fixes found while building
- Department-head templates (operations manager, production manager, creative director) did not include the base employee permissions, so they could not claim expenses, request leave or use the Assistant. `DEPT()` now includes `BASE`.
- Everyone on the team can record their own decisions (`decision.manage.own`).
- Deliverable status events now carry `action` (e.g. `client_revise`) so workflows can react to client revisions.

## Jobs
`os_hourly`: hourly scheduled workflows + resume approved runs. `os_daily`: problem scan, daily / weekly workflows, decision review reminders (plus Phase 5 rights scan).

## Tests
`tests/v506.test.mjs` 102 checks. v501 119, v502 123, v503 104, v504 96, v505 109, Brain suites unchanged. Visual: 14 screenshots desktop + 390 px, zero console errors.
