#!/usr/bin/env node
/* v9 SEO: new location + article pages render cleanly (axe), old #slug insight links redirect to the static pages,
   ?q= opens site search, conversion events fire once with no personal data, scripts still replace the static footer.
   Needs the site on http://localhost:8765 (BASE to override). Optional: AXE=<path to axe.min.js>. */
const { chromium } = require("playwright");
const fs = require("fs");
const BASE = process.env.BASE || "http://localhost:8765";
const AXE = process.env.AXE && fs.existsSync(process.env.AXE) ? fs.readFileSync(process.env.AXE, "utf8") : null;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("PASS " + m); } else { fail++; console.log("FAIL " + m); } };
const NEW = ["/locations/delhi/", "/locations/mumbai/", "/locations/bengaluru/", "/locations/uae/", "/locations/uk/", "/locations/usa/", "/locations/singapore/",
  "/insights/traffic-vs-customers/", "/insights/small-business-seo-foundation/", "/locations/", "/insights/", "/faq/", "/resources/"];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext();
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }));
  for (const w of [390, 1440]) {
    for (const u of NEW) {
      const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: 900 }); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
      const r = await p.goto(BASE + u, { waitUntil: "load" }); await p.waitForTimeout(400);
      ok(r.status() === 200 && errs.length === 0, `${w}px ${u} loads without script errors ${errs.join("|")}`);
      const info = await p.evaluate(() => ({ h1: document.querySelectorAll("h1").length, hs: document.documentElement.scrollWidth > innerWidth + 1, foot: document.getElementById("site-footer").className,
        lds: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent) }));
      ok(info.h1 === 1, `${w}px ${u} has one h1`); ok(!info.hs, `${w}px ${u} has no horizontal scroll`); ok(info.foot === "footer", `${w}px ${u} designed footer replaced the static one`);
      ok(info.lds.every((j) => { try { JSON.parse(j); return !/aggregateRating|"review"|ratingValue/.test(j); } catch (e) { return false; } }), `${w}px ${u} JSON-LD parses, no rating/review markup`);
      if (AXE && w === 1440) {
        await p.addScriptTag({ content: AXE });
        const v = await p.evaluate(async () => (await axe.run(document, { resultTypes: ["violations"] })).violations.filter((x) => ["serious", "critical"].includes(x.impact)).map((x) => x.id + ":" + x.nodes.length));
        ok(v.length === 0, `axe ${u} no serious/critical issues ${v.join(",")}`);
      }
      await p.close();
    }
  }
  // old hash links → static article pages
  { const p = await ctx.newPage(); await p.goto(BASE + "/insights/#diagnose-landing-page", { waitUntil: "load" }); await p.waitForURL(/\/insights\/diagnose-landing-page\/$/, { timeout: 5000 }).catch(() => {});
    ok(/\/insights\/diagnose-landing-page\/$/.test(p.url()), "old /insights/#slug link redirects to the static article");
    await p.goto(BASE + "/insights/", { waitUntil: "load" }); await p.waitForTimeout(300);
    const hrefs = await p.$$eval("#insights-grid a", (a) => a.map((x) => x.getAttribute("href")));
    ok(hrefs.length === 8 && hrefs.every((h) => /\/insights\/[a-z-]+\/$/.test(h) || /^[a-z-]+\/$/.test(h)), "insights hub cards link to static article pages");
    await p.close(); }
  // ?q= opens the site search
  { const p = await ctx.newPage(); await p.goto(BASE + "/?q=seo", { waitUntil: "load" }); await p.waitForTimeout(1200);
    const s = await p.evaluate(() => { const i = document.querySelector(".fs-in,#fodo-search-in,input[type=search]:focus") || document.activeElement; return { v: i && i.value, open: !!document.querySelector(".open") }; });
    ok(s.v === "seo" && s.open, "?q=seo opens site search with the query"); await p.close(); }
  // analytics: events go to one destination, no personal data
  { const p = await ctx.newPage(); await p.addInitScript(() => { window.__ev = []; window.zaraz = { track: (n, x) => window.__ev.push([n, x]) }; });
    await p.goto(BASE + "/locations/uae/", { waitUntil: "load" }); await p.waitForTimeout(600);
    await p.evaluate(() => { const a = document.querySelector("[data-wa]"); a.addEventListener("click", (e) => e.preventDefault()); a.click(); });
    await p.evaluate(() => { const a = document.querySelector('.btn[data-route="contact"]'); a.addEventListener("click", (e) => e.preventDefault(), true); a.click(); });
    await p.evaluate(async () => { for (let y = 0; y <= document.documentElement.scrollHeight; y += 300) { scrollTo({ top: y, behavior: "instant" }); window.dispatchEvent(new Event("scroll")); await new Promise((r) => setTimeout(r, 40)); } }); await p.waitForTimeout(300);
    const ev = await p.evaluate(() => window.__ev);
    const names = ev.map((e) => e[0]);
    ok(names.filter((n) => n === "whatsapp_click").length === 1, "WhatsApp click tracked once");
    ok(names.includes("cta_click"), "CTA click tracked"); ok(names.includes("scroll_depth"), "scroll depth tracked");
    ok(!JSON.stringify(ev).match(/@|\d{7,}/), "no email addresses or phone numbers in event data");
    await p.close(); }
  await b.close();
  console.log(`\nv9 SEO: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})();
