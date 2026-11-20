# FODO v53: FODO Studio keys, public download page, FODO Admin ▸ Studio

## What changed
- **Studio key for every person.** The first time someone opens FODO Studio (website or app) a personal key is made from their account (`FODO-XXXX-XXXX-XXXX-XXXX-XXXX`, about 100 bits, no look-alike letters). Studio stays locked until FODO gives them the key and they enter it. FODO owners never need a key.
- **FODO Admin ▸ Studio** (`/admin/#studio`): everyone who opened Studio, status (Key not entered / Active / Blocked), how the key was entered (website / app / admin), their computers with last check-in. Owners can Copy key, send it on WhatsApp, Block (with a reason shown to the person), Unblock, Activate without the key, make a New key (old key and every computer stop), change the device limit (default 2), add a note and remove a computer. Viewers see the list but not keys or buttons. Every action is in the event log.
- **Website Studio (`/studio/`)**: key screen after login (auto-formats the key, WhatsApp link to ask FODO, blocked screen with the reason). If FODO blocks someone while they are using it, the next request reloads to the blocked screen. Control panel shows the key (last 4), status and the computers using it, with Remove.
- **Desktop app 0.16.0**: activation screen on first start; lease signed by fodo.co.in (Ed25519), bound to the computer's fingerprint (Windows MachineGuid, Mac IOPlatformUUID), valid 48 h offline, renewed every hour online. Blocked / removed / new key => the app locks at its next check-in (within an hour online, at most 48 h offline). Clock turned back => locked until online. API answers 402 and the job worker pauses while locked. Control Panel shows the key status and "Check now". Exports page: "Send to FODO" uploads a finished clip into the person's online Studio media.
- **Anti-copy**: installers ship Python 3.12 bytecode only (no `.py` source), FODO's public key built in; the installer pins Python 3.12. Copying `license.json` to another PC fails (fingerprint), editing it breaks the signature, and only fodo.co.in holds the private key. Honest limit: no desktop app is impossible to crack; this makes copying and rebuilding hard, and every key can be blocked.
- **Public page `/fodo-studio/`**: features, Windows / Mac / phone download, how the key works. "Studio" in the site menu, mobile menu and footer.
- Fixes: CSP connect-src now allows the `overpass.kumi.systems` mirror the Competitor Finder already uses; two stale test assertions (VERSION pattern, insights article count).

## API
- Session: `GET /api/social/license`, `POST /api/social/license {key}`, `DELETE /api/social/license/devices/<id>`. All other session routes: 402 `{license:{status, blocked_reason}}` until active.
- App (no session, JSON only, rate-limited per IP): `GET /api/social/app/pubkey`, `POST /api/social/app/activate {key, fp, name, platform, version}` -> `{lease, upload_key, device, email}`, `POST /api/social/app/refresh {device, fp, version}` -> `{lease}` or 401/403 with `blocked` / `removed`.
- Agent upload (`/api/social/agent/*`) needs an active key.
- Admin: `GET /api/admin/studio`, `GET /api/admin/studio/<uid>/key` (owner/admin), `POST /api/admin/studio/<uid> {action: block|unblock|activate|regen|devices|note|remove_device}`.

## Tables (SCHEMA_VERSION 53.0, module `slicense`)
`ss_licenses` (one row per person), `ss_lic_devices` (computers), `ss_lic_meta` (sealed Ed25519 signing key).

## Tests
`tests/v52.test.mjs` now unlocks its users with their keys and covers the v53 gate: 402 before the key, wrong key, key format, any-case entry, app activation, lease signature and tamper check, upload key, device limit, reinstall on the same computer, renewal from another computer refused, admin permissions, block (app, website, upload, re-entering the key), unblock, remove computer, new key, owners need no key (130 checks). App: `tests/test_v22_license.py` (signed lease, forged lease, other computer, expiry, clock back, block, offline, 402 gate); full app suite 211 passed.

## v53.2: email screen and Access requests (2026-11-20)
- The app (0.18.0) opens on an email screen: name, email, optional message, **Request access**. `POST /api/social/app/request` (limited per network and per email). Logged-in website users get a **Request access** button on the key gate (`POST /api/social/license/request`).
- FODO (anmol@fodo.co.in, `STUDIO_NOTIFY`) gets an email for each new request.
- FODO Admin ▸ Studio ▸ **Access requests**: Email the key (optional message), Ignore / Undo, Send again, answered history. Rows also have **Email key**.
- The key email goes from `STUDIO_MAIL_FROM` (default "Anmol from FODO <anmol@fodo.co.in>"), reply-to anmol@fodo.co.in, through the existing Resend setup. If sending fails the request shows "Email failed" with the reason and the key can still be copied.
- New table `ss_lic_requests`; SCHEMA_VERSION 53.2. Tests in v52.test.mjs (152 pass).

## v53.3: FODO's Gmail inside Admin ▸ Studio (2026-11-20)
- Admin ▸ Studio ▸ **Inbox** (owners only): **Log in with Google** (`/api/admin/studio/connect`, reuses the Owner Brain Google connection; Google returns to /admin/#studio). Lists the mailbox (search like Gmail, chips Inbox / Unread / Key requests / Sent), shows if each sender has a Studio key, Open a mail, **Reply** (same Gmail thread), **Reply with key** (account + key made for the sender), **Send key to any email**.
- "Email the key" on Access requests / rows now goes from the real Gmail mailbox when connected (falls back to Resend).
- New `functions/_lib/sinbox.js`; routes GET studio/inbox[/<id>], GET studio/connect, POST studio/inbox/<id> {action reply|key}, POST studio/sendkey. Tests in v52.test.mjs (167 pass).

## v53.4: Windows Smart App Control (2026-11-20)
- Smart App Control blocks unsigned .exe files and downloaded .bat/.cmd files, with no Run anyway. New one-line install: PowerShell `irm https://www.fodo.co.in/downloads/win-install.ps1 | iex` (downloads the zip, checks SHA-256 from app.json, unpacks with Windows' tar.exe, installs to %LOCALAPPDATA%\FODO Studio, runs setup, opens the app). Works in Constrained Language Mode (tested with PowerShell 7.5 on Linux in both modes). App 0.18.1: setup.ps1 has no .NET calls that Constrained Language Mode would stop.
- Shown in Studio ▸ Get the app (Windows ▸ "Smart App Control blocked an app?") and on /fodo-studio/.
- Permanent fix still open: a code-signing certificate (paid) or the Microsoft Store.

## v53.8 Admin ▸ Email campaigns (owners only)
- Customers ▸ Email campaigns: upload an Excel (.xlsx, read on the server without any library) or CSV list, write one message with {first_name} / {name} / {company}, attach a file (up to 10 MB, kept in CHAT_KV as MIME-ready base64), send yourself a test, then send.
- Every person gets their own email (never a shared To/CC), from FODO's Gmail mailbox (Admin ▸ Studio ▸ Inbox connection) through the Gmail upload endpoint, with a List-Unsubscribe header and a "reply STOP" line. Without Gmail it falls back to Resend (attachments supported).
- Sending runs in batches of 8 while the Admin page is open; daily cap CAMPAIGN_DAILY_CAP (default 500, max 1800). A Gmail 429 / rate error pauses sending without marking anyone failed.
- Check replies reads each Gmail thread: a reply marks the person Replied; STOP / unsubscribe / not interested marks Opted out and adds them to camp_unsub, which every later list skips. "Send key" replies in the same thread with the FODO Studio key mail.
- Tables camp_campaigns, camp_recips, camp_unsub (SCHEMA_VERSION 53.8). Tests: 15 new checks in tests/v52.test.mjs.

## v53.9 Email campaigns v2: CRM view, AI-written personal emails, review, FODO design
- The uploaded sheet's columns are all kept per client (camp_recips.fields) and shown as a CRM table (search, filters, tick boxes).
- "Write personal messages": Workers AI (llama 3.3 70B, fallback 3.1 8B) writes each ticked client their own subject + message from the campaign brief, their name, work, company and other columns (never their email). 4 at a time, the Admin page loops. No em dashes, no invented facts, sign-off removed (the design adds "Regards, Team FODO").
- Review: edit any subject/message, rewrite one with AI, live preview of the exact email, send yourself that one. Then "Send to selected" or "Send all".
- New email design (functions/_lib/campmail.js, Figma frame 25:2 "Email · FODO campaign (600)"): FODO website colours (#050505 / #111 / #222 / #F5F3EE / #8C8C8C, #7B61FF dot only), header = the site's particle orb (assets/email/campaign-hero.jpg), attachment card, Reply + See FODO Studio buttons, "Regards, Team FODO", footer links, STOP line, phone layout.
- Export all clients (every column + status + subject + message, CSV). Attach or change any file (up to 10 MB) at any time. SCHEMA_VERSION 53.9 (ALTERs on camp_recips / camp_campaigns). 10 more tests (203 in v52).
