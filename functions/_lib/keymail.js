/* FODO v53.5: the "Your FODO Studio key" email. Design: Figma file p18tQaBDyE64sWrAy5RV1X, page Emails,
   frame "Email · FODO Studio key (600)". Same look as fodo.co.in (dark, violet to pink, Geist), with the site's
   particle animation as an animated GIF header (/assets/email/studio-hero.gif: orb to waves to the FODO wordmark).
   Email apps run no scripts, so "Copy key" opens fodo.co.in/studio/key/#KEY: that page shows the key and copies it
   with one tap (the key stays in the # part of the link, which browsers never send to any server). The key itself
   is also in a box that selects whole on one tap. Tables + inline styles only, so Gmail, Outlook and Apple Mail agree. */
const SITE = "https://www.fodo.co.in";
const C = { bg: "#0f0f16", card: "#171722", card2: "#1d1d2a", line: "#2a2838", text: "#f5f4fa", text2: "#d2cfe0", muted: "#9f9bb3", purple: "#9b7bff", pink: "#ff8a9b", deep: "#0b0b12" };
const FONT = "'Geist','Inter','Segoe UI',Roboto,Helvetica,Arial,sans-serif", MONO = "'Geist Mono','SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const WIN_CMD = "irm https://www.fodo.co.in/downloads/win-install.ps1 | iex";
export const MAC_CMD = "curl -fsSL https://www.fodo.co.in/downloads/mac-install.sh | bash";
export const LINKS = { site: SITE + "/", lab: SITE + "/growth-lab/", wa: "https://wa.me/917827007676", ig: "https://instagram.com/fodo.co.in", li: "https://www.linkedin.com/company/fodo_co_in/", download: SITE + "/fodo-studio/#fs-download", studio: SITE + "/studio/" };
export const copyUrl = (key) => SITE + "/studio/key/#" + encodeURIComponent(key);
/* phones (Gmail app, Apple Mail, Outlook mobile read this): edge-to-edge card, smaller title and key on one line,
   full-width buttons, the 4 feature tiles stacked. Without it the email still fits (fluid widths, the key wraps). */
const MQ = '<style>@media only screen and (max-width:620px){' +
  '.fo-outer{padding:0!important}.fo-card{border-radius:0!important;border-left:0!important;border-right:0!important}' +
  '.fo-px{padding:24px 18px 4px 18px!important}.fo-ftr{padding:22px 18px!important}' +
  '.fo-h1{font-size:25px!important;line-height:31px!important}' +
  '.fo-key{font-size:15px!important;letter-spacing:0!important;padding:14px 6px!important;word-break:normal!important;white-space:nowrap!important}' +
  '.fo-btn{display:block!important;text-align:center!important;margin:0 0 10px 0!important}.fo-sp{display:none!important}' +
  '.fo-tiles{margin:0!important;width:100%!important}.fo-tile{display:block!important;width:100%!important;padding:0 0 10px 0!important}' +
  '}</style>';
const firstName = (n) => { const f = String(n || "").trim().split(/\s+/)[0] || ""; return /^[\p{L}][\p{L}'.-]{0,30}$/u.test(f) ? f : ""; };

const p = (t, st) => '<p style="margin:0;font-family:' + FONT + ';' + (st || "font-size:15px;line-height:24px;color:" + C.text2) + '">' + t + "</p>";
const box = (inner, st) => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td bgcolor="' + ((st && st.bg) || C.card) + '" style="background:' + ((st && st.bg) || C.card) + ';border:1px solid ' + ((st && st.line) || C.line) + ';border-radius:' + ((st && st.r) || 16) + 'px;padding:' + ((st && st.pad) || "18px 20px") + '">' + inner + "</td></tr></table>";
const gap = (h) => '<div style="height:' + h + 'px;line-height:' + h + 'px;font-size:1px">&nbsp;</div>';
const label = (t, c) => p(esc(t), "font-size:11px;line-height:16px;letter-spacing:1.6px;font-weight:600;text-transform:uppercase;color:" + (c || C.muted));
const btn = (href, text, primary) => '<a href="' + esc(href) + '" target="_blank" class="fo-btn" style="display:inline-block;font-family:' + FONT + ';font-size:15px;font-weight:600;line-height:20px;text-decoration:none;border-radius:999px;padding:13px 22px;' +
  (primary ? "color:#ffffff;background:" + C.purple + ";background-image:linear-gradient(90deg," + C.purple + "," + C.pink + ")" : "color:" + C.text + ";background:" + C.card2 + ";border:1px solid " + C.line) + '">' + esc(text) + "</a>";
const code = (t) => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="' + C.deep + '" style="background:' + C.deep + ';border:1px solid ' + C.line + ';border-radius:10px;padding:10px 12px;font-family:' + MONO + ';font-size:13px;line-height:19px;color:#c9bcff;word-break:break-all;-webkit-user-select:all;user-select:all">' + esc(t) + "</td></tr></table>";
const step = (n, title, text, cmd) => box('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="44" valign="top" style="width:44px"><div style="width:30px;height:30px;line-height:30px;border-radius:15px;text-align:center;font-family:' + FONT + ';font-size:14px;font-weight:700;color:#ffffff;background:' + C.purple + ';background-image:linear-gradient(135deg,' + C.purple + ',' + C.pink + ')">' + n + "</div></td><td valign=\"top\">" +
  p(esc(title), "font-size:16px;line-height:22px;font-weight:600;color:" + C.text) + gap(6) + p(text, "font-size:14px;line-height:21px;color:" + C.text2) + (cmd ? gap(10) + code(cmd) : "") + "</td></tr></table>");
const tile = (a, b) => '<td width="50%" valign="top" class="fo-tile" style="width:50%;padding:0 6px 12px 6px">' + box(p(esc(a), "font-size:15px;line-height:21px;font-weight:600;color:" + C.text) + gap(6) + p(esc(b), "font-size:13px;line-height:19px;color:" + C.muted), { pad: "16px" }) + "</td>";
const chip = (href, t) => '<a href="' + esc(href) + '" target="_blank" style="display:inline-block;margin:0 6px 8px 0;font-family:' + FONT + ';font-size:13px;font-weight:500;line-height:18px;color:' + C.text + ';text-decoration:none;background:' + C.card2 + ';border:1px solid ' + C.line + ';border-radius:999px;padding:8px 14px">' + esc(t) + "</a>";

/* o = { email, key, msg (FODO's own words, optional), name (optional) } */
export function keyMail(email, key, msg, name) {
  const fn = firstName(name), hi = fn ? "Hi " + esc(fn) + "," : "Hi,", E = esc(email), K = esc(key), note = String(msg || "").trim();
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"><title>Your FODO Studio key</title>' + MQ + '</head>' +
  '<body style="margin:0;padding:0;background:' + C.bg + '" bgcolor="' + C.bg + '">' +
  '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:' + C.bg + '">Your personal FODO Studio key is inside, with the 3-step install for Windows and Mac.</div>' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + C.bg + '" style="background:' + C.bg + '"><tr><td align="center" class="fo-outer" style="padding:24px 12px">' +
  '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="fo-card" style="width:100%;max-width:600px;background:' + C.bg + ';border:1px solid ' + C.line + ';border-radius:20px;overflow:hidden" bgcolor="' + C.bg + '">' +
  /* header: the site's particle animation */
  '<tr><td style="padding:0;line-height:0;font-size:0"><a href="' + LINKS.site + '" target="_blank"><img src="' + SITE + '/assets/email/studio-hero.gif" width="600" height="220" alt="FODO Studio" style="display:block;width:100%;max-width:600px;height:auto;border:0;background:#11111a"></a></td></tr>' +
  '<tr><td class="fo-px" style="padding:32px 36px 8px 36px">' +
    label("FODO Studio · your access", C.purple) + gap(10) +
    '<p class="fo-h1" style="margin:0;font-family:' + FONT + ';font-size:30px;line-height:36px;font-weight:700;color:' + C.text + '">Your FODO Studio key is ready</p>' + gap(12) +
    p(hi + " welcome to FODO Studio. Your personal key is below. It opens the desktop app and fodo.co.in/studio for <b style=\"color:" + C.text + "\">" + E + "</b>.", "font-size:16px;line-height:25px;color:" + C.text2) +
    (note ? gap(22) + box(label("A note from Anmol") + gap(6) + p(esc(note).replace(/\n/g, "<br>"), "font-size:15px;line-height:23px;color:" + C.text)) : "") +
    gap(26) +
    /* key card */
    box(label("Your studio key") + gap(14) +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="' + C.deep + '" class="fo-key" style="background:' + C.deep + ';border:1px solid #4a3f86;border-radius:14px;padding:16px 12px;font-family:' + MONO + ';font-size:21px;line-height:28px;font-weight:600;letter-spacing:1px;color:' + C.text + ';word-break:break-all;-webkit-user-select:all;user-select:all">' + K + "</td></tr></table>" + gap(16) +
      btn(copyUrl(key), "Copy key", true) + '<span class="fo-sp" style="display:inline-block;width:8px"></span>' + btn(LINKS.download, "Download FODO Studio", false) + gap(14) +
      p("Copy key opens a FODO page where your key is copied with one tap. You can also tap the key above to select it.", "font-size:13px;line-height:20px;color:" + C.muted), { pad: "24px", r: 20, line: "#3a3260" }) +
    gap(32) +
    /* install guide */
    p("Install in 3 steps", "font-size:21px;line-height:28px;font-weight:700;color:" + C.text) + gap(14) +
    step(1, "Windows 10 or 11", "Press <b>Start</b>, type <b>PowerShell</b> and press Enter. Paste this line and press Enter. Keep the window open (5 to 15 minutes the first time):", WIN_CMD) + gap(12) +
    step(2, "Mac (macOS 15 or newer)", "Press <b>Cmd + Space</b>, type <b>Terminal</b> and press Enter. Paste this line and press Enter:", MAC_CMD) + gap(12) +
    step(3, "Open FODO Studio and enter your key", "When the app opens, type <b>" + E + "</b>, paste your key and press <b>Open FODO Studio</b>. On the website: log in at <a href=\"" + LINKS.studio + "\" style=\"color:" + C.purple + "\">fodo.co.in/studio</a> with the same email and enter the same key.", null) + gap(12) +
    p("On your phone: open fodo.co.in/studio in Safari or Chrome, log in, then Add to Home Screen. Clipping needs a computer. Prefer a normal download? <a href=\"" + LINKS.download + "\" style=\"color:" + C.purple + "\">Download page</a>.", "font-size:13px;line-height:20px;color:" + C.muted) +
    gap(32) +
    /* what you get */
    p("What you can do with FODO Studio", "font-size:21px;line-height:28px;font-weight:700;color:" + C.text) + gap(14) +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="fo-tiles" style="margin:0 -6px;width:calc(100% + 12px)"><tr>' + tile("Every account, one calendar", "Plan, schedule and post to Instagram, Facebook, YouTube and more.") + tile("AI clipping on your PC", "Long videos become short clips with captions, on your own computer.") + "</tr><tr>" +
      tile("Inbox, analytics, reports", "All comments in one inbox, numbers and reports you can share.") + tile("Clients and approvals", "Separate projects per client, approval links and link in bio.") + "</tr></table>" +
    gap(20) +
    box(p("Good to know", "font-size:15px;line-height:21px;font-weight:600;color:" + C.text) + gap(8) +
      p("• One key works on 2 of your own computers.<br>• The app keeps working up to 48 hours without internet.<br>• Please don't share your key: it is tied to your account and FODO can turn it off.", "font-size:14px;line-height:22px;color:" + C.text2), { bg: "#1a1530", line: "#3a3260" }) +
    gap(20) +
    box(label("FODO · Fear of digitally out ?", C.purple) + gap(10) +
      p("We don't do marketing just to do marketing.", "font-size:19px;line-height:25px;font-weight:700;color:" + C.text) + gap(10) +
      p("FODO is a New Delhi digital growth studio by Anmol Singh and Rohit Saini. Strategy, creative, performance, technology and data, connected so every activity has a reason and a measure. FODO Studio is the tool we use for our own clients, now in your hands.", "font-size:14px;line-height:22px;color:" + C.text2) + gap(14) +
      chip(LINKS.site, "fodo.co.in") + chip(LINKS.lab, "Growth Lab") + chip(LINKS.wa, "WhatsApp") + chip(LINKS.ig, "Instagram") + chip(LINKS.li, "LinkedIn"), { pad: "22px", r: 20 }) +
    gap(28) +
  "</td></tr>" +
  /* footer */
  '<tr><td bgcolor="#0b0b10" class="fo-ftr" style="background:#0b0b10;padding:26px 36px;border-top:1px solid ' + C.line + '">' +
    p("Questions? Just reply to this email, or WhatsApp <a href=\"" + LINKS.wa + "\" style=\"color:" + C.text2 + "\">+91 78270 07676</a>.", "font-size:14px;line-height:21px;color:" + C.text2) + gap(8) +
    p("Anmol, FODO", "font-size:14px;line-height:20px;font-weight:600;color:" + C.text) + gap(6) +
    p("Don't get left behind.", "font-size:13px;line-height:19px;font-weight:500;color:" + C.purple) + gap(10) +
    p("You get this email because " + E + " asked for FODO Studio access. FODO, New Delhi, India.", "font-size:11px;line-height:16px;color:#6e6a85") +
  "</td></tr></table></td></tr></table></body></html>";

  const text = (fn ? "Hi " + fn + "," : "Hi,") + "\n\nWelcome to FODO Studio. Your personal key opens the desktop app and fodo.co.in/studio for " + email + ".\n\n" +
    (note ? "A note from Anmol:\n" + note + "\n\n" : "") +
    "YOUR STUDIO KEY\n" + key + "\nCopy it with one tap: " + copyUrl(key) + "\n\n" +
    "INSTALL IN 3 STEPS\n1. Windows 10 or 11: press Start, type PowerShell, press Enter. Paste this line and press Enter (keep the window open, 5 to 15 minutes the first time):\n   " + WIN_CMD + "\n" +
    "2. Mac (macOS 15 or newer): press Cmd + Space, type Terminal, press Enter. Paste this line and press Enter:\n   " + MAC_CMD + "\n" +
    "3. When the app opens, type " + email + ", paste your key and press Open FODO Studio. On the website, log in at " + LINKS.studio + " with the same email and enter the same key.\n" +
    "Phone: open fodo.co.in/studio, log in, then Add to Home Screen. Normal download: " + LINKS.download + "\n\n" +
    "WHAT YOU CAN DO\n- Plan, schedule and post to every account from one calendar\n- AI clipping with captions on your own computer\n- One inbox for comments, analytics and shareable reports\n- Separate client projects, approval links and link in bio\n\n" +
    "GOOD TO KNOW\n- One key works on 2 of your own computers\n- The app keeps working up to 48 hours without internet\n- Please don't share your key: it is tied to your account and FODO can turn it off\n\n" +
    "ABOUT FODO\nFODO (Fear Of Digitally Out ?) is a New Delhi digital growth studio by Anmol Singh and Rohit Saini. Strategy, creative, performance, technology and data, connected so every activity has a reason and a measure.\n" +
    LINKS.site + " · WhatsApp +91 78270 07676 · Instagram @fodo.co.in\n\nQuestions? Just reply to this email.\n\nAnmol, FODO\nDon't get left behind.";
  return { html, text };
}
