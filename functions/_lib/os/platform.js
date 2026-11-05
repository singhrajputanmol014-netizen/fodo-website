/* FODO OS V4 Phase 7 (v50.7): integration registry + subscriptions tracker.
   Integrations: the built-in connections are read from the real configuration (secret NAMES only, never values) and from real
   activity where FODO records it (last mail sent, Google connector last use). Owners revoke a Google connection here (the token is
   revoked at Google and deleted). Other tools the team uses are registered by hand with owner, purpose, data shared, last sync and
   token expiry; FODO does not hold their keys, so "revoke" records it and reminds you to revoke at the provider.
   Subscriptions: every paid tool, its cost per cycle, renewal date, owner and seats; monthly equivalent and totals; a reminder
   7 days before renewal; finance can turn a renewal into a payable. Card and account numbers are refused. */
import { nowIso, payOn } from "../accounts.js";
import { notify, payoutsOn } from "../biz.js";
import { osdb, one, all, run, clip, err, int, DAY, rid, ORG } from "./db.js";
import { has } from "./authz.js";
import { audit } from "./audit.js";
import { today, addDays, ownerIds, nameOf, looksLikeAccountNo } from "./kit.js";

const DDL = [
  "CREATE TABLE IF NOT EXISTS os_integrations (id TEXT PRIMARY KEY, org_id TEXT, name TEXT, provider TEXT, purpose TEXT, data_shared TEXT, owner_user_id TEXT, status TEXT, connected_on TEXT, last_sync TEXT, token_expires TEXT, scopes TEXT, notes TEXT, revoked_at TEXT, revoked_by TEXT, revoke_reason TEXT, created_by TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS os_subscriptions (id TEXT PRIMARY KEY, org_id TEXT, name TEXT, vendor TEXT, category TEXT, plan TEXT, cost INTEGER, cycle TEXT, seats INTEGER, seats_used INTEGER, owner_user_id TEXT, department_id TEXT, renews_on TEXT, auto_renew INTEGER DEFAULT 1, paid_via TEXT, status TEXT, cancel_note TEXT, notes TEXT, payable_id TEXT, created_by TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE INDEX IF NOT EXISTS os_subs_r ON os_subscriptions(status, renews_on)"
];
const made = new WeakSet();
export async function pdb(env) { const d = await osdb(env); if (!made.has(d)) { for (const q of DDL) await d.prepare(q).run(); made.add(d); } return d; }
const safe = async (fn, dflt) => { try { return await fn(); } catch (e) { return dflt; } };

/* ---------------- integrations ---------------- */
const BUILTIN = (env) => [
  { id: "mail", name: "Email (Resend)", purpose: "Login codes, notifications, support replies", data_shared: "Recipient email, subject, message text", secrets: ["RESEND_API_KEY", "MAIL_FROM"], on: !!env.RESEND_API_KEY },
  { id: "whatsapp", name: "WhatsApp Business", purpose: "Support conversations on WhatsApp (they arrive as support tickets)", data_shared: "Phone number, message text", secrets: ["WA_NUMBER", "WA_TOKEN", "WA_PHONE_ID", "WA_APP_SECRET"], on: !!(env.WA_NUMBER && env.WA_TOKEN && env.WA_PHONE_ID && env.WA_APP_SECRET) },
  { id: "payments", name: "Payments (Cashfree / Razorpay)", purpose: "Client payments for invoices and plans", data_shared: "Name, email, phone, amount", secrets: ["CASHFREE_*", "RAZORPAY_*"], on: payOn(env) },
  { id: "payouts", name: "Payouts (Cashfree / RazorpayX)", purpose: "Paying FODO Pros", data_shared: "Pro name, bank / UPI details (held by the provider), amount", secrets: ["CASHFREE_PAYOUT_*", "RAZORPAYX_*"], on: payoutsOn(env) },
  { id: "google", name: "Google (Brain connector)", purpose: "Gmail, Calendar, Analytics, Drive, YouTube for the owner Brain and the unified inbox", data_shared: "What the connected Google account grants", secrets: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], on: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) },
  { id: "workers_ai", name: "Cloudflare Workers AI", purpose: "Assistant phrasing, Brain, X-Ray, Growth Lab", data_shared: "Prompts and the facts in them (no keys)", secrets: ["AI binding"], on: !!env.AI },
  { id: "r2", name: "Cloudflare R2 (files)", purpose: "Large file storage", data_shared: "Uploaded files", secrets: ["FILES binding"], on: !!env.FILES },
  { id: "queue", name: "Cloudflare Queue (jobs)", purpose: "Background jobs", data_shared: "Job payloads", secrets: ["JOBS binding"], on: !!env.JOBS },
  { id: "esign", name: "E-signature", purpose: "Signing documents online", data_shared: "Document, signer name and email", secrets: ["ESIGN_PROVIDER", "ESIGN_API_KEY"], on: !!(env.ESIGN_PROVIDER && env.ESIGN_API_KEY) }
];
export async function integrations(env, P) {
  const d = await pdb(env), out = [];
  for (const b of BUILTIN(env)) { const x = { id: b.id, kind: "built_in", name: b.name, purpose: b.purpose, data_shared: b.data_shared, secrets: b.secrets, status: b.on ? "configured" : "not configured", last_activity: null, accounts: [] };
    if (b.id === "mail") x.last_activity = await safe(async () => ((await one(d, "SELECT max(t) t FROM help_mail WHERE dir='out' AND (status IS NULL OR status IN ('sent','ok','delivered'))")) || {}).t, null);
    if (b.id === "whatsapp") x.last_activity = await safe(async () => ((await one(d, "SELECT max(created_at) t FROM help_messages WHERE source='whatsapp'")) || {}).t, null);
    if (b.id === "google" && b.on) { const G = await import("../brain/google.js"); x.accounts = await safe(async () => (await G.status(env)).accounts || [], []); x.last_activity = x.accounts.map((a) => a.lastUsed).filter(Boolean).sort().pop() || null; if (!x.accounts.length) x.status = "configured, no account connected"; }
    out.push(x); }
  const manual = await all(d, "SELECT i.*, " + nameOf("i.owner_user_id") + " AS owner FROM os_integrations i WHERE i.org_id=?1 ORDER BY i.status='revoked', i.name", ORG), t = today();
  for (const m of manual) out.push(Object.assign(m, { kind: "registered", expiring: m.status !== "revoked" && m.token_expires && m.token_expires <= addDays(t, 14), expired: m.status !== "revoked" && m.token_expires && m.token_expires < t }));
  return { items: out, canManage: has(P, "integration", "manage", "all") };
}
export async function integrationSave(env, P, b) {
  if (!has(P, "integration", "manage", "all")) throw err("Only an owner registers integrations.", 403); const d = await pdb(env), now = nowIso(), name = clip(b.name, 80); if (!name) throw err("Name the integration.");
  const o = { provider: clip(b.provider, 80), purpose: clip(b.purpose, 300), data_shared: clip(b.data_shared, 300), owner: clip(b.owner_user_id, 40) || P.user.id, connected_on: DAY.test(b.connected_on || "") ? b.connected_on : null, last_sync: DAY.test(b.last_sync || "") ? b.last_sync : null, token_expires: DAY.test(b.token_expires || "") ? b.token_expires : null, scopes: clip(b.scopes, 300), notes: clip(b.notes, 1000) };
  if (!o.purpose) throw err("Say what it is used for."); if (!o.data_shared) throw err("Say what data FODO shares with it (DPDP: you need to know this).");
  if (/(sk_|re_|AKIA|ghp_|xox[bp]-|-----BEGIN)/.test(o.notes + o.scopes)) throw err("Don't paste keys or tokens here. Secrets belong in Cloudflare Secrets.");
  if (b.id) { const x = await one(d, "SELECT * FROM os_integrations WHERE id=?1", clip(b.id, 40)); if (!x) throw err("Not found.", 404); if (x.status === "revoked") throw err("A revoked integration is closed; register it again.", 409);
    await run(d, "UPDATE os_integrations SET name=?2, provider=?3, purpose=?4, data_shared=?5, owner_user_id=?6, connected_on=?7, last_sync=?8, token_expires=?9, scopes=?10, notes=?11, updated_at=?12 WHERE id=?1", x.id, name, o.provider, o.purpose, o.data_shared, o.owner, o.connected_on, o.last_sync, o.token_expires, o.scopes, o.notes, now); await audit(env, P, "INTEGRATION_EDITED", { kind: "integration", id: x.id }, null, { name }); return { id: x.id }; }
  const id = rid("ig"); await run(d, "INSERT INTO os_integrations (id, org_id, name, provider, purpose, data_shared, owner_user_id, status, connected_on, last_sync, token_expires, scopes, notes, created_by, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'active',?8,?9,?10,?11,?12,?13,?14,?14)", id, ORG, name, o.provider, o.purpose, o.data_shared, o.owner, o.connected_on, o.last_sync, o.token_expires, o.scopes, o.notes, P.user.id, now);
  await audit(env, P, "INTEGRATION_REGISTERED", { kind: "integration", id }, null, { name, provider: o.provider, data_shared: o.data_shared }); return { id };
}
export async function integrationRevoke(env, P, id, b) {
  if (!has(P, "integration", "manage", "all")) throw err("Only an owner revokes integrations.", 403); const why = clip(b.reason, 300); if (why.length < 5) throw err("Say why it is revoked."); const d = await pdb(env), now = nowIso();
  if (id === "google") { const acc = clip(b.account, 120).toLowerCase(); if (!acc) throw err("Which Google account?"); const G = await import("../brain/google.js"); const r = await G.disconnect(env, acc); if (!r.disconnected.length) throw err("That Google account is not connected.", 404); await audit(env, P, "INTEGRATION_REVOKED", { kind: "integration", id: "google:" + acc }, null, { revoked_at_provider: true }, why); return { ok: true, revoked_at_provider: true, accounts: r.disconnected }; }
  const x = await one(d, "SELECT * FROM os_integrations WHERE id=?1", clip(id, 40)); if (!x) throw err("Built-in connections are switched off by removing their secret in Cloudflare.", 404); if (x.status === "revoked") throw err("Already revoked.", 409);
  await run(d, "UPDATE os_integrations SET status='revoked', revoked_at=?2, revoked_by=?3, revoke_reason=?4, updated_at=?2 WHERE id=?1", x.id, now, P.user.id, why); await audit(env, P, "INTEGRATION_REVOKED", { kind: "integration", id: x.id }, { status: x.status }, { status: "revoked", revoked_at_provider: false }, why);
  return { ok: true, revoked_at_provider: false, note: "Recorded. FODO does not hold this tool's keys: revoke the access at " + (x.provider || "the provider") + " too." };
}

/* ---------------- subscriptions ---------------- */
export const SUB_CATEGORIES = ["software", "design", "video", "hosting", "domain", "ads_tool", "analytics", "communication", "storage", "other"], CYCLES = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 };
const monthly = (s) => Math.round((s.cost || 0) / (CYCLES[s.cycle] || 1));
const subManage = (P) => P.isOwner || has(P, "subscription", "manage", "department");
export async function subscriptions(env, P, q) {
  const d = await pdb(env), s = has(P, "subscription", "view", "organization") ? "org" : "dept", W = ["s.org_id=?1"], args = [ORG]; if (s === "dept") { args.push(P.dept || "-"); W.push("s.department_id=?" + args.length); } if (!(q && q.all)) W.push("s.status<>'cancelled'");
  const rows = await all(d, "SELECT s.*, " + nameOf("s.owner_user_id") + " AS owner, (SELECT name FROM os_departments x WHERE x.id=s.department_id) AS department FROM os_subscriptions s WHERE " + W.join(" AND ") + " ORDER BY s.status='cancelled', s.renews_on LIMIT 300", ...args), t = today();
  const items = rows.map((x) => Object.assign(x, { monthly: monthly(x), renews_in: x.renews_on ? Math.round((new Date(x.renews_on) - new Date(t)) / 864e5) : null, idle_seats: x.seats && x.seats_used != null ? Math.max(0, x.seats - x.seats_used) : null })), live = items.filter((x) => x.status === "active");
  const byCat = {}, byDept = {}; live.forEach((x) => { byCat[x.category] = (byCat[x.category] || 0) + x.monthly; const k = x.department || "No department"; byDept[k] = (byDept[k] || 0) + x.monthly; });
  return { items, totals: { monthly: live.reduce((a, x) => a + x.monthly, 0), yearly: live.reduce((a, x) => a + x.monthly * 12, 0), renewing_30d: live.filter((x) => x.renews_in != null && x.renews_in >= 0 && x.renews_in <= 30).reduce((a, x) => a + x.cost, 0), by_category: byCat, by_department: byDept }, categories: SUB_CATEGORIES, cycles: Object.keys(CYCLES), canManage: subManage(P), canBill: P.isOwner || has(P, "finance", "manage", "organization") };
}
export async function subscriptionSave(env, P, b) {
  if (!subManage(P)) throw err("Only finance or operations manage subscriptions.", 403); const d = await pdb(env), now = nowIso(), name = clip(b.name, 80), cost = int(b.cost, 0, 1e9), cycle = CYCLES[b.cycle] ? b.cycle : null; if (!name) throw err("Name the tool."); if (cost == null) throw err("Cost per cycle (whole rupees) is required."); if (!cycle) throw err("Pick the billing cycle.");
  const renews = DAY.test(b.renews_on || "") ? b.renews_on : null; if (!renews) throw err("When does it renew?"); const paidVia = clip(b.paid_via, 60), notes = clip(b.notes, 800); if (looksLikeAccountNo(paidVia) || looksLikeAccountNo(notes)) throw err("Don't store card or account numbers. Write e.g. \"Company HDFC card\".");
  const seats = int(b.seats, 0, 100000), used = int(b.seats_used, 0, 100000); if (seats != null && used != null && used > seats) throw err("Seats used can't be more than seats bought.");
  const dep = has(P, "subscription", "manage", "organization") ? clip(b.department_id, 40) || null : P.dept || null;
  const o = [name, clip(b.vendor, 80), SUB_CATEGORIES.indexOf(b.category) > -1 ? b.category : "other", clip(b.plan, 60), cost, cycle, seats, used, clip(b.owner_user_id, 40) || P.user.id, dep, renews, b.auto_renew === false || b.auto_renew === "0" ? 0 : 1, paidVia, notes];
  if (b.id) { const x = await one(d, "SELECT * FROM os_subscriptions WHERE id=?1 AND org_id=?2", clip(b.id, 40), ORG); if (!x) throw err("Not found.", 404); if (!has(P, "subscription", "manage", "organization") && x.department_id !== P.dept) throw err("That subscription belongs to another department.", 403);
    await run(d, "UPDATE os_subscriptions SET name=?2, vendor=?3, category=?4, plan=?5, cost=?6, cycle=?7, seats=?8, seats_used=?9, owner_user_id=?10, department_id=?11, renews_on=?12, auto_renew=?13, paid_via=?14, notes=?15, updated_at=?16 WHERE id=?1", x.id, ...o, now); await audit(env, P, "SUBSCRIPTION_EDITED", { kind: "subscription", id: x.id }, { cost: x.cost, cycle: x.cycle }, { cost, cycle }); return { id: x.id }; }
  const id = rid("sb"); await run(d, "INSERT INTO os_subscriptions (id, org_id, name, vendor, category, plan, cost, cycle, seats, seats_used, owner_user_id, department_id, renews_on, auto_renew, paid_via, notes, status, created_by, created_at, updated_at) VALUES (?1,'" + ORG + "',?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,'active',?16,?17,?17)", id, ...o, P.user.id, now);
  await audit(env, P, "SUBSCRIPTION_ADDED", { kind: "subscription", id }, null, { name, cost, cycle }); return { id };
}
export async function subscriptionCancel(env, P, id, b) {
  if (!subManage(P)) throw err("Only finance or operations manage subscriptions.", 403); const d = await pdb(env), x = await one(d, "SELECT * FROM os_subscriptions WHERE id=?1 AND org_id=?2", clip(id, 40), ORG); if (!x) throw err("Not found.", 404); if (x.status === "cancelled") throw err("Already cancelled.", 409);
  const why = clip(b.reason, 300); if (why.length < 3) throw err("Say why."); await run(d, "UPDATE os_subscriptions SET status='cancelled', auto_renew=0, cancel_note=?2, updated_at=?3 WHERE id=?1", x.id, why, nowIso());
  await audit(env, P, "SUBSCRIPTION_CANCELLED", { kind: "subscription", id: x.id }, { status: x.status }, { status: "cancelled" }, why); return { ok: true, note: "Marked cancelled in FODO. Cancel it with " + (x.vendor || "the provider") + " too, or it will still charge." };
}
/* finance turns the next renewal into a payable (once per renewal date) */
export async function subscriptionBill(env, P, id) {
  if (!(P.isOwner || has(P, "finance", "manage", "organization"))) throw err("Finance records payables.", 403); const d = await pdb(env), x = await one(d, "SELECT * FROM os_subscriptions WHERE id=?1 AND org_id=?2", clip(id, 40), ORG); if (!x) throw err("Not found.", 404); if (x.status !== "active") throw err("This subscription is " + x.status + ".", 409);
  const ref = "SUB-" + x.id + "-" + x.renews_on; if (await one(d, "SELECT 1 x FROM os_payables WHERE ref=?1 AND status<>'cancelled'", ref)) throw err("This renewal is already in payables.", 409);
  const F = await import("./finance.js"); const r = await F.payableCreate(env, P, { vendor: x.vendor || x.name, title: x.name + " renewal (" + x.cycle.replace("_", " ") + ")", amount: x.cost, due: x.renews_on, category: "software", ref });
  await run(d, "UPDATE os_subscriptions SET payable_id=?2, updated_at=?3 WHERE id=?1", x.id, r.id || null, nowIso()); return { ok: true, payable_id: r.id };
}
/* daily: renewal reminders 7 days out, roll past renewal dates forward, token expiry warnings */
export async function daily(env) {
  const d = await pdb(env), t = today(), soon = addDays(t, 7), owners = await ownerIds(d); let reminded = 0, rolled = 0, expiring = 0;
  for (const s of await all(d, "SELECT * FROM os_subscriptions WHERE status='active' AND renews_on IS NOT NULL AND renews_on<=?1", soon)) {
    if (s.renews_on < t) { if (s.auto_renew) { let n = s.renews_on; while (n < t) { const dt = new Date(n + "T00:00:00Z"); dt.setUTCMonth(dt.getUTCMonth() + (CYCLES[s.cycle] || 1)); n = dt.toISOString().slice(0, 10); } await run(d, "UPDATE os_subscriptions SET renews_on=?2, updated_at=?3 WHERE id=?1", s.id, n, nowIso()); rolled++; } else await run(d, "UPDATE os_subscriptions SET status='lapsed', updated_at=?2 WHERE id=?1", s.id, nowIso()); continue; }
    for (const u of [s.owner_user_id].concat(owners).filter((u, i, a) => u && a.indexOf(u) === i)) { await notify(env, u, "system", s.name + " renews on " + s.renews_on + " for ₹" + (s.cost || 0).toLocaleString("en-IN") + (s.auto_renew ? " (auto-renews)." : " (manual renewal)."), "/workspace/#subscriptions", { category: "system", urgency: "info", dedupe: "sub-" + s.id + "-" + s.renews_on }).catch(() => {}); } reminded++; }
  for (const i of await all(d, "SELECT * FROM os_integrations WHERE status='active' AND token_expires IS NOT NULL AND token_expires<=?1", addDays(t, 14))) { for (const u of [i.owner_user_id].concat(owners).filter((u, k, a) => u && a.indexOf(u) === k)) await notify(env, u, "system", "The " + i.name + " access " + (i.token_expires < t ? "expired on " : "expires on ") + i.token_expires + ".", "/workspace/#integrations", { category: "system", urgency: "action", dedupe: "ig-" + i.id + "-" + i.token_expires }).catch(() => {}); expiring++; }
  return { reminded, rolled, expiring };
}
