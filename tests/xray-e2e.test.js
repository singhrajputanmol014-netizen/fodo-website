#!/usr/bin/env node
/* Business X-Ray end-to-end: the real page + engine + Cloudflare Pages Functions (local workerd runtime, D1 + KV) against five
   fictional businesses (tests/xray-fixtures/server.js), restaurant, SaaS, e-commerce, agency, dental clinic.
   Also: engine unit checks in the page, real backend progress, API failure → partial report, invalid/unsafe URLs, exports
   (PDF/Excel/CSV/JSON), share link, phone download, rate limit, no secret exposed, existing pages still work.
   Env: WRANGLER (path to wrangler), NM (node_modules with xlsx). Run: node tests/xray-e2e.test.js */
const { chromium, devices } = require("playwright");
const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");
const ROOT = path.join(__dirname, ".."), BASE = "http://localhost:8788", SECRET = "sk-test-SECRET-123";
const WRANGLER = process.env.WRANGLER, NM = process.env.NM, XL = require(path.join(NM, "xlsx"));
const STATE = path.join(os.tmpdir(), "xray-e2e-state-" + process.pid);
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const sh = (cmd, args, env) => spawnSync(cmd, args, { env: Object.assign({}, process.env, env || {}), encoding: "utf8" });
const stop = () => { sh("bash", ["-c", "for p in $(pgrep -f '[p]ages dev . --port 8788|[w]orkerd serve'); do kill $p; done; sleep 1; true"]); };
const start = (perHour) => { stop(); const r = sh(path.join(__dirname, "xray-fixtures/run-local.sh"), [String(perHour || 100)], { WRANGLER, STATE }); if (!/READY/.test(r.stdout)) throw new Error("local runtime did not start: " + r.stdout + r.stderr); };
const bodies = [];   // every response body the browser receives, scanned for the secret

async function newCtx(b, opt) {
  const ctx = await b.newContext(Object.assign({ acceptDownloads: true, viewport: { width: 1440, height: 950 } }, opt || {}));
  await ctx.addInitScript(() => { try { localStorage.setItem("fodo-consent", JSON.stringify({ analytics: false, t: Date.now() })); } catch (e) {} });
  await ctx.route("**/api/chat", (r) => r.fulfill({ status: 404, body: "" }));
  ctx.on("response", async (res) => { try { if (/localhost:8788/.test(res.url())) bodies.push(await res.text()); } catch (e) {} });
  return ctx;
}
async function xray(p, url, extra) {
  await p.goto(BASE + "/business-x-ray/"); await p.waitForTimeout(300);
  await p.fill("#xr-url", url);
  if (extra) { await p.click(".xr-opt summary"); for (const k in extra) await (k === "country" ? p.selectOption("#xr-" + k, extra[k]) : p.fill("#xr-" + k, extra[k])); }
  await p.click("#xr-run");
  await p.waitForFunction(() => /X-Ray complete|stopped|maximum|not a valid|private|Only http|could not|cannot be|did not let/i.test(document.getElementById("xr-status").textContent) && !document.querySelector("#xr-status.busy"), null, { timeout: 180000 });
  return { status: await p.textContent("#xr-status"), r: await p.evaluate(() => window.FODO_XRAY.report()) };
}
const integrity = (tag, r) => {
  const ids = new Set(r.evidence.map((e) => e.id));
  ok(r.opportunities.every((o) => o.evidence.every((id) => ids.has(id))) && r.checks.every((c) => c.evidence.every((id) => ids.has(id))), `${tag}: every evidence link points to a real evidence item (${r.evidence.length} items)`);
  ok(r.evidence.every((e) => ["OBSERVED", "INFERRED", "ESTIMATED", "UNKNOWN"].indexOf(e.label) > -1 && e.sourceName && e.retrievedAt), `${tag}: every evidence item has a label, a source and a time`);
  const A = r.scores.areas; ok(Object.keys(A).length === 6 && Object.values(A).every((a) => a.score === null || (a.score >= 0 && a.score <= 100 && a.components.length > 0)), `${tag}: 6 area scores, each 0–100 with its parts, or null (Data unavailable)`);
  ok(r.opportunities.every((o) => o.priorityScore === Math.min(100, Math.round(100 * (o.impact * o.confidence * o.urgency / o.effort) / 25))), `${tag}: every priority score = impact × confidence × urgency ÷ effort (normalised)`);
  ok(r.top.immediate.length <= 3 && r.top.growth.length <= 5 && r.top.strategic.length <= 5 && r.plan.length === 4 && r.plan.every((w) => w.items.every((i) => i.opportunity && i.problem && i.action)), `${tag}: top 3 / 5 / 5 + 4-week plan, every action tied to a problem`);
  ok(r.keywords.every((k) => k.volume === null) && !r.volumes, `${tag}: no search volume invented (no SEO provider)`);
  ok(JSON.stringify(r).indexOf("NaN") < 0 && JSON.stringify(r).indexOf("undefined") < 0, `${tag}: no NaN / undefined anywhere in the report`);
};

(async () => {
  start(100);
  const b = await chromium.launch();
  let ctx = await newCtx(b), p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));

  /* ---------- engine unit checks (in the real page) ---------- */
  await p.goto(BASE + "/business-x-ray/"); await p.waitForTimeout(300);
  const u = await p.evaluate(() => { const E = window.FODO_XRAY_ENGINE, R = E.parseRobots("User-agent: *\nDisallow: /admin\nAllow: /admin/public\nDisallow: /*.pdf$\n\nUser-agent: fodo-businessxray\nDisallow: /secret\nSitemap: https://x.test/s.xml");
    const ev = new E.Evidence();
    const opp = E.opportunities([{ id: "C_cta", area: "conversion", status: "fail", score: 10, weight: 3, detail: "d", evidence: [ev.add({ claim: "c" })], pages: [], label: "INFERRED" }], [], ev)[0];
    const s1 = E.scores([{ area: "website", group: "g", status: "pass", score: 90, weight: 2 }, { area: "website", group: "g", status: "fail", score: 10, weight: 1 }], {}), s2 = E.scores([{ area: "website", group: "g", status: "pass", score: 90, weight: 2 }, { area: "website", group: "g", status: "pass", score: 70, weight: 1 }], {});
    const kw = E.keywordOpps([{ q: "dentist bengaluru", kind: "category", intent: "LOCAL", ok: true, ourPos: null, competitors: [{ pos: 1 }, { pos: 2 }], evidence: [] }], "best dentist in bengaluru clinic", null);
    const kwv = E.keywordOpps([{ q: "dentist bengaluru", kind: "category", intent: "LOCAL", ok: true, ourPos: null, competitors: [{ pos: 1 }], evidence: [] }], "dentist bengaluru", [{ keyword: "dentist bengaluru", volume: 1900 }]);
    return { robots: [E.robotsAllowed(R, "https://x.test/admin/a"), E.robotsAllowed(R, "https://x.test/admin/public/x"), E.robotsAllowed(R, "https://x.test/f.pdf"), E.robotsAllowed(R, "https://x.test/secret"), E.robotsAllowed(R, "https://x.test/ok")], sitemaps: R.sitemaps,
      norm: [E.normUrl("HTTPS://X.test:443/a/?utm_source=z&b=2&a=1#top"), E.normUrl("/b/index.html", "https://x.test/a/"), E.normUrl("mailto:a@b.c")], intents: [E.intentOf("Spice Hub", "Spice Hub"), E.intentOf("dentist price delhi"), E.intentOf("dentist near me"), E.intentOf("best crm for startups"), E.intentOf("why is my tooth hurting"), E.intentOf("what is seo")],
      opp: opp && [opp.priority, opp.priorityScore, opp.tool && opp.tool[0]], s: [s1.areas.website.score, s2.areas.website.score, s1.areas.search.score, s1.areas.search.note], kw: [kw[0].opportunity, kw[0].volume, kw[0].label], kwv: [kwv[0].volume, kwv[0].label, typeof kwv[0].score],
      voice: E.voice([{ text: "The delivery was late and the food was cold. Too expensive for what you get. Looking for a reliable place near me.", url: "u", source: "s", evidence: ["E1"] }]) }; });
  ok(u.robots.join() === "true,true,true,false,true", "robots.txt: our own user-agent group wins over * (and longest match / $ rules): " + u.robots);
  ok(u.sitemaps[0] === "https://x.test/s.xml", "robots.txt sitemap line read");
  ok(u.norm[0] === "https://x.test/a?a=1&b=2" && u.norm[1] === "https://x.test/b" && u.norm[2] === null, "URL normalisation: tracking removed, params sorted, index.html, no mailto (" + u.norm + ")");
  ok(u.intents.join() === "NAVIGATIONAL,TRANSACTIONAL,LOCAL,COMMERCIAL,PROBLEM-BASED,INFORMATIONAL", "search intent classes: " + u.intents);
  ok(u.opp[0] === "P0" && u.opp[1] === 65, "priority score: missing top CTA (impact 5, urgency 5, effort 1, INFERRED 0.65) → " + u.opp);
  ok(u.s[0] === 63 && u.s[1] === 83 && u.s[2] === null && /Data unavailable/.test(u.s[3]), "scores are weighted averages of their checks (63 vs 83) and null without data");
  ok(u.kw[0] === "High" && u.kw[1] === null && u.kw[2] === "INFERRED" && u.kwv[0] === 1900 && u.kwv[1] === "ESTIMATED" && u.kwv[2] === "number", "keyword opportunity: qualitative without volume, scored + ESTIMATED with volume");
  ok(u.voice.complaints.length && u.voice.needs.length && u.voice.complaints[0].quotes[0].evidence[0] === "E1", "customer-voice clusters keep their source evidence");

  /* ---------- invalid & unsafe input ---------- */
  for (const [inp, re] of [["localhost", /private|local/i], ["http://10.0.0.7/", /private|local/i], ["ftp://spicehub.test", /Only http/i], ["not a website", /not a valid|private/i]]) { const x = await xray(p, inp); ok(re.test(x.status) && !x.r, `input “${inp}” refused: ${x.status.slice(0, 70)}`); }

  /* ---------- 1. restaurant (with real backend progress polling) ---------- */
  const seenStatus = []; let pollJob = null;
  p.on("response", async (res) => { if (/api\/xray\/start$/.test(res.url())) { try { pollJob = (await res.json()).jobId; } catch (e) {} } });
  const poll = setInterval(async () => { if (!pollJob) return; try { const j = await (await fetch(BASE + "/api/xray/status/" + pollJob)).json(); seenStatus.push([j.progress, j.currentStage, j.status]); } catch (e) {} }, 150);
  let x = await xray(p, "spicehub.test"), r = x.r; clearInterval(poll);
  ok(/X-Ray complete: \d+ pages read/.test(x.status), "restaurant: " + x.status);
  const prog = seenStatus.map((s) => s[0]);
  ok(seenStatus.length >= 3 && prog.every((v, i) => !i || v >= prog[i - 1]) && new Set(seenStatus.map((s) => s[1])).size >= 3 && seenStatus[seenStatus.length - 1][2] === "COMPLETE", `GET /api/xray/status shows real, rising progress through ${new Set(seenStatus.map((s) => s[1])).size} stages → COMPLETE`);
  integrity("restaurant", r);
  ok(r.business.name.value === "Spice Hub" && /Restaurant/.test(r.business.industry.value) && r.business.locations.value.some((c) => /Dwarka|Delhi/.test(c)), "restaurant: name, industry and location understood");
  ok(r.crawl.pages >= 8 && r.crawl.skippedRobots >= 1 && r.crawl.robotsFound && r.crawl.sitemapFound, `restaurant: ${r.crawl.pages} pages crawled (more than the homepage), robots.txt respected (${r.crawl.skippedRobots} skipped), sitemap found`);
  const ck = (id) => r.checks.filter((c) => c.id === id)[0] || {};
  ok(ck("T_broken").status !== "pass" && ck("T_broken").pages.some((u2) => /old-menu/.test(u2)) && ck("T_redirects").status === "warn", "restaurant: broken link and redirect chain found");
  ok(r.crawl.list.some((pg) => /go-internal/.test(pg.url) && /blocked/.test(pg.error)), "restaurant: a link that redirects to a private address was blocked (SSRF)");
  ok(r.checks.some((c) => /R_schemaMismatch/.test(c.id) && /telephone/.test(c.name)), "restaurant: structured-data phone that is not on the page is flagged");
  ok(r.competitors.some((c) => c.domain === "tandoortales.test" && c.reason && c.source.length && /HIGH|MEDIUM|LOW/.test(c.confidence)) && r.competitors.every((c) => ["tandoortales.test", "curryhouse.test"].indexOf(c.domain) > -1), "restaurant: only real candidates from the searches become competitors, each with reason/source/confidence");
  ok(r.voice && r.voice.snippets > 3 && r.voice.complaints.length > 0, `restaurant: customer voice from ${r.voice && r.voice.snippets} public snippets, complaints clustered`);
  ok(r.psi && r.psi.performance === 47 && r.checks.some((c) => c.id === "P_perf"), "restaurant: Google PageSpeed result used (performance 47)");
  ok(r.presence && r.presence.ratings.some((x2) => x2.value === 4.4), "restaurant: public rating read from the search results (4.4)");
  ok(r.providers.searchName === "Google Search (via Serper)" && r.evidence.some((e) => /google\.com\/search\?q=/.test(e.sourceUrl)), "restaurant: search evidence links to the Google search it came from");
  // UI: report sections + evidence drawer + tool links
  const H = await p.textContent("#xr-report");
  ok(["Executive Summary", "Digital Growth Health", "Business Overview", "Digital Market Presence", "Biggest Problem", "Website X-Ray", "SEO / Search X-Ray", "Competitor X-Ray", "Customer Voice", "Offer & Positioning", "Conversion X-Ray", "Digital Presence", "AI Visibility", "Biggest Opportunities", "Top 5 Actions", "30-Day Action Plan", "Evidence & Sources"].every((t) => H.indexOf(t) > -1), "report has all 17 sections");
  ok(/BIGGEST PROBLEM/.test(H) && /BIGGEST OPPORTUNITY/.test(H) && /TOP 5 ACTIONS/.test(H) && /Search volume: Data unavailable/.test(H) && /Sampled AI visibility|Data unavailable, no AI source/.test(H), "hero blocks shown; unavailable data says so");
  await p.click("#xr-s5 .xr-why"); await p.waitForSelector("#xr-evd:not([hidden])");
  ok(/E\d+/.test(await p.textContent("#xr-evd")) && /OBSERVED|INFERRED/.test(await p.textContent("#xr-evd")), "“Why did FODO say this?” opens the evidence");
  await p.keyboard.press("Escape");
  ok(await p.evaluate(() => [].slice.call(document.querySelectorAll("#xr-report .xr-tool")).some((a) => /competitor-finder\//.test(a.href)) && [].slice.call(document.querySelectorAll("#xr-report .xr-tool")).some((a) => /services\//.test(a.href))), "findings link to FODO tools / services (no dead ends)");
  await p.evaluate(() => { const d = document.querySelector(".xr-tile"); d.open = true; });
  ok(/\d/.test(await p.textContent(".xr-tile .xr-tile-b")), "tapping a score shows how it was calculated");
  // exports
  const dl = async (sel) => { const [d] = await Promise.all([p.waitForEvent("download", { timeout: 15000 }), p.click(sel)]); return { name: d.suggestedFilename(), buf: fs.readFileSync(await d.path()) }; };
  let f = await dl('#xr-report [data-x="pdf"]'); const pdfPath = path.join(os.tmpdir(), "xr-" + process.pid + ".pdf"); fs.writeFileSync(pdfPath, f.buf);
  const pt = sh("pdftotext", [pdfPath, "-"]).stdout || "", qp = sh("qpdf", ["--check", pdfPath]).stdout || "";
  ok(f.buf.slice(0, 5).toString() === "%PDF-" && /No syntax or stream encoding errors/.test(qp) && /Executive Summary/.test(pt) && /Spice Hub/.test(pt) && /30-Day Action Plan/.test(pt) && /E\d+/.test(pt), `PDF: real text PDF (${Math.round(f.buf.length / 1024)} KB) with summary, plan and evidence IDs, not a screenshot`);
  f = await dl('#xr-report [data-x="xlsx"]'); const wb = XL.read(f.buf);
  ok(["Summary", "Opportunities", "30-day plan", "Checks", "Competitors", "Searches", "Pages", "Evidence"].every((s) => wb.SheetNames.indexOf(s) > -1) && XL.utils.sheet_to_json(wb.Sheets.Opportunities).length === r.opportunities.length, "Excel: 8 sheets, one row per opportunity");
  f = await dl('#xr-report [data-x="csv"]'); ok(f.buf.toString("utf8").replace(/^﻿/, "").split(/\r\n/).length === r.opportunities.length + 1 && /Evidence IDs/.test(f.buf.toString()), "findings CSV: header + one line per opportunity");
  f = await dl('#xr-report [data-x="plan"]'); ok(/DAY 1-7/.test(f.buf.toString()) && /Problem/.test(f.buf.toString()), "action-plan CSV");
  f = await dl('#xr-report [data-x="json"]'); ok(JSON.parse(f.buf.toString()).jobId === r.jobId, "structured JSON export");
  // shared link from storage (D1)
  const c2 = await newCtx(b), p2 = await c2.newPage(); await p2.goto(BASE + "/business-x-ray/?r=" + r.jobId);
  await p2.waitForFunction(() => /Saved X-Ray/.test(document.getElementById("xr-status").textContent), null, { timeout: 15000 });
  ok(/Spice Hub/.test(await p2.textContent(".xr-name")) && (await p2.evaluate(() => window.FODO_XRAY.report().opportunities.length)) === r.opportunities.length, "share link reopens the same report from D1 in a new browser"); await c2.close();
  // D1 tables (local SQLite file of the D1 database)
  const dbf = (function walk(d) { for (const n of fs.readdirSync(d)) { const q = path.join(d, n); if (fs.statSync(q).isDirectory()) { const w = walk(q); if (w) return w; } else if (/\.sqlite$/.test(n) && /d1/i.test(q)) return q; } return null; })(STATE);
  const q = (sql) => (execFileSync("python3", ["-c", "import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);print(c.execute(sys.argv[2]).fetchone()[0])", dbf, sql], { encoding: "utf8" }) || "").trim();
  ok(dbf && q("select count(*) from xray_reports where job_id='" + r.jobId + "'") === "1" && +q("select count(*) from xray_evidence where job_id='" + r.jobId + "'") === r.evidence.length && +q("select count(*) from xray_opportunities where job_id='" + r.jobId + "'") === r.opportunities.length && +q("select count(*) from xray_pages where job_id='" + r.jobId + "'") === r.crawl.list.length && q("select status from xray_jobs where id='" + r.jobId + "'") === "COMPLETE",
    "D1: job, report, every evidence item, opportunity and page stored in their tables");

  /* ---------- 2. SaaS ---------- */
  x = await xray(p, "flowdesk.test"); r = x.r; integrity("saas", r);
  ok(/Software|SaaS/.test(r.business.industry.value) && /SaaS|Software/.test(r.business.model.value), "saas: industry + subscription model inferred: " + r.business.model.value);
  ok(r.checks.filter((c) => c.id === "C_pricing")[0].status === "pass" && r.checks.filter((c) => c.id === "C_faq")[0].status === "pass" && r.opportunities.some((o) => o.key === "R_testi"), "saas: prices + FAQ pass; missing testimonials is an opportunity");
  ok(r.serps.some((s) => s.ourPos != null && s.kind !== "brand"), "saas: found in a sampled market search (its pricing page)");

  /* ---------- 3. e-commerce + PageSpeed failure ---------- */
  x = await xray(p, "aromaco.test"); r = x.r; integrity("ecommerce", r);
  ok(/E-commerce/.test(r.business.industry.value) && /E-commerce/.test(r.business.model.value), "ecommerce: online store recognised");
  ok(!r.psi && /PageSpeed answered 502|PageSpeed/.test(r.psiError + "") && r.dataQuality["Speed (PageSpeed)"] === "UNAVAILABLE" && /Speed not measured/.test(r.scores.areas.website.note), "ecommerce: PageSpeed down → speed marked unavailable, report continues (" + r.psiError + ")");
  ok(r.checks.filter((c) => c.id === "T_schema")[0].status === "fail" && r.checks.filter((c) => c.id === "T_sitemap")[0].status === "fail" && r.crawl.skippedRobots >= 1, "ecommerce: broken JSON-LD and missing sitemap caught; cart blocked by robots.txt skipped");
  ok(r.checks.filter((c) => c.id === "T_dupTitle")[0].status !== "pass", "ecommerce: duplicate titles found");

  /* ---------- 4. agency ---------- */
  x = await xray(p, "brightpixel.test", { city: "Mumbai" }); r = x.r; integrity("agency", r);
  ok(r.business.name.value === "BrightPixel" && /agency/i.test(r.business.industry.value), "agency: name from repeated page titles (homepage title is just “Home”), industry agency");
  ok(r.opportunities.some((o) => o.key === "S_brand") && r.serps.filter((s) => s.kind === "brand")[0].ourPos === 4, "agency: only #4 for its own name → opportunity");
  ok(r.checks.filter((c) => c.id === "C_form")[0].status === "fail" && r.checks.filter((c) => c.id === "C_ctaText")[0].status !== "pass" && r.business.offer.genericH1, "agency: 11-field form, vague buttons and the generic “Welcome” headline caught");
  ok(r.competitors.length === 2 && r.positioning && r.positioning.sameAsEveryone.length >= 0 && r.compMetrics.length === 7, "agency: 2 competitors compared like-for-like on 7 dimensions");

  /* ---------- 5. dental clinic: plain HTTP, noindex, and the search provider fails ---------- */
  x = await xray(p, "http://smilecare.test"); r = x.r; integrity("clinic", r);
  ok(/X-Ray complete/.test(x.status), "clinic: search API failing does not crash the report: " + x.status);
  ok(r.opportunities[0].priority === "P0" && r.opportunities.slice(0, 3).some((o) => o.key === "T_https") && r.opportunities.some((o) => o.key === "T_index" && o.affectedPages.some((u2) => /treatments/.test(u2))) && r.opportunities.some((o) => o.key === "T_viewport"), "clinic: no HTTPS, a noindexed treatments page and no mobile viewport are top P0 fixes");
  ok(r.scores.areas.search.score === null && r.scores.areas.market.score === null && /Data unavailable/.test(r.scores.areas.search.note) && r.modules.MARKET_RESEARCH.status !== "ok" && r.modules.COMPETITORS.status === "unavailable", "clinic: search/market/competitors say “Data unavailable” instead of a number");
  ok(r.scores.overall != null && r.scores.basedOn < 6 && /Based on \d of 6 areas/.test(await p.textContent(".xr-ring-l")), "clinic: overall score says how many areas it is based on");

  /* ---------- 6. site that blocks automated readers (like zomato.com → HTTP 520): limited X-Ray, not a dead end ---------- */
  x = await xray(p, "blockedco.test"); r = x.r;
  ok(/Limited X-Ray complete/.test(x.status) && /520/.test(x.status), "blocked site: limited X-Ray instead of stopping: " + x.status.slice(0, 90));
  ok(r && r.crawl.blocked && r.crawl.blocked.status === 520 && r.business.name.value === "QuickBite" && /Restaurant/.test(r.business.industry.value) && r.business.locations.value.indexOf("Delhi") > -1, "blocked site: name, industry and city read from how Google shows it");
  ok(r.scores.areas.conversion.score === null && /could not be read/.test(r.scores.areas.conversion.note) && r.dataQuality["Website crawl"] === "UNAVAILABLE" && r.checks.every((c) => /^P_/.test(c.id) || /^R_offsite/.test(c.id)), "blocked site: page checks marked Data unavailable, only PageSpeed / public-rating checks, nothing guessed");
  ok(r.opportunities.some((o) => o.key === "W_blocked") && !r.opportunities.some((o) => o.key === "T_home" || o.key === "D_social"), "blocked site: “turns away automated visitors” is reported; no false “homepage broken” / “no socials”");
  ok(r.competitors.length >= 1 && r.competitors.every((c) => c.insights.advantages.length === 0 && /could not be read/.test(c.insights.opportunity)) && !r.compMetrics.length, "blocked site: real competitors listed, no made-up side-by-side comparison");
  ok(/LIMITED X-RAY/.test(await p.textContent("#xr-report")), "blocked site: report shows a clear LIMITED X-RAY note");
  integrity("blocked", r);
  const fx = await (await fetch("http://127.0.0.1:9300/_calls")).json();
  ok(fx.pages.filter((u2) => /^blockedco:/.test(u2)).some((u2) => /FODO-BusinessXRay\/1\.0 \(\+/.test(u2)) && fx.pages.filter((u2) => /^blockedco:/.test(u2)).some((u2) => /compatible; FODO-BusinessXRay/.test(u2)), "blocked site: tried with FODO's agent, then a standard compatible agent (both name FODO)");
  x = await xray(p, "shyco.test"); r = x.r;
  ok(/X-Ray complete: 1 page read/.test(x.status) && r.business.name.value === "ShyCo" && !r.crawl.blocked, "site that refuses unknown agents (403) is read on the second try");
  x = await xray(p, "spicehub.test/go-internal"); ok(/cannot be X-Rayed/.test(x.status) && !x.r, "a start address that redirects to a private network is still refused: " + x.status.slice(0, 70));

  /* ---------- phone: export through the save dialog + server download ---------- */
  const pc = await newCtx(b, Object.assign({}, devices["iPhone 13"], { acceptDownloads: true })), pp = await pc.newPage();
  x = await xray(pp, "flowdesk.test"); ok(/X-Ray complete/.test(x.status), "phone: X-Ray runs on a phone");
  await pp.click('#xr-report [data-x="pdf"]'); await pp.waitForSelector(".cfx:not([hidden]) [data-a=server]");
  const [pd] = await Promise.all([pp.waitForEvent("download", { timeout: 15000 }), pp.click(".cfx:not([hidden]) [data-a=server]")]);
  const pbuf = fs.readFileSync(await pd.path()); ok(pd.suggestedFilename().endsWith(".pdf") && pbuf.slice(0, 5).toString() === "%PDF-", "phone: PDF saved through the normal web download (/api/export)");
  ok(await pp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "phone: report fits the screen (no sideways scroll)");
  await pc.close();

  /* ---------- AI synthesis path (Workers AI is not available offline, so its route is stood in for) ---------- */
  { const ca = await newCtx(b), pa = await ca.newPage(); let pack = null;
    await pa.route(/\/api\/xray\/start$/, async (rt) => { const res = await rt.fetch(); const j = await res.json(); j.providers.ai = "workers-ai"; rt.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(j) }); });
    await pa.route(/\/api\/xray\/ai$/, async (rt) => { const body = JSON.parse(rt.request().postData());
      if (body.mode === "visibility") return rt.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, mode: "visibility", answers: body.pack.questions.map((q2) => ({ q: q2, answer: "I would suggest Tandoor Tales (tandoortales.test) or Spice Hub.", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" })) }) });
      pack = body.pack; const e = pack.ids.filter((i) => /^E/.test(i)), o = pack.ids.filter((i) => /^O/.test(i));
      rt.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, mode: "synthesis", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", synthesis: { executiveSummary: "AI SUMMARY for Spice Hub.", doingWell: [{ text: "Prices are on the menu page", evidence: [e[0]] }], holdingBack: [], whyProblem: null, competitorsDifferent: [], customersWant: [], marketOpportunities: [], doFirst: [o[1], o[0]], notPrioritize: [], unknowns: ["Website traffic"] }, dropped: [{ section: "doingWell", text: "Has 10,000 reviews" }] }) }); });
    x = await xray(pa, "spicehub.test"); r = x.r;
    const packTxt = JSON.stringify(pack || {});
    ok(pack && packTxt.length < 60000 && pack.ids.length > 5 && pack.data.evidence.every((ev2) => pack.ids.indexOf(ev2.id) > -1) && packTxt.indexOf(SECRET) < 0, `AI receives only the structured research pack (${Math.round(packTxt.length / 1024)} KB, ${pack && pack.data.evidence.length} evidence items, IDs listed)`);
    ok(/AI \(/.test(r.synthesisBy) && r.synthesis.executiveSummary === "AI SUMMARY for Spice Hub." && /AI SUMMARY/.test(await pa.textContent("#xr-s1")) && /1 AI statement\(s\) removed/.test(await pa.textContent("#xr-s1")), "AI summary shown, labelled, and the dropped unsupported claim is disclosed");
    ok(r.visibility && r.visibility.tested >= 1 && r.visibility.brandIn === r.visibility.tested && r.visibility.compIn === r.visibility.tested && /NOT ChatGPT/.test(await pa.textContent("#xr-s13")), `sampled AI visibility: ${r.visibility && r.visibility.tested} questions, brand + competitor mentions counted, clearly not “total AI visibility”`);
    await ca.close(); }

  /* ---------- the rest of the site ---------- */
  for (const pg of ["/", "/competitor-finder/", "/growth-score/"]) { const e2 = []; const pq = await ctx.newPage(); pq.on("pageerror", (e) => e2.push(e.message)); const rs = await pq.goto(BASE + pg); await pq.waitForTimeout(500); ok(rs.status() === 200 && !e2.length, "existing page still works: " + pg); if (pg === "/") ok(await pq.$('a.xr-labcard[href$="business-x-ray/"]') !== null, "Growth Lab shows the Business X-Ray card"); await pq.close(); }
  ok(!errs.length, "no JavaScript errors during the X-Rays" + (errs.length ? ": " + errs[0] : ""));
  const js = ["xray.js", "xray-engine.js", "cf-export.js"].map((f2) => fs.readFileSync(path.join(ROOT, "js", f2), "utf8")).join("");
  ok(!bodies.some((t) => t.indexOf(SECRET) > -1) && js.indexOf(SECRET) < 0 && !/SERPER_API_KEY\s*[:=]\s*["']/.test(js), `no API key in any of ${bodies.length} responses or the page code`);
  await ctx.close();

  /* ---------- rate limit (fresh runtime, 2 per hour) ---------- */
  start(2); ctx = await newCtx(b); p = await ctx.newPage();
  const st = []; for (let i = 0; i < 3; i++) st.push((await (await fetch(BASE + "/api/xray/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "flowdesk.test" }) })).status));
  ok(st.join() === "200,200,429", "rate limit: 3rd X-Ray in the hour → 429 (" + st + ")");
  x = await xray(p, "spicehub.test"); ok(/maximum X-Rays for this hour/.test(x.status), "rate limit message shown on the page: " + x.status.slice(0, 60));
  await ctx.close(); await b.close(); stop();
  console.log(`\nxray e2e: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); stop(); process.exit(1); });
