# FODO OS V4: technical debt and risk register (Phase 0 audit, part 3)

Each item: what it is, where, why it matters for V4, what to do, and when. Severity: High = must be handled in Phase 1 or it blocks V4 · Medium = handle in the phase that touches it · Low = note and live with it.

| # | Item | Where | Why it matters for V4 | Action | Severity |
|---|---|---|---|---|---|
| D1 | **Four staff membership tables** (`acct_admins`, `biz_staff`, `site_members`, `brain_members`) with different role vocabularies | accounts.js, biz.js, sites.js, brain/access.js | V4 needs one organization, one role model, deny-by-default | Single `os_members` + roles; legacy tables read as fallback during migration, then frozen | High |
| D2 | **62 inline `can(R, [...])` + 31 `isOwner(u)` checks** scattered in routers and libraries | `api/biz`, `_lib/*` | V4 section 2.5 / 32: object-level authorization in one place | Central `authorize()`; migrate route by route, old check removed only after its suite passes | High |
| D3 | **Two admin surfaces** (`/admin/` and Workspace admin tabs) with separate role sources | admin.js vs ws-market-admin.js | Owner Command Centre needs one place | Keep both pages; both read `os_members`; Command Centre links into them | Medium |
| D4 | **`biz_tasks` is minimal** (title, who, due, todo / done) | projects2.js | V4 task engine (assignee, priority, dependencies, estimates) | Additive columns + `os_task_deps`; legacy API unchanged | High |
| D5 | **CRM is per-user** (`crm_*.user_id`), no company / lead / opportunity objects, 6 stages | crm.js | Customer 360 needs one client record linked to projects, invoices, support | New `os_clients` as the canonical company record; `crm_contacts` / `crm_deals` get `client_id`; existing data backfilled by email / company name match (manual confirmation for ambiguous rows) | High |
| D6 | **No event bus**; modules call `notify()` / `enqueue()` directly | everywhere | Activity timeline, automations, problem detection all need events | `os_events` + `emit()`; modules emit at their write points (additive) | High |
| D7 | **No cursor pagination, `SELECT *` on lists** | most list functions | Performance at scale (V4 section 35) | New OS lists: explicit columns + keyset; legacy lists converted when touched | Medium |
| D8 | **No full-text search**; staff search uses `LIKE` on a handful of tables | mission.js | Global search (section 30) | Check D1 FTS5 availability in Phase 1; if present, `os_search` virtual table; else indexed `LIKE` with limits and per-entity endpoints | Medium |
| D9 | **Dense one-line code style** (biz.js 257 KB across two files; lines of 500 to 900 characters) | `_lib/*.js`, `js/*.js` | Review cost; one mistaken mid-line `//` has broken builds twice | Keep the style (rewriting is riskier), enforce `/* */`, assert-once patch scripts, `node --check` in CI (exists) | Low |
| D10 | **No TypeScript / schema types**; API payload shapes are implicit | all | New modules must not guess field names (the v475 "no such table" bug came from this) | Document table columns in `FODO-OS-V4-DATA-MODEL.md`; set-up chain rule in CLAUDE.md 9.3 | Low |
| D11 | **Cross-module DB set-up chain** (`bdb → pdb → qdb → fdb`) must be called by hand | mission.js, calendar.js | New readers (Command Centre, reports) touch every table | One `osdb()` that runs every set-up once per isolate | Medium |
| D12 | **Flaky e2e suites under load** (xray-e2e, v17, v19, v8-finder, v13 account 503) | tests/ | V4 adds many suites; flakiness hides real failures | Run runtime e2e serially; retry policy documented; never mark skipped as passed | Medium |
| D13 | **R2 `FILES` binding commented out** (bucket not created yet) | wrangler.toml | Asset management, deliverables, document centre need R2 | Owner creates the bucket; until then KV fallback (10 MB) with honest message | Medium (owner action) |
| D14 | **Notifications are flat** (`biz_notes.kind`); no urgency, dedupe or escalation | biz.js notify | Section 33 | Additive `category`, `urgency`, `dedupe_key`; escalation job | Medium |
| D15 | **Brain tools call libraries directly** with the owner's identity | brain/tools.js | AI must respect the permission layer (section 26.5); employee assistant impossible today | Tools declare `resource.action`; `authorize()` runs per call | High (Phase 6) |
| D16 | **`brain_automations` is a fixed trigger / action list**, owner-only, no execution history per run | brain/automations.js | Workflow Studio (section 25) | New `os_workflows` + `os_workflow_runs`; Brain automations become one trigger source, not replaced | Medium |
| D17 | **No system-health view**; monitoring data scattered | monitor.js, csp, site errors, jobs | Section 31 / 67 | `os/health` probes with configured / not configured / failing | Medium |
| D18 | **Invoice statuses** `draft / issued / paid / cancelled`, no due date column | finance.js | Finance overview, receivables, overdue detection | Additive `due_date`, `viewed_at`, `paid_amount`; overdue derived | Medium |
| D19 | **Light theme is secondary** on Workspace / Admin (dark is the design default; light exists but was tuned less) | workspace.css | V4 section 4.2 asks for a premium light theme | **Owner decision needed** (see plan, decision 2): light-theme polish is a visual change and the owner rejected the v48 redesign | Medium |
| D20 | **Generated pages rebuild stamps every asset** (`?v=<timestamp>`) on every build | build_pages.py | Harmless, but every release busts every cache | Keep; note for CDN costs only | Low |
| D21 | **Secrets only via Cloudflare**; test mode gates (`XRAY_TEST_MODE`) in code | accounts.js | A misconfigured production variable would expose test-login | Guard exists (`/api/account/test-login` 404 unless test mode); add a health probe that fails loudly if test mode is on in production | Low |
| D22 | **No per-user session list / revoke**, no "last active" | accounts.js | Offboarding (section 12.4) and security (section 36) | `acct_sessions.user_id` exists; add list / revoke endpoints and `last_seen` | Medium |
| D23 | **Help tickets have no SLA fields** beyond `first_reply_at` | help*.js | Section 10 | Additive `sla_due`, `escalated_at`, `csat` | Low |
| D24 | **Pro status spread over three places** (`biz_pros.status`, application state, bookings) | proapps.js | Pro lifecycle / passport | Derived `lifecycle` column kept in sync by existing transitions | Low |
| D25 | **Large frontend SPA file** (`workspace.js` 710 dense lines) | js/ | Section 35 code splitting | Already lazy modules; every V4 view ships as a lazy `ws-*.js`; `workspace.js` grows only by routing lines | Low |

## Incomplete or partially implemented features found

- Campaigns: `biz_campaigns.status` says draft / ready / "awaiting provider"; nothing can ever reach a confirmed Live because no ads-platform adapter exists (honest today, but the V4 campaign workflow needs the adapter or stays at Ready).
- AI Studio: text generation only; "video" and "image" buttons route to honest "not configured" messages when providers are absent (correct behaviour, not a bug).
- Growth Lab AI visibility: results depend on provider keys; without them the tool says so.
- Easy Split payouts: adapter exists behind `CASHFREE_SPLIT_ON=1`, never exercised against the live provider (owner KYC pending per checklist).
- Calendar feeds: tasks are not in the feeds yet (only project, milestone, team dates).

## Duplicate functionality found

- Staff identity (D1). Admin surfaces (D3). Two notification preference concepts (`biz_notify_prefs` categories vs Brain alert settings). Two "memory" ideas (Brain memory vs future knowledge base): the knowledge base must be the system of record and Brain memory a cache / index over it (V4 section 26.6 forbids duplicate memory).

## High-risk migrations (need a rehearsal on a schema copy and an owner go-ahead)

1. **Client canonicalisation** (D5): creating `os_clients` and attaching projects, quotes, contracts, invoices, CRM rows and tickets to one client id. Reversible (new column, old columns untouched) but the backfill guesses by email; ambiguous rows are listed for manual confirmation, never auto-merged.
2. **Staff backfill** into `os_members` (legacy roles → templates): reversible; the legacy tables stay the fallback until the owner confirms every member's role in People & Access.
3. **Task statuses**: new values on `biz_tasks.status` alongside `todo / done`; legacy project task UI must keep rendering unknown values (tested).
4. **Invoice status derivation** (overdue / partially paid) changes what finance lists show; shipped behind the Finance module switch first.
