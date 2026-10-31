/* v20.2: X-Ray quality fixes from the expocitytravels.com review: service names (not taglines), slow pages are not "broken",
   customer voice keeps only snippets about the business or its market, a rating is not a price, industry-matched copy examples.
   Runs the real engine in Chromium. */
const path = require("path"), fs = require("fs");
const { chromium } = require("playwright");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? "PASS " : "FAIL ") + m); };
(async () => {
  const b = await chromium.launch(), p = await b.newPage();
  await p.setContent("<html><body></body></html>");
  await p.addScriptTag({ content: fs.readFileSync(path.join(__dirname, "../js/xray-engine.js"), "utf8") });
  const r = await p.evaluate(() => {
    const E = window.FODO_XRAY_ENGINE, out = {}, ev = new E.Evidence();
    const nav = "<nav><a href='/solutions/corporate-travel'>Corporate Travel</a><a href='/solutions/mice-events'>MICE &amp; Events</a><a href='/solutions'>All Solutions -&gt;</a><a href='/solutions/x'>Meetings, Incentives, Conferences &amp; Events: Managed End-to…</a></nav>";
    const pg = (u, title, h1, body, d) => { const x = E.parsePage("<html><head><title>" + title + "</title></head><body>" + nav + "<h1>" + h1 + "</h1><p>" + (body || "") + "</p></body></html>", u, { status: 200 }); x.depth = d || 1; x.status = 200; return x; };
    const home = pg("https://expo.test/", "Expocity Travels | Corporate Travel Management", "Your Business. Your Journeys. One Travel Partner.", "Corporate travel management in Gurugram. Google rating Rs.4.2 out of 5. Packages from Rs.18,450. Hotels at Rs.9,800/night.", 0);
    const dm = pg("https://expo.test/solutions/destination-management", "Destination Management | Expocity", "Local Expertise. Seamless On-Ground Execution.");
    const visa = pg("https://expo.test/solutions/visa-services", "Visa Services | Expocity", "Visa Services");
    const crawl = E.emptyCrawl("https://expo.test/", {}); crawl.blocked = null; crawl.errors = [];
    const slow = { url: "https://expo.test/solutions/leisure-incentive-travel", finalUrl: "https://expo.test/solutions/leisure-incentive-travel", status: 0, error: "timeout", depth: 1, internalLinks: [] };
    crawl.pages = [home, dm, visa, slow]; crawl.linkStatus = { "https://expo.test/solutions/leisure-incentive-travel": 0 };
    dm.type = "service"; visa.type = "service";
    const B = E.discover(crawl, {}, ev);
    out.services = B.services.value; out.prices = B.pricing.value;
    out.queries = E.buildQueries(B, { city: "Gurugram" }).map((q) => q.q);
    const checks = E.techChecks(crawl, B, null, ev);
    out.broken = checks.find((c) => c.id === "T_broken"); out.slow = checks.find((c) => c.id === "T_slow");
    const opps = E.opportunities([{ id: "O_audience", status: "fail", score: 0, detail: "x" }], [], ev, { industryId: "travel" });
    const oppsNone = E.opportunities([{ id: "O_audience", status: "fail", score: 0, detail: "x" }], [], ev, {});
    out.fixTravel = (opps.find((o) => o.key === "O_audience") || {}).recommendation; out.fixPlain = (oppsNone.find((o) => o.key === "O_audience") || {}).recommendation;
    const ctx = E.entityContext({ name: { value: "Expocity Travels" }, domain: "expocitytravels.com", industry: { value: "Travel / tourism" }, services: { value: ["Corporate Travel", "Visa Services"] } }, { city: "Gurugram" });
    const items = [
      { text: "Corporate travel desk was late with the visa for our team, too expensive and slow response.", url: "https://reddit.com/r/delhi/1" },
      { text: "Hidden gems for shopping in Gurgaon, this market is too expensive.", url: "https://google.com/x" },
      { text: "Worst management and no atmosphere, salary is late every month for employees.", url: "https://www.ambitionbox.com/reviews/expocity" },
      { text: "Can online reviews actually be trusted? I said okay and started moving on.", url: "https://google.com/y" } ];
    out.voice = E.voice(items, ctx);
    out.voiceOld = E.voice(items);
    return out;
  });
  ok(r.services.indexOf("Corporate Travel") > -1 && r.services.some((s) => /^MICE/.test(s)) && r.services.indexOf("Destination Management") > -1 && r.services.indexOf("Visa Services") > -1, "services read like services: " + r.services.join(" · "));
  ok(!r.services.some((s) => /Local Expertise|All Solutions|Managed End|…|->/.test(s)), "taglines and link prompts are not services");
  ok(!r.queries.some((q) => /Local Expertise|Seamless/.test(q)) && r.queries.some((q) => /Corporate Travel/i.test(q)), "searches use real services: " + r.queries.slice(1, 4).join(" | "));
  ok(r.broken && !/timeout/.test(JSON.stringify(r.broken.pages)) && r.broken.status === "pass", "a page that timed out is not counted as broken (broken: " + (r.broken && r.broken.status) + ")");
  ok(r.slow && r.slow.status === "warn" && /15 seconds/.test(r.slow.detail), "…it is reported as a slow page instead");
  ok(/HR and admin teams/.test(r.fixTravel) && /clinics in Delhi/.test(r.fixPlain), "copy examples match the industry (travel: " + r.fixTravel + ")");
  ok(r.voice.snippets === 1 && r.voice.setAside === 3 && r.voiceOld.snippets === 3, "customer voice keeps the corporate-travel snippet; drops shopping, employee review and off-topic text");
  ok(JSON.stringify(r.voice.complaints).indexOf("salary") < 0, "employee reviews are never counted as customer complaints");
  ok(r.prices.some((x) => /18,450/.test(x)) && !r.prices.some((x) => /^(rs\.?\s?)?4\.2$/i.test(x)), "a 4.2 rating is not read as a price (" + r.prices.join(", ") + ")");
  await b.close();
  console.log("\nv20.2 engine: " + pass + "/" + (pass + fail) + " passed"); process.exit(fail ? 1 : 0);
})();
