/* FODO static checks (v47.6), run by CI and by hand: `node scripts/check.mjs`.
   1. every .js / .mjs file under functions/, js/, scripts/, tests/ parses (node --check);
   2. no "worker" and no long dash in the marketplace modules and pages (FODO says "FODO Pro"), ignoring Cloudflare's own "Workers AI";
   4. no API key patterns in frontend code. Exit code 1 on any finding. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { spawnSync } from "node:child_process";
const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const walk = (dir, out = []) => { for (const n of readdirSync(dir)) { if (n === "node_modules" || n === ".wrangler" || n === ".git" || n === "data") continue; const p = join(dir, n); const st = statSync(p); if (st.isDirectory()) walk(p, out); else out.push(p); } return out; };
const files = walk(ROOT), rel = (p) => p.slice(ROOT.length + 1);
const findings = [];
for (const f of files.filter((x) => /\.(js|mjs|cjs)$/.test(x) && /^(functions|js|scripts|tests)\//.test(rel(x)))) { const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" }); if (r.status !== 0) findings.push(rel(f) + ": does not parse\n" + r.stderr.split("\n").slice(0, 3).join("\n")); }
const TEXT = files.filter((x) => /^(functions|js|css)\//.test(rel(x)) || (/\.html$/.test(x) && !/^(tests|templates|sites)\//.test(rel(x))));
const MARKET = /^(functions\/_lib\/(biz|quotes|teams|finance|proapps|mission|jobs|calendar|orgs|availability|production|projects2|payouts|catalog-seed)\.js|js\/ws-.*\.js|js\/workspace\.js|css\/workspace\.css|become-a-pro\/index\.html|fodo-pros\/index\.html)$/;
for (const f of TEXT) { const t = readFileSync(f, "utf8"), r = rel(f);
  if (MARKET.test(r)) { const clean = t.replace(/Workers AI|consumer Worker|workerd/g, ""); if (/\b[Ww]orkers?\b/.test(clean)) { const m = clean.match(/.{0,40}\b[Ww]orkers?\b.{0,40}/); findings.push(r + ': says "worker" (FODO says FODO Pro): ' + JSON.stringify(m && m[0])); }
    if (t.indexOf("\u2014") > -1) findings.push(r + ": contains a long dash"); }
  if (/^js\//.test(r) && /(sk|rk)_(live|test)_[A-Za-z0-9]{8,}|AIza[0-9A-Za-z_-]{30,}|re_[A-Za-z0-9]{20,}/.test(t)) findings.push(r + ": looks like an API key in frontend code"); }
if (findings.length) { console.log(findings.join("\n")); console.log("\n" + findings.length + " finding(s)."); process.exit(1); }
console.log("OK: " + files.length + " files checked, nothing found.");
