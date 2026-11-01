/* FODO v46.1 admin analytics: the whole business on one page, computed from the real tables only. A part whose table
   doesn't exist yet shows 0 / "not used yet", never an estimate. Owners, admins, finance and viewers. */
import { db as adb, nowIso } from "./accounts.js";
import { err, can } from "./biz.js";

const one = async (d, sql, ...a) => { try { return (await d.prepare(sql).bind(...a).first()) || {}; } catch (e) { return {}; } };
const all = async (d, sql, ...a) => { try { return (await d.prepare(sql).bind(...a).all()).results || []; } catch (e) { return []; } };
const N = (x, k) => Math.round(+((x || {})[k || "n"]) || 0);
const ago = (days) => new Date(Date.now() - days * 864e5).toISOString();
/* a 30-day series with every day present (0 when nothing happened) */
function series(rows, days) { const by = {}; rows.forEach((r) => { by[r.day] = +r.n || 0; }); const out = []; for (let i = days - 1; i >= 0; i--) { const k = ago(i).slice(0, 10); out.push({ day: k, n: by[k] || 0 }); } return out; }

export async function analytics(env, R) {
  if (!can(R, ["admin", "finance", "viewer"])) throw err("Not allowed.", 403);
  const d = await adb(env), d30 = ago(30), d7 = ago(7), now = nowIso(), live = "u.deleted_at IS NULL AND u.email NOT LIKE 'deleted+%'";
  const users = { total: N(await one(d, "SELECT count(*) n FROM acct_users u WHERE " + live)), new7: N(await one(d, "SELECT count(*) n FROM acct_users u WHERE " + live + " AND created_at >= ?1", d7)), new30: N(await one(d, "SELECT count(*) n FROM acct_users u WHERE " + live + " AND created_at >= ?1", d30)),
    active7: N(await one(d, "SELECT count(*) n FROM acct_users u WHERE " + live + " AND last_login >= ?1", d7)), paying: N(await one(d, "SELECT count(*) n FROM acct_users u WHERE " + live + " AND plan != 'free' AND plan_until > ?1", now)), deleted: N(await one(d, "SELECT count(*) n FROM acct_users WHERE deleted_at IS NOT NULL")) };
  const byKind = await all(d, "SELECT kind, count(*) n, COALESCE(sum(amount),0) amt FROM acct_orders WHERE status='PAID' AND paid_at >= ?1 GROUP BY kind ORDER BY amt DESC", d30);
  const revenue = { last30: Math.round(byKind.reduce((a, x) => a + (+x.amt || 0), 0)), orders30: byKind.reduce((a, x) => a + x.n, 0), byKind: byKind.map((x) => ({ kind: x.kind, orders: x.n, amount: Math.round(+x.amt || 0) })), allTime: Math.round(N(await one(d, "SELECT COALESCE(sum(amount),0) n FROM acct_orders WHERE status='PAID'"))) };
  const market = { gmv30: N(await one(d, "SELECT COALESCE(sum(amount),0) n FROM biz_milestones WHERE funded_at >= ?1", d30)), held: N(await one(d, "SELECT COALESCE(sum(amount),0) n FROM biz_milestones WHERE status IN ('funded','submitted','refund_processing')")),
    commission30: N(await one(d, "SELECT COALESCE(sum(commission),0) n FROM biz_payouts WHERE created_at >= ?1", d30)), owed: N(await one(d, "SELECT COALESCE(sum(net),0) n FROM biz_payouts WHERE status != 'paid'")),
    refunds30: N(await one(d, "SELECT COALESCE(sum(amount),0) n FROM biz_refunds WHERE created_at >= ?1 AND status IN ('processing','refunded','needs_manual')", d30)), refundsOpen: N(await one(d, "SELECT count(*) n FROM biz_refunds WHERE status IN ('requested','processing','needs_manual')")),
    projectsNew30: N(await one(d, "SELECT count(*) n FROM biz_projects WHERE created_at >= ?1", d30)), projects: Object.fromEntries((await all(d, "SELECT status, count(*) n FROM biz_projects GROUP BY status")).map((x) => [x.status, x.n])),
    pros: Object.fromEntries((await all(d, "SELECT status, count(*) n FROM biz_pros GROUP BY status")).map((x) => [x.status, x.n])) };
  const builder = { sites: N(await one(d, "SELECT count(*) n FROM sites WHERE deleted_at IS NULL")), live: N(await one(d, "SELECT count(*) n FROM sites WHERE deleted_at IS NULL AND status='live'")), new30: N(await one(d, "SELECT count(*) n FROM sites WHERE created_at >= ?1", d30)), leads30: N(await one(d, "SELECT count(*) n FROM site_forms WHERE created_at >= ?1", d30)) };
  const tools = { xrays30: N(await one(d, "SELECT count(*) n FROM acct_runs WHERE created_at >= ?1", d30)), crmUsers: N(await one(d, "SELECT count(DISTINCT user_id) n FROM crm_contacts")), crmContacts: N(await one(d, "SELECT count(*) n FROM crm_contacts")),
    crmOpenDeals: N(await one(d, "SELECT COALESCE(sum(value),0) n FROM crm_deals WHERE stage NOT IN ('won','lost')")), studioToday: N(await one(d, "SELECT COALESCE(sum(n),0) n FROM acct_counters WHERE k LIKE 'studio:%' AND exp > ?1", Date.now())),
    files: N(await one(d, "SELECT count(*) n FROM biz_files WHERE deleted_at IS NULL")), fileBytes: N(await one(d, "SELECT COALESCE(sum(size),0) n FROM biz_files WHERE deleted_at IS NULL")) };
  /* funnel: of the people who signed up in the last 30 days, how many used something and how many paid */
  const funnel = { signedUp: users.new30, usedSomething: N(await one(d, "SELECT count(*) n FROM acct_users u WHERE u.created_at >= ?1 AND " + live + " AND (u.id IN (SELECT user_id FROM acct_runs) OR u.id IN (SELECT owner_user_id FROM sites) OR u.id IN (SELECT user_id FROM biz_content) OR u.id IN (SELECT client_id FROM biz_projects))", d30)),
    paid: N(await one(d, "SELECT count(DISTINCT o.user_id) n FROM acct_orders o JOIN acct_users u ON u.id=o.user_id WHERE o.status='PAID' AND u.created_at >= ?1", d30)) };
  if (!funnel.usedSomething) funnel.usedSomething = N(await one(d, "SELECT count(*) n FROM acct_users u WHERE u.created_at >= ?1 AND " + live + " AND u.id IN (SELECT user_id FROM acct_runs)", d30));
  const trend = { signups: series(await all(d, "SELECT substr(created_at,1,10) day, count(*) n FROM acct_users WHERE created_at >= ?1 GROUP BY day", d30), 30), revenue: series(await all(d, "SELECT substr(paid_at,1,10) day, sum(amount) n FROM acct_orders WHERE status='PAID' AND paid_at >= ?1 GROUP BY day", d30), 30),
    gmv: series(await all(d, "SELECT substr(funded_at,1,10) day, sum(amount) n FROM biz_milestones WHERE funded_at >= ?1 GROUP BY day", d30), 30) };
  return { generatedAt: now, users, revenue, market, builder, tools, funnel, trend };
}
