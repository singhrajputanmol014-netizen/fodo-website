/* FODO Competitor Finder — Geoapify Places (optional extra source, v11). Needs the Cloudflare Secret GEOAPIFY_KEY
 * (free plan: 3,000 credits a day, no card; 20 places = 1 credit; results may be stored, so they can go into the export).
 *   GET /api/geo?cat=catering.cafe&name=&lat=..&lng=..&radius=5000&offset=0   → Geoapify GeoJSON, passed through untouched
 *   GET /api/geo?health=1 → { ok, enabled }
 * The key never reaches the browser. Answers are cached in KV for 7 days. */
import { json, limited, sha } from "../_lib/finder-common.js";

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  if (q.get("health")) return json({ ok: true, enabled: !!env.GEOAPIFY_KEY });
  if (!env.GEOAPIFY_KEY) return json({ ok: false, disabled: true, reason: "Geoapify is not connected." }, 503);
  const cat = String(q.get("cat") || ""), name = String(q.get("name") || "").slice(0, 60), lat = +q.get("lat"), lng = +q.get("lng");
  const radius = Math.min(100000, Math.max(200, parseInt(q.get("radius") || "2000", 10) || 2000)), offset = Math.min(4500, Math.max(0, parseInt(q.get("offset") || "0", 10) || 0));
  if (!/^[a-z_.]+(,[a-z_.]+){0,20}$/.test(cat) || !isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return json({ ok: false, reason: "Bad request." }, 400);
  const u = "https://api.geoapify.com/v2/places?categories=" + cat + `&filter=circle:${lng.toFixed(5)},${lat.toFixed(5)},${radius}&bias=proximity:${lng.toFixed(5)},${lat.toFixed(5)}&limit=500&offset=${offset}&lang=en` + (name ? "&name=" + encodeURIComponent(name) : "");
  const kv = env.CHAT_KV, key = "geo:v1:" + (await sha(u));
  if (kv) { try { const hit = await kv.get(key, "arrayBuffer"); if (hit) return new Response(hit, { headers: { "content-type": "application/json; charset=utf-8", "x-cache": "hit" } }); } catch (e) {} }
  if (await limited(env, request, "geo", parseInt(env.GEO_PER_HOUR || "60", 10))) return json({ ok: false, reason: "Too many searches this hour." }, 429);
  try {
    const r = await fetch(u + "&apiKey=" + encodeURIComponent(env.GEOAPIFY_KEY), { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return json({ ok: false, reason: "Geoapify answered " + r.status }, 502);
    const buf = await r.arrayBuffer();
    if (kv && buf.byteLength < 24e6) { try { await kv.put(key, buf, { expirationTtl: 7 * 86400 }); } catch (e) {} }
    return new Response(buf, { headers: { "content-type": "application/json; charset=utf-8", "x-cache": "miss" } });
  } catch (e) { return json({ ok: false, reason: "Geoapify did not answer." }, 502); }
}
