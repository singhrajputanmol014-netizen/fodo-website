// v34 Store hardening: concurrency (last item, last coupon, simultaneous orders, double webhooks, double refunds), refund lifecycle,
// idempotent checkout, coupon/stock release, order-token privacy. Run: node --no-warnings tests/v34-store.test.mjs

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

/* Cashfree mock with refunds + signed webhooks */
const cfRefund = {}; const baseFetch = globalThis.fetch;
globalThis.fetch = async (u, o = {}) => { u = String(u);
  let m;
  if ((m = /cashfree\.com\/pg\/orders\/([^/]+)\/refunds(?:\/([^/?]+))?/.exec(u))) { cf.push({ u, m: o.method || "GET" });
    if ((o.method || "GET") === "POST") { const b = JSON.parse(o.body); if (cfRefund[b.refund_id]) return J({ message: "refund_id already exists" }, 409); cfRefund[b.refund_id] = { status: "PENDING", amount: b.refund_amount }; return J({ cf_refund_id: "CFR" + Object.keys(cfRefund).length, refund_id: b.refund_id, refund_status: "PENDING" }); }
    const x = cfRefund[m[2]]; return x ? J({ refund_id: m[2], cf_refund_id: "CFR1", refund_status: x.status }) : J({ message: "not found" }, 404); }
  return baseFetch(u, o); };
const cust = { name: "Meera", phone: "9876543210", email: "meera@example.com", address: "12 MI Road", city: "Jaipur", pin: "302001" };
const cust2 = Object.assign({}, cust, { name: "Ravi", phone: "9811111111" });

let r = await S("create", { name: "Kavya Clothing", industry: "Clothing boutique", location: "Jaipur", phone: "+91 98290 00000", whatsapp: "+91 98290 00000", email: "priya@smiledental.in", templateId: "boutique-store" });
const id = r.j.id;
r = await S(id + "/products", { title: "Last Kurta", price: 999, track: true, stock: 1 }); const last = r.j.id;
r = await S(id + "/products", { title: "Saree", price: 2999, track: true, optionName: "Colour", variants: [{ name: "Red", stock: 1 }, { name: "Blue", stock: 5 }] }); const saree = r.j.id;
r = await S(id + "/products", { title: "Scarf", price: 299, track: true, stock: 50 }); const scarf = r.j.id;
r = await S(id + "/discounts", { code: "ONLYONE", kind: "pct", value: 10, maxUses: 1 });
r = await S(id + "/payments", { appId: "TESTAPP123456", secret: "cfsk_ma_test_SUPERSECRET_999", mode: "sandbox" });
r = await S(id); const doc = r.j.site.doc; doc.settings.store = Object.assign(doc.settings.store || {}, { cod: true, online: true, whatsapp: true }); doc.pages.forEach((p) => { p.sections = p.sections.filter((x) => !/\[[A-Z][a-z]+ /.test(JSON.stringify(x))); }); r = await S(id, { doc, baseRev: r.j.site.rev }, "a", { method: "PUT" });
r = await S(id + "/publish", {}); if (!r.j.published) process.stderr.write(JSON.stringify(r.j).slice(0, 600) + "\n"); ok(r.j.published === true, "store published");
const stockOf = async (pid, vi) => { const L = (await S(id + "/products")).j.products, p = L.find((x) => x.id === pid); return vi == null ? p.stock : p.variants[vi].stock; };
const co = (b) => pub("shop/" + id + "/checkout", Object.assign({ method: "cod", customer: cust }, b));

/* 1. two buyers, the last item */
let [a1, a2] = await Promise.all([co({ items: [{ id: last, qty: 1 }] }), co({ customer: cust2, items: [{ id: last, qty: 1 }] })]);
ok([a1, a2].filter((x) => x.j.ok).length === 1 && [a1, a2].some((x) => x.status === 409), "two buyers, last item: exactly one order, the other is told it sold out");
ok(await stockOf(last) === 0, "…stock is 0, never negative");
let [v1, v2] = await Promise.all([co({ items: [{ id: saree, v: 0, qty: 1 }] }), co({ customer: cust2, items: [{ id: saree, v: 0, qty: 1 }] })]);
ok([v1, v2].filter((x) => x.j.ok).length === 1 && await stockOf(saree, 0) === 0 && await stockOf(saree, 1) === 5, "same for a variant (last red saree), other variants untouched");

/* 2. two users, the last coupon use */
let [c1, c2] = await Promise.all([co({ code: "ONLYONE", items: [{ id: scarf, qty: 1 }] }), co({ customer: cust2, code: "ONLYONE", items: [{ id: scarf, qty: 1 }] })]);
ok([c1, c2].filter((x) => x.j.ok).length === 1, "two buyers, last coupon use: only one order gets it");
let D = (await S(id + "/discounts")).j.discounts.find((x) => x.code === "ONLYONE"); ok(D.uses === 1, "…coupon used exactly once (max 1)");
ok(await stockOf(scarf) === 49, "…the refused order's stock was put back (50 → 49)");

/* 3. simultaneous orders get unique numbers */
const many = await Promise.all([0, 1, 2, 3, 4].map((i) => co({ customer: Object.assign({}, cust, { phone: "98100000" + (10 + i) }), items: [{ id: scarf, qty: 1 }] })));
const nums = many.map((x) => x.j.number); ok(many.every((x) => x.j.ok) && new Set(nums).size === 5, "5 simultaneous orders → 5 different order numbers (" + nums.join(",") + ")");

/* 4. the same checkout sent twice (double tap / retry) */
const IDK = "idem_" + Date.now().toString(36) + "abc";
let [i1, i2] = await Promise.all([co({ idem: IDK, items: [{ id: scarf, qty: 2 }] }), co({ idem: IDK, items: [{ id: scarf, qty: 2 }] })]);
ok(i1.j.ok && i2.j.ok && i1.j.order === i2.j.order, "same checkout sent twice → one order (idempotency key)");
ok(await stockOf(scarf) === 49 - 5 - 2, "…stock taken once");

/* 5. cancel puts stock + coupon back exactly once */
const cOk = [c1, c2].find((x) => x.j.ok).j;
r = await S(id + "/orders/" + cOk.order, { status: "cancelled" }); let r2 = await S(id + "/orders/" + cOk.order, { status: "cancelled" });
ok(r.j.ok && r2.status === 400, "cancel works once; cancelling again is refused");
D = (await S(id + "/discounts")).j.discounts.find((x) => x.code === "ONLYONE"); ok(D.uses === 0 && await stockOf(scarf) === 43, "…coupon freed and stock restored once (42 → 43)");

/* 6. online: stock + coupon reserved, released if the payment can't start */
const before = await stockOf(scarf); cfFailNext = true;
r = await co({ method: "online", code: "ONLYONE", items: [{ id: scarf, qty: 3 }], ret: "https://sites.fodo.co.in/kavya-clothing/" });
ok(r.status === 502 && await stockOf(scarf) === before && (await S(id + "/discounts")).j.discounts.find((x) => x.code === "ONLYONE").uses === 0, "payment page fails to start → stock and coupon released");
r = await co({ method: "online", code: "ONLYONE", items: [{ id: scarf, qty: 1 }], ret: "https://sites.fodo.co.in/kavya-clothing/" }); const on = r.j;
ok(on.ok && await stockOf(scarf) === before - 1 && (await S(id + "/discounts")).j.discounts.find((x) => x.code === "ONLYONE").uses === 1, "online order: stock and coupon reserved while paying");
ok(on.token.length >= 32 && /^[a-z0-9]+$/.test(on.token), "order token: 32+ random characters");

/* 7. two webhook deliveries + the return page at the same time → paid once */
cfPaid[on.order] = on.total / 100; const mails0 = mails.length;
const body = JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK", data: { order: { order_id: on.order } } }), ts = String(Date.now());
const sign = async (b, t, key) => { const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(t + b))))); };
const sig = await sign(body, ts, "cfsk_ma_test_SUPERSECRET_999");
const hook = (s) => sitesApi({ request: new Request(SITE + "/api/sites/shop/" + id + "/webhook", { method: "POST", headers: { "x-webhook-timestamp": ts, "x-webhook-signature": s, "content-type": "application/json" }, body }), env, params: { path: ["shop", id, "webhook"] } }).then(async (x) => ({ status: x.status, j: await x.json() }));
r = await hook("forged" + sig.slice(6)); ok(r.status === 401, "webhook with a bad signature is rejected");
const [w1, w2, w3] = await Promise.all([hook(sig), hook(sig), pub("shop/" + id + "/order/" + on.order + "?t=" + on.token)]);
ok(w1.j.status === "paid" && w2.j.status === "paid", "two webhook deliveries + the return page → order paid");
ok(mails.length - mails0 === 2 && await stockOf(scarf) === before - 1, "…settled exactly once (1 shop + 1 customer email, stock not taken again)");
ok(!("token" in w3.j.order), "order JSON never contains the token");

/* 8. refunds: online through Cashfree, two clicks → one refund, 'refunded' only after Cashfree confirms */
const [f1, f2] = await Promise.all([S(id + "/orders/" + on.order, { status: "refund", reason: "Customer asked" }), S(id + "/orders/" + on.order, { status: "refund", reason: "Customer asked" })]);
ok([f1, f2].filter((x) => x.j.ok).length === 1 && [f1, f2].some((x) => x.status === 409 || x.status === 400), "two refund clicks → one refund request");
let O = (await S(id + "/orders")).j.orders.find((x) => x.id === on.order);
ok(O.status === "refund_processing" && O.refund.amount === on.total && O.refund.id && O.refund.reason === "Customer asked" && O.refund.requested_at, "status is 'refund processing' with amount, reason, time and refund id (not 'refunded' yet)");
ok(Object.keys(cfRefund).length === 1 && await stockOf(scarf) === before, "…sent to Cashfree once; the unshipped item is back in stock");
r = await S(id + "/orders/" + on.order, { status: "refund-check" }); ok(r.j.status === "refund_processing", "Cashfree still pending → still processing");
cfRefund[O.refund.id].status = "SUCCESS"; r = await S(id + "/orders/" + on.order, { status: "refund-check" });
O = (await S(id + "/orders")).j.orders.find((x) => x.id === on.order); ok(r.j.status === "refunded" && O.refund.completed_at && O.refund.gateway_id, "Cashfree SUCCESS → refunded, with completion time + gateway refund id");

/* 9. COD refund is a confirmed manual action */
const cod = many[0].j; await S(id + "/orders/" + cod.order, { status: "shipped" }); await S(id + "/orders/" + cod.order, { status: "delivered" });
r = await S(id + "/orders/" + cod.order, { status: "refund" }); ok(r.status === 400 && /yourself/.test(r.j.reason), "COD order: FODO can't move cash, the merchant must confirm they paid it back");
r = await S(id + "/orders/" + cod.order, { status: "refund", manual: true }); O = (await S(id + "/orders")).j.orders.find((x) => x.id === cod.order);
ok(r.j.status === "refunded" && O.refund.manual === true, "…confirmed → refunded (marked manual)");

/* 10. old builders sending 'refunded' still work (mapped to the refund flow) */
r = await S(id + "/orders/" + many[1].j.order, { status: "refunded" }); ok(r.status === 400, "'refunded' from an older builder → same rules (COD needs the manual confirmation)");

/* 11. abandoned online payment: stock + coupon come back after 2 hours */
r = await co({ method: "online", customer: Object.assign({}, cust, { phone: "9822222222" }), items: [{ id: saree, v: 1, qty: 2 }], ret: "https://sites.fodo.co.in/kavya-clothing/" }); const ab = r.j; if (!ab.ok) process.stderr.write(JSON.stringify(ab) + "\n");
ok(await stockOf(saree, 1) === 3, "abandoned online order holds 2 blue sarees");
env.XRAY_DB.db.prepare("UPDATE site_orders SET created_at=? WHERE id=?").run(new Date(Date.now() - 3 * 3600e3).toISOString(), ab.order);
await S(id + "/orders"); O = (await S(id + "/orders")).j.orders.find((x) => x.id === ab.order);
ok(O.status === "cancelled" && await stockOf(saree, 1) === 5, "…after 2 hours unpaid it is cancelled and the stock returns");
cfPaid[ab.order] = ab.total / 100; r = await pub("shop/" + id + "/order/" + ab.order + "?t=" + ab.token);
ok(r.j.order.status === "paid" && await stockOf(saree, 1) === 3, "paid late anyway (Cashfree confirms) → paid, stock taken again");

/* 12. order lookups: token checked, rate limited, private headers on the page */
r = await pub("shop/" + id + "/order/" + on.order + "?t=" + on.token.slice(0, -1) + "x"); ok(r.status === 404, "wrong token → not found");
const look = () => sitesApi({ request: new Request(SITE + "/api/sites/shop/" + id + "/order/" + on.order + "?t=x", { headers: { "cf-connecting-ip": "7.7.7.7" } }), env, params: { path: ["shop", id, "order", on.order] } });
let last429 = 0; for (let i = 0; i < 125; i++) { const x = await look(); if (x.status === 429) { last429 = i; break; } } ok(last429 > 0, "order lookups are rate limited per IP (429 after " + last429 + ")");
const pg = await site("https://sites.fodo.co.in/kavya-clothing/order/" + on.order + "/?t=" + on.token);
ok(pg.h.get("referrer-policy") === "no-referrer" && /no-store/.test(pg.h.get("cache-control")) && /noindex/.test(pg.h.get("x-robots-tag") || ""), "order page: no-referrer (token never leaks), no-store, noindex");

ok(!all.some((t) => /SUPERSECRET/.test(t)), "store secret never in a response");
console.log("\nv34 store: " + pass + "/" + (pass + fail) + " passed"); process.exit(fail ? 1 : 0);
