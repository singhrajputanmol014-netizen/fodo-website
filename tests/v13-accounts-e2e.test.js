#!/usr/bin/env node
/* v13 Growth Lab accounts end-to-end, real pages + real Pages Functions (local workerd, D1 + KV) with accounts switched on.
   Email codes (Resend), payments (Cashfree orders) and Open PageRank are stand-ins on the fixture server; the Cashfree browser SDK is stubbed.
   Covers: login with an emailed code → 2 free X-Rays (free-level limits, locked sections) → 402 "pick a plan" → buy Pro on /plans/ →
   payment confirmed on /account/ → Pro X-Ray (more pages, tech stack, broken outgoing links, authority, compare with last X-Ray, exports) →
   refund for a site that cannot be read → Agency: white-label PDF with logo, client folders, bulk box; history + ledger; no secrets in the browser.
   Env: WRANGLER, NM. Run: node tests/v13-accounts-e2e.test.js */
const { chromium } = require("playwright");
const { spawnSync } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");
const BASE = "http://localhost:8788", F = "http://127.0.0.1:9300";
const WRANGLER = process.env.WRANGLER, STATE = path.join(os.tmpdir(), "v13-state-" + process.pid);
const SECRETS = ["CF_TEST_SECRET", "re_test_KEY", "opr_test_KEY", "sk-test-SECRET-123", "wa_test_TOKEN", "wa_test_SECRET"];
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const sh = (cmd, args, env) => spawnSync(cmd, args, { env: Object.assign({}, process.env, env || {}), encoding: "utf8" });
const stop = () => { sh("bash", ["-c", "for p in $(pgrep -f '[p]ages dev . --port 8788|[w]orkerd serve'); do kill $p; done; sleep 1; true"]); };
const envMap = () => { const src = fs.readFileSync(path.join(__dirname, "xray-fixtures/env.sh"), "utf8"); const m = JSON.parse(/MAP='(.*)'\s*$/m.exec(src)[1].replace(/'\$F'/g, F));
  return JSON.stringify(Object.assign(m, { "instagram.com": F + "/_ext404", "facebook.com": F + "/_ext200", "api.resend.com": F + "/_resend", "sandbox.cashfree.com": F + "/_cf", "openpagerank.com": F + "/_opr" })); };
const start = () => { stop(); sh("bash", ["-c", "curl -s --noproxy '*' -m 2 " + F + "/_calls >/dev/null && pkill -f '[x]ray-fixtures/server.js'; sleep 0.5; true"]);
  const r = sh(path.join(__dirname, "xray-fixtures/run-local.sh"), ["100"], { WRANGLER, STATE, MAPX: envMap(),
    EXTRA: "--binding ACCOUNTS_ENABLED=1 --binding RESEND_API_KEY=re_test_KEY --binding MAIL_FROM=login@fodo.test --binding CASHFREE_APP_ID=CF_TEST_APP --binding CASHFREE_SECRET_KEY=CF_TEST_SECRET --binding CASHFREE_ENV=sandbox --binding OPR_API_KEY=opr_test_KEY --binding XRAY_TEST_AI=" + F + "/_ai --binding FIREBASE_API_KEY=AIza-test --binding FIREBASE_PROJECT_ID=fodo-test --binding FIREBASE_PROVIDERS=facebook,phone,microsoft --binding WA_NUMBER=917827007676 --binding WA_PHONE_ID=PID --binding WA_TOKEN=wa_test_TOKEN --binding WA_APP_SECRET=wa_test_SECRET --binding WA_VERIFY_TOKEN=v" });
  if (!/READY/.test(r.stdout)) throw new Error("local runtime did not start: " + r.stdout + r.stderr); };
const calls = () => fetch(F + "/_calls").then((r) => r.json());
const bodies = [];
const SDK = `window.Cashfree=function(o){try{sessionStorage.setItem("cfmode",o&&o.mode)}catch(e){}return{checkout:function(x){var id=x.paymentSessionId.replace(/^sess_/,"");return fetch("${F}/_cf/pay?order="+id).then(function(){location.href="/account/?order_id="+id;});},subscriptionsCheckout:function(){}};};`;
async function newCtx(b) {
  const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 950 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("fodo-consent", JSON.stringify({ analytics: false, t: Date.now() })); } catch (e) {} });
  await ctx.route("**/api/chat", (r) => r.fulfill({ status: 404, body: "" }));
  await ctx.route("https://sdk.cashfree.com/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: SDK }));
  await ctx.route(/accounts\.google\.com/, (r) => r.fulfill({ status: 404, body: "" }));
  ctx.on("response", async (res) => { try { if (/localhost:8788/.test(res.url())) bodies.push(await res.text()); } catch (e) {} });
  return ctx;
}
const DONE = /X-Ray complete|stopped|maximum|could not|cannot be|did not let|free X-Rays|No X-Rays left|Log in/i;
async function runX(p, url, opt) {
  opt = opt || {};
  if (!opt.stay) { await p.goto(BASE + "/business-x-ray/"); await p.waitForTimeout(400); }
  await p.fill("#xr-url", url); await p.click("#xr-run");
  if (opt.login) return;
  await p.waitForFunction((re) => new RegExp(re, "i").test(document.getElementById("xr-status").textContent) && !document.querySelector("#xr-status.busy"), DONE.source, { timeout: 200000 });
  return { status: await p.textContent("#xr-status"), r: await p.evaluate(() => window.FODO_XRAY.report()) };
}
const waitDone = (p) => p.waitForFunction((re) => new RegExp(re, "i").test(document.getElementById("xr-status").textContent) && !document.querySelector("#xr-status.busy"), DONE.source, { timeout: 200000 });

(async () => {
  start();
  const b = await chromium.launch();
  let ctx = await newCtx(b), p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));

  /* ---------- plans page ---------- */
  await p.goto(BASE + "/plans/"); await p.waitForSelector(".pl-card .btn", { timeout: 15000 });
  const cards = await p.$$eval(".pl-card", (c) => c.map((x) => [x.querySelector("h3").textContent, x.querySelector(".pl-price b").textContent]));
  ok(cards.map((c) => c.join(" ")).join(" | ") === "Free ₹0 | Starter ₹499 | Growth ₹1,499 | Pro ₹3,999 | Agency ₹9,999", "plans page: 5 levels with prices from the server (" + cards.map((c) => c.join(" ")).join(", ") + ")");
  const packs = await p.$$eval(".pl-pack", (c) => c.map((x) => x.textContent)); ok(packs.length === 3 && /299/.test(packs[0]) && /2,499/.test(packs[2]), "3 X-Ray packs listed");
  const proFeats = await p.$$eval(".pl-card", (c) => c[3].textContent + c[2].textContent);
  ok(/Technology stack/.test(proFeats) && /Domain authority/.test(proFeats) && !/Search volume/.test(proFeats), "features need their data source: authority listed (OPR key set), search volume hidden (no SEO provider)");
  const html = fs.readFileSync(path.join(__dirname, "../plans/index.html"), "utf8");
  ok(/₹1,499/.test(html) && /₹9,999/.test(html) && /FAQPage/.test(html), "plans page has prices + FAQ in the HTML itself (search engines)");
  ok(/noindex/.test(fs.readFileSync(path.join(__dirname, "../account/index.html"), "utf8")), "account page is noindex");

  /* ---------- X-Ray asks to log in, emailed code logs in, run continues ---------- */
  await p.goto(BASE + "/business-x-ray/"); await p.waitForTimeout(600);
  ok(/Log in free/.test(await p.textContent("#xr-note")), "X-Ray form says: log in free for the first 2");
  ok((await p.textContent(".acct-chip")).trim() === "Log in", "header shows Log in");
  ok(await p.evaluate(() => { const c = document.querySelector("#site-header .acct-chip"); return !!c && c.nextElementSibling && c.nextElementSibling.id === "search-open" && /Contact/.test(c.previousElementSibling.textContent); }), "v14: login sits between the menu (… Contact) and the search icon");
  ok(await p.evaluate(() => { const d = document.getElementById("drawer"); return !!d && d.lastElementChild.classList.contains("acct-drawer") && /Log in/.test(d.lastElementChild.textContent); }), "v14: login is the last item in the ☰ menu");
  await p.goto(BASE + "/"); await p.waitForTimeout(700); ok(await p.isVisible("#site-header .acct-chip"), "v14: login button on the home page too");
  await p.goto(BASE + "/business-x-ray/"); await p.waitForTimeout(600);
  await runX(p, "spicehub.test", { stay: true, login: true });
  await p.waitForSelector(".acct-dlg #acct-email", { timeout: 15000 });
  ok(/Log in \(it.s free\) to run a Business X-Ray/.test(await p.textContent(".acct-dlg")), "Run without login → login dialog with the server's reason");
  ok(await p.isVisible('[data-prov="facebook"]') && await p.isVisible('[data-prov="microsoft"]') && await p.isVisible("#acct-phone summary"), "v16: login also offers Facebook, Microsoft and mobile-number OTP");
  await p.click("#acct-wa"); await p.waitForSelector("#acct-wabox:not([hidden])", { timeout: 10000 });
  const wab = await p.textContent("#acct-wabox"); ok(/Your code: [A-Z2-9]{6}/.test(wab) && /Scan with your phone|Open WhatsApp/.test(wab) && /Waiting for your WhatsApp message/.test(await p.textContent("#acct-msg")), "v16.1: free WhatsApp login shows a code + QR/link and waits");
  await p.fill("#acct-email", "Rohit@Example.com"); await p.click("#acct-go");
  await p.waitForFunction(() => !document.getElementById("acct-codebox").hidden, null, { timeout: 15000 });
  const mail = (await calls()).mails.slice(-1)[0], code = (/(\d{6})/.exec(mail.subject) || [])[1];
  ok(mail.to[0] === "rohit@example.com" && code && /login@fodo\.test/.test(mail.from), "6-digit code emailed through Resend (" + code + ")");
  await p.fill("#acct-code", code === "000000" ? "111111" : "000000"); await p.click("#acct-go"); await p.waitForTimeout(800);
  ok(/wrong|incorrect|not right|expired/i.test(await p.textContent("#acct-msg")), "wrong code → message, stays open: " + (await p.textContent("#acct-msg")));
  await p.fill("#acct-code", code); await p.click("#acct-go");
  await waitDone(p);
  let x = { status: await p.textContent("#xr-status"), r: await p.evaluate(() => window.FODO_XRAY.report()) };
  ok(/X-Ray complete/.test(x.status) && x.r.tier === "free", "after login the same X-Ray runs at the free level: " + x.status.slice(0, 80));
  ok(x.r.crawl.pages <= 15 && x.r.limits.pages === 15 && x.r.competitors.length <= 2, "free limits applied: " + x.r.crawl.pages + " pages (max 15), " + x.r.competitors.length + " competitors (max 2)");
  const lockN = await p.$$eval(".xr-lock", (l) => l.map((e) => e.textContent));
  ok(lockN.length >= 5 && !(await p.$('[data-x="pdf"]')) && await p.$('[data-x="share"]'), "free report: " + lockN.length + " locked sections, downloads locked, share link kept");
  ok(await p.$$eval(".xr-why", (b) => b.length) > 10 && (await p.textContent("#xr-s17")).indexOf("evidence items") > -1, "free report still shows its evidence");
  ok(!x.r.techStack && !x.r.extLinks && !x.r.authority, "paid-only data not collected on the free level");
  ok(/Free · 1 X-Ray$/.test((await p.textContent(".acct-chip")).trim()), "header chip: Free · 1 X-Ray left (" + (await p.textContent(".acct-chip")).trim() + ")");
  const c1 = await calls(); ok(!c1.opr.length, "no paid data source called for a free X-Ray");

  x = await runX(p, "flowdesk.test"); ok(/X-Ray complete/.test(x.status), "2nd free X-Ray");
  x = await runX(p, "aromaco.test");
  ok(/used your 2 free X-Rays/.test(x.status) && await p.isVisible("#xr-up") && /plans/.test(await p.getAttribute("#xr-up a", "href")), "3rd X-Ray → 'pick a plan' with a link to plans");

  /* ---------- buy Pro (one month) ---------- */
  await p.goto(BASE + "/plans/"); await p.waitForSelector('[data-buy="plan"][data-item="pro"]');
  await p.click('[data-buy="plan"][data-item="pro"]'); await p.waitForSelector("#acct-ph");
  await p.fill("#acct-ph", "12345"); await p.click("#acct-pf .btn"); ok(/10-digit/.test(await p.textContent("#acct-pm")), "bad mobile number caught before payment");
  await p.fill("#acct-ph", "98100 12345"); await p.click("#acct-pf .btn");
  await p.waitForURL(/\/account\/\?order_id=fo_/, { timeout: 20000 });
  await p.waitForFunction(() => /Payment received/.test(document.getElementById("ac-status").textContent), null, { timeout: 30000 });
  const ord = (await calls()).cf.slice(-1)[0];
  ok(ord.order_amount === 3999 && ord.customer_details.customer_phone === "9810012345" && ord.customer_details.customer_email === "rohit@example.com" && /\/account\/\?order_id=/.test(ord.order_meta.return_url), "Cashfree order made by the server: ₹3,999, phone, email, return URL");
  ok(/sandbox/.test(await p.evaluate(() => sessionStorage.getItem("cfmode"))), "Cashfree checkout opened in sandbox mode");
  ok(/Pro/.test(await p.textContent(".ac-plan")) && /80/.test(await p.textContent(".ac-credits")), "account page: Pro plan with 80 X-Rays");
  ok(!/order_id/.test(p.url()), "payment return cleaned from the address bar");
  await p.reload(); await p.waitForSelector(".ac-plan"); ok(/80/.test(await p.textContent(".ac-credits")), "reload: credits not added twice");

  /* ---------- Pro X-Ray ---------- */
  x = await runX(p, "spicehub.test"); const R = x.r;
  if (!R) console.log("  status:", x.status);
  ok(/X-Ray complete/.test(x.status) && R.tier === "pro" && R.limits.pages === 300, "Pro X-Ray runs at Pro level (300 pages max)");
  ok(R.techStack && R.techStack.some((t) => t.name === "WhatsApp chat link") && R.techStack.some((t) => t.name === "Schema.org data"), "tech stack read from the homepage: " + (R.techStack || []).map((t) => t.name).join(", "));
  ok(R.extLinks && R.extLinks.checked >= 2 && R.extLinks.broken.some((l) => /instagram\.com/.test(l.url) && l.status === 404) && !R.extLinks.broken.some((l) => /facebook/.test(l.url)), "outgoing links checked: dead Instagram link found (404), Facebook OK");
  ok(R.opportunities.some((o) => o.key === "X_extBroken"), "broken outgoing link became an opportunity");
  ok(R.authority && R.authority[0].domain === "spicehub.test" && R.authority[0].rank === 4.5, "domain authority from Open PageRank (ESTIMATED): " + JSON.stringify(R.authority && R.authority[0]));
  ok(R.compare && !R.compare.none && R.compare.tierBefore === "free" && typeof R.compare.overallBefore === "number", "compared with the earlier (free) X-Ray of the same site");
  const proLocks = await p.$$eval(".xr-lock", (l) => l.map((e) => e.textContent));
  ok(await p.isVisible(".xr-compare") && await p.$('[data-x="pdf"]') && proLocks.length === 1 && /FODO Edge/.test(proLocks[0]), "Pro report: compare panel, downloads on, only FODO Edge (Agency) locked");
  ok(R.sov && R.sov.rows.some((x) => x.you) && R.kwMap && R.kwMap.length && R.tracking && R.tracking.rows.length >= 7 && R.schema && /application\/ld\+json/.test(R.schema.code) && R.ads && R.ads.length === R.competitors.length && R.matrix && R.matrix.cols[0].you, "Pro: share of voice, keyword→page map, tracking audit, schema code, ad-library links, competitor matrix");
  ok(!R.edge, "Pro: FODO Edge not run (Agency only)");
  ok(await p.isVisible(".xr-matrix") && await p.isVisible(".xr-sov") && await p.isVisible(".xr-nav") && (await p.$$(".xr-nums li")).length === 6, "report: key numbers, section menu, side-by-side matrix and share-of-voice bars shown");
  ok(R.competitors.every((c) => c.pagesRead >= 1) && R.competitors.some((c) => c.pagesRead >= 2), "deep competitor crawl: extra pages per competitor (" + R.competitors.map((c) => c.domain + ":" + c.pagesRead).join(", ") + ")");
  const dl = p.waitForEvent("download", { timeout: 20000 }); await p.click('[data-x="pdf"]'); const pdfF = await (await dl).path(); const pdf = fs.readFileSync(pdfF, "latin1");
  ok(/^%PDF-1\.4/.test(pdf) && /Technology stack/.test(pdf) && /Domain authority/.test(pdf) && /Since the last X-Ray/.test(pdf), "PDF includes the Pro sections");
  const before = await p.evaluate(() => window.FODO_ACCOUNT.me(true).then((u) => u.credits.total));
  x = await runX(p, "nosuchsite.test");
  await p.waitForFunction(() => /credit was returned/.test(document.getElementById("xr-status").textContent), null, { timeout: 20000 }).catch(() => {});
  const after = await p.evaluate(() => window.FODO_ACCOUNT.me(true).then((u) => u.credits.total));
  ok(/credit was returned/.test(await p.textContent("#xr-status")) && after === before, "site that cannot be read → X-Ray credit returned (" + before + " → " + after + ")");

  /* ---------- account: history + ledger ---------- */
  await p.goto(BASE + "/account/"); await p.waitForSelector("#ac-hist table", { timeout: 15000 });
  const hist = await p.$$eval("#ac-hist tbody tr", (r) => r.map((x) => x.textContent));
  ok(hist.length >= 4 && hist.some((h) => /spicehub\.test.*pro/.test(h)) && hist.some((h) => /refunded/i.test(h)), "history lists every X-Ray with its level (" + hist.length + ")");
  await p.waitForFunction(() => /\+80/.test((document.getElementById("ac-ledger") || {}).textContent || ""), null, { timeout: 15000 }).catch(() => {});
  const led = await p.textContent("#ac-ledger"); ok(/\+80/.test(led) && /Refund/.test(led), "credit activity shows +80 for Pro and the refund");

  /* ---------- agency: white-label PDF, clients, bulk ---------- */
  await ctx.close(); ctx = await newCtx(b); p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(BASE + "/account/"); await p.waitForTimeout(300);
  const tl = await p.evaluate(() => fetch("/api/account/test-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "boss@agency.test", plan: "agency" }) }).then((r) => r.json()));
  ok(tl.ok && tl.user.plan === "agency", "test-login (test mode only) as an Agency owner");
  await p.reload(); await p.waitForSelector("#ac-brf");
  await p.evaluate(() => new Promise((res) => { const c = document.createElement("canvas"); c.width = 120; c.height = 40; const x = c.getContext("2d"); x.fillStyle = "#123456"; x.fillRect(0, 0, 120, 40); c.toBlob((bl) => { const dt = new DataTransfer(); dt.items.add(new File([bl], "logo.png", { type: "image/png" })); document.getElementById("ac-bl").files = dt.files; res(); }, "image/png"); }));
  await p.fill("#ac-bn", "Acme Digital"); await p.click("#ac-brf .btn");
  await p.waitForFunction(() => /Branding saved/.test(document.getElementById("ac-status").textContent), null, { timeout: 15000 });
  await p.fill("#ac-cl", "Flow Client"); await p.click("#ac-clf .btn"); await p.waitForFunction(() => /Flow Client/.test(document.getElementById("ac-clients").textContent), null, { timeout: 10000 });
  await p.fill("#ac-tm", "intern@agency.test"); await p.click("#ac-teamf .btn"); await p.waitForFunction(() => /intern@agency\.test/.test(document.getElementById("ac-team").textContent), null, { timeout: 10000 });
  ok(true, "agency: logo, client folder and team member saved");
  await p.goto(BASE + "/business-x-ray/"); await p.waitForSelector("#xr-client option:nth-child(2)", { state: "attached", timeout: 15000 });
  ok(await p.$("#xr-bulk") !== null, "agency form: client folder picker + bulk X-Ray box");
  await p.selectOption("#xr-client", { label: "Flow Client" });
  x = await runX(p, "flowdesk.test", { stay: true });
  ok(x.r.tier === "agency" && /X-Ray complete/.test(x.status), "agency X-Ray complete");
  const dl2 = p.waitForEvent("download", { timeout: 20000 }); await p.click('[data-x="pdf"]'); const wl = fs.readFileSync(await (await dl2).path(), "latin1");
  ok(/\/DCTDecode/.test(wl) && /\/Im1 Do/.test(wl) && /Acme Digital/.test(wl) && !/FODO Business X-Ray/.test(wl) && !/FODO tool:/.test(wl) && /Producer \(PDF\)/.test(wl), "white-label PDF: agency logo embedded, agency name, no FODO branding");
  const cl = await p.evaluate(() => window.FODO_ACCOUNT.history({ client: document.getElementById("xr-client").value }).then((j) => j.items.length));
  ok(cl === 1, "the X-Ray is filed in the client folder");

  /* ---------- v14 owner login: everything, including FODO Edge ---------- */
  await ctx.close(); ctx = await newCtx(b); p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(BASE + "/business-x-ray/"); await p.waitForTimeout(300);
  await p.evaluate(() => fetch("/api/account/test-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "singhrajputanmol014@gmail.com" }) }));
  await p.reload(); await p.waitForTimeout(800);
  ok(/Owner · ∞/.test(await p.textContent(".acct-chip")), "owner login: header says Owner · ∞");
  x = await runX(p, "spicehub.test", { stay: true }); const O = x.r;
  ok(O.tier === "agency" && O.edge && ["fixPack", "battleCards", "roadmap90", "clientPitch"].every((k) => O.edge[k] && !O.edge[k].error), "owner X-Ray: all 4 FODO Edge tools ran");
  ok(O.edge.fixPack.pages.length && O.edge.fixPack.pages.every((pg) => /spicehub\.test/.test(pg.url)) && !O.edge.fixPack.pages.some((pg) => /privacy/.test(pg.url)), "Fix Pack: only real pages (the AI's made-up page was dropped), no legal pages");
  ok(O.edge.battleCards.cards.every((c) => O.competitors.some((k) => k.domain === c.domain)), "battle cards: only real competitors (the made-up rival was dropped)");
  ok(O.edge.roadmap90.months.length === 3 && O.edge.roadmap90.months.every((m) => m.weeks.every((w) => w.opportunities.every((id) => O.opportunities.some((o) => o.id === id)))), "roadmap: 3 months, only real opportunity ids");
  ok(await p.isVisible("#xr-edge") && !(await p.$$(".xr-lock")).length && /Copy email/.test(await p.textContent("#xr-edge")), "owner report: FODO Edge section shown, nothing locked anywhere");
  const before2 = await p.evaluate(() => window.FODO_ACCOUNT.me(true).then((u) => u.credits.total)); ok(before2 === "∞", "owner: still unlimited after the run");
  const dl3 = p.waitForEvent("download", { timeout: 20000 }); await p.click('[data-x="pdf"]'); const op = fs.readFileSync(await (await dl3).path(), "latin1");
  ok(/FODO Edge/.test(op) && /Share of Google/.test(op) && /Tracking/.test(op), "owner PDF includes FODO Edge, share of voice and tracking");

  /* ---------- v15 admin dashboard ---------- */
  await p.goto(BASE + "/admin/"); await p.waitForSelector(".ad-kpis", { timeout: 15000 });
  const kp = await p.$$eval(".ad-kpi", (k) => k.map((x) => x.textContent));
  ok(kp.length === 6 && /users/.test(kp[0]) && /X-Rays run/.test(kp[2]) && /₹3,999/.test(kp[4]), "admin overview (owner): 6 KPIs incl. revenue ₹3,999: " + kp[4].slice(0, 40));
  ok(await p.isVisible(".ad-chart") && (await p.$$(".ad-funnel li")).length === 5 && /Owner · full control/.test(await p.textContent(".ad-role")), "admin: 30-day chart, funnel, owner role");
  await p.click('a[data-tab="users"]'); await p.waitForSelector("#ad-ulist tr[data-u]");
  await p.fill("#ad-uq", "rohit@"); await p.waitForFunction(() => document.querySelectorAll("#ad-ulist tr[data-u]").length === 1, null, { timeout: 8000 });
  await p.click("#ad-ulist tr[data-u]"); await p.waitForSelector(".ad-user");
  const ut = await p.textContent("#ad-view"); ok(/rohit@example\.com/.test(ut) && /Started an X-Ray/.test(ut) && /Paid/.test(ut) && /Downloaded PDF/.test(ut), "admin user page: what Rohit used (X-Rays, PDF download, payment)");
  await p.fill("#ad-gn", "7"); await p.click("#ad-gnb"); await p.waitForSelector(".ad-toast"); await p.waitForTimeout(600);
  ok(/7 X-Rays added/.test(await p.textContent(".ad-toast")) && /Given free by FODO/.test(await p.textContent("#ad-view")), "owner gives 7 X-Rays free from the dashboard");
  await p.click("#ad-view .ad-feats input[value=\"techStack\"]", { force: true }).catch(async () => { await p.click(".ad-fx summary"); await p.check('.ad-feats input[value="techStack"]'); });
  if (!(await p.isChecked('.ad-feats input[value="techStack"]'))) { await p.click(".ad-fx summary"); await p.check('.ad-feats input[value="techStack"]'); }
  await p.click("#ad-fsave"); await p.waitForTimeout(900); ok(/features?/.test(await p.textContent("#ad-view")) && await p.isChecked('.ad-feats input[value="techStack"]'), "owner gives a single feature (tech stack) free");
  await p.click("#ad-blk"); await p.waitForSelector(".ad-dlg #ad-di"); await p.fill("#ad-di", "test block"); await p.click(".ad-dlg [data-ok]"); await p.waitForTimeout(900);
  ok(/Unblock/.test(await p.textContent("#ad-blk")) && /Blocked/.test(await p.textContent(".ad-user")), "owner blocks a user from the dashboard");
  await p.click("#ad-blk"); await p.waitForSelector(".ad-dlg [data-ok]"); await p.click(".ad-dlg [data-ok]"); await p.waitForTimeout(900); ok(/Block this user/.test(await p.textContent("#ad-blk")), "and unblocks (in-page dialog, works on phones too)");
  await p.click('a[data-tab="traffic"]'); await p.waitForSelector("#t-ch", { timeout: 15000 });
  const tv = await p.textContent("#ad-view"); ok(/visitors/.test(tv) && /What to work on/.test(tv) && (await p.$$("#t-page tbody tr")).length >= 3 && /\/business-x-ray\//.test(await p.textContent("#t-page")), "v16 traffic: visitors, pages seen in this test (incl. /business-x-ray/), what-to-work-on tips");
  ok(/X-Rays started/.test(await p.textContent("#t-ev")), "traffic: site actions (X-Ray started) counted from the page");
  const dlx = p.waitForEvent("download", { timeout: 20000 }); await p.click("#ad-txls"); const xl = await (await dlx).path(); ok(fs.statSync(xl).size > 2000 && /^PK/.test(fs.readFileSync(xl, "latin1").slice(0, 2)), "traffic Excel export downloads");
  await p.click('a[data-tab="team"]'); await p.waitForSelector("#ad-vr"); await p.fill("#ad-ve", "boss2@agency.test"); await p.selectOption("#ad-vr", "admin"); await p.click("#ad-vf button"); await p.waitForSelector(".ad-dlg [data-ok]"); await p.click(".ad-dlg [data-ok]"); await p.waitForTimeout(900);
  ok(/boss2@agency\.test/.test(await p.textContent("#ad-view")) && /Make view-only/.test(await p.textContent("#ad-view")), "owner makes another email an admin from the Team page");
  for (const t of ["xrays", "leads", "payments", "activity", "team"]) { await p.click('a[data-tab="' + t + '"]'); await p.waitForTimeout(600); }
  ok(/singhrajputanmol014@gmail\.com/.test(await p.textContent("#ad-view")) && await p.$("#ad-vf"), "team page: owners listed, owner can add viewers");
  await p.setViewportSize({ width: 390, height: 844 }); await p.click('a[data-tab="overview"]'); await p.waitForSelector(".ad-kpis");
  ok(await p.evaluate(() => getComputedStyle(document.querySelector(".ad-nav")).position === "fixed" && document.documentElement.scrollWidth <= 390), "phone: bottom tab bar, no sideways scrolling");
  await p.setViewportSize({ width: 1440, height: 950 });
  const c9 = await newCtx(b), p9 = await c9.newPage(); await p9.goto(BASE + "/admin/"); await p9.waitForTimeout(300);
  await p9.evaluate(() => fetch("/api/account/test-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "random.customer@gmail.com" }) })); await p9.reload(); await p9.waitForSelector(".ad-gate");
  ok(/only for the FODO team/.test(await p9.textContent(".ad-gate")) && !(await p9.$(".ad-kpis")), "a normal customer login sees no admin data");
  await c9.close();

  /* ---------- hygiene ---------- */
  const leak = SECRETS.filter((s) => bodies.some((t) => t.indexOf(s) > -1));
  ok(!leak.length, "no secret ever reaches the browser (" + bodies.length + " responses scanned)" + (leak.length ? ": " + leak : ""));
  ok(!errs.length, "no page errors" + (errs[0] ? ": " + errs[0] : ""));
  await ctx.close(); await b.close(); stop(); sh("bash", ["-c", "pkill -f '[x]ray-fixtures/server.js'; true"]);
  console.log(`\nv13 accounts e2e: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); stop(); process.exit(1); });
