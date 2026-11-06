/* v50.4 webhook replay guard. Runs AFTER the signature check (so unsigned traffic never writes here).
   1) Freshness: a provider timestamp (seconds or milliseconds) must be within 15 minutes in the past and 5 in the future.
   2) Once only: the SHA-256 of provider + body is stored; the same signed delivery a second time is acknowledged (200) but not processed.
   Settlement code is already idempotent; this stops an old captured delivery being replayed and keeps logs clean. Rows older than 14 days are pruned. */
const T = "CREATE TABLE IF NOT EXISTS webhook_seen (provider TEXT, key TEXT, at TEXT, PRIMARY KEY (provider, key))";
import * as SCH from "./schema.js";
async function hex(s) { const b = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))); return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""); }
export function fresh(ts, now) { if (ts == null || ts === "") return { ok: true, checked: false }; let n = +ts; if (!isFinite(n) || n <= 0) return { ok: false, reason: "bad timestamp" }; if (n < 1e12) n *= 1000; const t = now || Date.now(); if (n < t - 15 * 60e3) return { ok: false, reason: "stale" }; if (n > t + 5 * 60e3) return { ok: false, reason: "future" }; return { ok: true, checked: true }; }
/* check before processing (fresh + not already processed); mark only after the delivery was processed successfully, so a provider retry
   of a delivery that failed (amount mismatch, a transient error) is still processed */
async function table(d) { await SCH.setup(d, "replay", () => d.prepare(T).run()); }
export const rdb = async (env) => { const d = env && env.XRAY_DB; if (!d) return null; await table(d); return d; };
export async function guard(env, provider, raw, ts) {
  const f = fresh(ts); if (!f.ok) return { ok: false, replay: true, reason: f.reason };
  const d = env.XRAY_DB, key = await hex(provider + "\n" + raw); if (!d) return { ok: true, key, unchecked: true };
  try { await table(d); const seen = await d.prepare("SELECT 1 x FROM webhook_seen WHERE provider=?1 AND key=?2").bind(provider, key).first(); if (seen) return { ok: false, duplicate: true, reason: "duplicate", key }; return { ok: true, key }; }
  catch (e) { return { ok: true, key, unchecked: true }; }   /* the guard never blocks a real payment because its own table failed */
}
export async function mark(env, provider, key) { const d = env.XRAY_DB; if (!d || !key) return; try { await table(d); await d.prepare("INSERT OR IGNORE INTO webhook_seen (provider, key, at) VALUES (?1, ?2, ?3)").bind(provider, key, new Date().toISOString()).run(); if (Math.random() < 0.02) await d.prepare("DELETE FROM webhook_seen WHERE at < ?1").bind(new Date(Date.now() - 14 * 864e5).toISOString()).run(); } catch (e) {} }
