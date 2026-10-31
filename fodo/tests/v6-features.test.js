#!/usr/bin/env node
/* v6: site search (icon next to theme toggle, Ctrl K, suggestions, results, Enter), desktop top menu,
   dark theme on first visit, competitor finder page (mocked /api/competitors), AI images present. */
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:8765";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const MOCK = { ok: true, type: "Dentist", area: "Dwarka", radius: 2000, source: "google", center: { lat: 28.58, lng: 77.05 }, results: [
  { name: "Smile Dental Dwarka", address: "Sector 10, Dwarka", lat: 28.58, lng: 77.05, rating: 4.4, reviews: 320, phone: "+91 98100 11111", website: "", mapsUrl: "https://maps.google.com/?cid=1", open: true, category: "Dentist", distance: 300 },
  { name: "Bright Teeth Clinic", address: "Sector 7, Dwarka", lat: 28.59, lng: 77.06, rating: 4.8, reviews: 95, phone: "", website: "https://example.com", mapsUrl: "https://maps.google.com/?cid=2", open: false, category: "Dental clinic", distance: 1400 },
  { name: "City Dental Care", address: "Sector 12, Dwarka", lat: 28.57, lng: 77.04, rating: 3.9, reviews: 1210, phone: "", website: "", mapsUrl: "https://maps.google.com/?cid=3", open: null, category: "Dentist", distance: 900 }] };
(async () => {
  const b = await chromium.launch();
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const tag = vp.width + "px";
    const ctx = await b.newContext({ viewport: vp });
    await ctx.addInitScript(() => { try { localStorage.setItem("fodo-consent", JSON.stringify({ analytics: false, t: Date.now() })); } catch (e) {} });
    await ctx.route("**/api/chat", (r) => r.fulfill({ status: 404, body: "" }));
    let calls = [];
    await ctx.route("**/api/competitors**", (r) => { calls.push(r.request().url()); r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK) }); });
    await ctx.route(/maps\.google\.com\/maps/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>map</p>" }));
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(BASE + "/", { waitUntil: "load" }); await p.waitForTimeout(500);
    ok(await p.evaluate(() => document.documentElement.getAttribute("data-theme") === "dark"), `${tag} first visit opens in dark theme`);
    const pos = await p.evaluate(() => { const s = document.getElementById("search-open").getBoundingClientRect(), t = document.getElementById("theme-toggle").getBoundingClientRect(); return { gap: t.left - s.right, same: Math.abs(s.top - t.top) < 4, vis: s.width > 0 }; });
    ok(pos.vis && pos.same && pos.gap >= 0 && pos.gap < 20, `${tag} search icon sits right next to the theme toggle (gap ${pos.gap}px)`);
    await p.click("#theme-toggle"); await p.reload({ waitUntil: "load" }); await p.waitForTimeout(300);
    ok(await p.evaluate(() => document.documentElement.getAttribute("data-theme") === "light"), `${tag} switching to light is remembered`);
    await p.click("#theme-toggle");
    ok(!(await p.evaluate(() => /teardown/i.test(document.querySelector("main").innerText))), `${tag} home page no longer shows "teardown"`);
    // search
    await p.click("#search-open"); await p.waitForTimeout(300);
    ok(await p.evaluate(() => document.getElementById("site-search").classList.contains("open") && document.activeElement.id === "srch-in"), `${tag} search opens with the cursor in the box`);
    ok((await p.$$("#srch-sugg .chip")).length >= 5, `${tag} popular suggestions shown before typing`);
    await p.keyboard.type("comp"); await p.waitForTimeout(400);
    const sug = await p.$$eval("#srch-sugg .chip", (n) => n.map((x) => x.textContent));
    ok(sug.some((s) => /competitor/i.test(s)), `${tag} typing "comp" recommends Competitor finder (${sug.slice(0, 3).join(" / ")})`);
    await p.fill("#srch-in", "kitna price"); await p.waitForTimeout(300);
    ok(/pricing/i.test(await p.textContent("#srch-list [role=option]")), `${tag} Hinglish "kitna price" finds pricing`);
    await p.fill("#srch-in", "gurugram seo"); await p.waitForTimeout(300);
    ok(/gurugram/i.test(await p.textContent("#srch-list [role=option]")), `${tag} "gurugram seo" puts the Gurugram page first`);
    await p.fill("#srch-in", "markting quizz"); await p.waitForTimeout(300);
    ok(/quiz/i.test(await p.textContent("#srch-list [role=option]")), `${tag} typo "markting quizz" still finds the quiz`);
    await p.fill("#srch-in", "competitor"); await p.waitForTimeout(300); await p.keyboard.press("Enter"); await p.waitForURL(/competitor-finder/, { timeout: 5000 });
    ok(p.url().includes("/competitor-finder/"), `${tag} Enter opens the top result`);
    // competitor finder → tests/v8-finder.test.js
    await p.goto(BASE + "/", { waitUntil: "load" }); await p.waitForTimeout(300);
    // menu
    await p.click(".header .burger"); await p.waitForTimeout(400);
    const m = await p.evaluate(() => { const d = document.getElementById("drawer"), r = d.getBoundingClientRect(); return { open: d.classList.contains("open"), top: r.top, h: r.height, link: !!d.querySelector('a[href$="competitor-finder/"]') }; });
    ok(m.open && m.top <= 1 && m.link, `${tag} three-line menu opens the full menu from the top`);
    if (vp.width >= 1024) { ok(m.h < 900, `desktop menu is a top sheet (${Math.round(m.h)}px)`); await p.mouse.click(700, 880); await p.waitForTimeout(300); ok(!(await p.evaluate(() => document.getElementById("drawer").classList.contains("open"))), "desktop menu closes when clicking outside"); }
    else { await p.click("#drawer .drawer-top .burger"); }
    // images
    await p.goto(BASE + "/teardowns/", { waitUntil: "load" });
    ok(await p.evaluate(() => !document.querySelector("img[src*='assets/img/']") && document.querySelectorAll(".ad .mk").length === 16 && !!document.querySelector(".td-cup .steam") && !!document.querySelector(".td-cal .mg-slot")), `${tag} teardowns use animated mockups with numbered markers (no AI photos)`);
    ok(await p.evaluate(() => document.querySelectorAll(".td-stats div").length === 6 && !!document.querySelector(".cmp-handle i")), `${tag} before/after shows stats and an arrow handle`);
    await p.goto(BASE + "/work/", { waitUntil: "load" }); await p.waitForTimeout(500);
    const art = await p.evaluate(() => [...document.querySelectorAll(".wc-art svg.mg")].map((x) => x.getBoundingClientRect().height));
    ok(art.length === 6 && art.filter((h) => h > 100).length >= 4, `${tag} work cards show motion graphics (${art.map(Math.round).join(",")}; extra cards folded on mobile)`);
    ok(await p.evaluate(() => getComputedStyle(document.querySelector(".wc-art .mg-feed, .wc-art .mg-fall")).animationName !== "none"), `${tag} motion graphics are animated`);
    await p.goto(BASE + "/", { waitUntil: "load" }); ok(await p.evaluate(() => document.querySelectorAll(".fc-motion svg.mg").length === 3 && !document.querySelector(".ai-badge")), `${tag} home work cards (3 featured, v10) use motion graphics, no AI badge`);
    ok(!errs.length, `${tag} no page errors ${errs.join(" | ")}`);
    await ctx.close();
  }
  // Ctrl K
  const ctx = await b.newContext(); const p = await ctx.newPage(); await p.goto(BASE + "/about/"); await p.waitForTimeout(300);
  await p.keyboard.press("Control+k"); await p.waitForTimeout(200); ok(await p.evaluate(() => document.getElementById("site-search").classList.contains("open")), "Ctrl K opens search");
  await p.keyboard.press("Escape"); ok(!(await p.evaluate(() => document.getElementById("site-search").classList.contains("open"))), "Esc closes search");
  await b.close();
  console.log(`\nv6 features: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})();
