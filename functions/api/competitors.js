/* FODO Competitor Finder — GET /api/competitors?type=cafe&area=Dwarka&radius=2000[&lat=..&lng=..]   ·   GET /api/competitors?health=1
 *
 * Data sources, picked automatically:
 *   1. Google Places API (New) — only when the Cloudflare Secret GOOGLE_PLACES_KEY is set. Rating, reviews, phone, website,
 *      opening status and the exact Google Maps listing link.
 *   2. Free OpenStreetMap sources (no key) — Overpass, Nominatim, Photon, tried in turn (see ../_lib/free-places.js).
 *      Each business gets a Google Maps link.
 * Results are cached in CHAT_KV for 6 hours; each visitor is limited to CF_PER_HOUR searches (default 30).
 * The browser falls back to the same free sources directly if this route is unreachable.
 */
import { freePlaces, osmTags, dist, gmapsSearch, knownArea, AREAS, OSM_TYPES } from "../_lib/free-places.js";
export { osmTags, dist, knownArea, AREAS, OSM_TYPES };

const UA = "FODO-CompetitorFinder/1.1 (+https://www.fodo.co.in; anmol@fodo.co.in)";
const json = (b, s) => new Response(JSON.stringify(b), { status: s || 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const clean = (s, n) => String(s || "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const fetchT = (u, o, ms) => fetch(u, Object.assign({}, o, { signal: AbortSignal.timeout(ms || 8000) }));
const free = freePlaces(fetchT, { "user-agent": UA });

async function viaGoogle(env, { type, area, center, radius }) {
  const body = { textQuery: `${type} in ${area || "Delhi NCR"}`, maxResultCount: 20, languageCode: "en", regionCode: "IN" };
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
    rating: p.rating ?? null, reviews: p.userRatingCount ?? null, phone: p.nationalPhoneNumber || "", website: p.websiteUri || "", hours: "",
    mapsUrl: p.googleMapsUri || gmapsSearch(p.displayName && p.displayName.text, p.formattedAddress),
    open: p.currentOpeningHours ? !!p.currentOpeningHours.openNow : null, status: p.businessStatus || "", category: p.primaryTypeDisplayName && p.primaryTypeDisplayName.text || "",
  })).filter((p) => p.name && p.lat != null);
  if (!center && list.length) center = { lat: list.reduce((s, p) => s + p.lat, 0) / list.length, lng: list.reduce((s, p) => s + p.lng, 0) / list.length, label: area };
  if (center) list.forEach((p) => { p.distance = dist(center, p); });
  return { source: "google", center, results: list.filter((p) => p.distance == null || p.distance <= radius * 1.6).sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9)) };
}

export async function onRequestGet(ctx) {
  try { return await handle(ctx); }
  catch (e) { return json({ ok: false, reason: "The finder hit an error. Please try again.", errors: [String(e && e.message || e)] }, 500); }
}
async function handle({ request, env }) {
  const q = new URL(request.url).searchParams;
  if (q.get("health")) return json({ ok: true, service: "competitor-finder", version: "6.5", google: !!env.GOOGLE_PLACES_KEY, kv: !!env.CHAT_KV });
  const type = clean(q.get("type"), 60), area = clean(q.get("area"), 80);
  const radius = Math.min(5000, Math.max(500, parseInt(q.get("radius") || "2000", 10) || 2000));
  const lat = parseFloat(q.get("lat")), lng = parseFloat(q.get("lng"));
  const center = isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng, label: area || "Your location" } : null;
  if (!type || (!area && !center)) return json({ ok: false, reason: "Enter a business type and an area." }, 400);

  const ip = request.headers.get("cf-connecting-ip") || "anon", hour = Math.floor(Date.now() / 3600000);
  const kv = env.CHAT_KV, limit = parseInt(env.CF_PER_HOUR || "30", 10);
  if (kv) {
    try {
      const rk = `cf:rl:${ip}:${hour}`, n = parseInt((await kv.get(rk)) || "0", 10);
      if (n >= limit) return json({ ok: false, reason: "Too many searches this hour — please try again a little later." }, 429);
      await kv.put(rk, String(n + 1), { expirationTtl: 3700 });
    } catch (e) {}
  }
  const key = `cf:c2:${env.GOOGLE_PLACES_KEY ? "g" : "o"}:${type.toLowerCase()}|${area.toLowerCase()}|${radius}|${center ? center.lat.toFixed(3) + "," + center.lng.toFixed(3) : ""}`;
  if (kv) { try { const hit = await kv.get(key, "json"); if (hit) return json(Object.assign(hit, { cached: true })); } catch (e) {} }

  let out = null; const errors = [];
  if (env.GOOGLE_PLACES_KEY) { try { out = await viaGoogle(env, { type, area, center: center || knownArea(area), radius }); } catch (e) { errors.push(String(e.message || e)); } }
  if (!out || !out.results.length) {
    try { const o = await free.search({ type, area, center: center || (out && out.center), radius }); if (!out || o.results.length) out = o; }
    catch (e) { errors.push(...(e.tried || [String(e.message || e)])); }
  }
  if (!out) return json({ ok: false, reason: "The free map servers are busy right now. Please try again in a minute.", errors }, 502);
  const body = { ok: true, type, area, radius, ...out, errors: errors.length ? errors : undefined };
  if (kv && out.results.length) { try { await kv.put(key, JSON.stringify(body), { expirationTtl: 6 * 3600 }); } catch (e) {} }
  return json(body);
}
export const onRequestPost = () => json({ ok: false, reason: "GET only" }, 405);
