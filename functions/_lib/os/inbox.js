/* FODO OS V4 Phase 7 (v50.7): unified inbox v1.
   One list of conversations that need a person: support tickets (website, email and, when WhatsApp is configured, WhatsApp, which
   all land in the help desk) plus, for owners, Gmail read through the Brain's Google connector (read-only, nothing is sent from
   here). Each conversation can be assigned, turned into a task (linked both ways), snoozed or marked done; that state is FODO's own
   (os_inbox_state) and never changes the mailbox. Sources that are not connected say so. */
import { nowIso } from "../accounts.js";
import * as HP from "../help.js";
import { osdb, one, all, run, clip, err, DAY, ORG } from "./db.js";
import { has, allows } from "./authz.js";
import { audit, emit } from "./audit.js";
import { scopeWhere, nameOf } from "./kit.js";

const DDL = ["CREATE TABLE IF NOT EXISTS os_inbox_state (source TEXT, ref TEXT, status TEXT, assignee_user_id TEXT, task_id TEXT, snooze_until TEXT, title TEXT, updated_by TEXT, updated_at TEXT, PRIMARY KEY (source, ref))"];
const made = new WeakSet();
export async function idb(env) { await HP.hdb(env); const d = await osdb(env); if (!made.has(d)) { for (const q of DDL) await d.prepare(q).run(); made.add(d); } return d; }
const waOn = (env) => !!(env.WA_NUMBER && env.WA_TOKEN && env.WA_PHONE_ID && env.WA_APP_SECRET);
const gmailFor = (P) => P.isOwner;

export async function list(env, P, q) {
  const s = allows(P, "inbox", "view"); if (!s) throw err("You don't have access to the inbox.", 403); const d = await idb(env), now = nowIso(), box = (q && q.box) || "open", items = [], sources = [];
  /* 1. help desk tickets */
  const args = [], W = ["t.status IN ('open','pending')"]; if (s !== "organization" && s !== "all") W.push("(" + scopeWhere(P, s, "t.assignee_user_id", args) + (s === "team" || s === "department" ? " OR t.assignee_user_id IS NULL" : "") + ")");
  const tickets = await all(d, "SELECT t.id, t.subject, t.status, t.priority, t.channel, t.email, t.name, t.assignee_user_id, " + nameOf("t.assignee_user_id") + " AS assignee, t.updated_at, t.sla_due, t.first_reply_at, t.last_from FROM help_tickets t WHERE " + W.join(" AND ") + " ORDER BY t.updated_at DESC LIMIT 200", ...args);
  for (const t of tickets) items.push({ source: t.channel === "whatsapp" ? "whatsapp" : "support", ref: t.id, title: t.subject || "(no subject)", from: t.name ? t.name + " <" + (t.email || "") + ">" : t.email || "", at: t.updated_at, priority: t.priority, waiting: t.last_from === "user" || t.last_from === "customer", breached: !!(t.sla_due && t.sla_due < now && !t.first_reply_at), assignee_user_id: t.assignee_user_id, assignee: t.assignee, href: "#support?id=" + t.id });
  sources.push({ id: "support", name: "Support tickets", status: "connected", count: tickets.length }); sources.push({ id: "whatsapp", name: "WhatsApp", status: waOn(env) ? "connected (arrives as support tickets)" : "not configured" });
  /* 2. Gmail through the Brain connector (owners) */
  if (gmailFor(P)) { let st = "not connected", n = 0; try { const G = await import("../brain/google.js"); if (G.googleOn(env) && (await G.accounts(env)).some((a) => String(a.scopes || "").indexOf("gmail.readonly") > -1)) { const mails = await G.emailSearch(env, clip(q && q.gmail_q, 120) || "in:inbox newer_than:7d", null); for (const m of mails) { if (!m.id) continue; items.push({ source: "gmail", ref: m.account + ":" + m.id, title: m.subject || "(no subject)", from: m.from || "", at: m.date ? new Date(m.date).toISOString() : null, snippet: m.snippet, unread: m.unread, account: m.account, href: null }); n++; } st = "connected"; } } catch (e) { st = "error: " + clip(e && e.message, 120); }
    sources.push({ id: "gmail", name: "Gmail (owner Brain connector)", status: st, count: n }); }
  /* FODO's own state on top */
  const state = {}; for (const r of await all(d, "SELECT s.*, " + nameOf("s.assignee_user_id") + " AS assignee FROM os_inbox_state s")) state[r.source + "|" + r.ref] = r;
  const out = items.map((x) => { const st = state[(x.source === "whatsapp" ? "support" : x.source) + "|" + x.ref]; if (st) { x.state = st.status; x.task_id = st.task_id; x.snooze_until = st.snooze_until; if (st.assignee_user_id && x.source === "gmail") { x.assignee_user_id = st.assignee_user_id; x.assignee = st.assignee; } } else x.state = "open"; if (x.state === "snoozed" && x.snooze_until && x.snooze_until <= now.slice(0, 10)) x.state = "open"; return x; })
    .filter((x) => box === "all" ? true : box === "mine" ? x.assignee_user_id === P.user.id && x.state === "open" : box === "done" ? x.state === "done" : x.state === "open").sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  return { items: out, sources, canManage: has(P, "inbox", "manage", "own") };
}
const keyOf = (source) => (source === "whatsapp" ? "support" : source);
async function check(env, P, d, source, ref) {
  if (["support", "whatsapp", "gmail"].indexOf(source) < 0) throw err("Unknown source."); if (!has(P, "inbox", "manage", "own")) throw err("You can't act on inbox items.", 403);
  if (source === "gmail") { if (!gmailFor(P)) throw err("Gmail items are the owner's.", 403); return { title: null }; }
  const t = await one(d, "SELECT id, subject, assignee_user_id FROM help_tickets WHERE id=?1", clip(ref, 60)); if (!t) throw err("Not found.", 404);
  const s = allows(P, "inbox", "manage"); if (!(s === "organization" || s === "all" || t.assignee_user_id === P.user.id || (!t.assignee_user_id && (s === "team" || s === "department")) || (s === "team" && t.assignee_user_id && await one(d, "SELECT 1 x FROM os_members WHERE user_id=?1 AND manager_user_id=?2", t.assignee_user_id, P.user.id)) || (s === "department" && t.assignee_user_id && await one(d, "SELECT 1 x FROM os_members WHERE user_id=?1 AND department_id=?2", t.assignee_user_id, P.dept || "-")))) throw err("This conversation is someone else's.", 403);
  return { title: t.subject };
}
async function put(d, P, source, ref, o) { const k = keyOf(source), cur = await one(d, "SELECT * FROM os_inbox_state WHERE source=?1 AND ref=?2", k, ref) || {}; const n = Object.assign({ status: cur.status || "open", assignee_user_id: cur.assignee_user_id || null, task_id: cur.task_id || null, snooze_until: cur.snooze_until || null, title: cur.title || null }, o);
  await run(d, "INSERT OR REPLACE INTO os_inbox_state (source, ref, status, assignee_user_id, task_id, snooze_until, title, updated_by, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)", k, ref, n.status, n.assignee_user_id, n.task_id, n.snooze_until, n.title, P.user.id, nowIso()); return n; }
export async function act(env, P, b) {
  const d = await idb(env), source = clip(b.source, 12), ref = clip(b.ref, 160), what = clip(b.action, 12), c = await check(env, P, d, source, ref), title = c.title || clip(b.title, 200) || "Conversation";
  if (what === "assign") { const to = clip(b.user_id, 40); if (!(await one(d, "SELECT 1 x FROM os_members WHERE user_id=?1 AND org_id=?2 AND status='active'", to, ORG))) throw err("Pick an active team member.");
    if (source !== "gmail") { await run(d, "UPDATE help_tickets SET assignee_user_id=?2, updated_at=updated_at WHERE id=?1", ref, to); } await put(d, P, source, ref, { assignee_user_id: to, title, status: "open" });
    if (to !== P.user.id) { const { notify } = await import("../biz.js"); notify(env, to, "task", "Conversation assigned to you: " + title, source === "gmail" ? "/workspace/#inbox?box=mine" : "/workspace/#support?id=" + ref).catch(() => {}); } await audit(env, P, "INBOX_ASSIGNED", { kind: "inbox", id: source + ":" + ref }, null, { to }); return { ok: true }; }
  if (what === "task") { const cur = await one(d, "SELECT task_id FROM os_inbox_state WHERE source=?1 AND ref=?2", keyOf(source), ref); if (cur && cur.task_id && await one(d, "SELECT 1 x FROM biz_tasks WHERE id=?1 AND status NOT IN ('cancelled')", cur.task_id)) throw err("A task already exists for this conversation.", 409);
    const TK = await import("./tasks.js"); const t = await TK.create(env, P, { title: clip(b.title, 160) || "Reply: " + title, description: "From the inbox (" + source + "): " + title + (b.note ? "\n" + clip(b.note, 1000) : "") + (source !== "gmail" ? "\nTicket: /workspace/#support?id=" + ref : ""), assignee_user_id: clip(b.user_id, 40) || P.user.id, due: DAY.test(b.due || "") ? b.due : null, priority: ["low", "normal", "high", "urgent"].indexOf(b.priority) > -1 ? b.priority : "normal" });
    const tid = (t.task || t).id; await put(d, P, source, ref, { task_id: tid, title }); await emit(env, P, "inbox.task_created", { kind: "task", id: tid }, { source, ref }); return { ok: true, task_id: tid }; }
  if (what === "done") { await put(d, P, source, ref, { status: "done", title }); await audit(env, P, "INBOX_DONE", { kind: "inbox", id: source + ":" + ref }, null, null); return { ok: true, note: source === "gmail" ? "Marked done in FODO; your Gmail is unchanged." : "Marked done in FODO. Solve the ticket in Support to tell the client." }; }
  if (what === "reopen") { await put(d, P, source, ref, { status: "open", snooze_until: null }); return { ok: true }; }
  if (what === "snooze") { const until = DAY.test(b.until || "") ? b.until : null; if (!until || until <= nowIso().slice(0, 10)) throw err("Snooze until a future date."); await put(d, P, source, ref, { status: "snoozed", snooze_until: until, title }); return { ok: true }; }
  throw err("Unknown action.");
}
/* the full text of one Gmail message (owner only, read-only) */
export async function gmailRead(env, P, ref) { if (!gmailFor(P)) throw err("Gmail items are the owner's.", 403); const m = /^([^:]+):(.+)$/.exec(clip(ref, 200)); if (!m) throw err("Bad reference."); const G = await import("../brain/google.js"); try { return { mail: await G.emailRead(env, m[2], m[1]) }; } catch (e) { throw err(clip(e && e.message, 200) || "Could not read it.", 502); } }
