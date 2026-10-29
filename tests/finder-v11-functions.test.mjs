// v11 Competitor Finder server functions: /api/osm, /api/geo, /api/brand-ai, /api/export, hedged(). fetch, KV and AI mocked.
// Run: node tests/finder-v11-functions.test.mjs
import * as OSM from "../functions/api/osm.js";
import * as GEO from "../functions/api/geo.js";
import * as BAI from "../functions/api/brand-ai.js";
import * as EXP from "../functions/api/export.js";
import { hedged } from "../functions/_lib/finder-common.js";
import { overpassQuery, geoCats, fromGeoapify, GEO_CATS } from "../functions/_lib/free-places.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const kv = () => { const m = new Map(); return { m,
  get: async (k, t) => { const v = m.get(k); if (v == null) return null; const x = v.v; return t === "json" ? JSON.parse(x) : t === "arrayBuffer" ? (typeof x === "string" ? new TextEncoder().encode(x).buffer : x) : typeof x === "string" ? x : new TextDecoder().decode(x); },
  getWithMetadata: async (k, t) => { const v = m.get(k); return v ? { value: v.v, metadata: v.meta } : { value: null, metadata: null }; },
  put: async (k, v, o) => { m.set(k, { v, meta: o && o.metadata, ttl: o && o.expirationTtl }); } }; };
const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
let seen = [];
const mock = (handlers) => { globalThis.fetch = async (u, o = {}) => { u = String(u); seen.push({ u, o }); for (const [re, fn] of handlers) if (re.test(u)) return fn(u, o); return new Response("nope", { status: 500 }); }; };
const post = (path, body, headers = {}) => new Request("https://www.fodo.co.in" + path, { method: "POST", body, headers: Object.assign({ "cf-connecting-ip": "2.2.2.2" }, headers) });
const get = (path) => new Request("https://www.fodo.co.in" + path, { headers: { "cf-connecting-ip": "2.2.2.2" } });

/* ---------- query builder ↔ proxy validator ---------- */
const q1 = overpassQuery("Cafe", { lat: 12.9352, lng: 77.6245 }, 3000), q2 = overpassQuery("Software company", { lat: 28.6, lng: 77.2 }, 100000), q3 = overpassQuery("Pet groomer", { lat: -33.86, lng: 151.2 }, 500);
ok([q1, q2, q3].every(OSM.validQuery), "every query the finder builds passes the proxy's check");
ok(/around:3000,12\.935200,77\.624500/.test(q1) && /\[timeout:25\]/.test(q1), "decimal coordinates + short timeout for a small circle");
ok(/\[timeout:60\]/.test(q2) && !/name"~/.test(q2), "100 km: longer timeout and no slow name search");
ok(!OSM.validQuery("[out:json][timeout:25];node(1);out;") && !OSM.validQuery(q1.replace("out center tags", "make x; out center tags")) && !OSM.validQuery("x".repeat(7000)), "other Overpass queries are refused");
ok(geoCats("Cafe").cat === "catering.cafe" && geoCats("Dentist").cat === "healthcare.dentist" && geoCats("Pet groomer").cat === "pet" && geoCats("Glass blower").name === "Glass blower", "business type → Geoapify category (or name search)");
ok(GEO_CATS.every(([, c]) => /^[a-z_.]+(,[a-z_.]+){0,20}$/.test(c)), "every Geoapify category passes /api/geo's check");

/* ---------- /api/osm ---------- */
let r = await OSM.onRequestPost({ request: post("/api/osm", "[out:json][timeout:25];node(1);out;"), env: {} }); ok(r.status === 400, "osm: not a finder query → 400");
const BODY = JSON.stringify({ elements: [{ type: "node", id: 1, lat: 12.93, lon: 77.62, tags: { name: "A Cafe", amenity: "cafe" } }] });
mock([[/private\.coffee/, (u, o) => { ok(/^data=/.test(o.body) && /FODO-CompetitorFinder/.test(o.headers["user-agent"]), "osm: identifies itself to the server (policy)"); return new Response(BODY, { status: 200 }); }]]);
const K = kv(); r = await OSM.onRequestPost({ request: post("/api/osm", q1), env: { CHAT_KV: K } });
ok(r.status === 200 && (await r.text()) === BODY && r.headers.get("x-cache") === "miss", "osm: passes the answer through byte for byte");
seen = []; r = await OSM.onRequestPost({ request: post("/api/osm", q1), env: { CHAT_KV: K } });
ok(r.headers.get("x-cache") === "hit" && seen.length === 0 && (await r.text()) === BODY, "osm: repeat search served from the 24 h cache");
ok([...K.m.values()].some((x) => x.ttl === 86400), "osm: cache entry lives 24 hours");
// first server slow → second one answers (hedged)
mock([[/private\.coffee/, () => new Promise((res) => setTimeout(() => res(new Response(BODY)), 20000))], [/mail\.ru/, () => new Response(JSON.stringify({ elements: [] }))]]);
let t0 = Date.now(); r = await OSM.onRequestPost({ request: post("/api/osm", q3), env: {} });
ok(r.status === 200 && r.headers.get("x-server") === "maps.mail.ru" && Date.now() - t0 < 12000, `osm: slow first server → second server answers in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
// runtime error is not cached
mock([[/private\.coffee/, () => new Response('{"elements":[],"remark":"runtime error: Query timed out in \\"query\\" at line 1 after 25 seconds."}')]]);
const K2 = kv(); r = await OSM.onRequestPost({ request: post("/api/osm", q1), env: { CHAT_KV: K2 } }); await r.text();
ok(![...K2.m.keys()].some((k) => k.startsWith("osm:v1")), "osm: an Overpass timeout answer is never cached");
// all down
mock([[/./, () => new Response("busy", { status: 504 })]]);
r = await OSM.onRequestPost({ request: post("/api/osm", q1 + " "), env: {} }); let j = await r.json();
ok(r.status === 502 && j.tried.length === 3, "osm: all three servers down → 502 listing each (" + j.tried.join(", ") + ")");
const KL = kv(); mock([[/private\.coffee/, () => new Response(BODY)]]);
for (let i = 0; i < 2; i++) await OSM.onRequestPost({ request: post("/api/osm", overpassQuery("Gym", { lat: 1 + i, lng: 2 }, 1000)), env: { CHAT_KV: KL, OSM_PER_HOUR: "2" } });
r = await OSM.onRequestPost({ request: post("/api/osm", overpassQuery("Gym", { lat: 9, lng: 2 }, 1000)), env: { CHAT_KV: KL, OSM_PER_HOUR: "2" } }); ok(r.status === 429, "osm: hourly limit per visitor → 429");

/* ---------- /api/geo ---------- */
r = await GEO.onRequestGet({ request: get("/api/geo?health=1"), env: {} }); j = await r.json(); ok(j.enabled === false, "geo: health says disabled without a key");
r = await GEO.onRequestGet({ request: get("/api/geo?cat=catering.cafe&lat=1&lng=2"), env: {} }); ok(r.status === 503, "geo: no key → 503 (finder skips the source)");
r = await GEO.onRequestGet({ request: get("/api/geo?cat=x;drop&lat=1&lng=2"), env: { GEOAPIFY_KEY: "G" } }); ok(r.status === 400, "geo: bad category → 400");
const GJ = { type: "FeatureCollection", features: [{ properties: { name: "Blue Tokai", formatted: "80 Feet Rd, Koramangala, Bengaluru 560034, India", lat: 12.935, lon: 77.624, city: "Bengaluru", postcode: "560034", country: "India", categories: ["catering.cafe"], place_id: "abc",
  contact: { phone: "+91 80 4000 0000" }, website: "https://bluetokai.com", opening_hours: "Mo-Su 08:00-23:00", datasource: { raw: { osm_id: 77, osm_type: "n", "contact:instagram": "bluetokai", cuisine: "coffee", amenity: "cafe" } } } }, { properties: { lat: 1, lon: 2 } }] };
mock([[/api\.geoapify\.com/, (u) => { ok(/apiKey=G/.test(u) && /categories=catering\.cafe/.test(u) && /filter=circle:77\.62450,12\.93520,3000/.test(u) && /limit=500/.test(u), "geo: key stays on the server, circle + 500 per page"); return J(GJ); }]]);
const KG = kv(); r = await GEO.onRequestGet({ request: get("/api/geo?cat=catering.cafe&lat=12.9352&lng=77.6245&radius=3000&offset=0"), env: { GEOAPIFY_KEY: "G", CHAT_KV: KG } }); j = await r.json();
ok(j.features.length === 2 && r.headers.get("x-cache") === "miss", "geo: Geoapify answer passed through");
seen = []; r = await GEO.onRequestGet({ request: get("/api/geo?cat=catering.cafe&lat=12.9352&lng=77.6245&radius=3000&offset=0"), env: { GEOAPIFY_KEY: "G", CHAT_KV: KG } }); await r.text();
ok(seen.length === 0 && r.headers.get("x-cache") === "hit", "geo: repeat served from 7-day cache (saves credits)");
const g0 = fromGeoapify(GJ.features[0]), g1 = fromGeoapify(GJ.features[1]);
ok(g0 && g0.name === "Blue Tokai" && g0.phone === "+91 80 4000 0000" && g0.website === "https://bluetokai.com" && /instagram\.com\/bluetokai/.test(g0.instagram || "") && g0.source === "Geoapify" && g0.osmUrl === "https://www.openstreetmap.org/node/77" && g1 === null,
  "geo: records normalised to the finder's shape (phone, website, socials, OSM link); nameless dropped");

/* ---------- /api/brand-ai ---------- */
ok(BAI.parseItems('Sure! ```json\n[{"name":"Swiggy","website":"swiggy.com","country":"India","why":"food delivery"},{"name":"swiggy"},"Zepto",{"name":"Bad","website":"javascript:alert(1)"}]\n```').map((x) => x.name + "|" + x.website).join(",") === "Swiggy|swiggy.com,Zepto|,Bad|", "brand-ai: JSON array pulled out of chatty text, deduped, unsafe links dropped");
ok(BAI.parseItems("no json here").length === 0 && BAI.parseItems("[1,2").length === 0, "brand-ai: junk → empty list");
r = await BAI.onRequestPost({ request: post("/api/brand-ai", JSON.stringify({ brand: "Zomato" })), env: {} }); ok(r.status === 503, "brand-ai: no AI binding → 503");
let calls = 0; const AI = { run: async (model, inp) => { calls++; if (model.includes("70b")) throw new Error("capacity"); ok(/Zomato/.test(inp.messages[1].content) && /India/.test(inp.messages[1].content), "brand-ai: prompt carries brand + market"); return { response: '[{"name":"Swiggy","website":"swiggy.com","country":"India","why":"Same food delivery market"}]' }; } };
const KB = kv(); r = await BAI.onRequestPost({ request: post("/api/brand-ai", JSON.stringify({ brand: "Zomato", description: "food delivery", country: "India" })), env: { AI, CHAT_KV: KB } }); j = await r.json();
ok(j.ok && j.items[0].name === "Swiggy" && /8b/.test(j.model) && calls === 2, "brand-ai: big model busy → smaller model answers");
r = await BAI.onRequestPost({ request: post("/api/brand-ai", JSON.stringify({ brand: "Zomato", description: "food delivery", country: "India" })), env: { AI, CHAT_KV: KB } }); j = await r.json();
ok(j.cached && calls === 2, "brand-ai: same question served from cache");
r = await BAI.onRequestPost({ request: post("/api/brand-ai", JSON.stringify({ brand: "X" })), env: { AI: { run: async () => ({ response: "I cannot" }) } } }); ok(r.status === 502, "brand-ai: useless answer → 502 (finder carries on without AI)");

/* ---------- /api/brand-ai with Google grounding (Serper) ---------- */
{ const qs = []; let prompt = "";
  mock([[/google\.serper\.dev/, (u, o) => { const bd = JSON.parse(o.body); qs.push(bd.q + "|" + (bd.gl || "")); ok(o.headers["x-api-key"] === "SK", "brand-ai: Serper key sent server-side only"); return J({ organic: [{ title: "Top Zomato competitors in India", link: "https://g.test/list", snippet: "Swiggy, EatSure and Magicpin compete with Zomato in food delivery." }, { title: "G2: Zomato alternatives", link: "https://www.g2.com/x", snippet: "Compare Zomato with DoorDash." }] }); }]]);
  const AIw = { run: async (m, inp) => { prompt = inp.messages[1].content; return { response: '[{"name":"Swiggy","src":2},{"name":"Magicpin","src":1},{"name":"Rebel Foods","src":1},{"name":"DoorDash","src":0}]' }; } };
  r = await BAI.onRequestPost({ request: post("/api/brand-ai", JSON.stringify({ brand: "Zomato", country: "India", web: true })), env: { AI: AIw, SERPER_API_KEY: "SK", CHAT_KV: kv() } }); j = await r.json();
  ok(qs.join() === "Zomato competitors|in,Zomato alternatives|in", "brand-ai: two Google searches (competitors, alternatives) for India");
  ok(/\[1\] Top Zomato competitors/.test(prompt) && /src/.test(prompt), "brand-ai: numbered Google results given to the model as context");
  const src = Object.fromEntries(j.items.map((x) => [x.name, x.source]));
  ok(src.Swiggy === "https://g.test/list" && src.Magicpin === "https://g.test/list" && src["Rebel Foods"] === "" && src.DoorDash === "https://www.g2.com/x" && j.grounded === 2, "brand-ai: a name is 'from Google' only if that result really contains it (model's own src corrected / ignored)");
  r = await BAI.onRequestGet({ env: { AI: AIw, SERPER_API_KEY: "SK" } }); j = await r.json(); ok(j.web === true && j.ai === true, "brand-ai health reports Google grounding"); }

/* ---------- /api/export ---------- */
const KE = kv(), bytes = new Uint8Array([80, 75, 3, 4, 1, 2, 3]);
r = await EXP.onRequestPost({ request: post("/api/export", bytes, { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "x-file-name": "FODO competitors 2026.xlsx" }), env: { CHAT_KV: KE } }); j = await r.json();
ok(j.ok && /^\/api\/export\?id=[a-f0-9]{24}$/.test(j.url) && j.name === "FODO-competitors-2026.xlsx", "export: file stored, safe name, one-time link");
ok(KE.m.get("exp:" + j.url.split("=")[1]).ttl === 900, "export: kept 15 minutes only");
r = await EXP.onRequestGet({ request: get(j.url), env: { CHAT_KV: KE } }); const got = new Uint8Array(await r.arrayBuffer());
ok(r.status === 200 && /attachment; filename="FODO-competitors-2026.xlsx"/.test(r.headers.get("content-disposition")) && got.length === 7 && got[0] === 80 && /spreadsheetml/.test(r.headers.get("content-type")), "export: link downloads the same bytes as an attachment");
r = await EXP.onRequestGet({ request: get("/api/export?id=" + "0".repeat(24)), env: { CHAT_KV: KE } }); ok(r.status === 404 && /expired/.test(await r.text()), "export: old link → clear 'expired' message");
r = await EXP.onRequestPost({ request: post("/api/export", "x", { "content-type": "text/html" }), env: { CHAT_KV: KE } }); ok(r.status === 415, "export: only csv/xlsx/tsv accepted");
r = await EXP.onRequestPost({ request: post("/api/export", "a,b", { "content-type": "text/csv", "x-file-name": "../../evil.sh" }), env: { CHAT_KV: KE } }); j = await r.json(); ok(j.ok && !/[\/]/.test(j.name) && j.name.endsWith(".csv"), "export: path tricks removed from the name (" + j.name + ")");

/* ---------- hedged() ---------- */
globalThis.fetch = (u, o) => new Promise((res, rej) => { const t = setTimeout(() => res(new Response(u)), u.includes("a") ? 3000 : 50); o.signal.addEventListener("abort", () => { clearTimeout(t); rej(Object.assign(new Error("x"), { name: "AbortError" })); }); });
t0 = Date.now(); const h = await hedged(["https://a/", "https://b/"], () => ({}), { stagger: 100, timeout: 5000 }); ok(h.url === "https://b/" && Date.now() - t0 < 1000, "hedged: second server started after the stagger and won");

console.log(`\nv11 finder functions: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
