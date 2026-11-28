// v55.35 email opens (Seen) + every-email files by default.
// Run: node --no-warnings tests/v5535-email-seen.test.mjs
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

const OR = await import("../functions/_lib/outreach.js"); await OR.cmDb(env);
const px = OR.withPixel(env, "<html><body><p>Hi</p></body></html>", "cm_abc123XYZ");
ok(/<img src="https:\/\/www\.fodo\.co\.in\/api\/o\/cm_abc123XYZ\.gif" width="1" height="1"/.test(px) && px.indexOf("</body>") > px.indexOf("/api/o/"), "tracking image added before </body>");
ok(OR.withPixel(env, px, "cm_abc123XYZ") === px, "added only once (retry keeps one image)");
ok(OR.withPixel(env, "<p>x</p>", "bad id") === "<p>x</p>", "no image for a strange id");

const O = (await import("../functions/api/o/[[path]].js")).onRequest;
const hit = async (id) => O({ request: new Request("https://www.fodo.co.in/api/o/" + id + ".gif"), env, params: { path: [id + ".gif"] } });
X("INSERT INTO li_businesses (id,name,email,source,status,archived,created_at,updated_at) VALUES ('LI-SEEN1','Seen Shop','owner@seenshop.in','import','email_sent',0,'2026','2026')");
X("INSERT INTO cm_sends (id,at,last_at,email,type,subject,status,test) VALUES ('cm_openAAAA1','2026-11-28T10:00:00Z','2026-11-28T10:00:00Z','owner@seenshop.in','lead_intel','Hi','sent',0)");
X("INSERT INTO cm_sends (id,at,last_at,email,type,subject,status,test) VALUES ('cm_failAAAA1','2026-11-28T10:00:00Z','2026-11-28T10:00:00Z','x@seenshop.in','lead_intel','Hi','failed',0)");
let res = await hit("cm_openAAAA1"), buf = new Uint8Array(await res.arrayBuffer());
ok(res.status === 200 && res.headers.get("content-type") === "image/gif" && buf[0] === 0x47 && /no-store/.test(res.headers.get("cache-control")), "pixel answers a real GIF, never cached");
let row = q1("SELECT opened_at, opens, last_open FROM cm_sends WHERE id='cm_openAAAA1'");
ok(row.opened_at && row.opens === 1, "first open recorded");
await hit("cm_openAAAA1"); ok(q1("SELECT opens FROM cm_sends WHERE id='cm_openAAAA1'").opens === 1, "a reload within 10 minutes is not a second write");
X("UPDATE cm_sends SET last_open='2026-11-01T00:00:00Z' WHERE id='cm_openAAAA1'"); await hit("cm_openAAAA1");
row = q1("SELECT opened_at, opens FROM cm_sends WHERE id='cm_openAAAA1'"); ok(row.opens === 2, "a later open counts again, first-open time kept");
await hit("cm_failAAAA1"); ok(!q1("SELECT opened_at FROM cm_sends WHERE id='cm_failAAAA1'").opened_at, "failed sends are not marked");
res = await hit("nonsense'--"); ok(res.status === 200, "a bad id still gets the image, nothing written");

const L = (await LP("leads?stage=contacted&limit=50")).j.leads.find((l) => l.id === "LI-SEEN1");
ok(L && L.seen_at && L.opens === 2 && L.sent_via === "Email", "Sent leads shows Seen with the open count");
const SL = (await LP("sent-list")).j; ok(SL.ok, "Sent & replies still loads");
const AJ = fs.readFileSync("js/admin.js", "utf8");
ok(/var lseen = function/.test(AJ) && /Not opened yet/.test(AJ) && /&#128065; Seen/.test(AJ) && /s\.opened_at \?/.test(AJ), "Seen / Not opened yet shown in Leads, Sent & replies and the Client emails log");
ok(/📌 Attach file<input type="file" multiple hidden data-fup="all">/.test(AJ) && /Only for this email/.test(AJ) && /data-astop=/.test(AJ), "attaching a file keeps it for every new email (one-time option kept)");
ok(/opened_at: r\.opened_at/.test(fs.readFileSync("functions/_lib/outreach.js", "utf8")), "send log returns opens");

console.log("\nv55.35 email seen: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
