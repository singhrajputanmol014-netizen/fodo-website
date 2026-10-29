# Growth Lab accounts, plans and payments (v13)

Login, a free allowance, 5 paid levels, X-Ray packs and Cashfree payments for the Growth Lab.
It all stays **off** until `ACCOUNTS_ENABLED=1` and the D1 database `XRAY_DB` are both set. While it is off, the site works exactly as in v12.2: the X-Ray is anonymous and fair-use limited.

## What a visitor sees

| Where | Accounts off (now) | Accounts on |
|---|---|---|
| Business X-Ray | runs without login | "Log in (it's free)" → Google or a 6-digit email code → the X-Ray starts |
| Free allowance | hourly/daily limits per network | 2 X-Rays per account (lifetime), free-level limits |
| Report | full | Free plan: score, biggest problem, top 3 fixes, 30-day plan and evidence. Detail sections are locked with a "See plans" card. |
| Downloads | all | Starter and above (the share link stays free) |
| Competitor Finder | open | search open; downloading the sheet needs a free login |
| Header | — | "Log in" chip, or "Plan · N X-Rays" linking to /account/ |

## Plans (single source of truth: `functions/_lib/plans.js`)

| Plan | ₹/month | X-Rays | Pages | Competitors | Pages per competitor | Adds |
|---|---|---|---|---|---|---|
| Free | 0 | 2 (lifetime) | 15 | 2 | 2 | basic report |
| Starter | 499 | 10 | 50 | 5 | 2 | full report, PDF/Excel/CSV/JSON, history |
| Growth | 1,499 | 30 | 150 | 8 | 3 | compare with last X-Ray, content gap, deeper customer voice, search volume* |
| Pro | 3,999 | 80 | 300 | 10 | 6 | tech stack, competitor deep-crawl, broken outgoing links, domain authority* |
| Agency | 9,999 | 250 | 500 | 10 | 6 | white-label PDF, 5 team seats, client folders, bulk X-Ray (20 sites) |

\* A feature that needs a data provider is not shown or sold until that provider is connected:
- Search volume needs DataForSEO (`DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD`). It is paid and has not been tested live.
- Domain authority needs a free Open PageRank key (`OPR_API_KEY`).

Packs never expire and run at your plan's level (at least Starter): 5 X-Rays for ₹299, 20 for ₹999, 60 for ₹2,499.

The price on `/plans/` without JavaScript is a copy (`LAB_PLANS` in `scripts/build_pages.py`). `tests/v13-plans.test.mjs` fails if that copy and `plans.js` differ, so change both together.

## How credits work

- An X-Ray uses one credit, taken atomically, in this order: this month's plan X-Rays, then packs, then free ones. The level a run gets comes from the credit it used.
- `start` returns:
  - 401 `{login:true}` when nobody is logged in;
  - 402 `{upgrade:true}` when no credit is left (checked before the hourly limit);
  - 429 when the hourly limit is reached (2, 6, 10, 20 or 40 per hour, by plan).
- The server enforces every limit: pages and fetches, searches, competitor reads, AI questions, link checks, authority and search volume. The browser only decides what to show. Locked report sections are a display choice, and the data behind them is never collected on lower levels.
- Refund: when a site cannot be read at all (≤ 6 fetches, ≤ 1 search, under 20 minutes), the page calls `/api/xray/refund` and the credit comes back once.
- Monthly plans last 30 days from payment. Unused monthly X-Rays do not roll over. Paying again for the same plan resets the month. A smaller plan cannot be bought while a bigger one is active.

## Payments (Cashfree)

- **One month at a time (default).** The server creates the order (`POST /pg/orders`, API version `2025-01-01`, idempotency key = order id), and the browser opens Cashfree Checkout.
  - Cashfree sends the visitor back to `/account/?order_id=…`.
  - The page calls `/api/account/verify`. The server re-reads the order from Cashfree, checks that it is PAID and that the amount equals the price, and only then credits it.
  - Coming back to the page proves nothing on its own.
- **Webhook:** `POST /api/account/webhook/cashfree`.
  - The signature (HMAC-SHA256 of timestamp + raw body, keyed with the secret key) must match. Timestamps older than 24 hours are refused.
  - The webhook credits through the same path as verify. A ledger row with a unique `ref` makes double credit impossible, whether it is verify plus webhook or a repeated webhook.
- **Auto-renew (optional, `CASHFREE_SUBSCRIPTIONS=1`):** uses Cashfree Subscriptions (periodic monthly plan, first charge at sign-up).
  - The first month is granted when the mandate turns ACTIVE.
  - Renewals are granted on `SUBSCRIPTION_PAYMENT_SUCCESS`, except the AUTH payment.
  - "Stop auto-renew" on /account/ cancels the mandate.
  - Not tested against a live Cashfree account. Switch it on only after a sandbox run.
- The mobile number is needed by Cashfree (10 digits). It is asked for at checkout and saved to the profile.

## Login

- **Google:** the Google Identity Services button.
  - The server verifies the RS256 ID token with Google's keys, and checks `aud` = `GOOGLE_CLIENT_ID`, the issuer and expiry.
  - A Google login is linked to an existing email account only when Google is authoritative for that address (Gmail, or a verified Workspace address). Otherwise it answers 409 and asks for the email code.
- **Email code:** 6 digits, sent with Resend.
  - Stored only as a hash, valid 10 minutes, 5 tries.
  - One code per minute per email (5 per hour), and 30 per hour per network.
  - 30 new accounts per network per day. Indian mobile networks put many people behind one address, so the network limits stay generous.
- **Session:** an `fodo_s` cookie (HttpOnly, Secure, SameSite=Lax, 30 days).
  - It is stored as a SHA-256 hash in D1.
  - Every POST must be JSON and from the same origin (CSRF).

## D1 tables (created automatically on first use)

| Table | Holds |
|---|---|
| `acct_users` | plan, `plan_until`, `monthly_left`, `pack_left`, `free_left`, brand |
| `acct_sessions` | sessions |
| `acct_otps` | email codes |
| `acct_ledger` | every credit or debit; `ref` is UNIQUE |
| `acct_orders` | orders |
| `acct_subs` | subscriptions |
| `acct_team` | team members |
| `acct_clients` | client folders |
| `acct_runs` | one row per X-Ray: owner, user, tier, credit, client, status, score |
| `acct_counters` | rate limits |

## Settings (Cloudflare → Pages → fodo-website → Settings → Variables and secrets, Production)

| Name | Type | Value |
|---|---|---|
| `ACCOUNTS_ENABLED` | Variable | `1` (the master switch) |
| `GOOGLE_CLIENT_ID` | Variable | `…apps.googleusercontent.com` |
| `RESEND_API_KEY` | Secret | `re_…` |
| `MAIL_FROM` | Variable | `FODO <login@fodo.co.in>` (domain verified in Resend) |
| `CASHFREE_APP_ID` | Secret | Cashfree App ID |
| `CASHFREE_SECRET_KEY` | Secret | Cashfree Secret Key (also signs webhooks) |
| `CASHFREE_ENV` | Variable | `sandbox` first, then `production` |
| `CASHFREE_SUBSCRIPTIONS` | Variable | `1` only to offer auto-renew (optional) |
| `OPR_API_KEY` | Secret | Open PageRank key (optional, enables domain authority) |

The D1 binding `XRAY_DB` is set in `wrangler.toml`. Uncomment its block and paste the database ID.

## Tests

| Command | What it checks |
|---|---|
| `node tests/accounts-functions.test.mjs` | 64 checks: real SQLite as D1, real RS256 Google tokens, mocked Resend and Cashfree, signed webhooks, double-credit and tampered-amount cases, team and white-label |
| `node tests/v13-accounts-e2e.test.js` | 45 checks: the real pages on the local Pages runtime with accounts on. Email code login → free runs → 402 → buy Pro → payment return → Pro report → refund → Agency white-label PDF, clients, bulk |
| `node tests/v13-plans.test.mjs` | the HTML price copy equals the server's prices |
| `node tests/xray-e2e.test.js` | 116 checks: unchanged with accounts off |

## FODO owner logins
`anmol@fodo.co.in` and `singhrajputanmol014@gmail.com` are owner logins, listed in `OWNER_EMAILS` in `functions/_lib/accounts.js`. To add another address, put it in that list.

An owner login:
- gets every feature at Agency level and unlimited X-Rays;
- is never charged, and checkout is refused for it;
- shows as "Owner" on the account page.

Owner access needs the 6-digit email code, or a Google login where Google is authoritative for the address (Gmail, or Workspace). A Google account that merely lists the address is refused.

Every owner X-Ray is logged in the ledger with 0 credits.

## Admin dashboard (v15) — www.fodo.co.in/admin/
The admin dashboard is a separate app with its own FODO-design shell and no site menu. It is never indexed (noindex, robots Disallow, X-Frame-Options DENY).

**Who can open it:**
- Owners (`OWNER_EMAILS`) can see everything and change everything.
- Viewers added under Team are read-only.
- Any other login gets "only for the FODO team" and sees no data. The server checks this on every `/api/admin/*` call.

**Sections:**

| Section | Shows |
|---|---|
| Overview | KPIs: users, active today and this week, X-Rays, paying users, revenue, sign-up → paid. 30-day columns for X-Rays, sign-ups, logins and revenue. Funnel: signed up → 1st X-Ray → 2+ → ran out → paid. Feature use in the last 30 days, users by plan, most X-Rayed sites, latest activity. |
| Users | Search and filter by paying, given free or blocked. CSV export. |
| User page | What they used (counts per feature), their X-Rays (with links to the report), payments, credit history, activity and team. Owner controls below. |
| X-Rays | Every account run, with search and CSV. |
| Leads | People who ran out of free X-Rays and have not paid, with email and WhatsApp buttons and CSV. |
| Payments | All orders, with CSV. |
| Activity | Latest events. |
| Team | Viewers. |

**Owner controls on a user page:**
- **Block / unblock:** blocking ends their sessions, refuses login (403) and stops X-Rays. Owners cannot be blocked.
- **Give a plan free for N days**, or remove the plan.
- **Give or take back X-Rays.**
- **Unlimited X-Rays:** nothing is deducted, and the run level is the user's plan (at least Starter).
- **Give single features free**, on top of the plan. Any feature id from `plans.js` works, FODO Edge included.

Every admin action is written to the user's history.

**Data:**
- `acct_events` holds every login, X-Ray start and finish, refund, "ran out", checkout, payment, Edge tool, link check and authority call.
- Downloads and copies are reported by the page via `POST /api/account/event`. Only known kinds are accepted, at most 300 per hour, and the page cannot fake login or payment events.
- New columns (`blocked`, `unlimited`, `extra_features`, `admin_note`, and `acct_runs.features`) are added automatically to the live D1 database on first use.
- `acct_admins` holds the viewers.

## v16 — more login options, admin roles, live data, website traffic

### More ways to log in: Firebase Authentication
Facebook, mobile-number OTP, Microsoft, Apple, GitHub and X are offered through Firebase Authentication. Email login links also come through Firebase when Resend is not set up.

**Settings:**

| Name | Value |
|---|---|
| `FIREBASE_API_KEY` | Public web API key, from Firebase → Project settings → Your apps → Web app |
| `FIREBASE_PROJECT_ID` | e.g. `fodo-513118` |
| `FIREBASE_AUTH_DOMAIN` | Optional. Default `<project>.firebaseapp.com` |
| `FIREBASE_PROVIDERS` | Optional. Comma list from `facebook,phone,microsoft,apple,github,x,email`. Default `facebook,phone,microsoft,email` |

**How the server handles a Firebase login (`/api/account/firebase`):**
- It verifies the Firebase ID token: RS256, Google's securetoken keys, `aud` = project id, `iss` = `https://securetoken.google.com/<project>`.
- It links to an existing account only by Firebase uid or by a **verified** email. Facebook emails are often unverified, so they are not stored and not used to take over an account.
- Phone-only users have no email. Their phone is stored, but it is never used to link accounts, because a profile phone number is typed in, not verified.

**Firebase console setup:**
- Authentication → Sign-in method → enable each provider.
- Authorized domains → add `www.fodo.co.in` and `fodo.co.in`.
- Facebook needs a Meta app ID and secret, and the Firebase OAuth redirect URI added in the Meta app.
- Phone OTP costs per SMS in India and may need the Blaze plan.

### Google button white box
In dark mode the Google button showed a white box around it. It is fixed with `color-scheme: light` on its iframe.

### Admin dashboard
- **Block and other actions:** the confirmation boxes are now in-page dialogs. Some phone browsers block the browser's own pop-up boxes, which is why Block did nothing.
- **Roles:** owner, **admin** (full control, can add other admins and viewers, cannot touch owners) and viewer.
- **Live:** Overview, Traffic and Activity refresh every 20 seconds while open.
- **Export all:** one Excel file with Summary, Users (all), X-Rays, Payments, Leads, Activity (5,000) and Traffic (90 days, every dimension). Every table also has its own CSV button.

### Website traffic (first-party, every visitor)
- **Collection:**
  - `js/insights.js` is on every page except /admin/. It sends page views, the referrer and UTM tags, screen width, key clicks (from `FODO_TRACK`) and visible time on the page to `POST /api/t`.
  - The beacon is ignored when the browser sends Do-Not-Track.
- **Storage (`functions/_lib/traffic.js`):**
  - A visitor is counted once a day by `sha256(salt + day + IP + user agent)`. The IP is never stored.
  - Bots and crawlers are dropped.
  - A visitor is capped at 600 hits a day.
- **Tables (D1):**
  - `web_daily` (day × dimension × key): pages, entry pages, sources, channels, referrers, campaigns, countries, cities, devices, browsers, systems, languages, new/returning, actions, actions by source/channel/page, and time on page.
  - `web_vis`: visitors of the last 3 days.
  - `web_live`: the last 3 hours, used for "on the site now".
  - Daily totals are kept for 400 days.
- **Channels:** Search, Social, AI assistants (ChatGPT, Perplexity, Gemini, Claude, Copilot), Referral, Direct, Paid ads (gclid / utm cpc), Email and Campaign.
- **What to work on:** rules over the same numbers. They cover:
  - the share of direct, search, social and AI traffic;
  - mobile share;
  - the action rate;
  - the best-converting source;
  - pages with views but no actions;
  - pages people leave fast;
  - international share;
  - the trend vs the previous period.
- **Optional setting:** `TRAFFIC_SALT` is a secret that makes the daily visitor code impossible to guess.
- **Cost:** each page view is about 12 D1 writes. The free plan allows 100,000 writes a day, which is roughly 8,000 page views a day.

## v16.1 — free login options

| Option | Cost | Needs |
|---|---|---|
| Google | free | done |
| **WhatsApp (mobile number)** | **free** | WhatsApp Cloud API (Meta) |
| Facebook, Microsoft, email link | free up to 50,000 users a month | Firebase (Spark, no card) |
| Email 6-digit code | free up to 3,000 emails a month | Resend |
| Phone SMS OTP (Firebase) | about $0.07 per SMS in India, Blaze plan | skip — use WhatsApp instead |
| Apple | $99 a year (Apple Developer) | skip |

### How WhatsApp login works ("reverse OTP")
1. The page calls `POST /api/account/wa/start` and gets a 6-character code, a `wa.me` link to FODO's number and a secret poll token. The code expires in 10 minutes.
2. The visitor sends "FODO LOGIN CODE…":
   - on a phone with one tap;
   - on a computer by scanning the QR code (qrcodejs from cdnjs).
3. Meta posts the message to `POST /api/account/webhook/whatsapp`.
   - The `X-Hub-Signature-256` is checked with `WA_APP_SECRET`.
   - The sender's number has already been verified by WhatsApp.
   - FODO replies within the customer-service window, which is free.
4. The page polls `POST /api/account/wa/poll`. The first poll after the message logs the visitor in, and each code works only once.
   - Accounts are matched by `wa_phone`, the WhatsApp-verified number, never by a typed-in number.

**Settings:**

| Name | Value |
|---|---|
| `WA_NUMBER` | The WhatsApp Business number, e.g. `917827007676` |
| `WA_PHONE_ID` | Phone number ID from the Meta app |
| `WA_TOKEN` | Permanent system-user token (secret) |
| `WA_APP_SECRET` | Meta app secret (secret) |
| `WA_VERIFY_TOKEN` | Any word you choose, also entered in Meta's webhook settings |

**Webhook:** set the callback URL to `https://www.fodo.co.in/api/account/webhook/whatsapp` and subscribe to `messages`.

The number used with the Cloud API cannot stay on the normal WhatsApp app at the same time, so use a separate SIM.
