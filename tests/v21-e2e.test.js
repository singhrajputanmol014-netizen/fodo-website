/* v21 FODO BRAIN — the real page on the local Cloudflare runtime (Pages Functions + D1), in Chromium:
   strangers and customers see "Page not found"; the owner gets the command center with real data, chat, memory, tasks,
   knowledge, a confirmation card, diagnostics, tools; phone layout; no page errors or CSP violations.
   Env: WRANGLER. Optional SHOTS=<dir> for screenshots. */
const { chromium } = require("playwright");
const { spawnSync } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");
const BASE = "http://localhost:8788", F = "http://127.0.0.1:9300", SHOTS = process.env.SHOTS || "";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const sh = (cmd, args, env) => spawnSync(cmd, args, { env: Object.assign({}, process.env, env || {}), encoding: "utf8" });
const stop = () => sh("bash", ["-c", "for p in $(pgrep -f '[p]ages dev . --port 8788|[w]orkerd serve'); do kill $p; done; sleep 1; pkill -f '[x]ray-fixtures/server.js'; true"]);
(async () => {
  stop();
  const src = fs.readFileSync(path.join(__dirname, "xray-fixtures/env.sh"), "utf8"), map = JSON.parse(/MAP='(.*)'\s*$/m.exec(src)[1].replace(/'\$F'/g, F));
  Object.assign(map, { "api.groq.com": F + "/_groq", "api.resend.com": F + "/_resend" });
  const r = sh(path.join(__dirname, "xray-fixtures/run-local.sh"), ["100"], { WRANGLER: process.env.WRANGLER, STATE: path.join(os.tmpdir(), "v21-" + process.pid), MAPX: JSON.stringify(map),
    EXTRA: "--binding ACCOUNTS_ENABLED=1 --binding GROQ_API_KEY=groq_test_KEY --binding RESEND_API_KEY=re_test_KEY --binding MAIL_FROM=FODO_test" });
  if (!/READY/.test(r.stdout)) { console.log(r.stdout, r.stderr); process.exit(1); }
  const b = await chromium.launch(), errs = [], csp = [];
  const page = async (w, h) => { const c = await b.newContext({ viewport: { width: w, height: h } }), p = await c.newPage(); p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text()); }); return p; };
  const login = (p, email, plan) => p.evaluate(([e, pl]) => fetch("/api/account/test-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pl ? { email: e, plan: pl } : { email: e }) }).then((r) => r.status), [email, plan]);
  const shot = (p, n, full) => SHOTS ? p.screenshot({ path: path.join(SHOTS, n + ".png"), fullPage: !!full }) : null;
  try {
    // strangers
    const s = await page(1280, 860); await s.goto(BASE + "/owner-brain/"); await s.waitForSelector(".ob-gate h1", { timeout: 15000 });
    ok(/Page not found/.test(await s.textContent("body")) && !/FODO BRAIN|memory|revenue/i.test(await s.textContent("body")), "visitor: plain 'Page not found', nothing about the Brain");
    const hd = await s.evaluate(() => fetch("/owner-brain/").then((r) => ({ robots: r.headers.get("x-robots-tag"), frame: r.headers.get("x-frame-options"), csp: r.headers.get("content-security-policy") })));
    console.log("HD", JSON.stringify(hd)); ok(/noindex/.test(hd.robots) && hd.frame === "DENY" && /frame-ancestors 'none'/.test(hd.csp || ""), "page headers: noindex, no framing, strict CSP");
    await login(s, "ravi@shop.in", "growth"); await s.reload(); await s.waitForSelector(".ob-gate h1");
    ok(/Page not found/.test(await s.textContent("body")), "paying customer: still 'Page not found'");
    ok((await s.evaluate(() => fetch("/api/owner-brain/memory").then((r) => r.status))) === 403, "customer → API 403");
    // the owner
    const p = await page(1440, 900); await p.goto(BASE + "/"); await login(p, "anmol@fodo.co.in"); await p.goto(BASE + "/owner-brain/");
    await p.waitForSelector(".ob-kpi", { timeout: 20000 });
    const home = await p.textContent("#ob-view");
    ok(/(Good (morning|afternoon|evening)|Working late), /.test(home) && /sign-ups today/.test(home) && /FODO status/.test(home) && /Database \(D1\)/.test(home), "owner: command center with greeting, real KPIs and system status");
    ok(/BRAIN ONLINE/.test(await p.textContent("#ob-pill")), "status pill: BRAIN ONLINE (Groq connected)");
    await shot(p, "brain-home", true);
    // chat
    await p.fill("#ob-cmdin", "How is FODO doing today?"); await p.click("#ob-cmd button[type=submit]");
    await p.waitForSelector(".ob-msg.a .ob-meta .ob-badge", { timeout: 40000 });
    const a1 = await p.textContent(".ob-log");
    ok(/HIGH/.test(a1) && /Based on: fodo today/i.test(a1), "chat answer with confidence + sources (live data used)");
    await p.fill("#ob-in", "Remember that we are focusing on agency clients this quarter."); await p.press("#ob-in", "Enter");
    await p.waitForFunction(() => /Saved to memory as/.test(document.querySelector(".ob-log").textContent), null, { timeout: 30000 });
    ok(true, "'remember …' → saved to memory");
    await p.fill("#ob-in", "Create a task to call the three warm leads tomorrow"); await p.press("#ob-in", "Enter");
    await p.waitForFunction(() => /Task created/.test(document.querySelector(".ob-log").textContent), null, { timeout: 30000 });
    ok(true, "'create a task …' → task created");
    await p.fill("#ob-in", "Forget that we are focusing on agency clients"); await p.press("#ob-in", "Enter");
    await p.waitForFunction(() => document.querySelectorAll(".ob-msg.a").length >= 4 && !document.querySelector(".ob-steps"), null, { timeout: 30000 }).catch(() => {});
    if (!(await p.$(".ob-act"))) console.log("LOG>>", (await p.textContent(".ob-log")).slice(-600));
    await p.waitForSelector(".ob-act button[data-d=run]", { timeout: 5000 }); await shot(p, "brain-chat");
    await p.click(".ob-act button[data-d=run]"); await p.waitForFunction(() => /Done\./.test(document.querySelector(".ob-act").textContent), null, { timeout: 15000 });
    ok(true, "destructive 'forget' → confirmation card → Execute → done");
    // pages
    await p.goto(BASE + "/owner-brain/#tasks"); await p.waitForSelector("#ob-tf");
    ok(/call the three warm leads/i.test(await p.textContent("#ob-view")), "Tasks page shows the Brain's task");
    await p.goto(BASE + "/owner-brain/#memory"); await p.waitForSelector("#ob-ml table, #ob-ml .ob-empty");
    await p.goto(BASE + "/owner-brain/#knowledge"); await p.waitForSelector("#ob-kf");
    await p.fill("#ob-kf [name=title]", "Q4 plan"); await p.fill("#ob-ktext", "# Q4 plan\nWe will launch the agency plan in November and run a webinar for 50 agencies.\n");
    await p.click("#ob-kf button[type=submit]"); await p.waitForSelector("#ob-kres .ob-card", { timeout: 30000 }); await p.waitForFunction(() => /Q4 plan/.test((document.getElementById("ob-kl") || {}).textContent || ""), null, { timeout: 10000 }).catch(() => {});
    ok(/Q4 plan/.test(await p.textContent("#ob-kl")), "Knowledge: document stored and listed");
    await p.goto(BASE + "/owner-brain/#diagnostics"); await p.waitForSelector("#ob-dg table", { timeout: 40000 }); await shot(p, "brain-diagnostics", true);
    const dg = await p.textContent("#ob-dg");
    ok(/Authentication\s*PASS/.test(dg) && /Database \(D1\)\s*PASS/.test(dg) && /Groq/.test(dg), "Diagnostics: real tests (auth, D1 read/write, AI providers…)");
    await p.goto(BASE + "/owner-brain/#tools"); await p.waitForSelector(".ob-table");
    ok(/send_email/.test(await p.textContent("#ob-view")) && /never runs/.test(await p.textContent("#ob-view")), "Tools page: registry with risk levels");
    await p.goto(BASE + "/owner-brain/#activity"); await p.waitForSelector(".ob-table"); ok(/fodo_today/.test(await p.textContent("#ob-view")), "Activity: the audit log");
    await p.goto(BASE + "/owner-brain/#analytics"); await p.waitForSelector(".ob-kpi"); ok(/messages answered/.test(await p.textContent("#ob-view")), "Analytics page");
    // v22 pages
    ok(!!(await p.$("#ob-hf")), "v22: 'Hey FODO' hands-free button present");
    await p.goto(BASE + "/owner-brain/#changes"); await p.waitForFunction(() => /GitHub/.test(document.getElementById("ob-view").textContent), null, { timeout: 15000 });
    ok(/GitHub/.test(await p.textContent("#ob-view")), "v22: Site changes page (GitHub status shown)"); await shot(p, "brain-changes", true);
    // v27 Website Engineer: owner sees it; every tab renders against the real backend (GitHub not connected here → says so)
    await p.goto(BASE + "/owner-brain/#engineer"); await p.waitForSelector(".eg-tiles", { timeout: 20000 });
    ok(/Not connected/.test(await p.textContent("#ob-view")) && /HEALTH SCORE/.test(await p.textContent("#ob-view")), "v27: Engineer command center (honest 'Not connected')"); await shot(p, "brain-engineer", true);
    for (const t of ["work", "changes", "map", "find", "setup"]) { await p.click('.eg-tabs [data-t="' + t + '"]'); await p.waitForTimeout(400); }
    ok(/GitHub connected/.test(await p.textContent("#ob-view")), "v27: Engineer tabs render (setup checklist shown)"); await shot(p, "brain-engineer-setup", true);
    await p.goto(BASE + "/owner-brain/#automations"); await p.waitForFunction(() => /Tell me about every payment/.test(document.getElementById("ob-view").textContent), null, { timeout: 15000 });
    ok(true, "v22: Automations page lists the default automations"); await shot(p, "brain-automations", true);
    await p.goto(BASE + "/owner-brain/#connectors"); await p.waitForFunction(() => /Google/.test(document.getElementById("ob-view").textContent), null, { timeout: 15000 });
    ok(true, "v22: Connectors page (Google / GitHub)"); await shot(p, "brain-connectors", true);
    // v23 pages
    await p.goto(BASE + "/owner-brain/#social"); await p.waitForFunction(() => /Upload once, post everywhere/.test(document.getElementById("ob-view").textContent), null, { timeout: 15000 });
    ok(!!(await p.$("#ob-drop")) && /Facebook Page \+ Instagram/.test(await p.textContent("#ob-view")), "v23: Social page — composer, uploads, connect buttons"); await shot(p, "brain-social", true);
    await p.goto(BASE + "/owner-brain/#access"); await p.waitForSelector("#ob-mf"); ok(/Give access/.test(await p.textContent("#ob-view")), "v23: Access page (owners give full/limited access)"); await shot(p, "brain-access", true);
    await p.click("#ob-theme"); ok(await p.evaluate(() => document.documentElement.getAttribute("data-theme") === "light"), "v23: light mode toggle"); await p.goto(BASE + "/owner-brain/#home"); await p.waitForSelector(".ob-kpi", { timeout: 20000 }); await shot(p, "brain-light", true);
    await p.click("#ob-theme");
    await p.click("#ob-hf"); await p.waitForSelector("#ob-vo:not([hidden])"); await p.waitForTimeout(700); ok(await p.evaluate(() => { const c = document.getElementById("ob-voc"); return c && c.width > 100; }), "v23: voice mode opens with the live 3-D orb"); await shot(p, "brain-voice", false);
    await p.click("#ob-vox");
    // phone
    const m = await page(390, 844); await m.goto(BASE + "/"); await login(m, "anmol@fodo.co.in"); await m.goto(BASE + "/owner-brain/"); await m.waitForSelector(".ob-kpi", { timeout: 20000 });
    ok((await m.evaluate(() => document.documentElement.scrollWidth)) <= 390, "phone: no sideways scrolling"); await shot(m, "brain-phone", false);
    ok(await m.evaluate(() => getComputedStyle(document.querySelector(".ob-bnav")).display !== "none"), "phone: bottom navigation with the voice orb");
    await m.click("#ob-menu"); ok(await m.evaluate(() => document.getElementById("ob-side").classList.contains("open")), "phone: menu opens"); await m.mouse.click(370, 400); ok(await m.evaluate(() => !document.getElementById("ob-side").classList.contains("open")), "phone: tapping outside closes the menu");
    await m.goto(BASE + "/owner-brain/#social"); await m.waitForSelector("#ob-drop"); ok((await m.evaluate(() => document.documentElement.scrollWidth)) <= 390, "phone: Social page fits the screen"); await shot(m, "brain-phone-social", true);
    await m.click("#ob-bvo"); await m.waitForSelector("#ob-vo:not([hidden])"); await m.waitForTimeout(900); await shot(m, "brain-phone-voice", false);
    ok(!!(await m.$("#ob-vomic")) && (await m.$$(".ob-vo-ctrl button")).length === 1, "phone: tap the orb → voice mode with ONE mic button");
    await m.click("#ob-vox");
    await m.goto(BASE + "/owner-brain/#chat"); await m.waitForSelector("#ob-form"); const ch = await m.evaluate(() => document.getElementById("ob-form").getBoundingClientRect().height);
    ok(ch < 60, "phone: slim chat box (" + Math.round(ch) + " px tall)"); await m.fill("#ob-in", "kaise ho fodo?"); await m.click("#ob-form button[type=submit]"); await m.waitForSelector(".ob-msg.a .ob-meta", { timeout: 40000 }); await shot(m, "brain-phone-chat", false);
    await m.goto(BASE + "/owner-brain/#tools"); await m.waitForSelector(".ob-table"); ok((await m.evaluate(() => document.documentElement.scrollWidth)) <= 390 && (await m.evaluate(() => { const t = document.querySelector(".ob-table td:nth-child(2)"); return t && t.getBoundingClientRect().right <= 392; })), "phone: tables turn into cards — nothing cut off"); await shot(m, "brain-phone-tools", false);
    ok(!errs.length, "no page errors" + (errs.length ? ": " + errs.join(" | ") : ""));
    ok(!csp.length, "no CSP violations" + (csp.length ? ": " + csp.slice(0, 2).join(" | ") : ""));
  } catch (e) { ok(false, "crashed: " + e.message); }
  await b.close(); stop();
  console.log("\nv21 e2e: " + pass + "/" + (pass + fail) + " passed"); process.exit(fail ? 1 : 0);
})();
