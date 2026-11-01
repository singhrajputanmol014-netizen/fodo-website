# FODO v46.2: Builder lag + errors fixed, payout adapters, Brain tools, enforced CSP, cross-browser checks

## 1. Website Builder: why it lagged and why errors came, and what changed

**What I measured** (a browser stress run: open the builder, edit, drag sliders, switch devices, side by side, Responsive health, undo spam, desktop + phone):

| # | Problem | Effect | Fix |
|---|---|---|---|
| 1 | **Every edit reloaded the whole canvas**: the iframe was replaced and the page jumped to the top (scroll 900 px → 0 after one edit) | It flashed white while fonts and images reloaded. This is the "lag" you feel. | **Double-buffered canvas.** The next version loads in a hidden second frame and replaces the visible one only when it is ready, **at the same scroll position**. Several changes in the same moment become **one** repaint. |
| 2 | Design sliders (corner radius and so on) repainted on **every pixel** of a drag | Many reloads per second | Sliders now repaint at most every 140 ms. |
| 3 | **"Too many changes this hour"**: autosave shared a 600-per-hour limit with every other action | A long editing session hit it and showed an error | Autosaves have their own allowance (3,600 an hour). If a save is refused (limit or server hiccup), the builder **retries automatically** with growing waits. Your changes stay in the browser meanwhile, and it only tells you after the third failure. |
| 4 | The canvas message handler read `#wb-if` without checking it exists | Messages arriving after leaving the editor, or from Responsive-health test frames, could crash with "Cannot read properties of null" | Guarded. Messages from the loading frame are also accepted, and element selection is re-marked after the swap. |

Result: the same stress run on desktop and phone shows **0 page errors**, and the scroll position is kept after edits.

**Real-world error reports (new):**
- The builder now reports real errors from people's browsers: message, file and line, build and browser. No page content, and emails and URLs are stripped.
- They appear in **Builder → System health → "Errors people hit"**. The same error is counted once, not stored again.
- So if someone still sees an error, you'll see exactly which one, how often, and in which browser.

## 2. Payout adapters (Cashfree Payouts / RazorpayX)

**Payout details (pro side)**
- **Where:** Earnings & payouts → **Payout details**.
- **Choices:** UPI ID, or bank account (typed twice) + IFSC + holder name.
- **Checks:** UPI format, 9–18 digit account, IFSC format.
- **Storage:**
  - Stored **encrypted** (AES-GCM, key `PAYOUT_ENC_KEY`, or `SITES_SECRET_KEY`).
  - Only shown masked: `•••• 9012 · HDFC0001234` or `aa•••@okicici`.
  - Without a key, details are not stored at all.
- **Security alert:** a change sends the pro a notification.

**Sending (admin / finance only)**
- Marketplace admin → Payouts → **Send ₹X**. The amount is always the payout's net from the database.
  - **Cashfree Payouts:** creates the beneficiary once, then a transfer with an idempotent transfer id per attempt.
  - **RazorpayX:** one payout, in paise, to the UPI ID or bank account, with an idempotency key.
- **Statuses:**

| Status | Meaning |
|---|---|
| **Sending… (provider)** | The provider accepted the transfer and is processing it |
| **Paid** | The provider confirmed SUCCESS / processed |
| **Failed** | Refused or reversed. The reason is shown and it can be sent again (new attempt id) |

- **Checking:** a "Check status" button, plus the daily scheduler checks transfers in progress.
- **No double payment:**
  - a payout can't be sent twice;
  - it can't be "marked paid by hand" while a transfer is in progress.
- **Pros see** "Being sent" / Paid with the reference and get a "Payout sent" notification.
- **Audit:** everything is audited. The Brain **cannot** send money.
- **Setup:**
  - Cashfree: `CASHFREE_PAYOUTS_ON=1`, `CASHFREE_PAYOUT_CLIENT_ID`, `CASHFREE_PAYOUT_CLIENT_SECRET` (the Payouts keys, not the payment-gateway keys). Add `CASHFREE_ENV=production` for live.
  - RazorpayX: `RAZORPAYX_ON=1` + `RAZORPAYX_ACCOUNT` (your RazorpayX account number), using the existing Razorpay keys.
  - Plus `PAYOUT_ENC_KEY`.
- **Test in sandbox / test mode first.** The provider calls follow their public APIs but were tested here against mocks, not the live providers.

## 3. Brain tools (read-only)

| Tool | What it answers |
|---|---|
| `biz_analytics` | The analytics numbers |
| `mk_refunds_open` | Refunds still open |
| `mk_payouts_due` | What is owed, whether pros have added payout details, the last failure reason |
| `mk_disputes_open` | Open disputes |
| `privacy_requests` | Data downloads and deletions in the last 30 days (counts only) |

All five are level 0. The Brain still never sends money or refunds.

## 4. Content-Security-Policy enforced on the app pages
- **Where:** `/workspace/`, `/fodo-pros/` and `/website-builder/` now **enforce** a CSP. The rest of the site stays report-only.
- **What the policy does:**
  - blocks plugins (`object-src 'none'`);
  - blocks framing by other sites;
  - allows only the known services: Razorpay, Cashfree, Google sign-in, Firebase, Google Fonts, the website embeds (YouTube, Vimeo, Spotify, Maps, Calendly, Typeform, Google Forms, Cal.com), and Cloudflare analytics;
  - reports any violation to `/api/csp-report` (Admin → Security).
- **Tested:** the builder (including the canvas, previews, embeds, side by side and Responsive health), the Workspace pages and FODO Pros showed **0 violations**.
- **Not tested here:** the live Google / Firebase login popups and payment windows can't be opened offline. After deploying, try a login and a payment once and look at Admin → Security. If anything is blocked, the three `Content-Security-Policy` lines in `scripts/build_pages.py` (`APP_CSP`) can be adjusted or removed.

## 5. Firefox / Safari
- **New test:** `tests/cross-browser.test.js` checks home, sign-in, the builder (edit → canvas → autosave, side by side), the Workspace pages, phone width, page errors and CSP violations.
- **Where it runs:** GitHub runs it in **Chromium, Firefox and WebKit (Safari's engine)** on every push (`.github/workflows/fodo-browsers.yml`, no secrets needed).
- **Limit here:** this workspace can't download Firefox / WebKit, so it ran here in Chromium only (all pass). The first Firefox / Safari results come from GitHub after you push.
- **Code audit:** I checked the code for browser APIs that Safari or Firefox lack. Only CSS `zoom` is used, which both support. Scroll-linked animations already fall back.

## Files
- **New:**
  - `functions/_lib/payouts.js`.
  - `tests/v462.test.mjs` (47 checks).
  - `tests/cross-browser.test.js`.
  - `.github/workflows/fodo-browsers.yml`.
- **Changed:**
  - `js/website-builder.js`: paint, onFrame, save retries, error reporter.
  - `js/wb-elements.js`: `remark`.
  - `js/wb-panels.js`: slider debounce.
  - `js/wb-home.js`: errors in System health.
  - `css/website-builder.css`.
  - `functions/_lib/sites.js`: `reportClientError`, `clientErrors`.
  - `functions/api/sites/[[path]].js`: `client-error`, autosave allowance.
  - `functions/_lib/biz.js`: `payoutsOn`, manual paid guard.
  - `functions/api/biz/[[path]].js`: payout-method, send, check.
  - `functions/api/monitor/tick.js`: payout checks.
  - `functions/_lib/privacy.js`: payout details deleted with the account.
  - `functions/_lib/brain/tools.js`.
  - `js/workspace.js`.
  - `scripts/build_pages.py`: `APP_CSP`.
  - `tests/run.mjs`.
