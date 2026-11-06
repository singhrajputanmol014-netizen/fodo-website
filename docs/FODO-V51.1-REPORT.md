# FODO v51.1 report: cold starts (why every page felt slow)

The owner reported that the Workspace and the other app pages had become slow: every page open showed "loading" or took a
while. Measured cause, fix, and what is still outside the code.

## Cause (measured, not guessed)
Every module created its tables with `CREATE TABLE IF NOT EXISTS` once per server instance (isolate). On Cloudflare Pages an
instance is short-lived, so almost every page open after a pause started on a cold instance, and the cold instance ran every
module's set-up before the first real query. Each statement is a network round-trip to D1 (the database lives in one region, the
page function runs near the visitor), typically 50 to 150 ms.

| Request on a cold instance | statements before v51.1 | after |
| --- | ---: | ---: |
| `/api/os/me` (first call of the Workspace) | 611 | 11 |
| `/api/biz/me` | 150 | 13 |
| Command Centre | 175 | 35 |
| Task list | 149 | 12 |
| warm instance, `/api/os/me` | 10 | 10 |

611 statements × ~100 ms is about a minute of waiting on the worst screen; the local tests never showed it because SQLite in
the same process answers each statement in well under a millisecond. The number grew with every phase (v50.3 to v51.0 added
about 200 statements), which is why "it used to be fine".

Four places also ran their table set-up on every single call, not once per instance: payouts (6 statements per call), site
media (7 ALTERs per upload / list / edit), alerts preferences, the privacy log and the lead store.

## Fix
- `functions/_lib/schema.js`: one `fodo_schema` row holds the `SCHEMA_VERSION` the database was last set up for. A cold instance
  reads that one row; when it matches, every module's set-up is skipped. When it does not (first request after a deploy that
  changed the schema), `setupAll()` runs every module's set-up once, as batches, then writes the version.
- Every module's set-up is now `SCH.setup(d, name, fn)` (46 modules, each in `SETUPS`), and the sequential
  `for (const q of DDL) await d.prepare(q).run()` loops became one `d.batch()` per module. ALTER lists that used to be
  try / catch on every cold start go through `migrateOnce` (recorded once).
- Self-heal: a "no such table / column" error at the OS, client or account router resets the gate, runs `setupAll()` once and
  retries the request on a clone (a POST keeps its body). A forgotten version bump therefore costs one slow request, not a
  broken site. CLAUDE.md 9.3 carries the rule: any DDL / migration / seed change bumps `SCHEMA_VERSION`.
- The first request after this deploy sets everything up once: 111 statements in 33 batches on an existing database (731 on
  an empty one). Every cold instance after that: one version read.

## Found on the way
- `biz.js noUid()` stripped `user_id` from Studio and CRM answers but not `owner_user_id` (an OS column added in v50.5), so a
  client's content list could carry an employee's internal id. Fixed. The v45 suite had this check since v45 but its test
  database never had the column until v51.1 ran every set-up before the suite.
- Two tests assumed the OS set-up runs after the login call (it now runs inside the first request): v501 resets the gate before
  the migration check and makes one OS call before reading the owner's member row, as production does at first sign-in.

## Not in the code (owner, Cloudflare dashboard)
- D1's region: if the database was created far from India (the dashboard shows it under D1 → database → Settings → location),
  every query still pays that distance. The fix above removes the 150 to 600 set-up queries; the 10 to 35 real ones per screen
  remain. If pages still feel slow after this release, that location is the next thing to look at.
- Read replication for D1 (Sessions API) is a later option, not done: it needs a code change per query and the beta switched on
  in the dashboard.

## Tests
New: `tests/v511.test.mjs` (25 checks: static guard over the 46 set-up modules, statement counts on a cold instance, 113 OS GET routes plus client / account / monitoring routes without 5xx on an instance that skipped every set-up, the deploy path, the self-heal with a GET and a POST, payouts).
Full regression, two runs, reported exactly:
- Run 1 (`node tests/run.mjs`): 5,421 passed, 2 suites failing: `v45` (the `owner_user_id` leak above, a real bug, fixed) and `v501` (test order assumption, adjusted as described). No other suite was affected by the change.
- Run 2, after those fixes: **5,450 passed, 2 suites failing: `v8-finder` (`ERR_CONNECTION_REFUSED` to the static test server, 0 checks reached) and `v508-csp` (`TimeoutError` before its first check)**. Both are browser suites whose database code did not change; run alone straight after, `v8-finder` passed 76/76 and `v508-csp` 15/15, and both passed in sequence in the v51.0 run earlier today. The same start-up flake hit `v13-accounts-e2e` in v50.7 and v51.0. There was no single all-green full run for v51.1; the unit suites (all database logic, 5,000+ checks) were green in run 2.
Measured statement counts come from `tests/v511.test.mjs` on the Node D1 shim; production latency per statement is not measurable from this environment.
