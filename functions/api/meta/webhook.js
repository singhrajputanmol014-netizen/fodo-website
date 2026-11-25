/* v54 Meta webhook: FODO Bot answers Instagram + Facebook DMs 24/7 (logic in functions/_lib/metadm.js).
 * Meta app → Webhooks: callback URL https://www.fodo.co.in/api/meta/webhook , verify token = META_WEBHOOK_VERIFY_TOKEN.
 * Subscribe the Page to "messages" and "message_echoes" (and the Instagram product to "messages").
 * WhatsApp (v54.7): same callback URL in the app's WhatsApp > Configuration; subscribe "messages" and "smb_message_echoes".
 */
import { verifySignature, parseEvents, handleEvent, readDiag } from "../../_lib/metadm.js";

const text = (body, status) => new Response(body, { status: status || 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const mode = u.searchParams.get("hub.mode"), token = u.searchParams.get("hub.verify_token"), challenge = u.searchParams.get("hub.challenge");
  if (mode === "subscribe" && env.META_WEBHOOK_VERIFY_TOKEN && token === env.META_WEBHOOK_VERIFY_TOKEN && challenge) return text(challenge);
  if (!mode) return text(JSON.stringify({ ok: true, service: "fodo-meta-dm", configured: !!(env.META_APP_SECRET && env.META_WEBHOOK_VERIFY_TOKEN && env.META_PAGE_TOKEN), whatsapp: !!(env.META_APP_SECRET && env.META_WA_TOKEN), disabled: String(env.META_BOT_DISABLED || "") === "1", recent: u.searchParams.has("diag") ? await readDiag(env) : undefined }));
  return text("forbidden", 403);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const raw = await request.text();
  if (raw.length > 200000) return text("too large", 413);
  if (!(await verifySignature(env, raw, request.headers.get("x-hub-signature-256")))) return text("bad signature", 401);
  let body; try { body = JSON.parse(raw); } catch (e) { return text("bad json", 400); }
  const events = parseEvents(env, body);
  events.sort((a, b) => (a.att ? 1 : 0) - (b.att ? 1 : 0));   // v55.25 typed words first, a bare attachment after them
  const work = (async () => {
    for (const ev of events) {
      try { await handleEvent(env, ev); } catch (e) { console.error("fodo-dm error:", String((e && e.message) || e).slice(0, 200)); }
    }
  })();
  // Meta wants a fast 200; the reply is sent in the background.
  if (typeof context.waitUntil === "function") context.waitUntil(work); else await work;
  return text("EVENT_RECEIVED");
}
