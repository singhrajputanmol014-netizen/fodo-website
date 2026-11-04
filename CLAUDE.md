# FODO project handover (read this first)

This file is the complete working memory of the FODO website project, written so that a brand-new Claude account or session can continue the work exactly where it stopped, without asking the owner to explain anything again and without breaking the live site.

- **Current version:** v50.3 (5 November 2026): v47.6.3 + FODO OS V4 Phases 1 to 3 (permission system + People & Access; operations core: My FODO, tasks, approvals, queues, calendar, workload, projects, clients, support, Command Centre, Control Tower; HR: leave, reviews, training, skills, onboarding, capacity, attendance; Pros: lifecycle, passport, appeals, two-stage matching, booking changes, hours, team assembly with employees, workroom). Phases 4 to 8 are NOT built; OS work is paused until the owner says so. Reports: `docs/FODO-V50.1-REPORT.md`, `docs/FODO-V50.2-REPORT.md`, `docs/FODO-V50.3-REPORT.md`.
- **Repository:** `singhrajputanmol014-netizen/fodo-website` (GitHub). The repo root IS the website (Cloudflare Pages build output directory is `.`).
- **Live site:** https://www.fodo.co.in
- **If you are a new Claude:** read sections 1 to 6 completely before touching any file. Sections 7 onward are reference.

---

## 1. People and how to work with them

| Who | Role |
|---|---|
| **Rohit** (rohitsainiaggarwal786@gmail.com) | The person who works with Claude on this project. He builds and maintains the site for FODO. Not a full-time developer: he deploys with GitHub Desktop. |
| **Anmol Singh** | Founder of FODO. Owner account. |

**Communication rules (important):**
- Rohit writes in **Hinglish** (Hindi + English in Latin script). **Always reply in Hinglish**, short and practical. Technical file contents, code, docs and commit messages stay in **English**.
- He prefers finished, working results over plans. When he says "next phase start kardo" / "kardo", do the work end to end and deliver the zip.
- He tests and then asks for targeted fixes. Do not rewrite things that work.
- He **rejected the v48 "Workspace Design 2.0" redesign** ("bahot ganda hai, pehle wala hi thik tha") and re-deployed v47.6. **Never change the visual design of the Workspace / Pros / Admin / Builder on your own.** If a design change is asked for, change only that part, show a screenshot first, and wait for "haan" before packaging.
- The brand tagline is always written exactly **"FEAR OF DIGITALLY OUT ?"** (with the space and question mark).
- The favicon / tab icon everywhere is the **dark single "F" with a purple dot** (v46.2.2). Do not change it.

---

## 2. Non-negotiable rules (the site depends on these)

1. **Never put API keys or secrets in frontend code or in the repo.** Secrets live only in Cloudflare (Settings → Variables and Secrets) and GitHub Actions secrets.
2. **No fake data:** no fake reviews, ratings, metrics, payouts, case studies, "live" claims or counts. Anything that needs an outside provider says **"Awaiting provider activation"** (or similar honest wording) until the provider confirms.
3. **Owner emails get everything free:** `anmol@fodo.co.in` and `singhrajputanmol014@gmail.com` (`OWNER_EMAILS` in `functions/_lib/accounts.js`).
4. **Only owners change admin settings** (prices, pricing rules, badge rules, commission, staff roles).
5. **Dark theme is the default** (`localStorage["fodo-theme"]`, default "dark").
6. **Login codes are never stored or shown** (the mail log writes "[login code — not stored]").
7. **FODO Brain (owner-only AI):** owner-only, registered tools only, confirmation levels (level 0 read, level 1 draft, level 2 needs the owner's confirmation). **The Brain never sends money**, never signs, never exports data.
8. **Never use the word "worker"** for people. Say **"FODO Pro"** / professional. (Cloudflare "Workers AI" / "Worker" for the runtime is fine.) `scripts/check.mjs` enforces this in marketplace files.
9. **FODO Pro profiles are never public web pages.** They are shown only to signed-in clients and staff. `/fodo-pros/` (the Pro portal) is **invite-gated** (noindex, robots Disallow, not in sitemap). `/become-a-pro/` is the public application page.
10. **Tenant isolation is enforced on the server.** Every query is scoped to the authenticated user / role. Client websites can never reach FODO's admin, Brain, database or other clients.
11. **No feature theatre:** a feature either works for real or says honestly that it is not connected.
12. **Do not rewrite the architecture.** Additive changes only. **Read a file before editing it.** **Never delete a failing test to make a suite pass;** fix the code (or update a test only when the product behaviour intentionally changed, and say so).
13. **Avoid the long dash "—" in user-facing text** (use commas, colons, or "·").
14. Database changes are **additive only** (new tables / columns through `migrateOnce`). Never drop or rename columns that live code reads.

---

## 3. How a change reaches the live site (deploy workflow)

Rohit deploys with **GitHub Desktop** on Windows:

1. Claude delivers a zip named `FODO-github-update-vXX.zip` that contains a top-level `fodo/` folder (the whole repo, without `node_modules`, `.wrangler`, `.git`).
2. Rohit unzips it and pastes the contents of `fodo/` into `C:\GitHub\fodo-website` (Replace all).
3. GitHub Desktop: **Fetch / Pull origin first** (the FODO Brain can open PRs / commits), then Commit to `main`, then Push.
4. Cloudflare Pages auto-deploys in 1 to 2 minutes (project `fodo-website`). Rohit hard-refreshes (Ctrl + Shift + R).
5. Rollback: GitHub Desktop → History → right-click the commit → Revert → Push.

**Packaging command Claude uses** (from the folder that contains `fodo/`):
```
rm -f fodo/qa-report.json fodo/tests/.last-run.json fodo/voice-desktop.png fodo/voice-mobile.png ../FODO-github-update-vXX.zip
zip -qr ../FODO-github-update-vXX.zip fodo -x 'fodo/.wrangler/*' 'fodo/*/node_modules/*' 'fodo/node_modules/*' 'fodo/.git/*'
```
**Do NOT delete `fodo/*.png`**: the root holds `favicon.png`, `favicon-192.png`, `favicon-512.png`, `apple-touch-icon.png`.

**How Claude delivers each version:**
1. Send the zip (file attachment).
2. A short Hinglish summary: what changed, what was tested (numbers), anything Rohit must set up.
3. A commit message block in English, ending with the attribution lines the session asks for (for example `Co-Authored-By: ...` and `Claude-Session: ...`).

If you are a new Claude without the repo on disk: ask Rohit to upload the latest zip (or connect the GitHub repo), then work on that copy and always return a full zip in the same format.

---

## 4. Infrastructure (Cloudflare)

| Piece | Details |
|---|---|
| Pages project | `fodo-website`, Git-connected to the repo, build output `.`, Functions in `functions/`. `wrangler.toml` holds bindings. `compatibility_date = "2026-10-01"`. |
| D1 database | binding **`XRAY_DB`**, name `fodo-xray`, id `8672c9a1-7d55-4789-8160-0f69875922c2`. Holds everything: accounts, X-Ray, Brain, builder sites, marketplace. |
| KV | binding **`CHAT_KV`**, id `dc36f659051342a39608e79046ae2d44`. Rate-limit counters, small file storage fallback, bot metrics. |
| Workers AI | binding **`AI`** (free). |
| R2 (planned) | `FILES` → bucket `fodo-files` (private workspace files; enables 95 MB files and v47.6 multipart up to 1 GB). Lines are **commented in `wrangler.toml`**: uncomment ONLY after the bucket exists, or the deploy fails. Optional `MEDIA` → `fodo-media` (Brain social uploads). |
| Queue (optional) | `JOBS` → `fodo-jobs` (commented in `wrangler.toml`). Without it, background jobs run from the hourly GitHub workflow. |
| `fodo-sites` | Second Pages project, root `sites/`, serves client websites at `sites.fodo.co.in` + custom domains. Same D1 binding. Needs `SITES_SECRET_KEY` identical to the main project. |
| `fodo-runner` | Optional Cloudflare Worker in `runner/` for background X-Rays (queue `fodo-xray`, `RUNNER_KEY`). |
| Routing | `_routes.json` sends `/api/*` (and `/CLAUDE.md`) to Functions. `functions/CLAUDE.md.js` answers 404 so this handover file is never served publicly (a `_redirects` rule does NOT override a static file). Keep both. `_redirects` has 301s (e.g. `/favicon.svg` → `/favicon.png`). `_headers` is **regenerated by `build_pages.py`** (CSP report-only + noindex rules): edit the generator, not the file. |

**GitHub Actions** (`.github/workflows/`):
- `fodo-monitor.yml`: daily 01:17 UTC, calls `/api/monitor/tick` (cron key). Monitoring, Brain daily brief, digest emails, payout / refund checks, team housekeeping, jobs.
- `fodo-brain.yml`: hourly, `/api/owner-brain/tick` + `/api/monitor/jobs` (background jobs).
- `fodo-browsers.yml`: Chromium / Firefox / WebKit smoke on push.
- `fodo-engineer.yml`: FODO Brain's "Website Engineer" (index, QA of Brain PRs on `brain/*` branches, inspect). The Brain cannot edit `.github/`.
- `fodo-runner.yml`: fallback background X-Ray runner.
- `fodo-tests.yml` (v47.6): full CI (static checks + `run.mjs integration` + `run.mjs e2e`) on push / PR.
- Secrets: `FODO_CRON_KEY` (= Cloudflare `CRON_KEY`), `FODO_RUNNER_KEY`.

---

## 5. Repository map

```
/                      public pages (generated) + favicon files + config files
  index.html, about/, services/, industries/, locations/, insights/, work/, pricing/, plans/, faq/, reviews/,
  contact/, help/, legal/, templates/, resources/, teardowns/, founding-programme/, become-a-pro/ (v47.4),
  growth-lab/ (+ tool pages), business-x-ray/, competitor-finder/, growth-score/, roi-calculator/, marketing-quiz/,
  marketing-budget/, fodo-challenge/, thank-you/, account/, 404.html          ← all written by scripts/build_pages.py
  workspace/           Workspace shell (client Business OS + Marketplace admin)  ← generated shell, logic in js/workspace.js
  fodo-pros/           FODO Pros portal shell (same workspace.js, data-mode="pro") ← invite-gated
  owner-brain/         Owner Brain shell (owner only)
  admin/               FODO team admin dashboard (js/admin.js)
  website-builder/     Website Builder app shell (import map of js/wb-*.js + sites/lib/*.js)
css/                   styles.css (base) · theme-glass.css (dark/light tokens) · studio.css (design system, see 8)
                       workspace.css (Workspace + Pros + Admin) · website-builder.css · wb-studio.css · owner-brain.css · admin.css · bot.css
js/                    main.js (site shell, header/footer, theme toggle) · account.js (login, window.FODO_ACCOUNT)
                       workspace.js (Workspace / Pros / Admin SPA) + lazy modules ws-*.js (see 9)
                       website-builder.js + wb-*.js (builder) · owner-brain*.js · admin.js · bot*.js (site chatbot) · xray*.js
functions/api/         Cloudflare Pages Functions, one catch-all per area:
                       account/ admin/ biz/ help/ lab/ monitor/ (tick.js, jobs.js) owner-brain/ sites/ xray/
                       + single files: chat.js competitors.js enrich.js export.js geo.js leads.js osm.js site-config.js stats.js t.js voice-session.js brand-ai.js csp-report.js
functions/_lib/        server libraries (see 9)
functions/_lib/brain/  Owner Brain: tools.js (tool registry), orchestrator, memory, google, social, github, engineer, voice, live...
sites/                 the fodo-sites project (client website renderer + lib shared with the builder)
runner/                optional background X-Ray Worker
scripts/               build_pages.py (site generator), seo_config.py, hero_art.py, check.mjs (static checks), qa.mjs, eng-index.mjs ...
tests/                 all test suites + run.mjs (runner) + package.json (tooling, never deployed) + xray-fixtures/
docs/                  architecture and version reports (FODO-V40 ... FODO-V47.6-REPORT.md)
data/                  build.json, seo-lastmod.json, search index data (generated)
wrangler.toml          bindings · _headers (generated) · _redirects · _routes.json · robots.txt / sitemap.xml (generated)
```

---

## 6. Status: what exists today (v47.6) and what is pending

**Done and live:** public site (~103 routes), Growth Lab + Business X-Ray + Pro tools + plans/payments, Website Builder (+ store, blog, domains, client sites), Owner Brain (voice, tools, social, engineer), Help desk, Admin, Workspace (Business OS: overview, Brand Kit, content & ads, AI Studio, CRM, files, billing, notifications, settings & privacy), FODO Pros marketplace, and the full V47 marketplace programme:

| Phase | What |
|---|---|
| v47.1 | Build a Team (project builder), production catalog (54 roles, 23 equipment, 45 templates), pricing engine, versioned quotes, refund state machine fix |
| v47.2 | Team staffing from accepted quotes, availability engine, database-level double-booking protection, equipment reservations |
| v47.3 | Contracts (versions, typed-name signing, amendments, cancellation calculator), project from contract with payment plan, settlement per milestone, per-professional payouts, Cashfree Easy Split adapter, append-only ledger, invoices + credit notes, reconciliation |
| v47.4 | Become a FODO Pro (public page + application pipeline with checks), Profile 2.0, case studies (client permission + moderation), real-data badges, FODO Recommended |
| v47.5 | Admin Mission Control (attention list, staff Ctrl+K search, hiring intelligence, audited CSV exports) |
| v47.6 | R2 multipart uploads, background job queue, private calendar feeds (iCal), organizations, CI workflow + `scripts/check.mjs` |
| v47.6.1 / v47.6.2 | `CLAUDE.md` handover · header fits when signed in (account pill = avatar) · smoother 3D background (no layout reads on scroll, batched resize, off-screen looping animations paused) |
| v48 | **Rejected and reverted.** Do not reintroduce. |

**Pending on Rohit's side (not code):** see `FODO-Aapke-Kaam-Checklist-v47.6.pdf` (Hinglish). Summary:
- Cloudflare keys (section 12), payments KYC (Cashfree / Razorpay), payouts provider, `PAYOUT_ENC_KEY`, `FODO_GSTIN` after GST registration.
- R2 bucket `fodo-files` → then Claude uncomments the `FILES` lines in `wrangler.toml`.
- Catalog: replace the 54 "seed" role rates and 23 equipment rates with FODO's real rates; review pricing rules.
- Legal review of the 10 contract clauses and the cancellation policy (14+ days 90 %, 7+ days 50 %, less 0 %).
- Review FODO Pro applications; Google APIs / OAuth verification; social apps (Meta, LinkedIn, X, WhatsApp); GitHub token for the Brain.

**Possible next code work (only when asked):** a consumer Worker for the `JOBS` queue; uncommenting R2 once the bucket exists; anything Rohit reports from testing.

**FODO OS V4 (in progress, phase by phase).** The owner's V4 master prompt is the roadmap. Phase 0 audit + plan: `docs/FODO-OS-V4-IMPLEMENTATION-PLAN.md` (section 2 = owner decisions, section 4 = phases, section 6 = backlog format), `-EXISTING-ARCHITECTURE.md`, `-FEATURE-INVENTORY.md`, `-TECHNICAL-DEBT.md`, `-SECURITY-AUDIT.md`. **Phase 1 shipped in v50.1** (`docs/FODO-V50.1-REPORT.md`): `functions/_lib/os/` (permissions, db, authz, audit + events, people, impersonate, nav, me), `/api/os/*` router, People & Access UI (`js/ws-people.js`), grouped navigation for staff, kill switch. Reference docs: `FODO-OS-V4-PERMISSIONS.md`, `-DATA-MODEL.md`, `-API-REFERENCE.md`, `-SECURITY.md`. Next: Phase 2 (v50.2) Command Centre + operations (clients canonical record, task engine 2.0, approvals, My FODO, queues, calendar, project lifecycle, support SLA). The older `docs/FODO-OS-ARCHITECTURE.md` / `FODO-OS-AUDIT.md` / `FODO-OS-IMPLEMENTATION-PLAN.md` are the first design and are superseded where they differ. Owner decisions taken for Phase 1 by recommendation: design unchanged (light theme reviewed, no token change needed), sidebar grouped (Command / Operations / Growth / People / Platform), roles confirmed by the owner in People & Access, 13 departments seeded (managers to be named by the owner).

---

## 7. Building the public site

- **Everything public is generated by `python3 scripts/build_pages.py`** (Python 3). It writes all route `index.html` files, `404.html`, the Workspace / Pros / Brain / Builder shells, `sitemap.xml` (with honest `lastmod` from content hashes in `data/seo-lastmod.json`), `robots.txt`, `_headers`, the search index and `data/build.json`.
- **Never hand-edit generated HTML.** Change the generator (or the content modules it imports: `seo_config.py`, `service_pages_*.py`, `new_pages_content.py`, `hero_art.py`, ...) and rebuild.
- Each build stamps a cache-busting version `_V` (unix time) on every CSS/JS URL, so **after editing any CSS/JS, rebuild pages** so the new `?v=` reaches browsers.
- Page definition pattern: `pages[key] = (route, path, T(title<=62 chars), D_(description<=160 chars), body_html, depth, LD(json_ld...), scripts)` using helpers `hero(eyebrow, h1, lead, ctas, visual, index)`, `sec(num, h2, inner)`, `faq_block(faqs, prefix)`, `faq_ld(faqs)`, `crumbs_ld(trail)`. `T()` / `D_()` assert the length limits.
- Head favicon block (keep exactly):
  `<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" type="image/png" sizes="512x512" href="/favicon.png"><link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">`
- Theme boot script `THEMEJS` sets `data-theme` from `localStorage["fodo-theme"]` (default dark) before CSS loads.
- Static footer list `STATIC_FOOTER` (in the generator) and the JS footer in `js/main.js` (`routes` + footer HTML) must stay in sync when adding a public page.
- `robots.txt` disallows `/api/`, `/admin/`, `/workspace/`, `/fodo-pros/`, `/scripts/`, `/tests/` ...

---

## 8. Design system (do not redesign)

- **Public site:** "FODO Studio" (see `DESIGN-NOTES.md`). Tokens in `css/studio.css`: paper `#FAFAFB` / dark `#101114`, ink `#15161A`, accent `#4C3BCF` (dark `#9C91FF`). Fonts: **Outfit** (display) + **Manrope** (body). Glass "lens" hero, art-directed heroes per page, ink capsule primary buttons, liquid-glass ghost buttons. `theme-glass.css` holds the dark / light variable sets (`html[data-theme]`).
- **Workspace / Pros / Admin:** `css/workspace.css` on the site tokens (`--bg`, `--panel`, `--line`, `--text`, `--muted`, `--signal`). Class prefixes: `ws-*` (shell, cards, rows, pills, tabs, forms, modal, toast), `pb-*` (Build a Team), `tm-*` / `pt-*` (teams), `fn-*` (finance), `pa-*` / `cs-*` (applications, case studies), `mc-*` (Mission Control), `sy-*` (sync).
- Owner Brain: `css/owner-brain.css` (own dark/light, `ob-theme` key). Builder: `website-builder.css` + `wb-studio.css`.
- The v48 redesign (`css/workspace-2.css`, grouped icon sidebar, area accents) was **rejected**. It is not in the repo. Do not bring it back.

---

## 9. Backend architecture

### 9.1 Request handling pattern (`functions/api/biz/[[path]].js` is the model)
- One catch-all per area; `path` segments `p0/p1/p2/path[3]`.
- `accountsOn(env)` gate → `sessionUser(env, request)` (401 with `{ login: true }` when missing).
- **CSRF:** every non-GET needs same-origin (`sameOrigin(request)`) and JSON content type; raw uploads need the custom header `x-fodo-upload: 1`.
- **Rate limits:** `count(env, key, limit, ttlSec)` (KV) returns true when over the limit → 429.
- Roles: `R = await B.rolesOf(env, u)` → `{ roles: [...], pro }`; check with `B.can(R, ["admin", ...])`.
- Errors: throw `err(message, status)`; the catch returns `{ ok: false, reason }` with that status (500 → "Something went wrong, please try again."). Extra fields `missing`, `dup`, `blockers` pass through.
- Success: `ok({...})` → `{ ok: true, ... }`.
- Public (no session) exceptions in biz: `GET roles`, `GET invite?i=`, `GET calendar/<token>.ics`.

### 9.2 Roles
- `client` (everyone signed in), `pro` (has a `biz_pros` row), `owner` (OWNER_EMAILS: also admin, moderator, finance), `admin` (from `acct_admins` role admin: also moderator, finance), `viewer` (acct_admins other role), staff roles from `biz_staff`: `moderator`, `finance`, `viewer` (only owners set staff).
- Money views: admin / finance / viewer. Moderation: admin / moderator. Owner-only: pricing rules, badge rules, commission, staff, act-on-behalf in orgs is the org owner.

### 9.3 Database and migrations

- **v50.2 (hard rule):** dynamic `import()` must use a string literal. A variable path is not bundled by Pages and fails silently at runtime (the Node test shim resolves it, so tests pass while production breaks). `os/db.js SETUPS` is the pattern.
- **v47.6.3:** `js/scene3d.js` must not request a `desynchronized` WebGL context or put `will-change: transform` on the fixed canvas; both blanked the background on GPU-backed Chrome. `/js/*` is `no-cache`, so a JS-only fix needs no page rebuild.
- **v50.1:** `osdb(env)` is the OS set-up (it calls `bdb` first). Any OS reader of marketplace tables beyond `bdb` (quotes, finance, jobs) must call that module's set-up too (see `health()` calling `jdb`). `auditLog()` in biz.js now also writes `os_events` through a dynamic import of `os/audit.js` (biz.js must never import `os/` statically: `os/db.js` imports biz.js).

- `bdb(env)` (biz.js) creates DDL + runs `migrateOnce(d, MIG)` once per isolate. Other modules wrap it: `pdb` (production.js), `qdb` (quotes.js, exported), `fdb` (finance.js), `jdb` (jobs.js), `odb` (orgs.js), `pdb` in payouts.js (exported), `fdb` in files.js. **If a query touches another module's tables, call that module's set-up first** (e.g. mission.js `mdb` = `qdb` + payouts `pdb` + finance `fdb`; calendar.js calls `qdb`). Missing this causes "no such table" 500s on a fresh database.
- `migrateOnce(d, list)` (accounts.js) records each statement hash in `schema_migrations`; ALTERs that already ran are skipped. Add new statements at the END of the module's `MIG` array with a `/* vXX ... */` comment.
- Main table families: `acct_*` (users, sessions, orders, subs, ledger, runs...), `xray_*`, `brain_*`, `site_*` / `sites` (builder), `help_*`, `lab_*`, `mon_*`, `crm_*`, `biz_*` (marketplace and workspace: pros, projects, milestones, quotes, teams, contracts, ledger (append-only triggers), invoices, payouts, applications, case studies, jobs, orgs, cal tokens, files...).

### 9.4 Server libraries (`functions/_lib/`)
| File | Purpose |
|---|---|
| accounts.js | Login (Google, email code, Firebase), sessions, plans/credits, payments, `sendMail` (Resend; logs to `help_mail`), `migrateOnce`, `isOwner`, `nowIso`, `randId`, `count`, `sameOrigin` |
| plans.js | Single source of prices/limits (see 11) |
| biz.js | Workspace core: roles, nav, dashboard, Brand Kit, content/campaigns, FODO Pros profiles/packages/portfolio, market search + scoring, projects + milestones + bookings + reviews + disputes, payouts list, notifications, invites, admin overview, `bdb`, `MIG` |
| projects2.js | Projects 2.0: team projects, tasks, change requests, time, retainers, refunds (state machine `refund_processing`) |
| production.js | Catalog (roles, equipment, templates), `PRICING_DEFAULTS`, `priceIt` (total = subtotal + tax exactly; GST only with `FODO_GSTIN`), `estimate`, `match` (explainable scoring, badges as reasons), builds (drafts) |
| catalog-seed.js | First catalog values (tagged `benchmark_seed`) |
| quotes.js | Numbered `FQ-YYMM-0001`, versioned, immutable once sent; statuses requested/draft/sent/viewed/negotiation/revised/accepted/rejected/expired/cancelled; printable / CSV / WhatsApp summary |
| availability.js | `proFree`, `bookDays` (all-or-nothing, unique index), equipment unit-days |
| teams.js | Team from accepted quote, slots, invitations (48 h), lock, equipment holds, `expireDue` / `remindDue` |
| finance.js | Contracts `CT-`, signing, amendments, cancellation quote, `settle`, Easy Split, ledger, invoices `FI-` / credit notes `CN-`, reconciliation |
| payouts.js | Encrypted payout methods (`PAYOUT_ENC_KEY`), Cashfree Payouts / RazorpayX adapters, status checks |
| proapps.js | Applications pipeline + checks, case studies, badges (`badgeMap`, owner-tuned rules in `biz_settings.badges`), FODO Recommended |
| mission.js | Mission Control, staff search, hiring intelligence, 13 audited CSV exports |
| os/permissions.js | v50.1 FODO OS: permission registry (`resource.action.scope`), 6 scopes, 17 role templates, LEGACY role map, MODULES. **The only file where permission strings may be written** (check.mjs rule 5) |
| os/db.js | `osdb(env)` (runs `bdb` first): `os_*` tables, additive columns on biz tables, seeds (org, 13 departments, templates, owners, legacy staff backfill), `backfillLegacy`, `linkMember`, FTS5 probe, prefs |
| os/authz.js | `principal()`, `allows()`, `authorize()` (deny by default, object-level through `relationOf`), `cleanFor()`, `describe()` |
| os/audit.js | `audit()` structured + scrubbed, `auditList()` (os + biz + brain merged), `emit()` / `on()` event bus with isolated automations, `events()` |
| os/people.js | members, invite, update, status, grants, sessions, offboarding + handoff, departments, roles / Access Builder, registry, directory |
| os/impersonate.js | owner read-only view-as (KV token 30 min, audited, writes refused by both routers) |
| os/nav.js, os/me.js | role-aware navigation groups for staff (clients / Pros unchanged), the `os` block of `/api/biz/me` (never throws) |
| os/tasks.js, os/approvals.js, os/work.js | v50.2 task engine (dependencies, checklist, comments, status, manager approval), approvals + escalation, My FODO, department queues, calendar, workload, deadline reminders |
| os/clients.js, os/projects.js | v50.2 canonical clients (backfill, 360, health formula, pipeline, handover gate); project lifecycle (validated transitions, brief, scope + change requests, deliverables with immutable reviews, risks, daily reports, progress / health / closure formulas) |
| os/support.js, os/command.js | v50.2 support SLA / notes / CSAT / escalation on help_tickets; Command Centre exception feed, Control Tower indicators (snapshots in os_health_log), permission-aware search |
| os/hr.js | v50.3 leave (policy in biz_settings.leave_policy, balances, approvals), reviews, training, skills matrix (os_members.skills), onboarding checklists, capacity heatmap, attendance (off unless biz_settings.attendance_enabled="1"), employee profile |
| os/pros.js | v50.3 Pro lifecycle (biz_pros.lifecycle), passport (computed, snapshot in os_pro_passports, appeals), two-stage matching (hard constraints with reasons, then production.match + passport), booking changes (os_booking_changes, notice window), working hours, team assembly with employees (biz_team_members.user_id / member_kind), Pro workroom |
| js/ws-os.js | the lazy Workspace module for every OS view (`window.FODO_WS_OS.view(name, el, q)`), same ws-* design system; tests check it calls only routes the router has |
| files.js | Private files (R2 `FILES` or KV fallback), type from bytes, versions, multipart (v47.6) |
| jobs.js | D1 job queue (`biz_jobs`), handlers, backoff, dead letter, `runDue`, `enqueueDaily` |
| calendar.js | Token iCal feeds (pro / client / staff) |
| orgs.js | Organizations, members, shared read, `mayAct`, billing profile on quotes / invoices |
| crm.js, studio.js, alerts.js, privacy.js, analytics.js | CRM, AI Studio, notification preferences, DPDP export/delete, admin analytics |
| sites.js, shop.js, sitecfg.js, sitekb.js | Website Builder server (tenant rule), store/blog, fodo.co.in settings, bot site knowledge |
| xray-core.js, bg.js, aivis.js, monitor.js, gsc.js, products.js, usage.js, config.js, prompts.js | Growth Lab / X-Ray engine and tools |
| help.js, help-admin.js, helpkb.js | Help desk |
| brain/* | Owner Brain |

### 9.5 Workspace front end (`js/workspace.js`)
- One IIFE; `MODE` = "pro" when `<body data-mode="pro">` (the `/fodo-pros/` shell), else client.
- Navigation comes from the server (`GET /api/biz/me` → `nav`). Views are `VIEWS[name](el, q)`; hash routing `#view?query`, plus `#project=ID`, `#quote=ID`, `#contract=ID`.
- **Lazy modules** load through `lazy(src)` and use `window.FODO_WS = { api, act, esc, inr, day, toast, modal, fd, empty, head, fail, $, $$, me, lazy }`:
  `ws-builder.js` (Build a Team, quotes), `ws-market-admin.js` (admin quotes + catalog), `ws-teams.js` (Pro invitations, availability rules, admin teams, equipment), `ws-finance.js` (contracts, settlements, ledger, invoices, reconciliation), `ws-proapps.js` (apply, case studies, admin applications/badges), `ws-mission.js` (Mission Control), `ws-sync.js` (multipart upload, calendar box, organization, admin jobs).
- Admin tabs: mission, analytics, quotes, teams, finance, catalog, applications, pros, invites, payouts, disputes, settings.
- **Always escape** user data with `esc()` when building HTML strings. Use `act(button, path, body, done)` for writes (prevents double submit, shows errors).

---

## 10. Product areas (one paragraph each)

- **Growth Lab / Business X-Ray:** enter a website → crawl + market research + competitors → score, biggest problem / opportunity, 30-day plan, evidence for every finding. Background runs, monitoring, Pro tools, AI visibility. Docs: `docs/BUSINESS-XRAY.md`, `docs/GROWTH-LAB-V17.md`.
- **Website Builder:** AI website creation from 214 templates, visual editor (desktop/tablet/mobile), store, blog, forms, versions, share/approve, audit, publishing to `sites.fodo.co.in` / custom domains. Docs: `docs/website-builder-*.md`, `docs/tenant-security.md`.
- **Owner Brain (`/owner-brain/`):** owner-only AI command centre with voice ("Hey FODO"), ~100 tools (74 level 0, 23 level 1, 9 level 2), memory, Google / social connectors, Website Engineer (opens PRs). Docs: `docs/OWNER-BRAIN*.md`, `docs/brain-v34.md`.
- **Workspace (`/workspace/`):** client Business OS + Marketplace admin. **FODO Pros (`/fodo-pros/`):** professional portal (profile, team invitations, requests, calendar + availability rules, earnings, reviews).
- **Marketplace flow:** client builds a team → requests a quote → FODO sends a versioned quote → client accepts → a team is created and staffed with FODO Pros (invitations) → locked → contract generated, sent, signed (typed name) → project opens with the payment plan → milestones funded (held) → work approved → settlement splits it → payouts → ledger, invoice, reconciliation.

---

## 11. Plans and prices (`functions/_lib/plans.js`, INR)

- Growth Lab: Free ₹0 (2 X-Rays lifetime), Starter ₹499/mo (10), Growth ₹1,499/mo (30), Pro ₹3,999/mo (80), Agency ₹9,999/mo (250).
- X-Ray packs: 5 for ₹299, 20 for ₹999, 60 for ₹2,499 (never expire).
- Website Builder: Builder Free ₹0 (1 site), Website Builder ₹299 (3 sites, 1 domain), Builder Business ₹799 (10 sites, 5 domains).
- Marketplace commission default 10 % (owner setting). Admin can override some prices through `lab_config` without a deploy.
- **Change prices only in `plans.js`** (or the admin config), never in page text.

---

## 12. Environment variables (Cloudflare → fodo-website → Settings → Variables and Secrets)

After adding or changing one: Deployments → latest → Retry deployment.

- **Core:** `ACCOUNTS_ENABLED`=1, `RESEND_API_KEY`, `MAIL_FROM`, `SUPPORT_EMAIL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CRON_KEY` (16+ chars, also GitHub `FODO_CRON_KEY`), `SITES_SECRET_KEY` (never change once set; same in fodo-sites), `FODO_GSTIN` (only after GST registration), `SITE_URL` / `SITE_ORIGIN`, `ALLOWED_ORIGINS`, `TRAFFIC_SALT`, `STATS_TOKEN`.
- **Firebase login:** `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID` (fodo-513118), `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROVIDERS`.
- **AI / search:** `GROQ_API_KEY`, `GEMINI_API_KEY` (+ `GEMINI_MODEL`, `GEMINI_SEARCH_MODEL`, `GEMINI_CODE_MODEL`, `GEMINI_LIVE_MODEL`), `OPENAI_API_KEY`, `LLM_MODELS`, `SERPER_API_KEY`, `BRAVE_API_KEY`, `GEOAPIFY_KEY`, `GOOGLE_PLACES_KEY`, `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD`, `OPR_API_KEY`, `PAGESPEED_API_KEY`, `REALTIME_VOICE`, `REALTIME_MODEL`.
- **Payments:** `PAYMENT_PROVIDER` (razorpay | cashfree), `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV` (sandbox | production), `CASHFREE_API_VERSION`, `CASHFREE_SUBSCRIPTIONS`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `PAY_TEST`.
- **Payouts:** `PAYOUT_ENC_KEY` (never change), `CASHFREE_PAYOUTS_ON`, `CASHFREE_PAYOUT_CLIENT_ID`, `CASHFREE_PAYOUT_CLIENT_SECRET`, `CASHFREE_PAYOUT_API_VERSION`, `RAZORPAYX_ON`, `RAZORPAYX_ACCOUNT`, `CASHFREE_SPLIT_ON` (Easy Split).
- **Builder / sites:** `SITES_HOST` (sites.fodo.co.in), `SITES_PROJECT` (fodo-sites), `CF_API_TOKEN`, `CF_ACCOUNT_ID`.
- **Brain / GitHub / social:** `BRAIN_ENABLED`, `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH`, `PAGES_PROJECT`, `GH_TOKEN`, `GH_REPO`, `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_ORG_APPROVED`, `LINKEDIN_VERSION`, `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_LONG_POSTS`, `WA_TOKEN`, `WA_PHONE_ID`, `WA_APP_SECRET`, `WA_VERIFY_TOKEN`, `WA_NUMBER`, `GSC_ENC_KEY`.
- **Runner / email inbound:** `RUNNER_URL`, `RUNNER_KEY`, `RESEND_WEBHOOK_SECRET`.
- **Limits / switches:** `XRAY_PER_HOUR`, `XRAY_PER_DAY`, `SEARCH_DAILY_CAP`, `BRAVE_DAILY_CAP`, `MONITOR_BATCH`, `VOICE_*`, `RATE_PER_MIN`, `RATE_PER_HOUR`, `DAILY_PER_IP`, `*_PER_HOUR`, `BOT_AI_DISABLED`, `VOICE_DISABLED`, `USD_INR`, `COST_USD_JSON`.
- **Test only (never in production):** `XRAY_TEST_MODE`, `XRAY_TEST_MAP`, `XRAY_TEST_AI`, `API_DEBUG`.
- **Bindings (wrangler.toml, not variables):** `XRAY_DB`, `CHAT_KV`, `AI`, optional `FILES`, `MEDIA`, `JOBS`, `BROWSER`, `ASSETS`.

---

## 13. Testing (run before every delivery)

- Tooling lives in `tests/` (`npm run setup` once: `npm --prefix tests install` + Playwright Chromium). Never deployed.
- **Full suite:** `node tests/run.mjs` (≈30 min; groups: unit, integration, store, builder, brain, xray, security, e2e, all). Set `NM=$PWD/tests/node_modules WRANGLER=$PWD/tests/node_modules/.bin/wrangler NODE_PATH=$PWD/tests/node_modules`.
- **Last full result (v47.6): 4,514 checks passed, 0 failed.** Suites v47 (136), v472 (74), v473 (77), v474 (124), v475 (58), v476 (100).
- Single suite: `node --no-warnings tests/v476.test.mjs` (run from the repo root).
- **Unit/integration harness pattern** (copy the head of `tests/v476.test.mjs`): `node:sqlite` in-memory database wrapped as a D1 shim, handlers imported directly (`functions/api/biz/[[path]].js` etc.), `call()` builds real `Request`s with cookies per user, `login(email)` via `/api/account/test-login` (only in `XRAY_TEST_MODE`), `Z(path, body, who)` shortcut, `fetch` mocked for providers.
- **Register new suites** in `tests/run.mjs` in the BUILDER, SECURITY and INTEGRATION lists.
- **Runtime e2e** suites start `wrangler pages dev` on port 8788 via `tests/xray-fixtures/run-local.sh`. Known flaky when run in the full suite (pass when run alone): `xray-e2e`, `v17-e2e`, `v19-e2e`, `v8-finder`. Rerun alone before calling it a failure: `node tests/run.mjs xray`, `node tests/v19-e2e.test.js`.
- **Static checks:** `node scripts/check.mjs` (parse every JS file, no "worker" / long dash in marketplace files, no key patterns in `js/`; v50.1: every `/api/os` route declares a permission, no permission string outside `functions/_lib/os/`).
- **v50.1 suite:** `tests/v501.test.mjs` (119 checks: permission matrix, People & Access, view-as, events, kill switch, owner access). Visual script pattern for OS screens: log in several people through `test-login`, call `/api/os/me` once per person so the member row links, then screenshot.
- **Syntax check one file:** copy to a `.mjs` and `node --check`.
- **Visual check:** Playwright against the local runtime (log in through `/api/account/test-login`, screenshot desktop 1440 px and phone 390 px, assert `scrollWidth - innerWidth === 0`). Look at the screenshots before delivering.

---

## 14. Coding conventions and known traps

- **Never append a `// comment` in the middle of a line when replacing code.** It has swallowed the rest of the line twice (broke v44 pro dashboard slots, and a v47.3 amendment variable). Use `/* ... */` for inline comments.
- When patching with a script, **assert the old text occurs exactly once** before replacing; heredocs can turn `\uFEFF` into a real BOM and quotes can split across lines.
- Never remove `fodo/*.png` when zipping (favicons).
- Use `/* */` comments and keep the existing dense one-line style of the files; do not reformat whole files.
- `process.env` does not exist in Cloudflare Functions: never use it in `functions/` (it caused a 500 in a debug line once).
- **Smoothness rules (v47.6.2):** never read layout (`offsetHeight`, `scrollHeight`, `getBoundingClientRect`) inside a scroll handler or animation frame (measure on load / resize / ResizeObserver); write a style in a frame only when the value changed; looping CSS / SVG animations belong inside a `main > section` so `fx.js` can pause them off screen (`data-fx-off` attribute, never a class: tests compare class names); the header row is full when signed in, so any new header item must be tested signed in at 1024, 1280 and 1440 px.
- New tables: add DDL to the owning module's set-up and make cross-module readers call that set-up (see 9.3).
- Every list query has a `LIMIT`. Every write checks ownership / role on the server. Use `INSERT ... WHERE status=?` style guarded updates for state machines (no double transitions).
- Money: integers in rupees; totals must add up exactly (last line gets the rounding remainder). Ledger is append-only (DB triggers). Payout `via_split` can never be paid again by hand.
- CSV exports neutralise cells starting with `= + - @`.
- Emails go through `sendMail` (fails gracefully without `RESEND_API_KEY` and logs "not sent").
- Notifications: `notify(env, userId, kind, text, link)` (also emails per the person's preferences).
- Audit important staff actions with `auditLog(env, actorEmail, action, target, detail)`.
- Keep user-facing copy honest and plain English in the product; Hinglish only in replies to Rohit and in his checklist PDFs.

---

## 15. Version history (short)

v5 to v12 public site, finder, SEO, brand · v13 accounts and payments · v17 to v20 Growth Lab, background X-Ray, help desk · v21 to v27 Owner Brain (memory, social, voice, live, engineer), Razorpay · v28 to v39 Website Builder (store, security, sites project, performance) · v40 Business OS + FODO Pros · v41 to v42 builder upgrades · v43 private files · v44 Projects 2.0 · v45 CRM + AI Studio · v46.1 notifications, privacy, analytics · v46.2 payouts, builder lag fix, CSP, cross-browser CI · v46.2.1 / v46.2.2 favicon (dark F + purple dot) · v47.1 to v47.6 marketplace programme (see 6) · v48 redesign rejected.

Each version has a report in `docs/` (e.g. `docs/FODO-V47.6-REPORT.md`) with exact behaviour, API endpoints, tables and tests. **Read the relevant report before changing a feature.**

---

## 16. First steps for a new Claude session

1. Read this file, then `README.md`, then the docs for the area you will touch.
2. Make sure you have the latest code (ask Rohit for the newest `FODO-github-update-v*.zip` or the GitHub repo). `VERSION` must say v47.6.1 or later.
3. `npm run setup` (once), `python3 scripts/build_pages.py`, `node scripts/check.mjs`, then run the suites for the area you will change. Everything should pass before you start.
4. Make the change additively, add or extend a `tests/vXX.test.mjs`, run the full suite, do a visual check, update `VERSION` and write `docs/FODO-VXX-REPORT.md`.
5. Deliver the zip + Hinglish summary + English commit block (section 3).
