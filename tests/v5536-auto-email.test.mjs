// v55.36 auto email to leads still to contact.
// Run: node --no-warnings tests/v5536-auto-email.test.mjs
// Every outside service is mocked (no real network). Run: node --no-warnings tests/v55-lead-intel.test.mjs
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as adminApi } from "../functions/api/admin/[[path]].js";


import * as LI from "../functions/_lib/leadintel.js";
import { onRequest as fileRoute } from "../functions/f/[token].js";
import { logConvo } from "../functions/_lib/botlog.js";
import { onRequestPost as chatPost, SYSTEM_PROMPT, turnHints, inventedPrice } from "../functions/api/chat.js";
import { _setLeadStore } from "../functions/_lib/metadm.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
console.log = ((orig) => (...a) => { if (typeof a[0] === "string" && a[0].charAt(0) === "{" && !process.env.DBG) return; orig(...a); })(console.log);
console.error = () => {};
function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, a = []) => ({ bind: (...x) => st(sql, x.map((v) => v === undefined ? null : v)), run: async () => { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }), _x: () => db.prepare(sql).run(...a) });
  return { db, prepare: (s) => st(s), batch: async (l) => l.map((s) => (s._x(), { success: true })) };
}
const SITE = "https://www.fodo.co.in", jars = {};
const KV = new Map(), KVM = new Map(), CHAT_KV = { get: async (k) => (KV.has(k) ? KV.get(k) : null), put: async (k, v, o) => { KV.set(k, v); KVM.set(k, (o && o.metadata) || null); }, getWithMetadata: async (k) => ({ value: KV.has(k) ? KV.get(k) : null, metadata: KVM.get(k) || null }), delete: async (k) => { KV.delete(k); KVM.delete(k); } };
const env = { XRAY_DB: d1(), CHAT_KV, ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", RESEND_API_KEY: "re_test_x", AI: { run: async (m, o) => ({ response: aiReply(o) }) } };
const q1 = (sql, ...a) => env.XRAY_DB.db.prepare(sql).get(...a), X = (sql, ...a) => env.XRAY_DB.db.prepare(sql).run(...a);
const call = async (path, body, who, o = {}) => {
  const h = path.indexOf("admin/") === 0 ? "admin" : "account", p = h === "admin" ? path.slice(6) : path;
  const req = new Request(SITE + "/api/" + h + "/" + p, { method: body !== undefined ? "POST" : "GET", headers: Object.assign({ origin: SITE, "cf-connecting-ip": "9.9.9.9" }, body !== undefined ? { "content-type": "application/json" } : {}, jars[who] ? { cookie: jars[who] } : {}), body: body === undefined ? undefined : JSON.stringify(body) });
  const r = await (h === "admin" ? adminApi : account)({ request: req, env, params: { path: p.split("?")[0].split("/").map(decodeURIComponent) }, waitUntil: () => {} });
  const sc = r.headers.get("set-cookie"); if (sc && h === "account") jars[who] = sc.split(";")[0];
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, j, t, h: r.headers };
};
/* ---- fixtures for mocked outside services (test data only, never shown on the site) ---- */
const mails = []; let placesCalls = 0, placesDown = false, serperOn = true, calls = [];
const SMILE = `<html><head><title>Smile Dental Clinic Dwarka | Dentist</title><meta name="viewport" content="width=device-width"></head><body><h1>Smile Dental</h1>
<a href="/contact-us">Contact</a> <a href="/about">About us</a> <a href="/team">Our team</a> <a href="/missing-page">Old offer</a>
<a href="https://www.instagram.com/smiledentaldwarka/">Instagram</a> <a href="https://wa.me/919800000001">WhatsApp us</a>
<p>Call <a href="tel:+91 98000 00001">+91 98000 00001</a></p><p>© 2019 Smile Dental</p></body></html>`;
const SMILE_CONTACT = `<html><body><form><input type="email"><textarea></textarea></form><a href="mailto:info@smiledental.in">info@smiledental.in</a> write to sales@smiledental.in <img src="logo@2x.png"></body></html>`;
const SMILE_ABOUT = `<html><body><p>Dr. Priya Sharma, Founder and chief dentist, started the clinic.</p><p>Founder: Dr. Priya Sharma</p><script type="application/ld+json">{"@type":"Dentist","name":"Smile Dental","founder":{"@type":"Person","name":"Priya Sharma"}}</script></body></html>`;
const SMILE_TEAM = `<html><body><p>Our Team</p><a href="https://www.linkedin.com/in/rahul-verma-xyz">Rahul Verma</a></body></html>`;
const PLACES = { places: [
  { id: "P1", displayName: { text: "Smile Dental Clinic" }, formattedAddress: "Sector 12, Dwarka, New Delhi", location: { latitude: 28.59, longitude: 77.04 }, types: ["dentist"], primaryTypeDisplayName: { text: "Dentist" }, businessStatus: "OPERATIONAL", googleMapsUri: "https://maps.google.com/?cid=1", rating: 4.6, userRatingCount: 212, nationalPhoneNumber: "098000 00001", internationalPhoneNumber: "+91 98000 00001", websiteUri: "https://smiledental.in/" },
  { id: "P2", displayName: { text: "Bright Teeth Care" }, formattedAddress: "Sector 6, Dwarka, New Delhi", location: { latitude: 28.58, longitude: 77.05 }, types: ["dentist"], primaryTypeDisplayName: { text: "Dentist" }, businessStatus: "OPERATIONAL", googleMapsUri: "https://maps.google.com/?cid=2", rating: 4.1, userRatingCount: 18, nationalPhoneNumber: "011 4000 0002", internationalPhoneNumber: "+91 11 4000 0002" },
  { id: "P3", displayName: { text: "Closed Dental" }, formattedAddress: "Sector 7, Dwarka", location: { latitude: 28.5, longitude: 77.0 }, businessStatus: "CLOSED_PERMANENTLY", googleMapsUri: "https://maps.google.com/?cid=3", rating: 3, userRatingCount: 4 },
] };
globalThis.fetch = async (u, o = {}) => { u = String(u); calls.push(u);
  if (/api\.resend\.com\/emails/.test(u)) { const b = JSON.parse(o.body); mails.push(b); return Response.json({ id: "re_" + mails.length }); }
  if (/places\.googleapis\.com/.test(u)) { placesCalls++; if (placesDown) return new Response("{}", { status: 403 }); return Response.json(PLACES); }
  if (/google\.serper\.dev/.test(u)) return Response.json({ organic: [{ title: "Amit Kumar - Founder - Bright Teeth Care | LinkedIn", link: "https://in.linkedin.com/in/amit-kumar-bt", snippet: "Founder at Bright Teeth Care, Dwarka" }, { title: "Neha Gupta - CEO - Some Other Company | LinkedIn", link: "https://in.linkedin.com/in/neha", snippet: "CEO at Other Co" }] });
  if (/cloudflare-dns\.com/.test(u)) return Response.json({ Answer: [{ type: 15, data: "10 mx.smiledental.in." }] });
  if (/linkedin\.com/.test(u)) throw new Error("LinkedIn must never be fetched");
  const m = u.match(/^https:\/\/smiledental\.in(\/[^?#]*)?/);
  if (m) { const p = m[1] || "/"; const H = { "/": SMILE, "/contact-us": SMILE_CONTACT, "/about": SMILE_ABOUT, "/team": SMILE_TEAM }[p];
    if (o.method === "HEAD") return new Response(null, { status: H ? 200 : 404 });
    return H ? new Response(H, { status: 200, headers: { "content-type": "text/html" } }) : new Response("nope", { status: 404, headers: { "content-type": "text/html" } }); }
  return new Response("{}", { status: 404 }); };
function aiReply(o) { const u = o.messages[1].content; if (/Say OK/.test(u)) return "OK"; if (/Observed problems/.test(u)) return "Summary based on the checks. Hypothesis: they may benefit from SEO."; return "Subject: A quick idea\n\nHi Priya, draft text. Anmol, FODO"; }
await call("test-login", { email: "anmol@fodo.co.in" }, "o");
await call("test-login", { email: "rohit@fodo.co.in" }, "adm");
await call("test-login", { email: "viewer@fodo.co.in" }, "v");
await call("test-login", { email: "random@gmail.com" }, "x");
X("CREATE TABLE IF NOT EXISTS acct_admins (email TEXT PRIMARY KEY, role TEXT, added_by TEXT, added_at TEXT)");
X("INSERT INTO acct_admins (email, role) VALUES ('rohit@fodo.co.in','admin'),('viewer@fodo.co.in','viewer')");
const LP = (p, b, who) => call("admin/li/" + p, b, who || "o");

const B64 = (s) => Buffer.from(s).toString("base64");
const csv = "Email,Company\n" + Array.from({ length: 6 }, (_, i) => "owner" + i + "@shop" + i + ".in,Shop " + i).join("\n");
const ip = (await LP("import-preview", { text: csv })).j; await LP("import", { rows: ip.rows, tag: "Auto test" });
X("UPDATE li_businesses SET email_check='ok' WHERE source_ref='Auto test'");
X("UPDATE li_businesses SET email_check='invalid' WHERE email='owner5@shop5.in'");
X("UPDATE li_businesses SET email_check=NULL WHERE email='owner4@shop4.in'");
const f = (await LP("file", { file: B64("%PDF-1.4 profile"), name: "FODO Profile.pdf", mime: "application/pdf" })).j.file; await LP("always-files", { add: f });

let s = (await LP("auto?list=Auto+test")).j;
ok(s.ok && s.left === 4 && s.unchecked === 1 && !s.auto.on, "4 waiting (valid email, not contacted), 1 unchecked not counted, invalid left out");
ok(s.files.length === 1 && s.preview && /one team/i.test(s.preview.subject) && /FODO Profile\.pdf/.test(s.preview.html), "services email preview with the 📌 file");
ok((await LP("auto", { action: "start", confirm: true, list: "Auto test" })).status === 400, "cannot start before a test to yourself");
let before = mails.length; const t = (await LP("auto", { action: "test", list: "Auto test" })).j;
ok(t.ok && mails.length === before + 1 && mails[mails.length - 1].to[0] === "anmol@fodo.co.in" && /\[TEST\]/.test(mails[mails.length - 1].subject), "test goes to the admin only");
ok((await LP("auto", { action: "start", list: "Auto test" })).status === 400, "start needs confirm");
const stt = (await LP("auto", { action: "start", confirm: true, list: "Auto test", per_day: 3, interval: 1 })).j.auto; ok(stt.per_day === 10 && stt.interval === 1, "a day limit under 10 is raised to 10; gap 1 second kept");
ok((await LP("auto", { action: "speed", interval: 7 })).j.auto.interval === 1 && (await LP("auto", { action: "speed", interval: 60 })).j.auto.interval === 60 && (await LP("auto", { action: "speed", interval: 1 })).j.auto.interval === 1, "only the listed gaps (1s, 5s, 1m, 5m, 15m, 30m, 1h) are accepted");
{ const z = JSON.parse(KV.get("li:auto")); z.per_day = 3; KV.set("li:auto", JSON.stringify(z)); }
ok((await LP("auto", { action: "start", confirm: true }, "v")).status === 403, "viewers cannot start it");

const LIb = await import("../functions/_lib/leadintel.js");
before = mails.length; let r = await LIb.autoTick(env, 30000);
const got = mails.slice(before);
ok(r.sent === 3 && got.length === 3 && got.every((m) => /@shop[0-3]\.in$/.test(m.to[0])) && got.every((m) => (m.attachments || []).some((a) => a.filename === "FODO Profile.pdf")), "3 sent (daily limit), each with the 📌 PDF");
ok(got.every((m) => /\/api\/o\/cm_/.test(m.html)) && got.every((m) => !/\[TEST\]/.test(m.subject)), "real emails, with Seen tracking");
ok(q1("SELECT COUNT(*) n FROM li_businesses WHERE source_ref='Auto test' AND status='email_sent'").n === 3, "those leads move to Sent leads");
r = await LIb.autoTick(env, 30000); ok(r.sent === 0 && /daily/.test(r.waiting), "daily limit holds");
const st = JSON.parse(KV.get("li:auto")); st.day = "2000-01-01"; st.last_at = "2000-01-01T00:00:00Z"; KV.set("li:auto", JSON.stringify(st));
before = mails.length; r = await LIb.autoTick(env, 30000); ok(r.sent === 1 && mails.length === before + 1, "next day: the last waiting lead");
{ const z = JSON.parse(KV.get("li:auto")); z.last_at = "2000-01-01T00:00:00Z"; KV.set("li:auto", JSON.stringify(z)); } r = await LIb.autoTick(env, 30000); ok(r.done && !JSON.parse(KV.get("li:auto")).on, "nobody left: auto email switches itself off");
ok(!mails.some((m) => m.to[0] === "owner5@shop5.in" || m.to[0] === "owner4@shop4.in"), "invalid and unchecked emails never get it");

/* v55.37 gap between emails */
X("INSERT INTO li_businesses (id,name,email,email_check,source,source_ref,status,archived,created_at,updated_at) VALUES ('LI-GP1','Gap One','a@gap1.in','ok','import','Gap test','new',0,'2026','2026'),('LI-GP2','Gap Two','b@gap2.in','ok','import','Gap test','new',0,'2026','2026')");
await LP("auto", { action: "start", confirm: true, list: "Gap test", interval: 900 });
{ const z = JSON.parse(KV.get("li:auto")); z.day = "2000-02-01"; z.last_at = new Date(Date.now() - 60e3).toISOString(); KV.set("li:auto", JSON.stringify(z)); }
r = await LIb.autoTick(env, 30000); ok(r.sent === 0 && /next email after/.test(r.waiting), "15-minute gap: nothing sent 1 minute after the last email");
{ const z = JSON.parse(KV.get("li:auto")); z.last_at = new Date(Date.now() - 16 * 60e3).toISOString(); KV.set("li:auto", JSON.stringify(z)); }
before = mails.length; r = await LIb.autoTick(env, 30000); ok(r.sent === 1 && mails.length === before + 1, "after 16 minutes exactly one email goes (not a burst)");
before = mails.length; r = (await LP("auto", { action: "run" })).j; ok(r.run.sent === 1 && mails.length === before + 1, "Send next batch now sends one right away");
const AE = (await import("../functions/api/monitor/autoemail.js")).onRequest;
const ae = async (key) => (await AE({ request: new Request("https://www.fodo.co.in/api/monitor/autoemail", { method: "POST", headers: key ? { "x-cron-key": key } : {} }), env: Object.assign({}, env, { CRON_KEY: "k".repeat(20) }) })).status;
ok(await ae("") === 401 && await ae("k".repeat(20)) === 200, "5-minute endpoint needs the cron key");
ok(/\*\/5 \* \* \* \*/.test(fs.readFileSync(".github/workflows/fodo-autoemail.yml", "utf8")), "GitHub runs it every 5 minutes");

/* pause + unsubscribed */
X("INSERT INTO li_businesses (id,name,email,email_check,source,source_ref,status,archived,created_at,updated_at) VALUES ('LI-AU1','Unsub Co','gone@unsub.in','ok','import','Auto test','new',0,'2026','2026')");
try { X("CREATE TABLE IF NOT EXISTS camp_unsub (email TEXT PRIMARY KEY, at TEXT)"); } catch (e) {}
X("INSERT INTO camp_unsub (email, at) VALUES ('gone@unsub.in','2026')");
await LP("auto", { action: "start", confirm: true, list: "Auto test" });
const st2 = JSON.parse(KV.get("li:auto")); st2.day = "2000-01-02"; st2.last_at = "2000-01-01T00:00:00Z"; KV.set("li:auto", JSON.stringify(st2));
before = mails.length; r = await LIb.autoTick(env, 30000);
ok(mails.length === before && JSON.parse(KV.get("li:auto")).skip.indexOf("LI-AU1") > -1, "unsubscribed lead is skipped for good, not emailed");
await LP("auto", { action: "pause" }); ok(!JSON.parse(KV.get("li:auto")).on && (await LIb.autoTick(env)).off, "pause stops it");

const AJ = fs.readFileSync("js/admin.js", "utf8"), JB = fs.readFileSync("functions/api/monitor/jobs.js", "utf8");
ok(/id="lq-auto">&#9993; Auto email/.test(AJ) && /Send a test to me/.test(AJ) && /Start auto email/.test(AJ) && /Send next batch now/.test(AJ), "Auto email button and panel on Leads & clients");
ok(/autoTick\(env, 30000\)/.test(JB), "hourly background job sends the next batch");
ok(/\[1, "1 second"\], \[5, "5 seconds"\], \[60, "1 minute"\], \[300, "5 minutes"\], \[900, "15 minutes"\], \[1800, "30 minutes"\], \[3600, "1 hour"\]/.test(AJ) && /id="au-file"/.test(AJ) && /data-aurm=/.test(AJ), "speed choices and add / remove file inside Auto email");

console.log("\nv55.36/37 auto email: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
