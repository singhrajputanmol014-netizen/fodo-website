/* FODO Growth Lab v17 API: /api/lab/*
 *   GET  catalog                      → every Growth Lab tool: free/pro, price (admin-controlled), data used, what you get, status (public)
 *   GET  actions?domain=              → your action statuses for a site (To do / In progress / Done) · POST actions {domain, key, status, title?}
 *   GET  actions/summary              → progress per site
 *   GET  gsc/status · GET gsc/start (→ Google consent) · GET gsc/callback (Google → FODO) · POST gsc/disconnect
 *   GET  monitor                      → your monitored websites + recent changes + your limit
 *   POST monitor {url, kind: own|competitor, label?} · POST monitor/remove {id} · POST monitor/check {id} · POST monitor/seen
 *   GET  share?jobId= · POST share {jobId, mode: on | off | 7 | 30 | 90}   (v17.1, switch a report's share link off or give it an expiry)
 *   v18 standalone tools: GET tools/me (your bought runs + what your plan includes) · POST tool/start {tool, url}
 *     → reuses your recent full X-Ray of that site (no new research) or opens a fresh scan · GET tool/runs · GET tool/run?id=
 * Everything here is per user: nobody can read another user's actions, Search Console or monitoring. */
import { json, accountsOn, db, sessionUser, billingUser, sameOrigin, activePlan, isUnlimited, logEvent, count, randId, nowIso, sendMail } from "../../_lib/accounts.js";
import { PLANS, PACKS, ORDER } from "../../_lib/plans.js";
import { safeUrl, regDomain, providers } from "../../_lib/xray-core.js";
import { applyConfig, toolOn, current as cfgCurrent } from "../../_lib/config.js";
import { gscOn, gdb, makeState, checkState, authUrl, exchange, seal, unseal, revoke, refresh, listSites } from "../../_lib/gsc.js";
import { mdb, runCheck } from "../../_lib/monitor.js";
import { engines as aiEngines } from "../../_lib/aivis.js";
import { PRODUCTS, LEVELS, toolTier, includedIn, plansIncluding, tdb, toolCredits, spendTool } from "../../_lib/products.js";
import { isOwner } from "../../_lib/accounts.js";

const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const STATUS = ["todo", "doing", "done"];
const redirect = (to) => new Response(null, { status: 302, headers: { location: to, "cache-control": "no-store" } });

export async function onRequest(ctx) {
  const { request, env, params } = ctx, path = [].concat(params.path || []).join("/"), m = request.method, origin = new URL(request.url).origin;
  try {
    await applyConfig(env);
    if (path === "catalog" && m === "GET") return json(catalog(env));
    if (!accountsOn(env)) return json({ ok: false, disabled: true, reason: "Accounts are not switched on yet." }, 503);
    if (m === "POST" && (!sameOrigin(request) || !/json/.test(request.headers.get("content-type") || ""))) return json({ ok: false, reason: "Bad request." }, 403);
    const u = await sessionUser(env, request);
    if (path === "gsc/callback" && m === "GET") return await gscCallback(env, request, u, origin);
    if (!u) return path === "gsc/start" ? redirect("/account/?login=1") : json({ ok: false, login: true, reason: "Please log in." }, 401);
    const b = await billingUser(env, u), body = m === "POST" ? await request.json().catch(() => ({})) : null, q = new URL(request.url).searchParams;
    if (path === "actions" && m === "GET") return await actionsGet(env, u, clean(q.get("domain"), 120));
    if (path === "actions" && m === "POST") return await actionsSet(env, u, body);
    if (path === "actions/summary" && m === "GET") { const r = await (await adb(env)).prepare("SELECT domain, SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done, SUM(CASE WHEN status='doing' THEN 1 ELSE 0 END) AS doing, COUNT(*) AS n, MAX(updated_at) AS t FROM lab_actions WHERE user_id=?1 GROUP BY domain ORDER BY t DESC LIMIT 100").bind(u.id).all(); return json({ ok: true, items: r.results || [] }); }
    if (path === "gsc/status" && m === "GET") return await gscStatus(env, u);
    if (path === "gsc/start" && m === "GET") { if (!gscOn(env) || !toolOn("gsc")) return redirect("/account/?gsc=off#search-console"); return redirect(authUrl(env, origin, await makeState(env, u.id))); }
    if (path === "gsc/disconnect" && m === "POST") { const d = await gdb(env), row = await d.prepare("SELECT refresh_enc FROM lab_gsc WHERE user_id=?1").bind(u.id).first(); if (row) { try { await revoke(env, await unseal(env, row.refresh_enc)); } catch (e) {} await d.prepare("DELETE FROM lab_gsc WHERE user_id=?1").bind(u.id).run(); await logEvent(env, u.id, "gsc_disconnect", ""); } return json({ ok: true, connected: false }); }
    if (path.indexOf("monitor") === 0) return await monitor(env, u, b, m, path, body);
    if (path === "share") return await share(env, u, m === "GET" ? { jobId: q.get("jobId") } : body, m);
    if (path === "tools/me" && m === "GET") return json(Object.assign({ ok: true }, await toolsMe(env, b)));
    if (path === "tool/start" && m === "POST") return await toolStart(env, u, b, body);
    if (path === "tool/runs" && m === "GET") { const r = (await (await tdb(env)).prepare("SELECT id, tool, domain, job_id, source, status, price, reused, created_at, done_at FROM lab_tool_runs WHERE owner_id=?1 ORDER BY created_at DESC LIMIT 100").bind(b.id).all()).results || []; return json({ ok: true, items: r.map((x) => Object.assign(x, { name: PRODUCTS[x.tool] ? PRODUCTS[x.tool].name : x.tool })) }); }
    if (path === "tool/run" && m === "GET") { const r = await (await tdb(env)).prepare("SELECT id, tool, domain, url, job_id, source, status, created_at, done_at FROM lab_tool_runs WHERE id=?1 AND owner_id=?2").bind(clean(q.get("id"), 40), b.id).first(); return r ? json({ ok: true, run: r }) : json({ ok: false, reason: "Tool run not found." }, 404); }
    return json({ ok: false, reason: "Not found." }, 404);
  } catch (e) {
    console.log(JSON.stringify({ svc: "lab", route: path, ok: false, err: String(e && e.message || e).slice(0, 200) }));
    return json({ ok: false, reason: "The Growth Lab service hit an error. Please try again." }, 500);
  }
}

/* ---------- catalog: the Growth Lab tool list (prompt §4–6, §85), honest status: where each tool lives and what it uses ---------- */
const T = (id, cat, name, benefit, uses, gets, where, status, o) => Object.assign({ id, cat, name, benefit, uses, gets, where, status }, o || {});
const CATALOG = [
  T("growth-score", "free", "Growth Score", "Ten questions → a 0–100 self-assessment with your biggest opportunity and risk.", "Your answers only", "Score, biggest opportunity, biggest risk", "growth-score/", "live", { free: true, time: "2 min" }),
  T("roi", "free", "ROI Calculator", "See what a change in traffic or conversion could be worth, live as you type.", "Your numbers only", "Illustrative scenario (not a promise)", "roi-calculator/", "live", { free: true, time: "1 min" }),
  T("competitor-finder", "free", "Competitor Finder", "Find local or brand competitors on a map, with contact details and websites.", "OpenStreetMap / Geoapify map data, Google results", "Competitor list, map, export", "competitor-finder/", "live", { free: true, time: "1 min" }),
  T("budget", "free", "Marketing Budget Planner", "Split a monthly budget across channels for your goal, with the reason, risk, KPI and a test budget for each.", "Your inputs + FODO's planning rules", "Budget split, KPIs, test plan (strategic recommendation, not a forecast)", "marketing-budget/", "live", { free: true, time: "2 min" }),
  T("quiz", "free", "Marketing Quiz", "Ten questions to test your instincts across ads, SEO, brand and conversion.", "—", "Score + explanations", "marketing-quiz/", "live", { free: true, time: "3 min" }),
  T("game", "free", "FODO Challenge", "Four rounds, about two minutes, spot the winner, fix the funnel.", "—", "Score", "fodo-challenge/", "live", { free: true, time: "2 min" }),
  T("business-xray", "diagnose", "Business X-Ray", "Complete evidence-backed growth diagnosis of any website.", "Website crawl + Google Search + PageSpeed + competitors + customer voice + AI answers", "Growth Health score, biggest problem & opportunity, competitors, 30-day plan, evidence", "business-x-ray/", "live", { time: "2–5 min", flagship: true }),
  T("revenue-leak", "diagnose", "Revenue Leak Finder", "Where visitors drop off before they enquire: CTA, contact path, pricing, trust, speed.", "Website crawl + PageSpeed", "Each leak with evidence, potential impact, confidence, effort and the fix", "business-x-ray/?focus=leaks", "live", { inXray: "Revenue leaks (Conversion X-Ray)", time: "2–5 min" }),
  T("conversion-xray", "diagnose", "Conversion X-Ray", "Visitor → Understanding → Trust → Interest → Action, scored from what the pages show.", "Website crawl", "Funnel stage scores with the checks behind them", "business-x-ray/?focus=conversion", "live", { inXray: "Conversion X-Ray", time: "2–5 min" }),
  T("website-health", "diagnose", "Website Health Audit", "Titles, metas, H1s, canonicals, sitemap, robots, broken links, schema, speed and mobile.", "Website crawl + Google PageSpeed (lab + real-user data)", "Every check with pass/warn/fail and the pages affected", "business-x-ray/?focus=website", "live", { inXray: "Website X-Ray", time: "2–5 min" }),
  T("war-room", "compete", "Competitor War Room", "You vs your real competitors on offer, trust, pricing, content, search and contact ease.", "Their websites + Google Search", "Comparison matrix, share of voice, where you win / they win, battle cards (Agency)", "business-x-ray/?focus=competitors", "live", { inXray: "Competitor X-Ray", time: "2–5 min" }),
  T("why-winning", "compete", "Why Are They Winning?", "Pick a competitor: see exactly where they beat you and how to catch them.", "Their website vs yours", "Why they win, then actions for now, 30 days and 90 days", "business-x-ray/?focus=why", "live", { inXray: "Why are they winning?", plan: "growth", time: "2–5 min" }),
  T("change-detector", "compete", "Competitor Change Detector", "Get told when a competitor changes prices, headline, pages or content.", "Daily/weekly snapshots of their homepage + sitemap", "What changed · why it matters · what to do", "account/#monitoring", "live", { monitor: true }),
  T("market-position", "compete", "Market Position Analyzer", "How you show up in your market's searches and where you sound like everyone else.", "Google Search + competitor headlines", "Market position score, white space, positioning gaps", "business-x-ray/?focus=market", "live", { inXray: "Market Position + Offer & Positioning", time: "2–5 min" }),
  T("ai-visibility", "visibility", "AI Visibility Audit", "Do AI assistants name you when buyers ask for a recommendation?", "Open AI models (Workers AI, Groq) + Gemini with Google Search, when connected", "FODO AI Visibility Score, every question, who got named, citations", "business-x-ray/?focus=ai", "live", { inXray: "AI Visibility", time: "2–5 min" }),
  T("search-visibility", "visibility", "Search Visibility Audit", "Where you appear for the searches buyers use, plus your real clicks when Search Console is connected.", "Google Search results + your Google Search Console (optional)", "Quick wins, keyword → page map, CTR opportunities", "business-x-ray/?focus=search", "live", { inXray: "SEO / Search X-Ray", time: "2–5 min" }),
  T("local-visibility", "visibility", "Local Visibility Audit", "Your Google Maps rating and reviews vs local competitors.", "Google Maps results (via Serper) + map listings", "Your listing, rating & reviews vs competitors, local actions", "business-x-ray/?focus=local", "live", { inXray: "Digital Presence → Local visibility", time: "2–5 min" }),
  T("brand-presence", "visibility", "Brand Presence Audit", "Your brand's footprint: own search, listings, social profiles, consistency.", "Google Search + your website", "Missing signals, consistency issues, listing gaps", "business-x-ray/?focus=presence", "live", { inXray: "Digital Presence", time: "2–5 min" }),
  T("offer-strength", "strategy", "Offer Strength Analyzer", "Does your homepage say who it is for, the problem, the outcome and why you?", "Your homepage", "Offer score, what is missing, how to fix it", "business-x-ray/?focus=offer", "live", { inXray: "Offer & Positioning", time: "2–5 min" }),
  T("blueprint30", "strategy", "30-Day Growth Blueprint", "Your verified findings turned into four weeks of work, with a tracker.", "Your X-Ray findings", "Week-by-week tasks with reason, evidence, priority, mark To do / Doing / Done", "business-x-ray/?focus=plan", "live", { inXray: "30-Day Action Plan", time: "2–5 min" }),
  T("roadmap90", "strategy", "90-Day Growth Roadmap", "Foundation → acquisition → optimisation, with KPIs for each month.", "Your X-Ray findings", "Month-by-month tasks, KPIs, dependencies", "business-x-ray/?focus=roadmap", "live", { inXray: "90-Day Roadmap", plan: "growth", time: "2–5 min" }),
  T("growth-score-track", "monitor", "Growth Score history", "Your X-Ray score over time, area by area.", "Your saved X-Rays", "Score trend and what changed between scans", "account/#history", "live", { plan: "starter" }),
  T("competitor-monitoring", "monitor", "Competitor Monitoring", "Keep watching your competitors without opening their sites.", "Scheduled snapshots", "Alerts only when something meaningful changes", "account/#monitoring", "live", { monitor: true }),
  T("visibility-monitoring", "monitor", "Visibility Monitoring", "Watch your own site for downtime, noindex, title and content changes.", "Scheduled snapshots of your homepage + sitemap", "Alerts for problems that cost traffic", "account/#monitoring", "live", { monitor: true }),
  T("monthly-report", "monitor", "Monthly Growth Report", "Last month vs this month: what improved, what declined, what to do next.", "Your X-Rays + monitoring + action tracker", "A one-page monthly report", "account/#monthly", "live", { plan: "starter" }),
];
export function catalog(env) {
  const c = cfgCurrent(), P = providers(env), eng = aiEngines(env, toolOn).map((e) => e.name), xr = c.plans;
  const perXray = ORDER.filter((id) => id !== "free").map((id) => Math.round(xr[id].price / Math.max(1, xr[id].xrays))), cheapest = Math.min.apply(null, perXray.concat(Object.keys(c.packs).map((k) => Math.round(c.packs[k].price / Math.max(1, c.packs[k].xrays)))));
  return { ok: true, plans: c.plans, packs: c.packs, freeXrays: xr.free.xrays, fromPerXray: cheapest, starter: { price: xr.starter.price, xrays: xr.starter.xrays },
    tools: CATALOG.map((t) => { const pr = PRODUCTS[t.id]; return Object.assign({}, t, { on: t.id === "business-xray" ? toolOn("xray") : t.monitor ? toolOn("monitoring") : pr ? pr.on !== false && toolOn("xray") : true, planName: t.plan ? PLANS[t.plan].name : null },
      // v18: every PRO tool has its own page, its own one-run price (admin-controlled) and the plans whose X-Rays already include it
      pr ? { where: "growth-lab/" + t.id + "/", price: pr.price, level: pr.level || 2, levelName: (LEVELS[pr.level] || LEVELS[2]).name, buy: true, time: pr.time, view: pr.view, focus: pr.focus || null, includedIn: plansIncluding(t.id).map((p) => PLANS[p].name) } : {}); }),
    sources: { search: P.searchName || null, places: P.places || (env.SERPER_API_KEY && toolOn("places") ? "Google Maps results via Serper" : null), ai: eng, searchConsole: gscOn(env) && toolOn("gsc"), seoVolumes: !!P.seo } };
}

/* ---------- v18 standalone tools (prompt §4, §7, §47) ---------- */
// what this account can do with each tool right now: owner = free · bought runs · included in the plan's X-Rays
const effTier = (b) => { const p = activePlan(b); return p !== "free" ? p : b.pack_left > 0 ? "starter" : "free"; };
async function toolsMe(env, b) {
  const own = isOwner(b) || !!b.unlimited, tier = effTier(b), cr = own ? {} : await toolCredits(env, b.id), out = {};
  Object.keys(PRODUCTS).forEach((id) => { out[id] = { credits: cr[id] || 0, included: own || includedIn(id, tier), free: own }; });
  return { tier, owner: own, tools: out, xrays: own ? "∞" : (tier === "free" ? b.free_left : (activePlan(b) !== "free" ? b.monthly_left : 0) + b.pack_left) };
}
async function toolStart(env, u, b, body) {
  const id = String((body && body.tool) || ""), P = PRODUCTS[id];
  if (!P) return json({ ok: false, reason: "Unknown tool." }, 400);
  if (P.on === false || !toolOn("xray")) return json({ ok: false, maintenance: true, reason: P.name + " is being updated right now. Please try again in a little while." }, 503);
  const s = safeUrl(String((body && body.url) || "").trim()); if (!s.ok) return json({ ok: false, reason: s.reason || "Enter a valid website address." }, 400);
  const domain = regDomain(s.host), d = await tdb(env), own = isOwner(b) || !!b.unlimited, tier = effTier(b), now = nowIso();
  if (await count(env, "toolstart:" + b.id, 30, 3600)) return json({ ok: false, reason: "Too many tool runs this hour. Please try again later." }, 429);
  // §47: reuse a recent X-Ray of this website (same account, last 30 days) that already holds what the tool needs, no new research
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const prev = ((await d.prepare("SELECT job_id, features, created_at FROM acct_runs WHERE owner_id=?1 AND domain=?2 AND status='COMPLETE' AND created_at >= ?3 ORDER BY created_at DESC LIMIT 10").bind(b.id, domain, since).all()).results || [])
    .filter((r) => { let f = []; try { f = JSON.parse(r.features || "[]"); } catch (e) {} return P.need.every((x) => f.indexOf(x) > -1); })[0];
  const included = own || includedIn(id, tier), rid = "tr_" + randId(16);
  let source = null;
  if (prev && (included || own)) source = own ? "owner" : "included";
  else if (prev && await spendTool(env, b.id, id)) source = "tool";   // a bought run used on an existing X-Ray: no new research needed
  if (prev && source) {
    await d.prepare("INSERT INTO lab_tool_runs (id, user_id, owner_id, tool, domain, url, job_id, source, status, price, reused, created_at, done_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'done',?9,1,?10,?10)").bind(rid, u.id, b.id, id, domain, s.url, prev.job_id, source, source === "tool" ? P.price : 0, now).run();
    await logEvent(env, u.id, "tool_use", id + " · " + domain + " · reused");
    return json({ ok: true, runId: rid, jobId: prev.job_id, reused: true, from: prev.created_at, source });
  }
  // a fresh scan: owner → free; plan that includes the tool → one of the plan's X-Rays (spent at /api/xray/start); otherwise a bought run
  if (own) source = "owner";
  else if (included && (tier === "free" ? b.free_left > 0 : (activePlan(b) !== "free" ? b.monthly_left : 0) + b.pack_left > 0)) source = "xray";
  else if (await spendTool(env, b.id, id)) source = "tool";
  if (!source) return json({ ok: false, buy: true, tool: id, price: P.price, includedIn: plansIncluding(id).map((p) => PLANS[p].name), reason: "Buy one " + P.name + " run (₹" + P.price.toLocaleString("en-IN") + ")" + (plansIncluding(id).length ? ", or pick a plan that includes it (" + plansIncluding(id).map((p) => PLANS[p].name).join(", ") + ")." : ".") }, 402);
  await d.prepare("INSERT INTO lab_tool_runs (id, user_id, owner_id, tool, domain, url, job_id, source, status, price, created_at, done_at) VALUES (?1,?2,?3,?4,?5,?6,NULL,?7,'scan',?8,?9,NULL)").bind(rid, u.id, b.id, id, domain, s.url, source, source === "tool" ? P.price : 0, now).run();
  await logEvent(env, u.id, "tool_use", id + " · " + domain + " · scan (" + source + ")");
  return json({ ok: true, runId: rid, needScan: true, source, tier: source === "tool" ? toolTier(id) : null });
}

/* ---------- action tracker (prompt §100) ---------- */
const ADDL = "CREATE TABLE IF NOT EXISTS lab_actions (user_id TEXT, domain TEXT, akey TEXT, status TEXT, title TEXT, updated_at TEXT, PRIMARY KEY (user_id, domain, akey))";
const amade = new WeakSet();
async function adb(env) { const d = await db(env); if (!amade.has(d)) { await d.prepare(ADDL).run(); amade.add(d); } return d; }
const domOk = (x) => { const s = String(x || "").toLowerCase().replace(/^https?:\/\//, "").split("/")[0]; const r = regDomain(s); return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(r) ? r : ""; };
async function actionsGet(env, u, domain) {
  const dm = domOk(domain); if (!dm) return json({ ok: false, reason: "Which website?" }, 400);
  const r = await (await adb(env)).prepare("SELECT akey AS key, status, title, updated_at FROM lab_actions WHERE user_id=?1 AND domain=?2").bind(u.id, dm).all();
  return json({ ok: true, domain: dm, items: r.results || [] });
}
async function actionsSet(env, u, b) {
  const dm = domOk(b && b.domain), key = String((b && b.key) || "").replace(/[^A-Za-z0-9_:.-]/g, "").slice(0, 60), st = String((b && b.status) || "");
  if (!dm || !key || STATUS.indexOf(st) < 0) return json({ ok: false, reason: "Send domain, key and status (todo, doing or done)." }, 400);
  if (await count(env, "act:" + u.id + ":" + Math.floor(Date.now() / 3600e3), 600, 3700)) return json({ ok: false, reason: "Too many updates, try again later." }, 429);
  await (await adb(env)).prepare("INSERT INTO lab_actions (user_id, domain, akey, status, title, updated_at) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(user_id, domain, akey) DO UPDATE SET status=?4, title=COALESCE(NULLIF(?5,''), title), updated_at=?6").bind(u.id, dm, key, st, clean(b.title, 160), nowIso()).run();
  if (st === "done") await logEvent(env, u.id, "action_update", dm + " · " + key + " done");
  return json({ ok: true, domain: dm, key, status: st });
}

/* ---------- Google Search Console connection ---------- */
async function gscStatus(env, u) {
  if (!gscOn(env) || !toolOn("gsc")) return json({ ok: true, available: false, connected: false });
  const row = await (await gdb(env)).prepare("SELECT sites, email, connected_at, last_used FROM lab_gsc WHERE user_id=?1").bind(u.id).first();
  return json({ ok: true, available: true, connected: !!row, sites: row ? JSON.parse(row.sites || "[]") : [], connectedAt: row ? row.connected_at : null, lastUsed: row ? row.last_used : null });
}
async function gscCallback(env, request, u, origin) {
  const q = new URL(request.url).searchParams;
  if (!u) return redirect("/account/?gsc=login#search-console");
  if (q.get("error")) return redirect("/account/?gsc=denied#search-console");
  if (!(await checkState(env, q.get("state"), u.id))) return redirect("/account/?gsc=expired#search-console");
  try {
    const tk = await exchange(env, String(q.get("code") || "").slice(0, 600), origin);
    if (!tk.refresh_token) return redirect("/account/?gsc=norefresh#search-console");
    if (String(tk.scope || "").indexOf("webmasters") < 0) return redirect("/account/?gsc=scope#search-console");
    let sites = []; try { sites = (await listSites(env, tk.access_token)).map((s) => s.siteUrl); } catch (e) {}
    await (await gdb(env)).prepare("INSERT INTO lab_gsc (user_id, refresh_enc, sites, email, connected_at, last_used) VALUES (?1,?2,?3,?4,?5,NULL) ON CONFLICT(user_id) DO UPDATE SET refresh_enc=?2, sites=?3, email=?4, connected_at=?5").bind(u.id, await seal(env, tk.refresh_token), JSON.stringify(sites).slice(0, 4000), u.email || "", nowIso()).run();
    await logEvent(env, u.id, "gsc_connect", sites.length + " properties");
    return redirect("/account/?gsc=connected#search-console");
  } catch (e) { return redirect("/account/?gsc=error#search-console"); }
}

/* ---------- monitoring ---------- */
const isPaid = (b) => isUnlimited(b) || activePlan(b) !== "free";
const monLimit = (b) => isUnlimited(b) ? 1000 : (PLANS[activePlan(b)] || PLANS.free).monitors || 0;
async function monitor(env, u, b, m, path, body) {
  if (!toolOn("monitoring")) return json({ ok: false, maintenance: true, reason: "Monitoring is paused for maintenance." }, 503);
  const d = await mdb(env), limit = monLimit(b);
  if (path === "monitor" && m === "GET") {
    const t = (await d.prepare("SELECT id, domain, url, kind, label, created_at, last_check, next_check, last_status, checks FROM mon_targets WHERE user_id=?1 ORDER BY kind DESC, created_at").bind(u.id).all()).results || [];
    const ev = (await d.prepare("SELECT id, target_id, domain, t, kind, severity, what, why, todo, seen FROM mon_events WHERE user_id=?1 ORDER BY id DESC LIMIT 100").bind(u.id).all()).results || [];
    return json({ ok: true, targets: t, events: ev, limit, used: t.length, every: isPaid(b) ? "daily" : "weekly", cron: !!env.CRON_KEY });
  }
  if (m !== "POST") return json({ ok: false, reason: "Not found." }, 404);
  if (path === "monitor") {
    const s = safeUrl(body && body.url); if (!s.ok) return json({ ok: false, reason: s.reason }, 400);
    const dm = regDomain(s.host), kind = body.kind === "own" ? "own" : "competitor";
    const n = await d.prepare("SELECT COUNT(*) AS n FROM mon_targets WHERE user_id=?1").bind(u.id).first();
    if ((n ? n.n : 0) >= limit) return json({ ok: false, upgrade: true, reason: "Your plan monitors up to " + limit + " website" + (limit === 1 ? "" : "s") + ". Remove one or pick a bigger plan." }, 402);
    const dup = await d.prepare("SELECT id FROM mon_targets WHERE user_id=?1 AND domain=?2").bind(u.id, dm).first(); if (dup) return json({ ok: false, reason: dm + " is already being monitored." }, 409);
    const id = "m_" + randId(14), url = new URL(s.url).origin + "/";
    await d.prepare("INSERT INTO mon_targets (id, user_id, domain, url, kind, label, created_at, next_check, checks) VALUES (?1,?2,?3,?4,?5,?6,?7,0,0)").bind(id, u.id, dm, url, kind, clean(body.label, 60) || dm, nowIso()).run();
    await logEvent(env, u.id, "monitor_add", dm + " · " + kind);
    const t = await d.prepare("SELECT * FROM mon_targets WHERE id=?1").bind(id).first(), r = await runCheck(env, d, t, isPaid(b), sendMail);   // the baseline right away
    return json({ ok: true, id, domain: dm, first: r });
  }
  const t = body && body.id ? await d.prepare("SELECT * FROM mon_targets WHERE id=?1 AND user_id=?2").bind(String(body.id).slice(0, 40), u.id).first() : null;
  if (path === "monitor/seen") { await d.prepare("UPDATE mon_events SET seen=1 WHERE user_id=?1").bind(u.id).run(); return json({ ok: true }); }
  if (!t) return json({ ok: false, reason: "Not found." }, 404);
  if (path === "monitor/remove") { await d.batch([d.prepare("DELETE FROM mon_targets WHERE id=?1").bind(t.id), d.prepare("DELETE FROM mon_events WHERE target_id=?1").bind(t.id)]); return json({ ok: true }); }
  if (path === "monitor/check") {
    if (await count(env, "monchk:" + t.id + ":" + new Date().toISOString().slice(0, 10), 3, 90000)) return json({ ok: false, reason: "Checked 3 times today already, the next automatic check will run on schedule." }, 429);
    const r = await runCheck(env, d, t, isPaid(b), sendMail); await logEvent(env, u.id, "monitor_check", t.domain + " · " + r.events.length + " change(s)");
    return json({ ok: true, result: r });
  }
  return json({ ok: false, reason: "Not found." }, 404);
}

/* ---------- v17.1 share control ---------- */
async function share(env, u, b, m) {
  const id = String((b && b.jobId) || ""); if (!/^[a-z0-9]{20}$/.test(id)) return json({ ok: false, reason: "Which report?" }, 400);
  const d = await db(env), run = await d.prepare("SELECT user_id, owner_id, share, share_until FROM acct_runs WHERE job_id=?1").bind(id).first();
  if (!run || (run.user_id !== u.id && run.owner_id !== u.id)) return json({ ok: false, reason: "Only the person who ran this X-Ray can change its sharing." }, 403);
  const state = (r) => ({ ok: true, jobId: id, share: r.share === "off" ? "off" : r.share_until ? (Date.parse(r.share_until) < Date.now() ? "expired" : "until") : "on", until: r.share_until || null });
  if (m === "GET") return json(state(run));
  const mode = String(b.mode || ""), days = { "7": 7, "30": 30, "90": 90 }[mode];
  if (mode !== "on" && mode !== "off" && !days) return json({ ok: false, reason: "Choose on, off, 7, 30 or 90 days." }, 400);
  const until = days ? new Date(Date.now() + days * 864e5).toISOString() : null;
  await d.prepare("UPDATE acct_runs SET share=?2, share_until=?3 WHERE job_id=?1").bind(id, mode === "off" ? "off" : "on", until).run();
  await logEvent(env, u.id, mode === "off" ? "share_off" : "share_on", id + (days ? " · " + days + " days" : ""));
  return json(state({ share: mode === "off" ? "off" : "on", share_until: until }));
}
