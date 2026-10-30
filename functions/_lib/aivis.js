/* FODO Growth Lab v17 — AI Visibility engines (prompt §37–38, §69 AIProvider interface).
   Each engine answers the same buyer questions; the browser then checks whether the business and its competitors are named.
   Engines (each optional; a missing key = that engine is simply not run, never faked):
     workers-ai → Cloudflare Workers AI (binding AI) — open Llama model, answers from what it learned in training
     groq       → Groq free tier (secret GROQ_API_KEY; model GROQ_MODEL, else the GROQ_MODELS chain below) — open model, no live web
     gemini     → Google Gemini API (secret GEMINI_API_KEY; model GEMINI_MODEL, else the GEMINI_MODELS chain) WITH Google Search grounding:
                  answers from live Google results and lists the pages it used (citations). If grounding is refused on the
                  key's tier, it retries once without grounding and says so ("grounded": false).
   None of these is ChatGPT, Perplexity or Google AI Overviews — the report says exactly which engine was asked. */
import { outbound } from "./xray-core.js";

/* v17.1: providers retire model ids (Groq shut llama-3.3-70b-versatile on 16 Aug 2026; older Gemini ids return 404).
   Each engine now walks a chain: the model set in Cloudflare (GROQ_MODEL / GEMINI_MODEL) first, then current defaults.
   A 404 / "model not found / decommissioned" moves to the next id; the id that worked is remembered for this server instance. */
export const GROQ_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b", "llama-3.1-8b-instant"];
export const GEMINI_MODELS = ["gemini-flash-latest", "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
const good = { groq: null, gemini: null };
const chain = (env, k, list) => { const own = String(env[k] || "").trim(); const c = (own ? [own] : []).concat(list); const g = good[k === "GROQ_MODEL" ? "groq" : "gemini"]; return Array.from(new Set(g ? [g].concat(c) : c)); };
const modelGone = (status, text) => status === 404 || ((status === 400 || status === 403) && /model[^"]{0,80}(not found|not exist|decommission|deprecat|no longer|not supported|does not have access)/i.test(text || ""));
export function _resetModels() { good.groq = null; good.gemini = null; }

const SYS = "You are a helpful assistant. Answer the user's question directly. When recommending businesses, name specific real businesses and their websites if you know them.";
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").replace(/[<>]/g, "").trim().slice(0, n);

export function engines(env, tools) {
  const on = (k) => !tools || tools(k);
  const list = [];
  if (env.AI) list.push({ id: "workers-ai", name: "Llama on Cloudflare Workers AI", live: false });
  if (env.GROQ_API_KEY && on("aiGroq")) list.push({ id: "groq", name: "Llama on Groq", live: false });
  if (env.GEMINI_API_KEY && on("aiGemini")) list.push({ id: "gemini", name: "Gemini + Google Search", live: true });
  return list;
}

async function groq(env, q, sys) {
  let last;
  for (const model of chain(env, "GROQ_MODEL", GROQ_MODELS)) {
    const body = { model, messages: [{ role: "system", content: sys || SYS }, { role: "user", content: q }], max_tokens: 1200, temperature: 0.2 };
    if (/^openai\/gpt-oss/.test(model)) { body.reasoning_effort = "low"; body.include_reasoning = false; }   // reasoning models: keep the tokens for the answer
    const r = await outbound(env)("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { authorization: "Bearer " + env.GROQ_API_KEY, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    if (!r.ok) { const t = await r.text().catch(() => ""); last = Object.assign(new Error("groq " + r.status), { status: r.status }); if (modelGone(r.status, t)) continue; throw last; }
    const j = await r.json(), t = (((j.choices || [])[0] || {}).message || {}).content || "";
    good.groq = model;
    return { answer: clean(t, 3000), model, citations: [], grounded: false, status: r.status, tokens: j.usage ? j.usage.total_tokens : null };
  }
  throw last || Object.assign(new Error("groq: no model"), { status: 404 });
}
async function gemini(env, q, grounded, sys) {
  let last;
  for (const model of chain(env, "GEMINI_MODEL", GEMINI_MODELS)) {
    const body = { contents: [{ role: "user", parts: [{ text: q }] }], systemInstruction: { parts: [{ text: sys || SYS }] }, generationConfig: { maxOutputTokens: 2048, temperature: 0.2 } };
    if (grounded) body.tools = [{ google_search: {} }];
    const r = await outbound(env)("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", { method: "POST", headers: { "x-goog-api-key": env.GEMINI_API_KEY, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(40000) });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      last = Object.assign(new Error("gemini " + r.status), { status: r.status });
      if (modelGone(r.status, t)) continue;                                  // retired id → try the next model
      if (grounded && (r.status === 400 || r.status === 403 || r.status === 429)) { const x = await gemini(env, q, false, sys); x.groundingRefused = r.status; return x; }
      throw last;
    }
    const j = await r.json(), c = (j.candidates || [])[0] || {}, parts = ((c.content || {}).parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
    const gm = c.groundingMetadata || {};
    const citations = (gm.groundingChunks || []).filter((g) => g && g.web && /^https:\/\//.test(g.web.uri || "")).map((g) => ({ title: clean(g.web.title, 120), uri: String(g.web.uri).slice(0, 500) })).slice(0, 10);
    good.gemini = model;
    return { answer: clean(parts, 3000), model, citations, searches: (gm.webSearchQueries || []).map((s) => clean(s, 120)).slice(0, 5), grounded: !!grounded && !!(gm.groundingChunks || gm.webSearchQueries), status: r.status, tokens: j.usageMetadata ? j.usageMetadata.totalTokenCount : null };
  }
  throw last || Object.assign(new Error("gemini: no model"), { status: 404 });
}
/* one question on one engine → { engine, answer, model, citations, grounded } (throws on failure) */
export async function ask(env, engine, q, workersAi, sys) {
  if (engine === "groq") return groq(env, q, sys);
  if (engine === "gemini") return gemini(env, q, true, sys);
  const a = await workersAi([{ role: "system", content: sys || SYS }, { role: "user", content: q }], 600);
  return { answer: clean(a.text, 3000), model: a.model, citations: [], grounded: false, status: 200 };
}
