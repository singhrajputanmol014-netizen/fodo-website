// v40: Business OS: workspace roles, dashboard, Brand Kit, Content & Ads, FODO Pros marketplace, projects, milestone payments, payouts, moderation, disputes. Run: node --no-warnings tests/v40.test.mjs

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as admin } from "../functions/api/admin/[[path]].js";
import { onRequest as xray } from "../functions/api/xray/[[path]].js";
import { onRequest as brain } from "../functions/api/owner-brain/[[path]].js";
import { onRequest as tick } from "../functions/api/monitor/tick.js";
import { PLANS } from "../functions/_lib/plans.js";
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
const all = [];   // every response body, checked for leaked secrets at the end
const login = (email, plan, who) => call("test-login", Object.assign({ email }, plan ? { plan } : {}), { as: who });
const B = (p, body, who, o) => call("owner-brain/" + p, body, Object.assign({ as: who || "own" }, o || {}));
const ask = (message, threadId, who, extra) => B("chat", Object.assign({ message, threadId }, extra || {}), who);


import { onRequest as sitesApi } from "../functions/api/sites/[[path]].js";
import { onRequest as sitesProject } from "../sites/functions/[[path]].js";
import { renderPage, checkSite, safeUrl, sanitizeCss } from "../sites/lib/render.js";
import { TEMPLATES, SOURCES, clientAllowed } from "../sites/lib/templates.js";
H.sites = sitesApi;
const J = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json" } });
let cfFailNext = false; const dns = {}, cf = [], cfPaid = {}; let cfCalls = [], mails = [];
globalThis.fetch = async (u, o = {}) => { u = String(u);
  if (/cloudflare-dns\.com\/dns-query/.test(u)) { const q = new URL(u), k = q.searchParams.get("name") + "|" + q.searchParams.get("type"); return J({ Answer: (dns[k] || []).map((d) => ({ data: d })) }); }
  if (/api\.cloudflare\.com/.test(u)) { cfCalls.push((o.method || "GET") + " " + u.replace(/^.*\/projects\//, "")); return (o.method || "GET") === "GET" ? J({ success: false, errors: [{ code: 8000007 }] }, 404) : J({ success: true, result: { status: "active" } }); }
  if (/api\.resend\.com/.test(u)) { mails.push(JSON.parse(o.body)); return J({ id: "m1" }); }
  if (/\/api\/sites\/view\//.test(u)) return new Response("ok", { status: 200 });
  if (/cashfree\.com\/pg\//.test(u)) { const id = o.headers && o.headers["x-client-id"]; cf.push({ u, m: o.method || "GET", id, body: o.body ? JSON.parse(o.body) : null });
    if (id === "BADKEY") return J({ message: "authentication Failed" }, 401);
    if ((o.method || "GET") === "POST" && cfFailNext) { cfFailNext = false; return J({ message: "gateway down" }, 500); }
    if ((o.method || "GET") === "POST") { const b = JSON.parse(o.body); return J({ cf_order_id: 555, order_id: b.order_id, payment_session_id: "session_TEST_123", order_amount: b.order_amount }); }
    const oid = u.split("/orders/")[1]; if (/fodo-check/.test(u)) return J({ message: "order not found" }, 404); return J({ order_id: oid, order_status: cfPaid[oid] ? "PAID" : "ACTIVE", order_amount: cfPaid[oid] || 0 }); }
  return new Response("x", { status: 599 }); };
const AI = { run: async (model, x) => { const sys = x.messages[0].content, user = x.messages[x.messages.length - 1].content;
  if (/write website copy/.test(sys)) { const j = JSON.parse(user.split("SECTIONS: ")[1]); j.pages.forEach((p) => p.sections.forEach((s) => { if (s && s.props && s.props.title) s.props.title = "Smile Dental: " + s.props.title; if (s && s.type === "testimonials") s.props.items = [{ quote: "Best clinic ever!", name: "Fake Person" }]; })); return { response: JSON.stringify(j) }; }
  if (/edit ONE customer website/.test(sys)) { if (/other site|admin|secret/i.test(user)) return { response: JSON.stringify({ say: "x", ops: [{ op: "update", page: "home", i: 1, props: { title: "<script>steal()</script>" } }, { op: "raw", html: "<script>" }] }) };
    return { response: JSON.stringify({ say: "Made the hero shorter and added an FAQ.", ops: [{ op: "update", page: "home", i: 1, props: { title: "Gentle dental care in Dwarka" } }, { op: "add", page: "home", at: 2, type: "faq", props: { title: "FAQ", items: [{ q: "Open on Sunday?", a: "Yes, 10–2." }] } }, { op: "theme", theme: { primary: "#0F766E" } }] }) }; }
  if (/Make it shorter/.test(sys)) return { response: "Short and sweet." };
  return { response: "ok" }; } };
const KV = new Map(), CHAT_KV = { get: async (k) => KV.get(k) || null, put: async (k, v, o) => { KV.set(k, v); KV.set(k + "#m", o && o.metadata); }, getWithMetadata: async (k) => ({ value: KV.get(k) || null, metadata: KV.get(k + "#m") }), delete: async (k) => KV.delete(k) };
const env = { XRAY_DB: d1(), CHAT_KV, AI, ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", RESEND_API_KEY: "re_SECRETresendKEY12345", MAIL_FROM: "FODO <hello@fodo.co.in>", SITES_HOST: "sites.fodo.co.in", SITES_PROJECT: "fodo-sites", SITES_SECRET_KEY: "test-sites-secret-key-0123456789abcdef" };
env.CASHFREE_APP_ID = "TESTID"; env.CASHFREE_SECRET_KEY = "cf_SECRET_key_123456";
import { onRequest as bizApi } from "../functions/api/biz/[[path]].js";
import { parseNeed, actionsFor, PRO_ROLES } from "../functions/_lib/biz.js";
import { TOOLS as BRAIN_TOOLS } from "../functions/_lib/brain/tools.js";
H.biz = bizApi;
const Z = (p, body, who, o) => call("biz/" + p, body, Object.assign({ as: who || "c" }, o || {}));
const S = (p, body, who, o) => call("sites/" + p, body, Object.assign({ as: who || "c" }, o || {}));
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const dow = (s) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(s + "T00:00:00Z").getUTCDay()];
const nextDow = (want, from) => { for (let i = from || 3; i < 40; i++) if (want.indexOf(dow(day(i))) > -1) return day(i); };
await login("anmol@fodo.co.in", null, "own"); await login("client@biz.in", null, "c"); await login("pro@studio.in", null, "p"); await login("other@biz.in", null, "o"); await login("mod@fodo.co.in", null, "m"); await login("client2@biz.in", null, "c2");

/* ---------- 1. login, roles, navigation ---------- */
let r = await Z("me", undefined, "nobody"); ok(r.status === 401 && r.j.login, "the workspace needs a login");
r = await Z("roles", undefined, "nobody"); ok(r.j.ok && r.j.roles.length >= 40 && r.j.roles.indexOf("Director of Photography") > -1 && r.j.roles.every((x) => !/worker/i.test(x)), "40+ professional roles (never 'workers'), public list");
r = await Z("me"); ok(r.j.ok && r.j.roles.join() === "client" && r.j.nav.some((n) => n.id === "pros") && !r.j.nav.some((n) => n.id === "admin"), "client: workspace nav without admin");
r = await Z("me", undefined, "own"); ok(r.j.roles.indexOf("owner") > -1 && r.j.nav.some((n) => n.id === "admin"), "owner: admin nav (decided by the server)");
r = await Z("admin/overview", undefined, "c"); ok(r.status === 403, "a client can't open marketplace admin");
r = await Z("admin/staff", { email: "mod@fodo.co.in", role: "moderator" }, "c"); ok(r.status === 403, "only owners give marketplace roles");
r = await Z("admin/staff", { email: "mod@fodo.co.in", role: "moderator" }, "own"); ok(r.j.ok, "owner makes someone a moderator");
r = await Z("me", undefined, "m"); ok(r.j.roles.indexOf("moderator") > -1 && r.j.nav.some((n) => n.id === "admin"), "moderator role works server-side");
r = await Z("me", undefined, "o", { method: "POST", headers: { origin: "https://evil.test" } }); ok(r.status === 403 || r.status === 404, "cross-site writes refused");

/* ---------- 2. Brand Kit ---------- */
r = await Z("brand", { name: "Spice Route", colors: { primary: "#FF5500", accent: "#00aa88", text: "red; } body{" }, fonts: { heading: "Playfair", body: "Inter" }, radius: 18, tone: "Warm, local, proud" });
ok(r.j.ok && r.j.brand.colors.primary === "#ff5500" && !r.j.brand.colors.text && r.j.brand.radius === 18, "Brand Kit saved; invalid colour values are dropped (no CSS injection)");
const site = await S("create", { mode: "template", templateId: "cafe-cozy", name: "Spice Route", ai: false }); const sid = site.j.id;
r = await Z("brand/apply", { siteId: sid }); const sv = await S(sid); ok(r.j.ok && sv.j.site.doc.theme.primary === "#ff5500" && sv.j.site.doc.theme.headingFont === "Playfair" && sv.j.site.rev === r.j.rev, "Apply Brand Kit to a website (a normal saved version)");
r = await Z("brand/extract", { siteId: sid }); ok(r.j.ok && r.j.brand.colors.primary === "#ff5500" && r.j.from === "Spice Route", "Extract brand from your website");
r = await Z("brand/apply", { siteId: sid }, "o"); ok(r.status === 404, "nobody can apply a brand to someone else's website");

/* ---------- 3. Content & Ads ---------- */
r = await Z("content/brief", { format: "Reel", count: 5, platform: "Instagram", objective: "More weekend bookings" }); const br = r.j.brief;
ok(br.deliverables[0].indexOf("5 vertical reels") === 0 && br.suggestedRoles.indexOf("Videographer") > -1 && br.brand.name === "Spice Route" && br.tone === "Warm, local, proud", "brief builder: deliverables, suggested professionals, Brand Kit tone");
r = await Z("content", { title: br.title, platform: "Instagram", format: "reel", status: "brief", due: day(5), brief: br }); const cid = r.j.item.id; ok(r.j.ok && r.j.item.status === "brief", "brief saved to the calendar");
r = await Z("content", { id: cid, title: br.title, status: "nonsense" }); ok(r.j.item.status === "idea", "unknown status → Idea");
r = await Z("content", { id: cid, title: "x y" }, "o"); ok(r.status === 404, "content belongs to its owner only");
r = await Z("campaigns", { name: "Weekend bookings", platform: "Meta", objective: "Leads", budget: 30000, days: 30, status: "live", landing: "javascript:alert(1)" });
ok(r.j.ok && r.j.item.status === "draft" && r.j.item.landing === "" && r.j.item.daily === 1000 && /Not connected/.test(r.j.item.publishing), "ad plans are never marked live without a connected ad account; bad landing URL dropped");

/* ---------- 4. FODO Pro signup + moderation ---------- */
r = await Z("pro", { name: "Aarav Films", role: "Cinematographer", title: "Food & hospitality cinematographer", skills: "food, restaurant, reels, color grading", tools: "Sony FX3, DaVinci", years: 7, city: "Delhi", remote: false, onsite: true, langs: "Hindi, English", bio: "x".repeat(20), days: ["mon", "tue", "wed", "thu", "fri", "sat"], rateDay: 18000, noticeDays: 2 }, "p");
ok(r.j.ok && r.j.pro.status === "draft" && r.j.pro.cats.indexOf("Video") > -1 && r.j.pro.completeness.pct < 100, "pro profile created as a private draft");
r = await Z("pro/submit", {}, "p"); ok(r.status === 400 && r.j.missing.indexOf("Bio (60+ characters)") > -1 && r.j.missing.indexOf("At least 1 package") > -1, "can't submit an incomplete profile (exact missing items)");
await Z("pro", { name: "Aarav Films", role: "Cinematographer", skills: "food, restaurant, reels", tools: "Sony FX3", years: 7, city: "Delhi", onsite: true, langs: "Hindi, English", bio: "Cinematographer for restaurants and cafes in Delhi NCR. Short-form reels and brand films.", days: ["mon", "tue", "wed", "thu", "fri", "sat"], rateDay: 18000, noticeDays: 2, terms: true }, "p");
r = await Z("pro/packages", { name: "Restaurant Reels Package", price: 15000, days: 7, revisions: 2, deliverables: "5 reels, 5 covers", rights: "Social + website" }, "p"); const pkg = r.j.pro.packages[0];
r = await Z("pro/portfolio", { kind: "video", title: "Cafe film", url: "javascript:alert(1)" }, "p"); ok(r.status === 400, "portfolio links must be https");
r = await Z("pro/portfolio", { kind: "video", title: "Cafe film", url: "https://vimeo.com/123" }, "p"); ok(r.j.pro.portfolio.length === 1 && pkg.price === 15000, "package + portfolio added");
r = await Z("pro/submit", {}, "p"); ok(r.j.pro.status === "pending", "submitted → Pending review");
r = await Z("market?q=cinematographer", undefined, "c"); ok(r.j.results.length === 0, "a pending profile is not shown to clients");
r = await Z("market/" + r.j.need && "market/" + (await Z("pro", undefined, "p")).j.pro.id, undefined, "c"); ok(r.status === 404, "…not even by its id");
const proId = (await Z("pro", undefined, "p")).j.pro.id;
r = await Z("admin/pros/" + proId, { action: "approve" }, "o"); ok(r.status === 403, "a client can't approve professionals");
r = await Z("admin/pros?status=pending", undefined, "m"); ok(r.j.items.length === 1 && r.j.items[0].email === "pro@studio.in", "moderator sees the review queue");
r = await Z("admin/pros/" + proId, { action: "approve" }, "m"); ok(r.j.ok && r.j.status === "approved", "moderator approves");
r = await Z("notes", undefined, "p"); ok(r.j.items.some((n) => /approved/.test(n.text)) && r.j.unread >= 1, "the professional is notified");

/* ---------- 5. marketplace search + matching (deterministic, works without AI) ---------- */
const N = parseNeed("I need a cinematographer in Delhi for a one-day restaurant shoot, budget ₹20,000");
ok(N.role === "Cinematographer" && N.city === "delhi" && N.budget === 20000 && N.days === 1 && N.industry === "restaurant", "need parsing: role, city, budget, days, industry");
r = await Z("market?q=" + encodeURIComponent("I need a cinematographer in Delhi for a one-day restaurant shoot, budget ₹20,000"), undefined, "c");
ok(r.j.results.length === 1 && r.j.results[0].why.some((w) => /Role/.test(w)) && r.j.results[0].why.some((w) => /Within budget/.test(w)) && r.j.results[0].rating === null && r.j.results[0].completed === 0, "ranked with reasons; no invented rating or completed jobs");
r = await Z("market/" + proId, undefined, "c"); ok(r.j.pro.packages.length === 1 && r.j.pro.portfolio.length === 1 && r.j.pro.reviewsList.length === 0 && !("status" in r.j.pro) && !r.j.pro.blackout, "client profile view: packages + portfolio, private fields hidden");
r = await Z("shortlist", { proId, note: "Great food work" }, "c"); ok(r.j.items.length === 1 && r.j.items[0].note === "Great food work", "shortlist with a note");

/* ---------- 6. hiring → proposal → booking → milestone payment → delivery → approval → payout → review ---------- */
const sunday = (() => { for (let i = 3; i < 20; i++) if (dow(day(i)) === "sun") return day(i); })(), workday = nextDow(["mon", "tue", "wed", "thu", "fri"]);
r = await Z("projects", { proId, title: "Weekend reels", brief: "5 reels for our cafe launch weekend", packageId: pkg.id, day: sunday }, "c"); ok(r.status === 400 && /working day/.test(r.j.reason), "can't book a day the professional doesn't work");
r = await Z("projects", { proId, title: "Weekend reels", brief: "5 reels for our cafe launch weekend", packageId: pkg.id, day: workday, contentId: cid }, "c"); const pid = r.j.project && r.j.project.id;
ok(r.j.ok && r.j.project.status === "requested" && r.j.project.budget === 15000, "request with a package: price from the package, status Requested");
r = await Z("content", undefined, "c"); ok(r.j.items.find((x) => x.id === cid).status === "assigned" && r.j.items.find((x) => x.id === cid).project_id === pid, "the content item is linked to the project");
r = await Z("projects/" + pid, undefined, "o"); ok(r.status === 404, "another client can't see the project");
r = await Z("projects/" + pid + "/accept", {}, "c"); ok(r.status === 409, "can't accept before a proposal");
r = await Z("projects/" + pid + "/propose", { milestones: [{ title: "Shoot day", amount: 9000 }, { title: "Edit + 5 reels", amount: 6000 }] }, "c"); ok(r.status === 403, "only the professional proposes");
r = await Z("projects/" + pid + "/propose", { milestones: [{ title: "Shoot day", amount: 9000, due: workday }, { title: "Edit + 5 reels", amount: 6000 }] }, "p"); ok(r.j.project.status === "proposed" && r.j.project.milestones.length === 2 && r.j.project.budget === 15000, "proposal with 2 milestones");
r = await Z("projects", { proId, title: "Same day", brief: "Another shoot please on that day", day: workday }, "c2"); const pid2 = r.j.project.id;
r = await Z("projects/" + pid + "/accept", {}, "c"); ok(r.j.project.status === "accepted", "client accepts → booking made");
r = await Z("projects/" + pid2 + "/propose", { milestones: [{ title: "Shoot", amount: 8000 }] }, "p"); r = await Z("projects/" + pid2 + "/accept", {}, "c2"); ok(r.status === 409 && /booked/.test(r.j.reason), "no double booking: the same day can't be accepted twice");
r = await Z("projects", { proId, title: "Third", brief: "Yet another shoot that day", day: workday }, "o"); ok(r.status === 409, "…and a new request for a booked day is refused");
const ms1 = (await Z("projects/" + pid, undefined, "c")).j.project.milestones[0];
r = await call("checkout", { kind: "milestone", item: ms1.id, phone: "9876543210" }, { as: "o" }); ok(r.status === 404, "nobody else can pay your milestone");
r = await Z("projects/" + pid + "/submit", { milestoneId: ms1.id }, "p"); ok(r.status === 409, "work can't be submitted before the milestone is paid");
r = await call("checkout", { kind: "milestone", item: ms1.id, phone: "9876543210" }, { as: "c" }); const co = cf.filter((x) => x.m === "POST").pop();
ok(r.j.ok && co.body.order_amount === 9000 && /Pros milestone: Weekend reels: Shoot day/.test(co.body.order_note) && /\/workspace\/\?order_id=/.test(co.body.order_meta.return_url), "milestone checkout: amount from the database, returns to the workspace");
const moid = co.body.order_id; r = await call("verify", { order_id: moid }, { as: "c" }); ok(!r.j.paid && (await Z("projects/" + pid, undefined, "c")).j.project.milestones[0].status === "pending", "not paid → not funded");
cfPaid[moid] = 9000; r = await call("verify", { order_id: moid }, { as: "c" }); ok(r.j.paid && (await Z("projects/" + pid, undefined, "c")).j.project.milestones[0].status === "funded", "paid (confirmed with the gateway) → funded");
r = await call("checkout", { kind: "milestone", item: ms1.id, phone: "9876543210" }, { as: "c" }); ok(r.status === 409, "a funded milestone can't be paid twice");
r = await Z("notes", undefined, "p"); ok(r.j.items.some((n) => /Payment received by FODO/.test(n.text)), "professional told to start");
r = await Z("projects/" + pid + "/message", { body: "Shoot plan attached <script>x</script>" }, "p"); ok(r.j.project.messages.length === 1 && r.j.project.messages[0].who === "pro", "project messages");
r = await Z("projects/" + pid + "/approve", { milestoneId: ms1.id }, "c"); ok(r.status === 409, "can't approve work that wasn't submitted");
r = await Z("projects/" + pid + "/submit", { milestoneId: ms1.id, note: "https://drive.example/raw" }, "p"); ok(r.j.project.status === "in_progress" && r.j.project.milestones[0].status === "submitted", "work submitted → In progress");
r = await Z("projects/" + pid + "/approve", { milestoneId: ms1.id }, "p"); ok(r.status === 403, "the professional can't approve their own work");
r = await Z("projects/" + pid + "/changes", { milestoneId: ms1.id, note: "Brighter please" }, "c"); ok(r.j.project.milestones[0].status === "funded", "client requests changes");
await Z("projects/" + pid + "/submit", { milestoneId: ms1.id }, "p"); r = await Z("projects/" + pid + "/approve", { milestoneId: ms1.id }, "c"); ok(r.j.project.milestones[0].status === "approved" && r.j.project.status === "in_progress", "approved milestone 1");
r = await Z("projects/" + pid + "/review", { rating: 5 }, "c"); ok(r.status === 409, "no review before the project is completed");
const ms2 = r.status && (await Z("projects/" + pid, undefined, "c")).j.project.milestones[1];
await call("checkout", { kind: "milestone", item: ms2.id, phone: "9876543210" }, { as: "c" }); const mo2 = cf.filter((x) => x.m === "POST").pop().body.order_id; cfPaid[mo2] = 6000; await call("verify", { order_id: mo2 }, { as: "c" });
await Z("projects/" + pid + "/submit", { milestoneId: ms2.id }, "p"); r = await Z("projects/" + pid + "/approve", { milestoneId: ms2.id }, "c");
ok(r.j.project.status === "completed", "all milestones approved → Completed");
r = await Z("pro/earnings", undefined, "p"); ok(r.j.items.length === 2 && r.j.totals.net === 13500 && r.j.items.every((x) => x.status === "awaiting_provider") && !r.j.automatic, "payouts: 10% commission, honest 'awaiting provider' status (no fake payout)");
r = await Z("projects/" + pid + "/review", { rating: 5, text: "Brilliant reels" }, "c"); ok(r.j.project.review.rating === 5, "review after completion");
r = await Z("projects/" + pid + "/review", { rating: 1 }, "c"); ok(r.status === 409, "one review per project");
r = await Z("market/" + proId, undefined, "c2"); ok(r.j.pro.rating === 5 && r.j.pro.reviews === 1 && r.j.pro.completed === 1, "rating and completed count come only from real projects");

/* ---------- 7. finance + disputes ---------- */
r = await Z("admin/payouts", undefined, "m"); ok(r.status === 403, "a moderator can't see payouts");
await Z("admin/staff", { email: "client2@biz.in", role: "finance" }, "own");
r = await Z("admin/payouts", undefined, "c2"); const po = r.j.items[0]; ok(r.j.ok && r.j.items.length === 2 && !r.j.automatic, "finance sees payouts");
r = await Z("admin/payouts/" + po.id, { ref: "x" }, "c2"); ok(r.status === 400, "a transfer reference is required");
r = await Z("admin/payouts/" + po.id, { ref: "UPI-REF-778899" }, "c2"); ok(r.j.ok, "finance marks a payout paid with its reference");
r = await Z("admin/payouts/" + po.id, { ref: "UPI-REF-778899" }, "c2"); ok(r.status === 409, "…only once");
r = await Z("projects/" + pid2 + "/cancel", {}, "c2"); ok(r.j.project.status === "cancelled", "a request with no money in it can be cancelled");
r = await Z("projects", { proId, title: "Menu shoot", brief: "Photos of our new menu items", day: nextDow(["mon", "tue", "wed", "thu", "fri"], 12) }, "o"); const pid3 = r.j.project.id;
await Z("projects/" + pid3 + "/propose", { milestones: [{ title: "Shoot", amount: 5000 }] }, "p"); await Z("projects/" + pid3 + "/accept", {}, "o");
r = await Z("projects/" + pid3 + "/dispute", { reason: "short" }, "o"); ok(r.status === 400, "a dispute needs a reason");
r = await Z("projects/" + pid3 + "/dispute", { reason: "The professional stopped answering for a week." }, "o"); ok(r.j.project.status === "disputed", "client opens a dispute");
r = await Z("admin/disputes", undefined, "m"); const dsp = r.j.items.find((x) => x.project_id === pid3); ok(dsp && dsp.status === "open", "moderator sees it");
r = await Z("admin/disputes/" + dsp.id, { outcome: "cancelled", resolution: "Cancelled, nothing was paid." }, "m"); ok(r.j.ok && (await Z("projects/" + pid3, undefined, "o")).j.project.status === "cancelled", "dispute resolved → project cancelled, booking released");
r = await Z("admin/overview", undefined, "own"); ok(r.j.pros.live === 1 && r.j.projects.completed === 1 && r.j.money.commission === 1500 && r.j.money.owed === 13500 - po.net && r.j.automaticPayouts === false, "admin overview numbers come from the data");
r = await Z("admin/settings", { commission: 55 }, "own"); ok(r.status === 400, "commission capped at 40 %");
r = await Z("admin/settings", { commission: 12 }, "m"); ok(r.status === 403, "only owners change commission");

/* ---------- 8. dashboard, X-Ray actions, Brain, pages ---------- */
r = await Z("dashboard", undefined, "c"); ok(r.j.ok && r.j.cards.websites.total === 1 && r.j.cards.content.total === 1 && r.j.cards.campaigns.live === null && r.j.cards.spend.projects === 15000 && r.j.next.some((a) => /Publish “Spice Route”/.test(a.text)) && r.j.next.some((a) => /Business X-Ray/.test(a.text)), "dashboard: real numbers + Next Best Action from the account's data");
r = await Z("dashboard", undefined, "p"); ok(r.j.ok && r.j.cards.pro === "approved", "pro dashboard works too");
ok(actionsFor("Homepage has no clear call to action")[0].label === "Fix with Website Builder" && actionsFor("No professional food photography")[0].label === "Hire a Photographer" && actionsFor("Your ad creative lacks video").some((a) => /Video/.test(a.label)), "X-Ray findings map to Fix with Website Builder / Hire a Photographer / Hire a Video Creator");
ok(/fixLinks\(o\.title/.test(fs.readFileSync(new URL("../js/xray.js", import.meta.url), "utf8")), "the X-Ray report shows those action links");
ok(BRAIN_TOOLS && BRAIN_TOOLS.mk_overview && BRAIN_TOOLS.mk_pending_pros.level === 0 && BRAIN_TOOLS.mk_moderate_pro.level === 1, "Brain: marketplace overview + review queue (read) and moderation (confirm level 1)");
const ws = fs.readFileSync(new URL("../workspace/index.html", import.meta.url), "utf8"), rb = fs.readFileSync(new URL("../robots.txt", import.meta.url), "utf8"), hd = fs.readFileSync(new URL("../_headers", import.meta.url), "utf8");
ok(/noindex, nofollow/.test(ws) && /Disallow: \/workspace\//.test(rb) && /\/workspace\/\*\n  X-Robots-Tag: noindex/.test(hd) && !/workspace/.test(fs.readFileSync(new URL("../sitemap.xml", import.meta.url), "utf8")), "workspace (and pro profiles) are private: noindex, not in the sitemap, no public directory");
ok(PRO_ROLES.length >= 40, "role catalogue");
ok(!all.some((t) => /cf_SECRET_key|re_SECRETresend|test-sites-secret/.test(t)), "no secret in any response");
console.log(`\nv40: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
