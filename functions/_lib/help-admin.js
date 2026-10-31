/* FODO Help Desk v20, the admin side: tickets (reply, note, status, priority, assign), the support Mail box (every email in
   and out, compose to anyone), AI chat transcripts and help-desk numbers. Called from /api/admin/* (role already checked). */
import { json, nowIso, logEvent, cleanEmail, randId } from "./accounts.js";
import { hdb, clean, STATUSES, CATS, thread, addMessage, mailTicket, createTicket, supportAddr } from "./help.js";
import { PLANS } from "./plans.js";

const all = async (d, sql, ...a) => { try { return (await d.prepare(sql).bind(...a).all()).results || []; } catch (e) { return []; } };
const one = async (d, sql, ...a) => { try { return await d.prepare(sql).bind(...a).first(); } catch (e) { return null; } };
const since = (days) => new Date(Date.now() - days * 864e5).toISOString();

export async function helpGet(env, p, q, role) {
  const d = await hdb(env);
  if (p[0] === "help" && !p[1]) {
    const st = STATUSES.indexOf(q.get("status")) > -1 ? q.get("status") : null, s = clean(q.get("q"), 80);
    const items = await all(d, "SELECT t.*, u.plan, u.plan_until FROM help_tickets t LEFT JOIN acct_users u ON u.id = t.user_id WHERE (?1 IS NULL OR t.status = ?1) AND (?2 = '' OR t.id LIKE ?3 OR t.email LIKE ?3 OR t.subject LIKE ?3) ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, CASE t.priority WHEN 'high' THEN 0 ELSE 1 END, t.updated_at DESC LIMIT 200", st, s, "%" + s + "%");
    const counts = {}; (await all(d, "SELECT status, COUNT(*) n FROM help_tickets GROUP BY status")).forEach((x) => { counts[x.status] = x.n; });
    const fr = await one(d, "SELECT AVG((julianday(first_reply_at) - julianday(created_at)) * 24) h, COUNT(*) n FROM help_tickets WHERE first_reply_at IS NOT NULL AND created_at >= ?1", since(30));
    const solved7 = await one(d, "SELECT COUNT(*) n FROM help_tickets WHERE status IN ('solved','closed') AND updated_at >= ?1", since(7));
    const ch = await one(d, "SELECT COUNT(*) n, SUM(CASE WHEN ticket_id IS NOT NULL THEN 1 ELSE 0 END) esc, SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) up, SUM(CASE WHEN rating = -1 THEN 1 ELSE 0 END) down FROM help_chats WHERE started_at >= ?1", since(7));
    const cats = await all(d, "SELECT category, COUNT(*) n FROM help_tickets WHERE created_at >= ?1 GROUP BY category ORDER BY n DESC", since(30));
    const waiting = await one(d, "SELECT COUNT(*) n FROM help_tickets WHERE status = 'open' AND last_from = 'customer' AND updated_at < ?1", new Date(Date.now() - 24 * 3600e3).toISOString());
    return json({ ok: true, role, items, counts, kpi: { firstReplyHours: fr && fr.h != null ? Math.round(fr.h * 10) / 10 : null, solved7: solved7 ? solved7.n : 0, chats7: ch ? ch.n || 0 : 0, escalated7: ch ? ch.esc || 0 : 0, up7: ch ? ch.up || 0 : 0, down7: ch ? ch.down || 0 : 0, waiting24: waiting ? waiting.n : 0 }, cats, statuses: STATUSES, categories: CATS, support: supportAddr(env), email: !!env.RESEND_API_KEY, inbound: !!env.RESEND_WEBHOOK_SECRET });
  }
  if (p[0] === "help" && p[1]) {
    const th = await thread(env, clean(p[1], 12), true); if (!th) return json({ ok: false, reason: "Ticket not found." }, 404);
    const t = th.ticket, u = t.user_id ? await one(d, "SELECT * FROM acct_users WHERE id=?1", t.user_id) : await one(d, "SELECT * FROM acct_users WHERE email=?1", t.email);
    const ctx = u ? { id: u.id, email: u.email, name: u.name, phone: u.phone, plan: u.plan && u.plan_until && Date.parse(u.plan_until) > Date.now() ? (PLANS[u.plan] || {}).name || u.plan : "Free", planUntil: u.plan_until, monthly: u.monthly_left, packs: u.pack_left, free: u.free_left, blocked: !!u.blocked, created: u.created_at,
      orders: await all(d, "SELECT order_id, kind, item, amount, status, created_at, paid_at FROM acct_orders WHERE user_id=?1 ORDER BY created_at DESC LIMIT 10", u.id),
      runs: await all(d, "SELECT job_id, domain, status, credit, created_at FROM acct_runs WHERE owner_id=?1 ORDER BY created_at DESC LIMIT 8", u.id),
      tools: await all(d, "SELECT tool, credits FROM lab_tool_credits WHERE user_id=?1 AND credits > 0", u.id) } : null;
    const others = await all(d, "SELECT id, subject, status, updated_at FROM help_tickets WHERE email=?1 AND id != ?2 ORDER BY updated_at DESC LIMIT 10", t.email, t.id);
    const chat = t.chat_id ? await all(d, "SELECT role, text, t, model FROM help_chat_msgs WHERE chat_id=?1 ORDER BY id", t.chat_id) : [];
    const mails = await all(d, "SELECT id, t, dir, kind, from_addr, to_addr, subject, status, error FROM help_mail WHERE ticket_id=?1 ORDER BY id", t.id);
    return json({ ok: true, role, ticket: t, messages: th.messages, customer: ctx, others, chat, mails, statuses: STATUSES, categories: CATS });
  }
  if (p[0] === "mail") {
    const dir = q.get("dir") === "in" ? "in" : q.get("dir") === "out" ? "out" : null, s = clean(q.get("q"), 80), kind = clean(q.get("kind"), 20) || null;
    const items = await all(d, "SELECT id, t, dir, kind, from_addr, to_addr, subject, substr(text, 1, 400) AS preview, ticket_id, status, error, by_email FROM help_mail WHERE (?1 IS NULL OR dir=?1) AND (?2 IS NULL OR kind=?2) AND (?3 = '' OR from_addr LIKE ?4 OR to_addr LIKE ?4 OR subject LIKE ?4) ORDER BY id DESC LIMIT 300", dir, kind, s, "%" + s + "%");
    const tot = await all(d, "SELECT dir, status, COUNT(*) n FROM help_mail WHERE t >= ?1 GROUP BY dir, status", since(30));
    return json({ ok: true, role, items, totals: tot, support: supportAddr(env), email: !!env.RESEND_API_KEY, inbound: !!env.RESEND_WEBHOOK_SECRET });
  }
  if (p[0] === "mailone" && p[1]) { const r = await one(d, "SELECT * FROM help_mail WHERE id=?1", +p[1]); return r ? json({ ok: true, role, mail: r }) : json({ ok: false, reason: "Not found." }, 404); }
  if (p[0] === "chats") {
    const s = clean(q.get("q"), 80);
    const items = await all(d, "SELECT c.*, (SELECT text FROM help_chat_msgs m WHERE m.chat_id = c.id AND m.role='user' ORDER BY m.id LIMIT 1) AS first FROM help_chats c WHERE (?1 = '' OR c.email LIKE ?2 OR c.id IN (SELECT chat_id FROM help_chat_msgs WHERE text LIKE ?2)) ORDER BY c.updated_at DESC LIMIT 200", s, "%" + s + "%");
    const models = await all(d, "SELECT model, COUNT(*) n FROM help_chat_msgs WHERE role='assistant' AND t >= ?1 GROUP BY model", since(30));
    return json({ ok: true, role, items, models });
  }
  if (p[0] === "chat" && p[1]) { const c = await one(d, "SELECT * FROM help_chats WHERE id=?1", clean(p[1], 40)); if (!c) return json({ ok: false, reason: "Not found." }, 404); return json({ ok: true, role, chat: c, messages: await all(d, "SELECT role, text, t, model FROM help_chat_msgs WHERE chat_id=?1 ORDER BY id", c.id) }); }
  return null;
}

export async function helpPost(env, p, body, me, origin) {
  const d = await hdb(env);
  if (p[0] === "help" && p[1]) {
    const t = await one(d, "SELECT * FROM help_tickets WHERE id=?1", clean(p[1], 12)); if (!t) return json({ ok: false, reason: "Ticket not found." }, 404);
    const a = String(body.action || "");
    if (a === "reply") {
      const text = clean(body.text, 10000); if (text.length < 2) return json({ ok: false, reason: "Write the reply." }, 400);
      const st = STATUSES.indexOf(body.status) > -1 ? body.status : "pending";
      await addMessage(env, t, { dir: "out", source: "admin", author: me.email, text, status: st });
      let mailed = false, err = null; try { await mailTicket(env, origin, t, text, { by: me.email }); mailed = true; } catch (e) { err = String(e.message || e); }
      await logEvent(env, me.id, "admin_help", t.id + " reply" + (mailed ? "" : " (email not sent)"));
      return json({ ok: true, mailed, reason: mailed ? null : "Saved on the ticket (the customer sees it on the help page), but the email was not sent: " + err + "." });
    }
    if (a === "note") { const text = clean(body.text, 10000); if (!text) return json({ ok: false, reason: "Write the note." }, 400); await addMessage(env, t, { dir: "note", source: "admin", author: me.email, text }); return json({ ok: true }); }
    if (a === "status") { if (STATUSES.indexOf(body.status) < 0) return json({ ok: false, reason: "Unknown status." }, 400); await d.prepare("UPDATE help_tickets SET status=?2, updated_at=?3 WHERE id=?1").bind(t.id, body.status, nowIso()).run(); await logEvent(env, me.id, "admin_help", t.id + " → " + body.status); return json({ ok: true }); }
    if (a === "priority") { const pr = ["high", "normal", "low"].indexOf(body.priority) > -1 ? body.priority : "normal"; await d.prepare("UPDATE help_tickets SET priority=?2 WHERE id=?1").bind(t.id, pr).run(); return json({ ok: true }); }
    if (a === "category") { if (CATS.indexOf(body.category) < 0) return json({ ok: false, reason: "Unknown category." }, 400); await d.prepare("UPDATE help_tickets SET category=?2 WHERE id=?1").bind(t.id, body.category).run(); return json({ ok: true }); }
    if (a === "assign") { const em = body.email ? cleanEmail(body.email) : null; await d.prepare("UPDATE help_tickets SET assignee=?2 WHERE id=?1").bind(t.id, em).run(); return json({ ok: true }); }
    return json({ ok: false, reason: "Unknown action." }, 400);
  }
  if (p[0] === "mail" && p[1] === "send") {   // compose a new email to anyone, it becomes a ticket so the reply comes back to the same thread
    const to = cleanEmail(body.to), subject = clean(body.subject, 160), text = clean(body.text, 10000);
    if (!to) return json({ ok: false, reason: "Enter the email address." }, 400); if (!subject || text.length < 2) return json({ ok: false, reason: "Add a subject and a message." }, 400);
    const u = await one(d, "SELECT id, name FROM acct_users WHERE email=?1", to);
    const t = await createTicket(env, { userId: u && u.id, email: to, name: u && u.name, subject, category: CATS.indexOf(body.category) > -1 ? body.category : "Other", text: "(Started by FODO)", channel: "admin" });
    await d.prepare("DELETE FROM help_messages WHERE ticket_id=?1").bind(t.id).run();
    await d.prepare("UPDATE help_tickets SET msgs=0 WHERE id=?1").bind(t.id).run();
    await addMessage(env, Object.assign(t, { status: "open" }), { dir: "out", source: "admin", author: me.email, text, status: "pending" });
    let mailed = false, err = null; try { await mailTicket(env, origin, t, text, { kind: "compose", by: me.email }); mailed = true; } catch (e) { err = String(e.message || e); }
    await logEvent(env, me.id, "admin_help", "mail to " + to + " → " + t.id);
    return json({ ok: true, ticket: t.id, mailed, reason: mailed ? null : "Saved as ticket " + t.id + ", but the email was not sent: " + err + "." });
  }
  return null;
}
