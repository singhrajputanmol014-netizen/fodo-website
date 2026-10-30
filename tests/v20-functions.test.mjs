// v20 Help desk — server side: help articles + live prices, AI help assistant (grounded on the asker's own account, falls back
// to the articles), chat → ticket, ticket form, ticket access (owner / secret link only), replies, inbound email (Resend webhook,
// Svix-signed, threading by [FODO #T…], no hijacking, duplicates ignored), every email logged (login codes never stored),
// admin Help desk / Mail / AI chats (reply, note, status, compose), viewers read-only.   Run: node --no-warnings tests/v20-functions.test.mjs
import { DatabaseSync } from "node:sqlite";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as help } from "../functions/api/help/[[path]].js";
import { onRequest as admin } from "../functions/api/admin/[[path]].js";
import { newPart, kbSearch, svixVerify } from "../functions/_lib/help.js";
import { sendMail } from "../functions/_lib/accounts.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
console.log = ((orig) => (...a) => { if (typeof a[0] === "string" && a[0].charAt(0) === "{" && !process.env.DBG) return; orig(...a); })(console.log);
function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, a = []) => ({ bind: (...x) => st(sql, x.map((v) => v === undefined ? null : v)), run: async () => { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }), _x: () => db.prepare(sql).run(...a) });
  return { db, prepare: (s) => st(s), batch: async (l) => l.map((s) => (s._x(), { success: true })) };
}
const SITE = "https://www.fodo.co.in", jars = {}, H = { help, account, admin };
const call = async (path, body, o = {}) => {
  const who = o.as || "a", h = /^(help|admin)\//.test(path) ? path.split("/")[0] : "account", p = h === "account" ? path : path.slice(h.length + 1);
  const req = new Request(SITE + "/api/" + h + "/" + p, { method: body !== undefined ? "POST" : "GET", headers: Object.assign({ origin: SITE, "cf-connecting-ip": o.ip || "9.9.9.9" }, body !== undefined ? { "content-type": "application/json" } : {}, jars[who] ? { cookie: jars[who] } : {}, o.headers || {}), body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)) });
  const r = await H[h]({ request: req, env, params: { path: p.split("?")[0].split("/") } }); const sc = r.headers.get("set-cookie"); if (sc) jars[who] = sc.split(";")[0];
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, j };
};
const login = (email, plan, who) => call("test-login", Object.assign({ email }, plan ? { plan } : {}), { as: who });

const sent = [], aiCalls = []; let aiOn = true, received = {};
globalThis.fetch = async (u, o = {}) => {
  u = String(u);
  if (/api\.resend\.com\/emails\/receiving\//.test(u)) { const id = u.split("/").pop(); return received[id] ? new Response(JSON.stringify(received[id])) : new Response("{}", { status: 404 }); }
  if (/api\.resend\.com\/emails$/.test(u)) { const b = JSON.parse(o.body); sent.push(b); return new Response(JSON.stringify({ id: "re_" + sent.length })); }
  return new Response("not mocked " + u, { status: 599 });
};
const AI = { run: async (model, inp) => { if (!aiOn) throw new Error("down"); aiCalls.push(inp.messages); const q = inp.messages[inp.messages.length - 1].content, sys = inp.messages[0].content;
  if (/refund/i.test(q)) return { response: "Refunds are approved by a person within 7 days of purchase. [[TICKET]]" };
  const m = /"plan":"([^"]+)"/.exec(sys); return { response: m ? "You are on the " + m[1] + " plan." : "Please log in so I can see your plan." }; } };
const WH = "whsec_" + Buffer.from("test-webhook-secret-123456").toString("base64");
const env = { XRAY_DB: d1(), ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", AI, RESEND_API_KEY: "re_k", MAIL_FROM: "FODO <hello@fodo.co.in>", SUPPORT_EMAIL: "support@fodo.co.in", RESEND_WEBHOOK_SECRET: WH, SITE_URL: SITE };
const db = () => env.XRAY_DB.db;
const sign = async (raw, id, ts) => { const k = await crypto.subtle.importKey("raw", Buffer.from("test-webhook-secret-123456"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return "v1," + Buffer.from(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(id + "." + ts + "." + raw))).toString("base64"); };
const hook = async (data, opt) => { const raw = JSON.stringify({ type: "email.received", data }), id = "msg_" + Math.random(), ts = String(Math.floor(Date.now() / 1000) - (opt && opt.old ? 3600 : 0));
  return call("help/inbound/resend", raw, { headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": ts, "svix-signature": opt && opt.bad ? "v1,AAAA" : await sign(raw, id, ts) } }); };

/* ---------- 1. help articles + live prices ---------- */
let r = await call("help/kb");
ok(r.j.ok && r.j.articles.length >= 30 && r.j.cats.length === 7 && r.j.prices.plans.some((x) => /Growth: ₹1,499\/month/.test(x)) && r.j.support === "support@fodo.co.in", "help articles (7 topics) + live prices + support address");
ok(kbSearch("paisa wapas kab milega refund")[0].id === "refund" && kbSearch("payment kat gaya plan nahi aaya")[0].id === "paid-not-received", "article search understands Hinglish (refund, money taken but no plan)");
ok(newPart("Thanks, works now!\n\nOn Mon, 3 Nov 2026 FODO <support@fodo.co.in> wrote:\n> old text") === "Thanks, works now!", "email replies: quoted history is cut off");

/* ---------- 2. AI help assistant: grounded on the asker's own account ---------- */
r = await call("help/chat", { message: "what is my plan?" }, { as: "v", ip: "1.1.1.1" });
ok(r.j.ok && /log in/i.test(r.j.reply) && /not logged in/.test(aiCalls[aiCalls.length - 1][0].content), "visitor: the assistant knows nothing about any account");
await login("rohit@shop.in", "growth");
r = await call("help/chat", { message: "mera plan kaunsa hai?" });
const chat1 = r.j.chatId, sys1 = aiCalls[aiCalls.length - 1][0].content;
ok(r.j.ok && /Growth plan/.test(r.j.reply) && /"email":"rohit@shop.in"/.test(sys1) && /PRICES \(live\)/.test(sys1) && !r.j.suggestTicket, "logged in: answers from their own plan (and live prices), no ticket needed");
ok(!/anmol@|other customers/.test(sys1.split("ACCOUNT FACTS:")[1] || ""), "only the asker's own facts are given to the AI");
r = await call("help/chat", { chatId: chat1, message: "I want a refund for my last payment" });
ok(r.j.suggestTicket && !/\[\[TICKET\]\]/.test(r.j.reply) && aiCalls[aiCalls.length - 1].length >= 4, "refund question → 'talk to a person' offered (marker hidden), chat history kept");
aiOn = false; r = await call("help/chat", { chatId: chat1, message: "how do I cancel auto renew" }); aiOn = true;
ok(r.j.ok && /auto-renew/.test(r.j.reply) && r.j.suggestTicket, "AI down → answers straight from the help articles");
r = await call("help/chat", { chatId: chat1, message: "hi" }, { as: "v", ip: "1.1.1.1" }); ok(r.j.chatId !== chat1, "someone else's chat id starts a new chat (no reading other chats)");

/* ---------- 3. chat → ticket (transcript attached, email sent with Reply-To support) ---------- */
r = await call("help/chat/escalate", { chatId: chat1 });
const T1 = r.j.ticket, t1 = db().prepare("SELECT * FROM help_tickets WHERE id=?").get(T1);
ok(r.j.ok && /^T[A-Z0-9]{7}$/.test(T1) && t1.channel === "chat" && t1.category === "Payments & refunds" && t1.priority === "high" && t1.email === "rohit@shop.in", "chat became ticket " + T1 + " (payments, high priority)");
const m1 = sent[sent.length - 1]; ok(m1.to[0] === "rohit@shop.in" && m1.reply_to === "support@fodo.co.in" && m1.subject.indexOf("[FODO #" + T1 + "]") === 0 && /help\/\?ticket=T/.test(m1.text), "confirmation email: [FODO #T…] subject, Reply-To support, link to the ticket");
ok(/Customer: I want a refund/.test(db().prepare("SELECT text FROM help_messages WHERE ticket_id=?").get(T1).text), "the whole chat transcript is on the ticket");
r = await call("help/chat/escalate", { chatId: chat1 }); ok(r.j.already && r.j.ticket === T1, "escalating twice doesn't make two tickets");

/* ---------- 4. ticket form (guest) + access rules ---------- */
r = await call("help/ticket", { email: "guest@x.in", name: "Guest", category: "Business X-Ray", subject: "X-Ray stuck", message: "My X-Ray of guest.in is stuck on loading." }, { as: "g", ip: "2.2.2.2" });
const T2 = r.j.ticket, k2 = new URL(r.j.link).searchParams.get("k"); ok(r.j.ok && r.j.mailed && k2.length === 24, "guest ticket " + T2 + " with a secret link");
r = await call("help/ticket", { email: "bot@x.in", message: "buy cheap stuff now now now", website: "http://spam" }, { as: "g", ip: "2.2.2.2" }); ok(r.j.ok && !db().prepare("SELECT * FROM help_tickets WHERE email='bot@x.in'").get(), "honeypot: spam bots get a fake OK, nothing stored");
r = await call("help/ticket/" + T2, undefined, { as: "x", ip: "3.3.3.3" }); ok(r.status === 404, "a stranger can't read the ticket");
r = await call("help/ticket/" + T2 + "?k=" + k2, undefined, { as: "x", ip: "3.3.3.3" }); ok(r.j.ok && r.j.messages[0].text.indexOf("stuck") > -1, "the secret link opens it");
r = await call("help/ticket/" + T2 + "/reply", { text: "Still stuck after refresh", k: k2 }, { as: "x", ip: "3.3.3.3" }); ok(r.j.ok, "reply from the secret link");
r = await call("help/tickets"); ok(r.j.items.length === 1 && r.j.items[0].id === T1, "'my tickets' lists only my own");

/* ---------- 5. inbound email ---------- */
received.e1 = { from: "Rohit <rohit@shop.in>", subject: "Re: [FODO #" + T1 + "] I want a refund", text: "Payment was on 2 Nov, ₹1499.\n\nOn Sun FODO wrote:\n> Thanks", html: null };
r = await hook({ email_id: "e1", from: "rohit@shop.in", to: ["support@fodo.co.in"], subject: received.e1.subject });
ok(r.j.ok && r.j.ticket === T1 && r.j.added && db().prepare("SELECT text FROM help_messages WHERE ticket_id=? ORDER BY id DESC").get(T1).text === "Payment was on 2 Nov, ₹1499.", "customer's email reply lands on the same ticket (quoted text removed)");
r = await hook({ email_id: "e1", from: "rohit@shop.in", subject: received.e1.subject }); ok(r.j.duplicate, "the same webhook twice is ignored");
received.e2 = { from: "attacker@evil.in", subject: "[FODO #" + T1 + "] hello", text: "let me in" };
r = await hook({ email_id: "e2", from: "attacker@evil.in", subject: received.e2.subject }); ok(r.j.created && r.j.ticket !== T1, "someone else using a ticket number gets a NEW ticket (no hijacking)");
received.e3 = { from: "New Person <new@biz.in>", subject: "Pricing for agency", text: "Do you have a yearly plan?" };
r = await hook({ email_id: "e3", from: "new@biz.in", subject: "Pricing for agency" }); const T3 = r.j.ticket; ok(r.j.created && db().prepare("SELECT channel, name FROM help_tickets WHERE id=?").get(T3).channel === "email", "a new email to support opens a new ticket");
r = await hook({ email_id: "e4", from: "x@y.in", subject: "x" }, { bad: true }); ok(r.status === 401, "unsigned / wrongly signed webhook → 401");
r = await hook({ email_id: "e5", from: "x@y.in", subject: "x" }, { old: true }); ok(r.status === 401, "old webhook (replay) → 401");

/* ---------- 6. every email logged; login codes never stored ---------- */
await sendMail(env, "a@b.in", "Your FODO login code: 482913", "<p>482913</p>", "Your code is 482913");
const lg = db().prepare("SELECT * FROM help_mail WHERE subject LIKE 'Your FODO login code%'").get(); ok(lg && lg.text.indexOf("482913") < 0 && /not stored/.test(lg.text), "login-code emails are logged without the code");
ok(db().prepare("SELECT COUNT(*) n FROM help_mail WHERE dir='in'").get().n === 3 && db().prepare("SELECT COUNT(*) n FROM help_mail WHERE dir='out' AND kind='ticket'").get().n >= 3, "Mail log has the inbox (3 in) and the ticket emails");

/* ---------- 7. admin ---------- */
await login("anmol@fodo.co.in", null, "own");
r = await call("admin/help", undefined, { as: "own" });
ok(r.j.ok && r.j.items.length >= 4 && r.j.counts.open >= 3 && r.j.kpi.chats7 >= 2 && r.j.kpi.escalated7 === 1 && r.j.email && r.j.inbound, "admin Help desk: tickets, counts, AI chat numbers, email + inbound connected");
r = await call("admin/help/" + T1, undefined, { as: "own" });
ok(r.j.customer.plan === "Growth" && r.j.messages.length === 2 && r.j.chat.length >= 6 && r.j.mails.length >= 2, "ticket detail: customer plan, the thread, the AI chat before it, its emails");
r = await call("admin/help/" + T1, { action: "reply", text: "Refund approved — 5–7 working days.", status: "solved" }, { as: "own" });
const last = sent[sent.length - 1]; ok(r.j.ok && r.j.mailed && last.to[0] === "rohit@shop.in" && /Refund approved/.test(last.text) && db().prepare("SELECT status, first_reply_at FROM help_tickets WHERE id=?").get(T1).status === "solved", "admin reply → emailed to the customer, ticket solved, first-reply time recorded");
r = await call("admin/help/" + T1, { action: "note", text: "Checked Cashfree: paid once." }, { as: "own" });
r = await call("help/ticket/" + T1); ok(r.j.messages.every((m) => m.text.indexOf("Checked Cashfree") < 0) && r.j.messages.some((m) => /Refund approved/.test(m.text)), "customer sees the reply on the help page, never the internal note");
r = await call("admin/mail/send", { to: "lead@company.in", subject: "Your X-Ray results", text: "Hi, here is what we found…" }, { as: "own" });
ok(r.j.ok && r.j.mailed && db().prepare("SELECT channel, status FROM help_tickets WHERE id=?").get(r.j.ticket).channel === "admin" && sent[sent.length - 1].reply_to === "support@fodo.co.in", "compose a new email from admin → it is a ticket, so the reply comes back");
r = await call("admin/mail?dir=in", undefined, { as: "own" }); ok(r.j.items.length === 3 && r.j.items.every((m) => m.dir === "in"), "Mail → Inbox");
r = await call("admin/chats", undefined, { as: "own" }); ok(r.j.items.length >= 2 && r.j.items.some((c) => c.ticket_id === T1), "AI chats list (with the one that became a ticket)");
r = await call("admin/chat/" + chat1, undefined, { as: "own" }); ok(r.j.messages.length >= 6, "AI chat transcript");
await call("admin/viewers", { email: "viewer@fodo.co.in", role: "viewer" }, { as: "own" }); await login("viewer@fodo.co.in", null, "vw");
r = await call("admin/help", undefined, { as: "vw" }); ok(r.j.ok, "viewer can read the help desk");
r = await call("admin/help/" + T2, { action: "reply", text: "hi" }, { as: "vw" }); ok(r.status === 403, "…but can't reply");
r = await call("admin/help", undefined, { as: "a" }); ok(r.status === 403, "a customer can't open the admin help desk");

console.log("\nv20 functions: " + pass + "/" + (pass + fail) + " passed");
process.exit(fail ? 1 : 0);
