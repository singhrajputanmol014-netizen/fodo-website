# Security v34

Nothing that existed was weakened: owner-only Brain, tool risk levels and confirmations, audit logs, secret redaction,
SSRF guard, payment price checks, tenant checks. v34 adds the items below. Tests: `tests/v34-security.test.mjs`
(30 checks), `tests/v34-store.test.mjs` (34), `tests/v34-site.test.mjs` (17). `npm run audit:security` runs them plus a secret scan.

## Tenant isolation (tested)

- **Routes:** tenant B calls all 39 website routes of tenant A (doc, versions, restore, publish, export, forms, stats, health, audit, AI, domains, members, transfer, shares, duplicate, archive, template, password, media, products, orders, discounts, posts, payments). Every call gets 403 / 404 and no data leaks.
- **Resource ids:** using tenant A's product / discount / post ids through tenant B's own site id also gets 404.
- **Lists:** tenant B's site list never contains tenant A, and errors don't reveal the owner.
- **Logged out:** 401 / 403.

## Password-protected client pages (`sites/lib/protect.js`)

- **Hashing:** PBKDF2-SHA256 with 100,000 iterations and a 16-byte random salt, stored as `p2$100000$salt$hash`.
- **Old pages:** pages saved with the old `sha256(password|site)` still open with their password and move to the new format when the owner next sets it.
- **Brute force:** 8 wrong tries per visitor (IP) per page, then a 15-minute lock that also blocks the right password. Other visitors are not affected.
- **Session cookie:** a 12-hour HMAC-signed `HttpOnly`, `Secure`, `SameSite=Lax` cookie, scoped to the page.
  - The signature includes the stored hash, so changing the password logs everyone out.
  - Tampered or extended cookies are refused.
  - `?logout=1` clears it.
- **Minimum length:** 6 characters.

## Store

See `store-v34.md`: atomic stock and coupons, unique order numbers, idempotent checkout, signed and replay-safe webhooks,
the real refund lifecycle, private order tokens.

## Enquiries and settings

- **`POST /api/leads`:**
  - Same origin only, with a honeypot and a limit of 8 per IP per hour.
  - The phone is normalised and only an IP hash is stored.
  - Visitors get friendly errors.
- **`/api/site-config`:** returns public values only. The enquiry email is never exposed.
- **Admin website settings:** owners / admins only, validated (https links, GA4 / Pixel formats, slot ranges) and logged.

## Client code isolation (tested)

- **Custom code** is never served on the shared `sites.fodo.co.in/<slug>/` address, only on the client's own domain.
- **Escaping:** section text is HTML-escaped (stored XSS test).
- **Sandbox:** the `fodo.co.in/api/sites/view/…` fallback is served with a `sandbox` CSP and runs no custom code.
- **Path traversal:** paths on the sites project go nowhere.

## SSRF regression (tested)

Blocked:

- loopback, `10.x`, `192.168.x`, the `169.254.169.254` metadata address, `metadata.google.internal`, `[::1]`
- `file:` URLs, credentials in URLs, odd ports
- hex / decimal IP forms
- redirects to the metadata address

Normal public URLs still work.

## Headers

- **Present:** Owner Brain, admin and account have `no-store`, `noindex` and frame / CSP rules in `_headers`. Builder assets are `no-cache` (revalidated).
- **Not added:** a site-wide CSP for the public pages. It needs a measured allow-list for GA4, Meta Pixel, Razorpay / Cashfree and the chatbot. A blind CSP would break payments and analytics, so it is a separate, tested change.
- **Already in place:** HSTS comes from Cloudflare's SSL settings (enable "Always use HTTPS" + HSTS in the dashboard).
