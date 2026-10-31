/* FODO Website Builder API (/api/sites/*), v28. Two kinds of routes:
   PUBLIC (no session, no cookies used): GET templates · GET view/<slug>/<page…> (FODO's fallback address for a live site, sandboxed)
     GET media/<id> · POST e (analytics beacon) · POST f/<siteId> (contact form)
     v29 store: POST shop/<siteId>/checkout (server-priced) · GET shop/<siteId>/order/<orderId>?t=<token> (verifies online payment)
   ACCOUNT (session required; every website resolved with siteFor() = only YOUR websites; FODO owners: all, audited):
     GET  list[?all=1] · recommend?q · <id> · <id>/versions · <id>/forms · <id>/stats · <id>/domains · <id>/media · <id>/export · <id>/health
     POST create · <id>/ai · <id>/rewrite · <id>/publish · <id>/unpublish · <id>/versions · <id>/restore/<vid> · <id>/domains
          <id>/domains/<domain>/verify · <id>/media (raw image bytes) · <id>/password
     PUT  <id> {doc, baseRev}      DELETE <id> · <id>/domains/<domain>
     v29: <id>/products[/<pid>] · <id>/orders[/<oid>] · <id>/discounts[/<code>] · <id>/posts[/<pid>] · <id>/payments · <id>/store-stats
   Writes need same-origin + JSON (or image bytes for media): CSRF. */
import { json, accountsOn, sessionUser, isOwner, sameOrigin, count, sha256 } from "../../_lib/accounts.js";
import * as W from "../../_lib/sites.js";
import * as SH from "../../_lib/shop.js";
import { findSite, serve, sha } from "../../../sites/lib/serve.js";
import { audit } from "../../_lib/brain/store.js";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" };
export async function onRequest(ctx) {
  const { request, env, params } = ctx, m = request.method, path = [].concat(params.path || []).map(String), p0 = path[0] || "";
  try {
    if (!accountsOn(env)) return json({ ok: false, reason: "Website Builder is not switched on." }, 503);
    /* ---- public ---- */
    if (m === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (p0 === "templates" && m === "GET") { const custom = await W.customTemplates(env).catch(() => []); return json({ ok: true, templates: W.TEMPLATES.filter((t) => W.clientAllowed(t.license)).map((t) => ({ id: t.id, name: t.name, category: t.category, tags: t.tags, theme: t.theme, pages: t.pages.map((p) => p.title), license: t.license, tech: t.tech, features: t.features })), custom, sources: W.SOURCES }, 200, { "cache-control": "public, max-age=120" }); }
    if (p0 === "preview" && path[1]) {   // v32 client review link: the CURRENT draft, sandboxed, noindex, with an approval bar
      const sh = await W.shareSite(env, path[1]);
      if (path[2] === "review" && m === "POST") { if (await count(env, "site-rv:" + (request.headers.get("cf-connecting-ip") || ""), 20, 3600)) return json({ ok: false, reason: "Too many." }, 429, CORS); let b = {}; try { b = JSON.parse((await request.text()).slice(0, 5000)); } catch (e) {} try { return json(await W.review(env, path[1], b), 200, CORS); } catch (e) { return json({ ok: false, reason: e.message }, e.status || 400, CORS); } }
      if (!sh) return new Response("<!doctype html><meta name=robots content=noindex><title>Expired</title><p style='font:16px system-ui;padding:40px'>This preview link has expired or was revoked.</p>", { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
      const doc = JSON.parse(sh.doc), slug = (path[2] || "").replace(/\/$/, "") || "home", u0 = new URL(request.url), base = "/api/sites/preview/" + path[1] + "/";
      if (!doc.pages.some((p) => p.slug === slug)) return Response.redirect(u0.origin + base, 302);
      const bar = '<div id="fodo-rv" style="position:fixed;left:0;right:0;bottom:0;z-index:99;background:#0b0a16;color:#fff;font:14px system-ui;padding:12px 16px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;box-shadow:0 -10px 40px rgba(0,0,0,.4)"><b style="margin-right:auto">Preview of “' + W.esc(sh.name) + '”, your feedback</b><input id="rv-n" placeholder="Your name" style="padding:8px;border-radius:8px;border:0;min-width:120px"><input id="rv-c" placeholder="Comments (what should change?)" style="padding:8px;border-radius:8px;border:0;flex:1;min-width:200px"><button data-d="changes" style="padding:9px 14px;border-radius:999px;border:0;background:#ffbf47;font-weight:700;cursor:pointer">Request changes</button><button data-d="approve" style="padding:9px 14px;border-radius:999px;border:0;background:#3ddc97;font-weight:700;cursor:pointer">Approve ✓</button></div><script>document.getElementById("fodo-rv").addEventListener("click",function(e){var b=e.target.closest("[data-d]");if(!b)return;b.disabled=true;fetch(' + JSON.stringify(base + "review") + ',{method:"POST",headers:{"content-type":"text/plain"},body:JSON.stringify({decision:b.getAttribute("data-d"),name:document.getElementById("rv-n").value,comment:document.getElementById("rv-c").value})}).then(function(r){return r.json()}).then(function(j){document.getElementById("fodo-rv").innerHTML=j.ok?"<b>Thank you, your "+(j.decision==="approved"?"approval":"feedback")+" was sent.</b>":"<b>"+(j.reason||"Could not send")+"</b>"})})</script><div style="height:70px"></div>';
      return new Response(W.renderPage(doc, slug, { base, origin: u0.origin, noindex: true, badge: false, bodyExtra: bar }), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex", "content-security-policy": "sandbox allow-scripts allow-forms allow-popups; default-src 'self' https: data:; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; connect-src 'self'; frame-ancestors 'self'" } });
    }
    if (p0 === "view" && path[1]) {   // fallback live address, sandboxed so it can never act as fodo.co.in
      const u = new URL(request.url), row = await findSite(env, { slug: path[1] });
      return serve(env, request, row, { rest: path.slice(2).join("/"), base: "/api/sites/view/" + path[1] + "/", origin: u.origin, api: u.origin + "/api/sites", headers: { "content-security-policy": "sandbox allow-scripts allow-forms allow-popups; default-src 'self' https: data:; script-src 'unsafe-inline' https://sdk.cashfree.com; connect-src 'self' https:; style-src 'unsafe-inline' https://fonts.googleapis.com; frame-ancestors 'none'" } });
    }
    if (p0 === "media" && path[1] && m === "GET") { const f = await W.getMedia(env, path[1]); return f ? new Response(f.body, { headers: { "content-type": f.mime, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" } }) : new Response("Not found", { status: 404 }); }
    const ip = request.headers.get("cf-connecting-ip") || "";
    if (p0 === "e" && m === "POST") { if (!(await count(env, "site-e:" + ip, 600, 3600))) { const b = JSON.parse((await request.text()).slice(0, 2000) || "{}"); await W.beacon(env, b); } return new Response(null, { status: 204, headers: CORS }); }
    if (p0 === "f" && path[1] && m === "POST") {
      if (await count(env, "site-f:" + ip, 20, 3600)) return json({ ok: false, reason: "Too many messages, please try later." }, 429, CORS);
      let b = {}; try { b = JSON.parse((await request.text()).slice(0, 20000)); } catch (e) {}
      try { return json(await W.submitForm(env, path[1], b, ip), 200, CORS); } catch (e) { return json({ ok: false, reason: e.message }, e.status || 400, CORS); }
    }
    if (p0 === "shop" && path[1]) {   // v29 public store routes (no cookies; prices and stock decided here)
      if (path[2] === "checkout" && m === "POST") {
        if (await count(env, "shop-co:" + ip, 30, 3600)) return json({ ok: false, reason: "Too many attempts, please try later." }, 429, CORS);
        let b = {}; try { b = JSON.parse((await request.text()).slice(0, 30000)); } catch (e) {}
        try { return json(await SH.checkout(env, path[1], b, ip), 200, CORS); } catch (e) { return json({ ok: false, reason: e.status ? e.message : "Checkout failed, please try again." }, e.status || 500, CORS); }
      }
      if (path[2] === "order" && path[3] && m === "GET") { const o = await SH.orderFor(env, path[1], path[3], new URL(request.url).searchParams.get("t")); return json(o ? { ok: true, order: { number: o.number, status: o.status, items: o.items.map((i) => ({ title: i.title, variant: i.variant, qty: i.qty, price: i.price })), subtotal: o.subtotal, discount: o.discount, shipping: o.shipping, tax: o.tax, total: o.total, method: o.method, createdAt: o.created_at } } : { ok: false, reason: "Order not found." }, o ? 200 : 404, Object.assign({ "cache-control": "no-store" }, { "access-control-allow-origin": "*" })); }
      return json({ ok: false, reason: "Not found." }, 404, CORS);
    }
    /* ---- account ---- */
    const u = await sessionUser(env, request); if (!u) return json({ ok: false, reason: "Log in to use the Website Builder.", login: true }, 401);
    const ctype = request.headers.get("content-type") || "";
    if (m !== "GET" && (!sameOrigin(request) || (m !== "DELETE" && !(/json/.test(ctype) || (path[1] === "media" && /^image\//.test(ctype)))))) return json({ ok: false, reason: "Bad request." }, 403);
    if (m !== "GET" && (await count(env, "sites:" + u.id, 600, 3600))) return json({ ok: false, reason: "Too many changes this hour, slow down a little." }, 429);
    const body = m === "POST" || m === "PUT" ? (path[1] === "media" ? null : (await request.json().catch(() => null)) || {}) : null, q = new URL(request.url).searchParams;
    if (p0 === "list" && m === "GET") return json({ ok: true, sites: await W.listSites(env, u, q.get("all") === "1", q.get("archived") === "1"), limits: W.limitsFor(u), owner: isOwner(u), hosting: W.hostingOn(env), sitesHost: env.SITES_HOST || null });
    if (p0 === "recommend" && m === "GET") return json({ ok: true, templates: W.recommend(q.get("q") || "") });
    if (p0 === "create" && m === "POST") { if (await count(env, "sites-ai:" + u.id, W.limitsFor(u).ai, 86400)) return json({ ok: false, reason: "Daily AI limit reached." }, 429); return json(Object.assign({ ok: true }, await W.createSite(env, u, body))); }
    if (p0 === "import" && path[1] === "analyze" && m === "POST") { if (await count(env, "sites-imp:" + u.id, 30, 3600)) return json({ ok: false, reason: "Too many imports this hour." }, 429); const a = await W.analyzeSite(env, body.url); return json({ ok: true, analysis: a, plan: W.importPlan(a) }); }
    if (p0 === "templates" && path[1] && m === "DELETE") return json(Object.assign({ ok: true }, await W.removeTemplate(env, u, path[1])));
    if (p0 === "audit-doc" && m === "POST") return json(Object.assign({ ok: true }, W.audit(W.validateDoc(body.doc, W.limitsFor(u)), { mobile: body.mobile })));
    const s = await W.siteFor(env, u, p0), p1 = path[1] || "";
    if (s.asOwner) await audit(env, { owner: u.email, kind: "sites", tool: m + " " + (p1 || "site"), status: "owner access", detail: s.id + " (" + s.name + ")" });
    if (!p1) {
      if (m === "GET") return json({ ok: true, role: s.role, site: { id: s.id, name: s.name, slug: s.slug, status: s.status, rev: s.rev, doc: JSON.parse(s.doc), publishedAt: s.published_at, template: s.template_id, urls: W.urlsFor(env, s), asOwner: s.asOwner, role: s.role, review: s.review || "draft", industry: s.industry }, limits: await W.siteLimits(env, u, s) });
      if (m === "PUT") { W.need(s, "edit"); const r = await W.saveDoc(env, u, s, body.doc, body.baseRev, body.note); return json(Object.assign({ ok: !r.conflict }, r), r.conflict ? 409 : 200); }
      if (m === "DELETE") { W.need(s, "delete"); await (await W.sdb(env)).prepare("UPDATE sites SET deleted_at=?2, status='draft' WHERE id=?1").bind(s.id, new Date().toISOString()).run(); return json({ ok: true, deleted: true }); }
    }
    const ai = async () => { if (await count(env, "sites-ai:" + u.id, W.limitsFor(u).ai, 86400)) throw Object.assign(new Error("Daily AI limit reached for your plan."), { status: 429 }); };
    if (m !== "GET" && !/^(share|shares)$/.test(p1)) W.need(s, /^(publish|unpublish|domains|members|transfer|payments|archive|to-template)$/.test(p1) ? (p1 === "transfer" ? "transfer" : "publish") : "edit");
    if (p1 === "ai" && m === "POST") { await ai(); return json(Object.assign({ ok: true }, await W.aiEdit(env, u, s, body.instruction, body.selected))); }
    if (p1 === "rewrite" && m === "POST") { await ai(); return json(Object.assign({ ok: true }, await W.rewrite(env, u, s, body.text, body.mode))); }
    if (p1 === "publish" && m === "POST") return json(Object.assign({ ok: true }, await W.publish(env, u, s)));
    if (p1 === "unpublish" && m === "POST") return json(Object.assign({ ok: true }, await W.unpublish(env, s)));
    if (p1 === "versions") return m === "GET" ? json({ ok: true, versions: await W.versions(env, s) }) : json(Object.assign({ ok: true }, await W.saveDoc(env, u, s, JSON.parse(s.doc), s.rev, String(body.note || "Saved version").slice(0, 120))));
    if (p1 === "restore" && path[2] && m === "POST") return json(Object.assign({ ok: true }, await W.restore(env, u, s, path[2])));
    if (p1 === "forms" && m === "GET") return json({ ok: true, items: await W.forms(env, s) });
    if (p1 === "stats" && m === "GET") return json(Object.assign({ ok: true }, await W.stats(env, s, Math.max(1, Math.min(90, +q.get("days") || 30)))));
    if (p1 === "health" && m === "GET") return json(Object.assign({ ok: true }, await W.health(env, s)));
    if (p1 === "domains") {
      if (m === "GET" && !path[2]) return json({ ok: true, domains: await W.domains(env, s), hosting: W.hostingOn(env), target: W.target(env) });
      if (m === "POST" && !path[2]) return json(Object.assign({ ok: true }, await W.addDomain(env, u, s, body.domain)));
      if (m === "POST" && path[3] === "verify") return json(Object.assign({ ok: true }, await W.verifyDomain(env, s, path[2])));
      if (m === "DELETE" && path[2]) return json(Object.assign({ ok: true }, await W.removeDomain(env, s, path[2])));
    }
    if (p1 === "media") {
      if (m === "GET") return json({ ok: true, items: await W.listMedia(env, s) });
      if (m === "POST") { const buf = await request.arrayBuffer(); return json(Object.assign({ ok: true }, await W.putMedia(env, u, s, buf, ctype.split(";")[0], q.get("name") || ""))); }
    }
    if (p1 === "password" && m === "POST") { const pw = String(body.password || ""); return json({ ok: true, hash: pw ? await sha(pw + "|" + s.id) : null }); }   // the editor stores the hash on the page
    /* ---- v29 store + blog (every query is scoped to s.id, which siteFor() already checked belongs to you) ---- */
    if (p1 === "products") {
      if (m === "GET" && !path[2]) return json({ ok: true, products: await SH.products(env, s.id) });
      if (m === "POST" && !path[2]) return json(Object.assign({ ok: true }, await SH.saveProduct(env, s, body)));
      if (m === "PUT" && path[2]) return json(Object.assign({ ok: true }, await SH.saveProduct(env, s, body, path[2])));
      if (m === "DELETE" && path[2]) return json(Object.assign({ ok: true }, await SH.deleteProduct(env, s, path[2])));
    }
    if (p1 === "orders") {
      if (m === "GET" && !path[2]) return json({ ok: true, orders: await SH.orders(env, s, { status: q.get("status") || "" }) });
      if (m === "POST" && path[2]) {
        if (body.status === "verify") { const o = await (await SH.shopDb(env)).prepare("SELECT token FROM site_orders WHERE id=?1 AND site_id=?2").bind(path[2], s.id).first(); if (!o) return json({ ok: false, reason: "Order not found." }, 404); const r = await SH.orderFor(env, s.id, path[2], o.token); return json({ ok: true, status: r.status }); }
        return json(Object.assign({ ok: true }, await SH.setOrderStatus(env, s, path[2], String(body.status || ""))));
      }
    }
    if (p1 === "discounts") {
      if (m === "GET") return json({ ok: true, discounts: await SH.discounts(env, s) });
      if (m === "POST") return json(Object.assign({ ok: true }, await SH.saveDiscount(env, s, body)));
      if (m === "DELETE" && path[2]) return json(Object.assign({ ok: true }, await SH.deleteDiscount(env, s, path[2])));
    }
    if (p1 === "posts") {
      if (m === "GET" && !path[2]) return json({ ok: true, posts: await SH.posts(env, s.id, {}) });
      if (m === "GET" && path[2]) { const x = await SH.getPost(env, s, path[2]); return x ? json({ ok: true, post: x }) : json({ ok: false, reason: "Post not found." }, 404); }
      if (m === "POST" && !path[2]) return json(Object.assign({ ok: true }, await SH.savePost(env, s, body)));
      if (m === "PUT" && path[2]) return json(Object.assign({ ok: true }, await SH.savePost(env, s, body, path[2])));
      if (m === "DELETE" && path[2]) return json(Object.assign({ ok: true }, await SH.deletePost(env, s, path[2])));
    }
    if (p1 === "payments") {
      if (m === "GET") return json(Object.assign({ ok: true }, await SH.paymentStatus(env, s)));
      if (m === "POST") return json(Object.assign({ ok: true }, await SH.savePayment(env, s, body)));
      if (m === "DELETE") return json(Object.assign({ ok: true }, await SH.removePayment(env, s)));
    }
    if (p1 === "store-stats" && m === "GET") return json(Object.assign({ ok: true }, await SH.storeStats(env, s)));
    /* ---- v32 ---- */
    if (p1 === "duplicate" && m === "POST") return json(Object.assign({ ok: true }, await W.duplicateSite(env, u, s)));
    if (p1 === "archive" && m === "POST") return json(Object.assign({ ok: true }, await W.archiveSite(env, s, body.on !== false)));
    if (p1 === "delete-info" && m === "GET") return json(Object.assign({ ok: true }, await W.deleteInfo(env, s)));
    if (p1 === "share" && m === "POST") { W.need(s, "edit"); return json(Object.assign({ ok: true }, await W.createShare(env, u, s, body.days, body.note))); }
    if (p1 === "shares" && m === "GET") return json(Object.assign({ ok: true }, await W.shares(env, s)));
    if (p1 === "shares" && m === "DELETE" && path[2]) { W.need(s, "edit"); return json(Object.assign({ ok: true }, await W.revokeShare(env, s, path[2]))); }
    if (p1 === "review" && m === "POST") return json(Object.assign({ ok: true }, await W.setReview(env, s, body.status)));
    if (p1 === "members") { if (m === "GET") return json(Object.assign({ ok: true, you: s.role }, await W.members(env, s))); W.need(s, "members"); if (m === "POST") return json(Object.assign({ ok: true }, await W.addMember(env, u, s, body.email, body.role))); if (m === "DELETE" && path[2]) return json(Object.assign({ ok: true }, await W.removeMember(env, s, decodeURIComponent(path[2])))); }
    if (p1 === "transfer" && m === "POST") return json(Object.assign({ ok: true }, await W.transferSite(env, u, s, body.email)));
    if (p1 === "generate" && m === "POST") { await ai(); return json(Object.assign({ ok: true }, await W.generateCopy(env, u, s))); }
    if (p1 === "audit" && m === "GET") return json(Object.assign({ ok: true }, W.audit(JSON.parse(s.doc))));
    if (p1 === "ai-log" && m === "GET") return json({ ok: true, items: await W.aiHistory(env, s) });
    if (p1 === "to-template" && m === "POST") return json(Object.assign({ ok: true }, await W.toTemplate(env, u, s, body)));
    if (p1 === "export" && m === "GET") { const z = await W.exportZip(env, s, s.status === "live" ? (W.urlsFor(env, s).sites || "").replace(/\/[^/]+\/$/, "") : ""); return new Response(z, { headers: { "content-type": "application/zip", "content-disposition": "attachment; filename=\"" + s.slug + "-website.zip\"", "cache-control": "no-store" } }); }
    return json({ ok: false, reason: "Not found." }, 404);
  } catch (e) {
    return json({ ok: false, reason: e.status ? e.message : "The Website Builder hit an error. Please try again." }, e.status || 500);
  }
}
