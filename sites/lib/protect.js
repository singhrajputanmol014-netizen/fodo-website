/* v34 password-protected pages of a client website.
   Passwords: PBKDF2-SHA256, 100,000 iterations, 16-byte random salt → "p2$100000$<salt>$<hash>" (base64url). Pages saved before
   v34 keep their old "sha256(password|siteId)" value and still open; the next time the owner sets the password it is stored in
   the new format. Brute force: 8 wrong tries per visitor (IP) per page per 15 minutes, then a 15-minute wait. A right password
   gives a signed, HttpOnly, Secure, SameSite=Lax cookie for 12 hours, scoped to that page. The signature includes the stored
   hash, so changing the password logs everyone out; "?logout=1" clears it. Nothing here is logged. */
const enc = new TextEncoder(), ITER = 100000;
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const same = (a, b) => { a = String(a || ""); b = String(b || ""); if (!a || a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; };
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const PW_RE = /^(p2\$\d{4,6}\$[A-Za-z0-9_-]{16,32}\$[A-Za-z0-9_-]{40,50}|[0-9a-f]{64})$/;

async function derive(pw, salt, iter) {
  const k = await crypto.subtle.importKey("raw", enc.encode(String(pw)), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, k, 256);
}
export async function hashPw(pw) { const salt = crypto.getRandomValues(new Uint8Array(16)); return "p2$" + ITER + "$" + b64u(salt) + "$" + b64u(await derive(pw, salt, ITER)); }
export async function verifyPw(pw, stored, siteId) {
  if (!pw || !stored) return false;
  if (/^[0-9a-f]{64}$/.test(stored)) return same(hex(await crypto.subtle.digest("SHA-256", enc.encode(String(pw) + "|" + siteId))), stored);   // pre-v34 pages
  const m = /^p2\$(\d+)\$([^$]+)\$([^$]+)$/.exec(stored); if (!m || +m[1] > 100000) return false;
  return same(b64u(await derive(pw, unb64u(m[2]), +m[1])), m[3]);
}
async function hmac(key, msg) { const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return b64u(await crypto.subtle.sign("HMAC", k, enc.encode(msg))); }
const cookieName = async (siteId, slug) => "fpw_" + hex(await crypto.subtle.digest("SHA-256", enc.encode(siteId + "|" + slug))).slice(0, 12);
const keyFor = (env, stored, siteId) => String((env && env.SITES_SECRET_KEY) || "") + "|" + stored + "|" + siteId;

/* attempts: a tiny counter table in the same D1 database (works in both Pages projects) */
async function tries(env, k, add) {
  const d = env && env.XRAY_DB; if (!d) return 0; const now = Date.now();
  try { await d.prepare("CREATE TABLE IF NOT EXISTS site_pw_attempts (k TEXT PRIMARY KEY, n INTEGER, exp INTEGER)").run(); } catch (e) {}
  if (add) { const r = await d.prepare("INSERT INTO site_pw_attempts (k, n, exp) VALUES (?1, 1, ?2) ON CONFLICT(k) DO UPDATE SET n = CASE WHEN exp < ?3 THEN 1 ELSE n + 1 END, exp = CASE WHEN exp < ?3 THEN ?2 ELSE exp END RETURNING n").bind(k, now + 15 * 60e3, now).first().catch(() => null); return r ? r.n : 0; }
  const r = await d.prepare("SELECT n, exp FROM site_pw_attempts WHERE k=?1").bind(k).first().catch(() => null); return r && r.exp > now ? r.n : 0;
}
export const MAX_TRIES = 8;

/* → { ok: true, setCookie? } | { ok: false, status, msg, setCookie? } */
export async function gate(env, request, siteId, slug, stored, path) {
  const name = await cookieName(siteId, slug), url = new URL(request.url), secure = url.protocol === "https:" ? "; Secure" : "";
  const clear = name + "=; Path=" + path + "; Max-Age=0; HttpOnly; SameSite=Lax" + secure;
  if (url.searchParams.get("logout") === "1") return { ok: false, status: 200, msg: "You are logged out of this page.", setCookie: clear };
  const ck = ((request.headers.get("cookie") || "").split(/;\s*/).find((c) => c.indexOf(name + "=") === 0) || "").slice(name.length + 1);
  if (ck) { const [exp, sig] = ck.split("."); if (+exp > Date.now() && same(sig, await hmac(keyFor(env, stored, siteId), siteId + "|" + slug + "|" + exp))) return { ok: true }; }
  if (request.method !== "POST") return { ok: false, status: 401, msg: "", setCookie: ck ? clear : null };
  const ip = request.headers.get("cf-connecting-ip") || "", k = "pw|" + siteId + "|" + slug + "|" + ip;
  if (await tries(env, k, false) >= MAX_TRIES) return { ok: false, status: 429, msg: "Too many wrong passwords. Please wait 15 minutes and try again." };
  const given = String((await request.formData().catch(() => new FormData())).get("pw") || "").slice(0, 200);
  if (!(await verifyPw(given, stored, siteId))) { const n = await tries(env, k, true); return { ok: false, status: n >= MAX_TRIES ? 429 : 401, msg: n >= MAX_TRIES ? "Too many wrong passwords. Please wait 15 minutes and try again." : "That password isn't right." }; }
  const exp = Date.now() + 12 * 3600e3, sig = await hmac(keyFor(env, stored, siteId), siteId + "|" + slug + "|" + exp);
  return { ok: true, setCookie: name + "=" + exp + "." + sig + "; Path=" + path + "; Max-Age=43200; HttpOnly; SameSite=Lax" + secure, redirect: true };
}
