# FODO Business X-Ray — implementation notes

Page: **/business-x-ray/** (Growth Lab → Business X-Ray). Enter a website → crawl (≤ 50 pages) → technical / conversion / trust checks →
live market searches → real competitors (≤ 5) compared like-for-like → customer voice → keyword opportunities → scored
opportunities → AI summary that may only cite evidence IDs → report, PDF, Excel, CSV, JSON, share link.

## How it is built (and why)
Cloudflare's free plan gives a request ~10 ms of CPU, so **the server never parses pages**. It fetches them safely and passes the
bytes through; the visitor's browser parses and analyses them (`js/xray-engine.js`, deterministic rules). The server keeps every API
key secret, blocks unsafe addresses, rate-limits, caches, stores the job and the report, and logs.

The AI is **never the source of truth**: it receives the structured research pack (scores, checks, opportunities, competitors,
customer-voice clusters, evidence items with IDs). Anything it writes without a valid evidence ID is removed and the removal is shown.
Without AI the summary is written by rules from the same data.

Labels: **OBSERVED** (seen on a page / in an API answer), **INFERRED** (derived by a rule), **ESTIMATED** (third-party estimate,
e.g. search volume), **UNKNOWN**. A missing source makes its module "Data unavailable" — no number is ever filled in.

## Files
Created
- `functions/api/xray/[[path]].js` — router: health, start, status, progress, fetch, search, psi, seo, ai, rows, report
- `functions/_lib/xray-core.js` — SSRF-safe fetch, provider adapters (Serper/Brave → one shape), D1/KV storage, rate limits, cache, logs
- `js/xray-engine.js` — crawler, robots.txt, sitemap, page parser, discovery, checks, search/competitor/voice analysis, scores, opportunities, plan
- `js/xray.js` — job runner (real progress), report UI, evidence drawer, exports, share link
- `scripts/build_pages.py` → `business-x-ray/index.html` (page), Growth Lab card, search index, sitemap
- `css/studio.css` §33 (X-Ray styles); `js/cf-export.js` gained a text PDF writer (`FODO_EXPORT.pdf`)
- Tests: `tests/xray-functions.test.mjs`, `tests/xray-e2e.test.js`, `tests/xray-fixtures/*` (5 fictional businesses + competitors + search/PageSpeed stand-ins)

Modified: `js/main.js` (menu, drawer, footer links), `functions/api/export.js` (PDF/JSON downloads for phones), `wrangler.toml` (D1 block, commented).

## Environment (Cloudflare Pages → Settings → Variables and Secrets)
| Name | Type | Needed? | What it does |
|---|---|---|---|
| `SERPER_API_KEY` | Secret | Recommended | Google search results (market research, competitors, customer voice, brand presence). serper.dev: 2,500 free searches (one-time), ~12 per X-Ray |
| `PAGESPEED_API_KEY` | Secret | Optional | Higher Google PageSpeed quota (works without a key at a low quota) |
| `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` | Secret | Optional (paid) | Search volume + CPC. **Not tested against a live account.** Without it volume = "Data unavailable" |
| `GEOAPIFY_KEY` | Secret | Already set | Nearby map listings as competitor candidates for local businesses |
| `BRAVE_API_KEY` | Secret | Alternative | Used only if `SERPER_API_KEY` is not set |
| `XRAY_PER_HOUR` (4), `XRAY_PER_DAY` (60), `SEARCH_DAILY_CAP` (60) | Text | Optional | Abuse / cost limits |
| `XRAY_TEST_MODE`, `XRAY_TEST_MAP` | — | **Never set live** | Offline test world only |

Bindings: `AI` (Workers AI) and `CHAT_KV` already exist. **D1**: create database `fodo-xray`, paste its ID into the commented block in
`wrangler.toml`, remove the `#`s. Tables are created automatically on first use. Until then reports are stored in KV.

## Routes
API: `GET /api/xray/health` · `POST /api/xray/start` → `{jobId, status:"queued"}` · `GET /api/xray/status/:jobId` →
`{status, progress, currentStage, completedModules}` · `POST /api/xray/progress|fetch|search|psi|seo|ai|rows|report` · `GET /api/xray/report/:jobId`.
UI: `/business-x-ray/`, shared report `/business-x-ray/?r=<jobId>`.

## Database (D1)
`xray_jobs, xray_reports, xray_businesses, xray_pages, xray_competitors, xray_evidence, xray_findings, xray_opportunities, xray_sources,
xray_scores, xray_counters` — no secrets stored. Reports also kept in KV for 90 days when D1 is not bound.

## Scoring
- Check = pass/warn/fail + 0–100 score + weight + evidence IDs. Area score = weighted average of its checks; overall = weighted average of
  areas that have data (Market 15, Website 15, Search 20, Trust 15, Conversion 20, Competitive 15). Tap a score to see its parts.
- Opportunity priority score = impact × confidence × urgency ÷ effort, normalised to 0–100. P0 = impact ≥ 4, effort ≤ 3, urgency ≥ 4;
  P1 impact ≥ 4; P2 impact 3; P3 the rest. Report shows top 3 immediate fixes, top 5 growth, top 5 strategic, then a 4-week plan.
- Keyword opportunity = demand × intent × relevance × gap (normalised) when volume exists; otherwise High/Medium/Low/Unknown labels.

## Known limitations
- Live behaviour with real websites, Serper and Workers AI was NOT tested from the build environment (no internet there). Everything was
  tested against an offline world of five fictional businesses on the real Cloudflare runtime (workerd + D1 + KV).
- Pages that render their content only with JavaScript show little text to the crawler (no headless browser on the free plan).
- Search positions are a snapshot for one country; customer voice uses search-result excerpts, not full reviews.
- Sampled AI visibility uses one open model on Workers AI — not ChatGPT, Gemini or Google AI Overviews.
- Competitor traffic and Google Business Profile insights are never shown (no legitimate public source).
- The PDF uses the standard Helvetica font: non-Latin text (e.g. Hindi) appears as "?". Excel/CSV keep it.
- If the visitor closes the tab mid-run the job stops (the browser runs the stages); it can be started again.
