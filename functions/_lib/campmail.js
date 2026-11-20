/* FODO v53.9 campaign email design (Admin ▸ Email campaigns). The FODO website's look: #050505 page, #111 card, #222 lines,
   #F5F3EE text, #8C8C8C muted, #7B61FF only as the small dot. Header = the site's particle orb (assets/email/campaign-hero.jpg).
   Email-safe: tables + inline styles, one <style> block only for phones (clients that drop it still get a fluid layout).
   Designed in Figma (file p18tQaBDyE64sWrAy5RV1X, page Emails, frame "Email · FODO campaign (600)"). */
const SITE = "https://www.fodo.co.in";
export const LINKS = { site: SITE + "/", studio: SITE + "/fodo-studio/", wa: "https://wa.me/917827007676", ig: "https://instagram.com/fodo.co.in", li: "https://www.linkedin.com/company/fodo_co_in/", x: "https://x.com/fodo_media" };
const C = { page: "#050505", card: "#111111", raised: "#171717", line: "#222222", text: "#F5F3EE", body: "#C9C7C1", muted: "#8C8C8C", dot: "#7B61FF" };
const FONT = "'Inter Tight','Inter','Segoe UI',Helvetica,Arial,sans-serif";
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const link = (s) => s.replace(/\b(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" style="color:' + C.text + ';text-decoration:underline">$1</a>')
  .replace(/(^|[\s(])((?:www\.)?fodo\.co\.in(?:\/[^\s<]*[^\s<.,;:!?)])?)/g, (m, a, u) => a + '<a href="https://' + (u.startsWith("www.") ? u : "www." + u) + '" style="color:' + C.text + ';text-decoration:underline">' + u + "</a>");
const MQ = "<style>@media only screen and (max-width:620px){.fc-outer{padding:0!important}.fc-card{border-radius:0!important;border-left:0!important;border-right:0!important}" +
  ".fc-px{padding-left:20px!important;padding-right:20px!important}.fc-h1{font-size:26px!important;line-height:32px!important}.fc-hero{height:auto!important}" +
  ".fc-btn{display:block!important;text-align:center!important;margin:0 0 10px 0!important}.fc-sp{display:none!important}}</style>";

function paras(text) {
  return String(text || "").replace(/\r/g, "").trim().split(/\n{2,}/).filter(Boolean).map((p) =>
    '<p style="margin:0 0 16px 0;font-family:' + FONT + ';font-size:16px;line-height:26px;color:' + C.body + '">' + link(esc(p)).replace(/\n/g, "<br>") + "</p>").join("");
}
const btn = (href, label, primary) => '<a class="fc-btn" href="' + esc(href) + '" target="_blank" style="display:inline-block;padding:14px 22px;border-radius:999px;font-family:' + FONT +
  ';font-size:15px;font-weight:700;line-height:18px;text-decoration:none;' + (primary ? "background:" + C.text + ";color:" + C.page + ";border:1px solid " + C.text : "background:" + C.card + ";color:" + C.text + ";border:1px solid #333333") + '">' + esc(label) + "</a>";
const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");

/* o: { subject, body (plain text, already personal), eyebrow, attachment: {name,size}, replyTo, sign } → { html, text } */
export function campaignMail(o) {
  const sign = o.sign || "Team FODO", reply = o.replyTo || "anmol@fodo.co.in", eb = o.eyebrow || "A note from FODO";
  const replyHref = "mailto:" + reply + "?subject=" + encodeURIComponent("Re: " + (o.subject || "FODO"));
  const ext = o.attachment ? String(o.attachment.name).split(".").pop().slice(0, 4).toUpperCase() : "";
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"><title>' + esc(o.subject) + "</title>" + MQ + "</head>" +
    '<body style="margin:0;padding:0;background:' + C.page + '">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + esc(String(o.body || "").replace(/\s+/g, " ").slice(0, 140)) + "</div>" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + C.page + '" style="background:' + C.page + '"><tr><td align="center" class="fc-outer" style="padding:28px 12px">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="fc-card" style="width:100%;max-width:600px;background:' + C.page + ';border:1px solid ' + C.line + ';border-radius:24px;overflow:hidden">' +
    /* header: logo + the site's orb */
    '<tr><td style="padding:0;background:' + C.page + '"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" background="' + SITE + '/assets/email/campaign-hero.jpg" bgcolor="' + C.page + '" style="background-color:' + C.page + ';background-image:url(' + SITE + '/assets/email/campaign-hero.jpg);background-position:right center;background-size:cover;background-repeat:no-repeat">' +
      '<tr><td class="fc-px fc-hero" height="220" valign="top" style="height:220px;padding:28px 36px">' +
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right:10px"><img src="' + SITE + '/favicon-192.png" width="30" height="30" alt="FODO" style="display:block;border-radius:8px"></td>' +
        '<td style="font-family:' + FONT + ';font-size:15px;font-weight:800;letter-spacing:-.2px;color:' + C.text + '">FODO<span style="color:' + C.dot + '">.</span></td></tr></table>' +
        '<p style="margin:86px 0 0 0;font-family:' + FONT + ';font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:' + C.muted + '"><span style="color:' + C.dot + '">&#9679;</span>&nbsp; ' + esc(eb) + "</p>" +
      "</td></tr></table></td></tr>" +
    /* subject as the headline */
    '<tr><td class="fc-px" style="padding:8px 36px 4px 36px"><h1 class="fc-h1" style="margin:0;font-family:' + FONT + ';font-size:30px;line-height:36px;font-weight:800;letter-spacing:-.6px;color:' + C.text + '">' + esc(o.subject) + '<span style="color:' + C.dot + '">.</span></h1></td></tr>' +
    /* the personal message */
    '<tr><td class="fc-px" style="padding:22px 36px 6px 36px">' + paras(o.body) + "</td></tr>" +
    /* attachment card */
    (o.attachment ? '<tr><td class="fc-px" style="padding:6px 36px 10px 36px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="fc-att" style="background:' + C.card + ';border:1px solid ' + C.line + ';border-radius:16px">' +
      '<tr><td width="64" style="width:64px;padding:16px 0 16px 18px" valign="middle"><div style="width:46px;height:46px;border-radius:12px;background:' + C.raised + ';border:1px solid #2a2a2a;text-align:center;font-family:' + FONT + ';font-size:12px;font-weight:800;line-height:46px;color:' + C.text + '">' + esc(ext || "FILE") + "</div></td>" +
      '<td style="padding:16px 18px 16px 14px" valign="middle"><p style="margin:0;font-family:' + FONT + ';font-size:15px;font-weight:700;line-height:20px;color:' + C.text + ';word-break:break-all">' + esc(o.attachment.name) + '</p><p style="margin:4px 0 0 0;font-family:' + FONT + ';font-size:13px;line-height:18px;color:' + C.muted + '">Attached to this email' + (o.attachment.size ? " · " + kb(o.attachment.size) : "") + "</p></td></tr></table></td></tr>" : "") +
    /* buttons */
    '<tr><td class="fc-px" style="padding:18px 36px 8px 36px">' + btn(replyHref, "Reply to this email", true) + '<span class="fc-sp" style="display:inline-block;width:8px"></span>' + btn(LINKS.studio, "See FODO Studio", false) + "</td></tr>" +
    /* sign-off */
    '<tr><td class="fc-px" style="padding:26px 36px 30px 36px"><p style="margin:0;font-family:' + FONT + ';font-size:16px;line-height:24px;color:' + C.body + '">Regards,</p>' +
      '<p style="margin:2px 0 0 0;font-family:' + FONT + ';font-size:18px;font-weight:800;line-height:24px;color:' + C.text + '">' + esc(sign) + '<span style="color:' + C.dot + '">.</span></p>' +
      '<p style="margin:6px 0 0 0;font-family:' + FONT + ';font-size:13px;line-height:20px;color:' + C.muted + '"><a href="' + LINKS.site + '" style="color:' + C.muted + ';text-decoration:none">fodo.co.in</a> &nbsp;·&nbsp; <a href="' + LINKS.wa + '" style="color:' + C.muted + ';text-decoration:none">WhatsApp +91 78270 07676</a></p></td></tr>' +
    /* footer */
    '<tr><td class="fc-px" style="padding:22px 36px 26px 36px;background:#0b0b0b;border-top:1px solid ' + C.line + '">' +
      '<p style="margin:0 0 10px 0;font-family:' + FONT + ';font-size:13px;line-height:20px;color:' + C.text + ';font-weight:700">FODO <span style="color:' + C.muted + ';font-weight:400">· Fear Of Digitally Out ?</span></p>' +
      '<p style="margin:0 0 12px 0;font-family:' + FONT + ';font-size:13px;line-height:20px">' + [["Instagram", LINKS.ig], ["LinkedIn", LINKS.li], ["X", LINKS.x], ["WhatsApp", LINKS.wa], ["fodo.co.in", LINKS.site]].map((l) => '<a href="' + l[1] + '" style="color:' + C.muted + ';text-decoration:underline">' + l[0] + "</a>").join(' <span style="color:#333333">&nbsp;/&nbsp;</span> ') + "</p>" +
      '<p style="margin:0;font-family:' + FONT + ';font-size:12px;line-height:18px;color:#6b6b6b">FODO, New Delhi, India. You\'re getting this one email from FODO. If you\'d rather not hear from us again, just reply STOP.</p></td></tr>' +
    "</table></td></tr></table></body></html>";
  const text = String(o.body || "").trim() + (o.attachment ? "\n\n[Attached: " + o.attachment.name + "]" : "") + "\n\nRegards,\n" + sign + "\nfodo.co.in · WhatsApp +91 78270 07676\n\n--\nFODO, New Delhi, India. If you'd rather not hear from us again, just reply STOP.";
  return { html, text };
}
