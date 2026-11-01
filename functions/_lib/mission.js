/* FODO v47.5 Admin Mission Control: one place that says what needs a FODO person today, a global search across every
   marketplace record (Ctrl+K for staff), hiring intelligence from real records, and CSV exports.
   Rules: staff only, roles checked here; money views need finance or admin; every export is written to the audit log;
   nothing is estimated (every number is a count or a sum from FODO's own tables). */
import { nowIso } from "./accounts.js";
import { bdb, can, err, auditLog, PRO_ROLES } from "./biz.js";
import { fdb } from "./finance.js";
import { qdb } from "./quotes.js";
import { pdb as podb } from "./payouts.js";
/* every marketplace table, whichever module owns it */
const mdb = async (env) => { await qdb(env); await podb(env); return fdb(env); };

const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
const all = async (d, sql, ...a) => (await d.prepare(sql).bind(...a).all()).results || [];
const one = (d, sql, ...a) => d.prepare(sql).bind(...a).first();
const staff = (R) => can(R, ["admin", "finance", "viewer", "moderator"]);
const money = (R) => can(R, ["admin", "finance", "viewer"]);
const iso = (ms) => new Date(ms).toISOString(), day = (ms) => iso(ms).slice(0, 10);
const median = (L) => { if (!L.length) return null; const s = L.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const n0 = async (d, sql, ...a) => ((await one(d, sql, ...a)) || {}).n || 0;

/* ---------- Mission Control: what needs a person ---------- */
export async function mission(env, R) {
  if (!staff(R)) throw err("Not allowed.", 403); const d = await mdb(env), now = nowIso(), in24 = iso(Date.now() + 864e5), in3 = day(Date.now() + 3 * 864e5), today = day(Date.now()), fin = money(R);
  const A = [], add = async (key, label, sql, href, kind, a) => { const n = await n0(d, sql, ...(a || [])); A.push({ key, label, n, href, kind: kind || "work" }); };
  await add("quotes_requested", "Quote requests to answer", "SELECT count(*) n FROM biz_quotes WHERE status='requested'", "#admin?tab=quotes&status=requested");
  await add("quotes_draft", "Quote drafts not sent", "SELECT count(*) n FROM biz_quotes WHERE status='draft'", "#admin?tab=quotes&status=draft");
  await add("quotes_negotiation", "Quotes the client wants changed", "SELECT count(*) n FROM biz_quotes WHERE status='negotiation'", "#admin?tab=quotes&status=negotiation");
  await add("quotes_expiring", "Quotes expiring within 24 h", "SELECT count(*) n FROM biz_quotes WHERE status IN ('sent','viewed','revised') AND expires_at IS NOT NULL AND expires_at <= ?1", "#admin?tab=quotes&status=sent", "soon", [in24]);
  await add("teams_open", "Teams with open or declined slots", "SELECT count(DISTINCT t.id) n FROM biz_teams t JOIN biz_team_members m ON m.team_id=t.id WHERE t.status IN ('draft','invitations_pending','partially_confirmed') AND m.status IN ('open','declined','expired','conflict')", "#admin?tab=teams");
  await add("teams_soon", "Teams starting within 3 days, not locked", "SELECT count(*) n FROM biz_teams t WHERE t.start_day BETWEEN ?1 AND ?2 AND t.status NOT IN ('locked','active','completed','cancelled')", "#admin?tab=teams", "urgent", [today, in3]);
  await add("invites_expiring", "Team invitations expiring within 24 h", "SELECT count(*) n FROM biz_team_members WHERE status='invited' AND expires_at IS NOT NULL AND expires_at <= ?1", "#admin?tab=teams", "soon", [in24]);
  await add("contracts_to_send", "Contracts drafted, not sent", "SELECT count(*) n FROM biz_contracts WHERE status='draft'", "#admin?tab=finance&sub=contracts");
  await add("contracts_unsigned", "Contracts waiting for the client's signature", "SELECT count(*) n FROM biz_contracts WHERE status IN ('sent','amendment_pending')", "#admin?tab=finance&sub=contracts", "wait");
  await add("applications", "FODO Pro applications waiting", "SELECT count(*) n FROM biz_pro_applications WHERE status IN ('submitted','under_review','interview','verification')", "#admin?tab=applications");
  await add("profiles_pending", "Profiles pending review", "SELECT count(*) n FROM biz_pros WHERE status='pending'", "#admin?tab=pros&status=pending");
  await add("cases_pending", "Case studies to moderate", "SELECT count(*) n FROM biz_pro_case_studies WHERE status='pending'", "#admin?tab=applications&sub=cases");
  await add("disputes", "Open disputes", "SELECT count(*) n FROM biz_disputes WHERE status='open'", "#admin?tab=disputes", "urgent");
  await add("milestones_submitted", "Work submitted, waiting for client approval", "SELECT count(*) n FROM biz_milestones WHERE status='submitted'", "#admin?tab=analytics", "wait");
  if (fin) {
    await add("settlements_review", "Settlements in manual review", "SELECT count(*) n FROM biz_settlements WHERE status='manual_review'", "#admin?tab=finance&sub=settlements", "urgent");
    await add("payouts_due", "Payouts to send", "SELECT count(*) n FROM biz_payouts WHERE status IN ('queued','awaiting_provider','failed')", "#admin?tab=payouts");
    await add("refunds_processing", "Refunds in progress or needing a hand", "SELECT count(*) n FROM biz_refunds WHERE status IN ('processing','needs_manual','requested')", "#admin?tab=payouts", "wait");
    await add("vendors_missing", "Approved professionals without a payout method", "SELECT count(*) n FROM biz_pros p WHERE p.status IN ('approved','published') AND NOT EXISTS (SELECT 1 FROM biz_payout_methods pm WHERE pm.pro_id=p.id)", "#admin?tab=pros&status=approved", "wait");
  }
  const schedule = await all(d, "SELECT t.id, t.title, t.status, t.start_day, t.days, t.city, (SELECT count(*) FROM biz_team_members m WHERE m.team_id=t.id AND m.status='accepted') confirmed, (SELECT count(*) FROM biz_team_members m WHERE m.team_id=t.id AND m.status IN ('open','invited','accepted','conflict')) slots FROM biz_teams t WHERE t.start_day >= ?1 AND t.status NOT IN ('completed','cancelled') ORDER BY t.start_day LIMIT 12", today);
  const recent = await all(d, "SELECT actor, action, target, detail, created_at FROM biz_audit ORDER BY id DESC LIMIT 15");
  const totals = { quotesOpen: await n0(d, "SELECT count(*) n FROM biz_quotes WHERE status IN ('sent','viewed','negotiation','revised')"), teamsLive: await n0(d, "SELECT count(*) n FROM biz_teams WHERE status IN ('locked','active')"), projectsActive: await n0(d, "SELECT count(*) n FROM biz_projects WHERE status IN ('accepted','in_progress','delivered')"), prosLive: await n0(d, "SELECT count(*) n FROM biz_pros WHERE status IN ('approved','published')") };
  if (fin) { totals.held = await n0(d, "SELECT COALESCE(sum(amount),0) n FROM biz_milestones WHERE status IN ('funded','submitted')"); totals.owed = await n0(d, "SELECT COALESCE(sum(net),0) n FROM biz_payouts WHERE status != 'paid' AND status != 'via_split'"); }
  return { generatedAt: now, attention: A.filter((x) => x.n > 0), all: A, totals, schedule, recent, finance: fin };
}

/* ---------- global search for staff (Ctrl+K) ---------- */
export async function adminSearch(env, R, q) {
  if (!staff(R)) throw err("Not allowed.", 403); const s = clip(q, 60).toLowerCase(); if (s.length < 2) return { groups: [] };
  const d = await mdb(env), like = "%" + s.replace(/[%_]/g, "") + "%", G = [], safe = async (f) => { try { return await f(); } catch (e) { return []; } }, add = (name, L) => { if (L.length) G.push({ name, items: L.slice(0, 6) }); };
  add("Quotes", (await safe(() => all(d, "SELECT q.id, q.number, q.title, q.status, u.email FROM biz_quotes q LEFT JOIN acct_users u ON u.id=q.client_id WHERE lower(q.number) LIKE ?1 OR lower(q.title) LIKE ?1 OR lower(u.email) LIKE ?1 ORDER BY q.updated_at DESC LIMIT 6", like))).map((x) => ({ label: x.number + " · " + x.title, hint: "Quote · " + x.status + (x.email ? " · " + x.email : ""), href: "#admin?tab=quotes&id=" + x.id })));
  add("Teams", (await safe(() => all(d, "SELECT t.id, t.title, t.status, t.start_day, t.city FROM biz_teams t WHERE lower(t.title) LIKE ?1 OR lower(t.city) LIKE ?1 OR t.start_day LIKE ?1 ORDER BY t.updated_at DESC LIMIT 6", like))).map((x) => ({ label: x.title, hint: "Team · " + x.status.replace(/_/g, " ") + (x.start_day ? " · " + x.start_day : "") + (x.city ? " · " + x.city : ""), href: "#admin?tab=teams&id=" + x.id })));
  add("Contracts", (await safe(() => all(d, "SELECT c.id, c.number, c.title, c.status, u.email FROM biz_contracts c LEFT JOIN acct_users u ON u.id=c.client_id WHERE lower(c.number) LIKE ?1 OR lower(c.title) LIKE ?1 OR lower(u.email) LIKE ?1 ORDER BY c.updated_at DESC LIMIT 6", like))).map((x) => ({ label: x.number + " · " + x.title, hint: "Contract · " + x.status.replace(/_/g, " "), href: "#admin?tab=finance&sub=contracts&id=" + x.id })));
  add("Projects", (await safe(() => all(d, "SELECT j.id, j.title, j.status, u.email FROM biz_projects j LEFT JOIN acct_users u ON u.id=j.client_id WHERE lower(j.title) LIKE ?1 OR lower(u.email) LIKE ?1 OR j.id LIKE ?1 ORDER BY j.updated_at DESC LIMIT 6", like))).map((x) => ({ label: x.title, hint: "Project · " + x.status.replace(/_/g, " ") + (x.email ? " · " + x.email : ""), href: "#project=" + x.id })));
  add("Professionals", (await safe(() => all(d, "SELECT p.id, p.name, p.role, p.city, p.status, u.email FROM biz_pros p LEFT JOIN acct_users u ON u.id=p.user_id WHERE lower(p.name) LIKE ?1 OR lower(p.role) LIKE ?1 OR lower(p.city) LIKE ?1 OR lower(p.skills) LIKE ?1 OR lower(u.email) LIKE ?1 OR lower(p.specializations) LIKE ?1 ORDER BY p.updated_at DESC LIMIT 6", like))).map((x) => ({ label: x.name, hint: x.role + (x.city ? " · " + x.city : "") + " · " + x.status, href: "#admin?tab=pros&status=" + x.status + "&id=" + x.id, pro: x.id })));
  add("Applications", (await safe(() => all(d, "SELECT a.id, a.status, a.data, u.email FROM biz_pro_applications a LEFT JOIN acct_users u ON u.id=a.user_id WHERE a.status != 'draft' AND (lower(a.data) LIKE ?1 OR lower(u.email) LIKE ?1) ORDER BY a.updated_at DESC LIMIT 6", like))).map((x) => { const v = J(x.data, {}); return { label: v.name || x.email || x.id, hint: "Application · " + x.status.replace(/_/g, " ") + (v.role ? " · " + v.role : ""), href: "#admin?tab=applications&id=" + x.id }; }));
  add("Clients", (await safe(() => all(d, "SELECT id, email, name FROM acct_users WHERE lower(email) LIKE ?1 OR lower(name) LIKE ?1 ORDER BY created_at DESC LIMIT 6", like))).map((x) => ({ label: x.name || x.email, hint: "Account · " + x.email, href: "#admin?tab=mission&client=" + x.id })));
  if (money(R)) {
    add("Invoices", (await safe(() => all(d, "SELECT id, number, kind, title, status, total FROM biz_invoices WHERE lower(number) LIKE ?1 OR lower(title) LIKE ?1 ORDER BY created_at DESC LIMIT 6", like))).map((x) => ({ label: x.number + " · " + x.title, hint: (x.kind === "credit_note" ? "Credit note" : "Invoice") + " · " + x.status + " · ₹" + (x.total || 0).toLocaleString("en-IN"), href: "#admin?tab=finance&sub=invoices" })));
    add("Payouts", (await safe(() => all(d, "SELECT po.id, po.status, po.net, po.ref, p.name FROM biz_payouts po JOIN biz_pros p ON p.id=po.pro_id WHERE lower(p.name) LIKE ?1 OR lower(po.ref) LIKE ?1 OR po.id LIKE ?1 ORDER BY po.created_at DESC LIMIT 6", like))).map((x) => ({ label: x.name + " · ₹" + (x.net || 0).toLocaleString("en-IN"), hint: "Payout · " + x.status + (x.ref ? " · " + x.ref : ""), href: "#admin?tab=payouts" })));
  }
  const role = PRO_ROLES.filter((r) => r.toLowerCase().indexOf(s) > -1).slice(0, 3); if (role.length) add("Hiring", role.map((r) => ({ label: "Who can do " + r, hint: "Hiring intelligence", href: "#admin?tab=mission&sub=hiring&role=" + encodeURIComponent(r) })));
  return { groups: G };
}

/* ---------- hiring intelligence (real records, last N days) ---------- */
export async function hiring(env, R, q) {
  if (!staff(R)) throw err("Not allowed.", 403); const d = await mdb(env), days = Math.min(365, Math.max(7, +(q || {}).days || 90)), since = iso(Date.now() - days * 864e5), today = day(Date.now()), ahead = day(Date.now() + 60 * 864e5);
  /* demand: every slot created in the window, by role */
  const slots = await all(d, "SELECT m.role_name, m.status, m.invited_at, m.answered_at, m.created_at, m.note, t.city, t.start_day FROM biz_team_members m JOIN biz_teams t ON t.id=m.team_id WHERE m.created_at >= ?1 LIMIT 20000", since);
  const byRole = {}; for (const s of slots) { const r = byRole[s.role_name] || (byRole[s.role_name] = { role: s.role_name, slots: 0, filled: 0, open: 0, declined: 0, expired: 0, hours: [], cities: {} });
    r.slots++; if (s.status === "accepted") { r.filled++; if (s.invited_at && s.answered_at) r.hours.push((Date.parse(s.answered_at) - Date.parse(s.invited_at)) / 36e5); } else if (s.status === "open" || s.status === "invited" || s.status === "conflict") r.open++; else if (s.status === "declined") r.declined++; else if (s.status === "expired") r.expired++;
    if (s.city) r.cities[s.city] = (r.cities[s.city] || 0) + 1; }
  /* supply: approved professionals per role (the catalog role matches a list of profile roles; here by the profile's own role name) */
  const supply = {}; for (const p of await all(d, "SELECT role, city, count(*) n FROM biz_pros WHERE status IN ('approved','published') GROUP BY role, city")) { const r = supply[p.role] || (supply[p.role] = { total: 0, cities: {} }); r.total += p.n; if (p.city) r.cities[p.city.toLowerCase()] = (r.cities[p.city.toLowerCase()] || 0) + p.n; }
  const roleMap = {}; for (const r of await all(d, "SELECT id, name, match FROM biz_roles")) roleMap[r.name] = J(r.match, [r.name]);
  const demand = Object.values(byRole).map((r) => { const names = roleMap[r.role] || [r.role], pros = names.reduce((n, k) => n + ((supply[k] || {}).total || 0), 0), fillRate = r.slots ? Math.round(r.filled / r.slots * 100) : null, med = median(r.hours);
    const cityGaps = Object.keys(r.cities).filter((c) => !names.some((k) => ((supply[k] || {}).cities || {})[c.toLowerCase()])).slice(0, 5);
    return { role: r.role, slots: r.slots, filled: r.filled, open: r.open, declined: r.declined, expired: r.expired, fillRate, medianHours: med == null ? null : Math.round(med * 10) / 10, approvedPros: pros, cityGaps, pressure: pros === 0 ? "no professionals" : r.slots / Math.max(1, pros) >= 3 ? "high" : r.slots / Math.max(1, pros) >= 1.5 ? "medium" : "ok" }; }).sort((a, b) => b.slots - a.slots);
  /* why people decline: their own words, grouped roughly */
  const reasons = {}; for (const s of slots) if (s.status === "declined" && s.note) { const k = /busy|booked|unavailable|date|travel|out of/i.test(s.note) ? "Not available on those dates" : /fee|rate|budget|money|price|low/i.test(s.note) ? "Fee too low" : /far|city|location|distance/i.test(s.note) ? "Location too far" : /role|scope|not my/i.test(s.note) ? "Not the right role for them" : "Other"; reasons[k] = (reasons[k] || 0) + 1; }
  /* pipeline: applications by role and stage */
  const pipeline = {}; for (const a of await all(d, "SELECT status, data FROM biz_pro_applications WHERE status NOT IN ('draft','archived')")) { const v = J(a.data, {}), k = v.role || "(no role)"; const p = pipeline[k] || (pipeline[k] = { role: k, open: 0, approved: 0, rejected: 0 }); if (a.status === "approved") p.approved++; else if (a.status === "rejected") p.rejected++; else p.open++; }
  /* upcoming need: roles in teams starting in the next 60 days that are still open */
  const upcoming = await all(d, "SELECT m.role_name role, t.city, count(*) n, min(t.start_day) first FROM biz_team_members m JOIN biz_teams t ON t.id=m.team_id WHERE m.status IN ('open','declined','expired','conflict') AND t.status NOT IN ('completed','cancelled','locked','active') AND t.start_day BETWEEN ?1 AND ?2 GROUP BY m.role_name, t.city ORDER BY first LIMIT 30", today, ahead);
  /* reliability: who accepts and shows up */
  const top = await all(d, "SELECT p.id, p.name, p.role, p.city, sum(CASE WHEN m.status='accepted' THEN 1 ELSE 0 END) accepted, sum(CASE WHEN m.status='declined' THEN 1 ELSE 0 END) declined, sum(CASE WHEN m.status='expired' THEN 1 ELSE 0 END) expired, count(*) asked FROM biz_team_members m JOIN biz_pros p ON p.id=m.pro_id WHERE m.created_at >= ?1 AND m.status IN ('accepted','declined','expired') GROUP BY p.id HAVING asked >= 2 ORDER BY accepted DESC, asked DESC LIMIT 15", since);
  const roleFilter = clip((q || {}).role, 60);
  return { days, since: since.slice(0, 10), generatedAt: nowIso(), demand: roleFilter ? demand.filter((x) => x.role.toLowerCase().indexOf(roleFilter.toLowerCase()) > -1) : demand, declineReasons: Object.keys(reasons).map((k) => ({ reason: k, n: reasons[k] })).sort((a, b) => b.n - a.n), pipeline: Object.values(pipeline).sort((a, b) => b.open - a.open), upcoming, reliability: top.map((x) => ({ id: x.id, name: x.name, role: x.role, city: x.city, asked: x.asked, accepted: x.accepted, declined: x.declined, expired: x.expired, acceptRate: Math.round(x.accepted / x.asked * 100) })),
    note: slots.length ? null : "No team slots in the last " + days + " days yet. Numbers appear once teams are built." };
}

/* ---------- CSV exports (audited) ---------- */
const csvEsc = (v) => { let s = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csv = (cols, rows) => "﻿" + cols.join(",") + "\n" + rows.map((r) => cols.map((c) => csvEsc(r[c])).join(",")).join("\n") + "\n";
export const EXPORTS = {
  quotes: { label: "Quotes", need: "staff", cols: ["number", "title", "status", "version", "sent_version", "client", "total", "expires_at", "accepted_at", "created_at", "updated_at"], sql: "SELECT q.number, q.title, q.status, q.version, q.sent_version, u.email client, v.total, q.expires_at, q.accepted_at, q.created_at, q.updated_at FROM biz_quotes q LEFT JOIN acct_users u ON u.id=q.client_id LEFT JOIN biz_quote_versions v ON v.quote_id=q.id AND v.version=q.version ORDER BY q.created_at DESC LIMIT 5000" },
  teams: { label: "Teams", need: "staff", cols: ["id", "title", "status", "start_day", "days", "city", "mode", "client", "quote", "slots", "confirmed", "locked_at", "created_at"], sql: "SELECT t.id, t.title, t.status, t.start_day, t.days, t.city, t.mode, u.email client, q.number quote, (SELECT count(*) FROM biz_team_members m WHERE m.team_id=t.id AND m.status IN ('open','invited','accepted','conflict')) slots, (SELECT count(*) FROM biz_team_members m WHERE m.team_id=t.id AND m.status='accepted') confirmed, t.locked_at, t.created_at FROM biz_teams t LEFT JOIN acct_users u ON u.id=t.client_id LEFT JOIN biz_quotes q ON q.id=t.quote_id ORDER BY t.created_at DESC LIMIT 5000" },
  team_slots: { label: "Team slots (every invitation)", need: "staff", cols: ["team", "start_day", "role", "professional", "status", "fee", "invited_at", "answered_at", "expires_at", "note"], sql: "SELECT t.title team, t.start_day, m.role_name role, p.name professional, m.status, m.amount fee, m.invited_at, m.answered_at, m.expires_at, m.note FROM biz_team_members m JOIN biz_teams t ON t.id=m.team_id LEFT JOIN biz_pros p ON p.id=m.pro_id ORDER BY t.start_day DESC, m.slot LIMIT 10000" },
  contracts: { label: "Contracts", need: "money", cols: ["number", "title", "status", "version", "sent_version", "accepted_version", "accepted_at", "accepted_by", "client", "project_id", "created_at"], sql: "SELECT c.number, c.title, c.status, c.version, c.sent_version, c.accepted_version, c.accepted_at, c.accepted_by, u.email client, c.project_id, c.created_at FROM biz_contracts c LEFT JOIN acct_users u ON u.id=c.client_id ORDER BY c.created_at DESC LIMIT 5000" },
  projects: { label: "Projects", need: "staff", cols: ["id", "title", "status", "kind", "client", "professional", "budget", "day", "created_at", "updated_at"], sql: "SELECT j.id, j.title, j.status, j.kind, u.email client, p.name professional, j.budget, j.day, j.created_at, j.updated_at FROM biz_projects j LEFT JOIN acct_users u ON u.id=j.client_id LEFT JOIN biz_pros p ON p.id=j.pro_id ORDER BY j.created_at DESC LIMIT 5000" },
  milestones: { label: "Milestones (payments)", need: "money", cols: ["project", "title", "amount", "status", "order_id", "funded_at", "submitted_at", "approved_at", "refunded"], sql: "SELECT j.title project, m.title, m.amount, m.status, m.order_id, m.funded_at, m.submitted_at, m.approved_at, m.refunded FROM biz_milestones m JOIN biz_projects j ON j.id=m.project_id ORDER BY m.funded_at DESC LIMIT 10000" },
  settlements: { label: "Settlement lines", need: "money", cols: ["settlement", "project", "milestone", "amount", "status", "kind", "label", "line_amount", "payout_status", "created_at"], sql: "SELECT s.id settlement, j.title project, m.title milestone, s.amount, s.status, l.kind, l.label, l.amount line_amount, po.status payout_status, s.created_at FROM biz_settlements s JOIN biz_projects j ON j.id=s.project_id JOIN biz_milestones m ON m.id=s.milestone_id LEFT JOIN biz_settlement_lines l ON l.settlement_id=s.id LEFT JOIN biz_payouts po ON po.milestone_id=l.id ORDER BY s.created_at DESC LIMIT 10000" },
  ledger: { label: "Ledger (append-only)", need: "money", cols: ["id", "at", "kind", "account", "ref_type", "ref_id", "project_id", "amount", "memo"], sql: "SELECT id, at, kind, account, ref_type, ref_id, project_id, amount, memo FROM biz_ledger ORDER BY id LIMIT 20000" },
  invoices: { label: "Invoices and credit notes", need: "money", cols: ["number", "kind", "title", "status", "subtotal", "tax", "total", "issue_date", "project_id", "related_id"], sql: "SELECT number, kind, title, status, subtotal, tax, total, issue_date, project_id, related_id FROM biz_invoices ORDER BY created_at DESC LIMIT 10000" },
  payouts: { label: "Payouts", need: "money", cols: ["id", "professional", "label", "gross", "commission", "net", "status", "ref", "created_at", "paid_at"], sql: "SELECT po.id, p.name professional, COALESCE(po.label, m.title) label, po.gross, po.commission, po.net, po.status, po.ref, po.created_at, po.paid_at FROM biz_payouts po JOIN biz_pros p ON p.id=po.pro_id LEFT JOIN biz_milestones m ON m.id=COALESCE(po.source_milestone, po.milestone_id) ORDER BY po.created_at DESC LIMIT 10000" },
  pros: { label: "Professionals", need: "staff", cols: ["id", "name", "role", "city", "status", "years", "rate_day", "rate_project", "remote", "onsite", "done_n", "rating_n", "recommended", "approved_at", "created_at"], sql: "SELECT id, name, role, city, status, years, rate_day, rate_project, remote, onsite, done_n, rating_n, recommended, approved_at, created_at FROM biz_pros ORDER BY created_at DESC LIMIT 10000" },
  applications: { label: "FODO Pro applications", need: "staff", cols: ["id", "name", "role", "city", "years", "status", "reviewer", "submitted_at", "decided_at", "decided_by"], sql: "SELECT a.id, a.data, a.status, a.reviewer, a.submitted_at, a.decided_at, a.decided_by FROM biz_pro_applications a WHERE a.status != 'draft' ORDER BY a.submitted_at DESC LIMIT 10000", map: (r) => { const v = J(r.data, {}); return Object.assign(r, { name: v.name, role: v.role, city: v.city, years: v.years }); } },
  audit: { label: "Audit log", need: "money", cols: ["id", "created_at", "actor", "action", "target", "detail"], sql: "SELECT id, created_at, actor, action, target, detail FROM biz_audit ORDER BY id DESC LIMIT 20000" },
};
/* personal data stays minimal: client emails yes (staff need to find them), never phone numbers or application text */
export async function exportCsv(env, u, R, what) {
  const E = EXPORTS[what]; if (!E) throw err("Unknown export.", 404);
  if (E.need === "money" ? !money(R) : !staff(R)) throw err("Not allowed.", 403);
  const d = await mdb(env); let rows = await all(d, E.sql); if (E.map) rows = rows.map(E.map);
  await auditLog(env, u.email, "export:" + what, "", rows.length + " rows");
  return { name: "fodo-" + what + "-" + day(Date.now()) + ".csv", body: csv(E.cols, rows), rows: rows.length };
}
export const exportList = (R) => Object.keys(EXPORTS).filter((k) => EXPORTS[k].need === "money" ? money(R) : staff(R)).map((k) => ({ key: k, label: EXPORTS[k].label, finance: EXPORTS[k].need === "money" }));
