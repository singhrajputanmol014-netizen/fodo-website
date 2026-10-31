/* FODO Competitor Finder — download hand-off for phones and in-app browsers (v11).
 * Many phone browsers (Instagram, Facebook, LinkedIn in-app browsers, some Android webviews) silently ignore downloads of
 * files made inside the page (blob: links). A normal web download always works. So the page uploads the finished file here
 * and then opens a one-time link to it:
 *   POST /api/export   headers: x-file-name, content-type   body: the file bytes (≤ 20 MB)  → { ok, url }
 *   GET  /api/export?id=…   → the file, as an attachment (kept for 15 minutes)
 * The bytes are stored in KV untouched (no CPU spent) and expire on their own. Nothing else is kept. */
import { json, limited } from "../_lib/finder-common.js";

const TYPES = { "text/csv": ".csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx", "text/tab-separated-values": ".tsv", "application/pdf": ".pdf", "application/json": ".json" };

export async function onRequestPost({ request, env }) {
  const kv = env.CHAT_KV; if (!kv) return json({ ok: false, reason: "Download service not available." }, 503);
  const type = String(request.headers.get("content-type") || "").split(";")[0].trim();
  if (!TYPES[type]) return json({ ok: false, reason: "Unsupported file type." }, 415);
  const len = +request.headers.get("content-length") || 0; if (len > 20e6) return json({ ok: false, reason: "File too large." }, 413);
  if (await limited(env, request, "exp", parseInt(env.EXPORT_PER_HOUR || "40", 10))) return json({ ok: false, reason: "Too many downloads this hour." }, 429);
  const buf = await request.arrayBuffer(); if (!buf.byteLength || buf.byteLength > 20e6) return json({ ok: false, reason: "Empty or too large." }, 413);
  let name = String(request.headers.get("x-file-name") || "FODO-competitors").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80);
  if (!name.endsWith(TYPES[type])) name = name.replace(/\.[a-z]+$/i, "") + TYPES[type];
  const id = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
  await kv.put("exp:" + id, buf, { expirationTtl: 900, metadata: { name, type } });
  return json({ ok: true, url: "/api/export?id=" + id, name });
}
export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get("id") || "", kv = env.CHAT_KV;
  if (!/^[a-f0-9]{24}$/.test(id) || !kv) return new Response("This download link has expired. Go back and press Download again.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const hit = await kv.getWithMetadata("exp:" + id, "arrayBuffer");
  if (!hit || !hit.value) return new Response("This download link has expired. Go back and press Download again.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const m = hit.metadata || {};
  return new Response(hit.value, { headers: { "content-type": (m.type || "application/octet-stream") + (/^text/.test(m.type) ? "; charset=utf-8" : ""), "content-disposition": `attachment; filename="${m.name || "FODO-competitors"}"`, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
