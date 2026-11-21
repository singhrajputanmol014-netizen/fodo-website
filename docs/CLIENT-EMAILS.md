# Admin ▸ Client Emails (website v54.2)

fodo.co.in/admin/#outreach (sidebar: Customers ▸ Client Emails). Owners and admins with **Full control** (Team ▸ role "Admin") only. Viewers can't open it.

## What it does
- **Clients**: add, edit and search clients on the same page (name, business, email, phone, city, industry, service, amount, pricing rows, status, notes). Shagun Banquet Hall (Motihari) is added automatically as the first client.
- **Email types**: Proposal, Follow-up, Welcome / onboarding, Invoice reminder, Project update, Report delivery, Custom.
- **Content**: each type is a template of named blocks (eyebrow, headline, intro, list rows, stat boxes, button text + link, closing). Every block and the subject can be edited before sending. Variables fill from the client: `{client_name} {first_name} {business_name} {city} {industry} {service} {amount} {pricing} {phone} {email}`, plus per-email `{date} {next_step} {link}` (and `{amount}` can be overridden). Empty variables are shown before sending.
- **Design**: one fixed FODO design for every email (`functions/_lib/clientmail.js`): page #0B0B0C, card #151517, border #2A2A2F, text #F4F4F2, muted #B4B4BB / #8A8A92, violet #8F7BFF, Inter Tight (Arial fallback), logo + "FEAR OF DIGITALLY OUT ?" header, "Rohit · FODO" sign-off, footer. Table-based HTML, inline styles, 640px. Only the content blocks change. Plain-text version is generated automatically.
- **Preview**: live, in the real design (sandboxed frame).
- **Sending**: "Send a test to me" (marked [TEST], goes only to you), then "Send to client…" with a confirmation dialog (recipient, subject, type). The server also refuses a real send without that confirmation.
- **Safety**: max `CLIENT_MAIL_HOURLY` (20) real sends per hour; the same type to the same client within 10 minutes is blocked unless you choose "Send again"; failed sends stay "Failed" with the error and a **Retry** button (re-sends the exact same email); marketing types (Follow-up, Custom) carry an Unsubscribe link and List-Unsubscribe headers and are never sent to anyone who opted out (shared list with Email campaigns). Transactional types (Proposal, Invoice reminder, Project update, Welcome, Report) have no unsubscribe link.
- **Send log**: every send (test or real): time, admin, client, type, subject, status, provider message id, tries. Filter by client and status; "View" opens the exact email.

## Setup (one time)
1. Cloudflare Pages ▸ fodo-website ▸ Settings ▸ Variables and secrets: make sure `RESEND_API_KEY` is set (secret). Optional: `CLIENT_MAIL_FROM`, `CLIENT_MAIL_REPLY_TO`, `CLIENT_MAIL_HOURLY`, `OPTOUT_SECRET`. See `docs/client-emails.env.example`.
2. In Resend, the domain fodo.co.in must be verified (it already sends login codes). The From address must be on that domain.
3. Make sure the reply-to mailbox (anmol@fodo.co.in, the default sender too) exists, so client replies arrive.
4. Redeploy. The tables (`cm_clients`, `cm_sends`) are created on the first request (SCHEMA_VERSION 54.2).

## Add a new email type
1. Open `functions/_lib/clientmail.js` and add one entry to `TYPES`:
   ```js
   meeting_recap: { label: "Meeting recap", marketing: false,
     subject: "Notes from our call, {first_name}",
     eyebrow: "Meeting recap",
     headline: "What we agreed, *{first_name}*",
     intro: "Hi {first_name},\n\nThanks for the call today. Here is what we agreed for {business_name}.",
     items: "Decision | \nOwner | \nDeadline | {date}",
     stats: "",
     cta_text: "", cta_link: "",
     closing: "Next step: {next_step}" },
   ```
2. `marketing: true` adds the unsubscribe link and skips opted-out people. Use `false` only for emails about existing work.
3. Block rules: `*words*` in the headline = serif italic violet accent; `**words**` = bold; list rows and stat boxes are one per line with `|` between the two parts; button link must start with `https://`, `mailto:` or `tel:` (variables inside it are URL-encoded).
4. No design changes are needed (and none should be made per type). Run `node --no-warnings tests/v542-client-emails.test.mjs`.

## Files
- `functions/_lib/clientmail.js` email design + types + variables
- `functions/_lib/outreach.js` clients, preview, send (Resend), retry, log, limits, opt-out signing
- `functions/api/admin/[[path]].js` routes `/api/admin/outreach/*`
- `functions/api/optout.js` public unsubscribe page
- `js/admin.js` (`outreachView`), `css/admin.css` (`.ad-or-*`)
- `functions/_lib/schema.js` SCHEMA_VERSION 54.2
- `tests/v542-client-emails.test.mjs`
