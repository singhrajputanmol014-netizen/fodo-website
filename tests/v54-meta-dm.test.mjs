// v54: FODO Bot in Instagram + Facebook DMs (/api/meta/webhook).
// Run: node --no-warnings tests/v54-meta-dm.test.mjs
import { createHmac } from "node:crypto";
import { onRequestGet, onRequestPost } from "../functions/api/meta/webhook.js";
import { toDmText, findContact, _setLeadStore } from "../functions/_lib/metadm.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
console.error = () => {};

const kv = new Map();
const CHAT_KV = { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); } };
const prompts = [], sent = [];
let aiFail = false, aiReply = "Hi! We build **websites** and run ads. See [Free Growth Audit](/contact/?mode=audit).";
const AI = { run: async (m, inp) => { if (aiFail) throw new Error("model down"); prompts.push(inp.messages); return { response: aiReply }; } };
globalThis.fetch = async (u, o = {}) => {
  u = String(u);
  if (/graph\.facebook\.com\/v23\.0\/me\/messages/.test(u)) { sent.push(JSON.parse(o.body)); return new Response(JSON.stringify({ message_id: "m" + sent.length })); }
  return new Response("not mocked " + u, { status: 599 });
};
const SECRET = "app-secret-x";
const env = { AI, CHAT_KV, META_APP_SECRET: SECRET, META_APP_ID: "111", META_WEBHOOK_VERIFY_TOKEN: "verify-me", META_PAGE_TOKEN: "page-token", META_PAGE_ID: "659006123960042", META_IG_ID: "17841476681882495" };
const URL_ = "https://www.fodo.co.in/api/meta/webhook";
const sign = (raw) => "sha256=" + createHmac("sha256", SECRET).update(raw).digest("hex");
const post = async (body, o = {}) => {
  const raw = JSON.stringify(body);
  const r = await onRequestPost({ request: new Request(URL_, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": o.sig === undefined ? sign(raw) : o.sig }, body: raw }), env: o.env || env });
  return { status: r.status, t: await r.text() };
};
const igMsg = (sender, text, mid) => ({ object: "instagram", entry: [{ id: env.META_IG_ID, messaging: [{ sender: { id: sender }, recipient: { id: env.META_IG_ID }, message: { mid, text } }] }] });
const fbMsg = (sender, text, mid) => ({ object: "page", entry: [{ id: env.META_PAGE_ID, messaging: [{ sender: { id: sender }, recipient: { id: env.META_PAGE_ID }, message: { mid, text } }] }] });

/* 1. Meta verification */
let r = await onRequestGet({ request: new Request(URL_ + "?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345"), env });
ok(r.status === 200 && (await r.text()) === "12345", "GET with the right verify token echoes the challenge");
r = await onRequestGet({ request: new Request(URL_ + "?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345"), env });
ok(r.status === 403, "wrong verify token is refused");
r = await onRequestGet({ request: new Request(URL_), env }); const h = JSON.parse(await r.text());
ok(h.ok && h.configured === true && h.disabled === false, "health check shows configured, reveals no secrets");

/* 2. signature */
let p = await post(igMsg("u1", "hi", "x0"), { sig: "sha256=" + "0".repeat(64) });
ok(p.status === 401 && sent.length === 0, "bad signature: 401, nothing sent");
p = await post(igMsg("u1", "hi", "x0"), { sig: "" });
ok(p.status === 401, "missing signature: 401");

/* 3. Instagram DM gets an AI reply in plain text */
p = await post(igMsg("u1", "website banwana hai, kitna lagega?", "m1"));
ok(p.status === 200 && sent.length === 1 && sent[0].recipient.id === "u1" && sent[0].messaging_type === "RESPONSE", "Instagram DM answered once, as RESPONSE to the sender");
ok(!/\*\*|\]\(/.test(sent[0].message.text) && /https:\/\/www\.fodo\.co\.in\/contact\/\?mode=audit/.test(sent[0].message.text), "reply is plain text, site link made absolute");
const sys = prompts[0][0].content;
ok(/DIRECT MESSAGE ON INSTAGRAM OR FACEBOOK/.test(sys) && /language and script the person used/.test(sys) && /Never add a translation in brackets/.test(sys) && /LEAD FLOW/.test(sys) && /FODO GROWTH LAB/.test(sys), "prompt = FODO Bot brain + DM rules (language match) + site knowledge");
ok(/7827007676|78270 07676/.test(sys), "prompt carries the FODO WhatsApp number");

/* 4. memory: the second message sees the first exchange */
p = await post(igMsg("u1", "haan", "m2"));
const second = prompts[1];
ok(second.length === 4 && second[1].role === "user" && /website banwana/.test(second[1].content) && second[2].role === "assistant", "follow-up 'haan' carries the earlier turn (history in KV)");

/* 5. duplicate delivery is not answered twice */
const before = sent.length; p = await post(igMsg("u1", "haan", "m2"));
ok(sent.length === before, "same message id delivered again: no second reply");

/* 6. Facebook Messenger works too */
p = await post(fbMsg("f1", "Do you do SEO?", "fb1"));
ok(sent.length === before + 1 && sent[sent.length - 1].recipient.id === "f1", "Facebook Messenger DM answered");

/* 7. our own messages and non-text are ignored */
const n = sent.length;
await post({ object: "page", entry: [{ id: env.META_PAGE_ID, messaging: [{ sender: { id: env.META_PAGE_ID }, recipient: { id: "f1" }, message: { mid: "own1", text: "hello" } }] }] });
await post({ object: "instagram", entry: [{ id: env.META_IG_ID, messaging: [{ sender: { id: "u9" }, recipient: { id: env.META_IG_ID }, message: { mid: "img1", attachments: [{ type: "image" }] } }] }] });
ok(sent.length === n + 1 && /photo you cannot see/.test(prompts[prompts.length - 1].slice(-1)[0].content), "own messages are ignored; a photo gets a reply asking them to type it");
const n2 = sent.length;

/* 8. a human replies in the thread: the bot goes quiet there */
await post({ object: "instagram", entry: [{ id: env.META_IG_ID, messaging: [{ sender: { id: env.META_IG_ID }, recipient: { id: "u1" }, message: { mid: "h1", is_echo: true, app_id: "263902037430900", text: "Hi, Anmol here" } }] }] });
await post(igMsg("u1", "ok thanks, price?", "m3"));
ok(sent.length === n2, "after a human reply (echo from another app) the bot stays quiet in that chat");
await post({ object: "instagram", entry: [{ id: env.META_IG_ID, messaging: [{ sender: { id: env.META_IG_ID }, recipient: { id: "u2" }, message: { mid: "b1", is_echo: true, app_id: "111", text: "bot text" } }] }] });
await post(igMsg("u2", "hello", "m4"));
ok(sent.length === n2 + 1, "the bot's own echo does not pause the chat");

/* 8b. a Meta inbox automation (Instant reply / FAQ) answers within seconds: it is NOT a human, the bot keeps replying */
const t0 = Date.now();
await post({ object: "instagram", entry: [{ id: env.META_IG_ID, messaging: [{ sender: { id: "u5" }, recipient: { id: env.META_IG_ID }, timestamp: t0, message: { mid: "a1", text: "hi" } }] }] });
await post({ object: "instagram", entry: [{ id: env.META_IG_ID, messaging: [{ sender: { id: env.META_IG_ID }, recipient: { id: "u5" }, timestamp: t0 + 2000, message: { mid: "a2", is_echo: true, app_id: "263902037430900", text: "Thanks for messaging FODO!" } }] }] });
const s5 = sent.length;
await post({ object: "instagram", entry: [{ id: env.META_IG_ID, messaging: [{ sender: { id: "u5" }, recipient: { id: env.META_IG_ID }, timestamp: t0 + 9000, message: { mid: "a3", text: "website ka price kya hai?" } }] }] });
ok(sent.length === s5 + 1, "an instant Meta auto-reply echo does not pause the bot");
await post({ object: "instagram", entry: [{ id: env.META_IG_ID, messaging: [{ sender: { id: env.META_IG_ID }, recipient: { id: "u5" }, timestamp: t0 + 600000, message: { mid: "a4", is_echo: true, app_id: "263902037430900", text: "Anmol here, call me" } }] }] });
await post({ object: "instagram", entry: [{ id: env.META_IG_ID, messaging: [{ sender: { id: "u5" }, recipient: { id: env.META_IG_ID }, timestamp: t0 + 700000, message: { mid: "a5", text: "ok" } }] }] });
ok(sent.length === s5 + 1, "a slow (human) reply still pauses the bot");

/* 8c. lead capture: a phone number in the DM becomes an enquiry for the team */
const leads = [], updates = [];
_setLeadStore(async (e, b) => { leads.push(b); return { ok: true, id: "ld_test1" }; }, async (e, id, b) => { updates.push({ id, b }); return { ok: true }; });
await post(igMsg("u6", "website chahiye mere cafe ke liye, Jaipur", "l1"));
const s6 = sent.length, np = prompts.length;
await post(igMsg("u6", "mera number 98765 43210 hai, Rahul", "l2"));
ok(sent.length === s6 + 1 && leads.length === 1 && leads[0].phone === "+919876543210" && leads[0].source === "instagram-dm" && leads[0].page === "/dm/instagram", "phone number in a DM saves an enquiry (source instagram-dm)");
ok(/ALREADY shared their contact/.test(prompts[np][0].content), "the bot is told the contact is saved, so it won't ask again");
await post(igMsg("u6", "email bhi le lo: rahul@cafe.in", "l3"));
ok(leads.length === 1 && updates.length === 1 && updates[0].id === "ld_test1" && /rahul@cafe\.in/.test(updates[0].b.notes), "a second contact detail updates the same enquiry");
ok(findContact("call +91-9812345678") && findContact("call +91-9812345678").phone === "+919812345678" && !findContact("order 12345") && findContact("x@y.com").email === "x@y.com", "phone / email detection");

/* 8d. own echo recognised by message id (Instagram echoes carry no app id) */
const s7 = sent.length, myMid = "m" + s7;
await post({ object: "instagram", entry: [{ id: env.META_IG_ID, messaging: [{ sender: { id: env.META_IG_ID }, recipient: { id: "u6" }, timestamp: Date.now() + 999999, message: { mid: myMid, is_echo: true, text: "our reply" } }] }] });
await post(igMsg("u6", "thanks", "l4"));
ok(sent.length === s7 + 1, "the bot's own Instagram echo (matched by message id) never pauses the chat");

/* 8e. any type of message gets a reply: photo, voice note, button */
const s8 = sent.length;
await post({ object: "instagram", entry: [{ id: env.META_IG_ID, messaging: [{ sender: { id: "u7" }, recipient: { id: env.META_IG_ID }, message: { mid: "at1", attachments: [{ type: "audio" }] } }] }] });
await post({ object: "page", entry: [{ id: env.META_PAGE_ID, messaging: [{ sender: { id: "f7" }, recipient: { id: env.META_PAGE_ID }, timestamp: 5, postback: { title: "Website banwani hai", payload: "WEB" } }] }] });
await post({ object: "instagram", entry: [{ id: env.META_IG_ID, messaging: [{ sender: { id: "u8" }, recipient: { id: env.META_IG_ID }, message: { mid: "at2", attachments: [{ type: "like_heart" }] } }] }] });
ok(sent.length === s8 + 2, "voice notes and buttons get a reply, a heart reaction does not");

/* 9. AI down: friendly bilingual fallback, never silence */
aiFail = true; await post(igMsg("u3", "hello?", "m5")); aiFail = false;
const fb = sent[sent.length - 1].message.text;
ok(/78270 07676/.test(fb) && /धन्यवाद/.test(fb), "AI failure: bilingual fallback with the WhatsApp number");

/* 10. kill switch */
const k = sent.length; await post(igMsg("u4", "hi", "m6"), { env: Object.assign({}, env, { META_BOT_DISABLED: "1" }) });
ok(sent.length === k, "META_BOT_DISABLED=1: nothing is sent");

/* 11. text clean-up */
ok(toDmText("**Hi**\n- one\n- two — three\n[WhatsApp](https://wa.me/917827007676)") === "Hi\none\ntwo, three\nWhatsApp: https://wa.me/917827007676", "Markdown, bullets and long dashes are stripped for DMs");
ok(toDmText("a. ".repeat(600)).length <= 950, "replies are capped for Instagram's message limit");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
