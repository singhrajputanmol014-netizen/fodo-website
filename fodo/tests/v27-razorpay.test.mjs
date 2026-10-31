// v27 Razorpay payments — order creation, server-side confirmation, signed webhook, no double credit, no secret leak, Brain tool.
// Run: node --no-warnings tests/v27-razorpay.test.mjs
import { DatabaseSync } from "node:sqlite";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as admin } from "../functions/api/admin/[[path]].js";
import { onRequest as xray } from "../functions/api/xray/[[path]].js";
import { onRequest as brain } from "../functions/api/owner-brain/[[path]].js";
import { onRequest as tick } from "../functions/api/monitor/tick.js";
import { PLANS } from "../functions/_lib/plans.js";
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
const all = [];   // every response body — checked for leaked secrets at the end
const login = (email, plan, who) => call("test-login", Object.assign({ email }, plan ? { plan } : {}), { as: who });
const B = (p, body, who, o) => call("owner-brain/" + p, body, Object.assign({ as: who || "own" }, o || {}));
import { createHmac } from "node:crypto";
const RZ = { orders: {}, n: 0, calls: [] };
globalThis.fetch = async (u, o = {}) => { u = String(u); const J = (x, s) => new Response(JSON.stringify(x), { status: s || 200 });
  if (/api\.razorpay\.com/.test(u)) { RZ.calls.push({ u, o }); if (o.headers.authorization !== "Basic " + btoa(env.RAZORPAY_KEY_ID + ":" + env.RAZORPAY_KEY_SECRET)) return J({ error: { description: "auth" } }, 401);
    if (/\/v1\/orders$/.test(u) && o.method === "POST") { const b = JSON.parse(o.body), id = "order_T" + (++RZ.n) + "abcdefgh"; RZ.orders[id] = Object.assign({ id, status: "created", amount_paid: 0 }, b); return J(RZ.orders[id]); }
    let m = /\/v1\/orders\/(order_[A-Za-z0-9]+)\/payments/.exec(u); if (m) return J({ items: [{ id: "pay_X1", order_id: m[1], amount: RZ.orders[m[1]].amount, status: "captured", method: "upi", email: "a@b.in", created_at: 1761900000 }] });
    m = /\/v1\/orders\/(order_[A-Za-z0-9]+)/.exec(u); if (m) return J(RZ.orders[m[1]] || {}, RZ.orders[m[1]] ? 200 : 404);
    if (/\/v1\/payments\?/.test(u)) return J({ items: [{ id: "pay_X1", order_id: "order_T1abcdefgh", amount: 149900, status: "captured", method: "upi", email: "rohit@gmail.com", created_at: 1761900000 }, { id: "pay_X2", amount: 49900, status: "failed", method: "card", created_at: 1761900100, error_description: "declined" }] });
    if (/\/v1\/settlements\?/.test(u)) return J({ items: [{ id: "setl_1", amount: 146000, fees: 3000, tax: 540, status: "processed", utr: "UTR9", created_at: 1761990000 }] });
    return J({ error: { description: "nf" } }, 404); }
  return J({}); };
const env = { XRAY_DB: d1(), ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", RAZORPAY_KEY_ID: "rzp_test_KEYID123", RAZORPAY_KEY_SECRET: "rzpSECRETvalue987654", RAZORPAY_WEBHOOK_SECRET: "whsecRZP_abc123", CASHFREE_APP_ID: "cfid", CASHFREE_SECRET_KEY: "cfsecretXYZ" };
const ask = (message, threadId, who, extra) => B("chat", Object.assign({ message, threadId }, extra || {}), who);
const me = async (who) => (await call("me", undefined, { as: who })).j;
const hook = (obj, sig) => { const raw = JSON.stringify(obj); return call("webhook/razorpay", obj, { as: "nobody", headers: { "content-type": "application/json", "x-razorpay-signature": sig || createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest("hex") } }); };

let r = await call("config"); ok(r.j.payments === "razorpay" && r.j.mode === "sandbox" && r.j.autoRenew === false, "Razorpay keys set → site uses Razorpay (test mode), no auto-renew promise");
await login("rohit@gmail.com", null, "a"); await login("anmol@fodo.co.in", null, "own");
const before = (await me("a")).user;
r = await call("checkout", { kind: "plan", item: "growth", phone: "98100 12345" });
const oid = r.j.orderId, ro = RZ.orders[r.j.rzpOrderId];
ok(r.j.ok && r.j.provider === "razorpay" && /^fo_/.test(oid) && ro.receipt === oid && ro.amount === Math.round(PLANS.growth.price * 100) && ro.currency === "INR" && r.j.keyId === env.RAZORPAY_KEY_ID && r.j.prefill.contact === "9810012345" && /\/account\/\?order_id=fo_/.test(r.j.returnUrl), "checkout creates a Razorpay order (amount in paise, receipt = FODO order id) and gives the page only the public key id");
ok(!r.t.includes(env.RAZORPAY_KEY_SECRET) && !r.t.includes(env.RAZORPAY_WEBHOOK_SECRET), "key secret / webhook secret never sent to the browser");
r = await call("verify", { order_id: oid }); ok(r.j.paid === false && (await me("a")).user.planName === before.planName, "not paid yet → nothing unlocks (even if the browser says so)");
ro.status = "paid"; ro.amount_paid = ro.amount;
r = await call("verify", { order_id: oid }); const after = (await me("a")).user; ok(r.j.paid === true && after.plan === "growth", "Razorpay says paid → Growth plan unlocked (checked on the server with Razorpay)");
r = await hook({ event: "order.paid", payload: { order: { entity: { id: ro.id } }, payment: { entity: { order_id: ro.id } } } }); ok(r.status === 200 && JSON.stringify((await me("a")).user.credits) === JSON.stringify(after.credits), "late signed webhook for the same order: no double credit");
r = await call("checkout", { kind: "pack", item: Object.keys((await import("../functions/_lib/plans.js")).PACKS)[0], phone: "9810012345" }); const ro2 = RZ.orders[r.j.rzpOrderId], c0 = (await me("a")).user.credits.total;
ro2.status = "paid"; ro2.amount_paid = ro2.amount - 100;
r = await hook({ event: "order.paid", payload: { order: { entity: { id: ro2.id } } } }); ok((await me("a")).user.credits.total === c0, "amount paid doesn't match the price → not credited");
ro2.amount_paid = ro2.amount;
r = await hook({ event: "order.paid", payload: { order: { entity: { id: ro2.id } } } }, "deadbeef"); ok(r.status === 401 && (await me("a")).user.credits.total === c0, "unsigned / wrongly signed webhook rejected");
r = await hook({ event: "order.paid", payload: { order: { entity: { id: ro2.id } } } }); ok(r.status === 200 && (await me("a")).user.credits.total > c0, "signed webhook → pack credited (the webhook alone completes a payment if the person closes the tab)");
r = await call("checkout", { kind: "plan", item: "growth", phone: "9810012345" }, { as: "own" }); ok(r.status === 409, "owner logins are free — no checkout");
// the Brain
r = await ask("aaj kitne payments aaye razorpay pe?", null, "own"); ok(r.j.ok && JSON.stringify(r.j).includes("razorpay"), "Brain: payment question → Razorpay tool");
const { execute } = await import("../functions/_lib/brain/tools.js"); const owner = env.XRAY_DB.db.prepare("SELECT * FROM acct_users WHERE email='anmol@fodo.co.in'").get(), X = async (n, a) => ({ j: await execute({ env, request: new Request(SITE), owner, settings: { toolsOff: {} } }, n, a, {}) });
let t = await X("razorpay", { days: 7 }); ok(t.j && t.j.ok && t.j.result.captured === 1 && t.j.result.collected === 1499 && t.j.result.failed === 1 && t.j.result.settlements[0].utr === "UTR9", "Brain tool: payments, collected total, failures and settlements (rupees, not paise)");
t = await X("razorpay", { order: oid }); ok(t.j && t.j.ok && t.j.result.status === "paid" && t.j.result.payments[0].method === "upi", "Brain tool: one FODO order checked live with Razorpay");
r = await B("connectors"); ok(r.j.razorpay === true && r.j.razorpayWebhook === true, "Connectors page shows Razorpay + webhook");
ok(!all.some((x) => x.includes(env.RAZORPAY_KEY_SECRET) || x.includes(env.RAZORPAY_WEBHOOK_SECRET) || x.includes(env.CASHFREE_SECRET_KEY)), "no payment secret in any response");
env.PAYMENT_PROVIDER = "cashfree"; r = await call("config"); ok(r.j.payments === "cashfree", "PAYMENT_PROVIDER=cashfree switches back to Cashfree");
console.log("\nv27 razorpay: " + pass + "/" + (pass + fail) + " passed");
process.exit(fail ? 1 : 0);
