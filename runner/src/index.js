/* FODO background runner — its own Cloudflare Worker (free plan): a Queue + Browser Rendering (+ optional GitHub Actions).
   The website (Pages) queues a background X-Ray here; this Worker opens the job's runner page in a headless browser, the page
   runs the normal X-Ray engine against the website's own API and saves the report, then we tell the website it is done.
     POST /enqueue {jobId}        (header x-runner-key)  → puts the job on the queue
     GET  /health                                          → what is connected (no secrets)
     queue consumer                                        → claim → run in a browser → done   (capacity full → wait & retry)
     cron (every 15 min)                                   → asks the website for jobs whose run died, and queues them again
   Bindings / settings (runner/wrangler.toml): JOBS (queue producer), queue consumer, BROWSER (Browser Rendering), SITE_URL.
   Secrets: RUNNER_KEY (same as the website's) · optional GH_TOKEN + GH_REPO (GitHub Actions fallback when browser time runs out). */
const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json" } });
const same = (a, b) => { a = String(a || ""); b = String(b || ""); if (!a || a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; };
const site = (env) => String(env.SITE_URL || "https://www.fodo.co.in").replace(/\/$/, "");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (o) => console.log(JSON.stringify(Object.assign({ svc: "fodo-runner", t: new Date().toISOString() }, o)));

async function api(env, path, body) {
  const r = await fetch(site(env) + "/api/xray/bg/" + path, { method: "POST", headers: { "content-type": "application/json", "x-runner-key": env.RUNNER_KEY }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(20000) });
  return r.json().catch(() => ({ ok: false, reason: "website answered " + r.status }));
}
const ghOn = (env) => !!(env.GH_TOKEN && /^[\w.-]+\/[\w.-]+$/.test(env.GH_REPO || ""));
const CAPACITY = /429|rate.?limit|too many|limit.*(exceed|reach)|quota|unable to create|no browser|browser time/i;

/* run one job in Cloudflare Browser Rendering → { ok, error, capacity } */
async function runInBrowser(env, runUrl, maxMs) {
  const launch = env.__launch || (async (b, o) => (await import("@cloudflare/puppeteer")).default.launch(b, o));   // __launch: tests only
  let browser;
  try { browser = await launch(env.BROWSER, { keep_alive: 600000 }); }
  catch (e) { const m = String((e && e.message) || e); return { ok: false, capacity: CAPACITY.test(m), error: "browser: " + m.slice(0, 160) }; }
  try {
    const page = await browser.newPage();
    await page.goto(runUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    const end = Date.now() + Math.min(maxMs || 14 * 60e3, 14 * 60e3);
    while (Date.now() < end) {
      const r = await page.evaluate(() => window.__fodoBg || null).catch(() => null);
      if (r) return r.ok ? { ok: true } : { ok: false, error: r.error || "the X-Ray stopped" };
      await wait(5000);
    }
    return { ok: false, error: "it took longer than 14 minutes" };
  } catch (e) { return { ok: false, error: "page: " + String((e && e.message) || e).slice(0, 160) };
  } finally { try { await browser.close(); } catch (e) {} }
}
/* optional fallback: GitHub Actions runs the same page with Playwright (.github/workflows/fodo-runner.yml) */
async function runOnGitHub(env, jobId, runUrl) {
  const r = await fetch("https://api.github.com/repos/" + env.GH_REPO + "/dispatches", { method: "POST", headers: { authorization: "Bearer " + env.GH_TOKEN, accept: "application/vnd.github+json", "user-agent": "fodo-runner", "content-type": "application/json" },
    body: JSON.stringify({ event_type: "fodo-xray", client_payload: { jobId, runUrl } }), signal: AbortSignal.timeout(15000) }).catch((e) => ({ ok: false, status: 0, e }));
  return r.ok || r.status === 204;
}

export async function handleJob(env, jobId, attempt) {
  const c = await api(env, "claim", { jobId, executor: "browser" });
  if (!c.ok) return { ack: true, why: c.drop ? "dropped: " + (c.reason || "") : "claim failed: " + (c.reason || "") };
  const res = await runInBrowser(env, c.runUrl, c.maxMs);
  if (res.ok) { await api(env, "done", { jobId, ok: true }); return { ack: true, why: "done" }; }
  if (res.capacity) {
    if (ghOn(env) && await runOnGitHub(env, jobId, c.runUrl)) { log({ job: jobId, ev: "github" }); return { ack: true, why: "sent to GitHub Actions" }; }
    const w = await api(env, "wait", { jobId, reason: "free browser time used up" }); if (w.drop) return { ack: true, why: "gave up" };
    return { retry: 900, why: "waiting for browser time" };
  }
  const d = await api(env, "done", { jobId, ok: false, error: res.error });
  return d.retry ? { retry: 60 * Math.min(10, 2 * (attempt || 1)), why: "retry: " + res.error } : { ack: true, why: "failed: " + res.error };
}

export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    if (u.pathname === "/health") return json({ ok: true, service: "fodo-runner", queue: !!env.JOBS, browser: !!env.BROWSER, github: ghOn(env), site: site(env), key: !!(env.RUNNER_KEY && env.RUNNER_KEY.length >= 16) });
    if (u.pathname === "/enqueue" && request.method === "POST") {
      if (!env.RUNNER_KEY || !same(request.headers.get("x-runner-key"), env.RUNNER_KEY)) return json({ ok: false }, 403);
      const b = await request.json().catch(() => ({})); if (!/^[a-z0-9]{20}$/.test(String(b.jobId || ""))) return json({ ok: false, reason: "bad job" }, 400);
      await env.JOBS.send({ jobId: b.jobId }); log({ job: b.jobId, ev: "queued" });
      return json({ ok: true, queued: true });
    }
    return json({ ok: false, reason: "Not found." }, 404);
  },
  async queue(batch, env) {
    for (const msg of batch.messages) {
      const id = msg.body && msg.body.jobId;
      try { const r = await handleJob(env, id, msg.attempts); log({ job: id, ev: r.why });
        if (r.retry) msg.retry({ delaySeconds: r.retry }); else msg.ack(); }
      catch (e) { log({ job: id, ev: "error", err: String((e && e.message) || e).slice(0, 200) }); msg.retry({ delaySeconds: 120 }); }
    }
  },
  async scheduled(event, env, ctx) {
    const s = await api(env, "sweep", {});
    for (const id of (s.requeue || [])) await env.JOBS.send({ jobId: id });
    if ((s.requeue || []).length) log({ ev: "sweep", requeued: s.requeue.length });
  },
};
