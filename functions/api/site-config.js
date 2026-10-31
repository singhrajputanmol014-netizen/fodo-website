/* v34 GET /api/site-config: the public part of the admin-editable website settings (booking link, analytics IDs that load
   only after cookie consent, review link, Founding Programme counter). Cached for 60 s. Nothing secret. */
import { publicCfg } from "../_lib/sitecfg.js";
export async function onRequestGet({ env }) {
  let c = {}; try { c = await publicCfg(env); } catch (e) { c = {}; }
  return new Response(JSON.stringify({ ok: true, config: c }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" } });
}
