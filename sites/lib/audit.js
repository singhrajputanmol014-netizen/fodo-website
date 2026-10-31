/* FODO Website Builder, website audit + one-click fixes (v32). Deterministic and explainable: every issue says what is
   wrong, why it matters and how to fix it; issues marked `auto` can be fixed safely by FODO with one click (the editor saves,
   re-runs the audit and shows before/after). Seven scores: Design, SEO, Performance, Accessibility, Mobile, Conversion, Security.
   Runs in the browser (editor), on the server (publish checklist, FODO Brain), the same code everywhere. */
import { renderPage, PLACEHOLDER, safeUrl } from "./render.js";
import { contrast, fixContrast } from "./design.js";
import { legalText, sectionDefaults } from "./industry.js";

export const CATS = { design: "Design", seo: "SEO", performance: "Performance", accessibility: "Accessibility", mobile: "Mobile", conversion: "Conversion", security: "Security" };
const W = { high: 18, medium: 9, low: 4 };
const textOf = (html) => html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();

export function audit(doc, opt) {
  opt = opt || {}; const issues = [], add = (id, cat, level, page, problem, reason, fix, auto) => issues.push({ id: id + (page ? "@" + page : ""), key: id, cat, level, page: page || "", problem, reason, fix, auto: !!auto });
  const t = doc.theme || {}, S = doc.settings || {}, biz = S.business || {}, pages = doc.pages || [], home = pages.find((p) => p.slug === "home") || pages[0];
  const all = (type) => pages.some((p) => (p.sections || []).some((s) => s.type === type)), titles = {};
  /* ---- accessibility: colour contrast of the real tokens ---- */
  const bg = t.bg || (t.mode === "dark" ? "#0b0b10" : "#ffffff"), tx = t.text || (t.mode === "dark" ? "#f2f1f7" : "#16141f"), pr = t.primary || "#7B61FF";
  if (contrast(tx, bg) < 4.5) add("contrast-text", "accessibility", "high", "", "Body text is hard to read (contrast " + contrast(tx, bg).toFixed(1) + ":1).", "WCAG needs at least 4.5:1 so everyone, and every phone screen in sunlight, can read it.", "Darken the text colour (or lighten the background).", true);
  if (contrast("#ffffff", pr) < 4.5) add("contrast-button", "accessibility", "high", "", "White text on your brand colour buttons has low contrast (" + contrast("#ffffff", pr).toFixed(1) + ":1).", "Buttons are your most important element; low contrast lowers clicks and fails accessibility.", "Use a deeper shade of the brand colour.", true);
  if (contrast(pr, bg) < 3) add("contrast-links", "accessibility", "medium", "", "Links in your brand colour are faint on the background (" + contrast(pr, bg).toFixed(1) + ":1).", "Links need 3:1 against the page.", "Use a deeper shade of the brand colour.", true);
  /* ---- per page ---- */
  for (const p of pages) {
    const secs = p.sections || [], seo = p.seo || {}, html = renderPage(doc, p.slug, { base: "/", badge: false, noMotion: true }), body = textOf(html.split("<body>")[1] || ""), words = body.split(" ").length;
    const title = seo.title || ""; titles[title] = (titles[title] || 0) + 1;
    if (!seo.title) add("seo-title", "seo", "medium", p.slug, "“" + p.title + "” has no SEO title.", "Google shows it as the blue headline in results.", "Add a title of 30–60 characters with what you do and where.", true);
    else if (seo.title.length > 65) add("seo-title-long", "seo", "low", p.slug, "SEO title is " + seo.title.length + " characters.", "Google cuts titles after ~60 characters.", "Shorten it to 60 characters.", true);
    if (!seo.description && !biz.description) add("seo-desc", "seo", "medium", p.slug, "“" + p.title + "” has no meta description.", "It is the grey text under your link in Google, it decides whether people click.", "Write 120–160 characters about the page.", true);
    if (!p.noindex && words < 70 && !/^(contact|book|thank)/.test(p.slug)) add("thin", "seo", "low", p.slug, "“" + p.title + "” has very little text (" + words + " words).", "Thin pages rarely rank and don't answer visitors' questions.", "Add a short paragraph or FAQ, or ask the AI to expand it.", false);
    const h1 = (html.match(/<h1[\s>]/g) || []).length; if (h1 !== 1) add("h1", "seo", "high", p.slug, "“" + p.title + "” has " + h1 + " main headings (H1).", "Exactly one H1 tells Google and screen readers what the page is about.", "Make the first hero headline the only H1.", false);
    const hs = (html.match(/<h([1-6])[\s>]/g) || []).map((x) => +x[2]); for (let i = 1; i < hs.length; i++) if (hs[i] > hs[i - 1] + 1) { add("heading-order", "accessibility", "low", p.slug, "A heading level is skipped (H" + hs[i - 1] + " → H" + hs[i] + ").", "Screen-reader users navigate by headings.", "Give that section a title (H2) before its cards (H3).", false); break; }
    const noAlt = (html.match(/<img(?![^>]*alt="[^"]+")[^>]*>/g) || []).length; if (noAlt) add("alt", "accessibility", "medium", p.slug, noAlt + " image(s) without a description (alt text).", "Blind visitors and Google can't “see” the image.", "Describe each image in a few words.", true);
    const ph = (html.match(/class="ph[ "]/g) || []).length; if (ph >= 3) add("placeholder-images", "design", "medium", p.slug, ph + " image spaces are still empty on “" + p.title + "”.", "Real photos of your work, place or team build trust far better than shapes.", "Upload your own photos (Images in the panel).", false);
    const phText = JSON.stringify(secs).match(PLACEHOLDER) || []; if (phText.length) add("placeholder-text", "design", "high", p.slug, "Placeholder text left: " + [...new Set(phText)].slice(0, 3).join(", "), "Visitors would see unfinished text; reviews and numbers must be real.", "Replace with your real details, or delete that section.", false);
    if (secs.length > 14) add("too-long", "design", "low", p.slug, "“" + p.title + "” has " + secs.length + " sections.", "Very long pages lose people before the call-to-action.", "Move some sections to their own page.", false);
    for (let i = 1; i < secs.length; i++) if (secs[i].type === secs[i - 1].type && !/spacer|text/.test(secs[i].type)) { add("repeat", "design", "low", p.slug, "Two " + secs[i].type + " sections in a row.", "Repetition looks unfinished.", "Merge them or put something between them.", false); break; }
    secs.forEach((s) => { const pr0 = s.props || {}; const items = (pr0.items || []).length; if (/services|features/.test(s.type) && items > 9) add("cards", "design", "low", p.slug, items + " cards in one section.", "Too many choices slows decisions.", "Keep the best 6 and link to a services page.", false); });
    const imgs = (html.match(/<img /g) || []).length; if (imgs > 18) add("images-many", "performance", "medium", p.slug, imgs + " images on one page.", "Heavy pages load slowly on mobile data.", "Split the gallery or show fewer images.", false);
    const ext = (html.match(/<img[^>]+src="https?:\/\/(?!www\.fodo\.co\.in)/g) || []).length; if (ext) add("images-external", "performance", "low", p.slug, ext + " image(s) load from other websites.", "Outside images can be slow, huge or disappear, and you need the rights to use them.", "Upload them to your media (FODO compresses them to WebP).", false);
    const vids = (html.match(/<iframe/g) || []).length; if (vids > 3) add("embeds", "performance", "low", p.slug, vids + " embedded videos/maps.", "Each embed loads a whole other website.", "Keep the most useful two.", false);
    const hero = secs.find((s) => s.type === "hero"); if (hero) { const tt = String((hero.props || {}).title || ""); if (tt.length > 80) add("hero-long", "mobile", "medium", p.slug, "The main headline is " + tt.length + " characters.", "On a phone it fills the whole screen and pushes the button down.", "Keep it under 70 characters.", false); if (tt.split(/\s+/).some((w) => w.length > 18)) add("long-word", "mobile", "medium", p.slug, "A very long word in the headline can overflow on phones.", "Words that don't fit make the page scroll sideways.", "FODO can fit headings to small screens.", true); }
    if ((html.match(/href="http:\/\//g) || []).length) add("http", "security", "medium", p.slug, "Links to insecure (http://) addresses.", "Browsers warn visitors about insecure pages.", "Switch them to https://.", true);
    const fForms = (html.match(/data-fodo-form/g) || []).length, maxFields = Math.max(0, ...secs.filter((s) => /contact|booking/.test(s.type)).map((s) => ((s.props.form && s.props.form.fields) || s.props.fields || [1, 2, 3, 4]).length));
    if (fForms && maxFields > 7) add("form-friction", "conversion", "medium", p.slug, "A form asks for " + maxFields + " things.", "Every extra field loses enquiries.", "Ask only name, phone and message; get the rest on the call.", false);
    secs.filter((s) => s.type === "legal" && s.props && s.props.generated && !s.props.reviewed).forEach(() => add("legal-review", "security", "medium", p.slug, "“" + p.title + "” is a generated draft.", "Legal text must match your business and the law where you operate. FODO is not a lawyer.", "Read it, adjust the [brackets], then tick “I've reviewed this”.", false));
    secs.filter((s) => s.type === "embed").forEach((s) => { if (!(s.props || {}).url) add("embed-empty", "design", "low", p.slug, "An embed section has no link.", "It shows an empty box.", "Paste a YouTube, Vimeo, Maps, Calendly, Typeform, Google Forms or Spotify link.", false); });
  }
  Object.keys(titles).forEach((k) => { if (k && titles[k] > 1) add("dup-title", "seo", "medium", "", "Several pages share the SEO title “" + k + "”.", "Google can't tell them apart.", "Give each page its own title.", true); });
  /* ---- conversion ---- */
  const hero = home && (home.sections || []).find((s) => s.type === "hero");
  if (!hero || !(hero.props.cta && hero.props.cta.label)) add("hero-cta", "conversion", "high", "home", "The top of the home page has no clear button.", "Most visitors decide in seconds, they need one obvious next step.", "Add a button like “" + (S.ctaLabel || "Book now") + "”.", !!hero);
  if (!biz.phone && !biz.whatsapp && !all("contact") && !all("booking")) add("no-contact", "conversion", "high", "", "Visitors have no way to contact you.", "A website without a contact path loses every lead.", "Add a contact section with phone, WhatsApp and a form.", true);
  if (home && !(home.sections || []).some((s) => /cta|contact|booking|newsletter|whatsapp/.test(s.type))) add("end-cta", "conversion", "medium", "home", "The home page ends without a call-to-action.", "People who scroll to the end are interested, give them a button.", "Add a call-to-action band before the footer.", true);
  if (!all("testimonials") && !all("stats") && !all("logos") && !all("team")) add("trust", "conversion", "medium", "", "No trust signals (reviews, numbers, team or client logos).", "Proof is the biggest reason people choose one business over another.", "Add REAL reviews or numbers, never invented ones.", false);
  if (biz.whatsapp && !S.whatsappFloat && !all("whatsapp")) add("wa-float", "conversion", "low", "", "Your WhatsApp number isn't one tap away.", "In India most enquiries start on WhatsApp.", "Show a floating WhatsApp button.", true);
  /* ---- mobile (from the real 375px measurement, when the editor passes it) ---- */
  (opt.mobile || []).forEach((m) => add("overflow", "mobile", "high", m.page, "“" + m.label + "” is wider than a phone screen.", "The page scrolls sideways, it looks broken on mobile.", "FODO can fit it to small screens.", true));
  /* ---- performance (site-wide) ---- */
  const fonts = new Set([t.font, t.headingFont].filter(Boolean)); if (fonts.size > 2) add("fonts", "performance", "low", "", fonts.size + " font families.", "Each font is a download.", "Use one or two.", false);
  if (t.motion === "experimental" && pages.length > 8) add("motion-cost", "performance", "low", "", "Experimental motion on a large website.", "Lots of animation costs battery on older phones.", "Use “Dynamic” or “Modern”.", true);
  if ((S.customCss || "").length > 12000) add("css", "performance", "low", "", "Large custom CSS.", "Unused CSS slows the first paint.", "Remove rules you no longer use.", false);
  /* ---- security / trust ---- */
  if ((all("contact") || all("booking") || all("newsletter")) && !pages.some((p) => /privacy/.test(p.slug))) add("privacy", "security", "medium", "", "Your forms collect personal data but there's no privacy policy.", "Indian law (DPDP Act) and visitors expect to know how data is used.", "Add a Privacy Policy page (FODO drafts it for you to review).", true);
  if (S.customHead || S.customBody) add("custom-code", "security", "low", "", "Custom code is installed.", "Third-party scripts can slow the site or collect data.", "Keep only scripts you trust; it runs only on your own domain.", false);
  if (pages.some((p) => p.password)) add("password", "security", "low", "", "A page uses a simple password.", "It hides a page from the public but is not an account system.", "Don't put sensitive data on it.", false);
  /* ---- scores ---- */
  const scores = {}; Object.keys(CATS).forEach((c) => { const seen = {}; scores[c] = Math.max(0, Math.round(100 - issues.filter((i) => i.cat === c).reduce((a, i) => { const n = (seen[i.id] = (seen[i.id] || 0) + 1); return a + (n === 1 ? W[i.level] : W[i.level] / 3); }, 0))); });
  const overall = Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length);
  const count = { high: issues.filter((i) => i.level === "high").length, medium: issues.filter((i) => i.level === "medium").length, low: issues.filter((i) => i.level === "low").length };
  return { overall, scores, count, issues: issues.sort((a, b) => W[b.level] - W[a.level]) };
}

/* one-click fixes, only the safe, mechanical ones (anything about content goes to the AI or to the user) */
export function autoFix(doc, ids, opt) {
  doc = JSON.parse(JSON.stringify(doc)); opt = opt || {}; const fixed = [], S = doc.settings = doc.settings || {}, biz = S.business || {}, t = doc.theme = doc.theme || {};
  const want = (key) => ids.filter((x) => x.split("@")[0] === key).map((x) => x.split("@")[1] || "");
  const pageOf = (slug) => doc.pages.find((p) => p.slug === slug);
  if (want("contrast-text").length) { t.text = fixContrast(t.text || (t.mode === "dark" ? "#f2f1f7" : "#16141f"), t.bg || (t.mode === "dark" ? "#0b0b10" : "#ffffff"), 4.6); fixed.push("contrast-text"); }
  if (want("contrast-button").length || want("contrast-links").length) { let c = t.primary || "#7B61FF"; c = fixContrast(c, "#ffffff", 4.6); if (contrast(c, t.bg || "#ffffff") < 3) c = fixContrast(c, t.bg || "#ffffff", 3.1); t.primary = c; fixed.push("contrast-button"); }
  const name = biz.name || "", city = biz.city || "";
  want("seo-title").forEach((slug) => { const p = pageOf(slug); if (!p) return; p.seo = Object.assign({}, p.seo, { title: (slug === "home" ? name + (biz.tagline ? ": " + biz.tagline : city ? ": " + (biz.industry || "") + " in " + city : "") : p.title + ": " + name).slice(0, 60) }); fixed.push("seo-title@" + slug); });
  want("seo-title-long").forEach((slug) => { const p = pageOf(slug); if (p && p.seo && p.seo.title) { p.seo.title = p.seo.title.slice(0, 57).replace(/\s+\S*$/, "") + "…"; fixed.push("seo-title-long@" + slug); } });
  want("seo-desc").forEach((slug) => { const p = pageOf(slug); if (!p) return; const hero = (p.sections || []).find((s) => s.type === "hero"), txt = (hero && hero.props.subtitle) || biz.description || (p.title + ": " + name + (city ? ", " + city : "") + ". Contact us today."); p.seo = Object.assign({}, p.seo, { description: String(txt).slice(0, 158) }); fixed.push("seo-desc@" + slug); });
  want("dup-title").forEach(() => { const seen = {}; doc.pages.forEach((p) => { const k = (p.seo || {}).title; if (k && seen[k]) p.seo.title = (p.title + ": " + name).slice(0, 60); if (k) seen[k] = 1; }); fixed.push("dup-title"); });
  want("alt").forEach((slug) => { const p = pageOf(slug); if (!p) return; (p.sections || []).forEach((s) => { const pr = s.props || {}, lab = pr.title || name || p.title; if (pr.image && !pr.imageAlt) pr.imageAlt = lab; (pr.images || []).forEach((im, k) => { if (!im.alt) im.alt = lab + " " + (k + 1); }); (pr.items || []).forEach((it) => { if (it.src && !it.alt) it.alt = it.title || lab; }); if (s.type === "image" && !pr.alt) pr.alt = pr.caption || lab; }); fixed.push("alt@" + slug); });
  want("long-word").concat(want("overflow")).forEach((slug) => { const p = pageOf(slug); if (!p) return; (p.sections || []).forEach((s) => { s.style = Object.assign({}, s.style, { mfit: true }); }); fixed.push("mobile@" + slug); });
  want("http").forEach((slug) => { const p = pageOf(slug); if (!p) return; p.sections = JSON.parse(JSON.stringify(p.sections).replace(/"http:\/\//g, '"https://')); fixed.push("http@" + slug); });
  const home = pageOf("home") || doc.pages[0], cta = (opt.cta || (home && ((home.sections.find((s) => s.type === "navbar") || {}).props || {}).cta || {}).label) || "Contact us";
  const contactSlug = (doc.pages.find((p) => p.sections.some((s) => /contact|booking/.test(s.type))) || {}).slug;
  if (want("hero-cta").length && home) { const h = home.sections.find((s) => s.type === "hero"); if (h) { h.props.cta = { label: cta, href: contactSlug ? contactSlug + "/" : "#contact" }; fixed.push("hero-cta"); } }
  if (want("no-contact").length) { doc.pages.push({ slug: doc.pages.some((p) => p.slug === "contact") ? "contact-us" : "contact", title: "Contact", seo: {}, sections: [home.sections.find((s) => s.type === "navbar"), { type: "contact", props: sectionDefaults("contact", { name, phone: biz.phone, email: biz.email, whatsapp: biz.whatsapp, address: biz.address }) }, home.sections.find((s) => s.type === "footer")].filter(Boolean).map((x) => JSON.parse(JSON.stringify(x))) }); fixed.push("no-contact"); }
  if (want("end-cta").length && home) { const at = home.sections.findIndex((s) => s.type === "footer"); home.sections.splice(at < 0 ? home.sections.length : at, 0, { type: "cta", props: { title: "Ready when you are", text: "Talk to " + (name || "us") + " today.", button: { label: cta, href: contactSlug ? contactSlug + "/" : "#contact" } } }); fixed.push("end-cta"); }
  if (want("wa-float").length) { S.whatsappFloat = true; fixed.push("wa-float"); }
  if (want("motion-cost").length) { t.motion = "dynamic"; fixed.push("motion-cost"); }
  if (want("privacy").length && !doc.pages.some((p) => /privacy/.test(p.slug))) { const nav = home.sections.find((s) => s.type === "navbar"), foot = home.sections.find((s) => s.type === "footer"); doc.pages.push({ slug: "privacy", title: "Privacy Policy", nav: false, seo: {}, sections: [nav, { type: "legal", props: legalText("privacy", biz) }, foot].filter(Boolean).map((x) => JSON.parse(JSON.stringify(x))) }); fixed.push("privacy"); }
  return { doc, fixed };
}
export const urlOk = safeUrl;
