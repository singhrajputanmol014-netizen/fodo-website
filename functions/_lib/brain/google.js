/* FODO OWNER BRAIN — Google connector (the owner's own Gmail + Calendar). OAuth with the site's existing Google client
   (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET — already used for Search Console). The refresh token is stored AES-GCM encrypted in
   D1 (brain_connectors) and can be disconnected (revoked) any time. Reading is automatic; sending email and creating calendar
   events are level-2 tools that always wait for the owner's confirmation.
   Google Cloud Console → the same OAuth client → Authorized redirect URIs → add  https://www.fodo.co.in/api/owner-brain/connect/google/callback
   and enable the Gmail API + Google Calendar API. */
import { brainDb, nowIso, clip, clean } from "./store.js";
import { seal, unseal, makeState, checkState } from "../gsc.js";
import { outbound } from "../xray-core.js";

export const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/calendar.events", "openid", "email"];
export const googleOn = (env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
export const redirect = (origin) => origin + "/api/owner-brain/connect/google/callback";
export async function connectUrl(env, origin, userId) {
  return "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirect(origin), response_type: "code", scope: SCOPES.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state: "brain." + (await makeState(env, userId)) }).toString();
}
async function token(env, params) {
  const r = await outbound(env)("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(Object.assign({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET }, params)).toString(), signal: AbortSignal.timeout(12000) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error("Google: " + (j.error_description || j.error || r.status)); return j;
}
export async function finishConnect(env, origin, userId, code, state) {
  if (!(await checkState(env, String(state || "").replace(/^brain\./, ""), userId))) throw new Error("The Google sign-in link expired — try Connect again.");
  const t = await token(env, { code, redirect_uri: redirect(origin), grant_type: "authorization_code" });
  if (!t.refresh_token) throw new Error("Google did not return offline access — remove FODO from your Google account's third-party access and connect again.");
  let account = ""; try { account = JSON.parse(atob(String(t.id_token || "").split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).email || ""; } catch (e) {}
  const d = await brainDb(env);
  await d.prepare("INSERT INTO brain_connectors (id, data, scopes, account, connected_at, last_used) VALUES ('google', ?1, ?2, ?3, ?4, ?4) ON CONFLICT(id) DO UPDATE SET data=?1, scopes=?2, account=?3, connected_at=?4").bind(await seal(env, t.refresh_token), t.scope || SCOPES.join(" "), account, nowIso()).run();
  return { account };
}
export async function disconnect(env) {
  const d = await brainDb(env), r = await d.prepare("SELECT data FROM brain_connectors WHERE id='google'").first();
  if (r) { try { await outbound(env)("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(await unseal(env, r.data)), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(8000) }); } catch (e) {} }
  await d.prepare("DELETE FROM brain_connectors WHERE id='google'").run(); return { disconnected: true };
}
export async function status(env) { if (!googleOn(env)) return { available: false }; const d = await brainDb(env), r = await d.prepare("SELECT scopes, account, connected_at, last_used FROM brain_connectors WHERE id='google'").first(); return { available: true, connected: !!r, account: r && r.account, scopes: r && r.scopes, connectedAt: r && r.connected_at, lastUsed: r && r.last_used }; }
let cache = { at: 0, tok: null };
async function access(env) {
  if (cache.tok && Date.now() - cache.at < 45 * 60e3) return cache.tok;
  const d = await brainDb(env), r = await d.prepare("SELECT data FROM brain_connectors WHERE id='google'").first();
  if (!r) throw new Error("Gmail/Calendar is not connected — open Brain → Connectors → Connect Google.");
  const t = await token(env, { refresh_token: await unseal(env, r.data), grant_type: "refresh_token" });
  cache = { at: Date.now(), tok: t.access_token }; await d.prepare("UPDATE brain_connectors SET last_used=?1 WHERE id='google'").bind(nowIso()).run();
  return t.access_token;
}
async function g(env, url, opt) {
  opt = opt || {}; const r = await outbound(env)(url, { method: opt.method || "GET", headers: { authorization: "Bearer " + (await access(env)), "content-type": "application/json" }, body: opt.body ? JSON.stringify(opt.body) : undefined, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error("Google " + r.status + ": " + clip((j.error && j.error.message) || "", 140)); return j;
}
const hdr = (m, n) => ((m.payload && m.payload.headers) || []).filter((h) => h.name.toLowerCase() === n)[0];
const b64url = (s) => { const b = atob(String(s).replace(/-/g, "+").replace(/_/g, "/")), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new TextDecoder().decode(u); };
function bodyText(p) { if (!p) return ""; if (p.mimeType === "text/plain" && p.body && p.body.data) return b64url(p.body.data); for (const x of p.parts || []) { const t = bodyText(x); if (t) return t; } if (p.mimeType === "text/html" && p.body && p.body.data) return b64url(p.body.data).replace(/<[^>]+>/g, " "); return ""; }
export async function emailSearch(env, q) {
  const L = await g(env, "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=" + encodeURIComponent(clean(q, 200) || "in:inbox newer_than:2d"));
  const out = []; for (const m of (L.messages || []).slice(0, 10)) { const x = await g(env, "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + m.id + "?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date"); out.push({ id: m.id, from: (hdr(x, "from") || {}).value, subject: (hdr(x, "subject") || {}).value, date: (hdr(x, "date") || {}).value, snippet: clip(x.snippet, 220), unread: (x.labelIds || []).indexOf("UNREAD") > -1 }); }
  return out;
}
export async function emailRead(env, id) { const x = await g(env, "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + encodeURIComponent(id) + "?format=full"); return { id, from: (hdr(x, "from") || {}).value, to: (hdr(x, "to") || {}).value, subject: (hdr(x, "subject") || {}).value, date: (hdr(x, "date") || {}).value, text: clip(bodyText(x.payload).replace(/\s+\n/g, "\n"), 6000) }; }
export async function emailSend(env, to, subject, body, threadId) {
  const enc = (s) => { const u = new TextEncoder().encode(s); let b = ""; for (let i = 0; i < u.length; i++) b += String.fromCharCode(u[i]); return btoa(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  const subj = "=?UTF-8?B?" + btoa(unescape(encodeURIComponent(subject))) + "?=";
  const raw = enc("To: " + to + "\r\nSubject: " + subj + "\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n" + body);
  const r = await g(env, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", body: Object.assign({ raw }, threadId ? { threadId } : {}) });
  return { sent: true, id: r.id, to, subject, via: "your Gmail" };
}
export async function calendarList(env, days) {
  const from = new Date(), to = new Date(Date.now() + Math.max(1, Math.min(31, days || 2)) * 864e5);
  const j = await g(env, "https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=25&timeMin=" + from.toISOString() + "&timeMax=" + to.toISOString());
  return (j.items || []).map((e) => ({ id: e.id, title: e.summary, start: e.start && (e.start.dateTime || e.start.date), end: e.end && (e.end.dateTime || e.end.date), where: e.location || "", attendees: (e.attendees || []).map((a) => a.email).slice(0, 8), link: e.hangoutLink || "" }));
}
export async function calendarCreate(env, a) {
  const tz = "Asia/Kolkata", start = a.start, end = a.end || new Date(Date.parse(a.start) + (a.minutes || 30) * 60e3).toISOString();
  const e = await g(env, "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=" + (a.attendees ? "all" : "none"), { method: "POST", body: { summary: clip(a.title, 200), description: clip(a.notes || "", 2000), start: { dateTime: start, timeZone: tz }, end: { dateTime: end, timeZone: tz }, attendees: String(a.attendees || "").split(/[,; ]+/).filter((x) => /@/.test(x)).slice(0, 10).map((email) => ({ email })) } });
  return { created: true, id: e.id, title: e.summary, start: e.start && e.start.dateTime, link: e.htmlLink };
}
