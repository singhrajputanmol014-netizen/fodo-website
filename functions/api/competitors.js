/* FODO Competitor Finder — GET /api/competitors?type=cafe&area=Dwarka&radius=2000[&lat=..&lng=..]
 *
 * Two data sources, picked automatically:
 *   1. Google Places API (New) — when the Cloudflare Secret GOOGLE_PLACES_KEY is set. Gives rating, review count,
 *      phone, website, opening status and the exact Google Maps listing link.
 *   2. OpenStreetMap (Nominatim + Overpass) — free, no key. Gives names, addresses, phone/website when mapped,
 *      and a Google Maps search link for each business.
 * Results are cached in CHAT_KV for 6 hours and each visitor is limited (CF_PER_HOUR, default 30 searches/hour).
 * No search is logged with personal data.
 */
const UA = "FODO-CompetitorFinder/1.0 (+https://www.fodo.co.in; anmol@fodo.co.in)";
const json = (b, s, extra) => new Response(JSON.stringify(b), { status: s || 200, headers: Object.assign({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, extra || {}) });
const clean = (s, n) => String(s || "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

// business type → OpenStreetMap tags (key=value, value may be a regex alternation)
export const OSM_TYPES = [
  [/caf[eé]|coffee|chai|tea/, [["amenity", "cafe"]]],
  [/restaurant|dhaba|food|biryani|pizza|eatery|diner/, [["amenity", "restaurant|fast_food|food_court"]]],
  [/bakery|cake|sweet|mithai|halwai/, [["shop", "bakery|confectionery|pastry"]]],
  [/dentist|dental/, [["amenity", "dentist"], ["healthcare", "dentist"]]],
  [/clinic|doctor|physician|skin|derma|\beye\b|\bent\b|pediatric|gyn/, [["amenity", "clinic|doctors"], ["healthcare", "clinic|doctor"]]],
  [/hospital|nursing home/, [["amenity", "hospital"]]],
  [/pharma|chemist|medical store/, [["amenity", "pharmacy"], ["shop", "chemist"]]],
  [/gym|fitness|crossfit/, [["leisure", "fitness_centre|sports_centre"]]],
  [/yoga|pilates|zumba|dance/, [["leisure", "fitness_centre|dance"], ["sport", "yoga"]]],
  [/salon|hair|barber|parlou?r|beauty|makeup|nail/, [["shop", "hairdresser|beauty|cosmetics"]]],
  [/spa|massage/, [["leisure", "spa"], ["shop", "massage"], ["amenity", "spa"]]],
  [/boutique|cloth|fashion|garment|saree|apparel/, [["shop", "clothes|boutique|fashion|tailor"]]],
  [/jewel/, [["shop", "jewelry"]]],
  [/mobile|phone shop/, [["shop", "mobile_phone|electronics"]]],
  [/electronic|appliance|computer|laptop/, [["shop", "electronics|computer|appliance"]]],
  [/supermarket|grocery|kirana|mart|general store/, [["shop", "supermarket|convenience|grocery"]]],
  [/coaching|tuition|institute|academy|classes/, [["amenity", "college|school|language_school|training"], ["office", "educational_institution"]]],
  [/play ?school|preschool|kindergarten|daycare/, [["amenity", "kindergarten|childcare"]]],
  [/school/, [["amenity", "school"]]],
  [/real estate|property|estate agent|broker/, [["office", "estate_agent"], ["shop", "estate_agent"]]],
  [/hotel|guest ?house|hostel|stay/, [["tourism", "hotel|guest_house|hostel|motel"]]],
  [/car dealer|showroom|bike dealer/, [["shop", "car|motorcycle"]]],
  [/car repair|garage|mechanic|service centre/, [["shop", "car_repair|tyres|motorcycle_repair"]]],
  [/chartered|accountant|\bca\b|tax/, [["office", "accountant|tax_advisor"]]],
  [/lawyer|advocate|legal/, [["office", "lawyer"]]],
  [/interior|furniture|decor/, [["shop", "furniture|interior_decoration"], ["craft", "interior_work"]]],
  [/photograph|studio/, [["shop", "photo"], ["craft", "photographer"]]],
  [/wedding|event|banquet/, [["amenity", "events_venue|banquet_hall"], ["shop", "wedding"]]],
  [/bank|atm/, [["amenity", "bank"]]],
  [/petrol|fuel|pump/, [["amenity", "fuel"]]],
  [/pet|vet/, [["amenity", "veterinary"], ["shop", "pet"]]],
  [/optic|spectacle|glasses/, [["shop", "optician"]]],
  [/book|stationer/, [["shop", "books|stationery"]]],
];
export function osmTags(type) { const t = type.toLowerCase(); for (const [re, tags] of OSM_TYPES) if (re.test(t)) return tags; return null; }

const R = 6371000, rad = (d) => (d * Math.PI) / 180;
export function dist(a, b) { const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng); const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2; return Math.round(2 * R * Math.asin(Math.sqrt(h))); }
const gmapsSearch = (name, addr) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([name, addr].filter(Boolean).join(", "));

// every outside call gets a time limit, so a slow map server can never hang the page
const fetchT = (u, o, ms) => fetch(u, Object.assign({}, o, { signal: AbortSignal.timeout(ms || 9000) }));
// popular Delhi NCR areas: known centres, no geocoding call needed
export const AREAS = { "najafgarh": [28.6092, 76.9798], "dwarka": [28.5921, 77.046], "uttam nagar": [28.6219, 77.055], "janakpuri": [28.6219, 77.0878], "rajouri garden": [28.6492, 77.122],
  "punjabi bagh": [28.6683, 77.132], "pitampura": [28.7036, 77.1318], "rohini": [28.7383, 77.0822], "connaught place": [28.6315, 77.2167], "karol bagh": [28.6519, 77.1907],
  "lajpat nagar": [28.5677, 77.2433], "saket": [28.5245, 77.2066], "hauz khas": [28.5494, 77.2001], "greater kailash": [28.5482, 77.238], "vasant kunj": [28.52, 77.159],
  "mayur vihar": [28.609, 77.294], "laxmi nagar": [28.6304, 77.2777], "preet vihar": [28.6418, 77.295], "gurugram sector 29": [28.4683, 77.064], "cyber city gurugram": [28.495, 77.089],
  "sohna road gurugram": [28.41, 77.044], "noida sector 18": [28.57, 77.326], "noida sector 62": [28.627, 77.365], "greater noida": [28.4744, 77.504], "indirapuram ghaziabad": [28.646, 77.369],
  "faridabad sector 15": [28.396, 77.326], "gurugram": [28.4595, 77.0266], "gurgaon": [28.4595, 77.0266], "noida": [28.5355, 77.391], "ghaziabad": [28.6692, 77.4538], "faridabad": [28.4089, 77.3178],
  "west delhi": [28.6519, 77.0597], "south delhi": [28.5355, 77.2167], "new delhi": [28.6139, 77.209], "delhi": [28.6139, 77.209] };
const normArea = (a) => a.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\b(new delhi|delhi|india|ncr)\b/g, (m, x, i, str) => (str.trim() === m ? m : "")).replace(/\s+/g, " ").trim();
export function knownArea(area) { const n = normArea(area); if (AREAS[n]) return { lat: AREAS[n][0], lng: AREAS[n][1], label: area }; return null; }
async function geocode(area) {
  const known = knownArea(area); if (known) return known;
  try {
    const u = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&viewbox=76.80,28.95,77.65,28.25&q=" + encodeURIComponent(area);
    const r = await fetchT(u, { headers: { "user-agent": UA, "accept-language": "en" } }, 7000);
    if (r.ok) { const j = await r.json(); if (j.length) return { lat: +j[0].lat, lng: +j[0].lon, label: j[0].display_name }; }
  } catch (e) {}
  // backup geocoder (Photon, also OpenStreetMap data), biased to Delhi
  const r2 = await fetchT("https://photon.komoot.io/api/?limit=1&lat=28.61&lon=77.21&q=" + encodeURIComponent(area), { headers: { "user-agent": UA } }, 7000);
  if (!r2.ok) throw new Error("geocode " + r2.status);
  const f = ((await r2.json()).features || [])[0]; if (!f) return null;
  return { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], label: (f.properties && f.properties.name) || area };
}
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];

async function viaGoogle(env, { type, area, center, radius }) {
  const body = { textQuery: `${type} in ${area}`, maxResultCount: 20, languageCode: "en", regionCode: "IN" };
  if (center) body.locationBias = { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: Math.min(50000, radius) } };
  const r = await fetchT("https://places.googleapis.com/v1/places:searchText", {
    method: "POST", body: JSON.stringify(body),
    headers: { "content-type": "application/json", "X-Goog-Api-Key": env.GOOGLE_PLACES_KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.googleMapsUri,places.websiteUri,places.nationalPhoneNumber,places.businessStatus,places.primaryTypeDisplayName,places.currentOpeningHours.openNow" },
  }, 9000);
  if (!r.ok) throw new Error("google " + r.status);
  const j = await r.json();
  const list = (j.places || []).map((p) => ({
    id: p.id, name: p.displayName && p.displayName.text || "", address: p.formattedAddress || "",
    lat: p.location && p.location.latitude, lng: p.location && p.location.longitude,
    rating: p.rating ?? null, reviews: p.userRatingCount ?? null, phone: p.nationalPhoneNumber || "", website: p.websiteUri || "",
    mapsUrl: p.googleMapsUri || gmapsSearch(p.displayName && p.displayName.text, p.formattedAddress),
    open: p.currentOpeningHours ? !!p.currentOpeningHours.openNow : null, status: p.businessStatus || "", category: p.primaryTypeDisplayName && p.primaryTypeDisplayName.text || "",
  })).filter((p) => p.name && p.lat != null);
  if (!center && list.length) center = { lat: list.reduce((s, p) => s + p.lat, 0) / list.length, lng: list.reduce((s, p) => s + p.lng, 0) / list.length, label: area };
  return { source: "google", center, results: list };
}

async function viaOSM({ type, area, center, radius }) {
  if (!center) center = await geocode(area);
  if (!center) return { source: "osm", center: null, results: [], note: "Area not found. Try adding the city, e.g. “Dwarka, Delhi”." };
  const tags = osmTags(type), around = `(around:${radius},${center.lat},${center.lng})`;
  const safe = type.replace(/["\\]/g, "").slice(0, 40);
  const word = safe.replace(/[.*+?^${}()|[\]]/g, "");
  // known category → tag query only (fast); unknown → name search among shops/offices/amenities
  const parts = tags ? tags.map(([k, v]) => `nwr["${k}"~"^(${v})$"]["name"]${around};`)
    : [`nwr["name"~"${word}",i]["shop"]${around};`, `nwr["name"~"${word}",i]["amenity"]${around};`, `nwr["name"~"${word}",i]["office"]${around};`];
  const q = `[out:json][timeout:12];(${parts.join("")});out center tags 60;`;
  let j = null, last = "";
  for (const ep of OVERPASS) {
    try {
      const r = await fetchT(ep, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA } }, 9000);
      if (r.ok) { j = await r.json(); break; } last = "overpass " + r.status;
    } catch (e) { last = "overpass " + (e.name === "TimeoutError" ? "timeout" : e.message); }
  }
  if (!j) throw new Error(last || "overpass failed");
  const seen = new Set();
  const results = (j.elements || []).map((e) => {
    const t = e.tags || {}, lat = e.lat ?? (e.center && e.center.lat), lng = e.lon ?? (e.center && e.center.lon);
    const addr = [t["addr:housenumber"], t["addr:street"], t["addr:suburb"] || t["addr:neighbourhood"], t["addr:city"]].filter(Boolean).join(", ");
    return { id: e.type + "/" + e.id, name: t.name || t["name:en"] || "", address: addr, lat, lng, rating: null, reviews: null,
      phone: t.phone || t["contact:phone"] || "", website: t.website || t["contact:website"] || "", hours: t.opening_hours || "",
      mapsUrl: gmapsSearch(t.name || t["name:en"], addr || area), open: null, status: "", category: (t.amenity || t.shop || t.office || t.leisure || t.tourism || t.healthcare || "").replace(/_/g, " ") };
  }).filter((p) => { const k = (p.name || "").toLowerCase(); if (!k || p.lat == null || seen.has(k)) return false; seen.add(k); return true; });
  return { source: "osm", center, results };
}

export async function onRequestGet(ctx) {
  try { return await handle(ctx); }
  catch (e) { return json({ ok: false, reason: "The finder hit an error. Please try again.", errors: [String(e && e.message || e)] }, 500); }
}
async function handle({ request, env }) {
  const q = new URL(request.url).searchParams;
  if (q.get("health")) return json({ ok: true, service: "competitor-finder", google: !!env.GOOGLE_PLACES_KEY, kv: !!env.CHAT_KV });
  const type = clean(q.get("type"), 60), area = clean(q.get("area"), 80);
  const radius = Math.min(5000, Math.max(500, parseInt(q.get("radius") || "2000", 10) || 2000));
  const lat = parseFloat(q.get("lat")), lng = parseFloat(q.get("lng"));
  let center = isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng, label: area || "Your location" } : null;
  if (!type || (!area && !center)) return json({ ok: false, reason: "Enter a business type and an area." }, 400);

  const ip = request.headers.get("cf-connecting-ip") || "anon", hour = Math.floor(Date.now() / 3600000);
  const kv = env.CHAT_KV, limit = parseInt(env.CF_PER_HOUR || "30", 10);
  if (kv) {
    const rk = `cf:rl:${ip}:${hour}`, n = parseInt((await kv.get(rk)) || "0", 10);
    if (n >= limit) return json({ ok: false, reason: "Too many searches this hour — please try again a little later." }, 429);
    await kv.put(rk, String(n + 1), { expirationTtl: 3700 });
  }
  const key = `cf:c:${env.GOOGLE_PLACES_KEY ? "g" : "o"}:${type.toLowerCase()}|${area.toLowerCase()}|${radius}|${center ? center.lat.toFixed(3) + "," + center.lng.toFixed(3) : ""}`;
  if (kv) { const hit = await kv.get(key, "json"); if (hit) return json(Object.assign(hit, { cached: true })); }

  let out = null, errors = [];
  if (env.GOOGLE_PLACES_KEY) { try { out = await viaGoogle(env, { type, area, center, radius }); } catch (e) { errors.push(String(e.message || e)); } }
  if (!out || !out.results.length) { try { const o = await viaOSM({ type, area, center: center || (out && out.center), radius }); if (!out || o.results.length) out = o; } catch (e) { errors.push(String(e.message || e)); } }
  if (!out) return json({ ok: false, reason: "The free map servers are busy right now. Please try again in a minute.", errors }, 502);

  if (out.center) out.results.forEach((p) => { p.distance = dist(out.center, p); });
  out.results = out.results.filter((p) => p.distance == null || p.distance <= radius * 1.6).sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9)).slice(0, 40);
  const body = { ok: true, type, area, radius, ...out };
  if (kv && out.results.length) await kv.put(key, JSON.stringify(body), { expirationTtl: 6 * 3600 });
  return json(body);
}
export const onRequestPost = () => json({ ok: false, reason: "GET only" }, 405);
