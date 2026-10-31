/* Static performance audit (v34): for every built page, the bytes the browser must fetch from our own origin before the
   page works: HTML + render-blocking CSS + JS (incl. ES-module imports) + images in the HTML. Raw and gzip sizes.
   Field metrics (LCP/CLS/INP/TTFB) need real users: Growth Lab's PageSpeed/CrUX tools measure the live site.
   Usage: node tests/perf-audit.mjs [--save docs/perf-<name>.json] [--compare docs/perf-<old>.json] */
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), ".."), SKIP = /^(node_modules|tests|functions|scripts|docs|\.wrangler|\.git|sites)$/;
const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const pages = []; (function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (SKIP.test(f)) continue; if (statSync(p).isDirectory()) walk(p); else if (f === "index.html" || (d === ROOT && f === "404.html")) pages.push(p); } })(ROOT);
const cache = {}; function size(f) { if (cache[f]) return cache[f]; if (!existsSync(f) || statSync(f).isDirectory()) return (cache[f] = { raw: 0, gz: 0, src: "" }); const b = readFileSync(f); return (cache[f] = { raw: b.length, gz: gzipSync(b).length, src: /\.(js|css|html)$/.test(f) ? b.toString("utf8") : "" }); }
function local(u, from) { if (!u || /^(https?:|data:|\/\/|#|mailto:|tel:)/.test(u)) return null; u = u.split(/[?#]/)[0]; return u.startsWith("/") ? join(ROOT, u) : join(dirname(from), u); }
function modules(f, seen) { const s = size(f).src; (s.match(/(?:^|[;\s])import\s[^'"]*?["']([^"']+)["']|from\s+["']([^"']+)["']/g) || []).forEach((m) => { const u = /["']([^"']+)["']/.exec(m)[1], p = local(u, f); if (p && !seen.has(p)) { seen.add(p); modules(p, seen); } }); return seen; }
const rows = pages.map((p) => { const h = size(p).src, route = "/" + relative(ROOT, dirname(p)).replace(/\\/g, "/") + (p.endsWith("404.html") ? "404" : "/");
  const css = new Set(), js = new Set(), img = new Set();
  (h.match(/<link[^>]+rel="stylesheet"[^>]*>/g) || []).forEach((t) => { const p2 = local((/href="([^"]+)"/.exec(t) || [])[1], p); if (p2) css.add(p2); });
  (h.match(/<script[^>]+src="[^"]+"[^>]*>/g) || []).forEach((t) => { const p2 = local((/src="([^"]+)"/.exec(t) || [])[1], p); if (p2) { js.add(p2); if (/type="module"/.test(t)) modules(p2, js); } });
  (h.match(/<img[^>]+src="[^"]+"/g) || []).forEach((t) => { const p2 = local(/src="([^"]+)"/.exec(t)[1], p); if (p2) img.add(p2); });
  const sum = (S, k) => [...S].reduce((a, f) => a + size(f)[k], 0);
  return { route: route.replace(/\/\/$/, "/"), html: size(p).gz, css: sum(css, "gz"), js: sum(js, "gz"), jsRaw: sum(js, "raw"), img: sum(img, "raw"), requests: 1 + css.size + js.size + img.size }; });
const kb = (n) => (n / 1024).toFixed(1);
const total = (r) => r.html + r.css + r.js + r.img;
rows.sort((a, b) => total(b) - total(a));
console.log("Static performance audit, " + rows.length + " pages (gzip KB; images raw)\n");
console.log("| Page | HTML | CSS | JS | Images | Requests |\n|---|---:|---:|---:|---:|---:|");
rows.slice(0, 15).forEach((r) => console.log("| " + r.route + " | " + kb(r.html) + " | " + kb(r.css) + " | " + kb(r.js) + " | " + kb(r.img) + " | " + r.requests + " |"));
const med = (k) => { const v = rows.map((r) => r[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
console.log("\nMedian page: HTML " + kb(med("html")) + " KB · CSS " + kb(med("css")) + " KB · JS " + kb(med("js")) + " KB · " + med("requests") + " requests");
const big = Object.keys(cache).filter((f) => /\.(js|css)$/.test(f)).map((f) => [relative(ROOT, f), cache[f].gz]).sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log("\nLargest JS/CSS files (gzip KB): " + big.map((b) => b[0] + " " + kb(b[1])).join(" · "));
const save = arg("--save"); if (save) writeFileSync(join(ROOT, save), JSON.stringify({ at: new Date().toISOString(), rows }, null, 0));
const cmp = arg("--compare"); if (cmp && existsSync(join(ROOT, cmp))) { const old = JSON.parse(readFileSync(join(ROOT, cmp), "utf8")).rows, by = {}; old.forEach((r) => { by[r.route] = r; });
  let worse = 0; console.log("\nCompared with " + cmp + ":"); rows.forEach((r) => { const o = by[r.route]; if (!o) return; const d = total(r) - total(o); if (d > 4096) { worse++; console.log("  heavier  " + r.route + " +" + kb(d) + " KB"); } else if (d < -4096) console.log("  lighter  " + r.route + " " + kb(d) + " KB"); });
  console.log(worse ? worse + " page(s) got more than 4 KB heavier" : "no page got more than 4 KB heavier"); }
