#!/usr/bin/env node
/* v12 brand competitor quality: specific industry lists weigh more, broad "type" lists (website, app …) are never searched,
   keyword search uses quoted phrases without filler words, closed companies and the brand's own group are left out,
   same-country companies rank first, AI names found in Google results carry their source. Wikidata + AI mocked (Zomato-like). */
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:8765";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const J = (b) => ({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(b) });
const cl = (v, q) => Object.assign({ rank: "normal", mainsnak: { datavalue: { value: v } } }, q ? { qualifiers: q } : {});
const it = (id) => ({ id });
const E = {
  Q100: { n: "Zomato", d: "Indian multinational restaurant aggregator and food delivery company", c: { P452: [cl(it("Q500"))], P31: [cl(it("Q35127")), cl(it("Q600"))], P17: [cl(it("Q668"))], P355: [cl(it("Q50"))] } },
  Q1: { n: "Swiggy", d: "Indian online food ordering and delivery platform", c: { P17: [cl(it("Q668"))], P856: [cl("https://www.swiggy.com")] }, wiki: 1 },
  Q2: { n: "Foodpanda India", d: "former food delivery service", c: { P17: [cl(it("Q668"))], P576: [cl({ time: "+2017-12-01T00:00:00Z" })] } },
  Q50: { n: "Blinkit", d: "Indian quick commerce company", c: { P17: [cl(it("Q668"))], P749: [cl(it("Q100"))] } },
  Q3: { n: "Uber Eats", d: "American online food ordering and delivery platform", c: { P17: [cl(it("Q30"))] }, wiki: 1 },
  Q4: { n: "EatSure", d: "Indian food delivery company", c: { P17: [cl(it("Q668"))] } },
  Q5: { n: "Dineout", d: "Indian restaurant aggregator", c: { P17: [cl(it("Q668"))] } },
  Q6: { n: "Zepto", d: "Indian quick commerce company", c: { P17: [cl(it("Q668"))] } },
};
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("fodo-consent", JSON.stringify({ analytics: false, t: 1 })); } catch (e) {} });
  const searches = [], aiBodies = [];
  await ctx.route("**/api/chat", (r) => r.fulfill({ status: 404, body: "" }));
  await ctx.route(/maps\.google\.com|cdnjs.*leaflet|tile\.openstreetmap|query\.wikidata/, (r) => r.fulfill(J({ results: { bindings: [] } })));
  await ctx.route("**/api/competitors?**", (r) => r.fulfill(J({ ok: true, version: "11.0", google: false, ai: true })));
  await ctx.route("**/api/enrich", (r) => r.fulfill(J({ ok: true, results: {} })));
  await ctx.route("**/api/brand-ai", (r) => { aiBodies.push(JSON.parse(r.request().postData())); r.fulfill(J({ ok: true, items: [{ name: "Swiggy", website: "swiggy.com", country: "India", why: "same market", source: "https://g.test/zomato-competitors" }, { name: "Zepto", why: "quick commerce", source: "" }, { name: "TinyBite Foods", why: "new D2C meals", source: "https://g.test/zomato-competitors" }] })); });
  await ctx.route(/wikidata\.org\/w\/api\.php/, (r) => {
    const u = decodeURIComponent(r.request().url());
    if (/wbsearchentities/.test(u)) { const s = ((u.match(/search=([^&]+)/) || [])[1] || "").toLowerCase(); const hit = Object.keys(E).filter((k) => E[k].n.toLowerCase() === s)[0]; return r.fulfill(J({ search: hit ? [{ id: hit, label: E[hit].n, description: E[hit].d }] : [] })); }
    if (/list=search/.test(u)) { const q = (u.match(/srsearch=([^&]+)/) || [])[1] || ""; searches.push(q);
      const R = (ids, total) => r.fulfill(J({ query: { searchinfo: { totalhits: total }, search: ids.map((t) => ({ title: t })) } }));
      if (/P452=Q500/.test(q)) return R(["Q1", "Q2", "Q50", "Q3"], 120);
      if (/P31=Q600/.test(q)) return R(["Q1", "Q4"], 40);
      if (/P31=Q35127/.test(q)) return R(["Q900"], 900000);
      if (/"food delivery"/.test(q)) return R(["Q1", "Q4", "Q3"], 30);
      if (/"restaurant aggregator"/.test(q)) return R(["Q5"], 5);
      return R([], 0); }
    const ids = (u.match(/ids=([^&]+)/) || [, ""])[1].split("|"), out = {};
    ids.forEach((id) => { const e = E[id]; out[id] = /props=labels&/.test(u) ? { labels: { en: { value: id === "Q668" ? "India" : id === "Q30" ? "United States" : e ? e.n : id } } } : e ? { labels: { en: { value: e.n } }, descriptions: { en: { value: e.d } }, claims: e.c, sitelinks: e.wiki ? { enwiki: { title: e.n, url: "https://en.wikipedia.org/wiki/" + e.n } } : {} } : { missing: "" }; });
    r.fulfill(J({ entities: out }));
  });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(BASE + "/competitor-finder/#brands"); await p.waitForTimeout(500);
  await p.selectOption("#cf-country", { index: 0 });
  await p.fill("#cf-brand", "Zomato"); await p.keyboard.press("Escape"); await p.click("#cfb-go");
  await p.waitForFunction(() => /competitors of|No company|did not answer/.test(document.getElementById("cf-status").textContent) && !document.querySelector(".cf-status.busy"), null, { timeout: 30000 });
  const st = await p.textContent("#cf-status"), names = await p.$$eval(".cf-item h3", (h) => h.map((x) => x.textContent));
  console.log("  status:", st); console.log("  order:", names.join(" > "));
  ok(!searches.some((q) => /P31=Q35127/.test(q)), "broad seed type “website” is never searched (it would return every website)");
  ok(searches.some((q) => /"food delivery"/.test(q)) && searches.some((q) => /"restaurant aggregator"/.test(q)) && !searches.some((q) => /multinational|indian|company/i.test(q.replace(/haswbstatement:\S+/g, ""))), "keyword search uses quoted phrases from the description, no filler words");
  ok(names.indexOf("Foodpanda India") < 0 && names.indexOf("Blinkit") < 0, "closed company (Foodpanda India) and Zomato's own Blinkit are left out");
  ok(/left out 1 closed and 1 from the same group/.test(st), "status says what was left out and why");
  ok(names[0] === "Swiggy", "company found by every layer ranks first (Swiggy)");
  ok(names.indexOf("EatSure") > -1 && names.indexOf("Uber Eats") > -1 && names.indexOf("EatSure") < names.indexOf("Uber Eats"), "same-country competitor ranks above a foreign one");
  ok(names.indexOf("Dineout") > -1 && names.indexOf("Zepto") > -1, "keyword match (Dineout) and AI + Wikidata match (Zepto) included");
  const tiny = await p.$$eval(".cf-item", (li) => { const x = li.filter((l) => /TinyBite Foods/.test(l.textContent))[0]; return x ? { text: x.textContent, link: !!x.querySelector('a[href="https://g.test/zomato-competitors"]') } : null; });
  ok(tiny && /Named in Google results/.test(tiny.text) && !/AI suggestion, verify/.test(tiny.text) && tiny.link, "a company named in Google results but not on Wikidata shows where it was named");
  const sw = await p.$$eval(".cf-item", (li) => (li.filter((l) => /^1/.test(l.querySelector(".cf-n").textContent))[0] || {}).textContent || "");
  ok(/Google results \+ AI/.test(sw) && /Same industry/.test(sw), "each card says how it was found");
  ok(aiBodies.length === 1 && aiBodies[0].web === true && aiBodies[0].brand === "Zomato", "AI asked once, with Google grounding requested");
  ok(!errs.length, "no page errors" + (errs[0] ? ": " + errs[0] : ""));
  await b.close();
  console.log(`\nv12 brand: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})();
