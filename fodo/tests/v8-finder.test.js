#!/usr/bin/env node
/* v8 Competitor Finder: radius 0.5–100 km (slider + typed), every listed business (no cap) with every field, all-pins map,
   Google merge + deep tiles, emails & socials from websites, brand mode with city + radius, full export, global copy.
   All network is mocked. Needs the site on :8765 and ../../wr/node_modules/{xlsx,leaflet}. */
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const BASE = process.env.BASE || "http://localhost:8765";
const NM = process.env.NM || path.join(__dirname, "../../../wr/node_modules");
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const J = (b, s) => ({ status: s || 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(b) });
const C = { lat: 12.9352, lng: 77.6245 };
const N = 260;
const ELEMENTS = Array.from({ length: N }, (_, i) => ({ type: "node", id: 1000 + i, lat: C.lat + (i % 20) * 0.0009, lon: C.lng + Math.floor(i / 20) * 0.0009,
  tags: Object.assign({ name: "Cafe " + i, amenity: "cafe", "addr:street": "80 Feet Rd", "addr:city": "Bengaluru", "addr:postcode": "560034" },
    i === 0 ? { phone: "+91 80 1111 2222", email: "hello@cafe0.in", website: "https://cafe0.in", "contact:instagram": "cafe0", opening_hours: "Mo-Su 08:00-22:00", "payment:upi": "yes", cuisine: "coffee;sandwich" } : {},
    i === 1 ? { website: "cafe1.example" } : {}, i === 2 ? { name: "=HYPERLINK(evil)" } : {}) }));
ELEMENTS.push({ type: "node", id: 9, lat: C.lat, lon: C.lng, tags: { name: "Cafe 0", amenity: "cafe", "contact:facebook": "cafe0fb" } });   // duplicate → merged
ELEMENTS.push({ type: "node", id: 10, lat: 13.5, lon: 78.5, tags: { name: "Far Away Cafe", amenity: "cafe" } });                              // outside radius

(async () => {
  const b = await chromium.launch();
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const tag = vp.width + "px";
    const ctx = await b.newContext({ viewport: vp, acceptDownloads: true });
    await ctx.addInitScript(() => { try { localStorage.setItem("fodo-consent", JSON.stringify({ analytics: false, t: Date.now() })); } catch (e) {} });
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
    const calls = { overpass: [], api: [], enrich: [], sparql: [], nominatim: 0 };
    await ctx.route("**/api/chat", (r) => r.fulfill({ status: 404, body: "" }));
    await ctx.route("**/api/competitors**", (r) => { calls.api.push(r.request().url()); r.fulfill(J(/health=1/.test(r.request().url()) ? { ok: true, google: false } : { ok: false, reason: "should not be called" }, 500)); });
    await ctx.route("**/api/enrich", async (r) => { const body = JSON.parse(r.request().postData()); calls.enrich.push(body.urls); const res = {}; body.urls.forEach((u) => { res[u] = /cafe1/.test(u) ? { emails: ["team@cafe1.example"], phones: ["+918000000001"], whatsapp: ["+918000000001"], instagram: "https://instagram.com/cafe1", facebook: "", linkedin: "https://linkedin.com/company/cafe1", twitter: "", youtube: "", title: "Cafe One", description: "Specialty coffee", contactPage: "https://cafe1.example/contact" } : { emails: [], phones: [] }; }); r.fulfill(J({ ok: true, results: res })); });
    await ctx.route(/maps\.google\.com\/maps/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>map</p>" }));
    await ctx.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64") }));
    await ctx.route(/overpass/, (r) => { calls.overpass.push(decodeURIComponent(r.request().postData() || "")); r.fulfill(J({ elements: ELEMENTS })); });
    await ctx.route(/nominatim|photon\.komoot\.io\/api\/\?limit=50/, (r) => { calls.nominatim++; r.fulfill(J([])); });
    await ctx.route(/photon\.komoot\.io\/api\/\?limit=7/, (r) => r.fulfill(J({ features: [{ geometry: { coordinates: [C.lng, C.lat] }, properties: { name: "Koramangala", city: "Bengaluru", state: "Karnataka", country: "India" } }, { geometry: { coordinates: [-0.1337, 51.5136] }, properties: { name: "Soho", city: "London", country: "United Kingdom" } }] })));
    const cl = (v, q) => Object.assign({ rank: "normal", mainsnak: { datavalue: { value: v } } }, q ? { qualifiers: q } : {});
    const it = (id) => ({ id });
    const ENT = {
      Q100: { labels: { en: { value: "Zomato" } }, descriptions: { en: { value: "Indian food delivery company" } }, claims: { P452: [cl(it("Q500"))], P31: [cl(it("Q600")), cl(it("Q4830453"))], P17: [cl(it("Q668"))], P571: [cl({ time: "+2008-07-10T00:00:00Z" })] } },
      Q1: { labels: { en: { value: "Swiggy" } }, descriptions: { en: { value: "Indian food delivery company" } }, sitelinks: { enwiki: { title: "Swiggy", url: "https://en.wikipedia.org/wiki/Swiggy" } }, claims: {
        P856: [cl("https://www.swiggy.com")], P968: [cl("mailto:support@swiggy.in")], P1329: [cl("+91-80-0000")], P17: [cl(it("Q668"))], P159: [cl(it("Q1355"))], P571: [cl({ time: "+2014-08-01T00:00:00Z" })],
        P1128: [cl({ amount: "+5000" })], P2139: [cl({ amount: "+1000000000" })], P169: [cl(it("Q900"))], P112: [cl(it("Q901")), cl(it("Q900"))], P452: [cl(it("Q500")), cl(it("Q501"))], P31: [cl(it("Q600"))],
        P2002: [cl("swiggy_in")], P2003: [cl("swiggyindia")], P4264: [cl("swiggy-in")], P414: [cl(it("Q902"), { P249: [{ datavalue: { value: "SWIGGY" } }] })] } },
      Q2: { labels: { en: { value: "Dunzo" } }, descriptions: { en: { value: "Indian quick commerce company" } }, claims: { P17: [cl(it("Q668"))], P159: [cl(it("Q1355"))], P856: [cl("https://dunzo.com")] } },
      Q3: { labels: { en: { value: "Delhi Eats" } }, claims: { P17: [cl(it("Q668"))] } },
    };
    const LAB = { Q668: "India", Q1355: "Bengaluru", Q900: "Sriharsha Majety", Q901: "Nandan Reddy", Q500: "online food ordering", Q501: "quick commerce", Q600: "food delivery company", Q902: "National Stock Exchange of India" };
    await ctx.route(/wikidata\.org\/w\/api\.php/, (r) => { const u = decodeURIComponent(r.request().url()); calls.wd = (calls.wd || []).concat(u);
      if (/action=wbsearchentities/.test(u)) return r.fulfill(J({ search: [{ id: "Q100", label: "Zomato", description: "Indian food delivery company" }] }));
      if (/list=search/.test(u)) return r.fulfill(J({ query: { search: (/P452=Q500/.test(u) ? ["Q100", "Q1", "Q2", "Q3"] : /P31=Q600/.test(u) ? ["Q1"] : []).map((t) => ({ title: t })) } }));
      if (/action=wbgetentities/.test(u)) { const ids = u.match(/ids=([^&]+)/)[1].split("|"), out = {};
        ids.forEach((id) => { out[id] = /props=labels&/.test(u) ? { labels: { en: { value: LAB[id] || id } } } : ENT[id] || { missing: "" }; }); return r.fulfill(J({ entities: out })); }
      r.fulfill(J({})); });
    await ctx.route(/query\.wikidata\.org\/sparql/, (r) => { const q = decodeURIComponent(r.request().url()); calls.sparql.push(q);
      const pts = { Q1: "Point(77.59 12.97)", Q2: "Point(77.6 12.95)", Q3: "Point(77.2 28.6)" };
      r.fulfill(J({ results: { bindings: Object.keys(pts).filter((id) => q.indexOf("wd:" + id + " ") > -1 || q.indexOf("wd:" + id + "}") > -1).map((id) => ({ c: { value: "http://www.wikidata.org/entity/" + id }, coord: { value: pts[id] } })) } })); });
    await ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx/, (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(path.join(NM, "xlsx/dist/xlsx.full.min.js"), "utf8") }));
    await ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\/1\.9\.4\/leaflet\.min\.js/, (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(path.join(NM, "leaflet/dist/leaflet.js"), "utf8") }));
    await ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\/1\.9\.4\/leaflet\.min\.css/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: fs.readFileSync(path.join(NM, "leaflet/dist/leaflet.css"), "utf8") }));
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(BASE + "/competitor-finder/", { waitUntil: "load" }); await p.waitForTimeout(400);
    ok(!/delhi ncr|najafgarh/i.test(await p.evaluate(() => document.querySelector("main").innerText)), `${tag} finder page has no Delhi NCR / Najafgarh wording`);
    // radius: slider ⇄ number
    await p.evaluate(() => { const r = document.getElementById("cf-radius-r"); r.value = 75; r.dispatchEvent(new Event("input", { bubbles: true })); });
    ok((await p.inputValue("#cf-radius")) === "75", `${tag} dragging the slider to 75 shows 75 km`);
    await p.fill("#cf-radius", "12.5"); await p.dispatchEvent("#cf-radius", "change");
    ok((await p.inputValue("#cf-radius-r")) === "12.5", `${tag} typing 12.5 km moves the slider`);
    await p.fill("#cf-radius", "250"); await p.dispatchEvent("#cf-radius", "change");
    ok((await p.inputValue("#cf-radius")) === "100", `${tag} radius is capped at 100 km`);
    await p.fill("#cf-radius", "3"); await p.dispatchEvent("#cf-radius", "change");
    // pick place + type, search
    await p.click("#cf-type"); await p.keyboard.type("Cafe"); await p.keyboard.press("Escape");
    await p.click("#cf-area"); await p.keyboard.type("Kora"); await p.waitForFunction(() => /Koramangala/.test(document.getElementById("cf-area-list").textContent), null, { timeout: 4000 });
    await p.click("#cf-area-list li:first-child"); await p.click("#cf-go");
    await p.waitForFunction(() => /businesses found/.test(document.getElementById("cf-status").textContent), null, { timeout: 15000 });
    ok(/around:3000,12\.935200,77\.624500/.test(calls.overpass[0] || ""), `${tag} OpenStreetMap is asked for every business within 3 km of the picked place`);
    ok(!/out center tags 60;/.test(calls.overpass[0]) && /out center tags 5000;/.test(calls.overpass[0]), `${tag} no 60-result cap any more`);
    ok(/260 businesses found/.test(await p.textContent("#cf-status")), `${tag} every listed business is counted (${(await p.textContent("#cf-status")).slice(0, 40)})`);
    ok(calls.api.every((u) => /health=1/.test(u)) && calls.nominatim === 0, `${tag} free search runs in the browser (no server, no fallback needed)`);
    ok((await p.$$(".cf-item")).length === 50, `${tag} first 50 shown, rest behind Show more`);
    await p.click("#cf-all-b"); ok((await p.$$(".cf-item")).length === 260, `${tag} Show all lists every competitor`);
    const firstCard = await p.textContent(".cf-item:first-child");
    ok(/hello@cafe0\.in/.test(firstCard) && /\+91 80 1111 2222/.test(firstCard) && /Instagram/.test(firstCard) && /Facebook/.test(firstCard) && /Mo-Su 08:00-22:00/.test(firstCard), `${tag} cards show phone, email, hours and socials (duplicates merged)`);
    ok(await p.evaluate(() => !document.getElementById("cf-pins").hidden), `${tag} map switches to "All competitors" pins`);
    await p.waitForFunction(() => window.FODO_CF.pins() >= 260, null, { timeout: 8000 }).catch(() => {});
    ok((await p.evaluate(() => window.FODO_CF.pins())) === 260 && !!(await p.$("#cf-pins .leaflet-tile-pane")), `${tag} every competitor is a pin on the map`);
    // enrich from websites
    await p.waitForFunction(() => /^Done/.test(document.getElementById("cf-enrich-s").textContent), null, { timeout: 10000 });
    ok(/^Done/.test(await p.textContent("#cf-enrich-s")), `${tag} websites are read automatically after the search`);
    ok(calls.enrich.flat().some((u) => u === "https://cafe1.example") && calls.enrich.every((b) => b.length <= 4), `${tag} websites are read in small batches`);
    ok(/team@cafe1\.example/.test(await p.innerHTML("#cf-list")), `${tag} emails found on a competitor's website appear on its card`);
    // brand mode with city + radius
    await p.click("#cf-tab-brand"); await p.click("#cf-brand"); await p.keyboard.type("zoma"); await p.waitForFunction(() => /Zomato/.test(document.getElementById("cf-brand-list").textContent), null, { timeout: 4000 });
    await p.click("#cf-brand-list li:first-child");
    await p.click("#cf-bloc"); await p.keyboard.type("Kora"); await p.waitForFunction(() => /Koramangala/.test(document.getElementById("cf-bloc-list").textContent), null, { timeout: 4000 }); await p.click("#cf-bloc-list li:first-child");
    await p.fill("#cfb-radius", "40"); await p.dispatchEvent("#cfb-radius", "change"); await p.click("#cfb-go");
    await p.waitForFunction(() => document.querySelectorAll(".cf-item").length === 2, null, { timeout: 8000 });
    ok((calls.wd || []).some((u) => /list=search/.test(u) && /haswbstatement:P452=Q500/.test(u)) && (calls.wd || []).some((u) => /haswbstatement:P31=Q600/.test(u)) && !(calls.wd || []).some((u) => /srsearch=haswbstatement:P31=Q4830453(&|$)/.test(decodeURIComponent(u))), `${tag} brand search uses the fast search API by industry + specific type (generic types skipped)`);
    ok(calls.sparql.every((q) => !/OPTIONAL/.test(q) && /VALUES \?c/.test(q)), `${tag} only a light coordinates query is sent to SPARQL`);
    ok(!/Delhi Eats/.test(await p.textContent("#cf-list")), `${tag} companies headquartered outside 40 km are filtered out`);
    const sw = await p.textContent(".cf-item:first-child");
    ok(/Swiggy/.test(sw) && /support@swiggy\.in/.test(sw) && /Sriharsha Majety/.test(sw) && /Nandan Reddy/.test(sw) && /LinkedIn/.test(sw) && /SWIGGY/.test(sw) && /Bengaluru/.test(sw), `${tag} brand cards show email, CEO, founders, ticker, HQ and socials`);
    // export everything
    ok(/262 competitors from 2 searches/.test(await p.textContent("#cf-sheet-n")), `${tag} sheet holds all 260 local + 2 brand competitors`);
    const [dx] = await Promise.all([p.waitForEvent("download", { timeout: 15000 }), p.click("#cf-x-xlsx")]);
    const XL = require(path.join(NM, "xlsx")); const wb = XL.readFile(await dx.path());
    const loc = XL.utils.sheet_to_json(wb.Sheets["Local competitors"]), br = XL.utils.sheet_to_json(wb.Sheets["Brands & startups"]);
    ok(loc.length === 260 && br.length === 2, `${tag} Excel has every row (${loc.length} local, ${br.length} brand)`);
    const c0 = loc.find((r) => r.Name === "Cafe 0") || {}, c1 = loc.find((r) => r.Name === "Cafe 1") || {};
    ok(c0.Email === "hello@cafe0.in" && /instagram\.com\/cafe0/.test(c0.Instagram) && /facebook\.com\/cafe0fb/.test(c0.Facebook) && c0.Payment === "upi" && c0.Postcode === "560034" && /amenity=cafe/.test(c0["All OSM tags"]), `${tag} Excel carries email, socials, payment, postcode and all tags`);
    ok(c1.Email === "team@cafe1.example" && c1.WhatsApp === "+918000000001" && /linkedin/.test(c1.LinkedIn) && c1["Website description"] === "Specialty coffee", `${tag} Excel includes contacts found on websites`);
    ok(br[0].Company === "Swiggy" && br[0].Email === "support@swiggy.in" && br[0].CEO === "Sriharsha Majety" && /Nandan Reddy/.test(br[0].Founders) && br[0]["X / Twitter"] === "https://x.com/swiggy_in", `${tag} Excel brand rows carry email, CEO, founders, socials`);
    ok(loc.some((r) => r.Name === "'=HYPERLINK(evil)") && c0.Phone === "+91 80 1111 2222", `${tag} formula injection is neutralised, phone numbers stay intact`);
    const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#cf-x-csv")]);
    const csv = fs.readFileSync(await dl.path(), "utf8"); ok(csv.split("\n").length > 262 && /Email,Website/.test(csv) || /,Email,/.test(csv), `${tag} CSV has every row and the Email column`);
    ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `${tag} no horizontal scroll`);
    ok(!errs.length, `${tag} no page errors ${errs.join(" | ")}`);
    await ctx.close();
  }
  // Google connected: results merged + deep tiles
  {
    const ctx = await b.newContext(); const tiles = [];
    await ctx.route("**/api/chat", (r) => r.fulfill({ status: 404, body: "" }));
    await ctx.route("**/api/competitors**", (r) => { const u = r.request().url(); if (/health=1/.test(u)) return r.fulfill(J({ ok: true, google: true }));
      tiles.push(u); const i = tiles.length; r.fulfill(J({ ok: true, source: "google", results: [{ id: "g/" + i, name: i === 1 ? "Cafe 0" : "Google Only Cafe " + i, lat: C.lat + i * 1e-4, lng: C.lng, rating: 4.5, reviews: 100 + i, phone: "+91 1", website: "", mapsUrl: "https://maps.google.com/?cid=" + i, source: "Google Maps" }] })); });
    await ctx.route(/overpass/, (r) => r.fulfill(J({ elements: ELEMENTS.slice(0, 5) })));
    await ctx.route(/maps\.google\.com\/maps|cdnjs/, (r) => r.fulfill({ status: 200, body: "" }));
    const p = await ctx.newPage(); await p.goto(BASE + "/competitor-finder/"); await p.waitForTimeout(600);
    ok(await p.isVisible("#cf-deep-wrap"), "Deep Google search option appears when Google is connected");
    await p.evaluate((c) => { localStorage.removeItem("fodo-cf"); }, C);
    await p.fill("#cf-type", "Cafe"); await p.fill("#cf-area", "Koramangala"); await p.keyboard.press("Escape");
    await p.evaluate(() => { document.getElementById("cf-radius").value = "10"; document.getElementById("cf-radius").dispatchEvent(new Event("change")); });
    await p.route(/nominatim|photon/, (r) => r.fulfill(J([{ lat: "12.9352", lon: "77.6245", display_name: "Koramangala" }])));
    await p.check("#cf-deep"); await p.click("#cf-go");
    await p.waitForFunction(() => /businesses found/.test(document.getElementById("cf-status").textContent), null, { timeout: 20000 });
    ok(tiles.length === 9 && tiles.every((u) => /rect=/.test(u)), `deep search splits 10 km into 9 Google tiles (${tiles.length})`);
    const st = await p.textContent("#cf-status");
    ok(/13 businesses found/.test(st) && /Google Maps \+ OpenStreetMap/.test(st), `Google + OpenStreetMap merged without duplicates (${st.slice(0, 60)})`);
    ok(/4\.5/.test(await p.textContent("#cf-list")), "Google ratings shown");
    await ctx.close();
  }
  // brand results: websites read automatically + Google Maps match
  {
    const ctx = await b.newContext({ acceptDownloads: true }); let gPlaces = [];
    await ctx.route("**/api/chat", (r) => r.fulfill({ status: 404, body: "" }));
    await ctx.route("**/api/competitors**", (r) => r.fulfill(J({ ok: true, google: true })));
    await ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx/, (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(path.join(NM, "xlsx/dist/xlsx.full.min.js"), "utf8") }));
    await ctx.route(/maps\.google\.com|cdnjs.*leaflet|tile\.openstreetmap/, (r) => r.fulfill({ status: 200, body: "" }));
    await ctx.route("**/api/enrich", (r) => { const bd = JSON.parse(r.request().postData()); const res = {}, pl = {}; (bd.urls || []).forEach((u) => { res[u] = { emails: ["hello@acme.example"], phones: ["+911112223334"], address: "12 MG Road, Bengaluru", linkedin: "https://linkedin.com/company/acme", whatsapp: [] }; });
      (bd.places || []).forEach((x) => { gPlaces.push(x); pl[x.key] = { name: x.name, address: x.name + " HQ, Bengaluru", intlPhone: "+91 80 9999 0000", rating: 4.2, reviews: 812, hours: "Mon: 9–6", mapsUrl: "https://maps.google.com/?cid=77", status: "OPERATIONAL" }; });
      r.fulfill(J({ ok: true, results: res, places: pl })); });
    await ctx.route(/wikidata\.org\/w\/api\.php/, (r) => { const u = decodeURIComponent(r.request().url());
      if (/wbsearchentities/.test(u)) return r.fulfill(J({ search: [{ id: "Q100", label: "Acme Seed" }] }));
      if (/list=search/.test(u)) return r.fulfill(J({ query: { search: [{ title: "Q7" }] } }));
      const ids = (u.match(/ids=([^&]+)/) || [, ""])[1].split("|"), out = {};
      ids.forEach((id) => { out[id] = /props=labels&/.test(u) ? { labels: { en: { value: id === "Q668" ? "India" : id } } } : id === "Q100" ? { labels: { en: { value: "Acme Seed" } }, claims: { P452: [{ rank: "normal", mainsnak: { datavalue: { value: { id: "Q500" } } } }] } } : { labels: { en: { value: "Acme Startup" } }, claims: { P856: [{ rank: "normal", mainsnak: { datavalue: { value: "https://acme.example" } } }], P17: [{ rank: "normal", mainsnak: { datavalue: { value: { id: "Q668" } } } }] } }; });
      r.fulfill(J({ entities: out })); });
    await ctx.route(/query\.wikidata/, (r) => r.fulfill(J({ results: { bindings: [] } })));
    const p = await ctx.newPage(); await p.goto(BASE + "/competitor-finder/#brands"); await p.waitForTimeout(500);
    await p.fill("#cf-brand", "Acme"); await p.keyboard.press("Escape"); await p.click("#cfb-go");
    await p.waitForFunction(() => /^Done/.test(document.getElementById("cf-enrich-s").textContent), null, { timeout: 10000 });
    let card = await p.textContent(".cf-item:first-child");
    ok(/hello@acme\.example/.test(card) && /\+911112223334/.test(card) && /12 MG Road/.test(card), "brand results: email, phone and address read from each startup's website automatically");
    ok(await p.isVisible("#cf-gmatch"), "Google Maps match button shows when Google is connected");
    await p.click("#cf-gmatch"); await p.waitForFunction(() => /^Done/.test(document.getElementById("cf-enrich-s").textContent) && /4\.2/.test(document.getElementById("cf-list").textContent), null, { timeout: 10000 });
    card = await p.textContent(".cf-item:first-child");
    ok(gPlaces.length === 1 && gPlaces[0].name === "Acme Startup" && /4\.2/.test(card) && /812 Google reviews/.test(card), "brand results matched on Google Maps (rating, reviews)");
    const [dx] = await Promise.all([p.waitForEvent("download", { timeout: 15000 }), p.click("#cf-x-xlsx")]);
    const XL = require(path.join(NM, "xlsx")); const row = XL.utils.sheet_to_json(XL.readFile(await dx.path()).Sheets["Brands & startups"])[0] || {};
    ok(row.Email === "hello@acme.example" && row["Google Maps listing"] === "https://maps.google.com/?cid=77" && row["Address (from website)"] === "12 MG Road, Bengaluru" && !("Google rating" in row) && !("Google Maps address" in row) && !/9999 0000/.test(JSON.stringify(row)), "Excel brand row: website contacts + Google Maps link; Google's own details stay on screen (terms)");
    await ctx.close();
  }
  // global copy across the site
  const ctx = await b.newContext(); const p = await ctx.newPage();
  for (const u of ["/", "/services/", "/services/seo/", "/about/", "/pricing/", "/founding-programme/", "/industries/saas/", "/locations/", "/contact/"]) {
    await p.goto(BASE + u, { waitUntil: "load" }); await p.waitForTimeout(250);
    const t = await p.evaluate(() => document.title + " " + document.querySelector('meta[name=description]').content + " " + document.body.innerText);
    ok(!/delhi ncr|najafgarh|\bNCR\b/i.test(t.replace(/65 M Block[^\n]*/g, "")), `${u} has no Delhi NCR / Najafgarh positioning`);
  }
  await p.goto(BASE + "/"); ok(/worldwide/i.test(await p.title()) && /HQ New Delhi, India · working worldwide/.test(await p.textContent(".footer")), "home title and footer say worldwide");
  await b.close();
  console.log(`\nv8 finder: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})();
