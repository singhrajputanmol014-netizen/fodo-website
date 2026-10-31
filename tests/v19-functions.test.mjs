// v19 background X-Rays, server + runner Worker logic, in-process: the runner's calls to the website go straight into the
// real /api/xray handler (D1 = real SQLite), Browser Rendering and GitHub are stand-ins. Covers switched off / runner down
// fallbacks, claim + token, capacity → wait → retry, GitHub fallback, crashes → retry → refund after 3 tries, waited too long →
// refund (also for a bought tool run), cron sweep of dead runs, email once.   Run: node --no-warnings tests/v19-functions.test.mjs
import { DatabaseSync } from "node:sqlite";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as xray } from "../functions/api/xray/[[path]].js";
import { onRequest as lab } from "../functions/api/lab/[[path]].js";
import { bgToken } from "../functions/_lib/bg.js";
import W, { handleJob } from "../runner/src/index.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
console.log = ((orig) => (...a) => { if (typeof a[0] === "string" && a[0].charAt(0) === "{" && !process.env.DBG) return; orig(...a); })(console.log);
function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, a = []) => ({ bind: (...x) => st(sql, x), run: async () => { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }), _x: () => db.prepare(sql).run(...a) });
  return { db, prepare: (s) => st(s), batch: async (l) => l.map((s) => (s._x(), { success: true })) };
}
const SITE = "https://www.fodo.co.in", KEY = "runner_test_KEY_1234567890", jars = {};
const route = (u) => { const p = new URL(u).pathname.replace(/^\/api\//, ""), i = p.indexOf("/"); return { h: p.slice(0, i), path: p.slice(i + 1) }; };
const H = { xray, account, lab };
const call = async (env, path, body, o = {}) => {
  const who = o.as || "a", { h, path: p } = route(SITE + "/api/" + (path.indexOf("/") > 0 && /^(xray|lab)\//.test(path) ? path : "account/" + path));
  const q = path.indexOf("?") > -1 ? path.slice(path.indexOf("?")) : "";
  const req = new Request(SITE + "/api/" + h + "/" + p + q, { method: body !== undefined ? "POST" : "GET", headers: Object.assign({ origin: SITE, "cf-connecting-ip": "8.8.8.8" }, body !== undefined ? { "content-type": "application/json" } : {}, jars[who] ? { cookie: jars[who] } : {}, o.headers || {}), body: body === undefined ? undefined : JSON.stringify(body) });
  const r = await H[h]({ request: req, env, params: { path: p.split("?")[0].split("/") } }); const sc = r.headers.get("set-cookie"); if (sc) jars[who] = sc.split(";")[0];
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, j };
};
const login = (env, email, plan, who) => call(env, "test-login", Object.assign({ email }, plan ? { plan } : {}), { as: who });
const save = (env, job) => xray({ request: new Request(SITE + "/api/xray/report", { method: "POST", headers: { "content-type": "application/json", "x-job": job }, body: JSON.stringify({ jobId: job, scores: { overall: 70 }, crawl: { blocked: null, pages: 3 }, completeness: { overall: 80, parts: [] } }) }), env, params: { path: ["report"] } });

// outside world: the website (in-process), the runner's /enqueue, Resend, GitHub
let env, runnerUp = true; const enq = [], mails = [], gh = [];
globalThis.fetch = async (u, o = {}) => {
  u = String(u);
  if (u.indexOf(SITE + "/api/") === 0) { const { h, path } = route(u); return H[h]({ request: new Request(u, o), env, params: { path: path.split("?")[0].split("/") } }); }
  if (u.indexOf("https://runner.test/enqueue") === 0) { if (!runnerUp) throw new Error("connect refused"); enq.push(JSON.parse(o.body).jobId); return new Response('{"ok":true}'); }
  if (/api\.resend\.com/.test(u)) { mails.push(JSON.parse(o.body)); return new Response('{"id":"m"}'); }
  if (/api\.github\.com\/repos\/fodo\/site\/dispatches/.test(u)) { gh.push(JSON.parse(o.body)); return new Response(null, { status: 204 }); }
  return new Response("not mocked " + u, { status: 599 });
};
const base = () => ({ XRAY_DB: d1(), ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", XRAY_PER_HOUR: "99", RESEND_API_KEY: "re", SITE_URL: SITE });
const bgrow = (id) => env.XRAY_DB.db.prepare("SELECT * FROM xray_bg WHERE job_id=?").get(id);
const freeLeft = (e) => env.XRAY_DB.db.prepare("SELECT monthly_left FROM acct_users WHERE email=?").get(e).monthly_left;

/* ---------- 1. switched off / runner down → the browser runs it as before ---------- */
env = base(); await login(env, "u@shop.in");
let r = await call(env, "xray/start", { url: "spicehub.test", background: true }); ok(r.j.ok && r.j.background === undefined, "no RUNNER_URL/RUNNER_KEY → normal X-Ray in the browser");
r = await call(env, "xray/health"); ok(r.j.background === false, "health: background off");
Object.assign(env, { RUNNER_URL: "https://runner.test", RUNNER_KEY: KEY }); await login(env, "u@shop.in", "growth");
runnerUp = false; r = await call(env, "xray/start", { url: "spicehub.test", background: true }); runnerUp = true; if (process.env.DBG) process.stdout.write("DBG " + r.status + " " + JSON.stringify(r.j).slice(0, 300) + "\n");
ok(r.j.ok && r.j.background === false && /runs here in your browser/.test(r.j.bgNote) && !bgrow(r.j.jobId), "runner not answering → falls back to the browser, says so");

/* ---------- 2. queued → claim (key) → token page → saved → email once ---------- */
r = await call(env, "xray/start", { url: "spicehub.test", background: true }); const j1 = r.j.jobId;
ok(r.j.background === true && enq.indexOf(j1) > -1 && bgrow(j1).status === "queued" && bgrow(j1).email === "u@shop.in", "background start: job queued on the runner, linked to the user");
r = await call(env, "xray/status/" + j1); ok(/You can close this tab/.test(r.j.note), "status note tells the visitor they can close the tab");
r = await call(env, "xray/bg/claim", { jobId: j1 }); ok(r.status === 403, "claim needs the runner key");
r = await call(env, "xray/bg/claim", { jobId: j1 }, { headers: { "x-runner-key": KEY } });
const tok = await bgToken(env, j1); ok(r.j.ok && r.j.runUrl === SITE + "/business-x-ray/?bg=" + j1 + "&t=" + tok && bgrow(j1).status === "running" && bgrow(j1).attempts === 1, "claim → runner page URL with the job's token");
r = await call(env, "xray/bg/job/" + j1 + "?t=" + tok.replace(/.$/, tok.slice(-1) === "0" ? "1" : "0")); ok(r.status === 403, "token tampered → 403");
r = await call(env, "xray/bg/job/" + j1 + "?t=" + tok); if (process.env.DBG) process.stdout.write("DBGP " + JSON.stringify(r.j).slice(0, 400) + "\n"); ok(r.j.ok && r.j.bg && r.j.jobId === j1 && r.j.limits && r.j.input.url === "https://spicehub.test/" && r.j.stages, "runner page gets the same start payload the browser would (limits, providers, stages, input)");
await save(env, j1); ok(bgrow(j1).status === "done" && mails.length === 1 && /spicehub\.test is ready/.test(mails[0].subject), "report saved → marked done + one 'ready' email");
r = await call(env, "xray/bg/done", { jobId: j1, ok: true }, { headers: { "x-runner-key": KEY } }); ok(r.j.done && mails.length === 1, "runner's 'done' afterwards: no second email");
r = await call(env, "xray/bg/claim", { jobId: j1 }, { headers: { "x-runner-key": KEY } }); ok(r.j.drop, "finished job is never run twice");

/* ---------- 3. the Worker: capacity full → wait → retry; GitHub fallback; crash → retry → refund ---------- */
const before = freeLeft("u@shop.in");
r = await call(env, "xray/start", { url: "curryhouse.test", background: true }); const j2 = r.j.jobId;
const wenv = { RUNNER_KEY: KEY, SITE_URL: SITE, BROWSER: {}, __launch: async () => { throw new Error("Unable to create new browser: code 429"); } };
let h = await handleJob(wenv, j2, 1); ok(h.retry === 900 && bgrow(j2).status === "waiting" && /free background browser/.test((await call(env, "xray/status/" + j2)).j.note), "browser time used up → job waits (retry in 15 min), visitor told it starts automatically");
h = await handleJob(Object.assign({}, wenv, { GH_TOKEN: "ghp_x", GH_REPO: "fodo/site" }), j2, 2); ok(h.ack && gh.length === 1 && gh[0].event_type === "fodo-xray" && gh[0].client_payload.jobId === j2 && /\?bg=/.test(gh[0].client_payload.runUrl), "…with the GitHub fallback connected → sent to GitHub Actions");
const crash = Object.assign({}, wenv, { __launch: async () => ({ newPage: async () => ({ goto: async () => {}, evaluate: async () => ({ ok: false, error: "engine crashed" }) }), close: async () => {} }) });
h = await handleJob(crash, j2, 3); ok(bgrow(j2).status === "failed" && h.ack && freeLeft("u@shop.in") === before, "3rd failed attempt → given up and the X-Ray credit refunded (" + bgrow(j2).attempts + " tries)");
r = await call(env, "xray/status/" + j2); ok(r.j.status === "FAILED" && /credit was returned/.test(r.j.note), "the visitor's tab shows it failed and the credit came back");
r = await call(env, "xray/start", { url: "aroma.test", background: true }); const j3 = r.j.jobId;
h = await handleJob(crash, j3, 1); ok(h.retry === 120 && bgrow(j3).status === "waiting", "a crash on the 1st try → retried (backoff)");
const good = Object.assign({}, wenv, { __launch: async () => ({ newPage: async () => ({ goto: async (u) => { const t = new URL(u).searchParams; const pl = (await call(env, "xray/bg/job/" + t.get("bg") + "?t=" + t.get("t"))).j; if (pl.ok) await save(env, pl.jobId); }, evaluate: async () => ({ ok: true }) }), close: async () => {} }) });
h = await handleJob(good, j3, 2); if (process.env.DBG) process.stdout.write("DBGG " + JSON.stringify(h) + JSON.stringify(bgrow(j3)).slice(0, 300) + "\n"); ok(h.ack && bgrow(j3).status === "done" && (await call(env, "xray/status/" + j3)).j.status === "COMPLETE", "…2nd try works → report done");

/* ---------- 4. waited too long → refunded (bought tool run comes back as a tool run) ---------- */
r = await call(env, "xray/start", { url: "late.test", background: true }); const j4 = r.j.jobId;
env.XRAY_DB.db.prepare("UPDATE xray_bg SET enqueued_at=? WHERE job_id=?").run(new Date(Date.now() - 3 * 3600e3).toISOString(), j4);
const fl = freeLeft("u@shop.in"); r = await call(env, "xray/bg/claim", { jobId: j4 }, { headers: { "x-runner-key": KEY } });
ok(r.j.drop && r.j.refunded && freeLeft("u@shop.in") === fl + 1 && bgrow(j4).status === "failed", "job that waited over 2.5 h → dropped and refunded");
env.XRAY_DB.db.prepare("INSERT INTO lab_tool_credits (user_id, tool, credits, updated_at) VALUES ((SELECT id FROM acct_users WHERE email='u@shop.in'), 'website-health', 1, 'x')").run();
r = await call(env, "lab/tool/start", { tool: "conversion-xray", url: "tooly.test" }); const tr = r.j.runId; ok(r.j.source === "xray", "(growth plan: tool included → scan uses a plan X-Ray)");
const ml = freeLeft("u@shop.in"); r = await call(env, "xray/start", { url: "tooly.test", background: true, toolRun: tr }); const j5 = r.j.jobId; ok(r.j.background && r.j.credit === "monthly" && freeLeft("u@shop.in") === ml - 1, "a Pro tool's fresh scan can run in the background too");
env.XRAY_DB.db.prepare("UPDATE xray_bg SET enqueued_at=? WHERE job_id=?").run(new Date(Date.now() - 3 * 3600e3).toISOString(), j5);
await call(env, "xray/bg/claim", { jobId: j5 }, { headers: { "x-runner-key": KEY } });
ok(freeLeft("u@shop.in") === ml && env.XRAY_DB.db.prepare("SELECT status FROM lab_tool_runs WHERE id=?").get(tr).status !== "done", "…and if it never runs, the X-Ray it used is given back");

/* ---------- 5. cron sweep: a run that died while 'running' goes back on the queue ---------- */
r = await call(env, "xray/start", { url: "sweepy.test", background: true }); const j6 = r.j.jobId;
await call(env, "xray/bg/claim", { jobId: j6 }, { headers: { "x-runner-key": KEY } });
env.XRAY_DB.db.prepare("UPDATE xray_bg SET started_at=? WHERE job_id=?").run(new Date(Date.now() - 30 * 60e3).toISOString(), j6);
const sent = []; await W.scheduled({}, { RUNNER_KEY: KEY, SITE_URL: SITE, JOBS: { send: async (m) => sent.push(m.jobId) } });
ok(sent.indexOf(j6) > -1 && bgrow(j6).status === "waiting", "cron sweep: dead run re-queued");
r = await W.fetch(new Request("https://runner.test/enqueue", { method: "POST", headers: { "x-runner-key": "nope-nope-nope-nope" }, body: "{}" }), { RUNNER_KEY: KEY }); ok(r.status === 403, "Worker /enqueue refuses a wrong key");
r = await W.fetch(new Request("https://runner.test/health"), { RUNNER_KEY: KEY, JOBS: {}, BROWSER: {} }); const hj = await r.json(); ok(hj.ok && hj.key && !JSON.stringify(hj).includes(KEY), "Worker /health shows what is connected, never the key");

console.log("\nv19 functions: " + pass + "/" + (pass + fail) + " passed");
process.exit(fail ? 1 : 0);
