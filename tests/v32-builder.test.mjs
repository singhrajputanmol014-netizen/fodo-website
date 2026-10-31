// v32 Website Builder: AI creation stages, sitemap, design system, blank/template variations, duplicate/archive, members & roles, share +
// client approval, typed forms + webhook + thank-you, site search, import (SSRF-safe, rights-aware), owner templates, audit, transfer.

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
const all = [];   // every response body — checked for leaked secrets at the end
const login = (email, plan, who) => call("test-login", Object.assign({ email }, plan ? { plan } : {}), { as: who });
const B = (p, body, who, o) => call("owner-brain/" + p, body, Object.assign({ as: who || "own" }, o || {}));
const ask = (message, threadId, who, extra) => B("chat", Object.assign({ message, threadId }, extra || {}), who);


import { onRequest as sitesApi } from "../functions/api/sites/[[path]].js";
import { onRequest as sitesProject } from "../sites/functions/[[path]].js";
import { renderPage, checkSite, safeUrl, sanitizeCss } from "../sites/lib/render.js";
import { TEMPLATES, SOURCES, clientAllowed } from "../sites/lib/templates.js";
H.sites = sitesApi;
const J = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json" } });
const dns = {}, hooks = []; let cfCalls = [], mails = [];
globalThis.fetch = async (u, o = {}) => { u = String(u);
  if (/cloudflare-dns\.com\/dns-query/.test(u)) { const q = new URL(u), k = q.searchParams.get("name") + "|" + q.searchParams.get("type"); return J({ Answer: (dns[k] || []).map((d) => ({ data: d })) }); }
  if (/api\.cloudflare\.com/.test(u)) { cfCalls.push((o.method || "GET") + " " + u.replace(/^.*\/projects\//, "")); return (o.method || "GET") === "GET" ? J({ success: false, errors: [{ code: 8000007 }] }, 404) : J({ success: true, result: { status: "active" } }); }
  if (/api\.resend\.com/.test(u)) { mails.push(JSON.parse(o.body)); return J({ id: "m1" }); }
  if (/\/api\/sites\/view\//.test(u)) return new Response("ok", { status: 200 });
  if (/hooks\.example\.com/.test(u)) { hooks.push({ u, body: JSON.parse(o.body) }); return J({ ok: true }); }
  if (/oldsite\.example\.com/.test(u)) return new Response('<html><head><title>Bright Smiles Dental | Delhi</title><meta name="description" content="Gentle dental care in Delhi."><meta name="viewport" content="width=device-width"><style>body{font-family:"Lato";color:#0e7490}.b{background:#0e7490}a{color:#22c55e}</style></head><body><header><nav><a href="/">Home</a><a href="/about-us">About us</a><a href="/treatments">Treatments</a><a href="/blog">Blog</a><a href="/contact">Contact</a></nav></header><h1>Your smile, our passion</h1><p>We have been caring for families in South Delhi for many years with modern, painless dentistry and a calm clinic.</p><h2>Treatments</h2><img src="https://oldsite.example.com/hero.jpg" alt="Clinic"><p>Call +91 98100 12345 or write to hello@brightsmiles.in</p><section></section><form></form></body></html>', { status: 200, headers: { "content-type": "text/html" } });
  return new Response("x", { status: 599 }); };
const AI = { run: async (model, x) => { const sys = x.messages[0].content, user = x.messages[x.messages.length - 1].content;
  if (/write website copy/.test(sys)) { const j = JSON.parse(user.split("SECTIONS: ")[1]); j.pages.forEach((p) => p.sections.forEach((s) => { if (s && s.props && s.props.title) s.props.title = "Smile Dental — " + s.props.title; if (s && s.type === "testimonials") s.props.items = [{ quote: "Best clinic ever!", name: "Fake Person" }]; })); return { response: JSON.stringify(j) }; }
  if (/edit ONE customer website/.test(sys)) { if (/other site|admin|secret/i.test(user)) return { response: JSON.stringify({ say: "x", ops: [{ op: "update", page: "home", i: 1, props: { title: "<script>steal()</script>" } }, { op: "raw", html: "<script>" }] }) };
    return { response: JSON.stringify({ say: "Made the hero shorter and added an FAQ.", ops: [{ op: "update", page: "home", i: 1, props: { title: "Gentle dental care in Dwarka" } }, { op: "add", page: "home", at: 2, type: "faq", props: { title: "FAQ", items: [{ q: "Open on Sunday?", a: "Yes, 10–2." }] } }, { op: "theme", theme: { primary: "#0F766E" } }] }) }; }
  if (/Make it shorter/.test(sys)) return { response: "Short and sweet." };
  return { response: "ok" }; } };
const KV = new Map(), CHAT_KV = { get: async (k) => KV.get(k) || null, put: async (k, v, o) => { KV.set(k, v); KV.set(k + "#m", o && o.metadata); }, getWithMetadata: async (k) => ({ value: KV.get(k) || null, metadata: KV.get(k + "#m") }), delete: async (k) => KV.delete(k) };
const env = { XRAY_DB: d1(), CHAT_KV, AI, ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", RESEND_API_KEY: "re_SECRETresendKEY12345", MAIL_FROM: "FODO <hello@fodo.co.in>", SITES_HOST: "sites.fodo.co.in", SITES_PROJECT: "fodo-sites" };
await login("priya@smiledental.in", "starter", "a"); await login("rahul@otherbiz.in", null, "b"); await login("anmol@fodo.co.in", null, "own");
const S = (p, body, who, o) => call("sites/" + p, body, Object.assign({ as: who || "a" }, o || {}));
import { audit, autoFix } from "../sites/lib/audit.js";
import { planSitemap, parsePrompt, designFor, buildDoc } from "../sites/lib/industry.js";
import { applyStyle, contrast } from "../sites/lib/design.js";
const site = async (url, init) => { const res = await sitesProject({ request: new Request(url, init), env }); return { status: res.status, t: await res.text(), h: res.headers }; };
await login("dev@agency.in", "pro", "c"); await login("viewer@client.in", null, "v"); await login("editor@client.in", null, "e");

/* AI creation: understand → sitemap → design → pages → copy → automatic QA */
let r = await S("create", { mode: "ai", prompt: "Build a premium website for a dental clinic in Delhi focused on cosmetic dentistry.", name: "Pearl Dental", phone: "+91 98100 00000", whatsapp: "+91 98100 00000", email: "priya@smiledental.in", goals: ["Book Appointments"] }, "c");
ok(r.j.ok && r.j.mode === "ai" && r.j.stages.join() === "sitemap,design,pages,copy,qa" && r.j.qa.after >= r.j.qa.before, "AI create runs real stages: " + (r.j.stages || []).join(" → ") + " (QA " + (r.j.qa || {}).before + "→" + (r.j.qa || {}).after + ")");
const aid = r.j.id; r = await S(aid, undefined, "c"); const adoc = r.j.site.doc;
ok(adoc.pages.map((p) => p.slug).join() === "home,treatments,doctors,about,book,contact,privacy" && adoc.pages.find((p) => p.slug === "book").sections.some((s) => s.type === "booking"), "dental sitemap: treatments, doctors, booking page, contact, privacy (not a generic 5-page site)");
ok(adoc.theme.style === "luxury" && adoc.theme.headingFont === "Cormorant" && adoc.settings.whatsappFloat === true && adoc.pages.every((p) => p.seo && p.seo.title), "‘premium’ → luxury design system; WhatsApp button; every page got an SEO title from the automatic QA");
ok(contrast("#ffffff", adoc.theme.primary) >= 4.5, "QA fixed button contrast (white on brand colour ≥ 4.5:1)");
ok(adoc.pages[0].sections.find((s) => s.type === "testimonials").props.items[0].quote === "[Add a real customer review]", "reviews stay placeholders — never invented");

/* blank + template variation */
r = await S("create", { mode: "blank", name: "Blank Co" }, "c"); r = await S(r.j.id, undefined, "c"); ok(r.j.site.doc.pages.length === 1 && r.j.site.doc.pages[0].sections.map((s) => s.type).join() === "navbar,hero,footer", "start from blank: one page, navbar + footer (+ a heading)");
r = await S("create", { mode: "template", templateId: "cafe-cozy", styleVariant: "dark", name: "Night Owl Cafe" }, "c"); const tv = r.j.id; r = await S(tv, undefined, "c"); ok(r.j.site.doc.theme.mode === "dark" && r.j.site.doc.theme.style === "dark", "template + style variation (Café → Dark)");

/* duplicate, archive, restore, delete info */
r = await S(aid + "/duplicate", {}, "c"); const dup = r.j.id; ok(r.j.ok && /^Copy of Pearl/.test(r.j.name), "duplicate website");
await sitesApi({ request: new Request(SITE + "/api/sites/f/" + aid, { method: "POST", body: "{}" }), env, params: { path: ["f", aid] } });
r = await S(dup + "/archive", { on: true }, "c"); r = await S("list", undefined, "c"); ok(!r.j.sites.some((x) => x.id === dup) && r.j.sites.some((x) => x.id === aid && x.pages === 7 && x.thumb && x.thumb.pages.length === 1), "archive hides it; list shows pages count + a thumbnail document");
r = await S("list?archived=1", undefined, "c"); ok(r.j.sites.some((x) => x.id === dup), "…archived list");
r = await S(dup + "/archive", { on: false }, "c"); r = await S("list", undefined, "c"); ok(r.j.sites.some((x) => x.id === dup), "restore from archive");
r = await S(aid + "/delete-info", undefined, "c"); ok(r.j.pages === 7 && r.j.versions >= 1 && "formMessages" in r.j, "delete shows exactly what would be deleted");

/* members & roles (server-enforced) */
r = await S(aid + "/members", { email: "viewer@client.in", role: "viewer" }, "c"); r = await S(aid + "/members", { email: "editor@client.in", role: "editor" }, "c"); ok(r.j.ok, "add members");
r = await S(aid, undefined, "v"); ok(r.j.ok && r.j.site.doc, "viewer can open it");
r = await S(aid, { doc: adoc, baseRev: 1 }, "v", { method: "PUT" }); ok(r.status === 403 && /viewer/.test(r.j.reason), "viewer can't save");
r = await S(aid, undefined, "e"); r = await S(aid, { doc: r.j.site.doc, baseRev: r.j.site.rev }, "e", { method: "PUT" }); ok(r.j.ok, "editor can edit + save");
r = await S(aid + "/publish", {}, "e"); ok(r.status === 403, "…but editors can't publish");
r = await S(aid + "/members", { email: "x@y.in", role: "viewer" }, "e"); ok(r.status === 403, "…or manage members");
r = await S("list", undefined, "e"); ok(r.j.sites.some((x) => x.id === aid && x.role === "editor"), "shared website appears in the member's list");
r = await S(aid, undefined, "b"); ok(r.status === 404, "strangers still get 'not found'");

/* share preview + client approval */
r = await S(aid + "/share", { days: 3, note: "First draft" }, "c"); const tok = r.j.token; ok(r.j.ok && /^[a-z0-9]{28}$/.test(tok) && /\/api\/sites\/preview\//.test(r.j.url), "temporary preview link");
let pv = await sitesApi({ request: new Request(SITE + "/api/sites/preview/" + tok + "/"), env, params: { path: ["preview", tok, ""] } }); const pvt = await pv.text();
ok(pv.status === 200 && /Pearl Dental/.test(pvt) && /Request changes/.test(pvt) && /noindex/.test(pv.headers.get("x-robots-tag")) && /sandbox/.test(pv.headers.get("content-security-policy")), "preview shows the current draft with an approval bar (sandboxed, noindex)");
pv = await sitesApi({ request: new Request(SITE + "/api/sites/preview/" + tok + "/review", { method: "POST", body: JSON.stringify({ decision: "changes", name: "Dr Pearl", comment: "Bigger photo please" }) }), env, params: { path: ["preview", tok, "review"] } });
r = await S(aid + "/shares", undefined, "c"); ok(r.j.review === "changes" && r.j.reviews[0].comment === "Bigger photo please" && mails.some((m) => /Changes requested/.test(m.subject)), "client requests changes → status + comment + email to the owner");
await sitesApi({ request: new Request(SITE + "/api/sites/preview/" + tok + "/review", { method: "POST", body: JSON.stringify({ decision: "approve", name: "Dr Pearl" }) }), env, params: { path: ["preview", tok, "review"] } });
r = await S("list", undefined, "c"); ok(r.j.sites.find((x) => x.id === aid).review === "approved", "approved shows on the dashboard");
r = await S(aid + "/shares/" + tok, undefined, "c", { method: "DELETE" }); pv = await sitesApi({ request: new Request(SITE + "/api/sites/preview/" + tok + "/"), env, params: { path: ["preview", tok, ""] } }); ok(pv.status === 404, "revoked link stops working");

/* forms v2: typed fields, webhook, thank-you page; publish checklist */
r = await S(aid, undefined, "c"); const fd = r.j.site.doc; const book = fd.pages.find((p) => p.slug === "book"); const bs = book.sections.find((s) => s.type === "booking"); bs.props.services = ["Whitening", "Aligners"]; bs.props.form = undefined;
fd.settings.forms = { webhook: "https://hooks.example.com/lead" }; fd.settings.search = true; fd.settings.customHead = "<script>window.MINE=1</script>"; fd.pages.forEach((p) => { p.sections = p.sections.filter((s) => !/testimonials|stats|team|hours|pricing/.test(s.type)); p.sections.forEach((s) => { if (s.type === "faq") s.props.items = s.props.items.filter((x) => !/\[/.test(x.a)); }); });
r = await S(aid, { doc: fd, baseRev: r.j.site.rev }, "c", { method: "PUT" }); r = await S(aid + "/publish", {}, "c");
ok(r.j.published === true && r.j.checklist.length === 10 && r.j.checklist.every((x) => "ok" in x) && r.j.audit.overall > 0, "publish runs the 10-point checklist + audit score");
let w = await site("https://sites.fodo.co.in/pearl-dental/book/"); ok(/name="service"/.test(w.t) && /<option>Whitening<\/option>/.test(w.t) && /type="date"/.test(w.t) && /type="time"/.test(w.t), "live booking form: service, date and time fields");
ok(!/window\.MINE/.test(w.t), "custom code is NOT served on FODO's shared address");
const fr = await sitesApi({ request: new Request(SITE + "/api/sites/f/" + aid, { method: "POST", body: JSON.stringify({ name: "Asha", phone: "9811111111", service: "Whitening", date: "2026-11-05", time: "11:00", _form: "booking", _page: "/book/" }) }), env, params: { path: ["f", aid] } });
ok((await fr.json()).ok && hooks.length === 1 && hooks[0].body.data.service === "Whitening" && hooks[0].body.form === "booking", "booking stored + sent to the webhook");
ok(mails.some((m) => /New booking from your website/.test(m.subject)), "…and emailed as a booking");
w = await site("https://sites.fodo.co.in/pearl-dental/thank-you/"); ok(w.status === 200 && /Thank you/.test(w.t) && /noindex/.test(w.t), "auto thank-you page");
w = await site("https://sites.fodo.co.in/pearl-dental/search/"); ok(/srch-i/.test(w.t) && /Treatments/.test(w.t), "site search page with an index of the pages");
w = await site("https://sites.fodo.co.in/pearl-dental/privacy/"); ok(/Privacy Policy/.test(w.t) && /DPDP|personal data|What we collect/.test(w.t), "privacy policy page published");

/* import + reference analysis (structure always, content only with rights) */
r = await S("import/analyze", { url: "https://oldsite.example.com/" }, "c");
ok(r.j.ok && r.j.analysis.title === "Bright Smiles Dental | Delhi" && r.j.analysis.navigation.length === 4 && r.j.analysis.colors.indexOf("#0e7490") > -1 && r.j.analysis.fonts.indexOf("Lato") > -1 && r.j.analysis.industry === "Dentist" && r.j.analysis.phone, "analyse a website: navigation, headings, colours, fonts, industry, contact");
ok(r.j.plan.pages.map((p) => p.slug).join() === "home,about,services,articles,contact", "its navigation becomes an original sitemap");
const imp = r.j; r = await S("create", { mode: "import", name: "Bright Smiles", plan: imp.plan, import: imp.analysis, rights: false, ai: false }, "c"); let idoc = (await S(r.j.id, undefined, "c")).j.site.doc;
ok(!/Your smile, our passion/.test(JSON.stringify(idoc)), "without rights: structure only — none of their text is copied");
r = await S("import/analyze", { url: "http://127.0.0.1/admin" }, "c"); ok(r.status === 400, "private addresses can't be imported (SSRF-safe)");

/* owner: turn a website into a template */
r = await S(aid + "/to-template", { name: "Premium Dental (owner)", category: "Dental" }, "c"); ok(r.status === 403, "only FODO owners create templates");
r = await S(aid + "/to-template", { name: "Premium Dental (owner)", category: "Dental" }, "own"); const ct = r.j.id; ok(/^ct_/.test(ct), "owner turns a website into a template");
r = await call("sites/templates", undefined, { as: "nobody" }); ok(r.j.custom.some((t) => t.id === ct && /\{\{business_name\}\}/.test(JSON.stringify(t.pages))), "template library includes it, business name became {{business_name}}");
r = await S("create", { mode: "template", templateId: ct, name: "Tooth Fairy Clinic", ai: false }, "c"); idoc = (await S(r.j.id, undefined, "c")).j.site.doc; ok(/Tooth Fairy Clinic/.test(JSON.stringify(idoc)) && !/Pearl Dental/.test(JSON.stringify(idoc.pages)), "a new website from it gets the new business name");

/* audit + one-click fixes + transfer */
r = await S(aid + "/audit", undefined, "c"); ok(r.j.ok && Object.keys(r.j.scores).length === 7 && r.j.issues.every((i) => i.problem && i.reason && i.fix), "audit: 7 scores, every issue explains problem / reason / fix");
r = await S(aid + "/transfer", { email: "nobody@x.in" }, "c"); ok(r.status === 400, "transfer needs an existing FODO account");
r = await S(aid + "/transfer", { email: "priya@smiledental.in" }, "c"); ok(r.j.owner === "priya@smiledental.in", "transfer ownership");
r = await S(aid + "/members", undefined, "c"); ok(r.j.you === "admin" && r.j.owner === "priya@smiledental.in", "…previous owner stays as admin");
r = await S(aid + "/ai-log", undefined, "a"); ok(r.j.items.some((x) => x.kind === "generate" && /QA/.test(x.result)), "AI action log (request → result, QA before/after)");

/* design system + industry intelligence (unit) */
ok(parsePrompt("Make a luxury black restaurant website in Mumbai called “Ember” with reservations").style === "luxury" && parsePrompt("…").goals, "prompt understanding");
const pl = planSitemap({ profile: "restaurant", goals: ["Book Appointments"] }); ok(pl.cta === "Reserve a Table" && pl.pages.some((p) => p.slug === "menu") && pl.pages.some((p) => p.slug === "reservations"), "restaurant: menu + reservations, CTA “Reserve a Table”");
ok(designFor({ profile: "legal" === "x" ? "" : "professional" }).motion === "subtle" && designFor({ profile: "ai" }).motion === "experimental", "industry motion language (professional = subtle, AI = experimental)");
const lux = applyStyle({ primary: "#123456" }, "luxury", true); ok(lux.primary === "#123456" && lux.headingFont === "Cormorant" && lux.button === "square", "switch style without losing colours");
/* Owner Brain: audit + auto-fix any client website */
{ const { execute } = await import("../functions/_lib/brain/tools.js"); const ou = await env.XRAY_DB.prepare("SELECT * FROM acct_users WHERE email = ?").bind("anmol@fodo.co.in").first();
  if (!ou) ok(false, "owner user row exists"); else { const AC = await import("../functions/_lib/brain/access.js"), W = await AC.who(env, ou), oc = { env, request: new Request(SITE + "/"), owner: ou, who: W, settings: {} };
    let t = await execute(oc, "eng_site_audit", { site: aid }); ok(t.ok && Object.keys(t.result.scores).length === 7 && t.result.issues.length > 0 && t.result.issues.every((i) => i.fix), "Brain eng_site_audit: 7 scores + issues with fixes");
    t = await execute(oc, "eng_site_fix", { site: aid }); if (!t.ok) process.stderr.write("FIXRES " + JSON.stringify(t).slice(0, 400) + "\n"); ok(t.ok && Array.isArray(t.result.fixed) && (t.result.fixed.length === 0 ? /Nothing/.test(t.result.note) : t.result.saved && t.result.after >= t.result.before), "Brain eng_site_fix: safe auto-fixes saved as a draft (" + (t.result && (t.result.fixed || []).length) + " fixed)");
    const mc = { env, request: new Request(SITE + "/"), owner: { email: "team@acme.in" }, who: { email: "team@acme.in", owner: false, perms: ["chat", "changes"] }, settings: {} }; t = await execute(mc, "eng_site_audit", { site: aid }); ok(!t.ok, "non-owners can't audit client websites from the Brain"); } }
ok(!all.some((t) => /re_SECRETresendKEY/.test(t)), "no key in any response");
console.log("\nv32 builder: " + pass + "/" + (pass + fail) + " passed"); process.exit(fail ? 1 : 0);
