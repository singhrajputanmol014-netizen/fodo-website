/* FODO Competitor Finder: OpenStreetMap (Overpass) proxy with a shared cache (v11).
 *   POST /api/osm   body: the Overpass QL query built by js/free-places.js   → the Overpass JSON, byte for byte
 * Why: the public Overpass servers are often busy. This route asks one server at a time (a second one only if the first is
 * slow, see hedged()), sends an identifying User-Agent as their policy asks, and caches every good answer in KV for
 * 24 hours, so a repeated search is instant and never touches the public servers again. The body is never parsed here
 * (CPU budget); only the last bytes are checked for an Overpass runtime error before caching. */
import { json, UA, limited, sha, hedged } from "../_lib/finder-common.js";

export const OVERPASS = [
  "https://overpass.private.coffee/api/interpreter",          // no rate limit (formerly overpass.kumi.systems)
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",  // VK Maps mirror, no request limit
  "https://overpass-api.de/api/interpreter",                  // main FOSSGIS server, busiest, so last
];
const MAX_Q = 6000;

export function validQuery(q) {   // only the shape the finder builds: JSON output, a time limit, a circle search, "out center tags N"
  return typeof q === "string" && q.length <= MAX_Q && /^\[out:json\]\[timeout:\d{1,2}\]/.test(q) && /\(around:\d{2,6},-?\d{1,3}\.\d+,-?\d{1,3}\.\d+\)/.test(q) && /out center tags( qt)? \d{1,4};\s*$/.test(q) && !/(\{\{|\bmake\b|\bconvert\b|\bforeach\b)/.test(q);
}

export async function onRequestPost({ request, env }) {
  const q = (await request.text()).trim();
  if (!validQuery(q)) return json({ ok: false, reason: "Not a finder query." }, 400);
  const kv = env.CHAT_KV, key = "osm:v1:" + (await sha(q));
  if (kv) { try { const hit = await kv.get(key, "arrayBuffer"); if (hit) return new Response(hit, { headers: { "content-type": "application/json; charset=utf-8", "x-cache": "hit", "cache-control": "no-store" } }); } catch (e) {} }
  if (await limited(env, request, "osm", parseInt(env.OSM_PER_HOUR || "80", 10))) return json({ ok: false, reason: "Too many map searches this hour, please try again a little later." }, 429);
  try {
    const { r, url } = await hedged(OVERPASS, () => ({ method: "POST", body: "data=" + encodeURIComponent(q), headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA, accept: "application/json" } }), { stagger: 8000, timeout: 45000 });
    const buf = await r.arrayBuffer();
    const tail = new TextDecoder().decode(new Uint8Array(buf, Math.max(0, buf.byteLength - 400)));
    const failed = /"remark"\s*:\s*"[^"]*(runtime error|timed out|out of memory)/i.test(tail);
    if (kv && !failed && buf.byteLength < 24e6) { try { await kv.put(key, buf, { expirationTtl: 86400 }); } catch (e) {} }
    return new Response(buf, { headers: { "content-type": "application/json; charset=utf-8", "x-cache": "miss", "x-server": url.split("/")[2], "cache-control": "no-store" } });
  } catch (e) {
    return json({ ok: false, reason: "The free map servers are busy right now.", tried: e.tried || [String(e.message || e)] }, 502);
  }
}
export const onRequestGet = () => json({ ok: true, service: "osm-proxy", servers: OVERPASS.map((u) => u.split("/")[2]) });
