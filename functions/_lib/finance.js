/* FODO v47.3 marketplace money: contracts → project workspace + payment plan → payment (escrow) → settlement → payout →
   reconciliation, with an append-only ledger, invoices and credit notes.
   PAYMENT  = money the client paid FODO (a funded milestone).   SETTLEMENT = how one paid milestone is split between the
   professionals, equipment partners, taxes and FODO.   PAYOUT = money actually sent to a professional (payouts.js).
   Rules: a contract version is frozen once sent; after acceptance any change is an amendment (a new version the client accepts
   again); the settlement of a milestone is written once (UNIQUE milestone) and its lines become payouts; every money event is
   one ledger row (UNIQUE kind + account + reference, and the database refuses UPDATE / DELETE on the ledger); historical
   numbers come from these snapshots, never from today's settings. Legal / tax wording stays configurable and is marked for
   professional review. */
import { nowIso, randId, OWNER_EMAILS, migrateOnce, db as adb, cfOn, cf } from "./accounts.js";
import { bdb, err, can, auditLog, notify, payoutsOn } from "./biz.js";
import { pdb, pricingConfig } from "./production.js";

const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
const all = async (d, sql, ...a) => (await d.prepare(sql).bind(...a).all()).results || [];
const one = (d, sql, ...a) => d.prepare(sql).bind(...a).first();
const run = (d, sql, ...a) => d.prepare(sql).bind(...a).run();
const inr = (n) => "₹" + Math.round(+n || 0).toLocaleString("en-IN");
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const staff = (R) => can(R, ["admin", "finance", "viewer"]);

const MIG = [
  "CREATE TABLE IF NOT EXISTS biz_contracts (id TEXT PRIMARY KEY, number TEXT UNIQUE, quote_id TEXT, team_id TEXT UNIQUE, client_id TEXT, project_id TEXT, title TEXT, status TEXT, version INTEGER, sent_version INTEGER, accepted_version INTEGER, accepted_at TEXT, accepted_by TEXT, accept_meta TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS biz_contract_versions (contract_id TEXT, version INTEGER, kind TEXT, data TEXT, internal TEXT, note TEXT, amount_change INTEGER, created_by TEXT, created_at TEXT, sent_at TEXT, accepted_at TEXT, PRIMARY KEY (contract_id, version))",
  "CREATE TABLE IF NOT EXISTS biz_contract_events (id INTEGER PRIMARY KEY AUTOINCREMENT, contract_id TEXT, version INTEGER, kind TEXT, by_email TEXT, note TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS biz_settlements (id TEXT PRIMARY KEY, milestone_id TEXT UNIQUE, project_id TEXT, contract_id TEXT, amount INTEGER, provider TEXT, status TEXT, provider_ref TEXT, note TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS biz_settlement_lines (id TEXT PRIMARY KEY, settlement_id TEXT, kind TEXT, pro_id TEXT, member_id TEXT, label TEXT, amount INTEGER)",
  "CREATE INDEX IF NOT EXISTS biz_settlement_lines_s ON biz_settlement_lines(settlement_id)",
  "CREATE TABLE IF NOT EXISTS biz_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, kind TEXT, account TEXT, ref_type TEXT, ref_id TEXT, project_id TEXT, amount INTEGER, memo TEXT, UNIQUE (kind, account, ref_id))",
  "CREATE INDEX IF NOT EXISTS biz_ledger_p ON biz_ledger(project_id, id)",
  "CREATE TRIGGER IF NOT EXISTS biz_ledger_no_update BEFORE UPDATE ON biz_ledger BEGIN SELECT RAISE(ABORT, 'the ledger is append-only'); END",
  "CREATE TRIGGER IF NOT EXISTS biz_ledger_no_delete BEFORE DELETE ON biz_ledger BEGIN SELECT RAISE(ABORT, 'the ledger is append-only'); END",
  "CREATE TABLE IF NOT EXISTS biz_invoices (id TEXT PRIMARY KEY, number TEXT UNIQUE, kind TEXT, title TEXT, contract_id TEXT, project_id TEXT, milestone_id TEXT, refund_id TEXT, client_id TEXT, data TEXT, subtotal INTEGER, tax INTEGER, total INTEGER, status TEXT, ref TEXT, related_id TEXT, issue_date TEXT, created_at TEXT)",
  "CREATE UNIQUE INDEX IF NOT EXISTS biz_invoices_ms ON biz_invoices(milestone_id) WHERE kind='invoice'",
  "CREATE UNIQUE INDEX IF NOT EXISTS biz_invoices_rf ON biz_invoices(refund_id) WHERE kind='credit_note'",
  "ALTER TABLE biz_payouts ADD COLUMN source_milestone TEXT", "ALTER TABLE biz_payouts ADD COLUMN label TEXT", "ALTER TABLE biz_pros ADD COLUMN cf_vendor_id TEXT",
];
const ready = new WeakSet();
export async function fdb(env) { const d = await pdb(env); if (!ready.has(d)) { await migrateOnce(d, MIG); ready.add(d); } return d; }
const cev = (d, c, v, kind, by, note) => run(d, "INSERT INTO biz_contract_events (contract_id, version, kind, by_email, note, created_at) VALUES (?1,?2,?3,?4,?5,?6)", c, v, kind, by || "", clip(note, 500), nowIso());
async function owners(env, text, link) { try { const d = await bdb(env); for (const o of await all(d, "SELECT id FROM acct_users WHERE lower(email) IN (" + OWNER_EMAILS.map(() => "?").join(",") + ")", ...OWNER_EMAILS)) await notify(env, o.id, "contract", text, link); } catch (e) {} }
async function numberFor(d, table, prefix) { const now = nowIso(), n = ((await one(d, "SELECT count(*) n FROM " + table + " WHERE number LIKE ?1", prefix + "-%")) || {}).n || 0; return prefix + "-" + now.slice(2, 4) + now.slice(5, 7) + "-" + String(n + 1).padStart(4, "0"); }

/* ---------- ledger (append-only) ---------- */
export async function ledger(env, kind, account, refType, refId, projectId, amount, memo) {
  const d = await fdb(env); try { await run(d, "INSERT INTO biz_ledger (at, kind, account, ref_type, ref_id, project_id, amount, memo) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)", nowIso(), kind, account, refType, refId, projectId || null, Math.round(amount), clip(memo, 300)); return true; }
  catch (e) { if (/UNIQUE/i.test(String(e.message || e))) return false; throw e; }   // the same event twice = recorded once
}
export async function ledgerList(env, R, q) { if (!staff(R)) throw err("Not allowed.", 403); const d = await fdb(env);
  const rows = await all(d, "SELECT l.*, j.title FROM biz_ledger l LEFT JOIN biz_projects j ON j.id=l.project_id WHERE (?1='' OR l.project_id=?1) ORDER BY l.id DESC LIMIT 500", clip(q.project, 40));
  const totals = {}; (await all(d, "SELECT account, sum(amount) n FROM biz_ledger GROUP BY account")).forEach((x) => { totals[x.account] = x.n; }); return { items: rows, totals }; }

/* ---------- contract clauses (defaults; owners edit them in pricing rules; marked for legal review) ---------- */
export const CLAUSES = [
  ["Scope and deliverables", "FODO delivers the scope and deliverables listed above with the confirmed team. Anything not listed is out of scope and is agreed as a change request or an amendment."],
  ["Payment", "Payments follow the schedule above and are made to FODO. FODO holds each payment until the matching work is approved, then pays the professionals. Ad spend, if any, is paid directly to the ad platforms."],
  ["Revisions", "Revisions included: as stated in the quote. Further revisions are change requests with their own price and time."],
  ["Intellectual property and usage", "On full payment, the client may use the final deliverables for the usage stated in the quote. Raw footage, project files and talent usage beyond that are excluded unless listed. Professionals may show the work in their portfolio only with the client's permission."],
  ["Cancellation and refunds", "Cancellation refunds follow FODO's cancellation policy in force on the date of this contract (see the policy summary in this contract). Money already paid out for approved work, and non-refundable third-party costs, are not refunded."],
  ["Travel and expenses", "Travel and expenses are included only where listed. Other expenses need the client's written approval before they are incurred."],
  ["Confidentiality", "FODO and the professionals keep the client's non-public information confidential and use it only for this project."],
  ["Taxes", "Taxes are charged as shown. Where FODO is not registered for GST, no GST is charged."],
  ["FODO's role and fee", "FODO assembles, manages and pays the team. FODO's production management fee is included in the price and shown separately in the investment table."],
  ["Disputes", "Disputes are raised in the FODO Workspace; FODO reviews the evidence and proposes a resolution before any refund or release of money."]];
export const TERMS_VERSION = "FODO-MT-2026.11";

/* ---------- contracts ---------- */
async function snapshot(env, d, team, quote) {
  const qv = J((await one(d, "SELECT data, internal FROM biz_quote_versions WHERE quote_id=?1 AND version=?2", quote.id, quote.accepted_version)).data, {}), qi = J((await one(d, "SELECT internal FROM biz_quote_versions WHERE quote_id=?1 AND version=?2", quote.id, quote.accepted_version)).internal, {});
  const C = await pricingConfig(env), M = await all(d, "SELECT m.*, p.name pro_name FROM biz_team_members m JOIN biz_pros p ON p.id=m.pro_id WHERE m.team_id=?1 AND m.status='accepted' ORDER BY m.slot", team.id);
  const total = qv.price.total; let left = total; const plan = qv.schedule || [], sched = plan.map((s, i) => { const amt = i === plan.length - 1 ? left : Math.round(total * s.pct / 100); left -= amt; return { label: s.label, pct: s.pct, amount: amt, due: i === 0 ? "on signing" : i === plan.length - 1 ? "on final delivery" : "before " + (team.start_day || "the shoot") }; });
  const clauses = (C.contractClauses && C.contractClauses.length ? C.contractClauses : CLAUSES).map((c) => ({ title: c[0], text: c[1] }));
  const data = { title: qv.title, client: qv.client, quoteNumber: quote.number, quoteVersion: quote.accepted_version, team: M.map((m) => ({ role: m.role_name, name: m.pro_name })), scope: qv.scope, deliverables: qv.deliverables, summary: qv.summary,
    timeline: { start: team.start_day, days: team.days, city: team.city, mode: team.mode }, price: qv.price, schedule: sched, revisions: qv.revisions, usage: qv.usage, assumptions: qv.assumptions, exclusions: qv.exclusions,
    fodoFee: (qv.price.groups || []).filter((g) => /FODO production management/.test(g.label)).reduce((a, g) => a + g.amount, 0), cancellation: C.cancellation || CANCEL_DEFAULT, clauses, termsVersion: C.termsVersion || TERMS_VERSION, legalReview: "Template wording: have it reviewed by your lawyer / CA before relying on it." };
  const internal = { members: M.map((m) => ({ memberId: m.id, proId: m.pro_id, role: m.role_name, name: m.pro_name, fee: m.amount || 0 })), equipmentCost: qi.equipmentCost || 0, tax: qv.price.tax && qv.price.tax.charged ? qv.price.tax.amount : 0, total, quoteInternal: qi };
  return { data, internal };
}
export const CANCEL_DEFAULT = [{ daysBefore: 14, refundPct: 90 }, { daysBefore: 7, refundPct: 50 }, { daysBefore: 0, refundPct: 0 }];
const cOut = (c, v, isStaff, events, versions) => Object.assign({ id: c.id, number: c.number, title: c.title, status: c.status, version: v ? v.version : null, latestVersion: c.version, sentVersion: c.sent_version, acceptedVersion: c.accepted_version, acceptedAt: c.accepted_at, projectId: c.project_id, quoteId: c.quote_id, teamId: c.team_id,
  kind: v ? v.kind : null, note: v ? v.note : null, amountChange: v ? v.amount_change : null, data: v ? J(v.data, {}) : null, versions: versions || [] }, isStaff ? { internal: v ? J(v.internal, null) : null, events: events || [] } : {});

export async function generate(env, u, R, teamId) {
  if (!can(R, ["admin"])) throw err("Only FODO admins prepare contracts.", 403); const d = await fdb(env), t = await one(d, "SELECT * FROM biz_teams WHERE id=?1", teamId); if (!t) throw err("Team not found.", 404);
  if (t.status !== "locked" && t.status !== "active") throw err("Lock the team first: the contract names the confirmed people.", 409);
  const ex = await one(d, "SELECT id FROM biz_contracts WHERE team_id=?1", t.id); if (ex) return getContract(env, u, R, ex.id);
  const q = await one(d, "SELECT * FROM biz_quotes WHERE id=?1", t.quote_id); if (!q || q.status !== "accepted") throw err("The quote must be accepted.", 409);
  const s = await snapshot(env, d, t, q), id = "ct" + randId(14), now = nowIso(), number = await numberFor(d, "biz_contracts", "CT");
  await run(d, "INSERT INTO biz_contracts (id, number, quote_id, team_id, client_id, title, status, version, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,'draft',1,?7,?7)", id, number, q.id, t.id, t.client_id, s.data.title, now);
  await run(d, "INSERT INTO biz_contract_versions (contract_id, version, kind, data, internal, created_by, created_at) VALUES (?1,1,'original',?2,?3,?4,?5)", id, JSON.stringify(Object.assign(s.data, { number })), JSON.stringify(s.internal), u.email, now);
  await cev(d, id, 1, "created", u.email, "from " + q.number + " and team " + t.id); await auditLog(env, u.email, "contract:create", id, number); return getContract(env, u, R, id);
}
async function peer(env, u, ownerId) { try { return (await (await import("./orgs.js")).peersOf(env, u)).indexOf(ownerId) > -1; } catch (e) { return false; } }   /* v47.6 organization colleagues: read-only */
export async function getContract(env, u, R, id, ver) {
  const d = await fdb(env), c = await one(d, "SELECT * FROM biz_contracts WHERE id=?1", clip(id, 40)), st = staff(R); if (!c || (c.client_id !== u.id && !st && !(await peer(env, u, c.client_id)))) throw err("Contract not found.", 404);
  if (!st) { if (!c.sent_version) throw err("Contract not found.", 404); const v = await one(d, "SELECT * FROM biz_contract_versions WHERE contract_id=?1 AND version=?2", c.id, c.sent_version);
    return cOut(c, v, false, null, await all(d, "SELECT version, kind, note, amount_change, sent_at, accepted_at FROM biz_contract_versions WHERE contract_id=?1 AND sent_at IS NOT NULL ORDER BY version DESC", c.id)); }
  const v = await one(d, "SELECT * FROM biz_contract_versions WHERE contract_id=?1 AND version=?2", c.id, ver ? +ver : c.version);
  return cOut(c, v, true, await all(d, "SELECT version, kind, by_email, note, created_at FROM biz_contract_events WHERE contract_id=?1 ORDER BY id DESC LIMIT 100", c.id), await all(d, "SELECT version, kind, note, amount_change, created_by, created_at, sent_at, accepted_at FROM biz_contract_versions WHERE contract_id=?1 ORDER BY version DESC", c.id));
}
export async function contractForQuote(env, u, R, quoteId) { const d = await fdb(env), c = await one(d, "SELECT id, client_id, sent_version FROM biz_contracts WHERE quote_id=?1", clip(quoteId, 40)); if (!c || (c.client_id !== u.id && !staff(R)) || (!c.sent_version && !staff(R))) return null; return getContract(env, u, R, c.id); }
export async function adminContracts(env, R, q) { if (!staff(R)) throw err("Not allowed.", 403); const d = await fdb(env);
  return all(d, "SELECT c.id, c.number, c.title, c.status, c.version, c.sent_version, c.accepted_version, c.project_id, c.updated_at, u.email client FROM biz_contracts c LEFT JOIN acct_users u ON u.id=c.client_id WHERE (?1='' OR c.status=?1) ORDER BY c.updated_at DESC LIMIT 200", clip(q.status, 30)); }
export async function sendContract(env, u, R, id) {
  if (!can(R, ["admin"])) throw err("Only FODO admins send contracts.", 403); const d = await fdb(env), c = await one(d, "SELECT * FROM biz_contracts WHERE id=?1", clip(id, 40)); if (!c) throw err("Contract not found.", 404);
  if (["cancelled"].indexOf(c.status) > -1) throw err("This contract was cancelled.", 409); const v = await one(d, "SELECT * FROM biz_contract_versions WHERE contract_id=?1 AND version=?2", c.id, c.version); if (v.sent_at) throw err("This version was already sent.", 409);
  const now = nowIso(); await run(d, "UPDATE biz_contract_versions SET sent_at=?3 WHERE contract_id=?1 AND version=?2 AND sent_at IS NULL", c.id, c.version, now);
  await run(d, "UPDATE biz_contracts SET status=?2, sent_version=?3, updated_at=?4 WHERE id=?1", c.id, v.kind === "amendment" ? "amendment_pending" : "sent", c.version, now);
  await cev(d, c.id, c.version, "sent", u.email, v.kind); await auditLog(env, u.email, "contract:send", c.id, c.number + " v" + c.version);
  await notify(env, c.client_id, "contract", (v.kind === "amendment" ? "An amendment to your contract " : "Your contract ") + c.number + " is ready to review and sign.", "#contract=" + c.id); return getContract(env, u, R, c.id);
}
/* the client signs: explicit agreement + their typed full name; nothing is charged by signing */
export async function signContract(env, u, R, id, b, req) {
  const d = await fdb(env), c = await one(d, "SELECT * FROM biz_contracts WHERE id=?1", clip(id, 40)); if (!c || !(await (await import("./orgs.js")).mayAct(env, u, c.client_id))) throw err("Contract not found.", 404);   /* v47.6 organization admins may sign for a colleague when allowed */
  if (["sent", "amendment_pending"].indexOf(c.status) < 0) throw err(c.status === "accepted" ? "Already signed." : "Nothing to sign right now.", 409);
  if (+b.version !== c.sent_version) throw err("A newer version was sent. Review it before signing.", 409); if (b.agree !== true) throw err("Tick that you agree to the contract.");
  const name = clip(b.name, 120); if (name.length < 3) throw err("Type your full name to sign.");
  const ip = (req && req.headers.get("cf-connecting-ip")) || "", h = ip ? Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("fodo-contract:" + ip)))).slice(0, 12).map((x) => x.toString(16).padStart(2, "0")).join("") : null, now = nowIso();
  const x = await run(d, "UPDATE biz_contracts SET status='accepted', accepted_version=?2, accepted_at=?3, accepted_by=?4, accept_meta=?5, updated_at=?3 WHERE id=?1 AND status IN ('sent','amendment_pending') AND sent_version=?2", c.id, c.sent_version, now, u.id, JSON.stringify({ name, email: u.email, ipHash: h, ua: clip(req && req.headers.get("user-agent"), 300), termsVersion: TERMS_VERSION }));
  if (!x.meta.changes) throw err("The contract changed meanwhile, reload.", 409); await run(d, "UPDATE biz_contract_versions SET accepted_at=?3 WHERE contract_id=?1 AND version=?2", c.id, c.sent_version, now);
  const v = await one(d, "SELECT * FROM biz_contract_versions WHERE contract_id=?1 AND version=?2", c.id, c.sent_version);
  await cev(d, c.id, c.sent_version, "signed", u.email, name); await auditLog(env, u.email, "contract:sign", c.id, c.number + " v" + c.sent_version);
  if (v.kind === "original") await openProject(env, d, c, J(v.data, {}), J(v.internal, {}));
  else await applyAmendment(env, d, c, v);
  await owners(env, "Contract " + c.number + (v.kind === "amendment" ? " amendment" : "") + " signed by the client.", "#admin?tab=finance&sub=contracts&id=" + c.id); return getContract(env, u, R, c.id);
}
/* the signed contract opens the project workspace: the team joins it and the payment plan becomes its milestones */
async function openProject(env, d, c, data, internal) {
  if (c.project_id) return c.project_id; const now = nowIso(), pid = "pj" + randId(14), M = internal.members || [];
  const lead = M.find((m) => /Producer/.test(m.role)) || M.find((m) => /^Director$|Production Manager/.test(m.role)) || M[0]; if (!lead) throw err("The contract has no confirmed team.", 409);
  await run(d, "INSERT INTO biz_projects (id, client_id, pro_id, title, brief, kind, budget, status, mode, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,'contract',?6,'accepted','fixed',?7,?7)", pid, c.client_id, lead.proId, data.title, clip(data.summary, 2000) || data.title, data.price.total, now);
  for (const m of M) if (m.proId !== lead.proId) await run(d, "INSERT OR IGNORE INTO biz_project_pros (project_id, pro_id, role, status, added_by, created_at) VALUES (?1,?2,?3,'accepted','contract',?4)", pid, m.proId, m.role, now);
  let i = 0;
  for (const s of data.schedule || []) await run(d, "INSERT INTO biz_milestones (id, project_id, idx, title, amount, status, kind, pro_id, note) VALUES (?1,?2,?3,?4,?5,'pending','contract',?6,?7)", "ms" + randId(14), pid, i++, s.label + " (" + s.pct + "%)", s.amount, lead.proId, "contract " + c.number + " · " + s.due);
  await run(d, "UPDATE biz_contracts SET project_id=?2 WHERE id=?1", c.id, pid); await run(d, "UPDATE biz_teams SET status='active', updated_at=?2 WHERE id=?1 AND status='locked'", c.team_id, now);
  await cev(d, c.id, 1, "project_opened", "system", pid);
  await notify(env, c.client_id, "contract", "Contract signed. Your project workspace is open: pay the first milestone to confirm the booking.", "#project=" + pid);
  for (const m of M) { const p = await one(d, "SELECT user_id FROM biz_pros WHERE id=?1", m.proId); if (p) await notify(env, p.user_id, "contract", "The client signed the contract for " + data.title + ". The project workspace is open.", "/fodo-pros/#project=" + pid); }
  return pid;
}
/* amendments: a new version (after acceptance) with a price change and who gets what from it; the client signs it again */
export async function amend(env, u, R, id, b) {
  if (!can(R, ["admin"])) throw err("Only FODO admins amend contracts.", 403); const d = await fdb(env), c = await one(d, "SELECT * FROM biz_contracts WHERE id=?1", clip(id, 40)); if (!c) throw err("Contract not found.", 404);
  if (c.status !== "accepted") throw err(c.status === "draft" ? "Edit the draft instead: it isn't signed yet." : "Finish the pending version first.", 409);
  const note = clip(b.note, 1000); if (note.length < 5) throw err("Describe the amendment (the client reads it).");
  const change = Math.round(+b.amountChange || 0); if (!isFinite(change) || Math.abs(change) > 1e9) throw err("Bad amount.");
  const prev = await one(d, "SELECT * FROM biz_contract_versions WHERE contract_id=?1 AND version=?2", c.id, c.accepted_version), data = J(prev.data, {}), internal = J(prev.internal, {}), M = internal.members || [];
  const alloc = (Array.isArray(b.allocation) ? b.allocation : []).slice(0, 30).map((a) => ({ memberId: clip(a.memberId, 40), amount: Math.round(+a.amount || 0) })).filter((a) => a.amount);
  if (alloc.some((a) => !M.find((m) => m.memberId === a.memberId))) throw err("Allocate only to people on the contract.");
  if (change > 0 && alloc.reduce((s, a) => s + a.amount, 0) > change) throw err("You can't allocate more to the team than the amendment adds.");
  if (change < 0) { const pend = await all(d, "SELECT * FROM biz_milestones WHERE project_id=?1 AND status='pending' ORDER BY idx DESC", c.project_id); if (pend.reduce((s, m) => s + m.amount, 0) < -change) throw err("A reduction can only come off unpaid milestones (" + inr(pend.reduce((s, m) => s + m.amount, 0)) + " left unpaid). Use a refund for paid money.", 409); }
  const v = c.version + 1, now = nowIso(); data.price = Object.assign({}, data.price, { total: data.price.total + change }); data.amendments = (data.amendments || []).concat([{ version: v, note, amountChange: change, at: now }]);
  internal.amendments = (internal.amendments || []).concat([{ version: v, amountChange: change, allocation: alloc }]);
  await run(d, "INSERT INTO biz_contract_versions (contract_id, version, kind, data, internal, note, amount_change, created_by, created_at) VALUES (?1,?2,'amendment',?3,?4,?5,?6,?7,?8)", c.id, v, JSON.stringify(data), JSON.stringify(internal), note, change, u.email, now);
  await run(d, "UPDATE biz_contracts SET version=?2, updated_at=?3 WHERE id=?1", c.id, v, now); await cev(d, c.id, v, "amendment_created", u.email, note + " (" + (change >= 0 ? "+" : "") + inr(change).replace("₹-", "-₹") + ")");
  await auditLog(env, u.email, "contract:amend", c.id, "v" + v + " " + change); return getContract(env, u, R, c.id);
}
async function applyAmendment(env, d, c, v) {
  const ch = v.amount_change || 0; if (!ch || !c.project_id) return; const n = ((await one(d, "SELECT MAX(idx) n FROM biz_milestones WHERE project_id=?1", c.project_id)) || {}).n || 0, pj = await one(d, "SELECT * FROM biz_projects WHERE id=?1", c.project_id);
  if (ch > 0) await run(d, "INSERT INTO biz_milestones (id, project_id, idx, title, amount, status, kind, pro_id, note) VALUES (?1,?2,?3,?4,?5,'pending','contract',?6,?7)", "ms" + randId(14), c.project_id, n + 1, "Amendment " + (v.version - 1), ch, pj.pro_id, "contract " + c.number + " amendment v" + v.version);
  else { let left = -ch; for (const m of await all(d, "SELECT * FROM biz_milestones WHERE project_id=?1 AND status='pending' ORDER BY idx DESC", c.project_id)) { if (!left) break; const cut = Math.min(left, m.amount - 1); if (cut <= 0) continue; await run(d, "UPDATE biz_milestones SET amount=amount-?2, note=COALESCE(note,'') || ?3 WHERE id=?1 AND status='pending'", m.id, cut, " · reduced by amendment v" + v.version); left -= cut; } }
  await run(d, "UPDATE biz_projects SET budget=budget+?2, updated_at=?3 WHERE id=?1", c.project_id, ch, nowIso());
}
export async function cancelContract(env, u, R, id, b) { if (!can(R, ["admin"])) throw err("Only FODO admins.", 403); const d = await fdb(env), c = await one(d, "SELECT * FROM biz_contracts WHERE id=?1", clip(id, 40)); if (!c) throw err("Contract not found.", 404);
  if (c.status === "accepted" || c.project_id) throw err("A signed contract isn't cancelled here: use the cancellation calculator and the project's refund tools.", 409); const r = clip(b.reason, 300); if (r.length < 3) throw err("Say why.");
  await run(d, "UPDATE biz_contracts SET status='cancelled', updated_at=?2 WHERE id=?1", c.id, nowIso()); await cev(d, c.id, c.version, "cancelled", u.email, r); return getContract(env, u, R, c.id); }

/* ---------- cancellation calculator (policy from the signed contract, not today's settings) ---------- */
export async function cancellationQuote(env, R, id) {
  if (!staff(R)) throw err("Not allowed.", 403); const d = await fdb(env), c = await one(d, "SELECT * FROM biz_contracts WHERE id=?1", clip(id, 40)); if (!c || !c.accepted_version) throw err("Only signed contracts have a cancellation calculation.", 409);
  const v = J((await one(d, "SELECT data, internal FROM biz_contract_versions WHERE contract_id=?1 AND version=?2", c.id, c.accepted_version)).data, {}), internal = J((await one(d, "SELECT internal FROM biz_contract_versions WHERE contract_id=?1 AND version=?2", c.id, c.accepted_version)).internal, {});
  const start = v.timeline && v.timeline.start, days = start ? Math.floor((Date.parse(start + "T00:00:00Z") - Date.parse(nowIso().slice(0, 10) + "T00:00:00Z")) / 864e5) : null, P = (v.cancellation || CANCEL_DEFAULT).slice().sort((a, z) => z.daysBefore - a.daysBefore);
  const band = days == null ? P[0] : (P.find((x) => days >= x.daysBefore) || P[P.length - 1]);
  const ms = c.project_id ? await all(d, "SELECT status, amount, refunded FROM biz_milestones WHERE project_id=?1", c.project_id) : [], held = ms.filter((m) => ["funded", "submitted"].indexOf(m.status) > -1).reduce((s, m) => s + m.amount, 0), released = ms.filter((m) => m.status === "approved").reduce((s, m) => s + m.amount, 0);
  const external = days != null && days <= ((await pricingConfig(env)).equipmentBufferDays || 1) + 1 ? internal.equipmentCost || 0 : 0, refundable = Math.max(0, Math.round(held * band.refundPct / 100) - external);
  return { contract: c.number, daysToStart: days, policy: P, band, heldNotApproved: held, alreadyReleased: released, nonRefundableExternal: external, refundable, keepByFodo: held - refundable,
    explanation: (days == null ? "No start date: the first band applies. " : days + " day(s) before the start: " + band.refundPct + "% of the money FODO still holds is refundable. ") + (external ? "Equipment partner costs already committed (" + inr(external) + ") are not refundable. " : "") + "Money already released for approved work isn't refunded.",
    legalReview: "This follows the policy stored in the signed contract. Check it with your lawyer before telling the client.", next: "Refund from the project page (Refund in progress until the gateway confirms)." };
}

/* ---------- settlement: split one paid + approved milestone between the team, partners, taxes and FODO ---------- */
export async function settle(env, msId, amountOverride, actor) {
  const d = await fdb(env), m = await one(d, "SELECT * FROM biz_milestones WHERE id=?1", msId); if (!m || m.kind !== "contract") return null;
  if (await one(d, "SELECT 1 x FROM biz_settlements WHERE milestone_id=?1", m.id)) return null;   // once
  const c = await one(d, "SELECT * FROM biz_contracts WHERE project_id=?1", m.project_id); if (!c) return null;
  const v = await one(d, "SELECT * FROM biz_contract_versions WHERE contract_id=?1 AND version=?2", c.id, c.accepted_version), I = J(v.internal, {}), pj = await one(d, "SELECT * FROM biz_projects WHERE id=?1", m.project_id), amount = amountOverride != null ? amountOverride : m.amount, now = nowIso(), sid = "st" + randId(14), lines = [];
  const amendment = /^Amendment /.test(m.title), totalBase = I.total || pj.budget, contractMs = await all(d, "SELECT * FROM biz_milestones WHERE project_id=?1 AND kind='contract' AND title NOT LIKE 'Amendment %' ORDER BY idx", m.project_id);
  if (amendment) { const av = +((m.title.match(/^Amendment (\d+)/) || [])[1] || 0) + 1, am = (I.amendments || []).find((a) => a.version === av) || { allocation: [] }; /* "Amendment N" = contract version N+1 */ const r = amount / (m.amount || 1);
    for (const a of am.allocation || []) { const mem = (I.members || []).find((x) => x.memberId === a.memberId); if (mem) lines.push({ kind: "pro", pro_id: mem.proId, member_id: mem.memberId, label: mem.role + " (" + mem.name + "), amendment", amount: Math.round(a.amount * r) }); } }
  else { const r = amount / (totalBase || 1), last = contractMs.length && contractMs[contractMs.length - 1].id === m.id && amountOverride == null;
    const prior = {}; for (const x of await all(d, "SELECT l.member_id, l.kind, sum(l.amount) n FROM biz_settlement_lines l JOIN biz_settlements s ON s.id=l.settlement_id WHERE s.project_id=?1 GROUP BY l.member_id, l.kind", m.project_id)) prior[(x.member_id || "") + "|" + x.kind] = x.n;
    for (const mem of I.members || []) { const amt = last ? mem.fee - (prior[mem.memberId + "|pro"] || 0) : Math.round(mem.fee * r); if (amt > 0) lines.push({ kind: "pro", pro_id: mem.proId, member_id: mem.memberId, label: mem.role + " (" + mem.name + ")", amount: amt }); }
    const eq = last ? (I.equipmentCost || 0) - (prior["|partner"] || 0) : Math.round((I.equipmentCost || 0) * r); if (eq > 0) lines.push({ kind: "partner", label: "Equipment partners", amount: eq });
    const tx = last ? (I.tax || 0) - (prior["|tax"] || 0) : Math.round((I.tax || 0) * r); if (tx > 0) lines.push({ kind: "tax", label: "Tax collected", amount: tx }); }
  const used = lines.reduce((s, l) => s + l.amount, 0), fodo = amount - used; lines.push({ kind: "fodo", label: "FODO (management fee, contingency, equipment margin)", amount: fodo });
  const status = fodo < 0 ? "manual_review" : "settled";
  try { await run(d, "INSERT INTO biz_settlements (id, milestone_id, project_id, contract_id, amount, provider, status, note, created_at) VALUES (?1,?2,?3,?4,?5,'internal',?6,?7,?8)", sid, m.id, m.project_id, c.id, amount, status, status === "manual_review" ? "Allocations exceed the milestone: FODO finance must review before payouts." : null, now); }
  catch (e) { return null; }   // another request settled it first
  for (const l of lines) { const lid = "sl" + randId(12); await run(d, "INSERT INTO biz_settlement_lines (id, settlement_id, kind, pro_id, member_id, label, amount) VALUES (?1,?2,?3,?4,?5,?6,?7)", lid, sid, l.kind, l.pro_id || null, l.member_id || null, l.label, l.amount); l.id = lid;
    await ledger(env, "settlement", { pro: "pro_payable", partner: "partner_payable", tax: "tax_payable", fodo: "fodo_revenue" }[l.kind], "settlement_line", lid, m.project_id, l.amount, l.label);
    if (l.kind === "pro" && status === "settled" && l.amount > 0) await run(d, "INSERT OR IGNORE INTO biz_payouts (id, milestone_id, source_milestone, label, pro_id, gross, commission, net, status, created_at) VALUES (?1,?2,?3,?4,?5,?6,0,?6,?7,?8)", "po" + randId(12), lid, m.id, pj.title + ": " + m.title + " · " + l.label, l.pro_id, l.amount, payoutsOn(env) ? "queued" : "awaiting_provider", now); }
  await auditLog(env, actor || "system", "settlement:" + status, sid, m.id + " " + amount);
  if (status === "settled") await splitIfOn(env, d, sid, m); else await owners(env, "A settlement needs review: " + pj.title + " · " + m.title, "#admin?tab=finance&sub=settlements");
  return sid;
}
/* Cashfree Easy Split (when switched on and every professional has a Cashfree vendor id): Cashfree pays the professionals'
   shares from the order, so those payouts are marked "via split" and can never be sent a second time by the payout adapter. */
export const splitOn = (env) => env.CASHFREE_SPLIT_ON === "1" && cfOn(env);
async function splitIfOn(env, d, sid, m) {
  if (!splitOn(env)) { await run(d, "UPDATE biz_settlements SET note=COALESCE(note, 'Payouts through the payout adapter or by hand (Cashfree Easy Split: awaiting provider activation)') WHERE id=?1", sid); return; }
  const L = await all(d, "SELECT l.*, p.cf_vendor_id FROM biz_settlement_lines l LEFT JOIN biz_pros p ON p.id=l.pro_id WHERE l.settlement_id=?1 AND l.kind='pro' AND l.amount > 0", sid), o = m.order_id && await (await adb(env)).prepare("SELECT * FROM acct_orders WHERE order_id=?1 AND status='PAID'").bind(m.order_id).first();
  if (!L.length) return; if (!o || /^order_/.test(o.cf_order_id || "")) { await run(d, "UPDATE biz_settlements SET note='Not a Cashfree order: payouts go through the payout adapter.' WHERE id=?1", sid); return; }
  const miss = L.filter((l) => !l.cf_vendor_id); if (miss.length) { await run(d, "UPDATE biz_settlements SET note=?2 WHERE id=?1", sid, "Easy Split skipped: no Cashfree vendor id for " + miss.map((l) => l.label).join(", ")); return; }
  try { const r = await cf(env, "POST", "/easy-split/orders/" + encodeURIComponent(m.order_id) + "/split", { split: L.map((l) => ({ vendor_id: l.cf_vendor_id, amount: l.amount, tags: { fodo_line: l.id } })), disable_split: false }, sid);
    await run(d, "UPDATE biz_settlements SET provider='cashfree_split', status='split_requested', provider_ref=?2, note=?3 WHERE id=?1", sid, clip(r.message || r.status || "OK", 120), "Cashfree Easy Split requested");
    for (const l of L) await run(d, "UPDATE biz_payouts SET status='via_split' WHERE milestone_id=?1 AND status IN ('queued','awaiting_provider')", l.id); }
  catch (e) { await run(d, "UPDATE biz_settlements SET note=?2 WHERE id=?1", sid, "Easy Split failed (" + clip(e.message, 120) + "): pay through the payout adapter or retry."); }
}
export async function settlements(env, R, q) { if (!staff(R)) throw err("Not allowed.", 403); const d = await fdb(env);
  const S = await all(d, "SELECT s.*, m.title mtitle, j.title ptitle FROM biz_settlements s JOIN biz_milestones m ON m.id=s.milestone_id JOIN biz_projects j ON j.id=s.project_id WHERE (?1='' OR s.status=?1) ORDER BY s.created_at DESC LIMIT 200", clip(q.status, 30));
  for (const s of S) s.lines = await all(d, "SELECT l.id, l.kind, l.label, l.amount, po.status payout FROM biz_settlement_lines l LEFT JOIN biz_payouts po ON po.milestone_id=l.id WHERE l.settlement_id=?1", s.id); return { items: S, splitOn: splitOn(env) }; }
/* finance releases a settlement that needed review (after checking the numbers): the professional lines become payouts */
export async function releaseSettlement(env, u, R, id, b) { if (!can(R, ["admin", "finance"])) throw err("Only FODO finance or admins.", 403); const d = await fdb(env), s = await one(d, "SELECT * FROM biz_settlements WHERE id=?1 AND status='manual_review'", clip(id, 40)); if (!s) throw err("Nothing to release.", 409);
  const r = clip(b.reason, 300); if (r.length < 3) throw err("Say what you checked."); const m = await one(d, "SELECT * FROM biz_milestones WHERE id=?1", s.milestone_id), pj = await one(d, "SELECT title FROM biz_projects WHERE id=?1", s.project_id);
  for (const l of await all(d, "SELECT * FROM biz_settlement_lines WHERE settlement_id=?1 AND kind='pro' AND amount > 0", s.id)) await run(d, "INSERT OR IGNORE INTO biz_payouts (id, milestone_id, source_milestone, label, pro_id, gross, commission, net, status, created_at) VALUES (?1,?2,?3,?4,?5,?6,0,?6,?7,?8)", "po" + randId(12), l.id, m.id, pj.title + ": " + m.title + " · " + l.label, l.pro_id, l.amount, payoutsOn(env) ? "queued" : "awaiting_provider", nowIso());
  await run(d, "UPDATE biz_settlements SET status='settled', note=?2 WHERE id=?1", s.id, "released after review: " + r); await auditLog(env, u.email, "settlement:release", s.id, r); return { ok: true }; }
export async function setVendor(env, u, R, proId, b) { if (!can(R, ["admin", "finance"])) throw err("Only FODO finance or admins.", 403); const v = clip(b.vendorId, 60); if (v && !/^[A-Za-z0-9_-]{3,60}$/.test(v)) throw err("Vendor ids are letters, numbers, - or _.");
  const d = await fdb(env), x = await run(d, "UPDATE biz_pros SET cf_vendor_id=?2 WHERE id=?1", clip(proId, 40), v || null); if (!x.meta.changes) throw err("Professional not found.", 404); await auditLog(env, u.email, "pro:vendor", proId, v ? "set" : "cleared"); return { ok: true, vendorId: v || null }; }

/* ---------- invoices + credit notes ---------- */
export async function invoiceForMilestone(env, msId) {
  const d = await fdb(env), m = await one(d, "SELECT * FROM biz_milestones WHERE id=?1", msId); if (!m || m.kind !== "contract") return null; if (await one(d, "SELECT id FROM biz_invoices WHERE milestone_id=?1 AND kind='invoice'", m.id)) return null;
  const c = await one(d, "SELECT * FROM biz_contracts WHERE project_id=?1", m.project_id); if (!c) return null; const v = J((await one(d, "SELECT data FROM biz_contract_versions WHERE contract_id=?1 AND version=?2", c.id, c.accepted_version)).data, {}), P = v.price || {}, r = m.amount / (P.total || m.amount);
  const taxPct = P.tax && P.tax.charged ? P.tax.pct : 0, tax = taxPct ? Math.round(m.amount - m.amount / (1 + taxPct / 100)) : 0, sub = m.amount - tax, gst = !!env.FODO_GSTIN;
  const lines = /^Amendment /.test(m.title) ? [{ label: m.title + " (" + (v.amendments || []).map((a) => a.note).slice(-1)[0] + ")", amount: sub }] : (P.groups || []).filter((g) => g.amount).map((g) => ({ label: g.label, amount: Math.round(g.amount * r) }));
  const diff = sub - lines.reduce((s, l) => s + l.amount, 0); if (lines.length) lines[lines.length - 1].amount += diff;   // rounding: lines always add up to the subtotal
  const id = "iv" + randId(14), number = await numberFor(d, "biz_invoices", "FI"), now = nowIso();
  try { await run(d, "INSERT INTO biz_invoices (id, number, kind, title, contract_id, project_id, milestone_id, client_id, data, subtotal, tax, total, status, ref, issue_date, created_at) VALUES (?1,?2,'invoice',?3,?4,?5,?6,?7,?8,?9,?10,?11,'paid',?12,?13,?13)", id, number, gst ? "Tax invoice" : "Payment receipt", c.id, m.project_id, m.id, c.client_id,
    JSON.stringify({ project: v.title, milestone: m.title, contract: c.number, client: v.client, lines, taxLabel: P.tax && P.tax.label, taxPct, gstin: env.FODO_GSTIN || null }), sub, tax, m.amount, m.order_id || null, now); } catch (e) { return null; }
  return id;
}
export async function creditNote(env, refundId) {
  const d = await fdb(env), r = await one(d, "SELECT * FROM biz_refunds WHERE id=?1 AND status='refunded'", refundId); if (!r) return null; const inv = await one(d, "SELECT * FROM biz_invoices WHERE milestone_id=?1 AND kind='invoice'", r.milestone_id); if (!inv) return null;
  const id = "cn" + randId(14), number = await numberFor(d, "biz_invoices", "CN"), now = nowIso(), tax = inv.tax ? Math.round(inv.tax * r.amount / inv.total) : 0;
  try { await run(d, "INSERT INTO biz_invoices (id, number, kind, title, contract_id, project_id, milestone_id, refund_id, client_id, data, subtotal, tax, total, status, ref, related_id, issue_date, created_at) VALUES (?1,?2,'credit_note','Credit note',?3,?4,?5,?6,?7,?8,?9,?10,?11,'issued',?12,?13,?14,?14)", id, number, inv.contract_id, inv.project_id, inv.milestone_id, r.id, inv.client_id,
    JSON.stringify(Object.assign(J(inv.data, {}), { against: inv.number, reason: r.reason, lines: [{ label: "Refund against " + inv.number, amount: r.amount - tax }] })), r.amount - tax, tax, r.amount, r.provider_ref || null, inv.id, now); } catch (e) { return null; }
  await run(d, "UPDATE biz_invoices SET status=CASE WHEN ?2 >= total THEN 'credited' ELSE 'partly_credited' END WHERE id=?1", inv.id, r.amount); return id;
}
export async function invoices(env, u, R, q) { const d = await fdb(env), st = staff(R) && q.all === "1";
  return all(d, "SELECT i.id, i.number, i.kind, i.title, i.total, i.tax, i.status, i.issue_date, i.project_id, j.title project FROM biz_invoices i LEFT JOIN biz_projects j ON j.id=i.project_id WHERE (?1=1 OR i.client_id=?2) AND (?3='' OR i.project_id=?3) ORDER BY i.created_at DESC LIMIT 300", st ? 1 : 0, u.id, clip(q.project, 40)); }
export async function invoiceHtml(env, u, R, id) {
  const d = await fdb(env), i = await one(d, "SELECT * FROM biz_invoices WHERE id=?1", clip(id, 40)); if (!i || (i.client_id !== u.id && !staff(R) && !(await peer(env, u, i.client_id)))) throw err("Not found.", 404); const x = J(i.data, {}), day = (s) => new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + esc(i.number) + '</title><style>body{font:14px/1.55 system-ui,Inter,Arial,sans-serif;color:#0B0B0C;margin:0}main{max-width:760px;margin:0 auto;padding:40px 28px}.mark{font-weight:800;font-size:28px;letter-spacing:-.06em}.mark i{display:inline-block;width:.2em;height:.2em;border-radius:50%;background:#7B61FF;vertical-align:top;margin-left:2px}.tag{font-size:10px;letter-spacing:.2em;color:#5a5a66}h1{font-size:24px;margin:24px 0 4px}.m{color:#5a5a66}table{width:100%;border-collapse:collapse;margin:20px 0}td{padding:8px 6px;border-bottom:1px solid #e3e3e8}td.n{text-align:right;white-space:nowrap}.t td{font-weight:800;font-size:17px;border-top:2px solid #0B0B0C;border-bottom:0}.f{margin-top:30px;font-size:11px;color:#5a5a66}@media print{.np{display:none}}</style></head><body><main>' +
    '<div class="mark">FODO<i></i></div><div class="tag">FEAR OF DIGITALLY OUT ?</div><h1>' + esc(i.title) + " " + esc(i.number) + '</h1><p class="m">Issued ' + esc(day(i.issue_date)) + (x.against ? " · against " + esc(x.against) : "") + " · contract " + esc(x.contract) + "<br>Billed to " + esc((x.client && (x.client.company || x.client.name || x.client.email)) || "") + (x.client && x.client.gstin ? "<br>Client GSTIN " + esc(x.client.gstin) : "") + (x.client && x.client.address ? "<br>" + esc(x.client.address) : "") + (x.gstin ? "<br>FODO GSTIN " + esc(x.gstin) : "") + "</p><p><b>" + esc(x.project) + "</b> · " + esc(x.milestone) + "</p>" +
    "<table>" + (x.lines || []).map((l) => "<tr><td>" + esc(l.label) + '</td><td class="n">' + esc(inr(l.amount)) + "</td></tr>").join("") + "<tr><td>Subtotal</td><td class=\"n\">" + esc(inr(i.subtotal)) + "</td></tr>" + (i.tax ? "<tr><td>" + esc(x.taxLabel || "Tax") + " (" + esc(x.taxPct) + '%)</td><td class="n">' + esc(inr(i.tax)) + "</td></tr>" : "") + '<tr class="t"><td>' + (i.kind === "credit_note" ? "Refunded" : "Total paid") + '</td><td class="n">' + esc(inr(i.total)) + "</td></tr></table>" +
    (i.ref ? '<p class="m">Payment reference: ' + esc(i.ref) + "</p>" : "") + (i.kind === "credit_note" && x.reason ? '<p class="m">Reason: ' + esc(x.reason) + "</p>" : "") + '<p class="np m">Ctrl + P (⌘ + P) → Save as PDF.</p><p class="f">FODO · www.fodo.co.in. ' + (x.gstin ? "" : "FODO is not registered for GST, so no GST is charged; this is a payment receipt, not a tax invoice. ") + "Tax treatment is configurable: confirm with your CA.</p></main></body></html>";
}

/* ---------- reconciliation: order ↔ payment ↔ settlement ↔ payouts ↔ refunds ↔ ledger ---------- */
export async function reconcile(env, R, q) {
  if (!staff(R)) throw err("Not allowed.", 403); const d = await fdb(env), ad = await adb(env), out = [];
  const M = await all(d, "SELECT m.*, j.title ptitle FROM biz_milestones m JOIN biz_projects j ON j.id=m.project_id WHERE m.status IN ('funded','submitted','approved','refunded','refund_processing') ORDER BY m.funded_at DESC LIMIT 200");
  for (const m of M) { const issues = [], pend = []; const o = m.order_id ? await ad.prepare("SELECT amount, status FROM acct_orders WHERE order_id=?1").bind(m.order_id).first() : null;
    const rec = await one(d, "SELECT amount FROM biz_ledger WHERE kind='payment' AND ref_id=?1", m.id), refunded = ((await one(d, "SELECT sum(amount) n FROM biz_refunds WHERE milestone_id=?1 AND status='refunded'", m.id)) || {}).n || 0;
    const st = await one(d, "SELECT * FROM biz_settlements WHERE milestone_id=?1", m.id), po = await all(d, "SELECT net, status FROM biz_payouts WHERE milestone_id=?1 OR source_milestone=?1", m.id);
    if (!o) pend.push("no gateway order on record (manual or test payment)"); else if (o.status !== "PAID") issues.push("gateway order is " + o.status); else if (+o.amount !== m.amount && m.kind !== "hours") issues.push("gateway " + inr(o.amount) + " ≠ milestone " + inr(m.amount));
    if (!rec) pend.push("payment not in the ledger (paid before v47.3)"); else if (rec.amount !== m.amount) issues.push("ledger " + inr(rec.amount) + " ≠ milestone " + inr(m.amount));
    if (m.kind === "contract") { if (m.status === "approved" || (m.status === "refunded" && refunded < m.amount)) { if (!st) issues.push("approved but not settled"); else { const lines = ((await one(d, "SELECT sum(amount) n FROM biz_settlement_lines WHERE settlement_id=?1", st.id)) || {}).n || 0; if (lines !== st.amount) issues.push("settlement lines " + inr(lines) + " ≠ " + inr(st.amount)); if (st.amount !== m.amount - refunded) issues.push("settled " + inr(st.amount) + " ≠ paid − refunded " + inr(m.amount - refunded)); if (st.status === "manual_review") pend.push("settlement waits for finance review"); } } }
    if (m.status === "refund_processing") pend.push("refund in progress");
    const unpaid = po.filter((p) => ["paid", "via_split"].indexOf(p.status) < 0); if (unpaid.length) pend.push(unpaid.length + " payout(s) not paid yet");
    const status = issues.length ? "mismatch" : pend.some((x) => /no gateway order|before v47.3/.test(x)) ? "manual_review" : pend.length ? "pending" : "matched";
    if (!q.status || q.status === status) out.push({ milestone: m.id, project: m.ptitle, title: m.title, amount: m.amount, status, issues: issues.concat(pend), refunded, settled: st ? st.amount : null, payouts: po.length, paidOut: po.filter((p) => p.status === "paid" || p.status === "via_split").reduce((s, p) => s + p.net, 0) }); }
  const count = (s) => out.filter((x) => x.status === s).length; return { summary: { matched: count("matched"), pending: count("pending"), mismatch: count("mismatch"), manual_review: count("manual_review") }, items: out };
}
/* printable contract (Print → Save as PDF) */
export function contractHtml(c) {
  const v = c.data || {}, P = v.price || {}, d0 = (s) => s ? new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "", rows = (L, f) => (L || []).map(f).join("");
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + esc(c.number + " · " + v.title) + '</title><style>body{font:14px/1.6 system-ui,Inter,Arial,sans-serif;color:#0B0B0C;margin:0}main{max-width:820px;margin:0 auto;padding:40px 28px}.mark{font-weight:800;font-size:30px;letter-spacing:-.06em}.mark i{display:inline-block;width:.2em;height:.2em;border-radius:50%;background:#7B61FF;vertical-align:top;margin-left:2px}.tag{font-size:10px;letter-spacing:.2em;color:#5a5a66}h1{font-size:28px;line-height:1.15;margin:22px 0 6px}h2{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#5a5a66;margin:28px 0 8px}.m{color:#5a5a66}table{width:100%;border-collapse:collapse}td{padding:7px 6px;border-bottom:1px solid #e3e3e8;vertical-align:top}td.n{text-align:right;white-space:nowrap}.t td{font-weight:800;border-top:2px solid #0B0B0C;border-bottom:0}.sig{margin-top:30px;padding:16px;border:1px solid #e3e3e8;border-radius:12px}.warn{font-size:12px;color:#9a6700}@media print{.np{display:none}section{break-inside:avoid}}</style></head><body><main>' +
    '<div class="mark">FODO<i></i></div><div class="tag">FEAR OF DIGITALLY OUT ?</div><h1>Contract ' + esc(c.number) + ": " + esc(v.title) + '</h1><p class="m">Version ' + esc(c.version) + (c.kind === "amendment" ? " (amendment)" : "") + " · between FODO and " + esc((v.client && (v.client.company || v.client.name || v.client.email)) || "the client") + " · from quote " + esc(v.quoteNumber) + " v" + esc(v.quoteVersion) + " · terms " + esc(v.termsVersion) + "</p>" +
    '<section><h2>Scope</h2><p>' + esc(v.summary) + "</p><table>" + rows(v.scope, (x) => "<tr><td>" + esc(x.label) + "</td><td>" + esc(x.value) + "</td></tr>") + "</table></section>" +
    ((v.deliverables || []).length ? "<section><h2>Deliverables</h2><ul>" + rows(v.deliverables, (x) => "<li>" + esc(x.count) + " " + esc(x.label) + "</li>") + "</ul></section>" : "") +
    "<section><h2>Team</h2><table>" + rows(v.team, (x) => "<tr><td>" + esc(x.role) + "</td><td>" + esc(x.name) + "</td></tr>") + "</table></section>" +
    "<section><h2>Timeline</h2><p>" + esc([v.timeline && v.timeline.start ? "Start " + d0(v.timeline.start) : "Start date to be agreed", v.timeline && v.timeline.days ? v.timeline.days + " day(s)" : null, v.timeline && v.timeline.city, v.timeline && v.timeline.mode].filter(Boolean).join(" · ")) + "</p></section>" +
    "<section><h2>Investment</h2><table>" + rows(P.groups, (g) => "<tr><td>" + esc(g.label) + '</td><td class="n">' + esc(inr(g.amount)) + "</td></tr>") + rows(v.amendments, (a) => "<tr><td>Amendment v" + esc(a.version) + ": " + esc(a.note) + '</td><td class="n">' + esc((a.amountChange < 0 ? "−" : "+") + inr(Math.abs(a.amountChange))) + "</td></tr>") + "<tr><td>" + esc((P.tax || {}).label || "Tax") + '</td><td class="n">' + ((P.tax || {}).charged ? esc(inr(P.tax.amount)) : "Not charged") + '</td></tr><tr class="t"><td>Total</td><td class="n">' + esc(inr(P.total)) + "</td></tr></table></section>" +
    "<section><h2>Payment schedule</h2><table>" + rows(v.schedule, (s) => "<tr><td>" + esc(s.label) + "</td><td>" + esc(s.due) + '</td><td class="n">' + esc(s.pct) + '%</td><td class="n">' + esc(inr(s.amount)) + "</td></tr>") + "</table></section>" +
    "<section><h2>Cancellation policy</h2><ul>" + rows(v.cancellation, (x) => "<li>" + (x.daysBefore ? esc(x.daysBefore) + "+ days before the start" : "Less than that") + ": " + esc(x.refundPct) + "% of the money FODO still holds is refunded</li>") + "</ul></section>" +
    rows(v.clauses, (x) => "<section><h2>" + esc(x.title) + "</h2><p>" + esc(x.text) + "</p></section>") +
    "<section><h2>Assumptions and exclusions</h2><ul>" + rows(v.assumptions, (a) => "<li>" + esc(a) + "</li>") + rows(v.exclusions, (a) => "<li>Not included: " + esc(a) + "</li>") + "</ul></section>" +
    '<div class="sig"><b>Acceptance</b><p>' + (c.acceptedVersion ? "Signed electronically in the FODO Workspace on " + esc(d0(c.acceptedAt)) + " (version " + esc(c.acceptedVersion) + ")." : "Not signed yet. Sign it in your FODO Workspace.") + '</p></div><p class="warn">' + esc(v.legalReview) + '</p><p class="np m">Ctrl + P (⌘ + P) → Save as PDF.</p></main></body></html>';
}
