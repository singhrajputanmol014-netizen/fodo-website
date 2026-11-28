// v55.30 FODO services email template (email-only clients) + company profile PDF + email-only import names.
// Run: node --no-warnings tests/v5530-services-mail.test.mjs
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

/* email-only rows get sensible names */
const ipv = (await LP("import-preview", { text: "Email\nrahul.sharma@gmail.com\nrk1987@gmail.com\nhello@greenleafcafe.in\nPRIYA_VERMA@Yahoo.co.in" })).j;
ok(ipv.ok && ipv.ok === 4, "a sheet with only an Email column imports");
ok(ipv.rows[0].name === "Rahul Sharma" && ipv.rows[0].person === "Rahul Sharma", "gmail name.surname becomes the contact person " + JSON.stringify(ipv.rows[0].name));
ok(ipv.rows[1].name === "rk1987" && !ipv.rows[1].person, "a gmail id that is not a name stays as it is, no made-up person");
ok(ipv.rows[2].name === "Greenleafcafe" && !ipv.rows[2].person, "a company email uses the company domain as the business");
ok(ipv.rows[3].name === "Priya Verma", "yahoo.co.in and upper case handled");
const im2 = (await LP("import", { rows: ipv.rows, tag: "Email only list", update: false })).j; ok(im2.added.length === 4, "4 email-only clients imported");
const [rahul, rk, green] = im2.added.map((a) => a.id);

/* greetings */
ok(LI.greetOf({ owner_name: "Rahul Sharma", owner_conf: "provided", name: "Rahul Sharma" }).hi === "Hi Rahul", "known person: Hi first name");
ok(LI.greetOf({ owner_name: "Dr. Neha Gupta", owner_conf: "verified" }).hi === "Hi Neha", "titles dropped");
ok(LI.greetOf({ name: "Greenleafcafe" }).hi === "Hi Greenleafcafe team", "business only: Hi <business> team");
ok(LI.greetOf({ name: "rk1987" }).hi === "Hello", "id-like names: plain Hello");
ok(LI.greetOf({ owner_name: "Amit", owner_conf: "unverified", name: "X Co" }).hi === "Hi X Co team", "unverified people are not used in the greeting");

/* drafts: services template */
const s1 = (await LP("drafts/" + rahul, { channel: "email", template: "services" })).j;
ok(s1.ok && s1.template === "services" && s1.to === "rahul.sharma@gmail.com" && /^Rahul, one team/.test(s1.subject) && /^Hi Rahul,/.test(s1.blocks.intro), "services email for Rahul: subject and greeting use his name");
ok(s1.blocks.services.split("\n").length === 6 && /fodo\.co\.in/.test(s1.blocks.mid_link) && /utm_campaign=services_pitch/.test(s1.blocks.mid_link) && /wa\.me\/917827007676/.test(s1.blocks.cta_link), "6 services, website button (with UTM) and WhatsApp call button");
ok(!/\bfree\b/i.test(JSON.stringify(s1.blocks)) && !/—/.test(JSON.stringify(s1.blocks)) && !/\bsmall\b/i.test(JSON.stringify(s1.blocks)), "no 'free', no long dash, never 'small'");
ok(!/\d+%|\d+x|clients served|years/i.test(s1.blocks.stats.replace("30 | Services", "")), "no invented numbers (only the real 30 services)");
const s2 = (await LP("drafts/" + rk, { channel: "email", template: "services" })).j; ok(/^Hello,/.test(s2.blocks.intro) && /^One team/.test(s2.subject) && /take off your plate:/.test(s2.blocks.intro), "no name: Hello, no made-up business");
const s3 = (await LP("drafts/" + green, { channel: "email", template: "services" })).j; ok(/^Hi Greenleafcafe team,/.test(s3.blocks.intro) && /at Greenleafcafe:/.test(s3.blocks.intro), "company email: Hi <business> team");
const s4 = (await LP("drafts/" + green, { channel: "email" })).j; ok(s4.ok && s4.template !== "services" && s4.blocks.headline, "the research email still works (the other option)");

/* rendered email: website button in the middle, services grid, PDF card */
const PDF2 = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF").toString("base64");
const up2 = (await LP("file", { file: PDF2, name: "FODO Company Profile.pdf", mime: "application/pdf" })).j; ok(up2.ok, "company profile uploaded");
ok((await LP("profile-pdf")).j.file === null, "no company profile saved yet");
ok((await LP("profile-pdf", { set: { id: "x1", name: "y" } })).status === 400, "only an uploaded file can be the company profile");
const sp = (await LP("profile-pdf", { set: up2.file })).j; ok(sp.ok && sp.file.name === "FODO Company Profile.pdf", "saved as the company profile");
ok((await LP("profile-pdf")).j.file.id === up2.file.id, "company profile is remembered");
ok((await LP("profile-pdf", undefined, "v")).status === 403, "viewers cannot read it");
const prv = (await LP("email-preview/" + rahul, { subject: s1.subject, blocks: s1.blocks, attachments: [up2.file.id] })).j;
const H = prv.html, iSvc = H.indexOf("Performance ads"), iMid = H.indexOf("See our work on fodo.co.in"), iCta = H.indexOf("Book a 15-minute call");
ok(prv.ok && prv.to === "rahul.sharma@gmail.com" && iSvc > 0 && iMid > iSvc && iCta > iMid, "preview: services, then the website button in the middle, then the call button");
ok(/Don(&#39;|')t let your brand/.test(H) && /FODO Company Profile\.pdf/.test(H) && /Unsubscribe/.test(H) && /Hi Rahul,/.test(H), "brand headline, PDF card, unsubscribe, personal greeting");
ok(/utm_campaign=services_pitch/.test(H), "website button carries campaign tracking");
const ts2 = (await LP("email-send/" + rahul, { subject: s1.subject, blocks: s1.blocks, attachments: [up2.file.id], test: true })).j;
const last = mails[mails.length - 1];
ok(ts2.ok && ts2.sent.to === "anmol@fodo.co.in" && last && /\[TEST\]/.test(last.subject) && (last.attachments || []).some((a) => /Company Profile/.test(a.filename)), "test email to the admin carries the PDF");
const rs2 = (await LP("email-send/" + rahul, { subject: s1.subject, blocks: s1.blocks, attachments: [up2.file.id], confirm: true })).j;
ok(rs2.ok && rs2.sent.to === "rahul.sharma@gmail.com" && rs2.lead.status === "email_sent", "real send to the imported client, logged on the lead");
const T2 = await import("../functions/_lib/clientmail.js"); const plain = T2.renderMail({ subject: "x", blocks: s1.blocks }).text;
ok(/See our work on fodo\.co\.in: https:\/\/www\.fodo\.co\.in/.test(plain) && /- Performance ads: /.test(plain), "plain-text version has the services and the website link");
ok((await LP("profile-pdf", { clear: true })).j.file === null, "company profile can be changed");

/* admin UI */
const AJ2 = fs.readFileSync("js/admin.js", "utf8");
ok(/Personalised from research/.test(AJ2) && /FODO services template/.test(AJ2) && /data-tpl/.test(AJ2), "email type switch on the client page");
ok(/!x\.website && !x\.researched_at \? "services"/.test(AJ2), "clients without a website or research open on the services template");
ok(/📌 Attach file/.test(AJ2) && /li\/always-files/.test(AJ2), "company profile PDF saved once and attached automatically (v55.33: every-email files)");
ok(/services: g\("services"\), mid_text: g\("mid_text"\), mid_link: g\("mid_link"\)/.test(AJ2), "editor sends services and the middle button");

console.log("\nv55.30 services mail: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
