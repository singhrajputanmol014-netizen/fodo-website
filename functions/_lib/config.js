/* FODO Growth Lab v17 — admin-controlled settings (prompt §9, §67): plan & pack prices, X-Rays per plan/pack, monitoring slots,
   and tool switches (on / maintenance). Stored in D1 table lab_config; plans.js keeps the defaults.
   applyConfig() copies the saved values onto PLANS / PACKS in memory (refreshed every 60 s per server instance), so the
   checkout, the credits and the plans page all use the admin's numbers. Payments still re-check the amount with Cashfree. */
import { PLANS, PACKS, ORDER } from "./plans.js";

export const TOOLS = {
  xray: { name: "Business X-Ray", default: true },
  monitoring: { name: "Monitoring (Competitor Change Detector)", default: true },
  gsc: { name: "Google Search Console connection", default: true },
  places: { name: "Local listings (Google Maps results via Serper)", default: true },
  aiGroq: { name: "AI visibility: Groq (Llama) engine", default: true },
  aiGemini: { name: "AI visibility: Gemini + Google Search engine", default: true },
};
const DEF = { plans: {}, packs: {} };
ORDER.forEach((id) => { DEF.plans[id] = { price: PLANS[id].price, xrays: PLANS[id].xrays, monitors: PLANS[id].monitors }; });
Object.keys(PACKS).forEach((id) => { DEF.packs[id] = { price: PACKS[id].price, xrays: PACKS[id].xrays }; });

const DDL = "CREATE TABLE IF NOT EXISTS lab_config (k TEXT PRIMARY KEY, v TEXT, updated_by TEXT, updated_at TEXT)";
let at = 0, cur = { pricing: null, tools: {} }, lastDb = null; const made = new WeakSet();
async function cdb(env) { const d = env && env.XRAY_DB; if (!d) return null; if (!made.has(d)) { await d.prepare(DDL).run(); made.add(d); } return d; }

function apply(p) {
  ORDER.forEach((id) => { const s = (p && p.plans && p.plans[id]) || {}, dft = DEF.plans[id];
    PLANS[id].price = id === "free" ? 0 : s.price != null ? s.price : dft.price; PLANS[id].xrays = s.xrays != null ? s.xrays : dft.xrays; PLANS[id].monitors = s.monitors != null ? s.monitors : dft.monitors; });
  Object.keys(PACKS).forEach((id) => { const s = (p && p.packs && p.packs[id]) || {}, dft = DEF.packs[id]; PACKS[id].price = s.price != null ? s.price : dft.price; PACKS[id].xrays = s.xrays != null ? s.xrays : dft.xrays; PACKS[id].name = PACKS[id].xrays + " X-Rays"; });
}
export async function applyConfig(env, force) {
  if (!force && Date.now() - at < 60e3 && lastDb === (env && env.XRAY_DB)) return cur;
  lastDb = env && env.XRAY_DB;
  try {
    const d = await cdb(env); if (!d) return cur;
    const rows = (await d.prepare("SELECT k, v FROM lab_config").all()).results || [], m = {};
    rows.forEach((r) => { try { m[r.k] = JSON.parse(r.v); } catch (e) {} });
    cur = { pricing: m.pricing || null, tools: m.tools || {} }; apply(cur.pricing); at = Date.now();
  } catch (e) {}
  return cur;
}
export const toolOn = (k) => (cur.tools && cur.tools[k] != null ? !!cur.tools[k] : TOOLS[k] ? TOOLS[k].default : true);
export const defaults = () => JSON.parse(JSON.stringify(DEF));
export function current() {
  const out = { plans: {}, packs: {}, tools: {} };
  ORDER.forEach((id) => { out.plans[id] = { name: PLANS[id].name, price: PLANS[id].price, xrays: PLANS[id].xrays, monitors: PLANS[id].monitors, period: PLANS[id].period }; });
  Object.keys(PACKS).forEach((id) => { out.packs[id] = { name: PACKS[id].name, price: PACKS[id].price, xrays: PACKS[id].xrays }; });
  Object.keys(TOOLS).forEach((k) => { out.tools[k] = { name: TOOLS[k].name, on: toolOn(k) }; });
  return out;
}
const int = (v, lo, hi) => { const n = Math.round(+v); return isFinite(n) && n >= lo && n <= hi ? n : null; };
/* validate + save (owner/admin only — checked by the admin route) → { ok, errors[] } */
export async function saveConfig(env, body, by) {
  const d = await cdb(env); if (!d) return { ok: false, errors: ["Database not connected."] };
  await applyConfig(env, true);
  const errors = [], pricing = JSON.parse(JSON.stringify(cur.pricing || { plans: {}, packs: {} })); pricing.plans = pricing.plans || {}; pricing.packs = pricing.packs || {};
  const P = (body && body.plans) || {}, K = (body && body.packs) || {};
  Object.keys(P).forEach((id) => { if (!PLANS[id]) return errors.push("Unknown plan " + id); const s = P[id] || {}, o = pricing.plans[id] = Object.assign({}, pricing.plans[id] || {});
    if (s.price != null && id !== "free") { const v = int(s.price, 1, 1000000); v == null ? errors.push(PLANS[id].name + ": price must be a whole number of rupees (1 – 10,00,000).") : (o.price = v); }
    if (s.xrays != null) { const v = int(s.xrays, 1, 100000); v == null ? errors.push(PLANS[id].name + ": X-Rays must be 1 – 1,00,000.") : (o.xrays = v); }
    if (s.monitors != null) { const v = int(s.monitors, 0, 1000); v == null ? errors.push(PLANS[id].name + ": monitored websites must be 0 – 1,000.") : (o.monitors = v); } });
  Object.keys(K).forEach((id) => { if (!PACKS[id]) return errors.push("Unknown pack " + id); const s = K[id] || {}, o = pricing.packs[id] = Object.assign({}, pricing.packs[id] || {});
    if (s.price != null) { const v = int(s.price, 1, 1000000); v == null ? errors.push("Pack " + id + ": price must be 1 – 10,00,000.") : (o.price = v); }
    if (s.xrays != null) { const v = int(s.xrays, 1, 100000); v == null ? errors.push("Pack " + id + ": X-Rays must be 1 – 1,00,000.") : (o.xrays = v); } });
  const tools = Object.assign({}, cur.tools || {}); Object.keys((body && body.tools) || {}).forEach((k) => { if (TOOLS[k]) tools[k] = !!body.tools[k]; else errors.push("Unknown tool " + k); });
  if (body && body.reset) { await d.prepare("DELETE FROM lab_config").run(); await applyConfig(env, true); return { ok: true, errors: [], config: current() }; }
  if (errors.length) return { ok: false, errors };
  const now = new Date().toISOString();
  await d.batch([d.prepare("INSERT INTO lab_config (k, v, updated_by, updated_at) VALUES ('pricing', ?1, ?2, ?3) ON CONFLICT(k) DO UPDATE SET v=?1, updated_by=?2, updated_at=?3").bind(JSON.stringify(pricing), by || "", now),
    d.prepare("INSERT INTO lab_config (k, v, updated_by, updated_at) VALUES ('tools', ?1, ?2, ?3) ON CONFLICT(k) DO UPDATE SET v=?1, updated_by=?2, updated_at=?3").bind(JSON.stringify(tools), by || "", now)]);
  await applyConfig(env, true);
  return { ok: true, errors: [], config: current() };
}
