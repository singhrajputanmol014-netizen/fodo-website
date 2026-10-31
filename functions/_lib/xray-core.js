/* FODO Business X-Ray, server core (Cloudflare Pages Functions).
   Design for the free plan (≈10 ms CPU per request): the server never parses big bodies. Pages, search results and
   PageSpeed reports are passed through byte for byte; the browser (js/xray-engine.js) does the parsing and analysis.
   The server's jobs: block unsafe URLs (SSRF), keep API keys secret, rate-limit, cache, store jobs/reports, log.

   Storage: D1 (binding XRAY_DB, tables made on first use) when bound, otherwise KV (CHAT_KV) with fewer writes.
   Providers (adapters, each is optional; a missing one is reported as "not configured", never faked):
     search      → Serper.dev (Google results, secret SERPER_API_KEY), or Brave Search API (secret BRAVE_API_KEY)
     seo         → DataForSEO              (secrets DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD), volume/CPC; not tested without an account
     performance → Google PageSpeed Insights (optional secret PAGESPEED_API_KEY; works keyless at a low quota)
     places      → Geoapify via /api/geo   (secret GEOAPIFY_KEY)
     ai          → Workers AI              (binding AI) */
export const UA = "FODO-BusinessXRay/1.0 (+https://www.fodo.co.in/business-x-ray/)";
export const json = (b, s, h) => new Response(JSON.stringify(b), { status: s || 200, headers: Object.assign({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, h || {}) });
export const STAGES = ["DISCOVERY", "CRAWLING", "MARKET_RESEARCH", "COMPETITORS", "CUSTOMER_RESEARCH", "SEO", "CONVERSION", "OPPORTUNITIES", "SYNTHESIS", "COMPLETE"];

/* ---------------- logging (Cloudflare real-time logs; never keys) ---------------- */
export function log(o) { try { console.log(JSON.stringify(Object.assign({ t: new Date().toISOString(), svc: "xray" }, o))); } catch (e) {} }

/* ---------------- URL safety (SSRF) ---------------- */
const BAD_HOST = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|home\.arpa|in-addr\.arpa|ip6\.arpa)$/i;
function ipv4Private(h) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h); if (!m) return null;
  const [a, b] = [+m[1], +m[2]];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}
function ipv6Private(h) {
  if (!/^\[.*\]$/.test(h)) return null;
  const x = h.slice(1, -1).toLowerCase();
  if (x === "::1" || x === "::" || /^f[cd]/.test(x) || /^fe[89ab]/.test(x)) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x) || /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(x);
  if (mapped) { if (mapped.length === 2) return ipv4Private(mapped[1]) !== false; const n = (parseInt(mapped[1], 16) << 16 >>> 0) + parseInt(mapped[2], 16); return ipv4Private([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".")) !== false; }
  return true;   // other IPv6 literals: refuse (no reason for a business website to use one)
}
/* → { ok, url (normalised string), host, reason } */
export function safeUrl(input) {
  let s = String(input || "").trim(); if (!s) return { ok: false, reason: "Enter a website address." };
  if (s.length > 2048) return { ok: false, reason: "That address is too long." };
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s;
  let u; try { u = new URL(s); } catch (e) { return { ok: false, reason: "That is not a valid website address." }; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, reason: "Only http and https websites can be analysed." };
  if (u.username || u.password) return { ok: false, reason: "Addresses with a username or password are not allowed." };
  if (u.port && u.port !== "80" && u.port !== "443") return { ok: false, reason: "Only standard web ports (80/443) are allowed." };
  const h = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!h || !h.includes(".") || BAD_HOST.test(h) || h === "metadata.google.internal") return { ok: false, reason: "That address points to a private or local network." };
  const p4 = ipv4Private(h), p6 = ipv6Private(h);
  if (p4 === true || p6 === true) return { ok: false, reason: "That address points to a private or local network." };
  if (p4 === false) return { ok: false, reason: "Please enter the website's domain name, not an IP address." };
  if (!/^[a-z0-9.-]+$/.test(h) && !/^xn--/.test(h)) { /* IDN already punycoded by URL() */ }
  u.hash = "";
  return { ok: true, url: u.toString(), host: h };
}
export const regDomain = (host) => { const p = String(host || "").toLowerCase().replace(/^www\./, "").split("."); if (p.length <= 2) return p.join("."); const sld = p[p.length - 2]; return (p[p.length - 1].length === 2 && /^(co|com|org|net|gov|ac|edu|ltd|plc|nic|res|gen|firm|ind)$/.test(sld) ? p.slice(-3) : p.slice(-2)).join("."); };

/* Outbound fetch. TEST MODE ONLY (env XRAY_TEST_MODE="1" + XRAY_TEST_MAP JSON {host: "http://127.0.0.1:port/prefix"}):
   requests to a mapped host are sent to a local fixture server instead, so the whole X-Ray can be tested offline.
   Never set these two variables on the live site. */
export function outbound(env) {
  let map = null;
  if (env && env.XRAY_TEST_MODE === "1" && env.XRAY_TEST_MAP) { try { map = JSON.parse(env.XRAY_TEST_MAP); } catch (e) { map = null; } }
  return (url, init) => {
    if (map) { const u = new URL(url), to = map[u.hostname]; if (to) return fetch(to.replace(/\/$/, "") + u.pathname + u.search, init); }
    return fetch(url, init);
  };
}
/* fetch that re-checks every redirect hop (an allowed site cannot bounce us into a private address) */
export async function safeFetch(url, init, { maxHops = 5, timeout = 15000, env } = {}) {
  const hops = []; let cur = url; const out = outbound(env);
  for (let i = 0; i <= maxHops; i++) {
    const chk = safeUrl(cur); if (!chk.ok) { const e = new Error(chk.reason); e.code = "blocked"; e.hops = hops; throw e; }
    const r = await out(chk.url, Object.assign({}, init, { redirect: "manual", signal: AbortSignal.timeout(timeout) }));
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
      const next = new URL(r.headers.get("location"), chk.url).toString(); hops.push({ from: chk.url, to: next, status: r.status }); cur = next;
      try { r.body && r.body.cancel(); } catch (e) {}
      continue;
    }
    return { r, finalUrl: chk.url, hops };
  }
  const e = new Error("Too many redirects"); e.code = "redirects"; e.hops = hops; throw e;
}

/* retry with exponential backoff on 429/5xx/network (used for provider APIs) */
export async function retrying(fn, { tries = 3, base = 500 } = {}) {
  let last, n = 0;
  for (; n < tries; n++) {
    try { const r = await fn(n); if (r.status !== 429 && r.status < 500) return { r, retries: n }; last = new Error("HTTP " + r.status); last.status = r.status; }
    catch (e) { last = e; }
    if (n < tries - 1) await new Promise((x) => setTimeout(x, base * Math.pow(2, n)));
  }
  last.retries = n; throw last;
}

/* ---------------- cache (Cloudflare Cache API, free, no KV writes) ---------------- */
async function cacheKey(ns, s) { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ns + "|" + s)); return "https://xray-cache.fodo.internal/" + ns + "/" + [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join(""); }
export async function cacheGet(ns, s) { try { if (typeof caches === "undefined" || !caches.default) return null; const hit = await caches.default.match(await cacheKey(ns, s)); return hit || null; } catch (e) { return null; } }
export async function cachePut(ns, s, body, type, ttl) { try { if (typeof caches === "undefined" || !caches.default) return; await caches.default.put(await cacheKey(ns, s), new Response(body, { headers: { "content-type": type, "cache-control": "public, max-age=" + ttl } })); } catch (e) {} }

/* ---------------- storage: D1 when bound, else KV ---------------- */
const DDL = [
  "CREATE TABLE IF NOT EXISTS xray_jobs (id TEXT PRIMARY KEY, url TEXT, domain TEXT, input TEXT, status TEXT, stage TEXT, progress INTEGER, completed TEXT, allow TEXT, note TEXT, ip_hash TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS xray_reports (job_id TEXT PRIMARY KEY, report TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS xray_businesses (job_id TEXT PRIMARY KEY, name TEXT, domain TEXT, industry TEXT, location TEXT, data TEXT)",
  "CREATE TABLE IF NOT EXISTS xray_pages (job_id TEXT, url TEXT, status INTEGER, title TEXT, data TEXT)",
  "CREATE TABLE IF NOT EXISTS xray_competitors (job_id TEXT, domain TEXT, name TEXT, confidence REAL, data TEXT)",
  "CREATE TABLE IF NOT EXISTS xray_evidence (job_id TEXT, id TEXT, type TEXT, claim TEXT, source_url TEXT, data TEXT)",
  "CREATE TABLE IF NOT EXISTS xray_findings (job_id TEXT, id TEXT, area TEXT, status TEXT, data TEXT)",
  "CREATE TABLE IF NOT EXISTS xray_opportunities (job_id TEXT, id TEXT, priority TEXT, score INTEGER, data TEXT)",
  "CREATE TABLE IF NOT EXISTS xray_sources (job_id TEXT, url TEXT, name TEXT, data TEXT)",
  "CREATE TABLE IF NOT EXISTS xray_scores (job_id TEXT, area TEXT, score INTEGER, data TEXT)",
  "CREATE INDEX IF NOT EXISTS xray_jobs_created ON xray_jobs(created_at)",
  "CREATE TABLE IF NOT EXISTS xray_counters (k TEXT PRIMARY KEY, n INTEGER, exp INTEGER)",
];
export const ROW_TABLES = { pages: ["xray_pages", ["url", "status", "title"]], competitors: ["xray_competitors", ["domain", "name", "confidence"]], evidence: ["xray_evidence", ["id", "type", "claim", "source_url"]],
  findings: ["xray_findings", ["id", "area", "status"]], opportunities: ["xray_opportunities", ["id", "priority", "score"]], sources: ["xray_sources", ["url", "name"]], scores: ["xray_scores", ["area", "score"]], business: ["xray_businesses", ["name", "domain", "industry", "location"]] };
let ddlDone = false;
async function d1(env) { const db = env.XRAY_DB; if (!db) return null; if (!ddlDone) { await db.batch(DDL.map((s) => db.prepare(s))); ddlDone = true; } return db; }
export function storageKind(env) { return env.XRAY_DB ? "d1" : env.CHAT_KV ? "kv" : "none"; }
const now = () => new Date().toISOString();

export async function jobCreate(env, job) {
  job.created_at = job.updated_at = now();
  const db = await d1(env);
  if (db) { await db.prepare("INSERT INTO xray_jobs (id,url,domain,input,status,stage,progress,completed,allow,note,ip_hash,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)")
    .bind(job.id, job.url, job.domain, JSON.stringify(job.input || {}), job.status, job.stage, job.progress, "[]", JSON.stringify(job.allow || []), "", job.ip_hash || "", job.created_at, job.updated_at).run(); return job; }
  if (env.CHAT_KV) { await env.CHAT_KV.put("xr:job:" + job.id, JSON.stringify(job), { expirationTtl: 30 * 86400 }); return job; }
  return job;
}
export async function jobGet(env, id) {
  if (!/^[a-z0-9]{20}$/.test(String(id || ""))) return null;
  const db = await d1(env);
  if (db) { const r = await db.prepare("SELECT * FROM xray_jobs WHERE id=?1").bind(id).first(); if (!r) return null; return Object.assign(r, { input: JSON.parse(r.input || "{}"), completed: JSON.parse(r.completed || "[]"), allow: JSON.parse(r.allow || "[]") }); }
  if (env.CHAT_KV) return await env.CHAT_KV.get("xr:job:" + id, "json");
  return null;
}
export async function jobUpdate(env, job, patch) {
  Object.assign(job, patch, { updated_at: now() });
  const db = await d1(env);
  if (db) { await db.prepare("UPDATE xray_jobs SET status=?2, stage=?3, progress=?4, completed=?5, allow=?6, note=?7, updated_at=?8 WHERE id=?1")
    .bind(job.id, job.status, job.stage, job.progress | 0, JSON.stringify(job.completed || []), JSON.stringify(job.allow || []), String(job.note || "").slice(0, 500), job.updated_at).run(); return job; }
  if (env.CHAT_KV) await env.CHAT_KV.put("xr:job:" + job.id, JSON.stringify(job), { expirationTtl: 30 * 86400 });
  return job;
}
export async function reportPut(env, id, text) {
  const db = await d1(env);
  if (db) { await db.prepare("INSERT OR REPLACE INTO xray_reports (job_id, report, created_at) VALUES (?1,?2,?3)").bind(id, text, now()).run(); return true; }
  if (env.CHAT_KV) { await env.CHAT_KV.put("xr:rep:" + id, text, { expirationTtl: 90 * 86400 }); return true; }
  return false;
}
export async function reportGet(env, id) {
  if (!/^[a-z0-9]{20}$/.test(String(id || ""))) return null;
  const db = await d1(env);
  if (db) { const r = await db.prepare("SELECT report FROM xray_reports WHERE job_id=?1").bind(id).first(); return r ? r.report : null; }
  if (env.CHAT_KV) return await env.CHAT_KV.get("xr:rep:" + id);
  return null;
}
export async function rowsPut(env, id, kind, rows) {   // normalised tables (D1 only)
  const db = await d1(env); if (!db) return 0;
  const t = ROW_TABLES[kind]; if (!t) return 0;
  const [table, cols] = t, all = ["job_id"].concat(cols, ["data"]);
  const sql = `INSERT INTO ${table} (${all.join(",")}) VALUES (${all.map((_, i) => "?" + (i + 1)).join(",")})`;
  const st = rows.slice(0, 100).map((r) => db.prepare(sql).bind(id, ...cols.map((c) => r[c] == null ? null : typeof r[c] === "number" ? r[c] : String(r[c]).slice(0, 2000)), JSON.stringify(r).slice(0, 20000)));
  if (st.length) await db.batch(st);
  return st.length;
}

/* ---------------- rate limits ---------------- */
export async function hashIp(request) { const ip = request.headers.get("cf-connecting-ip") || "anon"; const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("xray|" + ip)); return [...new Uint8Array(d)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join(""); }
export async function counter(env, key, limit, ttl) {   // true when the limit is reached
  // D1 when bound (100k free writes a day), keeps KV's small free write budget for the chatbot and finder caches
  try {
    const db = await d1(env);
    if (db) {
      const now = Date.now();
      const r = await db.prepare("INSERT INTO xray_counters (k, n, exp) VALUES (?1, 1, ?2) ON CONFLICT(k) DO UPDATE SET n = CASE WHEN exp < ?3 THEN 1 ELSE n + 1 END, exp = CASE WHEN exp < ?3 THEN ?2 ELSE exp END RETURNING n").bind(key, now + ttl * 1000, now).first();
      if (Math.random() < 0.05) await db.prepare("DELETE FROM xray_counters WHERE exp < ?1").bind(now).run();
      return !!r && r.n > limit;
    }
  } catch (e) { log({ route: "counter", ok: false, err: String(e.message).slice(0, 120) }); }
  const kv = env.CHAT_KV; if (!kv) return false;
  try { const n = parseInt((await kv.get(key)) || "0", 10); if (n >= limit) return true; await kv.put(key, String(n + 1), { expirationTtl: ttl }); } catch (e) {}
  return false;
}
// best-effort per-isolate counters (no storage writes) for fetches/searches inside one job
const mem = new Map();
export function memCount(key, limit) { const n = (mem.get(key) || 0) + 1; mem.set(key, n); if (mem.size > 5000) mem.clear(); return n > limit; }

export function providers(env) {
  return {
    search: env.SERPER_API_KEY ? "serper" : env.BRAVE_API_KEY ? "brave" : null,
    searchName: env.SERPER_API_KEY ? "Google Search (via Serper)" : env.BRAVE_API_KEY ? "Brave Search" : "",
    seo: env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD ? "dataforseo" : null,
    authority: env.OPR_API_KEY ? "openpagerank" : null,
    performance: "pagespeed",
    places: env.GEOAPIFY_KEY ? "geoapify" : null,
    ai: env.AI ? "workers-ai" : env.GROQ_API_KEY ? "groq" : null,   // v20.2: Groq stands in when Workers AI is not bound
    storage: storageKind(env),
  };
}
export const rid = () => [...crypto.getRandomValues(new Uint8Array(20))].map((b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");

/* ---------------- SearchProvider adapters → one normalised shape ----------------
   { provider, providerName, searchUrl, web:[{pos,title,url,description,extra[],rating,ratingCount}], discussions:[{title,url,description,forum,question,top}],
     faq:[{question,answer,url}], locations:[{title,url,rating,reviews,address,website}], related:[] } */
const strip = (s) => String(s == null ? "" : s).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const FORUMS = /(^|\.)(reddit\.com|quora\.com|stackexchange\.com|stackoverflow\.com|tripadvisor\.[a-z.]+|mouthshut\.com|team-bhp\.com|indiaforums\.com)$/i;
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };
export function normSearch(provider, j, q) {
  j = j || {};
  if (provider === "serper") {
    const web = (j.organic || []).filter((r) => r && r.link).slice(0, 10).map((r, i) => ({ pos: r.position || i + 1, title: strip(r.title), url: r.link, description: strip(r.snippet), extra: (r.sitelinks || []).slice(0, 4).map((x) => strip(x.title)).filter(Boolean), rating: r.rating != null ? +r.rating : null, ratingCount: r.ratingCount != null ? +r.ratingCount : null, date: r.date || "" }));
    return { provider, providerName: "Google Search (via Serper)", searchUrl: "https://www.google.com/search?q=" + encodeURIComponent(q || (j.searchParameters || {}).q || ""), web,
      discussions: web.filter((r) => FORUMS.test(hostOf(r.url))).map((r) => ({ title: r.title, url: r.url, description: r.description, forum: hostOf(r.url), question: r.title, top: "" })),
      faq: (j.peopleAlsoAsk || []).slice(0, 8).map((x) => ({ question: strip(x.question), answer: strip(x.snippet), url: x.link || "" })),
      locations: (j.places || []).slice(0, 10).map((x) => ({ title: strip(x.title), url: x.website || (x.cid ? "https://www.google.com/maps?cid=" + x.cid : ""), website: x.website || "", rating: x.rating != null ? +x.rating : null, reviews: x.ratingCount != null ? +x.ratingCount : null, address: strip(x.address) })),
      related: (j.relatedSearches || []).slice(0, 8).map((x) => strip(x.query)).filter(Boolean) };
  }
  // brave
  return { provider: "brave", providerName: "Brave Search", searchUrl: "https://search.brave.com/search?q=" + encodeURIComponent(q || ""),
    web: ((j.web || {}).results || []).slice(0, 10).map((r, i) => ({ pos: i + 1, title: strip(r.title), url: r.url, description: strip(r.description), extra: (r.extra_snippets || []).map(strip), rating: null, ratingCount: null })),
    discussions: ((j.discussions || {}).results || []).map((r) => { const d = r.data || {}; return { title: strip(r.title), url: r.url, description: strip(r.description), forum: d.forum_name || "", question: strip(d.question), top: strip(d.top_comment) }; }),
    faq: ((j.faq || {}).results || []).map((r) => ({ question: strip(r.question), answer: strip(r.answer), url: r.url })),
    locations: ((j.locations || {}).results || []).map((r) => ({ title: strip(r.title), url: r.url || "", website: "", rating: r.rating ? r.rating.ratingValue : null, reviews: r.rating ? r.rating.reviewCount : null, address: r.postal_address ? strip(r.postal_address.displayAddress) : "" })), related: [] };
}
