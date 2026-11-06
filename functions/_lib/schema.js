/* v51.1: one schema version for the whole database, so a cold server instance does not re-run every module's table set-up.

   Before: each module ran its CREATE TABLE IF NOT EXISTS / ALTER list once per server instance (isolate). On Cloudflare Pages an
   instance is short-lived, so almost every page open after a pause paid for 150 to 600 statements before the first real query,
   each one a network round-trip to D1 (measured: /api/os/me on a cold instance = 611 statements, warm = 10). The site felt slow
   on every page.

   Now: fodo_schema holds the version this code was last set up for. A cold instance reads that one row; if it matches
   SCHEMA_VERSION every set-up is skipped. If it does not (first request after a deploy that changed the schema), setupAll()
   runs every module's set-up once, in batches, then writes the version. Any "no such table / column" error at a router resets
   the gate and runs setupAll() again, so a forgotten version bump heals itself on the first failing request.

   RULE (CLAUDE.md): any change to a DDL list, a MIG / MIGRATE list, a seed, or a new module with tables → bump SCHEMA_VERSION
   and add the module's set-up to SETUPS below. tests/v511.test.mjs checks that every file with CREATE TABLE is in SETUPS. */
export const SCHEMA_VERSION = "51.1";

const st = new WeakMap();   // per D1 binding (never a shared promise, see accounts.js): { cur: null|bool, done: Set, all: bool }
const S = (d) => { let s = st.get(d); if (!s) { s = { cur: null, done: new Set(), all: false }; st.set(d, s); } return s; };

/* is the database already on this code's schema version? One SELECT per instance; a missing table counts as "no" */
export async function current(d) {
  const s = S(d); if (s.cur !== null) return s.cur;
  let v = null; try { v = await d.prepare("SELECT v FROM fodo_schema WHERE k='version'").first(); } catch (e) { v = null; }
  s.cur = !!(v && v.v === SCHEMA_VERSION); return s.cur;
}
/* run a module's set-up once per instance, and only while the database is not on this version */
export async function setup(d, name, fn) { const s = S(d); if (s.done.has(name)) return; if (!(await current(d))) await fn(); s.done.add(name); }
/* all statements of a DDL list in one round-trip */
export const ddl = (d, list) => (list && list.length ? d.batch(list.map((q) => d.prepare(q))) : Promise.resolve([]));
/* ALTERs recorded once per database in schema_migrations (a column that exists already counts as applied), so they are not retried */
export async function alters(d, list) { if (list && list.length) await (await import("./accounts.js")).migrateOnce(d, list); }
export async function markCurrent(d) {
  await d.prepare("CREATE TABLE IF NOT EXISTS fodo_schema (k TEXT PRIMARY KEY, v TEXT, at TEXT)").run();
  await d.prepare("INSERT OR REPLACE INTO fodo_schema (k, v, at) VALUES ('version', ?1, ?2)").bind(SCHEMA_VERSION, new Date().toISOString()).run();
  S(d).cur = true;
}
export function reset(d) { const s = S(d); s.cur = false; s.done.clear(); s.all = false; }
export const isSchemaError = (e) => /no such (table|column)|has no column named/i.test(String((e && e.message) || e || ""));

/* every module that owns tables. Literal import paths (the bundler cannot resolve a variable import). */
const SETUPS = [
  ["accounts", () => import("./accounts.js").then((m) => m.db)],
  ["biz", () => import("./biz.js").then((m) => m.bdb)],
  ["production", () => import("./production.js").then((m) => m.pdb)],
  ["quotes", () => import("./quotes.js").then((m) => m.qdb)],
  ["finance", () => import("./finance.js").then((m) => m.fdb)],
  ["payouts", () => import("./payouts.js").then((m) => m.pdb)],
  ["jobs", () => import("./jobs.js").then((m) => m.jdb)],
  ["crm", () => import("./crm.js").then((m) => m.cdb)],
  ["files", () => import("./files.js").then((m) => m.fdb)],
  ["orgs", () => import("./orgs.js").then((m) => m.odb)],
  ["help", () => import("./help.js").then((m) => m.hdb)],
  ["sites", () => import("./sites.js").then((m) => m.sdb)],
  ["shop", () => import("./shop.js").then((m) => m.shopDb)],
  ["calendar", () => import("./calendar.js").then((m) => m.cdb)],
  ["traffic", () => import("./traffic.js").then((m) => m.tdb)],
  ["products", () => import("./products.js").then((m) => m.tdb)],
  ["usage", () => import("./usage.js").then((m) => m.usageDb)],
  ["gsc", () => import("./gsc.js").then((m) => m.gdb)],
  ["monitor", () => import("./monitor.js").then((m) => m.mdb)],
  ["bg", () => import("./bg.js").then((m) => m.bdb)],
  ["prompts", () => import("./prompts.js").then((m) => m.pdb)],
  ["config", () => import("./config.js").then((m) => m.cdb)],
  ["replay", () => import("./replay.js").then((m) => m.rdb)],
  ["xray-core", () => import("./xray-core.js").then((m) => m.xdb)],
  ["mail", () => import("./accounts.js").then((m) => m.mailDb)],
  ["brain-store", () => import("./brain/store.js").then((m) => m.brainDb)],
  ["os", () => import("./os/db.js").then((m) => m.osdb)],
  ["os-procure", () => import("./os/procure.js").then((m) => m.vdb)],
  ["os-platform", () => import("./os/platform.js").then((m) => m.pdb)],
  ["os-comply", () => import("./os/comply.js").then((m) => m.cdb)],
  ["os-decide", () => import("./os/decide.js").then((m) => m.ddb)],
  ["os-pros", () => import("./os/pros.js").then((m) => m.xdb)],
  ["os-kb", () => import("./os/kb.js").then((m) => m.kdb)],
  ["os-workflows", () => import("./os/workflows.js").then((m) => m.wdb)],
  ["os-docs", () => import("./os/docs.js").then((m) => m.ddb)],
  ["os-finance", () => import("./os/finance.js").then((m) => m.xdb)],
  ["os-problems", () => import("./os/problems.js").then((m) => m.pdb)],
  ["os-inbox", () => import("./os/inbox.js").then((m) => m.idb)],
  ["os-growth", () => import("./os/growth.js").then((m) => m.gdb)],
  ["os-hr", () => import("./os/hr.js").then((m) => m.hdb)],
  ["os-monitor", () => import("./os/monitor.js").then((m) => m.mdb)],
  ["os-assets", () => import("./os/assets.js").then((m) => m.adb)],
  ["os-ai", () => import("./os/ai.js").then((m) => m.adb)],
  ["privacy", () => import("./privacy.js").then((m) => m.d0)],
  ["sitecfg", () => import("./sitecfg.js").then((m) => m.cdb)],
  ["leads", () => import("./sitecfg.js").then((m) => m.ldb)],
  ["alerts", () => import("./alerts.js").then((m) => m.d0)],
];
export const SETUP_NAMES = SETUPS.map((x) => x[0]);

/* first request after a deploy (or after a schema error): every set-up once, then the version row */
export async function setupAll(env) {
  const d = env && env.XRAY_DB; if (!d) return false; const s = S(d); if (s.all) return false; s.all = true;
  try {
    for (const [name, load] of SETUPS) { let fn = null; try { fn = await load(); } catch (e) { fn = null; } if (typeof fn === "function") await fn(env); }
    await markCurrent(d); return true;
  } catch (e) { s.all = false; throw e; }
}
/* for a router: a schema error → one re-set-up and one retry of the handler */
export async function healAndRetry(env, e, again) {
  if (!isSchemaError(e) || !env || !env.XRAY_DB) throw e;
  reset(env.XRAY_DB); await setupAll(env); return again();
}
