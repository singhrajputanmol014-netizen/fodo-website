/* FODO v40 Business OS: workspace roles, business dashboard (Next Best Action from real data), Brand Kit, Content & Ads,
   FODO Pros marketplace (profiles, packages, portfolio, moderation, matching, shortlist), projects (state machine, milestones,
   messages, bookings without double booking, reviews only after completion, disputes), payouts and notifications.
   Rules: every permission is decided here on the server; nothing is invented (no fake reviews, ratings, counts, payouts or
   "live" ads); anything that needs an outside provider says so ("Awaiting provider activation"). */
import { db as adb, isOwner, nowIso, randId, sendMail, migrateOnce } from "./accounts.js";

export const PRO_ROLES = ["Director of Photography", "Cinematographer", "Photographer", "Videographer", "Video Editor", "Motion Designer", "Graphic Designer", "Brand Designer", "UI/UX Designer", "Web Designer", "Web Developer", "Shopify Specialist",
  "Copywriter", "Scriptwriter", "Content Writer", "Content Strategist", "Social Media Manager", "Performance Marketer", "Media Buyer", "SEO Specialist", "PPC Specialist", "Marketing Strategist", "Brand Strategist", "Creative Director",
  "Art Director", "Animator", "3D Artist", "Sound Designer", "Voice Artist", "UGC Creator", "Influencer", "Creator", "Model", "Actor", "Makeup Artist", "Stylist", "Producer", "Production Manager", "Director", "Assistant Director", "Drone Operator", "Event/Activation Professional"];
export const PRO_CATS = { "Strategy & Marketing": ["Marketing Strategist", "Brand Strategist", "Performance Marketer", "Media Buyer", "SEO Specialist", "PPC Specialist", "Social Media Manager", "Content Strategist"],
  Content: ["Copywriter", "Scriptwriter", "Content Writer", "UGC Creator", "Influencer", "Creator"], Design: ["Graphic Designer", "Brand Designer", "UI/UX Designer", "Art Director", "Creative Director", "3D Artist", "Animator", "Motion Designer"],
  Video: ["Director of Photography", "Cinematographer", "Videographer", "Video Editor", "Director", "Assistant Director", "Drone Operator"], Photography: ["Photographer"],
  Production: ["Producer", "Production Manager", "Model", "Actor", "Makeup Artist", "Stylist", "Event/Activation Professional"], Audio: ["Sound Designer", "Voice Artist"], Web: ["Web Designer", "Web Developer", "Shopify Specialist"] };
export const PRO_STATES = ["draft", "pending", "approved", "published", "suspended", "rejected", "archived"];
export const PROJECT_STATES = { requested: ["proposed", "cancelled"], proposed: ["accepted", "requested", "cancelled"], accepted: ["in_progress", "cancelled", "disputed"], in_progress: ["delivered", "disputed", "cancelled"], delivered: ["completed", "in_progress", "disputed"], completed: [], cancelled: [], disputed: ["in_progress", "cancelled", "completed"] };
export const CONTENT_STATES = ["idea", "brief", "assigned", "production", "review", "approved", "scheduled", "published"];
export const AD_PLATFORMS = ["Meta", "Google", "LinkedIn", "YouTube", "TikTok"];
export const err = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const arr = (a, n, m) => (Array.isArray(a) ? a : String(a || "").split(",")).map((x) => clip(x, m || 60)).filter(Boolean).slice(0, n || 20);
const int = (v, lo, hi) => { const n = Math.round(+v); return isFinite(n) && n >= lo && n <= hi ? n : null; };
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
const url = (s) => { s = clip(s, 400); return /^https:\/\/[^\s<>"']+$/i.test(s) ? s : ""; };

const DDL = [
  "CREATE TABLE IF NOT EXISTS biz_staff (email TEXT PRIMARY KEY, role TEXT, added_by TEXT, added_at TEXT)",
  "CREATE TABLE IF NOT EXISTS biz_settings (k TEXT PRIMARY KEY, v TEXT)",
  "CREATE TABLE IF NOT EXISTS biz_brand (user_id TEXT PRIMARY KEY, data TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS biz_content (id TEXT PRIMARY KEY, user_id TEXT, title TEXT, platform TEXT, format TEXT, status TEXT, due TEXT, brief TEXT, project_id TEXT, campaign_id TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE INDEX IF NOT EXISTS biz_content_u ON biz_content(user_id, due)",
  "CREATE TABLE IF NOT EXISTS biz_campaigns (id TEXT PRIMARY KEY, user_id TEXT, name TEXT, platform TEXT, objective TEXT, budget INTEGER, days INTEGER, audience TEXT, kpi TEXT, landing TEXT, creatives TEXT, status TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS biz_pros (id TEXT PRIMARY KEY, user_id TEXT UNIQUE, name TEXT, title TEXT, role TEXT, cats TEXT, skills TEXT, tools TEXT, years INTEGER, city TEXT, radius_km INTEGER, remote INTEGER, onsite INTEGER, langs TEXT, bio TEXT, rate_day INTEGER, photo TEXT, days TEXT, blackout TEXT, notice_days INTEGER, status TEXT, note TEXT, terms_at TEXT, submitted_at TEXT, approved_at TEXT, approved_by TEXT, done_n INTEGER DEFAULT 0, rating_sum INTEGER DEFAULT 0, rating_n INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS biz_packages (id TEXT PRIMARY KEY, pro_id TEXT, name TEXT, descr TEXT, deliverables TEXT, price INTEGER, days INTEGER, revisions INTEGER, rights TEXT, active INTEGER DEFAULT 1, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS biz_portfolio (id TEXT PRIMARY KEY, pro_id TEXT, kind TEXT, title TEXT, url TEXT, role TEXT, industry TEXT, descr TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS biz_shortlist (user_id TEXT, pro_id TEXT, note TEXT, tag TEXT, created_at TEXT, PRIMARY KEY (user_id, pro_id))",
  "CREATE TABLE IF NOT EXISTS biz_projects (id TEXT PRIMARY KEY, client_id TEXT, pro_id TEXT, title TEXT, brief TEXT, kind TEXT, budget INTEGER, package_id TEXT, day TEXT, status TEXT, content_id TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE INDEX IF NOT EXISTS biz_projects_c ON biz_projects(client_id, updated_at)",
  "CREATE INDEX IF NOT EXISTS biz_projects_p ON biz_projects(pro_id, updated_at)",
  "CREATE TABLE IF NOT EXISTS biz_milestones (id TEXT PRIMARY KEY, project_id TEXT, idx INTEGER, title TEXT, amount INTEGER, due TEXT, status TEXT, order_id TEXT, funded_at TEXT, submitted_at TEXT, approved_at TEXT, note TEXT)",
  "CREATE TABLE IF NOT EXISTS biz_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, user_id TEXT, body TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS biz_bookings (id TEXT PRIMARY KEY, pro_id TEXT, project_id TEXT, day TEXT, created_at TEXT, slot TEXT DEFAULT '')",
  "CREATE TABLE IF NOT EXISTS biz_reviews (project_id TEXT PRIMARY KEY, pro_id TEXT, client_id TEXT, rating INTEGER, text TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS biz_disputes (id TEXT PRIMARY KEY, project_id TEXT, by_id TEXT, reason TEXT, status TEXT, resolution TEXT, created_at TEXT, resolved_at TEXT)",
  "CREATE TABLE IF NOT EXISTS biz_payouts (id TEXT PRIMARY KEY, milestone_id TEXT UNIQUE, pro_id TEXT, gross INTEGER, commission INTEGER, net INTEGER, status TEXT, ref TEXT, created_at TEXT, paid_at TEXT)",
  "CREATE TABLE IF NOT EXISTS biz_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, kind TEXT, text TEXT, link TEXT, read INTEGER DEFAULT 0, created_at TEXT)",
  "CREATE INDEX IF NOT EXISTS biz_notes_u ON biz_notes(user_id, id)",
  "CREATE TABLE IF NOT EXISTS biz_invites (token TEXT PRIMARY KEY, note TEXT, max_uses INTEGER, uses INTEGER DEFAULT 0, expires_at TEXT, revoked INTEGER DEFAULT 0, created_by TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS biz_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, action TEXT, target TEXT, detail TEXT, created_at TEXT)",
];
const MIG = ["ALTER TABLE biz_pros ADD COLUMN invite TEXT",   // v40.1
  /* v44 Projects 2.0: time slots (one booking per pro + day + slot; '' = the whole day), modes, team, tasks, change requests, time, refunds */
  "ALTER TABLE biz_bookings ADD COLUMN slot TEXT DEFAULT ''", "DROP INDEX IF EXISTS biz_bookings_day", "CREATE UNIQUE INDEX IF NOT EXISTS biz_bookings_slot ON biz_bookings(pro_id, day, slot)",
  "ALTER TABLE biz_pros ADD COLUMN slots TEXT", "ALTER TABLE biz_projects ADD COLUMN slot TEXT", "ALTER TABLE biz_projects ADD COLUMN mode TEXT", "ALTER TABLE biz_projects ADD COLUMN rate INTEGER", "ALTER TABLE biz_projects ADD COLUMN cap INTEGER",
  "ALTER TABLE biz_milestones ADD COLUMN pro_id TEXT", "ALTER TABLE biz_milestones ADD COLUMN kind TEXT", "ALTER TABLE biz_milestones ADD COLUMN period TEXT", "ALTER TABLE biz_milestones ADD COLUMN refunded INTEGER",
  "CREATE TABLE IF NOT EXISTS biz_project_pros (project_id TEXT, pro_id TEXT, role TEXT, status TEXT, added_by TEXT, created_at TEXT, PRIMARY KEY (project_id, pro_id))",
  "CREATE TABLE IF NOT EXISTS biz_tasks (id TEXT PRIMARY KEY, project_id TEXT, title TEXT, who TEXT, due TEXT, status TEXT, created_by TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS biz_changes (id TEXT PRIMARY KEY, project_id TEXT, by_side TEXT, by_id TEXT, pro_id TEXT, title TEXT, detail TEXT, amount INTEGER, days INTEGER, status TEXT, milestone_id TEXT, created_at TEXT, decided_at TEXT)",
  "CREATE TABLE IF NOT EXISTS biz_time (id TEXT PRIMARY KEY, project_id TEXT, pro_id TEXT, day TEXT, minutes INTEGER, note TEXT, status TEXT, milestone_id TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS biz_refunds (id TEXT PRIMARY KEY, project_id TEXT, milestone_id TEXT, amount INTEGER, reason TEXT, status TEXT, by_id TEXT, provider TEXT, provider_ref TEXT, note TEXT, created_at TEXT, done_at TEXT)",
  /* v47.1 refund state machine: remember the state before a refund started, so a failed refund can restore it */
  "ALTER TABLE biz_milestones ADD COLUMN pre_refund TEXT", "ALTER TABLE biz_refunds ADD COLUMN attempts INTEGER",
  /* v47.2 availability rules + teams + equipment holds */
  "ALTER TABLE biz_pros ADD COLUMN tz TEXT", "ALTER TABLE biz_pros ADD COLUMN hours_start TEXT", "ALTER TABLE biz_pros ADD COLUMN hours_end TEXT", "ALTER TABLE biz_pros ADD COLUMN horizon_days INTEGER",
  "ALTER TABLE biz_pros ADD COLUMN max_week INTEGER", "ALTER TABLE biz_pros ADD COLUMN travel_buffer INTEGER", "ALTER TABLE biz_pros ADD COLUMN overrides TEXT",
  "CREATE TABLE IF NOT EXISTS biz_teams (id TEXT PRIMARY KEY, quote_id TEXT UNIQUE, client_id TEXT, title TEXT, template_id TEXT, status TEXT, start_day TEXT, days INTEGER, city TEXT, mode TEXT, quote_version INTEGER, locked_at TEXT, locked_by TEXT, reminded_at TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS biz_team_members (id TEXT PRIMARY KEY, team_id TEXT, slot INTEGER, role_id TEXT, role_name TEXT, pro_id TEXT, status TEXT, rate INTEGER, units REAL, unit TEXT, amount INTEGER, invited_at TEXT, expires_at TEXT, answered_at TEXT, note TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE INDEX IF NOT EXISTS biz_team_members_t ON biz_team_members(team_id, slot)", "CREATE INDEX IF NOT EXISTS biz_team_members_p ON biz_team_members(pro_id, status)",
  "CREATE UNIQUE INDEX IF NOT EXISTS biz_team_slot_live ON biz_team_members(team_id, slot) WHERE status IN ('open','invited','accepted','conflict')",
  "CREATE UNIQUE INDEX IF NOT EXISTS biz_team_pro_live ON biz_team_members(team_id, pro_id) WHERE status IN ('invited','accepted','conflict') AND pro_id IS NOT NULL",
  "CREATE TABLE IF NOT EXISTS biz_team_events (id INTEGER PRIMARY KEY AUTOINCREMENT, team_id TEXT, kind TEXT, by_email TEXT, note TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS biz_equipment_holds (id TEXT PRIMARY KEY, team_id TEXT, equipment_id TEXT, qty INTEGER, start_day TEXT, end_day TEXT, status TEXT, note TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS biz_equipment_days (equipment_id TEXT, day TEXT, unit INTEGER, hold_id TEXT, PRIMARY KEY (equipment_id, day, unit))",
  "CREATE INDEX IF NOT EXISTS biz_equipment_days_h ON biz_equipment_days(hold_id)",
  /* v47.3: team settlement payouts (one payout per settlement line) + Cashfree Easy Split vendor ids */
  "ALTER TABLE biz_payouts ADD COLUMN source_milestone TEXT", "ALTER TABLE biz_payouts ADD COLUMN label TEXT", "ALTER TABLE biz_pros ADD COLUMN cf_vendor_id TEXT"];
const ready = new WeakSet();
export async function bdb(env) { const d = await adb(env); if (!d) throw err("Database not connected.", 503); if (!ready.has(d)) { for (const q of DDL) await d.prepare(q).run(); await migrateOnce(d, MIG); ready.add(d); } return d; }
const all = async (d, sql, ...a) => (await d.prepare(sql).bind(...a).all()).results || [];
const one = (d, sql, ...a) => d.prepare(sql).bind(...a).first();
const run = (d, sql, ...a) => d.prepare(sql).bind(...a).run();
export async function auditLog(env, actor, action, target, detail) { try { await run(await bdb(env), "INSERT INTO biz_audit (actor, action, target, detail, created_at) VALUES (?1,?2,?3,?4,?5)", actor || "", action, target || "", clip(detail, 400), nowIso()); } catch (e) {} }
export async function notify(env, userId, kind, text, link) { if (!userId) return; await run(await bdb(env), "INSERT INTO biz_notes (user_id, kind, text, link, created_at) VALUES (?1,?2,?3,?4,?5)", userId, kind, clip(text, 300), clip(link, 200), nowIso());
  try { await (await import("./alerts.js")).deliver(env, userId, kind, clip(text, 300), clip(link, 200)); } catch (e) {} }   // v46.1: email per the person's notification settings

/* ---------- roles (server-side only) ---------- */
export async function rolesOf(env, u) {
  const d = await bdb(env), r = ["client"];
  if (isOwner(u)) r.push("owner", "admin", "moderator", "finance");
  else if (u.email) { const a = await one(d, "SELECT role FROM acct_admins WHERE email=?1", u.email).catch(() => null); if (a && a.role === "admin") r.push("admin", "moderator", "finance"); else if (a) r.push("viewer");
    const s = await one(d, "SELECT role FROM biz_staff WHERE email=?1", u.email); if (s && r.indexOf(s.role) < 0) r.push(s.role); }
  const p = await one(d, "SELECT id, status FROM biz_pros WHERE user_id=?1", u.id); if (p) r.push("pro");
  return { roles: r, pro: p || null };
}
export const can = (R, need) => need.some((x) => R.roles.indexOf(x) > -1);
export async function setStaff(env, u, email, role) {
  if (!isOwner(u)) throw err("Only FODO owners manage marketplace roles.", 403);
  const e = clip(email, 120).toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e)) throw err("Enter a valid email.");
  const d = await bdb(env); if (!role) await run(d, "DELETE FROM biz_staff WHERE email=?1", e);
  else { if (["moderator", "finance", "viewer"].indexOf(role) < 0) throw err("Role must be moderator, finance or viewer."); await run(d, "INSERT OR REPLACE INTO biz_staff (email, role, added_by, added_at) VALUES (?1,?2,?3,?4)", e, role, u.email, nowIso()); }
  await auditLog(env, u.email, "staff:" + (role || "remove"), e); return { ok: true };
}
const NAV = [["overview", "Overview", ["client"]], ["builder", "Website Builder", ["client"]], ["xray", "Business X-Ray", ["client"]], ["growth", "Growth Lab", ["client"]], ["content", "Content & Ads", ["client"]], ["studio", "AI Studio", ["client"]], ["project-builder", "Build a Team", ["client"]], ["pros", "Hire FODO Pros", ["client"]],
  ["projects", "Projects", ["client"]], ["quotes", "Quotes", ["client"]], ["leads", "CRM", ["client"]], ["brand", "Brand Kit", ["client"]], ["files", "Files", ["client"]], ["pro", "My Pro profile", ["client"]], ["billing", "Billing", ["client"]], ["notifications", "Notifications", ["client"]], ["settings", "Settings & privacy", ["client"]], ["admin", "Marketplace admin", ["admin", "moderator", "finance", "viewer"]]];
export const navFor = (R) => NAV.filter((n) => can(R, n[2]) && (n[0] !== "pro" || !!R.pro)).map((n) => ({ id: n[0], label: n[1] }));   // the Pro area is invite-only: no link for clients

/* ---------- settings (commission etc.) ---------- */
export async function settings(env) { const d = await bdb(env), r = await all(d, "SELECT k, v FROM biz_settings"), s = { commission: 10 }; r.forEach((x) => { s[x.k] = J(x.v, x.v); }); return s; }
export async function saveSettings(env, u, body) { if (!isOwner(u)) throw err("Only FODO owners change marketplace settings.", 403); const c = int(body.commission, 0, 40); if (c == null) throw err("Commission must be 0 – 40 %."); await run(await bdb(env), "INSERT OR REPLACE INTO biz_settings (k, v) VALUES ('commission', ?1)", JSON.stringify(c)); await auditLog(env, u.email, "settings:commission", "", String(c)); return { ok: true, commission: c }; }
export const payoutsOn = (env) => !!((env.CASHFREE_PAYOUTS_ON === "1" && env.CASHFREE_PAYOUT_CLIENT_ID && env.CASHFREE_PAYOUT_CLIENT_SECRET) || (env.RAZORPAYX_ON === "1" && env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAYX_ACCOUNT));   // v46.2: a configured payout adapter (payouts.js)

/* ---------- Brand Kit ---------- */
const HEX = /^#[0-9a-f]{6}$/i;
export function cleanBrand(b) {
  b = b || {}; const c = b.colors || {}, out = { name: clip(b.name, 80), tagline: clip(b.tagline, 140), logo: url(b.logo), colors: {}, fonts: { heading: clip((b.fonts || {}).heading, 40), body: clip((b.fonts || {}).body, 40) }, radius: int(b.radius, 0, 40) ?? 12, tone: clip(b.tone, 300), voice: arr(b.voice, 8, 30), audience: clip(b.audience, 200), dos: clip(b.dos, 400), donts: clip(b.donts, 400) };
  ["primary", "secondary", "accent", "background", "text"].forEach((k) => { if (HEX.test(c[k] || "")) out.colors[k] = c[k].toLowerCase(); });
  return out;
}
export async function getBrand(env, u) { const r = await one(await bdb(env), "SELECT data, updated_at FROM biz_brand WHERE user_id=?1", u.id); return r ? Object.assign(J(r.data, {}), { updatedAt: r.updated_at }) : null; }
export async function saveBrand(env, u, b) { const c = cleanBrand(b); await run(await bdb(env), "INSERT OR REPLACE INTO biz_brand (user_id, data, updated_at) VALUES (?1,?2,?3)", u.id, JSON.stringify(c), nowIso()); return c; }
/* from one of YOUR websites (its real theme) */
export function brandFromSite(s) {
  const doc = J(s.doc, {}), t = doc.theme || {}, biz = (doc.settings || {}).business || {}, nav = ((doc.pages || [])[0] || { sections: [] }).sections.find((x) => x.type === "navbar");
  return cleanBrand({ name: biz.name || s.name, tagline: biz.tagline, logo: nav && nav.props && nav.props.logoImg && /^https:/.test(nav.props.logoImg) ? nav.props.logoImg : "", colors: { primary: t.primary, secondary: t.secondary, accent: t.accent, background: t.bg || t.background, text: t.text }, fonts: { heading: t.headingFont, body: t.bodyFont || t.font }, radius: t.radius });
}

/* ---------- Content & Ads ---------- */
const noUid = (r) => { if (r) delete r.user_id; return r; };   // v45: the browser never needs internal user ids
export async function listContent(env, u) { return (await all(await bdb(env), "SELECT * FROM biz_content WHERE user_id=?1 ORDER BY COALESCE(due,'9999'), created_at LIMIT 500", u.id)).map(noUid); }
export async function saveContent(env, u, b) {
  const d = await bdb(env), id = b.id ? clip(b.id, 40) : "ct" + randId(14), title = clip(b.title, 140); if (title.length < 2) throw err("Give the content a title.");
  const st = CONTENT_STATES.indexOf(b.status) > -1 ? b.status : "idea", due = /^\d{4}-\d{2}-\d{2}$/.test(b.due || "") ? b.due : null, now = nowIso();
  if (b.id) { const r = await run(d, "UPDATE biz_content SET title=?3, platform=?4, format=?5, status=?6, due=?7, brief=COALESCE(?8, brief), updated_at=?9 WHERE id=?1 AND user_id=?2", id, u.id, title, clip(b.platform, 30), clip(b.format, 30), st, due, b.brief ? JSON.stringify(b.brief).slice(0, 8000) : null, now); if (!r.meta.changes) throw err("Not found.", 404); }
  else await run(d, "INSERT INTO biz_content (id, user_id, title, platform, format, status, due, brief, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)", id, u.id, title, clip(b.platform, 30), clip(b.format, 30), st, due, b.brief ? JSON.stringify(b.brief).slice(0, 8000) : null, now);
  return noUid(await one(d, "SELECT * FROM biz_content WHERE id=?1", id));
}
export async function delContent(env, u, id) { await run(await bdb(env), "DELETE FROM biz_content WHERE id=?1 AND user_id=?2", id, u.id); return { ok: true }; }
/* a creative brief from the inputs + the Brand Kit. Rules-based (always works); the professionals it suggests are roles, never invented people */
const FORMAT_ROLES = { reel: ["Videographer", "Video Editor", "UGC Creator", "Scriptwriter"], video: ["Cinematographer", "Video Editor", "Motion Designer", "Scriptwriter"], photo: ["Photographer", "Stylist"], carousel: ["Graphic Designer", "Copywriter"], post: ["Graphic Designer", "Copywriter"], blog: ["Content Writer", "SEO Specialist"], email: ["Copywriter"], ad: ["Performance Marketer", "Graphic Designer", "Copywriter"], website: ["Web Designer", "Copywriter"] };
export function buildBrief(b, brand) {
  const fmt = clip(b.format, 30).toLowerCase(), key = Object.keys(FORMAT_ROLES).find((k) => fmt.indexOf(k) > -1) || "post", n = int(b.count, 1, 50) || 1, plat = clip(b.platform, 30) || "Instagram";
  const deliver = { reel: n + " vertical reel" + (n > 1 ? "s" : "") + " (9:16, 15–45 s) with captions + cover image", video: n + " video" + (n > 1 ? "s" : "") + " (16:9 master + 9:16 cut)", photo: n + " edited photo" + (n > 1 ? "s" : "") + " (high-res + web size)", carousel: n + " carousel" + (n > 1 ? "s" : "") + " (5–8 slides, 1080×1350)", post: n + " static post" + (n > 1 ? "s" : "") + " (1080×1350)", blog: n + " article" + (n > 1 ? "s" : "") + " (900–1,500 words, SEO title + meta)", email: n + " email" + (n > 1 ? "s" : "") + " (subject, preview text, body, CTA)", ad: n + " ad creative set" + (n > 1 ? "s" : "") + " (3 sizes + 3 primary texts + 3 headlines)", website: "Landing page copy + layout" }[key];
  return { title: clip(b.title, 140) || (n + " " + key + (n > 1 ? "s" : "") + " for " + plat), objective: clip(b.objective, 200) || "Not set yet", audience: clip(b.audience, 200) || (brand && brand.audience) || "Not set yet", platform: plat, format: key, deliverables: [deliver, "Source files and usage rights for " + plat + " and your website"],
    offer: clip(b.offer, 200), cta: clip(b.cta, 80) || "Not set yet", tone: clip(b.tone, 120) || (brand && brand.tone) || "Not set yet", deadline: /^\d{4}-\d{2}-\d{2}$/.test(b.deadline || "") ? b.deadline : null, budget: int(b.budget, 0, 1e8),
    references: arr(b.references, 5, 300).filter((x) => /^https:\/\//.test(x)), brand: brand ? { name: brand.name, colors: brand.colors, fonts: brand.fonts } : null, suggestedRoles: FORMAT_ROLES[key], recommendedFormat: { reel: "Short vertical video performs best for reach on Instagram/YouTube Shorts", blog: "Long-form article for search traffic", ad: "Test 3 creatives against one audience before scaling" }[key] || null };
}
export async function listCampaigns(env, u) { return (await all(await bdb(env), "SELECT * FROM biz_campaigns WHERE user_id=?1 ORDER BY updated_at DESC LIMIT 200", u.id)).map(noUid); }
export async function saveCampaign(env, u, b) {
  const d = await bdb(env), id = b.id ? clip(b.id, 40) : "cp" + randId(14), name = clip(b.name, 120); if (name.length < 2) throw err("Name the campaign.");
  const plat = AD_PLATFORMS.indexOf(b.platform) > -1 ? b.platform : "Meta", budget = int(b.budget, 0, 1e9) || 0, days = int(b.days, 1, 365) || 30, now = nowIso();
  const st = b.status === "ready" ? "ready" : "draft";   // "live" is never set here: only a connected ad platform could confirm that
  const vals = [id, u.id, name, plat, clip(b.objective, 60), budget, days, clip(b.audience, 400), clip(b.kpi, 120), url(b.landing), JSON.stringify(arr(b.creatives, 10, 200)), st, now];
  if (b.id) { const r = await run(d, "UPDATE biz_campaigns SET name=?3, platform=?4, objective=?5, budget=?6, days=?7, audience=?8, kpi=?9, landing=?10, creatives=?11, status=?12, updated_at=?13 WHERE id=?1 AND user_id=?2", ...vals); if (!r.meta.changes) throw err("Not found.", 404); }
  else await run(d, "INSERT INTO biz_campaigns (id, user_id, name, platform, objective, budget, days, audience, kpi, landing, creatives, status, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?13)", ...vals);
  const c = await one(d, "SELECT * FROM biz_campaigns WHERE id=?1", id); return Object.assign(noUid(c), { daily: Math.round(budget / days), publishing: "Not connected: FODO plans the campaign; publishing to " + plat + " needs that ad account connected (not live)." });
}

/* ---------- FODO Pros: profile, packages, portfolio ---------- */
export async function myPro(env, u) {
  const d = await bdb(env), p = await one(d, "SELECT * FROM biz_pros WHERE user_id=?1", u.id); if (!p) return null;
  return Object.assign(proOut(p, true), { packages: await all(d, "SELECT * FROM biz_packages WHERE pro_id=?1 ORDER BY price", p.id), portfolio: await all(d, "SELECT * FROM biz_portfolio WHERE pro_id=?1 ORDER BY created_at DESC", p.id), completeness: completeness(p, await one(d, "SELECT (SELECT count(*) FROM biz_packages WHERE pro_id=?1) pk, (SELECT count(*) FROM biz_portfolio WHERE pro_id=?1) pf", p.id)) });
}
function completeness(p, c) {
  const need = [["Professional name", !!p.name], ["Primary role", !!p.role], ["Skills", J(p.skills, []).length > 0], ["City", !!p.city], ["Bio (60+ characters)", (p.bio || "").length >= 60], ["Languages", J(p.langs, []).length > 0], ["Working days", J(p.days, []).length > 0], ["At least 1 package", c.pk > 0], ["At least 1 portfolio item", c.pf > 0], ["Terms accepted", !!p.terms_at]];
  return { pct: Math.round(need.filter((x) => x[1]).length / need.length * 100), missing: need.filter((x) => !x[1]).map((x) => x[0]) };
}
export function proOut(p, mine) {
  const o = { id: p.id, name: p.name, title: p.title, role: p.role, cats: J(p.cats, []), skills: J(p.skills, []), tools: J(p.tools, []), years: p.years, city: p.city, radiusKm: p.radius_km, remote: !!p.remote, onsite: !!p.onsite, langs: J(p.langs, []), bio: p.bio, rateDay: p.rate_day, photo: p.photo,
    days: J(p.days, []), slots: J(p.slots, []), noticeDays: p.notice_days || 0, verified: p.status === "approved" || p.status === "published", completed: p.done_n || 0, rating: p.rating_n ? Math.round(p.rating_sum / p.rating_n * 10) / 10 : null, reviews: p.rating_n || 0 };
  if (mine) Object.assign(o, { status: p.status, note: p.note, blackout: J(p.blackout, []), termsAt: p.terms_at });
  return o;
}
export async function savePro(env, u, b) {
  const d = await bdb(env), now = nowIso(); let p = await one(d, "SELECT * FROM biz_pros WHERE user_id=?1", u.id);
  if (p && p.status === "suspended") throw err("Your profile is suspended. Contact FODO.", 403);
  const role = PRO_ROLES.indexOf(b.role) > -1 ? b.role : p ? p.role : null, cats = Object.keys(PRO_CATS).filter((c) => PRO_CATS[c].indexOf(role) > -1);
  const days = arr(b.days, 7, 3).filter((x) => /^(mon|tue|wed|thu|fri|sat|sun)$/.test(x)), black = arr(b.blackout, 60, 10).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x));
  const v = [clip(b.name, 80) || (p && p.name) || "", clip(b.title, 80) || role || "", role, JSON.stringify(cats), JSON.stringify(arr(b.skills, 20, 40)), JSON.stringify(arr(b.tools, 20, 40)), int(b.years, 0, 60), clip(b.city, 60), int(b.radiusKm, 0, 3000) || 0, b.remote ? 1 : 0, b.onsite ? 1 : 0,
    JSON.stringify(arr(b.langs, 10, 30)), clip(b.bio, 1500), int(b.rateDay, 0, 1e7), url(b.photo), JSON.stringify(days), JSON.stringify(black), int(b.noticeDays, 0, 60) || 0, b.terms ? (p && p.terms_at) || now : null];
  let inv = null; if (!p && !isOwner(u)) inv = await useInvite(env, d, b.invite);
  if (!p) { const id = "pr" + randId(14); await run(d, "INSERT INTO biz_pros (id, user_id, name, title, role, cats, skills, tools, years, city, radius_km, remote, onsite, langs, bio, rate_day, photo, days, blackout, notice_days, terms_at, status, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,'draft',?22,?22)", id, u.id, ...v, now); if (inv) await run(d, "UPDATE biz_pros SET invite=?2 WHERE id=?1", id, inv); await auditLog(env, u.email, "pro:create", id, inv ? "invite " + inv.slice(0, 6) : "owner"); }
  else { const back = p.status === "approved" || p.status === "published" || p.status === "rejected" ? "pending" : p.status;   // a changed public profile goes back to review
    await run(d, "UPDATE biz_pros SET name=?2, title=?3, role=?4, cats=?5, skills=?6, tools=?7, years=?8, city=?9, radius_km=?10, remote=?11, onsite=?12, langs=?13, bio=?14, rate_day=?15, photo=?16, days=?17, blackout=?18, notice_days=?19, terms_at=?20, status=?21, updated_at=?22 WHERE id=?1", p.id, ...v, p.status === "draft" ? "draft" : back, now); }
  return myPro(env, u);
}
async function proOf(env, u) { const p = await one(await bdb(env), "SELECT * FROM biz_pros WHERE user_id=?1", u.id); if (!p) throw err("Create your FODO Pro profile first.", 404); return p; }
export async function submitPro(env, u) {
  const d = await bdb(env), p = await proOf(env, u), c = completeness(p, await one(d, "SELECT (SELECT count(*) FROM biz_packages WHERE pro_id=?1) pk, (SELECT count(*) FROM biz_portfolio WHERE pro_id=?1) pf", p.id));
  if (c.missing.length) throw Object.assign(err("Complete your profile first: " + c.missing.join(", ") + "."), { missing: c.missing });
  if (["pending", "approved", "published"].indexOf(p.status) > -1) return myPro(env, u);
  await run(d, "UPDATE biz_pros SET status='pending', submitted_at=?2, updated_at=?2 WHERE id=?1", p.id, nowIso()); await auditLog(env, u.email, "pro:submit", p.id);
  return myPro(env, u);
}
export async function savePackage(env, u, b) {
  const d = await bdb(env), p = await proOf(env, u), name = clip(b.name, 80), price = int(b.price, 100, 1e8); if (name.length < 3 || price == null) throw err("A package needs a name and a price of at least ₹100.");
  const v = [name, clip(b.descr, 600), JSON.stringify(arr(b.deliverables, 12, 120)), price, int(b.days, 1, 365) || 7, int(b.revisions, 0, 20) ?? 1, clip(b.rights, 200), b.active === false ? 0 : 1];
  if (b.id) { const r = await run(d, "UPDATE biz_packages SET name=?3, descr=?4, deliverables=?5, price=?6, days=?7, revisions=?8, rights=?9, active=?10 WHERE id=?1 AND pro_id=?2", b.id, p.id, ...v); if (!r.meta.changes) throw err("Not found.", 404); }
  else { if (((await one(d, "SELECT count(*) n FROM biz_packages WHERE pro_id=?1", p.id)) || {}).n >= 12) throw err("Up to 12 packages."); await run(d, "INSERT INTO biz_packages (id, pro_id, name, descr, deliverables, price, days, revisions, rights, active, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)", "pk" + randId(12), p.id, ...v, nowIso()); }
  return myPro(env, u);
}
export async function delPackage(env, u, id) { const p = await proOf(env, u); await run(await bdb(env), "DELETE FROM biz_packages WHERE id=?1 AND pro_id=?2", id, p.id); return myPro(env, u); }
export async function savePortfolio(env, u, b) {
  const d = await bdb(env), p = await proOf(env, u), link = url(b.url); if (!link) throw err("Add an https:// link to the work (YouTube, Vimeo, Behance, Drive, your site…).");
  if (((await one(d, "SELECT count(*) n FROM biz_portfolio WHERE pro_id=?1", p.id)) || {}).n >= 30) throw err("Up to 30 portfolio items.");
  await run(d, "INSERT INTO biz_portfolio (id, pro_id, kind, title, url, role, industry, descr, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)", "pf" + randId(12), p.id, ["image", "video", "pdf", "link", "case"].indexOf(b.kind) > -1 ? b.kind : "link", clip(b.title, 120) || "Work sample", link, clip(b.role, 60), clip(b.industry, 60), clip(b.descr, 600), nowIso());
  return myPro(env, u);
}
export async function delPortfolio(env, u, id) { const p = await proOf(env, u); await run(await bdb(env), "DELETE FROM biz_portfolio WHERE id=?1 AND pro_id=?2", id, p.id); return myPro(env, u); }

/* ---------- marketplace: deterministic need parsing + ranking (works without AI) ---------- */
const CITIES = ["delhi", "new delhi", "noida", "gurugram", "gurgaon", "faridabad", "ghaziabad", "mumbai", "bengaluru", "bangalore", "chennai", "hyderabad", "pune", "kolkata", "jaipur", "chandigarh", "lucknow", "ahmedabad", "dubai"];
const ROLE_WORDS = [[/cinematograph|dop\b|director of photography/, "Cinematographer"], [/photograph|photo shoot|photoshoot/, "Photographer"], [/videograph|video shoot/, "Videographer"], [/video edit|editor\b/, "Video Editor"], [/motion/, "Motion Designer"], [/graphic|poster|creative design/, "Graphic Designer"], [/logo|brand design|branding/, "Brand Designer"], [/ui|ux|app design/, "UI/UX Designer"], [/website|web design/, "Web Designer"], [/developer|coding/, "Web Developer"], [/shopify/, "Shopify Specialist"], [/copy/, "Copywriter"], [/script/, "Scriptwriter"], [/blog|article|content writ/, "Content Writer"], [/social media|instagram manag/, "Social Media Manager"], [/meta ads|google ads|performance|ads\b/, "Performance Marketer"], [/seo/, "SEO Specialist"], [/ugc/, "UGC Creator"], [/influencer/, "Influencer"], [/drone/, "Drone Operator"], [/makeup/, "Makeup Artist"], [/model\b/, "Model"], [/voice/, "Voice Artist"], [/animat/, "Animator"], [/reel/, "Videographer"]];
export function parseNeed(q) {
  const s = String(q || "").toLowerCase(), role = (ROLE_WORDS.find((r) => r[0].test(s)) || [])[1] || null, city = CITIES.find((c) => new RegExp("\\b" + c + "\\b").test(s)) || null;
  const bm = s.match(/(?:₹|rs\.?|inr|budget)\s*([\d,]+)\s*(k|lakh|l)?/) || s.match(/([\d,]+)\s*(k|lakh)\b/); let budget = null; if (bm) { budget = +bm[1].replace(/,/g, ""); if (/k/.test(bm[2] || "")) budget *= 1000; if (/l/.test(bm[2] || "")) budget *= 100000; }
  const WN = { one: 1, a: 1, single: 1, two: 2, three: 3, four: 4, five: 5, half: 0.5 }, dm = s.match(/(\d+|one|a|single|two|three|four|five|half)[\s-]*days?\b/), industry = (s.match(/\b(restaurant|cafe|clinic|dental|real estate|fashion|saas|startup|wedding|hotel|gym|salon|ecommerce|jewellery)\b/) || [])[1] || null;
  return { role, city: city ? city.replace("gurgaon", "gurugram").replace("bangalore", "bengaluru").replace("new delhi", "delhi") : null, budget, days: dm ? (WN[dm[1]] != null ? WN[dm[1]] : +dm[1]) : null, industry, remote: /remote|online/.test(s) ? true : null, onsite: /on[- ]?site|shoot|in person/.test(s) ? true : null };
}
export async function market(env, u, q) {
  const d = await bdb(env), N = Object.assign(parseNeed(q.q), Object.fromEntries(["role", "city"].filter((k) => q[k]).map((k) => [k, String(q[k]).toLowerCase() === "any" ? null : q[k]])));
  if (q.budget) N.budget = int(q.budget, 0, 1e9); if (q.remote === "1") N.remote = true;
  const rows = await all(d, "SELECT * FROM biz_pros WHERE status IN ('approved','published') LIMIT 2000"), pk = await all(d, "SELECT pro_id, min(price) mp FROM biz_packages WHERE active=1 GROUP BY pro_id"), minP = {}; pk.forEach((x) => { minP[x.pro_id] = x.mp; });
  const words = String(q.q || "").toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const scored = rows.map((p) => { const o = proOut(p), why = []; let s = 0;
    if (N.role) { if (o.role === N.role) { s += 40; why.push("Role: " + o.role); } else if (Object.keys(PRO_CATS).some((c) => PRO_CATS[c].indexOf(N.role) > -1 && o.cats.indexOf(c) > -1)) s += 15; else s -= 30; }
    const hay = (o.skills.concat(o.tools).join(" ") + " " + (o.bio || "") + " " + o.title).toLowerCase(), hits = words.filter((w) => hay.indexOf(w) > -1); if (hits.length) { s += Math.min(20, hits.length * 5); why.push("Skills match: " + hits.slice(0, 3).join(", ")); }
    if (N.city) { if ((o.city || "").toLowerCase().indexOf(N.city) > -1) { s += 15; why.push("Based in " + o.city); } else if (o.remote) s += 4; else s -= 10; }
    if (N.remote && o.remote) { s += 8; why.push("Works remotely"); }
    const price = minP[p.id] || o.rateDay; if (N.budget && price) { if (price <= N.budget) { s += 12; why.push("Within budget (from ₹" + price.toLocaleString("en-IN") + ")"); } else s -= Math.min(15, Math.round((price - N.budget) / Math.max(1, N.budget) * 15)); }
    if (o.years) s += Math.min(8, o.years); if (o.verified) s += 5; if (o.rating) { s += o.rating; why.push(o.rating + "★ from " + o.reviews + " review" + (o.reviews === 1 ? "" : "s")); } s += Math.min(6, o.completed);
    return Object.assign(o, { score: s, why, fromPrice: price || null }); });
  const L = scored.filter((o) => !N.role || q.strict !== "1" || o.role === N.role).sort((a, b) => b.score - a.score || (b.completed - a.completed)).slice(0, 60);
  return { need: N, results: L, total: rows.length };
}
export async function proPublic(env, u, id, R) {
  const d = await bdb(env), p = await one(d, "SELECT * FROM biz_pros WHERE id=?1", id); if (!p) throw err("Not found.", 404);
  const visible = p.status === "approved" || p.status === "published" || p.user_id === u.id || can(R, ["admin", "moderator"]); if (!visible) throw err("Not found.", 404);
  return Object.assign(proOut(p, p.user_id === u.id || can(R, ["admin", "moderator"])), { packages: await all(d, "SELECT id, name, descr, deliverables, price, days, revisions, rights FROM biz_packages WHERE pro_id=?1 AND active=1 ORDER BY price", id),
    portfolio: await all(d, "SELECT id, kind, title, url, role, industry, descr FROM biz_portfolio WHERE pro_id=?1 ORDER BY created_at DESC", id), reviewsList: await all(d, "SELECT rating, text, created_at FROM biz_reviews WHERE pro_id=?1 ORDER BY created_at DESC LIMIT 20", id),
    saved: !!(await one(d, "SELECT 1 x FROM biz_shortlist WHERE user_id=?1 AND pro_id=?2", u.id, id)), booked: (await all(d, "SELECT day FROM biz_bookings WHERE pro_id=?1 AND day >= ?2 AND COALESCE(slot,'')=''", id, nowIso().slice(0, 10))).map((x) => x.day),
    bookedSlots: await all(d, "SELECT day, slot FROM biz_bookings WHERE pro_id=?1 AND day >= ?2 AND COALESCE(slot,'') != ''", id, nowIso().slice(0, 10)) });
}
export async function shortlist(env, u, b) {
  const d = await bdb(env); if (b && b.proId) { if (b.remove) await run(d, "DELETE FROM biz_shortlist WHERE user_id=?1 AND pro_id=?2", u.id, b.proId); else { const p = await one(d, "SELECT status FROM biz_pros WHERE id=?1", b.proId); if (!p || ["approved", "published"].indexOf(p.status) < 0) throw err("Not found.", 404); await run(d, "INSERT OR REPLACE INTO biz_shortlist (user_id, pro_id, note, tag, created_at) VALUES (?1,?2,?3,?4,?5)", u.id, b.proId, clip(b.note, 400), clip(b.tag, 30), nowIso()); } }
  return (await all(d, "SELECT p.*, s.note AS sl_note, s.tag AS sl_tag FROM biz_shortlist s JOIN biz_pros p ON p.id=s.pro_id WHERE s.user_id=?1 AND p.status IN ('approved','published') ORDER BY s.created_at DESC", u.id)).map((r) => Object.assign(proOut(r), { note: r.sl_note, tag: r.sl_tag }));
}

/* ---------- projects ---------- */
export async function projectFor(env, u, id, R) {
  const d = await bdb(env), pj = await one(d, "SELECT * FROM biz_projects WHERE id=?1", id); if (!pj) throw err("Not found.", 404);
  const pro = await one(d, "SELECT * FROM biz_pros WHERE id=?1", pj.pro_id); let side = null, mine = null;
  if (pj.client_id === u.id) side = "client"; else if (pro && pro.user_id === u.id) { side = "pro"; mine = pro; }
  else { const m = await one(d, "SELECT p.*, x.status AS mstatus, x.role AS mrole FROM biz_project_pros x JOIN biz_pros p ON p.id=x.pro_id WHERE x.project_id=?1 AND p.user_id=?2", id, u.id);   // v44 team member
    if (m && m.mstatus === "accepted") { side = "pro"; mine = m; } else if (m && m.mstatus === "invited") { side = "invited"; mine = m; } }
  if (!side && can(R, ["admin", "moderator", "finance"])) side = "staff";
  if (!side) throw err("Not found.", 404); return { d, pj, pro, side, mine, lead: !!mine && !!pro && mine.id === pro.id };
}
/* booking clash check: a whole day ('' slot) clashes with every slot that day, and every slot with the whole day */
export async function slotFree(d, proId, day, slot, exceptProject) { return !(await one(d, "SELECT 1 x FROM biz_bookings WHERE pro_id=?1 AND day=?2 AND (slot=?3 OR slot='' OR ?3='') AND project_id != ?4", proId, day, slot || "", exceptProject || "-")); }
export const cleanSlots = (L) => { const out = arr(L, 8, 11).filter((x) => /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(x) && x.slice(0, 5) < x.slice(6)).sort(); const keep = []; out.forEach((x) => { if (!keep.length || keep[keep.length - 1].slice(6) <= x.slice(0, 5)) keep.push(x); }); return keep; };   // non-overlapping (first one wins)
export const dayOk = (pro, day) => { const dow = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(day + "T00:00:00Z").getUTCDay()], days = J(pro.days, []); if (days.length && days.indexOf(dow) < 0) return "isn't a working day for this professional"; if (J(pro.blackout, []).indexOf(day) > -1) return "is blocked by the professional"; const min = new Date(Date.now() + (pro.notice_days || 0) * 864e5).toISOString().slice(0, 10); if (day < min) return "is too soon (needs " + (pro.notice_days || 0) + " days' notice)"; if (day > new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10)) return "is more than a year away"; return null; };
export async function createProject(env, u, b) {
  const d = await bdb(env), pro = await one(d, "SELECT * FROM biz_pros WHERE id=?1", b.proId); if (!pro || ["approved", "published"].indexOf(pro.status) < 0) throw err("This professional isn't available.", 404);
  if (pro.user_id === u.id) throw err("You can't hire yourself.");
  const title = clip(b.title, 140), brief = clip(b.brief, 4000); if (title.length < 3 || brief.length < 10) throw err("Add a title and describe what you need (10+ characters).");
  let pkg = null; if (b.packageId) { pkg = await one(d, "SELECT * FROM biz_packages WHERE id=?1 AND pro_id=?2 AND active=1", b.packageId, pro.id); if (!pkg) throw err("That package isn't available."); }
  const day = /^\d{4}-\d{2}-\d{2}$/.test(b.day || "") ? b.day : null; const slots = J(pro.slots, []), slot = day && b.slot && slots.indexOf(b.slot) > -1 ? b.slot : "";   // v44 time slot ('' = the whole day)
  if (day && b.slot && !slot) throw err("Pick one of the professional's time slots.");
  if (day) { const why = dayOk(pro, day); if (why) throw err(day + " " + why + "."); if (!(await slotFree(d, pro.id, day, slot))) throw err(day + (slot ? " " + slot : "") + " is already booked.", 409); }
  if (await (async () => (((await one(d, "SELECT count(*) n FROM biz_projects WHERE client_id=?1 AND created_at >= ?2", u.id, new Date(Date.now() - 864e5).toISOString())) || {}).n || 0) >= 20)()) throw err("Too many requests today.", 429);
  const id = "pj" + randId(14), now = nowIso(), budget = pkg ? pkg.price : int(b.budget, 0, 1e9);
  await run(d, "INSERT INTO biz_projects (id, client_id, pro_id, title, brief, kind, budget, package_id, day, status, content_id, created_at, updated_at, slot, mode) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'requested',?10,?11,?11,?12,'fixed')", id, u.id, pro.id, title, brief, pkg ? "package" : clip(b.kind, 20) || "fixed", budget, pkg ? pkg.id : null, day, b.contentId ? clip(b.contentId, 40) : null, now, slot);
  if (b.contentId) await run(d, "UPDATE biz_content SET project_id=?3, status='assigned', updated_at=?4 WHERE id=?1 AND user_id=?2", b.contentId, u.id, id, now);
  await notify(env, pro.user_id, "request", "New project request: " + title, "#project=" + id); await auditLog(env, u.email, "project:create", id);
  return getProject(env, u, id, { roles: ["client"] });
}
export async function listProjects(env, u) {
  const d = await bdb(env), me = await one(d, "SELECT id FROM biz_pros WHERE user_id=?1", u.id);
  const rows = await all(d, "SELECT j.*, p.name AS pro_name, p.role AS pro_role FROM biz_projects j LEFT JOIN biz_pros p ON p.id=j.pro_id WHERE j.client_id=?1 OR j.pro_id=?2 OR j.id IN (SELECT project_id FROM biz_project_pros WHERE pro_id=?2 AND status IN ('accepted','invited')) ORDER BY j.updated_at DESC LIMIT 200", u.id, me ? me.id : "-");
  return rows.map((r) => Object.assign(r, { side: r.client_id === u.id ? "client" : "pro" }));
}
export async function getProject(env, u, id, R) {
  const { d, pj, pro, side, mine, lead } = await projectFor(env, u, id, R);
  if (side === "invited") return { id: pj.id, title: pj.title, brief: pj.brief, status: pj.status, side, invitedRole: mine.mrole || "", pro: pro ? proOut(pro) : null, milestones: [], messages: [], files: [], team: [], tasks: [], changes: [], time: [], refunds: [], next: [] };   // an invited pro sees the brief, then accepts or declines
  const ms = await all(d, "SELECT m.*, COALESCE(m.pro_id, ?2) AS mpro, p.name AS pro_name FROM biz_milestones m LEFT JOIN biz_pros p ON p.id=COALESCE(m.pro_id, ?2) WHERE m.project_id=?1 ORDER BY CASE WHEN m.status='proposed' THEN 1 ELSE 0 END, m.idx, m.funded_at", id, pj.pro_id);
  const X = await import("./projects2.js");
  const hide = pj.kind === "contract" && side === "pro";   // v47.3: professionals on a contract see the work, never the client price
  return Object.assign({}, pj, hide ? { budget: null } : {}, { side, lead, myPro: mine ? mine.id : null, pro: pro ? proOut(pro) : null, milestones: ms.map((m) => Object.assign(m, { order_id: undefined, mine: !!mine && m.mpro === mine.id }, hide ? { amount: null, refunded: null } : {})),
    messages: (await all(d, "SELECT m.id, m.body, m.created_at, m.user_id, p.name AS pro_name FROM biz_messages m LEFT JOIN biz_pros p ON p.user_id=m.user_id WHERE project_id=?1 ORDER BY m.id LIMIT 500", id)).map((m) => ({ id: m.id, body: m.body, created_at: m.created_at, who: m.user_id === pj.client_id ? "client" : "pro", name: m.user_id === pj.client_id ? "Client" : m.pro_name || "Professional", mine: m.user_id === u.id })),
    team: await X.team(d, pj), tasks: await X.tasks(d, id), changes: await X.changes(d, id), time: await X.time(d, id), refunds: await X.refunds(d, id),
    files: await (await import("./files.js")).projectFiles(env, id), review: await one(d, "SELECT rating, text, created_at FROM biz_reviews WHERE project_id=?1", id), dispute: await one(d, "SELECT id, reason, status, resolution, created_at FROM biz_disputes WHERE project_id=?1 ORDER BY created_at DESC LIMIT 1", id), next: PROJECT_STATES[pj.status] || [] });
}
async function move(env, d, pj, to, actor) { if ((PROJECT_STATES[pj.status] || []).indexOf(to) < 0) throw err("A " + pj.status.replace("_", " ") + " project can't become " + to.replace("_", " ") + ".", 409); const r = await run(d, "UPDATE biz_projects SET status=?3, updated_at=?4 WHERE id=?1 AND status=?2", pj.id, pj.status, to, nowIso()); if (!r.meta.changes) throw err("The project changed meanwhile, reload.", 409); await auditLog(env, actor, "project:" + to, pj.id); pj.status = to; }
export async function projectAction(env, u, id, act, b, R) {
  const { d, pj, pro, side, mine, lead } = await projectFor(env, u, id, R), other = side === "client" ? pro.user_id : pj.client_id, link = "#project=" + id;
  if (side === "invited" && act !== "member_answer") throw err("Accept the invitation first.", 403);
  if (act === "message") { const t = clip(b.body, 4000); if (!t) throw err("Write a message."); if (side === "staff" || side === "invited") throw err(side === "staff" ? "Staff can't post in project chats." : "Accept the invitation first.", 403); await run(d, "INSERT INTO biz_messages (project_id, user_id, body, created_at) VALUES (?1,?2,?3,?4)", id, u.id, t, nowIso()); await run(d, "UPDATE biz_projects SET updated_at=?2 WHERE id=?1", id, nowIso()); await notify(env, other, "message", "New message on " + pj.title, link); }
  else if (act === "propose") { if (side !== "pro") throw err("Only the professional sends the proposal.", 403); if (pj.kind === "contract") throw err("The milestones come from the signed contract. Changes go through a contract amendment.", 409); const ms = (Array.isArray(b.milestones) ? b.milestones : []).slice(0, 12).map((m, i) => ({ title: clip(m.title, 120), amount: int(m.amount, 100, 1e8), due: /^\d{4}-\d{2}-\d{2}$/.test(m.due || "") ? m.due : null, i }));
    const mode = lead && ["hourly", "retainer"].indexOf(b.mode) > -1 ? b.mode : "fixed", rate = mode === "fixed" ? null : int(b.rate, 100, 1e7), cap = mode === "fixed" ? null : int(b.cap, 1, mode === "hourly" ? 2000 : 36);   // v44 modes
    if (mode !== "fixed" && rate == null) throw err(mode === "hourly" ? "Set your hourly rate (₹100 or more)." : "Set the monthly retainer (₹100 or more).");
    if ((mode === "fixed" && !ms.length) || ms.some((m) => !m.title || m.amount == null)) throw err("Each milestone needs a title and an amount of at least ₹100.");
    if (!lead) {   // v44 team member: adds their own milestones, the client accepts them separately
      if (["cancelled", "completed", "disputed"].indexOf(pj.status) > -1) throw err("This project is " + pj.status + ".", 409); if (!ms.length) throw err("Add at least one milestone.");
      await run(d, "DELETE FROM biz_milestones WHERE project_id=?1 AND pro_id=?2 AND status='proposed'", id, mine.id); const base = ((await one(d, "SELECT MAX(idx) n FROM biz_milestones WHERE project_id=?1", id)) || {}).n || 0;
      for (const m of ms) await run(d, "INSERT INTO biz_milestones (id, project_id, idx, title, amount, due, status, pro_id, kind) VALUES (?1,?2,?3,?4,?5,?6,'proposed',?7,'fixed')", "ms" + randId(14), id, base + 1 + m.i, m.title, m.amount, m.due, mine.id);
      await notify(env, pj.client_id, "proposal", mine.name + " sent milestones for " + pj.title, link); return getProject(env, u, id, R); }
    if (["requested", "proposed"].indexOf(pj.status) < 0) throw err("The proposal can only change before the client accepts. Use a change request.", 409);
    await run(d, "DELETE FROM biz_milestones WHERE project_id=?1 AND (pro_id IS NULL OR pro_id=?2)", id, pro.id); for (const m of ms) await run(d, "INSERT INTO biz_milestones (id, project_id, idx, title, amount, due, status, kind) VALUES (?1,?2,?3,?4,?5,?6,'pending','fixed')", "ms" + randId(14), id, m.i, m.title, m.amount, m.due);
    if (mode === "retainer") { const per = nowIso().slice(0, 7); await run(d, "INSERT INTO biz_milestones (id, project_id, idx, title, amount, status, kind, period) VALUES (?1,?2,?3,?4,?5,'pending','retainer',?6)", "ms" + randId(14), id, ms.length, "Retainer: " + monthName(per), rate, per); }
    await run(d, "UPDATE biz_projects SET budget=?2, mode=?3, rate=?4, cap=?5 WHERE id=?1", id, ms.reduce((a, m) => a + m.amount, 0) + (mode === "retainer" ? rate : mode === "hourly" && cap ? rate * cap : 0), mode, rate, cap);
    if (pj.status === "requested") await move(env, d, pj, "proposed", u.email); await notify(env, other, "proposal", "Proposal received for " + pj.title, link); }
  else if (act === "accept") { if (side !== "client") throw err("Only the client accepts.", 403); if (pj.status !== "proposed" || (!(await one(d, "SELECT 1 x FROM biz_milestones WHERE project_id=?1", id)) && pj.mode !== "hourly")) throw err("Wait for the professional's proposal.", 409);
    if (pj.day) { const sl = pj.slot || "", gone = () => err(pj.day + (sl ? " " + sl : "") + " was just booked by someone else. Pick another date with the professional.", 409); if (!(await slotFree(d, pro.id, pj.day, sl))) throw gone();
      const bk = "bk" + randId(12); try { await run(d, "INSERT INTO biz_bookings (id, pro_id, project_id, day, created_at, slot) VALUES (?1,?2,?3,?4,?5,?6)", bk, pro.id, id, pj.day, nowIso(), sl); } catch (e) { throw gone(); }
      if (!(await slotFree(d, pro.id, pj.day, sl, id))) { await run(d, "DELETE FROM biz_bookings WHERE id=?1", bk); throw gone(); } }   // re-check after insert: a whole day vs a slot booked at the same moment
    await move(env, d, pj, "accepted", u.email); await notify(env, other, "accepted", "Your proposal was accepted: " + pj.title, link); }
  else if (act === "submit") { if (side !== "pro") throw err("Only the professional submits work.", 403); const m = await one(d, "SELECT * FROM biz_milestones WHERE id=?1 AND project_id=?2", b.milestoneId, id); if (!m || m.status !== "funded") throw err("Only a funded milestone can be submitted.", 409);
    if ((m.pro_id || pj.pro_id) !== mine.id) throw err("This milestone belongs to another professional on the team.", 403);
    if (Array.isArray(b.files) && b.files.length) await (await import("./files.js")).attach(env, u, id, m.id, b.files);   // v43 private deliverables
    await run(d, "UPDATE biz_milestones SET status='submitted', submitted_at=?2, note=?3 WHERE id=?1 AND status='funded'", m.id, nowIso(), clip(b.note, 1000)); if (pj.status === "accepted" || pj.status === "in_progress") { if (pj.status === "accepted") await move(env, d, pj, "in_progress", u.email); }
    if (!(await one(d, "SELECT 1 x FROM biz_milestones WHERE project_id=?1 AND status IN ('pending','funded')", id)) && pj.status === "in_progress") await move(env, d, pj, "delivered", u.email); await notify(env, pj.client_id, "submitted", "Work submitted for review: " + m.title, link); }
  else if (act === "approve" || act === "changes") { if (side !== "client") throw err("Only the client approves work.", 403); const m = await one(d, "SELECT * FROM biz_milestones WHERE id=?1 AND project_id=?2", b.milestoneId, id); if (!m || m.status !== "submitted") throw err("Only submitted work can be reviewed.", 409);
    const mp = await one(d, "SELECT id, user_id FROM biz_pros WHERE id=?1", m.pro_id || pj.pro_id);   // v44: the milestone's own professional
    if (act === "changes") { await run(d, "UPDATE biz_milestones SET status='funded', note=?2 WHERE id=?1", m.id, clip(b.note, 1000)); if (pj.status === "delivered") await move(env, d, pj, "in_progress", u.email); await notify(env, mp.user_id, "changes", "Changes requested on " + m.title, link); }
    else { const ap = await run(d, "UPDATE biz_milestones SET status='approved', approved_at=?2 WHERE id=?1 AND status='submitted'", m.id, nowIso()); if (!ap.meta.changes) throw err("This milestone changed meanwhile, reload.", 409);
      if (m.kind === "contract") await (await import("./finance.js")).settle(env, m.id, null, u.email); else await createPayout(env, d, m, mp);   // v47.3: a contract milestone is split between the whole team
      const left = await one(d, "SELECT 1 x FROM biz_milestones WHERE project_id=?1 AND status NOT IN ('approved','refunded')", id); if (!left && pj.mode !== "retainer" && pj.mode !== "hourly") { if (pj.status === "in_progress" || pj.status === "accepted") { if (pj.status === "accepted") await move(env, d, pj, "in_progress", u.email); await move(env, d, pj, "delivered", u.email); } await move(env, d, pj, "completed", u.email);
        for (const x of await all(d, pj.kind === "contract" ? "SELECT pro_id p FROM biz_project_pros WHERE project_id=?1 AND status='accepted' UNION SELECT ?2" : "SELECT DISTINCT COALESCE(pro_id, ?2) p FROM biz_milestones WHERE project_id=?1 AND status='approved'", id, pj.pro_id)) await run(d, "UPDATE biz_pros SET done_n=done_n+1 WHERE id=?1", x.p);
        if (pj.kind === "contract") { await run(d, "UPDATE biz_teams SET status='completed', updated_at=?2 WHERE id=(SELECT team_id FROM biz_contracts WHERE project_id=?1)", id, nowIso()); await run(d, "UPDATE biz_contracts SET status='completed', updated_at=?2 WHERE project_id=?1 AND status='accepted'", id, nowIso()); } }
      await notify(env, mp.user_id, "approved", "Milestone approved: " + m.title, link); } }
  else if (act === "cancel") { if (side === "staff") throw err("Use the dispute tools.", 403); if (await one(d, "SELECT 1 x FROM biz_milestones WHERE project_id=?1 AND status IN ('funded','submitted','approved','refund_processing')", id)) throw err("Money is already in this project. Ask for a refund or open a dispute, FODO will help.", 409); await move(env, d, pj, "cancelled", u.email); await run(d, "DELETE FROM biz_bookings WHERE project_id=?1", id); await notify(env, other, "cancelled", "Project cancelled: " + pj.title, link); }
  else if (act === "dispute") { if (side === "staff") throw err("Staff resolve disputes from the admin view.", 403); const reason = clip(b.reason, 2000); if (reason.length < 10) throw err("Explain the problem (10+ characters)."); await move(env, d, pj, "disputed", u.email); await run(d, "INSERT INTO biz_disputes (id, project_id, by_id, reason, status, created_at) VALUES (?1,?2,?3,?4,'open',?5)", "dp" + randId(12), id, u.id, reason, nowIso()); await notify(env, other, "dispute", "A dispute was opened on " + pj.title, link); }
  else if (act === "review") { if (side !== "client") throw err("Only the client reviews.", 403); if (pj.status !== "completed") throw err("You can review after the project is completed.", 409); const r = int(b.rating, 1, 5); if (r == null) throw err("Rate 1 to 5.");
    const ins = await run(d, "INSERT OR IGNORE INTO biz_reviews (project_id, pro_id, client_id, rating, text, created_at) VALUES (?1,?2,?3,?4,?5,?6)", id, pro.id, u.id, r, clip(b.text, 1500), nowIso()); if (!ins.meta.changes) throw err("You already reviewed this project.", 409); await run(d, "UPDATE biz_pros SET rating_sum=rating_sum+?2, rating_n=rating_n+1 WHERE id=?1", pro.id, r); await notify(env, other, "review", "You got a " + r + "★ review", link); }
  else if ((await import("./projects2.js")).ACTS.indexOf(act) > -1) await (await import("./projects2.js")).action(env, u, act, b, { d, pj, pro, side, mine, lead, other, link, R, move: (to) => move(env, d, pj, to, u.email), notify, auditLog, getProject });   // v44
  else throw err("Unknown action.");
  return getProject(env, u, id, R);
}
/* checkout hook (account API): the client pays a pending milestone; the price comes from the database */
export async function milestoneForCheckout(env, u, msId) {
  const d = await bdb(env), m = await one(d, "SELECT m.*, j.client_id, j.status AS pstatus, j.title AS ptitle FROM biz_milestones m JOIN biz_projects j ON j.id=m.project_id WHERE m.id=?1", msId);
  if (!m || m.client_id !== u.id) return null; if (m.status !== "pending") throw err("This milestone is already " + m.status + ".", 409); if (["accepted", "in_progress", "delivered"].indexOf(m.pstatus) < 0) throw err("Accept the proposal first.", 409);
  return { id: m.id, name: (m.ptitle + ": " + m.title).slice(0, 120), price: m.amount };
}
export async function fundMilestone(env, msId, orderId) {
  const d = await bdb(env), r = await run(d, "UPDATE biz_milestones SET status='funded', funded_at=?2, order_id=?3 WHERE id=?1 AND status='pending'", msId, nowIso(), orderId); if (!r.meta.changes) return false;
  const m = await one(d, "SELECT m.title, m.kind, j.id pid, j.status pstatus, p.user_id FROM biz_milestones m JOIN biz_projects j ON j.id=m.project_id JOIN biz_pros p ON p.id=COALESCE(m.pro_id, j.pro_id) WHERE m.id=?1", msId);
  if (m && m.kind === "hours") { await run(d, "UPDATE biz_milestones SET status='submitted', submitted_at=?2 WHERE id=?1 AND status='funded'", msId, nowIso()); await notify(env, m.user_id, "funded", "Your billed hours “" + m.title + "” were paid to FODO. The client approves them to release the payout.", "#project=" + m.pid); try { const F = await import("./finance.js"), mm = await one(d, "SELECT amount, project_id, title FROM biz_milestones WHERE id=?1", msId); await F.ledger(env, "payment", "client_receipts", "milestone", msId, mm.project_id, mm.amount, "Paid to FODO: " + mm.title); } catch (e) {} return true; }   // v44: hours are already worked
  if (m) await notify(env, m.user_id, "funded", "Payment received by FODO for “" + m.title + "”. You can start.", "#project=" + m.pid);
  try { const F = await import("./finance.js"), mm = await one(d, "SELECT amount, project_id, title FROM biz_milestones WHERE id=?1", msId); await F.ledger(env, "payment", "client_receipts", "milestone", msId, mm.project_id, mm.amount, "Paid to FODO: " + mm.title + " · order " + orderId); await F.invoiceForMilestone(env, msId); } catch (e) {}   // v47.3 ledger + invoice
  return true;
}
async function createPayout(env, d, m, pro) {
  const c = (await settings(env)).commission, com = Math.round(m.amount * c / 100);
  await run(d, "INSERT OR IGNORE INTO biz_payouts (id, milestone_id, pro_id, gross, commission, net, status, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)", "po" + randId(12), m.id, pro.id, m.amount, com, m.amount - com, payoutsOn(env) ? "queued" : "awaiting_provider", nowIso());
}
export async function proEarnings(env, u) { const p = await proOf(env, u), d = await bdb(env); const L = await all(d, "SELECT po.*, COALESCE(po.label, m.title) AS title FROM biz_payouts po LEFT JOIN biz_milestones m ON m.id=COALESCE(po.source_milestone, po.milestone_id) WHERE po.pro_id=?1 ORDER BY po.created_at DESC", p.id);
  return { items: L, totals: { net: L.reduce((a, x) => a + x.net, 0), paid: L.filter((x) => x.status === "paid").reduce((a, x) => a + x.net, 0) }, automatic: payoutsOn(env) }; }

/* ---------- admin / moderation / finance ---------- */
export async function adminOverview(env, R) {
  if (!can(R, ["admin", "moderator", "finance", "viewer"])) throw err("Not allowed.", 403); const d = await bdb(env), n = async (sql) => ((await one(d, sql)) || {}).n || 0;
  return { pros: { total: await n("SELECT count(*) n FROM biz_pros"), pending: await n("SELECT count(*) n FROM biz_pros WHERE status='pending'"), live: await n("SELECT count(*) n FROM biz_pros WHERE status IN ('approved','published')"), suspended: await n("SELECT count(*) n FROM biz_pros WHERE status='suspended'") },
    projects: { total: await n("SELECT count(*) n FROM biz_projects"), active: await n("SELECT count(*) n FROM biz_projects WHERE status IN ('accepted','in_progress','delivered')"), completed: await n("SELECT count(*) n FROM biz_projects WHERE status='completed'"), disputed: await n("SELECT count(*) n FROM biz_projects WHERE status='disputed'") },
    money: { funded: (await one(d, "SELECT COALESCE(sum(amount),0) n FROM biz_milestones WHERE status IN ('funded','submitted','approved')")).n, commission: (await one(d, "SELECT COALESCE(sum(commission),0) n FROM biz_payouts")).n, owed: (await one(d, "SELECT COALESCE(sum(net),0) n FROM biz_payouts WHERE status != 'paid'")).n },
    automaticPayouts: payoutsOn(env), commission: (await settings(env)).commission, roles: R.roles };
}
export async function adminPros(env, R, status) { if (!can(R, ["admin", "moderator", "viewer"])) throw err("Not allowed.", 403); const d = await bdb(env), st = PRO_STATES.indexOf(status) > -1 ? status : "pending";
  return (await all(d, "SELECT p.*, u.email FROM biz_pros p LEFT JOIN acct_users u ON u.id=p.user_id WHERE p.status=?1 ORDER BY p.updated_at DESC LIMIT 200", st)).map((p) => Object.assign(proOut(p, true), { email: p.email, submittedAt: p.submitted_at })); }
export async function moderatePro(env, u, R, id, action, note) {
  if (!can(R, ["admin", "moderator"])) throw err("Only admins and moderators.", 403); const map = { approve: "approved", publish: "published", suspend: "suspended", reject: "rejected", archive: "archived", restore: "pending" }; if (!map[action]) throw err("Unknown action.");
  const d = await bdb(env), p = await one(d, "SELECT * FROM biz_pros WHERE id=?1", id); if (!p) throw err("Not found.", 404);
  await run(d, "UPDATE biz_pros SET status=?2, note=?3, approved_at=CASE WHEN ?2 IN ('approved','published') THEN ?4 ELSE approved_at END, approved_by=CASE WHEN ?2 IN ('approved','published') THEN ?5 ELSE approved_by END, updated_at=?4 WHERE id=?1", id, map[action], clip(note, 400), nowIso(), u.email);
  await auditLog(env, u.email, "pro:" + action, id, note); await notify(env, p.user_id, "moderation", "Your FODO Pro profile is now " + map[action] + (note ? ": " + clip(note, 200) : "."), "#pro");
  if (action === "approve" || action === "reject") { const usr = await one(d, "SELECT email FROM acct_users WHERE id=?1", p.user_id); if (usr && usr.email) await sendMail(env, usr.email, "Your FODO Pro profile was " + map[action], "<p>Your FODO Pro profile is now <b>" + map[action] + "</b>. Open your dashboard: https://www.fodo.co.in/fodo-pros/" + (note ? " Note: " + clip(note, 200).replace(/[<>&]/g, "") : "") + "</p>", "Your FODO Pro profile is now " + map[action] + ".", { kind: "pro" }).catch(() => {}); }
  return { ok: true, status: map[action] };
}
export async function adminPayouts(env, R) { if (!can(R, ["admin", "finance", "viewer"])) throw err("Not allowed.", 403); return all(await bdb(env), "SELECT po.*, COALESCE(po.label, m.title) AS title, p.name AS pro_name FROM biz_payouts po LEFT JOIN biz_milestones m ON m.id=COALESCE(po.source_milestone, po.milestone_id) JOIN biz_pros p ON p.id=po.pro_id ORDER BY po.status='paid', po.created_at DESC LIMIT 300"); }
export async function markPaid(env, u, R, id, ref) { if (!can(R, ["admin", "finance"])) throw err("Only finance or admins.", 403); const r = clip(ref, 80); if (r.length < 4) throw err("Enter the bank / UPI transfer reference.");
  const x = await run(await bdb(env), "UPDATE biz_payouts SET status='paid', ref=?2, paid_at=?3 WHERE id=?1 AND status NOT IN ('paid','processing','via_split')", id, r, nowIso()); if (!x.meta.changes) throw err("Already paid, being sent by the provider (check its status first), paid through Cashfree Easy Split, or not found.", 409); await auditLog(env, u.email, "payout:paid", id, r);
  try { const po = await one(await bdb(env), "SELECT * FROM biz_payouts WHERE id=?1", id), F = await import("./finance.js"); const pj = await one(await bdb(env), "SELECT project_id FROM biz_milestones WHERE id=COALESCE(?1, ?2)", po.source_milestone, po.milestone_id); await F.ledger(env, "payout", "payouts_paid", "payout", id, pj && pj.project_id, po.net, "Paid by hand · " + r); } catch (e) {}   // v47.3 ledger
  return { ok: true }; }
export async function adminRefunds(env, R) { if (!can(R, ["admin", "finance", "viewer"])) throw err("Not allowed.", 403); return all(await bdb(env), "SELECT r.id, r.project_id, r.amount, r.reason, r.status, r.provider, r.provider_ref, r.note, r.created_at, r.done_at, m.title, j.title AS ptitle FROM biz_refunds r JOIN biz_milestones m ON m.id=r.milestone_id JOIN biz_projects j ON j.id=r.project_id ORDER BY r.status='refunded', r.created_at DESC LIMIT 300"); }
export async function adminDisputes(env, R) { if (!can(R, ["admin", "moderator", "finance", "viewer"])) throw err("Not allowed.", 403); return all(await bdb(env), "SELECT x.*, j.title, j.status AS pstatus FROM biz_disputes x JOIN biz_projects j ON j.id=x.project_id ORDER BY x.status='resolved', x.created_at DESC LIMIT 200"); }
export async function resolveDispute(env, u, R, id, b) {
  if (!can(R, ["admin", "moderator"])) throw err("Only admins and moderators.", 403); const d = await bdb(env), x = await one(d, "SELECT * FROM biz_disputes WHERE id=?1", id); if (!x || x.status !== "open") throw err("Not found or already resolved.", 409);
  const to = ["in_progress", "cancelled", "completed"].indexOf(b.outcome) > -1 ? b.outcome : null, text = clip(b.resolution, 1000); if (!to || text.length < 5) throw err("Pick an outcome and write the resolution.");
  const pj = await one(d, "SELECT * FROM biz_projects WHERE id=?1", x.project_id); await move(env, d, pj, to, u.email); await run(d, "UPDATE biz_disputes SET status='resolved', resolution=?2, resolved_at=?3 WHERE id=?1", id, text, nowIso());
  if (to === "cancelled") await run(d, "DELETE FROM biz_bookings WHERE project_id=?1", pj.id);
  const pro = await one(d, "SELECT user_id FROM biz_pros WHERE id=?1", pj.pro_id); for (const who of [pj.client_id, pro && pro.user_id]) await notify(env, who, "dispute", "Dispute resolved (" + to.replace("_", " ") + "): " + text.slice(0, 120), "#project=" + pj.id);
  return { ok: true, note: to === "cancelled" ? "Refunds of funded milestones are made from Admin → Payments (partial refunds supported) and recorded there." : null };
}

/* ---------- notifications ---------- */
export async function notes(env, u) { const d = await bdb(env); return { items: await all(d, "SELECT id, kind, text, link, read, created_at FROM biz_notes WHERE user_id=?1 ORDER BY id DESC LIMIT 60", u.id), unread: ((await one(d, "SELECT count(*) n FROM biz_notes WHERE user_id=?1 AND read=0", u.id)) || {}).n || 0 }; }
export async function readNotes(env, u) { await run(await bdb(env), "UPDATE biz_notes SET read=1 WHERE user_id=?1", u.id); return { ok: true }; }

/* ---------- business dashboard: real numbers + Next Best Action from real data ---------- */
export async function dashboard(env, u) {
  const d = await bdb(env), safe = async (f, dv) => { try { return await f(); } catch (e) { return dv; } };
  const sites = await safe(() => all(d, "SELECT id, name, status, updated_at, slug FROM sites WHERE owner_user_id=?1 AND deleted_at IS NULL AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 20", u.id), []);
  const leads = await safe(async () => ((await one(d, "SELECT count(*) n FROM site_forms f JOIN sites s ON s.id=f.site_id WHERE s.owner_user_id=?1 AND f.created_at >= ?2", u.id, new Date(Date.now() - 30 * 864e5).toISOString())) || {}).n || 0, null);
  const run0 = await safe(() => one(d, "SELECT job_id, domain, score, created_at FROM acct_runs WHERE owner_id=?1 AND status='COMPLETE' ORDER BY created_at DESC LIMIT 1", u.id), null);
  const content = await all(d, "SELECT status, due, title FROM biz_content WHERE user_id=?1", u.id), camps = await all(d, "SELECT status FROM biz_campaigns WHERE user_id=?1", u.id);
  const projects = await listProjects(env, u), brand = await getBrand(env, u), pro = await one(d, "SELECT status FROM biz_pros WHERE user_id=?1", u.id), N = await notes(env, u);
  const msWait = await all(d, "SELECT m.title, m.status, j.id pid, j.client_id FROM biz_milestones m JOIN biz_projects j ON j.id=m.project_id WHERE (j.client_id=?1 AND m.status IN ('submitted')) OR (j.client_id=?1 AND m.status='pending' AND j.status='accepted')", u.id);
  const today = nowIso().slice(0, 10), bookings = await all(d, "SELECT b.day, b.slot, j.title, j.id FROM biz_bookings b JOIN biz_projects j ON j.id=b.project_id WHERE (j.client_id=?1 OR b.pro_id=(SELECT id FROM biz_pros WHERE user_id=?1)) AND b.day >= ?2 ORDER BY b.day LIMIT 5", u.id, today);
  const A = [], add = (pri, text, why, href) => A.push({ pri, text, why, href });
  msWait.filter((m) => m.status === "submitted").forEach((m) => add(1, "Review submitted work: " + m.title, "A professional is waiting for your approval.", "#project=" + m.pid));
  msWait.filter((m) => m.status === "pending").forEach((m) => add(2, "Fund milestone: " + m.title, "The project starts when the first milestone is paid to FODO.", "#project=" + m.pid));
  try { (await (await import("./crm.js")).followUps(env, u, 0)).forEach((f) => add(f.overdue ? 1 : 2, "Follow up: " + f.name, (f.overdue ? "Overdue since " + f.due + ": " : "Today: ") + f.body.slice(0, 120), "#leads?tab=followups")); } catch (e) {}   // v45 CRM
  projects.filter((p) => p.side === "client" && p.status === "proposed").forEach((p) => add(2, "Review proposal: " + p.title, "The professional sent milestones and prices.", "#project=" + p.id));
  projects.filter((p) => p.side === "pro" && p.status === "requested").forEach((p) => add(1, "Reply to request: " + p.title, "Send a proposal so the client can accept.", "#project=" + p.id));
  if (!run0) add(3, "Run your first Business X-Ray", "See what is holding your website and visibility back, with evidence.", "/business-x-ray/");
  if (!sites.length) add(3, "Create your website", "Free with your login: AI builds the first draft.", "/website-builder/#new=1");
  else { const draft = sites.find((s) => s.status !== "live"); if (draft) add(3, "Publish “" + draft.name + "”", "It is still a draft, nobody can see it.", "/website-builder/#site=" + draft.id); }
  if (!brand) add(4, "Set up your Brand Kit", "Colours, fonts and tone used by the builder and every brief.", "#brand");
  if (!content.length) add(4, "Plan this month's content", "Turn ideas into briefs and a calendar.", "#content");
  if (run0 && run0.score != null && run0.score < 60) add(2, "Fix the top issues from your X-Ray (" + run0.score + "/100)", "Your last X-Ray of " + run0.domain + " found high-impact problems.", "/business-x-ray/?r=" + run0.job_id);
  return { cards: { health: run0 ? { score: run0.score, domain: run0.domain, at: run0.created_at } : null, websites: { total: sites.length, live: sites.filter((s) => s.status === "live").length }, leads30: leads,
      campaigns: { planned: camps.length, ready: camps.filter((c) => c.status === "ready").length, live: null, note: "Live ad numbers need a connected ad account" }, content: { total: content.length, due7: content.filter((c) => c.due && c.due >= today && c.due <= new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)).length, published: content.filter((c) => c.status === "published").length },
      projects: { active: projects.filter((p) => ["accepted", "in_progress", "delivered"].indexOf(p.status) > -1).length, total: projects.length }, bookings, spend: { projects: (await one(d, "SELECT COALESCE(sum(m.amount),0) n FROM biz_milestones m JOIN biz_projects j ON j.id=m.project_id WHERE j.client_id=?1 AND m.status IN ('funded','submitted','approved')", u.id)).n }, alerts: N.unread, pro: pro ? pro.status : null },
    next: A.sort((a, b) => a.pri - b.pri).slice(0, 6), sites: sites.slice(0, 4) };
}
/* X-Ray finding → the right next step (used by the X-Ray report and the workspace) */
export function actionsFor(text) {
  const s = String(text || "").toLowerCase(), A = [];
  if (/cta|call to action|headline|hero|contact path|form|landing|homepage|conversion|mobile|speed|title|meta|h1|schema|page/.test(s)) A.push({ label: "Fix with Website Builder", href: "/website-builder/" });
  if (/photo|image|visual|gallery/.test(s)) A.push({ label: "Hire a Photographer", href: "/workspace/#pros?role=Photographer" });
  if (/video|reel|youtube/.test(s)) A.push({ label: "Hire a Video Creator", href: "/workspace/#pros?role=Videographer" });
  if (/content|blog|article|topic|keyword|seo/.test(s)) A.push({ label: "Plan content", href: "/workspace/#content" });
  if (/ad\b|ads|pixel|campaign|meta|google ads/.test(s)) A.push({ label: "Plan an ad campaign", href: "/workspace/#ads" });
  if (/review|testimonial|trust/.test(s)) A.push({ label: "Hire a Copywriter", href: "/workspace/#pros?role=Copywriter" });
  return A.slice(0, 2);
}

/* ---------- v40.1 invite-only FODO Pros portal (/fodo-pros/?i=TOKEN): only people you send a link to can create a profile ---------- */
async function useInvite(env, d, token) {
  const t = clip(token, 40); if (!/^[a-z0-9]{24}$/.test(t)) throw err("FODO Pros is invite-only. Open the invite link FODO sent you.", 403);
  const r = await d.prepare("UPDATE biz_invites SET uses=uses+1 WHERE token=?1 AND revoked=0 AND uses < max_uses AND expires_at > ?2 RETURNING token").bind(t, nowIso()).first();
  if (!r) throw err("This invite link has expired or was already used. Ask FODO for a new one.", 403); return t;
}
export async function inviteStatus(env, token) { const t = clip(token, 40); if (!/^[a-z0-9]{24}$/.test(t)) return { valid: false }; const r = await one(await bdb(env), "SELECT uses, max_uses, expires_at, revoked FROM biz_invites WHERE token=?1", t); return { valid: !!(r && !r.revoked && r.uses < r.max_uses && r.expires_at > nowIso()) }; }
export async function createInvite(env, u, R, b, origin) {
  if (!can(R, ["admin", "moderator"])) throw err("Only admins and moderators create invite links.", 403);
  const max = int(b.maxUses, 1, 500) || 1, days = int(b.days, 1, 365) || 14, t = randId(24), d = await bdb(env);
  await run(d, "INSERT INTO biz_invites (token, note, max_uses, uses, expires_at, revoked, created_by, created_at) VALUES (?1,?2,?3,0,?4,0,?5,?6)", t, clip(b.note, 120), max, new Date(Date.now() + days * 864e5).toISOString(), u.email, nowIso());
  await auditLog(env, u.email, "invite:create", t.slice(0, 6), clip(b.note, 120)); return { token: t, url: (origin || "https://www.fodo.co.in") + "/fodo-pros/?i=" + t, maxUses: max, days };
}
export async function listInvites(env, R, origin) { if (!can(R, ["admin", "moderator"])) throw err("Not allowed.", 403); return (await all(await bdb(env), "SELECT token, note, max_uses, uses, expires_at, revoked, created_by, created_at FROM biz_invites ORDER BY created_at DESC LIMIT 200")).map((x) => Object.assign(x, { url: (origin || "https://www.fodo.co.in") + "/fodo-pros/?i=" + x.token, active: !x.revoked && x.uses < x.max_uses && x.expires_at > nowIso() })); }
export async function revokeInvite(env, u, R, token) { if (!can(R, ["admin", "moderator"])) throw err("Not allowed.", 403); await run(await bdb(env), "UPDATE biz_invites SET revoked=1 WHERE token=?1", clip(token, 40)); await auditLog(env, u.email, "invite:revoke", clip(token, 6)); return { ok: true }; }

/* ---------- v40.1 professional dashboard (real data only) ---------- */
export async function proDashboard(env, u) {
  const d = await bdb(env), me = await myPro(env, u); if (!me) throw err("Create your FODO Pro profile first.", 404);
  const P = await all(d, "SELECT j.id, j.title, j.status, j.budget, j.day, j.created_at, j.updated_at FROM biz_projects j WHERE j.pro_id=?1 OR j.id IN (SELECT project_id FROM biz_project_pros WHERE pro_id=?1 AND status='accepted') ORDER BY j.updated_at DESC LIMIT 300", me.id);
  const replied = P.filter((p) => p.status !== "requested").length, today = nowIso().slice(0, 10), E = await proEarnings(env, u);
  const work = await all(d, "SELECT m.title, m.status, j.id pid, j.title ptitle FROM biz_milestones m JOIN biz_projects j ON j.id=m.project_id WHERE COALESCE(m.pro_id, j.pro_id)=?1 AND m.status IN ('funded') ORDER BY m.funded_at", me.id);
  const invites = await all(d, "SELECT j.id, j.title FROM biz_project_pros x JOIN biz_projects j ON j.id=x.project_id WHERE x.pro_id=?1 AND x.status='invited'", me.id);
  const A = []; P.filter((p) => p.status === "requested").forEach((p) => A.push({ text: "Send a proposal: " + p.title, why: "A client is waiting for your milestones and price.", href: "#project=" + p.id }));
  invites.forEach((p) => A.push({ text: "Team invitation: " + p.title, why: "A client wants you on their project team. Accept or decline.", href: "#project=" + p.id }));
  work.forEach((m) => A.push({ text: "Deliver: " + m.title, why: "The client has paid FODO for this milestone (" + m.ptitle + ").", href: "#project=" + m.pid }));
  if (me.completeness.missing.length) A.push({ text: "Complete your profile (" + me.completeness.pct + "%)", why: "Missing: " + me.completeness.missing.join(", "), href: "#pro" });
  if (me.status === "draft" && !me.completeness.missing.length) A.push({ text: "Submit your profile for approval", why: "Clients can see you only after FODO approves it.", href: "#pro" });
  return { pro: { id: me.id, name: me.name, status: me.status, note: me.note, completeness: me.completeness, rating: me.rating, reviews: me.reviews, completed: me.completed, days: me.days, blackout: me.blackout },
    counts: { invites: invites.length, requests: P.filter((p) => p.status === "requested").length, proposed: P.filter((p) => p.status === "proposed").length, active: P.filter((p) => ["accepted", "in_progress", "delivered"].indexOf(p.status) > -1).length, completed: P.filter((p) => p.status === "completed").length, disputed: P.filter((p) => p.status === "disputed").length },
    replyRate: P.length ? Math.round(replied / P.length * 100) : null, earnings: E.totals, pendingPayout: E.items.filter((x) => x.status !== "paid").reduce((a, x) => a + x.net, 0), automaticPayouts: E.automatic,
    bookings: await all(d, "SELECT b.day, b.slot, COALESCE(j.title, t.title) title, COALESCE(j.id, t.id) id, CASE WHEN t.id IS NULL THEN 'project' ELSE 'team' END kind FROM biz_bookings b LEFT JOIN biz_projects j ON j.id=b.project_id LEFT JOIN biz_teams t ON t.id=b.project_id WHERE b.pro_id=?1 AND b.day >= ?2 ORDER BY b.day, b.slot LIMIT 60", me.id, today), slots: me.slots,   /* v47.2: bookings include team days */
    reviews: await all(d, "SELECT rating, text, created_at FROM biz_reviews WHERE pro_id=?1 ORDER BY created_at DESC LIMIT 50", me.id), next: A.slice(0, 6) };
}
/* v44: time slots a client can book (e.g. 09:00-13:00), saved without sending the profile back to review */
export async function setSlots(env, u, b) { const p = await proOf(env, u), L = cleanSlots(b.slots); await run(await bdb(env), "UPDATE biz_pros SET slots=?2, updated_at=?3 WHERE id=?1", p.id, JSON.stringify(L), nowIso()); return { slots: L }; }
export const monthName = (per) => { const [y, m] = per.split("-"); return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m - 1] + " " + y; };
/* toggle one blackout date from the calendar (does not send the profile back to review) */
export async function setBlackout(env, u, b) {
  const p = await proOf(env, u), day = String(b.day || ""); if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw err("Pick a date.");
  const d = await bdb(env); if (b.on && await one(d, "SELECT 1 x FROM biz_bookings WHERE pro_id=?1 AND day=?2", p.id, day)) throw err("You have a booking that day.", 409);
  let L = J(p.blackout, []).filter((x) => x !== day); if (b.on) L.push(day); L = L.filter((x) => x >= nowIso().slice(0, 10)).sort().slice(0, 120);
  await run(d, "UPDATE biz_pros SET blackout=?2, updated_at=?3 WHERE id=?1", p.id, JSON.stringify(L), nowIso()); return { blackout: L };
}

/* ---------- v40.2 Leads / CRM: every form submission from YOUR websites, with a pipeline status and notes ---------- */
export const LEAD_STATES = ["new", "contacted", "qualified", "won", "lost"];
export async function leads(env, u, q) {
  const d = await bdb(env); await run(d, "CREATE TABLE IF NOT EXISTS biz_leads (form_id TEXT PRIMARY KEY, user_id TEXT, status TEXT, note TEXT, updated_at TEXT)");
  let rows = []; try { rows = await all(d, "SELECT f.id, f.page, f.data, f.created_at, s.id AS site_id, s.name AS site, l.status, l.note, l.updated_at FROM site_forms f JOIN sites s ON s.id=f.site_id LEFT JOIN biz_leads l ON l.form_id=f.id WHERE s.owner_user_id=?1 AND s.deleted_at IS NULL ORDER BY f.created_at DESC LIMIT 1000", u.id); } catch (e) { rows = []; }
  const st = LEAD_STATES.indexOf(q && q.status) > -1 ? q.status : "", text = String((q && q.q) || "").toLowerCase().trim();
  const items = rows.map((r) => { const f = J(r.data, {}), pick = (re) => { const k = Object.keys(f).find((x) => re.test(x)); return k ? clip(f[k], 200) : ""; };
    return { id: r.id, site: r.site, siteId: r.site_id, page: r.page, at: r.created_at, status: r.status || "new", note: r.note || "", name: pick(/name/i), email: pick(/mail/i), phone: pick(/phone|mobile|whatsapp/i), message: pick(/message|msg|enquiry|query|details|comment/i), fields: Object.keys(f).slice(0, 12).map((k) => [clip(k, 40), clip(f[k], 300)]) }; })
    .filter((x) => (!st || x.status === st) && (!text || JSON.stringify([x.name, x.email, x.phone, x.message, x.site]).toLowerCase().indexOf(text) > -1));
  const counts = {}; LEAD_STATES.forEach((s) => { counts[s] = 0; }); rows.forEach((r) => { counts[r.status || "new"]++; });
  return { items: items.slice(0, 300), counts, total: rows.length };
}
export async function setLead(env, u, id, b) {
  const d = await bdb(env), st = LEAD_STATES.indexOf(b.status) > -1 ? b.status : null; if (!st) throw err("Unknown status.");
  const own = await one(d, "SELECT f.id FROM site_forms f JOIN sites s ON s.id=f.site_id WHERE f.id=?1 AND s.owner_user_id=?2", clip(id, 60), u.id).catch(() => null); if (!own) throw err("Not found.", 404);
  await run(d, "CREATE TABLE IF NOT EXISTS biz_leads (form_id TEXT PRIMARY KEY, user_id TEXT, status TEXT, note TEXT, updated_at TEXT)");
  await run(d, "INSERT OR REPLACE INTO biz_leads (form_id, user_id, status, note, updated_at) VALUES (?1,?2,?3,?4,?5)", own.id, u.id, st, clip(b.note, 1000), nowIso()); return { ok: true };
}

/* ---------- v40.2 global search across the workspace (only YOUR data + approved professionals) ---------- */
export async function search(env, u, q) {
  const s = String(q || "").trim().toLowerCase().slice(0, 60); if (s.length < 2) return { groups: [] };
  const d = await bdb(env), like = "%" + s.replace(/[%_]/g, "") + "%", safe = async (f) => { try { return await f(); } catch (e) { return []; } }, G = [];
  const add = (name, list) => { if (list.length) G.push({ name, items: list.slice(0, 6) }); };
  add("Websites", (await safe(() => all(d, "SELECT id, name, status FROM sites WHERE owner_user_id=?1 AND deleted_at IS NULL AND (lower(name) LIKE ?2 OR lower(slug) LIKE ?2) LIMIT 6", u.id, like))).map((x) => ({ label: x.name, hint: x.status === "live" ? "Live website" : "Draft website", href: "/website-builder/#site=" + x.id })));
  add("Projects", (await all(d, "SELECT j.id, j.title, j.status FROM biz_projects j LEFT JOIN biz_pros p ON p.id=j.pro_id WHERE (j.client_id=?1 OR p.user_id=?1) AND lower(j.title) LIKE ?2 LIMIT 6", u.id, like)).map((x) => ({ label: x.title, hint: "Project · " + x.status.replace("_", " "), href: "#project=" + x.id })));
  add("Contacts", (await safe(() => all(d, "SELECT id, name, company, email FROM crm_contacts WHERE user_id=?1 AND (lower(name) LIKE ?2 OR lower(email) LIKE ?2 OR lower(company) LIKE ?2 OR phone LIKE ?2) LIMIT 6", u.id, like))).map((x) => ({ label: x.name, hint: "Contact" + (x.company ? " · " + x.company : ""), href: "#leads?tab=contacts&id=" + x.id })));   // v45
  add("Content", (await all(d, "SELECT title, status FROM biz_content WHERE user_id=?1 AND lower(title) LIKE ?2 LIMIT 6", u.id, like)).map((x) => ({ label: x.title, hint: "Content · " + x.status, href: "#content" })));
  add("Campaigns", (await all(d, "SELECT name, platform FROM biz_campaigns WHERE user_id=?1 AND lower(name) LIKE ?2 LIMIT 6", u.id, like)).map((x) => ({ label: x.name, hint: x.platform + " campaign plan", href: "#ads" })));
  add("FODO Pros", (await all(d, "SELECT id, name, role, city FROM biz_pros WHERE status IN ('approved','published') AND (lower(name) LIKE ?1 OR lower(role) LIKE ?1 OR lower(skills) LIKE ?1 OR lower(city) LIKE ?1) LIMIT 6", like)).map((x) => ({ label: x.name, hint: x.role + (x.city ? " · " + x.city : ""), href: "#pros?q=" + encodeURIComponent(x.name), pro: x.id })));
  const role = PRO_ROLES.filter((r) => r.toLowerCase().indexOf(s) > -1).slice(0, 4); if (role.length) add("Hire", role.map((r) => ({ label: "Find a " + r, hint: "FODO Pros", href: "#pros?role=" + encodeURIComponent(r) })));
  return { groups: G };
}
