# Deployment (v34)

## Routine update (how FODO ships today)

1. On your computer, run `python3 scripts/build_pages.py` if you changed `build_pages.py`, `js/data.js` or the SEO config. The v34 zip already contains the rebuilt pages.
2. Copy the `fodo` folder into `C:\GitHub\fodo-website` → GitHub Desktop → Commit → Push.
3. Cloudflare Pages deploys `fodo-website`. There is no build command and no install step: the repo root is the output.
4. The client-site project `fodo-sites` (root directory `sites/`) deploys from the same push.

## Database

- **Migrations:** D1 migrations are additive and run on first use (`CREATE … IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN` inside try / catch). No manual SQL is needed. See `FODO-V34-FINAL-AUDIT.md` for the list.
- **Backup:** Cloudflare D1 keeps 30 days of Time Travel; restore from the dashboard if a migration ever needs undoing.

## Settings that no longer need a deploy

Admin → **Website settings**: booking link, GA4, Meta Pixel, Google review link, Founding Programme counter, enquiry email.
`js/config.js` keeps the fallback values.

## Secrets (Cloudflare → Settings → Variables and Secrets)

| Secret | Status |
|---|---|
| `SITES_SECRET_KEY` | Still pending. Encrypts each store's Cashfree keys and strengthens protected-page cookies. Set it in **both** projects. |
| Other existing secrets | Unchanged (Gemini, Groq, Resend, Serper, Razorpay / Cashfree, GitHub, Google OAuth). |

## Store webhooks (optional, recommended)

In each merchant's Cashfree dashboard, add the webhook `https://www.fodo.co.in/api/sites/shop/<siteId>/webhook`.
Orders are confirmed even without it (on the return page), but the webhook covers customers who close the tab after paying.

## After deploying

- Open `/website-builder/` and press Ctrl+Shift+R once (modules are versioned, so this is only for the first load).
- Admin → Enquiries: send yourself a test enquiry from `/contact/`.
