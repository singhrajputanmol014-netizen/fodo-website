// v34 website settings (booking, analytics, review link, founding counter) + first-party enquiries. Run: node --no-warnings tests/v34-site.test.mjs

import { DatabaseSync } from "node:sqlite";
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
const dns = {}, cf = [], cfPaid = {}; let cfCalls = [], mails = [];
globalThis.fetch = async (u, o = {}) => { u = String(u);
  if (/cloudflare-dns\.com\/dns-query/.test(u)) { const q = new URL(u), k = q.searchParams.get("name") + "|" + q.searchParams.get("type"); return J({ Answer: (dns[k] || []).map((d) => ({ data: d })) }); }
  if (/api\.cloudflare\.com/.test(u)) { cfCalls.push((o.method || "GET") + " " + u.replace(/^.*\/projects\//, "")); return (o.method || "GET") === "GET" ? J({ success: false, errors: [{ code: 8000007 }] }, 404) : J({ success: true, result: { status: "active" } }); }
  if (/api\.resend\.com/.test(u)) { mails.push(JSON.parse(o.body)); return J({ id: "m1" }); }
  if (/\/api\/sites\/view\//.test(u)) return new Response("ok", { status: 200 });
  if (/cashfree\.com\/pg\//.test(u)) { const id = o.headers && o.headers["x-client-id"]; cf.push({ u, m: o.method || "GET", id, body: o.body ? JSON.parse(o.body) : null });
    if (id === "BADKEY") return J({ message: "authentication Failed" }, 401);
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
await login("priya@smiledental.in", "starter", "a"); await login("rahul@otherbiz.in", null, "b"); await login("anmol@fodo.co.in", null, "own");
const S = (p, body, who, o) => call("sites/" + p, body, Object.assign({ as: who || "a" }, o || {}));

import { quote } from "../functions/_lib/shop.js";
import { md } from "../sites/lib/shop.js";
const site = async (url, init) => { const res = await sitesProject({ request: new Request(url, init), env }); return { status: res.status, t: await res.text(), h: res.headers }; };
const pub = (path, body, o) => sitesApi({ request: new Request(SITE + "/api/sites/" + path, Object.assign({ method: body ? "POST" : "GET", headers: { "content-type": "text/plain", origin: "https://sites.fodo.co.in" } }, body ? { body: JSON.stringify(body) } : {}, o || {})), env, params: { path: path.split("?")[0].split("/") } }).then(async (r) => { const t = await r.text(); all.push(t); return { status: r.status, j: JSON.parse(t) }; });
import { onRequestGet as siteCfg } from "../functions/api/site-config.js";
import { onRequestPost as leadsApi } from "../functions/api/leads.js";
const cfgGet = async () => (await siteCfg({ env })).json();
const lead = (b, h) => leadsApi({ request: new Request(SITE + "/api/leads", { method: "POST", headers: Object.assign({ origin: SITE, "content-type": "application/json", "cf-connecting-ip": "4.4.4.4" }, h || {}), body: JSON.stringify(b) }), env }).then(async (r) => ({ status: r.status, j: await r.json() }));

let c = await cfgGet(); ok(c.ok && c.config.foundingSlotsTotal === 10 && c.config.foundingSlotsOpen === 10 && c.config.bookingUrl === "" && !("leadEmail" in c.config), "public settings: defaults, open slots computed, private fields hidden");
let r = await call("admin/site-settings", undefined, { as: "own" }); ok(r.j.ok && r.j.canEdit && r.j.defaults, "owner opens Website settings");
r = await call("admin/site-settings", { ga4Id: "UA-123", bookingUrl: "javascript:alert(1)", reviewUrl: "http://x.com", foundingSlotsTaken: 50 }, { as: "own" });
ok(!r.j.ok && r.j.errors.length >= 4, "bad values refused with clear reasons (GA4 format, https links, slots)");
r = await call("admin/site-settings", { ga4Id: "g-abc12345", metaPixelId: "123456789012", bookingUrl: "https://cal.com/fodo/30min", bookingProvider: "Cal.com", reviewUrl: "https://g.page/r/abc/review", foundingSlotsTotal: 10, foundingSlotsTaken: 3, foundingCohort: "Q1 2027", leadEmail: "sales@fodo.co.in" }, { as: "own" });
ok(r.j.ok && r.j.config.ga4Id === "G-ABC12345", "valid settings saved (GA4 ID normalised)");
c = await cfgGet(); ok(c.config.bookingUrl === "https://cal.com/fodo/30min" && c.config.foundingSlotsOpen === 7 && c.config.foundingCohort === "Q1 2027" && !("leadEmail" in c.config), "public endpoint shows the new values (7 of 10 slots open), never the enquiry email");
r = await call("admin/site-settings", { ga4Id: "G-HACKED1" }, { as: "a" }); ok(r.status === 403, "a customer can't change website settings");

/* enquiries */
mails = [];
r = await lead({ mode: "audit", name: "Meera Shah", email: "meera@shop.in", business: "Meera Fashion", website: "meera.in", goal: "More leads", budget: "₹50k", page: "/contact/?mode=audit", source: "google", campaign: "diwali" });
ok(r.j.ok && /^ld_/.test(r.j.id), "audit form → enquiry saved");
ok(mails.some((m) => (m.to === "sales@fodo.co.in" || (Array.isArray(m.to) && m.to.indexOf("sales@fodo.co.in") > -1)) && /Meera Fashion/.test(m.subject)), "…the team is emailed at the configured address");
r = await lead({ name: "X" }); ok(r.status === 400, "name + a way to reach them are required");
r = await lead({ name: "Bot", email: "b@b.co", website_url: "spam" }); ok(r.j.ok && !(await call("admin/enquiries", undefined, { as: "own" })).j.items.some((x) => x.name === "Bot"), "honeypot: bots get a quiet OK, nothing stored");
r = await lead({ name: "Evil", email: "e@e.co" }, { origin: "https://evil.example" }); ok(r.status === 403, "other websites can't post enquiries");
let hit = 0; for (let i = 0; i < 10; i++) { const x = await lead({ name: "Flood " + i, email: "f" + i + "@x.co" }, { "cf-connecting-ip": "8.8.4.4" }); if (x.status === 429) { hit = i; break; } } ok(hit > 0, "rate limited per visitor (429 after " + hit + ")");
r = await call("admin/enquiries", undefined, { as: "own" }); const E = r.j.items.find((x) => x.name === "Meera Shah");
ok(E && E.status === "new" && E.page === "/contact/?mode=audit" && E.source === "google" && E.campaign === "diwali" && E.data.goal === "More leads" && !("ip_hash" in E), "admin sees the enquiry with page, source, campaign and answers (no IP data)");
r = await call("admin/enquiries/" + E.id, { status: "contacted", notes: "Called, sending proposal" }, { as: "own" }); const E2 = (await call("admin/enquiries", undefined, { as: "own" })).j.items.find((x) => x.id === E.id);
ok(r.j.ok && E2.status === "contacted" && E2.notes === "Called, sending proposal", "status + notes saved");
r = await call("admin/enquiries/" + E.id, { status: "hacked" }, { as: "own" }); ok(r.status === 400, "unknown status refused");
r = await call("admin/enquiries", undefined, { as: "a" }); ok(r.status === 403, "customers can't read enquiries");
r = await call("admin/enquiries?status=contacted", undefined, { as: "own" }); ok(r.j.items.length >= 1 && r.j.items.every((x) => x.status === "contacted"), "filter by status");
console.log("\nv34 site: " + pass + "/" + (pass + fail) + " passed"); process.exit(fail ? 1 : 0);
