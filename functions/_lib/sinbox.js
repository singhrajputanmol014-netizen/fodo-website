/* FODO v53.3 Admin ▸ Studio ▸ Inbox: FODO's own Gmail / Google Workspace mailbox (anmol@fodo.co.in) inside FODO Admin.
   Uses the Google connection the Owner Brain already has (brain/google.js: refresh token sealed in D1, Gmail read + send).
   The owner presses "Log in with Google" once (GET /api/admin/studio/connect), Google brings them back to /admin/#studio.
   Then: list the inbox, open a mail, reply in the same Gmail thread, or reply with the sender's FODO Studio key
   (the account + key are made for that email if needed). Sending a key to any email address works the same way.
   Only FODO owners can read the inbox (it is a personal mailbox); the reply lands in the mailbox's Sent folder. */
import * as GO from "./brain/google.js";
import { cleanEmail, mailLog } from "./accounts.js";
import { err } from "./biz.js";
import { keyFor, keyMail, markRequests, STUDIO_REPLY } from "./slicense.js";

const H = (m, n) => (((m && m.payload && m.payload.headers) || []).filter((h) => h.name.toLowerCase() === n)[0] || {}).value || "";
const b64d = (s) => { const b = atob(String(s).replace(/-/g, "+").replace(/_/g, "/")), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new TextDecoder().decode(u); };
const b64e = (s) => { const u = new TextEncoder().encode(s); let b = ""; for (let i = 0; i < u.length; i++) b += String.fromCharCode(u[i]); return btoa(b); };
const b64url = (s) => b64e(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const wrap = (s) => s.replace(/.{1,76}/g, "$&\r\n");
const hdrEnc = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : "=?UTF-8?B?" + b64e(s) + "?=");
const clip = (s, n) => String(s == null ? "" : s).slice(0, n);
export const emailOf = (from) => { const m = /<([^>]+)>/.exec(String(from || "")); return cleanEmail(m ? m[1] : from); };
function bodyText(p) {
  if (!p) return "";
  if (p.mimeType === "text/plain" && p.body && p.body.data) return b64d(p.body.data);
  for (const x of p.parts || []) { const t = bodyText(x); if (t) return t; }
  if (p.mimeType === "text/html" && p.body && p.body.data) return b64d(p.body.data).replace(/<(br|\/p|\/div)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  return "";
}

/* which connected Google account is the FODO mailbox: the one matching STUDIO_REPLY (anmol@fodo.co.in), else the first with Gmail */
export async function status(env) {
  const s = await GO.status(env);
  const L = (s.accounts || []).filter((a) => a.scopes.indexOf("Read Gmail") > -1 && a.scopes.indexOf("Send Gmail") > -1);
  const want = String(STUDIO_REPLY(env)).toLowerCase(), main = L.filter((a) => a.account === want)[0] || L[0] || null;
  return { available: !!s.available, connected: !!main, account: main ? main.account : "", accounts: L.map((a) => a.account), want, others: (s.accounts || []).filter((a) => L.indexOf(a) < 0).map((a) => a.account) };
}
async function mailbox(env, account) {
  const s = await status(env);
  if (!s.available) throw err("Google login is not set up on the website (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).", 400);
  if (!s.connected) throw err("Log in with Google first (" + s.want + ").", 409);
  const a = String(account || "").toLowerCase();
  if (a && s.accounts.indexOf(a) < 0) throw err(a + " is not connected. Connected: " + s.accounts.join(", "), 400);
  return a || s.account;
}

/* sender's FODO Studio status, for the "Has a key" chip */
async function keyStatus(env, emails) {
  const out = {}, list = [...new Set(emails.filter(Boolean))].slice(0, 60); if (!list.length) return out;
  const d = env.XRAY_DB, q = "SELECT u.email, l.status FROM acct_users u LEFT JOIN ss_licenses l ON l.user_id = u.id WHERE u.email IN (" + list.map((_, i) => "?" + (i + 1)).join(",") + ")";
  try { ((await d.prepare(q).bind(...list).all()).results || []).forEach((r) => { out[r.email] = r.status || "account"; }); } catch (e) {}
  return out;
}

export async function list(env, o) {
  o = o || {}; const acc = await mailbox(env, o.account), q = clip(o.q || "in:inbox", 300), n = Math.max(5, Math.min(50, +o.n || 25));
  const L = await GO.g(env, acc, "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=" + n + "&q=" + encodeURIComponent(q) + (o.page ? "&pageToken=" + encodeURIComponent(clip(o.page, 200)) : ""));
  const ids = (L.messages || []).map((m) => m.id);
  const rows = await Promise.all(ids.map((id) => GO.g(env, acc, "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + encodeURIComponent(id) + "?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Reply-To").catch(() => null)));
  const items = rows.filter(Boolean).map((x) => ({ id: x.id, thread: x.threadId, from: H(x, "from"), email: emailOf(H(x, "reply-to") || H(x, "from")), subject: H(x, "subject"), date: H(x, "date"), at: +x.internalDate || 0, snippet: clip(x.snippet, 240), unread: (x.labelIds || []).indexOf("UNREAD") > -1 }));
  const ks = await keyStatus(env, items.map((x) => x.email));
  items.forEach((x) => { x.key = x.email === acc ? "me" : ks[x.email] || "none"; });
  return { account: acc, q, items, next: L.nextPageToken || null };
}
export async function read(env, id, account) {
  const acc = await mailbox(env, account), x = await GO.g(env, acc, "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + encodeURIComponent(String(id)) + "?format=full");
  const email = emailOf(H(x, "reply-to") || H(x, "from")), ks = await keyStatus(env, [email]);
  return { account: acc, id: x.id, thread: x.threadId, from: H(x, "from"), email, to: H(x, "to"), subject: H(x, "subject"), date: H(x, "date"), text: clip(bodyText(x.payload).replace(/\r/g, "").replace(/\n{3,}/g, "\n\n"), 20000), key: email === acc ? "me" : ks[email] || "none" };
}

/* build + send one email from the mailbox (a reply keeps the Gmail thread) */
async function send(env, acc, to, subject, text, html, reply, by, kind) {
  const bnd = "fodo_" + Math.random().toString(36).slice(2), lines = ["From: " + hdrEnc("Anmol from FODO") + " <" + acc + ">", "To: " + to, "Subject: " + hdrEnc(subject), "MIME-Version: 1.0"];
  if (reply && reply.msgId) lines.push("In-Reply-To: " + reply.msgId, "References: " + ((reply.refs ? reply.refs + " " : "") + reply.msgId).trim());
  let raw;
  if (html) raw = lines.concat(["Content-Type: multipart/alternative; boundary=\"" + bnd + "\"", "", "--" + bnd, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap(b64e(text)), "--" + bnd, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap(b64e(html)), "--" + bnd + "--", ""]).join("\r\n");
  else raw = lines.concat(["Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap(b64e(text))]).join("\r\n");
  const r = await GO.g(env, acc, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", body: Object.assign({ raw: b64url(raw) }, reply && reply.thread ? { threadId: reply.thread } : {}) });
  await mailLog(env, { kind, from: acc, to, subject, text: kind === "studio_key" ? "[FODO Studio key sent from Gmail]" : text, status: "sent", providerId: "gmail:" + (r.id || ""), by });
  return { sent: true, id: r.id, thread: r.threadId, from: acc, to, via: "Gmail" };
}
async function original(env, acc, id) {
  const x = await GO.g(env, acc, "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + encodeURIComponent(String(id)) + "?format=metadata&metadataHeaders=From&metadataHeaders=Reply-To&metadataHeaders=Subject&metadataHeaders=Message-ID&metadataHeaders=References");
  const to = emailOf(H(x, "reply-to") || H(x, "from")); if (!to) throw err("This mail has no sender address to reply to.", 400);
  const s = H(x, "subject"); return { to, subject: /^re:/i.test(s) ? s : "Re: " + (s || "FODO Studio"), reply: { thread: x.threadId, msgId: H(x, "message-id"), refs: H(x, "references") } };
}
export async function reply(env, id, b, by) {
  const acc = await mailbox(env, b.account), o = await original(env, acc, id), text = String(b.text || "").trim().slice(0, 20000);
  if (!text) throw err("Write the reply first.", 400);
  return send(env, acc, o.to, o.subject, text, null, o.reply, by, "gmail_reply");
}
/* the key goes in the reply (or a new mail to any address); account + key made for that email if needed */
export async function sendKey(env, b, by) {
  const acc = await mailbox(env, b.account); let to, subject = "Your FODO Studio key", rep = null;
  if (b.id) { const o = await original(env, acc, b.id); to = o.to; subject = o.subject; rep = o.reply; }
  else { to = cleanEmail(b.email); if (!to) throw err("Type a correct email address.", 400); }
  if (to === acc) throw err("That is FODO's own address.", 400);
  const k = await keyFor(env, to), m = keyMail(to, k.key, String(b.message || "").replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").trim().slice(0, 1500));
  const r = await send(env, acc, to, subject, m.text, m.html, rep, by, "studio_key");
  await markRequests(env, to, true, null, by);
  return Object.assign(r, { email: to, user_id: k.user_id });
}
export async function sendKeyMail(env, to, msg, by) {   // used by "Email the key" when the mailbox is connected
  const acc = await mailbox(env), k = await keyFor(env, to), m = keyMail(to, k.key, msg);
  return send(env, acc, to, "Your FODO Studio key", m.text, m.html, null, by, "studio_key");
}
