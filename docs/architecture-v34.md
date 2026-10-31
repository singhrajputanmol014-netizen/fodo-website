# FODO architecture (v34)

FODO is one Cloudflare Pages project (`fodo-website`). The repository root is the site; there is no build step at deploy.

- `python3 scripts/build_pages.py` regenerates the static HTML, `sitemap.xml`, `robots.txt` and `data/search-index.json` before a commit.
- Pages Functions in `functions/` answer `/api/*` only (`_routes.json`).
- A second Pages project, `fodo-sites`, uses `sites/` as its root and serves the published client websites.

```
browser ──► static HTML/CSS/JS (repo root)
        └─► /api/* ──► functions/api/<area>/… ──► functions/_lib/* ──► D1 XRAY_DB · KV CHAT_KV · Workers AI · external APIs
client website visitor ──► fodo-sites (sites/functions) ──► sites/lib/serve.js ──► D1 (published snapshot only)
```

## Areas

| Area | UI | API | Library |
|---|---|---|---|
| Public site | `index.html` + 101 routes, `js/main.js`, `js/pages.js` | `/api/stats`, `/api/t`, `/api/leads` (v34), `/api/site-config` (v34) | `_lib/sitecfg.js` (v34), `_lib/traffic.js` |
| Chatbot / help | `js/bot*.js`, `/help/` | `/api/chat`, `/api/help/*` | `_lib/knowledge.js`, `_lib/help*.js` |
| Growth Lab / X-Ray | `/growth-lab/`, `/business-x-ray/` | `/api/xray/*`, `/api/lab/*`, `/api/monitor/tick` | `_lib/xray-core.js`, `_lib/products.js`, `_lib/plans.js`, `_lib/config.js` |
| Accounts / payments | `/account/`, `/plans/` | `/api/account/*` | `_lib/accounts.js` |
| Admin | `/admin/` | `/api/admin/*` | `_lib/config.js`, `_lib/sitecfg.js` (v34) |
| Owner Brain | `/owner-brain/` | `/api/owner-brain/*` | `_lib/brain/*` |
| Website Builder | `/website-builder/` | `/api/sites/*` | `_lib/sites.js`, `_lib/shop.js`, `sites/lib/*` |

## Shared rules

- **Secrets** live only in Cloudflare secrets and never reach the browser. `npm run audit:security` scans the source for keys.
- **Every database write is parameterised.** Concurrent flows use conditional updates and unique indexes; see `store-v34.md`.
- **Tenant isolation:** builder routes resolve the site from the session user (`siteFor`), never from ids sent by the browser, and every child row is looked up with `site_id`. `tests/v34-security.test.mjs` tries 39 routes as another customer.
- **Outgoing fetches** of user-supplied URLs go through `safeFetch` in `xray-core.js`: private / loopback / metadata IPs, credentials, odd ports and redirects to any of them are blocked.
- **Client websites** render only the published snapshot. Custom code is served only on the client's own domain. FODO's fallback address is sandboxed with CSP.

## Front-end loading

- Each public page loads `styles.css`, `theme-glass.css`, `studio.css` and a fixed set of deferred scripts.
- The builder loads its modules through an import map with a version query, so a deploy can't mix old and new modules.
- The Owner Brain and Admin load their own bundles.
- Measurements are in `docs/perf-v34-after.json` (`npm run audit:performance`).
