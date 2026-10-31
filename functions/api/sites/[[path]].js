/* FODO Website Builder API (/api/sites/*) — v28. Two kinds of routes:
   PUBLIC (no session, no cookies used): GET templates · GET view/<slug>/<page…> (FODO's fallback address for a live site, sandboxed)
     GET media/<id> · POST e (analytics beacon) · POST f/<siteId> (contact form)
   ACCOUNT (session required; every website resolved with siteFor() = only YOUR websites; FODO owners: all, audited):
     GET  list[?all=1] · recommend?q · <id> · <id>/versions · <id>/forms · <id>/stats · <id>/domains · <id>/media · <id>/export · <id>/health
     POST create · <id>/ai · <id>/rewrite · <id>/publish · <id>/unpublish · <id>/versions · <id>/restore/<vid> · <id>/domains
          <id>/domains/<domain>/verify · <id>/media (raw image bytes) · <id>/password
     PUT  <id> {doc, baseRev}      DELETE <id> · <id>/domains/<domain>
   Writes need same-origin + JSON (or image bytes for media) — CSRF. */
import { json, accountsOn, sessionUser, isOwner, sameOrigin, count, sha256 } from "../../_lib/accounts.js";
import * as W from "../../_lib/sites.js";
import { findSite, serve, sha } from "../../../sites/lib/serve.js";
import { audit } from "../../_lib/brain/store.js";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" };
export async function onRequest(ctx) {
  const { request, env, params } = ctx, m = request.method, path = [].concat(params.path || []).map(String), p0 = path[0] || "";
  try {
    if (!accountsOn(env)) return json({ ok: false, reason: "Website Builder is not switched on." }, 503);
    /* ---- public ---- */
    if (m === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (p0 === "templates" && m === "GET") return json({ ok: true, templates: W.TEMPLATES.filter((t) => W.clientAllowed(t.license)).map((t) => ({ id: t.id, name: t.name, category: t.category, tags: t.tags, theme: t.theme, pages: t.pages.map((p) => p.title), license: t.license, tech: t.tech, features: t.features })), sources: W.SOURCES }, 200, { "cache-control": "public, max-age=300" });
    if (p0 === "view" && path[1]) {   // fallback live address, sandboxed so it can never act as fodo.co.in
      const u = new URL(request.url), row = await findSite(env, { slug: path[1] });
      return serve(env, request, row, { rest: path.slice(2).join("/"), base: "/api/sites/view/" + path[1] + "/", origin: u.origin, api: u.origin + "/api/sites", headers: { "content-security-policy": "sandbox allow-scripts allow-forms allow-popups; default-src 'self' https: data:; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; frame-ancestors 'none'" } });
    }
    if (p0 === "media" && path[1] && m === "GET") { const f = await W.getMedia(env, path[1]); return f ? new Response(f.body, { headers: { "content-type": f.mime, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" } }) : new Response("Not found", { status: 404 }); }
    const ip = request.headers.get("cf-connecting-ip") || "";
    if (p0 === "e" && m === "POST") { if (!(await count(env, "site-e:" + ip, 600, 3600))) { const b = JSON.parse((await request.text()).slice(0, 2000) || "{}"); await W.beacon(env, b); } return new Response(null, { status: 204, headers: CORS }); }
    if (p0 === "f" && path[1] && m === "POST") {
      if (await count(env, "site-f:" + ip, 20, 3600)) return json({ ok: false, reason: "Too many messages — please try later." }, 429, CORS);
      let b = {}; try { b = JSON.parse((await request.text()).slice(0, 20000)); } catch (e) {}
      try { return json(await W.submitForm(env, path[1], b, ip), 200, CORS); } catch (e) { return json({ ok: false, reason: e.message }, e.status || 400, CORS); }
    }
    /* ---- account ---- */
    const u = await sessionUser(env, request); if (!u) return json({ ok: false, reason: "Log in to use the Website Builder.", login: true }, 401);
    const ctype = request.headers.get("content-type") || "";
    if (m !== "GET" && (!sameOrigin(request) || (m !== "DELETE" && !(/json/.test(ctype) || (path[1] === "media" && /^image\//.test(ctype)))))) return json({ ok: false, reason: "Bad request." }, 403);
    if (m !== "GET" && (await count(env, "sites:" + u.id, 600, 3600))) return json({ ok: false, reason: "Too many changes this hour — slow down a little." }, 429);
    const body = m === "POST" || m === "PUT" ? (path[1] === "media" ? null : (await request.json().catch(() => null)) || {}) : null, q = new URL(request.url).searchParams;
    if (p0 === "list" && m === "GET") return json({ ok: true, sites: await W.listSites(env, u, q.get("all") === "1"), limits: W.limitsFor(u), owner: isOwner(u), hosting: W.hostingOn(env), sitesHost: env.SITES_HOST || null });
    if (p0 === "recommend" && m === "GET") return json({ ok: true, templates: W.recommend(q.get("q") || "") });
    if (p0 === "create" && m === "POST") { if (await count(env, "sites-ai:" + u.id, W.limitsFor(u).ai, 86400)) return json({ ok: false, reason: "Daily AI limit reached." }, 429); return json(Object.assign({ ok: true }, await W.createSite(env, u, body))); }
    const s = await W.siteFor(env, u, p0), p1 = path[1] || "";
    if (s.asOwner) await audit(env, { owner: u.email, kind: "sites", tool: m + " " + (p1 || "site"), status: "owner access", detail: s.id + " (" + s.name + ")" });
    if (!p1) {
      if (m === "GET") return json({ ok: true, site: { id: s.id, name: s.name, slug: s.slug, status: s.status, rev: s.rev, doc: JSON.parse(s.doc), publishedAt: s.published_at, template: s.template_id, urls: W.urlsFor(env, s), asOwner: s.asOwner }, limits: W.limitsFor(u) });
      if (m === "PUT") { const r = await W.saveDoc(env, u, s, body.doc, body.baseRev, body.note); return json(Object.assign({ ok: !r.conflict }, r), r.conflict ? 409 : 200); }
      if (m === "DELETE") { await (await W.sdb(env)).prepare("UPDATE sites SET deleted_at=?2, status='draft' WHERE id=?1").bind(s.id, new Date().toISOString()).run(); return json({ ok: true, deleted: true }); }
    }
    const ai = async () => { if (await count(env, "sites-ai:" + u.id, W.limitsFor(u).ai, 86400)) throw Object.assign(new Error("Daily AI limit reached for your plan."), { status: 429 }); };
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
    if (p1 === "export" && m === "GET") { const z = await W.exportZip(env, s, s.status === "live" ? (W.urlsFor(env, s).sites || "").replace(/\/[^/]+\/$/, "") : ""); return new Response(z, { headers: { "content-type": "application/zip", "content-disposition": "attachment; filename=\"" + s.slug + "-website.zip\"", "cache-control": "no-store" } }); }
    return json({ ok: false, reason: "Not found." }, 404);
  } catch (e) {
    return json({ ok: false, reason: e.status ? e.message : "The Website Builder hit an error. Please try again." }, e.status || 500);
  }
}
