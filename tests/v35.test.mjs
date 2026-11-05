// v35: media library (dedupe, alt/folder/focal, delete-in-use, tenants, roles), absolute media on live sites, image size + focal point,
// CSP report-only + reports, client-site conversions, partial refunds, on-demand chatbot. Run: node --no-warnings tests/v35.test.mjs

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
await login("priya@smiledental.in", "starter", "a"); await login("rahul@otherbiz.in", null, "b"); await login("anmol@fodo.co.in", null, "own");
const S = (p, body, who, o) => call("sites/" + p, body, Object.assign({ as: who || "a" }, o || {}));

import { quote } from "../functions/_lib/shop.js";
import { md } from "../sites/lib/shop.js";
const site = async (url, init) => { const res = await sitesProject({ request: new Request(url, init), env }); return { status: res.status, t: await res.text(), h: res.headers }; };
const pub = (path, body, o) => sitesApi({ request: new Request(SITE + "/api/sites/" + path, Object.assign({ method: body ? "POST" : "GET", headers: { "content-type": "text/plain", origin: "https://sites.fodo.co.in" } }, body ? { body: JSON.stringify(body) } : {}, o || {})), env, params: { path: path.split("?")[0].split("/") } }).then(async (r) => { const t = await r.text(); all.push(t); return { status: r.status, j: JSON.parse(t) }; });

const cfRefund = {}; const baseFetch = globalThis.fetch;
globalThis.fetch = async (u, o = {}) => { u = String(u);
  let m;
  if ((m = /cashfree\.com\/pg\/orders\/([^/]+)\/refunds(?:\/([^/?]+))?/.exec(u))) { cf.push({ u, m: o.method || "GET" });
    if ((o.method || "GET") === "POST") { const b = JSON.parse(o.body); if (cfRefund[b.refund_id]) return J({ message: "refund_id already exists" }, 409); cfRefund[b.refund_id] = { status: "PENDING", amount: b.refund_amount }; return J({ cf_refund_id: "CFR" + Object.keys(cfRefund).length, refund_id: b.refund_id, refund_status: "PENDING" }); }
    const x = cfRefund[m[2]]; return x ? J({ refund_id: m[2], cf_refund_id: "CFR1", refund_status: x.status }) : J({ message: "not found" }, 404); }
  return baseFetch(u, o); };
const cust = { name: "Meera", phone: "9876543210", email: "meera@example.com", address: "12 MI Road", city: "Jaipur", pin: "302001" };
const cust2 = Object.assign({}, cust, { name: "Ravi", phone: "9811111111" });
import { readFileSync } from "node:fs";
import { onRequestPost as cspPost } from "../functions/api/csp-report.js";
await login("viewer@client.in", null, "v");
let r = await S("create", { name: "Kavya Clothing", industry: "Clothing boutique", location: "Jaipur", phone: "+91 98290 00000", email: "priya@smiledental.in", templateId: "boutique-store" }); const id = r.j.id;
await S("create", { name: "Rahul Biz" }, "b"); const idB = (await S("list", undefined, "b")).j.sites[0].id;
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
const up = (sid, who, q, bytes) => call("sites/" + sid + "/media?" + (q || "name=shop.webp&w=1600&h=900&alt=Shop%20front&folder=Store"), undefined, { as: who || "a", method: "POST", headers: { "content-type": "image/png" }, body: bytes || png }).catch((e) => ({ status: 0, j: { ok: false, reason: String(e) } }));
/* call() only sends JSON; send raw bytes directly */
const raw = async (sid, who, q, bytes) => { const req = new Request(SITE + "/api/sites/" + sid + "/media?" + (q || "name=shop.webp&w=1600&h=900&alt=Shop%20front&folder=Store"), { method: "POST", headers: Object.assign({ origin: SITE, "content-type": "image/png" }, jars[who || "a"] ? { cookie: jars[who || "a"] } : {}), body: bytes || png });
  const res = await sitesApi({ request: req, env, params: { path: [sid, "media"] } }); const t = await res.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { status: res.status, j }; };

/* ---------- media library ---------- */
r = await raw(id); ok(r.j.ok && /^\/api\/sites\/media\/[a-z0-9]{20}$/.test(r.j.url), "upload an image with size, alt text and folder"); const m1 = r.j.id;
r = await raw(id); ok(r.j.ok && r.j.duplicate && r.j.id === m1, "the same image uploaded again is stored once (de-duplicated)");
r = await S(id + "/media"); let M = r.j.items.find((x) => x.id === m1); ok(M && M.width === 1600 && M.height === 900 && M.alt === "Shop front" && M.folder === "Store" && r.j.items.length === 1, "library lists size, alt text and folder");
r = await S(id + "/media/" + m1, { alt: "Kavya Clothing shop front in Jaipur", folder: "Shop", name: "front", focal: "30,70" }); M = (await S(id + "/media")).j.items[0];
ok(r.j.ok && M.alt === "Kavya Clothing shop front in Jaipur" && M.folder === "Shop" && M.focal === "30,70" && M.name === "front", "rename, alt text, folder and focal point saved");
r = await S(id + "/media/" + m1, { focal: "130,5" }); ok(r.status === 400, "focal point outside 0–100 refused");
r = await S(id + "/media/" + m1, { alt: "hacked" }, "b"); ok(r.status === 404 || r.status === 403, "another customer can't edit the image");
r = await S(idB + "/media/" + m1, { alt: "hacked" }, "b"); ok(r.status === 404, "…not even through their own website id");
r = await S(id + "/media/" + m1, undefined, "b", { method: "DELETE" }); ok(r.status === 404 || r.status === 403, "…or delete it");
await S(id + "/members", { email: "viewer@client.in", role: "viewer" }); r = await raw(id, "v"); ok(r.status === 403, "a viewer can't upload");
r = await S(id + "/media/" + m1, { alt: "x" }, "v"); ok(r.status === 403, "…or edit images");
/* used on a page → delete warns, force deletes */
let doc = (await S(id)).j.site.doc, rev = (await S(id)).j.site.rev; const hero = doc.pages[0].sections.findIndex((s) => s.type === "hero"); doc.pages[0].sections[hero].props.image = "/api/sites/media/" + m1 + "#w=1600&h=900&fp=30,70"; doc.pages[0].sections[hero].props.align = "left";
doc.pages.forEach((p) => { p.sections = p.sections.filter((x, i) => (p.slug === "home" && i === hero) || !/\[[A-Z][a-z]+[ \]]/.test(JSON.stringify(x))); }); doc.settings.store = Object.assign(doc.settings.store || {}, { cod: true, online: true });
r = await S(id, { doc, baseRev: rev }, "a", { method: "PUT" }); ok(r.j.ok, "image with size + focal point saved on the hero");
r = await S(id + "/media/" + m1, undefined, "a", { method: "DELETE" }); ok(r.status === 409 && r.j.inUse.length === 1, "deleting an image in use warns where it is used");
/* render: size + focal point */
const html = renderPage((await S(id)).j.site.doc, "home", {}); const tag = (/<img[^>]+media\/[a-z0-9]{20}[^>]*>/.exec(html) || [""])[0];
ok(/width="1600"/.test(tag) && /height="900"/.test(tag) && /object-position:30% 70%/.test(tag), "published image gets width/height (no layout shift) and the focal point");
ok(safeUrl("/api/sites/media/" + m1 + "#w=1&h=1&fp=1,2") && !safeUrl("/api/sites/media/" + m1 + "#<script>") && !safeUrl("/api/sites/media/" + m1 + "#w=1\"onerror=x"), "only a safe fragment is accepted on media URLs");
/* live site: absolute media URLs */
await S(id + "/payments", { appId: "TESTAPP123456", secret: "cfsk_ma_test_SUPERSECRET_999", mode: "sandbox" });
r = await S(id + "/publish", {}); if (!r.j.published) process.stderr.write(JSON.stringify(r.j.issues || r.j).slice(0, 300) + "\n");
const slug = (await S(id)).j.site.slug, live = await site("https://sites.fodo.co.in/" + slug + "/");
ok(/src="https:\/\/www\.fodo\.co\.in\/api\/sites\/media\/[a-z0-9]{20}/.test(live.t) && !/src="\/api\/sites\/media\//.test(live.t), "live site on sites.fodo.co.in points images at FODO's API (no broken relative URLs)");
r = await S(id + "/media/" + m1 + "?force=1", undefined, "a", { method: "DELETE" }); ok(r.j.ok && r.j.wasUsed.length === 1 && !(await S(id + "/media")).j.items.length, "…delete anyway works and is reported");

/* ---------- client-site conversions ---------- */
const ev = (b) => sitesApi({ request: new Request(SITE + "/api/sites/e", { method: "POST", headers: { "content-type": "text/plain", "cf-connecting-ip": "3.3.3." + Math.floor(Math.random() * 200) }, body: JSON.stringify(Object.assign({ s: id, p: "/" }, b)) }), env, params: { path: ["e"] } });
for (let i = 0; i < 8; i++) await ev({ t: "view", d: i < 5 ? "mobile" : "desktop" }); await ev({ t: "cta", x: "contact:whatsapp" }); await ev({ t: "cta", x: "contact:phone" }); await ev({ t: "cta", x: "Book Appointment" });
r = await S(id + "/stats?days=30"); const st = r.j;
ok(st.views === 8 && st.contacts === 2 && st.ctaClicks === 1 && st.contactBy.some((x) => x[0] === "whatsapp") && st.devices[0][0] === "mobile", "views, devices, button clicks and phone / WhatsApp taps counted separately");
ok(st.trend.length === 30 && st.trend[29][1] === 8 && st.conversions === st.forms + st.contacts + st.orders && st.conversionRate === Math.round(st.conversions / 8 * 1000) / 10, "daily trend (30 days) + real conversion rate");
const live2 = await site("https://sites.fodo.co.in/" + slug + "/"); ok(/contact:whatsapp/.test(live2.t), "the live page tracks WhatsApp / phone / email taps");

/* ---------- partial refund ---------- */
r = await S(id + "/products", { title: "Scarf", price: 1000, track: true, stock: 5 }); const scarf = r.j.id;
r = await pub("shop/" + id + "/checkout", { method: "online", customer: cust, items: [{ id: scarf, qty: 2 }], ret: "https://sites.fodo.co.in/" + slug + "/" }); const on = r.j; cfPaid[on.order] = on.total / 100;
r = await pub("shop/" + id + "/order/" + on.order + "?t=" + on.token); ok(r.j.order.status === "paid", "online order paid");
r = await S(id + "/orders/" + on.order, { status: "refund", amount: 500, reason: "One scarf returned" }); let O = (await S(id + "/orders")).j.orders.find((x) => x.id === on.order);
ok(r.j.ok && O.refund.amount === 50000 && O.refund.partial === true && O.status === "refund_processing", "partial refund (₹500 of " + on.total / 100 + ") sent to Cashfree with the right amount");
ok((await S(id + "/products")).j.products.find((p) => p.id === scarf).stock === 3, "…a partial refund doesn't put the whole order back in stock");
r = await S(id + "/orders/" + on.order, { status: "refund", amount: 999999 }); ok(r.status === 400 || r.status === 409, "can't start a second refund while one is processing");

/* ---------- security headers + CSP reports ---------- */
const HDR = readFileSync(new URL("../_headers", import.meta.url), "utf8");
ok(/^\/\*\n  Content-Security-Policy-Report-Only: default-src 'self'/m.test(HDR) && /report-uri \/api\/csp-report/.test(HDR) && /Strict-Transport-Security: max-age=31536000/.test(HDR) && /Permissions-Policy: camera=\(\), microphone=\(self\)/.test(HDR), "site-wide headers: report-only CSP (+ report endpoint), HSTS, Permissions-Policy");
ok(!/^\/\*\n(  .+\n)*  X-Frame-Options/m.test(HDR), "no site-wide header that clashes with the stricter Brain / admin headers");
ok(/Content-Security-Policy-Report-Only/.test(fs.readFileSync(new URL("../scripts/build_pages.py", import.meta.url), "utf8")) && /\/js\/\*\n  Cache-Control: no-cache/.test(HDR), "headers are written by build_pages (a rebuild can not drop them) + module no-cache rules kept");
const rep = (body, ip) => cspPost({ request: new Request(SITE + "/api/csp-report", { method: "POST", headers: { "content-type": "application/csp-report", "cf-connecting-ip": ip || "2.2.2.2" }, body: JSON.stringify(body) }), env });
await rep({ "csp-report": { "document-uri": "https://www.fodo.co.in/plans/?email=secret@x.com", "effective-directive": "script-src-elem", "blocked-uri": "https://evil.example/x.js?token=abc" } });
await rep({ "csp-report": { "document-uri": "https://www.fodo.co.in/plans/?email=other@x.com", "effective-directive": "script-src-elem", "blocked-uri": "https://evil.example/y.js" } });
await rep([{ type: "csp-violation", body: { documentURL: "https://www.fodo.co.in/", effectiveDirective: "img-src", blockedURL: "inline" } }]);
r = await call("admin/security", undefined, { as: "own" }); const R1 = r.j.items.find((x) => x.blocked === "https://evil.example");
ok(r.j.ok && R1 && R1.n === 2 && R1.page === "/plans/" && R1.directive === "script-src-elem" && r.j.items.length === 2, "reports grouped by directive · origin · page (2 + 1)");
ok(!/secret@x\.com|token=abc/.test(JSON.stringify(r.j)), "no query strings, emails or tokens are stored");
r = await call("admin/security", undefined, { as: "a" }); ok(r.status === 403, "only the FODO team sees security reports");
let lim = 0; for (let i = 0; i < 65; i++) { await rep({ "csp-report": { "document-uri": "https://www.fodo.co.in/x" + i + "/", "effective-directive": "img-src", "blocked-uri": "https://a.example" } }, "9.9.9.9"); }
r = await call("admin/security", undefined, { as: "own" }); ok(r.j.items.filter((x) => x.blocked === "https://a.example").length <= 60, "reports are rate limited per visitor");
r = await call("admin/security/clear", {}, { as: "own" }); ok(r.j.ok && !(await call("admin/security", undefined, { as: "own" })).j.items.length, "team can clear the list");

/* ---------- on-demand chatbot (built pages) ---------- */
const about = readFileSync(new URL("../about/index.html", import.meta.url), "utf8") + (/js\/boot-tail\.js/.test(readFileSync(new URL("../about/index.html", import.meta.url), "utf8")) ? readFileSync(new URL("../js/boot-tail.js", import.meta.url), "utf8") : "");   /* v50.8: the loader moved from an inline script to js/boot-tail.js (enforced CSP) */
ok(/bot-ph/.test(about) && /FODO_BOT_LOAD/.test(about) && !/\["pointerdown","keydown","scroll","touchstart"\]\.forEach\(function\(e\)\{addEventListener\(e,go/.test(about), "chatbot: light Ask FODO button at once, the ~246 KB bot loads on demand (not on the first scroll / tap)");
ok(/s\.async=false/.test(about) && /saveData/.test(about), "…bot files download in parallel, and Save-Data / 2G visitors only get it when they tap");
ok(!all.some((t) => /SUPERSECRET|re_SECRETresendKEY/.test(t)), "no secret in any response");
console.log("\nv35: " + pass + "/" + (pass + fail) + " passed"); process.exit(fail ? 1 : 0);
