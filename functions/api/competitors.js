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

async function geocode(area) {
  const u = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&viewbox=76.80,28.95,77.65,28.25&q=" + encodeURIComponent(area);
  const r = await fetch(u, { headers: { "user-agent": UA, "accept-language": "en" } });
  if (!r.ok) throw new Error("geocode " + r.status);
  const j = await r.json(); if (!j.length) return null;
  return { lat: +j[0].lat, lng: +j[0].lon, label: j[0].display_name };
}

async function viaGoogle(env, { type, area, center, radius }) {
  const body = { textQuery: `${type} in ${area}`, maxResultCount: 20, languageCode: "en", regionCode: "IN" };
  if (center) body.locationBias = { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: Math.min(50000, radius) } };
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST", body: JSON.stringify(body),
    headers: { "content-type": "application/json", "X-Goog-Api-Key": env.GOOGLE_PLACES_KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.googleMapsUri,places.websiteUri,places.nationalPhoneNumber,places.businessStatus,places.primaryTypeDisplayName,places.currentOpeningHours.openNow" },
  });
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
  const parts = tags ? tags.map(([k, v]) => `nwr["${k}"~"^(${v})$"]["name"]${around};`) : [];
  parts.push(`nwr["name"~"${safe.replace(/[.*+?^${}()|[\]]/g, "")}",i]["shop"]${around};`, `nwr["name"~"${safe.replace(/[.*+?^${}()|[\]]/g, "")}",i]["amenity"]${around};`, `nwr["name"~"${safe.replace(/[.*+?^${}()|[\]]/g, "")}",i]["office"]${around};`);
  const q = `[out:json][timeout:20];(${parts.join("")});out center tags 60;`;
  const r = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA } });
  if (!r.ok) throw new Error("overpass " + r.status);
  const j = await r.json(), seen = new Set();
  const results = (j.elements || []).map((e) => {
    const t = e.tags || {}, lat = e.lat ?? (e.center && e.center.lat), lng = e.lon ?? (e.center && e.center.lon);
    const addr = [t["addr:housenumber"], t["addr:street"], t["addr:suburb"] || t["addr:neighbourhood"], t["addr:city"]].filter(Boolean).join(", ");
    return { id: e.type + "/" + e.id, name: t.name || t["name:en"] || "", address: addr, lat, lng, rating: null, reviews: null,
      phone: t.phone || t["contact:phone"] || "", website: t.website || t["contact:website"] || "", hours: t.opening_hours || "",
      mapsUrl: gmapsSearch(t.name || t["name:en"], addr || area), open: null, status: "", category: (t.amenity || t.shop || t.office || t.leisure || t.tourism || t.healthcare || "").replace(/_/g, " ") };
  }).filter((p) => { const k = (p.name || "").toLowerCase(); if (!k || p.lat == null || seen.has(k)) return false; seen.add(k); return true; });
  return { source: "osm", center, results };
}

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
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
  if (!out) return json({ ok: false, reason: "The map services are busy right now. Please try again in a minute.", errors }, 502);

  if (out.center) out.results.forEach((p) => { p.distance = dist(out.center, p); });
  out.results = out.results.filter((p) => p.distance == null || p.distance <= radius * 1.6).sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9)).slice(0, 40);
  const body = { ok: true, type, area, radius, ...out };
  if (kv && out.results.length) await kv.put(key, JSON.stringify(body), { expirationTtl: 6 * 3600 });
  return json(body);
}
export const onRequestPost = () => json({ ok: false, reason: "GET only" }, 405);
