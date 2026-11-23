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
const UA = "FODO-LeadIntelligence/1.0 (+https://www.fodo.co.in; anmol@fodo.co.in)";

export const STATUSES = [["new", "New"], ["not_contacted", "Not contacted"], ["contacted", "Contacted"], ["email_sent", "Email sent"], ["called", "Called"], ["interested", "Interested"],
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
  /* business_contacts */
  "CREATE TABLE IF NOT EXISTS li_contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT, kind TEXT, label TEXT, value TEXT, source_url TEXT, status TEXT, checked_at TEXT, UNIQUE(business_id, kind, value))",
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
];
export async function ldb(env) {
  const d = await adb(env); if (!d) throw err("Database not connected.", 503);
  await SCH.setup(d, "leadintel", async () => { await SCH.ddl(d, DDL); });
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
  if (env.GOOGLE_PLACES_KEY) {
    try {
      const res = await googleSearch(env.GOOGLE_PLACES_KEY, { type: q, area, center: null, radius: 0, rect: null, pages: Math.ceil(f.limit / 20) });
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
  return { source: env.GOOGLE_PLACES_KEY ? "google_places" : "openstreetmap", errors, results: [] };
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
    if (/html|xml|text/i.test(type) || !type) { html = await r.text(); if (html.length > MAX_HTML) html = html.slice(0, MAX_HTML); } else { try { r.body && r.body.cancel(); } catch (e) {} }
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
  let m; while ((m = a.exec(txt)) && out.length < 8) { const role = (m[0].match(new RegExp(ROLE, "i")) || [""])[0]; push(m[1], role, "verified", "Official website text: \"" + clip(m[0], 120) + "\""); }
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
    await usage(d, prov, r.ok); if (!r.ok) return { error: prov + " " + r.status };
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
  return { lead: b, contacts: await all(d, "SELECT kind,label,value,source_url,status,checked_at FROM li_contacts WHERE business_id=?1 ORDER BY kind", b.id),
    people: await all(d, "SELECT name,role,profile_url,confidence,source_url,evidence,found_at FROM li_people WHERE business_id=?1 ORDER BY CASE confidence WHEN 'verified' THEN 0 WHEN 'partial' THEN 1 ELSE 2 END", b.id),
    audit: au ? Object.assign({ at: au.at, url: au.url, summary: au.summary, ai_summary: au.ai_summary, ai_model: au.ai_model }, { checks: J(au.data, {}) }) : null,
    opportunities: await all(d, "SELECT service,problem,evidence,why,value,angle,kind FROM li_opps WHERE business_id=?1", b.id),
    score: sc ? { total: sc.total, parts: J(sc.parts, []), at: sc.at } : null,
    history: await all(d, "SELECT from_status,to_status,channel,note,by_email,at FROM li_outreach WHERE business_id=?1 ORDER BY id DESC LIMIT 50", b.id),
    sources: await all(d, "SELECT url, kind, http, at FROM li_sources WHERE business_id=?1", b.id), opted_out: unsub };
}
const SORTS = { score: "COALESCE(score,-1) DESC", newest: "created_at DESC", name: "name COLLATE NOCASE", updated: "updated_at DESC", reviews: "COALESCE(reviews,-1) DESC" };
export async function list(env, q) {
  const d = await ldb(env); q = q || {}; const w = [], a = [];
  const add = (sql, v) => { a.push(v); w.push(sql.replace(/\?/g, "?" + a.length)); };
  if (q.archived === "1") w.push("archived=1"); else w.push("archived=0");
  if (q.q) { const s = "%" + clip(q.q, 80).toLowerCase() + "%"; a.push(s); const n = a.length; w.push("(lower(name) LIKE ?" + n + " OR lower(COALESCE(website,'')) LIKE ?" + n + " OR lower(COALESCE(owner_name,'')) LIKE ?" + n + " OR lower(COALESCE(email,'')) LIKE ?" + n + " OR lower(id) LIKE ?" + n + ")"); }
  if (q.industry) add("industry=?", clip(q.industry, 80));
  if (q.city) add("lower(city)=?", clip(q.city, 80).toLowerCase());
  if (q.status) add("status=?", clip(q.status, 30));
  if (q.priority) add("priority=?", clip(q.priority, 10));
  if (q.source) add("source=?", clip(q.source, 30));
  if (q.website === "has") w.push("COALESCE(website,'')<>''"); if (q.website === "none") w.push("COALESCE(website,'')=''");
  if (q.people) add("owner_conf=?", clip(q.people, 20));
  if (q.researched === "1") w.push("researched_at IS NOT NULL"); if (q.researched === "0") w.push("researched_at IS NULL");
  if (q.min) add("COALESCE(score,0)>=?", +q.min || 0);
  if (q.from) add("created_at>=?", clip(q.from, 10)); if (q.to) add("created_at<=?", clip(q.to, 10) + "T99");
  const where = w.length ? " WHERE " + w.join(" AND ") : "", lim = Math.max(1, Math.min(1000, +q.limit || 200));
  const rows = await all(d, "SELECT id,name,industry,sub_industry,category,locality,city,website,phone,email,whatsapp,owner_name,owner_role,owner_conf,score,priority,status,source,rating,reviews,researched_at,created_at,updated_at,archived FROM li_businesses" + where + " ORDER BY " + (SORTS[q.sort] || SORTS.score) + " LIMIT " + lim, ...a);
  const total = ((await one(d, "SELECT COUNT(*) AS n FROM li_businesses" + where, ...a)) || {}).n || 0;
  return { leads: rows, total };
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

/* ---------------- outreach drafts (never sent from here) ---------------- */
export async function drafts(env, id, b) {
  const L = await lead(env, id), x = L.lead; b = b || {};
  if (x.status === "dnc" || L.opted_out) throw err("This business is marked Do not contact (or opted out). No drafts.", 409);
  const ch = ["email", "linkedin", "whatsapp", "followup", "opener"].indexOf(b.channel) > -1 ? b.channel : "email";
  const facts = L.opportunities.filter((o) => o.kind === "observed").slice(0, 3).map((o) => "- " + o.problem + ": " + o.evidence).join("\n") || "- no website problems recorded";
  const who = x.owner_name && x.owner_conf !== "unverified" ? x.owner_name : "";
  const limits = { email: "an email of 90 to 130 words with a subject line first as 'Subject: ...'", linkedin: "a LinkedIn connection message under 280 characters", whatsapp: "a WhatsApp message under 60 words", followup: "a short follow-up email of 50 to 80 words with 'Subject: ...' first", opener: "three different one-sentence opening lines, one per line" }[ch];
  const ai = await aiRun(env, "You write honest B2B outreach for FODO (Fear Of Digitally Out ?), a digital growth agency in New Delhi. Sign off as 'Anmol, FODO'. Use only the facts given, never invent results, clients, numbers or claims about their ads. Friendly, specific, no hype, no markdown, no long dashes, never use the word free. Include no links except https://www.fodo.co.in.",
    "Write " + limits + " to " + (who || "the team at " + x.name) + " at " + x.name + " (" + [x.category || x.industry, x.locality || x.city].filter(Boolean).join(", ") + ").\nWhat we observed:\n" + facts + "\nOffer: a short call to share 2 or 3 fixes.", ch === "email" ? 400 : 250);
  if (ai) return { channel: ch, text: ai.text, ai: true, model: ai.model };
  const first = (L.opportunities[0] || {}), hi = who ? "Hi " + who.split(" ").filter((w) => !/^(Dr|Mr|Ms|Mrs|CA|Adv)\.?$/.test(w))[0] : "Hi " + x.name + " team";
  const T = { email: "Subject: A quick idea for " + x.name + "\n\n" + hi + ",\n\nI'm Anmol from FODO, a growth studio in New Delhi. " + (first.angle || "I came across " + x.name + " while researching businesses in " + (x.city || "your area") + ".") + "\n\nWe help businesses like yours fix exactly this and turn it into more enquiries. Would a 15-minute call this week be useful? I can share two or three specific fixes.\n\nRegards,\nAnmol, FODO\nhttps://www.fodo.co.in",
    linkedin: hi + ", I'm Anmol from FODO (New Delhi). " + (first.angle || "I came across " + x.name + ".") + " Happy to share a couple of quick fixes if useful.",
    whatsapp: hi + ", this is Anmol from FODO, New Delhi. " + (first.angle || "I came across " + x.name + ".") + " Can I share 2 quick fixes on a short call?",
    followup: "Subject: Re: A quick idea for " + x.name + "\n\n" + hi + ", just following up on my note about " + (first.problem || "your online presence").toLowerCase() + ". Happy to share the fixes over a 15-minute call whenever suits you.\n\nAnmol, FODO",
    opener: L.opportunities.slice(0, 3).map((o) => o.angle).join("\n") || "I came across " + x.name + " while researching " + (x.industry || "businesses") + " in " + (x.city || "your city") + "." };
  return { channel: ch, text: T[ch], ai: false, template: true };
}
/* hand leads with a public email to a Bulk pitch campaign (sending stays there, with its test-first and confirm rules) */
export async function toPitch(env, b, by) {
  const d = await ldb(env), ids = (Array.isArray(b.ids) ? b.ids : []).slice(0, 500), lines = ["name,business,email,city"]; let skipped = 0;
  for (const id of ids) {
    const x = await one(d, "SELECT * FROM li_businesses WHERE id=?1", clip(id, 20)); if (!x || !x.email || x.status === "dnc") { skipped++; continue; }
    const nm = x.owner_conf === "verified" || x.owner_conf === "partial" ? x.owner_name || "" : "";
    lines.push([nm, x.name, x.email, x.city || ""].map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(","));
  }
  if (lines.length < 2) throw err("None of the selected leads has a public email (or they are marked Do not contact).");
  const PI = await import("./pitch.js"); const r = await PI.loadRecipients(env, clip(b.campaign_id, 40), { csv: lines.join("\n"), append: true });
  await act(d, "to_pitch", null, (lines.length - 1) + " leads → " + b.campaign_id, by);
  return { added: r.counts.queued, counts: r.counts, skipped };
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
    { key: "google_places", name: "Google Places API", configured: !!env.GOOGLE_PLACES_KEY, secret: "GOOGLE_PLACES_KEY", role: "Business discovery with phone, website, rating and reviews.", cost: "Text Search Pro: about US$32 per 1,000 requests (each request returns up to 20 places); Google gives a monthly free usage cap per SKU. Set a budget alert in Google Cloud.", usage: u("google_places") },
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
  if (key === "google_places") { if (!env.GOOGLE_PLACES_KEY) return { ok: false, reason: "GOOGLE_PLACES_KEY is not set." }; try { const r = await googleSearch(env.GOOGLE_PLACES_KEY, { type: "dental clinic", area: "Dwarka, Delhi", pages: 1 }); await usage(d, "google_places", true); return { ok: true, detail: r.length + " places returned" }; } catch (e) { await usage(d, "google_places", false); return { ok: false, reason: String(e.message || e) }; } }
  if (key === "search") { const r = await webSearch(env, d, "FODO digital marketing agency New Delhi"); return !r ? { ok: false, reason: "No search API key set." } : r.error ? { ok: false, reason: r.error } : { ok: true, detail: (r.web || []).length + " results" }; }
  if (key === "ai") { const r = await aiRun(env, "Reply with the single word OK.", "Say OK", 5); return r ? { ok: true, detail: r.model } : { ok: false, reason: "Workers AI is not bound or did not answer." }; }
  if (key === "dns_mx") { const s = await mxCheck(env, d, "gmail.com"); return { ok: /MX found/.test(s), detail: s }; }
  if (key === "pagespeed") { const r = await pagespeed(env, d, "https://www.fodo.co.in/"); return !r ? { ok: false, reason: "Not enabled (set PAGESPEED_API_KEY or LI_PAGESPEED=1)." } : r.error ? { ok: false, reason: r.error } : { ok: true, detail: "fodo.co.in mobile score " + r.score }; }
  if (key === "openstreetmap") { try { const r = await discover(Object.assign({}, env, { GOOGLE_PLACES_KEY: "" }), d, { industry: "cafe", city: "Dwarka", country: "India", limit: 5 }); return r.results.length ? { ok: true, detail: r.results.length + " places" } : { ok: false, reason: r.errors.join("; ") || "no results" }; } catch (e) { return { ok: false, reason: String(e.message || e) }; } }
  if (key === "database") return { ok: !!env.XRAY_DB, detail: env.XRAY_DB ? "connected" : "XRAY_DB not bound" };
  return { ok: false, reason: "This integration has no test." };
}
export async function activity(env) { const d = await ldb(env); return { items: await all(d, "SELECT kind, business_id, detail, by_email, at FROM li_activity ORDER BY id DESC LIMIT 100") }; }
