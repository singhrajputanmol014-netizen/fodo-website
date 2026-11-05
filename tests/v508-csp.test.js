/* v50.8 (security audit S6): the public site ENFORCES a Content-Security-Policy without 'unsafe-inline' for scripts.
   Static part: every generated public page carries the meta policy, has no inline <script> (JSON-LD data blocks excepted) and
   no inline event handler. Runtime part: every public route opens on the local Cloudflare runtime with zero policy violations,
   zero page errors, the theme set before paint (js/boot.js) and the chatbot button added (js/boot-tail.js).
   Env: WRANGLER, BROWSERS (default chromium). Run: node tests/v508-csp.test.js */
const pw = require("playwright");
const { spawnSync } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");
const ROOT = path.join(__dirname, ".."), BASE = "http://localhost:8788", F = "http://127.0.0.1:9300";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const sh = (cmd, args, env) => spawnSync(cmd, args, { env: Object.assign({}, process.env, env || {}), encoding: "utf8" });
const stop = () => sh("bash", ["-c", "for p in $(pgrep -f '[p]ages dev . --port 8788|[w]orkerd serve'); do kill $p; done; sleep 1; pkill -f '[x]ray-fixtures/server.js'; true"]);
const APP = ["admin", "workspace", "fodo-pros", "website-builder", "owner-brain", "tests", "node_modules", "functions", "sites", ".wrangler", "templates/_"];
function pages(dir, out) { for (const n of fs.readdirSync(dir)) { const f = path.join(dir, n), rel = path.relative(ROOT, f); if (APP.some((a) => rel === a || rel.indexOf(a + path.sep) === 0)) continue; const st = fs.statSync(f); if (st.isDirectory()) pages(f, out); else if (n.endsWith(".html")) out.push(rel); } return out; }

(async () => {
  /* ---------- static ---------- */
  const list = pages(ROOT, []); let missing = [], inline = [], handlers = [], unsafe = [];
  for (const rel of list) { const s = fs.readFileSync(path.join(ROOT, rel), "utf8"); const m = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(s);
    if (!m) missing.push(rel); else if (/script-src[^;]*'unsafe-inline'/.test(m[1])) unsafe.push(rel);
    for (const x of s.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)) if (!/json/.test(x[1]) && x[2].trim()) inline.push(rel);
    if (/<[a-z][^>]*\son[a-z]+\s*=\s*["']/i.test(s)) handlers.push(rel); }
  ok(list.length >= 100, "static: " + list.length + " public pages found");
  ok(!missing.length, "static: every public page carries the enforced meta policy" + (missing.length ? " (missing: " + missing.slice(0, 5).join(", ") + ")" : ""));
  ok(!unsafe.length, "static: no page allows 'unsafe-inline' scripts");
  ok(!inline.length, "static: no inline <script> on public pages" + (inline.length ? " (" + [...new Set(inline)].slice(0, 5).join(", ") + ")" : ""));
  ok(!handlers.length, "static: no inline event handlers on public pages" + (handlers.length ? " (" + handlers.slice(0, 5).join(", ") + ")" : ""));
  { const pol = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, "competitor-finder/index.html"), "utf8"))[1], cs = ((/connect-src ([^;]+)/.exec(pol) || [])[1] || "").split(/\s+/), hosts = new Set();
    for (const f of fs.readdirSync(path.join(ROOT, "js")).filter((n) => n.endsWith(".js") && !/^(ws-|workspace|wb-|ob-|owner|admin)/.test(n))) { const t = fs.readFileSync(path.join(ROOT, "js", f), "utf8"); for (const m of t.matchAll(/(?:fetch|fetchT)\(\s*["'`]https:\/\/([^\/"'`?]+)/g)) hosts.add(m[1]); for (const m of t.matchAll(/OVERPASS\s*=\s*\[([^\]]+)\]/g)) for (const u of m[1].matchAll(/https:\/\/([^\/"]+)/g)) hosts.add(u[1]); }
    const miss = [...hosts].filter((h) => cs.indexOf("https://" + h) < 0 && !cs.some((x) => x.indexOf("https://*.") === 0 && h.endsWith(x.slice(9))));
    ok(hosts.size >= 5 && !miss.length, "static: every outside host the public scripts fetch from (" + hosts.size + ") is allowed in connect-src" + (miss.length ? " (missing: " + miss.join(", ") + ")" : "")); }
  const hdr = fs.readFileSync(path.join(ROOT, "_headers"), "utf8"); ok(/^\/\*\n\s+Content-Security-Policy-Report-Only:[^\n]*report-uri \/api\/csp-report/m.test(hdr), "static: the report-only header stays, so violations are still reported");

  /* ---------- runtime ---------- */
  stop();
  const src = fs.readFileSync(path.join(__dirname, "xray-fixtures/env.sh"), "utf8"), map = JSON.parse(/MAP='(.*)'\s*$/m.exec(src)[1].replace(/'\$F'/g, F));
  const r = sh(path.join(__dirname, "xray-fixtures/run-local.sh"), ["100"], { WRANGLER: process.env.WRANGLER, STATE: path.join(os.tmpdir(), "csp-" + process.pid), MAPX: JSON.stringify(map), EXTRA: "--binding ACCOUNTS_ENABLED=1" });
  if (!/READY/.test(r.stdout)) { console.log(r.stdout, r.stderr); process.exit(1); }
  const want = (process.env.BROWSERS || "chromium").split(",").map((x) => x.trim()).filter(Boolean), skipped = [];
  for (const name of want) {
    let b; try { b = await pw[name].launch(); } catch (e) { skipped.push(name); console.log("SKIP " + name + " (not installed here)"); continue; }
    const c = await b.newContext({ viewport: { width: 1280, height: 800 } }); await c.addInitScript(() => { window.__cspv = []; document.addEventListener("securitypolicyviolation", (e) => window.__cspv.push(e.violatedDirective + " " + (e.blockedURI || "inline") + " @" + (e.sourceFile || "").split("/").pop() + ":" + e.lineNumber)); });
    const p = await c.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message));
    const routes = list.map((rel) => "/" + rel.replace(/\\/g, "/").replace(/index\.html$/, "")), bad = [], noTheme = [], noBot = [];
    for (const u of routes) { errs.length = 0; await p.goto(BASE + u, { waitUntil: "load" }).catch(() => {}); await p.waitForTimeout(250);
      const st = await p.evaluate(() => ({ v: (window.__cspv || []).concat(Array.isArray(window.L) || "want" in window || "P" in window ? ["boot script leaked a global (L / P / want)"] : []), theme: document.documentElement.getAttribute("data-theme"), bot: !!document.querySelector(".bot-fab") })).catch(() => ({ v: ["(page did not open)"], theme: null, bot: false }));
      if (st.v.length || errs.filter((e) => !/ResizeObserver loop/.test(e)).length) bad.push(u + " " + JSON.stringify(st.v.concat(errs).slice(0, 3)));
      if (!st.theme) noTheme.push(u); if (!st.bot) noBot.push(u); }
    ok(!bad.length, "[" + name + "] " + routes.length + " public routes: no CSP violations, no page errors" + (bad.length ? ": " + bad.slice(0, 4).join(" | ") : ""));
    ok(!noTheme.length, "[" + name + "] theme is set before paint on every page (js/boot.js)" + (noTheme.length ? ": " + noTheme.slice(0, 5).join(", ") : ""));
    ok(!noBot.length, "[" + name + "] the Ask FODO button appears on every page (js/boot-tail.js)" + (noBot.length ? ": " + noBot.slice(0, 5).join(", ") : ""));
    /* the pages that had their own inline script */
    await p.goto(BASE + "/thank-you/?state=sent"); await p.waitForTimeout(600); ok(/Request received/.test(await p.textContent("#ty-h")), "[" + name + "] thank-you text set by js/page-thanks.js");
    await p.goto(BASE + "/roi-calculator/"); await p.waitForTimeout(500); const before = p.url(); await p.evaluate(() => document.getElementById("roi-form").dispatchEvent(new Event("submit", { cancelable: true }))); await p.waitForTimeout(300); ok(p.url() === before, "[" + name + "] ROI form does not submit (listener instead of inline onsubmit)");
    const rep = p.waitForRequest((q) => /\/api\/csp-report/.test(q.url()) && q.method() === "POST", { timeout: 4000 }).catch(() => null);
    const injected = await p.evaluate(() => { const s = document.createElement("script"); s.textContent = "window.__pwned=1"; document.body.appendChild(s); return !!window.__pwned; }); ok(!injected, "[" + name + "] an injected inline script does not run (policy enforced)");
    const rq = await rep; ok(!!rq && /script-src/.test(rq.postData() || ""), "[" + name + "] the blocked script is reported to /api/csp-report");
    await p.goto(BASE + "/?intro=1"); await p.waitForTimeout(2800); ok(!(await p.evaluate(() => document.documentElement.classList.contains("intro"))) && !(await p.$(".fodo-intro")), "[" + name + "] opening animation runs and cleans up (js/boot-intro.js)");
    await b.close();
  }
  stop();
  console.log("\nv508-csp: " + pass + " passed, " + fail + " failed" + (skipped.length ? " (not installed here: " + skipped.join(", ") + ")" : ""));
  process.exit(fail ? 1 : 0);
})();
