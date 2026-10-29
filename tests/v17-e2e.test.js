#!/usr/bin/env node
/* v17 Growth Lab intelligence end-to-end — real pages + real Pages Functions (local workerd, D1 + KV), offline stand-ins for
   Serper (search + Google Maps places), PageSpeed, Groq, Gemini (Google Search grounding), Google OAuth + Search Console.
   Covers: Growth Lab home (free vs Pro, live prices), Budget Planner, Search Console connect, an X-Ray with every v17 block
   (data completeness, advantage/threat, funnel, leaks, priority matrix, local, AI score + engines, Search Console, why-winning,
   90-day roadmap, action tracker), private GSC never saved, Excel/PDF content, My Growth Lab (history, actions, monitoring,
   Search Console, monthly report), admin costs/health/settings (price change reaches /plans/), focus links, sample report.
   Env: WRANGLER, NM. Optional WRITE_SAMPLE=1 → writes data/xray-sample.json from the X-Ray of the test site. */
const { chromium } = require("playwright");
const { spawnSync } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");
const BASE = "http://localhost:8788", F = "http://127.0.0.1:9300";
const WRANGLER = process.env.WRANGLER, NM = process.env.NM, XL = require(path.join(NM, "xlsx")), STATE = path.join(os.tmpdir(), "v17-state-" + process.pid);
const SHOTS = process.env.SHOTS || "";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const sh = (cmd, args, env) => spawnSync(cmd, args, { env: Object.assign({}, process.env, env || {}), encoding: "utf8" });
const stop = () => { sh("bash", ["-c", "for p in $(pgrep -f '[p]ages dev . --port 8788|[w]orkerd serve'); do kill $p; done; sleep 1; true"]); };
const envMap = () => { const src = fs.readFileSync(path.join(__dirname, "xray-fixtures/env.sh"), "utf8"); const m = JSON.parse(/MAP='(.*)'\s*$/m.exec(src)[1].replace(/'\$F'/g, F));
  return JSON.stringify(Object.assign(m, { "instagram.com": F + "/_ext404", "facebook.com": F + "/_ext200", "openpagerank.com": F + "/_opr", "api.groq.com": F + "/_groq", "generativelanguage.googleapis.com": F + "/_gemini", "oauth2.googleapis.com": F + "/_gtoken", "api.resend.com": F + "/_resend" })); };
const SECRETS = ["groq_test_KEY", "gem_test_KEY", "gsecret_test", "rt_test", "sk-test-SECRET-123", "opr_test_KEY", "cron_test_KEY_123456789"];
function start() {
  stop(); sh("bash", ["-c", "curl -s --noproxy '*' -m 2 " + F + "/_calls >/dev/null && pkill -f '[x]ray-fixtures/server.js'; sleep 0.5; true"]);
  const r = sh(path.join(__dirname, "xray-fixtures/run-local.sh"), ["100"], { WRANGLER, STATE, MAPX: envMap(),
    EXTRA: "--binding ACCOUNTS_ENABLED=1 --binding OPR_API_KEY=opr_test_KEY --binding XRAY_TEST_AI=" + F + "/_ai --binding GROQ_API_KEY=groq_test_KEY --binding GEMINI_API_KEY=gem_test_KEY --binding GOOGLE_CLIENT_ID=gid.apps.googleusercontent.com --binding GOOGLE_CLIENT_SECRET=gsecret_test --binding CRON_KEY=cron_test_KEY_123456789 --binding FIREBASE_API_KEY=AIza-test --binding FIREBASE_PROJECT_ID=fodo-test --binding FIREBASE_PROVIDERS=email" });
  if (!/READY/.test(r.stdout)) throw new Error("local runtime did not start: " + r.stdout + r.stderr);
}
const bodies = [];
async function newCtx(b, mobile) {
  const ctx = await b.newContext(Object.assign({ acceptDownloads: true, colorScheme: "dark" }, mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 950 } }));
  await ctx.addInitScript(() => { try { localStorage.setItem("fodo-consent", JSON.stringify({ analytics: false, t: Date.now() })); } catch (e) {} });
  await ctx.route("**/api/chat", (r) => r.fulfill({ status: 404, body: "" }));
  await ctx.route(/accounts\.google\.com|gstatic\.com\/firebasejs/, (r) => r.fulfill({ status: 404, body: "" }));
  ctx.on("response", async (res) => { try { if (/localhost:8788\/api\//.test(res.url())) bodies.push(await res.text()); } catch (e) {} });
  return ctx;
}
const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name + ".png") }); } };
const DONE = /X-Ray complete|stopped|could not|cannot be/i;

(async () => {
  start();
  const b = await chromium.launch();
  let ctx = await newCtx(b), p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));

  /* ---------- Growth Lab home ---------- */
  await p.goto(BASE + "/growth-lab/"); await p.waitForFunction(() => /Connected right now/.test((document.getElementById("gl-live") || {}).textContent || ""), null, { timeout: 15000 });
  const free = await p.$$eval("#gl-free .gl-card", (c) => c.map((x) => x.querySelector(".tag").textContent)), pro = await p.$$eval("#gl-pro .gl-card", (c) => c.map((x) => x.querySelector(".tag").textContent));
  ok(free.length === 6 && free.every((t) => t === "FREE") && pro.length === 19 && pro.every((t) => t === "PRO"), "Growth Lab home: 6 FREE tools + 19 PRO tools, badges visible before login");
  const cats = await p.$$eval("#gl-pro .gl-cat .eyebrow", (e) => e.map((x) => x.textContent));
  ok(cats.join(",") === "DIAGNOSE,COMPETE,VISIBILITY,STRATEGY,MONITOR", "five categories: " + cats.join(", "));
  ok(/₹499 for 10/.test(await p.textContent('#gl-pro [data-tool="business-xray"] .gl-price')) && /Search Console|Google Search/.test(await p.textContent("#gl-live")), "prices + connected sources refreshed live from /api/lab/catalog");
  ok(await p.$('#gl-pro a[href$="business-x-ray/?focus=leaks"]') && await p.$('a[href$="business-x-ray/?r=sample"]'), "tool cards deep-link into the X-Ray section; sample report link present");
  await shot(p, "growth-lab");

  /* ---------- Budget Planner ---------- */
  await p.goto(BASE + "/marketing-budget/"); await p.fill("#bp-budget", "50000"); await p.selectOption("#bp-type", "local"); await p.selectOption("#bp-goal", "leads"); await p.click("#bp-form button[type=submit]");
  await p.waitForSelector(".bp-res"); const plan = await p.evaluate(() => window.FODO_BUDGET.plan(50000, "local", "leads", "growing", []));
  ok(plan.rows.reduce((s, r) => s + r.amount, 0) === 50000 && plan.rows.reduce((s, r) => s + r.share, 0) >= 99 && /STRATEGIC RECOMMENDATION/.test(await p.textContent(".bp-res")) && (await p.$$(".bp-res tbody tr")).length === plan.rows.length, "budget split adds up to ₹50,000, every channel has job/why/risk/KPI/test budget, labelled strategic recommendation");
  const small = await p.evaluate(() => window.FODO_BUDGET.plan(8000, "b2b", "leads", "new", []));
  ok(small.rows.length <= 3 && small.notes.some((n) => /Left out for now/.test(n)), "small budget: concentrated into ≤3 channels, the rest explained");
  await shot(p, "budget");

  /* ---------- login (owner) + connect Search Console ---------- */
  await p.goto(BASE + "/business-x-ray/");
  await p.evaluate(() => fetch("/api/account/test-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "singhrajputanmol014@gmail.com" }) }));
  const ck = (await ctx.cookies()).map((c) => c.name + "=" + c.value).join("; ");
  const st = await fetch(BASE + "/api/lab/gsc/start", { headers: { cookie: ck }, redirect: "manual" }), loc = new URL(st.headers.get("location"));
  ok(st.status === 302 && loc.hostname === "accounts.google.com" && loc.searchParams.get("scope") === "https://www.googleapis.com/auth/webmasters.readonly", "Search Console: Google consent screen, read-only scope");
  await p.goto(BASE + "/api/lab/gsc/callback?code=code_ok&state=" + encodeURIComponent(loc.searchParams.get("state")));
  await p.waitForSelector("#search-console-b .cf-status", { timeout: 15000 });
  ok(/account\/\?gsc=connected/.test(p.url()) && /Search Console connected/.test(await p.textContent("#search-console-b")) && /sc-domain:spicehub\.test/.test(await p.textContent("#search-console-b")), "back from Google: connected, properties listed on the account page");

  /* ---------- X-Ray with every v17 block ---------- */
  await p.goto(BASE + "/business-x-ray/?focus=leaks");
  ok(/Revenue Leak Finder<\/b> runs inside the Business X-Ray/.test(await p.innerHTML(".xr-focus")), "?focus=leaks explains it runs inside the X-Ray");
  await p.fill("#xr-url", "spicehub.test"); await p.fill("#xr-city", "Dwarka, New Delhi"); await p.click("#xr-run");
  await p.waitForFunction((re) => new RegExp(re, "i").test(document.getElementById("xr-status").textContent) && !document.querySelector("#xr-status.busy"), DONE.source, { timeout: 240000 });
  const R = await p.evaluate(() => window.FODO_XRAY.report());
  ok(R && R.completeness && R.completeness.overall >= 70 && R.completeness.parts.some((x) => /Search Console/.test(x.name) && x.pct === 100), "data completeness " + (R && R.completeness && R.completeness.overall) + "% with Search Console counted");
  ok(/Data completeness \d+%/.test(await p.textContent(".xr-dc")) && /Data collected/.test(await p.textContent(".xr-dc")), "hero shows data completeness + collection date");
  const big2 = await p.textContent(".xr-big2"); ok(/YOUR STRONGEST ADVANTAGE/.test(big2) && /BIGGEST COMPETITIVE THREAT/.test(big2) && /(tandoortales|curryhouse)\.test/.test(big2), "strongest advantage + biggest competitive threat cards");
  ok((await p.$$(".xr-funnel li")).length === 6 && /Data unavailable — needs your form\/CRM data/.test(await p.textContent(".xr-funnel")), "conversion funnel: 4 scored stages + lead/customer honestly unavailable");
  ok(R.leaks.length > 0 && (await p.$$("#xr-leaks ~ .xr-scroll tbody tr")).length === R.leaks.length && /never states lost revenue/.test(await p.textContent("#xr-s11")), "revenue leaks table (" + R.leaks.length + ") with potential impact, no rupee claims");
  ok((await p.$$(".xr-matrix4 .xr-q4")).length === 4, "priority matrix: 4 quadrants");
  ok(R.local && R.local.me && R.local.me.rating === 4.1 && R.local.medianRating >= 4.3 && R.local.behindOnRating && /4\.1★/.test(await p.textContent("#xr-s12")), "local visibility: your Maps listing 4.1★ vs local median " + (R.local && R.local.medianRating) + "★");
  ok(R.opportunities.some((o) => o.key === "L_weak"), "weaker-reviews opportunity created from the Maps data");
  const vis = R.visibility, engs = (vis.engines || []).map((e) => e.id).sort().join();
  ok(engs === "gemini,groq,workers-ai" && vis.score && vis.score.score >= 0 && /FODO AI Visibility Score/.test(await p.textContent("#xr-s13")) && /not an official score/.test(await p.textContent("#xr-s13")), "AI visibility: 3 engines, FODO AI Visibility Score " + (vis.score && vis.score.score) + " (labelled not official)");
  ok(vis.rows.some((r) => r.engine === "gemini" && r.live && r.citations.some((c) => c.you)) && /Yes — Google Search/.test(await p.textContent("#xr-s13")), "Gemini answers from live Google Search and cites your site");
  const gtxt = await p.textContent(".xr-gsc"); ok(/420/.test(gtxt) && /18,500/.test(gtxt) && /CTR quick wins/.test(gtxt) && /best restaurant dwarka/.test(gtxt) && /Private/.test(gtxt), "Search Console block: real clicks/impressions, CTR quick wins, marked private");
  ok((await p.$$("#xr-whysel option")).length >= 1 && /Why .* wins/.test(await p.textContent(".xr-whyp:not([hidden])")), "why are they winning: per-competitor view");
  if ((await p.$$("#xr-whysel option")).length > 1) { const v = await p.$$eval("#xr-whysel option", (o) => o[1].value); await p.selectOption("#xr-whysel", v); ok(await p.$eval('.xr-whyp[data-d="' + v + '"]', (e) => !e.hidden), "switching competitor shows its panel"); }
  ok(R.plan90 && R.plan90.length === 3 && (await p.$$("#xr-roadmap ~ .xr-plan .panel")).length === 3, "90-day roadmap: foundation / acquisition / optimisation");
  await shot(p, "xray-top");
  if (SHOTS) for (const [sel, n] of [[".xr-big2", "x-advthreat"], [".xr-funnel", "x-funnel"], ["#xr-leaks", "x-leaks"], [".xr-matrix4", "x-matrix"], ["#xr-s12", "x-local"], ["#xr-s13", "x-ai"], [".xr-gsc", "x-gsc"], ["#xr-whyw", "x-why"], ["#xr-roadmap", "x-roadmap"], ["#xr-dcb", "x-completeness"]]) { const e = await p.$(sel); if (e) { await e.scrollIntoViewIfNeeded(); await (sel === "#xr-leaks" || sel === "#xr-roadmap" || sel === "#xr-whyw" || sel === "#xr-dcb" ? p.screenshot({ path: path.join(SHOTS, n + ".png") }) : e.screenshot({ path: path.join(SHOTS, n + ".png") })); } }
  // action tracker
  const key = await p.$eval("#xr-s15 select.xr-act", (s) => s.dataset.akey);
  await p.selectOption("#xr-s15 select.xr-act >> nth=0", "done"); await p.waitForTimeout(800);
  const acts = await p.evaluate(() => fetch("/api/lab/actions?domain=spicehub.test").then((r) => r.json()));
  ok(acts.items.some((a) => a.key === key && a.status === "done"), "action marked Done is saved to the account (" + key + ")");
  // private Search Console data is never saved in the shareable report
  const saved = await p.evaluate((id) => fetch("/api/xray/report/" + id).then((r) => r.text()), R.jobId);
  ok(saved.indexOf('"totals":{"clicks":420') < 0 && saved.indexOf('"completeness":{"overall"') > -1, "shared report keeps data completeness but never the Search Console numbers");
  // exports
  const [dx] = await Promise.all([p.waitForEvent("download"), p.click('.xr-acts [data-x="xlsx"]')]); const xp = path.join(os.tmpdir(), "v17.xlsx"); await dx.saveAs(xp);
  const wb = XL.readFile(xp); ok(["Revenue leaks", "AI visibility", "Data completeness", "Local listings", "90-day roadmap (rules)"].every((n) => wb.SheetNames.indexOf(n) > -1), "Excel has the v17 sheets: " + wb.SheetNames.filter((n) => /leaks|AI|completeness|Local|roadmap/.test(n)).join(", "));
  const [dp] = await Promise.all([p.waitForEvent("download"), p.click('.xr-acts [data-x="pdf"]')]); const pp = path.join(os.tmpdir(), "v17.pdf"); await dp.saveAs(pp);
  const ptxt = sh("pdftotext", [pp, "-"]).stdout || ""; ok(/Data completeness/.test(ptxt) && /Revenue leaks/.test(ptxt) && /FODO AI Visibility Score/.test(ptxt), "PDF includes data completeness, revenue leaks and the AI score");
  if (process.env.WRITE_SAMPLE) { const s = JSON.parse(saved); s.demo = true; s.jobId = "sample"; s.log = []; fs.writeFileSync(path.join(__dirname, "../data/xray-sample.json"), JSON.stringify(s)); console.log("wrote data/xray-sample.json"); }

  /* ---------- v17.1 share control + a second X-Ray (report versions) ---------- */
  await p.waitForSelector("#xr-shsel", { timeout: 15000 }); await p.selectOption("#xr-shsel", "off"); await p.waitForFunction(() => /only you/.test(document.getElementById("xr-shnote").textContent), null, { timeout: 10000 });
  const anonR = await fetch(BASE + "/api/xray/report/" + R.jobId); ok(anonR.status === 403, "share link switched off from the report → strangers get 403");
  await p.selectOption("#xr-shsel", "on"); await p.waitForTimeout(500);
  ok((await fetch(BASE + "/api/xray/report/" + R.jobId)).status === 200, "share link back on");
  await p.goto(BASE + "/business-x-ray/"); await p.fill("#xr-url", "spicehub.test"); await p.fill("#xr-city", "Dwarka, New Delhi"); await p.click("#xr-run");
  await p.waitForFunction((re) => new RegExp(re, "i").test(document.getElementById("xr-status").textContent) && !document.querySelector("#xr-status.busy"), DONE.source, { timeout: 240000 });
  ok(/Want FODO to help implement this/.test(await p.textContent("#xr-s15")), "one 'Talk to FODO' offer after the top actions (not in every section)");

  /* ---------- My Growth Lab (account) ---------- */
  await p.goto(BASE + "/account/#monitoring"); await p.waitForSelector("#mon-f", { timeout: 15000 }); await p.waitForLoadState("networkidle"); await p.waitForTimeout(500);
  ok(/spicehub\.test/.test(await p.textContent("#history-b")) && /1 done/.test(await p.textContent("#actions-b")), "account: score history + action progress");
  await p.fill("#mon-url", "tandoortales.test"); await p.click("#mon-f button");
  await p.waitForFunction(() => /Monitoring started for tandoortales/.test(document.body.textContent), null, { timeout: 20000 }).catch(async () => { console.log("DEBUG monitoring:", (await p.textContent("#monitoring-b")).slice(0, 800)); });
  await p.waitForSelector("[data-monchk]", { timeout: 15000 }); ok(/Monitoring started for tandoortales\.test/.test(await p.textContent("#monitoring-b")) || /tandoortales\.test/.test(await p.textContent("#monitoring-b")), "monitoring: competitor added with a baseline snapshot");
  await p.click("[data-monchk]"); await p.waitForFunction(() => /nothing meaningful changed|change\(s\) found/.test(document.getElementById("mon-st").textContent), null, { timeout: 20000 });
  ok(/nothing meaningful changed/.test(await p.textContent("#mon-st")), "'Check now': unchanged site → no false alarm");
  const tk = await fetch(BASE + "/api/monitor/tick", { method: "POST", headers: { "x-cron-key": "cron_test_KEY_123456789", "content-type": "application/json" }, body: "{}" }).then((r) => r.json());
  ok(tk.ok && tk.remaining === 0, "cron tick endpoint answers (nothing due right after a check)");
  await p.click("#mr-go"); await p.waitForSelector(".ac-mr", { timeout: 20000 });
  ok(/MONTHLY GROWTH REPORT/.test(await p.textContent(".ac-mr")) && /What to do next/.test(await p.textContent(".ac-mr")), "monthly growth report built from saved X-Rays + monitoring + actions");
  const [dm] = await Promise.all([p.waitForEvent("download"), p.click("#mr-pdf")]); ok(/FODO-Monthly-Report-spicehub\.test/.test(dm.suggestedFilename()), "monthly report downloads as PDF");
  await shot(p, "account");
  await p.waitForSelector(".ac-bcard", { timeout: 20000 }); const bc = await p.textContent(".ac-bcard");
  ok(/Growth Health/.test(bc) && /Top problems/.test(bc) && /Recommended next/.test(bc) && /Recent changes/.test(bc), "My businesses: per-website dashboard with score, problems, changes and the recommended next tool");
  ok((await p.$$("#vs-a option")).length === 2, "report versions: Version 1 and Version 2 of spicehub.test");
  await p.click("#vs-go"); await p.waitForSelector("#vs-out .ac-mr", { timeout: 20000 }); ok(/Overall/.test(await p.textContent("#vs-out")) && /Fixed/.test(await p.textContent("#vs-out")), "compare two versions: areas, fixed and new");

  /* ---------- admin: costs, health, settings ---------- */
  await p.goto(BASE + "/admin/#costs"); await p.waitForSelector(".ad-kpi", { timeout: 20000 });
  const ct = await p.textContent("#ad-view"); ok(/API cost/.test(ct) && /System health/.test(ct) && /Profit per plan/.test(ct) && /Cost per report/.test(ct) && /serper/.test(ct), "admin Costs & profit: API cost, system health, profit per plan, cost per report");
  await shot(p, "admin-costs");
  await p.goto(BASE + "/admin/#settings"); await p.waitForSelector('[data-f="plans.starter.price"]', { timeout: 15000 });
  await p.fill('[data-f="plans.starter.price"]', "599"); await p.click("#ad-cfs"); await p.click(".ad-dlg [data-ok]"); await p.waitForTimeout(800);
  await p.goto(BASE + "/plans/"); await p.waitForFunction(() => /₹599/.test(document.getElementById("pl-grid").textContent), null, { timeout: 15000 });
  ok(true, "admin changed Starter to ₹599 → /plans/ shows ₹599");
  await p.goto(BASE + "/admin/#settings"); await p.waitForSelector("#ad-cfr"); await p.click("#ad-cfr"); await p.click(".ad-dlg [data-ok]"); await p.waitForTimeout(600);
  ok((await p.evaluate(() => fetch("/api/lab/catalog").then((r) => r.json()))).starter.price === 499, "reset to defaults");
  await p.goto(BASE + "/admin/#monitoring"); await p.waitForSelector(".ad-kpi"); ok(/tandoortales\.test/.test(await p.textContent("#ad-view")), "admin Monitoring lists customers' monitored sites");

  /* ---------- v17.1 admin: ☰ menu, Growth Lab, Businesses, Findings, Quality → report detail, AI prompts ---------- */
  await p.goto(BASE + "/admin/#overview"); await p.waitForSelector("#ad-menu"); await p.waitForSelector(".ad-nba", { timeout: 15000 });
  ok(/Next best actions/.test(await p.textContent(".ad-nba")), "overview: next best actions panel");
  await p.click("#ad-menu"); await p.waitForSelector(".ad-menu-box");
  const groups = await p.$$eval(".ad-menu-box .ad-gl", (e) => e.map((x) => x.textContent)), mlinks = await p.$$eval(".ad-menu-box a[data-tab]", (e) => e.length);
  ok(groups.join(",") === "Growth Lab,Customers,Website,Money & setup,Quick links" && mlinks === 16, "☰ menu beside dark mode opens every section, grouped (" + mlinks + " sections) + quick links");
  await shot(p, "admin-menu");
  await p.click('.ad-menu-box a[data-tab="lab"]'); await p.waitForFunction(() => /Every Growth Lab tool/.test(document.getElementById("ad-view").textContent), null, { timeout: 20000 });
  const lt = await p.textContent("#ad-view"); ok(/Every Growth Lab tool/.test(lt) && /Visitor → customer funnel/.test(lt) && /Marketing Budget Planner/.test(lt) && /Growth Score/.test(lt), "admin Growth Lab: every tool + full funnel");
  await shot(p, "admin-lab");
  await p.goto(BASE + "/admin/#businesses"); await p.waitForSelector('#ad-bl a[href^="#business/"]', { timeout: 15000 }); await p.click('#ad-bl a[href^="#business/"]'); await p.waitForFunction(() => /X-Ray history/.test(document.getElementById("ad-view").textContent), null, { timeout: 20000 });
  ok(/X-Ray history/.test(await p.textContent("#ad-view")) && /Top problems/.test(await p.textContent("#ad-view")), "admin business page: history, areas, top problems, monitoring");
  await p.goto(BASE + "/admin/#findings"); await p.waitForSelector("#ad-view .ad-card"); ok(/Most common opportunities/.test(await p.textContent("#ad-view")), "admin Findings explorer");
  await p.goto(BASE + "/admin/#report/" + R.jobId); await p.waitForSelector(".ad-qc"); ok(/API calls \(\d+\)/.test(await p.textContent("#ad-view")) && /Data completeness/.test(await p.textContent("#ad-view")), "admin report detail: API calls, data completeness, modules");
  await p.click('.ad-qc [data-qc="verified"]'); await p.fill("#ad-di", "sources checked"); await p.click(".ad-dlg [data-ok]"); await p.waitForFunction(() => /Verified/.test(document.querySelector(".ad-kpis").textContent), null, { timeout: 10000 });
  ok(true, "report marked VERIFIED from the detail page");
  await p.goto(BASE + "/admin/#prompts"); await p.waitForSelector(".ad-prompt"); ok((await p.$$(".ad-prompt")).length === 6 && /Runs \(this version\)/.test(await p.textContent("#ad-view")), "admin AI prompts: 6 prompts with version + usage");
  const ma = await newCtx(b, true), map = await ma.newPage(); await ma.addCookies(await ctx.cookies()); await map.goto(BASE + "/admin/#overview"); await map.waitForSelector(".ad-more", { timeout: 15000 });
  const bottom = await map.$$eval(".ad-nav > a.ad-mob, .ad-nav > .ad-more", (e) => e.filter((x) => getComputedStyle(x).display !== "none").length);
  ok(bottom === 5 && await map.evaluate(() => document.documentElement.scrollWidth <= 391 && innerWidth === 390), "admin on a phone: 4 tabs + More in the bottom bar, no sideways scroll");
  await map.click(".ad-more"); await map.waitForSelector(".ad-menu-box"); ok(await map.isVisible('.ad-menu-box a[data-tab="prompts"]'), "phone: More opens the full menu");
  await shot(map, "admin-mobile-menu"); await ma.close();

  /* ---------- sample report + mobile ---------- */
  if (fs.existsSync(path.join(__dirname, "../data/xray-sample.json"))) {
    await p.goto(BASE + "/business-x-ray/?r=sample"); await p.waitForSelector(".xr-demo", { timeout: 15000 });
    ok(/DEMO REPORT — SAMPLE DATA/.test(await p.textContent(".xr-demo")) && /test website/.test(await p.textContent(".xr-demo")), "sample report is clearly labelled demo data from a test website");
  }
  const m = await newCtx(b, true), mp = await m.newPage(); await mp.goto(BASE + "/growth-lab/"); await mp.waitForTimeout(800);
  ok(await mp.evaluate(() => document.documentElement.scrollWidth <= 391 && innerWidth === 390), "Growth Lab home fits a 390 px phone (no sideways scroll)");
  await mp.goto(BASE + "/marketing-budget/"); await mp.fill("#bp-budget", "30000"); await mp.click("#bp-form button[type=submit]"); await mp.waitForSelector(".bp-res");
  ok(await mp.evaluate(() => document.documentElement.scrollWidth <= 391 && innerWidth === 390), "Budget Planner result fits a phone");
  await shot(mp, "budget-mobile"); await m.close();

  ok(!errs.length, "no page errors" + (errs.length ? ": " + errs.slice(0, 3).join(" | ") : ""));
  const leak = SECRETS.filter((s) => bodies.some((t) => t.indexOf(s) > -1)); ok(!leak.length, "no secret ever reaches the browser (" + bodies.length + " API responses scanned)" + (leak.length ? ": " + leak : ""));
  await b.close(); stop();
  console.log(`\nv17 e2e: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); stop(); process.exit(1); });
