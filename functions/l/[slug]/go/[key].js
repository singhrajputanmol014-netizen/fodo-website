/* FODO v52: link-in-bio click counter, then a redirect to the saved address (only addresses saved on that page). */
import { accountsOn } from "../../../_lib/accounts.js";
import { bioClick } from "../../../_lib/sstudio.js";
export async function onRequest({ request, env, params }) {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
  if (!accountsOn(env)) return new Response("Not found", { status: 404 });
  let url = null; try { url = await bioClick(env, String(params.slug || ""), String(params.key || "")); } catch (e) { url = null; }
  if (!url) return new Response("Link not found", { status: 404 });
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store", "referrer-policy": "strict-origin-when-cross-origin" } });
}
