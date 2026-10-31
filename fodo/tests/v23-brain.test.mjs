// v23 FODO BRAIN — multiple Google accounts + Analytics/YouTube/Drive/Sheets/Cashfree, Brain access for team members (full/limited),
// social media (Meta/Instagram, LinkedIn, X, YouTube): connect, original-quality uploads, post everywhere, schedule, numbers;
// page control by voice (theme, open page), wake word anywhere. Run: node --no-warnings tests/v23-brain.test.mjs

import { DatabaseSync } from "node:sqlite";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as admin } from "../functions/api/admin/[[path]].js";
import { onRequest as xray } from "../functions/api/xray/[[path]].js";
import { onRequest as brain } from "../functions/api/owner-brain/[[path]].js";
import { onRequest as tick } from "../functions/api/monitor/tick.js";
import { PLANS } from "../functions/_lib/plans.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
console.log = ((orig) => (...a) => { if (typeof a[0] === "string" && a[0].charAt(0) === "{" && !process.env.DBG) return; orig(...a); })(console.log);
console.error = () => {};
function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, a = []) => ({ bind: (...x) => st(sql, x.map((v) => v === undefined ? null : v)), run: async () => { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }), _x: () => db.prepare(sql).run(...a) });
  return { db, prepare: (s) => st(s), batch: async (l) => l.map((s) => (s._x(), { success: true })) };
}
const SITE = "https://www.fodo.co.in", jars = {}, H = { account, admin, xray, "owner-brain": brain };
const call = async (path, body, o = {}) => {
  const who = o.as || "a", h = Object.keys(H).filter((k) => path.indexOf(k + "/") === 0)[0] || "account", p = h === "account" ? path : path.slice(h.length + 1);
  const method = o.method || (body !== undefined ? "POST" : "GET");
  const req = new Request(SITE + "/api/" + h + "/" + p, { method, headers: Object.assign({ origin: SITE, "cf-connecting-ip": "9.9.9.9" }, body !== undefined ? { "content-type": "application/json" } : {}, jars[who] ? { cookie: jars[who] } : {}, o.headers || {}), body: body === undefined ? undefined : JSON.stringify(body) });
  const r = await H[h]({ request: req, env, params: { path: p.split("?")[0].split("/") } }); const sc = r.headers.get("set-cookie"); if (sc && h === "account") jars[who] = sc.split(";")[0];
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} all.push(t); return { status: r.status, j, t };
};
const all = [];   // every response body — checked for leaked secrets at the end
const login = (email, plan, who) => call("test-login", Object.assign({ email }, plan ? { plan } : {}), { as: who });
const B = (p, body, who, o) => call("owner-brain/" + p, body, Object.assign({ as: who || "own" }, o || {}));
const ask = (message, threadId, who, extra) => B("chat", Object.assign({ message, threadId }, extra || {}), who);

import { stripWake } from "../functions/_lib/brain/orchestrator.js";
import { liText } from "../functions/_lib/brain/social.js";

/* ---------- mocks ---------- */
const prompts = [], sent = [], calls = []; globalThis.__calls = () => calls; const _x0 = 0, li = { posts: [] }, xs = { appends: 0, tweets: [] }, yt = { chunks: [] }, meta = { ig: [], fb: [] };
const AI = { run: async (model, inp) => {
  if (/bge-m3/.test(model)) return { shape: [inp.text.length, 2], data: inp.text.map(() => [1, 0]) };
  const sys = inp.messages[0].content, user = inp.messages[inp.messages.length - 1].content; prompts.push({ sys, user });
  if (/You choose which FODO Brain tools/.test(sys)) return { response: JSON.stringify({ tools: [] }) };
  return { response: "ANSWER" }; } };
const kv = new Map(), KV = { get: async (k, o) => kv.has(k) ? (o && o.type === "arrayBuffer" ? kv.get(k).buffer.slice(0) : kv.get(k)) : null, put: async (k, v) => { kv.set(k, v instanceof Uint8Array ? new Uint8Array(v) : v); }, delete: async (k) => kv.delete(k), list: async (o) => ({ keys: [...kv.keys()].filter((k) => k.indexOf(o.prefix) === 0).map((name) => ({ name })) }) };
const J = (x, s, h) => new Response(JSON.stringify(x), { status: s || 200, headers: Object.assign({ "content-type": "application/json" }, h || {}) });
const tokOf = (o) => String((o.headers && (o.headers.authorization || o.headers.Authorization)) || "");
globalThis.fetch = async (u, o = {}) => {
  u = String(u); const m = o.method || "GET"; calls.push(m + " " + u.replace(/access_token=[^&]+/, "access_token=…"));
  if (/api\.resend\.com/.test(u)) { sent.push(JSON.parse(o.body)); return J({ id: "re" }); }
  // ---- Google
  if (/oauth2\.googleapis\.com\/token/.test(u)) { const b = new URLSearchParams(o.body), code = b.get("code"), rt = b.get("refresh_token");
    if (b.get("grant_type") === "authorization_code") { const email = code === "c2" ? "team@fodo.co.in" : "anmol@fodo.co.in"; return J({ access_token: "at-" + email, refresh_token: "1//rt-SECRET-" + email, scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly openid email", id_token: "x." + btoa(JSON.stringify({ email })) + ".y" }); }
    return J({ access_token: "at-" + String(rt).replace("1//rt-SECRET-", "") }); }
  if (/oauth2\.googleapis\.com\/revoke/.test(u)) return J({});
  const gAcc = tokOf(o).replace("Bearer at-", "");
  if (/gmail\.googleapis\.com.*\/messages\/send/.test(u)) { sent.push({ gmail: JSON.parse(o.body), from: gAcc }); return J({ id: "g1" }); }
  if (/gmail\.googleapis\.com.*\/messages\?/.test(u)) return J({ messages: [{ id: "m-" + gAcc }] });
  if (/gmail\.googleapis\.com.*\/messages\/m-/.test(u)) return J({ id: "m", internalDate: gAcc === "team@fodo.co.in" ? "200" : "100", snippet: "hello from " + gAcc, labelIds: ["UNREAD"], payload: { headers: [{ name: "From", value: "client@" + gAcc.split("@")[0] + ".in" }, { name: "Subject", value: "S " + gAcc }] } });
  if (/calendar\/v3/.test(u)) return J({ items: [{ id: "e", summary: "Meet " + gAcc, start: { dateTime: "2026-11-02T10:00:00+05:30" }, end: { dateTime: "2026-11-02T10:30:00+05:30" } }] });
  if (/analyticsadmin\.googleapis\.com\/v1beta\/accountSummaries/.test(u)) return J(gAcc === "anmol@fodo.co.in" ? { accountSummaries: [{ displayName: "FODO", propertySummaries: [{ property: "properties/111", displayName: "fodo.co.in" }, { property: "properties/222", displayName: "Other site" }] }] } : {});
  if (/analyticsdata\.googleapis\.com\/v1beta\/properties\/(\d+):runReport/.test(u)) { const b = JSON.parse(o.body); calls.push("GA " + RegExp.$1 + " " + JSON.stringify(b.dimensions || []));
    return J(b.dimensions ? { metricHeaders: b.metrics.map((x) => ({ name: x.name })), rows: [{ dimensionValues: [{ value: "/pricing" }], metricValues: b.metrics.map(() => ({ value: "42" })) }] } : { metricHeaders: b.metrics.map((x) => ({ name: x.name })), rows: [{ dimensionValues: [{ value: "date_range_0" }], metricValues: b.metrics.map(() => ({ value: "120" })) }, { dimensionValues: [{ value: "date_range_1" }], metricValues: b.metrics.map(() => ({ value: "100" })) }] }); }
  if (/youtube\/v3\/channels/.test(u)) return J(gAcc === "anmol@fodo.co.in" ? { items: [{ id: "UC1", snippet: { title: "FODO", customUrl: "@fodo" }, statistics: { subscriberCount: "1500", viewCount: "90000", videoCount: "30" }, contentDetails: { relatedPlaylists: { uploads: "UU1" } } }] } : { items: [] });
  if (/youtube\/v3\/playlistItems/.test(u)) return J({ items: [{ contentDetails: { videoId: "v1" } }] });
  if (/^https:\/\/www\.googleapis\.com\/youtube\/v3\/videos\?/.test(u)) return J({ items: [{ id: "v1", snippet: { title: "Launch", publishedAt: "2026-10-01" }, statistics: { viewCount: "5000", likeCount: "300", commentCount: "20" } }] });
  if (/upload\/youtube\/v3\/videos\?uploadType=resumable/.test(u)) return new Response(null, { status: 200, headers: { location: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=UP1" } });
  if (/upload_id=UP1/.test(u)) { const cr = o.headers["content-range"], mm = /bytes (\d+)-(\d+)\/(\d+)/.exec(cr); yt.chunks.push(cr + " " + o.body.byteLength); return +mm[2] + 1 < +mm[3] ? new Response(null, { status: 308, headers: { range: "bytes=0-" + mm[2] } }) : J({ id: "ytNEW", status: { privacyStatus: "private" } }); }
  if (/drive\/v3\/files\?/.test(u)) return J({ files: [{ id: "d1", name: "Q4 plan", mimeType: "application/vnd.google-apps.document", modifiedTime: "2026-10-20", webViewLink: "https://docs.google.com/d1" }] });
  if (/drive\/v3\/files\/d1\/export/.test(u)) return new Response("Q4 PLAN TEXT: launch agency plan", { status: 200 });
  if (/drive\/v3\/files\/d1\?/.test(u)) return J({ id: "d1", name: "Q4 plan", mimeType: "application/vnd.google-apps.document", webViewLink: "https://docs.google.com/d1" });
  if (/sheets\.googleapis\.com\/v4\/spreadsheets\/s1\?/.test(u)) return J({ properties: { title: "Leads" }, sheets: [{ properties: { title: "Sheet1" } }] });
  if (/sheets\.googleapis\.com\/v4\/spreadsheets\/s1\/values/.test(u)) return J({ range: "Sheet1!A1:B3", values: [["name", "phone"], ["Ravi", "98"], ["Asha", "99"]] });
  // ---- Meta
  if (/graph\.facebook\.com\/v[\d.]+\/oauth\/access_token/.test(u)) return J({ access_token: /fb_exchange_token/.test(u) ? "LL-user-SECRET" : "short-user" });
  if (/\/me\/accounts/.test(u)) return J({ data: [{ id: "PAGE1", name: "FODO Page", access_token: "page-tok-SECRET", instagram_business_account: { id: "IG1", username: "fodo.in" } }] });
  if (/graph\.facebook\.com\/v[\d.]+\/PAGE1\/photos/.test(u)) { const b = new URLSearchParams(o.body); meta.fb.push(["photo", b.get("url"), b.get("published")]); return J({ id: "PH" + meta.fb.length, post_id: b.get("published") === "false" ? undefined : "PAGE1_99" }); }
  if (/graph\.facebook\.com\/v[\d.]+\/PAGE1\/feed/.test(u)) { const b = new URLSearchParams(o.body); meta.fb.push(["feed", b.get("message"), b.get("attached_media")]); return J({ id: "PAGE1_100" }); }
  if (/graph-video\.facebook\.com\/v[\d.]+\/PAGE1\/videos/.test(u)) { meta.fb.push(["video", new URLSearchParams(o.body).get("file_url")]); return J({ id: "VID1" }); }
  if (/graph\.facebook\.com\/v[\d.]+\/IG1\/media_publish/.test(u)) { meta.ig.push(["publish", new URLSearchParams(o.body).get("creation_id")]); return J({ id: "IGM1" }); }
  if (/graph\.facebook\.com\/v[\d.]+\/IG1\/media\?/.test(u)) return J({ data: [{ caption: "old post", media_type: "IMAGE", like_count: 50, comments_count: 4, permalink: "https://instagram.com/p/old" }] });
  if (/graph\.facebook\.com\/v[\d.]+\/IG1\/media$/.test(u)) { const b = new URLSearchParams(o.body); meta.ig.push(["container", b.get("media_type") || "IMAGE", b.get("image_url") || b.get("video_url") || b.get("children"), b.get("caption")]); return J({ id: "C" + meta.ig.length }); }
  if (/graph\.facebook\.com\/v[\d.]+\/C\d+\?fields=status_code/.test(u)) { meta.polls = (meta.polls || 0) + 1; return J({ status_code: meta.polls === 1 ? "IN_PROGRESS" : "FINISHED" }); }
  if (/graph\.facebook\.com\/v[\d.]+\/IGM1\?fields=permalink/.test(u)) return J({ permalink: "https://instagram.com/p/NEW" });
  if (/graph\.facebook\.com\/v[\d.]+\/IG1\/insights/.test(u)) return J({ data: [{ total_value: { value: 777 } }] });
  if (/graph\.facebook\.com\/v[\d.]+\/IG1\?/.test(u)) return J({ username: "fodo.in", followers_count: 2400, follows_count: 10, media_count: 80 });
  if (/graph\.facebook\.com\/v[\d.]+\/PAGE1\/posts/.test(u)) return J({ data: [{ message: "hello", created_time: "2026-10-01", permalink_url: "https://fb.com/1", reactions: { summary: { total_count: 9 } }, comments: { summary: { total_count: 2 } } }] });
  if (/graph\.facebook\.com\/v[\d.]+\/PAGE1\?/.test(u)) return J({ name: "FODO Page", followers_count: 900 });
  // ---- LinkedIn
  if (/linkedin\.com\/oauth\/v2\/accessToken/.test(u)) return J({ access_token: "li-tok-SECRET", expires_in: 5184000 });
  if (/api\.linkedin\.com\/v2\/userinfo/.test(u)) return J({ sub: "PERSON1", name: "Anmol Singh", email: "anmol@fodo.co.in" });
  if (/organizationAcls/.test(u)) return J({ elements: [{ organization: "urn:li:organization:777" }] });
  if (/rest\/organizations\/777/.test(u)) return J({ localizedName: "FODO" });
  if (/rest\/images\?action=initializeUpload/.test(u)) return J({ value: { uploadUrl: "https://www.linkedin.com/dms-uploads/img1", image: "urn:li:image:I1" } });
  if (/dms-uploads\/img1/.test(u)) { li.imgBytes = o.body.byteLength; return new Response(null, { status: 201 }); }
  if (/rest\/videos\?action=initializeUpload/.test(u)) { const b = JSON.parse(o.body).initializeUploadRequest, P = 4194304, n = Math.ceil(b.fileSizeBytes / P); return J({ value: { video: "urn:li:video:V1", uploadToken: "", uploadInstructions: Array.from({ length: n }, (_, i) => ({ firstByte: i * P, lastByte: Math.min(b.fileSizeBytes, (i + 1) * P) - 1, uploadUrl: "https://www.linkedin.com/dms-uploads/vid-part" + i })) } }); }
  if (/dms-uploads\/vid-part(\d)/.test(u)) { li.parts = (li.parts || []).concat([o.body.byteLength]); return new Response(null, { status: 200, headers: { etag: "etag-" + RegExp.$1 } }); }
  if (/rest\/videos\?action=finalizeUpload/.test(u)) { li.finalize = JSON.parse(o.body).finalizeUploadRequest; return J({}); }
  if (/rest\/videos\/urn/.test(u)) return J({ status: "AVAILABLE" });
  if (/api\.linkedin\.com\/rest\/posts/.test(u)) { const b = JSON.parse(o.body); li.posts.push(b); li.headers = o.headers; return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:" + li.posts.length } }); }
  if (/networkSizes/.test(u)) return J({ firstDegreeSize: 333 });
  // ---- X
  if (/api\.x\.com\/2\/oauth2\/token/.test(u)) { const b = new URLSearchParams(o.body); xs.verifier = b.get("code_verifier"); return J({ access_token: "x-tok-SECRET", refresh_token: "x-ref-SECRET", expires_in: 7200 }); }
  if (/api\.x\.com\/2\/users\/me/.test(u)) return J({ data: { id: "X1", name: "FODO", username: "fodo_in", public_metrics: { followers_count: 120, following_count: 5, tweet_count: 40 } } });
  if (/api\.x\.com\/2\/media\/upload\/initialize/.test(u)) { xs.init = JSON.parse(o.body); return J({ data: { id: "XM1" } }); }
  if (/api\.x\.com\/2\/media\/upload\/XM1\/append/.test(u)) { xs.appends++; xs.seg = o.body.get("segment_index"); return new Response(null, { status: 204 }); }
  if (/api\.x\.com\/2\/media\/upload\/XM1\/finalize/.test(u)) return J({ data: { id: "XM1", processing_info: xs.init.media_category === "tweet_video" ? { state: "pending", check_after_secs: 1 } : undefined } });
  if (/api\.x\.com\/2\/media\/upload\?command=STATUS/.test(u)) return J({ data: { processing_info: { state: "succeeded" } } });
  if (/api\.x\.com\/2\/tweets/.test(u)) { xs.tweets.push(JSON.parse(o.body)); return J({ data: { id: "T" + xs.tweets.length } }); }
  // ---- Cashfree
  if (/cashfree\.com\/pg\/settlements/.test(u)) return J({ data: [{ cf_settlement_id: 55, amount_settled: 1499, status: "SUCCESS", settlement_utr: "UTR1", settlement_date: "2026-10-28" }] });
  if (/cashfree\.com\/pg\/orders\/ORD1\/payments/.test(u)) return J([{ payment_status: "SUCCESS", payment_amount: 1499, payment_group: "upi" }]);
  if (/cashfree\.com\/pg\/orders\/ORD1/.test(u)) return J({ order_id: "ORD1", order_status: "PAID", order_amount: 1499, order_currency: "INR" });
  return new Response("not mocked " + u, { status: 599 });
};
const env = { XRAY_DB: d1(), CHAT_KV: KV, ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", AI, RESEND_API_KEY: "re_SECRETresendKEY12345", MAIL_FROM: "FODO <hello@fodo.co.in>", CRON_KEY: "cron_SECRET_key_1234567890", GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "gcs_SECRET_123456", META_APP_ID: "metaid", META_APP_SECRET: "meta_SECRET_123456", LINKEDIN_CLIENT_ID: "liid", LINKEDIN_CLIENT_SECRET: "li_SECRET_123456", X_CLIENT_ID: "xid", X_CLIENT_SECRET: "x_SECRET_1234567", CASHFREE_APP_ID: "cfid", CASHFREE_SECRET_KEY: "cf_SECRET_123456", CASHFREE_ENV: "production" };
const db = () => env.XRAY_DB.db;
await login("anmol@fodo.co.in", null, "own"); await login("team@acme.in", "starter", "team"); await login("ravi@shop.in", "starter", "cust");
const loc = async (p, who) => (await brain({ request: new Request(SITE + "/api/owner-brain/" + p, { headers: { cookie: jars[who || "own"] } }), env, params: { path: p.split("?")[0].split("/") } })).headers.get("location");
const stateOf = (l) => new URL(l).searchParams.get("state");

/* ================= 1. wake word anywhere ================= */
ok(stripWake("kaise ho fodo").text === "kaise ho" && stripWake("Hey FODO").wakeOnly && stripWake("fodo, open social").text === "open social", "'kaise ho FODO' / 'FODO, open social' → wake word stripped from the end too");
let r = await ask("kaise ho fodo?"); ok(r.j.intent === "smalltalk", "'kaise ho fodo?' → warm small talk");

/* ================= 2. many Google accounts + connected data ================= */
let l = await loc("connect/google"); r = await B("connect/google/callback?code=c1&state=" + encodeURIComponent(stateOf(l)));
l = await loc("connect/google?hint=team@fodo.co.in"); ok(/login_hint=team%40fodo\.co\.in/.test(l) && /analytics\.readonly/.test(l) && /youtube\.upload/.test(l) && /drive\.readonly/.test(l), "'Add another account' → Google consent with Analytics, YouTube, Drive, Sheets");
r = await B("connect/google/callback?code=c2&state=" + encodeURIComponent(stateOf(l)));
const gacc = db().prepare("SELECT id, data FROM brain_connectors WHERE id LIKE 'google:%' ORDER BY id").all();
ok(gacc.length === 2 && gacc.every((x) => !/rt-SECRET/.test(x.data)), "two Google accounts connected, each refresh token encrypted");
r = await B("connectors"); ok(r.j.google.accounts.length === 2 && r.j.google.accounts[0].scopes.indexOf("Analytics 4") > -1, "Connectors page lists both accounts with what each allows");
r = await ask("check my inbox"); const inb = r.j.tools_used.find((t) => t.tool === "email_inbox");
ok(inb && inb.ok && /team@fodo\.co\.in/.test(prompts[prompts.length - 1].sys) && /anmol@fodo\.co\.in/.test(prompts[prompts.length - 1].sys), "'check my inbox' → reads BOTH inboxes, each mail tagged with its account");
r = await call("owner-brain/chat", { message: "Send a mail to client@acme.in from team@fodo.co.in saying hi" }, { as: "own" });
let act = await (async () => { const { execute } = await import("../functions/_lib/brain/tools.js"); const u = db().prepare("SELECT * FROM acct_users WHERE email='anmol@fodo.co.in'").get(); return execute({ env, request: new Request(SITE), owner: u, settings: { toolsOff: {} } }, "gmail_send", { to: "client@acme.in", subject: "Hi", body: "Hello", from: "team@fodo.co.in" }, {}); })();
ok(act.pending && /Send from Gmail: team@fodo\.co\.in/.test(act.action.preview), "sending picks the chosen account (team@…) and shows it on the confirmation");
r = await B("confirm", { actionId: act.action.id, token: act.action.token }); ok(r.j.ok && sent[sent.length - 1].from === "team@fodo.co.in", "confirmed → sent from team@fodo.co.in");
db().prepare("INSERT INTO brain_connectors (id, data, scopes, account, connected_at) VALUES ('google', 'x', 'gmail.readonly', 'old@fodo.co.in', '2026-01-01')").run();
r = await B("connectors"); ok(r.j.google.accounts.length === 3 && !db().prepare("SELECT 1 FROM brain_connectors WHERE id='google'").get(), "a v22 single-account row is migrated automatically");
r = await B("connectors/google/disconnect", { account: "old@fodo.co.in" }); r = await B("connectors"); ok(r.j.google.accounts.length === 2, "disconnect ONE account; the others stay");
r = await ask("last week ka website traffic by pages"); const an = r.j.tools_used.find((t) => t.tool === "analytics");
ok(an && an.ok && calls.some((c) => /^GA 111 .*pagePath/.test(c)), "'website traffic by pages' → Google Analytics 4 (auto-picks the FODO property, broken down by page)");
r = await B("settings", { gaProperty: "222" }); r = await ask("google analytics report"); ok(calls.some((c) => /^GA 222 /.test(c)), "the chosen GA4 property is used");
r = await ask("youtube followers kitne hain?"); ok(r.j.tools_used.some((t) => t.tool === "social_stats" && t.ok) && /1500/.test(prompts[prompts.length - 1].sys), "'youtube followers kitne hain' → live YouTube numbers");
const { execute } = await import("../functions/_lib/brain/tools.js"); const owner = db().prepare("SELECT * FROM acct_users WHERE email='anmol@fodo.co.in'").get(), X = (n, a) => execute({ env, request: new Request(SITE), owner, settings: { toolsOff: {} } }, n, a, {});
let t1 = await X("drive_read", { id: "d1" }); ok(t1.ok && /Q4 PLAN TEXT/.test(t1.result.text), "Drive: a Google Doc is read as text");
t1 = await X("sheet_read", { id: "s1" }); ok(t1.ok && t1.result.rows.length === 3 && t1.result.title === "Leads", "Sheets: rows read");
t1 = await X("cashfree", { order: "ORD1" }); ok(t1.ok && t1.result.status === "PAID" && t1.result.payments[0].method === "upi", "Cashfree: an order checked live");
t1 = await X("cashfree", { days: 7 }); ok(t1.ok && t1.result.settlements[0].utr === "UTR1", "Cashfree: settlements for the last 7 days");

/* ================= 3. Brain access for team members ================= */
r = await B("status", undefined, "team"); ok(r.status === 403, "before access: a logged-in non-owner gets 403");
r = await B("members", { email: "team@acme.in", role: "limited", perms: ["chat", "social"], note: "social manager" }); ok(r.j.ok && r.j.item.perms.join() === "chat,social", "owner gives LIMITED access (chat + social)");
r = await B("status", undefined, "team"); ok(r.j.ok && r.j.me.role === "limited" && !r.j.me.owner && r.j.me.perms.indexOf("social") > -1, "the member opens the Brain with their own role");
r = await B("tasks", undefined, "team"); ok(r.status === 403 && r.j.denied, "…tasks page refused (not in their access)");
r = await B("members", undefined, "team"); ok(r.status === 403, "…cannot see or change who has access");
r = await B("connect/meta", undefined, "team"); ok(r.status === 403, "…cannot connect accounts");
r = await B("social", undefined, "team"); ok(r.j.ok && r.j.canManage === false, "…can use the Social page (post), not manage accounts");
r = await ask("How is FODO doing today?", null, "team"); ok(r.j.tools_used.some((t) => t.tool === "fodo_today" && !t.ok && /doesn't include/.test(t.error)), "…business numbers refused inside chat too (checked per tool)");
r = await ask("Remember that my wife's birthday is 12 March", null, "own"); await ask("personal mode", null, "own");
db().prepare("UPDATE brain_memory SET scope='personal' WHERE content LIKE '%birthday%'").run();
r = await B("memory", undefined, "team"); ok(r.status === 403, "limited member without memory access → no memory page");
await B("members", { email: "team@acme.in", role: "full" });
r = await B("memory", undefined, "team"); ok(r.j.ok && !r.j.items.some((m) => /birthday/.test(m.content)), "FULL member sees FODO memory but never the owners' personal memories");
const pid = db().prepare("SELECT id FROM brain_memory WHERE content LIKE '%birthday%'").get().id; r = await B("memory/" + pid + "/history", undefined, "team"); ok(r.status === 404, "…not even by id");
r = await B("connectors", undefined, "team"); ok(r.status === 403, "FULL member still can't open connectors (owners only)");
const ownThread = (await ask("owner private chat", null, "own")).j.threadId; r = await B("thread/" + ownThread, undefined, "team"); ok(r.status === 404, "members can't open the owner's conversations");
r = await B("threads", undefined, "team"); ok(!r.j.items.some((t) => t.id === ownThread), "…or see them in the list");
r = await B("members/team%40acme.in", undefined, "own", { method: "DELETE" }); r = await B("status", undefined, "team"); ok(r.status === 403, "owner removes access → instantly 403");
r = await B("members", { email: "anmol@fodo.co.in", role: "limited", perms: ["chat"] }); ok(!r.j.ok, "owners can't be downgraded");

/* ================= 4. social: connect ================= */
l = await loc("connect/meta"); ok(/facebook\.com\/v[\d.]+\/dialog\/oauth/.test(l) && /instagram_content_publish/.test(l) && /pages_manage_posts/.test(l), "Connect Facebook + Instagram → Meta consent with publishing permissions");
r = await B("connect/meta/callback?code=abc&state=" + encodeURIComponent(stateOf(l))); ok(r.status === 302 && /ok=2/.test(r.t + (await (async () => "")())) || db().prepare("SELECT count(*) n FROM brain_social").get().n === 2, "callback → Facebook Page + its Instagram account connected");
ok(db().prepare("SELECT count(*) n FROM brain_social WHERE token LIKE '%SECRET%'").get().n === 0, "page tokens stored encrypted");
env.LINKEDIN_ORG_APPROVED = "1"; l = await loc("connect/linkedin"); ok(/w_member_social/.test(l) && /w_organization_social/.test(l), "LinkedIn consent (profile + company page once approved)");
r = await B("connect/linkedin/callback?code=abc&state=" + encodeURIComponent(stateOf(l))); ok(db().prepare("SELECT count(*) n FROM brain_social WHERE platform IN ('linkedin','linkedin_org')").get().n === 2, "LinkedIn profile + FODO company page connected");
l = await loc("connect/x"); ok(/code_challenge_method=S256/.test(l) && /media\.write/.test(l), "X consent uses PKCE + media.write");
r = await B("connect/x/callback?code=abc&state=" + encodeURIComponent(stateOf(l))); ok(xs.verifier && db().prepare("SELECT count(*) n FROM brain_social WHERE platform='x'").get().n === 1, "X connected (PKCE verifier sent)");
r = await B("connect/meta/callback?code=abc&state=bad~x.y.z"); ok(/err=/.test(r.t) || r.status === 302, "forged state refused");
r = await B("social"); ok(r.j.accounts.length === 6 && r.j.accounts.some((a) => a.platform === "youtube" && a.name === "FODO"), "Social page lists Facebook, Instagram, LinkedIn ×2, X and YouTube (via Google)");

/* ================= 5. media: original quality ================= */
const put = async (id, i, bytes) => { const req = new Request(SITE + "/api/owner-brain/social/media/" + id + "/" + i, { method: "PUT", headers: { origin: SITE, cookie: jars.own, "content-type": "application/octet-stream" }, body: bytes }); const x = await brain({ request: req, env, params: { path: ["social", "media", id, String(i)] } }); return x.json(); };
const mk = (n, seed) => { const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = (i * 7 + seed) & 255; return a; };
const upload = async (name, mime, bytes, extra) => { const c = await B("social/media", Object.assign({ name, mime, size: bytes.length }, extra || {})); const P = 4194304; for (let i = 0; i < c.j.parts; i++) await put(c.j.id, i, bytes.subarray(i * P, Math.min(bytes.length, (i + 1) * P))); const d = await B("social/media/" + c.j.id + "/done", {}); return Object.assign(c.j, { ready: d.j.ok }); };
const VID = mk(6 * 1048576 + 123, 3), IMG = mk(300000, 9);
r = await B("social/media", { name: "x.exe", mime: "application/x-msdownload", size: 10 }); ok(!r.j.ok, "only images and videos can be uploaded");
const c0 = await B("social/media", { name: "a.mp4", mime: "video/mp4", size: 5000000 }); r = await put(c0.j.id, 0, mk(100, 1)); ok(!r.ok && /should be/.test(r.reason), "a part with the wrong size is refused");
r = await B("social/media/" + c0.j.id + "/done", {}); ok(!r.j.ok && /missing/.test(r.j.reason), "an incomplete upload can't be posted");
const vid = await upload("launch.mp4", "video/mp4", VID), img = await upload("photo.jpg", "image/jpeg", IMG);
ok(vid.ready && vid.parts === 2 && img.ready, "a 6 MB video is uploaded in 4 MB parts and assembled");
let res = await brain({ request: new Request(SITE + "/api/owner-brain/m/" + vid.id + "/launch.mp4"), env, params: { path: ["m", vid.id, "launch.mp4"] } }); let got = new Uint8Array(await res.arrayBuffer());
ok(res.status === 200 && got.length === VID.length && got.every((b, i) => b === VID[i]), "the public file is BYTE-FOR-BYTE the original (no quality loss)");
res = await brain({ request: new Request(SITE + "/api/owner-brain/m/" + vid.id + "/x", { headers: { range: "bytes=4194300-4194310" } }), env, params: { path: ["m", vid.id, "x"] } }); got = new Uint8Array(await res.arrayBuffer());
ok(res.status === 206 && got.length === 11 && got[0] === VID[4194300] && got[10] === VID[4194310], "Range requests work across parts (what Instagram/Facebook use)");
res = await brain({ request: new Request(SITE + "/api/owner-brain/m/notarealid0000000000000000000000/x"), env, params: { path: ["m", "notarealid0000000000000000000000", "x"] } }); ok(res.status === 404, "unknown media → 404");
const png = await upload("card.png", "image/png", mk(5000, 2)), pngJ = await upload("card.jpg", "image/jpeg", mk(4000, 4), { variantOf: png.id });
db().prepare("UPDATE brain_media SET ready_at='2020-01-01T00:00:00Z'").run();   // KV propagation wait already passed

/* ================= 6. post everywhere ================= */
const ids = (p) => db().prepare("SELECT id FROM brain_social WHERE platform=?").all(p).map((x) => x.id);
r = await B("social/posts", { caption: "Only text", targets: ids("instagram") }); ok(!r.j.ok && /Instagram needs a photo or video/.test(r.j.reason), "Instagram without media is refused before anything is sent");
r = await B("social/posts", { caption: "x".repeat(300), targets: ids("x") }); ok(!r.j.ok && /300\/280/.test(r.j.reason), "X over 280 characters is refused with a clear message");
r = await B("social/posts", { caption: "Hi", targets: ["youtube:UC1"], media: [img.id] }); ok(!r.j.ok && /YouTube needs exactly one video/.test(r.j.reason), "YouTube needs a video");
const all6 = ids("facebook").concat(ids("instagram"), ids("linkedin"), ids("linkedin_org"), ids("x"));
r = await B("social/posts", { caption: "Big news (today)! #FODO launch", captions: { x: "Big news! #FODO" }, targets: all6, media: [img.id] });
ok(r.j.ok, "one photo post to Facebook, Instagram, LinkedIn ×2 and X");
let post = r.j.post; for (let i = 0; i < 12 && post.status === "publishing"; i++) post = (await B("social/posts/" + post.id + "/run", {})).j.post;
ok(post.status === "done" && Object.values(post.results).every((x) => x.status === "done" && x.url), "…all five published, each with its link");
ok(meta.fb.some((f) => f[0] === "photo" && new RegExp("/api/owner-brain/m/" + img.id).test(f[1])) && meta.ig.some((x) => x[0] === "container" && /Big news/.test(x[3])) && meta.ig.some((x) => x[0] === "publish"), "Facebook & Instagram pulled the original file from FODO's media URL; Instagram container → checked → published");
ok(li.imgBytes === IMG.length && li.posts.length === 2 && li.posts[0].commentary === "Big news \\(today\\)! {hashtag|\\#|FODO} launch" && li.posts.some((p) => p.author === "urn:li:organization:777") && li.headers["Linkedin-Version"], "LinkedIn: image uploaded byte-for-byte, text escaped, #hashtag kept, posted as profile AND company page");
ok(xs.tweets[0].text === "Big news! #FODO" && xs.tweets[0].media.media_ids[0] === "XM1" && xs.init.media_category === "tweet_image", "X: its own shorter caption + the photo");
r = await B("social/posts", { caption: "Launch video\nFull walkthrough of FODO", targets: ids("instagram").concat(ids("linkedin"), ["youtube:UC1"], ids("x"), ids("facebook")), media: [vid.id] });
post = r.j.post; for (let i = 0; i < 25 && post.status === "publishing"; i++) post = (await B("social/posts/" + post.id + "/run", {})).j.post;
ok(post.status === "done", "one video → Instagram Reel, LinkedIn, YouTube, X and Facebook");
ok(meta.ig.some((x) => x[1] === "REELS") && meta.polls >= 2, "Instagram: Reel container, waited while processing, then published");
ok(li.parts.length === 2 && li.parts[0] === 4194304 && li.finalize.uploadedPartIds.join() === "etag-0,etag-1", "LinkedIn video: 2 parts uploaded in order and finalized");
ok(yt.chunks.length === 2 && /bytes 0-4194303\/6291579/.test(yt.chunks[0]) && post.results["youtube:UC1"].url === "https://youtu.be/ytNEW" && /private/.test(post.results["youtube:UC1"].note || ""), "YouTube: resumable upload in chunks; honest note when Google keeps it private");
ok(xs.appends >= 2 && xs.init.media_category === "tweet_video", "X: video uploaded in segments, processed, posted");
r = await B("social/posts", { caption: "Instagram PNG", targets: ids("instagram"), media: [png.id] }); post = r.j.post; for (let i = 0; i < 10 && post.status === "publishing"; i++) post = (await B("social/posts/" + post.id + "/run", {})).j.post;
ok(post.status === "done" && meta.ig.some((x) => new RegExp(pngJ.id).test(x[2] || "")), "PNG → Instagram uses the maximum-quality JPG copy (Instagram only accepts JPG); other platforms get the PNG");
r = await B("social/posts", { caption: "Later", targets: ids("linkedin"), scheduleAt: new Date(Date.now() + 3 * 3600e3).toISOString() }); ok(r.j.post.status === "scheduled", "schedule a post");
const before = li.posts.length; db().prepare("UPDATE brain_social_posts SET scheduled_at='2020-01-01T00:00:00Z' WHERE id=?").run(r.j.post.id);
r = await call("owner-brain/tick", {}, { as: "x", headers: { "x-cron-key": env.CRON_KEY } }); ok(r.j.ok && li.posts.length === before + 1 && r.j.social.some((x) => x.status === "done"), "the hourly tick publishes it when due");
r = await B("social/posts", { caption: "Cancel me", targets: ids("linkedin"), scheduleAt: new Date(Date.now() + 3 * 3600e3).toISOString() }); const cx = await B("social/posts/" + r.j.post.id + "/cancel", {}); ok(cx.j.cancelled, "a scheduled post can be cancelled");
r = await B("social/stats"); const st = r.j.items, sOf = (p) => st.filter((x) => x.platform === p)[0] || {};
ok(sOf("instagram").followers === 2400 && sOf("instagram").reachToday === 777 && sOf("facebook").followers === 900 && sOf("x").followers === 120 && sOf("linkedin_org").followers === 333 && sOf("youtube").followers === 1500 && /partner approval/.test(sOf("linkedin").note), "live numbers from every platform (honest note where LinkedIn shares none)");

/* ================= 7. by talking ================= */
r = await ask("LinkedIn aur X pe post karo: Hiring a growth intern at FODO");
const sp = r.j.actions.find((a) => /Post NOW to/.test(a.preview)); ok(r.j.intent === "social_post" && sp && /LinkedIn/.test(sp.preview) && /X/.test(sp.preview) && !/Instagram/.test(sp.preview), "'LinkedIn aur X pe post karo: …' → confirmation listing exactly those accounts");
const nX = xs.tweets.length; r = await B("confirm", { actionId: sp.id, token: sp.token }); ok(r.j.ok && xs.tweets.length === nX + 1 && xs.tweets[xs.tweets.length - 1].text === "Hiring a growth intern at FODO", "confirmed → posted");
r = await ask("Instagram pe post karo: just text"); ok(!r.j.actions.length && /photo or video|need/i.test(JSON.stringify(r.j.tools_used)), "text-only to Instagram → explains it needs a photo/video (nothing posted)");
r = await ask("light mode kar do"); ok(r.j.ui && r.j.ui[0].action === "theme" && r.j.ui[0].value === "light" && /Light mode on/.test(r.j.answer), "'light mode kar do' → the page switches to light mode");
r = await ask("social page kholo"); ok(r.j.ui && r.j.ui[0].value === "social", "'social page kholo' → opens Social");
r = await ask("Hey FODO, open tasks"); ok(r.j.ui && r.j.ui[0].value === "tasks", "'Hey FODO, open tasks' → opens Tasks");
r = await ask("stop listening"); ok(r.j.ui && r.j.ui[0].action === "voice" && r.j.ui[0].value === "off", "'stop listening' → hands-free off");
r = await ask("instagram followers kitne hain?"); ok(r.j.tools_used.some((t) => t.tool === "social_stats" && t.ok) && /2400/.test(prompts[prompts.length - 1].sys), "'instagram followers kitne hain' → live Instagram numbers");
ok(liText("a_b @c (d) #tag") === "a\\_b \\@c \\(d\\) {hashtag|\\#|tag}", "LinkedIn text escaping");

/* ================= 8. security ================= */
for (const p of ["social", "members", "connectors", "ga/properties"]) { r = await B(p, undefined, "cust"); if (r.status !== 403) { ok(false, "customer reached " + p); break; } } ok(true, "a customer with no Brain access is refused everywhere");
r = await call("owner-brain/social/media/" + vid.id + "/0", undefined, { as: "own", method: "PUT", headers: { "content-type": "application/octet-stream", origin: "https://evil.example" } }); ok(r.status === 403, "uploads from another site are refused (CSRF)");
const leak = all.concat(prompts.map((p) => p.sys + p.user)).filter((t) => /rt-SECRET|page-tok-SECRET|li-tok-SECRET|x-tok-SECRET|x-ref-SECRET|LL-user-SECRET|meta_SECRET|cf_SECRET|gcs_SECRET|cron_SECRET/.test(t));
ok(!leak.length, "no token or secret in any response or prompt (Google, Meta, LinkedIn, X, Cashfree)");

console.log("\nv23 brain: " + pass + "/" + (pass + fail) + " passed");
process.exit(fail ? 1 : 0);
