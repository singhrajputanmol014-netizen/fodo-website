/* FODO Growth Lab v17 — AI Visibility engines (prompt §37–38, §69 AIProvider interface).
   Each engine answers the same buyer questions; the browser then checks whether the business and its competitors are named.
   Engines (each optional; a missing key = that engine is simply not run, never faked):
     workers-ai → Cloudflare Workers AI (binding AI) — open Llama model, answers from what it learned in training
     groq       → Groq free tier (secret GROQ_API_KEY, model GROQ_MODEL or llama-3.3-70b-versatile) — open Llama model, no live web
     gemini     → Google Gemini API (secret GEMINI_API_KEY, model GEMINI_MODEL or gemini-2.5-flash) WITH Google Search grounding:
                  answers from live Google results and lists the pages it used (citations). If grounding is refused on the
                  key's tier, it retries once without grounding and says so ("grounded": false).
   None of these is ChatGPT, Perplexity or Google AI Overviews — the report says exactly which engine was asked. */
import { outbound } from "./xray-core.js";

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
  const model = env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const r = await outbound(env)("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { authorization: "Bearer " + env.GROQ_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: sys || SYS }, { role: "user", content: q }], max_tokens: 600, temperature: 0.2 }), signal: AbortSignal.timeout(30000) });
  if (!r.ok) { const e = new Error("groq " + r.status); e.status = r.status; throw e; }
  const j = await r.json(), t = (((j.choices || [])[0] || {}).message || {}).content || "";
  return { answer: clean(t, 3000), model, citations: [], grounded: false, status: r.status, tokens: j.usage ? j.usage.total_tokens : null };
}
async function gemini(env, q, grounded, sys) {
  const model = env.GEMINI_MODEL || "gemini-2.5-flash";
  const body = { contents: [{ role: "user", parts: [{ text: q }] }], systemInstruction: { parts: [{ text: sys || SYS }] }, generationConfig: { maxOutputTokens: 800, temperature: 0.2 } };
  if (grounded) body.tools = [{ google_search: {} }];
  const r = await outbound(env)("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", { method: "POST", headers: { "x-goog-api-key": env.GEMINI_API_KEY, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(40000) });
  if (!r.ok) { if (grounded && (r.status === 400 || r.status === 403 || r.status === 429)) { const x = await gemini(env, q, false, sys); x.groundingRefused = r.status; return x; } const e = new Error("gemini " + r.status); e.status = r.status; throw e; }
  const j = await r.json(), c = (j.candidates || [])[0] || {}, parts = ((c.content || {}).parts || []).map((p) => p.text || "").join("");
  const gm = c.groundingMetadata || {};
  const citations = (gm.groundingChunks || []).filter((g) => g && g.web && /^https:\/\//.test(g.web.uri || "")).map((g) => ({ title: clean(g.web.title, 120), uri: String(g.web.uri).slice(0, 500) })).slice(0, 10);
  return { answer: clean(parts, 3000), model, citations, searches: (gm.webSearchQueries || []).map((s) => clean(s, 120)).slice(0, 5), grounded: !!grounded && !!(gm.groundingChunks || gm.webSearchQueries), status: r.status, tokens: j.usageMetadata ? j.usageMetadata.totalTokenCount : null };
}
/* one question on one engine → { engine, answer, model, citations, grounded } (throws on failure) */
export async function ask(env, engine, q, workersAi, sys) {
  if (engine === "groq") return groq(env, q, sys);
  if (engine === "gemini") return gemini(env, q, true, sys);
  const a = await workersAi([{ role: "system", content: sys || SYS }, { role: "user", content: q }], 600);
  return { answer: clean(a.text, 3000), model: a.model, citations: [], grounded: false, status: 200 };
}
