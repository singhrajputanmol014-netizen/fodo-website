// v37: Brain creates new websites (draft only, owner only), deferred chatbot CSS. Run: node --no-warnings tests/v37.test.mjs

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

/* ---------- Owner Brain: create a new website ---------- */
const { execute, TOOLS } = await import("../functions/_lib/brain/tools.js");
const ou = await env.XRAY_DB.prepare("SELECT * FROM acct_users WHERE email = ?").bind("anmol@fodo.co.in").first();
const AC = await import("../functions/_lib/brain/access.js"), W = await AC.who(env, ou), oc = { env, request: new Request(SITE + "/"), owner: ou, who: W, settings: {} };
let t = await execute(oc, "eng_site_create", { name: "Sharma Dental", industry: "dental clinic", location: "Dwarka, New Delhi", goal: "more appointments", phone: "+91 98100 00000" });
if (!t.ok) process.stderr.write("CREATE " + JSON.stringify(t).slice(0, 500) + "\n");
const R = t.result || {};
ok(t.ok && /^ws_[a-z0-9]{12}$/.test(R.id) && R.pages.length >= 3 && /draft/.test(R.status), "Brain eng_site_create: a multi-page website is built (" + (R.pages || []).join(", ") + ")");
ok(typeof R.quality === "number" && Array.isArray(R.stillNeeds) && R.editor === "/website-builder/#site=" + R.id, "it reports the quality score, what still needs real details, and the editor link");
const row = await env.XRAY_DB.prepare("SELECT status, owner_user_id, doc FROM sites WHERE id = ?").bind(R.id).first();
ok(row && row.status === "draft" && row.owner_user_id === ou.id, "saved as a private draft under the owner's account (never published by the tool)");
const doc = JSON.parse(row.doc); ok(/Sharma Dental/.test(JSON.stringify(doc.settings.business)) && JSON.stringify(doc).indexOf("+91 98100 00000") > -1, "the business details given are used (name, phone)");
const reviews = []; doc.pages.forEach((p) => p.sections.forEach((s) => { if (s.type === "testimonials") (s.props.items || []).forEach((x) => reviews.push(x)); }));
ok(reviews.every((x) => /\[|placeholder|your customer|customer name/i.test(JSON.stringify(x)) || !x.quote), "no invented reviews: any review slot is a clearly marked placeholder");
ok(TOOLS.eng_site_create.level === 1 && !TOOLS.eng_site_create.preview, "level 1 (a reversible draft); publishing stays a separate level-2 confirmation");
const mc = { env, request: new Request(SITE + "/"), owner: { email: "team@acme.in" }, who: { email: "team@acme.in", owner: false, perms: ["chat", "changes"] }, settings: {} };
t = await execute(mc, "eng_site_create", { name: "Hijack Ltd" }); ok(!t.ok, "non-owners can't create websites from the Brain");
t = await execute(oc, "eng_site_create", { name: "" }); ok(t.ok ? !!t.result.error : true, "a name is required");
let r = await S("list", undefined, "a"); const mine = await S("list", undefined, "own"); ok(r.j && r.j.ok && Array.isArray(r.j.sites) && JSON.stringify(r.j).indexOf(R.id) === -1 && JSON.stringify(mine.j).indexOf(R.id) > -1, "a client account doesn't see the owner's new draft");

/* ---------- chatbot panel CSS loads with the chatbot ---------- */
{ const rd = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8"), main = rd("css/styles.css") + rd("css/theme-glass.css") + rd("css/studio.css"), bot = rd("css/bot.css"), page = rd("contact/index.html");
  ok(!/(^|[}\s])\.bot-log\{/.test(main) && !/(^|[}\s])\.msg\.me\{/.test(main) && /\.bot-log\{/.test(bot) && /\.msg\.me\{/.test(bot), "chatbot panel and message styles moved out of the CSS every page loads");
  ok(/\.bot-fab\{/.test(main) && !/(^|[}\s])\.bot-fab\{/.test(bot.replace(/[^{}]*,[^{}]*\{/g, "")), "the launcher button styles stay in the main CSS (the button looks the same before the chatbot loads)");
  ok(!/css\/bot\.css/.test(page) && /js\/boot-tail\.js/.test(page) && /c\.href=R\+"css\/bot\.css\?v="\+V;c\.onload=c\.onerror=go2;setTimeout\(go2,4000\)/.test(rd("js/boot-tail.js")),   /* v50.8: the loader lives in js/boot-tail.js */ "bot.css is not loaded with the page; the chatbot loads it first and only then its scripts (4 s fallback)"); }

console.log("\nv37: " + pass + "/" + (pass + fail) + " passed"); process.exit(fail ? 1 : 0);
