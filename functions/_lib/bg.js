/* FODO Growth Lab v19 — background X-Rays (prompt §54–56): the report is built even if the visitor closes the tab.
   How it works (all on Cloudflare's free plan):
     1. /api/xray/start {background:true} creates the job (credits checked as usual) and asks the runner Worker to queue it.
     2. The runner Worker (runner/ — its own Cloudflare Worker with a Queue + Browser Rendering) takes the job from the queue,
        claims it here (bg/claim) and opens   /business-x-ray/?bg=<job>&t=<token>   in a headless browser.
     3. That page runs the SAME X-Ray engine the visitor's browser runs (same server steps, same limits, same evidence) and saves
        the report. The runner then reports back (bg/done) → the user gets an email, the account shows the report.
   If the free daily browser time is used up, the job waits in the queue and starts automatically (or GitHub Actions runs it,
   when that optional fallback is connected). A job that can't run within its time is refunded.
   Secrets (Cloudflare → fodo-website → Variables and Secrets):  RUNNER_URL (the Worker's address)  RUNNER_KEY (shared, 32+ chars) */
const enc = new TextEncoder();
export const bgOn = (env) => !!(env && env.RUNNER_URL && env.RUNNER_KEY && String(env.RUNNER_KEY).length >= 16);

const DDL = "CREATE TABLE IF NOT EXISTS xray_bg (job_id TEXT PRIMARY KEY, user_id TEXT, owner_id TEXT, email TEXT, payload TEXT, status TEXT, executor TEXT, attempts INTEGER DEFAULT 0, note TEXT, enqueued_at TEXT, started_at TEXT, finished_at TEXT, notified INTEGER DEFAULT 0)";
const made = new WeakSet();
export async function bdb(env) { const d = env.XRAY_DB; if (!d) return null; if (!made.has(d)) { await d.prepare(DDL).run(); made.add(d); } return d; }

/* the page token: HMAC(RUNNER_KEY, job id) — only the runner (which knows the key) can open a job's background page */
export async function bgToken(env, jobId) {
  const k = await crypto.subtle.importKey("raw", enc.encode(String(env.RUNNER_KEY)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode("bg:" + jobId)));
  return Array.from(s.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export const same = (a, b) => { a = String(a || ""); b = String(b || ""); if (!a || a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; };
export const runnerAuth = (env, request) => bgOn(env) && same(request.headers.get("x-runner-key"), env.RUNNER_KEY);

/* ask the runner Worker to queue the job → true when queued */
export async function enqueue(env, jobId) {
  try {
    const r = await fetch(String(env.RUNNER_URL).replace(/\/$/, "") + "/enqueue", { method: "POST", headers: { "content-type": "application/json", "x-runner-key": env.RUNNER_KEY }, body: JSON.stringify({ jobId }), signal: AbortSignal.timeout(8000) });
    return r.ok;
  } catch (e) { return false; }
}
