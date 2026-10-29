#!/usr/bin/env node
/* v5 design + new pages: every new route renders, has unique title/description/canonical, no JS errors,
   interactions work (flip word, sticky stages, compare, copy, navbar hide), and axe finds no serious/critical issues.
   Needs the site on http://localhost:8765. Optional: AXE=<path to axe.min.js>. */
const { chromium } = require("playwright");
const fs = require("fs");
const BASE = process.env.BASE || "http://localhost:8765";
const AXE = process.env.AXE && fs.existsSync(process.env.AXE) ? fs.readFileSync(process.env.AXE, "utf8") : null;
const ROUTES = ["/", "/locations/", "/locations/najafgarh/", "/locations/dwarka/", "/locations/west-delhi/", "/locations/south-delhi/", "/locations/gurugram/", "/locations/noida/", "/locations/ghaziabad/", "/locations/faridabad/",
  "/industries/ecommerce/", "/industries/healthcare/", "/industries/real-estate/", "/industries/startups/", "/industries/saas/", "/industries/local-business/", "/industries/personal-brands/",
  "/work/d2c-skincare-funnel/", "/work/b2b-saas-linkedin/", "/work/clinic-local-seo/", "/work/restaurant-social-reels/", "/work/realestate-lead-quality/", "/work/founder-brand-reposition/",
  "/pricing/", "/teardowns/", "/founding-programme/", "/templates/", "/competitor-finder/", "/about/", "/services/", "/industries/", "/work/"];
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; if (!c || process.argv.includes("-v")) console.log((c ? "PASS " : "FAIL ") + m); };
(async () => {
  const b = await chromium.launch();
  const titles = new Map(), descs = new Map();
  for (const theme of ["light", "dark"]) for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const ctx = await b.newContext({ viewport: vp });
    await ctx.addInitScript((t) => { try { localStorage.setItem("fodo-theme", t); localStorage.setItem("fodo-consent", JSON.stringify({ analytics: false, t: Date.now() })); } catch (e) {} }, theme);
    await ctx.route("**/api/chat", (r) => r.fulfill({ status: 404, body: "" }));
    for (const u of ROUTES) {
      if (vp.width === 390 && theme === "dark" && !["/", "/teardowns/", "/locations/gurugram/"].includes(u)) continue;
      const p = await ctx.newPage(); const errs = [];
      p.on("pageerror", (e) => errs.push(e.message));
      const res = await p.goto(BASE + u, { waitUntil: "load" });
      await p.waitForTimeout(400);
      const tag = `${theme} ${vp.width} ${u}`;
      ok(res.status() === 200, `${tag} loads`);
      const meta = await p.evaluate(() => ({ t: document.title, d: document.querySelector('meta[name=description]')?.content || "", c: document.querySelector('link[rel=canonical]')?.href || "", h1: document.querySelectorAll("h1").length,
        wide: document.documentElement.scrollWidth > innerWidth + 1, logo: !!document.querySelector(".header .so-mark .so i"), tag: document.querySelector(".footer-sub")?.textContent || "" }));
      if (theme === "light" && vp.width === 1440) { titles.set(meta.t, (titles.get(meta.t) || 0) + 1); descs.set(meta.d, (descs.get(meta.d) || 0) + 1); ok(meta.t.length > 10 && meta.t.length <= 65 && meta.d.length > 50 && meta.d.length <= 160, `${tag} title/description lengths (${meta.t.length}/${meta.d.length})`); ok(meta.c.endsWith(u), `${tag} canonical`); }
      ok(meta.h1 === 1, `${tag} exactly one h1`);
      ok(!meta.wide, `${tag} no horizontal scroll`);
      ok(meta.logo, `${tag} Signal-O logo in header`);
      ok(meta.tag.trim() === "FEAR OF DIGITALLY OUT ?", `${tag} footer tagline has the question mark`);
      if (AXE && vp.width === 1440) {
        await p.addScriptTag({ content: AXE });
        const v = await p.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"], resultTypes: ["violations"] })).violations.filter((x) => ["serious", "critical"].includes(x.impact)).map((x) => x.id + ":" + x.nodes.length + " " + x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")));
        ok(!v.length, `${tag} axe serious/critical: ${v.join(", ")}`);
      }
      ok(!errs.length, `${tag} no page errors ${errs.join(" | ")}`);
      await p.close();
    }
    await ctx.close();
  }
  ok([...titles.values()].every((n) => n === 1), "all titles unique");
  ok([...descs.values()].every((n) => n === 1), "all descriptions unique");
  // interactions
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
  await p.goto(BASE + "/", { waitUntil: "load" }); await p.waitForTimeout(800);
  const f0 = await p.textContent(".flip"); await p.waitForTimeout(3200); const f1 = await p.textContent(".flip");
  ok(f0.trim() === "invisible." && f1.trim() !== f0.trim(), `flip word rotates (${f0} → ${f1})`);
  ok((await p.$$(".gs2-step")).length === 6 && /Build/.test(await p.textContent(".gs2")), "Growth System shows all six stages in order (v10 grid)");
  await p.evaluate(() => scrollTo(0, 3000)); await p.waitForTimeout(200); await p.evaluate(() => scrollTo(0, 3600)); await p.waitForTimeout(600);
  ok(await p.evaluate(() => document.getElementById("site-header").classList.contains("nav-hide")), "navbar hides while scrolling down");
  await p.evaluate(() => scrollTo(0, 3000)); await p.waitForTimeout(600);
  ok(!(await p.evaluate(() => document.getElementById("site-header").classList.contains("nav-hide"))), "navbar returns on scroll up");
  ok(await p.evaluate(() => !!document.querySelector(".cta-final .btn.mb .mb-ring")), "moving-border ring on the closing CTA");
  await p.goto(BASE + "/teardowns/", { waitUntil: "load" }); await p.waitForTimeout(400);
  await p.focus("#cmp1"); for (let i = 0; i < 10; i++) await p.keyboard.press("ArrowRight");
  ok((await p.evaluate(() => getComputedStyle(document.querySelector(".cmp")).getPropertyValue("--pos").trim())) === "60%", "compare slider works with the keyboard");
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  await p.goto(BASE + "/templates/", { waitUntil: "load" }); await p.click('[data-copy="tpl-brief-body"]'); await p.waitForTimeout(300);
  ok(/Objective/.test(await p.evaluate(() => navigator.clipboard.readText())), "template Copy puts the text on the clipboard");
  await p.goto(BASE + "/industries/#healthcare", { waitUntil: "load" }); await p.waitForTimeout(800);
  ok(p.url().endsWith("/industries/healthcare/"), "old #hash industry links redirect to the new page");
  await b.close();
  console.log(`\nv5 pages: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})();
