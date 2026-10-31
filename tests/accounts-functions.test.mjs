// Growth Lab accounts, plans, credits and Cashfree payments, functions/api/account + X-Ray start with plans.
// D1 = real SQLite (node:sqlite); Google (real RS256 tokens from a test key), Resend and Cashfree are mocked.
// Run: node --no-warnings tests/accounts-functions.test.mjs
import { DatabaseSync } from "node:sqlite";
import { webcrypto as wc, createHmac } from "node:crypto";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as xray } from "../functions/api/xray/[[path]].js";
import { onRequest as admin } from "../functions/api/admin/[[path]].js";
import { onRequestPost as beacon } from "../functions/api/t.js";
import { PLANS, limitsFor, publicPlans } from "../functions/_lib/plans.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };

function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, a = []) => ({ bind: (...x) => st(sql, x), run: async () => { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }), _x: () => db.prepare(sql).run(...a) });
  return { db, prepare: (s) => st(s), batch: async (l) => l.map((s) => (s._x(), { success: true })) };
}
const kv = () => { const m = new Map(); return { get: async (k, t) => { const v = m.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; }, put: async (k, v) => { m.set(k, v); } }; };
const SITE = "https://www.fodo.co.in";
let cookie = "";
const call = async (env, path, body, o = {}) => {
  const isA = path.indexOf("admin/") === 0, isX = path.indexOf("xray/") === 0, p = isX ? path.slice(5) : isA ? path.slice(6) : path;
  const h = Object.assign({ "cf-connecting-ip": o.ip || "7.7.7.7", origin: o.origin || SITE }, body !== undefined ? { "content-type": "application/json" } : {}, o.cookie !== undefined ? (o.cookie ? { cookie: o.cookie } : {}) : cookie ? { cookie } : {}, o.headers || {});
  const req = new Request(SITE + "/api/" + (isX ? "xray/" : isA ? "admin/" : "account/") + p, { method: body !== undefined ? "POST" : "GET", headers: h, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  const r = await (isX ? xray : isA ? admin : account)({ request: req, env, params: { path: p.split("?")[0].split("/") } });
  const sc = r.headers.get("set-cookie"); if (sc && !o.noKeep) cookie = /Max-Age=0/.test(sc) ? "" : sc.split(";")[0];
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, j, sc };
};

/* ---------- mocks: Google keys, Resend, Cashfree ---------- */
const kp = await wc.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const pubJwk = Object.assign(await wc.subtle.exportKey("jwk", kp.publicKey), { kid: "k1", alg: "RS256", use: "sig" });
const b64u = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function gToken(claims, kid) { const h = b64u(JSON.stringify({ alg: "RS256", kid: kid || "k1", typ: "JWT" })), p = b64u(JSON.stringify(Object.assign({ iss: "https://accounts.google.com", aud: "gid.apps.googleusercontent.com", exp: Math.floor(Date.now() / 1000) + 600, email_verified: true }, claims)));
  const sig = await wc.subtle.sign("RSASSA-PKCS1-v1_5", kp.privateKey, new TextEncoder().encode(h + "." + p)); return h + "." + p + "." + b64u(new Uint8Array(sig)); }
const waSent = [], mails = [], cfCalls = [], CF = { orders: {}, subs: {} };
globalThis.fetch = async (u, o = {}) => {
  u = String(u);
  if (/googleapis\.com\/oauth2\/v3\/certs/.test(u)) return new Response(JSON.stringify({ keys: [pubJwk] }));
  if (/graph\.facebook\.com\/v21\.0\/PHONEID\/messages/.test(u)) { waSent.push(JSON.parse(o.body)); return new Response('{"messages":[{"id":"wamid.1"}]}'); }
  if (/securetoken@system\.gserviceaccount\.com/.test(u)) return new Response(JSON.stringify({ keys: [Object.assign({}, pubJwk, { kid: "fb1" })] }));
  if (/api\.resend\.com\/emails/.test(u)) { const b = JSON.parse(o.body); mails.push(b); return new Response(JSON.stringify({ id: "m1" })); }
  if (/sandbox\.cashfree\.com\/pg/.test(u)) {
    cfCalls.push({ u, m: o.method, h: o.headers, b: o.body ? JSON.parse(o.body) : null });
    if (o.headers["x-client-secret"] !== "CFSECRET" || o.headers["x-client-id"] !== "CFAPP") return new Response('{"message":"auth failed"}', { status: 401 });
    let m;
    if (/\/orders$/.test(u) && o.method === "POST") { const b = JSON.parse(o.body); CF.orders[b.order_id] = Object.assign({ order_status: "ACTIVE", cf_order_id: 900 + Object.keys(CF.orders).length, payment_session_id: "sess_" + b.order_id }, b); return new Response(JSON.stringify(CF.orders[b.order_id])); }
    if ((m = /\/orders\/([^/?]+)$/.exec(u))) return new Response(JSON.stringify(CF.orders[decodeURIComponent(m[1])] || {}), { status: CF.orders[decodeURIComponent(m[1])] ? 200 : 404 });
    if (/\/subscriptions$/.test(u) && o.method === "POST") { const b = JSON.parse(o.body); CF.subs[b.subscription_id] = Object.assign({ subscription_status: "INITIALIZED", subscription_session_id: "subs_" + b.subscription_id }, b); return new Response(JSON.stringify(CF.subs[b.subscription_id])); }
    if ((m = /\/subscriptions\/([^/?]+)\/manage$/.exec(u))) { CF.subs[decodeURIComponent(m[1])].subscription_status = "CANCELLED"; return new Response("{}"); }
    if ((m = /\/subscriptions\/([^/?]+)$/.exec(u))) return new Response(JSON.stringify(CF.subs[decodeURIComponent(m[1])] || {}));
  }
  return new Response("{}", { status: 404 });
};
const D = d1();
const env = { ACCOUNTS_ENABLED: "1", XRAY_DB: D, CHAT_KV: kv(), GOOGLE_CLIENT_ID: "gid.apps.googleusercontent.com", RESEND_API_KEY: "re_x", MAIL_FROM: "FODO <login@fodo.co.in>", CASHFREE_APP_ID: "CFAPP", CASHFREE_SECRET_KEY: "CFSECRET", CASHFREE_ENV: "sandbox", CASHFREE_SUBSCRIPTIONS: "1" };
const sign = (ts, raw) => createHmac("sha256", "CFSECRET").update(ts + raw).digest("base64");
const hook = (obj) => { const raw = JSON.stringify(obj), ts = String(Math.floor(Date.now() / 1000)); return call(env, "webhook/cashfree", raw, { headers: { "x-webhook-timestamp": ts, "x-webhook-signature": sign(ts, raw) }, cookie: "" }); };
const user = (email) => D.db.prepare("SELECT * FROM acct_users WHERE email=?").get(email);

/* ---------- 1. plans ---------- */
ok(Object.keys(PLANS).join() === "free,starter,growth,pro,agency" && [0, 499, 1499, 3999, 9999].join() === Object.values(PLANS).map((p) => p.price).join(), "5 levels: ₹0 / 499 / 1,499 / 3,999 / 9,999");
ok(limitsFor("free").MAX_PAGES === 15 && limitsFor("pro").MAX_PAGES === 300 && limitsFor("agency").MAX_PAGES === 500 && limitsFor("pro").LINKCHECK === 80 && limitsFor("starter").LINKCHECK === 0, "plan limits: pages and link checks grow by level");
const pp = publicPlans({ seo: false, authority: false });
ok(!pp.plans.find((p) => p.id === "growth").features.some((f) => f.id === "volume") && pp.plans.find((p) => p.id === "growth").pending.some((f) => f.id === "volume"), "features whose data source is missing are not listed for sale (search volume without SEO provider)");
let r = await call({ CHAT_KV: kv() }, "config"); ok(r.j.enabled === false && r.j.plans.length === 5, "accounts off (no D1/flag): config says disabled, site stays in anonymous mode");
r = await call(env, "config"); ok(r.j.enabled && r.j.google === "gid.apps.googleusercontent.com" && r.j.email && r.j.payments && r.j.autoRenew && JSON.stringify(r.j).indexOf("CFSECRET") < 0 && JSON.stringify(r.j).indexOf("re_x") < 0, "config: Google id + switches, no secrets");

/* ---------- 2. email one-time code ---------- */
r = await call(env, "otp/send", { email: "not-an-email" }); ok(r.status === 400, "bad email refused");
r = await call(env, "otp/send", { email: "Priya@Example.com" }); const code = (mails[0] && /(\d{6})/.exec(mails[0].subject) || [])[1];
ok(r.j.ok && mails.length === 1 && mails[0].to[0] === "priya@example.com" && code && mails[0].from === "FODO <login@fodo.co.in>", "code emailed through Resend (" + code + ")");
{ const h = D.db.prepare("SELECT code_hash FROM acct_otps").get().code_hash; ok(/^[a-f0-9]{64}$/.test(h) && h.indexOf(code) < 0, "code stored only as a hash"); }
r = await call(env, "otp/send", { email: "priya@example.com" }); ok(r.status === 429, "second code within a minute → wait");
r = await call(env, "otp/verify", { email: "priya@example.com", code: code === "111111" ? "222222" : "111111" }); ok(r.status === 401 && D.db.prepare("SELECT tries FROM acct_otps").get().tries === 1, "wrong code counted");
r = await call(env, "otp/verify", { email: "priya@example.com", code });
ok(r.j.ok && /^fodo_s=[a-z0-9]{40}; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax/.test(r.sc) && r.j.user.plan === "free" && r.j.user.credits.free === 2, "right code → logged in (HttpOnly cookie), new account gets 2 free X-Rays");
const priyaCookie = cookie;
ok(D.db.prepare("SELECT count(*) n FROM acct_otps").get().n === 0, "code can't be reused");
r = await call(env, "me"); ok(r.j.user && r.j.user.email === "priya@example.com", "me → the logged-in user");
r = await call(env, "profile", { phone: "12345" }, {}); ok(r.status === 400, "bad phone refused");
r = await call(env, "logout", {}); ok(r.j.ok && cookie === "", "logout clears the cookie"); r = await call(env, "me"); ok(r.j.user === null, "after logout: no user");
cookie = priyaCookie;
r = await call(env, "profile", { name: "Priya" }, { origin: "https://evil.example" }); ok(r.status === 403, "cross-site POST refused (CSRF)");

/* ---------- 3. Google sign-in ---------- */
r = await call(env, "google", { credential: await gToken({ sub: "g1", email: "rohit@gmail.com", name: "Rohit" }) }, { cookie: "" });
ok(r.j.ok && r.j.user.email === "rohit@gmail.com" && user("rohit@gmail.com").google_sub === "g1", "Google token verified (RS256 + aud + iss + exp) → account created");
const rohitCookie = cookie;
r = await call(env, "google", { credential: await gToken({ sub: "g2", email: "x@gmail.com", aud: "someone-else" }) }, { cookie: "" }); ok(r.status === 401 && /audience/.test(r.j.reason), "token for another app refused");
r = await call(env, "google", { credential: await gToken({ sub: "g3", email: "x@gmail.com", exp: 1000 }) }, { cookie: "" }); ok(r.status === 401 && /expired/.test(r.j.reason), "expired token refused");
let bad = await gToken({ sub: "g4", email: "y@gmail.com" }); bad = bad.slice(0, -4) + (bad.slice(-4) === "AAAA" ? "BBBB" : "AAAA");
r = await call(env, "google", { credential: bad }, { cookie: "" }); ok(r.status === 401 && /signature/.test(r.j.reason), "tampered token refused");
r = await call(env, "google", { credential: await gToken({ sub: "g5", email: "priya@example.com" }) }, { cookie: "" }); ok(r.status === 409, "non-Gmail address Google can't vouch for is NOT merged into an existing email account");
r = await call(env, "google", { credential: await gToken({ sub: "g6", email: "priya@example.com", hd: "example.com" }) }, { cookie: "" }); ok(r.j.ok && user("priya@example.com").google_sub === "g6", "verified Workspace address links to the existing account");
const priyaCookie2 = cookie;

/* ---------- 4. X-Ray needs login, spends credits ---------- */
cookie = "";
r = await call(env, "xray/start", { url: "spicehub.test" }); ok(r.status === 401 && r.j.login, "X-Ray without login → 401 'log in, first 2 free'");
cookie = rohitCookie;
r = await call(env, "xray/start", { url: "spicehub.test" }); const job1 = r.j.jobId;
ok(r.j.ok && r.j.tier === "free" && r.j.credit === "free" && r.j.limits.MAX_PAGES === 15 && r.j.limits.MAX_COMPETITORS === 2, "1st X-Ray: free credit, free limits (15 pages, 2 competitors)");
r = await call(env, "xray/start", { url: "flowdesk.test" }); ok(r.j.ok && user("rohit@gmail.com").free_left === 0, "2nd X-Ray: last free one");
r = await call(env, "xray/start", { url: "aromaco.test" }); ok(r.status === 402 && r.j.upgrade, "3rd X-Ray → 402 'pick a plan or pack'");
r = await call(env, "xray/linkcheck", { jobId: job1, urls: ["https://example.com/"] }); ok(r.status === 402 && r.j.upgrade === "pro", "free plan: link check is a Pro feature (server-side)");
r = await call(Object.assign({}, env, { DATAFORSEO_LOGIN: "l", DATAFORSEO_PASSWORD: "p" }), "xray/seo", { jobId: job1, keywords: ["a"] }); ok(r.status === 402 && r.j.upgrade === "growth", "free plan: search volume is a Growth feature (server-side)");
ok(D.db.prepare("SELECT tier, credit, status FROM acct_runs WHERE job_id=?").get(job1).credit === "free", "run recorded with its plan and credit");
// refund: the site could not be read at all
r = await call(env, "xray/refund", { jobId: job1 }); ok(r.j.refunded && user("rohit@gmail.com").free_left === 1, "X-Ray that could not run → credit back");
r = await call(env, "xray/refund", { jobId: job1 }); ok(!r.j.ok && user("rohit@gmail.com").free_left === 1, "refund only once");

/* ---------- 5. pay for a plan (one-time month) ---------- */
r = await call(env, "checkout", { kind: "plan", item: "growth" }); ok(r.status === 400 && r.j.needPhone, "checkout asks for a mobile number first");
r = await call(env, "checkout", { kind: "plan", item: "growth", phone: "98100 12345" });
const oid = r.j.orderId, ord = CF.orders[oid];
ok(r.j.ok && r.j.paymentSessionId === "sess_" + oid && ord.order_amount === 1499 && ord.customer_details.customer_phone === "9810012345" && /\/account\/\?order_id=fo_/.test(ord.order_meta.return_url) && /webhook\/cashfree$/.test(ord.order_meta.notify_url), "Cashfree order created server-side (₹1,499, phone, return + webhook URLs)");
ok(cfCalls[0].h["x-api-version"] && cfCalls[0].h["x-idempotency-key"] === oid, "Cashfree called with API version + idempotency key");
r = await call(env, "verify", { order_id: oid }); ok(!r.j.paid && r.j.status === "ACTIVE" && activeOf("rohit@gmail.com") === "free", "not paid yet → nothing granted (browser return is not proof)");
CF.orders[oid].order_status = "PAID";
r = await call(env, "verify", { order_id: oid }); const ru = user("rohit@gmail.com");
ok(r.j.paid && ru.plan === "growth" && ru.monthly_left === 30 && Date.parse(ru.plan_until) > Date.now() + 29 * 864e5, "paid (re-read from Cashfree) → Growth for 30 days with 30 X-Rays");
r = await call(env, "verify", { order_id: oid }); ok(user("rohit@gmail.com").monthly_left === 30, "verifying again grants nothing twice");
r = await hook({ type: "PAYMENT_SUCCESS_WEBHOOK", data: { order: { order_id: oid } } }); ok(r.status === 200 && user("rohit@gmail.com").monthly_left === 30, "late webhook for the same order: no double credit");
r = await call(env, "xray/start", { url: "aromaco.test" }); ok(r.j.ok && r.j.tier === "growth" && r.j.credit === "monthly" && r.j.limits.MAX_PAGES === 150 && r.j.limits.features.indexOf("compare") > -1, "next X-Ray runs at Growth level (150 pages, compare…)");
r = await call(env, "checkout", { kind: "plan", item: "starter", phone: "9810012345" }); ok(r.status === 409, "can't buy a smaller plan while a bigger one is active");
r = await call(env, "history"); ok(r.j.ok && r.j.items.length >= 3, "history (Starter+) lists the X-Rays");
// tampered amount
r = await call(env, "checkout", { kind: "pack", item: "p20", phone: "9810012345" }); const oid2 = r.j.orderId; CF.orders[oid2].order_status = "PAID"; CF.orders[oid2].order_amount = 1;
r = await call(env, "verify", { order_id: oid2 }); ok(!r.j.paid && user("rohit@gmail.com").pack_left === 0, "paid amount ≠ price → nothing granted");
CF.orders[oid2].order_amount = 999;
// webhook path for the pack
r = await call(env, "webhook/cashfree", JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK", data: { order: { order_id: oid2 } } }), { headers: { "x-webhook-timestamp": "1", "x-webhook-signature": "bad" }, cookie: "" }); ok(r.status === 401 && user("rohit@gmail.com").pack_left === 0, "webhook with a wrong signature is rejected");
r = await hook({ type: "PAYMENT_SUCCESS_WEBHOOK", data: { order: { order_id: oid2 } } }); ok(r.status === 200 && user("rohit@gmail.com").pack_left === 20, "signed webhook → pack of 20 X-Rays added");
r = await call(env, "verify", { order_id: oid2 }, { cookie: priyaCookie2, noKeep: true }); ok(r.status === 404, "someone else can't verify your order");

/* ---------- 6. auto-renew subscription ---------- */
cookie = priyaCookie2;
r = await call(env, "checkout", { kind: "plan", item: "pro", phone: "9876543210", autoRenew: true }); const sid = r.j.subscriptionId, sub = CF.subs[sid];
ok(r.j.ok && r.j.subsSessionId === "subs_" + sid && sub.plan_details.plan_amount === 3999 && sub.plan_details.plan_interval_type === "MONTH" && sub.authorization_details.authorization_amount === 3999 && /\+05:30$/.test(sub.subscription_first_charge_time), "auto-renew: Cashfree subscription (₹3,999/month, first month charged at sign-up)");
r = await call(env, "verify", { subscription_id: sid }); ok(!r.j.active && activeOf("priya@example.com") === "free", "mandate not approved yet → nothing granted");
CF.subs[sid].subscription_status = "ACTIVE";
r = await call(env, "verify", { subscription_id: sid }); ok(r.j.active && user("priya@example.com").plan === "pro" && user("priya@example.com").monthly_left === 80, "mandate active → Pro with 80 X-Rays");
const until1 = user("priya@example.com").plan_until;
await hook({ type: "SUBSCRIPTION_PAYMENT_SUCCESS", data: { subscription_id: sid, cf_payment_id: 555, payment_status: "SUCCESS", payment_type: "AUTH", payment_amount: 3999 } });
ok(user("priya@example.com").plan_until === until1, "the sign-up (AUTH) charge is not counted twice");
await hook({ type: "SUBSCRIPTION_PAYMENT_SUCCESS", data: { subscription_id: sid, cf_payment_id: 556, payment_status: "SUCCESS", payment_type: "PERIODIC", payment_amount: 3999 } });
await hook({ type: "SUBSCRIPTION_PAYMENT_SUCCESS", data: { subscription_id: sid, cf_payment_id: 556, payment_status: "SUCCESS", payment_type: "PERIODIC", payment_amount: 3999 } });
ok(Date.parse(user("priya@example.com").plan_until) - Date.parse(until1) > 29 * 864e5 && Date.parse(user("priya@example.com").plan_until) - Date.parse(until1) < 31 * 864e5, "monthly renewal webhook → +1 month, once (duplicate webhook ignored)");
r = await call(env, "cancel", {}); ok(r.j.ok && CF.subs[sid].subscription_status === "CANCELLED", "cancel stops auto-renew (plan stays until its end date)");

/* ---------- 7. agency: team shares plan & credits ---------- */
cookie = rohitCookie;
r = await call(env, "team", { email: "a@b.com" }); ok(r.status === 402, "team is an Agency feature");
D.db.prepare("UPDATE acct_users SET plan='agency', monthly_left=250 WHERE email='rohit@gmail.com'").run();
r = await call(env, "team", { email: "intern@gmail.com" }); ok(r.j.ok, "agency owner adds a team member");
r = await call(env, "clients", { name: "Spice Hub" }); const cid = r.j.id; ok(r.j.ok && /^c_/.test(cid), "client folder created");
r = await call(env, "google", { credential: await gToken({ sub: "g9", email: "intern@gmail.com" }) }, { cookie: "" });
ok(r.j.user.plan === "agency" && r.j.user.team.owner === "rohit@gmail.com", "team member logs in → sees the owner's Agency plan");
r = await call(env, "xray/start", { url: "spicehub.test", client: cid }); const before = user("rohit@gmail.com").monthly_left;
ok(r.j.tier === "agency" && r.j.limits.MAX_PAGES === 500 && D.db.prepare("SELECT client_id, owner_id FROM acct_runs WHERE job_id=?").get(r.j.jobId).client_id === cid && user("intern@gmail.com").free_left === 2, "member's X-Ray uses the owner's credits at Agency level, filed under the client");
r = await call(env, "checkout", { kind: "pack", item: "p5", phone: "9810012345" }); ok(r.status === 403, "team member can't pay for the owner's plan");
r = await call(env, "brand", { name: "Acme Digital", logo: "data:image/png;base64,AAAA" }, { cookie: rohitCookie }); ok(r.status === 400, "white-label logo must be a small JPEG");
r = await call(env, "brand", { name: "Acme Digital", color: "#112233", logo: "data:image/jpeg;base64,/9j/AAAA" }, { cookie: rohitCookie }); ok(r.j.ok, "white-label brand saved");
r = await call(env, "me", undefined, { cookie: rohitCookie }); ok(r.j.user.brand.name === "Acme Digital", "brand returned for the PDF");
cookie = rohitCookie;

/* ---------- 8. abuse limits ---------- */
for (let i = 0; i < 4; i++) await call(env, "otp/send", { email: "spam" + i + "@x.com" }, { ip: "9.9.9.1" });
let last; for (let i = 4; i < 32; i++) last = await call(env, "otp/send", { email: "spam" + i + "@x.com" }, { ip: "9.9.9.1" }); ok(last.status === 429, "max 30 codes per hour from one network (mobile networks share addresses)");
const ledger = D.db.prepare("SELECT count(*) n FROM acct_ledger WHERE ref LIKE 'order:%'").get().n; ok(ledger === 2, "ledger has one entry per paid order (" + ledger + ")");
ok(D.db.prepare("SELECT count(*) n FROM acct_sessions").get().n >= 3 && !D.db.prepare("SELECT token_hash FROM acct_sessions").all().some((s) => cookie.indexOf(s.token_hash) > -1), "sessions stored as hashes, not tokens");

/* ---------- 9. FODO owner logins: everything free ---------- */
r = await call(env, "google", { credential: await gToken({ sub: "own1", email: "anmol@fodo.co.in" }) }, { cookie: "", ip: "5.5.5.5" }); ok(r.status === 409, "owner address via a Google account Google can't vouch for → must use the email code");
r = await call(env, "google", { credential: await gToken({ sub: "own2", email: "SinghRajputAnmol014@gmail.com" }) }, { cookie: "", ip: "5.5.5.5" });
ok(r.j.ok && r.j.user.plan === "agency" && r.j.user.unlimited && r.j.user.credits.total === "∞" && r.j.user.limits.features.indexOf("whiteLabel") > -1, "owner Gmail login → Owner: Agency level, every feature, unlimited");
for (let i = 0; i < 4; i++) { r = await call(env, "xray/start", { url: "spicehub.test" }, { ip: "5.5.5.5" }); if (!r.j.ok) break; }
const ow = user("singhrajputanmol014@gmail.com");
ok(r.j.ok && r.j.tier === "agency" && r.j.credit === "owner" && ow.free_left === 2 && ow.monthly_left === 0, "4 owner X-Rays at Agency level, no credit spent");
r = await call(env, "xray/linkcheck", { jobId: r.j.jobId, urls: [] }, { ip: "5.5.5.5" }); ok(r.status === 200, "owner: Pro/Agency checks allowed");
r = await call(env, "checkout", { kind: "plan", item: "pro", phone: "9810012345" }, { ip: "5.5.5.5" }); ok(r.status === 409 && !CF.orders[r.j.orderId], "owner is never sent to payment");
r = await call(env, "otp/send", { email: "anmol@fodo.co.in" }, { cookie: "", ip: "5.5.5.6" }); const oc = (/(\d{6})/.exec(mails.slice(-1)[0].subject) || [])[1];
r = await call(env, "otp/verify", { email: "anmol@fodo.co.in", code: oc }, { ip: "5.5.5.6" }); ok(r.j.ok && r.j.user.unlimited && r.j.user.planName === "Owner", "anmol@fodo.co.in via email code → Owner");
r = await call(env, "google", { credential: await gToken({ sub: "x9", email: "someone@gmail.com" }) }, { cookie: "", ip: "5.5.5.7" }); ok(r.j.ok && !r.j.user.unlimited && r.j.user.plan === "free", "any other email stays on the normal plans");

/* ---------- 10. v14 FODO Edge: Agency/owner only, AI output checked against the pack ---------- */
const aiEnv = Object.assign({}, env, { AI: { run: async (m, inp) => ({ response: JSON.stringify(/copywriter/.test(inp.messages[0].content) ? { pages: [{ url: "https://spicehub.test/", title: "T", meta: "M", h1: "H" }, { url: "https://made-up.test/", title: "x", meta: "x", h1: "x" }], headlines: ["a"], faq: [], cta: "Go" } : { months: [{ month: 1, goal: "g", weeks: [{ week: 1, focus: "f", tasks: ["t"], opportunities: ["O1", "O77"], kpi: "k" }] }] }) }) } });
await call(aiEnv, "google", { credential: await gToken({ sub: "own2", email: "singhrajputanmol014@gmail.com" }) }, { cookie: "", ip: "5.5.5.5" });
r = await call(aiEnv, "xray/start", { url: "spicehub.test" }, { ip: "5.5.5.5" }); const ej = r.j.jobId;
r = await call(aiEnv, "xray/edge", { jobId: ej, kind: "fixPack", pack: { pages: [{ url: "https://spicehub.test/" }] } }, { ip: "5.5.5.5" });
ok(r.j.ok && r.j.result.pages.length === 1 && r.j.result.pages[0].url === "https://spicehub.test/", "Edge Fix Pack (owner): page the AI made up is dropped");
r = await call(aiEnv, "xray/edge", { jobId: ej, kind: "roadmap90", pack: { opportunities: [{ id: "O1" }] } }, { ip: "5.5.5.5" });
ok(r.j.ok && r.j.result.months[0].weeks[0].opportunities.join() === "O1", "Edge roadmap: only real opportunity ids kept");
r = await call(aiEnv, "xray/edge", { jobId: ej, kind: "nope", pack: {} }, { ip: "5.5.5.5" }); ok(r.status === 400, "unknown Edge tool refused");
r = await call(aiEnv, "google", { credential: await gToken({ sub: "pro9", email: "proguy@gmail.com" }) }, { cookie: "", ip: "5.5.5.8" });
D.db.prepare("UPDATE acct_users SET plan='pro', plan_until='2099-01-01T00:00:00Z', monthly_left=80 WHERE email='proguy@gmail.com'").run();
r = await call(aiEnv, "xray/start", { url: "spicehub.test" }, { ip: "5.5.5.8" });
r = await call(aiEnv, "xray/edge", { jobId: r.j.jobId, kind: "fixPack", pack: { pages: [] } }, { ip: "5.5.5.8" }); ok(r.status === 402 && r.j.upgrade === "agency", "Pro plan: FODO Edge is Agency-only (402)");
ok(PLANS.agency.features.filter((f) => ["fixPack", "battleCards", "roadmap90", "clientPitch"].indexOf(f) > -1).length === 4 && !PLANS.pro.features.some((f) => /fixPack|battleCards|roadmap90|clientPitch/.test(f)), "the 4 Edge tools exist only on Agency (and owner logins)");

/* ---------- 11. v15 admin dashboard API ---------- */
const ownerC = (await call(env, "google", { credential: await gToken({ sub: "own2", email: "singhrajputanmol014@gmail.com" }) }, { cookie: "", ip: "6.6.6.1", noKeep: false }), cookie);
const proC = (await call(env, "google", { credential: await gToken({ sub: "pro9", email: "proguy@gmail.com" }) }, { cookie: "", ip: "6.6.6.2" }), cookie);
r = await call(env, "admin/overview", undefined, { cookie: proC }); ok(r.status === 403 && r.j.forbidden, "normal user cannot open the admin dashboard");
r = await call(env, "admin/overview", undefined, { cookie: ownerC });
ok(r.j.ok && r.j.role === "owner" && r.j.users.total >= 6 && r.j.runs.total >= 5 && r.j.money.revenue >= 1499 && r.j.days.length === 30 && r.j.series.xrays.length === 30 && r.j.features.some((f) => f.kind === "xray_start") && r.j.funnel.signed === r.j.users.total, "owner overview: users " + r.j.users.total + ", X-Rays " + r.j.runs.total + ", revenue ₹" + r.j.money.revenue + ", 30-day series, feature usage, funnel");
r = await call(env, "admin/users?q=rohit", undefined, { cookie: ownerC }); const rohit = r.j.items[0];
ok(r.j.items.length === 1 && rohit.email === "rohit@gmail.com" && rohit.runs >= 3 && rohit.paid >= 1499, "user search: rohit@gmail.com with his X-Rays and payments");
r = await call(env, "admin/user/" + rohit.id, undefined, { cookie: ownerC });
ok(r.j.ok && r.j.usage.some((x) => x.kind === "xray_start") && r.j.usage.some((x) => x.kind === "login_google") && r.j.runs.length >= 3 && r.j.orders.length >= 2 && r.j.ledger.length, "user detail: feature-use counts, events, X-Rays, orders, credit history");
r = await call(env, "admin/leads", undefined, { cookie: ownerC }); ok(r.j.ok && Array.isArray(r.j.items), "leads list (ran out of free X-Rays, not paid)");
// viewer
r = await call(env, "admin/viewers", { email: "proguy@gmail.com" }, { cookie: ownerC }); ok(r.j.ok, "owner adds a view-only teammate");
r = await call(env, "admin/overview", undefined, { cookie: proC }); ok(r.j.ok && r.j.role === "viewer", "viewer can see the data");
const pid = user("proguy@gmail.com").id, sid9 = user("someone@gmail.com").id;
r = await call(env, "admin/user/" + sid9 + "/block", { blocked: true }, { cookie: proC }); ok(r.status === 403 && r.j.readOnly && !user("someone@gmail.com").blocked, "viewer cannot block anyone");
r = await call(env, "admin/user/" + sid9 + "/grant", { type: "unlimited", on: true }, { cookie: proC }); ok(r.status === 403 && !user("someone@gmail.com").unlimited, "viewer cannot give features");
// grants by owner
r = await call(env, "admin/user/" + sid9 + "/grant", { type: "features", features: ["techStack", "fixPack", "nonsense"] }, { cookie: ownerC });
ok(r.j.ok && r.j.features.join() === "techStack,fixPack", "owner gives single features free (unknown ones ignored)");
const smC = (await call(env, "google", { credential: await gToken({ sub: "x9", email: "someone@gmail.com" }) }, { cookie: "", ip: "6.6.6.3" }), cookie);
r = await call(env, "me", undefined, { cookie: smC }); ok(r.j.user.limits.features.indexOf("techStack") > -1 && r.j.user.limits.features.indexOf("fixPack") > -1 && r.j.user.plan === "free", "the user now has those features on the free plan");
r = await call(env, "admin/user/" + sid9 + "/grant", { type: "credits", n: 5 }, { cookie: ownerC }); ok(r.j.ok && user("someone@gmail.com").pack_left === 5, "owner gives 5 X-Rays free");
r = await call(env, "admin/user/" + sid9 + "/grant", { type: "plan", plan: "pro", days: 10 }, { cookie: ownerC }); const su = user("someone@gmail.com");
ok(r.j.ok && su.plan === "pro" && su.monthly_left === 80 && Date.parse(su.plan_until) - Date.now() > 9 * 864e5 && Date.parse(su.plan_until) - Date.now() < 11 * 864e5, "owner gives Pro free for 10 days");
r = await call(env, "admin/user/" + sid9 + "/grant", { type: "unlimited", on: true }, { cookie: ownerC });
r = await call(env, "xray/start", { url: "spicehub.test" }, { cookie: smC, ip: "6.6.6.3" }); ok(r.j.ok && r.j.credit === "gift" && r.j.tier === "pro" && user("someone@gmail.com").monthly_left === 80 && r.j.limits.features.indexOf("fixPack") > -1, "unlimited user: X-Ray at Pro level, nothing spent, given features included");
r = await call(env, "admin/user/" + sid9 + "/block", { blocked: true, note: "spam" }, { cookie: ownerC }); ok(r.j.ok && user("someone@gmail.com").blocked === 1, "owner blocks a user");
r = await call(env, "me", undefined, { cookie: smC }); ok(r.j.user === null, "blocked user is logged out at once");
r = await call(env, "google", { credential: await gToken({ sub: "x9", email: "someone@gmail.com" }) }, { cookie: "", ip: "6.6.6.3" }); ok(r.status === 403 && r.j.blocked, "blocked user cannot log in again");
r = await call(env, "admin/user/" + user("anmol@fodo.co.in").id + "/block", { blocked: true }, { cookie: ownerC }); ok(r.status === 409, "owner logins cannot be blocked");
r = await call(env, "admin/user/" + sid9 + "/block", { blocked: false }, { cookie: ownerC }); ok(!user("someone@gmail.com").blocked, "unblock");
r = await call(env, "admin/user/" + sid9, undefined, { cookie: ownerC }); ok(r.j.events.some((e) => e.kind === "admin_grant") && r.j.events.some((e) => e.kind === "admin_block") && r.j.events.some((e) => e.kind === "blocked_try"), "every admin action is in the user's history");
r = await call(env, "event", { kind: "export_pdf", detail: "spicehub.test" }, { cookie: ownerC }); ok(r.j.ok, "page reports a PDF download");
r = await call(env, "event", { kind: "paid" }, { cookie: ownerC }); ok(r.status === 400, "the page cannot fake payment or login events");
r = await call(env, "admin/viewers", { email: "proguy@gmail.com", remove: true }, { cookie: ownerC }); r = await call(env, "admin/overview", undefined, { cookie: proC }); ok(r.status === 403, "removed viewer loses access");

/* ---------- 12. v16: Firebase logins (Facebook, phone, …), admin role, website traffic ---------- */
const fbEnv = Object.assign({}, env, { FIREBASE_API_KEY: "AIza-test", FIREBASE_PROJECT_ID: "fodo-513118", FIREBASE_PROVIDERS: "facebook,phone,microsoft" });
const fbTok = (claims) => gToken(Object.assign({ iss: "https://securetoken.google.com/fodo-513118", aud: "fodo-513118", email_verified: false }, claims), "fb1");
r = await call(fbEnv, "config"); ok(r.j.firebase && r.j.firebase.projectId === "fodo-513118" && r.j.firebase.providers.join() === "facebook,phone,microsoft", "config lists the extra login options (public Firebase ids only)");
r = await call(fbEnv, "firebase", { idToken: await fbTok({ sub: "fbu1", phone_number: "+919876501234", firebase: { sign_in_provider: "phone" } }) }, { cookie: "", ip: "4.4.4.1" });
const phoneUser = D.db.prepare("SELECT * FROM acct_users WHERE fb_uid='fbu1'").get();
ok(r.j.ok && phoneUser && phoneUser.email === null && phoneUser.phone === "9876501234" && phoneUser.login_via === "phone" && r.j.user.credits.free === 2, "phone OTP login → new account without email, 2 free X-Rays");
r = await call(fbEnv, "firebase", { idToken: await fbTok({ sub: "fbu1", phone_number: "+919876501234", firebase: { sign_in_provider: "phone" } }) }, { cookie: "", ip: "4.4.4.1" }); ok(r.j.ok && r.j.user.id === phoneUser.id, "same phone logs into the same account");
r = await call(fbEnv, "firebase", { idToken: await fbTok({ sub: "fbu2", email: "rohit@gmail.com", firebase: { sign_in_provider: "facebook.com" } }) }, { cookie: "", ip: "4.4.4.1" }); ok(r.status === 409, "Facebook with an unverified email can't take over an existing account");
r = await call(fbEnv, "firebase", { idToken: await fbTok({ sub: "fbu3", email: "newfb@gmail.com", name: "FB Person", firebase: { sign_in_provider: "facebook.com" } }) }, { cookie: "", ip: "4.4.4.1" });
ok(r.j.ok && D.db.prepare("SELECT email FROM acct_users WHERE fb_uid='fbu3'").get().email === null && r.j.user.name === "FB Person", "Facebook login with an unverified email: account created without storing that email");
r = await call(fbEnv, "firebase", { idToken: await fbTok({ sub: "fbu4", email: "rohit@gmail.com", email_verified: true, firebase: { sign_in_provider: "microsoft.com" } }) }, { cookie: "", ip: "4.4.4.1" }); ok(r.j.ok && r.j.user.email === "rohit@gmail.com", "Microsoft login with a verified email joins the existing account");
r = await call(fbEnv, "firebase", { idToken: ((t) => t.slice(0, -12) + (t.charAt(t.length - 12) === "A" ? "B" : "A") + t.slice(-11))(await fbTok({ sub: "fbu5", firebase: { sign_in_provider: "phone" } })) }, { cookie: "", ip: "4.4.4.1" }); ok(r.status === 401, "tampered Firebase token refused");
r = await call(Object.assign({}, fbEnv, { FIREBASE_PROJECT_ID: "other-project" }), "firebase", { idToken: await fbTok({ sub: "fbu6", firebase: { sign_in_provider: "phone" } }) }, { cookie: "", ip: "4.4.4.1" }); ok(r.status === 401, "token from another Firebase project refused");
r = await call(env, "admin/events?limit=20", undefined, { cookie: ownerC }); ok(r.j.items.some((e) => e.kind === "login_phone") && r.j.items.some((e) => e.kind === "login_facebook"), "admin activity shows phone and Facebook logins");
// admin role: full control, set by an owner
r = await call(env, "admin/viewers", { email: "proguy@gmail.com", role: "admin" }, { cookie: ownerC }); ok(r.j.ok, "owner makes someone an admin");
r = await call(env, "admin/overview", undefined, { cookie: proC }); ok(r.j.role === "admin", "that person opens the dashboard as admin");
r = await call(env, "admin/user/" + sid9 + "/grant", { type: "credits", n: 3 }, { cookie: proC }); ok(r.j.ok, "admin can give X-Rays");
r = await call(env, "admin/viewers", { email: "intern@gmail.com", role: "viewer" }, { cookie: proC }); ok(r.j.ok, "admin can add team members");
r = await call(env, "admin/viewers", { email: "anmol@fodo.co.in", remove: true }, { cookie: proC }); ok(r.status === 409, "nobody can remove or change an owner");
r = await call(env, "admin/user/" + user("anmol@fodo.co.in").id + "/block", { blocked: true }, { cookie: proC }); ok(r.status === 409, "admin cannot block an owner");
r = await call(env, "admin/viewers", { email: "proguy@gmail.com", remove: true }, { cookie: ownerC });
// website traffic
const hit = async (body, o) => { o = o || {}; const req = new Request(SITE + "/api/t", { method: "POST", headers: { "user-agent": o.ua || "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Mobile Safari/604.1", "cf-connecting-ip": o.ip || "8.8.4.4", origin: SITE }, body: JSON.stringify(body) }); Object.defineProperty(req, "cf", { value: { country: o.c || "IN", city: o.city || "New Delhi" } }); return (await beacon({ request: req, env })).status; };
ok(await hit({ t: "pv", p: "/", r: "https://www.google.com/", q: "", w: 390, l: "en-IN" }) === 204, "beacon answers 204");
await hit({ t: "pv", p: "/services/seo/", r: "https://www.fodo.co.in/", w: 390 });
await hit({ t: "ev", p: "/services/seo/", e: [["whatsapp_click", "hero"], ["made_up", "x"]] });
await hit({ t: "time", p: "/services/seo/", s: 42 });
await hit({ t: "pv", p: "/", r: "https://chatgpt.com/", w: 1440 }, { ip: "1.2.3.4", ua: "Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537", c: "AE", city: "Dubai" });
await hit({ t: "pv", p: "/business-x-ray/", r: "", q: "?utm_source=instagram&utm_medium=social&utm_campaign=diwali", w: 390 }, { ip: "5.6.7.8" });
await hit({ t: "pv", p: "/", r: "" }, { ua: "Googlebot/2.1 (+http://www.google.com/bot.html)", ip: "66.249.1.1" });
r = await call(env, "admin/traffic?days=7", undefined, { cookie: ownerC }); const TD = r.j.dims, g = (k, key) => ((TD[k] || []).filter((x) => x.k === key)[0] || {}).n || 0;
ok(r.j.ok && g("uv", "all") === 3 && g("pv", "all") === 4 && g("ses", "all") === 3, "traffic: 3 visitors, 4 page views, 3 visits (the bot is not counted, IP not stored)");
ok(g("src", "Google") === 1 && g("src", "ChatGPT") === 1 && g("src", "instagram") + g("src", "Instagram") === 1 && g("ch", "AI assistants") === 1 && g("ch", "Search") === 1 && g("ch", "Social") === 1, "sources: Google (search), ChatGPT (AI assistant), Instagram campaign (social)");
ok(g("camp", "diwali · instagram") === 1 && g("country", "AE") === 1 && g("city", "Dubai, AE") === 1 && g("device", "Mobile") === 2 && g("device", "Desktop") === 1, "campaign, country, city and device counted");
ok(g("ev", "whatsapp_click") === 1 && !g("ev", "made_up") && g("conv_src", "Google") === 1 && g("tsum", "/services/seo/") === 42 && g("entry", "/") === 2, "WhatsApp click credited to Google; time on page; entry pages; unknown events ignored");
ok(r.j.live.now === 3 && r.j.series.uv.length === 7, "live visitors (last 5 min) + daily series");
ok(!JSON.stringify(D.db.prepare("SELECT * FROM web_vis").all()).match(/8\.8\.4\.4|1\.2\.3\.4/), "no IP address stored anywhere");
r = await call(env, "admin/traffic?days=7", undefined, { cookie: smC }); ok(r.status === 401 || r.status === 403, "traffic data is admin-only");

/* ---------- 13. v16.1 free WhatsApp login (visitor sends a code; incoming messages are free) ---------- */
const waEnv = Object.assign({}, env, { WA_NUMBER: "91 78270 07676", WA_PHONE_ID: "PHONEID", WA_TOKEN: "WATOKEN", WA_APP_SECRET: "WASECRET", WA_VERIFY_TOKEN: "verify-me" });
r = await call(waEnv, "config"); ok(r.j.whatsapp === true && JSON.stringify(r.j).indexOf("WATOKEN") < 0 && JSON.stringify(r.j).indexOf("WASECRET") < 0, "config: WhatsApp login on, no WhatsApp secrets shown");
const wv = await account({ request: new Request(SITE + "/api/account/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345"), env: waEnv, params: { path: ["webhook", "whatsapp"] } });
ok(wv.status === 200 && (await wv.text()) === "12345", "Meta webhook verification answered");
r = await call(waEnv, "wa/start", {}, { cookie: "", ip: "3.3.3.1" }); const W = r.j;
ok(W.ok && /^[A-Z2-9]{6}$/.test(W.code) && W.link.indexOf("https://wa.me/917827007676?text=FODO%20LOGIN%20" + W.code) === 0 && W.poll.length === 40, "start: code " + W.code + " and a wa.me link to FODO's number");
r = await call(waEnv, "wa/poll", { poll: W.poll }, { cookie: "", ip: "3.3.3.1" }); ok(r.j.waiting, "before the message: waiting");
const waHook = (obj, secret) => { const raw = JSON.stringify(obj); return account({ request: new Request(SITE + "/api/account/webhook/whatsapp", { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + createHmac("sha256", secret || "WASECRET").update(raw).digest("hex") }, body: raw }), env: waEnv, params: { path: ["webhook", "whatsapp"] } }); };
const msgOf = (from, text) => ({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages: [{ from, type: "text", text: { body: text } }] } }] }] });
ok((await waHook(msgOf("919811122233", "FODO LOGIN " + W.code), "wrong")).status === 401, "webhook with a wrong signature is ignored");
r = await call(waEnv, "wa/poll", { poll: W.poll }, { cookie: "", ip: "3.3.3.1" }); ok(r.j.waiting, "…so still waiting");
ok((await waHook(msgOf("919811122233", "FODO LOGIN " + W.code.toLowerCase() + ", please log me in"))).status === 200 && waSent.length === 1 && waSent[0].to === "919811122233" && /logged in/.test(waSent[0].text.body), "signed message from WhatsApp → number verified, free reply sent");
r = await call(waEnv, "wa/poll", { poll: W.poll }, { cookie: "", ip: "3.3.3.1" }); const wu = D.db.prepare("SELECT * FROM acct_users WHERE wa_phone='919811122233'").get();
ok(r.j.ok && /^fodo_s=/.test(r.sc || "") && wu && wu.phone === "9811122233" && wu.email === null && r.j.user.credits.free === 2, "poll → logged in with the WhatsApp number, new account with 2 free X-Rays");
r = await call(waEnv, "wa/poll", { poll: W.poll }, { cookie: "", ip: "3.3.3.1" }); ok(r.status === 409, "a code logs in only once");
r = await call(waEnv, "wa/start", {}, { cookie: "", ip: "3.3.3.1" }); await waHook(msgOf("919811122233", "FODO LOGIN " + r.j.code)); const again = await call(waEnv, "wa/poll", { poll: r.j.poll }, { cookie: "", ip: "3.3.3.1" });
ok(again.j.ok && again.j.user.id === wu.id, "same WhatsApp number → same account next time");
r = await call(waEnv, "wa/poll", { poll: "x".repeat(40) }, { cookie: "", ip: "3.3.3.1" }); ok(r.status === 410, "unknown poll token refused");
r = await call(env, "wa/start", {}, { cookie: "", ip: "3.3.3.1" }); ok(r.status === 503, "without WhatsApp settings the option is off");

function activeOf(email) { const u = user(email); return u.plan && u.plan !== "free" && Date.parse(u.plan_until) > Date.now() ? u.plan : "free"; }
console.log(`\naccounts: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
