// v55.32 Leads & clients: pages, Sent marks from every FODO email tool, status sync, email check for all leads.
// Run: node --no-warnings tests/v5532-leads-pages.test.mjs
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

const csv = "Email,Company\n" + Array.from({ length: 250 }, (_, i) => "client" + i + "@shop" + i + ".in,Shop " + i).join("\n");
const ip = (await LP("import-preview", { text: csv })).j; await LP("import", { rows: ip.rows, tag: "Pages test" });
const p1 = (await LP("leads?limit=100&sort=name")).j, p3 = (await LP("leads?limit=100&sort=name&page=3")).j;
ok(p1.total === 250 && p1.leads.length === 100 && p1.page === 1 && p1.pages === 3 && p1.per === 100, "page 1 of 3, 100 leads per page");
ok(p3.leads.length === 50 && p3.page === 3, "last page has the remaining 50");
const ids = new Set(); for (let pg = 1; pg <= 3; pg++) (await LP("leads?limit=100&sort=name&page=" + pg)).j.leads.forEach((l) => ids.add(l.id));
ok(ids.size === 250, "every lead appears exactly once across the pages");
ok((await LP("leads?limit=100&page=99")).j.leads.length === 0, "a page past the end is empty, not an error");

/* sent marks */
const OR = await import("../functions/_lib/outreach.js"); const cm = await OR.cmDb(env);
X("INSERT INTO cm_sends (id,at,email,type,subject,status,test) VALUES ('s1','2026-11-27T10:00:00Z','client1@shop1.in','client','Hi','sent',0)");
X("INSERT INTO cm_sends (id,at,email,type,subject,status,test) VALUES ('s2','2026-11-27T10:00:00Z','client2@shop2.in','client','Hi','sent',1)");
X("INSERT INTO cm_sends (id,at,email,type,subject,status,test) VALUES ('s3','2026-11-27T10:00:00Z','client3@shop3.in','client','Hi','failed',0)");
const PI = await import("../functions/_lib/pitch.js"); try { await PI.loadRecipients(env, "none", { csv: "" }); } catch (e) {}
try { X("CREATE TABLE IF NOT EXISTS cm_pitch_rcpt (campaign_id TEXT, email TEXT, name TEXT, business TEXT, city TEXT, status TEXT, override INTEGER DEFAULT 0, send_id TEXT, provider_id TEXT, error TEXT, at TEXT, PRIMARY KEY (campaign_id, email))"); } catch (e) {}
X("INSERT INTO cm_pitch_rcpt (campaign_id,email,status,at) VALUES ('c1','CLIENT4@shop4.in','sent','2026-11-28T09:00:00Z')");
KV.delete("li:sentsync");
const all = (await LP("leads?limit=300&sort=name")).j.leads, by = (e) => all.find((l) => l.email === e);
ok(by("client1@shop1.in").sent_at && by("client1@shop1.in").sent_via === "Email" && by("client1@shop1.in").status === "email_sent", "an email sent from Client emails shows Sent and moves the lead to Email sent");
ok(by("client4@shop4.in").sent_via === "Bulk pitch" && by("client4@shop4.in").status === "email_sent", "Bulk pitch sends count (email matched without case)");
ok(!by("client2@shop2.in").sent_at && by("client2@shop2.in").status === "not_contacted", "test sends do not count");
ok(!by("client3@shop3.in").sent_at && by("client3@shop3.in").status === "not_contacted", "failed sends do not count");
ok((await LP("leads?status=email_sent&limit=50")).j.total === 2, "Status filter Email sent finds them");

/* email check across all leads (not only one database) */
globalThis.fetch = ((orig) => async (u, o) => { if (/cloudflare-dns\.com/.test(String(u))) return Response.json({ Answer: [{ type: 15, data: "10 mx" }] }); return orig(u, o); })(globalThis.fetch);
X("INSERT INTO li_businesses (id,name,email,source,status,archived,created_at,updated_at) VALUES ('LI-SRCH1','Search Find','noreply@found.in','google_places','new',0,'2026','2026')");
let r, steps = 0; do { r = (await LP("email-check", {})).j; steps++; } while (r.ok && !r.done && steps < 10);
ok(r.ok && r.done && q1("SELECT email_check c FROM li_businesses WHERE id='LI-SRCH1'").c === "invalid", "Check emails covers leads found by search too");

const AJ2 = fs.readFileSync("js/admin.js", "utf8");
ok(/function \(j\) \{\s*var o = ""; for \(var p = 1; p <= j\.pages/.test(AJ2) || /var lpager = function/.test(AJ2), "pager in the list");
ok(/limit: 100/.test(AJ2) && /data-pg=/.test(AJ2) && /lq-pg/.test(AJ2) && /delete q\.page/.test(AJ2), "100 per page, previous / next / go to page, filters go back to page 1");
ok(/Sent ' \+ esc\(date\(x\.sent_at\)\)/.test(AJ2) && /id="lq-eck">Check emails/.test(AJ2) && /fodo-li-eck/.test(AJ2), "Sent mark in Status, Check emails button, quiet check once per visit");

console.log("\nv55.32 leads pages: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
