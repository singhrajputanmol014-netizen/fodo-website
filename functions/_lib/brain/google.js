/* FODO OWNER BRAIN: Google connector: ANY NUMBER of the owner's Google accounts (Gmail, Calendar, Analytics 4, YouTube,
   Drive, Sheets). OAuth with the site's existing Google client (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET). Each account's refresh
   token is stored AES-GCM encrypted in D1 (brain_connectors, id "google:<email>") and can be disconnected (revoked) any time.
   Reading is automatic; sending email, creating calendar events and uploading to YouTube always wait for confirmation.
   Google Cloud Console → the same OAuth client → Authorized redirect URIs:
     https://www.fodo.co.in/api/owner-brain/connect/google/callback  and  https://fodo.co.in/api/owner-brain/connect/google/callback
   Enable: Gmail API, Google Calendar API, Google Analytics Data API, Google Analytics Admin API, YouTube Data API v3,
   Google Drive API, Google Sheets API. Google's consent screen lets the owner untick any of these per account. */
import { brainDb, nowIso, clip, clean } from "./store.js";
import { seal, unseal, makeState, checkState } from "../gsc.js";
import { outbound } from "../xray-core.js";

export const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/analytics.readonly", "https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/spreadsheets.readonly", "openid", "email"];
export const SCOPE_LABELS = { "gmail.readonly": "Read Gmail", "gmail.send": "Send Gmail", "calendar.events": "Calendar", "analytics.readonly": "Analytics 4", "youtube.readonly": "YouTube stats", "youtube.upload": "YouTube upload", "drive.readonly": "Drive", "spreadsheets.readonly": "Sheets" };
export const googleOn = (env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
export const redirect = (origin) => origin + "/api/owner-brain/connect/google/callback";
const KEY = (email) => "google:" + String(email || "").toLowerCase();
export async function connectUrl(env, origin, userId, hint) {
  return "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams(Object.assign({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirect(origin), response_type: "code", scope: SCOPES.join(" "), access_type: "offline", prompt: "consent select_account", include_granted_scopes: "true", state: "brain." + (await makeState(env, userId)) }, hint ? { login_hint: hint } : {})).toString();
}
async function token(env, params) {
  const r = await outbound(env)("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(Object.assign({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET }, params)).toString(), signal: AbortSignal.timeout(12000) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error("Google: " + (j.error_description || j.error || r.status)); return j;
}
/* v22 stored one account under id "google", move it to "google:<email>" once */
async function migrate(d) { const old = await d.prepare("SELECT * FROM brain_connectors WHERE id='google'").first(); if (!old) return; if (old.account) await d.prepare("INSERT OR IGNORE INTO brain_connectors (id, data, scopes, account, connected_at, last_used) VALUES (?1,?2,?3,?4,?5,?6)").bind(KEY(old.account), old.data, old.scopes, old.account, old.connected_at, old.last_used).run(); await d.prepare("DELETE FROM brain_connectors WHERE id='google'").run(); }
export async function accounts(env) { const d = await brainDb(env); await migrate(d); return ((await d.prepare("SELECT id, scopes, account, connected_at, last_used FROM brain_connectors WHERE id LIKE 'google:%' ORDER BY connected_at").all()).results || []); }
export async function finishConnect(env, origin, userId, code, state, by) {
  if (!(await checkState(env, String(state || "").replace(/^brain\./, ""), userId))) throw new Error("The Google sign-in link expired, try Connect again.");
  const t = await token(env, { code, redirect_uri: redirect(origin), grant_type: "authorization_code" });
  if (!t.refresh_token) throw new Error("Google did not return offline access, remove FODO from your Google account's third-party access and connect again.");
  let account = ""; try { account = JSON.parse(atob(String(t.id_token || "").split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).email || ""; } catch (e) {}
  if (!account) throw new Error("Google did not say which account this is, try again.");
  const d = await brainDb(env); await migrate(d);
  await d.prepare("INSERT INTO brain_connectors (id, data, scopes, account, connected_at, last_used) VALUES (?1, ?2, ?3, ?4, ?5, ?5) ON CONFLICT(id) DO UPDATE SET data=?2, scopes=?3, connected_at=?5").bind(KEY(account), await seal(env, t.refresh_token), t.scope || SCOPES.join(" "), account.toLowerCase(), nowIso()).run();
  delete cache[account.toLowerCase()];
  return { account: account.toLowerCase() };
}
export async function disconnect(env, account) {
  const d = await brainDb(env); await migrate(d);
  const L = account ? [await d.prepare("SELECT * FROM brain_connectors WHERE id=?1").bind(KEY(account)).first()].filter(Boolean) : ((await d.prepare("SELECT * FROM brain_connectors WHERE id LIKE 'google:%'").all()).results || []);
  for (const r of L) { try { await outbound(env)("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(await unseal(env, r.data)), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(8000) }); } catch (e) {} await d.prepare("DELETE FROM brain_connectors WHERE id=?1").bind(r.id).run(); delete cache[r.account]; }
  return { disconnected: L.map((r) => r.account) };
}
const has = (scopes, s) => String(scopes || "").indexOf(s) > -1;
export async function status(env) {
  if (!googleOn(env)) return { available: false, accounts: [] };
  const L = await accounts(env);
  return { available: true, connected: L.length > 0, account: L[0] && L[0].account, accounts: L.map((r) => ({ account: r.account, connectedAt: r.connected_at, lastUsed: r.last_used, scopes: Object.keys(SCOPE_LABELS).filter((k) => has(r.scopes, k)).map((k) => SCOPE_LABELS[k]) })) };
}
const cache = {};
/* pick the account(s) for a job: an exact email, else every account that granted the scope */
async function pick(env, scope, account) {
  const L = (await accounts(env)).filter((r) => !scope || has(r.scopes, scope));
  if (!L.length) throw new Error((await accounts(env)).length ? "None of the connected Google accounts allowed " + (SCOPE_LABELS[scope] || scope) + ", connect again and tick it." : "No Google account is connected, open Brain → Connectors → Connect Google.");
  if (account) { const a = String(account).toLowerCase(), m = L.filter((r) => r.account === a || r.account.split("@")[0] === a); if (!m.length) throw new Error(account + " is not a connected Google account with " + (SCOPE_LABELS[scope] || scope) + ". Connected: " + L.map((r) => r.account).join(", ")); return m; }
  return L;
}
async function access(env, account) {
  const c = cache[account]; if (c && Date.now() - c.at < 45 * 60e3) return c.tok;
  const d = await brainDb(env), r = await d.prepare("SELECT data FROM brain_connectors WHERE id=?1").bind(KEY(account)).first();
  if (!r) throw new Error(account + " is not connected.");
  const t = await token(env, { refresh_token: await unseal(env, r.data), grant_type: "refresh_token" });
  cache[account] = { at: Date.now(), tok: t.access_token }; await d.prepare("UPDATE brain_connectors SET last_used=?2 WHERE id=?1").bind(KEY(account), nowIso()).run();
  return t.access_token;
}
export async function g(env, account, url, opt) {
  opt = opt || {}; const r = await outbound(env)(url, { method: opt.method || "GET", headers: Object.assign({ authorization: "Bearer " + (await access(env, account)) }, opt.raw ? opt.headers || {} : { "content-type": "application/json" }), body: opt.raw ? opt.body : opt.body ? JSON.stringify(opt.body) : undefined, signal: AbortSignal.timeout(opt.timeout || 15000) });
  if (opt.response) return r;
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error("Google " + r.status + ": " + clip((j.error && (j.error.message || j.error)) || "", 160)); return j;
}
export const tokenFor = (env, account) => access(env, account);
/* run fn for each account, collect results, keep going when one fails */
async function each(env, scope, account, fn) { const out = [], errs = []; for (const a of await pick(env, scope, account)) { try { out.push(...[].concat(await fn(a.account))); } catch (e) { errs.push(a.account + ": " + e.message); } } if (!out.length && errs.length) throw new Error(errs.join(" · ")); return { items: out, errors: errs }; }

/* ---------- Gmail ---------- */
const hdr = (m, n) => ((m.payload && m.payload.headers) || []).filter((h) => h.name.toLowerCase() === n)[0];
const b64url = (s) => { const b = atob(String(s).replace(/-/g, "+").replace(/_/g, "/")), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new TextDecoder().decode(u); };
function bodyText(p) { if (!p) return ""; if (p.mimeType === "text/plain" && p.body && p.body.data) return b64url(p.body.data); for (const x of p.parts || []) { const t = bodyText(x); if (t) return t; } if (p.mimeType === "text/html" && p.body && p.body.data) return b64url(p.body.data).replace(/<[^>]+>/g, " "); return ""; }
export async function emailSearch(env, q, account) {
  const r = await each(env, "gmail.readonly", account, async (acc) => {
    const L = await g(env, acc, "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=8&q=" + encodeURIComponent(clean(q, 200) || "in:inbox newer_than:2d"));
    const out = []; for (const m of (L.messages || []).slice(0, 8)) { const x = await g(env, acc, "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + m.id + "?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date"); out.push({ account: acc, id: m.id, from: (hdr(x, "from") || {}).value, subject: (hdr(x, "subject") || {}).value, date: (hdr(x, "date") || {}).value, snippet: clip(x.snippet, 220), unread: (x.labelIds || []).indexOf("UNREAD") > -1, _t: +x.internalDate || 0 }); }
    return out;
  });
  return r.items.sort((a, b) => b._t - a._t).map((x) => { delete x._t; return x; }).concat(r.errors.length ? [{ note: "Some accounts failed: " + r.errors.join(" · ") }] : []);
}
export async function emailRead(env, id, account) {
  for (const a of await pick(env, "gmail.readonly", account)) { try { const x = await g(env, a.account, "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + encodeURIComponent(id) + "?format=full"); return { account: a.account, id, from: (hdr(x, "from") || {}).value, to: (hdr(x, "to") || {}).value, subject: (hdr(x, "subject") || {}).value, date: (hdr(x, "date") || {}).value, text: clip(bodyText(x.payload).replace(/\s+\n/g, "\n"), 6000) }; } catch (e) {} }
  throw new Error("That email was not found in any connected account.");
}
export async function emailSend(env, to, subject, body, from, threadId) {
  const acc = (await pick(env, "gmail.send", from))[0].account;
  const enc = (s) => { const u = new TextEncoder().encode(s); let b = ""; for (let i = 0; i < u.length; i++) b += String.fromCharCode(u[i]); return btoa(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  const subj = "=?UTF-8?B?" + btoa(unescape(encodeURIComponent(subject))) + "?=";
  const raw = enc("To: " + to + "\r\nSubject: " + subj + "\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n" + body);
  const r = await g(env, acc, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", body: Object.assign({ raw }, threadId ? { threadId } : {}) });
  return { sent: true, id: r.id, to, subject, from: acc, via: "Gmail (" + acc + ")" };
}
export async function sendAccount(env, from) { return (await pick(env, "gmail.send", from))[0].account; }

/* ---------- Calendar ---------- */
export async function calendarList(env, days, account) {
  const from = new Date(), to = new Date(Date.now() + Math.max(1, Math.min(31, days || 2)) * 864e5);
  const r = await each(env, "calendar.events", account, async (acc) => ((await g(env, acc, "https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=25&timeMin=" + from.toISOString() + "&timeMax=" + to.toISOString())).items || []).map((e) => ({ account: acc, id: e.id, title: e.summary, start: e.start && (e.start.dateTime || e.start.date), end: e.end && (e.end.dateTime || e.end.date), where: e.location || "", attendees: (e.attendees || []).map((a) => a.email).slice(0, 8), link: e.hangoutLink || "" })));
  return r.items.sort((a, b) => String(a.start).localeCompare(String(b.start)));
}
export async function calendarCreate(env, a) {
  const acc = (await pick(env, "calendar.events", a.account))[0].account;
  const tz = "Asia/Kolkata", start = a.start, end = a.end || new Date(Date.parse(a.start) + (a.minutes || 30) * 60e3).toISOString();
  const e = await g(env, acc, "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=" + (a.attendees ? "all" : "none"), { method: "POST", body: { summary: clip(a.title, 200), description: clip(a.notes || "", 2000), start: { dateTime: start, timeZone: tz }, end: { dateTime: end, timeZone: tz }, attendees: String(a.attendees || "").split(/[,; ]+/).filter((x) => /@/.test(x)).slice(0, 10).map((email) => ({ email })) } });
  return { created: true, account: acc, id: e.id, title: e.summary, start: e.start && e.start.dateTime, link: e.htmlLink };
}

/* ---------- Google Analytics 4 ---------- */
export async function gaProperties(env, account) {
  const r = await each(env, "analytics.readonly", account, async (acc) => { const j = await g(env, acc, "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=50"); const out = []; (j.accountSummaries || []).forEach((s) => (s.propertySummaries || []).forEach((p) => out.push({ account: acc, property: String(p.property || "").replace("properties/", ""), name: p.displayName, gaAccount: s.displayName }))); return out; });
  return r.items;
}
const METRICS = { users: "activeUsers", new_users: "newUsers", sessions: "sessions", views: "screenPageViews", engagement: "engagementRate", conversions: "conversions", revenue: "totalRevenue", duration: "averageSessionDuration" };
const DIMS = { day: "date", page: "pagePath", source: "sessionSource", channel: "sessionDefaultChannelGroup", country: "country", city: "city", device: "deviceCategory", campaign: "sessionCampaignName", event: "eventName" };
export async function gaReport(env, a) {
  a = a || {}; let prop = String(a.property || "").replace(/\D/g, ""), acc = a.account;
  if (!prop) { const P = await gaProperties(env, acc); if (!P.length) throw new Error("No Google Analytics 4 property is visible to the connected accounts."); const want = String(a.site || "fodo").toLowerCase(), hit = P.filter((p) => String(p.name).toLowerCase().indexOf(want) > -1)[0] || P[0]; prop = hit.property; acc = hit.account; }
  else if (!acc) acc = (await pick(env, "analytics.readonly"))[0].account;
  const days = Math.max(1, Math.min(365, +a.days || 28)), dim = DIMS[a.by] || null;
  const mets = String(a.metrics || "users,sessions,views,engagement").split(/[,\s]+/).map((m) => METRICS[m] || (Object.values(METRICS).indexOf(m) > -1 ? m : null)).filter(Boolean).slice(0, 6);
  const body = { dateRanges: [{ startDate: days + "daysAgo", endDate: "today" }, { startDate: (days * 2) + "daysAgo", endDate: (days + 1) + "daysAgo" }], metrics: mets.map((name) => ({ name })), limit: 25 };
  if (dim) { body.dimensions = [{ name: dim }]; body.orderBys = dim === "date" ? [{ dimension: { dimensionName: "date" } }] : [{ metric: { metricName: mets[0] }, desc: true }]; body.dateRanges = body.dateRanges.slice(0, 1); }
  const j = await g(env, acc, "https://analyticsdata.googleapis.com/v1beta/properties/" + prop + ":runReport", { method: "POST", body });
  const H = (j.metricHeaders || []).map((h) => h.name), rows = (j.rows || []).map((r) => { const o = {}; if (dim) o[a.by] = r.dimensionValues[0].value; (r.metricValues || []).forEach((v, i) => { o[H[i]] = +(+v.value).toFixed(3); }); if (!dim && r.dimensionValues && r.dimensionValues[0]) o.range = r.dimensionValues[0].value; return o; });
  return { property: prop, account: acc, days, by: a.by || "total", metrics: H, rows: dim ? rows : { this_period: rows[0] || null, previous_period: rows[1] || null }, note: dim ? "" : "previous_period = the same number of days before" };
}

/* ---------- YouTube ---------- */
export async function youtubeStats(env, account) {
  const r = await each(env, "youtube.readonly", account, async (acc) => {
    const ch = await g(env, acc, "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true"); const out = [];
    for (const c of ch.items || []) {
      const up = c.contentDetails && c.contentDetails.relatedPlaylists && c.contentDetails.relatedPlaylists.uploads; let vids = [];
      if (up) { const pl = await g(env, acc, "https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=10&playlistId=" + up); const ids = (pl.items || []).map((x) => x.contentDetails.videoId).join(",");
        if (ids) vids = ((await g(env, acc, "https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=" + ids)).items || []).map((v) => ({ id: v.id, title: v.snippet.title, published: v.snippet.publishedAt, views: +v.statistics.viewCount || 0, likes: +v.statistics.likeCount || 0, comments: +v.statistics.commentCount || 0, url: "https://youtu.be/" + v.id })); }
      out.push({ account: acc, channel: c.snippet.title, channelId: c.id, subscribers: +c.statistics.subscriberCount || 0, views: +c.statistics.viewCount || 0, videos: +c.statistics.videoCount || 0, recent: vids });
    }
    return out;
  });
  return r.items;
}
export async function youtubeChannels(env) { const out = []; for (const a of (await accounts(env)).filter((r) => has(r.scopes, "youtube.upload"))) { try { const ch = await g(env, a.account, "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true"); (ch.items || []).forEach((c) => out.push({ account: a.account, id: c.id, name: c.snippet.title, handle: c.snippet.customUrl || "" })); } catch (e) {} } return out; }

/* ---------- Drive + Sheets ---------- */
export async function driveSearch(env, q, account) {
  const qs = clean(q, 120).replace(/'/g, "\\'"), query = (qs ? "(name contains '" + qs + "' or fullText contains '" + qs + "') and " : "") + "trashed=false";
  const r = await each(env, "drive.readonly", account, async (acc) => ((await g(env, acc, "https://www.googleapis.com/drive/v3/files?pageSize=10&orderBy=modifiedTime desc&fields=files(id,name,mimeType,modifiedTime,webViewLink,size)&q=" + encodeURIComponent(query))).files || []).map((f) => ({ account: acc, id: f.id, name: f.name, type: f.mimeType.replace("application/vnd.google-apps.", "google "), modified: f.modifiedTime, link: f.webViewLink })));
  return r.items;
}
export async function driveRead(env, id, account) {
  for (const a of await pick(env, "drive.readonly", account)) {
    let meta; try { meta = await g(env, a.account, "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(id) + "?fields=id,name,mimeType,size,webViewLink"); } catch (e) { continue; }
    if (meta.mimeType === "application/vnd.google-apps.spreadsheet") return Object.assign({ account: a.account, name: meta.name, link: meta.webViewLink }, await sheetRead(env, id, "", a.account));
    let url = "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(id) + (/google-apps\.(document|presentation)/.test(meta.mimeType) ? "/export?mimeType=text/plain" : "?alt=media");
    if (!/google-apps|^text\/|json|csv/.test(meta.mimeType) && (+meta.size || 0) > 10e6) return { account: a.account, name: meta.name, link: meta.webViewLink, note: "File is larger than 10 MB, open it in Drive." };
    const r = await g(env, a.account, url, { response: true, timeout: 25000 }); if (!r.ok) throw new Error("Drive " + r.status);
    if (/google-apps|^text\/|json|csv/.test(meta.mimeType)) return { account: a.account, name: meta.name, link: meta.webViewLink, text: clip(await r.text(), 12000) };
    if (env.AI && typeof env.AI.toMarkdown === "function") { const md = await env.AI.toMarkdown({ name: meta.name, blob: new Blob([await r.arrayBuffer()], { type: meta.mimeType }) }); const one = [].concat(md)[0] || {}; return { account: a.account, name: meta.name, link: meta.webViewLink, text: clip(one.data || "", 12000) }; }
    return { account: a.account, name: meta.name, link: meta.webViewLink, note: "This file type can't be read here." };
  }
  throw new Error("That file was not found in any connected Drive.");
}
export async function sheetRead(env, id, range, account) {
  for (const a of await pick(env, "spreadsheets.readonly", account)) {
    let meta; try { meta = await g(env, a.account, "https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(id) + "?fields=properties.title,sheets.properties.title"); } catch (e) { continue; }
    const tab = range || (meta.sheets && meta.sheets[0] && meta.sheets[0].properties.title) || "Sheet1";
    const v = await g(env, a.account, "https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(id) + "/values/" + encodeURIComponent(tab) + "?majorDimension=ROWS");
    const rows = (v.values || []).slice(0, 200);
    return { account: a.account, title: meta.properties.title, tabs: (meta.sheets || []).map((s) => s.properties.title), range: v.range, rows, totalRows: (v.values || []).length, note: (v.values || []).length > 200 ? "first 200 rows shown" : "" };
  }
  throw new Error("That sheet was not found in any connected account.");
}
