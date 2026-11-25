# FODO v55.26: audit fixes (25 November 2026)

Fixes for the code-side findings of the 25 November full-system audit. Keys, KYC and account set-up stay with the team (listed at the end).

## 1. Private repository files are no longer public
The repo root is the website root, so `/docs/` (including the security audit), `/tests/`, `/scripts/`, `/runner/`, `/functions/`, `/.github/`, the root `*.md` files, `wrangler.toml`, `package.json`, `.gitignore`, `VERSION`, `data/reviews.csv` and `data/seo-lastmod.json` were downloadable.

- `functions/[[path]].js`: catch-all that answers 404 (noindex, no-store) for those paths and calls `context.next()` for anything else.
- `_routes.json`: sends exactly those paths to Functions (30 rules, limit 100).
- `isPrivate()` decodes the path and is case-insensitive, so `/%64ocs/...`, `//docs/...` and `/readme.md` are blocked too.
- Still public, because the site needs them: `/data/build.json`, `/sites/lib/*` (Website Builder), `/downloads/*`.

## 2. System emails without Resend
`sendMail` already sent owner alerts through the connected Gmail when `RESEND_API_KEY` is missing (v55.25). Now every other non-secret email does the same when the Gmail mailbox (Read + Send) is connected: help desk replies, Studio keys, receipts.
- Login codes never go this way.
- Mail with attachments never goes this way.
- `opt.noGmail` still opts out.
- If Gmail is not connected, the old behaviour stays: logged as "not sent".

## 3. Test orders never count as revenue
- New column `acct_orders.test` (additive migration). `SCHEMA_VERSION` is now 55.26.
- `payTest(env)` returns 1 for Cashfree sandbox and for Razorpay `rzp_test_` keys. Both checkout paths store it.
- The migration marks every earlier order as a test order. Live payment keys were never set before v55.26, so all of them were sandbox orders.
- These now skip test orders: admin overview, revenue series, funnel, user list "paid", the limit-hit list, Growth Lab revenue, analytics and the Brain pulse.
- A customer's own order history and the help desk still show the orders.

## 4. Stuck X-Ray runs
`expireStuckRuns(env, 3)` runs on every hourly `/api/monitor/jobs` tick. It handles runs still `running` 3 hours after they started:
- If a credit was charged, `refundCredit` returns it (idempotent).
- If nothing was charged, the run is marked `expired`.
- The tick reports `{ checked, refunded, expired }`.

## 5. Brain alerts
- One open alert per problem: a still-open alert from an earlier day is refreshed instead of a new one each day. This was the source of 8× "X-Ray usage dropped".
- An alert the daily scan has not found for 2 days closes itself (`auto-closed`). Automation and task alerts are not touched.

## 6. CI
- **FODO tests:** `tests/v52` needs `openpyxl`, which the GitHub runner lacks. The workflow now installs it.
- **FODO browsers** (and the e2e suites): `tests/xray-fixtures/run-local.sh` had lost its executable bit in a Windows commit, so `spawnSync` failed ("undefined undefined"). Fixes:
  - Every suite now starts it through `bash`.
  - The exec bit is restored in git.
- **Actions versions:** checkout v5, setup-node v5 and setup-python v6, off the deprecated Node 20 versions.

## Tests
- New suite `tests/v5526-fixes.test.mjs` (54 checks), registered in INTEGRATION.
- `accounts-functions` and `v18-functions` now mark their sandbox orders as live before they check revenue. They also check that sandbox orders are test orders. This is an intentional behaviour change.
- Integration group: all pass.
- The cross-browser smoke test passes in Chromium (10/10).
- Checked locally on the Pages runtime: private paths answer 404, and the site, `/data/build.json`, `/js/*` and `/api/*` answer 200.

## Not code (team)
- Resend key and domain.
- Cashfree KYC and production keys.
- WhatsApp Cloud API token and phone id.
- GA4, Meta Pixel, booking and review links in Website settings.
- GSC and social connections.
- Gemini quota.
- R2 bucket `fodo-files`.
- `STATS_TOKEN`.
