/* FODO v54.2 Admin ▸ Client Emails: the ONE email design every client email uses, plus the email types.
   The layout, colours, spacing, header, sign-off and footer never change. Only the content blocks change per email type and
   per client. Colours: page #0B0B0C, card #151517, border #2A2A2F, text #F4F4F2, muted #B4B4BB / #8A8A92, violet #8F7BFF.
   Font: Inter Tight (Arial fallback). Email-safe: tables + inline styles, max 640px, one <style> block only for phones.

   Blocks (all plain text; HTML typed by an admin is stripped):
     eyebrow   small violet label
     headline  big title. *words* turn into the serif italic violet accent (the "× FODO" look)
     intro     paragraphs (blank line = new paragraph). **words** = bold
     items     one row per line. "Label | value" puts the value on the right
     stats     one box per line, "Value | label", shown two per row
     cta_text + cta_link   one button (optional)
     closing   paragraphs after the button
   Variables {client_name} {first_name} {business_name} {city} {industry} {service} {amount} {pricing} {date} {next_step}
   {link} {phone} {email} are filled from the client record and the per-email fields.

   To add a new email type: add one entry to TYPES below (see docs/CLIENT-EMAILS.md). Nothing else needs to change. */
const SITE = "https://www.fodo.co.in";
export const C = { page: "#0B0B0C", card: "#151517", line: "#2A2A2F", text: "#F4F4F2", muted: "#B4B4BB", dim: "#8A8A92", violet: "#8F7BFF" };
const FONT = "'Inter Tight',Arial,Helvetica,sans-serif", SERIF = "Georgia,'Times New Roman',Times,serif";
export const LINKS = { site: SITE + "/", wa: "https://wa.me/917827007676", ig: "https://instagram.com/fodo.co.in", li: "https://www.linkedin.com/company/fodo_co_in/" };

export const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
/* plain text only: drop tags and control characters, keep line breaks */
export const plain = (s, n) => String(s == null ? "" : s).replace(/<\/?[a-z!][^>]*>/gi, "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\r/g, "").slice(0, n || 4000);
export const safeUrl = (u) => { u = String(u || "").trim(); return /^(https?:\/\/|mailto:|tel:)[^\s"'<>]{1,500}$/i.test(u) ? u : ""; };
export const firstName = (n) => { const f = String(n || "").trim().split(/\s+/)[0] || ""; return /^[\p{L}][\p{L}'.-]{0,30}$/u.test(f) ? f : ""; };

/* ---------------- the email types ----------------
   marketing: true → the email gets an opt-out link and a List-Unsubscribe header, and opted-out people are never sent it.
   Transactional types (proposal, invoice, project update, welcome, report) are for existing work with the client. */
const SIGN_Q = "Questions? Just reply to this email or WhatsApp +91 78270 07676.";
export const TYPES = {
  proposal: { label: "Proposal", marketing: false,
    subject: "Proposal for {business_name}: {service}",
    eyebrow: "Proposal · {service}",
    headline: "{business_name} *× FODO*",
    intro: "Hi {first_name},\n\nThank you for your time. Here is our proposal for **{business_name}** in {city}. We set up and run the {service} for you, so you can run the business from your phone while every enquiry is answered and followed up.",
    items: "{pricing}",
    stats: "{amount} | One-time setup\n{date} | Proposal valid till",
    cta_text: "Reply to confirm", cta_link: "mailto:anmol@fodo.co.in?subject=Confirm%20proposal%20for%20{business_name}",
    closing: "Next step: {next_step}\n\n" + SIGN_Q },
  follow_up: { label: "Follow-up", marketing: true,
    subject: "{first_name}, a quick follow-up on {business_name}",
    eyebrow: "Following up",
    headline: "Quick follow-up, *{first_name}*",
    intro: "Hi {first_name},\n\nFollowing up on our conversation about {service} for {business_name}. I know things get busy, so here is the short version of what we would do first.",
    items: "Week 1 | Google profile, WhatsApp replies, enquiry tracking\nWeek 2 | Website and Instagram set up to bring enquiries\nEvery week | A short report on calls, chats and bookings",
    stats: "",
    cta_text: "Book a 15-minute call", cta_link: "https://wa.me/917827007676",
    closing: "Next step: {next_step}\n\n" + SIGN_Q },
  welcome: { label: "Welcome / onboarding", marketing: false,
    subject: "Welcome to FODO, {first_name}",
    eyebrow: "Welcome · onboarding",
    headline: "Welcome aboard, *{business_name}*",
    intro: "Hi {first_name},\n\nWelcome to FODO. We are starting work on the **{service}** for {business_name}. Here is how the first days go, so you know what to expect.",
    items: "Day 1 | Kick-off call and access to your accounts\nDay 2 to 5 | Set-up of Google profile, WhatsApp and tracking\nDay 7 | First review call with you\nEvery week | A short progress update by email",
    stats: "",
    cta_text: "", cta_link: "",
    closing: "Next step: {next_step}\n\n" + SIGN_Q },
  invoice_reminder: { label: "Invoice reminder", marketing: false,
    subject: "Payment reminder: {amount} for {business_name}",
    eyebrow: "Payment reminder",
    headline: "A gentle reminder, *{first_name}*",
    intro: "Hi {first_name},\n\nThis is a reminder for the payment for **{service}** for {business_name}. If it is already done, thank you, and please ignore this email.",
    items: "",
    stats: "{amount} | Amount due\n{date} | Due date",
    cta_text: "Pay now", cta_link: "{link}",
    closing: SIGN_Q },
  project_update: { label: "Project update", marketing: false,
    subject: "{business_name}: project update",
    eyebrow: "Project update · {service}",
    headline: "Where *{business_name}* stands",
    intro: "Hi {first_name},\n\nHere is this week's update on the {service} for {business_name}.",
    items: "Done | \nIn progress | \nNext | {next_step}",
    stats: "",
    cta_text: "", cta_link: "",
    closing: SIGN_Q },
  report_delivery: { label: "Report delivery", marketing: false,
    subject: "Your report for {business_name} is ready",
    eyebrow: "Report",
    headline: "Your report is *ready*",
    intro: "Hi {first_name},\n\nThe report for **{business_name}** is ready. It covers what happened, what worked and what we do next.",
    items: "",
    stats: "",
    cta_text: "Open the report", cta_link: "{link}",
    closing: "Next step: {next_step}\n\n" + SIGN_Q },
  custom: { label: "Custom", marketing: true,
    subject: "{business_name} × FODO",
    eyebrow: "A note from FODO",
    headline: "Hi *{first_name}*",
    intro: "Hi {first_name},\n\n",
    items: "", stats: "", cta_text: "", cta_link: "",
    closing: SIGN_Q },
};
export const BLOCKS = ["eyebrow", "headline", "intro", "items", "stats", "cta_text", "cta_link", "closing"];
export const typeList = () => Object.keys(TYPES).map((id) => Object.assign({ id }, TYPES[id]));

/* ---------------- variables ---------------- */
export function varsFor(client, extra) {
  client = client || {}; extra = extra || {};
  const name = plain(client.name, 120).trim(), biz = plain(client.business, 160).trim();
  /* a contact person's first name; for a business-only record (no person, or the name is the business) the business name */
  const fn = name && name.toLowerCase() !== biz.toLowerCase() ? firstName(name) || name : "";
  const v = { client_name: name || biz, first_name: fn || biz || "there", business_name: biz || name, city: plain(client.city, 80).trim(),
    industry: plain(client.industry, 80).trim(), service: plain(client.service, 160).trim(), phone: plain(client.phone, 40).trim(), email: plain(client.email, 254).trim(),
    amount: plain(client.amount, 80).trim(), pricing: plain(client.pricing, 2000).trim(), date: "", next_step: "", link: "" };
  for (const k of ["amount", "pricing", "date", "next_step", "link"]) if (extra[k] != null && String(extra[k]).trim() !== "") v[k] = plain(extra[k], k === "pricing" ? 2000 : 400).trim();
  return v;
}
export const fill = (s, v) => String(s == null ? "" : s).replace(/\{([a-z_]+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(v, k) ? v[k] : m));
/* names of {variables} still empty after filling, so the admin sees them before sending */
export function emptyVars(blocks, subject, v) {
  const seen = new Set();
  [subject].concat(BLOCKS.map((b) => blocks[b])).forEach((s) => String(s || "").replace(/\{([a-z_]+)\}/g, (m, k) => { if (!v[k]) seen.add(k); return m; }));
  return [...seen];
}

/* the blocks for one email: the type's defaults, overridden by whatever the admin edited */
export function blocksFor(typeId, edited) {
  const t = TYPES[typeId] || TYPES.custom, e = edited || {}, out = {};
  for (const b of BLOCKS) out[b] = plain(e[b] != null ? e[b] : t[b], b === "intro" || b === "closing" || b === "items" || b === "stats" ? 6000 : 400);
  return out;
}

/* ---------------- rendering ---------------- */
const inline = (s) => esc(s).replace(/\*\*([^*\n]{1,200})\*\*/g, '<b style="color:' + C.text + ';font-weight:700">$1</b>')
  .replace(/\b(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, (u) => '<a href="' + u + '" target="_blank" style="color:' + C.violet + ';text-decoration:underline">' + u + "</a>");
const accent = (s) => esc(s).replace(/\*([^*\n]{1,80})\*/g, '<span style="font-family:' + SERIF + ';font-style:italic;font-weight:400;white-space:nowrap;color:' + C.violet + '">$1</span>');
const paras = (t, size) => String(t || "").trim().split(/\n{2,}/).filter((p) => p.trim()).map((p) =>
  '<p style="margin:0 0 16px 0;font-family:' + FONT + ";font-size:" + (size || 16) + "px;line-height:" + (size ? 22 : 26) + "px;color:" + (size ? C.dim : C.muted) + '">' + inline(p.trim()).replace(/\n/g, "<br>") + "</p>").join("");
const split = (line) => { const i = line.indexOf("|"); return i < 0 ? [line.trim(), ""] : [line.slice(0, i).trim(), line.slice(i + 1).trim()]; };
const lines = (t) => String(t || "").split("\n").map((x) => x.trim()).filter((x) => x && x !== "|");
function itemRows(t) {
  const L = lines(t); if (!L.length) return "";
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 22px 0">' + L.map((l) => { const [a, b] = split(l);
    return '<tr><td valign="top" style="border-top:1px solid ' + C.line + ';padding:13px 12px 13px 0;font-family:' + FONT + ';font-size:15px;line-height:22px;color:' + C.text + ';font-weight:600">' + inline(a) + "</td>" +
      '<td valign="top" align="right" style="border-top:1px solid ' + C.line + ';padding:13px 0;font-family:' + FONT + ';font-size:15px;line-height:22px;color:' + C.muted + '">' + inline(b) + "</td></tr>"; }).join("") +
    '<tr><td colspan="2" style="border-top:1px solid ' + C.line + ';font-size:1px;line-height:1px">&nbsp;</td></tr></table>';
}
function statBoxes(t) {
  const L = lines(t).map(split).filter((x) => x[0]); if (!L.length) return "";
  const cell = (s) => '<td width="50%" valign="top" class="cm-stat" style="width:50%;padding:0 6px 12px 6px">' + (s ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td bgcolor="' + C.card + '" style="background:' + C.card + ";border:1px solid " + C.line + ';border-radius:14px;padding:18px 18px 16px 18px">' +
    '<p style="margin:0;font-family:' + FONT + ";font-size:24px;line-height:30px;font-weight:700;letter-spacing:-.4px;color:" + C.text + '">' + inline(s[0]) + "</p>" +
    '<p style="margin:6px 0 0 0;font-family:' + FONT + ";font-size:13px;line-height:18px;color:" + C.dim + '">' + inline(s[1]) + "</p></td></tr></table>" : "&nbsp;") + "</td>";
  let rows = ""; for (let i = 0; i < L.length; i += 2) rows += "<tr>" + cell(L[i]) + cell(L[i + 1]) + "</tr>";
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cm-stats" style="margin:0 0 14px -6px;width:calc(100% + 12px)">' + rows + "</table>";
}
const MQ = "<style>@media only screen and (max-width:660px){.cm-outer{padding:0!important}.cm-card{border-radius:0!important;border-left:0!important;border-right:0!important}" +
  ".cm-px{padding-left:22px!important;padding-right:22px!important}.cm-h1{font-size:28px!important;line-height:34px!important}" +
  ".cm-stats{margin:0 0 14px 0!important;width:100%!important}.cm-stat{display:block!important;width:100%!important;padding:0 0 10px 0!important}.cm-btn{display:block!important;text-align:center!important}}</style>";

/* o = { subject, blocks (filled), optOutUrl (marketing only), preheader } → { html, text } */
export function renderMail(o) {
  const b = o.blocks || {}, cta = safeUrl(b.cta_link), sign = "Anmol · FODO";
  const pre = plain(o.preheader || String(b.intro || "").replace(/\*\*/g, "").replace(/\s+/g, " "), 140);
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>' + esc(o.subject) + "</title>" + MQ + "</head>" +
    '<body style="margin:0;padding:0;background:' + C.page + '" bgcolor="' + C.page + '">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:' + C.page + '">' + esc(pre) + "</div>" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + C.page + '" style="background:' + C.page + '"><tr><td align="center" class="cm-outer" style="padding:28px 12px">' +
    '<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" class="cm-card" bgcolor="' + C.page + '" style="width:100%;max-width:640px;background:' + C.page + ";border:1px solid " + C.line + ';border-radius:22px;overflow:hidden">' +
    /* header: logo mark + tagline (fixed) */
    '<tr><td class="cm-px" style="padding:26px 40px;border-bottom:1px solid ' + C.line + '"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
      '<td valign="middle" width="44" style="width:44px"><a href="' + LINKS.site + '" target="_blank"><img src="' + SITE + '/favicon-192.png" width="34" height="34" alt="FODO" style="display:block;width:34px;height:34px;border:0;border-radius:9px"></a></td>' +
      '<td valign="middle" style="font-family:' + FONT + ";font-size:16px;font-weight:800;letter-spacing:-.2px;color:" + C.text + '">FODO</td>' +
      '<td valign="middle" align="right" style="font-family:' + FONT + ";font-size:10px;font-weight:700;letter-spacing:1.6px;color:" + C.dim + '">FEAR OF DIGITALLY OUT ?</td></tr></table></td></tr>' +
    /* content blocks (the only part that changes) */
    '<tr><td class="cm-px" style="padding:36px 40px 8px 40px">' +
      (b.eyebrow ? '<p style="margin:0 0 14px 0;font-family:' + FONT + ";font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:" + C.violet + '">' + esc(b.eyebrow) + "</p>" : "") +
      (b.headline ? '<h1 class="cm-h1" style="margin:0 0 24px 0;font-family:' + FONT + ";font-size:34px;line-height:40px;font-weight:700;letter-spacing:-.8px;color:" + C.text + '">' + accent(b.headline) + "</h1>" : "") +
      paras(b.intro) + itemRows(b.items) + statBoxes(b.stats) +
      (b.cta_text && cta ? '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 26px 0"><tr><td><a class="cm-btn" href="' + esc(cta) + '" target="_blank" style="display:inline-block;padding:14px 26px;border-radius:999px;background:' + C.violet + ";color:#0B0B0C;font-family:" + FONT + ';font-size:15px;font-weight:700;line-height:18px;text-decoration:none">' + esc(b.cta_text) + "</a></td></tr></table>" : "") +
      paras(b.closing) +
    "</td></tr>" +
    /* sign-off (fixed) */
    '<tr><td class="cm-px" style="padding:4px 40px 34px 40px"><p style="margin:0;font-family:' + FONT + ";font-size:15px;line-height:22px;color:" + C.muted + '">Regards,</p>' +
      '<p style="margin:4px 0 0 0;font-family:' + FONT + ";font-size:18px;line-height:24px;font-weight:700;color:" + C.text + '">' + esc(sign) + "</p>" +
      '<p style="margin:6px 0 0 0;font-family:' + FONT + ";font-size:13px;line-height:20px;color:" + C.dim + '"><a href="' + LINKS.site + '" style="color:' + C.dim + ';text-decoration:none">fodo.co.in</a> &nbsp;·&nbsp; <a href="' + LINKS.wa + '" style="color:' + C.dim + ';text-decoration:none">+91 78270 07676</a></p></td></tr>' +
    /* footer (fixed) */
    '<tr><td class="cm-px" bgcolor="' + C.card + '" style="padding:22px 40px 24px 40px;background:' + C.card + ";border-top:1px solid " + C.line + '">' +
      '<p style="margin:0 0 8px 0;font-family:' + FONT + ";font-size:13px;line-height:20px;color:" + C.text + ';font-weight:700">FODO <span style="font-family:' + SERIF + ';font-style:italic;font-weight:400;color:' + C.violet + '">· Fear Of Digitally Out ?</span></p>' +
      '<p style="margin:0;font-family:' + FONT + ";font-size:12px;line-height:18px;color:" + C.dim + '">FODO, New Delhi, India · <a href="' + LINKS.ig + '" style="color:' + C.dim + '">Instagram</a> · <a href="' + LINKS.li + '" style="color:' + C.dim + '">LinkedIn</a>' +
        (o.optOutUrl ? ' · <a href="' + esc(o.optOutUrl) + '" style="color:' + C.dim + '">Unsubscribe</a>' : "") + "</p></td></tr>" +
    "</table></td></tr></table></body></html>";
  const tx = (s) => String(s || "").replace(/\*\*([^*\n]+)\*\*/g, "$1");
  const text = [b.eyebrow ? String(b.eyebrow).toUpperCase() : "", String(b.headline || "").replace(/\*([^*\n]+)\*/g, "$1"), "", tx(b.intro).trim(),
    lines(b.items).map((l) => { const [a, c] = split(l); return "- " + a + (c ? ": " + c : ""); }).join("\n"),
    lines(b.stats).map((l) => { const [a, c] = split(l); return c + ": " + a; }).join("\n"),
    b.cta_text && cta ? b.cta_text + ": " + cta : "", tx(b.closing).trim(), "Regards,\n" + sign + "\nfodo.co.in · +91 78270 07676",
    "--\nFODO, New Delhi, India" + (o.optOutUrl ? "\nUnsubscribe: " + o.optOutUrl : "")].filter((x) => x !== undefined && x !== null && String(x).trim() !== "" || x === "").join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  return { html, text };
}
