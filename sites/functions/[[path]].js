/* FODO client websites, the SEPARATE Cloudflare Pages project "fodo-sites" (root directory: sites/). Bindings: XRAY_DB (D1),
   variable SITES_HOST (its own address, e.g. sites.fodo.co.in). Customers' custom domains are attached to THIS project, never to
   FODO's own. Address forms:
     https://sites.fodo.co.in/<slug>/<page>/   (every website)
     https://www.client.com/<page>/           (a connected custom domain)
   Nothing here can read or change anything: it only renders the published snapshot. Forms and analytics go to FODO's API. */
import { findSite, serve } from "../lib/serve.js";
export async function onRequest({ request, env }) {
  const u = new URL(request.url), host = u.hostname.toLowerCase(), own = String(env.SITES_HOST || "sites.fodo.co.in").toLowerCase();
  const api = (env.FODO_API || "https://www.fodo.co.in") + "/api/sites";
  if (host === own || /\.pages\.dev$/.test(host) || host === "localhost" || host === "127.0.0.1") {
    const parts = u.pathname.replace(/^\/+/, "").split("/"), slug = parts.shift();
    if (!slug) return Response.redirect("https://www.fodo.co.in/website-builder/", 302);
    if (!/^[a-z0-9-]{3,40}$/.test(slug)) return new Response("Not found", { status: 404 });
    if (u.pathname === "/" + slug) return Response.redirect(u.origin + "/" + slug + "/" + u.search, 301);
    return serve(env, request, await findSite(env, { slug }), { rest: parts.join("/"), base: "/" + slug + "/", origin: u.origin, api });
  }
  const row = await findSite(env, { domain: host.replace(/^www\./, "") }) || await findSite(env, { domain: host });
  if (!row) return new Response("This domain is not connected to a FODO website yet.", { status: 404, headers: { "content-type": "text/plain" } });
  return serve(env, request, row, { rest: u.pathname, base: "/", origin: u.origin, api, ownDomain: true });   // its own origin: the only place custom code may run
}
