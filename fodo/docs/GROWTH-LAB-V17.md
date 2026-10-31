# FODO Growth Lab v17: free business-intelligence upgrade

Everything in v17 runs on free services. Each new data source is **optional**. If its key is missing, that part says
"Data unavailable" or "not connected". It never makes anything up.

## What is new

| Area | What it does | Where |
|---|---|---|
| Growth Lab home | 6 FREE tools and 19 PRO tools in 5 categories (Diagnose, Compete, Visibility, Strategy, Monitor). Free or paid is shown before login, prices come live from admin settings, and there is a link to a sample report. | `/growth-lab/` |
| Marketing Budget Planner (free) | Splits a monthly budget by channel. Each channel gets its job, reason, risk, KPI and a test budget. Labelled STRATEGIC RECOMMENDATION. | `/marketing-budget/` |
| Data Completeness % | How much of the planned research came back. Shows a "Partial analysis" banner below 70%. | X-Ray hero + Evidence section |
| Strongest advantage / biggest competitive threat | Two cards in the report summary. | X-Ray summary |
| Conversion funnel | Understanding, Trust, Interest and Action are scored from the checks. Lead and Customer show "Data unavailable" (they need your own data). | Conversion X-Ray |
| Revenue Leak Finder | Each leak with its evidence, potential impact, confidence, effort and fix. Never shows a rupee loss. | Conversion X-Ray |
| Priority matrix | High/low impact against low/high effort. | Biggest Opportunities |
| Local visibility | Your Google Maps rating and reviews against local competitors (Google Maps results via Serper). Creates the "fewer/weaker reviews" and "not on Maps" opportunities. | Digital Presence |
| AI visibility, several engines | Workers AI + Groq (free) + Gemini with Google Search grounding (free tier), each when its key is set. Includes the FODO AI Visibility Score, labelled "not official". | AI Visibility |
| Google Search Console | Read-only OAuth. Shows your real clicks, impressions, CTR and position, plus CTR quick wins. **Private:** it is never saved in shared links. | SEO / Search + account |
| Why are they winning? | Head-to-head with each competitor, with actions for now, 30 days and 90 days (Growth plan and above). | Competitor X-Ray |
| 90-day roadmap (rules, no AI) | Foundation → acquisition → optimisation, with KPIs (Growth plan and above). | 30-Day Action Plan |
| Action tracker | To do / In progress / Done on each action. Saved in the account and kept across re-scans. | Top 5, 30-day plan, roadmap |
| Monitoring / Competitor Change Detector | Snapshots of the homepage and sitemap. Reports what changed, why it matters and what to do. Free plan: 1 site. Paid: 3 / 6 / 15 / 40 sites, checked daily. | Account → Monitoring |
| Monthly Growth Report | Previous vs current X-Ray, plus monitoring and actions. Downloads as a PDF (Starter and above). | Account → Monthly report |
| Growth Score history | Score trend per website. | Account |
| Admin → Costs & profit | Every API call with its estimated cost. Cost per report, provider, tool and user. Revenue, contribution and margin per plan. System health. | `/admin/#costs` |
| Admin → Prices & tools | Change plan and pack prices, X-Rays and monitor slots. Turn a tool off for maintenance. | `/admin/#settings` |
| Admin → Monitoring | All monitored sites and recent changes. | `/admin/#monitoring` |
| Search backup | If Serper fails or runs out of credits, Brave answers automatically (only when `BRAVE_API_KEY` is set). | Server |
| Sample report | A real X-Ray of a **test** website, clearly labelled DEMO. | `/business-x-ray/?r=sample` |

## Setup, all free (Cloudflare → fodo-website → Settings → Variables and Secrets, then Retry/redeploy)

1. **Groq (AI engine #2)**
   - Go to https://console.groq.com → API Keys → Create.
   - Add `GROQ_API_KEY` as a Secret.
2. **Gemini (AI engine #3, answers from live Google Search)**
   - Go to https://aistudio.google.com/apikey → Create API key.
   - Add `GEMINI_API_KEY` as a Secret.
   - Optional: set `GEMINI_MODEL` / `GROQ_MODEL` to force a model. Without them FODO tries current models in order (Gemini: gemini-flash-latest → gemini-3.8-flash → …; Groq: openai/gpt-oss-120b → …) and skips any model the provider has retired.
3. **Google Search Console connect**
   - Google Cloud Console (same project as the Google login) → APIs & Services → Library → **Google Search Console API** → Enable.
   - OAuth consent screen → Data access → Add scope `.../auth/webmasters.readonly`.
   - Credentials → your OAuth client (the one used for login) → Authorized redirect URIs → add `https://www.fodo.co.in/api/lab/gsc/callback`.
   - Copy the **Client secret** → add it in Cloudflare as Secret `GOOGLE_CLIENT_SECRET`.
   - Optional: add `GSC_ENC_KEY` (any long random text) to encrypt stored tokens.
   - Until Google verifies the app, up to 100 test users can connect (add them under OAuth consent screen → Audience → Test users). Verification is free.
4. **Daily monitoring (free cron through GitHub Actions)**
   - Make a random 32-character text.
   - In Cloudflare, add it as Secret `CRON_KEY`.
   - In GitHub, add the same text: repo → Settings → Secrets and variables → Actions → New repository secret → `FODO_CRON_KEY`.
   - The workflow `.github/workflows/fodo-monitor.yml` then runs every day at 06:47 IST. "Check now" works even without this.
5. Optional:
   - `BRAVE_API_KEY`: backup search.
   - `PAGESPEED_API_KEY`: higher PageSpeed quota, free from Google Cloud.
   - `USD_INR` (default 88) and `COST_USD_JSON` (e.g. `{"serper":0.001}`): change the cost estimates.

Nothing needs to change in `wrangler.toml`. New tables are created automatically in the same D1 database: `api_usage`, `lab_config`,
`lab_actions`, `lab_gsc`, `mon_targets`, `mon_events`.

## New API routes

- **`/api/lab/*`**
  - `catalog` (public)
  - `actions`, `actions/summary`
  - `gsc/status`, `gsc/start`, `gsc/callback`, `gsc/disconnect`
  - `monitor`, `monitor/check`, `monitor/remove`, `monitor/seen`
- **`/api/monitor/tick`**: the cron endpoint. It needs the `x-cron-key` header and checks 1 site per call.
- **`/api/xray/places`**: Google Maps results via Serper.
- **`/api/xray/gsc`**: the user's own Search Console data.
- **`/api/admin/*`**: `costs`, `health`, `config` (GET/POST), `monitoring`, `quality`.

## Honest limits (not built, or limited on purpose)

- **Paid providers are not used:** DataForSEO (search volume), ChatGPT / Perplexity APIs and Google Places API (billing account). The report says "Data unavailable" where they would be needed.
- **AI visibility** uses only the engines listed in the report. It is not ChatGPT, Perplexity or AI Overviews. The FODO AI Visibility Score is FODO's own measure.
- **Background jobs** still run stage by stage from the visitor's browser, against real server steps and with real progress. Cloudflare Queues would move them fully to the server; that is planned but not needed on the free plan.
- **Built in v17.1** (were missing in v17): versioned AI prompts in admin, share-link expiry/revoke, VERIFIED / NEEDS REVIEW / FAILED QC, the visitor → customer funnel, and a per-report API-call page. See below.
- **Costs are estimates** from list prices, except DataForSEO, which returns its real cost. Infrastructure is ₹0 on Cloudflare's free plan.
- **Static fallback text** on `/plans/` and `/growth-lab/` shows the default prices until the next site build. The live page shows the admin prices.

## Tests

- `tests/v17-functions.test.mjs`: 90 checks.
- `tests/v17-e2e.test.js`: 58 checks, browser + local Cloudflare runtime. Run it with `WRITE_SAMPLE=1` to regenerate `data/xray-sample.json`.
- All earlier suites still pass:
  - X-Ray e2e: 116
  - accounts e2e: 75
  - accounts functions: 134
  - X-Ray functions: 71
  - v5 pages: 668
  - v9 SEO: 137
  - every other suite

## v17.1: audit fixes + Growth Lab data in admin

### Admin (`/admin/`)
- **☰ menu** next to the dark/light button. It opens every section in groups (Growth Lab, Customers, Website, Money & setup) plus quick links: Growth Lab page, X-Ray, Plans, site, Export all, Dark/light and Log out.
- **On a phone** the bottom bar shows Overview, Growth Lab, Users, Costs and **More**. More opens the same menu. The header fits a 360 px screen.
- **Overview → Next best actions**: built from live data (payments not connected, AI keys missing, X-Rays needing review, unfinished tools…).
- **Growth Lab tab**:
  - Every tool with its views, starts, completions, logged-in uses and completion rate.
  - The 9-step visitor → customer funnel.
  - X-Ray quality and data completeness.
  - Top industries and locations, plus monitoring, Search Console and action counts.
- **Businesses**: every X-Rayed website. Each business page has its X-Ray history, area scores, top problems, monitoring watchers, the action tracker and API cost.
- **Findings explorer**: the most common opportunities and problems across all reports, filterable by industry, plus the competitors that come up most.
- **Report detail** (`#report/<job>`): the input, every API call with its ₹ cost, payments and the report summary. Owners and admins can mark the report **Verified / Needs review / Failed** with a note.
- **Quality**: the review queue (low data completeness, failed or unreviewed reports).
- **AI prompts**:
  - The 6 prompts (synthesis, visibility, fix pack, battle cards, 90-day roadmap, client pitch). Each has a version id, how many runs used that version, and how often its statements were dropped.
  - Only owners can edit, reset or switch back to an older version; viewers are read-only.
  - The output format stays fixed in code, so an edit cannot break the report.
- **Export all (Excel)** now adds the Growth Lab, Businesses, Findings, Costs and Monitoring sheets.

### Growth Lab / X-Ray
- **Share control** in the report hero: off, on, 7 / 30 / 90 days. A private report returns 403 to everyone except its owner and admins.
- **One "Want FODO to help implement this?" offer** after the Top 5 actions, with click tracking (`service_cta_click`).
- **Tool tracking**: every tool sends start and complete events (first-party, no cookies). The admin uses them for the funnel.
- **Account**: My businesses (per-website card with the recommended next tool), Growth Score history, report versions with a side-by-side comparison of two versions, action progress, Monitoring, Search Console and the Monthly report.

### Not done, honestly
- **Cloudflare Queues**: Pages Functions cannot consume a queue, so it needs a separate Worker. The X-Ray keeps running stage by stage against the real server steps.
- **Paid data** is still not used: DataForSEO, ChatGPT/Perplexity and the Google Places API.
- The AI engines, Search Console and monitoring were tested with stand-in servers. Test them on a real business once the keys are added.

## v17.1.1 – v17.2: fixes after the first live reports

### Live fixes (v17.1.1 – v17.1.4)
- **Groq and Gemini models.**
  - Groq retired `llama-3.3-70b-versatile` on 16 Aug 2026, and new keys get 404 on `gemini-2.5-flash`.
  - Each engine now walks a chain of current models:
    - Groq: `openai/gpt-oss-120b` first.
    - Gemini: `gemini-flash-latest` first.
  - A retired model is skipped automatically.
  - Failed calls write the provider's own error text (keys masked) into Admin → report → API calls → "Prompt / tool".
- **AI questions use a clean service name** ("SEO", "Meta Ads"), never a tagline fragment.
- **AI Visibility:** a question that already names the brand ("FODO alternatives") is shown as "Not counted" and left out of the score.
- **Account page never stays on "Loading…".** After 15 s it shows the real reason and a Try again button.

### v17.2: X-Ray quality (from the findings review)

| Problem in the review | Fix |
|---|---|
| ~100 internal links to `/cdn-cgi/l/email-protection` reported as 404 | That is Cloudflare Email Obfuscation (it decodes in the browser). `/cdn-cgi/` paths are never crawled or counted. |
| "Longest lead form has 37 fields" | That was the Growth Score quiz. Radio and checkbox groups now count as one question. Only a form that asks for contact details (name, email, phone…) is a lead form. Quizzes and calculators are tools. |
| Duplicate titles across URL variants | Pages that share one canonical URL count once. Noindex and non-2xx pages are ignored. |
| "Not detected" treated as "not installed" | Tracking shows **Not detected**, or **Unknown** with the reason: inside Google Tag Manager, or loaded by the site's own analytics/consent script. |
| Other companies named "FODO" in Customer Voice, listings and ratings | Entity resolution: a result that names the brand only counts when it also names the website, or the category/services/city. Left-out results are listed in the report. When 2+ results are about a same-name company, a new opportunity **"Your brand name is shared with other companies"** appears. |
| "Overall 54/100" read as a business score | Renamed **Digital Growth Health**, with the note "your online presence, not your sales or profit". |
| "Market Position 10/100" read as "bad business" | Renamed **Digital Market Presence**, with what it measures. |
| Confidence hard to read | Each opportunity shows Confidence **HIGH / MEDIUM / LOW**, from rules (OBSERVED / INFERRED / ESTIMATED). |
| No tap-to-call or WhatsApp found | The site already had them, but only after JavaScript runs. Every page's HTML footer now has real `tel:`, `wa.me` and `mailto:` links. |
| Monitoring "Check now" message vanished | The status message survives the list refresh. This was a real UI bug and the cause of the flaky test. |

Tests: `tests/v172-engine.test.js` has 11 checks. The other suites are unchanged and pass:
- v17 functions: 92
- v17 e2e: 58
- X-Ray e2e: 116

## v18: standalone PRO tools + per-tool pricing

**13 PRO tools now have their own page** at `/growth-lab/<tool>/`:
- revenue-leak, conversion-xray, website-health
- war-room, why-winning, market-position
- ai-visibility, search-visibility, local-visibility, brand-presence
- offer-strength, blueprint30, roadmap90

Each page shows what the tool analyzes, the data it uses, what you receive, the live price, the time it takes, a sample, an FAQ and a privacy note. The registry is `functions/_lib/products.js`, and the page builder reads the same file, so the copy never drifts.

**How a run works (`POST /api/lab/tool/start`)**
1. **Reuse (§47).** If the account has a full X-Ray of the same website from the last 30 days that covers what the tool needs, the run opens at once on that report. There is no new research and the API cost is ₹0.
2. **Fresh scan.** Otherwise the X-Ray engine runs in tool mode: `/business-x-ray/?tool=…&run=…&u=…`. The run id is tied to the account and the website, and works once.
3. **Who pays:**

| Account | Pays with |
|---|---|
| Owner emails | Free |
| Plan whose X-Rays include the tool | Reuse is free; a fresh scan uses one plan X-Ray |
| Everyone else | One bought run of that tool. Without one, the server answers 402 "Buy one run (₹…)" |

4. **A bought run** scans at the smallest plan level that covers the tool (Website Health = Starter, War Room = Growth…). It never touches the free X-Rays. If the site can't be read, the run is refunded as a tool run.

**Payment.** Cashfree `checkout {kind:"tool", item:<tool>}` returns to the tool page. The server re-reads the order from Cashfree (`verify` / webhook), then grants exactly 1 run. This is idempotent.

**Report.** The X-Ray report page shows only that tool's sections plus Evidence, with a "Show the full X-Ray" button.

**Account → My Pro tool reports** lists every run: reused or fresh, how it was paid, and Open / Run now.

**Admin**
- Prices & tools → "Standalone PRO tools": a price per run and an on-sale switch for each tool.
- Growth Lab → per tool: runs, reused vs fresh, finished, via plan, runs bought, revenue.

**Default prices (prompt §9; change them in admin):**

| Tool | Price per run |
|---|---|
| Website Health | ₹699 |
| Offer Strength | ₹699 |
| Revenue Leak | ₹999 |
| Conversion X-Ray | ₹999 |
| Why Winning | ₹999 |
| Market Position | ₹999 |
| Search Visibility | ₹999 |
| Local Visibility | ₹999 |
| Brand Presence | ₹999 |
| AI Visibility | ₹1,999 |
| 30-Day Blueprint | ₹1,999 |
| War Room | ₹2,999 |
| 90-Day Roadmap | ₹3,999 |

⚠️ **Pricing check:** X-Ray packs cost from ₹60 per full X-Ray (`p5` = ₹299 for 5), and a full X-Ray contains every tool. Decide in admin whether tool prices or pack prices should move.

New tables: `lab_tool_credits` and `lab_tool_runs`, created automatically.

Tests:
- `tests/v18-functions.test.mjs`: 38 checks.
- v17 e2e: 67 checks, including the browser tool flow (reuse, fresh scan, tool view, account library, admin).

## v19: background X-Rays (Cloudflare Queue + Browser Rendering, free plan)

Ticking **Run in the background** on the X-Ray form lets the visitor close the tab. The report is still built, saved in the account and emailed. Pro tools use it too.

**Flow**
1. `/api/xray/start {background:true}` checks credits as usual and creates the job.
2. The website asks the runner Worker (`runner/`) to queue it.
3. The Worker's queue consumer claims the job (`/api/xray/bg/claim`) and opens `/business-x-ray/?bg=<job>&t=<HMAC token>` in Cloudflare Browser Rendering.
4. That page runs the **same engine** and saves the report.
5. The Worker reports back (`bg/done`), and the user gets one "your X-Ray is ready" email.

**Limits and fallbacks**

| Situation | What happens |
|---|---|
| Daily free browser time used up (10 min/day ≈ 3–6 X-Rays) | The job waits and is retried every 15 min. Or GitHub Actions runs it, if connected (optional). |
| A run crashes | Retried with backoff. After 3 failed tries, or 2½ h of waiting, the credit or tool run is refunded. |
| A run dies while "running" | The cron sweep (every 15 min) puts it back on the queue. |
| Runner not set up or not answering | The X-Ray runs in the browser exactly as before, and the page says so. |

**What the visitor sees**
- An open tab shows the real job state: queued, waiting, live stages, then the report.
- A saved `?r=` link of an unfinished job keeps watching until it is done.

**Admin → System health** shows "Background X-Rays": whether the Worker is up, and done / running / waiting / failed counts for the last 24 h.

**Security**
- Runner calls need `x-runner-key`.
- The runner page needs the job's HMAC token.
- A job runs once.
- No secret ever reaches a browser.
- The runner page is not counted in analytics.

**Setup:** see `runner/README.md` (queue, Worker from the repo, 2 secrets on the website).

Tests:
- `tests/v19-functions.test.mjs`: 25 checks. They run the real Worker code against the real API in-process.
- `tests/v19-e2e.test.js`: 16 checks. Real pages and the runner Worker code, with a local queue and Chromium standing in for Cloudflare's: tab closed → report built → email; capacity full → waits → starts by itself; token and key checks.

## v20 — Help desk, support mail and the AI help assistant

**For customers: `/help/`** (linked in the menu and footer as "Help & support")
- **Answers:** 19 help articles in 6 topics, with search (FAQ JSON-LD for Google).
- **AI help assistant:**
  - Answers from the help articles, the live prices from admin settings, and, when the person is logged in, only *their own* account: plan, X-Rays left, recent payments, tool runs and tickets.
  - Uses Workers AI (llama 3.3 70b, falling back to 8b). If AI is down it answers straight from the best-matching articles.
  - It never promises refunds or changes accounts. For refunds, double payments or bugs it offers **Talk to a person**, which turns the chat into a ticket with the whole transcript.
- **Ticket form:** works for guests. Spam bots are caught by a hidden field and rate limits.
- **Your tickets:** the list of your own tickets, a thread view, reply, and mark as solved. A guest opens their ticket from the secret link in the ticket email.

**Email**
- Every ticket email goes out with the subject `[FODO #T…]` and `Reply-To: SUPPORT_EMAIL`.
- When the customer replies by email, the Resend inbound webhook (`/api/help/inbound/resend`, Svix-signed) puts the reply on the same ticket, with the quoted history removed.
- A reply that quotes a ticket number from a *different* sender opens a new ticket (no hijacking). Duplicate webhooks are ignored.
- A new email to support opens a new ticket and gets an auto-reply.

**Admin → Support**
- **Help desk:**
  - Counts: open, waiting for customer, solved this week, average first-reply time, AI chats and how many went to a person, 👍/👎.
  - The ticket list with search and status filter. Topics for the last 30 days.
  - Ticket page:
    - The thread and the AI chat before it.
    - The customer's plan, X-Rays left, payments, recent X-Rays, tool credits and other tickets.
    - The emails on this ticket and whether each was sent.
    - Reply (emailed and shown on the help page), internal note (never shown to the customer), and status, priority, topic and assignee.
  - **New email:** write to anyone. It becomes a ticket, so the reply comes back into the same thread.
- **Mail:** every email the site sends or receives (Inbox / Sent / all, search, open one). Login-code emails are logged without the code.
- **AI chats:** every assistant conversation, the model used, rating, and whether it became a ticket.
- Viewers can read everything. Only owners can reply, change or send.

**Tables:** `help_tickets`, `help_messages`, `help_chats`, `help_chat_msgs`, `help_mail`. They are created automatically.

**Secrets (Cloudflare Pages → Settings → Variables and Secrets)**

| Secret | What it is |
|---|---|
| `RESEND_API_KEY` | Resend key (already used for login codes). |
| `MAIL_FROM` | e.g. `FODO <hello@fodo.co.in>`, on a domain verified in Resend. |
| `SUPPORT_EMAIL` | The address customers write to and reply to, e.g. `support@fodo.co.in`. |
| `RESEND_WEBHOOK_SECRET` | The `whsec_…` signing secret of the Resend inbound webhook. Without it, outgoing mail still works, but email replies don't come back into admin. |

Tests: `tests/v20-functions.test.mjs`, 38 checks covering articles, assistant grounding and fallback, escalation, tickets and access, the inbound webhook (signature, replay, threading, hijack, duplicates), the mail log and login-code redaction, and admin reply, note, compose and viewer read-only.

## v20.1 – v20.3

**v20.1**
- Owner X-Rays skip the daily search budget. Customers keep `SEARCH_DAILY_CAP` (default 60).
- A slow home page gets one longer try (30 s).

**v20.2: X-Ray quality**
- Service names come from nav labels and service-page URLs, not taglines.
- A page that times out is reported as "Pages that load too slowly", not as broken.
- Customer voice keeps only snippets about the business or its market. Employee reviews are dropped.
- A small decimal ("Rs.4.2") is not read as a price.
- Copy examples match the industry.
- Workers AI failing → Groq writes the AI summary, FODO Edge and the help chat. The "Workers AI" visibility row never borrows Groq.

**v20.3: the "Ask FODO" bot knows the whole site**
- **Live knowledge, nothing hard-coded:**
  - `/api/help/kb`: help articles (now 32, with a new "Growth Lab & free tools" topic) and live prices.
  - `/api/lab/catalog`: the 13 Pro tools, each with its price and the plans that include it.
  - `data/search-index.json`: every page.
  - Admin price changes show in the bot at once.
- **Offline layer `js/bot-product.js`** (after `bot-llm`) answers exactly:
  - plans and packs, each Pro tool, the free tools, and the help articles (refund, renew, login, monitoring…);
  - "where is …";
  - for the logged-in person, their own account via `/api/help/me` (only their own data).
  - "How much do you charge?" keeps the agency answer and adds the self-serve prices under it.
- **`/api/chat` (AI):**
  - The system prompt now has the Growth Lab catalogue with live prices.
  - It adds plan, tool and help-article detail for product questions, and the person's own account.
  - It falls back to Groq when Workers AI fails.
  - The bot sends the login cookie (`credentials: same-origin`).
- **Paying members:**
  - AI replies are on by default and there is a "<plan> · priority" badge in the bot header.
  - Limits are 3× per minute and 5× per hour and day, with longer answers.
  - Their latest X-Ray (area scores, top actions with the fix, competitors) is in the prompt, so "what should I fix first in my X-Ray?" gets coaching from their own report.
  - With AI off, the same coaching comes straight from the report's top actions.
- **Owners** count as Agency members.

Tests:
- `tests/v201-functions.test.mjs`: 9 checks.
- `tests/v202-engine.test.js`: 9 checks.
- `tests/v203-chat.test.mjs`: 11 checks.
- `tests/v203-bot.test.js`: 17 checks.
- The bot regression (547) is unchanged and passes.
