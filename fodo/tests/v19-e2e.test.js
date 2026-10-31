#!/usr/bin/env node
/* v19 background X-Ray end-to-end — real pages + real Pages Functions (local workerd, D1) + the REAL runner Worker code
   (runner/src/index.js) with its Queue and Browser Rendering replaced by local stand-ins (an in-memory queue, Chromium via Playwright).
   Covers: "Run in the background" → the visitor closes the tab → the runner claims the job, opens the token-protected runner page,
   the normal X-Ray engine builds and saves the report → email sent → the report opens later; browser capacity used up → the job
   waits and starts again by itself; a visitor who stays sees live stages and the report appears; wrong token refused.
   Env: WRANGLER, NM. */
const { chromium } = require("playwright");
const { spawnSync } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os"), http = require("http");
const BASE = "http://localhost:8788", F = "http://127.0.0.1:9300", RPORT = 9400, KEY = "runner_test_KEY_1234567890";
const WRANGLER = process.env.WRANGLER, STATE = path.join(os.tmpdir(), "v19-state-" + process.pid);
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const sh = (cmd, args, env) => spawnSync(cmd, args, { env: Object.assign({}, process.env, env || {}), encoding: "utf8" });
const stop = () => { sh("bash", ["-c", "for p in $(pgrep -f '[p]ages dev . --port 8788|[w]orkerd serve'); do kill $p; done; sleep 1; true"]); };
const envMap = () => { const src = fs.readFileSync(path.join(__dirname, "xray-fixtures/env.sh"), "utf8"); const m = JSON.parse(/MAP='(.*)'\s*$/m.exec(src)[1].replace(/'\$F'/g, F));
  return JSON.stringify(Object.assign(m, { "instagram.com": F + "/_ext404", "facebook.com": F + "/_ext200", "openpagerank.com": F + "/_opr", "api.groq.com": F + "/_groq", "generativelanguage.googleapis.com": F + "/_gemini", "oauth2.googleapis.com": F + "/_gtoken", "api.resend.com": F + "/_resend" })); };
function start() {
  stop(); sh("bash", ["-c", "curl -s --noproxy '*' -m 2 " + F + "/_calls >/dev/null && pkill -f '[x]ray-fixtures/server.js'; sleep 0.5; true"]);
  const r = sh(path.join(__dirname, "xray-fixtures/run-local.sh"), ["100"], { WRANGLER, STATE, MAPX: envMap(),
    EXTRA: "--binding ACCOUNTS_ENABLED=1 --binding XRAY_TEST_AI=" + F + "/_ai --binding GROQ_API_KEY=groq_test_KEY --binding RUNNER_URL=http://127.0.0.1:" + RPORT + " --binding RUNNER_KEY=" + KEY + " --binding RESEND_API_KEY=re_test_KEY --binding MAIL_FROM=FODO_test" });
  if (!/READY/.test(r.stdout)) throw new Error("local runtime did not start: " + r.stdout + r.stderr);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getj = (u, o) => fetch(u, o).then((r) => r.json());

(async () => {
  start();
  const W = (await import(path.join(__dirname, "../runner/src/index.js"))).default;
  const b = await chromium.launch(), Q = [], log = [];
  let capacityFull = 0, launches = 0;
  // Browser Rendering stand-in: the same calls the Worker makes on Cloudflare (launch → newPage → goto → evaluate → close)
  const launch = async () => {
    if (capacityFull > 0) { capacityFull--; throw new Error("Unable to create new browser: code 429: Rate limit exceeded"); }
    launches++; const ctx = await b.newContext(); await ctx.route("**/api/chat", (r) => r.fulfill({ status: 404, body: "" })); await ctx.route(/accounts\.google\.com|gstatic\.com\/firebasejs/, (r) => r.fulfill({ status: 404, body: "" }));
    return { newPage: async () => { const pg = await ctx.newPage(); return { goto: (u, o) => pg.goto(u, o), evaluate: (f) => pg.evaluate(f) }; }, close: () => ctx.close() };
  };
  const wenv = { RUNNER_KEY: KEY, SITE_URL: BASE, BROWSER: {}, __launch: launch, JOBS: { send: async (m) => { Q.push({ body: m, attempts: 1, due: 0 }); } } };
  // the Worker's HTTP side (the website calls /enqueue) …
  const srv = http.createServer(async (req, res) => { let body = ""; req.on("data", (c) => (body += c)); req.on("end", async () => {
    const r = await W.fetch(new Request("http://runner" + req.url, { method: req.method, headers: req.headers, body: req.method === "POST" ? body : undefined }), wenv);
    res.writeHead(r.status, { "content-type": "application/json" }); res.end(await r.text()); }); }).listen(RPORT);
  // … and its queue consumer (one message at a time, honouring retry delays — compressed: 1 s per 60 s)
  let draining = true; (async () => { while (draining) { const m = Q.find((x) => x.due <= Date.now()); if (!m) { await sleep(300); continue; } Q.splice(Q.indexOf(m), 1);
    let act = null; await W.queue({ messages: [{ body: m.body, attempts: m.attempts, ack: () => (act = "ack"), retry: (o) => (act = o) }] }, wenv);
    log.push({ job: m.body.jobId, act }); if (act && act !== "ack") Q.push({ body: m.body, attempts: m.attempts + 1, due: Date.now() + (act.delaySeconds || 60) * 1000 / 60 }); } })();

  const r0 = await getj("http://127.0.0.1:" + RPORT + "/health"); ok(r0.ok && r0.queue && r0.browser && r0.key && !r0.github, "runner Worker health: queue + browser + key connected (GitHub fallback optional, off)");
  const h = await getj(BASE + "/api/xray/health"); ok(h.background === true, "website knows background X-Rays are switched on");

  /* ---------- 1. start in the background, close the tab ---------- */
  let ctx = await b.newContext(), p = await ctx.newPage(); await ctx.route(/accounts\.google\.com|gstatic\.com\/firebasejs|\/api\/chat/, (r) => r.fulfill({ status: 404, body: "" }));
  await p.goto(BASE + "/business-x-ray/"); await p.evaluate(() => fetch("/api/account/test-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "bg@shop.in", plan: "growth" }) }));
  await p.goto(BASE + "/business-x-ray/"); await p.waitForSelector("#xr-bgwrap:not([hidden])", { timeout: 15000 });
  ok(await p.isChecked("#xr-bg") && /close this tab/.test(await p.textContent("#xr-bgwrap")), "form offers 'Run in the background' (on by default)");
  await p.fill("#xr-url", "spicehub.test"); await p.fill("#xr-city", "Dwarka, New Delhi"); await p.click("#xr-run");
  await p.waitForFunction(() => /background/.test(document.getElementById("xr-status").textContent) && /[?&]r=/.test(location.search), null, { timeout: 20000 });
  const job1 = new URL(p.url()).searchParams.get("r"); ok(/^[a-z0-9]{20}$/.test(job1), "started in the background — the tab shows the job and says it can be closed");
  await ctx.close();   // the visitor leaves
  let st = null; for (let i = 0; i < 120; i++) { st = await getj(BASE + "/api/xray/status/" + job1); if (st.status === "COMPLETE" || st.status === "FAILED") break; await sleep(2000); }
  ok(st && st.status === "COMPLETE", "with the tab closed, the runner finished the X-Ray (" + (st && st.status) + ")");
  const rep = await fetch(BASE + "/api/xray/report/" + job1).then((r) => r.json()).catch(() => null);
  ok(rep && rep.jobId === job1 && rep.opportunities.length > 0 && rep.completeness && rep.tier === "growth", "report saved by the background run: Growth level, " + (rep ? rep.opportunities.length : 0) + " opportunities, data completeness " + (rep && rep.completeness ? rep.completeness.overall : "?") + "%");
  for (let i = 0; i < 30 && !log.some((x) => x.job === job1 && x.act === "ack"); i++) await sleep(500);
  const calls = await getj(F + "/_calls"); if (process.env.DBG) console.log("DBG mails", JSON.stringify(calls.mails).slice(0, 600)); const mail = (calls.mails || []).filter((m) => (m.to || []).indexOf("bg@shop.in") > -1)[0];
  ok(mail && /is ready/.test(mail.subject) && mail.html.indexOf("/business-x-ray/?r=" + job1) > -1, "email 'Your Business X-Ray of spicehub.test is ready' with the report link");
  ok(launches === 1 && log.filter((x) => x.job === job1).every((x) => x.act === "ack"), "one browser launch, queue message acknowledged");

  /* ---------- 2. come back later: the link opens the report ---------- */
  ctx = await b.newContext(); p = await ctx.newPage(); await ctx.route(/accounts\.google\.com|gstatic\.com\/firebasejs|\/api\/chat/, (r) => r.fulfill({ status: 404, body: "" }));
  await p.goto(BASE + "/business-x-ray/?r=" + job1); await p.waitForSelector("#xr-report .xr-hero", { timeout: 20000 }); ok(/spicehub/i.test(await p.textContent(".xr-hero")), "the saved link opens the finished report");
  await ctx.close();

  /* ---------- 3. Browser Rendering capacity used up → waits, then starts by itself; the visitor stays and watches ---------- */
  ctx = await b.newContext(); p = await ctx.newPage(); await ctx.route(/accounts\.google\.com|gstatic\.com\/firebasejs|\/api\/chat/, (r) => r.fulfill({ status: 404, body: "" }));
  await p.goto(BASE + "/business-x-ray/"); await p.evaluate(() => fetch("/api/account/test-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "bg@shop.in", plan: "growth" }) }));
  await p.goto(BASE + "/business-x-ray/"); await p.waitForSelector("#xr-bgwrap:not([hidden])", { timeout: 15000 });
  capacityFull = 1; await p.fill("#xr-url", "tandoortales.test"); await p.click("#xr-run");
  await p.waitForFunction(() => /Waiting for a free background browser/.test(document.getElementById("xr-status").textContent + " " + document.getElementById("xr-stages").textContent), null, { timeout: 30000 });
  ok(true, "capacity full → the visitor sees 'Waiting for a free background browser — it starts automatically'");
  await p.waitForSelector("#xr-report .xr-hero", { timeout: 240000 });
  const job2 = new URL(p.url()).searchParams.get("r"); for (let i = 0; i < 30 && !log.some((x) => x.job === job2 && x.act === "ack"); i++) await sleep(500); if (process.env.DBG) console.log("DBG log", JSON.stringify(log), job2);
  ok(/tandoortales/i.test(await p.textContent(".xr-hero")) && log.some((x) => x.job === job2 && x.act && x.act.delaySeconds === 900) && log.some((x) => x.job === job2 && x.act === "ack"), "…it started again by itself (retry after 15 min) and the report appeared in the open tab");
  ok((await p.$$eval("#xr-stages li.done", (l) => l.length)) >= 8, "the watching tab showed the real stages from the job");
  await ctx.close();

  /* ---------- 4. security ---------- */
  let r = await fetch(BASE + "/api/xray/bg/job/" + job1 + "?t=00000000000000000000000000000000"); ok(r.status === 403, "runner page with a wrong token → 403");
  r = await fetch(BASE + "/api/xray/bg/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: job1 }) }); ok(r.status === 403, "claim without the runner key → 403");
  r = await fetch("http://127.0.0.1:" + RPORT + "/enqueue", { method: "POST", headers: { "content-type": "application/json", "x-runner-key": "wrong-key-wrong-key-xx" }, body: JSON.stringify({ jobId: job1 }) }); ok(r.status === 403, "runner Worker refuses jobs without the key");
  r = await fetch(BASE + "/api/xray/bg/claim", { method: "POST", headers: { "content-type": "application/json", "x-runner-key": KEY }, body: JSON.stringify({ jobId: job1 }) }).then((x) => x.json()); ok(r.drop, "a finished job can't be run twice");

  draining = false; srv.close(); await b.close(); stop();
  console.log("\nv19 e2e: " + pass + "/" + (pass + fail) + " passed"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.log("FAIL crashed:", e); stop(); process.exit(1); });
