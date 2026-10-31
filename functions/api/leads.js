/* v34 POST /api/leads: contact / audit / call-request forms → a D1 enquiry (with page, source, campaign), an email to the
   team, and the visitor can still continue on WhatsApp. Same-origin only, rate limited, honeypot-protected. */
import { json, sameOrigin, count } from "../_lib/accounts.js";
import { saveLead } from "../_lib/sitecfg.js";
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ ok: false, reason: "Not allowed." }, 403);
  const ip = request.headers.get("cf-connecting-ip") || "";
  let b = {}; try { b = JSON.parse((await request.text()).slice(0, 12000)); } catch (e) { return json({ ok: false, reason: "Bad request." }, 400); }
  if (b.website_url) return json({ ok: true });   // honeypot: bots get a quiet success, nothing is stored
  if (await count(env, "lead:" + ip, 8, 3600)) return json({ ok: false, reason: "Too many enquiries from here in the last hour. Please use WhatsApp or email." }, 429);
  try { return json(await saveLead(env, b, ip)); } catch (e) { return json({ ok: false, reason: e.status ? e.message : "We couldn't save that just now. Please use WhatsApp or email." }, e.status || 500); }
}
