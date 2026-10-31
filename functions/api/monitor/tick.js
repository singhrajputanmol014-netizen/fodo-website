/* FODO Growth Lab v17, the free monitoring scheduler. POST /api/monitor/tick with header x-cron-key: <CRON_KEY>.
   Checks the website(s) whose next check is due (1 per request by default, keeps inside the free plan's CPU limit) and
   answers { checked, remaining }. The GitHub Actions workflow .github/workflows/fodo-monitor.yml calls it in a loop once a day.
   Without CRON_KEY set in Cloudflare the endpoint is closed (403). */
import { json, accountsOn, activePlan, isUnlimited, sendMail } from "../../_lib/accounts.js";
import { mdb, runCheck } from "../../_lib/monitor.js";
import { applyConfig, toolOn } from "../../_lib/config.js";
import { brainDaily } from "../../_lib/brain/insights.js";

const same = (a, b) => { a = String(a || ""); b = String(b || ""); if (!a || a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; };
export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ ok: false, reason: "Use POST." }, 405);
  if (!env.CRON_KEY || String(env.CRON_KEY).length < 16) return json({ ok: false, reason: "Scheduler is not set up (add a CRON_KEY of 16+ characters)." }, 403);
  if (!same(request.headers.get("x-cron-key"), env.CRON_KEY)) return json({ ok: false, reason: "Wrong key." }, 401);
  if (!accountsOn(env)) return json({ ok: false, reason: "Accounts are off." }, 503);
  await applyConfig(env); if (!toolOn("monitoring")) return json({ ok: true, paused: true, checked: 0, remaining: 0 });
  const d = await mdb(env), now = Date.now(), batch = Math.max(1, Math.min(3, parseInt(env.MONITOR_BATCH || "1", 10) || 1));
  const due = (await d.prepare("SELECT * FROM mon_targets WHERE next_check <= ?1 ORDER BY next_check LIMIT ?2").bind(now, batch).all()).results || [];
  const out = [];
  for (const t of due) {
    const u = await d.prepare("SELECT * FROM acct_users WHERE id=?1").bind(t.user_id).first();
    if (!u || u.blocked) { await d.prepare("UPDATE mon_targets SET next_check=?2 WHERE id=?1").bind(t.id, now + 7 * 864e5).run(); continue; }
    const r = await runCheck(env, d, t, isUnlimited(u) || activePlan(u) !== "free", sendMail);
    out.push({ domain: t.domain, ok: r.ok, events: r.events.length });
  }
  const left = await d.prepare("SELECT COUNT(*) AS n FROM mon_targets WHERE next_check <= ?1").bind(now).first();
  // v21: when the day's monitoring is finished, the FODO Brain writes the owner's daily briefing + alert scan (once a day)
  const brain = left && left.n ? null : await brainDaily(env, request);
  return json({ ok: true, checked: out.length, results: out, remaining: left ? left.n : 0, brain });
}
