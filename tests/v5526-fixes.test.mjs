// v55.26 audit fixes: private repo paths answer 404, test (sandbox) orders never count as revenue, stuck X-Ray runs are
// refunded / expired, Brain alerts are one per problem and close themselves, CI scripts start through bash.
// Run: node --no-warnings tests/v5526-fixes.test.mjs
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { onRequest as priv, isPrivate } from "../functions/[[path]].js";
import * as A from "../functions/_lib/accounts.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, a = []) => ({ bind: (...x) => st(sql, x.map((v) => v === undefined ? null : v)), run: async () => { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }), _x: () => db.prepare(sql).run(...a) });
  return { db, prepare: (s) => st(s), batch: async (l) => l.map((s) => (s._x(), { success: true })) };
}
const env = { XRAY_DB: d1(), ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1" };
const X = (sql, ...a) => env.XRAY_DB.db.prepare(sql).run(...a), q1 = (sql, ...a) => env.XRAY_DB.db.prepare(sql).get(...a);

// 1. private paths
for (const p of ["/docs/FODO-OS-V4-SECURITY-AUDIT.md", "/tests/run.mjs", "/scripts/build_pages.py", "/.github/workflows/fodo-tests.yml", "/wrangler.toml", "/README.md", "/readme.md", "/data/reviews.csv", "/functions/_lib/accounts.js", "/docs", "/%2Edocs/x".replace("%2E", ""), "//docs/x", "/%64ocs/x"])
  ok(isPrivate(p), "private: " + p);
for (const p of ["/", "/about/", "/data/build.json", "/js/main.js", "/sites/lib/render.js", "/downloads/app.json", "/docsearch/", "/api/x"]) ok(!isPrivate(p), "public: " + p);
let nexted = false; const r404 = await priv({ request: new Request("https://www.fodo.co.in/docs/x.md"), next: async () => { nexted = true; return new Response("asset"); } });
ok(r404.status === 404 && !nexted, "private path answers 404 without reaching the static file");
const rPub = await priv({ request: new Request("https://www.fodo.co.in/api/nothing"), next: async () => new Response("asset", { status: 200 }) });
ok((await rPub.text()) === "asset", "other included paths fall through to the site");
const routes = JSON.parse(fs.readFileSync("_routes.json", "utf8")).include;
ok(routes.length <= 100, "_routes.json stays under the 100 rule limit");
for (const d of ["/docs/*", "/tests/*", "/scripts/*", "/runner/*", "/functions/*", "/.github/*", "/README.md", "/wrangler.toml", "/data/reviews.csv"]) ok(routes.indexOf(d) > -1, "_routes.json sends " + d + " to Functions");
ok(routes.filter((r) => !/^\/(api|l|approve|f)\/\*$|^\/CLAUDE\.md$/.test(r)).every((r) => isPrivate(r.replace(/\*$/, "x"))), "every extra route in _routes.json is a private path (lists in sync)");

// 2. test orders
ok(A.payTest({}) === 1, "no live keys: sandbox (test order)");
ok(A.payTest({ CASHFREE_APP_ID: "a", CASHFREE_SECRET_KEY: "b", CASHFREE_ENV: "production" }) === 0, "Cashfree production: real order");
ok(A.payTest({ RAZORPAY_KEY_ID: "rzp_test_1", RAZORPAY_KEY_SECRET: "s" }) === 1, "Razorpay test key: test order");
ok(A.payTest({ RAZORPAY_KEY_ID: "rzp_live_1", RAZORPAY_KEY_SECRET: "s" }) === 0, "Razorpay live key: real order");
const d = await A.db(env);
ok(q1("SELECT count(*) n FROM pragma_table_info('acct_orders') WHERE name='test'").n === 1, "acct_orders has the test column");
const src = ["functions/_lib/analytics.js", "functions/api/admin/[[path]].js", "functions/_lib/brain/tools.js"].map((f) => fs.readFileSync(f, "utf8")).join("\n");
const agg = src.split("\n").filter((l) => /acct_orders/.test(l) && /(sum\(amount\)|count\(\*\)|count\(DISTINCT)/.test(l) && /status\s*=\s*'PAID'/.test(l));
ok(agg.length >= 6 && agg.every((l) => /coalesce\((o\.)?test,0\)=0/.test(l)), "every revenue / paid-count query skips test orders (" + agg.length + ")");
const acc = fs.readFileSync("functions/api/account/[[path]].js", "utf8");
ok((acc.match(/INSERT INTO acct_orders \([^)]*test\)/g) || []).length === 2, "both checkout paths record test=");

// 3. stuck runs
X("INSERT INTO acct_users (id, email, created_at, free_left) VALUES ('u1','a@b.co','2026-11-01',0)");
const old = new Date(Date.now() - 5 * 3600e3).toISOString(), fresh = new Date().toISOString();
X("INSERT INTO acct_runs (job_id, user_id, owner_id, domain, credit, status, created_at) VALUES ('j1','u1','u1','a.com','free','running',?)", old);
X("INSERT INTO acct_runs (job_id, user_id, owner_id, domain, credit, status, created_at) VALUES ('j2','u1','u1','b.com','owner','running',?)", old);
X("INSERT INTO acct_runs (job_id, user_id, owner_id, domain, credit, status, created_at) VALUES ('j3','u1','u1','c.com','free','running',?)", fresh);
const s1 = await A.expireStuckRuns(env, 3);
ok(s1.checked === 2 && s1.refunded === 1 && s1.expired === 1, "stuck runs: one refunded, one expired " + JSON.stringify(s1));
ok(q1("SELECT status FROM acct_runs WHERE job_id='j1'").status === "refunded" && q1("SELECT free_left FROM acct_users WHERE id='u1'").free_left === 1, "credit returned");
ok(q1("SELECT status FROM acct_runs WHERE job_id='j3'").status === "running", "a fresh run is left alone");
const s2 = await A.expireStuckRuns(env, 3); ok(s2.checked === 0, "second sweep does nothing (idempotent)");

// 4. Brain alerts (source checks: the scan needs the whole Brain)
const ins = fs.readFileSync("functions/_lib/brain/insights.js", "utf8");
ok(/status='open' AND substr\(akey, 1, \?2\)=\?1/.test(ins), "an open alert from an earlier day is refreshed, not repeated");
ok(/status='auto-closed'/.test(ins) && /updated_at < \?1/.test(ins), "alerts no longer found close themselves");

// 5. email fallback + CI
const am = fs.readFileSync("functions/_lib/accounts.js", "utf8");
ok(/viaGmail/.test(am) && /!secret && !opt\.noGmail && !\(opt\.attachments/.test(am), "system emails use the connected Gmail when there is no Resend key; login codes never");
for (const f of ["cross-browser.test.js", "v508-csp.test.js", "v51-csp.test.js", "v17-e2e.test.js"]) ok(/sh\("bash", \[path\.join\(__dirname, "xray-fixtures\/run-local\.sh"\)/.test(fs.readFileSync("tests/" + f, "utf8")), f + " starts the local runtime through bash (no exec bit needed)");
const wf = fs.readdirSync(".github/workflows").map((f) => fs.readFileSync(".github/workflows/" + f, "utf8")).join("\n");
ok(!/actions\/(checkout|setup-node)@v4|setup-python@v5/.test(wf), "workflows use the Node 24 action versions");
ok(/openpyxl/.test(fs.readFileSync(".github/workflows/fodo-tests.yml", "utf8")), "CI installs openpyxl for the v52 suite");
ok(/poppler-utils qpdf/.test(fs.readFileSync(".github/workflows/fodo-tests.yml", "utf8")) && /install --with-deps chromium \$/.test(fs.readFileSync(".github/workflows/fodo-browsers.yml", "utf8")), "CI installs pdftotext / qpdf, and Chromium in every browser job");

console.log("\nv55.26 fixes: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
