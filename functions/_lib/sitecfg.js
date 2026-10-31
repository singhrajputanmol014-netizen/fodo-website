/* v34 fodo.co.in settings the team changes without a deploy (stored in D1 lab_config, key "site") + first-party enquiries.
   Public settings: booking link, GA4 / Meta Pixel IDs (still loaded only after cookie consent), Google review link and the
   Founding Programme counter. Nothing secret lives here. Enquiries from the contact / audit / call forms are saved in D1
   (fodo_leads) with page, source and campaign, the team gets an email, and WhatsApp stays available to the visitor. */
import { db, nowIso, randId, sendMail, OWNER_EMAILS } from "./accounts.js";

export const SITE_DEFAULTS = { bookingProvider: "", bookingUrl: "", meetingType: "30-minute growth call", ga4Id: "", metaPixelId: "", reviewUrl: "", foundingSlotsTotal: 10, foundingSlotsTaken: 0, foundingCohort: "Q4 2026", leadEmail: "" };
const httpsUrl = (u) => { try { const x = new URL(String(u)); return x.protocol === "https:" && !x.username && x.hostname.indexOf(".") > 0 ? x.toString().slice(0, 300) : null; } catch (e) { return null; } };
const clip = (s, n) => String(s == null ? "" : s).trim().slice(0, n);
let cache = null, at = 0;

async function cdb(env) { const d = env && env.XRAY_DB; if (!d) return null; await d.prepare("CREATE TABLE IF NOT EXISTS lab_config (k TEXT PRIMARY KEY, v TEXT, updated_by TEXT, updated_at TEXT)").run(); return d; }
export async function getSiteCfg(env, fresh) {
  if (!fresh && cache && Date.now() - at < 60000) return cache;
  const d = await cdb(env); let v = {}; if (d) { const r = await d.prepare("SELECT v FROM lab_config WHERE k='site'").first().catch(() => null); try { v = r ? JSON.parse(r.v) : {}; } catch (e) { v = {}; } }
  cache = Object.assign({}, SITE_DEFAULTS, v); at = Date.now(); return cache;
}
/* what any visitor may see (no lead email) */
export async function publicCfg(env) { const c = await getSiteCfg(env); const o = Object.assign({}, c); delete o.leadEmail; o.foundingSlotsOpen = Math.max(0, (+o.foundingSlotsTotal || 0) - (+o.foundingSlotsTaken || 0)); return o; }
export async function saveSiteCfg(env, body, by) {
  const cur = await getSiteCfg(env, true), next = Object.assign({}, cur), errors = [], b = body || {};
  if (b.bookingUrl != null) { if (!b.bookingUrl) next.bookingUrl = ""; else { const u = httpsUrl(b.bookingUrl); u ? (next.bookingUrl = u) : errors.push("Booking link must be a full https:// address (Calendly, Cal.com, Google Calendar…)."); } }
  if (b.bookingProvider != null) next.bookingProvider = clip(b.bookingProvider, 40);
  if (b.meetingType != null) next.meetingType = clip(b.meetingType, 80) || SITE_DEFAULTS.meetingType;
  if (b.ga4Id != null) { const v = clip(b.ga4Id, 20).toUpperCase(); if (v && !/^G-[A-Z0-9]{4,15}$/.test(v)) errors.push("GA4 ID looks like G-XXXXXXXXXX."); else next.ga4Id = v; }
  if (b.metaPixelId != null) { const v = clip(b.metaPixelId, 25); if (v && !/^\d{8,20}$/.test(v)) errors.push("Meta Pixel ID is a number (8–20 digits)."); else next.metaPixelId = v; }
  if (b.reviewUrl != null) { if (!b.reviewUrl) next.reviewUrl = ""; else { const u = httpsUrl(b.reviewUrl); u ? (next.reviewUrl = u) : errors.push("Review link must be a full https:// address."); } }
  ["foundingSlotsTotal", "foundingSlotsTaken"].forEach((k) => { if (b[k] != null) { const n = parseInt(b[k], 10); if (!(n >= 0 && n <= 1000)) errors.push("Founding slots must be 0 – 1000."); else next[k] = n; } });
  if (next.foundingSlotsTaken > next.foundingSlotsTotal) errors.push("Slots taken can't be more than the total.");
  if (b.foundingCohort != null) next.foundingCohort = clip(b.foundingCohort, 30);
  if (b.leadEmail != null) { const v = clip(b.leadEmail, 120).toLowerCase(); if (v && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(v)) errors.push("Enquiry email doesn't look right."); else next.leadEmail = v; }
  if (errors.length) return { ok: false, errors };
  const d = await cdb(env); await d.prepare("INSERT INTO lab_config (k, v, updated_by, updated_at) VALUES ('site', ?1, ?2, ?3) ON CONFLICT(k) DO UPDATE SET v=?1, updated_by=?2, updated_at=?3").bind(JSON.stringify(next), by || "", nowIso()).run();
  cache = null; return { ok: true, config: await getSiteCfg(env, true) };
}

/* ---------------- enquiries ---------------- */
const LDDL = ["CREATE TABLE IF NOT EXISTS fodo_leads (id TEXT PRIMARY KEY, mode TEXT, name TEXT, email TEXT, phone TEXT, business TEXT, data TEXT, page TEXT, source TEXT, campaign TEXT, status TEXT, notes TEXT, ip_hash TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE INDEX IF NOT EXISTS fodo_leads_at ON fodo_leads(created_at)"];
async function ldb(env) { const d = await db(env); if (!d) return null; for (const q of LDDL) await d.prepare(q).run(); return d; }
export const LEAD_STATUS = ["new", "contacted", "qualified", "won", "lost", "spam"];
export async function saveLead(env, b, ip) {
  b = b || {}; const d = await ldb(env); if (!d) throw Object.assign(new Error("Enquiries are not set up."), { status: 503 });
  const L = { mode: ["audit", "call", "plan", "contact"].indexOf(b.mode) > -1 ? b.mode : "contact", name: clip(b.name, 80), email: clip(b.email, 120).toLowerCase(), phone: clip(b.phone || b.whatsapp, 25).replace(/[^\d+ ]/g, ""), business: clip(b.business, 100) };
  if (L.name.length < 2) throw Object.assign(new Error("Please add your name."), { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(L.email) && L.phone.replace(/\D/g, "").length < 10) throw Object.assign(new Error("Please add an email or a phone number we can reach you on."), { status: 400 });
  const keep = {}; ["website", "goal", "budget", "channels", "date", "time", "success", "message", "industry", "city", "country"].forEach((k) => { if (b[k] != null && b[k] !== "") keep[k] = Array.isArray(b[k]) ? b[k].slice(0, 12).map((x) => clip(x, 60)) : clip(b[k], 800); });
  const page = clip(b.page, 200).replace(/[^\w\/\-?=&.%]/g, ""), source = clip(b.source, 120), campaign = clip(b.campaign, 120), id = "ld_" + randId(14), now = nowIso();
  const ipHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("lead|" + (ip || ""))))].slice(0, 8).map((x) => x.toString(16).padStart(2, "0")).join("");
  await d.prepare("INSERT INTO fodo_leads (id, mode, name, email, phone, business, data, page, source, campaign, status, notes, ip_hash, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'new','',?11,?12,?12)")
    .bind(id, L.mode, L.name, L.email, L.phone, L.business, JSON.stringify(keep), page, source, campaign, ipHash, now).run();
  const cfg = await getSiteCfg(env), to = cfg.leadEmail || OWNER_EMAILS[0], e = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  try { await sendMail(env, to, "New " + L.mode + " enquiry: " + (L.business || L.name), "<p><b>" + e(L.name) + "</b>" + (L.business ? " · " + e(L.business) : "") + "<br>" + e(L.email) + " · " + e(L.phone) + "</p><table>" + Object.keys(keep).map((k) => "<tr><td>" + e(k) + "</td><td>" + e(Array.isArray(keep[k]) ? keep[k].join(", ") : keep[k]) + "</td></tr>").join("") + "</table><p>Page: " + e(page) + (source ? " · source: " + e(source) : "") + (campaign ? " · campaign: " + e(campaign) : "") + "</p><p>Manage it in Admin → Enquiries.</p>"); } catch (x) {}
  return { ok: true, id };
}
export async function listLeads(env, q) {
  const d = await ldb(env), st = LEAD_STATUS.indexOf(q && q.status) > -1 ? q.status : "";
  const r = await d.prepare("SELECT * FROM fodo_leads" + (st ? " WHERE status=?1" : "") + " ORDER BY created_at DESC LIMIT 500").bind(...(st ? [st] : [])).all();
  return (r.results || []).map((x) => Object.assign(x, { data: (() => { try { return JSON.parse(x.data); } catch (e) { return {}; } })(), ip_hash: undefined }));
}
export async function updateLead(env, id, b) {
  const d = await ldb(env), cur = await d.prepare("SELECT id FROM fodo_leads WHERE id=?1").bind(String(id)).first(); if (!cur) throw Object.assign(new Error("Enquiry not found."), { status: 404 });
  if (b.status != null && LEAD_STATUS.indexOf(b.status) < 0) throw Object.assign(new Error("Unknown status."), { status: 400 });
  await d.prepare("UPDATE fodo_leads SET status=COALESCE(?2, status), notes=COALESCE(?3, notes), updated_at=?4 WHERE id=?1").bind(String(id), b.status == null ? null : b.status, b.notes == null ? null : clip(b.notes, 2000), nowIso()).run();
  return { ok: true };
}
