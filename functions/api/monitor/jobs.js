/* FODO v47.6 background jobs tick. POST /api/monitor/jobs with header x-cron-key: <CRON_KEY>. Runs up to 25 due jobs
   (emails, housekeeping, provider checks, webhooks) and answers { ran, done, failed, dead, remaining }. The hourly GitHub
   Actions workflow (.github/workflows/fodo-brain.yml) calls it; a bound Cloudflare Queue (JOBS) makes it near-instant instead. */
import { json, accountsOn } from "../../_lib/accounts.js";
import { runDue } from "../../_lib/jobs.js";
const same = (a, b) => { a = String(a || ""); b = String(b || ""); if (!a || a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; };
export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ ok: false, reason: "Use POST." }, 405);
  if (!env.CRON_KEY || String(env.CRON_KEY).length < 16) return json({ ok: false, reason: "Scheduler is not set up (add a CRON_KEY of 16+ characters)." }, 403);
  if (!same(request.headers.get("x-cron-key"), env.CRON_KEY)) return json({ ok: false, reason: "Wrong key." }, 401);
  if (!accountsOn(env)) return json({ ok: false, reason: "Accounts are off." }, 503);
  return json(Object.assign({ ok: true }, await runDue(env, 25)));
}
