/* FODO v46.1 notification preferences: every Workspace notification is always in the app (🔔); per category you choose
   email "instant", "daily" (one digest email a day) or "off". Emails are throttled (20 an hour per person) and only sent
   when the mail provider is set up. The daily digest runs from the scheduler (POST /api/monitor/tick), once a day. */
import { db as adb, nowIso, sendMail, count } from "./accounts.js";

export const CATS = [
  ["projects", "Projects", "Requests, proposals, submitted and approved work, change requests, team invitations", "instant"],
  ["payments", "Payments & refunds", "Milestones paid to FODO, refunds, billed hours, retainers", "instant"],
  ["messages", "Messages & files", "New project messages and files", "daily"],
  ["crm", "CRM follow-ups", "Follow-ups due today and overdue", "daily"],
  ["account", "Account & profile", "FODO Pro profile reviews and account notices", "instant"],
  ["news", "FODO news", "New features and offers (rare)", "off"],
];
export const MODES = ["instant", "daily", "off"];
const KIND_CAT = { request: "projects", proposal: "projects", accepted: "projects", submitted: "projects", changes: "projects", approved: "projects", cancelled: "projects", dispute: "projects", review: "projects", team: "projects", completed: "projects", change: "projects",
  funded: "payments", refund: "payments", hours: "payments", retainer: "payments", payout: "payments", message: "messages", file: "messages", moderation: "account", followup: "crm", news: "news" };
export const catOf = (kind) => KIND_CAT[kind] || "account";
const T = "CREATE TABLE IF NOT EXISTS biz_notify_prefs (user_id TEXT PRIMARY KEY, data TEXT, last_digest TEXT, updated_at TEXT)";
async function d0(env) { const d = await adb(env); await d.prepare(T).run(); return d; }
const defaults = () => Object.fromEntries(CATS.map((c) => [c[0], c[3]]));
export async function getPrefs(env, u) { const d = await d0(env), r = await d.prepare("SELECT data FROM biz_notify_prefs WHERE user_id=?1").bind(u.id).first(); let x = {}; try { x = r ? JSON.parse(r.data) : {}; } catch (e) {}
  const out = defaults(); Object.keys(out).forEach((k) => { if (MODES.indexOf(x[k]) > -1) out[k] = x[k]; }); return { prefs: out, categories: CATS.map((c) => ({ id: c[0], label: c[1], hint: c[2], default: c[3] })), mail: !!env.RESEND_API_KEY, email: u.email }; }
export async function savePrefs(env, u, b) { const cur = (await getPrefs(env, u)).prefs; CATS.forEach((c) => { if (MODES.indexOf((b || {})[c[0]]) > -1) cur[c[0]] = b[c[0]]; });
  await (await d0(env)).prepare("INSERT INTO biz_notify_prefs (user_id, data, updated_at) VALUES (?1,?2,?3) ON CONFLICT(user_id) DO UPDATE SET data=?2, updated_at=?3").bind(u.id, JSON.stringify(cur), nowIso()).run(); return getPrefs(env, u); }
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const BASE = "https://www.fodo.co.in/workspace/";
/* called by biz.notify() after the in-app note is saved */
export async function deliver(env, userId, kind, text, link) {
  if (!env.RESEND_API_KEY || !userId) return false; const d = await d0(env), u = await d.prepare("SELECT id, email, blocked, deleted_at FROM acct_users WHERE id=?1").bind(userId).first();
  if (!u || !u.email || u.blocked || u.deleted_at) return false; const { prefs } = await getPrefs(env, u); if (prefs[catOf(kind)] !== "instant") return false;
  if (await count(env, "mail:" + u.id, 20, 3600)) return false;   // a busy hour falls back to the in-app bell + digest
  const url = BASE + (/^#[\w=?&.-]{0,120}$/.test(link || "") ? link : "#notifications");
  await sendMail(env, u.email, String(text).slice(0, 120), "<p>" + esc(text) + '</p><p><a href="' + esc(url) + '">Open in FODO Workspace</a></p><p style="color:#888;font-size:12px">You get this because of your notification settings: ' + BASE + "#settings</p>", text + "\n\nOpen: " + url + "\nChange emails: " + BASE + "#settings", { kind: "notify" }).catch(() => {});
  return true;
}
/* once a day: one email per person with their "daily" categories (unread notes since the last digest + CRM follow-ups) */
export async function digest(env, limit) {
  if (!env.RESEND_API_KEY) return { sent: 0, skipped: "mail not set up" }; const d = await d0(env), today = nowIso().slice(0, 10);
  const run = await d.prepare("SELECT v FROM biz_settings WHERE k='digest_day'").first().catch(() => null); if (run && JSON.parse(run.v) === today) return { sent: 0, already: true };
  await d.prepare("INSERT OR REPLACE INTO biz_settings (k, v) VALUES ('digest_day', ?1)").bind(JSON.stringify(today)).run();
  const ids = new Set(), add = async (sql, ...a) => { try { (((await d.prepare(sql).bind(...a).all()).results) || []).forEach((r) => ids.add(r.user_id)); } catch (e) {} };
  await add("SELECT DISTINCT user_id FROM biz_notes WHERE read=0 LIMIT 2000"); await add("SELECT DISTINCT user_id FROM crm_acts WHERE kind='task' AND done=0 AND due <= ?1 LIMIT 2000", today);
  const users = []; for (const id of [...ids].slice(0, limit || 300)) { const r = await d.prepare("SELECT u.id, u.email, p.data, p.last_digest FROM acct_users u LEFT JOIN biz_notify_prefs p ON p.user_id=u.id WHERE u.id=?1 AND (u.blocked IS NULL OR u.blocked=0) AND u.deleted_at IS NULL").bind(id).first(); if (r && r.email) users.push(r); }
  let sent = 0;
  for (const u of users) { let x = {}; try { x = u.data ? JSON.parse(u.data) : {}; } catch (e) {} const prefs = Object.assign(defaults(), x), daily = Object.keys(prefs).filter((k) => prefs[k] === "daily"); if (!daily.length) continue;
    const since = u.last_digest || "0", notes = (((await d.prepare("SELECT kind, text, link, created_at FROM biz_notes WHERE user_id=?1 AND read=0 AND created_at > ?2 ORDER BY id DESC LIMIT 40").bind(u.id, since).all()).results) || []).filter((n) => daily.indexOf(catOf(n.kind)) > -1);
    let fu = []; if (daily.indexOf("crm") > -1) { try { fu = ((await d.prepare("SELECT a.body, a.due, c.name FROM crm_acts a JOIN crm_contacts c ON c.id=a.contact_id WHERE a.user_id=?1 AND a.kind='task' AND a.done=0 AND a.due <= ?2 ORDER BY a.due LIMIT 20").bind(u.id, today).all()).results) || []; } catch (e) {} }
    if (!notes.length && !fu.length) continue;
    const lines = notes.map((n) => "• " + n.text).concat(fu.map((f) => "• Follow up " + f.name + (f.due < today ? " (overdue " + f.due + ")" : " (today)") + ": " + f.body));
    await sendMail(env, u.email, "Your FODO day: " + (notes.length ? notes.length + " update" + (notes.length > 1 ? "s" : "") : "") + (notes.length && fu.length ? ", " : "") + (fu.length ? fu.length + " follow-up" + (fu.length > 1 ? "s" : "") : ""),
      "<p>" + lines.map(esc).join("<br>") + '</p><p><a href="' + BASE + '">Open FODO Workspace</a></p><p style="color:#888;font-size:12px">Daily summary from your notification settings: ' + BASE + "#settings</p>", lines.join("\n") + "\n\nOpen: " + BASE + "\nChange emails: " + BASE + "#settings", { kind: "digest" }).catch(() => {});
    await d.prepare("INSERT INTO biz_notify_prefs (user_id, data, last_digest, updated_at) VALUES (?1,?2,?3,?3) ON CONFLICT(user_id) DO UPDATE SET last_digest=?3").bind(u.id, JSON.stringify(prefs), nowIso()).run(); sent++; }
  return { sent };
}
