/* FODO v47.1 Quote builder: numbered, versioned, immutable once sent.
   requested (client asked) / draft (FODO started it) → sent → viewed → negotiation (client asked for changes) → revised (a new
   version, sent again) → accepted | rejected | expired | cancelled.
   - A version that was sent is never changed: any later edit creates the next version (biz_quote_versions is append-only
     after sending). The client only ever sees versions that were sent.
   - Acceptance records who, when, which version, plus a hash of the IP and the browser (no raw IP stored).
   - Every price is re-calculated on the server from the catalog (production.js); the internal view (cost, FODO revenue,
     margin, provider payout) is stored next to each version and shown to FODO staff only.
   - Formats: web view, printable HTML (Print → Save as PDF), WhatsApp / email summary, CSV line items, JSON. */
import { nowIso, randId, isOwner, OWNER_EMAILS, count } from "./accounts.js";
import { err, can, auditLog, notify } from "./biz.js";
import { pdb, estimate, template, pricingConfig } from "./production.js";

const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
const all = async (d, sql, ...a) => (await d.prepare(sql).bind(...a).all()).results || [];
const one = (d, sql, ...a) => d.prepare(sql).bind(...a).first();
const run = (d, sql, ...a) => d.prepare(sql).bind(...a).run();
const inr = (n) => n == null ? "rate to be confirmed" : "₹" + Math.round(+n).toLocaleString("en-IN");
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const QUOTE_STATES = ["requested", "draft", "sent", "viewed", "negotiation", "revised", "accepted", "rejected", "expired", "cancelled"];
const OPEN = ["sent", "viewed", "negotiation"];

const MIG = [
  "CREATE TABLE IF NOT EXISTS biz_quotes (id TEXT PRIMARY KEY, number TEXT UNIQUE, client_id TEXT, build_id TEXT, project_id TEXT, title TEXT, status TEXT, version INTEGER, sent_version INTEGER, expires_at TEXT, sent_at TEXT, viewed_at TEXT, accepted_version INTEGER, accepted_at TEXT, accepted_by TEXT, accept_meta TEXT, client_note TEXT, created_by TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE INDEX IF NOT EXISTS biz_quotes_c ON biz_quotes(client_id, updated_at)",
  "CREATE INDEX IF NOT EXISTS biz_quotes_s ON biz_quotes(status, updated_at)",
  "CREATE TABLE IF NOT EXISTS biz_quote_versions (quote_id TEXT, version INTEGER, data TEXT, internal TEXT, total INTEGER, created_by TEXT, created_at TEXT, sent_at TEXT, PRIMARY KEY (quote_id, version))",
  "CREATE TABLE IF NOT EXISTS biz_quote_events (id INTEGER PRIMARY KEY AUTOINCREMENT, quote_id TEXT, version INTEGER, kind TEXT, by_email TEXT, note TEXT, created_at TEXT)",
];
const ready = new WeakSet();
export async function qdb(env) { const d = await pdb(env); if (!ready.has(d)) { await (await import("./accounts.js")).migrateOnce(d, MIG); ready.add(d); } return d; }
const event = (d, q, v, kind, by, note) => run(d, "INSERT INTO biz_quote_events (quote_id, version, kind, by_email, note, created_at) VALUES (?1,?2,?3,?4,?5,?6)", q, v, kind, by || "", clip(note, 500), nowIso());
const staff = (R) => can(R, ["admin", "finance", "viewer"]);
async function ownersNotify(env, text, link) { try { const d = await qdb(env); for (const o of await all(d, "SELECT id FROM acct_users WHERE lower(email) IN (" + OWNER_EMAILS.map(() => "?").join(",") + ")", ...OWNER_EMAILS)) await notify(env, o.id, "quote", text, link); } catch (e) {} }

/* the snapshot: everything the client agrees to, frozen inside the version */
async function snapshot(env, R, input, client, meta) {
  const t = await template(env, input.templateId), est = await estimate(env, Object.assign({}, R, { roles: ["admin", "client"] }), Object.assign({}, input, { tier: input.tier })), tier = est.tiers[input.tier] ? input.tier : est.recommended, T = est.tiers[tier];
  const C = await pricingConfig(env), A = est.answers, validity = Math.max(1, Math.min(90, +meta.validityDays || C.quoteValidityDays || 7));
  const plan = (Array.isArray(meta.paymentPlan) && meta.paymentPlan.length ? meta.paymentPlan : C.paymentPlan).map((p) => ({ label: clip(p.label, 60), pct: +p.pct })), sumPct = plan.reduce((a, p) => a + p.pct, 0);
  if (Math.round(sumPct) !== 100) throw err("The payment plan must add up to 100%.");
  let left = T.price.total; const schedule = plan.map((p, i) => { const amt = i === plan.length - 1 ? left : Math.round(T.price.total * p.pct / 100); left -= amt; return { label: p.label, pct: p.pct, amount: amt }; });
  const scope = t.questions.filter((q) => A[q.id] != null && A[q.id] !== "" && ["promote", "notes", "budget"].indexOf(q.id) < 0).map((q) => ({ label: q.label.replace(/\?$/, ""), value: q.type === "yesno" ? (A[q.id] === "yes" ? "Yes" : "No") : String(A[q.id]) }));
  const deliverables = [["hero", "Hero / main video"], ["reels", "Short-form cutdowns / reels"], ["photos", "Edited photos"], ["creatives", "Ad creatives per month"], ["pages", "Website pages"]].filter((x) => +A[x[0]] > 0).map((x) => ({ label: x[1], count: +A[x[0]] }));
  const internal = T.price.internal || null; const price = Object.assign({}, T.price); delete price.internal;
  const data = { title: clip(meta.title, 120) || (t.id === "custom" && A.promote ? String(A.promote).slice(0, 80) : t.name + (A.promote ? ": " + String(A.promote).slice(0, 60) : "")), client: { name: client.name || "", email: client.email || "", company: clip(meta.company, 120) },
    templateId: t.id, templateName: t.name, tier, tierLabel: T.label, mode: A.mode, summary: clip(meta.summary, 1500) || String(A.promote || ""), objectives: clip(meta.objectives, 1000), scope, deliverables,
    team: T.team.map((x) => ({ role: x.name, qty: x.qty, units: x.units, unitLabel: x.unitLabel, rate: x.rate, amount: x.amount })), equipment: T.equipment.map((x) => ({ item: x.name, qty: x.qty, days: x.days, rate: x.rate, amount: x.amount })),
    extra: price.extra || [], price: { groups: price.groups, subtotal: price.subtotal, tax: price.tax, total: price.total, incomplete: price.incomplete, band: price.band },
    timeline: { date: A.date || null, shootDays: A.shoot_days || null, months: A.months || null, note: clip(meta.timeline, 600) }, capacity: T.capacityText, assumptions: T.assumptions.concat((meta.assumptions || []).map((x) => clip(x, 200)).filter(Boolean).slice(0, 10)),
    exclusions: (meta.exclusions && meta.exclusions.length ? meta.exclusions : ["Ad spend paid to ad platforms", "Talent usage beyond the stated media", "Location / venue fees unless listed", "Travel outside the city unless listed", "Revisions beyond those stated"]).map((x) => clip(x, 200)).slice(0, 12),
    warnings: T.warnings, schedule, validityDays: validity, usage: A.usage || clip(meta.usage, 200) || null, revisions: clip(meta.revisions, 200) || null, terms: clip(meta.terms, 3000) || C.terms, notes: clip(meta.notes, 1500),
    answers: A, custom: input.custom || null, adjust: input.adjust || null, pricedAt: nowIso() };
  return { data, internal, total: price.total };
}
const out = (q, v, staffView, events, versions) => Object.assign({ id: q.id, number: q.number, title: q.title, status: q.status, version: v ? v.version : null, latestVersion: q.version, sentVersion: q.sent_version, expiresAt: q.expires_at, sentAt: q.sent_at, viewedAt: q.viewed_at,
  acceptedVersion: q.accepted_version, acceptedAt: q.accepted_at, clientNote: q.client_note, createdAt: q.created_at, updatedAt: q.updated_at, data: v ? J(v.data, {}) : null }, staffView ? { internal: v ? J(v.internal, null) : null, clientId: q.client_id, buildId: q.build_id, events: events || [], versions: versions || [] } : { versions: versions || [] });

/* client asks for a quote from a saved Project Builder draft */
export async function requestQuote(env, u, R, b) {
  const d = await qdb(env); if (await count(env, "quote:" + u.id, 20, 3600)) throw err("Too many quote requests this hour.", 429);
  const bd = await one(d, "SELECT * FROM biz_builds WHERE id=?1 AND user_id=?2", clip(b.buildId, 40), u.id); if (!bd) throw err("Save your project first.", 404); if (bd.status !== "draft") throw err("A quote was already requested for this draft.", 409);
  const input = { templateId: bd.template_id, answers: J(bd.answers, {}), tier: bd.tier, custom: J(bd.custom, null) }, s = await snapshot(env, R, input, { name: u.name, email: u.email }, { company: b.company, notes: b.note });
  const q = await create(env, d, u.id, bd.id, s, "requested", u.email); await run(d, "UPDATE biz_builds SET status='quoted', quote_id=?2, updated_at=?3 WHERE id=?1 AND status='draft'", bd.id, q.id, nowIso());
  await ownersNotify(env, "Quote requested: " + s.data.title + " (" + inr(s.total) + " estimate)", "#admin?tab=quotes&id=" + q.id); return getQuote(env, u, R, q.id);
}
/* FODO staff starts a quote for a client (or clones one) */
export async function adminCreate(env, u, R, b) {
  if (!can(R, ["admin"])) throw err("Only FODO admins create quotes.", 403); const d = await qdb(env), email = clip(b.clientEmail, 200).toLowerCase();
  const c = await one(d, "SELECT id, email, name FROM acct_users WHERE lower(email)=?1", email); if (!c) throw err("No FODO account with that email. Ask the client to sign up first.", 404);
  const s = await snapshot(env, R, { templateId: b.templateId, answers: b.answers, tier: b.tier, custom: b.custom, adjust: b.adjust }, c, b); const q = await create(env, d, c.id, null, s, "draft", u.email); return getQuote(env, u, R, q.id);
}
async function create(env, d, clientId, buildId, s, status, by) {
  const now = nowIso(), id = "qt" + randId(14); let number = null;
  for (let i = 0; i < 6 && !number; i++) { const n = ((await one(d, "SELECT count(*) n FROM biz_quotes")) || {}).n + 1 + i, cand = "FQ-" + now.slice(2, 4) + now.slice(5, 7) + "-" + String(n).padStart(4, "0");
    try { await run(d, "INSERT INTO biz_quotes (id, number, client_id, build_id, title, status, version, created_by, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,1,?7,?8,?8)", id, cand, clientId, buildId, s.data.title, status, by, now); number = cand; } catch (e) { if (!/UNIQUE/i.test(String(e.message || e))) throw e; } }
  if (!number) throw err("Couldn't number the quote, try again.", 409);
  try { const bill = await (await import("./orgs.js")).billingOf(env, clientId); if (bill) s.data.client = Object.assign({}, s.data.client, { company: (s.data.client && s.data.client.company) || bill.legalName, gstin: bill.gstin, address: bill.address, org: bill.name }); } catch (e) {}   /* v47.6 organization billing profile */
  await run(d, "INSERT INTO biz_quote_versions (quote_id, version, data, internal, total, created_by, created_at) VALUES (?1,1,?2,?3,?4,?5,?6)", id, JSON.stringify(s.data), JSON.stringify(s.internal), s.total, by, now);
  await event(d, id, 1, status === "requested" ? "requested" : "created", by, s.data.title); await auditLog(env, by, "quote:create", id, number + " " + s.total); return { id, number };
}
async function expireIfDue(d, q) { if (OPEN.indexOf(q.status) > -1 && q.expires_at && q.expires_at < nowIso()) { const x = await run(d, "UPDATE biz_quotes SET status='expired', updated_at=?2 WHERE id=?1 AND status IN ('sent','viewed','negotiation')", q.id, nowIso()); if (x.meta.changes) { await event(d, q.id, q.sent_version, "expired", "system", ""); q.status = "expired"; } } return q; }
export async function getQuote(env, u, R, id, opts) {
  const d = await qdb(env); let q = await one(d, "SELECT * FROM biz_quotes WHERE id=?1", clip(id, 40)); const st = staff(R);
  if (!q || (q.client_id !== u.id && !st && !(await peer(env, u, q.client_id)))) throw err("Quote not found.", 404); q = await expireIfDue(d, q);
  if (!st && !q.sent_version && q.status !== "requested") throw err("Quote not found.", 404);   // a FODO draft stays private until it is sent
  if (!st) {   // the client sees the latest SENT version; before FODO sends, only the request itself
    if (!q.sent_version) { const o = out(q, null, false, null, []), v1 = J((await one(d, "SELECT data FROM biz_quote_versions WHERE quote_id=?1 AND version=1", q.id) || {}).data, {}); o.data = { title: v1.title, templateName: v1.templateName, summary: v1.summary, tierLabel: v1.tierLabel, pending: true }; return o; }
    if (q.status === "sent" && !(opts && opts.noView)) { await run(d, "UPDATE biz_quotes SET status='viewed', viewed_at=COALESCE(viewed_at, ?2), updated_at=?2 WHERE id=?1 AND status='sent'", q.id, nowIso()); await event(d, q.id, q.sent_version, "viewed", u.email, ""); q = await one(d, "SELECT * FROM biz_quotes WHERE id=?1", q.id); }
    const v = await one(d, "SELECT * FROM biz_quote_versions WHERE quote_id=?1 AND version=?2", q.id, q.sent_version);
    return out(q, v, false, null, await all(d, "SELECT version, total, sent_at FROM biz_quote_versions WHERE quote_id=?1 AND sent_at IS NOT NULL ORDER BY version DESC", q.id)); }
  const ver = opts && opts.version ? +opts.version : q.version, v = await one(d, "SELECT * FROM biz_quote_versions WHERE quote_id=?1 AND version=?2", q.id, ver);
  return out(q, v, true, await all(d, "SELECT version, kind, by_email, note, created_at FROM biz_quote_events WHERE quote_id=?1 ORDER BY id DESC LIMIT 100", q.id), await all(d, "SELECT version, total, created_at, sent_at, created_by FROM biz_quote_versions WHERE quote_id=?1 ORDER BY version DESC", q.id));
}
/* v47.6: colleagues in the same organization may read each other's quotes */
async function peer(env, u, ownerId) { try { return (await (await import("./orgs.js")).peersOf(env, u)).indexOf(ownerId) > -1; } catch (e) { return false; } }
export async function myQuotes(env, u) { const d = await qdb(env); return all(d, "SELECT q.id, q.number, q.title, q.status, q.sent_version, q.expires_at, q.updated_at, v.total FROM biz_quotes q LEFT JOIN biz_quote_versions v ON v.quote_id=q.id AND v.version=COALESCE(q.sent_version, 1) WHERE q.client_id=?1 AND (q.sent_version IS NOT NULL OR q.status='requested') ORDER BY q.updated_at DESC LIMIT 100", u.id); }
export async function adminQuotes(env, R, q) { if (!staff(R)) throw err("Not allowed.", 403); const d = await qdb(env), st = QUOTE_STATES.indexOf(q.status) > -1 ? q.status : "";
  return all(d, "SELECT q.id, q.number, q.title, q.status, q.version, q.sent_version, q.expires_at, q.updated_at, u.email client, v.total FROM biz_quotes q LEFT JOIN acct_users u ON u.id=q.client_id LEFT JOIN biz_quote_versions v ON v.quote_id=q.id AND v.version=q.version WHERE (?1='' OR q.status=?1) ORDER BY q.updated_at DESC LIMIT 200", st); }

/* staff edits: before the first send the working version is replaced; after a send, a NEW version is made (the sent one never changes) */
export async function revise(env, u, R, id, b) {
  if (!can(R, ["admin"])) throw err("Only FODO admins edit quotes.", 403); const d = await qdb(env), q = await one(d, "SELECT * FROM biz_quotes WHERE id=?1", clip(id, 40)); if (!q) throw err("Quote not found.", 404);
  if (["accepted", "rejected", "cancelled"].indexOf(q.status) > -1) throw err("This quote is " + q.status + ". Clone it to start a new one.", 409);
  const cur = await one(d, "SELECT * FROM biz_quote_versions WHERE quote_id=?1 AND version=?2", q.id, q.version), c0 = J(cur.data, {}), client = await one(d, "SELECT name, email FROM acct_users WHERE id=?1", q.client_id) || {};
  const input = { templateId: c0.templateId, answers: b.answers || c0.answers, tier: b.tier || c0.tier, custom: b.custom !== undefined ? b.custom : c0.custom, adjust: b.adjust !== undefined ? b.adjust : c0.adjust };
  const meta = Object.assign({ title: c0.title, company: c0.client && c0.client.company, summary: c0.summary, objectives: c0.objectives, notes: c0.notes, terms: c0.terms, usage: c0.usage, revisions: c0.revisions, exclusions: c0.exclusions, validityDays: c0.validityDays, paymentPlan: c0.schedule && c0.schedule.map((x) => ({ label: x.label, pct: x.pct })), timeline: c0.timeline && c0.timeline.note }, b);
  const s = await snapshot(env, R, input, client, meta), now = nowIso(), reason = clip(b.reason, 300);
  if (cur.sent_at) { if (reason.length < 3) throw err("Say what changed (the client sees it with the new version)."); const nv = q.version + 1;
    await run(d, "INSERT INTO biz_quote_versions (quote_id, version, data, internal, total, created_by, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)", q.id, nv, JSON.stringify(Object.assign(s.data, { changeNote: reason })), JSON.stringify(s.internal), s.total, u.email, now);
    await run(d, "UPDATE biz_quotes SET version=?2, title=?3, status=CASE WHEN status IN ('sent','viewed','negotiation','expired') THEN 'revised' ELSE status END, updated_at=?4 WHERE id=?1", q.id, nv, s.data.title, now); await event(d, q.id, nv, "revised", u.email, reason); }
  else { await run(d, "UPDATE biz_quote_versions SET data=?3, internal=?4, total=?5, created_by=?6, created_at=?7 WHERE quote_id=?1 AND version=?2 AND sent_at IS NULL", q.id, q.version, JSON.stringify(s.data), JSON.stringify(s.internal), s.total, u.email, now);
    await run(d, "UPDATE biz_quotes SET title=?2, updated_at=?3 WHERE id=?1", q.id, s.data.title, now); await event(d, q.id, q.version, "edited", u.email, reason || "draft edited"); }
  await auditLog(env, u.email, "quote:revise", q.id, q.number + " → " + s.total + (reason ? " · " + reason : "")); return getQuote(env, u, R, q.id);
}
export async function send(env, u, R, id) {
  if (!can(R, ["admin"])) throw err("Only FODO admins send quotes.", 403); const d = await qdb(env), q = await one(d, "SELECT * FROM biz_quotes WHERE id=?1", clip(id, 40)); if (!q) throw err("Quote not found.", 404);
  if (["accepted", "rejected", "cancelled"].indexOf(q.status) > -1) throw err("This quote is " + q.status + ".", 409); const v = await one(d, "SELECT * FROM biz_quote_versions WHERE quote_id=?1 AND version=?2", q.id, q.version), data = J(v.data, {});
  if (v.sent_at && q.status !== "expired") throw err("This version was already sent. Edit the quote to make a new version.", 409);
  if (data.price && data.price.incomplete) throw err("Some items have no rate yet (\"rate to be confirmed\"). Set them in the catalog or replace them before sending.", 409);
  const now = nowIso(), exp = new Date(Date.now() + (data.validityDays || 7) * 864e5).toISOString();
  await run(d, "UPDATE biz_quote_versions SET sent_at=COALESCE(sent_at, ?3) WHERE quote_id=?1 AND version=?2", q.id, q.version, now);
  await run(d, "UPDATE biz_quotes SET status='sent', sent_version=?2, sent_at=?3, expires_at=?4, updated_at=?3 WHERE id=?1", q.id, q.version, now, exp);
  await event(d, q.id, q.version, "sent", u.email, "valid until " + exp.slice(0, 10)); await auditLog(env, u.email, "quote:send", q.id, q.number + " v" + q.version);
  await notify(env, q.client_id, "quote", "Your FODO quote " + q.number + (q.version > 1 ? " (version " + q.version + ")" : "") + " is ready: " + data.title + ", " + inr(v.total) + ".", "#quote=" + q.id); return getQuote(env, u, R, q.id);
}
/* the client's answer */
export async function answer(env, u, R, id, kind, b, req) {
  const d = await qdb(env); let q = await one(d, "SELECT * FROM biz_quotes WHERE id=?1", clip(id, 40)); if (!q || !(await (await import("./orgs.js")).mayAct(env, u, q.client_id))) throw err("Quote not found.", 404); q = await expireIfDue(d, q);   /* v47.6: an organization admin may answer a colleague's quote when the organization allows it */
  if (q.status === "expired") throw err("This quote expired. Ask FODO for an updated one.", 409); if (OPEN.indexOf(q.status) < 0) throw err(q.status === "accepted" ? "You already accepted this quote." : "This quote can't be answered now (" + q.status + ").", 409);
  const now = nowIso();
  if (kind === "accept") { if (+b.version !== q.sent_version) throw err("A newer version was sent. Review it before accepting.", 409); if (b.agree !== true) throw err("Tick that you agree to the quote and its terms.");
    const ua = clip(req && req.headers.get("user-agent"), 300), ip = (req && (req.headers.get("cf-connecting-ip") || "")) || "", h = ip ? Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("fodo-quote:" + ip)))).slice(0, 12).map((x) => x.toString(16).padStart(2, "0")).join("") : null;
    const x = await run(d, "UPDATE biz_quotes SET status='accepted', accepted_version=?2, accepted_at=?3, accepted_by=?4, accept_meta=?5, updated_at=?3 WHERE id=?1 AND status IN ('sent','viewed','negotiation') AND sent_version=?2", q.id, q.sent_version, now, u.id, JSON.stringify({ ipHash: h, ua, email: u.email }));
    if (!x.meta.changes) throw err("This quote changed meanwhile, reload.", 409); await event(d, q.id, q.sent_version, "accepted", u.email, "");
    await auditLog(env, u.email, "quote:accept", q.id, q.number + " v" + q.sent_version); await ownersNotify(env, "Quote accepted: " + q.number + " " + q.title, "#admin?tab=quotes&id=" + q.id);
    try { await (await import("./teams.js")).fromQuote(env, q.id, u.email); } catch (e) { await event(d, q.id, q.sent_version, "team_error", "system", String(e.message || e).slice(0, 200)); } }   // v47.2: the team to staff
  else if (kind === "decline") { await run(d, "UPDATE biz_quotes SET status='rejected', client_note=?2, updated_at=?3 WHERE id=?1", q.id, clip(b.reason, 1000), now); await event(d, q.id, q.sent_version, "rejected", u.email, clip(b.reason, 500)); await ownersNotify(env, "Quote declined: " + q.number, "#admin?tab=quotes&id=" + q.id); }
  else if (kind === "changes") { const n = clip(b.note, 2000); if (n.length < 5) throw err("Tell FODO what to change."); await run(d, "UPDATE biz_quotes SET status='negotiation', client_note=?2, updated_at=?3 WHERE id=?1", q.id, n, now); await event(d, q.id, q.sent_version, "changes_requested", u.email, n); await ownersNotify(env, "Changes requested on " + q.number + ": " + n.slice(0, 120), "#admin?tab=quotes&id=" + q.id); }
  else throw err("Unknown action.");
  return getQuote(env, u, R, q.id, { noView: true });
}
export async function cancel(env, u, R, id, b) { if (!can(R, ["admin"])) throw err("Only FODO admins cancel quotes.", 403); const d = await qdb(env), x = await run(d, "UPDATE biz_quotes SET status='cancelled', updated_at=?2 WHERE id=?1 AND status NOT IN ('accepted','cancelled')", clip(id, 40), nowIso()); if (!x.meta.changes) throw err("This quote can't be cancelled.", 409); await event(d, clip(id, 40), null, "cancelled", u.email, clip(b.reason, 300)); await auditLog(env, u.email, "quote:cancel", clip(id, 40), clip(b.reason, 200)); return getQuote(env, u, R, id); }
/* a copy re-priced with TODAY's catalog (historical prices are never copied as active pricing) */
export async function clone(env, u, R, id) { if (!can(R, ["admin"])) throw err("Only FODO admins clone quotes.", 403); const d = await qdb(env), q = await one(d, "SELECT * FROM biz_quotes WHERE id=?1", clip(id, 40)); if (!q) throw err("Quote not found.", 404);
  const v = J((await one(d, "SELECT data FROM biz_quote_versions WHERE quote_id=?1 AND version=?2", q.id, q.version)).data, {}), client = await one(d, "SELECT id, name, email FROM acct_users WHERE id=?1", q.client_id) || { id: q.client_id };
  const s = await snapshot(env, R, { templateId: v.templateId, answers: v.answers, tier: v.tier, custom: v.custom, adjust: v.adjust }, client, { title: v.title + " (copy)", company: v.client && v.client.company, summary: v.summary, notes: v.notes, terms: v.terms, exclusions: v.exclusions, paymentPlan: (v.schedule || []).map((x) => ({ label: x.label, pct: x.pct })) });
  const n = await create(env, d, q.client_id, null, s, "draft", u.email); await event(d, n.id, 1, "cloned", u.email, "from " + q.number + " (re-priced with today's catalog)"); return getQuote(env, u, R, n.id); }

/* ---------- formats ---------- */
export function whatsapp(q, origin) { const v = q.data || {}, del = (v.deliverables || []).map((x) => x.count + " " + x.label).join("\n"); const people = (v.team || []).reduce((a, x) => a + x.qty, 0);
  return ["FODO Project Proposal", "", "Project:", v.title, v.timeline && v.timeline.date ? "\nDate:\n" + new Date(v.timeline.date + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null, "", "Team:", people + " professional" + (people === 1 ? "" : "s") + " (" + v.tierLabel + ")",
    (v.equipment || []).length ? "\nEquipment:\n" + v.equipment.slice(0, 4).map((x) => x.item).join(" + ") : null, del ? "\nDeliverables:\n" + del : null, "", "Investment:", inr(v.price && v.price.total) + (v.price && v.price.tax && v.price.tax.charged ? " incl. " + v.price.tax.label : ""), "", "Validity:", (v.validityDays || 7) + " days", "", "View proposal: " + (origin || "https://www.fodo.co.in") + "/workspace/#quote=" + q.id].filter((x) => x != null).join("\n"); }
export function csv(q) { const v = q.data || {}, c = (s) => { s = String(s == null ? "" : s); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }, rows = [["Section", "Item", "Qty", "Units", "Rate (INR)", "Amount (INR)"]];
  (v.team || []).forEach((x) => rows.push(["Team", x.role, x.qty, x.units + " " + x.unitLabel, x.rate == null ? "" : x.rate, x.amount == null ? "" : x.amount])); (v.equipment || []).forEach((x) => rows.push(["Equipment", x.item, x.qty, x.days + " days", x.rate == null ? "" : x.rate, x.amount == null ? "" : x.amount]));
  (v.extra || []).forEach((x) => rows.push([x.group, x.label, 1, "", "", x.amount])); ((v.price || {}).groups || []).forEach((g) => rows.push(["Summary", g.label, "", "", "", g.amount])); if (v.price) { rows.push(["Summary", "Subtotal", "", "", "", v.price.subtotal]); rows.push(["Summary", (v.price.tax || {}).label || "Tax", "", "", "", (v.price.tax || {}).amount || 0]); rows.push(["Summary", "Total", "", "", "", v.price.total]); }
  return rows.map((r) => r.map(c).join(",")).join("\r\n") + "\r\n"; }
export function printable(q) {
  const v = q.data || {}, P = v.price || {}, d0 = (s) => s ? new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "", big = (v.team || []).length >= 6 || (P.total || 0) >= 100000;
  const rows = (L, f) => L.map(f).join(""), sec = (t, h) => '<section><h2>' + t + "</h2>" + h + "</section>";
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + esc(q.number + " · " + v.title) + '</title><style>' +
    ":root{--ink:#0B0B0C;--mut:#5a5a66;--line:#e3e3e8;--dot:#7B61FF;--soft:#f5f5f3}*{box-sizing:border-box}body{margin:0;font:14px/1.55 system-ui,-apple-system,Segoe UI,Inter,Arial,sans-serif;color:var(--ink);background:#fff}main{max-width:860px;margin:0 auto;padding:40px 28px}" +
    ".cover{min-height:" + (big ? "92vh" : "auto") + ";display:flex;flex-direction:column;justify-content:" + (big ? "space-between" : "flex-start") + ";padding-bottom:24px;border-bottom:1px solid var(--line);margin-bottom:28px}.mark{font-weight:800;font-size:34px;letter-spacing:-.06em}.mark i{display:inline-block;width:.2em;height:.2em;border-radius:50%;background:var(--dot);vertical-align:top;margin-left:2px}" +
    ".tag{font-size:10px;letter-spacing:.2em;color:var(--mut)}h1{font-size:" + (big ? "42px" : "28px") + ";line-height:1.1;letter-spacing:-.02em;margin:" + (big ? "0" : "18px 0 6px") + "}.meta{color:var(--mut)}h2{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);margin:30px 0 10px}" +
    ".cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.card{border:1px solid var(--line);border-radius:12px;padding:12px 14px}.card small{display:block;color:var(--mut);font-size:11px}.card b{font-size:18px}" +
    "table{width:100%;border-collapse:collapse}td,th{padding:8px 6px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-size:11px;color:var(--mut);font-weight:600}td.n,th.n{text-align:right;white-space:nowrap}.tot td{font-weight:800;font-size:18px;border-bottom:0;border-top:2px solid var(--ink)}" +
    "ul{padding-left:18px}.cta{margin-top:28px;padding:18px;border-radius:14px;background:var(--soft)}.warn{color:#9a6700}.foot{margin-top:40px;color:var(--mut);font-size:11px}@media print{main{padding:0}.noprint{display:none}section{break-inside:avoid}.cover{break-after:" + (big ? "page" : "auto") + "}}" +
    '</style></head><body><main><div class="cover"><div><div class="mark">FODO<i></i></div><div class="tag">FEAR OF DIGITALLY OUT ?</div></div><div><h1>' + esc(v.title) + '</h1><p class="meta">Prepared for ' + esc(v.client && (v.client.company || v.client.name || v.client.email)) + (v.client && v.client.gstin ? " (GSTIN " + esc(v.client.gstin) + ")" : "") + " · Quote " + esc(q.number) + " · version " + esc(q.version) + "<br>Issued " + esc(d0(q.sentAt || q.createdAt)) + (q.expiresAt ? " · valid until " + esc(d0(q.expiresAt)) : " · valid " + esc(v.validityDays) + " days from sending") + "</p></div>" +
    '<p class="noprint meta">To save a PDF: press Ctrl + P (⌘ + P on a Mac) and choose "Save as PDF".</p></div>' +
    sec("Executive summary", "<p>" + esc(v.summary) + "</p>" + (v.objectives ? "<p>" + esc(v.objectives) + "</p>" : "") + '<div class="cards"><div class="card"><small>Team</small><b>' + (v.team || []).reduce((a, x) => a + x.qty, 0) + " people</b><small>" + esc(v.tierLabel) + '</small></div><div class="card"><small>Mode</small><b>' + esc(v.mode) + "</b></div>" + (v.timeline && v.timeline.date ? '<div class="card"><small>Date</small><b>' + esc(d0(v.timeline.date)) + "</b></div>" : "") + '<div class="card"><small>Investment</small><b>' + esc(inr(P.total)) + "</b></div></div>") +
    (v.scope && v.scope.length ? sec("Scope", "<table>" + rows(v.scope, (x) => "<tr><td>" + esc(x.label) + "</td><td>" + esc(x.value) + "</td></tr>") + "</table>") : "") +
    (v.deliverables && v.deliverables.length ? sec("Deliverables", '<div class="cards">' + rows(v.deliverables, (x) => '<div class="card"><b>' + esc(x.count) + "</b><small>" + esc(x.label) + "</small></div>") + "</div>" + (v.capacity ? '<p class="meta">' + esc(v.capacity) + " (an estimate based on the scope, not a guarantee)</p>" : "")) : "") +
    sec("Team", '<table><tr><th>Role</th><th class="n">Qty</th><th class="n">Time</th><th class="n">Rate</th><th class="n">Amount</th></tr>' + rows(v.team || [], (x) => "<tr><td>" + esc(x.role) + '</td><td class="n">' + x.qty + '</td><td class="n">' + esc(x.units + " " + x.unitLabel) + '</td><td class="n">' + esc(inr(x.rate)) + '</td><td class="n">' + esc(inr(x.amount)) + "</td></tr>") + "</table>") +
    ((v.equipment || []).length ? sec("Equipment", '<table><tr><th>Item</th><th class="n">Qty</th><th class="n">Days</th><th class="n">Amount</th></tr>' + rows(v.equipment, (x) => "<tr><td>" + esc(x.item) + '</td><td class="n">' + x.qty + '</td><td class="n">' + x.days + '</td><td class="n">' + esc(inr(x.amount)) + "</td></tr>") + "</table>") : "") +
    sec("Timeline", "<p>" + [v.timeline && v.timeline.date ? "Start / shoot: " + esc(d0(v.timeline.date)) : null, v.timeline && v.timeline.shootDays ? esc(v.timeline.shootDays) + " shoot day(s)" : null, v.timeline && v.timeline.months ? esc(v.timeline.months) + " month(s)" : null, v.timeline && v.timeline.note ? esc(v.timeline.note) : null].filter(Boolean).join(" · ") + "</p>") +
    sec("Investment", "<table>" + rows(P.groups || [], (g) => "<tr><td>" + esc(g.label) + '</td><td class="n">' + esc(inr(g.amount)) + "</td></tr>") + "<tr><td>Subtotal</td><td class=\"n\">" + esc(inr(P.subtotal)) + "</td></tr><tr><td>" + esc((P.tax || {}).label) + ((P.tax || {}).charged ? " (" + P.tax.pct + "%)" : "") + '</td><td class="n">' + ((P.tax || {}).charged ? esc(inr(P.tax.amount)) : "Not charged") + '</td></tr><tr class="tot"><td>Total</td><td class="n">' + esc(inr(P.total)) + "</td></tr></table>" + (P.band ? '<p class="meta">' + esc(P.band) + "</p>" : "")) +
    sec("Payment schedule", "<table>" + rows(v.schedule || [], (s) => "<tr><td>" + esc(s.label) + '</td><td class="n">' + s.pct + '%</td><td class="n">' + esc(inr(s.amount)) + "</td></tr>") + "</table>") +
    sec("Assumptions", "<ul>" + rows(v.assumptions || [], (a) => "<li>" + esc(a) + "</li>") + "</ul>") + sec("Not included", "<ul>" + rows(v.exclusions || [], (a) => "<li>" + esc(a) + "</li>") + "</ul>") +
    ((v.warnings || []).length ? sec("Please note", "<ul>" + rows(v.warnings, (a) => '<li class="warn">' + esc(a) + "</li>") + "</ul>") : "") +
    sec("Terms", "<p>" + esc(v.terms) + "</p>" + (v.usage ? "<p>Usage rights: " + esc(v.usage) + "</p>" : "") + (v.revisions ? "<p>Revisions: " + esc(v.revisions) + "</p>" : "")) +
    '<div class="cta"><b>Acceptance</b><p>' + (q.status === "accepted" ? "Accepted on " + esc(d0(q.acceptedAt)) + " (version " + esc(q.acceptedVersion) + ")." : "To accept, open this quote in your FODO Workspace and press Accept. FODO then confirms the team and sends the contract and payment schedule.") + "</p></div>" +
    '<p class="foot">FODO · www.fodo.co.in · ' + esc(q.number) + " v" + esc(q.version) + ". Prices are in Indian rupees.</p></main></body></html>";
}
