// FODO background X-Ray — GitHub Actions fallback (see .github/workflows/fodo-runner.yml).
// Opens the job's runner page (it carries its own HMAC token), waits until the page has saved the report, then tells the website.
import { chromium } from "playwright";
const url = process.env.RUN_URL || "", job = process.env.JOB_ID || "", key = process.env.KEY || "";
if (!/^https:\/\/[^/]+\/business-x-ray\/\?bg=[a-z0-9]{20}&t=[a-f0-9]{32}$/.test(url) || !/^[a-z0-9]{20}$/.test(job) || key.length < 16) { console.log("bad input"); process.exit(1); }
const origin = new URL(url).origin, done = (body) => fetch(origin + "/api/xray/bg/done", { method: "POST", headers: { "content-type": "application/json", "x-runner-key": key }, body: JSON.stringify(Object.assign({ jobId: job }, body)) }).then((r) => r.json()).catch((e) => ({ ok: false, e: String(e) }));
const b = await chromium.launch(); let res = { ok: false, error: "timed out after 14 minutes" };
try {
  const p = await b.newPage(); await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  const r = await p.waitForFunction(() => window.__fodoBg, null, { timeout: 14 * 60e3, polling: 5000 }).then((h) => h.jsonValue()).catch(() => null);
  if (r) res = r.ok ? { ok: true } : { ok: false, error: r.error || "the X-Ray stopped" };
} catch (e) { res = { ok: false, error: String(e.message || e).slice(0, 160) }; }
await b.close();
console.log(JSON.stringify(Object.assign({ job }, res, { site: await done(res) })));
