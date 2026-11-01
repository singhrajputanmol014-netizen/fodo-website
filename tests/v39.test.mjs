// v39: Website Builder inside the Growth Lab: Builder plans + prices, free templates, plan-included levels, checkout, server-enforced template gating, Growth Lab / plans pages, phone editor. Run: node --no-warnings tests/v39.test.mjs

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
import { BUILDER, BUILDER_ORDER, BUILDER_SELL, BUILDER_IN_PLAN, publicBuilder } from "../functions/_lib/plans.js";
import { builderTier, builderInfo, grantBuilder } from "../functions/_lib/accounts.js";
import { FREE_TEMPLATES, isFreeTemplate, templateById } from "../sites/lib/templates.js";
import { saveConfig, applyConfig } from "../functions/_lib/config.js";
import { catalog } from "../functions/api/lab/[[path]].js";
await login("anmol@fodo.co.in", null, "own");
const S = (p, body, who, o) => call("sites/" + p, body, Object.assign({ as: who || "a" }, o || {}));
const future = new Date(Date.now() + 9 * 864e5).toISOString(), past = new Date(Date.now() - 864e5).toISOString();

/* ---------- 1. plans: prices, levels, what each Growth Lab plan includes ---------- */
ok(BUILDER.builder.price === 299 && BUILDER.business.price === 799 && BUILDER.free.price === 0 && BUILDER_SELL.join() === "builder,business", "Builder plans: free ₹0, Website Builder ₹299, Builder Business ₹799 (Agency is not sold alone)");
ok(BUILDER.builder.price < PLANS.starter.price && BUILDER.business.price < PLANS.growth.price, "reasonably priced: Website Builder costs less than Starter, Builder Business less than Growth");
ok(BUILDER_IN_PLAN.starter === "free" && BUILDER_IN_PLAN.growth === "builder" && BUILDER_IN_PLAN.pro === "business" && BUILDER_IN_PLAN.agency === "agency", "the bigger plans include a Builder level free: Growth → Website Builder, Pro → Business, Agency → Agency");
ok(BUILDER_ORDER.every((k, i) => i === 0 || BUILDER[k].sites > BUILDER[BUILDER_ORDER[i - 1]].sites && BUILDER[k].pages > BUILDER[BUILDER_ORDER[i - 1]].pages), "every level gives more websites and pages than the one below");
ok(BUILDER.free.templates === "free" && BUILDER_ORDER.slice(1).every((k) => BUILDER[k].templates === "all") && BUILDER.free.domains === 0, "free = free templates only, no custom domain; every paid level = all templates");
const pb = publicBuilder(); ok(pb.plans.length === 4 && pb.plans.filter((p) => p.buyable).length === 2 && pb.includedIn.map((x) => x.plan).join() === "growth,pro,agency", "public Builder plans list for the pages");

/* ---------- 2. which level an account has ---------- */
const U = (o) => Object.assign({ id: "u1", email: "x@y.in", plan: "free" }, o);
ok(builderTier(U()).tier === "free", "a logged-in free account → Builder Free");
ok(builderTier(U({ plan: "starter", plan_until: future })).tier === "free", "Starter doesn't include the paid builder");
ok(builderTier(U({ plan: "growth", plan_until: future })).tier === "builder" && builderTier(U({ plan: "growth", plan_until: future })).via === "plan", "Growth → Website Builder, included in the plan");
ok(builderTier(U({ plan: "pro", plan_until: future })).tier === "business" && builderTier(U({ plan: "agency", plan_until: future })).tier === "agency", "Pro → Builder Business, Agency → Builder Agency");
ok(builderTier(U({ plan: "growth", plan_until: past })).tier === "free", "an expired Growth plan stops including it");
ok(builderTier(U({ builder_plan: "builder", builder_until: future })).via === "builder" && builderTier(U({ builder_plan: "business", builder_until: past })).tier === "free", "a bought Builder month counts until it ends");
ok(builderTier(U({ builder_plan: "builder", builder_until: future, plan: "pro", plan_until: future })).tier === "business", "the bigger of bought + included wins");
ok(builderTier(U({ email: "anmol@fodo.co.in" })).via === "owner" && builderInfo(U({ email: "singhrajputanmol014@gmail.com" })).allTemplates, "FODO owners get everything free");

/* ---------- 3. free templates ---------- */
ok(FREE_TEMPLATES.length >= 12 && FREE_TEMPLATES.every((id) => templateById(id) && clientAllowed(templateById(id).license)), FREE_TEMPLATES.length + " free templates, all real and allowed for client websites");
ok(new Set(FREE_TEMPLATES.map((id) => templateById(id).category)).size >= 12, "free templates cover many different industries");
ok(TEMPLATES.filter((t) => t.free).length === FREE_TEMPLATES.length && !isFreeTemplate("saas-modern") && isFreeTemplate("cafe-cozy"), "each template knows if it is free (badges and server use the same list)");

/* ---------- 4. login + server-enforced limits ---------- */
let r = await S("plan", undefined, "nobody"); ok(r.status === 401 && r.j.login, "the builder needs a login (like every paid Growth Lab feature)");
r = await S("create", { mode: "template", templateId: "cafe-cozy", name: "x" }, "nobody"); ok(r.status === 401, "…creating a website too");
await login("free1@test.in", null, "f");
r = await S("plan", undefined, "f"); ok(r.j.ok && r.j.builder.tier === "free" && !r.j.builder.allTemplates && r.j.builder.freeTemplates === FREE_TEMPLATES.length && r.j.builder.totalTemplates > 200, "GET plan: free level, free template count, total templates");
r = await S("create", { mode: "template", templateId: "saas-modern", name: "Taskly", ai: false }, "f"); ok(r.status === 402 && r.j.upgrade && /Website Builder plan/.test(r.j.reason) && r.j.plans === "/plans/#builder", "a paid template is refused for a free account, with the way to upgrade");
{ const o = await S("create", { mode: "template", templateId: "cafe-cozy", name: "Owner Demo", ai: false }, "own"); const ct = await S(o.j.id + "/to-template", { name: "FODO Special" }, "own");
  r = await S("create", { mode: "template", templateId: ct.j.id, name: "Taskly", ai: false }, "f"); ok(/^ct_/.test(ct.j.id || "") && r.status === 402 && r.j.upgrade, "FODO's own custom templates count as Builder templates too"); }
r = await S("create", { mode: "template", name: "Auto pick", industry: "saas startup", ai: false }, "f"); ok(r.j.ok && isFreeTemplate(r.j.template), "no template chosen → the server picks a FREE one for a free account (" + r.j.template + ")");
r = await S("create", { mode: "template", templateId: "cafe-cozy", name: "Bean", ai: false }, "f"); ok(r.status === 402 && /allows 1 website/.test(r.j.reason), "free plan = 1 website");
await login("free2@test.in", null, "f2"); r = await S("create", { mode: "template", templateId: "cafe-cozy", name: "Bean Cafe", ai: false }, "f2"); ok(r.j.ok, "a free template works on the free plan");
r = await S("create", { mode: "ai", prompt: "A gym in Dwarka called Iron House", name: "Iron House" }, "f3"); ok(r.status === 401, "AI building also needs a login");
await login("growth@test.in", "growth", "g"); r = await S("create", { mode: "template", templateId: "saas-modern", name: "Taskly", ai: false }, "g"); ok(r.j.ok, "Growth plan → every template (Website Builder included)");
r = await S("list", undefined, "g"); ok(r.j.limits.tier === "builder" && r.j.limits.sites === 3 && r.j.limits.pages === 25 && r.j.limits.domains === 1 && r.j.limits.allTemplates, "Growth's builder limits come from the Website Builder level");
await login("pro@test.in", "pro", "p"); r = await S("list", undefined, "p"); ok(r.j.limits.tier === "business" && r.j.limits.sites === 10 && r.j.limits.domains === 5, "Pro → Builder Business limits");
r = await S("list", undefined, "own"); ok(r.j.limits.owner && r.j.limits.allTemplates && r.j.limits.sites > 1000, "owner: unlimited");
r = await S("templates", undefined, "f"); ok(r.j.ok && r.j.freeTemplates.length === FREE_TEMPLATES.length && r.j.templates.filter((t) => t.free).length === FREE_TEMPLATES.length, "the template list marks the free ones");

/* ---------- 5. buying a Builder plan ---------- */
r = await call("config", undefined, { as: "f" }); ok(r.j.builder && r.j.builder.plans.find((p) => p.id === "builder").price === 299, "account config sends the Builder plans and prices");
r = await call("checkout", { kind: "builder", item: "agency", phone: "9876543210" }, { as: "f" }); ok(r.status === 400, "Builder Agency can't be bought alone");
r = await call("checkout", { kind: "builder", item: "nope", phone: "9876543210" }, { as: "f" }); ok(r.status === 400, "unknown Builder plan refused");
r = await call("checkout", { kind: "builder", item: "builder", phone: "9876543210" }, { as: "p" }); ok(r.status === 409 && /Pro plan already includes Builder Business/.test(r.j.reason), "a Pro account is never sold what its plan already includes");
r = await call("checkout", { kind: "builder", item: "builder", phone: "9876543210" }, { as: "f" }); const lastCf = cf.filter((x) => x.m === "POST").pop();
ok(r.j.ok && lastCf && lastCf.body.order_amount === 299 && /Website Builder, 1 month/.test(lastCf.body.order_note), "checkout: ₹299, priced by the server (not the browser)");
const oid = lastCf.body.order_id; r = await call("verify", { order_id: oid }, { as: "f" }); ok(!r.j.paid, "not paid yet → nothing granted");
cfPaid[oid] = 299; r = await call("verify", { order_id: oid }, { as: "f" }); ok(r.j.paid, "paid → confirmed with the gateway");
r = await call("me", undefined, { as: "f" }); const me = r.j.user || r.j; ok(me.builder && me.builder.tier === "builder" && me.builder.via === "builder" && Date.parse(me.builder.until) > Date.now() + 29 * 864e5, "account now has Website Builder for 30 days");
r = await call("verify", { order_id: oid }, { as: "f" }); r = await call("me", undefined, { as: "f" }); ok(Date.parse((r.j.user || r.j).builder.until) < Date.now() + 31 * 864e5, "verifying again doesn't add a second month (idempotent)");
r = await S("create", { mode: "template", templateId: "saas-modern", name: "Taskly", ai: false }, "f"); ok(r.j.ok, "after paying: paid templates and a 2nd website work");
r = await call("ledger", undefined, { as: "f" }); ok(r.j.items.some((l) => l.kind === "builder" && /Website Builder, 1 month/.test(l.note)), "the purchase is in the credit history");
r = await call("checkout", { kind: "plan", item: "starter", phone: "9876543210" }, { as: "f" }); ok(r.j.ok, "X-Ray plans still sell as before");
{ const d = env.XRAY_DB; const uid = (await d.prepare("SELECT id FROM acct_users WHERE email='free2@test.in'").first()).id;
  ok(await grantBuilder(env, uid, "business", "t:1") && !(await grantBuilder(env, uid, "business", "t:1")) && !(await grantBuilder(env, uid, "agency", "t:2")), "grantBuilder: idempotent by reference, only sellable levels"); }

/* ---------- 6. admin prices ---------- */
let sv = await saveConfig(env, { builder: { builder: { price: 349 } } }, "anmol@fodo.co.in"); ok(sv.ok && BUILDER.builder.price === 349, "the owner can change the Builder price in Admin → Prices");
r = await call("checkout", { kind: "builder", item: "builder", phone: "9876543210" }, { as: "f2" }); ok(r.status === 409, "…(free2 now has Business, so Website Builder isn't sold to it)");
await login("free4@test.in", null, "f4"); r = await call("checkout", { kind: "builder", item: "builder", phone: "9876543210" }, { as: "f4" }); ok(r.j.ok && cf.filter((x) => x.m === "POST").pop().body.order_amount === 349, "checkout uses the new price straight away");
sv = await saveConfig(env, { builder: { builder: { price: -5 }, agency: { price: 10 } } }, "anmol@fodo.co.in"); ok(!sv.ok && sv.errors.length === 2, "bad prices and unsellable plans are refused");
await saveConfig(env, { reset: true }, "anmol@fodo.co.in"); ok(BUILDER.builder.price === 299, "reset → back to ₹299");

/* ---------- 7. Growth Lab catalog, pages, help ---------- */
const cat = catalog(env); const wb = cat.tools.find((t) => t.id === "website-builder");
ok(wb && wb.where === "website-builder/" && wb.on && cat.builder && cat.builder.plans.length === 4, "the Growth Lab catalog lists the Website Builder with its plans");
const html = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");
const gl = html("growth-lab/index.html"); ok(/id="gl-builder"/.test(gl) && /data-tool="website-builder"/.test(gl) && /href="\.\.\/website-builder\/"/.test(gl) && /₹299\/month/.test(gl) && /Included free/.test(gl), "/growth-lab/ has the Website Builder band: free start, ₹299, included in bigger plans");
const pl = html("plans/index.html"); ok(/id="builder"/.test(pl) && /id="pl-builder"/.test(pl) && (pl.match(/class="panel hud pl-card pl-wb"/g) || []).length === 4 && /₹799/.test(pl), "/plans/ has the 4 Builder plans (no-JS copy for search engines)");
ok(!/fodo\.site/.test(gl + pl), "no made-up web address on the pages (free sites live on sites.fodo.co.in)");
const { priceFacts } = await import("../functions/_lib/help.js"); ok(priceFacts().builder.some((x) => /₹299/.test(x)) && priceFacts().builder.some((x) => /Growth plan includes/.test(x)), "the help assistant knows the Builder prices");
const { HELP_KB } = await import("../functions/_lib/helpkb.js"); ok(HELP_KB.some((a) => a.id === "builder-plans"), "help article: how much does the Website Builder cost");

/* ---------- 8. phone editor + gallery wiring (static checks; the e2e suite clicks through them) ---------- */
const js = (p) => fs.readFileSync(new URL("../js/" + p, import.meta.url), "utf8"), css = fs.readFileSync(new URL("../css/wb-studio.css", import.meta.url), "utf8");
ok(/MB\.mount\(/.test(js("website-builder.js")) && /MB\.onSelect\(true/.test(js("website-builder.js")) && /export function mount/.test(js("wb-mobile.js")), "the editor mounts the phone layout and tells it about selections");
ok(/@media \(max-width:760px\)\{[\s\S]*\.wb-mnav\{display:grid/.test(css) && /\.wb-mnav,\.wb-shade\{display:none\}/.test(css) && /env\(safe-area-inset-bottom\)/.test(css), "bottom navigation only on phones, respects the iPhone home bar");
ok(/\.wb-ed input,\.wb-ed select,\.wb-ed textarea\{font-size:16px\}/.test(css), "16px inputs on phones (no iOS zoom-in)");
ok(/guardUse\(t/.test(js("wb-create.js")) && /CR\.guardUse/.test(js("wb-home.js")) && /data-only="free"/.test(js("wb-create.js")), "every 'use template' goes through the plan check; a Free filter in the gallery");
ok(/wb_upgrade_shown/.test(fs.readFileSync(new URL("../functions/_lib/traffic.js", import.meta.url), "utf8")), "upgrade sheet views are counted (first-party analytics)");
/* ---------- 9. Builder System Health (stale deploy / cache detection) ---------- */
r = await S("version", undefined, "nobody"); ok(r.j.ok && r.j.templates === TEMPLATES.length && r.j.api === "v41" && /^[a-z0-9]+$/.test(r.j.registry) && !/@|ws_/.test(r.t), "public /api/sites/version: real template count + registry hash, no account data");
r = await S("system-health", undefined, "f"); ok(r.status === 403, "system health is owner-only");
r = await S("system-health", undefined, "own"); ok(r.j.ok && r.j.templates === TEMPLATES.length && r.j.checks.some((c) => /Builder plan columns/.test(c.name) && c.ok) && r.j.checks.some((c) => /Custom domains API/.test(c.name) && !c.ok) && !/test-sites-secret/.test(r.t), "owner sees schema, hosting, secrets present (never their values) and what is not configured");
{ const b = JSON.parse(fs.readFileSync(new URL("../data/build.json", import.meta.url), "utf8")), wbh = fs.readFileSync(new URL("../website-builder/index.html", import.meta.url), "utf8");
  ok(b.build && wbh.indexOf('name="fodo-build" content="' + b.build + '"') > -1 && /"\/sites\/lib\/templates\.js":"\/sites\/lib\/templates\.js\?v=/.test(wbh.replace(/\s/g, "")), "the builder page carries its build stamp (= data/build.json) and versions every module through the import map"); }
ok(/versionCheck/.test(js("website-builder.js")) && /A newer version of the Website Builder is live/.test(js("wb-home.js")) && !/37 designs/.test(js("wb-home.js") + js("wb-create.js")), "a stale page says so and offers a reload; template counts are always computed, never typed in");
ok(!all.some((t) => /cf_SECRET_key|re_SECRETresend|test-sites-secret/.test(t)), "no secret in any response");
console.log(`\nv39: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
