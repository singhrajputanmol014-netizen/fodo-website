/* FODO OWNER BRAIN, semantic memory with Workers AI embeddings (@cf/baai/bge-m3, multilingual: English, Hindi, Hinglish).
   Vectors are stored next to the rows in D1 (base64 Float32), no new binding. Retrieval = keyword score + cosine similarity.
   Every call is best-effort: without the AI binding the Brain falls back to keyword retrieval. */
import { logUsage } from "../usage.js";
const MODEL = "@cf/baai/bge-m3";
const pack = (arr) => { const f = new Float32Array(arr), u = new Uint8Array(f.buffer); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
export const unpack = (b64) => { try { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new Float32Array(u.buffer); } catch (e) { return null; } };
export function cosine(a, b) { if (!a || !b || a.length !== b.length) return 0; let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return x && y ? d / Math.sqrt(x * y) : 0; }
/* texts → array of base64 vectors (null where it failed) */
export async function embedBatch(env, texts) {
  if (!env || !env.AI || !texts.length) return texts.map(() => null);
  try {
    const t0 = Date.now(), r = await Promise.race([env.AI.run(MODEL, { text: texts.map((t) => String(t || " ").slice(0, 2000)), truncate_inputs: true }), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 15000))]);
    const data = r && Array.isArray(r.data) ? r.data : null; if (!data) return texts.map(() => null);
    await logUsage(env, { provider: "workers-ai", endpoint: "brain", tool: "brain:embed · bge-m3", status: 200, ms: Date.now() - t0, units: texts.reduce((s, t) => s + String(t).length / 4, 0) | 0 });
    return data.map((v) => (Array.isArray(v) ? pack(v) : null));
  } catch (e) { return texts.map(() => null); }
}
export async function embed(env, text) { return (await embedBatch(env, [text]))[0]; }
