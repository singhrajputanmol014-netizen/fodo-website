/* FODO v52 Social Studio: public link-in-bio page /l/<slug> (Workspace ▸ Social Studio ▸ Link in bio). No scripts on the page. */
import { accountsOn, count } from "../_lib/accounts.js";
import { bioPage } from "../_lib/sstudio.js";
const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https: data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
export async function onRequest({ request, env, params }) {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  const slug = String(params.slug || "").toLowerCase();
  if (!accountsOn(env) || !/^[a-z0-9-]{3,40}$/.test(slug)) return new Response("Page not found", { status: 404 });
  const preview = new URL(request.url).searchParams.get("preview") === "1" || (await count(env, "ssbio:" + (request.headers.get("cf-connecting-ip") || "anon") + ":" + slug, 30, 3600));
  let page = null; try { page = await bioPage(env, slug, { preview }); } catch (e) { page = null; }
  if (!page) return new Response("Page not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(page, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": CSP, "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" } });
}
