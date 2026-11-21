/* v54 FODO Bot in Instagram + Facebook DMs (Meta webhook → the same FODO Bot brain as /api/chat → Send API).
 *
 * Route: functions/api/meta/webhook.js (GET = Meta verification, POST = message events).
 * Secrets / variables (Cloudflare Pages → Settings → Variables and Secrets):
 *   META_APP_SECRET            already used by Social Studio; signs every webhook POST (X-Hub-Signature-256). Required.
 *   META_WEBHOOK_VERIFY_TOKEN  any long random string; paste the same string in the Meta app webhook settings. Required.
 *   META_PAGE_TOKEN            long-lived Page access token of the FODO Facebook Page (Instagram @fodo.co.in is linked to it). Required.
 *   META_PAGE_ID               FODO Page id (659006123960042). Optional, used to ignore our own messages.
 *   META_IG_ID                 Instagram account id (17841476681882495). Optional, used to ignore our own messages.
 *   META_BOT_DISABLED          "1" = kill switch: webhook still answers Meta, the bot sends nothing.
 *   META_BOT_HUMAN_PAUSE_HOURS hours the bot stays quiet in a chat after a human (Anmol / Rohit) replies there. Default 12.
 * Storage: CHAT_KV (history per person, dedupe, human-takeover pause). Without KV it still replies, without memory.
 *
 * Rules: only answers messages people send to FODO (never starts a chat), only inside Meta's 24 h window
 * (messaging_type RESPONSE), stays quiet in a thread a human has taken over, never sends the same reply twice.
 */
import { SYSTEM_PROMPT, generate } from "../api/chat.js";
import { productBrief, productDetail, PRODUCT_RE } from "./sitekb.js";

const SITE_ORIGIN = "https://www.fodo.co.in";
const MAX_IN = 600, MAX_OUT = 950, HISTORY_TURNS = 10, HISTORY_TTL = 7 * 86400, DEDUPE_TTL = 2 * 86400;
const enc = new TextEncoder();

const DM_RULES = `

# THIS CHAT IS A DIRECT MESSAGE ON INSTAGRAM OR FACEBOOK (not the website)
- Reply like a real person from the FODO team typing in DMs: short, warm, natural. Usually 20-80 words, max about 120.
- Language: reply in the SAME language and script the person used. Hindi (Devanagari) gets Hindi, Hinglish (Roman Hindi) gets Hinglish, English gets English. If they mix, you mix the same way.
- Plain text only: no Markdown, no **bold**, no bullet symbols, no headings. At most 3 short lines of list, each starting with a number like "1)".
- Links: write full links only, for example https://www.fodo.co.in/contact/ . Never Markdown links.
- WhatsApp / call: +91 78270 07676. Email: anmol@fodo.co.in.
- If they want a quote, a call, or to start work: ask for their business name, city and what they want first, then say Anmol or Rohit will reach out. Never promise a price, date or result that is not in the FODO FACTS.
- If they are rude, spam, or just say thanks, reply in one short friendly line.
- Never say you are a bot unless they ask directly whether they are talking to a human. Then say honestly that this is FODO's AI assistant and a human from the team can take over on WhatsApp +91 78270 07676.`;

/* ---------- helpers ---------- */
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export async function verifySignature(env, raw, header) {
  if (!env.META_APP_SECRET || !header) return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(String(header).trim()); if (!m) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(env.META_APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = hex(await crypto.subtle.sign("HMAC", key, enc.encode(raw)));
  const got = m[1].toLowerCase(); if (got.length !== want.length) return false;
  let d = 0; for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return d === 0;
}

/* Markdown → plain DM text. Site paths become full links. */
export function toDmText(text) {
  let t = String(text || "");
  t = t.replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, (_, label, path) => label + ": " + SITE_ORIGIN + path);
  t = t.replace(/\[([^\]]+)\]\((https?:[^)\s]+|mailto:[^)\s]+)\)/g, (_, label, url) => label + ": " + url.replace(/^mailto:/, ""));
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/^#{1,6}\s+/gm, "").replace(/^\s*[-*•]\s+/gm, "");
  t = t.replace(/\s*[—–]\s*/g, ", ").replace(/\n{3,}/g, "\n\n").trim();
  if (t.length > MAX_OUT) { const cut = t.slice(0, MAX_OUT); const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("।"), cut.lastIndexOf("\n")); t = (end > MAX_OUT * 0.6 ? cut.slice(0, end + 1) : cut).trim(); }
  return t;
}

const kvGet = async (env, k) => { try { return env.CHAT_KV ? await env.CHAT_KV.get(k) : null; } catch (e) { return null; } };
const kvPut = async (env, k, v, ttl) => { try { if (env.CHAT_KV) await env.CHAT_KV.put(k, v, { expirationTtl: ttl }); } catch (e) { /* never block a reply on KV */ } };

/* Turn a Meta webhook body into plain events: { kind: "message" | "human_echo", platform, sender, text, mid } */
export function parseEvents(env, body) {
  const out = [];
  if (!body || (body.object !== "page" && body.object !== "instagram")) return out;
  const platform = body.object === "instagram" ? "instagram" : "facebook";
  const own = new Set([env.META_PAGE_ID, env.META_IG_ID].filter(Boolean).map(String));
  for (const entry of body.entry || []) {
    for (const ev of entry.messaging || []) {
      const msg = ev.message; if (!msg) continue;
      const from = String((ev.sender || {}).id || ""), to = String((ev.recipient || {}).id || "");
      if (msg.is_echo) {
        // An echo is a message FODO sent. If no app sent it (or another app did), a human replied: pause the bot in that chat.
        const byUs = msg.app_id && env.META_APP_ID && String(msg.app_id) === String(env.META_APP_ID);
        const automated = msg.metadata === "fodo-bot";
        if (!byUs && !automated && to) out.push({ kind: "human_echo", platform, sender: to, mid: msg.mid });
        continue;
      }
      if (own.has(from)) continue;
      const text = typeof msg.text === "string" ? msg.text.trim() : "";
      if (!from || !text) continue; // stickers, images, reactions: the Meta inbox automations / a human handle those
      out.push({ kind: "message", platform, sender: from, text: text.slice(0, MAX_IN), mid: msg.mid || "" });
    }
  }
  return out;
}

async function history(env, platform, sender) {
  try { const v = await kvGet(env, "dm:h:" + platform + ":" + sender); const a = v ? JSON.parse(v) : []; return Array.isArray(a) ? a : []; } catch (e) { return []; }
}

export async function replyFor(env, platform, sender, text) {
  const past = await history(env, platform, sender);
  const knowledge = "\n\n" + productBrief() + (PRODUCT_RE.test(text) ? productDetail(text) : "");
  const messages = [
    { role: "system", content: SYSTEM_PROMPT + knowledge + DM_RULES },
    ...past.slice(-HISTORY_TURNS * 2),
    { role: "user", content: text },
  ];
  const { text: raw } = await generate(env, messages, 380);
  const reply = toDmText(raw);
  const next = [...past, { role: "user", content: text.slice(0, 600) }, { role: "assistant", content: reply.slice(0, 900) }].slice(-HISTORY_TURNS * 2);
  await kvPut(env, "dm:h:" + platform + ":" + sender, JSON.stringify(next), HISTORY_TTL);
  return reply;
}

export async function sendDm(env, recipient, text) {
  const v = env.META_GRAPH_VERSION || "v23.0";
  const r = await fetch("https://graph.facebook.com/" + v + "/me/messages?access_token=" + encodeURIComponent(env.META_PAGE_TOKEN), {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipient: { id: recipient }, messaging_type: "RESPONSE", message: { text, metadata: "fodo-bot" } }),
  });
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error("Meta send " + r.status + ": " + t.slice(0, 200)); }
  return r.json().catch(() => ({}));
}

const FALLBACK = "Thanks for your message! Our team will reply soon. For a quick chat, WhatsApp +91 78270 07676.\nमैसेज के लिए धन्यवाद! हमारी टीम जल्दी जवाब देगी। WhatsApp: +91 78270 07676";

/* Handle one parsed event. Returns what happened (for logs and tests). */
export async function handleEvent(env, ev) {
  const pauseKey = "dm:pause:" + ev.platform + ":" + ev.sender;
  if (ev.kind === "human_echo") {
    const hrs = Math.max(1, parseInt(env.META_BOT_HUMAN_PAUSE_HOURS || "12", 10) || 12);
    await kvPut(env, pauseKey, "1", hrs * 3600);
    return "paused";
  }
  if (String(env.META_BOT_DISABLED || "") === "1") return "disabled";
  if (!env.META_PAGE_TOKEN) return "no_token";
  if (ev.mid) { const k = "dm:seen:" + ev.mid; if (await kvGet(env, k)) return "duplicate"; await kvPut(env, k, "1", DEDUPE_TTL); }
  if (await kvGet(env, pauseKey)) return "human_active";
  let reply;
  try { reply = await replyFor(env, ev.platform, ev.sender, ev.text); } catch (e) { console.error("fodo-dm ai error:", String((e && e.message) || e).slice(0, 160)); reply = FALLBACK; }
  if (!reply) reply = FALLBACK;
  await sendDm(env, ev.sender, reply);
  return reply === FALLBACK ? "sent_fallback" : "sent";
}
