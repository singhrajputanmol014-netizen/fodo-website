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
   v46.1: GET settings/notify · POST settings/notify · GET privacy (log + what blocks a deletion) · POST privacy/export (JSON file) · POST privacy/delete {confirm:"DELETE"} · v50.7 GET privacy/dpdp · POST privacy/consent {purpose, granted} · POST privacy/request {kind, detail} · GET admin/analytics
   v45 Studio: GET studio/usage · POST studio/caption · studio/script · studio/ads · studio/utm · studio/save
   v47.4: GET apply · POST apply · apply/submit · GET pro/case-studies · POST pro/case-studies · pro/case-studies/<id>/submit|delete
        GET admin/applications[?status&q] · admin/applications/<id> · admin/case-studies?status · admin/badges · POST admin/applications/<id> {action} · admin/case-studies/<id> · admin/badges · admin/pros/<id>/recommend
   v47.5: GET admin/mission · admin/search?q · admin/hiring?days&role · admin/export/<what> (CSV, audited)
   v47.6: multipart uploads (POST files/multipart · PUT files/multipart/<id>/part?n · POST …/complete|abort · GET files/multipart) · calendar (GET calendar/<token>.ics, no session · GET/POST calendar/link?kind · POST calendar/revoke)
        org (GET org · POST org · org/settings · org/invite · org/answer · org/member · org/transfer · org/leave · GET org/shared) · admin/jobs · admin/jobs/run · admin/jobs/<id>/retry
   v43 private files: GET files?project= · files/storage · files/<id>/download[?inline=1]
        POST files/upload?project=&milestone=&kind=&replaces=&name=&note= (raw bytes, same-origin + X-FODO-Upload header) */
import { json, accountsOn, sessionUser, sameOrigin, count, isOwner } from "../../_lib/accounts.js";
import * as B from "../../_lib/biz.js";
import * as OSI from "../../_lib/os/impersonate.js";
import * as OSME from "../../_lib/os/me.js";
import * as W from "../../_lib/sites.js";
import * as FL from "../../_lib/files.js";
import * as CRM from "../../_lib/crm.js";
import * as ST from "../../_lib/studio.js";
import * as PV from "../../_lib/privacy.js";
import * as AL from "../../_lib/alerts.js";
import * as AN from "../../_lib/analytics.js";
import * as PO from "../../_lib/payouts.js";
import * as PR from "../../_lib/production.js";
import * as QT from "../../_lib/quotes.js";
import * as TM from "../../_lib/teams.js";
import * as AV from "../../_lib/availability.js";
import * as FN from "../../_lib/finance.js";
import * as PA from "../../_lib/proapps.js";
import * as MC from "../../_lib/mission.js";
import * as JB from "../../_lib/jobs.js";
import * as CAL from "../../_lib/calendar.js";
import * as ORG from "../../_lib/orgs.js";

export async function onRequest(ctx) {
  const { request, env, params } = ctx, m = request.method, path = [].concat(params.path || []).map(String), p0 = path[0] || "", p1 = path[1] || "", p2 = path[2] || "";
  try {
    if (!accountsOn(env)) return json({ ok: false, reason: "FODO accounts are not switched on." }, 503);
    if (p0 === "roles" && m === "GET") return json({ ok: true, roles: B.PRO_ROLES, categories: B.PRO_CATS, platforms: B.AD_PLATFORMS, contentStates: B.CONTENT_STATES });
    if (p0 === "invite" && m === "GET") return json(Object.assign({ ok: true }, await B.inviteStatus(env, new URL(request.url).searchParams.get("i"))), 200, { "cache-control": "no-store" });   // valid or not, nothing else
    /* v47.6 private calendar feeds: the token is the only credential (no session, so calendar apps can subscribe) */
    if (p0 === "calendar" && p1 && /\.ics$/.test(p1) && m === "GET") { if (await count(env, "cal:" + (request.headers.get("cf-connecting-ip") || "anon"), 120, 3600)) return json({ ok: false, reason: "Too many requests." }, 429); const body0 = await CAL.serve(env, p1, new URL(request.url).origin); if (!body0) return json({ ok: false, reason: "Not found." }, 404); return new Response(body0, { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=300", "x-robots-tag": "noindex", "content-disposition": "inline; filename=\"fodo.ics\"" } }); }
    const u0 = await sessionUser(env, request); if (!u0) return json({ ok: false, reason: "Log in to use your FODO workspace.", login: true }, 401);
    /* v50.1 view-as (FODO OS): while an owner views as someone, GETs answer as that person and every write is refused */
    const imp = await OSI.readAs(env, u0); if (imp && m !== "GET" && m !== "HEAD") return json({ ok: false, reason: "View-as is read-only. Stop viewing as " + (imp.user.email || "this person") + " first." }, 403); const u = imp ? imp.user : u0;
    /* v43 private files: the upload body is the raw file (not JSON); same-origin + a custom header (a cross-site form can't send it) */
    if (p0 === "files" && p1 === "upload" && m === "POST") {
      if (!sameOrigin(request) || request.headers.get("x-fodo-upload") !== "1") return json({ ok: false, reason: "Bad request." }, 403);
      if (await count(env, "bizup:" + u.id, 120, 3600)) return json({ ok: false, reason: "Too many uploads this hour, slow down a little." }, 429);
      const st = FL.storeKind(env), max = st ? FL.LIMITS[st].file : 0, len = +(request.headers.get("content-length") || 0); if (len && len > max) return json({ ok: false, reason: "Files can be up to " + Math.round(max / 1048576) + " MB" + (st === "kv" ? " until private R2 storage is connected." : ".") }, 413);
      const q0 = Object.fromEntries(new URL(request.url).searchParams); return json(Object.assign({ ok: true }, await FL.upload(env, u, await B.rolesOf(env, u), q0, await request.arrayBuffer())));
    }
    /* v47.6 multipart upload (R2): raw part bytes with the same upload header */
    if (p0 === "files" && p1 === "multipart" && p2 && path[3] === "part" && m === "PUT") { if (!sameOrigin(request) || request.headers.get("x-fodo-upload") !== "1") return json({ ok: false, reason: "Bad request." }, 403); if (await count(env, "bizmp:" + u.id, 2000, 3600)) return json({ ok: false, reason: "Too many parts this hour." }, 429); return json(Object.assign({ ok: true }, await FL.mpPart(env, u, p2, new URL(request.url).searchParams.get("n"), await request.arrayBuffer()))); }
    if (p0 === "files" && p1 && p2 === "download" && (m === "GET" || m === "HEAD")) return await FL.download(env, request, u, await B.rolesOf(env, u), p1, new URL(request.url).searchParams.get("inline") === "1");
    if (m !== "GET" && (!sameOrigin(request) || (m !== "DELETE" && !/json/.test(request.headers.get("content-type") || "")))) return json({ ok: false, reason: "Bad request." }, 403);
    if (m !== "GET" && (await count(env, "biz:" + u.id, 400, 3600))) return json({ ok: false, reason: "Too many changes this hour, slow down a little." }, 429);
    const body = m === "POST" || m === "PUT" ? (await request.json().catch(() => null)) || {} : {}, q = Object.fromEntries(new URL(request.url).searchParams), R = await B.rolesOf(env, u), ok = (o) => json(Object.assign({ ok: true }, o));

    if (p0 === "me" && m === "GET") { const os = await OSME.meBlock(env, u, R, imp); return ok({ user: { id: u.id, email: u.email, name: u.name || "" }, roles: R.roles, nav: os.nav, pro: R.pro, unread: (await B.notes(env, u)).unread, os: os.os }); }
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
    /* v47.4 Become a FODO Pro (any signed-in person applies; FODO reviews) + the Pro's case studies */
    if (p0 === "apply" && !p1 && m === "GET") return ok(await PA.myApplication(env, u));
    if (p0 === "apply" && !p1 && m === "POST") return ok(await PA.saveApplication(env, u, body));
    if (p0 === "apply" && p1 === "submit" && m === "POST") return ok(await PA.submitApplication(env, u));
    if (p0 === "pro" && p1 === "case-studies" && !p2 && m === "GET") return ok(await PA.myCases(env, u));
    if (p0 === "pro" && p1 === "case-studies" && !p2 && m === "POST") return ok(await PA.saveCase(env, u, body));
    if (p0 === "pro" && p1 === "case-studies" && p2 && path[3] === "submit" && m === "POST") return ok(await PA.submitCase(env, u, p2));
    if (p0 === "pro" && p1 === "case-studies" && p2 && path[3] === "delete" && m === "POST") return ok(await PA.delCase(env, u, p2));
    /* marketplace */
    if (p0 === "market" && !p1 && m === "GET") return ok(await B.market(env, u, q));
    if (p0 === "market" && p1 && m === "GET") return ok({ pro: await B.proPublic(env, u, p1, R) });
    if (p0 === "shortlist") return ok({ items: await B.shortlist(env, u, m === "POST" ? body : null) });
    /* projects */
    if (p0 === "projects" && !p1 && m === "GET") return ok({ items: await B.listProjects(env, u) });
    if (p0 === "projects" && !p1 && m === "POST") return ok({ project: await B.createProject(env, u, body) });
    if (p0 === "projects" && p1 && !p2 && m === "GET") return ok({ project: await B.getProject(env, u, p1, Object.assign({}, R, { orgRead: true })) });   /* v47.6 org colleagues: read */
    if (p0 === "projects" && p1 && p2 && m === "POST") return ok({ project: await B.projectAction(env, u, p1, p2, body, R) });
    /* v46.1 settings & privacy */
    if (p0 === "settings" && p1 === "notify" && m === "GET") return ok(await AL.getPrefs(env, u));
    if (p0 === "settings" && p1 === "notify" && m === "POST") return ok(await AL.savePrefs(env, u, body));
    if (p0 === "privacy" && !p1 && m === "GET") return ok({ log: await PV.history(env, u), blockers: await PV.blockers(env, u) });
    if (p0 === "privacy" && p1 === "export" && m === "POST") return new Response(JSON.stringify(await PV.exportData(env, u), null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": "attachment; filename=\"fodo-my-data-" + new Date().toISOString().slice(0, 10) + ".json\"", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
    if (p0 === "privacy" && p1 === "delete" && m === "POST") return json(await PV.deleteAccount(env, u, body), 200, { "set-cookie": "fodo_s=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax" });
    /* v50.7 DPDP: own consents, rights requests and grievances (every signed-in person) */
    if (p0 === "privacy" && p1 === "dpdp" && m === "GET") return ok(await (await import("../../_lib/os/comply.js")).myPrivacy(env, u));
    if (p0 === "privacy" && p1 === "consent" && m === "POST") return ok(await (await import("../../_lib/os/comply.js")).consentSet(env, u, body));
    if (p0 === "privacy" && p1 === "request" && m === "POST") { if (await count(env, "dpr:" + u.id, 10, 86400)) return json({ ok: false, reason: "Too many requests today." }, 429); return ok(await (await import("../../_lib/os/comply.js")).requestCreate(env, u, body)); }
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
    if (p0 === "files" && p1 === "storage" && m === "GET") return ok(Object.assign({ storage: await FL.storage(env, u) }, FL.storeKind(env) === "r2" ? { multipart: { partSize: FL.MP.part, maxFile: FL.MP.file } } : {}));
    if (p0 === "files" && p1 === "multipart" && !p2 && m === "GET") return ok({ items: await FL.mpList(env, u) });
    if (p0 === "files" && p1 === "multipart" && !p2 && m === "POST") return ok(await FL.mpStart(env, u, R, body));
    if (p0 === "files" && p1 === "multipart" && p2 && path[3] === "complete" && m === "POST") return ok(await FL.mpComplete(env, u, R, p2));
    if (p0 === "files" && p1 === "multipart" && p2 && path[3] === "abort" && m === "POST") return ok(await FL.mpAbort(env, u, p2));
    /* v47.6 calendar links + organization */
    if (p0 === "calendar" && p1 === "link" && m === "GET") return ok({ feed: await CAL.feedFor(env, u, R, q.kind || "client", new URL(request.url).origin, false) });
    if (p0 === "calendar" && p1 === "link" && m === "POST") return ok({ feed: await CAL.feedFor(env, u, R, body.kind || "client", new URL(request.url).origin, true) });
    if (p0 === "calendar" && p1 === "revoke" && m === "POST") return ok(await CAL.revoke(env, u, body.kind || "client"));
    if (p0 === "org") {
      if (!p1 && m === "GET") return ok(await ORG.myOrg(env, u));
      if (!p1 && m === "POST") return ok(await ORG.createOrg(env, u, body));
      if (p1 === "settings" && m === "POST") return ok(await ORG.saveOrg(env, u, body));
      if (p1 === "invite" && m === "POST") return ok(await ORG.invite(env, u, body, new URL(request.url).origin));
      if (p1 === "answer" && m === "POST") return ok(await ORG.answer(env, u, body.orgId, body.accept === true));
      if (p1 === "member" && m === "POST") return ok(await ORG.setMember(env, u, body));
      if (p1 === "transfer" && m === "POST") return ok(await ORG.transfer(env, u, body));
      if (p1 === "leave" && m === "POST") return ok(await ORG.leave(env, u));
      if (p1 === "shared" && m === "GET") return ok(await ORG.shared(env, u));
      return json({ ok: false, reason: "Not found." }, 404);
    }
    if (p0 === "files" && p1 && m === "DELETE") return ok(await FL.remove(env, u, R, p1));
    /* notifications */
    if (p0 === "notes" && !p1 && m === "GET") return ok(await B.notes(env, u));
    if (p0 === "notes" && p1 === "read" && m === "POST") return ok(await B.readNotes(env, u));
    /* v47.1 Project Builder: templates → questions → team options → live price → saved draft → quote */
    if (p0 === "builder") {
      if (p1 === "catalog" && m === "GET") return ok({ templates: await PR.templates(env), meta: PR.catalogMeta(), roles: (await PR.roles(env)).map((r) => ({ id: r.id, name: r.name, category: r.category, unit: r.unit, rate: r.rate })), equipment: (await PR.equipment(env)).map((e) => ({ id: e.id, name: e.name, category: e.category, rate: e.rate })) });
      if (p1 === "templates" && p2 && m === "GET") { const t = await PR.template(env, p2); return ok({ template: { id: t.id, name: t.name, group: t.group, family: t.family, description: t.description, mode: t.mode, questions: t.questions, tiers: Object.keys(t.tiers).map((k) => ({ key: k, label: t.tiers[k].label, sub: t.tiers[k].sub || "" })) } }); }
      if (p1 === "estimate" && m === "POST") { if (await count(env, "est:" + u.id, 600, 3600)) return json({ ok: false, reason: "Too many price checks this hour, slow down a little." }, 429); return ok(await PR.estimate(env, R, body)); }
      if (p1 === "match" && m === "POST") { if (await count(env, "match:" + u.id, 200, 3600)) return json({ ok: false, reason: "Too many searches this hour." }, 429); return ok(await PR.match(env, R, body)); }
      if (p1 === "availability" && m === "POST") { if (await count(env, "avail:" + u.id, 120, 3600)) return json({ ok: false, reason: "Too many checks this hour." }, 429); return ok(await PR.availability(env, R, body)); }
      if (p1 === "drafts" && !p2 && m === "GET") return ok({ items: await PR.builds(env, u) });
      if (p1 === "drafts" && !p2 && m === "POST") return ok({ draft: await PR.saveBuild(env, u, R, body) });
      if (p1 === "drafts" && p2 && m === "GET") return ok({ draft: await PR.build(env, u, R, p2) });
      if (p1 === "drafts" && p2 && m === "DELETE") return ok(await PR.deleteBuild(env, u, p2));
      return json({ ok: false, reason: "Not found." }, 404);
    }
    if (p0 === "quotes") {
      if (!p1 && m === "GET") return ok({ items: await QT.myQuotes(env, u) });
      if (!p1 && m === "POST") return ok({ quote: await QT.requestQuote(env, u, R, body) });
      if (p1 && !p2 && m === "GET") return ok({ quote: await QT.getQuote(env, u, R, p1) });
      if (p1 && ["print", "summary", "csv", "json"].indexOf(p2) > -1 && m === "GET") {
        const qq = await QT.getQuote(env, u, R, p1, { noView: true, version: q.version }); if (!qq.data || qq.data.pending) return json({ ok: false, reason: "FODO hasn't sent this quote yet." }, 409);
        const nm = qq.number + "-v" + qq.version, H = { "cache-control": "no-store", "x-robots-tag": "noindex" };
        if (p2 === "print") return new Response(QT.printable(qq), { headers: Object.assign({ "content-type": "text/html; charset=utf-8" }, H) });
        if (p2 === "summary") return new Response(QT.whatsapp(qq, new URL(request.url).origin), { headers: Object.assign({ "content-type": "text/plain; charset=utf-8" }, H) });
        if (p2 === "csv") return new Response(QT.csv(qq), { headers: Object.assign({ "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="' + nm + '.csv"' }, H) });
        const jj = Object.assign({}, qq); return new Response(JSON.stringify(jj, null, 2), { headers: Object.assign({ "content-type": "application/json; charset=utf-8", "content-disposition": 'attachment; filename="' + nm + '.json"' }, H) });
      }
      if (p1 && ["accept", "decline", "changes"].indexOf(p2) > -1 && m === "POST") return ok({ quote: await QT.answer(env, u, R, p1, p2, body, request) });
      if (p1 && p2 === "contract" && m === "GET") { await QT.getQuote(env, u, R, p1, { noView: true }); return ok({ contract: await FN.contractForQuote(env, u, R, p1) }); }   // v47.3
      if (p1 && p2 === "team" && m === "GET") { await QT.getQuote(env, u, R, p1, { noView: true }); return ok({ team: await TM.clientTeam(env, u, R, p1) }); }   // v47.2
      return json({ ok: false, reason: "Not found." }, 404);
    }
    /* v47.3 contracts + invoices (client side; staff see everything through the same calls) */
    if (p0 === "contracts" && p1 && !p2 && m === "GET") return ok({ contract: await FN.getContract(env, u, R, p1, q.version) });
    if (p0 === "contracts" && p1 && p2 === "print" && m === "GET") return new Response(FN.contractHtml(await FN.getContract(env, u, R, p1, q.version)), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
    if (p0 === "contracts" && p1 && p2 === "sign" && m === "POST") return ok({ contract: await FN.signContract(env, u, R, p1, body, request) });
    if (p0 === "invoices" && !p1 && m === "GET") return ok({ items: await FN.invoices(env, u, R, q) });
    if (p0 === "invoices" && p1 && p2 === "print" && m === "GET") return new Response(await FN.invoiceHtml(env, u, R, p1), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
    /* v47.2 FODO Pro side: team invitations + availability rules */
    if (p0 === "pro" && p1 === "teams" && !p2 && m === "GET") return ok({ items: await TM.proTeams(env, u) });
    if (p0 === "pro" && p1 === "teams" && p2 && ["accept", "decline"].indexOf(path[3]) > -1 && m === "POST") return ok({ items: await TM.proAnswer(env, u, p2, path[3] === "accept", body) });
    if (p0 === "pro" && p1 === "availability") { const d0 = await B.bdb(env), pr = await d0.prepare("SELECT * FROM biz_pros WHERE user_id=?1").bind(u.id).first(); if (!pr) return json({ ok: false, reason: "Create your FODO Pro profile first." }, 404);
      if (m === "GET") return ok({ rules: AV.rulesOf(pr) }); if (m === "POST") return ok({ rules: await AV.saveRules(d0, pr, body) }); }
    /* admin / moderation / finance (roles checked inside) */
    if (p0 === "admin") {
      /* v47.1 catalog, pricing rules and quotes */
      if (p1 === "catalog" && !p2 && m === "GET") { if (!B.can(R, ["admin", "finance", "viewer"])) return json({ ok: false, reason: "Not allowed." }, 403); return ok({ roles: await PR.roles(env, true), equipment: await PR.equipment(env, true, true), templates: await PR.templates(env, true), pricing: await PR.pricingConfig(env), meta: PR.catalogMeta(), canEdit: B.can(R, ["admin"]), canPricing: isOwner(u), gstin: !!env.FODO_GSTIN }); }
      if (p1 === "catalog" && p2 === "templates" && path[3] && m === "GET") { if (!B.can(R, ["admin", "finance", "viewer"])) return json({ ok: false, reason: "Not allowed." }, 403); return ok({ template: await PR.template(env, path[3]) }); }
      if (p1 === "catalog" && p2 === "roles" && m === "POST") return ok({ role: await PR.saveRole(env, u, R, body) });
      if (p1 === "catalog" && p2 === "equipment" && m === "POST") return ok({ item: await PR.saveEquipment(env, u, R, body) });
      if (p1 === "catalog" && p2 === "templates" && m === "POST") return ok({ template: await PR.saveTemplate(env, u, R, body) });
      if (p1 === "pricing" && m === "POST") return ok({ pricing: await PR.savePricingConfig(env, u, body) });
      if (p1 === "price-history" && m === "GET") return ok({ items: await PR.priceHistory(env, R, q) });
      /* v47.3 contracts, settlements, ledger, reconciliation */
      if (p1 === "contracts" && !p2 && m === "GET") return ok({ items: await FN.adminContracts(env, R, q) });
      if (p1 === "contracts" && p2 && !path[3] && m === "GET") return ok({ contract: await FN.getContract(env, u, R, p2, q.version) });
      if (p1 === "contracts" && p2 && path[3] === "cancellation" && m === "GET") return ok(await FN.cancellationQuote(env, R, p2));
      if (p1 === "contracts" && p2 && path[3] === "send" && m === "POST") return ok({ contract: await FN.sendContract(env, u, R, p2) });
      if (p1 === "contracts" && p2 && path[3] === "amend" && m === "POST") return ok({ contract: await FN.amend(env, u, R, p2, body) });
      if (p1 === "contracts" && p2 && path[3] === "cancel" && m === "POST") return ok({ contract: await FN.cancelContract(env, u, R, p2, body) });
      if (p1 === "teams" && p2 && path[3] === "contract" && m === "POST") return ok({ contract: await FN.generate(env, u, R, p2) });
      if (p1 === "settlements" && !p2 && m === "GET") return ok(await FN.settlements(env, R, q));
      if (p1 === "settlements" && p2 && path[3] === "release" && m === "POST") return ok(await FN.releaseSettlement(env, u, R, p2, body));
      if (p1 === "ledger" && m === "GET") return ok(await FN.ledgerList(env, R, q));
      if (p1 === "reconciliation" && m === "GET") return ok(await FN.reconcile(env, R, q));
      if (p1 === "invoices" && m === "GET") { if (!B.can(R, ["admin", "finance", "viewer"])) return json({ ok: false, reason: "Not allowed." }, 403); return ok({ items: await FN.invoices(env, u, R, Object.assign({}, q, { all: "1" })) }); }
      if (p1 === "vendors" && p2 && m === "POST") return ok(await FN.setVendor(env, u, R, p2, body));
      /* v47.2 teams + equipment holds */
      if (p1 === "teams" && !p2 && m === "GET") return ok({ items: await TM.adminTeams(env, R, q) });
      if (p1 === "teams" && p2 && !path[3] && m === "GET") return ok(await TM.adminTeam(env, R, p2));
      if (p1 === "teams" && p2 && path[3] && m === "POST") return ok(await TM.adminAction(env, u, R, p2, path[3], body));
      if (p1 === "quotes" && p2 && path[3] === "team" && m === "POST") return ok(await TM.adminTeam(env, R, await TM.createForQuote(env, u, R, p2)));
      if (p1 === "equipment" && !p2 && m === "GET") return ok(await TM.equipmentBoard(env, R, q));
      if (p1 === "equipment" && p2 === "block" && m === "POST") return ok({ hold: await TM.blockEquipment(env, u, R, body) });
      if (p1 === "equipment" && p2 === "release" && path[3] && m === "POST") return ok(await TM.releaseEquipment(env, u, R, path[3]));
      if (p1 === "quotes" && !p2 && m === "GET") return ok({ items: await QT.adminQuotes(env, R, q) });
      if (p1 === "quotes" && !p2 && m === "POST") return ok({ quote: await QT.adminCreate(env, u, R, body) });
      if (p1 === "quotes" && p2 && !path[3] && m === "GET") return ok({ quote: await QT.getQuote(env, u, R, p2, { version: q.version }) });
      if (p1 === "quotes" && p2 && path[3] === "revise" && m === "POST") return ok({ quote: await QT.revise(env, u, R, p2, body) });
      if (p1 === "quotes" && p2 && path[3] === "send" && m === "POST") return ok({ quote: await QT.send(env, u, R, p2) });
      if (p1 === "quotes" && p2 && path[3] === "cancel" && m === "POST") return ok({ quote: await QT.cancel(env, u, R, p2, body) });
      if (p1 === "quotes" && p2 && path[3] === "clone" && m === "POST") return ok({ quote: await QT.clone(env, u, R, p2) });
      /* v47.6 background jobs */
      if (p1 === "jobs" && !p2 && m === "GET") return ok(await JB.adminJobs(env, R, q));
      if (p1 === "jobs" && p2 === "run" && m === "POST") return ok(await JB.runNow(env, u, R, +body.n || 10));
      if (p1 === "jobs" && p2 && path[3] === "retry" && m === "POST") return ok(await JB.retryJob(env, u, R, p2));
      /* v47.5 Mission Control: attention list, staff search, hiring intelligence, CSV exports */
      if (p1 === "mission" && m === "GET") return ok(Object.assign(await MC.mission(env, R), { exports: MC.exportList(R) }));
      if (p1 === "search" && m === "GET") return ok(await MC.adminSearch(env, R, q.q));
      if (p1 === "hiring" && m === "GET") return ok(await MC.hiring(env, R, q));
      if (p1 === "export" && p2 && m === "GET") { const x = await MC.exportCsv(env, u, R, p2); return new Response(x.body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="' + x.name + '"', "cache-control": "no-store", "x-content-type-options": "nosniff", "x-fodo-rows": String(x.rows) } }); }
      /* v47.4 Pro applications, case-study moderation, badge rules */
      if (p1 === "applications" && !p2 && m === "GET") return ok(await PA.adminApplications(env, R, q));
      if (p1 === "applications" && p2 && m === "GET") return ok({ application: await PA.adminApplication(env, R, p2) });
      if (p1 === "applications" && p2 && m === "POST") return ok({ application: await PA.decideApplication(env, u, R, p2, body) });
      if (p1 === "case-studies" && !p2 && m === "GET") return ok(await PA.adminCases(env, R, q));
      if (p1 === "case-studies" && p2 && m === "POST") return ok(await PA.moderateCase(env, u, R, p2, body));
      if (p1 === "badges" && m === "GET") return ok(await PA.badgeOverview(env, u, R));
      if (p1 === "badges" && m === "POST") return ok({ config: await PA.saveBadgeConfig(env, u, body) });
      if (p1 === "overview" && m === "GET") return ok(await B.adminOverview(env, R));
      if (p1 === "pros" && !p2 && m === "GET") return ok({ items: await B.adminPros(env, R, q.status) });
      if (p1 === "pros" && p2 && path[3] === "recommend" && m === "POST") return ok(await PA.recommend(env, u, R, p2, body));   // v47.4 (before the moderation route)
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
    if (env.XRAY_TEST_MODE === "1" && env.API_DEBUG === "1") console.error("API", e.stack);   /* v47.5: stack traces only in the local test runtime */
    return json(Object.assign({ ok: false, reason: e.status ? e.message : "Something went wrong, please try again." }, e.missing ? { missing: e.missing } : {}, e.dup ? { dup: e.dup } : {}, e.blockers ? { blockers: e.blockers } : {}), e.status || 500);
  }
}
