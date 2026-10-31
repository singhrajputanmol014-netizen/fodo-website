# Testing v34

```
npm run setup            # once: installs tests/node_modules (wrangler, playwright 1.63, xlsx, leaflet) + Chromium
npm test                 # everything (≈15 min)
npm run test:unit | test:integration | test:e2e | test:security | test:builder | test:store | test:brain | test:xray
npm run audit            # SEO audit + secret scan + static performance audit
npm run audit:seo | audit:security | audit:performance
```

- **Tooling:** lives in `tests/package.json`, so Cloudflare Pages deploys never install it. The root `package.json` only has scripts.
- **Runner:** `tests/run.mjs` runs each suite in its own process, serves the built pages on `:8765` with a small built-in server (no Python needed), and lets the runtime suites start `wrangler pages dev` on `:8788`. It prints a pass / fail table and exits 1 if anything failed.
- **Environment:** `WRANGLER=…` / `NM=…` still override the tool paths.

## Suites added in v34

| Suite | Checks | What it proves |
|---|---:|---|
| `v34-store.test.mjs` | 34 | last item / last coupon / 5 simultaneous orders / double checkout / double webhook / double refund, refund lifecycle, release of stock + coupon, expiry, private tokens |
| `v34-security.test.mjs` | 30 | 39-route tenant matrix, protected pages, SSRF, custom-code isolation, XSS |
| `v34-builder.test.mjs` | 17 | responsive overrides + cascade, custom breakpoints, tokens, old documents unchanged, simultaneous saves, Keep mine → history, simultaneous publishes |
| `v34-site.test.mjs` | 17 | website settings validation + public view, enquiries (save, email, honeypot, origin, rate limit, admin status / notes / filter) |
| `v21-e2e.test.js` (+11) | | in Chromium: mobile layer editing, Make Responsive, Responsive Health, AI Edit preview, zoom, conflict dialog, offline → online save |
| `v31-live-client.test.js` (v33) | 20 | voice mute keeps the session, first-connect retry, remembered plain session |

The results table is in `FODO-V34-FINAL-AUDIT.md`.

## Notes on old failures

- With the tooling installed, none of the 46 pre-v34 suites failed.
- v34 changed behaviour on purpose in two places, and those tests were updated to the new contract:
  - `v29-store`: stock is now reserved at checkout instead of at payment.
  - `xray-e2e`: "1 page read" grammar.
- No test was deleted.
