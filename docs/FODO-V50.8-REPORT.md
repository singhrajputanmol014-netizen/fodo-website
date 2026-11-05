# FODO v50.8 report: OS Phase 8 (Hardening + release)

Phase 8 of `docs/FODO-OS-V4-IMPLEMENTATION-PLAN.md`, the last phase. No visual redesign; one new owner / developer page
(Monitoring, Platform group) in the existing ws-* design.

## What changed
| Area | What | Result |
| --- | --- | --- |
| Security matrix | `tests/v508.test.mjs` calls every `/api/os` GET route as 11 people (owner, operations, PM, designer, finance, HR, social, creative director, viewer, developer, client) and every POST route as five people who lack its permission | Every call without the route's permission answers 403 and leaves no audit row; no route answers 5xx; no secret value appears in any response; no API key in the code |
| Negative cases | no session, cross-origin write, non-JSON write, colleague outside the team, another client's project and tasks, view-as writes, suspended member, test-login with test mode off | all refused |
| Scale | 200 people, 10,000 projects, 50,000 tasks seeded; the busiest screens timed | see the table below |
| Missing indexes | found by the scale test: `biz_tasks(project_id, status)`, `biz_tasks(created_by)`, `os_members(manager_user_id)`, `os_team_members(user_id)`, `biz_milestones(project_id)`, `os_teams(project_id)` | project list 2,737 → 9 ms, Command Centre 7,413 → 57 ms; query plans checked in the suite |
| Faster first request | role permissions are written in multi-row batches (was one row per statement) | a fresh database no longer times out the browser suites (found in v50.7) |
| Enforced CSP on the public site (audit S6) | the inline scripts of all 104 public pages moved to `js/boot.js`, `js/boot-intro.js`, `js/boot-tail.js`, `js/page-thanks.js`, `js/page-account.js`; two inline handlers removed; every page carries an enforced policy without `'unsafe-inline'` for scripts; blocked loads are reported to `/api/csp-report` | `tests/v508-csp.test.js`: 104 routes, no violations, no page errors; an injected inline script does not run and is reported |
| Backup / restore | `scripts/backup.mjs` (export, manifest, verify, rehearse) + `docs/BACKUP-RESTORE.md` | rehearsed locally, see below |
| Monitoring | Workspace → Monitoring: server errors (the router now counts every 5xx per route and day, message scrubbed), jobs, blocked loads, data size, access, AI, last backup, what needs attention | real data only |
| Found by the tests while enforcing the policy | (1) the old report-only policy was incomplete: it never listed `www.wikidata.org`, the three Overpass map servers, `api.openai.com` (voice), the Firebase / Google sign-in hosts or the payment-provider wildcards, so enforcing it as it was broke the Competitor Finder map searches in the tests and would have blocked voice chat; the accounts suite also stopped at the owner X-Ray until the policy was widened (it then passed 75/75 with no violation logged; which missing source caused that stop was not pinned down): the public policy is now the union of the old one and the policy the app pages already enforce, and one string in `scripts/build_pages.py` feeds both the header and the page tag; (2) moving the chatbot loader into a file first leaked its file list as a global `L`, which hid Leaflet and broke the competitor map: fixed, and the CSP suite now fails on leaked globals | Competitor Finder, maps and voice keep working (v8-finder, v11-finder, v12-brand pass) |
| Browser matrix | `fodo-browsers.yml` now also runs the CSP test in Chromium, Firefox and WebKit on GitHub | here only Chromium is installed |
| Release | `docs/RELEASE-CHECKLIST.md`, `.gitignore` for `backups/` and test outputs | |

## Scale timings (D1 shim, 10,000 projects / 50,000 tasks)
| Screen / job | ms | budget |
| --- | ---: | ---: |
| Owner task list | 20 | 1,500 |
| Staff member: my tasks | 35 | 800 |
| Team lead: team tasks | 32 | 1,500 |
| Owner project list | 9 | 2,500 |
| Staff member: My FODO | 535 | 1,500 |
| Owner Command Centre | 57 | 3,000 |
| Owner workload | 70 | 3,000 |
| Daily problem scan | 393 | 8,000 |
These are local SQLite timings; production D1 adds network time per query, so they show the query plans are sane, not the real
response times. My FODO is the slowest screen and the first to look at if the team grows.

## Backup rehearsal
| Where | Tables | Rows | Result |
| --- | ---: | ---: | --- |
| Local Cloudflare runtime | 124 | 2,461 | identical after restore, integrity ok |
| Full test database | 164 | 67,549 | identical after restore, integrity ok |
Not done here: export from the production account (no Cloudflare access in this environment). The checklist makes the first
production export + verify the owner's first step after the release.

## Still open (honest list)
- Legal review of the privacy notice, response time, retention periods, contract / NDA templates and the legal pages.
- Firefox and WebKit runs happen on GitHub only.
- WhatsApp and e-sign stay "not configured" until their credentials and a provider are chosen.
- App pages (Workspace, Admin, Brain, Builder) keep their own header policies with `'unsafe-inline'`; only the public site was
  in scope for S6.

## Tests
One full run after the last change (`node tests/run.mjs`): **5,415 passed, 0 failed, 80 suites**. New: `tests/v508.test.mjs` (52), `tests/v508-csp.test.js` (15, runtime, Chromium).
Earlier full runs during this phase failed and led to the fixes above (incomplete policy sources, the leaked `L` global); the final run is the only one reported as the result.
Browser matrix: Chromium here; Firefox and WebKit are not installed in this environment and run in GitHub Actions (`fodo-browsers.yml`) only.

Tests changed to follow the move (none deleted, none skipped):
- v35, v36, v37 read the chatbot loader from `js/boot-tail.js` (it is no longer inline in the page) and check the page loads that file.
- v13 accounts: its stand-in payment SDK used to call the local fixture server straight from the page, which the enforced policy now blocks (as it should); the stand-in now calls `sdk.cashfree.com`, and the test forwards that call to the fixture server.
