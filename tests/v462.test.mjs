// v46.2: payout adapters (Cashfree Payouts / RazorpayX, encrypted payout details), Brain business tools, builder smoothness +
// error reports, enforced CSP on the app pages, cross-browser workflow. Run: node --no-warnings tests/v462.test.mjs
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as admin } from "../functions/api/admin/[[path]].js";
import { onRequest as xray } from "../functions/api/xray/[[path]].js";
import { onRequest as brain } from "../functions/api/owner-brain/[[path]].js";
import { onRequest as bizApi } from "../functions/api/biz/[[path]].js";
import { onRequest as sitesApi } from "../functions/api/sites/[[path]].js";
import { fundMilestone } from "../functions/_lib/biz.js";
import { cleanMethod, provider, checkAll } from "../functions/_lib/payouts.js";
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
  return new Response("x", { status: 599 }); };
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

/* ---------- 1. payout details ---------- */
let th = null; try { cleanMethod({ kind: "upi", name: "Aarav", vpa: "not-a-upi" }); } catch (e) { th = e; } ok(th && th.status === 400, "invalid UPI ID refused");
th = null; try { cleanMethod({ kind: "bank", name: "Aarav Films", account: "123", ifsc: "HDFC0001234" }); } catch (e) { th = e; } ok(th, "short account number refused");
th = null; try { cleanMethod({ kind: "bank", name: "Aarav Films", account: "123456789012", account2: "123456789013", ifsc: "HDFC0001234" }); } catch (e) { th = e; } ok(th && /don't match/.test(th.message), "the two account numbers must match");
ok(cleanMethod({ kind: "bank", name: "Aarav Films", account: "1234 5678 9012", ifsc: "hdfc0001234" }).masked === "•••• 9012 · HDFC0001234" && cleanMethod({ kind: "upi", name: "Aarav", vpa: "Aarav.Films@OKICICI" }).masked === "aa•••@okicici", "masked forms (last 4 digits, IFSC; UPI handle)");
let r = await Z("pro/payout-method", { kind: "upi", name: "Aarav Films", vpa: "aarav@okicici" }, "p"); ok(r.status === 503 && /encryption key/.test(r.j.reason), "without an encryption key, payout details are NOT stored");
env.PAYOUT_ENC_KEY = "test-payout-key-0123456789-abcdef";
r = await Z("pro/payout-method", { kind: "bank", name: "Aarav Films", account: "123456789012", account2: "123456789012", ifsc: "HDFC0001234" }, "p"); ok(r.j.ok && r.j.method.masked === "•••• 9012 · HDFC0001234" && !("enc" in r.j.method), "pro saves bank details; only the masked form comes back");
const row = q1("SELECT * FROM biz_payout_methods WHERE pro_id=?", proId); ok(row && row.enc && row.enc.indexOf("123456789012") < 0 && row.enc.indexOf("HDFC") < 0, "stored encrypted (no account number or IFSC in the database)");
r = await Z("notes", undefined, "p"); ok(r.j.items.some((n) => /payout details were changed/.test(n.text)), "the pro gets a security notification about the change");
r = await Z("pro/payout-method", undefined, "c"); ok(r.status === 404, "clients have no payout details");

/* ---------- 2. Cashfree Payouts ---------- */
const po1 = await mkPayout(10000); ok(po1 && po1.net === 9000, "approved milestone → payout ₹9,000 net (10 % commission)");
r = await Z("admin/payouts/" + po1.id + "/send", {}, "fin"); ok(r.status === 409 && /aren't set up/.test(r.j.reason), "no provider configured → can't send (pay by hand instead)");
ok(provider(env) === null, "provider detection: none");
env.CASHFREE_PAYOUTS_ON = "1"; env.CASHFREE_PAYOUT_CLIENT_ID = "CF_PAYOUT_ID"; env.CASHFREE_PAYOUT_CLIENT_SECRET = "cf_payout_SECRET_x";
ok(provider(env) === "cashfree", "provider detection: Cashfree Payouts");
r = await Z("admin/payouts/" + po1.id + "/send", {}, "c"); ok(r.status === 403, "clients can't send payouts"); r = await Z("admin/payouts/" + po1.id + "/send", {}, "p"); ok(r.status === 403, "pros can't send their own payout");
r = await Z("admin/payouts/" + po1.id + "/send", {}, "fin"); const tx = calls.find((c) => c.p === "cf-tx"), bene = calls.find((c) => c.p === "cf-bene");
ok(r.j.ok && r.j.payout.status === "processing" && tx && tx.b.transfer_amount === 9000 && tx.b.transfer_mode === "imps" && /_1$/.test(tx.b.transfer_id), "finance sends: Cashfree transfer of exactly the net ₹9,000 (from the database), shown as processing");
ok(bene && bene.b.beneficiary_instrument_details.bank_account_number === "123456789012" && bene.b.beneficiary_instrument_details.bank_ifsc === "HDFC0001234" && bene.h["x-client-id"] === "CF_PAYOUT_ID", "beneficiary created with the decrypted bank details (server-side only)");
r = await Z("admin/payouts/" + po1.id + "/send", {}, "fin"); ok(r.status === 409, "can't send twice while processing");
r = await Z("admin/payouts/" + po1.id, { ref: "UTR123" }, "fin"); ok(r.status === 409, "can't mark paid by hand while the provider is sending it (no double payment)");
r = await Z("pro/earnings", undefined, "p"); ok(r.j.items[0].status === "processing" && r.j.totals.paid === 0, "the pro sees 'being sent', not paid");
r = await Z("admin/payouts/" + po1.id + "/check", {}, "fin"); ok(r.j.status === "paid" && q1("SELECT status, provider_ref FROM biz_payouts WHERE id=?", po1.id).provider_ref === "991", "provider confirms SUCCESS → Paid with the provider reference");
r = await Z("notes", undefined, "p"); ok(r.j.items.some((n) => /Payout sent: ₹9,000/.test(n.text)), "the pro is told the money was sent");
/* failure + retry */
const po2 = await mkPayout(5000); cfFail = true; r = await Z("admin/payouts/" + po2.id + "/send", {}, "fin"); ok(r.status === 502 && q1("SELECT status, fail_reason FROM biz_payouts WHERE id=?", po2.id).status === "failed" && /invalid/.test(q1("SELECT fail_reason FROM biz_payouts WHERE id=?", po2.id).fail_reason), "a refused transfer → Failed with the reason");
cfFail = false; calls.length = 0; r = await Z("admin/payouts/" + po2.id + "/send", {}, "fin"); ok(r.j.ok && calls.find((c) => c.p === "cf-tx").b.transfer_id.endsWith("_2") && !calls.some((c) => c.p === "cf-bene" && c.b.beneficiary_id && calls.filter((x) => x.p === "cf-bene").length > 1), "resend uses a new transfer id (attempt 2); the beneficiary is reused");
cfCheck = "PENDING"; r = await checkAll(env); ok(r.checked >= 1 && q1("SELECT status FROM biz_payouts WHERE id=?", po2.id).status === "processing", "the daily check leaves pending transfers as processing");
cfCheck = "REVERSED"; await checkAll(env); ok(q1("SELECT status FROM biz_payouts WHERE id=?", po2.id).status === "failed", "a reversed transfer becomes Failed (never Paid)");
/* ---------- 3. RazorpayX ---------- */
delete env.CASHFREE_PAYOUTS_ON; env.RAZORPAYX_ON = "1"; env.RAZORPAY_KEY_ID = "rzp_test_K"; env.RAZORPAY_KEY_SECRET = "rzp_SECRET"; env.RAZORPAYX_ACCOUNT = "2323230000001111";
await Z("pro/payout-method", { kind: "upi", name: "Aarav Films", vpa: "aarav@okicici" }, "p");
const po3 = await mkPayout(2000); calls.length = 0; r = await Z("admin/payouts/" + po3.id + "/send", {}, "own"); const rz = calls.find((c) => c.p === "rz-tx");
ok(r.j.ok && rz && rz.b.amount === 180000 && rz.b.mode === "UPI" && rz.b.fund_account.vpa.address === "aarav@okicici" && rz.b.account_number === "2323230000001111" && rz.h["X-Payout-Idempotency"], "RazorpayX: payout in paise to the UPI ID, idempotency key sent");
await Z("admin/payouts/" + po3.id + "/check", {}, "own"); ok(q1("SELECT status FROM biz_payouts WHERE id=?", po3.id).status === "paid", "RazorpayX 'processed' → Paid");
r = await Z("admin/payouts", undefined, "fin"); ok(r.j.provider === "razorpayx" && r.j.items.every((x) => !x.enc && !/123456789012|aarav@okicici/.test(JSON.stringify(x))), "the admin list shows only the masked method");
ok(!all.some((t) => /123456789012|cf_payout_SECRET|rzp_SECRET|test-payout-key/.test(t)), "no account number, key or secret in any answer");

/* ---------- 4. Brain business tools (read-only) ---------- */
const ctx = { env, owner: { email: "anmol@fodo.co.in", id: "x" } };
ok(["biz_analytics", "mk_refunds_open", "mk_payouts_due", "mk_disputes_open", "privacy_requests"].every((k) => TOOLS[k] && TOOLS[k].level === 0), "5 new Brain tools, all read-only (level 0)");
const pd = await TOOLS.mk_payouts_due.run(ctx, {}); ok(pd.automatic === "razorpayx" && pd.items.some((x) => x.status === "failed" && x.failure), "Brain: payouts still owed, with the failure reason");
const an = await TOOLS.biz_analytics.run(ctx, {}); ok(an.market.gmv30 === 17000 && !an.trend, "Brain: business numbers (GMV ₹17,000) from the database");
ok(!Object.keys(TOOLS).some((k) => /payout_send|send_payout|refund_process/.test(k)), "the Brain still can't send money");

/* ---------- 5. builder smoothness + error reports ---------- */
const WB = fs.readFileSync(new URL("../js/website-builder.js", import.meta.url), "utf8");
ok(/requestAnimationFrame\(\(\) => \{ paintQ = 0; paintNow\(\); \}\)/.test(WB) && /iframe\.wb-back/.test(WB) && /fodo:"scroll"/.test(WB), "canvas: one repaint per moment, built in a hidden frame, scroll position kept");
ok(/!ED \|\| !e\.source/.test(WB) && /mine && d\.fodo !== "checked"/.test(WB), "message handler can't crash when the canvas is gone");
ok(/_status === 429 \|\| r\._status >= 500/.test(WB) && /client-error/.test(WB), "autosave retries with backoff; real errors are reported");
await login("anmol@fodo.co.in", null, "own");
r = await call("sites/client-error", { msg: "TypeError: x is null at https://www.fodo.co.in/js/wb-v42.js?v=1 for riya@example.com", src: "https://www.fodo.co.in/js/wb-v42.js?v=1", line: 12, build: "123", ua: "Mozilla/5.0 Firefox/131.0" }, { as: "c" }); ok(r.j.ok, "the builder reports an error");
await call("sites/client-error", { msg: "TypeError: x is null at https://www.fodo.co.in/js/wb-v42.js?v=1 for riya@example.com", src: "https://www.fodo.co.in/js/wb-v42.js?v=1", line: 12, build: "124", ua: "Mozilla/5.0 Firefox/131.0" }, { as: "c" });
r = await call("sites/system-health", undefined, { as: "own" }); const ce = r.j.clientErrors[0]; ok(ce && ce.n === 2 && ce.ua === "Firefox" && ce.src === "/js/wb-v42.js:12" && !/riya@example|https:/.test(ce.msg), "System health lists it: counted once, browser + file:line, no emails or full URLs");
r = await call("sites/system-health", undefined, { as: "c" }); ok(r.status === 403, "only owners see error reports");
const SA = fs.readFileSync(new URL("../functions/api/sites/[[path]].js", import.meta.url), "utf8"); ok(/sites-save:/.test(SA) && /autosave \? 3600 : 600/.test(SA), "autosaves have their own large allowance (no 'too many changes' while editing)");
const PN = fs.readFileSync(new URL("../js/wb-panels.js", import.meta.url), "utf8"); ok(/i\.type === "range" \? 140 : 0/.test(PN), "design sliders repaint a few times, not on every pixel");

/* ---------- 6. CSP + cross-browser ---------- */
const HD = fs.readFileSync(new URL("../_headers", import.meta.url), "utf8"), block = (p) => (HD.split("\n" + p + "\n")[1] || "").split(/\n\//)[0];
for (const p of ["/workspace/*", "/fodo-pros/*", "/website-builder/*"]) ok(/\n  Content-Security-Policy: default-src 'self'/.test("\n" + block(p)) && /object-src 'none'/.test(block(p)) && /frame-ancestors 'self'/.test(block(p)) && /report-uri \/api\/csp-report/.test(block(p)), "CSP enforced on " + p + " (object-src none, framing blocked, violations reported)");
ok(/^\/\*\n  Content-Security-Policy-Report-Only:/.test(HD), "marketing pages stay report-only (nothing breaks there)");
ok(fs.existsSync(new URL("../.github/workflows/fodo-browsers.yml", import.meta.url)) && /browser: \[chromium, firefox, webkit\]/.test(fs.readFileSync(new URL("../.github/workflows/fodo-browsers.yml", import.meta.url), "utf8")) && fs.existsSync(new URL("cross-browser.test.js", import.meta.url)), "GitHub workflow tests Chromium, Firefox and WebKit (Safari) on every push");
console.log("\nv462: " + pass + " passed, " + fail + " failed"); if (fail) process.exit(1);
