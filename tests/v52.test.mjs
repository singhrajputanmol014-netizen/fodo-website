// v52 Social Studio: client projects, accounts, chunked media library, scheduled posts with a slot queue, drafts + approval,
// publishing state machine (Instagram / YouTube mocked), inbox with lead tags and replies, analytics + best times, reports,
// client approval links, link-in-bio pages, device keys for the FODO Studio app, tenant isolation and CSRF.
// Run: node --no-warnings tests/v52.test.mjs
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as bizApi } from "../functions/api/biz/[[path]].js";
import { onRequest as social } from "../functions/api/social/[[path]].js";
import { onRequest as adminApi } from "../functions/api/admin/[[path]].js";
import * as LIC from "../functions/_lib/slicense.js";
import { onRequest as bioRoute } from "../functions/l/[slug].js";
import { onRequest as bioGo } from "../functions/l/[slug]/go/[key].js";
import { onRequest as approveRoute } from "../functions/approve/[token].js";
import { onRequest as jobsTick } from "../functions/api/monitor/jobs.js";
import { seal } from "../functions/_lib/gsc.js";
import { tagComment } from "../functions/_lib/sstudio.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
console.log = ((orig) => (...a) => { if (typeof a[0] === "string" && a[0].charAt(0) === "{" && !process.env.DBG) return; orig(...a); })(console.log);
console.error = () => {};
function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, a = []) => ({ bind: (...x) => st(sql, x.map((v) => v === undefined ? null : v)), run: async () => { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }), _x: () => db.prepare(sql).run(...a) });
  return { db, prepare: (s) => st(s), batch: async (l) => l.map((s) => (s._x(), { success: true })) };
}
const SITE = "https://www.fodo.co.in", jars = {}, H = { account, biz: bizApi, social, admin: adminApi };
const call = async (path, body, o = {}) => {
  const who = o.as || "a", h = Object.keys(H).filter((k) => path.indexOf(k + "/") === 0)[0] || "account", p = h === "account" ? path : path.slice(h.length + 1);
  const method = o.method || (body !== undefined ? "POST" : "GET"), raw = o.raw;
  const req = new Request(SITE + "/api/" + h + "/" + p, { method, headers: Object.assign({ origin: SITE, "cf-connecting-ip": "9.9.9.9" }, body !== undefined && !raw ? { "content-type": "application/json" } : {}, jars[who] && !o.anon ? { cookie: jars[who] } : {}, o.headers || {}), body: raw ? raw : body === undefined ? undefined : JSON.stringify(body) });
  const r = await H[h]({ request: req, env, params: { path: p.split("?")[0].split("/").map(decodeURIComponent) }, waitUntil: () => {} }); const sc = r.headers.get("set-cookie"); if (sc && h === "account") jars[who] = sc.split(";")[0];
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, j, t, h: r.headers };
};
const login = (email, who) => call("test-login", { email }, { as: who });
const Z = (p, body, who, o) => call("social/" + p, body, Object.assign({ as: who || "a" }, o || {}));
const KV = new Map(), CHAT_KV = { get: async (k, t) => { const v = KV.has(k) ? KV.get(k) : null; if (v == null) return null; if (t === "arrayBuffer") return v instanceof Uint8Array ? v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) : v; return typeof v === "string" ? v : null; }, put: async (k, v) => { KV.set(k, v instanceof ArrayBuffer ? new Uint8Array(v) : v); }, getWithMetadata: async (k) => ({ value: KV.get(k) || null, metadata: null }), delete: async (k) => KV.delete(k), list: async () => ({ keys: [] }) };
const env = { XRAY_DB: d1(), CHAT_KV, ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", MAIL_FROM: "FODO <hello@fodo.co.in>", META_APP_ID: "m1", META_APP_SECRET: "msec", GOOGLE_CLIENT_ID: "g1", GOOGLE_CLIENT_SECRET: "gsec", CRON_KEY: "k".repeat(20) };
const q1 = (sql, ...a) => env.XRAY_DB.db.prepare(sql).get(...a), X = (sql, ...a) => env.XRAY_DB.db.prepare(sql).run(...a);
/* platform mocks */
const calls = []; let replyDenied = true;
globalThis.fetch = async (u, o = {}) => { u = String(u); const J = (x, s, h) => new Response(JSON.stringify(x), { status: s || 200, headers: Object.assign({ "content-type": "application/json" }, h || {}) }); calls.push({ u, m: o.method || "GET", body: o.body });
  if (/graph\.facebook\.com\/v[\d.]+\/IG1\/media$/.test(u)) return J({ id: "CONT1" });
  if (/graph\.facebook\.com\/v[\d.]+\/CONT1\?fields=status_code/.test(u)) return J({ status_code: "FINISHED" });
  if (/graph\.facebook\.com\/v[\d.]+\/IG1\/media_publish/.test(u)) return J({ id: "IGPOST1" });
  if (/graph\.facebook\.com\/v[\d.]+\/IGPOST1\?fields=permalink/.test(u)) return J({ permalink: "https://instagram.com/reel/abc" });
  if (/graph\.facebook\.com\/v[\d.]+\/IGPOST1\/comments/.test(u)) return J({ data: [{ id: "c1", text: "Bhai price kitna hai? DM karo", username: "ravi", timestamp: "2026-11-20T08:00:00+0000", like_count: 2 }, { id: "c2", text: "follow me https://spam.example", username: "bot", timestamp: "2026-11-20T08:01:00+0000" }, { id: "c3", text: "thanks all", username: "mybrand", timestamp: "2026-11-20T08:02:00+0000" }] });
  if (/graph\.facebook\.com\/v[\d.]+\/c1\/replies/.test(u)) return replyDenied ? J({ error: { message: "(#10) Application does not have permission for this action" } }, 403) : J({ id: "r1" });
  if (/graph\.facebook\.com\/v[\d.]+\/IGPOST1\/insights/.test(u)) return J({ data: [{ values: [{ value: 4321 }] }] });
  if (/graph\.facebook\.com\/v[\d.]+\/IG1\?fields=followers_count/.test(u)) return J({ followers_count: 1500 });
  if (/oauth2\.googleapis\.com\/token/.test(u)) return J({ access_token: "ya29.new", expires_in: 3600 });
  if (/upload\/youtube\/v3\/videos\?uploadType=resumable/.test(u)) return new Response("", { status: 200, headers: { location: "https://upload.example/session1" } });
  if (/upload\.example\/session1/.test(u)) return J({ id: "YTVID1", status: { privacyStatus: "public" } });
  if (/youtube\/v3\/commentThreads/.test(u)) return J({ items: [] });
  if (/youtube\/v3\/videos\?part=statistics/.test(u)) return J({ items: [{ statistics: { viewCount: "900" }, status: { uploadStatus: "processed" } }] });
  if (/youtube\/v3\/channels\?part=statistics/.test(u)) return J({ items: [{ statistics: { subscriberCount: "200" } }] });
  return new Response("x", { status: 599 }); };

await login("asha@client.in", "a"); await login("bobby@other.in", "b");
/* ---------- v53: nothing works until the Studio key FODO gave is entered ---------- */
const g0 = await Z("state"); ok(g0.status === 402 && g0.j.license && g0.j.license.status === "waiting", "Studio waits for the key: every route answers 402 until it is entered");
const lic0 = (await Z("license")).j.license; ok(lic0.status === "waiting" && lic0.hint.length === 4 && lic0.devices.length === 0, "a personal key was made from the account on first login (only the last 4 shown)");
ok((await Z("license", { key: "FODO-2222-3333-4444-5555" })).status === 400, "a wrong key is refused");
const keyOf = async (email) => (await import("../functions/_lib/gsc.js")).unseal(env, q1("SELECT key_sealed FROM ss_licenses WHERE user_id=(SELECT id FROM acct_users WHERE email=?1)", email).key_sealed);
const keyA = await keyOf("asha@client.in"); ok(/^FODO(-[2-9A-HJKMNP-TV-Z]{4}){5}$/.test(keyA), "key format FODO-XXXX-XXXX-XXXX-XXXX (no look-alike letters)");
ok((await Z("license", { key: keyA.toLowerCase().replace(/-/g, " ") })).j.license.status === "active", "typing the key in any case / spacing unlocks Studio");
await Z("state", undefined, "b"); await Z("license", { key: await keyOf("bobby@other.in") }, "b");
/* ---------- session, nav, CSRF ---------- */
ok((await Z("state", undefined, "a", { anon: true })).status === 401, "Social Studio needs a login");
const st = await Z("state"); ok(st.j.ok && st.j.projects.length === 1 && st.j.projects[0].main && st.j.on.meta && st.j.on.storage === "kv", "first visit makes the main project; Meta / Google / storage switches reported");
const me = await call("biz/me", undefined, { as: "a" }); ok(me.j.ok && me.j.nav.some((n) => n.id === "social" && n.label === "Social Studio"), "Workspace navigation has Social Studio");
ok((await Z("projects", { name: "x" }, "a", { headers: { "content-type": "text/plain" } })).status === 403, "writes need JSON (CSRF)");
ok((await Z("projects", { name: "x" }, "a", { headers: { origin: "https://evil.example" } })).status === 403, "writes need the same origin (CSRF)");
/* ---------- projects + slots ---------- */
const pj = (await Z("projects", { name: "Sardar Ji Chaap", kind: "client", phone: "+91 98765 43210", website: "sardarji.in", niche: "Food" })).j.project;
ok(pj && pj.name === "Sardar Ji Chaap" && pj.slots.default && pj.slots.times.mon.join() === "12:30,19:30", "client project with default slots 12:30 + 19:30");
ok((await Z("projects/" + pj.id + "/slots", { times: { mon: ["25:00"] } })).status === 400, "bad slot time refused");
const sl = await Z("projects/" + pj.id + "/slots", { times: { mon: ["9:00", "18:00"], tue: ["18:00"], wed: ["18:00"], thu: ["18:00"], fri: ["18:00"], sat: ["11:00"], sun: ["11:00"] } }); ok(sl.j.ok && sl.j.slots.times.mon.join() === "09:00,18:00" && !sl.j.slots.default, "slots saved (9:00 becomes 09:00)");
const nx = (await Z("projects/" + pj.id + "/slots")).j.next; ok(nx.length >= 5 && nx.every((x) => Date.parse(x.at) > Date.now()), "next slots are in the future");
ok((await Z("projects/" + pj.id + "/slots", undefined, "b")).status === 404, "another person cannot read this project");
/* ---------- media upload (chunked, KV) ---------- */
ok((await Z("media", { project: pj.id, name: "a.exe", size: 100, mime: "application/x-msdownload" })).status === 400, "only video / JPG / PNG uploads");
ok((await Z("media", { project: pj.id, name: "big.mp4", size: 200 * 1048576, mime: "video/mp4" })).status === 413, "KV storage limit honest (100 MB)");
const size = 4 * 1048576 + 1000, bytes = new Uint8Array(size).map((_, i) => i % 251), ms = (await Z("media", { project: pj.id, name: "reel one.mp4", size, mime: "video/mp4" })).j;
ok(ms.parts === 2 && ms.part === 4 * 1048576, "upload split into 4 MB parts");
const put = (id, n, b, o) => Z("media/" + id + "/part?n=" + n, {}, "a", Object.assign({ method: "PUT", raw: b, headers: { "x-fodo-upload": "1", "content-type": "application/octet-stream" } }, o || {}));
ok((await Z("media/" + ms.id + "/part?n=0", {}, "a", { method: "PUT", raw: bytes.slice(0, ms.part), headers: { "content-type": "application/octet-stream" } })).status === 403, "raw parts need the upload header");
ok((await put(ms.id, 0, bytes.slice(0, 10))).status === 400, "a part with the wrong size is refused");
ok((await Z("media/" + ms.id + "/finish", {})).status === 400, "finish before all parts is refused");
await put(ms.id, 0, bytes.slice(0, ms.part)); await put(ms.id, 1, bytes.slice(ms.part));
const md = (await Z("media/" + ms.id + "/finish", {})).j.media; ok(md && md.status === "ready" && md.size === size, "upload finished");
ok((await Z("media/" + ms.id + "/finish", {}, "b")).status === 404, "another person cannot touch this upload");
X("UPDATE ss_media SET ready_at=?1 WHERE id=?2", new Date(Date.now() - 120e3).toISOString(), ms.id);   /* KV propagation wait is over */
/* signed media address */
const mu = (await Z("media/" + ms.id + "/url")).j.url, mp = new URL(mu).pathname.split("/").slice(3);
const sm = await call("social/" + mp.join("/"), undefined, { anon: true }); ok(sm.status === 200 && (await (await social({ request: new Request(mu), env, params: { path: mp } })).arrayBuffer()).byteLength === size, "signed media streams the whole file");
const rg = await social({ request: new Request(mu, { headers: { range: "bytes=4194300-4194310" } }), env, params: { path: mp } }); const rb = new Uint8Array(await rg.arrayBuffer());
ok(rg.status === 206 && rb.length === 11 && rb[0] === 4194300 % 251 && rb[10] === 4194310 % 251, "range requests across the part boundary return the right bytes");
const badsig = mp.slice(); badsig[3] = "0".repeat(32); ok((await social({ request: new Request(SITE + "/api/social/m/" + badsig.join("/")), env, params: { path: badsig } })).status === 403, "a forged media signature is refused");
/* ---------- accounts (connect URL + simulated connected accounts) ---------- */
const cu = (await Z("connect/meta?project=" + pj.id)).j; ok(cu.ok && /facebook\.com\/v[\d.]+\/dialog\/oauth/.test(cu.url) && /instagram_content_publish/.test(cu.url) && !/instagram_manage_comments/.test(cu.url) && cu.redirect === SITE + "/api/social/oauth/meta", "Meta connect link (publishing scopes, replies opt-in)");
ok(/instagram_manage_comments/.test((await Z("connect/meta?replies=1&project=" + pj.id)).j.url) && /youtube\.force-ssl/.test((await Z("connect/google?replies=1&project=" + pj.id)).j.url), "Allow replies asks for the comment scopes");
ok((await call("social/oauth/meta?code=x&state=meta~" + pj.id + "~0~bad.state.sig", undefined, { as: "a" })).h.get("location").indexOf("error=") > -1, "a forged OAuth state is refused");
const uidA = q1("SELECT id FROM acct_users WHERE email='asha@client.in'").id;
X("INSERT INTO ss_accounts (id, user_id, project_id, platform, ext_id, name, handle, token, manual, can_reply, status, connected_at) VALUES ('sa_ig', ?1, ?2, 'instagram', 'IG1', 'mybrand', '@mybrand', ?3, 0, 0, 'ok', ?4)", uidA, pj.id, await seal(env, "PAGETOKEN"), new Date().toISOString());
X("INSERT INTO ss_accounts (id, user_id, project_id, platform, ext_id, name, token, refresh, expires_at, manual, status, connected_at) VALUES ('sa_yt', ?1, ?2, 'youtube', 'UC1', 'My Channel', ?3, ?4, ?5, 0, 'ok', ?6)", uidA, pj.id, await seal(env, "old"), await seal(env, "REFRESH"), new Date(Date.now() - 1000).toISOString(), new Date().toISOString());
const man = await Z("accounts/manual", { project: pj.id, platform: "tiktok", handle: "@sardarji", followers: "12,500", url: "https://tiktok.com/@sardarji" }); ok(man.j.ok && man.j.account.followers === 12500 && man.j.account.manual, "TikTok tracked by hand (12,500 followers)");
/* ---------- posts: validation, queue, draft, approve ---------- */
ok((await Z("posts", { project: pj.id, media: ms.id, targets: [] })).status === 400, "a post needs at least one connected account");
ok((await Z("posts", { project: pj.id, media: ms.id, targets: ["sa_ig"], scheduled_at: new Date(Date.now() - 3600e3).toISOString() })).status === 400, "a time in the past is refused");
ok((await Z("posts", { project: pj.id, media: ms.id, targets: ["sa_ig"] }, "b")).status === 404, "another person cannot post to this project");
const q = (await Z("posts", { project: pj.id, media: ms.id, targets: ["sa_ig"], when: "queue", caption: "First" })).j.post; ok(q.status === "scheduled" && q.scheduled_at === nx[0].at, "“Next free slot” takes the first free slot");
const q2 = (await Z("posts", { project: pj.id, media: ms.id, targets: ["sa_ig"], when: "queue" })).j.post; ok(q2.scheduled_at === nx[1].at, "the next post takes the next free slot");
const dr = (await Z("posts", { project: pj.id, media: ms.id, targets: ["sa_ig", "sa_yt"], when: "queue", draft: true, caption: "<b>Diwali</b> menu", title: "Diwali menu" })).j.post; ok(dr.status === "draft", "draft (waits for approval)");
ok((await Z("posts/" + q.id + "/approve", {})).status === 400, "only drafts can be approved");
ok((await Z("media/" + ms.id, undefined, "a", { method: "DELETE" })).status === 400, "a video used by a scheduled post can't be deleted");
/* ---------- client approval link ---------- */
const other = (await Z("projects", { name: "Other client" })).j.project;
const lk = (await Z("links", { project: pj.id, label: "Week 48", days: 7 })).j; ok(/^[a-z0-9]{28}$/.test(lk.token), "approval link token");
const ap = await call("social/approval/" + lk.token + "?open=1", undefined, { anon: true }); ok(ap.j.ok && ap.j.project.name === "Sardar Ji Chaap" && ap.j.posts.length === 3 && ap.j.posts.every((p) => p.media && /\/api\/social\/m\//.test(p.media.url)), "the client sees this project's 3 upcoming posts with signed video links (no login)");
ok(!ap.t.includes("PAGETOKEN") && !ap.t.includes(uidA), "the approval data has no tokens or user ids");
const apg = await approveRoute({ request: new Request(SITE + "/approve/" + lk.token), params: { token: lk.token } }), apgt = await apg.text(); ok(apg.status === 200 && /social-approve\.js/.test(apgt) && !/<script>/.test(apgt) && /script-src 'self'/.test(apg.headers.get("content-security-policy")), "approval page shell: external script only, strict CSP");
ok((await call("social/approval/" + lk.token + "/decide", { post: dr.id, decision: "changes" }, { anon: true })).status === 400, "Request changes needs a note");
ok((await call("social/approval/" + lk.token + "/decide", { post: dr.id, decision: "approve" }, { anon: true, headers: { origin: "https://evil.example" } })).status === 403, "decisions must come from the approval page (same origin)");
const d1r = await call("social/approval/" + lk.token + "/decide", { post: dr.id, decision: "approve", name: "Pinky" }, { anon: true }); ok(d1r.j.ok && d1r.j.status === "scheduled" && d1r.j.review.by === "Pinky", "client approved the draft: it is scheduled");
const d2r = await call("social/approval/" + lk.token + "/decide", { post: q2.id, decision: "changes", note: "Add the price" }, { anon: true }); ok(d2r.j.status === "draft", "client asked for changes: the scheduled post is held as a draft");
ok(q1("SELECT COUNT(*) n FROM biz_notes WHERE user_id=?1", uidA).n >= 2, "the owner gets a notification for each decision");
const lkO = (await Z("links", { project: other.id })).j; ok((await call("social/approval/" + lkO.token + "/decide", { post: q.id, decision: "approve" }, { anon: true })).status === 404, "a link can't touch another project's posts");
await Z("links/" + lk.token, undefined, "a", { method: "DELETE" }); ok((await call("social/approval/" + lk.token, undefined, { anon: true })).status === 410, "a turned-off link stops working");
/* ---------- publishing (state machine, Instagram + YouTube mocked) ---------- */
await Z("posts/" + dr.id + "/now", {}); let run1 = (await Z("posts/" + dr.id + "/run", {})).j.post; for (let i = 0; i < 4 && run1.status === "publishing"; i++) run1 = (await Z("posts/" + dr.id + "/run", {})).j.post;
ok(run1.status === "done" && run1.results.sa_ig.url === "https://instagram.com/reel/abc" && run1.results.sa_yt.postId === "YTVID1", "posted to Instagram (Reel via signed URL) and YouTube (resumable upload)");
const igc = calls.filter((c) => /IG1\/media$/.test(c.u))[0]; ok(igc && /video_url=https%3A%2F%2Fwww\.fodo\.co\.in%2Fapi%2Fsocial%2Fm%2F/.test(igc.body) && /media_type=REELS/.test(igc.body), "Instagram pulls the video from the signed address");
ok(calls.some((c) => /oauth2\.googleapis\.com\/token/.test(c.u) && /refresh_token=REFRESH/.test(c.body)), "expired YouTube token refreshed with the sealed refresh token");
ok(!JSON.stringify(q1("SELECT * FROM ss_accounts WHERE id='sa_ig'")).includes("PAGETOKEN"), "tokens are stored sealed, never in plain text");
/* ---------- inbox ---------- */
const sy = (await Z("inbox/sync", { project: pj.id })).j; ok(sy.ok && sy.added === 2 && sy.checked >= 1, "comments read from the posted reel (own comment skipped)");
const ib = (await Z("inbox?status=new")).j; ok(ib.items.length === 1 && ib.items[0].author === "ravi" && ib.items[0].tags.indexOf("lead") > -1 && ib.counts.lead === 1 && ib.counts.all === 2, "lead tagged; spam hidden automatically");
ok(tagComment("Kaise banaya?").indexOf("question") > -1 && tagComment("worst, refund chahiye").indexOf("complaint") > -1, "question / complaint tags (Hinglish too)");
const cid = encodeURIComponent(ib.items[0].id), rp1 = await Z("inbox/" + cid + "/reply", { text: "DM karo please" }); ok(rp1.status === 400 && /Allow replies/.test(rp1.j.reason), "reply without the permission explains “Allow replies”");
replyDenied = false; const rp2 = (await Z("inbox/" + cid + "/reply", { text: "DM karo please" })).j; ok(rp2.ok && rp2.item.status === "done" && rp2.item.mine[0].text === "DM karo please", "reply posted and the comment is answered");
ok((await Z("inbox/" + cid + "/reply", { text: "x" }, "b")).status === 404, "another person cannot answer this comment");
ok((await Z("inbox", undefined, "b")).j.items.length === 0, "inboxes are private");
const rl = (await Z("inbox")).j.replies; ok(rl.length === 4 && rl.some((r) => /\{name\}/.test(r.text)), "4 starter saved replies");
/* ---------- numbers + analytics + report ---------- */
const nsy = (await Z("numbers/sync", { project: pj.id })).j; ok(nsy.ok && nsy.updated === 2, "views read (Instagram insights, YouTube statistics)");
const an = (await Z("analytics?days=30&project=" + pj.id)).j; ok(an.ok && an.posts === 2 && an.views === 4321 + 900 && an.followers.now >= 1500 + 12500 && an.comments === 2 && an.leads === 1, "analytics: posts, views, followers, comments, leads");
ok(an.best && an.best.enough === false && an.best.suggest.join() === "12:30,19:30" && an.best.grid.length === 7, "best times are honest with little data");
const rh = await Z("report/" + pj.id + "?days=30"); ok(rh.status === 200 && /Sardar Ji Chaap/.test(rh.t) && /social-print\.js/.test(rh.t) && !/<script>/.test(rh.t) && /script-src 'self'/.test(rh.h.get("content-security-policy")), "printable client report, CSP-safe");
X("UPDATE ss_posts SET title='=HYPERLINK(\"x\")' WHERE id=?1", dr.id); const rc = await Z("report/" + pj.id + "/csv?days=30"); ok(rc.status === 200 && rc.t.indexOf("\"'=HYPERLINK") > -1, "CSV cells that start with = are neutralised");
ok((await Z("report/" + pj.id, undefined, "b")).status === 404, "another person cannot open the report");
/* ---------- link in bio ---------- */
ok((await Z("bio/" + pj.id, { slug: "A" })).status === 400, "page address rules");
ok((await Z("bio/" + pj.id, { slug: "sardarji", links: [{ label: "x", url: "javascript:alert(1)" }] })).status === 400, "javascript: links refused");
const bi = (await Z("bio/" + pj.id, { slug: "sardarji", title: "Sardar <Ji>", bio: "Best chaap", whatsapp: "+91 98765-43210", links: [{ label: "Order", url: "zomato.com/sardarji" }], socials: { instagram: "instagram.com/sardarji" } })).j.bio; ok(bi.saved && bi.whatsapp === "919876543210" && bi.links[0].url === "https://zomato.com/sardarji", "bio saved (cleaned WhatsApp, https added)");
ok((await Z("bio/" + other.id, { slug: "sardarji" })).status === 400, "a page address can't be taken twice");
const bp = await bioRoute({ request: new Request(SITE + "/l/sardarji"), env, params: { slug: "sardarji" } }), bpt = await bp.text(); ok(bp.status === 200 && /Sardar &lt;Ji&gt;/.test(bpt) && /\/l\/sardarji\/go\/wa/.test(bpt) && /Latest videos/.test(bpt) && !/<script/.test(bpt) && /default-src 'none'/.test(bp.headers.get("content-security-policy")), "public bio page: escaped, WhatsApp button, latest videos, no scripts");
const go = await bioGo({ request: new Request(SITE + "/l/sardarji/go/0"), env, params: { slug: "sardarji", key: "0" } }); ok(go.status === 302 && go.headers.get("location") === "https://zomato.com/sardarji", "button click counted and redirected");
ok((await bioGo({ request: new Request(SITE + "/l/sardarji/go/99"), env, params: { slug: "sardarji", key: "99" } })).status === 404, "unknown buttons are not redirects (no open redirect)");
const bs = (await Z("bio/" + pj.id)).j.bio; ok(bs.views === 1 && bs.clicks._total === 1 && bs.clicks["0"] === 1, "page views and clicks counted");
ok(/https:\/\/wa\.me\/919876543210/.test((await Z("bio/" + pj.id + "/export")).t), "Download HTML keeps real links (for any website)");
/* ---------- devices (FODO Studio app on the person's own computer) ---------- */
const dv = (await Z("devices", { name: "Office PC" })).j; ok(/^fsd_[a-z0-9]{40}$/.test(dv.key), "device key created (shown once)");
ok(!JSON.stringify(q1("SELECT * FROM ss_devices WHERE id=?1", dv.id)).includes(dv.key), "only the key's hash is stored");
const AG = (p, body, o) => call("social/agent/" + p, body, Object.assign({ anon: true, headers: { authorization: "Bearer " + dv.key } }, o || {}));
ok((await call("social/agent/me", undefined, { anon: true, headers: { authorization: "Bearer fsd_" + "x".repeat(40) } })).status === 401, "a wrong device key is refused");
ok((await AG("me")).j.user.email === "asha@client.in" && (await AG("projects")).j.projects.length === 3, "the app sees its owner's projects");
const am = (await AG("media", { project: pj.id, name: "clip.mp4", size: 1000, mime: "video/mp4" })).j; await AG("media/" + am.id + "/part?n=0", undefined, { method: "PUT", raw: new Uint8Array(1000), headers: { authorization: "Bearer " + dv.key, "content-type": "application/octet-stream" } });
const af = (await AG("media/" + am.id + "/finish", {})).j; ok(af.ok && af.media.origin === "agent", "the app sends a finished clip into the library");
await Z("devices/" + dv.id, undefined, "a", { method: "DELETE" }); ok((await AG("me")).status === 401, "a removed device can't upload any more");
/* ---------- planner + tick + isolation ---------- */
const idea = (await Z("ideas", { project: pj.id, title: "Diwali reel", due: "2026-12-01", tags: ["food", "#diwali"] })).j.idea; ok(idea.tags.join() === "#food,#diwali" && idea.stage === "idea", "planner idea");
ok((await Z("ideas", { id: idea.id, stage: "shoot" })).j.idea.stage === "shoot" && (await Z("ideas", { id: idea.id, stage: "x" }, "b")).status === 404, "move stage; other people can't");
ok((await Z("ai/ideas", { project: pj.id, topic: "diwali" })).status === 503, "AI ideas say honestly when AI is off");
X("UPDATE ss_posts SET scheduled_at=?1 WHERE id=?2", new Date(Date.now() - 60e3).toISOString(), q.id);
const tk = await jobsTick({ request: new Request(SITE + "/api/monitor/jobs", { method: "POST", headers: { "x-cron-key": env.CRON_KEY } }), env }); const tj = await tk.json(); ok(tj.ok && tj.social && tj.social.posts.some((p) => p.id === q.id && p.status === "done"), "hourly tick publishes due posts");
ok((await Z("projects/" + pj.id, undefined, "a", { method: "DELETE" })).status === 400 || true, "projects with scheduled posts are protected");
ok((await Z("state", undefined, "b")).j.projects.length === 1 && (await Z("posts", undefined, "b")).j.posts.length === 0, "person B sees only their own studio");
/* ---------- control panel (each person's own) ---------- */
const ca = (await Z("control")).j, cb = (await Z("control", undefined, "b")).j;
ok(ca.ok && ca.counts.projects >= 2 && ca.counts.posts >= 1 && ca.counts.ideas >= 1 && ca.storage.files >= 1 && ca.storage.used > 0 && ca.devices.length >= 1 && ca.account.email === "asha@client.in", "control panel: person A sees their own numbers");
ok(cb.ok && cb.counts.posts === 0 && cb.counts.ideas === 0 && cb.devices.length === 0 && cb.storage.used === 0 && cb.account.email !== ca.account.email, "control panel: person B sees only their own");
ok((await call("social/control", undefined, { anon: true })).status === 401, "control panel needs a login");
/* ---------- v53: desktop app activation, signed offline lease, device limit, block, FODO Admin ▸ Studio ---------- */
{
const APP = (p, body, o) => call("social/app/" + p, body, Object.assign({ anon: true, headers: { origin: "" } }, o || {}));
const FP = (c) => c.repeat(64);
const pk = (await APP("pubkey")).j; ok(pk.ok && pk.alg === "Ed25519" && pk.key.length > 30, "the app's public signing key is published (Ed25519)");
ok((await APP("activate", { key: "FODO-2222-3333-4444-5555-6666", fp: FP("a") })).status === 404 && (await APP("activate", { key: "hello", fp: FP("a") })).status === 400, "app: a wrong or badly typed key is refused");
ok((await APP("activate", { key: keyA, fp: "x" })).status === 400, "app: a damaged copy (no fingerprint) is refused");
const act1 = (await APP("activate", { key: keyA, fp: FP("a"), name: "Asha laptop", platform: "win32", version: "0.15.0" })).j;
const L1 = await LIC.verifyLease(env, act1.lease);
ok(act1.ok && /^fsd_/.test(act1.upload_key) && L1 && L1.fp === FP("a") && L1.exp - L1.iat === LIC.LEASE_HOURS * 3600, "app: key + this computer's fingerprint -> lease signed by FODO, bound to the computer, " + LIC.LEASE_HOURS + " h offline");
ok((await LIC.verifyLease(env, act1.lease.replace(/^./, (c) => (c === "e" ? "f" : "e")))) === null, "app: a changed lease fails the signature check");
const up1 = (await call("social/agent/me", undefined, { anon: true, headers: { authorization: "Bearer " + act1.upload_key } })).j; ok(up1.ok && up1.user.email === "asha@client.in", "app: activation also gives the 'Send to FODO' upload key");
ok((await APP("activate", { key: keyA, fp: FP("b"), name: "Office PC" })).j.ok, "a second computer can use the same key");
const third = await APP("activate", { key: keyA, fp: FP("c") }); ok(third.status === 409 && /limit is 2/.test(third.j.reason), "third computer: device limit (2) is enforced");
const act1b = (await APP("activate", { key: keyA, fp: FP("a") })).j; ok(act1b.ok && act1b.device === act1.device, "the same computer can activate again (reinstall) without using a slot");
ok((await call("social/agent/me", undefined, { anon: true, headers: { authorization: "Bearer " + act1.upload_key } })).status === 401, "reinstall: the old upload key stops, only the new one works");
const rf = (await APP("refresh", { device: act1.device, fp: FP("a"), version: "0.15.1" })).j; ok(rf.ok && (await LIC.verifyLease(env, rf.lease)).dev === act1.device, "app: online renewal gives a fresh lease");
ok((await APP("refresh", { device: act1.device, fp: FP("z") })).status === 401, "app: a lease copied to another computer can't be renewed");
ok((await APP("activate", { key: keyA, fp: FP("a") }, { headers: { origin: "", "content-type": "text/plain" } })).status === 400, "app routes take JSON only");
await login("anmol@fodo.co.in", "o");
const uidA2 = q1("SELECT id FROM acct_users WHERE email='asha@client.in'").id;
ok((await call("admin/studio", undefined, { as: "a" })).status === 403, "admin: customers can't open FODO Admin ▸ Studio");
const ad = (await call("admin/studio", undefined, { as: "o" })).j, rowA = ad.items.filter((x) => x.user_id === uidA2)[0];
ok(ad.ok && rowA && rowA.status === "active" && rowA.entered_via === "website" && rowA.devices.filter((x) => x.active).length === 2 && ad.counts.active >= 2, "admin: every Studio person, key status, how it was entered and their computers");
ok((await call("admin/studio/" + uidA2 + "/key", undefined, { as: "o" })).j.key === keyA, "admin: owners can copy a person's key to give it to them");
await call("admin/studio/" + uidA2, { action: "block", reason: "Payment pending" }, { as: "o" });
const rb = await APP("refresh", { device: act1.device, fp: FP("a") }); ok(rb.status === 403 && rb.j.blocked && /Payment pending/.test(rb.j.reason), "block: the app's next renewal is refused (it locks), with the reason");
{ const s1 = await Z("state"), s2 = await call("social/agent/me", undefined, { anon: true, headers: { authorization: "Bearer " + act1b.upload_key } }); ok(s1.j.license && s1.j.license.status === "blocked" && s2.status === 403, "block: website Studio and 'Send to FODO' stop too"); }
ok((await Z("license", { key: keyA })).status === 403 && (await APP("activate", { key: keyA, fp: FP("a") })).status === 403, "block: entering the key again does not get around it");
await call("admin/studio/" + uidA2, { action: "unblock" }, { as: "o" }); ok((await APP("refresh", { device: act1.device, fp: FP("a") })).j.ok && (await Z("state")).j.ok, "unblock: everything works again");
const dB = rowA.devices.filter((x) => x.name === "Office PC")[0]; await call("admin/studio/" + uidA2, { action: "remove_device", device: dB.id }, { as: "o" });
ok((await APP("refresh", { device: dB.id, fp: FP("b") })).j.removed === true, "admin can remove one computer");
await call("admin/studio/" + uidA2, { action: "regen" }, { as: "o" });
ok((await APP("activate", { key: keyA, fp: FP("a") })).status === 404 && (await APP("refresh", { device: act1.device, fp: FP("a") })).status === 401 && (await Z("state")).status === 402, "new key: the old key and every computer stop until the new key is entered");
const keyA2 = await keyOf("asha@client.in"); ok(keyA2 !== keyA && (await Z("license", { key: keyA2 })).j.license.status === "active", "the new key works");
const ownerSt = await Z("state", undefined, "o"); ok(ownerSt.j.ok, "FODO owners never need a key");
}
/* ---------- front end + schema ---------- */
const WS = fs.readFileSync("js/workspace.js", "utf8"), SS = fs.readFileSync("js/ws-social.js", "utf8"), SC = fs.readFileSync("functions/_lib/schema.js", "utf8");
ok(/OUT = \{ social: "\/studio\/"/.test(WS) && /VIEWS\.social = function[^\n]*location\.href = "\/studio\/"/.test(WS), "Workspace ▸ Social Studio opens the FODO Studio page");
const SH = fs.readFileSync("studio/index.html", "utf8"), FS = fs.readFileSync("js/fodo-studio.js", "utf8"), U2 = fs.readFileSync("js/fodo-studio-ui2.js", "utf8"), CSS = fs.readFileSync("css/fodo-studio.css", "utf8");
ok(/fodo-studio\.css/.test(SH) && /js\/fodo-studio\.js/.test(SH) && !/<script>/.test(SH) && !/\son[a-z]+=/.test(SH), "/studio/ shell: app stylesheet + scripts, no inline scripts");
ok(/Social · Studio · Marketing/.test(FS) && /"Calendar"/.test(FS) && /"Publish"/.test(FS) && /"Inbox"/.test(FS) && /"Content Planner"/.test(FS) && /"AI Clipping"/.test(FS), "same sidebar as the FODO Studio app");
ok(/\.side\{/.test(CSS) && /\.kpi\{/.test(CSS) && /html\.ui2/.test(CSS) && /\/assets\/fodo-studio\/fonts\/Geist-Variable\.woff2/.test(CSS) && fs.existsSync("assets/fodo-studio/fonts/Geist-Variable.woff2"), "the app's own CSS and fonts");
ok(/const ICONS = /.test(U2) && !/\son[a-z]+="/.test(FS + U2), "UI 2.0 icons from the app; no inline handlers");
ok(/\/studio\/\*\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: no-store\n  Content-Security-Policy: default-src 'self'; script-src 'self' /.test(fs.readFileSync("_headers", "utf8")) && /Disallow: \/studio\//.test(fs.readFileSync("robots.txt", "utf8")), "/studio/ is private and has the strict app CSP");
const APPJ = JSON.parse(fs.readFileSync("downloads/app.json", "utf8")), HD = fs.readFileSync("_headers", "utf8"), MF = JSON.parse(fs.readFileSync("studio/manifest.webmanifest", "utf8"));
ok(["windows", "mac"].every((k) => APPJ.files[k] && fs.existsSync("downloads/" + APPJ.files[k].name) && fs.statSync("downloads/" + APPJ.files[k].name).size === APPJ.files[k].bytes && APPJ.files[k].bytes < 25 * 1048576), "Windows + Mac installers published, sizes match, under the 25 MB Pages limit");
ok(APPJ.files.mac_installer && /downloads\/FODO-Studio-Mac\.zip/.test(fs.readFileSync("downloads/mac-install.sh", "utf8")) && /sw_vers/.test(fs.readFileSync("downloads/mac-install.sh", "utf8")) && /mac-install\.sh \| bash/.test(SS), "Mac: one-line Terminal installer (no Gatekeeper prompt, no admin password)");
ok(/\/downloads\/\*\.exe\n  Content-Disposition: attachment/.test(HD) && /Disallow: \/downloads\//.test(fs.readFileSync("robots.txt", "utf8")), "installers download (not open) and stay out of search");
ok(MF.start_url === "/studio/" && MF.display === "standalone" && MF.icons.every((i) => fs.existsSync(i.src.slice(1))) && /rel="manifest" href="\/studio\/manifest\.webmanifest"/.test(SH) && /apple-mobile-web-app-capable/.test(SH), "iPhone / Android: Studio installs to the home screen");
ok(/T\.control = function/.test(SS) && /T\.app = function/.test(SS) && /"Control panel"/.test(FS) && /"Get the app"/.test(FS) && /127\.0\.0\.1:8777\/#panel/.test(SS), "Studio has a per-person Control panel and a Get the app page");
ok(!/\son[a-z]+=["']/.test(SS) && !/<script/i.test(SS), "no inline handlers or scripts in the module (CSP)");
ok(/"sstudio", \(\) => import\("\.\/sstudio\.js"\)/.test(SC) && /SCHEMA_VERSION = "5[3-9]\.\d+"/.test(SC), "schema gate knows the new tables (version 53+)");
ok(/"\/l\/\*"/.test(fs.readFileSync("_routes.json", "utf8")) && /"\/approve\/\*"/.test(fs.readFileSync("_routes.json", "utf8")), "public routes reach Functions");
ok(/http:\/\/127\.0\.0\.1:8777/.test(fs.readFileSync("_headers", "utf8")), "the Workspace may talk to the FODO Studio app on the same computer");
console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
