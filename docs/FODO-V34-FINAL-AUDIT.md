# FODO v34: final audit

> **v35 update:** the asset manager, site-wide CSP (report-only), client-site analytics and partial refunds from the lists below are done in v35. See `FODO-V35-REPORT.md`.

**Scope:** hardening and Website Builder upgrade on the existing platform (no rewrite, no framework change).

**Baseline:** `docs/v34-audit-baseline.md`.

## Tests (measured with `npm test`, 1 Nov 2026)

| | Suites | Checks | Failing |
|---|---:|---:|---:|
| Before v34 | 46 | 3,114 | 0 |
| After v34 | 50 | 3,246 | 0 |

- **New suites:**
  - `v34-store` (34 checks)
  - `v34-security` (30)
  - `v34-builder` (17)
  - `v34-site` (17)
- **Checks added to existing suites:**
  - +11 in `v21-e2e` (builder UI in Chromium)
  - +4 in `v17-e2e` (enquiries, website settings, booking link, founding counter)
- **Contract changes:** 3 older assertions changed because v34 changed the behaviour on purpose:
  - stock is now reserved at checkout
  - "1 page read" grammar
  - admin now has 21 menu sections
- **No test was deleted.**
- **The new tests catch the old bugs:** run against the pre-v34 store code, `v34-store` fails 11 checks, including oversold last items, coupons used twice, and five simultaneous orders all numbered 1004.

## Fixed

### Store (`functions/_lib/shop.js`, `docs/store-v34.md`)

1. Last-item oversell. Stock is decremented atomically (`WHERE stock >= qty`, `json_set` for variants) with rollback.
2. Coupon `max_uses` race. One conditional UPDATE.
3. Coupons used up by failed payments. They are now `reserved` → `consumed` → `released`, each step happening once.
4. Duplicate order numbers. Unique index plus retry.
5. Double checkout. Idempotency key sent by the checkout page.
6. Abandoned payments holding stock forever. Released after 2 hours; a late PAID is still honoured.
7. Payment confirmation has a single path (`verifyPayment`, always asking Cashfree). It is safe when the return page and webhook arrive together.
8. New signed store webhook (HMAC, 15-minute window, body never trusted).
9. Refunds.
   - Online refunds go through Cashfree: `refund_processing` → `refunded` / `refund_failed`, with refund id, gateway id, amount, reason and timestamps.
   - COD / WhatsApp refunds need explicit manual confirmation.
   - Two clicks produce one refund.
10. Order tokens: 32 characters, constant-time compare, never in responses; lookups limited to 120/hour per IP; order page sends `no-referrer`, `no-store` and `noindex`.
11. Deleting a product, post or discount through another site id now returns 404 instead of a silent OK.

### Security

12. Password-protected client pages:
    - PBKDF2-SHA256 (100k iterations, salted); old pages still open.
    - 8 tries per 15 minutes.
    - Signed HttpOnly / Secure / SameSite cookie for 12 hours.
    - Logout.
    - Changing the password logs everyone out.
13. Tenant-isolation matrix: 39 routes plus cross-site resource ids. Tested; nothing leaked, nothing needed fixing beyond item 11.
14. Regression tests for SSRF, custom-code isolation, XSS and path traversal.

### Website Builder (`docs/website-builder-v34.md`)

15. Responsive cascade: desktop is the base, tablet and mobile overrides are per section (spacing, text size, columns, alignment, width, gap, stack, hide / show). Breakpoints can be customised. The layer being edited is always shown.
16. Laptop device (1280px).
17. **Make Responsive**: measured in real frames, rules only for the broken layer, before / after phone preview, Accept / Reject, undoable.
18. **Responsive Health** at 4 widths, with click-to-select and fix automatically / manually.
19. **AI Edit** per section: 9 actions, before / after list plus live preview, nothing changes until Apply.
20. Conflict dialog with Keep mine (the server version is saved to history first), Keep server and Review changes. Saves are atomic on the server.
21. Offline / sync-failed states with automatic retry. Friendly errors (never `undefined` or "Internal Server Error").
22. Canvas zoom, fit, grid overlay, breakpoint chip, History shortcut.
23. Design tokens `muted` / `border`.
24. Module versioning through an import map, which fixed the "render.js does not provide embedUrl" stale-cache error (v33.1).

### SEO

| | Errors | Warnings |
|---|---:|---:|
| Before | 7 | 30 |
| After | 0 | 0 |

25. `/website-builder/` now has real static content before JS loads: H1, features, use cases, FAQ, CTA. Also OG / Twitter tags, breadcrumb, FAQ and SoftwareApplication schema. It is in the sitemap and linked from the footer.
26. Owner Brain is classified as private (not in the sitemap, not audited as a public page).
27. 13 Growth Lab tool descriptions are now 110–158 useful characters.

### Leads, booking, analytics, founding

28. Contact / audit / call forms save an enquiry in D1 (`fodo_leads`) with page, source, UTM campaign and answers, and email the team. WhatsApp stays as the fallback and as "Also send on WhatsApp" on the thank-you page.
29. Admin → **Enquiries**: list, filter, status, notes, CSV export, email / WhatsApp buttons.
30. Admin → **Website settings**:
    - booking link, provider and meeting type
    - GA4 and Meta Pixel (still loaded only after consent)
    - Google review link
    - founding slots total, taken and cohort
    - enquiry email

    All are validated, live within 60 seconds, no deploy needed.
31. The call form shows "Book a … on Cal.com" only when a booking link exists, never an empty link.
32. The founding counter is read from the server and hidden until the live number arrives (no stale "slots open").

### Infrastructure

33. Root `package.json` with `test`, `test:*` and `audit:*` scripts. Tooling lives in `tests/package.json` (pinned Playwright, Wrangler), so deploys never install it.
34. `tests/run.mjs`: one runner with a built-in static server, a per-suite table and an exit code.
35. `tests/perf-audit.mjs`: per-page HTML / CSS / JS / image weight and request count, with save / compare.
36. README rewritten. 8 new docs.

## Not fixed (deferred on purpose)

| Item | Why |
|---|---|
| Element-level free drag / resize, snapping, spacing guides, nested layer tree | The builder edits sections, not free elements. This needs a new document model; it was not bolted on. |
| Full asset manager (folders, crop, WebP / AVIF conversion, focal point), AI image tools | Needs image processing (Cloudflare Images or R2 + a resizer); not connected. |
| CMS collections beyond products + blog (team, testimonials, portfolio as collections) | Sections hold this content today; a collection layer needs a migration plan. |
| Per-site visitor analytics dashboard beyond the existing stats panel | The current panel (visits, top pages, sources, form messages) stays; devices / CTA clicks are not tracked yet. |
| Site-wide CSP on public pages | Must be measured against GA4, Pixel, Razorpay / Cashfree and the chatbot first; a blind CSP would break payments. |
| Code splitting of public-page JS / CSS (`data.js` 28 KB gzip on every page) | Measured. Splitting it touches every page script, so it is the next performance step. |
| Search Console verification field | Verification needs a DNS TXT record or a static file at the root; DNS needs no code. Shown as a note in Website settings. |
| Responsive measuring from the Brain | Needs a real browser; done in the builder. |
| Brain "create a whole new site" tool | The Brain edits, audits, fixes and publishes existing sites; creation stays in the builder wizard. |

## Changed files

- **New:**
  - `js/wb-v34.js`
  - `sites/lib/protect.js`
  - `functions/_lib/sitecfg.js`
  - `functions/api/leads.js`
  - `functions/api/site-config.js`
  - `package.json`
  - `tests/package.json`, `tests/run.mjs`, `tests/perf-audit.mjs`, `tests/.gitignore`
  - `tests/v34-{store,security,builder,site}.test.mjs`
  - `docs/*-v34.md`, `docs/v34-audit-baseline.md`, this file
- **Store:** `functions/_lib/shop.js` (migrations, stock / coupon / number / idempotency, verifyPayment, storeWebhook, refund lifecycle, delete 404s); `sites/lib/shop.js` (checkout idempotency key); `sites/lib/serve.js` (order-page headers, protected-page gate, logout).
- **API:** `functions/api/sites/[[path]].js` (webhook route, order-lookup rate limit, PBKDF2 passwords, refund options, `keepServer`); `functions/api/admin/[[path]].js` (site-settings, enquiries).
- **Builder:**
  - `functions/_lib/sites.js`: breakpoints, tokens, new password format, conflict `updatedAt` + `keepServer`.
  - `sites/lib/render.js`: responsive classes + CSS, breakpoints, tokens.
  - `js/website-builder.js`: devices, layers, save states, conflicts, offline, AI Edit button, history.
  - `css/website-builder.css`.
- **Public site:** `js/main.js` (live settings, founding counter, Website Builder link); `js/forms.js` (enquiries + booking link); `js/analytics.js` (IDs from settings); `scripts/build_pages.py` (builder SEO page, sitemap, footer link, tool descriptions, thank-you WhatsApp); `scripts/seo_config.py` (private routes).
- **Admin:** `js/admin.js` (Enquiries, Website settings); `css/admin.css`.
- **Store screen:** `js/website-store.js` (the same order lifecycle as the server: Refund… with Cashfree or confirmed cash refund, Check refund status, refund details on each order).
- **Tests:** `tests/v21-e2e.test.js`, `tests/v17-e2e.test.js`, `tests/v29-store.test.mjs`, `tests/xray-e2e.test.js`.

## Database migrations (additive, automatic)

| Table | Change |
|---|---|
| `site_orders` | `+code_state`, `+refund`, `+idem`; unique indexes `(site_id, number)`, `(site_id, idem)` |
| `site_pw_attempts` | new: protected-page brute-force counter |
| `fodo_leads` | new: enquiries |
| `lab_config` | new key `site` (website settings) |

No column was removed or renamed. Older builder documents render exactly as before (tested).

## Performance (`npm run audit:performance`, gzip)

| | Median public page |
|---|---|
| Before | HTML 4.5 KB · CSS 60.4 KB · JS 65.2 KB · 13 requests |
| After | HTML 4.5 KB · CSS 60.4 KB · JS 65.7 KB · 13 requests (+0.5 KB for the live settings) |

- `/website-builder/` grew by 12.3 KB (new editor module + static SEO content). No other page grew by more than 4 KB.
- Field metrics (LCP / CLS / INP / TTFB) need real users. Check them in PageSpeed / CrUX after deploy.

## Remaining risks

- `SITES_SECRET_KEY` must be set in both Pages projects for store payment keys, and it strengthens protected-page cookies.
- Prices changed in Admin → Config (v17) still override the code defaults, including the v33 tool prices.
- Store webhooks have to be added in each merchant's Cashfree dashboard to cover customers who close the tab after paying.
- The browser tests use a fake Gemini Live socket and a fake microphone; real-device voice needs a manual check.
- Partial refunds are supported by the API but the store screen offers full refunds only.
