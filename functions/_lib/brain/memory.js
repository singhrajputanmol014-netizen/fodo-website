/* FODO OWNER BRAIN, long-term memory, tasks and the document knowledge store.
   Retrieval (v1) = keyword + metadata + recency + importance + entity matching, behind a small "vectorStore" interface so
   Cloudflare Vectorize / embeddings can be plugged in later without touching the orchestrator.
   Temporal knowledge: a new decision/fact about the same thing SUPERSEDES the old one (status, valid_until, superseded_by), the
   old one is kept for history ("what did we decide before?"), never silently deleted. Forget = real deletion (owner-confirmed). */
import { brainDb, nowIso, rid, clip, clean, sha } from "./store.js";
import { embed, embedBatch, unpack, cosine } from "./embed.js";

export const TYPES = ["FACT", "BELIEF", "HYPOTHESIS", "DECISION", "PREFERENCE", "GOAL", "PROJECT", "IDEA", "NOTE", "PROCESS", "SOP", "LEARNING", "INSIGHT", "WARNING", "RESEARCH", "DOCUMENT"];
export const SCOPES = ["fodo", "personal"];
const SUPERSEDABLE = ["FACT", "DECISION", "PREFERENCE", "GOAL", "PROCESS", "SOP", "BELIEF"];
const STOP = /^(the|and|for|with|that|this|from|have|has|was|were|will|are|our|your|you|they|them|then|than|what|when|which|who|how|why|its|it's|we|us|is|be|to|of|in|on|at|a|an|or|as|by|do|did|does|not|no|yes|kya|hai|hain|ka|ki|ke|ko|se|me|mein|aur|hum|ham|tha|thi|the|ye|yeh|wo|woh|abhi|ab|bhi|ek|about|tell|me|my|show|remember|yaad|batao|please)$/i;
const stem = (w) => { if (w.length > 5) { const x = w.replace(/(ings|ing|edly|ed|ies|es|s|ly)$/, ""); if (x.length >= 4) return x; } return w; };   // "focusing" → "focus", "decided" → "decid"
export const words = (s) => String(s || "").toLowerCase().split(/[^a-z0-9ऀ-ॿ₹%]+/).filter((w) => w.length > 2 && !STOP.test(w)).map(stem);
const overlap = (a, b) => { const A = new Set(words(a)), B = new Set(words(b)); if (!A.size || !B.size) return 0; let n = 0; A.forEach((w) => { if (B.has(w)) n++; }); return n / Math.min(A.size, B.size); };

/* "today / yesterday / last week / last month" → a time window (IST) */
export function timeWindow(q) {
  const s = String(q || "").toLowerCase(), now = Date.now(), day = 864e5;
  if (/\b(today|aaj)\b/.test(s)) return { from: new Date(now - day).toISOString() };
  if (/\b(yesterday|kal)\b/.test(s)) return { from: new Date(now - 2 * day).toISOString(), to: new Date(now - 0.5 * day).toISOString() };
  if (/\b(last|pichl[ae]) (week|hafte|hafta)\b|this week/.test(s)) return { from: new Date(now - 8 * day).toISOString() };
  if (/\b(last|pichl[ae]) (month|mahine|mahina)\b|this month/.test(s)) return { from: new Date(now - 32 * day).toISOString() };
  return null;
}

/* ---------------- memory ---------------- */
export async function remember(env, owner, m) {
  const d = await brainDb(env), now = nowIso(), id = "m_" + rid(12);
  const type = TYPES.indexOf(String(m.type || "").toUpperCase()) > -1 ? String(m.type).toUpperCase() : "NOTE";
  const scope = m.scope === "personal" ? "personal" : "fodo", title = clip(clean(m.title || m.content, 160), 160), content = clean(m.content || m.title, 4000);
  if (!content) throw new Error("Nothing to remember.");
  // the same thing said again → refresh, don't duplicate
  const same = await d.prepare("SELECT id FROM brain_memory WHERE status='active' AND scope=?1 AND type=?2 AND lower(content)=lower(?3)").bind(scope, type, content).first();
  if (same) { await d.prepare("UPDATE brain_memory SET updated_at=?2, last_accessed_at=?2 WHERE id=?1").bind(same.id, now).run(); return { id: same.id, duplicate: true, superseded: [] }; }
  const superseded = [];
  if (SUPERSEDABLE.indexOf(type) > -1 && m.supersede !== false) {
    const rows = (await d.prepare("SELECT id, title, content, type FROM brain_memory WHERE status='active' AND scope=?1 AND type IN ('FACT','DECISION','BELIEF','PREFERENCE','GOAL','PROCESS','SOP') ORDER BY created_at DESC LIMIT 300").bind(scope).all()).results || [];
    for (const r of rows) {
      const ov = Math.max(overlap(title, r.title), overlap(content, r.title + " " + r.content));
      const explicit = m.supersedes && m.supersedes.indexOf(r.id) > -1;
      if (explicit || ((r.type === type || (type === "DECISION" && r.type === "FACT")) && ov >= 0.5)) superseded.push(r);
    }
  }
  await d.prepare("INSERT INTO brain_memory (id, scope, type, title, content, source, source_type, confidence, importance, status, valid_from, project, tags, version, created_at, updated_at, last_accessed_at, owner) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'active',?10,?11,?12,1,?10,?10,?10,?13)")
    .bind(id, scope, type, title, content, clip(m.source || "owner (chat)", 200), m.sourceType || "owner", m.confidence != null ? +m.confidence : 0.95, Math.max(1, Math.min(5, +m.importance || 3)), now, clip(m.project || "", 80) || null, clip((m.tags || []).join(","), 200), owner || "").run();
  const ev = await embed(env, title + ". " + content); if (ev) await d.prepare("UPDATE brain_memory SET emb=?2 WHERE id=?1").bind(id, ev).run();   // semantic search vector
  for (const r of superseded) {
    await d.prepare("UPDATE brain_memory SET status='superseded', superseded_by=?2, valid_until=?3, updated_at=?3 WHERE id=?1").bind(r.id, id, now).run();
    await d.prepare("INSERT INTO brain_memory_versions (memory_id, version, title, content, status, changed_at, changed_by, note) VALUES (?1, 0, ?2, ?3, 'superseded', ?4, ?5, ?6)").bind(r.id, r.title, r.content, now, owner || "", "superseded by " + id).run();
  }
  return { id, type, scope, title, superseded: superseded.map((r) => ({ id: r.id, title: r.title })) };
}
export async function updateMemory(env, owner, id, patch) {
  const d = await brainDb(env), r = await d.prepare("SELECT * FROM brain_memory WHERE id=?1").bind(id).first(); if (!r) return null;
  await d.prepare("INSERT INTO brain_memory_versions (memory_id, version, title, content, status, changed_at, changed_by, note) VALUES (?1,?2,?3,?4,?5,?6,?7,'edited')").bind(id, r.version, r.title, r.content, r.status, nowIso(), owner || "").run();
  const title = patch.title != null ? clip(clean(patch.title, 160), 160) : r.title, content = patch.content != null ? clean(patch.content, 4000) : r.content;
  const type = patch.type && TYPES.indexOf(String(patch.type).toUpperCase()) > -1 ? String(patch.type).toUpperCase() : r.type, imp = patch.importance ? Math.max(1, Math.min(5, +patch.importance)) : r.importance;
  const status = patch.status === "active" || patch.status === "superseded" ? patch.status : r.status;
  await d.prepare("UPDATE brain_memory SET title=?2, content=?3, type=?4, importance=?5, status=?6, version=version+1, updated_at=?7 WHERE id=?1").bind(id, title, content, type, imp, status, nowIso()).run();
  if (patch.content != null || patch.title != null) { const ev = await embed(env, title + ". " + content); if (ev) await d.prepare("UPDATE brain_memory SET emb=?2 WHERE id=?1").bind(id, ev).run(); }
  const out = await d.prepare("SELECT * FROM brain_memory WHERE id=?1").bind(id).first(); if (out) delete out.emb; return out;
}
export async function forget(env, id) {
  const d = await brainDb(env), r = await d.prepare("SELECT id, title FROM brain_memory WHERE id=?1").bind(id).first(); if (!r) return null;
  await d.batch([d.prepare("DELETE FROM brain_memory WHERE id=?1").bind(id), d.prepare("DELETE FROM brain_memory_versions WHERE memory_id=?1").bind(id)]);
  return r;
}
export async function forgetScope(env, scope) {
  const d = await brainDb(env), n = await d.prepare("SELECT count(*) n FROM brain_memory WHERE scope=?1").bind(scope).first();
  await d.batch([d.prepare("DELETE FROM brain_memory_versions WHERE memory_id IN (SELECT id FROM brain_memory WHERE scope=?1)").bind(scope), d.prepare("DELETE FROM brain_memory WHERE scope=?1").bind(scope)]);
  return n ? n.n : 0;
}
/* hybrid retrieval: keyword match (title ×3) + entity/project match + importance + recency, inside a time window if asked */
export async function recall(env, q, o) {
  o = o || {};
  const d = await brainDb(env), tw = o.window || timeWindow(q), wantOld = /\b(before|previous|old|earlier|pehle|purana|original)\b/i.test(q || "");
  const rows = (await d.prepare("SELECT * FROM brain_memory WHERE (?1 IS NULL OR scope=?1) AND (?2 = 1 OR status='active') AND (?3 IS NULL OR created_at >= ?3) AND (?4 IS NULL OR created_at <= ?4) ORDER BY created_at DESC LIMIT 600")
    .bind(o.scope || null, wantOld || o.all ? 1 : 0, tw && tw.from || null, tw && tw.to || null).all()).results || [];
  const w = words(q), types = o.types && o.types.length ? o.types : null, now = Date.now();
  const qv = q && rows.some((r) => r.emb) ? unpack(await embed(env, q) || "") : null;   // semantic: "pricing" also finds "₹499 plan"
  const scored = rows.filter((r) => !types || types.indexOf(r.type) > -1).map((r) => {
    const t = (r.title || "").toLowerCase(), c = (r.content || "").toLowerCase() + " " + (r.project || "").toLowerCase() + " " + (r.tags || "").toLowerCase();
    let s = w.reduce((a, x) => a + (t.indexOf(x) > -1 ? 3 : c.indexOf(x) > -1 ? 1 : 0), 0);
    const sim = qv && r.emb ? cosine(qv, unpack(r.emb)) : 0;
    if (sim > 0.45) s += (sim - 0.45) * 20;   // 0.55 similarity ≈ +2, 0.75 ≈ +6
    if (!w.length && !qv) s = 1;
    if (s <= 0) return null;
    const ageDays = (now - Date.parse(r.created_at)) / 864e5;
    s += (r.importance || 3) * 0.4 + Math.max(0, 2 - ageDays / 30) + (r.type === "DECISION" ? 1 : 0) - (r.status !== "active" ? 1.5 : 0);
    return { r, s };
  }).filter(Boolean).sort((a, b) => b.s - a.s).slice(0, o.limit || 8).map((x) => { delete x.r.emb; return x.r; });
  if (scored.length) { const ids = scored.map((r) => r.id), t = nowIso(); try { await d.batch(ids.map((id) => d.prepare("UPDATE brain_memory SET last_accessed_at=?2 WHERE id=?1").bind(id, t))); } catch (e) {} }
  return scored;
}
export async function listMemory(env, f) {
  f = f || {}; const d = await brainDb(env), s = clean(f.q, 100);
  return ((await d.prepare("SELECT id, scope, type, title, content, source, source_type, confidence, importance, status, superseded_by, valid_from, valid_until, project, tags, version, created_at, updated_at, last_accessed_at FROM brain_memory WHERE (?1 IS NULL OR scope=?1) AND (?2 IS NULL OR type=?2) AND (?3 IS NULL OR status=?3) AND (?4 = '' OR title LIKE ?5 OR content LIKE ?5 OR project LIKE ?5) ORDER BY updated_at DESC LIMIT ?6 OFFSET ?7")
    .bind(f.scope || null, f.type || null, f.status || null, s, "%" + s + "%", Math.min(200, f.limit || 100), Math.max(0, f.offset || 0)).all()).results || []);
}
export async function memoryHistory(env, id) { const d = await brainDb(env); return ((await d.prepare("SELECT * FROM brain_memory_versions WHERE memory_id=?1 ORDER BY id DESC").bind(id).all()).results || []); }

/* ---------------- tasks & projects ---------------- */
export const PRIORITIES = ["P0", "P1", "P2", "P3"];
export async function createTask(env, t) {
  const d = await brainDb(env), id = "t_" + rid(10), now = nowIso(), title = clip(clean(t.title, 200), 200);
  if (!title) throw new Error("A task needs a title.");
  const dup = await d.prepare("SELECT id FROM brain_tasks WHERE lower(title)=lower(?1) AND status != 'done'").bind(title).first();
  if (dup) return { id: dup.id, duplicate: true, title };
  const kind = ["task", "commitment", "followup"].indexOf(t.kind) > -1 ? t.kind : "task";   // v22: commitments (someone promised something) and follow-ups
  await d.prepare("INSERT INTO brain_tasks (id, title, detail, status, priority, project, scope, due, source, created_at, updated_at, assignee, kind) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10,?11,?12)")
    .bind(id, title, clean(t.detail, 2000), t.status === "suggested" ? "suggested" : "todo", PRIORITIES.indexOf(t.priority) > -1 ? t.priority : "P2", clip(clean(t.project, 80), 80) || null, t.scope === "personal" ? "personal" : "fodo", /^\d{4}-\d{2}-\d{2}$/.test(t.due || "") ? t.due : null, clip(t.source || "owner (chat)", 200), now, clip(clean(t.assignee, 80), 80) || null, kind).run();
  return { id, title, priority: PRIORITIES.indexOf(t.priority) > -1 ? t.priority : "P2", project: t.project || null, kind, assignee: t.assignee || null, due: /^\d{4}-\d{2}-\d{2}$/.test(t.due || "") ? t.due : null };
}
export async function updateTask(env, id, p) {
  const d = await brainDb(env), r = await d.prepare("SELECT * FROM brain_tasks WHERE id=?1").bind(id).first(); if (!r) return null;
  const st = ["todo", "doing", "done", "suggested"].indexOf(p.status) > -1 ? p.status : r.status, now = nowIso();
  await d.prepare("UPDATE brain_tasks SET title=?2, detail=?3, status=?4, priority=?5, project=?6, due=?7, updated_at=?8, done_at=?9 WHERE id=?1")
    .bind(id, p.title ? clip(clean(p.title, 200), 200) : r.title, p.detail != null ? clean(p.detail, 2000) : r.detail, st, PRIORITIES.indexOf(p.priority) > -1 ? p.priority : r.priority, p.project != null ? clip(clean(p.project, 80), 80) || null : r.project, p.due !== undefined ? (/^\d{4}-\d{2}-\d{2}$/.test(p.due || "") ? p.due : null) : r.due, now, st === "done" ? r.done_at || now : null).run();
  return await d.prepare("SELECT * FROM brain_tasks WHERE id=?1").bind(id).first();
}
export async function deleteTask(env, id) { const d = await brainDb(env), r = await d.prepare("SELECT id, title FROM brain_tasks WHERE id=?1").bind(id).first(); if (r) await d.prepare("DELETE FROM brain_tasks WHERE id=?1").bind(id).run(); return r; }
export async function listTasks(env, f) {
  f = f || {}; const d = await brainDb(env);
  return ((await d.prepare("SELECT * FROM brain_tasks WHERE (?1 IS NULL OR status=?1) AND (?2 IS NULL OR project=?2) AND (?3 = 1 OR status != 'done') ORDER BY CASE status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 WHEN 'suggested' THEN 2 ELSE 3 END, priority, created_at DESC LIMIT 300")
    .bind(f.status || null, f.project || null, f.all ? 1 : 0).all()).results || []);
}
export async function findTask(env, ref) {   // by id, or the best title match among open tasks
  const d = await brainDb(env); if (/^t_[a-z0-9]{10}$/.test(ref || "")) return await d.prepare("SELECT * FROM brain_tasks WHERE id=?1").bind(ref).first();
  const open = await listTasks(env, {}); let best = null, bs = 0; open.forEach((t) => { const s = overlap(ref, t.title); if (s > bs) { bs = s; best = t; } }); return bs >= 0.5 ? best : null;
}
export async function projects(env) {
  const d = await brainDb(env);
  const t = (await d.prepare("SELECT project, count(*) n, sum(status='done') done, sum(status!='done') open FROM brain_tasks WHERE project IS NOT NULL AND project != '' GROUP BY project").all()).results || [];
  const m = (await d.prepare("SELECT project, count(*) n FROM brain_memory WHERE project IS NOT NULL AND project != '' AND status='active' GROUP BY project").all()).results || [];
  const map = {}; t.forEach((x) => { map[x.project] = { project: x.project, tasks: x.n, done: x.done || 0, open: x.open || 0, memories: 0 }; });
  m.forEach((x) => { map[x.project] = map[x.project] || { project: x.project, tasks: 0, done: 0, open: 0, memories: 0 }; map[x.project].memories = x.n; });
  return Object.keys(map).map((k) => map[k]);
}

/* ---------------- documents: chunk by headings / paragraphs (~1,200 chars), keep versions by hash ---------------- */
export function chunk(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n"), out = []; let head = "", buf = "";
  const push = () => { if (buf.trim()) out.push({ heading: head, content: buf.trim() }); buf = ""; };
  for (const l of lines) {
    const h = /^(#{1,4})\s+(.+)$/.exec(l) || (/^[A-Z0-9][A-Z0-9 &/,:'-]{3,70}$/.test(l.trim()) && l.trim().split(" ").length <= 9 ? [0, 0, l.trim()] : null);
    if (h) { push(); head = clip(h[2], 120); continue; }
    if (buf.length + l.length > 1200 && buf.length > 300) push();
    buf += l + "\n";
  }
  push();
  return out.slice(0, 400);
}
export async function storeDoc(env, o) {
  const d = await brainDb(env), text = clean(o.text, 400000), hash = await sha(text), now = nowIso(), title = clip(clean(o.title || "Untitled document", 160), 160);
  const same = await d.prepare("SELECT id, version FROM brain_docs WHERE hash=?1").bind(hash).first();
  if (same) return { id: same.id, duplicate: true, version: same.version };
  const prev = await d.prepare("SELECT version FROM brain_docs WHERE title=?1 ORDER BY version DESC LIMIT 1").bind(title).first();
  const id = "d_" + rid(10), parts = chunk(text);
  await d.prepare("INSERT INTO brain_docs (id, title, kind, hash, version, size, summary, extracted, scope, project, created_at) VALUES (?1,?2,?3,?4,?5,?6,'','',?7,?8,?9)")
    .bind(id, title, clip(o.kind || "text", 20), hash, prev ? prev.version + 1 : 1, text.length, o.scope === "personal" ? "personal" : "fodo", clip(clean(o.project, 80), 80) || null, now).run();
  for (let i = 0; i < parts.length; i += 40) {
    const vecs = i < 120 ? await embedBatch(env, parts.slice(i, i + 40).map((c) => (c.heading ? c.heading + ". " : "") + c.content)) : [];   // first 120 sections get semantic vectors
    await d.batch(parts.slice(i, i + 40).map((c, k) => d.prepare("INSERT INTO brain_chunks (doc_id, n, heading, content, emb) VALUES (?1,?2,?3,?4,?5)").bind(id, i + k, c.heading, c.content, vecs[k] || null)));
  }
  return { id, title, version: prev ? prev.version + 1 : 1, chunks: parts.length, size: text.length };
}
/* vectorStore (v1 = keyword), same interface a Vectorize-backed store will have */
export const vectorStore = {
  async search(env, q, o) {
    o = o || {}; const d = await brainDb(env), w = words(q).slice(0, 12); if (!String(q || "").trim() && !o.docId) return [];
    const docs = o.docId ? [o.docId] : null;
    const rows = (await d.prepare("SELECT c.id, c.doc_id, c.n, c.heading, c.content, c.emb, b.title, b.created_at, b.version FROM brain_chunks c JOIN brain_docs b ON b.id = c.doc_id WHERE (?1 IS NULL OR c.doc_id = ?1) ORDER BY b.created_at DESC LIMIT 4000").bind(docs ? docs[0] : null).all()).results || [];
    const qv = rows.some((r) => r.emb) ? unpack(await embed(env, q) || "") : null;
    return rows.map((r) => { const t = (r.heading + " " + r.content).toLowerCase(), tt = (r.title || "").toLowerCase(), sim = qv && r.emb ? cosine(qv, unpack(r.emb)) : 0;
      return { r, s: w.reduce((a, x) => a + (t.indexOf(x) > -1 ? 1 : 0) + (tt.indexOf(x) > -1 ? 0.5 : 0), 0) + (sim > 0.45 ? (sim - 0.45) * 12 : 0) }; })
      .filter((x) => x.s > 0 || o.docId).sort((a, b) => b.s - a.s).slice(0, o.limit || 5).map((x) => { delete x.r.emb; return x.r; });
  },
  async upsert() { return { ok: false, reason: "vector index not configured (v1 uses keyword retrieval)" }; },
  async delete() { return { ok: true }; },
};
export async function listDocs(env) { const d = await brainDb(env); return ((await d.prepare("SELECT id, title, kind, version, size, summary, extracted, scope, project, created_at FROM brain_docs ORDER BY created_at DESC LIMIT 200").all()).results || []); }
export async function deleteDoc(env, id) { const d = await brainDb(env), r = await d.prepare("SELECT id, title FROM brain_docs WHERE id=?1").bind(id).first(); if (r) await d.batch([d.prepare("DELETE FROM brain_chunks WHERE doc_id=?1").bind(id), d.prepare("DELETE FROM brain_docs WHERE id=?1").bind(id)]); return r; }
