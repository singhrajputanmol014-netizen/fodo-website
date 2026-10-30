// v20.1: owner X-Rays have no daily search limit (customers keep SEARCH_DAILY_CAP); a slow home page gets one longer try.
// Run: node --no-warnings tests/v201-functions.test.mjs
import { DatabaseSync } from "node:sqlite";
import { onRequest as help } from "../functions/api/help/[[path]].js";
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

let serper = 0, slowHits = 0; const groqCalls = [];
globalThis.fetch = async (u, o = {}) => {
  u = String(u);
  if (/google\.serper\.dev\/(search|places)/.test(u)) { serper++; return new Response(JSON.stringify({ organic: [{ title: "x", link: "https://x.test/", snippet: "s" }], places: [] })); }
  if (/api\.groq\.com/.test(u)) { groqCalls.push(JSON.parse(o.body)); const sys = JSON.parse(o.body).messages[0].content; return new Response(JSON.stringify({ choices: [{ message: { content: /RESEARCH DATA|Output one JSON/.test(JSON.stringify(JSON.parse(o.body).messages)) ? JSON.stringify({ summary: "Groq summary", biggestProblem: "x", doFirst: [] }) : "Groq says: you are on the Growth plan." } }] })); }
  if (/slow\.test/.test(u)) { slowHits++; if (slowHits === 1) throw new DOMException("timed out", "TimeoutError"); return new Response("<html><title>Slow</title></html>", { headers: { "content-type": "text/html" } }); }
  return new Response("not mocked: " + u, { status: 599 });
};
const env = { XRAY_DB: d1(), ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", XRAY_PER_HOUR: "99", SERPER_API_KEY: "sk", SEARCH_DAILY_CAP: "2" };
const q = (job, n, who) => call(env, "xray/search", { jobId: job, q: "query " + n + " " + who }, { as: who });

await login(env, "anmol@fodo.co.in", null, "own");
let r = await call(env, "xray/start", { url: "spicehub.test" }, { as: "own" }); const jo = r.j.jobId;
const own = []; for (let i = 0; i < 6; i++) own.push((await q(jo, i, "own")).status);
ok(own.every((s) => s === 200) && serper === 6, "owner X-Ray: 6 searches with a daily cap of 2 — all go through (no daily limit)");
r = await call(env, "xray/places", { jobId: jo, q: "restaurants dwarka" }, { as: "own" }); ok(r.status === 200, "owner: local listings also skip the daily limit");

await login(env, "ravi@shop.in", "growth", "c");
r = await call(env, "xray/start", { url: "curryhouse.test" }, { as: "c" }); const jc = r.j.jobId;
const cs = []; for (let i = 0; i < 4; i++) cs.push((await q(jc, i, "c")).status);
ok(cs[0] === 200 && cs[1] === 200 && cs[2] === 429 && cs[3] === 429, "customer X-Ray: still stops at the daily cap (" + cs.join(",") + ")");
r = await q(jc, 9, "c"); ok(r.j && /budget is used up/.test(r.j.reason), "the reason says the daily search budget is used up");

r = await call(env, "xray/start", { url: "slow.test" }, { as: "own" }); const js = r.j.jobId;
const f1 = await xray({ request: new Request(SITE + "/api/xray/fetch", { method: "POST", headers: { "content-type": "application/json", origin: SITE, cookie: jars.own }, body: JSON.stringify({ jobId: js, url: "https://slow.test/", slowRetry: true }) }), env, params: { path: ["fetch"] } });
const meta = JSON.parse(decodeURIComponent(f1.headers.get("x-xray-meta")));
ok(meta.status === 200 && meta.retriedAs === "slow-retry" && /Slow/.test(await f1.text()), "slow home page: timed out once, read on the longer retry");
slowHits = 0;
const f2 = await xray({ request: new Request(SITE + "/api/xray/fetch", { method: "POST", headers: { "content-type": "application/json", origin: SITE, cookie: jars.own }, body: JSON.stringify({ jobId: js, url: "https://slow.test/about" }) }), env, params: { path: ["fetch"] } });
ok(JSON.parse(decodeURIComponent(f2.headers.get("x-xray-meta"))).error === "timeout", "other pages don't wait twice (crawl stays fast)");

/* v20.2: Workers AI failing → Groq writes the summary and answers the help chat; the "Workers AI" visibility engine never borrows Groq */
env.AI = { run: async () => { throw new Error("3036: daily free allocation exceeded"); } }; env.GROQ_API_KEY = "gsk_test";
r = await call(env, "xray/ai", { jobId: jo, mode: "synthesis", pack: { ids: ["O1"], data: { a: 1 } } }, { as: "own" });
const syn = env.XRAY_DB.db.prepare("SELECT provider, tool FROM api_usage WHERE endpoint='synthesis' ORDER BY rowid DESC").get();
ok(r.status === 200 && r.j.ok && /^groq\//.test(r.j.model) && syn.provider === "groq" && /daily free allocation/.test(syn.tool), "Workers AI over its limit → Groq writes the report summary (admin log says why: " + (syn && syn.tool) + ")");
r = await call(env, "xray/ai", { jobId: jo, mode: "visibility", pack: { questions: ["best corporate travel company in Gurugram?"] } }, { as: "own" });
const wa = (r.j.answers || []).find((a) => a.engine === "workers-ai");
ok(wa && wa.error && groqCalls.filter((b) => /corporate travel/.test(JSON.stringify(b))).length === 1, "AI visibility: the Workers AI row stays 'no answer' (not filled in by Groq); Groq answers only as itself");
const hreq = new Request(SITE + "/api/help/chat", { method: "POST", headers: { "content-type": "application/json", origin: SITE, "cf-connecting-ip": "5.5.5.5", cookie: jars.c }, body: JSON.stringify({ message: "mera plan kya hai" }) });
const hr = await (await help({ request: hreq, env, params: { path: ["chat"] } })).json();
ok(hr.ok && /Groq says/.test(hr.reply), "help chatbot: Workers AI down → Groq answers (not just the articles)");
console.log("\nv20.1–20.2 functions: " + pass + "/" + (pass + fail) + " passed");
process.exit(fail ? 1 : 0);
