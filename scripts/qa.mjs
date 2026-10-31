// FODO Website Engineer — QA (v27). Runs in GitHub Actions (.github/workflows/fodo-engineer.yml).
//   MODE=pr       a FODO Brain pull request (branch brain/*): syntax of every changed file, local links/assets, generated pages agree
//                 with scripts/build_pages.py, the fast test suites, then the Cloudflare PREVIEW in a real browser at 8 screen sizes
//                 (overflow, JS errors, failed requests, broken images, accessibility basics), compared with production so old
//                 problems don't block a change, plus before/after screenshots. Report → POST /api/owner-brain/eng/qa.
//   MODE=inspect  one live URL at 8 screen sizes (screenshots + issues) for Engineer → Inspect.
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
const E = process.env, MODE = E.MODE || "pr", SITE = (E.SITE || "https://www.fodo.co.in").replace(/\/$/, ""), KEY = E.KEY;
const BPS = [320, 375, 390, 414, 768, 1024, 1280, 1440], SHOT_BPS = [375, 768, 1280, 1440];
const checks = [], issues = [], shots = []; const add = (name, ok, detail, file) => { checks.push({ name, ok: !!ok, detail: String(detail || "").slice(0, 600), file: file || null }); console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " — " + String(detail).slice(0, 300) : "")); };
const sh = (c) => execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64e6 });
async function post(body) {
  if (!KEY) { console.log("FODO_CRON_KEY not set — report not sent."); writeFileSync("qa-report.json", JSON.stringify(body, null, 1)); return; }
  const r = await fetch(SITE + "/api/owner-brain/eng/qa", { method: "POST", headers: { "content-type": "application/json", "x-cron-key": KEY }, body: JSON.stringify(body) });
  console.log("report → Brain:", r.status, (await r.text()).slice(0, 300));
}
const run = E.GITHUB_SERVER_URL && E.GITHUB_REPOSITORY && E.GITHUB_RUN_ID ? E.GITHUB_SERVER_URL + "/" + E.GITHUB_REPOSITORY + "/actions/runs/" + E.GITHUB_RUN_ID : "";

/* ---------- static checks (pull request only) ---------- */
function staticChecks(changed) {
  const acorn = globalThis.__acorn || null;   // loaded in main (npm i acorn in the workflow)
  const js = changed.filter((p) => /\.(js|mjs)$/.test(p) && existsSync(p));
  let synOk = true;
  for (const p of js) {
    const src = readFileSync(p, "utf8"), module = /^functions\/|^runner\/src\/|\.mjs$|^scripts\/.*\.mjs$/.test(p) || /^\s*(import|export)\s/m.test(src);
    try { if (acorn) acorn.parse(src, { ecmaVersion: "latest", sourceType: module ? "module" : "script", allowHashBang: true }); else new Function(src); }
    catch (e) { synOk = false; add("JavaScript syntax", false, p + ": " + e.message, p); }
  }
  if (js.length && synOk) add("JavaScript syntax", true, js.length + " file(s)");
  for (const p of changed.filter((p) => /\.json$/.test(p) && existsSync(p))) { try { JSON.parse(readFileSync(p, "utf8")); } catch (e) { add("JSON", false, p + ": " + e.message, p); } }
  if (changed.some((p) => /\.py$/.test(p))) { try { sh("python3 -m py_compile " + changed.filter((p) => /\.py$/.test(p) && existsSync(p)).join(" ")); add("Python syntax", true); } catch (e) { add("Python syntax", false, (e.stderr || e.message).slice(-500), changed.find((p) => /\.py$/.test(p))); } }
  // CSS: balanced braces is the cheap structural check that catches most broken edits
  for (const p of changed.filter((p) => /\.css$/.test(p) && existsSync(p))) { const s = readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/"[^"]*"|'[^']*'/g, ""); const o = (s.match(/\{/g) || []).length, c = (s.match(/\}/g) || []).length; add("CSS structure", o === c, o === c ? p : p + ": " + o + " '{' vs " + c + " '}'", p); }
  // HTML: local links and assets exist, one <h1>, <title>, alt on images
  const html = changed.filter((p) => /\.html$/.test(p) && existsSync(p)); let missing = [];
  for (const p of html) {
    const h = readFileSync(p, "utf8"), dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/") + 1) : "";
    for (const m of h.matchAll(/(?:href|src)=["']([^"'#]+)["']/g)) {
      let u = m[1].split("?")[0]; if (/^(https?:|mailto:|tel:|data:|javascript:|\/\/|\$\{|\{)/.test(u) || !u || u.includes("${")) continue;
      let f = u.startsWith("/") ? u.slice(1) : (dir + u).replace(/[^/]+\/\.\.\//g, "").replace(/\.\//g, ""); if (f.endsWith("/") && f.length > 1 && existsSync(f.slice(0, -1)) && !existsSync(f + "index.html") && /^(js|css|assets)\//.test(f)) continue; if (f === "" || f.endsWith("/")) f += "index.html";
      if (/^api\//.test(f)) continue; if (!existsSync(f) && !existsSync(f + "/index.html") && !existsSync(f + ".html")) missing.push(p + " → " + u);
    }
    const h1 = (h.match(/<h1[\s>]/gi) || []).length; if (h1 !== 1 && !/noindex/.test(h)) issues.push(p + ": " + h1 + " <h1> tags (should be 1)");
    if (!/<title>[^<]{5,}<\/title>/i.test(h)) issues.push(p + ": missing <title>");
    const noAlt = (h.match(/<img(?![^>]*\balt=)[^>]*>/gi) || []).length; if (noAlt) issues.push(p + ": " + noAlt + " image(s) without alt text");
  }
  if (html.length) add("Links and assets", !missing.length, missing.length ? missing.slice(0, 12).join("; ") : html.length + " page(s)", missing.length ? missing[0].split(" → ")[0] : null);
  // generated pages must agree with the generator (the next build would undo a page-only edit)
  if (changed.some((p) => /\.html$/.test(p) || p === "scripts/build_pages.py") && existsSync("scripts/build_pages.py")) {
    const norm = (s) => s.replace(/\?v=\d+c?/g, "?v=X").replace(/__V__|\d{10}/g, "X");
    const before = {}; const list = sh("git ls-files '*.html'").split("\n").filter(Boolean); list.forEach((p) => { before[p] = norm(readFileSync(p, "utf8")); });
    try { sh("python3 scripts/build_pages.py"); const diff = list.filter((p) => existsSync(p) && norm(readFileSync(p, "utf8")) !== before[p]);
      add("Pages match the generator", !diff.length, diff.length ? "scripts/build_pages.py would change " + diff.length + " page(s) (" + diff.slice(0, 6).join(", ") + ") — the edit must be made in the generator too" : "scripts/build_pages.py regenerates the same pages", diff.length ? "scripts/build_pages.py" : null); }
    catch (e) { add("Pages match the generator", false, "scripts/build_pages.py failed: " + (e.stderr || e.message).slice(-400), "scripts/build_pages.py"); }
    try { sh("git checkout -- . && git clean -fdq -- '*.html'"); } catch (e) {}
  }
  // the fast test suites (Node 22 + node:sqlite mocks, no network)
  const suites = ["tests/v13-plans.test.mjs", "tests/accounts-functions.test.mjs", "tests/v21-brain.test.mjs", "tests/v22-brain.test.mjs", "tests/v23-brain.test.mjs", "tests/v26-live.test.mjs", "tests/v27-engineer.test.mjs"].filter((p) => existsSync(p));
  for (const t of suites) { try { const o = sh("node --no-warnings " + t + " 2>&1"); add("Tests: " + t.replace(/^tests\//, ""), true, (o.trim().split("\n").pop() || "").slice(0, 120)); }
    catch (e) { const o = String(e.stdout || "") + String(e.stderr || ""); add("Tests: " + t.replace(/^tests\//, ""), false, o.split("\n").filter((l) => /FAIL|Error|at /.test(l)).slice(0, 8).join(" | ").slice(0, 600)); } }
}

/* ---------- the Cloudflare preview for this commit ---------- */
async function previewUrl() {
  if (E.PREVIEW_URL) return { url: E.PREVIEW_URL.replace(/\/$/, "") };   // local runs / manual re-checks
  const R = E.GITHUB_REPOSITORY, sha = E.SHA, tok = E.GH_TOKEN, proj = E.PAGES_PROJECT || "fodo-website";
  const alias = "https://" + String(E.BRANCH).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28).replace(/-$/, "") + "." + proj + ".pages.dev";
  const t0 = Date.now();
  while (Date.now() - t0 < 9 * 60e3) {
    if (tok && R && sha) {   // Cloudflare Pages reports its deployment on the commit (check run / status) with the exact URL
      try { const H = { authorization: "Bearer " + tok, accept: "application/vnd.github+json" };
        const cr = await (await fetch("https://api.github.com/repos/" + R + "/commits/" + sha + "/check-runs?per_page=50", { headers: H })).json();
        for (const c of cr.check_runs || []) { if (!/cloudflare|pages/i.test(c.name + " " + ((c.app || {}).slug || ""))) continue; if (c.conclusion === "failure") return { error: "Cloudflare Pages build failed: " + ((c.output || {}).title || "") }; const m = /https:\/\/[a-z0-9]+\.[a-z0-9-]+\.pages\.dev/i.exec(JSON.stringify(c.output || {})); if (c.status === "completed" && m) return { url: m[0] }; }
        const st = await (await fetch("https://api.github.com/repos/" + R + "/commits/" + sha + "/statuses", { headers: H })).json();
        for (const s of st || []) { if (/pages\.dev/.test(s.target_url || "") && s.state === "success") return { url: String(s.target_url).replace(/\/$/, "") }; if (/cloudflare/i.test(s.context || "") && s.state === "failure") return { error: "Cloudflare Pages build failed" }; }
      } catch (e) {}
    }
    if (Date.now() - t0 > 4 * 60e3) { try { const r = await fetch(alias + "/", { redirect: "manual" }); if (r.status === 200) return { url: alias, alias: true }; } catch (e) {} }
    await new Promise((r) => setTimeout(r, 15000));
  }
  return { error: "The Cloudflare preview didn't appear within 9 minutes (is PAGES_PROJECT right and the Pages Git integration on?)" };
}

/* ---------- browser checks ---------- */
async function visual(base, routes, prod) {
  const { chromium } = await import("playwright"); const b = await chromium.launch();
  const result = {};
  for (const route of routes) {
    for (const target of prod ? [["after", base], ["before", prod]] : [["after", base]]) {
      const [kind, origin] = target;
      for (const w of BPS) {
        const ctx = await b.newContext({ viewport: { width: w, height: w < 600 ? 780 : 900 }, deviceScaleFactor: 1, isMobile: w < 600, hasTouch: w < 900 }), p = await ctx.newPage();
        const errs = [], fails = [];
        p.on("pageerror", (e) => errs.push(String(e.message || e).slice(0, 200))); p.on("console", (m) => { if (m.type() === "error" && !/favicon|cloudflareinsights|beacon/i.test(m.text())) errs.push(m.text().slice(0, 200)); });
        p.on("response", (r) => { const u = r.url(); if (u.startsWith(origin) && r.status() >= 400 && !/\/api\//.test(u)) fails.push(r.status() + " " + u.replace(origin, "")); });
        try { await p.goto(origin + route, { waitUntil: "networkidle", timeout: 45000 }); } catch (e) { errs.push("load: " + e.message.slice(0, 160)); }
        await p.waitForTimeout(600);
        const info = await p.evaluate(() => ({ over: document.documentElement.scrollWidth - window.innerWidth, broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith("data:")).map((i) => i.getAttribute("src")).slice(0, 5),
          noAlt: [...document.images].filter((i) => !i.hasAttribute("alt")).length, unnamed: [...document.querySelectorAll("button, a[href]")].filter((x) => !(x.innerText || "").trim() && !x.getAttribute("aria-label") && !x.querySelector("img[alt]") && !x.title).length,
          h1: document.querySelectorAll("h1").length, lang: document.documentElement.lang, unlabeled: [...document.querySelectorAll("input:not([type=hidden]):not([type=submit]), select, textarea")].filter((x) => !(x.labels && x.labels.length) && !x.getAttribute("aria-label") && !x.placeholder).length })).catch(() => ({ over: 0, broken: [] }));
        (result[route] = result[route] || {})[kind + w] = { errs, fails, info };
        if (SHOT_BPS.indexOf(w) > -1 && route === routes[0] && (kind === "after" || w === 375 || w === 1280)) { const buf = await p.screenshot({ type: "jpeg", quality: 55, fullPage: false }); shots.push({ bp: w, kind, route, b64: buf.toString("base64") }); }
        await ctx.close();
      }
    }
  }
  await b.close();
  for (const route of routes) {
    const R = result[route], A = (w) => R["after" + w], B = (w) => R["before" + w];
    const newer = (list, old) => list.filter((x) => !(old || []).some((y) => y.replace(/\d+/g, "") === x.replace(/\d+/g, "")));
    const ov = BPS.filter((w) => A(w).info.over > 1 && !(B(w) && B(w).info.over > 1)); add("No horizontal overflow " + route, !ov.length, ov.length ? "page is wider than the screen at " + ov.join(", ") + "px" : "8 sizes, 320–1440px");
    const errs = [...new Set(BPS.flatMap((w) => newer(A(w).errs, B(w) && B(w).errs)))]; add("No JavaScript errors " + route, !errs.length, errs.slice(0, 5).join(" | "));
    const fails = [...new Set(BPS.flatMap((w) => newer(A(w).fails, B(w) && B(w).fails)))]; add("No failed requests " + route, !fails.length, fails.slice(0, 6).join(" | "));
    const broken = [...new Set(BPS.flatMap((w) => A(w).info.broken || []))]; add("No broken images " + route, !broken.length, broken.join(", "));
    const a = A(1280).info; if (a.h1 !== 1) issues.push(route + ": " + a.h1 + " <h1> on the page"); if (!a.lang) issues.push(route + ": <html> has no lang"); if (a.noAlt) issues.push(route + ": " + a.noAlt + " image(s) without alt"); if (a.unnamed) issues.push(route + ": " + a.unnamed + " button/link(s) without an accessible name"); if (a.unlabeled) issues.push(route + ": " + a.unlabeled + " form field(s) without a label");
  }
}

/* ---------- Web Operator: run the Brain's browser steps and compare EXPECTED with ACTUAL ---------- */
async function operateRun(startUrl, steps) {
  const { chromium } = await import("playwright"); const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 1280, height: 860 } }), p = await ctx.newPage();
  const errs = [], apis = []; p.on("pageerror", (e) => errs.push(String(e.message || e).slice(0, 200))); p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  p.on("response", (r) => { const u = r.url(); if (/\/api\//.test(u) && r.status() >= 400) apis.push(r.status() + " " + u.replace(/^https?:\/\/[^/]+/, "")); });
  const loc = (t) => { t = String(t || ""); if (/^css=/.test(t)) return p.locator(t.slice(4)).first(); return p.getByRole("button", { name: t }).or(p.getByRole("link", { name: t })).or(p.getByLabel(t)).or(p.getByPlaceholder(t)).or(p.getByText(t, { exact: false })).first(); };
  let n = 0;
  for (const st of steps.slice(0, 20)) {
    n++; const name = "Step " + n + ": " + (st.say || st.do + " " + (st.target || st.value || "")), before = errs.length, beforeApi = apis.length; let ok = true, detail = "";
    try {
      if (st.do === "goto") { const u = new URL(st.value || st.target, startUrl); if (u.origin !== new URL(startUrl).origin && !/fodo\.co\.in$|pages\.dev$/.test(u.hostname)) throw new Error("left the allowed site"); const r = await p.goto(u.href, { waitUntil: "networkidle", timeout: 45000 }); detail = "HTTP " + (r ? r.status() : "?"); ok = !r || r.status() < 400; }
      else if (st.do === "click") { await loc(st.target).click({ timeout: 12000 }); await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {}); detail = "clicked “" + st.target + "”"; }
      else if (st.do === "fill") { await loc(st.target).fill(st.value, { timeout: 12000 }); detail = "typed into “" + st.target + "”"; }
      else if (st.do === "select") { await loc(st.target).selectOption({ label: st.value }, { timeout: 12000 }).catch(() => loc(st.target).selectOption(st.value)); detail = "chose " + st.value; }
      else if (st.do === "press") { await p.keyboard.press(st.value || "Enter"); detail = "pressed " + (st.value || "Enter"); }
      else if (st.do === "wait") { const ms = Math.min(60000, +st.value || 0); if (ms) await p.waitForTimeout(ms); else await loc(st.target).waitFor({ timeout: 60000 }); detail = ms ? "waited " + ms + " ms" : "“" + st.target + "” appeared"; }
      else if (st.do === "expect") { const want = st.value || st.target; await p.waitForFunction((w) => document.body.innerText.toLowerCase().indexOf(w.toLowerCase()) > -1, want, { timeout: 30000 }).then(() => { detail = "EXPECTED “" + want + "” · ACTUAL: found on the page"; }, async () => { ok = false; detail = "EXPECTED “" + want + "” · ACTUAL: not on the page. The page says: “" + (await p.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 220))) + "…”"; }); }
      else if (st.do === "shot") detail = "screenshot";
    } catch (e) { ok = false; detail = String(e.message || e).split("\n")[0].slice(0, 300); }
    const newErr = errs.slice(before), newApi = apis.slice(beforeApi);
    if (newApi.length) { ok = false; detail += " · API failed: " + newApi.slice(0, 3).join(", "); }
    if (newErr.length) detail += " · JS errors: " + newErr.slice(0, 2).join(" | ");
    add(name, ok, detail);
    if (shots.length < 12 && (st.do !== "fill" || n === steps.length)) shots.push({ bp: 1280, kind: "after", route: "step " + n, b64: (await p.screenshot({ type: "jpeg", quality: 50 })).toString("base64") });
    if (!ok && st.do !== "expect") break;   // later steps depend on this one
  }
  await b.close();
}
/* ---------- main ---------- */
try {
  if (MODE === "operate") {
    const u = new URL(E.URL || SITE + "/"); if (!/(^|\.)fodo\.co\.in$|pages\.dev$/.test(u.hostname) && !E.ALLOW_HOST && !(E.QA_LOCAL && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) throw new Error("Not an allowed website.");
    let steps = []; try { steps = JSON.parse(E.STEPS || "[]"); } catch (e) {}
    await operateRun(u.href, steps);
    await post({ change: E.CHANGE, status: checks.every((c) => c.ok) ? "passed" : "failed", url: u.href, checks, issues, shots, run });
  } else   if (MODE === "inspect") {
    const u = new URL(E.URL || SITE + "/"); if (!/(^|\.)fodo\.co\.in$|pages\.dev$/.test(u.hostname) && !(E.QA_LOCAL && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) throw new Error("Only FODO pages can be inspected.");
    await visual(u.origin, [u.pathname + u.search], null);
    await post({ change: E.CHANGE, status: checks.every((c) => c.ok) ? "passed" : "failed", url: u.href, checks, issues, shots, run });
  } else {
    try { globalThis.__acorn = await import("acorn"); } catch (e) {}
    const changed = sh("git diff --name-only origin/" + (E.BASE || "main") + "...HEAD").split("\n").filter(Boolean);
    console.log("changed:", changed.join(", "));
    staticChecks(changed);
    const routes = ((/fodo-routes:\s*([^\s>]+)/.exec(E.PR_BODY || "") || [])[1] || "").split(",").filter((r) => /^\/[\w\-\/.]*$/.test(r)).slice(0, 3);
    const auto = changed.filter((p) => /index\.html$/.test(p) && !/^(admin|owner-brain|tests|docs)\//.test(p)).map((p) => "/" + p.replace(/index\.html$/, "")).slice(0, 3);
    const rs = [...new Set((routes.length ? routes : auto.length ? auto : ["/"]))];
    const pv = await previewUrl();
    if (pv.error) add("Cloudflare preview", false, pv.error); else { add("Cloudflare preview", true, pv.url); await visual(pv.url, rs, SITE); }
    await post({ branch: E.BRANCH, sha: E.SHA, status: checks.every((c) => c.ok) ? "passed" : "failed", url: pv.url || "", checks, issues, shots, run });
    if (!checks.every((c) => c.ok)) process.exitCode = 1;
  }
} catch (e) {
  console.error(e); await post({ branch: E.BRANCH, sha: E.SHA, change: E.CHANGE, status: "error", checks: checks.concat([{ name: "QA run", ok: false, detail: String(e.message || e).slice(0, 400) }]), issues, shots, run }); process.exitCode = 1;
}
