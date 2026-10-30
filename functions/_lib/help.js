/* FODO Help Desk v20 — tickets, the support mailbox and the AI help assistant, all stored in D1 and visible in /admin/.
   Channels: the /help/ page (form + AI chat), email (Resend inbound webhook → the same ticket thread), admin replies.
   Email threading: every ticket email carries "[FODO #T…]" in the subject and goes out with Reply-To = SUPPORT_EMAIL,
   so a customer's reply lands back on the same ticket.
   Secrets/vars: RESEND_API_KEY (send) · SUPPORT_EMAIL (the address customers write to) · RESEND_WEBHOOK_SECRET (inbound, whsec_…) */
import { groqChat } from "./aivis.js";
import { HELP_KB } from "./helpkb.js";
import { db, sendMail, nowIso, randId } from "./accounts.js";
import { PLANS, PACKS, ORDER } from "./plans.js";
import { PRODUCTS } from "./products.js";
import { outbound } from "./xray-core.js";

const DDL = [
  "CREATE TABLE IF NOT EXISTS help_tickets (id TEXT PRIMARY KEY, token TEXT, user_id TEXT, email TEXT, name TEXT, subject TEXT, category TEXT, status TEXT, priority TEXT, channel TEXT, assignee TEXT, chat_id TEXT, created_at TEXT, updated_at TEXT, last_from TEXT, first_reply_at TEXT, msgs INTEGER DEFAULT 0)",
  "CREATE INDEX IF NOT EXISTS help_tickets_st ON help_tickets (status, updated_at)",
  "CREATE INDEX IF NOT EXISTS help_tickets_em ON help_tickets (email)",
  "CREATE TABLE IF NOT EXISTS help_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT, dir TEXT, source TEXT, author TEXT, text TEXT, created_at TEXT, mail_id TEXT)",
  "CREATE INDEX IF NOT EXISTS help_messages_t ON help_messages (ticket_id, id)",
  "CREATE TABLE IF NOT EXISTS help_chats (id TEXT PRIMARY KEY, user_id TEXT, email TEXT, ip_hash TEXT, started_at TEXT, updated_at TEXT, msgs INTEGER DEFAULT 0, ticket_id TEXT, rating INTEGER, topics TEXT)",
  "CREATE TABLE IF NOT EXISTS help_chat_msgs (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT, role TEXT, text TEXT, t TEXT, model TEXT)",
  "CREATE TABLE IF NOT EXISTS help_mail (id INTEGER PRIMARY KEY AUTOINCREMENT, t TEXT, dir TEXT, kind TEXT, from_addr TEXT, to_addr TEXT, subject TEXT, text TEXT, ticket_id TEXT, status TEXT, provider_id TEXT, error TEXT, by_email TEXT, msg_id TEXT)",
];
const made = new WeakSet();
export async function hdb(env) { const d = await db(env); if (!made.has(d)) { for (const q of DDL) await d.prepare(q).run(); made.add(d); } return d; }
export const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, n);
export const CATS = ["Plans & pricing", "Payments & refunds", "Business X-Ray", "Pro tools", "Account & login", "Bug / something broken", "FODO services", "Other"];
export const STATUSES = ["open", "pending", "solved", "closed"];
export const supportAddr = (env) => String(env.SUPPORT_EMAIL || "support@fodo.co.in").trim();
const tid = () => "T" + randId(7).toUpperCase().replace(/[^A-Z0-9]/g, "X").slice(0, 7);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const site = (env, origin) => String(env.SITE_URL || origin || "https://www.fodo.co.in").replace(/\/$/, "");
export const ticketLink = (env, origin, t) => site(env, origin) + "/help/?ticket=" + t.id + "&k=" + t.token;

/* ---------- tickets ---------- */
export async function createTicket(env, o) {
  const d = await hdb(env), id = tid(), token = randId(24), now = nowIso();
  await d.prepare("INSERT INTO help_tickets (id, token, user_id, email, name, subject, category, status, priority, channel, chat_id, created_at, updated_at, last_from, msgs) VALUES (?1,?2,?3,?4,?5,?6,?7,'open',?8,?9,?10,?11,?11,'customer',0)")
    .bind(id, token, o.userId || null, String(o.email || "").toLowerCase(), clean(o.name, 80), clean(o.subject, 160) || "Help request", CATS.indexOf(o.category) > -1 ? o.category : "Other", o.priority || priorityFor(o.category, o.text), o.channel || "web", o.chatId || null, now).run();
  const t = await d.prepare("SELECT * FROM help_tickets WHERE id=?1").bind(id).first();
  await addMessage(env, t, { dir: "in", source: o.channel || "web", author: t.email, text: o.text });
  return t;
}
const priorityFor = (cat, text) => /payment|paid|charged|refund|deducted|double/i.test(String(cat) + " " + String(text)) ? "high" : /broken|bug|error|not working/i.test(String(cat) + " " + String(text)) ? "normal" : "normal";
export async function addMessage(env, t, m) {
  const d = await hdb(env), now = nowIso(), text = clean(m.text, 20000); if (!text) return null;
  await d.prepare("INSERT INTO help_messages (ticket_id, dir, source, author, text, created_at, mail_id) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind(t.id, m.dir, m.source, String(m.author || "").slice(0, 200), text, now, m.mailId || null).run();
  const st = m.dir === "note" ? t.status : m.dir === "out" ? (m.status || "pending") : (t.status === "solved" || t.status === "closed" || t.status === "pending" ? "open" : t.status);
  await d.prepare("UPDATE help_tickets SET updated_at=?2, status=?3, last_from=?4, msgs=msgs+1, first_reply_at=COALESCE(first_reply_at, CASE WHEN ?5='out' THEN ?2 ELSE NULL END) WHERE id=?1")
    .bind(t.id, now, st, m.dir === "out" ? "fodo" : m.dir === "note" ? t.last_from : "customer", m.dir).run();
  return true;
}
export async function thread(env, id, withNotes) {
  const d = await hdb(env), t = await d.prepare("SELECT * FROM help_tickets WHERE id=?1").bind(id).first(); if (!t) return null;
  const msgs = (await d.prepare("SELECT id, dir, source, author, text, created_at FROM help_messages WHERE ticket_id=?1 " + (withNotes ? "" : "AND dir != 'note' ") + "ORDER BY id").bind(id).all()).results || [];
  return { ticket: t, messages: msgs };
}
/* email a ticket update to the customer (Reply-To = the support mailbox, subject carries the ticket number for threading) */
export async function mailTicket(env, origin, t, text, opt) {
  opt = opt || {};
  const subj = "[FODO #" + t.id + "] " + (opt.subject || t.subject), link = ticketLink(env, origin, t);
  const html = '<div style="font:15px/1.55 -apple-system,Segoe UI,sans-serif;color:#15161a">' + esc(text).replace(/\n/g, "<br>") + '<hr style="border:0;border-top:1px solid #e3e3e3;margin:22px 0"><p style="color:#666;font-size:13px">Reply to this email, or open your ticket: <a href="' + link + '">' + link + "</a><br>FODO — Fear Of Digitally Out ?</p></div>";
  return sendMail(env, t.email, subj, html, text + "\n\n— Reply to this email or open your ticket: " + link, { replyTo: supportAddr(env), kind: opt.kind || "ticket", ticket: t.id, by: opt.by, headers: { "X-FODO-Ticket": t.id } });
}

/* ---------- inbound email (Resend "email.received" webhook, Svix-signed) ---------- */
const b64 = (u8) => btoa(String.fromCharCode.apply(null, u8));
export async function svixVerify(secret, h, raw) {
  const id = h.get("svix-id"), ts = h.get("svix-timestamp"), sig = h.get("svix-signature") || "";
  if (!secret || !id || !ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - +ts) > 600) return false;                      // replay window: 10 minutes
  const key = Uint8Array.from(atob(String(secret).replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = b64(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(id + "." + ts + "." + raw))));
  return sig.split(" ").some((p) => { const v = p.split(",")[1] || ""; if (v.length !== want.length) return false; let x = 0; for (let i = 0; i < v.length; i++) x |= v.charCodeAt(i) ^ want.charCodeAt(i); return x === 0; });
}
const addrOf = (s) => { const m = /<([^>]+)>/.exec(String(s || "")); return String(m ? m[1] : s || "").trim().toLowerCase(); };
const nameOf = (s) => { const m = /^\s*"?([^"<]+?)"?\s*</.exec(String(s || "")); return m ? m[1].trim() : ""; };
/* strip the quoted history of a reply ("On … wrote:", "> …") so the thread shows only the new text */
export const newPart = (t) => { const s = String(t || "").replace(/\r/g, ""), cut = s.search(/\n(On .{4,200}wrote:|-{2,}\s*Original Message|From: .+\nSent: |> )/); return (cut > 0 ? s.slice(0, cut) : s).trim(); };
export async function inboundEmail(env, origin, mail) {
  const from = addrOf(mail.from), subject = clean(mail.subject, 200), text = newPart(mail.text || String(mail.html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "));
  if (!from || !/@/.test(from)) return { ok: false, reason: "no sender" };
  if (from === supportAddr(env).toLowerCase() || /mailer-daemon|no-?reply/i.test(from)) return { ok: true, ignored: "own or automated sender" };
  const d = await hdb(env), m = /\[FODO #(T[A-Z0-9]{5,8})\]/.exec(subject || "");
  let t = m ? await d.prepare("SELECT * FROM help_tickets WHERE id=?1").bind(m[1]).first() : null;
  if (t && t.email !== from) t = null;   // a ticket number from a different sender opens a new ticket instead (no hijacking)
  const user = await d.prepare("SELECT id FROM acct_users WHERE email=?1").bind(from).first();
  await d.prepare("INSERT INTO help_mail (t, dir, kind, from_addr, to_addr, subject, text, ticket_id, status, provider_id) VALUES (?1,'in','inbound',?2,?3,?4,?5,?6,'received',?7)").bind(nowIso(), from, [].concat(mail.to || []).join(", ").slice(0, 200), subject, clean(mail.text || text, 20000), t ? t.id : null, mail.id || null).run();
  if (t) { await addMessage(env, t, { dir: "in", source: "email", author: from, text: text || "(empty email)", mailId: mail.id }); return { ok: true, ticket: t.id, added: true }; }
  t = await createTicket(env, { userId: user && user.id, email: from, name: nameOf(mail.from), subject: subject.replace(/^(re|fwd?):\s*/i, "") || "Email to FODO", category: "Other", text: text || "(empty email)", channel: "email" });
  await d.prepare("UPDATE help_mail SET ticket_id=?2 WHERE provider_id=?1 AND dir='in'").bind(mail.id || "-", t.id).run();
  try { await mailTicket(env, origin, t, "Hi" + (t.name ? " " + t.name : "") + ",\n\nThanks for writing to FODO. Your message is ticket " + t.id + " — a person will reply soon (usually within one working day).", { kind: "ticket", subject: t.subject }); } catch (e) {}
  return { ok: true, ticket: t.id, created: true };
}
export async function fetchReceived(env, id) {
  const r = await outbound(env)("https://api.resend.com/emails/receiving/" + encodeURIComponent(id), { headers: { authorization: "Bearer " + env.RESEND_API_KEY }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error("resend receiving " + r.status);
  return r.json();
}

/* ---------- what the assistant may know about the person asking (their own account only) ---------- */
export async function accountFacts(env, u, b) {
  if (!u) return null;
  const d = await hdb(env), owner = b || u, plan = owner.plan && owner.plan_until && Date.parse(owner.plan_until) > Date.now() ? owner.plan : "free";
  const orders = (await d.prepare("SELECT kind, item, amount, status, created_at, paid_at FROM acct_orders WHERE user_id=?1 ORDER BY created_at DESC LIMIT 5").bind(owner.id).all().catch(() => ({ results: [] }))).results || [];
  const runs = (await d.prepare("SELECT domain, status, credit, created_at FROM acct_runs WHERE owner_id=?1 ORDER BY created_at DESC LIMIT 5").bind(owner.id).all().catch(() => ({ results: [] }))).results || [];
  const tools = (await d.prepare("SELECT tool, credits FROM lab_tool_credits WHERE user_id=?1 AND credits > 0").bind(owner.id).all().catch(() => ({ results: [] }))).results || [];
  const open = (await d.prepare("SELECT id, subject, status FROM help_tickets WHERE (user_id=?1 OR email=?2) AND status IN ('open','pending') ORDER BY updated_at DESC LIMIT 3").bind(u.id, u.email || "-").all()).results || [];
  const itemName = (o) => o.kind === "plan" ? (PLANS[o.item] ? PLANS[o.item].name + " plan (1 month)" : o.item) : o.kind === "pack" ? (PACKS[o.item] ? PACKS[o.item].name + " pack" : o.item) : o.kind === "tool" ? (PRODUCTS[o.item] ? PRODUCTS[o.item].name + " (1 run)" : o.item) : o.item;
  return {
    email: u.email, plan: PLANS[plan] ? PLANS[plan].name : plan, planUntil: plan === "free" ? null : (owner.plan_until || "").slice(0, 10),
    xraysLeft: { thisMonth: plan === "free" ? 0 : owner.monthly_left || 0, packs: owner.pack_left || 0, free: plan === "free" ? owner.free_left || 0 : 0 },
    toolRuns: tools.map((x) => (PRODUCTS[x.tool] ? PRODUCTS[x.tool].name : x.tool) + ": " + x.credits),
    payments: orders.map((o) => ({ what: itemName(o), amount: "₹" + o.amount, status: o.status === "PAID" ? "paid" : o.status === "ACTIVE" ? "not completed (no money taken, or still being confirmed)" : String(o.status || "").toLowerCase(), date: (o.paid_at || o.created_at || "").slice(0, 16).replace("T", " ") })),
    recentXrays: runs.map((r) => ({ website: r.domain, status: r.status === "COMPLETE" ? "finished" : r.status === "refunded" ? "could not run — credit returned" : r.status, date: (r.created_at || "").slice(0, 10) })),
    openTickets: open.map((x) => x.id + " — " + x.subject + " (" + x.status + ")"),
  };
}
export function priceFacts() {
  return { plans: ORDER.map((id) => PLANS[id].name + ": " + (PLANS[id].price ? "₹" + PLANS[id].price.toLocaleString("en-IN") + "/month" : "free") + ", " + PLANS[id].xrays + " X-Rays" + (id === "free" ? " (lifetime)" : " a month")),
    packs: Object.keys(PACKS).map((k) => PACKS[k].name + ": ₹" + PACKS[k].price.toLocaleString("en-IN") + " (never expire)"),
    tools: Object.keys(PRODUCTS).filter((k) => PRODUCTS[k].on !== false).map((k) => PRODUCTS[k].name + ": ₹" + PRODUCTS[k].price.toLocaleString("en-IN") + " a run") };
}

/* ---------- the AI help assistant ---------- */
const STOP = /^(a|an|the|i|my|me|is|are|to|of|in|on|for|and|or|it|do|does|can|how|what|why|kya|hai|ka|ki|ke|mera|meri|mujhe|se|ko|nahi|kaise)$/i;
export function kbSearch(q, n) {
  const w = String(q || "").toLowerCase().split(/[^a-z0-9ऀ-ॿ]+/).filter((x) => x.length > 2 && !STOP.test(x));
  const SYN = { refund: ["refund", "money", "paisa", "wapas", "return"], paid: ["paid", "payment", "charged", "deducted", "kat", "paise"], plan: ["plan", "price", "pricing", "cost", "kitna", "rate"], cancel: ["cancel", "renew", "band", "stop"], login: ["login", "code", "otp", "sign"], fail: ["fail", "failed", "error", "nahi", "stuck", "loading"] };
  const ex = w.concat([].concat.apply([], Object.keys(SYN).filter((k) => SYN[k].some((s) => w.indexOf(s) > -1)).map((k) => SYN[k])));
  return HELP_KB.map((a) => { const t = (a.q + " " + a.a + " " + a.cat).toLowerCase(); return { a, s: ex.reduce((s, x) => s + (t.indexOf(x) > -1 ? (a.q.toLowerCase().indexOf(x) > -1 ? 3 : 1) : 0), 0) }; })
    .filter((x) => x.s > 0).sort((x, y) => y.s - x.s).slice(0, n || 4).map((x) => x.a);
}
export const SYS = "You are the FODO Help Assistant on fodo.co.in (FODO — Fear Of Digitally Out ?, a growth and marketing agency in New Delhi; its Growth Lab sells Business X-Rays, plans, packs and Pro tools).\n" +
  "RULES:\n- Answer ONLY from HELP ARTICLES, PRICES and ACCOUNT FACTS below. If the answer is not there, say you are not sure and offer to open a ticket so a person can check.\n" +
  "- Never invent prices, dates, payment results or policies. Quote prices exactly as given.\n- You cannot change accounts, give credits or approve refunds. For refunds, payment problems, wrong charges, bugs, or when the person asks for a human: explain briefly and say they can tap “Talk to a person” to open a ticket. Add the marker [[TICKET]] at the end of such answers.\n" +
  "- Use the ACCOUNT FACTS only for the person asking; never mention other customers.\n- Reply in the person's language (Hindi, Hinglish or English) and keep it under 120 words, friendly and clear. Plain text, no markdown tables.";
export function buildPrompt(question, facts, history) {
  const arts = kbSearch(question + " " + (history || []).slice(-2).map((m) => m.text).join(" "), 4), P = priceFacts();
  return "HELP ARTICLES:\n" + (arts.length ? arts : HELP_KB.slice(0, 4)).map((a) => "• " + a.q + " — " + a.a).join("\n") +
    "\n\nPRICES (live): " + P.plans.join("; ") + ". Packs: " + P.packs.join("; ") + ". Pro tools: " + P.tools.join("; ") + "." +
    "\n\nACCOUNT FACTS: " + (facts ? JSON.stringify(facts) : "the person is not logged in — for account-specific questions ask them to log in, or open a ticket with their email.");
}
const MODELS = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct"];
export async function aiReply(env, question, facts, history) {
  const msgs = [{ role: "system", content: SYS + "\n\n" + buildPrompt(question, facts, history) }].concat((history || []).slice(-6).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: String(m.text).slice(0, 1500) }))).concat([{ role: "user", content: question }]);
  for (let i = 0; i < MODELS.length && env.AI; i++) {
    try { const r = await Promise.race([env.AI.run(MODELS[i], { messages: msgs, max_tokens: 400, temperature: 0.2 }), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), i ? 12000 : 20000))]);
      const t = typeof r === "string" ? r : r && (r.response || (r.result && r.result.response)) || ""; if (t) return { text: String(t).trim(), model: MODELS[i] }; } catch (e) {}
  }
  if (env.GROQ_API_KEY) { try { const g = await groqChat(env, msgs, 400, 20000); return { text: g.text.trim(), model: g.model }; } catch (e) {} }   // v20.2: Workers AI down → Groq
  return null;   // no AI available → the caller answers from the help articles directly
}
export function articleReply(question) {
  const a = kbSearch(question, 2);
  return a.length ? a.map((x) => x.q + "\n" + x.a).join("\n\n") + "\n\nIf this doesn't solve it, tap “Talk to a person” and FODO will reply by email. [[TICKET]]" : "I'm not sure about that one. Tap “Talk to a person” and someone from FODO will reply by email. [[TICKET]]";
}
export const needsHuman = (q) => /\b(refund|wapas|money back|charged|deducted|double|twice|paid but|payment (failed|issue|problem)|human|person|agent|call me|complain|complaint|cancel my|delete my (account|data)|gst|invoice)\b/i.test(String(q || ""));
