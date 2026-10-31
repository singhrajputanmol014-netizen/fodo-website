/* v17.2 — X-Ray quality fixes from the findings review: Cloudflare service links, quiz forms, duplicate-title variants,
   Unknown tracking state, entity resolution (same-name companies), score labels. Runs the real engine in Chromium. */
const path = require("path"), fs = require("fs");
const { chromium } = require("playwright");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? "PASS " : "FAIL ") + m); };
(async () => {
  const b = await chromium.launch(), p = await b.newPage();
  await p.setContent("<html><body></body></html>");
  await p.addScriptTag({ content: fs.readFileSync(path.join(__dirname, "../js/xray-engine.js"), "utf8") });
  const r = await p.evaluate(() => {
    const E = window.FODO_XRAY_ENGINE, out = {};
    // 1. forms: a 10-question radio quiz is a tool, not a 37-field lead form; a contact form is a lead form
    const quiz = "<form>" + Array.from({ length: 10 }, (_, i) => [1, 2, 3, 4].map((v) => `<input type=radio name=q${i} value=${v}>`).join("")).join("") + "<button>See score</button></form>";
    const lead = "<form><input name=name placeholder='Your name'><input type=email name=email><input type=tel name=phone><textarea name=message></textarea><input type=hidden name=src></form>";
    const pg = E.parsePage("<html><head><title>T</title></head><body>" + quiz + lead + "<a href='/cdn-cgi/l/email-protection#abc'>mail</a></body></html>", "https://x.test/", { status: 200 });
    out.quiz = pg.forms[0]; out.lead = pg.forms[1];
    out.cdnSkip = E.skipSvc.test("/cdn-cgi/l/email-protection");
    // 2. entity resolution
    const B = { name: { value: "FODO" }, domain: "fodo.co.in", industry: { value: "Marketing agency" }, services: { value: ["SEO", "Meta Ads"] } };
    const c = E.entityContext(B, { city: "New Delhi" });
    out.app = E.aboutUs("Fodo is the fast and fun photo printing app", "https://apps.apple.com/fodo", c);
    out.real = E.aboutUs("FODO did our SEO in Delhi", "https://reddit.com/r/delhi/x", c);
    out.site = E.aboutUs("see fodo.co.in", "", c);
    out.market = E.aboutUs("Best SEO agencies in Delhi", "", c);
    // 3. tracking: GTM present → pixels Unknown; own analytics script → Analytics Unknown; nothing → Not detected (false)
    const T1 = E.trackingAudit([{ name: "Google Tag Manager" }], {}, "<script src='https://www.googletagmanager.com/gtm.js'></script>");
    const T2 = E.trackingAudit([], {}, "<script src='./js/analytics.js?v=1'></script>");
    const T3 = E.trackingAudit([], {}, "<html></html>");
    const get = (T, re) => T.rows.find((x) => re.test(x.item));
    out.gtmPixel = get(T1, /Meta/).you; out.ownGa = get(T2, /^Analytics/).you; out.ownGaHow = get(T2, /^Analytics/).how; out.none = get(T3, /Meta/).you; out.consent = get(T2, /Cookie/).you;
    // 4. AI visibility: a question that already names the brand does not count
    const V = E.visibility([{ q: "What are good FODO alternatives?", answer: "FODO and others", engine: "groq" }, { q: "best SEO agency Delhi", answer: "Try FODO first", engine: "groq" }], B, []);
    out.vis = V.rows.map((x) => [x.aboutYou, x.brand]);
    return out;
  });
  ok(r.quiz.tool && !r.quiz.lead && r.quiz.fieldCount === 10, "10-question radio quiz = a tool with 10 questions (not a 40-field lead form) [" + r.quiz.fieldCount + " fields]");
  ok(r.lead.lead && !r.lead.tool && r.lead.fieldCount === 4, "contact form = lead form, 4 visible fields, hidden field ignored");
  ok(r.cdnSkip, "Cloudflare /cdn-cgi/ service links are never crawled or reported as broken");
  ok(!r.app.ok && /different company/.test(r.app.why), "“Fodo photo printing app” is set aside as a different company");
  ok(r.real.ok && r.site.ok && r.market.ok && r.market.market, "real FODO mentions, the domain, and market discussions are kept");
  ok(r.gtmPixel === null && r.ownGa === null && /analytics\.js/.test(r.ownGaHow) && r.consent === null, "tracking: inside GTM / site's own script → Unknown (with the reason), not 'No'");
  ok(r.none === false, "tracking: nothing at all → Not detected");
  ok(r.vis[0][0] === true && r.vis[0][1] === false && r.vis[1][1] === true, "AI visibility: brand-named question not counted, real mention counted");
  // 5. labels in the report renderer
  const X = fs.readFileSync(path.join(__dirname, "../js/xray.js"), "utf8");
  ok(/Digital Growth Health/.test(X) && /Digital Market Presence/.test(X) && !/Overall Growth Health/.test(X), "scores renamed: Digital Growth Health / Digital Market Presence");
  ok(/not your sales or profit/.test(X), "headline score says it is not a business (sales/profit) score");
  const H = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  ok(/href="tel:\+917827007676"/.test(H) && /wa\.me\/917827007676/.test(H), "static HTML has tap-to-call and WhatsApp links (visible to crawlers and no-JS visitors)");
  await b.close();
  console.log("\nv17.2 engine: " + pass + "/" + (pass + fail) + " passed"); process.exit(fail ? 1 : 0);
})();
