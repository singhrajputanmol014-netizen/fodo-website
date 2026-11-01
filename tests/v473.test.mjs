// v47.3: contracts (versions, signing, amendments, cancellation calculator), project workspace from the contract, team
// settlement, payouts per professional, Cashfree Easy Split adapter, append-only ledger, invoices + credit notes, reconciliation.
// Run: node --no-warnings tests/v473.test.mjs
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as admin } from "../functions/api/admin/[[path]].js";
import { onRequest as xray } from "../functions/api/xray/[[path]].js";
import { onRequest as brain } from "../functions/api/owner-brain/[[path]].js";
import { onRequest as bizApi } from "../functions/api/biz/[[path]].js";
import { onRequest as sitesApi } from "../functions/api/sites/[[path]].js";
import { fundMilestone } from "../functions/_lib/biz.js";
import { priceIt, PRICING_DEFAULTS } from "../functions/_lib/production.js";
import { ROLES, EQUIPMENT, TEMPLATES } from "../functions/_lib/catalog-seed.js";
import { TOOLS } from "../functions/_lib/brain/tools.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
console.log = ((orig) => (...a) => { if (typeof a[0] === "string" && a[0].charAt(0) === "{" && !process.env.DBG) return; orig(...a); })(console.log);
console.error = () => {};
function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, a = []) => ({ bind: (...x) => st(sql, x.map((v) => v === undefined ? null : v)), run: async () => { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }), _x: () => db.prepare(sql).run(...a) });
  return { db, prepare: (s) => st(s), batch: async (l) => l.map((s) => (s._x(), { success: true })) };
}
const SITE = "https://www.fodo.co.in", jars = {}, H = { account, admin, xray, "owner-brain": brain };
const call = async (path, body, o = {}) => {
  const who = o.as || "a", h = Object.keys(H).filter((k) => path.indexOf(k + "/") === 0)[0] || "account", p = h === "account" ? path : path.slice(h.length + 1);
  const method = o.method || (body !== undefined ? "POST" : "GET");
  const req = new Request(SITE + "/api/" + h + "/" + p, { method, headers: Object.assign({ origin: SITE, "cf-connecting-ip": "9.9.9.9" }, body !== undefined ? { "content-type": "application/json" } : {}, jars[who] ? { cookie: jars[who] } : {}, o.headers || {}), body: body === undefined ? undefined : JSON.stringify(body) });
  const r = await H[h]({ request: req, env, params: { path: p.split("?")[0].split("/") } }); const sc = r.headers.get("set-cookie"); if (sc && h === "account") jars[who] = sc.split(";")[0];
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} all.push(t); return { status: r.status, j, t };
};
const all = [];
const login = (email, plan, who) => call("test-login", Object.assign({ email }, plan ? { plan } : {}), { as: who });
const calls = []; let cfStatus = "RECEIVED", cfCheck = "SUCCESS", rzStatus = "processing", rzCheck = "processed", cfFail = false;
globalThis.fetch = async (u, o = {}) => { u = String(u); const J = (x, s) => new Response(JSON.stringify(x), { status: s || 200, headers: { "content-type": "application/json" } }); const b = o.body ? JSON.parse(o.body) : null;
  if (/cashfree\.com\/payout\/beneficiary/.test(u)) { calls.push({ p: "cf-bene", b, h: o.headers }); return calls.filter((c) => c.p === "cf-bene").length > 1 ? J({ message: "exists" }, 409) : J({ beneficiary_id: b.beneficiary_id }); }
  if (/cashfree\.com\/payout\/transfers\?/.test(u)) { calls.push({ p: "cf-get", u }); return J({ status: cfCheck, cf_transfer_id: 991 }); }
  if (/cashfree\.com\/payout\/transfers/.test(u)) { calls.push({ p: "cf-tx", b, h: o.headers }); if (cfFail) return J({ message: "Beneficiary bank account invalid" }, 422); return J({ cf_transfer_id: 991, transfer_id: b.transfer_id, status: cfStatus }); }
  if (/api\.razorpay\.com\/v1\/payouts\//.test(u)) { calls.push({ p: "rz-get", u }); return J({ id: "pout_1", status: rzCheck }); }
  if (/api\.razorpay\.com\/v1\/payouts/.test(u)) { calls.push({ p: "rz-tx", b, h: o.headers }); return J({ id: "pout_1", status: rzStatus }); }
  if (/easy-split\/orders\/[^/]+\/split/.test(u)) { calls.push({ p: "split", u, b, h: o.headers }); return J({ status: "OK", message: "Order split created" }); }
  if (/cashfree\.com\/pg\/orders\/[^/]+\/refunds\/[^/]+$/.test(u) && (o.method || "GET") === "GET") { calls.push({ p: "cf-rf-get", u }); return J({ refund_status: cfRefundCheck, cf_refund_id: 5511 }); }
  if (/cashfree\.com\/pg\/orders\/[^/]+\/refunds/.test(u)) { calls.push({ p: "cf-rf", u, b, idem: (o.headers || {})["x-idempotency-key"] }); return J({ cf_refund_id: 5511, refund_id: b.refund_id, refund_status: cfRefundStart }); }
  return new Response("x", { status: 599 }); };
let cfRefundStart = "PENDING", cfRefundCheck = "SUCCESS";
const KV = new Map(), CHAT_KV = { get: async (k) => KV.get(k) || null, put: async (k, v) => { KV.set(k, v); }, getWithMetadata: async (k) => ({ value: KV.get(k) || null, metadata: null }), delete: async (k) => KV.delete(k), list: async () => ({ keys: [] }) };
const env = { XRAY_DB: d1(), CHAT_KV, ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", MAIL_FROM: "FODO <hello@fodo.co.in>", SITES_HOST: "sites.fodo.co.in", SITES_PROJECT: "fodo-sites" };
H.biz = bizApi; H.sites = sitesApi;
const Z = (p, body, who, o) => call("biz/" + p, body, Object.assign({ as: who || "c" }, o || {}));
const q1 = (sql, ...a) => env.XRAY_DB.db.prepare(sql).get(...a);
await login("anmol@fodo.co.in", null, "own"); await login("client@biz.in", null, "c"); await login("pro@studio.in", null, "p"); await login("fin@fodo.co.in", null, "fin"); await login("other@biz.in", null, "o");
await Z("admin/staff", { email: "fin@fodo.co.in", role: "finance" }, "own");
const inv = (await Z("admin/invites", { note: "p", maxUses: 1 }, "own")).j.token;
await Z("pro", { invite: inv, name: "Aarav Films", role: "Cinematographer", skills: "reels", city: "Delhi", onsite: true, langs: "Hindi", bio: "Professional for restaurants and cafes in Delhi NCR. Short-form reels and brand films.", days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], rateDay: 18000, terms: true }, "p");
await Z("pro/packages", { name: "Pack", price: 15000 }, "p"); await Z("pro/portfolio", { kind: "video", title: "Film", url: "https://vimeo.com/1" }, "p"); await Z("pro/submit", {}, "p"); const proId = (await Z("pro", undefined, "p")).j.pro.id; await Z("admin/pros/" + proId, { action: "approve" }, "own");
const mkPayout = async (amount) => { const pid = (await Z("projects", { proId, title: "Job " + amount, brief: "A project for the payout tests" })).j.project.id; await Z("projects/" + pid + "/propose", { milestones: [{ title: "Work", amount }] }, "p"); await Z("projects/" + pid + "/accept", {});
  const m = (await Z("projects/" + pid)).j.project.milestones[0]; await fundMilestone(env, m.id, "o_" + amount); await Z("projects/" + pid + "/submit", { milestoneId: m.id, note: "done" }, "p"); await Z("projects/" + pid + "/approve", { milestoneId: m.id }); return q1("SELECT id, net FROM biz_payouts WHERE milestone_id=?", m.id); };

const today = new Date().toISOString();
const order = (id, amount) => env.XRAY_DB.db.prepare("INSERT INTO acct_orders (order_id, user_id, kind, item, amount, status, cf_order_id, created_at, paid_at) VALUES (?,?,?,?,?,?,?,?,?)").run(id, "u", "milestone", "x", amount, "PAID", "12345", today, today);
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
let r;

/* more professionals */
const mkPro = async (who, email, o) => { await login(email, null, who); const iv = (await Z("admin/invites", { note: who, maxUses: 1 }, "own")).j.token;
  await Z("pro", Object.assign({ invite: iv, langs: "Hindi", bio: "Professional crew member for brand shoots and commercials in India.", days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], terms: true }, o), who);
  await Z("pro/packages", { name: "Day", price: 10000 }, who); await Z("pro/portfolio", { kind: "video", title: "Work", url: "https://vimeo.com/2" }, who); await Z("pro/submit", {}, who); const id = (await Z("pro", undefined, who)).j.pro.id; await Z("admin/pros/" + id, { action: "approve" }, "own"); return id; };
const p2 = await mkPro("p2", "producer@crew.in", { name: "Riya Productions", role: "Producer", city: "Delhi", onsite: true, rateDay: 15000 });
const p3 = await mkPro("p3", "dop@mumbai.in", { name: "Kabir Lens", role: "Cinematographer", city: "Mumbai", onsite: true, rateDay: 30000 });
const p4 = await mkPro("p4", "edit@remote.in", { name: "Neha Cuts", role: "Video Editor", city: "Pune", remote: true, rateDay: 9000 });
const p5 = await mkPro("p5", "dop2@delhi.in", { name: "Arjun Frames", role: "Cinematographer", city: "Delhi", onsite: true, rateDay: 25000 });
await Z("admin/catalog/equipment", { id: "fx6", qty: 1, reason: "FODO owns one FX6" }, "own");
const D1 = day(12);
/* a quote the client accepts → a team */
const mkTeam = async (date, days, who) => { const q0 = (await Z("admin/quotes", { clientEmail: "client@biz.in", templateId: "custom", answers: { promote: "Brand film shoot", city: "Delhi", date, shoot_days: days, mode: "onsite" }, tier: "essential", custom: { roles: [{ id: "dop", qty: 1 }, { id: "producer", qty: 1 }, { id: "editor", qty: 1, basis: "post", units: 2 }], equipment: [{ id: "fx6", qty: 1 }] } }, "own")).j.quote;
  await Z("admin/quotes/" + q0.id + "/send", {}, "own"); await Z("quotes/" + q0.id, undefined, who || "c"); const a = await Z("quotes/" + q0.id + "/accept", { version: 1, agree: true }, who || "c"); return { q: q0, a }; };
/* staff a team and lock it */
const staffAll = async (tid) => { const T = (await Z("admin/teams/" + tid, undefined, "own")).j, pick = { DOP: [proId, "p"], Producer: [p2, "p2"], Editor: [p4, "p4"] };
  for (const s of T.slots) { const k = Object.keys(pick).find((x) => s.role.indexOf(x) > -1); await Z("admin/teams/" + tid + "/invite", { slot: s.slot, proId: pick[k][0] }, "own"); const my = (await Z("pro/teams", undefined, pick[k][1])).j.items.find((x) => x.status === "invited" && x.team.id === tid); await Z("pro/teams/" + my.id + "/accept", {}, pick[k][1]); }
  return (await Z("admin/teams/" + tid + "/lock", {}, "own")).j; };
const Q1 = await mkTeam(D1, 2), T1 = (await Z("admin/teams", undefined, "own")).j.items[0].id;
r = await Z("admin/teams/" + T1 + "/contract", {}, "own"); ok(r.status === 409 && /Lock the team/.test(r.j.reason), "no contract before the team is locked");
let TLK = await staffAll(T1); ok(TLK.team.status === "locked", "team staffed (DOP, producer, editor) and locked");
const fees = Object.fromEntries(TLK.slots.map((s) => [s.pro.id, s.fee])); ok(fees[proId] === 70000 && fees[p2] === 36000 && fees[p4] === 24000, "agreed fees: DOP ₹70,000 · producer ₹36,000 · editor ₹24,000");
r = await Z("admin/teams/" + T1 + "/contract", {}, "fin"); ok(r.status === 403, "finance can't prepare contracts");
r = await Z("admin/teams/" + T1 + "/contract", {}, "own"); let C = r.j.contract;
ok(C.status === "draft" && /^CT-\d{4}-0001$/.test(C.number) && C.data.team.length === 3 && C.data.clauses.length >= 8 && C.internal.members.length === 3, "contract drafted: " + C.number + ", team named, clauses, internal fee split");
ok(C.data.schedule.length === 2 && C.data.schedule[0].amount + C.data.schedule[1].amount === C.data.price.total && C.data.team.every((x) => Object.keys(x).join() === "role,name") && !("members" in C.data), "payment plan adds up to the total; the client document names the team without individual fees");
r = await Z("admin/teams/" + T1 + "/contract", {}, "own"); ok(r.j.contract.id === C.id, "one contract per team");
r = await Z("contracts/" + C.id); ok(r.status === 404, "an unsent contract stays private");
r = await Z("admin/contracts/" + C.id + "/send", {}, "own"); ok(r.j.contract.status === "sent", "sent for signature");
r = await Z("notes"); ok(r.j.items.some((n) => /ready to review and sign/.test(n.text)), "client notified");
r = await Z("contracts/" + C.id, undefined, "o"); ok(r.status === 404, "another client can't open it");
r = await Z("contracts/" + C.id); ok(r.j.contract.data.title && !r.j.contract.internal, "client reads the contract (no internal data)");
r = await Z("quotes/" + Q1.q.id + "/contract"); ok(r.j.contract.id === C.id, "linked from the accepted quote");
r = await Z("contracts/" + C.id + "/sign", { version: 1, name: "Rohit Client" }); ok(r.status === 400, "signing needs the agreement tick");
r = await Z("contracts/" + C.id + "/sign", { version: 1, agree: true, name: "R" }); ok(r.status === 400, "…and a typed full name");
r = await Z("contracts/" + C.id + "/sign", { version: 2, agree: true, name: "Rohit Client" }); ok(r.status === 409, "…of the version that was sent");
r = await Z("contracts/" + C.id + "/sign", { version: 1, agree: true, name: "Rohit Client" }, "o"); ok(r.status === 404, "only the client signs");
r = await Z("contracts/" + C.id + "/sign", { version: 1, agree: true, name: "Rohit Client" }); C = r.j.contract;
ok(C.status === "accepted" && C.acceptedVersion === 1 && C.projectId, "client signs → project workspace opened");
const meta = JSON.parse(q1("SELECT accept_meta FROM biz_contracts WHERE id=?", C.id).accept_meta); ok(meta.name === "Rohit Client" && meta.ipHash && meta.termsVersion, "signature: typed name, user, time, version, IP hash, terms version");
r = await Z("contracts/" + C.id + "/sign", { version: 1, agree: true, name: "Rohit Client" }); ok(r.status === 409, "can't sign twice");
const PID = C.projectId; let P = (await Z("projects/" + PID)).j.project;
ok(P.kind === "contract" && P.status === "accepted" && P.milestones.length === 2 && P.milestones.every((m) => m.status === "pending" && m.kind === "contract"), "project: 2 milestones from the payment plan, ready to pay");
ok(P.team.length === 3 && q1("SELECT status FROM biz_teams WHERE id=?", T1).status === "active", "the whole team is on the project; team is active");
let PP = (await Z("projects/" + PID, undefined, "p4")).j.project; ok(PP.side === "pro" && PP.budget === null && PP.milestones.every((m) => m.amount === null), "team members see the work, never the client price");
r = await Z("projects/" + PID + "/propose", { milestones: [{ title: "x", amount: 100 }] }, "p2"); ok(r.status === 409 && /contract/.test(r.j.reason), "milestones can't be re-proposed: they come from the contract");
const lead = P.pro.id; ok(lead === p2, "the producer leads the project");
/* pay + approve milestone 1 (with Cashfree Easy Split on) */
const M1 = P.milestones[0], M2 = P.milestones[1]; order("ord_c1", M1.amount); await fundMilestone(env, M1.id, "ord_c1");
ok(q1("SELECT amount FROM biz_ledger WHERE kind='payment' AND ref_id=?", M1.id).amount === M1.amount, "payment recorded in the ledger");
const inv1 = q1("SELECT * FROM biz_invoices WHERE milestone_id=? AND kind='invoice'", M1.id); ok(inv1 && /^FI-\d{4}-0001$/.test(inv1.number) && inv1.title === "Payment receipt" && inv1.total === M1.amount && inv1.tax === 0, "receipt FI-…-0001 issued (no GSTIN → payment receipt, no tax)");
r = await call("biz/invoices/" + inv1.id + "/print", undefined, { as: "c" }); ok(r.status === 200 && /Payment receipt/.test(r.t) && /FEAR OF DIGITALLY OUT \?/.test(r.t) && /not a tax invoice/.test(r.t), "printable receipt");
r = await call("biz/invoices/" + inv1.id + "/print", undefined, { as: "o" }); ok(r.status === 404, "other clients can't open it");
r = await Z("invoices?project=" + PID); ok(r.j.items.length === 1, "client lists the project's invoices");
await Z("admin/vendors/" + proId, { vendorId: "V_AARAV" }, "own"); await Z("admin/vendors/" + p2, { vendorId: "V_RIYA" }, "own"); await Z("admin/vendors/" + p4, { vendorId: "V_NEHA" }, "own");
r = await Z("admin/vendors/" + p4, { vendorId: "bad id!" }, "own"); ok(r.status === 400, "vendor ids are validated");
env.CASHFREE_SPLIT_ON = "1"; env.CASHFREE_APP_ID = "CFAPP"; env.CASHFREE_SECRET_KEY = "cf_SECRET_key";
await Z("projects/" + PID + "/submit", { milestoneId: M1.id, note: "Shoot done" }, "p2"); r = await Z("projects/" + PID + "/approve", { milestoneId: M1.id });
const S1 = q1("SELECT * FROM biz_settlements WHERE milestone_id=?", M1.id), L1 = env.XRAY_DB.db.prepare("SELECT * FROM biz_settlement_lines WHERE settlement_id=?").all(S1.id);
const share = (pid, L) => L.filter((l) => l.pro_id === pid).reduce((a, l) => a + l.amount, 0), ratio = M1.amount / C.data.price.total;
ok(S1 && S1.amount === M1.amount && L1.reduce((a, l) => a + l.amount, 0) === M1.amount, "client approves → milestone 1 settled; the lines add up to the milestone");
ok(share(proId, L1) === Math.round(70000 * ratio) && share(p2, L1) === Math.round(36000 * ratio) && share(p4, L1) === Math.round(24000 * ratio), "each professional gets their fee × the milestone's share (" + Math.round(ratio * 100) + "%)");
ok(L1.some((l) => l.kind === "partner") && L1.find((l) => l.kind === "fodo").amount > 0, "equipment partners and FODO (fee, contingency, margin) get the rest");
const sp = calls.find((x) => x.p === "split"); ok(sp && /easy-split\/orders\/ord_c1\/split/.test(sp.u) && sp.b.split.length === 3 && sp.b.split.some((x) => x.vendor_id === "V_AARAV" && x.amount === share(proId, L1)) && sp.h["x-idempotency-key"] === S1.id, "Cashfree Easy Split called with each vendor's share (idempotent)");
let PO = env.XRAY_DB.db.prepare("SELECT * FROM biz_payouts WHERE source_milestone=?").all(M1.id); ok(PO.length === 3 && PO.every((x) => x.status === "via_split" && x.commission === 0 && /Shoot|Booking|·/.test(x.label)), "3 payouts (one per professional), marked 'via split'");
r = await Z("admin/payouts/" + PO[0].id + "/send", {}, "fin"); ok(r.status === 409, "a share paid by Easy Split can't be sent again by the payout adapter");
r = await Z("admin/payouts/" + PO[0].id, { ref: "UTR12345" }, "fin"); ok(r.status === 409, "…or marked paid by hand (no double payment)");
ok(q1("SELECT status FROM biz_settlements WHERE id=?", S1.id).status === "split_requested", "settlement: split requested at Cashfree");
r = await Z("projects/" + PID + "/approve", { milestoneId: M1.id }); ok(r.status === 409 && env.XRAY_DB.db.prepare("SELECT count(*) n FROM biz_settlements WHERE milestone_id=?").get(M1.id).n === 1, "approving twice changes nothing (settled once)");
r = await Z("pro/earnings", undefined, "p4"); ok(r.j.items.some((x) => x.status === "via_split" && /Editor|Video Editor/.test(x.title)), "the editor sees their share in Earnings");
env.CASHFREE_SPLIT_ON = ""; env.CASHFREE_APP_ID = ""; env.CASHFREE_SECRET_KEY = "";
/* amendment: +₹20,000, ₹12,000 of it to the editor */
const memE = (await Z("admin/contracts/" + C.id, undefined, "own")).j.contract.internal.members.find((m) => m.proId === p4).memberId;
r = await Z("admin/contracts/" + C.id + "/amend", { note: "Two extra reels", amountChange: 20000, allocation: [{ memberId: memE, amount: 25000 }] }, "own"); ok(r.status === 400, "can't allocate more than the amendment adds");
r = await Z("admin/contracts/" + C.id + "/amend", { note: "Two extra reels", amountChange: 20000, allocation: [{ memberId: memE, amount: 12000 }] }, "own"); C = r.j.contract;
ok(C.latestVersion === 2 && C.status === "accepted" && C.version === 2 && C.kind === "amendment", "amendment drafted as version 2 (the signed v1 stays)");
const v1 = JSON.parse(q1("SELECT data FROM biz_contract_versions WHERE contract_id=? AND version=1", C.id).data); ok(!v1.amendments && v1.price.total === Math.round(v1.price.total), "version 1 unchanged");
await Z("admin/contracts/" + C.id + "/send", {}, "own"); r = await Z("contracts/" + C.id); ok(r.j.contract.status === "amendment_pending" && r.j.contract.kind === "amendment" && r.j.contract.amountChange === 20000, "client sees the amendment to sign");
r = await Z("contracts/" + C.id + "/sign", { version: 2, agree: true, name: "Rohit Client" }); ok(r.j.contract.acceptedVersion === 2, "client signs the amendment");
P = (await Z("projects/" + PID)).j.project; const MA = P.milestones.find((m) => /^Amendment/.test(m.title)); ok(MA && MA.amount === 20000 && MA.status === "pending" && P.budget === C.data.price.total, "a new ₹20,000 milestone; budget updated");
/* milestone 2: partial refund → the rest is split */
order("ord_c2", M2.amount); await fundMilestone(env, M2.id, "ord_c2");
r = await Z("projects/" + PID + "/refund_process", { milestoneId: M2.id, amount: 10000, reason: "One location dropped" }, "fin"); let rf = r.j.project.refunds[0]; ok(rf.status === "needs_manual", "partial refund of milestone 2 approved (no gateway here → finance sends it)");
r = await Z("projects/" + PID + "/refund_manual", { refundId: rf.id, ref: "UTR-REF-777" }, "fin");
const S2 = q1("SELECT * FROM biz_settlements WHERE milestone_id=?", M2.id), L2 = env.XRAY_DB.db.prepare("SELECT * FROM biz_settlement_lines WHERE settlement_id=?").all(S2.id);
ok(S2 && S2.amount === M2.amount - 10000 && L2.reduce((a, l) => a + l.amount, 0) === S2.amount, "after the refund is confirmed, the unrefunded ₹" + (M2.amount - 10000) + " is settled across the team");
ok(q1("SELECT amount FROM biz_ledger WHERE kind='refund' AND ref_id=?", rf.id).amount === 10000, "refund in the ledger");
const cn = q1("SELECT * FROM biz_invoices WHERE refund_id=? AND kind='credit_note'", rf.id), inv2 = q1("SELECT * FROM biz_invoices WHERE milestone_id=? AND kind='invoice'", M2.id); ok(cn && /^CN-/.test(cn.number) && cn.total === 10000 && cn.related_id === inv2.id && q1("SELECT status FROM biz_invoices WHERE id=?", inv2.id).status === "partly_credited", "credit note CN-… against the milestone's receipt");
/* amendment milestone: fund + approve → editor 12,000 + FODO 8,000; project completes */
order("ord_c3", 20000); await fundMilestone(env, MA.id, "ord_c3"); await Z("projects/" + PID + "/submit", { milestoneId: MA.id, note: "Reels" }, "p2"); r = await Z("projects/" + PID + "/approve", { milestoneId: MA.id });
const S3 = q1("SELECT * FROM biz_settlements WHERE milestone_id=?", MA.id), L3 = env.XRAY_DB.db.prepare("SELECT * FROM biz_settlement_lines WHERE settlement_id=?").all(S3.id);
ok(share(p4, L3) === 12000 && L3.find((l) => l.kind === "fodo").amount === 8000, "amendment settled as agreed: editor ₹12,000, FODO ₹8,000");
ok(r.j.project.status === "completed" && q1("SELECT status FROM biz_contracts WHERE id=?", C.id).status === "completed" && q1("SELECT status FROM biz_teams WHERE id=?", T1).status === "completed", "all milestones done → project, contract and team completed");
ok(q1("SELECT done_n FROM biz_pros WHERE id=?", p4).done_n >= 1 && q1("SELECT done_n FROM biz_pros WHERE id=?", proId).done_n >= 1, "every team member's completed count goes up");
/* ledger is append-only */
let thr = null; try { env.XRAY_DB.db.prepare("UPDATE biz_ledger SET amount=1").run(); } catch (e) { thr = e; } ok(thr && /append-only/.test(thr.message), "the database refuses to change a ledger row");
thr = null; try { env.XRAY_DB.db.prepare("DELETE FROM biz_ledger").run(); } catch (e) { thr = e; } ok(thr && /append-only/.test(thr.message), "…or delete one");
const F = await import("../functions/_lib/finance.js"); ok(await F.ledger(env, "payment", "client_receipts", "milestone", M1.id, PID, M1.amount, "again") === false && q1("SELECT count(*) n FROM biz_ledger WHERE kind='payment' AND ref_id=?", M1.id).n === 1, "the same money event is recorded once");
ok(await F.settle(env, M1.id, null, "x") === null, "a second settlement of the same milestone is refused");
/* payouts by hand → ledger; reconciliation */
const PO2 = env.XRAY_DB.db.prepare("SELECT * FROM biz_payouts WHERE source_milestone=? AND status!='via_split'").all(M2.id); for (const x of PO2) await Z("admin/payouts/" + x.id, { ref: "UTR-PO-" + x.id.slice(-6) }, "fin");
ok(q1("SELECT count(*) n FROM biz_ledger WHERE kind='payout'").n === PO2.length, "payouts paid by hand are in the ledger");
r = await Z("admin/reconciliation", undefined, "fin"); const RC = (id) => r.j.items.find((x) => x.milestone === id);
ok(RC(M1.id).status === "matched" && RC(M2.id).status === "matched", "reconciliation: milestones 1 and 2 matched (gateway = payment = settlement, payouts done)");
ok(RC(MA.id).status === "pending" && RC(MA.id).issues.some((x) => /payout/.test(x)), "the amendment milestone is pending: its payout isn't paid yet");
env.XRAY_DB.db.prepare("UPDATE acct_orders SET amount=? WHERE order_id='ord_c3'").run(19000); r = await Z("admin/reconciliation?status=mismatch", undefined, "fin"); ok(r.j.items.length === 1 && /19,000/.test(r.j.items[0].issues[0]), "a gateway amount that doesn't match is flagged as a mismatch");
r = await Z("admin/reconciliation", undefined, "c"); ok(r.status === 403, "clients can't see reconciliation");
r = await Z("admin/ledger", undefined, "fin"); ok(r.j.totals.client_receipts === M1.amount + M2.amount + 20000 && r.j.totals.client_refunds === 10000, "ledger totals: received and refunded");
r = await Z("admin/settlements", undefined, "fin"); ok(r.j.items.length === 3 && r.j.items.every((s) => s.lines.length >= 2), "settlements with their lines");
/* manual review: allocations bigger than the money */
const sl = q1("SELECT id FROM biz_settlements WHERE status='manual_review'"); ok(!sl, "no settlement needed review in this flow");
/* cancellation calculator on a second contract */
const Q2 = await mkTeam(day(30), 1), T2 = (await Z("admin/teams", undefined, "own")).j.items.find((t) => t.id !== T1).id; await staffAll(T2);
let C2 = (await Z("admin/teams/" + T2 + "/contract", {}, "own")).j.contract; await Z("admin/contracts/" + C2.id + "/send", {}, "own"); C2 = (await Z("contracts/" + C2.id + "/sign", { version: 1, agree: true, name: "Rohit Client" })).j.contract;
const P2 = (await Z("projects/" + C2.projectId)).j.project, B1 = P2.milestones[0]; order("ord_d1", B1.amount); await fundMilestone(env, B1.id, "ord_d1");
r = await Z("admin/contracts/" + C2.id + "/cancellation", undefined, "fin"); ok(r.j.daysToStart === 30 && r.j.band.refundPct === 90 && r.j.heldNotApproved === B1.amount && r.j.refundable === Math.round(B1.amount * 0.9) && /lawyer/.test(r.j.legalReview), "cancellation 30 days out: 90% of the held booking payment, from the policy in the signed contract");
r = await Z("admin/contracts/" + C2.id + "/cancel", { reason: "x" }, "own"); ok(r.status === 409, "a signed contract isn't 'cancelled' with a click: use the calculator + refunds");
r = await Z("admin/contracts/" + C2.id + "/amend", { note: "Remove a day of shoot", amountChange: -99999999 }, "own"); ok(r.status === 409 && /unpaid/.test(r.j.reason), "a reduction can only come off unpaid milestones");
r = await Z("admin/contracts/" + C2.id + "/amend", { note: "Remove the second reel", amountChange: -5000 }, "own"); await Z("admin/contracts/" + C2.id + "/send", {}, "own"); await Z("contracts/" + C2.id + "/sign", { version: 2, agree: true, name: "Rohit Client" });
ok(q1("SELECT amount FROM biz_milestones WHERE id=?", P2.milestones[1].id).amount === P2.milestones[1].amount - 5000, "a signed reduction comes off the unpaid milestone");
/* printable contract, UI, Brain */
r = await call("biz/contracts/" + C.id + "/print", undefined, { as: "c" }); ok(/Contract CT-/.test(r.t) && /Cancellation policy/.test(r.t) && /Signed electronically/.test(r.t) && !/70,000|36,000/.test(r.t), "printable contract (no individual fees)");
const WS = fs.readFileSync("js/workspace.js", "utf8"), FJ = fs.readFileSync("js/ws-finance.js", "utf8"); ok(/ws-finance\.js/.test(WS) && /"finance"/.test(WS) && /contract=/.test(WS) && /admin\/reconciliation/.test(FJ) && /admin\/ledger/.test(FJ) && /\/sign/.test(FJ) && /admin\/settlements/.test(FJ) && /amend/.test(FJ), "UI: client contract + sign, admin Contracts & money (lazy)");
const { TOOLS: TL } = await import("../functions/_lib/brain/tools.js"), bctx = { env, owner: { email: "anmol@fodo.co.in", id: q1("SELECT id FROM acct_users WHERE email='anmol@fodo.co.in'").id } };
let bt = await TL.marketplace_finance_summary.run(bctx, {}); ok(bt.label === "REAL DATA (ledger)" && bt.received > 0 && bt.refunded === 10000 && bt.reconciliation.mismatch === 1, "Brain: finance summary from the ledger, with reconciliation");
bt = await TL.marketplace_contracts.run(bctx, {}); ok(bt.items.length === 2 && bt.items[0].id, "Brain: contracts");
bt = await TL.marketplace_cancellation.run(bctx, { id: C2.id }); ok(/CALCULATION/.test(bt.label) && bt.refundable > 0, "Brain: cancellation calculation (no money moved)");
ok(["marketplace_finance_summary", "marketplace_contracts", "marketplace_cancellation"].every((k) => TL[k].level === 0) && !Object.keys(TL).some((k) => /contract_sign|contract_amend|settle/.test(k)), "Brain money tools are read-only");
ok(all.every((t) => !/cf_SECRET_key/.test(t)), "no secrets in any answer");
console.log("\nv47.3: " + pass + " passed, " + fail + " failed"); if (fail) process.exit(1);
