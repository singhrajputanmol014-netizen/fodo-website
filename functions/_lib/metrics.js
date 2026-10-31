/* Privacy-safe counters for the bot backend. Stores ONLY daily totals in the optional CHAT_KV binding:
   never message text, IPs or transcripts. Missing KV = counters silently skipped. */
const FIELDS = ["requests", "ok", "fallback_quota", "fallback_error", "rate_limited", "bad_request", "voice_sessions", "voice_failed", "latency_ms_total"];
export async function bump(env, fields) {
  if (!env || !env.CHAT_KV) return;
  try {
    const key = "m:" + new Date().toISOString().slice(0, 10);
    const cur = JSON.parse((await env.CHAT_KV.get(key)) || "{}");
    for (const [k, v] of Object.entries(fields)) if (FIELDS.includes(k)) cur[k] = (cur[k] || 0) + (Number(v) || 0);
    await env.CHAT_KV.put(key, JSON.stringify(cur), { expirationTtl: 60 * 60 * 24 * 40 });
  } catch (_) { /* metrics must never break the bot */ }
}
export async function read(env, days) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    let v = {}; try { v = JSON.parse((await env.CHAT_KV.get("m:" + d)) || "{}"); } catch (_) {}
    const avg = v.ok ? Math.round((v.latency_ms_total || 0) / v.ok) : null;
    out.push({ date: d, ...v, avg_latency_ms: avg, fallback_rate: v.requests ? +(((v.fallback_quota || 0) + (v.fallback_error || 0)) / v.requests).toFixed(3) : null });
  }
  return out;
}
