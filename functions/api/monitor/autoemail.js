/* FODO v55.37 auto email tick. POST /api/monitor/autoemail with header x-cron-key: <CRON_KEY>. Sends the next lead emails that are due
   (gap between emails and daily / hourly limits from Admin ▸ Leads & clients ▸ Auto email). Called every 5 minutes by
   .github/workflows/fodo-autoemail.yml; answers at once when auto email is off (one KV read, no database work). */
import { json, accountsOn } from "../../_lib/accounts.js";
const same = (a, b) => { a = String(a || ""); b = String(b || ""); if (!a || a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; };
export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ ok: false, reason: "Use POST." }, 405);
  if (!env.CRON_KEY || String(env.CRON_KEY).length < 16) return json({ ok: false, reason: "Scheduler is not set up (add a CRON_KEY of 16+ characters)." }, 403);
  if (!same(request.headers.get("x-cron-key"), env.CRON_KEY)) return json({ ok: false, reason: "Wrong key." }, 401);
  if (!accountsOn(env)) return json({ ok: false, reason: "Accounts are off." }, 503);
  try { return json(Object.assign({ ok: true }, await (await import("../../_lib/leadintel.js")).autoTick(env, 40000))); }
  catch (e) { return json({ ok: false, reason: String((e && e.message) || e).slice(0, 160) }, 500); }
}
