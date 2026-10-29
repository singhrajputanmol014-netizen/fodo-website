/* FODO Business X-Ray — page controller: runs the job stage by stage against /api/xray/*, reports REAL progress
   (a stage is ticked only when it has actually finished), renders the evidence-backed report, exports it.
   Analysis lives in js/xray-engine.js; downloads use js/cf-export.js. Nothing from other websites is ever inserted as HTML —
   every outside string goes through esc(). */
(function () {
  "use strict";
  var E = window.FODO_XRAY_ENGINE; if (!E) return;
  var U = window.FODO_UTIL || {}, ROOT = U.root || "/", X = window.FODO_EXPORT;
  var $ = function (id) { return document.getElementById(id); };
  var form = $("xr-form"); if (!form) return;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var track = function (n, p) { try { if (window.FODO_TRACK) window.FODO_TRACK(n, p || {}); } catch (e) {} };
  var STAGES = [["DISCOVERY", "Understanding the business"], ["CRAWLING", "Reading the website"], ["MARKET_RESEARCH", "Researching the market"], ["COMPETITORS", "Finding & comparing competitors"], ["CUSTOMER_RESEARCH", "Listening to customers"], ["SEO", "Search & technical check"], ["CONVERSION", "Conversion, trust & presence"], ["OPPORTUNITIES", "Scoring & prioritising"], ["SYNTHESIS", "Writing the diagnosis"]];
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var busy = false, report = null, log = [];

  /* ---------- server calls (retry with backoff on network / 5xx; never on 4xx limits) ---------- */
  function call(path, body, opt) {
    opt = opt || {}; var tries = opt.tries || 3, t0 = Date.now();
    var attempt = function (n) {
      return fetch(ROOT + "api/xray/" + path, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? {} : { "content-type": opt.raw ? "application/json" : "application/json" }, body: body === undefined ? undefined : opt.raw ? body : JSON.stringify(body), signal: AbortSignal.timeout ? AbortSignal.timeout(opt.timeout || 70000) : undefined })
        .then(function (r) { if (r.status >= 500 && n < tries - 1) throw Object.assign(new Error("HTTP " + r.status), { retry: true }); return r; })
        .catch(function (e) { if (n < tries - 1 && (e.retry || e.name === "TypeError" || e.name === "TimeoutError")) return sleep(600 * Math.pow(2, n)).then(function () { return attempt(n + 1); }); throw e; });
    };
    return attempt(0).then(function (r) { log.push({ path: path, status: r.status, ms: Date.now() - t0 }); return r; }, function (e) { log.push({ path: path, status: 0, ms: Date.now() - t0, error: String(e.message) }); throw e; });
  }
  var callJ = function (path, body, opt) { return call(path, body, opt).then(function (r) { return r.json().catch(function () { return { ok: false, reason: "Bad answer (" + r.status + ")" }; }).then(function (j) { j._status = r.status; return j; }); }); };
  function makeFetcher(jobId) {
    var memo = {};
    return function (url) {
      if (memo[url]) return memo[url];
      return memo[url] = call("fetch", { jobId: jobId, url: url }, { tries: 2, timeout: 30000 }).then(function (r) {
        var meta = {}; try { meta = JSON.parse(decodeURIComponent(r.headers.get("x-xray-meta") || "%7B%7D")); } catch (e) {}
        if (r.status !== 200) return r.json().catch(function () { return {}; }).then(function (j) { return { status: 0, error: j.reason || "HTTP " + r.status, redirects: [] }; });
        return r.text().then(function (t) { return { status: meta.status || 0, finalUrl: meta.finalUrl || url, redirects: meta.redirects || [], headers: meta.headers || {}, ms: meta.ms || 0, body: t.slice(0, 3e6), error: meta.error || (meta.status >= 400 ? "" : ""), skipped: meta.skipped || "" }; });
      }, function (e) { return { status: 0, error: "network: " + e.message, redirects: [] }; });
    };
  }

  /* ---------- form ---------- */
  var qs = new URLSearchParams(location.search);
  if (qs.get("url")) $("xr-url").value = qs.get("url");
  form.addEventListener("submit", function (e) { e.preventDefault(); run(); });
  function status(t, kind) { var s = $("xr-status"); s.textContent = t; s.className = "cf-status" + (kind ? " " + kind : ""); }
  function stageUI(done, cur, note) {
    $("xr-progress").hidden = false;
    var pct = Math.round(done.length / STAGES.length * 100);
    $("xr-bar").style.width = pct + "%"; $("xr-bar").parentNode.setAttribute("aria-valuenow", pct); $("xr-pct").textContent = pct + "% · " + done.length + " of " + STAGES.length + " stages done";
    $("xr-stages").innerHTML = STAGES.map(function (s) { var st = done.indexOf(s[0]) > -1 ? "done" : s[0] === cur ? "now" : ""; return '<li class="' + st + '"><i aria-hidden="true"></i><span>' + esc(s[1]) + (s[0] === cur && note ? ' <small class="muted">' + esc(note) + "</small>" : "") + "</span></li>"; }).join("");
  }

  /* ---------- the job ---------- */
  function run() {
    if (busy) return;
    var input = { url: $("xr-url").value.trim(), industry: $("xr-industry").value.trim(), city: $("xr-city").value.trim(), name: $("xr-name").value.trim(), country: $("xr-country").value, product: $("xr-product").value.trim(), audience: $("xr-audience").value.trim() };
    if (!input.url) { status("Enter the website address to X-Ray.", "warn"); $("xr-url").focus(); return; }
    busy = true; log = []; $("xr-run").disabled = true; $("xr-report").hidden = true; $("xr-report").innerHTML = "";
    status("Starting the X-Ray…", "busy");
    callJ("start", input, { tries: 2 }).then(function (j) {
      if (!j.ok) throw Object.assign(new Error(j.reason || "Could not start"), { user: true });
      track("xray_start", { domain: E.domainOf(input.url.indexOf("://") < 0 ? "https://" + input.url : input.url) });
      return execute(j, Object.assign(input, { url: j.jobId && input.url }));
    }).then(function (rep) {
      busy = false; $("xr-run").disabled = false; report = rep; render(rep); status("X-Ray complete — " + rep.crawl.pages + " pages read, " + rep.opportunities.length + " opportunities found.", "ok"); track("xray_complete", { score: rep.scores.overall });
      try { history.replaceState(null, "", location.pathname + "?r=" + rep.jobId); } catch (e) {}
    }, function (e) {
      busy = false; $("xr-run").disabled = false;
      status(e.user ? e.message : "The X-Ray stopped: " + (e.message || "unknown error") + ". Please try again.", "warn"); track("xray_fail", {});
    });
  }

  function execute(job, input) {
    var jobId = job.jobId, P = job.providers || {}, ev = new E.Evidence(), done = [], modules = {}, fetcher = makeFetcher(jobId), t0 = Date.now();
    var startUrl = (/^https?:\/\//i.test(input.url) ? input.url : "https://" + input.url);
    var S = { input: input, providers: P }, SN = P.searchName || "search";
    var progress = function (stage, note, allow) { return callJ("progress", { jobId: jobId, stage: stage, progress: Math.round(done.length / STAGES.length * 100), completedModules: done, allow: allow, note: note || "" }, { tries: 1 }).catch(function () {}); };
    var stage = function (name, fn) {
      stageUI(done, name); status(STAGES.filter(function (s) { return s[0] === name; })[0][1] + "…", "busy");
      return progress(name).then(function () { return Promise.resolve().then(fn); }).then(function () { done.push(name); stageUI(done, null); return progress(name); }, function (e) {
        modules[name] = { status: "error", note: String(e && e.message || e) }; done.push(name); stageUI(done, null); return progress(name, "error: " + String(e && e.message || e).slice(0, 120));
      });
    };
    var search = function (q) {
      if (!P.search) return Promise.resolve(null);
      return callJ("search", { jobId: jobId, q: q, country: S.country || input.country }, { tries: 2, timeout: 20000 }).then(function (j) { if (j._status !== 200 || j.ok === false) { S.searchErrors = (S.searchErrors || []).concat([q + ": " + (j.reason || j._status)]); return null; } return E.parseSearch(j); }, function () { return null; });
    };
    var lib = null, freeLib = function () { return lib = lib || import(ROOT + "js/free-places.js"); };
    var psiP = callJ("psi", { jobId: jobId, url: startUrl, strategy: "mobile" }, { tries: 1, timeout: 90000 }).then(function (j) { return j._status === 200 ? E.parsePSI(j) : (S.psiError = j.reason || "unavailable", null); }, function () { S.psiError = "PageSpeed did not answer"; return null; });

    return stage("DISCOVERY", function () {
      return fetcher(E.normUrl(startUrl)).then(function (r) {
        if (r.error || !r.status || r.status >= 400) throw Object.assign(new Error("The website could not be opened (" + (r.error || "HTTP " + r.status) + ")."), { fatal: true });
        S.firstUrl = r.finalUrl;
        var pg = E.parsePage(r.body, startUrl, r); pg.depth = 0;
        S.quick = E.discover({ pages: [pg] }, input, new E.Evidence());
        stageUI(done, "DISCOVERY", S.quick ? (S.quick.name.value + (S.quick.industry.value ? " · " + S.quick.industry.value : "")) : "");
      });
    }).then(function () {
      if (modules.DISCOVERY && modules.DISCOVERY.status === "error") throw Object.assign(new Error(modules.DISCOVERY.note), { user: true });
      return stage("CRAWLING", function () {
        return E.crawl(S.firstUrl || startUrl, fetcher, {}, function (n, max) { stageUI(done, "CRAWLING", n + " of up to " + max + " pages"); }).then(function (c) { S.crawl = c; S.B = E.discover(c, input, ev); if (!S.B) throw new Error("No readable pages"); S.country = input.country || E.guessCountry(S.B, S.firstUrl || startUrl); });
      });
    }).then(function () {
      var B = S.B, target = B.domain;
      return stage("MARKET_RESEARCH", function () {
        S.queries = E.buildQueries(B, input);
        if (!P.search) { modules.MARKET_RESEARCH = { status: "unavailable", note: "No search provider connected (SERPER_API_KEY)." }; S.serps = []; return; }
        var list = S.queries.filter(function (q) { return q.kind !== "voice"; }), out = [], i = 0;
        var worker = function () { var q = list[i++]; if (!q) return Promise.resolve(); stageUI(done, "MARKET_RESEARCH", "search " + i + " of " + list.length + ": " + q.q);
          return search(q.q).then(function (res) { var o = Object.assign({}, q, { res: res }); if (res) o.evidence = [ev.add({ type: "search", claim: "Search results for “" + q.q + "”" + (S.country ? " (" + S.country + ")" : ""), sourceUrl: res.searchUrl, sourceName: res.providerName, evidenceText: res.web.slice(0, 5).map(function (r) { return r.pos + ". " + r.host; }).join(" · ") || "no results" })]; out.push(o); }).then(worker); };
        return Promise.all([worker(), worker()]).then(function () { S.serps = out; S.serpA = E.serpAnalysis(out, target); var okN = out.filter(function (s) { return s.res; }).length; modules.MARKET_RESEARCH = { status: okN === out.length ? "ok" : okN ? "partial" : "unavailable", note: okN === out.length ? "" : (out.length - okN) + " of " + out.length + " searches failed (" + (S.searchErrors || []).slice(0, 2).join("; ") + ")" }; });
      });
    }).then(function () {
      var B = S.B, target = B.domain;
      return stage("COMPETITORS", function () {
        var placesP = Promise.resolve([]);
        if (P.places && B.local && B.city) placesP = freeLib().then(function (m) {
          return m.freePlaces(function (u, o, ms) { return fetch(u, Object.assign({}, o, { signal: AbortSignal.timeout ? AbortSignal.timeout(ms || 9000) : undefined })); }, {}).geocode(B.city).then(function (c) {
            if (!c) return []; S.center = c; var g = m.geoCats((input.product || (B.services.value[0] || "") + " " + (B.industry.value || "")).trim() || "business");
            return fetch(ROOT + "api/geo?cat=" + g.cat + (g.name ? "&name=" + encodeURIComponent(g.name) : "") + "&lat=" + c.lat.toFixed(5) + "&lng=" + c.lng.toFixed(5) + "&radius=8000&offset=0").then(function (r) { return r.ok ? r.json() : { features: [] }; })
              .then(function (j) { return (j.features || []).map(m.fromGeoapify).filter(function (p) { return p && p.website; }).map(function (p) { p.source = "Geoapify map listing"; return p; }); });
          });
        }).catch(function () { return []; });
        return placesP.then(function (places) {
          S.places = places;
          var cands = E.candidates(S.serpA || [], target, places, SN).slice(0, 8);
          if (!cands.length) { modules.COMPETITORS = { status: "unavailable", note: P.search ? "No competitor websites showed up in the searches." : "Needs a search provider or map listings." }; S.comps = []; return; }
          return progress("COMPETITORS", "", cands.map(function (c) { return c.domain; })).then(function () {
            var T = E.compProfile(S.crawl.pages.filter(function (p) { return !p.error; }).slice(0, 3)), maxS = cands[0].score, res = [], i = 0;
            S.T = T;
            var worker = function () {
              var c = cands[i++]; if (!c) return Promise.resolve();
              stageUI(done, "COMPETITORS", "reading " + c.domain);
              var home = c.urls[0] ? new URL(c.urls[0]).origin + "/" : "https://" + c.domain + "/";
              return fetcher(home).then(function (r) {
                if (r.error || r.status >= 400 || !r.body) return;
                var hp = E.parsePage(r.body, home, r); hp.depth = 0;
                var extra = hp.internalLinks.filter(function (l) { return /pric|plans|servic|product|solution/.test(l.url); }).map(function (l) { return l.url; })[0];
                return (extra ? fetcher(extra).then(function (r2) { return r2.body && !r2.error ? [hp, E.parsePage(r2.body, extra, r2)] : [hp]; }) : Promise.resolve([hp])).then(function (pages) {
                  var C = E.compProfile(pages); if (!C) return;
                  var cmp = E.compareCompetitor(T, C, c, B.city, maxS), ins = E.compInsights(T, C);
                  var nm = (hp.og.site_name || (hp.title || "").split(/\s[|–—\-:]\s/).pop() || c.domain).trim().slice(0, 60);
                  var evid = ev.add({ type: "competitor", claim: nm + " (" + c.domain + ") — " + cmp.reason, sourceUrl: C.url, sourceName: c.sources.join(" + ") + " + their website", pageUrl: C.url, evidenceText: "Headline: “" + (C.headline || "—") + "” · Title: " + C.title, label: "OBSERVED" });
                  res.push({ name: nm, domain: c.domain, url: C.url, source: c.sources, reason: cmp.reason, confidence: cmp.confidence, score: cmp.score, overlaps: cmp, profile: C, insights: ins, queries: c.queries, evidence: [evid].concat((c.evidence || []).slice(0, 2)) });
                });
              }).then(worker, worker);
            };
            return Promise.all([worker(), worker(), worker()]).then(function () {
              S.comps = res.filter(function (c) { return c.score >= 25 || c.overlaps.serviceOverlap >= 0.06; }).sort(function (a, b) { return b.score - a.score; }).slice(0, E.CFG.MAX_COMPETITORS);
              S.positioning = S.comps.length ? E.positioning(T, S.comps.map(function (c) { return c.profile; })) : null;
              modules.COMPETITORS = { status: S.comps.length ? "ok" : "unavailable", note: S.comps.length ? "" : "Candidate sites did not look like direct competitors." };
            });
          });
        });
      });
    }).then(function () {
      var B = S.B;
      return stage("CUSTOMER_RESEARCH", function () {
        var items = [];
        S.crawl.pages.filter(function (p) { return !p.error && p.testimonials && p.testimonials.found && (p.type === "proof" || p.type === "home"); }).slice(0, 3).forEach(function (p) {
          var id = ev.add({ type: "voice", claim: "Testimonial text on your site (self-published)", pageUrl: p.finalUrl, sourceName: "Your website", evidenceText: p.text.slice(0, 400) });
          items.push({ text: p.text.slice(0, 3000), url: p.finalUrl, source: "Your website (self-published)", evidence: [id], own: true });
        });
        if (!P.search) { S.voice = E.voice(items); modules.CUSTOMER_RESEARCH = { status: items.length ? "partial" : "unavailable", note: "Public reviews and discussions need a search provider." }; return; }
        var qs = S.queries.filter(function (q) { return q.kind === "voice"; });
        return Promise.all(qs.map(function (q) { return search(q.q).then(function (res) {
          if (!res) return;
          res.web.filter(function (r) { return !res.discussions.some(function (d) { return d.url === r.url; }); }).concat(res.discussions.map(function (d) { return { url: d.url, description: [d.question, d.description, d.top].join(". "), host: d.domain, title: d.title, forum: d.forum }; })).concat(res.faq.map(function (f) { return { url: f.url, description: f.question + " " + f.answer, host: f.domain, title: f.question }; })).forEach(function (r) {
            if (r.domain === B.domain) return;
            var txt = [r.description].concat(r.extra || []).join(". "); if (!txt || txt.length < 30) return;
            var id = ev.add({ type: "voice", claim: "Public text from " + (r.host || E.domainOf(r.url)), sourceUrl: r.url, sourceName: (r.forum ? r.forum + " — " : "") + (r.host || "search result") + " (via " + SN + ")", evidenceText: txt });
            items.push({ text: txt, url: r.url, source: r.host || E.domainOf(r.url), evidence: [id] });
          });
        }); })).then(function () { S.voice = E.voice(items); modules.CUSTOMER_RESEARCH = { status: items.length ? "ok" : "unavailable", note: items.length ? "Based on " + items.length + " public snippets (search-result excerpts, not full reviews)." : "No public reviews or discussions came back from the searches." }; });
      });
    }).then(function () {
      return stage("SEO", function () {
        stageUI(done, "SEO", "waiting for Google PageSpeed (up to 60 s)");
        return Promise.race([psiP, sleep(75000).then(function () { S.psiError = "PageSpeed took too long"; return null; })]).then(function (psi) {
          S.psi = psi; S.tech = E.techChecks(S.crawl, S.B, psi, ev);
          var siteText = S.crawl.pages.map(function (p) { return (p.title || "") + " " + (p.h1 || []).join(" ") + " " + ((p.headings || {}).h2 || []).join(" ") + " " + (p.metaDescription || ""); }).join(" ");
          var volP = P.seo && S.serpA ? callJ("seo", { jobId: jobId, keywords: S.serpA.filter(function (s) { return s.kind !== "brand" && s.kind !== "voice"; }).map(function (s) { return s.q; }), location: input.country || "India" }).then(function (j) { return j.ok ? j.items : null; }, function () { return null; }) : Promise.resolve(null);
          return volP.then(function (vol) { S.volumes = vol; S.kw = S.serpA ? E.keywordOpps(S.serpA, siteText, vol) : []; });
        });
      });
    }).then(function () {
      var B = S.B;
      return stage("CONVERSION", function () {
        S.site = E.siteChecks(S.crawl, B, ev);
        var brand = (S.serps || []).filter(function (s) { return s.kind === "brand"; })[0];
        var placeP = Promise.resolve(null);
        if (P.places && S.center && B.local) placeP = fetch(ROOT + "api/geo?cat=commercial,office,service,catering,healthcare,education,accommodation,sport&name=" + encodeURIComponent(B.name.value.slice(0, 40)) + "&lat=" + S.center.lat.toFixed(5) + "&lng=" + S.center.lng.toFixed(5) + "&radius=30000&offset=0").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
          var nm = E._u.low(B.name.value), f = j && (j.features || []).filter(function (x) { return x.properties && E._u.low(x.properties.name).indexOf(nm.split(" ")[0]) > -1; })[0];
          return f ? { name: f.properties.name, address: f.properties.formatted, source: "Geoapify (OpenStreetMap-based)" } : { none: true };
        }).catch(function () { return null; });
        return placeP.then(function (place) {
          S.presence = E.presence(B, brand && brand.res, place, SN);
          var pr = S.presence;
          if (pr.searched) {
            var rc = pr.ratings.length ? { id: "R_offsite", area: "trust", group: "Off-site reviews", name: "Public rating found in search results", status: pr.ratings[0].value >= 4.2 ? "pass" : pr.ratings[0].value >= 3.6 ? "warn" : "fail", score: Math.round(pr.ratings[0].value / 5 * 100), weight: 2, detail: pr.ratings.map(function (r) { return r.value + "/5" + (r.count ? " (" + r.count + " reviews)" : "") + " on " + r.host; }).join("; "), evidence: [ev.add({ type: "reviews", claim: "Public ratings in search snippets", sourceUrl: pr.ratings[0].url, sourceName: pr.ratings[0].host + " (via " + SN + ")", evidenceText: pr.ratings.map(function (r) { return r.value + "/5 " + (r.count || "") + " " + r.host; }).join(" · ") })], label: "OBSERVED", pages: [] }
              : { id: "R_offsite", area: "trust", group: "Off-site reviews", name: "Public rating found in search results", status: "warn", score: 40, weight: 1, detail: "No rating appeared in the search results for your name — reviews may exist but weren't visible in this sample.", evidence: brand && brand.evidence || [], label: "INFERRED", pages: [] };
            S.reviewCheck = rc;
          }
        });
      });
    }).then(function () {
      var B = S.B;
      return stage("OPPORTUNITIES", function () {
        var checks = (S.tech || []).concat(S.site || []).concat(S.reviewCheck ? [S.reviewCheck] : []);
        var extra = [], serpA = S.serpA || [];
        var cat = serpA.filter(function (s) { return s.ok && ["category", "best", "pricing", "problem", "alternatives"].indexOf(s.kind) > -1; }), absent = cat.filter(function (s) { return s.ourPos == null; });
        if (cat.length && absent.length >= Math.ceil(cat.length / 2)) extra.push({ key: "S_absent", detail: "Not in the top 10 for " + absent.length + " of " + cat.length + " market searches: " + absent.slice(0, 3).map(function (s) { return "“" + s.q + "”"; }).join(", ") + ".", evidence: [].concat.apply([], absent.slice(0, 4).map(function (s) { return s.evidence; })), label: "OBSERVED" });
        var brand = serpA.filter(function (s) { return s.kind === "brand" && s.ok; })[0];
        if (brand && brand.ourPos !== 1) extra.push({ key: "S_brand", detail: brand.ourPos ? "Your site is #" + brand.ourPos + " for your own name." : "Your site is not in the top 10 for your own name.", evidence: brand.evidence, label: "OBSERVED" });
        var lst = S.presence ? Object.keys(S.presence.listings).length : null;
        if (S.presence && S.presence.searched && B.local && lst < 2) extra.push({ key: "D_listings", detail: "Only " + lst + " listing platform(s) showed your business in search.", evidence: brand ? brand.evidence : [], label: "INFERRED" });
        if (!Object.keys(B.socials).length) extra.push({ key: "D_social", detail: "No social profile links found on the site.", evidence: [], label: "OBSERVED" });
        var hi = (S.kw || []).filter(function (k) { return k.opportunity === "High"; });
        if (hi.length) extra.push({ key: "K_gap", detail: hi.length + " high-opportunity search(es): " + hi.slice(0, 3).map(function (k) { return "“" + k.keyword + "”"; }).join(", ") + ".", evidence: [].concat.apply([], hi.slice(0, 3).map(function (k) { return k.evidence || []; })), label: "INFERRED" });
        S.compMetrics = S.comps && S.comps.length ? E.competitiveMetrics(S.T, S.comps.map(function (c) { return c.profile; })) : [];
        var behind = S.compMetrics.filter(function (m) { return m.you < m.median; });
        if (behind.length >= 3) extra.push({ key: "M_compGap", detail: "Behind the competitor median on: " + behind.map(function (m) { return m.name.split(" — ")[0]; }).join(", ") + ".", evidence: [].concat.apply([], S.comps.map(function (c) { return c.evidence.slice(0, 1); })), label: "OBSERVED" });
        if (S.positioning && S.positioning.sameAsEveryone.length >= 2) extra.push({ key: "M_sameMessage", detail: "Your headline phrases also used by competitors: " + S.positioning.sameAsEveryone.slice(0, 5).map(function (x) { return "“" + x + "”"; }).join(", ") + ".", evidence: B.offer.evidence.concat(S.comps.slice(0, 2).map(function (c) { return c.evidence[0]; })), label: "INFERRED" });
        var cmpl = S.voice && S.voice.complaints[0];
        if (cmpl && cmpl.count >= 2) extra.push({ key: "V_complaint", detail: "Most common complaint theme in public text: “" + cmpl.theme + "” (" + cmpl.count + " mentions).", evidence: [].concat.apply([], cmpl.quotes.map(function (q) { return q.evidence || []; })).slice(0, 4), label: "INFERRED" });
        S.checks = checks;
        S.scores = E.scores(checks, { searchName: SN, serp: serpA, presence: S.presence, reviewCheck: S.reviewCheck, competitive: S.compMetrics, compCount: (S.comps || []).length });
        S.opps = E.opportunities(checks, extra, ev);
        S.top = E.pickTop(S.opps); S.plan = E.plan(S.opps);
      });
    }).then(function () {
      var B = S.B;
      return stage("SYNTHESIS", function () {
        if (!P.ai) { modules.SYNTHESIS = { status: "unavailable", note: "AI not connected — summary written by rules from the data." }; S.syn = null; return; }
        var refIds = {}; S.opps.slice(0, 14).forEach(function (o) { refIds[o.id] = 1; o.evidence.forEach(function (id) { refIds[id] = 1; }); });
        (S.comps || []).forEach(function (c) { c.evidence.forEach(function (id) { refIds[id] = 1; }); });
        if (S.voice) ["needs", "complaints", "objections", "triggers", "positive"].forEach(function (k) { (S.voice[k] || []).slice(0, 2).forEach(function (g) { g.quotes.slice(0, 2).forEach(function (q) { (q.evidence || []).forEach(function (id) { refIds[id] = 1; }); }); }); });
        B.offer.evidence.concat(B.name.evidence, B.industry.evidence || [], B.description.evidence).forEach(function (id) { refIds[id] = 1; });
        var evid = ev.list.filter(function (x) { return refIds[x.id]; }).map(function (x) { return { id: x.id, claim: x.claim, text: E._u.clip(x.evidenceText, 180), source: x.sourceName, label: x.label }; });
        var data = { business: { name: B.name.value, industry: B.industry.value, model: B.model.value, locations: B.locations.value, services: B.services.value.slice(0, 8), headline: B.offer.headline, offerScore: B.offer.score },
          scores: Object.keys(S.scores.areas).map(function (k) { var a = S.scores.areas[k]; return { area: a.name, score: a.score, quality: a.quality, parts: a.components.map(function (c) { return c.name + ": " + c.score; }) }; }), overall: S.scores.overall,
          opportunities: S.opps.slice(0, 14).map(function (o) { return { id: o.id, title: o.title, category: o.category, priority: o.priority, score: o.priorityScore, detail: E._u.clip(o.description, 200), evidence: o.evidence.slice(0, 4) }; }),
          competitors: (S.comps || []).map(function (c) { return { name: c.name, domain: c.domain, reason: c.reason, theyDoBetter: c.insights.advantages, theyLack: c.insights.weaknesses, evidence: c.evidence.slice(0, 1) }; }),
          customerVoice: S.voice ? ["needs", "complaints", "objections", "triggers"].map(function (k) { return { type: k, themes: (S.voice[k] || []).slice(0, 3).map(function (g) { return { theme: g.theme, mentions: g.count, example: g.quotes[0] && g.quotes[0].text, evidence: g.quotes[0] && g.quotes[0].evidence }; }) }; }) : "unavailable",
          keywords: (S.kw || []).map(function (k) { return { keyword: k.keyword, intent: k.intent, opportunity: k.opportunity, ourPosition: k.ourPos }; }),
          unavailable: Object.keys(modules).filter(function (k) { return modules[k].status !== "ok"; }).map(function (k) { return k + ": " + modules[k].note; }).concat(S.psi ? [] : ["PageSpeed: " + (S.psiError || "unavailable")]), evidence: evid };
        var ids = evid.map(function (x) { return x.id; }).concat(S.opps.map(function (o) { return o.id; }));
        var vqs = S.queries.filter(function (q) { return q.kind === "category" || q.kind === "best"; }).slice(0, 4).map(function (q) { return /^best /i.test(q.q) ? "What are the " + q.q + "? Please recommend specific businesses." : "Which businesses would you recommend for " + q.q + "?"; });
        return Promise.all([
          callJ("ai", { jobId: jobId, mode: "synthesis", pack: { ids: ids, data: data } }, { tries: 2, timeout: 80000 }).then(function (j) { S.syn = j.ok ? j.synthesis : null; S.synDropped = j.dropped || []; S.synModel = j.model || ""; if (!j.ok) modules.SYNTHESIS = { status: "unavailable", note: j.reason || "AI unavailable — rules-based summary shown." }; }, function () { modules.SYNTHESIS = { status: "unavailable", note: "AI did not answer — rules-based summary shown." }; }),
          vqs.length ? callJ("ai", { jobId: jobId, mode: "visibility", pack: { questions: vqs } }, { tries: 1, timeout: 80000 }).then(function (j) { S.vis = j.ok ? E.visibility(j.answers, B, (S.comps || []).map(function (c) { return { name: c.name, domain: c.domain }; })) : null; }, function () { S.vis = null; }) : null,
        ]);
      });
    }).then(function () {
      var rep = assemble(jobId, S, ev, modules, Date.now() - t0);
      stageUI(done, null); status("Saving your report…", "busy");
      var txt = JSON.stringify(rep);
      var rows = P.storage === "d1" ? Promise.all([
        ["pages", rep.crawl.list.map(function (p) { return { url: p.finalUrl, status: p.status, title: p.title, type: p.type, words: p.words }; })], ["evidence", rep.evidence.map(function (e) { return { id: e.id, type: e.type, claim: e.claim, source_url: e.sourceUrl, label: e.label }; })],
        ["findings", rep.checks.map(function (c) { return { id: c.id, area: c.area, status: c.status, name: c.name, score: c.score }; })], ["opportunities", rep.opportunities.map(function (o) { return { id: o.id, priority: o.priority, score: o.priorityScore, title: o.title }; })],
        ["competitors", rep.competitors.map(function (c) { return { domain: c.domain, name: c.name, confidence: c.score / 100, reason: c.reason }; })], ["sources", rep.sources.map(function (s) { return { url: s.url, name: s.name }; })],
        ["scores", Object.keys(rep.scores.areas).map(function (k) { return { area: k, score: rep.scores.areas[k].score }; })], ["business", [{ name: rep.business.name.value, domain: rep.business.domain, industry: rep.business.industry.value, location: rep.business.city }]],
      ].map(function (r) { var chunks = []; for (var i = 0; i < r[1].length; i += 100) chunks.push(r[1].slice(i, i + 100)); return Promise.all(chunks.map(function (c) { return callJ("rows", { jobId: jobId, kind: r[0], rows: c }, { tries: 1 }).catch(function () {}); })); })) : Promise.resolve();
      return rows.then(function () { return call("report", txt, { raw: true, tries: 2 }).then(function (r) { return r; }, function () { return null; }); }).then(function () { return rep; });
    });
  }
  // the report save needs the job header; patch call() for that one route
  var _call = call; call = function (path, body, opt) {
    if (path !== "report") return _call(path, body, opt);
    var id = (JSON.parse(body) || {}).jobId;
    return fetch(ROOT + "api/xray/report", { method: "POST", headers: { "content-type": "application/json", "x-job": id }, body: body });
  };

  /* ---------- the report object ---------- */
  function rulesSummary(S) {
    var sc = S.scores, a = sc.areas, best = Object.keys(a).filter(function (k) { return a[k].score != null; }).sort(function (x, y) { return a[y].score - a[x].score; });
    var top = S.opps[0];
    return { executiveSummary: S.B.name.value + " scores " + (sc.overall == null ? "—" : sc.overall + "/100") + " on " + sc.basedOn + " of 6 measured areas. Strongest: " + (best[0] ? a[best[0]].name + " (" + a[best[0]].score + ")" : "—") + ". Weakest: " + (best.length ? a[best[best.length - 1]].name + " (" + a[best[best.length - 1]].score + ")" : "—") + "." + (top ? " The first thing to fix: " + top.title.toLowerCase() + "." : ""),
      doingWell: S.checks.filter(function (c) { return c.status === "pass" && c.weight >= 2; }).slice(0, 4).map(function (c) { return { text: c.name + " — " + c.detail, evidence: c.evidence }; }),
      holdingBack: S.opps.slice(0, 4).map(function (o) { return { text: o.title + (o.description ? " — " + o.description : ""), evidence: o.evidence }; }), whyProblem: null,
      competitorsDifferent: (S.comps || []).filter(function (c) { return c.insights.advantages.length; }).slice(0, 3).map(function (c) { return { text: c.name + ": " + c.insights.advantages.slice(0, 2).join("; "), evidence: c.evidence.slice(0, 1) }; }),
      customersWant: S.voice ? (S.voice.needs || []).slice(0, 3).map(function (g) { return { text: g.theme + " (" + g.count + " mentions)", evidence: [].concat.apply([], g.quotes.map(function (q) { return q.evidence || []; })).slice(0, 2) }; }) : [],
      marketOpportunities: S.voice && S.voice.marketOpportunity ? [{ text: S.voice.marketOpportunity, evidence: [] }] : [], doFirst: S.opps.slice(0, 5).map(function (o) { return o.id; }), notPrioritize: S.opps.filter(function (o) { return o.priority === "P3"; }).slice(0, 2).map(function (o) { return { text: o.title, why: "Low impact compared with the items above." }; }), unknowns: [], rules: true };
  }
  function assemble(jobId, S, ev, modules, ms) {
    var dq = {
      "Business discovery": S.B.industry.label === "OBSERVED" ? "HIGH" : "MEDIUM", "Website crawl": S.crawl.pages.length >= 10 ? "HIGH" : S.crawl.pages.length >= 3 ? "MEDIUM" : "LOW", "Speed (PageSpeed)": S.psi ? "HIGH" : "UNAVAILABLE",
      "Market research": (S.serps || []).some(function (s) { return s.res; }) ? "MEDIUM" : "UNAVAILABLE", "Competitors": (S.comps || []).length >= 3 ? "MEDIUM" : (S.comps || []).length ? "LOW" : "UNAVAILABLE", "Customer voice": S.voice ? S.voice.quality : "UNAVAILABLE",
      "Search demand (volumes)": S.volumes ? "MEDIUM" : "UNAVAILABLE", "Digital presence": S.presence && S.presence.searched ? "MEDIUM" : "LOW", "AI visibility (sampled)": S.vis ? "LOW" : "UNAVAILABLE", "Competitor traffic": "UNAVAILABLE",
    };
    var syn = S.syn || rulesSummary(S);
    var srcs = {}; ev.list.forEach(function (e) { var k = e.sourceUrl || e.pageUrl; if (k && !srcs[k]) srcs[k] = { url: k, name: e.sourceName, retrievedAt: e.retrievedAt }; });
    var c = S.crawl;
    return {
      version: "xray-1", jobId: jobId, createdAt: new Date().toISOString(), durationMs: ms, input: S.input, providers: S.providers,
      business: S.B, scores: S.scores, checks: S.checks, opportunities: S.opps, top: { immediate: S.top.immediate.map(function (o) { return o.id; }), growth: S.top.growth.map(function (o) { return o.id; }), strategic: S.top.strategic.map(function (o) { return o.id; }) }, plan: S.plan,
      crawl: { pages: c.pages.length, list: E.compact(c), robotsFound: c.robotsFound, sitemapFound: c.sitemapFound, sitemapUrls: c.sitemapUrls.length, skippedRobots: c.skippedRobots.length, errors: c.errors.length, limitsHit: c.limitsHit, durationMs: c.durationMs, broken: c.broken.slice(0, 30) },
      psi: S.psi, psiError: S.psiError || "", serps: (S.serpA || []).map(function (s) { return { q: s.q, kind: s.kind, intent: s.intent, ok: s.ok, ourPos: s.ourPos, competitors: s.competitors.slice(0, 5), directories: s.directories.slice(0, 5), evidence: s.evidence }; }),
      keywords: S.kw || [], volumes: !!S.volumes, competitors: (S.comps || []).map(function (x) { var p = x.profile; return { name: x.name, domain: x.domain, url: x.url, source: x.source, reason: x.reason, confidence: x.confidence, score: x.score, overlaps: { search: x.overlaps.searchOverlap, service: x.overlaps.serviceOverlap, geo: x.overlaps.geoOverlap, positioning: x.overlaps.positioningSimilarity }, insights: x.insights, evidence: x.evidence,
        profile: { headline: p.headline, title: p.title, meta: p.meta, ctas: p.ctas, pricing: p.pricing, pricingSamples: p.pricingSamples, testimonials: p.testimonials, faq: p.faq, trust: p.trust, schema: p.schema, blog: p.blog, socials: p.socials, offerScore: p.offerScore, whatsapp: p.whatsapp } }; }),
      compMetrics: S.compMetrics || [], positioning: S.positioning, target: S.T ? { offerScore: S.T.offerScore, pricing: S.T.pricing, testimonials: S.T.testimonials, faq: S.T.faq, trust: S.T.trust, blog: S.T.blog } : null,
      voice: S.voice ? { needs: S.voice.needs, complaints: S.voice.complaints, objections: S.voice.objections, triggers: S.voice.triggers, positive: S.voice.positive, snippets: S.voice.snippets, quality: S.voice.quality, marketOpportunity: S.voice.marketOpportunity } : null,
      presence: S.presence, visibility: S.vis, synthesis: syn, synthesisBy: S.syn ? "AI (" + (S.synModel || "Workers AI") + "), checked against evidence IDs" : "Rules (AI unavailable)", synthesisDropped: S.synDropped || [],
      modules: modules, dataQuality: dq, evidence: ev.list, sources: Object.keys(srcs).map(function (k) { return srcs[k]; }), log: log.slice(-200),
    };
  }

  /* ---------- rendering ---------- */
  var tone = function (s) { return s == null ? "na" : s >= 75 ? "good" : s >= 50 ? "mid" : "bad"; };
  var lbl = function (l) { return '<span class="xr-lbl ' + esc(String(l).toLowerCase()) + '">' + esc(l) + "</span>"; };
  var dqB = function (q) { return '<span class="xr-dq ' + esc(String(q || "").toLowerCase()) + '">Data quality: ' + esc(q || "—") + "</span>"; };
  var evBtn = function (ids, label) { ids = (ids || []).filter(Boolean); return ids.length ? '<button type="button" class="xr-why" data-ev="' + esc(ids.join(",")) + '">' + esc(label || "Why did FODO say this?") + " (" + ids.length + ")</button>" : '<span class="muted xr-noev">No direct evidence item</span>'; };
  var toolLink = function (t) { return t ? '<a class="xr-tool" href="' + esc(ROOT + t[1]) + '">' + esc(t[0]) + " →</a>" : ""; };
  function oppCard(o) {
    return '<li class="xr-opp"><div class="xr-opp-h"><span class="xr-p ' + o.priority.toLowerCase() + '">' + o.priority + '</span><b>' + esc(o.title) + '</b><span class="xr-ps" title="Priority score = impact × confidence × urgency ÷ effort, scaled to 100">' + o.priorityScore + "</span></div>" +
      (o.description ? '<p class="xr-why-t"><b>Why?</b> ' + esc(o.description) + "</p>" : "") +
      '<p class="xr-meta">Impact ' + o.impact + "/5 · Effort " + o.effort + "/5 · Urgency " + o.urgency + "/5 · Confidence " + Math.round(o.confidence * 100) + "% " + lbl(o.label) + "</p>" +
      '<p><b>Fix:</b> ' + esc(o.recommendation) + "</p>" + (o.affectedPages.length ? '<p class="xr-pages">Pages: ' + o.affectedPages.slice(0, 4).map(function (u) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(u.replace(/^https?:\/\/(www\.)?/, "")) + "</a>"; }).join(", ") + (o.affectedPages.length > 4 ? " +" + (o.affectedPages.length - 4) : "") + "</p>" : "") +
      '<div class="xr-opp-f">' + evBtn(o.evidence) + toolLink(o.tool) + "</div></li>";
  }
  var oppById = function (r, id) { return r.opportunities.filter(function (o) { return o.id === id; })[0]; };
  function secH(n, t, q) { return '<section class="xr-sec" id="xr-s' + n + '"><div class="xr-sec-h"><span class="section-num">' + ("0" + n).slice(-2) + "</span><h2>" + esc(t) + "</h2>" + (q ? dqB(q) : "") + "</div>"; }
  function render(r) {
    var B = r.business, sc = r.scores, A = sc.areas, syn = r.synthesis, h = "";
    var first = r.opportunities[0], growth = r.top.growth.map(function (id) { return oppById(r, id); }).filter(Boolean)[0] || r.opportunities[1];
    var top5 = (syn.doFirst && syn.doFirst.length ? syn.doFirst.map(function (id) { return oppById(r, id); }).filter(Boolean) : []).concat(r.opportunities).filter(function (o, i, a) { return a.indexOf(o) === i; }).slice(0, 5);
    h += '<div class="xr-hero panel hud"><div><p class="eyebrow">YOUR BUSINESS X-RAY</p><h2 class="xr-name">' + esc(B.name.value) + '</h2><p class="muted">' + esc(r.input.url) + " · " + esc(new Date(r.createdAt).toLocaleString()) + " · " + r.crawl.pages + " pages read</p>" +
      '<div class="btn-row xr-acts"><button type="button" class="btn sm" data-x="pdf">Download PDF</button><button type="button" class="btn sm ghost" data-x="xlsx">Excel</button><button type="button" class="btn sm ghost" data-x="csv">Findings CSV</button><button type="button" class="btn sm ghost" data-x="plan">Action plan CSV</button><button type="button" class="btn sm ghost" data-x="share">Copy share link</button><button type="button" class="btn sm ghost" data-x="json">JSON</button></div></div>' +
      '<div class="xr-ring ' + tone(sc.overall) + '" style="--v:' + (sc.overall || 0) + '"><b>' + (sc.overall == null ? "—" : sc.overall) + '</b><small>/100</small></div><div class="xr-ring-l"><b>Overall Growth Health</b><span>' + esc(sc.status) + '</span><small class="muted">Based on ' + sc.basedOn + " of " + sc.of + " areas with data</small></div></div>";
    h += '<div class="grid g3 xr-big"><div class="panel"><span class="tag">BIGGEST PROBLEM</span>' + (first ? "<h3>" + esc(first.title) + '</h3><p class="muted">' + esc(first.description) + "</p>" + evBtn(first.evidence) : "<p>No major problem found.</p>") + '</div><div class="panel"><span class="tag hot">BIGGEST OPPORTUNITY</span>' + (growth ? "<h3>" + esc(growth.title) + '</h3><p class="muted">' + esc(growth.recommendation) + "</p>" + evBtn(growth.evidence) : "<p>—</p>") + '</div><div class="panel"><span class="tag">TOP 5 ACTIONS</span><ol class="xr-top5">' + top5.map(function (o) { return "<li><b>" + esc(o.title) + "</b><br><span class=\"muted\">" + esc(o.recommendation) + "</span></li>"; }).join("") + "</ol></div></div>";
    // 1 executive summary
    h += secH(1, "Executive Summary") + '<p class="lead">' + esc(syn.executiveSummary) + '</p><p class="mono muted">Written by: ' + esc(r.synthesisBy) + (r.synthesisDropped.length ? " · " + r.synthesisDropped.length + " AI statement(s) removed because they had no evidence" : "") + "</p>" +
      synList("Doing well", syn.doingWell) + synList("Holding it back", syn.holdingBack) + (syn.whyProblem ? '<h3>Why the problem exists</h3><p>' + esc(syn.whyProblem.text) + " " + evBtn(syn.whyProblem.evidence) + "</p>" : "") + (syn.notPrioritize && syn.notPrioritize.length ? "<h3>Don't prioritise yet</h3><ul>" + syn.notPrioritize.map(function (x) { return "<li><b>" + esc(x.text) + "</b> — " + esc(x.why) + "</li>"; }).join("") + "</ul>" : "") + (syn.unknowns && syn.unknowns.length ? '<h3>Unknown</h3><ul class="muted">' + syn.unknowns.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") + "</section>";
    // 2 overall health (drillable)
    h += secH(2, "Overall Growth Health") + '<div class="xr-tiles">' + ["market", "website", "search", "trust", "conversion", "competitive"].map(function (k) { var a = A[k]; return '<details class="xr-tile ' + tone(a.score) + '"><summary><span>' + esc(a.name) + "</span><b>" + (a.score == null ? "—" : a.score) + "</b>" + (a.score == null ? '<small>Data unavailable</small>' : "") + '</summary><div class="xr-tile-b">' + (a.components.length ? "<ul>" + a.components.map(function (c) { return "<li><span>" + esc(c.name) + "</span><b>" + (c.score == null ? "—" : c.score) + "</b></li>"; }).join("") + "</ul>" : "") + '<p class="muted">' + esc(a.note || "") + "</p>" + dqB(a.quality) + "</div></details>"; }).join("") + "</div><p class=\"muted\">Tap a score to see exactly how it was calculated. Every score is the weighted average of the checks below — nothing is hard-coded.</p></section>";
    // 3 business overview
    var bf = [["Name", B.name], ["Industry", B.industry], ["Business model", B.model], ["Locations", B.locations], ["Audience", B.audience], ["Services / products", B.services], ["Main headline", B.valueProp], ["Prices seen", B.pricing], ["Differentiation claims", B.usp]];
    h += secH(3, "Business Overview", r.dataQuality["Business discovery"]) + '<dl class="xr-dl">' + bf.map(function (f) { var v = f[1] || {}, val = Array.isArray(v.value) ? v.value.join(" · ") : v.value; return "<div><dt>" + f[0] + "</dt><dd>" + (val ? esc(val) : '<span class="muted">Could not be reliably determined from public data.</span>') + " " + lbl(v.label || "UNKNOWN") + " " + (v.evidence && v.evidence.length ? evBtn(v.evidence, "Evidence") : "") + "</dd></div>"; }).join("") +
      "<div><dt>Contact</dt><dd>" + esc([B.contacts.phones.join(", "), B.contacts.emails.join(", "), B.contacts.whatsapp.length ? "WhatsApp" : "", B.contacts.address].filter(Boolean).join(" · ") || "None found") + "</dd></div><div><dt>Social</dt><dd>" + (Object.keys(B.socials).map(function (k) { return '<a href="' + esc(B.socials[k]) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(k) + "</a>"; }).join(" · ") || "None linked") + "</dd></div></dl></section>";
    // 4 market position
    var mk = A.market;
    h += secH(4, "Market Position", mk.quality) + (mk.score == null ? '<p class="muted">' + esc(mk.note) + "</p>" : '<p>Market position score <b>' + mk.score + "</b>/100 — " + esc(mk.note) + "</p>" + serpTable(r.serps.filter(function (s) { return s.kind !== "voice"; }))) + "</section>";
    // 5 biggest problem
    h += secH(5, "Biggest Problem") + (first ? '<ul class="xr-opps">' + oppCard(first) + "</ul>" : "<p>None found.</p>") + "</section>";
    // 6 website
    h += secH(6, "Website X-Ray", r.dataQuality["Website crawl"]) + '<p class="muted">' + r.crawl.pages + " pages read in " + (r.crawl.durationMs / 1000).toFixed(0) + " s · robots.txt " + (r.crawl.robotsFound ? "found" : "not found") + " · sitemap " + (r.crawl.sitemapFound ? "found (" + r.crawl.sitemapUrls + " URLs)" : "not found") + (r.crawl.skippedRobots ? " · " + r.crawl.skippedRobots + " URL(s) skipped because robots.txt disallows them" : "") + (r.crawl.limitsHit.length ? " · limit reached: " + r.crawl.limitsHit.join(", ") : "") + "</p>" +
      (r.psi ? psiBlock(r.psi) : '<p class="muted">Speed: ' + esc(r.psiError || "not measured") + ".</p>") + checksTable(r.checks.filter(function (c) { return c.area === "website"; })) + '<details class="xr-more"><summary>Every page read (' + r.crawl.list.length + ")</summary>" + pagesTable(r.crawl.list) + "</details></section>";
    // 7 SEO / search
    h += secH(7, "SEO / Search X-Ray", A.search.quality) + (r.keywords.length ? '<p class="muted">' + (r.volumes ? "Search volumes from DataForSEO (ESTIMATED by Google Ads data)." : "Search volume: Data unavailable (no SEO data provider). Opportunity labels are based on intent, relevance to your pages and whether competitors appear where you don't.") + "</p>" + kwTable(r.keywords) : '<p class="muted">' + esc(A.search.note) + "</p>") + "</section>";
    // 8 competitors
    h += secH(8, "Competitor X-Ray", r.dataQuality.Competitors) + (r.competitors.length ? '<div class="xr-comps">' + r.competitors.map(compCard).join("") + "</div>" + (r.compMetrics.length ? "<h3>You vs competitor median</h3>" + '<ul class="xr-bars">' + r.compMetrics.map(function (m) { return "<li><span>" + esc(m.name) + '</span><i style="--v:' + m.score + '" class="' + tone(m.score) + '"></i></li>'; }).join("") + "</ul>" : "") : '<p class="muted">' + esc((r.modules.COMPETITORS || {}).note || "No competitors confirmed.") + "</p>") + '<p><a class="xr-tool" href="' + ROOT + 'competitor-finder/">Find every local or brand competitor in Competitor Finder →</a></p></section>';
    // 9 customer voice
    h += secH(9, "Customer Voice", r.dataQuality["Customer voice"]) + (r.voice ? voiceBlock(r.voice) : '<p class="muted">' + esc((r.modules.CUSTOMER_RESEARCH || {}).note || "Data unavailable.") + "</p>") + "</section>";
    // 10 offer & positioning
    var O = B.offer;
    h += secH(10, "Offer & Positioning") + '<p>Offer Strength Score <b>' + O.score + "</b>/100 " + lbl("INFERRED") + ' — does the homepage say <i>who</i> it is for, the <i>problem</i>, the <i>outcome</i> and <i>why you</i>?</p><blockquote class="xr-q">' + esc(O.hero || "(no headline found)") + "</blockquote>" +
      '<ul class="xr-parts">' + ["audience", "problem", "outcome", "differentiation"].map(function (k) { var p = O.parts[k]; return '<li class="' + (p.found ? "ok" : "no") + '"><b>' + k + "</b> " + (p.found ? "“" + esc(p.match) + "”" : "not stated") + "</li>"; }).join("") + "</ul>" + evBtn(O.evidence) +
      (r.positioning ? "<h3>Where you sound like everyone else</h3>" + (r.positioning.sameAsEveryone.length ? "<p>" + r.positioning.sameAsEveryone.map(function (x) { return '<span class="chip">' + esc(x) + "</span>"; }).join(" ") + "</p>" : '<p class="muted">No headline phrases shared with most competitors.</p>') +
        "<h3>White space — claims no competitor makes</h3>" + (r.positioning.whiteSpace.length ? "<ul>" + r.positioning.whiteSpace.map(function (w) { return "<li><b>" + esc(w.claim) + "</b> — " + (w.youHave ? "you already make it: lead with it." : "nobody owns it yet: an opening if it is true for you.") + "</li>"; }).join("") + "</ul>" : '<p class="muted">Competitors cover all the common claims we check.</p>') + '<p class="muted">' + lbl("INFERRED") + " Compared with the " + r.competitors.length + " competitor(s) above.</p>" : '<p class="muted">Positioning comparison needs confirmed competitors.</p>') + "</section>";
    // 11 conversion
    h += secH(11, "Conversion X-Ray", "MEDIUM") + '<p class="muted">Journey: Visitor → Understanding → Trust → Interest → Action. Checks are read from the page HTML; button placement is INFERRED from page order' + (r.psi && r.psi.screenshot ? " — the mobile screenshot below is from Google PageSpeed" : "") + ".</p>" + checksTable(r.checks.filter(function (c) { return c.area === "conversion" || c.area === "trust"; })) + "</section>";
    // 12 digital presence
    h += secH(12, "Digital Presence", r.dataQuality["Digital presence"]) + presenceBlock(r) + "</section>";
    // 13 AI visibility
    h += secH(13, "AI Visibility", r.dataQuality["AI visibility (sampled)"]) + (r.visibility ? '<p><b>Sampled AI visibility:</b> ' + r.visibility.tested + " questions tested · your brand appeared in " + r.visibility.brandIn + " · competitors appeared in " + r.visibility.compIn + '.</p><p class="muted">One open model (' + esc(r.visibility.model) + " on Cloudflare Workers AI) was asked. This is NOT ChatGPT, Gemini or Google AI Overviews, and a handful of questions is not your total AI visibility.</p><table class=\"xr-t\"><thead><tr><th>Question</th><th>You?</th><th>Competitors named</th></tr></thead><tbody>" + r.visibility.rows.map(function (x) { return "<tr><td>" + esc(x.q) + "</td><td>" + (x.answered ? (x.brand ? "Yes" : "No") : "no answer") + "</td><td>" + esc(x.competitors.join(", ") || "—") + "</td></tr>"; }).join("") + "</tbody></table>" : '<p class="muted">Data unavailable — no AI source connected.</p>') + "</section>";
    // 14 biggest opportunities
    var grp = function (t, ids) { var os = ids.map(function (id) { return oppById(r, id); }).filter(Boolean); return os.length ? "<h3>" + t + '</h3><ul class="xr-opps">' + os.map(oppCard).join("") + "</ul>" : ""; };
    h += secH(14, "Biggest Opportunities") + grp("Top 3 immediate fixes", r.top.immediate) + grp("Top 5 growth opportunities", r.top.growth) + grp("Top 5 strategic opportunities", r.top.strategic) + '<details class="xr-more"><summary>All ' + r.opportunities.length + " opportunities</summary><ul class=\"xr-opps\">" + r.opportunities.map(oppCard).join("") + "</ul></details></section>";
    // 15 top 5 actions
    h += secH(15, "Top 5 Actions") + '<ol class="xr-actions">' + top5.map(function (o) { return "<li><b>" + esc(o.title) + "</b> <span class=\"xr-p " + o.priority.toLowerCase() + "\">" + o.priority + "</span><br>" + esc(o.recommendation) + " " + evBtn(o.evidence, "Evidence") + " " + toolLink(o.tool) + "</li>"; }).join("") + "</ol></section>";
    // 16 plan
    h += secH(16, "30-Day Action Plan") + '<div class="xr-plan">' + r.plan.map(function (w) { return '<div class="panel"><span class="tag">' + w.label + "</span><h3>" + esc(w.focus) + "</h3>" + (w.items.length ? "<ul>" + w.items.map(function (i) { return "<li><b>Problem:</b> " + esc(i.problem) + "<br><b>Action:</b> " + esc(i.action) + "<br><b>Expected impact:</b> " + i.expectedImpact + " " + evBtn(i.evidence, "Evidence") + "</li>"; }).join("") + "</ul>" : '<p class="muted">Nothing left for this week — use it to measure results.</p>') + "</div>"; }).join("") + "</div></section>";
    // 17 evidence & sources
    h += secH(17, "Evidence & Sources") + '<div class="xr-dqgrid">' + Object.keys(r.dataQuality).map(function (k) { return "<div><span>" + esc(k) + "</span>" + dqB(r.dataQuality[k]) + "</div>"; }).join("") + "</div>" +
      (Object.keys(r.modules).length ? "<h3>What was unavailable</h3><ul>" + Object.keys(r.modules).filter(function (k) { return r.modules[k].status !== "ok"; }).map(function (k) { return "<li><b>" + esc(k.replace(/_/g, " ").toLowerCase()) + ":</b> " + esc(r.modules[k].note) + "</li>"; }).join("") + "</ul>" : "") +
      '<details class="xr-more"><summary>All ' + r.evidence.length + ' evidence items</summary><ol class="xr-evlist">' + r.evidence.map(evItem).join("") + '</ol></details><details class="xr-more"><summary>' + r.sources.length + " sources</summary><ul>" + r.sources.map(function (s) { return '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(s.url) + "</a> — " + esc(s.name) + "</li>"; }).join("") + "</ul></details>" +
      '<p class="muted">Search results via ' + esc((r.providers && r.providers.searchName) || "—") + '. Speed data via Google PageSpeed Insights. Map data © OpenStreetMap contributors / Geoapify. FODO did not use any private analytics or account data.</p></section>';
    var el = $("xr-report"); el.innerHTML = h; el.hidden = false;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function synList(t, arr) { return arr && arr.length ? "<h3>" + t + "</h3><ul>" + arr.map(function (x) { return "<li>" + esc(x.text) + " " + evBtn(x.evidence, "Evidence") + "</li>"; }).join("") + "</ul>" : ""; }
  function checksTable(cs) { return '<table class="xr-t xr-checks"><thead><tr><th>Check</th><th>Result</th><th>Score</th><th>Why</th></tr></thead><tbody>' + cs.map(function (c) { return '<tr class="' + c.status + '"><td>' + esc(c.name) + "<br><small class=\"muted\">" + esc(c.group) + "</small></td><td><span class=\"xr-st " + c.status + "\">" + ({ pass: "Pass", warn: "Warning", fail: "Fail", na: "n/a" }[c.status]) + "</span> " + lbl(c.label) + "</td><td>" + (c.score == null ? "—" : c.score) + "</td><td>" + esc(c.detail) + " " + evBtn(c.evidence, "Evidence") + "</td></tr>"; }).join("") + "</tbody></table>"; }
  function pagesTable(list) { return '<table class="xr-t"><thead><tr><th>Page</th><th>Status</th><th>Type</th><th>Title</th><th>Words</th></tr></thead><tbody>' + list.map(function (p) { return "<tr><td><a href=\"" + esc(p.finalUrl) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(p.finalUrl.replace(/^https?:\/\/(www\.)?/, "")) + "</a></td><td>" + (p.error ? esc(p.error) : p.status) + (p.noindex ? " · noindex" : "") + "</td><td>" + esc(p.type) + "</td><td>" + esc(p.title) + "</td><td>" + p.words + "</td></tr>"; }).join("") + "</tbody></table>"; }
  function serpTable(s) { return s.length ? '<table class="xr-t"><thead><tr><th>Search</th><th>Intent</th><th>Your position</th><th>Who shows up</th></tr></thead><tbody>' + s.map(function (x) { return "<tr><td>" + esc(x.q) + "</td><td>" + esc(x.intent) + "</td><td>" + (x.ok ? x.ourPos ? "#" + x.ourPos : "not in top 10" : "unavailable") + "</td><td>" + esc(x.competitors.slice(0, 3).map(function (c) { return c.domain; }).concat(x.directories.slice(0, 2).map(function (d) { return d.host; })).join(", ")) + " " + evBtn(x.evidence, "Results") + "</td></tr>"; }).join("") + '</tbody></table><p class="muted">Positions come from ' + esc((report && report.providers && report.providers.searchName) || "the search provider") + ' at the time of the X-Ray — a snapshot for one country, not a ranking report.</p>' : ""; }
  function kwTable(k) { return '<table class="xr-t"><thead><tr><th>Search</th><th>Intent</th><th>Volume</th><th>Your position</th><th>Competitors in top 10</th><th>Opportunity</th></tr></thead><tbody>' + k.map(function (x) { return "<tr><td>" + esc(x.keyword) + "</td><td>" + esc(x.intent) + "</td><td>" + (x.volume != null ? x.volume.toLocaleString("en-IN") + " " + lbl("ESTIMATED") : "Data unavailable") + "</td><td>" + (x.ourPos ? "#" + x.ourPos : "—") + "</td><td>" + x.competitorsInTop10 + '</td><td><span class="xr-op ' + x.opportunity.toLowerCase() + '">' + x.opportunity + "</span></td></tr>"; }).join("") + "</tbody></table>"; }
  function compCard(c) { var p = c.profile, i = c.insights; return '<div class="panel xr-comp"><h3>' + esc(c.name) + ' <small class="muted">' + esc(c.domain) + '</small></h3><p class="muted">Why a competitor: ' + esc(c.reason) + " · confidence <b>" + esc(c.confidence) + "</b> (" + c.score + "/100) · source: " + esc(c.source.join(", ")) + "</p>" +
    '<dl class="xr-dl sm"><div><dt>Headline</dt><dd>' + esc(p.headline || "—") + "</dd></div><div><dt>CTA</dt><dd>" + esc(p.ctas.join(" · ") || "—") + "</dd></div><div><dt>Pricing</dt><dd>" + (p.pricing ? esc(p.pricingSamples.join(", ") || "shown") : "not shown") + "</dd></div><div><dt>Trust</dt><dd>" + esc([p.testimonials && "testimonials", p.faq && "FAQ"].concat(p.trust.slice(0, 3)).filter(Boolean).join(" · ") || "—") + "</dd></div></dl>" +
    '<div class="xr-ins"><div><b>Competitor advantage</b><ul>' + (i.advantages.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") || "<li class=muted>None found</li>") + "</ul></div><div><b>Competitor weakness</b><ul>" + (i.weaknesses.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") || "<li class=muted>None found</li>") + "</ul></div></div><p><b>Opportunity:</b> " + esc(i.opportunity) + "</p>" + evBtn(c.evidence) + ' <a class="xr-tool" href="' + esc(c.url) + '" target="_blank" rel="noopener noreferrer nofollow">Visit site ↗</a></div>'; }
  function voiceBlock(v) {
    var blk = function (t, arr) { return '<div class="panel"><h3>' + t + "</h3>" + (arr && arr.length ? "<ul>" + arr.slice(0, 4).map(function (g) { return "<li><b>" + esc(g.theme) + "</b> · " + g.count + " mention(s)" + (g.quotes[0] ? '<br><q class="muted">' + esc(g.quotes[0].text) + "</q> <small>— " + esc(g.quotes[0].source) + "</small> " + evBtn([].concat.apply([], g.quotes.map(function (q) { return q.evidence || []; })), "Sources") : "") + "</li>"; }).join("") + "</ul>" : '<p class="muted">Nothing found in the sample.</p>') + "</div>"; };
    return '<p class="muted">From ' + v.snippets + " public text snippets (search-result excerpts, forum previews, and testimonials on your own site — clearly marked). Not a survey.</p>" + (v.marketOpportunity ? '<p class="lead"><b>Market opportunity:</b> ' + esc(v.marketOpportunity) + " " + lbl("INFERRED") + "</p>" : "") + '<div class="grid g2 xr-voice">' + blk("Top customer needs", v.needs) + blk("Top customer complaints", v.complaints) + blk("Top buying triggers", v.triggers) + blk("Top objections", v.objections) + "</div>";
  }
  function psiBlock(p) { return '<div class="xr-psi">' + (p.screenshot ? '<img src="' + esc(p.screenshot) + '" alt="Mobile screenshot of the homepage from Google PageSpeed Insights" width="160" loading="lazy">' : "") + '<div><b>Google PageSpeed (mobile)</b><ul class="xr-mini">' + [["Performance", p.performance], ["SEO", p.seo], ["Accessibility", p.accessibility], ["Best practices", p.bestPractices]].map(function (x) { return '<li class="' + tone(x[1]) + '"><b>' + (x[1] == null ? "—" : x[1]) + "</b><span>" + x[0] + "</span></li>"; }).join("") + "</ul>" + (p.field ? '<p class="muted">Real-user data (Chrome UX Report): LCP ' + (p.field.lcpMs / 1000).toFixed(1) + " s · " + esc(p.field.overall) + "</p>" : '<p class="muted">No real-user (CrUX) data for this site — lab test only.</p>') + "</div></div>"; }
  function presenceBlock(r) {
    var p = r.presence; if (!p) return '<p class="muted">Not checked.</p>';
    var L = Object.keys(p.listings);
    return '<dl class="xr-dl"><div><dt>Platforms showing you in search</dt><dd>' + (p.searched ? (L.length ? L.map(function (k) { return '<a href="' + esc(p.listings[k].url) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(k) + "</a>"; }).join(" · ") : "None in the top 10 for your name") : '<span class="muted">Data unavailable (no search provider)</span>') + "</dd></div>" +
      "<div><dt>Social profiles linked on your site</dt><dd>" + (Object.keys(p.siteSocials).join(" · ") || "None") + "</dd></div><div><dt>Public ratings seen</dt><dd>" + (p.ratings.length ? p.ratings.map(function (x) { return x.value + "/5" + (x.count ? " (" + x.count + ")" : "") + " — " + esc(x.host); }).join("; ") : p.searched ? "None visible in the sample" : "Data unavailable") + "</dd></div>" +
      "<div><dt>Phone numbers on the site</dt><dd>" + p.phoneCount + (p.phoneCount > 2 ? " — check they are all current (consistency)" : "") + "</dd></div><div><dt>Map listing</dt><dd>" + (p.mapListing ? p.mapListing.none ? "Not found on the open map data searched" : esc(p.mapListing.name + " — " + p.mapListing.address) + " (" + esc(p.mapListing.source) + ")" : '<span class="muted">Not checked</span>') + '</dd></div></dl><p class="muted">Google Business Profile insights (views, calls) need the owner\'s login — FODO never claims them from public data.</p>';
  }
  function evItem(e) { return '<li id="ev-' + esc(e.id) + '"><b>' + esc(e.id) + "</b> " + lbl(e.label) + " " + esc(e.claim) + (e.evidenceText ? '<br><span class="muted">“' + esc(e.evidenceText) + "”</span>" : "") + '<br><small class="muted">' + esc(e.sourceName) + (e.sourceUrl ? ' · <a href="' + esc(e.sourceUrl) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(e.sourceUrl.slice(0, 90)) + "</a>" : "") + " · " + esc(new Date(e.retrievedAt).toLocaleString()) + " · confidence " + Math.round(e.confidence * 100) + "%</small></li>"; }

  /* ---------- evidence drawer ---------- */
  document.addEventListener("click", function (e) {
    var b = e.target.closest(".xr-why"); if (!b || !report) return;
    var ids = b.dataset.ev.split(","), items = ids.map(function (id) { return report.evidence.filter(function (x) { return x.id === id; })[0]; }).filter(Boolean);
    var d = $("xr-evd"); d.querySelector(".cfx-body,.xr-evd-b").innerHTML = "<ol class=\"xr-evlist\">" + items.map(evItem).join("") + "</ol>" + (items.some(function (x) { return x.screenshotUrl === "psi:screenshot"; }) && report.psi && report.psi.screenshot ? '<img src="' + esc(report.psi.screenshot) + '" alt="Mobile screenshot from Google PageSpeed" style="max-width:200px">' : "");
    d.hidden = false; d.querySelector(".xr-evd-x").focus();
  });
  document.addEventListener("click", function (e) { if (e.target.closest("[data-evx]")) $("xr-evd").hidden = true; });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("xr-evd").hidden) $("xr-evd").hidden = true; });

  /* ---------- exports ---------- */
  var stamp = function () { return new Date().toISOString().slice(0, 10); };
  var fname = function (ext) { return "FODO-Business-XRay-" + ((report && report.business.domain) || "report").replace(/[^a-z0-9.-]/gi, "-") + "-" + stamp() + "." + ext; };
  var oppRows = function () { return [["Rank", "ID", "Priority", "Priority score", "Title", "Category", "Why (detail)", "Fix", "Impact", "Effort", "Urgency", "Confidence", "Label", "Affected pages", "Evidence IDs", "Sources", "FODO tool"]].concat(report.opportunities.map(function (o) { return [o.rank, o.id, o.priority, o.priorityScore, o.title, o.category, o.description, o.recommendation, o.impact, o.effort, o.urgency, o.confidence, o.label, o.affectedPages.join(" "), o.evidence.join(" "), o.source.join("; "), o.tool ? o.tool[0] : ""]; })); };
  var planRows = function () { var out = [["Week", "Focus", "Problem", "Action", "Expected impact", "Opportunity ID", "Evidence IDs", "FODO tool"]]; report.plan.forEach(function (w) { w.items.forEach(function (i) { out.push([w.label, w.focus, i.problem, i.action, i.expectedImpact, i.opportunity, i.evidence.join(" "), i.tool ? i.tool[0] : ""]); }); }); return out; };
  var safe = function (rows) { return rows.map(function (r) { return r.map(function (v) { if (typeof v === "number") return v; v = String(v == null ? "" : v); return /^[=+\-@\t\r]/.test(v) && !/^[+\-][\d\s().]+$/.test(v) ? "'" + v : v; }); }); };
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-x]"); if (!b || !report) return;
    var k = b.dataset.x;
    if (!X) return;
    if (k === "pdf") { var blob; try { blob = X.pdf(pdfBlocks(report), { title: "FODO Business X-Ray - " + report.business.name.value, footer: "FODO Business X-Ray - " + report.input.url + " - " + new Date(report.createdAt).toLocaleDateString() }); } catch (er) { if (window.console) console.error(er); return; } X.deliver(blob, fname("pdf"), { kind: "PDF" }); }
    if (k === "csv") X.deliver(X.csv(safe(oppRows())), fname("csv").replace(".csv", "-findings.csv"), { kind: "CSV" });
    if (k === "plan") X.deliver(X.csv(safe(planRows())), fname("csv").replace(".csv", "-30-day-plan.csv"), { kind: "CSV" });
    if (k === "json") X.deliver(new Blob([JSON.stringify(report, null, 1)], { type: "application/json" }), fname("json"), { kind: "JSON" });
    if (k === "xlsx") {
      var A = report.scores.areas;
      X.deliver(X.xlsx([
        { name: "Summary", header: false, widths: [32, 100], rows: [["FODO Business X-Ray"], ["Website", report.input.url], ["Business", report.business.name.value], ["Date", new Date(report.createdAt).toLocaleString()], ["Overall Growth Health", report.scores.overall == null ? "Data unavailable" : report.scores.overall], ["Status", report.scores.status], []].concat(Object.keys(A).map(function (k2) { return [A[k2].name, A[k2].score == null ? "Data unavailable" : A[k2].score]; })).concat([[], ["Executive summary", report.synthesis.executiveSummary], ["Written by", report.synthesisBy]]), boldRows: [0] },
        { name: "Opportunities", rows: safe(oppRows()), freezeCols: 5 }, { name: "30-day plan", rows: safe(planRows()) },
        { name: "Checks", rows: safe([["ID", "Area", "Group", "Check", "Result", "Score", "Label", "Detail", "Evidence IDs"]].concat(report.checks.map(function (c) { return [c.id, c.area, c.group, c.name, c.status, c.score == null ? "" : c.score, c.label, c.detail, c.evidence.join(" ")]; }))) },
        { name: "Competitors", rows: safe([["Name", "Domain", "Confidence", "Score", "Why", "Advantages", "Weaknesses", "Opportunity", "Headline", "Pricing shown"]].concat(report.competitors.map(function (c) { return [c.name, c.domain, c.confidence, c.score, c.reason, c.insights.advantages.join("; "), c.insights.weaknesses.join("; "), c.insights.opportunity, c.profile.headline, c.profile.pricing ? "Yes" : "No"]; }))) },
        { name: "Searches", rows: safe([["Search", "Intent", "Your position", "Opportunity", "Volume"]].concat(report.keywords.map(function (x) { return [x.keyword, x.intent, x.ourPos || "", x.opportunity, x.volume == null ? "Data unavailable" : x.volume]; }))) },
        { name: "Pages", rows: safe([["URL", "Status", "Type", "Title", "Meta description", "H1", "Words", "Noindex"]].concat(report.crawl.list.map(function (p) { return [p.finalUrl, p.status || p.error, p.type, p.title, p.meta, p.h1, p.words, p.noindex ? "yes" : ""]; }))) },
        { name: "Evidence", rows: safe([["ID", "Label", "Claim", "Evidence", "Source", "URL", "Retrieved"]].concat(report.evidence.map(function (x) { return [x.id, x.label, x.claim, x.evidenceText, x.sourceName, x.sourceUrl, x.retrievedAt]; }))) },
      ], { title: "FODO Business X-Ray" }), fname("xlsx"), { kind: "Excel" });
    }
    if (k === "share") { var u = location.origin + ROOT + "business-x-ray/?r=" + report.jobId; (X.copyText ? X.copyText(u, "Copy the share link") : navigator.clipboard.writeText(u)).then(function (h) { if (h === "copied") { var o = b.textContent; b.textContent = "Link copied ✓"; setTimeout(function () { b.textContent = o; }, 2000); } }); }
    track("xray_export", { kind: k });
  });
  /* the PDF is built from the report data (structured text), not from a screenshot of the page */
  function pdfBlocks(r) {
    var B = r.business, A = r.scores.areas, syn = r.synthesis, out = [], P = function (o) { out.push(o); };
    var ev = function (ids) { ids = (ids || []).filter(Boolean); return ids.length ? " [Evidence: " + ids.slice(0, 6).join(", ") + "]" : ""; };
    var opp = function (id) { return oppById(r, id); };
    P({ h1: "FODO Business X-Ray: " + B.name.value }); P({ p: r.input.url + " | " + new Date(r.createdAt).toLocaleString() + " | " + r.crawl.pages + " pages read", muted: true });
    P({ pill: "Overall Growth Health " + (r.scores.overall == null ? "-" : r.scores.overall + "/100") + " | " + r.scores.status + " | based on " + r.scores.basedOn + " of " + r.scores.of + " areas" });
    P({ h2: "1. Executive Summary" }); P({ p: syn.executiveSummary }); P({ p: "Written by: " + r.synthesisBy, muted: true, size: 8.5 });
    if (syn.doingWell && syn.doingWell.length) { P({ h3: "Doing well" }); P({ li: syn.doingWell.map(function (x) { return x.text + ev(x.evidence); }) }); }
    if (syn.holdingBack && syn.holdingBack.length) { P({ h3: "Holding it back" }); P({ li: syn.holdingBack.map(function (x) { return x.text + ev(x.evidence); }) }); }
    P({ h2: "2. Overall Growth Health" });
    ["market", "website", "search", "trust", "conversion", "competitive"].forEach(function (k) { var a = A[k]; P({ h3: a.name + ": " + (a.score == null ? "Data unavailable" : a.score + "/100") + "  (data quality " + a.quality + ")" }); if (a.components.length) P({ li: a.components.map(function (c) { return c.name + ": " + (c.score == null ? "-" : c.score); }) }); if (a.note) P({ p: a.note, muted: true, size: 9 }); });
    P({ h2: "3. Business Overview" });
    P({ kv: [["Name", B.name.value + " (" + B.name.label + ")"], ["Industry", (B.industry.value || "Could not be reliably determined") + " (" + B.industry.label + ")"], ["Business model", B.model.value + " (" + B.model.label + ")"], ["Locations", (B.locations.value || []).join(", ") || "Unknown"], ["Services", (B.services.value || []).slice(0, 8).join(", ") || "Unknown"], ["Main headline", B.valueProp.value || "None found"], ["Prices seen", (B.pricing.value || []).join(", ") || "None found"], ["Contact", [B.contacts.phones.join(", "), B.contacts.emails.join(", "), B.contacts.address].filter(Boolean).join(" | ") || "None found"]] });
    var first = r.opportunities[0];
    P({ h2: "4. Biggest Problem" }); P({ p: first ? first.title + " - " + first.description + ev(first.evidence) : "No major problem found.", bold: !!first });
    P({ h2: "5. Top 5 Actions" });
    var top5 = (syn.doFirst && syn.doFirst.length ? syn.doFirst.map(opp).filter(Boolean) : []).concat(r.opportunities).filter(function (o, i, a) { return a.indexOf(o) === i; }).slice(0, 5);
    P({ li: top5.map(function (o, i) { return (i + 1) + ". [" + o.priority + "] " + o.title + " - " + o.recommendation + ev(o.evidence) + (o.tool ? " | FODO tool: " + o.tool[0] : ""); }) });
    P({ h2: "6. Biggest Opportunities" });
    [["Top 3 immediate fixes", r.top.immediate], ["Top 5 growth opportunities", r.top.growth], ["Top 5 strategic opportunities", r.top.strategic]].forEach(function (g) {
      var os = g[1].map(opp).filter(Boolean); if (!os.length) return; P({ h3: g[0] });
      os.forEach(function (o) { P({ p: "[" + o.priority + " | score " + o.priorityScore + "] " + o.title, bold: true }); P({ kv: [["Why", o.description || "-"], ["Fix", o.recommendation], ["Impact / effort", "Impact " + o.impact + "/5, effort " + o.effort + "/5, urgency " + o.urgency + "/5, confidence " + Math.round(o.confidence * 100) + "% (" + o.label + ")"], ["Evidence", (o.evidence || []).join(", ") || "-"], ["Pages", (o.affectedPages || []).slice(0, 4).join(" ") || "-"]] }); });
    });
    P({ h2: "7. 30-Day Action Plan" });
    r.plan.forEach(function (w) { P({ h3: w.label + " - " + w.focus }); P({ li: w.items.length ? w.items.map(function (i) { return "Problem: " + i.problem + ". Action: " + i.action + ". Expected impact: " + i.expectedImpact + ev(i.evidence); }) : ["Nothing left for this week - measure results."] }); });
    P({ h2: "8. Website & Search" });
    P({ p: r.crawl.pages + " pages read | robots.txt " + (r.crawl.robotsFound ? "found" : "not found") + " | sitemap " + (r.crawl.sitemapFound ? "found" : "not found") + (r.psi ? " | PageSpeed mobile performance " + r.psi.performance + "/100" : " | Speed: " + (r.psiError || "not measured")) });
    P({ li: r.checks.filter(function (c) { return c.status === "fail" || c.status === "warn"; }).slice(0, 25).map(function (c) { return (c.status === "fail" ? "FAIL" : "WARN") + " - " + c.name + ": " + c.detail + ev(c.evidence); }) });
    if (r.keywords.length) { P({ h3: "Searches checked" + (r.volumes ? "" : " (search volume: data unavailable)") }); P({ li: r.keywords.map(function (k) { return k.keyword + " | " + k.intent + " | your position: " + (k.ourPos ? "#" + k.ourPos : "not in top 10") + " | opportunity: " + k.opportunity + (k.volume != null ? " | volume " + k.volume + " (estimated)" : ""); }) }); }
    P({ h2: "9. Competitors" });
    if (r.competitors.length) r.competitors.forEach(function (c) { P({ h3: c.name + " (" + c.domain + ") - confidence " + c.confidence }); P({ kv: [["Why a competitor", c.reason], ["Their advantages", c.insights.advantages.join("; ") || "None found"], ["Their weaknesses", c.insights.weaknesses.join("; ") || "None found"], ["Opportunity", c.insights.opportunity], ["Source", c.source.join(", ")]] }); });
    else P({ p: (r.modules.COMPETITORS || {}).note || "No competitors confirmed.", muted: true });
    P({ h2: "10. Customer Voice" });
    if (r.voice) { P({ p: "From " + r.voice.snippets + " public text snippets (search-result excerpts, not full reviews). Data quality " + r.voice.quality + ".", muted: true }); [["Needs", r.voice.needs], ["Complaints", r.voice.complaints], ["Buying triggers", r.voice.triggers], ["Objections", r.voice.objections]].forEach(function (g) { if (g[1] && g[1].length) { P({ h3: g[0] }); P({ li: g[1].slice(0, 4).map(function (t) { return t.theme + " (" + t.count + ")" + (t.quotes[0] ? ': "' + t.quotes[0].text + '" - ' + t.quotes[0].source : ""); }) }); } }); }
    else P({ p: "Data unavailable.", muted: true });
    P({ h2: "11. AI Visibility (sampled)" });
    P({ p: r.visibility ? r.visibility.tested + " questions asked to one open model (" + r.visibility.model + "); your brand appeared in " + r.visibility.brandIn + ", competitors in " + r.visibility.compIn + ". A small sample - not your total AI visibility." : "Data unavailable." });
    P({ h2: "12. Data Quality & Sources" });
    P({ kv: Object.keys(r.dataQuality).map(function (k) { return [k, r.dataQuality[k]]; }) });
    var un = Object.keys(r.modules).filter(function (k) { return r.modules[k].status !== "ok"; });
    if (un.length) { P({ h3: "Unavailable" }); P({ li: un.map(function (k) { return k.replace(/_/g, " ").toLowerCase() + ": " + r.modules[k].note; }) }); }
    var used = {}; r.opportunities.slice(0, 15).forEach(function (o) { o.evidence.forEach(function (id) { used[id] = 1; }); });
    P({ h3: "Evidence behind the top findings" });
    P({ li: r.evidence.filter(function (e) { return used[e.id]; }).slice(0, 80).map(function (e) { return e.id + " [" + e.label + "] " + e.claim + (e.evidenceText ? ' - "' + e.evidenceText.slice(0, 220) + '"' : "") + " | " + e.sourceName + (e.sourceUrl ? " | " + e.sourceUrl : ""); }) });
    P({ p: "Every number in this report comes from the website crawl or a named data source. Nothing is estimated unless marked ESTIMATED. The full evidence list is in the Excel / JSON export.", muted: true, size: 8.5 });
    return out;
  }

  /* ---------- shared report link ---------- */
  if (qs.get("r")) {
    status("Loading the saved X-Ray…", "busy");
    call("report/" + encodeURIComponent(qs.get("r")), undefined, { tries: 2 }).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(r.status === 404 ? "This report was not found or has expired." : "Could not load the report.")); })
      .then(function (rep) { report = rep; $("xr-url").value = rep.input.url; render(rep); status("Saved X-Ray from " + new Date(rep.createdAt).toLocaleString() + ". Run it again for fresh data.", "ok"); }, function (e) { status(e.message, "warn"); });
  }
  window.FODO_XRAY = { report: function () { return report; }, run: run };
})();
