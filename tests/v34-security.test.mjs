// v34 security regression: tenant isolation on EVERY website route, protected pages (PBKDF2, attempt limit, signed cookie, logout,
// password change), SSRF guard, custom code only on the client's own domain, XSS escaping. Run: node --no-warnings tests/v34-security.test.mjs

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
import { safeUrl as netUrl, safeFetch } from "../functions/_lib/xray-core.js";
import { hashPw, verifyPw } from "../sites/lib/protect.js";

/* ---------- tenant A builds a full website; tenant B tries everything ---------- */
let r = await S("create", { name: "Smile Dental", industry: "Dentist", location: "Delhi", phone: "+91 98100 00000", email: "priya@smiledental.in", templateId: "boutique-store" });
const A = r.j.id; await S("create", { name: "Rahul Biz" }, "b"); const Bid = (await S("list", undefined, "b")).j.sites[0].id;
r = await S(A + "/products", { title: "Kit", price: 499, track: true, stock: 3 }); const prod = r.j.id;
r = await S(A + "/discounts", { code: "SECRET10", kind: "pct", value: 10 }); const disc = (await S(A + "/discounts")).j.discounts[0].id;
r = await S(A + "/posts", { title: "Our clinic", body: "Hello", status: "published" }); const post = r.j.id;
r = await S(A + "/share", {}); const shareTok = r.j.token || (r.j.share && r.j.share.token);
let doc = (await S(A)).j.site.doc; const rev0 = (await S(A)).j.site.rev;
const tries = [["GET", ""], ["PUT", "", { doc, baseRev: rev0 }], ["DELETE", ""], ["GET", "/versions"], ["POST", "/restore", { rev: 1 }], ["POST", "/publish", {}], ["POST", "/unpublish", {}],
  ["GET", "/export"], ["GET", "/forms"], ["GET", "/stats"], ["GET", "/health"], ["GET", "/audit"], ["GET", "/ai-log"], ["POST", "/ai", { instruction: "make it premium" }], ["POST", "/generate", {}],
  ["GET", "/domains"], ["POST", "/domains", { domain: "steal.com" }], ["GET", "/members"], ["POST", "/members", { email: "rahul@otherbiz.in", role: "admin" }], ["POST", "/transfer", { email: "rahul@otherbiz.in" }],
  ["GET", "/shares"], ["POST", "/share", {}], ["POST", "/duplicate", {}], ["POST", "/archive", {}], ["POST", "/to-template", {}], ["POST", "/password", { password: "secret123" }], ["POST", "/media", {}],
  ["GET", "/products"], ["PUT", "/products/" + prod, { title: "x", price: 1 }], ["DELETE", "/products/" + prod], ["GET", "/orders"], ["GET", "/discounts"], ["DELETE", "/discounts/" + disc],
  ["GET", "/posts"], ["GET", "/posts/" + post], ["DELETE", "/posts/" + post], ["GET", "/payments"], ["POST", "/payments", { appId: "X", secret: "Y" }], ["GET", "/store-stats"]];
let leaks = [];
for (const [m, p, b] of tries) { const x = await S(A + p, b, "b", { method: m }); if (x.status < 400 || /Smile Dental|SECRET10|Our clinic/.test(x.t)) leaks.push(m + " " + p + " → " + x.status); }
ok(!leaks.length, "tenant B gets 403/404 on all " + tries.length + " website routes of tenant A" + (leaks.length ? ": " + leaks.join(", ") : ""));
// B can't reach A's resources through B's OWN website id either
leaks = []; for (const [m, p, b] of [["PUT", "/products/" + prod, { title: "x", price: 1 }], ["DELETE", "/products/" + prod], ["DELETE", "/discounts/" + disc], ["GET", "/posts/" + post], ["DELETE", "/posts/" + post]]) { const x = await S(Bid + p, b, "b", { method: m }); if (x.status < 400) leaks.push(m + " " + p); }
ok(!leaks.length, "…nor through tenant B's own website id (resource ids are checked against the site)" + (leaks.length ? ": " + leaks.join(", ") : ""));
ok((await S("list", undefined, "b")).j.sites.every((x) => x.id !== A), "tenant B's website list never contains tenant A's site");
r = await S(A, undefined, "b"); ok((r.status === 404 || r.status === 403) && !/priya@/.test(r.t), "…and the error does not reveal who owns it");
r = await call("sites/" + A, undefined, { as: "nobody" }); ok(r.status === 401 || r.status === 403, "logged-out visitor: 401/403");
r = await pub("shop/" + A + "/order/or_aaaaaaaaaaaaaa?t=x"); ok(r.status === 404, "public order lookup without the right token: 404");

/* ---------- protected pages ---------- */
const h = await hashPw("open sesame"); ok(/^p2\$100000\$/.test(h) && await verifyPw("open sesame", h, A) && !(await verifyPw("open sesamE", h, A)), "PBKDF2-SHA256 (100k iterations, random salt) password hash");
ok((await hashPw("open sesame")) !== h, "…salted: the same password hashes differently each time");
const legacy = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("oldpass|" + A)))].map((b) => b.toString(16).padStart(2, "0")).join("");
ok(await verifyPw("oldpass", legacy, A), "pages protected before v34 (old hash) still open with their password");
r = await S(A + "/password", { password: "abc" }); ok(r.status === 400, "too-short page password refused");
r = await S(A + "/password", { password: "open sesame" }); const ph = r.j.hash;
doc = (await S(A)).j.site.doc; let rev = (await S(A)).j.site.rev; doc.pages.forEach((p) => { p.sections = p.sections.filter((x) => !/\[[A-Z][a-z]+ /.test(JSON.stringify(x))); });
const priv = { slug: "members", title: "Members", sections: [{ type: "text", props: { title: "Members area", body: "Private price list" } }], password: ph };
doc.pages.push(priv); r = await S(A, { doc, baseRev: rev }, "a", { method: "PUT" }); rev = r.j.rev;
ok((await S(A)).j.site.doc.pages.find((p) => p.slug === "members").password === ph, "new-format hash is accepted and saved on the page");
doc.settings.store = Object.assign(doc.settings.store || {}, { cod: true }); r = await S(A, { doc, baseRev: rev }, "a", { method: "PUT" }); rev = r.j.rev; r = await S(A + "/publish", {});
const slug = (await S(A)).j.site.slug, url = "https://sites.fodo.co.in/" + slug + "/members/";
const visit = (init) => sitesProject({ request: new Request(url, init), env }).then(async (x) => ({ status: x.status, t: await x.text(), h: x.headers }));
const post2 = (pw, ip, cookie) => visit({ method: "POST", body: new URLSearchParams({ pw }), headers: Object.assign({ "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": ip || "5.5.5.5" }, cookie ? { cookie } : {}) });
r = await visit(); ok(r.status === 401 && !/Private price list/.test(r.t) && /protected/.test(r.t), "protected page: asks for the password, content hidden");
r = await post2("wrong"); ok(r.status === 401 && /isn('|&#39;)t right/.test(r.t) && !/Private price list/.test(r.t), "wrong password: refused");
r = await post2("open sesame"); const ck = (r.h.get("set-cookie") || "").split(";")[0];
ok(r.status === 303 && /HttpOnly/.test(r.h.get("set-cookie")) && /SameSite=Lax/.test(r.h.get("set-cookie")) && /Secure/.test(r.h.get("set-cookie")) && /Max-Age=43200/.test(r.h.get("set-cookie")), "right password: signed HttpOnly + Secure + SameSite cookie for 12 hours");
r = await visit({ headers: { cookie: ck } }); ok(r.status === 200 && /Private price list/.test(r.t) && /no-store/.test(r.h.get("cache-control")), "…the cookie opens the page (no-store, not cached)");
r = await visit({ headers: { cookie: ck.replace(/.$/, (c) => (c === "A" ? "B" : "A")) } }); ok(r.status === 401, "a tampered cookie is refused");
r = await visit({ headers: { cookie: ck.replace(/=(\d+)\./, (m0, e) => "=" + (+e + 9e9) + ".") } }); ok(r.status === 401, "…so is a cookie with a longer expiry written into it");
r = await sitesProject({ request: new Request(url + "?logout=1", { headers: { cookie: ck } }), env }); ok(/Max-Age=0/.test(r.headers.get("set-cookie") || "") && /logged out/.test(await r.text()), "log out clears the cookie");
let blocked = 0; for (let i = 0; i < 9; i++) { const x = await post2("guess" + i, "6.6.6.6"); if (x.status === 429) { blocked = i + 1; break; } }
ok(blocked === 8, "brute force: 8 wrong tries per visitor → 15-minute lock (locked at try " + blocked + ")");
r = await post2("open sesame", "6.6.6.6"); ok(r.status === 429, "…even the right password waits out the lock");
r = await post2("open sesame", "6.6.6.7"); ok(r.status === 303, "…other visitors are not affected");
r = await S(A + "/password", { password: "new password 2" }); const d2 = (await S(A)).j.site.doc; d2.pages.find((p) => p.slug === "members").password = r.j.hash; rev = (await S(A)).j.site.rev; await S(A, { doc: d2, baseRev: rev }, "a", { method: "PUT" }); await S(A + "/publish", {});
r = await visit({ headers: { cookie: ck } }); ok(r.status === 401, "changing the password logs everyone out (old cookies stop working)");

/* ---------- SSRF guard (preserved) ---------- */
const bad = ["http://localhost/", "http://127.0.0.1/", "http://10.0.0.5/", "http://192.168.1.1/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://metadata.google.internal/", "file:///etc/passwd", "http://user:pw@example.com/", "http://example.com:8080/", "http://0x7f000001/", "http://2130706433/"];
const passed = bad.filter((u) => netUrl(u).ok); ok(!passed.length, "SSRF: private, loopback, metadata, file:, credentials and odd ports all refused" + (passed.length ? ": " + passed.join(", ") : ""));
ok(netUrl("https://www.example.com/page").ok, "…normal public addresses still allowed");
const realFetch = globalThis.fetch; globalThis.fetch = async (u) => (/example\.org/.test(String(u)) ? new Response("", { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } }) : realFetch(u));
let threw = false; try { const x = await safeFetch("https://www.example.org/", {}, { env: { XRAY_TEST_MODE: "1" } }); threw = !x || x.ok === false || x.status >= 400 || x.blocked; } catch (e) { threw = true; } globalThis.fetch = realFetch;
ok(threw, "SSRF: a redirect to the cloud metadata address is refused");

/* ---------- custom code + XSS ---------- */
doc = (await S(A)).j.site.doc; rev = (await S(A)).j.site.rev; doc.settings.customHead = "<script>window.X=1</script>"; doc.pages[0].sections[1].props.title = "<img src=x onerror=alert(1)>"; r = await S(A, { doc, baseRev: rev }, "a", { method: "PUT" }); await S(A + "/publish", {});
r = await site("https://sites.fodo.co.in/" + slug + "/"); ok(!/window\.X=1/.test(r.t), "custom code is NOT served on the shared sites address");
ok(!/<img src=x onerror/.test(r.t) && /&lt;img src=x onerror/.test(r.t), "section text is HTML-escaped (no stored XSS)");
const fb = await sitesApi({ request: new Request(SITE + "/api/sites/view/" + slug + "/"), env, params: { path: ["view", slug] } }); const fbt = await fb.text();
ok(/sandbox/.test(fb.headers.get("content-security-policy") || "") && !/window\.X=1/.test(fbt), "the fodo.co.in fallback address is sandboxed (client pages can't act as fodo.co.in) and runs no custom code");
r = await site("https://sites.fodo.co.in/../owner-brain/"); ok(r.status === 404 || r.status === 301 || r.status === 302, "path traversal on the sites project goes nowhere");

ok(!all.some((t) => /re_SECRETresendKEY|SUPERSECRET/.test(t)), "no secret in any response");
console.log("\nv34 security: " + pass + "/" + (pass + fail) + " passed"); process.exit(fail ? 1 : 0);
