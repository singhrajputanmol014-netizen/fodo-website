// v18 standalone PRO tools — server side: registry + admin prices, catalog, tool/start (reuse a recent X-Ray, fresh scan,
// plan-included, bought run, 402 buy), Cashfree checkout of one run (verified on the server), the X-Ray engine honouring a
// paid tool run, refunds, report library, admin stats. D1 = real SQLite (node:sqlite); every outside API is mocked.
// Run: node --no-warnings tests/v18-functions.test.mjs
import { DatabaseSync } from "node:sqlite";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as xray } from "../functions/api/xray/[[path]].js";
import { onRequest as admin } from "../functions/api/admin/[[path]].js";
import { onRequest as lab } from "../functions/api/lab/[[path]].js";
import { PRODUCTS, toolTier, includedIn, plansIncluding } from "../functions/_lib/products.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
console.log = ((orig) => (...a) => { if (typeof a[0] === "string" && a[0].charAt(0) === "{") return; orig(...a); })(console.log);

function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, a = []) => ({ bind: (...x) => st(sql, x), run: async () => { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }), _x: () => db.prepare(sql).run(...a) });
  return { db, prepare: (s) => st(s), batch: async (l) => l.map((s) => (s._x(), { success: true })) };
}
const SITE = "https://www.fodo.co.in", jars = {};
const call = async (env, path, body, o = {}) => {
  const who = o.as || "a", isA = path.indexOf("admin/") === 0, isX = path.indexOf("xray/") === 0, isL = path.indexOf("lab/") === 0, p = isX ? path.slice(5) : isA ? path.slice(6) : isL ? path.slice(4) : path;
  const h = Object.assign({ "cf-connecting-ip": "7.7.7.7", origin: SITE }, body !== undefined ? { "content-type": "application/json" } : {}, jars[who] ? { cookie: jars[who] } : {});
  const req = new Request(SITE + "/api/" + (isX ? "xray/" : isA ? "admin/" : isL ? "lab/" : "account/") + p, { method: body !== undefined ? "POST" : "GET", headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  const r = await (isX ? xray : isA ? admin : isL ? lab : account)({ request: req, env, params: { path: p.split("?")[0].split("/") } });
  const sc = r.headers.get("set-cookie"); if (sc) jars[who] = /Max-Age=0/.test(sc) ? "" : sc.split(";")[0];
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, j };
};
const login = (env, email, plan, who) => call(env, "test-login", Object.assign({ email }, plan ? { plan } : {}), { as: who });
const save = (env, job, who, extra) => xray({ request: new Request(SITE + "/api/xray/report", { method: "POST", headers: { "content-type": "application/json", "x-job": job, cookie: jars[who || "a"] }, body: JSON.stringify(Object.assign({ jobId: job, scores: { overall: 64 }, crawl: { blocked: null, pages: 3 }, completeness: { overall: 80, parts: [] } }, extra || {})) }), env, params: { path: ["report"] } });

const CF = { orders: {} };
globalThis.fetch = async (u, o = {}) => {
  u = String(u); let m;
  if (/sandbox\.cashfree\.com\/pg/.test(u)) {
    if (/\/orders$/.test(u) && o.method === "POST") { const b = JSON.parse(o.body); CF.orders[b.order_id] = Object.assign({ order_status: "ACTIVE", cf_order_id: 77, payment_session_id: "sess_" + b.order_id }, b); return new Response(JSON.stringify(CF.orders[b.order_id])); }
    if ((m = /\/orders\/([^/?]+)$/.exec(u))) return new Response(JSON.stringify(CF.orders[decodeURIComponent(m[1])] || {}));
  }
  return new Response("not mocked: " + u, { status: 599 });
};
const env = { XRAY_DB: d1(), ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", XRAY_PER_HOUR: "99", CASHFREE_APP_ID: "CFID", CASHFREE_SECRET_KEY: "CFSEC" };
const runs = () => env.XRAY_DB.db.prepare("SELECT * FROM lab_tool_runs ORDER BY created_at").all();
const credits = (email, tool) => { const u = env.XRAY_DB.db.prepare("SELECT id FROM acct_users WHERE email=?").get(email); const r = u && env.XRAY_DB.db.prepare("SELECT credits FROM lab_tool_credits WHERE user_id=? AND tool=?").get(u.id, tool); return r ? r.credits : 0; };

/* ---------- 1. registry ---------- */
ok(Object.keys(PRODUCTS).length === 13 && Object.values(PRODUCTS).every((p) => p.price > 0 && p.view.length && p.need.indexOf("fullReport") > -1), "13 standalone PRO tools, each with a price, the report part it shows and what it needs");
ok(toolTier("website-health") === "starter" && toolTier("war-room") === "growth" && toolTier("roadmap90") === "growth", "a bought run researches at the smallest plan level that covers the tool");
ok(includedIn("website-health", "starter") && !includedIn("war-room", "starter") && includedIn("war-room", "growth") && !includedIn("offer-strength", "free"), "plans include the tools their X-Rays cover (free plan: none)");
ok(plansIncluding("why-winning").join() === "growth,pro,agency", "Why Are They Winning? is included from Growth up");

/* ---------- 2. public catalog: per-tool page + price + which plans include it ---------- */
let r = await call(env, "lab/catalog");
let wr = r.j.tools.filter((t) => t.id === "war-room")[0];
ok(wr.where === "growth-lab/war-room/" && wr.price === 2999 && wr.buy && wr.includedIn.join() === "Growth,Pro,Agency" && wr.view.join() === "s8,s4", "catalog: War Room has its own page, ₹2,999 a run, included in Growth/Pro/Agency");
ok(r.j.tools.filter((t) => t.id === "business-xray")[0].buy === undefined, "Business X-Ray itself still runs on X-Ray credits (not a one-run product)");

/* ---------- 3. admin sets a tool's price; checkout charges that price ---------- */
await login(env, "anmol@fodo.co.in", null, "own");
r = await call(env, "admin/config", { products: { "website-health": { price: 799 }, "offer-strength": { on: false } } }, { as: "own" });
ok(r.j.ok && r.j.config.products["website-health"].price === 799 && r.j.config.products["offer-strength"].on === false, "owner changes Website Health to ₹799 and takes Offer Strength off sale");
r = await call(env, "admin/config", { products: { "website-health": { price: -5 } } }, { as: "own" }); ok(!r.j.ok && /whole number/.test(r.j.errors[0]), "bad price refused");
r = await call(env, "lab/catalog"); ok(r.j.tools.filter((t) => t.id === "website-health")[0].price === 799 && r.j.tools.filter((t) => t.id === "offer-strength")[0].on === false, "catalog shows the admin's price and the switched-off tool");

/* ---------- 4. free user: no plan, no runs → 402 buy ---------- */
await login(env, "ravi@shop.in");
r = await call(env, "lab/tool/start", { tool: "website-health", url: "spicehub.test" });
ok(r.status === 402 && r.j.buy && r.j.price === 799 && /Buy one Website Health Audit run \(₹799\)/.test(r.j.reason), "free account → 402 'buy one run (₹799)'");
r = await call(env, "lab/tool/start", { tool: "offer-strength", url: "spicehub.test" }); ok(r.status === 503, "a tool switched off by the admin can't be started");
r = await call(env, "lab/tool/start", { tool: "nope", url: "spicehub.test" }); ok(r.status === 400, "unknown tool refused");
r = await call(env, "lab/tool/start", { tool: "website-health", url: "http://127.0.0.1/" }); ok(r.status === 400, "private address refused (SSRF guard)");
r = await call(env, "xray/start", { url: "spicehub.test", toolRun: "tr_fake" }); ok(r.status === 409, "a made-up tool run id can't unlock an X-Ray");

/* ---------- 5. buy one run (Cashfree) → verified on the server → granted once ---------- */
r = await call(env, "checkout", { kind: "tool", item: "website-health", phone: "9810012345" });
const oid = r.j.orderId; ok(r.j.ok && CF.orders[oid].order_amount === 799 && /\/growth-lab\/website-health\/\?order_id=fo_/.test(CF.orders[oid].order_meta.return_url) && /Website Health Audit — 1 run/.test(CF.orders[oid].order_note), "checkout: ₹799 order, returns to the tool's page");
r = await call(env, "checkout", { kind: "tool", item: "offer-strength", phone: "9810012345" }); ok(r.status === 503, "can't buy a tool that is off sale");
r = await call(env, "verify", { order_id: oid }); ok(!r.j.paid && credits("ravi@shop.in", "website-health") === 0, "not paid yet → nothing granted");
CF.orders[oid].order_status = "PAID";
r = await call(env, "verify", { order_id: oid }); ok(r.j.paid && credits("ravi@shop.in", "website-health") === 1, "paid → 1 Website Health run");
r = await call(env, "verify", { order_id: oid }); ok(credits("ravi@shop.in", "website-health") === 1, "verifying again grants nothing twice");
r = await call(env, "lab/tools/me"); ok(r.j.tools["website-health"].credits === 1 && !r.j.tools["website-health"].included && !r.j.tools["war-room"].credits, "tools/me: 1 bought run, not included in the free plan");

/* ---------- 6. bought run → fresh scan at Starter level, no X-Ray credit spent ---------- */
const freeBefore = env.XRAY_DB.db.prepare("SELECT free_left FROM acct_users WHERE email='ravi@shop.in'").get().free_left;
r = await call(env, "lab/tool/start", { tool: "website-health", url: "https://spicehub.test/" });
const run1 = r.j.runId; ok(r.j.ok && r.j.needScan && r.j.source === "tool" && r.j.tier === "starter" && credits("ravi@shop.in", "website-health") === 0, "no recent X-Ray → fresh scan, paid by the bought run");
r = await call(env, "xray/start", { url: "other.test", toolRun: run1 }); ok(r.status === 400 && /spicehub\.test/.test(r.j.reason), "the run only works for the website it was bought for");
r = await call(env, "xray/start", { url: "spicehub.test", toolRun: run1 });
const job1 = r.j.jobId; ok(r.j.ok && r.j.tier === "starter" && r.j.credit === "tool:website-health" && r.j.limits.features.indexOf("fullReport") > -1, "X-Ray engine runs at Starter level for the tool");
ok(env.XRAY_DB.db.prepare("SELECT free_left FROM acct_users WHERE email='ravi@shop.in'").get().free_left === freeBefore, "the free X-Rays were not touched");
r = await call(env, "xray/start", { url: "spicehub.test", toolRun: run1 }); ok(r.status === 409, "a tool run can start only one scan");
await save(env, job1); ok(runs().filter((x) => x.id === run1)[0].status === "done" && runs().filter((x) => x.id === run1)[0].job_id === job1, "report saved → the tool run is done and linked to its report");

/* ---------- 7. reuse (§47): the same tool again, or another tool the X-Ray covers ---------- */
r = await call(env, "lab/tool/start", { tool: "conversion-xray", url: "spicehub.test" });
ok(r.status === 402, "a different tool still needs paying for (free account)");
let r2 = await call(env, "checkout", { kind: "tool", item: "conversion-xray", phone: "9810012345" }); CF.orders[r2.j.orderId].order_status = "PAID"; await call(env, "verify", { order_id: r2.j.orderId });
r = await call(env, "lab/tool/start", { tool: "conversion-xray", url: "www.spicehub.test" });
ok(r.j.ok && r.j.reused && r.j.jobId === job1 && r.j.source === "tool" && credits("ravi@shop.in", "conversion-xray") === 0, "Conversion X-Ray reuses the X-Ray from the Website Health run — no new research");
r = await call(env, "lab/tool/start", { tool: "war-room", url: "spicehub.test" }); ok(r.status === 402, "War Room can't reuse a Starter-level X-Ray it isn't covered by → must be bought");

/* ---------- 8. plan users: tools their plan covers are included ---------- */
await login(env, "growth@biz.in", "growth", "g");
r = await call(env, "lab/tool/start", { tool: "war-room", url: "curryhouse.test" }, { as: "g" });
const run2 = r.j.runId; ok(r.j.ok && r.j.needScan && r.j.source === "xray", "Growth plan: War Room included → a fresh scan uses one plan X-Ray");
const mBefore = env.XRAY_DB.db.prepare("SELECT monthly_left FROM acct_users WHERE email='growth@biz.in'").get().monthly_left;
r = await call(env, "xray/start", { url: "curryhouse.test", toolRun: run2 }, { as: "g" }); const job2 = r.j.jobId;
ok(r.j.ok && r.j.credit === "monthly" && env.XRAY_DB.db.prepare("SELECT monthly_left FROM acct_users WHERE email='growth@biz.in'").get().monthly_left === mBefore - 1, "…one monthly X-Ray spent");
await save(env, job2, "g");
r = await call(env, "lab/tool/start", { tool: "why-winning", url: "curryhouse.test" }, { as: "g" });
ok(r.j.ok && r.j.reused && r.j.source === "included" && env.XRAY_DB.db.prepare("SELECT monthly_left FROM acct_users WHERE email='growth@biz.in'").get().monthly_left === mBefore - 1, "Why Are They Winning? reuses that X-Ray — nothing spent");
r = await call(env, "lab/tool/runs", undefined, { as: "g" }); ok(r.j.items.length === 2 && r.j.items.every((x) => x.name), "report library lists both tool runs");
r = await call(env, "lab/tool/runs"); ok(r.j.items.every((x) => x.domain === "spicehub.test"), "…and never another account's runs");

/* ---------- 9. owner: everything free ---------- */
r = await call(env, "lab/tool/start", { tool: "roadmap90", url: "fodo.co.in" }, { as: "own" }); ok(r.j.ok && r.j.source === "owner", "owner email: every tool free");

/* ---------- 10. refund: a bought run whose website can't be read comes back as a run ---------- */
r2 = await call(env, "checkout", { kind: "tool", item: "local-visibility", phone: "9810012345" }); CF.orders[r2.j.orderId].order_status = "PAID"; await call(env, "verify", { order_id: r2.j.orderId });
r = await call(env, "lab/tool/start", { tool: "local-visibility", url: "deadsite.test" }); const run3 = r.j.runId;
r = await call(env, "xray/start", { url: "deadsite.test", toolRun: run3 }); const job3 = r.j.jobId;
r = await call(env, "xray/refund", { jobId: job3 }); ok(r.j.refunded && credits("ravi@shop.in", "local-visibility") === 1 && runs().filter((x) => x.id === run3)[0].status === "refunded", "site couldn't be read → the Local Visibility run comes back");

/* ---------- 11. admin: per-tool runs, reuse and revenue ---------- */
r = await call(env, "admin/lab?days=30", undefined, { as: "own" });
const wh = r.j.products.filter((p) => p.id === "website-health")[0], cx = r.j.products.filter((p) => p.id === "conversion-xray")[0];
ok(wh.bought === 1 && wh.revenue === 799 && wh.fresh === 1 && cx.reused === 1 && cx.revenue === PRODUCTS["conversion-xray"].price, "admin Growth Lab: runs bought, revenue, fresh scans vs reused X-Rays per tool");
r = await call(env, "admin/lab?days=30", undefined, { as: "a" }); ok(r.status === 403 || r.status === 401, "a customer can't read admin tool stats");

console.log("\nv18 functions: " + pass + "/" + (pass + fail) + " passed");
process.exit(fail ? 1 : 0);
