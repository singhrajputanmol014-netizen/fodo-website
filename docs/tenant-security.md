# Tenant security (v28)

Every builder request follows this order:

1. **Authenticate** — the server session.
2. **Resolve the website** — `siteFor(env, user, id)`: the row's `owner_user_id` must equal the session user, or the user is a FODO owner.
3. **Execute.**

A website id from the browser is only a lookup key. A stranger gets `404 Website not found`, with no hint that the website exists. The tenant is never taken from the request.

| | Owner | Client |
|---|---|---|
| FODO website / admin / Brain / Engineer | yes | **no** (403 / 401) |
| Client website, editor, domain, analytics, forms | yes (all, audited) | **own only** |
| Templates | yes | yes (client-cleared only) |
| Internet research | yes | no (the website AI has no web tools) |
| System settings / deployment infrastructure | yes | no |

- **Client AI scope.** The AI gets one website's JSON and may only return document ops: update, add, remove, move, theme, seo, addPage. Anything else is ignored. The result is validated and rendered escaped.
- **Isolation of live sites.**
  - Client websites run on a separate Pages project, never in FODO's production.
  - The fodo.co.in fallback is served with `Content-Security-Policy: sandbox allow-scripts allow-forms` (no same-origin), so a page can never use FODO cookies.
  - The editor canvas is `sandbox="allow-scripts"`.
- **Inputs.**
  - Writes need same-origin plus JSON (CSRF).
  - Rate limits apply per user, per IP and per AI-day.
  - Forms have a honeypot and a per-IP limit.
  - Media accepts images only (no SVG) up to 2.5 MB, served with `default-src 'none'`.
- **Secrets.** Keys stay in Cloudflare secrets. They are never sent to the browser, and tests assert that no response contains a key.
- **Tests.** `tests/v28-builder.test.mjs` covers cross-tenant reads, writes, publishing and forms, `list?all=1` for clients, CSRF, the client reaching Brain/Engineer/admin, script injection, SVG uploads, domain takeover, and key leaks.
