/* FODO v55 Admin ▸ Lead Intelligence (owners and Full-control admins only).
   Find real businesses from public sources, research their own websites, score them with evidence, manage outreach.

   Sources, all real, none simulated:
   - Discovery: Google Places API (Text Search, needs GOOGLE_PLACES_KEY) or, without a key, OpenStreetMap (free, via the same
     search the public Competitor Finder uses). The source of every business is stored.
   - Research: the business's OWN website (home + contact/about/team pages, max 4 pages, robots-friendly, SSRF-safe fetch).
   - Decision makers: (1) structured data and explicit "Name, Founder/CEO/Owner/Director" text on the official website,
     (2) optional public web search (SERPER_API_KEY or BRAVE_API_KEY) for "<business> founder / owner / CEO" results such as
     public LinkedIn profile titles. LinkedIn itself is never opened, scraped or logged into; nothing is guessed.
   - Email checks: only addresses that appear on the official website or Google; the domain's mail server (MX) is checked by
     public DNS-over-HTTPS. That proves the domain accepts mail, never that a mailbox exists, and is labelled so.
   - Speed: Google PageSpeed Insights when PAGESPEED_API_KEY is set (or LI_PAGESPEED=1 for the small keyless quota).
   - AI (Workers AI): only writes summaries and outreach drafts from the stored evidence. Its text is always labelled AI.

   Confidence for people: verified = name + role on the business's own website; partial = name + role + business name in a
   public search result; unverified = a name/profile linked from the site without a clear role; not_found.
   Score (0-100) = 8 parts, each with its evidence; a part with no data scores 0 ("not checked"), never a guess.
   Nothing is ever sent from this module: outreach drafts are text to copy; Bulk pitch / Client Emails do the sending. */
import { db as adb, cleanEmail, nowIso, randId } from "./accounts.js";
import { safeFetch, outbound, regDomain, normSearch, providers } from "./xray-core.js";
import { freePlaces, knownArea } from "./free-places.js";
import { googleSearch } from "../api/competitors.js";
import * as SCH from "./schema.js";

const err = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const all = async (d, sql, ...a) => (await d.prepare(sql).bind(...a).all()).results || [];
const one = (d, sql, ...a) => d.prepare(sql).bind(...a).first();
const run = (d, sql, ...a) => d.prepare(sql).bind(...a).run();
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
export const clip = (s, n) => String(s == null ? "" : s).replace(/<[^>]*>/g, " ").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n || 200);
/* one Google Cloud key (project FODO) is allowed for both Places API (New) and PageSpeed, so either secret name works */
const placesKey = (env) => env.GOOGLE_PLACES_KEY || env.PAGESPEED_API_KEY || "";
const UA = "FODO-LeadIntelligence/1.0 (+https://www.fodo.co.in; anmol@fodo.co.in)";

export const STATUSES = [["new", "New"], ["not_contacted", "Not contacted"], ["contacted", "Contacted"], ["email_sent", "Email sent"], ["replied", "Replied"], ["called", "Called"], ["interested", "Interested"],
  ["follow_up", "Follow-up required"], ["meeting", "Meeting scheduled"], ["proposal", "Proposal sent"], ["converted", "Converted"], ["not_interested", "Not interested"], ["dnc", "Do not contact"]];
const ST = STATUSES.map((s) => s[0]);
export const INDUSTRIES = ["Healthcare", "Dental clinics", "Dermatology", "Real estate", "Interior design", "Restaurants", "Hotels", "Gyms", "Salons", "Education", "Coaching institutes",
  "Law firms", "CA firms", "Automobile", "E-commerce", "Manufacturing", "IT companies", "SaaS", "Logistics", "Other"];
export const PRIORITY = (s) => (s >= 80 ? "hot" : s >= 60 ? "high" : s >= 40 ? "medium" : "low");
export const PRIORITY_LABEL = { hot: "Hot lead", high: "High potential", medium: "Medium potential", low: "Low priority" };

/* ---------------- database (FODO accounts D1, tables prefixed li_) ---------------- */
const DDL = [
  "CREATE TABLE IF NOT EXISTS li_businesses (id TEXT PRIMARY KEY, name TEXT, industry TEXT, sub_industry TEXT, category TEXT, address TEXT, locality TEXT, city TEXT, state TEXT, country TEXT, lat REAL, lng REAL, website TEXT, domain TEXT, phone TEXT, phone_key TEXT, name_key TEXT, maps_url TEXT, place_id TEXT, rating REAL, reviews INTEGER, biz_status TEXT, source TEXT, source_ref TEXT, search_id TEXT, score INTEGER, priority TEXT, status TEXT DEFAULT 'new', archived INTEGER DEFAULT 0, notes TEXT, owner_name TEXT, owner_role TEXT, owner_conf TEXT, email TEXT, whatsapp TEXT, researched_at TEXT, verified_at TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE INDEX IF NOT EXISTS li_biz_domain ON li_businesses(domain)",
  "CREATE INDEX IF NOT EXISTS li_biz_phone ON li_businesses(phone_key)",
  "CREATE INDEX IF NOT EXISTS li_biz_name ON li_businesses(name_key)",
  "CREATE INDEX IF NOT EXISTS li_biz_place ON li_businesses(place_id)",
  "CREATE INDEX IF NOT EXISTS li_biz_score ON li_businesses(archived, score)",
  "CREATE INDEX IF NOT EXISTS li_biz_status ON li_businesses(status)",
  /* v55.29 imported client databases: list view + fast duplicate checks */
  "CREATE INDEX IF NOT EXISTS li_biz_import ON li_businesses(source, source_ref)",
  /* business_contacts */
  "CREATE TABLE IF NOT EXISTS li_contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT, kind TEXT, label TEXT, value TEXT, source_url TEXT, status TEXT, checked_at TEXT, UNIQUE(business_id, kind, value))",
  "CREATE INDEX IF NOT EXISTS li_ct_value ON li_contacts(kind, value)",   /* v55.29 */
  "CREATE INDEX IF NOT EXISTS li_contacts_b ON li_contacts(business_id)",
  /* founders / decision makers */
  "CREATE TABLE IF NOT EXISTS li_people (id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT, name TEXT, role TEXT, profile_url TEXT, confidence TEXT, source_url TEXT, evidence TEXT, found_at TEXT, UNIQUE(business_id, name, role))",
  "CREATE INDEX IF NOT EXISTS li_people_b ON li_people(business_id)",
  /* website_audits + marketing_intelligence (summary + AI text) */
  "CREATE TABLE IF NOT EXISTS li_audits (business_id TEXT PRIMARY KEY, url TEXT, data TEXT, summary TEXT, ai_summary TEXT, ai_model TEXT, at TEXT)",
  /* lead_opportunities */
  "CREATE TABLE IF NOT EXISTS li_opps (id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT, service TEXT, problem TEXT, evidence TEXT, why TEXT, value TEXT, angle TEXT, kind TEXT, at TEXT)",
  "CREATE INDEX IF NOT EXISTS li_opps_b ON li_opps(business_id)",
  /* lead_scores (history) */
  "CREATE TABLE IF NOT EXISTS li_scores (id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT, total INTEGER, parts TEXT, at TEXT)",
  "CREATE INDEX IF NOT EXISTS li_scores_b ON li_scores(business_id)",
  /* outreach_tracking */
  "CREATE TABLE IF NOT EXISTS li_outreach (id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT, from_status TEXT, to_status TEXT, channel TEXT, note TEXT, by_email TEXT, at TEXT)",
  "CREATE INDEX IF NOT EXISTS li_outreach_b ON li_outreach(business_id)",
  /* research_sources */
  "CREATE TABLE IF NOT EXISTS li_sources (id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT, url TEXT, kind TEXT, http INTEGER, at TEXT, UNIQUE(business_id, url))",
  /* search_jobs + their runs */
  "CREATE TABLE IF NOT EXISTS li_jobs (id TEXT PRIMARY KEY, name TEXT, filters TEXT, schedule TEXT, enabled INTEGER DEFAULT 1, last_run TEXT, next_run TEXT, created_by TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS li_runs (id TEXT PRIMARY KEY, job_id TEXT, filters TEXT, source TEXT, found INTEGER, added INTEGER, dupes INTEGER, filtered INTEGER, errors TEXT, by_email TEXT, at TEXT, ms INTEGER)",
  /* api_integrations usage + activity_logs */
  "CREATE TABLE IF NOT EXISTS li_usage (day TEXT, api TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, PRIMARY KEY (day, api))",
  "CREATE TABLE IF NOT EXISTS li_activity (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, business_id TEXT, detail TEXT, by_email TEXT, at TEXT)",
  "CREATE INDEX IF NOT EXISTS li_activity_k ON li_activity(kind, at)",
  "CREATE TABLE IF NOT EXISTS li_replies (id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT, channel TEXT, from_addr TEXT, subject TEXT, text TEXT, at TEXT, source TEXT, ref TEXT, by_email TEXT, created_at TEXT, UNIQUE(business_id, ref))",
  "CREATE INDEX IF NOT EXISTS li_replies_b ON li_replies(business_id, at)",
  "CREATE INDEX IF NOT EXISTS li_outreach_ch ON li_outreach(channel, at)",
];
/* v55.31 email list cleaning: every email gets a check result before any marketing email goes out */
const MIG = ["ALTER TABLE li_businesses ADD COLUMN email_check TEXT", "ALTER TABLE li_businesses ADD COLUMN email_reason TEXT",
  "CREATE INDEX IF NOT EXISTS li_biz_echeck ON li_businesses(source_ref, email_check)"];
export async function ldb(env) {
  const d = await adb(env); if (!d) throw err("Database not connected.", 503);
  await SCH.setup(d, "leadintel", async () => { await SCH.ddl(d, DDL); await SCH.alters(d, MIG); });
  return d;
}
async function usage(d, api, ok) { try { await run(d, "INSERT INTO li_usage (day, api, calls, errors) VALUES (?1,?2,1,?3) ON CONFLICT(day, api) DO UPDATE SET calls=calls+1, errors=errors+?3", nowIso().slice(0, 10), api, ok ? 0 : 1); } catch (e) {} }
async function act(d, kind, bid, detail, by) { try { await run(d, "INSERT INTO li_activity (kind, business_id, detail, by_email, at) VALUES (?1,?2,?3,?4,?5)", kind, bid || null, clip(detail, 600), clip(by, 254), nowIso()); } catch (e) {} }

/* ---------------- keys for de-duplication ---------------- */
export const domainOf = (u) => { try { const h = new URL(/^https?:/i.test(u) ? u : "https://" + u).hostname.toLowerCase(); return regDomain(h); } catch (e) { return ""; } };
const SOCIAL_HOST = /(^|\.)(facebook\.com|instagram\.com|linkedin\.com|x\.com|twitter\.com|youtube\.com|google\.com|goo\.gl|wa\.me|whatsapp\.com|justdial\.com|practo\.com|zomato\.com|swiggy\.com|linktr\.ee|sulekha\.com|indiamart\.com|business\.site)$/i;
export const siteDomain = (u) => { const d = domainOf(u); return d && !SOCIAL_HOST.test(d) ? d : ""; };
export const phoneKey = (p) => { const g = String(p || "").replace(/\D/g, ""); return g.length >= 8 ? g.slice(-10) : ""; };
export const nameKey = (n, city) => (String(n || "").toLowerCase().replace(/&/g, " and ").replace(/\b(pvt|private|ltd|limited|llp|inc|the|co)\b/g, " ").replace(/[^a-z0-9]+/g, "") + "|" + String(city || "").toLowerCase().replace(/[^a-z]+/g, "")).slice(0, 120);

/* ---------------- discovery ---------------- */
export function cleanFilters(f) {
  f = f || {}; const c = (k, n) => clip(f[k], n || 80);
  const out = { country: c("country") || "India", state: c("state"), city: c("city"), locality: c("locality"), industry: c("industry"), sub_industry: c("sub_industry"), keywords: c("keywords", 120),
    website: ["any", "has", "none"].indexOf(f.website) > -1 ? f.website : "any", size: ["any", "small", "medium", "large"].indexOf(f.size) > -1 ? f.size : "any",
    growth: ["any", "active", "established"].indexOf(f.growth) > -1 ? f.growth : "any", limit: Math.max(1, Math.min(60, parseInt(f.limit, 10) || 20)) };
  if (!out.industry && !out.sub_industry && !out.keywords) throw err("Pick an industry or type keywords.");
  if (!out.city && !out.locality && !out.state) throw err("Pick a city, locality or state.");
  return out;
}
export const queryOf = (f) => [f.sub_industry || f.industry, f.keywords].filter(Boolean).join(" ").replace(/\bOther\b/i, "").trim();
export const areaOf = (f) => [f.locality, f.city, f.state, f.country].filter(Boolean).join(", ");
const sizeOf = (reviews) => (reviews == null ? "" : reviews >= 500 ? "large" : reviews >= 50 ? "medium" : "small");
export function passes(f, b) {
  if (f.website === "has" && !b.website) return false;
  if (f.website === "none" && b.website) return false;
  if (f.size !== "any" && sizeOf(b.reviews) !== f.size) return false;   // no review data → cannot prove the size → left out
  if (f.growth === "active" && !(b.reviews >= 10 && (b.rating || 0) >= 4)) return false;
  if (f.growth === "established" && !(b.reviews >= 100)) return false;
  if (b.biz_status && /CLOSED/.test(b.biz_status)) return false;
  return true;
}
async function discover(env, d, f) {
  const q = queryOf(f), area = areaOf(f), errors = [];
  if (placesKey(env)) {
    try {
      const res = await googleSearch(placesKey(env), { type: q, area, center: null, radius: 0, rect: null, pages: Math.ceil(f.limit / 20) });
      await usage(d, "google_places", true);
      return { source: "google_places", errors, results: res.map((p) => ({ name: p.name, address: p.address, lat: p.lat, lng: p.lng, category: p.category, phone: p.intlPhone || p.phone, website: p.website,
        maps_url: p.mapsUrl || "", place_id: String(p.id || "").replace(/^g\//, ""), rating: p.rating, reviews: p.reviews, biz_status: p.status || "", source_ref: p.mapsUrl || "" })) };
    } catch (e) { await usage(d, "google_places", false); errors.push("Google Places: " + String(e.message || e).slice(0, 160)); }
  }
  try {
    const fetchT = (u, o, ms) => outbound(env)(u, Object.assign({}, o, { signal: AbortSignal.timeout(ms || 15000) }));
    const free = freePlaces(fetchT, { "user-agent": UA });
    const o = await free.search({ type: q, area, center: knownArea(f.locality || f.city) || null, radius: f.locality ? 3000 : 15000, max: Math.max(60, f.limit * 3) });
    await usage(d, "openstreetmap", true);
    return { source: "openstreetmap", errors, results: (o.results || []).map((p) => ({ name: p.name, address: p.address || "", lat: p.lat, lng: p.lng, category: p.category || "", phone: p.phone || "", website: p.website || "",
      maps_url: p.mapsUrl || "", place_id: "", rating: null, reviews: null, biz_status: "", source_ref: p.osmUrl || "",
      extra: { email: p.email || "", whatsapp: p.whatsapp || "", instagram: p.instagram || "", facebook: p.facebook || "", linkedin: p.linkedin || "", x: p.twitter || "", youtube: p.youtube || "" } })) };
  } catch (e) { await usage(d, "openstreetmap", false); errors.push("OpenStreetMap: " + String((e.tried && e.tried.join("; ")) || e.message || e).slice(0, 200)); }
  return { source: placesKey(env) ? "google_places" : "openstreetmap", errors, results: [] };
}
export async function findDuplicate(d, b) {
  if (b.place_id) { const r = await one(d, "SELECT id FROM li_businesses WHERE place_id=?1", b.place_id); if (r) return r.id; }
  if (b.domain) { const r = await one(d, "SELECT id FROM li_businesses WHERE domain=?1", b.domain); if (r) return r.id; }
  if (b.phone_key) { const r = await one(d, "SELECT id FROM li_businesses WHERE phone_key=?1", b.phone_key); if (r) return r.id; }
  if (b.name_key) { const r = await one(d, "SELECT id FROM li_businesses WHERE name_key=?1", b.name_key); if (r) return r.id; }
  return null;
}
/* run one search: discover → filter → de-duplicate → save. Returns the run summary (also logged in li_runs). */
export async function search(env, filters, by, jobId) {
  const d = await ldb(env), f = cleanFilters(filters), t0 = Date.now(), rid = "lr_" + randId(10);
  const found = await discover(env, d, f), added = [], dupes = [], skipped = [], t = nowIso();
  for (const p of found.results) {
    if (added.length >= f.limit) break;
    const b = { name: clip(p.name, 160), address: clip(p.address, 300), category: clip(p.category, 80), phone: clip(p.phone, 40), website: /^https?:\/\//i.test(p.website || "") ? clip(p.website, 300) : "",
      maps_url: clip(p.maps_url, 400), place_id: clip(p.place_id, 120), rating: p.rating == null ? null : +p.rating, reviews: p.reviews == null ? null : +p.reviews, biz_status: clip(p.biz_status, 40), lat: p.lat, lng: p.lng, source_ref: clip(p.source_ref, 400) };
    if (!b.name) continue;
    if (!passes(f, b)) { skipped.push(b.name); continue; }
    b.domain = siteDomain(b.website); b.phone_key = phoneKey(b.phone); b.name_key = nameKey(b.name, f.city || f.locality);
    const dup = await findDuplicate(d, b);
    if (dup) {   // incremental update: fill gaps only, never overwrite researched data
      await run(d, "UPDATE li_businesses SET website=COALESCE(NULLIF(website,''),?2), domain=COALESCE(NULLIF(domain,''),?3), phone=COALESCE(NULLIF(phone,''),?4), phone_key=COALESCE(NULLIF(phone_key,''),?5), rating=COALESCE(?6,rating), reviews=COALESCE(?7,reviews), maps_url=COALESCE(NULLIF(maps_url,''),?8), updated_at=?9 WHERE id=?1",
        dup, b.website, b.domain, b.phone, b.phone_key, b.rating, b.reviews, b.maps_url, t);
      dupes.push({ id: dup, name: b.name }); continue;
    }
    const id = "LI-" + randId(8).toUpperCase();
    await run(d, "INSERT INTO li_businesses (id,name,industry,sub_industry,category,address,locality,city,state,country,lat,lng,website,domain,phone,phone_key,name_key,maps_url,place_id,rating,reviews,biz_status,source,source_ref,search_id,score,priority,status,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,NULL,NULL,'new',?26,?26)",
      id, b.name, f.industry, f.sub_industry, b.category, b.address, f.locality, f.city, f.state, f.country, b.lat ?? null, b.lng ?? null, b.website, b.domain, b.phone, b.phone_key, b.name_key, b.maps_url, b.place_id || null, b.rating, b.reviews, b.biz_status, found.source, b.source_ref, rid, t);
    if (b.phone) await addContact(d, id, "phone", "Business phone", b.phone, b.maps_url || b.source_ref, found.source === "google_places" ? "listed on Google Maps" : "listed on OpenStreetMap");
    if (b.maps_url) await addContact(d, id, "maps", "Google Maps", b.maps_url, b.maps_url, "listing");
    if (b.website) await addContact(d, id, "website", "Official website", b.website, b.maps_url || b.source_ref, "listed by " + (found.source === "google_places" ? "Google Maps" : "OpenStreetMap"));
    const ex = p.extra || {};   // OpenStreetMap listings sometimes carry email / WhatsApp / social links
    if (cleanEmail(ex.email)) await addContact(d, id, "email", mailKind(cleanEmail(ex.email)), cleanEmail(ex.email), b.source_ref, "listed on OpenStreetMap");
    if (ex.whatsapp) await addContact(d, id, "whatsapp", "WhatsApp", ex.whatsapp, b.source_ref, "listed on OpenStreetMap");
    for (const k of ["instagram", "facebook", "linkedin", "x", "youtube"]) if (/^https?:\/\//.test(ex[k] || "")) await addContact(d, id, k, { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", x: "X", youtube: "YouTube" }[k], ex[k], b.source_ref, "listed on OpenStreetMap");
    added.push({ id, name: b.name });
  }
  const ms = Date.now() - t0;
  await run(d, "INSERT INTO li_runs (id, job_id, filters, source, found, added, dupes, filtered, errors, by_email, at, ms) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
    rid, jobId || null, JSON.stringify(f), found.source, found.results.length, added.length, dupes.length, skipped.length, JSON.stringify(found.errors), clip(by, 254), t, ms);
  if (found.errors.length) await act(d, "error", null, "Search " + rid + ": " + found.errors.join(" | "), by);
  return { run: rid, source: found.source, query: queryOf(f), area: areaOf(f), found: found.results.length, added, duplicates: dupes, filtered: skipped.length, errors: found.errors, ms };
}
async function addContact(d, bid, kind, label, value, src, status) {
  value = clip(value, 400); if (!value) return;
  await run(d, "INSERT INTO li_contacts (business_id, kind, label, value, source_url, status, checked_at) VALUES (?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(business_id, kind, value) DO UPDATE SET source_url=?5, status=?6, checked_at=?7, label=?3",
    bid, kind, clip(label, 60), value, clip(src, 400), clip(status, 80), nowIso());
}

/* ---------------- research: official website → contacts, people, audit ---------------- */
const MAX_HTML = 300000;
async function getPage(env, url, d) {
  const t0 = Date.now();
  try {
    const { r, finalUrl } = await safeFetch(url, { headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" } }, { timeout: 12000, env });
    const type = r.headers.get("content-type") || ""; let html = "";
    if (/html|xml|text/i.test(type) || !type) { html = await r.text(); if (html.length > MAX_HTML) { html = html.slice(0, 2000000).replace(/<script(?![^>]*ld\+json)[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>|data:[a-z\/+.-]+;base64,[A-Za-z0-9+\/=]+/gi, " "); if (html.length > MAX_HTML) html = html.slice(0, MAX_HTML); } } else { try { r.body && r.body.cancel(); } catch (e) {} }
    return { ok: r.ok, status: r.status, url: finalUrl, html, ms: Date.now() - t0, headers: { hsts: !!r.headers.get("strict-transport-security"), server: r.headers.get("server") || "" } };
  } catch (e) { return { ok: false, status: 0, url, html: "", ms: Date.now() - t0, error: String(e.message || e).slice(0, 160) }; }
}
export const textOf = (html) => String(html || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|td|tr|section|span|a)>/gi, "\n").replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/&[a-z]+;/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n");
const links = (html, base) => { const out = []; String(html).replace(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi, (m, h, t) => { try { out.push({ href: new URL(h.trim(), base).toString(), text: clip(t, 80) }); } catch (e) {} return m; }); return out; };
const BAD_MAIL = /\.(png|jpe?g|gif|webp|svg)$|@(example|domain|email|sentry|wixpress|sentry-next)\.|^(user|name|your|test)@/i;
export function emailsIn(html) {
  const s = new Set(); const src = String(html).replace(/\[at\]|\s\(at\)\s/gi, "@");
  (src.match(/mailto:([^"'?\s>]+)/gi) || []).forEach((m) => s.add(m.slice(7)));
  (textOf(src).match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []).forEach((m) => s.add(m));
  return [...s].map((e) => cleanEmail(decodeURIComponent(e))).filter((e) => e && !BAD_MAIL.test(e)).slice(0, 12);
}
const mailKind = (e) => { const l = e.split("@")[0]; return /sales|business|biz/.test(l) ? "Sales email" : /market|pr|media|brand/.test(l) ? "Marketing email" : /info|hello|contact|enquir|inquir|support|care|office|admin/.test(l) ? "General enquiry email" : "Business email"; };
export function phonesIn(html) { const s = new Set(); (String(html).match(/href=["']tel:([^"']+)["']/gi) || []).forEach((m) => { const v = m.replace(/^href=["']tel:/i, "").replace(/["']$/, "").replace(/%20/g, " "); if (phoneKey(v)) s.add(clip(v, 30)); }); return [...s].slice(0, 6); }
export function whatsappIn(html) { const s = new Set(); (String(html).match(/https?:\/\/(?:wa\.me\/\+?\d{8,15}|(?:api|web)\.whatsapp\.com\/send\/?\?phone=\+?\d{8,15})/gi) || []).forEach((m) => s.add(m)); return [...s].slice(0, 3); }
const SOC = [["instagram", /instagram\.com\/(?!p\/|reel|explore|accounts)[A-Za-z0-9._]+/i], ["facebook", /facebook\.com\/(?!sharer|share|dialog|plugins|tr\b)[A-Za-z0-9.\-/?=_]+/i], ["linkedin", /linkedin\.com\/(company|school)\/[A-Za-z0-9\-_%]+/i], ["x", /(?:twitter|x)\.com\/(?!intent|share|home)[A-Za-z0-9_]+/i], ["youtube", /youtube\.com\/(@|channel\/|c\/|user\/)[A-Za-z0-9_\-]+/i]];
export function socialsIn(html, base) { const out = {}; links(html, base).forEach((l) => { SOC.forEach(([k, re]) => { if (!out[k] && re.test(l.href)) out[k] = l.href.split("#")[0]; }); }); return out; }

/* people: structured data + explicit role text on the official site */
const ROLE = "(?:Co-?\\s?Founder(?:\\s*(?:&|and)\\s*CEO)?|Founder(?:\\s*(?:&|and)\\s*(?:CEO|Director|MD|Managing Director))?|CEO|Chief Executive Officer|Managing Director|MD|Owner|Proprietor|Director|Chairman|Principal|Head of Marketing|Marketing Head|Marketing Manager|CMO|Partner|Chief Medical Officer|Medical Director)";
const NAME = "((?:Dr\\.?|Mr\\.?|Ms\\.?|Mrs\\.?|CA|Adv\\.?)?\\s?[A-Z][a-z]+(?:\\s[A-Z]\\.?)?(?:\\s[A-Z][a-z]+){1,2})";
const NOT_NAME = /\b(Our|Team|About|Contact|Home|Services|Read|More|Meet|The|Welcome|Clinic|Hospital|Company|Private|Limited|India|Delhi|Gurgaon|Gurugram|Noida|Message|Click|View|Book|Call|Best|Top|Group|Center|Centre|Studio|Academy|Institute|Solutions|Digital|Media|Real|Estate|Interior|Design|Dental|Skin|Hair|Care)\b/;
const okName = (n) => { n = clip(n, 60).replace(/\s+/g, " "); const w = n.replace(/^(Dr|Mr|Ms|Mrs|CA|Adv)\.?\s/, "").split(" "); return w.length >= 2 && w.length <= 4 && !NOT_NAME.test(n) && w.every((x) => /^[A-Z][a-z.]*$/.test(x)) ? n : ""; };
export function peopleIn(html, url) {
  const out = [], seen = new Set(), push = (name, role, conf, ev, profile) => { name = okName(name); role = clip(role, 60); if (!name || !role) return; const k = name.toLowerCase().replace(/^(dr|mr|ms|mrs|ca|adv)\.?\s/, ""); if (seen.has(k)) return; seen.add(k); out.push({ name, role, confidence: conf, source_url: url, evidence: clip(ev, 200), profile_url: profile || "" }); };
  (String(html).match(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || []).forEach((blk) => {
    const o = J(blk.replace(/^<script[^>]*>|<\/script>$/gi, ""), null); const walk = (x) => { if (!x || typeof x !== "object") return; if (Array.isArray(x)) return x.forEach(walk);
      ["founder", "founders"].forEach((k) => { [].concat(x[k] || []).forEach((p) => { if (p && p.name) push(p.name, "Founder", "verified", "Structured data on the official website: founder", p.sameAs && /linkedin\.com\/in\//.test([].concat(p.sameAs).join(" ")) ? [].concat(p.sameAs).find((s) => /linkedin\.com\/in\//.test(s)) : ""); }); });
      if (/Person/.test(x["@type"] || "") && x.name && x.jobTitle && new RegExp(ROLE, "i").test(x.jobTitle)) push(x.name, x.jobTitle, "verified", "Structured data on the official website: " + x.jobTitle);
      Object.keys(x).forEach((k) => { if (typeof x[k] === "object") walk(x[k]); }); };
    walk(o);
  });
  const txt = textOf(html);
  const a = new RegExp(NAME + "\\s*(?:[,\\-\\u2013\\u2014|:]|\\(|\\n)\\s*(?:the\\s)?" + ROLE + "\\b", "g"), b = new RegExp("\\b" + ROLE + "\\s*(?:[:\\-\\u2013\\u2014|,]|\\n)\\s*" + NAME, "g");
  // "Led by Dr. X" / "founded by X": the website names who runs the business → a verified decision maker
  const led = new RegExp("\\b(led|founded|co-founded|owned|run|headed|started|established|managed)\\s+by\\s+" + NAME, "gi");
  let m; while ((m = led.exec(txt)) && out.length < 8) push(m[2], ({ led: "Head of the business", founded: "Founder", "co-founded": "Co-founder", owned: "Owner", run: "Runs the business", headed: "Head of the business", started: "Founder", established: "Founder", managed: "Manager" })[m[1].toLowerCase()] || "Head of the business", "verified", "Official website text: \"" + clip(m[0], 120) + "\"");
  // "Dr. X, BDS, MDS": a named professional on the site, but whether they own or run it is not stated → unverified
  const cred = new RegExp(NAME + "\\s*,?\\s*\\(?((?:BDS|MDS|MBBS|MD|MS|BAMS|BHMS|MHA|MPT|BPT|DNB|FICOI|PhD|CA|LLB|LLM|B\\.?Arch|M\\.?Arch)(?:\\s*[,/&]\\s*(?:BDS|MDS|MBBS|MD|MS|BAMS|BHMS|MHA|MPT|BPT|DNB|FICOI|PhD|CA|LLB|LLM|B\\.?Arch|M\\.?Arch))*)\\b", "g");
  while ((m = cred.exec(txt)) && out.length < 8) push(m[1], "Professional (" + m[2].replace(/\\s+/g, " ") + "), ownership not stated", "unverified", "Official website text: \"" + clip(m[0], 120) + "\"");
  while ((m = a.exec(txt)) && out.length < 8) { const role = (m[0].match(new RegExp(ROLE, "i")) || [""])[0]; push(m[1], role, "verified", "Official website text: \"" + clip(m[0], 120) + "\""); }
  while ((m = b.exec(txt)) && out.length < 8) { const role = (m[0].match(new RegExp(ROLE, "i")) || [""])[0]; push(m[1], role, "verified", "Official website text: \"" + clip(m[0], 120) + "\""); }
  return out;
}
/* public web search for decision makers (search API results only; LinkedIn pages are never fetched) */
async function webSearch(env, d, q) {
  const prov = providers(env).search; if (!prov) return null;
  try {
    const r = prov === "serper"
      ? await outbound(env)("https://google.serper.dev/search", { method: "POST", headers: { "x-api-key": env.SERPER_API_KEY, "content-type": "application/json" }, body: JSON.stringify({ q, num: 10, gl: "in", hl: "en" }), signal: AbortSignal.timeout(12000) })
      : await outbound(env)("https://api.search.brave.com/res/v1/web/search?count=10&q=" + encodeURIComponent(q), { headers: { accept: "application/json", "x-subscription-token": env.BRAVE_API_KEY }, signal: AbortSignal.timeout(12000) });
    await usage(d, prov, r.ok); if (!r.ok) return { error: prov + " " + r.status + " " + clip(await r.text().catch(() => ""), 120) };
    return normSearch(prov, await r.json(), q);
  } catch (e) { await usage(d, prov, false); return { error: prov + ": " + String(e.message || e).slice(0, 120) }; }
}
const words = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(" ").filter((w) => w.length > 2 && !/^(the|and|pvt|ltd|private|limited|clinic|delhi|india|best|centre|center)$/.test(w));
export function peopleFromSearch(res, bizName) {
  const out = [], need = words(bizName); if (!res || !res.web) return out;
  res.web.forEach((r) => {
    const title = clip(r.title, 200), desc = clip(r.description, 300);
    const li = /linkedin\.com\/in\//i.test(r.url), roleM = (title + " " + desc).match(new RegExp(ROLE, "i"));
    if (!roleM) return;
    let name = li ? title.split(/\s[-–|]\s/)[0] : ""; name = okName(name.replace(/\s*\(.*$/, ""));
    if (!name) return;
    const hay = (title + " " + desc).toLowerCase(), hits = need.filter((w) => hay.indexOf(w) > -1).length;
    if (!need.length || hits < Math.min(2, need.length)) return;   // must mention the business
    out.push({ name, role: roleM[0], confidence: "partial", source_url: r.url, profile_url: li ? r.url : "", evidence: "Public search result: \"" + clip(title, 140) + "\"" });
  });
  return out.slice(0, 4);
}
/* emails in public search results: only addresses printed in a result that is about this business (its domain, or a title/snippet
   naming it); each keeps the result URL as its source and says it is NOT from the official website */
const GENERIC = /^(dental|dentist|dentists|dentistry|clinic|clinics|care|smile|smiles|hospital|centre|center|best|top|city|multispeciality|multispecialty|speciality|specialty|super|family|new|old|delhi|dwarka|noida|gurgaon|gurugram|india|indian|sector|rct|implant|implants|braces|skin|hair|health|healthcare|medical|med|the|and|for|near|me|in|of|pvt|ltd|private|limited|services|solutions|studio|group|home|real|estate|interior|interiors|restaurant|cafe|gym|fitness|salon|spa|academy|institute|coaching|school|law|associates|company|co)$/;
export const distinctive = (name, locality) => String(name || "").split(/\s[|\-–]\s|,|\(/)[0].toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 3 && !GENERIC.test(w) && w !== String(locality || "").toLowerCase());
/* emails in public search results. Kept only when the address itself carries every distinctive word of the business name
   (so "Dwarka Dental" never picks up another clinic's info@ayushmandental.com), or uses the business domain and that domain
   carries the name too (so a directory site listed as the "website" does not count). Source URL kept; marked not-from-website. */
export function emailsInResults(res, b) {
  const dom = b.domain || siteDomain(b.website), key = distinctive(b.name, b.locality || b.city), out = [], seen = new Set();
  if (!key.length) return out;   // a name made only of generic words cannot be matched safely
  const full = String(b.name || "").split(/\s[|\-\u2013]\s|,|\(/)[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  const domOk = dom && key.some((w) => dom.replace(/[^a-z0-9]/g, "").indexOf(w) > -1);
  ((res && res.web) || []).forEach((r) => {
    const txt = [r.title, r.description].concat(r.extra || []).join(" ");
    (txt.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []).forEach((raw) => {
      const e = cleanEmail(raw); if (!e || BAD_MAIL.test(e) || seen.has(e)) return;
      const flat = e.replace(/[^a-z0-9]/g, ""), onDomain = domOk && regDomain(e.split("@")[1]) === dom, carries = (full.length >= 6 && flat.indexOf(full) > -1) || (key.length >= 2 && key.every((w) => flat.indexOf(w) > -1));   // "dentalparadise" yes, "paradisedentalsmiles" no
      if (!onDomain && !carries) return;
      seen.add(e); out.push({ email: e, source: clip(r.url, 400), status: onDomain ? "public search result, uses the business's own domain (not on its website)" : "public search result, address carries the business name (not on its website), check before use" });
    });
  });
  return out.slice(0, 3);
}
async function emailsFromSearch(env, d, b) {
  if (!providers(env).search) return { error: "search API not configured" };
  const dom = b.domain || siteDomain(b.website), qs = (dom ? [dom + " email contact"] : []).concat(['"' + b.name.split(/\s[|\-\u2013]\s|,/)[0].trim().slice(0, 60) + '" ' + (b.locality || b.city || "") + " email"]), all = [];
  let lastErr = "";
  for (const q of qs) { const res = await webSearch(env, d, q); if (res && res.error) { lastErr = res.error; continue; } emailsInResults(res, b).forEach((e) => { if (!all.some((x) => x.email === e.email)) all.push(e); }); if (all.length) break; }
  return all.length || !lastErr ? { emails: all } : { error: lastErr, emails: all };
}
async function mxCheck(env, d, domain) {
  try {
    const r = await outbound(env)("https://cloudflare-dns.com/dns-query?type=MX&name=" + encodeURIComponent(domain), { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(6000) });
    await usage(d, "dns_mx", r.ok); if (!r.ok) return "not checked";
    const j = await r.json(); return (j.Answer || []).some((a) => a.type === 15) ? "domain accepts email (MX found)" : "no mail server found for the domain";
  } catch (e) { return "not checked"; }
}
async function pagespeed(env, d, url) {
  if (!env.PAGESPEED_API_KEY && env.LI_PAGESPEED !== "1") return null;
  try {
    const r = await outbound(env)("https://www.googleapis.com/pagespeedonline/v5/runPagespeed?strategy=mobile&category=performance&url=" + encodeURIComponent(url) + (env.PAGESPEED_API_KEY ? "&key=" + encodeURIComponent(env.PAGESPEED_API_KEY) : ""), { signal: AbortSignal.timeout(45000) });
    await usage(d, "pagespeed", r.ok); if (!r.ok) return { error: "PageSpeed " + r.status };
    const j = await r.json(), lh = j.lighthouseResult || {}, a = lh.audits || {};
    return { score: Math.round(((lh.categories || {}).performance || {}).score * 100), lcp: (a["largest-contentful-paint"] || {}).displayValue || "", cls: (a["cumulative-layout-shift"] || {}).displayValue || "" };
  } catch (e) { await usage(d, "pagespeed", false); return { error: "PageSpeed: " + String(e.message || e).slice(0, 100) }; }
}
/* the website audit: every check is an observation with its evidence */
export function auditHtml(page, extra) {
  const h = page.html || "", t = textOf(h), lower = h.toLowerCase(), url = page.url || "";
  const title = clip((h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1], 200), desc = clip((h.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) || h.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i) || [])[1], 400);
  const imgs = (h.match(/<img\b[^>]*>/gi) || []), noAlt = imgs.filter((i) => !/\balt=["'][^"']+["']/i.test(i)).length;
  const yr = (t.match(/(?:©|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/i) || [])[1];
  const c = {
    reachable: page.ok, status: page.status, https: /^https:/i.test(url), response_ms: page.ms, hsts: page.headers ? page.headers.hsts : false,
    viewport: /<meta[^>]+name=["']viewport["']/i.test(h), title, title_len: title.length, description: desc, description_len: desc.length,
    h1: (h.match(/<h1\b/gi) || []).length, canonical: /<link[^>]+rel=["']canonical["']/i.test(h), og: /property=["']og:/i.test(h), schema: /application\/ld\+json/i.test(h),
    images: imgs.length, images_no_alt: noAlt, words: t.split(/\s+/).length, html_kb: Math.round(h.length / 1024),
    contact_form: /<form\b[\s\S]{0,4000}?(type=["']email["']|type=["']tel["']|<textarea)/i.test(h),
    booking: /book (an )?appointment|book now|schedule (a )?(call|visit)|calendly\.com|practo\.com|setmore|zoho bookings|reserve a table|booking/i.test(t + " " + lower.slice(0, 200000)),
    whatsapp_link: /wa\.me\/|api\.whatsapp\.com/i.test(h), chat_widget: /tawk\.to|crisp\.chat|intercom|zoho salesiq|freshchat|tidio|livechat/i.test(lower),
    analytics: /gtag\(|googletagmanager\.com|google-analytics\.com|ga4/i.test(lower), meta_pixel: /connect\.facebook\.net\/[^"']*fbevents|fbq\(/i.test(lower), google_ads_tag: /\bAW-\d{6,}/.test(h),
    copyright_year: yr ? +yr : null, tables_layout: (h.match(/<table\b/gi) || []).length > 6 && !/<(header|nav|main|section)\b/i.test(h),
    socials: Object.keys((extra && extra.socials) || {}), broken_links: (extra && extra.broken) || [], pagespeed: (extra && extra.pagespeed) || null,
  };
  return c;
}
export function auditFindings(c, hasWebsite) {
  const F = [];   // [severity, text]
  if (!hasWebsite) return [["high", "No website listed for this business."]];
  if (!c.reachable) return [["high", "The website did not load (status " + (c.status || "no answer") + ")."]];
  if (!c.https) F.push(["high", "The site does not use HTTPS (no padlock)."]);
  if (!c.viewport) F.push(["high", "No mobile viewport tag: the site is likely not mobile-friendly."]);
  if (c.response_ms > 4000) F.push(["medium", "Slow first response: " + (c.response_ms / 1000).toFixed(1) + " s."]);
  if (c.pagespeed && c.pagespeed.score != null && c.pagespeed.score < 50) F.push(["high", "Google PageSpeed mobile score " + c.pagespeed.score + "/100."]);
  if (!c.title) F.push(["high", "Missing page title."]); else if (c.title_len < 20 || c.title_len > 65) F.push(["low", "Page title length " + c.title_len + " characters (aim for 30 to 60)."]);
  if (!c.description) F.push(["medium", "Missing meta description."]);
  if (!c.h1) F.push(["medium", "No H1 heading on the home page."]);
  if (!c.canonical) F.push(["low", "No canonical tag."]);
  if (!c.schema) F.push(["low", "No structured data (schema.org)."]);
  if (c.images > 3 && c.images_no_alt / c.images > 0.5) F.push(["low", c.images_no_alt + " of " + c.images + " images have no alt text."]);
  if (c.broken_links && c.broken_links.length) F.push(["medium", c.broken_links.length + " broken link(s), e.g. " + c.broken_links[0]]);
  if (!c.contact_form) F.push(["medium", "No contact or enquiry form found on the home/contact page."]);
  if (!c.booking) F.push(["low", "No online booking or appointment option found."]);
  if (!c.whatsapp_link && !c.chat_widget) F.push(["medium", "No WhatsApp or live chat on the site."]);
  if (!c.analytics) F.push(["medium", "No Google Analytics / Tag Manager found."]);
  if (!c.meta_pixel && !c.google_ads_tag) F.push(["low", "No Meta Pixel or Google Ads tag found (no ad tracking installed)."]);
  if (!c.socials.length) F.push(["medium", "No social media links on the website."]);
  if (c.copyright_year && c.copyright_year < new Date().getFullYear() - 2) F.push(["low", "Footer copyright year is " + c.copyright_year + " (site may not be maintained)."]);
  if (c.tables_layout) F.push(["low", "Old table-based layout."]);
  return F;
}

/* opportunities: rule-based from observations (kind "observed"); AI adds hypotheses (kind "ai") */
export function opportunities(b, c, ctx) {
  const O = [], add = (service, problem, evidence, why, value, angle) => O.push({ service, problem, evidence, why, value, angle, kind: "observed" });
  const nm = b.name;
  if (!b.website) add("Website design", "No website", "No website on its Google/OpenStreetMap listing", "Customers who search online cannot see services, prices or book.", "More enquiries from search and ads; a place to send ad traffic.", "Saw " + nm + " on Maps with good reviews but no website, so people who find you there have nowhere to go.");
  else if (c && !c.reachable) add("Website design", "Website down", "The site did not load (status " + (c.status || "no answer") + ")", "Every visitor from Maps or ads is lost.", "Recover lost leads immediately.", "Tried to visit " + b.website + " and it did not load.");
  if (c && c.reachable) {
    const tech = []; if (!c.https) tech.push("no HTTPS"); if (!c.viewport) tech.push("not mobile-friendly"); if (c.pagespeed && c.pagespeed.score < 50) tech.push("PageSpeed " + c.pagespeed.score + "/100"); if (c.tables_layout) tech.push("old layout");
    if (tech.length) add("Website redesign", "Outdated or weak website", tech.join(", "), "Most local searches are on phones; a slow or non-mobile site loses them.", "Higher conversion from existing traffic.", "Opened your site on a phone: " + tech.join(", ") + ".");
    const seo = []; if (!c.title) seo.push("no title"); if (!c.description) seo.push("no meta description"); if (!c.h1) seo.push("no H1"); if (!c.schema) seo.push("no structured data");
    if (seo.length >= 2) add("SEO", "Weak on-page SEO", seo.join(", "), "Google has little to rank the page for.", "More organic visits for service + area searches.", "Your home page has " + seo.join(", ") + ", which holds it back on Google.");
    if (!c.contact_form && !c.booking) add("Conversion rate optimization", "No way to enquire or book online", "No form or booking option found", "Visitors who are ready to act have to call or leave.", "More leads from the same traffic.", "There is no enquiry form or booking button on the site.");
    if (!c.whatsapp_link && !c.chat_widget) add("AI chatbot", "No instant chat", "No WhatsApp link or chat widget", "Fast replies win local leads, especially after hours.", "Answers and captures enquiries 24/7.", "No WhatsApp or chat on the site, so after-hours visitors leave.");
    if (!c.analytics) add("Analytics & tracking", "No analytics", "No Google Analytics/Tag Manager code", "Without data they cannot see which channel brings customers.", "Clear numbers for every rupee spent.", "Could not find analytics on the site.");
    if (!c.meta_pixel && !c.google_ads_tag) add("Google Ads / Meta Ads", "No ad tracking installed", "No Meta Pixel or Google Ads tag on the site (this does not prove they never advertise)", "Ads without tracking cannot be optimised or retargeted.", "Measurable leads from paid campaigns.", "Noticed there is no ad tracking set up, so ads (if any) cannot be measured.");
    if (!c.socials.length) add("Social media management", "No social presence linked", "No Instagram/Facebook/LinkedIn links on the website", "Buyers check social proof before calling.", "Trust and repeat visibility.", "Your website does not link to any social profiles.");
  }
  if (b.reviews != null && b.reviews >= 30 && (b.rating || 0) >= 4) add("Lead generation", "Strong reputation, room to grow", b.reviews + " Google reviews, rating " + b.rating, "A well-reviewed business converts paid traffic well.", "Scale enquiries with campaigns built on the reviews.", "Saw " + b.reviews + " reviews at " + b.rating + " stars on Google.");
  if (ctx && ctx.branches > 1) add("Business automation", "Multiple locations", ctx.branches + " listings with this name found", "Several branches need one lead inbox and follow-up system.", "No lead lost between branches.", "Noticed you have " + ctx.branches + " locations.");
  return O;
}

/* explainable score: 8 parts, each with points, max and the evidence behind it */
const TARGET = /dental|derma|skin|clinic|hospital|health|real estate|interior|restaurant|cafe|hotel|gym|fitness|salon|spa|education|school|coaching|institute|law|legal|ca firm|chartered|account|auto|car|e-?commerce|manufactur|it company|software|saas|logistic/i;
export function scoreLead(b, c, people, contacts, ctx) {
  const P = [], part = (key, label, max, pts, ev) => P.push({ key, label, max, points: Math.max(0, Math.min(max, Math.round(pts))), evidence: ev });
  // 1 website opportunity
  if (!b.website) part("website", "Website improvement opportunity", 15, 15, "No website listed");
  else if (!c) part("website", "Website improvement opportunity", 15, 0, "Not checked yet (run research)");
  else if (!c.reachable) part("website", "Website improvement opportunity", 15, 15, "Website did not load");
  else { const i = [!c.https && "no HTTPS", !c.viewport && "not mobile-friendly", c.response_ms > 4000 && "slow response", c.pagespeed && c.pagespeed.score < 50 && "PageSpeed " + c.pagespeed.score, c.tables_layout && "old layout", c.copyright_year && c.copyright_year < new Date().getFullYear() - 2 && "copyright " + c.copyright_year].filter(Boolean);
    part("website", "Website improvement opportunity", 15, i.length * 5, i.length ? i.join(", ") : "No major website problems found"); }
  // 2 SEO
  if (!c || !c.reachable) part("seo", "SEO opportunity", 15, !b.website ? 10 : 0, !b.website ? "No website, so no organic search presence" : "Not checked");
  else { const i = [!c.title && "no title", !c.description && "no meta description", !c.h1 && "no H1", !c.canonical && "no canonical", !c.schema && "no structured data", c.words < 250 && "thin content (" + c.words + " words)"].filter(Boolean);
    part("seo", "SEO opportunity", 15, i.length * 3, i.length ? i.join(", ") : "On-page basics are in place"); }
  // 3 advertising
  if (!c || !c.reachable) part("ads", "Advertising opportunity", 15, 0, "Not checked");
  else if (c.meta_pixel || c.google_ads_tag) part("ads", "Advertising opportunity", 15, 6, "Ad tracking installed (" + [c.meta_pixel && "Meta Pixel", c.google_ads_tag && "Google Ads tag"].filter(Boolean).join(", ") + "): they invest in ads, optimisation angle");
  else part("ads", "Advertising opportunity", 15, c.analytics ? 12 : 9, "No ad tracking on the site" + (c.analytics ? " (analytics present)" : ", no analytics either"));
  // 4 active / growing
  if (b.reviews == null) part("active", "Active / growing business", 15, 0, "No review data from the source");
  else { const p = (b.reviews >= 100 ? 10 : b.reviews >= 30 ? 6 : b.reviews >= 10 ? 3 : 0) + ((b.rating || 0) >= 4.2 ? 3 : 0) + (/OPERATIONAL/.test(b.biz_status || "") ? 2 : 0);
    part("active", "Active / growing business", 15, p, b.reviews + " Google reviews, rating " + (b.rating ?? "n/a") + (b.biz_status ? ", " + b.biz_status.toLowerCase() : "")); }
  // 5 branches
  part("branches", "Multiple branches or expansion", 10, ctx && ctx.branches > 1 ? 10 : 0, ctx && ctx.branches > 1 ? ctx.branches + " listings share this name" : "Only one location found");
  // 6 decision maker
  const best = (people || []).reduce((m, p) => Math.max(m, p.confidence === "verified" ? 3 : p.confidence === "partial" ? 2 : p.confidence === "unverified" ? 1 : 0), 0);
  part("people", "Public decision-maker information", 10, [0, 2, 6, 10][best], best ? (people.find((p) => p.confidence === ["", "unverified", "partial", "verified"][best]) || {}).name + " (" + ["", "unverified", "partially verified", "verified"][best] + ")" : "No decision maker found yet");
  // 7 marketing gaps
  if (!c || !c.reachable) part("gaps", "Marketing gaps", 10, 0, "Not checked");
  else { const i = [!c.socials.length && "no social links", !c.whatsapp_link && !c.chat_widget && "no WhatsApp/chat", !c.contact_form && "no enquiry form", !c.booking && "no booking"].filter(Boolean);
    part("gaps", "Marketing gaps", 10, Math.min(10, i.length * 3), i.length ? i.join(", ") : "No obvious gaps"); }
  // 8 FODO fit
  const fit = TARGET.test([b.industry, b.sub_industry, b.category, b.name].join(" ")), reach = (contacts || []).some((x) => x.kind === "email" || x.kind === "phone" || x.kind === "whatsapp");
  part("fit", "FODO service compatibility", 10, (fit ? 6 : 2) + (reach ? 4 : 0), [fit ? "target industry" : "industry outside FODO's focus list", reach ? "public contact available" : "no public contact yet"].join(", "));
  const total = P.reduce((s, p) => s + p.points, 0);
  return { total, priority: PRIORITY(total), parts: P };
}

async function aiRun(env, system, user, max) {
  if (!(env.AI && typeof env.AI.run === "function")) return null;
  for (const m of ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct"]) {
    try {
      const r = await Promise.race([env.AI.run(m, { messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: max || 500, temperature: 0.4 }), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 25000))]);
      const t = typeof r === "string" ? r : (r && (r.response || (r.result && r.result.response))) || "";
      if (t) return { text: String(t).replace(/[—–]/g, ", ").replace(/<[^>]*>/g, "").trim().slice(0, 3000), model: m };
    } catch (e) {}
  }
  return null;
}

/* research one business end to end (safe to repeat; replaces its previous research rows) */
export async function research(env, id, by) {
  const d = await ldb(env), b = await one(d, "SELECT * FROM li_businesses WHERE id=?1", String(id || ""));
  if (!b) throw err("Lead not found.", 404);
  const t = nowIso(), notes = [], people = [];
  let c = null, socials = {}, pages = [];
  if (b.website) {
    const home = await getPage(env, b.website, d); pages.push(home);
    if (home.ok && home.html) {
      const L = links(home.html, home.url), host = (() => { try { return new URL(home.url).hostname; } catch (e) { return ""; } })();
      const inner = L.filter((l) => { try { return new URL(l.href).hostname === host; } catch (e) { return false; } });
      const pick = (re) => (inner.find((l) => re.test(l.href) || re.test(l.text)) || {}).href;
      const more = [pick(/contact/i), pick(/about|story|who-we-are/i), pick(/team|founder|leadership|doctor|people/i)].filter((u, i, a) => u && a.indexOf(u) === i).slice(0, 3);
      for (const u of more) pages.push(await getPage(env, u, d));
      // broken links: HEAD/GET up to 6 internal links (status >= 400)
      const broken = [];
      for (const l of inner.filter((l) => more.indexOf(l.href) < 0).slice(0, 6)) { try { const { r } = await safeFetch(l.href, { method: "HEAD", headers: { "user-agent": UA } }, { timeout: 6000, env }); if (r.status >= 400 && r.status !== 405 && r.status !== 403) broken.push(l.href); } catch (e) {} }
      pages.forEach((pg) => { if (pg.ok) socials = Object.assign(socialsIn(pg.html, pg.url), socials); });
      c = auditHtml(home, { socials, broken, pagespeed: await pagespeed(env, d, home.url) });
      // a form, booking link or chat on the contact/about pages counts too (the home page is not the only place customers enquire)
      pages.slice(1).filter((x) => x.ok).forEach((pg) => { const o = auditHtml(pg, {}); c.contact_form = c.contact_form || o.contact_form; c.booking = c.booking || o.booking; c.whatsapp_link = c.whatsapp_link || o.whatsapp_link; c.chat_widget = c.chat_widget || o.chat_widget; });
    } else c = auditHtml(home, {});
    for (const pg of pages.filter((x) => x.ok)) {
      await run(d, "INSERT OR REPLACE INTO li_sources (business_id, url, kind, http, at) VALUES (?1,?2,'website',?3,?4)", b.id, pg.url, pg.status, t);
      for (const e of emailsIn(pg.html)) await addContact(d, b.id, "email", mailKind(e), e, pg.url, "found on official website");
      for (const ph of phonesIn(pg.html)) await addContact(d, b.id, "phone", "Business phone", ph, pg.url, "found on official website");
      for (const w of whatsappIn(pg.html)) await addContact(d, b.id, "whatsapp", "WhatsApp", w, pg.url, "WhatsApp link on official website");
      peopleIn(pg.html, pg.url).forEach((x) => people.push(x));
    }
    for (const [k, v] of Object.entries(socials)) await addContact(d, b.id, k, { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", x: "X", youtube: "YouTube" }[k], v, b.website, "linked from official website");
    // people linked from the site without a role → unverified
    pages.filter((x) => x.ok).forEach((pg) => links(pg.html, pg.url).filter((l) => /linkedin\.com\/in\//i.test(l.href)).slice(0, 3).forEach((l) => { const n = okName(l.text); if (n && !people.some((p) => p.name === n)) people.push({ name: n, role: "Linked profile (role not stated)", confidence: "unverified", source_url: pg.url, profile_url: l.href, evidence: "Personal LinkedIn link on the official website" }); }));
  } else notes.push("No website: contacts and audit come from the listing only.");
  if (!people.some((p) => p.confidence === "verified")) {
    const res = await webSearch(env, d, '"' + b.name + '" ' + (b.city || b.locality || "") + " founder OR owner OR CEO OR director");
    if (res && res.error) notes.push("Search API: " + res.error); else if (res) peopleFromSearch(res, b.name).forEach((x) => people.push(x)); else notes.push("Search API not configured: decision makers come from the website only.");
  }
  for (const p of people) await run(d, "INSERT OR REPLACE INTO li_people (business_id, name, role, profile_url, confidence, source_url, evidence, found_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)", b.id, p.name, p.role, clip(p.profile_url, 400), p.confidence, clip(p.source_url, 400), p.evidence, t);
  // no email on the website → look in public search results (business domain first, then listings that name the business)
  await run(d, "DELETE FROM li_contacts WHERE business_id=?1 AND kind='email' AND status LIKE 'public search result%'", b.id);   // re-checked every run
  if (!(await one(d, "SELECT 1 AS x FROM li_contacts WHERE business_id=?1 AND kind='email'", b.id))) {
    const found = await emailsFromSearch(env, d, b);
    if (found.error) notes.push("Email search: " + found.error);
    for (const e of found.emails || []) await addContact(d, b.id, "email", mailKind(e.email), e.email, e.source, e.status);
    if (found.emails && !found.emails.length && !found.error) notes.push("No public email found on the website or in search results.");
  }
  // email domain check (MX); never upgrades an address to "verified"
  const contacts = await all(d, "SELECT * FROM li_contacts WHERE business_id=?1", b.id);
  const doms = [...new Set(contacts.filter((x) => x.kind === "email").map((x) => x.value.split("@")[1]))].slice(0, 3);
  for (const dm of doms) { const st = await mxCheck(env, d, dm); await run(d, "UPDATE li_contacts SET status=status || ' · ' || ?3, checked_at=?4 WHERE business_id=?1 AND kind='email' AND value LIKE ?2 AND status NOT LIKE '%MX%' AND status NOT LIKE '%mail server%'", b.id, "%@" + dm, st, t); }
  const contacts2 = await all(d, "SELECT * FROM li_contacts WHERE business_id=?1", b.id);
  const branches = b.name_key ? ((await one(d, "SELECT COUNT(*) AS n FROM li_businesses WHERE substr(name_key,1,instr(name_key,'|'))=?1", b.name_key.split("|")[0] + "|")) || {}).n || 1 : 1;
  const ctx = { branches };
  const allPeople = await all(d, "SELECT * FROM li_people WHERE business_id=?1", b.id);
  const sc = scoreLead(b, c, allPeople, contacts2, ctx), findings = c ? auditFindings(c, !!b.website) : auditFindings({}, false);
  const opps = opportunities(b, c, ctx);
  const summary = findings.length ? findings.map((f) => f[1]).join(" ") : "No problems found in the automatic checks.";
  const ai = await aiRun(env, "You are a marketing analyst at FODO, a digital growth agency in New Delhi. Write in plain English for the FODO sales team. Use ONLY the facts given. Never invent numbers, ads, people or claims. If something was not checked, say so. No markdown, no long dashes.",
    "Business: " + b.name + " (" + [b.category, b.locality, b.city].filter(Boolean).join(", ") + ")\nWebsite: " + (b.website || "none") + "\nObserved problems: " + summary + "\nGoogle reviews: " + (b.reviews ?? "unknown") + ", rating " + (b.rating ?? "unknown") +
    "\nWrite: (1) a 3 sentence summary of the real problems, (2) up to 3 hypotheses about marketing opportunities, each starting with 'Hypothesis:' and saying what would confirm it.", 450);
  await run(d, "INSERT OR REPLACE INTO li_audits (business_id, url, data, summary, ai_summary, ai_model, at) VALUES (?1,?2,?3,?4,?5,?6,?7)", b.id, c ? (pages[0] || {}).url || b.website : "", JSON.stringify(Object.assign({}, c || {}, { findings, notes, pages: pages.map((x) => ({ url: x.url, status: x.status, ms: x.ms, error: x.error })) })), summary, ai ? ai.text : null, ai ? ai.model : null, t);
  await run(d, "DELETE FROM li_opps WHERE business_id=?1", b.id);
  for (const o of opps) await run(d, "INSERT INTO li_opps (business_id, service, problem, evidence, why, value, angle, kind, at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)", b.id, o.service, o.problem, o.evidence, o.why, o.value, o.angle, o.kind, t);
  await run(d, "INSERT INTO li_scores (business_id, total, parts, at) VALUES (?1,?2,?3,?4)", b.id, sc.total, JSON.stringify(sc.parts), t);
  const top = allPeople.sort((x, y) => "verified,partial,unverified".indexOf(x.confidence) - "verified,partial,unverified".indexOf(y.confidence))[0];
  const mail = contacts2.find((x) => x.kind === "email"), wa = contacts2.find((x) => x.kind === "whatsapp");
  await run(d, "UPDATE li_businesses SET score=?2, priority=?3, owner_name=?4, owner_role=?5, owner_conf=?6, email=?7, whatsapp=?8, researched_at=?9, verified_at=?9, updated_at=?9, status=CASE WHEN status='new' THEN 'not_contacted' ELSE status END WHERE id=?1",
    b.id, sc.total, sc.priority, top ? top.name : null, top ? top.role : null, top ? top.confidence : (b.website ? "not_found" : "not_found"), mail ? mail.value : null, wa ? wa.value : null, t);
  await act(d, "research", b.id, "Score " + sc.total + " (" + sc.priority + "), " + allPeople.length + " people, " + contacts2.length + " contacts", by);
  return lead(env, b.id);
}

/* ---------------- read / list / edit ---------------- */
export async function lead(env, id) {
  const d = await ldb(env), b = await one(d, "SELECT * FROM li_businesses WHERE id=?1", String(id || "")); if (!b) throw err("Lead not found.", 404);
  const au = await one(d, "SELECT * FROM li_audits WHERE business_id=?1", b.id), sc = await one(d, "SELECT * FROM li_scores WHERE business_id=?1 ORDER BY id DESC LIMIT 1", b.id);
  const unsub = b.email ? !!(await one(d, "SELECT email FROM camp_unsub WHERE email=?1", b.email).catch(() => null)) : false;
  const contacts = await all(d, "SELECT kind,label,value,source_url,status,checked_at FROM li_contacts WHERE business_id=?1 ORDER BY kind", b.id);
  const people = await all(d, "SELECT name,role,profile_url,confidence,source_url,evidence,found_at FROM li_people WHERE business_id=?1 ORDER BY CASE confidence WHEN 'verified' THEN 0 WHEN 'partial' THEN 1 ELSE 2 END", b.id);
  return { lead: b, contacts, channels: channelsOf(b, contacts, people), replies: await repliesOf(d, b, contacts),
    people,
    audit: au ? Object.assign({ at: au.at, url: au.url, summary: au.summary, ai_summary: au.ai_summary, ai_model: au.ai_model }, { checks: J(au.data, {}) }) : null,
    opportunities: await all(d, "SELECT service,problem,evidence,why,value,angle,kind FROM li_opps WHERE business_id=?1", b.id),
    score: sc ? { total: sc.total, parts: J(sc.parts, []), at: sc.at } : null,
    history: await all(d, "SELECT from_status,to_status,channel,note,by_email,at FROM li_outreach WHERE business_id=?1 ORDER BY id DESC LIMIT 50", b.id),
    sources: await all(d, "SELECT url, kind, http, at FROM li_sources WHERE business_id=?1", b.id), opted_out: unsub,
    inbox: await all(d, "SELECT channel, from_addr, subject, text, at, source, by_email FROM li_replies WHERE business_id=?1 ORDER BY at DESC LIMIT 20", b.id).catch(() => []) };
}
const SORTS = { score: "COALESCE(score,-1) DESC", newest: "created_at DESC", name: "name COLLATE NOCASE", updated: "updated_at DESC", reviews: "COALESCE(reviews,-1) DESC" };
export async function list(env, q) {
  const d = await ldb(env); q = q || {}; const w = [], a = [];
  try { await syncSent(env, d); } catch (e) {}
  const add = (sql, v) => { a.push(v); w.push(sql.replace(/\?/g, "?" + a.length)); };
  if (q.archived === "1") w.push("archived=1"); else w.push("archived=0");
  if (q.q) { const s = "%" + clip(q.q, 80).toLowerCase() + "%"; a.push(s); const n = a.length; w.push("(lower(name) LIKE ?" + n + " OR lower(COALESCE(website,'')) LIKE ?" + n + " OR lower(COALESCE(owner_name,'')) LIKE ?" + n + " OR lower(COALESCE(email,'')) LIKE ?" + n + " OR lower(id) LIKE ?" + n + ")"); }
  if (q.industry) add("industry=?", clip(q.industry, 80));
  if (q.city) add("lower(city)=?", clip(q.city, 80).toLowerCase());
  if (q.status) add("status=?", clip(q.status, 30));
  if (q.priority) add("priority=?", clip(q.priority, 10));
  if (q.source) add("source=?", clip(q.source, 30));
  if (q.list) add("source_ref=?", clip(q.list, 80));   /* v55.29 one imported client database */
  if (q.echeck === "none") w.push("email_check IS NULL AND COALESCE(email,'')<>''"); else if (q.echeck === "bad") w.push("email_check IN ('invalid','test','blocked')"); else if (q.echeck) add("email_check=?", clip(q.echeck, 12));
  if (q.website === "has") w.push("COALESCE(website,'')<>''"); if (q.website === "none") w.push("COALESCE(website,'')=''");
  if (q.people) add("owner_conf=?", clip(q.people, 20));
  if (q.researched === "1") w.push("researched_at IS NOT NULL"); if (q.researched === "0") w.push("researched_at IS NULL");
  if (q.min) add("COALESCE(score,0)>=?", +q.min || 0);
  if (q.from) add("created_at>=?", clip(q.from, 10)); if (q.to) add("created_at<=?", clip(q.to, 10) + "T99");
  /* v55.34 Leads & clients shows who is still to contact; once a lead is emailed or messaged it moves to Sent leads. A chosen status wins. */
  let stageCounts = null;
  if ((q.stage === "open" || q.stage === "contacted") && !q.status) {
    const bw = w.length ? " WHERE " + w.join(" AND ") : "";
    const c = (await one(d, "SELECT COUNT(*) AS n, SUM(CASE WHEN status IN ('new','not_contacted') THEN 1 ELSE 0 END) AS o FROM li_businesses" + bw, ...a)) || {};
    stageCounts = { open: c.o || 0, contacted: (c.n || 0) - (c.o || 0) };
    w.push(q.stage === "open" ? "status IN ('new','not_contacted')" : "status NOT IN ('new','not_contacted')");
  }
  const where = w.length ? " WHERE " + w.join(" AND ") : "", lim = Math.max(1, Math.min(1000, +q.limit || 200)), page = Math.max(1, Math.min(100000, parseInt(q.page, 10) || 1));
  const rows = await all(d, "SELECT id,name,industry,sub_industry,category,locality,city,website,phone,email,whatsapp,owner_name,owner_role,owner_conf,score,priority,status,source,source_ref,email_check,email_reason,rating,reviews,researched_at,created_at,updated_at,archived FROM li_businesses" + where + " ORDER BY " + (SORTS[q.sort] || SORTS.score) + ", id LIMIT " + lim + " OFFSET " + (page - 1) * lim, ...a);
  const total = ((await one(d, "SELECT COUNT(*) AS n FROM li_businesses" + where, ...a)) || {}).n || 0;
  const S = await sentMap(d, rows.map((r) => r.email)); rows.forEach((r) => { const m = r.email && S[String(r.email).toLowerCase()]; if (m) { if (m.at) { r.sent_at = m.at; r.sent_via = m.via; } if (m.seen_at) { r.seen_at = m.seen_at; r.seen_last = m.seen_last; r.opens = m.opens; } } });
  const miss = rows.filter((r) => !r.sent_at && r.status === "email_sent").map((r) => r.id);
  if (miss.length) { try { const H = {}; ((await d.prepare("SELECT business_id AS b, MAX(at) AS at FROM li_outreach WHERE to_status='email_sent' AND business_id IN (SELECT value FROM json_each(?1)) GROUP BY business_id").bind(JSON.stringify(miss)).all()).results || []).forEach((h) => { H[h.b] = h.at; }); rows.forEach((r) => { if (!r.sent_at && H[r.id]) { r.sent_at = H[r.id]; r.sent_via = "Lead page"; } }); } catch (e) {} }
  return { leads: rows, total, page, pages: Math.max(1, Math.ceil(total / lim)), per: lim, stages: stageCounts };
}
/* v55.32 which of these emails already got an email from FODO (lead emails, client emails, Bulk pitch, Email campaigns); tests excluded */
async function sentMap(d, emails) {
  const E = [...new Set(emails.filter(Boolean).map((e) => String(e).toLowerCase()))], out = {}; if (!E.length) return out;
  const put = (e, at, via) => { e = String(e || "").toLowerCase(); if (e && (!out[e] || String(at) > String(out[e].at))) out[e] = { at, via }; };
  const Q = [["SELECT email AS e, MAX(at) AS at FROM cm_sends WHERE status='sent' AND COALESCE(test,0)=0 AND lower(email) IN (SELECT value FROM json_each(?1)) GROUP BY lower(email)", "Email"],
    ["SELECT email AS e, MAX(at) AS at FROM cm_pitch_rcpt WHERE status='sent' AND lower(email) IN (SELECT value FROM json_each(?1)) GROUP BY lower(email)", "Bulk pitch"],
    ["SELECT email AS e, MAX(sent_at) AS at FROM camp_recips WHERE status='sent' AND lower(email) IN (SELECT value FROM json_each(?1)) GROUP BY lower(email)", "Email campaign"]];
  for (const [sql, via] of Q) { try { ((await d.prepare(sql).bind(JSON.stringify(E)).all()).results || []).forEach((r) => put(r.e, r.at, via)); } catch (e) { /* that product's tables are not set up yet */ } }
  try { ((await d.prepare("SELECT lower(email) AS e, MAX(opened_at) AS o, MAX(last_open) AS l, SUM(COALESCE(opens,0)) AS n FROM cm_sends WHERE status='sent' AND COALESCE(test,0)=0 AND opened_at IS NOT NULL AND lower(email) IN (SELECT value FROM json_each(?1)) GROUP BY lower(email)").bind(JSON.stringify(E)).all()).results || [])
    .forEach((r) => { out[r.e] = Object.assign(out[r.e] || {}, { seen_at: r.o, seen_last: r.l, opens: r.n }); }); } catch (e) {}   /* v55.35 opened */
  return out;
}
/* leads still "New / Not contacted" whose email was already sent from another FODO tool move to "Email sent" (at most every 5 minutes) */
export async function syncSent(env, d, force) {
  if (!force && env.CHAT_KV && (await env.CHAT_KV.get("li:sentsync"))) return 0; if (env.CHAT_KV) await env.CHAT_KV.put("li:sentsync", "1", { expirationTtl: 300 });
  let n = 0; const t = nowIso();
  for (const src of ["SELECT lower(email) FROM cm_sends WHERE status='sent' AND COALESCE(test,0)=0", "SELECT lower(email) FROM cm_pitch_rcpt WHERE status='sent'", "SELECT lower(email) FROM camp_recips WHERE status='sent'"]) {
    try { const r = await d.prepare("UPDATE li_businesses SET status='email_sent', updated_at=?1 WHERE status IN ('new','not_contacted') AND COALESCE(email,'')<>'' AND lower(email) IN (" + src + ")").bind(t).run(); n += (r.meta && r.meta.changes) || 0; } catch (e) {}
  }
  return n;
}
export async function update(env, id, b, by) {
  const d = await ldb(env), cur = await one(d, "SELECT * FROM li_businesses WHERE id=?1", String(id || "")); if (!cur) throw err("Lead not found.", 404); b = b || {};
  const f = {}; ["name", "industry", "sub_industry", "locality", "city", "state", "notes"].forEach((k) => { if (b[k] != null) f[k] = clip(b[k], k === "notes" ? 4000 : 160); });
  if (b.website != null) { f.website = /^https?:\/\//i.test(b.website) ? clip(b.website, 300) : ""; f.domain = siteDomain(f.website); }
  if (b.phone != null) { f.phone = clip(b.phone, 40); f.phone_key = phoneKey(f.phone); }
  if (b.archived != null) f.archived = b.archived ? 1 : 0;
  if (b.status != null) { if (ST.indexOf(b.status) < 0) throw err("Unknown status."); f.status = b.status;
    if (b.status !== cur.status) await run(d, "INSERT INTO li_outreach (business_id, from_status, to_status, channel, note, by_email, at) VALUES (?1,?2,?3,?4,?5,?6,?7)", cur.id, cur.status, b.status, clip(b.channel, 30), clip(b.note, 500), clip(by, 254), nowIso()); }
  const keys = Object.keys(f); if (!keys.length) return lead(env, cur.id);
  await run(d, "UPDATE li_businesses SET " + keys.map((k, i) => k + "=?" + (i + 2)).join(", ") + ", updated_at=?" + (keys.length + 2) + " WHERE id=?1", cur.id, ...keys.map((k) => f[k]), nowIso());
  await act(d, "edit", cur.id, keys.join(","), by);
  return lead(env, cur.id);
}
export async function bulk(env, b, by) {
  const d = await ldb(env); b = b || {}; const ids = (Array.isArray(b.ids) ? b.ids : []).map((x) => clip(x, 20)).filter(Boolean).slice(0, 500);
  if (!ids.length) throw err("Select at least one lead.");
  let n = 0;
  for (const id of ids) {
    if (b.action === "delete") { for (const t of ["li_contacts", "li_people", "li_audits", "li_opps", "li_scores", "li_outreach", "li_sources"]) await run(d, "DELETE FROM " + t + " WHERE business_id=?1", id); const r = await run(d, "DELETE FROM li_businesses WHERE id=?1", id); n += (r.meta && r.meta.changes) || 0; }
    else if (b.action === "archive" || b.action === "unarchive") { const r = await run(d, "UPDATE li_businesses SET archived=?2, updated_at=?3 WHERE id=?1", id, b.action === "archive" ? 1 : 0, nowIso()); n += (r.meta && r.meta.changes) || 0; }
    else if (b.action === "status") { await update(env, id, { status: b.status }, by); n++; }
    else throw err("Unknown bulk action.");
  }
  await act(d, "bulk_" + b.action, null, n + " leads", by);
  return { changed: n };
}
/* duplicate report: groups that share a domain, phone or name key */
export async function duplicates(env) {
  const d = await ldb(env), out = [];
  for (const [k, label] of [["domain", "website domain"], ["phone_key", "phone"], ["name_key", "name + city"]]) {
    const g = await all(d, "SELECT " + k + " AS v, COUNT(*) AS n, group_concat(id) AS ids, group_concat(name, ' | ') AS names FROM li_businesses WHERE COALESCE(" + k + ",'')<>'' AND archived=0 GROUP BY " + k + " HAVING n>1 LIMIT 50");
    g.forEach((x) => out.push({ by: label, value: x.v, count: x.n, ids: String(x.ids).split(","), names: x.names }));
  }
  return { groups: out };
}
export async function exportRows(env, q) {
  const L = (await list(env, Object.assign({}, q, { limit: 1000 }))).leads, d = await ldb(env);
  const ids = q && q.ids ? String(q.ids).split(",") : null, rows = ids ? L.filter((x) => ids.indexOf(x.id) > -1) : L, out = [];
  for (const x of rows) {
    const cs = await all(d, "SELECT kind, value FROM li_contacts WHERE business_id=?1", x.id), get = (k) => cs.filter((c) => c.kind === k).map((c) => c.value).join(" ; ");
    const opps = await all(d, "SELECT service FROM li_opps WHERE business_id=?1", x.id), au = await one(d, "SELECT summary FROM li_audits WHERE business_id=?1", x.id);
    out.push({ "Lead ID": x.id, Business: x.name, Industry: [x.industry, x.sub_industry].filter(Boolean).join(" / "), Location: [x.locality, x.city].filter(Boolean).join(", "), Website: x.website || "",
      "Founder/owner": x.owner_name || "", Designation: x.owner_role || "", "Founder confidence": x.owner_conf || "", Email: get("email"), Phone: get("phone"), WhatsApp: get("whatsapp"),
      Instagram: get("instagram"), Facebook: get("facebook"), LinkedIn: get("linkedin"), "Google Maps": get("maps"), "Website audit": au ? au.summary : "", "Recommended services": [...new Set(opps.map((o) => o.service))].join(", "),
      Score: x.score ?? "", Priority: x.priority ? PRIORITY_LABEL[x.priority] : "", Source: x.source, "Last verified": x.researched_at || "", Status: (STATUSES.find((s) => s[0] === x.status) || ["", x.status])[1], Rating: x.rating ?? "", Reviews: x.reviews ?? "" });
  }
  return { rows: out };
}


/* ---------------- outreach desk: where this business can be messaged (only contacts we actually found) ---------------- */
export const waNumber = (v) => { const g = String(v || "").replace(/\D/g, ""); if (/wa\.me|whatsapp/i.test(v || "") && g.length >= 10) return g.length === 10 ? "91" + g : g;
  const t = g.slice(-10); return t.length === 10 && /^[6-9]/.test(t) && (g.length === 10 || /^(91|091|0)$/.test(g.slice(0, -10))) ? "91" + t : ""; };   // Indian mobiles only; landlines have no WhatsApp
export function channelsOf(b, contacts, people) {
  const C = contacts || [], out = [], get = (k) => C.filter((c) => c.kind === k);
  const wa = get("whatsapp").map((c) => waNumber(c.value)).concat(get("phone").map((c) => waNumber(c.value))).filter(Boolean);
  if (wa.length) out.push({ channel: "whatsapp", label: "WhatsApp", target: wa[0], note: get("whatsapp").length ? "WhatsApp link on the website" : "mobile number from the listing / website (WhatsApp not confirmed)" });
  const mail = get("email").sort((a, c) => (/official website/.test(c.status) ? 1 : 0) - (/official website/.test(a.status) ? 1 : 0))[0];
  if (mail) out.push({ channel: "email", label: "Email", target: mail.value, note: mail.status || "" });
  const lp = (people || []).find((p) => /linkedin\.com\/in\//.test(p.profile_url || "") && p.confidence !== "unverified");
  if (lp) out.push({ channel: "linkedin", label: "LinkedIn (" + lp.name + ")", target: lp.profile_url, note: lp.role });
  else if (get("linkedin")[0]) out.push({ channel: "linkedin", label: "LinkedIn page", target: get("linkedin")[0].value, note: "company page" });
  [["instagram", "Instagram"], ["facebook", "Facebook"], ["x", "X"]].forEach(([k, l]) => { if (get(k)[0]) out.push({ channel: k, label: l, target: get(k)[0].value, note: get(k)[0].status || "" }); });
  return out;
}
/* replies: enquiries (website form, Instagram / Facebook DMs) whose email or phone matches this business */
async function repliesOf(d, b, contacts) {
  try {
    const mails = contacts.filter((c) => c.kind === "email").map((c) => c.value.toLowerCase()), phones = contacts.filter((c) => /phone|whatsapp/.test(c.kind)).map((c) => phoneKey(c.value)).concat([b.phone_key]).filter(Boolean);
    if (!mails.length && !phones.length) return [];
    const rows = await all(d, "SELECT id, name, email, phone, source, status, created_at FROM fodo_leads ORDER BY created_at DESC LIMIT 2000");
    return rows.filter((r) => (r.email && mails.indexOf(String(r.email).toLowerCase()) > -1) || (r.phone && phones.indexOf(phoneKey(r.phone)) > -1)).slice(0, 10);
  } catch (e) { return []; }
}
const SENT_STATUS = { email: "email_sent", whatsapp: "contacted", instagram: "contacted", facebook: "contacted", linkedin: "contacted", x: "contacted", call: "called" };
/* the person sent the message from their own app; we only record it (and move New / Not contacted forward) */
export async function logSent(env, id, b, by) {
  const d = await ldb(env), L = await lead(env, id), x = L.lead; b = b || {};
  const ch = Object.keys(SENT_STATUS).indexOf(b.channel) > -1 ? b.channel : ""; if (!ch) throw err("Unknown channel.");
  if (x.status === "dnc" || L.opted_out) throw err("This business is marked Do not contact (or opted out).", 409);
  const to = ["new", "not_contacted", "contacted"].indexOf(x.status) > -1 && !(x.status === "contacted" && SENT_STATUS[ch] === "contacted") ? SENT_STATUS[ch] : x.status;
  await run(d, "INSERT INTO li_outreach (business_id, from_status, to_status, channel, note, by_email, at) VALUES (?1,?2,?3,?4,?5,?6,?7)", x.id, x.status, to, ch, clip(b.note || "Message sent on " + ch, 500), clip(by, 254), nowIso());
  if (to !== x.status) await run(d, "UPDATE li_businesses SET status=?2, updated_at=?3 WHERE id=?1", x.id, to, nowIso());
  await act(d, "sent_" + ch, x.id, clip(b.note, 200), by);
  return lead(env, x.id);
}
/* ---------------- v55.16 Sent & replies ----------------
   Every message logged as sent (email from here, or WhatsApp / Instagram / Facebook / LinkedIn / X sent from the person's own app and
   logged with "Did you send it?") in one list, with the replies next to it. Email replies are read from FODO's Gmail mailbox
   (Admin ▸ Studio ▸ Inbox, the inbox replies go to): a message FROM the address we emailed, after we emailed it, is that
   business's reply. Nothing else is read. Replies on WhatsApp / Instagram / Facebook / LinkedIn stay in those apps (they are
   not connected), so the person marks them with "Got a reply" and can paste the text. A "STOP" reply opts the address out. */
const SENT_CH = Object.keys(SENT_STATUS);
const CH_LABEL = { email: "Email", whatsapp: "WhatsApp", instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", x: "X", call: "Call" };
const REPLY_FROM = ["new", "not_contacted", "contacted", "email_sent"];
export const isStopReply = (t) => /^\s*(stop|unsubscribe|remove me|please remove|do not contact|don'?t contact)\b/i.test(String(t || ""));
const unEnt = (s) => String(s || "").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
async function addReply(d, x, o, by) {
  if (await one(d, "SELECT id FROM li_replies WHERE business_id=?1 AND ref=?2", x.id, o.ref)) return false;
  const t = nowIso(), stop = o.channel === "email" && isStopReply(o.text);
  await run(d, "INSERT OR IGNORE INTO li_replies (business_id, channel, from_addr, subject, text, at, source, ref, by_email, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
    x.id, o.channel, clip(o.from, 254), clip(o.subject, 200), clip(o.text, 1500), o.at || t, o.source, o.ref, clip(by, 254), t);
  if (stop && o.from) await run(d, "INSERT OR IGNORE INTO camp_unsub (email, at, why) VALUES (?1,?2,'replied STOP to Lead Intelligence email')", cleanEmail(o.from) || o.from, t).catch(() => {});
  const to = stop ? "dnc" : REPLY_FROM.indexOf(x.status) > -1 ? "replied" : x.status;
  await run(d, "INSERT INTO li_outreach (business_id, from_status, to_status, channel, note, by_email, at) VALUES (?1,?2,?3,'reply',?4,?5,?6)", x.id, x.status, to,
    clip((CH_LABEL[o.channel] || o.channel) + " reply" + (stop ? " (asked to stop, opted out)" : "") + (o.text ? ": " + o.text : ""), 500), clip(by || "Gmail check", 254), t);
  if (to !== x.status) await run(d, "UPDATE li_businesses SET status=?2, updated_at=?3 WHERE id=?1", x.id, to, t);
  await act(d, "reply_" + o.channel, x.id, clip(o.text, 200), by);
  x.status = to; return true;
}
/* "Got a reply" for apps we cannot read (WhatsApp, Instagram, Facebook, LinkedIn, X, a call), or an email reply that came elsewhere */
export async function markReplied(env, id, b, by) {
  const d = await ldb(env), x = (await lead(env, id)).lead; b = b || {};
  const ch = SENT_CH.indexOf(b.channel) > -1 ? b.channel : ""; if (!ch) throw err("Pick where the reply came (WhatsApp, Instagram, Facebook, LinkedIn, X, Email or Call).");
  await addReply(d, x, { channel: ch, text: clip(b.text, 1500), from: "", subject: "", at: nowIso(), source: "manual", ref: "m:" + randId(12) }, by);
  return lead(env, x.id);
}
/* the Gmail mailbox that receives replies (tests inject a fake through env.LI_GMAIL_MOCK in test mode only) */
async function gmailFor(env) {
  if (env.XRAY_TEST_MODE === "1" && env.LI_GMAIL_MOCK) return env.LI_GMAIL_MOCK;
  try {
    const IB = await import("./sinbox.js"), s = await IB.status(env); if (!s.connected || !s.account) return null;
    const GO = await import("./brain/google.js"); return { account: s.account, get: (url) => GO.g(env, s.account, url) };
  } catch (e) { return null; }
}
const KV_CHK = "li:replycheck";
async function lastCheck(env) { try { return env.CHAT_KV ? JSON.parse((await env.CHAT_KV.get(KV_CHK)) || "null") : null; } catch (e) { return null; } }
export async function checkReplies(env, by) {
  const d = await ldb(env), gm = await gmailFor(env);
  if (!gm) throw err("Email reply tracking needs FODO's Gmail mailbox connected: open Admin ▸ Studio ▸ Inbox and log in with Google as anmol@fodo.co.in.", 409);
  const OR = await import("./outreach.js"), cm = await OR.cmDb(env), since = new Date(Date.now() - 120 * 864e5).toISOString();
  const sent = await all(cm, "SELECT client_id, email, MIN(at) first_at FROM cm_sends WHERE campaign_id='lead-intel' AND test=0 AND status='sent' AND at > ?1 GROUP BY client_id, email ORDER BY MAX(at) DESC LIMIT 60", since);
  const GENERIC_D = /^(gmail|yahoo|ymail|hotmail|outlook|live|icloud|rediffmail|aol|proton|protonmail|zoho)\./i;
  let checked = 0, found = 0; const errors = [];
  for (const s of sent) {
    const x = await one(d, "SELECT id, status, domain FROM li_businesses WHERE id=?1", s.client_id); if (!x || !s.email) continue;
    const dom = s.email.split("@")[1] || "", own = !!(x.domain && dom === x.domain && !GENERIC_D.test(dom));   // the business's own domain: a colleague's reply counts too
    const after = Math.floor(Date.parse(s.first_at) / 1000) - 60, q = "from:" + (own ? dom : s.email) + " after:" + after;
    let L; try { L = await gm.get("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=" + encodeURIComponent(q)); } catch (e) { errors.push(s.email + ": " + String(e.message || e).slice(0, 120)); if (errors.length > 3) break; continue; }
    checked++;
    for (const m of (L.messages || []).slice(0, 5)) {
      if (await one(d, "SELECT id FROM li_replies WHERE business_id=?1 AND ref=?2", x.id, "gmail:" + m.id)) continue;
      let g; try { g = await gm.get("https://gmail.googleapis.com/gmail/v1/users/me/messages/" + encodeURIComponent(m.id) + "?format=metadata&metadataHeaders=From&metadataHeaders=Subject"); } catch (e) { continue; }
      const H = (n) => (((g.payload && g.payload.headers) || []).find((h) => h.name.toLowerCase() === n) || {}).value || "";
      const from = (/<([^>]+)>/.exec(H("from")) || [])[1] || H("from"), fe = cleanEmail(from) || "";
      if (!(fe === s.email || (own && fe.endsWith("@" + dom)))) continue;   // Gmail search is fuzzy; keep only that sender
      if (gm.account && fe === String(gm.account).toLowerCase()) continue;
      if (await addReply(d, x, { channel: "email", from: fe, subject: H("subject"), text: clip(unEnt(g.snippet), 600), at: new Date(+g.internalDate || Date.now()).toISOString(), source: "gmail", ref: "gmail:" + m.id }, "Gmail check")) found++;
    }
  }
  const r = { at: nowIso(), checked, found, account: gm.account || "", errors: errors.slice(0, 3) };
  try { if (env.CHAT_KV) await env.CHAT_KV.put(KV_CHK, JSON.stringify(r), { expirationTtl: 90 * 86400 }); } catch (e) {}
  await act(d, "reply_check", null, checked + " checked, " + found + " new", by);
  return Object.assign({ check: r }, await sentList(env, {}));
}
/* one row per business we messaged: where, when, which files, and its replies */
export async function sentList(env, q) {
  const d = await ldb(env); q = q || {};
  const sends = await all(d, "SELECT business_id, channel, note, by_email, at FROM li_outreach WHERE channel IN (" + SENT_CH.map((c) => "'" + c + "'").join(",") + ") ORDER BY at DESC LIMIT 4000");
  const reps = await all(d, "SELECT business_id, channel, from_addr, subject, text, at, source FROM li_replies ORDER BY at DESC LIMIT 4000");
  const by = new Map();
  for (const s of sends) { let r = by.get(s.business_id); if (!r) by.set(s.business_id, (r = { sends: [], replies: [] }));
    const fm = /\(\+([^()]+)\)\s*$/.exec(s.note || ""); r.sends.push({ channel: s.channel, at: s.at, note: s.note, by: s.by_email, files: fm ? fm[1].split(/,\s*/).filter(Boolean).slice(0, 5) : [] }); }
  for (const p of reps) { const r = by.get(p.business_id); if (r) r.replies.push(p); }
  const ids = [...by.keys()], biz = new Map();
  for (let i = 0; i < ids.length; i += 90) { const part = ids.slice(i, i + 90); (await all(d, "SELECT id, name, category, locality, city, status, email, score, priority FROM li_businesses WHERE id IN (" + part.map((_, k) => "?" + (k + 1)).join(",") + ")", ...part)).forEach((b) => biz.set(b.id, b)); }
  let items = ids.filter((id) => biz.has(id)).map((id) => { const b = biz.get(id), r = by.get(id), last = r.sends[0], rep = r.replies[0] || null;
    return { id, name: b.name, category: b.category, place: [b.locality, b.city].filter(Boolean).join(", "), status: b.status, score: b.score, priority: b.priority,
      channels: [...new Set(r.sends.map((s) => s.channel))], sends: r.sends.slice(0, 10), sent_count: r.sends.length, last_sent: last.at, first_sent: r.sends[r.sends.length - 1].at,
      files: [...new Set([].concat(...r.sends.map((s) => s.files)))].slice(0, 6), replied: !!rep, reply: rep, reply_count: r.replies.length }; });
  try { const S = await sentMap(d, ids.map((id) => (biz.get(id) || {}).email)); items.forEach((i) => { const m = S[String((biz.get(i.id) || {}).email || "").toLowerCase()]; if (m && m.seen_at) { i.seen_at = m.seen_at; i.seen_last = m.seen_last; i.opens = m.opens; } }); } catch (e) {}   /* v55.35 */
  const counts = { all: items.length, replied: items.filter((i) => i.replied).length, waiting: items.filter((i) => !i.replied).length, by_channel: {} };
  SENT_CH.forEach((c) => { counts.by_channel[c] = items.filter((i) => i.channels.indexOf(c) > -1).length; });
  if (q.view === "replied") items = items.filter((i) => i.replied); else if (q.view === "waiting") items = items.filter((i) => !i.replied);
  if (SENT_CH.indexOf(q.channel) > -1) items = items.filter((i) => i.channels.indexOf(q.channel) > -1);
  const s = String(q.q || "").toLowerCase().trim(); if (s) items = items.filter((i) => (i.name + " " + i.place + " " + i.id).toLowerCase().indexOf(s) > -1);
  items.sort((a, b) => String((b.reply && b.reply.at) || b.last_sent).localeCompare(String((a.reply && a.reply.at) || a.last_sent)));
  return { items: items.slice(0, 300), counts, tracking: { email: !!(await gmailFor(env)), last_check: await lastCheck(env) }, channels: SENT_CH.map((c) => [c, CH_LABEL[c]]) };
}
/* who FODO's bots are talking to: Instagram / Facebook DM bot (KV log from metadm.js, from v55.16 on) and the website help chat */
export async function botConvos(env) {
  const out = []; let dm = { on: !!env.META_PAGE_TOKEN && String(env.META_BOT_DISABLED || "") !== "1", logged: !!(env.CHAT_KV && env.CHAT_KV.list) };
  if (dm.logged) {
    let cursor; for (let i = 0; i < 5; i++) {
      const r = await env.CHAT_KV.list({ prefix: "dm:cv:", cursor, limit: 1000 }).catch(() => null); if (!r) break;
      (r.keys || []).forEach((k) => { const m = k.metadata || {}, parts = k.name.split(":"); out.push({ platform: m.p || parts[2], ref: parts.slice(2).join(":"), who: m.n || "", last_in: m.li || "", last_out: m.lo || "", at: m.at || "", count: m.c || 0, state: m.st || "bot", lead: !!m.ld }); });
      if (r.list_complete || !r.cursor) break; cursor = r.cursor;
    }
  }
  try {
    const d = await adb(env), rows = await all(d, "SELECT c.id, c.email, c.updated_at, c.msgs, c.ticket_id, (SELECT text FROM help_chat_msgs m WHERE m.chat_id=c.id AND m.role='user' ORDER BY m.id DESC LIMIT 1) li, (SELECT text FROM help_chat_msgs m WHERE m.chat_id=c.id AND m.role<>'user' ORDER BY m.id DESC LIMIT 1) lo FROM help_chats c ORDER BY c.updated_at DESC LIMIT 100");
    rows.forEach((c) => out.push({ platform: "website", ref: c.id, help: true, who: c.email || "Help page visitor", last_in: clip(c.li, 140), last_out: clip(c.lo, 140), at: c.updated_at, count: c.msgs || 0, state: c.ticket_id ? "human" : "bot", lead: !!c.email, link: "#chat/" + c.id }));
  } catch (e) {}
  out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const day = new Date(Date.now() - 864e5).toISOString(), counts = { all: out.length, today: out.filter((c) => c.at > day).length, instagram: 0, facebook: 0, whatsapp: 0, website: 0, human: out.filter((c) => c.state === "human").length, leads: out.filter((c) => c.lead).length };
  out.forEach((c) => { if (counts[c.platform] != null) counts[c.platform]++; });
  return { convos: out.slice(0, 400), counts, dm };
}
export async function botConvo(env, ref) {
  const r = String(ref || ""); if (!/^(instagram|facebook|whatsapp|website):[\w.+-]{1,80}$/.test(r) || !env.CHAT_KV) throw err("Not found.", 404);
  const v = env.CHAT_KV.getWithMetadata ? await env.CHAT_KV.getWithMetadata("dm:cv:" + r) : { value: await env.CHAT_KV.get("dm:cv:" + r), metadata: null };
  if (!v || !v.value) throw err("This chat is no longer stored (chats are kept for 30 days).", 404);
  return { convo: Object.assign({ platform: r.split(":")[0] }, v.metadata || {}), messages: J(v.value, []) };
}
/* v55.17 try the bot from the admin: the same brain and rules as the real channel, nothing is sent to anyone, no lead is saved */
export async function botTest(env, b) {
  b = b || {}; const platform = ["website", "instagram", "facebook", "whatsapp"].indexOf(b.platform) > -1 ? b.platform : "website";
  const text = clip(b.text, 600); if (!text) throw err("Type a message.");
  const sid = String(b.sid || "").replace(/[^\w-]/g, "").slice(0, 30) || randId(10), t0 = Date.now();
  if (platform === "website") {
    const C = await import("../api/chat.js"), SK = await import("./sitekb.js");
    const hist = (Array.isArray(b.history) ? b.history : []).slice(-12).filter((h) => h && (h.role === "user" || h.role === "assistant")).map((h) => ({ role: h.role, content: clip(h.content, 900) }));
    const r = await C.chatGenerate(env, [{ role: "system", content: C.SYSTEM_PROMPT + "\n\n" + SK.productBrief() + (b.lead ? C.LEAD_SAVED_NOTE : "") + C.turnHints(text, hist, { leadSaved: !!b.lead }) }].concat(hist, [{ role: "user", content: text }]), 480);
    let out = r;
    if (C.inventedPrice(r.text, hist.filter((h) => h.role === "user").map((h) => h.content).join(" ") + " " + text)) { try { const r2 = await C.chatGenerate(env, [{ role: "system", content: C.SYSTEM_PROMPT + "\n\n" + SK.productBrief() + C.turnHints(text, hist, { leadSaved: !!b.lead }) + C.NO_PRICE_NOTE }].concat(hist, [{ role: "user", content: text }]), 480); if (r2.text && !C.inventedPrice(r2.text, "")) out = r2; } catch (e) {} }
    return { reply: out.text, model: out.model, ms: Date.now() - t0, sid };
  }
  const MD = await import("./metadm.js");
  const reply = await MD.replyFor(env, platform, "test-" + sid, text, { saved: !!b.lead });
  return { reply, ms: Date.now() - t0, sid };
}
/* ---------------- outreach drafts (never sent from here) ---------------- */
/* the facts every message is written from: only what research actually found */
const shortName = (n) => clip(String(n || "").split(/\s[|\-–]\s|,|\(/)[0].trim(), 48) || clip(n, 48);
const greetName = (x) => { if (!x.owner_name || x.owner_conf === "unverified" || x.owner_conf === "not_found") return ""; const p = String(x.owner_name).split(/\s+/); return /^(Dr|Dr\.)$/i.test(p[0]) ? "Dr. " + (p[1] || "") : p[0]; };
/* what the business is missing, in plain words, each with why it costs them customers. Only gaps we actually checked. */
export function gapsOf(L) {
  const x = L.lead, A = (L.audit && L.audit.checks) || {}, C = L.contacts || [], has = (k) => C.some((c) => c.kind === k), checked = !!x.researched_at, site = !!x.website, up = site && A.reachable === true, G = [];
  const add = (key, what, why, service, fix) => G.push({ key, what, why, service, fix });
  if (!site) add("website", "No website", "people who find you on Google Maps have nowhere to see your services, prices or timings", "Website", "we build a fast mobile website with your services, prices, timings and a booking button");
  else if (checked && A.reachable === false) add("website_down", "Your website is not opening", "everyone who clicks it from Google right now just leaves", "Website fix", "we get it back online and keep an eye on it so it stays up");
  if (up && A.viewport === false) add("mobile", "Website is not made for phones", "most people open it on mobile and the page looks broken there", "Website redesign", "we redo the layout so it looks right on every phone");
  if (up && A.pagespeed && A.pagespeed.score != null && A.pagespeed.score < 50) add("speed", "Website is slow on phones (Google score " + A.pagespeed.score + "/100)", "people close a page that takes more than a few seconds", "Speed fix", "we compress images and clean the code so it opens in under 3 seconds");
  if (up && A.https === false) add("https", "No padlock (https) on the website", "Chrome shows 'Not secure' and people get doubtful", "SSL", "we add the security certificate, it takes a day");
  if (checked && !has("whatsapp") && !(A.whatsapp_link)) add("whatsapp", site ? "No WhatsApp button on the website" : "No WhatsApp number listed", "most people here prefer to WhatsApp first instead of calling", "WhatsApp setup", site ? "we add a WhatsApp button and a WhatsApp Business profile with quick replies" : "we set up WhatsApp Business with quick replies and add it to your Google listing");
  if (up && !A.chat_widget) add("chat", "No chat or AI assistant on the website", "questions at night or on Sundays get no reply and those people go elsewhere", "AI chatbot", "we add an AI assistant that answers common questions 24/7 in Hindi and English and saves every enquiry for you");
  if (up && !A.contact_form && !A.booking) add("form", "No enquiry form or online booking", "someone ready to book has to call during working hours or leave", "Enquiry + booking", "we add an enquiry form and online booking that send each request straight to your phone");
  const soc = ["instagram", "facebook"].filter((k) => !has(k)); if (checked && soc.length) add("social", "No " + soc.map((k) => k === "instagram" ? "Instagram" : "Facebook").join(" or ") + " page " + (site ? "linked" : "found"), "people check Instagram and Facebook to trust a business before they visit", "Social media", "we set up the pages, link them to your website and Google, and post regularly for you");
  if (checked && !has("email")) add("email", "No email address listed anywhere", "bigger clients, companies and suppliers usually want to email first", "Business email", "we set up a professional email on your own name and show it on your listings");
  if (x.reviews != null && x.reviews < 20) add("reviews", "Only " + x.reviews + " Google reviews", "people usually pick the nearby option with more reviews", "Review system", "we set up a simple WhatsApp message that asks happy customers for a Google review");
  if (up && (!A.title || !A.description || !A.h1)) add("seo", "Website is missing basic Google tags", "it is harder for people searching nearby to find you", "SEO", "we fix the titles, descriptions and local SEO so you show up for searches near you");
  if (up && !A.analytics) add("tracking", "No visitor tracking on the website", "you cannot see how many people visit or where enquiries come from", "Analytics", "we set up Google Analytics so you see every visit and enquiry source each month");
  return G;
}
/* what the business already does well (only checked facts), so every message starts by appreciating it */
export function goodsOf(L) {
  const x = L.lead, A = (L.audit && L.audit.checks) || {}, C = L.contacts || [], has = (k) => C.some((c) => c.kind === k), up = !!x.website && A.reachable === true, G = [];
  if (x.reviews >= 20 && (x.rating || 0) >= 4.2) G.push(x.rating + " stars from " + x.reviews + " Google reviews, that's a lot of happy customers");
  else if (x.reviews >= 5 && (x.rating || 0) >= 4.5) G.push("a " + x.rating + " star rating on Google");
  if (up) G.push("you have your own website");
  if (up && A.viewport && (!A.pagespeed || A.pagespeed.score >= 70)) G.push("the website works well on phones" + (A.pagespeed && A.pagespeed.score >= 85 ? " and loads fast" : ""));
  if (has("whatsapp") || A.whatsapp_link) G.push("customers can WhatsApp you directly");
  if (up && (A.contact_form || A.booking)) G.push("people can " + (A.booking ? "book" : "send an enquiry") + " right from the site");
  const soc = ["instagram", "facebook", "linkedin", "youtube"].filter(has); if (soc.length) G.push("you're on " + soc.map((k) => k.charAt(0).toUpperCase() + k.slice(1)).join(", ").replace("Linkedin", "LinkedIn").replace("Youtube", "YouTube"));
  if (L.people && L.people.some((p) => p.confidence === "verified")) G.push("the website clearly shows who runs " + shortName(x.name));
  return G.slice(0, 5);
}
export function factsOf(L) {
  const x = L.lead, A = (L.audit && L.audit.checks) || {};
  const good = []; if (x.reviews >= 20 && (x.rating || 0) >= 4.2) good.push(x.rating + " stars from " + x.reviews + " Google reviews");
  return { name: shortName(x.name), first: greetName(x), place: x.locality || x.city || "", category: x.category || x.sub_industry || x.industry || "", website: x.website || "", strengths: goodsOf(L),
    down: !!(x.website && A.reachable === false), rating: x.rating, reviews: x.reviews, good, gaps: gapsOf(L), problems: (L.opportunities || []).filter((o) => o.kind === "observed").slice(0, 4),
    pagespeed: A.pagespeed && A.pagespeed.score != null ? A.pagespeed.score : null };
}
const factText = (F) => ["Business: " + F.name + (F.category ? " (" + F.category + ")" : "") + (F.place ? ", " + F.place : ""), F.first ? "Person to greet: " + F.first : "Person: unknown, greet the team",
  F.strengths.length ? "What is already good: " + F.strengths.join("; ") : "", F.website ? "Website: " + F.website : "They have no website",
  "What they are missing (with why it costs them customers):\n" + (F.gaps.map((g) => "- " + g.what + ": " + g.why).join("\n") || "- nothing major found")].filter(Boolean).join("\n");
const STYLE = { whatsapp: "a WhatsApp message of 50 to 80 words. Mention the 2 or 3 most important missing things from the list and in a few words why each matters. End by asking if they have 10 minutes this week",
  instagram: "an Instagram DM of 30 to 50 words. Mention the 1 or 2 most important missing things and why", facebook: "a Facebook Page message of 40 to 60 words. Mention 2 missing things and why",
  linkedin: "a LinkedIn connection note under 280 characters to the owner. One missing thing and why", x: "an X direct message under 240 characters. One missing thing",
  followup: "a short follow-up email of 50 to 80 words with 'Subject: ...' as the first line, referring back to the missing things", opener: "three different one-sentence opening lines, one per line, each about a different missing thing" };
const SYS = "You are Anmol, who runs FODO, a digital marketing agency in New Delhi. Never call FODO small, tiny or a studio. You are typing a message yourself, by hand, to a local business owner. " +
  "Sound like a real person: short simple sentences, everyday words, contractions (I'm, you're), Indian English is fine. Say what you saw (\"I checked\", \"I couldn't find\") and in a few words why it matters to their customers. " +
  "Start with one honest positive only if a good fact is given. Use ONLY the facts given: never invent numbers, results, clients or claims. " +
  "Never use these words or phrases: impressive, enhance, elevate, leverage, unlock, seamless, boost, digital presence, online presence, take your business to the next level, testament, game changer, I hope this message finds you well, reach out, synergy, cutting-edge, robust, delve, journey, solution(s). " +
  "No markdown, no emojis, no hashtags, no exclamation marks, no long dashes, never the word free. Sign off as 'Anmol, FODO' only where a sign-off fits.";
const AI_TELL = /\b(impressive|enhanc\w*|elevat\w*|leverag\w*|unlock\w*|seamless\w*|boost\w*|digital presence|online presence|next level|testament|game[- ]changer|hope this (message|email) finds|reach out|synergy|cutting[- ]edge|robust|delve|journey|solutions?|I'd love to|thrilled|excited to)\b/i;
export const soundsAI = (t) => AI_TELL.test(String(t || "")) || (String(t || "").match(/!/g) || []).length > 1;
const tidy = (t) => String(t || "").replace(/[—–]/g, ", ").replace(/!+/g, ".").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
/* write with the model, and if it still sounds like AI, ask once more; then fall back to the hand-written template */
async function humanAI(env, system, user, max) {
  const a = await aiRun(env, system, user, max); if (!a) return null;
  if (!soundsAI(a.text)) return Object.assign(a, { text: tidy(a.text) });
  const b = await aiRun(env, system, user + "\n\nYour last try sounded like a marketing bot (\"" + clip((String(a.text).match(AI_TELL) || [""])[0], 30) + "\"). Rewrite it plainer, the way a person types on their phone.", max);
  return b && !soundsAI(b.text) ? Object.assign(b, { text: tidy(b.text) }) : null;
}
function templ(ch, F) {
  const hi = F.first ? "Hi " + F.first : "Hi", g = F.gaps, g1 = g[0], g2 = g[1], g3 = g[2];
  const good = F.good[0] ? "I came across " + F.name + " and saw " + F.good[0] + ", really good. " : "I came across " + F.name + (F.place ? " in " + F.place : "") + ". ";
  const say = (x) => x ? x.what.charAt(0).toLowerCase() + x.what.slice(1) : "";
  const two = g1 ? "One thing I noticed: " + say(g1) + ", so " + g1.why + "." + (g2 ? " Also " + say(g2) + ", so " + g2.why + "." : "") : "I had a look at how you show up online and have a couple of small ideas.";
  return { whatsapp: hi + ", I'm Anmol from FODO in New Delhi. " + good + two + (g3 ? " And " + say(g3) + "." : "") + " These are quick to fix. Do you have 10 minutes this week? I can show you.",
    instagram: hi + ", Anmol from FODO here. " + good + (g1 ? "Noticed " + say(g1) + ", so " + g1.why + "." : "") + " Happy to show you a quick fix if useful.",
    facebook: hi + ", I'm Anmol from FODO, New Delhi. " + good + two + " Can I show you the fixes on a short call?",
    linkedin: hi + ", I'm Anmol from FODO, New Delhi. " + (g1 ? "Noticed " + F.name + " has " + say(g1).replace(/^no /, "no ") + ". Happy to share a quick fix." : "Would be good to connect."),
    x: hi + ", Anmol from FODO. " + (g1 ? "Noticed " + say(g1) + " for " + F.name + ". Can I share a quick fix?" : "Would like to share an idea for " + F.name + "."),
    followup: "Subject: Re: " + F.name + "\n\n" + hi + ", just following up on my note" + (g1 ? " about " + say(g1) : "") + ". Happy to walk you through it in 10 minutes whenever suits you.\n\nAnmol, FODO",
    opener: g.slice(0, 3).map((x) => "Noticed " + say(x) + ", which means " + x.why + ".").join("\n") || "I came across " + F.name + " while looking at " + (F.category || "businesses") + " in " + (F.place || "Delhi") + "." }[ch];
}
/* the full message: what is good, every gap with why it matters and how we fix it. The list comes straight from research
   (so nothing is dropped or invented); AI only writes the opening and closing lines in Anmol's voice. */
const capF = (t) => String(t || "").charAt(0).toUpperCase() + String(t || "").slice(1);
export function fullMessage(F, ch, w) {
  w = w || {}; const wa = ch === "whatsapp", b = (t) => (wa ? "*" + t + "*" : t), dot = "• ";
  const hi = F.first ? "Hi " + F.first : "Hi " + F.name + " team";
  const opening = w.opening || (ch === "instagram" || ch === "x" ? hi + ", I'm Anmol, I run FODO, a marketing agency in New Delhi. I had a look at " + F.name + " online." : hi + ", I'm Anmol, I run FODO, a digital marketing agency in New Delhi. I came across " + F.name + (F.place && F.name.toLowerCase().indexOf(F.place.toLowerCase()) < 0 ? " in " + F.place : "") + " and spent some time checking how you show up for people online.");
  const parts = [opening];
  if (F.strengths.length) parts.push(b("What's already working") + "\n" + F.strengths.map((g) => dot + capF(g)).join("\n"));
  const compact = ch === "instagram" || ch === "x";   // Instagram DMs stop at 1000 characters: one line per gap
  if (F.gaps.length) parts.push(b("What's missing, and how we'd fix it") + "\n" + F.gaps.map((g) => compact ? dot + g.what + ": " + g.fix.replace(/^we /, "we'd ").replace(/^we'd add/, "we'd add") : dot + g.what + ". " + capF(g.why) + ". " + capF(g.fix) + ".").join("\n"));
  else parts.push("Honestly I couldn't find much missing. I still have a couple of ideas to bring you more enquiries.");
  parts.push(w.closing || "None of this is a big project. If you have 10 minutes this week, I can show you what I'd fix first and you decide.");
  parts.push(ch === "instagram" || ch === "x" ? "Anmol, FODO" : "Anmol, FODO\nfodo.co.in · +91 78270 07676");
  let out = parts.join("\n\n");
  if (ch === "instagram" && out.length > 1000) out = out.replace(/\n\nWhat's already working\n[\s\S]*?(?=\n\nWhat's missing)/, F.strengths[0] ? "\n\nLoved seeing " + F.strengths[0].replace(/, that's a lot of happy customers$/, "") + "." : "");
  return out.slice(0, ch === "instagram" ? 1000 : 4000);
}
/* v55.30 FODO services email: the general pitch for clients we only have an email for (no research needed).
   Only the greeting and subject change per lead; everything else is the same approved FODO text. No numbers we can't stand behind. */
export function greetOf(x) {
  x = x || {}; const own = x.owner_name && ["provided", "verified", "partial"].indexOf(x.owner_conf) > -1 ? String(x.owner_name).replace(/^(dr|mr|mrs|ms|er)\.?\s+/i, "").trim().split(/\s+/)[0] : "";
  if (own && /^[A-Za-zऀ-ॿ]{2,}$/.test(own)) return { hi: "Hi " + own, first: own };
  const n = String(x.name || "").trim(); if (n && n.length <= 40 && !/[\d@]/.test(n)) return { hi: "Hi " + n + " team", first: "" };
  return { hi: "Hello", first: "" };
}
export const SERVICES_MAIL = {
  eyebrow: "A note from FODO", headline: "Don't let your brand *disappear*",
  services: ["Performance ads | Meta and Google ads planned, built and improved every week for leads and sales.",
    "Social media and content | Monthly posts, reels and shoots that keep your brand active and consistent.",
    "Websites and landing pages | Fast, mobile-first websites made to turn visitors into enquiries.",
    "SEO and Google Business Profile | Show up when nearby customers search for what you offer.",
    "Branding and design | Logo, brand kit and creatives that make you look as good as your work.",
    "AI automation and WhatsApp | Chat assistants, WhatsApp marketing and follow-ups that run on their own."].join("\n"),
  mid_text: "See our work on fodo.co.in", mid_link: "https://www.fodo.co.in/?utm_source=email&utm_medium=outreach&utm_campaign=services_pitch",
  stats: ["30 | Services under one roof", "Your accounts | Ads, pages and data stay in your name"].join("\n"),
  cta_text: "Book a 15-minute call",
};
export function servicesEmail(x) {
  const g = greetOf(x), biz = g.first || g.hi === "Hello" ? "" : String(x.name).trim();
  return { subject: (g.first ? g.first + ", one" : "One") + " team for your ads, content and website", blocks: Object.assign({}, SERVICES_MAIL, {
    intro: g.hi + ",\n\nI'm Anmol, I run FODO, a digital marketing agency in New Delhi. We help businesses get found online, look premium and turn that attention into real enquiries, with one team handling strategy, creative, ads, websites and automation.\n\nHere is what we can take off your plate" + (biz ? " at " + biz : "") + ":",
    cta_link: "https://wa.me/917827007676?text=" + encodeURIComponent("Hi Anmol, I got your email about FODO" + (x.name && g.hi !== "Hello" ? " (" + x.name + ")" : "")),
    closing: "If any of this is on your list for the coming months, just reply to this email or tap the button and tell me what you're working on. I'll suggest where to start, no long proposals. I've attached our company profile so you can see everything in one place." }) };
}
/* the company profile PDF that goes with the services email: kept once, picked up automatically */
export async function profilePdf(env, b) {
  if (b && b.set) { const f = b.set; if (!/^ca_/.test(String(f.id || ""))) throw err("Upload the PDF first."); const v = { id: clip(f.id, 60), name: clip(f.name, 120), size: +f.size || 0, url: clip(f.url, 200), at: nowIso() }; await env.CHAT_KV.put("li:profile_pdf", JSON.stringify(v)); return { file: v }; }
  if (b && b.clear) { await env.CHAT_KV.delete("li:profile_pdf"); return { file: null }; }
  const v = J(await env.CHAT_KV.get("li:profile_pdf"), null);
  if (v && !(await env.CHAT_KV.get("cm:att:" + v.id))) return { file: null, expired: v.name };   /* uploaded files are kept 180 days */
  return { file: v };
}
/* v55.33 files that go with every client email (company profile, rate card...): saved once, attached automatically; the old single company profile PDF is the first entry */
const ALWAYS = "li:always_files";
export async function alwaysFiles(env, b) {
  if (!env.CHAT_KV) return { files: [], expired: [] };
  b = b || {}; let L = J(await env.CHAT_KV.get(ALWAYS), null);
  if (!Array.isArray(L)) { L = []; const p = J(await env.CHAT_KV.get("li:profile_pdf"), null); if (p && p.id) L.push(p); }
  if (b.add) { const f = b.add; if (!/^ca_/.test(String(f.id || ""))) throw err("Upload the file first.");
    if (!L.some((x) => x.id === f.id)) { if (L.length >= 5) throw err("Up to 5 files can go with every email. Remove one first."); L.push({ id: clip(f.id, 60), name: clip(f.name, 120), size: +f.size || 0, url: clip(f.url, 200), at: nowIso() }); } }
  if (b.remove) { L = L.filter((x) => x.id !== String(b.remove)); const p = J(await env.CHAT_KV.get("li:profile_pdf"), null); if (p && p.id === String(b.remove)) await env.CHAT_KV.delete("li:profile_pdf"); }
  if (b.add || b.remove) await env.CHAT_KV.put(ALWAYS, JSON.stringify(L));
  const files = [], expired = []; for (const f of L) { if (await env.CHAT_KV.get("cm:att:" + f.id)) files.push(f); else expired.push(f.name); }   /* uploaded files are kept 180 days */
  return { files, expired };
}
/* the designed email: the same content in the FODO design */
export function emailBlocks(F, w) {
  w = w || {}; const hi = F.first ? "Hi " + F.first : "Hi " + F.name + " team";
  const stats = []; if (F.rating != null && F.reviews != null) stats.push(F.rating + " ★ | " + F.reviews + " Google reviews");
  if (F.pagespeed != null) stats.push(F.pagespeed + "/100 | Mobile speed score (Google)");
  if (F.down) stats.push("Not opening | Your website when we checked");
  const rows = F.gaps.slice(0, 8).map((g) => clip(g.what, 70) + " | " + capF(clip(g.fix, 140)) + ". " + capF(clip(g.why, 110)) + ".");
  const good = F.strengths.length ? "\n\nWhat's already working: " + F.strengths.join("; ") + "." : "";
  return { eyebrow: "For " + F.name + (F.place ? " · " + F.place : ""), headline: clip(F.name, 34) + ", *what we noticed*",
    intro: (String(w.intro || "").replace(/<[^>]*>/g, "").replace(/[ \t]+/g, " ").trim().slice(0, 900) || (hi + ",\n\nI'm Anmol, I run FODO, a digital marketing agency in New Delhi. I came across " + F.name + " and checked how it shows up for people searching online.")) + good +
      (F.gaps.length ? "\n\nHere is what's missing, and how we'd fix each one:" : ""),
    items: rows.join("\n"), stats: stats.slice(0, 2).join("\n"), cta_text: "Book a 15-minute call",
    cta_link: "https://wa.me/917827007676?text=" + encodeURIComponent("Hi Anmol, about " + F.name),
    closing: String(w.closing || "").replace(/<[^>]*>/g, "").replace(/[ \t]+/g, " ").trim().slice(0, 600) || "None of this needs a big project. I can show you on a short call what I'd fix first, and you decide. Just reply here or tap the button." };
}
/* AI writes just the opening (greeting + who + one personal, appreciative line) and the closing ask, in JSON */
async function openClose(env, F, facts, ch) {
  const hi = F.first ? "Hi " + F.first : "Hi " + F.name + " team";
  const a = await aiRun(env, SYS + " Reply with JSON only: {\"opening\": \"...\", \"closing\": \"...\"}.", facts + "\n\nThis is a " + ({ whatsapp: "WhatsApp message", instagram: "Instagram DM", facebook: "Facebook message", linkedin: "LinkedIn message", x: "X message" }[ch] || "message") +
    ". A list of what's working and what's missing with fixes is added automatically between your two lines, so do not list them. opening: starts with '" + hi + ",', then 1 or 2 short sentences: you are Anmol and you run FODO, a digital marketing agency in New Delhi, and one honest, specific line about why you looked at them. closing: 1 or 2 short sentences asking for 10 minutes this week, no pressure, NO sign-off or name.", 220);
  if (!a) return null; const raw = String(a.text).replace(/```(json)?/g, ""); let w = null;
  try { w = JSON.parse(raw.replace(/^[^{]*/, "").replace(/[^}]*$/, "")); } catch (e) { const g = (k) => ((raw.match(new RegExp('"' + k + '"\\s*:\\s*"([\\s\\S]*?)"\\s*(,\\s*"[a-z]+"\\s*:|}\\s*$)')) || [])[1] || "").trim(); w = g("opening") ? { opening: g("opening"), closing: g("closing") } : null; }
  if (!w || !w.opening) return null;
  w.opening = tidy(String(w.opening).replace(/\\n/g, " ")); w.closing = tidy(String(w.closing || "").replace(/\\n/g, " ").replace(/[\s,.]*(best|regards|thanks|cheers)?[\s,.]*(anmol)?[\s,]*(fodo)?[\s.]*$/i, (m) => (/anmol|fodo|regards|best|thanks|cheers/i.test(m) ? "." : m)).replace(/\.\.$/, "."));
  if (soundsAI(w.opening + " " + w.closing) || !/^hi\b/i.test(w.opening)) return null;
  return Object.assign(w, { model: a.model });
}
export async function drafts(env, id, b) {
  const L = await lead(env, id), x = L.lead; b = b || {};
  if (x.status === "dnc" || L.opted_out) throw err("This business is marked Do not contact (or opted out). No drafts.", 409);
  let ch = b.channel === "dm" ? "instagram" : b.channel; if (["email", "whatsapp", "instagram", "facebook", "linkedin", "x", "followup", "opener"].indexOf(ch) < 0) ch = "email";
  if (ch === "email" && b.template === "services") return Object.assign({ channel: "email", template: "services", ai: false, to: (L.channels.find((c) => c.channel === "email") || {}).target || "" }, servicesEmail(x));
  const F = factsOf(L), facts = factText(F);
  if (ch === "email") {
    const ai = await aiRun(env, SYS + " Reply with JSON only: {\"subject\": \"...\", \"intro\": \"...\", \"closing\": \"...\"}.",
      facts + "\n\nWrite an email to this business. The email already shows the list of missing things as rows, so do not repeat the list. subject: under 55 characters, plain and specific, like a person would write it (for example '" + F.name + ": a few things I noticed'). intro: starts with '" + (F.first ? "Hi " + F.first : "Hi " + F.name + " team") + ",' then a blank line, then 2 or 3 short sentences: who you are (Anmol, you run FODO, a digital marketing agency in New Delhi), one honest positive if given, then that a few things are missing and are probably costing them enquiries. closing: 1 or 2 short sentences offering a 15-minute call, no pressure, NO sign-off or name.", 380);
    let w = null; if (ai) { const raw = String(ai.text).replace(/```(json)?/g, "");
      try { w = JSON.parse(raw.replace(/^[^{]*/, "").replace(/[^}]*$/, "")); } catch (e) {   // models often put raw line breaks inside the strings
        const g = (k) => ((raw.match(new RegExp('"' + k + '"\\s*:\\s*"([\\s\\S]*?)"\\s*(,\\s*"[a-z]+"\\s*:|}\\s*$)')) || [])[1] || "").replace(/\\n/g, "\n").trim();
        w = g("subject") && g("intro") ? { subject: g("subject"), intro: g("intro"), closing: g("closing") } : null; } }
    if (w) { const unsign = (t) => String(t || "").replace(/\\n/g, "\n").replace(/[\s,.]*(best|regards|thanks|cheers|warm regards|looking forward[^,.]*)?[\s,.]*(anmol)?[\s,]*(fodo)?[\s.]*$/i, (m) => (/anmol|fodo|regards|best|thanks|cheers|looking/i.test(m) ? "." : m)).replace(/\.\.$/, ".").trim();
      w.intro = tidy(String(w.intro || "").replace(/\\n/g, "\n").replace(/^(Hi [^,\n]{1,40},)\s*(?!\n)/, "$1\n\n")); w.closing = tidy(unsign(w.closing)); w.subject = tidy(w.subject).replace(/\.$/, "");
      if (soundsAI(w.subject + " " + w.intro + " " + w.closing)) w = null; }   // marketing-bot wording → use the plain hand-written text
    const blocks = emailBlocks(F, w), subject = clip((w && w.subject) || F.name + ": a few things I noticed", 120);
    return { channel: "email", subject, blocks, gaps: F.gaps, to: (L.channels.find((c) => c.channel === "email") || {}).target || "", ai: !!w, model: w ? ai.model : null };
  }
  if (ch === "followup" || ch === "opener") {
    const ai = await humanAI(env, SYS, facts + "\n\nWrite " + STYLE[ch] + ".", 260);
    return ai ? { channel: ch, text: ai.text, gaps: F.gaps, ai: true, model: ai.model } : { channel: ch, text: templ(ch, F), gaps: F.gaps, ai: false, template: true };
  }
  // every platform gets the full message; AI only personalises the first and last lines
  const w = await openClose(env, F, facts, ch);
  const note = ch === "linkedin" ? clip(templ("linkedin", F), 290) : "";   // LinkedIn connection requests allow ~300 characters
  return { channel: ch, text: fullMessage(F, ch, w), note, gaps: F.gaps, strengths: F.strengths, ai: !!w, model: w ? w.model : null, template: !w };
}
/* designed email: preview, test to yourself, send to the lead (needs confirm; unsubscribe link; hourly cap; opt-outs respected) */
const cleanBlocks = (b) => { b = b || {}; const o = {}; ["eyebrow", "headline", "intro", "items", "services", "stats", "mid_text", "mid_link", "cta_text", "cta_link", "closing"].forEach((k) => { o[k] = clip(String(b[k] == null ? "" : b[k]).replace(/\r/g, ""), k === "intro" || k === "closing" || k === "items" ? 1500 : 300).replace(/ {2,}/g, " "); });
  ["intro", "closing", "items", "services", "stats"].forEach((k) => { o[k] = String(b[k] == null ? "" : b[k]).replace(/\r/g, "").replace(/<[^>]*>/g, "").slice(0, 1500); }); return o; };
export async function emailRender(env, id, b, to) {
  const T = await import("./clientmail.js"), OR = await import("./outreach.js"); b = b || {};
  const subject = clip(b.subject, 150); if (!subject) throw err("Add a subject.");
  const ou = to ? await OR.optOutUrl(env, to) : "", atts = await OR.attMeta(env, b.attachments);
  const r = T.renderMail({ subject, blocks: cleanBlocks(b.blocks), optOutUrl: ou, attachments: atts });
  return { subject, html: r.html, text: r.text, optOut: ou, atts };
}
export async function emailPreview(env, id, b) { const L = await lead(env, id), to = (L.channels.find((c) => c.channel === "email") || {}).target || ""; const r = await emailRender(env, id, b, to || "preview@fodo.co.in"); return { subject: r.subject, html: r.html, to }; }
export async function emailSend(env, id, b, by) {
  const d = await ldb(env), L = await lead(env, id), x = L.lead, OR = await import("./outreach.js"); b = b || {}; const test = !!b.test;
  const to = test ? cleanEmail(by) : cleanEmail(b.to || (L.channels.find((c) => c.channel === "email") || {}).target);
  if (!to) throw err(test ? "Your admin email is not valid." : "This business has no public email.");
  if (!test) {
    if (x.status === "dnc" || L.opted_out) throw err("This business is marked Do not contact (or opted out).", 409);
    if (BAD_CHECK.indexOf(x.email_check) > -1 && to === cleanEmail(x.email) && !b.allow_flagged) throw err("This email was marked " + (CHECK_LABEL[x.email_check] || x.email_check) + ": " + (x.email_reason || "") + ". It is not sent, to protect your sending reputation.", 409);
    if (!b.confirm) throw err("Please confirm the send first.", 400);
    if (await one(d, "SELECT email FROM camp_unsub WHERE email=?1", to).catch(() => null)) throw err(to + " has unsubscribed from FODO emails.", 409);
    if ((await OR.usedThisHour(env)) >= OR.hourly(env)) throw err("Hourly limit reached (" + OR.hourly(env) + " emails per hour). Try again a bit later.", 429);
    const dup = await one(d, "SELECT at FROM li_outreach WHERE business_id=?1 AND channel='email' AND at > ?2", x.id, new Date(Date.now() - 10 * 60e3).toISOString()); if (dup && !b.override) throw err("An email went to this business a few minutes ago. Send again anyway?", 409);
  }
  const m = await emailRender(env, id, b, test ? "" : to), sid = "cm_" + randId(14), t = nowIso(), subject = (test ? "[TEST] " : "") + m.subject;
  const cm = await OR.cmDb(env);
  await run(cm, "INSERT INTO cm_sends (id,at,last_at,admin,client_id,email,type,subject,status,test,marketing,attempts,html,text,atts,campaign_id) VALUES (?1,?2,?2,?3,?4,?5,'lead_intel',?6,'sending',?7,1,1,?8,?9,?10,'lead-intel')", sid, t, clip(by, 254), x.id, to, subject, test ? 1 : 0, m.html, m.text, JSON.stringify(m.atts || []));
  const files = await OR.attData(env, m.atts || []);
  const r = await OR.deliver(env, { id: sid, to, subject, html: m.html, text: m.text, files, optOut: test ? "" : m.optOut }).catch((e) => ({ ok: false, error: String(e.message || e).slice(0, 200) }));
  await run(cm, "UPDATE cm_sends SET status=?2, provider_id=?3, error=?4, last_at=?5 WHERE id=?1", sid, r.ok ? "sent" : "failed", r.ok ? r.id : null, r.ok ? null : r.error, nowIso());
  if (!r.ok) throw err("The email was not sent: " + r.error, 502);
  if (!test) return Object.assign(await logSent(env, x.id, { channel: "email", note: "Email sent to " + to + ": " + m.subject + ((m.atts || []).length ? " (+" + m.atts.map((a) => a.name).join(", ") + ")" : "") }, by), { sent: { to, via: r.via } });
  return { test: true, sent: { to, via: r.via } };
}
/* hand leads with a public email to a Bulk pitch campaign (sending stays there, with its test-first and confirm rules) */
export async function toPitch(env, b, by) {
  const d = await ldb(env), ids = (Array.isArray(b.ids) ? b.ids : []).slice(0, 500), lines = ["name,business,email,city"]; let skipped = 0;
  for (const id of ids) {
    const x = await one(d, "SELECT * FROM li_businesses WHERE id=?1", clip(id, 20)); if (!x || !x.email || x.status === "dnc" || BAD_CHECK.indexOf(x.email_check) > -1) { skipped++; continue; }
    const nm = x.owner_conf === "verified" || x.owner_conf === "partial" ? x.owner_name || "" : "";
    lines.push([nm, x.name, x.email, x.city || ""].map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(","));
  }
  if (lines.length < 2) throw err("None of the selected leads has a public email (or they are marked Do not contact).");
  const PI = await import("./pitch.js"); const r = await PI.loadRecipients(env, clip(b.campaign_id, 40), { csv: lines.join("\n"), append: true });
  await act(d, "to_pitch", null, (lines.length - 1) + " leads → " + b.campaign_id, by);
  return { added: r.counts.queued, counts: r.counts, skipped };
}

/* a file for outreach: attached to emails, and shared on WhatsApp / Instagram / Facebook / LinkedIn as a private link (fodo.co.in/f/<token>) */
export async function shareFile(env, b, by) {
  const OR = await import("./outreach.js"); b = b || {};
  const r = await OR.attach(env, { file: b.file, name: b.name, mime: b.mime }), a = r.attachment, token = randId(22);
  await env.CHAT_KV.put("li:share:" + token, JSON.stringify({ id: a.id, name: a.name, mime: a.mime, size: a.size, by: clip(by, 254), at: nowIso() }), { expirationTtl: 180 * 86400 });
  const d = await ldb(env); await act(d, "file", null, a.name + " (" + Math.round(a.size / 1024) + " KB)", by);
  return { file: Object.assign({}, a, { url: "https://www.fodo.co.in/f/" + token }) };
}
export async function sharedFile(env, token) {
  if (!env.CHAT_KV || !/^[a-z0-9]{22}$/.test(String(token || ""))) return null;
  const meta = J(await env.CHAT_KV.get("li:share:" + token), null); if (!meta) return null;
  const v = await env.CHAT_KV.get("cm:att:" + meta.id); if (v == null) return null;
  return Object.assign(meta, { b64: String(v).replace(/\s+/g, "") });
}
/* ---------------- saved / scheduled searches ---------------- */
const nextRun = (s, from) => { const t = from || Date.now(); return s === "daily" ? new Date(t + 864e5).toISOString() : s === "weekly" ? new Date(t + 7 * 864e5).toISOString() : null; };
export async function saveJob(env, b, by) {
  const d = await ldb(env); b = b || {}; const f = cleanFilters(b.filters), sch = ["once", "daily", "weekly"].indexOf(b.schedule) > -1 ? b.schedule : "once";
  const id = b.id ? clip(b.id, 20) : "LJ-" + randId(6).toUpperCase(), name = clip(b.name, 100) || queryOf(f) + " · " + areaOf(f);
  await run(d, "INSERT INTO li_jobs (id, name, filters, schedule, enabled, next_run, created_by, created_at) VALUES (?1,?2,?3,?4,1,?5,?6,?7) ON CONFLICT(id) DO UPDATE SET name=?2, filters=?3, schedule=?4, enabled=1, next_run=?5",
    id, name, JSON.stringify(f), sch, sch === "once" ? null : nextRun(sch), clip(by, 254), nowIso());
  return { job: await one(d, "SELECT * FROM li_jobs WHERE id=?1", id) };
}
export async function runJob(env, id, by) {
  const d = await ldb(env), j = await one(d, "SELECT * FROM li_jobs WHERE id=?1", clip(id, 20)); if (!j) throw err("Saved search not found.", 404);
  const r = await search(env, J(j.filters, {}), by || "scheduler", j.id);
  await run(d, "UPDATE li_jobs SET last_run=?2, next_run=?3 WHERE id=?1", j.id, nowIso(), j.schedule === "once" ? null : nextRun(j.schedule));
  return r;
}
export async function delJob(env, id) { const d = await ldb(env); await run(d, "DELETE FROM li_jobs WHERE id=?1", clip(id, 20)); return { ok: true }; }
/* called by the daily scheduler (/api/monitor/tick): runs at most `max` due searches */
export async function runDue(env, max) {
  const d = await ldb(env), due = await all(d, "SELECT id FROM li_jobs WHERE enabled=1 AND next_run IS NOT NULL AND next_run<=?1 ORDER BY next_run LIMIT ?2", nowIso(), max || 1), out = [];
  for (const j of due) { try { const r = await runJob(env, j.id, "scheduler"); out.push({ id: j.id, added: r.added.length }); } catch (e) { await act(d, "error", null, "Scheduled search " + j.id + ": " + String(e.message || e), "scheduler"); out.push({ id: j.id, error: String(e.message || e) }); } }
  return out;
}
export async function jobs(env) { const d = await ldb(env); return { jobs: await all(d, "SELECT * FROM li_jobs ORDER BY created_at DESC LIMIT 100"), runs: await all(d, "SELECT * FROM li_runs ORDER BY at DESC LIMIT 50") }; }

/* ---------------- dashboard / analytics ---------------- */
export async function stats(env, q) {
  const d = await ldb(env); q = q || {}; const w = ["archived=0"], a = [];
  if (q.from) { a.push(clip(q.from, 10)); w.push("created_at>=?" + a.length); } if (q.to) { a.push(clip(q.to, 10) + "T99"); w.push("created_at<=?" + a.length); }
  const W = " WHERE " + w.join(" AND "), n = async (extra) => ((await one(d, "SELECT COUNT(*) AS n FROM li_businesses" + W + (extra ? " AND " + extra : ""), ...a)) || {}).n || 0;
  const grp = (col) => all(d, "SELECT COALESCE(NULLIF(" + col + ",''),'Unknown') AS k, COUNT(*) AS n FROM li_businesses" + W + " GROUP BY k ORDER BY n DESC LIMIT 12", ...a);
  return {
    totals: { discovered: await n(), researched: await n("researched_at IS NOT NULL"), qualified: await n("score>=60"), hot: await n("priority='hot'"), high: await n("priority='high'"),
      founders: await n("owner_conf IN ('verified','partial')"), founders_verified: await n("owner_conf='verified'"),
      verified_contacts: ((await one(d, "SELECT COUNT(DISTINCT c.business_id) AS n FROM li_contacts c JOIN li_businesses b ON b.id=c.business_id" + W.replace(/created_at/g, "b.created_at").replace("archived", "b.archived") + " AND c.kind IN ('email','phone','whatsapp') AND c.status LIKE '%official website%'", ...a)) || {}).n || 0,
      meetings: await n("status='meeting'"), proposals: await n("status='proposal'"), converted: await n("status='converted'"), contacted: await n("status NOT IN ('new','not_contacted')") },
    by_industry: await grp("industry"), by_city: await grp("city"), by_source: await grp("source"), by_status: await grp("status"), by_priority: await grp("priority"),
    recent: await all(d, "SELECT id,name,city,score,priority,status,created_at FROM li_businesses" + W + " ORDER BY created_at DESC LIMIT 8", ...a),
    top: await all(d, "SELECT id,name,city,score,priority,status,owner_name,owner_conf FROM li_businesses" + W + " AND score IS NOT NULL ORDER BY score DESC LIMIT 8", ...a),
  };
}
/* ---------------- integrations: status, usage, errors, tests ---------------- */
export async function integrations(env) {
  const d = await ldb(env), p = providers(env);
  const use = await all(d, "SELECT api, SUM(calls) AS calls, SUM(errors) AS errors, MAX(day) AS last FROM li_usage WHERE day>=?1 GROUP BY api", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const today = await all(d, "SELECT api, calls, errors FROM li_usage WHERE day=?1", nowIso().slice(0, 10));
  const u = (k) => Object.assign({ calls: 0, errors: 0 }, use.find((x) => x.api === k) || {}, { today: (today.find((x) => x.api === k) || {}).calls || 0 });
  return { items: [
    { key: "google_places", name: "Google Places API", configured: !!placesKey(env), secret: "GOOGLE_PLACES_KEY (or the same Google key saved as PAGESPEED_API_KEY)", role: "Business discovery with phone, website, rating and reviews.", cost: "Text Search Pro: about US$32 per 1,000 requests (each request returns up to 20 places); Google gives a monthly free usage cap per SKU. Set a budget alert in Google Cloud.", usage: u("google_places") },
    { key: "openstreetmap", name: "OpenStreetMap (fallback)", configured: true, secret: "", role: "Discovery without a key. Fewer phones/websites, no reviews.", cost: "No cost; shared public servers, please search politely.", usage: u("openstreetmap") },
    { key: "search", name: "Web search API (" + (p.searchName || "Serper or Brave") + ")", configured: !!p.search, secret: "SERPER_API_KEY or BRAVE_API_KEY", role: "Finds public founder/owner/CEO results (e.g. LinkedIn profile titles) when the website does not name them.", cost: "Serper about US$1 per 1,000 searches (2,500 trial); Brave from US$5 per 1,000.", usage: u(p.search || "serper") },
    { key: "ai", name: "AI provider (" + (env.AI ? "Cloudflare Workers AI" : "not bound") + ")", configured: !!(env.AI && env.AI.run), secret: "AI binding", role: "Audit summaries, hypotheses and outreach drafts (always labelled AI).", cost: "Workers AI: a daily free allocation, then pay per use on Workers Paid.", usage: { calls: null } },
    { key: "database", name: "Database (Cloudflare D1, existing)", configured: !!env.XRAY_DB, secret: "XRAY_DB binding", role: "Stores leads, contacts, people, audits, scores, outreach and logs.", cost: "Included in the current Cloudflare plan limits.", usage: { calls: null } },
    { key: "dns_mx", name: "Email domain check (DNS MX)", configured: true, secret: "", role: "Checks that an email's domain accepts mail. Does not prove the mailbox exists.", cost: "No cost (Cloudflare DNS-over-HTTPS).", usage: u("dns_mx") },
    { key: "pagespeed", name: "Website performance (Google PageSpeed Insights)", configured: !!(env.PAGESPEED_API_KEY || env.LI_PAGESPEED === "1"), secret: "PAGESPEED_API_KEY (or LI_PAGESPEED=1 for the small keyless quota)", role: "Mobile performance score for each audited site.", cost: "No cost; free key raises the quota to 25,000 per day.", usage: u("pagespeed") },
    { key: "email_validation", name: "Mailbox validation service", configured: false, secret: "", role: "Not connected. Mailbox-level checks (ZeroBounce, NeverBounce, etc.) are paid; until one is added, emails are shown as 'found on website' plus the MX result, never as verified.", cost: "Typically US$7 to 10 per 1,000 checks.", usage: { calls: null } },
  ], errors: await all(d, "SELECT detail, by_email, at FROM li_activity WHERE kind='error' ORDER BY id DESC LIMIT 30") };
}
export async function testIntegration(env, key) {
  const d = await ldb(env);
  if (key === "google_places") { if (!placesKey(env)) return { ok: false, reason: "No Google key set (GOOGLE_PLACES_KEY or PAGESPEED_API_KEY)." }; try { const r = await googleSearch(placesKey(env), { type: "dental clinic", area: "Dwarka, Delhi", pages: 1 }); await usage(d, "google_places", true); return { ok: true, detail: r.length + " places returned" }; } catch (e) { await usage(d, "google_places", false); return { ok: false, reason: String(e.message || e) }; } }
  if (key === "search") { const r = await webSearch(env, d, "FODO digital marketing agency New Delhi"); return !r ? { ok: false, reason: "No search API key set." } : r.error ? { ok: false, reason: r.error } : { ok: true, detail: (r.web || []).length + " results" }; }
  if (key === "ai") { const r = await aiRun(env, "Reply with the single word OK.", "Say OK", 5); return r ? { ok: true, detail: r.model } : { ok: false, reason: "Workers AI is not bound or did not answer." }; }
  if (key === "dns_mx") { const s = await mxCheck(env, d, "gmail.com"); return { ok: /MX found/.test(s), detail: s }; }
  if (key === "pagespeed") { const r = await pagespeed(env, d, "https://www.fodo.co.in/"); return !r ? { ok: false, reason: "Not enabled (set PAGESPEED_API_KEY or LI_PAGESPEED=1)." } : r.error ? { ok: false, reason: r.error } : { ok: true, detail: "fodo.co.in mobile score " + r.score }; }
  if (key === "openstreetmap") { try { const r = await discover(Object.assign({}, env, { GOOGLE_PLACES_KEY: "", PAGESPEED_API_KEY: "" }), d, { industry: "cafe", city: "Dwarka", country: "India", limit: 5 }); return r.results.length ? { ok: true, detail: r.results.length + " places" } : { ok: false, reason: r.errors.join("; ") || "no results" }; } catch (e) { return { ok: false, reason: String(e.message || e) }; } }
  if (key === "database") return { ok: !!env.XRAY_DB, detail: env.XRAY_DB ? "connected" : "XRAY_DB not bound" };
  return { ok: false, reason: "This integration has no test." };
}
export async function activity(env) { const d = await ldb(env); return { items: await all(d, "SELECT kind, business_id, detail, by_email, at FROM li_activity ORDER BY id DESC LIMIT 100") }; }

/* ---------------- v55.28 import your own client data (Excel / CSV / pasted) ----------------
   Rows become ordinary leads (source "import"), so everything on a lead works for them: WhatsApp / email drafts, email send,
   Bulk pitch, outreach queue, statuses, research. Duplicates (same website, phone, email or name + city) are filled in, never doubled.
   The browser sends the rows in small chunks (D1 allows ~1,000 queries per request). */
const FREEMAIL = /^(gmail|googlemail|yahoo|ymail|rocketmail|outlook|hotmail|live|msn|icloud|me|mac|aol|rediffmail|rediff|protonmail|proton|zoho|zohomail|gmx|mail|yandex)\.[a-z.]+$/i;
const IMP_COLS = [
  ["business", /^(business|company|firm|brand|client|organi[sz]ation|shop|store|clinic|restaurant|hotel|account)( ?name)?$|^(business|company|client) name$/],
  ["person", /^(contact( ?person| ?name)?|person|owner|founder|full ?name|first ?name|decision ?maker|name of (the )?(owner|contact)|client contact)$/],
  ["name", /^name$/],
  ["role", /^(designation|role|title|position|job ?title)$/],
  ["email", /^(e ?-?mail( ?id| ?address)?|mail( ?id)?)$/],
  ["whatsapp", /^(whats ?app( ?(no|number))?|wa)$/],
  ["phone", /^(phone|mobile|mob|cell|tel|telephone|contact ?(no|number)|phone ?(no|number)|mobile ?(no|number)|number)$/],
  ["website", /^(website|web ?site|site|url|domain|web)$/],
  ["city", /^(city|town|location)$/], ["locality", /^(area|locality|sector|neighbou?rhood)$/], ["state", /^(state|region)$/],
  ["address", /^(address|full address)$/], ["industry", /^(industry|category|sector|niche|business type|type)$/],
  ["notes", /^(notes?|remarks?|comments?|details)$/], ["instagram", /^(instagram|insta|ig)$/], ["facebook", /^(facebook|fb)$/], ["linkedin", /^linked ?in$/],
];
const hnorm = (h) => String(h || "").toLowerCase().replace(/[_.\-:#*]+/g, " ").replace(/\s+/g, " ").trim();
export function importMap(header) {
  const m = {}; (header || []).forEach((h, i) => { const n = hnorm(h); for (const [k, re] of IMP_COLS) if (re.test(n) && m[k] == null) { m[k] = i; break; } });
  if (m.name != null) { if (m.business == null) m.business = m.name; else if (m.person == null) m.person = m.name; delete m.name; }
  return m;
}
export function importRow(r, m) {
  const g = (k) => (m[k] == null ? "" : String(r[m[k]] == null ? "" : r[m[k]]).trim());
  const email = cleanEmail(g("email").split(/[\s,;/]+/)[0]), phone = clip(g("phone"), 40), wa = clip(g("whatsapp"), 40);
  let web = clip(g("website"), 300); if (web && !/^https?:\/\//i.test(web) && /^[\w-]+(\.[\w-]+)+/.test(web)) web = "https://" + web; if (!/^https?:\/\/[\w-]+(\.[\w-]+)+/i.test(web)) web = "";
  let person = clip(g("person"), 120), business = clip(g("business"), 160) || person;
  if (!business && email) { const [lp, dom] = email.split("@"), tc = (t) => t.replace(/\b[a-z]/g, (c) => c.toUpperCase());   /* v55.30 email-only rows */
    if (FREEMAIL.test(dom)) { const nm = lp.replace(/[._-]+/g, " ").trim(); if (/^[a-z]{2,}( [a-z]{2,}){0,2}$/.test(nm)) { person = tc(nm); business = person; } else business = lp; }
    else business = tc(dom.split(".")[0].replace(/[-_]+/g, " ")); }
  const o = { name: business, person, role: clip(g("role"), 80), email, phone, whatsapp: wa, website: web, city: clip(g("city"), 80), locality: clip(g("locality"), 80), state: clip(g("state"), 80),
    address: clip(g("address"), 300), industry: clip(g("industry"), 80), notes: clip(g("notes"), 2000) };
  ["instagram", "facebook", "linkedin"].forEach((k) => { const v = clip(g(k), 300); o[k] = /^https?:\/\//i.test(v) ? v : ""; });
  o.error = !o.name ? "No business or contact name" : (g("email") && !email && !(phoneKey(o.phone) || phoneKey(o.whatsapp) || o.website)) ? "Email looks wrong: " + clip(g("email"), 60) : !(o.email || phoneKey(o.phone) || phoneKey(o.whatsapp) || o.website) ? "No email, phone or website" : "";
  return o;
}
/* read the file (or pasted text) and show what would be imported; nothing is saved */
export async function importPreview(env, b) {
  b = b || {}; let rows;
  if (b.file) { const CM = await import("./campaigns.js"); rows = await CM.readSheet(b.file, clip(b.filename, 120)); }
  else { const PI = await import("./pitch.js"); rows = PI.parseCsv(String(b.text || "").slice(0, 2e6).replace(/\t/g, ",")); }
  rows = (rows || []).filter((r) => r && r.some((x) => String(x || "").trim()));
  if (rows.length < 2) throw err("The sheet needs a header row (Business, Contact person, Email, Phone, City ...) and at least one client.");
  if (rows.length > 50001) throw err("Up to 50,000 clients per import. Split the sheet and import it in parts.");
  const m = importMap(rows[0]);
  if (m.business == null && m.person == null && m.email == null) throw err("Couldn't find a name or email column. Use a header such as Business name, Contact person or Email.");   /* v55.30 an email-only list is fine */
  if (m.email == null && m.phone == null && m.whatsapp == null && m.website == null) throw err("Couldn't find an Email, Phone, WhatsApp or Website column.");
  const out = rows.slice(1).map((r) => importRow(r, m));
  const fields = {}; Object.keys(m).forEach((k) => { fields[k] = String(rows[0][m[k]] || ""); });
  return { fields, headers: rows[0].map((h) => String(h || "")), rows: out, total: out.length, ok: out.filter((x) => !x.error).length, invalid: out.filter((x) => x.error).length };
}
/* v55.29 bulk import: a chunk of up to 500 rows costs a handful of D1 statements (json_each), not ~10 per row, so a 16,000-email
   database goes in through ~32 requests. Duplicates are matched on email, phone and website (name + city only when a row has
   none of them), against the database and inside the file itself. */
const IMP_FIELDS = ["name", "person", "role", "email", "phone", "whatsapp", "website", "city", "locality", "state", "address", "industry", "notes", "instagram", "facebook", "linkedin"];
async function jq(d, sql, arr) { return ((await d.prepare(sql).bind(JSON.stringify(arr)).all()).results) || []; }
export async function importRows(env, b, by) {
  const d = await ldb(env); b = b || {}; const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, 500);
  if (!rows.length) throw err("Nothing to import.");
  const status = ST.indexOf(b.status) > -1 ? b.status : "not_contacted", tag = clip(b.tag || "Imported client data", 80), t = nowIso(), off = +b.offset || 0;
  const src = "imported by " + clip(by, 120) + " (" + tag + ")";
  const res = { added: [], updated: [], skipped: [] };
  const M = {}; IMP_FIELDS.forEach((k, i) => { M[k === "name" ? "business" : k] = i; });
  const X = rows.map((raw) => { raw = raw || {}; const x = importRow(IMP_FIELDS.map((k) => raw[k]), M); x.k = { domain: siteDomain(x.website), phone_key: phoneKey(x.phone) || phoneKey(x.whatsapp), name_key: nameKey(x.name, x.city || x.locality) }; return x; });
  /* existing matches, four statements for the whole chunk */
  const uniq = (f) => [...new Set(X.map(f).filter(Boolean))];
  const byEmail = {}, byDomain = {}, byPhone = {}, byName = {};
  (await jq(d, "SELECT business_id, value FROM li_contacts WHERE kind='email' AND value IN (SELECT value FROM json_each(?1))", uniq((x) => x.email))).forEach((r) => { byEmail[r.value] = byEmail[r.value] || r.business_id; });
  (await jq(d, "SELECT id, domain FROM li_businesses WHERE domain IN (SELECT value FROM json_each(?1))", uniq((x) => x.k.domain))).forEach((r) => { byDomain[r.domain] = byDomain[r.domain] || r.id; });
  (await jq(d, "SELECT id, phone_key FROM li_businesses WHERE phone_key IN (SELECT value FROM json_each(?1))", uniq((x) => x.k.phone_key))).forEach((r) => { byPhone[r.phone_key] = byPhone[r.phone_key] || r.id; });
  const nk = uniq((x) => (!x.email && !x.k.phone_key && !x.k.domain ? x.k.name_key : ""));
  if (nk.length) (await jq(d, "SELECT id, name_key FROM li_businesses WHERE name_key IN (SELECT value FROM json_each(?1))", nk)).forEach((r) => { byName[r.name_key] = byName[r.name_key] || r.id; });
  const ins = [], upd = [], contacts = [], people = [], seen = {};
  const mark = (x, id) => { if (x.email) byEmail[x.email] = id; if (x.k.domain) byDomain[x.k.domain] = id; if (x.k.phone_key) byPhone[x.k.phone_key] = id; };
  X.forEach((x, i) => {
    const at = off + i + 1;
    if (x.error) { res.skipped.push({ row: at, name: x.name, reason: x.error }); return; }
    let id = (x.email && byEmail[x.email]) || (x.k.domain && byDomain[x.k.domain]) || (x.k.phone_key && byPhone[x.k.phone_key]) || (!x.email && !x.k.phone_key && !x.k.domain && byName[x.k.name_key]) || null;
    if (id && seen[id] === "new") { res.skipped.push({ row: at, name: x.name, reason: "Same client twice in this file" }); return; }
    if (id) {
      if (!b.update) { res.skipped.push({ row: at, name: x.name, reason: "Already in Lead Intelligence (" + id + ")", id }); return; }
      if (seen[id]) { res.skipped.push({ row: at, name: x.name, reason: "Same client twice in this file" }); return; }
      seen[id] = "upd"; upd.push({ id, website: x.website, domain: x.k.domain, phone: x.phone || x.whatsapp, phone_key: x.k.phone_key, city: x.city, locality: x.locality, industry: x.industry, email: x.email, whatsapp: x.whatsapp, person: x.person, role: x.role, notes: x.notes });
      res.updated.push({ row: at, id, name: x.name });
    } else {
      id = "LI-" + randId(8).toUpperCase(); seen[id] = "new"; mark(x, id); if (!x.email && !x.k.phone_key && !x.k.domain) byName[x.k.name_key] = id;
      ins.push({ id, name: x.name, industry: x.industry || null, address: x.address, locality: x.locality, city: x.city, state: x.state, website: x.website, domain: x.k.domain, phone: x.phone || x.whatsapp, phone_key: x.k.phone_key, name_key: x.k.name_key, email: x.email || null, whatsapp: x.whatsapp || null, owner_name: x.person || null, owner_role: x.person ? x.role || null : null, owner_conf: x.person ? "provided" : null, notes: x.notes || null });
      res.added.push({ row: at, id, name: x.name });
    }
    const C = (kind, label, v) => { if (v) contacts.push({ b: id, k: kind, l: label, v: clip(v, 400) }); };
    C("email", x.email ? mailKind(x.email) : "", x.email); C("phone", "Phone", x.phone); C("whatsapp", "WhatsApp", x.whatsapp); C("website", "Website", x.website);
    C("instagram", "Instagram", x.instagram); C("facebook", "Facebook", x.facebook); C("linkedin", "LinkedIn", x.linkedin);
    if (x.person) people.push({ b: id, n: x.person, r: x.role || "" });
  });
  const J = (o, k) => "json_extract(value,'$." + k + "')";
  const st = [];
  if (ins.length) st.push(d.prepare("INSERT INTO li_businesses (id,name,industry,category,address,locality,city,state,country,website,domain,phone,phone_key,name_key,email,whatsapp,owner_name,owner_role,owner_conf,notes,source,source_ref,status,created_at,updated_at) SELECT " +
    ["id", "name", "industry", "industry", "address", "locality", "city", "state"].map((k) => J(0, k)).join(",") + ",'India'," + ["website", "domain", "phone", "phone_key", "name_key", "email", "whatsapp", "owner_name", "owner_role", "owner_conf", "notes"].map((k) => J(0, k)).join(",") + ",'import',?2,?3,?4,?4 FROM json_each(?1)").bind(JSON.stringify(ins), tag, status, t));
  if (upd.length) st.push(d.prepare("UPDATE li_businesses SET website=COALESCE(NULLIF(li_businesses.website,''),NULLIF(j.website,'')), domain=COALESCE(NULLIF(li_businesses.domain,''),NULLIF(j.domain,'')), phone=COALESCE(NULLIF(li_businesses.phone,''),NULLIF(j.phone,'')), phone_key=COALESCE(NULLIF(li_businesses.phone_key,''),NULLIF(j.phone_key,'')), city=COALESCE(NULLIF(li_businesses.city,''),NULLIF(j.city,'')), locality=COALESCE(NULLIF(li_businesses.locality,''),NULLIF(j.locality,'')), industry=COALESCE(NULLIF(li_businesses.industry,''),NULLIF(j.industry,'')), email=COALESCE(NULLIF(li_businesses.email,''),NULLIF(j.email,'')), whatsapp=COALESCE(NULLIF(li_businesses.whatsapp,''),NULLIF(j.whatsapp,'')), " +
    "owner_role=CASE WHEN COALESCE(li_businesses.owner_name,'')='' THEN NULLIF(j.role,'') ELSE li_businesses.owner_role END, owner_conf=CASE WHEN COALESCE(li_businesses.owner_name,'')='' AND COALESCE(j.person,'')<>'' THEN 'provided' ELSE li_businesses.owner_conf END, owner_name=COALESCE(NULLIF(li_businesses.owner_name,''),NULLIF(j.person,'')), " +
    "notes=CASE WHEN COALESCE(j.notes,'')='' THEN li_businesses.notes WHEN COALESCE(li_businesses.notes,'')='' THEN j.notes ELSE li_businesses.notes || char(10) || j.notes END, updated_at=?2 FROM (SELECT " +
    ["id", "website", "domain", "phone", "phone_key", "city", "locality", "industry", "email", "whatsapp", "person", "role", "notes"].map((k) => J(0, k) + " AS " + k).join(",") + " FROM json_each(?1)) AS j WHERE li_businesses.id=j.id").bind(JSON.stringify(upd), t));
  if (ins.length && status !== "new") st.push(d.prepare("INSERT INTO li_outreach (business_id, from_status, to_status, channel, note, by_email, at) SELECT json_extract(value,'$.id'),'new',?2,'import',?3,?4,?5 FROM json_each(?1)").bind(JSON.stringify(ins.map((x) => ({ id: x.id }))), status, tag, clip(by, 254), t));
  if (contacts.length) st.push(d.prepare("INSERT OR IGNORE INTO li_contacts (business_id, kind, label, value, source_url, status, checked_at) SELECT " + ["b", "k", "l", "v"].map((k) => J(0, k)).join(",") + ",'',?2,?3 FROM json_each(?1)").bind(JSON.stringify(contacts), clip(src, 80), t));
  if (people.length) st.push(d.prepare("INSERT OR IGNORE INTO li_people (business_id, name, role, profile_url, confidence, source_url, evidence, found_at) SELECT " + J(0, "b") + "," + J(0, "n") + "," + J(0, "r") + ",'','provided','',?2,?3 FROM json_each(?1)").bind(JSON.stringify(people), "From your own client data (" + tag + ")", t));
  if (st.length) await d.batch(st);
  if (res.added.length || res.updated.length) await act(d, "import", null, tag + ": " + res.added.length + " added, " + res.updated.length + " updated, " + res.skipped.length + " skipped", by);
  return res;
}
/* the imported client databases, one card each */
export async function imports(env) {
  const d = await ldb(env);
  const r = (await d.prepare("SELECT source_ref AS list, COUNT(*) AS total, SUM(CASE WHEN COALESCE(email,'')<>'' THEN 1 ELSE 0 END) AS emails, SUM(CASE WHEN COALESCE(phone_key,'')<>'' OR COALESCE(whatsapp,'')<>'' THEN 1 ELSE 0 END) AS phones, SUM(CASE WHEN status NOT IN ('new','not_contacted') THEN 1 ELSE 0 END) AS contacted, SUM(CASE WHEN email_check='ok' THEN 1 ELSE 0 END) AS valid, SUM(CASE WHEN email_check='risky' THEN 1 ELSE 0 END) AS risky, SUM(CASE WHEN email_check IN ('invalid','test','blocked') THEN 1 ELSE 0 END) AS bad, SUM(CASE WHEN email_check IS NULL AND COALESCE(email,'')<>'' THEN 1 ELSE 0 END) AS unchecked, MIN(created_at) AS first, MAX(updated_at) AS last FROM li_businesses WHERE source='import' AND archived=0 GROUP BY source_ref ORDER BY MAX(created_at) DESC LIMIT 200").all()).results || [];
  return { lists: r };
}

/* ---------------- v55.31 email list cleaning ----------------
   Before a marketing email goes out, each address is checked: format, Gmail rules, throwaway inbox services, no-reply and
   role addresses, test / demo accounts, your own Never-email list (words or domains), and whether the domain has a mail server
   (DNS MX, cached 30 days). Invalid, test and blocked addresses are never emailed; risky ones are flagged for a look. */
const DISPOSABLE = new Set(("mailinator.com guerrillamail.com guerrillamail.net sharklasers.com grr.la 10minutemail.com 10minutemail.net temp-mail.org tempmail.com tempmail.net tempmailo.com " +
  "yopmail.com yopmail.fr trashmail.com trashmail.de getnada.com nada.email maildrop.cc dispostable.com mohmal.com emailondeck.com throwawaymail.com fakeinbox.com mintemail.com " +
  "mailnesia.com mytemp.email tempail.com tempr.email discard.email spamgourmet.com burnermail.io moakt.com inboxkitten.com mailcatch.com emailfake.com armyspy.com cuvox.de " +
  "dayrep.com einrot.com fleckens.hu gustr.com jourrapide.com rhyta.com superrito.com teleworm.us mailpoof.com tmail.ws tmpmail.org tmpmail.net emailnax.com 1secmail.com " +
  "1secmail.org 1secmail.net mail.tm tempinbox.com spambox.us mvrht.net mailsac.com inboxbear.com fexpost.com fexbox.org owlymail.com").split(" "));
const ROLE_BAD = /^(no-?reply|do-?not-?reply|donotreply|mailer-?daemon|postmaster|bounces?|abuse|spam|root|null|devnull)([.+_-]|$)/;
const ROLE_RISKY = /^(admin|webmaster|hostmaster|security|privacy|legal|billing|accounts?|payroll|careers|jobs|hr|recruit(ing|ment)?|support|helpdesk|unsubscribe)([.+_-]\w*)?$/;
const TESTY = /(^|[._+-])(test(ing)?|demo|dummy|fake|sample|example|qwerty|asdf(gh)?|xyz|temp|trial|sandbox)\d*([._+-]|$)/;
const FAKE_DOMAIN = /^(example|test|testing|sample|domain|email|mail|abc|xyz|asdf)\.(com|in|org|net)$|\.(test|example|invalid|localhost)$/;
export const CHECK_LABEL = { ok: "Valid", risky: "Risky", invalid: "Invalid", test: "Test / demo account", blocked: "On your Never-email list" };
const BAD_CHECK = ["invalid", "test", "blocked"];
export const DEFAULT_BLOCK = ["quickads", "88ventures", "brandbooster"];
export async function blockList(env, b) {
  if (b && Array.isArray(b.words)) { const w = [...new Set(b.words.map((x) => String(x || "").toLowerCase().trim().replace(/^@/, "")).filter((x) => x.length >= 3 && x.length <= 60))].slice(0, 300); await env.CHAT_KV.put("li:blocklist", JSON.stringify(w)); return { words: w }; }
  const v = J(await env.CHAT_KV.get("li:blocklist"), null); return { words: Array.isArray(v) ? v : DEFAULT_BLOCK.slice() };
}
const squash = (t) => String(t || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9.@-]/g, "");
/* pure part (no network): returns [check, reason] or null when only the MX check is left */
export function emailVerdict(email, name, words) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return ["invalid", "No email"];
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(e) || /\.\.|^\.|\.@/.test(e)) return ["invalid", "Not a valid email address"];
  const [lp, dom] = e.split("@"), base = lp.split("+")[0], hay = squash(e) + " " + squash(name).replace(/[.@-]/g, "");
  const w = (words || []).find((x) => { const k = squash(x).replace(/^@/, ""); return k && (dom === k || dom.endsWith("." + k) || hay.indexOf(k.replace(/[.@-]/g, "")) > -1 || hay.indexOf(k) > -1); });
  if (w) return ["blocked", "Matches \"" + w + "\" on your Never-email list"];
  if (FAKE_DOMAIN.test(dom)) return ["invalid", "Placeholder domain (" + dom + ")"];
  if (DISPOSABLE.has(dom)) return ["invalid", "Throwaway inbox service (" + dom + ")"];
  if (ROLE_BAD.test(base)) return ["invalid", "No-reply / system address"];
  if (/^(gmail|googlemail)\.com$/.test(dom)) { const g = base.replace(/\./g, ""); if (g.length < 6 || g.length > 30 || !/^[a-z0-9]+$/.test(g)) return ["invalid", "Gmail addresses are 6 to 30 letters or numbers"]; }
  if (TESTY.test(base) || /^(test|demo)/.test(base)) return ["test", "Looks like a test / demo account"];
  if (/^(.)\1{4,}$/.test(base) || /^\d{1,4}$/.test(base)) return ["test", "Looks made up (" + base + ")"];
  if (ROLE_RISKY.test(base)) return ["risky", "Team / role inbox (" + base + "@)"];
  if (lp.indexOf("+") > -1) return ["risky", "Sign-up alias with + (" + lp + ")"];
  return null;
}
async function mxOk(env, d, dom) {
  if (FREEMAIL.test(dom) || /^(gmail|yahoo|outlook|hotmail|icloud|proton|zoho)\./.test(dom)) return true;
  const k = "li:mx:" + dom, c = await env.CHAT_KV.get(k); if (c === "1") return true; if (c === "0") return false;
  const r = await mxCheck(env, d, dom); if (r === "not checked") return null;
  const okk = /MX found/.test(r); await env.CHAT_KV.put(k, okk ? "1" : "0", { expirationTtl: 30 * 86400 }); return okk;
}
/* one step: up to 500 rows of one database (or all imports), at most 40 new domains looked up; the browser calls until done */
export async function emailCheck(env, b, by) {
  const d = await ldb(env); b = b || {}; const words = (await blockList(env)).words;
  const where = ["COALESCE(email,'')<>''", "email_check IS NULL"], a = []; if (b.list) { a.push(clip(b.list, 80)); where.push("source_ref=?" + a.length); } else if (b.source) { a.push(clip(b.source, 30)); where.push("source=?" + a.length); }
  if (b.recheck) await d.prepare("UPDATE li_businesses SET email_check=NULL, email_reason=NULL WHERE " + where.filter((w) => w !== "email_check IS NULL").join(" AND ")).bind(...a).run();   /* start over (e.g. after editing the Never-email list) */
  const rows = await all(d, "SELECT id, name, email FROM li_businesses WHERE " + where.join(" AND ") + " ORDER BY id LIMIT 500", ...a);
  const out = [], cnt = { ok: 0, risky: 0, invalid: 0, test: 0, blocked: 0, waiting: 0 }, mx = {}, V = rows.map((r) => emailVerdict(r.email, r.name, words));
  /* mail-server lookups: cached ones first, then up to 40 new domains per step, 10 at a time */
  const doms = [...new Set(rows.filter((r, i) => !V[i]).map((r) => String(r.email).toLowerCase().split("@")[1]))], fresh = [];
  for (const dom of doms) { if (FREEMAIL.test(dom) || /^(gmail|yahoo|outlook|hotmail|icloud|proton|zoho)\./.test(dom)) { mx[dom] = true; continue; } const c = await env.CHAT_KV.get("li:mx:" + dom); if (c === "1" || c === "0") mx[dom] = c === "1"; else fresh.push(dom); }
  const now = fresh.slice(0, 40);
  for (let i = 0; i < now.length; i += 10) { const part = now.slice(i, i + 10); const res = await Promise.all(part.map((dom) => mxOk(env, d, dom))); part.forEach((dom, k) => { mx[dom] = res[k]; }); }
  rows.forEach((r, i) => {
    let v = V[i];
    if (!v) { const dom = String(r.email).toLowerCase().split("@")[1]; if (!(dom in mx)) { cnt.waiting++; return; }
      v = mx[dom] === false ? ["invalid", "The domain " + dom + " has no mail server"] : mx[dom] === null ? ["risky", "Mail server could not be checked"] : ["ok", ""]; }
    cnt[v[0]]++; out.push({ id: r.id, c: v[0], r: v[1] });
  });
  if (out.length) await d.prepare("UPDATE li_businesses SET email_check=j.c, email_reason=NULLIF(j.r,'') FROM (SELECT json_extract(value,'$.id') AS id, json_extract(value,'$.c') AS c, json_extract(value,'$.r') AS r FROM json_each(?1)) AS j WHERE li_businesses.id=j.id").bind(JSON.stringify(out)).run();
  const left = ((await one(d, "SELECT COUNT(*) AS n FROM li_businesses WHERE " + where.join(" AND "), ...a)) || {}).n || 0, done = left === 0;
  if (done && out.length) await act(d, "email_check", null, (b.list || b.source || "all") + " emails checked", by);
  return { checked: out.length, counts: cnt, left, done };
}

/* ---------------- v55.36 auto email: the FODO services email to every lead still to contact, one by one ----------------
   Runs from the hourly background job (and "Send next batch now"). Only leads with a checked, valid email that were never emailed.
   Speed is capped by the hourly client-mail limit (CLIENT_MAIL_HOURLY, default 20) and the daily limit chosen when starting. */
const AUTO = "li:auto";
async function autoState(env) { return Object.assign({ on: false, list: "", per_day: 150, sent_today: 0, day: "", total: 0, skip: [] }, J(await env.CHAT_KV.get(AUTO), {}) || {}); }
async function autoSave(env, st) { st.skip = (st.skip || []).slice(-3000); await env.CHAT_KV.put(AUTO, JSON.stringify(st)); }
function autoWhere(st) {
  const w = ["archived=0", "status IN ('new','not_contacted')", "COALESCE(email,'')<>''", "email_check='ok'",
    "NOT EXISTS (SELECT 1 FROM cm_sends s WHERE lower(s.email)=lower(li_businesses.email) AND s.status='sent' AND COALESCE(s.test,0)=0)",
    "id NOT IN (SELECT value FROM json_each(?1))"], a = [JSON.stringify(st.skip || [])];
  if (st.list) { a.push(st.list); w.push("source_ref=?2"); }
  return { sql: " WHERE " + w.join(" AND "), a };
}
async function autoNext(env, d, st, n) { const W = autoWhere(st); return all(d, "SELECT * FROM li_businesses" + W.sql + " ORDER BY created_at, id LIMIT " + Math.max(1, Math.min(50, n)), ...W.a); }
export async function autoStatus(env, q) {
  if (!env.CHAT_KV) throw err("Auto email needs CHAT_KV storage.", 503);
  const d = await ldb(env), OR = await import("./outreach.js"); await OR.cmDb(env); q = q || {};
  const st = await autoState(env), probe = Object.assign({}, st, { list: q.list != null && !st.on ? clip(q.list, 80) : st.list }), W = autoWhere(probe);
  const left = ((await one(d, "SELECT COUNT(*) AS n FROM li_businesses" + W.sql, ...W.a)) || {}).n || 0;
  const unchecked = ((await one(d, "SELECT COUNT(*) AS n FROM li_businesses WHERE archived=0 AND status IN ('new','not_contacted') AND COALESCE(email,'')<>'' AND email_check IS NULL" + (probe.list ? " AND source_ref=?1" : ""), ...(probe.list ? [probe.list] : []))) || {}).n || 0;
  const files = (await alwaysFiles(env)).files, first = (await autoNext(env, d, probe, 1))[0];
  let preview = null; if (first) { const m = servicesEmail(first); preview = { lead: first.name, to: first.email, subject: m.subject, html: (await emailRender(env, first.id, { subject: m.subject, blocks: m.blocks, attachments: files.map((f) => f.id) }, first.email)).html }; }
  return { auto: Object.assign({}, st, { skip: undefined, skipped: (st.skip || []).length }), left, unchecked, list: probe.list, files, hourly: OR.hourly(env), preview };
}
export async function autoSet(env, b, by) {
  b = b || {}; const st = await autoState(env), t = nowIso();
  if (b.action === "pause") { st.on = false; st.paused_at = t; await autoSave(env, st); return autoStatus(env); }
  if (b.action === "test") {
    const d = await ldb(env), first = (await autoNext(env, d, Object.assign({}, st, { list: b.list != null ? clip(b.list, 80) : st.list }), 1))[0];
    if (!first) throw err("No lead is waiting for the auto email.");
    const m = servicesEmail(first), files = (await alwaysFiles(env)).files;
    const r = await emailSend(env, first.id, { test: true, subject: m.subject, blocks: m.blocks, attachments: files.map((f) => f.id) }, by);
    st.tested_at = t; await autoSave(env, st); return Object.assign(await autoStatus(env, { list: b.list }), { test: r.sent });
  }
  if (b.action === "start") {
    if (!b.confirm) throw err("Please confirm first.", 400);
    if (!st.tested_at) throw err("Send yourself a test first, so you have seen exactly what clients get.", 400);
    Object.assign(st, { on: true, list: clip(b.list || "", 80), per_day: Math.max(10, Math.min(500, parseInt(b.per_day, 10) || 150)), by: clip(by, 254), started_at: t, done_at: null, last_error: null });
    await autoSave(env, st); return autoStatus(env);
  }
  if (b.action === "run") { const r = await autoTick(env, 25000, true); return Object.assign(await autoStatus(env), { run: r }); }
  throw err("Unknown action.");
}
export async function autoTick(env, budgetMs, manual) {
  if (!env.CHAT_KV) return { skipped: "no KV" };
  const st = await autoState(env); if (!st.on) return { off: true };
  const t0 = Date.now(), day = nowIso().slice(0, 10), OR = await import("./outreach.js"), d = await ldb(env); await OR.cmDb(env);
  if (st.day !== day) { st.day = day; st.sent_today = 0; }
  const room = Math.min(st.per_day - st.sent_today, OR.hourly(env) - (await OR.usedThisHour(env)), 15);
  if (room <= 0) { await autoSave(env, st); return { sent: 0, waiting: st.sent_today >= st.per_day ? "daily limit reached" : "hourly limit reached" }; }
  const L = await autoNext(env, d, st, room), files = (await alwaysFiles(env)).files.map((f) => f.id);
  if (!L.length) { st.on = false; st.done_at = nowIso(); await autoSave(env, st); return { sent: 0, done: true }; }
  let sent = 0, errs = 0;
  for (const x of L) {
    if (Date.now() - t0 > (budgetMs || 35000)) break;
    const m = servicesEmail(x);
    try { await emailSend(env, x.id, { to: x.email, subject: m.subject, blocks: m.blocks, attachments: files, confirm: true }, st.by || "auto@fodo.co.in"); sent++; st.sent_today++; st.total = (st.total || 0) + 1; st.last_at = nowIso(); st.last_to = x.email; errs = 0; }
    catch (e) {
      const code = e.status || 500, msg = String(e.message || e).slice(0, 200);
      if (code === 429) { st.last_error = msg; break; }
      if (code === 409 || code === 400) { st.skip = (st.skip || []).concat(x.id); continue; }   /* opted out, do not contact, flagged: never again */
      st.last_error = msg; st.last_error_at = nowIso(); errs++;
      if (code === 503 || errs >= 3) { st.on = false; st.paused_at = nowIso(); st.paused_why = msg; break; }   /* sending is not connected or keeps failing: stop and show why */
    }
  }
  await autoSave(env, st);
  return { sent, manual: !!manual, today: st.sent_today, total: st.total, on: st.on, error: st.on ? null : st.paused_why || null };
}
