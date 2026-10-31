/* FODO BRAIN — who may use the Brain. The two owner logins (OWNER_EMAILS) always have everything. Owners can give anyone with a
   FODO login FULL or LIMITED access; only owners can add, change or remove people. Checked on the server for every request and
   every tool call — the browser only hides what the server already refuses.
   FULL    = everything an owner can do with the Brain EXCEPT managing access, connecting/disconnecting accounts, Brain settings,
             the full export and the owner's PERSONAL memories.
   LIMITED = only the areas ticked below. Secrets (level 5) are never available to anyone. */
import { brainDb, nowIso, clip, clean } from "./store.js";
import { isOwner, cleanEmail } from "../accounts.js";

export const PERMS = {
  chat: "Talk to the Brain (answers, research, drafts)",
  business: "Business numbers (users, revenue, X-Rays, leads, costs, alerts)",
  tasks: "Tasks & commitments",
  memory: "FODO memory & knowledge documents",
  social: "Social media (post & see numbers)",
  data: "Analytics, YouTube, Drive, Sheets, Cashfree data",
  inbox: "Email inbox & calendar (read and send — every send is confirmed)",
  changes: "Prepare website changes (pull requests + previews)",
  deploy: "Put website changes LIVE",
  admin: "Admin actions (grant plans, switch features, reply to tickets, block users)",
  automations: "Automations",
};
export const OWNER_ONLY = ["access", "connectors", "settings", "export", "personal"];
/* which permission a tool needs */
const CAT = { Business: "business", "Growth Lab": "business", Clients: "business", "X-Ray": "business", System: "chat", Memory: "memory", Tasks: "tasks", Research: "chat", Write: "chat", Automation: "automations", Code: "changes", Email: "inbox", Calendar: "inbox", Social: "social", Data: "data", Interface: "chat" };
export function permFor(name, t) {
  if (name === "merge_change") return "deploy";
  if (name === "send_email") return "inbox";
  if (["grant_plan", "switch_feature", "change_price", "block_user", "reply_ticket"].indexOf(name) > -1) return "admin";
  if (name === "start_xray") return "business";
  return CAT[t.cat] || "chat";
}
export async function members(env) { const d = await brainDb(env); return ((await d.prepare("SELECT * FROM brain_members ORDER BY added_at").all()).results || []).map((m) => Object.assign(m, { perms: JSON.parse(m.perms || "[]") })); }
/* the Brain identity for a logged-in site user: owner, member (with perms) or null */
export async function who(env, u) {
  if (!u) return null;
  if (isOwner(u)) return { email: u.email, name: u.name || "", role: "owner", perms: Object.keys(PERMS), owner: true };
  const d = await brainDb(env), m = await d.prepare("SELECT * FROM brain_members WHERE email=?1").bind(String(u.email || "").toLowerCase()).first();
  if (!m) return null;
  d.prepare("UPDATE brain_members SET last_seen=?2 WHERE email=?1").bind(m.email, nowIso()).run().catch(() => {});
  const perms = m.role === "full" ? Object.keys(PERMS) : JSON.parse(m.perms || "[]").filter((p) => PERMS[p]);
  return { email: u.email, name: u.name || "", role: m.role, perms, owner: false };
}
export const can = (W, perm) => !!(W && (W.owner || W.perms.indexOf(perm) > -1));
export async function save(env, by, m) {
  const email = cleanEmail(m.email); if (!email) throw new Error("Enter a valid email address.");
  if (isOwner({ email })) throw new Error("Owners already have full access.");
  const role = m.role === "full" ? "full" : "limited", perms = role === "full" ? [] : [].concat(m.perms || []).filter((p) => PERMS[p]);
  if (role === "limited" && !perms.length) throw new Error("Tick at least one area for limited access.");
  const d = await brainDb(env);
  await d.prepare("INSERT INTO brain_members (email, role, perms, note, added_by, added_at) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(email) DO UPDATE SET role=?2, perms=?3, note=?4").bind(email, role, JSON.stringify(perms), clip(clean(m.note, 120), 120), by, nowIso()).run();
  return { email, role, perms };
}
export async function remove(env, email) { const d = await brainDb(env); const r = await d.prepare("DELETE FROM brain_members WHERE email=?1").bind(String(email || "").toLowerCase()).run(); return { removed: !!(r.meta && r.meta.changes) }; }
