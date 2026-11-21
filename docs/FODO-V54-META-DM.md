# v54: FODO Bot in Instagram + Facebook DMs

The website bot (FODO Bot, `/api/chat`) now also answers Instagram and Facebook direct messages, 24/7, in the language the person writes in (English, Hindi, Hinglish).

## How it works
1. Someone sends a DM to @fodo.co.in (Instagram) or the FODO Facebook Page.
2. Meta calls `https://www.fodo.co.in/api/meta/webhook` (signature checked with `META_APP_SECRET`).
3. `functions/_lib/metadm.js` builds the reply with the same FODO Bot brain as the website (`SYSTEM_PROMPT` + `generate()` from `functions/api/chat.js`, site knowledge from `sitekb.js`) plus DM rules (short, plain text, same language, full links, WhatsApp +91 78270 07676).
4. The reply goes out through the Send API as `messaging_type: RESPONSE` (only inside Meta's 24 hour window, never a cold message).

Safety built in:
- Remembers the last 10 turns per person for 7 days (CHAT_KV), so "haan" / "ok" continue the chat.
- Never answers the same message twice (message id dedupe).
- If a human (Anmol / Rohit) replies in a chat, the bot stays quiet in that chat for 12 hours (`META_BOT_HUMAN_PAUSE_HOURS`).
- Images, stickers and our own messages get no AI reply.
- If the AI is down: a short bilingual "team will reply soon, WhatsApp +91 78270 07676" message.
- Kill switch: `META_BOT_DISABLED=1`.

## One-time setup (owner)
1. **Meta app** (developers.facebook.com, logged in as Anmol): use the Social Studio app if it exists (its `META_APP_ID` / `META_APP_SECRET` are already in Cloudflare), otherwise create a Business app and add those two secrets.
2. Add products **Messenger** and **Instagram** (Instagram API with Facebook Login).
3. **Webhooks**: callback URL `https://www.fodo.co.in/api/meta/webhook`, verify token = any long random string. Subscribe the FODO Page to `messages` and `message_echoes`; for Instagram subscribe to `messages`.
4. Generate a **Page access token** for the FODO Page (ID 659006123960042) with `pages_messaging`, `pages_manage_metadata`, `instagram_basic`, `instagram_manage_messages`; exchange it for a long-lived token.
5. Cloudflare Pages → fodo-website → Settings → Variables and Secrets (Production), add as **Secret**:
   - `META_WEBHOOK_VERIFY_TOKEN` (same string as step 3)
   - `META_PAGE_TOKEN` (token from step 4)
   - `META_PAGE_ID` = `659006123960042`, `META_IG_ID` = `17841476681882495` (plain variables)
6. Instagram app: Settings → Privacy and safety → Messages → **Allow access to messages** must be on (Connected tools).
7. Check: open `https://www.fodo.co.in/api/meta/webhook` → `"configured": true`.
8. **App Review**: until `pages_messaging` and `instagram_manage_messages` get Advanced access, only people with a role on the Meta app get bot replies. Submit both for review with a screen recording of a DM being answered.

## When the AI bot goes live
Turn OFF the Meta Business Suite inbox automations "Auto reply" and "Frequently asked questions" (Inbox → Automations), otherwise people get two answers and the Meta auto reply counts as a human reply and pauses the AI in that chat. The "GROW" keyword automation can stay.

## Files
- `functions/_lib/metadm.js` (new), `functions/api/meta/webhook.js` (new)
- `functions/api/chat.js`: `SYSTEM_PROMPT` and `generate` are now exported (no behaviour change)
- `tests/v54-meta-dm.test.mjs` (19 checks), added to the integration group
