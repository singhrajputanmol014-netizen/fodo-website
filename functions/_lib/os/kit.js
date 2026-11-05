/* FODO OS V4 Phase 7 (v50.7): small helpers shared by the Phase 7 libraries (procurement, platform, knowledge, documents, inbox,
   compliance). Settings live in biz_settings (same table the rest of FODO uses); numbers are per-month counters (PO-2611-0001). */
import { nowIso, OWNER_EMAILS } from "../accounts.js";
import { one, all, run, J, ORG } from "./db.js";

export const today = () => nowIso().slice(0, 10);
export const addDays = (day, n) => new Date(new Date(day + "T00:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);
export const setting = async (d, k, dflt) => { const r = await one(d, "SELECT v FROM biz_settings WHERE k=?1", k); return r ? J(r.v, dflt) : dflt; };
export const settingSet = (d, k, v) => run(d, "INSERT OR REPLACE INTO biz_settings (k, v) VALUES (?1,?2)", k, JSON.stringify(v));
/* next free number like PO-2611-0007 in table.col */
export async function numberFor(d, table, col, prefix) {
  const now = nowIso(), pre = prefix + "-" + now.slice(2, 4) + now.slice(5, 7) + "-", n = ((await one(d, "SELECT count(*) n FROM " + table + " WHERE " + col + " LIKE ?1", pre + "%")) || {}).n || 0;
  for (let k = 1; k < 50; k++) { const num = pre + String(n + k).padStart(4, "0"); if (!(await one(d, "SELECT 1 x FROM " + table + " WHERE " + col + "=?1", num))) return num; }
  return pre + Date.now().toString(36).toUpperCase();
}
/* SQL filter for a scope on a user column (own → mine; team → mine + my reports; department → my department; organization/all → everything) */
export function scopeWhere(P, scope, col, args) {
  if (scope === "all" || scope === "organization") return "1=1";
  if (scope === "department") { args.push(P.dept || "-"); return col + " IN (SELECT user_id FROM os_members WHERE department_id=?" + args.length + " AND org_id='" + ORG + "')"; }
  if (scope === "team") { args.push(P.user.id); return "(" + col + "=?" + args.length + " OR " + col + " IN (SELECT user_id FROM os_members WHERE manager_user_id=?" + args.length + " AND org_id='" + ORG + "'))"; }
  args.push(P.user.id); return col + "=?" + args.length;
}
/* active members holding one of the role templates (by slug) */
export const holders = async (d, slugs, lim) => (await all(d, "SELECT DISTINCT m.user_id FROM os_members m JOIN os_member_roles mr ON mr.member_id=m.id JOIN os_roles r ON r.id=mr.role_id WHERE r.slug IN (" + slugs.map((s) => "'" + s.replace(/[^a-z_]/g, "") + "'").join(",") + ") AND m.org_id=?1 AND m.status='active' AND m.user_id IS NOT NULL LIMIT " + (lim || 8), ORG)).map((x) => x.user_id);
export async function ownerIds(d) { const out = []; for (const e of OWNER_EMAILS) { const o = await one(d, "SELECT id FROM acct_users WHERE email=?1", e); if (o) out.push(o.id); } return out; }
export const nameOf = (col) => "(SELECT name FROM os_members m WHERE m.user_id=" + col + " AND m.org_id='" + ORG + "')";
/* the people a member reports up to, nearest first: manager, department manager, operations manager, owners */
export async function chainOf(d, userId) {
  const me = await one(d, "SELECT user_id, manager_user_id, department_id FROM os_members WHERE user_id=?1 AND org_id=?2", userId, ORG), out = [];
  if (me && me.manager_user_id) out.push(me.manager_user_id);
  if (me && me.department_id) { const dp = await one(d, "SELECT manager_user_id FROM os_departments WHERE id=?1", me.department_id); if (dp && dp.manager_user_id) out.push(dp.manager_user_id); }
  const ops = await one(d, "SELECT manager_user_id FROM os_departments WHERE org_id=?1 AND slug='operations'", ORG); if (ops && ops.manager_user_id) out.push(ops.manager_user_id);
  for (const o of await ownerIds(d)) out.push(o);
  const active = []; for (const u of out) { if (!u || u === userId || active.indexOf(u) > -1) continue; if (await one(d, "SELECT 1 x FROM os_members WHERE user_id=?1 AND org_id=?2 AND status='active'", u, ORG)) active.push(u); } return active;
}
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/* card / account numbers never go into free-text fields of these modules */
export const looksLikeAccountNo = (s) => /\d[\d\s-]{10,}\d/.test(String(s || "").replace(/(^|[^\d+])(\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?![\d])/g, "$1"));
