/* FODO v47.6 organizations: a company account that several people share.
   - One person creates the organization and is its owner; they invite colleagues by email (the colleague must have, or make,
     a FODO account with that email). Roles: owner, admin, member. A person is in at most one organization.
   - What sharing means (and nothing more): members can SEE each other's quotes, contracts, invoices and projects in the
     organization (read-only). Accepting a quote, signing a contract, paying or messaging stays with the person who owns it.
     Admins and the owner can also act on a colleague's quote / contract (accept, sign) when "actOnBehalf" is switched on.
   - The organization's billing profile (legal name, GSTIN, address) is what quotes, contracts and invoices show for its members.
   - Tenant isolation is still per record: every check here is server-side, and nothing outside the organization is visible. */
import { nowIso, randId, sendMail, cleanEmail } from "./accounts.js";
import { bdb, err, auditLog, notify } from "./biz.js";

const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const all = async (d, sql, ...a) => (await d.prepare(sql).bind(...a).all()).results || [];
const one = (d, sql, ...a) => d.prepare(sql).bind(...a).first();
const run = (d, sql, ...a) => d.prepare(sql).bind(...a).run();
const DDL = ["CREATE TABLE IF NOT EXISTS biz_orgs (id TEXT PRIMARY KEY, name TEXT, legal_name TEXT, gstin TEXT, address TEXT, website TEXT, act_on_behalf INTEGER DEFAULT 0, created_by TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS biz_org_members (org_id TEXT, email TEXT, user_id TEXT, role TEXT, status TEXT, invited_by TEXT, invited_at TEXT, joined_at TEXT, PRIMARY KEY (org_id, email))",
  "CREATE UNIQUE INDEX IF NOT EXISTS biz_org_members_u ON biz_org_members(user_id) WHERE user_id IS NOT NULL AND status='active'",
  "CREATE INDEX IF NOT EXISTS biz_org_members_e ON biz_org_members(email, status)"];
const ready = new WeakSet();
export async function odb(env) { const d = await bdb(env); if (!ready.has(d)) { for (const q of DDL) await d.prepare(q).run(); ready.add(d); } return d; }
export const ROLES = ["owner", "admin", "member"];
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/* the organization a person belongs to (active membership), or null */
export async function orgOf(env, u) { const d = await odb(env); return one(d, "SELECT o.*, m.role FROM biz_org_members m JOIN biz_orgs o ON o.id=m.org_id WHERE m.user_id=?1 AND m.status='active'", u.id); }
/* user ids whose records this person may READ: themselves + active colleagues */
export async function peersOf(env, u) { const d = await odb(env), me = await one(d, "SELECT org_id FROM biz_org_members WHERE user_id=?1 AND status='active'", u.id); if (!me) return [u.id]; return (await all(d, "SELECT user_id FROM biz_org_members WHERE org_id=?1 AND status='active' AND user_id IS NOT NULL", me.org_id)).map((x) => x.user_id); }
/* may this person ACT (accept / sign / pay) on a record owned by ownerId? Themselves always; an org owner / admin when the org allows it */
export async function mayAct(env, u, ownerId) { if (ownerId === u.id) return true; const d = await odb(env), me = await one(d, "SELECT m.org_id, m.role, o.act_on_behalf FROM biz_org_members m JOIN biz_orgs o ON o.id=m.org_id WHERE m.user_id=?1 AND m.status='active'", u.id); if (!me || !me.act_on_behalf || me.role === "member") return false; return !!(await one(d, "SELECT 1 x FROM biz_org_members WHERE org_id=?1 AND user_id=?2 AND status='active'", me.org_id, ownerId)); }
/* the billing block shown on quotes / contracts / invoices for a person (their org's, or none) */
export async function billingOf(env, userId) { const d = await odb(env), o = await one(d, "SELECT o.name, o.legal_name, o.gstin, o.address FROM biz_org_members m JOIN biz_orgs o ON o.id=m.org_id WHERE m.user_id=?1 AND m.status='active'", userId); return o ? { name: o.name, legalName: o.legal_name || o.name, gstin: o.gstin || "", address: o.address || "" } : null; }

export async function myOrg(env, u) {
  const d = await odb(env), o = await orgOf(env, u);
  const pending = await all(d, "SELECT o.id, o.name, m.invited_by, m.invited_at FROM biz_org_members m JOIN biz_orgs o ON o.id=m.org_id WHERE lower(m.email)=?1 AND m.status='invited'", String(u.email || "").toLowerCase());
  if (!o) return { org: null, invitations: pending };
  const members = await all(d, "SELECT m.email, m.role, m.status, m.invited_at, m.joined_at, u.name FROM biz_org_members m LEFT JOIN acct_users u ON u.id=m.user_id WHERE m.org_id=?1 ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, m.joined_at", o.id);
  return { org: { id: o.id, name: o.name, legalName: o.legal_name || "", gstin: o.gstin || "", address: o.address || "", website: o.website || "", actOnBehalf: !!o.act_on_behalf, myRole: o.role, createdAt: o.created_at }, members, invitations: pending, canManage: o.role !== "member" };
}
export async function createOrg(env, u, b) {
  const d = await odb(env), name = clip((b || {}).name, 80); if (name.length < 2) throw err("Give the organization a name.");
  if (await orgOf(env, u)) throw err("You're already in an organization. Leave it first.", 409);
  const id = "org" + randId(14), now = nowIso(); await run(d, "INSERT INTO biz_orgs (id, name, created_by, created_at, updated_at) VALUES (?1,?2,?3,?4,?4)", id, name, u.id, now);
  await run(d, "INSERT INTO biz_org_members (org_id, email, user_id, role, status, invited_by, invited_at, joined_at) VALUES (?1,?2,?3,'owner','active',?3,?4,?4)", id, String(u.email).toLowerCase(), u.id, now);
  await auditLog(env, u.email, "org:create", id, name); if (b && (b.legalName || b.gstin || b.address || b.website)) await saveOrg(env, u, b); return myOrg(env, u);
}
export async function saveOrg(env, u, b) {
  const d = await odb(env), o = await orgOf(env, u); if (!o) throw err("No organization yet.", 404); if (o.role === "member") throw err("Only the organization's owner or admins change its details.", 403);
  b = b || {}; const gst = clip(b.gstin, 15).toUpperCase(); if (gst && !GSTIN.test(gst)) throw err("That GSTIN doesn't look right (15 characters, e.g. 07ABCDE1234F1Z5).");
  const web = clip(b.website, 200); if (web && !/^https:\/\/[^\s]+\.[^\s]+$/i.test(web)) throw err("Website must start with https://");
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k), act = has("actOnBehalf") && o.role === "owner" ? (b.actOnBehalf ? 1 : 0) : o.act_on_behalf;   /* only the owner switches act-on-behalf; fields not sent stay as they are */
  await run(d, "UPDATE biz_orgs SET name=COALESCE(NULLIF(?2,''), name), legal_name=?3, gstin=?4, address=?5, website=?6, act_on_behalf=?7, updated_at=?8 WHERE id=?1", o.id, clip(b.name, 80), has("legalName") ? clip(b.legalName, 120) || null : o.legal_name, has("gstin") ? gst || null : o.gstin, has("address") ? clip(b.address, 300) || null : o.address, has("website") ? web || null : o.website, act, nowIso());
  await auditLog(env, u.email, "org:update", o.id, (has("actOnBehalf") && o.role === "owner" ? "actOnBehalf=" + !!b.actOnBehalf + " " : "") + (gst ? "gstin set" : "")); return myOrg(env, u);
}
export async function invite(env, u, b, origin) {
  const d = await odb(env), o = await orgOf(env, u); if (!o) throw err("Create your organization first.", 404); if (o.role === "member") throw err("Only the owner or admins invite people.", 403);
  const email = cleanEmail((b || {}).email); if (!email) throw err("Enter a valid email."); const role = (b || {}).role === "admin" ? "admin" : "member";
  if (((await one(d, "SELECT count(*) n FROM biz_org_members WHERE org_id=?1", o.id)) || {}).n >= 50) throw err("Up to 50 people per organization.");
  const ex = await one(d, "SELECT status FROM biz_org_members WHERE org_id=?1 AND email=?2", o.id, email); if (ex && ex.status === "active") throw err(email + " is already a member.", 409);
  const other = await one(d, "SELECT 1 x FROM biz_org_members m WHERE lower(m.email)=?1 AND m.status='active' AND m.org_id != ?2", email, o.id); if (other) throw err(email + " already belongs to another organization.", 409);
  const now = nowIso(); await run(d, "INSERT OR REPLACE INTO biz_org_members (org_id, email, user_id, role, status, invited_by, invited_at, joined_at) VALUES (?1,?2,NULL,?3,'invited',?4,?5,NULL)", o.id, email, role, u.email, now);
  const usr = await one(d, "SELECT id FROM acct_users WHERE email=?1", email); if (usr) await notify(env, usr.id, "org", u.email + " invited you to join " + o.name + " on FODO.", "#settings");
  await sendMail(env, email, u.email + " invited you to " + o.name + " on FODO", "<p>" + clip(u.email, 120) + " invited you to join <b>" + clip(o.name, 80).replace(/[<>&]/g, "") + "</b> on FODO as " + role + ".</p><p>Log in with this email and accept it under Workspace → Settings → Organization.</p><p><a href=\"" + (origin || "https://www.fodo.co.in") + "/workspace/#settings\">Open FODO</a></p>", "Log in with this email and accept the invitation under Workspace → Settings → Organization: " + (origin || "https://www.fodo.co.in") + "/workspace/#settings", { kind: "org" }).catch(() => {});
  await auditLog(env, u.email, "org:invite", o.id, email + " " + role); return myOrg(env, u);
}
export async function answer(env, u, orgId, accept) {
  const d = await odb(env), email = String(u.email || "").toLowerCase(), m = await one(d, "SELECT * FROM biz_org_members WHERE org_id=?1 AND lower(email)=?2 AND status='invited'", clip(orgId, 40), email); if (!m) throw err("No invitation found for " + email + ".", 404);
  if (!accept) { await run(d, "DELETE FROM biz_org_members WHERE org_id=?1 AND email=?2", m.org_id, m.email); await auditLog(env, u.email, "org:decline", m.org_id); return myOrg(env, u); }
  if (await orgOf(env, u)) throw err("You're already in an organization. Leave it before joining another.", 409);
  await run(d, "UPDATE biz_org_members SET user_id=?3, status='active', joined_at=?4 WHERE org_id=?1 AND email=?2", m.org_id, m.email, u.id, nowIso()); await auditLog(env, u.email, "org:join", m.org_id);
  const o = await one(d, "SELECT created_by, name FROM biz_orgs WHERE id=?1", m.org_id); if (o) await notify(env, o.created_by, "org", u.email + " joined " + o.name + ".", "#settings"); return myOrg(env, u);
}
export async function setMember(env, u, b) {
  const d = await odb(env), o = await orgOf(env, u); if (!o) throw err("No organization.", 404); if (o.role === "member") throw err("Only the owner or admins manage members.", 403);
  const email = cleanEmail((b || {}).email), m = email && await one(d, "SELECT * FROM biz_org_members WHERE org_id=?1 AND email=?2", o.id, email); if (!m) throw err("Not a member.", 404);
  if (m.role === "owner") throw err("The owner can't be changed here. Transfer ownership first.", 409);
  if (b.remove) { await run(d, "DELETE FROM biz_org_members WHERE org_id=?1 AND email=?2", o.id, email); await auditLog(env, u.email, "org:remove", o.id, email); if (m.user_id) await notify(env, m.user_id, "org", "You were removed from " + o.name + ".", "#settings"); }
  else { if (o.role !== "owner") throw err("Only the owner changes roles.", 403); const role = b.role === "admin" ? "admin" : "member"; await run(d, "UPDATE biz_org_members SET role=?3 WHERE org_id=?1 AND email=?2", o.id, email, role); await auditLog(env, u.email, "org:role", o.id, email + " " + role); }
  return myOrg(env, u);
}
export async function transfer(env, u, b) {
  const d = await odb(env), o = await orgOf(env, u); if (!o || o.role !== "owner") throw err("Only the owner transfers ownership.", 403);
  const email = cleanEmail((b || {}).email), m = email && await one(d, "SELECT * FROM biz_org_members WHERE org_id=?1 AND email=?2 AND status='active'", o.id, email); if (!m) throw err("Pick an active member.", 404);
  await run(d, "UPDATE biz_org_members SET role='admin' WHERE org_id=?1 AND user_id=?2", o.id, u.id); await run(d, "UPDATE biz_org_members SET role='owner' WHERE org_id=?1 AND email=?2", o.id, email); await auditLog(env, u.email, "org:transfer", o.id, email); return myOrg(env, u);
}
export async function leave(env, u) {
  const d = await odb(env), o = await orgOf(env, u); if (!o) throw err("No organization.", 404);
  if (o.role === "owner") { const others = ((await one(d, "SELECT count(*) n FROM biz_org_members WHERE org_id=?1 AND status='active' AND user_id != ?2", o.id, u.id)) || {}).n; if (others) throw err("Transfer ownership to someone else before leaving.", 409); await run(d, "DELETE FROM biz_org_members WHERE org_id=?1", o.id); await run(d, "DELETE FROM biz_orgs WHERE id=?1", o.id); await auditLog(env, u.email, "org:delete", o.id, o.name); return { org: null, invitations: [] }; }
  await run(d, "DELETE FROM biz_org_members WHERE org_id=?1 AND user_id=?2", o.id, u.id); await auditLog(env, u.email, "org:leave", o.id); return myOrg(env, u);
}
/* what colleagues see: the organization's quotes, contracts, invoices and projects (lists only; each record checks again on open) */
export async function shared(env, u) {
  const d = await odb(env), o = await orgOf(env, u); if (!o) return { org: null, quotes: [], contracts: [], invoices: [], projects: [] };
  const ids = await peersOf(env, u), ph = ids.map((_, i) => "?" + (i + 1)).join(","), who = "LEFT JOIN acct_users u ON u.id=x.client_id";
  const quotes = await all(d, "SELECT x.id, x.number, x.title, x.status, x.updated_at, u.email owner, v.total FROM biz_quotes x " + who + " LEFT JOIN biz_quote_versions v ON v.quote_id=x.id AND v.version=COALESCE(x.sent_version, 1) WHERE x.client_id IN (" + ph + ") AND (x.sent_version IS NOT NULL OR x.status='requested') ORDER BY x.updated_at DESC LIMIT 100", ...ids).catch(() => []);
  const contracts = await all(d, "SELECT x.id, x.number, x.title, x.status, x.updated_at, u.email owner FROM biz_contracts x " + who + " WHERE x.client_id IN (" + ph + ") AND x.sent_version IS NOT NULL ORDER BY x.updated_at DESC LIMIT 100", ...ids).catch(() => []);
  const invoices = await all(d, "SELECT x.id, x.number, x.kind, x.title, x.total, x.status, x.issue_date, u.email owner FROM biz_invoices x " + who + " WHERE x.client_id IN (" + ph + ") ORDER BY x.created_at DESC LIMIT 200", ...ids).catch(() => []);
  const projects = await all(d, "SELECT x.id, x.title, x.status, x.updated_at, u.email owner FROM biz_projects x " + who + " WHERE x.client_id IN (" + ph + ") ORDER BY x.updated_at DESC LIMIT 100", ...ids);
  return { org: { id: o.id, name: o.name, myRole: o.role, actOnBehalf: !!o.act_on_behalf }, quotes, contracts, invoices, projects, members: ids.length };
}
