// v55 Admin ▸ Lead Intelligence: access, discovery (Google Places + OSM fallback), filters, de-duplication, website research,
// contacts with sources, founder confidence, audit, opportunities, explainable score, edit/status/bulk, exports, drafts, jobs, integrations.
// Every outside service is mocked (no real network). Run: node --no-warnings tests/v55-lead-intel.test.mjs
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as adminApi } from "../functions/api/admin/[[path]].js";


import * as LI from "../functions/_lib/leadintel.js";
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
let placesCalls = 0, placesDown = false, serperOn = true, calls = [];
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

/* access */
ok((await LP("stats", undefined, "x")).status === 403 && (await LP("stats", undefined, "v")).status === 403 && (await LP("search", { industry: "Dental clinics", city: "Delhi" }, "v")).status === 403, "only owners and Full-control admins can open or use Lead Intelligence");
const st0 = (await LP("stats", undefined, "adm")).j; ok(st0.ok && st0.totals.discovered === 0 && st0.statuses.length === 12, "empty dashboard shows real zeros; 12 outreach statuses");

/* integrations: honest status */
let ig = (await LP("integrations")).j; const gi = (k) => ig.items.find((x) => x.key === k);
ok(gi("google_places").configured === false && gi("search").configured === false && gi("email_validation").configured === false && gi("openstreetmap").configured === true && !JSON.stringify(ig).match(/re_test|secret_value/), "integrations show not-configured APIs as not configured; no keys sent to the browser");
ok((await LP("test/google_places", {})).j.ok === false, "testing an unconfigured API reports failure, not success");

/* validation */
ok((await LP("search", { city: "Delhi" })).status === 400 && (await LP("search", { industry: "Dental clinics" })).status === 400, "a search needs an industry/keywords and a place");

/* discovery with Google Places */
env.GOOGLE_PLACES_KEY = "gp_test"; env.SERPER_API_KEY = "sp_test";
const s1 = (await LP("search", { industry: "Dental clinics", sub_industry: "dentist", city: "New Delhi", locality: "Dwarka", limit: 10 })).j;
ok(s1.ok && s1.source === "google_places" && s1.found === 3 && s1.added.length === 2 && s1.filtered === 1 && placesCalls === 1, "Google Places discovery: 3 found, the permanently closed one filtered out, 2 saved");
const lid = s1.added.find((x) => x.name === "Smile Dental Clinic").id, lid2 = s1.added.find((x) => x.name === "Bright Teeth Care").id;
ok(/^LI-[A-Z0-9]{8}$/.test(lid), "unique lead IDs");
const s2 = (await LP("search", { industry: "Dental clinics", sub_industry: "dentist", city: "New Delhi", locality: "Dwarka", limit: 10 })).j;
ok(s2.added.length === 0 && s2.duplicates.length === 2 && q1("SELECT COUNT(*) AS n FROM li_businesses").n === 2, "running the same search again adds no duplicates");
ok(LI.nameKey("Smile Dental Clinic Pvt Ltd", "New Delhi") === LI.nameKey("smile dental clinic", "new delhi") && LI.phoneKey("+91 98000 00001") === LI.phoneKey("098000 00001") && LI.siteDomain("https://www.smiledental.in/x") === "smiledental.in" && LI.siteDomain("https://facebook.com/x") === "", "dedupe keys: name+city, phone, website domain (social links are not a domain)");
const s3 = (await LP("search", { industry: "Dental clinics", city: "New Delhi", website: "none", limit: 10 })).j;
ok(s3.added.length === 0 && s3.filtered >= 2, "website filter: businesses with a website are left out of a 'no website' search");
ok((await LP("search", { industry: "Dental clinics", city: "New Delhi", size: "large", limit: 10 })).j.filtered === 3, "size filter uses review counts; nothing is assumed");

/* OSM fallback + transparent errors */
placesDown = true; const s4 = (await LP("search", { industry: "Cafe", city: "Dwarka", limit: 5 })).j; placesDown = false;
ok(s4.ok && s4.errors.some((e) => /Google Places: google 403/.test(e)) && s4.added.length === 0, "API error shown transparently (Google 403), no fake results");
ok((await LP("jobs")).j.runs.length >= 5 && (await LP("activity")).j.items.some((x) => x.kind === "error"), "every search is logged with its errors");

/* research */
const r1 = (await LP("research/" + lid, {})).j;
ok(r1.ok && r1.lead.researched_at && calls.every((u) => !/linkedin\.com/.test(u)), "research runs on the official website; LinkedIn is never fetched");
const C = (k) => r1.contacts.filter((c) => c.kind === k);
ok(C("email").map((c) => c.value).sort().join() === "info@smiledental.in,sales@smiledental.in" && C("email").every((c) => /official website/.test(c.status) && /MX found/.test(c.status) && /contact-us/.test(c.source_url)), "emails only from the website, with source page and MX result (logo@2x.png ignored)");
ok(C("email").find((c) => c.value === "sales@smiledental.in").label === "Sales email" && C("email").find((c) => c.value === "info@smiledental.in").label === "General enquiry email", "emails classified (sales / general enquiry)");
ok(C("whatsapp")[0].value === "https://wa.me/919800000001" && C("instagram")[0].value === "https://www.instagram.com/smiledentaldwarka/" && C("maps").length === 1 && C("website").length === 1, "WhatsApp, Instagram, Maps and website saved with sources");
ok(!JSON.stringify(r1.contacts).match(/verified mailbox|"verified"/), "no email is ever called verified");
const P = r1.people; const priya = P.find((p) => /Priya Sharma/.test(p.name));
ok(priya && priya.confidence === "verified" && /founder/i.test(priya.role) && /smiledental\.in\/about/.test(priya.source_url), "founder found on the official website = Verified, with source URL");
ok(P.some((p) => p.name === "Rahul Verma" && p.confidence === "unverified" && /linkedin\.com\/in\//.test(p.profile_url)), "a LinkedIn link on the site without a role = Unverified");
ok(!P.some((p) => /Our Team|Smile Dental/.test(p.name)), "headings are not mistaken for people");
const A = r1.audit.checks;
ok(A.reachable && A.https && A.viewport && A.contact_form === true && A.socials.indexOf("instagram") > -1 && A.whatsapp_link && A.copyright_year === 2019 && A.broken_links.some((x) => /missing-page/.test(x)), "audit: HTTPS, viewport, contact form on the contact page, socials, WhatsApp, old copyright, broken link found");
ok(r1.audit.checks.findings.some((f) => /broken link/.test(f[1])) && r1.audit.ai_summary && /Hypothesis/.test(r1.audit.ai_summary) && r1.audit.ai_model, "findings listed; AI summary stored separately and labelled with its model");
ok(!r1.contacts.some((c) => c.kind === "linkedin" && /\/in\//.test(c.value)), "a personal LinkedIn profile is not saved as the business LinkedIn");
ok(r1.opportunities.length && r1.opportunities.every((o) => o.kind === "observed" && o.evidence && o.why && o.angle) && r1.opportunities.some((o) => /no ad tracking/i.test(o.problem) && /does not prove/.test(o.evidence)), "opportunities have problem, evidence, why, angle; no claim that they run ads");
const sc = r1.score; ok(sc.parts.length === 8 && sc.parts.reduce((s, p) => s + p.points, 0) === sc.total && sc.parts.every((p) => p.points <= p.max && p.evidence) && sc.parts.reduce((s, p) => s + p.max, 0) === 100, "score = sum of 8 evidenced parts, max 100");
ok(sc.parts.find((p) => p.key === "people").points === 10 && sc.parts.find((p) => p.key === "active").points === 15, "verified founder = 10/10; 212 reviews at 4.6 operational = 15/15");
ok(r1.lead.priority === LI.PRIORITY(r1.lead.score) && /Priya Sharma/.test(r1.lead.owner_name) && r1.people.filter((p) => /Priya Sharma/.test(p.name)).length === 1 && r1.lead.email && r1.lead.status === "not_contacted", "lead row updated: score, priority, owner, email, status");
const r2 = (await LP("research/" + lid2, {})).j;
ok(r2.people.length === 1 && r2.people[0].name === "Amit Kumar" && r2.people[0].confidence === "partial" && /linkedin\.com\/in\//.test(r2.people[0].profile_url), "no website: founder from a public search result that names the business = Partially verified (other company's CEO ignored)");
ok(r2.score.parts.find((p) => p.key === "seo").evidence.indexOf("No website") === 0 && r2.score.parts.find((p) => p.key === "ads").points === 0 && r2.score.parts.find((p) => p.key === "gaps").points === 0, "missing data scores 0 'not checked', never a guess");
ok(LI.scoreLead({ name: "X", website: "" }, null, [], [], {}).total <= 35, "a business we know nothing about cannot score high");

const PX = LI.peopleIn("<p>care near you.Led by Dr. Chhavi Bajaj, we combine</p><p>Dr. Chhavi Bajaj, BDS, MHA,</p><p>Family Dental is led by Dr. Mahima Yadav. The clinic</p><p>Dr. Rohan Mehta (MDS)</p><p>Read More by Our Team</p>", "https://x.in/");
ok(PX.length === 3 && PX[0].confidence === "verified" && /Chhavi Bajaj/.test(PX[0].name) && PX.some((p) => /Mahima Yadav/.test(p.name) && p.confidence === "verified") && PX.some((p) => /Rohan Mehta/.test(p.name) && p.confidence === "unverified" && /ownership not stated/.test(p.role)), "'led by Dr. X' = verified head; 'Dr. X, MDS' alone = unverified (ownership not stated); no duplicates");
const ER = LI.emailsInResults({ web: [
  { title: "Dental Paradise Dwarka contact", url: "https://www.justdial.com/x", description: "Dental Paradise, Sector 6 Dwarka. Email: dentalparadise.dwarka@gmail.com" },
  { title: "Dental Paradise Dwarka", url: "https://y.in", description: "Dental Paradise Dwarka, write to info@ayushmandental.com or hello@paradisedentalsmiles.com" },
  { title: "Contact", url: "https://z.in", description: "reach us at hello@dentalparadise.co.in or name@example.com" } ] }, { name: "Dental Paradise, Dwarka", website: "https://dentalparadise.co.in/", locality: "Dwarka" });
ok(ER.length === 2 && ER.some((e) => e.email === "hello@dentalparadise.co.in" && /own domain/.test(e.status)) && ER.some((e) => e.email === "dentalparadise.dwarka@gmail.com" && /justdial/.test(e.source)) && !ER.some((e) => /ayushman|example|paradisedentalsmiles/.test(e.email)), "emails from search must carry the business name; another clinic's email in the same snippet is not taken");
ok(LI.emailsInResults({ web: [{ title: "Dwarka Dental", url: "https://ig.com/x", description: "Dwarka Dental clinic info@ayushmandental.com" }] }, { name: "Dwarka Dental - RCT in Dwarka", locality: "Dwarka" }).length === 0 && LI.emailsInResults({ web: [{ title: "DWARKA DENTAL CLINIC", url: "https://g.com", description: "sanju@certyogi.com" }] }, { name: "DWARKA DENTAL CLINIC", website: "https://certyogi.com/x", locality: "Dwarka" }).length === 0, "a name made of generic words, or a directory site listed as the website, never yields an email");
/* list, filters, edit, status, bulk, dupes */
let L = (await LP("leads?sort=score")).j; ok(L.total === 2 && L.leads[0].score >= L.leads[1].score, "All leads sorted by score");
ok((await LP("leads?q=priya")).j.total === 1 && (await LP("leads?website=none")).j.total === 1 && (await LP("leads?people=verified")).j.total === 1, "search and filters work (owner name, website, founder confidence)");
const ed = (await LP("lead/" + lid, { status: "email_sent", note: "sent intro", channel: "email", notes: "<b>Call back Monday</b>" })).j;
ok(ed.lead.status === "email_sent" && ed.lead.notes === "Call back Monday" && ed.history[0].to_status === "email_sent", "status change logged in outreach history; HTML stripped from notes");
ok((await LP("lead/" + lid, { status: "made_up" })).status === 400, "unknown status refused");
ok((await LP("bulk", { ids: [lid2], action: "archive" })).j.changed === 1 && (await LP("leads")).j.total === 1 && (await LP("leads?archived=1")).j.total === 1, "bulk archive");
await LP("bulk", { ids: [lid2], action: "unarchive" });
ok((await LP("duplicates")).j.groups.length === 0, "duplicate report finds none");

/* exports */
const ex = (await LP("export?ids=" + lid)).j; ok(ex.rows.length === 1 && ex.rows[0]["Lead ID"] === lid && /info@smiledental\.in/.test(ex.rows[0].Email) && ex.rows[0].Priority && ex.rows[0]["Recommended services"], "export rows with all lead columns");

/* outreach drafts */
const dr = (await LP("drafts/" + lid, { channel: "email" })).j; ok(dr.ok && dr.ai && /Subject:/.test(dr.text), "AI outreach draft (labelled AI), not sent");
const AIb = env.AI; env.AI = undefined; const dt = (await LP("drafts/" + lid, { channel: "whatsapp" })).j; env.AI = AIb;
ok(dt.ok && dt.template && /Anmol from FODO/.test(dt.text) && !/\bfree\b/i.test(dt.text) && !/—/.test(dt.text), "without AI a clearly marked template is used");
/* outreach desk */
ok(LI.waNumber("+91 98000 00001") === "919800000001" && LI.waNumber("098000 00001") === "919800000001" && LI.waNumber("011 4000 0002") === "" && LI.waNumber("https://wa.me/919800000001") === "919800000001", "WhatsApp numbers: Indian mobiles only, landlines skipped");
X("UPDATE li_businesses SET status='not_contacted' WHERE id=?", lid2);
const lj = (await LP("lead/" + lid2)).j;
ok(lj.channels.some((c) => c.channel === "linkedin" && /amit-kumar/.test(c.target)) && !lj.channels.some((c) => c.channel === "whatsapp"), "channels come only from found contacts (partial founder LinkedIn yes, landline gives no WhatsApp)");
const lj1 = (await LP("lead/" + lid)).j;
ok(lj1.channels[0].channel === "whatsapp" && lj1.channels[0].target === "919800000001" && lj1.channels.some((c) => c.channel === "instagram"), "WhatsApp first, then email and socials");
const dm = (await LP("drafts/" + lid2, { channel: "dm" })).j; ok(dm.ok && dm.text, "Instagram/Facebook DM drafts");
const s1x = (await LP("sent/" + lid2, { channel: "linkedin" })).j;
ok(s1x.ok && s1x.lead.status === "contacted" && s1x.history[0].channel === "linkedin", "marking a message as sent logs the channel and moves Not contacted to Contacted");
ok((await LP("sent/" + lid2, { channel: "pigeon" })).status === 400, "unknown channel refused");
X("CREATE TABLE IF NOT EXISTS fodo_leads (id TEXT PRIMARY KEY, mode TEXT, name TEXT, email TEXT, phone TEXT, business TEXT, data TEXT, page TEXT, source TEXT, campaign TEXT, status TEXT, notes TEXT, ip_hash TEXT, created_at TEXT, updated_at TEXT)");
X("INSERT INTO fodo_leads (id, name, phone, source, status, created_at) VALUES ('ld_t1','Amit','+91-11-4000-0002','instagram-dm','new','2026-11-23T10:00:00Z')");
ok((await LP("lead/" + lid2)).j.replies.length === 1, "a reply / enquiry with the same phone shows on the lead");
await LP("lead/" + lid2, { status: "dnc" }); ok((await LP("drafts/" + lid2, {})).status === 409, "Do not contact: no drafts");
X("INSERT INTO camp_unsub (email, at, why) VALUES ('info@smiledental.in','2026-01-01','test')");
ok((await LP("lead/" + lid)).j.opted_out === true && (await LP("drafts/" + lid, {})).status === 409, "an opted-out email blocks drafts too");

/* saved / scheduled searches */
const jb = (await LP("jobs/save", { name: "Dwarka dentists", schedule: "daily", filters: { industry: "Dental clinics", city: "New Delhi", locality: "Dwarka" } })).j;
ok(jb.ok && jb.job.schedule === "daily" && jb.job.next_run, "daily saved search scheduled");
X("UPDATE li_jobs SET next_run='2020-01-01T00:00:00Z'"); const due = await LI.runDue(env, 1);
ok(due.length === 1 && due[0].added === 0 && q1("SELECT next_run FROM li_jobs").next_run > "2026", "the scheduler runs due searches once and re-schedules; duplicates not re-imported");

/* dashboard numbers are real */
const st = (await LP("stats")).j; ok(st.totals.discovered === 2 && st.totals.researched === 2 && st.totals.founders === 2 && st.totals.founders_verified === 1 && st.by_industry[0].k === "Dental clinics" && st.by_source[0].k === "google_places", "dashboard counts come from the database");
ig = (await LP("integrations")).j; ok(gi("google_places").configured && gi("google_places").usage.calls >= 3 && gi("search").usage.calls >= 1, "integration usage counted");
ok((await LP("test/ai", {})).j.ok === true && (await LP("test/dns_mx", {})).j.ok === true, "integration tests call the real adapters (mocked here)");

/* existing admin unaffected */
ok((await call("admin/outreach", undefined, "o")).status === 200 && (await call("admin/pitch", undefined, "o")).status === 200, "Client Emails and Bulk pitch still work");
const AJ = fs.readFileSync("js/admin.js", "utf8");
ok(/"Lead Intelligence"/.test(AJ) && /li-find/.test(AJ) && /li-leads/.test(AJ) && /li-settings/.test(AJ), "Admin has the Lead Intelligence group with its pages");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
