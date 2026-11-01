// v47.1: refund state machine fix, production catalog (roles, equipment, templates), pricing engine, team builder engine,
// explainable matching, Project Builder drafts, versioned quotes (immutable once sent), formats, admin catalog, Brain tools.
// Run: node --no-warnings tests/v47.test.mjs
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

/* ---------- 1. refund state machine (the critical fix) ---------- */
env.CASHFREE_APP_ID = "CFAPP"; env.CASHFREE_SECRET_KEY = "cf_SECRET_key";
const mkFunded = async (amount, oid) => { const pid = (await Z("projects", { proId, title: "Refund " + amount, brief: "A project for the refund tests" })).j.project.id; await Z("projects/" + pid + "/propose", { milestones: [{ title: "Work", amount }] }, "p"); await Z("projects/" + pid + "/accept", {});
  const m = (await Z("projects/" + pid)).j.project.milestones[0]; if (oid) order(oid, amount); await fundMilestone(env, m.id, oid || "t_" + amount); return { pid, m }; };
const ms = (pid, id) => q1("SELECT status, refunded, pre_refund FROM biz_milestones WHERE id=?", id);
let A1 = await mkFunded(12000, "ord_rf_1");
r = await Z("projects/" + A1.pid + "/refund_process", { milestoneId: A1.m.id, amount: 5000, reason: "Half the work was done" }, "fin");
let rf = r.j.project.refunds[0];
ok(rf.status === "processing" && ms(A1.pid, A1.m.id).status === "refund_processing", "refund started: refund 'processing', milestone held as refund_processing (NOT refunded)");
ok(!q1("SELECT 1 x FROM biz_payouts WHERE milestone_id=?", A1.m.id), "no payout for the rest of a partial refund until the refund is confirmed");
r = await Z("projects/" + A1.pid + "/submit", { milestoneId: A1.m.id, note: "x" }, "p"); ok(r.status === 409, "a milestone with a refund in progress can't be submitted / approved / paid out");
r = await Z("projects/" + A1.pid + "/cancel", {}); ok(r.status === 409, "…nor the project cancelled");
r = await Z("projects/" + A1.pid + "/refund_check", { refundId: rf.id }, "c"); ok(r.status === 403, "clients can't run finance checks");
r = await Z("projects/" + A1.pid + "/refund_check", { refundId: rf.id }, "fin");
ok(r.j.project.refunds[0].status === "refunded" && ms(A1.pid, A1.m.id).status === "refunded" && ms(A1.pid, A1.m.id).refunded === 5000, "gateway confirms (Check status) → refunded, milestone refunded ₹5,000");
const po = q1("SELECT gross, net FROM biz_payouts WHERE milestone_id=?", A1.m.id); ok(po && po.gross === 7000 && po.net === 6300, "…and only now the unrefunded ₹7,000 becomes the pro's payout (₹6,300 after 10 %)");
r = await Z("projects/" + A1.pid + "/refund_check", { refundId: rf.id }, "fin"); ok(q1("SELECT count(*) n FROM biz_payouts WHERE milestone_id=?", A1.m.id).n === 1, "checking again changes nothing (idempotent)");
r = await Z("projects/" + A1.pid + "/refund_manual", { refundId: rf.id, ref: "UTR-AGAIN-1" }, "fin"); ok(r.status === 409, "a finished refund can't be marked again (no double money movement)");
/* failure restores */
let A2 = await mkFunded(8000, "ord_rf_2"); cfRefundCheck = "FAILED";
r = await Z("projects/" + A2.pid + "/refund_process", { milestoneId: A2.m.id, reason: "Client cancelled" }, "fin"); rf = r.j.project.refunds[0];
r = await Z("projects/" + A2.pid + "/refund_check", { refundId: rf.id }, "fin");
ok(r.j.project.refunds[0].status === "failed" && ms(A2.pid, A2.m.id).status === "funded" && !ms(A2.pid, A2.m.id).refunded, "gateway reports FAILED → refund failed, milestone back to 'funded' (original state restored)");
r = await Z("projects/" + A2.pid + "/submit", { milestoneId: A2.m.id, note: "delivered" }, "p"); ok(r.j.ok, "…and work continues normally");
/* gateway refuses straight away */
let A3 = await mkFunded(6000, "ord_rf_3"); cfRefundStart = "CANCELLED";
r = await Z("projects/" + A3.pid + "/refund_process", { milestoneId: A3.m.id, reason: "x" }, "fin"); ok(r.j.project.refunds[0].status === "failed" && ms(A3.pid, A3.m.id).status === "funded", "gateway refuses immediately → failed, milestone restored");
cfRefundStart = "PENDING"; cfRefundCheck = "PENDING";
/* manual path */
let A4 = await mkFunded(4000); r = await Z("projects/" + A4.pid + "/refund_process", { milestoneId: A4.m.id, reason: "manual" }, "fin"); rf = r.j.project.refunds[0];
ok(rf.status === "needs_manual" && ms(A4.pid, A4.m.id).status === "refund_processing", "no gateway order → needs_manual, milestone still held");
r = await Z("projects/" + A4.pid + "/refund_manual", { refundId: rf.id, ref: "UTR-4000-01" }, "fin"); ok(r.j.project.refunds[0].status === "refunded" && ms(A4.pid, A4.m.id).status === "refunded", "finance records the bank reference → refunded");
let A5 = await mkFunded(3000); r = await Z("projects/" + A5.pid + "/refund_process", { milestoneId: A5.m.id, reason: "x" }, "fin"); rf = r.j.project.refunds[0];
r = await Z("projects/" + A5.pid + "/refund_fail", { refundId: rf.id, reason: "Bank rejected the account" }, "fin"); ok(r.j.project.refunds[0].status === "failed" && ms(A5.pid, A5.m.id).status === "funded", "finance marks a refund failed → milestone restored");
/* scheduler */
let A6 = await mkFunded(5000, "ord_rf_6"); r = await Z("projects/" + A6.pid + "/refund_process", { milestoneId: A6.m.id, reason: "x" }, "fin"); cfRefundCheck = "SUCCESS";
const { checkRefunds } = await import("../functions/_lib/projects2.js"); const B0 = await import("../functions/_lib/biz.js");
const cr = await checkRefunds(env, { auditLog: B0.auditLog, notify: B0.notify }, 20); ok(cr.some((x) => x.status === "refunded") && ms(A6.pid, A6.m.id).status === "refunded", "the daily scheduler confirms refunds still processing");
ok(q1("SELECT count(*) n FROM biz_audit WHERE action LIKE 'refund:%'").n >= 8, "every refund step is audited");

/* ---------- 2. catalog seeds ---------- */
r = await Z("builder/catalog"); ok(r.j.ok && r.j.templates.length === TEMPLATES.length && r.j.templates.some((t) => t.id === "ad_shoot") && r.j.templates.some((t) => t.id === "custom"), "templates: " + r.j.templates.length + " project types incl. Create Custom Project");
ok(["Creative & Production", "Marketing", "Business", "Custom"].every((g) => r.j.templates.some((t) => t.group === g)), "creative / marketing / business / custom groups");
ok(q1("SELECT count(*) n FROM biz_roles WHERE source='benchmark_seed'").n === ROLES.length && q1("SELECT rate FROM biz_roles WHERE id='dop'").rate === 35000, "roles seeded and tagged benchmark_seed (DOP ₹35,000/day inside the ₹20k–1L band)");
ok(q1("SELECT rate FROM biz_equipment WHERE id='fx3'").rate === 3200 && q1("SELECT rate FROM biz_equipment WHERE id='drone'").rate === null && q1("SELECT cost_rate FROM biz_equipment WHERE id='fx6'").cost_rate === null, "equipment: FX3 ₹3,200/day; no benchmark → no invented rate (drone); partner cost starts unset");
ok(!("costRate" in r.j.equipment[0]) && r.j.roles.length === ROLES.length, "clients don't see partner costs");
r = await Z("builder/templates/ad_shoot"); const tq = r.j.template; ok(tq.questions.some((q) => q.id === "drone") && tq.tiers.length === 3, "ad shoot: questions (drone, dialogue, deliverables…) + Essential / Professional / Premium");
r = await Z("builder/templates/nope"); ok(r.status === 404, "unknown template → 404");

/* ---------- 3. team builder engine ---------- */
const AD = { promote: "Summer clothing collection launch", city: "Delhi", date: day(20), shoot_days: 1, locations: 1, talent: 2, dialogue: "no", drone: "no", studio_lighting: "yes", hero: 1, reels: 5, photos: 20, script: "yes" };
r = await Z("builder/estimate", { templateId: "ad_shoot", answers: AD }); const E1 = r.j;
ok(E1.ok && E1.order.join() === "essential,professional,premium" && E1.recommended === "professional", "three scenarios, Professional recommended");
const P1 = E1.tiers.professional, ids = (t) => t.team.map((x) => x.id);
ok(["producer", "director", "dop", "first_ac", "gaffer", "editor", "scriptwriter", "photographer", "photo_retoucher"].every((x) => ids(P1).indexOf(x) > -1), "Professional team: producer, director, DOP, AC + gaffer (studio lighting), scriptwriter, photographer + retoucher (photos asked)");
ok(ids(P1).indexOf("drone_operator") < 0 && ids(P1).indexOf("sound_recordist") < 0, "no drone / no dialogue → no drone operator, no sound recordist");
ok(ids(E1.tiers.essential).indexOf("gaffer") < 0, "the gaffer rule applies to Professional / Premium only");
ok(E1.tiers.premium.people > P1.people && P1.people > E1.tiers.essential.people, "team sizes: Essential < Professional < Premium (" + E1.tiers.essential.people + " / " + P1.people + " / " + E1.tiers.premium.people + ")");
const ed = P1.team.find((x) => x.id === "editor"); ok(ed.units === 4 && ed.amount === 48000, "editor days from deliverables: 1 hero × 2 + 5 reels × 0.4 = 4 days × ₹12,000");
ok(P1.capacityText && /estimates/.test(P1.capacityText) && P1.assumptions.length >= 4, "capacity is an estimate with assumptions");
ok(!("internal" in P1.price) && P1.team.every((x) => !("cost" in x)), "clients never see internal costs or margins");
r = await Z("builder/estimate", { templateId: "ad_shoot", answers: Object.assign({}, AD, { drone: "yes", dialogue: "yes", talent: 6, setups: 12, reels: 30 }) }); const P2 = r.j.tiers.professional;
ok(["drone_operator", "sound_recordist", "production_coordinator", "first_ad"].every((x) => ids(P2).indexOf(x) > -1) && P2.equipment.some((e) => e.id === "drone") && P2.equipment.some((e) => e.id === "audio_basic"), "conditional logic: drone → operator + drone kit, dialogue → sound + audio kit, 5+ talent → coordinator, 10+ setups → 1st AD");
ok(P2.team.find((x) => x.id === "drone_operator").why === "Drone shots need a licensed drone operator", "every added role says why");
ok(P2.warnings.some((w) => /30 short-form/.test(w)), "asking more than the team can do → an honest warning (add a day / bigger team)");
ok(P2.price.incomplete && P2.notes.some((n) => /rate to be confirmed/.test(n)) && P2.equipment.find((e) => e.id === "drone").amount === null, "drone kit has no catalog rate → 'rate to be confirmed', total marked incomplete");
/* customisation: remove the drone operator → recalculated */
r = await Z("builder/estimate", { templateId: "ad_shoot", answers: Object.assign({}, AD, { drone: "yes" }), tier: "professional", custom: { remove: ["drone_operator", "drone"] } }); const P3 = r.j.tiers.professional;
ok(ids(P3).indexOf("drone_operator") < 0 && !P3.equipment.some((e) => e.id === "drone") && Object.keys(r.j.tiers).length === 1, "client removes the drone operator → team, equipment and price recalculated (one tier)");
r = await Z("builder/estimate", { templateId: "ad_shoot", answers: AD, tier: "professional", custom: { roles: [{ id: "makeup_artist", qty: 2 }, { id: "dop", qty: 1, units: 2 }], equipment: [{ id: "fx6", qty: 2 }] } }); const P4 = r.j.tiers.professional;
ok(P4.team.find((x) => x.id === "makeup_artist").qty === 2 && P4.team.find((x) => x.id === "dop").units === 2 && P4.equipment.find((x) => x.id === "fx6").qty === 2, "add a role, change quantity / days, change equipment");
r = await Z("builder/estimate", { templateId: "ad_shoot", answers: AD, tier: "professional", custom: { roles: [{ id: "dop", rate: 1 }] } }); ok(r.j.tiers.professional.team.find((x) => x.id === "dop").rate === 35000, "a client can't set a rate (catalog rate always used)");
ok(P1.reduce.length && P1.reduce.every((x) => x.saves > 0 && x.effect), "ways to reduce cost with real savings and what you lose");
r = await Z("builder/estimate", { templateId: "ad_shoot", answers: Object.assign({}, AD, { budget: 150000 }) }); ok(r.j.budget === 150000 && typeof r.j.tiers.essential.fitsBudget === "boolean", "budget compared with each scenario");
r = await Z("builder/estimate", { templateId: "meta_ads", answers: { promote: "More leads for our clinic", months: 3, ad_spend: 100000, creatives: 8 } });
ok(r.j.tiers.professional.team.find((x) => x.id === "performance_marketer").units === 3 && r.j.tiers.professional.assumptions.some((a) => /Ad spend/.test(a)), "ads project: monthly roles × 3 months; ad spend stays separate from FODO's fee");
r = await Z("builder/estimate", { templateId: "shopify_setup", answers: { promote: "Organic tea brand" } }); ok(r.j.answers.ecommerce === "yes" && r.j.tiers.professional.team.some((x) => x.id === "shopify_specialist"), "Shopify setup forces the store → Shopify specialist");
r = await Z("builder/estimate", { templateId: "monthly_content", answers: { promote: "A café in Dwarka", months: 2, shoot_days: 2, reels: 20, photos: 30 } }); ok(r.j.tiers.professional.team.find((x) => x.id === "videographer").units === 4, "monthly content: 2 shoot days × 2 months");
r = await Z("builder/estimate", { templateId: "custom", answers: { promote: "A launch event for our store", shoot_days: 2 }, tier: "essential", custom: { roles: [{ id: "photographer", qty: 1 }, { id: "videographer", qty: 2 }] } }); ok(r.j.tiers.essential.team.length === 2 && r.j.tiers.essential.price.total > 0, "custom project: pick the roles yourself");

/* ---------- 4. pricing engine ---------- */
const C0 = Object.assign({}, PRICING_DEFAULTS), team1 = [{ id: "a", category: "Production", basis: "shoot", qty: 1, amount: 50000, rate: 50000 }, { id: "b", category: "Post-production", basis: "post", qty: 1, amount: 20000, rate: 20000 }], eq1 = [{ id: "fx6", amount: 5000, cost: 3500, rate: 5000, costKnown: true }];
let pr = priceIt(team1, eq1, { mode: "onsite" }, C0, null, {});
ok(pr.subtotal === 75000 + 11250 + 3750 && pr.tax.amount === 0 && !pr.tax.charged && pr.total === 90000, "₹75,000 base → 15 % management (₹11,250) + 5 % contingency (₹3,750) = ₹90,000; no tax without a GSTIN");
ok(pr.internal.providerCost === 70000 && pr.internal.equipmentCost === 3500 && pr.internal.fodoRevenue === 11250 + 1500 && pr.internal.marginPct > 0, "internal: provider cost, equipment margin, FODO revenue, gross margin");
pr = priceIt(team1, eq1, { mode: "onsite" }, C0, null, { FODO_GSTIN: "07ABCDE1234F1Z5" }); ok(pr.tax.charged && pr.tax.amount === Math.round(90000 * 0.18), "with FODO_GSTIN the configured 18 % GST is added");
pr = priceIt([{ category: "Production", basis: "shoot", qty: 1, amount: 10000, rate: 10000 }], [], {}, C0, null, {}); ok(pr.groups.find((g) => /management/.test(g.label)).amount === 7500, "small project: minimum management fee ₹7,500");
pr = priceIt([{ category: "Production", basis: "shoot", qty: 1, amount: 2000000, rate: 2000000 }], [], {}, C0, null, {}); ok(/negotiates/.test(pr.band), "₹10L+ → custom negotiated band flagged");
pr = priceIt(team1, eq1, { date: day(1) }, C0, null, {}); ok(pr.groups.some((g) => g.label === "Rush surcharge" && g.amount === 7500), "rush (shoot within 3 days): 15 % on the shoot crew");
pr = priceIt(team1, eq1, {}, C0, { discount: 5000, lines: [{ group: "travel", label: "Flights", amount: 12000 }] }, {}); ok(pr.groups.some((g) => g.label === "Discount" && g.amount === -5000) && pr.groups.some((g) => g.label === "Travel" && g.amount === 12000), "admin adjustments: discount + travel line");
r = await Z("builder/estimate", { templateId: "ad_shoot", answers: AD, adjust: { discount: 99999 } }); ok(!r.j.tiers.professional.price.groups.some((g) => g.label === "Discount"), "clients can't give themselves a discount");
r = await Z("builder/estimate", { templateId: "ad_shoot", answers: AD }, "own"); ok(r.j.tiers.professional.price.internal && r.j.tiers.professional.price.internal.providerCost > 0, "FODO staff see the internal margin view");

/* ---------- 5. matching ---------- */
r = await Z("builder/match", { roleId: "dop", date: day(10), city: "Delhi", mode: "onsite" });
ok(r.j.ok && r.j.items.length === 1 && r.j.items[0].pro.name === "Aarav Films" && r.j.items[0].available === true, "DOP in Delhi on a free date → the approved Cinematographer, available");
ok(r.j.items[0].why.indexOf("Verified by FODO") > -1 && r.j.items[0].why.some((w) => /Available on/.test(w)) && r.j.items[0].why.some((w) => /Based in Delhi/.test(w)) && !r.j.items[0].why.some((w) => /AI/.test(w)), "Why FODO recommends: real facts only (verified, available, Delhi)");
ok(r.j.items[0].pro.rateDay === undefined, "clients don't see a pro's private day rate in matching");
r = await Z("builder/match", { roleId: "dop", city: "Mumbai", mode: "onsite" }); ok(r.j.items.length === 1, "onsite in another city: a pro who travels (onsite) still matches");
r = await Z("builder/match", { roleId: "editor", city: "Delhi" }); ok(r.j.items.length === 0 && /No approved FODO Pro/.test(r.j.note), "no pro for a role → said honestly, nothing invented");
r = await Z("builder/match", { roleId: "dop", mode: "online" }); ok(r.j.items.length === 0, "online work: only pros who work remotely");
r = await Z("builder/availability", { roles: ["dop", "producer"], date: day(10), city: "Delhi" }); ok(r.j.covered === 1 && r.j.of === 2, "team availability: 1 of 2 roles has an available FODO Pro");

/* ---------- 6. drafts + quotes ---------- */
r = await Z("builder/drafts", { templateId: "ad_shoot", answers: AD, tier: "professional", custom: { remove: ["photographer"] } }); const bd = r.j.draft; ok(bd && bd.id && bd.total > 0, "client saves the project as a draft");
r = await Z("builder/drafts/" + bd.id, undefined, "o"); ok(r.status === 404, "another client can't open the draft (IDOR)");
r = await Z("quotes", { buildId: bd.id }, "o"); ok(r.status === 404, "…or request a quote on it");
r = await Z("quotes", { buildId: bd.id, company: "Acme Fashion" }); const Q1 = r.j.quote; ok(Q1 && Q1.status === "requested" && /^FQ-\d{4}-\d{4}$/.test(Q1.number) && Q1.data.pending, "quote requested: numbered " + Q1.number + ", waiting for FODO");
r = await Z("quotes", { buildId: bd.id }); ok(r.status === 409, "one quote per draft");
r = await Z("builder/drafts", { buildId: bd.id, templateId: "ad_shoot", answers: AD }); ok(r.status === 409, "a quoted draft can't be edited");
r = await Z("notes", undefined, "own"); ok(r.j.items.some((n) => /Quote requested/.test(n.text)), "owners are notified");
r = await Z("quotes/" + Q1.id, undefined, "o"); ok(r.status === 404, "other clients can't see the quote");
r = await Z("admin/quotes", undefined, "o"); ok(r.status === 403, "clients can't list quotes");
r = await Z("admin/quotes/" + Q1.id, undefined, "own"); let QA = r.j.quote; ok(QA.internal && QA.internal.providerCost > 0 && QA.data.team.length && QA.versions.length === 1, "admin sees the full quote with the internal margin view");
ok(QA.data.team.every((x) => x.role !== "Photographer") && QA.data.client.company === "Acme Fashion", "the client's customisation is in the quote");
r = await Z("admin/quotes/" + Q1.id + "/revise", { adjust: { discount: 5000 }, notes: "Includes one extra cutdown" }, "own"); QA = r.j.quote; ok(QA.latestVersion === 1 && QA.data.price.groups.some((g) => g.label === "Discount"), "before sending, edits replace the draft version");
r = await Z("admin/quotes/" + Q1.id + "/send", {}, "fin"); ok(r.status === 403, "finance can't send quotes (admins only)");
r = await Z("admin/quotes/" + Q1.id + "/send", {}, "own"); QA = r.j.quote; ok(QA.status === "sent" && QA.sentVersion === 1 && QA.expiresAt, "sent: valid for " + QA.data.validityDays + " days");
r = await Z("quotes/" + Q1.id); let QC = r.j.quote; ok(QC.status === "viewed" && QC.version === 1 && !QC.internal && QC.data.price.total === QA.data.price.total, "client opens it → viewed; no internal data");
const sentTotal = QC.data.price.total;
r = await Z("quotes/" + Q1.id + "/changes", { note: "Can we remove the colourist and add one more reel?" }); ok(r.j.quote.status === "negotiation", "client asks for changes → negotiation");
r = await Z("admin/quotes/" + Q1.id + "/revise", { custom: { remove: ["photographer", "colorist"] } }, "own"); ok(r.status === 400, "editing a sent quote needs a change note");
r = await Z("admin/quotes/" + Q1.id + "/revise", { custom: { remove: ["photographer", "colorist"] }, reason: "Removed the colourist as asked" }, "own"); QA = r.j.quote;
ok(QA.latestVersion === 2 && QA.status === "revised" && QA.data.changeNote === "Removed the colourist as asked", "after sending, an edit makes version 2 (status revised)");
const v1 = JSON.parse(q1("SELECT data FROM biz_quote_versions WHERE quote_id=? AND version=1", Q1.id).data); ok(v1.price.total === sentTotal && v1.team.some((x) => /Colorist/.test(x.role)), "version 1 is unchanged (immutable once sent)");
r = await Z("quotes/" + Q1.id); ok(r.j.quote.version === 1, "the client still sees version 1 until v2 is sent");
r = await Z("quotes/" + Q1.id + "/accept", { version: 1, agree: true }); ok(r.status === 409, "can't accept while FODO is revising (status revised)");
await Z("admin/quotes/" + Q1.id + "/send", {}, "own");
r = await Z("quotes/" + Q1.id + "/accept", { version: 1, agree: true }); ok(r.status === 409 && /newer version/.test(r.j.reason), "accepting an old version is refused");
r = await Z("quotes/" + Q1.id + "/accept", { version: 2 }); ok(r.status === 400, "acceptance needs the explicit agreement tick");
r = await Z("quotes/" + Q1.id + "/accept", { version: 2, agree: true }, "o"); ok(r.status === 404, "another client can't accept it");
r = await Z("quotes/" + Q1.id + "/accept", { version: 2, agree: true }); ok(r.j.quote.status === "accepted" && r.j.quote.acceptedVersion === 2, "client accepts version 2");
const meta = JSON.parse(q1("SELECT accept_meta FROM biz_quotes WHERE id=?", Q1.id).accept_meta); ok(meta.ipHash && meta.ipHash.indexOf("9.9.9.9") < 0 && meta.ua !== undefined, "acceptance records user, time, version and a hash of the IP (not the IP)");
r = await Z("quotes/" + Q1.id + "/accept", { version: 2, agree: true }); ok(r.status === 409, "accepting twice is refused");
r = await Z("admin/quotes/" + Q1.id + "/revise", { reason: "late change" }, "own"); ok(r.status === 409, "an accepted quote can't be edited");
r = await Z("admin/quotes/" + Q1.id, undefined, "own"); ok(["requested", "sent", "viewed", "changes_requested", "revised", "accepted"].every((k) => r.j.quote.events.some((e) => e.kind === k)), "full activity timeline (requested → sent → viewed → changes → revised → accepted)");
/* formats */
r = await call("biz/quotes/" + Q1.id + "/print", undefined, { as: "c" }); ok(r.status === 200 && /<h2>Team<\/h2>/.test(r.t) && /Investment/.test(r.t) && /FEAR OF DIGITALLY OUT \?/.test(r.t) && !/providerCost|marginPct/.test(r.t), "printable quote (cover, summary, team, investment, terms), no internal numbers");
r = await call("biz/quotes/" + Q1.id + "/summary", undefined, { as: "c" }); ok(/^FODO Project Proposal/.test(r.t) && /Investment:/.test(r.t) && /#quote=/.test(r.t), "WhatsApp-ready summary");
r = await call("biz/quotes/" + Q1.id + "/csv", undefined, { as: "c" }); ok(/^Section,Item,Qty/.test(r.t) && /Total/.test(r.t), "CSV line items");
r = await call("biz/quotes/" + Q1.id + "/json", undefined, { as: "c" }); ok(JSON.parse(r.t).number === Q1.number && !("internal" in JSON.parse(r.t)), "JSON download (client view)");
r = await call("biz/quotes/" + Q1.id + "/print", undefined, { as: "o" }); ok(r.status === 404, "another client can't print it");
/* expiry + admin create + clone + cancel */
r = await Z("admin/quotes", { clientEmail: "other@biz.in", templateId: "reels_shoot", answers: { promote: "Reels for a gym", city: "Delhi", reels: 10 }, tier: "essential" }, "own"); const Q2 = r.j.quote; ok(Q2.status === "draft", "admin starts a quote for a client");
r = await Z("quotes/" + Q2.id, undefined, "o"); ok(r.status === 404, "an unsent FODO draft stays private");
r = await Z("admin/quotes", { clientEmail: "nobody@x.in", templateId: "reels_shoot", answers: {} }, "own"); ok(r.status === 404, "unknown client email refused");
await Z("admin/quotes/" + Q2.id + "/send", {}, "own"); env.XRAY_DB.db.prepare("UPDATE biz_quotes SET expires_at=? WHERE id=?").run("2020-01-01T00:00:00Z", Q2.id);
r = await Z("quotes/" + Q2.id, undefined, "o"); ok(r.j.quote.status === "expired", "past its validity → expired");
r = await Z("quotes/" + Q2.id + "/accept", { version: 1, agree: true }, "o"); ok(r.status === 409 && /expired/.test(r.j.reason), "an expired quote can't be accepted");
r = await Z("admin/quotes/" + Q2.id + "/clone", {}, "own"); ok(r.j.quote.status === "draft" && r.j.quote.id !== Q2.id && r.j.quote.events.some((e) => e.kind === "cloned"), "clone: a new draft re-priced with today's catalog");
r = await Z("admin/quotes/" + r.j.quote.id + "/cancel", { reason: "duplicate" }, "own"); ok(r.j.quote.status === "cancelled", "cancel a quote");
r = await Z("quotes", undefined, "o"); ok(r.j.items.length === 1 && r.j.items[0].status === "expired", "the client's quote list shows only quotes sent to them");
/* incomplete price can't be sent */
r = await Z("admin/quotes", { clientEmail: "other@biz.in", templateId: "drone_shoot", answers: { promote: "Aerial shots of our resort", city: "Goa" }, tier: "professional" }, "own"); r = await Z("admin/quotes/" + r.j.quote.id + "/send", {}, "own"); ok(r.status === 409 && /rate to be confirmed/.test(r.j.reason), "a quote with unpriced items can't be sent");

/* ---------- 7. admin catalog + pricing rules + history ---------- */
r = await Z("admin/catalog", undefined, "c"); ok(r.status === 403, "clients can't open the catalog admin");
r = await Z("admin/catalog", undefined, "fin"); ok(r.j.ok && !r.j.canEdit && !r.j.canPricing && r.j.equipment[0].costRate !== undefined, "finance can read (with partner costs), not edit");
r = await Z("admin/catalog/roles", { id: "dop", rate: 40000 }, "fin"); ok(r.status === 403, "finance can't change rates");
r = await Z("admin/catalog/roles", { id: "dop", rate: 40000 }, "own"); ok(r.status === 400 && /why/.test(r.j.reason), "a rate change needs a reason");
r = await Z("admin/catalog/roles", { id: "dop", rate: 40000, reason: "Delhi market rates went up" }, "own"); ok(r.j.role.rate === 40000 && r.j.role.source === "admin", "owner changes the DOP rate (no longer a seed)");
r = await Z("admin/price-history", undefined, "own"); ok(r.j.items.some((h) => h.ref === "dop" && h.old === "35000" && h.new === "40000" && h.reason === "Delhi market rates went up"), "price history: old → new, who, why");
r = await Z("admin/quotes/" + Q1.id, undefined, "own"); ok(r.j.quote.data.team.find((x) => /DOP/.test(x.role)).rate === 35000, "existing quotes keep their agreed prices");
r = await Z("admin/catalog/roles", { id: "drone_pilot_fpv", name: "FPV Drone Pilot", category: "Camera", unit: "day", rate: 15000, match: ["Drone Operator"], reason: "new" }, "own"); ok(r.j.role.id === "drone_pilot_fpv", "admins add custom roles");
r = await Z("admin/catalog/equipment", { id: "drone", rate: 6000, costRate: 4500, reason: "Partner rate card" }, "own"); ok(r.j.item.rate === 6000 && r.j.item.costRate === 4500, "set the drone rate + partner cost");
r = await Z("builder/estimate", { templateId: "ad_shoot", answers: Object.assign({}, AD, { drone: "yes" }), tier: "professional" }); ok(!r.j.tiers.professional.price.incomplete || r.j.tiers.professional.equipment.find((e) => e.id === "drone").amount === 6000, "the new rate is used immediately");
r = await Z("admin/catalog/templates", { id: "ad_shoot", description: "Our flagship ad shoot", reason: "copy" }, "own"); ok(r.j.template.description === "Our flagship ad shoot" && r.j.template.questions.length > 10, "edit a seed template (description)");
r = await Z("admin/catalog/templates", { id: "pet_shoot", name: "Pet Photography", family: "photo", group: "Creative & Production", tiers: { essential: { label: "Essential", roles: [["photographer", 1, "shoot"]], equipment: [] } }, reason: "new" }, "own");
ok(r.j.template.id === "pet_shoot" && r.j.template.tiers.essential.roles[0][0] === "photographer", "create a new project type without code");
r = await Z("admin/catalog/templates", { id: "pet_shoot", tiers: { essential: { label: "E", roles: [["unicorn_wrangler", 1, "shoot"]] } } }, "own"); ok(r.status === 400 && /unicorn_wrangler/.test(r.j.reason), "templates can only use catalog roles");
r = await Z("builder/catalog"); ok(r.j.templates.some((t) => t.id === "pet_shoot"), "new type shows in the Project Builder");
r = await Z("admin/catalog/templates", { id: "music_video", active: false, reason: "not offered" }, "own"); r = await Z("builder/templates/music_video"); ok(r.status === 404, "switch a project type off");
r = await Z("admin/pricing", { contingencyPct: 8, reason: "x" }, "fin"); ok(r.status === 403, "only owners change pricing rules");
r = await Z("admin/pricing", { paymentPlan: [{ label: "Booking", pct: 30 }, { label: "Shoot", pct: 30 }] , reason: "plan" }, "own"); ok(r.status === 400, "payment plan must add to 100 %");
r = await Z("admin/pricing", { contingencyPct: 8, paymentPlan: [{ label: "Booking", pct: 30 }, { label: "Production", pct: 40 }, { label: "Delivery", pct: 30 }], weights: { availability: 30 }, reason: "New season" }, "own"); ok(r.j.pricing.contingencyPct === 8 && r.j.pricing.paymentPlan.length === 3 && r.j.pricing.weights.availability === 30, "owner updates contingency, payment plan (30/40/30) and matching weights");
r = await Z("admin/price-history?kind=pricing", undefined, "own"); ok(r.j.items.some((h) => h.field === "contingencyPct" && h.old === "5" && h.new === "8"), "pricing rule changes are in the history");
r = await Z("builder/match", { roleId: "dop", date: day(10), city: "Delhi" }); ok(r.j.weights.availability === 30, "matching uses the admin weights");

/* ---------- 8. UI + Brain wiring ---------- */
const WS = fs.readFileSync("js/workspace.js", "utf8"), PB = fs.existsSync("js/ws-builder.js") ? fs.readFileSync("js/ws-builder.js", "utf8") : "", MA = fs.existsSync("js/ws-market-admin.js") ? fs.readFileSync("js/ws-market-admin.js", "utf8") : "";
ok(/project-builder/.test(WS) && /ws-builder\.js/.test(WS) && /builder\/estimate/.test(PB) && /builder\/drafts/.test(PB) && /quotes/.test(PB), "workspace: Project Builder loads lazily (js/ws-builder.js)");
ok(/refund_processing/.test(WS) && /refund_check/.test(WS) && /refund_fail/.test(WS), "workspace: refund in progress (held), Check status, Mark failed");
ok(/admin\/catalog/.test(MA) && /admin\/quotes/.test(MA) && /admin\/pricing/.test(MA) && /price-history/.test(MA), "admin: catalog, pricing rules, quotes, price history (lazy module)");
const { TOOLS: TL } = await import("../functions/_lib/brain/tools.js"), tn = (n) => TL[n];
ok(["marketplace_team_recommend", "marketplace_pricing_calculate", "marketplace_quotes_list", "marketplace_pros_search", "marketplace_catalog"].every((n) => tn(n) && tn(n).level === 0), "Brain: team recommend, price calculate, quotes, pros search, catalog (read-only)");
ok(tn("marketplace_quote_draft") && tn("marketplace_quote_draft").level >= 1, "Brain can prepare a quote draft only with confirmation; it never sends quotes or money");
const bctx = { env, owner: { email: "anmol@fodo.co.in", id: q1("SELECT id FROM acct_users WHERE email='anmol@fodo.co.in'").id } };
let bt = await TL.marketplace_team_recommend.run(bctx, { templateId: "ad_shoot", promote: "Fashion ad", city: "Delhi", hero: 1, reels: 5, photos: 20, budget: 200000 }); ok(bt.label === "ESTIMATE (not a quote)" && bt.options.length === 3 && bt.options[1].internal && bt.options[1].estimatedTotal > 0, "Brain: builds the team options, labelled ESTIMATE, with FODO's margin");
bt = await TL.marketplace_pricing_calculate.run(bctx, { templateId: "ad_shoot", promote: "Fashion ad", tier: "professional", remove: "gaffer", studio_lighting: "yes", answers_json: '{"studio_lighting":"yes"}' }); ok(!bt.team.some((x) => /Gaffer/.test(x)) && bt.estimatedTotal > 0, "Brain: what if we remove the gaffer");
bt = await TL.marketplace_pros_search.run(bctx, { role: "dop", city: "Delhi", date: day(10) }); ok(bt.pros.length === 1 && bt.pros[0].available && bt.pros[0].dayRate === 18000, "Brain: who is available (with the day rate for owners)");
bt = await TL.marketplace_quote_draft.run(bctx, { templateId: "reels_shoot", promote: "Gym reels", city: "Delhi", clientEmail: "client@biz.in", tier: "essential" }); ok(bt.label === "DRAFT (not sent)" && /^FQ-/.test(bt.number) && q1("SELECT status FROM biz_quotes WHERE number=?", bt.number).status === "draft", "Brain: prepares a quote draft, never sends it");
bt = await TL.marketplace_quotes_list.run(bctx, { status: "accepted" }); ok(bt.items.length === 1 && bt.items[0].number === Q1.number, "Brain: lists quotes by status");
ok(!Object.keys(TL).some((k) => /quote_send|payout_send|refund_send/.test(k)), "no Brain tool sends quotes, payouts or refunds");
ok(all.every((t) => !/cf_SECRET_key|cf_payout_SECRET|SECRET_key/.test(t)), "no secrets in any answer");

console.log("\nv47: " + pass + " passed, " + fail + " failed"); if (fail) process.exit(1);
