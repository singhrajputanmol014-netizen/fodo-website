# QA report — FODO site (lean build, 16 routes + 404)

## Automated static audit (`scripts/audit.py`) — PASS
16 routes exist and are non-empty · no dead/empty hrefs · all local link targets exist · unique title, meta description, exactly one H1 per route · every `<button>` has an explicit type · sitemap lists 16 routes, excludes 404 · no references to unbuilt routes.

## Real browser tests (Playwright/Chromium, local static server) — PASS
* All 16 pages (15 + 404) loaded at **360, 375, 390, 768, 1024, 1280, 1440 px**: header + footer rendered, 1 H1, **no horizontal overflow** (one overflow found on home KPI bars at ≤768px → fixed in CSS, re-verified).
* No JavaScript page errors on any route. (Only console error: Google Fonts blocked in the test sandbox — system fallbacks rendered; not a site defect.)
* Hash detail states open directly: `/services/#meta-ads`, `/industries/#saas`, `/work/#…`, `/insights/#…`.
* Mobile drawer opens, closes on Escape; cookie banner Reject hides banner.
* Services filter (SEO → 3 cards) and card → detail navigation.
* Growth Score: 10 steps, validation, terminal animation, radial score rendered (test produced 11/100 with weakest answers).
* ROI calculator: live recalculation (10,000 visitors × 2% × ₹2,000 → 200 leads, ₹4,00,000, ROAS 8.00x → 9.60x).
* Quiz: 10 questions answered, result 4/10 with review.
* FODO Challenge: full run through all 4 rounds (pick, tap-to-place funnel, pause/scale/optimise, rapid-fire) → result 36/100, free-consultation claim form shown (discounts OFF).
* Contact form: step validation (bad email + phone → 2 inline errors), valid data advances, `?score=64` prefilled into hidden field, call mode adds date/time.
* Checklist tick → progress 1/8; FAQ search "budget" → 2 results.

## Not measured / manual
* Lighthouse: **NOT MEASURED** (no network in sandbox).
* Real-device touch drag, screen-reader pass, WhatsApp hand-off on a phone, print output: manual checks remaining.
* Endpoint success/failure path: code paths exist (POST JSON, error → WhatsApp fallback) but untested without a real `formEndpoint`.
