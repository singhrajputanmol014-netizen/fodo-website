/* v51: the APP pages (Workspace, FODO Pros, Admin) enforce a Content-Security-Policy without 'unsafe-inline' for scripts.
   Static: their shells carry no inline script and no inline handler; the app scripts insert no inline handlers; the header policy
   for those paths has no 'unsafe-inline' in script-src. Runtime: every Workspace view of an owner, an employee, a client and a
   FODO Pro, the Admin page and the FODO Pros page open with zero policy violations and zero page errors; an injected inline
   script does not run. The Website Builder keeps 'unsafe-inline' (srcdoc previews inherit the policy) and is checked to still
   carry it. Owner Brain was strict already (v23). Env: WRANGLER. Run: node tests/v51-csp.test.js */
const pw = require("playwright");
const { spawnSync } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");
const ROOT = path.join(__dirname, ".."), BASE = "http://localhost:8788", F = "http://127.0.0.1:9300";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const sh = (cmd, args, env) => spawnSync(cmd, args, { env: Object.assign({}, process.env, env || {}), encoding: "utf8" });
const stop = () => sh("bash", ["-c", "for p in $(pgrep -f '[p]ages dev . --port 8788|[w]orkerd serve'); do kill $p; done; sleep 1; pkill -f '[x]ray-fixtures/server.js'; true"]);

(async () => {
  /* ---------- static ---------- */
  for (const f of ["workspace/index.html", "fodo-pros/index.html", "admin/index.html", "owner-brain/index.html"]) { const s = fs.readFileSync(path.join(ROOT, f), "utf8"); const inline = [...s.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)].filter((x) => !/json/.test(x[1]) && x[2].trim()).length; ok(!inline && !/<[a-z][^>]*\son[a-z]+\s*=/i.test(s), "static: " + f + " has no inline script or handler"); }
  const hdr = fs.readFileSync(path.join(ROOT, "_headers"), "utf8"), blocks = {}; { let cur = null; for (const l of hdr.split("\n")) { if (/^\S/.test(l)) { cur = l.trim(); blocks[cur] = ""; } else if (cur) blocks[cur] += l + "\n"; } } const block = (p) => blocks[p] || "";
  for (const p of ["/workspace/*", "/fodo-pros/*", "/admin/*", "/owner-brain/*"]) { const b = block(p), csp = (/Content-Security-Policy: ([^\n]+)/.exec(b) || [])[1] || ""; ok(csp && !/script-src[^;]*'unsafe-inline'/.test(csp), "static: " + p + " header policy forbids inline scripts"); }
  ok(/script-src[^;]*'unsafe-inline'/.test((/Content-Security-Policy: ([^\n]+)/.exec(block("/website-builder/*")) || [])[1] || ""), "static: /website-builder/* still allows inline scripts (srcdoc previews need it; documented)");
  { const files = fs.readdirSync(path.join(ROOT, "js")).filter((n) => /^(workspace|ws-|admin|owner-brain|account|boot-theme)/.test(n) && n.endsWith(".js")), bad = files.filter((n) => /\bon(click|load|error|submit|change|input|keydown|mouseover|focus|blur|mouseenter)=\\?["']/.test(fs.readFileSync(path.join(ROOT, "js", n), "utf8")) || /new Function\(|[^a-zA-Z_.]eval\(|javascript:/.test(fs.readFileSync(path.join(ROOT, "js", n), "utf8").replace(/\/\*[\s\S]*?\*\//g, ""))); ok(files.length >= 8 && !bad.length, "static: " + files.length + " app scripts insert no inline handlers, no eval / Function / javascript:" + (bad.length ? " (" + bad.join(", ") + ")" : "")); }

  /* ---------- runtime ---------- */
  stop();
  const src = fs.readFileSync(path.join(__dirname, "xray-fixtures/env.sh"), "utf8"), map = JSON.parse(/MAP='(.*)'\s*$/m.exec(src)[1].replace(/'\$F'/g, F));
  const r = sh(path.join(__dirname, "xray-fixtures/run-local.sh"), ["100"], { WRANGLER: process.env.WRANGLER, STATE: path.join(os.tmpdir(), "csp51-" + process.pid), MAPX: JSON.stringify(map), EXTRA: "--binding ACCOUNTS_ENABLED=1 --binding PAYOUT_ENC_KEY=vis-key-0123456789abcdef" });
  if (!/READY/.test(r.stdout)) { console.log(r.stdout, r.stderr); process.exit(1); }
  const b = await pw.chromium.launch();
  const ctx = async () => { const c = await b.newContext({ viewport: { width: 1366, height: 860 } }); await c.addInitScript(() => { window.__cspv = []; document.addEventListener("securitypolicyviolation", (e) => window.__cspv.push(e.violatedDirective + " " + (e.blockedURI || "inline") + " @" + (e.sourceFile || "").split("/").pop() + ":" + e.lineNumber)); }); return c; };
  const mk = async (email) => { const c = await ctx(), p = await c.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message)); const lr = await c.request.post(BASE + "/api/account/test-login", { data: { email }, headers: { origin: BASE } }); if (lr.status() !== 200) console.log("info: login " + email + " → " + lr.status()); return { p, errs, email }; };
  const J = (p, path, body) => p.context().request.fetch(BASE + path, { method: body ? "POST" : "GET", headers: Object.assign({ origin: BASE }, body ? { "content-type": "application/json" } : {}), data: body ? JSON.stringify(body) : undefined }).then((r) => r.json().catch(() => ({ ok: false, status: r.status() })));
  const O = await mk("anmol@fodo.co.in"); await J(O.p, "/api/os/me");
  const deps = (await J(O.p, "/api/os/departments")).items, dep = (s) => deps.find((d) => d.slug === s).id;
  await J(O.p, "/api/os/people", { email: "dev51@fodo.co.in", name: "Dev Fifty", roles: ["designer"], department_id: dep("design") });
  await J(O.p, "/api/os/people", { email: "ops51@fodo.co.in", name: "Om Fifty", roles: ["operations_manager"], department_id: dep("operations") });
  const C = await mk("client51@biz.in"); await J(C.p, "/api/biz/me"); const pj = await J(O.p, "/api/os/projects", { title: "CSP owner project", type: "campaign", kind: "internal" }), pid = (pj.project || pj).id || ""; if (!pid) console.log("info: project not created: " + JSON.stringify(pj).slice(0, 200));
  ok((await J(C.p, "/api/biz/projects", { title: "No pro picked", type: "website", brief: "A small site for the CSP test." })).reason === "Pick the professional you want to hire.", "a client project without a professional is a clear 400, not a 500 (fixed in v51)");
  const T = await J(O.p, "/api/os/tasks", { title: "CSP task", assignee_user_id: null }); const tid = (T.task || T).id || "";
  const PR = await mk("pro51@fodo.co.in"); await J(PR.p, "/api/biz/pro", { name: "Pro Fifty", role: "Video Editor", city: "Delhi", bio: "x" }).catch(() => {});
  const people = [O, await mk("dev51@fodo.co.in"), await mk("ops51@fodo.co.in"), C, PR];
  const visit = async (who, url) => { who.errs.length = 0; await who.p.goto(BASE + url).catch(() => {}); await who.p.waitForTimeout(1100); const v = await who.p.evaluate(() => (window.__cspv || []).splice(0)).catch(() => ["(did not open)"]); const e = who.errs.filter((x) => !/ResizeObserver loop/.test(x)); return v.concat(e.map((x) => "error: " + x)); };
  let views = 0, bad = [];
  for (const who of people) { await J(who.p, "/api/os/me").catch(() => {}); const me = await J(who.p, "/api/biz/me").catch(() => ({})); const ids = ((me && me.nav) || []).map((n) => n.id).filter((id) => !/^(builder|xray|growth|pro-cal)$/.test(id)); const urls = ids.map((id) => "/workspace/#" + id).concat(who === O ? ["/workspace/#os-project?id=" + pid, "/workspace/#tasks?id=" + tid, "/workspace/#people", "/workspace/#decisions?tab=simulate", "/workspace/#procurement?tab=vendors", "/workspace/#risks?tab=continuity", "/workspace/#privacy-desk?tab=retention", "/workspace/#monitoring"] : who === C ? ["/workspace/#project?id=", "/workspace/#project?id=nope", "/workspace/#settings"] : []);
    for (const u of urls) { views++; const v = await visit(who, u); if (v.length) bad.push(who.email + " " + u + " " + JSON.stringify(v.slice(0, 2))); } }
  ok(views >= 60 && !bad.length, "runtime: " + views + " Workspace views across owner, employee, manager, client and FODO Pro: no CSP violation, no page error" + (bad.length ? ": " + bad.slice(0, 5).join(" | ") : ""));
  for (const u of ["/admin/", "/admin/#analytics", "/fodo-pros/"]) { const v = await visit(O, u); ok(!v.length, "runtime: " + u + " opens clean" + (v.length ? ": " + v.slice(0, 2).join(" | ") : "")); }
  await O.p.goto(BASE + "/workspace/#command"); await O.p.waitForTimeout(800); ok(!(await O.p.evaluate(() => { const s = document.createElement("script"); s.textContent = "window.__pwned=1"; document.body.appendChild(s); return !!window.__pwned; })), "runtime: an injected inline script does not run in the Workspace");
  ok((await O.p.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "dark", "runtime: theme set by js/boot-theme.js");
  /* the Builder still works with its own policy */
  const sid = await J(O.p, "/api/sites/create", { mode: "template", templateId: "cafe-cozy", name: "CSP Cafe", ai: false }).then((j) => j.id).catch(() => null);
  if (sid) { await O.p.goto(BASE + "/website-builder/#site=" + sid); await O.p.waitForSelector("#wb-if", { timeout: 25000 }).catch(() => {}); await O.p.waitForTimeout(1500); const v = await O.p.evaluate(() => (window.__cspv || []).splice(0)); ok(!!(await O.p.$("#wb-if")) && !v.length, "runtime: Website Builder preview still renders (its policy unchanged)" + (v.length ? " " + v.slice(0, 2).join(" | ") : "")); }
  await b.close(); stop();
  console.log("\nv51-csp: " + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
})();
