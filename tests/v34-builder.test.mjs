// v34 Website Builder: responsive overrides (desktop → tablet → mobile cascade), custom breakpoints, design tokens, conflict-safe saving,
// migration of older documents. Run: node --no-warnings tests/v34-builder.test.mjs

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
import { RESP, BREAKPOINTS } from "../sites/lib/render.js";

let r = await S("create", { name: "Smile Dental", industry: "Dentist", location: "Delhi", phone: "+91 98100 00000", email: "priya@smiledental.in" });
const id = r.j.id; let site0 = (await S(id)).j.site, doc = site0.doc, rev = site0.rev;
const old = JSON.parse(JSON.stringify(doc));

/* 1. responsive overrides survive save + render as scoped classes */
const hero = doc.pages[0].sections.findIndex((s) => s.type === "hero");
doc.pages[0].sections[hero].style = Object.assign({}, doc.pages[0].sections[hero].style, { pad: "l", tablet: { cols: 2, align: "center" }, mobile: { pad: "s", fs: 80, cols: 1, stack: true, hide: false, bogus: "<script>" } });
doc.theme.bpTablet = 960; doc.theme.bpMobile = 600; doc.theme.muted = "#667085"; doc.theme.border = "#e4e7ec"; doc.theme.bpEvil = "x";
r = await S(id, { doc, baseRev: rev }, "a", { method: "PUT" }); ok(r.j.ok, "doc with tablet/mobile overrides saves"); rev = r.j.rev;
let saved = (await S(id)).j.site.doc, st = saved.pages[0].sections[hero].style;
ok(st.mobile.fs === 80 && st.tablet.cols === 2 && st.pad === "l", "overrides kept per breakpoint, base untouched");
ok(saved.theme.bpTablet === 960 && saved.theme.bpMobile === 600 && saved.theme.muted === "#667085" && !("bpEvil" in saved.theme), "custom breakpoints + muted/border tokens kept, unknown keys dropped");
let html = renderPage(saved, "home", {});
const heroTag = (/<section class="hero[^"]*"/.exec(html) || [""])[0];
ok(/m-pad-s/.test(heroTag) && /m-fs-80/.test(heroTag) && /m-cols-1/.test(heroTag) && /m-stack/.test(heroTag) && /t-cols-2/.test(heroTag) && /t-al-center/.test(heroTag) && /s-pad-l/.test(heroTag), "hero gets base + tablet + mobile classes");
ok(!/bogus|<script>"/.test(heroTag), "unknown override keys never reach the page");
ok(/@media\(max-width:960px\)\{\.t-pad-none/.test(html) && /@media\(max-width:600px\)\{\.m-pad-none/.test(html), "custom breakpoints drive the media queries");
ok(html.indexOf("@media(max-width:960px){.t-") < html.indexOf("@media(max-width:600px){.m-"), "cascade: mobile rules come after tablet rules (mobile wins on phones)");
const cut = (h, start) => { const a = h.indexOf(start); if (a < 0) return h; let d = 0, k = a; for (; k < h.length; k++) { if (h[k] === "{") d++; else if (h[k] === "}") { d--; if (!d) break; } } return h.slice(0, a) + h.slice(k + 1); };
ok(!/\.(m|t)-(pad|fs|cols|stack|hide|al|w|gap|show)/.test(cut(cut(html, "@media(max-width:960px){.t-pad-none"), "@media(max-width:600px){.m-pad-none")), "no tablet/mobile rule outside its media query (desktop never changes)");
ok(/--mut:#667085/.test(html) && /--line:#e4e7ec/.test(html), "design tokens become CSS variables");
ok(BREAKPOINTS({ bpTablet: 99999, bpMobile: 5 }).tablet === 1400 && BREAKPOINTS({ bpMobile: 5 }).mobile === 360 && BREAKPOINTS({}).tablet === 1024, "breakpoints are clamped to sane ranges (defaults 1024 / 767)");
ok(RESP.fs.indexOf(80) > -1 && RESP.cols.join() === "1,2,3,4", "whitelisted responsive values");

/* 2. older documents (no overrides) render exactly as before */
const h0 = renderPage(old, "home", {}).replace(/@media\(max-width:(1024|767)px\)\{\.(t|m)-[^@]*\}/g, "");
ok(!/class="[^"]*\b(t|m)-(pad|fs|cols|stack|hide)/.test(renderPage(old, "home", {})), "a pre-v34 document gets no override classes (renders like before)");

/* 3. conflict: two sessions save from the same version */
const A1 = JSON.parse(JSON.stringify(saved)), B1 = JSON.parse(JSON.stringify(saved)); A1.pages[0].title = "Home A"; B1.pages[0].title = "Home B";
const [s1, s2] = await Promise.all([S(id, { doc: A1, baseRev: rev }, "a", { method: "PUT" }), S(id, { doc: B1, baseRev: rev }, "a", { method: "PUT" })]);
const win = [s1, s2].find((x) => x.j.ok), lose = [s1, s2].find((x) => !x.j.ok);
ok(win && lose && lose.status === 409 && lose.j.conflict && lose.j.doc && lose.j.updatedAt, "two simultaneous saves: one wins, the other gets 409 + the server version + when it was saved");
const keep = lose === s1 ? A1 : B1, serverTitle = lose.j.doc.pages[0].title;
r = await S(id, { doc: keep, baseRev: lose.j.rev, keepServer: true, note: "Kept my version (after an editing conflict)" }, "a", { method: "PUT" });
const vers = (await S(id + "/versions")).j.versions;
ok(r.j.ok && vers.some((v) => /replaced after an editing conflict/.test(v.note)), "'Keep mine' saves the other version to history first");
const vOther = vers.find((v) => /replaced after an editing conflict/.test(v.note)); r = await S(id + "/restore/" + vOther.id, {});
ok(r.j.ok && r.j.doc.pages[0].title === serverTitle, "…and it can be restored (nothing lost)");

/* 4. two simultaneous publishes don't corrupt the site */
doc = (await S(id)).j.site.doc; doc.pages.forEach((p) => { p.sections = p.sections.filter((x) => !/\[[A-Z][a-z]+[ \]]/.test(JSON.stringify(x))); }); rev = (await S(id)).j.site.rev; await S(id, { doc, baseRev: rev }, "a", { method: "PUT" });
const [p1, p2] = await Promise.all([S(id + "/publish", {}), S(id + "/publish", {})]);
const live = (await S(id)).j.site; if (!(p1.j.published || p2.j.published)) process.stderr.write(JSON.stringify(p1.j).slice(0, 500) + "\n" + JSON.stringify(p2.j).slice(0, 300) + "\n"); ok((p1.j.published || p2.j.published) && live.status === "live", "two simultaneous publishes: site ends up live and consistent");
const pubV = (await S(id + "/versions")).j.versions.filter((v) => /publish/i.test(v.note)).length; ok(pubV <= 2, "…no runaway duplicate versions (" + pubV + ")");

console.log("\nv34 builder: " + pass + "/" + (pass + fail) + " passed"); process.exit(fail ? 1 : 0);
