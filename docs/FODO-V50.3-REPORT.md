# FODO v50.3 report: OS Phase 3 (People + Pros)

Phase 3 of `docs/FODO-OS-V4-IMPLEMENTATION-PLAN.md`. Design unchanged (ws-* system). OS work is paused after this release until the owner says otherwise; Phases 4 to 8 are not built.

## HR (`functions/_lib/os/hr.js`, routes `/api/os/hr/*`, view `#hr`)
| Area | What it does | Honest limits |
| --- | --- | --- |
| Leave | Policy per year (owner sets casual / sick / earned; default 12 / 8 / 15), balances (used, pending, left), requests go to the manager (HR or owner fallback), approve / reject (note required) / cancel, overlap and balance checks, half days, Sundays excluded | Public holidays are not modelled yet |
| Reviews | Manager opens (kind, period, goals) → self-assessment → manager text + rating 1 to 5 → complete (read only after) | No calibration across teams |
| Training | Assigned or self-recorded, kinds, due dates, certificate link, cost | No provider integration |
| Skills matrix | Levels 1 to 5 on `os_members.skills`; matrix shows people per skill, average, experts, gaps | Self-declared |
| Onboarding | Default 7-item checklist (or custom), ticks with who / when, auto-complete; offboarding checklist too (handoff itself is Phase 1 `people/<id>/offboard`) | |
| Capacity | Weeks × people heatmap: task estimates due in the week vs weekly hours minus approved leave; levels low / ok / high / over | Estimates default to 60 min per task |
| Attendance | Off by default; owner switch; check in / out from the Workspace | No device or geo check |

Permission resource `hr`: view own (everyone), team (managers, via MANAGER), department, organization (HR / Talent Manager); manage team+. Module switch `hr`.

## FODO Pros in the OS (`functions/_lib/os/pros.js`, routes `/api/os/pros/*`, `teams/<id>/assembly`, views `#os-pros`, `#workroom`)
- **Lifecycle** on `biz_pros.lifecycle`: active, paused, suspended (organisation-wide Pro access), alumni; reason required, audited, Pro notified. Non-active Pros fail stage 1 of matching.
- **Passport**: on-time delivery, completed projects, repeat clients, rating, invitation reliability, disputes, verified projects, each with basis and formula; score only with enough history ("insufficient data" otherwise); previous snapshot kept; appeal flow (one open at a time, decided with a note the Pro sees).
- **Two-stage matching**: stage 1 hard constraints (lifecycle, mode, location, required skills, languages, budget × 1.5, availability) with the reason every eliminated Pro failed; stage 2 the existing explained marketplace ranking plus passport factors. Fees shown only with finance.view or production.manage.
- **Booking changes**: Pros request reschedule / cancel (operations confirms), staff change directly (all-or-nothing booking); the notice window marks late changes; every change recorded in `os_booking_changes`.
- **Working hours** on the Pro's rules (`biz_pros.hours_from/to`).
- **Team assembly with employees**: open slots suggest employees whose skills match the role (with task and leave warnings in the window); assign directly as accepted (`biz_team_members.user_id`, `member_kind='employee'`); Pros still go through the invite flow on the team page.
- **Workroom** for Pros: projects, tasks, deliverables, bookings (move / cancel), invitations, change history; nav entry "Workroom" for Pros.
- `pro.view` gains the `own` scope (a Pro reads only their own passport); `relationOf` knows `pro` targets.

## Also in this release
- v47.6.3 background fix: `js/scene3d.js` no longer asks for a `desynchronized` WebGL context nor sets `will-change: transform` on the canvas (both blanked the particle background on GPU-backed Chrome). Context-loss handler restores the plain background.
- `tests/v476.test.mjs` job-kinds expectation updated for the OS jobs.

## Tests
`tests/v503.test.mjs` 104 checks (registry + navigation, leave, reviews, training, skills, checklists, profile, capacity, attendance, Pro list / lifecycle / passport / appeals, two-stage matching, booking changes, hours, assembly, workroom, router hygiene, UI wiring). v501 119, v502 123, v476 100. Visual: 15 screenshots desktop + 390 px, zero console errors.
