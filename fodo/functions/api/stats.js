/* GET /api/stats?days=7  — bot health & usage totals (no personal data).
   Protected: requires header  Authorization: Bearer <STATS_TOKEN>  (set STATS_TOKEN as a Cloudflare Secret). */
import { read } from "../_lib/metrics.js";
const json = (b, s) => new Response(JSON.stringify(b, null, 2), { status: s || 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
export async function onRequestGet({ request, env }) {
  if (!env.STATS_TOKEN) return json({ ok: false, reason: "STATS_TOKEN not set" }, 503);
  const auth = request.headers.get("authorization") || "";
  const q = new URL(request.url).searchParams;
  if (auth !== "Bearer " + env.STATS_TOKEN && q.get("token") !== env.STATS_TOKEN) return json({ ok: false, reason: "unauthorized" }, 401);
  if (!env.CHAT_KV) return json({ ok: false, reason: "CHAT_KV binding not set — counters are not being stored" }, 503);
  const days = Math.min(30, Math.max(1, parseInt(q.get("days") || "7", 10) || 7));
  return json({ ok: true, ai: !!env.AI, voice: !!env.OPENAI_API_KEY, days: await read(env, days) });
}
