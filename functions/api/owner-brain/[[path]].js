/* FODO OWNER BRAIN — API (/api/owner-brain/*). OWNERS + the people they gave access to (v23, access.js); everything else 403.
   Every request is checked on the server: Brain enabled (BRAIN_ENABLED != "0") → accounts on → a valid session → the account is
   one of the FODO owner logins (OWNER_EMAILS). Admins, viewers, customers and visitors get the same plain 403 — no hint of what
   is behind it. Headers, query strings, cookies other than the real session, and anything the browser claims are never trusted.
   POST/PATCH/DELETE must come from this site with a JSON body (CSRF).
     GET  status · briefing[?force=1] · diagnostics · memory[?q&type&scope&status] · memory/<id>/history · tasks[?all=1] · projects
          docs · threads · thread/<id> · tools · alerts[?all=1] · activity · analytics · settings · export
     POST chat {message, threadId?} · ingest {title, text, kind?, scope?, project?} · confirm {actionId, token, decision?}
          memory {type,title,content,scope?,project?} · tasks {title,…} · feedback {messageId, rating, note?} · settings {…}
          alerts/<id>/ack
     PATCH memory/<id> · tasks/<id>          DELETE memory/<id> · memory?scope=personal · tasks/<id> · docs/<id> · thread/<id> */
import { json, accountsOn, sessionUser, isOwner, sameOrigin, count } from "../../_lib/accounts.js";
import { applyConfig } from "../../_lib/config.js";
import { brainDb, getSettings, saveSettings, audit, nowIso, clean, redact, scrubEnv } from "../../_lib/brain/store.js";
import { chat, ingest } from "../../_lib/brain/orchestrator.js";
import { TOOLS, LEVELS, systemCheck, confirmAction, execute } from "../../_lib/brain/tools.js";
import { listMemory, remember, updateMemory, forget, forgetScope, memoryHistory, listTasks, createTask, updateTask, deleteTask, projects, listDocs, deleteDoc } from "../../_lib/brain/memory.js";
import { briefing, listAlerts, ackAlert } from "../../_lib/brain/insights.js";
import { availableProviders } from "../../_lib/brain/models.js";
import { bgOn } from "../../_lib/bg.js";
import { logUsage } from "../../_lib/usage.js";
import * as GH from "../../_lib/brain/github.js";
import * as GO from "../../_lib/brain/google.js";
import * as AU from "../../_lib/brain/automations.js";
import { brainDaily } from "../../_lib/brain/insights.js";
import * as AC from "../../_lib/brain/access.js";
import * as SO from "../../_lib/brain/social.js";
import * as MD from "../../_lib/brain/media.js";
import * as VO from "../../_lib/brain/voice.js";
import * as LV from "../../_lib/brain/live.js";
import { mayOpenThread } from "../../_lib/brain/orchestrator.js";
const SITE = (env) => env.SITE_ORIGIN || "https://www.fodo.co.in";
/* which permission each page endpoint needs ("owner" = the two owner logins only) */
const NEED = { GET: { status: null, briefing: "business", diagnostics: "business", memory: "memory", tasks: "tasks", projects: "tasks", docs: "memory", threads: null, thread: null, tools: null, alerts: "business", activity: "owner", analytics: "business", changes: "changes", automations: "automations", connectors: "owner", connect: "owner", settings: null, export: "owner", social: "social", members: "owner", ga: "owner", live: "chat" },
  POST: { chat: "chat", ingest: "memory", confirm: null, memory: "memory", tasks: "tasks", feedback: null, tts: null, stt: null, automations: "automations", changes: "changes", connectors: "owner", settings: "owner", alerts: "business", social: "social", members: "owner" },
  PUT: { social: "social" }, PATCH: { memory: "memory", tasks: "tasks" }, DELETE: { memory: "memory", tasks: "tasks", automations: "automations", docs: "memory", thread: null, social: "owner", members: "owner" } };
const sameKey = (a, b) => { a = String(a || ""); b = String(b || ""); if (!a || a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; };

/* every startup step has a time limit, so a stuck step answers with its name instead of hanging the page */
const step = (name, p, ms) => { const t0 = Date.now(); return Promise.race([Promise.resolve(p), new Promise((_, no) => setTimeout(() => no(new Error("timeout at " + name)), ms || 10000))]).then((v) => { const d = Date.now() - t0; if (d > 1500) console.log("owner-brain slow step", name, d + "ms"); return v; }); };
const deny = () => json({ ok: false, reason: "Not available." }, 403);
export async function gate(env, request) {
  if (String(env.BRAIN_ENABLED || "1") === "0" || !accountsOn(env)) return null;
  const u = await sessionUser(env, request);
  if (!u) return null; if (isOwner(u)) return u;
  try { return (await AC.who(env, u)) ? u : null; } catch (e) { return null; }
}

export async function onRequest(ctx) {
  const { request, env, params } = ctx, m = request.method, path = [].concat(params.path || []).map(String), p0 = path[0] || "";
  try {
    // media files that Instagram / Facebook download while publishing — public, unguessable 32-character id
    if (p0 === "m" && path[1] && (m === "GET" || m === "HEAD")) return await MD.serve(env, request, path[1]);
    // the scheduler (hourly GitHub workflow / daily tick) — authenticated by CRON_KEY, not by a session
    if (p0 === "tick" && m === "POST") {
      if (!env.CRON_KEY || String(env.CRON_KEY).length < 16 || !sameKey(request.headers.get("x-cron-key"), env.CRON_KEY) || String(env.BRAIN_ENABLED || "1") === "0") return deny();
      const r = await AU.tick(env), daily = new Date(Date.now() + 5.5 * 3600e3).getUTCHours() >= 6 ? await brainDaily(env, request) : { skipped: "before 06:00 IST" };
      let social = null, cleaned = null; try { social = await SO.runDue(env, SITE(env)); cleaned = await MD.cleanup(env); const exp = (await SO.accounts(env, false)).filter((a) => a.expiresSoon); for (const a of exp) await AU.notifyOwner(env, "Reconnect " + a.name + " (" + a.platform + ")", "The " + a.platform + " connection expires " + String(a.expires_at).slice(0, 10) + " — LinkedIn allows 60 days. Open Brain → Social → Reconnect.", "info"); } catch (e) { social = { error: e.message }; }
      return json({ ok: true, automations: r, briefing: daily, social, media: cleaned });
    }
    const u = await step("session", gate(env, request));
    if (!u) return deny();
    const W = await AC.who(env, u); if (!W) return deny();
    const need = (NEED[m] || {})[p0]; if (need === "owner" ? !W.owner : need && !AC.can(W, need)) return json({ ok: false, reason: W.owner ? "Not available." : "Your FODO Brain access doesn't include this — ask an owner.", denied: true }, 403);
    const ctype = request.headers.get("content-type") || "";
    if (m !== "GET" && (!sameOrigin(request) || (m === "PUT" ? !/octet-stream/.test(ctype) : m !== "DELETE" && !/json/.test(ctype)))) return json({ ok: false, reason: "Bad request." }, 403);   // CSRF
    await step("config", applyConfig(env)); await step("database setup", brainDb(env), 15000);
    const origin = new URL(request.url).origin;
    if (m === "PUT" && p0 === "social" && path[1] === "media" && path[2] && path[3] != null) {   // one 4 MB part of an upload, raw bytes
      const buf = new Uint8Array(await request.arrayBuffer()); try { return json(await MD.putPart(env, path[2], path[3], buf)); } catch (e) { return json({ ok: false, reason: e.message }, 400); } }
    const base = { env, request, owner: u, who: W }, q = new URL(request.url).searchParams, body = m === "GET" || m === "DELETE" || m === "PUT" ? null : ((await request.json().catch(() => null)) || {});
    if (p0 === "memory" && path[1] && !W.owner) { const mrow = await (await brainDb(env)).prepare("SELECT scope FROM brain_memory WHERE id=?1").bind(path[1]).first(); if (!mrow || mrow.scope === "personal") return json({ ok: false, reason: "Not found." }, 404); }
    const settings = await step("settings", getSettings(env)), ctxT = Object.assign({}, base, { settings, scope: "fodo" });

    /* ---------- GET ---------- */
    if (m === "GET") {
      if (p0 === "status") {
        const d = await brainDb(env), mem = await d.prepare("SELECT count(*) n FROM brain_memory WHERE status='active'").first(), al = await d.prepare("SELECT count(*) n FROM brain_alerts WHERE status='open'").first(), tk = await d.prepare("SELECT count(*) n FROM brain_tasks WHERE status IN ('todo','doing')").first();
        let db = "healthy"; try { await env.XRAY_DB.prepare("SELECT 1").first(); } catch (e) { db = "failed"; }
        const av = availableProviders(env);
        return json({ ok: true, brain: "online", owner: { name: u.name || "", email: u.email }, database: db, memory: { active: mem.n }, ai: { providers: av, status: av["workers-ai"] || av.groq || av.gemini ? "online" : "offline (degraded mode)" }, runner: bgOn(env) ? "configured" : "not set up", tools: Object.keys(TOOLS).filter((k) => TOOLS[k].level < 5).length, connectors: { github: GH.ghOn(env), google: (await step("google status", GO.status(env), 6000).catch(() => ({}))).connected || false }, voice: { tts: !!env.AI, stt: !!env.AI, live: LV.liveOn(env) }, active_alerts: al.n, open_tasks: tk.n, settings: { provider: settings.provider, memory: settings.memory, voice: settings.voice, wakeWord: settings.wakeWord, theme: settings.theme, voiceEngine: settings.voiceEngine, liveVoice: settings.liveVoice }, me: { email: W.email, name: W.name, role: W.role, owner: W.owner, perms: W.perms } });
      }
      if (p0 === "briefing") return json(Object.assign({ ok: true }, await briefing(ctxT, { force: q.get("force") === "1", ai: q.get("ai") !== "0" })));
      if (p0 === "diagnostics") { const r = await systemCheck(ctxT, true); await audit(env, { owner: u.email, kind: "diagnostics", status: r.overall }); return json(Object.assign({ ok: true, auth: { status: "PASS", evidence: "owner session verified on the server" } }, r)); }
      if (p0 === "memory" && path[1] && path[2] === "history") return json({ ok: true, items: await memoryHistory(env, path[1]) });
      if (p0 === "memory") return json({ ok: true, items: await listMemory(env, { q: q.get("q"), type: q.get("type") || null, scope: W.owner ? q.get("scope") || null : "fodo", status: q.get("status") || null, offset: +q.get("offset") || 0 }) });
      if (p0 === "tasks") return json({ ok: true, items: await listTasks(env, { all: q.get("all") === "1", project: q.get("project") || null, status: q.get("status") || null }) });
      if (p0 === "projects") return json({ ok: true, items: await projects(env) });
      if (p0 === "docs") return json({ ok: true, items: (await listDocs(env)).map((x) => Object.assign(x, { extracted: (() => { try { return JSON.parse(x.extracted || "{}"); } catch (e) { return {}; } })() })) });
      if (p0 === "threads") { const d = await brainDb(env); return json({ ok: true, items: ((await d.prepare("SELECT t.*, (SELECT count(*) FROM brain_messages m WHERE m.thread_id=t.id) n FROM brain_threads t ORDER BY updated_at DESC LIMIT 300").all()).results || []).filter((t) => mayOpenThread(t, W)).slice(0, 100) }); }
      if (p0 === "thread" && path[1]) { const d = await brainDb(env), t = await d.prepare("SELECT * FROM brain_threads WHERE id=?1").bind(path[1]).first(); if (!t || !mayOpenThread(t, W)) return json({ ok: false, reason: "Not found." }, 404);
        return json({ ok: true, thread: t, messages: ((await d.prepare("SELECT id, role, content, meta, created_at FROM brain_messages WHERE thread_id=?1 ORDER BY id LIMIT 400").bind(t.id).all()).results || []).map((x) => Object.assign(x, { meta: x.meta ? JSON.parse(x.meta) : null })) }); }
      if (p0 === "tools") { const d = await brainDb(env), last = {}; ((await d.prepare("SELECT tool, max(t) t, count(*) n, sum(status='error') bad FROM brain_audit WHERE kind='tool' GROUP BY tool").all()).results || []).forEach((r) => { last[r.tool] = r; });
        return json({ ok: true, items: Object.keys(TOOLS).map((n) => ({ name: n, cat: TOOLS[n].cat, desc: TOOLS[n].desc, level: TOOLS[n].level, risk: LEVELS[TOOLS[n].level], confirmation: TOOLS[n].level >= 2, never: TOOLS[n].level >= 5, args: TOOLS[n].args, enabled: !settings.toolsOff[n], lastUsed: last[n] ? last[n].t : null, uses: last[n] ? last[n].n : 0, failures: last[n] ? last[n].bad || 0 : 0 })) }); }
      if (p0 === "alerts") return json({ ok: true, items: await listAlerts(env, q.get("all") === "1") });
      if (p0 === "activity") { const d = await brainDb(env); return json({ ok: true, items: ((await d.prepare("SELECT * FROM brain_audit ORDER BY id DESC LIMIT 300").all()).results || []) }); }
      if (p0 === "analytics") {
        const d = await brainDb(env), since = new Date(Date.now() - 30 * 864e5).toISOString();
        const A = (await d.prepare("SELECT kind, status, count(*) n, avg(ms) ms FROM brain_audit WHERE t >= ?1 GROUP BY kind, status").bind(since).all()).results || [];
        const M = (await env.XRAY_DB.prepare("SELECT provider, count(*) calls, sum(ok=0) failed, sum(units) tokens, sum(cost_usd) usd, avg(ms) ms FROM api_usage WHERE endpoint='brain' AND t >= ?1 GROUP BY provider").bind(since).all().catch(() => ({ results: [] }))).results || [];
        const day = (await env.XRAY_DB.prepare("SELECT substr(t,1,10) day, count(*) calls, sum(cost_usd) usd FROM api_usage WHERE endpoint='brain' AND t >= ?1 GROUP BY day ORDER BY day").bind(since).all().catch(() => ({ results: [] }))).results || [];
        const fb = await d.prepare("SELECT sum(rating>0) up, sum(rating<0) down FROM brain_feedback").first();
        const mem = await d.prepare("SELECT count(*) n FROM brain_memory").first();
        return json({ ok: true, days: 30, activity: A, models: M, perDay: day, feedback: fb, memories: mem.n });
      }
      if (p0 === "changes") return json({ ok: true, items: await GH.listChanges(env), github: await GH.ghStatus(env) });
      if (p0 === "automations") return json({ ok: true, items: await AU.list(env), events: AU.EVENTS, actions: AU.ACTIONS });
      if (p0 === "connectors") { const d = await brainDb(env); return json({ ok: true, github: await GH.ghStatus(env), google: await GO.status(env), social: SO.available(env), cashfree: !!(env.CASHFREE_APP_ID && env.CASHFREE_SECRET_KEY), razorpay: !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET), razorpayWebhook: !!env.RAZORPAY_WEBHOOK_SECRET, media: MD.storeKind(env), gaProperty: settings.gaProperty || "", ai: availableProviders(env), email: !!env.RESEND_API_KEY, search: !!(env.SERPER_API_KEY || env.BRAVE_API_KEY), files: !!(env.AI && typeof env.AI.toMarkdown === "function"), cron: !!env.CRON_KEY }); }
      if (p0 === "connect" && path[1] === "google" && !path[2]) { if (!GO.googleOn(env)) return json({ ok: false, reason: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set." }, 400); return Response.redirect(await GO.connectUrl(env, origin, u.id, clean(q.get("hint"), 120)), 302); }
      if (p0 === "connect" && ["meta", "linkedin", "x"].indexOf(path[1]) > -1 && !path[2]) { try { return Response.redirect(await SO.connectUrl(env, path[1], origin, u.id), 302); } catch (e) { return Response.redirect(origin + "/owner-brain/#social?err=" + encodeURIComponent(e.message), 302); } }
      if (p0 === "connect" && ["meta", "linkedin", "x"].indexOf(path[1]) > -1 && path[2] === "callback") {
        const back = (h) => Response.redirect(origin + "/owner-brain/#social?" + h, 302);
        if (q.get("error")) return back("err=" + encodeURIComponent(q.get("error_description") || q.get("error")));
        try { const r = await SO.finishConnect(env, path[1], origin, u.id, q.get("code"), q.get("state"), u.email); await audit(env, { owner: u.email, kind: "connector", tool: path[1], status: "connected", detail: r.connected.join(", ") }); return back("ok=" + encodeURIComponent(r.connected.length)); }
        catch (e) { await audit(env, { owner: u.email, kind: "connector", tool: path[1], status: "error", detail: e.message }); return back("err=" + encodeURIComponent(String(e.message).slice(0, 160))); }
      }
      if (p0 === "social" && !path[1]) return json({ ok: true, accounts: await SO.accounts(env), available: SO.available(env), platforms: SO.PLATFORMS, posts: await SO.listPosts(env, 30), store: MD.storeKind(env), canManage: W.owner });
      if (p0 === "social" && path[1] === "stats") return json({ ok: true, items: await SO.stats(env, q.get("platform") || "") });
      if (p0 === "members") return json({ ok: true, items: await AC.members(env), perms: AC.PERMS, ownerOnly: AC.OWNER_ONLY });
      if (p0 === "live") {   // a single-use Gemini Live token for this browser (the API key stays on the server)
        if (await count(env, "brain:live:" + u.id + ":" + Math.floor(Date.now() / 3600e3), 60, 3700)) return json({ ok: false, reason: "Too many voice sessions this hour." }, 429);
        try { const t = await LV.token(env, W, u, q.get("voice") || settings.liveVoice); await audit(env, { owner: u.email, kind: "voice", tool: "live", status: "token", detail: t.model }); return json(Object.assign({ ok: true }, t)); }
        catch (e) { return json({ ok: false, reason: e.message }, 503); } }
      if (p0 === "ga" && path[1] === "properties") { try { return json({ ok: true, items: await GO.gaProperties(env) }); } catch (e) { return json({ ok: true, items: [], reason: e.message }); } }
      if (p0 === "connect" && path[1] === "google" && path[2] === "callback") {
        const back = (h) => Response.redirect(new URL(request.url).origin + "/owner-brain/#connectors" + h, 302);
        if (q.get("error")) return back("?google=denied");
        try { const r = await GO.finishConnect(env, origin, u.id, q.get("code"), q.get("state")); await audit(env, { owner: u.email, kind: "connector", tool: "google", status: "connected", detail: r.account }); return back("?google=ok&account=" + encodeURIComponent(r.account)); }
        catch (e) { await audit(env, { owner: u.email, kind: "connector", tool: "google", status: "error", detail: e.message }); return back("?google=" + encodeURIComponent(String(e.message).slice(0, 120))); }
      }
      if (p0 === "settings") return json({ ok: true, settings: { provider: settings.provider, memory: settings.memory, briefing: settings.briefing, alerts: settings.alerts, retentionDays: settings.retentionDays, toolsOff: settings.toolsOff, voice: settings.voice, notifyEmail: settings.notifyEmail, wakeWord: settings.wakeWord, theme: settings.theme, gaProperty: settings.gaProperty, liveVoice: settings.liveVoice, voiceEngine: settings.voiceEngine }, live: LV.liveOn(env), providers: availableProviders(env), owner: W.owner });
      if (p0 === "export") {
        const d = await brainDb(env), all = async (s) => ((await d.prepare(s).all()).results || []);
        await audit(env, { owner: u.email, kind: "export", status: "ok" });
        return new Response(JSON.stringify(redact({ exportedAt: nowIso(), memory: (await all("SELECT * FROM brain_memory")).map((m) => { delete m.emb; return m; }), memoryVersions: await all("SELECT * FROM brain_memory_versions"), tasks: await all("SELECT * FROM brain_tasks"), documents: await all("SELECT id, title, kind, version, size, summary, extracted, scope, project, created_at FROM brain_docs"), threads: await all("SELECT * FROM brain_threads"), messages: await all("SELECT * FROM brain_messages"), audit: await all("SELECT * FROM brain_audit ORDER BY id DESC LIMIT 5000"), alerts: await all("SELECT * FROM brain_alerts") }), null, 1), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": "attachment; filename=\"fodo-brain-export-" + nowIso().slice(0, 10) + ".json\"", "cache-control": "no-store" } });
      }
      return json({ ok: false, reason: "Not found." }, 404);
    }

    /* ---------- POST ---------- */
    if (m === "POST") {
      if (p0 === "chat") { if (await count(env, "brain:chat:" + u.id + ":" + Math.floor(Date.now() / 60e3), 30, 120)) return json({ ok: false, reason: "Slow down a little — 30 messages a minute." }, 429);
        return json(await chat(base, body || {})); }
      if (p0 === "ingest") { if (await count(env, "brain:ingest:" + u.id + ":" + Math.floor(Date.now() / 3600e3), 30, 3700)) return json({ ok: false, reason: "Too many uploads this hour." }, 429);
        if (String((body && body.text) || "").length > 400000) return json({ ok: false, reason: "That document is too large (max ~400,000 characters)." }, 413);
        const r = await ingest(base, body || {}); return json(r, r.ok ? 200 : 400); }
      if (p0 === "confirm") { const r = await confirmAction(ctxT, body.actionId, body.token, body.decision); return json(r, r.ok ? 200 : r.status || 400); }
      if (p0 === "memory") { const r = await execute(ctxT, "remember", { type: body.type, title: body.title, content: body.content, scope: body.scope, project: body.project }, { intent: "memory page" }); return json(r.ok ? { ok: true, item: r.result } : { ok: false, reason: r.error }, r.ok ? 200 : 400); }
      if (p0 === "tasks") { try { const t = await createTask(env, Object.assign({}, body, { source: "owner (tasks page)" })); await audit(env, { owner: u.email, kind: "tool", tool: "create_task", status: "ok" }); return json({ ok: true, item: t }); } catch (e) { return json({ ok: false, reason: e.message }, 400); } }
      if (p0 === "feedback") { const d = await brainDb(env); await d.prepare("INSERT INTO brain_feedback (message_id, rating, note, created_at) VALUES (?1,?2,?3,?4)").bind(+body.messageId || 0, body.rating > 0 ? 1 : -1, clean(body.note, 500), nowIso()).run(); await audit(env, { owner: u.email, kind: "feedback", status: body.rating > 0 ? "up" : "down", detail: clean(body.note, 200) }); return json({ ok: true }); }
      if (p0 === "tts") {   // human-like voice: Deepgram Aura-2 (English). Hindi / Hinglish → a Devanagari version for the device's Hindi voice.
        const text = clean(body.text, 1500).replace(/[*_`#>]|\[([^\]]*)\]\([^)]*\)/g, "$1"); if (!text) return json({ ok: false, reason: "No text." }, 400);
        if (await count(env, "brain:tts:" + u.id + ":" + Math.floor(Date.now() / 60e3), 60, 120)) return json({ ok: false, fallback: true, reason: "Too many voice replies this minute." }, 429);
        const lang = VO.speechLang(text);
        if (lang !== "en" || !env.AI || settings.voice === "browser") { let say = text; if (lang === "hinglish") say = await VO.toDevanagari(env, text, settings).catch(() => text); return json({ ok: false, fallback: true, lang: lang === "en" ? "en-IN" : "hi-IN", speakText: say }, 415); }
        try { const r = await VO.aura(env, text, settings.voice); await logUsage(env, { provider: "workers-ai", endpoint: "brain", tool: "brain:tts · " + r.model, status: 200, ms: r.ms, units: text.length });
          return new Response(r.body, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } }); }
        catch (e) { return json({ ok: false, fallback: true, lang: "en-IN", speakText: text, reason: "Voice unavailable: " + String(e.message).slice(0, 100) }, 503); }
      }
      if (p0 === "stt") {   // speech → text: Whisper large-v3-turbo (Hindi, English, Hinglish) with FODO vocabulary; Nova-3 as a backup
        if (!env.AI) return json({ ok: false, reason: "Speech recognition needs the Workers AI binding." }, 503);
        const a = String(body.audioB64 || ""); if (!a || a.length > 4e6) return json({ ok: false, reason: "Audio missing or too long (max ~60 s)." }, 400);
        if (await count(env, "brain:stt:" + u.id + ":" + Math.floor(Date.now() / 60e3), 50, 120)) return json({ ok: false, reason: "Too much audio this minute." }, 429);
        try { const r = await VO.transcribe(env, a, { lang: body.lang, mime: body.mime, name: (W.name || "").split(" ")[0] });
          await logUsage(env, { provider: "workers-ai", endpoint: "brain", tool: "brain:stt · " + r.engine, status: 200, ms: r.ms, units: Math.round(a.length / 1000) });
          return json({ ok: true, text: r.text, engine: r.engine, ms: r.ms, dropped: r.dropped || null }); }
        catch (e) { return json({ ok: false, reason: "Couldn't transcribe: " + String(e.message).slice(0, 120) }, 502); }
      }
      if (p0 === "automations" && !path[1]) { try { const r = await AU.save(env, body || {}); await audit(env, { owner: u.email, kind: "automation", tool: "save", status: "ok", detail: r.name }); return json({ ok: true, item: r }); } catch (e) { return json({ ok: false, reason: e.message }, 400); } }
      if (p0 === "automations" && path[1] && path[2] === "toggle") { await AU.toggle(env, path[1], !!body.on); return json({ ok: true }); }
      if (p0 === "automations" && path[1] && path[2] === "run") { const r = await AU.tick(env); return json({ ok: true, result: r }); }
      if (p0 === "changes" && path[1] && ["open", "merge", "discard"].indexOf(path[2]) > -1) {   // open/merge return a confirmation card — same token flow as chat
        const tool = path[2] === "open" ? "open_change" : path[2] === "merge" ? "merge_change" : "discard_change";
        const r = await execute(ctxT, tool, { change: path[1] }, { intent: "changes page" }); return json(r.ok ? { ok: true, pending: !!r.pending, action: r.action, result: r.result } : { ok: false, reason: r.error }, r.ok ? 200 : 400);
      }
      if (p0 === "connectors" && path[1] === "google" && path[2] === "disconnect") { const r = await GO.disconnect(env, body && body.account); await audit(env, { owner: u.email, kind: "connector", tool: "google", status: "disconnected", detail: (r.disconnected || []).join(",") }); return json(Object.assign({ ok: true }, r)); }
      if (p0 === "social" && path[1] === "media" && !path[2]) { try { return json(Object.assign({ ok: true }, await MD.create(env, body || {}))); } catch (e) { return json({ ok: false, reason: e.message }, 400); } }
      if (p0 === "social" && path[1] === "media" && path[2] && path[3] === "done") { try { return json(Object.assign({ ok: true }, await MD.finish(env, path[2]))); } catch (e) { return json({ ok: false, reason: e.message }, 400); } }
      if (p0 === "social" && path[1] === "posts" && !path[2]) { if (await count(env, "brain:post:" + u.id + ":" + Math.floor(Date.now() / 3600e3), 40, 3700)) return json({ ok: false, reason: "Too many posts this hour." }, 429);
        try { const p = await SO.createPost(env, body || {}, u.email); await audit(env, { owner: u.email, kind: "social", tool: "post", status: p.status, detail: p.targets.join(",") }); return json({ ok: true, post: await SO.runPost(env, origin, p.id, 15000) }); } catch (e) { return json({ ok: false, reason: e.message }, 400); } }
      if (p0 === "social" && path[1] === "posts" && path[2] && path[3] === "run") { try { return json({ ok: true, post: await SO.runPost(env, origin, path[2], 20000) }); } catch (e) { return json({ ok: false, reason: e.message }, 400); } }
      if (p0 === "social" && path[1] === "posts" && path[2] && path[3] === "cancel") return json(Object.assign({ ok: true }, await SO.cancelPost(env, path[2])));
      if (p0 === "members") { try { const r = await AC.save(env, u.email, body || {}); await audit(env, { owner: u.email, kind: "access", tool: "grant", status: r.role, detail: r.email + " " + r.perms.join(",") }); return json({ ok: true, item: r }); } catch (e) { return json({ ok: false, reason: e.message }, 400); } }
      if (p0 === "settings") { const r = await saveSettings(env, body || {}); await audit(env, { owner: u.email, kind: "settings", status: "ok", detail: Object.keys(r).join(",") }); return json({ ok: true, saved: r }); }
      if (p0 === "alerts" && path[1] && path[2] === "ack") { await ackAlert(env, path[1]); return json({ ok: true }); }
      return json({ ok: false, reason: "Not found." }, 404);
    }
    if (m === "PATCH") {
      if (p0 === "memory" && path[1]) { const r = await updateMemory(env, u.email, path[1], body || {}); await audit(env, { owner: u.email, kind: "memory", tool: "edit", status: r ? "ok" : "missing" }); return r ? json({ ok: true, item: r }) : json({ ok: false, reason: "Not found." }, 404); }
      if (p0 === "tasks" && path[1]) { const r = await updateTask(env, path[1], body || {}); return r ? json({ ok: true, item: r }) : json({ ok: false, reason: "Not found." }, 404); }
      return json({ ok: false, reason: "Not found." }, 404);
    }
    if (m === "DELETE") {   // the owner pressed Delete and confirmed it in the page — explicit, permanent
      if (p0 === "memory" && !path[1] && q.get("scope")) { if (!W.owner) return json({ ok: false, reason: "Only owners can do that." }, 403); if (["personal", "fodo"].indexOf(q.get("scope")) < 0) return json({ ok: false, reason: "Unknown scope." }, 400); const n = await forgetScope(env, q.get("scope")); await audit(env, { owner: u.email, kind: "memory", tool: "forget_all", status: "ok", detail: q.get("scope") + ": " + n }); return json({ ok: true, deleted: n }); }
      if (p0 === "memory" && path[1]) { const r = await forget(env, path[1]); await audit(env, { owner: u.email, kind: "memory", tool: "forget", status: r ? "ok" : "missing" }); return r ? json({ ok: true }) : json({ ok: false, reason: "Not found." }, 404); }
      if (p0 === "tasks" && path[1]) { const r = await deleteTask(env, path[1]); return r ? json({ ok: true }) : json({ ok: false, reason: "Not found." }, 404); }
      if (p0 === "automations" && path[1]) { await AU.remove(env, path[1]); await audit(env, { owner: u.email, kind: "automation", tool: "delete", status: "ok" }); return json({ ok: true }); }
      if (p0 === "docs" && path[1]) { const r = await deleteDoc(env, path[1]); await audit(env, { owner: u.email, kind: "ingest", tool: "delete_doc", status: r ? "ok" : "missing" }); return r ? json({ ok: true }) : json({ ok: false, reason: "Not found." }, 404); }
      if (p0 === "social" && path[1] === "accounts" && path[2]) { const r = await SO.disconnect(env, decodeURIComponent(path[2])); await audit(env, { owner: u.email, kind: "connector", tool: "social", status: "disconnected", detail: r.disconnected }); return json({ ok: true }); }
      if (p0 === "members" && path[1]) { const r = await AC.remove(env, decodeURIComponent(path[1])); await audit(env, { owner: u.email, kind: "access", tool: "revoke", status: r.removed ? "ok" : "missing", detail: decodeURIComponent(path[1]) }); return json({ ok: true }); }
      if (p0 === "thread" && path[1]) { const d = await brainDb(env), t = await d.prepare("SELECT * FROM brain_threads WHERE id=?1").bind(path[1]).first(); if (!mayOpenThread(t, W)) return json({ ok: false, reason: "Not found." }, 404); await d.batch([d.prepare("DELETE FROM brain_messages WHERE thread_id=?1").bind(path[1]), d.prepare("DELETE FROM brain_threads WHERE id=?1").bind(path[1])]); return json({ ok: true }); }
      return json({ ok: false, reason: "Not found." }, 404);
    }
    return json({ ok: false }, 405);
  } catch (e) {
    console.error("owner-brain error:", String(e && e.message || e).slice(0, 300));
    return json({ ok: false, reason: "The Brain hit an error: " + scrubEnv(env, String(e && e.message || e)).replace(/(gsk_|sk-|AIza|re_|whsec_)[\w-]+/g, "[redacted]").slice(0, 200) }, 500);
  }
}
