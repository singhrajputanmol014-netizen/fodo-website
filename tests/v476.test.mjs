// v47.6: R2 multipart uploads (resumable), background job queue (retries, dead letter, scheduler), private calendar feeds (iCal),
// organizations (shared read, billing profile, act-on-behalf), CI static checks. Every rule is enforced on the server.
// Run: node --no-warnings tests/v476.test.mjs
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as admin } from "../functions/api/admin/[[path]].js";
import { onRequest as xray } from "../functions/api/xray/[[path]].js";
import { onRequest as brain } from "../functions/api/owner-brain/[[path]].js";
import { onRequest as bizApi } from "../functions/api/biz/[[path]].js";
import { onRequest as sitesApi } from "../functions/api/sites/[[path]].js";
import { fundMilestone } from "../functions/_lib/biz.js";
import { priceIt, PRICING_DEFAULTS } from "../functions/_lib/production.js";
import { ROLES, EQUIPMENT, TEMPLATES } from "../functions/_lib/catalog-seed.js";
import { TOOLS } from "../functions/_lib/brain/tools.js";
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
const all = [];
const login = (email, plan, who) => call("test-login", Object.assign({ email }, plan ? { plan } : {}), { as: who });
const calls = []; let cfStatus = "RECEIVED", cfCheck = "SUCCESS", rzStatus = "processing", rzCheck = "processed", cfFail = false;
globalThis.fetch = async (u, o = {}) => { u = String(u); const J = (x, s) => new Response(JSON.stringify(x), { status: s || 200, headers: { "content-type": "application/json" } }); const b = o.body ? JSON.parse(o.body) : null;
  if (/cashfree\.com\/payout\/beneficiary/.test(u)) { calls.push({ p: "cf-bene", b, h: o.headers }); return calls.filter((c) => c.p === "cf-bene").length > 1 ? J({ message: "exists" }, 409) : J({ beneficiary_id: b.beneficiary_id }); }
  if (/cashfree\.com\/payout\/transfers\?/.test(u)) { calls.push({ p: "cf-get", u }); return J({ status: cfCheck, cf_transfer_id: 991 }); }
  if (/cashfree\.com\/payout\/transfers/.test(u)) { calls.push({ p: "cf-tx", b, h: o.headers }); if (cfFail) return J({ message: "Beneficiary bank account invalid" }, 422); return J({ cf_transfer_id: 991, transfer_id: b.transfer_id, status: cfStatus }); }
  if (/api\.razorpay\.com\/v1\/payouts\//.test(u)) { calls.push({ p: "rz-get", u }); return J({ id: "pout_1", status: rzCheck }); }
  if (/api\.razorpay\.com\/v1\/payouts/.test(u)) { calls.push({ p: "rz-tx", b, h: o.headers }); return J({ id: "pout_1", status: rzStatus }); }
  if (/easy-split\/orders\/[^/]+\/split/.test(u)) { calls.push({ p: "split", u, b, h: o.headers }); return J({ status: "OK", message: "Order split created" }); }
  if (/cashfree\.com\/pg\/orders\/[^/]+\/refunds\/[^/]+$/.test(u) && (o.method || "GET") === "GET") { calls.push({ p: "cf-rf-get", u }); return J({ refund_status: cfRefundCheck, cf_refund_id: 5511 }); }
  if (/cashfree\.com\/pg\/orders\/[^/]+\/refunds/.test(u)) { calls.push({ p: "cf-rf", u, b, idem: (o.headers || {})["x-idempotency-key"] }); return J({ cf_refund_id: 5511, refund_id: b.refund_id, refund_status: cfRefundStart }); }
  return new Response("x", { status: 599 }); };
let cfRefundStart = "PENDING", cfRefundCheck = "SUCCESS";
const KV = new Map(), CHAT_KV = { get: async (k) => KV.get(k) || null, put: async (k, v) => { KV.set(k, v); }, getWithMetadata: async (k) => ({ value: KV.get(k) || null, metadata: null }), delete: async (k) => KV.delete(k), list: async () => ({ keys: [] }) };
const env = { XRAY_DB: d1(), CHAT_KV, ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", MAIL_FROM: "FODO <hello@fodo.co.in>", SITES_HOST: "sites.fodo.co.in", SITES_PROJECT: "fodo-sites" };
H.biz = bizApi; H.sites = sitesApi;
if (process.env.DBG) env.API_DEBUG = "1";
const Z = (p, body, who, o) => call("biz/" + p, body, Object.assign({ as: who || "c" }, o || {}));
const q1 = (sql, ...a) => env.XRAY_DB.db.prepare(sql).get(...a);
import { runDue, enqueue, HANDLERS, jdb } from "../functions/_lib/jobs.js";
import { onRequest as jobsTick } from "../functions/api/monitor/jobs.js";
import { onRequest as monTick } from "../functions/api/monitor/tick.js";
const X = (sql, ...a) => env.XRAY_DB.db.prepare(sql).run(...a);
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString(), dayN = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const enc = (s) => new TextEncoder().encode(s), cat = (...a) => { const n = a.reduce((x, y) => x + y.length, 0), o = new Uint8Array(n); let i = 0; a.forEach((x) => { o.set(x, i); i += x.length; }); return o; };
/* a fake private R2 bucket with multipart support (enough to prove the flow) */
const R2 = { objects: new Map(), mp: new Map(), calls: [] };
env.FILES = { put: async (k, v) => { R2.objects.set(k, v); }, get: async (k) => R2.objects.has(k) ? { body: R2.objects.get(k), size: R2.objects.get(k).byteLength } : null, head: async (k) => R2.objects.has(k) ? { size: R2.objects.get(k).byteLength } : null, delete: async (k) => { R2.objects.delete(k); },
  createMultipartUpload: async (k) => { const id = "mpu" + R2.mp.size; R2.mp.set(id, { key: k, parts: {} }); R2.calls.push("create"); return { key: k, uploadId: id }; },
  resumeMultipartUpload: (k, id) => ({ key: k, uploadId: id, uploadPart: async (n, b) => { const m = R2.mp.get(id); if (!m) throw new Error("no upload"); m.parts[n] = new Uint8Array(b); R2.calls.push("part" + n); return { partNumber: n, etag: "e" + n + "-" + b.byteLength }; },
    complete: async (L) => { const m = R2.mp.get(id); if (!m) throw new Error("no upload"); for (const p of L) if (!m.parts[p.partNumber] || m.parts[p.partNumber].byteLength + 0 !== +p.etag.split("-")[1]) throw new Error("bad part " + p.partNumber); const body = cat(...L.map((p) => m.parts[p.partNumber])); R2.objects.set(m.key, body); R2.mp.delete(id); R2.calls.push("complete"); return { key: m.key, etag: "final-" + body.byteLength, size: body.byteLength }; },
    abort: async () => { R2.mp.delete(id); R2.calls.push("abort"); } }) };
await login("anmol@fodo.co.in", null, "own"); await login("client@biz.in", null, "c"); await login("pro@studio.in", null, "p"); await login("mod@fodo.co.in", null, "m"); await login("colleague@biz.in", null, "k"); await login("other@biz.in", null, "o"); await login("stranger@else.in", null, "s");
await Z("admin/staff", { email: "mod@fodo.co.in", role: "moderator" }, "own");
const inv = (await Z("admin/invites", { note: "p", maxUses: 3 }, "own")).j.token;
await Z("pro", { invite: inv, name: "Aarav Films", role: "Cinematographer", skills: "reels", city: "Delhi", onsite: true, langs: "Hindi", bio: "Cinematographer for restaurants and cafes in Delhi NCR. Short-form reels and brand films.", days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], rateDay: 18000, terms: true, blackout: [dayN(40)] }, "p");
await Z("pro/packages", { name: "Pack", price: 15000 }, "p"); await Z("pro/portfolio", { kind: "video", title: "Film", url: "https://vimeo.com/1" }, "p"); await Z("pro/submit", {}, "p"); const proId = (await Z("pro", undefined, "p")).j.pro.id; await Z("admin/pros/" + proId, { action: "approve" }, "own");
let r;

/* ---------- 1. multipart uploads ---------- */
const mpart = async (who, id, n, bytes) => { const req = new Request(SITE + "/api/biz/files/multipart/" + id + "/part?n=" + n, { method: "PUT", body: bytes, headers: Object.assign({ origin: SITE, "x-fodo-upload": "1", "content-type": "application/octet-stream", "cf-connecting-ip": "9.9.9.9" }, jars[who] ? { cookie: jars[who] } : {}) });
  const rr = await bizApi({ request: req, env, params: { path: ["files", "multipart", id, "part"] } }); const t = await rr.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} all.push(t); return { status: rr.status, j }; };
r = await Z("files/storage"); ok(r.j.storage.store === "r2" && r.j.storage.multipart && r.j.storage.multipart.partSize === 8 * 1048576 && r.j.storage.multipart.maxFile === 1024 * 1048576, "storage says: R2 with multipart (8 MB parts, files to 1 GB)");
const PART = 8 * 1048576, big = PART + 1234, p1 = cat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), new Uint8Array(PART - 8).fill(1)), p2 = new Uint8Array(1234).fill(2);
r = await Z("files/multipart", { name: "shoot.png", size: big }, "nobody"); ok(r.status === 401, "multipart needs a session");
r = await Z("files/multipart", { name: "noext", size: big }); ok(r.status === 400, "the file name needs its extension (the bytes decide the type later)");
r = await Z("files/multipart", { name: "huge.mp4", size: 2 * 1024 * 1048576 }); ok(r.status === 413 && /1024 MB/.test(r.j.reason), "over the 1 GB limit");
r = await Z("files/multipart", { name: "shoot.png", size: big }); const U = r.j.upload; ok(r.j.ok && /^fl[a-z0-9]{22}$/.test(U.id) && U.partSize === PART && U.parts === 2 && R2.calls.join() === "create", "start: an upload id, part size and count; R2 multipart created under the final file key");
r = await mpart("c", U.id, 1, p2); ok(r.status === 400 && /at least 5 MB/.test(r.j.reason), "a short part that isn't the last one is refused");
r = await mpart("c", U.id, 1, new Uint8Array(PART + 1)); ok(r.status === 413, "a part over the part size is refused");
r = await mpart("o", U.id, 1, p1); ok(r.status === 404, "someone else can't add parts to my upload (IDOR)");
r = await Z("files/multipart/" + U.id + "/complete", {}); ok(r.status === 400 && r.j.missing && r.j.missing.join() === "1,2", "complete before the parts: says which are missing");
r = await mpart("c", U.id, 2, p2); ok(r.j.ok && r.j.part === 2 && r.j.received === 1234 && r.j.parts === 1, "parts can arrive out of order (last part first)");
r = await mpart("c", U.id, 1, p1); ok(r.j.ok && r.j.received === big && r.j.parts === 2, "part 1 (sniffed as PNG) brings the total to the declared size");
r = await mpart("c", U.id, 1, p1); ok(r.j.ok && r.j.received === big && r.j.parts === 2, "re-sending a part (a retry after a hiccup) replaces it, nothing doubles");
r = await Z("files/multipart"); ok(r.j.items.length === 1 && r.j.items[0].done.join() === "1,2", "open uploads are listed with the parts already there (resume)");
r = await Z("files/multipart/" + U.id + "/complete", {}); const F = r.j.file; ok(r.j.ok && F && F.name === "shoot.png" && F.size === big && F.type === "Image" && R2.calls[R2.calls.length - 1] === "complete" && R2.objects.get("biz-files/" + F.id).byteLength === big, "complete: the parts become one file record (type from the bytes, size exact), no copy");
ok(F.id === U.id && !!q1("SELECT 1 x FROM biz_files WHERE id=? AND store='r2' AND sha256 LIKE 'mp:%'", F.id) && !!q1("SELECT 1 x FROM biz_audit WHERE action='file:upload' AND target=?", F.id), "the upload id is the file id; stored as r2, audited");
r = await Z("files/multipart/" + U.id + "/complete", {}); ok(r.status === 409, "completing twice is refused");
r = await Z("files"); ok(r.j.files.some((f) => f.id === F.id), "it shows in Files like any upload");
const dlr = await bizApi({ request: new Request(SITE + "/api/biz/files/" + F.id + "/download", { headers: { origin: SITE, cookie: jars.c } }), env, params: { path: ["files", F.id, "download"] } }); ok(dlr.status === 200 && (await dlr.arrayBuffer()).byteLength === big, "and downloads whole");
r = await Z("files/multipart", { name: "evil.png", size: big }); const U2 = r.j.upload; r = await mpart("c", U2.id, 1, cat(enc("<html><script>x</script>"), new Uint8Array(PART).fill(3)).slice(0, PART)); ok(r.status === 415 && R2.calls[R2.calls.length - 1] === "abort" && q1("SELECT status FROM biz_file_uploads WHERE id=?", U2.id).status === "aborted", "part 1 with HTML bytes: refused and the R2 upload aborted at once");
r = await Z("files/multipart", { name: "a.png", size: big }); const U3 = r.j.upload; r = await Z("files/multipart/" + U3.id + "/abort", {}); ok(r.j.ok && q1("SELECT status FROM biz_file_uploads WHERE id=?", U3.id).status === "aborted", "the person can cancel an upload");
r = await Z("files/multipart", { name: "b.png", size: big }); const U4 = r.j.upload; X("UPDATE biz_file_uploads SET expires_at=? WHERE id=?", ago(1), U4.id);
r = await mpart("c", U4.id, 1, p1); ok(r.status === 410, "an expired upload says so");
const sw = await (await import("../functions/_lib/files.js")).mpSweep(env, 20); ok(sw === 1 && q1("SELECT status FROM biz_file_uploads WHERE id=?", U4.id).status === "aborted", "the sweep aborts expired uploads (R2 keeps nothing)");
for (let i = 0; i < 5; i++) await Z("files/multipart", { name: "c" + i + ".png", size: big }); r = await Z("files/multipart", { name: "c9.png", size: big }); ok(r.status === 429, "at most 5 open uploads per person");
const saveFiles = env.FILES; delete env.FILES; r = await Z("files/multipart", { name: "x.png", size: big }); ok(r.status === 503 && /10 MB still upload/.test(r.j.reason), "without R2: an honest message (small uploads still work)"); env.FILES = saveFiles;

/* ---------- 2. background jobs ---------- */
r = await Z("admin/jobs", undefined, "c"); ok(r.status === 403, "jobs are staff-only");
const mails = []; const origMail = (await import("../functions/_lib/accounts.js")).sendMail;
let e1 = await enqueue(env, "mail", { to: "x@y.in", subject: "Hi", html: "<p>Hi</p>", text: "Hi" }); ok(e1.queued && /^jb/.test(e1.id) && e1.viaQueue === false, "enqueue: a D1 row, no Cloudflare Queue bound");
let bad = null; try { await enqueue(env, "nuke", {}); } catch (e) { bad = e; } ok(bad && /Unknown job kind/.test(bad.message), "unknown kinds are refused at enqueue time");
let dj1 = await enqueue(env, "upload_sweep", {}, { key: "sweep:today" }), d2 = await enqueue(env, "upload_sweep", {}, { key: "sweep:today" }); ok(d2.duplicate && d2.id === dj1.id, "a keyed job is queued once (idempotent)");
r = await runDue(env, 10); ok(r.ran === 2 && r.done === 1 && r.failed === 1, "run due: the sweep is done; the mail fails (no mail key here) and is retried later");
const jm = q1("SELECT * FROM biz_jobs WHERE id=?", e1.id); ok(jm.status === "failed" && jm.attempts === 1 && /email not configured/.test(jm.last_error) && jm.run_after > new Date().toISOString(), "the failed job records the error and a backoff time");
r = await runDue(env, 10); ok(r.ran === 0 && r.remaining === 0, "nothing due until the backoff passes");
X("UPDATE biz_jobs SET run_after=? WHERE id=?", ago(1), e1.id); for (let i = 0; i < 4; i++) { r = await runDue(env, 10); X("UPDATE biz_jobs SET run_after=? WHERE id=?", ago(1), e1.id); }
ok(q1("SELECT status, attempts FROM biz_jobs WHERE id=?", e1.id).status === "dead" && q1("SELECT attempts FROM biz_jobs WHERE id=?", e1.id).attempts === 5 && !!q1("SELECT 1 x FROM biz_audit WHERE action='job:dead' AND target=?", e1.id), "after 5 attempts the job is dead and audited (never silently dropped)");
r = await Z("admin/jobs", undefined, "m"); ok(r.status === 403, "moderators don't see the job queue (admin / finance / viewer do)");
r = await Z("admin/jobs?status=dead", undefined, "own"); ok(r.j.items.length === 1 && r.j.items[0].summary === "to x@y.in · Hi" && r.j.counts.done === 1 && /scheduler/.test(r.j.queue) && r.j.kinds.length >= 7 && r.j.kinds.some((k) => k.kind === "os_hourly"), "admin view: counts, summaries, the queue mode, the job kinds (OS jobs included since v50.2)");
r = await Z("admin/jobs/" + e1.id + "/retry", {}, "m"); ok(r.status === 403, "only admins retry"); r = await Z("admin/jobs/" + e1.id + "/retry", {}, "own"); ok(r.j.ok && q1("SELECT status, attempts FROM biz_jobs WHERE id=?", e1.id).attempts === 0, "retry resets a dead job");
r = await Z("admin/jobs/run", { n: 5 }, "own"); ok(r.j.ok && r.j.ran === 1 && r.j.failed === 1, "Run now (admin) runs it again");
let fe = null; try { await enqueue(env, "webhook", { url: "http://plain/x" }); } catch (e) { fe = e; } ok(!fe, "a webhook job is accepted…"); r = await runDue(env, 10); ok(q1("SELECT last_error FROM biz_jobs WHERE kind='webhook'").last_error === "https URL needed", "…and fails safely on a non-https URL");
X("UPDATE biz_jobs SET status='running', locked_at=? WHERE kind='webhook'", ago(1)); r = await runDue(env, 10); ok(q1("SELECT status, last_error FROM biz_jobs WHERE kind='webhook'").last_error === "run interrupted" || q1("SELECT status FROM biz_jobs WHERE kind='webhook'").status !== "running", "a job stuck in running for 10+ minutes is released");
env.CRON_KEY = "cron-key-0123456789abcdef"; const tk = async (p, key) => { const rr = await (p === "jobs" ? jobsTick : monTick)({ request: new Request(SITE + "/api/monitor/" + p, { method: "POST", headers: { "x-cron-key": key, "content-type": "application/json" }, body: "{}" }), env }); return { status: rr.status, j: await rr.json() }; };
r = await tk("jobs", "wrong"); ok(r.status === 401, "the jobs tick needs the cron key"); r = await tk("jobs", env.CRON_KEY); ok(r.j.ok && "remaining" in r.j, "POST /api/monitor/jobs runs due jobs and reports what's left");
r = await tk("tick", env.CRON_KEY); ok(r.j.ok && r.j.jobs && typeof r.j.jobs.ran === "number" && q1("SELECT count(*) n FROM biz_jobs WHERE kind='team_housekeeping'").n === 1 && q1("SELECT count(*) n FROM biz_jobs WHERE kind='payout_check'").n === 1, "the daily tick queues the housekeeping jobs once and runs them");
r = await tk("tick", env.CRON_KEY); ok(q1("SELECT count(*) n FROM biz_jobs WHERE kind='team_housekeeping'").n === 1, "a second tick the same day doesn't queue them again");
const sentQ = []; env.JOBS = { send: async (m) => { sentQ.push(m); } }; e1 = await enqueue(env, "notify", { userId: "u1", text: "hi" }); ok(e1.viaQueue && sentQ.length === 1 && sentQ[0].id === e1.id && q1("SELECT status FROM biz_jobs WHERE id=?", e1.id).status === "queued", "with a Cloudflare Queue bound: the job is also sent there, the D1 row stays the truth"); delete env.JOBS;
ok(fs.readFileSync(".github/workflows/fodo-brain.yml", "utf8").indexOf("/api/monitor/jobs") > -1 && /JOBS/.test(fs.readFileSync("wrangler.toml", "utf8")), "the hourly workflow calls the jobs tick; wrangler.toml documents the optional queue");

/* ---------- 3. calendar feeds ---------- */
r = await Z("calendar/link?kind=pro", undefined, "c"); ok(r.status === 404, "a client has no Pro calendar");
r = await Z("calendar/link?kind=staff", undefined, "c"); ok(r.status === 403, "…nor the staff one");
r = await Z("calendar/link?kind=client", undefined, "c"); const cf = r.j.feed; ok(r.j.ok && /^https:\/\/www\.fodo\.co\.in\/api\/biz\/calendar\/[a-z0-9]{40}\.ics$/.test(cf.url) && /^webcal:\/\//.test(cf.webcal) && !cf.lastUsed, "client feed: a 40-character token URL, not fetched yet");
r = await Z("calendar/link?kind=client", undefined, "c"); ok(r.j.feed.url === cf.url, "asking again gives the same link");
const feed = async (tok) => { const rr = await bizApi({ request: new Request(SITE + "/api/biz/calendar/" + tok, { headers: { "cf-connecting-ip": "1.2.3.4" } }), env, params: { path: ["calendar", tok] } }); return { status: rr.status, h: rr.headers, t: await rr.text() }; };
r = await feed("nope.ics"); ok(r.status === 404, "a bad token: not found (no session needed, nothing leaked)");
const tok = cf.url.split("/").pop();
const pid = (await Z("projects", { proId, title: "Cafe reels", brief: "Three reels for the launch", day: dayN(5) })).j.project.id;
await Z("projects/" + pid + "/propose", { milestones: [{ title: "Edit", amount: 5000, due: dayN(9) }] }, "p"); await Z("projects/" + pid + "/accept", {});
r = await feed(tok); ok(r.status === 200 && /text\/calendar/.test(r.h.get("content-type")) && /BEGIN:VCALENDAR/.test(r.t) && /X-WR-CALNAME:FODO projects/.test(r.t) && /VTIMEZONE/.test(r.t) && /END:VCALENDAR\r\n$/.test(r.t), "the feed is a valid iCalendar file (with the India timezone)");
ok(/SUMMARY:FODO project: Cafe reels/.test(r.t) && new RegExp("DTSTART;VALUE=DATE:" + dayN(5).replace(/-/g, "")).test(r.t) && /SUMMARY:Due: Edit · Cafe reels/.test(r.t) && /UID:pj-/.test(r.t), "client feed: the project day and the milestone due date");
ok(r.t.indexOf("5000") < 0 && r.t.indexOf("₹") < 0, "no money in the calendar");
ok(r.t.split("\r\n").every((l) => l.length <= 75), "lines are folded to 75 characters (RFC 5545)");
r = await Z("calendar/link?kind=client", undefined, "c"); ok(!!r.j.feed.lastUsed, "the last fetch time is shown to the person");
r = await Z("calendar/link?kind=pro", undefined, "p"); const pf = r.j.feed, ptok = pf.url.split("/").pop(); r = await feed(ptok);
ok(/X-WR-CALNAME:FODO Pros/.test(r.t) && /SUMMARY:FODO: Cafe reels/.test(r.t) && /SUMMARY:Not available \(FODO blackout\)/.test(r.t) && /TRIGGER:-PT20H/.test(r.t), "Pro feed: booked day (project title only) + blackout day + a reminder");
r = await Z("calendar/link", { kind: "client" }, "c"); const cf2 = r.j.feed; ok(cf2.url !== cf.url, "regenerate: a new link");
r = await feed(tok); ok(r.status === 404, "…and the old link is dead");
r = await feed(cf2.url.split("/").pop()); ok(r.status === 200, "the new one works");
r = await Z("calendar/revoke", { kind: "client" }, "c"); r = await feed(cf2.url.split("/").pop()); ok(r.status === 404, "switched off: nothing served");
r = await Z("calendar/link?kind=staff", undefined, "m"); const sf = r.j.feed; r = await feed(sf.url.split("/").pop()); ok(r.status === 200 && /X-WR-CALNAME:FODO teams/.test(r.t), "staff feed (moderator)");
ok(!!q1("SELECT 1 x FROM biz_audit WHERE action='calendar:regenerate'") && !!q1("SELECT 1 x FROM biz_audit WHERE action='calendar:revoke'"), "regenerate and revoke are audited");

/* ---------- 4. organizations ---------- */
r = await Z("org"); ok(r.j.ok && r.j.org === null && r.j.invitations.length === 0, "no organization yet");
r = await Z("org", { name: "A" }); ok(r.status === 400, "a name is needed");
r = await Z("org", { name: "Acme Foods", legalName: "Acme Foods Pvt Ltd", gstin: "07ABCDE1234F1Z5", address: "12 MG Road, New Delhi" }); const O = r.j.org; ok(r.j.ok && O.myRole === "owner" && O.legalName === "Acme Foods Pvt Ltd" && O.gstin === "07ABCDE1234F1Z5" && r.j.members.length === 1 && r.j.canManage, "created with a billing profile; the creator is the owner");
r = await Z("org", { name: "Second" }); ok(r.status === 409, "one organization per person");
r = await Z("org/settings", { gstin: "BAD" }); ok(r.status === 400, "a wrong GSTIN is refused");
r = await Z("org/invite", { email: "not-an-email" }); ok(r.status === 400, "invite needs a valid email");
r = await Z("org/invite", { email: "colleague@biz.in", role: "admin" }); ok(r.j.members.some((m) => m.email === "colleague@biz.in" && m.status === "invited" && m.role === "admin"), "colleague invited as admin");
ok(!!q1("SELECT 1 x FROM biz_notes WHERE user_id=(SELECT id FROM acct_users WHERE email='colleague@biz.in') AND kind='org'") && !!q1("SELECT 1 x FROM help_mail WHERE to_addr='colleague@biz.in' AND subject LIKE '%invited you%'"), "they get a notification and an email");
r = await Z("org", undefined, "k"); ok(r.j.org === null && r.j.invitations.length === 1 && r.j.invitations[0].name === "Acme Foods", "the colleague sees the invitation");
r = await Z("org/answer", { orgId: O.id, accept: true }, "s"); ok(r.status === 404, "someone with a different email can't accept it");
r = await Z("org/answer", { orgId: O.id, accept: true }, "k"); ok(r.j.org && r.j.org.myRole === "admin" && r.j.members.filter((m) => m.status === "active").length === 2, "accepted: now an admin of Acme");
r = await Z("org/invite", { email: "colleague@biz.in" }, "o"); ok(r.status === 404, "people outside have no org to invite into");
/* sharing: read, not act */
const bd = (await Z("builder/drafts", { templateId: "custom", answers: { promote: "Launch film", city: "Delhi", mode: "onsite" }, tier: "essential", custom: { roles: [{ id: "dop", qty: 1 }] } }, "c")).j.draft;
const Q = (await Z("quotes", { buildId: bd.id }, "c")).j.quote; r = await Z("admin/quotes/" + Q.id + "/send", {}, "own");
r = await Z("quotes/" + Q.id, undefined, "k"); ok(r.j.ok && r.j.quote.number === Q.number, "the colleague can read the quote");
r = await Z("quotes/" + Q.id, undefined, "o"); ok(r.status === 404, "an outsider still can't (isolation)");
r = await Z("org/shared", undefined, "k"); ok(r.j.org && r.j.quotes.length === 1 && r.j.quotes[0].owner === "client@biz.in" && r.j.members === 2, "the shared list shows the colleague's quote with its owner");
r = await Z("quotes/" + Q.id + "/accept", { version: 1, agree: true }, "k"); ok(r.status === 404, "accepting a colleague's quote is refused while act-on-behalf is off");
r = await Z("org/settings", { actOnBehalf: true }, "k"); ok(r.j.org.actOnBehalf === false, "an admin can't switch act-on-behalf on (owner only)");
r = await Z("org/settings", { actOnBehalf: true }, "c"); ok(r.j.org.actOnBehalf === true && !!q1("SELECT 1 x FROM biz_audit WHERE action='org:update' AND detail LIKE 'actOnBehalf=true%'"), "the owner switches it on (audited)");
r = await Z("quotes/" + Q.id + "/accept", { version: 1, agree: true }, "k"); ok(r.j.ok && r.j.quote.status === "accepted" && q1("SELECT accepted_by FROM biz_quotes WHERE id=?", Q.id).accepted_by === q1("SELECT id FROM acct_users WHERE email='colleague@biz.in'").id && !!q1("SELECT 1 x FROM biz_audit WHERE action='quote:accept' AND actor='colleague@biz.in'"), "now the admin accepts it, and the record says who did");
const qv = JSON.parse(q1("SELECT data FROM biz_quote_versions WHERE quote_id=? AND version=1", Q.id).data); ok(qv.client.company === "Acme Foods Pvt Ltd" && qv.client.gstin === "07ABCDE1234F1Z5", "the quote carries the organization's legal name and GSTIN");
const pr = await Z("quotes/" + Q.id + "/print", undefined, "c"); ok(/Acme Foods Pvt Ltd \(GSTIN 07ABCDE1234F1Z5\)/.test(pr.t), "…and the printable quote shows them");
const pid2 = (await Z("projects", { proId, title: "Org job", brief: "A project the colleague may look at" }, "c")).j.project.id;
r = await Z("projects/" + pid2, undefined, "k"); ok(r.j.ok && r.j.project.side === "staff", "the colleague reads the project (as read-only)");
r = await Z("projects/" + pid2 + "/message", { body: "hello" }, "k"); ok(r.status === 404 || r.status === 403, "…but can't act in it");
r = await Z("projects/" + pid2, undefined, "o"); ok(r.status === 404, "outsiders: nothing");
r = await Z("org/member", { email: "colleague@biz.in", role: "member" }, "k"); ok(r.status === 403, "an admin can't change roles");
r = await Z("org/member", { email: "colleague@biz.in", role: "member" }, "c"); ok(r.j.members.find((m) => m.email === "colleague@biz.in").role === "member", "the owner demotes to member");
r = await Z("quotes/" + Q.id, undefined, "k"); ok(r.j.ok, "a member still reads");
r = await Z("org/leave", {}, "c"); ok(r.status === 409 && /Transfer ownership/.test(r.j.reason), "the owner can't leave while others are in");
r = await Z("org/transfer", { email: "colleague@biz.in" }, "c"); ok(r.j.org.myRole === "admin" && r.j.members.find((m) => m.email === "colleague@biz.in").role === "owner", "ownership transferred; the old owner becomes admin");
r = await Z("org/member", { email: "client@biz.in", remove: true }, "k"); ok(r.j.members.length === 1, "the new owner removes the old one");
r = await Z("quotes/" + Q.id, undefined, "k"); ok(r.status === 404, "after removal the quote is no longer shared");
r = await Z("org/leave", {}, "k"); ok(r.j.org === null && !q1("SELECT 1 x FROM biz_orgs WHERE id=?", O.id), "the last person leaving deletes the organization");

/* ---------- 5. CI + UI wiring ---------- */
const ck = (await import("node:child_process")).spawnSync(process.execPath, ["scripts/check.mjs"], { encoding: "utf8" }); ok(ck.status === 0 && /OK: \d+ files checked/.test(ck.stdout), "scripts/check.mjs passes (parse, no worker / long dash in marketplace code, no keys in js/)");
const wf = fs.readFileSync(".github/workflows/fodo-tests.yml", "utf8"); ok(/node scripts\/check\.mjs/.test(wf) && /node tests\/run\.mjs integration/.test(wf) && /node tests\/run\.mjs e2e/.test(wf) && /pull_request/.test(wf), "CI workflow: static checks + integration + e2e on push and pull request");
const WS = fs.readFileSync("js/workspace.js", "utf8"), SY = fs.readFileSync("js/ws-sync.js", "utf8");
ok(/MPINFO && file\.size > 10 \* 1048576/.test(WS) && /files\/multipart\/" \+ encodeURIComponent\(id\) \+ "\/part\?n=/.test(SY) && /putPart\(id, n, blob, tries - 1\)/.test(SY), "big files go up in parts with retries; small ones as before");
ok(/FODO_WS_SYNC\.calendar\(\$\("#pc-cal"\), "pro"\)/.test(WS) && /FODO_WS_SYNC\.org\(\$\("#st-org"\)\)/.test(WS) && /addbyurl\?cid=/.test(SY), "calendar box on the Pro calendar and in Settings; organization in Settings");
ok(/\["jobs", "Jobs"\], \["calendar", "Calendar"\]/.test(fs.readFileSync("js/ws-mission.js", "utf8")) && /FODO_WS_SYNC\.shared\(b\)/.test(fs.readFileSync("js/ws-builder.js", "utf8")), "admin Jobs + Calendar tabs; colleagues' records on the Quotes page");
console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
