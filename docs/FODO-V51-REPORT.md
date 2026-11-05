# FODO v51.0 report: production hardening after Phase 8

Scope agreed with the owner: the items that matter, not the full "v51 master prompt" (which also asked for a visual redesign,
animations and 13 new documents; the redesign is deferred until the owner approves screenshots, the documents are replaced by two
manuals and this report). No visual change to the Workspace; one new team screen (Assets) in the existing ws-* design.

## 1. Strict Content-Security-Policy on the app pages (audit S6, second half)
| Page | Before | Now |
| --- | --- | --- |
| /workspace/*, /fodo-pros/* | header policy allowed inline scripts | `script-src` without `'unsafe-inline'`; the theme script moved to `js/boot-theme.js`; the one inline `onclick` in `workspace.js` is a listener |
| /admin/* | no policy at all | the same strict policy, plus the existing X-Frame-Options |
| /owner-brain/* | strict since v23 | unchanged |
| /website-builder/* | allows inline scripts | unchanged, on purpose: previews are `srcdoc` iframes, which inherit the page policy, and the rendered sites contain inline scripts. Documented in `scripts/build_pages.py` |
`tests/v51-csp.test.js` (18 checks): the shells and 19 app scripts carry no inline script or handler; 145 Workspace views across an owner, an employee, a manager, a client and a FODO Pro, plus Admin and FODO Pros, open with zero policy violations and zero page errors; an injected inline script does not run; the Builder preview still renders. Runs in `fodo-browsers.yml` too.

## 2. Business journey tests (`tests/v51-journeys.test.mjs`, 83 checks)
One record travels across modules and every screen that shows it must agree:
- **A. client → project → invoice → payment**: Client 360, receivables, finance overview, Command Centre, profitability, cash book, problems, Assistant: the same ₹45,000, then ₹25,000, then ₹0.
- **B. expense → approval → reimbursement → budget → leakage**: the budget warning at claim time, the over-budget state, payables, profitability margin, the leakage rule, the Problems rule, the Command Centre expense total.
- **C. content → client approval → campaign → budget approval → results → report → client**: the same post and the same 60 leads on the board, in the client's inbox, in the report the client reads.
- **D. purchase → order → delivery → bill → payables → forecast → paid**: one row per record everywhere.
- **E. Owner Brain provenance** (below). **F. Assets** (below).

Bugs the journeys found and fixed:
| Where | Bug | Fix |
| --- | --- | --- |
| Command Centre | the overdue-invoice line divided rupees by 100 (₹45,000 showed as ₹450) | removed the division; totals are whole rupees |
| Client 360 | content and campaign activity never appeared in the client's activity feed | the feed now includes growth events |
| Marketplace | a client project request without a professional answered 500 | a clear 400 "Pick the professional you want to hire." |
| Workspace | opening `#project?id=` with a missing or wrong id threw a page error | a friendly "No project was chosen" / "Project not found" |
| Assets (new) | a reminder query bound a value with no placeholder | caught by the test before release |

## 3. Owner Brain: records vs advice
Every FODO OS tool result now carries `_source` ("FODO OS · Finance (live database records)", or "… (simulation, not a record)") and `_as_of`. The Brain's instructions tell it to cite the screen and time for money, work, people and risks, to start any suggestion with "My suggestion:" / "Mera suggestion:", to call a simulation a what-if, and to say when a number is not in its data instead of guessing. The answer's "Based on" line on the Brain page now reads "FODO OS · Finance at 10:42". Brain suites v21, v22, v23 and v506 unchanged and passing.

## 4. Gaps check (honest status)
| Asked | Status |
| --- | --- |
| Attendance | Exists since v50.3 (HR), off by default; an owner switches it on under HR → Settings |
| Training | Exists since v50.3 (HR → Training), with skills and onboarding checklists |
| CRM deal stages | Exist (lead, qualified, proposal sent, negotiation, won, lost) in each client's own CRM; the Command Centre's sales card reads the team's deals. FODO's own sales pipeline is that CRM used by sales staff; there is no separate "agency pipeline" module |
| Asset assignment | **Was missing** (only the rental catalogue existed). Built in v51: Assets register |

**Assets** (Operations): tag FA-0001…, serial, cost, vendor, warranty, condition, location, holder, status (available, in use, repair, lost, retired), maintenance date, link to the rental catalogue entry; hand over, take back, send for repair, back in service, mark lost, retire; full history; reminders to operations for maintenance due in 7 days and warranties ending in 30 days; team members see only what is with them (`equipment.view.own`, added to every employee template and to existing roles by the template sync). Card and account numbers refused in notes.

## 5. Manuals
Two documents were written for the team (as editable docs in the owner's Claude account): **FODO OS Owner Manual** (10 sections: getting in, the daily loop, People & Access, work and clients, money, growth, knowledge / documents / assets / inbox, automation and AI, risk / privacy / backups, troubleshooting) and **FODO OS Employee Manual** (8 sections). They describe the product as it is in v51, with its limits.

## Not done, on purpose
- Visual redesign, light-theme polish, background animations and page transitions: the owner rejected the v48 redesign; any design change is shown as screenshots first and done as its own step after approval.
- The 13 new documentation files of the master prompt: the existing `docs/FODO-OS-V4-*.md`, the phase reports, `RELEASE-CHECKLIST.md`, `BACKUP-RESTORE.md`, `CLAUDE.md` and the two manuals cover the same ground without a second copy to keep in sync.
- Production go-live steps (R2 bucket, `XRAY_TEST_MODE` off, first production backup, cron secrets): they need the owner in the Cloudflare and GitHub dashboards; `docs/RELEASE-CHECKLIST.md` lists them.
- Firefox and WebKit: GitHub Actions only.

## Tests
Full run after the last change (`node tests/run.mjs`, one run): **5,516 passed, 0 failed, 82 suites**. New: `tests/v51-journeys.test.mjs` (83), `tests/v51-csp.test.js` (18, runtime, Chromium).
The run before it (the first full run of v51) ended 5,440 passed, 2 failed: `v508` (its VERSION check expected "v50.x"; widened to v50/v51) and `v13-accounts-e2e` (TimeoutError before its first check, as in v50.7; run alone it passed 75/75 with no policy violation logged). The accounts suite now warms the cold runtime with plain requests before the browser's first navigation; in the final run it passed in sequence (75/75, 93 s). No test was deleted or skipped.
Visual check: `vis70` screenshots of the Assets screen (operations list, asset detail with history, employee view, mobile), zero console errors.
Browser matrix: Chromium here; Firefox and WebKit run in GitHub Actions (`fodo-browsers.yml`) only.
