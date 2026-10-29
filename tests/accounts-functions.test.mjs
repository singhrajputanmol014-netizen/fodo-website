// Growth Lab accounts, plans, credits and Cashfree payments — functions/api/account + X-Ray start with plans.
// D1 = real SQLite (node:sqlite); Google (real RS256 tokens from a test key), Resend and Cashfree are mocked.
// Run: node --no-warnings tests/accounts-functions.test.mjs
import { DatabaseSync } from "node:sqlite";
import { webcrypto as wc, createHmac } from "node:crypto";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as xray } from "../functions/api/xray/[[path]].js";
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
  const isX = path.indexOf("xray/") === 0, p = isX ? path.slice(5) : path;
  const h = Object.assign({ "cf-connecting-ip": o.ip || "7.7.7.7", origin: o.origin || SITE }, body !== undefined ? { "content-type": "application/json" } : {}, o.cookie !== undefined ? (o.cookie ? { cookie: o.cookie } : {}) : cookie ? { cookie } : {}, o.headers || {});
  const req = new Request(SITE + "/api/" + (isX ? "xray/" : "account/") + p, { method: body !== undefined ? "POST" : "GET", headers: h, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  const r = await (isX ? xray : account)({ request: req, env, params: { path: p.split("?")[0].split("/") } });
  const sc = r.headers.get("set-cookie"); if (sc && !o.noKeep) cookie = /Max-Age=0/.test(sc) ? "" : sc.split(";")[0];
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, j, sc };
};

/* ---------- mocks: Google keys, Resend, Cashfree ---------- */
const kp = await wc.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const pubJwk = Object.assign(await wc.subtle.exportKey("jwk", kp.publicKey), { kid: "k1", alg: "RS256", use: "sig" });
const b64u = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function gToken(claims, kid) { const h = b64u(JSON.stringify({ alg: "RS256", kid: kid || "k1", typ: "JWT" })), p = b64u(JSON.stringify(Object.assign({ iss: "https://accounts.google.com", aud: "gid.apps.googleusercontent.com", exp: Math.floor(Date.now() / 1000) + 600, email_verified: true }, claims)));
  const sig = await wc.subtle.sign("RSASSA-PKCS1-v1_5", kp.privateKey, new TextEncoder().encode(h + "." + p)); return h + "." + p + "." + b64u(new Uint8Array(sig)); }
const mails = [], cfCalls = [], CF = { orders: {}, subs: {} };
globalThis.fetch = async (u, o = {}) => {
  u = String(u);
  if (/googleapis\.com\/oauth2\/v3\/certs/.test(u)) return new Response(JSON.stringify({ keys: [pubJwk] }));
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

function activeOf(email) { const u = user(email); return u.plan && u.plan !== "free" && Date.parse(u.plan_until) > Date.now() ? u.plan : "free"; }
console.log(`\naccounts: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
