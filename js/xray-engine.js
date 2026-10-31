/* FODO Business X-Ray, analysis engine (runs in the browser; no network of its own: every request goes through the
   fetcher/search functions the UI passes in, which call /api/xray/*).
   Rules this file follows:
     • data first, AI last, every score is computed from checks below; every check keeps evidence IDs
     • labels: OBSERVED (seen on a page / in an API answer), INFERRED (derived by a rule from observed data),
       ESTIMATED (third-party estimate), UNKNOWN (could not be determined), nothing is invented
     • a missing source makes its module "unavailable", never a made-up number
   window.FODO_XRAY_ENGINE = { CFG, Evidence, normUrl, regDomain, parseRobots, robotsAllowed, parsePage, crawl, discover,
     techChecks, siteChecks, buildQueries, intentOf, parseSearch, guessCountry, serpAnalysis, keywordOpps, candidates, compProfile, compareCompetitor,
     voice, presence, scores, opportunities, plan, visibility, compact } */
(function () {
  "use strict";
  var E = {};
  E.CFG = { MAX_PAGES: 50, MAX_DEPTH: 3, REQUEST_TIMEOUT: 15000, MAX_TOTAL_RUNTIME: 180000, CONCURRENCY: 4, MAX_QUERIES: 12, MAX_COMPETITORS: 5, UA_TOKEN: "fodo-businessxray" };
  var LABEL_CONF = { OBSERVED: 0.9, INFERRED: 0.65, ESTIMATED: 0.45, UNKNOWN: 0.2 };
  E.LABEL_CONF = LABEL_CONF;
  var norm = function (s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); };
  var low = function (s) { return norm(s).toLowerCase(); };
  var uniq = function (a) { var s = {}, o = []; (a || []).forEach(function (x) { var k = typeof x === "string" ? x.toLowerCase() : JSON.stringify(x); if (x && !s[k]) { s[k] = 1; o.push(x); } }); return o; };
  var clip = function (s, n) { s = norm(s); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
  E._u = { norm: norm, low: low, uniq: uniq, clip: clip };

  /* ======================= evidence ======================= */
  function Evidence() { this.list = []; this.n = 0; }
  Evidence.prototype.add = function (o) {
    var id = "E" + (++this.n);
    this.list.push({ id: id, type: o.type || "observation", claim: clip(o.claim, 300), sourceUrl: o.sourceUrl || o.pageUrl || "", sourceName: o.sourceName || "Website crawl",
      retrievedAt: o.retrievedAt || new Date().toISOString(), pageUrl: o.pageUrl || "", evidenceText: clip(o.evidenceText || "", 500), screenshotUrl: o.screenshotUrl || "", label: o.label || "OBSERVED", confidence: o.confidence != null ? o.confidence : LABEL_CONF[o.label || "OBSERVED"] });
    return id;
  };
  Evidence.prototype.get = function (id) { for (var i = 0; i < this.list.length; i++) if (this.list[i].id === id) return this.list[i]; return null; };
  E.Evidence = Evidence;

  /* ======================= URLs ======================= */
  var TRACK = /^(utm_[a-z]+|gclid|fbclid|msclkid|mc_[a-z]+|_ga|ref|yclid|igshid|srsltid)$/i;
  E.skipExt = /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|bmp|tiff?|zip|rar|7z|gz|tar|mp4|mp3|m4a|wav|webm|avi|mov|mkv|docx?|xlsx?|pptx?|csv|css|js|mjs|json|woff2?|ttf|otf|eot|exe|dmg|apk|ipa|rss|atom)$/i;
  // v17.2: service paths added by the host/CDN, not pages of the business (Cloudflare email protection decodes in the browser)
  E.skipSvc = /^\/cdn-cgi\//i;
  E.normUrl = function (u, base) {
    var x; try { x = new URL(String(u || "").trim(), base); } catch (e) { return null; }
    if (x.protocol !== "http:" && x.protocol !== "https:") return null;
    x.hash = ""; x.hostname = x.hostname.toLowerCase();
    if ((x.protocol === "https:" && x.port === "443") || (x.protocol === "http:" && x.port === "80")) x.port = "";
    var keep = []; x.searchParams.forEach(function (v, k) { if (!TRACK.test(k)) keep.push([k, v]); });
    keep.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
    x.search = keep.length ? "?" + keep.map(function (p) { return encodeURIComponent(p[0]) + "=" + encodeURIComponent(p[1]); }).join("&") : "";
    x.pathname = x.pathname.replace(/\/{2,}/g, "/").replace(/\/index\.(html?|php|aspx?)$/i, "/");
    if (x.pathname.length > 1 && /\/$/.test(x.pathname)) x.pathname = x.pathname.replace(/\/+$/, "") || "/";
    return x.toString();
  };
  E.regDomain = function (host) { var p = String(host || "").toLowerCase().replace(/^www\./, "").split("."); if (p.length <= 2) return p.join("."); var sld = p[p.length - 2]; return (p[p.length - 1].length === 2 && /^(co|com|org|net|gov|ac|edu|ltd|plc|nic|res|gen|firm|ind)$/.test(sld) ? p.slice(-3) : p.slice(-2)).join("."); };
  E.domainOf = function (u) { try { return E.regDomain(new URL(u).hostname); } catch (e) { return ""; } };

  /* ======================= robots.txt ======================= */
  E.parseRobots = function (txt) {
    var groups = [], cur = null, sitemaps = [], lastWasAgent = false;
    String(txt || "").split(/\r?\n/).forEach(function (line) {
      line = line.replace(/#.*$/, "").trim(); if (!line) return;
      var m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line); if (!m) return;
      var k = m[1].toLowerCase(), v = m[2].trim();
      if (k === "sitemap") { if (v) sitemaps.push(v); return; }
      if (k === "user-agent") { if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasAgent = true; return; }
      lastWasAgent = false;
      if (!cur) return;
      if (k === "disallow" || k === "allow") cur.rules.push({ allow: k === "allow", path: v });
    });
    return { groups: groups, sitemaps: sitemaps };
  };
  function ruleMatch(path, pat) {
    if (pat === "") return -1;
    var anchored = /\$$/.test(pat), p = pat.replace(/\$$/, "");
    var re = new RegExp("^" + p.split("*").map(function (s) { return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"); }).join(".*") + (anchored ? "$" : ""));
    return re.test(path) ? p.replace(/\*/g, "").length : -1;
  }
  E.robotsAllowed = function (robots, url, ua) {
    if (!robots || !robots.groups || !robots.groups.length) return true;
    ua = (ua || E.CFG.UA_TOKEN).toLowerCase();
    var g = robots.groups.filter(function (x) { return x.agents.some(function (a) { return a !== "*" && ua.indexOf(a) > -1; }); });
    if (!g.length) g = robots.groups.filter(function (x) { return x.agents.indexOf("*") > -1; });
    if (!g.length) return true;
    var path; try { var u = new URL(url); path = decodeURI(u.pathname) + u.search; } catch (e) { return true; }
    var best = -1, allow = true;
    g.forEach(function (grp) { grp.rules.forEach(function (r) { var l = ruleMatch(path, r.path); if (l > best || (l === best && l > -1 && r.allow)) { best = l; allow = r.allow; } }); });
    return best < 0 ? true : allow;
  };
  E.parseSitemap = function (xml) {
    var locs = [], isIndex = /<sitemapindex/i.test(xml);
    String(xml || "").replace(/<loc>\s*([^<\s]+)\s*<\/loc>/gi, function (_, u) { locs.push(u.replace(/&amp;/g, "&")); return ""; });
    return { index: isIndex, urls: locs.slice(0, 2000) };
  };

  /* ======================= page parsing ======================= */
  var CTA_RE = /\b(get|book|start|contact|call|buy|shop|order|request|schedule|sign ?up|register|join|try|download|subscribe|enquire|inquire|enquiry|quote|demo|consult|talk|hire|apply|reserve|whatsapp|chat|add to cart|checkout|claim|free trial|let'?s talk|speak|visit|explore plans|see pricing|view pricing)\b/i;
  var GENERIC_CTA = /^(submit|send|click here|here|go|ok|learn more|read more|more|continue|next|details|view|see more|know more)$/i;
  var SOCIAL = { facebook: /facebook\.com\/(?!sharer|share|dialog|plugins|tr\b)/i, instagram: /instagram\.com\/(?!p\/|reel\/|explore)/i, linkedin: /linkedin\.com\/(company|in|school)\//i, twitter: /(twitter|x)\.com\/(?!intent|share|home)/i,
    youtube: /youtube\.com\/(@|c\/|channel\/|user\/)|youtu\.be\//i, pinterest: /pinterest\.[a-z.]+\/(?!pin\/create)/i, tiktok: /tiktok\.com\/@/i, whatsapp: /wa\.me\/|api\.whatsapp\.com\/send|whatsapp\.com\/(channel|catalog)/i };
  var PRICE_RE = /(₹|rs\.?\s?|inr\s?|\$|usd\s?|€|£|aed\s?|dhs?\s?)\s?\d[\d,]*(\.\d+)?(\s?(\/|per)\s?(mo|month|year|yr|hour|hr|night|person|session|visit|kg|piece|unit))?|\d[\d,]*\s?(\/-|rupees)|\b(pricing|price list|our plans|plans start|starting (at|from)|per month|\/month|packages?)\b/gi;
  var TESTI_RE = /\b(testimonial|testimonials|what (our )?(clients|customers|patients|students|guests) say|client stories|success stories|reviews?|rated \d|happy (clients|customers)|google reviews|trustpilot|★★★)/i;
  var FAQ_RE = /\b(faq|faqs|frequently asked questions|common questions|questions\s*&\s*answers)\b/i;
  var TRUST_RE = /\b(\d{1,3}\+?\s?(years?|yrs) (of )?(experience|in business|serving)|since (19|20)\d\d|established (in )?(19|20)\d\d|certified|certification|iso \d{3,5}|award|awarded|accredited|licensed|registered|guarantee|guaranteed|money[- ]back|warranty|insured|trusted by|\d[\d,]*\+?\s?(clients|customers|brands|patients|students|projects|businesses|orders)|case stud(y|ies)|partner of|google partner|meta partner|iso[- ]certified|nabh|fssai|gst registered)\b/gi;
  var URGENCY_RE = /\b(limited (time|offer|seats|slots)|offer ends|today only|hurry|only \d+ (left|slots|seats)|book now|last chance|ends (soon|tonight)|free (consultation|audit|trial|quote|delivery|shipping)|discount|% off|sale)\b/gi;
  var PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?)?\d{3,5}[\s.-]?\d{3,5}/g;
  var EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

  function textOf(el) { return norm(el ? el.textContent : ""); }
  E.classifyPage = function (url, title, h1, text) {
    var p = ""; try { p = new URL(url).pathname.toLowerCase(); } catch (e) {}
    var t = low(title + " " + h1);
    if (p === "/" || p === "") return "home";
    if (/pric|plans?\b|packages?|rates|tariff|fees/.test(p) || /\bpricing\b|\bplans\b/.test(t)) return "pricing";
    if (/contact|get-in-touch|reach-us|enquir|inquir/.test(p)) return "contact";
    if (/about|our-story|who-we-are|team|company/.test(p)) return "about";
    if (/faq|help|questions/.test(p)) return "faq";
    if (/blog|news|article|insight|post|resources?|guides?|\/\d{4}\/\d{2}\//.test(p)) return "blog";
    if (/career|jobs|hiring|vacanc/.test(p)) return "careers";
    if (/privacy|terms|legal|refund|cancellation|shipping-policy|cookie|disclaimer/.test(p)) return "legal";
    if (/product|shop|store|item|\/p\/|collections?|catalog|category/.test(p)) return "product";
    if (/servic|solution|what-we-do|offerings|treatment|course|program|menu|practice-areas|capabilit|catering|features/.test(p)) return "service";
    if (/case-stud|work|portfolio|projects|clients|testimonials|reviews/.test(p)) return "proof";
    if (/login|sign-?in|account|cart|checkout|wp-admin/.test(p)) return "app";
    return "other";
  };
  E.parsePage = function (html, url, meta) {
    meta = meta || {};
    var doc = new DOMParser().parseFromString(String(html || ""), "text/html"), base = meta.finalUrl || url;
    var bt = doc.querySelector("base[href]"); if (bt) { try { base = new URL(bt.getAttribute("href"), base).toString(); } catch (e) {} }
    var q = function (s) { return doc.querySelector(s); }, qa = function (s) { return [].slice.call(doc.querySelectorAll(s)); };
    var metaC = function (sel) { var m = q(sel); return m ? norm(m.getAttribute("content")) : ""; };
    var jsonld = qa('script[type="application/ld+json"]').map(function (s) { var raw = s.textContent || ""; try { return { data: JSON.parse(raw.trim()), error: null }; } catch (e) { return { data: null, error: String(e.message).slice(0, 120), raw: raw.slice(0, 200) }; } });
    var types = [], entities = [];
    var walk = function (o, d) { if (!o || d > 6) return; if (Array.isArray(o)) { o.forEach(function (x) { walk(x, d + 1); }); return; } if (typeof o !== "object") return; if (o["@type"]) { [].concat(o["@type"]).forEach(function (t) { types.push(String(t)); }); entities.push(o); } if (o["@graph"]) walk(o["@graph"], d + 1); Object.keys(o).forEach(function (k) { if (k !== "@graph" && o[k] && typeof o[k] === "object") walk(o[k], d + 1); }); };
    jsonld.forEach(function (j) { walk(j.data, 0); });
    var og = {}; qa('meta[property^="og:"]').forEach(function (m) { og[m.getAttribute("property").slice(3)] = norm(m.getAttribute("content")); });
    var heads = {}; for (var i = 1; i <= 6; i++) heads["h" + i] = qa("h" + i).map(textOf).filter(Boolean).slice(0, 40);
    // links before stripping
    var navSet = new Set(qa("nav a[href], header a[href], [role=navigation] a[href]"));
    var internal = [], external = [], socials = {}, phonesL = [], emailsL = [], wa = [], host = ""; try { host = new URL(base).hostname; } catch (e) {}
    var site = E.regDomain(host);
    qa("a[href]").forEach(function (a) {
      var h = a.getAttribute("href") || "", t = clip(textOf(a) || a.getAttribute("aria-label") || a.getAttribute("title") || "", 80);
      if (/^tel:/i.test(h)) { phonesL.push(norm(decodeURIComponent(h.slice(4)))); return; }
      if (/^mailto:/i.test(h)) { emailsL.push(norm(decodeURIComponent(h.slice(7).split("?")[0])).toLowerCase()); return; }
      var u = E.normUrl(h, base); if (!u) return;
      Object.keys(SOCIAL).forEach(function (k) { if (SOCIAL[k].test(u)) { if (k === "whatsapp") wa.push(u); else if (!socials[k]) socials[k] = u; } });
      var d = E.domainOf(u);
      if (d === site) internal.push({ url: u, text: t, nav: navSet.has(a) }); else external.push({ url: u, text: t });
    });
    var images = qa("img").map(function (im) { return { src: im.getAttribute("src") || im.getAttribute("data-src") || "", alt: im.hasAttribute("alt") ? norm(im.getAttribute("alt")) : null }; }).filter(function (x) { return x.src; });
    var forms = qa("form").map(function (f) {
      var fields = [].slice.call(f.querySelectorAll("input,select,textarea")).filter(function (x) { var ty = (x.getAttribute("type") || "").toLowerCase(); return ["hidden", "submit", "button", "reset", "image"].indexOf(ty) < 0; })
        .map(function (x) { var id = x.getAttribute("id"), lb = id ? doc.querySelector('label[for="' + id + '"]') : null; return { type: (x.getAttribute("type") || x.tagName).toLowerCase(), name: x.getAttribute("name") || "", required: x.hasAttribute("required") || x.getAttribute("aria-required") === "true", label: clip(lb ? textOf(lb) : x.getAttribute("placeholder") || x.getAttribute("aria-label") || "", 60) }; });
      var isSearch = (f.getAttribute("role") === "search") || fields.length === 1 && /search|^q$|^s$/i.test(fields[0].name + fields[0].type);
      // v17.2: a group of radio buttons / checkboxes with one name is ONE question for the visitor, not 4 fields
      var grp = {}, asked = fields.filter(function (x) { if (x.type !== "radio" && x.type !== "checkbox") return true; var k = x.type + ":" + (x.name || x.label); if (grp[k]) return false; grp[k] = 1; return true; });
      // v17.2: only a form that asks for contact details is a LEAD form, a quiz, calculator or filter is a tool, not friction
      var contact = fields.some(function (x) { return x.type === "email" || x.type === "tel" || /e-?mail|phone|mobile|whats ?app|contact|full ?name|^name$|your name|company/i.test(x.name + " " + x.label); });
      var choice = fields.filter(function (x) { return x.type === "radio" || x.type === "checkbox"; }).length;
      return { action: f.getAttribute("action") || "", method: (f.getAttribute("method") || "get").toLowerCase(), fields: fields.slice(0, 30), fieldCount: asked.length, rawFields: fields.length, required: asked.filter(function (x) { return x.required; }).length, search: isSearch, lead: !isSearch && contact, tool: !isSearch && !contact && (choice > asked.length / 2 || choice >= 6 || fields.some(function (x) { return x.type === "number" || x.type === "range"; })) };
    });
    var all = qa("a,button,input[type=submit],input[type=button]"), ctas = [];
    all.forEach(function (el, idx) {
      var t = clip(el.tagName === "INPUT" ? el.getAttribute("value") : textOf(el) || el.getAttribute("aria-label") || "", 60), cls = (el.getAttribute("class") || "").toLowerCase();
      if (!t || t.length > 50) return;
      var isBtn = /\b(btn|button|cta)\b/.test(cls) || el.tagName !== "A";
      if (CTA_RE.test(t) || (isBtn && el.tagName !== "A" && !/menu|close|toggle|search|×|☰/i.test(t))) ctas.push({ text: t, href: el.getAttribute("href") || "", tag: el.tagName.toLowerCase(), nav: navSet.has(el), order: idx, generic: GENERIC_CTA.test(t), early: idx < Math.max(12, all.length * 0.15) });
    });
    var hasViewport = !!q('meta[name="viewport"]'), robotsMeta = low(metaC('meta[name="robots"]') + " " + metaC('meta[name="googlebot"]'));
    var canonEl = q('link[rel="canonical"]'), canonical = canonEl ? E.normUrl(canonEl.getAttribute("href"), base) : "";
    var hreflang = qa('link[rel="alternate"][hreflang]').map(function (l) { return l.getAttribute("hreflang"); });
    var mixed = 0; if (/^https:/.test(base)) qa("img[src^='http:'],script[src^='http:'],link[href^='http:'][rel=stylesheet],iframe[src^='http:']").forEach(function () { mixed++; });
    // hero (before removing elements): first h1 and the paragraph near it
    var h1el = q("h1"), hero = "";
    if (h1el) { var par = h1el.parentElement, ptxt = par ? textOf(par) : ""; hero = clip(ptxt.length < 600 ? ptxt : textOf(h1el) + " " + textOf(h1el.nextElementSibling), 400); }
    var foot = q("footer"), footText = clip(textOf(foot), 1500);
    qa("script,style,noscript,template,svg,iframe").forEach(function (n) { n.remove(); });
    var body = doc.body ? norm(doc.body.textContent) : "";
    var title = textOf(q("title")), desc = metaC('meta[name="description"]');
    var words = body ? body.split(/\s+/).length : 0;
    var phonesT = (body.match(PHONE_RE) || []).map(norm).filter(function (p) { var d = p.replace(/\D/g, ""); return d.length >= 10 && d.length <= 13 && !/^(19|20)\d{8}$/.test(d) && !/^0+$/.test(d); });
    var emails = uniq(emailsL.concat((body.match(EMAIL_RE) || []).map(function (e) { return e.toLowerCase(); })).filter(function (e) { return !/\.(png|jpe?g|webp|gif|svg)$/.test(e) && !/(example|domain|sentry|wixpress)\./.test(e); }));
    var prices = (body.match(PRICE_RE) || []).map(norm).filter(function (x) { if (x.length >= 40) return false; var m = /(\d[\d,]*)\.(\d+)/.exec(x); return !(m && +m[1].replace(/,/g, "") < 10); });
    var faqQs = heads.h2.concat(heads.h3, heads.h4).filter(function (h) { return /\?$/.test(h); });
    var details = qa("details summary").length;
    var faqSchema = types.some(function (t) { return /FAQPage/i.test(t); });
    var testiEls = qa("blockquote,[class*=testimonial],[class*=review],[id*=testimonial],[class*=Testimonial]").length;
    var trust = uniq((body.match(TRUST_RE) || []).map(low)).slice(0, 12), urgency = uniq((body.match(URGENCY_RE) || []).map(low)).slice(0, 8);
    var addr = "";
    entities.forEach(function (e) { var a = e.address; if (a && typeof a === "object" && !addr) addr = norm([a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode, a.addressCountry && (a.addressCountry.name || a.addressCountry)].filter(Boolean).join(", ")); else if (typeof a === "string" && !addr) addr = norm(a); });
    if (!addr) { var am = /(?:address|office|visit us|location)\s*[:\-]?\s*([^|]{15,160}?\b\d{5,6}\b)/i.exec(footText + " " + body.slice(-3000)); if (am) addr = norm(am[1]); }
    var page = {
      url: url, finalUrl: meta.finalUrl || url, status: meta.status || 0, redirects: meta.redirects || [], headers: meta.headers || {}, ms: meta.ms || 0,
      title: title, metaDescription: desc, headings: heads, h1: heads.h1, canonical: canonical, robotsMeta: robotsMeta, xRobots: low((meta.headers || {})["x-robots-tag"] || ""),
      noindex: /noindex/.test(robotsMeta) || /noindex/.test(low((meta.headers || {})["x-robots-tag"] || "")), lang: (doc.documentElement.getAttribute("lang") || "").toLowerCase(), viewport: hasViewport, hreflang: hreflang,
      internalLinks: internal, externalLinks: external.slice(0, 200), images: images.slice(0, 300), jsonld: jsonld.map(function (j) { return { ok: !j.error, error: j.error }; }), schemaTypes: uniq(types), entities: entities.slice(0, 30),
      og: og, forms: forms, telLinks: phonesL.length, ctas: ctas.slice(0, 60), phones: uniq(phonesL.concat(phonesT)).slice(0, 8), emails: emails.slice(0, 8), whatsapp: uniq(wa).slice(0, 4), socials: socials, address: addr,
      pricing: { found: prices.length > 0, samples: uniq(prices).slice(0, 8) }, testimonials: { found: TESTI_RE.test(body) || testiEls > 0 || types.some(function (t) { return /^(Review|AggregateRating)$/.test(t); }), els: testiEls },
      faq: { found: faqSchema || FAQ_RE.test(heads.h2.concat(heads.h3).join(" ")) || details >= 3 || faqQs.length >= 3, count: Math.max(faqQs.length, details), schema: faqSchema, samples: faqQs.slice(0, 6) },
      trust: trust, urgency: urgency, hero: hero, wordCount: words, text: body.slice(0, 20000), footer: footText, mixedContent: mixed,
    };
    page.type = E.classifyPage(page.finalUrl, title, heads.h1[0] || "", body);
    return page;
  };

  /* ======================= crawler ======================= */
  var PRIORITY = [[/pric|plans?\b|packages?/, 260], [/servic|solution|product|what-we-do|treatment|course|menu|offerings/, 240], [/about|who-we-are|our-story/, 200], [/contact|enquir|inquir/, 200], [/case-stud|work|portfolio|testimonial|reviews?/, 150], [/faq/, 120], [/blog|news|insight|article/, 80], [/privacy|terms|legal/, 20], [/login|cart|checkout|account|wp-admin|tag\/|author\/|page\/\d|\?/, -200]];
  function prioOf(url, depth, nav, fromSitemap) {
    var p = 0, path = ""; try { var u = new URL(url); path = (u.pathname + u.search).toLowerCase(); } catch (e) {}
    PRIORITY.forEach(function (r) { if (r[0].test(path)) p += r[1]; });
    return p + (nav ? 300 : 0) + (fromSitemap ? 40 : 0) - depth * 60 - Math.min(80, path.length / 2);
  }
  /* fetcher(url) → Promise<{ status, finalUrl, redirects, headers, body, ms, error }> */
  E.crawl = function (start, fetcher, opts, onProgress) {
    opts = Object.assign({}, E.CFG, opts || {});
    var t0 = Date.now(), startN = E.normUrl(start), origin = new URL(startN).origin, site = E.domainOf(startN);
    var out = { start: startN, pages: [], robots: null, robotsFound: false, robotsStatus: 0, sitemapFound: false, sitemapUrls: [], sitemapSource: "", skippedRobots: [], skippedExternal: 0, skippedNonHtml: [], errors: [], limitsHit: [], durationMs: 0, linkStatus: {} };
    var seen = {}, crawled = {}, queue = [], stopped = false; out.duplicates = [];
    var push = function (u, depth, nav, sm, from) { var n = E.normUrl(u); if (!n || seen[n]) return; if (E.domainOf(n) !== site) { out.skippedExternal++; return; } if (E.skipExt.test(new URL(n).pathname) || E.skipSvc.test(new URL(n).pathname)) return; if (depth > opts.MAX_DEPTH) return; seen[n] = 1; queue.push({ url: n, depth: depth, prio: prioOf(n, depth, nav, sm), from: from }); };
    var timeUp = function () { return Date.now() - t0 > opts.MAX_TOTAL_RUNTIME; };
    return fetcher(origin + "/robots.txt").then(function (r) {
      out.robotsStatus = r.status;
      if (r.status === 200 && r.body && !/<html/i.test(r.body.slice(0, 300))) { out.robotsFound = true; out.robots = E.parseRobots(r.body); }
    }, function () {}).then(function () {
      var maps = (out.robots && out.robots.sitemaps.length ? out.robots.sitemaps : [origin + "/sitemap.xml"]).slice(0, 2);
      out.sitemapSource = out.robots && out.robots.sitemaps.length ? "robots.txt" : "/sitemap.xml";
      return Promise.all(maps.map(function (m) {
        return fetcher(m).then(function (r) {
          if (r.status !== 200 || !/<(urlset|sitemapindex)/i.test(r.body || "")) return;
          out.sitemapFound = true; var sm = E.parseSitemap(r.body);
          if (sm.index) return Promise.all(sm.urls.slice(0, 2).map(function (c) { return fetcher(c).then(function (r2) { if (r2.status === 200) out.sitemapUrls = out.sitemapUrls.concat(E.parseSitemap(r2.body).urls); }, function () {}); }));
          out.sitemapUrls = out.sitemapUrls.concat(sm.urls);
        }, function () {});
      }));
    }).then(function () {
      push(startN, 0, true, false, null);
      out.sitemapUrls.slice(0, 300).forEach(function (u) { push(u, 1, false, true, "sitemap"); });
      var active = 0;
      return new Promise(function (resolve) {
        var next = function () {
          if (stopped) return;
          if (out.pages.length + active >= opts.MAX_PAGES || timeUp() || (!queue.length && !active)) {
            if (!active) { if (out.pages.length >= opts.MAX_PAGES) out.limitsHit.push("MAX_PAGES"); if (timeUp()) out.limitsHit.push("MAX_TOTAL_RUNTIME"); stopped = true; resolve(); }
            return;
          }
          if (!queue.length) return;
          queue.sort(function (a, b) { return b.prio - a.prio; });
          var item = queue.shift();
          if (!E.robotsAllowed(out.robots, item.url)) { out.skippedRobots.push(item.url); next(); return; }
          active++;
          fetcher(item.url).then(function (r) {
            out.linkStatus[item.url] = r.status;
            var fn = (r.finalUrl && E.normUrl(r.finalUrl)) || item.url;
            if (fn !== item.url) { out.linkStatus[fn] = r.status; seen[fn] = 1; if (E.domainOf(fn) !== site) { out.errors.push({ url: item.url, error: "redirects off-site to " + fn }); return; } }
            if (crawled[fn]) { out.duplicates.push({ url: item.url, sameAs: fn }); return; } crawled[fn] = 1;
            if (r.error) { out.errors.push({ url: item.url, error: r.error }); out.pages.push({ url: item.url, finalUrl: r.finalUrl || item.url, status: r.status || 0, error: r.error, depth: item.depth, redirects: r.redirects || [] }); return; }
            if (r.skipped) { out.skippedNonHtml.push(item.url); return; }
            var pg = E.parsePage(r.body || "", item.url, r); pg.depth = item.depth; pg.from = item.from;
            out.pages.push(pg);
            if (!pg.noindex || item.depth === 0) pg.internalLinks.forEach(function (l) { push(l.url, item.depth + 1, l.nav && item.depth === 0, false, item.url); });
          }, function (e) { out.errors.push({ url: item.url, error: String(e && e.message || e) }); }).then(function () {
            active--; if (onProgress) try { onProgress(out.pages.length, opts.MAX_PAGES, item.url); } catch (e) {}
            next();
          });
          if (active < opts.CONCURRENCY) next();
        };
        for (var i = 0; i < opts.CONCURRENCY; i++) next();
      });
    }).then(function () {
      out.durationMs = Date.now() - t0;
      // inbound link counts + broken links (internal links pointing at crawled 4xx/5xx/unreachable URLs)
      var inbound = {}, broken = [];
      out.pages.forEach(function (p) { (p.internalLinks || []).forEach(function (l) { var u = l.url; try { if (E.skipSvc.test(new URL(u).pathname)) return; } catch (x) {} inbound[u] = (inbound[u] || 0) + 1; var st = out.linkStatus[u]; if (st != null && st >= 400) broken.push({ from: p.url, to: u, status: st }); }); });
      out.inbound = inbound; out.broken = uniq(broken).slice(0, 100);
      return out;
    });
  };

  /* ======================= business discovery ======================= */
  var INDUSTRIES = [
    { id: "restaurant", label: "Restaurant / food", re: /\b(restaurant|cafe|café|bistro|dine|dining|menu|cuisine|food|biryani|pizza|bakery|cloud kitchen|catering|dhaba|eatery|brunch)\b/gi, schema: /Restaurant|FoodEstablishment|Cafe|Bakery/, local: true },
    { id: "clinic", label: "Clinic / healthcare", re: /\b(clinic|doctor|hospital|treatment|patient|dental|dentist|derma|skin care|physio|therapy|diagnostic|health ?care|ivf|ayurved|homeopath|surgeon|consultation)\b/gi, schema: /MedicalClinic|Dentist|Physician|Hospital|MedicalBusiness|HealthAndBeautyBusiness/, local: true },
    { id: "saas", label: "Software / SaaS", re: /\b(saas|software|platform|dashboard|integrations?|api|automation|free trial|sign up free|workflow|cloud-based|analytics tool|crm|erp|app)\b/gi, schema: /SoftwareApplication|WebApplication|MobileApplication/ },
    { id: "ecommerce", label: "E-commerce / D2C brand", re: /\b(add to cart|shop now|buy now|free shipping|cart|checkout|collections?|cod|cash on delivery|returns?|bestsellers?|new arrivals|order now)\b/gi, schema: /Product|Offer|Store|OnlineStore/ },
    { id: "agency", label: "Marketing / creative agency", re: /\b(agency|digital marketing|seo|social media marketing|branding|performance marketing|ppc|google ads|meta ads|content marketing|web design|creative studio)\b/gi, schema: /ProfessionalService|MarketingAgency|AdvertisingAgency/ },
    { id: "realestate", label: "Real estate", re: /\b(real estate|property|properties|apartments?|flats?|villas?|plots?|bhk|builder|realtor|homes for sale|rent)\b/gi, schema: /RealEstateAgent|Residence/, local: true },
    { id: "education", label: "Education / coaching", re: /\b(course|courses|coaching|academy|institute|classes|students?|admissions?|tuition|training|certification|learn|school|college)\b/gi, schema: /EducationalOrganization|School|CollegeOrUniversity|Course/ },
    { id: "travel", label: "Travel / tourism", re: /\b(travel|tours?|holiday|packages?|flights?|visa|itinerary|trip|tourism|honeymoon|hotel booking)\b/gi, schema: /TravelAgency|TouristTrip/ },
    { id: "beauty", label: "Salon / beauty / wellness", re: /\b(salon|spa|beauty|makeup|hair|nails?|facial|bridal|parlou?r|grooming|massage|wellness)\b/gi, schema: /BeautySalon|HairSalon|DaySpa|NailSalon/, local: true },
    { id: "fitness", label: "Gym / fitness", re: /\b(gym|fitness|workout|personal train|yoga|crossfit|pilates|membership|zumba)\b/gi, schema: /ExerciseGym|SportsActivityLocation/, local: true },
    { id: "legal", label: "Legal / professional services", re: /\b(lawyer|advocate|legal|law firm|attorney|chartered accountant|ca firm|tax|audit|gst|compliance|consultancy)\b/gi, schema: /LegalService|Attorney|AccountingService/ },
    { id: "finance", label: "Finance / insurance", re: /\b(loan|insurance|invest|mutual funds?|wealth|financial|credit|emi|fintech|banking)\b/gi, schema: /FinancialService|InsuranceAgency|BankOrCreditUnion/ },
    { id: "manufacturing", label: "Manufacturing / B2B supply", re: /\b(manufactur|exporter|supplier|wholesale|industrial|factory|oem|distributor|b2b|machinery)\b/gi, schema: /Manufacturer/ },
    { id: "hospitality", label: "Hotel / hospitality", re: /\b(hotel|resort|rooms?|stay|homestay|banquet|guest ?house|check-in)\b/gi, schema: /Hotel|LodgingBusiness|Resort/, local: true },
    { id: "itservices", label: "IT services / development", re: /\b(web development|app development|it services|software development|outsourcing|devops|cloud services|custom software|it solutions)\b/gi, schema: /ProfessionalService/ },
  ];
  E.INDUSTRIES = INDUSTRIES;
  var CITIES = ["Delhi", "New Delhi", "Noida", "Gurugram", "Gurgaon", "Ghaziabad", "Faridabad", "Mumbai", "Navi Mumbai", "Thane", "Pune", "Bengaluru", "Bangalore", "Hyderabad", "Chennai", "Kolkata", "Ahmedabad", "Surat", "Jaipur", "Lucknow", "Chandigarh", "Mohali", "Indore", "Bhopal", "Nagpur", "Kochi", "Coimbatore", "Patna", "Dehradun", "Goa", "Vadodara", "Ludhiana", "Amritsar", "Kanpur", "Visakhapatnam", "Bhubaneswar", "Guwahati", "Ranchi", "Raipur", "Mysuru", "Agra", "Varanasi", "Dubai", "Abu Dhabi", "Sharjah", "London", "Manchester", "Birmingham", "New York", "Los Angeles", "Chicago", "San Francisco", "Toronto", "Vancouver", "Sydney", "Melbourne", "Singapore", "Riyadh", "Doha"];
  E.CITIES = CITIES;
  var AUD_RE = /\bfor\s+(small (and|&) medium businesses|small businesses|smbs?|startups?|founders|enterprises?|brands?|d2c brands|e-?commerce brands|businesses|agencies|families|kids|children|students|parents|women|men|professionals|working professionals|couples|seniors|doctors|clinics|restaurants|retailers|manufacturers|teams|developers|marketers|creators|home ?owners|travell?ers|corporates?)\b/i;
  var DIFF_RE = /\b(only|first|unlike|guarantee[d]?|award[- ]winning|#1|no\.? ?1|leading|patented|exclusive|fastest|largest|certified|proprietary|100%|zero|no hidden|transparent pricing|money[- ]back|in \d+ (days|hours|minutes)|same[- ]day|\d+\+ (years|clients|customers|brands))\b/i;
  var OUTCOME_RE = /\b(grow|growth|increase|boost|more (leads|sales|customers|bookings|patients|traffic|revenue)|save|reduce|faster|results?|roi|revenue|profit|rank|scale|transform|get (more|found)|win|double|triple|\d+%|x more|healthier|confidence|peace of mind|hassle[- ]free|delivered (hot|fresh|fast|in)|ready in|in \d+ (minutes|mins|hours|days)|painless|pain[- ]free|without (code|hassle|pain|stress)|stress[- ]free|on time)\b/i;
  var PROBLEM_RE = /\b(struggl|tired of|problem|pain|stuck|without|stop (wasting|losing)|no more|frustrat|confus|overwhelm|losing|wasted?|slow|expensive|hard to|difficult|worried|challenge|fix|solve)\w*/i;
  E.offer = function (home, ev) {
    var hero = norm((home.h1[0] || "") + ". " + (home.hero || "") + ". " + (home.metaDescription || "")), parts = {};
    var test = function (k, re) { var m = re.exec(hero); parts[k] = { found: !!m, match: m ? m[0] : "", text: m ? clip(hero.slice(Math.max(0, m.index - 60), m.index + 80), 160) : "" }; };
    test("audience", AUD_RE); test("problem", PROBLEM_RE); test("outcome", OUTCOME_RE); test("differentiation", DIFF_RE);
    var evid = ev.add({ type: "offer", claim: "Homepage headline and opening text", pageUrl: home.finalUrl, evidenceText: hero || "(no H1 or description found)", label: "OBSERVED" });
    var n = 0; Object.keys(parts).forEach(function (k) { if (parts[k].found) n++; });
    var genericH1 = !home.h1[0] || home.h1[0].split(/\s+/).length < 3 || /^(welcome|home|hello|hi)\b/i.test(home.h1[0]);
    var score = Math.round(n * 25 - (genericH1 ? 10 : 0)); score = Math.max(0, Math.min(100, score));
    return { score: score, parts: parts, headline: home.h1[0] || "", hero: hero, genericH1: genericH1, evidence: [evid], label: "INFERRED" };
  };
  E.discover = function (crawl, input, ev) {
    input = input || {};
    var pages = crawl.pages.filter(function (p) { return !p.error && p.status >= 200 && p.status < 400 && p.title !== undefined; });
    var home = pages.filter(function (p) { return p.depth === 0; })[0] || pages[0];
    if (!home) return null;
    var B = {}, f = function (v, label, evid, extra) { return Object.assign({ value: v, label: v == null || v === "" || (Array.isArray(v) && !v.length) ? "UNKNOWN" : label, evidence: evid || [] }, extra || {}); };
    var orgs = []; pages.forEach(function (p) { (p.entities || []).forEach(function (e) { var t = [].concat(e["@type"] || []).join(" "); if (/Organization|LocalBusiness|Corporation|Store|Restaurant|Clinic|Agency|Service|Dentist|Hotel|School/.test(t)) orgs.push({ e: e, url: p.finalUrl, type: t }); }); });
    // name
    var GENERIC_T = /^(home|homepage|home page|welcome|index|untitled|default|main|start|page|website|site)$/i;
    var titleParts = (home.title || "").split(/\s[|–—\-:•·]\s/).map(norm).filter(function (x) { return x && !GENERIC_T.test(x); }), common = null;
    // the segment most pages repeat in their titles ("Services | BrightPixel", "About | BrightPixel" → "BrightPixel")
    var cnt = {}; pages.forEach(function (p) { uniq((p.title || "").split(/\s[|–—\-:•·]\s/).map(norm)).forEach(function (x) { if (x && x.length <= 40 && !GENERIC_T.test(x)) cnt[x] = (cnt[x] || 0) + 1; }); });
    common = Object.keys(cnt).filter(function (k) { return cnt[k] >= Math.max(2, Math.ceil(pages.length * 0.4)); }).sort(function (a, b) { return cnt[b] - cnt[a] || a.length - b.length; })[0] || null;
    var schemaName = orgs.map(function (o) { return typeof o.e.name === "string" ? norm(o.e.name) : ""; }).filter(Boolean)[0];
    var stem = E.domainOf(home.finalUrl).split(".")[0];
    var inTitle = !common && titleParts.length ? titleParts.filter(function (x) { return low(x).replace(/[^a-z0-9]/g, "").indexOf(stem.replace(/[^a-z0-9]/g, "")) > -1; })[0] : "";
    var nameVal = input.name || schemaName || home.og.site_name || common || inTitle || (titleParts.length > 1 ? titleParts[titleParts.length - 1] : "") || stem;
    var nameLabel = input.name ? "OBSERVED" : schemaName || home.og.site_name ? "OBSERVED" : "INFERRED";
    B.name = f(nameVal, nameLabel, [ev.add({ type: "business", claim: "Business name: " + nameVal, pageUrl: home.finalUrl, sourceName: input.name ? "Your input" : schemaName ? "Structured data (JSON-LD)" : home.og.site_name ? "og:site_name" : common ? "Repeated in page titles" : nameVal === stem ? "Domain name" : "Page title", evidenceText: input.name || schemaName || home.og.site_name || (common ? common + " (in " + cnt[common] + " page titles)" : home.title), label: nameLabel })]);
    var desc = home.metaDescription || home.og.description || home.hero;
    B.description = f(desc, "OBSERVED", desc ? [ev.add({ type: "business", claim: "How the site describes itself", pageUrl: home.finalUrl, evidenceText: desc })] : []);
    // industry
    var bag = [home.title, home.metaDescription, home.h1.join(" "), (home.headings.h2 || []).join(" "), (home.internalLinks || []).filter(function (l) { return l.nav; }).map(function (l) { return l.text; }).join(" ")].join(" ") + " " + pages.slice(0, 15).map(function (p) { return p.title + " " + p.h1.join(" "); }).join(" ");
    var schemaTypes = uniq([].concat.apply([], pages.map(function (p) { return p.schemaTypes || []; })));
    var ranked = INDUSTRIES.map(function (ind) { var m = bag.match(ind.re) || [], s = m.length + (schemaTypes.some(function (t) { return ind.schema.test(t); }) ? 6 : 0); return { ind: ind, s: s, hits: uniq(m.map(low)).slice(0, 6) }; }).sort(function (a, b) { return b.s - a.s; });
    var top = ranked[0], second = ranked[1];
    if (input.industry) B.industry = f(input.industry, "OBSERVED", [ev.add({ type: "business", claim: "Industry given by you: " + input.industry, sourceName: "Your input", evidenceText: input.industry })], { id: (INDUSTRIES.filter(function (i) { return i.re.test(input.industry) || low(i.label).indexOf(low(input.industry)) > -1; })[0] || top.ind).id });
    else if (top && top.s >= 2) B.industry = f(top.ind.label, "INFERRED", [ev.add({ type: "business", claim: "Industry inferred as " + top.ind.label, pageUrl: home.finalUrl, evidenceText: "Words found: " + top.hits.join(", ") + (schemaTypes.length ? " · schema types: " + schemaTypes.slice(0, 6).join(", ") : ""), label: "INFERRED" })], { id: top.ind.id, alt: second && second.s >= 2 ? second.ind.label : "" });
    else B.industry = f("", "UNKNOWN", [], { id: "" });
    INDUSTRIES.forEach(function (i) { i.re.lastIndex = 0; });
    // services / products
    var GENERIC_NAV = /^(home|about( us)?|contact( us)?|blog|news|careers?|login|sign in|sign up|faq|faqs|privacy|terms|menu|search|cart|more|our work|work|portfolio|team|gallery|reviews|testimonials|resources|support|help|pricing|shop|services|products|company|insights|events|press|media)$/i;
    // v20.2: a service name reads like a label ("Corporate Travel", "MICE & Events"), not a tagline ("Local Expertise. Seamless
    // On-Ground Execution.") or a link prompt ("All Solutions ->"). Nav labels first; a service page whose H1 is a tagline is named from its URL.
    var svcLike = function (x) { x = norm(x); return x.length > 2 && x.length <= 48 && x.split(/\s+/).length <= 5 && !/[.!?]\s|[.!?…]$|->|→|»|›|\.\.\./.test(x) && !/^(all|our|view|see|explore|discover|learn|read|find|get|why|how|what)\b/i.test(x) && !/\b(for every|your|we|you)\b/i.test(x) && !GENERIC_NAV.test(x) && /[a-z]/i.test(x); };
    var ACR = /^(mice|seo|ppc|smm|sem|crm|erp|hr|it|ui|ux|b2b|b2c|d2c|gst|ca|cctv|ac|ivf|mri|ct|ent|bpo|kpo|vfx|ott|nri|emi)$/i;
    var slugName = function (u) { try { var seg = decodeURIComponent(new URL(u).pathname.split("/").filter(Boolean).pop() || "").replace(/\.(html?|php|aspx?)$/i, ""); if (!/^[a-z][a-z0-9_-]{2,60}$/i.test(seg) || /\d{3,}/.test(seg)) return ""; var w = seg.split(/[-_]+/).filter(Boolean); if (w.length > 5) return ""; return w.map(function (x) { return ACR.test(x) ? x.toUpperCase() : x.charAt(0).toUpperCase() + x.slice(1).toLowerCase(); }).join(" "); } catch (x) { return ""; } };
    var shares = function (a, b) { var A = low(a).split(/[^a-z0-9]+/).filter(function (w) { return w.length > 2; }); return low(b).split(/[^a-z0-9]+/).some(function (w) { return w.length > 2 && A.indexOf(w) > -1; }); };
    var pageSvc = function (p) { var h = p.h1[0] || "", t = (p.title || "").split(/\s[|–—\-]\s/)[0], sl = slugName(p.url); if (svcLike(h) && (!sl || shares(h, sl))) return h; if (sl && !GENERIC_NAV.test(sl)) return sl; return svcLike(t) ? t : svcLike(h) ? h : ""; };
    var navSvc = (home.internalLinks || []).filter(function (l) { return l.nav && /servic|solution|product|treatment|course|menu/.test(l.url); }).map(function (l) { return svcLike(l.text) ? l.text : ""; });
    var svc = uniq(navSvc.concat(pages.filter(function (p) { return p.type === "service" || p.type === "product"; }).map(pageSvc)).map(norm).filter(function (x) { return x && svcLike(x); })).filter(function (x, i, a) { var k = function (y) { return low(y).replace(/&|\band\b|[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }; return a.findIndex(function (y) { return k(y) === k(x); }) === i; }).slice(0, 15);
    var prods = uniq([].concat.apply([], pages.map(function (p) { return (p.entities || []).filter(function (e) { return /^Product$/.test([].concat(e["@type"]).join(" ")) && typeof e.name === "string"; }).map(function (e) { return norm(e.name); }); }))).filter(Boolean).slice(0, 15);
    B.services = f(svc, "OBSERVED", svc.length ? [ev.add({ type: "business", claim: "Services/products named on the site", pageUrl: home.finalUrl, evidenceText: svc.slice(0, 10).join(" · ") })] : []);
    B.products = f(prods, "OBSERVED", prods.length ? [ev.add({ type: "business", claim: "Products in structured data", pageUrl: home.finalUrl, evidenceText: prods.slice(0, 10).join(" · "), sourceName: "Structured data (JSON-LD)" })] : []);
    // locations
    var allText = pages.slice(0, 20).map(function (p) { return p.title + " " + p.text.slice(0, 4000) + " " + p.footer; }).join(" ");
    var citiesFound = CITIES.filter(function (c) { return new RegExp("\\b" + c.replace(/ /g, "\\s") + "\\b", "i").test(allText); });
    var schemaCity = orgs.map(function (o) { var a = o.e.address; return a && typeof a === "object" ? norm(a.addressLocality || "") : ""; }).filter(Boolean)[0];
    var addr = pages.map(function (p) { return p.address; }).filter(Boolean)[0] || "";
    var locs = uniq([input.city, schemaCity].concat(citiesFound)).filter(Boolean).slice(0, 8);
    B.locations = f(locs, input.city ? "OBSERVED" : schemaCity ? "OBSERVED" : "INFERRED", locs.length ? [ev.add({ type: "business", claim: "Locations mentioned", pageUrl: home.finalUrl, evidenceText: (input.city ? "Your input: " + input.city + ". " : "") + (schemaCity ? "Schema address: " + schemaCity + ". " : "") + (citiesFound.length ? "Cities named on the site: " + citiesFound.slice(0, 8).join(", ") : ""), label: input.city || schemaCity ? "OBSERVED" : "INFERRED" })] : []);
    B.city = input.city || schemaCity || citiesFound[0] || "";
    // pricing
    var priced = pages.filter(function (p) { return p.pricing.found && (p.type === "pricing" || p.pricing.samples.some(function (s) { return /\d/.test(s); })); });
    B.pricing = f(priced.length ? uniq([].concat.apply([], priced.map(function (p) { return p.pricing.samples.filter(function (s) { return /\d/.test(s); }); }))).slice(0, 8) : [], "OBSERVED", priced.length ? [ev.add({ type: "pricing", claim: "Prices shown on " + priced.length + " page(s)", pageUrl: priced[0].finalUrl, evidenceText: priced[0].pricing.samples.slice(0, 6).join(" · ") })] : [], { pages: priced.map(function (p) { return p.finalUrl; }).slice(0, 10) });
    // audience
    var am = AUD_RE.exec([home.hero, home.metaDescription, (home.headings.h2 || []).join(". ")].join(". "));
    B.audience = input.audience ? f(input.audience, "OBSERVED", [ev.add({ type: "business", claim: "Audience given by you", sourceName: "Your input", evidenceText: input.audience })]) : f(am ? am[1] : "", "INFERRED", am ? [ev.add({ type: "business", claim: "Audience named on the homepage", pageUrl: home.finalUrl, evidenceText: am[0], label: "OBSERVED" })] : []);
    // business model
    var anyCart = pages.some(function (p) { return p.ctas.some(function (c) { return /add to cart|buy now|checkout/i.test(c.text); }) || p.internalLinks.some(function (l) { return /\/cart|\/checkout/.test(l.url); }); }) || schemaTypes.some(function (t) { return /^Product$/.test(t); });
    var saas = pages.some(function (p) { return p.ctas.some(function (c) { return /free trial|sign ?up|start free|get started free/i.test(c.text); }); }) && priced.length > 0;
    var localB = schemaTypes.some(function (t) { return /LocalBusiness|Restaurant|Clinic|Dentist|Salon|Store|Hotel|Gym/.test(t); }) || (!!addr && (B.industry.id && (INDUSTRIES.filter(function (i) { return i.id === B.industry.id; })[0] || {}).local));
    var model = anyCart ? "E-commerce (sells online)" : saas ? "Software subscription (SaaS)" : localB ? "Local business (customers visit or are served locally)" : "Services (enquiry / quote led)";
    B.model = f(model, "INFERRED", [ev.add({ type: "business", claim: "Business model inferred: " + model, pageUrl: home.finalUrl, evidenceText: anyCart ? "Cart / buy buttons or Product schema found" : saas ? "Sign-up / free-trial calls to action and prices found" : localB ? "Local business schema or a street address found" : "Contact / quote calls to action without a cart or plans", label: "INFERRED" })]);
    B.local = localB || !!input.city;
    B.valueProp = f(home.h1[0] ? clip(home.h1[0] + (home.hero && home.hero.indexOf(home.h1[0]) === 0 ? home.hero.slice(home.h1[0].length) : ""), 300) : "", "OBSERVED", home.h1[0] ? [ev.add({ type: "offer", claim: "Main headline (H1)", pageUrl: home.finalUrl, evidenceText: home.h1[0] })] : []);
    var usp = uniq((home.text || "").split(/[.!?]\s+/).filter(function (s) { return s.length > 20 && s.length < 220 && DIFF_RE.test(s); })).slice(0, 4);
    B.usp = f(usp, "OBSERVED", usp.length ? [ev.add({ type: "offer", claim: "Differentiation claims on the homepage", pageUrl: home.finalUrl, evidenceText: usp.join(" | ") })] : []);
    // contacts & socials
    var phones = uniq([].concat.apply([], pages.map(function (p) { return p.phones; })).map(function (p) { return p.replace(/[^\d+]/g, "").replace(/^0+/, "").replace(/^(91)(\d{10})$/, "+91$2"); }).filter(function (p) { return p.replace(/\D/g, "").length >= 10; })).slice(0, 6);
    var emails = uniq([].concat.apply([], pages.map(function (p) { return p.emails; }))).slice(0, 6);
    var was = uniq([].concat.apply([], pages.map(function (p) { return p.whatsapp; }))).slice(0, 3);
    var socials = {}; pages.forEach(function (p) { Object.keys(p.socials || {}).forEach(function (k) { if (!socials[k]) socials[k] = p.socials[k]; }); });
    B.contacts = { phones: phones, emails: emails, whatsapp: was, address: addr, evidence: phones.length + emails.length + was.length ? [ev.add({ type: "contact", claim: "Contact methods on the site", pageUrl: home.finalUrl, evidenceText: [phones.length && "Phone: " + phones.join(", "), emails.length && "Email: " + emails.join(", "), was.length && "WhatsApp link", addr && "Address: " + addr].filter(Boolean).join(" · ") })] : [] };
    B.socials = socials;
    B.schemaTypes = schemaTypes;
    // structured data vs visible content
    var sc = [], visible = low(pages.slice(0, 10).map(function (p) { return p.title + " " + p.text + " " + p.footer; }).join(" "));
    orgs.slice(0, 3).forEach(function (o) {
      var e = o.e;
      if (typeof e.name === "string") sc.push({ field: "name", value: e.name, visible: visible.indexOf(low(e.name)) > -1, page: o.url });
      if (typeof e.telephone === "string") { var d = e.telephone.replace(/\D/g, "").slice(-10); sc.push({ field: "telephone", value: e.telephone, visible: phones.some(function (p) { return p.replace(/\D/g, "").slice(-10) === d; }) || visible.replace(/\D/g, "").indexOf(d) > -1, page: o.url }); }
      if (e.address && typeof e.address === "object" && e.address.addressLocality) sc.push({ field: "address locality", value: e.address.addressLocality, visible: visible.indexOf(low(e.address.addressLocality)) > -1, page: o.url });
    });
    B.schemaChecks = sc.map(function (x) { x.evidence = [ev.add({ type: "schema", claim: "Structured data " + x.field + " “" + x.value + "” " + (x.visible ? "matches" : "does NOT appear in") + " the visible page text", pageUrl: x.page, sourceName: "Structured data vs page text", evidenceText: x.value, label: "OBSERVED" })]; return x; });
    B.offer = E.offer(home, ev);
    B.home = home.finalUrl; B.domain = E.domainOf(home.finalUrl);
    return B;
  };

  /* ======================= limited mode: the site turns away automated readers ======================= */
  E.emptyCrawl = function (start, blocked) {
    return { start: start, pages: [{ url: start, finalUrl: blocked.finalUrl || start, status: blocked.status || 0, error: "blocked: " + (blocked.error || "HTTP " + blocked.status), depth: 0, redirects: [] }], robots: null, robotsFound: false, robotsStatus: 0,
      sitemapFound: false, sitemapUrls: [], sitemapSource: "", skippedRobots: [], skippedExternal: 0, skippedNonHtml: [], errors: [{ url: start, error: blocked.error || "HTTP " + blocked.status }], limitsHit: [], durationMs: 0, linkStatus: {}, duplicates: [], inbound: {}, broken: [], blocked: blocked };
  };
  /* what Google shows about the site → a business record with the same shape as E.discover (most fields UNKNOWN) */
  E.discoverFromSearch = function (input, domain, res, ev) {
    input = input || {};
    var web = (res && res.web) || [], own = web.filter(function (r) { return r.domain === domain; }), first = own[0], stem = domain.split(".")[0];
    var f = function (v, label, evid, extra) { return Object.assign({ value: v, label: v == null || v === "" || (Array.isArray(v) && !v.length) ? "UNKNOWN" : label, evidence: evid || [] }, extra || {}); };
    var snip = own.map(function (r) { return r.title + ". " + r.description + " " + (r.extra || []).join(". "); }).join(" ");
    var sid = first ? [ev.add({ type: "business", claim: "How " + (res.providerName || "search") + " shows " + domain, sourceUrl: res.searchUrl, sourceName: res.providerName || "Search", pageUrl: first.url, evidenceText: own.slice(0, 3).map(function (r) { return r.title + ": " + r.description; }).join(" | "), label: "OBSERVED" })] : [];
    var tname = first ? norm(first.title.split(/\s[|–—\-:•·]\s|:\s/)[0]) : "";
    var name = input.name || (tname && tname.length <= 40 ? tname : "") || stem.charAt(0).toUpperCase() + stem.slice(1);
    var B = {};
    B.name = f(name, input.name ? "OBSERVED" : "INFERRED", input.name ? [ev.add({ type: "business", claim: "Business name given by you", sourceName: "Your input", evidenceText: input.name })] : sid);
    B.description = f(first ? first.description : "", "OBSERVED", sid);
    var ranked = INDUSTRIES.map(function (ind) { var m = snip.match(ind.re) || []; ind.re.lastIndex = 0; return { ind: ind, s: m.length, hits: uniq(m.map(low)).slice(0, 6) }; }).sort(function (a, b) { return b.s - a.s; });
    if (input.industry) B.industry = f(input.industry, "OBSERVED", [ev.add({ type: "business", claim: "Industry given by you: " + input.industry, sourceName: "Your input", evidenceText: input.industry })], { id: (INDUSTRIES.filter(function (i) { var r = i.re.test(input.industry); i.re.lastIndex = 0; return r; })[0] || {}).id || "" });
    else if (ranked[0] && ranked[0].s >= 1) B.industry = f(ranked[0].ind.label, "INFERRED", [ev.add({ type: "business", claim: "Industry inferred from search snippets: " + ranked[0].ind.label, sourceUrl: res.searchUrl, sourceName: res.providerName || "Search", evidenceText: "Words: " + ranked[0].hits.join(", "), label: "INFERRED" })], { id: ranked[0].ind.id });
    else B.industry = f("", "UNKNOWN", [], { id: "" });
    var cities = CITIES.filter(function (c) { return new RegExp("\\b" + c.replace(/ /g, "\\s") + "\\b", "i").test(snip); });
    var locs = uniq([input.city].concat(cities)).filter(Boolean).slice(0, 6);
    B.locations = f(locs, input.city ? "OBSERVED" : "INFERRED", locs.length ? sid : []); B.city = input.city || cities[0] || "";
    B.services = f([], "UNKNOWN"); B.products = f([], "UNKNOWN"); B.pricing = f([], "UNKNOWN", [], { pages: [] }); B.usp = f([], "UNKNOWN");
    B.audience = input.audience ? f(input.audience, "OBSERVED", []) : f("", "UNKNOWN");
    B.model = f("", "UNKNOWN"); B.valueProp = f(first ? first.title : "", "OBSERVED", sid);
    B.contacts = { phones: [], emails: [], whatsapp: [], address: "", evidence: [] }; B.socials = {}; B.schemaTypes = []; B.schemaChecks = [];
    var none = { found: false, match: "", text: "" };
    B.offer = { score: null, parts: { audience: none, problem: none, outcome: none, differentiation: none }, headline: "", hero: "", genericH1: false, evidence: [], label: "UNKNOWN" };
    B.home = "https://" + domain + "/"; B.domain = domain; B.local = !!input.city || !!(INDUSTRIES.filter(function (i) { return i.id === B.industry.id; })[0] || {}).local; B.fromSearch = true; B.snippetText = snip;
    return B;
  };

  /* ======================= checks ======================= */
  // a check: { id, area, group, name, status: pass|warn|fail|na, score 0-100, weight, detail, evidence[], pages[], label }
  function chk(o) { return Object.assign({ status: "na", score: null, weight: 1, detail: "", evidence: [], pages: [], label: "OBSERVED" }, o); }
  var pct = function (a, b) { return b ? Math.round(100 * a / b) : 0; };
  var band = function (p, good, ok) { return p >= good ? "pass" : p >= ok ? "warn" : "fail"; };
  E.parsePSI = function (j) {
    if (!j || !j.lighthouseResult) return null;
    var L = j.lighthouseResult, c = L.categories || {}, A = L.audits || {}, le = j.loadingExperience || {}, m = le.metrics || {};
    var sc = function (k) { return c[k] && c[k].score != null ? Math.round(c[k].score * 100) : null; };
    var shot = A["final-screenshot"] && A["final-screenshot"].details && A["final-screenshot"].details.data;
    var fails = Object.keys(A).map(function (k) { return A[k]; }).filter(function (a) { return a.score !== null && a.score !== undefined && a.score < 0.5 && a.scoreDisplayMode !== "informative" && a.scoreDisplayMode !== "notApplicable" && a.title; }).slice(0, 12).map(function (a) { return { id: a.id, title: a.title, value: a.displayValue || "" }; });
    return { url: L.finalUrl || L.requestedUrl, strategy: (L.configSettings || {}).formFactor || "mobile", performance: sc("performance"), seo: sc("seo"), accessibility: sc("accessibility"), bestPractices: sc("best-practices"),
      labLcp: A["largest-contentful-paint"] ? A["largest-contentful-paint"].displayValue : "", labCls: A["cumulative-layout-shift"] ? A["cumulative-layout-shift"].displayValue : "", tbt: A["total-blocking-time"] ? A["total-blocking-time"].displayValue : "",
      field: m.LARGEST_CONTENTFUL_PAINT_MS ? { lcpMs: m.LARGEST_CONTENTFUL_PAINT_MS.percentile, lcpCat: m.LARGEST_CONTENTFUL_PAINT_MS.category, cls: m.CUMULATIVE_LAYOUT_SHIFT_SCORE ? m.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : null, inpMs: m.INTERACTION_TO_NEXT_PAINT ? m.INTERACTION_TO_NEXT_PAINT.percentile : null, overall: le.overall_category } : null,
      screenshot: shot || "", fails: fails, fetchedAt: L.fetchTime };
  };
  function psiChecks(psi, homeUrl, ev, add) {
    if (psi) {
      var pid = ev.add({ type: "performance", claim: "Google PageSpeed Insights (" + psi.strategy + ") for the homepage", sourceUrl: "https://pagespeed.web.dev/analysis?url=" + encodeURIComponent(psi.url || homeUrl), sourceName: "Google PageSpeed Insights", pageUrl: homeUrl, evidenceText: "Performance " + psi.performance + " · SEO " + psi.seo + " · Accessibility " + psi.accessibility + " · Best practices " + psi.bestPractices + (psi.labLcp ? " · LCP " + psi.labLcp : "") + (psi.field ? " · Real-user LCP " + (psi.field.lcpMs / 1000).toFixed(1) + " s (" + psi.field.lcpCat + ")" : " · no real-user (CrUX) data"), screenshotUrl: psi.screenshot ? "psi:screenshot" : "" });
      add({ id: "P_perf", name: "Mobile speed (Lighthouse)", group: "Speed", status: band(psi.performance, 90, 50), score: psi.performance, weight: 3, detail: "Performance score " + psi.performance + "/100 on mobile" + (psi.labLcp ? ", largest content shows at " + psi.labLcp : "") + ".", evidence: [pid] });
      if (psi.field) add({ id: "P_field", name: "Real-user speed (Chrome UX Report)", group: "Speed", status: psi.field.overall === "FAST" ? "pass" : psi.field.overall === "AVERAGE" ? "warn" : "fail", score: psi.field.overall === "FAST" ? 100 : psi.field.overall === "AVERAGE" ? 60 : 25, weight: 2, detail: "Real visitors: LCP " + (psi.field.lcpMs / 1000).toFixed(1) + " s" + (psi.field.inpMs ? ", INP " + psi.field.inpMs + " ms" : "") + (psi.field.cls != null ? ", CLS " + psi.field.cls : "") + ": " + psi.field.overall + ".", evidence: [pid] });
      if (psi.seo != null) add({ id: "P_seo", name: "Lighthouse SEO", status: band(psi.seo, 90, 70), score: psi.seo, weight: 1, detail: "Lighthouse SEO score " + psi.seo + "/100.", evidence: [pid] });
      if (psi.accessibility != null) add({ id: "P_a11y", name: "Accessibility (Lighthouse)", group: "Mobile", status: band(psi.accessibility, 90, 70), score: psi.accessibility, weight: 1, detail: "Accessibility score " + psi.accessibility + "/100" + (psi.fails.length ? "; issues include: " + psi.fails.slice(0, 3).map(function (f) { return f.title; }).join("; ") : "") + ".", evidence: [pid] });
    }
  }
  E.techChecks = function (crawl, B, psi, ev) {
    var C = [], pages = crawl.pages.filter(function (p) { return !p.error && p.title !== undefined && !(p.status >= 400); }), home = pages.filter(function (p) { return p.depth === 0; })[0] || pages[0], n = pages.length || 1;
    var add = function (o) { C.push(chk(Object.assign({ area: "website", group: "Technical SEO" }, o))); };
    var listPages = function (arr) { return arr.slice(0, 12).map(function (p) { return p.finalUrl || p.url; }); };
    var e = function (claim, txt, url, label) { return [ev.add({ type: "technical", claim: claim, pageUrl: url || (home && home.finalUrl), evidenceText: txt, label: label || "OBSERVED" })]; };
    if (crawl.blocked) { psiChecks(psi, crawl.start, ev, add); return C; }   // pages could not be read: only Google's own speed test
    if (!home) { add({ id: "T_home", name: "Homepage reachable", status: "fail", score: 0, weight: 5, detail: "The homepage could not be loaded.", evidence: e("Homepage could not be loaded", (crawl.errors[0] || {}).error || "no answer", crawl.start) }); return C; }
    add({ id: "T_home", name: "Homepage loads", status: home.status === 200 ? "pass" : "fail", score: home.status === 200 ? 100 : 0, weight: 3, detail: "HTTP " + home.status + (home.redirects.length ? " after " + home.redirects.length + " redirect(s)" : ""), evidence: e("Homepage HTTP status " + home.status, (home.redirects || []).map(function (r) { return r.status + " " + r.from + " → " + r.to; }).join(" | ") || "no redirects", home.finalUrl) });
    var https = /^https:/.test(home.finalUrl);
    add({ id: "T_https", name: "Secure (HTTPS)", status: https ? "pass" : "fail", score: https ? 100 : 0, weight: 3, detail: https ? "Site loads over HTTPS." : "Site loads over plain HTTP, browsers mark it “Not secure”.", evidence: e("Final homepage URL", home.finalUrl, home.finalUrl), group: "Security & trust" });
    var noTitle = pages.filter(function (p) { return !p.title; }), badLen = pages.filter(function (p) { return p.title && (p.title.length < 15 || p.title.length > 65); });
    var pT = pct(n - noTitle.length, n);
    add({ id: "T_title", name: "Page titles", status: noTitle.length ? band(pT, 98, 85) : badLen.length > n / 2 ? "warn" : "pass", score: Math.round(pT * 0.7 + pct(n - badLen.length, n) * 0.3), weight: 3, detail: noTitle.length + " of " + n + " pages have no title; " + badLen.length + " are shorter than 15 or longer than 65 characters.", pages: listPages(noTitle.concat(badLen)), evidence: e("Title check across " + n + " crawled pages", "Homepage title: “" + home.title + "” (" + home.title.length + " chars)") });
    var dupT = {}; pages.forEach(function (p) { if (p.title && !p.noindex && !(p.status >= 300)) (dupT[low(p.title)] = dupT[low(p.title)] || []).push(p); });
    // v17.2: URL variants that point to one canonical page are the same page, not a duplicate-title problem
    Object.keys(dupT).forEach(function (k) { var seenC = {}; dupT[k] = dupT[k].filter(function (p) { var c = E.normUrl(p.canonical || p.finalUrl || p.url) || p.url; if (seenC[c]) return false; seenC[c] = 1; return true; }); });
    var dups = Object.keys(dupT).filter(function (k) { return dupT[k].length > 1; });
    var dupPages = [].concat.apply([], dups.map(function (k) { return dupT[k]; }));
    add({ id: "T_dupTitle", name: "Unique titles", status: dupPages.length ? (dupPages.length > n / 4 ? "fail" : "warn") : "pass", score: pct(n - dupPages.length, n), weight: 2, detail: dups.length ? dups.length + " title(s) are shared by " + dupPages.length + " pages, e.g. “" + clip(dupT[dups[0]][0].title, 70) + "”." : "Every crawled page has its own title.", pages: listPages(dupPages), evidence: dups.length ? e("Duplicate titles", dups.slice(0, 3).map(function (k) { return "“" + clip(dupT[k][0].title, 60) + "” ×" + dupT[k].length; }).join(" | ")) : [] });
    var noDesc = pages.filter(function (p) { return !p.metaDescription; }), dLen = pages.filter(function (p) { return p.metaDescription && (p.metaDescription.length < 50 || p.metaDescription.length > 165); });
    add({ id: "T_desc", name: "Meta descriptions", status: band(pct(n - noDesc.length, n), 90, 60), score: Math.round(pct(n - noDesc.length, n) * 0.8 + pct(n - dLen.length, n) * 0.2), weight: 2, detail: noDesc.length + " of " + n + " pages have no meta description" + (dLen.length ? "; " + dLen.length + " are too short or too long" : "") + ".", pages: listPages(noDesc), evidence: e("Meta description check", "Homepage: " + (home.metaDescription ? "“" + clip(home.metaDescription, 160) + "”" : "none")) });
    var h1bad = pages.filter(function (p) { return p.h1.length !== 1; });
    add({ id: "T_h1", name: "One H1 per page", status: band(pct(n - h1bad.length, n), 90, 65), score: pct(n - h1bad.length, n), weight: 2, detail: h1bad.length + " of " + n + " pages have " + (h1bad.some(function (p) { return !p.h1.length; }) ? "no H1 or " : "") + "more than one H1.", pages: listPages(h1bad), evidence: e("H1 headings", "Homepage H1: " + (home.h1.length ? home.h1.map(function (h) { return "“" + clip(h, 80) + "”"; }).join(", ") : "none")) });
    var noCan = pages.filter(function (p) { return !p.canonical; }), offCan = pages.filter(function (p) { return p.canonical && E.domainOf(p.canonical) !== E.domainOf(p.finalUrl); });
    add({ id: "T_canonical", name: "Canonical tags", status: offCan.length ? "fail" : band(pct(n - noCan.length, n), 90, 50), score: Math.max(0, pct(n - noCan.length, n) - offCan.length * 20), weight: 1, detail: noCan.length + " pages have no canonical tag" + (offCan.length ? "; " + offCan.length + " point to another domain" : "") + ".", pages: listPages(offCan.concat(noCan)), evidence: e("Canonical check", "Homepage canonical: " + (home.canonical || "none")) });
    var noidx = pages.filter(function (p) { return p.noindex; }), impNo = noidx.filter(function (p) { return ["home", "service", "product", "pricing", "about", "contact"].indexOf(p.type) > -1; });
    add({ id: "T_index", name: "Important pages indexable", status: impNo.length ? "fail" : noidx.length ? "warn" : "pass", score: impNo.length ? Math.max(0, 100 - impNo.length * 30) : 100, weight: 4, detail: impNo.length ? impNo.length + " important page(s) tell Google not to index them (noindex)." : noidx.length ? noidx.length + " minor page(s) are noindex." : "No crawled page blocks indexing.", pages: listPages(impNo.concat(noidx)), evidence: noidx.length ? e("noindex found", noidx.slice(0, 4).map(function (p) { return p.finalUrl + " (" + (p.robotsMeta || p.xRobots) + ")"; }).join(" | "), noidx[0].finalUrl) : [] });
    add({ id: "T_robots", name: "robots.txt", status: crawl.robotsFound ? "pass" : "warn", score: crawl.robotsFound ? 100 : 50, weight: 1, detail: crawl.robotsFound ? "robots.txt found" + (crawl.skippedRobots.length ? "; it blocks " + crawl.skippedRobots.length + " of the links we found." : ".") : "No robots.txt (HTTP " + crawl.robotsStatus + ").", evidence: e("robots.txt", crawl.robotsFound ? (crawl.robots.groups.length + " rule group(s), " + crawl.robots.sitemaps.length + " sitemap line(s)") : "HTTP " + crawl.robotsStatus, new URL(crawl.start).origin + "/robots.txt") });
    add({ id: "T_sitemap", name: "XML sitemap", status: crawl.sitemapFound ? "pass" : "fail", score: crawl.sitemapFound ? 100 : 0, weight: 2, detail: crawl.sitemapFound ? "Sitemap found via " + crawl.sitemapSource + " with " + crawl.sitemapUrls.length + " URL(s)." : "No XML sitemap found in robots.txt or at /sitemap.xml.", evidence: e("Sitemap", crawl.sitemapFound ? crawl.sitemapUrls.length + " URLs listed" : "not found", new URL(crawl.start).origin + "/sitemap.xml") });
    // v20.2: a page that timed out is slow, not broken, it is reported on its own ("didn't load in time")
    var slowP = crawl.pages.filter(function (p) { return !(p.status >= 400) && /timeout/i.test(p.error || ""); });
    var errP = crawl.pages.filter(function (p) { return p.status >= 400 || (p.error && !/timeout/i.test(p.error)); });
    if (slowP.length) add({ id: "T_slow", name: "Pages that load too slowly", status: slowP.length > 3 ? "fail" : "warn", score: Math.max(0, 100 - slowP.length * 15), weight: 2, detail: slowP.length + " page(s) did not load within 15 seconds, so FODO could not read them (visitors on mobile usually give up long before that).", pages: slowP.map(function (p) { return p.url; }).slice(0, 12), evidence: e("Slow pages", slowP.slice(0, 5).map(function (p) { return p.url + " → no answer in 15 s"; }).join(" | "), slowP[0].url) });
    add({ id: "T_broken", name: "Broken pages & links", status: crawl.broken.length || errP.length ? (crawl.broken.length > 5 || errP.length > 3 ? "fail" : "warn") : "pass", score: Math.max(0, 100 - crawl.broken.length * 10 - errP.length * 10), weight: 3, detail: errP.length + " crawled URL(s) returned an error; " + crawl.broken.length + " internal link(s) point to them.", pages: errP.map(function (p) { return p.url; }).slice(0, 12), evidence: errP.length ? e("Error pages", errP.slice(0, 5).map(function (p) { return p.url + " → " + (p.status || p.error); }).join(" | "), errP[0].url) : [] });
    var chains = crawl.pages.filter(function (p) { return (p.redirects || []).length > 1; });
    add({ id: "T_redirects", name: "Redirect chains", status: chains.length ? "warn" : "pass", score: Math.max(0, 100 - chains.length * 15), weight: 1, detail: chains.length ? chains.length + " URL(s) go through 2+ redirects." : "No redirect chains.", pages: listPages(chains), evidence: chains.length ? e("Redirect chain", chains[0].redirects.map(function (r) { return r.status + " " + r.from + " → " + r.to; }).join(" | "), chains[0].url) : [] });
    var sdHome = (home.schemaTypes || []).length, sdErr = pages.filter(function (p) { return p.jsonld.some(function (j) { return !j.ok; }); });
    add({ id: "T_schema", name: "Structured data", status: sdErr.length ? "fail" : sdHome ? "pass" : "warn", score: sdErr.length ? 30 : sdHome ? 100 : 40, weight: 2, detail: sdHome ? "Homepage has structured data: " + home.schemaTypes.slice(0, 6).join(", ") + "." + (sdErr.length ? " " + sdErr.length + " page(s) have JSON-LD that does not parse." : "") : "No structured data (JSON-LD) on the homepage, search engines get less help understanding the business.", pages: listPages(sdErr), evidence: e("Structured data", sdHome ? home.schemaTypes.join(", ") : "none on homepage" + (sdErr.length ? "; parse errors on " + sdErr.length + " page(s)" : "")) });
    var imgs = [].concat.apply([], pages.map(function (p) { return p.images; })), noAlt = imgs.filter(function (i) { return i.alt === null; });
    if (imgs.length) add({ id: "T_alt", name: "Image alt text", status: band(pct(imgs.length - noAlt.length, imgs.length), 90, 60), score: pct(imgs.length - noAlt.length, imgs.length), weight: 1, detail: noAlt.length + " of " + imgs.length + " images have no alt attribute.", evidence: e("Alt text", noAlt.slice(0, 3).map(function (i) { return clip(i.src, 80); }).join(" | ") || "all images have alt") });
    var badUrl = pages.filter(function (p) { var u; try { u = new URL(p.finalUrl); } catch (x) { return false; } return /[A-Z_]/.test(u.pathname) || u.pathname.length > 100 || [].slice.call(u.searchParams.keys()).length > 2; });
    add({ id: "T_urls", name: "Clean URLs", status: band(pct(n - badUrl.length, n), 90, 70), score: pct(n - badUrl.length, n), weight: 1, detail: badUrl.length + " URL(s) have capitals, underscores, many parameters or are very long.", pages: listPages(badUrl), evidence: badUrl.length ? e("URL quality", listPages(badUrl).slice(0, 3).join(" | ")) : [] });
    var thin = pages.filter(function (p) { return p.wordCount < 200 && ["legal", "contact", "app"].indexOf(p.type) < 0; });
    add({ id: "T_thin", name: "Enough content per page", status: band(pct(n - thin.length, n), 85, 60), score: pct(n - thin.length, n), weight: 2, group: "Content", detail: thin.length + " of " + n + " pages have fewer than 200 words.", pages: listPages(thin), evidence: thin.length ? e("Thin pages", thin.slice(0, 4).map(function (p) { return p.finalUrl + " (" + p.wordCount + " words)"; }).join(" | ")) : [] });
    var orphan = pages.filter(function (p) { return p.depth > 0 && (crawl.inbound[E.normUrl(p.finalUrl)] || crawl.inbound[p.url] || 0) < 2; });
    if (n > 3) add({ id: "T_links", name: "Internal linking", status: band(pct(n - orphan.length, n), 80, 55), score: pct(n - orphan.length, n), weight: 1, detail: orphan.length + " page(s) are linked from fewer than 2 other crawled pages.", pages: listPages(orphan), evidence: orphan.length ? e("Weakly linked pages", listPages(orphan).slice(0, 4).join(" | ")) : [] });
    add({ id: "T_viewport", name: "Mobile viewport", status: home.viewport ? "pass" : "fail", score: home.viewport ? 100 : 0, weight: 2, group: "Mobile", detail: home.viewport ? "Viewport meta tag present." : "No viewport meta tag, the site may not scale on phones.", evidence: e("Viewport meta", home.viewport ? "present" : "missing") });
    var mixed = pages.filter(function (p) { return p.mixedContent > 0; });
    if (https) add({ id: "T_mixed", name: "No insecure (http) files on https pages", status: mixed.length ? "warn" : "pass", score: mixed.length ? 50 : 100, weight: 1, group: "Security & trust", detail: mixed.length ? mixed.length + " page(s) load images/scripts over http." : "No mixed content found.", pages: listPages(mixed), evidence: mixed.length ? e("Mixed content", listPages(mixed).slice(0, 3).join(" | ")) : [] });
    add({ id: "T_og", name: "Social sharing tags", status: home.og.title && home.og.image ? "pass" : "warn", score: (home.og.title ? 50 : 0) + (home.og.image ? 50 : 0), weight: 1, group: "Content", detail: home.og.title && home.og.image ? "Open Graph title and image set." : "Missing og:" + (!home.og.title ? "title " : "") + (!home.og.image ? "image" : "") + ", shared links look plain on WhatsApp/LinkedIn.", evidence: e("Open Graph", JSON.stringify(home.og).slice(0, 300)) });
    psiChecks(psi, home.finalUrl, ev, add);
    return C;
  };

  /* conversion, trust, offer: HTML evidence; visual position claims are marked INFERRED */
  E.siteChecks = function (crawl, B, ev) {
    var C = [], pages = crawl.pages.filter(function (p) { return !p.error && p.title !== undefined && !(p.status >= 400); }), home = pages.filter(function (p) { return p.depth === 0; })[0] || pages[0];
    if (!home) return C;
    var add = function (o) { C.push(chk(o)); };
    var e = function (claim, txt, url, label) { return [ev.add({ type: "conversion", claim: claim, pageUrl: url || home.finalUrl, evidenceText: txt, label: label || "OBSERVED" })]; };
    var hc = home.ctas.filter(function (c) { return !c.generic; }), early = hc.filter(function (c) { return c.early; });
    add({ id: "C_cta", area: "conversion", group: "CTA clarity", name: "Clear call to action near the top of the homepage", status: early.length ? "pass" : hc.length ? "warn" : "fail", score: early.length ? 100 : hc.length ? 55 : 10, weight: 3, label: "INFERRED", detail: early.length ? "Early in the page: “" + early.slice(0, 3).map(function (c) { return c.text; }).join("”, “") + "”." : hc.length ? "Action buttons exist (“" + hc[0].text + "”) but not in the first part of the page." : "No action-led button found on the homepage.", evidence: e("Calls to action on the homepage (document order)", home.ctas.slice(0, 8).map(function (c) { return (c.early ? "[top] " : "") + c.text; }).join(" · ") || "none found", home.finalUrl, "INFERRED") });
    var gen = home.ctas.filter(function (c) { return c.generic; });
    add({ id: "C_ctaText", area: "conversion", group: "CTA clarity", name: "Specific button wording", status: !home.ctas.length ? "na" : gen.length > hc.length ? "fail" : gen.length ? "warn" : "pass", score: home.ctas.length ? pct(hc.length, hc.length + gen.length) : null, weight: 1, detail: gen.length ? gen.length + " generic button(s) like “" + gen[0].text + "”, say what happens next (e.g. “Get a free quote”)." : "Buttons say what the visitor gets.", evidence: gen.length ? e("Generic buttons", gen.slice(0, 5).map(function (c) { return c.text; }).join(" · ")) : [] });
    var svc = pages.filter(function (p) { return p.type === "service" || p.type === "product"; }), svcCta = svc.filter(function (p) { return p.ctas.some(function (c) { return !c.generic && !c.nav; }) || p.forms.some(function (f) { return !f.search; }); });
    if (svc.length) add({ id: "C_nextStep", area: "conversion", group: "CTA clarity", name: "Next step on service/product pages", status: band(pct(svcCta.length, svc.length), 90, 60), score: pct(svcCta.length, svc.length), weight: 2, detail: svcCta.length + " of " + svc.length + " service/product pages have their own call to action or form.", pages: svc.filter(function (p) { return svcCta.indexOf(p) < 0; }).map(function (p) { return p.finalUrl; }).slice(0, 10), evidence: e("Service pages without an action", svc.filter(function (p) { return svcCta.indexOf(p) < 0; }).slice(0, 4).map(function (p) { return p.finalUrl; }).join(" | ") || "all have one") });
    var ct = B.contacts, ways = (ct.phones.length ? 1 : 0) + (ct.emails.length ? 1 : 0) + (ct.whatsapp.length ? 1 : 0) + (pages.some(function (p) { return p.forms.some(function (f) { return f.lead !== false && !f.search && !f.tool && f.fieldCount >= 2; }); }) ? 1 : 0);
    add({ id: "C_contact", area: "conversion", group: "Contact friction", name: "Ways to get in touch", status: ways >= 3 ? "pass" : ways === 2 ? "warn" : "fail", score: Math.min(100, ways * 30 + 10), weight: 2, detail: ways + " contact method(s): " + [ct.phones.length && "phone", ct.emails.length && "email", ct.whatsapp.length && "WhatsApp", ways > (ct.phones.length ? 1 : 0) + (ct.emails.length ? 1 : 0) + (ct.whatsapp.length ? 1 : 0) && "form"].filter(Boolean).join(", ") + ".", evidence: ct.evidence });
    var cp = pages.filter(function (p) { return p.type === "contact"; }), navContact = home.internalLinks.some(function (l) { return l.nav && /contact|enquir|inquir|get-in-touch/.test(l.url); });
    add({ id: "C_contactPage", area: "conversion", group: "Contact friction", name: "Contact page linked in the menu", status: cp.length && navContact ? "pass" : cp.length || navContact ? "warn" : "fail", score: (cp.length ? 50 : 0) + (navContact ? 50 : 0), weight: 1, detail: (cp.length ? "Contact page found" : "No contact page found") + (navContact ? " and linked in the main menu." : ", not linked in the main menu."), evidence: e("Contact page", cp.length ? cp[0].finalUrl : "none", cp.length ? cp[0].finalUrl : home.finalUrl) });
    var lead = [].concat.apply([], pages.map(function (p) { return p.forms.filter(function (f) { return !f.search && !f.tool && (f.lead || f.lead == null) && f.fieldCount >= 2; }).map(function (f) { return { f: f, url: p.finalUrl }; }); })), maxF = lead.reduce(function (m, x) { return Math.max(m, x.f.fieldCount); }, 0);
    if (lead.length) add({ id: "C_form", area: "conversion", group: "Contact friction", name: "Short enquiry forms", status: maxF <= 6 ? "pass" : maxF <= 9 ? "warn" : "fail", score: maxF <= 6 ? 100 : maxF <= 9 ? 60 : 25, weight: 2, detail: "Longest lead form has " + maxF + " fields.", pages: lead.filter(function (x) { return x.f.fieldCount > 6; }).map(function (x) { return x.url; }).slice(0, 6), evidence: e("Form fields", lead.slice(0, 3).map(function (x) { return x.url + ": " + x.f.fieldCount + " fields (" + x.f.fields.map(function (fl) { return fl.label || fl.name || fl.type; }).slice(0, 10).join(", ") + ")"; }).join(" | "), lead[0].url) });
    var telLinks = pages.some(function (p) { return p.telLinks > 0; });
    add({ id: "C_tap", area: "conversion", group: "Contact friction", name: "Tap-to-call or WhatsApp button", status: telLinks || ct.whatsapp.length ? "pass" : "warn", score: telLinks || ct.whatsapp.length ? 100 : 40, weight: 1, detail: telLinks || ct.whatsapp.length ? "Phone visitors can call or WhatsApp in one tap." : "No tap-to-call or WhatsApp button found, phone visitors must copy the number.", evidence: e("Tap-to-call / WhatsApp", (ct.whatsapp[0] || "") + (telLinks ? " tel: link present" : "") || "none") });
    var pr = B.pricing.value.length, prPage = pages.some(function (p) { return p.type === "pricing"; });
    add({ id: "C_pricing", area: "conversion", group: "Pricing clarity", name: "Prices or price ranges visible", status: pr ? "pass" : prPage ? "warn" : "fail", score: pr ? 100 : prPage ? 50 : 15, weight: 2, detail: pr ? "Prices shown, e.g. " + B.pricing.value.slice(0, 3).join(", ") + "." : prPage ? "A pricing page exists but no actual prices were found on it." : "No prices, ranges or “starting from” figures found anywhere.", evidence: B.pricing.evidence.length ? B.pricing.evidence : e("Pricing", "no price patterns on " + pages.length + " pages") });
    var faq = pages.filter(function (p) { return p.faq.found; });
    add({ id: "C_faq", area: "conversion", group: "Objection handling", name: "FAQ answering objections", status: faq.length ? "pass" : "warn", score: faq.length ? 100 : 30, weight: 1, detail: faq.length ? "FAQ found on " + faq.length + " page(s)" + (faq.some(function (p) { return p.faq.schema; }) ? " (with FAQ schema)." : ".") : "No FAQ, common objections (price, time, trust) go unanswered.", evidence: faq.length ? e("FAQ", faq[0].faq.samples.slice(0, 4).join(" | ") || "FAQ section", faq[0].finalUrl) : [] });
    var urg = uniq([].concat.apply([], pages.slice(0, 10).map(function (p) { return p.urgency; })));
    add({ id: "C_incentive", area: "conversion", group: "Offer clarity", name: "Reason to act now (offer / free step)", status: urg.length ? "pass" : "warn", score: urg.length ? 100 : 40, weight: 1, detail: urg.length ? "Found: " + urg.slice(0, 4).join(", ") + "." : "No free first step, offer or reason to act now.", evidence: urg.length ? e("Incentives", urg.join(" · ")) : [] });
    var O = B.offer;
    ["audience", "problem", "outcome", "differentiation"].forEach(function (k) { var p = O.parts[k]; add({ id: "O_" + k, area: "conversion", group: "Offer clarity", name: "Offer names the " + k, status: p.found ? "pass" : "fail", score: p.found ? 100 : 0, weight: 1.5, label: "INFERRED", detail: p.found ? "“" + p.text + "”" : "The homepage headline and intro don't state the " + k + ".", evidence: O.evidence }); });
    // trust
    var testi = pages.filter(function (p) { return p.testimonials.found; });
    add({ id: "R_testi", area: "trust", group: "Social proof", name: "Testimonials or reviews on the site", status: testi.length ? "pass" : "fail", score: testi.length ? 100 : 0, weight: 3, detail: testi.length ? "Found on " + testi.length + " page(s)." : "No testimonials, reviews or client stories found.", evidence: e("Testimonials", testi.length ? testi.slice(0, 3).map(function (p) { return p.finalUrl; }).join(" | ") : "none on " + pages.length + " pages", testi.length ? testi[0].finalUrl : home.finalUrl) });
    var rs = pages.some(function (p) { return p.schemaTypes.some(function (t) { return /AggregateRating|Review/.test(t); }); });
    add({ id: "R_ratingSchema", area: "trust", group: "Social proof", name: "Review / rating markup", status: rs ? "pass" : "warn", score: rs ? 100 : 40, weight: 1, detail: rs ? "Rating/review structured data found (self-published, not verified by FODO)." : "No review or rating structured data.", evidence: e("Review schema", rs ? "AggregateRating/Review present" : "none") });
    var tm = uniq([].concat.apply([], pages.slice(0, 20).map(function (p) { return p.trust; })));
    add({ id: "R_markers", area: "trust", group: "Credibility", name: "Credibility markers (years, certifications, clients, guarantees)", status: tm.length >= 3 ? "pass" : tm.length ? "warn" : "fail", score: Math.min(100, tm.length * 30), weight: 2, detail: tm.length ? "Found: " + tm.slice(0, 5).join(", ") + "." : "No years in business, certifications, client numbers or guarantees found.", evidence: tm.length ? e("Credibility claims", tm.join(" · ")) : [] });
    var proof = pages.filter(function (p) { return p.type === "proof"; });
    add({ id: "R_cases", area: "trust", group: "Credibility", name: "Case studies / portfolio", status: proof.length ? "pass" : "warn", score: proof.length ? 100 : 35, weight: 1, detail: proof.length ? proof.length + " work/portfolio page(s)." : "No case-study or portfolio pages found.", evidence: proof.length ? e("Proof pages", proof.slice(0, 3).map(function (p) { return p.finalUrl; }).join(" | ")) : [] });
    var about = pages.some(function (p) { return p.type === "about"; });
    add({ id: "R_about", area: "trust", group: "Credibility", name: "About page", status: about ? "pass" : "warn", score: about ? 100 : 30, weight: 1, detail: about ? "About page found." : "No about page, visitors can't see who is behind the business.", evidence: [] });
    var legal = pages.some(function (p) { return p.type === "legal"; }) || home.internalLinks.some(function (l) { return /privacy|terms/.test(l.url); });
    add({ id: "R_legal", area: "trust", group: "Credibility", name: "Privacy policy / terms", status: legal ? "pass" : "warn", score: legal ? 100 : 30, weight: 1, detail: legal ? "Privacy/terms linked." : "No privacy policy or terms link found.", evidence: [] });
    add({ id: "R_address", area: "trust", group: "Credibility", name: "Physical address shown", status: ct.address ? "pass" : B.local ? "fail" : "warn", score: ct.address ? 100 : B.local ? 0 : 50, weight: B.local ? 2 : 1, detail: ct.address ? "“" + clip(ct.address, 120) + "”" : "No street address found.", evidence: ct.address ? e("Address", ct.address) : [] });
    add({ id: "R_https", area: "trust", group: "Credibility", name: "Secure connection", status: /^https:/.test(home.finalUrl) ? "pass" : "fail", score: /^https:/.test(home.finalUrl) ? 100 : 0, weight: 1, detail: /^https:/.test(home.finalUrl) ? "HTTPS." : "Not HTTPS.", evidence: [] });
    (B.schemaChecks || []).filter(function (x) { return !x.visible; }).slice(0, 2).forEach(function (x, i) { add({ id: "R_schemaMismatch" + i, area: "trust", group: "Consistency", name: "Structured data matches the page (" + x.field + ")", status: "warn", score: 40, weight: 1, detail: "Schema " + x.field + " “" + x.value + "” is not visible on the page.", evidence: x.evidence }); });
    return C;
  };

  /* ======================= search research ======================= */
  E.intentOf = function (q, brand, city) {
    var t = low(q);
    if (brand && t.indexOf(low(brand)) > -1 && !/\b(vs|alternative|competitor)/.test(t)) return "NAVIGATIONAL";
    if (/\b(problem|fix|issue|not working|solution|how to (stop|fix|get rid)|why (is|does|my))\b/.test(t)) return "PROBLEM-BASED";
    if (/\b(price|pricing|cost|rates?|fees?|buy|book|hire|order|quote|cheap|affordable|packages?)\b/.test(t)) return "TRANSACTIONAL";
    if (/\bnear me\b/.test(t) || (city && t.indexOf(low(city)) > -1)) return "LOCAL";
    if (/\b(best|top|vs|versus|alternatives?|review|reviews|compare|comparison)\b/.test(t)) return "COMMERCIAL";
    return "INFORMATIONAL";
  };
  E.buildQueries = function (B, input) {
    input = input || {};
    var name = B.name.value, city = input.city || B.city || "", ind = (B.industry && B.industry.value) || "";
    // v17.1.1: a service name must read like a service ("SEO", "Meta Ads"), not a tagline fragment such as
    // "— everything your brand needs to compete digitally". Strip dashes/bullets, keep the part before a separator, max 6 words.
    var tidy = function (x) { x = String(x || "").replace(/^[\s\u2014\u2013\-:|•·*>.,]+/, "").split(/\s[\u2014\u2013|:]\s|\s-\s|\s(?:that|which|who|so you|to help|you can|you)\s/i)[0].replace(/[\s\u2014\u2013\-:|•·.,]+$/, "").trim();
      return x && x.split(/\s+/).length <= 6 && /[a-z]/i.test(x) ? x : ""; };
    var cands = [input.product].concat(B.services.value || [], [ind.split("/")[0]]).map(tidy).filter(Boolean);
    var svc = cands[0] || "";
    svc = clip(svc.replace(/\b(services?|solutions?)\b/i, "").trim() || svc, 50);
    var svc2 = clip(cands.filter(function (c) { return low(c) !== low(cands[0] || ""); })[0] || "", 50), aud = input.audience || B.audience.value || "";
    var Q = [];
    var add = function (q, kind) { q = norm(q); if (q.length > 3 && !Q.some(function (x) { return low(x.q) === low(q); })) Q.push({ q: q, kind: kind, intent: E.intentOf(q, name, city) }); };
    add('"' + name + '"', "brand");
    if (svc) {
      if (city) { add(svc + " " + city, "category"); add("best " + svc + " in " + city, "best"); if (svc2) add(svc2 + " " + city, "category"); add(svc + " price " + city, "pricing"); }
      else { add(svc, "category"); add("best " + svc + (aud ? " for " + aud : ""), "best"); if (svc2) add(svc2, "category"); add(svc + " pricing", "pricing"); }
      add(name + " alternatives", "alternatives");
      add(svc + " reviews" + (city ? " " + city : ""), "voice");
      add(svc + (city ? " " + city : "") + " reddit", "voice");
      add("how to choose " + svc, "problem");
      add(svc + " trends 2026", "trends");
    }
    add(name + " reviews", "voice");
    return Q.slice(0, E.CFG.MAX_QUERIES);
  };
  E.DIRECTORIES = /(^|\.)(google\.[a-z.]+|youtube\.com|facebook\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com|wikipedia\.org|justdial\.com|sulekha\.com|indiamart\.com|tradeindia\.com|yelp\.[a-z.]+|tripadvisor\.[a-z.]+|zomato\.com|swiggy\.com|magicpin\.in|practo\.com|lybrate\.com|quora\.com|reddit\.com|medium\.com|pinterest\.[a-z.]+|amazon\.[a-z.]+|flipkart\.com|myntra\.com|clutch\.co|goodfirms\.co|g2\.com|capterra\.[a-z.]+|trustpilot\.com|glassdoor\.[a-z.]+|ambitionbox\.com|naukri\.com|indeed\.com|crunchbase\.com|zaubacorp\.com|tofler\.in|mouthshut\.com|yellowpages\.[a-z.]+|bing\.com|apple\.com|play\.google\.com|booking\.com|makemytrip\.com|99acres\.com|magicbricks\.com|housing\.com|nobroker\.in|urbancompany\.com|threads\.net|tiktok\.com|economictimes\.indiatimes\.com|timesofindia\.indiatimes\.com|forbes\.com|wikihow\.com|upwork\.com|fiverr\.com|designrush\.com|sortlist\.[a-z.]+|bark\.com|nearbuy\.com|dineout\.co\.in|eazydiner\.com|tracxn\.com|owler\.com|zoominfo\.com|similarweb\.com|semrush\.com|ahrefs\.com|hubspot\.com|shiksha\.com|collegedunia\.com|grotal\.com|asklaila\.com|indiacom\.com)$/i;
  /* search answers arrive already normalised by the server (Serper → Google results, or Brave), add host/domain here */
  E.parseSearch = function (j) {
    j = j || {};
    var host = function (u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };
    var d = function (r) { return Object.assign({}, r, { title: norm(r.title), description: norm(r.description), host: host(r.url), domain: E.domainOf(r.url) }); };
    return { provider: j.provider || "", providerName: j.providerName || "Search", searchUrl: j.searchUrl || "",
      web: (j.web || []).map(function (r, i) { var x = d(r); x.pos = r.pos || i + 1; x.extra = (r.extra || []).map(norm); return x; }),
      discussions: (j.discussions || []).map(function (r) { var x = d(r); x.forum = r.forum || ""; x.question = norm(r.question); x.top = norm(r.top); return x; }),
      faq: (j.faq || []).map(function (r) { return { question: norm(r.question), answer: norm(r.answer), url: r.url || "", domain: E.domainOf(r.url || "") }; }),
      locations: (j.locations || []).map(function (r) { return { title: norm(r.title), url: r.url || "", website: r.website || "", rating: r.rating, reviews: r.reviews, address: norm(r.address) }; }), related: j.related || [] };
  };
  E.parseBrave = E.parseSearch;
  /* country for search results: your input → domain ending → phone prefix → schema address; otherwise none (UNKNOWN) */
  E.guessCountry = function (B, url) {
    var h = ""; try { h = new URL(url).hostname; } catch (e) {}
    var tld = { in: "India", uk: "United Kingdom", ae: "UAE", au: "Australia", ca: "Canada", sg: "Singapore", de: "Germany", fr: "France", sa: "Saudi Arabia", qa: "Qatar", nz: "New Zealand", za: "South Africa", np: "Nepal", bd: "Bangladesh", lk: "Sri Lanka" }[h.split(".").pop()];
    if (tld) return tld;
    var ph = ((B && B.contacts && B.contacts.phones) || []).join(" ");
    if (/\+91/.test(ph)) return "India"; if (/\+971/.test(ph)) return "UAE"; if (/\+44/.test(ph)) return "United Kingdom"; if (/\+61/.test(ph)) return "Australia"; if (/\+65/.test(ph)) return "Singapore";
    var c = B && B.city ? low(B.city) : "";
    if (/delhi|noida|gurugram|gurgaon|mumbai|pune|bengaluru|bangalore|hyderabad|chennai|kolkata|ahmedabad|jaipur|lucknow|chandigarh|indore|kochi/.test(c)) return "India";
    if (/dubai|abu dhabi|sharjah/.test(c)) return "UAE"; if (/london|manchester|birmingham/.test(c)) return "United Kingdom";
    return "";
  };
  E.serpAnalysis = function (serps, target) {
    return serps.map(function (s) {
      var web = s.res ? s.res.web : [];
      var ours = web.filter(function (r) { return r.domain === target; })[0];
      return { q: s.q, kind: s.kind, intent: s.intent, ok: !!(s.res && s.res.web && s.res.web.length), ourPos: ours ? ours.pos : null, ourUrl: ours ? ours.url : "", competitors: web.filter(function (r) { return r.domain !== target && !E.DIRECTORIES.test(r.host); }).map(function (r) { return { domain: r.domain, pos: r.pos, title: r.title, url: r.url }; }), directories: web.filter(function (r) { return E.DIRECTORIES.test(r.host); }).map(function (r) { return { host: r.host, pos: r.pos, url: r.url, title: r.title }; }), evidence: s.evidence || [] };
    });
  };
  var INTENT_W = { TRANSACTIONAL: 1, LOCAL: 1, COMMERCIAL: 0.85, "PROBLEM-BASED": 0.6, INFORMATIONAL: 0.4, NAVIGATIONAL: 0.2 };
  E.keywordOpps = function (serpA, siteText, volumes) {
    var st = low(siteText), vmax = 1;
    (volumes || []).forEach(function (v) { if (v.volume > vmax) vmax = v.volume; });
    return serpA.filter(function (s) { return s.kind !== "brand" && s.kind !== "voice"; }).map(function (s) {
      var terms = low(s.q).replace(/["']/g, "").split(/\s+/).filter(function (w) { return w.length > 3 && !/^(best|price|pricing|reviews?|near|how|choose|trends|alternatives|2026|with|from|for)$/.test(w); });
      var rel = terms.length ? terms.filter(function (w) { return st.indexOf(w) > -1; }).length / terms.length : 0;
      var comps = s.competitors.filter(function (c) { return c.pos <= 10; }).length, gap = !s.ok ? null : s.ourPos == null ? 1 : s.ourPos > 3 ? 0.5 : 0.1;
      var vol = (volumes || []).filter(function (v) { return low(v.keyword) === low(s.q); })[0], out = { keyword: s.q, intent: s.intent, relevance: Math.round(rel * 100) / 100, ourPos: s.ourPos, competitorsInTop10: comps, evidence: s.evidence };
      if (vol && vol.volume != null) {
        var demand = Math.log(1 + vol.volume) / Math.log(1 + vmax);
        out.volume = vol.volume; out.cpc = vol.cpc; out.competition = vol.competition; out.label = "ESTIMATED";
        out.score = Math.round(100 * demand * (INTENT_W[s.intent] || 0.4) * rel * (gap == null ? 0.5 : gap));
        out.opportunity = out.score >= 45 ? "High" : out.score >= 20 ? "Medium" : "Low";
      } else {
        out.volume = null; out.label = "INFERRED";
        if (gap == null) out.opportunity = "Unknown";
        else { var q = (INTENT_W[s.intent] || 0.4) * rel * gap; out.opportunity = q >= 0.55 && comps >= 2 ? "High" : q >= 0.25 ? "Medium" : "Low"; }
      }
      return out;
    });
  };

  /* ======================= competitors ======================= */
  E.candidates = function (serpA, target, places, srcName) {
    srcName = srcName || "Search results";
    var c = {};
    serpA.forEach(function (s) {
      if (["category", "best", "pricing", "alternatives", "problem"].indexOf(s.kind) < 0) return;
      s.competitors.forEach(function (r) { if (!r.domain || r.domain === target) return; var x = c[r.domain] = c[r.domain] || { domain: r.domain, queries: [], score: 0, urls: [], titles: [], sources: [] }; if (x.queries.indexOf(s.q) < 0) { x.queries.push(s.q); x.score += (11 - Math.min(10, r.pos)) / 10; } x.urls.push(r.url); x.titles.push(r.title); if (x.sources.indexOf(srcName) < 0) x.sources.push(srcName); x.evidence = (x.evidence || []).concat(s.evidence || []); });
    });
    (places || []).forEach(function (p) { if (!p.website) return; var d = E.domainOf(/^https?:/.test(p.website) ? p.website : "https://" + p.website); if (!d || d === target || E.DIRECTORIES.test(d)) return; var x = c[d] = c[d] || { domain: d, queries: [], score: 0, urls: [], titles: [], sources: [] }; x.score += 0.6; x.place = p; x.urls.push(/^https?:/.test(p.website) ? p.website : "https://" + p.website); x.titles.push(p.name); if (x.sources.indexOf(p.source || "Map listing") < 0) x.sources.push(p.source || "Map listing"); });
    return Object.keys(c).map(function (k) { return c[k]; }).sort(function (a, b) { return b.score - a.score; }).slice(0, 10);
  };
  var STOPW = /^(the|and|for|with|your|you|our|are|from|that|this|have|has|was|were|will|can|all|any|get|more|best|top|home|about|contact|services?|solutions?|company|limited|ltd|pvt|private|india|online|new|now|one|also|how|what|why|who|its|not|but|into|over|than|out|use|may|just|very|each|most|other|some|such|only|own|same|so|too|we|us|of|to|in|on|at|by|an|a|is|it|be|or|as|do|if|no|up|my|me)$/;
  function terms(s, n) { var c = {}; low(s).replace(/[^a-z0-9ऀ-ॿ\s]/g, " ").split(/\s+/).forEach(function (w) { if (w.length > 2 && !STOPW.test(w) && !/^\d+$/.test(w)) c[w] = (c[w] || 0) + 1; }); return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).slice(0, n || 40); }
  function bigrams(s) { var w = low(s).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(function (x) { return x.length > 2 && !STOPW.test(x); }), o = {}; for (var i = 0; i < w.length - 1; i++) o[w[i] + " " + w[i + 1]] = 1; return Object.keys(o); }
  var jac = function (a, b) { var A = {}, n = 0; a.forEach(function (x) { A[x] = 1; }); b.forEach(function (x) { if (A[x]) n++; }); var u = a.length + b.length - n; return u ? n / u : 0; };
  E._terms = terms; E._jac = jac;
  /* the same profile for the business and each competitor, so comparisons are like-for-like */
  E.compProfile = function (pages) {
    pages = (pages || []).filter(function (p) { return p && !p.error && p.title !== undefined && !(p.status >= 400); });
    var home = pages[0]; if (!home) return null;
    var bag = pages.map(function (p) { return [p.title, p.metaDescription, p.h1.join(" "), (p.headings.h2 || []).join(" "), (p.headings.h3 || []).slice(0, 12).join(" "), p.internalLinks.filter(function (l) { return l.nav; }).map(function (l) { return l.text; }).join(" ")].join(" "); }).join(" ");
    var heroTxt = norm((home.h1[0] || "") + " " + home.hero + " " + home.metaDescription);
    var ev = new Evidence(), offer = E.offer(home, ev);
    var navUrls = home.internalLinks.map(function (l) { return l.url; });
    return { url: home.finalUrl, domain: E.domainOf(home.finalUrl), title: home.title, headline: home.h1[0] || "", meta: home.metaDescription, hero: clip(heroTxt, 300),
      offerScore: offer.score, offerParts: Object.keys(offer.parts).filter(function (k) { return offer.parts[k].found; }),
      ctas: uniq(home.ctas.filter(function (c) { return !c.generic; }).map(function (c) { return c.text; })).slice(0, 6), pricing: pages.some(function (p) { return p.pricing.found && p.pricing.samples.some(function (s) { return /\d/.test(s); }); }), pricingSamples: uniq([].concat.apply([], pages.map(function (p) { return p.pricing.samples.filter(function (s) { return /\d/.test(s); }); }))).slice(0, 4),
      testimonials: pages.some(function (p) { return p.testimonials.found; }), faq: pages.some(function (p) { return p.faq.found; }), trust: uniq([].concat.apply([], pages.map(function (p) { return p.trust; }))).slice(0, 8), urgency: uniq([].concat.apply([], pages.map(function (p) { return p.urgency; }))).slice(0, 5),
      schema: uniq([].concat.apply([], pages.map(function (p) { return p.schemaTypes; }))).slice(0, 8), blog: navUrls.some(function (u) { return /blog|insight|article|news|resources/.test(u); }) || pages.some(function (p) { return p.type === "blog"; }),
      navCount: home.internalLinks.filter(function (l) { return l.nav; }).length, linkCount: home.internalLinks.length, socials: Object.keys(home.socials || {}), phone: home.phones.length > 0 || home.telLinks > 0, whatsapp: home.whatsapp.length > 0,
      https: /^https:/.test(home.finalUrl), viewport: home.viewport, titleOk: home.title.length >= 15 && home.title.length <= 65, metaOk: !!home.metaDescription, words: home.wordCount,
      terms: terms(bag, 50), bigrams: bigrams(heroTxt + " " + (home.headings.h2 || []).slice(0, 8).join(" ")), text: low(pages.map(function (p) { return p.text.slice(0, 6000); }).join(" ")) };
  };
  E.compareCompetitor = function (T, C, cand, city, maxSearch) {
    var service = jac(T.terms, C.terms), pos = jac(T.bigrams, C.bigrams), geo = city ? (C.text.indexOf(low(city)) > -1 ? 1 : 0) : null;
    if (cand.place) geo = 1;
    var search = Math.min(1, (cand.score || 0) / Math.max(1, maxSearch || 1));
    var total = 0.35 * search + 0.35 * Math.min(1, service * 3) + (geo == null ? 0 : 0.15 * geo) + 0.15 * Math.min(1, pos * 4);
    var w = geo == null ? 0.85 : 1; total = total / w;
    var shared = T.terms.filter(function (t) { return C.terms.indexOf(t) > -1; }).slice(0, 6);
    var reason = [cand.queries.length ? "appears in " + cand.queries.length + " of the market searches (" + cand.queries.slice(0, 2).map(function (q) { return "“" + q + "”"; }).join(", ") + ")" : "", cand.place ? "listed nearby on " + (cand.place.source || "the map") : "", shared.length ? "shares service words: " + shared.join(", ") : "", geo === 1 && city ? "mentions " + city : ""].filter(Boolean).join("; ");
    return { searchOverlap: Math.round(search * 100) / 100, serviceOverlap: Math.round(service * 100) / 100, geoOverlap: geo, positioningSimilarity: Math.round(pos * 100) / 100, score: Math.round(total * 100), confidence: total >= 0.55 ? "HIGH" : total >= 0.35 ? "MEDIUM" : "LOW", reason: reason, shared: shared };
  };
  E.compInsights = function (T, C) {
    var adv = [], weak = [];
    var cmp = function (cond, a, w) { if (cond === 1) adv.push(a); else if (cond === -1) weak.push(w); };
    cmp(C.pricing && !T.pricing ? 1 : !C.pricing && T.pricing ? -1 : 0, "Shows prices (" + (C.pricingSamples[0] || "price list") + ")", "Hides prices, you show yours");
    cmp(C.testimonials && !T.testimonials ? 1 : !C.testimonials && T.testimonials ? -1 : 0, "Shows testimonials / reviews", "No testimonials on the pages read");
    cmp(C.faq && !T.faq ? 1 : !C.faq && T.faq ? -1 : 0, "Answers questions in an FAQ", "No FAQ");
    cmp(C.offerScore - T.offerScore >= 25 ? 1 : T.offerScore - C.offerScore >= 25 ? -1 : 0, "Clearer offer in the headline (" + C.offerScore + " vs your " + T.offerScore + ")", "Vaguer headline offer (" + C.offerScore + " vs your " + T.offerScore + ")");
    cmp(C.trust.length >= 3 && T.trust.length < 2 ? 1 : T.trust.length >= 3 && C.trust.length < 2 ? -1 : 0, "Credibility claims: " + C.trust.slice(0, 3).join(", "), "Few credibility claims");
    cmp(C.blog && !T.blog ? 1 : !C.blog && T.blog ? -1 : 0, "Publishes a blog / resources", "No blog or resources");
    cmp(C.schema.length && !T.schema.length ? 1 : !C.schema.length && T.schema.length ? -1 : 0, "Uses structured data (" + C.schema.slice(0, 3).join(", ") + ")", "No structured data");
    cmp(C.whatsapp && !T.whatsapp ? 1 : !C.whatsapp && T.whatsapp ? -1 : 0, "One-tap WhatsApp", "No WhatsApp button");
    cmp(C.urgency.length && !T.urgency.length ? 1 : 0, "Gives a reason to act now (" + C.urgency[0] + ")", "");
    var opp = adv.length ? "Close the gap on: " + adv.slice(0, 2).map(function (a) { return a.split(" (")[0].toLowerCase(); }).join(" and ") + "." : weak.length ? "Lean on what they lack: " + weak[0].toLowerCase() + "." : "No clear gap found from the pages read.";
    return { advantages: adv.slice(0, 5), weaknesses: weak.filter(Boolean).slice(0, 5), opportunity: opp };
  };
  E.positioning = function (T, comps) {
    var cnt = {}; comps.forEach(function (c) { c.bigrams.forEach(function (b) { cnt[b] = (cnt[b] || 0) + 1; }); });
    var need = Math.max(1, Math.ceil(comps.length / 2));
    var same = T.bigrams.filter(function (b) { return cnt[b] >= need; }).slice(0, 8), unique = T.bigrams.filter(function (b) { return !cnt[b]; }).slice(0, 8);
    var CLAIMS = [["transparent pricing", function (p) { return p.pricing; }], ["testimonials / reviews", function (p) { return p.testimonials; }], ["a guarantee", function (p) { return p.trust.some(function (t) { return /guarantee|money/.test(t); }); }], ["years of experience", function (p) { return p.trust.some(function (t) { return /year|since|established/.test(t); }); }],
      ["client/customer numbers", function (p) { return p.trust.some(function (t) { return /clients|customers|brands|projects|orders|patients|students/.test(t); }); }], ["a free first step (audit, trial, consultation)", function (p) { return p.urgency.some(function (u) { return /free/.test(u); }); }], ["a named audience", function (p) { return p.offerParts.indexOf("audience") > -1; }], ["a stated outcome", function (p) { return p.offerParts.indexOf("outcome") > -1; }]];
    var white = CLAIMS.filter(function (c) { return !comps.some(c[1]); }).map(function (c) { return { claim: c[0], youHave: c[1](T) }; });
    var common = CLAIMS.filter(function (c) { return comps.filter(c[1]).length >= need; }).map(function (c) { return { claim: c[0], youHave: c[1](T) }; });
    return { sameAsEveryone: same, uniqueWords: unique, whiteSpace: white, tableStakes: common, label: "INFERRED" };
  };

  /* ======================= customer voice ======================= */
  var VOICE = {
    complaints: /\b(bad|poor|worst|terrible|horrible|late|delay(ed)?|rude|overpriced|over-priced|expensive|scam|fraud|refund|never (again|came|replied)|didn'?t|did not|not (good|worth|happy|recommended)|disappoint\w*|problem|issue|slow|cold food|dirty|broken|waste|hidden (fees?|charges?)|unprofessional|no response|cheated)\b/i,
    needs: /\b(looking for|need(ed)? (a|an|some)?|want(ed)? (a|an)?|wish|recommend(ation)?s?|suggest(ion)?s?|any (good|reliable)|affordable|budget|reliable|trusted|quick|fast|near me|which is better|help me (find|choose))\b/i,
    objections: /\b(worth (it|the money)|too (expensive|costly|pricey)|is it safe|legit|trust(worthy)?|hidden|contract|lock-?in|commitment|guarantee|risk|scam\?|reviews? (fake|paid))\b/i,
    triggers: /\b(urgent(ly)?|asap|launch(ing)?|opening|wedding|festival|diwali|sale|offer|discount|free trial|demo|same day|deadline|moving|new (business|home|office|baby)|before (exam|summer|winter)|emergency)\b/i,
    positive: /\b(great|excellent|amazing|awesome|love(d)?|best|friendly|professional|recommend(ed)?|helpful|quick|on time|value for money|worth it|delicious|clean|polite|satisfied)\b/i,
  };
  var THEMES = [["Price & value", /\b(price|pricing|cost|expensive|cheap|affordable|budget|value|fees?|charges?|worth)\b/i], ["Speed & timing", /\b(late|delay|slow|quick|fast|on time|wait(ing)?|hours?|days?|same day)\b/i], ["Quality of work / product", /\b(quality|taste|result|results|work|product|finish|fresh|clean|broken|defect)\b/i],
    ["Staff & service", /\b(staff|service|rude|friendly|polite|support|response|reply|communication|professional)\b/i], ["Trust & honesty", /\b(trust|scam|fraud|legit|honest|hidden|fake|genuine|transparent)\b/i], ["Location & access", /\b(location|parking|near|distance|area|delivery|reach)\b/i]];
  /* v17.2 entity resolution: a search result that names the brand is only counted when it is clearly about THIS business:
     it mentions the domain, or the brand together with the business's category / services / city. Otherwise it is set aside
     (another company with the same name, e.g. "Fodo, the photo printing app"). */
  var STOPW = /^(and|the|for|with|your|our|you|best|top|from|that|this|new|more|get|free|near|all|services?|solutions?|company|agency|business|india|online|digital)$/i;
  E.entityContext = function (B, input) {
    var words = [].concat((B.industry && B.industry.value) || "", (B.services && B.services.value) || [], input && input.product || "", input && input.city || B.city || "", B.location || "")
      .join(" ").toLowerCase().split(/[^a-z0-9\u0900-\u097f]+/).filter(function (w) { return w.length > 2 && !STOPW.test(w); });
    var dom = String(B.domain || "").toLowerCase(), root = dom.split(".")[0];
    return { name: low((B.name && B.name.value) || root), domain: dom, root: root, words: uniq(words).slice(0, 40) };
  };
  E.aboutUs = function (text, url, ctx) {
    var t = low(text) + " " + low(url || "");
    if (ctx.domain && t.indexOf(ctx.domain) > -1) return { ok: true, why: "names your website" };
    var nameHit = ctx.name && new RegExp("(^|[^a-z0-9])" + ctx.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)").test(t);
    if (!nameHit) return { ok: true, why: "about the market, not the brand", market: true };
    var hit = ctx.words.filter(function (w) { return t.indexOf(w) > -1; });
    return hit.length ? { ok: true, why: "names you with " + hit.slice(0, 2).join(", ") } : { ok: false, why: "names “" + ctx.name + "” but nothing about your business, probably a different company" };
  };
  // v20.2: employee-review sites talk about working there, not buying there
  var EMPLOYER = /(^|\.)(ambitionbox|glassdoor|indeed|naukri|foundit|comparably|kununu|jobs?\.|careers?\.)/i;
  E.voiceRelevant = function (it, ctx) {
    var host = ""; try { host = new URL(it.url).hostname; } catch (e) {}
    if (EMPLOYER.test(host) || /\b(work(ing)? (here|there|culture)|salary|appraisal|interview process|management (is|was)|employee)\b/i.test(it.text || "")) return false;
    if (!ctx || !ctx.words || !ctx.words.length) return true;
    var t = low(it.text) + " " + low(it.url);
    return (ctx.domain && t.indexOf(ctx.domain) > -1) || (ctx.name && t.indexOf(ctx.name) > -1) || ctx.words.some(function (w) { return new RegExp("(^|[^a-z0-9])" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "", "i").test(t); });
  };
  E.voice = function (items, ctx) {
    // items: [{ text, url, source, evidence }]; ctx (optional): E.entityContext, keeps only snippets about this business or its market
    var groups = {}; Object.keys(VOICE).forEach(function (k) { groups[k] = {}; });
    var used = 0, total = items.length;
    items = items.filter(function (it) { return E.voiceRelevant(it, ctx); });
    items.forEach(function (it) {
      norm(it.text).split(/(?:[.!?]+\s+)|(?:\s[|•·]\s)/).forEach(function (s) {
        s = norm(s); if (s.length < 25 || s.length > 300) return;
        Object.keys(VOICE).forEach(function (k) {
          if (!VOICE[k].test(s)) return;
          var th = (THEMES.filter(function (t) { return t[1].test(s); })[0] || ["Other"])[0];
          var g = groups[k][th] = groups[k][th] || { theme: th, count: 0, quotes: [] };
          g.count++; if (g.quotes.length < 4 && !g.quotes.some(function (q) { return q.text === s; })) g.quotes.push({ text: clip(s, 240), url: it.url, source: it.source, evidence: it.evidence });
          used++;
        });
      });
    });
    var out = {}; Object.keys(groups).forEach(function (k) { out[k] = Object.keys(groups[k]).map(function (t) { return groups[k][t]; }).sort(function (a, b) { return b.count - a.count; }).slice(0, 5); });
    out.snippets = items.length; out.matches = used; out.setAside = total - items.length;
    out.quality = items.length >= 15 ? "HIGH" : items.length >= 5 ? "MEDIUM" : items.length ? "LOW" : "UNAVAILABLE";
    var topNeed = (out.needs[0] || {}).theme, topComplaint = (out.complaints[0] || {}).theme;
    out.marketOpportunity = topComplaint ? "Customers in this market most often complain about “" + topComplaint.toLowerCase() + "”, make it the thing you visibly do better." + (topNeed && topNeed !== topComplaint ? " They also ask about “" + topNeed.toLowerCase() + "”." : "") : topNeed ? "People searching in this market ask most about “" + topNeed.toLowerCase() + "”, answer it on your site." : "";
    return out;
  };

  /* ======================= digital presence & sampled AI visibility ======================= */
  var PLATFORMS = [["Google Maps / Business Profile", /google\.[a-z.]+\/maps|maps\.app\.goo\.gl|g\.page|business\.google/], ["Facebook", /facebook\.com/], ["Instagram", /instagram\.com/], ["LinkedIn", /linkedin\.com/], ["YouTube", /youtube\.com/], ["X / Twitter", /(twitter|x)\.com/], ["Justdial", /justdial\.com/], ["IndiaMART", /indiamart\.com/], ["Sulekha", /sulekha\.com/], ["Practo", /practo\.com/], ["Zomato", /zomato\.com/], ["Swiggy", /swiggy\.com/], ["Tripadvisor", /tripadvisor\./], ["Yelp", /yelp\./], ["Trustpilot", /trustpilot\.com/], ["Clutch", /clutch\.co/], ["G2", /g2\.com/], ["Glassdoor", /glassdoor\./], ["AmbitionBox", /ambitionbox\.com/], ["Crunchbase", /crunchbase\.com/], ["Wikipedia", /wikipedia\.org/], ["Amazon", /amazon\./], ["Flipkart", /flipkart\.com/]];
  E.presence = function (B, brandSerp, place, srcName) {
    srcName = srcName || (brandSerp && brandSerp.providerName) || "search";
    var found = {}, name = low(B.name.value), rating = [];
    var nameWords = name.split(/\s+/).filter(function (w) { return w.length > 2; }), ectx = E.entityContext(B, {});
    B.presenceOut = [];
    ((brandSerp && brandSerp.web) || []).forEach(function (r) {
      var mentions = nameWords.length && nameWords.every(function (w) { return low(r.title + " " + r.description).indexOf(w) > -1; });
      // v17.2: a listing or rating for a different company with the same name must not count as yours (own social links from the site always count)
      if (mentions && !(B.socials && Object.keys(B.socials).some(function (k) { var su = low(String(B.socials[k] || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")); return su.length > 6 && low(r.url).indexOf(su) > -1; }))) {
        var who = E.aboutUs(r.title + " " + r.description, r.url, ectx); if (!who.ok) { mentions = false; B.presenceOut.push({ url: r.url, title: r.title, why: who.why }); }
      }
      PLATFORMS.forEach(function (p) { if (p[1].test(r.url) && mentions && !found[p[0]]) found[p[0]] = { url: r.url, title: r.title, pos: r.pos }; });
      var m = /(\d(?:\.\d)?)\s*(?:\/\s*5|out of 5|stars?|★)/i.exec(r.description || ""); var rv = /([\d,]+)\s*(reviews|ratings)/i.exec(r.description || "");
      if (r.rating != null && mentions && +r.rating <= 5) rating.push({ value: +r.rating, count: r.ratingCount, url: r.url, host: r.host });
      else if (m && mentions && +m[1] <= 5) rating.push({ value: +m[1], count: rv ? +rv[1].replace(/,/g, "") : null, url: r.url, host: r.host });
    });
    ((brandSerp && brandSerp.locations) || []).forEach(function (l) { if (low(l.title).indexOf(nameWords[0] || "§") > -1 && l.rating) rating.push({ value: l.rating, count: l.reviews, url: l.url, host: "map listing (via " + srcName + ")" }); });
    var siteSocial = Object.keys(B.socials || {});
    var onSiteOnly = siteSocial.filter(function (s) { return !Object.keys(found).some(function (f) { return low(f).indexOf(s) > -1; }); });
    var phones = B.contacts.phones;
    return { listings: found, ratings: rating.slice(0, 6), excluded: (B.presenceOut || []).slice(0, 8), siteSocials: B.socials, onSiteOnly: onSiteOnly, phoneCount: phones.length, nameVariants: uniq([B.name.value, (B.schemaChecks || []).filter(function (x) { return x.field === "name"; }).map(function (x) { return x.value; })[0]].filter(Boolean)), mapListing: place || null, searched: !!brandSerp };
  };
  E.visibility = function (answers, B, comps) {
    var names = [low(B.name.value), B.domain].filter(Boolean), dom = B.domain, rows = answers.map(function (a) {
      var t = low(a.answer), aboutYou = names.some(function (n) { return n && low(a.q).indexOf(n) > -1; }), brand = !aboutYou && names.some(function (n) { return n && t.indexOf(n) > -1; });   // v17.1.3: a question that already names you ("FODO alternatives") can't prove AI knows you, not counted
      var cm = comps.filter(function (c) { return t.indexOf(low(c.name)) > -1 || t.indexOf(c.domain) > -1; }).map(function (c) { return c.name || c.domain; });
      var cites = (a.citations || []).map(function (c) { return { title: c.title, uri: c.uri, you: !!dom && low(c.title || "").indexOf(dom) > -1, comp: comps.some(function (x) { return low(c.title || "").indexOf(x.domain) > -1; }) }; });
      // "recommended" = named in the first third of the answer (where assistants put their picks); a rule, labelled INFERRED
      var first = !aboutYou && brand && names.some(function (n) { var i = t.indexOf(n); return i > -1 && i < Math.max(300, t.length / 3); });
      return { q: a.q, aboutYou: aboutYou, engine: a.engine || "workers-ai", engineName: a.engineName || "Llama on Cloudflare Workers AI", live: !!a.live, brand: brand, recommended: !!first, competitors: cm, answered: !!a.answer, excerpt: clip(a.answer, 400), model: a.model, citations: cites, citedYou: cites.some(function (c) { return c.you; }) };
    });
    var answered = rows.filter(function (r) { return r.answered; }), engines = {};
    answered.forEach(function (r) { var e = engines[r.engine] = engines[r.engine] || { id: r.engine, name: r.engineName, live: r.live, asked: 0, you: 0, comp: 0, cited: 0, withCites: 0, model: r.model }; e.asked++; if (r.brand) e.you++; if (r.competitors.length) e.comp++; if (r.citations.length) { e.withCites++; if (r.citedYou) e.cited++; } if (r.live) e.live = true; });
    return { rows: rows, tested: answered.length, brandIn: answered.filter(function (r) { return r.brand; }).length, compIn: answered.filter(function (r) { return r.competitors.length; }).length, model: (answered[0] || {}).model || "", label: "Sampled AI visibility", engines: Object.keys(engines).map(function (k) { return engines[k]; }), score: E.aiScore(answered, comps) };
  };
  /* v17 FODO AI Visibility Score (0–100): FODO's own measure, NOT an official score from ChatGPT, Google or any AI company.
     mention rate 50% + recommendation rate 20% + share of names vs competitors 20% + citations of your site 10% (when an engine gives citations) */
  E.aiScore = function (answered, comps) {
    if (!answered || answered.length < 2) return null;
    var n = answered.length, you = answered.filter(function (r) { return r.brand; }).length, rec = answered.filter(function (r) { return r.recommended; }).length;
    var compNames = answered.reduce(function (s, r) { return s + r.competitors.length; }, 0), share = you + compNames ? you / (you + compNames / Math.max(1, (comps || []).length || 1)) : 0;
    var withC = answered.filter(function (r) { return r.citations && r.citations.length; }), cite = withC.length ? withC.filter(function (r) { return r.citedYou; }).length / withC.length : null;
    var parts = [{ name: "Mentioned in answers (" + you + " of " + n + ")", score: Math.round(you / n * 100), w: 50 }, { name: "Named among the first picks (" + rec + " of " + n + ")", score: Math.round(rec / n * 100), w: 20 }, { name: "Share of names vs competitors", score: Math.round(Math.min(1, share) * 100), w: 20 }];
    if (cite != null) parts.push({ name: "Your site cited as a source (" + withC.filter(function (r) { return r.citedYou; }).length + " of " + withC.length + " cited answers)", score: Math.round(cite * 100), w: 10 });
    var W = parts.reduce(function (s, p) { return s + p.w; }, 0);
    return { score: Math.round(parts.reduce(function (s, p) { return s + p.score * p.w; }, 0) / W), parts: parts, answers: n, label: "FODO AI Visibility Score: FODO's own measure, not an official score from ChatGPT, Google or any AI company." };
  };
  /* ======================= scores ======================= */
  var groupScore = function (cs) { var w = 0, s = 0; cs.forEach(function (c) { if (c.status !== "na" && c.score != null) { w += c.weight; s += c.score * c.weight; } }); return w ? Math.round(s / w) : null; };
  E.groupScore = groupScore;
  E.scores = function (checks, mods) {
    mods = mods || {};
    var by = function (f) { return checks.filter(f); };
    var comp = function (list) { var g = {}; list.forEach(function (c) { (g[c.group] = g[c.group] || []).push(c); }); return Object.keys(g).map(function (k) { return { name: k, score: groupScore(g[k]), checks: g[k].map(function (c) { return c.id; }) }; }).filter(function (x) { return x.score != null; }); };
    var A = {};
    var web = by(function (c) { return c.area === "website"; }); A.website = { name: "Website", score: groupScore(web), components: comp(web), quality: web.some(function (c) { return /^P_/.test(c.id); }) ? "HIGH" : "MEDIUM", note: web.some(function (c) { return /^P_/.test(c.id); }) ? "" : "Speed not measured (PageSpeed unavailable)." };
    var conv = by(function (c) { return c.area === "conversion"; }); A.conversion = { name: "Conversion", score: groupScore(conv), components: comp(conv), quality: "MEDIUM", note: "From page HTML; button placement is inferred from page order, not a visual test." };
    var tr = by(function (c) { return c.area === "trust"; }); A.trust = { name: "Customer Trust", score: groupScore(tr.concat(mods.reviewCheck ? [mods.reviewCheck] : [])), components: comp(tr.concat(mods.reviewCheck ? [mods.reviewCheck] : [])), quality: mods.reviewCheck ? "MEDIUM" : "LOW", note: mods.reviewCheck ? "" : "Off-site reviews not checked (no search data)." };
    var catOk = (mods.serp || []).filter(function (s) { return s.ok && ["category", "best", "pricing", "problem", "alternatives"].indexOf(s.kind) > -1; });
    if (catOk.length >= 2) {
      var cat = catOk;
      var top10 = cat.filter(function (s) { return s.ourPos != null; }).length, top3 = cat.filter(function (s) { return s.ourPos != null && s.ourPos <= 3; }).length;
      var serpScore = cat.length ? Math.round(100 * (top10 * 0.6 + top3 * 0.4) / cat.length) : null;
      var idx = checks.filter(function (c) { return ["T_index", "T_sitemap", "T_title", "T_desc", "P_seo"].indexOf(c.id) > -1; });
      A.search = { name: "Search Visibility", score: serpScore == null ? null : Math.round(serpScore * 0.7 + (groupScore(idx) || 0) * 0.3), components: [{ name: "Found in sampled searches (" + top10 + " of " + cat.length + " in top 10)", score: serpScore }, { name: "Search readiness (indexable, sitemap, titles)", score: groupScore(idx) }], quality: "MEDIUM", note: "Sampled from " + cat.length + " searches on " + (mods.searchName || "a search provider") + "; positions are a snapshot for one country and moment, not a ranking report." };
      var brand = mods.serp.filter(function (s) { return s.kind === "brand" && s.ok; })[0], listings = mods.presence ? Object.keys(mods.presence.listings).length : 0;
      var brandPart = brand ? (brand.ourPos === 1 ? 100 : brand.ourPos ? 60 : 10) : null;
      var mk = [{ name: "Owns its brand search", score: brandPart }, { name: "Share of market searches (" + top10 + "/" + cat.length + ")", score: serpScore }, { name: "Listed on platforms (" + listings + " found)", score: Math.min(100, listings * 20) }];
      if (mods.presence && mods.presence.ratings.length) { var avg = mods.presence.ratings.reduce(function (s, r) { return s + r.value; }, 0) / mods.presence.ratings.length; mk.push({ name: "Public rating (avg " + avg.toFixed(1) + "/5 in search snippets)", score: Math.round(avg / 5 * 100) }); }
      A.market = { name: "Digital Market Presence", score: groupScore(mk.filter(function (x) { return x.score != null; }).map(function (x) { return { score: x.score, weight: 1, status: "x" }; })), components: mk.filter(function (x) { return x.score != null; }), quality: "MEDIUM", note: "From a sample of public search results." };
    } else {
      var why = !mods.serp || !mods.serp.length ? "no search provider connected" : "only " + catOk.length + " market search(es) returned results, too few to score";
      A.search = { name: "Search Visibility", score: null, components: [], quality: "UNAVAILABLE", note: "Data unavailable: " + why + "." };
      A.market = { name: "Digital Market Presence", score: null, components: [], quality: "UNAVAILABLE", note: "Data unavailable: " + why + "." };
    }
    if (mods.competitive && mods.competitive.length) {
      A.competitive = { name: "Competitive Position", score: Math.round(mods.competitive.reduce(function (s, m) { return s + m.score; }, 0) / mods.competitive.length), components: mods.competitive.map(function (m) { return { name: m.name, score: m.score }; }), quality: "MEDIUM", note: "Like-for-like comparison of public pages with " + mods.compCount + " competitor(s)." };
    } else A.competitive = { name: "Competitive Position", score: null, components: [], quality: "UNAVAILABLE", note: "Data unavailable, no competitors could be confirmed." };
    var W = { market: 15, website: 15, search: 20, trust: 15, conversion: 20, competitive: 15 }, sw = 0, ss = 0, n = 0;
    Object.keys(W).forEach(function (k) { if (A[k] && A[k].score != null) { sw += W[k]; ss += A[k].score * W[k]; n++; } });
    var overall = sw ? Math.round(ss / sw) : null;
    return { areas: A, overall: overall, basedOn: n, of: 6, status: overall == null ? "Not enough data" : overall >= 80 ? "Strong" : overall >= 60 ? "Moderate opportunity" : overall >= 40 ? "Significant opportunity" : "Critical gaps" };
  };
  E.competitiveMetrics = function (T, comps) {
    if (!comps.length) return [];
    var med = function (arr) { arr = arr.slice().sort(function (a, b) { return a - b; }); return arr[Math.floor(arr.length / 2)]; };
    var M = [["Offer clarity", function (p) { return p.offerScore; }], ["Trust signals", function (p) { return (p.testimonials ? 40 : 0) + Math.min(60, p.trust.length * 20); }], ["Pricing transparency", function (p) { return p.pricing ? 100 : 0; }], ["Objection handling (FAQ)", function (p) { return p.faq ? 100 : 0; }], ["Content (blog / resources)", function (p) { return p.blog ? 100 : 0; }], ["Search basics (title, meta, schema)", function (p) { return (p.titleOk ? 35 : 0) + (p.metaOk ? 35 : 0) + (p.schema.length ? 30 : 0); }], ["Contact ease (phone/WhatsApp)", function (p) { return (p.phone ? 50 : 0) + (p.whatsapp ? 50 : 0); }]];
    return M.map(function (m) { var t = m[1](T), c = med(comps.map(m[1])); return { name: m[0] + ", you " + t + " vs competitor median " + c, score: Math.max(0, Math.min(100, 50 + (t - c) / 2)), you: t, median: c }; });
  };

  /* ======================= opportunities ======================= */
  var TOOLS = { competitors: ["Competitor Finder", "competitor-finder/"], roi: ["ROI Calculator", "roi-calculator/"], score: ["Growth Score", "growth-score/"], seo: ["FODO SEO service", "services/seo/"], local: ["FODO Local SEO service", "services/local-seo/"], cro: ["FODO Conversion (CRO) service", "services/cro/"], web: ["FODO Web Design service", "services/web-design/"], content: ["FODO Content Marketing service", "services/content-marketing/"], copy: ["FODO Copywriting service", "services/copywriting/"], brand: ["FODO Brand Strategy service", "services/brand-strategy/"], social: ["FODO Social Media service", "services/social-media/"], landing: ["FODO Landing Pages service", "services/landing-pages/"], analytics: ["FODO Analytics service", "services/analytics/"] };
  E.TOOLS = TOOLS;
  // id → [title, category, impact 1-5, effort 1-5, urgency 1-5, fix, tool]
  var OPP = {
    T_home: ["Homepage does not load reliably", "Website", 5, 2, 5, "Fix the server/hosting error so the homepage returns HTTP 200.", "web"],
    T_https: ["Site is not secure (no HTTPS)", "Website", 5, 1, 5, "Install an SSL certificate (free with most hosts / Cloudflare) and redirect http → https.", "web"],
    T_index: ["Important pages are hidden from Google (noindex)", "Search", 5, 1, 5, "Remove the noindex tag from the listed pages and request re-indexing in Search Console.", "seo"],
    T_sitemap: ["No XML sitemap", "Search", 3, 1, 3, "Generate /sitemap.xml with every important page and add it to robots.txt and Google Search Console.", "seo"],
    T_title: ["Missing or badly sized page titles", "Search", 4, 2, 4, "Write a unique 50–60 character title per page: main service + location/benefit + brand.", "seo"],
    T_dupTitle: ["Several pages share the same title", "Search", 3, 2, 3, "Give each page its own title so Google can tell them apart.", "seo"],
    T_desc: ["Meta descriptions missing", "Search", 3, 2, 3, "Write 140–160 character descriptions with the offer and a reason to click.", "seo"],
    T_h1: ["Pages without exactly one H1", "Search", 2, 2, 2, "Use one clear H1 per page that names the service and outcome.", "seo"],
    T_canonical: ["Canonical tags missing or pointing elsewhere", "Search", 2, 2, 3, "Add a self-referencing canonical to every page; fix any that point to another domain.", "seo"],
    T_broken: ["Broken pages and links", "Website", 4, 2, 4, "Fix or redirect the error pages and update the links that point to them.", "web"],
    T_slow: ["Some pages load too slowly", "Website", 4, 3, 4, "Check hosting and caching for these pages (server response, heavy scripts, uncached database pages), they took over 15 seconds to answer.", "web"],
    T_redirects: ["Redirect chains slow pages down", "Website", 2, 2, 2, "Point links straight at the final URL; collapse chains to one hop.", "web"],
    T_schema: ["Structured data missing or broken", "Search", 3, 2, 3, "Add valid Organization/LocalBusiness (and FAQ/Product where relevant) JSON-LD.", "seo"],
    T_alt: ["Images without alt text", "Website", 1, 2, 1, "Describe key images in alt text (helps accessibility and image search).", "web"],
    T_urls: ["Messy URLs", "Search", 1, 3, 1, "Use short, lowercase, hyphenated URLs for new pages (redirect old ones only if worthwhile).", "seo"],
    T_thin: ["Thin pages with little content", "Content", 3, 3, 2, "Expand key pages to answer the buyer's questions (300–800 words, with proof and FAQs).", "content"],
    T_links: ["Pages that are hard to reach", "Search", 2, 2, 2, "Link to these pages from the menu, footer or related pages.", "seo"],
    T_viewport: ["Site may not work properly on phones", "Website", 5, 2, 5, "Add a responsive viewport meta tag and test on a phone.", "web"],
    T_mixed: ["Insecure files on secure pages", "Website", 2, 1, 2, "Load every image/script over https.", "web"],
    T_og: ["Shared links look plain", "Content", 1, 1, 1, "Add og:title, og:description and og:image so WhatsApp/LinkedIn shares show a preview.", "social"],
    P_perf: ["Slow on mobile", "Website", 4, 3, 4, "Compress images, defer heavy scripts and use caching, start with the PageSpeed issues listed.", "web"],
    P_field: ["Real visitors experience a slow site", "Website", 4, 3, 4, "Fix the largest-content and interaction delays reported by Chrome users.", "web"],
    P_seo: ["Lighthouse SEO issues", "Search", 2, 2, 2, "Fix the SEO items Lighthouse flags (links, crawlable text, tap targets).", "seo"],
    P_a11y: ["Accessibility issues", "Website", 2, 2, 2, "Fix contrast, labels and button names Lighthouse flags.", "web"],
    C_cta: ["No clear call to action at the top of the homepage", "Conversion", 5, 1, 5, "Put one specific primary button in the first screen (e.g. “Book a free consultation”), repeated after key sections.", "cro"],
    C_ctaText: ["Buttons with vague wording", "Conversion", 2, 1, 2, "Replace “Submit / Learn more” with what the visitor gets.", "copy"],
    C_nextStep: ["Service pages end without a next step", "Conversion", 4, 2, 4, "Add a CTA and short enquiry form to every service/product page.", "cro"],
    C_contact: ["Too few ways to get in touch", "Conversion", 4, 1, 4, "Show phone, WhatsApp and a short form on every page (header or footer).", "cro"],
    C_contactPage: ["Contact page hard to find", "Conversion", 3, 1, 3, "Add “Contact” to the main menu.", "web"],
    C_form: ["Enquiry form is too long", "Conversion", 3, 1, 3, "Cut the form to name, phone/email and one question; ask the rest later.", "cro"],
    C_tap: ["No one-tap call/WhatsApp for phone visitors", "Conversion", 3, 1, 3, "Add tel: and wa.me buttons (a sticky mobile bar works well).", "cro"],
    C_pricing: ["No prices or ranges shown", "Offer", 4, 2, 3, "Publish starting prices, packages or a price range to qualify leads and reduce drop-off.", "landing"],
    C_faq: ["Objections go unanswered (no FAQ)", "Conversion", 3, 2, 3, "Add an FAQ covering price, timelines, process and guarantees (with FAQ schema).", "content"],
    C_incentive: ["No reason to act now", "Offer", 2, 1, 2, "Offer a low-risk first step: free consultation, audit, sample or trial.", "cro"],
    O_audience: ["Headline doesn't say who it's for", "Offer", 4, 1, 4, "Name the audience in the hero (“for clinics in Delhi”, “for D2C brands”).", "copy"],
    O_problem: ["Headline doesn't name the problem", "Offer", 3, 1, 3, "State the problem the buyer has in their words.", "copy"],
    O_outcome: ["Headline doesn't promise an outcome", "Offer", 4, 1, 4, "Promise a concrete result (more bookings, faster delivery, lower cost).", "copy"],
    O_differentiation: ["Nothing says why you instead of others", "Positioning", 4, 2, 4, "Add one proof-backed differentiator (speed, guarantee, specialism, numbers).", "brand"],
    R_testi: ["No testimonials or reviews on the site", "Trust", 5, 2, 4, "Add 3–6 named testimonials or embed real Google reviews near the CTAs.", "cro"],
    R_ratingSchema: ["No review markup", "Trust", 1, 2, 1, "If you show genuine reviews, mark them up with Review/AggregateRating schema.", "seo"],
    R_markers: ["Few credibility signals", "Trust", 4, 2, 3, "Show years in business, certifications, client numbers or a guarantee, only true ones.", "brand"],
    R_cases: ["No case studies or portfolio", "Trust", 3, 3, 2, "Publish 2–3 short case studies: problem → what you did → result.", "content"],
    R_about: ["No about page", "Trust", 2, 2, 2, "Add an about page with the people, story and credentials.", "brand"],
    R_legal: ["No privacy policy / terms", "Trust", 2, 1, 2, "Add a privacy policy and terms (required if you collect leads).", "web"],
    R_address: ["No physical address shown", "Trust", 3, 1, 3, "Show your address (and map) in the footer and contact page.", "local"],
    R_https: ["Site is not secure", "Trust", 5, 1, 5, "Enable HTTPS.", "web"],
    S_absent: ["Not found for the searches buyers use", "Search", 5, 4, 4, "Create a dedicated page per key service (+ location) and earn local links/listings.", "seo"],
    S_brand: ["Your own name doesn't lead to your site in search", "Search", 4, 2, 4, "Claim/complete Google Business Profile and directory listings; add Organization schema with the same name.", "local"],
    D_nameClash: ["Your brand name is shared with other companies", "Presence", 4, 2, 4, "Use your full name with your category and city in titles and profiles (e.g. “FODO: Digital Growth Agency, Delhi”), add Organization schema with sameAs links to your own profiles, and keep the same name, logo and description everywhere so Google and AI assistants can tell you apart.", "seo"],
    D_listings: ["Missing from key listing platforms", "Presence", 3, 2, 3, "Claim and complete the main listings for your category with the same name, phone and address.", "local"],
    D_social: ["Social profiles not linked from the site", "Presence", 1, 1, 1, "Link your active social profiles in the footer.", "social"],
    K_gap: ["Competitors appear for commercial searches you don't", "Search", 4, 3, 4, "Build pages that match these searches, starting with the High-opportunity ones.", "seo"],
    M_compGap: ["Competitors are ahead on visible basics", "Competitive", 4, 2, 3, "Close the listed gaps first, they are what buyers compare.", "competitors"],
    M_sameMessage: ["You say the same thing as competitors", "Positioning", 4, 3, 3, "Rewrite the hero around a claim competitors don't make (see white space).", "brand"],
    W_blocked: ["Your website turns away automated visitors", "Website", 3, 2, 3, "Check your firewall / bot protection: Google, Bing and AI assistants (Googlebot, Bingbot, GPTBot, ClaudeBot, PerplexityBot) must be able to read your pages, and real visitors on slow networks should never see an error page. Then run the X-Ray again for the full page checks.", "web"],
    X_extBroken: ["Links to other websites are broken", "Website", 2, 1, 2, "Update or remove the outgoing links listed, broken links lose visitors and look neglected.", "web"],
    G_contentGap: ["Competitors cover topics you don't", "Content", 3, 3, 3, "Add a page or section for the topics most competitors cover (only those you really offer), starting with the ones most of them share.", "seo"],
    V_complaint: ["Customers' top complaint in your market is unaddressed", "Market", 4, 2, 3, "Address the top complaint on your homepage and in your offer (with proof).", "brand"],
    L_noListing: ["Not found on Google Maps for your own name", "Presence", 4, 2, 4, "Create or claim your Google Business Profile with the same name, phone and address as your website.", "local"],
    L_weak: ["Fewer or weaker Google reviews than local competitors", "Trust", 4, 3, 3, "Ask every happy customer for a Google review (a QR/WhatsApp link after each job) and reply to every review.", "local"],
    A_invisible: ["AI assistants don't name you when buyers ask", "Presence", 3, 3, 3, "Get listed and reviewed where AI tools read (Google Business Profile, directories, comparison articles), keep your name/address consistent, and publish clear answer pages for the questions buyers ask.", "seo"],
  };
  E.OPP = OPP;
  // v20.2: the copy examples in a fix match the business's industry (a travel company is not told "for clinics in Delhi")
  var EXAMPLES = {
    restaurant: ["for office lunches in Dwarka", "fresh food at your door in 30 minutes"], clinic: ["for families in South Delhi", "same-day appointments, no long waits"],
    saas: ["for finance teams at growing companies", "close your books in half the time"], ecommerce: ["for new mothers who want chemical-free care", "free delivery in 2 days"],
    agency: ["for D2C brands selling online", "more leads at a lower cost per lead"], realestate: ["for first-time buyers in Gurugram", "RERA-approved homes, possession in 2027"],
    education: ["for Class 11–12 JEE aspirants", "board + JEE prep in one plan"], travel: ["for HR and admin teams booking company travel", "one desk for flights, hotels and visas with 24×7 support"],
    beauty: ["for brides in West Delhi", "salon-finish results at home"], fitness: ["for working professionals who have 45 minutes", "visible results in 12 weeks"],
    legal: ["for startups raising their first round", "contracts reviewed in 48 hours"], finance: ["for salaried families planning taxes", "save tax without the paperwork"],
    manufacturing: ["for OEMs who need certified parts on time", "dispatch in 7 days, ISO-certified"], hospitality: ["for families on a weekend break", "pool-view rooms, breakfast included"],
    itservices: ["for SMEs moving to the cloud", "launch in 6 weeks at a fixed price"] };
  E.opportunities = function (checks, extra, ev, ctx) {
    var list = [], n = 0, ex = EXAMPLES[ctx && ctx.industryId] || null;
    var fixFor = function (key, t) { if (!ex) return t[5]; if (key === "O_audience") return "Name the audience in the hero (e.g. “" + ex[0] + "”)."; if (key === "O_outcome") return "Promise a concrete result (e.g. “" + ex[1] + "”)."; return t[5]; };
    var mk = function (key, o) {
      var t = OPP[key]; if (!t) return;
      var conf = o.confidence != null ? o.confidence : LABEL_CONF[o.label || "OBSERVED"];
      var impact = o.impact || t[2], effort = t[3], urgency = t[4];
      var raw = impact * conf * urgency / effort, score = Math.round(100 * raw / 25);
      var pr = impact >= 4 && effort <= 3 && urgency >= 4 ? "P0" : impact >= 4 ? "P1" : impact === 3 ? "P2" : "P3";
      list.push({ id: "O" + (++n), key: key, title: t[0], category: t[1], description: o.detail || "", evidence: (o.evidence || []).slice(0, 8), source: uniq((o.evidence || []).map(function (id) { var x = ev.get(id); return x ? x.sourceName : ""; }).filter(Boolean)),
        impact: impact, effort: effort, urgency: urgency, confidence: Math.round(conf * 100) / 100, priorityScore: Math.min(100, score), priority: pr, recommendation: o.fix || fixFor(key, t), affectedPages: (o.pages || []).slice(0, 10), estimatedValue: null, estimatedValueConfidence: "UNKNOWN", tool: TOOLS[t[6]] || null, label: o.label || "OBSERVED" });
    };
    checks.forEach(function (c) { if (c.status === "fail" || (c.status === "warn" && (c.weight >= 2 || c.score < 50))) { var key = /^R_schemaMismatch/.test(c.id) || c.id === "R_https" || (c.id === "T_index" && c.status === "warn") ? null : c.id; if (key && OPP[key]) mk(key, { detail: c.detail, evidence: c.evidence, pages: c.pages, label: c.label, impact: c.status === "warn" ? Math.max(1, OPP[key][2] - 1) : null }); } });
    (extra || []).forEach(function (x) { mk(x.key, x); });
    list.sort(function (a, b) { return a.priority.localeCompare(b.priority) || b.priorityScore - a.priorityScore || b.impact - a.impact; });   // P0 first, then score
    list.forEach(function (o, i) { o.rank = i + 1; });
    return list;
  };
  E.pickTop = function (opps) {
    var fixes = opps.filter(function (o) { return o.effort <= 2; }).slice(0, 3);
    var growth = opps.filter(function (o) { return ["Search", "Content", "Presence", "Market", "Competitive"].indexOf(o.category) > -1 && fixes.indexOf(o) < 0; }).slice(0, 5);
    var strategic = opps.filter(function (o) { return (["Positioning", "Offer", "Market", "Competitive"].indexOf(o.category) > -1 || o.effort >= 3) && fixes.indexOf(o) < 0 && growth.indexOf(o) < 0; }).slice(0, 5);
    return { immediate: fixes, growth: growth, strategic: strategic, top5: opps.slice(0, 5) };
  };
  E.plan = function (opps) {
    var used = {}, take = function (f, n) { var o = opps.filter(function (x) { return !used[x.id] && f(x); }).slice(0, n); o.forEach(function (x) { used[x.id] = 1; }); return o; };
    var weeks = [
      { label: "DAY 1-7", focus: "Quick fixes that stop leaks", items: take(function (o) { return o.effort <= 2 && o.impact >= 3; }, 4) },
      { label: "DAY 8-14", focus: "Conversion & trust", items: take(function (o) { return ["Conversion", "Trust", "Offer"].indexOf(o.category) > -1; }, 4) },
      { label: "DAY 15-21", focus: "Search & content", items: take(function (o) { return ["Search", "Content", "Website"].indexOf(o.category) > -1; }, 4) },
      { label: "DAY 22-30", focus: "Positioning, presence & competition", items: take(function () { return true; }, 4) },
    ];
    weeks.forEach(function (w) { w.items = w.items.map(function (o) { return { opportunity: o.id, problem: o.title, action: o.recommendation, expectedImpact: o.impact >= 4 ? "High" : o.impact === 3 ? "Medium" : "Low", evidence: o.evidence, tool: o.tool }; }); });
    return weeks;
  };
  /* ---------- v13: technology stack, read from the page code and response headers (OBSERVED; "not detected" ≠ "not used") ---------- */
  var TECH = [
    ["CMS / site builder", [["WordPress", /\/wp-content\/|\/wp-includes\/|<meta[^>]+generator[^>]+wordpress/i], ["WooCommerce", /woocommerce/i], ["Elementor", /elementor-/i], ["Divi", /et_pb_|\/Divi\//], ["Shopify", /cdn\.shopify\.com|Shopify\.theme|x-shopify/i], ["Wix", /static\.wixstatic\.com|x-wix-request-id|wix-bolt/i], ["Squarespace", /static1\.squarespace\.com|squarespace-cdn/i], ["Webflow", /data-wf-page|webflow\.js|assets\.website-files\.com/i], ["Framer", /framerusercontent\.com|data-framer-/i], ["Drupal", /Drupal\.settings|\/sites\/default\/files\//], ["Joomla", /\/media\/jui\/|<meta[^>]+generator[^>]+joomla/i], ["Magento", /Magento_|mage\/cookies/], ["Ghost", /<meta[^>]+generator[^>]+ghost/i], ["Hostinger Website Builder", /zyrosite\.com|zyro\.com/i], ["GoDaddy Website Builder", /img1\.wsimg\.com|godaddy-website-builder/i], ["Blogger", /blogger\.com\/static|\.blogspot\.com/i], ["HubSpot CMS", /hs-sites\.com|hubspot-cms/i], ["Zoho Sites", /zohosites|sites\.zoho/i]]],
    ["Framework", [["Next.js", /__NEXT_DATA__|\/_next\/static\//], ["Nuxt", /__NUXT__|\/_nuxt\//], ["Gatsby", /___gatsby/], ["Angular", /ng-version=/], ["React", /data-reactroot|react-dom(\.production)?\.min\.js/], ["Vue", /data-v-[0-9a-f]{6,}|vue(\.runtime)?(\.global)?(\.prod)?\.js/], ["Astro", /astro-island|data-astro-/], ["Tailwind CSS", /tailwind(css)?[.-]/i], ["Bootstrap", /bootstrap(\.min)?\.(css|js)/i], ["jQuery", /jquery(-\d[\d.]*)?(\.min)?\.js/i]]],
    ["Analytics", [["Google Analytics 4", /gtag\/js\?id=G-|['"]G-[A-Z0-9]{6,}['"]/], ["Google Analytics (Universal)", /['"]UA-\d{4,}-\d+['"]|google-analytics\.com\/analytics\.js/], ["Google Tag Manager", /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/], ["Microsoft Clarity", /clarity\.ms\/tag/], ["Hotjar", /static\.hotjar\.com|hotjar\.com\/c\/hotjar/], ["Mixpanel", /cdn\.mxpnl\.com|mixpanel\.init/], ["Segment", /cdn\.segment\.com/], ["Plausible", /plausible\.io\/js/], ["Matomo", /matomo\.js|piwik\.js/], ["Yandex Metrica", /mc\.yandex\.ru/]]],
    ["Ad pixels", [["Meta (Facebook) Pixel", /connect\.facebook\.net\/[^"']*fbevents|fbq\(\s*['"]init/], ["Google Ads tag", /googleadservices\.com|['"]AW-\d{6,}['"]/], ["LinkedIn Insight Tag", /snap\.licdn\.com|_linkedin_partner_id/], ["TikTok Pixel", /analytics\.tiktok\.com/], ["X (Twitter) Pixel", /static\.ads-twitter\.com|twq\(/], ["Pinterest Tag", /pintrk\(|s\.pinimg\.com\/ct\//], ["Snap Pixel", /sc-static\.net\/scevent/], ["Microsoft Ads UET", /bat\.bing\.com/]]],
    ["Chat & CRM", [["WhatsApp chat link", /wa\.me\/|api\.whatsapp\.com\/send/], ["HubSpot", /js\.hs-scripts\.com|js\.hsforms\.net|hs-analytics/], ["Intercom", /widget\.intercom\.io|intercomSettings/], ["Tawk.to", /embed\.tawk\.to/], ["Crisp", /client\.crisp\.chat/], ["Zendesk", /static\.zdassets\.com|zopim/], ["Freshworks", /wchat\.freshchat\.com|freshworks\.com\/widget|fw-cdn\.com/], ["Tidio", /code\.tidio\.co/], ["LiveChat", /cdn\.livechatinc\.com/], ["Drift", /js\.driftt\.com/], ["Zoho SalesIQ", /salesiq\.zoho/], ["WATI / Interakt / Gallabox", /wati\.io|interakt\.(ai|shop)|gallabox/i], ["Calendly", /assets\.calendly\.com|calendly\.com\//]]],
    ["Payments", [["Razorpay", /checkout\.razorpay\.com|razorpay\.com\/payment-button/], ["Cashfree", /sdk\.cashfree\.com|payments\.cashfree\.com/], ["PayU", /payu\.in|payumoney/i], ["Stripe", /js\.stripe\.com/], ["PayPal", /paypal\.com\/sdk\/js|paypalobjects\.com/], ["Instamojo", /instamojo\.com/], ["PhonePe", /mercury\.phonepe\.com|phonepe\.com\/pg/]]],
    ["Hosting / CDN", [["Cloudflare", /^cf-ray:|^server: ?cloudflare/im], ["Vercel", /^x-vercel-id:|^server: ?vercel/im], ["Netlify", /^x-nf-request-id:|^server: ?netlify/im], ["Amazon CloudFront", /^x-amz-cf-id:/im], ["Fastly", /^x-served-by: ?cache-|fastly/im], ["Akamai", /akamai/im], ["Hostinger", /^server: ?hcdn|^x-powered-by:.*hostinger|^platform: ?hostinger/im], ["LiteSpeed server", /^server: ?litespeed/im], ["Nginx", /^server: ?nginx/im], ["Apache", /^server: ?apache/im]]],
    ["Other", [["Google Fonts", /fonts\.googleapis\.com/], ["Font Awesome", /font-?awesome/i], ["reCAPTCHA", /google\.com\/recaptcha|grecaptcha/], ["Cookie consent (Cookiebot / OneTrust)", /consent\.cookiebot\.com|cdn\.cookielaw\.org|onetrust/i], ["Schema.org data", /application\/ld\+json/], ["Google Maps embed", /google\.com\/maps\/embed|maps\.googleapis\.com/], ["YouTube embed", /youtube\.com\/embed|youtube-nocookie\.com/], ["Mailchimp", /list-manage\.com|chimpstatic\.com/]]],
  ];
  E.techStack = function (html, headers) {
    var code = String(html || "").slice(0, 3e6), hd = Object.keys(headers || {}).map(function (k) { return k + ": " + headers[k]; }).join("\n"), out = [];
    var gen = (/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']{2,60})/i.exec(code) || [])[1];
    TECH.forEach(function (g) { g[1].forEach(function (t) { var re = t[1], hit = g[0] === "Hosting / CDN" ? re.test(hd) : re.test(code) || (/x-shopify|x-wix/.test(re.source) && re.test(hd)); if (hit) out.push({ cat: g[0], name: t[0] }); }); });
    if (gen && !out.some(function (x) { return low(gen).indexOf(low(x.name).split(" ")[0]) > -1; })) out.push({ cat: "CMS / site builder", name: "Generator tag: " + clip(gen, 50) });
    return out;
  };
  E.TECH_CATS = TECH.map(function (g) { return g[0]; });
  /* ---------- v13: content gap, topics (from competitors' titles, headings and menus) that most competitors cover and your pages never mention ---------- */
  var GENERIC = /^(home|contact|about|menu|login|log|sign|cart|privacy|policy|terms|cookie|cookies|blog|read|more|learn|click|shop|account|search|page|new|get|free|best|view|all|our|your|us|we|com|www|https|http|india|delhi|call|email|book|now|today|best|top|services|service|solutions|company|team|careers|faq|faqs|help|support|news|offers|offer|online|app|download|year|years|work|why|how|what|who|where)$/;
  E.contentGap = function (ourText, comps) {
    comps = (comps || []).filter(function (c) { return c && c.profile; }); if (comps.length < 2) return { topics: [], compared: comps.length };
    var own = " " + low(ourText || "").replace(/[^a-z0-9ऀ-ॿ\s]/g, " ").replace(/\s+/g, " ") + " ", seen = {};
    var brandBits = {}; comps.forEach(function (c) { [c.domain.split(".")[0]].concat(low(c.name).split(/\s+/)).forEach(function (w) { if (w) brandBits[w] = 1; }); });
    comps.forEach(function (c) { var t = (c.profile.terms || []).concat((c.profile.bigrams || []).slice(0, 40)); uniq(t).forEach(function (x) { (seen[x] = seen[x] || []).push(c); }); });
    var need = Math.max(2, Math.ceil(comps.length / 3));
    var topics = Object.keys(seen).filter(function (x) { var w = x.split(" "); return seen[x].length >= need && !w.some(function (y) { return GENERIC.test(y) || brandBits[y] || y.length < 3; }) && own.indexOf(" " + x + " ") < 0 && !(w.length === 1 && own.indexOf(" " + x) > -1); })
      .sort(function (a, b) { return seen[b].length - seen[a].length || b.split(" ").length - a.split(" ").length; });
    var keep = []; topics.forEach(function (x) { if (keep.length < 12 && !keep.some(function (k) { return k.topic.indexOf(x) > -1 || x.indexOf(k.topic) > -1; })) keep.push({ topic: x, count: seen[x].length, of: comps.length, competitors: seen[x].map(function (c) { return c.domain; }), evidence: [].concat.apply([], seen[x].map(function (c) { return (c.evidence || []).slice(0, 1); })) }); });
    return { topics: keep, compared: comps.length };
  };
  /* ---------- v14 Growth: search share of voice, position-weighted share of the first page across your market searches (INFERRED) ---------- */
  var POSW = function (p) { return p === 1 ? 30 : p === 2 ? 16 : p === 3 ? 11 : p <= 5 ? 6 : p <= 10 ? 3 : 0; };
  E.shareOfVoice = function (serpA, target, comps) {
    var list = (serpA || []).filter(function (s) { return s.ok && s.kind !== "brand" && s.kind !== "voice"; }); if (!list.length) return null;
    var pts = {}, add = function (d, p) { pts[d] = (pts[d] || 0) + POSW(p); };
    list.forEach(function (s) { if (s.ourPos) add(target, s.ourPos); s.competitors.forEach(function (c) { add(c.domain, c.pos); }); });
    var named = {}; (comps || []).forEach(function (c) { named[c.domain] = c.name; });
    var total = Object.keys(pts).reduce(function (a, k) { return a + pts[k]; }, 0) || 1;
    var rows = Object.keys(pts).map(function (d) { return { domain: d, name: d === target ? "You" : named[d] || d, you: d === target, share: Math.round(1000 * pts[d] / total) / 10, appearances: list.filter(function (s) { return d === target ? s.ourPos : s.competitors.some(function (c) { return c.domain === d; }); }).length }; })
      .sort(function (a, b) { return b.share - a.share; });
    if (!rows.some(function (r) { return r.you; })) rows.push({ domain: target, name: "You", you: true, share: 0, appearances: 0 });
    return { searches: list.length, rows: rows.filter(function (r, i) { return i < 8 || r.you; }) };
  };
  /* ---------- v14 Growth: keyword → page map, the page of yours that best matches each search, or "create a page" (INFERRED) ---------- */
  E.keywordMap = function (kw, pages) {
    pages = (pages || []).filter(function (p) { return !p.error && !(p.status >= 400) && p.title !== undefined; }); if (!pages.length || !(kw || []).length) return [];
    return kw.map(function (k) {
      var t = low(k.keyword).replace(/["']/g, "").split(/\s+/).filter(function (w) { return w.length > 2 && !STOPW.test(w) && !/^(best|price|pricing|reviews?|near|how|choose|trends|alternatives|20\d\d)$/.test(w); });
      var best = null, bs = 0;
      pages.forEach(function (p) { var head = low([p.title, (p.h1 || []).join(" "), p.metaDescription].join(" ")), body = low((p.text || "").slice(0, 8000));
        var sc = t.reduce(function (a, w) { return a + (head.indexOf(w) > -1 ? 2 : body.indexOf(w) > -1 ? 0.5 : 0); }, 0) / Math.max(1, t.length * 2); if (sc > bs) { bs = sc; best = p; } });
      var fit = bs >= 0.75 ? "Strong" : bs >= 0.4 ? "Weak" : "None";
      return { keyword: k.keyword, intent: k.intent, ourPos: k.ourPos, page: fit === "None" ? null : best.finalUrl, pageTitle: fit === "None" ? "" : best.title, fit: fit,
        action: fit === "Strong" ? (k.ourPos ? "Keep improving this page" : "This page fits, strengthen its title, H1 and internal links") : fit === "Weak" ? "Rewrite this page's title and H1 around the search, or add a section" : "Create a dedicated page for this search" };
    });
  };
  /* ---------- v14 Pro: tracking & ads readiness, from the tech stack of you and every competitor (OBSERVED) ---------- */
  E.trackingAudit = function (mine, compTech, html) {
    var has = function (list, re) { return (list || []).some(function (t) { return re.test(t.name); }); }, code = String(html || "");
    var C = Object.keys(compTech || {}), n = function (re) { return C.filter(function (d) { return has(compTech[d], re); }).length; };
    var rows = [
      ["Analytics (GA4, Clarity, Hotjar…)", /Analytics 4|Universal|Clarity|Hotjar|Mixpanel|Plausible|Matomo|Segment|Yandex/, "Without analytics you can't see which pages or ads bring customers."],
      ["Google Tag Manager", /Tag Manager/, "Lets you add and change tracking without touching the site code."],
      ["Meta (Facebook/Instagram) Pixel", /Meta \(Facebook\) Pixel/, "Needed to retarget visitors and to measure Meta ad conversions."],
      ["Google Ads tag", /Google Ads tag/, "Needed to measure and optimise Google Ads conversions."],
      ["LinkedIn Insight Tag", /LinkedIn Insight/, "B2B retargeting and conversion tracking on LinkedIn."],
      ["Chat / WhatsApp on the site", /WhatsApp|Intercom|Tawk|Crisp|Zendesk|Freshworks|Tidio|LiveChat|Drift|SalesIQ|WATI/, "Visitors with questions can reach you before they leave."],
      ["Cookie consent", /Cookie consent/, "Needed in many markets before ad pixels may load."],
    ].map(function (r) { return { item: r[0], you: has(mine, r[1]), competitors: n(r[1]), of: C.length, why: r[2] }; });
    // v17.2: "not in the page HTML" is not the same as "not installed". Tags can sit inside Tag Manager, load after cookie
    // consent, or come from the site's own scripts, in those cases the honest answer is UNKNOWN, with the reason.
    var gtm = has(mine, /Tag Manager/), ownJs = (code.match(/<script[^>]+src=["'][^"']*(analytics|track|consent|cookie|gdpr|privacy)[^"']*["']/gi) || []).map(function (t) { return (/src=["']([^"']+)/i.exec(t) || [])[1] || ""; }).filter(function (u) { return u && !/^(https?:)?\/\//i.test(u); });   // the site's own (relative) scripts only
    rows.forEach(function (r) {
      r.how = r.you ? "Found in the page code" : "Not found in the page code";
      if (r.you !== false) return;
      if (gtm && /Analytics|Pixel|Ads tag|LinkedIn/.test(r.item)) { r.you = null; r.how = "Not in the page code, but Google Tag Manager is, it may be set up inside GTM"; }
      else if (ownJs.length && /Analytics|Cookie consent/.test(r.item)) { r.you = null; r.how = "The site loads its own script (" + ownJs[0].split("?")[0].split("/").pop() + ") that may do this, can't tell from outside"; }
    });
    rows.push({ item: "Google Search Console verified", you: /google-site-verification/i.test(code) ? true : null, competitors: null, of: C.length, why: "Shows which searches you appear for. (Verified by DNS is invisible to us, check your account if this says unknown.)" });
    var gaps = rows.filter(function (r) { return r.you === false && r.competitors > 0; }).map(function (r) { return r.item + ": " + r.competitors + " of " + r.of + " competitors use it"; });
    return { rows: rows, gaps: gaps };
  };
  /* ---------- v14 Pro: ready-to-paste JSON-LD built only from details found on the site (nothing invented) ---------- */
  E.schemaCode = function (B, input) {
    var url = "https://" + B.domain + "/", o = { "@context": "https://schema.org", "@type": B.local ? "LocalBusiness" : "Organization", name: B.name.value, url: url };
    if (B.description && B.description.value) o.description = clip(B.description.value, 250);
    if (B.contacts.phones[0]) o.telephone = B.contacts.phones[0];
    if (B.contacts.emails[0]) o.email = B.contacts.emails[0];
    if (B.contacts.address) o.address = { "@type": "PostalAddress", streetAddress: clip(B.contacts.address, 160), addressCountry: (input && input.country) || undefined };
    var so = Object.keys(B.socials || {}).map(function (k) { return B.socials[k]; }); if (so.length) o.sameAs = so;
    if (B.services && B.services.value && B.services.value.length) o.makesOffer = B.services.value.slice(0, 6).map(function (x) { return { "@type": "Offer", itemOffered: { "@type": "Service", name: x } }; });
    var site = { "@context": "https://schema.org", "@type": "WebSite", name: B.name.value, url: url };
    var missing = ["telephone", "email", "address", "sameAs"].filter(function (k) { return !o[k]; });
    return { code: '<script type="application/ld+json">\n' + JSON.stringify(o, null, 2) + "\n</script>\n" + '<script type="application/ld+json">\n' + JSON.stringify(site, null, 2) + "\n</script>", type: o["@type"], missing: missing, existing: B.schemaTypes || [] };
  };
  /* ---------- v14 Pro: competitor ad libraries, public, official transparency pages (opening them shows their live ads) ---------- */
  var CC = { India: "IN", "United States": "US", "United Kingdom": "GB", UAE: "AE", Canada: "CA", Australia: "AU", Singapore: "SG", "Saudi Arabia": "SA", Qatar: "QA", Germany: "DE", France: "FR", "New Zealand": "NZ", "South Africa": "ZA" };
  E.adLinks = function (comps, country) {
    var cc = CC[country] || "ALL";
    return (comps || []).map(function (c) { return { name: c.name, domain: c.domain,
      meta: "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=" + cc + "&q=" + encodeURIComponent(c.name) + "&search_type=keyword_unordered",
      google: "https://adstransparency.google.com/?region=" + (cc === "ALL" ? "anywhere" : cc) + "&domain=" + encodeURIComponent(c.domain),
      linkedin: "https://www.linkedin.com/ad-library/search?companyName=" + encodeURIComponent(c.name) }; });
  };
  /* ======================= v17 ======================= */
  /* Local visibility (Google Maps results via Serper): your listing vs the local competitors in the same results */
  E.local = function (brandItems, marketItems, B, comps) {
    var nm = low(B.name.value), words = nm.split(/\s+/).filter(function (w) { return w.length > 2; }), dom = B.domain;
    var isMe = function (p) { var w = p.website ? E.domainOf(/^https?:/.test(p.website) ? p.website : "https://" + p.website) : ""; return (dom && w === dom) || (words.length && words.every(function (x) { return low(p.name).indexOf(x) > -1; })); };
    var me = (brandItems || []).filter(isMe)[0] || (marketItems || []).filter(isMe)[0] || null;
    var others = (marketItems || []).filter(function (p) { return !isMe(p) && p.rating != null; }).slice(0, 10);
    var med = function (a) { a = a.slice().sort(function (x, y) { return x - y; }); return a.length ? a[Math.floor(a.length / 2)] : null; };
    var medRating = med(others.map(function (p) { return p.rating; })), medReviews = med(others.map(function (p) { return p.reviews || 0; }));
    var myPos = me ? (marketItems || []).indexOf(me) : -1;
    return { me: me, inMarketResults: myPos > -1 ? myPos + 1 : null, competitors: others, medianRating: medRating, medianReviews: medReviews, compared: others.length,
      behindOnRating: !!(me && me.rating != null && medRating != null && me.rating < medRating - 0.15), behindOnReviews: !!(me && medReviews != null && (me.reviews || 0) < medReviews * 0.6) };
  };
  /* Conversion funnel (prompt §32): each stage = the weighted checks that show it on the pages. Lead/customer need your own analytics. */
  E.funnel = function (checks, offerScore) {
    var G = { understanding: ["Offer clarity"], trust: ["Credibility", "Social proof", "Consistency", "Off-site reviews"], interest: ["Pricing clarity", "Objection handling"], action: ["CTA clarity", "Contact friction"] };
    var st = function (k, extra) { var cs = checks.filter(function (c) { return (c.area === "conversion" || c.area === "trust") && G[k].indexOf(c.group) > -1; }).concat(extra || []); var s = groupScore(cs); return { key: k, score: s, checks: cs.map(function (c) { return c.id; }) }; };
    var und = st("understanding", offerScore != null ? [{ id: "offer", score: offerScore, weight: 2, status: "x" }] : []);
    return [{ name: "Understanding", note: "Does the visitor get what you do and for whom?", s: und }, { name: "Trust", note: "Proof they can believe you", s: st("trust") }, { name: "Interest", note: "Prices, answers to objections", s: st("interest") }, { name: "Action", note: "Clear next step, easy contact", s: st("action") },
      { name: "Lead", note: "Data unavailable, needs your form/CRM data", s: { score: null, checks: [] } }, { name: "Customer", note: "Data unavailable, needs your sales data", s: { score: null, checks: [] } }].map(function (x) { return { name: x.name, note: x.note, score: x.s.score, checks: x.s.checks }; });
  };
  /* Revenue Leak Finder (prompt §31): opportunities that lose enquiries, never a rupee figure without the business's own data */
  E.leaks = function (opps) {
    return opps.filter(function (o) { return ["Conversion", "Offer", "Trust"].indexOf(o.category) > -1 || ["P_perf", "P_field", "T_viewport", "T_home", "T_broken", "T_slow"].indexOf(o.key) > -1; }).slice(0, 12)
      .map(function (o) { return { id: o.id, key: o.key, leak: o.title, evidence: o.evidence, detail: o.description, impact: o.impact >= 4 ? "High" : o.impact === 3 ? "Medium" : "Low", confidence: o.confidence >= 0.8 ? "High" : o.confidence >= 0.6 ? "Medium" : "Low", effort: o.effort <= 2 ? "Low" : o.effort === 3 ? "Medium" : "High", fix: o.recommendation, label: o.label }; });
  };
  /* Priority matrix (prompt §90) */
  E.matrix4 = function (opps) {
    var q = { quick: [], big: [], small: [], later: [] };
    opps.forEach(function (o) { var hi = o.impact >= 4, easy = o.effort <= 2; q[hi && easy ? "quick" : hi ? "big" : easy ? "small" : "later"].push({ id: o.id, title: o.title, impact: o.impact, effort: o.effort, priority: o.priority }); });
    return q;
  };
  /* 90-day roadmap without AI (prompt §45): month 1 foundation, month 2 acquisition, month 3 optimisation, from the real findings */
  var KPI = { Website: "Mobile PageSpeed score and error pages (PageSpeed / Search Console)", Search: "Impressions and clicks for the target searches (Search Console)", Content: "Pages published and their impressions", Conversion: "Enquiries per 100 visits (your analytics)", Trust: "Number of reviews and testimonials", Offer: "Enquiry rate on the pages you changed", Positioning: "Enquiries mentioning the new message", Presence: "Listings completed and profile views", Competitive: "Gaps closed vs the competitor median (next X-Ray)", Market: "Share of top-10 results in your market searches (next X-Ray)" };
  E.plan90 = function (opps) {
    var used = {}, take = function (f, n) { var o = opps.filter(function (x) { return !used[x.id] && f(x); }).slice(0, n); o.forEach(function (x) { used[x.id] = 1; }); return o; };
    var m1 = take(function (o) { return o.effort <= 2 || ["Website"].indexOf(o.category) > -1 || o.priority === "P0"; }, 6),
      m2 = take(function (o) { return ["Search", "Content", "Presence", "Market"].indexOf(o.category) > -1; }, 6),
      m3 = take(function () { return true; }, 6);
    var row = function (o, dep) { return { opportunity: o.id, key: o.key, task: o.recommendation, problem: o.title, priority: o.priority, kpi: KPI[o.category] || "Next X-Ray score for this area", dependsOn: dep || null, evidence: o.evidence }; };
    var first = m1[0] ? m1[0].id : null;
    return [{ month: 1, name: "Foundation", goal: "Fix what stops visitors and Google today", items: m1.map(function (o) { return row(o); }) },
      { month: 2, name: "Acquisition", goal: "Get found for the searches and places buyers use", items: m2.map(function (o) { return row(o, first); }) },
      { month: 3, name: "Optimisation", goal: "Sharpen offer, proof and positioning; re-run the X-Ray to measure", items: m3.map(function (o) { return row(o); }) }];
  };
  /* Why are they winning? (prompt §34), one competitor vs you, area by area, from both websites */
  var WW = [["Offer clarity", function (p) { return p.offerScore || 0; }, "C_cta O_audience O_outcome O_problem"], ["Trust & proof", function (p) { return (p.testimonials ? 40 : 0) + Math.min(60, (p.trust || []).length * 20); }, "R_testi R_markers R_cases"], ["Pricing shown", function (p) { return p.pricing ? 100 : 0; }, "C_pricing"],
    ["Objection handling (FAQ)", function (p) { return p.faq ? 100 : 0; }, "C_faq"], ["Content (blog / resources)", function (p) { return p.blog ? 100 : 0; }, "T_thin G_contentGap"], ["Search basics", function (p) { return (p.titleOk ? 35 : 0) + (p.metaOk ? 35 : 0) + ((p.schema || []).length ? 30 : 0); }, "T_title T_desc T_schema"], ["Contact ease", function (p) { return (p.phone ? 50 : 0) + (p.whatsapp ? 50 : 0); }, "C_contact C_tap"]];
  E.whyWinning = function (T, comp, opps, serps) {
    if (!T || !comp || !comp.profile) return null;
    var areas = WW.map(function (w) { var a = w[1](T), b = w[1](comp.profile); return { area: w[0], you: a, them: b, theyWin: b > a, keys: w[2].split(" ") }; });
    var wins = areas.filter(function (a) { return a.theyWin; });
    var both = (serps || []).filter(function (s) { return s.ok && s.competitors.some(function (c) { return c.domain === comp.domain; }); }), ahead = both.filter(function (s) { var c = s.competitors.filter(function (x) { return x.domain === comp.domain; })[0]; return c && (s.ourPos == null || c.pos < s.ourPos); });
    if (ahead.length) wins.push({ area: "Search", you: null, them: null, theyWin: true, keys: ["S_absent", "K_gap", "S_brand"], note: "Ahead of you in " + ahead.length + " of " + both.length + " searches where they appear" });
    var match = function (keys) { return opps.filter(function (o) { return keys.indexOf(o.key) > -1; }); }, rel = [], seen = {};
    wins.forEach(function (w) { match(w.keys).forEach(function (o) { if (!seen[o.id]) { seen[o.id] = 1; rel.push(o); } }); });
    var act = function (o) { return { id: o.id, key: o.key, title: o.title, fix: o.recommendation, evidence: o.evidence }; };
    return { domain: comp.domain, name: comp.name, areas: areas, wins: wins, youWin: areas.filter(function (a) { return a.you > a.them; }).map(function (a) { return a.area; }), searchAhead: ahead.map(function (s) { return s.q; }),
      immediate: rel.filter(function (o) { return o.effort <= 2; }).slice(0, 4).map(act), d30: rel.filter(function (o) { return o.effort === 3; }).slice(0, 4).map(act), d90: rel.filter(function (o) { return o.effort >= 4 || ["Search", "Content", "Positioning"].indexOf(o.category) > -1 && o.effort >= 3; }).slice(0, 4).map(act), evidence: comp.evidence };
  };
  /* Search Console CTR quick wins (rule: position 2–20, enough impressions, CTR well below the usual CTR for that position) */
  var EXP_CTR = function (pos) { return pos <= 1.5 ? 28 : pos <= 2.5 ? 15 : pos <= 3.5 ? 10 : pos <= 5 ? 7 : pos <= 7 ? 4.5 : pos <= 10 ? 2.5 : pos <= 15 ? 1.2 : 0.8; };
  E.ctrOpps = function (g) {
    if (!g || !g.ok) return [];
    var minImp = Math.max(30, Math.round((g.totals.impressions || 0) / 400));
    return (g.queries || []).filter(function (q) { return q.position >= 1.5 && q.position <= 20 && q.impressions >= minImp && q.ctr < EXP_CTR(q.position) * 0.6; })
      .map(function (q) { var e = EXP_CTR(q.position); return { query: q.key, impressions: q.impressions, clicks: q.clicks, ctr: q.ctr, position: q.position, expected: e, extraClicks: Math.max(0, Math.round(q.impressions * (e - q.ctr) / 100)), action: q.position <= 10 ? "Rewrite the title and description for this search (it already shows on page 1)." : "Strengthen the page for this search (content, internal links) to reach page 1." }; })
      .sort(function (a, b) { return b.extraClicks - a.extraClicks; }).slice(0, 12);
  };
  /* ---------- v14 competitor matrix, you vs every competitor on the same visible basics (OBSERVED) ---------- */
  E.compMatrix = function (T, comps, extra) {
    if (!T || !(comps || []).length) return null;
    extra = extra || {};
    var cols = [{ name: "You", domain: extra.domain, p: T, you: true }].concat(comps.map(function (c) { return { name: c.name, domain: c.domain, p: c.profile }; }));
    var rows = [["Offer strength (0–100)", function (p) { return p.offerScore == null ? null : p.offerScore; }, "num"], ["Prices shown", function (p) { return !!p.pricing; }], ["Testimonials / reviews", function (p) { return !!p.testimonials; }], ["FAQ", function (p) { return !!p.faq; }],
      ["Blog / articles", function (p) { return !!p.blog; }], ["WhatsApp", function (p) { return !!p.whatsapp; }], ["Trust signals", function (p) { return (p.trust || []).length; }, "num"], ["Structured data (schema)", function (p) { return (p.schema || []).length > 0; }], ["Social profiles linked", function (p) { return (p.socials || []).length; }, "num"]];
    return { cols: cols.map(function (c) { return { name: c.name, domain: c.domain, you: !!c.you }; }), rows: rows.map(function (r) { return { name: r[0], num: r[2] === "num", values: cols.map(function (c) { try { return r[1](c.p || {}); } catch (e) { return null; } }) }; }) };
  };
  /* small page records for the report (the full text stays in the browser) */
  E.compact = function (crawl) {
    return crawl.pages.map(function (p) { return { url: p.url, finalUrl: p.finalUrl, status: p.status, error: p.error || "", type: p.type || "", title: p.title || "", meta: p.metaDescription || "", h1: (p.h1 || [])[0] || "", words: p.wordCount || 0, canonical: p.canonical || "", noindex: !!p.noindex, depth: p.depth, schema: (p.schemaTypes || []).slice(0, 5), redirects: (p.redirects || []).length }; });
  };

  window.FODO_XRAY_ENGINE = E;
})();
