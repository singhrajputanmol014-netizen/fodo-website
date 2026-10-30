/* FODO OWNER BRAIN — API (/api/owner-brain/*). OWNER ONLY.
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
const sameKey = (a, b) => { a = String(a || ""); b = String(b || ""); if (!a || a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; };

const deny = () => json({ ok: false, reason: "Not available." }, 403);
export async function gate(env, request) {
  if (String(env.BRAIN_ENABLED || "1") === "0" || !accountsOn(env)) return null;
  const u = await sessionUser(env, request);
  return u && isOwner(u) ? u : null;
}

export async function onRequest(ctx) {
  const { request, env, params } = ctx, m = request.method, path = [].concat(params.path || []).map(String), p0 = path[0] || "";
  try {
    // the scheduler (hourly GitHub workflow / daily tick) — authenticated by CRON_KEY, not by a session
    if (p0 === "tick" && m === "POST") {
      if (!env.CRON_KEY || String(env.CRON_KEY).length < 16 || !sameKey(request.headers.get("x-cron-key"), env.CRON_KEY) || String(env.BRAIN_ENABLED || "1") === "0") return deny();
      const r = await AU.tick(env), daily = new Date(Date.now() + 5.5 * 3600e3).getUTCHours() >= 6 ? await brainDaily(env, request) : { skipped: "before 06:00 IST" };
      return json({ ok: true, automations: r, briefing: daily });
    }
    const u = await gate(env, request);
    if (!u) return deny();
    if (m !== "GET" && (!sameOrigin(request) || (m !== "DELETE" && !/json/.test(request.headers.get("content-type") || "")))) return json({ ok: false, reason: "Bad request." }, 403);   // CSRF
    await applyConfig(env); await brainDb(env);
    const base = { env, request, owner: u }, q = new URL(request.url).searchParams, body = m === "GET" || m === "DELETE" ? null : ((await request.json().catch(() => null)) || {});
    const settings = await getSettings(env), ctxT = Object.assign({}, base, { settings, scope: "fodo" });

    /* ---------- GET ---------- */
    if (m === "GET") {
      if (p0 === "status") {
        const d = await brainDb(env), mem = await d.prepare("SELECT count(*) n FROM brain_memory WHERE status='active'").first(), al = await d.prepare("SELECT count(*) n FROM brain_alerts WHERE status='open'").first(), tk = await d.prepare("SELECT count(*) n FROM brain_tasks WHERE status IN ('todo','doing')").first();
        let db = "healthy"; try { await env.XRAY_DB.prepare("SELECT 1").first(); } catch (e) { db = "failed"; }
        const av = availableProviders(env);
        return json({ ok: true, brain: "online", owner: { name: u.name || "", email: u.email }, database: db, memory: { active: mem.n }, ai: { providers: av, status: av["workers-ai"] || av.groq || av.gemini ? "online" : "offline (degraded mode)" }, runner: bgOn(env) ? "configured" : "not set up", tools: Object.keys(TOOLS).filter((k) => TOOLS[k].level < 5).length, connectors: { github: GH.ghOn(env), google: (await GO.status(env)).connected || false }, voice: { tts: !!env.AI, stt: !!env.AI }, active_alerts: al.n, open_tasks: tk.n, settings: { provider: settings.provider, memory: settings.memory, voice: settings.voice, wakeWord: settings.wakeWord } });
      }
      if (p0 === "briefing") return json(Object.assign({ ok: true }, await briefing(ctxT, { force: q.get("force") === "1", ai: q.get("ai") !== "0" })));
      if (p0 === "diagnostics") { const r = await systemCheck(ctxT, true); await audit(env, { owner: u.email, kind: "diagnostics", status: r.overall }); return json(Object.assign({ ok: true, auth: { status: "PASS", evidence: "owner session verified on the server" } }, r)); }
      if (p0 === "memory" && path[1] && path[2] === "history") return json({ ok: true, items: await memoryHistory(env, path[1]) });
      if (p0 === "memory") return json({ ok: true, items: await listMemory(env, { q: q.get("q"), type: q.get("type") || null, scope: q.get("scope") || null, status: q.get("status") || null, offset: +q.get("offset") || 0 }) });
      if (p0 === "tasks") return json({ ok: true, items: await listTasks(env, { all: q.get("all") === "1", project: q.get("project") || null, status: q.get("status") || null }) });
      if (p0 === "projects") return json({ ok: true, items: await projects(env) });
      if (p0 === "docs") return json({ ok: true, items: (await listDocs(env)).map((x) => Object.assign(x, { extracted: (() => { try { return JSON.parse(x.extracted || "{}"); } catch (e) { return {}; } })() })) });
      if (p0 === "threads") { const d = await brainDb(env); return json({ ok: true, items: ((await d.prepare("SELECT t.*, (SELECT count(*) FROM brain_messages m WHERE m.thread_id=t.id) n FROM brain_threads t ORDER BY updated_at DESC LIMIT 100").all()).results || []) }); }
      if (p0 === "thread" && path[1]) { const d = await brainDb(env), t = await d.prepare("SELECT * FROM brain_threads WHERE id=?1").bind(path[1]).first(); if (!t) return json({ ok: false, reason: "Not found." }, 404);
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
      if (p0 === "connectors") { const d = await brainDb(env); return json({ ok: true, github: await GH.ghStatus(env), google: await GO.status(env), ai: availableProviders(env), email: !!env.RESEND_API_KEY, search: !!(env.SERPER_API_KEY || env.BRAVE_API_KEY), files: !!(env.AI && typeof env.AI.toMarkdown === "function"), cron: !!env.CRON_KEY }); }
      if (p0 === "connect" && path[1] === "google" && !path[2]) { if (!GO.googleOn(env)) return json({ ok: false, reason: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set." }, 400); return Response.redirect(await GO.connectUrl(env, new URL(request.url).origin, u.id), 302); }
      if (p0 === "connect" && path[1] === "google" && path[2] === "callback") {
        const back = (h) => Response.redirect(new URL(request.url).origin + "/owner-brain/#connectors" + h, 302);
        if (q.get("error")) return back("?google=denied");
        try { const r = await GO.finishConnect(env, new URL(request.url).origin, u.id, q.get("code"), q.get("state")); await audit(env, { owner: u.email, kind: "connector", tool: "google", status: "connected", detail: r.account }); return back("?google=ok"); }
        catch (e) { await audit(env, { owner: u.email, kind: "connector", tool: "google", status: "error", detail: e.message }); return back("?google=" + encodeURIComponent(String(e.message).slice(0, 120))); }
      }
      if (p0 === "settings") return json({ ok: true, settings: { provider: settings.provider, memory: settings.memory, briefing: settings.briefing, alerts: settings.alerts, retentionDays: settings.retentionDays, toolsOff: settings.toolsOff, voice: settings.voice, notifyEmail: settings.notifyEmail, wakeWord: settings.wakeWord }, providers: availableProviders(env) });
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
      if (p0 === "tts") {   // human-like voice (Deepgram Aura on Workers AI). Hindi script → the browser's Hindi voice instead.
        const text = clean(body.text, 1500).replace(/[*_`#>]|\[([^\]]*)\]\([^)]*\)/g, "$1"); if (!text) return json({ ok: false, reason: "No text." }, 400);
        if (!env.AI || settings.voice === "browser" || /[\u0900-\u097F]/.test(text)) return json({ ok: false, fallback: true, reason: "use the browser voice" }, 415);
        if (await count(env, "brain:tts:" + u.id + ":" + Math.floor(Date.now() / 60e3), 40, 120)) return json({ ok: false, fallback: true, reason: "Too many voice replies this minute." }, 429);
        try { const t0 = Date.now(), out = await env.AI.run("@cf/deepgram/aura-1", { text, speaker: settings.voice || "asteria", encoding: "mp3" });
          let bodyOut = out; if (out && out.audio) { const b = atob(out.audio), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); bodyOut = a; } else if (out instanceof Response) bodyOut = out.body;
          await logUsage(env, { provider: "workers-ai", endpoint: "brain", tool: "brain:tts · aura-1", status: 200, ms: Date.now() - t0, units: text.length });
          return new Response(bodyOut, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } }); }
        catch (e) { return json({ ok: false, fallback: true, reason: "Voice unavailable: " + String(e.message).slice(0, 100) }, 503); }
      }
      if (p0 === "stt") {   // speech → text (Whisper on Workers AI) for browsers without speech recognition
        if (!env.AI) return json({ ok: false, reason: "Speech recognition needs the Workers AI binding." }, 503);
        const a = String(body.audioB64 || ""); if (!a || a.length > 8e6) return json({ ok: false, reason: "Audio missing or too long (max ~1 minute)." }, 400);
        try { const t0 = Date.now(), r = await env.AI.run("@cf/openai/whisper-large-v3-turbo", Object.assign({ audio: a }, /^(hi|en)$/.test(body.lang || "") ? { language: body.lang } : {}));
          await logUsage(env, { provider: "workers-ai", endpoint: "brain", tool: "brain:stt · whisper", status: 200, ms: Date.now() - t0, units: Math.round(a.length / 1000) });
          return json({ ok: true, text: clean((r && (r.text || (r.transcription_info && r.text))) || "", 2000) }); }
        catch (e) { return json({ ok: false, reason: "Couldn't transcribe: " + String(e.message).slice(0, 100) }, 502); }
      }
      if (p0 === "automations" && !path[1]) { try { const r = await AU.save(env, body || {}); await audit(env, { owner: u.email, kind: "automation", tool: "save", status: "ok", detail: r.name }); return json({ ok: true, item: r }); } catch (e) { return json({ ok: false, reason: e.message }, 400); } }
      if (p0 === "automations" && path[1] && path[2] === "toggle") { await AU.toggle(env, path[1], !!body.on); return json({ ok: true }); }
      if (p0 === "automations" && path[1] && path[2] === "run") { const r = await AU.tick(env); return json({ ok: true, result: r }); }
      if (p0 === "changes" && path[1] && ["open", "merge", "discard"].indexOf(path[2]) > -1) {   // open/merge return a confirmation card — same token flow as chat
        const tool = path[2] === "open" ? "open_change" : path[2] === "merge" ? "merge_change" : "discard_change";
        const r = await execute(ctxT, tool, { change: path[1] }, { intent: "changes page" }); return json(r.ok ? { ok: true, pending: !!r.pending, action: r.action, result: r.result } : { ok: false, reason: r.error }, r.ok ? 200 : 400);
      }
      if (p0 === "connectors" && path[1] === "google" && path[2] === "disconnect") { const r = await GO.disconnect(env); await audit(env, { owner: u.email, kind: "connector", tool: "google", status: "disconnected" }); return json(Object.assign({ ok: true }, r)); }
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
      if (p0 === "memory" && !path[1] && q.get("scope")) { if (["personal", "fodo"].indexOf(q.get("scope")) < 0) return json({ ok: false, reason: "Unknown scope." }, 400); const n = await forgetScope(env, q.get("scope")); await audit(env, { owner: u.email, kind: "memory", tool: "forget_all", status: "ok", detail: q.get("scope") + ": " + n }); return json({ ok: true, deleted: n }); }
      if (p0 === "memory" && path[1]) { const r = await forget(env, path[1]); await audit(env, { owner: u.email, kind: "memory", tool: "forget", status: r ? "ok" : "missing" }); return r ? json({ ok: true }) : json({ ok: false, reason: "Not found." }, 404); }
      if (p0 === "tasks" && path[1]) { const r = await deleteTask(env, path[1]); return r ? json({ ok: true }) : json({ ok: false, reason: "Not found." }, 404); }
      if (p0 === "automations" && path[1]) { await AU.remove(env, path[1]); await audit(env, { owner: u.email, kind: "automation", tool: "delete", status: "ok" }); return json({ ok: true }); }
      if (p0 === "docs" && path[1]) { const r = await deleteDoc(env, path[1]); await audit(env, { owner: u.email, kind: "ingest", tool: "delete_doc", status: r ? "ok" : "missing" }); return r ? json({ ok: true }) : json({ ok: false, reason: "Not found." }, 404); }
      if (p0 === "thread" && path[1]) { const d = await brainDb(env); await d.batch([d.prepare("DELETE FROM brain_messages WHERE thread_id=?1").bind(path[1]), d.prepare("DELETE FROM brain_threads WHERE id=?1").bind(path[1])]); return json({ ok: true }); }
      return json({ ok: false, reason: "Not found." }, 404);
    }
    return json({ ok: false }, 405);
  } catch (e) {
    console.error("owner-brain error:", String(e && e.message || e).slice(0, 300));
    return json({ ok: false, reason: "The Brain hit an error: " + scrubEnv(env, String(e && e.message || e)).replace(/(gsk_|sk-|AIza|re_|whsec_)[\w-]+/g, "[redacted]").slice(0, 200) }, 500);
  }
}
