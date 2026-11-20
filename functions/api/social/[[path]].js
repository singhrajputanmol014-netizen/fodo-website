/* FODO v52 Social Studio API (/api/social/*), see functions/_lib/sstudio.js.
   No session needed: GET m/<id>/<exp>/<sig>/<name> (signed media for Instagram / Facebook / approval pages) ·
        GET approval/<token> · POST approval/<token>/decide (client approval links, the token is the credential) ·
        agent/* with "Authorization: Bearer fsd_…" (the FODO Studio app on the person's own computer: GET agent/me,
        GET agent/projects, POST agent/media, PUT agent/media/<id>/part?n, POST agent/media/<id>/finish).
   Session: GET state · projects · POST projects · DELETE projects/<id> · GET projects/<id>/slots · POST projects/<id>/slots
        GET accounts?project · connect/<meta|google>?project&replies · oauth/<meta|google> (callback) · POST accounts/manual · DELETE accounts/<id>
        GET media?project · POST media · PUT media/<id>/part?n (raw bytes, x-fodo-upload: 1) · POST media/<id>/finish · DELETE media/<id>
        GET posts?project&status&from&to · POST posts · POST posts/<id> · POST posts/<id>/<approve|cancel|now|run> · DELETE posts/<id>
        GET ideas?project · POST ideas · DELETE ideas/<id> · POST ai/ideas · POST ai/caption
        GET inbox?project&status&tag&platform&q · POST inbox/sync · POST inbox/<id>/<status|reply|suggest> · POST replies · DELETE replies/<id>
        GET analytics?project&days · POST numbers/sync · GET report/<project>?days (printable HTML) · GET report/<project>/csv
        GET links?project · POST links · DELETE links/<token> · GET bio/<project> · POST bio/<project> · GET bio/<project>/export
        GET devices · POST devices · DELETE devices/<id>
   Writes need same-origin + JSON (CSRF); raw uploads need x-fodo-upload: 1. Every query is scoped to the signed-in person. */
import { json, accountsOn, sessionUser, sameOrigin, count } from "../../_lib/accounts.js";
import * as S from "../../_lib/sstudio.js";
import * as SCH from "../../_lib/schema.js";

const HTML_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https: data:; media-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
const html = (body, extra) => new Response(body, { headers: Object.assign({ "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": HTML_CSP, "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" }, extra || {}) });
async function healed(ctx, e, runIt) { if (ctx.__healed || !SCH.isSchemaError(e)) return null; try { SCH.reset(ctx.env.XRAY_DB); await SCH.setupAll(ctx.env); } catch (e2) { return null; } return runIt(Object.assign({}, ctx, { request: ctx.__clone || ctx.request, __healed: true })); }
const bad = (e) => json({ ok: false, reason: e.status && e.status < 500 ? e.message : e.status === 502 || e.status === 503 ? e.message : "Something went wrong, please try again." }, e.status || 500);

export async function onRequest(ctx) {
  const { request, env, params } = ctx, m = request.method, path = [].concat(params.path || []).map(String), p0 = path[0] || "", p1 = path[1] || "", p2 = path[2] || "", url = new URL(request.url), q = Object.fromEntries(url.searchParams), origin = url.origin, ip = request.headers.get("cf-connecting-ip") || "anon";
  if (!ctx.__healed && m !== "GET" && m !== "HEAD") ctx.__clone = request.clone();
  try {
    if (!accountsOn(env)) return json({ ok: false, reason: "FODO accounts are not switched on." }, 503);
    const ok = (o) => json(Object.assign({ ok: true }, o));
    /* ---- public: signed media ---- */
    if (p0 === "m" && (m === "GET" || m === "HEAD")) return await S.serveMedia(env, request, p1, p2, path[3]);
    /* ---- public: client approval links ---- */
    if (p0 === "approval" && p1) {
      if (await count(env, "ssap:" + ip, 300, 3600)) return json({ ok: false, reason: "Too many requests." }, 429);
      if (m === "GET" && !p2) return ok(await S.approvalData(env, p1, origin, q.open === "1"));
      if (m === "POST" && p2 === "decide") { if (!sameOrigin(request) || !/json/.test(request.headers.get("content-type") || "")) return json({ ok: false, reason: "Bad request." }, 403); return ok(await S.decide(env, p1, (await request.json().catch(() => null)) || {})); }
      return json({ ok: false, reason: "Not found." }, 404);
    }
    /* ---- the FODO Studio app on the person's own computer (device key) ---- */
    if (p0 === "agent") {
      const du = await S.deviceUser(env, request); if (!du) return json({ ok: false, reason: "This device key is not valid. Create a new one in FODO Studio ▸ AI Clipping on fodo.co.in." }, 401);
      if (await count(env, "ssag:" + du.id, 3000, 3600)) return json({ ok: false, reason: "Too many requests this hour." }, 429);
      if (p1 === "me" && m === "GET") return ok({ user: { email: du.email, name: du.name || "" } });
      if (p1 === "projects" && m === "GET") return ok({ projects: await S.projects(env, du) });
      if (p1 === "media" && !p2 && m === "POST") return ok(await S.mediaStart(env, du, (await request.json().catch(() => null)) || {}, "agent"));
      if (p1 === "media" && p2 && path[3] === "part" && m === "PUT") return ok(await S.mediaPart(env, du, p2, q.n, new Uint8Array(await request.arrayBuffer())));
      if (p1 === "media" && p2 && path[3] === "finish" && m === "POST") return ok({ media: await S.mediaFinish(env, du, p2) });
      return json({ ok: false, reason: "Not found." }, 404);
    }
    const u = await sessionUser(env, request); if (!u) return p0 === "oauth" ? Response.redirect(origin + "/studio/", 302) : json({ ok: false, reason: "Log in to use Social Studio.", login: true }, 401);
    /* ---- OAuth callback (a top-level navigation from Facebook / Google) ---- */
    if (p0 === "oauth" && m === "GET") { const back = (t, good) => Response.redirect(origin + "/studio/#social?tab=accounts&" + (good ? "connected=" : "error=") + encodeURIComponent(t), 302);
      if (q.error) return back(q.error_description || q.error_reason || "The sign-in was cancelled.");
      try { const r = await S.finishConnect(env, u, p1, origin, q.code || "", q.state || ""); return back(String(r.connected), true); } catch (e) { return back(e.status && e.status < 500 ? e.message : "The connection failed: " + String(e.message || "").slice(0, 160)); } }
    /* ---- raw upload parts ---- */
    if (p0 === "media" && p1 && p2 === "part" && m === "PUT") { if (!sameOrigin(request) || request.headers.get("x-fodo-upload") !== "1") return json({ ok: false, reason: "Bad request." }, 403); if (await count(env, "ssup:" + u.id, 3000, 3600)) return json({ ok: false, reason: "Too many uploads this hour." }, 429); return ok(await S.mediaPart(env, u, p1, q.n, new Uint8Array(await request.arrayBuffer()))); }
    /* ---- printable HTML / CSV / export (GET, session) ---- */
    if (p0 === "report" && p1 && m === "GET") { if (p2 === "csv") return new Response(await S.reportCsv(env, u, p1, q.days), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="social-report.csv"', "cache-control": "no-store" } }); return html(await S.reportHtml(env, u, p1, q.days)); }
    if (p0 === "bio" && p1 && p2 === "export" && m === "GET") { const b = await S.getBio(env, u, p1); if (!b.saved) return json({ ok: false, reason: "Save the page first." }, 400); return new Response(await S.bioPage(env, b.slug, { export: true }), { headers: { "content-type": "text/html; charset=utf-8", "content-disposition": 'attachment; filename="' + b.slug + '.html"', "cache-control": "no-store" } }); }
    if (m !== "GET" && (!sameOrigin(request) || (m !== "DELETE" && !/json/.test(request.headers.get("content-type") || "")))) return json({ ok: false, reason: "Bad request." }, 403);
    if (m !== "GET" && (await count(env, "ss:" + u.id, 1500, 3600))) return json({ ok: false, reason: "Too many changes this hour, slow down a little." }, 429);
    const b = m === "POST" ? (await request.json().catch(() => null)) || {} : {};

    if (p0 === "state" && m === "GET") return ok(await S.state(env, u));
    if (p0 === "control" && m === "GET") return ok(await S.control(env, u));
    /* projects + slots */
    if (p0 === "projects" && !p1 && m === "GET") return ok({ projects: await S.projects(env, u) });
    if (p0 === "projects" && !p1 && m === "POST") return ok({ project: await S.saveProject(env, u, b) });
    if (p0 === "projects" && p1 && !p2 && m === "DELETE") return ok(await S.deleteProject(env, u, p1));
    if (p0 === "projects" && p1 && p2 === "slots" && m === "GET") return ok({ next: await S.upcomingSlots(env, u, p1, 10, true) });
    if (p0 === "projects" && p1 && p2 === "slots" && m === "POST") return ok({ slots: await S.setSlots(env, u, p1, b.times) });
    /* accounts */
    if (p0 === "accounts" && !p1 && m === "GET") return ok({ accounts: await S.accounts(env, u, q.project) });
    if (p0 === "connect" && p1 && m === "GET") return ok({ url: await S.connectUrl(env, u, p1, q.project, origin, q.replies === "1"), redirect: origin + "/api/social/oauth/" + p1 });
    if (p0 === "accounts" && p1 === "manual" && m === "POST") return ok({ account: await S.saveManual(env, u, b) });
    if (p0 === "accounts" && p1 && m === "DELETE") return ok(await S.removeAccount(env, u, p1));
    /* media */
    if (p0 === "media" && !p1 && m === "GET") return ok({ media: await S.media(env, u, q.project) });
    if (p0 === "media" && !p1 && m === "POST") return ok(await S.mediaStart(env, u, b, "upload"));
    if (p0 === "media" && p1 && p2 === "finish" && m === "POST") return ok({ media: await S.mediaFinish(env, u, p1) });
    if (p0 === "media" && p1 && p2 === "url" && m === "GET") { const x = (await S.media(env, u)).filter((y) => y.id === p1)[0]; if (!x || x.status !== "ready") return json({ ok: false, reason: "Not found." }, 404); return ok({ url: await S.mediaUrl(env, origin, { id: x.id, name: x.name }, 6) }); }
    if (p0 === "media" && p1 && m === "DELETE") return ok(await S.mediaDelete(env, u, p1));
    /* posts */
    if (p0 === "posts" && !p1 && m === "GET") return ok({ posts: await S.posts(env, u, q) });
    if (p0 === "posts" && !p1 && m === "POST") { const p = await S.createPost(env, u, b); if (p.status === "publishing") ctx.waitUntil && ctx.waitUntil(S.runPost(env, origin, u.id, p.id, 25000).catch(() => {})); return ok({ post: p }); }
    if (p0 === "posts" && p1 && !p2 && m === "POST") return ok({ post: await S.updatePost(env, u, p1, b) });
    if (p0 === "posts" && p1 && p2 === "approve" && m === "POST") return ok({ post: await S.approvePost(env, u, p1) });
    if (p0 === "posts" && p1 && p2 === "cancel" && m === "POST") return ok({ post: await S.cancelPost(env, u, p1) });
    if (p0 === "posts" && p1 && p2 === "now" && m === "POST") return ok({ post: await S.postNow(env, u, p1) });
    if (p0 === "posts" && p1 && p2 === "run" && m === "POST") return ok({ post: await S.runPost(env, origin, u.id, p1, 20000) });
    if (p0 === "posts" && p1 && m === "DELETE") return ok(await S.deletePost(env, u, p1));
    /* planner + AI */
    if (p0 === "ideas" && !p1 && m === "GET") return ok({ ideas: await S.ideas(env, u, q.project) });
    if (p0 === "ideas" && !p1 && m === "POST") return ok({ idea: await S.saveIdea(env, u, b) });
    if (p0 === "ideas" && p1 && m === "DELETE") return ok(await S.deleteIdea(env, u, p1));
    if (p0 === "ai" && (p1 === "ideas" || p1 === "caption") && m === "POST") { if (await count(env, "ssai:" + u.id, 60, 86400)) return json({ ok: false, reason: "That's the AI limit for today (60). It resets tomorrow." }, 429); return ok(p1 === "ideas" ? { ideas: await S.aiIdeas(env, u, b) } : await S.aiCaption(env, u, b)); }
    /* inbox */
    if (p0 === "inbox" && !p1 && m === "GET") return ok(await S.inbox(env, u, q));
    if (p0 === "inbox" && p1 === "sync" && m === "POST") { if (await count(env, "sssync:" + u.id, 20, 3600)) return json({ ok: false, reason: "Checked a lot this hour already. Comments are also read every hour by themselves." }, 429); return ok(await S.syncInbox(env, u.id, b.project || null)); }
    if (p0 === "inbox" && p1 && p2 === "status" && m === "POST") return ok({ item: await S.setCommentStatus(env, u, p1, b.status) });
    if (p0 === "inbox" && p1 && p2 === "reply" && m === "POST") return ok({ item: await S.replyComment(env, u, p1, b.text) });
    if (p0 === "inbox" && p1 && p2 === "suggest" && m === "POST") { if (await count(env, "ssai:" + u.id, 60, 86400)) return json({ ok: false, reason: "That's the AI limit for today." }, 429); return ok(await S.suggestReply(env, u, p1)); }
    if (p0 === "replies" && !p1 && m === "POST") return ok({ reply: await S.saveReply(env, u, b) });
    if (p0 === "replies" && p1 && m === "DELETE") return ok(await S.deleteReply(env, u, p1));
    /* numbers */
    if (p0 === "analytics" && m === "GET") return ok(await S.analytics(env, u, q));
    if (p0 === "numbers" && p1 === "sync" && m === "POST") { if (await count(env, "ssnum:" + u.id, 12, 3600)) return json({ ok: false, reason: "Numbers were updated a lot this hour. They also update by themselves." }, 429); return ok(await S.syncNumbers(env, u.id, b.project || null)); }
    /* approval links */
    if (p0 === "links" && !p1 && m === "GET") return ok({ links: await S.links(env, u, q.project) });
    if (p0 === "links" && !p1 && m === "POST") return ok(await S.createLink(env, u, b));
    if (p0 === "links" && p1 && m === "DELETE") return ok(await S.revokeLink(env, u, p1));
    /* link in bio */
    if (p0 === "bio" && p1 && !p2 && m === "GET") return ok({ bio: await S.getBio(env, u, p1) });
    if (p0 === "bio" && p1 && !p2 && m === "POST") return ok({ bio: await S.saveBio(env, u, p1, b) });
    /* devices */
    if (p0 === "devices" && !p1 && m === "GET") return ok({ devices: await S.devices(env, u) });
    if (p0 === "devices" && !p1 && m === "POST") return ok(await S.newDevice(env, u, b));
    if (p0 === "devices" && p1 && m === "DELETE") return ok(await S.revokeDevice(env, u, p1));
    return json({ ok: false, reason: "Not found." }, 404);
  } catch (e) {
    const h = await healed(ctx, e, onRequest); if (h) return h;
    if (env.API_DEBUG === "1") console.log(JSON.stringify({ social: String(e && e.stack) }));
    return bad(e);
  }
}
