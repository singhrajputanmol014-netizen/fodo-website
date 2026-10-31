/* POST /api/t — first-party page-view / event beacon for the FODO admin dashboard (see functions/_lib/traffic.js). Always answers 204. */
import { collect } from "../_lib/traffic.js";
export async function onRequestPost(ctx) {
  try { const o = ctx.request.headers.get("origin"); if (o && new URL(o).host !== new URL(ctx.request.url).host) return new Response(null, { status: 204 }); return await collect(ctx.request, ctx.env); }
  catch (e) { return new Response(null, { status: 204 }); }
}
export const onRequestGet = () => new Response(null, { status: 405 });
