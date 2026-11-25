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
