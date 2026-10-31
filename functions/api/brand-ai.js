/* FODO Competitor Finder: AI-suggested competitors for brands & startups (v11). Uses the free Workers AI binding `AI`.
 *   POST /api/brand-ai  { brand, description?, industry?, country?, city? }
 *   → { ok, items: [{ name, website, country, why }] }      GET → { ok, ai }
 * The model only SUGGESTS names. The browser then checks every suggestion against Wikidata and the company's own website,
 * and labels anything it could not confirm as "AI suggestion, verify". Answers are cached in KV for 7 days.
 * v12: when SERPER_API_KEY is set (and the request has web:true), two Google searches ("<brand> competitors", "<brand> alternatives")
 * are given to the model as context; each name it returns says which result named it (source URL), grounded, not remembered. */
import { json, limited, sha } from "../_lib/finder-common.js";

const MODELS = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct"];
const clean = (s, n) => String(s || "").replace(/[\u0000-\u001f<>`]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

const GL = { india: "in", "united states": "us", "united kingdom": "gb", uk: "gb", uae: "ae", "united arab emirates": "ae", canada: "ca", australia: "au", singapore: "sg", germany: "de", france: "fr", "saudi arabia": "sa" };
async function googleContext(env, brand, country) {
  const gl = GL[String(country || "").toLowerCase()] || "", rows = [];
  for (const q of [brand + " competitors", brand + " alternatives"]) {
    try {
      const r = await fetch("https://google.serper.dev/search", { method: "POST", headers: { "x-api-key": env.SERPER_API_KEY, "content-type": "application/json" }, body: JSON.stringify(Object.assign({ q, num: 10, hl: "en" }, gl ? { gl } : {})), signal: AbortSignal.timeout(12000) });
      if (!r.ok) continue;
      const j = await r.json();
      (j.organic || []).slice(0, 8).forEach((x) => { if (x && x.link) rows.push({ url: x.link, text: clean(x.title, 120) + ": " + clean(x.snippet, 260) }); });
      (j.peopleAlsoAsk || []).slice(0, 3).forEach((x) => { if (x && x.link) rows.push({ url: x.link, text: clean(x.question, 120) + ": " + clean(x.snippet, 260) }); });
    } catch (e) {}
  }
  const seen = {}; return rows.filter((r) => { if (seen[r.url]) return false; seen[r.url] = 1; return true; }).slice(0, 18);   // same page from both searches counts once
}
/* a name counts as "found in Google results" only if it really appears in that result's text (the model's own "src" is not trusted) */
const low = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, " ").trim();
function groundedIn(x, sources) {
  if (!sources || !sources.length || !x || !x.name) return "";
  const n = low(x.name); if (n.length < 3) return "";
  const has = (r) => (" " + low(r.text) + " ").indexOf(" " + n + " ") > -1;
  const claimed = sources[+x.src - 1];
  if (claimed && has(claimed)) return claimed.url;
  const any = sources.find(has); return any ? any.url : "";
}
export function parseItems(text, sources) {
  const t = String(text || ""); const a = t.indexOf("["), b = t.lastIndexOf("]");
  if (a < 0 || b <= a) return [];
  let arr; try { arr = JSON.parse(t.slice(a, b + 1)); } catch (e) { return []; }
  if (!Array.isArray(arr)) return [];
  const seen = {};
  return arr.map((x) => typeof x === "string" ? { name: x } : x).filter((x) => x && typeof x.name === "string").map((x) => ({
    source: groundedIn(x, sources),
    name: clean(x.name, 80), website: /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(String(x.website || "").trim()) ? clean(x.website, 120) : "",
    country: clean(x.country, 40), why: clean(x.why || x.reason, 160),
  })).filter((x) => { const k = x.name.toLowerCase(); if (!x.name || seen[k]) return false; seen[k] = 1; return true; }).slice(0, 30);
}

export async function onRequestPost({ request, env }) {
  if (!env.AI) return json({ ok: false, ai: false, reason: "AI is not connected." }, 503);
  let b; try { b = await request.json(); } catch (e) { return json({ ok: false, reason: "Send JSON." }, 400); }
  const brand = clean(b.brand, 80); if (!brand) return json({ ok: false, reason: "Brand missing." }, 400);
  const description = clean(b.description, 200), industry = clean(b.industry, 120), country = clean(b.country, 60), city = clean(b.city, 60);
  const web = !!(b.web && env.SERPER_API_KEY);
  const kv = env.CHAT_KV, key = "bai:v2:" + (web ? "w:" : "") + (await sha([brand, description, industry, country, city].join("|").toLowerCase()));
  if (kv) { try { const hit = await kv.get(key, "json"); if (hit) return json(Object.assign(hit, { cached: true })); } catch (e) {} }
  if (await limited(env, request, "bai", parseInt(env.BRAND_AI_PER_HOUR || "30", 10))) return json({ ok: false, reason: "Too many AI look-ups this hour." }, 429);
  const where = [city, country].filter(Boolean).join(", ");
  const ctx = web ? await googleContext(env, brand, country) : [];
  const ctxTxt = ctx.length ? "\nGoogle search results (numbered):\n" + ctx.map((r, i) => "[" + (i + 1) + "] " + r.text).join("\n") + "\n\nUse these results first. For every company give \"src\": the number of the result that names it, or 0 if it comes only from your own knowledge. Ignore list/review websites themselves (G2, Capterra, Wikipedia, news sites), only companies that sell the product.\n" : "";
  const messages = [
    { role: "system", content: "You are a market analyst. You list real, currently operating companies only. If you are not sure a company exists, leave it out. Answer with JSON only." },
    { role: "user", content: `List up to 25 direct competitors of "${brand}"${description ? " (" + description + ")" : ""}${industry ? ", industry: " + industry : ""}${where ? ", competing in " + where : ""}.\n` +
      `Include well-known players and newer startups that sell a similar product to similar customers${where ? " in that market" : ""}. Do not include "${brand}" itself.\n` +
      ctxTxt + `Reply with a JSON array only, no prose: [{"name":"Company","website":"example.com","country":"India","why":"one short line on why it competes"` + (ctx.length ? `,"src":3` : "") + `}]` },
  ];
  for (let i = 0; i < MODELS.length; i++) {
    try {
      const res = await Promise.race([env.AI.run(MODELS[i], { messages, max_tokens: 1500, temperature: 0.2 }), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), i ? 15000 : 25000))]);
      const text = typeof res === "string" ? res : res && (res.response || (res.result && res.result.response) || (res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content)) || "";
      const items = parseItems(text, ctx);
      if (items.length) {
        const out = { ok: true, ai: true, model: MODELS[i], items, grounded: ctx.length, sources: ctx.map((r) => r.url) };
        if (kv) { try { await kv.put(key, JSON.stringify(out), { expirationTtl: 7 * 86400 }); } catch (e) {} }
        return json(out);
      }
    } catch (e) {}
  }
  return json({ ok: false, ai: true, reason: "The AI could not suggest competitors right now." }, 502);
}
export const onRequestGet = ({ env }) => json({ ok: true, ai: !!env.AI, web: !!env.SERPER_API_KEY });
