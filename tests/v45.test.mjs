// v45: CRM (contacts, deals pipeline, activities / follow-ups, website leads → contacts, CSV import / export, merge) and the
// AI Studio (captions, reel scripts, ad copy fitted to platform limits, policy flags, UTM links, daily limit).
// Run: node --no-warnings tests/v45.test.mjs
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as admin } from "../functions/api/admin/[[path]].js";
import { onRequest as xray } from "../functions/api/xray/[[path]].js";
import { onRequest as brain } from "../functions/api/owner-brain/[[path]].js";
import { onRequest as bizApi } from "../functions/api/biz/[[path]].js";
import { onRequest as sitesApi } from "../functions/api/sites/[[path]].js";
import { parseCsv, cleanPhone, cleanEmail } from "../functions/_lib/crm.js";
import { fit, policy, jsonOf, ADS, utm } from "../functions/_lib/studio.js";
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
globalThis.fetch = async () => new Response("x", { status: 599 });
const KV = new Map(), CHAT_KV = { get: async (k) => KV.get(k) || null, put: async (k, v) => { KV.set(k, v); }, getWithMetadata: async (k) => ({ value: KV.get(k) || null, metadata: null }), delete: async (k) => KV.delete(k), list: async () => ({ keys: [] }) };
/* a fake Workers AI that answers like a model would (JSON inside text), including over-long lines and a policy problem */
let aiMode = "ok", aiCalls = 0; const AI = { run: async (model, x) => { aiCalls++; const sys = x.messages[0].content, usr = x.messages[1].content;
  if (aiMode === "down") throw new Error("down"); if (aiMode === "junk") return { response: "Sorry, I can't." };
  if (/captions/.test(sys)) return { response: "Here you go:\n```json\n" + JSON.stringify({ variants: [{ hook: "Filter coffee, Chikmagalur style ☕", caption: "Our new filter coffee is here. <script>x</script>Guaranteed the best in Delhi!", hashtags: ["#filtercoffee", "delhicafe", "#a b", "#x1", "#x2", "#x3", "#x4", "#x5", "#x6", "#x7", "#x8", "#x9"], cta: "Book on WhatsApp" }, { hook: "Weekend special", caption: "x ".repeat(200), hashtags: ["#weekend"], cta: "Visit us" }, { hook: "Hi", caption: "Fresh beans every morning.", hashtags: [], cta: "" }] }) + "\n```" };
  if (/video scripts/.test(sys)) return { response: JSON.stringify({ hook: "Watch this pour", scenes: [{ t: "0-3s", visual: "Coffee pour close-up", voiceover: "Ever had real filter coffee?", onscreen: "REAL filter coffee" }, { t: "3-20s", visual: "Barista at work", voiceover: "Beans from Chikmagalur", onscreen: "" }], cta: "Visit this weekend", shots: ["pour", "barista"], music: "warm acoustic" }) };
  if (/paid ad copy/.test(sys)) return { response: JSON.stringify(/Google/.test(usr) ? { headline: ["Wedding Films in Delhi", "Book Your Shoot Today", "Cinematic Wedding Videos That Make Everyone Cry Happy Tears Forever", "Call +91 98765 43210 now", "Wedding Films in Delhi"], description: ["Cinematic wedding films by a Delhi team. Check dates and packages online.", "Trusted by couples across NCR."] } : { primary: ["Are you overweight? Our cafe has salads.", "Planning a wedding in Delhi? See our films."], headline: ["Cinematic wedding films", "A headline that is far far far too long for the Meta limit of forty"], description: ["Book a free call", "Short"] }) };
  return { response: "{}" }; } };
const env = { XRAY_DB: d1(), CHAT_KV, AI, ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", MAIL_FROM: "FODO <hello@fodo.co.in>", SITES_HOST: "sites.fodo.co.in", SITES_PROJECT: "fodo-sites", SITES_SECRET_KEY: "test-sites-secret-key-0123456789abcdef" };
H.biz = bizApi; H.sites = sitesApi;
const Z = (p, body, who, o) => call("biz/" + p, body, Object.assign({ as: who || "c" }, o || {}));
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
await login("anmol@fodo.co.in", null, "own"); await login("client@biz.in", null, "c"); await login("other@biz.in", null, "o");

/* ---------- 0. helpers ---------- */
ok(cleanPhone("98765 43210") === "+919876543210" && cleanPhone("+44 20 7946 0958") === "+442079460958" && cleanPhone("123") === "" && cleanEmail(" Riya@Example.com ") === "riya@example.com" && cleanEmail("nope") === "", "phones normalised (India default), emails checked");
const rows = parseCsv('﻿Name,Email,Phone\r\n"Sharma, Riya",riya@x.in,9876500000\n"He said ""hi""",,\n\n');
ok(rows.length === 3 && rows[1][0] === "Sharma, Riya" && rows[2][0] === 'He said "hi"', "CSV parser: quotes, commas, CRLF, BOM, blank lines");

/* ---------- 1. contacts ---------- */
let r = await Z("crm/contacts", undefined, "nobody"); ok(r.status === 401, "CRM needs a login");
r = await Z("crm/contacts", { name: "Riya Sharma", email: "Riya@Example.com", phone: "98765 00000", company: "Spice Route", tags: "VIP, wedding, vip", notes: "Prefers WhatsApp" });
const riya = r.j.contact; ok(r.j.ok && riya.email === "riya@example.com" && riya.phone === "+919876500000" && riya.tags.join() === "vip,wedding", "contact saved: email lower-case, phone +91, tags de-duplicated");
r = await Z("crm/contacts", { name: "Riya S", phone: "+91 98765 00000" }); ok(r.status === 409 && r.j.dup === riya.id, "same phone → refused as a duplicate (points to the existing contact)");
r = await Z("crm/contacts", { name: "x", email: "bad-email" }); ok(r.status === 400, "an invalid email is refused, not silently dropped");
r = await Z("crm/contacts", {}); ok(r.status === 400, "an empty contact is refused");
r = await Z("crm/contacts/" + riya.id, undefined, "o"); ok(r.status === 404, "another user can't open my contact");
r = await Z("crm/contacts", undefined, "o"); ok(r.j.total === 0, "…or see it in their list");
r = await Z("crm/contacts/" + riya.id + "/delete", {}, "o"); ok(r.status === 404, "…or delete it");
r = await Z("crm/contacts", { id: riya.id, name: "Riya Sharma" }, "o"); ok(r.status === 404, "…or edit it");
await Z("crm/contacts", { name: "Aman Gupta", email: "aman@x.in", company: "Gupta Sweets", tags: "wholesale" });
r = await Z("crm/contacts?q=gupta"); ok(r.j.items.length === 1 && r.j.items[0].name === "Aman Gupta", "search contacts"); r = await Z("crm/contacts?tag=vip"); ok(r.j.items.length === 1 && r.j.tags.some((t) => t.tag === "wedding"), "filter by tag; tag counts");

/* ---------- 2. website leads → contacts ---------- */
const site = await call("sites/create", { mode: "template", templateId: "cafe-cozy", name: "Spice Route", ai: false }, { as: "c" }); const sid = site.j.id;
const form = (id, data) => env.XRAY_DB.prepare("INSERT INTO site_forms (id, site_id, page, data, ip_hash, created_at) VALUES (?1,?2,'contact',?3,'x',?4)").bind(id, sid, JSON.stringify(data), new Date().toISOString()).run();
await form("fm_a1", { name: "Riya Sharma", email: "riya@example.com", message: "Table for 6 on Saturday?" }); await form("fm_a2", { name: "Karan Mehta", phone: "9811111111", message: "Catering for 50?" }); await form("fm_a3", { message: "no contact details" });
r = await Z("crm/import-forms", {}); ok(r.j.added === 1 && r.j.linked === 1 && r.j.skipped === 1, "website leads: 1 new contact, 1 matched to Riya, 1 without contact details skipped");
r = await Z("crm/import-forms", {}); ok(r.j.added === 0 && r.j.linked === 0, "running it again imports nothing twice");
r = await Z("crm/contacts/" + riya.id); ok(r.j.activities.some((a) => /Table for 6/.test(a.body) && /Spice Route/.test(a.body)), "the enquiry is on Riya's timeline");
r = await Z("crm/import-forms", {}, "o"); ok(r.j.added === 0, "nobody else can import my website's leads");

/* ---------- 3. deals + pipeline ---------- */
r = await Z("crm/deals", { title: "Wedding catering", value: 250000, contactId: riya.id, closeOn: day(20) }); const deal = r.j.deal; ok(deal.stage === "lead" && deal.prob === 10, "deal created at Lead (10 %)");
r = await Z("crm/deals", { title: "x", contactId: riya.id }, "o"); ok(r.status === 404, "can't attach a deal to someone else's contact");
r = await Z("crm/deals", { title: "Bad", value: -5 }); ok(r.status === 400, "negative values refused");
await Z("crm/deals", { title: "Diwali boxes", value: 80000, stage: "proposal" }); await Z("crm/deals", { title: "Old lead", value: 10000, stage: "lost", lostReason: "Budget" });
r = await Z("crm/deals", { id: deal.id, stage: "negotiation" }); ok(r.j.deal.stage === "negotiation" && r.j.deal.prob === 70, "moving stage updates the probability");
r = await Z("crm/pipeline"); const T = r.j.totals; ok(T.open === 330000 && T.weighted === Math.round(250000 * 0.7 + 80000 * 0.5) && r.j.stages.length === 6, "pipeline: open ₹3,30,000, weighted forecast is value × probability");
await Z("crm/deals", { id: deal.id, stage: "won" }); r = await Z("crm/pipeline"); ok(r.j.totals.won30 === 250000 && r.j.totals.winRate30 === 50, "won in the last 30 days + win rate (1 won, 1 lost)");
r = await Z("crm/contacts/" + riya.id); ok(r.j.activities.some((a) => /moved to Won/.test(a.body)), "stage changes are logged on the contact");
r = await Z("crm/pipeline", undefined, "o"); ok(r.j.totals.open === 0, "another user's pipeline is empty");

/* ---------- 4. activities + follow-ups ---------- */
r = await Z("crm/activities", { contactId: riya.id, kind: "task", body: "Send menu PDF" }); ok(r.status === 400, "a follow-up needs a date");
await Z("crm/activities", { contactId: riya.id, kind: "task", body: "Send menu PDF", due: day(-1) }); await Z("crm/activities", { contactId: riya.id, kind: "call", body: "Called, wants tasting" });
r = await Z("crm/followups"); const fu = r.j.items[0]; ok(r.j.items.length === 1 && fu.overdue && fu.name === "Riya Sharma", "overdue follow-up listed");
r = await Z("dashboard"); ok(JSON.stringify(r.j).indexOf("Follow up: Riya Sharma") > -1, "…and shown as a Next best action");
r = await Z("crm/activities/" + fu.id, { done: true }, "o"); ok(r.status === 404, "another user can't tick it"); await Z("crm/activities/" + fu.id, { done: true }); r = await Z("crm/followups"); ok(r.j.items.length === 0, "ticked off");
r = await Z("search?q=riya"); ok(r.j.groups.some((g) => g.name === "Contacts"), "contacts appear in workspace search");

/* ---------- 5. CSV import / export + merge ---------- */
const csv = "Full Name,E-mail,Mobile,Company,City,Tags\nNeha Kapoor,neha@x.in,9822222222,Kapoor Events,Delhi,\"events, vip\"\nDup Riya,RIYA@example.com,,,,\nNo One,,,,,\n=HYPERLINK(\"http://evil\"),evil@x.in,,,,\n";
r = await Z("crm/import-csv", { csv }); ok(r.j.added === 3 && r.j.duplicates === 1 && r.j.invalid === 0 && r.j.columns.indexOf("email") > -1, "CSV import: header mapping, duplicates skipped");
r = await Z("crm/import-csv", { csv: "foo,bar\n1,2" }); ok(r.status === 400, "a CSV without name / email / phone columns is refused");
r = await Z("crm/import-csv", { csv: "x".repeat(2 * 1048576 + 10) }); ok(r.status === 413, "CSV size limit");
r = await call("biz/crm/export?what=contacts", undefined, { as: "c" }); ok(r.status === 200 && /^﻿?Name,Email,Phone/.test(r.t) && /'=HYPERLINK/.test(r.t) && /"vip, wedding"|vip, wedding/.test(r.t), "CSV export; a formula-looking cell is neutralised");
r = await call("biz/crm/export?what=deals", undefined, { as: "o" }); ok(r.t.split("\n").length === 1, "export only contains your own data");
await Z("crm/contacts", { name: "Neha K", company: "Kapoor Events" }).catch(() => null);
r = await Z("crm/duplicates"); const g = r.j.groups.find((x) => x.why === "same name and company" || x.contacts.some((c) => /Neha/.test(c.name))); ok(r.j.ok, "duplicate finder runs");
const neha = (await Z("crm/contacts?q=neha")).j.items; const a1 = (await Z("crm/contacts", { name: "Neha Kapoor 2", email: "neha2@x.in" })).j.contact;
await Z("crm/deals", { title: "Event deal", value: 5000, contactId: a1.id });
r = await Z("crm/merge", { into: neha.find((c) => c.email === "neha@x.in").id, from: a1.id }); ok(r.j.ok && r.j.deals.some((d) => d.title === "Event deal") && (await Z("crm/contacts/" + a1.id)).status === 404, "merge moves deals and removes the duplicate");
r = await Z("crm/merge", { into: riya.id, from: riya.id }); ok(r.status === 404, "can't merge a contact into itself");

/* ---------- 6. AI Studio ---------- */
ok(fit("Cinematic wedding films", 40).text === "Cinematic wedding films" && fit("one two three four five six seven", 20).text === "one two three four" && fit("Supercalifragilisticexpialidocious and more", 10) === null && fit("one two three four five six seven", 20, true) === null, "fit: keeps, trims at a word, or drops");
ok(policy(["Guaranteed results!"]).length && policy(["Are you overweight? Try us"]).some((x) => /personal attributes/.test(x)) && policy(["Call +91 98765 43210"], "Google").some((x) => /phone/.test(x)) && policy(["Fresh coffee every morning"]).length === 0, "policy flags: absolute claims, personal attributes, phone numbers in Google ads; clean copy has none");
ok(jsonOf("blah ```json {\"a\":1} ``` blah").a === 1 && jsonOf("nothing") === null, "JSON is pulled out of chatty AI answers");
ok(ADS.Google.headline[0] === 30 && ADS.Google.description[0] === 90 && ADS.Meta.headline[0] === 40, "real platform limits (Google 30/90, Meta headline 40)");
r = await Z("studio/caption", { topic: "x" }); ok(r.status === 400, "caption needs a topic");
await Z("brand", { name: "Spice Route", tone: "Warm, local, proud", voice: "warm, local" });
const before = aiCalls; r = await Z("studio/caption", { platform: "Instagram", format: "Reel", topic: "New filter coffee with Chikmagalur beans", language: "Hinglish" }); const v0 = r.j.variants && r.j.variants[0];
ok(r.j.ok && r.j.variants.length === 3 && aiCalls === before + 1 && r.j.brandUsed, "3 caption options from one AI call, using the Brand Kit");
ok(v0 && !/<script>/.test(v0.text) && v0.hashtags.length <= 10 && v0.hashtags.every((t) => /^#[\p{L}\p{N}_]+$/u.test(t)) && v0.chars === v0.text.length, "captions: no markup, ≤10 clean hashtags, real character count");
ok(r.j.flags.some((f) => /Absolute|Superlatives/.test(f)), "risky claims in the AI's text are flagged");
r = await Z("studio/caption", { platform: "X", topic: "Weekend special coffee" }); ok(r.j.variants.every((v) => v.chars <= 280), "X: every option fits 280 characters (long ones shortened or dropped)");
r = await Z("studio/script", { topic: "Our coffee pour", seconds: 30, platform: "Instagram Reels" }); ok(r.j.ok && r.j.scenes.length === 2 && r.j.seconds === 30 && r.j.shots.length === 2, "reel script: scenes, shot list, music");
r = await Z("studio/ads", { platform: "Google", product: "Wedding films in Delhi", objective: "Leads" }); const G = r.j.copy;
ok(r.j.ok && G.headline.every((h) => h.length <= 30) && G.description.every((h) => h.length <= 90) && G.headline.length === 3 && r.j.dropped >= 1, "Google ad: every headline ≤ 30, description ≤ 90; too-long ones dropped, duplicates removed");
ok(r.j.flags.some((f) => /phone numbers/.test(f)) && /Draft only/.test(r.j.publishing), "phone number in a Google ad flagged; clearly a draft, never published");
r = await Z("studio/ads", { platform: "Meta", product: "Wedding films in Delhi" }); ok(r.j.copy.headline.length === 1 && r.j.flags.some((f) => /personal attributes/.test(f)), "Meta: over-long headline dropped; 'Are you overweight?' flagged");
aiMode = "down"; let u0 = (await Z("studio/usage")).j.used; r = await Z("studio/caption", { topic: "Something nice" }); ok(r.status === 503 && /isn't available/.test(r.j.reason), "AI down → an honest error, no canned text");
ok((await Z("studio/usage")).j.used === u0, "…and a failed draft doesn't use up the daily limit");
aiMode = "junk"; r = await Z("studio/caption", { topic: "Something nice" }); ok(r.status === 502, "an unusable AI answer is an error, not an empty result"); aiMode = "ok";
r = await Z("studio/utm", { url: "https://spiceroute.in/menu?x=1", source: "Instagram", medium: "Paid Social", campaign: "Diwali Sale 2026" }); ok(r.j.url === "https://spiceroute.in/menu?x=1&utm_source=instagram&utm_medium=paid_social&utm_campaign=diwali_sale_2026", "UTM link builder (cleaned values, keeps existing query)");
r = await Z("studio/utm", { url: "javascript:alert(1)", source: "a", medium: "b", campaign: "c" }); ok(r.status === 400, "only https landing pages");
const ct = (await Z("content", { title: "Coffee reel", platform: "Instagram", format: "reel" })).j.item; r = await Z("studio/save", { contentId: ct.id, copy: ["Caption one"] }); ok(r.j.ok && /Caption one/.test((await Z("content")).j.items.find((x) => x.id === ct.id).copy), "save a draft onto your content item");
r = await Z("studio/save", { contentId: ct.id, copy: ["x"] }, "o"); ok(r.status === 404, "…not onto someone else's");
/* daily limit */
await login("busy@biz.in", null, "b"); let hit = null; for (let i = 0; i < 32 && !hit; i++) { r = await Z("studio/caption", { topic: "Daily special number " + i }, "b"); if (r.status === 429) hit = i; }
ok(hit === 30, "30 AI drafts a day per person (the 31st is refused)");
r = await Z("studio/usage", undefined, "b"); ok(r.j.used === 30 && r.j.limit === 30, "usage shows the real count");
{ const bad = all.find((t) => /SITES_SECRET|test-sites-secret/.test(t) || (/"(contact|deal|stages|variants|scenes|copy|groups)"/.test(t) && /user_id/.test(t))); if (bad) console.log("LEAK " + bad.slice(0, 300)); ok(!bad, "no secrets in any answer; CRM and Studio answers carry no user ids"); }
const WS = fs.readFileSync(new URL("../js/workspace.js", import.meta.url), "utf8");
ok(/CRM\.pipeline/.test(WS) && /CRM\.contact = /.test(WS) && /crm\/import-csv/.test(WS) && /crm\/export\?what=contacts/.test(WS) && /VIEWS\.studio/.test(WS) && /"studio\/" \+ tab/.test(WS) && /Check before you publish/.test(WS), "workspace UI: CRM tabs (contacts, pipeline, follow-ups, website leads) + AI Studio");
console.log("\nv45: " + pass + " passed, " + fail + " failed"); if (fail) process.exit(1);
