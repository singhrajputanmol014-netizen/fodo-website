// v55.31 email list cleaning: spam / invalid / test / Never-email list before any marketing email.
// Run: node --no-warnings tests/v5531-email-check.test.mjs
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

/* verdicts (no network) */
const W = LI.DEFAULT_BLOCK, V = (e, n) => (LI.emailVerdict(e, n || "", W) || ["mx"])[0];
ok(JSON.stringify(W) === JSON.stringify(["quickads", "88ventures", "brandbooster"]), "Never-email list starts with quickads, 88ventures, brandbooster");
ok(V("design.quickads@gmail.com") === "blocked" && V("contact9business+quickads@gmail.com") === "blocked" && V("demo@quickads.com") === "blocked", "quickads emails are spam");
ok(V("hello@88ventures.com") === "blocked" && V("team@brandbooster.ai") === "blocked" && V("someone@gmail.com", "Brand Booster team") === "blocked", "88ventures and Brandbooster (in the email or the name) are spam");
ok(V("2024.quickads@gmail.com", "ㅤ") === "blocked", "invisible-character names do not hide a blocked word");
ok(V("not an email") === "invalid" && V("a..b@gmail.com") === "invalid" && V("x@y") === "invalid", "broken addresses are invalid");
ok(V("abc@gmail.com") === "invalid" && V("a@gmail.com") === "invalid", "Gmail addresses shorter than 6 characters are invalid");
ok(V("someone@mailinator.com") === "invalid" && V("x123456@yopmail.com") === "invalid", "throwaway inbox services are invalid");
ok(V("noreply@company.in") === "invalid" && V("no-reply@company.in") === "invalid" && V("mailer-daemon@x.com") === "invalid", "no-reply / system addresses are invalid");
ok(V("test123@gmail.com") === "test" && V("demo.account@gmail.com") === "test" && V("rahul.test@company.in") === "test" && V("aaaaaaa@gmail.com") === "test", "test / demo / made-up accounts are flagged");
ok(V("hr@company.in") === "risky" && V("rahul.sharma+promo@gmail.com") === "risky", "role inboxes and + aliases are risky, not blocked");
ok(V("rahul.sharma@gmail.com") === "mx" && V("anita@greenleafcafe.in") === "mx", "normal addresses go on to the mail-server check");
ok(V("contest.winner@gmail.com") === "mx" && V("latest.news@company.in") === "mx", "'test' inside a real word is not flagged");

/* import + check */
const CSV = "Email,Name\n" + ["rahul.sharma@gmail.com", "anita@greenleafcafe.in", "x@deadshop.in", "design.quickads@gmail.com", "test123@gmail.com", "hr@greenleafcafe.in", "abc@gmail.com", "noreply@greenleafcafe.in", "ok.person@yahoo.com"].map((e) => e + ",").join("\n");
const ip = (await LP("import-preview", { text: CSV })).j; const im = (await LP("import", { rows: ip.rows, tag: "user_data", update: false })).j;
ok(im.added.length === 9, "9 clients imported");
const MX = { "greenleafcafe.in": true, "deadshop.in": false };
globalThis.fetch = ((orig) => async (u, o) => { u = String(u); if (/cloudflare-dns\.com/.test(u)) { const dom = decodeURIComponent(u.split("name=")[1]); return Response.json({ Answer: MX[dom] ? [{ type: 15, data: "10 mx." + dom }] : [] }); } return orig(u, o); })(globalThis.fetch);
ok((await LP("email-check", { list: "user_data" }, "v")).status === 403, "viewers cannot run the check");
const ck = (await LP("email-check", { list: "user_data" })).j;
ok(ck.ok && ck.done && ck.left === 0 && ck.checked === 9, "one step checks the whole small database");
ok(ck.counts.ok === 3 && ck.counts.risky === 1 && ck.counts.invalid === 3 && ck.counts.test === 1 && ck.counts.blocked === 1, "3 valid, 1 risky, 3 invalid, 1 test, 1 spam " + JSON.stringify(ck.counts));
const st = (e) => q1("SELECT email_check c, email_reason r FROM li_businesses WHERE email=?", e);
ok(st("x@deadshop.in").c === "invalid" && /no mail server/.test(st("x@deadshop.in").r), "a domain without a mail server is invalid, with the reason");
ok(st("design.quickads@gmail.com").c === "blocked" && /quickads/.test(st("design.quickads@gmail.com").r), "quickads marked spam with the reason");
ok(KV.get("li:mx:greenleafcafe.in") === "1" && KV.get("li:mx:deadshop.in") === "0", "mail-server results are cached");
const db = (await LP("imports")).j.lists.find((x) => x.list === "user_data");
ok(db.valid === 3 && db.risky === 1 && db.bad === 5 && db.unchecked === 0, "database card counts valid / risky / spam-invalid");
const bad = (await LP("leads?list=user_data&echeck=bad")).j; ok(bad.total === 5 && bad.leads.every((l) => ["invalid", "test", "blocked"].indexOf(l.email_check) > -1 && l.email_reason), "filter: Email spam / invalid (with reasons)");
ok((await LP("leads?list=user_data&echeck=ok")).j.total === 3, "filter: Email valid");

/* never send to flagged addresses */
const qid = q1("SELECT id FROM li_businesses WHERE email='design.quickads@gmail.com'").id, rid = q1("SELECT id FROM li_businesses WHERE email='rahul.sharma@gmail.com'").id;
const sv = (await LP("drafts/" + qid, { channel: "email", template: "services" })).j;
const blockedSend = await LP("email-send/" + qid, { subject: sv.subject, blocks: sv.blocks, confirm: true });
ok(blockedSend.status === 409 && /On your Never-email list/.test(blockedSend.j.reason), "a spam-marked email is never sent, even when confirmed");
const tst = (await LP("email-send/" + qid, { subject: sv.subject, blocks: sv.blocks, test: true })).j; ok(tst.ok && tst.sent.to === "anmol@fodo.co.in", "a test to yourself still works");
const okSend = (await LP("email-send/" + rid, { subject: sv.subject, blocks: sv.blocks, confirm: true })).j; ok(okSend.ok && okSend.sent.to === "rahul.sharma@gmail.com", "valid emails send normally");

/* Never-email list editing + re-check */
ok((await LP("blocklist", { words: ["x"] }, "v")).status === 403, "viewers cannot edit the list");
const bl = (await LP("blocklist", { words: "quickads\n88ventures\nbrandbooster\ngreenleafcafe.in\nab" })).j;
ok(bl.ok && bl.words.length === 4 && bl.words.indexOf("ab") < 0, "list saved (too-short words ignored)");
ok((await LP("blocklist")).j.words.indexOf("greenleafcafe.in") > -1, "list remembered");
const rc = (await LP("email-check", { list: "user_data", recheck: true })).j;
ok(rc.done && st("anita@greenleafcafe.in").c === "blocked" && st("hr@greenleafcafe.in").c === "blocked", "Check again applies the new list to the whole database");

/* bulk pitch skips flagged */
const AJ2 = fs.readFileSync("js/admin.js", "utf8"), SRC = fs.readFileSync("functions/_lib/leadintel.js", "utf8");
ok(/BAD_CHECK\.indexOf\(x\.email_check\) > -1\) \{ skipped\+\+/.test(SRC), "Bulk pitch hand-off skips spam / invalid emails");
ok(/email marked/.test(AJ2) && /function liCheck/.test(AJ2) && /Never-email list/.test(AJ2) && /lq-echeck/.test(AJ2) && /liCheck\(\{ list: tag \}/.test(AJ2), "admin: database check buttons, Never-email list, filter, auto check after import, queue skips flagged");

console.log("\nv55.31 email check: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
