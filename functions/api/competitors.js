/* FODO Competitor Finder: Google Places part (needs the Cloudflare Secret GOOGLE_PLACES_KEY)
 *
 *   GET /api/competitors?health=1                         → { ok, version, google, geoapify, ai, kv, osmProxy }, which sources this site has
 *   GET /api/competitors?type=cafe&lat=..&lng=..&radius=5000            → Google results for that circle (up to 60, 3 pages)
 *   GET /api/competitors?type=cafe&rect=minLat,minLng,maxLat,maxLng     → one tile of a "deep search" (the browser splits big areas into tiles)
 *
 * The free OpenStreetMap search runs in the visitor's browser (js/free-places.js), it is not limited by this function's
 * CPU budget and returns every listed business. Without a Google key this route still answers with the free search,
 * so older pages keep working.
 */
import { freePlaces, dist, gmapsSearch, knownArea, osmTags, AREAS, OSM_TYPES, MAX_RADIUS } from "../_lib/free-places.js";
export { osmTags, dist, knownArea, AREAS, OSM_TYPES };

const UA = "FODO-CompetitorFinder/2.0 (+https://www.fodo.co.in; anmol@fodo.co.in)";
const json = (b, s) => new Response(JSON.stringify(b), { status: s || 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const clean = (s, n) => String(s || "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const fetchT = (u, o, ms) => fetch(u, Object.assign({}, o, { signal: AbortSignal.timeout(ms || 8000) }));
const free = freePlaces(fetchT, { "user-agent": UA });
const FIELDS = ["id", "displayName", "formattedAddress", "shortFormattedAddress", "location", "types", "primaryTypeDisplayName", "businessStatus", "googleMapsUri",
  "rating", "userRatingCount", "priceLevel", "nationalPhoneNumber", "internationalPhoneNumber", "websiteUri", "regularOpeningHours.weekdayDescriptions", "currentOpeningHours.openNow"].map((f) => "places." + f).join(",") + ",nextPageToken";
const PRICE = { PRICE_LEVEL_FREE: "Free", PRICE_LEVEL_INEXPENSIVE: "₹ / $", PRICE_LEVEL_MODERATE: "₹₹ / $$", PRICE_LEVEL_EXPENSIVE: "₹₹₹ / $$$", PRICE_LEVEL_VERY_EXPENSIVE: "₹₹₹₹ / $$$$" };
const rectAround = (c, r) => { const dLat = r / 111320, dLng = r / (111320 * Math.cos(c.lat * Math.PI / 180)); return { low: { latitude: c.lat - dLat, longitude: c.lng - dLng }, high: { latitude: c.lat + dLat, longitude: c.lng + dLng } }; };

export async function googleSearch(key, { type, area, center, radius, rect, pages }) {
  const base = { textQuery: area && !center && !rect ? `${type} in ${area}` : type, pageSize: 20, languageCode: "en" };
  if (rect) base.locationRestriction = { rectangle: { low: { latitude: rect[0], longitude: rect[1] }, high: { latitude: rect[2], longitude: rect[3] } } };
  else if (center) base.locationRestriction = { rectangle: rectAround(center, radius) };
  const out = []; let token = "";
  for (let page = 0; page < (pages || 3); page++) {
    const body = Object.assign({}, base, token ? { pageToken: token } : {});
    const r = await fetchT("https://places.googleapis.com/v1/places:searchText", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS } }, 10000);
    if (!r.ok) { if (page === 0) throw new Error("google " + r.status); break; }
    const j = await r.json();
    (j.places || []).forEach((p) => {
      const name = p.displayName && p.displayName.text || ""; if (!name || !p.location) return;
      out.push({ id: "g/" + p.id, name, address: p.formattedAddress || "", lat: p.location.latitude, lng: p.location.longitude,
        category: (p.primaryTypeDisplayName && p.primaryTypeDisplayName.text) || (p.types || [])[0] || "", types: (p.types || []).join(", "),
        rating: p.rating ?? null, reviews: p.userRatingCount ?? null, price: PRICE[p.priceLevel] || "",
        phone: p.nationalPhoneNumber || "", intlPhone: p.internationalPhoneNumber || "", website: p.websiteUri || "",
        hours: (p.regularOpeningHours && p.regularOpeningHours.weekdayDescriptions || []).join(" | "), open: p.currentOpeningHours ? !!p.currentOpeningHours.openNow : null,
        status: p.businessStatus || "", mapsUrl: p.googleMapsUri || gmapsSearch(name, p.formattedAddress), source: "Google Maps" });
    });
    token = j.nextPageToken || ""; if (!token) break;
    await new Promise((res) => setTimeout(res, 300));   // the token needs a moment to become valid
  }
  return out;
}

export async function onRequestGet(ctx) {
  try { return await handle(ctx); }
  catch (e) { return json({ ok: false, reason: "The finder hit an error. Please try again.", errors: [String(e && e.message || e)] }, 500); }
}
async function handle({ request, env }) {
  const q = new URL(request.url).searchParams;
  if (q.get("health")) return json({ ok: true, service: "competitor-finder", version: "11.0", google: !!env.GOOGLE_PLACES_KEY, geoapify: !!env.GEOAPIFY_KEY, ai: !!env.AI, kv: !!env.CHAT_KV, osmProxy: true, maxRadiusKm: MAX_RADIUS / 1000 });
  const type = clean(q.get("type"), 60), area = clean(q.get("area"), 100);
  const radius = Math.min(MAX_RADIUS, Math.max(200, parseInt(q.get("radius") || "2000", 10) || 2000));
  const lat = parseFloat(q.get("lat")), lng = parseFloat(q.get("lng"));
  const center = isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng, label: area || "Your location" } : null;
  const rect = (q.get("rect") || "").split(",").map(Number); const hasRect = rect.length === 4 && rect.every(isFinite);
  if (!type || (!area && !center && !hasRect)) return json({ ok: false, reason: "Enter a business type and a place." }, 400);

  const ip = request.headers.get("cf-connecting-ip") || "anon", hour = Math.floor(Date.now() / 3600000);
  const kv = env.CHAT_KV, limit = parseInt(env.CF_PER_HOUR || "120", 10);   // tiles count as calls, so the hourly budget is generous
  if (kv) {
    try {
      const rk = `cf:rl:${ip}:${hour}`, n = parseInt((await kv.get(rk)) || "0", 10);
      if (n >= limit) return json({ ok: false, reason: "Too many searches this hour, please try again a little later." }, 429);
      await kv.put(rk, String(n + 1), { expirationTtl: 3700 });
    } catch (e) {}
  }
  const key = `cf:g3:${type.toLowerCase()}|${area.toLowerCase()}|${radius}|${center ? center.lat.toFixed(3) + "," + center.lng.toFixed(3) : ""}|${hasRect ? rect.map((x) => x.toFixed(3)).join(",") : ""}`;
  if (kv) { try { const hit = await kv.get(key, "json"); if (hit) return json(Object.assign(hit, { cached: true })); } catch (e) {} }

  let body;
  if (env.GOOGLE_PLACES_KEY) {
    try {
      const c = center || (!hasRect && knownArea(area)) || null;
      const res = await googleSearch(env.GOOGLE_PLACES_KEY, { type, area, center: c, radius, rect: hasRect ? rect : null });
      const ctr = c || (hasRect ? { lat: (rect[0] + rect[2]) / 2, lng: (rect[1] + rect[3]) / 2 } : res.length ? { lat: res[0].lat, lng: res[0].lng } : null);
      if (ctr) res.forEach((p) => { p.distance = dist(ctr, p); });
      body = { ok: true, type, area, radius, source: "google", center: ctr, results: res.sort((a, b) => (a.distance ?? 1e12) - (b.distance ?? 1e12)) };
    } catch (e) { body = null; var gErr = String(e.message || e); }
  }
  if (!body) {
    if (hasRect) return json({ ok: false, reason: "Google search is not available.", errors: [gErr || "no key"] }, 502);
    try { const o = await free.search({ type, area, center, radius, max: 600 }); body = Object.assign({ ok: true, type, area, radius }, o, { google: !!env.GOOGLE_PLACES_KEY, errors: gErr ? [gErr] : undefined }); }
    catch (e) { return json({ ok: false, reason: "The free map servers are busy right now. Please try again in a minute.", errors: (gErr ? [gErr] : []).concat(e.tried || [String(e.message || e)]) }, 502); }
  }
  if (kv && body.results && body.results.length) { try { await kv.put(key, JSON.stringify(body), { expirationTtl: 12 * 3600 }); } catch (e) {} }
  return json(body);
}
export const onRequestPost = () => json({ ok: false, reason: "GET only" }, 405);
