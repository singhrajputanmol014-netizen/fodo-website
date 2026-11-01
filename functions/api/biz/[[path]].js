/* FODO v40 Business OS API (/api/biz/*). Session required for everything except GET roles (public list of professional roles).
   Writes need same-origin + JSON (CSRF). Every permission is checked in functions/_lib/biz.js against the server-side roles.
   GET  me · dashboard · brand · content · campaigns · pro · pro/earnings · market?q&role&city&budget&remote · market/<proId> · shortlist
        projects · projects/<id> · notes · actions?text · admin/overview · admin/pros?status · admin/payouts · admin/disputes · admin/staff
   POST brand · brand/extract {siteId} · brand/apply {siteId} · content · content/brief · campaigns · pro · pro/submit · pro/packages
        pro/portfolio · shortlist · projects · projects/<id>/<message|propose|accept|submit|approve|changes|cancel|dispute|review> + v44 (tasks, change requests, time, retainer, team, refunds: see _lib/projects2.js)
        notes/read · admin/pros/<id> {action,note} · admin/payouts/<id> {ref} · admin/disputes/<id> · admin/staff · admin/settings
   DELETE content/<id> · pro/packages/<id> · pro/portfolio/<id> · files/<id>
   v45 CRM: GET crm/contacts?q&tag · crm/contacts/<id> · crm/pipeline · crm/followups · crm/duplicates · crm/export?what=contacts|deals (CSV)
        POST crm/contacts · crm/contacts/<id>/delete · crm/merge · crm/import-forms · crm/import-csv {csv} · crm/deals · crm/deals/<id>/delete · crm/activities · crm/activities/<id> {done} · crm/activities/<id>/delete
   v46.1: GET settings/notify · POST settings/notify · GET privacy (log + what blocks a deletion) · POST privacy/export (JSON file) · POST privacy/delete {confirm:"DELETE"} · GET admin/analytics
   v45 Studio: GET studio/usage · POST studio/caption · studio/script · studio/ads · studio/utm · studio/save
   v43 private files: GET files?project= · files/storage · files/<id>/download[?inline=1]
        POST files/upload?project=&milestone=&kind=&replaces=&name=&note= (raw bytes, same-origin + X-FODO-Upload header) */
import { json, accountsOn, sessionUser, sameOrigin, count, isOwner } from "../../_lib/accounts.js";
import * as B from "../../_lib/biz.js";
import * as W from "../../_lib/sites.js";
import * as FL from "../../_lib/files.js";
import * as CRM from "../../_lib/crm.js";
import * as ST from "../../_lib/studio.js";
import * as PV from "../../_lib/privacy.js";
import * as AL from "../../_lib/alerts.js";
import * as AN from "../../_lib/analytics.js";
import * as PO from "../../_lib/payouts.js";

export async function onRequest(ctx) {
  const { request, env, params } = ctx, m = request.method, path = [].concat(params.path || []).map(String), p0 = path[0] || "", p1 = path[1] || "", p2 = path[2] || "";
  try {
    if (!accountsOn(env)) return json({ ok: false, reason: "FODO accounts are not switched on." }, 503);
    if (p0 === "roles" && m === "GET") return json({ ok: true, roles: B.PRO_ROLES, categories: B.PRO_CATS, platforms: B.AD_PLATFORMS, contentStates: B.CONTENT_STATES });
    if (p0 === "invite" && m === "GET") return json(Object.assign({ ok: true }, await B.inviteStatus(env, new URL(request.url).searchParams.get("i"))), 200, { "cache-control": "no-store" });   // valid or not, nothing else
    const u = await sessionUser(env, request); if (!u) return json({ ok: false, reason: "Log in to use your FODO workspace.", login: true }, 401);
    /* v43 private files: the upload body is the raw file (not JSON); same-origin + a custom header (a cross-site form can't send it) */
    if (p0 === "files" && p1 === "upload" && m === "POST") {
      if (!sameOrigin(request) || request.headers.get("x-fodo-upload") !== "1") return json({ ok: false, reason: "Bad request." }, 403);
      if (await count(env, "bizup:" + u.id, 120, 3600)) return json({ ok: false, reason: "Too many uploads this hour, slow down a little." }, 429);
      const st = FL.storeKind(env), max = st ? FL.LIMITS[st].file : 0, len = +(request.headers.get("content-length") || 0); if (len && len > max) return json({ ok: false, reason: "Files can be up to " + Math.round(max / 1048576) + " MB" + (st === "kv" ? " until private R2 storage is connected." : ".") }, 413);
      const q0 = Object.fromEntries(new URL(request.url).searchParams); return json(Object.assign({ ok: true }, await FL.upload(env, u, await B.rolesOf(env, u), q0, await request.arrayBuffer())));
    }
    if (p0 === "files" && p1 && p2 === "download" && (m === "GET" || m === "HEAD")) return await FL.download(env, request, u, await B.rolesOf(env, u), p1, new URL(request.url).searchParams.get("inline") === "1");
    if (m !== "GET" && (!sameOrigin(request) || (m !== "DELETE" && !/json/.test(request.headers.get("content-type") || "")))) return json({ ok: false, reason: "Bad request." }, 403);
    if (m !== "GET" && (await count(env, "biz:" + u.id, 400, 3600))) return json({ ok: false, reason: "Too many changes this hour, slow down a little." }, 429);
    const body = m === "POST" || m === "PUT" ? (await request.json().catch(() => null)) || {} : {}, q = Object.fromEntries(new URL(request.url).searchParams), R = await B.rolesOf(env, u), ok = (o) => json(Object.assign({ ok: true }, o));

    if (p0 === "me" && m === "GET") return ok({ user: { id: u.id, email: u.email, name: u.name || "" }, roles: R.roles, nav: B.navFor(R), pro: R.pro, unread: (await B.notes(env, u)).unread });
    if (p0 === "dashboard" && m === "GET") return ok(await B.dashboard(env, u));
    if (p0 === "search" && m === "GET") return ok(await B.search(env, u, q.q));
    if (p0 === "leads" && !p1 && m === "GET") return ok(await B.leads(env, u, q));
    if (p0 === "leads" && p1 && m === "POST") return ok(await B.setLead(env, u, p1, body));
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
    if (p0 === "pro" && p1 === "dashboard" && m === "GET") return ok(await B.proDashboard(env, u));
    if (p0 === "pro" && p1 === "blackout" && m === "POST") return ok(await B.setBlackout(env, u, body));
    if (p0 === "pro" && p1 === "payout-method" && m === "GET") return ok(await PO.getMethod(env, u));   // v46.2
    if (p0 === "pro" && p1 === "payout-method" && m === "POST") return ok(await PO.saveMethod(env, u, body));
    if (p0 === "pro" && p1 === "slots" && m === "POST") return ok(await B.setSlots(env, u, body));   // v44 time slots
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
    /* v46.1 settings & privacy */
    if (p0 === "settings" && p1 === "notify" && m === "GET") return ok(await AL.getPrefs(env, u));
    if (p0 === "settings" && p1 === "notify" && m === "POST") return ok(await AL.savePrefs(env, u, body));
    if (p0 === "privacy" && !p1 && m === "GET") return ok({ log: await PV.history(env, u), blockers: await PV.blockers(env, u) });
    if (p0 === "privacy" && p1 === "export" && m === "POST") return new Response(JSON.stringify(await PV.exportData(env, u), null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": "attachment; filename=\"fodo-my-data-" + new Date().toISOString().slice(0, 10) + ".json\"", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
    if (p0 === "privacy" && p1 === "delete" && m === "POST") return json(await PV.deleteAccount(env, u, body), 200, { "set-cookie": "fodo_s=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax" });
    /* v45 CRM (every row is the user's own) */
    if (p0 === "crm") {
      if (p1 === "contacts" && !p2 && m === "GET") return ok(await CRM.listContacts(env, u, q));
      if (p1 === "contacts" && !p2 && m === "POST") return ok(await CRM.saveContact(env, u, body));
      if (p1 === "contacts" && p2 && m === "GET") return ok(await CRM.getContact(env, u, p2));
      if (p1 === "contacts" && p2 && path[3] === "delete" && m === "POST") return ok(await CRM.delContact(env, u, p2));
      if (p1 === "merge" && m === "POST") return ok(await CRM.merge(env, u, body));
      if (p1 === "duplicates" && m === "GET") return ok(await CRM.duplicates(env, u));
      if (p1 === "import-forms" && m === "POST") return ok(await CRM.importForms(env, u, body.ids));
      if (p1 === "import-csv" && m === "POST") return ok(await CRM.importCsv(env, u, body.csv));
      if (p1 === "export" && m === "GET") { const what = q.what === "deals" ? "deals" : "contacts"; return new Response("\uFEFF" + await CRM.exportCsv(env, u, what), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=\"fodo-" + what + "-" + new Date().toISOString().slice(0, 10) + ".csv\"", "cache-control": "no-store", "x-content-type-options": "nosniff" } }); }
      if (p1 === "pipeline" && m === "GET") return ok(await CRM.pipeline(env, u));
      if (p1 === "deals" && !p2 && m === "POST") return ok(await CRM.saveDeal(env, u, body));
      if (p1 === "deals" && p2 && path[3] === "delete" && m === "POST") return ok(await CRM.delDeal(env, u, p2));
      if (p1 === "activities" && !p2 && m === "POST") return ok(await CRM.addActivity(env, u, body));
      if (p1 === "activities" && p2 && path[3] === "delete" && m === "POST") return ok(await CRM.delActivity(env, u, p2));
      if (p1 === "activities" && p2 && m === "POST") return ok(await CRM.setActivity(env, u, p2, body));
      if (p1 === "followups" && m === "GET") return ok({ items: await CRM.followUps(env, u, 7) });
      return json({ ok: false, reason: "Not found." }, 404);
    }
    /* v45 Content & Ad Studio */
    if (p0 === "studio") {
      if (p1 === "usage" && m === "GET") return ok(await ST.usage(env, u));
      if (p1 === "caption" && m === "POST") return ok(await ST.caption(env, u, body));
      if (p1 === "script" && m === "POST") return ok(await ST.script(env, u, body));
      if (p1 === "ads" && m === "POST") return ok(await ST.ads(env, u, body));
      if (p1 === "utm" && m === "POST") return ok(ST.utm(body));
      if (p1 === "save" && m === "POST") return ok(await ST.save(env, u, body));
      return json({ ok: false, reason: "Not found." }, 404);
    }
    /* v43 private files */
    if (p0 === "files" && !p1 && m === "GET") return ok(await FL.list(env, u, R, q));
    if (p0 === "files" && p1 === "storage" && m === "GET") return ok({ storage: await FL.storage(env, u) });
    if (p0 === "files" && p1 && m === "DELETE") return ok(await FL.remove(env, u, R, p1));
    /* notifications */
    if (p0 === "notes" && !p1 && m === "GET") return ok(await B.notes(env, u));
    if (p0 === "notes" && p1 === "read" && m === "POST") return ok(await B.readNotes(env, u));
    /* admin / moderation / finance (roles checked inside) */
    if (p0 === "admin") {
      if (p1 === "overview" && m === "GET") return ok(await B.adminOverview(env, R));
      if (p1 === "pros" && !p2 && m === "GET") return ok({ items: await B.adminPros(env, R, q.status) });
      if (p1 === "pros" && p2 && m === "POST") return ok(await B.moderatePro(env, u, R, p2, body.action, body.note));
      if (p1 === "payouts" && !p2 && m === "GET") return ok({ items: await PO.adminList(env, R), automatic: B.payoutsOn(env), provider: PO.provider(env) });
      if (p1 === "payouts" && p2 && path[3] === "send" && m === "POST") return ok({ payout: await PO.send(env, u, R, p2) });   // v46.2
      if (p1 === "payouts" && p2 && path[3] === "check" && m === "POST") { if (!B.can(R, ["admin", "finance"])) return json({ ok: false, reason: "Only FODO finance or admins." }, 403); return ok(await PO.check(env, p2)); }
      if (p1 === "payouts" && p2 && !path[3] && m === "POST") return ok(await B.markPaid(env, u, R, p2, body.ref));
      if (p1 === "analytics" && m === "GET") return ok(await AN.analytics(env, R));   // v46.1
      if (p1 === "refunds" && m === "GET") return ok({ items: await B.adminRefunds(env, R) });   // v44
      if (p1 === "disputes" && !p2 && m === "GET") return ok({ items: await B.adminDisputes(env, R) });
      if (p1 === "disputes" && p2 && m === "POST") return ok(await B.resolveDispute(env, u, R, p2, body));
      const origin = new URL(request.url).origin;
      if (p1 === "invites" && !p2 && m === "GET") return ok({ items: await B.listInvites(env, R, origin) });
      if (p1 === "invites" && !p2 && m === "POST") return ok(await B.createInvite(env, u, R, body, origin));
      if (p1 === "invites" && p2 && m === "POST") return ok(await B.revokeInvite(env, u, R, p2));
      if (p1 === "staff" && m === "GET") { if (!isOwner(u)) return json({ ok: false, reason: "Only FODO owners." }, 403); const d = await B.bdb(env); return ok({ items: (await d.prepare("SELECT email, role, added_at FROM biz_staff ORDER BY added_at").all()).results || [] }); }
      if (p1 === "staff" && m === "POST") return ok(await B.setStaff(env, u, body.email, body.role));
      if (p1 === "settings" && m === "POST") return ok(await B.saveSettings(env, u, body));
    }
    return json({ ok: false, reason: "Not found." }, 404);
  } catch (e) {
    return json(Object.assign({ ok: false, reason: e.status ? e.message : "Something went wrong, please try again." }, e.missing ? { missing: e.missing } : {}, e.dup ? { dup: e.dup } : {}, e.blockers ? { blockers: e.blockers } : {}), e.status || 500);
  }
}
