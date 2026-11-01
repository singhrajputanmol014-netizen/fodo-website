/* FODO v43 private files: project files, deliverables (with versions) and personal files for the FODO Workspace.
   Storage: a PRIVATE Cloudflare R2 bucket bound as FILES (wrangler.toml) when connected, otherwise CHAT_KV (smaller limits).
   Rules (all enforced here, on the server):
   - a file is never public: there is no public URL, every download checks the session and the permission again;
   - project files: only that project's client, its professional, and FODO staff (admin / moderator / finance, read-only);
   - personal files: only their owner;
   - the type is decided from the file's bytes (magic numbers), never from the name or the browser; no SVG / HTML / scripts;
   - downloads are sent with nosniff, a sandbox CSP, no-store and attachment (inline only for images, PDF, audio and video);
   - files linked to approved work or to a disputed project can't be deleted (they are the evidence);
   - per-user storage quota, per-file size limit, upload / download / delete are audited. */
import { nowIso, randId, isOwner } from "./accounts.js";
import { bdb, can, err, auditLog, notify, projectFor } from "./biz.js";

export const LIMITS = { r2: { file: 95 * 1048576, quota: 2048 * 1048576 }, kv: { file: 10 * 1048576, quota: 100 * 1048576 } };
export const storeKind = (env) => (env.FILES && typeof env.FILES.put === "function" ? "r2" : env.CHAT_KV ? "kv" : null);
export const KINDS = ["file", "deliverable", "brief", "contract", "brand"];
const okey = (id) => "biz-files/" + id;
const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const all = async (d, sql, ...a) => (await d.prepare(sql).bind(...a).all()).results || [];
const one = (d, sql, ...a) => d.prepare(sql).bind(...a).first();
const run = (d, sql, ...a) => d.prepare(sql).bind(...a).run();

const DDL = [
  "CREATE TABLE IF NOT EXISTS biz_files (id TEXT PRIMARY KEY, owner_id TEXT, project_id TEXT, milestone_id TEXT, name TEXT, mime TEXT, ext TEXT, size INTEGER, sha256 TEXT, store TEXT, kind TEXT, grp TEXT, ver INTEGER, note TEXT, created_at TEXT, deleted_at TEXT, deleted_by TEXT)",
  "CREATE INDEX IF NOT EXISTS biz_files_p ON biz_files(project_id, created_at)",
  "CREATE INDEX IF NOT EXISTS biz_files_o ON biz_files(owner_id, created_at)",
  "CREATE INDEX IF NOT EXISTS biz_files_g ON biz_files(grp, ver)",
];
const ready = new WeakSet();
export async function fdb(env) { const d = await bdb(env); if (!ready.has(d)) { for (const q of DDL) await d.prepare(q).run(); ready.add(d); } return d; }

/* ---------- type detection from the bytes ---------- */
export const TYPES = {
  jpg: ["image/jpeg", "Image"], jpeg: ["image/jpeg", "Image"], png: ["image/png", "Image"], gif: ["image/gif", "Image"], webp: ["image/webp", "Image"],
  pdf: ["application/pdf", "PDF"], ai: ["application/pdf", "Illustrator (PDF)"], psd: ["image/vnd.adobe.photoshop", "Photoshop"],
  mp4: ["video/mp4", "Video"], mov: ["video/quicktime", "Video"], m4v: ["video/mp4", "Video"], webm: ["video/webm", "Video"], mp3: ["audio/mpeg", "Audio"], m4a: ["audio/mp4", "Audio"], wav: ["audio/wav", "Audio"],
  zip: ["application/zip", "ZIP"], docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Word"], xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Excel"], pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "PowerPoint"],
  txt: ["text/plain; charset=utf-8", "Text"], csv: ["text/csv; charset=utf-8", "CSV"], srt: ["text/plain; charset=utf-8", "Subtitles"],
};
const at = (b, i, s) => { for (let k = 0; k < s.length; k++) if (b[i + k] !== s.charCodeAt(k)) return false; return true; };
/* which family the bytes really are; null = not allowed */
export function sniff(b) {
  if (!b || b.length < 4) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x89 && at(b, 1, "PNG")) return "png";
  if (at(b, 0, "GIF8")) return "gif";
  if (at(b, 0, "RIFF") && at(b, 8, "WEBP")) return "webp";
  if (at(b, 0, "RIFF") && at(b, 8, "WAVE")) return "wav";
  if (at(b, 0, "%PDF-")) return "pdf";
  if (at(b, 0, "8BPS")) return "psd";
  if (at(b, 4, "ftyp")) return "iso";   // mp4 / mov / m4v / m4a
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "webm";
  if (at(b, 0, "ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return "mp3";
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return "zip";   // zip / docx / xlsx / pptx
  /* plain text: no NUL, valid UTF-8, and nothing a browser could run */
  const head = b.subarray(0, Math.min(b.length, 8192)); if (head.indexOf(0) > -1) return null;
  let s; try { s = new TextDecoder("utf-8", { fatal: true }).decode(head); } catch (e) { return null; }
  if (/<\s*(script|html|svg|iframe|object|embed|meta|body)\b|<\?xml|javascript:/i.test(s)) return null;
  return "text";
}
const FAMILY = { jpg: ["jpg", "jpeg"], png: ["png"], gif: ["gif"], webp: ["webp"], wav: ["wav"], pdf: ["pdf", "ai"], psd: ["psd"], iso: ["mp4", "mov", "m4v", "m4a"], webm: ["webm"], mp3: ["mp3"], zip: ["zip", "docx", "xlsx", "pptx"], text: ["txt", "csv", "srt"] };
/* the stored type: the name's extension, but only if the bytes really are that kind of file */
export function typeOf(name, bytes) {
  const ext = (/\.([a-z0-9]{1,5})$/i.exec(name || "") || [])[1], e = ext ? ext.toLowerCase() : "", fam = sniff(bytes);
  if (!fam) return null; const L = FAMILY[fam]; const pick = L.indexOf(e) > -1 ? e : L[0];
  return { ext: pick, mime: TYPES[pick][0], label: TYPES[pick][1] };
}
export const cleanName = (n, ext) => { let s = clip(n, 140).replace(/[\\/:*?"<>|]+/g, "_").replace(/^\.+/, "").replace(/\s+/g, " "); s = s.replace(/\.[a-z0-9]{1,5}$/i, ""); return (s || "file").slice(0, 120) + "." + ext; };
const INLINE = /^(image\/(jpeg|png|gif|webp)|application\/pdf|video\/|audio\/)/;

/* ---------- permissions ---------- */
async function roleOn(env, u, R, f) {
  if (f.project_id) { try { const { side, pj } = await projectFor(env, u, f.project_id, R); return { side, pj }; } catch (e) { return null; } }
  return f.owner_id === u.id ? { side: "owner" } : null;
}
async function fileFor(env, u, R, id) {
  const d = await fdb(env), f = await one(d, "SELECT * FROM biz_files WHERE id=?1", clip(id, 40)); if (!f || f.deleted_at) throw err("File not found.", 404);
  const r = await roleOn(env, u, R, f); if (!r) throw err("File not found.", 404); return { d, f, side: r.side, pj: r.pj };
}

/* ---------- storage ---------- */
export async function storage(env, u) {
  const kind = storeKind(env), d = await fdb(env), used = ((await one(d, "SELECT COALESCE(SUM(size),0) n FROM biz_files WHERE owner_id=?1 AND deleted_at IS NULL", u.id)) || {}).n || 0;
  const L = kind ? LIMITS[kind] : { file: 0, quota: 0 }, quota = isOwner(u) ? L.quota * 5 : L.quota;
  return { store: kind, connected: kind === "r2", maxFile: L.file, quota, used, note: kind === "r2" ? "Private Cloudflare R2 storage." : kind === "kv" ? (isOwner(u) ? "Small-file storage. Connect a private R2 bucket (binding FILES) for files up to 95 MB." : "Bigger files (up to 95 MB) will be possible once FODO switches on full storage.") : "No file storage connected." };
}
async function putObj(env, kind, id, bytes) { if (kind === "r2") await env.FILES.put(okey(id), bytes, { httpMetadata: { contentType: "application/octet-stream" } }); else await env.CHAT_KV.put(okey(id), bytes); }
async function delObj(env, f) { try { if (f.store === "r2") await env.FILES.delete(okey(f.id)); else await env.CHAT_KV.delete(okey(f.id)); } catch (e) {} }

/* ---------- upload: q = { project, milestone, kind, replaces, name, note } ---------- */
export async function upload(env, u, R, q, bytes) {
  const kind = storeKind(env); if (!kind) throw err("File storage isn't connected yet.", 503);
  const st = await storage(env, u); if (!bytes || !bytes.byteLength) throw err("The file is empty.");
  if (bytes.byteLength > st.maxFile) throw err("Files can be up to " + Math.round(st.maxFile / 1048576) + " MB" + (kind === "kv" ? " until private R2 storage is connected." : "."), 413);
  if (st.used + bytes.byteLength > st.quota) throw err("Your file storage is full (" + Math.round(st.quota / 1048576) + " MB). Delete old files first.", 413);
  const b = new Uint8Array(bytes), t = typeOf(q.name, b); if (!t) throw err("This file type isn't allowed. Use images, PDF, video, audio, ZIP, Word, Excel, PowerPoint or plain text (no SVG, HTML or scripts).", 415);
  const d = await fdb(env); let fk = KINDS.indexOf(q.kind) > -1 ? q.kind : "file", projectId = null, milestoneId = null, side = "owner", pj = null, grp = null, ver = 1;
  if (q.project) { const P = await projectFor(env, u, clip(q.project, 40), R); side = P.side; pj = P.pj; projectId = pj.id;
    if (side === "staff") throw err("FODO staff can read project files but not add them.", 403);
    if (["cancelled", "completed"].indexOf(pj.status) > -1) throw err("This project is " + pj.status + ", files can't be added.", 409);
    if (fk === "deliverable" && side !== "pro") throw err("Only the professional uploads deliverables.", 403);
    if (q.milestone) { const m = await one(d, "SELECT id, status FROM biz_milestones WHERE id=?1 AND project_id=?2", clip(q.milestone, 40), projectId); if (!m) throw err("That milestone isn't in this project.", 404); if (m.status === "approved") throw err("This milestone is already approved.", 409); milestoneId = m.id; }
  } else if (fk === "deliverable") fk = "file";
  if (q.replaces) { const o = await one(d, "SELECT * FROM biz_files WHERE id=?1 AND deleted_at IS NULL", clip(q.replaces, 40)); if (!o || (o.project_id || null) !== projectId || (!projectId && o.owner_id !== u.id)) throw err("The file to replace wasn't found.", 404);
    if (o.owner_id !== u.id) throw err("Only the person who uploaded a file can add a new version.", 403); grp = o.grp; ver = ((await one(d, "SELECT MAX(ver) v FROM biz_files WHERE grp=?1", o.grp)) || {}).v + 1 || 2; fk = o.kind; milestoneId = milestoneId || o.milestone_id; }
  const n24 = ((await one(d, "SELECT count(*) n FROM biz_files WHERE owner_id=?1 AND created_at >= ?2", u.id, new Date(Date.now() - 864e5).toISOString())) || {}).n || 0; if (n24 >= 300) throw err("Too many uploads today.", 429);
  const id = "fl" + randId(22), sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", b))].map((x) => x.toString(16).padStart(2, "0")).join(""), name = cleanName(q.name, t.ext);
  await putObj(env, kind, id, b);
  await run(d, "INSERT INTO biz_files (id, owner_id, project_id, milestone_id, name, mime, ext, size, sha256, store, kind, grp, ver, note, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
    id, u.id, projectId, milestoneId, name, t.mime, t.ext, b.byteLength, sha, kind, fk, grp || id, ver, clip(q.note, 300) || null, nowIso());
  await auditLog(env, u.email, "file:upload", id, (projectId || "personal") + " " + name + " " + b.byteLength);
  if (pj) { const other = side === "client" ? (await one(d, "SELECT user_id FROM biz_pros WHERE id=?1", pj.pro_id) || {}).user_id : pj.client_id; await notify(env, other, "file", (fk === "deliverable" ? "Deliverable uploaded: " : ver > 1 ? "New version: " : "New file: ") + name + " · " + pj.title, "#project=" + pj.id); }
  return { file: out(await one(d, "SELECT * FROM biz_files WHERE id=?1", id), u, side) };
}

/* what the browser sees: never the storage key, the hash only shortened */
export function out(f, u, side) {
  return { id: f.id, name: f.name, size: f.size, type: (TYPES[f.ext] || ["", "File"])[1], ext: f.ext, kind: f.kind, ver: f.ver, grp: f.grp, note: f.note || "", milestoneId: f.milestone_id || null, projectId: f.project_id || null, created_at: f.created_at,
    mine: f.owner_id === u.id, inline: INLINE.test(f.mime), sha: String(f.sha256 || "").slice(0, 12) };
}
/* project files (all versions, newest first) or my personal files */
export async function list(env, u, R, q) {
  const d = await fdb(env);
  if (q.project) { const P = await projectFor(env, u, clip(q.project, 40), R); const rows = await all(d, "SELECT f.*, CASE WHEN f.owner_id=?2 THEN 'client' ELSE 'pro' END AS who FROM biz_files f WHERE project_id=?1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 500", P.pj.id, P.pj.client_id);
    return { side: P.side, files: rows.map((f) => Object.assign(out(f, u, P.side), { who: f.who })), canUpload: P.side !== "staff" && ["cancelled", "completed"].indexOf(P.pj.status) < 0, storage: await storage(env, u) }; }
  const mine = await all(d, "SELECT * FROM biz_files WHERE owner_id=?1 AND project_id IS NULL AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 500", u.id);
  const pro = await one(d, "SELECT id FROM biz_pros WHERE user_id=?1", u.id);
  const proj = await all(d, "SELECT f.*, j.title AS project_title FROM biz_files f JOIN biz_projects j ON j.id=f.project_id WHERE f.deleted_at IS NULL AND (j.client_id=?1 OR j.pro_id=?2) ORDER BY f.created_at DESC LIMIT 300", u.id, pro ? pro.id : "-");
  return { files: mine.map((f) => out(f, u, "owner")), projectFiles: proj.map((f) => Object.assign(out(f, u, ""), { projectTitle: f.project_title })), storage: await storage(env, u) };
}

/* ---------- download (permission checked on every request) ---------- */
export async function download(env, request, u, R, id, inline) {
  const { f, side } = await fileFor(env, u, R, id);
  const show = inline && INLINE.test(f.mime), h = { "content-type": f.mime, "x-content-type-options": "nosniff", "cache-control": "private, no-store", "referrer-policy": "no-referrer", "cross-origin-resource-policy": "same-origin", "x-robots-tag": "noindex, nofollow",
    /* PDFs: no CSP sandbox (Chrome's PDF viewer refuses to open sandboxed PDFs; the viewer runs PDFs in its own sandbox) */
    "content-security-policy": "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'" + (f.mime === "application/pdf" ? "" : "; sandbox"), "content-disposition": (show ? "inline" : "attachment") + "; filename=\"" + f.name.replace(/["\\]/g, "_") + "\"; filename*=UTF-8''" + encodeURIComponent(f.name), "accept-ranges": f.store === "r2" ? "bytes" : "none" };
  if (side === "staff") await auditLog(env, u.email, "file:staff-download", f.id, f.project_id || "");
  if (f.store === "r2") {
    const rg = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") || ""); let range;
    if (rg && (rg[1] !== "" || rg[2] !== "")) { const from = rg[1] === "" ? Math.max(0, f.size - +rg[2]) : +rg[1], to = rg[1] === "" || rg[2] === "" ? f.size - 1 : Math.min(+rg[2], f.size - 1); if (from > to || from >= f.size) return new Response(null, { status: 416, headers: { "content-range": "bytes */" + f.size } }); range = { offset: from, length: to - from + 1 }; h["content-range"] = "bytes " + from + "-" + to + "/" + f.size; }
    const o = await env.FILES.get(okey(f.id), range ? { range } : undefined); if (!o) throw err("The stored file is missing. Ask the uploader to add it again.", 410);
    h["content-length"] = String(range ? range.length : f.size); return new Response(request.method === "HEAD" ? null : o.body, { status: range ? 206 : 200, headers: h });
  }
  const v = await env.CHAT_KV.get(okey(f.id), { type: "arrayBuffer" }); if (!v) throw err("The stored file is missing. Ask the uploader to add it again.", 410);
  h["content-length"] = String(v.byteLength); return new Response(request.method === "HEAD" ? null : v, { status: 200, headers: h });
}

/* ---------- delete: the uploader (or a FODO admin); evidence is kept ---------- */
export async function remove(env, u, R, id) {
  const { d, f, pj } = await fileFor(env, u, R, id), admin = can(R, ["admin"]);
  if (f.owner_id !== u.id && !admin) throw err("Only the person who uploaded a file can delete it.", 403);
  if (pj && pj.status === "disputed" && !admin) throw err("This project has an open dispute, its files are kept as evidence.", 409);
  if (f.milestone_id && !admin) { const m = await one(d, "SELECT status FROM biz_milestones WHERE id=?1", f.milestone_id); if (m && m.status === "approved") throw err("This file belongs to approved work and is kept.", 409); if (m && m.status === "submitted") throw err("This file is under review by the client. Wait for their answer.", 409); }
  const r = await run(d, "UPDATE biz_files SET deleted_at=?2, deleted_by=?3 WHERE id=?1 AND deleted_at IS NULL", f.id, nowIso(), u.email); if (!r.meta.changes) throw err("File not found.", 404);
  await delObj(env, f); await auditLog(env, u.email, "file:delete", f.id, (f.project_id || "personal") + " " + f.name);
  return { ok: true };
}

/* milestone submit: link the pro's uploaded files to the milestone (they must be theirs and in this project) */
export async function attach(env, u, projectId, milestoneId, ids) {
  const d = await fdb(env), L = (Array.isArray(ids) ? ids : []).slice(0, 30).map((x) => clip(x, 40)).filter(Boolean); let n = 0;
  for (const id of L) { const r = await run(d, "UPDATE biz_files SET milestone_id=?3, kind='deliverable' WHERE id=?1 AND project_id=?2 AND owner_id=?4 AND deleted_at IS NULL", id, projectId, milestoneId, u.id); n += r.meta.changes || 0; }
  return n;
}
/* for getProject: file counts per milestone */
export async function projectFiles(env, projectId) { const d = await fdb(env); return all(d, "SELECT id, name, ext, size, kind, ver, milestone_id, created_at FROM biz_files WHERE project_id=?1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 200", projectId); }
