/* FODO OS V4 Phase 1 (v50.1): "View as" (secure, read-only impersonation). An owner (system.impersonate) starts a read-as session for one
   person: for 30 minutes every GET answers as that person would see it, every write is refused until the owner stops.
   No session is swapped and nothing escalates: the owner's own cookie stays, the mode lives in KV and in os_impersonations,
   the UI shows a banner, start and stop are audited. */
import { nowIso } from "../accounts.js";
import { osdb, one, run, clip, err, rid, ORG } from "./db.js";
import { authorize } from "./authz.js";
import { audit } from "./audit.js";

const MIN = 30, key = (uid) => "os:readas:" + uid;
export async function start(env, P, b) {
  await authorize(env, P, { resource: "system", action: "impersonate" }); if (P.impersonator) throw err("Stop the current view-as first.");
  const d = await osdb(env), target = await one(d, "SELECT id, email, name FROM acct_users WHERE id=?1 OR email=?1", clip(b.user, 120)); if (!target) throw err("No account with that id or email.", 404); if (target.id === P.user.id) throw err("That is you.");
  const reason = clip(b.reason, 200); if (!reason) throw err("Give a reason (it is written to the audit log).");
  const id = rid("im"), exp = new Date(Date.now() + MIN * 60e3).toISOString(); await run(d, "INSERT INTO os_impersonations (id, owner_user_id, target_user_id, reason, started_at, expires_at) VALUES (?1,?2,?3,?4,?5,?6)", id, P.user.id, target.id, reason, nowIso(), exp);
  await env.CHAT_KV.put(key(P.user.id), JSON.stringify({ id, target: target.id, until: exp }), { expirationTtl: MIN * 60 });
  await audit(env, P, "OWNER_IMPERSONATED_USER", { kind: "user", id: target.id }, null, { email: target.email, until: exp }, reason); return { id, target: { id: target.id, email: target.email, name: target.name || "" }, until: exp };
}
export async function stop(env, P) { const cur = await current(env, P.user); if (!cur) return { ok: true, active: false }; const d = await osdb(env); await run(d, "UPDATE os_impersonations SET ended_at=?2 WHERE id=?1", cur.id, nowIso()); await env.CHAT_KV.delete(key(P.user.id)); await audit(env, P, "OWNER_STOPPED_IMPERSONATION", { kind: "user", id: cur.target }, null, null); return { ok: true, active: false }; }
export async function current(env, u) { if (!u || !env.CHAT_KV) return null; const s = await env.CHAT_KV.get(key(u.id)); if (!s) return null; try { const o = JSON.parse(s); if (o.until < nowIso()) { await env.CHAT_KV.delete(key(u.id)); return null; } return o; } catch (e) { return null; } }
/* used by the API routers: returns { user: targetUser, by: ownerUser, until } when a read-as is active, else null */
export async function readAs(env, u) { const cur = await current(env, u); if (!cur) return null; const d = await osdb(env), t = await one(d, "SELECT * FROM acct_users WHERE id=?1", cur.target); if (!t) return null; return { user: t, by: u, until: cur.until, id: cur.id }; }
