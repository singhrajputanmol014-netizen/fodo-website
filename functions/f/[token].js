/* FODO v55.15 shared outreach file: /f/<token> (a PDF or file the FODO team attached to a WhatsApp / Instagram / LinkedIn message).
   Unguessable 22-character link, expires after 180 days. PDFs and images open in the browser; every other type downloads. No scripts. */
import { sharedFile } from "../_lib/leadintel.js";
const INLINE = /^(application\/pdf|image\/(png|jpeg|webp|gif))$/i;
export async function onRequest({ request, env, params }) {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  let f = null; try { f = await sharedFile(env, params.token); } catch (e) { f = null; }
  if (!f) return new Response("This file link has expired or does not exist. Please ask FODO for a new one: https://www.fodo.co.in", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  let bytes;   // native decoder when the runtime has it (fast for 10 MB PDFs), else the portable loop
  if (typeof Uint8Array.fromBase64 === "function") bytes = Uint8Array.fromBase64(f.b64);
  else { const bin = atob(f.b64); bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); }
  const inline = INLINE.test(f.mime || ""), name = String(f.name || "file").replace(/[^\w.\- ()]+/g, "_").slice(0, 120);
  const RES = new Response(request.method === "HEAD" ? null : bytes, { headers: {
    "content-type": inline ? f.mime : "application/octet-stream",
    "content-disposition": (inline ? "inline" : "attachment") + '; filename="' + name + '"',
    "content-length": String(bytes.length), "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow" } });   // Chrome's PDF viewer does not open under a sandbox CSP, so the lock-down below skips PDFs
  if (!/pdf/i.test(f.mime || "")) RES.headers.set("content-security-policy", "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  return RES;
}
