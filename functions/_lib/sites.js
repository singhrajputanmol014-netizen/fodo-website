/* FODO Website Builder — server library (v28). Architecture: docs/website-builder-architecture.md · docs/tenant-security.md
   TENANT RULE: every function that touches a website takes the AUTHENTICATED user (from the server session) and resolves the
   website with siteFor(): the site's owner_user_id must be that user — or the user is a FODO owner (global access, audited).
   A site id from the browser is only a lookup key; a stranger's id answers "not found" (no hint that it exists).
   The client AI only ever sees ONE website's document and can only return edits to it. */
import { db as accountsDb, isOwner, activePlan, nowIso, randId, sha256, sendMail } from "./accounts.js";
import { SECTION_TYPES, renderPage, checkSite, themeCss, sitemap, sanitizeCss, PLACEHOLDER, FONTS } from "../../sites/lib/render.js";
import { TEMPLATES, templateById, searchTemplates, why, clientAllowed, SOURCES, FODO_LICENSE } from "../../sites/lib/templates.js";
import { brainAI, parseJson } from "./brain/models.js";

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
];
const made = new WeakSet();
export async function sdb(env) { const d = await accountsDb(env); if (!d) return null; if (!made.has(d)) { await d.batch(DDL.map((s) => d.prepare(s))); made.add(d); } return d; }
const clip = (s, n) => { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n) : s; };
const err = (msg, status) => Object.assign(new Error(msg), { status: status || 400 });

/* plan limits — architecture only (billing lives in accounts/plans; the editor never checks plans itself) */
export const LIMITS = { free: { sites: 1, pages: 6, media: 30, domains: 0, ai: 40 }, starter: { sites: 3, pages: 15, media: 150, domains: 1, ai: 200 }, pro: { sites: 10, pages: 40, media: 600, domains: 5, ai: 800 }, agency: { sites: 50, pages: 100, media: 3000, domains: 50, ai: 4000 } };
export const limitsFor = (u) => (isOwner(u) ? { sites: 9999, pages: 200, media: 99999, domains: 999, ai: 99999, owner: true } : LIMITS[activePlan(u)] || LIMITS.free);

/* ---------- tenant resolution ---------- */
export async function siteFor(env, u, id) {
  if (!u || !/^ws_[a-z0-9]{12}$/.test(String(id || ""))) throw err("Website not found.", 404);
  const d = await sdb(env), s = await d.prepare("SELECT * FROM sites WHERE id=?1 AND deleted_at IS NULL").bind(id).first();
  if (!s) throw err("Website not found.", 404);
  if (s.owner_user_id !== u.id && !isOwner(u)) throw err("Website not found.", 404);
  return Object.assign(s, { asOwner: s.owner_user_id !== u.id });
}
export async function listSites(env, u, all) {
  const d = await sdb(env), q = all && isOwner(u) ? d.prepare("SELECT s.id, s.name, s.slug, s.status, s.updated_at, s.published_at, s.owner_user_id, u.email AS owner_email, (SELECT domain FROM site_domains WHERE site_id=s.id AND status='connected' LIMIT 1) AS domain FROM sites s LEFT JOIN acct_users u ON u.id=s.owner_user_id WHERE s.deleted_at IS NULL ORDER BY s.updated_at DESC LIMIT 500")
    : d.prepare("SELECT id, name, slug, status, updated_at, published_at, (SELECT domain FROM site_domains WHERE site_id=sites.id AND status='connected' LIMIT 1) AS domain FROM sites WHERE owner_user_id=?1 AND deleted_at IS NULL ORDER BY updated_at DESC").bind(u.id);
  return (await q.all()).results || [];
}

/* ---------- the document: validated on every save ---------- */
const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;
function cleanVal(v, depth) {
  if (depth > 6) return null;
  if (typeof v === "string") return clip(v, 4000);
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
  ["mode", "primary", "accent", "bg", "text", "font", "headingFont", "radius"].forEach((k) => { if (t[k] != null) out.theme[k] = clip(t[k], 40); });
  if (out.theme.font && !FONTS[out.theme.font]) delete out.theme.font; if (out.theme.headingFont && !FONTS[out.theme.headingFont]) delete out.theme.headingFont;
  if (out.settings.customCss) out.settings.customCss = sanitizeCss(out.settings.customCss);
  delete out.settings.customJs; delete out.settings.headCode;   // scripts are never accepted (a website is data)
  for (const p of pages) {
    const slug = String(p.slug || "").toLowerCase(); if (!SLUG.test(slug) || seen.has(slug)) throw err("Page address “" + clip(slug, 40) + "” is invalid or used twice."); seen.add(slug);
    const secs = (Array.isArray(p.sections) ? p.sections : []).slice(0, 40).filter((s) => s && SECTION_TYPES.indexOf(s.type) > -1).map((s) => ({ type: s.type, props: cleanVal(s.props || {}, 0) || {} }));
    out.pages.push({ slug, title: clip(p.title || slug, 80), navLabel: p.navLabel ? clip(p.navLabel, 40) : undefined, nav: p.nav === false ? false : undefined, hidden: !!p.hidden || undefined, noindex: !!p.noindex || undefined, password: p.password && /^[0-9a-f]{64}$/.test(p.password) ? p.password : undefined, seo: cleanVal(p.seo || {}, 0) || {}, sections: secs });
  }
  const size = JSON.stringify(out).length; if (size > 600000) throw err("The website is too large (" + Math.round(size / 1000) + " KB).");
  return out;
}

/* ---------- create: template → AI personalisation → saved draft ---------- */
export function recommend(q) { return searchTemplates(q, { client: true }).slice(0, 3).map((t) => ({ id: t.id, name: t.name, category: t.category, why: why(t, q), license: t.license, mode: t.theme.mode, pages: t.pages.map((p) => p.title) })); }
async function uniqueSlug(d, name) { let base = String(name || "site").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "site"; if (base.length < 3) base += "-site"; for (let i = 0; i < 6; i++) { const s = i ? base + "-" + randId(4) : base; if (!(await d.prepare("SELECT 1 FROM sites WHERE slug=?1").bind(s).first())) return s; } return base + "-" + randId(8); }
const NO_AI = { testimonials: 1, stats: 1, logos: 1, team: 1 };   // reviews, numbers, logos and people are never invented
export async function personalize(env, doc, biz) {
  const work = doc.pages.map((p) => ({ slug: p.slug, sections: p.sections.map((s) => (NO_AI[s.type] || s.type === "navbar" || s.type === "map" ? null : { type: s.type, props: s.props })) }));
  const r = await brainAI(env, { kind: "code", json: true, purpose: "site-generate", max: 7000, messages: [
    { role: "system", content: "You write website copy for a small business. You get the website's sections as JSON. Return the SAME JSON structure ({\"pages\":[{\"slug\",\"sections\":[{\"type\",\"props\"}|null]}]}) with the text props rewritten for THIS business: specific, warm, short, no clichés, in " + (biz.lang === "hi" ? "Hindi" : "English") + ". Keep every type, keep nulls, keep hrefs/images, keep the same number of items (you may add up to 2 services/FAQ items). Replace [placeholders] in titles/descriptions with real wording only if the business details give it; otherwise keep them. NEVER invent reviews, numbers, awards, years, prices or people. Reply JSON only." },
    { role: "user", content: "BUSINESS: " + JSON.stringify({ name: biz.name, industry: biz.industry, location: biz.location, goal: biz.goal, style: biz.style, about: biz.about, services: biz.services, phone: biz.phone }) + "\nSECTIONS: " + JSON.stringify({ pages: work }) }] });
  const j = parseJson(r.text); if (!j || !Array.isArray(j.pages)) return { doc, ai: false };
  j.pages.forEach((jp) => { const p = doc.pages.find((x) => x.slug === jp.slug); if (!p || !Array.isArray(jp.sections)) return; jp.sections.forEach((s, i) => { const cur = p.sections[i]; if (!s || !cur || s.type !== cur.type || NO_AI[cur.type]) return; cur.props = mergeText(cur.props, s.props); }); });
  return { doc, ai: true, model: r.provider + " · " + r.model };
}
function mergeText(a, b) {   // take the AI's strings; keep structure, links and images from the template
  if (typeof a === "string" || a == null) return typeof b === "string" ? clip(b, 2000) : a;
  if (Array.isArray(a)) { const arr = Array.isArray(b) ? b : []; const n = Math.min(a.length + 2, Math.max(a.length, arr.length)); const out = []; for (let i = 0; i < n; i++) out.push(i < a.length ? mergeText(a[i], arr[i]) : mergeText(a[a.length - 1], arr[i])); return out; }
  if (typeof a === "object") { const o = Object.assign({}, a); Object.keys(a).forEach((k) => { if (/^(href|image|src|logoImg|bg|align|url|icon|featured)$/.test(k)) return; if (b && b[k] != null) o[k] = mergeText(a[k], b[k]); }); return o; }
  return a;
}
export async function createSite(env, u, body) {
  const d = await sdb(env), lim = limitsFor(u), n = ((await d.prepare("SELECT COUNT(*) AS n FROM sites WHERE owner_user_id=?1 AND deleted_at IS NULL").bind(u.id).first()) || {}).n || 0;
  if (n >= lim.sites) throw err("Your plan allows " + lim.sites + " website" + (lim.sites > 1 ? "s" : "") + ". Upgrade to add more.", 402);
  const biz = { name: clip(body.name, 80).trim(), industry: clip(body.industry, 60), location: clip(body.location, 80), goal: clip(body.goal, 120), style: clip(body.style, 60), about: clip(body.about, 600), services: clip(body.services, 400), phone: clip(body.phone, 30), email: clip(body.email, 120), whatsapp: clip(body.whatsapp, 20), lang: body.lang === "hi" ? "hi" : "en" };
  if (biz.name.length < 2) throw err("Tell us the business name.");
  const t = templateById(body.templateId) || searchTemplates(biz.industry + " " + biz.style + " " + biz.goal, { client: true })[0];
  if (!clientAllowed(t.license)) throw err("That template's license doesn't allow client websites.");
  let doc = JSON.parse(JSON.stringify({ theme: t.theme, settings: { business: { name: biz.name, phone: biz.phone, email: biz.email, whatsapp: biz.whatsapp, address: biz.location, city: biz.location, description: "" }, notifyEmail: biz.email || u.email, lang: biz.lang }, pages: t.pages }));
  if (Array.isArray(body.pages) && body.pages.length) doc.pages = doc.pages.filter((p) => p.slug === "home" || body.pages.indexOf(p.slug) > -1);
  doc.pages.forEach((p) => p.sections.forEach((s) => { if (s.type === "contact") Object.assign(s.props, { phone: biz.phone || s.props.phone, email: biz.email || s.props.email, whatsapp: biz.whatsapp || s.props.whatsapp, address: biz.location || s.props.address }); if (s.type === "map") s.props.address = biz.location || ""; }));
  let ai = { ai: false }; if (body.ai !== false) { try { ai = await personalize(env, doc, biz); doc = ai.doc; } catch (e) { ai = { ai: false, error: e.message }; } }
  doc = validateDoc(doc, lim);
  const id = "ws_" + randId(12), slug = await uniqueSlug(d, biz.name), now = nowIso();
  await d.prepare("INSERT INTO sites (id, tenant_id, owner_user_id, name, slug, status, doc, rev, template_id, created_at, updated_at) VALUES (?1,?2,?2,?3,?4,'draft',?5,1,?6,?7,?7)").bind(id, u.id, biz.name, slug, JSON.stringify(doc), t.id, now).run();
  await version(env, id, 1, doc, "Created from " + t.name + (ai.ai ? " + AI copy" : ""), u.id);
  await aiLog(env, id, u.id, "generate", JSON.stringify(biz), ai.ai ? "ok · " + ai.model : "template only" + (ai.error ? " (" + clip(ai.error, 100) + ")" : ""));
  return { id, slug, template: t.id, ai: !!ai.ai };
}
async function version(env, siteId, rev, doc, note, by) { const d = await sdb(env); await d.prepare("INSERT INTO site_versions (id, site_id, rev, doc, note, by_user, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind("wv_" + randId(12), siteId, rev, JSON.stringify(doc), clip(note, 200), by || null, nowIso()).run(); }
async function aiLog(env, siteId, by, kind, prompt, result) { const d = await sdb(env); await d.prepare("INSERT INTO site_ai (id, site_id, by_user, kind, prompt, result, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind("wa_" + randId(12), siteId, by, kind, clip(prompt, 2000), clip(result, 2000), nowIso()).run(); }

/* ---------- save (autosave with conflict detection) ---------- */
export async function saveDoc(env, u, s, doc, baseRev, note) {
  const d = await sdb(env), clean = validateDoc(doc, limitsFor(u));
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
  const doc = JSON.parse(s.doc), chk = checkSite(doc); if (!chk.ok) return { published: false, issues: chk.issues };
  const d = await sdb(env), now = nowIso();
  await d.prepare("UPDATE sites SET status='live', published=?2, published_at=?3, updated_at=?3 WHERE id=?1").bind(s.id, JSON.stringify(doc), now).run();
  await version(env, s.id, s.rev, doc, "Published", u.id);
  return { published: true, issues: chk.issues, at: now, urls: urlsFor(env, s) };
}
export async function unpublish(env, s) { const d = await sdb(env); await d.prepare("UPDATE sites SET status='draft', updated_at=?2 WHERE id=?1").bind(s.id, nowIso()).run(); return { unpublished: true }; }
export function urlsFor(env, s) { const host = env.SITES_HOST || null; return { fodo: (env.SITE_ORIGIN || "https://www.fodo.co.in") + "/api/sites/view/" + s.slug + "/", sites: host ? "https://" + host + "/" + s.slug + "/" : null }; }

/* ---------- forms + analytics (public endpoints: rate-limited, no cookies) ---------- */
export async function submitForm(env, siteId, body, ip) {
  if (!/^ws_[a-z0-9]{12}$/.test(String(siteId))) throw err("Not found.", 404);
  const d = await sdb(env), s = await d.prepare("SELECT id, name, status, published, owner_user_id FROM sites WHERE id=?1 AND deleted_at IS NULL").bind(siteId).first(); if (!s || s.status !== "live") throw err("Not found.", 404);
  if (body._hp) return { ok: true };   // honeypot: bots get a polite yes
  const data = {}; Object.keys(body || {}).slice(0, 15).forEach((k) => { if (/^[a-z_]{1,20}$/.test(k) && k !== "_hp") data[k] = clip(body[k], 2000); });
  if (!data.email && !data.phone && !data.name) throw err("Please fill in the form.");
  if (data.email && !/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(data.email)) throw err("Please enter a valid email.");
  const ipHash = (await sha256("form|" + (ip || ""))).slice(0, 16), now = nowIso();
  const recent = ((await d.prepare("SELECT COUNT(*) AS n FROM site_forms WHERE site_id=?1 AND ip_hash=?2 AND created_at > ?3").bind(s.id, ipHash, new Date(Date.now() - 3600e3).toISOString()).first()) || {}).n || 0;
  if (recent >= 8) throw err("Too many messages — please try later.", 429);
  await d.prepare("INSERT INTO site_forms (id, site_id, page, data, ip_hash, created_at) VALUES (?1,?2,?3,?4,?5,?6)").bind("wf_" + randId(12), s.id, clip(data._page || "", 120), JSON.stringify(data), ipHash, now).run();
  await bump(env, s.id, data._page || "/", "form");
  try { const pub = JSON.parse(s.published || "{}"), to = (pub.settings || {}).notifyEmail; if (to && /@/.test(to)) await sendMail(env, to, "New enquiry from your website — " + clip(s.name, 60), "<p>You have a new message from <b>" + esc(s.name) + "</b>:</p><table>" + Object.keys(data).filter((k) => k[0] !== "_").map((k) => "<tr><td><b>" + esc(k) + "</b></td><td>" + esc(data[k]) + "</td></tr>").join("") + "</table><p>See all messages in FODO Website Builder.</p>"); } catch (e) {}
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
export { TEMPLATES, SOURCES, FODO_LICENSE, clientAllowed, renderPage, checkSite, themeCss };
