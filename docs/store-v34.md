# Store v34: concurrency, idempotency and the order lifecycle

The code is in `functions/_lib/shop.js`. Tests are in `tests/v34-store.test.mjs` (34 checks). Run against the pre-v34 code, 11 of
them fail; for example, five simultaneous orders all got number 1004.

## Migrations (additive, run automatically, safe to repeat)

`site_orders` gets these new columns: `code_state`, `refund` (JSON), `idem`.

New unique indexes: `site_orders(site_id, number)` and `site_orders(site_id, idem)`. `SHOP_SCHEMA = 34`. Nothing is dropped or rewritten.

## Checkout

| Risk | Before | v34 |
|---|---|---|
| Last item bought twice | stock read, decremented later | `takeStock`: `UPDATE … SET stock = stock - q WHERE stock >= q` (variants: `json_set` with the same guard); if any line is short, the lines already taken are put back and the buyer gets "just sold out" (409) |
| Coupon past `max_uses` | SELECT, check, UPDATE | one statement: `UPDATE … SET uses = uses + 1 WHERE uses < max_uses`; 0 rows changed means "used up" and the order is cancelled cleanly |
| Coupon burnt by a failed payment | consumed at once | `reserved` for online orders, `consumed` when paid, `released` (uses − 1, once) when the order is cancelled, the payment page fails or the hold expires |
| Duplicate order numbers | `MAX+1` | unique index + retry with jitter |
| Double tap / retry | two orders | idempotency key `idem` (the checkout page sends one per attempt): the same key returns the same order |
| Abandoned online payment | stock never returned | stock is reserved at checkout; unpaid after 2 hours, the order is cancelled and the stock and coupon return; if Cashfree later says PAID, the order becomes paid and the stock is taken again (or it is flagged "refund or restock") |

## Payment confirmation

`verifyPayment()` is the only place an online order becomes paid.

- It always re-reads the order from Cashfree and never trusts the browser or the webhook body.
- The status change is a conditional UPDATE, so the return page, two webhook deliveries and a retry settle the order exactly once (one email, one stock change).
- Store webhooks go to `POST /api/sites/shop/<siteId>/webhook`. They carry a Cashfree HMAC-SHA256 signature over `timestamp + body` with the store's own secret and must be within 15 minutes.

## Order lifecycle

```
pending ──paid──► paid ──► shipped ──► delivered
   │               │          │            │
   └► cancelled    └► refund  └► cancelled └► refund
cod / whatsapp ──► shipped … (cancel before delivery returns stock)
refund (online): refund_processing ──Cashfree SUCCESS──► refunded
                                   └──CANCELLED / FAILED──► refund_failed ──► refund (retry)
refund (COD / WhatsApp): the merchant confirms "I have refunded this customer" (manual: true) ──► refunded
```

- **"Refunded"** is only set after Cashfree confirms the refund, or after the merchant explicitly confirms a cash refund.
- **The refund record** stores the refund id (`rf_<order>`, the gateway idempotency key), gateway id, amount, reason, and the requested, completed and failed times plus the failure reason.
- **Two refund clicks** produce one refund: the first click claims the order with a conditional UPDATE.
- **Stock:** comes back once (`stock_done` 1 → −1) when the order is cancelled before delivery, or refunded while still unshipped. A refund after delivery does not restock automatically, because the item may not come back; edit the stock by hand.
- **Older builders** that still send `refunded` go through the same rules.

## Order privacy

- **Tokens:** 32 random characters (`crypto.getRandomValues`), compared in constant time, never logged, never in API responses.
- **Rate limit:** order lookups are limited to 120 per IP per hour.
- **Order page headers:** `no-store`, `Referrer-Policy: no-referrer` (so the token in the URL can't leak to third parties) and `X-Robots-Tag: noindex`.
- **Deleting** a product, post or discount that isn't on your own site returns 404.
