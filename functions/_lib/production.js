/* FODO v47.1 Production engine: catalog (roles, equipment, templates) + pricing engine + team builder engine + matching.
   "Tell FODO what you need. FODO builds the team, plan and price."
   Rules kept here, on the server, for the Workspace, Admin and the Owner Brain alike (one source of truth):
   - every price comes from the admin-managed catalog; a client can change roles / quantities / days, never a rate;
   - rates seeded from the V47 brief are tagged benchmark_seed; equipment without a benchmark has no rate and is shown as
     "rate to be confirmed" (left out of the total, the total is then marked incomplete) instead of an invented number;
   - capacity is an estimate with its assumptions, never a promise; matching shows only real data ("Why FODO recommends");
   - taxes are charged only when FODO_GSTIN is set (or the owner forces it), the rest of the tax setup stays configurable;
   - every catalog or pricing change is written to biz_price_history (old → new, who, why). */
import { nowIso, randId, isOwner, migrateOnce } from "./accounts.js";
import { bdb, err, can, auditLog, proOut } from "./biz.js";
import { proFree, dayList } from "./availability.js";
import { ROLES, EQUIPMENT, TEMPLATES, FAMILIES, GROUPS } from "./catalog-seed.js";

const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const num = (v, lo, hi) => { const n = +v; return v !== "" && v != null && isFinite(n) && n >= lo && n <= hi ? n : null; };
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
const all = async (d, sql, ...a) => (await d.prepare(sql).bind(...a).all()).results || [];
const one = (d, sql, ...a) => d.prepare(sql).bind(...a).first();
const run = (d, sql, ...a) => d.prepare(sql).bind(...a).run();
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const UNITS = ["day", "hour", "project", "month", "item"];
export const TIER_KEYS = ["essential", "professional", "premium"];

const MIG = [
  "CREATE TABLE IF NOT EXISTS biz_roles (id TEXT PRIMARY KEY, name TEXT, category TEXT, unit TEXT, rate INTEGER, rate_min INTEGER, rate_max INTEGER, match TEXT, description TEXT, skills TEXT, source TEXT, active INTEGER DEFAULT 1, updated_at TEXT, updated_by TEXT)",
  "CREATE TABLE IF NOT EXISTS biz_equipment (id TEXT PRIMARY KEY, name TEXT, category TEXT, rate INTEGER, rate_half INTEGER, rate_week INTEGER, rate_min INTEGER, rate_max INTEGER, cost_rate INTEGER, deposit INTEGER, owner TEXT, qty INTEGER, note TEXT, bundle TEXT, source TEXT, active INTEGER DEFAULT 1, updated_at TEXT, updated_by TEXT)",
  "CREATE TABLE IF NOT EXISTS biz_templates (id TEXT PRIMARY KEY, data TEXT, active INTEGER DEFAULT 1, source TEXT, updated_at TEXT, updated_by TEXT)",
  "CREATE TABLE IF NOT EXISTS biz_price_history (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, ref TEXT, field TEXT, old TEXT, new TEXT, by_email TEXT, reason TEXT, created_at TEXT)",
  "CREATE INDEX IF NOT EXISTS biz_price_history_r ON biz_price_history(kind, ref, id)",
  "CREATE TABLE IF NOT EXISTS biz_builds (id TEXT PRIMARY KEY, user_id TEXT, template_id TEXT, title TEXT, answers TEXT, tier TEXT, custom TEXT, estimate TEXT, total INTEGER, status TEXT, quote_id TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE INDEX IF NOT EXISTS biz_builds_u ON biz_builds(user_id, updated_at)",
];
const seeded = new WeakSet();
export async function pdb(env) {
  const d = await bdb(env); if (seeded.has(d)) return d;
  await migrateOnce(d, MIG);
  /* first run only: load the benchmark seeds (an admin's later edits are never overwritten: INSERT OR IGNORE) */
  if (!(await one(d, "SELECT 1 x FROM biz_roles LIMIT 1"))) { const now = nowIso(); for (const r of ROLES) await run(d, "INSERT OR IGNORE INTO biz_roles (id, name, category, unit, rate, rate_min, rate_max, match, description, skills, source, active, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'[]','benchmark_seed',1,?10)", r.id, r.name, r.category, r.unit, r.rate, r.rate_min, r.rate_max, JSON.stringify(r.match), r.description, now); }
  if (!(await one(d, "SELECT 1 x FROM biz_equipment LIMIT 1"))) { const now = nowIso(); for (const e of EQUIPMENT) await run(d, "INSERT OR IGNORE INTO biz_equipment (id, name, category, rate, rate_min, rate_max, cost_rate, owner, qty, note, bundle, source, active, updated_at) VALUES (?1,?2,?3,?4,?5,?6,NULL,'partner',NULL,?7,?8,'benchmark_seed',1,?9)", e.id, e.name, e.category, e.rate, e.rate_min, e.rate_max, e.note, JSON.stringify(e.bundle), now); }
  seeded.add(d); return d;
}

/* ---------- pricing configuration (biz_settings 'pricing'; owner-only changes) ---------- */
export const PRICING_DEFAULTS = {
  mgmtBands: [{ upto: 100000, pct: 15 }, { upto: 300000, pct: 12 }, { upto: 1000000, pct: 10 }, { upto: 0, pct: 8, custom: true }],
  mgmtMin: 7500, mgmtMax: 0, contingencyPct: 5, taxPct: 18, taxLabel: "GST", taxForce: false, rushPct: 15, rushDays: 3, weekendPct: 0,
  travelPerPersonDay: 0, quoteValidityDays: 7, paymentPlan: [{ label: "Booking", pct: 50 }, { label: "On final delivery", pct: 50 }],
  weights: { role: 25, skills: 20, availability: 15, portfolio: 10, budget: 10, location: 5, experience: 5, verified: 5, completion: 3, reliability: 2 },
  inviteHours: 48, teamAutoInvite: false, equipmentBufferDays: 1,
  terms: "Prices are estimates until a quote is accepted. Ad spend, location fees, talent usage beyond the stated media and travel outside the city are billed separately unless listed. Cancellation and refund terms follow the FODO marketplace terms in force when the quote is accepted.",
};
export async function pricingConfig(env) {
  const d = await bdb(env), r = await one(d, "SELECT v FROM biz_settings WHERE k='pricing'"), c = Object.assign({}, PRICING_DEFAULTS, J(r && r.v, {}));
  c.weights = Object.assign({}, PRICING_DEFAULTS.weights, c.weights || {}); return c;
}
export async function savePricingConfig(env, u, b) {
  if (!isOwner(u)) throw err("Only FODO owners change pricing rules.", 403);
  const old = await pricingConfig(env), c = Object.assign({}, old), reason = clip(b.reason, 200); if (reason.length < 3) throw err("Say why you're changing the pricing rules (kept in the history).");
  const pct = (k, hi) => { if (b[k] != null) { const v = num(b[k], 0, hi); if (v == null) throw err(k + " must be 0 – " + hi + "."); c[k] = v; } };
  ["contingencyPct", "rushPct", "weekendPct"].forEach((k) => pct(k, 100)); pct("taxPct", 40); pct("rushDays", 60); pct("quoteValidityDays", 90);
  pct("inviteHours", 336); pct("equipmentBufferDays", 3); if (b.teamAutoInvite != null) c.teamAutoInvite = !!b.teamAutoInvite;
  ["mgmtMin", "mgmtMax", "travelPerPersonDay"].forEach((k) => { if (b[k] != null) { const v = num(b[k], 0, 1e8); if (v == null) throw err(k + " must be ₹0 or more."); c[k] = Math.round(v); } });
  if (b.taxLabel != null) c.taxLabel = clip(b.taxLabel, 20) || "Tax"; if (b.taxForce != null) c.taxForce = !!b.taxForce; if (b.terms != null) c.terms = clip(b.terms, 3000);
  if (Array.isArray(b.mgmtBands)) { const L = b.mgmtBands.slice(0, 8).map((x) => ({ upto: Math.round(num(x.upto, 0, 1e10) || 0), pct: num(x.pct, 0, 60), custom: !!x.custom })); if (L.some((x) => x.pct == null)) throw err("Each fee band needs a percentage (0 – 60)."); c.mgmtBands = L.sort((a, z) => (a.upto || 1e18) - (z.upto || 1e18)); }
  if (Array.isArray(b.paymentPlan)) { const L = b.paymentPlan.slice(0, 6).map((x) => ({ label: clip(x.label, 60), pct: num(x.pct, 1, 100) })); if (L.some((x) => !x.label || x.pct == null) || Math.round(L.reduce((a, x) => a + x.pct, 0)) !== 100) throw err("The payment plan steps must add up to 100%."); c.paymentPlan = L; }
  if (b.weights && typeof b.weights === "object") { const w = Object.assign({}, c.weights); Object.keys(PRICING_DEFAULTS.weights).forEach((k) => { if (b.weights[k] != null) { const v = num(b.weights[k], 0, 100); if (v == null) throw err("Weight " + k + " must be 0 – 100."); w[k] = v; } }); if (!Object.values(w).some((x) => x > 0)) throw err("At least one matching weight must be above 0."); c.weights = w; }
  const d = await bdb(env); await run(d, "INSERT OR REPLACE INTO biz_settings (k, v) VALUES ('pricing', ?1)", JSON.stringify(c)); await pdb(env);
  for (const k of Object.keys(c)) { const a = JSON.stringify(old[k]), z = JSON.stringify(c[k]); if (a !== z) await history(d, "pricing", "config", k, a, z, u.email, reason); }
  await auditLog(env, u.email, "pricing:config", "", reason); return c;
}
async function history(d, kind, ref, field, a, z, by, reason) { await run(d, "INSERT INTO biz_price_history (kind, ref, field, old, new, by_email, reason, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)", kind, ref, field, a == null ? null : String(a).slice(0, 2000), z == null ? null : String(z).slice(0, 2000), by, reason, nowIso()); }
export async function priceHistory(env, R, q) { if (!can(R, ["admin", "finance", "viewer"])) throw err("Not allowed.", 403); const d = await pdb(env); return all(d, "SELECT kind, ref, field, old, new, by_email, reason, created_at FROM biz_price_history WHERE (?1='' OR kind=?1) AND (?2='' OR ref=?2) ORDER BY id DESC LIMIT 200", clip(q.kind, 20), clip(q.ref, 60)); }

/* ---------- catalog reads ---------- */
const roleOut = (r) => ({ id: r.id, name: r.name, category: r.category, unit: r.unit, rate: r.rate, rateMin: r.rate_min, rateMax: r.rate_max, match: J(r.match, []), description: r.description || "", skills: J(r.skills, []), source: r.source, active: !!r.active });
const eqOut = (e, admin) => Object.assign({ id: e.id, name: e.name, category: e.category, rate: e.rate, rateHalf: e.rate_half, rateWeek: e.rate_week, rateMin: e.rate_min, rateMax: e.rate_max, note: e.note || "", bundle: J(e.bundle, []), source: e.source, active: !!e.active },
  admin ? { costRate: e.cost_rate, deposit: e.deposit, owner: e.owner, qty: e.qty } : {});
export async function roles(env, inactive) { const d = await pdb(env); return (await all(d, "SELECT * FROM biz_roles" + (inactive ? "" : " WHERE active=1") + " ORDER BY category, name")).map(roleOut); }
export async function equipment(env, admin, inactive) { const d = await pdb(env); return (await all(d, "SELECT * FROM biz_equipment" + (inactive ? "" : " WHERE active=1") + " ORDER BY category, name")).map((e) => eqOut(e, admin)); }
/* a template = the seed definition + its family (questions, tiers, rules, post factors) + any admin override stored in biz_templates */
export async function templates(env, inactive) { const d = await pdb(env), ov = {}; (await all(d, "SELECT * FROM biz_templates")).forEach((x) => { ov[x.id] = x; });
  const base = TEMPLATES.map((t) => (ov[t.id] && !ov[t.id].active && !inactive) ? null : Object.assign({}, t, J(ov[t.id] && ov[t.id].data, {}), { active: !ov[t.id] || !!ov[t.id].active, custom: false }));
  const extra = Object.values(ov).filter((x) => !TEMPLATES.some((t) => t.id === x.id) && (x.active || inactive)).map((x) => Object.assign({}, J(x.data, {}), { id: x.id, active: !!x.active, custom: true }));
  return base.filter(Boolean).concat(extra).map((t) => ({ id: t.id, name: t.name, group: t.group, family: t.family, description: t.description || "", active: t.active, custom: t.custom }));
}
export async function template(env, id) {
  const d = await pdb(env), seed = TEMPLATES.find((t) => t.id === id), ov = await one(d, "SELECT * FROM biz_templates WHERE id=?1", clip(id, 60)), t = Object.assign({}, seed || {}, J(ov && ov.data, {}));
  if ((!seed && !ov) || (ov && !ov.active)) throw err("This project type isn't available.", 404);
  const f = FAMILIES[t.family] || FAMILIES.custom;
  return Object.assign({ id, mode: f.mode }, t, { questions: t.questions || f.questions, tiers: t.tiers || f.tiers, rules: t.rules || f.rules, post: Object.assign({}, f.post, t.post || {}) });
}
export const catalogMeta = () => ({ groups: GROUPS, units: UNITS, tiers: TIER_KEYS });

/* ---------- admin catalog writes (owners + admins; every rate change goes to the price history) ---------- */
const ID = /^[a-z0-9_]{2,40}$/;
export async function saveRole(env, u, R, b) {
  if (!can(R, ["admin"])) throw err("Only FODO admins change the catalog.", 403); const d = await pdb(env), id = clip(b.id, 40).toLowerCase(); if (!ID.test(id)) throw err("Role id: 2–40 letters, numbers or _.");
  const old = await one(d, "SELECT * FROM biz_roles WHERE id=?1", id), reason = clip(b.reason, 200), name = clip(b.name, 80) || (old && old.name), unit = UNITS.indexOf(b.unit) > -1 ? b.unit : (old ? old.unit : "day");
  if (!name) throw err("Give the role a name.");
  const rate = b.rate === "" || b.rate === null ? null : b.rate != null ? num(b.rate, 0, 1e8) : (old ? old.rate : null), mn = b.rateMin != null ? num(b.rateMin, 0, 1e8) : old && old.rate_min, mx = b.rateMax != null ? num(b.rateMax, 0, 1e8) : old && old.rate_max;
  if (b.rate != null && b.rate !== "" && rate == null) throw err("The rate must be ₹0 or more.");
  if (old && (old.rate !== rate || old.unit !== unit) && reason.length < 3) throw err("Say why the rate changes (kept in the price history).");
  const match = Array.isArray(b.match) ? b.match.map((x) => clip(x, 60)).filter(Boolean).slice(0, 12) : J(old && old.match, [name]), skills = Array.isArray(b.skills) ? b.skills.map((x) => clip(x, 40)).filter(Boolean).slice(0, 30) : J(old && old.skills, []);
  const active = b.active == null ? (old ? old.active : 1) : (b.active ? 1 : 0), now = nowIso();
  await run(d, "INSERT INTO biz_roles (id, name, category, unit, rate, rate_min, rate_max, match, description, skills, source, active, updated_at, updated_by) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14) ON CONFLICT(id) DO UPDATE SET name=?2, category=?3, unit=?4, rate=?5, rate_min=?6, rate_max=?7, match=?8, description=?9, skills=?10, source=?11, active=?12, updated_at=?13, updated_by=?14",
    id, name, clip(b.category, 40) || (old && old.category) || "Other", unit, rate == null ? null : Math.round(rate), mn == null ? null : Math.round(mn), mx == null ? null : Math.round(mx), JSON.stringify(match), clip(b.description, 400) || (old && old.description) || "", JSON.stringify(skills), old && old.rate === rate ? old.source : "admin", active, now, u.email);
  if (!old || old.rate !== rate) await history(d, "role", id, "rate", old ? old.rate : null, rate, u.email, reason || "new role");
  if (old && old.unit !== unit) await history(d, "role", id, "unit", old.unit, unit, u.email, reason);
  if (old && !!old.active !== !!active) await history(d, "role", id, "active", old.active, active, u.email, reason || "status");
  await auditLog(env, u.email, "catalog:role", id, (old ? "update" : "create") + " ₹" + rate); return roleOut(await one(d, "SELECT * FROM biz_roles WHERE id=?1", id));
}
export async function saveEquipment(env, u, R, b) {
  if (!can(R, ["admin"])) throw err("Only FODO admins change the catalog.", 403); const d = await pdb(env), id = clip(b.id, 40).toLowerCase(); if (!ID.test(id)) throw err("Equipment id: 2–40 letters, numbers or _.");
  const old = await one(d, "SELECT * FROM biz_equipment WHERE id=?1", id), reason = clip(b.reason, 200), name = clip(b.name, 100) || (old && old.name); if (!name) throw err("Give the item a name.");
  const pick = (k, col) => b[k] === "" || b[k] === null ? null : b[k] != null ? num(b[k], 0, 1e8) : (old ? old[col] : null);
  const v = { rate: pick("rate", "rate"), rate_half: pick("rateHalf", "rate_half"), rate_week: pick("rateWeek", "rate_week"), cost_rate: pick("costRate", "cost_rate"), deposit: pick("deposit", "deposit"), qty: pick("qty", "qty") };
  for (const k of ["rate", "rateHalf", "rateWeek", "costRate", "deposit", "qty"]) if (b[k] != null && b[k] !== "" && num(b[k], 0, 1e8) == null) throw err(k + " must be 0 or more.");
  const changed = old && ["rate", "rate_half", "rate_week", "cost_rate"].filter((k) => old[k] !== (v[k] == null ? null : Math.round(v[k])));
  if (changed && changed.length && reason.length < 3) throw err("Say why the price changes (kept in the price history).");
  const owner = ["fodo", "pro", "partner", "vendor"].indexOf(b.owner) > -1 ? b.owner : (old ? old.owner : "partner"), active = b.active == null ? (old ? old.active : 1) : (b.active ? 1 : 0), now = nowIso(), R0 = (x) => x == null ? null : Math.round(x);
  await run(d, "INSERT INTO biz_equipment (id, name, category, rate, rate_half, rate_week, rate_min, rate_max, cost_rate, deposit, owner, qty, note, bundle, source, active, updated_at, updated_by) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18) ON CONFLICT(id) DO UPDATE SET name=?2, category=?3, rate=?4, rate_half=?5, rate_week=?6, cost_rate=?9, deposit=?10, owner=?11, qty=?12, note=?13, bundle=?14, source=?15, active=?16, updated_at=?17, updated_by=?18",
    id, name, clip(b.category, 40) || (old && old.category) || "Other", R0(v.rate), R0(v.rate_half), R0(v.rate_week), old ? old.rate_min : null, old ? old.rate_max : null, R0(v.cost_rate), R0(v.deposit), owner, R0(v.qty), clip(b.note, 300) || (old && old.note) || "",
    JSON.stringify(Array.isArray(b.bundle) ? b.bundle.map((x) => clip(x, 60)).filter(Boolean).slice(0, 20) : J(old && old.bundle, [])), changed && !changed.length ? old.source : "admin", active, now, u.email);
  if (!old) await history(d, "equipment", id, "rate", null, v.rate, u.email, reason || "new item"); else for (const k of changed) await history(d, "equipment", id, k, old[k], v[k], u.email, reason);
  await auditLog(env, u.email, "catalog:equipment", id, old ? "update" : "create"); return eqOut(await one(d, "SELECT * FROM biz_equipment WHERE id=?1", id), true);
}
/* templates: admins can rename / describe / switch off a seed template, change its tier team lists, or add a new one based on a family */
export async function saveTemplate(env, u, R, b) {
  if (!can(R, ["admin"])) throw err("Only FODO admins change project templates.", 403); const d = await pdb(env), id = clip(b.id, 60).toLowerCase(); if (!ID.test(id)) throw err("Template id: 2–40 letters, numbers or _.");
  const seed = TEMPLATES.find((t) => t.id === id), old = await one(d, "SELECT * FROM biz_templates WHERE id=?1", id), cur = J(old && old.data, {}), data = Object.assign({}, cur);
  if (!seed && !old && !FAMILIES[b.family]) throw err("Pick what the new template is based on (family).");
  ["name", "description", "group"].forEach((k) => { if (b[k] != null) data[k] = clip(b[k], k === "description" ? 400 : 80); }); if (b.family && FAMILIES[b.family] && !seed) data.family = b.family;
  if (!seed && !data.name) throw err("Give the template a name.");
  const rl = await roles(env, true), el = await equipment(env, true, true), okRole = (x) => rl.some((r) => r.id === x), okEq = (x) => el.some((e) => e.id === x);
  if (b.tiers && typeof b.tiers === "object") { const t = {}; for (const k of TIER_KEYS) { const x = b.tiers[k]; if (!x) continue;
      const rs = (x.roles || []).slice(0, 40).map((r) => [clip(r[0], 40), Math.max(1, Math.min(50, Math.round(+r[1] || 1))), clip(r[2] || "shoot", 20)]), es = (x.equipment || []).slice(0, 40).map((e) => [clip(e[0], 40), Math.max(1, Math.min(50, Math.round(+e[1] || 1)))]);
      const bad = rs.filter((r) => !okRole(r[0])).map((r) => r[0]).concat(es.filter((e) => !okEq(e[0])).map((e) => e[0])); if (bad.length) throw err("Unknown catalog items: " + bad.join(", "));
      t[k] = { label: clip(x.label, 40) || k, sub: clip(x.sub, 60), roles: rs, equipment: es, capacity: x.capacity || {}, assumptions: (x.assumptions || []).map((a) => clip(a, 160)).filter(Boolean).slice(0, 12) }; }
    data.tiers = Object.assign({}, (await template(env, id).catch(() => ({}))).tiers || {}, t); }
  const active = b.active == null ? (old ? old.active : 1) : (b.active ? 1 : 0), now = nowIso();
  await run(d, "INSERT INTO biz_templates (id, data, active, source, updated_at, updated_by) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(id) DO UPDATE SET data=?2, active=?3, updated_at=?5, updated_by=?6", id, JSON.stringify(data), active, seed ? "seed+admin" : "admin", now, u.email);
  await history(d, "template", id, "data", old ? old.data : null, JSON.stringify(data), u.email, clip(b.reason, 200) || "template edit");
  await auditLog(env, u.email, "catalog:template", id, old ? "update" : "create"); return template(env, id);
}

/* ---------- answers ---------- */
export function cleanAnswers(t, a) {
  a = a && typeof a === "object" ? a : {}; const out = {};
  for (const q of t.questions) { let v = a[q.id];
    if (q.type === "number") { v = v === "" || v == null ? q.def : num(v, q.min != null ? q.min : 0, q.max != null ? q.max : 1e9); if (v == null) v = q.def != null ? q.def : null; if (v != null) v = Math.round(v); }
    else if (q.type === "yesno") v = v === "yes" || v === true ? "yes" : v === "no" || v === false ? "no" : (q.def || "no");
    else if (q.type === "select") v = (q.options || []).indexOf(v) > -1 ? v : (q.def || null);
    else if (q.type === "mode") v = ["online", "onsite", "hybrid"].indexOf(v) > -1 ? v : (q.def || t.mode || "online");
    else if (q.type === "date") v = DAY.test(v || "") ? v : null;
    else v = clip(v, q.type === "text" ? 1000 : 80) || null;
    if (v != null) out[q.id] = v; }
  Object.assign(out, t.forceAnswers || {}); if (!out.mode) out.mode = t.mode || "online"; return out;
}
const ruleHit = (w, A) => { const v = A[w[0]]; if (w[1] === "yes") return v === "yes"; if (w[1] === ">=") return +v >= +w[2]; if (w[1] === "=") return String(v) === String(w[2]); return false; };

/* how many units of a role: days for day roles, months for monthly roles, items for per-item roles */
function units(role, basis, A, post) {
  const months = Math.max(1, +A.months || 1), sd = Math.max(1, +A.shoot_days || 1), f = (k) => { const F = post[k] || {}; let s = 0; Object.keys(F).forEach((x) => { if (x !== "min") s += (+A[x] || 0) * F[x]; }); return Math.max(F.min || 0, s); };
  const ceilH = (x) => Math.max(0.5, Math.ceil(x * 2) / 2);   // half-day steps
  if (role.unit === "project") return { n: 1, label: "project" };
  if (role.unit === "month") return { n: basis === "once" ? 1 : months, label: basis === "once" ? "month" : "months" };
  if (role.unit === "item") { const n = basis === "photos" ? Math.max(1, +A.photos || 0) : basis === "reels_items" ? Math.max(1, (+A.reels || 0) + (+A.hero || 0)) : 1; return { n, label: n === 1 ? "item" : "items" }; }
  if (role.unit === "hour") return { n: Math.max(1, +A.hours || 8), label: "hours" };
  let d = 1;
  if (basis === "shoot") d = sd; else if (basis === "shoot_month") d = Math.max(1, +A.shoot_days || 1) * months;
  else if (basis === "post" || basis === "color" || basis === "motion") d = ceilH(f(basis));
  else if (basis === "post_month" || basis === "design_month") d = ceilH(f(basis)) * months;
  else if (basis === "design_fixed") d = 4 * months;
  else if (basis === "creatives" || basis === "creatives_video") d = ceilH((+A.creatives || 0) * months * 0.25);
  return { n: d, label: d === 1 ? "day" : "days" };
}

/* ---------- team builder engine ---------- */
/* inputs: template + answers (+ a tier, + custom edits); output: team, equipment, capacity, assumptions, warnings, price */
export async function estimate(env, R, b) {
  const t = await template(env, clip(b.templateId, 60)), A = cleanAnswers(t, b.answers), C = await pricingConfig(env);
  const rl = {}, el = {}; (await roles(env)).forEach((r) => { rl[r.id] = r; }); (await equipment(env, true)).forEach((e) => { el[e.id] = e; });
  const staff = can(R, ["admin", "finance", "viewer"]), tiers = TIER_KEYS.filter((k) => t.tiers[k]);
  const want = b.tier && tiers.indexOf(b.tier) > -1 ? [b.tier] : tiers, out = {};
  for (const k of want) out[k] = buildTier(t, k, A, rl, el, C, k === b.tier ? b.custom : null, staff, b, env);
  const ord = tiers.filter((k) => out[k]), budget = +A.budget || 0;
  if (budget && ord.length > 1) ord.forEach((k) => { out[k].fitsBudget = out[k].price.total <= budget; });
  const rec = t.tierDefault && out[t.tierDefault] ? t.tierDefault : out.professional ? "professional" : ord[0];
  return { template: { id: t.id, name: t.name, mode: A.mode }, answers: A, tiers: out, order: ord, recommended: rec, budget: budget || null, config: { quoteValidityDays: C.quoteValidityDays, paymentPlan: C.paymentPlan } };
}
function buildTier(t, k, A, rl, el, C, custom, staff, b, env) {
  const T = t.tiers[k], why = {}, team = [], eq = [], warn = [], notes = [];
  const addRole = (id, qty, basis, reason, optional) => { const r = rl[id]; if (!r) { warn.push("Role " + id + " is switched off in the catalog."); return; } const ex = team.find((x) => x.id === id && x.basis === basis); if (ex) { ex.qty = Math.max(ex.qty, qty); if (reason) ex.why = ex.why || reason; return; } team.push({ id, name: r.name, category: r.category, unit: r.unit, qty, basis, why: reason || "", optional: !!optional }); };
  const addEq = (id, qty, reason) => { const e = el[id]; if (!e) return; const ex = eq.find((x) => x.id === id); if (ex) { ex.qty = Math.max(ex.qty, qty); return; } eq.push({ id, name: e.name, category: e.category, qty, why: reason || "" }); };
  (T.roles || []).forEach((r) => addRole(r[0], r[1], r[2], "Part of the " + T.label + " team"));
  (t.extraRoles || []).forEach((r) => addRole(r[0], r[1], r[2], "Needed for " + t.name));
  (T.equipment || []).forEach((e) => addEq(e[0], e[1], "Part of the " + T.label + " kit"));
  (t.rules || []).forEach((rule) => { if (rule.tiers && rule.tiers.indexOf(k) < 0) return; if (!ruleHit(rule.when, A)) return;
    rule.add.forEach((x) => { if (x[0] === "role") addRole(x[1], x[2], x[3], rule.why); else addEq(x[1], x[2], rule.why); }); });
  /* the client's / admin's edits on top of the recommendation (rates always come from the catalog) */
  if (custom && typeof custom === "object") {
    (custom.remove || []).slice(0, 60).forEach((id) => { const i = team.findIndex((x) => x.id === id); if (i > -1) team.splice(i, 1); const j = eq.findIndex((x) => x.id === id); if (j > -1) eq.splice(j, 1); });
    (custom.roles || []).slice(0, 60).forEach((x) => { const id = clip(x.id, 40); if (!rl[id]) return; const ex = team.find((y) => y.id === id); const q = Math.max(1, Math.min(50, Math.round(+x.qty || 1)));
      if (ex) { ex.qty = q; if (x.units != null) ex.units = Math.max(0.5, Math.min(365, Math.round(+x.units * 2) / 2)); ex.edited = true; } else team.push({ id, name: rl[id].name, category: rl[id].category, unit: rl[id].unit, qty: q, basis: x.basis || (rl[id].unit === "day" ? "shoot" : "fixed"), units: x.units != null ? Math.max(0.5, Math.min(365, Math.round(+x.units * 2) / 2)) : undefined, why: "Added by you", added: true }); });
    (custom.equipment || []).slice(0, 60).forEach((x) => { const id = clip(x.id, 40); if (!el[id]) return; const ex = eq.find((y) => y.id === id), q = Math.max(1, Math.min(50, Math.round(+x.qty || 1))); if (ex) { ex.qty = q; if (x.days != null) ex.days = Math.max(1, Math.min(365, Math.round(+x.days))); } else eq.push({ id, name: el[id].name, category: el[id].category, qty: q, days: x.days != null ? Math.max(1, Math.min(365, Math.round(+x.days))) : undefined, why: "Added by you", added: true }); });
  }
  /* units + catalog rates */
  const shootDays = Math.max(1, +A.shoot_days || 1) * (A.months && t.family === "content" ? Math.max(1, +A.months) : 1);
  team.forEach((x) => { const r = rl[x.id], u = x.units != null ? { n: x.units, label: x.units === 1 ? r.unit : r.unit + "s" } : units(r, x.basis, A, t.post); x.units = u.n; x.unitLabel = u.label; x.rate = r.rate; x.amount = r.rate == null ? null : Math.round(r.rate * x.qty * u.n); });
  eq.forEach((x) => { const e = el[x.id]; x.days = x.days || shootDays; x.rate = e.rate; x.costRate = e.costRate; x.amount = e.rate == null ? null : Math.round(e.rate * x.qty * x.days); x.cost = e.rate == null ? null : Math.round((e.costRate != null ? e.costRate : e.rate) * x.qty * x.days); x.costKnown = e.costRate != null; });
  /* capacity: per shoot day × days, compared with what was asked (an estimate, never a promise) */
  const cap = {}, per = T.capacity || {}; let capText = null;
  if (Object.keys(per).length && (A.hero != null || A.reels != null || A.photos != null)) { ["hero", "reels", "photos", "setups"].forEach((m) => { if (per[m] != null) cap[m] = per[m] * Math.max(1, +A.shoot_days || 1); });
    [["hero", "hero videos"], ["reels", "short-form cutdowns"], ["photos", "edited photos"], ["setups", "setups"]].forEach((m) => { if (cap[m[0]] != null && +A[m[0]] > cap[m[0]]) warn.push("You asked for " + A[m[0]] + " " + m[1] + "; the " + T.label + " team can reasonably support about " + cap[m[0]] + " in " + Math.max(1, +A.shoot_days || 1) + " shoot day(s). Add a day or choose a bigger team."); });
    capText = "With the " + T.label + " team, FODO estimates this scope can reasonably support: " + [["hero", "hero video"], ["reels", "short-form cutdowns"], ["photos", "edited photos"]].filter((m) => cap[m[0]]).map((m) => cap[m[0]] + " " + m[1]).join(", ") + "."; }
  const assumptions = (T.assumptions || []).concat([A.locations ? A.locations + " location(s)" : null, A.shoot_days ? A.shoot_days + " shoot day(s), about 8–10 hours each" : null, A.products ? "up to " + A.products + " products" : null, A.talent != null && A.talent !== "" && t.family === "shoot" ? A.talent + " talent (talent fees and usage rights are separate unless listed)" : null, A.usage ? "Usage: " + A.usage : null]).filter(Boolean);
  if (A.mode !== "online" && A.outstation === "yes" && !C.travelPerPersonDay) notes.push("Travel outside the city is to be confirmed: FODO adds it to the quote.");
  if (team.some((x) => x.rate == null) || eq.some((x) => x.rate == null)) notes.push("Some items have no rate in the FODO catalog yet: shown as \"rate to be confirmed\" and not in the total.");
  const price = priceIt(team, eq, A, C, b.adjust && staff ? b.adjust : null, env);
  if (!staff) delete price.internal;
  if (!staff) eq.forEach((x) => { delete x.cost; delete x.costRate; delete x.costKnown; });
  return { key: k, label: T.label, sub: T.sub || "", team, equipment: eq, people: team.reduce((a, x) => a + x.qty, 0), capacity: cap, capacityText: capText, assumptions, warnings: warn, notes, price, reduce: k !== "essential" ? reduceIdeas(team, eq) : [] };
}
/* ways to reduce cost: drop optional / rule-added items and show what changes (no fake urgency, real numbers only) */
const CORE = ["producer", "exec_producer", "director", "editor", "performance_marketer", "social_media_manager", "seo_specialist", "web_developer", "business_strategist", "brand_strategist", "photographer", "videographer"];
function reduceIdeas(team, eq) {
  const ideas = []; team.filter((x) => x.amount && CORE.indexOf(x.id) < 0).sort((a, z) => z.amount - a.amount).slice(0, 4).forEach((x) => ideas.push({ kind: "role", id: x.id, label: "Remove " + x.name, saves: x.amount, effect: /^Part of the/.test(x.why || "") ? "A smaller team: less support and fewer setups on the day" : x.why ? "You lose: " + x.why.charAt(0).toLowerCase() + x.why.slice(1) : "Less capacity on the day" }));
  eq.filter((x) => x.amount).sort((a, z) => z.amount - a.amount).slice(0, 2).forEach((x) => ideas.push({ kind: "equipment", id: x.id, label: "Drop " + x.name, saves: x.amount, effect: "A simpler kit; the crew may bring their own" }));
  return ideas;
}

/* ---------- pricing engine ---------- */
/* client price = people + equipment + location + travel + post + production management + contingency (+ rush / weekend) − discount + tax.
   Internal: provider cost, equipment cost, FODO revenue, gross margin, provider payout. */
export function priceIt(team, eq, A, C, adjust, env) {
  const sum = (L, f) => L.reduce((a, x) => a + (f(x) || 0), 0);
  const isPost = (x) => x.category === "Post-production";
  const people = sum(team.filter((x) => !isPost(x)), (x) => x.amount), post = sum(team.filter(isPost), (x) => x.amount), equip = sum(eq, (x) => x.amount), equipCost = sum(eq, (x) => x.cost);
  const crewShoot = sum(team.filter((x) => x.basis === "shoot" && !isPost(x)), (x) => x.amount);
  const extra = (adjust && Array.isArray(adjust.lines) ? adjust.lines : []).slice(0, 20).map((l) => ({ group: ["travel", "location", "production", "other"].indexOf(l.group) > -1 ? l.group : "other", label: clip(l.label, 80), amount: Math.round(num(l.amount, 0, 1e9) || 0), cost: l.cost == null ? null : Math.round(num(l.cost, 0, 1e9) || 0) })).filter((l) => l.label && l.amount);
  const travelAuto = A.mode !== "online" && A.outstation === "yes" && C.travelPerPersonDay ? Math.round(C.travelPerPersonDay * sum(team.filter((x) => x.basis === "shoot"), (x) => x.qty) * Math.max(1, +A.shoot_days || 1)) : 0;
  const travel = travelAuto + sum(extra.filter((l) => l.group === "travel"), (l) => l.amount), location = sum(extra.filter((l) => l.group === "location"), (l) => l.amount), otherL = sum(extra.filter((l) => l.group === "production" || l.group === "other"), (l) => l.amount);
  const base = people + post + equip + travel + location + otherL;
  /* rush / weekend surcharges apply to the shoot crew only (they are paid to the crew) */
  let rush = 0, weekend = 0; if (A.date && DAY.test(A.date)) { const days = (new Date(A.date + "T00:00:00Z") - new Date(nowIso().slice(0, 10) + "T00:00:00Z")) / 864e5; if (days >= 0 && days < (C.rushDays || 0) && C.rushPct) rush = Math.round(crewShoot * C.rushPct / 100); const dow = new Date(A.date + "T00:00:00Z").getUTCDay(); if ((dow === 0 || dow === 6) && C.weekendPct) weekend = Math.round(crewShoot * C.weekendPct / 100); }
  const band = (C.mgmtBands || []).find((x) => !x.upto || base <= x.upto) || { pct: 10 };
  let mgmt = Math.round(base * band.pct / 100); if (C.mgmtMin && base > 0) mgmt = Math.max(mgmt, C.mgmtMin); if (C.mgmtMax) mgmt = Math.min(mgmt, C.mgmtMax);
  if (adjust && adjust.mgmtPct != null && num(adjust.mgmtPct, 0, 60) != null) mgmt = Math.round(base * num(adjust.mgmtPct, 0, 60) / 100);
  const contingency = Math.round(base * (adjust && adjust.contingencyPct != null && num(adjust.contingencyPct, 0, 50) != null ? num(adjust.contingencyPct, 0, 50) : (C.contingencyPct || 0)) / 100);
  const discount = adjust && adjust.discount ? Math.min(Math.round(num(adjust.discount, 0, 1e9) || 0), base + mgmt) : 0;
  const subtotal = base + rush + weekend + mgmt + contingency - discount;
  const taxOn = !!(env && env.FODO_GSTIN) || !!C.taxForce, tax = taxOn ? Math.round(subtotal * (C.taxPct || 0) / 100) : 0, total = subtotal + tax;   // exact: the total always equals the lines shown
  const incomplete = team.some((x) => x.rate == null) || eq.some((x) => x.rate == null);
  const providerCost = people + post + rush + weekend + sum(extra, (l) => l.cost != null ? l.cost : l.amount) + travelAuto, fodo = mgmt + (equip - equipCost) - discount, gm = fodo, sub = subtotal || 1;
  return { groups: [["People", people], ["Equipment", equip], ["Production & location", location + otherL], ["Post-production", post], ["Travel", travel], ["Rush surcharge", rush], ["Weekend surcharge", weekend], ["FODO production management", mgmt], ["Contingency (" + ((adjust && adjust.contingencyPct) != null ? adjust.contingencyPct : C.contingencyPct) + "%)", contingency], ["Discount", -discount]].filter((g) => g[1]).map((g) => ({ label: g[0], amount: g[1] })),
    extra, subtotal, tax: { label: C.taxLabel || "Tax", pct: taxOn ? C.taxPct : 0, amount: tax, charged: taxOn, note: taxOn ? null : "No tax is added: FODO's GST number isn't set up yet." }, total, incomplete, band: band.custom ? "Above ₹" + (((C.mgmtBands || []).filter((x) => x.upto).slice(-1)[0] || {}).upto || 0).toLocaleString("en-IN") + " FODO negotiates the management fee; this estimate uses " + band.pct + "%." : null,
    internal: { providerCost, equipmentPrice: equip, equipmentCost: equipCost, equipmentCostKnown: eq.every((x) => x.costKnown !== false), mgmtFee: mgmt, mgmtPct: base ? Math.round(mgmt / base * 1000) / 10 : 0, contingency, discount, fodoRevenue: fodo, grossMargin: gm, marginPct: Math.round(gm / sub * 1000) / 10, providerPayout: providerCost } };
}

/* ---------- matching: hard filters first, then the admin weights; reasons only from real data ---------- */
export async function match(env, R, b) {
  const d = await pdb(env), C = await pricingConfig(env), W = C.weights, role = (await roles(env)).find((r) => r.id === clip(b.roleId, 40)); if (!role) throw err("Unknown role.", 404);
  const date = DAY.test(b.date || "") ? b.date : null, city = clip(b.city, 60).toLowerCase(), mode = ["online", "onsite", "hybrid", "any"].indexOf(b.mode) > -1 ? b.mode : "onsite", budget = num(b.budget, 0, 1e9), limit = Math.min(10, Math.max(1, +b.limit || 5));
  const names = role.match.map((x) => x.toLowerCase()), like = names.map(() => "lower(role)=?").join(" OR ");
  const rows = await all(d, "SELECT * FROM biz_pros WHERE status IN ('approved','published') AND (" + like + ") LIMIT 400", ...names);   // hard filter: role, server-side, bounded
  const reli = {}; for (const r of await all(d, "SELECT x.pro_id, sum(CASE WHEN x.status='accepted' THEN 1 ELSE 0 END) a, sum(CASE WHEN x.status IN ('accepted','declined') THEN 1 ELSE 0 END) n FROM biz_project_pros x GROUP BY x.pro_id")) reli[r.pro_id] = r;
  const pf = {}; for (const r of await all(d, "SELECT pro_id, count(*) n FROM biz_portfolio GROUP BY pro_id")) pf[r.pro_id] = r.n;
  const tot = Object.values(W).reduce((a, x) => a + x, 0) || 1, out = [];
  for (const p of rows) {
    const o = proOut(p), why = [], skip = []; let s = 0;
    if (mode !== "online" && mode !== "any" && city) { const here = (o.city || "").toLowerCase().indexOf(city) > -1; if (!here && !o.onsite) continue; }   // onsite: must be local or willing to travel
    if (mode === "online" && !o.remote) continue;
    if (mode === "any" && city && !o.remote && (o.city || "").toLowerCase().indexOf(city) < 0 && !o.onsite) continue;   // v47.2 desk roles: remote, local or travelling
    let avail = null; if (date) { const f = await proFree(d, p, dayList(date, Math.max(1, Math.min(30, +b.days || 1))), { city: mode === "online" || mode === "any" ? null : city }); avail = f.ok; if (!avail) skip.push(f.why[0]); }   // v47.2 availability engine
    s += W.role; why.push(o.role);
    const skills = role.skills.length ? role.skills.filter((k) => o.skills.map((x) => x.toLowerCase()).indexOf(k.toLowerCase()) > -1) : []; if (skills.length) { s += W.skills * Math.min(1, skills.length / Math.max(1, role.skills.length)); why.push("Skills: " + skills.slice(0, 3).join(", ")); }
    if (avail === true) { s += W.availability; why.push("Available on " + date); }
    if (pf[p.id]) { s += W.portfolio * Math.min(1, pf[p.id] / 6); why.push(pf[p.id] + " portfolio item" + (pf[p.id] > 1 ? "s" : "")); }
    if (budget && o.rateDay) { if (o.rateDay <= budget) { s += W.budget; why.push("Day rate within budget"); } }
    if (city && (o.city || "").toLowerCase().indexOf(city) > -1) { s += W.location; why.push("Based in " + o.city); }
    if (o.years) { s += W.experience * Math.min(1, o.years / 10); why.push(o.years + " years' experience"); }
    if (o.verified) { s += W.verified; why.push("Verified by FODO"); }
    if (o.completed) { s += W.completion * Math.min(1, o.completed / 10); why.push(o.completed + " completed FODO project" + (o.completed > 1 ? "s" : "")); }
    const rl = reli[p.id]; if (rl && rl.n >= 3) { s += W.reliability * (rl.a / rl.n); why.push(Math.round(rl.a / rl.n * 100) + "% of team invitations accepted"); }
    if (o.rating && o.reviews) why.push(o.rating + "★ from " + o.reviews + " review" + (o.reviews > 1 ? "s" : ""));
    out.push({ pro: { id: o.id, name: o.name, title: o.title, role: o.role, city: o.city, photo: o.photo, verified: o.verified, rating: o.rating, reviews: o.reviews, completed: o.completed, rateDay: can(R, ["admin", "finance", "viewer"]) ? o.rateDay : undefined }, score: Math.round(s / tot * 100), available: avail, why, notes: skip });
  }
  out.sort((a, z) => (z.available === false ? -1 : 0) - (a.available === false ? -1 : 0) || z.score - a.score);
  return { role: { id: role.id, name: role.name }, total: out.length, availableCount: out.filter((x) => x.available !== false).length, items: out.slice(0, limit), weights: W, note: out.length ? null : "No approved FODO Pro matches this role" + (city ? " in " + b.city : "") + " yet. FODO staffs it from its network and confirms before you pay." };
}
/* team availability: for each role in the team, how many approved Pros are free on the date (counts only) */
export async function availability(env, R, b) {
  const ids = (Array.isArray(b.roles) ? b.roles : []).slice(0, 40).map((x) => clip(x, 40)), res = [];
  for (const id of ids) { try { const m = await match(env, R, { roleId: id, date: b.date, city: b.city, mode: b.mode, limit: 1 }); res.push({ id, name: m.role.name, matched: m.total, available: m.availableCount }); } catch (e) { res.push({ id, name: id, matched: 0, available: 0 }); } }
  const covered = res.filter((x) => x.available > 0).length; return { date: DAY.test(b.date || "") ? b.date : null, roles: res, covered, of: res.length };
}

/* ---------- saved builds (the client's drafts) ---------- */
export async function saveBuild(env, u, R, b) {
  const d = await pdb(env), est = await estimate(env, R, b), tier = b.tier && est.tiers[b.tier] ? b.tier : est.recommended, T = est.tiers[tier]; if (!T) throw err("Pick a team option.");
  if (await (await import("./accounts.js")).count(env, "build:" + u.id, 120, 3600)) throw err("Too many saves this hour, slow down a little.", 429);
  const now = nowIso(), title = clip(b.title, 120) || (est.template.id === "custom" && est.answers.promote ? String(est.answers.promote).slice(0, 80) : est.template.name + (est.answers.promote ? ": " + String(est.answers.promote).slice(0, 60) : ""));
  let id = clip(b.buildId, 40); if (id) { const o = await one(d, "SELECT * FROM biz_builds WHERE id=?1 AND user_id=?2", id, u.id); if (!o) throw err("Draft not found.", 404); if (o.status !== "draft") throw err("This draft already became a quote. Start a new one or ask FODO to revise the quote.", 409); }
  else id = "bd" + randId(14);
  await run(d, "INSERT INTO biz_builds (id, user_id, template_id, title, answers, tier, custom, estimate, total, status, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'draft',?10,?10) ON CONFLICT(id) DO UPDATE SET title=?4, answers=?5, tier=?6, custom=?7, estimate=?8, total=?9, updated_at=?10",
    id, u.id, est.template.id, title, JSON.stringify(est.answers), tier, JSON.stringify(b.custom || null), JSON.stringify(T), T.price.total, now);
  return { id, title, tier, total: T.price.total };
}
export async function builds(env, u) { const d = await pdb(env); return all(d, "SELECT id, template_id, title, tier, total, status, quote_id, updated_at FROM biz_builds WHERE user_id=?1 ORDER BY updated_at DESC LIMIT 50", u.id); }
export async function build(env, u, R, id) { const d = await pdb(env), b = await one(d, "SELECT * FROM biz_builds WHERE id=?1", clip(id, 40)); if (!b || (b.user_id !== u.id && !can(R, ["admin", "finance", "viewer"]))) throw err("Draft not found.", 404);
  return { id: b.id, templateId: b.template_id, title: b.title, answers: J(b.answers, {}), tier: b.tier, custom: J(b.custom, null), status: b.status, quoteId: b.quote_id, total: b.total, updatedAt: b.updated_at }; }
export async function deleteBuild(env, u, id) { const d = await pdb(env), x = await run(d, "DELETE FROM biz_builds WHERE id=?1 AND user_id=?2 AND status='draft'", clip(id, 40), u.id); if (!x.meta.changes) throw err("Only your own drafts that aren't quotes yet can be deleted.", 409); return { ok: true }; }
