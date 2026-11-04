# FODO OS V4: existing architecture (Phase 0 audit, part 1)

Audited version: **FODO v47.6.2** (5 November 2026). Every count below was taken from the repository on the day of the audit, not from memory. Companion documents: `FODO-OS-V4-FEATURE-INVENTORY.md`, `FODO-OS-V4-TECHNICAL-DEBT.md`, `FODO-OS-V4-SECURITY-AUDIT.md`, `FODO-OS-V4-IMPLEMENTATION-PLAN.md`. The earlier FODO OS design (`FODO-OS-AUDIT.md`, `FODO-OS-IMPLEMENTATION-PLAN.md`, `FODO-OS-ARCHITECTURE.md`) is folded into the V4 plan; its permission model is reused unchanged.

**Nothing of FODO OS V4 is built.** This document describes what runs today.

---

## 1. Runtime and hosting

| Layer | What it is |
|---|---|
| Hosting | Cloudflare Pages (static site; the repository root is the build output) + Pages Functions (`functions/`) |
| Second project | `fodo-sites` (published client websites from the Builder), optional `runner/` Worker for Business X-Ray crawls |
| Database | One D1 database `XRAY_DB`, **145 tables** created by per-module `CREATE TABLE IF NOT EXISTS` + `migrateOnce()` (additive, hash-recorded in `schema_migrations`) |
| Key-value | KV `CHAT_KV` (rate limits, sessions helpers, bot state, one-time tokens) |
| Storage | R2 `FILES` (private workspace files, multipart to 1 GB, **binding commented out until the bucket exists**; KV fallback to 10 MB), R2 `MEDIA` (site media) |
| Queue | Optional Cloudflare Queue `JOBS` (D1 `biz_jobs` is the truth either way) |
| AI | Workers AI + configured providers (Gemini, OpenAI, Anthropic keys; `availableProviders()`), voice |
| Scheduling | GitHub Actions: daily monitor tick, hourly brain tick (also runs due jobs), browsers, engineer, runner, tests CI |
| Front end | Plain JS, no framework, no bundler. Generated HTML shells (`scripts/build_pages.py`, 103 routes + 404) + SPAs: `js/workspace.js` (hash routes, lazy `ws-*` modules), `js/admin.js`, `js/owner-brain*.js`, `js/website-builder.js` + `wb-*.js`, `js/lab*.js` |
| Design system | `css/styles.css` + `css/theme-glass.css` + `css/studio.css` (site), `css/workspace.css` (Workspace / Pros / Admin: `ws-*`, `pb-*`, `tm-*`, `fn-*`, `pa-*`, `mc-*`, `sy-*`), dark default, light theme switch exists on every page (`#theme-toggle`, persisted) |
| Tests | 94 suite files, `tests/run.mjs` groups unit / integration / store / builder / brain / xray / security / e2e; last full run 4,514 checks pass (v47.6), e2e 2,111 pass (v47.6.2) |

## 2. Backend layout

```
functions/
  api/account/[[path]].js    login (Google, e-mail code, Firebase), sessions, plans, credits, privacy, test-login (test mode only)
  api/admin/[[path]].js      FODO team dashboard: accounts, orders, X-Ray runs, help desk, analytics, lab config, bot metrics
  api/biz/[[path]].js        Workspace + marketplace: 303 lines, every marketplace route (projects, quotes, teams, finance, pros, orgs...)
  api/help/[[path]].js       support tickets, chats, mail-in
  api/lab/[[path]].js        Growth Lab tools, plans, monitoring, GSC
  api/owner-brain/[[path]].js Owner Brain chat, tools, memory, connectors, automations, engineer
  api/sites/[[path]].js      Website Builder + shop
  api/xray/[[path]].js       Business X-Ray
  api/monitor/tick.js, jobs.js   cron entry points (cron key)
  _lib/ (43 files + brain/ 15 files)   all business logic; the catch-alls only route and check roles
```

Request pattern (every catch-all): `sessionUser()` → same-origin + JSON content-type CSRF on non-GET → `count()` KV rate limit → `rolesOf()` → inline `can(R, [...])` or `isOwner(u)` → library call → `ok({})` / `err(msg, status)`.

Database set-up chain (must be respected by any new module): `bdb` (biz) → `pdb` (production) → `qdb` (quotes) → `fdb` (finance); `payouts.pdb`; `mission.js` composes all of them. A module reading another module's table must call that module's set-up first (known trap, documented in `CLAUDE.md` 9.3).

## 3. Identity and access today

| Audience | Identity source | Access decided by |
|---|---|---|
| Owner | `OWNER_EMAILS` (2 addresses) | `isOwner(u)` (31 call sites) |
| FODO staff (admin dashboard) | `acct_admins (email, role)` | per route in `/api/admin` |
| FODO staff (marketplace) | `biz_staff (email, role: moderator / finance / viewer)` + owner-derived `admin` | `rolesOf()` → `can(R, [...])` (62 call sites) |
| Builder collaborators | `site_members (site_id, email, role)` | `siteFor()` tenant rule |
| Owner Brain members | `brain_members (email, role, perms)` | `brain/access.js` |
| Growth Lab seats | `acct_team (owner_id, email)` | plan owner check |
| Client organizations | `biz_orgs / biz_org_members` (v47.6) | `orgs.js mayAct / peersOf` |
| FODO Pros | `biz_pros` row | `R.pro` |
| Clients | every signed-in user | own records |

Sessions: `acct_sessions` (token hash, user, expiry, ip hash), cookie `fodo_s` HttpOnly Secure SameSite=Lax, 30 days. No per-user session list / revoke-all, no impersonation, no departments, no employee record, no permission + scope registry.

## 4. Module map (actual routes)

| Area | Public route | Code |
|---|---|---|
| Marketing site | `/`, `/work/`, `/services/`, `/reviews/`, `/about/`, `/insights/`, `/contact/`, 100+ generated pages | `index.html`, `scripts/build_pages.py`, `js/main.js`, `js/pages.js`, `js/fx.js`, `js/scene3d.js` |
| Growth Lab | `/growth-lab/`, `/growth-score/`, `/roi-calculator/`, `/budget-planner/`, `/competitor-finder/`, `/plans/`, `/fodo-challenge/`, `/marketing-quiz/` | `js/lab*.js`, `js/tools.js`, `functions/_lib/usage.js`, `lab-*.js` |
| Business X-Ray | `/business-xray/`, `/xray/<id>/` | `js/tool.js`, `functions/_lib/xray-*.js`, `runner/` |
| Workspace (clients + staff) | `/workspace/#view` (19 nav entries) | `js/workspace.js` + `ws-builder`, `ws-market-admin`, `ws-teams`, `ws-finance`, `ws-proapps`, `ws-mission`, `ws-sync` |
| FODO Pros portal | `/fodo-pros/` (invite-gated), `/become-a-pro/` (public application) | same SPA in `data-mode="pro"`, `proapps.js` |
| Website Builder | `/website-builder/`, `/sites/<slug>/`, published on `fodo-sites` | `js/website-builder.js`, `wb-*.js`, `functions/_lib/sites.js`, `shop.js` |
| Owner Brain | `/owner-brain/` | `js/owner-brain*.js`, `functions/_lib/brain/*` (106 tools: 74 read, 23 draft/low-risk, 9 owner-confirm) |
| Admin dashboard | `/admin/` | `js/admin.js`, `functions/api/admin` |
| Account | `/account/` | `js/account.js` |
| Help / support | `/help/`, chat widget, mail-in | `js/help.js`, `functions/_lib/help*.js`, `help_*` tables |

## 5. Database families (145 tables)

| Prefix | Count | Holds |
|---|---|---|
| `acct_*` | 12 | users, sessions, admins, team seats, orders, credits, plans, privacy |
| `biz_*` | 62 | projects, milestones, tasks, messages, files + uploads, bookings, pros, applications, case studies, packages, portfolio, reviews, disputes, teams, team members + events, availability, equipment + holds, quotes (versioned), contracts (versioned), settlements + lines, payouts, ledger (append-only, 2 triggers), invoices, credit notes, refunds, content, campaigns, brand, studio, notes (notifications), audit, settings, staff, jobs, cal tokens, orgs + members, invites |
| `brain_*` | 22 | memory + versions, audit, actions, automations, connectors, members, media, chats, insights, engineer runs |
| `site_*`, `sites` | 16 | sites, pages, revisions, members, media, domains, shop (products, orders), client errors |
| `xray_*` | 13 | reports, scores, findings, evidence, competitors, opportunities, background runs |
| `lab_*` | 6 | plans, config, tool runs, monitoring targets / snapshots, GSC |
| `help_*` | 5 | tickets, messages, chats, chat messages, mail |
| `crm_*` | 3 | contacts, deals (stage, value, probability, close date, lost reason), activities |
| `mon_*`, `web_*` | 5 | monitoring events, web forms / leads |
| other | 6 | `privacy_log`, `csp_reports`, `api_usage`, `fodo_leads`, `schema_migrations`, `biz_notify_prefs` |

Indexes exist on the hot marketplace tables (bookings unique day index, ledger, jobs, quotes, files). Lists use `LIMIT` with "latest N" or offsets; no cursor pagination; many `SELECT *`.

## 6. Background processing

- `biz_jobs` (v47.6): kinds mail, notify, upload_sweep, team_housekeeping, refund_check, payout_check, webhook. Lock row per attempt, backoff 1 m / 5 m / 15 m / 1 h / 2 h, dead after 5 attempts (audited), stuck runs released after 10 min. Admin: Mission Control → Jobs (counts, retry, run now).
- Entry points: `POST /api/monitor/jobs` (hourly workflow), `POST /api/monitor/tick` (daily: monitoring checks, housekeeping enqueue).
- Brain automations: `brain_automations` (trigger type / value, condition, action, schedule; runs from the hourly brain tick). This is the only "workflow" engine today and is Brain-only.
- No event bus. Modules call `notify()` / `enqueue()` directly.

## 7. Integrations (status is per configuration, never assumed)

| Integration | Where | Status model |
|---|---|---|
| Payments: Razorpay, Cashfree (+ Easy Split) | `payments.js`, `payouts.js` | `payOn()` / `payoutsOn()` from secrets; webhooks signature-verified; provider confirmation before any state change |
| Mail: Resend | `accounts.js sendMail` | silent no-op without key (logged) |
| WhatsApp Business | `waOn(env)` needs 4 secrets | messages only when configured |
| Google: sign-in, Search Console, Workspace (Gmail / Calendar / Drive read for the Brain) | `accounts.js`, `lab`, `brain/google.js` | OAuth, tokens in `brain_connectors` |
| Social (Brain): Meta / Instagram / Facebook, LinkedIn, YouTube | `brain/social.js` | OAuth, publish only when connected |
| GitHub (Website Engineer) | `brain/github.js`, `engineer.js` | PRs only, never direct pushes |
| AI providers | `brain/models.js` | `availableProviders()`; honest fallback text when none |
| Analytics: GA4 / Meta pixel on site, own `api_usage`, bot metrics | site + admin | |
| No: accounting software, e-signature, cloud storage sync, Outlook, TikTok, Google Ads API | | not present anywhere in the code |

## 8. Monitoring and observability today

`mon_*` (Growth Lab site monitoring for clients), `csp_reports`, `site_client_errors` (Builder), `api_usage`, `brain_audit`, `biz_audit`, job dead-letter audit, bot metrics. There is no single system-health page, no error-rate dashboard, no uptime probe of the Functions themselves (GitHub workflows fail loudly if the tick fails).

## 9. Module dependency map (today)

```
accounts.js (users, sessions, mail, owner)  ◄── everything
   │
   ├── biz.js (bdb: projects, tasks, files, notes, staff, settings, audit, nav, roles)
   │      ├── projects2.js (tasks, changes, time, retainers, refunds)
   │      ├── production.js (pdb: Build a Team, catalog, pricing)  ◄── quotes.js (qdb) ◄── finance.js (fdb: contracts, settlements, invoices, ledger)
   │      ├── teams.js / availability.js / equipment (team staffing, bookings)  ◄── calendar.js
   │      ├── proapps.js (applications, case studies, badges)  ◄── mission.js (also qdb, payouts.pdb, fdb)
   │      ├── payouts.js (payouts.pdb)  ◄── finance.js (settlement → payout)
   │      ├── orgs.js (client organizations)  ◄── quotes / finance (peer read, act on behalf)
   │      ├── files.js (R2 / KV, multipart)  ◄── projects, brain media
   │      ├── jobs.js (queue)  ◄── teams, files, payouts, refunds, mail
   │      ├── crm.js, brand, content, campaigns, studio (client workspace modules)
   │      └── alerts.js (notification prefs)
   ├── sites.js + shop.js (Builder, separate tenant model)
   ├── usage.js / lab-*.js / monitor.js (Growth Lab)
   ├── xray-*.js (Business X-Ray)  ◄── runner Worker
   ├── help*.js (support)
   └── brain/* (orchestrator → tools.js → every module above; access.js; connectors)
```

Rule of the map: arrows only point downward to `accounts.js` and `biz.js`; a new module must sit at a leaf (or compose existing set-ups like `mission.js` does), never make `biz.js` import it.

## 10. Verdict for V4

The platform is already one backend, one database, one identity system, one file system, one job queue and one finance system. What V4 needs and the code does not have is listed in the feature inventory under **Missing**: a permission + scope registry and employee model, a shared task / approval / activity layer, the owner Command Centre with problem detection, and a set of new business modules (support SLA, HR, vendors, knowledge, documents, workflow studio, simulation, compliance). None of those requires replacing what exists.
