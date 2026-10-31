/* FODO OWNER BRAIN — model router.
   kind "fast"  (classification, extraction, short JSON)  → small/cheap models first
   kind "deep"  (answers, analysis, strategy)             → strongest models first
   Order: the owner's preferred provider (Brain settings) → Workers AI → Groq → Gemini → throws (the orchestrator then answers in
   "degraded mode" straight from the tool data — it never pretends an AI answer happened).
   Every call is logged in api_usage (provider, model, purpose, latency, tokens) → Admin → Costs and the Brain's own analytics. */
import { groqChat, GEMINI_MODELS } from "../aivis.js";
import { logUsage } from "../usage.js";
import { outbound } from "../xray-core.js";

const WAI = { deep: ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct"], fast: ["@cf/meta/llama-3.1-8b-instruct", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"] };
const race = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("timeout")), ms))]);
const toks = (s) => Math.round(String(s || "").length / 4);

async function workersAi(env, messages, kind, max, temp) {
  if (!env.AI) throw new Error("Workers AI not bound");
  let last;
  for (const m of WAI[kind] || WAI.deep) {
    try { const r = await race(env.AI.run(m, { messages, max_tokens: max, temperature: temp }), kind === "fast" ? 20000 : 40000);
      const t = typeof r === "string" ? r : r && (r.response || (r.result && r.result.response)) || ""; if (t) return { text: typeof t === "string" ? t : JSON.stringify(t), model: m };
      last = new Error("empty answer"); }
    catch (e) { last = e; if (/4006|daily free allocation|neurons/i.test(String(e && e.message))) break; }
  }
  throw last || new Error("no answer");
}
async function gemini(env, messages, max, temp, code) {
  if (!env.GEMINI_API_KEY) throw new Error("no GEMINI_API_KEY");
  const sys = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: String(m.content) }] }));
  let last;
  for (const model of [code ? env.GEMINI_CODE_MODEL : null, env.GEMINI_MODEL].filter(Boolean).concat(GEMINI_MODELS)) {
    const r = await outbound(env)("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", { method: "POST", headers: { "x-goog-api-key": env.GEMINI_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ contents, systemInstruction: sys ? { parts: [{ text: sys }] } : undefined, generationConfig: { maxOutputTokens: max, temperature: temp } }), signal: AbortSignal.timeout(code ? 100000 : 40000) });
    if (!r.ok) { last = new Error("gemini " + r.status); if (r.status === 404) continue; throw last; }
    const j = await r.json(), c = (j.candidates || [])[0] || {}, t = ((c.content || {}).parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
    if (t) return { text: t, model: model }; last = new Error("gemini: empty answer");
  }
  throw last || new Error("gemini: no model");
}
export function availableProviders(env) { return { "workers-ai": !!env.AI, groq: !!env.GROQ_API_KEY, gemini: !!env.GEMINI_API_KEY }; }

/* → { text, provider, model, ms, fallback, tried } — throws { detail } when every provider failed */
export async function brainAI(env, o) {
  // kind "code" (v27 Website Engineer): the strongest code model first — Gemini (free key), then Groq, then Workers AI; long outputs
  const code = o.kind === "code", kind = o.kind === "fast" ? "fast" : "deep", max = o.max || (code ? 6000 : kind === "fast" ? 500 : 1100), temp = o.json ? 0.1 : o.temp != null ? o.temp : 0.35;
  const avail = availableProviders(env), base = code ? ["gemini", "groq", "workers-ai"] : ["workers-ai", "groq", "gemini"], pref = !code && o.provider && o.provider !== "auto" ? o.provider : null;
  const order = (pref ? [pref] : []).concat(base.filter((p) => p !== pref)).filter((p) => avail[p]);
  const tried = [];
  for (const p of order) {
    const t0 = Date.now();
    try {
      const r = p === "workers-ai" ? await workersAi(env, o.messages, kind, max, temp) : p === "groq" ? await groqChat(env, o.messages, max, code ? 90000 : kind === "fast" ? 20000 : 40000) : await gemini(env, o.messages, max, temp, code);
      const ms = Date.now() - t0;
      await logUsage(env, { provider: p === "groq" ? "groq" : p, endpoint: "brain", tool: ("brain:" + (o.purpose || kind) + " · " + String(r.model).split("/").pop()).slice(0, 160), status: 200, ms, units: toks(JSON.stringify(o.messages)) + toks(r.text) });
      return { text: r.text, provider: p, model: String(r.model).replace(/^groq\//, ""), ms, fallback: tried.length > 0, tried };
    } catch (e) {
      tried.push(p + ": " + String(e && (e.detail || e.message) || e).slice(0, 90));
      await logUsage(env, { provider: p, endpoint: "brain", tool: ("error · brain:" + (o.purpose || kind) + " · " + tried[tried.length - 1]).slice(0, 160), status: e.status || 0, ok: false, ms: Date.now() - t0 });
    }
  }
  throw Object.assign(new Error("no AI provider answered"), { detail: tried.join("; ") || "no AI provider connected", tried });
}
/* ask for JSON, tolerate fences and chatter around it */
export function parseJson(t) {
  if (!t) return null; t = String(t).replace(/```(?:json)?/gi, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}"); if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { try { return JSON.parse(t.slice(a, b + 1).replace(/,\s*([}\]])/g, "$1")); } catch (x) { return null; } }
}
