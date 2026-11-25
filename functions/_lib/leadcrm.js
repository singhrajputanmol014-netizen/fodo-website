/* v55.23 Enquiry → CRM. Every new enquiry (FODO Bot on Instagram / Facebook / WhatsApp, website chat, website forms)
   also becomes a CRM contact in the FODO owner's CRM, with three follow-up TASKS: Day 0 (reply today), Day 3 and Day 7.
   It never sends anything to the person; the tasks are reminders for Rohit / Anmol. The same person (same phone or email)
   is not duplicated: the existing contact gets a note and fresh tasks instead. It never blocks or fails an enquiry. */
import * as CRM from "./crm.js";
import { OWNER_EMAILS } from "./accounts.js";

const SRC = { "instagram-dm": "instagram", "facebook-dm": "facebook", "whatsapp-dm": "whatsapp", "website-chat": "website" };
const CHANNEL = { instagram: "Instagram DM", facebook: "Facebook Messenger", whatsapp: "WhatsApp", website: "website" };
const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);

/* IST calendar day, n days from now */
export function istDay(n, now) { return new Date((now || Date.now()) + 5.5 * 3600e3 + (n || 0) * 864e5).toISOString().slice(0, 10); }

/* the owner account whose CRM is used: the owner with the most CRM contacts, else the first owner account that exists */
async function ownerUser(env) {
  const d = await CRM.cdb(env), q = OWNER_EMAILS.map((_, i) => "?" + (i + 1)).join(",");
  const r = await d.prepare("SELECT u.id, u.email, (SELECT count(*) FROM crm_contacts c WHERE c.user_id=u.id) n FROM acct_users u WHERE lower(u.email) IN (" + q + ") ORDER BY n DESC LIMIT 1").bind(...OWNER_EMAILS).first();
  return r ? { id: r.id, email: r.email } : null;
}

export function plan(L, keep, source, leadId, now) {
  const src = SRC[source] || "website", ch = CHANNEL[src], k = keep || {};
  const what = [k.goal && "Need: " + clip(k.goal, 200), k.budget && "Budget: " + clip(k.budget, 80), k.city && "City: " + clip(k.city, 60)].filter(Boolean).join(" · ");
  const contact = { name: clip(L.name, 120), email: L.email || "", phone: L.phone || "", company: clip(L.business, 120), city: clip(k.city, 60), source: src,
    tags: ["enquiry", src === "website" && source !== "website-chat" ? "website-form" : (source || "website").replace(/[^\w-]/g, "")],
    notes: clip(["Enquiry " + leadId + " via " + ch + (source ? " (" + source + ")" : ""), what, k.message && clip(k.message, 600)].filter(Boolean).join("\n"), 2000) };
  const tasks = [
    { due: istDay(0, now), body: "Day 0 · New " + ch + " enquiry" + (what ? " (" + what + ")" : "") + ". Read the chat in Admin ▸ Enquiries and reply or call today. Nothing is sent automatically." },
    { due: istDay(3, now), body: "Day 3 · No reply yet? Draft one short follow-up (" + ch + "), get approval, then send. Mark done if they already replied." },
    { due: istDay(7, now), body: "Day 7 · Last follow-up or close: if no reply, mark the enquiry Lost / not now. If interested, create a deal." },
  ];
  return { contact, tasks };
}

/* deps (tests): { owner, saveContact, addActivity } */
export async function enquiryToCrm(env, L, keep, source, leadId, deps) {
  try {
    deps = deps || {}; const u = deps.owner || await ownerUser(env); if (!u) return { ok: false, reason: "no_owner" };
    const save = deps.saveContact || CRM.saveContact, act = deps.addActivity || CRM.addActivity, p = plan(L, keep, source, leadId);
    let cid = "", dup = false;
    try { const c = await save(env, u, p.contact); cid = c && (c.id || (c.contact && c.contact.id)); }
    catch (e) { if (e && e.dup) { cid = e.dup; dup = true; } else throw e; }
    if (!cid) return { ok: false, reason: "no_contact" };
    if (dup) await act(env, u, { contactId: cid, kind: "note", body: "New enquiry again. " + p.contact.notes });
    for (const t of p.tasks) await act(env, u, { contactId: cid, kind: "task", due: t.due, body: t.body });
    return { ok: true, contactId: cid, dup, tasks: p.tasks.length };
  } catch (e) { console.error("fodo enquiry→crm:", String((e && e.message) || e).slice(0, 160)); return { ok: false, reason: "error" }; }
}

/* v55.25 Autopilot morning digest: once a day (from the daily scheduler tick) one email to the FODO mailbox with the bot status,
   new enquiries, CRM follow-ups due today or overdue, and bot chats of the last 24 hours. Internal only; it never contacts a lead. */
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export function digestBody(x) {
  const L = [], H = [];
  const sec = (t, rows) => { L.push("", t); H.push("<h3 style=\"margin:18px 0 6px\">" + esc(t) + "</h3>"); if (!rows.length) { L.push("- none"); H.push("<p style=\"color:#666\">None.</p>"); } else { rows.forEach((r) => L.push("- " + r)); H.push("<ul>" + rows.map((r) => "<li>" + esc(r) + "</li>").join("") + "</ul>"); } };
  L.push("FODO Autopilot, " + x.day, "Bot: Instagram + Facebook " + (x.botOn ? "ON" : "OFF") + ", WhatsApp " + (x.waOn ? "ON" : "not connected") + ". Bot chats last 24 h: " + x.chats24 + ".");
  H.push("<p><b>FODO Autopilot, " + esc(x.day) + "</b><br>Bot: Instagram + Facebook <b>" + (x.botOn ? "ON" : "OFF") + "</b>, WhatsApp " + (x.waOn ? "ON" : "not connected") + ". Bot chats last 24 h: " + x.chats24 + ".</p>");
  sec("New enquiries not handled (" + x.enq.length + ")", x.enq.map((q) => q.name + (q.business ? " · " + q.business : "") + " · " + (q.source || "website") + " · " + String(q.created_at || "").slice(0, 10)));
  sec("Follow-ups due today or overdue (" + x.fu.length + ")", x.fu.map((t) => (t.overdue ? "OVERDUE " : "") + t.due + " · " + t.name + " · " + String(t.body || "").slice(0, 90)));
  L.push("", "Open: https://www.fodo.co.in/admin/#autopilot", "Nothing was sent to any lead. This email goes only to the FODO mailbox.");
  H.push("<p><a href=\"https://www.fodo.co.in/admin/#autopilot\">Open Autopilot</a></p><p style=\"color:#888;font-size:12px\">Nothing was sent to any lead. This email goes only to the FODO mailbox.</p>");
  return { subject: "FODO Autopilot " + x.day + ": " + x.enq.length + " new enquir" + (x.enq.length === 1 ? "y" : "ies") + ", " + x.fu.length + " follow-up" + (x.fu.length === 1 ? "" : "s") + " due", text: L.join("\n"), html: H.join("") };
}
export async function autopilotDigest(env, deps) {
  deps = deps || {}; const day = istDay(0), key = "ap:digest:" + day;
  try {
    if (env.CHAT_KV && !deps.force && await env.CHAT_KV.get(key)) return { skipped: "already sent today" };
    const SC = await import("./sitecfg.js"), A = await import("./accounts.js");
    const enq = ((await SC.listLeads(env, { status: "new" }).catch(() => [])) || []).slice(0, 30);
    const u = await ownerUser(env).catch(() => null), fu = u ? (await CRM.followUps(env, u, 0).catch(() => [])) : [];
    let chats24 = 0; try { const b = await (await import("./leadintel.js")).botConvos(env); const since = Date.now() - 864e5; chats24 = (b.convos || []).filter((c) => Date.parse(c.at) > since).length; } catch (e) {}
    const m = digestBody({ day, botOn: !!(env.META_APP_SECRET && env.META_PAGE_TOKEN) && String(env.META_BOT_DISABLED || "") !== "1", waOn: !!(env.META_APP_SECRET && env.META_WA_TOKEN), chats24, enq, fu });
    await (deps.sendMail || A.sendMail)(env, A.OWNER_EMAILS[0], m.subject, m.html, m.text, { kind: "autopilot_digest" });
    if (env.CHAT_KV) await env.CHAT_KV.put(key, "1", { expirationTtl: 3 * 86400 });
    return { sent: true, enquiries: enq.length, followUps: fu.length };
  } catch (e) { return { error: String((e && e.message) || e).slice(0, 160) }; }
}
