// v38: Website Builder "Level 100": template families, real popularity, builder analytics, home/palette/creation UI. Run: node --no-warnings tests/v38.test.mjs

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

/* ---------- v38: template families ---------- */
import { templateById } from "../sites/lib/templates.js";
import { CATEGORIES, catsOf, familyTemplates, NICHE_COUNT } from "../sites/lib/families.js";
import { audit } from "../sites/lib/audit.js";
const { score: palScore } = await import("data:text/javascript," + encodeURIComponent(fs.readFileSync(new URL("../js/wb-palette.js", import.meta.url), "utf8").replace(/^import .*$/m, "const esc = (s) => s;")));   // browser module: its one import is replaced
const FAM = familyTemplates();
ok(TEMPLATES.length >= 200 && new Set(TEMPLATES.map((t) => t.id)).size === TEMPLATES.length, TEMPLATES.length + " templates (" + FAM.length + " generated from " + NICHE_COUNT + " niche briefs), unique ids");
ok(TEMPLATES.slice(0, 37).every((t) => !t.family) && FAM.every((t) => TEMPLATES.indexOf(t) > -1), "the 37 hand-made templates are unchanged and first; the families are added after them");
let h1bad = 0, lorem = 0, fakeRev = 0; for (const t of FAM) { const doc = { theme: t.theme, settings: { business: { name: t.category } }, pages: t.pages };
  for (const p of t.pages) { const h = renderPage(doc, p.slug, { base: "/" }); if ((h.match(/<h1[\s>]/g) || []).length !== 1) h1bad++; if (/lorem|ipsum|welcome to our website/i.test(h)) lorem++; }
  t.pages.forEach((p) => p.sections.forEach((s) => { if (s.type === "testimonials") (s.props.items || []).forEach((x) => { if (!/^\[.*\]$/.test(x.quote) || !/^\[.*\]$/.test(x.name)) fakeRev++; }); if (s.type === "stats") (s.props.items || []).forEach((x) => { if (!/^\[/.test(x.value)) fakeRev++; }); })); }
ok(!h1bad && !lorem, "every generated page renders with exactly one H1 and no lorem ipsum / 'welcome to our website'");
ok(!fakeRev, "no invented reviews or numbers: every review and statistic is a [placeholder]");
const fam = (id) => FAM.filter((t) => t.family === id);
const d3 = fam("dental-advanced"); ok(d3.length === 3 && new Set(d3.map((t) => t.theme.style)).size === 3 && new Set(d3.map((t) => t.layout)).size === 3 && new Set(d3.map((t) => JSON.stringify(t.pages[0].sections.map((s) => s.type)))).size === 3, "a family = 3 different websites (style, palette and layout all differ)");
ok(/Advanced dental care/.test(JSON.stringify(d3[0].pages)) && /Seasonal food/.test(JSON.stringify(fam("restaurant-fire")[0].pages)) && /Director\. Filmmaker/.test(JSON.stringify(fam("filmmaker")[0].pages)), "industry-specific copy (dental, restaurant, filmmaker)");
const scores = FAM.map((t) => audit({ theme: t.theme, settings: { business: { name: t.category } }, pages: t.pages }).overall), avg = scores.reduce((a, b) => a + b, 0) / scores.length;
ok(avg >= 70 && Math.min(...scores) >= 60, "generated templates pass the builder's own audit (avg " + Math.round(avg) + ", min " + Math.min(...scores) + ")");
ok(FAM.every((t) => t.goal && t.created && typeof t.featured === "boolean" && t.license.client_use_allowed) && FAM.filter((t) => t.featured).length >= 6, "metadata on every template: goal, created, featured, client-use licence");
const empty = CATEGORIES.filter((c) => c[0] !== "all" && !TEMPLATES.some((t) => catsOf(t).indexOf(c[0]) > -1)); ok(CATEGORIES.length >= 24 && !empty.length && TEMPLATES.every((t) => catsOf(t).length), CATEGORIES.length - 1 + " industry categories, none empty, every template in at least one");
{ const { searchTemplates } = await import("../sites/lib/templates.js"), top = (q, n) => searchTemplates(q, { client: true }).slice(0, n || 1).map((t) => t.id);
  ok(top("chartered accountant gst")[0] === "ca-firm" && top("ai startup", 3).indexOf("ai-startup-futuristic") > -1 && top("luxury restaurant", 2).indexOf("restaurant-fire-luxury") > -1, "recommendations: curated templates win ties, families are found (AI startup, luxury restaurant)"); }
ok(templateById("saas-modern") && templateById("dental-advanced-luxury").theme.style === "luxury", "the server resolves generated templates by id");

/* ---------- creating from a generated template + real popularity ---------- */
let r = await S("create", { mode: "template", templateId: "saas-modern", name: "Taskly", ai: false }, "a"); const tid1 = r.j && r.j.id;
ok(r.j && r.j.ok && /^ws_/.test(tid1), "create a website from a generated template");
r = await S(tid1, undefined, "a"); ok(r.j.ok && r.j.site.doc.pages.some((p) => p.slug === "pricing") && /Less busywork/.test(JSON.stringify(r.j.site.doc)), "the new website has the template's pages and copy");
await S("create", { mode: "template", templateId: "saas-modern", name: "Taskly two", ai: false }, "b"); await S("create", { mode: "template", templateId: "cafe-minimal", name: "Bean", ai: false }, "own");
r = await S("templates", undefined, "a"); ok(r.j.ok && r.j.uses && r.j.uses["saas-modern"] === 2 && r.j.uses["cafe-minimal"] === 1 && !Object.keys(r.j.uses).some((k) => /^ai:/.test(k)), "“Most used” comes from real counts of websites created from each template");
ok(!/priya@|rahul@|Taskly|ws_/.test(JSON.stringify(r.j.uses)), "usage counts reveal no names, owners or website ids");

/* ---------- builder analytics (first-party, cookieless) ---------- */
{ const { onRequestPost: tApi } = await import("../functions/api/t.js"); const send = (o) => tApi({ request: new Request(SITE + "/api/t", { method: "POST", headers: { "content-type": "text/plain", "user-agent": "Mozilla/5.0 Chrome/120", "cf-connecting-ip": "5.5.5.5" }, body: JSON.stringify(o) }), env });
  await send({ t: "pv", p: "/website-builder/" }); await send({ t: "ev", p: "/website-builder/", e: [["wb_template_selected", "saas-modern"], ["wb_ai_generation_started", "prompt"], ["wb_website_created", "template"], ["not_allowed_event", "x"]] });
  const rows = (await env.XRAY_DB.prepare("SELECT dim, k, n FROM web_daily WHERE dim IN ('ev','evd')").all()).results;
  ok(rows.some((x) => x.dim === "ev" && x.k === "wb_template_selected") && rows.some((x) => x.dim === "evd" && x.k === "wb_template_selected|saas-modern") && rows.some((x) => x.k === "wb_website_created"), "builder events are counted (template selected, AI started, website created)");
  ok(!rows.some((x) => /not_allowed_event/.test(x.k)), "unknown event names are ignored"); }

/* ---------- UI modules ---------- */
ok(palScore("Add FAQ", "", "faq") > palScore("Website settings", "domain, SEO, forms", "faq") && palScore("Add FAQ", "", "add faq") > 0 && palScore("Add FAQ", "", "add zebra") === 0, "palette ranking: word-start matches first, every typed word must match");
{ const rd = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8"), page = rd("website-builder/index.html"), css = rd("css/wb-studio.css"), home = rd("js/wb-home.js"), create = rd("js/wb-create.js"), ed = rd("js/website-builder.js");
  ok(/wb-studio\.css\?v=/.test(page) && /"\/js\/wb-home\.js": "\/js\/wb-home\.js\?v=/.test(page) && /"\/js\/wb-palette\.js"/.test(page) && /"\/sites\/lib\/families\.js"/.test(page), "builder page loads the studio CSS; new modules are versioned in the import map");
  const rm = css.slice(css.lastIndexOf("@media (prefers-reduced-motion:reduce)")); ok(/wbh-ai::before/.test(rm) && /wbh-tag/.test(rm) && /wb-palx/.test(rm) && /RM\(\)/.test(home), "reduced motion: animated border, floating labels, palette and the rotating preview all stop");
  ok(/replace\(\/<script\(\?!\[\^>\]\*application\\\/ld\\\+json\)/.test(create), "template previews are rendered without scripts (sandboxed thumbnails)");
  ok(/We hit a problem\./.test(home) && /Your work is safe/.test(home) && /Contact support/.test(home) && /H\.errorState\(root, j/.test(ed), "error state: “We hit a problem. Your work is safe.” with Try again / Go back / Contact support (home + editor)");
  ok(/fodo:'key'/.test(ed) && /d\.fodo === "key"/.test(ed), "keyboard shortcuts keep working while the canvas has focus");
  ok(!/Math\.random\(\)/.test(home) && !/rating|stars|\d+,?\d* (users|customers|websites built)/i.test(home.replace(/\/\*[\s\S]*?\*\//g, "")), "home shows no invented social proof (no fake users, ratings or counts)"); }

console.log("\nv38: " + pass + "/" + (pass + fail) + " passed"); process.exit(fail ? 1 : 0);
