// The no-JS plan copy in scripts/build_pages.py (LAB_PLANS / LAB_PACKS) must match functions/_lib/plans.js (what the server charges).
// Run: node tests/v13-plans.test.mjs
import { readFileSync } from "node:fs";
import { PLANS, PACKS, ORDER } from "../functions/_lib/plans.js";
const src = readFileSync(new URL("../scripts/build_pages.py", import.meta.url), "utf8");
const py = [...(/LAB_PLANS = \[(.*)\]/.exec(src)[1].matchAll(/\("(\w+)", "(\w+)", (\d+), (\d+), (\d+), (\d+)\)/g))].map((m) => [m[1], m[2], +m[3], +m[4], +m[5], +m[6]]);
const js = ORDER.map((id) => { const p = PLANS[id]; return [id, p.name, p.price, p.xrays, p.pages, p.competitors]; });
const packs = [...(/LAB_PACKS = \[(.*)\]/.exec(src)[1].matchAll(/\("([^"]+)", (\d+)\)/g))].map((m) => m[1] + ":" + m[2]).join();
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log((c ? "PASS " : "FAIL ") + m); };
ok(JSON.stringify(py) === JSON.stringify(js), "plans page HTML copy = server plans (" + py.map((x) => x[1] + " ₹" + x[2]).join(", ") + ")");
ok(packs === Object.values(PACKS).map((p) => p.name + ":" + p.price).join(), "packs copy = server packs");
const html = readFileSync(new URL("../plans/index.html", import.meta.url), "utf8");
ok(js.every((p) => html.indexOf("₹" + p[2].toLocaleString("en-US")) > -1), "built /plans/ page contains every price");
console.log(`\nv13 plans: ${2 + 1 - fail}/3 passed`); process.exit(fail ? 1 : 0);
