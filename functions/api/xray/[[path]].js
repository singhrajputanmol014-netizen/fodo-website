/* FODO Business X-Ray: API router.  All routes live under /api/xray/…
 *   GET  /api/xray/health                    → which data sources this site has (never the keys)
 *   POST /api/xray/start      {url, name?, industry?, country?, city?, product?, audience?}  → { jobId, status:"queued", providers, limits }
 *   GET  /api/xray/status/:id                → { status, progress, currentStage, completedModules }
 *   POST /api/xray/progress   {jobId, stage, progress, completedModules, allow?, note?}   (the browser runs the stages and reports real progress)
 *   POST /api/xray/fetch      {jobId, url}   → the page, byte for byte (+ x-xray-meta: status, final URL, redirects, headers). SSRF-safe.
 *   POST /api/xray/search     {jobId, q, country?}  → search results in one normalised shape: Serper (Google) or Brave (cached 7 days)
 *   POST /api/xray/psi        {jobId, url, strategy?} → Google PageSpeed Insights answer (cached 1 day)
 *   POST /api/xray/seo        {jobId, keywords[], location?} → DataForSEO search volume (only when configured)
 *   POST /api/xray/ai         {jobId, mode:"synthesis"|"visibility", pack}  → Workers AI, checked against the evidence IDs it was given
 *   POST /api/xray/report     (header x-job: id, body: report JSON)  → stores the finished report
 *   POST /api/xray/rows       {jobId, kind, rows[]}  → normalised D1 tables (pages, evidence, findings …) when D1 is bound
 *   GET  /api/xray/report/:id → the stored report (shareable link)
 *   POST /api/xray/refund     {jobId}        → gives the X-Ray credit back if the site could not be read at all (accounts on)
 *   POST /api/xray/linkcheck  {jobId, urls[]} → status of outgoing links (Pro+)
 *   POST /api/xray/authority  {jobId, domains[]} → Open PageRank domain authority (Pro+, needs OPR_API_KEY)
 *   POST /api/xray/places     {jobId, q, country?} → v17 local listings (Google Maps results via Serper: rating, reviews, website), cached 7 days
 *   POST /api/xray/gsc        {jobId}        → v17 the user's own Google Search Console data for this site (when connected)
 * v17: every outside call is logged with its (estimated) cost in api_usage (_lib/usage.js); search falls back Serper → Brave.
 * Why the browser does the analysis: Cloudflare's free plan gives a request ~10 ms of CPU, parsing 50 web pages on the
 * server would not fit, the browser has plenty. The server keeps the keys, blocks unsafe addresses, limits and stores. */
import { tdb, toolTier } from "../../_lib/products.js";
import { bgOn, bdb, bgToken, runnerAuth, enqueue, same } from "../../_lib/bg.js";
import { sendMail } from "../../_lib/accounts.js";
import { dedash } from "../../_lib/brain/models.js";
import { json, log, safeUrl, safeFetch, regDomain, retrying, cacheGet, cachePut, jobCreate, jobGet, jobUpdate, reportPut, reportGet, rowsPut,
  hashIp, counter, memCount, providers, rid, UA, STAGES, ROW_TABLES, outbound, normSearch } from "../../_lib/xray-core.js";
import { accountsOn, sessionUser, billingUser, spendCredit, hasCredit, refundCredit, limitsForUser, logEvent, activePlan, db as acctDb, count as acctCount, nowIso } from "../../_lib/accounts.js";
import { PLANS, limitsFor } from "../../_lib/plans.js";
import { logUsage } from "../../_lib/usage.js";
import { applyConfig, toolOn } from "../../_lib/config.js";
import { engines as aiEngines, ask as aiAsk, groqChat } from "../../_lib/aivis.js";
import { gscForJob } from "../../_lib/gsc.js";
import { getPrompt } from "../../_lib/prompts.js";
import { isOwner } from "../../_lib/accounts.js";
/* per-job limits: the plan the X-Ray was paid with (accounts on), else the free defaults */
async function jobLimits(env, job) {
  if (!accountsOn(env)) return LIMITS;
  const r = await (await acctDb(env)).prepare("SELECT tier, features, credit FROM acct_runs WHERE job_id=?1").bind(job.id).first();
  const L = Object.assign({}, LIMITS, limitsFor(r ? r.tier : "free"));
  if (r && r.credit === "owner") L.ownerRun = true;   // owner X-Rays skip the daily search budget
  if (r && r.features) { try { const f = JSON.parse(r.features); if (Array.isArray(f)) { L.features = f; if (f.indexOf("externalLinks") > -1 && !L.LINKCHECK) L.LINKCHECK = 80; } } catch (e) {} }
  return L;
}
const over = (env, job, k, limit) => accountsOn(env) ? counter(env, "job:" + job.id + ":" + k, limit, 4 * 3600) : Promise.resolve(memCount(job.id + ":" + k, limit));

const UA_COMPAT = "Mozilla/5.0 (compatible; FODO-BusinessXRay/1.0; +https://www.fodo.co.in/business-x-ray/)";
const LIMITS = { MAX_PAGES: 50, MAX_DEPTH: 3, REQUEST_TIMEOUT: 15000, MAX_TOTAL_RUNTIME: 180000, MAX_QUERIES: 14, MAX_COMPETITORS: 5, MAX_FETCHES: 140 };
const TEXTY = /^(text\/html|application\/xhtml\+xml|text\/plain|application\/xml|text\/xml|application\/rss\+xml|application\/atom\+xml)/i;
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

export async function onRequest(ctx) {
  const { request, params } = ctx, t0 = Date.now();
  // offline test world only (XRAY_TEST_MODE is never set on the live site): AI answers come from a stand-in server
  const env = ctx.env.XRAY_TEST_MODE === "1" && ctx.env.XRAY_TEST_AI ? Object.assign({}, ctx.env, { AI: { run: (model, inp) => fetch(ctx.env.XRAY_TEST_AI, { method: "POST", body: JSON.stringify(inp) }).then((r) => r.json()) } }) : ctx.env;
  const path = [].concat(params.path || []), route = path[0] || "", method = request.method;
  try {
    await applyConfig(env);
    if (route === "health" && method === "GET") return json({ ok: true, service: "business-x-ray", version: "1.0", background: bgOn(env) && accountsOn(env), providers: Object.assign(providers(env), { aiEngines: aiEngines(env, toolOn).map((e) => e.id), places: providers(env).places || (env.SERPER_API_KEY && toolOn("places") ? "serper-places" : null) }), limits: LIMITS });
    if (route === "start" && method === "POST") return await start(request, env);
    if (route === "status" && method === "GET") return await status(env, path[1]);
    if (route === "report" && method === "GET") { const gate = await shareGate(env, request, String(path[1] || "")); if (gate) return gate;
      const r = await reportGet(env, path[1]); return r ? new Response(r, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, max-age=60" } }) : json({ ok: false, reason: "Report not found or expired." }, 404); }
    if (route === "bg") return await bgRoute(request, env, path[1] || "", path[2] || "", method);
    if (method !== "POST") return json({ ok: false, reason: "Not found." }, 404);
    if (route === "report") return await saveReport(request, env);
    const body = await request.json().catch(() => null); if (!body) return json({ ok: false, reason: "Send JSON." }, 400);
    const job = await jobGet(env, body.jobId); if (!job) return json({ ok: false, reason: "Unknown or expired X-Ray job." }, 404);
    if (job.status === "COMPLETE" && route !== "rows" && route !== "progress") return json({ ok: false, reason: "This X-Ray is finished." }, 410);
    if (Date.now() - Date.parse(job.created_at) > 3 * 3600e3 && route !== "rows") return json({ ok: false, reason: "This X-Ray job has expired, start a new one." }, 410);
    if (route === "progress") return await progress(env, job, body);
    if (route === "fetch") return await fetchPage(env, job, body, t0);
    if (route === "search") return await search(env, job, body, t0);
    if (route === "psi") return await psi(env, job, body, t0);
    if (route === "seo") return await seo(env, job, body, t0);
    if (route === "ai") return await ai(env, job, body, t0);
    if (route === "edge") return await edge(env, job, body, t0);
    if (route === "refund") return await refund(env, job);
    if (route === "linkcheck") return await linkcheck(env, job, body);
    if (route === "authority") return await authority(env, job, body);
    if (route === "places") return await places(env, job, body, t0);
    if (route === "gsc") return await gscRoute(env, job);
    if (route === "rows") { const kind = String(body.kind || ""); if (!ROW_TABLES[kind] || !Array.isArray(body.rows)) return json({ ok: false, reason: "Bad rows." }, 400); const n = await rowsPut(env, job.id, kind, body.rows); return json({ ok: true, stored: n }); }
    return json({ ok: false, reason: "Not found." }, 404);
  } catch (e) {
    log({ route, ok: false, err: String(e && e.message || e).slice(0, 200), ms: Date.now() - t0 });
    return json({ ok: false, reason: "The X-Ray service hit an error. Please try again." }, 500);
  }
}

async function start(request, env) {
  const b = await request.json().catch(() => null); if (!b) return json({ ok: false, reason: "Send JSON." }, 400);
  if (!toolOn("xray")) return json({ ok: false, maintenance: true, reason: "Business X-Ray is being updated right now. Please try again in a little while." }, 503);
  const u = safeUrl(b.url); if (!u.ok) return json({ ok: false, reason: u.reason }, 400);
  const ip = await hashIp(request), hour = Math.floor(Date.now() / 3600e3), day = new Date().toISOString().slice(0, 10);
  let user = null, owner = null, tool = null;
  if (accountsOn(env)) {
    user = await sessionUser(env, request);
    if (!user) return json({ ok: false, login: true, reason: "Log in (it's free) to run a Business X-Ray, your first " + PLANS.free.xrays + " are on us." }, 401);
    owner = await billingUser(env, user);
    const plan = activePlan(owner);
    // v18: a standalone tool's fresh scan, already paid by a bought tool run (or owner); a plan-included one spends an X-Ray below
    if (b.toolRun) {
      tool = await (await tdb(env)).prepare("SELECT * FROM lab_tool_runs WHERE id=?1 AND owner_id=?2").bind(String(b.toolRun).slice(0, 40), owner.id).first();
      if (!tool || tool.status !== "scan" || tool.job_id) return json({ ok: false, reason: "This tool run has already been used. Start it again from the tool's page." }, 409);
      if (regDomain(u.host) !== tool.domain) return json({ ok: false, reason: "This tool run is for " + tool.domain + "." }, 400);
    }
    if ((!tool || tool.source !== "tool") && !hasCredit(owner)) { await logEvent(env, user.id, "limit_hit", regDomain(u.host)); return json({ ok: false, upgrade: true, reason: plan === "free" ? "You have used your " + PLANS.free.xrays + " free X-Rays. Pick a plan or an X-Ray pack to run more." : "No X-Rays left this month. Buy a pack or move to a bigger plan." }, 402); }
    if (await acctCount(env, "xrh:" + owner.id + ":" + hour, PLANS[plan].perHour, 3700)) return json({ ok: false, reason: "You have run the maximum X-Rays for this hour on the " + PLANS[plan].name + " plan. Please try again a little later." }, 429);
  } else if (await counter(env, `xr:rl:${ip}:${hour}`, parseInt(env.XRAY_PER_HOUR || "4", 10), 3700)) return json({ ok: false, reason: "You have run the maximum X-Rays for this hour. Please try again a little later." }, 429);
  if (await counter(env, `xr:day:${day}`, parseInt(env.XRAY_PER_DAY || "60", 10), 90000)) return json({ ok: false, reason: "Today's free X-Rays are used up. Please try again tomorrow." }, 429);
  const input = { url: u.url, name: clean(b.name, 80), industry: clean(b.industry, 80), country: clean(b.country, 40), city: clean(b.city, 80), product: clean(b.product, 120), audience: clean(b.audience, 120) };
  const id = rid(); let limits = LIMITS, credit = null;
  if (owner) {
    credit = tool && tool.source === "tool" ? { tier: toolTier(tool.tool), kind: "tool:" + tool.tool } : await spendCredit(env, owner, id);
    if (!credit) return json({ ok: false, upgrade: true, reason: activePlan(owner) === "free" ? "You have used your " + PLANS.free.xrays + " free X-Rays. Pick a plan or an X-Ray pack to run more." : "No X-Rays left this month. Buy a pack or move to a bigger plan." }, 402);
    limits = Object.assign({}, LIMITS, limitsForUser(credit.tier, owner));
    const client = String(b.client || "").replace(/[^a-z0-9_]/gi, "").slice(0, 20) || null;
    await (await acctDb(env)).prepare("INSERT INTO acct_runs (job_id, user_id, owner_id, domain, url, tier, credit, client_id, status, created_at, features) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'running',?9,?10)")
      .bind(id, user.id, owner.id, regDomain(u.host), u.url, credit.tier, credit.kind, client, nowIso(), JSON.stringify(limits.features)).run();
    await logEvent(env, user.id, "xray_start", regDomain(u.host) + " · " + credit.tier + (tool ? " · tool " + tool.tool : ""));
    if (tool) await (await tdb(env)).prepare("UPDATE lab_tool_runs SET job_id=?2 WHERE id=?1 AND job_id IS NULL").bind(tool.id, id).run();
  }
  const job = await jobCreate(env, { id, url: u.url, domain: regDomain(u.host), input, status: "queued", stage: "DISCOVERY", progress: 0, completed: [], allow: [], ip_hash: ip });
  log({ job: job.id, route: "start", ok: true, domain: job.domain, tier: credit ? credit.tier : "anon" });
  const out = { ok: true, jobId: job.id, status: "queued", providers: providers(env), limits, tier: credit ? credit.tier : null, credit: credit ? credit.kind : null, stages: STAGES };
  // v19: run it in the background (the runner Worker's queue), the visitor can close the tab
  if (b.background && owner && bgOn(env)) {
    const d = await bdb(env), now = nowIso();
    await d.prepare("INSERT INTO xray_bg (job_id, user_id, owner_id, email, payload, status, attempts, enqueued_at) VALUES (?1,?2,?3,?4,?5,'queued',0,?6)").bind(job.id, user.id, owner.id, user.email || "", JSON.stringify(Object.assign({}, out, { input })), now).run();
    if (await enqueue(env, job.id)) { await jobUpdate(env, job, { note: "Queued: FODO's background runner starts it in a moment. You can close this tab." }); await logEvent(env, user.id, "xray_bg", job.domain); return json(Object.assign(out, { background: true })); }
    await d.prepare("DELETE FROM xray_bg WHERE job_id=?1").bind(job.id).run();
    return json(Object.assign(out, { background: false, bgNote: "The background runner did not answer, so this X-Ray runs here in your browser, keep the tab open." }));
  }
  return json(out);
}
/* ---------- v19 background runner API ----------
   GET  bg/job/<id>?t=  → the start payload for the background page (token = HMAC of the job id with RUNNER_KEY)
   POST bg/claim {jobId, executor}  · POST bg/wait {jobId, reason}  · POST bg/done {jobId, ok, error}   (header x-runner-key) */
const BG_MAX_AGE = 150 * 60e3, BG_TRIES = 3;
async function bgFail(env, d, row, why) {
  await d.prepare("UPDATE xray_bg SET status='failed', note=?2, finished_at=?3 WHERE job_id=?1").bind(row.job_id, String(why || "").slice(0, 300), nowIso()).run();
  const run = await (await acctDb(env)).prepare("SELECT * FROM acct_runs WHERE job_id=?1").bind(row.job_id).first();
  let refunded = false; if (run && run.status === "running") refunded = await refundCredit(env, run);
  const job = await jobGet(env, row.job_id); if (job) await jobUpdate(env, job, { status: "FAILED", note: "The background X-Ray could not finish (" + String(why || "unknown").slice(0, 120) + ")." + (refunded ? " Your X-Ray credit was returned." : "") });
  return refunded;
}
/* email "your X-Ray is ready" once, from the report save (fastest) or from the runner's done call, whichever comes first */
async function bgNotify(env, request, jid) {
  const d = await bdb(env); if (!d) return false;
  const row = await d.prepare("SELECT * FROM xray_bg WHERE job_id=?1").bind(jid).first(); if (!row || row.notified || !row.email || !env.RESEND_API_KEY) return false;
  const claim = await d.prepare("UPDATE xray_bg SET notified=1 WHERE job_id=?1 AND notified=0").bind(jid).run(); if (!claim.meta || !claim.meta.changes) return false;
  const job = await jobGet(env, jid), tr = await (await tdb(env)).prepare("SELECT tool FROM lab_tool_runs WHERE job_id=?1").bind(jid).first().catch(() => null);
  const origin = env.SITE_URL ? String(env.SITE_URL).replace(/\/$/, "") : new URL(request.url).origin, link = origin + "/business-x-ray/?r=" + jid + (tr ? "&tool=" + tr.tool : ""), dom = job ? job.domain : "your website";
  try { await sendMail(env, row.email, "Your Business X-Ray of " + dom + " is ready", '<p>Your FODO Business X-Ray of <b>' + dom + '</b> is ready.</p><p><a href="' + link + '">Open the report</a></p><p style="color:#666">It ran in the background, so you could close the tab. It is also in your account.</p>', "Your FODO Business X-Ray of " + dom + " is ready: " + link); return true; }
  catch (e) { await d.prepare("UPDATE xray_bg SET notified=0 WHERE job_id=?1").bind(jid).run(); return false; }
}
async function bgRoute(request, env, action, id, method) {
  if (!bgOn(env) || !accountsOn(env)) return json({ ok: false, reason: "Background X-Rays are not switched on." }, 503);
  const d = await bdb(env);
  if (action === "job" && method === "GET") {
    const t = new URL(request.url).searchParams.get("t"); if (!/^[a-z0-9]{20}$/.test(id) || !same(t, await bgToken(env, id))) return json({ ok: false, reason: "Not allowed." }, 403);
    const row = await d.prepare("SELECT * FROM xray_bg WHERE job_id=?1").bind(id).first(); if (!row || row.status !== "running") return json({ ok: false, reason: "This background X-Ray is not running." }, 409);
    const p = JSON.parse(row.payload || "{}");
    // the last finished X-Ray of the same website (same account) so "what changed since last time" works in the background too
    const job = await jobGet(env, id), prev = job ? await (await acctDb(env)).prepare("SELECT job_id FROM acct_runs WHERE owner_id=?1 AND domain=?2 AND status='COMPLETE' AND job_id != ?3 ORDER BY created_at DESC LIMIT 1").bind(row.owner_id, job.domain, id).first() : null;
    return json(Object.assign(p, { bg: true, compareWith: prev ? prev.job_id : null }));
  }
  if (method !== "POST" || !runnerAuth(env, request)) return json({ ok: false, reason: "Not allowed." }, 403);
  const b = await request.json().catch(() => ({})), jid = String(b.jobId || "");
  if (action === "sweep") {   // cron: runs that died (browser crashed, GitHub job lost) go back on the queue; jobs past their time are refunded
    const stale = new Date(Date.now() - 20 * 60e3).toISOString(), rows = (await d.prepare("SELECT * FROM xray_bg WHERE status='running' AND started_at < ?1 LIMIT 20").bind(stale).all()).results || [], requeue = [];
    for (const r0 of rows) { const j0 = await jobGet(env, r0.job_id);
      if (j0 && j0.status === "COMPLETE") { await d.prepare("UPDATE xray_bg SET status='done', finished_at=?2 WHERE job_id=?1").bind(r0.job_id, nowIso()).run(); continue; }
      if (!j0 || r0.attempts >= BG_TRIES || Date.now() - Date.parse(r0.enqueued_at) > BG_MAX_AGE) { await bgFail(env, d, r0, "the background run stopped"); continue; }
      await d.prepare("UPDATE xray_bg SET status='waiting' WHERE job_id=?1").bind(r0.job_id).run(); requeue.push(r0.job_id); }
    return json({ ok: true, requeue });
  }
  const row = await d.prepare("SELECT * FROM xray_bg WHERE job_id=?1").bind(jid).first(); if (!row) return json({ ok: false, drop: true, reason: "Unknown background job." }, 404);
  const job = await jobGet(env, jid);
  if (action === "claim") {
    if (row.status === "done" || row.status === "failed") return json({ ok: false, drop: true, reason: "Already " + row.status + "." });
    if (!job || Date.now() - Date.parse(row.enqueued_at) > BG_MAX_AGE) { const rf = await bgFail(env, d, row, "it waited too long for a free background browser"); return json({ ok: false, drop: true, refunded: rf }); }
    if (job.status === "COMPLETE") { await d.prepare("UPDATE xray_bg SET status='done', finished_at=?2 WHERE job_id=?1").bind(jid, nowIso()).run(); return json({ ok: false, drop: true, reason: "Already finished." }); }
    if (row.attempts >= BG_TRIES) { const rf = await bgFail(env, d, row, "it failed " + row.attempts + " times"); return json({ ok: false, drop: true, refunded: rf }); }
    await d.prepare("UPDATE xray_bg SET status='running', executor=?2, attempts=attempts+1, started_at=?3, note='' WHERE job_id=?1").bind(jid, String(b.executor || "browser").slice(0, 30), nowIso()).run();
    await jobUpdate(env, job, { note: "Running in the background, you can close this tab." });
    const origin = env.SITE_URL ? String(env.SITE_URL).replace(/\/$/, "") : new URL(request.url).origin;
    return json({ ok: true, runUrl: origin + "/business-x-ray/?bg=" + jid + "&t=" + (await bgToken(env, jid)), attempt: row.attempts + 1, maxMs: 14 * 60e3 });
  }
  if (action === "wait") {
    if (row.status === "done" || row.status === "failed") return json({ ok: true, drop: true });
    if (job && Date.now() - Date.parse(row.enqueued_at) > BG_MAX_AGE) { const rf = await bgFail(env, d, row, "no background browser was free in time"); return json({ ok: true, drop: true, refunded: rf }); }
    await d.prepare("UPDATE xray_bg SET status='waiting', note=?2 WHERE job_id=?1").bind(jid, String(b.reason || "").slice(0, 200)).run();
    if (job) await jobUpdate(env, job, { note: "Waiting for a free background browser, it starts automatically (" + String(b.reason || "busy").slice(0, 80) + "). You can close this tab." });
    return json({ ok: true });
  }
  if (action === "done") {
    if (job && job.status === "COMPLETE") {
      await d.prepare("UPDATE xray_bg SET status='done', finished_at=?2 WHERE job_id=?1").bind(jid, nowIso()).run();
      const mailed = await bgNotify(env, request, jid);
      return json({ ok: true, done: true, mailed });
    }
    if (row.attempts >= BG_TRIES) { const rf = await bgFail(env, d, row, String(b.error || "the report was not saved").slice(0, 160)); return json({ ok: true, failed: true, refunded: rf }); }
    await d.prepare("UPDATE xray_bg SET status='waiting', note=?2 WHERE job_id=?1").bind(jid, String(b.error || "not finished").slice(0, 200)).run();
    if (job) await jobUpdate(env, job, { note: "The background run stopped (" + String(b.error || "unknown").slice(0, 80) + "), trying again automatically." });
    return json({ ok: true, retry: true });
  }
  return json({ ok: false, reason: "Not found." }, 404);
}
async function status(env, id) {
  const j = await jobGet(env, id); if (!j) return json({ ok: false, reason: "Job not found." }, 404);
  return json({ ok: true, jobId: j.id, status: j.status, progress: j.progress | 0, currentStage: j.stage, completedModules: j.completed || [], url: j.url, createdAt: j.created_at, updatedAt: j.updated_at, note: j.note || "" });
}
async function progress(env, job, b) {
  const stage = STAGES.indexOf(b.stage) > -1 ? b.stage : job.stage;
  const done = Array.isArray(b.completedModules) ? b.completedModules.filter((x) => STAGES.indexOf(x) > -1).slice(0, 12) : job.completed;
  const allow = Array.isArray(b.allow) ? b.allow.map((d) => regDomain(String(d).toLowerCase().replace(/^https?:\/\//, "").split("/")[0])).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)).slice(0, 16) : job.allow;
  await jobUpdate(env, job, { stage, status: stage === "COMPLETE" ? "COMPLETE" : "running", progress: Math.max(0, Math.min(100, b.progress | 0)), completed: done, allow, note: clean(b.note, 300) });
  return json({ ok: true });
}

async function fetchPage(env, job, b, t0) {
  const u = safeUrl(b.url); if (!u.ok) return json({ ok: false, reason: u.reason, blocked: true }, 400);
  const dom = regDomain(u.host);
  if (dom !== job.domain && (job.allow || []).indexOf(dom) < 0) return json({ ok: false, reason: "This X-Ray can only read the business's own site and its chosen competitors." }, 403);
  if (await over(env, job, "f", (await jobLimits(env, job)).MAX_FETCHES)) return json({ ok: false, reason: "Page limit for this X-Ray reached." }, 429);
  try {
    const H = { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5", "accept-language": "en-IN,en;q=0.9" };
    let first; try { first = await safeFetch(u.url, { headers: H }, { timeout: LIMITS.REQUEST_TIMEOUT, env }); }
    catch (e) { if (e.name !== "TimeoutError" || !b.slowRetry) throw e;   // slow shared hosting: one more, longer try
      first = await safeFetch(u.url, { headers: Object.assign({}, H, { "user-agent": UA_COMPAT }) }, { timeout: 30000, env }); first.slow = true; }
    let { r, finalUrl, hops } = first, retriedAs = first.slow ? "slow-retry" : "";
    // bot protection often turns away unknown agents (403 / 429 / 503 / Cloudflare 52x). Try once more with a standard
    // "compatible" agent string (still names FODO and links to this tool, like search-engine crawlers do).
    if ([403, 406, 429, 503, 520, 521, 522, 523, 524, 525, 526, 530].indexOf(r.status) > -1) {
      try { r.body && r.body.cancel(); } catch (e) {}
      const r2 = await safeFetch(u.url, { headers: Object.assign({}, H, { "user-agent": UA_COMPAT, "upgrade-insecure-requests": "1" }) }, { timeout: LIMITS.REQUEST_TIMEOUT, env });
      retriedAs = "compatible:" + r.status; ({ r, finalUrl, hops } = r2);
    }
    const ct = r.headers.get("content-type") || "", len = +r.headers.get("content-length") || 0;
    const pick = {}; ["content-type", "content-length", "cache-control", "x-robots-tag", "server", "strict-transport-security", "content-security-policy", "x-frame-options", "last-modified", "content-language", "link", "x-powered-by", "cf-ray", "x-vercel-id", "x-nf-request-id", "x-amz-cf-id", "x-served-by", "x-shopify-stage", "x-wix-request-id", "via", "x-generator"].forEach((k) => { const v = r.headers.get(k); if (v) pick[k] = v.slice(0, 300); });
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
/* v17 search chain: Serper (Google) first, Brave Search as the backup when Serper fails or its credits run out */
function searchChain(env) { const c = []; if (env.SERPER_API_KEY) c.push("serper"); if (env.BRAVE_API_KEY) c.push("brave"); return c; }
async function search(env, job, b, t0) {
  const chain = searchChain(env);
  if (!chain.length) return json({ ok: false, disabled: true, reason: "Search provider not configured." }, 503);
  const q = clean(b.q, 200); if (q.length < 2) return json({ ok: false, reason: "Empty query." }, 400);
  const gl = CC[String(b.country || "").toLowerCase()] || "";
  for (const prov of chain) { const hit = await cacheGet("search", prov + "|" + gl + "|" + q.toLowerCase()); if (hit) { log({ job: job.id, route: "search", provider: prov, cached: true }); await logUsage(env, { provider: prov, endpoint: "search", job: job.id, status: 200, cached: true }); return new Response(hit.body, { headers: { "content-type": "application/json; charset=utf-8", "x-cache": "hit" } }); } }
  const JL = await jobLimits(env, job);
  if (await over(env, job, "s", JL.MAX_QUERIES + 3)) return json({ ok: false, reason: "Search limit for this X-Ray reached." }, 429);
  if (!JL.ownerRun && await counter(env, "xr:search:" + new Date().toISOString().slice(0, 10), parseInt(env.SEARCH_DAILY_CAP || env.BRAVE_DAILY_CAP || "60", 10), 90000)) return json({ ok: false, limited: true, reason: "Today's search budget is used up." }, 429);
  const out = outbound(env); let lastReason = "Search provider did not answer.";
  for (const prov of chain) {
    const t1 = Date.now();
    try {
      const { r, retries } = await retrying(() => prov === "serper"
        ? out("https://google.serper.dev/search", { method: "POST", headers: { "x-api-key": env.SERPER_API_KEY, "content-type": "application/json" }, body: JSON.stringify(Object.assign({ q, num: 10, hl: "en" }, gl ? { gl } : {})), signal: AbortSignal.timeout(15000) })
        : out("https://api.search.brave.com/res/v1/web/search?count=10&search_lang=en&safesearch=moderate&text_decorations=false&result_filter=web,discussions,faq,locations&country=" + (gl ? gl.toUpperCase() : "ALL") + "&q=" + encodeURIComponent(q), { headers: { accept: "application/json", "x-subscription-token": env.BRAVE_API_KEY }, signal: AbortSignal.timeout(12000) }), { tries: chain.length > 1 ? 2 : 3 });
      if (!r.ok) { log({ job: job.id, route: "search", provider: prov, ok: false, status: r.status, retries, ms: Date.now() - t0 }); await logUsage(env, { provider: prov, endpoint: "search", job: job.id, status: r.status, ok: false, ms: Date.now() - t1 }); lastReason = "Search provider answered " + r.status + (r.status === 401 || r.status === 403 ? " (check the API key)" : ""); continue; }
      const body = JSON.stringify(Object.assign({ ok: true }, normSearch(prov, await r.json(), q), prov !== chain[0] ? { fallback: true } : {}));
      log({ job: job.id, route: "search", provider: prov, ok: true, status: r.status, retries, ms: Date.now() - t0, cost_credits: 1 });
      await logUsage(env, { provider: prov, endpoint: "search", job: job.id, status: r.status, ms: Date.now() - t1 });
      await cachePut("search", prov + "|" + gl + "|" + q.toLowerCase(), body, "application/json", 7 * 86400);
      return new Response(body, { headers: { "content-type": "application/json; charset=utf-8", "x-cache": "miss" } });
    } catch (e) { log({ job: job.id, route: "search", provider: prov, ok: false, err: String(e.message), retries: e.retries }); await logUsage(env, { provider: prov, endpoint: "search", job: job.id, status: e.status || 0, ok: false, ms: Date.now() - t1 }); lastReason = "Search provider did not answer."; }
  }
  return json({ ok: false, reason: lastReason }, 502);
}

/* v17 local listings: Google Maps results via Serper's places search, name, address, rating, review count, category, website.
   Rating and review counts belong to Google; FODO shows them with the source and the date, and never stores reviews themselves. */
async function places(env, job, b, t0) {
  if (!env.SERPER_API_KEY || !toolOn("places")) return json({ ok: false, disabled: true, reason: "Local listings provider not configured." }, 503);
  const q = clean(b.q, 160); if (q.length < 3) return json({ ok: false, reason: "Empty query." }, 400);
  const gl = CC[String(b.country || "").toLowerCase()] || "", key = "places|" + gl + "|" + q.toLowerCase();
  const hit = await cacheGet("places", key); if (hit) { await logUsage(env, { provider: "serper_places", endpoint: "places", job: job.id, status: 200, cached: true }); return new Response(hit.body, { headers: { "content-type": "application/json; charset=utf-8", "x-cache": "hit" } }); }
  if (await over(env, job, "pl", 4)) return json({ ok: false, reason: "Local listing limit for this X-Ray reached." }, 429);
  if (!(await jobLimits(env, job)).ownerRun && await counter(env, "xr:search:" + new Date().toISOString().slice(0, 10), parseInt(env.SEARCH_DAILY_CAP || "60", 10), 90000)) return json({ ok: false, limited: true, reason: "Today's search budget is used up." }, 429);
  const t1 = Date.now();
  try {
    const { r } = await retrying(() => outbound(env)("https://google.serper.dev/places", { method: "POST", headers: { "x-api-key": env.SERPER_API_KEY, "content-type": "application/json" }, body: JSON.stringify(Object.assign({ q, hl: "en" }, gl ? { gl } : {})), signal: AbortSignal.timeout(15000) }), { tries: 2 });
    await logUsage(env, { provider: "serper_places", endpoint: "places", job: job.id, status: r.status, ok: r.ok, ms: Date.now() - t1 });
    if (!r.ok) return json({ ok: false, reason: "Local listings provider answered " + r.status }, 502);
    const j = await r.json(), num = (v) => (v == null || v === "" || !isFinite(+v) ? null : +v);
    const items = (j.places || []).slice(0, 20).map((x, i) => ({ pos: x.position || i + 1, name: clean(x.title, 120), address: clean(x.address, 200), rating: num(x.rating), reviews: num(x.ratingCount), category: clean(x.category || (x.types || [])[0], 80),
      phone: clean(x.phoneNumber, 30), website: /^https?:\/\//i.test(x.website || "") ? String(x.website).slice(0, 300) : "", cid: clean(x.cid, 40), lat: num(x.latitude), lng: num(x.longitude),
      mapsUrl: x.cid ? "https://www.google.com/maps?cid=" + encodeURIComponent(String(x.cid)) : "https://www.google.com/maps/search/" + encodeURIComponent(clean(x.title, 120) + " " + clean(x.address, 120)) })).filter((x) => x.name);
    const body = JSON.stringify({ ok: true, provider: "serper-places", providerName: "Google Maps results (via Serper)", q, items, retrievedAt: new Date().toISOString() });
    await cachePut("places", key, body, "application/json", 7 * 86400);
    log({ job: job.id, route: "places", ok: true, n: items.length, ms: Date.now() - t0 });
    return new Response(body, { headers: { "content-type": "application/json; charset=utf-8", "x-cache": "miss" } });
  } catch (e) { await logUsage(env, { provider: "serper_places", endpoint: "places", job: job.id, status: 0, ok: false, ms: Date.now() - t1 }); return json({ ok: false, reason: "Local listings provider did not answer." }, 502); }
}
async function gscRoute(env, job) {
  if (!accountsOn(env) || !toolOn("gsc")) return json({ ok: false, disabled: true, reason: "Search Console connection is not switched on." }, 503);
  const run = await (await acctDb(env)).prepare("SELECT user_id FROM acct_runs WHERE job_id=?1").bind(job.id).first(); if (!run) return json({ ok: false, connected: false, reason: "Log in to use your Search Console data." }, 403);
  if (await over(env, job, "gsc", 2)) return json({ ok: false, reason: "Limit reached." }, 429);
  const t1 = Date.now(), r = await gscForJob(env, run.user_id, job.domain);
  if (r.calls) await logUsage(env, { provider: "gsc", endpoint: "searchAnalytics", job: job.id, user: run.user_id, status: r.ok ? 200 : 0, ok: r.ok !== false, ms: Date.now() - t1, units: r.calls });
  return json(r, r.ok || r.connected === false || r.noProperty ? 200 : 502);
}

async function psi(env, job, b, t0) {
  const u = safeUrl(b.url); if (!u.ok) return json({ ok: false, reason: u.reason }, 400);
  if (regDomain(u.host) !== job.domain && (job.allow || []).indexOf(regDomain(u.host)) < 0) return json({ ok: false, reason: "Not this X-Ray's site." }, 403);
  if (memCount(job.id + ":p", 4)) return json({ ok: false, reason: "PageSpeed limit for this X-Ray reached." }, 429);
  const strategy = b.strategy === "desktop" ? "desktop" : "mobile";
  const api = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=" + encodeURIComponent(u.url) + "&strategy=" + strategy + "&category=PERFORMANCE&category=SEO&category=ACCESSIBILITY&category=BEST_PRACTICES";
  const hit = await cacheGet("psi", api); if (hit) { await logUsage(env, { provider: "pagespeed", endpoint: "runPagespeed", job: job.id, status: 200, cached: true }); return new Response(hit.body, { headers: { "content-type": "application/json; charset=utf-8", "x-cache": "hit" } }); }
  try {
    const { r, retries } = await retrying(() => outbound(env)(api + (env.PAGESPEED_API_KEY ? "&key=" + encodeURIComponent(env.PAGESPEED_API_KEY) : ""), { signal: AbortSignal.timeout(60000) }), { tries: 2, base: 1500 });
    const buf = await r.arrayBuffer();
    log({ job: job.id, route: "psi", provider: "pagespeed", ok: r.ok, status: r.status, retries, ms: Date.now() - t0 });
    await logUsage(env, { provider: "pagespeed", endpoint: "runPagespeed", job: job.id, status: r.status, ok: r.ok, ms: Date.now() - t0 });
    if (!r.ok) return json({ ok: false, reason: "PageSpeed answered " + r.status + (r.status === 429 ? " (daily quota, add PAGESPEED_API_KEY)" : "") }, 502);
    await cachePut("psi", api, buf, "application/json", 86400);
    return new Response(buf, { headers: { "content-type": "application/json; charset=utf-8", "x-cache": "miss" } });
  } catch (e) { log({ job: job.id, route: "psi", provider: "pagespeed", ok: false, err: String(e.message) }); return json({ ok: false, reason: "PageSpeed did not answer in time." }, 502); }
}

/* SEOProvider: DataForSEO Google Ads search volume. NOT tested against a live account, enabled only when its secrets exist. */
async function seo(env, job, b, t0) {
  if (!(env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD)) return json({ ok: false, disabled: true, reason: "SEO data provider not configured." }, 503);
  const kws = (Array.isArray(b.keywords) ? b.keywords : []).map((k) => clean(k, 80).toLowerCase()).filter(Boolean).slice(0, 20);
  if (!kws.length) return json({ ok: false, reason: "No keywords." }, 400);
  if (accountsOn(env) && (await jobLimits(env, job)).features.indexOf("volume") < 0) return json({ ok: false, upgrade: "growth", reason: "Search volume is part of Growth and above." }, 402);
  if (await over(env, job, "seo", 2)) return json({ ok: false, reason: "SEO limit for this X-Ray reached." }, 429);
  const task = [{ keywords: kws, language_code: "en", location_name: clean(b.location, 60) || "India" }];
  try {
    const { r } = await retrying(() => outbound(env)("https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live", { method: "POST", headers: { authorization: "Basic " + btoa(env.DATAFORSEO_LOGIN + ":" + env.DATAFORSEO_PASSWORD), "content-type": "application/json" }, body: JSON.stringify(task), signal: AbortSignal.timeout(30000) }), { tries: 2 });
    const j = await r.json(); const items = (((j.tasks || [])[0] || {}).result || []).map((x) => ({ keyword: x.keyword, volume: x.search_volume, cpc: x.cpc, competition: x.competition, competitionIndex: x.competition_index, trend: (x.monthly_searches || []).slice(0, 12).map((m) => m.search_volume) }));
    log({ job: job.id, route: "seo", provider: "dataforseo", ok: r.ok, ms: Date.now() - t0, cost_usd: j.cost });
    await logUsage(env, { provider: "dataforseo", endpoint: "search_volume", job: job.id, status: r.status, ok: r.ok, ms: Date.now() - t0, cost: j.cost != null ? j.cost : null, units: kws.length });
    return json({ ok: r.ok && !!items.length, provider: "dataforseo", items });
  } catch (e) { return json({ ok: false, reason: "SEO data provider did not answer." }, 502); }
}

/* ---------------- AI orchestrator ---------------- */
/* v17.1: the AI prompts live in _lib/prompts.js (versioned; owners can edit them in the admin dashboard). FORMAT stays fixed in code. */
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
async function runAI(env, messages, max, firstWait, opt) {   // firstWait: ms before giving up on the big model (visibility answers use a shorter wait, then the small model)
  const fails = [];
  for (let i = 0; i < MODELS.length && env.AI; i++) {
    try { const r = await Promise.race([env.AI.run(MODELS[i], { messages, max_tokens: max || 1800, temperature: 0.2 }), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), i ? 20000 : (firstWait || 45000)))]);
      const text = typeof r === "string" ? r : r && (r.response || (r.result && r.result.response)) || ""; if (text) return { text: dedash(typeof text === "string" ? text : JSON.stringify(text)), model: MODELS[i] };
      fails.push(MODELS[i].split("/").pop() + ": empty answer"); }
    catch (e) { fails.push(MODELS[i].split("/").pop() + ": " + String(e && e.message || e).replace(/\s+/g, " ").slice(0, 80)); }
  }
  // v20.2: Workers AI busy / over its daily limit / failing → Groq answers instead (not for the "Workers AI" visibility engine itself)
  if (!(opt && opt.noFallback) && env.GROQ_API_KEY) { try { const g = await groqChat(env, messages, max); g.fallback = true; g.workersAi = fails.join("; "); return g; } catch (e) { fails.push("groq: " + (e.detail || e.message)); } }
  throw Object.assign(new Error("no answer"), { detail: fails.join("; ").slice(0, 150) || "Workers AI not bound" });
}
async function ai(env, job, b, t0) {
  if (!env.AI && !env.GROQ_API_KEY) return json({ ok: false, disabled: true, reason: "AI is not connected." }, 503);
  const mode = b.mode === "visibility" ? "visibility" : "synthesis", pack = b.pack || {};
  if (await over(env, job, "ai:" + mode, mode === "visibility" ? 2 : 3)) return json({ ok: false, reason: "AI limit for this X-Ray reached." }, 429);
  const AIQ = accountsOn(env) ? (await jobLimits(env, job)).AI_QUESTIONS : 4;
  if (mode === "visibility") {
    const qs = (Array.isArray(pack.questions) ? pack.questions : []).map((q) => clean(q, 160)).filter(Boolean).slice(0, AIQ);
    if (!qs.length) return json({ ok: false, reason: "No questions." }, 400);
    // v17: every engine that is connected answers the same questions (Gemini at most 5 per X-Ray, its free tier is small)
    const ENG = aiEngines(env, toolOn), jobs = [], VP = await getPrompt(env, "visibility");
    ENG.forEach((e) => qs.slice(0, e.id === "gemini" ? Math.min(5, AIQ) : AIQ).forEach((q) => jobs.push({ e, q })));
    const answers = [], pool = jobs.slice(); let pi = 0;
    const worker = async () => { while (pi < pool.length) { const it = pool[pi++], t1 = Date.now();
      try { const a = await aiAsk(env, it.e.id, it.q, (m, x) => runAI(env, m, x, 25000, { noFallback: true }), VP.text); answers.push({ q: it.q, engine: it.e.id, engineName: it.e.name, live: it.e.live && a.grounded, answer: a.answer, model: a.model, citations: a.citations || [], searches: a.searches || [], grounded: !!a.grounded, groundingRefused: a.groundingRefused || null });
        await logUsage(env, { provider: it.e.id, endpoint: "aivis", tool: "prompt:visibility@" + VP.ver, job: job.id, status: a.status || 200, ms: Date.now() - t1 }); }
      catch (e) { answers.push({ q: it.q, engine: it.e.id, engineName: it.e.name, answer: "", error: "no answer" }); await logUsage(env, { provider: it.e.id, endpoint: "aivis", tool: e.detail ? ("error · " + e.detail).slice(0, 160) : (e.name === "TimeoutError" || /timeout/i.test(e.message || "") ? "error · timed out" : undefined), job: job.id, status: e.status || 0, ok: false, ms: Date.now() - t1 }); } } };
    await Promise.all([worker(), worker(), worker(), worker()]);
    log({ job: job.id, route: "ai", mode, engines: ENG.map((e) => e.id).join(","), ok: true, ms: Date.now() - t0 });
    return json({ ok: true, mode, engines: ENG, answers });
  }
  const ids = (Array.isArray(pack.ids) ? pack.ids : []).map(String).slice(0, 600);
  const data = JSON.stringify(pack.data || {}); if (data.length > 60000) return json({ ok: false, reason: "Research pack too large." }, 413);
  try {
    const P = await getPrompt(env, "synthesis"), tool = "prompt:synthesis@" + P.ver;
    const t1 = Date.now(), a = await runAI(env, [{ role: "system", content: P.text + "\n\n" + FORMAT }, { role: "user", content: "RESEARCH DATA (JSON):\n" + data }], 1800);
    const parsed = parseObj(a.text); if (!parsed) { log({ job: job.id, route: "ai", ok: false, err: "unparseable" }); await logUsage(env, { provider: "workers-ai", endpoint: "synthesis", tool, job: job.id, status: 422, ok: false, ms: Date.now() - t1, units: 0 }); return json({ ok: false, reason: "The AI answer could not be read." }, 502); }
    const { out, dropped } = checkSynthesis(parsed, ids);
    await logUsage(env, { provider: a.fallback ? "groq" : "workers-ai", endpoint: "synthesis", tool: a.fallback ? (tool + " · Workers AI failed (" + a.workersAi + ")").slice(0, 160) : tool, job: job.id, status: 200, ms: Date.now() - t1, units: dropped.length });   // units = statements dropped for having no evidence (prompt quality)
    log({ job: job.id, route: "ai", mode, provider: "workers-ai", model: a.model, ok: true, dropped: dropped.length, ms: Date.now() - t0 });
    return json({ ok: true, mode, model: a.model, synthesis: out, dropped });
  } catch (e) { log({ job: job.id, route: "ai", ok: false, err: String(e.message) }); await logUsage(env, { provider: "workers-ai", endpoint: "synthesis", tool: ("error · " + (e.detail || e.message)).slice(0, 160), job: job.id, status: 502, ok: false }); return json({ ok: false, reason: "AI did not answer." }, 502); }
}

/* ---------- v14 FODO Edge (Agency + owner logins): AI Fix Pack, battle cards, 90-day roadmap, client pitch.
   Every answer is JSON, checked against what was sent: page URLs, competitor domains and opportunity IDs that were not in the
   research pack are dropped, so the AI cannot invent pages, rivals or findings. Text is drafting help, labelled "AI draft". ---------- */
const EDGE = {
  fixPack: { feature: "fixPack", max: 2200 },
  battleCards: { feature: "battleCards", max: 2200 },
  roadmap90: { feature: "roadmap90", max: 2200 },
  clientPitch: { feature: "clientPitch", max: 1600 },
};
async function edge(env, job, b, t0) {
  const kind = String(b.kind || ""), E = EDGE[kind]; if (!E) return json({ ok: false, reason: "Unknown tool." }, 400);
  if (!accountsOn(env)) return json({ ok: false, upgrade: "agency", reason: "FODO Edge tools need a Growth Lab account." }, 402);
  const L = await jobLimits(env, job); if (L.features.indexOf(E.feature) < 0) return json({ ok: false, upgrade: "agency", reason: "FODO Edge tools are part of the Agency plan." }, 402);
  if (!env.AI && !env.GROQ_API_KEY) return json({ ok: false, disabled: true, reason: "AI is not connected." }, 503);
  if (await over(env, job, "edge:" + kind, 2)) return json({ ok: false, reason: "Limit for this tool reached on this X-Ray." }, 429);
  const pack = b.pack || {}, data = JSON.stringify(pack); if (data.length > 40000) return json({ ok: false, reason: "Research pack too large." }, 413);
  try {
    const P = await getPrompt(env, kind), tool = "prompt:" + kind + "@" + P.ver;
    const t1 = Date.now(), a = await runAI(env, [{ role: "system", content: P.text + "\nAnswer in English. Output one JSON object and nothing else." }, { role: "user", content: "DATA (JSON):\n" + data }], E.max);
    const o = parseObj(a.text); await logUsage(env, { provider: "workers-ai", endpoint: "edge_" + kind, tool, job: job.id, status: o ? 200 : 422, ok: !!o, ms: Date.now() - t1 });
    if (!o) return json({ ok: false, reason: "The AI answer could not be read. Try again." }, 502);
    const out = checkEdge(kind, o, pack);
    log({ job: job.id, route: "edge", kind, ok: true, model: a.model, ms: Date.now() - t0 });
    const ru = await (await acctDb(env)).prepare("SELECT user_id, domain FROM acct_runs WHERE job_id=?1").bind(job.id).first(); if (ru) await logEvent(env, ru.user_id, "edge_" + kind, ru.domain);
    return json({ ok: true, kind, model: a.model, result: out });
  } catch (e) { log({ job: job.id, route: "edge", kind, ok: false, err: String(e.message) }); return json({ ok: false, reason: "AI did not answer. Try again." }, 502); }
}
const cl = (s, n) => clean(typeof s === "string" ? s : "", n), arr = (a, n) => (Array.isArray(a) ? a : []).slice(0, n);
function checkEdge(kind, o, pack) {
  if (kind === "fixPack") { const urls = new Set(arr(pack.pages, 12).map((p) => String(p.url)));
    return { pages: arr(o.pages, 8).filter((p) => p && urls.has(String(p.url))).map((p) => ({ url: String(p.url), title: cl(p.title, 70), meta: cl(p.meta, 170), h1: cl(p.h1, 120) })),
      headlines: arr(o.headlines, 3).map((h) => cl(h, 120)).filter(Boolean), faq: arr(o.faq, 5).map((f) => ({ q: cl(f && f.q, 160), a: cl(f && f.a, 400) })).filter((f) => f.q && f.a), cta: cl(o.cta, 40) }; }
  if (kind === "battleCards") { const doms = new Set(arr(pack.competitors, 12).map((c) => String(c.domain)));
    return { cards: arr(o.cards, 10).filter((c) => c && doms.has(String(c.domain))).map((c) => ({ domain: String(c.domain), theyWinOn: arr(c.theyWinOn, 3).map((x) => cl(x, 160)).filter(Boolean), youWinOn: arr(c.youWinOn, 3).map((x) => cl(x, 160)).filter(Boolean), howToWin: arr(c.howToWin, 3).map((x) => cl(x, 200)).filter(Boolean), talkTrack: cl(c.talkTrack, 500) })) }; }
  const ids = new Set(arr(pack.opportunities, 40).map((x) => String(x.id)));
  if (kind === "roadmap90") return { months: arr(o.months, 3).map((m, mi) => ({ month: mi + 1, goal: cl(m && m.goal, 140), weeks: arr(m && m.weeks, 4).map((w, wi) => ({ week: mi * 4 + wi + 1, focus: cl(w && w.focus, 80), tasks: arr(w && w.tasks, 3).map((t) => cl(t, 180)).filter(Boolean), opportunities: arr(w && w.opportunities, 4).map(String).filter((x) => ids.has(x)), kpi: cl(w && w.kpi, 120) })) })) };
  return { subject: cl(o.subject, 120), email: String(o.email || "").replace(/[<>]/g, "").replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 1800), findings: arr(o.findings, 3).map((f) => ({ text: cl(f && f.text, 220), opportunity: ids.has(String(f && f.opportunity)) ? String(f.opportunity) : null })).filter((f) => f.text),
    proposal: arr(o.proposal, 4).map((p) => ({ phase: cl(p && p.phase, 60), what: cl(p && p.what, 240), outcome: cl(p && p.outcome, 200) })).filter((p) => p.phase) };
}

async function refund(env, job) {
  if (!accountsOn(env)) return json({ ok: false, reason: "Nothing to refund." }, 400);
  const d = await acctDb(env), run = await d.prepare("SELECT * FROM acct_runs WHERE job_id=?1").bind(job.id).first();
  if (!run || run.status !== "running" || Date.now() - Date.parse(run.created_at) > 20 * 60e3) return json({ ok: false, reason: "This X-Ray cannot be refunded." }, 409);
  const f = await d.prepare("SELECT n, exp FROM xray_counters WHERE k=?1").bind("job:" + job.id + ":f").first(), s = await d.prepare("SELECT n FROM xray_counters WHERE k=?1").bind("job:" + job.id + ":s").first();
  if ((f && f.n > 6) || (s && s.n > 1)) return json({ ok: false, reason: "The X-Ray already did its research, so it counts." }, 409);
  const ok = await refundCredit(env, run); log({ job: job.id, route: "refund", ok }); if (ok) await logEvent(env, run.user_id, "xray_refund", run.domain);
  return json({ ok, refunded: ok });
}
async function linkcheck(env, job, b) {
  const L = await jobLimits(env, job); if (accountsOn(env) && !L.LINKCHECK) return json({ ok: false, upgrade: "pro", reason: "Outgoing link checks are part of Pro and above." }, 402);
  const urls = (Array.isArray(b.urls) ? b.urls : []).map(String).filter((x) => safeUrl(x).ok).slice(0, 40);
  if (await over(env, job, "lc", Math.ceil((L.LINKCHECK || 40) / 40))) return json({ ok: false, reason: "Link-check limit for this X-Ray reached." }, 429);
  const out = {}, list = urls.slice(); let i = 0;
  const worker = async () => { while (i < list.length) { const u = list[i++]; try { const { r } = await safeFetch(u, { method: "GET", headers: { "user-agent": UA, accept: "text/html,*/*;q=0.5" } }, { timeout: 8000, env }); out[u] = r.status; try { r.body && r.body.cancel(); } catch (e) {} } catch (e) { out[u] = e.code === "blocked" ? -1 : 0; } } };
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
  return json({ ok: true, status: out });
}
async function authority(env, job, b) {
  const L = await jobLimits(env, job); if (accountsOn(env) && L.features.indexOf("authority") < 0) return json({ ok: false, upgrade: "pro", reason: "Domain authority is part of Pro and above." }, 402);
  if (!env.OPR_API_KEY) return json({ ok: false, disabled: true, reason: "Domain authority provider not configured." }, 503);
  if (await over(env, job, "opr", 2)) return json({ ok: false, reason: "Limit reached." }, 429);
  const doms = (Array.isArray(b.domains) ? b.domains : []).map((x) => regDomain(String(x).toLowerCase())).filter((x) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(x)).slice(0, 20);
  if (!doms.length) return json({ ok: false, reason: "No domains." }, 400);
  try {
    const { r } = await retrying(() => outbound(env)("https://openpagerank.com/api/v1.0/getPageRank?" + doms.map((x) => "domains%5B%5D=" + encodeURIComponent(x)).join("&"), { headers: { "API-OPR": env.OPR_API_KEY }, signal: AbortSignal.timeout(12000) }), { tries: 2 });
    await logUsage(env, { provider: "opr", endpoint: "getPageRank", job: job.id, status: r.status, ok: r.ok, units: doms.length });
    const j = await r.json(), items = (j.response || []).map((x) => ({ domain: x.domain, rank: x.page_rank_decimal == null || x.page_rank_decimal === "" ? null : +x.page_rank_decimal, globalRank: x.rank ? +x.rank : null, found: x.status_code === 200 }));
    return json({ ok: r.ok, provider: "Open PageRank", items });
  } catch (e) { return json({ ok: false, reason: "Authority provider did not answer." }, 502); }
}
async function saveReport(request, env) {
  const id = request.headers.get("x-job") || "", job = await jobGet(env, id); if (!job) return json({ ok: false, reason: "Unknown job." }, 404);
  const len = +request.headers.get("content-length") || 0; if (len > 5e6) return json({ ok: false, reason: "Report too large." }, 413);
  const text = await request.text();
  if (text.length > 5e6 || text.charAt(0) !== "{" || text.indexOf('"jobId":"' + id + '"') < 0) return json({ ok: false, reason: "Not a report for this job." }, 400);
  const ok = await reportPut(env, id, text);
  if (accountsOn(env)) { const m = /"overall":(\d+|null)/.exec(text), dc = /"completeness":\{"overall":(\d+)/.exec(text);
    const du = /"durationMs":(\d+)/.exec(text);
    await (await acctDb(env)).prepare("UPDATE acct_runs SET status='COMPLETE', score=?2, completeness=?3, duration_ms=?4 WHERE job_id=?1").bind(id, m && m[1] !== "null" ? +m[1] : null, dc ? +dc[1] : null, du ? +du[1] : null).run();
    try { await (await tdb(env)).prepare("UPDATE lab_tool_runs SET status='done', done_at=?2 WHERE job_id=?1 AND status='scan'").bind(id, new Date().toISOString()).run(); } catch (e) {}
    if (bgOn(env)) { try { const d0 = await bdb(env), bgr = await d0.prepare("SELECT status FROM xray_bg WHERE job_id=?1").bind(id).first(); if (bgr) { await d0.prepare("UPDATE xray_bg SET status='done', finished_at=?2 WHERE job_id=?1").bind(id, nowIso()).run(); await bgNotify(env, request, id); } } catch (e) {} }
    const ru = await (await acctDb(env)).prepare("SELECT user_id, domain FROM acct_runs WHERE job_id=?1").bind(id).first(); if (ru) await logEvent(env, ru.user_id, "xray_done", ru.domain + (m ? " · score " + m[1] : "")); }
  await jobUpdate(env, job, { status: "COMPLETE", stage: "COMPLETE", progress: 100, completed: STAGES.slice() });
  // v17: one usage row for the whole crawl (pages read through FODO's reader, free, but counted for the health view)
  try { if (env.XRAY_DB) { const f = await env.XRAY_DB.prepare("SELECT n FROM xray_counters WHERE k=?1").bind("job:" + id + ":f").first(); const pg = /"crawl":\{"blocked":(null|\{)/.exec(text); await logUsage(env, { provider: "site", endpoint: "crawl", job: id, status: pg && pg[1] === "null" ? 200 : 403, ok: !!(pg && pg[1] === "null"), units: f ? f.n : 0 }); } } catch (e) {}
  log({ job: id, route: "report", ok, bytes: text.length });
  return json({ ok, url: "/business-x-ray/?r=" + id });
}

/* v17.1 share control (prompt §76): the owner can switch a report's link off or give it an expiry date. While off/expired only the
   person who ran it (or their team owner) and the FODO admin team can open it. */
async function shareGate(env, request, id) {
  if (!accountsOn(env) || !/^[a-z0-9]{20}$/.test(id)) return null;
  const d = await acctDb(env), run = await d.prepare("SELECT user_id, owner_id, share, share_until FROM acct_runs WHERE job_id=?1").bind(id).first();
  if (!run) return null;
  const closed = run.share === "off" || (run.share_until && Date.parse(run.share_until) < Date.now()); if (!closed) return null;
  const u = await sessionUser(env, request);
  if (u && (u.id === run.user_id || u.id === run.owner_id || isOwner(u))) return null;
  if (u && u.email) { const a = await d.prepare("SELECT role FROM acct_admins WHERE email=?1").bind(u.email).first(); if (a) return null; }
  return json({ ok: false, private: true, reason: run.share === "off" ? "The owner has turned off sharing for this report." : "This share link has expired." }, 403);
}
