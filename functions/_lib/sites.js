/* FODO Website Builder — server library (v28). Architecture: docs/website-builder-architecture.md · docs/tenant-security.md
   TENANT RULE: every function that touches a website takes the AUTHENTICATED user (from the server session) and resolves the
   website with siteFor(): the site's owner_user_id must be that user — or the user is a FODO owner (global access, audited).
   A site id from the browser is only a lookup key; a stranger's id answers "not found" (no hint that it exists).
   The client AI only ever sees ONE website's document and can only return edits to it. */
import { db as accountsDb, isOwner, activePlan, nowIso, randId, sha256, sendMail } from "./accounts.js";
import { SECTION_TYPES, renderPage, checkSite, themeCss, sitemap, sanitizeCss, PLACEHOLDER, FONTS } from "../../sites/lib/render.js";
import { TEMPLATES, templateById, searchTemplates, why, clientAllowed, SOURCES, FODO_LICENSE } from "../../sites/lib/templates.js";
import { brainAI, parseJson } from "./brain/models.js";
import { safeUrl as netSafe, safeFetch } from "./xray-core.js";
import { planSitemap, buildDoc, designFor, parsePrompt, findIndustry, PROFILES, sectionDefaults } from "../../sites/lib/industry.js";
import { audit, autoFix } from "../../sites/lib/audit.js";
import { STYLES, PALETTES, PAIRINGS, MOTION_LEVELS, BUTTONS, SHADOWS, DENSITY, CONTAINERS, HOVERS } from "../../sites/lib/design.js";

const DDL = [
  "CREATE TABLE IF NOT EXISTS sites (id TEXT PRIMARY KEY, tenant_id TEXT, owner_user_id TEXT, name TEXT, slug TEXT UNIQUE, status TEXT, doc TEXT, rev INTEGER, published TEXT, published_at TEXT, template_id TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT)",
  "CREATE INDEX IF NOT EXISTS sites_owner ON sites(owner_user_id)",
  "CREATE TABLE IF NOT EXISTS site_versions (id TEXT PRIMARY KEY, site_id TEXT, rev INTEGER, doc TEXT, note TEXT, by_user TEXT, created_at TEXT)",
  "CREATE INDEX IF NOT EXISTS site_versions_site ON site_versions(site_id, created_at)",
  "CREATE TABLE IF NOT EXISTS site_domains (id TEXT PRIMARY KEY, site_id TEXT, domain TEXT UNIQUE, token TEXT, status TEXT, detail TEXT, ssl TEXT, checked_at TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS site_forms (id TEXT PRIMARY KEY, site_id TEXT, page TEXT, data TEXT, ip_hash TEXT, created_at TEXT)",
  "CREATE INDEX IF NOT EXISTS site_forms_site ON site_forms(site_id, created_at)",
  "CREATE TABLE IF NOT EXISTS site_stats (site_id TEXT, day TEXT, path TEXT, metric TEXT, n INTEGER, PRIMARY KEY (site_id, day, path, metric))",
  "CREATE TABLE IF NOT EXISTS site_media (id TEXT PRIMARY KEY, site_id TEXT, mime TEXT, size INTEGER, name TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS site_ai (id TEXT PRIMARY KEY, site_id TEXT, by_user TEXT, kind TEXT, prompt TEXT, result TEXT, created_at TEXT)",
  /* v32 */
  "CREATE TABLE IF NOT EXISTS site_shares (token TEXT PRIMARY KEY, site_id TEXT, created_by TEXT, note TEXT, expires_at TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS site_reviews (id TEXT PRIMARY KEY, site_id TEXT, token TEXT, decision TEXT, comment TEXT, name TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS site_members (site_id TEXT, email TEXT, role TEXT, added_by TEXT, created_at TEXT, PRIMARY KEY (site_id, email))",
  "CREATE TABLE IF NOT EXISTS site_templates (id TEXT PRIMARY KEY, name TEXT, category TEXT, tags TEXT, doc TEXT, by_user TEXT, active INTEGER, created_at TEXT)",
];
const MIGRATE = ["ALTER TABLE sites ADD COLUMN archived_at TEXT", "ALTER TABLE sites ADD COLUMN review TEXT", "ALTER TABLE sites ADD COLUMN industry TEXT"];
const made = new WeakSet();
export async function sdb(env) { const d = await accountsDb(env); if (!d) return null; if (!made.has(d)) { await d.batch(DDL.map((s) => d.prepare(s))); for (const m of MIGRATE) { try { await d.prepare(m).run(); } catch (e) { /* column exists */ } } made.add(d); } return d; }
const clip = (s, n) => { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n) : s; };
const err = (msg, status) => Object.assign(new Error(msg), { status: status || 400 });

/* plan limits — architecture only (billing lives in accounts/plans; the editor never checks plans itself) */
export const LIMITS = { free: { sites: 1, pages: 6, media: 30, domains: 0, ai: 40 }, starter: { sites: 3, pages: 15, media: 150, domains: 1, ai: 200 }, pro: { sites: 10, pages: 40, media: 600, domains: 5, ai: 800 }, agency: { sites: 50, pages: 100, media: 3000, domains: 50, ai: 4000 } };
export const limitsFor = (u) => (isOwner(u) ? { sites: 9999, pages: 200, media: 99999, domains: 999, ai: 99999, owner: true } : LIMITS[activePlan(u)] || LIMITS.free);

/* ---------- tenant resolution ---------- */
/* roles: owner (created it) · admin · editor · viewer (site_members, by the member's login email) · FODO owners: admin, audited */
export const ROLES = ["owner", "admin", "editor", "viewer"];
export const can = (s, what) => { const r = s.role; if (what === "view") return true; if (what === "edit") return r !== "viewer"; if (what === "publish" || what === "domains" || what === "members" || what === "settings") return r === "owner" || r === "admin"; if (what === "delete" || what === "transfer") return r === "owner" || (r === "admin" && s.asOwner); return false; };
export async function siteFor(env, u, id) {
  if (!u || !/^ws_[a-z0-9]{12}$/.test(String(id || ""))) throw err("Website not found.", 404);
  const d = await sdb(env), s = await d.prepare("SELECT * FROM sites WHERE id=?1 AND deleted_at IS NULL").bind(id).first();
  if (!s) throw err("Website not found.", 404);
  let role = s.owner_user_id === u.id ? "owner" : null;
  if (!role && u.email) { const m = await d.prepare("SELECT role FROM site_members WHERE site_id=?1 AND email=?2").bind(s.id, String(u.email).toLowerCase()).first(); if (m) role = m.role; }
  if (!role && isOwner(u)) role = "admin";
  if (!role) throw err("Website not found.", 404);
  return Object.assign(s, { asOwner: s.owner_user_id !== u.id && isOwner(u) && role === "admin", role });
}
export function need(s, what) { if (!can(s, what)) throw err("Your role on this website (" + s.role + ") can't do that.", 403); }
export async function listSites(env, u, all, archived) {
  const d = await sdb(env), arch = archived ? "s.archived_at IS NOT NULL" : "s.archived_at IS NULL";
  const cols = "s.id, s.name, s.slug, s.status, s.updated_at, s.published_at, s.archived_at, s.review, s.industry, s.template_id, s.owner_user_id, s.doc, (SELECT domain FROM site_domains WHERE site_id=s.id AND status='connected' LIMIT 1) AS domain, (SELECT COUNT(*) FROM site_forms f WHERE f.site_id=s.id) AS leads";
  const q = all && isOwner(u) ? d.prepare("SELECT " + cols + ", u.email AS owner_email FROM sites s LEFT JOIN acct_users u ON u.id=s.owner_user_id WHERE s.deleted_at IS NULL AND " + arch + " ORDER BY s.updated_at DESC LIMIT 500")
    : d.prepare("SELECT " + cols + ", CASE WHEN s.owner_user_id=?1 THEN 'owner' ELSE m.role END AS role FROM sites s LEFT JOIN site_members m ON m.site_id=s.id AND m.email=?2 WHERE s.deleted_at IS NULL AND " + arch + " AND (s.owner_user_id=?1 OR m.email IS NOT NULL) ORDER BY s.updated_at DESC").bind(u.id, String(u.email || "").toLowerCase());
  return ((await q.all()).results || []).map((r) => { let doc = {}; try { doc = JSON.parse(r.doc || "{}"); } catch (e) {} const home = (doc.pages || []).find((p) => p.slug === "home") || (doc.pages || [])[0];
    delete r.doc; return Object.assign(r, { pages: (doc.pages || []).length, industry: r.industry || ((doc.settings || {}).business || {}).industry || "", thumb: home ? { theme: doc.theme, settings: { business: (doc.settings || {}).business }, pages: [home], components: doc.components } : null }); });
}
/* ---------- the document: validated on every save ---------- */
const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;
function cleanVal(v, depth) {
  if (depth > 6) return null;
  if (typeof v === "string") return clip(v, 12000);
  if (typeof v === "number" || typeof v === "boolean" || v === null) return v;
  if (Array.isArray(v)) return v.slice(0, 40).map((x) => cleanVal(x, depth + 1));
  if (typeof v === "object") { const o = {}; Object.keys(v).slice(0, 40).forEach((k) => { if (/^[a-zA-Z0-9_]{1,30}$/.test(k)) o[k] = cleanVal(v[k], depth + 1); }); return o; }
  return null;
}
export function validateDoc(doc, lim) {
  if (!doc || typeof doc !== "object") throw err("Invalid website data.");
  const pages = Array.isArray(doc.pages) ? doc.pages : [], seen = new Set();
  if (!pages.length) throw err("A website needs at least one page.");
  if (pages.length > (lim ? lim.pages : 100)) throw err("Your plan allows " + lim.pages + " pages.");
  const out = { theme: {}, settings: cleanVal(doc.settings || {}, 0) || {}, pages: [] }, t = doc.theme || {};
  ["mode", "primary", "secondary", "accent", "bg", "surface", "text", "font", "headingFont", "radius", "motion", "palette", "pairing", "style", "button", "shadow", "density", "container", "hover"].forEach((k) => { if (t[k] != null) out.theme[k] = clip(t[k], 40); });
  const T0 = out.theme, ok = (k, list) => { if (T0[k] != null && list.indexOf(String(T0[k])) < 0) delete T0[k]; };
  if (T0.motion === "lively") T0.motion = "dynamic"; ok("motion", MOTION_LEVELS); ok("mode", ["light", "dark", "auto"]); ok("button", BUTTONS); ok("shadow", SHADOWS); ok("density", DENSITY); ok("container", CONTAINERS); ok("hover", HOVERS); ok("style", Object.keys(STYLES));
  ["primary", "secondary", "accent", "bg", "surface", "text"].forEach((k) => { if (T0[k] != null && !/^#[0-9a-f]{3,8}$/i.test(T0[k])) delete T0[k]; });
  if (out.theme.font && !FONTS[out.theme.font]) delete out.theme.font; if (out.theme.headingFont && !FONTS[out.theme.headingFont]) delete out.theme.headingFont;
  if (out.settings.customCss) out.settings.customCss = sanitizeCss(out.settings.customCss);
  delete out.settings.customJs; delete out.settings.headCode;
  // v32 custom code (advanced): stored, but only ever served on the website's OWN connected domain (its own origin) — never on
  // FODO's shared address or inside the builder, so it can't touch FODO or another customer's website
  ["customHead", "customBody"].forEach((k) => { if (out.settings[k] != null) out.settings[k] = clip(String(out.settings[k]), 20000); });
  if (out.settings.forms && out.settings.forms.webhook && !/^https:\/\/[^\s]{4,300}$/.test(out.settings.forms.webhook)) delete out.settings.forms.webhook;
  const comps = (Array.isArray(doc.components) ? doc.components : []).slice(0, 40).filter((k) => k && /^cmp_[a-z0-9]{6,16}$/.test(String(k.id)) && SECTION_TYPES.indexOf(k.type) > -1).map((k) => ({ id: k.id, name: clip(k.name || k.type, 60), type: k.type, props: cleanVal(k.props || {}, 0) || {} }));
  if (comps.length) out.components = comps;
  for (const p of pages) {
    const slug = String(p.slug || "").toLowerCase(); if (!SLUG.test(slug) || seen.has(slug)) throw err("Page address “" + clip(slug, 40) + "” is invalid or used twice."); if (/^(p|cart|checkout|order|blog|thank-you|search)$/.test(slug)) throw err("“" + slug + "” is reserved (store, blog, search, thank-you) — use another page address."); seen.add(slug);
    const secs = (Array.isArray(p.sections) ? p.sections : []).slice(0, 40).filter((s) => s && SECTION_TYPES.indexOf(s.type) > -1).map((s) => Object.assign({ type: s.type, props: cleanVal(s.props || {}, 0) || {} }, s.style && typeof s.style === "object" ? { style: cleanVal(s.style, 0) } : {}, s.ref && comps.some((k) => k.id === s.ref) ? { ref: s.ref } : {}));
    out.pages.push({ slug, title: clip(p.title || slug, 80), navLabel: p.navLabel ? clip(p.navLabel, 40) : undefined, nav: p.nav === false ? false : undefined, hidden: !!p.hidden || undefined, noindex: !!p.noindex || undefined, password: p.password && /^[0-9a-f]{64}$/.test(p.password) ? p.password : undefined, seo: cleanVal(p.seo || {}, 0) || {}, sections: secs });
  }
  const size = JSON.stringify(out).length; if (size > 600000) throw err("The website is too large (" + Math.round(size / 1000) + " KB).");
  return out;
}

/* ---------- create: template → AI personalisation → saved draft ---------- */
export function recommend(q) { return searchTemplates(q, { client: true }).slice(0, 3).map((t) => ({ id: t.id, name: t.name, category: t.category, why: why(t, q), license: t.license, mode: t.theme.mode, pages: t.pages.map((p) => p.title) })); }
async function uniqueSlug(d, name) { let base = String(name || "site").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "site"; if (base.length < 3) base += "-site"; for (let i = 0; i < 6; i++) { const s = i ? base + "-" + randId(4) : base; if (!(await d.prepare("SELECT 1 FROM sites WHERE slug=?1").bind(s).first())) return s; } return base + "-" + randId(8); }
const NO_AI = { testimonials: 1, stats: 1, logos: 1, team: 1, legal: 1, hours: 1, embed: 1, spacer: 1, countdown: 1, products: 1, blog: 1, social: 1, video: 1 };   // reviews, numbers, logos and people are never invented
export async function personalize(env, doc, biz) {
  const work = doc.pages.map((p) => ({ slug: p.slug, sections: p.sections.map((s) => (NO_AI[s.type] || s.type === "navbar" || s.type === "map" ? null : { type: s.type, props: s.props })) }));
  const r = await brainAI(env, { kind: "code", json: true, purpose: "site-generate", max: 7000, messages: [
    { role: "system", content: "You write website copy for a small business. You get the website's sections as JSON. Return the SAME JSON structure ({\"pages\":[{\"slug\",\"sections\":[{\"type\",\"props\"}|null]}]}) with the text props rewritten for THIS business: specific, warm, short, no clichés, in " + (biz.lang === "hi" ? "Hindi" : "English") + ". Keep every type, keep nulls, keep hrefs/images, keep the same number of items (you may add up to 2 services/FAQ items). Replace [placeholders] in titles/descriptions with real wording only if the business details give it; otherwise keep them. NEVER invent reviews, numbers, awards, years, prices or people. Reply JSON only." },
    { role: "user", content: "BUSINESS: " + JSON.stringify({ name: biz.name, industry: biz.industry, location: biz.location, goal: biz.goal, style: biz.style, about: biz.about, services: biz.services, phone: biz.phone, focus: biz.focus, tagline: biz.tagline }) + "\nSECTIONS: " + JSON.stringify({ pages: work }) }] });
  const j = parseJson(r.text); if (!j || !Array.isArray(j.pages)) return { doc, ai: false };
  j.pages.forEach((jp) => { const p = doc.pages.find((x) => x.slug === jp.slug); if (!p || !Array.isArray(jp.sections)) return; jp.sections.forEach((s, i) => { const cur = p.sections[i]; if (!s || !cur || s.type !== cur.type || NO_AI[cur.type]) return; cur.props = mergeText(cur.props, s.props); }); });
  return { doc, ai: true, model: r.provider + " · " + r.model };
}
function mergeText(a, b) {   // take the AI's strings; keep structure, links and images from the template
  if (typeof a === "string" || a == null) return typeof b === "string" ? clip(b, 2000) : a;
  if (Array.isArray(a)) { const arr = Array.isArray(b) ? b : []; const n = Math.min(a.length + 2, Math.max(a.length, arr.length)); const out = []; for (let i = 0; i < n; i++) out.push(i < a.length ? mergeText(a[i], arr[i]) : mergeText(a[a.length - 1], arr[i])); return out; }
  if (typeof a === "object") { const o = Object.assign({}, a); Object.keys(a).forEach((k) => { if (/^(href|image|src|logoImg|bg|align|url|icon|featured|_s|form|number|date|limit|collection|generated|reviewed)$/.test(k)) return; if (b && b[k] != null) o[k] = mergeText(a[k], b[k]); }); return o; }
  return a;
}
/* create — four ways (v32): "ai" (sitemap + design system → pages → AI copy → automatic QA), "template", "blank", "import".
   Every stage that actually ran is reported back (the onboarding shows them); if the AI fails the built website is still saved
   ("Generation paused — your work is safe", Continue generation = POST <id>/generate). */
export async function createSite(env, u, body) {
  const d = await sdb(env), lim = limitsFor(u), n = ((await d.prepare("SELECT COUNT(*) AS n FROM sites WHERE owner_user_id=?1 AND deleted_at IS NULL").bind(u.id).first()) || {}).n || 0;
  if (n >= lim.sites) throw err("Your plan allows " + lim.sites + " website" + (lim.sites > 1 ? "s" : "") + ". Upgrade to add more.", 402);
  const P = body.prompt ? parsePrompt(body.prompt) : {};
  const biz = { name: clip(body.name || P.name, 80).trim(), industry: clip(body.industry || P.industry, 60), location: clip(body.location || P.location, 80), city: clip(body.city || body.location || P.location, 80), goal: clip(Array.isArray(body.goals) ? body.goals.join(", ") : body.goal, 300), style: clip(body.style || P.style, 60), about: clip(body.about || body.description, 800), description: clip(body.description, 300), tagline: clip(body.tagline, 120), services: (Array.isArray(body.services) ? body.services : String(body.services || "").split(/[,\n]/)).map((x) => clip(String(x).trim(), 60)).filter(Boolean).slice(0, 12), phone: clip(body.phone, 30), email: clip(body.email, 120), whatsapp: clip(body.whatsapp, 20), lang: body.lang === "hi" ? "hi" : "en", focus: clip(P.focus || body.focus, 120), social: cleanVal(body.social || {}, 0) || {}, logo: /^\/api\/sites\/media\/[a-z0-9]{20}$/.test(String(body.logo || "")) ? body.logo : "" };
  if (biz.name.length < 2) { if (body.mode === "blank" || body.mode === "import") biz.name = body.mode === "blank" ? "My website" : "Imported website"; else throw err("Tell us the business name."); }
  const mode = ["ai", "template", "blank", "import"].indexOf(body.mode) > -1 ? body.mode : body.prompt || body.plan ? "ai" : "template", stages = [];
  let doc, tid = null, tname = "";
  if (mode === "template") {
    const t = (/^ct_/.test(String(body.templateId)) ? await customTemplate(env, body.templateId) : templateById(body.templateId)) || searchTemplates(biz.industry + " " + biz.style + " " + biz.goal, { client: true })[0];
    if (!clientAllowed(t.license)) throw err("That template's license doesn't allow client websites.");
    tid = t.id; tname = t.name;
    doc = JSON.parse(JSON.stringify({ theme: t.theme, settings: { business: { name: biz.name, tagline: biz.tagline, phone: biz.phone, email: biz.email, whatsapp: biz.whatsapp, address: biz.location, city: biz.city, description: biz.description, industry: biz.industry }, notifyEmail: biz.email || u.email, lang: biz.lang, whatsappFloat: !!biz.whatsapp }, pages: t.pages }).replace(/\{\{business_name\}\}/g, biz.name.replace(/"/g, "")).replace(/\{\{(phone|email|location)\}\}/g, (m, k) => String(biz[k === "location" ? "location" : k] || "").replace(/"/g, "")));
    if (body.styleVariant && STYLES[body.styleVariant]) doc.theme = designForVariant(doc.theme, body.styleVariant);
    if (Array.isArray(body.pages) && body.pages.length) doc.pages = doc.pages.filter((p) => p.slug === "home" || body.pages.indexOf(p.slug) > -1);
    stages.push("template");
  } else if (mode === "blank") {
    const nav = { type: "navbar", props: { cta: { label: "Contact", href: "#contact" } } }, foot = { type: "footer", props: { text: "" } };
    doc = { theme: designFor({ profile: "local", style: body.style || "minimal" }), settings: { business: { name: biz.name, email: biz.email, phone: biz.phone }, notifyEmail: biz.email || u.email }, pages: [{ slug: "home", title: "Home", seo: {}, sections: [nav, { type: "hero", props: { title: biz.name, subtitle: "", align: "center", bg: "theme" } }, foot] }] };
    tid = "blank"; tname = "Blank"; stages.push("blank");
  } else {
    // ai + import: understand → sitemap → design system → pages
    const ind = findIndustry(biz.industry) || (P.industry ? findIndustry(P.industry) : null), profile = PROFILES[body.profile] ? body.profile : (ind && ind.profile) || "local";
    let plan = body.plan && Array.isArray(body.plan.pages) && body.plan.pages.length ? { profile, cta: clip(body.plan.cta || PROFILES[profile].cta, 40), pages: body.plan.pages.slice(0, 30).map((p) => ({ slug: String(p.slug || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40), title: clip(p.title, 60), purpose: clip(p.purpose, 120), sections: (Array.isArray(p.sections) ? p.sections : []).filter((t) => SECTION_TYPES.indexOf(t) > -1 || /^legal:(privacy|terms|refund|shipping|cookies)$/.test(t)).slice(0, 14) })).filter((p) => SLUG.test(p.slug) && p.sections.length) }
      : planSitemap({ profile, goals: body.goals || P.goals || [] });
    if (!plan.pages.some((p) => p.slug === "home")) plan.pages.unshift({ slug: "home", title: "Home", sections: ["hero", "cta"] });
    stages.push("sitemap");
    const theme = body.theme && typeof body.theme === "object" ? body.theme : designFor({ profile, style: biz.style && STYLES[biz.style] ? biz.style : (P.style || null), palette: body.palette, pairing: body.pairing, mode: body.colorMode });
    stages.push("design");
    doc = buildDoc(plan, biz, theme); doc.settings.notifyEmail = biz.email || u.email; if (biz.logo) doc.pages.forEach((p) => p.sections.forEach((x) => { if (x.type === "navbar") x.props.logoImg = biz.logo; }));
    if (mode === "import" && body.import && body.rights === true) applyImport(doc, body.import);
    stages.push("pages"); tid = mode === "import" ? "import" : "ai:" + profile; tname = mode === "import" ? "Imported structure" : "AI (" + profile + ")";
  }
  doc.pages.forEach((p) => p.sections.forEach((s) => { if (s.type === "contact") Object.assign(s.props, { phone: biz.phone || s.props.phone, email: biz.email || s.props.email, whatsapp: biz.whatsapp || s.props.whatsapp, address: biz.location || s.props.address }); if (s.type === "map") s.props.address = biz.location || s.props.address || ""; }));
  let ai = { ai: false }; if (body.ai !== false && mode !== "blank") { try { ai = await personalize(env, doc, biz); doc = ai.doc; if (ai.ai) stages.push("copy"); } catch (e) { ai = { ai: false, error: e.message }; } }
  // automatic QA: audit, then the safe fixes (SEO titles/descriptions, alt text, contrast, privacy page, WhatsApp button)
  const before = audit(doc), fx = mode === "blank" ? { doc, fixed: [] } : autoFix(doc, before.issues.filter((i) => i.auto && i.key !== "no-contact").map((i) => i.id)); doc = fx.doc; const after = audit(doc); if (mode !== "blank") stages.push("qa");
  while (doc.pages.length > lim.pages) { const k = doc.pages.map((p, i) => [p, i]).reverse().find(([p]) => !/^(home|contact|privacy)$/.test(p.slug)); if (!k) break; doc.pages.splice(k[1], 1); }   // plan page limit: keep home, contact, privacy
  doc = validateDoc(doc, lim);
  const id = "ws_" + randId(12), slug = await uniqueSlug(d, biz.name), now = nowIso();
  await d.prepare("INSERT INTO sites (id, tenant_id, owner_user_id, name, slug, status, doc, rev, template_id, created_at, updated_at, industry) VALUES (?1,?2,?2,?3,?4,'draft',?5,1,?6,?7,?7,?8)").bind(id, u.id, biz.name, slug, JSON.stringify(doc), tid, now, biz.industry || null).run();
  await version(env, id, 1, doc, "Created from " + tname + (ai.ai ? " + AI copy" : ""), u.id);
  await aiLog(env, id, u.id, "generate", JSON.stringify(Object.assign({ mode }, biz)), (ai.ai ? "ok · " + ai.model : "no AI copy" + (ai.error ? " (" + clip(ai.error, 100) + ")" : "")) + " · QA " + before.overall + "→" + after.overall + " (" + fx.fixed.length + " fixes)");
  return { id, slug, template: tid, mode, ai: !!ai.ai, paused: mode !== "blank" && body.ai !== false && !ai.ai, stages, qa: { before: before.overall, after: after.overall, fixed: fx.fixed.length, remaining: after.count } };
}
function designForVariant(theme, styleId) { const t = designFor({ profile: "local", style: styleId }); return Object.assign({}, theme, t, { motion: t.motion }); }
/* continue generation (after a paused / failed AI step) — returns the improved document (the editor keeps or undoes it) */
export async function generateCopy(env, u, s) {
  const doc = JSON.parse(s.doc), b = (doc.settings || {}).business || {}, r = await personalize(env, doc, { name: b.name || s.name, industry: b.industry || s.industry, location: b.city || b.address, lang: (doc.settings || {}).lang, about: b.description });
  if (!r.ai) throw err("The AI didn't answer — your website is safe. Try again in a minute.", 503);
  await aiLog(env, s.id, u.id, "generate", "continue generation", "ok · " + r.model);
  return { doc: validateDoc(r.doc, limitsFor(u)) };
}
async function version(env, siteId, rev, doc, note, by) { const d = await sdb(env); await d.prepare("INSERT INTO site_versions (id, site_id, rev, doc, note, by_user, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind("wv_" + randId(12), siteId, rev, JSON.stringify(doc), clip(note, 200), by || null, nowIso()).run(); }
async function aiLog(env, siteId, by, kind, prompt, result) { const d = await sdb(env); await d.prepare("INSERT INTO site_ai (id, site_id, by_user, kind, prompt, result, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind("wa_" + randId(12), siteId, by, kind, clip(prompt, 2000), clip(result, 2000), nowIso()).run(); }

/* ---------- save (autosave with conflict detection) ---------- */
/* a website's limits follow its OWNER's plan (a member editing it doesn't shrink or grow them) */
export async function siteLimits(env, u, s) { if (!s || s.owner_user_id === u.id) return limitsFor(u); const d = await sdb(env), o = await d.prepare("SELECT * FROM acct_users WHERE id=?1").bind(s.owner_user_id).first().catch(() => null); const a = limitsFor(u), b = o ? limitsFor(o) : a; return a.pages >= b.pages ? a : b; }
export async function saveDoc(env, u, s, doc, baseRev, note) {
  const d = await sdb(env), clean = validateDoc(doc, await siteLimits(env, u, s));
  if (+baseRev !== s.rev) { const cur = await d.prepare("SELECT doc, rev FROM sites WHERE id=?1").bind(s.id).first(); return { conflict: true, rev: cur.rev, doc: JSON.parse(cur.doc) }; }
  const rev = s.rev + 1, now = nowIso(), name = clip((clean.settings.business || {}).name || s.name, 80);
  const r = await d.prepare("UPDATE sites SET doc=?2, rev=?3, name=?4, updated_at=?5 WHERE id=?1 AND rev=?6").bind(s.id, JSON.stringify(clean), rev, name, now, s.rev).run();
  if (!r.meta || !r.meta.changes) { const cur = await d.prepare("SELECT doc, rev FROM sites WHERE id=?1").bind(s.id).first(); return { conflict: true, rev: cur.rev, doc: JSON.parse(cur.doc) }; }
  const last = await d.prepare("SELECT created_at FROM site_versions WHERE site_id=?1 ORDER BY created_at DESC LIMIT 1").bind(s.id).first();
  if (note || !last || Date.now() - Date.parse(last.created_at) > 20 * 60e3) await version(env, s.id, rev, clean, note || "Autosave", u.id);
  return { ok: true, rev, savedAt: now };
}
export async function versions(env, s) { const d = await sdb(env); return ((await d.prepare("SELECT id, rev, note, by_user, created_at FROM site_versions WHERE site_id=?1 ORDER BY created_at DESC LIMIT 60").bind(s.id).all()).results || []); }
export async function restore(env, u, s, vid) { const d = await sdb(env), v = await d.prepare("SELECT * FROM site_versions WHERE id=?1 AND site_id=?2").bind(vid, s.id).first(); if (!v) throw err("Version not found.", 404); const r = await saveDoc(env, u, s, JSON.parse(v.doc), s.rev, "Restored version from " + v.created_at.slice(0, 16).replace("T", " ")); return Object.assign(r, { doc: JSON.parse(v.doc) }); }

/* ---------- the website's AI (scoped to this one document) ---------- */
export async function aiEdit(env, u, s, instruction, selected) {
  instruction = clip(instruction, 1500).trim(); if (instruction.length < 3) throw err("Tell the AI what to change.");
  const doc = JSON.parse(s.doc), brief = { theme: doc.theme, pages: doc.pages.map((p) => ({ slug: p.slug, title: p.title, sections: p.sections.map((x, i) => ({ i, type: x.type, props: x.props })) })) };
  const r = await brainAI(env, { kind: "code", json: true, purpose: "site-edit", max: 6000, messages: [
    { role: "system", content: "You edit ONE customer website. The website is JSON: theme + pages of sections. Section types: " + SECTION_TYPES.join(", ") + ". Reply JSON only: {\"say\":\"one short sentence for the user\",\"ops\":[...]} with ops from: {\"op\":\"update\",\"page\":slug,\"i\":index,\"props\":{partial props}} · {\"op\":\"add\",\"page\":slug,\"at\":index,\"type\":t,\"props\":{}} · {\"op\":\"remove\",\"page\":slug,\"i\":index} · {\"op\":\"move\",\"page\":slug,\"from\":i,\"to\":j} · {\"op\":\"theme\",\"theme\":{mode,primary,accent,font,headingFont,radius}} · {\"op\":\"addPage\",\"slug\":s,\"title\":t,\"sections\":[{type,props}]} · {\"op\":\"seo\",\"page\":slug,\"seo\":{title,description}}. Fonts: " + Object.keys(FONTS).join(", ") + ". Colours as #hex. Never invent reviews, numbers or people — use [placeholders]. No HTML, no scripts. Text in the language the user writes in." },
    { role: "user", content: "INSTRUCTION: " + instruction + (selected ? "\nSELECTED: page " + clip(selected.page, 40) + " section " + (+selected.i) : "") + "\nWEBSITE: " + clip(JSON.stringify(brief), 30000) }] });
  const j = parseJson(r.text); if (!j || !Array.isArray(j.ops) || !j.ops.length) throw err("The AI couldn't work out a change for that — try saying it differently.");
  const res = applyOps(doc, j.ops.slice(0, 30));
  const clean = validateDoc(res.doc, limitsFor(u));
  await aiLog(env, s.id, u.id, "edit", instruction, res.applied + " ops · " + (j.say || ""));
  return { doc: clean, say: clip(j.say || "Done.", 300), applied: res.applied, skipped: res.skipped };   // returned, not saved: the editor shows it, the user keeps or undoes it
}
export function applyOps(doc, ops) {
  let applied = 0; const skipped = [];
  for (const o of ops) {
    const p = o.page ? doc.pages.find((x) => x.slug === o.page) : null;
    try {
      if (o.op === "update" && p && p.sections[o.i]) { p.sections[o.i].props = deepMerge(p.sections[o.i].props, o.props || {}); applied++; }
      else if (o.op === "add" && p && SECTION_TYPES.indexOf(o.type) > -1) { p.sections.splice(Math.max(0, Math.min(p.sections.length, o.at == null ? p.sections.length - 1 : +o.at)), 0, { type: o.type, props: o.props || {} }); applied++; }
      else if (o.op === "remove" && p && p.sections[o.i]) { p.sections.splice(o.i, 1); applied++; }
      else if (o.op === "move" && p && p.sections[o.from]) { const [x] = p.sections.splice(o.from, 1); p.sections.splice(Math.max(0, Math.min(p.sections.length, +o.to)), 0, x); applied++; }
      else if (o.op === "theme" && o.theme) { doc.theme = Object.assign({}, doc.theme, o.theme); applied++; }
      else if (o.op === "seo" && p) { p.seo = Object.assign({}, p.seo, o.seo || {}); applied++; }
      else if (o.op === "addPage" && SLUG.test(String(o.slug || "")) && !doc.pages.some((x) => x.slug === o.slug)) { doc.pages.push({ slug: o.slug, title: clip(o.title || o.slug, 80), seo: {}, sections: (o.sections || []).filter((x) => SECTION_TYPES.indexOf(x.type) > -1) }); applied++; }
      else skipped.push(o.op);
    } catch (e) { skipped.push(o.op); }
  }
  return { doc, applied, skipped };
}
function deepMerge(a, b) { if (Array.isArray(b)) return b; if (b && typeof b === "object") { const o = Object.assign({}, a || {}); Object.keys(b).forEach((k) => { o[k] = deepMerge(a ? a[k] : undefined, b[k]); }); return o; } return b; }
const MODES = { improve: "Improve it: clearer and more persuasive", shorten: "Make it shorter", expand: "Expand it a little", professional: "Make it professional", friendly: "Make it friendly", premium: "Make it sound premium", seo: "Optimise it for local SEO (natural keywords)", hindi: "Translate it to natural Hindi", english: "Translate it to natural English", cta: "Turn it into a strong call-to-action button text (max 4 words)" };
export async function rewrite(env, u, s, text, mode) {
  if (!MODES[mode]) throw err("Unknown rewrite."); text = clip(text, 2000); if (!text.trim()) throw err("Nothing to rewrite.");
  const biz = (JSON.parse(s.doc).settings || {}).business || {};
  const r = await brainAI(env, { kind: "fast", purpose: "site-rewrite", max: 400, messages: [{ role: "system", content: MODES[mode] + ". Business: " + clip(biz.name, 80) + (biz.city ? " in " + clip(biz.city, 60) : "") + ". Keep any [placeholders]. Never invent facts or numbers. Reply with the new text only." }, { role: "user", content: text }] });
  return { text: clip(String(r.text || "").trim().replace(/^["“]|["”]$/g, ""), 2000) };
}

/* ---------- publish (checks first; critical problems block it) ---------- */
export async function publish(env, u, s) {
  const doc = JSON.parse(s.doc), chk = checkSite(doc), au = audit(doc), dm = await domains(env, s);
  const crit = (k) => au.issues.some((i) => i.level === "high" && i.cat === k), list = [["Homepage", doc.pages.some((p) => p.slug === "home")], ["Navigation", doc.pages.every((p) => p.sections.some((x) => x.type === "navbar"))], ["Mobile", !crit("mobile")], ["SEO", !crit("seo")], ["Images", !au.issues.some((i) => i.key === "alt")], ["Forms", true], ["Links", !chk.issues.some((i) => /Link to a page/.test(i.msg))], ["SSL", true], ["Domain", !dm.length || dm.some((x) => x.status === "connected")], ["Accessibility", !crit("accessibility")]];
  const checklist = list.map((x) => ({ item: x[0], ok: !!x[1] }));
  if (!chk.ok) return { published: false, issues: chk.issues, checklist, audit: { overall: au.overall, scores: au.scores } };
  const d = await sdb(env), now = nowIso();
  await d.prepare("UPDATE sites SET status='live', published=?2, published_at=?3, updated_at=?3 WHERE id=?1").bind(s.id, JSON.stringify(doc), now).run();
  await version(env, s.id, s.rev, doc, "Published", u.id);
  return { published: true, issues: chk.issues, at: now, urls: urlsFor(env, s), checklist, audit: { overall: au.overall, scores: au.scores } };
}
export async function unpublish(env, s) { const d = await sdb(env); await d.prepare("UPDATE sites SET status='draft', updated_at=?2 WHERE id=?1").bind(s.id, nowIso()).run(); return { unpublished: true }; }
export function urlsFor(env, s) { const host = env.SITES_HOST || null; return { fodo: (env.SITE_ORIGIN || "https://www.fodo.co.in") + "/api/sites/view/" + s.slug + "/", sites: host ? "https://" + host + "/" + s.slug + "/" : null }; }

/* ---------- forms + analytics (public endpoints: rate-limited, no cookies) ---------- */
export async function submitForm(env, siteId, body, ip) {
  if (!/^ws_[a-z0-9]{12}$/.test(String(siteId))) throw err("Not found.", 404);
  const d = await sdb(env), s = await d.prepare("SELECT id, name, status, published, owner_user_id FROM sites WHERE id=?1 AND deleted_at IS NULL").bind(siteId).first(); if (!s || s.status !== "live") throw err("Not found.", 404);
  if (body._hp) return { ok: true };   // honeypot: bots get a polite yes
  const data = {}; Object.keys(body || {}).slice(0, 26).forEach((k) => { if (/^[a-z0-9_]{1,30}$/.test(k) && k !== "_hp") data[k] = clip(body[k], 2000); });
  if (!Object.keys(data).some((k) => k[0] !== "_" && String(data[k]).trim())) throw err("Please fill in the form.");
  if (data.email && !/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(data.email)) throw err("Please enter a valid email.");
  const ipHash = (await sha256("form|" + (ip || ""))).slice(0, 16), now = nowIso();
  const recent = ((await d.prepare("SELECT COUNT(*) AS n FROM site_forms WHERE site_id=?1 AND ip_hash=?2 AND created_at > ?3").bind(s.id, ipHash, new Date(Date.now() - 3600e3).toISOString()).first()) || {}).n || 0;
  if (recent >= 8) throw err("Too many messages — please try later.", 429);
  await d.prepare("INSERT INTO site_forms (id, site_id, page, data, ip_hash, created_at) VALUES (?1,?2,?3,?4,?5,?6)").bind("wf_" + randId(12), s.id, clip(data._page || "", 120), JSON.stringify(data), ipHash, now).run();
  await bump(env, s.id, data._page || "/", "form");
  const pubS = (JSON.parse(s.published || "{}").settings) || {}, hook = (pubS.forms || {}).webhook;
  if (hook && /^https:\/\//.test(hook) && netSafe(hook).ok) { try { await safeFetch(hook, { method: "POST", headers: { "content-type": "application/json", "user-agent": "FODO-Forms/1.0" }, body: JSON.stringify({ site: s.name, form: data._form || "contact", page: data._page || "", data, at: now }) }, { timeout: 6000, env, maxHops: 0 }); } catch (e) { /* the lead is already stored */ } }
  try { const pub = JSON.parse(s.published || "{}"), to = (pub.settings || {}).notifyEmail; if (to && /@/.test(to)) await sendMail(env, to, "New " + (data._form && data._form !== "contact" ? data._form : "enquiry") + " from your website — " + clip(s.name, 60), "<p>You have a new message from <b>" + esc(s.name) + "</b>:</p><table>" + Object.keys(data).filter((k) => k[0] !== "_").map((k) => "<tr><td><b>" + esc(k) + "</b></td><td>" + esc(data[k]) + "</td></tr>").join("") + "</table><p>See all messages in FODO Website Builder.</p>"); } catch (e) {}
  return { ok: true };
}
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export async function bump(env, siteId, path, metric) { const d = await sdb(env), day = nowIso().slice(0, 10); await d.prepare("INSERT INTO site_stats (site_id, day, path, metric, n) VALUES (?1,?2,?3,?4,1) ON CONFLICT(site_id, day, path, metric) DO UPDATE SET n=n+1").bind(siteId, day, clip(String(path || "/").split("?")[0], 120), clip(metric, 40)).run(); }
export async function beacon(env, b) {
  if (!b || !/^ws_[a-z0-9]{12}$/.test(String(b.s)) || !/^(view|cta|form)$/.test(String(b.t))) return;
  const d = await sdb(env), s = await d.prepare("SELECT status FROM sites WHERE id=?1").bind(b.s).first(); if (!s || s.status !== "live") return;
  const metric = b.t === "view" ? "view:" + (/^(mobile|tablet|desktop)$/.test(b.d) ? b.d : "desktop") : b.t === "cta" ? "cta:" + clip(b.x, 40) : null; if (!metric) return;
  await bump(env, b.s, b.p, metric);
  if (b.t === "view" && b.r) { try { const h = new URL(b.r).hostname.replace(/^www\./, ""); if (h) await bump(env, b.s, "ref", "ref:" + clip(h, 60)); } catch (e) {} }
}
export async function stats(env, s, days) {
  const d = await sdb(env), since = new Date(Date.now() - (days || 30) * 864e5).toISOString().slice(0, 10), rows = (await d.prepare("SELECT day, path, metric, n FROM site_stats WHERE site_id=?1 AND day >= ?2").bind(s.id, since).all()).results || [];
  const sum = (f) => rows.filter(f).reduce((a, r) => a + r.n, 0), group = (f, key) => { const o = {}; rows.filter(f).forEach((r) => { const k = key(r); o[k] = (o[k] || 0) + r.n; }); return Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 10); };
  return { days: days || 30, views: sum((r) => /^view:/.test(r.metric)), forms: sum((r) => r.metric === "form"), ctaClicks: sum((r) => /^cta:/.test(r.metric)), topPages: group((r) => /^view:/.test(r.metric), (r) => r.path), devices: group((r) => /^view:/.test(r.metric), (r) => r.metric.slice(5)), ctas: group((r) => /^cta:/.test(r.metric), (r) => r.metric.slice(4)), sources: group((r) => /^ref:/.test(r.metric), (r) => r.metric.slice(4)), byDay: group((r) => /^view:/.test(r.metric), (r) => r.day).sort() };
}
export async function forms(env, s) { const d = await sdb(env); return ((await d.prepare("SELECT id, page, data, created_at FROM site_forms WHERE site_id=?1 ORDER BY created_at DESC LIMIT 200").bind(s.id).all()).results || []).map((r) => Object.assign(r, { data: JSON.parse(r.data || "{}") })); }

/* ---------- media (images, re-encoded in the browser to WebP; stored in KV) ---------- */
export async function putMedia(env, u, s, bytes, mime, name) {
  if (!env.CHAT_KV) throw err("Media storage is not set up.", 503);
  if (!/^image\/(webp|jpeg|png|gif|svg\+xml|avif)$/.test(mime)) throw err("Only images can be uploaded here.");
  if (mime === "image/svg+xml") throw err("SVG files can contain scripts — upload PNG, JPG or WebP.");
  if (bytes.byteLength > 2.5e6) throw err("Images up to 2.5 MB (the editor compresses them for you).");
  const d = await sdb(env), n = ((await d.prepare("SELECT COUNT(*) AS n FROM site_media WHERE site_id=?1").bind(s.id).first()) || {}).n || 0; if (n >= limitsFor(u).media) throw err("Media limit reached for your plan.", 402);
  const id = randId(20); await env.CHAT_KV.put("site:media:" + id, bytes, { metadata: { mime, site: s.id } });
  await d.prepare("INSERT INTO site_media (id, site_id, mime, size, name, created_at) VALUES (?1,?2,?3,?4,?5,?6)").bind(id, s.id, mime, bytes.byteLength, clip(name || "", 120), nowIso()).run();
  return { id, url: "/api/sites/media/" + id, size: bytes.byteLength };
}
export async function getMedia(env, id) { if (!/^[a-z0-9]{20}$/.test(String(id)) || !env.CHAT_KV) return null; const r = await env.CHAT_KV.getWithMetadata("site:media:" + id, "arrayBuffer"); return r && r.value ? { body: r.value, mime: (r.metadata && r.metadata.mime) || "image/jpeg" } : null; }
export async function listMedia(env, s) { const d = await sdb(env); return ((await d.prepare("SELECT id, mime, size, name, created_at FROM site_media WHERE site_id=?1 ORDER BY created_at DESC LIMIT 300").bind(s.id).all()).results || []).map((m) => Object.assign(m, { url: "/api/sites/media/" + m.id })); }

/* ---------- custom domains + DNS (real DNS-over-HTTPS checks; SSL by Cloudflare Pages) ---------- */
export const PROVIDERS = {
  godaddy: ["Log in to GoDaddy → My Products → your domain → DNS.", "Click Add New Record."],
  namecheap: ["Log in to Namecheap → Domain List → Manage → Advanced DNS.", "Click Add New Record."],
  cloudflare: ["Log in to Cloudflare → your domain → DNS → Records.", "Click Add record. For the CNAME, set Proxy status to DNS only (grey cloud)."],
  hostinger: ["Log in to Hostinger → Domains → your domain → DNS / Nameservers.", "Under Manage DNS records, add the records."],
  squarespace: ["Log in to Squarespace Domains (formerly Google Domains) → your domain → DNS → Custom records.", "Add the records."],
  bluehost: ["Log in to Bluehost → Domains → your domain → DNS.", "Add the records."],
  other: ["Log in where you bought the domain and open DNS settings (sometimes called DNS Management or Zone Editor).", "Add the records."],
};
export function normDomain(x) { x = String(x || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, ""); if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(x)) throw err("That doesn't look like a domain (e.g. mybusiness.com)."); if (/(^|\.)fodo\.co\.in$|\.pages\.dev$|\.workers\.dev$/.test(x)) throw err("That domain can't be connected."); return x; }
export const target = (env) => (env.SITES_PROJECT || "fodo-sites") + ".pages.dev";
export function dnsRecords(env, dom) { const www = /^www\./.test(dom) ? dom : "www." + dom.replace(/^www\./, ""), apex = dom.replace(/^www\./, ""); return [{ type: "TXT", name: "_fodo." + apex, value: null, why: "Proves the domain is yours" }, { type: "CNAME", name: www, value: target(env), why: "Points your website address to FODO" }, { type: "CNAME / ALIAS", name: apex, value: target(env), why: "Optional — makes " + apex + " work without www (if your provider allows CNAME/ALIAS at the root; otherwise set a redirect to www)." }]; }
export async function addDomain(env, u, s, domain) {
  const dom = normDomain(domain), d = await sdb(env), lim = limitsFor(u), n = ((await d.prepare("SELECT COUNT(*) AS n FROM site_domains m JOIN sites s ON s.id=m.site_id WHERE s.owner_user_id=?1").bind(s.owner_user_id).first()) || {}).n || 0;
  if (n >= lim.domains) throw err(lim.domains ? "Your plan allows " + lim.domains + " custom domain(s)." : "Custom domains are on paid plans.", 402);
  const ex = await d.prepare("SELECT site_id FROM site_domains WHERE domain=?1").bind(dom).first(); if (ex) throw err(ex.site_id === s.id ? "Already added." : "This domain is connected to another website.", 409);
  const token = "fodo-verify=" + randId(24);
  await d.prepare("INSERT INTO site_domains (id, site_id, domain, token, status, detail, created_at) VALUES (?1,?2,?3,?4,'pending','Add the DNS records, then press Verify.',?5)").bind("wd_" + randId(12), s.id, dom, token, nowIso()).run();
  return domainView(env, await d.prepare("SELECT * FROM site_domains WHERE domain=?1").bind(dom).first());
}
export function domainView(env, r) { const recs = dnsRecords(env, r.domain); recs[0].value = r.token; return { domain: r.domain, status: r.status, detail: r.detail, ssl: r.ssl || null, checkedAt: r.checked_at, records: recs, providers: PROVIDERS }; }
async function doh(name, type) {
  const r = await fetch("https://cloudflare-dns.com/dns-query?name=" + encodeURIComponent(name) + "&type=" + type, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(8000) });
  const j = await r.json().catch(() => ({})); return (j.Answer || []).map((a) => String(a.data || "").replace(/^"|"$/g, "").replace(/"\s*"/g, "").replace(/\.$/, "").toLowerCase());
}
async function cf(env, method, path, body) {
  const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + env.CF_ACCOUNT_ID + "/pages/projects/" + (env.SITES_PROJECT || "fodo-sites") + path, { method, headers: { authorization: "Bearer " + env.CF_API_TOKEN, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(12000) });
  const j = await r.json().catch(() => ({})); return { ok: r.ok && j.success !== false, status: r.status, j };
}
export const hostingOn = (env) => !!(env.CF_API_TOKEN && env.CF_ACCOUNT_ID);
export async function verifyDomain(env, s, domain) {
  const d = await sdb(env), r = await d.prepare("SELECT * FROM site_domains WHERE domain=?1 AND site_id=?2").bind(normDomain(domain), s.id).first(); if (!r) throw err("Domain not found.", 404);
  const apex = r.domain.replace(/^www\./, ""), www = "www." + apex, tgt = target(env), out = { checks: [] }, add = (name, ok, detail) => out.checks.push({ name, ok, detail });
  const txt = await doh("_fodo." + apex, "TXT").catch(() => null), cname = await doh(www, "CNAME").catch(() => null), cnameApex = await doh(apex, "CNAME").catch(() => []), ns = await doh(apex, "NS").catch(() => []);
  if (txt == null || cname == null) { add("DNS lookup", false, "Couldn't reach the DNS service — try again in a minute."); }
  const txtOk = (txt || []).some((v) => v.indexOf(r.token.toLowerCase()) > -1), cnOk = (cname || []).some((v) => v === tgt) || cnameApex.some((v) => v === tgt);
  add("Ownership (TXT _fodo." + apex + ")", txtOk, txtOk ? "Found." : (txt || []).length ? "A TXT record exists but the value is different — it must be exactly " + r.token : "Not found yet. DNS changes usually appear within minutes, sometimes up to 24 hours.");
  add("Website address (CNAME " + www + " → " + tgt + ")", cnOk, cnOk ? "Found." : (cname || []).length ? "www points to " + cname[0] + " — change it to " + tgt + "." : "Not found yet.");
  if (ns.length) add("Nameservers", true, ns.slice(0, 4).join(", "));
  let status = txtOk && cnOk ? "dns_ok" : txtOk || cnOk ? "propagating" : (txt || []).length || (cname || []).length ? "error" : "pending", detail = "", ssl = r.ssl;
  if (status === "dns_ok") {
    if (!hostingOn(env)) { status = "dns_ok"; detail = "DNS is correct ✓. FODO will switch the domain on as soon as website hosting is enabled (CF_API_TOKEN not set yet)."; }
    else {
      let c = await cf(env, "GET", "/domains/" + encodeURIComponent(www)); if (c.status === 404 || (c.j && c.j.errors && c.j.errors.length && !c.ok)) c = await cf(env, "POST", "/domains", { name: www });
      const st = c.j && c.j.result ? c.j.result.status : null; add("Hosting + SSL (Cloudflare)", st === "active", st ? "Status: " + st : "Cloudflare said: " + JSON.stringify((c.j && c.j.errors) || c.status).slice(0, 200));
      if (st === "active") { status = "connected"; ssl = "active"; detail = "Connected ✓ — https://" + www + " is live with SSL."; } else { status = "propagating"; ssl = "pending"; detail = "DNS is correct; Cloudflare is issuing the SSL certificate (usually under 15 minutes)."; }
    }
  } else detail = status === "error" ? "A record exists but points somewhere else — see the red check." : "Waiting for the DNS records to appear.";
  await d.prepare("UPDATE site_domains SET status=?2, detail=?3, ssl=?4, checked_at=?5 WHERE id=?1").bind(r.id, status, detail, ssl || null, nowIso()).run();
  return Object.assign(domainView(env, Object.assign(r, { status, detail, ssl, checked_at: nowIso() })), { checks: out.checks });
}
export async function removeDomain(env, s, domain) { const d = await sdb(env), dom = normDomain(domain); if (hostingOn(env)) { try { await cf(env, "DELETE", "/domains/" + encodeURIComponent("www." + dom.replace(/^www\./, ""))); } catch (e) {} } await d.prepare("DELETE FROM site_domains WHERE domain=?1 AND site_id=?2").bind(dom, s.id).run(); return { removed: true }; }
export async function domains(env, s) { const d = await sdb(env); return ((await d.prepare("SELECT * FROM site_domains WHERE site_id=?1").bind(s.id).all()).results || []).map((r) => domainView(env, r)); }

/* ---------- export (no lock-in): static HTML of every page + sitemap + robots + the site JSON, as a ZIP ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u) => { let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function zip(files) {   // files: [{name, data: Uint8Array}] — "stored" ZIP (no compression), valid everywhere
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  for (const f of files) { const name = enc.encode(f.name), data = f.data, crc = crc32(data), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, 0, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name); off += 30 + name.length + data.length; }
  const csize = central.reduce((a, x) => a + x.length, 0), e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  const all = parts.concat(central, [new Uint8Array(e.buffer)]), total = all.reduce((a, x) => a + x.length, 0), out = new Uint8Array(total); let p = 0; all.forEach((x) => { out.set(x, p); p += x.length; }); return out;
}
export async function exportZip(env, s, origin) {
  const doc = JSON.parse(s.doc), enc = new TextEncoder(), files = [];
  for (const p of doc.pages) files.push({ name: (p.slug === "home" ? "" : p.slug + "/") + "index.html", data: enc.encode(renderPage(doc, p.slug, { base: "/", origin: origin || "", badge: false })) });
  files.push({ name: "sitemap.xml", data: enc.encode(sitemap(doc, origin || "https://example.com", "/")) }, { name: "robots.txt", data: enc.encode("User-agent: *\nAllow: /\n") }, { name: "site.json", data: enc.encode(JSON.stringify(doc, null, 1)) },
    { name: "README.txt", data: enc.encode("Your website exported from FODO Website Builder.\nUpload these files to any static host (Cloudflare Pages, Netlify, GitHub Pages, cPanel).\nImages hosted by FODO are linked as /api/sites/media/… — download them from the Media panel if you move hosts.\nContact forms need a form service when hosted elsewhere.\n") });
  return zip(files);
}
/* ---------- health of one website (real checks) ---------- */
export async function health(env, s) {
  const doc = JSON.parse(s.doc), q = checkSite(doc), doms = await domains(env, s), out = { quality: q, domains: doms.map((x) => ({ domain: x.domain, status: x.status, ssl: x.ssl })), live: null };
  if (s.status === "live") { const u = urlsFor(env, s); try { const t0 = Date.now(), r = await fetch(u.sites || u.fodo, { signal: AbortSignal.timeout(10000) }); out.live = { url: u.sites || u.fodo, status: r.status, ms: Date.now() - t0 }; } catch (e) { out.live = { url: u.sites || u.fodo, error: e.message }; } }
  return out;
}
/* ---------- v32: duplicate · archive / restore · delete info ---------- */
export async function duplicateSite(env, u, s) {
  const d = await sdb(env), lim = limitsFor(u), n = ((await d.prepare("SELECT COUNT(*) AS n FROM sites WHERE owner_user_id=?1 AND deleted_at IS NULL").bind(u.id).first()) || {}).n || 0;
  if (n >= lim.sites) throw err("Your plan allows " + lim.sites + " website(s).", 402);
  const doc = JSON.parse(s.doc), name = clip("Copy of " + s.name, 80), id = "ws_" + randId(12), slug = await uniqueSlug(d, name), now = nowIso();
  // design, pages, components and animations are copied — never form submissions, analytics, domains, members or orders
  await d.prepare("INSERT INTO sites (id, tenant_id, owner_user_id, name, slug, status, doc, rev, template_id, created_at, updated_at, industry) VALUES (?1,?2,?2,?3,?4,'draft',?5,1,?6,?7,?7,?8)").bind(id, u.id, name, slug, JSON.stringify(doc), "copy:" + s.id, now, s.industry || null).run();
  await version(env, id, 1, doc, "Duplicated from " + s.name, u.id);
  return { id, slug, name };
}
export async function archiveSite(env, s, on) { const d = await sdb(env); await d.prepare("UPDATE sites SET archived_at=?2, status=CASE WHEN ?2 IS NULL THEN status ELSE 'draft' END, updated_at=?3 WHERE id=?1").bind(s.id, on ? nowIso() : null, nowIso()).run(); return { archived: !!on }; }
export async function deleteInfo(env, s) {
  const d = await sdb(env), c = async (sql) => (((await d.prepare(sql).bind(s.id).first().catch(() => null)) || {}).n || 0), doc = JSON.parse(s.doc);
  return { name: s.name, live: s.status === "live", pages: doc.pages.length, versions: await c("SELECT COUNT(*) AS n FROM site_versions WHERE site_id=?1"), formMessages: await c("SELECT COUNT(*) AS n FROM site_forms WHERE site_id=?1"), images: await c("SELECT COUNT(*) AS n FROM site_media WHERE site_id=?1"), domains: await c("SELECT COUNT(*) AS n FROM site_domains WHERE site_id=?1"), products: await c("SELECT COUNT(*) AS n FROM site_products WHERE site_id=?1"), orders: await c("SELECT COUNT(*) AS n FROM site_orders WHERE site_id=?1"), posts: await c("SELECT COUNT(*) AS n FROM site_posts WHERE site_id=?1") };
}

/* ---------- v32: share preview + client approval (Draft → Ready for review → Changes requested / Approved → Publish) ---------- */
export async function createShare(env, u, s, days, note) {
  const d = await sdb(env), token = randId(28), exp = new Date(Date.now() + Math.max(1, Math.min(30, +days || 7)) * 864e5).toISOString();
  await d.prepare("INSERT INTO site_shares (token, site_id, created_by, note, expires_at, created_at) VALUES (?1,?2,?3,?4,?5,?6)").bind(token, s.id, u.id, clip(note, 300), exp, nowIso()).run();
  await d.prepare("UPDATE sites SET review='ready' WHERE id=?1").bind(s.id).run();
  return { token, expiresAt: exp, url: (env.SITE_ORIGIN || "https://www.fodo.co.in") + "/api/sites/preview/" + token + "/" };
}
export async function shares(env, s) { const d = await sdb(env); return { shares: ((await d.prepare("SELECT token, note, expires_at, created_at FROM site_shares WHERE site_id=?1 ORDER BY created_at DESC LIMIT 20").bind(s.id).all()).results || []), reviews: ((await d.prepare("SELECT decision, comment, name, created_at FROM site_reviews WHERE site_id=?1 ORDER BY created_at DESC LIMIT 50").bind(s.id).all()).results || []), review: s.review || "draft" }; }
export async function revokeShare(env, s, token) { const d = await sdb(env); await d.prepare("DELETE FROM site_shares WHERE token=?1 AND site_id=?2").bind(String(token), s.id).run(); return { revoked: true }; }
export async function shareSite(env, token) {
  if (!/^[a-z0-9]{28}$/.test(String(token || ""))) return null; const d = await sdb(env), sh = await d.prepare("SELECT * FROM site_shares WHERE token=?1").bind(token).first();
  if (!sh || Date.parse(sh.expires_at) < Date.now()) return null; const s = await d.prepare("SELECT * FROM sites WHERE id=?1 AND deleted_at IS NULL").bind(sh.site_id).first(); return s ? Object.assign(s, { share: sh }) : null;
}
export async function review(env, token, body, ip) {
  const s = await shareSite(env, token); if (!s) throw err("This preview link has expired.", 404);
  const decision = body.decision === "approve" ? "approved" : "changes", d = await sdb(env);
  await d.prepare("INSERT INTO site_reviews (id, site_id, token, decision, comment, name, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind("wr_" + randId(12), s.id, token, decision, clip(body.comment, 2000), clip(body.name, 80), nowIso()).run();
  await d.prepare("UPDATE sites SET review=?2 WHERE id=?1").bind(s.id, decision).run();
  try { const o = await d.prepare("SELECT email FROM acct_users WHERE id=?1").bind(s.owner_user_id).first(); if (o && o.email) await sendMail(env, o.email, (decision === "approved" ? "✅ Approved: " : "✏️ Changes requested: ") + clip(s.name, 60), "<p><b>" + esc(clip(body.name, 80) || "Your client") + "</b> " + (decision === "approved" ? "approved" : "requested changes to") + " <b>" + esc(s.name) + "</b>.</p>" + (body.comment ? "<blockquote>" + esc(clip(body.comment, 2000)) + "</blockquote>" : "") + "<p>Open it in FODO Website Builder.</p>"); } catch (e) {}
  return { ok: true, decision };
}
export async function setReview(env, s, status) { if (["draft", "ready", "changes", "approved"].indexOf(status) < 0) throw err("Unknown status."); const d = await sdb(env); await d.prepare("UPDATE sites SET review=?2 WHERE id=?1").bind(s.id, status).run(); return { review: status }; }

/* ---------- v32: members (owner · admin · editor · viewer) + ownership transfer ---------- */
export async function members(env, s) { const d = await sdb(env); const o = await d.prepare("SELECT email FROM acct_users WHERE id=?1").bind(s.owner_user_id).first(); return { owner: o && o.email, members: ((await d.prepare("SELECT email, role, created_at FROM site_members WHERE site_id=?1 ORDER BY created_at").bind(s.id).all()).results || []) }; }
export async function addMember(env, u, s, email, role) {
  email = String(email || "").trim().toLowerCase(); if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(email)) throw err("Enter a valid email.");
  if (["admin", "editor", "viewer"].indexOf(role) < 0) throw err("Role must be admin, editor or viewer."); if (role === "admin" && s.role !== "owner" && !s.asOwner) throw err("Only the owner can add admins.", 403);
  const d = await sdb(env), n = ((await d.prepare("SELECT COUNT(*) AS n FROM site_members WHERE site_id=?1").bind(s.id).first()) || {}).n || 0; if (n >= 25) throw err("Up to 25 members per website.");
  await d.prepare("INSERT INTO site_members (site_id, email, role, added_by, created_at) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(site_id, email) DO UPDATE SET role=?3").bind(s.id, email, role, u.id, nowIso()).run();
  try { await sendMail(env, email, "You were added to the website “" + clip(s.name, 60) + "”", "<p>" + esc(u.email || "Someone") + " added you as <b>" + role + "</b> on <b>" + esc(s.name) + "</b>.</p><p>Log in at https://www.fodo.co.in/website-builder/ with this email to open it.</p>"); } catch (e) {}
  return { email, role };
}
export async function removeMember(env, s, email) { const d = await sdb(env); await d.prepare("DELETE FROM site_members WHERE site_id=?1 AND email=?2").bind(s.id, String(email || "").toLowerCase()).run(); return { removed: true }; }
export async function transferSite(env, u, s, email) {
  const d = await sdb(env), to = await d.prepare("SELECT id, email FROM acct_users WHERE email=?1").bind(String(email || "").trim().toLowerCase()).first(); if (!to) throw err("No FODO account uses that email — ask them to sign up first.");
  if (to.id === s.owner_user_id) throw err("They already own it.");
  const old = await d.prepare("SELECT email FROM acct_users WHERE id=?1").bind(s.owner_user_id).first();
  await d.prepare("UPDATE sites SET owner_user_id=?2, tenant_id=?2, updated_at=?3 WHERE id=?1").bind(s.id, to.id, nowIso()).run();
  await d.prepare("DELETE FROM site_members WHERE site_id=?1 AND email=?2").bind(s.id, to.email).run();
  if (old && old.email) await d.prepare("INSERT INTO site_members (site_id, email, role, added_by, created_at) VALUES (?1,?2,'admin',?3,?4) ON CONFLICT(site_id, email) DO UPDATE SET role='admin'").bind(s.id, old.email, u.id, nowIso()).run();
  return { owner: to.email };
}

/* ---------- v32: import / analyse an existing website (structure always; content only with the user's rights) ---------- */
export async function analyzeSite(env, url) {
  const v = netSafe(url); if (!v.ok) throw err(v.reason || "Not a valid public website address.");
  let r, finalUrl; try { ({ r, finalUrl } = await safeFetch(v.url, { headers: { "user-agent": "FODO-Website-Builder/1.0 (+https://www.fodo.co.in)", accept: "text/html" } }, { timeout: 15000, env, maxHops: 4 })); } catch (e) { throw err("Couldn't open that website: " + clip(e.message, 120)); }
  if (!/html/.test(r.headers.get("content-type") || "")) throw err("That address isn't a web page.");
  let html = ""; const rd = r.body.getReader(), dec = new TextDecoder(); while (html.length < 700000) { const x = await rd.read(); if (x.done) break; html += dec.decode(x.value, { stream: true }); } try { rd.cancel(); } catch (e) {}
  const strip = (h) => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
  const base = new URL(finalUrl), host = base.hostname.replace(/^www\./, "");
  const title = strip((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || ""), desc = ((/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i.exec(html) || [])[1] || "");
  const navHtml = (/<(nav|header)[\s\S]*?<\/\1>/i.exec(html) || [""])[0], links = []; for (const m of navHtml.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) { try { const u2 = new URL(m[1], base); const t = strip(m[2]).slice(0, 40); if (u2.hostname.replace(/^www\./, "") === host && t && u2.pathname !== "/" && !links.some((l) => l.path === u2.pathname)) links.push({ label: t, path: u2.pathname }); } catch (e) {} if (links.length >= 14) break; }
  const heads = []; for (const m of html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)) { const t = strip(m[2]); if (t) heads.push({ level: +m[1], text: t.slice(0, 140) }); if (heads.length >= 40) break; }
  const paras = []; for (const m of html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) { const t = strip(m[1]); if (t.length > 60) paras.push(t.slice(0, 400)); if (paras.length >= 12) break; }
  const colors = {}; for (const m of html.matchAll(/#([0-9a-f]{6})\b/gi)) { const c = "#" + m[1].toLowerCase(); if (!/^#(ffffff|000000|f{6})$/.test(c)) colors[c] = (colors[c] || 0) + 1; }
  const fonts = {}; for (const m of html.matchAll(/font-family\s*:\s*['"]?([A-Za-z][A-Za-z0-9 ]{2,30})/g)) fonts[m[1].trim()] = (fonts[m[1].trim()] || 0) + 1; for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?family=([A-Za-z+]+)/g)) fonts[m[1].replace(/\+/g, " ")] = 99;
  const imgs = []; for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)) { try { const u2 = new URL(m[1], base); if (u2.protocol === "https:") imgs.push({ src: u2.href, alt: ((/alt=["']([^"']*)/i.exec(m[0]) || [])[1] || "").slice(0, 100) }); } catch (e) {} if (imgs.length >= 20) break; }
  const sections = (html.match(/<section[\s>]/gi) || []).length, forms = (html.match(/<form[\s>]/gi) || []).length, responsive = /<meta[^>]+name=["']viewport/i.test(html);
  const phone = (/(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/.exec(strip(html)) || [])[0] || "", email = (/[\w.+-]+@[\w-]+\.[\w.]{2,}/.exec(strip(html).replace(/\.(png|jpg|webp)/g, "")) || [])[0] || "";
  const kind = findIndustry(title + " " + desc + " " + heads.slice(0, 6).map((h) => h.text).join(" "));
  return { url: finalUrl, host, title, description: desc, navigation: links, headings: heads, paragraphs: paras, colors: Object.entries(colors).sort((a, b) => b[1] - a[1]).slice(0, 6).map((x) => x[0]), fonts: Object.entries(fonts).sort((a, b) => b[1] - a[1]).slice(0, 4).map((x) => x[0]), images: imgs, counts: { sections, forms, images: imgs.length, headings: heads.length }, responsive, phone, email, industry: kind ? kind.name : "", profile: kind ? kind.profile : "local" };
}
/* map an analysis onto a plan (pages from its navigation) — the generated website is an ORIGINAL implementation */
export function importPlan(a) {
  const map = [[/about|story|who/i, "about", ["about", "team"]], [/service|solution|what we do|treatment|practice/i, "services", ["services", "process"]], [/work|portfolio|project|case/i, "work", ["portfolio"]], [/price|pricing|plan|package/i, "pricing", ["pricing", "faq"]], [/contact|reach|location/i, "contact", ["contact", "map"]], [/blog|news|insight|article/i, "articles", ["blog"]], [/faq|question/i, "faq", ["faq"]], [/team|doctor|people|staff/i, "team", ["team"]], [/gallery|photo/i, "gallery", ["gallery"]], [/book|appointment|reserv/i, "book", ["booking"]], [/menu/i, "menu", ["services"]], [/shop|store|product/i, "shop", ["products"]]];
  const pages = [{ slug: "home", title: "Home", sections: ["hero", "services", "process", "cta"] }];
  (a.navigation || []).forEach((l) => { const m = map.find((x) => x[0].test(l.label + " " + l.path)); if (m && !pages.some((p) => p.slug === m[1])) pages.push({ slug: m[1], title: l.label.slice(0, 40), sections: m[2] }); });
  if (!pages.some((p) => p.slug === "contact")) pages.push({ slug: "contact", title: "Contact", sections: ["contact"] });
  return { pages };
}
function applyImport(doc, a) {   // only when the user confirmed they own / may use the content
  const home = doc.pages.find((p) => p.slug === "home"), hero = home && home.sections.find((s) => s.type === "hero"), h1 = (a.headings || []).find((h) => h.level === 1);
  if (hero && h1) hero.props.title = clip(h1.text, 120); if (hero && a.description) hero.props.subtitle = clip(a.description, 220);
  const about = doc.pages.find((p) => p.slug === "about"); if (about && a.paragraphs && a.paragraphs[0]) { const s = about.sections.find((x) => x.type === "about"); if (s) s.props.text = clip(a.paragraphs.slice(0, 2).join(" "), 900); }
  const imgs = (a.images || []).filter((i) => /\.(jpe?g|png|webp)(\?|$)/i.test(i.src)); if (hero && imgs[0]) { hero.props.image = imgs[0].src; hero.props.imageAlt = imgs[0].alt || hero.props.title; }
}

/* ---------- v32 owner: turn a website into a template (business details become variables) ---------- */
export async function toTemplate(env, u, s, b) {
  if (!isOwner(u)) throw err("Only FODO owners can add templates.", 403);
  const doc = JSON.parse(s.doc), biz = (doc.settings || {}).business || {}; let txt = JSON.stringify({ theme: doc.theme, pages: doc.pages, components: doc.components });
  [["name", "{{business_name}}"], ["phone", "{{phone}}"], ["email", "{{email}}"], ["address", "{{location}}"]].forEach(([k, v]) => { const val = String(biz[k] || "").trim(); if (val.length > 2) txt = txt.split(JSON.stringify(val).slice(1, -1)).join(v); });
  const id = "ct_" + randId(10), d = await sdb(env);
  await d.prepare("INSERT INTO site_templates (id, name, category, tags, doc, by_user, active, created_at) VALUES (?1,?2,?3,?4,?5,?6,1,?7)").bind(id, clip(b.name || s.name + " template", 80), clip(b.category || biz.industry || "Business", 40), clip(b.tags || "", 300), txt, u.id, nowIso()).run();
  return { id };
}
export async function customTemplates(env) { const d = await sdb(env); return ((await d.prepare("SELECT id, name, category, tags, doc, created_at FROM site_templates WHERE active=1 ORDER BY created_at DESC LIMIT 200").all()).results || []).map((r) => { const x = JSON.parse(r.doc); return { id: r.id, name: r.name, category: r.category, tags: String(r.tags || "").split(/[,\s]+/).filter(Boolean), theme: x.theme, pages: x.pages, components: x.components, license: FODO_LICENSE, custom: true, features: ["FODO owner template"] }; }); }
async function customTemplate(env, id) { return (await customTemplates(env)).find((t) => t.id === id) || null; }
export async function removeTemplate(env, u, id) { if (!isOwner(u)) throw err("Only FODO owners.", 403); const d = await sdb(env); await d.prepare("UPDATE site_templates SET active=0 WHERE id=?1").bind(String(id)).run(); return { removed: true }; }
export async function aiHistory(env, s) { const d = await sdb(env); return ((await d.prepare("SELECT kind, prompt, result, created_at FROM site_ai WHERE site_id=?1 ORDER BY created_at DESC LIMIT 60").bind(s.id).all()).results || []); }
export { audit, autoFix, planSitemap, parsePrompt, esc };
export { TEMPLATES, SOURCES, FODO_LICENSE, clientAllowed, renderPage, checkSite, themeCss };
