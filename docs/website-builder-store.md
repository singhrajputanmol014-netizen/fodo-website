# Website Builder Phase 2 — Store & Blog (v29)

The builder can now run a small online shop and a blog on any customer website. Everything is part of the same
Website Builder: customers manage it from **Editor → Store** (Products · Orders · Discounts · Blog · Store settings).

## What a store owner can do
| Area | What works |
|---|---|
| Products | name, price, compare-at price, description (safe markdown), up to 12 photos (upload or https link), collection, draft/active, **options/variants** (each with its own price + stock), stock tracking |
| Storefront | `Products` section (any page, filter by collection), product page `p/<slug>/` with option picker + Product structured data, cart `cart/`, checkout `checkout/`, order page `order/<id>/?t=…`, products in `sitemap.xml` |
| Payments | **Cash on delivery**, **order on WhatsApp** (wa.me link with the order), **online payment through the merchant's OWN Cashfree account** (UPI, cards, netbanking) — money never passes through FODO |
| Pricing rules | flat shipping, free shipping above an amount, GST % (inclusive or added on top), discount codes (% or ₹, minimum order, max uses, expiry) |
| Orders | list + filter, customer details, status flow (paid/cod/whatsapp → shipped → delivered, cancel, refund), "Check payment" asks Cashfree, emails to merchant + customer, 30-day stats |
| Blog | posts with markdown editor + live preview, cover image, tags, author, draft / publish now / schedule, `blog/` list + `blog/<slug>/` pages with BlogPosting data, `Blog posts` section, posts in sitemap |
| Templates | new FODO-original templates: **Store — Boutique**, **Store — Home Kitchen & Bakery**, **Blog — Journal** |

## Security rules (all enforced on the server, all tested in `tests/v29-store.test.mjs`)
- **Tenant isolation**: every merchant route resolves the website with `siteFor()` first; every SQL statement is also
  scoped `WHERE site_id = <that website>`. Using your own website id with another store's product id finds nothing.
- **The browser is never trusted for money**: checkout receives only product ids, option index and quantity. Prices,
  stock, discounts, shipping, tax and the total are computed on the server from the database.
- **Payment is verified with Cashfree**, never from the redirect: an online order stays `pending` until FODO asks
  Cashfree for the order and it says `PAID` with the same amount. Stock is taken only then (COD/WhatsApp: at order time),
  exactly once (`stock_done`).
- **Merchant secrets**: the Cashfree secret key is checked against Cashfree, then stored **AES-GCM encrypted** with a key
  derived from the Cloudflare secret `SITES_SECRET_KEY`. It is never returned to any browser (status shows mode + masked
  App ID only). Without `SITES_SECRET_KEY` online payment is simply unavailable; COD + WhatsApp still work.
- Order pages need the order's random token; they never show customer details. Rate limits on checkout (per IP and per phone).
- Blog/product markdown is escaped first, then a tiny safe subset is formatted; links/images must be https.
- Reserved page addresses: `p`, `cart`, `checkout`, `order`, `blog`.
- The fallback address `/api/sites/view/<slug>/` stays sandboxed (no same-origin). Its CSP now also allows
  `https://sdk.cashfree.com`; the cart uses `window.name` there because sandboxed pages have no storage.

## API (all under `/api/sites/`)
Public: `POST shop/<siteId>/checkout` · `GET shop/<siteId>/order/<orderId>?t=<token>`
Merchant (logged in, your website only): `<id>/products[/<pid>]` (GET/POST/PUT/DELETE) · `<id>/orders` (GET) ·
`<id>/orders/<oid>` (POST `{status}` or `{status:"verify"}`) · `<id>/discounts[/<code>]` · `<id>/posts[/<pid>]` ·
`<id>/payments` (GET status / POST connect / DELETE) · `<id>/store-stats`

## Tables (D1, created automatically)
`site_products`, `site_orders`, `site_discounts`, `site_posts`, `site_secrets` — money in paise (integers).

## Setup (FODO owner, once)
Cloudflare → Pages → fodo-website → Settings → Variables and Secrets → add **Secret** `SITES_SECRET_KEY` = a random
string of 32+ characters (e.g. from a password generator). Keep it forever: changing it makes saved merchant keys
unreadable (merchants would have to connect Cashfree again). Nothing else is needed; the tables create themselves.

## Not done yet (honest list)
- Shipping zones / weight-based shipping, inventory per warehouse, product reviews, abandoned-cart emails.
- Razorpay/Stripe for merchants (Cashfree only), refunds through the API (refund is a status; do the refund in Cashfree).
- Cashfree webhooks for merchant stores (payment is confirmed when the buyer returns or the merchant clicks "Check payment").
- Website importer, agency roles/teams, third-party template import pipeline.
