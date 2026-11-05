/* FODO OS V4 Phase 8 (v50.8): the monitoring page. Everything is read from what FODO actually records, nothing is estimated:
   server errors of /api/os (counted per route pattern and day by the router, message scrubbed), background jobs (biz_jobs),
   blocked / reported scripts (csp_reports), data size, access signals (view-as, temporary grants, suspended people), AI use,
   and when the last backup was taken (recorded by an owner after running scripts/backup.mjs). */
import { nowIso } from "../accounts.js";
import { osdb, one, all, run, J, clip, err, ORG } from "./db.js";
import { audit } from "./audit.js";
import { setting, settingSet } from "./kit.js";

const DDL = ["CREATE TABLE IF NOT EXISTS os_errors (k TEXT PRIMARY KEY, day TEXT, route TEXT, status INTEGER, n INTEGER, last_message TEXT, last_at TEXT)", "CREATE INDEX IF NOT EXISTS os_errors_d ON os_errors(day)"];
const made = new WeakSet();
export async function mdb(env) { const d = await osdb(env); if (!made.has(d)) { for (const q of DDL) await d.prepare(q).run(); made.add(d); } return d; }
const scrub = (s) => clip(String(s || "").replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "<email>").replace(/\b\d{6,}\b/g, "<n>").replace(/(key|token|secret)=\S+/gi, "$1=<hidden>"), 200);
/* the router calls this for every 5xx; it never throws */
export async function recordError(env, route, status, e) {
  try { const d = await mdb(env), day = nowIso().slice(0, 10), r = clip(route, 80), k = day + "|" + r + "|" + status;
    await run(d, "INSERT INTO os_errors (k, day, route, status, n, last_message, last_at) VALUES (?1,?2,?3,?4,1,?5,?6) ON CONFLICT(k) DO UPDATE SET n=n+1, last_message=?5, last_at=?6", k, day, r, status, scrub(e && e.message), nowIso()); } catch (x) {}
}
const n0 = async (d, sql, ...a) => { try { return ((await one(d, sql, ...a)) || {}).n || 0; } catch (e) { return null; } };
export async function overview(env, P, probes) {
  const d = await mdb(env), day7 = new Date(Date.now() - 7 * 864e5).toISOString(), day1 = new Date(Date.now() - 864e5).toISOString(), out = { at: nowIso(), probes };
  out.errors = { last_24h: await n0(d, "SELECT coalesce(sum(n),0) n FROM os_errors WHERE last_at>?1", day1), last_7d: await n0(d, "SELECT coalesce(sum(n),0) n FROM os_errors WHERE day>=?1", day7.slice(0, 10)), top: await all(d, "SELECT route, status, sum(n) n, max(last_at) last_at, max(last_message) last_message FROM os_errors WHERE day>=?1 GROUP BY route, status ORDER BY n DESC LIMIT 10", day7.slice(0, 10)).catch(() => []) };
  try { const J2 = await import("../jobs.js"); const jd = await J2.jdb(env);
    out.jobs = { queued: await n0(jd, "SELECT count(*) n FROM biz_jobs WHERE status='queued'"), failed_7d: await n0(jd, "SELECT count(*) n FROM biz_jobs WHERE status IN ('failed','dead') AND created_at>?1", day7), dead: await n0(jd, "SELECT count(*) n FROM biz_jobs WHERE status='dead'"),
      last: {} }; for (const k of ["os_hourly", "os_daily"]) { const r = await one(jd, "SELECT status, done_at, created_at, last_error FROM biz_jobs WHERE kind=?1 ORDER BY created_at DESC LIMIT 1", k).catch(() => null); const ok = await one(jd, "SELECT max(done_at) t FROM biz_jobs WHERE kind=?1 AND status='done'", k).catch(() => null); out.jobs.last[k] = { status: r ? r.status : "never ran", last_success: ok && ok.t || null, last_error: r && r.last_error ? clip(r.last_error, 200) : null, stale: !(ok && ok.t) || ok.t < new Date(Date.now() - (k === "os_hourly" ? 3 : 30) * 3600e3).toISOString() }; }
    out.jobs.recent_failures = await all(jd, "SELECT kind, status, attempts, last_error, created_at FROM biz_jobs WHERE status IN ('failed','dead') ORDER BY created_at DESC LIMIT 8").catch(() => []); } catch (e) { out.jobs = null; }
  out.csp = { last_7d: await n0(d, "SELECT coalesce(sum(n),0) n FROM csp_reports WHERE last_at>?1", day7), top: await all(d, "SELECT directive, blocked, page, n, last_at FROM csp_reports WHERE last_at>?1 ORDER BY n DESC LIMIT 8", day7).catch(() => []) };
  out.data = {}; for (const [k, t] of [["people", "os_members"], ["projects", "biz_projects"], ["tasks", "biz_tasks"], ["clients", "os_clients"], ["files", "biz_files"], ["audit_rows", "os_audit"], ["events", "os_events"], ["documents", "os_documents"]]) out.data[k] = await n0(d, "SELECT count(*) n FROM " + t);
  out.access = { view_as_7d: await n0(d, "SELECT count(*) n FROM os_impersonations WHERE started_at>?1", day7), temporary_grants: await n0(d, "SELECT count(*) n FROM os_member_perms WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?1)", nowIso()), suspended: await n0(d, "SELECT count(*) n FROM os_members WHERE org_id=?1 AND status='suspended'", ORG), owner_actions_24h: await n0(d, "SELECT count(*) n FROM os_audit WHERE created_at>?1 AND (action LIKE 'OWNER_%' OR action LIKE 'VIEW_AS%')", day1) };
  out.ai = { questions_24h: await n0(d, "SELECT count(*) n FROM os_ai_calls WHERE created_at>?1", day1), kill_switch: !!(await setting(d, "ai_kill", null)) };
  const bk = await setting(d, "last_backup", null); out.backup = bk ? Object.assign(bk, { age_days: Math.floor((Date.now() - new Date(bk.at).getTime()) / 864e5) }) : null;
  /* what needs attention, worst first */
  const a = []; if (probes.d1 !== "ok") a.push({ level: "critical", text: "The database probe is failing." }); if (/ON/.test(probes.test_mode || "")) a.push({ level: "critical", text: "Test mode is ON. Remove XRAY_TEST_MODE in production." });
  if (out.errors.last_24h) a.push({ level: out.errors.last_24h > 20 ? "high" : "medium", text: out.errors.last_24h + " server error(s) in the last 24 hours." });
  if (out.jobs) for (const k of Object.keys(out.jobs.last)) if (out.jobs.last[k].stale) a.push({ level: "high", text: k + " has not completed recently" + (out.jobs.last[k].last_success ? " (last success " + out.jobs.last[k].last_success.slice(0, 16).replace("T", " ") + ")" : " (never)") + "." });
  if (out.jobs && out.jobs.dead) a.push({ level: "medium", text: out.jobs.dead + " background job(s) gave up (dead)." });
  if (!bk) a.push({ level: "high", text: "No backup recorded yet. Run scripts/backup.mjs export, then record it here." }); else if (out.backup.age_days > 7) a.push({ level: "medium", text: "Last backup is " + out.backup.age_days + " days old." });
  if (out.csp.last_7d) a.push({ level: "low", text: out.csp.last_7d + " blocked or reported script / resource load(s) in 7 days." });
  out.attention = a; return out;
}
export async function backupRecord(env, P, b) {
  if (!P.isOwner) throw err("Only an owner records a backup.", 403); const d = await mdb(env), file = clip(b.file, 160), rows = Math.max(0, Math.round(+b.rows || 0)) || null, note = clip(b.note, 300); if (!file) throw err("Which file (name of the export)?");
  const v = { at: nowIso(), by: P.user.email, file, rows, verified: !!b.verified, note }; await settingSet(d, "last_backup", v); await audit(env, P, "BACKUP_RECORDED", { kind: "backup", id: file }, null, v); return { backup: v };
}
