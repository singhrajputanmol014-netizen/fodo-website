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
  const shot = async (p, n, full) => SHOTS ? (await p.waitForTimeout(450), p.screenshot({ path: path.join(SHOTS, n + ".png"), fullPage: !!full })) : null;
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
    // v30: "<site> ka xray karke do" → the X-Ray runs inside the Brain page and the result is reported here
    await p.fill("#ob-in", "spicehub.test ka xray karke do"); await p.press("#ob-in", "Enter");
    await p.waitForSelector(".ob-xrjob", { timeout: 30000 }); ok(/X-Ray shuru/.test(await p.textContent(".ob-log")), "v30: X-Ray started from chat (honest 2–4 min answer)");
    await p.waitForFunction(() => /✓ Done/.test(document.querySelector(".ob-xrjob").textContent), null, { timeout: 300000 });
    await p.waitForFunction(() => { const a = [...document.querySelectorAll(".ob-msg.a")].pop(); return a && /latest xray/i.test(a.textContent) && !a.classList.contains("ob-xrjob"); }, null, { timeout: 60000 }).catch(async (e) => { console.log("XRLOG>>", (await p.textContent(".ob-log")).slice(-900)); throw e; });
    ok(!(await p.$('iframe[title="X-Ray runner"]')), "v30: X-Ray finished in the Brain page → summary of the saved report posted (runner frame removed)"); await shot(p, "brain-xray");
    // v30: chat history — delete all
    await p.waitForSelector("#ob-tdall", { timeout: 10000 }); p.once("dialog", (d) => d.accept("DELETE")); await p.click("#ob-tdall");
    await p.waitForFunction(() => /No conversations yet/.test(document.getElementById("ob-tl").textContent), null, { timeout: 15000 }); ok(true, "v30: delete all chat history");
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
    // v28 Website Builder: wizard → website → editor (select a section, edit, undo) → publish checks
    await p.goto(BASE + "/website-builder/#new=1"); await p.waitForSelector("#w-pt", { timeout: 20000 }); await shot(p, "builder-start");
    await p.fill("#w-pt", "Build a premium website for a dental clinic in Dwarka, Delhi focused on cosmetic dentistry."); await p.click("#w-aib");
    await p.waitForSelector("#w-f input[name=name]"); ok(await p.inputValue("#w-f input[name=location]") === "Dwarka, Delhi", "v32: AI prompt understood (industry + location pre-filled)");
    await p.fill("#w-f input[name=name]", "Smile Dental"); await p.click("#w-next");
    await p.waitForSelector("[data-k=goals]"); await p.click("[data-k=goals] >> text=Book Appointments"); await p.click("#w-next");
    await p.waitForSelector(".wb-stycard"); ok((await p.$$(".wb-stycard")).length === 10 && /recommended/.test(await p.textContent(".wb-stycards")), "v32: 10 style cards with live previews (one recommended)"); await shot(p, "builder-style"); await p.click("#w-next");
    await p.waitForSelector(".wb-smap"); const smap = (await p.$$eval(".wb-smap [data-pt]", (a) => a.map((x) => x.value))).join(" "); console.log("SITEMAP", smap); ok(/Treatments/.test(smap) && /Doctors/.test(smap) && /Book/.test(smap) && /Privacy/.test(smap), "v32: AI sitemap for a dental clinic (treatments, doctors, booking, privacy) — editable"); await shot(p, "builder-sitemap"); await p.click("#w-next");
    await p.waitForSelector("#w-genai"); ok((await p.$$(".wb-rec2")).length >= 1 && /%/.test(await p.textContent(".wb-recs2")), "v32: recommended templates with match %"); await p.click("#w-genai");
    await p.waitForSelector(".wb-stages .done", { timeout: 20000 }); await shot(p, "builder-making");
    await p.waitForSelector("#wb-if", { timeout: 90000 }); await p.waitForTimeout(1500); if (await p.$("#tu-skip")) { ok(true, "v32: first-visit tutorial shows"); await p.click("#tu-skip"); }
    const fr = p.frameLocator("#wb-if"); await fr.locator("[data-sec='1']").click(); await p.waitForSelector("#wb-pf [data-p]", { timeout: 8000 });
    ok(/Hero/.test(await p.textContent("#wb-rp")), "v28: builder wizard → website → click a section → its properties"); await shot(p, "builder-editor");
    const inp = p.locator('#wb-pf [data-p="title"]'); await inp.fill("Gentle care for every smile"); await inp.dispatchEvent("change"); await p.waitForTimeout(400);
    ok(await fr.locator("h1").first().textContent() === "Gentle care for every smile", "v28: editing a field updates the canvas");
    await p.click(".wb-bar .wb-name"); await p.keyboard.press("Control+z"); await p.waitForTimeout(500); ok(await fr.locator("h1").first().textContent() !== "Gentle care for every smile", "v28: undo (Ctrl+Z)");
    await p.waitForFunction(() => /Saved/.test(document.getElementById("wb-save").textContent), null, { timeout: 15000 }); ok(true, "v28: autosave");
    await p.click("#wb-pub"); await p.waitForSelector(".wb-modal .wb-check", { timeout: 20000 }); ok(/fix these first|is live/i.test(await p.textContent(".wb-modal")), "v28: publish runs the checks"); await shot(p, "builder-publish");
    await p.click(".wb-modal [data-x]");
    // v32 editor upgrades
    await p.click('[data-tab="add"]'); await p.waitForSelector("[data-addt=faq]"); const nSec = await p.frameLocator("#wb-if").locator("[data-sec]").count(); await p.click("[data-addt=faq]"); await p.waitForTimeout(700);
    ok(await p.frameLocator("#wb-if").locator("[data-sec]").count() === nSec + 1, "v32: Add tab — FAQ section added");
    await p.click('[data-tab="design"]'); await p.waitForSelector("[data-sty=luxury]"); await p.click("[data-sty=dark]"); await p.waitForTimeout(600);
    ok(/--bg:#0/i.test(await p.frameLocator("#wb-if").locator("style").first().textContent()), "v32: Design system — Dark style preset switches the whole website"); await shot(p, "builder-design");
    await p.frameLocator("#wb-if").locator("[data-sec='2']").click({ button: "right" }); await p.waitForSelector(".wb-ctx"); ok(/Save as component/.test(await p.textContent(".wb-ctx")), "v32: right-click menu on a section"); await p.click(".wb-ctx [data-c=dup]"); await p.waitForTimeout(500);
    ok(await p.frameLocator("#wb-if").locator("[data-sec]").count() === nSec + 2, "v32: duplicate from the context menu");
    await p.click("[data-rt=style]"); await p.selectOption("[data-st=bg]", "alt"); await p.waitForTimeout(700); ok(await p.frameLocator("#wb-if").locator(".s-bg-alt").count() > 0, "v32: section Style — background changes on the canvas");
    await p.click("#wb-audit"); await p.waitForSelector(".wb-scores"); ok((await p.$$(".wb-sc")).length === 7, "v32: audit with 7 scores"); await shot(p, "builder-audit");
    const before = await p.textContent(".wb-score"); if (await p.isEnabled("#au-all")) { await p.click("#au-all"); await p.waitForSelector("#au-ba b", { timeout: 15000 }); ok(/Before → after/.test(await p.textContent("#au-ba")), "v32: fix all auto-fixable issues → before/after shown (" + before + " → " + await p.textContent(".wb-score") + ")"); } else ok(/\(0\)/.test(await p.textContent("#au-all")), "v32: QA already auto-fixed everything at creation (score " + before + ")");
    await p.click(".wb-modal [data-x]"); await p.click("#wb-share"); await p.waitForSelector("#sh-new"); await p.click("#sh-new"); await p.waitForSelector("[data-cp]", { timeout: 10000 }); ok(true, "v32: share preview link created"); await p.click(".wb-modal [data-x]");
    await p.click("#wb-set"); await p.waitForSelector("[data-stab=members]"); await p.click("[data-stab=members]"); await p.waitForSelector("#mb-f"); ok(/Owner/.test(await p.textContent("#ws-b")), "v32: settings → members"); await p.click("[data-stab=danger]"); await p.waitForSelector("#dz-dup"); await shot(p, "builder-settings"); await p.click(".wb-modal [data-x]");
    await p.click("#wb-prev"); await p.waitForSelector("#pr-if"); await p.click("[data-pd=mobile]"); ok(await p.getAttribute("#pr-if", "class") === "pv-mobile", "v32: preview on mobile"); await p.click(".wb-modal [data-x]");
    await p.click("#wb-pub"); await p.waitForSelector(".wb-check", { timeout: 20000 }); ok((await p.$$(".wb-check li")).length === 10, "v32: publish checklist (10 checks)"); await shot(p, "builder-publish2"); await p.click(".wb-modal [data-x]");
    // v29 Store & Blog manager
    await p.click('[data-tab="store"]'); await p.waitForSelector("[data-sto=products]"); await p.click("[data-sto=products]"); await p.waitForSelector("#np", { timeout: 10000 });
    await p.click("#np"); await p.fill('#pf [name=title]', "Whitening kit"); await p.fill('#pf [name=price]', "799"); await p.check('#pf [name=track]'); await p.fill('#pf [name=stock]', "5"); await p.click("#pf .wb-btn.pri");
    await p.waitForSelector(".wb-tbl", { timeout: 10000 }); ok(/Whitening kit/.test(await p.textContent(".wb-tbl")) && /₹799/.test(await p.textContent(".wb-tbl")), "v29: Store manager — add a product (₹799, stock 5)"); await shot(p, "store-products");
    await p.click("[data-st=blog]"); await p.waitForSelector("#npo"); await p.click("#npo"); await p.fill("#pof [name=title]", "Caring for your teeth"); await p.fill("#pb", "## Brush twice\n**Floss** daily.");
    ok(/<h2>Brush twice<\/h2>/.test(await p.innerHTML("#pv")), "v29: blog editor live markdown preview"); await p.selectOption("#pst", "published"); await p.click("#pof .wb-btn.pri"); await p.waitForSelector(".wb-tbl");
    ok(/Caring for your teeth/.test(await p.textContent(".wb-tbl")) && /Published/.test(await p.textContent(".wb-tbl")), "v29: publish a blog post"); await shot(p, "store-blog");
    await p.click("[data-st=settings]"); await p.waitForSelector("#sf"); ok(/Cash on delivery/.test(await p.textContent("#sf")) && /Cashfree/.test(await p.textContent(".wb-stb")), "v29: store settings + payment connection panel");
    await p.click("[data-st=orders]"); await p.waitForSelector(".wb-stb #of"); ok(/No orders yet/.test(await p.textContent(".wb-stb")), "v29: orders (none yet — no fake data)");
    await p.click(".wb-store [data-close]"); await p.waitForTimeout(800); ok(/1<\/b>products/.test(await p.innerHTML("#wb-lp")), "v29: editor knows the real product count");
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(400); await shot(p, "builder-mobile"); await p.setViewportSize({ width: 1440, height: 900 });
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
    await m.click("#ob-histbtn"); await m.waitForFunction(() => document.getElementById("ob-threads").classList.contains("open") && document.getElementById("ob-threads").getBoundingClientRect().left >= -1, null, { timeout: 5000 }); await m.waitForSelector("#ob-tl a", { timeout: 10000 });
    ok((await m.$$("#ob-tl a")).length >= 1, "v31: phone — chat history opens as a drawer with the conversations"); await shot(m, "brain-phone-history", false); await m.click("#ob-thclose");
    ok(await m.evaluate(() => !!document.getElementById("ob-vomode") && document.getElementById("ob-vovoice").options.length === 30), "v31: voice panel has the 'only when I say FODO' switch + 30 voices");
    await m.goto(BASE + "/owner-brain/#tools"); await m.waitForSelector(".ob-table"); ok((await m.evaluate(() => document.documentElement.scrollWidth)) <= 390 && (await m.evaluate(() => { const t = document.querySelector(".ob-table td:nth-child(2)"); return t && t.getBoundingClientRect().right <= 392; })), "phone: tables turn into cards — nothing cut off"); await shot(m, "brain-phone-tools", false);
    ok(!errs.length, "no page errors" + (errs.length ? ": " + errs.join(" | ") : ""));
    ok(!csp.length, "no CSP violations" + (csp.length ? ": " + csp.slice(0, 2).join(" | ") : ""));
  } catch (e) { ok(false, "crashed: " + e.message); }
  await b.close(); stop();
  console.log("\nv21 e2e: " + pass + "/" + (pass + fail) + " passed"); process.exit(fail ? 1 : 0);
})();
