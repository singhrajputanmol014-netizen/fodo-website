// v29 FODO Website Builder Phase 2: store (products, variants, stock, cart/checkout, discounts, shipping/tax, the merchant's own Cashfree,
// COD, WhatsApp orders, order flow) + blog (draft/scheduled/published, safe markdown). Run: node --no-warnings tests/v29-store.test.mjs

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

/* templates */
ok(TEMPLATES.some((t) => t.id === "boutique-store") && TEMPLATES.some((t) => t.id === "journal-blog") && TEMPLATES.every((t) => clientAllowed(t.license)), "store + blog templates exist (FODO-original license)");
let r = await S("recommend?q=" + encodeURIComponent("clothing boutique sell products")); ok(r.j.templates[0].id === "boutique-store", "recommendation: a clothing shop gets the store template");

/* create a store */
r = await S("create", { name: "Kavya Clothing", industry: "Clothing boutique", location: "Jaipur", phone: "+91 98290 00000", whatsapp: "+91 98290 00000", email: "priya@smiledental.in", style: "Premium", goal: "Sell products", templateId: "boutique-store" });
const id = r.j.id; ok(r.j.ok && /^ws_/.test(id), "store website created from the boutique template");
await S("create", { name: "Rahul Biz" }, "b"); const bl = await S("list", undefined, "b"); const idB = bl.j.sites[0].id;

/* products: tenant isolation */
r = await S(id + "/products", { title: "Block-print Kurta", price: "1,499", compare: "1999", description: "Hand **block printed** cotton.", collection: "Kurtas", track: true, optionName: "Size", variants: [{ name: "S", price: "", stock: 2 }, { name: "M", price: "1599", stock: 1 }], images: ["https://cdn.example.com/k.jpg", "javascript:alert(1)", "http://insecure/x.jpg"] });
const kurta = r.j.id; ok(r.j.ok && /^pr_/.test(kurta) && r.j.slug === "block-print-kurta", "add a product (₹ parsed from '1,499')");
r = await S(id + "/products", { title: "Cotton Dupatta", price: 499, track: true, stock: 3, collection: "Dupattas" }); const dup = r.j.id;
r = await S(id + "/products", { title: "Gift card", price: 0 }); ok(r.status === 400 && /price/i.test(r.j.reason), "a product needs a price");
r = await S(id + "/products"); const K = r.j.products.find((p) => p.id === kurta);
ok(K.price === 149900 && K.compare === 199900 && K.variants[0].price === 149900 && K.variants[1].price === 159900 && K.images.length === 1, "prices stored in paise; variants inherit the price; only https images kept");
r = await S(id + "/products", undefined, "b"); ok(r.status === 404, "another customer can't list this store's products");
r = await S(id + "/products/" + kurta, { title: "hacked", price: 1 }, "b", { method: "PUT" }); ok(r.status === 404, "…or edit them");
r = await S(idB + "/products/" + kurta, { title: "hacked", price: 1 }, "b", { method: "PUT" }); ok(r.status === 404 && /not found/i.test(r.j.reason), "…not even through their OWN website id (product id belongs to another site)");
r = await S(idB + "/products/" + kurta, undefined, "b", { method: "DELETE" }); r = await S(id + "/products"); ok(r.j.products.length === 2, "…and can't delete them that way either");
r = await S(id + "/orders", undefined, "b"); ok(r.status === 404, "orders are private to the store owner");

/* store settings + publish */
r = await S(id); const doc = r.j.site.doc;
doc.pages.forEach((p) => { p.sections = p.sections.filter((s) => s.type !== "testimonials"); p.seo = { title: p.title + ": Kavya", description: "Handmade clothing from Jaipur." }; });
doc.settings.store = { currency: "INR", cod: false, whatsapp: false, online: false, shipping: { flat: "60", freeAbove: "2000" }, tax: { pct: "5", inclusive: true } };
r = await S(id, { doc, baseRev: r.j.site.rev }, "a", { method: "PUT" }); let rev = r.j.rev;
r = await S(id + "/publish", {}); ok(r.j.published === false && r.j.issues.some((x) => /no way to order/.test(x.msg)), "publish blocked: a store with no payment method");
doc.settings.store.cod = true; doc.settings.store.whatsapp = true; doc.settings.store.online = true; r = await S(id, { doc, baseRev: rev }, "a", { method: "PUT" }); rev = r.j.rev;
r = await S(id + "/publish", {}); ok(r.j.published === true, "publish with COD + WhatsApp + online");
ok(!checkSite(doc).issues.some((x) => /doesn't exist: \/cart\//.test(x.msg)), "cart/checkout/blog links count as real pages");

/* storefront */
r = await site("https://sites.fodo.co.in/kavya-clothing/"); ok(r.status === 200 && /Block-print Kurta/.test(r.t) && /₹1,499/.test(r.t) && /Choose options/.test(r.t) && /data-add="pr_/.test(r.t) && /fodo-cart-/.test(r.t), "home shows real products (variants → Choose options, others → Add to cart) + cart script");
r = await site("https://sites.fodo.co.in/kavya-clothing/p/block-print-kurta/"); ok(r.status === 200 && /<strong>block printed<\/strong>/.test(r.t) && /id="pd-v"/.test(r.t) && /Product/.test(r.t) && /"@type":"Product"|"@type": "Product"/.test(r.t), "product page: description (safe markdown), option picker, Product structured data");
r = await site("https://sites.fodo.co.in/kavya-clothing/p/nope/"); ok(r.status === 404, "unknown product → 404");
r = await site("https://sites.fodo.co.in/kavya-clothing/cart/"); ok(r.status === 200 && /cart-box/.test(r.t) && /noindex/.test(r.t) && r.h.get("cache-control") === "no-store", "cart page (noindex, not cached)");
r = await site("https://sites.fodo.co.in/kavya-clothing/checkout/"); ok(/name="method"/.test(r.t) && /value="cod"/.test(r.t) && /value="online"/.test(r.t) && /value="whatsapp"/.test(r.t), "checkout offers the enabled payment methods");
r = await site("https://sites.fodo.co.in/kavya-clothing/sitemap.xml"); ok(/\/p\/block-print-kurta\//.test(r.t), "products are in the sitemap");

/* checkout: the server prices everything */
const cust = { name: "Meera", phone: "9876543210", email: "meera@example.com", address: "12 MI Road", city: "Jaipur", pin: "302001" };
r = await pub("shop/" + id + "/checkout", { method: "cod", customer: cust, items: [{ id: dup, qty: 2, price: 1 }], total: 1 });
ok(r.j.ok && r.j.total === 99800 + 6000 && r.j.number === 1001, "COD order: browser's price ignored, 2 × ₹499 + ₹60 shipping = ₹1,058");
let o1 = r.j; r = await S(id + "/products"); ok(r.j.products.find((p) => p.id === dup).stock === 1, "stock taken at order time (3 → 1)");
ok(mails.some((m) => /New order #1001/.test(m.subject) && m.to.indexOf("priya@smiledental.in") > -1) && mails.some((m) => /Your order #1001/.test(m.subject)), "emails: merchant + customer");
r = await pub("shop/" + id + "/checkout", { method: "cod", customer: cust, items: [{ id: dup, qty: 5 }] }); ok(r.status === 409 && /only 1 left/.test(r.j.reason), "can't buy more than in stock");
r = await pub("shop/" + id + "/checkout", { method: "cod", customer: cust, items: [{ id: kurta, qty: 1 }] }); ok(r.status === 400 && /Choose an option/.test(r.j.reason), "variant product needs an option");
r = await pub("shop/" + id + "/checkout", { method: "cod", customer: cust, items: [{ id: kurta, v: 1, qty: 1 }, { id: dup, qty: 1 }], code: "NOPE" }); ok(r.status === 400 && /discount code/.test(r.j.reason), "unknown discount code refused");
r = await pub("shop/" + idB + "/checkout", { method: "cod", customer: cust, items: [{ id: dup, qty: 1 }] }); ok(r.status === 404 || r.status === 409, "another store's checkout can't sell this store's product");
r = await pub("shop/" + id + "/checkout", { method: "cod", customer: Object.assign({}, cust, { phone: "12" }), items: [{ id: dup, qty: 1 }] }); ok(r.status === 400, "customer details validated on the server");

/* discounts */
r = await S(id + "/discounts", { code: "diwali10", kind: "pct", value: 10, min: 1000, maxUses: 1 }); ok(r.j.ok && r.j.code === "DIWALI10", "discount code saved (upper-cased)");
r = await S(id + "/discounts", undefined, "b"); ok(r.status === 404, "discount codes private");
ok(JSON.stringify(quote({ shipping: { flat: "60", freeAbove: "2000" }, tax: { pct: "5", inclusive: true } }, [{ price: 159900, qty: 1 }, { price: 49900, qty: 1 }], { kind: "pct", value: 10 })) === JSON.stringify({ subtotal: 209800, discount: 20980, shipping: 6000, tax: 8991, total: 194820, taxInclusive: true }), "quote: 10% off, shipping applies below ₹2,000 after discount, GST 5% included");
ok(quote({ tax: { pct: 18, inclusive: false } }, [{ price: 10000, qty: 1 }]).total === 11800, "quote: tax added on top when prices exclude GST");

/* online payment with the merchant's OWN Cashfree */
r = await S(id + "/payments", { appId: "BADKEY", secret: "x", mode: "sandbox" }); ok(r.status === 400 && /rejected/.test(r.j.reason), "wrong Cashfree keys are rejected");
r = await S(id + "/payments", { appId: "TESTAPP123456", secret: "cfsk_ma_test_SUPERSECRET_999", mode: "production" }); ok(r.status === 400 && /TEST App ID/.test(r.j.reason), "TEST keys can't be saved as production");
r = await S(id + "/payments", { appId: "TESTAPP123456", secret: "cfsk_ma_test_SUPERSECRET_999", mode: "sandbox" }); ok(r.j.ok && r.j.connected, "Cashfree connected (keys checked)");
r = await S(id + "/payments"); ok(r.j.connected && r.j.meta.mode === "sandbox" && /…/.test(r.j.meta.appId) && !/SUPERSECRET/.test(JSON.stringify(r.j)), "status shows mode + masked App ID, never the secret");
ok(!/SUPERSECRET/.test(JSON.stringify(env.XRAY_DB.db.prepare("SELECT * FROM site_secrets").all())), "secret is encrypted in the database");
r = await S(id + "/payments", undefined, "b"); ok(r.status === 404, "another customer can't see the payment connection");
r = await pub("shop/" + id + "/checkout", { method: "online", customer: cust, code: "DIWALI10", items: [{ id: kurta, v: 1, qty: 1 }], ret: "https://sites.fodo.co.in/kavya-clothing/" });
const on = r.j, sent = cf.filter((x) => x.m === "POST").pop();
ok(on.ok && on.payment.session === "session_TEST_123" && on.payment.mode === "sandbox" && on.total === 159900 - 15990 + 6000, "online order: Cashfree session created for the server-computed total (₹1,599 − 10% + ₹60)");
ok(sent.id === "TESTAPP123456" && /sandbox\.cashfree\.com/.test(sent.u) && sent.body.order_amount === on.total / 100 && sent.body.order_meta.return_url === "https://sites.fodo.co.in/kavya-clothing/order/" + on.order + "/?t=" + on.token, "…with the merchant's own keys and a return URL to the store's order page");
r = await S(id + "/products"); ok(r.j.products.find((p) => p.id === kurta).variants[1].stock === 1, "stock is NOT taken before payment");
r = await pub("shop/" + id + "/order/" + on.order + "?t=wrong"); ok(r.status === 404, "order page needs the secret token");
r = await pub("shop/" + id + "/order/" + on.order + "?t=" + on.token); ok(r.j.ok && r.j.order.status === "pending" && !("customer" in r.j.order), "unpaid order stays pending (Cashfree checked, not the redirect); no customer data on the public page");
cfPaid[on.order] = on.total / 100;
r = await pub("shop/" + id + "/order/" + on.order + "?t=" + on.token); ok(r.j.order.status === "paid", "after Cashfree says PAID → order paid");
r = await S(id + "/products"); ok(r.j.products.find((p) => p.id === kurta).variants[1].stock === 0, "…and only then the stock is taken");
r = await pub("shop/" + id + "/order/" + on.order + "?t=" + on.token); r = await S(id + "/products"); ok(r.j.products.find((p) => p.id === kurta).variants[1].stock === 0 && mails.filter((m) => /New order #1002/.test(m.subject)).length === 1, "re-checking never double-counts stock or emails");
r = await pub("shop/" + id + "/checkout", { method: "online", customer: cust, code: "DIWALI10", items: [{ id: dup, qty: 1 }, { id: dup, qty: 1 }] }); ok(r.status === 400 && /discount code/.test(r.j.reason), "a 1-use code can't be reused");
r = await site("https://sites.fodo.co.in/kavya-clothing/order/" + on.order + "/"); ok(r.status === 200 && /noindex/.test(r.t) && r.t.indexOf(JSON.stringify(on.order)) > -1, "order page on the store website");

/* orders: merchant flow */
r = await S(id + "/orders"); ok(r.j.orders.length === 2 && r.j.orders[0].customer.name === "Meera" && !r.j.orders.some((o) => o.token), "merchant sees orders with customer details (tokens never returned)");
r = await S(id + "/orders/" + o1.order, { status: "delivered" }); ok(r.status === 400 && /can't become/.test(r.j.reason), "status flow enforced (COD can't jump to delivered)");
r = await S(id + "/orders/" + o1.order, { status: "shipped" }); ok(r.j.ok, "mark shipped");
r = await S(id + "/orders/" + o1.order, { status: "delivered" }, "b"); ok(r.status === 404, "another customer can't change orders");
r = await S(id + "/store-stats"); ok(r.j.orders30 === 2 && r.j.revenue30 === 105800 + on.total, "store stats from real orders");

/* blog */
r = await S(id + "/posts", { title: "How we block print", excerpt: "Behind the scenes.", body: "## Wood blocks\nWe use **teak** blocks.\n<script>alert(1)</script>\n[x](javascript:alert(1))", status: "published" }); const p1 = r.j.id; ok(r.j.ok && r.j.slug === "how-we-block-print", "blog post published");
r = await S(id + "/posts", { title: "Diwali sale coming", body: "Soon.", status: "scheduled", publishAt: new Date(Date.now() + 864e5).toISOString() }); const p2 = r.j.id;
r = await S(id + "/posts", { title: "Old scheduled", body: "Now live.", status: "scheduled", publishAt: new Date(Date.now() - 6e4).toISOString() });
r = await S(id + "/posts", { title: "Secret draft", body: "x" });
r = await site("https://sites.fodo.co.in/kavya-clothing/blog/"); ok(/How we block print/.test(r.t) && /Old scheduled/.test(r.t) && !/Diwali sale/.test(r.t) && !/Secret draft/.test(r.t), "blog list: published + due scheduled posts only (future and drafts hidden)");
r = await site("https://sites.fodo.co.in/kavya-clothing/blog/how-we-block-print/"); ok(/<h2>Wood blocks<\/h2>/.test(r.t) && /<strong>teak<\/strong>/.test(r.t) && !/<script>alert/.test(r.t) && !/javascript:/.test(r.t) && /BlogPosting/.test(r.t), "post page: markdown rendered safely + BlogPosting data");
r = await site("https://sites.fodo.co.in/kavya-clothing/blog/diwali-sale-coming/"); ok(r.status === 404, "future post not reachable by URL");
r = await S(id + "/posts/" + p2, undefined, "b"); ok(r.status === 404, "posts private to the store owner");
ok(md("<img src=x onerror=1>") .indexOf("<img") === -1 && md("![a](javascript:x)").indexOf("javascript") === -1, "markdown never produces raw HTML or script links");

/* reserved addresses + fallback CSP */
const bad = JSON.parse(JSON.stringify(doc)); bad.pages.push({ slug: "cart", title: "Cart", sections: [] }); r = await S(id, { doc: bad, baseRev: rev }, "a", { method: "PUT" }); ok(r.status === 400 && /reserved/.test(r.j.reason), "page address 'cart' is reserved for the store");
const fb = await sitesApi({ request: new Request(SITE + "/api/sites/view/kavya-clothing/checkout/"), env, params: { path: ["view", "kavya-clothing", "checkout", ""] } }); const csp = fb.headers.get("content-security-policy");
ok(/sdk\.cashfree\.com/.test(csp) && !/allow-same-origin/.test(csp), "fallback address: Cashfree SDK allowed, still sandboxed");
r = await S(id + "/payments", undefined, "a", { method: "DELETE" }); r = await S(id + "/payments"); ok(!r.j.connected, "disconnect payments");
ok(!all.some((t) => /SUPERSECRET|re_SECRETresendKEY|test-sites-secret-key/.test(t)), "no secret in any response");

console.log("\nv29 store: " + pass + "/" + (pass + fail) + " passed");
process.exit(fail ? 1 : 0);
