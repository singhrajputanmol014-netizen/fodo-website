/* FODO Growth Lab v18, standalone PRO tools you can buy one at a time (prompt §4, §9, §47, §79).
   Every tool runs on the shared Business X-Ray research engine: a tool run either REUSES a recent full X-Ray of the same
   website (no new research, no extra cost: §47) or runs a fresh scan at the level the tool needs. The tool's page then
   shows only that tool's part of the research.
   Prices here are DEFAULTS. The admin changes them in Admin → Prices & tools (stored in lab_config, see config.js).
   need  = report features the tool needs (from plans.js), decides which plans already include it and which old X-Rays can be reused
   view  = report sections the tool shows (ids used by js/xray.js) */
import { PLANS, ORDER } from "./plans.js";

export const PRODUCTS = {
  "revenue-leak":      { name: "Revenue Leak Finder", cat: "diagnose", level: 2, price: 199, need: ["fullReport"], view: ["s11", "s15"], line: "Where visitors drop off before they enquire: CTA, contact path, pricing, trust, speed.", uses: "Website crawl + Google PageSpeed", gives: "Each leak with evidence, potential impact (never a made-up ₹ loss), confidence, effort and the fix", time: "4–8 min" },
  "conversion-xray":   { name: "Conversion X-Ray", cat: "diagnose", level: 2, price: 199, need: ["fullReport"], view: ["s11"], line: "Visitor → Understanding → Trust → Interest → Action, scored from what your pages show.", uses: "Website crawl", gives: "Funnel stage scores with the checks behind each, and what to fix first", time: "4–8 min" },
  "website-health":    { name: "Website Health Audit", cat: "diagnose", level: 1, price: 99, need: ["fullReport"], view: ["s6"], line: "Titles, metas, H1s, canonicals, sitemap, robots, broken links, schema, speed and mobile.", uses: "Website crawl + Google PageSpeed (lab and real-user data)", gives: "Every check with pass / warning / fail, the pages affected and the fix", time: "3–6 min" },
  "war-room":          { name: "Competitor War Room", cat: "compete", level: 3, price: 299, need: ["fullReport", "shareOfVoice"], view: ["s8", "s4"], line: "You vs your real competitors on offer, trust, pricing, content, search and contact ease.", uses: "Their websites + Google Search", gives: "Comparison matrix, share of voice, where you win, where they win, biggest gap and the response", time: "6–10 min" },
  "why-winning":       { name: "Why Are They Winning?", cat: "compete", level: 2, price: 199, need: ["fullReport", "whyWinning"], view: ["s8"], focus: "xr-whyw", line: "Pick a competitor and see exactly where they beat you, and how to catch them.", uses: "Their website vs yours + Google Search", gives: "Why they win, then actions for now, 30 days and 90 days", time: "6–10 min" },
  "market-position":   { name: "Market Position Analyzer", cat: "compete", level: 2, price: 199, need: ["fullReport"], view: ["s4", "s10"], line: "How you show up in your market's searches and where you sound like everyone else.", uses: "Google Search + competitor headlines", gives: "Digital market presence, white space, positioning gaps", time: "5–8 min" },
  "ai-visibility":     { name: "AI Visibility Audit", cat: "visibility", level: 3, price: 299, need: ["fullReport"], view: ["s13"], line: "Do AI assistants name you when buyers ask for a recommendation?", uses: "Open AI models (Workers AI, Groq) + Gemini with Google Search, when connected", gives: "FODO AI Visibility Score (FODO's own measure), every question and answer, who gets named instead", time: "4–8 min" },
  "search-visibility": { name: "Search Visibility Audit", cat: "visibility", level: 2, price: 199, need: ["fullReport", "keywordMap"], view: ["s7", "s4"], line: "Where you appear for the searches buyers use, plus your real clicks when Search Console is connected.", uses: "Google Search results + your Google Search Console (optional)", gives: "Rankings found, keyword map, quick wins, medium and strategic opportunities", time: "5–8 min" },
  "local-visibility":  { name: "Local Visibility Audit", cat: "visibility", level: 2, price: 199, need: ["fullReport"], view: ["s12"], focus: "xr-local", line: "Your Google Maps rating and reviews against local competitors.", uses: "Google Maps results (via Serper) + map listings", gives: "Your listing, rating and reviews vs competitors, and the factors that may improve local visibility", time: "4–6 min" },
  "brand-presence":    { name: "Brand Presence Audit", cat: "visibility", level: 2, price: 199, need: ["fullReport"], view: ["s12", "s3"], line: "Your brand's footprint: own-name search, listings, social profiles and consistency.", uses: "Google Search + your website", gives: "Missing signals, consistency issues, same-name confusion, listing gaps", time: "4–6 min" },
  "offer-strength":    { name: "Offer Strength Analyzer", cat: "strategy", level: 1, price: 99, need: ["fullReport"], view: ["s10"], line: "Does your homepage say who it is for, the problem, the outcome and why you?", uses: "Your website + competitor pages", gives: "Offer clarity, proof, differentiation, what is missing and how to fix it", time: "3–6 min" },
  "blueprint30":       { name: "30-Day Growth Blueprint", cat: "strategy", level: 3, price: 299, need: ["fullReport"], view: ["s15", "s16"], line: "Your verified findings turned into four weeks of work, with a tracker.", uses: "Your X-Ray findings", gives: "Week-by-week tasks with reason, evidence, priority, mark To do / In progress / Done", time: "4–8 min" },
  "roadmap90":         { name: "90-Day Growth Roadmap", cat: "strategy", level: 4, price: 399, need: ["fullReport", "roadmapLite"], view: ["s16"], focus: "xr-roadmap", line: "Foundation → acquisition → optimisation, with KPIs for each month.", uses: "Your X-Ray findings", gives: "Month-by-month tasks, KPIs and dependencies", time: "5–8 min" },
};
export const PRODUCT_IDS = Object.keys(PRODUCTS);
/* v33: one run of a single tool is priced by how much work it is, never above a month of Starter (₹499 = 10 full X-Rays).
   Level 1 Quick check ₹99 · Level 2 Focused audit ₹199 · Level 3 Deep analysis ₹299 · Level 4 Strategy ₹399. */
export const LEVELS = { 1: { name: "Quick check", price: 99 }, 2: { name: "Focused audit", price: 199 }, 3: { name: "Deep analysis", price: 299 }, 4: { name: "Strategy", price: 399 } };
const DEFP = {}; PRODUCT_IDS.forEach((id) => { DEFP[id] = PRODUCTS[id].price; });
export const defaultPrice = (id) => DEFP[id];

/* the smallest plan whose features cover the tool → the research level of a fresh scan bought for this tool */
export function toolTier(id) { const p = PRODUCTS[id]; return ORDER.filter((t) => t !== "free" && p.need.every((f) => PLANS[t].features.indexOf(f) > -1))[0] || "pro"; }
/* does a plan (or a pack-level account) already include this tool in its X-Rays? */
export const includedIn = (id, tier) => !!PLANS[tier] && PRODUCTS[id].need.every((f) => PLANS[tier].features.indexOf(f) > -1);
export const plansIncluding = (id) => ORDER.filter((t) => t !== "free" && includedIn(id, t));

/* ---------- storage: tool credits (bought, one run each) and tool runs ---------- */
const DDL = [
  "CREATE TABLE IF NOT EXISTS lab_tool_credits (user_id TEXT, tool TEXT, credits INTEGER DEFAULT 0, updated_at TEXT, PRIMARY KEY (user_id, tool))",
  "CREATE TABLE IF NOT EXISTS lab_tool_runs (id TEXT PRIMARY KEY, user_id TEXT, owner_id TEXT, tool TEXT, domain TEXT, url TEXT, job_id TEXT, source TEXT, status TEXT, price INTEGER, reused INTEGER DEFAULT 0, created_at TEXT, done_at TEXT)",
  "CREATE INDEX IF NOT EXISTS lab_tool_runs_user ON lab_tool_runs (owner_id, created_at)",
  "CREATE INDEX IF NOT EXISTS lab_tool_runs_job ON lab_tool_runs (job_id)",
];
const made = new WeakSet();
export async function tdb(env) { const d = env.XRAY_DB; if (!made.has(d)) { for (const q of DDL) await d.prepare(q).run(); made.add(d); } return d; }
export async function toolCredits(env, userId) {
  const r = (await (await tdb(env)).prepare("SELECT tool, credits FROM lab_tool_credits WHERE user_id=?1 AND credits > 0").bind(userId).all()).results || [], m = {};
  r.forEach((x) => { m[x.tool] = x.credits; }); return m;
}
/* atomic: take one bought run of this tool → true/false */
export async function spendTool(env, userId, tool) {
  const r = await (await tdb(env)).prepare("UPDATE lab_tool_credits SET credits = credits - 1, updated_at=?3 WHERE user_id=?1 AND tool=?2 AND credits > 0 RETURNING credits").bind(userId, tool, new Date().toISOString()).first();
  return !!r;
}
export async function addTool(env, userId, tool, n) {
  await (await tdb(env)).prepare("INSERT INTO lab_tool_credits (user_id, tool, credits, updated_at) VALUES (?1,?2,?3,?4) ON CONFLICT(user_id, tool) DO UPDATE SET credits = credits + ?3, updated_at=?4").bind(userId, tool, n, new Date().toISOString()).run();
}
