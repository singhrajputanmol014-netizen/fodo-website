# FODO OS release checklist (v50.8)

Tick every line before telling the team FODO OS is live. "Owner" = anmol@fodo.co.in or singhrajputanmol014@gmail.com.

## 1. Before you push
- [ ] Full test run on your computer or in GitHub Actions (`node tests/run.mjs`): 0 failed. A runtime suite that fails once may
      be rerun alone; write down which one and the result of the rerun. Never delete or skip a failing test.
- [ ] `node scripts/check.mjs` says OK. `python3 scripts/build_pages.py` has been run (the HTML in the zip is the built HTML).
- [ ] `VERSION` says the version you are releasing.

## 2. Cloudflare settings (Pages → fodo-website → Settings)
- [ ] `XRAY_TEST_MODE` is **not** set in Production (test-login is closed without it; Monitoring shows "Test mode is ON" if it is).
- [ ] `API_DEBUG` is not set in Production.
- [ ] Secrets present for what you use, and nothing else: `RESEND_API_KEY` + `MAIL_FROM` (mail), payment keys, `PAYOUT_ENC_KEY`,
      `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (Brain connector, Gmail inbox). Optional: `WA_*` (WhatsApp), `ESIGN_PROVIDER` +
      `ESIGN_API_KEY` (e-sign), `FILES` R2 binding (large videos), `JOBS` queue. Missing ones show "not configured", never fake.
- [ ] Bindings: `XRAY_DB` (D1), `CHAT_KV` (KV), `AI` (Workers AI).
- [ ] The GitHub Actions workflows **FODO Brain** (hourly; it calls `/api/monitor/jobs`, which queues `os_hourly` and runs the
      job queue) and **FODO Monitor** (daily) are enabled, with their repository secrets set. Within a day Monitoring shows
      `os_hourly` and `os_daily` with a recent "last success".

## 3. Right after the deploy
- [ ] Open https://www.fodo.co.in/ in a private window: the page loads, the theme is dark, "Ask FODO" appears, no console errors.
- [ ] Sign in as an owner → Workspace → **Monitoring**: database ok, test mode off, no server errors.
- [ ] People & Access: every team member has the right role. Roles that existed before are upgraded automatically with the new
      permissions (once); check one designer and one manager with **View as**.
- [ ] Take the first backup (`docs/BACKUP-RESTORE.md`, weekly backup steps 1 to 6) and record it in Monitoring.

## 4. Legal and content (before you claim anything)
- [ ] A lawyer has reviewed: privacy notice (Privacy desk → Privacy notice), response time for rights requests, retention rules,
      every contract / NDA template, the legal pages (they still say "DRAFT: review by a qualified lawyer").
- [ ] Only then: publish the notice, record the template reviews, remove the DRAFT notes from the legal pages.
- [ ] A grievance officer is named (Privacy desk → Settings) and holds the Privacy permission.
- [ ] An incident-response and a continuity procedure exist under Knowledge (kind: Procedure) and are signed off by an owner.

## 5. First week
- [ ] Monitoring every day: server errors, jobs, blocked script loads (a new marketing tag that inserts an inline script is
      blocked on purpose by the enforced policy; move it to a file or tell the developer).
- [ ] Problems page: nothing critical left open without an owner.
- [ ] One restore rehearsal from the weekly export (`node scripts/backup.mjs verify <file>`).

## Rollback
GitHub Desktop → History → right-click the release commit → Revert → Push. Cloudflare redeploys the previous code. Database
changes in FODO OS are additive only (new tables and columns), so the previous version keeps working on the newer database.
