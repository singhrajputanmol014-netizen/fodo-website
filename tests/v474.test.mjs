// v47.4: Become a FODO Pro (application pipeline, checks, messages, approval → private profile), Profile 2.0, case studies
// (permission + moderation), real-data badges (configurable, owner-only), FODO Recommended, the /become-a-pro/ page, Brain tools.
// Run: node --no-warnings tests/v474.test.mjs
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
const Z = (p, body, who, o) => call("biz/" + p, body, Object.assign({ as: who || "c" }, o || {}));
const q1 = (sql, ...a) => env.XRAY_DB.db.prepare(sql).get(...a);
const X = (sql, ...a) => env.XRAY_DB.db.prepare(sql).run(...a);
const qa = (sql, ...a) => env.XRAY_DB.db.prepare(sql).all(...a);
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
await login("anmol@fodo.co.in", null, "own"); await login("client@biz.in", null, "c"); await login("pro@studio.in", null, "p"); await login("mod@fodo.co.in", null, "m"); await login("view@fodo.co.in", null, "v");
await login("apply@maker.in", null, "ap"); await login("second@maker.in", null, "ap2"); await login("third@maker.in", null, "ap3"); await login("draftpro@studio.in", null, "p2");
await Z("admin/staff", { email: "mod@fodo.co.in", role: "moderator" }, "own"); await Z("admin/staff", { email: "view@fodo.co.in", role: "viewer" }, "own");
const inv = (await Z("admin/invites", { note: "p", maxUses: 3 }, "own")).j.token;
await Z("pro", { invite: inv, name: "Aarav Films", role: "Cinematographer", skills: "reels", city: "Delhi", onsite: true, langs: "Hindi", bio: "Professional for restaurants and cafes in Delhi NCR. Short-form reels and brand films.", days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], rateDay: 18000, terms: true }, "p");
await Z("pro/packages", { name: "Pack", price: 15000 }, "p"); await Z("pro/portfolio", { kind: "video", title: "Film", url: "https://vimeo.com/1" }, "p"); await Z("pro/submit", {}, "p"); const proId = (await Z("pro", undefined, "p")).j.pro.id; await Z("admin/pros/" + proId, { action: "approve" }, "own");
await Z("pro", { invite: inv, name: "Draft Studio", role: "Photographer", city: "Delhi", terms: true }, "p2"); const draftProId = (await Z("pro", undefined, "p2")).j.pro.id;
let r;

/* ---------- 1. the public page ---------- */
const page = fs.readFileSync("become-a-pro/index.html", "utf8"), mainHtml = page.slice(page.indexOf("<main"), page.indexOf("</main>"));
ok(/href="\/workspace\/#apply"/.test(page) && /<h1>Do your best work\. FODO brings the projects\.<\/h1>/.test(page), "/become-a-pro/ exists with the Apply call to action (→ Workspace, account needed)");
ok(/<link rel="canonical" href="https:\/\/www\.fodo\.co\.in\/become-a-pro\/">/.test(page) && /FAQPage/.test(page) && /BreadcrumbList/.test(page), "the page is indexable with canonical, FAQ and breadcrumb structured data");
ok(fs.readFileSync("sitemap.xml", "utf8").indexOf("/become-a-pro/") > -1 && fs.readFileSync("sitemap.xml", "utf8").indexOf("/fodo-pros/") < 0, "sitemap: /become-a-pro/ in, the invite-only /fodo-pros/ still out");
ok(/Disallow: \/fodo-pros\//.test(fs.readFileSync("robots.txt", "utf8")) && /noindex/.test(fs.readFileSync("fodo-pros/index.html", "utf8")), "/fodo-pros/ stays invite-gated (robots Disallow + noindex)");
ok(mainHtml.indexOf("—") < 0 && !/guarantee[ds]? (work|projects)/i.test(mainHtml.replace(/Is work guaranteed/, "")) && /never as a public page|never public web pages/.test(mainHtml), "honest copy: no long dash, no promised work, says profiles are never public");
ok(/become-a-pro\/">Become a FODO Pro/.test(fs.readFileSync("index.html", "utf8")) && /routes\.becomepro/.test(fs.readFileSync("js/main.js", "utf8")), "linked from the site footer (static + JS footer)");

/* ---------- 2. applying ---------- */
r = await Z("apply", undefined, "nobody"); ok(r.status === 401, "applying needs a FODO account (401 without a session)");
r = await Z("apply", undefined, "ap"); ok(r.j.ok && r.j.application === null && r.j.hasPro === false && r.j.roles.indexOf("Cinematographer") > -1, "a new person: no application yet, the role list comes from the server");
r = await Z("me", undefined, "ap"); ok(r.j.nav.some((n) => n.id === "apply") && !r.j.nav.some((n) => n.id === "pro"), "workspace nav: 'Become a FODO Pro' for people without a profile");
r = await Z("me", undefined, "p"); ok(!r.j.nav.some((n) => n.id === "apply") && r.j.nav.some((n) => n.id === "pro"), "an existing FODO Pro doesn't get the apply link");
r = await Z("apply", { name: "Meera Shoots", phone: "98100 12345" }, "ap"); ok(r.j.ok && r.j.application.status === "draft" && r.j.application.canEdit && r.j.application.missing.some((m) => m.step === 3), "save as you go: a partial application is a draft with what's missing per step");
r = await Z("apply/submit", {}, "ap"); ok(r.status === 400 && Array.isArray(r.j.missing) && r.j.missing.length > 3, "an incomplete application can't be sent (missing list returned)");
r = await Z("apply", { role: "Hacker", roles2: ["Photographer", "Nope", "Videographer", "Video Editor"], links: "javascript:alert(1)\nhttp://plain.in/x\nhttps://vimeo.com/111\nhttps://vimeo.com/111", showreel: "data:text/html,x", years: 999, availability: "always" }, "ap");
let A = r.j.application.data; ok(A.role === "" && A.roles2.join() === "Photographer,Videographer,Video Editor".split(",").slice(0, 3).join() && A.links.length === 1 && A.links[0].url === "https://vimeo.com/111" && !A.showreel && A.years == null && A.availability === "", "inputs cleaned on the server: unknown roles, non-https / script links, duplicates, out-of-range numbers dropped");
r = await Z("apply", { role: "Cinematographer", roles2: ["Video Editor"], city: "Delhi", years: 7, langs: "Hindi, English", about: "Cinematographer for food and fashion brands in Delhi NCR, 7 years, reels and ad films.", specializations: "Food films, Fashion", industries: "Restaurants, Fashion", skills: "Lighting, Colour grading", tools: "DaVinci Resolve", equipment: "Sony FX3, Aputure 300D",
  remote: false, onsite: true, travel: true, radiusKm: 60, availability: "full_time", days: ["mon", "tue", "wed", "thu", "fri"], rateDay: 22000, rateProject: 60000, links: [{ title: "Café film", url: "https://vimeo.com/111" }, { title: "Lookbook", url: "https://www.behance.net/meera" }], showreel: "https://youtu.be/reel", instagram: "https://instagram.com/meera.shoots", agree: true, truthful: true }, "ap");
A = r.j.application.data; ok(r.j.application.missing.length === 0 && A.instagram === "meera.shoots" && A.specializations.length === 2 && A.links.length === 2, "complete application: nothing missing (Instagram URL → handle)");
ok(!("checks" in r.j.application) && !("reviewer" in r.j.application) && !("email" in r.j.application), "the applicant never sees staff fields (checks, reviewer)");
r = await Z("apply/submit", {}, "ap"); const appId = r.j.application.id; ok(r.j.ok && r.j.application.status === "submitted" && /^pa[a-z0-9]{14}$/.test(appId) && r.j.application.submittedAt, "sent: status submitted");
r = await Z("apply", { name: "Changed" }, "ap"); ok(r.status === 409, "after sending, the applicant can't change it until FODO asks");
r = await Z("apply/submit", {}, "ap"); ok(r.status === 409, "sending twice is refused");

/* ---------- 3. the pipeline (staff) ---------- */
r = await Z("admin/applications", undefined, "c"); ok(r.status === 403, "clients can't see applications");
r = await Z("admin/applications/" + appId, undefined, "c"); ok(r.status === 403, "… nor open one by id (IDOR)");
r = await Z("admin/applications", undefined, "v"); ok(r.j.ok && r.j.waiting === 1 && r.j.items[0].name === "Meera Shoots" && r.j.items[0].links === 3, "viewer can read the pipeline (waiting count, links counted)");
r = await Z("admin/applications/" + appId, { action: "review" }, "v"); ok(r.status === 403, "viewer can't decide");
r = await Z("admin/applications?q=meera", undefined, "m"); ok(r.j.items.length === 1, "search by name"); r = await Z("admin/applications?q=zzz", undefined, "m"); ok(r.j.items.length === 0, "search: no false hits");
r = await Z("admin/applications/" + appId, { action: "approve" }, "m"); ok(r.status === 409 && /submitted/.test(r.j.reason), "can't approve straight from submitted (a review comes first)");
r = await Z("admin/applications/" + appId, { action: "interview", message: "Tuesday 4 pm call" }, "m"); ok(r.status === 409, "state machine: no interview before review");
r = await Z("admin/applications/" + appId, { action: "fly" }, "m"); ok(r.status === 400, "unknown action refused");
r = await Z("admin/applications/" + appId, { action: "review" }, "m"); ok(r.j.ok && r.j.application.status === "under_review" && r.j.application.reviewer === "mod@fodo.co.in" && r.j.application.actions.indexOf("approve") > -1, "review: under review, the reviewer is recorded, approve becomes possible");
r = await Z("admin/applications/" + appId, { action: "request_info", message: "short" }, "m"); ok(r.status === 400, "asking for information needs a real message");
r = await Z("admin/applications/" + appId, { action: "request_info", message: "Please add one food film made in the last 12 months.", note: "INTERNAL-SECRET: portfolio thin" }, "m"); ok(r.j.ok && r.j.application.status === "needs_information", "needs information, with a message");
r = await Z("apply", undefined, "ap"); ok(r.j.application.status === "needs_information" && r.j.application.canEdit && /food film/.test(r.j.application.message) && r.j.application.events.some((e) => /food film/.test(e.message || "")), "the applicant sees the message and can edit again");
ok(JSON.stringify(r.j).indexOf("INTERNAL-SECRET") < 0, "internal notes are never shown to the applicant");
ok(!!q1("SELECT 1 x FROM biz_notes WHERE user_id=(SELECT id FROM acct_users WHERE email='apply@maker.in') AND kind='application' AND text LIKE '%more information%'"), "the applicant is notified (workspace notification)");
ok(!!q1("SELECT 1 x FROM help_mail WHERE to_addr='apply@maker.in' AND subject LIKE '%more information%'"), "… and emailed (logged as not sent here: no mail key in tests)");
r = await Z("apply", { links: [{ title: "Café film", url: "https://vimeo.com/111" }, { title: "Lookbook", url: "https://www.behance.net/meera" }, { title: "Food film 2026", url: "https://vimeo.com/222" }] }, "ap"); ok(r.j.application.data.links.length === 3, "applicant adds the food film");
r = await Z("apply/submit", {}, "ap"); ok(r.j.application.status === "submitted" && r.j.application.events.some((e) => e.kind === "resubmit"), "sent again (history keeps it)");
await Z("admin/applications/" + appId, { action: "review" }, "m");
r = await Z("admin/applications/" + appId, { action: "interview", message: "We'll call you on Tuesday at 4 pm for 15 minutes." }, "m"); ok(r.j.application.status === "interview", "interview with a time");
r = await Z("admin/applications/" + appId, { action: "check", key: "identity", value: true }, "m"); ok(r.j.application.checks.identity && r.j.application.checks.identity.by === "mod@fodo.co.in", "check ticked by a named person");
r = await Z("admin/applications/" + appId, { action: "check", key: "dna", value: true }, "m"); ok(r.status === 400, "unknown check refused");
r = await Z("admin/applications/" + appId, { action: "approve" }, "m"); ok(r.status === 409 && /Portfolio checked/.test(r.j.reason), "approval refused until the portfolio check is ticked too");
const brainDecide = TOOLS.marketplace_pro_application_decide, owner = { id: "own", email: "anmol@fodo.co.in" };
ok(brainDecide && brainDecide.level === 2 && brainDecide.validate({ id: appId, action: "check" }) && !brainDecide.validate({ id: appId, action: "approve" }), "Brain decide tool: level 2 (owner confirms), can't tick checks");
let bErr = null; try { await brainDecide.run({ env, owner }, { id: appId, action: "approve" }); } catch (e) { bErr = e; } ok(bErr && /Portfolio checked/.test(bErr.message), "the Brain can't approve someone a person hasn't checked");
await Z("admin/applications/" + appId, { action: "check", key: "portfolio", value: true }, "m");
r = await Z("admin/applications/" + appId, { action: "note", note: "Strong food work, good call." }, "m"); ok(r.j.application.events.some((e) => e.kind === "note" && !e.public), "internal note saved (private)");
r = await Z("admin/applications/" + appId, { action: "approve", message: "Welcome! Set your calendar rules next." }, "m"); ok(r.j.ok && r.j.application.status === "approved" && /^pr[a-z0-9]{14}$/.test(r.j.application.proId) && r.j.application.decidedBy === "mod@fodo.co.in", "approved: a FODO Pro profile is created");
const newPro = q1("SELECT * FROM biz_pros WHERE id=?", r.j.application.proId);
ok(newPro.status === "approved" && newPro.name === "Meera Shoots" && newPro.role === "Cinematographer" && newPro.invite === "app:" + appId && JSON.parse(newPro.specializations).join() === "Food films,Fashion" && newPro.rate_project === 60000 && newPro.terms_at && newPro.onsite === 1 && newPro.remote === 0, "the profile comes from the application (role, Profile 2.0 fields, terms, work modes)");
ok(qa("SELECT url FROM biz_portfolio WHERE pro_id=?", newPro.id).length === 4 && !!q1("SELECT 1 x FROM biz_portfolio WHERE pro_id=? AND kind='video' AND title='Showreel'", newPro.id), "work links + showreel become portfolio items");
ok(!!q1("SELECT 1 x FROM biz_audit WHERE action='proapp:approve' AND target=?", appId) && !!q1("SELECT 1 x FROM biz_audit WHERE action='pro:create' AND target=?", newPro.id), "approval and profile creation are in the audit log");
r = await Z("me", undefined, "ap"); ok(r.j.nav.some((n) => n.id === "pro") && !r.j.nav.some((n) => n.id === "apply") && r.j.pro && r.j.pro.status === "approved", "the new FODO Pro gets the Pro area");
r = await Z("apply", undefined, "ap"); ok(r.j.hasPro === true && r.j.application.status === "approved", "apply page now says you're a FODO Pro"); r = await Z("apply", { name: "x" }, "ap"); ok(r.status === 409, "can't start another application");
r = await Z("admin/applications/" + appId, { action: "reject", message: "Changed our mind about this." }, "m"); ok(r.status === 409, "an approved application is final (manage the profile under Professionals)");

/* rejection, reopen, waiting period, archive */
await Z("apply", { name: "Second Person", phone: "9810011111", city: "Mumbai", role: "Photographer", years: 2, about: "Product photographer in Mumbai, e-commerce and catalogue shoots for D2C brands.", skills: "Product", onsite: true, availability: "part_time", links: "https://behance.net/a\nhttps://behance.net/b", agree: true, truthful: true }, "ap2");
r = await Z("apply/submit", {}, "ap2"); const app2 = r.j.application.id;
r = await Z("admin/applications/" + app2, { action: "reject" }, "m"); ok(r.status === 400, "saying no needs a short, kind reason");
r = await Z("admin/applications/" + app2, { action: "reject", message: "We need more product work with studio lighting." }, "m"); ok(r.j.application.status === "rejected" && r.j.application.decidedAt, "not approved, with a reason");
r = await Z("apply", undefined, "ap2"); ok(r.j.application.label === "Not approved" && r.j.application.canReapply === false && r.j.application.reapplyFrom, "the applicant sees it kindly, with the date they can apply again");
r = await Z("apply", { name: "Again" }, "ap2"); ok(r.status === 409 && /apply again from/.test(r.j.reason), "re-applying before the waiting period is refused");
r = await Z("admin/applications/" + app2, { action: "reopen" }, "m"); ok(r.j.application.status === "under_review" && !r.j.application.decidedAt, "reopen: back to review");
await Z("admin/applications/" + app2, { action: "reject", message: "We need more product work with studio lighting." }, "m");
X("UPDATE biz_pro_applications SET decided_at=? WHERE id=?", ago(31 * 24), app2);
r = await Z("apply", { years: 3 }, "ap2"); ok(r.j.application.status === "draft" && r.j.application.data.name === "Second Person" && r.j.application.data.years === 3 && r.j.application.id === app2, "after 30 days: a fresh draft, old answers kept, same record (history stays)");
r = await Z("admin/applications/" + app2, { action: "archive" }, "m"); ok(r.j.application.status === "archived", "archive works (even a draft)");
r = await Z("admin/applications", undefined, "m"); ok(!r.j.items.some((x) => x.id === app2) && r.j.counts.archived === 1 && r.j.counts.approved === 1, "the open list hides archived / drafts; counts per stage");
r = await Z("admin/applications?status=archived", undefined, "m"); ok(r.j.items.length === 1, "filter by stage");

/* approval when the person already has a (draft) profile → activated, not duplicated; suspended → refused */
await Z("apply", { name: "Third", phone: "9810022222", city: "Delhi", role: "Video Editor", years: 4, about: "Video editor for brand films and reels, colour and sound, quick turnaround for agencies.", skills: "Editing", remote: true, availability: "full_time", links: "https://vimeo.com/3\nhttps://vimeo.com/4", agree: true, truthful: true }, "ap3");
r = await Z("apply/submit", {}, "ap3"); const app3 = r.j.application.id; await Z("admin/applications/" + app3, { action: "review" }, "own"); await Z("admin/applications/" + app3, { action: "check", key: "identity", value: true }, "own"); await Z("admin/applications/" + app3, { action: "check", key: "portfolio", value: true }, "own");
const u3 = q1("SELECT id FROM acct_users WHERE email='third@maker.in'").id; X("INSERT INTO biz_pros (id, user_id, name, role, status, created_at, updated_at) VALUES ('prthirdxxxxxxxxx', ?, 'Third', 'Video Editor', 'suspended', ?, ?)", u3, ago(1), ago(1));
r = await Z("admin/applications/" + app3, { action: "approve" }, "own"); ok(r.status === 409 && /suspended/.test(r.j.reason), "a suspended profile isn't silently re-activated by an application");
X("UPDATE biz_pros SET status='draft' WHERE id='prthirdxxxxxxxxx'");
r = await Z("admin/applications/" + app3, { action: "approve" }, "own"); ok(r.j.application.proId === "prthirdxxxxxxxxx" && q1("SELECT status FROM biz_pros WHERE id='prthirdxxxxxxxxx'").status === "approved" && q1("SELECT count(*) n FROM biz_pros WHERE user_id=?", u3).n === 1, "existing draft profile → approved, no duplicate");

/* ---------- 4. Profile 2.0 ---------- */
r = await Z("pro", { name: "Aarav Films", role: "Cinematographer", skills: "reels", city: "Delhi", onsite: true, langs: "Hindi", bio: "Professional for restaurants and cafes in Delhi NCR. Short-form reels and brand films.", days: ["mon", "tue"], rateDay: 18000, terms: true, specializations: "Restaurant reels, Brand films", industries: "Restaurants", equipment: "FX6", rateProject: 45000 }, "p");
ok(r.j.pro.specializations.join() === "Restaurant reels,Brand films" && r.j.pro.industries[0] === "Restaurants" && r.j.pro.equipment[0] === "FX6" && r.j.pro.rateProject === 45000, "Profile 2.0: specializations, industries, own equipment, project rate");
r = await Z("pro", { name: "Aarav Films", role: "Cinematographer", skills: "reels", city: "Delhi", onsite: true, langs: "Hindi", bio: "Professional for restaurants and cafes in Delhi NCR. Short-form reels and brand films.", days: ["mon", "tue"], rateDay: 18000, terms: true }, "p");
ok(r.j.pro.specializations.length === 2 && r.j.pro.rateProject === 45000, "an older form without those fields keeps them");
await Z("admin/pros/" + proId, { action: "approve" }, "own");

/* ---------- 5. case studies ---------- */
r = await Z("pro/case-studies", undefined, "c"); ok(r.status === 404, "case studies are for FODO Pros only");
r = await Z("pro/case-studies", undefined, "p"); ok(r.j.ok && r.j.items.length === 0 && Array.isArray(r.j.projects), "empty to start (with the completed FODO projects they can link)");
r = await Z("pro/case-studies", { title: "Hi" }, "p"); ok(r.status === 400, "a title is needed");
const otherPj = (await Z("projects", { proId: newPro.id, title: "Someone else's job", brief: "Not Aarav's project at all" })).j.project.id;
r = await Z("pro/case-studies", { title: "Café launch films", projectId: otherPj }, "p"); ok(r.status === 403, "can't link a FODO project they didn't work on");
const ownPj = (await Z("projects", { proId, title: "Aarav job", brief: "A project for the case-study tests" })).j.project.id;
r = await Z("pro/case-studies", { title: "Café launch films", projectId: ownPj }, "p"); ok(r.status === 409, "… and only once it's completed");
X("UPDATE biz_projects SET status='completed' WHERE id=?", ownPj);
const story = { title: "Café launch films", client: "Brew Lab", industry: "Restaurants", role: "DOP + edit", challenge: "A new café chain needed launch reels for three outlets in one week.", approach: "One-day shoot per outlet with a small crew, natural light and a fixed reel template.", result: "Twelve reels delivered in six days, used for the launch ads.", metrics: "12 reels, 6 days", links: "https://vimeo.com/9\njavascript:x\nhttps://vimeo.com/10", projectId: ownPj };
r = await Z("pro/case-studies", story, "p"); let cs = r.j.items[0]; ok(cs.status === "draft" && cs.links.length === 2 && cs.fodoProject && !cs.clientPermission, "saved as a draft (https links only, linked FODO project)");
r = await Z("pro/case-studies/" + cs.id + "/submit", {}, "p"); ok(r.status === 400 && /permission/.test(r.j.reason), "can't send for review without the client's permission");
r = await Z("pro/case-studies", Object.assign({}, story, { id: cs.id, clientPermission: true }), "p"); r = await Z("pro/case-studies/" + cs.id + "/submit", {}, "p"); ok(r.j.items[0].status === "pending", "with permission: waiting for FODO review");
r = await Z("pro/case-studies", { title: "Tiny story", clientPermission: true }, "p"); const tiny = r.j.items.find((x) => x.title === "Tiny story"); r = await Z("pro/case-studies/" + tiny.id + "/submit", {}, "p"); ok(r.status === 400 && /story/.test(r.j.reason), "a case study needs a real story to be sent");
r = await Z("pro/case-studies", { title: "Not mine to edit", id: cs.id }, "p2"); ok(r.status === 404, "another professional can't edit it"); await Z("pro/case-studies/" + cs.id + "/delete", {}, "p2"); ok(!!q1("SELECT 1 x FROM biz_pro_case_studies WHERE id=?", cs.id), "… or delete it");
r = await Z("pro/case-studies", { title: "Draft pro story", challenge: "x".repeat(130), clientPermission: true }, "p2"); r = await Z("pro/case-studies/" + r.j.items[0].id + "/submit", {}, "p2"); ok(r.status === 409, "a profile that isn't approved can't send case studies for review");
r = await Z("market/" + proId); ok(r.j.pro.caseStudies.length === 0, "clients don't see unreviewed case studies");
r = await Z("admin/case-studies", undefined, "c"); ok(r.status === 403, "clients can't moderate");
r = await Z("admin/case-studies", undefined, "m"); ok(r.j.items.length === 1 && r.j.items[0].proName === "Aarav Films" && r.j.counts.pending === 1, "moderation queue");
r = await Z("admin/case-studies/" + cs.id, { action: "reject" }, "m"); ok(r.status === 400, "sending back needs a note");
X("UPDATE biz_pro_case_studies SET client_permission=0 WHERE id=?", cs.id); r = await Z("admin/case-studies/" + cs.id, { action: "publish" }, "m"); ok(r.status === 409, "never published without the client's permission"); X("UPDATE biz_pro_case_studies SET client_permission=1 WHERE id=?", cs.id);
r = await Z("admin/case-studies/" + cs.id, { action: "publish" }, "m"); ok(r.j.ok && q1("SELECT status FROM biz_pro_case_studies WHERE id=?", cs.id).status === "published", "published after review");
r = await Z("market/" + proId); ok(r.j.pro.caseStudies.length === 1 && r.j.pro.caseStudies[0].client === "Brew Lab" && r.j.pro.caseStudies[0].fodoProject && !("status" in r.j.pro.caseStudies[0]) && !("projectId" in r.j.pro.caseStudies[0]), "clients see the published case study (no internal fields)");
ok(!!q1("SELECT 1 x FROM biz_notes WHERE user_id=(SELECT id FROM acct_users WHERE email='pro@studio.in') AND text LIKE '%case study%published%'"), "the professional is notified");
r = await Z("builder/match", { roleId: "dop", city: "Delhi", mode: "onsite" }); let mi = r.j.items.find((x) => x.pro.id === proId); ok(mi && mi.why.some((w) => /1 published case study/.test(w)), "matching explains published case studies (counted as portfolio)");
r = await Z("pro/case-studies", Object.assign({}, story, { id: cs.id, clientPermission: true, result: "Twelve reels delivered in five days." }), "p"); ok(r.j.items.find((x) => x.id === cs.id).status === "pending", "editing a published case study sends it back to review");
r = await Z("market/" + proId); ok(r.j.pro.caseStudies.length === 0, "… and hides it until reviewed");
await Z("admin/case-studies/" + cs.id, { action: "publish" }, "m"); r = await Z("admin/case-studies/" + cs.id, { action: "hide", note: "Client asked to remove it." }, "m"); ok(q1("SELECT status FROM biz_pro_case_studies WHERE id=?", cs.id).status === "hidden" && (await Z("market/" + proId)).j.pro.caseStudies.length === 0, "FODO can hide a published one (with a note)");

/* ---------- 6. badges from real data ---------- */
r = await Z("market/" + proId); ok(r.j.pro.badges.length === 1 && r.j.pro.badges[0].key === "verified", "a new professional: only 'Verified by FODO' (nothing invented)");
const tm = (i, inv2, ans, st) => X("INSERT INTO biz_team_members (id, team_id, slot, role_name, pro_id, status, invited_at, answered_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)", "tmb" + i, "tb" + i, 1, "DOP", proId, st, inv2, ans, inv2);
for (let i = 0; i < 5; i++) tm(i, ago(100 + i), ago(98 + i), i % 2 ? "declined" : "accepted");
r = await Z("market/" + proId); let keys = r.j.pro.badges.map((b) => b.key); const fast = r.j.pro.badges.find((b) => b.key === "fast_response");
ok(keys.indexOf("fast_response") > -1 && /within 2 h \(median of 5\)/.test(fast.why) && keys.indexOf("top_response") > -1, "Fast Response + Top Response from 5 real answered invitations (with the numbers)");
tm(9, ago(200), null, "expired"); r = await Z("market/" + proId); keys = r.j.pro.badges.map((b) => b.key); ok(keys.indexOf("top_response") < 0 && keys.indexOf("fast_response") > -1, "an unanswered (expired) invitation drops Top Response below 90% (5 of 6)");
const cl = q1("SELECT id FROM acct_users WHERE email='client@biz.in'").id;
const pj = (i, client, st) => X("INSERT INTO biz_projects (id, client_id, pro_id, title, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?)", "pjb" + i, client, proId, "B" + i, st, ago(500), ago(400));
pj(1, cl, "completed"); pj(2, cl, "completed"); pj(3, "cl-two", "completed"); pj(4, "cl-two", "completed"); pj(5, "cl-three", "completed");
r = await Z("market/" + proId); keys = r.j.pro.badges.map((b) => b.key);
ok(keys.indexOf("high_completion") > -1 && keys.indexOf("repeat_favorite") > -1 && /2 clients hired them again/.test(r.j.pro.badges.find((b) => b.key === "repeat_favorite").why), "High Completion (6 of 6) + Repeat Client Favorite (2 clients came back)");
pj(6, "cl-four", "cancelled"); r = await Z("market/" + proId); ok(r.j.pro.badges.some((b) => b.key === "high_completion"), "a cancellation before any payment doesn't count against them");
X("INSERT INTO biz_milestones (id, project_id, idx, title, amount, status, funded_at) VALUES ('msb6','pjb6',0,'x',1000,'refunded',?)", ago(450)); r = await Z("market/" + proId); ok(!r.j.pro.badges.some((b) => b.key === "high_completion"), "a cancellation after payment does (6 of 7 = 86% < 90%)");
r = await Z("admin/badges", { responseRate: 80, reason: "testing" }, "m"); ok(r.status === 403, "only owners change badge rules");
r = await Z("admin/badges", { responseRate: 80 }, "own"); ok(r.status === 400, "a reason is required");
r = await Z("admin/badges", { responseRate: 20, reason: "too low" }, "own"); ok(r.status === 400, "rules have sane limits");
r = await Z("admin/badges", { responseRate: 80, completionRate: 85, reason: "Smaller network for now" }, "own"); ok(r.j.config.responseRate === 80 && r.j.config.fastHours === 6, "owner changes the rules");
r = await Z("market/" + proId); keys = r.j.pro.badges.map((b) => b.key); ok(keys.indexOf("top_response") > -1 && keys.indexOf("high_completion") > -1, "badges follow the new rules immediately");
ok(!!q1("SELECT 1 x FROM biz_audit WHERE action='settings:badges' AND detail LIKE 'Smaller network%'"), "rule change is audited");
r = await Z("admin/badges", undefined, "m"); ok(r.j.ok && r.j.canEdit === false && r.j.badges.find((b) => b.key === "fast_response").holders === 1, "badge overview: holders per badge (moderator reads, can't edit)");
r = await Z("admin/badges", undefined, "own"); ok(r.j.canEdit === true, "owner can edit");

/* FODO Recommended */
r = await Z("admin/pros/" + proId + "/recommend", { on: true, note: "Great with restaurant brands" }, "m"); ok(r.status === 403, "moderators can't mark FODO Recommended");
r = await Z("admin/pros/" + proId + "/recommend", { on: true }, "own"); ok(r.status === 400, "a reason is required (clients see it)");
r = await Z("admin/pros/" + draftProId + "/recommend", { on: true, note: "Lovely portfolio so far" }, "own"); ok(r.status === 409, "only approved professionals can be recommended");
r = await Z("admin/pros/" + proId + "/recommend", { on: true, note: "Great with restaurant brands" }, "own"); ok(r.j.recommended === true && q1("SELECT status FROM biz_pros WHERE id=?", proId).status === "approved", "recommended (and the route didn't fall into profile moderation)");
r = await Z("market/" + proId); const rec = r.j.pro.badges.find((b) => b.key === "recommended"); ok(rec && rec.why === "Great with restaurant brands." && r.j.pro.recommended && r.j.pro.recommendedNote === "Great with restaurant brands", "FODO Recommended shows FODO's reason");
r = await Z("market?q=cinematographer%20delhi"); const mk = r.j.results.find((x) => x.id === proId); ok(mk.why.indexOf("Recommended by FODO") > -1 && mk.badges.some((b) => b.key === "recommended"), "Hire Pros: badges on results, the recommendation is explained");
r = await Z("builder/match", { roleId: "dop", city: "Delhi", mode: "onsite" }); mi = r.j.items.find((x) => x.pro.id === proId); ok(mi.pro.badges.some((b) => b.key === "fast_response") && mi.why.some((w) => /^FODO Recommended: Great with/.test(w)) && mi.why.some((w) => /^Fast Response: /.test(w)), "team matching shows the badges with their reasons");
ok(!!q1("SELECT 1 x FROM biz_audit WHERE action='pro:recommend' AND target=?", proId), "recommendation audited");
r = await Z("admin/pros/" + proId + "/recommend", { on: false }, "own"); r = await Z("market/" + proId); ok(!r.j.pro.badges.some((b) => b.key === "recommended") && !r.j.pro.recommended, "removed again");
r = await Z("market/" + draftProId); ok(r.status === 404, "a profile that isn't approved stays private (Not found)");

/* ---------- 7. overview, Brain, UI wiring ---------- */
r = await Z("admin/overview", undefined, "m"); ok(r.j.pros.applications === 0 && typeof r.j.pros.cases === "number", "admin overview counts applications waiting");
const bl = await TOOLS.marketplace_pro_applications.run({ env, owner }, {}); ok(TOOLS.marketplace_pro_applications.level === 0 && bl.label === "REAL DATA" && bl.byStatus.approved === 2 && bl.badges.length === 6, "Brain: read the pipeline + badge holders (real data)");
const bl2 = await TOOLS.marketplace_pro_applications.run({ env, owner }, { status: "archived" }); ok(bl2.items.length === 1 && bl2.items[0].status === "Archived", "Brain: filter by stage");
ok(/Pro applications/.test(brainDecide.desc) || /application/.test(brainDecide.desc), "Brain decide tool described");
const WS = fs.readFileSync("js/workspace.js", "utf8"), PAJ = fs.readFileSync("js/ws-proapps.js", "utf8"), CSS = fs.readFileSync("css/workspace.css", "utf8");
ok(/\["applications", "Pro applications"\]/.test(WS) && /lazy\("\/js\/ws-proapps\.js"\)/.test(WS) && /VIEWS\.apply = /.test(WS) && /"apply"\]\)/.test(WS), "workspace: Apply view + admin tab load the lazy module");
ok(/FODO_WS_PROAPPS = \{ apply: apply, cases: cases, admin: admin/.test(PAJ) && /data-chk/.test(PAJ) && /Internal/.test(PAJ) && /as reported/.test(PAJ), "module: apply steps, admin checks, internal notes marked, results labelled as reported");
ok(/bdgWhy\(p\.badges\)/.test(WS) && /caseStudies/.test(WS) && /#pr-cs/.test(WS), "client profile shows badges with reasons + case studies; Pro profile has a case-study section");
ok(/\.pa-steps/.test(CSS) && /\.cs-card/.test(CSS), "styles added");
ok(/Apply to become a FODO Pro/.test(WS) && /become-a-pro/.test(WS), "invite-only screen and the client Pro view point to the application");
for (const f of ["functions/_lib/proapps.js", "js/ws-proapps.js"]) { const t = fs.readFileSync(f, "utf8"); ok(!/\b[Ww]orkers?\b/.test(t.replace(/Workers AI/g, "")), f + ": the word 'worker' is never used"); }
ok(all.every((t) => t.indexOf("—") < 0 || !/"reason"/.test(t)), "no long dash in API messages");
console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
