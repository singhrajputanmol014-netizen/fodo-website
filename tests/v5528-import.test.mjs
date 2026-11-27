// v55.28 Lead Intelligence: import your own client data (Excel / CSV / paste) as ordinary leads, then message / email them like any lead.
// Run: node --no-warnings tests/v5528-import.test.mjs
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

/* column mapping */
const M = LI.importMap(["Company Name", "Contact Person", "Designation", "E-mail ID", "Mobile No", "WhatsApp", "Website", "City", "Area", "Category", "Remarks"]);
ok(M.business === 0 && M.person === 1 && M.role === 2 && M.email === 3 && M.phone === 4 && M.whatsapp === 5 && M.website === 6 && M.city === 7 && M.locality === 8 && M.industry === 9 && M.notes === 10, "headers are recognised in common spellings");
const M2 = LI.importMap(["Name", "Email"]); ok(M2.business === 0 && M2.person == null, "a lone Name column is the business");
const M3 = LI.importMap(["Business", "Name", "Phone"]); ok(M3.business === 0 && M3.person === 1, "Name next to Business is the contact person");

/* preview: CSV text, pasted tab rows, Excel; nothing saved */
const CSV = "Business name,Contact person,Designation,Email,Phone,Website,City,Industry,Notes\n" +
  "Kumar Interiors,Ravi Kumar,Owner,Ravi@KumarInteriors.in,+91 98110 00011,kumarinteriors.in,New Delhi,Interior design,Old client 2024\n" +
  "Nova Gym,,,,98110 00022,,Gurugram,Gyms,\n" +
  "No Contact Cafe,,,,,,Noida,Restaurants,\n" +
  "Bad Mail Co,Someone,,not-an-email,,,Delhi,,\n" +
  "\"Sharma & Sons, Traders\",Anil Sharma,Partner,anil@sharmasons.com,,,Delhi,,\"Likes calls, not emails\"";
ok((await LP("import-preview", { text: CSV }, "v")).status === 403, "viewers cannot import");
const pv = (await LP("import-preview", { text: CSV })).j;
ok(pv.ok && pv.total === 5 && pv.ok === 3 && pv.invalid === 2 && pv.fields.business === "Business name" && pv.fields.email === "Email", "preview: 3 ready, 2 skipped, mapped columns shown " + JSON.stringify([pv.total, pv.ok, pv.invalid]));
ok(pv.rows[0].email === "ravi@kumarinteriors.in" && pv.rows[0].website === "https://kumarinteriors.in" && pv.rows[4].name === "Sharma & Sons, Traders" && pv.rows[4].notes === "Likes calls, not emails", "emails lower-cased, bare domains get https, quoted commas kept");
ok(/No email, phone or website/.test(pv.rows[2].error) && /Email looks wrong/.test(pv.rows[3].error), "reasons for skipped rows");
ok(q1("SELECT COUNT(*) n FROM li_businesses").n === 0, "preview saves nothing");
const tabbed = (await LP("import-preview", { text: "Company\tEmail\tPhone\nTab Co\ttab@tabco.in\t9811000033" })).j; ok(tabbed.ok && tabbed.rows[0].name === "Tab Co" && tabbed.rows[0].email === "tab@tabco.in", "rows pasted from Excel / Google Sheets (tabs) work");
ok((await LP("import-preview", { text: "Foo,Bar\n1,2" })).status === 400, "a sheet without name / contact columns is refused with a reason");
const CM = await import("../functions/_lib/campaigns.js");
ok(typeof CM.readSheet === "function", "Excel files are read by the same reader as Email campaigns");

/* import */
const good = pv.rows.filter((r) => !r.error);
const im = (await LP("import", { rows: good, status: "not_contacted", tag: "Old clients 2024", update: true })).j;
ok(im.ok && im.added.length === 3 && im.updated.length === 0 && im.skipped.length === 0, "3 clients imported");
const kid = im.added[0].id, K = (await LP("lead/" + kid)).j;
ok(K.lead.source === "import" && K.lead.source_ref === "Old clients 2024" && K.lead.status === "not_contacted" && K.lead.owner_name === "Ravi Kumar" && K.lead.owner_conf === "provided" && K.lead.email === "ravi@kumarinteriors.in", "imported lead keeps source, list name, status and contact person");
ok(K.people[0].name === "Ravi Kumar" && K.people[0].confidence === "provided" && /own client data/.test(K.people[0].evidence), "contact person shown as From your data, never as verified");
ok(K.channels.some((c) => c.channel === "email" && c.target === "ravi@kumarinteriors.in") && K.channels.some((c) => c.channel === "whatsapp" && c.target === "919811000011"), "email and WhatsApp channels are ready on the imported lead");
ok(K.history[0] && K.history[0].channel === "import", "the import is in the lead's history");
const lst = (await LP("leads?source=import")).j; ok(lst.total === 3 && lst.leads.every((l) => l.source === "import"), "Source filter: Imported client data");
const dupe = (await LP("import", { rows: [Object.assign({}, good[0], { name: "Kumar Interiors Pvt Ltd", person: "", notes: "Second sheet" })], update: false })).j;
ok(dupe.added.length === 0 && dupe.skipped.length === 1 && /Already in Lead Intelligence/.test(dupe.skipped[0].reason), "same email again is not doubled (skip when not updating)");
const upd = (await LP("import", { rows: [{ name: "Nova Gym", phone: "9811000022", email: "hello@novagym.in", person: "Sunita", role: "Manager", city: "Gurugram" }], update: true })).j;
const NV = (await LP("lead/" + upd.updated[0].id)).j;
ok(upd.updated.length === 1 && NV.lead.email === "hello@novagym.in" && NV.lead.owner_name === "Sunita" && NV.contacts.some((c) => c.kind === "email"), "same phone again fills in the missing email and contact person");
ok((await LP("import", { rows: [{ name: "x" }] })).j.skipped.length === 1, "server checks rows again (no contact → skipped)");
ok((await LP("import", { rows: [] })).status === 400, "empty import refused");

/* message / mail like any lead */
const dr = (await LP("drafts/" + kid, { channel: "whatsapp" })).j; ok(dr.ok && (dr.text || dr.message || dr.body || dr.blocks), "WhatsApp draft works for an imported client");
const ed = (await LP("drafts/" + kid, { channel: "email" })).j; ok(ed.ok && ed.subject, "email draft works for an imported client");
const pr = (await LP("email-preview/" + kid, { subject: ed.subject, blocks: ed.blocks })).j; ok(pr.ok && pr.to === "ravi@kumarinteriors.in", "email preview goes to the imported email");
const ts = (await LP("email-send/" + kid, { subject: ed.subject, blocks: ed.blocks, test: true })).j; ok(ts.ok && ts.sent.to === "anmol@fodo.co.in", "test email to the admin works");
const rs = (await LP("email-send/" + kid, { subject: ed.subject, blocks: ed.blocks, confirm: true })).j; ok(rs.ok && rs.sent.to === "ravi@kumarinteriors.in" && rs.lead.status === "email_sent", "confirmed email to an imported client is sent and logged");
X("INSERT OR IGNORE INTO camp_unsub (email, at, why) VALUES ('anil@sharmasons.com','2026-11-27','test')");
const sid = im.added.find((a) => /Sharma/.test(a.name)).id, se = (await LP("drafts/" + sid, { channel: "email" })).j;
ok((await LP("email-send/" + sid, { subject: se.subject, blocks: se.blocks, confirm: true })).status === 409, "unsubscribed imported emails are still blocked");

/* admin UI */
const AJ = fs.readFileSync("js/admin.js", "utf8");
ok(/"li-leads", "Leads & clients"/.test(AJ) && !/"All leads"/.test(AJ), "page renamed to Leads & clients");
ok(/id="lq-imp">Import client data/.test(AJ) && /li\/import-preview/.test(AJ) && /rows\.slice\(i, i \+ 40\)/.test(AJ) && /Download template/.test(AJ), "Import client data panel: file / paste, preview, chunked import, template");
ok(/provided: \["From your data"/.test(AJ) && /Imported client data/.test(AJ), "From your data badge and Source filter in the list");
ok(!/onclick=|onchange=/.test(AJ.slice(AJ.indexOf("function liImport"), AJ.indexOf("function liExport"))), "no inline handlers (CSP)");

console.log("\nv55.28 import: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
