/* FODO test runner (v34). `npm test` · `npm run test:<group>` · `npm run audit[:seo|:security|:performance]`.
   - Tooling comes from tests/node_modules (`npm run setup`), or from WRANGLER / NM env vars if you already have them.
   - Static pages are served by a tiny built-in server on :8765 (no python needed); Cloudflare-runtime tests start
     `wrangler pages dev` themselves through tests/xray-fixtures/run-local.sh (port 8788).
   - Every suite runs in its own process; the summary table is printed at the end and the exit code is 1 if anything failed. */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, extname, dirname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const T = dirname(fileURLToPath(import.meta.url)), ROOT = join(T, ".."), group = process.argv[2] || "all";
const NM = process.env.NM || (existsSync(join(T, "node_modules")) ? join(T, "node_modules") : "");
const WRANGLER = process.env.WRANGLER || (NM && existsSync(join(NM, ".bin", "wrangler")) ? join(NM, ".bin", "wrangler") : "");

const UNIT = ["v13-plans", "ops", "llm-function", "voice-function", "v24-voice", "v26-live", "competitors-function", "finder-v11-functions"];
const STORE = ["v29-store", "v34-store", "v27-razorpay", "accounts-functions"];
const BUILDER = ["v28-builder", "v31-builder", "v32-builder", "v34-builder", "v35", "v36", "v37", "v38", "v39", "v40"];
const BRAIN = ["v21-brain", "v22-brain", "v23-brain", "v24-voice", "v26-live", "v27-engineer", "v30-brain-xray", "v31-live-client.js", "v37"];
const XRAY = ["xray-functions", "v17-functions", "v18-functions", "v19-functions", "xray-e2e.js"];
const SECURITY = ["v34-security", "v34-store", "v34-site", "v35", "v36", "v37", "v38", "v39", "v40"];
const INTEGRATION = ["accounts-functions", "v17-functions", "v18-functions", "v19-functions", "v20-functions", "v201-functions", "v203-chat",
  "v21-brain", "v22-brain", "v23-brain", "v27-engineer", "v27-razorpay", "v28-builder", "v29-store", "v30-brain-xray", "v31-builder", "v32-builder",
  "xray-functions", "v34-store", "v34-builder", "v34-security", "v34-site", "v35", "v36", "v37", "v38", "v39", "v40"];
const STATIC_E2E = ["v5-pages.js", "v6-features.js", "v9-seo.js", "v12-brand.js", "design-smoke.js", "voice-ui.js", "lab.js", "ai-auto.js",
  "bot-memory.js", "bot-regression.js", "v8-finder.js", "v11-finder.js", "v172-engine.js", "v202-engine.js", "v203-bot.js", "v31-live-client.js"];
const RUNTIME_E2E = ["v13-accounts-e2e.js", "v17-e2e.js", "v19-e2e.js", "v21-e2e.js", "xray-e2e.js"];
const GROUPS = { unit: UNIT, integration: INTEGRATION, store: STORE, builder: [...BUILDER, "v21-e2e.js"], brain: BRAIN, xray: XRAY, security: SECURITY,
  e2e: [...STATIC_E2E, ...RUNTIME_E2E], all: [...new Set([...UNIT, ...INTEGRATION, ...STATIC_E2E, ...RUNTIME_E2E])] };

function file(n) { const f = /\.js$/.test(n) ? n.replace(/\.js$/, ".test.js") : n + ".test.mjs"; return join(T, f); }

/* ---- static server for the built pages (port 8765) ---- */
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".xml": "application/xml", ".txt": "text/plain", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".csv": "text/csv" };
function staticServer() {
  return new Promise((res) => { const s = createServer((q, r) => {
    let p = normalize(decodeURIComponent(new URL(q.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, ""); let f = join(ROOT, p);
    if (!f.startsWith(ROOT)) { r.writeHead(403); return r.end(); }
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
    if (!existsSync(f)) { r.writeHead(404, { "content-type": "text/html" }); return r.end(existsSync(join(ROOT, "404.html")) ? readFileSync(join(ROOT, "404.html")) : "404"); }
    r.writeHead(200, { "content-type": MIME[extname(f)] || "application/octet-stream" }); r.end(readFileSync(f)); });
    s.on("error", () => res(null)); s.listen(8765, "127.0.0.1", () => res(s)); });
}

function run(cmd, args, env) {
  return new Promise((res) => { const t0 = Date.now(), p = spawn(cmd, args, { cwd: ROOT, env: Object.assign({}, process.env, env || {}) }); let out = "";
    const timer = setTimeout(() => p.kill("SIGKILL"), 15 * 60000);
    p.stdout.on("data", (d) => { out += d; }); p.stderr.on("data", (d) => { out += d; });
    p.on("close", (code) => { clearTimeout(timer); res({ code, out, ms: Date.now() - t0 }); }); });
}
function score(out, code) {
  const m = [...out.matchAll(/(\d+)\s*\/\s*(\d+)\s+passed/g)].pop(), m2 = /(\d+) passed, (\d+) failed/.exec(out);
  if (m) return { pass: +m[1], total: +m[2], ok: +m[1] === +m[2] && code === 0 };
  if (m2) return { pass: +m2[1], total: +m2[1] + +m2[2], ok: +m2[2] === 0 && code === 0 };
  const m3 = [...out.matchAll(/^[\w .-]+:\s*(\d+)\s*\/\s*(\d+)\s*$/gm)].pop(); if (m3) return { pass: +m3[1], total: +m3[2], ok: +m3[1] === +m3[2] && code === 0 };
  return { pass: code === 0 ? 1 : 0, total: 1, ok: code === 0 };
}

async function suites(list) {
  const needStatic = list.some((n) => STATIC_E2E.indexOf(n) > -1), needRuntime = list.some((n) => RUNTIME_E2E.indexOf(n) > -1);
  if (needRuntime && !WRANGLER) console.log("! WRANGLER not found: run `npm run setup` (or set WRANGLER=…). Runtime e2e suites will be reported as failed.");
  const srv = needStatic ? await staticServer() : null; if (needStatic && !srv) console.log("· port 8765 busy, using whatever already serves it");
  const rows = []; let failed = 0;
  for (const n of list) { const f = file(n); if (!existsSync(f)) { rows.push([n, "missing", 0, 0, 0]); failed++; continue; }
    process.stdout.write("… " + n.padEnd(22));
    const r = await run(process.execPath, [f], { NM, WRANGLER, NODE_PATH: NM || process.env.NODE_PATH || "" }), s = score(r.out, r.code);
    if (!s.ok) { failed++; const tail = r.out.split("\n").filter((l) => /FAIL|Error|crash/.test(l)).slice(0, 6).join("\n   "); console.log("FAIL " + s.pass + "/" + s.total + (tail ? "\n   " + tail : "")); }
    else console.log("ok   " + s.pass + "/" + s.total + "  " + Math.round(r.ms / 1000) + "s");
    rows.push([n, s.ok ? "pass" : "FAIL", s.pass, s.total - s.pass, Math.round(r.ms / 1000)]); }
  if (srv) srv.close();
  console.log("\n| Suite | Result | Passed | Failed | Seconds |\n|---|---|---:|---:|---:|\n" + rows.map((r) => "| " + r.join(" | ") + " |").join("\n"));
  const P = rows.reduce((a, r) => a + r[2], 0), F = rows.reduce((a, r) => a + r[3], 0);
  console.log("\nTOTAL " + P + " checks passed, " + F + " failed, " + failed + " suite(s) failing");
  try { mkdirSync(join(ROOT, "docs"), { recursive: true }); writeFileSync(join(T, ".last-run.json"), JSON.stringify({ group, at: new Date().toISOString(), rows }, null, 1)); } catch (e) {}
  return failed;
}

/* ---- audits ---- */
function seoAudit() { const r = spawnSync("python3", [join(ROOT, "scripts", "seo_audit.py")], { cwd: ROOT, encoding: "utf8" }); console.log((r.stdout || "") + (r.stderr || "")); return r.status ? 1 : 0; }
async function perfAudit() { const r = await run(process.execPath, [join(T, "perf-audit.mjs")]); console.log(r.out); return r.code ? 1 : 0; }
function secretScan() {
  const r = spawnSync("grep", ["-rInE", "--exclude-dir=node_modules", "--exclude-dir=tests", "--exclude-dir=docs", "--exclude-dir=.wrangler", "(re_[A-Za-z0-9]{24,}|sk-[A-Za-z0-9]{32,}|AIza[0-9A-Za-z_-]{35}|rzp_live_[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY)", "js", "functions", "sites", "scripts", "css"], { cwd: ROOT, encoding: "utf8" });
  if (r.stdout.trim()) { console.log("Possible secrets in source:\n" + r.stdout); return 1; } console.log("secret scan: no API keys, tokens or private keys in js/, functions/, sites/, scripts/, css/"); return 0;
}

let bad = 0;
if (group === "audit-seo") bad = seoAudit();
else if (group === "audit-performance") bad = await perfAudit();
else if (group === "audit-security") { bad = secretScan() + await suites(SECURITY); }
else if (group === "audit") { bad = seoAudit() + secretScan() + await perfAudit(); }
else if (GROUPS[group]) bad = await suites(GROUPS[group]);
else { console.log("Unknown group '" + group + "'. Groups: " + Object.keys(GROUPS).join(", ") + ", audit, audit-seo, audit-security, audit-performance"); bad = 1; }
process.exit(bad ? 1 : 0);
