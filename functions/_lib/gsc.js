/* FODO Growth Lab v17: Google Search Console (prompt §17): the user's OWN search data, read with OAuth (read-only scope).
   FODO never asks for a password. Secrets: GOOGLE_CLIENT_ID (already set for login) + GOOGLE_CLIENT_SECRET (new).
   Optional GSC_ENC_KEY (any long random text) encrypts the stored refresh token (AES-GCM); without it a key is derived
   from GOOGLE_CLIENT_SECRET. Scope: https://www.googleapis.com/auth/webmasters.readonly only. Revocable from the account page
   (FODO deletes the token and asks Google to revoke it). Data stays per user: a report only shows Search Console numbers to
   the person who connected that property (shared report links never include them, prompt §76). */
import { outbound, regDomain } from "./xray-core.js";

export const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export const gscOn = (env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u8) => btoa(String.fromCharCode(...u8)), unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function aesKey(env) { const raw = await crypto.subtle.digest("SHA-256", enc.encode("fodo-gsc|" + (env.GSC_ENC_KEY || env.GOOGLE_CLIENT_SECRET || ""))); return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]); }
export async function seal(env, text) { const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(env), enc.encode(text))); return b64(iv) + "." + b64(ct); }
export async function unseal(env, s) { const [iv, ct] = String(s || "").split("."); return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await aesKey(env), unb64(ct))); }
async function hmac(env, s) { const k = await crypto.subtle.importKey("raw", enc.encode("fodo-gsc-state|" + (env.GOOGLE_CLIENT_SECRET || "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32); }
/* state = userId.time.signature, ties the Google answer to the logged-in user, valid 15 minutes */
export async function makeState(env, userId) { const t = Date.now().toString(36); return userId + "." + t + "." + (await hmac(env, userId + "." + t)); }
export async function checkState(env, state, userId) { const p = String(state || "").split("."); if (p.length !== 3 || p[0] !== userId) return false; if (Date.now() - parseInt(p[1], 36) > 15 * 60e3) return false; return (await hmac(env, p[0] + "." + p[1])) === p[2]; }
export const redirectUri = (origin) => origin + "/api/lab/gsc/callback";
export function authUrl(env, origin, state) {
  return "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(origin), response_type: "code", scope: SCOPE, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state }).toString();
}
async function token(env, params) {
  const r = await outbound(env)("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(Object.assign({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET }, params)).toString(), signal: AbortSignal.timeout(12000) });
  const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j.error || "token " + r.status); e.status = r.status; e.code = j.error; throw e; } return j;
}
export const exchange = (env, code, origin) => token(env, { code, redirect_uri: redirectUri(origin), grant_type: "authorization_code" });
export const refresh = (env, rt) => token(env, { refresh_token: rt, grant_type: "refresh_token" });
export async function revoke(env, rt) { try { await outbound(env)("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(rt), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(8000) }); } catch (e) {} }
const API = "https://www.googleapis.com/webmasters/v3";
export async function listSites(env, at) { const r = await outbound(env)(API + "/sites", { headers: { authorization: "Bearer " + at }, signal: AbortSignal.timeout(12000) }); if (!r.ok) throw Object.assign(new Error("sites " + r.status), { status: r.status }); return ((await r.json()).siteEntry || []).map((s) => ({ siteUrl: String(s.siteUrl), permission: String(s.permissionLevel || "") })).filter((s) => s.permission !== "siteUnverifiedUser"); }
async function query(env, at, site, body) {
  const r = await outbound(env)(API + "/sites/" + encodeURIComponent(site) + "/searchAnalytics/query", { method: "POST", headers: { authorization: "Bearer " + at, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw Object.assign(new Error("query " + r.status), { status: r.status }); return (await r.json()).rows || [];
}
export const DDL = "CREATE TABLE IF NOT EXISTS lab_gsc (user_id TEXT PRIMARY KEY, refresh_enc TEXT, sites TEXT, email TEXT, connected_at TEXT, last_used TEXT)";
const made = new WeakSet();
export async function gdb(env) { const d = env.XRAY_DB; if (!d) return null; if (!made.has(d)) { await d.prepare(DDL).run(); made.add(d); } return d; }
export const siteDomain = (s) => regDomain(String(s).replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").split("/")[0].toLowerCase());
const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const r1 = (x) => Math.round(x * 10) / 10, pct = (x) => Math.round(x * 1000) / 10;
/* the X-Ray asks: does this user have Search Console for this domain? → numbers for the last 28 days (data lags ~2-3 days) */
export async function gscForJob(env, userId, domain) {
  if (!gscOn(env)) return { ok: false, connected: false, reason: "Search Console is not set up on this site yet." };
  const d = await gdb(env), row = await d.prepare("SELECT * FROM lab_gsc WHERE user_id=?1").bind(userId).first();
  if (!row) return { ok: false, connected: false, reason: "Connect Google Search Console in your account to add your real clicks and impressions." };
  let at, calls = 0;
  try { at = (await refresh(env, await unseal(env, row.refresh_enc))).access_token; calls++; }
  catch (e) { if (e.code === "invalid_grant") await d.prepare("DELETE FROM lab_gsc WHERE user_id=?1").bind(userId).run(); return { ok: false, connected: false, calls, reason: e.code === "invalid_grant" ? "Your Search Console connection expired or was revoked, connect it again in your account." : "Google did not answer: Search Console data unavailable this time." }; }
  let sites; try { sites = await listSites(env, at); calls++; } catch (e) { return { ok: false, connected: true, calls, reason: "Could not list your Search Console properties." }; }
  await d.prepare("UPDATE lab_gsc SET sites=?2, last_used=?3 WHERE user_id=?1").bind(userId, JSON.stringify(sites.map((s) => s.siteUrl)).slice(0, 4000), new Date().toISOString()).run();
  const mine = sites.filter((s) => siteDomain(s.siteUrl) === domain).sort((a, b) => (/^sc-domain:/.test(b.siteUrl) ? 1 : 0) - (/^sc-domain:/.test(a.siteUrl) ? 1 : 0))[0];
  if (!mine) return { ok: false, connected: true, noProperty: true, calls, properties: sites.length, reason: "Your Google account has no Search Console property for " + domain + ", add and verify it in Search Console, then run the X-Ray again." };
  const startDate = day(30), endDate = day(3), base = { startDate, endDate, dataState: "final" };
  try {
    const [tot, qs, pages, dev, ctry, dates] = await Promise.all([query(env, at, mine.siteUrl, base), query(env, at, mine.siteUrl, Object.assign({ dimensions: ["query"], rowLimit: 100 }, base)),
      query(env, at, mine.siteUrl, Object.assign({ dimensions: ["page"], rowLimit: 25 }, base)), query(env, at, mine.siteUrl, Object.assign({ dimensions: ["device"] }, base)),
      query(env, at, mine.siteUrl, Object.assign({ dimensions: ["country"], rowLimit: 10 }, base)), query(env, at, mine.siteUrl, Object.assign({ dimensions: ["date"] }, base))]);
    calls += 6;
    const row0 = tot[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 }, map = (x) => ({ key: String(x.keys[0]), clicks: x.clicks, impressions: x.impressions, ctr: pct(x.ctr), position: r1(x.position) });
    return { ok: true, connected: true, calls, property: mine.siteUrl, startDate, endDate, retrievedAt: new Date().toISOString(), source: "Google Search Console (your property, first-party data)",
      totals: { clicks: row0.clicks, impressions: row0.impressions, ctr: pct(row0.ctr || 0), position: r1(row0.position || 0) },
      queries: qs.map(map), pages: pages.map(map), devices: dev.map(map), countries: ctry.map(map), dates: dates.map(map) };
  } catch (e) { return { ok: false, connected: true, calls, property: mine.siteUrl, reason: "Search Console answered " + (e.status || "an error") + ", data unavailable this time." }; }
}
