/* FODO v40 Business OS API (/api/biz/*). Session required for everything except GET roles (public list of professional roles).
   Writes need same-origin + JSON (CSRF). Every permission is checked in functions/_lib/biz.js against the server-side roles.
   GET  me · dashboard · brand · content · campaigns · pro · pro/earnings · market?q&role&city&budget&remote · market/<proId> · shortlist
        projects · projects/<id> · notes · actions?text · admin/overview · admin/pros?status · admin/payouts · admin/disputes · admin/staff
   POST brand · brand/extract {siteId} · brand/apply {siteId} · content · content/brief · campaigns · pro · pro/submit · pro/packages
        pro/portfolio · shortlist · projects · projects/<id>/<message|propose|accept|submit|approve|changes|cancel|dispute|review>
        notes/read · admin/pros/<id> {action,note} · admin/payouts/<id> {ref} · admin/disputes/<id> · admin/staff · admin/settings
   DELETE content/<id> · pro/packages/<id> · pro/portfolio/<id> */
import { json, accountsOn, sessionUser, sameOrigin, count, isOwner } from "../../_lib/accounts.js";
import * as B from "../../_lib/biz.js";
import * as W from "../../_lib/sites.js";

export async function onRequest(ctx) {
  const { request, env, params } = ctx, m = request.method, path = [].concat(params.path || []).map(String), p0 = path[0] || "", p1 = path[1] || "", p2 = path[2] || "";
  try {
    if (!accountsOn(env)) return json({ ok: false, reason: "FODO accounts are not switched on." }, 503);
    if (p0 === "roles" && m === "GET") return json({ ok: true, roles: B.PRO_ROLES, categories: B.PRO_CATS, platforms: B.AD_PLATFORMS, contentStates: B.CONTENT_STATES });
    const u = await sessionUser(env, request); if (!u) return json({ ok: false, reason: "Log in to use your FODO workspace.", login: true }, 401);
    if (m !== "GET" && (!sameOrigin(request) || (m !== "DELETE" && !/json/.test(request.headers.get("content-type") || "")))) return json({ ok: false, reason: "Bad request." }, 403);
    if (m !== "GET" && (await count(env, "biz:" + u.id, 400, 3600))) return json({ ok: false, reason: "Too many changes this hour, slow down a little." }, 429);
    const body = m === "POST" || m === "PUT" ? (await request.json().catch(() => null)) || {} : {}, q = Object.fromEntries(new URL(request.url).searchParams), R = await B.rolesOf(env, u), ok = (o) => json(Object.assign({ ok: true }, o));

    if (p0 === "me" && m === "GET") return ok({ user: { id: u.id, email: u.email, name: u.name || "" }, roles: R.roles, nav: B.navFor(R), pro: R.pro, unread: (await B.notes(env, u)).unread });
    if (p0 === "dashboard" && m === "GET") return ok(await B.dashboard(env, u));
    if (p0 === "actions" && m === "GET") return ok({ actions: B.actionsFor(q.text) });
    /* brand kit */
    if (p0 === "brand" && !p1 && m === "GET") return ok({ brand: await B.getBrand(env, u) });
    if (p0 === "brand" && !p1 && m === "POST") return ok({ brand: await B.saveBrand(env, u, body) });
    if (p0 === "brand" && p1 === "extract" && m === "POST") { const s = await W.siteFor(env, u, body.siteId); return ok({ brand: B.brandFromSite(s), from: s.name }); }
    if (p0 === "brand" && p1 === "apply" && m === "POST") {   // put the Brand Kit's colours, fonts and radius on one of YOUR websites (a normal saved version, undo with History)
      const s = await W.siteFor(env, u, body.siteId), br = await B.getBrand(env, u); if (!br) return json({ ok: false, reason: "Save your Brand Kit first." }, 400);
      const doc = JSON.parse(s.doc), t = doc.theme = doc.theme || {}; if (br.colors.primary) t.primary = br.colors.primary; if (br.colors.accent || br.colors.secondary) t.accent = br.colors.accent || br.colors.secondary;
      if (br.fonts.heading) t.headingFont = br.fonts.heading; if (br.fonts.body) t.font = br.fonts.body; if (br.radius != null) t.radius = br.radius;
      const r = await W.saveDoc(env, u, s, doc, s.rev, "Brand Kit applied"); if (r.conflict) return json({ ok: false, reason: "The website was changed meanwhile, try again." }, 409); return ok({ rev: r.rev, siteId: s.id });
    }
    /* content & ads */
    if (p0 === "content" && !p1 && m === "GET") return ok({ items: await B.listContent(env, u) });
    if (p0 === "content" && p1 === "brief" && m === "POST") return ok({ brief: B.buildBrief(body, await B.getBrand(env, u)) });
    if (p0 === "content" && !p1 && m === "POST") return ok({ item: await B.saveContent(env, u, body) });
    if (p0 === "content" && p1 && m === "DELETE") return ok(await B.delContent(env, u, p1));
    if (p0 === "campaigns" && m === "GET") return ok({ items: await B.listCampaigns(env, u) });
    if (p0 === "campaigns" && m === "POST") return ok({ item: await B.saveCampaign(env, u, body) });
    /* my pro profile */
    if (p0 === "pro" && !p1 && m === "GET") return ok({ pro: await B.myPro(env, u) });
    if (p0 === "pro" && !p1 && m === "POST") return ok({ pro: await B.savePro(env, u, body) });
    if (p0 === "pro" && p1 === "submit" && m === "POST") return ok({ pro: await B.submitPro(env, u) });
    if (p0 === "pro" && p1 === "earnings" && m === "GET") return ok(await B.proEarnings(env, u));
    if (p0 === "pro" && p1 === "packages" && m === "POST") return ok({ pro: await B.savePackage(env, u, body) });
    if (p0 === "pro" && p1 === "packages" && p2 && m === "DELETE") return ok({ pro: await B.delPackage(env, u, p2) });
    if (p0 === "pro" && p1 === "portfolio" && m === "POST") return ok({ pro: await B.savePortfolio(env, u, body) });
    if (p0 === "pro" && p1 === "portfolio" && p2 && m === "DELETE") return ok({ pro: await B.delPortfolio(env, u, p2) });
    /* marketplace */
    if (p0 === "market" && !p1 && m === "GET") return ok(await B.market(env, u, q));
    if (p0 === "market" && p1 && m === "GET") return ok({ pro: await B.proPublic(env, u, p1, R) });
    if (p0 === "shortlist") return ok({ items: await B.shortlist(env, u, m === "POST" ? body : null) });
    /* projects */
    if (p0 === "projects" && !p1 && m === "GET") return ok({ items: await B.listProjects(env, u) });
    if (p0 === "projects" && !p1 && m === "POST") return ok({ project: await B.createProject(env, u, body) });
    if (p0 === "projects" && p1 && !p2 && m === "GET") return ok({ project: await B.getProject(env, u, p1, R) });
    if (p0 === "projects" && p1 && p2 && m === "POST") return ok({ project: await B.projectAction(env, u, p1, p2, body, R) });
    /* notifications */
    if (p0 === "notes" && !p1 && m === "GET") return ok(await B.notes(env, u));
    if (p0 === "notes" && p1 === "read" && m === "POST") return ok(await B.readNotes(env, u));
    /* admin / moderation / finance (roles checked inside) */
    if (p0 === "admin") {
      if (p1 === "overview" && m === "GET") return ok(await B.adminOverview(env, R));
      if (p1 === "pros" && !p2 && m === "GET") return ok({ items: await B.adminPros(env, R, q.status) });
      if (p1 === "pros" && p2 && m === "POST") return ok(await B.moderatePro(env, u, R, p2, body.action, body.note));
      if (p1 === "payouts" && !p2 && m === "GET") return ok({ items: await B.adminPayouts(env, R), automatic: B.payoutsOn(env) });
      if (p1 === "payouts" && p2 && m === "POST") return ok(await B.markPaid(env, u, R, p2, body.ref));
      if (p1 === "disputes" && !p2 && m === "GET") return ok({ items: await B.adminDisputes(env, R) });
      if (p1 === "disputes" && p2 && m === "POST") return ok(await B.resolveDispute(env, u, R, p2, body));
      if (p1 === "staff" && m === "GET") { if (!isOwner(u)) return json({ ok: false, reason: "Only FODO owners." }, 403); const d = await B.bdb(env); return ok({ items: (await d.prepare("SELECT email, role, added_at FROM biz_staff ORDER BY added_at").all()).results || [] }); }
      if (p1 === "staff" && m === "POST") return ok(await B.setStaff(env, u, body.email, body.role));
      if (p1 === "settings" && m === "POST") return ok(await B.saveSettings(env, u, body));
    }
    return json({ ok: false, reason: "Not found." }, 404);
  } catch (e) {
    return json(Object.assign({ ok: false, reason: e.status ? e.message : "Something went wrong, please try again." }, e.missing ? { missing: e.missing } : {}), e.status || 500);
  }
}
