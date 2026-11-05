// v50.4 FODO OS V4 Phase 4: finance (expenses, budgets, receivables + partial payments, payables, cash, forecast, profitability, leakage, analytics, archive),
// change-request decisions, webhook replay guard, navigation.
// Run: node --no-warnings tests/v504.test.mjs
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
import * as FI from "../functions/_lib/os/finance.js";
import * as RP from "../functions/_lib/replay.js";
import * as PS from "../functions/_lib/os/pros.js";
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
const back = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10), thisMonth = today.slice(0, 7);

/* ---------- 1. registry, templates, navigation ---------- */
ok(TEMPLATES.find((t) => t.slug === "designer").perms.indexOf("expense.submit.own") > -1 && TEMPLATES.find((t) => t.slug === "project_manager").perms.indexOf("expense.approve.team") > -1 && TEMPLATES.find((t) => t.slug === "finance_manager").perms.indexOf("expense.approve.organization") > -1, "templates: everyone claims own expenses, managers approve their team, finance the organisation");
r = await Z("me", undefined, "dev"); ok(r.j.nav.some((n) => n.id === "expenses") && !r.j.nav.some((n) => n.id === "os-finance"), "designer navigation: Expenses, no Finance");
r = await Z("me", undefined, "fin"); ok(r.j.nav.some((n) => n.id === "os-finance") && r.j.os.groups.some((g) => g.id === "finance" && g.items.some((n) => n.id === "os-finance")), "finance manager: Finance in its own Finance group");
r = await Z("me", undefined, "own"); ok(r.j.nav.some((n) => n.id === "os-finance") && r.j.nav.some((n) => n.id === "expenses"), "owner: Finance and Expenses");
for (const p of ["finance", "finance/receivables", "finance/payables", "finance/cash", "finance/forecast", "finance/budgets", "finance/profitability", "finance/leakage", "finance/analytics", "finance/archive"]) { r = await O(p, undefined, "pm"); if (r.status !== 403) { ok(false, "PM is refused " + p + " (" + r.status + ")"); break; } } ok(true, "a PM without finance access is refused every finance screen");
r = await O("finance", undefined, "c"); ok(r.status === 403, "a client cannot open finance");

/* ---------- 2. set-up: client, project, cost rates ---------- */
const cl = (await O("clients", { name: "Biz Foods", email: "client@biz.in", status: "active" }, "own")).j; ok(cl.id && q1("SELECT primary_user_id u FROM os_clients WHERE id=?", cl.id).u === uid("client@biz.in"), "client record linked to the client's login");
const pj = (await O("projects", { title: "Biz Foods rebrand", type: "branding", client_id: cl.id, owner_user_id: uid("pm@fodo.co.in"), brief: { goal: "Rebrand", budget: 50000 } }, "pm")).j; ok(pj.id, "internal project with a ₹50,000 budget");
qr("UPDATE os_members SET cost_rate=500 WHERE email='dev@fodo.co.in'"); await O("tasks", { title: "Logo design", project_id: pj.id, assignee_user_id: uid("dev@fodo.co.in"), estimated_min: 600 }, "pm");

/* ---------- 3. expenses ---------- */
r = await O("expenses", { amount: 1200, category: "travel", project_id: pj.id, note: "Cab to client", billable: true, spent_on: today }, "dev"); ok(r.status === 200 && r.j.id && q1("SELECT 1 x FROM biz_notes WHERE user_id=? AND text LIKE '%claimed ₹1200%'", uid("pm@fodo.co.in")), "designer claims a billable expense on the project; the manager is notified");
const ex1 = r.j.id; r = await O("expenses", { amount: 0, category: "travel" }, "dev"); ok(r.status === 400, "an amount is required");
r = await O("expenses", { amount: 100, category: "travel", spent_on: plus(3) }, "dev"); ok(r.status === 400, "a spend date in the future is refused");
r = await O("expenses", { amount: 100, category: "travel" }, "c"); ok(r.status === 403, "a client cannot claim expenses");
r = await O("expenses/" + ex1 + "/decide", { decision: "approve" }, "dev"); ok(r.status === 403, "nobody approves their own expense");
r = await O("expenses/" + ex1 + "/decide", { decision: "approve" }, "hr"); ok(r.status === 403, "HR (no expense.approve over design) cannot approve");
r = await O("expenses?box=team", undefined, "pm"); ok(r.status === 200 && r.j.items.length === 1 && r.j.canApprove && !r.j.canReimburse, "manager sees the team's claims; can approve, cannot reimburse");
r = await O("expenses/" + ex1 + "/decide", { decision: "approve" }, "pm"); ok(r.status === 200 && r.j.status === "approved" && q1("SELECT 1 x FROM os_audit WHERE action='EXPENSE_APPROVED'") && q1("SELECT 1 x FROM biz_notes WHERE user_id=? AND text LIKE '%ready to reimburse%'", uid("fin@fodo.co.in")), "manager approves; audited; finance notified");
r = await O("expenses/" + ex1 + "/reimburse", { ref: "UTR1" }, "pm"); ok(r.status === 403, "only finance reimburses");
r = await O("expenses/" + ex1 + "/reimburse", {}, "fin"); ok(r.status === 400, "reimbursing needs a payment reference");
r = await O("expenses", { amount: 800, category: "props", project_id: pj.id }, "dev"); const ex2 = r.j.id; r = await O("expenses/" + ex2 + "/decide", { decision: "reject" }, "pm"); ok(r.status === 400, "rejecting needs a note");
r = await O("expenses/" + ex2 + "/decide", { decision: "reject", note: "Not in the brief" }, "fin"); ok(r.status === 200 && r.j.status === "rejected", "finance can decide too");
r = await O("expenses", { amount: 60000, category: "venue", project_id: pj.id, note: "Studio hire" }, "dev"); ok(r.status === 200 && /against a budget of ₹50000/.test(r.j.warning || ""), "a claim that pushes project spend past the budget comes back with a warning (not blocked)");
const ex3 = r.j.id; await O("expenses/" + ex3 + "/decide", { decision: "approve" }, "pm");
r = await O("expenses?box=mine", undefined, "dev"); ok(r.j.items.length === 3 && r.j.totals.approved === 61200, "my expenses with totals by status");

/* ---------- 4. budgets ---------- */
r = await O("finance/budgets", { scope_kind: "department", ref_id: dept("design"), period: thisMonth, amount: 50000 }, "pm"); ok(r.status === 403, "only finance sets budgets");
r = await O("finance/budgets", { scope_kind: "department", ref_id: dept("design"), period: "June", amount: 50000 }, "fin"); ok(r.status === 400, "department budgets are per month (YYYY-MM)");
r = await O("finance/budgets", { scope_kind: "department", ref_id: dept("design"), period: thisMonth, amount: 50000 }, "fin"); ok(r.status === 200, "finance sets the design department's monthly budget");
await O("finance/budgets", { scope_kind: "project", ref_id: pj.id, amount: 55000 }, "fin"); await O("finance/budgets", { scope_kind: "organization", period: thisMonth, amount: 500000 }, "fin");
r = await O("finance/budgets", undefined, "fin"); const bD = r.j.items.find((b) => b.scope_kind === "department"), bP = r.j.items.find((b) => b.scope_kind === "project"); ok(r.status === 200 && bD.actual === 61200 && bD.state === "over" && bD.pct === 122 && bP.name === "Biz Foods rebrand" && bP.actual === 61200 && bP.state === "over", "budgets: actual from approved expenses; over-budget flagged with the percentage");
r = await O("finance/budgets", { scope_kind: "project", ref_id: pj.id, amount: 70000 }, "fin"); r = await O("finance/budgets", undefined, "fin"); ok(r.j.items.filter((b) => b.scope_kind === "project").length === 1 && r.j.items.find((b) => b.scope_kind === "project").state === "watch", "saving again updates the same budget (87% → watch)");

/* ---------- 5. receivables: OS invoices, partial payments, aging ---------- */
r = await O("finance/invoices", { client_id: cl.id, project_id: pj.id, lines: [{ label: "Brand identity", amount: 40000 }], tax_pct: 18 }, "fin"); ok(r.status === 400 && /FODO_GSTIN/.test(r.j.reason), "no GST without FODO_GSTIN (no fake tax)");
r = await O("finance/invoices", { client_id: cl.id, project_id: pj.id, lines: [{ label: "Brand identity", amount: 40000 }] }, "pm"); ok(r.status === 403, "only finance issues invoices");
r = await O("finance/invoices", { client_id: cl.id, project_id: pj.id, lines: [] }, "fin"); ok(r.status === 400, "an invoice needs a line");
r = await O("finance/invoices", { client_id: cl.id, project_id: pj.id, title: "Phase 1", lines: [{ label: "Brand identity", amount: 40000 }, { label: "Travel (billable)", amount: 1200 }], expense_ids: [ex1], terms_days: 15 }, "fin"); ok(r.status === 200 && /^FI-\d{4}-\d{4}$/.test(r.j.number) && r.j.total === 41200 && r.j.due_date === plus(15) && q1("SELECT invoice_id FROM os_expenses WHERE id=?", ex1).invoice_id === r.j.id, "finance issues an invoice (number FI-YYMM-nnnn, net 15) and the billable expense is marked invoiced");
const inv1 = r.j.id; ok(q1("SELECT 1 x FROM biz_notes WHERE user_id=? AND text LIKE 'Invoice FI-%'", uid("client@biz.in")), "the client is notified");
r = await O("finance/invoices", { client_id: cl.id, lines: [{ label: "Again", amount: 1 }], expense_ids: [ex1] }, "fin"); ok(r.status === 400, "an expense cannot be invoiced twice");
r = await Z("invoices", undefined, "c"); ok(r.status === 200 && r.j.items.some((i) => i.id === inv1 && i.status === "issued"), "the client sees the invoice in their Workspace");
r = await call("biz/invoices/" + inv1 + "/print", undefined, { as: "c", raw: true }); const html = r.t || ""; ok(r.status === 200 && /Amount due/.test(html) && !/Total paid/.test(html) && !/contract undefined/.test(html), "the client's printable invoice says Amount due, not Total paid");
r = await O("finance/invoices/" + inv1 + "/pay", { amount: 50000, ref: "UTR-A" }, "fin"); ok(r.status === 400 && /41200/.test(r.j.reason), "overpayment refused with the amount still due");
r = await O("finance/invoices/" + inv1 + "/pay", { amount: 20000, ref: "UTR-A", method: "bank" }, "fin"); ok(r.status === 200 && r.j.status === "partially_paid" && r.j.left === 21200 && q1("SELECT amount FROM biz_ledger WHERE account='client_receipts' AND ref_type='os_invoice_payment'").amount === 20000, "partial payment: partially paid, ledger receipt written");
r = await O("finance/invoices/" + inv1 + "/void", { reason: "Mistake in lines" }, "fin"); ok(r.status === 409, "an invoice with payments cannot be voided (credit note instead)");
r = await O("finance/invoices/" + inv1, undefined, "fin"); ok(r.status === 200 && r.j.payments.length === 1 && r.j.invoice.left === 21200 && r.j.print, "invoice detail with payments and the amount left");
r = await call("os/finance/invoices/" + inv1 + "/print", undefined, { as: "fin", raw: true }); ok(r.status === 200 && /Amount due/.test(r.t || ""), "finance prints any invoice from the OS");
r = await O("finance/invoices", { client_id: cl.id, lines: [{ label: "Retainer October", amount: 15000 }], due_date: back(45) }, "fin"); ok(r.status === 400, "the due date cannot be before the issue date");
r = await O("finance/invoices", { client_id: cl.id, lines: [{ label: "Retainer October", amount: 15000 }] }, "fin"); const inv2 = r.j.id; qr("UPDATE biz_invoices SET issue_date=?, due_date=? WHERE id=?", back(60), back(45), inv2);
r = await O("finance/invoices", { client_id: cl.id, lines: [{ label: "Typo invoice", amount: 999 }] }, "fin"); const inv3 = r.j.id; r = await O("finance/invoices/" + inv3 + "/void", { reason: "Issued by mistake" }, "fin"); ok(r.status === 200 && q1("SELECT status FROM biz_invoices WHERE id=?", inv3).status === "void", "an unpaid invoice can be voided with a reason");
r = await O("finance/receivables", undefined, "fin"); ok(r.status === 200 && r.j.outstanding === 36200 && r.j.overdue === 15000 && r.j.aging.find((a) => a.id === "d31_60").amount === 15000 && r.j.aging.find((a) => a.id === "current").amount === 21200 && r.j.byClient[0].client === "Biz Foods" && r.j.items.every((x) => x.status !== "void"), "receivables: outstanding, overdue, aging buckets, by client; void left out");
r = await O("finance/invoices/" + inv1 + "/pay", { amount: 21200, ref: "UTR-B" }, "fin"); ok(r.status === 200 && r.j.status === "paid", "the rest paid → paid");

/* ---------- 6. payables ---------- */
qr("INSERT INTO biz_pros (id, user_id, name, role, status, created_at, updated_at) VALUES ('proP', NULL, 'Pia Pro', 'Photographer', 'approved', '2026-01-01', '2026-01-01')");
qr("INSERT INTO biz_projects (id, client_id, pro_id, title, status, created_at, updated_at) VALUES ('mpj1', ?, 'proP', 'Market shoot', 'in_progress', '2026-01-01', '2026-01-01')", uid("other@biz.in"));
qr("INSERT INTO biz_milestones (id, project_id, idx, title, amount, due, status, approved_at) VALUES ('mms1', 'mpj1', 1, 'Shoot day', 20000, ?, 'approved', ?)", back(20), back(10) + "T10:00:00Z");
qr("INSERT INTO biz_payouts (id, milestone_id, pro_id, gross, commission, net, status, created_at) VALUES ('po1', 'mms1x', 'proP', 20000, 3000, 17000, 'pending', ?)", back(10) + "T10:00:00Z");
r = await O("finance/payables", { vendor: "Studio Rent Co", title: "Studio hire", amount: 8000, due: plus(5), project_id: pj.id, category: "venue" }, "fin"); ok(r.status === 200, "finance records a vendor bill"); const vb = r.j.id;
r = await O("finance/payables", undefined, "fin"); ok(r.status === 200 && r.j.byKind.pro_payout === 17000 && r.j.byKind.expense === 61200 && r.j.byKind.vendor_bill === 8000 && r.j.items.find((x) => x.kind === "pro_payout").days_late === 3 && r.j.total === 86200, "payables combine pending Pro payouts (due 7 days after creation, 3 days late), approved unreimbursed expenses (invoiced or not, still owed to the person) and vendor bills");
r = await O("finance/payables/" + vb + "/pay", { ref: "NEFT-9" }, "fin"); ok(r.status === 200 && q1("SELECT amount FROM biz_ledger WHERE account='vendors_paid'").amount === 8000, "paying a vendor bill writes the ledger");
r = await O("finance/payables/" + vb + "/pay", { ref: "NEFT-9" }, "fin"); ok(r.status === 409, "a bill is paid once");
r = await O("expenses/" + ex3 + "/reimburse", { ref: "UTR-EX3" }, "fin"); ok(r.status === 200 && q1("SELECT amount FROM biz_ledger WHERE account='expenses_paid' AND ref_id=?", ex3).amount === 60000, "reimbursed expense → ledger expenses_paid");

/* ---------- 7. cash ---------- */
r = await O("finance/cash", undefined, "fin"); ok(r.status === 200 && r.j.bank_total === null && /No bank balance/.test(r.j.note) && r.j.bookAll.net === 41200 - 8000 - 60000, "without bank balances: none invented, only the ledger movement (receipts minus payments)");
r = await O("finance/cash", { account: "HDFC current", balance: 250000, as_of: today }, "pm"); ok(r.status === 403, "only finance enters balances");
r = await O("finance/cash", { account: "HDFC current", balance: 250000, as_of: plus(1) }, "fin"); ok(r.status === 400, "a balance date in the future is refused");
await O("finance/cash", { account: "HDFC current", balance: 250000, as_of: today }, "fin"); await O("finance/cash", { account: "Petty cash", balance: 5000, as_of: back(10) }, "fin");
r = await O("finance/cash", undefined, "fin"); ok(r.j.bank_total === 255000 && r.j.accounts.length === 2 && r.j.accounts.find((a) => a.account === "Petty cash").stale && r.j.as_of === back(10), "cash = latest balance per account; stale accounts (over 7 days) are flagged");
await O("finance/cash", { account: "HDFC current", balance: 240000, as_of: today }, "fin"); r = await O("finance/cash", undefined, "fin"); ok(r.j.bank_total === 245000, "a newer entry replaces the account's balance");

/* ---------- 8. forecast ---------- */
r = await O("finance/forecast?months=3", undefined, "fin"); ok(r.status === 200 && r.j.months.length === 3 && r.j.opening === 245000 && r.j.assumptions.length === 7 && /Estimate/.test(r.j.label) && !r.j.insufficient, "forecast: 3 months, opening cash from bank balances, 7 stated assumptions, labelled an estimate");
const f0 = r.j.months[0]; ok(f0.inflow.overdue_collected === 9000 && f0.outflow.payables === 18200 && f0.outflow.payroll === Math.round(500 * 40 * 4.33), "month 1: overdue ₹15,000 at 60%, past-due payables, payroll = cost rate x hours x 4.33");
ok(r.j.scenarios.conservative[0].net <= r.j.scenarios.expected[0].net && r.j.scenarios.expected[0].net <= r.j.scenarios.optimistic[0].net && r.j.scenarios.expected[2].closing === 245000 + r.j.scenarios.expected.reduce((a, x) => a + x.net, 0), "three scenarios ordered; closing cash rolls forward");
r = await O("finance/forecast", { conservative: { inflow: 5 } }, "fin"); ok(r.status === 400, "scenario multipliers are bounded (0.3 to 2)");
r = await O("finance/forecast", { conservative: { inflow: 0.7 }, overdue_collect: 0.5 }, "fin"); ok(r.status === 200 && r.j.settings.conservative.inflow === 0.7, "finance tunes the assumptions; audited"); r = await O("finance/forecast", undefined, "fin"); ok(r.j.months[0].inflow.overdue_collected === 7500 && /50%/.test(r.j.assumptions[0]), "the change shows in the numbers and in the assumption text");

/* ---------- 9. profitability ---------- */
r = await O("finance/profitability/" + pj.id, undefined, "fin"); const pr0 = r.j.profit; ok(r.status === 200 && pr0.revenue === 41200 && pr0.collected === 41200 && pr0.cost.expenses === 61200 && pr0.cost.vendor_bills === 8000 && pr0.cost.labour === 5000 && pr0.margin === 41200 - 74200 && pr0.margin_pct === -80 && pr0.estimate === 50000 && pr0.confidence === "estimate", "project profitability: invoices vs expenses + vendor bills + labour (600 min x ₹500/h); negative margin shown; still an estimate until completed");
qr("UPDATE biz_projects SET status='completed', lifecycle='completed' WHERE id=?", pj.id); r = await O("finance/profitability/" + pj.id, undefined, "fin"); ok(r.j.profit.confidence === "confirmed", "completed and fully paid → confirmed");
qr("INSERT INTO biz_settlements (id, milestone_id, project_id, amount, provider, status, created_at) VALUES ('st1', 'mmsX', 'mpj1', 20000, 'manual', 'released', '2026-01-01')"); qr("INSERT INTO biz_ledger (at, kind, account, ref_type, ref_id, project_id, amount, memo) VALUES (?, 'settlement', 'fodo_revenue', 'settlement_line', 'sl1', 'mpj1', 3000, 'commission')", new Date().toISOString());
r = await O("finance/profitability", undefined, "fin"); const mk = r.j.items.find((x) => x.id === "mpj1"); ok(r.status === 200 && mk && mk.kind === "marketplace" && mk.revenue === 3000 && mk.cost.labour === 0 && r.j.totals.revenue >= 44200 && r.j.note, "marketplace projects: revenue is FODO's commission, Pro fees pass through");

/* ---------- 10. change requests + leakage ---------- */
const pj2 = (await O("projects", { title: "Biz Foods menu shoot", type: "shoot", client_id: cl.id, owner_user_id: uid("pm@fodo.co.in"), brief: { budget: 30000 } }, "pm")).j;
r = await O("projects/" + pj2.id + "/scope", { title: "Extra 10 photos", amount: 6000, change: true }, "pm"); const chId = r.j.change_id;
r = await O("projects/" + pj2.id + "/change", { id: chId, decision: "approve" }, "pm"); ok(r.status === 400, "staff recording a client's decision must write how the client answered");
r = await O("projects/" + pj2.id + "/change", { id: chId, decision: "approve" }, "dev"); ok(r.status === 403, "a designer cannot decide a change request");
r = await O("projects/" + pj2.id + "/change", { id: chId, decision: "approve" }, "c"); ok(r.status === 200 && r.j.status === "approved" && q1("SELECT 1 x FROM biz_notes WHERE user_id=? AND text LIKE 'Change approved on%'", uid("fin@fodo.co.in")), "the client approves their own change request; finance is told to invoice it");
r = await O("projects/" + pj2.id + "/change", { id: chId, decision: "reject" }, "c"); ok(r.status === 409, "a decided change cannot be decided again");
r = await O("projects/" + pj2.id + "/scope", { title: "Second location", amount: 9000, change: true }, "pm"); const ch2 = r.j.change_id;
qr("UPDATE biz_projects SET lifecycle='delivered' WHERE id=?", pj2.id);
r = await O("expenses", { amount: 2500, category: "props", project_id: pj2.id, billable: true }, "dev"); ok(r.status === 403, "an employee cannot claim on a project they are not on");
r = await O("expenses", { amount: 2500, category: "props", project_id: pj2.id, billable: true }, "pm"); const ex4 = r.j.id; r = await O("expenses/" + ex4 + "/decide", { decision: "approve" }, "fin"); ok(r.status === 200, "a manager without a manager: finance approves the claim");
r = await O("finance/leakage", undefined, "fin"); const L = (k) => r.j.items.find((x) => x.rule === k);
ok(r.status === 200 && L("delivered_not_invoiced") && L("delivered_not_invoiced").evidence[0].id === pj2.id && L("delivered_not_invoiced").amount === 30000, "leakage: delivered project with no invoice (budget at risk) with evidence");
ok(L("change_not_invoiced") && L("change_not_invoiced").amount === 6000 && L("change_not_invoiced").evidence[0].id === chId, "leakage: approved change request not invoiced");
ok(L("change_unapproved_after_delivery") && L("change_unapproved_after_delivery").evidence[0].id === ch2 && L("change_unapproved_after_delivery").severity === "medium", "leakage: extra work on a delivered project still waiting for the client");
ok(L("billable_expense_not_invoiced") && L("billable_expense_not_invoiced").amount === 2500, "leakage: billable expense not passed on");
ok(L("receivable_over_30") && L("receivable_over_30").evidence[0].id === inv2, "leakage: invoice more than 30 days late");
ok(L("milestone_unsettled") && L("milestone_unsettled").evidence[0].id === "mms1", "leakage: approved marketplace milestone without a settlement");
ok(r.j.items[0].severity === "high" && r.j.at_risk === r.j.items.reduce((a, x) => a + x.amount, 0), "rules sorted by severity; at-risk total adds up");
r = await O("finance/invoices", { client_id: cl.id, project_id: pj2.id, lines: [{ label: "Menu shoot", amount: 30000 }, { label: "Extra 10 photos", amount: 6000 }, { label: "Props", amount: 2500 }], change_ids: [chId], expense_ids: [ex4] }, "fin"); ok(r.status === 200 && q1("SELECT status FROM biz_changes WHERE id=?", chId).status === "invoiced", "invoicing the change marks it invoiced");
r = await O("finance/invoices", { client_id: cl.id, lines: [{ label: "x", amount: 1 }], change_ids: [ch2] }, "fin"); ok(r.status === 400, "an unapproved change cannot be invoiced");
r = await O("finance/leakage", undefined, "fin"); ok(!L("delivered_not_invoiced") && !L("change_not_invoiced") && !L("billable_expense_not_invoiced"), "after invoicing those rules clear");

/* ---------- 11. analytics, archive, overview ---------- */
r = await O("finance/analytics?months=6", undefined, "fin"); const tm = r.j.trend.find((x) => x.month === thisMonth); ok(r.status === 200 && r.j.trend.length === 6 && tm.invoiced >= 41200 + 38500 && tm.collected === 41200 && tm.expenses >= 61200 && r.j.definitions.invoiced, "analytics: monthly trend with written definitions");
ok(r.j.clients[0].client === "Biz Foods" && r.j.services.some((s) => s.service === "branding") && r.j.departments.some((x) => x.department === "Design") && r.j.categories.some((c) => c.category === "venue"), "analytics by client, service (project type), department and category");
r = await O("finance/archive", undefined, "fin"); ok(r.status === 200 && r.j.items.length === 4 && r.j.items.some((x) => x.status === "void") && r.j.items.every((x) => /\/print$/.test(x.print)) && r.j.months.length >= 1, "archive: every invoice (void kept) with a print link, months summary");
r = await O("finance/archive?q=Retainer", undefined, "fin"); ok(r.j.items.length === 1 && r.j.items[0].id === inv2, "archive search");
r = await O("finance", undefined, "fin"); ok(r.status === 200 && r.j.receivables.overdue === 15000 && r.j.cash.bank_total === 245000 && r.j.cash.stale && r.j.leakage.at_risk > 0 && Array.isArray(r.j.over_budget) && r.j.canManage, "finance overview pulls receivables, payables, cash, leakage, budgets");
r = await O("finance", undefined, "own"); ok(r.status === 200, "owner opens finance");

/* ---------- 12. webhook replay guard ---------- */
ok(RP.fresh(String(Math.floor(Date.now() / 1000))).ok && RP.fresh(String(Date.now())).ok && !RP.fresh(String(Math.floor(Date.now() / 1000) - 3600)).ok && RP.fresh(String(Math.floor(Date.now() / 1000) - 3600)).reason === "stale" && !RP.fresh(String(Date.now() + 3600e3)).ok && RP.fresh(null).ok, "freshness: seconds or milliseconds; stale over 15 min and future over 5 min refused; no timestamp = not checked");
let g = await RP.guard(env, "cashfree", '{"a":1}', String(Date.now())); ok(g.ok && g.key, "first delivery passes"); g = await RP.guard(env, "cashfree", '{"a":1}', String(Date.now())); ok(g.ok, "not marked until processed (a provider retry after a failure is still processed)");
await RP.mark(env, "cashfree", g.key); g = await RP.guard(env, "cashfree", '{"a":1}', String(Date.now())); ok(!g.ok && g.duplicate, "after a successful processing the same delivery is a duplicate"); g = await RP.guard(env, "razorpay", '{"a":1}', null); ok(g.ok, "keys are per provider");
ok(/RP\.guard\(env, "cashfree"/.test(fs.readFileSync(new URL("../functions/api/account/[[path]].js", import.meta.url), "utf8")) && /RP\.mark\(env, "razorpay"/.test(fs.readFileSync(new URL("../functions/api/account/[[path]].js", import.meta.url), "utf8")), "both payment webhooks use the guard after the signature check");

/* ---------- 13. router hygiene + UI wiring ---------- */
ok(ROUTES.every((x) => x[2] === "self" || (x[2] && REGISTRY[x[2].resource] && REGISTRY[x[2].resource][x[2].action])), "every route declares a valid permission"); ok(ROUTES.filter((x) => x[2] === "self").length <= 8, "no more than 8 self routes");
{ const ui = fs.readFileSync(new URL("../js/ws-os.js", import.meta.url), "utf8"); const paths = new Set(); for (const m of ui.matchAll(/oapi\("([a-z\-]+(?:\/[a-z\-]+)*)/g)) paths.add(m[1]); for (const m of ui.matchAll(/"([a-z\-]+(?:\/[a-z\-]+)?)\/" \+ [a-zA-Z.]+ \+ "\/([a-z\-]+(?:\/[a-z\-]+)?)"/g)) paths.add(m[1] + "/x/" + m[2]); const routes = ROUTES.map((x) => x[1]); const missing = [...paths].filter((p) => !routes.some((re) => re.test(p) || re.test(p.replace(/\/x\//, "/abc123/")) || re.test(p + "/abc") || re.source.indexOf("^" + p.replace(/\//g, "\\/") + "\\/") === 0)); ok(missing.length === 0, "ws-os.js calls only routes the router has" + (missing.length ? ": " + missing.join(", ") : "")); ok(/"os-finance": osFinance/.test(ui) && /expenses: expenses/.test(ui), "ws-os.js renders the Finance and Expenses views"); ok(!/\bworker\b/i.test(ui) && !/—/.test(ui), "no 'worker', no long dash"); }
console.log(`\nv50.4: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
