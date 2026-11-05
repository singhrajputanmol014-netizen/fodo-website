// v50.7 FODO OS V4 Phase 7: vendors + procurement, integrations, subscriptions, knowledge base / SOPs, document centre,
// unified inbox, risk register + incidents + continuity, DPDP workflows, template upgrades for existing roles.
// Run: node --no-warnings tests/v507.test.mjs
import { DatabaseSync } from "node:sqlite";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as bizApi } from "../functions/api/biz/[[path]].js";
import fs from "node:fs";
import { onRequest as osApi, ROUTES } from "../functions/api/os/[[path]].js";
import { REGISTRY, SCOPES, TEMPLATES, validPerm, LEGACY, MODULES } from "../functions/_lib/os/permissions.js";
import { osdb, ORG } from "../functions/_lib/os/db.js";
import { principal, allows, authorize, has, relationOf, cleanFor } from "../functions/_lib/os/authz.js";
import { emit, on, events } from "../functions/_lib/os/audit.js";
import { HANDLERS, enqueue, runDue } from "../functions/_lib/jobs.js";
import * as TK from "../functions/_lib/os/tasks.js";
import * as WF from "../functions/_lib/os/workflows.js";
import * as PB from "../functions/_lib/os/problems.js";
import * as AI from "../functions/_lib/os/ai.js";
import * as BT from "../functions/_lib/brain/tools.js";
import * as RP from "../functions/_lib/replay.js";
import * as PS from "../functions/_lib/os/pros.js";
import * as PC from "../functions/_lib/os/procure.js";
import * as PL from "../functions/_lib/os/platform.js";
import * as KB from "../functions/_lib/os/kb.js";
import * as DO from "../functions/_lib/os/docs.js";
import * as CP from "../functions/_lib/os/comply.js";
import { syncTemplates } from "../functions/_lib/os/db.js";
import * as PJ from "../functions/_lib/os/projects.js";
import { notify, rolesOf, navFor, bdb } from "../functions/_lib/biz.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
console.log = ((orig) => (...a) => { if (typeof a[0] === "string" && a[0].charAt(0) === "{" && !process.env.DBG) return; orig(...a); })(console.log);
console.error = process.env.DBG ? console.log.bind(console) : () => {};
function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, a = []) => ({ bind: (...x) => st(sql, x.map((v) => v === undefined ? null : v)), run: async () => { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }), _x: () => db.prepare(sql).run(...a) });
  return { db, prepare: (s) => st(s), batch: async (l) => l.map((s) => (s._x(), { success: true })) };
}
const SITE = "https://www.fodo.co.in", jars = {}, H = { account, biz: bizApi, os: osApi };
const call = async (path, body, o = {}) => {
  const who = o.as || "a", h = Object.keys(H).filter((k) => path.indexOf(k + "/") === 0)[0] || "account", p = h === "account" ? path : path.slice(h.length + 1);
  const method = o.method || (body !== undefined ? "POST" : "GET");
  const req = new Request(SITE + "/api/" + h + "/" + p, { method, headers: Object.assign({ origin: SITE, "cf-connecting-ip": "9.9.9.9" }, body !== undefined ? { "content-type": "application/json" } : {}, jars[who] ? { cookie: jars[who] } : {}, o.headers || {}), body: body === undefined ? undefined : JSON.stringify(body) });
  const r = await H[h]({ request: req, env, params: { path: p.split("?")[0].split("/") } }); const sc = r.headers.get("set-cookie"); if (sc && h === "account") jars[who] = sc.split(";")[0];
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, j, t };
};
const login = (email, plan, who) => call("test-login", Object.assign({ email }, plan ? { plan } : {}), { as: who });
const mails = []; globalThis.fetch = async (u, o = {}) => { if (/resend/.test(String(u))) { mails.push(JSON.parse(o.body)); return new Response("{}", { status: 200 }); } return new Response("x", { status: 599 }); };
const KV = new Map(), CHAT_KV = { get: async (k) => KV.get(k) || null, put: async (k, v) => { KV.set(k, v); }, getWithMetadata: async (k) => ({ value: KV.get(k) || null, metadata: null }), delete: async (k) => KV.delete(k), list: async () => ({ keys: [] }) };
const env = { XRAY_DB: d1(), CHAT_KV, ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", API_DEBUG: process.env.DBG ? "1" : "", MAIL_FROM: "FODO <hello@fodo.co.in>", RESEND_API_KEY: "re_test" };
const O = (p, body, who, o) => call("os/" + p, body, Object.assign({ as: who || "own" }, o || {}));
const Z = (p, body, who, o) => call("biz/" + p, body, Object.assign({ as: who || "c" }, o || {}));
const q1 = (sql, ...a) => env.XRAY_DB.db.prepare(sql).get(...a), qa = (sql, ...a) => env.XRAY_DB.db.prepare(sql).all(...a), qr = (sql, ...a) => env.XRAY_DB.db.prepare(sql).run(...a);
const uid = (email) => (q1("SELECT id FROM acct_users WHERE email=?", email) || {}).id;

/* ---------- 1. registry ---------- */
const U = (e) => q1("SELECT * FROM acct_users WHERE email=?", e), Pof = async (e) => principal(env, U(e), { R: await rolesOf(env, U(e)) });
const mem = (e) => q1("SELECT * FROM os_members WHERE email=?", e);
/* ---------- people set-up ---------- */
await login("anmol@fodo.co.in", null, "own"); await login("client@biz.in", null, "c"); await login("other@biz.in", null, "o"); await bdb(env); await osdb(env);
const dept = (slug) => q1("SELECT id FROM os_departments WHERE slug=?", slug).id;
await O("people", { email: "pm@fodo.co.in", name: "Priya PM", roles: ["project_manager"], department_id: dept("operations") }); await login("pm@fodo.co.in", null, "pm"); await O("me", undefined, "pm");
await O("people", { email: "dev@fodo.co.in", name: "Dev Designer", roles: ["designer"], department_id: dept("design"), manager_user_id: uid("pm@fodo.co.in") }); await login("dev@fodo.co.in", null, "dev"); await O("me", undefined, "dev");
await O("people", { email: "fin@fodo.co.in", name: "Fiona Finance", roles: ["finance_manager"], department_id: dept("finance") }); await login("fin@fodo.co.in", null, "fin"); await O("me", undefined, "fin");
await O("people", { email: "hr@fodo.co.in", name: "Hema HR", roles: ["hr_talent_manager"], department_id: dept("hr") }); await login("hr@fodo.co.in", null, "hr"); await O("me", undefined, "hr");
await O("people", { email: "ops@fodo.co.in", name: "Om Ops", roles: ["operations_manager"], department_id: dept("operations") }); await login("ops@fodo.co.in", null, "ops"); await O("me", undefined, "ops");
await O("departments/" + dept("operations"), { manager_user_id: uid("ops@fodo.co.in") });
const today = new Date().toISOString().slice(0, 10), plus = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
let r;
await O("people", { email: "smm@fodo.co.in", name: "Sana Social", roles: ["social_media_manager"], department_id: dept("marketing") }); await login("smm@fodo.co.in", null, "smm"); await O("me", undefined, "smm");
await O("people", { email: "perf@fodo.co.in", name: "Parth Perf", roles: ["performance_marketer"], department_id: dept("marketing") }); await login("perf@fodo.co.in", null, "perf"); await O("me", undefined, "perf");
await O("people", { email: "cd@fodo.co.in", name: "Cira Creative", roles: ["creative_director"], department_id: dept("creative") }); await login("cd@fodo.co.in", null, "cd"); await O("me", undefined, "cd");
const back = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const tasksCount = () => q1("SELECT count(*) n FROM biz_tasks").n;
const userRow = (e) => q1("SELECT id, email, name FROM acct_users WHERE email=?", e);
const notes = (e, re) => qa("SELECT text FROM biz_notes WHERE user_id=?", uid(e)).filter((n) => re.test(n.text)).length;
const tpl = (slug) => TEMPLATES.find((t) => t.slug === slug).perms;
const NEW = ["vendor", "purchase", "integration", "subscription", "knowledge", "document", "inbox", "risk", "incident", "privacy"];

/* ---------- 1. registry, templates, template upgrades ---------- */
ok(NEW.every((r) => REGISTRY[r]) && REGISTRY.integration.manage.join() === "all" && REGISTRY.privacy.view.indexOf("team") < 0 && REGISTRY.risk.manage.indexOf("team") < 0, "registry: 10 Phase 7 resources (integration manage owner only, privacy organization+, risk manage department+)");
ok(TEMPLATES.every((t) => t.perms.every(validPerm)), "every template permission is valid");
ok(tpl("designer").indexOf("knowledge.view.organization") > -1 && tpl("designer").indexOf("purchase.request.own") > -1 && tpl("designer").indexOf("incident.report.own") > -1 && !tpl("designer").some((p) => /^(vendor|integration|privacy|subscription|inbox)\./.test(p)), "designer: read knowledge, raise purchases, report incidents; no vendors, integrations, privacy, subscriptions, inbox");
ok(!tpl("client").some((p) => NEW.indexOf(p.split(".")[0]) > -1) && !tpl("fodo_pro").some((p) => NEW.indexOf(p.split(".")[0]) > -1), "clients and FODO Pros get none of the Phase 7 permissions");
ok(tpl("operations_manager").indexOf("vendor.manage.organization") > -1 && tpl("finance_manager").indexOf("subscription.manage.organization") > -1 && tpl("hr_talent_manager").indexOf("knowledge.publish.organization") > -1 && tpl("project_manager").indexOf("purchase.approve.team") > -1, "ops manage vendors, finance subscriptions, HR publishes knowledge, PMs approve team purchases");
{ const d = env.XRAY_DB, rl = q1("SELECT id FROM os_roles WHERE slug='designer'").id;
  qr("DELETE FROM os_template_sync WHERE role_id=?", rl); qr("DELETE FROM os_role_perms WHERE role_id=? AND perm IN ('knowledge.view.organization','task.view.own')", rl);
  let s = await syncTemplates(env.XRAY_DB); ok(q1("SELECT 1 x FROM os_role_perms WHERE role_id=? AND perm='knowledge.view.organization'", rl) && !q1("SELECT 1 x FROM os_role_perms WHERE role_id=? AND perm='task.view.own'", rl), "template upgrade (first run): a later-phase permission reaches the existing role; a removed Phase 1 permission is not put back");
  qr("DELETE FROM os_role_perms WHERE role_id=? AND perm='knowledge.view.organization'", rl); s = await syncTemplates(env.XRAY_DB); ok(!q1("SELECT 1 x FROM os_role_perms WHERE role_id=? AND perm='knowledge.view.organization'", rl) && s.added === 0, "template upgrade: a permission the owner removed after it was handed out stays removed");
  qr("INSERT OR IGNORE INTO os_role_perms (role_id, perm) VALUES (?, 'knowledge.view.organization'), (?, 'task.view.own')", rl, rl); }

/* ---------- 2. navigation ---------- */
r = await Z("me", undefined, "dev"); { const ids = r.j.nav.map((n) => n.id); ok(["knowledge", "documents", "procurement", "risks"].every((x) => ids.indexOf(x) > -1) && !["integrations", "privacy-desk", "subscriptions", "inbox"].some((x) => ids.indexOf(x) > -1), "designer nav: Knowledge, Documents, Vendors & purchases, Risks & incidents; not Integrations, Privacy, Subscriptions, Inbox"); }
r = await Z("me", undefined, "own"); { const ids = r.j.nav.map((n) => n.id); ok(["knowledge", "documents", "procurement", "risks", "integrations", "privacy-desk", "subscriptions", "inbox"].every((x) => ids.indexOf(x) > -1) && r.j.os.groups.length === 6, "owner nav: all eight Phase 7 entries, still six groups"); ok(r.j.os.groups.find((g) => g.id === "finance").items.some((n) => n.id === "procurement") && r.j.os.groups.find((g) => g.id === "platform").items.some((n) => n.id === "privacy-desk") && r.j.os.groups.find((g) => g.id === "command").items.some((n) => n.id === "risks"), "groups: purchases under Finance, privacy under Platform, risks under Command"); }
r = await Z("me", undefined, "c"); ok(!r.j.nav.some((n) => ["knowledge", "documents", "procurement", "risks", "inbox", "privacy-desk"].indexOf(n.id) > -1), "client sidebar unchanged (no Phase 7 entries)");
r = await Z("me", undefined, "fin"); ok(["subscriptions", "procurement"].every((x) => r.j.nav.some((n) => n.id === x)), "finance sees Subscriptions and Vendors & purchases");
ok(MODULES.some((m) => m[0] === "procurement") && MODULES.some((m) => m[0] === "privacy"), "modules: Phase 7 modules can be switched off");

/* ---------- 3. vendors ---------- */
r = await O("vendors", { name: "Lens House", gstin: "07ABCDE1234" }, "ops"); ok(r.status === 400 && /GSTIN/.test(r.j.reason), "vendor: a bad GSTIN is refused");
r = await O("vendors", { name: "Lens House", notes: "pay to a/c 123456789012345" }, "ops"); ok(r.status === 400 && /bank/.test(r.j.reason), "vendor: bank / card numbers are refused in notes");
r = await O("vendors", { name: "Lens House", category: "equipment_rental", gstin: "07ABCDE1234F1Z5", email: "hi@lens.in", phone: "+91 98100 00000", terms_days: 15 }, "ops"); const V1 = r.j.id; ok(r.status === 200 && V1, "vendor: operations adds a vendor");
r = await O("vendors", { name: "lens house" }, "ops"); ok(r.status === 409, "vendor: duplicate name refused");
r = await O("vendors", { name: "Other" }, "dev"); ok(r.status === 403, "vendor: a designer cannot add vendors");
r = await O("vendors", undefined, "dev"); ok(r.status === 403, "vendor list: designers have no vendor view");
r = await O("vendors", { id: V1, name: "Lens House", status: "blocked" }, "ops"); ok(r.status === 400, "vendor: blocking needs a reason");

/* ---------- 4. purchase requests → approval → order → receive → bill → rate ---------- */
r = await O("purchases", { title: "Lens rental for Diwali shoot", items: [{ name: "50mm lens", qty: 2, unit_price: 3000 }], reason: "Client shoot on Friday", vendor_id: V1 }, "dev"); const PR1 = r.j.id; ok(r.status === 200 && r.j.amount === 6000 && /^PR-\d{4}-\d{4}$/.test(r.j.number), "purchase request: draft with items, total computed, PR number");
r = await O("purchases", { title: "x", items: [], reason: "because" }, "dev"); ok(r.status === 400, "purchase request: needs at least one priced item");
r = await O("purchases/" + PR1 + "/submit", {}, "dev"); const PA1 = r.j.approval_id; ok(r.status === 200 && q1("SELECT approver_user_id a FROM os_approvals WHERE id=?", PA1).a === uid("pm@fodo.co.in") && q1("SELECT kind FROM os_approvals WHERE id=?", PA1).kind === "purchase", "submit: approval (kind purchase) goes to the requester's manager");
r = await O("purchases/" + PR1 + "/order", {}, "ops"); ok(r.status === 409, "order: not before the request is approved");
r = await O("approvals/" + PA1 + "/decide", { decision: "approve" }, "pm"); ok(r.status === 200 && q1("SELECT status FROM os_purchase_requests WHERE id=?", PR1).status === "approved" && notes("ops@fodo.co.in", /raise the purchase order/) > 0, "approval engine → request approved; buyers told to raise the order");
r = await O("purchases/" + PR1 + "/order", {}, "dev"); ok(r.status === 403, "order: a designer cannot raise a purchase order");
r = await O("purchases/" + PR1 + "/order", { expected_on: plus(3) }, "ops"); const PO1 = r.j.id; ok(r.status === 200 && /^PO-\d{4}-\d{4}$/.test(r.j.number) && q1("SELECT status FROM os_purchase_requests WHERE id=?", PR1).status === "ordered", "order: PO number, request marked ordered");
r = await O("purchases/" + PR1 + "/order", {}, "ops"); ok(r.status === 409, "order: one order per request");
r = await O("purchase-orders/" + PO1, undefined, "dev"); ok(r.status === 200 && r.j.canReceive && !r.j.canBill, "the requester sees the order and can confirm delivery, not bill it");
r = await O("purchase-orders", undefined, "dev"); ok(r.status === 403, "order list is for buyers, managers and finance");
r = await O("purchase-orders/" + PO1 + "/print", undefined, "dev"); ok(r.status === 200 && r.t.indexOf(q1("SELECT number FROM os_purchase_orders WHERE id=?", PO1).number) > -1 && /50mm lens/.test(r.t) && /07ABCDE1234F1Z5/.test(r.t), "printable PO with number, items and vendor GSTIN");
r = await O("purchase-orders/" + PO1 + "/receive", { amount: 3000, note: "1 lens came" }, "dev"); ok(r.status === 200 && r.j.status === "partly_received", "receive: partial delivery");
r = await O("vendor-bills", { po_id: PO1, bill_no: "LH/77", amount: 6000, bill_date: today }, "fin"); ok(r.status === 409 && /only ₹3000 was received/.test(r.j.reason), "three-way match: billing more than received needs an explanation");
r = await O("vendor-bills", { po_id: PO1, bill_no: "LH/77", amount: 6000, bill_date: today, match_note: "Second lens arrives tomorrow, bill covers both" }, "fin"); const VB1 = r.j.id; ok(r.status === 200 && r.j.match === "not_received" && r.j.due === new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10), "vendor bill: recorded with the reason; due date from the vendor's 15-day terms");
r = await O("vendor-bills", { po_id: PO1, bill_no: "lh/77", amount: 10, bill_date: today, match_note: "again" }, "fin"); ok(r.status === 409 && /already recorded/.test(r.j.reason), "vendor bill: the same bill number twice is refused");
r = await O("vendor-bills", { po_id: PO1, bill_no: "LH/78", amount: 500, bill_date: today }, "fin"); ok(r.status === 409 && /more than the order/.test(r.j.reason), "three-way match: billing over the order needs an explanation");
r = await O("vendor-bills", { po_id: PO1, bill_no: "LH/79", amount: 500 }, "ops"); ok(r.status === 403, "only finance records vendor bills");
r = await O("os-finance/payables", undefined, "fin"); if (r.status === 404) r = await O("finance/payables", undefined, "fin"); ok(r.status === 200 && JSON.stringify(r.j).indexOf(VB1) > -1, "the vendor bill shows in finance payables");
r = await O("purchase-orders/" + PO1 + "/receive", { full: true }, "dev"); ok(r.j.status === "received", "receive: the rest arrived");
r = await O("purchase-orders/" + PO1 + "/rate", { quality: 5, timeliness: 4, communication: 5, note: "good" }, "dev"); ok(r.status === 200 && q1("SELECT rating_avg a, rating_n n FROM os_vendors WHERE id=?", V1).n === 1, "rating: the requester rates the vendor");
r = await O("purchase-orders/" + PO1 + "/rate", { quality: 1, timeliness: 1, communication: 1 }, "dev"); ok(r.status === 409, "rating: once per order per person");
r = await O("purchase-orders/" + PO1 + "/cancel", { reason: "no longer needed" }, "ops"); ok(r.status === 409, "an order with a bill cannot be cancelled");
r = await O("vendors/" + V1, undefined, "fin"); ok(r.status === 200 && r.j.orders.length === 1 && r.j.bills.length === 1 && r.j.ratings.length === 1, "vendor page: orders, bills (finance) and ratings");
r = await O("vendors/" + V1, undefined, "ops"); ok(r.status === 200 && r.j.bills === null, "vendor page: bills hidden from people without finance view");
/* above the limit: finance approves */
r = await O("procurement/limit", { limit: 5000 }, "fin"); ok(r.status === 200 && r.j.limit === 5000, "finance sets the purchase limit");
r = await O("purchases", { title: "Drone rental", items: [{ name: "Drone day", qty: 1, unit_price: 8000 }], reason: "Aerial shots", submit: true }, "dev"); const PR2 = r.j.id; ok(r.status === 200 && r.j.above_limit && q1("SELECT approver_user_id a FROM os_purchase_requests WHERE id=?", PR2).a === uid("fin@fodo.co.in"), "above the limit the approval goes to finance");
r = await O("purchases", { title: "Batteries", items: [{ name: "AA pack", qty: 4, unit_price: 1000 }], reason: "For the wireless mics", submit: true }, "dev"); const PR3 = r.j.id; ok(q1("SELECT approver_user_id a FROM os_purchase_requests WHERE id=?", PR3).a === uid("pm@fodo.co.in"), "under the limit: the manager approves");
await O("procurement/limit", { limit: 1000 }, "fin"); r = await O("approvals/" + q1("SELECT approval_id a FROM os_purchase_requests WHERE id=?", PR3).a + "/decide", { decision: "approve" }, "pm"); ok(r.status === 403 && /finance approves/.test(r.j.reason) && q1("SELECT status FROM os_approvals WHERE id=?", q1("SELECT approval_id a FROM os_purchase_requests WHERE id=?", PR3).a).status === "pending", "limit lowered later: a non-finance approver is stopped before anything is recorded");
r = await O("approvals/" + q1("SELECT approval_id a FROM os_purchase_requests WHERE id=?", PR2).a + "/decide", { decision: "reject", note: "Use the stock drone" }, "fin"); ok(r.status === 200 && q1("SELECT status FROM os_purchase_requests WHERE id=?", PR2).status === "rejected", "rejection flows back to the request");
r = await O("purchases/" + PR3 + "/cancel", {}, "pm"); ok(r.status === 403, "only the requester cancels a request");
r = await O("purchases/" + PR3 + "/cancel", {}, "dev"); ok(r.status === 200 && q1("SELECT status FROM os_approvals WHERE id=(SELECT approval_id FROM os_purchase_requests WHERE id=?)", PR3).status === "cancelled", "cancelling a request cancels its pending approval");
r = await O("purchases?box=mine", undefined, "dev"); ok(r.j.items.length === 3 && r.j.items.every((x) => x.requester), "my purchase requests");
r = await O("purchases", undefined, "pm"); ok(r.j.items.some((x) => x.id === PR1), "a manager sees the team's requests");
r = await O("procurement", undefined, "ops"); ok(r.status === 200 && r.j.unmatched_bills === 1 && r.j.vendors === 1, "procurement overview: unmatched bills, vendors");
await O("procurement/limit", { limit: 50000 }, "fin");

/* ---------- 5. subscriptions ---------- */
r = await O("subscriptions", { name: "Canva Pro", vendor: "Canva", category: "design", cost: 12000, cycle: "yearly", renews_on: plus(5), seats: 5, seats_used: 3, paid_via: "4111 1111 1111 1111" }, "fin"); ok(r.status === 400 && /card or account/.test(r.j.reason), "subscription: card numbers refused");
r = await O("subscriptions", { name: "Canva Pro", vendor: "Canva", category: "design", cost: 12000, cycle: "yearly", renews_on: plus(5), seats: 5, seats_used: 3, paid_via: "Company HDFC card" }, "fin"); const SB1 = r.j.id; ok(r.status === 200, "subscription: added");
r = await O("subscriptions", { name: "Frame.io", cost: 1500, cycle: "monthly", renews_on: back(2), auto_renew: true }, "fin"); const SB2 = r.j.id;
r = await O("subscriptions", { name: "Old tool", cost: 900, cycle: "monthly", renews_on: back(3), auto_renew: "0" }, "fin"); const SB3 = r.j.id;
r = await O("subscriptions", undefined, "fin"); { const c = r.j.items.find((x) => x.id === SB1); ok(c.monthly === 1000 && c.idle_seats === 2 && r.j.totals.monthly === 1000 + 1500 + 900 && r.j.totals.renewing_30d === 12000, "subscriptions: monthly equivalent, idle seats, totals, renewing in 30 days"); }
r = await O("subscriptions", undefined, "dev"); ok(r.status === 403, "designers don't see subscriptions");
{ const out = await PL.daily(env); ok(out.reminded >= 1 && notes("fin@fodo.co.in", /Canva Pro renews on/) === 1 && q1("SELECT renews_on FROM os_subscriptions WHERE id=?", SB2).renews_on >= today && q1("SELECT status FROM os_subscriptions WHERE id=?", SB3).status === "lapsed", "daily: renewal reminder; auto-renew rolls forward; manual renewal past due lapses"); await PL.daily(env); ok(notes("fin@fodo.co.in", /Canva Pro renews on/) === 1, "daily: reminder sent once"); }
r = await O("subscriptions/" + SB1 + "/bill", {}, "fin"); ok(r.status === 200 && q1("SELECT amount FROM os_payables WHERE id=?", r.j.payable_id).amount === 12000, "subscription renewal → payable");
r = await O("subscriptions/" + SB1 + "/bill", {}, "fin"); ok(r.status === 409, "the same renewal is not billed twice");
r = await O("subscriptions/" + SB1 + "/cancel", { reason: "Moving to Figma" }, "fin"); ok(r.status === 200 && /Cancel it with Canva too/.test(r.j.note), "cancel: honest note to cancel with the provider");

/* ---------- 6. integrations ---------- */
r = await O("integrations", undefined, "own"); { const by = (id) => r.j.items.find((x) => x.id === id); ok(by("mail").status === "configured" && by("whatsapp").status === "not configured" && by("esign").status === "not configured" && by("payments").status === "not configured", "integrations: built-ins read from real configuration"); ok(!JSON.stringify(r.j).match(/re_test/), "integrations: secret names only, never values"); }
r = await O("integrations", undefined, "dev"); ok(r.status === 403, "designers don't see integrations");
r = await O("integrations", { name: "Meta Business", purpose: "Ads reporting" }, "ops"); ok(r.status === 403, "only an owner registers integrations");
r = await O("integrations", { name: "Meta Business", purpose: "Ads reporting" }, "own"); ok(r.status === 400 && /DPDP/.test(r.j.reason), "registering needs what data is shared");
r = await O("integrations", { name: "Meta Business", purpose: "Ads reporting", data_shared: "Ad account stats", notes: "token sk_live_abc" }, "own"); ok(r.status === 400 && /Secrets/.test(r.j.reason), "keys pasted in notes are refused");
r = await O("integrations", { name: "Meta Business", provider: "Meta", purpose: "Ads reporting", data_shared: "Ad account stats", token_expires: plus(5) }, "own"); const IG1 = r.j.id; ok(r.status === 200, "integration registered");
r = await O("integrations", undefined, "ops"); ok(r.j.items.find((x) => x.id === IG1).expiring === true, "token expiring within 14 days is flagged");
await PL.daily(env); ok(notes("anmol@fodo.co.in", /Meta Business access expires/) === 1, "daily: token expiry warning");
r = await O("integrations/" + IG1 + "/revoke", {}, "own"); ok(r.status === 400, "revoke needs a reason");
r = await O("integrations/" + IG1 + "/revoke", { reason: "Agency changed" }, "own"); ok(r.status === 200 && r.j.revoked_at_provider === false && /revoke the access at Meta/.test(r.j.note), "revoke: recorded, with an honest reminder to revoke at the provider");
r = await O("integrations/google/revoke", { reason: "testing the revoke", account: "x@gmail.com" }, "own"); ok(r.status === 404, "revoking a Google account that is not connected says so");

/* ---------- 7. knowledge base ---------- */
const SOP = "1. Copy the raw footage to the shared drive the same day.\n2. Name folders client_project_date.\n3. Send the client the review link from the Workspace.";
r = await O("kb", { title: "Delivering raw footage", kind: "sop", body: SOP, tags: "footage, delivery" }, "dev"); const KB1 = r.j.id; ok(r.status === 200 && r.j.status === "draft", "knowledge: a designer drafts an SOP");
r = await O("kb/" + KB1 + "/status", { status: "published" }, "dev"); ok(r.status === 403, "a designer cannot publish");
r = await O("kb", undefined, "smm"); ok(!r.j.items.some((a) => a.id === KB1), "drafts are not visible to the rest of the team");
r = await O("kb/" + KB1 + "/status", { status: "in_review" }, "dev"); ok(r.status === 200 && notes("ops@fodo.co.in", /Article to review/) + notes("hr@fodo.co.in", /Article to review/) >= 1, "sent for review: publishers are told");
r = await O("kb/" + KB1 + "/status", { status: "published" }, "ops"); ok(r.status === 200 && r.j.review_on === new Date(Date.now() + 180 * 864e5).toISOString().slice(0, 10), "operations publishes; next review in 180 days");
r = await O("kb", undefined, "smm"); ok(r.j.items.some((a) => a.id === KB1), "published: everyone on the team reads it");
r = await O("kb", { id: KB1, title: "Delivering raw footage", kind: "sop", body: SOP + "\n4. Keep the drive copy for 30 days." }, "dev"); ok(r.j.version === 2 && r.j.status === "in_review", "a non-publisher's edit makes version 2 and sends it for review");
r = await O("kb", { id: KB1, title: "Delivering raw footage", kind: "sop", body: SOP + "\n4. Keep the drive copy for 60 days." }, "ops"); ok(r.j.version === 3 && r.j.status === "in_review", "edits keep the version history");
await O("kb/" + KB1 + "/status", { status: "published" }, "ops");
r = await O("kb/" + KB1 + "?v=1", undefined, "smm"); ok(r.status === 200 && r.j.versions.length === 3 && r.j.old.version === 1 && r.j.old.body === SOP, "every version is kept and readable");
r = await O("assistant", { q: "how do we deliver raw footage to the client?" }, "smm"); ok(r.status === 200 && r.j.intent === "knowledge" && r.j.citations.length && r.j.citations[0].id === KB1 && /source: Delivering raw footage, v3/.test(r.j.answer), "Assistant answers from the SOP and cites the article and version");
r = await O("assistant", { q: "how do we file GST returns" }, "smm"); ok(r.j.intent === "knowledge" && !r.j.citations.length && /No published article/.test(r.j.answer), "Assistant says so when no article answers");
r = await O("kb", { title: "Leave policy", kind: "policy", body: "Everyone gets 18 days of paid leave a year, plus public holidays.", visibility: "team" }, "hr"); const KB2 = r.j.id; await O("kb/" + KB2 + "/status", { status: "published" }, "hr");
r = await O("kb/" + KB2, undefined, "hr"); ok(r.j.article.legal_review === "needed", "policies start as 'legal review needed'");
r = await O("kb/" + KB2 + "/legal", { reviewer: "Shah & Co" }, "hr"); ok(r.status === 403, "only an owner records a legal review");
r = await O("kb/" + KB2 + "/legal", { reviewer: "Shah & Co, Advocates" }, "own"); ok(r.status === 200 && /done v1 · Shah/.test(q1("SELECT legal_review l FROM os_kb_articles WHERE id=?", KB2).l), "owner records who reviewed which version");
r = await O("kb", { title: "Incident response", kind: "procedure", body: "1. Contain. 2. Tell the owners and operations. 3. Record everything in Risks & incidents.", publish: true }, "ops"); const KB3 = r.j.id;
await O("kb/" + KB3 + "/legal", {}, "own"); r = await O("kb/" + KB3, undefined, "ops"); ok(r.j.article.sign_off_current === true, "procedure: owner sign-off on the current version");
await O("kb", { id: KB3, title: "Incident response", kind: "procedure", body: "1. Contain. 2. Tell the owners and operations at once. 3. Record everything in Risks & incidents." }, "ops"); r = await O("kb/" + KB3, undefined, "ops"); ok(r.j.article.sign_off_current === false, "procedure: editing it needs a new sign-off");
qr("UPDATE os_kb_articles SET review_on=? WHERE id=?", back(1), KB1); await KB.reminders(env); ok(notes("dev@fodo.co.in", /Time to check the article/) === 1, "daily: review reminder to the article owner");
r = await O("kb/" + KB1 + "/reviewed", {}, "dev"); ok(r.status === 200 && r.j.review_on > today, "owner confirms the article is still right");

/* ---------- 8. documents ---------- */
const TB = "This agreement is between FODO and {{client_name}} for {{service}}. Fee: Rs {{fee}} per month, starting {{start}}.";
r = await O("doc-templates", { name: "Retainer agreement", kind: "contract", body: TB }, "dev"); ok(r.status === 403, "templates: designers can't manage them");
r = await O("doc-templates", { name: "Retainer agreement", kind: "contract", body: TB }, "ops"); const DT1 = r.j.id; ok(r.status === 200 && r.j.fields.join() === "client_name,service,fee,start" && r.j.legal_review_needed, "template: placeholders found, legal review needed");
const CLID = (q1("SELECT id FROM os_clients LIMIT 1") || {}).id;
r = await O("documents", { template_id: DT1, values: { client_name: "Biz Pvt Ltd", service: "social media" } }, "ops"); ok(r.status === 400 && /fee, start/.test(r.j.reason), "document: missing placeholders are listed");
r = await O("documents", { template_id: DT1, values: { client_name: "Biz <b>Pvt</b> Ltd", service: "social media", fee: "40000", start: "1 Dec" }, expires_on: plus(10) }, "ops"); const D1 = r.j.id; ok(r.status === 200 && /^DOC-\d{4}-\d{4}$/.test(r.j.number), "document from the template");
r = await O("documents/" + D1 + "/print", undefined, "ops"); ok(r.status === 200 && /not been reviewed by a lawyer/.test(r.t) && r.t.indexOf("<b>Pvt</b>") < 0 && /Rs 40000/.test(r.t), "print: marked 'not reviewed by a lawyer', values escaped");
r = await O("documents/" + D1, undefined, "dev"); ok(r.status === 404, "documents: other people's documents are invisible to a designer");
r = await O("doc-templates/" + DT1 + "/legal", { reviewer: "Shah & Co, Advocates" }, "ops"); ok(r.status === 403, "template legal review: owner only");
await O("doc-templates/" + DT1 + "/legal", { reviewer: "Shah & Co, Advocates" }, "own");
r = await O("documents", { template_id: DT1, values: { client_name: "Biz Pvt Ltd", service: "SEO", fee: "25000", start: "1 Jan" } }, "ops"); const D2 = r.j.id; ok(q1("SELECT legal_reviewed l FROM os_documents WHERE id=?", D2).l === 1 && q1("SELECT legal_reviewed l FROM os_documents WHERE id=?", D1).l === 0, "documents from a reviewed template are marked reviewed");
r = await O("documents/" + D1 + "/status", { status: "sent", sent_to: "client" }, "ops"); ok(r.status === 409, "a draft can't be sent before approval");
r = await O("documents/" + D1 + "/submit", {}, "ops"); const DA = r.j.approval_id; ok(r.status === 200 && q1("SELECT kind FROM os_approvals WHERE id=?", DA).kind === "document", "submit: approval through the engine");
r = await O("documents/" + D1, { title: "changed" }, "ops"); ok(r.status === 409, "only a draft is edited");
await O("approvals/" + DA + "/decide", { decision: "approve" }, "own"); ok(q1("SELECT status FROM os_documents WHERE id=?", D1).status === "approved", "approved by the approver");
r = await O("documents/" + D1 + "/status", { status: "sent", sent_to: "ceo@biz.in" }, "ops"); ok(r.status === 200, "sent (recorded)");
r = await O("documents/" + D1 + "/status", { status: "signed", signed_by: "R. Mehta (Biz), Anmol (FODO)", signed_on: today }, "ops"); ok(r.status === 400 && /signed copy/.test(r.j.reason), "signed: the signed copy is required");
r = await O("documents/" + D1 + "/status", { status: "signed", signed_by: "R. Mehta (Biz), Anmol (FODO)", signed_on: today, signed_file_id: "fl123" }, "ops"); ok(r.status === 200 && q1("SELECT sign_method m FROM os_documents WHERE id=?", D1).m === "manual", "signed manually (no e-sign provider configured)");
r = await O("documents/" + D1, undefined, "ops"); ok(["created", "view", "print", "submitted", "approved", "sent", "signed"].every((a) => r.j.access.some((x) => x.action === a)) && r.j.esign === false, "access log: every open, print and step");
{ const out = await DO.daily(env); ok(out.alerted >= 1 && notes("ops@fodo.co.in", /expires on/) >= 1, "daily: 30-day expiry alert"); qr("UPDATE os_documents SET expires_on=? WHERE id=?", back(1), D1); await DO.daily(env); ok(q1("SELECT status FROM os_documents WHERE id=?", D1).status === "expired", "daily: an expired document is marked expired"); }
r = await O("documents/" + D2 + "/status", { status: "void" }, "ops"); ok(r.status === 400, "void needs a reason");
r = await O("documents", { title: "My NDA", kind: "nda", body: "I will keep client information confidential at all times." }, "dev"); ok(r.status === 200, "a designer creates their own document");
r = await O("documents", undefined, "dev"); ok(r.j.items.length === 1, "and sees only their own");

/* ---------- 9. unified inbox ---------- */
await O("support", { subject: "Invoice question", category: "Payments & refunds", priority: "high", text: "Why was I charged twice?" }, "c");
const TKT = q1("SELECT id FROM help_tickets ORDER BY created_at DESC LIMIT 1").id;
r = await O("inbox", undefined, "dev"); ok(r.status === 403, "inbox: designers have no inbox");
r = await O("inbox", undefined, "pm"); ok(r.status === 200 && r.j.items.some((x) => x.ref === TKT && x.source === "support") && r.j.sources.find((s) => s.id === "whatsapp").status === "not configured" && !r.j.sources.some((s) => s.id === "gmail"), "inbox: unassigned tickets for managers; WhatsApp not configured; Gmail only for owners");
r = await O("inbox", { source: "support", ref: TKT, action: "assign", user_id: uid("dev@fodo.co.in") }, "pm"); ok(r.status === 200 && q1("SELECT assignee_user_id a FROM help_tickets WHERE id=?", TKT).a === uid("dev@fodo.co.in") && notes("dev@fodo.co.in", /Conversation assigned/) === 1, "assign: sets the ticket assignee and tells them");
r = await O("inbox", { source: "support", ref: TKT, action: "task", due: plus(1) }, "pm"); const TK1 = r.j.task_id; ok(r.status === 200 && q1("SELECT title FROM biz_tasks WHERE id=?", TK1).title === "Reply: Invoice question", "conversation → task");
r = await O("inbox", { source: "support", ref: TKT, action: "task" }, "pm"); ok(r.status === 409, "one task per conversation");
r = await O("inbox", { source: "support", ref: TKT, action: "done" }, "pm"); ok(r.status === 200 && /Solve the ticket/.test(r.j.note), "done in FODO; honest note that the client is not told");
r = await O("inbox", undefined, "pm"); ok(!r.j.items.some((x) => x.ref === TKT), "done items leave the open box");
r = await O("inbox?box=done", undefined, "pm"); ok(r.j.items.some((x) => x.ref === TKT && x.task_id === TK1), "and appear under done, linked to the task");
r = await O("inbox", undefined, "own"); ok(r.j.sources.find((s) => s.id === "gmail").status === "not connected", "owner: Gmail says 'not connected' when the Brain connector isn't set up");
r = await O("inbox", { source: "gmail", ref: "a@b.c:1", action: "done" }, "pm"); ok(r.status === 403, "Gmail items are the owner's");
r = await O("inbox", { source: "support", ref: TKT, action: "snooze", until: back(1) }, "pm"); ok(r.status === 400, "snooze needs a future date");

/* ---------- 10. risks, incidents, continuity ---------- */
r = await O("risks", { title: "Key editor leaves", kind: "people", severity: 4, likelihood: 4 }, "ops"); ok(r.status === 400 && /mitigation/.test(r.j.reason), "a high risk needs a mitigation plan");
r = await O("risks", { title: "Key editor leaves", kind: "people", severity: 4, likelihood: 4, mitigation: "Second editor trained on every client", owner_user_id: uid("pm@fodo.co.in") }, "ops"); const RK1 = r.j.id; ok(r.status === 200 && r.j.level === "high", "company risk added, level high");
r = await O("risks", undefined, "dev"); ok(r.status === 403, "designers don't see the risk register");
r = await O("risks", undefined, "pm"); ok(r.j.items.some((x) => x.id === RK1) && r.j.heat[1][3] === 1, "the risk owner sees it; heat map counts severity × likelihood");
r = await O("risks", { title: "x", severity: 2, likelihood: 2 }, "pm"); ok(r.status === 403, "a project manager cannot add company risks");
r = await O("risks", { id: RK1, status: "closed" }, "pm"); ok(r.status === 400, "closing a risk needs a reason");
r = await O("risks", { id: RK1, status: "mitigating", note: "Training started" }, "pm"); ok(r.status === 200, "the risk owner updates it");
r = await O("incidents", { title: "Client list emailed to wrong person", kind: "data", severity: "high", personal_data: true, affected_count: 40, summary: "A CSV of 40 client contacts was sent to an outside address by mistake." }, "dev"); const IN1 = r.j.id; ok(r.status === 200 && /^INC-/.test(r.j.number) && notes("anmol@fodo.co.in", /URGENT Incident .* personal data/) === 1 && notes("ops@fodo.co.in", /URGENT Incident/) === 1, "anyone reports an incident; owners and operations are told at once");
ok(q1("SELECT status FROM os_problems WHERE rule='incident_open' AND key=?", IN1).status === "open", "a high incident shows on Problems");
r = await O("incidents", undefined, "dev"); ok(r.j.items.length === 1 && r.j.items[0].informing_note && r.j.items[0].hours_open === 0, "the reporter sees it, with the personal-data clock");
r = await O("incidents/" + IN1, { status: "closed" }, "dev"); ok(r.status === 403, "the reporter does not run the incident");
r = await O("incidents/" + IN1, { status: "closed" }, "ops"); ok(r.status === 409, "open → closed is not a valid step");
await O("incidents/" + IN1, { status: "contained", note: "Recipient confirmed deletion in writing" }, "ops"); await O("incidents/" + IN1, { status: "resolved" }, "ops");
r = await O("incidents/" + IN1, { status: "closed", root_cause: "Autocomplete picked the wrong address" }, "ops"); ok(r.status === 409 && /Data Protection Board/.test(r.j.reason), "closing a personal-data incident needs the informing steps (or a reason)");
r = await O("incidents/" + IN1, { status: "closed", root_cause: "Autocomplete picked the wrong address", board_informed_at: today, people_informed_at: today }, "ops"); ok(r.status === 200 && q1("SELECT status FROM os_problems WHERE rule='incident_open' AND key=?", IN1).status === "resolved", "closed with the dates recorded; the problem clears");
r = await O("incidents/" + IN1, undefined, "dev"); ok(r.j.log.length >= 4 && r.j.log.some((l) => /Data Protection Board informed/.test(l.text)), "incident timeline");
r = await O("continuity", undefined, "dev"); ok(r.status === 200 && r.j.procedures.some((p) => p.id === KB3) && r.j.signed === false && r.j.people.some((p) => p.role === "Owner") && r.j.last_incident, "continuity: procedures (sign-off state), who to call, last incident");

/* ---------- 11. DPDP ---------- */
r = await Z("privacy/dpdp", undefined, "c"); ok(r.status === 200 && r.j.consents.length === 5 && r.j.consents.every((x) => x.status === "not_asked") && r.j.notice === null, "client: own consents (none asked yet), no published notice");
r = await Z("privacy/consent", { purpose: "case_study", granted: true }, "c"); ok(r.j.status === "granted" && await CP.consentOf(env, uid("client@biz.in"), "case_study"), "client grants a consent; other modules can check it");
r = await Z("privacy/consent", { purpose: "case_study", granted: false }, "c"); ok(r.j.status === "withdrawn" && !(await CP.consentOf(env, uid("client@biz.in"), "case_study")) && q1("SELECT count(*) n FROM os_audit WHERE action LIKE 'CONSENT_%'").n === 2, "and withdraws it; both audited");
r = await Z("privacy/consent", { purpose: "selling_data", granted: true }, "c"); ok(r.status === 400, "unknown purposes refused");
r = await O("privacy-desk", undefined, "dev"); ok(r.status === 403, "privacy desk: not for designers");
r = await O("privacy-desk", undefined, "ops"); ok(r.status === 200 && r.j.retention.length === 6 && r.j.retention.every((x) => !x.legal_reviewed) && /lawyer/.test(r.j.legal_note), "operations reads the desk; retention suggestions pending legal review");
r = await O("privacy-desk/settings", { response_days: 15 }, "ops"); ok(r.status === 403, "only owners change privacy settings");
r = await O("privacy-desk/settings", { grievance_officer_user_id: uid("dev@fodo.co.in") }, "own"); ok(r.status === 409 && /Privacy permission/.test(r.j.reason), "the grievance officer must hold the Privacy permission");
r = await O("privacy-desk/settings", { response_days: 15, grievance_officer_user_id: uid("hr@fodo.co.in") }, "own"); ok(r.status === 200, "owner sets response days and the grievance officer");
r = await Z("privacy/request", { kind: "erasure", detail: "Please delete everything you hold about me." }, "c"); const RQ = q1("SELECT * FROM os_rights_requests ORDER BY created_at DESC LIMIT 1"); ok(r.status === 200 && /^DPR-/.test(r.j.number) && r.j.due_on === plus(15) && RQ.assignee_user_id === uid("hr@fodo.co.in") && notes("hr@fodo.co.in", /Privacy request DPR-/) === 1, "rights request: number, due date from settings, routed to the grievance officer");
r = await O("privacy-desk/requests/" + RQ.id, { status: "completed", response: "ok" }, "hr"); ok(r.status === 400, "closing a request needs a written answer");
r = await O("privacy-desk/requests/" + RQ.id, { status: "completed", response: "Your account and personal data were erased on " + today + "; invoices are kept as tax law requires." }, "hr"); ok(r.status === 200 && Array.isArray(r.j.blockers) && notes("client@biz.in", /privacy request DPR-.* is completed/) === 1, "the officer answers; the person is told; erasure blockers shown");
r = await Z("privacy/dpdp", undefined, "c"); ok(r.j.requests.length === 1 && r.j.requests[0].status === "completed" && /erased/.test(r.j.requests[0].response), "the person sees the answer");
r = await O("privacy-desk/notices", { title: "Privacy notice", body: "short" }, "own"); ok(r.status === 400, "notice: full text required");
r = await O("privacy-desk/notices", { title: "FODO privacy notice", body: "FODO collects your name, email and phone to run your account and projects. ".repeat(3) }, "own"); const PN = r.j.id;
r = await O("privacy-desk/notices/" + PN + "/publish", {}, "own"); ok(r.status === 400 && /legal review/.test(r.j.reason), "a notice is published only after a recorded legal review");
r = await O("privacy-desk/notices/" + PN + "/publish", { reviewer: "Shah & Co, Advocates" }, "own"); ok(r.status === 200, "published after the review is recorded");
await Z("privacy/consent", { purpose: "marketing_email", granted: true }, "c"); ok(q1("SELECT notice_version v FROM os_consents WHERE purpose='marketing_email'").v === 1, "consents record the notice version in force");
qr("INSERT INTO os_ai_calls (user_id, question, tools, ok, ms, created_at) VALUES ('u','old question','[]',1,1,?)", new Date(Date.now() - 400 * 864e5).toISOString());
r = await O("privacy-desk/retention", { category: "financial_records", action: "delete", keep_days: 100 }, "own"); ok(r.status === 409, "financial records are never deleted from here");
r = await O("privacy-desk/retention", { category: "ai_questions", action: "delete", keep_days: 365 }, "own"); ok(r.status === 200 && r.j.legal_reviewed === false, "retention rule set (not yet reviewed)");
r = await O("privacy-desk/retention/ai_questions/apply", { confirm: "ai_questions" }, "own"); ok(r.status === 409 && /legal review/.test(r.j.reason), "a rule is applied only after its legal review is recorded");
await O("privacy-desk/retention", { category: "ai_questions", action: "delete", keep_days: 365, reviewer: "Shah & Co" }, "own");
r = await O("privacy-desk", undefined, "own"); ok(r.j.retention.find((x) => x.category === "ai_questions").past_retention === 1 && r.j.retention.find((x) => x.category === "ai_questions").can_apply, "preview: rows past the retention period");
r = await O("privacy-desk/retention/ai_questions/apply", {}, "own"); ok(r.status === 400, "applying needs the typed confirmation");
r = await O("privacy-desk/retention/ai_questions/apply", { confirm: "ai_questions" }, "own"); ok(r.status === 200 && r.j.rows === 1 && !q1("SELECT 1 x FROM os_ai_calls WHERE question='old question'"), "an owner applies it by hand; rows counted and audited");
r = await O("privacy-desk/retention/ai_questions/apply", { confirm: "ai_questions" }, "ops"); ok(r.status === 403, "nobody else applies retention");
await Z("privacy/request", { kind: "access", detail: "Send me a copy of my data please." }, "c"); qr("UPDATE os_rights_requests SET due_on=? WHERE status='received'", back(1)); { const out = await CP.daily(env); ok(out.privacy_due === 1 && notes("hr@fodo.co.in", /is late/) === 1, "daily: late privacy requests are chased"); }

/* ---------- 12. jobs ---------- */
{ const out = await HANDLERS.os_daily.run(env); ok(["platform", "documents", "knowledge", "compliance"].every((k) => out[k] && typeof out[k] === "object"), "os_daily runs renewals, document expiry, article reviews, risks and privacy requests"); }

/* ---------- 13. router hygiene + UI wiring ---------- */
ok(ROUTES.every((x) => x[2] === "self" || (x[2] && REGISTRY[x[2].resource] && REGISTRY[x[2].resource][x[2].action])), "every route declares a valid permission"); ok(ROUTES.filter((x) => x[2] === "self").length <= 8, "no more than 8 self routes");
{ const ui = fs.readFileSync(new URL("../js/ws-os.js", import.meta.url), "utf8"); const paths = new Set(); for (const m of ui.matchAll(/oapi\("([a-z\-]+(?:\/[a-z\-]+)*)/g)) paths.add(m[1]); for (const m of ui.matchAll(/"([a-z\-]+(?:\/[a-z\-]+)?)\/" \+ [a-zA-Z.]+ \+ "\/([a-z\-]+(?:\/[a-z\-]+)?)"/g)) paths.add(m[1] + "/x/" + m[2]); const routes = ROUTES.map((x) => x[1]); const missing = [...paths].filter((p) => !routes.some((re) => re.test(p) || re.test(p.replace(/\/x\//, "/abc123/")) || re.test(p + "/abc") || re.source.indexOf("^" + p.replace(/\//g, "\\/") + "\\/") === 0)); ok(missing.length === 0, "ws-os.js calls only routes the router has" + (missing.length ? ": " + missing.join(", ") : "")); ok(["procurement: procurement", "subscriptions: subscriptions", "integrations: integrations", "knowledge: knowledge", "documents: documents", "inbox: inbox", "risks: risks", '"privacy-desk": privacyDesk'].every((k) => ui.indexOf(k) > -1), "ws-os.js renders the eight Phase 7 views"); ok(!/\bworker\b/i.test(ui) && !/—/.test(ui), "no 'worker', no long dash"); }
{ const ws = fs.readFileSync(new URL("../js/workspace.js", import.meta.url), "utf8"); ok(["procurement", "subscriptions", "integrations", "knowledge", "documents", "inbox", "risks", "privacy-desk"].every((v) => ws.indexOf('"' + v + '"') > -1), "workspace.js registers the Phase 7 views"); ok(/privacy\/dpdp/.test(ws), "Settings & privacy: consents and rights requests for everyone"); }
for (const f of ["procure", "platform", "kb", "docs", "inbox", "comply", "kit"]) { const src = fs.readFileSync(new URL("../functions/_lib/os/" + f + ".js", import.meta.url), "utf8"); ok(!/\bworker\b/i.test(src.replace(/Workers AI/g, "")) && !/—/.test(src), f + ".js: no 'worker', no long dash"); }
console.log(`\nv50.7: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
