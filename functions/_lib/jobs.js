/* FODO v47.6 background jobs: a small, honest queue in D1 (biz_jobs) with retries, backoff and a dead-letter state.
   If a Cloudflare Queue is bound as JOBS (wrangler.toml), enqueue() also sends the job there so a consumer Worker can
   run it right away; without it the scheduler (/api/monitor/tick) runs due jobs. Either way the D1 row is the truth:
   a job runs once, its attempts and errors are recorded, and nothing is silently dropped.
   Handlers are registered here (a job kind that isn't registered goes to "dead" with a reason). */
import { nowIso, randId, sendMail } from "./accounts.js";
import { bdb, can, err, auditLog, notify } from "./biz.js";

const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
const all = async (d, sql, ...a) => (await d.prepare(sql).bind(...a).all()).results || [];
const one = (d, sql, ...a) => d.prepare(sql).bind(...a).first();
const run = (d, sql, ...a) => d.prepare(sql).bind(...a).run();
const DDL = ["CREATE TABLE IF NOT EXISTS biz_jobs (id TEXT PRIMARY KEY, kind TEXT, payload TEXT, status TEXT, attempts INTEGER DEFAULT 0, max_attempts INTEGER DEFAULT 5, run_after TEXT, locked_at TEXT, last_error TEXT, result TEXT, created_by TEXT, created_at TEXT, done_at TEXT)",
  "CREATE INDEX IF NOT EXISTS biz_jobs_due ON biz_jobs(status, run_after)"];
const ready = new WeakSet();
export async function jdb(env) { const d = await bdb(env); if (!ready.has(d)) { for (const q of DDL) await d.prepare(q).run(); ready.add(d); } return d; }
export const queueOn = (env) => !!(env.JOBS && typeof env.JOBS.send === "function");
export const STATES = ["queued", "running", "done", "failed", "dead"];
const BACKOFF = [60, 300, 900, 3600, 7200];   /* seconds before the next try */

/* ---------- handlers: each returns a small result or throws ---------- */
export const HANDLERS = {
  mail: { desc: "Send an email (retried up to 5 times)", run: async (env, p) => { await sendMail(env, p.to, p.subject, p.html, p.text, p.opt || {}); return { sent: true }; } },
  notify: { desc: "Workspace notification", run: async (env, p) => { await notify(env, p.userId, p.kind || "system", p.text, p.link || ""); return { ok: true }; } },
  upload_sweep: { desc: "Abort expired multipart uploads", run: async (env) => ({ aborted: await (await import("./files.js")).mpSweep(env, 20) }) },
  /* v50.2 FODO OS jobs (hourly: os_hourly, daily: os_daily) */
  os_hourly: { desc: "FODO OS hourly: approval escalation, SLA check, grant expiry, deadline reminders", run: async (env) => { const out = {}; try { out.approvals = await (await import("./os/approvals.js")).escalateDue(env, 25); } catch (e) { out.approvals = String(e.message); } try { out.sla = await (await import("./os/support.js")).slaCheck(env); } catch (e) { out.sla = String(e.message); } try { out.grants = await (await import("./os/people.js")).expireGrants(env); } catch (e) { out.grants = String(e.message); } try { out.workflows = await (await import("./os/workflows.js")).runScheduled(env, "hourly"); } catch (e) { out.workflows = String(e.message); } try { out.reminders = await (await import("./os/work.js")).deadlineReminders(env); } catch (e) { out.reminders = String(e.message); } return out; } },
  os_daily: { desc: "FODO OS daily: control tower snapshot, problem scan, renewals, document expiry, article / risk reviews, privacy requests due", run: async (env) => { const out = {}; try { out.snapshot = await (await import("./os/command.js")).snapshot(env); } catch (e) { out.snapshot = String(e.message); } try { out.rights = await (await import("./os/growth.js")).rightsScan(env); } catch (e) { out.rights = String(e.message); } try { const PB = await import("./os/problems.js"); out.problems = await PB.scan(env); } catch (e) { out.problems = String(e.message); } try { const WF = await import("./os/workflows.js"); out.workflows = await WF.runScheduled(env, "daily"); } catch (e) { out.workflows = String(e.message); } try { out.decisions = await (await import("./os/decide.js")).reminders(env); } catch (e) { out.decisions = String(e.message); } try { out.platform = await (await import("./os/platform.js")).daily(env); } catch (e) { out.platform = String(e.message); } try { out.documents = await (await import("./os/docs.js")).daily(env); } catch (e) { out.documents = String(e.message); } try { out.knowledge = await (await import("./os/kb.js")).reminders(env); } catch (e) { out.knowledge = String(e.message); } try { out.compliance = await (await import("./os/comply.js")).daily(env); } catch (e) { out.compliance = String(e.message); } try { out.assets = await (await import("./os/assets.js")).daily(env); } catch (e) { out.assets = String(e.message); } return out; } },
  team_housekeeping: { desc: "Expire overdue team invitations and send reminders", run: async (env) => { const TM = await import("./teams.js"); return { expired: await TM.expireDue(env), reminded: await TM.remindDue(env) }; } },
  refund_check: { desc: "Ask the payment provider about refunds in progress", run: async (env) => { const B = await import("./biz.js"); return (await import("./projects2.js")).checkRefunds(env, { auditLog: B.auditLog, notify: B.notify }, 20); } },
  payout_check: { desc: "Ask the payout provider about payouts in progress", run: async (env) => (await import("./payouts.js")).checkAll(env, 20) },
  webhook: { desc: "POST a JSON body to a URL (owner automations)", run: async (env, p) => { if (!/^https:\/\//.test(p.url || "")) throw new Error("https URL needed"); const r = await fetch(p.url, { method: "POST", headers: { "content-type": "application/json", "user-agent": "FODO/1.0" }, body: JSON.stringify(p.body || {}) }); if (!r.ok) throw new Error("HTTP " + r.status); return { status: r.status }; } },
};

/* ---------- producer ---------- */
export async function enqueue(env, kind, payload, opts) {
  opts = opts || {}; if (!HANDLERS[kind]) throw err("Unknown job kind: " + kind);
  const d = await jdb(env), id = "jb" + randId(14), when = opts.runAt ? new Date(opts.runAt).toISOString() : nowIso(), s = JSON.stringify(payload || {}); if (s.length > 60000) throw err("Job payload too big.");
  if (opts.key) { const dup = await one(d, "SELECT id FROM biz_jobs WHERE kind=?1 AND json_extract(payload,'$.__key')=?2", kind, opts.key); if (dup) return { id: dup.id, duplicate: true };   /* a keyed job exists once, whatever its state */ payload = Object.assign({}, payload, { __key: opts.key }); }
  await run(d, "INSERT INTO biz_jobs (id, kind, payload, status, attempts, max_attempts, run_after, created_by, created_at) VALUES (?1,?2,?3,'queued',0,?4,?5,?6,?7)", id, kind, JSON.stringify(payload || {}), Math.min(10, Math.max(1, +opts.maxAttempts || 5)), when, clip(opts.by, 120) || "system", nowIso());
  let sent = false; if (queueOn(env) && !opts.runAt) { try { await env.JOBS.send({ id, kind }); sent = true; } catch (e) {} }
  return { id, queued: true, viaQueue: sent };
}

/* ---------- consumer: runs ONE job by id (used by the Queue consumer and the scheduler); at-most-once per attempt via the lock ---------- */
export async function runJob(env, id) {
  const d = await jdb(env), now = nowIso(), lock = await run(d, "UPDATE biz_jobs SET status='running', locked_at=?2, attempts=attempts+1 WHERE id=?1 AND status IN ('queued','failed') AND run_after <= ?2", id, now);
  if (!lock.meta.changes) return { id, skipped: true };
  const j = await one(d, "SELECT * FROM biz_jobs WHERE id=?1", id), H = HANDLERS[j.kind];
  if (!H) { await run(d, "UPDATE biz_jobs SET status='dead', last_error=?2, done_at=?3 WHERE id=?1", id, "no handler for " + j.kind, nowIso()); return { id, dead: true }; }
  try { const r = await Promise.race([H.run(env, J(j.payload, {})), new Promise((_, no) => setTimeout(() => no(new Error("timed out after 25 s")), 25000))]);
    await run(d, "UPDATE biz_jobs SET status='done', result=?2, done_at=?3, locked_at=NULL WHERE id=?1", id, JSON.stringify(r == null ? {} : r).slice(0, 4000), nowIso()); return { id, done: true }; }
  catch (e) { const dead = j.attempts >= j.max_attempts, next = new Date(Date.now() + (BACKOFF[Math.min(BACKOFF.length - 1, j.attempts - 1)] || 60) * 1000).toISOString();
    await run(d, "UPDATE biz_jobs SET status=?2, last_error=?3, run_after=?4, locked_at=NULL, done_at=CASE WHEN ?2='dead' THEN ?5 ELSE NULL END WHERE id=?1", id, dead ? "dead" : "failed", clip(e && e.message, 400), next, nowIso());
    if (dead) { try { await auditLog(env, "system", "job:dead", id, j.kind + ": " + clip(e && e.message, 200)); } catch (x) {} } return { id, failed: true, dead, error: clip(e && e.message, 200) }; }
}
/* the scheduler: run what is due (bounded), release locks that a crashed run left behind (10 min) */
export async function runDue(env, n) {
  const d = await jdb(env), now = nowIso(); await run(d, "UPDATE biz_jobs SET status='failed', last_error='run interrupted', locked_at=NULL WHERE status='running' AND locked_at < ?1", new Date(Date.now() - 600e3).toISOString());
  const due = await all(d, "SELECT id FROM biz_jobs WHERE status IN ('queued','failed') AND run_after <= ?1 ORDER BY run_after LIMIT ?2", now, Math.max(1, Math.min(50, n || 10)));
  const out = { ran: 0, done: 0, failed: 0, dead: 0 }; for (const x of due) { const r = await runJob(env, x.id); if (r.skipped) continue; out.ran++; if (r.done) out.done++; if (r.failed) out.failed++; if (r.dead) out.dead++; }
  out.remaining = ((await one(d, "SELECT count(*) n FROM biz_jobs WHERE status IN ('queued','failed') AND run_after <= ?1", nowIso())) || {}).n || 0; return out;
}
/* the daily housekeeping jobs, queued once per day each (idempotent through the key) */
export async function enqueueDaily(env) { const day = nowIso().slice(0, 10), out = []; for (const k of ["upload_sweep", "team_housekeeping", "refund_check", "payout_check", "os_daily"]) out.push((await enqueue(env, k, {}, { key: k + ":" + day, maxAttempts: 3 })).id); return out; }

/* ---------- staff view ---------- */
export async function adminJobs(env, R, q) {
  if (!can(R, ["admin", "finance", "viewer"])) throw err("Not allowed.", 403); const d = await jdb(env), st = STATES.indexOf((q || {}).status) > -1 ? q.status : "";
  const counts = {}; for (const r of await all(d, "SELECT status, count(*) n FROM biz_jobs GROUP BY status")) counts[r.status] = r.n;
  const items = (await all(d, "SELECT id, kind, status, attempts, max_attempts, run_after, last_error, result, created_by, created_at, done_at, payload FROM biz_jobs WHERE (?1='' OR status=?1) ORDER BY created_at DESC LIMIT 200", st)).map((x) => { const p = J(x.payload, {}); return { id: x.id, kind: x.kind, status: x.status, attempts: x.attempts, maxAttempts: x.max_attempts, runAfter: x.run_after, error: x.last_error, result: J(x.result, null), by: x.created_by, createdAt: x.created_at, doneAt: x.done_at, summary: p.to ? "to " + p.to + (p.subject ? " · " + p.subject : "") : p.url ? p.url : p.text ? clip(p.text, 80) : "" }; });
  return { items, counts, queue: queueOn(env) ? "Cloudflare Queue" : "scheduler (daily tick)", kinds: Object.keys(HANDLERS).map((k) => ({ kind: k, desc: HANDLERS[k].desc })) };
}
export async function retryJob(env, u, R, id) { if (!can(R, ["admin"])) throw err("Only FODO admins.", 403); const d = await jdb(env), x = await run(d, "UPDATE biz_jobs SET status='queued', run_after=?2, attempts=0, last_error=NULL WHERE id=?1 AND status IN ('failed','dead')", clip(id, 40), nowIso()); if (!x.meta.changes) throw err("Only failed or dead jobs can be retried.", 409); await auditLog(env, u.email, "job:retry", id); return { ok: true }; }
export async function runNow(env, u, R, n) { if (!can(R, ["admin"])) throw err("Only FODO admins.", 403); const r = await runDue(env, n || 10); await auditLog(env, u.email, "job:run", "", JSON.stringify(r)); return r; }
