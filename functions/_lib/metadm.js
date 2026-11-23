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
 *   META_BOT_AUTO_ECHO_SECONDS an echo this soon after the person's message is a Meta inbox automation
 *                              (Instant reply / FAQ / keyword), not a human, so it does NOT pause the bot. Default 45.
 *   META_BOT_AUTOMATION_APP_IDS comma list of app ids whose echoes never pause the bot (extra safety).
 *   META_BOT_ENGINE            "groq" (default when GROQ_API_KEY is set: best Hindi/Hinglish) or "workers" (Workers AI only).
 * Leads (v54.2): when a person shares a phone number or email in the DM, the chat is saved as an enquiry in
 *   Admin → Enquiries (D1 fodo_leads, source "instagram-dm" / "facebook-dm") and the team gets the usual enquiry email.
 * Storage: CHAT_KV (history per person, dedupe, human-takeover pause). Without KV it still replies, without memory.
 *
 * Rules: only answers messages people send to FODO (never starts a chat), only inside Meta's 24 h window
 * (messaging_type RESPONSE), stays quiet in a thread a human has taken over, never sends the same reply twice.
 */
import { SYSTEM_PROMPT, generate } from "../api/chat.js";
import { productBrief, productDetail, PRODUCT_RE } from "./sitekb.js";
import { groqChat } from "./aivis.js";
import { saveLead, updateLead } from "./sitecfg.js";

const SITE_ORIGIN = "https://www.fodo.co.in";
const MAX_IN = 600, MAX_OUT = 950, HISTORY_TURNS = 10, HISTORY_TTL = 7 * 86400, DEDUPE_TTL = 2 * 86400;
const enc = new TextEncoder();

const DM_RULES = `

# THIS CHAT IS A DIRECT MESSAGE ON INSTAGRAM OR FACEBOOK (not the website)
You are typing as the FODO team in DMs. Your two jobs: (1) answer ANY message helpfully, like a smart, friendly human, and (2) gently turn interested people into leads for Anmol (founder) and Rohit (co-founder).

HOW TO WRITE
- Short and natural, like a real person on Instagram: usually 15-70 words, 1-3 short lines. Never a wall of text.
- Language: reply ONLY in the language and script the person used. Hinglish (Roman Hindi) gets natural Hinglish, Hindi (Devanagari) gets Hindi, English gets English. Never add a translation in brackets. Never mix two languages in one reply unless they did.
- Natural Hinglish example: "Bilkul! Aapka business kis cheez ka hai aur kis city mein hai?" (not stiff textbook Hindi).
- Use their first name sometimes if you know it. At most one emoji, only if they use emojis.
- Plain text only: no Markdown, no **bold**, no bullets, no headings. Full links only, e.g. https://www.fodo.co.in/services/ . Never Markdown links.
- Never start with "As an AI". Never repeat the same question or offer twice in a chat.

ANSWER FIRST, THEN ONE QUESTION
- Always answer what they actually asked first, in 1-2 lines, using the FODO FACTS. Then ask at most ONE short question that moves the chat forward.
- Price / cost / charges / "kitna lagega": FODO has no fixed price list. Say it depends on what they need (for example a website, ads, SEO or social media) and that Anmol gives a fixed quote after a quick free call, ad spend is paid by them. Then ask what they need and for which business. Never invent a number, package, discount or guarantee.
- General questions (marketing tips, Instagram growth, anything else): give a genuinely useful short answer, then a soft link to how FODO can help only if it fits.
- Greetings ("hi", "hello", "hii"): greet back warmly in one line and ask what they need help with for their business. Do not dump the services list.
- Photos, voice notes, videos or reels you cannot see: say you can't open it here and ask them to type the main point.
- Story mentions or shares: thank them warmly in one line.
- Complaints or angry messages: apologise briefly, take it seriously, and ask for their WhatsApp number so Anmol can sort it personally.
- Jobs, internships, collaborations: thank them and share anmol@fodo.co.in.

LEAD FLOW (natural, never pushy)
- Learn these over the chat, ONE question per reply, only what you don't know yet: what they need, their business / niche, city, rough monthly budget or timeline.
- Once they show real interest (they asked about price, a service, or said they want something), ask for their name and WhatsApp number so Anmol can send a custom plan and quote, for example: "Aapka naam aur WhatsApp number share kar dijiye, Anmol aaj hi aapko custom plan bhej denge."
- If they don't want to share a number, that's fine: give WhatsApp +91 78270 07676 and the Free Growth Audit link https://www.fodo.co.in/contact/?mode=audit , and keep helping.
- Never promise a price, a result, a delivery date or a call time.

CONTACT
- WhatsApp / call: +91 78270 07676. Email: anmol@fodo.co.in. Website: https://www.fodo.co.in
- Only if they directly ask whether they are talking to a human or a bot: say honestly this is FODO's AI assistant and Anmol can take over on WhatsApp +91 78270 07676.`;

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
      if (ev.postback && !ev.message) {   // ice breakers / buttons: treat the button title as the message
        const from = String((ev.sender || {}).id || ""), t = String(ev.postback.title || ev.postback.payload || "").trim();
        if (from && t && !own.has(from)) out.push({ kind: "message", platform, sender: from, text: t.slice(0, MAX_IN), mid: "pb:" + from + ":" + (ev.timestamp || ""), ts: Number(ev.timestamp) || 0 });
        continue;
      }
      const msg = ev.message; if (!msg) continue;
      const from = String((ev.sender || {}).id || ""), to = String((ev.recipient || {}).id || "");
      if (msg.is_echo) {
        // An echo is a message FODO sent. If no app sent it (or another app did), a human replied: pause the bot in that chat.
        const byUs = msg.app_id && env.META_APP_ID && String(msg.app_id) === String(env.META_APP_ID);
        const automated = msg.metadata === "fodo-bot";
        if (!byUs && !automated && to) out.push({ kind: "human_echo", platform, sender: to, text: String(msg.text || "").slice(0, 600), mid: msg.mid, appId: String(msg.app_id || ""), ts: Number(ev.timestamp) || 0 });
        continue;
      }
      if (own.has(from)) continue;
      let text = typeof msg.text === "string" ? msg.text.trim() : "";
      if (!text && Array.isArray(msg.attachments) && msg.attachments.length) text = describeAttachment(msg.attachments[0]);
      if (!from || !text) continue; // reactions, deleted or unsupported messages
      out.push({ kind: "message", platform, sender: from, text: text.slice(0, MAX_IN), mid: msg.mid || "", ts: Number(ev.timestamp) || 0 });
    }
  }
  return out;
}

function describeAttachment(a) {
  const t = String((a && a.type) || "").toLowerCase();
  if (t === "like_heart") return "";   // a heart is a reaction, not a question
  if (t === "story_mention") return "(The person mentioned FODO in their Instagram story.)";
  if (t === "image") return "(The person sent a photo you cannot see.)";
  if (t === "audio") return "(The person sent a voice note you cannot hear.)";
  if (t === "video") return "(The person sent a video you cannot watch.)";
  if (t === "share" || t === "ig_reel" || t === "reel" || t === "ig_post" || t === "template") return "(The person shared a post or reel with FODO.)";
  if (t === "file") return "(The person sent a file you cannot open.)";
  if (t === "sticker") return "(The person sent a sticker.)";
  return t ? "(The person sent a " + t.replace(/[^a-z_]/g, "") + ".)" : "";
}

async function history(env, platform, sender) {
  try { const v = await kvGet(env, "dm:h:" + platform + ":" + sender); const a = v ? JSON.parse(v) : []; return Array.isArray(a) ? a : []; } catch (e) { return []; }
}

/* Best model for DMs: Groq (gpt-oss, strong Hindi/Hinglish) first, Workers AI as the fallback. */
async function dmGenerate(env, messages) {
  const eng = String(env.META_BOT_ENGINE || "").toLowerCase();
  if (env.GROQ_API_KEY && eng !== "workers") {
    try { const g = await groqChat(env, messages, 500, 20000); const t = String(g.text || "").trim(); if (t) return t; } catch (e) { console.error("fodo-dm groq:", String((e && e.message) || e).slice(0, 120)); }
  }
  const { text } = await generate(env, messages, 380);
  return text;
}

export async function replyFor(env, platform, sender, text, lead) {
  const past = await history(env, platform, sender);
  const knowledge = "\n\n" + productBrief() + (PRODUCT_RE.test(text) ? productDetail(text) : "");
  const state = lead && lead.saved
    ? "\n\n# LEAD STATUS\nThis person has ALREADY shared their contact details (saved for the team). Do NOT ask for name or number again. If they just shared it, thank them by name if known and say Anmol will WhatsApp them soon with a custom plan, then ask one useful question about their requirement if still unknown."
    : "";
  const messages = [
    { role: "system", content: SYSTEM_PROMPT + knowledge + DM_RULES + state },
    ...past.slice(-HISTORY_TURNS * 2),
    { role: "user", content: text },
  ];
  const reply = toDmText(await dmGenerate(env, messages));
  const next = [...past, { role: "user", content: text.slice(0, 600) }, { role: "assistant", content: reply.slice(0, 900) }].slice(-HISTORY_TURNS * 2);
  await kvPut(env, "dm:h:" + platform + ":" + sender, JSON.stringify(next), HISTORY_TTL);
  return reply;
}

/* ---------- leads from DMs ---------- */
const PHONE_RE = /(?:\+?91[\s-]?|0)?([6-9]\d{4}[\s-]?\d{5})(?!\d)/;
const EMAIL_RE = /[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/i;
export function findContact(text) {
  const t = String(text || "");
  const m = PHONE_RE.exec(t), e = EMAIL_RE.exec(t);
  const phone = m ? "+91" + m[1].replace(/\D/g, "") : "";
  const email = e ? e[0].replace(/[.,;:!?]+$/, "").toLowerCase() : "";
  return phone || email ? { phone, email } : null;
}
let leadSaver = saveLead, leadUpdater = updateLead;
export function _setLeadStore(save, update) { leadSaver = save || saveLead; leadUpdater = update || updateLead; }   // tests

async function profileName(env, platform, id) {
  try {
    const v = env.META_GRAPH_VERSION || "v23.0";
    const f = platform === "instagram" ? "name,username" : "first_name,last_name";
    const r = await fetch("https://graph.facebook.com/" + v + "/" + encodeURIComponent(id) + "?fields=" + f + "&access_token=" + encodeURIComponent(env.META_PAGE_TOKEN));
    if (!r.ok) return { name: "", username: "" };
    const j = await r.json();
    return { name: String(j.name || [j.first_name, j.last_name].filter(Boolean).join(" ") || "").slice(0, 80), username: String(j.username || "").slice(0, 60) };
  } catch (e) { return { name: "", username: "" }; }
}

/* Ask the model to pull the lead details out of the chat (JSON). Never throws. */
async function extractLead(env, convo) {
  const sys = "Extract lead details from this Instagram/Facebook DM chat between a person and the FODO digital marketing agency. Reply with ONLY a JSON object with these string keys: name (the person's own name if they said it), business (their business name or niche), city, need (what they want from FODO, short), budget (if mentioned), summary (one line in English: who they are and what they want). Use empty strings for anything unknown. Do not guess.";
  const msgs = [{ role: "system", content: sys }, { role: "user", content: convo.slice(-3000) }];
  try {
    let raw = "";
    if (env.GROQ_API_KEY) { try { raw = (await groqChat(env, msgs, 400, 15000)).text; } catch (e) { raw = ""; } }
    if (!raw) raw = (await generate(env, msgs, 300)).text;
    const m = /\{[\s\S]*\}/.exec(String(raw || "")); const j = m ? JSON.parse(m[0]) : {};
    const c = (k, n) => String(j[k] == null ? "" : j[k]).trim().slice(0, n);
    return { name: c("name", 80), business: c("business", 100), city: c("city", 60), need: c("need", 200), budget: c("budget", 80), summary: c("summary", 400) };
  } catch (e) { return { name: "", business: "", city: "", need: "", budget: "", summary: "" }; }
}

/* Save (or update) the enquiry once a phone / email shows up. Returns "saved" | "updated" | "" */
async function captureLead(env, ev, contact) {
  const key = "dm:lead:" + ev.platform + ":" + ev.sender;
  const past = await history(env, ev.platform, ev.sender);
  const convo = past.map((m) => (m.role === "user" ? "Person: " : "FODO: ") + m.content).join("\n");
  const info = await extractLead(env, convo);
  const prof = await profileName(env, ev.platform, ev.sender);
  const handle = prof.username ? "@" + prof.username : "";
  const name = info.name || prof.name || handle || (ev.platform === "instagram" ? "Instagram lead" : "Facebook lead");
  const src = ev.platform + "-dm";
  const lines = [info.summary, info.need && "Need: " + info.need, info.budget && "Budget: " + info.budget, handle && "Instagram: " + handle, "Last message: " + ev.text.slice(0, 300)].filter(Boolean).join("\n");
  const existing = await kvGet(env, key);
  if (existing) {
    try { await leadUpdater(env, existing, { notes: ("Update " + new Date().toISOString().slice(0, 16) + ": " + [contact.phone, contact.email].filter(Boolean).join(" ") + "\n" + lines).slice(0, 2000) }); return "updated"; } catch (e) { return ""; }
  }
  const r = await leadSaver(env, { mode: "contact", name, phone: contact.phone, email: contact.email, business: info.business, city: info.city, goal: info.need, budget: info.budget, message: lines, page: "/dm/" + ev.platform, source: src, campaign: "fodo-bot-dm" }, "");
  if (r && r.id) { await kvPut(env, key, r.id, 180 * 86400); return "saved"; }
  return "";
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

/* Small, privacy-safe diagnostics (no ids, no text) shown on GET /api/meta/webhook. */
async function diag(env, platform, kind, result, appId) {
  try {
    const v = await kvGet(env, "dm:diag"); const a = v ? JSON.parse(v) : [];
    a.unshift({ t: new Date().toISOString(), platform, kind, result, app: appId || "" });
    await kvPut(env, "dm:diag", JSON.stringify(a.slice(0, 15)), 7 * 86400);
  } catch (e) { /* diagnostics never block a reply */ }
}
export async function readDiag(env) { try { const v = await kvGet(env, "dm:diag"); return v ? JSON.parse(v) : []; } catch (e) { return []; } }

/* v55.16 conversation log for Admin ▸ Lead Intelligence ▸ Sent & replies ▸ Bot conversations.
   One KV key per person ("dm:cv:<platform>:<sender>", 30 days). The value keeps the last 30 messages; the metadata (read by a
   single KV list) keeps who, the last message each way, when, how many, and whether the bot or a person is answering.
   It never blocks or changes a reply. */
const CV_TTL = 30 * 86400, CV_KEEP = 30;
export async function logConvo(env, ev, o) {
  try {
    if (!env.CHAT_KV || !ev || !ev.sender) return;
    const key = "dm:cv:" + ev.platform + ":" + ev.sender, cur = env.CHAT_KV.getWithMetadata ? await env.CHAT_KV.getWithMetadata(key) : { value: await env.CHAT_KV.get(key), metadata: null };
    let msgs = []; try { msgs = cur.value ? JSON.parse(cur.value) : []; } catch (e) { msgs = []; }
    const m = cur.metadata || {}, t = new Date().toISOString();
    let name = m.n || "";
    if (!name && env.META_PAGE_TOKEN && !m.nt) { const p = await profileName(env, ev.platform, ev.sender); name = p.username ? "@" + p.username + (p.name ? " (" + p.name + ")" : "") : p.name; }
    if (o.in) msgs.push({ r: "in", t, x: String(o.in).slice(0, 600) });
    if (o.out) msgs.push({ r: o.by === "human" ? "human" : "bot", t, x: String(o.out).slice(0, 900) });
    msgs = msgs.slice(-CV_KEEP);
    const meta = { p: ev.platform, n: String(name || "").slice(0, 90), nt: 1, li: o.in ? String(o.in).slice(0, 140) : m.li || "", lo: o.out ? String(o.out).slice(0, 140) : m.lo || "",
      at: t, c: (m.c || 0) + (o.in ? 1 : 0), st: o.state || m.st || "bot", ld: o.lead || m.ld || "" };
    await env.CHAT_KV.put(key, JSON.stringify(msgs), { expirationTtl: CV_TTL, metadata: meta });
  } catch (e) { /* the log never blocks a reply */ }
}
/* Handle one parsed event. Returns what happened (for logs and tests). */
export async function handleEvent(env, ev) {
  let r;
  try { r = await handleEventInner(env, ev); }
  catch (e) { await diag(env, ev.platform, ev.kind, "error: " + String((e && e.message) || e).replace(/access_token=[^&\s]+/g, "").slice(0, 160), ev.appId); throw e; }
  await diag(env, ev.platform, ev.kind, r, ev.appId);
  return r;
}

async function handleEventInner(env, ev) {
  const pauseKey = "dm:hp:" + ev.platform + ":" + ev.sender;
  const lastKey = "dm:last:" + ev.platform + ":" + ev.sender;
  if (ev.kind === "human_echo") {
    if (ev.mid && (await kvGet(env, "dm:mine:" + ev.mid))) return "own_echo";
    const ignore = String(env.META_BOT_AUTOMATION_APP_IDS || "").split(",").map((x) => x.trim()).filter(Boolean);
    if (ev.appId && ignore.includes(ev.appId)) return "automation_echo";
    // Meta inbox automations (Instant reply, FAQ, keywords) answer within seconds; a human takes longer.
    const win = Math.max(5, parseInt(env.META_BOT_AUTO_ECHO_SECONDS || "45", 10) || 45) * 1000;
    const last = Number(await kvGet(env, lastKey)) || 0;
    if (last && ev.ts && ev.ts - last >= 0 && ev.ts - last < win) return "automation_echo";
    const hrs = Math.max(1, parseInt(env.META_BOT_HUMAN_PAUSE_HOURS || "12", 10) || 12);
    await kvPut(env, pauseKey, "1", hrs * 3600);
    await logConvo(env, ev, { out: ev.text ? ev.text : "", by: "human", state: "human" });
    return "paused";
  }
  if (ev.ts) await kvPut(env, lastKey, String(ev.ts), 86400);
  if (String(env.META_BOT_DISABLED || "") === "1") { await logConvo(env, ev, { in: ev.text, state: "off" }); return "disabled"; }
  if (!env.META_PAGE_TOKEN) return "no_token";
  if (ev.mid) { const k = "dm:seen:" + ev.mid; if (await kvGet(env, k)) return "duplicate"; await kvPut(env, k, "1", DEDUPE_TTL); }
  if (await kvGet(env, pauseKey)) { await logConvo(env, ev, { in: ev.text, state: "human" }); return "human_active"; }
  const contact = findContact(ev.text);
  const leadKnown = !!contact || !!(await kvGet(env, "dm:lead:" + ev.platform + ":" + ev.sender));
  let reply;
  try { reply = await replyFor(env, ev.platform, ev.sender, ev.text, { saved: leadKnown }); } catch (e) { console.error("fodo-dm ai error:", String((e && e.message) || e).slice(0, 160)); reply = FALLBACK; }
  if (!reply) reply = FALLBACK;
  const res = await sendDm(env, ev.sender, reply);
  if (res && res.message_id) await kvPut(env, "dm:mine:" + res.message_id, "1", DEDUPE_TTL);
  let lead = "";
  if (contact) { try { lead = await captureLead(env, ev, contact); } catch (e) { console.error("fodo-dm lead:", String((e && e.message) || e).slice(0, 120)); lead = "lead_error"; } }
  await logConvo(env, ev, { in: ev.text, out: reply, state: "bot", lead: lead === "saved" || lead === "updated" ? "saved" : "" });
  return (reply === FALLBACK ? "sent_fallback" : "sent") + (lead ? "+lead_" + lead : "");
}
