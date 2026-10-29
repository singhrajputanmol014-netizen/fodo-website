/* FODO Growth Lab accounts (v13): login (Google + email one-time code), sessions, credits, plans, Cashfree payments.
   Storage: Cloudflare D1 (binding XRAY_DB) — required; without it (or with ACCOUNTS_ENABLED != "1") the site keeps working
   in the old anonymous mode. Secrets stay on the server: GOOGLE_CLIENT_ID (public id), RESEND_API_KEY, MAIL_FROM,
   CASHFREE_APP_ID, CASHFREE_SECRET_KEY, CASHFREE_ENV (sandbox|production), CASHFREE_SUBSCRIPTIONS ("1" = auto-renew on). */
import { PLANS, PACKS, rank, limitsFor } from "./plans.js";
import { outbound, log } from "./xray-core.js";

export const json = (b, s, h) => new Response(JSON.stringify(b), { status: s || 200, headers: Object.assign({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, h || {}) });
const enc = new TextEncoder();
export const nowIso = () => new Date().toISOString();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
export const randId = (n, alpha) => { const a = alpha || "abcdefghijklmnopqrstuvwxyz0123456789"; return [...crypto.getRandomValues(new Uint8Array(n))].map((b) => a[b % a.length]).join(""); };
export const accountsOn = (env) => env.ACCOUNTS_ENABLED === "1" && !!env.XRAY_DB;

/* ---------------- schema (created on first use) ---------------- */
const DDL = [
  "CREATE TABLE IF NOT EXISTS acct_users (id TEXT PRIMARY KEY, email TEXT UNIQUE, name TEXT, picture TEXT, google_sub TEXT, phone TEXT, plan TEXT DEFAULT 'free', plan_until TEXT, monthly_left INTEGER DEFAULT 0, pack_left INTEGER DEFAULT 0, free_left INTEGER DEFAULT 2, owner_id TEXT, brand TEXT, created_at TEXT, last_login TEXT)",
  "CREATE UNIQUE INDEX IF NOT EXISTS acct_users_gsub ON acct_users(google_sub)",
  "CREATE TABLE IF NOT EXISTS acct_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT, created_at TEXT, expires_at INTEGER, ip_hash TEXT)",
  "CREATE TABLE IF NOT EXISTS acct_otps (email TEXT PRIMARY KEY, code_hash TEXT, expires_at INTEGER, tries INTEGER, sent_at INTEGER)",
  "CREATE TABLE IF NOT EXISTS acct_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, kind TEXT, delta INTEGER, ref TEXT UNIQUE, note TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS acct_orders (order_id TEXT PRIMARY KEY, user_id TEXT, kind TEXT, item TEXT, amount REAL, status TEXT, cf_order_id TEXT, created_at TEXT, paid_at TEXT)",
  "CREATE TABLE IF NOT EXISTS acct_subs (subscription_id TEXT PRIMARY KEY, user_id TEXT, plan TEXT, amount REAL, status TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS acct_team (owner_id TEXT, email TEXT, added_at TEXT, PRIMARY KEY (owner_id, email))",
  "CREATE TABLE IF NOT EXISTS acct_clients (id TEXT PRIMARY KEY, owner_id TEXT, name TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS acct_runs (job_id TEXT PRIMARY KEY, user_id TEXT, owner_id TEXT, domain TEXT, url TEXT, tier TEXT, credit TEXT, client_id TEXT, score INTEGER, status TEXT, created_at TEXT)",
  "CREATE INDEX IF NOT EXISTS acct_runs_owner ON acct_runs(owner_id, created_at)",
  "CREATE TABLE IF NOT EXISTS acct_counters (k TEXT PRIMARY KEY, n INTEGER, exp INTEGER)",
  // v15 admin: what each user did, and who may open the admin dashboard read-only
  "CREATE TABLE IF NOT EXISTS acct_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, kind TEXT, detail TEXT, created_at TEXT)",
  "CREATE INDEX IF NOT EXISTS acct_events_user ON acct_events(user_id, created_at)",
  "CREATE INDEX IF NOT EXISTS acct_events_time ON acct_events(created_at)",
  "CREATE TABLE IF NOT EXISTS acct_admins (email TEXT PRIMARY KEY, role TEXT, added_by TEXT, added_at TEXT)",
  // v16.1 free phone login: the visitor sends a code to FODO on WhatsApp (incoming messages are free)
  "CREATE TABLE IF NOT EXISTS acct_wa (code TEXT PRIMARY KEY, poll_hash TEXT, phone TEXT, created INTEGER, expires INTEGER, used INTEGER DEFAULT 0)",
];
// columns added after v13 went live (ALTER fails harmlessly when the column already exists)
const MIGRATE = ["ALTER TABLE acct_users ADD COLUMN blocked INTEGER DEFAULT 0", "ALTER TABLE acct_users ADD COLUMN unlimited INTEGER DEFAULT 0", "ALTER TABLE acct_users ADD COLUMN extra_features TEXT", "ALTER TABLE acct_users ADD COLUMN admin_note TEXT", "ALTER TABLE acct_runs ADD COLUMN features TEXT", "ALTER TABLE acct_users ADD COLUMN fb_uid TEXT", "ALTER TABLE acct_users ADD COLUMN login_via TEXT", "ALTER TABLE acct_users ADD COLUMN wa_phone TEXT", "ALTER TABLE acct_runs ADD COLUMN completeness INTEGER", "ALTER TABLE acct_runs ADD COLUMN duration_ms INTEGER", "ALTER TABLE acct_runs ADD COLUMN share TEXT", "ALTER TABLE acct_runs ADD COLUMN share_until TEXT", "ALTER TABLE acct_runs ADD COLUMN qc TEXT", "ALTER TABLE acct_runs ADD COLUMN qc_note TEXT", "ALTER TABLE acct_runs ADD COLUMN qc_by TEXT", "ALTER TABLE acct_runs ADD COLUMN qc_at TEXT"];
let ready = null;
export async function db(env) { const d = env.XRAY_DB; if (!d) return null;
  if (!ready) ready = d.batch(DDL.map((s) => d.prepare(s))).then(async () => { for (const m of MIGRATE) { try { await d.prepare(m).run(); } catch (e) {} } }).catch((e) => { ready = null; throw e; });
  await ready; return d; }
/* v15: activity log for the admin dashboard — never throws, never blocks the request */
export const EVENT_KINDS = ["login_google", "login_email", "login_facebook", "login_phone", "login_microsoft", "login_apple", "login_email_link", "login_github", "login_x", "login_whatsapp", "login_other", "xray_start", "xray_done", "xray_refund", "limit_hit", "checkout", "paid", "export_pdf", "export_xlsx", "export_csv", "export_plan", "export_json", "share", "finder_export", "edge_fixPack", "edge_battleCards", "edge_roadmap90", "edge_clientPitch", "linkcheck", "authority", "copy_schema", "copy_pitch", "blocked_try", "admin_grant", "admin_block", "admin_config", "action_update", "monitor_add", "monitor_check", "gsc_connect", "gsc_disconnect", "monthly_report", "why_winning", "budget_plan", "tool_use", "share_off", "share_on", "admin_qc", "admin_prompt", "upgrade_click", "report_view"];
export async function logEvent(env, userId, kind, detail) { try { if (!userId || !accountsOn(env)) return; await (await db(env)).prepare("INSERT INTO acct_events (user_id, kind, detail, created_at) VALUES (?1,?2,?3,?4)").bind(userId, kind, String(detail == null ? "" : detail).slice(0, 300), nowIso()).run(); } catch (e) {} }
export async function count(env, key, limit, ttlSec) {   // true when over the limit
  const d = await db(env), now = Date.now();
  const r = await d.prepare("INSERT INTO acct_counters (k, n, exp) VALUES (?1, 1, ?2) ON CONFLICT(k) DO UPDATE SET n = CASE WHEN exp < ?3 THEN 1 ELSE n + 1 END, exp = CASE WHEN exp < ?3 THEN ?2 ELSE exp END RETURNING n").bind(key, now + ttlSec * 1000, now).first();
  return !!r && r.n > limit;
}
export async function ipHash(request) { return (await sha256("acct|" + (request.headers.get("cf-connecting-ip") || "anon"))).slice(0, 16); }

/* ---------------- sessions (HttpOnly cookie) ---------------- */
const COOKIE = "fodo_s", DAYS = 30;
function cookieOf(request, name) { const m = new RegExp("(?:^|;\\s*)" + name + "=([^;]+)").exec(request.headers.get("cookie") || ""); return m ? decodeURIComponent(m[1]) : ""; }
export async function sessionUser(env, request) {
  if (!accountsOn(env)) return null;
  const t = cookieOf(request, COOKIE); if (!/^[a-z0-9]{40}$/.test(t)) return null;
  const d = await db(env), s = await d.prepare("SELECT * FROM acct_sessions WHERE token_hash=?1").bind(await sha256(t)).first();
  if (!s || s.expires_at < Date.now()) return null;
  const u = await d.prepare("SELECT * FROM acct_users WHERE id=?1").bind(s.user_id).first();
  return u && u.blocked && !isOwner(u) ? null : u;   // a blocked account is logged out everywhere
}
export async function newSession(env, request, userId) {
  const t = randId(40), d = await db(env);
  await d.prepare("INSERT INTO acct_sessions (token_hash, user_id, created_at, expires_at, ip_hash) VALUES (?1,?2,?3,?4,?5)").bind(await sha256(t), userId, nowIso(), Date.now() + DAYS * 864e5, await ipHash(request)).run();
  await d.prepare("UPDATE acct_users SET last_login=?2 WHERE id=?1").bind(userId, nowIso()).run();
  return COOKIE + "=" + t + "; Path=/; Max-Age=" + DAYS * 86400 + "; HttpOnly; Secure; SameSite=Lax";
}
export async function endSession(env, request) { const t = cookieOf(request, COOKIE); if (t) { const d = await db(env); await d.prepare("DELETE FROM acct_sessions WHERE token_hash=?1").bind(await sha256(t)).run(); } return COOKIE + "=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"; }
/* POSTs from the browser must come from this site (CSRF) */
export function sameOrigin(request) { const o = request.headers.get("origin"); if (!o) return true; try { return new URL(o).host === new URL(request.url).host; } catch (e) { return false; } }

/* ---------------- users ---------------- */
export async function userByEmail(env, email) { return (await db(env)).prepare("SELECT * FROM acct_users WHERE email=?1").bind(email).first(); }
export async function createUser(env, o) {
  const d = await db(env), id = "u_" + randId(16);
  await d.prepare("INSERT INTO acct_users (id, email, name, picture, google_sub, plan, monthly_left, pack_left, free_left, created_at) VALUES (?1,?2,?3,?4,?5,'free',0,0,?6,?7)").bind(id, o.email, o.name || "", o.picture || "", o.google_sub || null, PLANS.free.xrays, nowIso()).run();
  await d.prepare("INSERT OR IGNORE INTO acct_ledger (user_id, kind, delta, ref, note, created_at) VALUES (?1,'free',?2,?3,'Free X-Rays on sign-up',?4)").bind(id, PLANS.free.xrays, "free:" + id, nowIso()).run();
  return await d.prepare("SELECT * FROM acct_users WHERE id=?1").bind(id).first();
}
export const cleanEmail = (e) => { e = String(e || "").trim().toLowerCase(); return /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,180}\.[a-z]{2,24}$/.test(e) && e.length <= 254 ? e : ""; };
/* the account whose plan and credits a user spends: their team owner (if any) or themselves */
export async function billingUser(env, u) {
  if (!u) return null;
  const d = await db(env);
  const t = await d.prepare("SELECT owner_id FROM acct_team WHERE email=?1").bind(u.email).first();
  if (t && t.owner_id !== u.id) { const o = await d.prepare("SELECT * FROM acct_users WHERE id=?1").bind(t.owner_id).first(); if (o && activePlan(o) === "agency") return o; }
  return u;
}
/* FODO owner logins: every feature (Agency level), unlimited X-Rays, nothing charged. Email login needs the 6-digit code sent to that inbox,
   and Google login counts only when Google is authoritative for the address, so nobody else can sign in as these. */
export const OWNER_EMAILS = ["anmol@fodo.co.in", "singhrajputanmol014@gmail.com"];
export const isOwner = (u) => !!(u && u.email && OWNER_EMAILS.indexOf(String(u.email).toLowerCase()) > -1);
export const isUnlimited = (u) => isOwner(u) || !!(u && u.unlimited);
export const extraFeatures = (u) => { try { const a = JSON.parse((u && u.extra_features) || "[]"); return Array.isArray(a) ? a.map(String) : []; } catch (e) { return []; } };
/* plan limits + any features an owner gave this account for free */
export function limitsForUser(tier, b) { const L = limitsFor(tier), x = extraFeatures(b); x.forEach((f) => { if (L.features.indexOf(f) < 0) L.features.push(f); }); if (L.features.indexOf("externalLinks") > -1 && !L.LINKCHECK) L.LINKCHECK = 80; return L; }
export const activePlan = (u) => isOwner(u) ? "agency" : u && u.plan && u.plan !== "free" && u.plan_until && Date.parse(u.plan_until) > Date.now() ? u.plan : "free";
export function publicUser(u, owner) {
  const b = owner || u, plan = activePlan(b);
  if (isOwner(b)) return { id: u.id, email: u.email, name: u.name, picture: u.picture, phone: u.phone || "", plan, planName: "Owner", planUntil: null, unlimited: true,
    credits: { monthly: "∞", packs: b.pack_left, free: 0, total: "∞" }, team: owner && owner.id !== u.id ? { owner: owner.email } : null, limits: limitsFor("agency"), admin: true, brand: b.brand ? JSON.parse(b.brand) : null };
  return { id: u.id, email: u.email || "", name: u.name || (u.email ? "" : u.phone || ""), picture: u.picture, phone: u.phone || "", plan, planName: PLANS[plan].name, planUntil: plan === "free" ? null : b.plan_until,
    credits: b.unlimited ? { monthly: "∞", packs: b.pack_left, free: 0, total: "∞" } : { monthly: plan === "free" ? 0 : b.monthly_left, packs: b.pack_left, free: b.free_left, total: (plan === "free" ? 0 : b.monthly_left) + b.pack_left + (plan === "free" ? b.free_left : 0) },
    team: owner && owner.id !== u.id ? { owner: owner.email } : null, limits: limitsForUser(spendTier(b, plan), b), unlimited: !!b.unlimited || undefined, brand: b.brand ? JSON.parse(b.brand) : null };
}
const spendTier = (b, plan) => plan !== "free" ? plan : b.pack_left > 0 ? "starter" : "free";

/* ---------------- credits ---------------- */
/* take one X-Ray. Order: this month's plan X-Rays → packs → free ones. Atomic (UPDATE … WHERE n > 0). → { tier, kind } | null */
/* quick look (no spend) so an empty account hears "pick a plan" before any hourly limit */
export function hasCredit(b) { if (isUnlimited(b)) return true; const plan = activePlan(b); return (plan !== "free" && b.monthly_left > 0) || b.pack_left > 0 || (plan === "free" && b.free_left > 0); }
export async function spendCredit(env, b, jobId) {
  const d = await db(env), plan = activePlan(b);
  if (!isOwner(b) && b.unlimited) { await d.prepare("INSERT OR IGNORE INTO acct_ledger (user_id, kind, delta, ref, note, created_at) VALUES (?1,'gift',0,?2,'X-Ray (free — given by FODO)',?3)").bind(b.id, "run:" + jobId, nowIso()).run(); return { tier: spendTier(b, plan) === "free" ? "starter" : spendTier(b, plan), kind: "gift" }; }
  if (isOwner(b)) { await d.prepare("INSERT OR IGNORE INTO acct_ledger (user_id, kind, delta, ref, note, created_at) VALUES (?1,'owner',0,?2,'X-Ray (owner access, free)',?3)").bind(b.id, "run:" + jobId, nowIso()).run(); return { tier: "agency", kind: "owner" }; }
  const tryCol = async (col) => { const r = await d.prepare(`UPDATE acct_users SET ${col} = ${col} - 1 WHERE id=?1 AND ${col} > 0 RETURNING ${col}`).bind(b.id).first(); return !!r; };
  let kind = null, tier = "free";
  if (plan !== "free" && await tryCol("monthly_left")) { kind = "monthly"; tier = plan; }
  else if (await tryCol("pack_left")) { kind = "pack"; tier = rank(plan) >= rank("starter") ? plan : "starter"; }
  else if (plan === "free" && await tryCol("free_left")) { kind = "free"; tier = "free"; }
  if (!kind) return null;
  await d.prepare("INSERT OR IGNORE INTO acct_ledger (user_id, kind, delta, ref, note, created_at) VALUES (?1,?2,-1,?3,'X-Ray',?4)").bind(b.id, kind, "run:" + jobId, nowIso()).run();
  return { tier, kind };
}
export async function refundCredit(env, run) {
  const d = await db(env), col = { monthly: "monthly_left", pack: "pack_left", free: "free_left" }[run.credit]; if (!col) return false;
  const ins = await d.prepare("INSERT OR IGNORE INTO acct_ledger (user_id, kind, delta, ref, note, created_at) VALUES (?1,?2,1,?3,'Refund: X-Ray could not run',?4)").bind(run.owner_id, run.credit, "refund:" + run.job_id, nowIso()).run();
  if (!ins.meta || ins.meta.changes === 0) return false;
  await d.prepare(`UPDATE acct_users SET ${col} = ${col} + 1 WHERE id=?1`).bind(run.owner_id).run();
  await d.prepare("UPDATE acct_runs SET status='refunded' WHERE job_id=?1").bind(run.job_id).run();
  return true;
}
/* idempotent grants (ref is unique) */
export async function grantPlan(env, userId, planId, ref, note) {
  const d = await db(env), p = PLANS[planId]; if (!p || planId === "free") return false;
  const ins = await d.prepare("INSERT OR IGNORE INTO acct_ledger (user_id, kind, delta, ref, note, created_at) VALUES (?1,'plan',?2,?3,?4,?5)").bind(userId, p.xrays, ref, note || p.name + " — 1 month", nowIso()).run();
  if (!ins.meta || ins.meta.changes === 0) return false;
  const u = await d.prepare("SELECT * FROM acct_users WHERE id=?1").bind(userId).first();
  const cur = activePlan(u), base = cur === planId && Date.parse(u.plan_until) > Date.now() ? Date.parse(u.plan_until) : Date.now();
  const until = new Date(base + 30 * 864e5).toISOString();
  // same plan renewing: new month's X-Rays replace the old month's (unused monthly X-Rays don't roll over); upgrade: start fresh
  await d.prepare("UPDATE acct_users SET plan=?2, plan_until=?3, monthly_left=?4 WHERE id=?1").bind(userId, planId, until, p.xrays).run();
  return true;
}
export async function grantPack(env, userId, packId, ref) {
  const d = await db(env), k = PACKS[packId]; if (!k) return false;
  const ins = await d.prepare("INSERT OR IGNORE INTO acct_ledger (user_id, kind, delta, ref, note, created_at) VALUES (?1,'pack',?2,?3,?4,?5)").bind(userId, k.xrays, ref, k.name + " pack", nowIso()).run();
  if (!ins.meta || ins.meta.changes === 0) return false;
  await d.prepare("UPDATE acct_users SET pack_left = pack_left + ?2 WHERE id=?1").bind(userId, k.xrays).run();
  return true;
}

/* ---------------- Google sign-in (ID token, RS256, verified with Google's public keys) ---------------- */
const b64u = (s) => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
let jwks = null, jwksAt = 0;
async function googleKeys(env) {
  if (jwks && Date.now() - jwksAt < 3600e3) return jwks;
  const r = await outbound(env)("https://www.googleapis.com/oauth2/v3/certs", { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error("google keys " + r.status);
  jwks = (await r.json()).keys || []; jwksAt = Date.now(); return jwks;
}
export async function verifyGoogle(env, token) {
  const parts = String(token || "").split("."); if (parts.length !== 3) throw new Error("bad token");
  const head = JSON.parse(new TextDecoder().decode(b64u(parts[0]))), body = JSON.parse(new TextDecoder().decode(b64u(parts[1])));
  if (head.alg !== "RS256") throw new Error("bad alg");
  const jwk = (await googleKeys(env)).filter((k) => k.kid === head.kid)[0]; if (!jwk) throw new Error("unknown key");
  const key = await crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64u(parts[2]), enc.encode(parts[0] + "." + parts[1]));
  if (!ok) throw new Error("bad signature");
  if (body.aud !== env.GOOGLE_CLIENT_ID) throw new Error("wrong audience");
  if (body.iss !== "accounts.google.com" && body.iss !== "https://accounts.google.com") throw new Error("wrong issuer");
  if (!body.exp || body.exp * 1000 < Date.now()) throw new Error("expired");
  const email = cleanEmail(body.email);
  // Google vouches for the address only for @gmail.com, or a verified Workspace address (hd set)
  const authoritative = !!email && body.email_verified === true && (/@gmail\.com$/.test(email) || !!body.hd);
  return { sub: String(body.sub), email, authoritative, name: String(body.name || "").slice(0, 80), picture: /^https:\/\//.test(body.picture || "") ? body.picture.slice(0, 300) : "" };
}

/* ---------------- v16 more ways to log in: Firebase Authentication (Facebook, phone OTP, Microsoft, Apple, email link …) ----------------
   The browser signs in with Firebase; we verify Firebase's ID token here (RS256, Google's securetoken keys, aud = project id). */
const FB_KEYS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let fbJwks = null, fbAt = 0;
export const firebaseOn = (env) => !!(env.FIREBASE_API_KEY && env.FIREBASE_PROJECT_ID);
export async function verifyFirebase(env, token) {
  if (!firebaseOn(env)) throw new Error("not set up");
  const parts = String(token || "").split("."); if (parts.length !== 3) throw new Error("bad token");
  const head = JSON.parse(new TextDecoder().decode(b64u(parts[0]))), body = JSON.parse(new TextDecoder().decode(b64u(parts[1])));
  if (head.alg !== "RS256") throw new Error("bad alg");
  if (!fbJwks || Date.now() - fbAt > 3600e3) { const r = await outbound(env)(FB_KEYS, { signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error("keys " + r.status); fbJwks = (await r.json()).keys || []; fbAt = Date.now(); }
  const jwk = fbJwks.filter((k) => k.kid === head.kid)[0]; if (!jwk) throw new Error("unknown key");
  const key = await crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64u(parts[2]), enc.encode(parts[0] + "." + parts[1])))) throw new Error("bad signature");
  if (body.aud !== env.FIREBASE_PROJECT_ID) throw new Error("wrong audience");
  if (body.iss !== "https://securetoken.google.com/" + env.FIREBASE_PROJECT_ID) throw new Error("wrong issuer");
  if (!body.exp || body.exp * 1000 < Date.now() || !body.sub) throw new Error("expired");
  const fbp = (body.firebase && body.firebase.sign_in_provider) || "", email = cleanEmail(body.email);
  return { uid: String(body.sub), provider: fbp, email, emailVerified: body.email_verified === true, phone: /^\+\d{8,15}$/.test(body.phone_number || "") ? body.phone_number : "",
    name: String(body.name || "").slice(0, 80), picture: /^https:\/\//.test(body.picture || "") ? body.picture.slice(0, 300) : "" };
}
export const waOn = (env) => !!(env.WA_NUMBER && env.WA_TOKEN && env.WA_PHONE_ID && env.WA_APP_SECRET);
export const displayName = (u) => (u && (u.name || u.email || u.phone)) || "User";

/* ---------------- email one-time code (Resend) ---------------- */
export async function sendMail(env, to, subject, html, text) {
  if (!env.RESEND_API_KEY) throw new Error("email not configured");
  const r = await outbound(env)("https://api.resend.com/emails", { method: "POST", headers: { authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM || "FODO <login@fodo.co.in>", to: [to], subject, html, text }), signal: AbortSignal.timeout(10000) });
  if (!r.ok) { log({ route: "mail", ok: false, status: r.status }); throw new Error("email failed " + r.status); }
  return true;
}
export const otpHash = (env, email, code) => sha256("otp|" + (env.CASHFREE_SECRET_KEY || env.RESEND_API_KEY || "fodo") + "|" + email + "|" + code);

/* ---------------- Cashfree ---------------- */
export const cfBase = (env) => (env.CASHFREE_ENV === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg");
export const cfOn = (env) => !!(env.CASHFREE_APP_ID && env.CASHFREE_SECRET_KEY);
export async function cf(env, method, path, body, idem) {
  const h = { "x-client-id": env.CASHFREE_APP_ID, "x-client-secret": env.CASHFREE_SECRET_KEY, "x-api-version": env.CASHFREE_API_VERSION || "2025-01-01", "content-type": "application/json", accept: "application/json" };
  if (idem) h["x-idempotency-key"] = idem;
  const r = await outbound(env)(cfBase(env) + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  log({ route: "cashfree", path: path.replace(/\/[A-Za-z0-9_.-]{12,}/g, "/:id"), status: r.status, ok: r.ok });
  if (!r.ok) { const e = new Error(j.message || "Cashfree " + r.status); e.status = r.status; e.body = j; throw e; }
  return j;
}
export async function verifyWebhook(env, ts, raw, sig) {
  if (!ts || !sig) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(env.CASHFREE_SECRET_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(ts + raw)));
  const b64 = btoa(String.fromCharCode(...mac));
  if (b64.length !== sig.length) return false;
  let diff = 0; for (let i = 0; i < b64.length; i++) diff |= b64.charCodeAt(i) ^ sig.charCodeAt(i);   // constant time
  return diff === 0 && Math.abs(Date.now() - (+ts > 1e12 ? +ts : +ts * 1000)) < 24 * 3600e3;
}
/* order paid? → credit it (idempotent). Always re-reads the order from Cashfree — never trusts the browser or the webhook body. */
export async function settleOrder(env, orderId) {
  const d = await db(env), o = await d.prepare("SELECT * FROM acct_orders WHERE order_id=?1").bind(orderId).first(); if (!o) return { ok: false, reason: "unknown order" };
  if (o.status === "PAID") return { ok: true, already: true, order: o };
  const cfo = await cf(env, "GET", "/orders/" + encodeURIComponent(orderId));
  if (cfo.order_status !== "PAID") { await d.prepare("UPDATE acct_orders SET status=?2 WHERE order_id=?1").bind(orderId, cfo.order_status || "ACTIVE").run(); return { ok: false, status: cfo.order_status }; }
  if (Math.abs(+cfo.order_amount - o.amount) > 0.01) { log({ route: "settle", ok: false, err: "amount mismatch", order: orderId }); return { ok: false, reason: "amount mismatch" }; }
  const upd = await d.prepare("UPDATE acct_orders SET status='PAID', paid_at=?2, cf_order_id=?3 WHERE order_id=?1 AND status != 'PAID'").bind(orderId, nowIso(), String(cfo.cf_order_id || "")).run();
  if (upd.meta && upd.meta.changes) await logEvent(env, o.user_id, "paid", o.kind + ":" + o.item + ":" + o.amount);
  if (upd.meta && upd.meta.changes) { if (o.kind === "pack") await grantPack(env, o.user_id, o.item, "order:" + orderId); else await grantPlan(env, o.user_id, o.item, "order:" + orderId); }
  return { ok: true, order: Object.assign(o, { status: "PAID" }) };
}
