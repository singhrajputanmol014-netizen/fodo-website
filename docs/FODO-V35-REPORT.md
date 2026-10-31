# FODO v35: the next phase after v34

v35 builds on v34. Nothing was rewritten, and the Cloudflare Pages / D1 / KV architecture is unchanged.

## What shipped

### 1. Asset manager (Website Builder → Media)

The image library:
- **Organise:** folders, search, drag-and-drop upload.
- **Image details:** name, alt text and folder per image.
- **Focal point:** click to set it. Every crop and `object-fit: cover` keeps that point in view.
- **Crop and resize:** 1:1, 4:3, 16:9 and 3:2 crops, plus resize to 1600 / 1200 / 800 px. Each crop is saved as a new copy and the original is kept.
- **WebP in the browser:** images are encoded on canvas, with a JPEG fallback on browsers that cannot write WebP. No paid image service is needed.
- **Duplicates:** the same file uploaded twice is stored once (SHA-256).
- **Width / height:** saved and written onto the `<img>`, so pages don't jump while images load (CLS).
- **Replace everywhere:** swaps one image for another on every page.
- **Delete:** warns when the image is still used and lists where.

Migration: additive columns `alt`, `folder`, `width`, `height`, `focal`, `hash`, `updated_at` on `site_media`.

**Real bug found and fixed:** builder images were saved as `/api/sites/media/<id>`. That path only exists on fodo.co.in, so the image broke on `*.fodo.site` and on custom domains. Sites and custom-domain responses now rewrite it to the absolute API URL (`absMedia`).

### 2. Speed: chatbot on demand

The chatbot is 14 scripts, about 240 KB gzip (measured).

In v34 it started downloading on the visitor's first scroll or touch, or at most 2.5 seconds after load. On a phone that competed with the page the visitor had just opened.

Now a lightweight button is shown immediately, and the bot loads only when one of these happens:
- the visitor taps, hovers or focuses it
- the tab already has a chat open (the conversation continues)
- 6 seconds after the page has loaded and gone idle

It never loads early on Save-Data or 2G connections.

Splitting `data.js` was **not** done. It touches every page script; it remains the next performance step.

### 3. Security headers (site-wide)

- `Content-Security-Policy-Report-Only` for every page. Nothing is blocked yet.
  - Violations go to `/api/csp-report`.
  - They are grouped by directive, blocked origin and page.
  - No query strings, emails or tokens are stored.
  - Limited to 60 reports per hour per IP.
- Admin → **Security reports** shows what the policy would block.
- When the list stays clean (or only shows things you recognise), the header can be switched from `-Report-Only` to enforcing.
- Also added: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff` and `Permissions-Policy` (camera off; microphone and location only for fodo.co.in itself, which the Brain voice and the finder use).
- The stricter Brain / admin headers are unchanged.

**Real bug found and fixed:** `scripts/build_pages.py` rewrites `_headers` on every build. That silently dropped the v33.1 `no-cache` rules for `/js/*`, `/sites/lib/*` and `/website-builder/*`, so v34 shipped without them. All header rules are now written by `build_pages.py` itself, and a test fails if a rebuild loses them.

### 4. Client-site analytics

The builder's Stats panel now shows:
- a 30-day visits trend
- contact clicks (phone, email, WhatsApp)
- form messages and orders
- the conversion rate (contacts + messages + orders ÷ visits)

Everything is counted from real events; there is no sample data.

### 5. Partial refunds

Store → order → Refund… now asks for the amount (₹1 up to the full order). Two rules follow from that:
- A partial refund does not put stock back.
- A full refund puts stock back, as before.

The Cashfree lifecycle (`refund_processing` → `refunded` / `refund_failed`) and the double-click protection from v34 are unchanged.

Static page weight (`npm run audit:performance`) is unchanged: the median page is HTML 5.0 KB · CSS 60.4 KB · JS 65.7 KB · 13 requests. `/website-builder/` is +6.5 KB for the media library module.

### 6. Admin on a phone (found by the tests)

On a phone, a long email address in the Overview activity feed could not wrap. That widened the page, so the fixed bottom bar (Overview / Lab / Users / Costs / More) was pushed below the screen and could not be tapped. The v34 code fails the same check.

- **Fix:** feed text now wraps, and on a phone nothing can widen the page.
- **Also:** activity rows show "Used a tool" instead of the raw `tool_use`.

## Tests

| | Suites | Checks | Failing |
|---|---:|---:|---:|
| v34 final | 50 | 3,246 | 0 |
| v35 | 52 | 3,282 | 0 |

The new suite `tests/v35.test.mjs` (34 checks) covers:
- media: dedupe, metadata, tenant isolation, in-use delete warning
- `<img>` width / height / focal output
- `absMedia` rewrite on client sites
- conversions and trend
- partial refund
- headers written by the build
- CSP report grouping and privacy
- the lazy chatbot

The full run (`npm test`) found two more real problems, both fixed: the admin phone bar (section 6), and Google Fonts plus Vimeo / Spotify embeds in client-site previews missing from the CSP allow-list.

`bot-memory` was updated: the bot no longer loads on page load, so the test hovers the button first.

Audits: SEO 106 pages, 0 errors / 0 warnings; secret scan clean.

## Still the owner's to do

- Set `SITES_SECRET_KEY` in both Pages projects.
- Add the store webhook in each merchant's Cashfree dashboard.
- After a week of clean Security reports, switch the CSP to enforcing.
