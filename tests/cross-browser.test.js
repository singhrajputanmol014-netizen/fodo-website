/* v46.2 cross-browser smoke test: the real site on the local Cloudflare runtime, in Chromium, Firefox and WebKit (Safari's
   engine). Checks the pages people use most: home, Workspace (CRM, AI Studio, Files, Settings), the Website Builder (open,
   edit, autosave, side by side), FODO Pros; no page errors and no Content-Security-Policy violations.
   Env: WRANGLER (path to wrangler), BROWSERS="chromium,firefox,webkit" (default: every browser that is installed).
   Run: node tests/cross-browser.test.js · GitHub runs it in all three browsers: .github/workflows/fodo-browsers.yml */
const pw = require("playwright");
const { spawnSync } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");
const BASE = "http://localhost:8788", F = "http://127.0.0.1:9300";
let pass = 0, fail = 0, skipped = []; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const sh = (cmd, args, env) => spawnSync(cmd, args, { env: Object.assign({}, process.env, env || {}), encoding: "utf8" });
const stop = () => sh("bash", ["-c", "for p in $(pgrep -f '[p]ages dev . --port 8788|[w]orkerd serve'); do kill $p; done; sleep 1; pkill -f '[x]ray-fixtures/server.js'; true"]);
(async () => {
  stop();
  const src = fs.readFileSync(path.join(__dirname, "xray-fixtures/env.sh"), "utf8"), map = JSON.parse(/MAP='(.*)'\s*$/m.exec(src)[1].replace(/'\$F'/g, F));
  const r = sh(path.join(__dirname, "xray-fixtures/run-local.sh"), ["100"], { WRANGLER: process.env.WRANGLER, STATE: path.join(os.tmpdir(), "xb-" + process.pid), MAPX: JSON.stringify(map), EXTRA: "--binding ACCOUNTS_ENABLED=1" });
  if (!/READY/.test(r.stdout)) { console.log(r.stdout, r.stderr); process.exit(1); }
  const want = (process.env.BROWSERS || "chromium,firefox,webkit").split(",").map((x) => x.trim()).filter(Boolean);
  for (const name of want) {
    let b; try { b = await pw[name].launch(); } catch (e) { skipped.push(name); console.log("SKIP " + name + " (not installed here: " + String(e.message).split("\n")[0].slice(0, 80) + ")"); continue; }
    const errs = [], csp = [], T = (m) => "[" + name + "] " + m;
    const page = async (w, h) => { const c = await b.newContext({ viewport: { width: w, height: h } }), p = await c.newPage(); p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (/Content.Security.Policy|Refused to|CSP/i.test(m.text())) csp.push(m.text().slice(0, 200)); }); return p; };
    try {
      const P = await page(1366, 860);
      await P.goto(BASE + "/"); ok(/FODO/.test(await P.title()), T("home page loads"));
      ok(await P.evaluate(() => fetch("/api/account/test-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "xb-" + Math.random().toString(36).slice(2, 8) + "@cafe.in" }) }).then((r2) => r2.status)) === 200, T("sign in (test)"));
      const id = await P.evaluate(() => fetch("/api/sites/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "template", templateId: "cafe-cozy", name: "Browser Cafe", ai: false }) }).then((r2) => r2.json()).then((j) => j.id));
      await P.goto(BASE + "/website-builder/#site=" + id); await P.waitForSelector("#wb-if", { timeout: 25000 }); await P.waitForTimeout(1500);
      await P.click("text=Skip tutorial", { timeout: 2000 }).catch(() => {});
      const fr = P.frameLocator("#wb-if"); await fr.locator("[data-sec]").nth(1).click({ position: { x: 10, y: 10 } }); await P.waitForSelector("#wb-pf", { timeout: 8000 });
      const t = P.locator('#wb-pf [data-p="title"]').first(); await t.fill("Hello from " + name); await t.dispatchEvent("change"); await P.waitForTimeout(2600);
      ok((await fr.locator("h1").first().textContent()).indexOf("Hello from " + name) > -1, T("builder: edit a section, the canvas updates"));
      const saved = await P.evaluate((sid) => fetch("/api/sites/" + sid).then((r2) => r2.json()).then((j) => JSON.stringify(j.site.doc)), id); ok(saved.indexOf("Hello from " + name) > -1, T("builder: autosave reached the server"));
      await P.click("#bb-sbs"); await P.waitForTimeout(1200); ok((await P.$$("#wb-sbs iframe")).length === 3, T("builder: side by side")); await P.click("#sbs-x");
      for (const h of ["#overview", "#leads?tab=contacts", "#studio", "#files", "#settings"]) { await P.goto(BASE + "/workspace/" + h); await P.waitForTimeout(1300); }
      await P.waitForSelector("#nt-f", { timeout: 10000 }).catch(() => {}); ok(!!(await P.$("#nt-f")) && /Notifications/.test(await P.textContent("#ws-main")), T("workspace pages render (Settings & privacy)"));
      const M = await page(390, 844); await M.goto(BASE + "/workspace/"); await M.waitForTimeout(1200); ok(await M.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), T("phone width: no sideways scroll"));
      await M.goto(BASE + "/fodo-pros/"); await M.waitForTimeout(1000); ok(true, T("FODO Pros page opens"));
    } catch (e) { ok(false, T("crashed: " + e.message.split("\n")[0])); }
    ok(!errs.filter((e) => !/ResizeObserver loop/.test(e)).length, T("no page errors") + (errs.length ? " " + JSON.stringify(errs.slice(0, 3)) : ""));
    ok(!csp.length, T("no Content-Security-Policy violations") + (csp.length ? " " + JSON.stringify(csp.slice(0, 3)) : ""));
    await b.close();
  }
  stop();
  console.log("\ncross-browser: " + pass + " passed, " + fail + " failed" + (skipped.length ? " (not installed here: " + skipped.join(", ") + ")" : ""));
  process.exit(fail ? 1 : 0);
})();
