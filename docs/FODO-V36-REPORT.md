# FODO v36

v36 builds on v35. The architecture is unchanged and no database migration is needed.

## 1. Each page loads only the content data it uses

`js/data.js` held every service, industry, case, article, FAQ, quiz and game question (28 KB gzip) and was loaded on all 103 public pages.

- `js/data.js` is still the one place to edit copy.
- Each build now generates small slices in `js/d/` from it (do not edit those files).
- Each page gets only the slice its scripts read. Most pages need none: contact, tools, service and location pages.

| Page | Slice |
|---|---|
| Home | services, cases, articles, stages |
| Services | services |
| Industries | industries, services |
| Work | cases, services |
| Insights | articles |
| Checklists | checklists |
| FAQ | FAQs |
| Quiz / Challenge | quiz / game |

- **Chatbot:** it needs everything, so when it opens it loads the full `js/data.js` first.

Measured with `npm run audit:performance` (gzip):

| | Median public page JS |
|---|---|
| v35 | 65.7 KB |
| v36 | 38.4 KB |

103 pages are about 27 KB lighter and no page got heavier.

## 2. Search Console and Bing verification for client sites

Website Builder → Settings → SEO now has **Google verification** and **Bing verification**.

- **How to use it:** paste the HTML tag from Search Console (or just the code), publish, then press Verify.
- **Why it matters:** this works on a `*.fodo.site` address, where the client cannot add a DNS record.
- **Safety:** only a plain code is stored. Anything else (markup, script) is dropped, and the renderer checks again.

fodo.co.in itself keeps DNS verification. A meta-tag route there would run a function on every homepage visit, so it was not added.

## 3. Shared collections: Team, Reviews, Portfolio

One list per website, shown by any number of sections.

- **Turning it on:** a Team, Reviews or Portfolio section → Content → *Shared collection*. The section's existing items move into the collection the first time.
- **How many to show:** "How many" sets the limit, e.g. the latest 3 reviews on the home page and all of them on a reviews page.
- **Portfolio:** can be filtered by category.
- **Editing:** edit once in the collection editor (or in the left panel → Collections) and every section using it updates. Reusable components can use collections too.
- **Reviews:** each review keeps *where it came from* (Google review, email…). The editor asks for real reviews only, and nothing in FODO writes reviews.
- **Storage:** collections live inside the site document (`doc.collections`). Only known lists and fields are kept, text is clipped and escaped, and each list is capped (60 team / 100 reviews / 100 projects).
- **Older sites:** sections without a shared collection render exactly as before.

## 4. Client-site devices and button clicks

These were already tracked and shown in the builder's Stats panel (devices, sources, every button, contact taps), so nothing new was needed. The v34 "not done" note was out of date.

## Tests

- **New suite:** `tests/v36.test.mjs`, 27 checks:
  - Data split: every page gets the right slice, slices identical to `data.js`, chatbot loads full data.
  - Verification: tag pasting, script dropped, double check in the renderer.
  - Collections: field / list whitelist, cap, limit, category, components, escaping, old documents unchanged, real-reviews rule.
- **`v21-e2e` (+3, in Chromium):** switch a Reviews section to the shared collection, the real-reviews notice, and a new review appearing on the canvas.

Full run (`npm test`):

| | Suites | Checks | Failing |
|---|---:|---:|---:|
| v35 | 52 | 3,282 | 0 |
| v36 | 53 | 3,312 | 0 |

Audits: SEO 106 pages, 0 errors / 0 warnings; secret scan clean.

## Still open

- Element-level drag / resize (needs a new document model).
- Brain tool to create a whole new site.
- Switching the CSP from report-only to enforcing, after a clean week in Admin → Security reports.
