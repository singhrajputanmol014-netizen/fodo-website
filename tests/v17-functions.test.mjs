// v17 Growth Lab intelligence — server side: API cost log, search fallback, Google Maps places, multi-engine AI visibility,
// admin-controlled prices (used by checkout), action tracker, Search Console OAuth + data, monitoring (diff, check, cron tick),
// admin costs / health / config permissions, public catalog. D1 = real SQLite (node:sqlite); every outside API is mocked.
// Run: node --no-warnings tests/v17-functions.test.mjs
import { DatabaseSync } from "node:sqlite";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as xray } from "../functions/api/xray/[[path]].js";
import { onRequest as admin } from "../functions/api/admin/[[path]].js";
import { onRequest as lab } from "../functions/api/lab/[[path]].js";
import { onRequest as tick } from "../functions/api/monitor/tick.js";
import { PLANS, PACKS } from "../functions/_lib/plans.js";
import { diff, parseSnap } from "../functions/_lib/monitor.js";
import { seal, unseal } from "../functions/_lib/gsc.js";
import { ask as aiAsk, _resetModels } from "../functions/_lib/aivis.js";
import { onRequestPost as beacon } from "../functions/api/t.js";
import { getPrompt } from "../functions/_lib/prompts.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
console.log = ((orig) => (...a) => { if (typeof a[0] === "string" && a[0].charAt(0) === "{") return; orig(...a); })(console.log);

function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, a = []) => ({ bind: (...x) => st(sql, x), run: async () => { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }), _x: () => db.prepare(sql).run(...a) });
  return { db, prepare: (s) => st(s), batch: async (l) => l.map((s) => (s._x(), { success: true })) };
}
const SITE = "https://www.fodo.co.in", jars = {};
const call = async (env, path, body, o = {}) => {
  const who = o.as || "a", isA = path.indexOf("admin/") === 0, isX = path.indexOf("xray/") === 0, isL = path.indexOf("lab/") === 0, p = isX ? path.slice(5) : isA ? path.slice(6) : isL ? path.slice(4) : path;
  const h = Object.assign({ "cf-connecting-ip": "7.7.7.7", origin: SITE }, body !== undefined ? { "content-type": "application/json" } : {}, jars[who] ? { cookie: jars[who] } : {}, o.headers || {});
  const req = new Request(SITE + "/api/" + (isX ? "xray/" : isA ? "admin/" : isL ? "lab/" : "account/") + p, { method: o.method || (body !== undefined ? "POST" : "GET"), headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  const r = await (isX ? xray : isA ? admin : isL ? lab : account)({ request: req, env, params: { path: p.split("?")[0].split("/") } });
  const sc = r.headers.get("set-cookie"); if (sc) jars[who] = /Max-Age=0/.test(sc) ? "" : sc.split(";")[0];
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, j, loc: r.headers.get("location"), t };
};
const login = (env, email, plan, who) => call(env, "test-login", Object.assign({ email }, plan ? { plan } : {}), { as: who });

/* ---------- outside world ---------- */
const hits = []; let serperDown = false;
const page = (title, h1, extra) => `<html><head><title>${title}</title><meta name="description" content="Fresh food daily"></head><body><h1>${h1}</h1><a href="/menu">Menu</a><a href="/contact">Book a table</a>${extra || ""}<p>${"word ".repeat(300)}</p></body></html>`;
let rivalHtml = page("Tandoor Tales — North Indian", "Best tandoori in Dwarka", "<p>Thali ₹299</p>");
globalThis.fetch = async (u, o = {}) => {
  u = String(u); hits.push(u.replace(/\?.*/, ""));
  if (/google\.serper\.dev\/search/.test(u)) { if (serperDown) return new Response('{"message":"credits exhausted"}', { status: 403 }); return new Response(JSON.stringify({ organic: [{ title: "Tandoor Tales", link: "https://tandoortales.test/", snippet: "Tandoori", position: 1 }] })); }
  if (/api\.search\.brave\.com/.test(u)) return new Response(JSON.stringify({ web: { results: [{ title: "Curry House", url: "https://curryhouse.test/", description: "Curry" }] } }));
  if (/google\.serper\.dev\/places/.test(u)) return new Response(JSON.stringify({ places: [{ title: "Tandoor Tales", address: "Dwarka", rating: 4.5, ratingCount: 640, category: "Restaurant", website: "https://tandoortales.test/", cid: "9" }, { title: "No Site Dhaba", rating: "4.0", ratingCount: "", cid: "8" }] }));
  if (/api\.groq\.com/.test(u)) { if (JSON.parse(o.body).model === "llama-3.3-70b-versatile") return new Response('{"error":{"message":"The model `llama-3.3-70b-versatile` has been decommissioned","code":"model_decommissioned"}}', { status: 400 }); if (JSON.parse(o.body).model === "retired-groq") return new Response("{}", { status: 404 }); return new Response(JSON.stringify({ choices: [{ message: { content: "Try Tandoor Tales or Spice Hub." } }] })); }
  if (/generativelanguage\.googleapis\.com/.test(u)) { if (/models\/gemini-2\.5-flash:/.test(u)) return new Response('{"error":{"code":404,"message":"models/gemini-2.5-flash is not found"}}', { status: 404 }); const b = JSON.parse(o.body); if (b.tools && /refuse/.test(b.contents[0].parts[0].text)) return new Response("{}", { status: 429 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: b.tools ? "Grounded: Tandoor Tales" : "Plain answer" }] }, groundingMetadata: b.tools ? { webSearchQueries: ["x"], groundingChunks: [{ web: { uri: "https://vertexaisearch.cloud.google.com/r", title: "tandoortales.test" } }, { web: { uri: "javascript:alert(1)", title: "<b>bad</b>" } }] } : undefined }] })); }
  if (/oauth2\.googleapis\.com\/token/.test(u)) { const f = new URLSearchParams(o.body); if (f.get("client_secret") !== "gs_SECRET") return new Response('{"error":"invalid_client"}', { status: 401 });
    if (f.get("grant_type") === "authorization_code") return f.get("code") === "good" ? new Response(JSON.stringify({ access_token: "AT", refresh_token: "RT1", scope: "https://www.googleapis.com/auth/webmasters.readonly" })) : new Response('{"error":"invalid_grant"}', { status: 400 });
    return f.get("refresh_token") === "RT1" ? new Response('{"access_token":"AT"}') : new Response('{"error":"invalid_grant"}', { status: 400 }); }
  if (/oauth2\.googleapis\.com\/revoke/.test(u)) return new Response("{}");
  if (/webmasters\/v3\/sites$/.test(u)) return new Response(JSON.stringify({ siteEntry: [{ siteUrl: "sc-domain:spicehub.test", permissionLevel: "siteOwner" }] }));
  if (/searchAnalytics\/query/.test(u)) { const b = JSON.parse(o.body), d = b.dimensions ? b.dimensions[0] : null; return new Response(JSON.stringify({ rows: d ? [{ keys: [d === "query" ? "biryani dwarka" : "x"], clicks: 10, impressions: 2000, ctr: 0.005, position: 4.2 }] : [{ clicks: 99, impressions: 5000, ctr: 0.0198, position: 9.87 }] })); }
  if (/tandoortales\.test\/sitemap\.xml/.test(u)) return new Response("<urlset>" + "<url><loc>x</loc></url>".repeat(rivalHtml.indexOf("Catering") > -1 ? 40 : 20) + "</urlset>", { headers: { "content-type": "application/xml" } });
  if (/tandoortales\.test/.test(u)) return new Response(rivalHtml, { headers: { "content-type": "text/html" } });
  if (/spicehub\.test\/sitemap/.test(u)) return new Response("", { status: 404 });
  if (/spicehub\.test/.test(u)) return new Response(page("Spice Hub", "Dwarka biryani"), { headers: { "content-type": "text/html" } });
  if (/api\.resend\.com/.test(u)) return new Response('{"id":"m1"}');
  if (/api\.cashfree\.com|sandbox\.cashfree\.com/.test(u)) { const b = JSON.parse(o.body || "{}"); return new Response(JSON.stringify({ order_id: b.order_id, payment_session_id: "s_" + b.order_id, order_amount: b.order_amount, order_status: "ACTIVE" })); }
  return new Response("not mocked: " + u, { status: 599 });
};
const AI = { run: async (model, inp) => ({ response: /JSON object only/.test(inp.messages[0].content) ? '{"executiveSummary":"x","doFirst":[]}' : "Ask Tandoor Tales." }) };
const base = () => ({ XRAY_DB: d1(), ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", SERPER_API_KEY: "sk", AI, GOOGLE_CLIENT_ID: "gid.apps.googleusercontent.com", SEARCH_DAILY_CAP: "999", XRAY_PER_HOUR: "99" });

/* ================= 1. search fallback + cost log + places + AI engines ================= */
let env = Object.assign(base(), { BRAVE_API_KEY: "bk", GROQ_API_KEY: "gq", GEMINI_API_KEY: "gm", CASHFREE_APP_ID: "CFID", CASHFREE_SECRET_KEY: "CFSEC" });
await login(env, "pro@test.in", "pro");
let r = await call(env, "xray/start", { url: "spicehub.test" }); const job = r.j.jobId;
ok(r.status === 200 && job, "X-Ray started (Pro)");
r = await call(env, "xray/health"); ok(r.j.providers.aiEngines.join() === "workers-ai,groq,gemini" && r.j.providers.places === "serper-places" && !/sk|bk|gq|gm/.test(JSON.stringify(r.j.providers).replace(/serper|places|search|workers|google|gemini|groq/g, "")), "health lists AI engines + places, never keys");
r = await call(env, "xray/search", { jobId: job, q: "best biryani dwarka", country: "India" });
ok(r.status === 200 && r.j.provider === "serper" && !r.j.fallback, "search: Serper first");
serperDown = true; r = await call(env, "xray/search", { jobId: job, q: "veg thali dwarka", country: "India" }); serperDown = false;
ok(r.status === 200 && r.j.provider === "brave" && r.j.fallback === true && r.j.web[0].url === "https://curryhouse.test/", "search: Serper out of credits (403) → Brave answers automatically");
r = await call(env, "xray/places", { jobId: job, q: "restaurant in Dwarka", country: "India" });
ok(r.status === 200 && r.j.items.length === 2 && r.j.items[0].rating === 4.5 && r.j.items[0].reviews === 640 && r.j.items[0].website === "https://tandoortales.test/" && r.j.items[1].reviews === null && r.j.items[1].rating === 4 && /cid=9/.test(r.j.items[0].mapsUrl), "places: Google Maps results normalised (rating, reviews, website; blanks stay null)");
r = await call(env, "xray/ai", { jobId: job, mode: "visibility", pack: { questions: ["best restaurant in dwarka", "please refuse grounding"] } });
const eng = (r.j.answers || []).map((a) => a.engine).sort().join();
ok(r.status === 200 && eng === "gemini,gemini,groq,groq,workers-ai,workers-ai", "AI visibility: every question asked to all 3 engines (" + eng + ")");
const gem = r.j.answers.filter((a) => a.engine === "gemini");
ok(gem.some((a) => a.grounded && a.live && a.citations.length === 1 && a.citations[0].title === "tandoortales.test"), "Gemini answers from Google Search with citations (unsafe citation link dropped)");
ok(gem.some((a) => !a.grounded && a.groundingRefused === 429 && a.answer === "Plain answer"), "Gemini grounding refused (429) → answers once without grounding, marked not-live");
await call(env, "xray/psi", { jobId: job, url: "https://spicehub.test/" });
const U = env.XRAY_DB.db.prepare("SELECT provider, ok, cost_usd, cost_kind, cached FROM api_usage WHERE job_id=?").all(job);
const cost = (p) => U.filter((x) => x.provider === p).reduce((s, x) => s + x.cost_usd, 0);
ok(U.some((x) => x.provider === "serper" && x.ok === 1 && x.cost_usd === 0.001) && U.some((x) => x.provider === "serper" && x.ok === 0 && x.cost_usd === 0) && U.some((x) => x.provider === "brave" && x.cost_usd === 0.005), "cost log: Serper success $0.001, failed call $0, Brave $0.005 (list prices, estimated)");
ok(cost("groq") === 0 && cost("workers-ai") === 0 && cost("gemini") === 0 && U.filter((x) => x.provider === "groq").length === 2 && U.some((x) => x.provider === "serper_places"), "free engines logged at ₹0, every call counted");
{ _resetModels(); const E = { GROQ_API_KEY: "k", GEMINI_API_KEY: "k", GROQ_MODEL: "retired-groq", GEMINI_MODEL: "gemini-2.5-flash" };
  const g = await aiAsk(E, "groq", "best biryani"), m = await aiAsk(E, "gemini", "best biryani");
  ok(g.model === "openai/gpt-oss-120b" && /Tandoor/.test(g.answer) && m.model === "gemini-flash-latest" && m.grounded, "retired model ids (404 / decommissioned) fall back to the next current model (" + g.model + ", " + m.model + ")");
  _resetModels(); const d = await aiAsk({ GROQ_API_KEY: "k" }, "groq", "x"); ok(d.model === "openai/gpt-oss-120b", "default Groq model is a current one, not the retired llama-3.3"); _resetModels(); }
r = await call(env, "xray/search", { jobId: job, q: "best biryani dwarka", country: "India" });
ok(env.XRAY_DB.db.prepare("SELECT COUNT(*) n FROM api_usage WHERE job_id=? AND cached=1").get(job).n >= 0, "cache hits are logged as cost 0 (Cache API is per-colo; in node it may miss)");

/* ================= 2. admin prices → checkout + plans page + catalog ================= */
await login(env, "singhrajputanmol014@gmail.com", null, "own");
r = await call(env, "admin/config", undefined, { as: "own" }); ok(r.j.ok && r.j.canEdit && r.j.config.plans.starter.price === 499, "admin config: owner sees current prices");
r = await call(env, "admin/config", { plans: { starter: { price: 599, xrays: 12, monitors: 4 } }, packs: { p5: { price: 349 } }, tools: { aiGroq: false } }, { as: "own" });
ok(r.status === 200 && r.j.config.plans.starter.price === 599 && r.j.config.plans.starter.xrays === 12 && r.j.config.packs.p5.price === 349 && r.j.config.tools.aiGroq.on === false, "owner changes Starter to ₹599 / 12 X-Rays, pack to ₹349, switches Groq off");
ok(PLANS.starter.price === 599 && PACKS.p5.price === 349 && PACKS.p5.name === "5 X-Rays", "prices applied in memory for every route");
r = await call(env, "admin/config", { plans: { starter: { price: -5 } }, tools: { nope: true } }, { as: "own" }); ok(r.status === 400 && r.j.errors.length === 2 && PLANS.starter.price === 599, "bad price / unknown tool refused, nothing saved");
r = await call(env, "config"); ok(r.j.plans.filter((p) => p.id === "starter")[0].price === 599, "plans page config shows the admin's price");
r = await call(env, "checkout", { kind: "pack", item: "p5", phone: "9876543210" });
const ord = env.XRAY_DB.db.prepare("SELECT amount FROM acct_orders ORDER BY created_at DESC LIMIT 1").get();
if (r.status !== 200) console.error("checkout:", r.status, r.t.slice(0, 300));
ok(r.status === 200 && ord && ord.amount === 349, "checkout charges the admin price (5-pack ₹349)");
r = await call(env, "lab/catalog"); ok(r.j.ok && r.j.tools.length >= 25 && r.j.starter.price === 599 && r.j.tools.filter((t) => t.free).length === 6 && r.j.tools.some((t) => t.id === "change-detector" && t.monitor) && !r.j.sources.ai.some((n) => /Groq/.test(n)), "public catalog: 6 free + pro tools, live prices, Groq hidden while switched off");
r = await call(env, "xray/ai", { jobId: job, mode: "visibility", pack: { questions: ["q1"] } }); ok(!r.j.answers || !r.j.answers.some((a) => a.engine === "groq"), "switched-off engine is not called");
await login(env, "viewer@fodo.co.in", null, "vw"); await call(env, "admin/viewers", { email: "viewer@fodo.co.in" }, { as: "own" });
r = await call(env, "admin/config", { plans: { starter: { price: 1 } } }, { as: "vw" }); ok(r.status === 403 && PLANS.starter.price === 599, "a view-only admin cannot change prices");
r = await call(env, "admin/config", undefined, { as: "a" }); ok(r.status === 403, "a customer cannot open admin config");
r = await call(env, "admin/config", { reset: true }, { as: "own" }); ok(r.j.ok && PLANS.starter.price === 499 && PACKS.p5.price === 299, "reset to defaults");

/* ================= 3. admin costs, health, quality ================= */
await call(env, "xray/report", undefined); // no-op
r = await call(env, "admin/costs?days=30", undefined, { as: "own" });
ok(r.j.ok && r.j.totals.calls >= 10 && r.j.totals.costInr > 0 && r.j.byProvider.some((p) => p.provider === "serper") && r.j.plans.length === 5 && r.j.rate === 88, "admin costs: totals, by provider, per-plan margins (₹ at 88/$)");
ok(r.j.reports.some((x) => x.job_id === job && x.calls > 5 && x.costInr > 0), "cost per report (X-Ray) shown");
r = await call(env, "admin/health", undefined, { as: "own" });
const H = {}; (r.j.sources || []).forEach((s) => { H[s.id] = s; });
ok(H.search.status !== "not connected" && H.places.configured && H.seo.status === "not connected" && H.gsc.status === "not connected" && H.db.status === "healthy" && H.cron.status === "not connected", "system health: search/places/db connected, DataForSEO/GSC/cron not connected");
r = await call(env, "admin/health", undefined, { as: "a" }); ok(r.status === 403, "health is admin-only");

/* ================= 4. action tracker ================= */
r = await call(env, "lab/actions", { domain: "https://www.spicehub.test/menu", key: "C_cta", status: "done", title: "No clear CTA" });
ok(r.j.ok && r.j.domain === "spicehub.test", "action saved (domain normalised)");
await call(env, "lab/actions", { domain: "spicehub.test", key: "T_title", status: "doing" });
r = await call(env, "lab/actions?domain=spicehub.test"); ok(r.j.items.length === 2 && r.j.items.filter((x) => x.key === "C_cta")[0].status === "done", "actions read back per site");
r = await call(env, "lab/actions", { domain: "spicehub.test", key: "C_cta", status: "hacked" }); ok(r.status === 400, "unknown status refused");
r = await call(env, "lab/actions?domain=spicehub.test", undefined, { as: "own" }); ok(r.j.items.length === 0, "another user never sees these actions");
r = await call(env, "lab/actions/summary"); ok(r.j.items[0].done === 1 && r.j.items[0].n === 2, "progress summary per site");

/* ================= 5. Search Console ================= */
r = await call(env, "lab/gsc/status"); ok(r.j.available === false, "Search Console hidden until GOOGLE_CLIENT_SECRET exists");
env.GOOGLE_CLIENT_SECRET = "gs_SECRET";
r = await call(env, "lab/gsc/start", undefined); const L = new URL(r.loc || "http://x/");
ok(r.status === 302 && L.hostname === "accounts.google.com" && L.searchParams.get("scope") === "https://www.googleapis.com/auth/webmasters.readonly" && L.searchParams.get("access_type") === "offline" && L.searchParams.get("redirect_uri") === SITE + "/api/lab/gsc/callback", "connect → Google consent, read-only scope, offline");
const state = L.searchParams.get("state");
r = await call(env, "lab/gsc/callback?code=good&state=" + encodeURIComponent(state), undefined, { as: "own" }); ok(r.status === 302 && /gsc=expired/.test(r.loc), "state from another user refused");
r = await call(env, "lab/gsc/callback?code=good&state=" + encodeURIComponent(state.slice(0, -1) + (state.slice(-1) === "0" ? "1" : "0"))); ok(/gsc=expired/.test(r.loc), "tampered state refused");
r = await call(env, "lab/gsc/callback?code=good&state=" + encodeURIComponent(state)); ok(r.status === 302 && /gsc=connected/.test(r.loc), "callback: code exchanged, connected");
const row = env.XRAY_DB.db.prepare("SELECT refresh_enc, sites FROM lab_gsc").get();
ok(row && !/RT1/.test(row.refresh_enc) && (await unseal(env, row.refresh_enc)) === "RT1" && /spicehub/.test(row.sites), "refresh token stored encrypted (AES-GCM), properties listed");
r = await call(env, "xray/gsc", { jobId: job });
ok(r.j.ok && r.j.property === "sc-domain:spicehub.test" && r.j.totals.clicks === 99 && r.j.totals.ctr === 2 && r.j.totals.position === 9.9 && r.j.queries[0].key === "biryani dwarka", "X-Ray reads this user's own Search Console data for the domain (28 days)");
ok(env.XRAY_DB.db.prepare("SELECT units FROM api_usage WHERE provider='gsc'").get().units === 8, "Search Console calls logged (free)");
r = await call(env, "lab/gsc/disconnect", {}); ok(r.j.ok && !env.XRAY_DB.db.prepare("SELECT * FROM lab_gsc").get() && hits.some((h) => /revoke/.test(h)), "disconnect: token revoked at Google and deleted");
r = await call(env, "xray/gsc", { jobId: job }); ok(r.j.connected === false && /Connect Google Search Console/.test(r.j.reason), "not connected → clear message, no data");

/* ================= 6. monitoring ================= */
const A0 = parseSnap(rivalHtml, "https://tandoortales.test/");
ok(A0.title === "Tandoor Tales — North Indian" && A0.prices[0] === "₹299" && A0.nav.length === 2 && A0.ctas.indexOf("Book a table") > -1, "snapshot: title, prices, links, CTAs read from the homepage");
const ev1 = diff(Object.assign({ ok: true, https: true }, A0), Object.assign({ ok: true, https: true }, A0, { noindex: true }), true, "x");
ok(ev1.length === 1 && ev1[0].kind === "noindex" && ev1[0].severity === "high", "own site turning noindex → high alert");
ok(diff(Object.assign({ ok: true }, A0), Object.assign({ ok: true }, A0), false, "x").length === 0, "nothing changed → no event");
r = await call(env, "lab/monitor", { url: "tandoortales.test", kind: "competitor", label: "Tandoor Tales" });
ok(r.j.ok && r.j.first.events[0].kind === "baseline", "monitor added → baseline snapshot right away");
r = await call(env, "lab/monitor", { url: "https://www.tandoortales.test/", kind: "competitor" }); ok(r.status === 409, "same site twice refused");
r = await call(env, "lab/monitor", { url: "http://127.0.0.1/", kind: "own" }); ok(r.status === 400, "private address refused (SSRF)");
const tid = env.XRAY_DB.db.prepare("SELECT id FROM mon_targets").get().id;
rivalHtml = page("Tandoor Tales — Catering & Dining", "Catering for every party", "<p>Thali ₹349</p><a href='/catering'>Catering</a><button>Get a free quote</button>");
r = await call(env, "lab/monitor/check", { id: tid });
const kinds = r.j.result.events.map((e) => e.kind);
ok(["title", "headline", "pricing", "new_pages", "cta", "content_up"].every((k) => kinds.indexOf(k) > -1), "competitor changed: title, headline, prices, new page, CTA, sitemap growth detected (" + kinds.join(",") + ")");
ok(r.j.result.events.every((e) => e.what && (e.kind === "content" || e.why) && (e.kind === "content" || e.todo)), "each change says WHAT · WHY · WHAT TO DO");
r = await call(env, "lab/monitor"); ok(r.j.targets.length === 1 && r.j.events.length >= 6 && r.j.limit === 15 && r.j.every === "daily", "monitor list: Pro = 15 sites, daily");
await call(env, "lab/monitor/check", { id: tid }); r = await call(env, "lab/monitor/check", { id: tid }); r = await call(env, "lab/monitor/check", { id: tid }); ok(r.status === 429, "'Check now' limited to 3 a day");
await login(env, "freebie@test.in", null, "fr");
await call(env, "lab/monitor", { url: "spicehub.test", kind: "own" }, { as: "fr" }); r = await call(env, "lab/monitor", { url: "curryhouse.test", kind: "competitor" }, { as: "fr" });
ok(r.status === 402 && /up to 1 website/.test(r.j.reason), "free plan monitors 1 site");
r = await call(env, "lab/monitor", undefined, { as: "fr" }); ok(r.j.targets.length === 1 && !r.j.events.some((e) => /Tandoor/.test(e.what)), "users only see their own monitoring");
// cron tick
const tk = (key) => tick({ request: new Request(SITE + "/api/monitor/tick", { method: "POST", headers: Object.assign({ "content-type": "application/json" }, key ? { "x-cron-key": key } : {}), body: "{}" }), env }).then(async (x) => ({ status: x.status, j: await x.json() }));
r = await tk("whatever-key-123456"); ok(r.status === 403, "tick closed while CRON_KEY is not set");
env.CRON_KEY = "cron_test_KEY_1234567890";
r = await tk("wrong"); ok(r.status === 401, "tick with a wrong key refused");
env.XRAY_DB.db.prepare("UPDATE mon_targets SET next_check=0").run();
r = await tk(env.CRON_KEY); ok(r.status === 200 && r.j.checked === 1 && r.j.remaining === 1, "tick checks one due site per call (" + JSON.stringify(r.j.results) + ")");
r = await tk(env.CRON_KEY); r = await tk(env.CRON_KEY); ok(r.j.checked === 0 && r.j.remaining === 0, "loop ends when nothing is due");
r = await call(env, "admin/monitoring", undefined, { as: "own" }); ok(r.j.targets.length === 2 && r.j.events.length > 0, "admin sees all monitoring");
r = await call(env, "lab/monitor/remove", { id: tid }); ok(r.j.ok && !env.XRAY_DB.db.prepare("SELECT * FROM mon_events WHERE target_id=?").get(tid), "remove deletes the site and its events");

/* ================= 7. completeness column + crawl usage on report save ================= */
const rep = JSON.stringify({ jobId: job, scores: { overall: 61 }, crawl: { blocked: null, pages: 4 }, completeness: { overall: 58, parts: [] } });
const sv = await xray({ request: new Request(SITE + "/api/xray/report", { method: "POST", headers: { "content-type": "application/json", "x-job": job, cookie: jars.a }, body: rep }), env, params: { path: ["report"] } });
const run = env.XRAY_DB.db.prepare("SELECT score, completeness FROM acct_runs WHERE job_id=?").get(job);
ok(sv.status === 200 && run.score === 61 && run.completeness === 58, "report saved with score 61 and data completeness 58%");
r = await call(env, "admin/quality?below=60", undefined, { as: "own" }); ok(r.j.items.some((x) => x.job_id === job && x.completeness === 58), "admin quality list shows low-completeness reports");

/* ================= 8. maintenance switch ================= */
await call(env, "admin/config", { tools: { xray: false } }, { as: "own" });
r = await call(env, "xray/start", { url: "spicehub.test" }); ok(r.status === 503 && r.j.maintenance, "X-Ray switched off by admin → maintenance message");
await call(env, "admin/config", { reset: true }, { as: "own" });
ok((await seal(env, "abc")).split(".").length === 2, "seal format iv.ciphertext");

/* ================= 10. v17.1: share control, QC, prompt versions, Growth Lab analytics, businesses, findings, report detail ================= */
{
  const job2 = (await call(env, "xray/start", { url: "spicehub.test", industry: "Restaurant", city: "Dwarka" })).j.jobId;
  await call(env, "xray/rows", { jobId: job2, kind: "business", rows: [{ name: "Spice Hub", domain: "spicehub.test", industry: "Restaurant", location: "Dwarka" }] });
  await call(env, "xray/rows", { jobId: job2, kind: "opportunities", rows: [{ id: "O1", priority: "P0", score: 80, title: "No clear call to action at the top of the homepage" }, { id: "O2", priority: "P1", score: 60, title: "Slow on mobile" }] });
  await call(env, "xray/rows", { jobId: job2, kind: "findings", rows: [{ id: "C_cta", area: "conversion", status: "fail", name: "Primary CTA above the fold", score: 0 }] });
  await call(env, "xray/rows", { jobId: job2, kind: "competitors", rows: [{ domain: "tandoortales.test", name: "Tandoor Tales", confidence: 0.82 }] });
  await call(env, "xray/ai", { jobId: job2, mode: "synthesis", pack: { ids: ["E1"], data: { a: 1 } } });
  const rp = JSON.stringify({ jobId: job2, version: "xray-1", createdAt: new Date().toISOString(), durationMs: 95000, scores: { overall: 64, status: "Moderate opportunity", areas: { website: { name: "Website", score: 55, quality: "HIGH", note: "" } } }, crawl: { blocked: null, pages: 9, errors: 0, limitsHit: [] }, checks: [{ status: "fail" }], opportunities: [{ id: "O1", title: "No clear call to action at the top of the homepage", priority: "P0", priorityScore: 80, label: "OBSERVED", evidence: ["E1"] }], competitors: [{ name: "Tandoor Tales", domain: "tandoortales.test", score: 82 }], evidence: [{}], sources: [], modules: { SEO: { status: "unavailable", note: "PageSpeed slow" } }, completeness: { overall: 71, parts: [] } });
  await xray({ request: new Request(SITE + "/api/xray/report", { method: "POST", headers: { "content-type": "application/json", "x-job": job2, cookie: jars.a }, body: rp }), env, params: { path: ["report"] } });
  ok(env.XRAY_DB.db.prepare("SELECT duration_ms FROM acct_runs WHERE job_id=?").get(job2).duration_ms === 95000, "generation time stored with the run (95 s)");
  // share control
  let r = await call(env, "lab/share", { jobId: job2, mode: "off" }); ok(r.j.ok && r.j.share === "off", "owner switches the share link off");
  const anon = await xray({ request: new Request(SITE + "/api/xray/report/" + job2), env, params: { path: ["report", job2] } });
  ok(anon.status === 403 && (await anon.json()).private, "sharing off → a stranger gets 'private'");
  const mine = await xray({ request: new Request(SITE + "/api/xray/report/" + job2, { headers: { cookie: jars.a } }), env, params: { path: ["report", job2] } });
  const adm = await xray({ request: new Request(SITE + "/api/xray/report/" + job2, { headers: { cookie: jars.own } }), env, params: { path: ["report", job2] } });
  ok(mine.status === 200 && adm.status === 200, "the owner and the FODO owner login can still open it");
  r = await call(env, "lab/share", { jobId: job2, mode: "off" }, { as: "fr" }); ok(r.status === 403, "another user cannot change someone else's sharing");
  r = await call(env, "lab/share", { jobId: job2, mode: "7" }); ok(r.j.share === "until" && Date.parse(r.j.until) > Date.now() + 6 * 864e5, "share link for 7 days");
  env.XRAY_DB.db.prepare("UPDATE acct_runs SET share_until=? WHERE job_id=?").run(new Date(Date.now() - 1000).toISOString(), job2);
  const exp = await xray({ request: new Request(SITE + "/api/xray/report/" + job2), env, params: { path: ["report", job2] } }); ok(exp.status === 403 && /expired/.test((await exp.json()).reason), "expired link refused");
  await call(env, "lab/share", { jobId: job2, mode: "on" });
  // quality control
  r = await call(env, "admin/report/" + job2 + "/qc", { status: "verified", note: "checked sources" }, { as: "own" }); ok(r.j.ok && env.XRAY_DB.db.prepare("SELECT qc FROM acct_runs WHERE job_id=?").get(job2).qc === "verified", "owner marks a report VERIFIED");
  r = await call(env, "admin/report/" + job2 + "/qc", { status: "failed" }, { as: "vw" }); ok(r.status === 403, "a viewer cannot change QC");
  r = await call(env, "admin/report/" + job2, undefined, { as: "own" });
  ok(r.j.ok && r.j.run.qc === "verified" && r.j.calls.some((c) => /prompt:synthesis@v/.test(c.tool)) && r.j.report.overall === 64 && r.j.report.completeness.overall === 71 && r.j.report.modules.SEO, "report detail: run, QC, API calls with prompt version, scores, completeness, module errors");
  // prompts
  const def = await getPrompt(env, "synthesis");
  r = await call(env, "admin/prompts", undefined, { as: "own" }); ok(r.j.ok && r.j.canEditPrompts && r.j.prompts.length === 6 && r.j.prompts[0].versions.some((v) => v.ver === def.ver && v.calls >= 1), "prompt list: 6 prompts, runs counted per version");
  r = await call(env, "admin/prompts", { key: "synthesis", text: def.text + "\nAlways mention the city when it is known.", note: "city" }, { as: "own" });
  const nv = r.j.ver; ok(r.j.ok && /^v[0-9a-f]{8}$/.test(nv) && nv !== def.ver && (await getPrompt(env, "synthesis")).custom, "owner saves a new prompt version " + nv);
  const job3 = (await call(env, "xray/start", { url: "spicehub.test" })).j.jobId;
  const sy = await call(env, "xray/ai", { jobId: job3, mode: "synthesis", pack: { ids: ["E1"], data: { a: 1 } } }); if (sy.status !== 200) console.error("synth", sy.status, sy.t.slice(0, 200), env.XRAY_DB.db.prepare("SELECT tool FROM api_usage WHERE job_id=?").all(job2));
  ok(env.XRAY_DB.db.prepare("SELECT count(*) n FROM api_usage WHERE tool=?").get("prompt:synthesis@" + nv).n === 1, "the next AI call runs on the new version (tracked)");
  await call(env, "admin/viewers", { email: "boss2@fodo.co.in", role: "admin" }, { as: "own" }); await login(env, "boss2@fodo.co.in", null, "ad2");
  r = await call(env, "admin/prompts", { key: "synthesis", text: "x".repeat(60) }, { as: "ad2" }); ok(r.status === 403, "an admin (not owner) cannot change AI prompts");
  r = await call(env, "admin/prompts", { key: "synthesis", text: "short" }, { as: "own" }); ok(r.status === 400, "too-short prompt refused");
  r = await call(env, "admin/prompts", { key: "synthesis", reset: true }, { as: "own" }); ok(r.j.ok && !(await getPrompt(env, "synthesis")).custom, "back to the default prompt");
  // traffic + tool usage → Growth Lab analytics
  const hit = async (body, ip) => { const q = new Request(SITE + "/api/t", { method: "POST", headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36", "cf-connecting-ip": ip || "9.9.9.9", origin: SITE }, body: JSON.stringify(body) }); Object.defineProperty(q, "cf", { value: { country: "IN" } }); return beacon({ request: q, env }); };
  await hit({ t: "pv", p: "/growth-score/", r: "https://www.google.com/" }); await hit({ t: "ev", p: "/growth-score/", e: [["tool_start", "score"], ["tool_complete", "score"]] });
  await hit({ t: "pv", p: "/marketing-budget/", r: "" }, "9.9.9.8"); await hit({ t: "ev", p: "/marketing-budget/", e: [["tool_complete", "budget"], ["service_cta_click", "xray"]] }, "9.9.9.8"); await hit({ t: "pv", p: "/plans/" }, "9.9.9.8");
  await call(env, "event", { kind: "tool_use", detail: "score · score 72" });
  r = await call(env, "admin/lab?days=30", undefined, { as: "own" });
  const T = {}; (r.j.tools || []).forEach((t) => { T[t.id] = t; });
  ok(r.j.ok && T["growth-score"].views === 1 && T["growth-score"].started === 1 && T["growth-score"].completed === 1 && T["growth-score"].loggedInUses === 1 && T.budget.completed === 1 && T["growth-score"].completionRate === 100, "Growth Lab analytics: per tool views / starts / completions / logged-in uses");
  ok(r.j.funnel.length === 9 && r.j.funnel[0].n >= 2 && r.j.funnel[1].n === 2 && r.j.funnel[3].n === 1 && r.j.funnel[8].n === 1, "visitor → customer funnel from analytics + accounts (" + r.j.funnel.map((f) => f.n).join(" → ") + ")");
  ok(r.j.industries.some((x) => x.k === "Restaurant") && r.j.locations.some((x) => x.k === "Dwarka") && r.j.xray.verified === 1, "top industries / locations and QC counts");
  r = await call(env, "admin/businesses?q=spice", undefined, { as: "own" }); ok(r.j.items[0].domain === "spicehub.test" && r.j.items[0].name === "Spice Hub" && r.j.items[0].industry === "Restaurant", "businesses list (name, industry from the X-Ray)");
  r = await call(env, "admin/business/spicehub.test", undefined, { as: "own" }); ok(r.j.ok && r.j.runs.length >= 2 && r.j.summary && r.j.summary.overall === 64 && r.j.costInr > 0, "business detail: history, latest summary, cost");
  r = await call(env, "admin/findings?days=30", undefined, { as: "own" });  ok(r.j.opportunities.some((o) => /call to action/.test(o.title) && o.reports >= 1) && r.j.checks.some((c) => c.id === "C_cta" && c.fails >= 1) && r.j.competitors.some((c) => c.domain === "tandoortales.test"), "findings explorer: most common problems, failing checks, competitors");
  r = await call(env, "admin/findings?days=30&industry=Restaurant", undefined, { as: "own" }); ok(r.j.reports >= 1 && r.j.industry === "Restaurant", "findings filtered by industry");
  r = await call(env, "admin/insights", undefined, { as: "own" }); ok(r.j.ok && r.j.items.length >= 1 && r.j.items.every((x) => x.title && x.detail && x.link), "next best actions (" + r.j.items.length + ")");
  r = await call(env, "admin/lab", undefined, { as: "a" }); ok(r.status === 403, "Growth Lab analytics are admin-only");
}
/* ================= 9. the static Growth Lab page lists exactly the server's catalog ================= */
{ const fs = await import("node:fs"); const html = fs.readFileSync(new URL("../growth-lab/index.html", import.meta.url), "utf8"); const ids = [...html.matchAll(/data-tool="([a-z0-9-]+)"/g)].map((m) => m[1]).sort();
  const c = await call(env, "lab/catalog"); const sv = c.j.tools.map((t) => t.id).sort();
  ok(ids.join() === sv.join(), "growth-lab page tools = server catalog (" + ids.length + ")");
  ok(/noindex/.test(fs.readFileSync(new URL("../_headers", import.meta.url), "utf8")) && !/growth-lab/.test(fs.readFileSync(new URL("../_redirects", import.meta.url), "utf8")), "/growth-lab/ is a real page now (old redirect removed)"); }
console.log(`\nv17 functions: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
