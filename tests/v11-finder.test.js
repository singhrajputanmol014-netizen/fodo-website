#!/usr/bin/env node
/* v11 Competitor Finder engine: sources in parallel (OSM proxy, Geoapify, Google) with progressive results and per-source chips,
   proxy → direct-server fallback, brand layers (industry + keywords + AI, works when the brand is not on Wikidata),
   own Excel writer, Google terms in the export, phone save/share dialog + server download, in-app browser hint,
   clipboard fallback, IndexedDB sheet that survives a reload (and moves an old localStorage sheet over).
   All network mocked. Needs the site on :8765 and NM=…/node_modules with xlsx. */
const { chromium, devices } = require("playwright");
const path = require("path");
const BASE = process.env.BASE || "http://localhost:8765";
const NM = process.env.NM || path.join(__dirname, "../../../wr/node_modules");
const XL = require(path.join(NM, "xlsx"));
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const J = (b, s) => ({ status: s || 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(b) });
const C = { lat: 12.9352, lng: 77.6245 };
const OSM = Array.from({ length: 40 }, (_, i) => ({ type: "node", id: 100 + i, lat: C.lat + i * 0.0004, lon: C.lng, tags: { name: "Osm Cafe " + i, amenity: "cafe", "addr:city": "Bengaluru" } }));
const GEO = { type: "FeatureCollection", features: [
  { properties: { name: "Osm Cafe 0", lat: C.lat, lon: C.lng, formatted: "Koramangala", contact: { phone: "+91 80 5555 0000" }, place_id: "g0", datasource: { raw: { osm_id: 100, osm_type: "n" } } } },      // same as OSM → merged
  { properties: { name: "Geo Only Cafe", lat: C.lat + 0.002, lon: C.lng + 0.002, formatted: "5th Block, Koramangala", contact: { phone: "+91 80 7777 1111" }, website: "https://geoonly.example", place_id: "g1", categories: ["catering.cafe"] } }] };
const GOOGLE = [{ id: "G1", name: "Google Only Roasters", lat: C.lat + 0.003, lng: C.lng - 0.002, address: "1 Google St, Bengaluru", phone: "080 1234 5678", intlPhone: "+91 80 1234 5678", rating: 4.7, reviews: 1200, hours: "Mon: 8–8", mapsUrl: "https://maps.google.com/?cid=111", source: "Google Maps" }];
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function setup(ctx, o) {
  o = o || {}; const calls = { osm: 0, direct: [], geo: [], google: 0, exportPost: 0, ai: 0 };
  await ctx.addInitScript(() => { try { localStorage.setItem("fodo-consent", JSON.stringify({ analytics: false, t: Date.now() })); } catch (e) {} });
  await ctx.route("**/api/chat", (r) => r.fulfill({ status: 404, body: "" }));
  await ctx.route(/maps\.google\.com\/maps|tile\.openstreetmap/, (r) => r.fulfill({ status: 200, body: "" }));
  await ctx.route("**/api/enrich", (r) => r.fulfill(J({ ok: true, results: {}, places: {} })));
  await ctx.route(/photon\.komoot\.io/, (r) => r.fulfill(J({ features: [{ geometry: { coordinates: [C.lng, C.lat] }, properties: { name: "Koramangala", city: "Bengaluru", country: "India" } }] })));
  await ctx.route(/nominatim/, (r) => r.fulfill(J([])));
  await ctx.route(/\/api\/competitors\?/, async (r) => {
    const u = r.request().url();
    if (/health=1/.test(u)) return r.fulfill(J(Object.assign({ ok: true, version: "11.0", google: !!o.google, geoapify: !!o.geo, ai: !!o.ai, kv: true }, o.health || {})));
    calls.google++; if (o.googleDelay) await new Promise((x) => setTimeout(x, o.googleDelay));
    r.fulfill(J({ ok: true, source: "google", results: GOOGLE }));
  });
  await ctx.route(/\/api\/osm$/, (r) => { calls.osm++; calls.osmBody = r.request().postData(); return o.proxyDown ? r.fulfill(J({ ok: false, reason: "busy" }, 502)) : r.fulfill(J({ elements: OSM })); });
  await ctx.route(/overpass|maps\.mail\.ru/, (r) => { calls.direct.push(r.request().url()); r.fulfill(J({ elements: OSM.slice(0, 10) })); });
  await ctx.route(/\/api\/geo\?/, (r) => { calls.geo.push(r.request().url()); return o.geoDown ? r.fulfill(J({ ok: false, disabled: true }, 503)) : r.fulfill(J(GEO)); });
  await ctx.route(/\/api\/export$/, async (r) => {
    calls.exportPost++; const buf = r.request().postDataBuffer(); calls.exportBytes = buf; calls.exportType = r.request().headers()["content-type"]; calls.exportName = r.request().headers()["x-file-name"];
    r.fulfill(J({ ok: true, url: "/api/export?id=" + "a".repeat(24), name: calls.exportName }));
  });
  await ctx.route(/\/api\/export\?id=/, (r) => r.fulfill({ status: 200, headers: { "content-type": calls.exportType || XLSX_TYPE, "content-disposition": 'attachment; filename="' + (calls.exportName || "x.xlsx") + '"' }, body: calls.exportBytes || Buffer.from("") }));
  await ctx.route(/\/api\/brand-ai$/, (r) => { calls.ai++; calls.aiBody = JSON.parse(r.request().postData()); r.fulfill(J({ ok: true, items: [{ name: "Swiggy", website: "swiggy.com", country: "India", why: "food delivery" }, { name: "Tiny Pet Startup", website: "tinypet.example", country: "India", why: "same pet food niche" }] })); });
  await ctx.route(/wikidata\.org\/w\/api\.php/, (r) => {
    const u = decodeURIComponent(r.request().url());
    if (/wbsearchentities/.test(u)) { const s = (u.match(/search=([^&]+)/) || [])[1] || ""; return r.fulfill(J({ search: /swiggy/i.test(s) ? [{ id: "Q1", label: "Swiggy", description: "Indian food delivery company" }] : [] })); }
    if (/list=search/.test(u)) return r.fulfill(J({ query: { search: /pet/.test(u) ? [{ title: "Q2" }] : [] } }));
    const ids = (u.match(/ids=([^&]+)/) || [, ""])[1].split("|"), out = {};
    ids.forEach((id) => { out[id] = /props=labels&/.test(u) ? { labels: { en: { value: id } } } : { labels: { en: { value: id === "Q1" ? "Swiggy" : "Heads Up For Tails" } }, descriptions: { en: { value: id === "Q1" ? "food delivery company" : "Indian pet care brand" } }, claims: { P856: [{ rank: "normal", mainsnak: { datavalue: { value: id === "Q1" ? "https://swiggy.com" : "https://headsupfortails.com" } } }] } }; });
    r.fulfill(J({ entities: out }));
  });
  await ctx.route(/query\.wikidata/, (r) => r.fulfill(J({ results: { bindings: [] } })));
  return calls;
}
const done = (p) => p.waitForFunction(() => /businesses found|competitors of|not found|did not answer|No listed/.test(document.getElementById("cf-status").textContent) && !document.querySelector(".cf-status.busy"), null, { timeout: 20000 });
async function local(p, type) { await p.fill("#cf-type", type || "Cafe"); await p.keyboard.press("Escape"); await p.fill("#cf-area", "Koramangala, Bengaluru"); await p.keyboard.press("Escape"); await p.fill("#cf-radius", "3"); await p.click("#cf-go"); }

(async () => {
  const b = await chromium.launch();
  // ---------- A. desktop: three sources together, progressive, export rules ----------
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const calls = await setup(ctx, { google: true, geo: true, googleDelay: 2500 });
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(BASE + "/competitor-finder/"); await p.waitForTimeout(400);
    ok(await p.evaluate(() => window.FODO_CF_VERSION === "11" && !!window.FODO_EXPORT), "v11 engine + export module loaded");
    await local(p);
    await p.waitForFunction(() => document.querySelectorAll(".cf-item").length >= 40 && /found so far/.test(document.getElementById("cf-status").textContent), null, { timeout: 8000 }).then(() => ok(true, "results appear while Google is still searching (progressive)"), () => ok(false, "results appear while Google is still searching (progressive)"));
    ok(/OpenStreetMap · 40 found/.test(await p.textContent("#cf-srcs")) && /Google Maps · searching/.test(await p.textContent("#cf-srcs")), "chips show each source: OSM done, Google still searching");
    await done(p);
    const st = await p.textContent("#cf-status"), chips = await p.textContent("#cf-srcs");
    ok(/42 businesses found/.test(st) && /Google Maps \+ OpenStreetMap \+ Geoapify/.test(st), `all three merged & deduped: ${st.slice(0, 90)}`);
    ok(/Geoapify · 2 found/.test(chips) && /Google Maps · 1 found/.test(chips), "chips: Geoapify and Google results counted");
    ok(calls.osm === 1 && calls.direct.length === 0 && /around:3000,12\.935200,77\.624500/.test(calls.osmBody || ""), "OSM went through the cached proxy only (public servers untouched)");
    ok(calls.geo.length === 1 && /cat=catering\.cafe/.test(calls.geo[0]) && /radius=3000/.test(calls.geo[0]), "Geoapify asked once with the cafe category");
    const merged = await p.evaluate(() => window.FODO_CF.data().results.filter((x) => x.name === "Osm Cafe 0")[0]);
    ok(merged && merged.phone === "+91 80 5555 0000", "Geoapify phone filled into the matching OSM business");
    const list = await p.textContent("#cf-list");
    ok(/Google Only Roasters/.test(list) && /4\.7/.test(list) && /\+91 80 1234 5678|080 1234 5678/.test(list), "Google details shown on screen");
    const [dx] = await Promise.all([p.waitForEvent("download", { timeout: 10000 }), p.click("#cf-x-xlsx")]);
    ok(/^FODO-competitors-\d{4}-\d\d-\d\d\.xlsx$/.test(dx.suggestedFilename()), "desktop: Excel downloads straight away (no dialog)");
    const wb = XL.readFile(await dx.path()), rows = XL.utils.sheet_to_json(wb.Sheets["Local competitors"]);
    ok(wb.SheetNames.join() === "Summary,Local competitors" && rows.length === 42, `Excel opens: ${wb.SheetNames} · ${rows.length} rows`);
    const g = rows.filter((r) => r.Name === "Google Only Roasters")[0] || {}, geo = rows.filter((r) => r.Name === "Geo Only Cafe")[0] || {};
    ok(g["Google Maps"] === "https://maps.google.com/?cid=111" && !g.Phone && !g.Rating && !g.Address && !g.Latitude && /Google's terms/.test(g.Note || ""), "Google-only row: name + Google Maps link, Google's details left out with a note");
    ok(geo.Phone === "+91 80 7777 1111" && geo.Website === "https://geoonly.example" && geo.Source === "Geoapify", "Geoapify row exported in full");
    ok(!errs.length, "no page errors" + (errs.length ? ": " + errs[0] : ""));
    // reload: the sheet is still there (IndexedDB)
    await p.waitForTimeout(500); await p.reload(); await p.waitForTimeout(900);
    ok(/^42 competitors/.test(await p.textContent("#cf-sheet-n")), "sheet survives a reload (IndexedDB): " + (await p.textContent("#cf-sheet-n")).slice(0, 40));
    await ctx.close();
  }
  // ---------- B. proxy down → public servers; Geoapify off; old localStorage sheet moved over ----------
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => { if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", 1); localStorage.setItem("fodo-cf-sheet2", JSON.stringify({ local: [{ key: "old|1", search: "Old search", name: "Old Row" }], brand: [], searches: ["Old search"] })); } });
    const calls = await setup(ctx, { geo: true, geoDown: true, proxyDown: true });
    const p = await ctx.newPage(); await p.goto(BASE + "/competitor-finder/"); await p.waitForTimeout(600);
    ok(/^1 competitors/.test(await p.textContent("#cf-sheet-n")), "older sheet from localStorage is kept");
    await local(p); await done(p);
    ok(calls.osm === 1 && calls.direct.length >= 1 && /private\.coffee/.test(calls.direct[0]), "proxy busy → asks the public Overpass server directly");
    ok(/10 businesses found/.test(await p.textContent("#cf-status")), "results still arrive");
    ok(/Geoapify · did not answer/.test(await p.textContent("#cf-srcs")), "Geoapify failure shown on its chip, search carries on");
    await p.waitForTimeout(700);
    ok(await p.evaluate(() => localStorage.getItem("fodo-cf-sheet2") === null) && /^11 competitors/.test(await p.textContent("#cf-sheet-n")), "old sheet moved to IndexedDB (localStorage freed), new rows added");
    await ctx.close();
  }
  // ---------- C. brand not on Wikidata: keywords + AI still find competitors ----------
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    const calls = await setup(ctx, { ai: true });
    const p = await ctx.newPage(); await p.goto(BASE + "/competitor-finder/#brands"); await p.waitForTimeout(400);
    await p.selectOption("#cf-country", { index: 0 });
    await p.fill("#cf-brand", "pet food startup"); await p.keyboard.press("Escape"); await p.click("#cfb-go"); await done(p);
    const st = await p.textContent("#cf-status"), list = await p.textContent("#cf-list"), chips = await p.textContent("#cf-srcs");
    ok(/competitors of/.test(st) && /AI/.test(st), "brand missing on Wikidata → no dead end: " + st.slice(0, 80));
    ok(/Swiggy/.test(list) && /Heads Up For Tails/.test(list) && /Tiny Pet Startup/.test(list), "AI names, keyword matches and AI-only names all listed");
    ok(/AI suggestion — verify/.test(list) && /AI \+ Wikidata/.test(list) && /Similar description/.test(list), "each card says how it was found; unconfirmed AI names flagged");
    ok(calls.ai === 1 && calls.aiBody.brand === "pet food startup", "AI asked once");
    ok(/AI suggestions · 2 suggested · 1 confirmed/.test(chips) && /brand not on Wikidata/.test(chips), "chips explain each layer: " + chips);
    ok(/Not on Wikidata yet/.test(await p.textContent("#cf-brandcard")), "search card explains the brand is not on Wikidata");
    await ctx.close();
  }
  // ---------- D. phone: save dialog, share sheet, server download, in-app hint, clipboard fallback ----------
  for (const variant of ["safari", "instagram"]) {
    const dev = devices["iPhone 13"];
    const ctx = await b.newContext(Object.assign({}, dev, { userAgent: dev.userAgent + (variant === "instagram" ? " Instagram 300.0.0" : ""), acceptDownloads: true }));
    await ctx.addInitScript(() => {
      window.__shared = null;
      navigator.canShare = (d) => !!(d && d.files && d.files.length);
      navigator.share = (d) => { window.__shared = { name: d.files[0].name, size: d.files[0].size, type: d.files[0].type }; return Promise.resolve(); };
      Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("blocked")) } });
    });
    const calls = await setup(ctx, {});
    const p = await ctx.newPage(); await p.goto(BASE + "/competitor-finder/"); await p.waitForTimeout(400);
    await local(p); await done(p);
    await p.click("#cf-x-xlsx");
    await p.waitForSelector(".cfx:not([hidden])", { timeout: 4000 });
    const txt = await p.textContent(".cfx-box");
    ok(/Save or share file/.test(txt) && /Download/.test(txt) && /Files/.test(txt), `${variant}: phone gets the save dialog (share + download + where to find it)`);
    ok(variant === "instagram" ? /Open in browser/.test(txt) : !/Open in browser/.test(txt), `${variant}: in-app browser hint ${variant === "instagram" ? "shown" : "not shown"}`);
    await p.click(".cfx [data-a=share]"); await p.waitForTimeout(300);
    const sh = await p.evaluate(() => window.__shared);
    ok(sh && /\.xlsx$/.test(sh.name) && sh.size > 1000 && /spreadsheetml/.test(sh.type), `${variant}: share sheet receives the real .xlsx file (${sh && sh.size} bytes)`);
    await p.waitForSelector(".cfx", { state: "hidden", timeout: 4000 });
    await p.click("#cf-x-csv"); await p.waitForSelector(".cfx:not([hidden])");
    const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 10000 }), p.click(".cfx [data-a=server]")]);
    const csv = require("fs").readFileSync(await dl.path(), "utf8");
    ok(calls.exportPost === 1 && /text\/csv/.test(calls.exportType) && dl.suggestedFilename().endsWith(".csv") && csv.charCodeAt(0) === 0xFEFF && /Osm Cafe 3/.test(csv), `${variant}: "Download" goes through a normal web download (works in app browsers)`);
    await p.keyboard.press("Escape");
    await p.click("#cf-x-copy"); await p.waitForSelector(".cfx-ta", { timeout: 4000 });
    const ta = await p.inputValue(".cfx-ta");
    ok(/^Search\tName\t/.test(ta) && /Osm Cafe 0/.test(ta), `${variant}: clipboard blocked → rows shown ready to copy`);
    const box = await p.evaluate(() => { const r = document.querySelector(".cfx-box").getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth }; });
    ok(box.l >= 0 && box.r <= box.w, `${variant}: dialog fits the phone screen`);
    await p.screenshot({ path: path.join(__dirname, "../../v11-phone-" + variant + ".png") });
    await ctx.close();
  }
  await b.close();
  console.log(`\nv11 finder: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})();
