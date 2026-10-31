/* FODO BRAIN — media store for social posting. Files are kept BYTE-FOR-BYTE as uploaded (no resizing, no re-encoding), split
   into 4 MiB parts (the part size LinkedIn video upload expects; within X's 5 MB segment limit; a multiple of YouTube's 256 KiB).
   Storage: Cloudflare R2 when a MEDIA bucket is bound (wrangler.toml), otherwise the existing CHAT_KV namespace (free 1 GB;
   KV is eventually consistent, so URL-pulled posts (Instagram/Facebook) wait ~65 s after upload when KV is used).
   Platforms that pull a URL (Instagram, Facebook) read GET /api/owner-brain/m/<id>/<name> — public, unguessable 32-char id,
   Range requests supported, deleted 7 days after the post finishes. */
import { brainDb, nowIso, rid, clip, clean } from "./store.js";

export const PART = 4 * 1024 * 1024, MAX_BYTES = 300 * 1024 * 1024;
export const storeKind = (env) => (env.MEDIA && typeof env.MEDIA.put === "function" ? "r2" : env.CHAT_KV ? "kv" : null);
const key = (id, i) => "brain-media/" + id + "/" + i;
const ALLOWED = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|quicktime|webm))$/;

export async function create(env, f) {
  const kind = storeKind(env); if (!kind) throw new Error("No media storage: bind an R2 bucket called MEDIA, or keep the CHAT_KV namespace.");
  const size = +f.size || 0, mime = String(f.mime || "").toLowerCase();
  if (!ALLOWED.test(mime)) throw new Error("Only JPG, PNG, WebP, GIF images and MP4, MOV, WebM videos can be posted.");
  if (size <= 0 || size > MAX_BYTES) throw new Error("Files can be up to " + MAX_BYTES / 1048576 + " MB.");
  const d = await brainDb(env), id = rid(32), parts = Math.ceil(size / PART);
  await d.prepare("INSERT INTO brain_media (id, name, mime, size, parts, store, width, height, duration, variant_of, status, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'uploading',?11)")
    .bind(id, clip(clean(f.name, 120).replace(/[^\w.\- ]+/g, "_") || "file", 120), mime, size, parts, kind, +f.width || null, +f.height || null, +f.duration || null, f.variantOf || null, nowIso()).run();
  return { id, parts, partSize: PART, store: kind };
}
export async function get(env, id) { const d = await brainDb(env); return await d.prepare("SELECT * FROM brain_media WHERE id=?1").bind(String(id || "")).first(); }
export async function putPart(env, id, i, bytes) {
  const m = await get(env, id); if (!m) throw new Error("Upload not found."); if (m.status !== "uploading") throw new Error("This upload is already finished.");
  i = +i; if (!(i >= 0 && i < m.parts)) throw new Error("Bad part number.");
  const want = i < m.parts - 1 ? PART : m.size - PART * (m.parts - 1); if (bytes.byteLength !== want) throw new Error("Part " + i + " should be " + want + " bytes, got " + bytes.byteLength + ".");
  if (m.store === "r2") await env.MEDIA.put(key(id, i), bytes); else await env.CHAT_KV.put(key(id, i), bytes, { expirationTtl: 30 * 86400 });
  return { ok: true, part: i };
}
export async function finish(env, id) {
  const m = await get(env, id); if (!m) throw new Error("Upload not found.");
  const pre = "brain-media/" + id + "/", have = new Set();
  if (m.store === "r2") { const L = await env.MEDIA.list({ prefix: pre, limit: 1000 }); (L.objects || []).forEach((o) => have.add(o.key)); }
  else { const L = await env.CHAT_KV.list({ prefix: pre, limit: 1000 }); (L.keys || []).forEach((k) => have.add(k.name)); }
  for (let i = 0; i < m.parts; i++) if (!have.has(key(id, i))) throw new Error("Part " + (i + 1) + " of " + m.parts + " is missing — upload it again.");
  const d = await brainDb(env); await d.prepare("UPDATE brain_media SET status='ready', ready_at=?2 WHERE id=?1").bind(id, nowIso()).run();
  return { id, ready: true, url: null };
}
export async function readPart(env, m, i) {
  if (m.store === "r2") { const o = await env.MEDIA.get(key(m.id, i)); return o ? new Uint8Array(await o.arrayBuffer()) : null; }
  const v = await env.CHAT_KV.get(key(m.id, i), { type: "arrayBuffer" }); return v ? new Uint8Array(v) : null;
}
/* bytes [from, to] inclusive, assembled from the stored parts */
export async function readRange(env, m, from, to) {
  const out = new Uint8Array(to - from + 1); let o = 0;
  for (let i = Math.floor(from / PART); i <= Math.floor(to / PART); i++) { const p = await readPart(env, m, i); if (!p) throw new Error("Media part " + i + " is missing."); const s = Math.max(0, from - i * PART), e = Math.min(p.length - 1, to - i * PART); out.set(p.subarray(s, e + 1), o); o += e - s + 1; }
  return out;
}
export async function readAll(env, m) { return readRange(env, m, 0, m.size - 1); }
/* the public URL a platform downloads from */
export const publicUrl = (origin, m) => origin + "/api/owner-brain/m/" + m.id + "/" + encodeURIComponent(m.name);
/* KV needs ~60 s before a brand-new key is readable everywhere */
export const pullReadyIn = (m) => (m.store === "kv" ? Math.max(0, Date.parse(m.ready_at || m.created_at) + 65e3 - Date.now()) : 0);

/* GET /api/owner-brain/m/<id>/<name> — public download (Range supported) */
export async function serve(env, request, id) {
  const m = await get(env, id); if (!m || m.status !== "ready" || !/^[a-z0-9]{32}$/.test(id)) return new Response("Not found", { status: 404 });
  const h = { "content-type": m.mime, "accept-ranges": "bytes", "cache-control": "private, max-age=3600", "x-robots-tag": "noindex", "content-disposition": "inline; filename=\"" + m.name.replace(/"/g, "") + "\"" };
  let from = 0, to = m.size - 1, status = 200; const rg = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") || "");
  if (rg) { if (rg[1] === "") { from = Math.max(0, m.size - +rg[2]); } else { from = +rg[1]; if (rg[2] !== "") to = Math.min(+rg[2], m.size - 1); } if (from > to || from >= m.size) return new Response(null, { status: 416, headers: { "content-range": "bytes */" + m.size } }); status = 206; h["content-range"] = "bytes " + from + "-" + to + "/" + m.size; }
  h["content-length"] = String(to - from + 1);
  if (request.method === "HEAD") return new Response(null, { status, headers: h });
  const FL = typeof FixedLengthStream === "function" ? new FixedLengthStream(to - from + 1) : new TransformStream(), w = FL.writable.getWriter();
  (async () => { try { for (let i = Math.floor(from / PART); i <= Math.floor(to / PART); i++) { const p = await readPart(env, m, i); const s = Math.max(0, from - i * PART), e = Math.min(p.length - 1, to - i * PART); await w.write(p.subarray(s, e + 1)); } await w.close(); } catch (e) { try { await w.abort(e); } catch (x) {} } })();
  return new Response(FL.readable, { status, headers: h });
}
export async function remove(env, m) {
  for (let i = 0; i < m.parts; i++) { try { if (m.store === "r2") await env.MEDIA.delete(key(m.id, i)); else await env.CHAT_KV.delete(key(m.id, i)); } catch (e) {} }
  const d = await brainDb(env); await d.prepare("DELETE FROM brain_media WHERE id=?1").bind(m.id).run();
}
/* housekeeping (tick): delete media of posts finished > 7 days ago and abandoned uploads > 2 days */
export async function cleanup(env) {
  const d = await brainDb(env), old = new Date(Date.now() - 7 * 864e5).toISOString(), stale = new Date(Date.now() - 2 * 864e5).toISOString();
  const L = (await d.prepare("SELECT * FROM brain_media WHERE (status='uploading' AND created_at < ?2) OR (status='ready' AND created_at < ?1 AND id NOT IN (SELECT value FROM brain_social_posts, json_each(brain_social_posts.media) WHERE brain_social_posts.status IN ('scheduled','publishing'))) LIMIT 20").bind(old, stale).all().catch(() => ({ results: [] }))).results || [];
  for (const m of L) await remove(env, m);
  return { removed: L.length };
}
