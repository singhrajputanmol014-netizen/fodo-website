#!/usr/bin/env node
/* FODO v50.8: backup and restore of the D1 database (and the list of files that must exist in R2). See docs/BACKUP-RESTORE.md.
   node scripts/backup.mjs export              production D1 → backups/fodo-xray-<date>.sql   (wrangler d1 export --remote; needs CLOUDFLARE_API_TOKEN)
   node scripts/backup.mjs manifest            production biz_files → backups/files-<date>.json (what R2 must hold: id, size, sha256)
   node scripts/backup.mjs verify <file.sql>   restore a dump into a scratch SQLite file: integrity check + row count per table
   node scripts/backup.mjs rehearse --state <dir> | --sqlite <file>
                                               the full drill on a LOCAL database: dump → restore into a fresh file → compare every table
   Nothing here writes to production. A restore to production is a manual step written in docs/BACKUP-RESTORE.md. */
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import fs from "node:fs"; import path from "node:path"; import os from "node:os";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), ".."), DB = "fodo-xray", day = new Date().toISOString().slice(0, 10);
const out = (f) => { const d = path.join(ROOT, "backups"); fs.mkdirSync(d, { recursive: true }); return path.join(d, f); };
const wrangler = () => process.env.WRANGLER || path.join(ROOT, "tests/node_modules/.bin/wrangler");
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const lit = (v) => v === null || v === undefined ? "NULL" : typeof v === "number" || typeof v === "bigint" ? String(v) : v instanceof Uint8Array ? "X'" + Buffer.from(v).toString("hex") + "'" : q(v);

/* a portable SQL dump (schema + rows), the same shape as `wrangler d1 export` */
export function dump(db) {
  const L = ["PRAGMA defer_foreign_keys=TRUE;"], objs = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type='table' DESC, name").all();
  for (const o of objs.filter((x) => x.type === "table")) { if (/^CREATE VIRTUAL/i.test(o.sql)) { L.push(o.sql + ";"); continue; } L.push(o.sql + ";"); for (const r of db.prepare("SELECT * FROM " + JSON.stringify(o.name)).all()) { const ks = Object.keys(r); L.push("INSERT INTO " + JSON.stringify(o.name) + " (" + ks.map((k) => JSON.stringify(k)).join(",") + ") VALUES (" + ks.map((k) => lit(r[k])).join(",") + ");"); } }
  for (const o of objs.filter((x) => x.type !== "table")) L.push(o.sql + ";");
  return L.join("\n") + "\n";
}
export function counts(db) { const o = {}; for (const t of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND sql NOT LIKE 'CREATE VIRTUAL%'").all()) { try { o[t.name] = db.prepare("SELECT count(*) n FROM " + JSON.stringify(t.name)).get().n; } catch (e) { o[t.name] = "error"; } } return o; }
export function restore(sqlText, file) { if (fs.existsSync(file)) fs.rmSync(file); const db = new DatabaseSync(file); db.exec("BEGIN"); try { db.exec(sqlText); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; } return db; }
function findSqlite(state) { const hits = []; const walk = (d) => { for (const n of fs.readdirSync(d)) { const f = path.join(d, n); const s = fs.statSync(f); if (s.isDirectory()) walk(f); else if (/\.sqlite$/.test(n) && /d1/i.test(f)) hits.push([f, s.size]); } }; walk(state); return hits.sort((a, b) => b[1] - a[1]).map((x) => x[0]); }

export function rehearse(srcFile) {
  const t0 = Date.now(), src = new DatabaseSync(srcFile, { readOnly: true }), before = counts(src), sql = dump(src); src.close();
  const dumpFile = path.join(os.tmpdir(), "fodo-rehearsal-" + process.pid + ".sql"); fs.writeFileSync(dumpFile, sql);
  const target = path.join(os.tmpdir(), "fodo-restored-" + process.pid + ".sqlite"), db = restore(fs.readFileSync(dumpFile, "utf8"), target), after = counts(db), integrity = db.prepare("PRAGMA integrity_check").get().integrity_check; db.close();
  const diff = Object.keys(before).filter((t) => before[t] !== after[t]).map((t) => t + ": " + before[t] + " → " + after[t]);
  const rows = Object.values(before).filter((n) => typeof n === "number").reduce((a, n) => a + n, 0);
  return { at: new Date().toISOString(), source: srcFile, tables: Object.keys(before).length, rows, dump_bytes: Buffer.byteLength(sql), integrity, mismatches: diff, ok: !diff.length && integrity === "ok", ms: Date.now() - t0, dump: dumpFile, restored: target };
}

const [cmd, ...args] = process.argv.slice(2), arg = (k) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : null; };
if (import.meta.url === "file://" + process.argv[1]) {
  if (cmd === "export") { const f = out(DB + "-" + day + ".sql"); if (!process.env.CLOUDFLARE_API_TOKEN) console.log("Set CLOUDFLARE_API_TOKEN (D1 read) first. Command:"); console.log(wrangler() + " d1 export " + DB + " --remote --output " + f);
    if (process.env.CLOUDFLARE_API_TOKEN) { const r = spawnSync(wrangler(), ["d1", "export", DB, "--remote", "--output", f], { stdio: "inherit", cwd: ROOT }); process.exit(r.status || 0); } }
  else if (cmd === "manifest") { const f = out("files-" + day + ".json"), sqlq = "SELECT id, owner_id, project_id, name, size, sha256, store, created_at FROM biz_files WHERE deleted_at IS NULL"; console.log(wrangler() + " d1 execute " + DB + " --remote --json --command " + JSON.stringify(sqlq) + " > " + f);
    if (process.env.CLOUDFLARE_API_TOKEN) { const r = spawnSync(wrangler(), ["d1", "execute", DB, "--remote", "--json", "--command", sqlq], { cwd: ROOT, encoding: "utf8" }); if (r.status) { console.error(r.stderr); process.exit(r.status); } fs.writeFileSync(f, r.stdout); console.log("wrote " + f); } }
  else if (cmd === "verify") { const f = args[0]; if (!f) { console.error("usage: verify <file.sql>"); process.exit(2); } const t = path.join(os.tmpdir(), "fodo-verify-" + process.pid + ".sqlite"), db = restore(fs.readFileSync(f, "utf8"), t); const rep = { file: f, integrity: db.prepare("PRAGMA integrity_check").get().integrity_check, counts: counts(db) }; db.close(); console.log(JSON.stringify(rep, null, 1)); process.exit(rep.integrity === "ok" ? 0 : 1); }
  else if (cmd === "rehearse") { let src = arg("--sqlite"); if (!src && arg("--state")) src = findSqlite(arg("--state"))[0]; if (!src) { console.error("usage: rehearse --state <wrangler persist dir> | --sqlite <file>"); process.exit(2); } const rep = rehearse(src); console.log(JSON.stringify(rep, null, 1)); process.exit(rep.ok ? 0 : 1); }
  else { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split("\n").slice(1, 8).join("\n")); }
}
