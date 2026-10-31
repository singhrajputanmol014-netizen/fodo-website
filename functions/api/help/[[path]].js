/* FODO Help Desk v20 API: /api/help/*
 *   GET  kb                                   → help articles + live prices (public)
 *   POST chat {chatId?, message}              → AI help assistant (knows the asker's own account when logged in) → {chatId, reply, suggestTicket}
 *   POST chat/escalate {chatId, email?, name?, note?} → turns the chat into a ticket (transcript attached)
 *   POST chat/rate {chatId, rating: 1|-1}
 *   POST ticket {name, email, subject, category, message, website(honeypot)} → new ticket + confirmation email
 *   GET  tickets                              → your tickets (logged in)
 *   GET  ticket/<id>?k=<token>                → the thread (owner of the ticket, or anyone with the ticket's secret link)
 *   POST ticket/<id>/reply {text, k?}         → add a reply · POST ticket/<id>/solve {k?}
 *   POST inbound/resend                       → Resend "email.received" webhook (Svix-signed) → the same ticket thread
 * Everything lands in D1 and is shown in /admin/ → Help desk, Mail and Chats. */
import { json, accountsOn, sessionUser, billingUser, sameOrigin, count, cleanEmail, randId, nowIso, logEvent } from "../../_lib/accounts.js";
import { hashIp } from "../../_lib/xray-core.js";
import { applyConfig } from "../../_lib/config.js";
import { HELP_KB, HELP_CATS } from "../../_lib/helpkb.js";
import { hdb, clean, CATS, createTicket, addMessage, thread, mailTicket, svixVerify, inboundEmail, fetchReceived, accountFacts, priceFacts, aiReply, articleReply, needsHuman, ticketLink, supportAddr } from "../../_lib/help.js";

const sameTok = (a, b) => { a = String(a || ""); b = String(b || ""); if (!a || a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; };
const pub = (t) => ({ id: t.id, subject: t.subject, category: t.category, status: t.status, created_at: t.created_at, updated_at: t.updated_at, last_from: t.last_from, msgs: t.msgs });

export async function onRequest(ctx) {
  const { request, env, params } = ctx, path = [].concat(params.path || []), m = request.method, origin = new URL(request.url).origin, q = new URL(request.url).searchParams;
  try {
    await applyConfig(env);
    if (path[0] === "kb" && m === "GET") return json({ ok: true, cats: HELP_CATS, articles: HELP_KB, prices: priceFacts(), ticketCats: CATS, support: supportAddr(env), email: !!env.RESEND_API_KEY });
    if (path[0] === "inbound" && path[1] === "resend" && m === "POST") return await inbound(request, env, origin);
    if (!accountsOn(env) || !env.XRAY_DB) return json({ ok: false, disabled: true, reason: "The help desk is not switched on yet. Email " + supportAddr(env) + "." }, 503);
    if (m === "POST" && (!sameOrigin(request) || !/json/.test(request.headers.get("content-type") || ""))) return json({ ok: false, reason: "Bad request." }, 403);
    const u = await sessionUser(env, request), body = m === "POST" ? await request.json().catch(() => ({})) : null, ip = await hashIp(request);
    // v20.3: the person's OWN account facts for the "Ask FODO" bot (plan, X-Rays left, latest X-Ray, open tickets), never anyone else's
    if (path[0] === "me" && m === "GET") return json({ ok: true, facts: u ? await accountFacts(env, u, await billingUser(env, u)) : null }, 200, { "cache-control": "no-store" });
    if (path[0] === "chat" && !path[1] && m === "POST") return await chat(env, u, body, ip);
    if (path[0] === "chat" && path[1] === "escalate" && m === "POST") return await escalate(env, u, body, ip, origin);
    if (path[0] === "chat" && path[1] === "rate" && m === "POST") { const d = await hdb(env); await d.prepare("UPDATE help_chats SET rating=?2 WHERE id=?1 AND (ip_hash=?3 OR user_id=?4)").bind(clean(body.chatId, 40), body.rating > 0 ? 1 : -1, ip, u ? u.id : "-").run(); return json({ ok: true }); }
    if (path[0] === "ticket" && !path[1] && m === "POST") return await newTicket(env, u, body, ip, origin);
    if (path[0] === "tickets" && m === "GET") { if (!u) return json({ ok: false, login: true, reason: "Log in to see your tickets." }, 401);
      const r = (await (await hdb(env)).prepare("SELECT * FROM help_tickets WHERE user_id=?1 OR (email=?2 AND email != '') ORDER BY updated_at DESC LIMIT 50").bind(u.id, u.email || "-").all()).results || []; return json({ ok: true, items: r.map(pub) }); }
    if (path[0] === "ticket" && path[1]) {
      const th = await thread(env, clean(path[1], 12), false); if (!th) return json({ ok: false, reason: "Ticket not found." }, 404);
      const t = th.ticket, mine = (u && (t.user_id === u.id || (u.email && u.email === t.email))) || sameTok(m === "GET" ? q.get("k") : body && body.k, t.token);
      if (!mine) return json({ ok: false, reason: "Ticket not found." }, 404);
      if (m === "GET") return json({ ok: true, ticket: pub(t), messages: th.messages.map((x) => ({ dir: x.dir, source: x.source, text: x.text, at: x.created_at, from: x.dir === "out" ? "FODO" : "You" })) });
      if (path[2] === "reply" && m === "POST") {
        if (await count(env, "helpreply:" + t.id, 30, 3600)) return json({ ok: false, reason: "Too many messages, please wait a little." }, 429);
        const text = clean(body.text, 8000); if (text.length < 2) return json({ ok: false, reason: "Write a message." }, 400);
        await addMessage(env, t, { dir: "in", source: "web", author: t.email, text }); return json({ ok: true });
      }
      if (path[2] === "solve" && m === "POST") { await (await hdb(env)).prepare("UPDATE help_tickets SET status='solved', updated_at=?2 WHERE id=?1").bind(t.id, nowIso()).run(); return json({ ok: true }); }
    }
    return json({ ok: false, reason: "Not found." }, 404);
  } catch (e) {
    console.log(JSON.stringify({ svc: "help", route: path.join("/"), ok: false, err: String(e && e.message || e).slice(0, 200) }));
    return json({ ok: false, reason: "The help desk hit an error. Please try again, or email " + supportAddr(env) + "." }, 500);
  }
}

async function chat(env, u, b, ip) {
  const msg = clean(b && b.message, 1500); if (msg.length < 2) return json({ ok: false, reason: "Type your question." }, 400);
  if (await count(env, "helpchat:" + (u ? u.id : ip), u ? 60 : 25, 3600)) return json({ ok: false, reason: "That's a lot of questions for one hour, please open a ticket and a person will reply." }, 429);
  const d = await hdb(env), now = nowIso();
  let id = clean(b.chatId, 40), c = id ? await d.prepare("SELECT * FROM help_chats WHERE id=?1").bind(id).first() : null;
  if (c && !(c.ip_hash === ip || (u && c.user_id === u.id))) c = null;   // a chat id from someone else starts a new chat
  if (!c) { id = "c_" + randId(16); await d.prepare("INSERT INTO help_chats (id, user_id, email, ip_hash, started_at, updated_at, msgs) VALUES (?1,?2,?3,?4,?5,?5,0)").bind(id, u ? u.id : null, u ? u.email || "" : "", ip, now).run(); }
  else if (u && !c.user_id) await d.prepare("UPDATE help_chats SET user_id=?2, email=?3 WHERE id=?1").bind(id, u.id, u.email || "").run();
  const hist = ((await d.prepare("SELECT role, text FROM help_chat_msgs WHERE chat_id=?1 ORDER BY id DESC LIMIT 8").bind(id).all()).results || []).reverse();
  const facts = u ? await accountFacts(env, u, await billingUser(env, u)) : null;
  const ai = await aiReply(env, msg, facts, hist);
  let reply = ai ? ai.text : articleReply(msg), model = ai ? ai.model : "help-articles";
  const suggest = /\[\[TICKET\]\]/.test(reply) || needsHuman(msg); reply = reply.replace(/\s*\[\[TICKET\]\]\s*/g, " ").trim();
  await d.batch([d.prepare("INSERT INTO help_chat_msgs (chat_id, role, text, t) VALUES (?1,'user',?2,?3)").bind(id, msg, now),
    d.prepare("INSERT INTO help_chat_msgs (chat_id, role, text, t, model) VALUES (?1,'assistant',?2,?3,?4)").bind(id, reply, nowIso(), model),
    d.prepare("UPDATE help_chats SET updated_at=?2, msgs=msgs+2 WHERE id=?1").bind(id, nowIso())]);
  return json({ ok: true, chatId: id, reply, suggestTicket: suggest, loggedIn: !!u });
}
async function escalate(env, u, b, ip, origin) {
  const d = await hdb(env), c = await d.prepare("SELECT * FROM help_chats WHERE id=?1").bind(clean(b.chatId, 40)).first();
  if (!c || !(c.ip_hash === ip || (u && c.user_id === u.id))) return json({ ok: false, reason: "Chat not found." }, 404);
  if (c.ticket_id) return json({ ok: true, ticket: c.ticket_id, already: true });
  const email = u && u.email ? u.email : cleanEmail(b.email); if (!email) return json({ ok: false, needEmail: true, reason: "Enter your email so FODO can reply." }, 400);
  if (await count(env, "helpticket:" + (u ? u.id : ip), 6, 3600)) return json({ ok: false, reason: "Too many tickets this hour." }, 429);
  const msgs = (await d.prepare("SELECT role, text FROM help_chat_msgs WHERE chat_id=?1 ORDER BY id").bind(c.id).all()).results || [];
  const first = (msgs.filter((x) => x.role === "user")[0] || {}).text || "Help request";
  const text = (clean(b.note, 2000) ? clean(b.note, 2000) + "\n\n" : "") + "Chat with the FODO Help Assistant:\n" + msgs.map((x) => (x.role === "user" ? "Customer: " : "Assistant: ") + x.text).join("\n");
  const t = await createTicket(env, { userId: u && u.id, email, name: clean(b.name, 80) || (u && u.name) || "", subject: first.slice(0, 120), category: guessCat(first + " " + text), text, channel: "chat", chatId: c.id });
  await d.prepare("UPDATE help_chats SET ticket_id=?2 WHERE id=?1").bind(c.id, t.id).run();
  if (u) await logEvent(env, u.id, "help_ticket", t.id + " · chat");
  let mailed = false; try { await mailTicket(env, origin, t, "Hi" + (t.name ? " " + t.name : "") + ",\n\nThanks, your question is ticket " + t.id + ". A person at FODO will reply by email (usually within one working day). You can also follow it here: " + ticketLink(env, origin, t)); mailed = true; } catch (e) {}
  return json({ ok: true, ticket: t.id, link: ticketLink(env, origin, t), mailed });
}
const guessCat = (s) => /refund|paid|payment|charged|deducted|invoice|gst/i.test(s) ? "Payments & refunds" : /plan|price|pricing|pack|upgrade|cancel|renew/i.test(s) ? "Plans & pricing" : /x-?ray|report|score|crawl/i.test(s) ? "Business X-Ray" : /tool|war room|visibility|blueprint|roadmap/i.test(s) ? "Pro tools" : /login|otp|code|account|password/i.test(s) ? "Account & login" : /bug|error|broken|not working|stuck|loading/i.test(s) ? "Bug / something broken" : "Other";
async function newTicket(env, u, b, ip, origin) {
  if (b.website) return json({ ok: true, ticket: "T0000000" });   // honeypot: bots fill hidden fields
  const email = u && u.email ? u.email : cleanEmail(b.email); if (!email) return json({ ok: false, reason: "Enter a valid email so FODO can reply." }, 400);
  const text = clean(b.message, 8000); if (text.length < 10) return json({ ok: false, reason: "Describe the problem in a sentence or two." }, 400);
  if (await count(env, "helpticket:" + (u ? u.id : ip), 6, 3600)) return json({ ok: false, reason: "Too many tickets this hour, please reply on your existing ticket." }, 429);
  const t = await createTicket(env, { userId: u && u.id, email, name: clean(b.name, 80) || (u && u.name) || "", subject: clean(b.subject, 160) || text.slice(0, 80), category: CATS.indexOf(b.category) > -1 ? b.category : guessCat(text), text, channel: "web" });
  if (u) await logEvent(env, u.id, "help_ticket", t.id + " · form");
  let mailed = false; try { await mailTicket(env, origin, t, "Hi" + (t.name ? " " + t.name : "") + ",\n\nWe got your message, it is ticket " + t.id + ". A person at FODO will reply by email, usually within one working day.\n\nYour message:\n" + text); mailed = true; } catch (e) {}
  return json({ ok: true, ticket: t.id, link: ticketLink(env, origin, t), mailed });
}
async function inbound(request, env, origin) {
  const raw = await request.text();
  if (!env.RESEND_WEBHOOK_SECRET || !(await svixVerify(env.RESEND_WEBHOOK_SECRET, request.headers, raw))) return json({ ok: false }, 401);
  let ev = {}; try { ev = JSON.parse(raw); } catch (e) { return json({ ok: false }, 400); }
  if (ev.type !== "email.received" || !ev.data || !ev.data.email_id) return json({ ok: true, ignored: true });
  const d = await hdb(env); if (await d.prepare("SELECT id FROM help_mail WHERE provider_id=?1 AND dir='in'").bind(ev.data.email_id).first()) return json({ ok: true, duplicate: true });   // webhook retried
  const full = await fetchReceived(env, ev.data.email_id).catch(() => null);
  const r = await inboundEmail(env, origin, Object.assign({ id: ev.data.email_id, from: ev.data.from, to: ev.data.to, subject: ev.data.subject }, full ? { from: (full.headers && full.headers.from) || full.from || ev.data.from, text: full.text, html: full.html, subject: full.subject || ev.data.subject } : {}));
  return json(r, r.ok ? 200 : 400);
}
