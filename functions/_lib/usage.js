/* FODO Growth Lab v17 — API usage & cost log (prompt §57–59, §116).
   Every call FODO makes to an outside data provider is written to D1 table api_usage: provider, endpoint, tool, job, user,
   status, duration, cache hit, and the cost. Cost is the provider's own figure when it returns one (DataForSEO), otherwise
   an ESTIMATE from the list price below (USD per call) — shown as "estimated" in the admin dashboard, never to customers.
   Free providers cost 0 (PageSpeed, Search Console, Workers AI inside its free daily quota, Groq free tier, Open PageRank).
   Override any price without a code change: env COST_USD_JSON = {"serper":0.001,"serper_places":0.003}. */
export const LIST_USD = {
  serper: 0.001,          // Serper.dev: ~$1 per 1,000 searches on the starter top-up (2,500 free once)
  serper_places: 0.001,   // Serper places/maps search: same credit price
  brave: 0.005,           // Brave Search API: ~$5 per 1,000 (2026)
  dataforseo: 0.0006,     // replaced by the real cost DataForSEO returns
  pagespeed: 0, gsc: 0, opr: 0, site: 0, linkcheck: 0,
  "workers-ai": 0,        // free daily allocation on the Workers free plan
  groq: 0,                // Groq free tier
  gemini: 0,              // Gemini API free tier (paid only above the free daily/monthly allowance)
  resend: 0,
};
export const usdInr = (env) => +(env && env.USD_INR) || 88;
let over = null;
export function listPrice(env, provider) {
  if (over === null) { try { over = env && env.COST_USD_JSON ? JSON.parse(env.COST_USD_JSON) : {}; } catch (e) { over = {}; } }
  const v = over[provider] != null ? +over[provider] : LIST_USD[provider];
  return isFinite(v) ? v : 0;
}
const DDL = [
  "CREATE TABLE IF NOT EXISTS api_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, t TEXT, day TEXT, provider TEXT, endpoint TEXT, tool TEXT, job_id TEXT, user_id TEXT, status INTEGER, ok INTEGER, ms INTEGER, cached INTEGER, cost_usd REAL, cost_kind TEXT, units INTEGER)",
  "CREATE INDEX IF NOT EXISTS api_usage_day ON api_usage(day)",
  "CREATE INDEX IF NOT EXISTS api_usage_job ON api_usage(job_id)",
];
const ready = new WeakMap();
export async function usageDb(env) {
  const d = env && env.XRAY_DB; if (!d) return null;
  if (!ready.has(d)) ready.set(d, d.batch(DDL.map((s) => d.prepare(s))).catch((e) => { ready.delete(d); throw e; }));
  await ready.get(d); return d;
}
/* o = { provider, endpoint, tool, job, user, status, ok, ms, cached, cost (real USD, optional), units } — never throws */
export async function logUsage(env, o) {
  try {
    const d = await usageDb(env); if (!d) return;
    const real = o.cost != null && isFinite(+o.cost), units = o.units == null ? 1 : Math.max(0, o.units | 0);
    // a failed call is still logged; providers usually do not bill errors, so its cost is 0 — except a real figure the provider sent
    const cost = o.cached ? 0 : real ? +o.cost : o.ok === false ? 0 : listPrice(env, o.provider) * units;
    const t = new Date().toISOString();
    await d.prepare("INSERT INTO api_usage (t, day, provider, endpoint, tool, job_id, user_id, status, ok, ms, cached, cost_usd, cost_kind, units) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)")
      .bind(t, t.slice(0, 10), String(o.provider || "").slice(0, 40), String(o.endpoint || "").slice(0, 60), String(o.tool || "xray").slice(0, 40), o.job || null, o.user || null,
        o.status | 0, o.ok === false ? 0 : 1, o.ms | 0, o.cached ? 1 : 0, Math.round(cost * 1e6) / 1e6, o.cached ? "cache" : real ? "actual" : "estimated", units).run();
  } catch (e) {}
}
/* the admin report (costs, providers, health) for the last `days` days */
export async function usageReport(env, days) {
  const d = await usageDb(env); if (!d) return { ok: false, reason: "Database not connected." };
  days = Math.max(1, Math.min(365, days | 0 || 30));
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10), since1 = new Date(Date.now() - 864e5).toISOString();
  const q = (sql, ...a) => d.prepare(sql).bind(...a).all().then((r) => r.results || []);
  const [tot] = await q("SELECT COUNT(*) AS calls, SUM(cost_usd) AS cost, SUM(cached) AS cached, SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) AS failed, SUM(CASE WHEN ok=0 THEN cost_usd ELSE 0 END) AS failedCost, SUM(CASE WHEN cost_kind='actual' THEN cost_usd ELSE 0 END) AS actual FROM api_usage WHERE day >= ?1", since);
  const byProvider = await q("SELECT provider, COUNT(*) AS calls, SUM(cost_usd) AS cost, SUM(cached) AS cached, SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) AS failed, AVG(CASE WHEN cached=0 THEN ms END) AS ms FROM api_usage WHERE day >= ?1 GROUP BY provider ORDER BY cost DESC, calls DESC", since);
  const byTool = await q("SELECT tool, endpoint, COUNT(*) AS calls, SUM(cost_usd) AS cost FROM api_usage WHERE day >= ?1 GROUP BY tool, endpoint ORDER BY cost DESC, calls DESC LIMIT 40", since);
  const byDay = await q("SELECT day, COUNT(*) AS calls, SUM(cost_usd) AS cost, SUM(cached) AS cached FROM api_usage WHERE day >= ?1 GROUP BY day ORDER BY day", since);
  const perJob = await q("SELECT job_id, COUNT(*) AS calls, SUM(cost_usd) AS cost, SUM(cached) AS cached, MIN(t) AS t FROM api_usage WHERE day >= ?1 AND job_id IS NOT NULL GROUP BY job_id ORDER BY t DESC LIMIT 500", since);
  const health = await q("SELECT provider, COUNT(*) AS calls, SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) AS failed, MAX(t) AS last, MAX(CASE WHEN ok=1 THEN t END) AS lastOk FROM api_usage WHERE t >= ?1 AND cached=0 GROUP BY provider", since1);
  return { ok: true, days, since, totals: tot || {}, byProvider, byTool, byDay, perJob, health };
}
