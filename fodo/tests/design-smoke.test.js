/* Design-layer smoke test: navigation, focus, links, forms, lens, reduced motion. Run with the site served on :8765. */
const { chromium } = require("playwright");
const BASE = process.argv[2] || "http://localhost:8765";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("fodo-theme", "light"); sessionStorage.setItem("fodo-loaded", "1"); sessionStorage.setItem("fodo-bot", "1"); } catch (e) { } });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(BASE + "/", { waitUntil: "networkidle" }); await p.waitForTimeout(800);
  // header + CTA
  ok(await p.isVisible(".header .nav"), "desktop nav visible");
  ok(await p.isVisible(".header .header-cta"), "header CTA visible on desktop");
  ok(await p.isVisible(".header .burger"), "three-line menu also available on desktop (v6)");
  ok(/contact\/$/.test(await p.getAttribute(".header-cta", "href")), "header CTA goes to contact (v10: audit CTA only on home hero)");
  // primary + glass buttons are distinguishable on white
  const st = await p.evaluate(() => { const a = getComputedStyle(document.querySelector(".hero-lens .btn:not(.ghost)")), g = getComputedStyle(document.querySelector(".hero-lens .btn.ghost")); return { aBg: a.backgroundColor, aCol: a.color, gBorder: g.borderTopColor, gShadow: g.boxShadow }; });
  ok(st.aBg === "rgb(11, 11, 12)" && st.aCol === "rgb(255, 255, 255)", "primary CTA: black pill with white label");
  ok(st.gBorder !== "rgba(0, 0, 0, 0)" && st.gShadow !== "none", "glass CTA has a visible edge and shadow");
  // keyboard focus ring
  await p.focus(".hero-lens .btn:not(.ghost)"); await p.keyboard.press("Shift+Tab"); await p.keyboard.press("Tab");
  const fo = await p.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle + " " + s.outlineWidth; });
  ok(/solid 2px/.test(fo), "visible keyboard focus ring: " + fo);
  // "disappear." dissolves on its own; pointer brings letters back
  const box = await p.locator("h1 .fade").boundingBox(); await p.mouse.move(box.x + box.width * .3, box.y + box.height / 2); await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.querySelectorAll("h1 .fade .ch").length > 5 && document.querySelectorAll("h1 .fade .ch.lit").length > 0), "pointer re-focuses letters");
  ok((await p.textContent("h1")).replace(/\s+/g, " ").includes("Don't let your brand disappear."), "headline text intact for SEO / screen readers");
  ok((await p.$$("h1")).length === 1, "single real h1");
  // links
  const wa = await p.$$eval("a[href*='wa.me']", (a) => a.map((x) => x.href)); ok(wa.length && wa.every((h) => h.startsWith("https://wa.me/917827007676")), "WhatsApp links point to FODO number");
  const mail = await p.$$eval("a[href^='mailto:']", (a) => a.map((x) => x.href)); ok(mail.some((h) => /anmol@fodo\.co\.in/.test(h)), "email link intact");
  // dark CTA band
  ok(await p.evaluate(() => getComputedStyle(document.querySelector(".cta-final > .container")).backgroundColor) === "rgb(91, 61, 245)", "closing CTA uses the violet band");
  // theme toggle
  await p.click("#theme-toggle"); ok(await p.evaluate(() => document.documentElement.dataset.theme) === "dark", "theme toggle works"); await p.click("#theme-toggle");
  // chatbot still loads
  await p.click(".bot-fab"); await p.waitForSelector(".bot-panel:not([hidden])"); await p.fill("#bot-in", "what is seo"); await p.press("#bot-in", "Enter"); await p.waitForTimeout(1500);
  ok(/search/i.test(await p.evaluate(() => [...document.querySelectorAll(".msg.bot")].at(-1).textContent)), "chatbot answers");
  // contact form validation
  await p.goto(BASE + "/contact/", { waitUntil: "networkidle" }); await p.waitForTimeout(500);
  const next = p.locator("form button:has-text('Next'), form button[type=submit]").first();
  if (await next.count()) { await next.click(); await p.waitForTimeout(300);
    const inv = await p.evaluate(() => document.querySelectorAll("[aria-invalid=true], .err, .error, .field-error:not(:empty)").length + document.querySelectorAll("input:invalid").length);
    ok(inv > 0, "empty contact form shows validation"); }
  ok(!errs.length, "no page errors (desktop): " + errs.join("|"));
  await ctx.close();
  // mobile menu + reduced motion
  const m = await br.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: "reduce", hasTouch: true, isMobile: true });
  await m.addInitScript(() => { try { localStorage.setItem("fodo-theme", "light"); sessionStorage.setItem("fodo-loaded", "1"); sessionStorage.setItem("fodo-bot", "1"); } catch (e) { } });
  const q = await m.newPage(); const merr = []; q.on("pageerror", (e) => merr.push(e.message));
  await q.goto(BASE + "/", { waitUntil: "networkidle" }); await q.waitForTimeout(500);
  ok(await q.isVisible(".burger") && !(await q.isVisible(".header-cta")), "mobile: burger shown, header CTA hidden");
  await q.tap(".burger"); await q.waitForTimeout(300);
  ok(await q.evaluate(() => document.querySelector(".drawer") && getComputedStyle(document.querySelector(".drawer")).display !== "none"), "mobile drawer opens");
  const tap = await q.evaluate(() => [...document.querySelectorAll(".drawer a:not(.wordmark)")].filter((a) => a.offsetParent).map((a) => a.getBoundingClientRect().height).filter((h) => h < 40).length);
  ok(tap === 0, "drawer links are comfortably tappable (" + tap + " under 40px)");
  await q.keyboard.press("Escape"); await q.waitForTimeout(200);
  const dur = await q.evaluate(() => getComputedStyle(document.querySelector(".hero-lens .lens-type")).animationDuration);
  ok(parseFloat(dur) < 0.01, "reduced motion: hero entrance disabled (" + dur + ")");
  ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "no horizontal overflow at 375px");
  ok(!merr.length, "no page errors (mobile): " + merr.join("|"));
  await br.close();
  console.log(`design smoke: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
