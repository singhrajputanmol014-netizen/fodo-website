/* FODO Business X-Ray — API router.  All routes live under /api/xray/…
 *   GET  /api/xray/health                    → which data sources this site has (never the keys)
 *   POST /api/xray/start      {url, name?, industry?, country?, city?, product?, audience?}  → { jobId, status:"queued", providers, limits }
 *   GET  /api/xray/status/:id                → { status, progress, currentStage, completedModules }
 *   POST /api/xray/progress   {jobId, stage, progress, completedModules, allow?, note?}   (the browser runs the stages and reports real progress)
 *   POST /api/xray/fetch      {jobId, url}   → the page, byte for byte (+ x-xray-meta: status, final URL, redirects, headers). SSRF-safe.
 *   POST /api/xray/search     {jobId, q, country?}  → search results in one normalised shape — Serper (Google) or Brave (cached 7 days)
 *   POST /api/xray/psi        {jobId, url, strategy?} → Google PageSpeed Insights answer (cached 1 day)
 *   POST /api/xray/seo        {jobId, keywords[], location?} → DataForSEO search volume (only when configured)
 *   POST /api/xray/ai         {jobId, mode:"synthesis"|"visibility", pack}  → Workers AI, checked against the evidence IDs it was given
 *   POST /api/xray/report     (header x-job: id, body: report JSON)  → stores the finished report
 *   POST /api/xray/rows       {jobId, kind, rows[]}  → normalised D1 tables (pages, evidence, findings …) when D1 is bound
 *   GET  /api/xray/report/:id → the stored report (shareable link)
 * Why the browser does the analysis: Cloudflare's free plan gives a request ~10 ms of CPU — parsing 50 web pages on the
 * server would not fit, the browser has plenty. The server keeps the keys, blocks unsafe addresses, limits and stores. */
import { json, log, safeUrl, safeFetch, regDomain, retrying, cacheGet, cachePut, jobCreate, jobGet, jobUpdate, reportPut, reportGet, rowsPut,
  hashIp, counter, memCount, providers, rid, UA, STAGES, ROW_TABLES, outbound, normSearch } from "../../_lib/xray-core.js";

const UA_COMPAT = "Mozilla/5.0 (compatible; FODO-BusinessXRay/1.0; +https://www.fodo.co.in/business-x-ray/)";
const LIMITS = { MAX_PAGES: 50, MAX_DEPTH: 3, REQUEST_TIMEOUT: 15000, MAX_TOTAL_RUNTIME: 180000, MAX_QUERIES: 14, MAX_COMPETITORS: 5, MAX_FETCHES: 140 };
const TEXTY = /^(text\/html|application\/xhtml\+xml|text\/plain|application\/xml|text\/xml|application\/rss\+xml|application\/atom\+xml)/i;
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

export async function onRequest(ctx) {
  const { request, env, params } = ctx, t0 = Date.now();
  const path = [].concat(params.path || []), route = path[0] || "", method = request.method;
  try {
    if (route === "health" && method === "GET") return json({ ok: true, service: "business-x-ray", version: "1.0", providers: providers(env), limits: LIMITS });
    if (route === "start" && method === "POST") return await start(request, env);
    if (route === "status" && method === "GET") return await status(env, path[1]);
    if (route === "report" && method === "GET") { const r = await reportGet(env, path[1]); return r ? new Response(r, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, max-age=60" } }) : json({ ok: false, reason: "Report not found or expired." }, 404); }
    if (method !== "POST") return json({ ok: false, reason: "Not found." }, 404);
    if (route === "report") return await saveReport(request, env);
    const body = await request.json().catch(() => null); if (!body) return json({ ok: false, reason: "Send JSON." }, 400);
    const job = await jobGet(env, body.jobId); if (!job) return json({ ok: false, reason: "Unknown or expired X-Ray job." }, 404);
    if (job.status === "COMPLETE" && route !== "rows" && route !== "progress") return json({ ok: false, reason: "This X-Ray is finished." }, 410);
    if (Date.now() - Date.parse(job.created_at) > 3 * 3600e3 && route !== "rows") return json({ ok: false, reason: "This X-Ray job has expired — start a new one." }, 410);
    if (route === "progress") return await progress(env, job, body);
    if (route === "fetch") return await fetchPage(env, job, body, t0);
    if (route === "search") return await search(env, job, body, t0);
    if (route === "psi") return await psi(env, job, body, t0);
    if (route === "seo") return await seo(env, job, body, t0);
    if (route === "ai") return await ai(env, job, body, t0);
    if (route === "rows") { const kind = String(body.kind || ""); if (!ROW_TABLES[kind] || !Array.isArray(body.rows)) return json({ ok: false, reason: "Bad rows." }, 400); const n = await rowsPut(env, job.id, kind, body.rows); return json({ ok: true, stored: n }); }
    return json({ ok: false, reason: "Not found." }, 404);
  } catch (e) {
    log({ route, ok: false, err: String(e && e.message || e).slice(0, 200), ms: Date.now() - t0 });
    return json({ ok: false, reason: "The X-Ray service hit an error. Please try again." }, 500);
  }
}

async function start(request, env) {
  const b = await request.json().catch(() => null); if (!b) return json({ ok: false, reason: "Send JSON." }, 400);
  const u = safeUrl(b.url); if (!u.ok) return json({ ok: false, reason: u.reason }, 400);
  const ip = await hashIp(request), hour = Math.floor(Date.now() / 3600e3), day = new Date().toISOString().slice(0, 10);
  if (await counter(env, `xr:rl:${ip}:${hour}`, parseInt(env.XRAY_PER_HOUR || "4", 10), 3700)) return json({ ok: false, reason: "You have run the maximum X-Rays for this hour. Please try again a little later." }, 429);
  if (await counter(env, `xr:day:${day}`, parseInt(env.XRAY_PER_DAY || "60", 10), 90000)) return json({ ok: false, reason: "Today's free X-Rays are used up. Please try again tomorrow." }, 429);
  const input = { url: u.url, name: clean(b.name, 80), industry: clean(b.industry, 80), country: clean(b.country, 40), city: clean(b.city, 80), product: clean(b.product, 120), audience: clean(b.audience, 120) };
  const job = await jobCreate(env, { id: rid(), url: u.url, domain: regDomain(u.host), input, status: "queued", stage: "DISCOVERY", progress: 0, completed: [], allow: [], ip_hash: ip });
  log({ job: job.id, route: "start", ok: true, domain: job.domain });
  return json({ ok: true, jobId: job.id, status: "queued", providers: providers(env), limits: LIMITS, stages: STAGES });
}
async function status(env, id) {
  const j = await jobGet(env, id); if (!j) return json({ ok: false, reason: "Job not found." }, 404);
  return json({ ok: true, jobId: j.id, status: j.status, progress: j.progress | 0, currentStage: j.stage, completedModules: j.completed || [], url: j.url, createdAt: j.created_at, updatedAt: j.updated_at, note: j.note || "" });
}
async function progress(env, job, b) {
  const stage = STAGES.indexOf(b.stage) > -1 ? b.stage : job.stage;
  const done = Array.isArray(b.completedModules) ? b.completedModules.filter((x) => STAGES.indexOf(x) > -1).slice(0, 12) : job.completed;
  const allow = Array.isArray(b.allow) ? b.allow.map((d) => regDomain(String(d).toLowerCase().replace(/^https?:\/\//, "").split("/")[0])).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)).slice(0, 10) : job.allow;
  await jobUpdate(env, job, { stage, status: stage === "COMPLETE" ? "COMPLETE" : "running", progress: Math.max(0, Math.min(100, b.progress | 0)), completed: done, allow, note: clean(b.note, 300) });
  return json({ ok: true });
}

async function fetchPage(env, job, b, t0) {
  const u = safeUrl(b.url); if (!u.ok) return json({ ok: false, reason: u.reason, blocked: true }, 400);
  const dom = regDomain(u.host);
  if (dom !== job.domain && (job.allow || []).indexOf(dom) < 0) return json({ ok: false, reason: "This X-Ray can only read the business's own site and its chosen competitors." }, 403);
  if (memCount(job.id + ":f", LIMITS.MAX_FETCHES)) return json({ ok: false, reason: "Page limit for this X-Ray reached." }, 429);
  try {
    const H = { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5", "accept-language": "en-IN,en;q=0.9" };
    let { r, finalUrl, hops } = await safeFetch(u.url, { headers: H }, { timeout: LIMITS.REQUEST_TIMEOUT, env }), retriedAs = "";
    // bot protection often turns away unknown agents (403 / 429 / 503 / Cloudflare 52x). Try once more with a standard
    // "compatible" agent string (still names FODO and links to this tool — like search-engine crawlers do).
    if ([403, 406, 429, 503, 520, 521, 522, 523, 524, 525, 526, 530].indexOf(r.status) > -1) {
      try { r.body && r.body.cancel(); } catch (e) {}
      const r2 = await safeFetch(u.url, { headers: Object.assign({}, H, { "user-agent": UA_COMPAT, "upgrade-insecure-requests": "1" }) }, { timeout: LIMITS.REQUEST_TIMEOUT, env });
      retriedAs = "compatible:" + r.status; ({ r, finalUrl, hops } = r2);
    }
    const ct = r.headers.get("content-type") || "", len = +r.headers.get("content-length") || 0;
    const pick = {}; ["content-type", "content-length", "cache-control", "x-robots-tag", "server", "strict-transport-security", "content-security-policy", "x-frame-options", "last-modified", "content-language", "link"].forEach((k) => { const v = r.headers.get(k); if (v) pick[k] = v.slice(0, 300); });
    const meta = { status: r.status, finalUrl, redirects: hops, headers: pick, ms: Date.now() - t0, contentType: ct, retriedAs };
    log({ job: job.id, route: "fetch", provider: "site", ok: r.ok, status: r.status, ms: meta.ms });
    if (!TEXTY.test(ct) || len > 4e6) { try { r.body && r.body.cancel(); } catch (e) {} return new Response("", { status: 200, headers: { "x-xray-meta": encodeURIComponent(JSON.stringify(Object.assign(meta, { skipped: !TEXTY.test(ct) ? "not a web page" : "too large" }))), "cache-control": "no-store" } }); }
    return new Response(r.body, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "x-xray-meta": encodeURIComponent(JSON.stringify(meta)), "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch (e) {
    log({ job: job.id, route: "fetch", provider: "site", ok: false, err: e.code || e.name, ms: Date.now() - t0 });
    return new Response("", { status: 200, headers: { "x-xray-meta": encodeURIComponent(JSON.stringify({ status: 0, error: e.code === "blocked" ? "blocked: " + e.message : e.name === "TimeoutError" ? "timeout" : "unreachable", redirects: e.hops || [], ms: Date.now() - t0 })), "cache-control": "no-store" } });
  }
}

const CC = { india: "in", in: "in", "united states": "us", usa: "us", us: "us", "united kingdom": "gb", uk: "gb", gb: "gb", uae: "ae", "united arab emirates": "ae", ae: "ae", canada: "ca", ca: "ca", australia: "au", au: "au", singapore: "sg", sg: "sg", germany: "de", de: "de", france: "fr", fr: "fr", "saudi arabia": "sa", sa: "sa", qatar: "qa", qa: "qa", nepal: "np", bangladesh: "bd", "sri lanka": "lk", "new zealand": "nz", "south africa": "za" };
async function search(env, job, b, t0) {
  const P = providers(env), prov = P.search;
  if (!prov) return json({ ok: false, disabled: true, reason: "Search provider not configured." }, 503);
  const q = clean(b.q, 200); if (q.length < 2) return json({ ok: false, reason: "Empty query." }, 400);
  const gl = CC[String(b.country || "").toLowerCase()] || "";
  const ckey = prov + "|" + gl + "|" + q.toLowerCase();
  const hit = await cacheGet("search", ckey); if (hit) { log({ job: job.id, route: "search", provider: prov, cached: true }); return new Response(hit.body, { headers: { "content-type": "application/json; charset=utf-8", "x-cache": "hit" } }); }
  if (memCount(job.id + ":s", LIMITS.MAX_QUERIES + 2)) return json({ ok: false, reason: "Search limit for this X-Ray reached." }, 429);
  if (await counter(env, "xr:search:" + new Date().toISOString().slice(0, 10), parseInt(env.SEARCH_DAILY_CAP || env.BRAVE_DAILY_CAP || "60", 10), 90000)) return json({ ok: false, limited: true, reason: "Today's search budget is used up." }, 429);
  const out = outbound(env);
  try {
    const { r, retries } = await retrying(() => prov === "serper"
      ? out("https://google.serper.dev/search", { method: "POST", headers: { "x-api-key": env.SERPER_API_KEY, "content-type": "application/json" }, body: JSON.stringify(Object.assign({ q, num: 10, hl: "en" }, gl ? { gl } : {})), signal: AbortSignal.timeout(15000) })
      : out("https://api.search.brave.com/res/v1/web/search?count=10&search_lang=en&safesearch=moderate&text_decorations=false&result_filter=web,discussions,faq,locations&country=" + (gl ? gl.toUpperCase() : "ALL") + "&q=" + encodeURIComponent(q), { headers: { accept: "application/json", "x-subscription-token": env.BRAVE_API_KEY }, signal: AbortSignal.timeout(12000) }));
    if (!r.ok) { log({ job: job.id, route: "search", provider: prov, ok: false, status: r.status, retries, ms: Date.now() - t0 }); return json({ ok: false, reason: "Search provider answered " + r.status + (r.status === 401 || r.status === 403 ? " (check the API key)" : "") }, 502); }
    const body = JSON.stringify(Object.assign({ ok: true }, normSearch(prov, await r.json(), q)));
    log({ job: job.id, route: "search", provider: prov, ok: true, status: r.status, retries, ms: Date.now() - t0, cost_credits: 1 });
    await cachePut("search", ckey, body, "application/json", 7 * 86400);
    return new Response(body, { headers: { "content-type": "application/json; charset=utf-8", "x-cache": "miss" } });
  } catch (e) { log({ job: job.id, route: "search", provider: prov, ok: false, err: String(e.message), retries: e.retries }); return json({ ok: false, reason: "Search provider did not answer." }, 502); }
}

async function psi(env, job, b, t0) {
  const u = safeUrl(b.url); if (!u.ok) return json({ ok: false, reason: u.reason }, 400);
  if (regDomain(u.host) !== job.domain && (job.allow || []).indexOf(regDomain(u.host)) < 0) return json({ ok: false, reason: "Not this X-Ray's site." }, 403);
  if (memCount(job.id + ":p", 4)) return json({ ok: false, reason: "PageSpeed limit for this X-Ray reached." }, 429);
  const strategy = b.strategy === "desktop" ? "desktop" : "mobile";
  const api = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=" + encodeURIComponent(u.url) + "&strategy=" + strategy + "&category=PERFORMANCE&category=SEO&category=ACCESSIBILITY&category=BEST_PRACTICES";
  const hit = await cacheGet("psi", api); if (hit) return new Response(hit.body, { headers: { "content-type": "application/json; charset=utf-8", "x-cache": "hit" } });
  try {
    const { r, retries } = await retrying(() => outbound(env)(api + (env.PAGESPEED_API_KEY ? "&key=" + encodeURIComponent(env.PAGESPEED_API_KEY) : ""), { signal: AbortSignal.timeout(60000) }), { tries: 2, base: 1500 });
    const buf = await r.arrayBuffer();
    log({ job: job.id, route: "psi", provider: "pagespeed", ok: r.ok, status: r.status, retries, ms: Date.now() - t0 });
    if (!r.ok) return json({ ok: false, reason: "PageSpeed answered " + r.status + (r.status === 429 ? " (daily quota — add PAGESPEED_API_KEY)" : "") }, 502);
    await cachePut("psi", api, buf, "application/json", 86400);
    return new Response(buf, { headers: { "content-type": "application/json; charset=utf-8", "x-cache": "miss" } });
  } catch (e) { log({ job: job.id, route: "psi", provider: "pagespeed", ok: false, err: String(e.message) }); return json({ ok: false, reason: "PageSpeed did not answer in time." }, 502); }
}

/* SEOProvider: DataForSEO Google Ads search volume. NOT tested against a live account — enabled only when its secrets exist. */
async function seo(env, job, b, t0) {
  if (!(env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD)) return json({ ok: false, disabled: true, reason: "SEO data provider not configured." }, 503);
  const kws = (Array.isArray(b.keywords) ? b.keywords : []).map((k) => clean(k, 80).toLowerCase()).filter(Boolean).slice(0, 20);
  if (!kws.length) return json({ ok: false, reason: "No keywords." }, 400);
  if (memCount(job.id + ":seo", 2)) return json({ ok: false, reason: "SEO limit for this X-Ray reached." }, 429);
  const task = [{ keywords: kws, language_code: "en", location_name: clean(b.location, 60) || "India" }];
  try {
    const { r } = await retrying(() => outbound(env)("https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live", { method: "POST", headers: { authorization: "Basic " + btoa(env.DATAFORSEO_LOGIN + ":" + env.DATAFORSEO_PASSWORD), "content-type": "application/json" }, body: JSON.stringify(task), signal: AbortSignal.timeout(30000) }), { tries: 2 });
    const j = await r.json(); const items = (((j.tasks || [])[0] || {}).result || []).map((x) => ({ keyword: x.keyword, volume: x.search_volume, cpc: x.cpc, competition: x.competition, competitionIndex: x.competition_index, trend: (x.monthly_searches || []).slice(0, 12).map((m) => m.search_volume) }));
    log({ job: job.id, route: "seo", provider: "dataforseo", ok: r.ok, ms: Date.now() - t0, cost_usd: j.cost });
    return json({ ok: r.ok && !!items.length, provider: "dataforseo", items });
  } catch (e) { return json({ ok: false, reason: "SEO data provider did not answer." }, 502); }
}

/* ---------------- AI orchestrator ---------------- */
const SYSTEM = `You are FODO's Business Intelligence Analyst.

You are given verified and partially verified research collected from public websites, APIs and deterministic analysis.

Your job is to diagnose the business.

Never invent evidence.

Separate observed facts from inference.

Every major conclusion must reference the evidence provided.

When evidence is insufficient, explicitly state that it is unknown.

Do not optimize for sounding impressive.

Optimize for being useful, accurate and actionable.

Your job is not to produce a generic marketing report.

Your job is to identify:

1. What the business is doing well.
2. What is holding it back.
3. Why the problem exists.
4. What competitors are doing differently.
5. What customers appear to want.
6. What market opportunities exist.
7. What the business should do first.
8. What should NOT be prioritized.
9. What evidence supports every conclusion.

Rank recommendations by impact, effort, urgency and confidence.

Do not overwhelm the business owner.

Give them the five most important actions first.`;
const FORMAT = `Answer with ONE JSON object only, no prose, in this exact shape:
{"executiveSummary":"3-4 plain sentences","doingWell":[{"text":"...","evidence":["E1"]}],"holdingBack":[{"text":"...","evidence":["E2"]}],"whyProblem":{"text":"...","evidence":["E3"]},
"competitorsDifferent":[{"text":"...","evidence":["E4"]}],"customersWant":[{"text":"...","evidence":["E5"]}],"marketOpportunities":[{"text":"...","evidence":["E6"]}],
"doFirst":["O1","O2","O3","O4","O5"],"notPrioritize":[{"text":"...","why":"..."}],"unknowns":["what could not be determined"]}
Rules: every "evidence" array must use ONLY ids that appear in the data (E… for evidence, O… for opportunities). "doFirst" must use ONLY opportunity ids from the data. If a section has no supporting evidence, return an empty array for it. Never write numbers that are not in the data.`;
function parseObj(t) { t = String(t || ""); const a = t.indexOf("{"), z = t.lastIndexOf("}"); if (a < 0 || z <= a) return null; try { return JSON.parse(t.slice(a, z + 1)); } catch (e) { return null; } }
export function checkSynthesis(s, ids) {
  const ok = new Set(ids || []), dropped = [];
  const items = (arr, key) => (Array.isArray(arr) ? arr : []).slice(0, 6).map((x) => ({ text: clean(x && x.text, 400), evidence: (x && Array.isArray(x.evidence) ? x.evidence : []).map(String).filter((id) => ok.has(id)) }))
    .filter((x) => { if (x.text && x.evidence.length) return true; if (x.text) dropped.push({ section: key, text: x.text }); return false; });
  const why = s && s.whyProblem && typeof s.whyProblem === "object" ? { text: clean(s.whyProblem.text, 500), evidence: (s.whyProblem.evidence || []).map(String).filter((id) => ok.has(id)) } : null;
  return { out: {
    executiveSummary: clean(s && s.executiveSummary, 900),
    doingWell: items(s && s.doingWell, "doingWell"), holdingBack: items(s && s.holdingBack, "holdingBack"), whyProblem: why && why.text && why.evidence.length ? why : null,
    competitorsDifferent: items(s && s.competitorsDifferent, "competitorsDifferent"), customersWant: items(s && s.customersWant, "customersWant"), marketOpportunities: items(s && s.marketOpportunities, "marketOpportunities"),
    doFirst: (s && Array.isArray(s.doFirst) ? s.doFirst : []).map(String).filter((id) => /^O\d+$/.test(id) && ok.has(id)).slice(0, 5),
    notPrioritize: (s && Array.isArray(s.notPrioritize) ? s.notPrioritize : []).slice(0, 4).map((x) => ({ text: clean(x && x.text, 300), why: clean(x && x.why, 300) })).filter((x) => x.text),
    unknowns: (s && Array.isArray(s.unknowns) ? s.unknowns : []).slice(0, 6).map((x) => clean(x, 200)).filter(Boolean),
  }, dropped };
}
const MODELS = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct"];
async function runAI(env, messages, max) {
  let last;
  for (let i = 0; i < MODELS.length; i++) {
    try { const r = await Promise.race([env.AI.run(MODELS[i], { messages, max_tokens: max || 1800, temperature: 0.2 }), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), i ? 20000 : 45000))]);
      const text = typeof r === "string" ? r : r && (r.response || (r.result && r.result.response)) || ""; if (text) return { text: typeof text === "string" ? text : JSON.stringify(text), model: MODELS[i] }; }
    catch (e) { last = e; }
  }
  throw last || new Error("no answer");
}
async function ai(env, job, b, t0) {
  if (!env.AI) return json({ ok: false, disabled: true, reason: "AI is not connected." }, 503);
  const mode = b.mode === "visibility" ? "visibility" : "synthesis", pack = b.pack || {};
  if (memCount(job.id + ":ai:" + mode, mode === "visibility" ? 2 : 3)) return json({ ok: false, reason: "AI limit for this X-Ray reached." }, 429);
  if (mode === "visibility") {
    const qs = (Array.isArray(pack.questions) ? pack.questions : []).map((q) => clean(q, 160)).filter(Boolean).slice(0, 5);
    if (!qs.length) return json({ ok: false, reason: "No questions." }, 400);
    const answers = await Promise.all(qs.map((q) => runAI(env, [{ role: "system", content: "You are a helpful assistant. Answer the user's question directly. When recommending businesses, name specific real businesses and their websites if you know them." }, { role: "user", content: q }], 600)
      .then((a) => ({ q, answer: clean(a.text, 3000), model: a.model }), () => ({ q, answer: "", error: "no answer" }))));
    log({ job: job.id, route: "ai", mode, provider: "workers-ai", ok: true, ms: Date.now() - t0 });
    return json({ ok: true, mode, answers });
  }
  const ids = (Array.isArray(pack.ids) ? pack.ids : []).map(String).slice(0, 600);
  const data = JSON.stringify(pack.data || {}); if (data.length > 60000) return json({ ok: false, reason: "Research pack too large." }, 413);
  try {
    const a = await runAI(env, [{ role: "system", content: SYSTEM + "\n\n" + FORMAT }, { role: "user", content: "RESEARCH DATA (JSON):\n" + data }], 1800);
    const parsed = parseObj(a.text); if (!parsed) { log({ job: job.id, route: "ai", ok: false, err: "unparseable" }); return json({ ok: false, reason: "The AI answer could not be read." }, 502); }
    const { out, dropped } = checkSynthesis(parsed, ids);
    log({ job: job.id, route: "ai", mode, provider: "workers-ai", model: a.model, ok: true, dropped: dropped.length, ms: Date.now() - t0 });
    return json({ ok: true, mode, model: a.model, synthesis: out, dropped });
  } catch (e) { log({ job: job.id, route: "ai", ok: false, err: String(e.message) }); return json({ ok: false, reason: "AI did not answer." }, 502); }
}

async function saveReport(request, env) {
  const id = request.headers.get("x-job") || "", job = await jobGet(env, id); if (!job) return json({ ok: false, reason: "Unknown job." }, 404);
  const len = +request.headers.get("content-length") || 0; if (len > 5e6) return json({ ok: false, reason: "Report too large." }, 413);
  const text = await request.text();
  if (text.length > 5e6 || text.charAt(0) !== "{" || text.indexOf('"jobId":"' + id + '"') < 0) return json({ ok: false, reason: "Not a report for this job." }, 400);
  const ok = await reportPut(env, id, text);
  await jobUpdate(env, job, { status: "COMPLETE", stage: "COMPLETE", progress: 100, completed: STAGES.slice() });
  log({ job: id, route: "report", ok, bytes: text.length });
  return json({ ok, url: "/business-x-ray/?r=" + id });
}
