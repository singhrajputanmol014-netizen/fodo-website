/* FODO Website Builder — serving a PUBLISHED website (v28). Used by the separate "fodo-sites" Cloudflare Pages project
   (sites/functions — client websites never run inside FODO's own production) and by FODO's fallback address
   /api/sites/view/<slug>/ (served with a sandbox CSP, so a client page can never act as fodo.co.in).
   Only the published snapshot is served — drafts never leave the builder. Password-protected pages ask for the page password. */
import { renderPage, liveScript, sitemap, esc } from "./render.js";
import { productPage, cartPage, checkoutPage, orderPage, blogList, blogPost, storeScript } from "./shop.js";

export async function findSite(env, by) {
  const d = env.XRAY_DB; if (!d) return null;
  if (by.domain) { const r = await d.prepare("SELECT s.id, s.slug, s.published, s.status FROM site_domains m JOIN sites s ON s.id = m.site_id WHERE m.domain=?1 AND m.status='connected' AND s.deleted_at IS NULL").bind(String(by.domain).toLowerCase()).first().catch(() => null); return r; }
  return await d.prepare("SELECT id, slug, published, status FROM sites WHERE slug=?1 AND deleted_at IS NULL").bind(String(by.slug || "").toLowerCase()).first().catch(() => null);
}
const html = (body, status, extra) => new Response(body, { status: status || 200, headers: Object.assign({ "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60", "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" }, extra || {}) });
/* rest = path inside the site, e.g. "" | "services/" | "sitemap.xml" */
export async function serve(env, request, row, o) {
  if (!row || row.status !== "live" || !row.published) return html("<!doctype html><meta name=robots content=noindex><title>Not published</title><body style=\"font:16px system-ui;padding:40px\"><h1>This website isn't published yet.</h1></body>", 404);
  let site; try { site = JSON.parse(row.published); } catch (e) { return html("<h1>Website unavailable</h1>", 500); }
  const rest = String(o.rest || "").replace(/^\/+/, ""), origin = o.origin, base = o.base;
  if (rest === "robots.txt") return new Response("User-agent: *\nAllow: /\nSitemap: " + origin + base + "sitemap.xml\n", { headers: { "content-type": "text/plain" } });
  // v29 store + blog: read-only queries of this website's own products/posts
  const api0 = o.api || "https://www.fodo.co.in/api/sites", st = (site.settings && site.settings.store) || {}, needs = JSON.stringify(site.pages || []);
  const live = { base, origin, formAction: api0 + "/f/" + row.id, badge: !(site.settings && site.settings.hideBadge), bodyExtra: liveScript(api0, row.id) + storeScript(api0, row.id, base, st, origin), headers: o.headers };
  const prods = /"products"/.test(needs) || /^(p\/|cart|checkout)/.test(rest) ? await liveProducts(env, row.id) : [], posts = /"blog"/.test(needs) || /^blog/.test(rest) ? await livePosts(env, row.id) : [];
  live.data = { products: prods.map((p) => ({ id: p.id, slug: p.slug, title: p.title, price: p.variants.length ? Math.min.apply(null, p.variants.map((v) => v.price)) : p.price, compare: p.compare, image: p.images[0] || "", collection: p.collection, opts: p.variants.length ? 1 : 0, stock: p.track && !p.variants.length ? p.stock : null })), posts, currency: st.currency };
  if (rest === "sitemap.xml") { const P = await liveProducts(env, row.id), B = await livePosts(env, row.id); return new Response(sitemap(site, origin, base, P.map((x) => "p/" + x.slug + "/").concat(B.length ? ["blog/"] : [], B.map((x) => "blog/" + x.slug + "/"))), { headers: { "content-type": "application/xml" } }); }
  let m;
  if ((m = /^p\/([a-z0-9-]+)\/?$/.exec(rest))) { const p = prods.find((x) => x.slug === m[1]); return p ? html(productPage(site, p, live), 200, o.headers) : html(renderPage(site, "home", Object.assign({}, live, { noindex: true })), 404, o.headers); }
  if (/^cart\/?$/.test(rest)) return html(cartPage(site, prods, live), 200, Object.assign({ "cache-control": "no-store" }, o.headers || {}));
  if (/^checkout\/?$/.test(rest)) return html(checkoutPage(site, prods, live), 200, Object.assign({ "cache-control": "no-store" }, o.headers || {}));
  if ((m = /^order\/(or_[a-z0-9]{14})\/?$/.exec(rest))) return html(orderPage(site, { site: row.id, order: m[1] }, Object.assign({}, live, { api: api0 })), 200, Object.assign({ "cache-control": "no-store" }, o.headers || {}));
  if (/^blog\/?$/.test(rest)) return html(blogList(site, posts, live), 200, o.headers);
  if ((m = /^blog\/([a-z0-9-]+)\/?$/.exec(rest))) { const p = await livePost(env, row.id, m[1]); return p ? html(blogPost(site, p, live), 200, o.headers) : html("<h1>Post not found</h1>", 404); }
  const slug = rest.replace(/\/$/, "") || "home", page = (site.pages || []).find((p) => p.slug === slug && !p.hidden);
  if (!page) return html(renderPage(site, "home", { base, origin, noindex: true }).replace("<body>", "<body><p style=\"padding:12px;text-align:center\">Page not found — here is the home page.</p>"), 404);
  if (page.password) {   // simple page password (hash compared on the server); not a substitute for real accounts
    const url = new URL(request.url), given = request.method === "POST" ? String((await request.formData().catch(() => new FormData())).get("pw") || "") : "";
    const ok = given && (await sha(given + "|" + row.id)) === page.password;
    if (!ok) return html("<!doctype html><meta name=robots content=noindex><meta name=viewport content=\"width=device-width,initial-scale=1\"><title>Protected page</title><form method=post style=\"font:16px system-ui;max-width:360px;margin:80px auto;display:grid;gap:10px\"><h1 style=\"font-size:22px\">This page is protected</h1><label for=pw>Password</label><input id=pw name=pw type=password required style=\"padding:10px\"><button style=\"padding:10px\">Open</button>" + (given ? "<p style=color:#c00>Wrong password.</p>" : "") + "</form>", given ? 403 : 401, { "cache-control": "no-store" });
  }
  const out = renderPage(site, slug, live);
  return html(out, 200, Object.assign(page.password ? { "cache-control": "no-store" } : {}, o.headers || {}));
}
export const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s))))].map((b) => b.toString(16).padStart(2, "0")).join("");
export { esc };

const J = (s, d) => { try { return JSON.parse(s); } catch (e) { return d; } };
async function liveProducts(env, siteId) { try { return ((await env.XRAY_DB.prepare("SELECT * FROM site_products WHERE site_id=?1 AND status='active' ORDER BY sort, created_at DESC LIMIT 200").bind(siteId).all()).results || []).map((r) => Object.assign(r, { images: J(r.images, []), variants: J(r.variants, []), track: !!r.track, optionName: r.option_name })); } catch (e) { return []; } }
async function livePosts(env, siteId) { const now = new Date().toISOString(); try { return ((await env.XRAY_DB.prepare("SELECT slug, title, excerpt, image, tags, author, COALESCE(published_at, publish_at) AS published_at FROM site_posts WHERE site_id=?1 AND (status='published' OR (status='scheduled' AND publish_at<=?2)) ORDER BY COALESCE(published_at, publish_at) DESC LIMIT 60").bind(siteId, now).all()).results || []); } catch (e) { return []; } }
async function livePost(env, siteId, slug) { const now = new Date().toISOString(); try { return await env.XRAY_DB.prepare("SELECT slug, title, excerpt, body, image, tags, author, COALESCE(published_at, publish_at) AS published_at FROM site_posts WHERE site_id=?1 AND slug=?2 AND (status='published' OR (status='scheduled' AND publish_at<=?3))").bind(siteId, slug, now).first(); } catch (e) { return null; } }
