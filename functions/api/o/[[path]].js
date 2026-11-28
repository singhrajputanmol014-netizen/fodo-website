// v55.35 email open pixel: GET /api/o/<send id>.gif marks a FODO email as seen (cm_sends.opened_at) and always answers a 1x1 transparent GIF.
import { markOpen } from "../../_lib/outreach.js";

const GIF = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));

export async function onRequest(context) {
  const { request, env, params } = context;
  const p = [].concat(params.path || []).join("/");
  const id = String(p).replace(/\.gif$/i, "");
  if (request.method === "GET" && env.XRAY_DB) { try { await markOpen(env, id); } catch (e) { /* never break the image */ } }
  return new Response(GIF, { status: 200, headers: { "content-type": "image/gif", "cache-control": "no-store, no-cache, must-revalidate, private", "x-robots-tag": "noindex" } });
}
