/* FODO OS V4 Phase 7 (v50.7): vendors + procurement.
   Purchase request (anyone on the team) → approval through the central approval engine (kind "purchase"; above the limit it goes to
   finance) → purchase order (PO-YYMM-nnnn, by people who manage vendors) → goods / service received → vendor bill (finance) with a
   three-way match (order · received · billed) → paid through the existing Payables (finance records the payment reference; FODO
   never moves money) → rating. Vendor bank details are not stored in FODO; finance keeps them with the bank. */
import { nowIso, migrateOnce } from "../accounts.js";
import { notify } from "../biz.js";
import { one, all, run, J, clip, err, int, DAY, rid, ORG } from "./db.js";
import { has, allows, authorize } from "./authz.js";
import { audit, emit } from "./audit.js";
import { xdb } from "./finance.js";
import { today, addDays, setting, settingSet, numberFor, scopeWhere, holders, chainOf, nameOf, EMAIL, looksLikeAccountNo } from "./kit.js";

const DDL = [
  "CREATE TABLE IF NOT EXISTS os_vendors (id TEXT PRIMARY KEY, org_id TEXT, name TEXT, category TEXT, contact_name TEXT, email TEXT, phone TEXT, gstin TEXT, city TEXT, terms_days INTEGER, status TEXT, block_reason TEXT, notes TEXT, rating_avg REAL, rating_n INTEGER DEFAULT 0, created_by TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE INDEX IF NOT EXISTS os_vendors_s ON os_vendors(org_id, status)",
  "CREATE TABLE IF NOT EXISTS os_purchase_requests (id TEXT PRIMARY KEY, org_id TEXT, number TEXT, title TEXT, vendor_id TEXT, project_id TEXT, department_id TEXT, items TEXT, amount INTEGER, needed_by TEXT, reason TEXT, status TEXT, approval_id TEXT, approver_user_id TEXT, decision_note TEXT, requested_by TEXT, created_at TEXT, submitted_at TEXT, decided_at TEXT, updated_at TEXT)",
  "CREATE INDEX IF NOT EXISTS os_pr_s ON os_purchase_requests(status, requested_by)",
  "CREATE TABLE IF NOT EXISTS os_purchase_orders (id TEXT PRIMARY KEY, org_id TEXT, number TEXT UNIQUE, request_id TEXT, vendor_id TEXT, project_id TEXT, department_id TEXT, title TEXT, items TEXT, amount INTEGER, status TEXT, expected_on TEXT, received_amount INTEGER DEFAULT 0, received_at TEXT, received_note TEXT, cancel_reason TEXT, issued_by TEXT, issued_at TEXT, updated_at TEXT)",
  "CREATE INDEX IF NOT EXISTS os_po_v ON os_purchase_orders(vendor_id, status)",
  "CREATE TABLE IF NOT EXISTS os_vendor_ratings (id TEXT PRIMARY KEY, vendor_id TEXT, po_id TEXT, by_user_id TEXT, quality INTEGER, timeliness INTEGER, communication INTEGER, note TEXT, created_at TEXT, UNIQUE (po_id, by_user_id))"
];
const MIG = ["ALTER TABLE os_payables ADD COLUMN vendor_id TEXT", "ALTER TABLE os_payables ADD COLUMN po_id TEXT", "ALTER TABLE os_payables ADD COLUMN bill_no TEXT", "ALTER TABLE os_payables ADD COLUMN bill_date TEXT", "ALTER TABLE os_payables ADD COLUMN match_status TEXT", "ALTER TABLE os_payables ADD COLUMN match_note TEXT"];
const made = new WeakSet();
export async function vdb(env) { const d = await xdb(env); if (!made.has(d)) { for (const q of DDL) await d.prepare(q).run(); await migrateOnce(d, MIG); made.add(d); } return d; }
export const CATEGORIES = ["equipment_rental", "studio", "printing", "software", "travel", "freelance", "props", "catering", "hardware", "media", "other"];
/* vendor category → the finance (budget) category of its bills */
const FIN_CAT = { equipment_rental: "equipment_rental", studio: "venue", printing: "printing", software: "software", travel: "travel", freelance: "talent", props: "props", catering: "food", hardware: "office", media: "ads", other: "other" };
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, PHONE = /^\+?[0-9\s-]{8,16}$/;
const buyer = (P) => P.isOwner || has(P, "vendor", "manage", "department");
const finance = (P) => P.isOwner || has(P, "finance", "manage", "organization");
export const limitOf = async (d) => +(await setting(d, "proc_limit", 50000)) || 50000;

/* ---------------- vendors ---------------- */
export async function vendors(env, P, q) {
  const d = await vdb(env), W = ["v.org_id=?1"], args = [ORG]; if (q && q.q) { args.push("%" + clip(q.q, 60) + "%"); W.push("(v.name LIKE ?" + args.length + " OR v.category LIKE ?" + args.length + " OR v.city LIKE ?" + args.length + ")"); } if (q && q.status) { args.push(clip(q.status, 12)); W.push("v.status=?" + args.length); }
  const rows = await all(d, "SELECT v.*, (SELECT count(*) FROM os_purchase_orders o WHERE o.vendor_id=v.id AND o.status IN ('issued','partly_received','received')) AS open_pos, (SELECT coalesce(sum(amount),0) FROM os_payables b WHERE b.vendor_id=v.id AND b.status IN ('open','paid')) AS billed, (SELECT coalesce(sum(amount),0) FROM os_payables b WHERE b.vendor_id=v.id AND b.status='open') AS unpaid FROM os_vendors v WHERE " + W.join(" AND ") + " ORDER BY v.status='blocked', v.name LIMIT 400", ...args);
  return { items: rows, categories: CATEGORIES, canManage: buyer(P) };
}
export async function vendorGet(env, P, id) {
  const d = await vdb(env), v = await one(d, "SELECT * FROM os_vendors WHERE id=?1 AND org_id=?2", clip(id, 40), ORG); if (!v) throw err("Not found.", 404);
  const pos = await all(d, "SELECT id, number, title, amount, status, received_amount, issued_at, expected_on FROM os_purchase_orders WHERE vendor_id=?1 ORDER BY issued_at DESC LIMIT 100", v.id);
  const bills = has(P, "finance", "view", "department") ? await all(d, "SELECT id, bill_no, title, amount, due, status, match_status, po_id, paid_at FROM os_payables WHERE vendor_id=?1 ORDER BY created_at DESC LIMIT 100", v.id) : null;
  const ratings = await all(d, "SELECT r.*, " + nameOf("r.by_user_id") + " AS who, (SELECT number FROM os_purchase_orders o WHERE o.id=r.po_id) AS po FROM os_vendor_ratings r WHERE r.vendor_id=?1 ORDER BY r.created_at DESC LIMIT 50", v.id);
  return { vendor: v, orders: pos, bills, ratings, canManage: buyer(P) };
}
export async function vendorSave(env, P, b) {
  if (!buyer(P)) throw err("Only people who manage vendors add or edit them.", 403); const d = await vdb(env), now = nowIso(), name = clip(b.name, 120); if (!name) throw err("Vendor name is required.");
  const gstin = clip(b.gstin, 15).toUpperCase(), email = clip(b.email, 120).toLowerCase(), phone = clip(b.phone, 20); if (gstin && !GSTIN.test(gstin)) throw err("That GSTIN does not look right (15 characters, like 07ABCDE1234F1Z5)."); if (email && !EMAIL.test(email)) throw err("That email does not look right."); if (phone && !PHONE.test(phone)) throw err("That phone number does not look right.");
  const notes = clip(b.notes, 1000); if (looksLikeAccountNo(notes)) throw err("Don't keep bank or card numbers in FODO. Finance keeps vendor bank details with the bank.");
  const o = { name, category: CATEGORIES.indexOf(b.category) > -1 ? b.category : "other", contact_name: clip(b.contact_name, 80), email, phone, gstin: gstin || null, city: clip(b.city, 60), terms_days: int(b.terms_days, 0, 180) == null ? 30 : int(b.terms_days, 0, 180), notes };
  const dupe = await one(d, "SELECT id FROM os_vendors WHERE org_id=?1 AND (lower(name)=lower(?2) OR (?3 IS NOT NULL AND gstin=?3)) AND id<>?4", ORG, name, o.gstin, clip(b.id, 40) || "-"); if (dupe) throw err("A vendor with this name or GSTIN already exists.", 409);
  if (b.id) { const v = await one(d, "SELECT * FROM os_vendors WHERE id=?1 AND org_id=?2", clip(b.id, 40), ORG); if (!v) throw err("Not found.", 404); let status = v.status, reason = v.block_reason;
    if (b.status && b.status !== v.status) { if (["active", "blocked"].indexOf(b.status) < 0) throw err("Status is active or blocked."); status = b.status; reason = status === "blocked" ? clip(b.block_reason, 300) : null; if (status === "blocked" && (reason || "").length < 5) throw err("Say why the vendor is blocked."); }
    await run(d, "UPDATE os_vendors SET name=?2, category=?3, contact_name=?4, email=?5, phone=?6, gstin=?7, city=?8, terms_days=?9, notes=?10, status=?11, block_reason=?12, updated_at=?13 WHERE id=?1", v.id, o.name, o.category, o.contact_name, o.email, o.phone, o.gstin, o.city, o.terms_days, o.notes, status, reason, now);
    await audit(env, P, status !== v.status ? "VENDOR_" + status.toUpperCase() : "VENDOR_EDITED", { kind: "vendor", id: v.id }, { status: v.status }, { status, name }, reason); return { id: v.id }; }
  const id = rid("vn"); await run(d, "INSERT INTO os_vendors (id, org_id, name, category, contact_name, email, phone, gstin, city, terms_days, status, notes, rating_n, created_by, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'active',?11,0,?12,?13,?13)", id, ORG, o.name, o.category, o.contact_name, o.email, o.phone, o.gstin, o.city, o.terms_days, o.notes, P.user.id, now);
  await audit(env, P, "VENDOR_ADDED", { kind: "vendor", id }, null, { name, category: o.category }); return { id };
}

/* ---------------- purchase requests ---------------- */
const cleanItems = (L) => (Array.isArray(L) ? L : []).slice(0, 30).map((x) => ({ name: clip(x && x.name, 120), qty: int(x && x.qty, 1, 100000) || 1, unit_price: int(x && x.unit_price, 0, 1e8) })).filter((x) => x.name && x.unit_price != null);
const total = (items) => items.reduce((a, x) => a + x.qty * x.unit_price, 0);
const visiblePR = (P, r) => r.requested_by === P.user.id || r.approver_user_id === P.user.id || P.isOwner || has(P, "purchase", "view", "organization") || has(P, "finance", "view", "organization");
export async function requests(env, P, q) {
  const d = await vdb(env), s = allows(P, "purchase", "view"); if (!s) throw err("You don't have access to purchases.", 403); const args = [], box = (q && q.box) || "all";
  let W = box === "mine" ? (args.push(P.user.id), "r.requested_by=?1") : "(" + scopeWhere(P, s, "r.requested_by", args) + (args.push(P.user.id), " OR r.approver_user_id=?" + args.length) + ")"; if (q && q.status) { args.push(clip(q.status, 20)); W += " AND r.status=?" + args.length; }
  const rows = await all(d, "SELECT r.*, " + nameOf("r.requested_by") + " AS requester, (SELECT name FROM os_vendors v WHERE v.id=r.vendor_id) AS vendor, (SELECT title FROM biz_projects p WHERE p.id=r.project_id) AS project, (SELECT id FROM os_purchase_orders o WHERE o.request_id=r.id AND o.status<>'cancelled') AS po_id FROM os_purchase_requests r WHERE r.org_id='" + ORG + "' AND " + W + " ORDER BY r.created_at DESC LIMIT 300", ...args);
  return { items: rows.map((r) => Object.assign(r, { items: J(r.items, []) })), limit: await limitOf(d), canBuy: buyer(P), canRequest: has(P, "purchase", "request", "own") };
}
export async function requestGet(env, P, id) {
  const d = await vdb(env), r = await one(d, "SELECT r.*, " + nameOf("r.requested_by") + " AS requester, " + nameOf("r.approver_user_id") + " AS approver, (SELECT name FROM os_vendors v WHERE v.id=r.vendor_id) AS vendor, (SELECT title FROM biz_projects p WHERE p.id=r.project_id) AS project FROM os_purchase_requests r WHERE r.id=?1", clip(id, 40)); if (!r) throw err("Not found.", 404);
  if (!visiblePR(P, r)) await authorize(env, P, { resource: "purchase", action: "view", target: { kind: "user", id: r.requested_by } });
  const po = await one(d, "SELECT * FROM os_purchase_orders WHERE request_id=?1 AND status<>'cancelled'", r.id);
  return { request: Object.assign(r, { items: J(r.items, []) }), order: po ? Object.assign(po, { items: J(po.items, []) }) : null, canEdit: r.requested_by === P.user.id && r.status === "draft", canOrder: buyer(P) && r.status === "approved" && !po };
}
export async function requestSave(env, P, b) {
  await authorize(env, P, { resource: "purchase", action: "request" }); const d = await vdb(env), now = nowIso(), title = clip(b.title, 160), items = cleanItems(b.items); if (!title) throw err("What do you need to buy?"); if (!items.length) throw err("Add at least one item with a price.");
  const amount = total(items); if (amount <= 0) throw err("The total must be more than ₹0."); const needed = DAY.test(b.needed_by || "") ? b.needed_by : null; const reason = clip(b.reason, 1000); if (reason.length < 5) throw err("Say why it is needed.");
  const vid = clip(b.vendor_id, 40) || null; if (vid) { const v = await one(d, "SELECT status FROM os_vendors WHERE id=?1", vid); if (!v) throw err("Unknown vendor.", 404); if (v.status !== "active") throw err("That vendor is blocked."); }
  const pid = clip(b.project_id, 40) || null; if (pid) await authorize(env, P, { resource: "project", action: "view", target: { kind: "project", id: pid } });
  if (b.id) { const r = await one(d, "SELECT * FROM os_purchase_requests WHERE id=?1", clip(b.id, 40)); if (!r) throw err("Not found.", 404); if (r.requested_by !== P.user.id) throw err("Only the requester edits it.", 403); if (r.status !== "draft") throw err("Only a draft can be edited.", 409);
    await run(d, "UPDATE os_purchase_requests SET title=?2, vendor_id=?3, project_id=?4, items=?5, amount=?6, needed_by=?7, reason=?8, updated_at=?9 WHERE id=?1", r.id, title, vid, pid, JSON.stringify(items), amount, needed, reason, now); return { id: r.id, amount }; }
  const id = rid("pr"), number = await numberFor(d, "os_purchase_requests", "number", "PR");
  await run(d, "INSERT INTO os_purchase_requests (id, org_id, number, title, vendor_id, project_id, department_id, items, amount, needed_by, reason, status, requested_by, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'draft',?12,?13,?13)", id, ORG, number, title, vid, pid, P.dept || null, JSON.stringify(items), amount, needed, reason, P.user.id, now);
  await audit(env, P, "PURCHASE_REQUESTED", { kind: "purchase", id }, null, { number, amount }); if (b.submit) return Object.assign(await requestSubmit(env, P, id), { id, number, amount }); return { id, number, amount };
}
/* the approver: the requester's chain; above the limit, finance (or an owner) */
export async function requestSubmit(env, P, id) {
  const d = await vdb(env), r = await one(d, "SELECT * FROM os_purchase_requests WHERE id=?1", clip(id, 40)); if (!r) throw err("Not found.", 404); if (r.requested_by !== P.user.id) throw err("Only the requester submits it.", 403); if (r.status !== "draft") throw err("Already " + r.status + ".", 409);
  const lim = await limitOf(d), big = r.amount > lim; let approver = null;
  if (big) { const fin = (await holders(d, ["finance_manager"])).filter((u) => u !== P.user.id); approver = fin[0] || (await chainOf(d, P.user.id)).filter((u) => true).slice(-1)[0] || null; } else approver = (await chainOf(d, P.user.id))[0] || null;
  if (!approver) throw err("Nobody can approve this yet: set your manager, a department manager, or ask an owner.", 409);
  const AP = await import("./approvals.js"); const a = await AP.request(env, P, { kind: "purchase", object_kind: "purchase", object_id: r.id, title: "Purchase " + r.number + ": " + r.title + " (₹" + r.amount.toLocaleString("en-IN") + ")", detail: (big ? "Above the ₹" + lim.toLocaleString("en-IN") + " limit, so finance approves. " : "") + r.reason, approver_user_id: approver, department_id: r.department_id }, { system: true });
  const now = nowIso(); await run(d, "UPDATE os_purchase_requests SET status='submitted', approval_id=?2, approver_user_id=?3, submitted_at=?4, updated_at=?4 WHERE id=?1", r.id, a.id, approver, now);
  await emit(env, P, "purchase.submitted", { kind: "purchase", id: r.id }, { amount: r.amount, number: r.number, above_limit: big }); return { ok: true, approval_id: a.id, above_limit: big };
}
/* called by the approval engine before it records the decision: above the limit only finance (or an owner) approves */
export async function checkDecide(env, P, a, decision) { if (decision !== "approved") return; const d = await vdb(env), r = await one(d, "SELECT amount FROM os_purchase_requests WHERE id=?1", a.object_id); if (r && r.amount > await limitOf(d) && !finance(P)) throw err("This purchase is above the ₹" + (await limitOf(d)).toLocaleString("en-IN") + " limit; finance approves it.", 403); }
/* called by the approval engine after the approval is decided */
export async function onDecided(env, P, a, decision, note) {
  const d = await vdb(env), now = nowIso(), r = await one(d, "SELECT * FROM os_purchase_requests WHERE id=?1", a.object_id); if (!r || r.status !== "submitted") return;
  await run(d, "UPDATE os_purchase_requests SET status=?2, decision_note=?3, decided_at=?4, updated_at=?4 WHERE id=?1", r.id, decision, clip(note, 500), now); await emit(env, P, "purchase." + decision, { kind: "purchase", id: r.id }, { amount: r.amount, number: r.number });
  if (decision === "approved") for (const u of await holders(d, ["operations_manager", "finance_manager"], 4)) if (u !== P.user.id) notify(env, u, "approval", "Purchase " + r.number + " approved: raise the purchase order.", "/workspace/#procurement?id=" + r.id, { category: "approval", urgency: "action", dedupe: "pr-ok-" + r.id }).catch(() => {});
}
export async function requestCancel(env, P, id) {
  const d = await vdb(env), r = await one(d, "SELECT * FROM os_purchase_requests WHERE id=?1", clip(id, 40)); if (!r) throw err("Not found.", 404); if (r.requested_by !== P.user.id && !P.isOwner) throw err("Only the requester cancels it.", 403); if (["draft", "submitted", "approved"].indexOf(r.status) < 0) throw err("Already " + r.status + ".", 409);
  if (await one(d, "SELECT 1 x FROM os_purchase_orders WHERE request_id=?1 AND status<>'cancelled'", r.id)) throw err("A purchase order exists; cancel the order first.", 409);
  await run(d, "UPDATE os_purchase_requests SET status='cancelled', updated_at=?2 WHERE id=?1", r.id, nowIso()); if (r.approval_id) await run(d, "UPDATE os_approvals SET status='cancelled', updated_at=?2 WHERE id=?1 AND status='pending'", r.approval_id, nowIso());
  await audit(env, P, "PURCHASE_CANCELLED", { kind: "purchase", id: r.id }, { status: r.status }, { status: "cancelled" }); return { ok: true };
}

/* ---------------- purchase orders ---------------- */
export async function orders(env, P, q) {
  const d = await vdb(env); if (!buyer(P) && !has(P, "finance", "view", "department") && !has(P, "purchase", "view", "team")) throw err("Purchase orders are for buyers, managers and finance.", 403); const W = ["o.org_id='" + ORG + "'"], args = []; if (q && q.status) { args.push(clip(q.status, 20)); W.push("o.status=?" + args.length); } if (q && q.vendor) { args.push(clip(q.vendor, 40)); W.push("o.vendor_id=?" + args.length); }
  const rows = await all(d, "SELECT o.*, (SELECT name FROM os_vendors v WHERE v.id=o.vendor_id) AS vendor, (SELECT number FROM os_purchase_requests r WHERE r.id=o.request_id) AS pr, (SELECT coalesce(sum(amount),0) FROM os_payables b WHERE b.po_id=o.id AND b.status IN ('open','paid')) AS billed, (SELECT coalesce(sum(amount),0) FROM os_payables b WHERE b.po_id=o.id AND b.status='paid') AS paid FROM os_purchase_orders o WHERE " + W.join(" AND ") + " ORDER BY o.issued_at DESC LIMIT 300", ...args);
  return { items: rows.map((o) => Object.assign(o, { items: J(o.items, []), state: stateOf(o) })), canBuy: buyer(P), canBill: finance(P) };
}
const stateOf = (o) => o.status === "cancelled" ? "cancelled" : o.paid && o.paid >= o.amount ? "paid" : o.billed && o.billed >= o.amount ? "billed" : o.status;
export async function orderCreate(env, P, prId, b) {
  if (!buyer(P)) throw err("Only people who manage vendors raise purchase orders.", 403); const d = await vdb(env), r = await one(d, "SELECT * FROM os_purchase_requests WHERE id=?1", clip(prId, 40)); if (!r) throw err("Not found.", 404); if (r.status !== "approved") throw err("Only an approved request becomes an order.", 409);
  if (await one(d, "SELECT 1 x FROM os_purchase_orders WHERE request_id=?1 AND status<>'cancelled'", r.id)) throw err("This request already has an order.", 409);
  const vid = clip(b.vendor_id, 40) || r.vendor_id; if (!vid) throw err("Pick the vendor."); const v = await one(d, "SELECT * FROM os_vendors WHERE id=?1", vid); if (!v) throw err("Unknown vendor.", 404); if (v.status !== "active") throw err("That vendor is blocked: " + (v.block_reason || ""), 409);
  const items = J(r.items, []), amount = r.amount, expected = DAY.test(b.expected_on || "") ? b.expected_on : r.needed_by, id = rid("po"), number = await numberFor(d, "os_purchase_orders", "number", "PO"), now = nowIso();
  await run(d, "INSERT INTO os_purchase_orders (id, org_id, number, request_id, vendor_id, project_id, department_id, title, items, amount, status, expected_on, received_amount, issued_by, issued_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'issued',?11,0,?12,?13,?13)", id, ORG, number, r.id, vid, r.project_id, r.department_id, r.title, JSON.stringify(items), amount, expected, P.user.id, now);
  await run(d, "UPDATE os_purchase_requests SET status='ordered', vendor_id=?2, updated_at=?3 WHERE id=?1", r.id, vid, now); await audit(env, P, "PO_ISSUED", { kind: "purchase_order", id }, null, { number, vendor: v.name, amount });
  await emit(env, P, "purchase.ordered", { kind: "purchase_order", id }, { number, amount, vendor: v.name }); notify(env, r.requested_by, "system", "Purchase order " + number + " raised with " + v.name + " for " + r.title + ".", "/workspace/#procurement?tab=orders&po=" + id, { category: "system", urgency: "info" }).catch(() => {});
  return { id, number };
}
export async function orderGet(env, P, id) {
  const d = await vdb(env), o = await one(d, "SELECT o.*, (SELECT name FROM os_vendors v WHERE v.id=o.vendor_id) AS vendor, (SELECT gstin FROM os_vendors v WHERE v.id=o.vendor_id) AS vendor_gstin, (SELECT number FROM os_purchase_requests r WHERE r.id=o.request_id) AS pr, (SELECT requested_by FROM os_purchase_requests r WHERE r.id=o.request_id) AS requested_by, " + nameOf("o.issued_by") + " AS issuer FROM os_purchase_orders o WHERE o.id=?1", clip(id, 40)); if (!o) throw err("Not found.", 404);
  if (!(buyer(P) || has(P, "finance", "view", "department") || o.requested_by === P.user.id || has(P, "purchase", "view", "team"))) throw err("You don't have access to this order.", 403);
  const bills = has(P, "finance", "view", "department") || buyer(P) ? await all(d, "SELECT id, bill_no, bill_date, amount, due, status, match_status, match_note, paid_at, paid_ref FROM os_payables WHERE po_id=?1 ORDER BY created_at", o.id) : [];
  const rated = await one(d, "SELECT 1 x FROM os_vendor_ratings WHERE po_id=?1 AND by_user_id=?2", o.id, P.user.id);
  o.billed = bills.filter((x) => x.status !== "cancelled").reduce((a, x) => a + x.amount, 0); o.paid = bills.filter((x) => x.status === "paid").reduce((a, x) => a + x.amount, 0);
  return { order: Object.assign(o, { items: J(o.items, []), state: stateOf(o) }), bills, canReceive: (buyer(P) || o.requested_by === P.user.id) && ["issued", "partly_received"].indexOf(o.status) > -1, canBill: finance(P) && o.status !== "cancelled", canCancel: buyer(P) && !bills.some((x) => x.status !== "cancelled") && o.status !== "cancelled", canRate: !rated && (o.requested_by === P.user.id || buyer(P)) && ["received", "partly_received"].indexOf(o.status) > -1 };
}
export async function orderReceive(env, P, id, b) {
  const d = await vdb(env), o = await one(d, "SELECT o.*, (SELECT requested_by FROM os_purchase_requests r WHERE r.id=o.request_id) AS requested_by FROM os_purchase_orders o WHERE o.id=?1", clip(id, 40)); if (!o) throw err("Not found.", 404);
  if (!(buyer(P) || o.requested_by === P.user.id)) throw err("The requester or a buyer confirms delivery.", 403); if (["issued", "partly_received"].indexOf(o.status) < 0) throw err("This order is " + o.status + ".", 409);
  const amt = b.full ? o.amount : int(b.amount, 1, o.amount); if (!amt) throw err("How much (₹ value) was received?"); const got = Math.min(o.amount, (o.received_amount || 0) + amt), st = got >= o.amount ? "received" : "partly_received", now = nowIso();
  await run(d, "UPDATE os_purchase_orders SET received_amount=?2, status=?3, received_at=?4, received_note=?5, updated_at=?4 WHERE id=?1", o.id, got, st, now, clip(b.note, 500)); await audit(env, P, "PO_RECEIVED", { kind: "purchase_order", id: o.id }, { received: o.received_amount }, { received: got, status: st }, clip(b.note, 300));
  await emit(env, P, "purchase.received", { kind: "purchase_order", id: o.id }, { number: o.number, received: got, amount: o.amount }); return { status: st, received_amount: got };
}
export async function orderCancel(env, P, id, b) {
  if (!buyer(P)) throw err("Only people who manage vendors cancel orders.", 403); const d = await vdb(env), o = await one(d, "SELECT * FROM os_purchase_orders WHERE id=?1", clip(id, 40)); if (!o) throw err("Not found.", 404); if (o.status === "cancelled") throw err("Already cancelled.", 409);
  if (await one(d, "SELECT 1 x FROM os_payables WHERE po_id=?1 AND status<>'cancelled'", o.id)) throw err("A vendor bill is recorded on this order; cancel the bill first.", 409); const why = clip(b.reason, 300); if (why.length < 5) throw err("Say why the order is cancelled.");
  await run(d, "UPDATE os_purchase_orders SET status='cancelled', cancel_reason=?2, updated_at=?3 WHERE id=?1", o.id, why, nowIso()); await run(d, "UPDATE os_purchase_requests SET status='approved', updated_at=?2 WHERE id=?1 AND status='ordered'", o.request_id, nowIso());
  await audit(env, P, "PO_CANCELLED", { kind: "purchase_order", id: o.id }, { status: o.status }, { status: "cancelled" }, why); return { ok: true };
}
/* printable order to send the vendor (HTML; the browser prints or saves it as PDF) */
export async function orderPrint(env, P, id) {
  const j = await orderGet(env, P, id), o = j.order, e = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]), inr = (n) => "₹" + (n || 0).toLocaleString("en-IN");
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + e(o.number) + '</title><meta name="robots" content="noindex"><style>body{font:14px/1.5 system-ui,sans-serif;color:#111;max-width:760px;margin:32px auto;padding:0 16px}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left}th:last-child,td:last-child{text-align:right}h1{margin:0}small{color:#555}</style></head><body><h1>Purchase order ' + e(o.number) + '</h1><p><small>FODO · issued ' + e(String(o.issued_at || "").slice(0, 10)) + (o.expected_on ? " · needed by " + e(o.expected_on) : "") + '</small></p><p><b>To:</b> ' + e(o.vendor) + (o.vendor_gstin ? " · GSTIN " + e(o.vendor_gstin) : "") + "</p><p><b>For:</b> " + e(o.title) + "</p><table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>" + o.items.map((x) => "<tr><td>" + e(x.name) + "</td><td>" + x.qty + "</td><td>" + inr(x.unit_price) + "</td><td>" + inr(x.qty * x.unit_price) + "</td></tr>").join("") + '</tbody><tfoot><tr><th colspan="3">Total</th><th>' + inr(o.amount) + "</th></tr></tfoot></table><p><small>Please quote " + e(o.number) + " on your invoice. Amounts in whole rupees; taxes as per your tax invoice.</small></p></body></html>";
  await audit(env, P, "PO_PRINTED", { kind: "purchase_order", id: o.id }, null, null); return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

/* ---------------- vendor bills: three-way match ---------------- */
export function matchOf(po, billedBefore, amount) {
  if (!po) return { status: "no_po", note: "No purchase order." }; const billed = billedBefore + amount;
  if (billed > po.amount) return { status: "over_po", note: "Billed ₹" + billed + " is more than the order (₹" + po.amount + ")." };
  if (billed > (po.received_amount || 0)) return { status: "not_received", note: "Billed ₹" + billed + " but only ₹" + (po.received_amount || 0) + " was received." };
  return { status: "matched", note: "" };
}
export async function billCreate(env, P, b) {
  if (!finance(P)) throw err("Finance records vendor bills.", 403); const d = await vdb(env), now = nowIso(), amount = int(b.amount, 1, 1e10), billNo = clip(b.bill_no, 40), billDate = DAY.test(b.bill_date || "") ? b.bill_date : today(); if (!amount) throw err("Bill amount (whole rupees) is required."); if (!billNo) throw err("The vendor's bill number is required."); if (billDate > today()) throw err("The bill date is in the future.");
  const po = b.po_id ? await one(d, "SELECT * FROM os_purchase_orders WHERE id=?1", clip(b.po_id, 40)) : null; if (b.po_id && !po) throw err("Unknown purchase order.", 404); if (po && po.status === "cancelled") throw err("That order is cancelled.", 409);
  const vid = po ? po.vendor_id : clip(b.vendor_id, 40); if (!vid) throw err("Pick the vendor or the purchase order."); const v = await one(d, "SELECT * FROM os_vendors WHERE id=?1", vid); if (!v) throw err("Unknown vendor.", 404);
  if (await one(d, "SELECT 1 x FROM os_payables WHERE vendor_id=?1 AND lower(bill_no)=lower(?2) AND status<>'cancelled'", vid, billNo)) throw err("Bill " + billNo + " from " + v.name + " is already recorded.", 409);
  const before = po ? (((await one(d, "SELECT coalesce(sum(amount),0) n FROM os_payables WHERE po_id=?1 AND status<>'cancelled'", po.id)) || {}).n || 0) : 0, m = matchOf(po, before, amount), why = clip(b.match_note, 500);
  if (m.status !== "matched" && why.length < 5) throw Object.assign(err(m.note + " Write why it should still be recorded.", 409), { match: m });
  const id = rid("vb"), due = DAY.test(b.due || "") ? b.due : addDays(billDate, v.terms_days == null ? 30 : v.terms_days);
  await run(d, "INSERT INTO os_payables (id, org_id, vendor, title, amount, due, status, category, project_id, ref, created_by, created_at, updated_at, vendor_id, po_id, bill_no, bill_date, match_status, match_note) VALUES (?1,?2,?3,?4,?5,?6,'open',?7,?8,?9,?10,?11,?11,?12,?13,?14,?15,?16,?17)", id, ORG, v.name, clip(b.title, 160) || (po ? po.title : "Vendor bill " + billNo), amount, due, FIN_CAT[v.category] || "other", po ? po.project_id : clip(b.project_id, 40) || null, billNo, P.user.id, now, vid, po ? po.id : null, billNo, billDate, m.status, m.status === "matched" ? null : why);
  await audit(env, P, "VENDOR_BILL_RECORDED", { kind: "payable", id }, null, { vendor: v.name, bill_no: billNo, amount, match: m.status }, m.status === "matched" ? null : why); await emit(env, P, "vendor_bill.recorded", { kind: "payable", id }, { amount, vendor: v.name, match: m.status });
  return { id, due, match: m.status };
}
export async function rate(env, P, poId, b) {
  const d = await vdb(env), o = await one(d, "SELECT o.*, (SELECT requested_by FROM os_purchase_requests r WHERE r.id=o.request_id) AS requested_by FROM os_purchase_orders o WHERE o.id=?1", clip(poId, 40)); if (!o) throw err("Not found.", 404);
  if (!(o.requested_by === P.user.id || buyer(P))) throw err("The requester or a buyer rates the vendor.", 403); if (["received", "partly_received"].indexOf(o.status) < 0) throw err("Rate after something was received.", 409);
  const q = int(b.quality, 1, 5), t = int(b.timeliness, 1, 5), c = int(b.communication, 1, 5); if (!q || !t || !c) throw err("Rate quality, timeliness and communication from 1 to 5.");
  if (await one(d, "SELECT 1 x FROM os_vendor_ratings WHERE po_id=?1 AND by_user_id=?2", o.id, P.user.id)) throw err("You already rated this order.", 409);
  await run(d, "INSERT INTO os_vendor_ratings (id, vendor_id, po_id, by_user_id, quality, timeliness, communication, note, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)", rid("vr"), o.vendor_id, o.id, P.user.id, q, t, c, clip(b.note, 500), nowIso());
  const s = await one(d, "SELECT avg((quality+timeliness+communication)/3.0) a, count(*) n FROM os_vendor_ratings WHERE vendor_id=?1", o.vendor_id); await run(d, "UPDATE os_vendors SET rating_avg=?2, rating_n=?3 WHERE id=?1", o.vendor_id, Math.round(s.a * 10) / 10, s.n); return { ok: true, rating: Math.round(s.a * 10) / 10 };
}
export async function overview(env, P) {
  const d = await vdb(env), n = async (sql, ...a) => (((await one(d, sql, ...a)) || {}).n || 0);
  return { pending_approval: await n("SELECT count(*) n FROM os_purchase_requests WHERE status='submitted'"), awaiting_order: await n("SELECT count(*) n FROM os_purchase_requests WHERE status='approved'"), open_orders: await n("SELECT count(*) n FROM os_purchase_orders WHERE status IN ('issued','partly_received')"), open_order_value: await n("SELECT coalesce(sum(amount-coalesce(received_amount,0)),0) n FROM os_purchase_orders WHERE status IN ('issued','partly_received')"), unmatched_bills: await n("SELECT count(*) n FROM os_payables WHERE status='open' AND match_status IS NOT NULL AND match_status<>'matched'"), vendors: await n("SELECT count(*) n FROM os_vendors WHERE status='active' AND org_id=?1", ORG), limit: await limitOf(d) };
}
export async function setLimit(env, P, b) { if (!finance(P)) throw err("Finance sets the purchase limit.", 403); const v = int(b.limit, 0, 1e9); if (v == null) throw err("Give the limit in whole rupees."); const d = await vdb(env), before = await limitOf(d); await settingSet(d, "proc_limit", v); await audit(env, P, "PURCHASE_LIMIT_SET", { kind: "setting", id: "proc_limit" }, { limit: before }, { limit: v }); return { limit: v }; }
