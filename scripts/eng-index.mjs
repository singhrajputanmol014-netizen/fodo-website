// FODO Website Engineer — project indexer (v27). Runs in GitHub Actions on every push to main (and on demand), scans the real
// checkout and sends the project map to the Brain: pages/routes, APIs, D1 tables, env variable NAMES (never values), design tokens,
// components (class usage), dependents (which pages load each JS/CSS file), symbols and CTAs.
// Local test: node scripts/eng-index.mjs --print      CI: SITE + KEY (= FODO_CRON_KEY) → POST /api/owner-brain/eng/index
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd(), SKIP = /^(node_modules|\.git|\.wrangler|tests\/xray-fixtures|data\/xray-sample|assets\/img)(\/|$)/;
function walk(dir, out) { for (const n of readdirSync(dir)) { const p = join(dir, n), r = relative(ROOT, p).replace(/\\/g, "/"); if (SKIP.test(r)) continue; const s = statSync(p); if (s.isDirectory()) walk(p, out); else out.push({ path: r, size: s.size }); } return out; }
const files = walk(ROOT, []), text = (p) => { try { return readFileSync(join(ROOT, p), "utf8"); } catch (e) { return ""; } };
const isText = (p) => /\.(html|js|mjs|css|py|json|md|toml|yml|yaml|txt|xml)$/i.test(p) || /^_headers$|^_routes\.json$/.test(p);
const lineOf = (src, idx) => src.slice(0, idx).split("\n").length;
const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

const pageFiles = files.filter((f) => /\.html$/.test(f.path) && !/^(tests|docs|runner|node_modules)\//.test(f.path));
const pages = [], deps = {}, classCount = {}, ctas = [], seenCta = new Set();
for (const f of pageFiles) {
  const h = text(f.path), route = "/" + f.path.replace(/(^|\/)index\.html$/, "$1").replace(/\.html$/, "");
  pages.push({ path: f.path, route, title: clip((/<title>([^<]*)<\/title>/i.exec(h) || [])[1], 90), h1: clip(((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(h) || [])[1] || "").replace(/<[^>]+>/g, ""), 90), noindex: /noindex/i.test((/<meta[^>]+robots[^>]+>/i.exec(h) || [""])[0]) });
  for (const m of h.matchAll(/(?:src|href)=["']([^"'#?]+\.(?:js|css))(?:\?[^"']*)?["']/g)) { const a = m[1].replace(/^(\.\.\/|\.\/)+/, "").replace(/^\//, ""); (deps[a] = deps[a] || []).push(route); }
  const cls = new Set(); for (const m of h.matchAll(/class=["']([^"']+)["']/g)) m[1].split(/\s+/).forEach((c) => { if (/^[a-z][\w-]{2,40}$/.test(c)) cls.add(c); });
  cls.forEach((c) => { classCount[c] = (classCount[c] || 0) + 1; });
  for (const m of h.matchAll(/<a\b([^>]*)>([\s\S]{0,200}?)<\/a>/gi)) {
    const attrs = m[1], href = (/href=["']([^"']+)["']/.exec(attrs) || [])[1] || "", t = clip(m[2].replace(/<[^>]+>/g, " "), 60);
    if (!/wa\.me|whatsapp|tel:|mailto:|calendly|contact|start|book|audit/i.test(href + " " + attrs) && !/\bbtn\b/.test(attrs)) continue;
    const k = href + "|" + t; if (seenCta.has(k) || ctas.length > 220) continue; seenCta.add(k); ctas.push({ file: f.path, line: lineOf(h, m.index), text: t, href: clip(href, 140) });
  }
}
Object.keys(deps).forEach((k) => { deps[k] = [...new Set(deps[k])]; });
const components = Object.fromEntries(Object.entries(classCount).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 120));

const apiRoute = (p) => "/api/" + p.replace(/^functions\/api\//, "").replace(/\.js$/, "").replace(/\[\[[^\]]+\]\]/g, "*").replace(/\[([^\]]+)\]/g, ":$1").replace(/(^|\/)index$/, "");
const apis = files.filter((f) => /^functions\/api\/.+\.js$/.test(f.path)).map((f) => { const s = text(f.path); return { path: f.path, route: apiRoute(f.path), methods: [...new Set([...s.matchAll(/(?:method|m)\s*===\s*"(GET|POST|PUT|PATCH|DELETE)"/g)].map((x) => x[1]))], doc: clip((/\/\*([\s\S]{0,400}?)\*\//.exec(s) || [])[1], 220) }; });

const code = files.filter((f) => /\.(js|mjs)$/.test(f.path) && /^(functions|js|runner\/src|scripts)\//.test(f.path));
const tables = [], envNames = new Set(), symbols = [];
for (const f of code) {
  const s = text(f.path);
  for (const m of s.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(([^)]{0,600})/g)) tables.push({ name: m[1], file: f.path, line: lineOf(s, m.index), columns: m[2].split(",").map((c) => c.trim().split(/\s+/)[0]).filter((c) => /^\w+$/.test(c) && !/^(PRIMARY|UNIQUE|FOREIGN|CHECK)$/i.test(c)).slice(0, 40) });
  if (/^(functions|runner)\//.test(f.path)) for (const m of s.matchAll(/\benv\.([A-Z][A-Z0-9_]{2,})/g)) envNames.add(m[1]);
  for (const m of s.matchAll(/export\s+(?:async\s+)?function\s+(\w+)|export\s+const\s+(\w+)\s*=|^\s*VIEWS\.(\w+)\s*=/gm)) { if (symbols.length < 900) symbols.push({ name: m[1] || m[2] || "view:" + m[3], kind: m[3] ? "view" : "export", file: f.path, line: lineOf(s, m.index) }); }
}
const tokens = {};
for (const p of ["css/styles.css", "css/theme-glass.css", "css/owner-brain.css"]) { const s = text(p), m = /:root\s*\{([^}]*)\}/.exec(s); if (m) for (const d of m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) if (!tokens[d[1]]) tokens[d[1]] = clip(d[2], 80); }
const fonts = [...new Set([...text("css/styles.css").matchAll(/font-family\s*:\s*([^;]+);/g)].map((m) => clip(m[1], 80)))].slice(0, 6);

const map = { project: "FODO", sha: process.env.GITHUB_SHA || process.env.SHA || null, at: new Date().toISOString(), hosting: "Cloudflare Pages + Functions + D1 (XRAY_DB) + KV (CHAT_KV) + Workers AI",
  generator: "scripts/build_pages.py", files: files.length, textFiles: files.filter((f) => isText(f.path)).length,
  pages, apis, tables, env: [...envNames].sort(), tokens, fonts, components, deps, symbols, ctas,
  js: files.filter((f) => /^js\/.+\.js$/.test(f.path)).map((f) => f.path), css: files.filter((f) => /\.css$/.test(f.path) && !/^tests\//.test(f.path)).map((f) => f.path),
  libs: files.filter((f) => /^functions\/_lib\//.test(f.path)).map((f) => f.path), workflows: files.filter((f) => /^\.github\/workflows\//.test(f.path)).map((f) => f.path),
  admin: { ui: "js/admin.js", api: "functions/api/admin/[[path]].js" }, growthLab: pages.filter((p) => /^\/(growth-lab|plans|account|business-x-ray)/.test(p.route)).map((p) => p.route),
  brain: files.filter((f) => /^(functions\/_lib\/brain|functions\/api\/owner-brain|js\/owner-brain)/.test(f.path)).map((f) => f.path) };

const out = JSON.stringify(map);
if (process.argv.includes("--print")) { console.log(JSON.stringify({ files: map.files, pages: pages.length, apis: apis.length, tables: tables.length, env: map.env.length, tokens: Object.keys(tokens).length, components: Object.keys(components).length, symbols: symbols.length, ctas: ctas.length, bytes: out.length })); process.exit(0); }
const SITE = process.env.SITE || "https://www.fodo.co.in", KEY = process.env.KEY;
if (!KEY) { console.log("FODO_CRON_KEY is not set — index built (" + out.length + " bytes) but not sent."); process.exit(0); }
const r = await fetch(SITE + "/api/owner-brain/eng/index", { method: "POST", headers: { "content-type": "application/json", "x-cron-key": KEY }, body: out });
console.log("index → Brain:", r.status, (await r.text()).slice(0, 200));
