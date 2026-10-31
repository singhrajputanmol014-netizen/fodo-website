// v27 FODO BRAIN: Website Engineer: owner-only access, project index, find, plan, build + security review, guarded/hard paths,
// PR + QA reports + automatic repair, deploy gate, screenshots, rollback, global replace, inspect, auto-deploy, no secret leaks.
// Run: node --no-warnings tests/v27-engineer.test.mjs

import { DatabaseSync } from "node:sqlite";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as admin } from "../functions/api/admin/[[path]].js";
import { onRequest as xray } from "../functions/api/xray/[[path]].js";
import { onRequest as brain } from "../functions/api/owner-brain/[[path]].js";
import { onRequest as tick } from "../functions/api/monitor/tick.js";
import { PLANS } from "../functions/_lib/plans.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
console.log = ((orig) => (...a) => { if (typeof a[0] === "string" && a[0].charAt(0) === "{" && !process.env.DBG) return; orig(...a); })(console.log);
console.error = () => {};
function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, a = []) => ({ bind: (...x) => st(sql, x.map((v) => v === undefined ? null : v)), run: async () => { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }), _x: () => db.prepare(sql).run(...a) });
  return { db, prepare: (s) => st(s), batch: async (l) => l.map((s) => (s._x(), { success: true })) };
}
const SITE = "https://www.fodo.co.in", jars = {}, H = { account, admin, xray, "owner-brain": brain };
const call = async (path, body, o = {}) => {
  const who = o.as || "a", h = Object.keys(H).filter((k) => path.indexOf(k + "/") === 0)[0] || "account", p = h === "account" ? path : path.slice(h.length + 1);
  const method = o.method || (body !== undefined ? "POST" : "GET");
  const req = new Request(SITE + "/api/" + h + "/" + p, { method, headers: Object.assign({ origin: SITE, "cf-connecting-ip": "9.9.9.9" }, body !== undefined ? { "content-type": "application/json" } : {}, jars[who] ? { cookie: jars[who] } : {}, o.headers || {}), body: body === undefined ? undefined : JSON.stringify(body) });
  const r = await H[h]({ request: req, env, params: { path: p.split("?")[0].split("/") } }); const sc = r.headers.get("set-cookie"); if (sc && h === "account") jars[who] = sc.split(";")[0];
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} all.push(t); return { status: r.status, j, t };
};
const all = [];   // every response body, checked for leaked secrets at the end
const login = (email, plan, who) => call("test-login", Object.assign({ email }, plan ? { plan } : {}), { as: who });
const B = (p, body, who, o) => call("owner-brain/" + p, body, Object.assign({ as: who || "own" }, o || {}));
const ask = (message, threadId, who, extra) => B("chat", Object.assign({ message, threadId }, extra || {}), who);

import { securityReview, unifiedDiff } from "../functions/_lib/brain/engineer.js";
import { execute } from "../functions/_lib/brain/tools.js";
const J = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json" } });
const gh = { calls: [], commits: 0, files: {
  "index.html": "<html><head><title>FODO: Digital growth</title></head><body><h1>Grow faster with FODO</h1><a class=\"btn\" href=\"https://wa.me/917827007676\">WhatsApp FODO</a><script src=\"js/main.js\"></script></body></html>",
  "scripts/build_pages.py": "HERO = 'Grow faster with FODO'\nWA = 'https://wa.me/917827007676'\n",
  "css/styles.css": ":root{--acc:#7B61FF;--bg:#07070c}\n.btn{color:var(--acc)}\n", "js/main.js": "console.log('x')\n",
  "functions/_lib/brain/tools.js": "export const TOOLS = {};\n", ".github/workflows/fodo-qa.yml": "name: x\n", "services/index.html": "<h1>Services</h1><a href=\"https://wa.me/917827007676\">Chat</a>" }, old: {} };
gh.old["index.html"] = gh.files["index.html"];
let aiMode = "", dispatched = null;
globalThis.fetch = async (u, o = {}) => { u = String(u); const m = (o.method || "GET").toUpperCase();
  if (/api\.github\.com/.test(u)) {
    const p = u.replace("https://api.github.com", ""); gh.calls.push(m + " " + p);
    if (/^\/repos\/[^/]+\/[^/]+$/.test(p)) return J({ full_name: "fodo/site", private: true, default_branch: "main", permissions: { push: true } });
    if (/git\/trees\/main/.test(p)) return J({ tree: Object.keys(gh.files).map((k) => ({ path: k, type: "blob", size: gh.files[k].length })) });
    if (/\/contents\//.test(p)) { const path = decodeURIComponent(p.split("/contents/")[1].split("?")[0]), ref = (/ref=([^&]+)/.exec(p) || [])[1]; const t = ref === "p0" ? gh.old[path] : gh.files[path]; return t != null ? J({ type: "file", size: t.length, sha: "s", content: Buffer.from(t).toString("base64") }) : J({ message: "Not Found" }, 404); }
    if (/^\/search\/code/.test(p)) { const q = decodeURIComponent(/q=([^&]+)/.exec(p)[1]).replace(/ repo:.*/, "").replace(/"/g, ""); const items = Object.keys(gh.files).filter((k) => gh.files[k].indexOf(q) > -1 || /whatsapp/i.test(q) && /wa\.me/.test(gh.files[k])).map((k) => ({ path: k, text_matches: [{ fragment: "…" + q + "…" }] })); return J({ items }); }
    if (/git\/ref\/heads\/main/.test(p)) return J({ object: { sha: "head1" } });
    if (/git\/ref\/heads\/brain/.test(p)) return J({ object: { sha: "c" + gh.commits } });
    if (/git\/commits\/[a-z0-9]+$/.test(p) && m === "GET") return J({ tree: { sha: "tree1" } });
    if (/git\/blobs$/.test(p) && m === "POST") return J({ sha: "blob" });
    if (/git\/trees$/.test(p) && m === "POST") { gh.tree = JSON.parse(o.body); return J({ sha: "tree2" }); }
    if (/git\/commits$/.test(p) && m === "POST") { gh.commits++; return J({ sha: "c" + gh.commits }); }
    if (/git\/refs$/.test(p) && m === "POST") { gh.branch = JSON.parse(o.body).ref; return J({}); }
    if (/git\/refs\/heads\/brain/.test(p) && m === "PATCH") { gh.patched = JSON.parse(o.body).sha; return J({}); }
    if (/\/pulls$/.test(p) && m === "POST") { gh.prBody = JSON.parse(o.body).body; return J({ number: 7, html_url: "https://github.com/fodo/site/pull/7" }); }
    if (/pulls\/7\/merge/.test(p) && m === "PUT") { gh.merged = (gh.merged || 0) + 1; return J({ merged: true, sha: "m" + gh.merged }); }
    if (/^\/repos\/[^/]+\/[^/]+\/commits\/m\d+$/.test(p)) return J({ parents: [{ sha: "p0" }], files: [{ filename: "index.html", status: "modified" }, { filename: "landing/new.html", status: "added" }] });
    if (/\/commits\?/.test(p)) return J([{ sha: "m1", commit: { message: "Homepage headline (#7)", author: { date: "2026-10-31T10:00:00Z", name: "FODO Brain" } } }]);
    if (/actions\/workflows\/fodo-engineer\.yml\/dispatches/.test(p) && m === "POST") { dispatched = JSON.parse(o.body); return new Response(null, { status: 204 }); }
    if (/git\/refs\/heads/.test(p) && m === "DELETE") return new Response(null, { status: 204 });
    return J({ message: "unmocked " + p }, 404);
  }
  return new Response("not mocked " + u, { status: 599 });
};
/* Workers AI stand-in: answers by which Engineer step is asking */
const AI = { run: async (model, x) => { const sys = x.messages[0].content, user = x.messages[x.messages.length - 1].content;
  if (/"understanding"/.test(sys)) {
    if (/core brain/i.test(user)) return { response: JSON.stringify({ title: "Brain: new tool", understanding: "Add a tool to the Brain", files: [{ path: "functions/_lib/brain/tools.js", action: "edit", why: "tool list" }], risk: "high" }) };
    if (/workflow/i.test(user)) return { response: JSON.stringify({ title: "Change CI", understanding: "x", files: [{ path: ".github/workflows/fodo-qa.yml", action: "edit", why: "x" }] }) };
    return { response: JSON.stringify({ title: "Homepage headline", understanding: "Change the homepage headline to Become unmissable online.", agents: ["frontend", "seo"], files: [{ path: "index.html", action: "edit", why: "the page" }, { path: "scripts/build_pages.py", action: "edit", why: "generator" }, { path: "../etc/passwd", action: "edit", why: "x" }, { path: "ghost.html", action: "edit", why: "does not exist" }], components: ["Hero"], risk: "low" }) }; }
  if (/smallest correct, complete change/.test(sys)) {
    if (/functions\/_lib\/brain\/tools\.js/.test(user)) return { response: JSON.stringify({ title: "Brain tool", summary: "s", edits: [{ path: "functions/_lib/brain/tools.js", find: "export const TOOLS = {};", replace: "export const TOOLS = { ping: 1 };" }] }) };
    const secret = aiMode === "secret" ? " AIzaSyDUMMYdummyDUMMYdummyDUMMYdummy1234" : "";
    return { response: JSON.stringify({ title: "Homepage headline", summary: "New hero headline on the homepage and in the generator.", edits: [{ path: "index.html", find: "<h1>Grow faster with FODO</h1>", replace: "<h1>Become unmissable online" + secret + "</h1>" }, { path: "scripts/build_pages.py", find: "HERO = 'Grow faster with FODO'", replace: "HERO = 'Become unmissable online'" }], routes: ["/"], test: "Open the preview homepage" }) }; }
  if (/QA_AGENT/.test(sys)) return { response: JSON.stringify({ summary: "fixed the missing closing tag", edits: [{ path: "index.html", find: "<h1>Grow faster with FODO</h1>", replace: "<h1>Grow faster with FODO</h1><!-- fixed -->" }] }) };
  return { response: "ok" }; } };
const KV = new Map(), CHAT_KV = { get: async (k, t) => { const v = KV.get(k); if (v == null) return null; return t === "arrayBuffer" ? (v.buffer || v) : typeof v === "string" ? v : Buffer.from(v).toString(); }, put: async (k, v) => { KV.set(k, v); }, delete: async (k) => KV.delete(k) };
const env = { XRAY_DB: d1(), CHAT_KV, AI, ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", GITHUB_TOKEN: "ghp_SECRETgithubTOKEN1234567890abcdefXYZ", CRON_KEY: "cron_SECRET_key_1234567890", PAGES_PROJECT: "fodo-website", RESEND_API_KEY: "re_SECRETresendKEY12345" };
await login("anmol@fodo.co.in", null, "own"); await login("ravi@shop.in", "starter", "cust"); await login("team@acme.in", "starter", "team");
const QA = (body, key) => call("owner-brain/eng/qa", body, { as: "nobody", headers: key === false ? {} : { "x-cron-key": key || env.CRON_KEY } });
const confirm = async (r) => { const a = r.j.action; return await B("confirm", { actionId: a.id, token: a.token, decision: "run" }); };

/* access */
await B("members", { email: "team@acme.in", role: "full" });
let r = await B("eng/overview", undefined, "team"); ok(r.status === 403, "a FULL team member still can't open Website Engineer (owner-only)");
r = await B("eng/plan", { request: "x" }, "cust"); ok(r.status === 403, "customers can't use it");
r = await call("owner-brain/eng/overview", undefined, { as: "nobody" }); ok(r.status === 403, "logged out → 403");
r = await QA({ branch: "x" }, false); ok(r.status === 403, "QA reports need the cron key");
r = await QA({ branch: "x" }, "wrong_key_wrong_key_123"); ok(r.status === 403, "…the right one");
const memberCtx = { env, request: new Request(SITE + "/"), owner: { email: "team@acme.in" }, who: { email: "team@acme.in", owner: false, perms: ["chat", "changes", "deploy", "business"] }, settings: {} };
r = await execute(memberCtx, "eng_plan", { request: "change the homepage" }); ok(!r.ok && r.refused, "Engineer chat tools refuse non-owners even with 'changes' + 'deploy' access");

/* index + map + find */
r = await call("owner-brain/eng/index", { sha: "abc1234", files: 9, pages: [{ path: "index.html", route: "/", title: "FODO: Digital growth" }, { path: "services/index.html", route: "/services/", title: "Services" }], apis: [{ path: "functions/api/xray/[[path]].js", route: "/api/xray/*" }], tables: [{ name: "acct_users", file: "functions/_lib/accounts.js", line: 40, columns: ["id", "email"] }], env: ["GITHUB_TOKEN", "GEMINI_API_KEY"], tokens: { "--acc": "#7B61FF" }, components: { btn: 40 }, deps: { "css/styles.css": ["/", "/services/", "/about/"], "index.html": ["/"] }, symbols: [{ name: "settleOrder", kind: "export", file: "functions/_lib/accounts.js", line: 307 }], ctas: [{ file: "index.html", line: 1, text: "WhatsApp FODO", href: "https://wa.me/917827007676" }] }, { as: "nobody", headers: { "x-cron-key": env.CRON_KEY } });
ok(r.j.ok && r.j.saved, "GitHub Actions index → saved for the commit");
r = await B("eng/map"); const envRow = (n) => r.j.map.env.find((e) => e.name === n);
ok(r.j.map.sha === "abc1234" && envRow("GITHUB_TOKEN").exists === true && envRow("GEMINI_API_KEY").exists === false && !r.t.includes(env.GITHUB_TOKEN), "project map: env NAMES with exists ✓/✗, never values");
r = await B("eng/find?q=" + encodeURIComponent("where is the WhatsApp CTA"));
ok(r.j.ok && r.j.results.some((x) => x.path === "index.html" && /CTA/.test(x.why)) && r.j.results.some((x) => x.why === "code"), "Find anything: exact files + lines (code search + CTA index)");
r = await B("eng/find?q=settleOrder"); ok(r.j.results.some((x) => x.path === "functions/_lib/accounts.js" && x.line === 307), "…finds functions with their line");

/* plan → build → diff */
r = await B("eng/plan", { request: "Change the homepage headline to Become unmissable online" }); const P = r.j;
ok(P.ok && P.files.map((f) => f.path).join() === "index.html,scripts/build_pages.py" && P.klass === "normal", "plan: real files only (made-up and ../ paths dropped), page + generator");
ok(P.components[0] === "Hero" && P.rollback && /pull request/.test(P.rollback) && P.risk === "low", "plan shows components, risk and rollback");
r = await B("eng/build/" + P.changeId, {}); const Bd = r.j;
ok(Bd.ok && /- <html>.*Grow faster/s.test(Bd.diff) && /\+ .*Become unmissable online/.test(Bd.diff) && Bd.security.ok && Bd.routes[0] === "/", "build: exact edits applied → line diff, security check passed, routes to screenshot");
const row = () => env.XRAY_DB.db.prepare("SELECT * FROM brain_changes WHERE id=?").get(P.changeId);
ok(row().status === "proposed" && JSON.parse(row().edits)[0].after.indexOf("Become unmissable") > -1 && gh.calls.filter((c) => /^POST|^PUT|^PATCH/.test(c)).length === 0, "nothing written to GitHub before the owner opens the preview");

/* security: a secret in the AI's code is refused */
aiMode = "secret"; r = await B("eng/plan", { request: "Change the homepage headline" }); r = await B("eng/build/" + r.j.changeId, {}); aiMode = "";
ok(!r.j.ok && /Security check refused/.test(r.j.reason) && /secret/.test(r.j.reason), "a diff containing an API key is refused");
const sec = securityReview(env, [{ path: "functions/_lib/x.js", before: "", after: "await db.prepare('DROP TABLE acct_users').run()" }, { path: "js/a.js", before: "", after: "el.innerHTML = '<b>' + name + '</b>';" }, { path: "functions/api/new.js", before: null, after: "export async function onRequest(){ return new Response('x') }" }, { path: "functions/_lib/y.js", before: "", after: "const k = '" + env.GITHUB_TOKEN + "'" }]);
ok(!sec.ok && sec.block.some((b) => /destructive SQL/.test(b)) && sec.block.some((b) => /GITHUB_TOKEN/.test(b)) && sec.warn.some((w) => /innerHTML/.test(w)) && sec.warn.some((w) => /without a visible auth check/.test(w)), "security reviewer: destructive SQL + env values blocked; unescaped innerHTML + unauthenticated API flagged");
ok(/\(line 2\)/.test(unifiedDiff("a.txt", "a\nb\nc", "a\nB\nc")) && /- b\n\+ B/.test(unifiedDiff("a.txt", "a\nb\nc", "a\nB\nc")), "diff viewer: exact line + −/+");

/* core (guarded) and protected (hard) paths */
r = await B("eng/plan", { request: "core brain: add a ping tool" }); const G = r.j;
ok(G.klass === "guarded" && G.risk === "high", "a change to the Brain itself is a core (guarded) change");
r = await B("eng/build/" + G.changeId, {}); ok(!r.j.ok && r.j.needPhrase && /CONFIRM PRODUCTION CHANGE/.test(r.j.reason), "…needs the typed phrase");
r = await B("eng/build/" + G.changeId, { phrase: "CONFIRM PRODUCTION CHANGE" }); ok(r.j.ok && r.j.klass === "guarded", "…and builds with it");
r = await B("eng/plan", { request: "edit the CI workflow" }); ok(r.j.blocked && /never changed from the Brain/.test(r.j.blocked), ".github (the QA gate) is never editable");
r = await B("eng/build/" + r.j.changeId, {}); ok(!r.j.ok, "…not even with a build call");

/* preview PR → QA fail → automatic repair → QA pass → deploy */
r = await B("changes/" + P.changeId + "/open", {}); ok(r.j.pending && r.j.action.level === 2, "Open preview = level-2 confirmation");
r = await confirm(r); ok(r.j.ok && row().status === "pr_open" && row().head_sha === "c1" && row().qa_status === "waiting" && /fodo-routes: \//.test(gh.prBody), "PR opened on a brain/ branch; QA waiting; PR tells QA which pages to screenshot");
const branch = row().branch; ok(/^brain\//.test(branch), "branch is brain/…");
r = await B("changes/" + P.changeId + "/merge", {}); ok(r.j.pending, "deploy asks for confirmation…");
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64");
r = await QA({ branch, sha: "c1", status: "failed", url: "https://brain-x.fodo-website.pages.dev", checks: [{ name: "JavaScript syntax", ok: true }, { name: "No horizontal overflow /", ok: false, detail: "wider at 320px", file: "index.html" }], shots: [{ bp: 375, kind: "after", route: "/", b64: JPG }, { bp: 375, kind: "before", route: "/", b64: JPG }], issues: ["/: 2 images without alt"] });
ok(r.j.ok && r.j.status === "failed" && r.j.next === "repairing", "QA failure → the Brain repairs it automatically");
ok(row().attempts === 1 && row().head_sha === "c2" && gh.patched === "c2" && row().qa_status === "waiting" && /Repair 1\/3/.test(row().note), "repair = one more commit on the same branch (attempt 1/3), QA runs again");
r = await QA({ branch, sha: "c1", status: "passed", checks: [{ name: "x", ok: true }] }); ok(r.j.ignored === "stale commit", "a report for an old commit is ignored");
r = await B("changes/" + P.changeId + "/merge", {}); const mergeCard = r;
await QA({ branch, sha: "c2", status: "failed", checks: [{ name: "No JavaScript errors /", ok: false, detail: "x is not defined" }] });
r = await confirm(mergeCard); ok(!r.j.ok && /QA (failed|is still running)/.test(r.j.error || r.j.reason) && row().attempts === 2, "deploy is blocked while QA has failed / is re-running after repair 2");
r = await QA({ branch, sha: row().head_sha, status: "passed", url: "https://brain-x.fodo-website.pages.dev", checks: [{ name: "JavaScript syntax", ok: true }, { name: "No horizontal overflow /", ok: true }], shots: [{ bp: 1280, kind: "after", route: "/", b64: JPG }] });
ok(r.j.status === "passed" && row().qa_status === "passed", "QA passed on the repaired commit");
r = await B("eng/change/" + P.changeId); const shotId = r.j.change.qa.shots[0].id;
ok(r.j.change.plan.diff && r.j.change.qa.checks.length === 2 && r.j.change.qa.shots.length === 1 && !("edits" in r.j.change), "change detail: plan, diff, QA checks, screenshots (no raw file bodies)");
r = await B("eng/shot/" + shotId); ok(r.status === 200 && r.t.length > 0, "screenshots are served to the owner");
r = await B("eng/shot/" + shotId, undefined, "team"); ok(r.status === 403, "…and only to the owner");
r = await B("changes/" + P.changeId + "/merge", {}); r = await confirm(r);
ok(r.j.ok && row().status === "merged" && row().merged_sha === "m1" && row().approved_by === "anmol@fodo.co.in", "deployed after approval; merge commit + approver recorded");

/* rollback */
r = await B("eng/rollback/" + P.changeId, {}); ok(r.j.pending && r.j.action.level === 4 && /ROLL BACK/.test(r.j.action.preview), "rollback = level-4 confirmation");
r = await confirm(r); ok(r.j.ok && r.j.result.rolledBack === P.changeId, "rolled back");
ok(row().status === "rolled_back" && gh.tree.tree.some((t) => t.path === "index.html") && gh.tree.tree.some((t) => t.path === "landing/new.html" && t.sha === null), "rollback restores every file it changed and deletes the files it created");

/* global replace */
r = await B("eng/replace", { find: "https://wa.me/917827007676", replace: "https://wa.me/919999999999" });
ok(r.j.ok && r.j.found === 3 && r.j.files === 3 && r.j.kinds.pages === 2 && r.j.kinds.generator === 1, "change everywhere: counts every location first (3 in 2 pages + generator)");
gh.files["functions/_lib/brain/tools.js"] += "// https://wa.me/917827007676\n";
r = await B("eng/replace", { find: "https://wa.me/917827007676", replace: "x" }); ok(r.j.skipped.indexOf("functions/_lib/brain/tools.js") > -1, "…core files are skipped without the phrase");

/* inspect */
r = await B("eng/inspect", { path: "/services/" }); const ins = r.j.changeId;
ok(r.j.ok && dispatched && dispatched.inputs.mode === "inspect" && dispatched.inputs.url === "https://www.fodo.co.in/services/" && dispatched.inputs.change === ins, "Inspect starts the GitHub Actions browser run");
r = await QA({ change: ins, status: "failed", url: "https://www.fodo.co.in/services/", checks: [{ name: "No horizontal overflow /services/", ok: false, detail: "at 320px" }], shots: [{ bp: 375, kind: "after", route: "/services/", b64: JPG }] });
ok(r.j.ok && env.XRAY_DB.db.prepare("SELECT status FROM brain_changes WHERE id=?").get(ins).status === "inspected" && r.j.next === null, "inspection results stored (no repair for a live page)");
r = await B("eng/inspect", { path: "https://evil.test/" }); ok(!r.j.ok, "only FODO paths can be inspected");

/* auto-deploy (opt-in, low risk, QA passed, never core) */
await B("settings", { autoDeploy: "low" });
r = await B("eng/plan", { request: "Change the homepage headline again" }); const A2 = r.j.changeId; await B("eng/build/" + A2, {});
r = await B("changes/" + A2 + "/open", {}); await confirm(r);
const b2 = env.XRAY_DB.db.prepare("SELECT branch, head_sha FROM brain_changes WHERE id=?").get(A2);
r = await QA({ branch: b2.branch, sha: b2.head_sha, status: "passed", checks: [{ name: "x", ok: true }] });
ok(r.j.next === "auto-deployed" && env.XRAY_DB.db.prepare("SELECT status FROM brain_changes WHERE id=?").get(A2).status === "merged", "auto-deploy (when switched on): low-risk change goes live after QA passes");
await B("settings", { autoDeploy: "off" });

/* command center, real data only */
r = await B("eng/overview");
ok(r.j.ok && r.j.github.connected && r.j.database.ok && r.j.lastDeploy && r.j.lastQa && r.j.lastQa.status === "passed" && r.j.index.pages === 2, "command center: GitHub, database, last deploy, last QA, index, all real");
ok(r.j.audit === null && !r.j.score.parts.some((p) => /Performance|SEO/.test(p.name)), "no PageSpeed run yet → no performance/SEO number (never invented)");
ok(r.j.score.parts.some((p) => p.name === "Code health" && p.source === "Latest QA run"), "score parts name their source");
ok(!all.some((t) => t.includes(env.GITHUB_TOKEN) || t.includes(env.CRON_KEY) || t.includes(env.RESEND_API_KEY)), "no token or key in any response");

console.log("\nv27 engineer: " + pass + "/" + (pass + fail) + " passed");
process.exit(fail ? 1 : 0);
