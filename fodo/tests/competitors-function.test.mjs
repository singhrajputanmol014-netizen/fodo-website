// Unit tests for functions/api/competitors.js with fetch and KV mocked. Run: node tests/competitors-function.test.mjs
import { onRequestGet } from "../functions/api/competitors.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const kv = () => { const m = new Map(); return { get: async (k, t) => { const v = m.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; }, put: async (k, v) => { m.set(k, v); }, m }; };
const req = (qs, ip = "1.1.1.1") => ({ request: new Request("https://www.fodo.co.in/api/competitors?" + qs, { headers: { "cf-connecting-ip": ip } }) });
let seen = [];
const mockFetch = (handlers) => { globalThis.fetch = async (u, o) => { u = String(u); seen.push({ u, o }); for (const [re, fn] of handlers) if (re.test(u)) return fn(u, o); return new Response("nope", { status: 500 }); }; };
const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

// 1. validation
let r = await onRequestGet({ ...req("type=&area="), env: {} }); ok(r.status === 400, "missing type/area → 400");
// 2. OSM path
mockFetch([[/nominatim/, () => J([{ lat: "28.5921", lon: "77.0460", display_name: "Dwarka, Delhi" }])],
  [/overpass/, (u, o) => { ok(/amenity"~"\^\(dentist\)\$"/.test(decodeURIComponent(o.body)), "OSM query uses dentist tags"); return J({ elements: [
    { type: "node", id: 1, lat: 28.593, lon: 77.047, tags: { name: "Smile Dental", "addr:street": "Sector 10", phone: "+91 11 1111", amenity: "dentist" } },
    { type: "way", id: 2, center: { lat: 28.60, lon: 77.05 }, tags: { name: "Far Dental", amenity: "dentist", website: "https://far.example" } },
    { type: "node", id: 3, lat: 28.593, lon: 77.047, tags: { name: "Smile Dental", amenity: "dentist" } },
    { type: "node", id: 4, lat: 28.7, lon: 77.3, tags: { name: "Way Too Far", amenity: "dentist" } }, { type: "node", id: 5, lat: 28.59, lon: 77.04, tags: { amenity: "dentist" } }] }); }]]);
const K = kv(); r = await onRequestGet({ ...req("type=Dentist&area=Dwarka&radius=2000"), env: { CHAT_KV: K } }); let j = await r.json();
ok(r.status === 200 && j.ok && j.source === "osm", "no Google key → OpenStreetMap source");
ok(j.results.length === 2, `dedupes, drops unnamed and far-away places (${j.results.map((x) => x.name)})`);
ok(j.results[0].name === "Smile Dental" && j.results[0].distance < j.results[1].distance, "sorted nearest first with distance");
ok(/google\.com\/maps\/search\/\?api=1&query=Smile%20Dental/.test(j.results[0].mapsUrl), "OSM results get a Google Maps link");
ok(j.results[0].phone && j.results[1].website, "phone and website carried through");
seen = []; r = await onRequestGet({ ...req("type=Dentist&area=Dwarka&radius=2000"), env: { CHAT_KV: K } }); j = await r.json();
ok(j.cached === true && seen.length === 0, "second identical search served from cache");
// 3. Google path
mockFetch([[/places\.googleapis/, (u, o) => { ok(o.headers["X-Goog-Api-Key"] === "KEY" && /googleMapsUri/.test(o.headers["X-Goog-FieldMask"]), "Google request sends key and field mask"); { const bd = JSON.parse(o.body); ok(bd.textQuery === "Cafe" && bd.locationRestriction && bd.locationRestriction.rectangle && bd.pageSize === 20, "Google query is the category, restricted to the area rectangle"); } return J({ places: [
  { id: "a", displayName: { text: "Chai Adda" }, formattedAddress: "Sector 18, Noida", location: { latitude: 28.570, longitude: 77.321 }, rating: 4.5, userRatingCount: 900, googleMapsUri: "https://maps.google.com/?cid=9", nationalPhoneNumber: "0120 000", businessStatus: "OPERATIONAL", currentOpeningHours: { openNow: true }, primaryTypeDisplayName: { text: "Cafe" } },
  { id: "b", displayName: { text: "Brew" }, formattedAddress: "Sector 18, Noida", location: { latitude: 28.571, longitude: 77.322 }, rating: 4.1, userRatingCount: 50 }] }); }]]);
r = await onRequestGet({ ...req("type=Cafe&area=Noida%20Sector%2018"), env: { GOOGLE_PLACES_KEY: "KEY" } }); j = await r.json();
ok(j.source === "google" && j.results.length === 2, "Google key → Google Places source");
ok(j.results.find((x) => x.name === "Chai Adda").mapsUrl === "https://maps.google.com/?cid=9" && j.results[0].rating != null && j.results[0].reviews != null, "Google results keep listing link, rating and reviews");
// 4. Google failure falls back to OSM
mockFetch([[/places\.googleapis/, () => J({ error: "denied" }, 403)], [/nominatim/, () => J([{ lat: "28.6", lon: "77.0", display_name: "x" }])], [/overpass/, () => J({ elements: [{ type: "node", id: 1, lat: 28.739, lon: 77.083, tags: { name: "Fallback Gym", leisure: "fitness_centre" } }] })]]);
r = await onRequestGet({ ...req("type=Gym&area=Rohini"), env: { GOOGLE_PLACES_KEY: "BAD" } }); j = await r.json();
ok(j.ok && j.source === "osm" && j.results[0].name === "Fallback Gym", "Google error → falls back to OpenStreetMap");
// 5. area not found
mockFetch([[/nominatim/, () => J([])], [/photon/, () => J({ features: [] })]]); r = await onRequestGet({ ...req("type=Gym&area=Nowhereville"), env: {} }); j = await r.json();
ok(j.ok && j.results.length === 0 && /not found/i.test(j.note), "unknown area returns a helpful note");
// 6. services down
mockFetch([]); r = await onRequestGet({ ...req("type=Gym&area=Rohini"), env: {} }); ok(r.status === 502, "map services down → 502 with a reason");
// 7. rate limit
const K2 = kv(); mockFetch([[/nominatim/, () => J([])], [/photon/, () => J({ features: [] })]]);
for (let i = 0; i < 3; i++) await onRequestGet({ ...req("type=Gym&area=X" + i, "9.9.9.9"), env: { CHAT_KV: K2, CF_PER_HOUR: "3" } });
r = await onRequestGet({ ...req("type=Gym&area=Y", "9.9.9.9"), env: { CHAT_KV: K2, CF_PER_HOUR: "3" } }); ok(r.status === 429, "per-visitor hourly limit → 429");
// 8. lat/lng search skips geocoding
seen = []; mockFetch([[/overpass/, (u, o) => { ok(/around:1000,28\.610000,77\.210000/.test(decodeURIComponent(o.body)), "uses the visitor's location as the centre"); return J({ elements: [] }); }]]);
await onRequestGet({ ...req("type=Salon&area=&lat=28.61&lng=77.21&radius=1000"), env: {} }); ok(!seen.some((s) => /limit=1&/.test(s.u)), "no geocoding when location is given");
// 9. popular area needs no geocoding; busy main Overpass falls back to a mirror
seen = []; mockFetch([[/overpass-api\.de/, () => new Response("busy", { status: 504 })], [/private\.coffee/, () => J({ elements: [{ type: "node", id: 7, lat: 28.6495, lon: 77.1225, tags: { name: "Mirror Cafe", amenity: "cafe" } }] })]]);
r = await onRequestGet({ ...req("type=Cafe&area=Rajouri%20Garden"), env: {} }); j = await r.json();
ok(j.ok && j.results[0].name === "Mirror Cafe", "main Overpass busy → mirror server answers");
ok(!seen.some((x) => /limit=1&/.test(x.u)), "popular area uses built-in coordinates (no geocoding call)");
// 10. Nominatim down → Photon geocoder
mockFetch([[/nominatim/, () => new Response("x", { status: 429 })], [/photon/, () => J({ features: [{ geometry: { coordinates: [77.05, 28.58] }, properties: { name: "Sector 12" } }] })], [/overpass/, () => J({ elements: [{ type: "node", id: 8, lat: 28.581, lon: 77.051, tags: { name: "Photon Salon", shop: "hairdresser" } }] })]]);
r = await onRequestGet({ ...req("type=Salon&area=Dwarka%20Sector%2012"), env: {} }); j = await r.json();
ok(j.ok && j.results[0].name === "Photon Salon", "Nominatim blocked → backup geocoder works");
// 11. everything times out → clear 502, never hangs
globalThis.fetch = (u, o) => { if (!o || !o.signal) throw new Error("no timeout signal on " + u); return new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("t"), { name: "TimeoutError" })), 30)); };
const t0 = Date.now(); r = await onRequestGet({ ...req("type=Cafe&area=Saket"), env: {} }); j = await r.json();
ok(r.status === 502 && /timeout/.test(j.errors.join()) && Date.now() - t0 < 30000, `slow servers → 502 with reason in ${Math.round((Date.now() - t0) / 1000)}s`);
// 12. Overpass down → Photon category search (Nominatim is only used to find the place, never to list businesses)
mockFetch([[/overpass|mail\.ru/, () => new Response("x", { status: 429 })], [/nominatim/, (u) => { ok(/limit=1&/.test(u) && !/bounded=1/.test(u), "Nominatim only geocodes (one result, no box search)"); return J([{ lat: "28.7385", lon: "77.0825", display_name: "Rohini" }]); }],
  [/photon.*limit=50/, () => J({ features: [{ geometry: { coordinates: [77.0826, 28.7386] }, properties: { name: "Photon Gym", osm_key: "leisure", osm_value: "fitness_centre", osm_type: "N", osm_id: 5 } }] })]]);
r = await onRequestGet({ ...req("type=Gym&area=Rohini"), env: {} }); j = await r.json();
ok(j.ok && j.via === "photon" && j.results[0].name === "Photon Gym", "Overpass down → Photon results");
mockFetch([[/overpass/, () => new Response("x", { status: 504 })], [/nominatim/, () => new Response("x", { status: 403 })], [/photon/, (u) => { ok(/osm_tag=amenity%3Acafe/.test(u) && /bbox=/.test(u), "Photon uses category tag and box"); return J({ features: [{ geometry: { coordinates: [77.122, 28.6493] }, properties: { name: "Photon Cafe", street: "Ring Rd", osm_value: "cafe", osm_type: "N", osm_id: 9 } }] }); }]]);
r = await onRequestGet({ ...req("type=Cafe&area=Rajouri%20Garden"), env: {} }); j = await r.json();
ok(j.ok && j.via === "photon" && j.results[0].name === "Photon Cafe", "Overpass + Nominatim down → Photon results");
r = await onRequestGet({ ...req("health=1"), env: { CHAT_KV: kv() } }); j = await r.json(); ok(j.ok && j.google === false && j.kv === true, "health check");
// 13. Google pagination (3 pages → 60) and tiles
{ let page = 0; mockFetch([[/places\.googleapis/, (u, o) => { const bd = JSON.parse(o.body); page++; ok(page === 1 ? !bd.pageToken : bd.pageToken === "T" + (page - 1), "page " + page + " uses the previous nextPageToken");
  return J({ places: Array.from({ length: 20 }, (_, i) => ({ id: page + "-" + i, displayName: { text: "G" + page + "-" + i }, location: { latitude: 28.57 + i * 1e-4, longitude: 77.32 }, internationalPhoneNumber: "+91 1", regularOpeningHours: { weekdayDescriptions: ["Mon: 9–5"] } })), nextPageToken: page < 3 ? "T" + page : undefined }); }]]);
  r = await onRequestGet({ ...req("type=Cafe&lat=28.57&lng=77.32&radius=3000", "5.5.5.5"), env: { GOOGLE_PLACES_KEY: "K" } }); j = await r.json();
  ok(j.results.length === 60 && j.results[0].intlPhone === "+91 1" && /Mon/.test(j.results[0].hours), "Google returns all 3 pages (60) with phone and hours"); }
mockFetch([[/places\.googleapis/, (u, o) => { const bd = JSON.parse(o.body); ok(bd.locationRestriction.rectangle.low.latitude === 28.5, "tile request uses the given rectangle"); return J({ places: [] }); }]]);
await onRequestGet({ ...req("type=Cafe&rect=28.5,77.2,28.6,77.3", "6.6.6.6"), env: { GOOGLE_PLACES_KEY: "K" } });
// 14. radius up to 100 km
seen = []; mockFetch([[/overpass/, (u, o) => J({ elements: [] })], [/nominatim|photon/, () => J([])]]);
await onRequestGet({ ...req("type=Cafe&lat=28.6&lng=77.2&radius=100000", "7.7.7.7"), env: {} });
ok(seen.some((x) => /around:100000/.test(decodeURIComponent(x.o && x.o.body || ""))), "radius up to 100 km is passed through");
// 15. enrich: SSRF guard + extraction
{ const E = await import("../functions/api/enrich.js");
  ok(!E.safeUrl("http://127.0.0.1/") && !E.safeUrl("http://10.0.0.5") && !E.safeUrl("http://localhost:3000") && !E.safeUrl("ftp://x.com") && !!E.safeUrl("example.com"), "enrich refuses private and non-web addresses");
  mockFetch([[/brew\.co\/contact/, () => new Response('<a href="tel:+911112223334">c</a> sales@brew.co', { headers: { "content-type": "text/html" } })],
             [/brew\.co/, () => new Response('<title>Brew</title><a href="mailto:hi@brew.co">m</a><a href="https://instagram.com/brew">i</a><a href="/contact">c</a>', { headers: { "content-type": "text/html" } })]]);
  const res = await (await E.onRequestPost({ request: new Request("https://x/api/enrich", { method: "POST", body: JSON.stringify({ urls: ["https://brew.co", "http://192.168.0.1", "a", "b", "c"] }) }), env: {} })).json();
  const x = res.results["https://brew.co"];
  ok(x && x.emails.join() === "hi@brew.co,sales@brew.co" && x.phones[0] === "+911112223334" && /instagram\.com\/brew/.test(x.instagram) && x.title === "Brew", "enrich reads home + contact page for emails, phones, socials");
  ok(res.results["http://192.168.0.1"].error && Object.keys(res.results).length === 4, "enrich skips private hosts and caps a batch at 4"); }
// 16. enrich: JSON-LD + Google listing lookup by name
{ const E = await import("../functions/api/enrich.js");
  mockFetch([[/places\.googleapis/, (u, o) => { const bd = JSON.parse(o.body); ok(bd.textQuery === "Acme Startup" && bd.locationRestriction, "Google lookup searches the company name near its HQ"); return J({ places: [{ id: "x", displayName: { text: "Acme Startup" }, location: { latitude: 12.9, longitude: 77.6 }, formattedAddress: "MG Road", rating: 4.1, userRatingCount: 50, googleMapsUri: "https://maps.google.com/?cid=1", internationalPhoneNumber: "+91 80 1" }] }); }],
             [/acme\.example/, () => new Response('<script type="application/ld+json">{"@type":"Organization","telephone":"+91 80 5555 6666","email":"hi@acme.example","address":{"streetAddress":"1 Main St","addressLocality":"Pune"}}</script>', { headers: { "content-type": "text/html" } })]]);
  const res = await (await E.onRequestPost({ request: new Request("https://x/api/enrich", { method: "POST", body: JSON.stringify({ urls: ["https://acme.example"], places: [{ key: "Q7", name: "Acme Startup", near: "Bengaluru", lat: 12.97, lng: 77.59 }] }) }), env: { GOOGLE_PLACES_KEY: "K" } })).json();
  ok(res.results["https://acme.example"].emails[0] === "hi@acme.example" && res.results["https://acme.example"].phones[0] === "+918055556666" && /1 Main St, Pune/.test(res.results["https://acme.example"].address), "enrich reads schema.org JSON-LD (phone, email, address)");
  ok(res.places.Q7 && res.places.Q7.rating === 4.1 && res.places.Q7.mapsUrl === "https://maps.google.com/?cid=1", "enrich returns the Google Maps listing for a company");
  const noKey = await (await E.onRequestPost({ request: new Request("https://x/api/enrich", { method: "POST", body: JSON.stringify({ places: [{ key: "a", name: "A" }] }) }), env: {} })).json();
  ok(noKey.ok && noKey.google === false && !Object.keys(noKey.places).length, "without a Google key, place lookups are skipped cleanly"); }
console.log(`\ncompetitors function: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
