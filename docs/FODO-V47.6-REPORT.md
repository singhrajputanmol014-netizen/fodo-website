# FODO v47.6: large uploads, background jobs, calendar sync, organizations, CI

The last phase of V47. Four pieces of plumbing that the marketplace needed, plus continuous integration.

## 1. Large uploads (R2 multipart)

**When:** the private R2 bucket is bound as `FILES`. Without it, the honest message appears and small uploads (to 10 MB) keep working as before.

**How it works:**
- Files over 10 MB go up in **8 MB parts**, three at a time, each part retried up to 3 times. Files up to **1 GB**.
- The permission and quota checks are the same as for a normal upload, run at the start **and again at completion**.
- **Part 1 decides the type** from its bytes (same sniffing as before). HTML, SVG, scripts: refused at once and the R2 upload aborted.
- Parts can arrive in any order; re-sending a part replaces it. Open uploads are listed with the parts already received, so an interrupted upload can resume.
- Completion checks every part is there and the byte count matches the declared size, then the parts become **one file record** (same id as the upload, no copy).
- Uploads nobody finishes expire after 24 h and are aborted by the housekeeping job, so R2 holds nothing half-done.
- At most 5 open uploads per person.

**API:** `POST files/multipart {name, size, project…}` · `PUT files/multipart/<id>/part?n=` (raw bytes, same upload header) · `POST files/multipart/<id>/complete` · `POST files/multipart/<id>/abort` · `GET files/multipart`.

## 2. Background jobs

A small queue in D1 (`biz_jobs`) that **never drops work silently**:
- A job runs once per attempt (a lock row). Failure → retry with backoff (1 min, 5 min, 15 min, 1 h, 2 h). After 5 attempts it is **dead** and written to the audit log.
- Keyed jobs run once (e.g. the daily housekeeping is queued once per day, whatever happens).
- A run stuck for 10+ minutes (a crashed request) is released and retried.

**Job kinds:** `mail` · `notify` · `upload_sweep` · `team_housekeeping` (expire invitations, reminders) · `refund_check` · `payout_check` · `webhook` (https only).

**Who runs them:**
- `POST /api/monitor/jobs` (cron key) runs up to 25 due jobs. The hourly GitHub workflow calls it (`fodo-brain.yml`).
- The daily `/api/monitor/tick` queues the housekeeping jobs once and runs what is due.
- **Optional Cloudflare Queue:** bind `JOBS` (wrangler.toml) and `enqueue()` also sends the job there for a consumer Worker that calls `runJob()`. The D1 row stays the truth either way.

**Admin:** Mission Control → **Jobs**: counts per state, each job's kind, attempts, error and result; **Run due jobs now** and **Retry** (admins).

## 3. Calendar sync (iCalendar feeds)

**Where:** FODO Pros → Calendar; Workspace → Settings; Mission Control → Calendar (staff).

- A **private feed URL** with a 40-character token. Subscribe once in Google Calendar, Apple Calendar or Outlook; it refreshes itself (1 h hint). No session needed, so the link is the credential: **Regenerate** kills the old URL, **Switch off** stops it. Both are audited; the last fetch time is shown.
- **FODO Pro feed:** booked days (project title only, never the client's price), accepted team dates (tentative until locked), blackout days, reminders.
- **Client feed:** project days, shoot dates, milestone due dates, quote expiry dates. No money.
- **Staff feed:** every team date with confirmed/total, invitation deadlines.
- Valid RFC 5545: folded lines, India timezone block, stable UIDs (an update changes the event, not a duplicate).

**API:** `GET /api/biz/calendar/<token>.ics` (no session, rate-limited) · `GET/POST calendar/link?kind=pro|client|staff` · `POST calendar/revoke`.

## 4. Organizations

**Where:** Workspace → Settings → Organization.

- One person creates the organization (owner) and invites colleagues by email (they log in with that email and accept). Roles: owner, admin, member. One organization per person, up to 50 people.
- **Sharing means reading:** members see each other's quotes, contracts, invoices and projects (the Quotes page lists them; each record checks again when opened). Accepting, signing, paying and messaging stay with the record's owner.
- **Act on behalf (off by default, owner switches it, audited):** the owner and admins may accept a quote or sign a contract for a colleague. The quote and the audit log record **who** did it.
- **Billing profile:** legal name, GSTIN (validated) and address go on new quotes, printable quotes, contracts and invoices of every member.
- Owner can change roles, transfer ownership (must, before leaving), remove people. The last person leaving deletes the organization. Outsiders see nothing (isolation checked in tests).

**API:** `GET org` · `POST org` · `org/settings` · `org/invite` · `org/answer` · `org/member` · `org/transfer` · `org/leave` · `GET org/shared`.

## 5. CI

- **`.github/workflows/fodo-tests.yml`:** on every push and pull request to main: static checks, a clean static-page rebuild, then `tests/run.mjs integration` and `tests/run.mjs e2e` (Chromium). No secrets.
- **`scripts/check.mjs`** (also by hand): every JS file parses; no "worker" and no long dash in the marketplace modules and pages; no API-key patterns in `js/`.

## 6. Database (additive)

`biz_file_uploads`, `biz_jobs`, `biz_cal_tokens`, `biz_orgs`, `biz_org_members`.

## 7. Tests

- **New `tests/v476.test.mjs`: 100 checks** (a fake R2 bucket with multipart): limits, IDOR, out-of-order and repeated parts, type refusal with abort, resume list, exact completion, expiry sweep, 5-open cap, no-R2 message; jobs (unknown kinds, keyed once, backoff, dead + audit, admin views, retry, run now, https-only webhook, stuck release, cron ticks, Cloudflare Queue hand-off); calendar (roles, token format, 404 on bad token, valid ICS with timezone, project / milestone / blackout events, no money, line folding, last-used, regenerate, revoke, staff feed, audit); organizations (create, GSTIN check, invite + notify + email, accept by the right email only, shared read vs outsider 404, act-on-behalf off/on, who accepted, billing on quote + print, read-only project, roles, transfer, remove, delete); CI files and UI wiring.
- Full regression and visual checks: see the delivery note.

## 8. Setup

- Nothing required.
- **R2 for big uploads:** create the private bucket and bind it as `FILES` (already described in wrangler.toml).
- **Faster jobs (optional):** a Cloudflare Queue bound as `JOBS` plus a consumer Worker; otherwise the hourly workflow handles it.
