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
