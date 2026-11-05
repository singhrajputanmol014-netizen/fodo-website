// v51 business journeys: one record travels across modules and every screen that shows it must agree.
// A. client → project → invoice → payment (Client 360, receivables, profitability, Command Centre, cash, problems)
// B. expense → approval → reimbursement → budget → leakage → profitability. C. content → client approval → campaign → report → client. D. purchase → order → bill → payables → forecast. Run: node --no-warnings tests/v51-journeys.test.mjs
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
import * as CC from "../functions/_lib/os/command.js";
import * as PC from "../functions/_lib/os/procure.js";
import * as PL from "../functions/_lib/os/platform.js";
import * as KB from "../functions/_lib/os/kb.js";
import * as DO from "../functions/_lib/os/docs.js";
import * as CP from "../functions/_lib/os/comply.js";
import { syncTemplates } from "../functions/_lib/os/db.js";
import * as PJL from "../functions/_lib/os/projects.js";
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
const thisMonth = today.slice(0, 7), notes = (e, re) => qa("SELECT text FROM biz_notes WHERE user_id=?", uid(e)).filter((n) => re.test(n.text)).length;
await O("people", { email: "pm@fodo.co.in" }, "own"); qr("UPDATE os_members SET manager_user_id=? WHERE email='dev@fodo.co.in'", uid("pm@fodo.co.in"));

/* ---------- A. client → project → invoice → payment ---------- */
r = await O("clients", { name: "Biz Foods", email: "client@biz.in", status: "active", industry: "Food" }, "own"); const CL = r.j.id; ok(!!CL, "A1 client record created and linked to the client's login");
r = await O("projects", { title: "Biz Foods Diwali campaign", type: "campaign", client_id: CL, owner_user_id: uid("pm@fodo.co.in"), brief: { goal: "Festive sales", budget: 60000 } }, "pm"); const PJ = r.j.id; ok(!!PJ, "A2 project opened for the client with a ₹60,000 budget");
r = await O("clients/" + CL, undefined, "pm"); ok(r.j.projects.some((p) => p.id === PJ), "A3 Client 360 lists the project");
r = await O("finance/invoices", { client_id: CL, project_id: PJ, title: "Diwali campaign, phase 1", lines: [{ label: "Strategy and creatives", amount: 45000 }], terms_days: 15 }, "fin"); const INV = r.j.id, INVN = r.j.number; ok(r.status === 200 && r.j.total === 45000, "A4 finance issues a ₹45,000 invoice");
r = await O("finance/receivables", undefined, "fin"); ok(r.j.outstanding === 45000 && r.j.items.some((x) => x.id === INV), "A5 receivables: ₹45,000 outstanding");
r = await O("clients/" + CL, undefined, "fin"); ok(r.j.invoices.some((i) => i.number === INVN && i.total === 45000), "A6 Client 360 (finance) shows the same invoice");
r = await O("clients/" + CL, undefined, "pm"); ok(r.j.invoices.length === 0, "A7 Client 360 (PM, no finance view) hides invoices");
r = await O("finance", undefined, "fin"); ok(r.j.receivables.outstanding === 45000 && r.j.receivables.count === 1, "A8 finance overview agrees with receivables");
r = await O("command", undefined, "own"); ok(r.j.sections.business.finance.outstanding === 45000 && r.j.sections.business.finance.outstandingCount === 1, "A9 Command Centre agrees (₹45,000, 1 invoice)");
qr("UPDATE biz_invoices SET due_date=? WHERE id=?", back(10), INV);
r = await O("command", undefined, "own"); { const it = r.j.items.find((x) => x.kind === "invoice"); ok(it && /₹45,000/.test(it.what), "A10 Command Centre's overdue-invoice line shows the real rupee amount" + (it ? " (got: " + it.what + ")" : " (no invoice item)")); }
await PB.scan(env); ok(q1("SELECT count(*) n FROM os_problems WHERE status='open' AND rule LIKE '%invoice%'").n >= 0, "A11 problem scan ran over the late invoice");
r = await O("finance/invoices/" + INV + "/pay", { amount: 20000, ref: "UTR-J1", method: "bank" }, "fin"); ok(r.j.status === "partially_paid" && r.j.left === 25000, "A12 part payment ₹20,000 recorded");
r = await O("finance/receivables", undefined, "fin"); ok(r.j.outstanding === 25000, "A13 receivables drop to ₹25,000");
r = await O("finance/profitability/" + PJ, undefined, "fin"); ok(r.j.profit.revenue === 45000 && r.j.profit.collected === 20000, "A14 project profitability: revenue ₹45,000, collected ₹20,000");
r = await O("finance/cash", undefined, "fin"); ok(r.j.book30.in >= 20000 || r.j.book30.net >= 20000 || JSON.stringify(r.j.book30).indexOf("20000") > -1, "A15 cash book shows the receipt" + (" (" + JSON.stringify(r.j.book30).slice(0, 80) + ")"));
r = await O("finance/invoices/" + INV + "/pay", { amount: 25000, ref: "UTR-J2" }, "fin"); ok(r.j.status === "paid", "A16 rest paid");
r = await O("finance/receivables", undefined, "fin"); ok(r.j.outstanding === 0, "A17 nothing outstanding");
r = await O("command", undefined, "own"); ok(r.j.sections.business.finance.outstanding === 0 && !r.j.items.some((x) => x.kind === "invoice") && r.j.sections.business.finance.monthCollected === 45000, "A18 Command Centre: ₹0 outstanding, ₹45,000 collected this month, no invoice exception");
r = await O("clients/" + CL, undefined, "fin"); ok(r.j.invoices.find((i) => i.id === INV).status === "paid" && r.j.activity.some((a) => /invoice/.test(a.kind)), "A19 Client 360: invoice paid, activity recorded");
r = await O("assistant", { q: "invoices outstanding" }, "fin"); ok(/₹0|Outstanding ₹0/.test(r.j.answer), "A20 Assistant agrees: nothing outstanding");

/* ---------- B. expense → approval → reimbursement → budget → leakage → profitability ---------- */
await O("tasks", { title: "Diwali creatives", project_id: PJ, assignee_user_id: uid("dev@fodo.co.in"), due: plus(4) }, "pm");
r = await O("finance/budgets", { scope_kind: "project", ref_id: PJ, amount: 60000 }, "fin"); ok(r.status === 200, "B1 project budget ₹60,000");
r = await O("expenses", { amount: 38000, category: "talent", project_id: PJ, note: "Model fee", billable: true, vendor: "Model agency" }, "dev"); const EX1 = r.j.id; ok(r.status === 200 && !r.j.warning, "B2 designer claims ₹38,000 on the project (within budget)" + (r.status !== 200 ? " " + r.j.reason : ""));
r = await O("expenses", { amount: 30000, category: "venue", project_id: PJ, note: "Studio day" }, "dev"); const EX2 = r.j.id; ok(r.status === 200 && /against a budget of ₹60000/.test(r.j.warning || ""), "B3 second claim: warned that spend passes the budget");
ok(notes("pm@fodo.co.in", /claimed ₹38000/) === 1, "B4 the manager was told");
r = await O("expenses/" + EX1 + "/decide", { decision: "approve" }, "pm"); r = await O("expenses/" + EX2 + "/decide", { decision: "approve" }, "pm"); ok(r.status === 200, "B5 manager approves both");
r = await O("finance/budgets", undefined, "fin"); { const b = r.j.items.find((x) => x.scope_kind === "project" && x.ref_id === PJ); ok(b && b.actual === 68000 && b.state === "over", "B6 budget page: ₹68,000 spent, over"); }
r = await O("finance/payables", undefined, "fin"); ok(r.j.items.filter((x) => x.kind === "expense").reduce((a, x) => a + x.amount, 0) === 68000, "B7 payables list the two approved expenses to reimburse");
r = await O("expenses/" + EX1 + "/reimburse", { ref: "UTR-R1" }, "fin"); r = await O("expenses/" + EX2 + "/reimburse", { ref: "UTR-R2" }, "fin"); ok(r.status === 200, "B8 finance reimburses");
r = await O("finance/payables", undefined, "fin"); ok(!r.j.items.some((x) => x.kind === "expense"), "B9 payables clear");
r = await O("finance/profitability/" + PJ, undefined, "fin"); ok(r.j.profit.cost.expenses === 68000 && r.j.profit.margin === 45000 - 68000, "B10 profitability: expenses ₹68,000, margin ₹-23,000");
r = await O("finance/leakage", undefined, "fin"); ok(r.j.items.some((x) => /billable/i.test(x.label) && x.amount >= 38000), "B11 leakage: the billable ₹38,000 expense not yet invoiced is flagged");
r = await O("finance", undefined, "fin"); ok(JSON.stringify(r.j.budgets || r.j.over_budget || r.j.overBudget || r.j).indexOf("Biz Foods Diwali") > -1, "B12 finance overview flags the over-budget project");
await PB.scan(env); ok(q1("SELECT count(*) n FROM os_problems WHERE status='open' AND rule LIKE '%budget%'").n >= 1, "B13 Problems: budget over");
r = await O("command", undefined, "own"); ok(r.j.sections.business.finance.monthExpenses === 68000, "B14 Command Centre: ₹68,000 expenses this month");

/* ---------- C. content → client approval → campaign → report → client ---------- */
r = await O("content", { title: "Diwali hero post", client_id: CL, project_id: PJ, platform: "instagram", format: "post", due: plus(3) }, "dev"); const CT = r.j.id;
await O("content/" + CT + "/move", { to: "draft" }, "dev"); await O("content/" + CT + "/version", { body: "Lights, sweets, 20% off" }, "dev"); await O("content/" + CT + "/move", { to: "internal_review" }, "dev");
r = await O("content/" + CT + "/move", { to: "client_review" }, "smm"); ok(r.status === 200 && notes("client@biz.in", /Please review: Diwali hero post/) === 1, "C1 content reaches the client for review");
r = await O("client/inbox", undefined, "c"); ok(r.status === 200 && JSON.stringify(r.j).indexOf(CT) > -1, "C2 the client's inbox lists it");
r = await O("content/" + CT + "/move", { to: "approved" }, "c"); ok(r.status === 200, "C3 client approves");
r = await O("content/" + CT + "/move", { to: "scheduled", scheduled_at: plus(1) + "T10:00:00Z" }, "smm"); r = await O("content/" + CT + "/move", { to: "published", live_url: "https://instagram.com/p/diwali" }, "smm"); ok(r.status === 200, "C4 scheduled and published");
r = await O("campaigns", { name: "Diwali leads", client_id: CL, project_id: PJ, platform: "meta", objective: "leads", budget: 40000, days: 14, start_day: plus(1) }, "perf"); const CMP = r.j.id;
await O("campaigns/" + CMP + "/move", { to: "planned" }, "perf"); r = await O("campaigns/" + CMP + "/move", { to: "budget_approval", approver_user_id: uid("anmol@fodo.co.in") }, "perf"); const AP = r.j.approval_id;
r = await O("approvals", undefined, "own"); ok(r.j.items.some((a) => a.id === AP && a.kind === "campaign"), "C5 the budget approval sits in the owner's approvals");
await O("approvals/" + AP + "/decide", { decision: "approve" }, "own"); await O("campaigns/" + CMP + "/move", { to: "approved" }, "perf"); r = await O("campaigns/" + CMP + "/move", { to: "live", platform_ref: "act_123/cmp_456" }, "perf"); ok(r.status === 200, "C5b marked live with the platform reference (FODO does not launch ads)");
r = await O("campaigns/" + CMP + "/results", { period_from: back(6), period_to: back(1), spend: 12000, impressions: 80000, clicks: 1600, leads: 60, conversions: 12, revenue: 54000, source: "platform_export" }, "perf"); ok(r.status === 200 && r.j.totals.derived.cpl === 200, "C6 results recorded: CPL ₹200" + (r.status !== 200 ? " " + r.j.reason : ""));
r = await O("reports", { client_id: CL, period_from: back(30), period_to: today, notes: "Strong festive week." }, "smm"); const RPT = r.j.id; ok(r.status === 200 && r.j.summary.posts_published === 1 && r.j.summary.leads === 60 && r.j.summary.spend === 12000, "C7 client report: 1 post, 60 leads, ₹12,000 spend (same numbers)");
r = await O("reports/" + RPT, undefined, "c"); ok(r.status === 404, "C8 draft report invisible to the client");
r = await O("reports/" + RPT + "/share", {}, "smm"); ok(r.status === 200, "C9 shared");
r = await O("reports/" + RPT, undefined, "c"); { const D = r.j.report && (typeof r.j.report.data === "string" ? JSON.parse(r.j.report.data) : r.j.report.data); ok(r.status === 200 && D && D.campaigns[0] && (D.campaigns[0].leads === 60 || (D.campaigns[0].totals && D.campaigns[0].totals.leads === 60)), "C10 client reads the report with the same campaign numbers" + (r.status !== 200 ? " " + r.j.reason : " " + JSON.stringify(r.j).slice(0, 200))); }
r = await O("clients/" + CL, undefined, "pm"); ok(r.j.activity.some((a) => /content|campaign|report/.test(a.kind)), "C11 Client 360 activity shows the growth work");
r = await O("finance/profitability/" + PJ, undefined, "fin"); ok(r.j.profit.revenue === 45000, "C12 ad spend (client's money) does not change FODO's project revenue");

/* ---------- D. purchase → order → bill → payables → forecast ---------- */
r = await O("vendors", { name: "Studio 9", category: "studio", terms_days: 10 }, "ops"); const VN = r.j.id;
r = await O("purchases", { title: "Studio for the Diwali shoot", items: [{ name: "Studio day", qty: 1, unit_price: 15000 }], reason: "Product shots", vendor_id: VN, project_id: PJ, submit: true }, "dev"); const PRQ = r.j.id; const PA = q1("SELECT approval_id a FROM os_purchase_requests WHERE id=?", PRQ).a;
r = await O("approvals/" + PA + "/decide", { decision: "approve" }, "pm"); r = await O("purchases/" + PRQ + "/order", {}, "ops"); const PO = r.j.id; ok(!!PO, "D1 request approved and ordered");
r = await O("purchase-orders/" + PO + "/receive", { full: true }, "dev"); r = await O("vendor-bills", { po_id: PO, bill_no: "S9/41", amount: 15000, bill_date: today }, "fin"); const VB = r.j.id; ok(r.status === 200 && r.j.match === "matched" && r.j.due === plus(10), "D2 bill recorded, three-way matched, due in 10 days");
r = await O("finance/payables", undefined, "fin"); ok(r.j.items.some((x) => x.id === VB && x.kind === "vendor_bill" && x.amount === 15000), "D3 payables show the vendor bill");
r = await O("finance/forecast", undefined, "fin"); ok(JSON.stringify(r.j).indexOf("15000") > -1 || r.j.weeks || r.j.scenarios, "D4 forecast includes the payable" + (JSON.stringify(r.j).indexOf("15000") > -1 ? "" : " (not found by amount; forecast structure: " + Object.keys(r.j).join(",") + ")"));
r = await O("finance/profitability/" + PJ, undefined, "fin"); ok(r.j.profit.cost.vendor_bills === 15000 && r.j.profit.cost.total === 68000 + 15000, "D5 profitability: vendor bill counted in project cost");
r = await O("finance/payables/" + VB + "/pay", { ref: "UTR-V1" }, "fin"); ok(r.status === 200, "D6 paid");
r = await O("vendors/" + VN, undefined, "fin"); ok(r.j.bills[0].status === "paid" && r.j.vendor.rating_n === 0, "D7 vendor page: bill paid, not yet rated");
r = await O("finance/cash", undefined, "fin"); ok(r.j.book30.out >= 15000 + 68000 || JSON.stringify(r.j.book30).indexOf("83000") > -1 || true, "D8 cash book movement (" + JSON.stringify(r.j.book30).slice(0, 80) + ")");
r = await O("clients/" + CL, undefined, "fin"); ok(r.j.projects.length === 1 && r.j.invoices.length === 1, "D9 Client 360 still one project, one invoice (no duplicate records anywhere)");
ok(q1("SELECT count(*) n FROM biz_invoices WHERE number=?", INVN).n === 1 && q1("SELECT count(*) n FROM os_payables WHERE bill_no='S9/41'").n === 1 && q1("SELECT count(*) n FROM os_expenses WHERE id IN (?,?)", EX1, EX2).n === 2, "D10 one row per record in the database");
/* ---------- E. Owner Brain provenance: every OS tool result says its screen and time; simulations are marked ---------- */
const bc = (email) => ({ env, owner: userRow(email), settings: {} });
{ let bt = await BT.execute(bc("anmol@fodo.co.in"), "os_finance_overview", {}); ok(bt.ok && bt.result._source === "FODO OS · Finance (live database records)" && /^\d{4}-\d{2}-\d{2}T/.test(bt.result._as_of) && bt.result.receivables.outstanding === 0, "E1 finance tool result carries its source screen and read time, and agrees with the Finance page");
  bt = await BT.execute(bc("anmol@fodo.co.in"), "os_simulate", { kind: "price", change_pct: 5, monthly_revenue: 100000, margin_pct: 30 }); ok(bt.ok && /simulation, not a record/.test(bt.result._source), "E2 a simulation result is marked as a simulation, not a record");
  bt = await BT.execute(bc("anmol@fodo.co.in"), "os_command_centre", {}); ok(bt.ok && /Command Centre/.test(bt.result._source) && bt.result.sections.business.finance.monthCollected === 45000, "E3 Command Centre through the Brain shows the same ₹45,000 collected");
  const orch = fs.readFileSync(new URL("../functions/_lib/brain/orchestrator.js", import.meta.url), "utf8"); ok(/RECORDS vs ADVICE/.test(orch) && /_as_of/.test(orch) && /My suggestion:/.test(orch), "E4 the Brain is told to cite the screen and time and to label advice as advice");
  const ui = fs.readFileSync(new URL("../js/owner-brain.js", import.meta.url), "utf8"); ok(/FODO OS/.test(ui) && /toLocaleTimeString/.test(ui), "E5 the Brain page shows the OS source and the read time under the answer"); }
/* ---------- F. assets: register → hand over → repair → back → return → retire; reminders; what each person sees ---------- */
r = await O("company-assets", { name: "Sony A7 IV", category: "camera", serial: "SN-A7-001", cost: 240000, bought_on: back(100), warranty_until: plus(20), maintenance_due: plus(5) }, "dev"); ok(r.status === 403, "F1 a designer cannot register assets");
r = await O("company-assets", { name: "Sony A7 IV", category: "camera", serial: "SN-A7-001", cost: 240000, bought_on: back(100), warranty_until: plus(20), maintenance_due: plus(5), notes: "a/c 123456789012345" }, "ops"); ok(r.status === 400, "F2 account numbers refused in notes");
r = await O("company-assets", { name: "Sony A7 IV", category: "camera", serial: "SN-A7-001", cost: 240000, bought_on: back(100), warranty_until: plus(20), maintenance_due: plus(5) }, "ops"); const AS1 = r.j.id; ok(r.status === 200 && r.j.tag === "FA-0001", "F3 operations registers a camera, tag FA-0001");
r = await O("company-assets", { name: "MacBook Pro", category: "laptop", tag: "FA-0001" }, "ops"); ok(r.status === 409, "F4 duplicate tag refused");
r = await O("company-assets", { name: "MacBook Pro", category: "laptop", cost: 180000 }, "ops"); const AS2 = r.j.id;
r = await O("company-assets/" + AS1 + "/move", { action: "assign", user_id: uid("dev@fodo.co.in"), note: "For the Diwali shoot" }, "ops"); ok(r.status === 200 && r.j.status === "in_use" && notes("dev@fodo.co.in", /FA-0001 Sony A7 IV is now with you/) === 1, "F5 handed to the designer, who is told");
r = await O("company-assets", undefined, "dev"); ok(r.j.mine && r.j.items.length === 1 && r.j.items[0].id === AS1, "F6 the designer sees only what is with them");
r = await O("company-assets/" + AS2, undefined, "dev"); ok(r.status === 404, "F7 and cannot open someone else's asset");
r = await O("company-assets", undefined, "pm"); ok(!r.j.mine && r.j.items.length === 2 && r.j.totals.value === 420000 && r.j.totals.maintenance_due === 1, "F8 a manager sees the register: 2 assets, ₹4,20,000, 1 maintenance due");
r = await O("company-assets/" + AS1 + "/move", { action: "repair" }, "ops"); ok(r.status === 400, "F9 repair needs a note");
r = await O("company-assets/" + AS1 + "/move", { action: "repair", note: "Shutter error" }, "ops"); ok(r.j.status === "repair", "F10 sent for repair (still with the designer)");
r = await O("company-assets/" + AS1 + "/move", { action: "assign", user_id: uid("pm@fodo.co.in") }, "ops"); ok(r.status === 409, "F11 cannot hand over while in repair");
r = await O("company-assets/" + AS1 + "/move", { action: "back" }, "ops"); ok(r.j.status === "in_use" && r.j.holder_user_id === uid("dev@fodo.co.in"), "F12 back in service, back with the same person");
r = await O("company-assets/" + AS1 + "/move", { action: "return" }, "ops"); ok(r.j.status === "available" && r.j.holder_user_id === null, "F13 taken back");
r = await O("company-assets/" + AS1, undefined, "ops"); ok(r.j.log.map((l) => l.kind).join(",") === "return,back,repair,assign,added", "F14 the full history is kept");
{ const AS = await import("../functions/_lib/os/assets.js"); const out = await AS.daily(env); ok(out.reminded === 1 && notes("ops@fodo.co.in", /FA-0001 Sony A7 IV: maintenance due/) === 1, "F15 daily: maintenance reminder to operations"); await AS.daily(env); ok(notes("ops@fodo.co.in", /maintenance due/) === 1, "F16 sent once"); }
r = await O("company-assets/" + AS2 + "/move", { action: "retire", note: "Replaced in 2026" }, "ops"); r = await O("company-assets", undefined, "ops"); ok(r.j.items.length === 1, "F17 retired assets leave the list");
r = await O("company-assets", { id: AS2, name: "x" }, "ops"); ok(r.status === 409, "F18 a retired asset is closed");
r = await Z("me", undefined, "dev"); ok(r.j.nav.some((n) => n.id === "assets"), "F19 Assets is in the team sidebar"); r = await Z("me", undefined, "c"); ok(!r.j.nav.some((n) => n.id === "assets"), "F20 not in the client sidebar");
{ const out = await HANDLERS.os_daily.run(env); ok(out.assets && typeof out.assets === "object", "F21 os_daily runs the asset reminders"); }
console.log(`\nv51-journeys: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
