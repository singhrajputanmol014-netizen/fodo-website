// Business X-Ray server functions (functions/api/xray/[[path]].js + functions/_lib/xray-core.js) with fetch, KV, D1 and AI mocked.
// D1 is a real SQLite database (node:sqlite) behind a tiny D1-shaped wrapper. Run: node --no-warnings tests/xray-functions.test.mjs
import { DatabaseSync } from "node:sqlite";
import { onRequest, checkSynthesis } from "../functions/api/xray/[[path]].js";
import { safeUrl, normSearch, regDomain } from "../functions/_lib/xray-core.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const SECRET = "sk-test-SECRET-123";

/* ---------- mocks ---------- */
const kv = () => { const m = new Map(); return { m, get: async (k, t) => { const v = m.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; }, put: async (k, v) => { m.set(k, v); } }; };
function d1() {
  const db = new DatabaseSync(":memory:");
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), run: async () => { db.prepare(sql).run(...args); return { success: true }; }, first: async () => db.prepare(sql).get(...args) || null, all: async () => ({ results: db.prepare(sql).all(...args) }), _exec: () => db.prepare(sql).run(...args) });
  return { db, prepare: (sql) => stmt(sql), batch: async (list) => { list.forEach((s) => s._exec()); return list.map(() => ({ success: true })); } };
}
const req = (method, path, body, headers) => new Request("https://www.fodo.co.in/api/xray/" + path, { method, headers: Object.assign({ "content-type": "application/json", "cf-connecting-ip": "9.9.9.9" }, headers || {}), body: body == null ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
const call = async (env, method, path, body, headers) => { const r = await onRequest({ request: req(method, path, body, headers), env, params: { path: path.split("?")[0].split("/") } }); const text = await r.clone().text(); let j = null; try { j = JSON.parse(text); } catch (e) {} return { r, status: r.status, j, text, headers: r.headers }; };
let seen = [], leaks = [];
const mock = (handlers) => { globalThis.fetch = async (u, o = {}) => { u = String(u); seen.push({ u, o }); for (const [re, fn] of handlers) if (re.test(u)) return fn(u, o); return new Response("nope", { status: 500 }); }; };
const watch = (res) => { if (res.text.indexOf(SECRET) > -1) leaks.push(res.r.url || "?"); return res; };

/* ---------- 1. URL validation & SSRF ---------- */
const bad = ["", "localhost", "http://localhost:8080/", "http://127.0.0.1/", "http://10.0.0.5/", "http://192.168.1.1", "http://172.16.0.1", "http://169.254.169.254/latest/meta-data", "http://[::1]/", "http://[fd00::1]/", "http://[::ffff:127.0.0.1]/",
  "ftp://example.com", "file:///etc/passwd", "javascript:alert(1)", "http://user:pass@example.com", "http://example.com:22/", "http://metadata.google.internal/", "http://printer.local/", "http://8.8.8.8/", "http://intranet/", "x".repeat(3000)];
bad.forEach((u) => ok(!safeUrl(u).ok, "blocked: " + (u.length > 60 ? u.slice(0, 30) + "…" : u || "(empty)") + " → " + safeUrl(u).reason));
ok(safeUrl("spicehub.test").ok && safeUrl("spicehub.test").url === "https://spicehub.test/", "bare domain → https URL");
ok(safeUrl("https://www.example.co.in/path?q=1#x").url === "https://www.example.co.in/path?q=1", "fragment removed, path kept");
ok(regDomain("shop.example.co.in") === "example.co.in" && regDomain("www.example.com") === "example.com", "registrable domain (co.in aware)");

/* ---------- 2. search normalisation ---------- */
const sj = { searchParameters: { q: "dentist bengaluru" }, organic: [{ position: 1, title: "<b>Best</b> dentist", link: "https://a.test/", snippet: "Rated 4.5", rating: 4.5, ratingCount: 120 }, { position: 2, title: "Ask", link: "https://www.reddit.com/r/x/1", snippet: "need a dentist" }],
  peopleAlsoAsk: [{ question: "How much?", snippet: "Rs 500", link: "https://faq.test/" }], places: [{ title: "Clinic A", address: "MG Road", rating: 4.1, ratingCount: 40, cid: "77" }], relatedSearches: [{ query: "dentist near me" }] };
const n = normSearch("serper", sj, "dentist bengaluru");
ok(n.web.length === 2 && n.web[0].title === "Best dentist" && n.web[0].rating === 4.5 && n.web[0].ratingCount === 120, "Serper organic → web (HTML stripped, ratings kept)");
ok(n.discussions.length === 1 && n.discussions[0].forum === "reddit.com" && n.faq[0].question === "How much?" && n.locations[0].url === "https://www.google.com/maps?cid=77" && n.related[0] === "dentist near me", "Serper → discussions, People-Also-Ask, map pack, related");
ok(n.providerName === "Google Search (via Serper)" && /google\.com\/search\?q=dentist/.test(n.searchUrl), "source named and linkable");
const nb = normSearch("brave", { web: { results: [{ title: "T", url: "https://b.test/", description: "<strong>d</strong>" }] }, discussions: { results: [{ title: "Q", url: "https://reddit.com/x", data: { forum_name: "r/x", question: "q?" } }] } }, "q");
ok(nb.web[0].description === "d" && nb.discussions[0].forum === "r/x" && nb.providerName === "Brave Search", "Brave → same shape");

/* ---------- 3. AI output is checked against evidence ---------- */
const chk = checkSynthesis({ executiveSummary: "Summary.", doingWell: [{ text: "Fast site", evidence: ["E1"] }, { text: "Invented claim", evidence: ["E999"] }, { text: "No evidence", evidence: [] }], doFirst: ["O1", "O77", "E1", "O2"], whyProblem: { text: "x", evidence: ["E404"] } }, ["E1", "E2", "O1", "O2"]);
ok(chk.out.doingWell.length === 1 && chk.out.doingWell[0].text === "Fast site", "AI statements whose evidence IDs don't exist are removed");
ok(chk.dropped.length === 2 && chk.out.doFirst.join() === "O1,O2" && chk.out.whyProblem === null, "unknown opportunity IDs dropped; unsupported 'why' removed");

/* ---------- 4. job lifecycle on D1 ---------- */
const D = d1(), K = kv();
const env = { XRAY_DB: D, CHAT_KV: K, SERPER_API_KEY: SECRET, XRAY_PER_HOUR: "3", XRAY_PER_DAY: "50", SEARCH_DAILY_CAP: "100" };
let res = watch(await call(env, "GET", "health")); ok(res.j.providers.search === "serper" && res.j.providers.storage === "d1" && res.j.providers.ai === null, "health lists sources (search: serper, storage: d1, ai: off)");
for (const u of ["http://127.0.0.1/", "not a url", "ftp://x.com"]) { res = await call(env, "POST", "start", { url: u }); ok(res.status === 400 && res.j.reason, "start refuses " + u + " (" + res.j.reason + ")"); }
res = watch(await call(env, "POST", "start", { url: "spicehub.test", city: "Dwarka<script>", name: "Spice Hub" }));
ok(res.status === 200 && /^[a-z0-9]{20}$/.test(res.j.jobId) && res.j.status === "queued", "start → { jobId, status: queued }");
const id = res.j.jobId;
const row = D.db.prepare("SELECT * FROM xray_jobs WHERE id=?").get(id);
ok(row && row.domain === "spicehub.test" && JSON.parse(row.input).city === "Dwarka script", "job stored in D1 table xray_jobs (input cleaned)");
res = await call(env, "GET", "status/" + id); ok(res.j.status === "queued" && res.j.progress === 0 && res.j.currentStage === "DISCOVERY" && Array.isArray(res.j.completedModules), "status → queued, 0%, DISCOVERY");
res = await call(env, "POST", "progress", { jobId: id, stage: "CRAWLING", progress: 22, completedModules: ["DISCOVERY", "BOGUS"], allow: ["tandoortales.test", "https://evil.com/x", "not a domain"] });
res = await call(env, "GET", "status/" + id); ok(res.j.status === "running" && res.j.progress === 22 && res.j.currentStage === "CRAWLING" && res.j.completedModules.join() === "DISCOVERY", "progress is stored as reported (unknown stage names ignored)");
ok(JSON.parse(D.db.prepare("SELECT allow FROM xray_jobs WHERE id=?").get(id).allow).join() === "tandoortales.test,evil.com", "competitor allow-list keeps only domains");
res = await call(env, "GET", "status/zzzzzzzzzzzzzzzzzzzz"); ok(res.status === 404, "unknown job → 404");

/* ---------- 5. page fetch: domain fence, SSRF on redirects, retries ---------- */
mock([[/^https:\/\/spicehub\.test\/$/, () => new Response("<html><title>Spice Hub</title></html>", { headers: { "content-type": "text/html", "x-robots-tag": "noindex" } })],
  [/spicehub\.test\/hop/, () => new Response("", { status: 302, headers: { location: "http://169.254.169.254/latest" } })],
  [/spicehub\.test\/img\.png/, () => new Response("PNG", { headers: { "content-type": "image/png" } })],
  [/tandoortales\.test/, () => new Response("<title>T</title>", { headers: { "content-type": "text/html" } })]]);
res = await call(env, "POST", "fetch", { jobId: id, url: "https://spicehub.test/" });
let meta = JSON.parse(decodeURIComponent(res.headers.get("x-xray-meta")));
ok(res.status === 200 && res.text.indexOf("<title>Spice Hub") > -1 && meta.status === 200 && meta.headers["x-robots-tag"] === "noindex", "own page passed through with status + headers");
ok(seen[0].o.headers["user-agent"].indexOf("FODO-BusinessXRay") === 0 && seen[0].o.redirect === "manual", "crawler identifies itself and follows redirects itself");
res = await call(env, "POST", "fetch", { jobId: id, url: "https://spicehub.test/hop" }); meta = JSON.parse(decodeURIComponent(res.headers.get("x-xray-meta")));
ok(meta.status === 0 && /blocked/.test(meta.error) && meta.redirects[0].to.indexOf("169.254") > -1 && !seen.some((s) => /169\.254/.test(s.u)), "redirect to a private address is blocked before it is requested");
res = await call(env, "POST", "fetch", { jobId: id, url: "https://spicehub.test/img.png" }); meta = JSON.parse(decodeURIComponent(res.headers.get("x-xray-meta")));
ok(meta.skipped === "not a web page" && res.text === "", "non-HTML files are not downloaded");
res = await call(env, "POST", "fetch", { jobId: id, url: "https://evil.test/" }); ok(res.status === 403, "other domains are refused (" + res.j.reason + ")");
res = await call(env, "POST", "fetch", { jobId: id, url: "https://tandoortales.test/" }); ok(res.status === 200 && res.text.indexOf("<title>T") > -1, "allowed competitor can be read");
res = await call(env, "POST", "fetch", { jobId: id, url: "http://127.0.0.1/" }); ok(res.status === 400 && res.j.blocked, "private address refused at the door");

/* ---------- 6. search: key stays server-side, cache, failures ---------- */
let tries = 0;
mock([[/google\.serper\.dev\/search/, (u, o) => { tries++; ok(o.headers["x-api-key"] === SECRET && JSON.parse(o.body).gl === "in" && JSON.parse(o.body).q === "best restaurant dwarka", "Serper called server-side with key, country=in"); return new Response(JSON.stringify(sj)); }]]);
res = watch(await call(env, "POST", "search", { jobId: id, q: "best restaurant dwarka", country: "India" }));
ok(res.status === 200 && res.j.provider === "serper" && res.j.web.length === 2 && tries === 1, "search answer normalised");
tries = 0; mock([[/google\.serper\.dev/, () => { tries++; return new Response("{}", { status: 500 }); }]]);
let t0 = Date.now(); res = watch(await call(env, "POST", "search", { jobId: id, q: "restaurant dwarka", country: "India" }));
ok(res.status === 502 && tries === 3 && Date.now() - t0 >= 1400, `provider 500 → retried with backoff (${tries} tries, ${Date.now() - t0} ms) → 502 with a reason`);
mock([[/google\.serper\.dev/, () => new Response('{"message":"Unauthorized"}', { status: 403 })]]);
res = watch(await call(env, "POST", "search", { jobId: id, q: "restaurant menu", country: "" })); ok(res.status === 502 && /check the API key/.test(res.j.reason), "bad key → clear message, key not echoed");
res = await call(Object.assign({}, env, { SERPER_API_KEY: "" }), "POST", "search", { jobId: id, q: "x y" }); ok(res.status === 503 && res.j.disabled, "no search provider → 503 disabled (module becomes 'Data unavailable')");
res = await call(env, "POST", "seo", { jobId: id, keywords: ["a"] }); ok(res.status === 503 && res.j.disabled, "no SEO provider → 503 disabled (search volume never invented)");
res = await call(env, "POST", "ai", { jobId: id, mode: "synthesis", pack: {} }); ok(res.status === 503 && res.j.disabled, "no AI → 503 disabled (rules summary instead)");

/* ---------- 7. AI synthesis + sampled visibility (Workers AI mocked) ---------- */
const AI = { run: async (model, inp) => { const u = inp.messages[inp.messages.length - 1].content;
  if (/RESEARCH DATA/.test(u)) return { response: 'Here you go: {"executiveSummary":"Spice Hub is visible but leaks enquiries.","doingWell":[{"text":"Menu shows prices","evidence":["E3"]},{"text":"Has 10,000 reviews","evidence":["E99"]}],"holdingBack":[{"text":"Broken links","evidence":["E5"]}],"doFirst":["O1","O9"],"notPrioritize":[{"text":"Blog","why":"low impact"}],"unknowns":["traffic"]}' };
  return { response: "For " + u + " I would suggest Tandoor Tales (tandoortales.test) and Spice Hub." }; } };
const envAI = Object.assign({}, env, { AI });
res = await call(envAI, "POST", "ai", { jobId: id, mode: "synthesis", pack: { ids: ["E3", "E5", "O1"], data: { business: { name: "Spice Hub" } } } });
ok(res.j.ok && res.j.synthesis.doingWell.length === 1 && res.j.synthesis.doFirst.join() === "O1" && res.j.dropped.length === 1 && res.j.dropped[0].text === "Has 10,000 reviews", "AI summary kept only where evidence exists (made-up '10,000 reviews' dropped)");
res = await call(envAI, "POST", "ai", { jobId: id, mode: "visibility", pack: { questions: ["best restaurant in Dwarka"] } });
ok(res.j.ok && res.j.answers.length === 1 && /Tandoor Tales/.test(res.j.answers[0].answer), "sampled AI visibility: raw answers returned for brand/competitor matching");
res = await call(envAI, "POST", "ai", { jobId: id, mode: "synthesis", pack: { ids: [], data: { x: "y".repeat(70000) } } }); ok(res.status === 413, "oversized research pack refused");

/* ---------- 8. report + normalised rows ---------- */
const rep = JSON.stringify({ version: "xray-1", jobId: id, business: { name: { value: "Spice Hub" } }, scores: { overall: 70 } });
res = await call(env, "POST", "rows", { jobId: id, kind: "evidence", rows: [{ id: "E1", type: "technical", claim: "Title ok", source_url: "https://spicehub.test/", label: "OBSERVED" }, { id: "E2", type: "search", claim: "SERP", source_url: "https://google.com" }] });
ok(res.j.ok && res.j.stored === 2 && D.db.prepare("SELECT count(*) n FROM xray_evidence WHERE job_id=?").get(id).n === 2, "evidence rows written to D1 table xray_evidence");
for (const [kind, rows] of [["opportunities", [{ id: "O1", priority: "P0", score: 72, title: "x" }]], ["scores", [{ area: "website", score: 84 }]], ["competitors", [{ domain: "tandoortales.test", name: "Tandoor Tales", confidence: 0.82 }]], ["pages", [{ url: "https://spicehub.test/", status: 200, title: "Spice Hub" }]], ["findings", [{ id: "T_title", area: "website", status: "pass" }]], ["sources", [{ url: "https://spicehub.test/", name: "Website crawl" }]], ["business", [{ name: "Spice Hub", domain: "spicehub.test" }]]]) await call(env, "POST", "rows", { jobId: id, kind, rows });
ok(["xray_opportunities", "xray_scores", "xray_competitors", "xray_pages", "xray_findings", "xray_sources", "xray_businesses"].every((t) => D.db.prepare("SELECT count(*) n FROM " + t + " WHERE job_id=?").get(id).n === 1), "all normalised tables filled (pages, competitors, findings, opportunities, sources, scores, businesses)");
res = await call(env, "POST", "rows", { jobId: id, kind: "users; DROP TABLE xray_jobs", rows: [] }); ok(res.status === 400 && D.db.prepare("SELECT count(*) n FROM xray_jobs").get().n >= 1, "unknown table name refused (no SQL injection)");
res = await call(env, "POST", "report", '{"jobId":"someone-else"}', { "x-job": id }); ok(res.status === 400, "report body for another job refused");
res = await call(env, "POST", "report", rep, { "x-job": id }); ok(res.j.ok && res.j.url === "/business-x-ray/?r=" + id, "report stored → shareable URL");
res = await call(env, "GET", "status/" + id); ok(res.j.status === "COMPLETE" && res.j.progress === 100 && res.j.completedModules.length === 10, "job marked COMPLETE 100%");
res = await call(env, "GET", "report/" + id); ok(res.status === 200 && res.j.business.name.value === "Spice Hub", "shared report readable");
res = await call(env, "POST", "search", { jobId: id, q: "late search" }); ok(res.status === 410, "finished job cannot spend more searches");

/* ---------- 9. rate limits ---------- */
for (let i = 0; i < 2; i++) await call(env, "POST", "start", { url: "example" + i + ".com" });
res = await call(env, "POST", "start", { url: "example9.com" }); ok(res.status === 429 && /maximum/.test(res.j.reason), "4th X-Ray in an hour from one visitor → 429");
res = await call(env, "POST", "start", { url: "example9.com" }, { "cf-connecting-ip": "8.8.4.4" }); ok(res.status === 200, "another visitor is not affected");
const envDay = Object.assign({}, env, { XRAY_PER_DAY: "1", CHAT_KV: kv() }); await call(envDay, "POST", "start", { url: "a.com" }, { "cf-connecting-ip": "1.2.3.4" });
res = await call(envDay, "POST", "start", { url: "b.com" }, { "cf-connecting-ip": "5.6.7.8" }); ok(res.status === 429 && /Today/.test(res.j.reason), "site-wide daily cap → 429");

/* ---------- 10. KV fallback when D1 is not bound ---------- */
const envKV = { CHAT_KV: kv() };
res = await call(envKV, "POST", "start", { url: "flowdesk.test" }); const kid = res.j.jobId;
ok(res.status === 200 && res.j.providers.storage === "kv", "without D1 the X-Ray still works (KV storage)");
await call(envKV, "POST", "report", JSON.stringify({ jobId: kid, x: 1 }), { "x-job": kid });
res = await call(envKV, "GET", "report/" + kid); ok(res.status === 200 && res.j.x === 1, "report saved and shared from KV");

ok(leaks.length === 0, "the Serper key never appears in any response");
console.log(`\nxray functions: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
