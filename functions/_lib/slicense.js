/* FODO v53 Studio keys (licences).
   Every person who opens FODO Studio gets a personal key, made from their account the first time they log in.
   Nothing in Studio works (website or the desktop app) until that key is entered. FODO gives the key out
   (FODO Admin ▸ Studio shows it, with Copy / WhatsApp), so for now FODO decides who can use Studio.
   Statuses: waiting (key made, not entered yet) · active (key entered) · blocked (by FODO, with a reason).
   Desktop app: POST /api/social/app/activate {key, fp, name, platform, version} binds the key to that computer
   (device limit per person) and returns a lease signed with Ed25519. The app checks the signature with the public
   key built into it, so a lease can't be forged or copied to another computer (it carries the computer's
   fingerprint). The app renews the lease every hour while online (POST app/refresh); a lease lasts LEASE_HOURS,
   so a blocked person's app stops at the next renewal, and a computer kept offline stops when its lease runs out.
   The signing key is made once and stored AES-GCM sealed in D1 (gsc.js seal): no new secret to configure. */
import { nowIso, randId, isOwner } from "./accounts.js";
import { err } from "./biz.js";
import { seal, unseal } from "./gsc.js";
import { ssdb, newDevice } from "./sstudio.js";
import * as SCH from "./schema.js";

export const LEASE_HOURS = 48;
export const DEFAULT_DEVICES = 2;
const DDL = [
  "CREATE TABLE IF NOT EXISTS ss_licenses (user_id TEXT PRIMARY KEY, key_hash TEXT UNIQUE, key_sealed TEXT, key_hint TEXT, status TEXT, created_at TEXT, entered_at TEXT, entered_via TEXT, blocked_at TEXT, block_reason TEXT, blocked_by TEXT, max_devices INTEGER, note TEXT, updated_at TEXT, last_seen TEXT)",
  "CREATE TABLE IF NOT EXISTS ss_lic_devices (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, fp_hash TEXT NOT NULL, name TEXT, platform TEXT, version TEXT, activated_at TEXT, last_seen TEXT, last_ip TEXT, revoked INTEGER DEFAULT 0, upload_device_id TEXT)",
  "CREATE INDEX IF NOT EXISTS ss_lic_dev_user ON ss_lic_devices (user_id, revoked)",
  "CREATE TABLE IF NOT EXISTS ss_lic_meta (k TEXT PRIMARY KEY, v TEXT)",
];
export async function ldb(env) { const d = await ssdb(env); await SCH.setup(d, "slicense", () => SCH.ddl(d, DDL)); return d; }

const nn = (a) => a.map((v) => (v === undefined ? null : v));
const one = (d, sql, ...a) => d.prepare(sql).bind(...nn(a)).first();
const all = async (d, sql, ...a) => ((await d.prepare(sql).bind(...nn(a)).all()).results || []);
const run = (d, sql, ...a) => d.prepare(sql).bind(...nn(a)).run();
const enc = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const b64u = (u8) => btoa(String.fromCharCode(...new Uint8Array(u8))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(s).length + 3) % 4)), (c) => c.charCodeAt(0));
const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n);

/* ---- keys: FODO-XXXX-XXXX-XXXX-XXXX (Crockford base32, no 0/O/1/I/L/U confusion), ~100 bits ---- */
const ALPH = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export function makeKey() {
  const r = crypto.getRandomValues(new Uint8Array(20)); let s = "";
  for (let i = 0; i < 20; i++) s += ALPH[r[i] % ALPH.length];
  return "FODO-" + s.match(/.{4}/g).join("-");
}
export const normKey = (k) => { const s = String(k || "").toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/^FODO/, ""); return s.length === 20 ? "FODO-" + s.match(/.{4}/g).join("-") : ""; };

/* ---- the licence row (made on first Studio login) ---- */
async function create(env, d, uid, status) {
  const key = makeKey(), now = nowIso();
  await run(d, "INSERT OR IGNORE INTO ss_licenses (user_id, key_hash, key_sealed, key_hint, status, created_at, entered_at, entered_via, max_devices, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?6)",
    uid, await sha(key), await seal(env, key), key.slice(-4), status, now, status === "active" ? now : null, status === "active" ? "owner" : null, DEFAULT_DEVICES);
}
export async function ensure(env, u) {
  const d = await ldb(env); let L = await one(d, "SELECT * FROM ss_licenses WHERE user_id=?1", u.id);
  if (!L) { await create(env, d, u.id, isOwner(u) ? "active" : "waiting"); L = await one(d, "SELECT * FROM ss_licenses WHERE user_id=?1", u.id); }
  else if (isOwner(u) && L.status === "waiting") { await run(d, "UPDATE ss_licenses SET status='active', entered_at=?2, entered_via='owner', updated_at=?2 WHERE user_id=?1", u.id, nowIso()); L.status = "active"; }
  if (!L.last_seen || Date.now() - Date.parse(L.last_seen) > 600e3) await run(d, "UPDATE ss_licenses SET last_seen=?2 WHERE user_id=?1", u.id, nowIso());
  return L;
}
export const isActive = (L) => !!L && L.status === "active";
const devOut = (x) => ({ id: x.id, name: x.name, platform: x.platform, version: x.version, activated_at: x.activated_at, last_seen: x.last_seen, active: !x.revoked });
export async function mine(env, u) {
  const L = await ensure(env, u), d = await ldb(env);
  return { status: L.status, hint: L.key_hint, entered_at: L.entered_at, blocked_reason: L.status === "blocked" ? L.block_reason || "" : undefined,
    max_devices: L.max_devices || DEFAULT_DEVICES, lease_hours: LEASE_HOURS,
    devices: (await all(d, "SELECT * FROM ss_lic_devices WHERE user_id=?1 ORDER BY activated_at DESC LIMIT 20", u.id)).map(devOut) };
}
export async function enterKey(env, u, key) {
  const L = await ensure(env, u), k = normKey(key);
  if (L.status === "blocked") throw err("Your FODO Studio is blocked. Please contact FODO.", 403);
  if (!k || (await sha(k)) !== L.key_hash) throw err("That key is not right. Check it, or ask FODO for your key.", 400);
  if (L.status !== "active") await run(await ldb(env), "UPDATE ss_licenses SET status='active', entered_at=?2, entered_via='website', updated_at=?2 WHERE user_id=?1", u.id, nowIso());
  return mine(env, u);
}

/* ---- Ed25519 signing key (made once, stored sealed) ---- */
let _sk = null, _pk = null;
async function signingKey(env) {
  if (_sk) return { sk: _sk, pk: _pk };
  const d = await ldb(env); let row = await one(d, "SELECT v FROM ss_lic_meta WHERE k='ed25519'");
  if (!row) {
    const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const pkcs8 = b64u(await crypto.subtle.exportKey("pkcs8", kp.privateKey)), raw = b64u(await crypto.subtle.exportKey("raw", kp.publicKey));
    await run(d, "INSERT OR IGNORE INTO ss_lic_meta (k, v) VALUES ('ed25519', ?1)", JSON.stringify({ sk: await seal(env, pkcs8), pk: raw, made: nowIso() }));
    row = await one(d, "SELECT v FROM ss_lic_meta WHERE k='ed25519'");
  }
  const v = JSON.parse(row.v);
  _sk = await crypto.subtle.importKey("pkcs8", unb64u(await unseal(env, v.sk)), { name: "Ed25519" }, false, ["sign"]); _pk = v.pk;
  return { sk: _sk, pk: _pk };
}
export async function publicKey(env) { return (await signingKey(env)).pk; }
async function lease(env, L, dev, email) {
  const now = Date.now(), body = { v: 1, lic: L.user_id, dev: dev.id, fp: dev.fp_hash, email: email || "", iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + LEASE_HOURS * 3600, renew: 3600 };
  const payload = enc.encode(JSON.stringify(body)), sig = await crypto.subtle.sign({ name: "Ed25519" }, (await signingKey(env)).sk, payload);
  return b64u(payload) + "." + b64u(sig);
}
export async function verifyLease(env, token) {   // used by tests / support tools
  const [p, s] = String(token || "").split("."); const pk = await crypto.subtle.importKey("raw", unb64u(await publicKey(env)), { name: "Ed25519" }, false, ["verify"]);
  return (await crypto.subtle.verify({ name: "Ed25519" }, pk, unb64u(s), unb64u(p))) ? JSON.parse(new TextDecoder().decode(unb64u(p))) : null;
}

/* ---- the desktop app ---- */
const blockedMsg = (L) => "This FODO Studio is blocked" + (L.block_reason ? ": " + L.block_reason : "") + ". Please contact FODO.";
export async function activate(env, b, ip) {
  const k = normKey(b.key), fp = String(b.fp || "");
  if (!k) throw err("Enter the key FODO gave you (FODO-XXXX-XXXX-XXXX-XXXX-XXXX).", 400);
  if (!/^[a-f0-9]{64}$/.test(fp)) throw err("This copy of FODO Studio is damaged. Download it again from fodo.co.in.", 400);
  const d = await ldb(env), L = await one(d, "SELECT * FROM ss_licenses WHERE key_hash=?1", await sha(k));
  if (!L) throw err("That key is not right. Check it, or ask FODO for your key.", 404);
  if (L.status === "blocked") throw err(blockedMsg(L), 403);
  const u = await one(d, "SELECT id, email, name, phone FROM acct_users WHERE id=?1", L.user_id); if (!u) throw err("This key's account no longer exists.", 404);
  const now = nowIso();
  if (L.status !== "active") await run(d, "UPDATE ss_licenses SET status='active', entered_at=?2, entered_via='app', updated_at=?2 WHERE user_id=?1", L.user_id, now);
  let dev = await one(d, "SELECT * FROM ss_lic_devices WHERE user_id=?1 AND fp_hash=?2 AND revoked=0", L.user_id, fp);
  if (!dev) {
    const n = (await one(d, "SELECT COUNT(*) n FROM ss_lic_devices WHERE user_id=?1 AND revoked=0", L.user_id)).n, max = L.max_devices || DEFAULT_DEVICES;
    if (n >= max) throw err("This key is already used on " + n + " computer(s), the limit is " + max + ". Remove one in fodo.co.in ▸ Studio ▸ Control panel, or ask FODO.", 409);
    const id = "ld_" + randId(14);
    await run(d, "INSERT INTO ss_lic_devices (id, user_id, fp_hash, name, platform, version, activated_at, last_seen, last_ip, revoked) VALUES (?1,?2,?3,?4,?5,?6,?7,?7,?8,0)",
      id, L.user_id, fp, clip(b.name, 60) || "Computer", clip(b.platform, 30), clip(b.version, 20), now, clip(ip, 60));
    dev = await one(d, "SELECT * FROM ss_lic_devices WHERE id=?1", id);
  } else await run(d, "UPDATE ss_lic_devices SET last_seen=?2, version=?3, last_ip=?4 WHERE id=?1", dev.id, now, clip(b.version, 20), clip(ip, 60));
  // a fresh upload key ("Send to FODO") for this computer; the old one stops working
  if (dev.upload_device_id) await run(d, "UPDATE ss_devices SET revoked=1 WHERE id=?1", dev.upload_device_id);
  const up = await newDevice(env, u, { name: "FODO Studio app · " + (clip(b.name, 40) || "Computer") });
  await run(d, "UPDATE ss_lic_devices SET upload_device_id=?2 WHERE id=?1", dev.id, up.id);
  return { lease: await lease(env, L, dev, u.email), upload_key: up.key, email: u.email || u.phone || "", device: dev.id, lease_hours: LEASE_HOURS };
}
export async function refresh(env, b, ip) {
  const d = await ldb(env), dev = await one(d, "SELECT * FROM ss_lic_devices WHERE id=?1", String(b.device || ""));
  if (!dev || dev.fp_hash !== String(b.fp || "")) throw err("This computer is not activated. Enter your FODO Studio key again.", 401);
  if (dev.revoked) throw Object.assign(err("This computer was removed from your FODO Studio. Enter your key again to use it.", 401), { removed: true });
  const L = await one(d, "SELECT * FROM ss_licenses WHERE user_id=?1", dev.user_id);
  if (!L || L.status === "blocked") throw Object.assign(err(L ? blockedMsg(L) : "Unknown key.", 403), { blocked: true });
  const u = await one(d, "SELECT email FROM acct_users WHERE id=?1", L.user_id);
  await run(d, "UPDATE ss_lic_devices SET last_seen=?2, version=COALESCE(?3, version), last_ip=?4 WHERE id=?1", dev.id, nowIso(), b.version ? clip(b.version, 20) : null, clip(ip, 60));
  await run(d, "UPDATE ss_licenses SET last_seen=?2 WHERE user_id=?1", L.user_id, nowIso());
  return { lease: await lease(env, L, dev, u && u.email), lease_hours: LEASE_HOURS };
}
export async function removeOwnDevice(env, u, id) {
  const d = await ldb(env), dev = await one(d, "SELECT * FROM ss_lic_devices WHERE id=?1 AND user_id=?2", String(id), u.id); if (!dev) throw err("Not found.", 404);
  await run(d, "UPDATE ss_lic_devices SET revoked=1 WHERE id=?1", dev.id);
  if (dev.upload_device_id) await run(d, "UPDATE ss_devices SET revoked=1 WHERE id=?1", dev.upload_device_id);
  return mine(env, u);
}

/* ---- FODO Admin ▸ Studio ---- */
export async function adminList(env) {
  const d = await ldb(env);
  const rows = await all(d, "SELECT l.*, u.email, u.name, u.phone, u.created_at AS joined FROM ss_licenses l LEFT JOIN acct_users u ON u.id = l.user_id ORDER BY l.created_at DESC LIMIT 2000");
  const devs = await all(d, "SELECT * FROM ss_lic_devices ORDER BY activated_at DESC LIMIT 5000"), by = {};
  devs.forEach((x) => { (by[x.user_id] = by[x.user_id] || []).push(devOut(x)); });
  const items = rows.map((r) => ({ user_id: r.user_id, email: r.email || r.phone || "", name: r.name || "", status: r.status, hint: r.key_hint, created_at: r.created_at, entered_at: r.entered_at, entered_via: r.entered_via,
    blocked_at: r.blocked_at, block_reason: r.block_reason || "", max_devices: r.max_devices || DEFAULT_DEVICES, last_seen: r.last_seen, note: r.note || "", devices: by[r.user_id] || [] }));
  const c = (s) => items.filter((x) => x.status === s).length;
  return { items, counts: { total: items.length, waiting: c("waiting"), active: c("active"), blocked: c("blocked"), computers: devs.filter((x) => !x.revoked).length }, lease_hours: LEASE_HOURS };
}
export async function adminKey(env, uid) {
  const L = await one(await ldb(env), "SELECT key_sealed FROM ss_licenses WHERE user_id=?1", String(uid)); if (!L) throw err("Not found.", 404);
  return { key: await unseal(env, L.key_sealed) };
}
export async function adminAction(env, uid, b, by) {
  const d = await ldb(env), L = await one(d, "SELECT * FROM ss_licenses WHERE user_id=?1", String(uid)); if (!L) throw err("Not found.", 404);
  const now = nowIso(), a = String(b.action || "");
  if (a === "block") await run(d, "UPDATE ss_licenses SET status='blocked', blocked_at=?2, block_reason=?3, blocked_by=?4, updated_at=?2 WHERE user_id=?1", L.user_id, now, clip(b.reason, 160), clip(by, 120));
  else if (a === "unblock") await run(d, "UPDATE ss_licenses SET status=?2, blocked_at=NULL, block_reason=NULL, updated_at=?3 WHERE user_id=?1", L.user_id, L.entered_at ? "active" : "waiting", now);
  else if (a === "activate") await run(d, "UPDATE ss_licenses SET status='active', entered_at=COALESCE(entered_at, ?2), entered_via=COALESCE(entered_via, 'admin'), blocked_at=NULL, block_reason=NULL, updated_at=?2 WHERE user_id=?1", L.user_id, now);
  else if (a === "regen") {   // new key: the old one stops working everywhere, every computer must enter the new key
    const key = makeKey();
    await run(d, "UPDATE ss_licenses SET key_hash=?2, key_sealed=?3, key_hint=?4, status=CASE WHEN status='blocked' THEN 'blocked' ELSE 'waiting' END, entered_at=NULL, entered_via=NULL, updated_at=?5 WHERE user_id=?1", L.user_id, await sha(key), await seal(env, key), key.slice(-4), now);
    for (const x of await all(d, "SELECT * FROM ss_lic_devices WHERE user_id=?1 AND revoked=0", L.user_id)) { await run(d, "UPDATE ss_lic_devices SET revoked=1 WHERE id=?1", x.id); if (x.upload_device_id) await run(d, "UPDATE ss_devices SET revoked=1 WHERE id=?1", x.upload_device_id); }
  } else if (a === "devices") await run(d, "UPDATE ss_licenses SET max_devices=?2, updated_at=?3 WHERE user_id=?1", L.user_id, Math.max(1, Math.min(20, Math.round(+b.max) || DEFAULT_DEVICES)), now);
  else if (a === "note") await run(d, "UPDATE ss_licenses SET note=?2, updated_at=?3 WHERE user_id=?1", L.user_id, clip(b.note, 300), now);
  else if (a === "remove_device") {
    const x = await one(d, "SELECT * FROM ss_lic_devices WHERE id=?1 AND user_id=?2", String(b.device || ""), L.user_id); if (!x) throw err("Not found.", 404);
    await run(d, "UPDATE ss_lic_devices SET revoked=1 WHERE id=?1", x.id); if (x.upload_device_id) await run(d, "UPDATE ss_devices SET revoked=1 WHERE id=?1", x.upload_device_id);
  } else throw err("Unknown action.", 400);
  return adminList(env);
}
