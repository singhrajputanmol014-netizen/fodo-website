# FODO v51.2 report: 10 new services + "Brands we have worked with" band

Owner asked for two things (15 Nov 2026): add the missing services to /services/, and show the brands the team has
worked with on the home page, with motion, using each brand's real logo pulled from its live website.

## 1. Ten new services (20 → 30)
New pillar **Tech & Commerce** joins the existing seven. New service pages, each with the full template
(problem, what we do, tracking, channels, deliverables, learn-topics, FAQs + FAQ/Service/Breadcrumb schema):

| Slug | Name | Pillar |
|---|---|---|
| /services/ai-automation/ | AI Automation | Automation |
| /services/ai-chat-assistants/ | AI Chat Replies (Instagram, FB, WhatsApp, Email) | Automation |
| /services/whatsapp-marketing/ | WhatsApp Marketing | Automation |
| /services/ga4-gtm-setup/ | GA4 & GTM Setup | Automation |
| /services/email-marketing/ | Email Marketing | Content |
| /services/google-business-profile/ | Google Business Profile (Google listing) | SEO |
| /services/app-development/ | App Design & Development | Tech & Commerce |
| /services/hrms-setup/ | HRMS Setup & Implementation | Tech & Commerce |
| /services/marketplace-listing/ | Marketplace Listings (Amazon, Flipkart, Meesho) | Tech & Commerce |
| /services/cloud-kitchen-marketing/ | Cloud Kitchen Setup & Marketing | Tech & Commerce |

Asked-for items already covered and NOT duplicated (one primary intent per URL, per the SEO rules):
"ranking" = /services/seo/ and the new Google Business Profile page; "GA4 / Google Analytics" = the new GA4 & GTM
Setup page (implementation) alongside the existing /services/analytics/ (strategy + dashboards; its FAQ now points
to the other).

Where it changed: `js/data.js` (10 services + `tech` pillar), `scripts/service_pages_content.py` (Delhi NCR copy +
bot-mind topics per page), `scripts/service_pages_global.py` (global copy), counts 20 → 30 in `seo_config.py`,
`build_pages.py` (pillar aside "Eight pillars", "All 30 services", meta description) and `js/bot-kb.js`.
All titles ≤ 60 chars, descriptions ≤ 160, no long dash, built pages carry CSP meta, sitemap went 102 → 112 URLs.

## 2. Brand band on the home page
New section right under the hero: "Brands we have worked with", a pure-CSS infinite marquee (no inline scripts, CSP
unchanged) of white logo tiles that are grayscale at rest, colour + lift on hover; hover pauses the strip; the strip
collapses to a static centred wrap under `prefers-reduced-motion`; dark and light themes both checked by screenshot.
- Logos were pulled from each brand's live site (via the owner's browser; the container has no open internet):
  ABRAKH, Agricul, GPC Group (white logo, so its tile is dark), Expocity Travels, Flyscan, Asia Dawn Bio Care,
  Gausuch Farms, Khushi Studio (from giftingstudio.in; khushistudio.in's DNS did not resolve at build time),
  Jeevan Shakti Herbs → `assets/brands/*.webp` (height-112 trimmed webp, 6–20 KB each).
- Plann4U and Ante Air Logistics have no public website logo (app / LinkedIn-only), so both are set as Inter Tight
  wordmarks in the same style; swap the files in `assets/brands/` when real logo files arrive.
- Copy stays honest: "Marketing, websites, e-commerce, apps and HRMS work delivered for these brands by the FODO
  team." No invented metrics, clients list is from the owner.
- Code: `BRANDS` + `BRAND_BAND` in `scripts/build_pages.py`, `.bb-*` styles at the end of `css/studio.css`.

## Tests
- `node scripts/check.mjs`: OK (603 files).
- `python3 scripts/seo_audit.py`: same 11 pre-existing errors as v51.1 (the noindex /workspace/ and /fodo-pros/
  shells), zero errors on the 30 service pages and the home page.
- Static browser suites (Chromium, local static server), all green:
  `v5-pages` **668/668** (every route at 7 widths, 1 H1, no overflow, no page errors), `v9-seo` **137/137**,
  `design-smoke` **23/23**, `v6-features` **40/40**, `v203-bot` **17/17**, `bot-regression` **547/547**,
  `v12-brand` **11/11**.
- One test updated because the product intentionally changed: `tests/bot-cases.js` "fodo services" now expects
  "30 services" (was "20 services"). No test was deleted or skipped.
- No backend / database change in v51.2, so `SCHEMA_VERSION` stays as v51.1 set it.
- Runtime suites (wrangler) and Firefox / WebKit run in GitHub Actions on push, as usual.
