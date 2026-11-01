/* FODO v45 CRM: contacts, deals pipeline, activities and follow-ups, website-form leads → contacts, CSV import / export,
   duplicate merge. Every row belongs to ONE user (user_id) and every query is scoped to it; nothing is shared or invented.
   Forecast = deal value × stage probability (shown as an estimate, never as revenue). */
import { nowIso, randId } from "./accounts.js";
import { bdb, err } from "./biz.js";

export const STAGES = [["lead", "Lead", 10], ["qualified", "Qualified", 30], ["proposal", "Proposal sent", 50], ["negotiation", "Negotiation", 70], ["won", "Won", 100], ["lost", "Lost", 0]];
export const ACT_KINDS = ["note", "call", "email", "meeting", "whatsapp", "task"];
export const SOURCES = ["manual", "website", "import", "referral", "instagram", "facebook", "google", "linkedin", "whatsapp", "walk-in", "event", "other"];
const STAGE_IDS = STAGES.map((s) => s[0]), PROB = Object.fromEntries(STAGES.map((s) => [s[0], s[2]]));
const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const int = (v, lo, hi) => { const n = Math.round(+v); return isFinite(n) && n >= lo && n <= hi ? n : null; };
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
const all = async (d, sql, ...a) => (await d.prepare(sql).bind(...a).all()).results || [];
const one = (d, sql, ...a) => d.prepare(sql).bind(...a).first();
const run = (d, sql, ...a) => d.prepare(sql).bind(...a).run();
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const cleanEmail = (e) => { e = clip(e, 160).toLowerCase(); return /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/.test(e) ? e : ""; };
export const cleanPhone = (p) => { const s = clip(p, 30).replace(/[^\d+]/g, ""), dg = s.replace(/\D/g, ""); if (dg.length < 8 || dg.length > 15) return ""; return dg.length === 10 ? "+91" + dg : "+" + dg; };   // India default for 10-digit numbers
const tagsOf = (t) => [...new Set((Array.isArray(t) ? t : String(t || "").split(",")).map((x) => clip(x, 30).toLowerCase()).filter(Boolean))].slice(0, 12);

const DDL = [
  "CREATE TABLE IF NOT EXISTS crm_contacts (id TEXT PRIMARY KEY, user_id TEXT, name TEXT, email TEXT, phone TEXT, company TEXT, title TEXT, city TEXT, source TEXT, tags TEXT, notes TEXT, form_id TEXT, created_at TEXT, updated_at TEXT, last_at TEXT)",
  "CREATE INDEX IF NOT EXISTS crm_contacts_u ON crm_contacts(user_id, updated_at)",
  "CREATE TABLE IF NOT EXISTS crm_deals (id TEXT PRIMARY KEY, user_id TEXT, contact_id TEXT, title TEXT, value INTEGER, stage TEXT, prob INTEGER, close_on TEXT, lost_reason TEXT, created_at TEXT, updated_at TEXT, closed_at TEXT)",
  "CREATE INDEX IF NOT EXISTS crm_deals_u ON crm_deals(user_id, stage)",
  "CREATE TABLE IF NOT EXISTS crm_acts (id TEXT PRIMARY KEY, user_id TEXT, contact_id TEXT, deal_id TEXT, kind TEXT, body TEXT, due TEXT, done INTEGER DEFAULT 0, created_at TEXT)",
  "CREATE INDEX IF NOT EXISTS crm_acts_c ON crm_acts(user_id, contact_id, created_at)",
];
const ready = new WeakSet();
export async function cdb(env) { const d = await bdb(env); if (!ready.has(d)) { for (const q of DDL) await d.prepare(q).run(); ready.add(d); } return d; }

/* ---------- contacts ---------- */
function contactOut(c, extra) { return Object.assign({ id: c.id, name: c.name, email: c.email || "", phone: c.phone || "", company: c.company || "", title: c.title || "", city: c.city || "", source: c.source || "manual", tags: J(c.tags, []), notes: c.notes || "", fromForm: !!c.form_id, created_at: c.created_at, updated_at: c.updated_at, last_at: c.last_at }, extra || {}); }
function cleanContact(b) {
  const o = { name: clip(b.name, 120), email: cleanEmail(b.email), phone: cleanPhone(b.phone), company: clip(b.company, 120), title: clip(b.title, 80), city: clip(b.city, 60), source: SOURCES.indexOf(b.source) > -1 ? b.source : "manual", tags: tagsOf(b.tags), notes: clip(b.notes, 2000) };
  if (b.email && !o.email && String(b.email).trim()) throw err("That email doesn't look right.");
  if (!o.name) o.name = o.email ? o.email.split("@")[0] : o.phone || ""; if (!o.name && !o.company) throw err("Add at least a name, email, phone or company.");
  if (!o.name) o.name = o.company; return o;
}
/* the same person = same email, or same phone */
async function findDup(d, uid, o, except) { if (!o.email && !o.phone) return null; return one(d, "SELECT * FROM crm_contacts WHERE user_id=?1 AND id != ?4 AND ((?2 != '' AND email=?2) OR (?3 != '' AND phone=?3)) LIMIT 1", uid, o.email || "", o.phone || "", except || "-"); }
export async function listContacts(env, u, q) {
  const d = await cdb(env), text = clip(q.q, 60).toLowerCase(), tag = clip(q.tag, 30).toLowerCase();
  const rows = await all(d, "SELECT c.*, (SELECT count(*) FROM crm_deals x WHERE x.contact_id=c.id AND x.stage NOT IN ('won','lost')) AS open_deals, (SELECT COALESCE(sum(value),0) FROM crm_deals x WHERE x.contact_id=c.id AND x.stage='won') AS won_value, (SELECT min(due) FROM crm_acts a WHERE a.contact_id=c.id AND a.kind='task' AND a.done=0) AS next_due FROM crm_contacts c WHERE c.user_id=?1 ORDER BY COALESCE(c.last_at, c.updated_at) DESC LIMIT 2000", u.id);
  const L = rows.filter((c) => (!text || [c.name, c.email, c.phone, c.company, c.city, c.notes].join(" ").toLowerCase().indexOf(text) > -1) && (!tag || J(c.tags, []).indexOf(tag) > -1));
  const tags = {}; rows.forEach((c) => J(c.tags, []).forEach((t) => { tags[t] = (tags[t] || 0) + 1; }));
  return { items: L.slice(0, 500).map((c) => contactOut(c, { openDeals: c.open_deals, wonValue: c.won_value, nextDue: c.next_due })), total: rows.length, tags: Object.keys(tags).sort().map((t) => ({ tag: t, n: tags[t] })) };
}
export async function saveContact(env, u, b) {
  const d = await cdb(env), o = cleanContact(b), now = nowIso();
  if (b.id) { const c = await one(d, "SELECT id FROM crm_contacts WHERE id=?1 AND user_id=?2", clip(b.id, 40), u.id); if (!c) throw err("Not found.", 404);
    const dup = await findDup(d, u.id, o, c.id); if (dup) throw Object.assign(err("Another contact already has this email or phone: " + dup.name + ". Merge them instead."), { status: 409, dup: dup.id });
    await run(d, "UPDATE crm_contacts SET name=?3, email=?4, phone=?5, company=?6, title=?7, city=?8, source=?9, tags=?10, notes=?11, updated_at=?12 WHERE id=?1 AND user_id=?2", c.id, u.id, o.name, o.email, o.phone, o.company, o.title, o.city, o.source, JSON.stringify(o.tags), o.notes, now); return getContact(env, u, c.id); }
  const dup = await findDup(d, u.id, o); if (dup) throw Object.assign(err("You already have this contact: " + dup.name + "."), { status: 409, dup: dup.id });
  if ((((await one(d, "SELECT count(*) n FROM crm_contacts WHERE user_id=?1", u.id)) || {}).n || 0) >= 20000) throw err("Up to 20,000 contacts.");
  const id = "cc" + randId(14); await run(d, "INSERT INTO crm_contacts (id, user_id, name, email, phone, company, title, city, source, tags, notes, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?12)", id, u.id, o.name, o.email, o.phone, o.company, o.title, o.city, o.source, JSON.stringify(o.tags), o.notes, now);
  return getContact(env, u, id);
}
export async function getContact(env, u, id) {
  const d = await cdb(env), c = await one(d, "SELECT * FROM crm_contacts WHERE id=?1 AND user_id=?2", clip(id, 40), u.id); if (!c) throw err("Not found.", 404);
  return { contact: contactOut(c), deals: (await all(d, "SELECT * FROM crm_deals WHERE contact_id=?1 AND user_id=?2 ORDER BY created_at DESC", c.id, u.id)).map(dealOut), activities: await all(d, "SELECT id, kind, body, due, done, deal_id, created_at FROM crm_acts WHERE contact_id=?1 AND user_id=?2 ORDER BY created_at DESC LIMIT 300", c.id, u.id) };
}
export async function delContact(env, u, id) {
  const d = await cdb(env), c = await one(d, "SELECT id FROM crm_contacts WHERE id=?1 AND user_id=?2", clip(id, 40), u.id); if (!c) throw err("Not found.", 404);
  for (const q of ["DELETE FROM crm_acts WHERE contact_id=?1 AND user_id=?2", "DELETE FROM crm_deals WHERE contact_id=?1 AND user_id=?2", "DELETE FROM crm_contacts WHERE id=?1 AND user_id=?2"]) await run(d, q, c.id, u.id); return { ok: true };
}
/* merge `from` into `into`: empty fields are filled, tags joined, deals and activities moved */
export async function merge(env, u, b) {
  const d = await cdb(env), a = await one(d, "SELECT * FROM crm_contacts WHERE id=?1 AND user_id=?2", clip(b.into, 40), u.id), z = await one(d, "SELECT * FROM crm_contacts WHERE id=?1 AND user_id=?2", clip(b.from, 40), u.id);
  if (!a || !z || a.id === z.id) throw err("Pick two different contacts.", 404);
  const f = (k) => a[k] || z[k] || "", tags = tagsOf(J(a.tags, []).concat(J(z.tags, []))), notes = [a.notes, z.notes].filter(Boolean).join("\n").slice(0, 2000);
  await run(d, "UPDATE crm_contacts SET email=?3, phone=?4, company=?5, title=?6, city=?7, tags=?8, notes=?9, form_id=COALESCE(form_id, ?10), updated_at=?11 WHERE id=?1 AND user_id=?2", a.id, u.id, f("email"), f("phone"), f("company"), f("title"), f("city"), JSON.stringify(tags), notes, z.form_id, nowIso());
  await run(d, "UPDATE crm_deals SET contact_id=?1 WHERE contact_id=?2 AND user_id=?3", a.id, z.id, u.id); await run(d, "UPDATE crm_acts SET contact_id=?1 WHERE contact_id=?2 AND user_id=?3", a.id, z.id, u.id);
  await run(d, "DELETE FROM crm_contacts WHERE id=?1 AND user_id=?2", z.id, u.id); return getContact(env, u, a.id);
}
export async function duplicates(env, u) {
  const d = await cdb(env), L = await all(d, "SELECT * FROM crm_contacts WHERE user_id=?1", u.id), by = {}, out = [];
  L.forEach((c) => { [c.email && "e:" + c.email, c.phone && "p:" + c.phone, c.name && c.company && "n:" + c.name.toLowerCase() + "|" + c.company.toLowerCase()].filter(Boolean).forEach((k) => { (by[k] = by[k] || []).push(c); }); });
  const seen = new Set(); Object.keys(by).forEach((k) => { const g = by[k]; if (g.length > 1) { const key = g.map((c) => c.id).sort().join(); if (!seen.has(key)) { seen.add(key); out.push({ why: k[0] === "e" ? "same email" : k[0] === "p" ? "same phone" : "same name and company", contacts: g.slice(0, 5).map((c) => contactOut(c)) }); } } });
  return { groups: out.slice(0, 100) };
}

/* ---------- website form leads → contacts (one contact per person; the form id is remembered so it is never imported twice) ---------- */
export async function importForms(env, u, ids) {
  const d = await cdb(env); let rows = [];
  try { rows = await all(d, "SELECT f.id, f.data, f.created_at, s.name AS site FROM site_forms f JOIN sites s ON s.id=f.site_id WHERE s.owner_user_id=?1 AND s.deleted_at IS NULL ORDER BY f.created_at LIMIT 2000", u.id); } catch (e) { rows = []; }
  const want = Array.isArray(ids) && ids.length ? new Set(ids.map((x) => clip(x, 60))) : null, done = new Set((await all(d, "SELECT form_id FROM crm_contacts WHERE user_id=?1 AND form_id IS NOT NULL", u.id)).map((x) => x.form_id));
  let added = 0, linked = 0, skipped = 0;
  for (const r of rows) { if ((want && !want.has(r.id)) || done.has(r.id)) continue; const f = J(r.data, {}), pick = (re) => { const k = Object.keys(f).find((x) => re.test(x)); return k ? f[k] : ""; };
    const o = { name: clip(pick(/name/i), 120), email: cleanEmail(pick(/mail/i)), phone: cleanPhone(pick(/phone|mobile|whatsapp/i)), company: clip(pick(/company|business|firm/i), 120) }, msg = clip(pick(/message|msg|enquiry|query|details|comment/i), 1500);
    if (!o.name && !o.email && !o.phone) { skipped++; continue; }
    const dup = await findDup(d, u.id, o), now = nowIso(); let cid;
    if (dup) { cid = dup.id; linked++; await run(d, "UPDATE crm_contacts SET name=CASE WHEN name='' THEN ?3 ELSE name END, email=CASE WHEN email='' THEN ?4 ELSE email END, phone=CASE WHEN phone='' THEN ?5 ELSE phone END, last_at=?6, updated_at=?6 WHERE id=?1 AND user_id=?2", cid, u.id, o.name, o.email, o.phone, now); }
    else { cid = "cc" + randId(14); added++; await run(d, "INSERT INTO crm_contacts (id, user_id, name, email, phone, company, title, city, source, tags, notes, form_id, created_at, updated_at, last_at) VALUES (?1,?2,?3,?4,?5,?6,'','', 'website', ?7, '', ?8, ?9, ?9, ?9)", cid, u.id, o.name || o.email || o.phone, o.email, o.phone, o.company, JSON.stringify(["website"]), r.id, now); }
    await run(d, "INSERT INTO crm_acts (id, user_id, contact_id, kind, body, created_at) VALUES (?1,?2,?3,'note',?4,?5)", "ca" + randId(14), u.id, cid, "Website form on " + clip(r.site, 80) + " (" + String(r.created_at).slice(0, 10) + ")" + (msg ? ": " + msg : ""), now);
    if (dup) await run(d, "UPDATE crm_contacts SET form_id=COALESCE(form_id, ?3) WHERE id=?1 AND user_id=?2", cid, u.id, r.id);
    done.add(r.id); }
  return { added, linked, skipped };
}

/* ---------- deals ---------- */
const dealOut = (x) => ({ id: x.id, contactId: x.contact_id, contact: x.cname || undefined, title: x.title, value: x.value || 0, stage: x.stage, prob: x.prob, closeOn: x.close_on, lostReason: x.lost_reason || "", created_at: x.created_at, updated_at: x.updated_at, closed_at: x.closed_at });
export async function saveDeal(env, u, b) {
  const d = await cdb(env), now = nowIso(), x0 = b.id ? await one(d, "SELECT * FROM crm_deals WHERE id=?1 AND user_id=?2", clip(b.id, 40), u.id) : null;
  if (x0) { if (b.value === undefined) b.value = x0.value; if (b.closeOn === undefined) b.closeOn = x0.close_on; if (b.stage === undefined) b.stage = x0.stage; if (b.lostReason === undefined) b.lostReason = x0.lost_reason; }   // an update keeps what isn't sent
  const title = clip(b.title, 140), value = b.value === "" || b.value == null ? 0 : int(b.value, 0, 1e10), stage = STAGE_IDS.indexOf(b.stage) > -1 ? b.stage : "lead";
  if (value == null) throw err("The value must be a whole number of rupees.");
  const prob = b.prob === "" || b.prob == null ? PROB[stage] : int(b.prob, 0, 100); if (prob == null) throw err("Probability is 0 to 100 %.");
  const close = DAY.test(b.closeOn || "") ? b.closeOn : null, lost = stage === "lost" ? clip(b.lostReason, 300) : "";
  let cid = b.contactId ? clip(b.contactId, 40) : null; if (cid && !(await one(d, "SELECT 1 x FROM crm_contacts WHERE id=?1 AND user_id=?2", cid, u.id))) throw err("Contact not found.", 404);
  if (b.id) { const x = await one(d, "SELECT * FROM crm_deals WHERE id=?1 AND user_id=?2", clip(b.id, 40), u.id); if (!x) throw err("Not found.", 404);
    const closed = ["won", "lost"].indexOf(stage) > -1 ? x.closed_at || now : null;
    await run(d, "UPDATE crm_deals SET title=?3, value=?4, stage=?5, prob=?6, close_on=?7, lost_reason=?8, contact_id=COALESCE(?9, contact_id), updated_at=?10, closed_at=?11 WHERE id=?1 AND user_id=?2", x.id, u.id, title || x.title, value, stage, stage === x.stage && b.prob == null ? x.prob : prob, close, lost, cid, now, closed);
    if (stage !== x.stage && (x.contact_id || cid)) await run(d, "INSERT INTO crm_acts (id, user_id, contact_id, deal_id, kind, body, created_at) VALUES (?1,?2,?3,?4,'note',?5,?6)", "ca" + randId(14), u.id, cid || x.contact_id, x.id, "Deal “" + (title || x.title) + "” moved to " + STAGES.find((s) => s[0] === stage)[1] + (lost ? " (" + lost + ")" : ""), now);
    return { deal: dealOut(await one(d, "SELECT * FROM crm_deals WHERE id=?1", x.id)) }; }
  if (title.length < 2) throw err("Name the deal.");
  const id = "cd" + randId(14); await run(d, "INSERT INTO crm_deals (id, user_id, contact_id, title, value, stage, prob, close_on, lost_reason, created_at, updated_at, closed_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10,?11)", id, u.id, cid, title, value, stage, prob, close, lost, now, ["won", "lost"].indexOf(stage) > -1 ? now : null);
  if (cid) await run(d, "UPDATE crm_contacts SET last_at=?3 WHERE id=?1 AND user_id=?2", cid, u.id, now);
  return { deal: dealOut(await one(d, "SELECT * FROM crm_deals WHERE id=?1", id)) };
}
export async function delDeal(env, u, id) { const r = await run(await cdb(env), "DELETE FROM crm_deals WHERE id=?1 AND user_id=?2", clip(id, 40), u.id); if (!r.meta.changes) throw err("Not found.", 404); return { ok: true }; }
/* the pipeline: every stage with its deals, totals and the weighted (estimated) forecast */
export async function pipeline(env, u) {
  const d = await cdb(env), L = await all(d, "SELECT x.*, c.name AS cname FROM crm_deals x LEFT JOIN crm_contacts c ON c.id=x.contact_id WHERE x.user_id=?1 ORDER BY x.updated_at DESC LIMIT 2000", u.id), m30 = new Date(Date.now() - 30 * 864e5).toISOString();
  const stages = STAGES.map((s) => { const ds = L.filter((x) => x.stage === s[0]); return { id: s[0], label: s[1], prob: s[2], count: ds.length, value: ds.reduce((a, x) => a + (x.value || 0), 0), deals: ds.slice(0, 200).map(dealOut) }; });
  const open = L.filter((x) => ["won", "lost"].indexOf(x.stage) < 0), won30 = L.filter((x) => x.stage === "won" && (x.closed_at || "") >= m30), lost30 = L.filter((x) => x.stage === "lost" && (x.closed_at || "") >= m30);
  return { stages, totals: { open: open.reduce((a, x) => a + (x.value || 0), 0), weighted: Math.round(open.reduce((a, x) => a + (x.value || 0) * (x.prob || 0) / 100, 0)), won30: won30.reduce((a, x) => a + (x.value || 0), 0), winRate30: won30.length + lost30.length ? Math.round(won30.length / (won30.length + lost30.length) * 100) : null } };
}

/* ---------- activities & follow-ups ---------- */
export async function addActivity(env, u, b) {
  const d = await cdb(env), c = await one(d, "SELECT id FROM crm_contacts WHERE id=?1 AND user_id=?2", clip(b.contactId, 40), u.id); if (!c) throw err("Contact not found.", 404);
  const kind = ACT_KINDS.indexOf(b.kind) > -1 ? b.kind : "note", body = clip(b.body, 2000); if (body.length < 2) throw err("Write what happened (or what to do).");
  const due = kind === "task" && DAY.test(b.due || "") ? b.due : null; if (kind === "task" && !due) throw err("A follow-up needs a date.");
  let deal = b.dealId ? clip(b.dealId, 40) : null; if (deal && !(await one(d, "SELECT 1 x FROM crm_deals WHERE id=?1 AND user_id=?2", deal, u.id))) deal = null;
  const now = nowIso(); await run(d, "INSERT INTO crm_acts (id, user_id, contact_id, deal_id, kind, body, due, done, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,0,?8)", "ca" + randId(14), u.id, c.id, deal, kind, body, due, now);
  if (kind !== "task") await run(d, "UPDATE crm_contacts SET last_at=?3 WHERE id=?1 AND user_id=?2", c.id, u.id, now); return getContact(env, u, c.id);
}
export async function setActivity(env, u, id, b) { const d = await cdb(env), r = await run(d, "UPDATE crm_acts SET done=?3 WHERE id=?1 AND user_id=?2 AND kind='task'", clip(id, 40), u.id, b.done ? 1 : 0); if (!r.meta.changes) throw err("Not found.", 404); return { ok: true }; }
export async function delActivity(env, u, id) { const r = await run(await cdb(env), "DELETE FROM crm_acts WHERE id=?1 AND user_id=?2", clip(id, 40), u.id); if (!r.meta.changes) throw err("Not found.", 404); return { ok: true }; }
/* follow-ups due (overdue first) for the CRM home and the workspace's Next Best Action */
export async function followUps(env, u, days) {
  const d = await cdb(env), until = new Date(Date.now() + (days || 7) * 864e5).toISOString().slice(0, 10), today = nowIso().slice(0, 10);
  return (await all(d, "SELECT a.id, a.body, a.due, c.id AS contact_id, c.name FROM crm_acts a JOIN crm_contacts c ON c.id=a.contact_id WHERE a.user_id=?1 AND a.kind='task' AND a.done=0 AND a.due <= ?2 ORDER BY a.due LIMIT 50", u.id, until)).map((x) => Object.assign(x, { overdue: x.due < today, today: x.due === today }));
}

/* ---------- CSV ---------- */
export function parseCsv(text) {
  const rows = [], s = String(text || "").replace(/^﻿/, ""); let row = [], cell = "", q = false;
  for (let i = 0; i < s.length; i++) { const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true; else if (ch === "," || ch === ";" || ch === "\t") { row.push(cell); cell = ""; } else if (ch === "\n" || ch === "\r") { if (ch === "\r" && s[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; } else cell += ch;
    if (rows.length > 5001) break; }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); } return rows.filter((r) => r.some((x) => String(x).trim()));
}
const COLS = { name: /^(full ?)?name|contact( name)?$/i, first: /^first/i, last: /^(last|sur)/i, email: /e-?mail/i, phone: /phone|mobile|whats ?app|contact (no|number)/i, company: /company|business|organi[sz]ation|firm/i, title: /title|designation|role|position/i, city: /city|location|town/i, tags: /tags?|labels?|segment/i, notes: /notes?|comments?|remarks?/i, source: /source|channel/i };
export async function importCsv(env, u, text) {
  if (String(text || "").length > 2 * 1048576) throw err("CSV files can be up to 2 MB.", 413);
  const R = parseCsv(text); if (R.length < 2) throw err("The CSV needs a header row and at least one contact.");
  const head = R[0].map((h) => clip(h, 60)), map = {}; Object.keys(COLS).forEach((k) => { const i = head.findIndex((h) => COLS[k].test(h)); if (i > -1 && !(k === "name" && map.name != null)) map[k] = i; });
  if (map.email == null && map.phone == null && map.name == null && map.first == null) throw err("Couldn't find name, email or phone columns. Use headers like Name, Email, Phone, Company.");
  const d = await cdb(env), now = nowIso(); let added = 0, dups = 0, bad = 0; const errors = [];
  for (let i = 1; i < Math.min(R.length, 5001); i++) { const r = R[i], g = (k) => (map[k] != null ? r[map[k]] || "" : "");
    let o; try { o = cleanContact({ name: g("name") || [g("first"), g("last")].filter(Boolean).join(" "), email: g("email"), phone: g("phone"), company: g("company"), title: g("title"), city: g("city"), tags: g("tags"), notes: g("notes"), source: SOURCES.indexOf(String(g("source")).toLowerCase()) > -1 ? String(g("source")).toLowerCase() : "import" }); }
    catch (e) { bad++; if (errors.length < 10) errors.push("Row " + (i + 1) + ": " + e.message); continue; }
    if (await findDup(d, u.id, o)) { dups++; continue; }
    await run(d, "INSERT INTO crm_contacts (id, user_id, name, email, phone, company, title, city, source, tags, notes, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?12)", "cc" + randId(14), u.id, o.name, o.email, o.phone, o.company, o.title, o.city, o.source, JSON.stringify(o.tags), o.notes, now); added++; }
  return { added, duplicates: dups, invalid: bad, errors, columns: Object.keys(map), truncated: R.length > 5001 };
}
/* a spreadsheet can't run a formula from a cell: values starting with = + - @ get a leading apostrophe */
const cellOut = (v) => { let s = String(v == null ? "" : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export async function exportCsv(env, u, what) {
  const d = await cdb(env);
  if (what === "deals") { const L = await all(d, "SELECT x.*, c.name AS cname, c.email AS cemail FROM crm_deals x LEFT JOIN crm_contacts c ON c.id=x.contact_id WHERE x.user_id=?1 ORDER BY x.created_at", u.id);
    return [["Deal", "Contact", "Email", "Value (INR)", "Stage", "Probability %", "Expected close", "Lost reason", "Created", "Closed"]].concat(L.map((x) => [x.title, x.cname, x.cemail, x.value, x.stage, x.prob, x.close_on, x.lost_reason, x.created_at, x.closed_at])).map((r) => r.map(cellOut).join(",")).join("\r\n"); }
  const L = await all(d, "SELECT * FROM crm_contacts WHERE user_id=?1 ORDER BY created_at", u.id);
  return [["Name", "Email", "Phone", "Company", "Title", "City", "Source", "Tags", "Notes", "Created"]].concat(L.map((c) => [c.name, c.email, c.phone, c.company, c.title, c.city, c.source, J(c.tags, []).join(", "), c.notes, c.created_at])).map((r) => r.map(cellOut).join(",")).join("\r\n");
}
export async function crmSummary(env, u) { const d = await cdb(env); return { contacts: ((await one(d, "SELECT count(*) n FROM crm_contacts WHERE user_id=?1", u.id)) || {}).n || 0, followUps: await followUps(env, u, 0) }; }
