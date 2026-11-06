/* v51.1: cold starts. A new server instance (isolate) must not re-run every module's table set-up: on production D1 each
   statement is a network round-trip, and before v51.1 a cold /api/os/me ran 611 of them (measured) before its first real query.
   Checks: (1) static: every module that owns tables is in schema.js SETUPS, no module keeps its own WeakSet guard, no
   sequential "for (const q of DDL) await d.prepare(q).run()" loop remains; (2) a cold instance on a current database runs no
   DDL and only a handful of statements for the busiest screens; (3) every GET route of the OS router, Admin and the client
   API answer without 5xx on a cold instance that skipped all set-ups (nothing depends on a set-up that the gate skipped);
   (4) a deploy (stale version) sets up once in batches and marks the version; (5) a "no such table" error heals itself: the
   router re-runs the set-up and retries the request once; (6) the version check is one statement and is cached per instance.
   Run: node tests/v511.test.mjs */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as bizApi } from "../functions/api/biz/[[path]].js";
import { onRequest as osApi, ROUTES } from "../functions/api/os/[[path]].js";
import * as SCH from "../functions/_lib/schema.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
console.log = ((orig) => (...a) => { if (typeof a[0] === "string" && a[0].charAt(0) === "{" && !process.env.DBG) return; orig(...a); })(console.log);
console.error = process.env.DBG ? console.log.bind(console) : () => {};
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");

/* ---------- (1) static ---------- */
{ const lib = path.join(ROOT, "functions", "_lib"), files = [];
  const walk = (dir) => { for (const n of fs.readdirSync(dir)) { const p = path.join(dir, n); if (fs.statSync(p).isDirectory()) walk(p); else if (n.endsWith(".js")) files.push(p); } }; walk(lib);
  const owners = files.filter((f) => /CREATE (TABLE|INDEX|UNIQUE INDEX|VIRTUAL TABLE) IF NOT EXISTS/.test(fs.readFileSync(f, "utf8")) && !/schema\.js$|brain\/engineer\.js$/.test(f));   /* engineer.js only quotes the words in a prompt */
  const names = new Set(SCH.SETUP_NAMES), src = fs.readFileSync(path.join(lib, "schema.js"), "utf8");
  const missing = owners.filter((f) => { const rel = path.relative(lib, f).replace(/\\/g, "/"); return !new RegExp("import\\(\"\\./" + rel.replace(".", "\\.") + "\"\\)").test(src); });
  ok(owners.length >= 35 && !missing.length, "static: all " + owners.length + " modules that create tables are in schema.js SETUPS" + (missing.length ? " (missing: " + missing.map((f) => path.relative(lib, f)).join(", ") + ")" : ""));
  const guards = files.filter((f) => /new WeakSet\(\)|new WeakMap\(\)/.test(fs.readFileSync(f, "utf8")) && !/schema\.js$/.test(f));
  ok(!guards.length, "static: no module keeps its own per-instance set-up guard any more" + (guards.length ? " (" + guards.map((f) => path.relative(lib, f)).join(", ") + ")" : ""));
  const loops = files.filter((f) => /for \(const q of (DDL|T)\) await d\.prepare\(q\)\.run\(\)/.test(fs.readFileSync(f, "utf8")));
  ok(!loops.length, "static: no sequential DDL loop remains (set-ups run as one batch)" + (loops.length ? " (" + loops.map((f) => path.relative(lib, f)).join(", ") + ")" : ""));
  ok(names.size === SCH.SETUP_NAMES.length && names.size >= 40, "static: " + names.size + " distinct set-up names");
  const claude = fs.readFileSync(path.join(ROOT, "CLAUDE.md"), "utf8"); ok(/SCHEMA_VERSION/.test(claude), "static: CLAUDE.md tells the next change to bump SCHEMA_VERSION"); }

/* ---------- runtime: one SQLite file shared by "instances" (fresh binding objects) ---------- */
const db = new DatabaseSync(":memory:");
let count = 0, log = [];
function binding() {
  const st = (sql, a = []) => ({ bind: (...x) => st(sql, x.map((v) => v === undefined ? null : v)), run: async () => { count++; log.push(sql); const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }, first: async () => { count++; log.push(sql); return db.prepare(sql).get(...a) || null; }, all: async () => { count++; log.push(sql); return { results: db.prepare(sql).all(...a) }; }, _x: () => db.prepare(sql).run(...a) });
  return { db, prepare: (s) => st(s), batch: async (l) => { count++; log.push("BATCH " + l.length); return l.map((s) => (s._x(), { success: true })); } };
}
const KV = new Map(), CHAT_KV = { get: async (k) => KV.get(k) || null, put: async (k, v) => { KV.set(k, v); }, getWithMetadata: async (k) => ({ value: KV.get(k) || null, metadata: null }), delete: async (k) => { KV.delete(k); }, list: async () => ({ keys: [] }) };
const SITE = "https://www.fodo.co.in", H = { account, biz: bizApi, os: osApi }, jars = {};
const fresh = () => ({ XRAY_DB: binding(), CHAT_KV, ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", API_DEBUG: process.env.DBG ? "1" : "", MAIL_FROM: "FODO <hello@fodo.co.in>", RESEND_API_KEY: "re_test" });
let env = fresh();
async function call(h, p, body, who) { const method = body === undefined ? "GET" : "POST";
  const req = new Request(SITE + "/api/" + h + "/" + p, { method, headers: Object.assign({ origin: SITE, "cf-connecting-ip": "9.9.9.9" }, body !== undefined ? { "content-type": "application/json" } : {}, jars[who] ? { cookie: jars[who] } : {}), body: body === undefined ? undefined : JSON.stringify(body) });
  const r = await H[h]({ request: req, env, params: { path: p.split("?")[0].split("/") } }); const sc = r.headers.get("set-cookie"); if (sc && h === "account") jars[who] = sc.split(";")[0];
  let j = null; try { j = await r.json(); } catch (e) { j = null; } return { status: r.status, j }; }
const login = (email, who) => call("account", "test-login", { email }, who);
const reset = () => { count = 0; log = []; };

/* first request ever: sets everything up and marks the version */
reset(); await login("anmol@fodo.co.in", "own"); const firstRun = count;
ok(db.prepare("SELECT v FROM fodo_schema WHERE k='version'").get()?.v === SCH.SCHEMA_VERSION, "first request on an empty database sets every module up and records SCHEMA_VERSION " + SCH.SCHEMA_VERSION + " (" + firstRun + " statements, once)");
await login("client@biz.in", "c");
const me = await call("os", "me", undefined, "own"); ok(me.status === 200 && me.j && me.j.ok, "owner /api/os/me works on the instance that did the set-up");

/* ---------- (2) a cold instance on a current database ---------- */
const DDLRE = /^(CREATE|ALTER|PRAGMA|BATCH)/i;
const cold = async (h, p, who) => { env = fresh(); reset(); const r = await call(h, p, undefined, who); return { r, n: count, ddl: log.filter((s) => DDLRE.test(s)).length, version: log.filter((s) => /fodo_schema/.test(s)).length }; };
{ const a = await cold("os", "me", "own"); ok(a.r.status === 200 && a.ddl === 0 && a.n <= 20, "cold instance, owner /api/os/me: " + a.n + " statements, " + a.ddl + " DDL (was 611 before v51.1)"); ok(a.version === 1, "the version check is exactly one statement"); }
{ const a = await cold("biz", "me", "own"); ok(a.r.status === 200 && a.ddl === 0 && a.n <= 25, "cold instance, /api/biz/me: " + a.n + " statements, no DDL"); }
{ const a = await cold("os", "command", "own"); ok(a.r.status === 200 && a.ddl === 0 && a.n <= 60, "cold instance, Command Centre: " + a.n + " statements, no DDL"); }
{ const a = await cold("os", "tasks", "own"); ok(a.r.status === 200 && a.ddl === 0 && a.n <= 25, "cold instance, task list: " + a.n + " statements, no DDL"); }
{ const a = await cold("biz", "me", "c"); ok(a.r.status === 200 && a.ddl === 0, "cold instance, client /api/biz/me: " + a.n + " statements, no DDL"); }
{ reset(); await call("os", "me", undefined, "own"); const v = log.filter((s) => /fodo_schema/.test(s)).length; ok(v === 0, "a warm instance does not read the version again (cached per instance)"); }

/* ---------- (3) nothing depends on a skipped set-up: every GET route on a cold instance ---------- */
{ env = fresh(); const gets = ROUTES.filter((r) => r[0] === "GET"); const bad = []; let n = 0;
  const sample = (re) => { let s = re.source.replace(/^\^/, "").replace(/\$$/, ""); s = s.replace(/\((?!\?)([^()]*)\)/g, (m, g) => (/\|/.test(g) && !/[\[\\]/.test(g) ? g.split("|")[0] : "zznope")).replace(/\(\?:[^()]*\)\??/g, "").replace(/\\\//g, "/").replace(/\\\./g, ".").replace(/\\-/g, "-"); return re.test(s) ? s : null; };
  for (const r of gets) { const p = sample(r[1]); if (!p) continue; n++; const x = await call("os", p, undefined, "own"); if (x.status >= 500) bad.push(p + " " + x.status); }
  ok(n >= 100 && !bad.length, "cold instance: " + n + " OS GET routes answer without 5xx (no route needs a set-up the gate skipped)" + (bad.length ? ": " + bad.slice(0, 12).join(", ") : ""));
  const more = []; for (const [h, p, who] of [["biz", "projects", "c"], ["biz", "me", "c"], ["biz", "pros", "c"], ["biz", "notes", "own"], ["account", "me", "own"], ["account", "runs", "own"], ["os", "monitoring", "own"], ["os", "company-assets", "own"]]) { const x = await call(h, p, undefined, who); if (x.status >= 500) more.push(h + "/" + p + " " + x.status); }
  ok(!more.length, "cold instance: client, account and monitoring routes answer without 5xx" + (more.length ? ": " + more.join(", ") : "")); }

/* ---------- (4) a deploy: stale version → one set-up pass in batches, then marked ---------- */
{ db.prepare("UPDATE fodo_schema SET v='50.8'").run(); env = fresh(); reset(); const r = await call("os", "me", undefined, "own");
  const batches = log.filter((s) => /^BATCH/.test(s)).length, loops = log.filter((s) => /^CREATE TABLE/.test(s)).length;
  ok(r.status === 200 && db.prepare("SELECT v FROM fodo_schema WHERE k='version'").get()?.v === SCH.SCHEMA_VERSION, "stale version: the first request sets everything up (" + count + " statements, " + batches + " batches) and records the new version");
  ok(batches >= 25 && loops <= 30 && count <= 160, "set-up runs as batches (" + batches + "), not one statement per table; " + count + " statements in all, once per deploy");
  const a = await cold("os", "me", "own"); ok(a.ddl === 0 && a.n <= 20, "the next cold instance skips the set-up again (" + a.n + " statements)"); }

/* ---------- (5) self-heal: a table missing behind a current version ---------- */
{ db.prepare("DROP TABLE os_assets").run(); env = fresh(); reset();
  const r = await call("os", "company-assets", undefined, "own");
  ok(r.status === 200 && r.j && r.j.ok && !!db.prepare("SELECT name FROM sqlite_master WHERE name='os_assets'").get(), "a 'no such table' error re-runs the set-up and retries the request once: the Assets list answers 200 and the table is back");
  db.prepare("DROP TABLE biz_notes").run(); env = fresh();
  const r2 = await call("biz", "notes", undefined, "own"); ok(r2.status === 200, "the client API heals the same way (" + r2.status + ")");
  db.prepare("DROP TABLE acct_events").run(); env = fresh();
  const r3 = await call("account", "me", undefined, "own"); ok(r3.status === 200, "the account API heals the same way (" + r3.status + ")");
  /* a POST with a body is retried on a clone of the request */
  db.prepare("DROP TABLE os_asset_log").run(); env = fresh();
  const r4 = await call("os", "company-assets", { name: "Heal cam", category: "camera" }, "own"); ok(r4.status === 200 && r4.j && r4.j.ok && /^FA-\d{4}$/.test(r4.j.tag || "") && !!db.prepare("SELECT id FROM os_assets WHERE name='Heal cam'").get(), "a POST that hit the error is retried with its body (" + r4.status + ", " + (r4.j && r4.j.tag) + ")");
  /* an ordinary error is not mistaken for a schema error */
  ok(!SCH.isSchemaError(new Error("Pick the professional you want to hire.")) && SCH.isSchemaError(new Error("D1_ERROR: no such table: os_x")) && SCH.isSchemaError(new Error("table os_members has no column named foo")), "only 'no such table / column' errors trigger the heal"); }

/* ---------- (6) payouts set-up no longer runs its DDL on every call ---------- */
{ env = fresh(); await call("os", "me", undefined, "own"); reset(); const { pdb } = await import("../functions/_lib/payouts.js"); await pdb(env); await pdb(env); ok(log.filter((s) => DDLRE.test(s)).length === 0, "payouts: no DDL on a current database (it used to run six statements on every call)"); }

console.log("\nv511: " + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
