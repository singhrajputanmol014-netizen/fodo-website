/* FODO Business X-Ray, page controller: runs the job stage by stage against /api/xray/*, reports REAL progress
   (a stage is ticked only when it has actually finished), renders the evidence-backed report, exports it.
   Analysis lives in js/xray-engine.js; downloads use js/cf-export.js. Nothing from other websites is ever inserted as HTML:
   every outside string goes through esc(). */
(function () {
  "use strict";
  var E = window.FODO_XRAY_ENGINE; if (!E) return;
  var U = window.FODO_UTIL || {}, ROOT = U.root || "/", X = window.FODO_EXPORT;
  var $ = function (id) { return document.getElementById(id); };
  var form = $("xr-form"); if (!form) return;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var track = function (n, p) { try { if (window.FODO_TRACK) window.FODO_TRACK(n, p || {}); } catch (e) {} };
  var STAGES = [["DISCOVERY", "Understanding the business"], ["CRAWLING", "Reading the website"], ["MARKET_RESEARCH", "Researching the market"], ["COMPETITORS", "Finding & comparing competitors"], ["CUSTOMER_RESEARCH", "Listening to customers"], ["SEO", "Search & technical check"], ["CONVERSION", "Conversion, presence & AI answers"], ["OPPORTUNITIES", "Scoring & prioritising"], ["SYNTHESIS", "Writing the diagnosis"]];
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var busy = false, report = null, log = [];
  /* v13 plans: the server sends this X-Ray's limits + features with the job (accounts on). No limits = accounts off = the classic free X-Ray. */
  var ACC = window.FODO_ACCOUNT, BASE = Object.assign({}, E.CFG), me = null, curJob = null;
  var hasF = function (rep, f) { return !rep || !rep.features || rep.features.indexOf(f) > -1; };
  var PLAN_OF = { fullReport: "Starter", export: "Starter", history: "Starter", compare: "Growth", contentGap: "Growth", moreVoice: "Growth", volume: "Growth", techStack: "Pro", deepCompetitors: "Pro", externalLinks: "Pro", authority: "Pro", whiteLabel: "Agency", clients: "Agency", bulk: "Agency" };
  var lockCard = function (what, f) { return '<div class="panel xr-lock" role="note"><span class="tag">' + esc(PLAN_OF[f] || "Starter").toUpperCase() + ' PLAN</span><p><b>' + esc(what) + "</b> " + "is part of the " + esc(PLAN_OF[f] || "Starter") + ' plan and above. The findings above are real and complete; this section shows the full detail.</p><a class="btn sm" data-upg="' + esc(f) + '" href="' + ROOT + 'plans/">See plans</a></div>'; };
  /* v17.1 funnel events: upgrade clicks from locked sections, "talk to FODO" clicks after the report */
  document.addEventListener("click", function (e) { var a = e.target.closest && e.target.closest("[data-upg]"); if (a) { track("upgrade_click", { tool: a.dataset.upg }); try { if (ACC && ACC.current()) ACC.api("event", { kind: "upgrade_click", detail: a.dataset.upg }); } catch (x) {} }
    var c = e.target.closest && e.target.closest('#xr-report [data-route="contact"], #xr-report .xr-tool[href*="services/"]'); if (c) track("service_cta_click", { tool: "xray" }); });

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
    return function (url, opt) {
      if (memo[url]) return memo[url];
      var slow = !!(opt && opt.slow);   // the home page: the server waits longer once for slow shared hosting
      return memo[url] = call("fetch", slow ? { jobId: jobId, url: url, slowRetry: true } : { jobId: jobId, url: url }, { tries: slow ? 1 : 2, timeout: slow ? 55000 : 30000 }).then(function (r) {
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
  function status(t, kind) { var s = $("xr-status"); s.textContent = t; s.className = "cf-status" + (kind ? " " + kind : ""); toParent({ fodo: "xray-status", text: String(t).slice(0, 200), kind: kind || "" }); }
  /* v30: embedded by FODO Brain (same site, ?embed=1) → tell the Brain what happens; nothing is sent to any other site */
  function toParent(msg) { try { if (qs && qs.get("embed") === "1" && window.parent && window.parent !== window) window.parent.postMessage(msg, location.origin); } catch (e) {} }
  function stageUI(done, cur, note) {
    $("xr-progress").hidden = false;
    var pct = Math.round(done.length / STAGES.length * 100);
    $("xr-bar").style.width = pct + "%"; $("xr-bar").parentNode.setAttribute("aria-valuenow", pct); $("xr-pct").textContent = pct + "% · " + done.length + " of " + STAGES.length + " stages done";
    $("xr-stages").innerHTML = STAGES.map(function (s) { var st = done.indexOf(s[0]) > -1 ? "done" : s[0] === cur ? "now" : ""; return '<li class="' + st + '"><i aria-hidden="true"></i><span>' + esc(s[1]) + (s[0] === cur && note ? ' <small class="muted">' + esc(note) + "</small>" : "") + "</span></li>"; }).join("");
  }

  /* ---------- the job ---------- */
  function upsell(t) { var u = $("xr-up"); u.innerHTML = "<p><b>" + esc(t) + '</b></p><div class="btn-row"><a class="btn" href="' + ROOT + 'plans/">See plans &amp; packs</a></div>'; u.hidden = false; }
  function run(over) {
    if (busy) return Promise.resolve(null);
    var input = { url: $("xr-url").value.trim(), industry: $("xr-industry").value.trim(), city: $("xr-city").value.trim(), name: $("xr-name").value.trim(), country: $("xr-country").value, product: $("xr-product").value.trim(), audience: $("xr-audience").value.trim() };
    if (over) input = Object.assign(input, over);
    if (!input.url) { status("Enter the website address to X-Ray.", "warn"); $("xr-url").focus(); return Promise.resolve(null); }
    if ($("xr-client") && $("xr-client").value) input.client = $("xr-client").value;
    if ($("xr-bg") && $("xr-bg").checked && !$("xr-bgwrap").hidden && (!over || over.toolRun)) input.background = true;
    busy = true; log = []; curJob = null; $("xr-run").disabled = true; $("xr-report").hidden = true; $("xr-report").innerHTML = ""; $("xr-up").hidden = true;
    status("Starting the X-Ray…", "busy");
    var begin = function (again) { return callJ("start", input, { tries: 2 }).then(function (j) {
      if (j._status === 401 && j.login && ACC && !again) { status("Log in to run the X-Ray, it's free.", "busy"); track("tool_login_required", { tool: "xray" }); return ACC.login(j.reason).then(function () { return begin(true); }, function () { throw Object.assign(new Error("Log in (free) to run a Business X-Ray."), { user: true }); }); }
      return j; }); };
    return begin(false).then(function (j) {
      if (j._status === 402 && j.upgrade) { upsell(j.reason); throw Object.assign(new Error(j.reason), { user: true, quiet: true }); }
      if (!j.ok) throw Object.assign(new Error(j.reason || "Could not start"), { user: true });
      curJob = j.jobId; if (ACC && j.credit) ACC.me(true);
      delete input.background;
      if (j.background) { track("xray_start", { domain: j.jobId, mode: "background" }); if (window.FODO_TOOL) window.FODO_TOOL("start", "xray"); return watch(j.jobId, j.stages); }
      if (j.bgNote) status(j.bgNote, "warn");
      track("xray_start", { domain: E.domainOf(input.url.indexOf("://") < 0 ? "https://" + input.url : input.url) }); if (window.FODO_TOOL) window.FODO_TOOL("start", "xray");
      delete input.toolRun;
      return execute(j, Object.assign(input, { url: j.jobId && input.url }));
    }).then(function (rep) {
      busy = false; $("xr-run").disabled = false; report = rep; render(rep); status(rep.crawl.blocked ? "Limited X-Ray complete, the site blocked FODO's reader (" + rep.crawl.blocked.error + "), so this uses Google Search and PageSpeed data. " + rep.opportunities.length + " opportunities found." : "X-Ray complete: " + rep.crawl.pages + (rep.crawl.pages === 1 ? " page read, " : " pages read, ") + rep.opportunities.length + " opportunities found.", "ok"); track("xray_complete", { score: rep.scores.overall }); if (window.FODO_TRACK) window.FODO_TRACK("tool_complete", { tool: "xray" });
      try { history.replaceState(null, "", location.pathname + "?r=" + rep.jobId + (qs.get("tool") ? "&tool=" + encodeURIComponent(qs.get("tool")) : "") + (qs.get("embed") === "1" ? "&embed=1" : "")); } catch (e) {}
      toParent({ fodo: "xray-done", ok: true, jobId: rep.jobId, domain: rep.business && rep.business.domain, score: rep.scores && rep.scores.overall, opportunities: rep.opportunities.length });
      return rep;
    }, function (e) {
      busy = false; $("xr-run").disabled = false; toParent({ fodo: "xray-done", ok: false, error: String((e && e.message) || "X-Ray stopped").slice(0, 200) });
      status(e.user ? e.message : "The X-Ray stopped: " + (e.message || "unknown error") + ". Please try again.", "warn"); track("xray_fail", {});
      // the site could not be read at all → give the X-Ray credit back (the server checks that almost nothing was used)
      if (curJob && e.refundable && ACC) callJ("refund", { jobId: curJob }, { tries: 1 }).then(function (j) { if (j.refunded) { status(e.message + " Your X-Ray credit was returned.", "warn"); ACC.me(true); } }, function () {});
      return null;
    });
  }

  /* v19: a background X-Ray, the runner builds the report; this tab only watches the real job state (and can be closed) */
  function watch(jobId, stages) {
    try { history.replaceState(null, "", location.pathname + "?r=" + jobId + (qs.get("tool") ? "&tool=" + encodeURIComponent(qs.get("tool")) : "")); } catch (e) {}
    status("Running in the background, you can close this tab. The report will be in your account and we'll email you.", "busy");
    return new Promise(function (resolve, reject) {
      var tries = 0, tick = function () {
        call("status/" + jobId, undefined, { tries: 1 }).then(function (r) { return r.json(); }).then(function (s) {
          if (!s.ok) throw new Error(s.reason || "status");
          stageUI(s.completedModules || [], s.status === "COMPLETE" ? null : s.currentStage, s.note);
          if (s.status === "COMPLETE") return call("report/" + encodeURIComponent(jobId), undefined, { tries: 3 }).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("The report is saved but could not be opened, reload the page.")); }).then(resolve, reject);
          if (s.status === "FAILED") return reject(Object.assign(new Error(s.note || "The background X-Ray could not finish."), { user: true }));
          if (s.note) status(s.note, "busy");
          setTimeout(tick, 4000);
        }).catch(function () { if (++tries > 30) return reject(new Error("Lost contact with the X-Ray service. The report will still appear in your account when it is ready.")); setTimeout(tick, 6000); });
      }; tick();
    });
  }
  function execute(job, input) {
    var jobId = job.jobId, P = job.providers || {}, ev = new E.Evidence(), done = [], modules = {}, fetcher = makeFetcher(jobId), t0 = Date.now();
    var L = job.limits || null, FE = L ? L.features : null, has = function (f) { return !FE || FE.indexOf(f) > -1; };
    E.CFG = Object.assign({}, BASE, L ? { MAX_PAGES: L.MAX_PAGES, MAX_COMPETITORS: L.MAX_COMPETITORS, MAX_QUERIES: L.MAX_QUERIES, MAX_TOTAL_RUNTIME: L.MAX_TOTAL_RUNTIME } : {});
    var COMP_PAGES = L ? L.COMP_PAGES : 2, AIQ = L ? L.AI_QUESTIONS : 4;
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
    /* v17 local listings: Google Maps results via Serper (rating, reviews, website). null = unavailable (never guessed) */
    var placesQ = function (q) { if (P.search !== "serper") return Promise.resolve(null); return callJ("places", { jobId: jobId, q: q, country: S.country || input.country }, { tries: 1, timeout: 20000 }).then(function (j) { return j._status === 200 && j.ok ? j : null; }, function () { return null; }); };
    var lib = null, freeLib = function () { return lib = lib || import(ROOT + "js/free-places.js"); };
    var psiP = callJ("psi", { jobId: jobId, url: startUrl, strategy: "mobile" }, { tries: 1, timeout: 90000 }).then(function (j) { return j._status === 200 ? E.parsePSI(j) : (S.psiError = j.reason || "unavailable", null); }, function () { S.psiError = "PageSpeed did not answer"; return null; });

    var bad = function (r) { return r.error || !r.status || r.status >= 400; };
    var altUrl = function (u) { try { var x = new URL(u); x.hostname = /^www\./.test(x.hostname) ? x.hostname.slice(4) : "www." + x.hostname; return x.toString(); } catch (e) { return u; } };
    /* v14 FODO Edge (Agency + owner logins): 4 AI drafting tools, each grounded in this X-Ray's own data */
    var edgeCalls = function () {
      if (!L || !P.ai) return [];
      var B = S.B, opp = (S.opps || []).slice(0, 20).map(function (o) { return { id: o.id, title: o.title, priority: o.priority, impact: o.impact, effort: o.effort, fix: o.recommendation, detail: E._u.clip(o.description, 160) }; });
      var pages = S.blocked ? [] : S.crawl.pages.filter(function (p) { return !p.error && !(p.status >= 400) && !p.noindex && !/privacy|terms|cookie|legal|disclaimer|refund-policy/i.test(p.finalUrl || ""); }).sort(function (a, b) { return (a.depth || 0) - (b.depth || 0); }).slice(0, 8)
        .map(function (p) { return { url: p.finalUrl, type: p.type, title: p.title, meta: p.metaDescription, h1: (p.h1 || [])[0] || "", text: E._u.clip(p.text, 400) }; });
      var biz = { name: B.name.value, domain: B.domain, industry: B.industry.value, city: B.city, services: (B.services.value || []).slice(0, 8), prices: (B.pricing.value || []).slice(0, 5), claims: (B.usp.value || []).slice ? (B.usp.value || []).slice(0, 5) : B.usp.value, headline: B.offer.headline };
      var comps = (S.comps || []).map(function (c) { return { domain: c.domain, name: c.name, why: c.reason, theirAdvantages: c.insights.advantages, theirWeaknesses: c.insights.weaknesses, headline: c.profile.headline, pricesShown: c.profile.pricing, prices: c.profile.pricingSamples, testimonials: c.profile.testimonials, faq: c.profile.faq }; });
      var jobs = [["fixPack", { business: biz, pages: pages, searches: (S.kw || []).slice(0, 10).map(function (k) { return k.keyword; }) }, pages.length],
        ["battleCards", { you: Object.assign({}, biz, { strengths: (S.checks || []).filter(function (c) { return c.status === "pass" && c.weight >= 2; }).slice(0, 6).map(function (c) { return c.name; }) }), competitors: comps }, comps.length],
        ["roadmap90", { business: biz, opportunities: opp }, opp.length],
        ["clientPitch", { business: biz, overallScore: S.scores.overall, opportunities: opp.slice(0, 8), competitors: comps.map(function (c) { return c.name; }) }, opp.length]];
      S.edge = {};
      return jobs.filter(function (j) { return has(j[0]) && j[2]; }).map(function (j) {
        return callJ("edge", { jobId: jobId, kind: j[0], pack: j[1] }, { tries: 2, timeout: 90000 }).then(function (r) { S.edge[j[0]] = r.ok ? r.result : { error: r.reason || "unavailable" }; S.edgeModel = r.model || S.edgeModel; }, function () { S.edge[j[0]] = { error: "AI did not answer" }; });
      });
    };
    return stage("DISCOVERY", function () {
      return fetcher(E.normUrl(startUrl), { slow: true }).then(function (r) { return bad(r) && !/blocked: /.test(r.error || "") ? fetcher(E.normUrl(altUrl(startUrl))).then(function (r2) { return bad(r2) ? r : r2; }) : r; }).then(function (r) {
        if (bad(r)) {
          if (/blocked: /.test(r.error || "")) throw Object.assign(new Error("That address cannot be X-Rayed: " + r.error.replace(/^blocked: /, "")), { fatal: true });
          // the site turns our reader away (bot protection), carry on with what Google and PageSpeed can see
          S.blocked = { status: r.status || 0, error: r.error || "HTTP " + r.status, finalUrl: r.finalUrl || startUrl };
          if (!P.search) throw Object.assign(new Error("The website did not let FODO read it (" + S.blocked.error + ") and no search provider is connected, so there is nothing to X-Ray. Try again later."), { fatal: true });
          return search(E.domainOf(startUrl)).then(function (res) {
            S.blockSerp = res;
            if (!res || !res.web.some(function (w) { return w.domain === E.domainOf(startUrl); })) throw Object.assign(new Error((S.searchErrors || []).some(function (x) { return /budget is used up/.test(x); }) ? "The website did not let FODO read it (" + S.blocked.error + ") and today's search limit is used up, so FODO could not look it up in search either. Try again tomorrow, or run it from an owner account." : "The website did not let FODO read it (" + S.blocked.error + ") and it could not be found in search either. Check the address."), { fatal: true });
            S.quick = E.discoverFromSearch(input, E.domainOf(startUrl), res, new E.Evidence());
            stageUI(done, "DISCOVERY", S.quick.name.value + " · limited X-Ray (site blocks automated readers)");
          });
        }
        S.firstUrl = r.finalUrl; S.homeRaw = { body: r.body, headers: r.headers };
        var pg = E.parsePage(r.body, startUrl, r); pg.depth = 0;
        S.quick = E.discover({ pages: [pg] }, input, new E.Evidence());
        stageUI(done, "DISCOVERY", S.quick ? (S.quick.name.value + (S.quick.industry.value ? " · " + S.quick.industry.value : "")) : "");
      });
    }).then(function () {
      if (modules.DISCOVERY && modules.DISCOVERY.status === "error") throw Object.assign(new Error(modules.DISCOVERY.note), { user: true, refundable: true });
      return stage("CRAWLING", function () {
        if (S.blocked) {
          S.crawl = E.emptyCrawl(E.normUrl(startUrl), S.blocked); S.B = E.discoverFromSearch(input, E.domainOf(startUrl), S.blockSerp, ev); S.country = input.country || E.guessCountry(S.B, startUrl);
          modules.CRAWLING = { status: "unavailable", note: "The website answered " + S.blocked.error + " to every request from FODO's reader (bot protection), so its pages could not be checked. Speed, search, competitors and customer voice still ran." };
          return;
        }
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
        var mq = B.local && (B.city || input.city) ? ((input.product || B.services.value[0] || B.industry.value || "").trim() + " in " + (input.city || B.city)).trim() : "";
        var marketP = mq.length > 6 ? placesQ(mq).then(function (j) { S.placesMarket = j; return j ? j.items.filter(function (x) { return x.website; }).map(function (x) { return { name: x.name, website: x.website, address: x.address, rating: x.rating, reviews: x.reviews, category: x.category, source: "Google Maps (via Serper)" }; }) : []; }) : Promise.resolve([]);
        return Promise.all([placesP, marketP]).then(function (pl) {
          var places = pl[0].concat(pl[1].filter(function (x) { return !pl[0].some(function (y) { return y.website && E.domainOf(/^https?:/.test(y.website) ? y.website : "https://" + y.website) === E.domainOf(x.website); }); }));
          S.places = places;
          var cands = E.candidates(S.serpA || [], target, places, SN).slice(0, Math.max(8, E.CFG.MAX_COMPETITORS + 4));
          if (!cands.length) { modules.COMPETITORS = { status: "unavailable", note: P.search ? "No competitor websites showed up in the searches." : "Needs a search provider or map listings." }; S.comps = []; return; }
          return progress("COMPETITORS", "", cands.map(function (c) { return c.domain; })).then(function () {
            var T = S.blocked ? { terms: E._terms(B.snippetText || B.name.value, 50), bigrams: [], text: E._u.low(B.snippetText || "") } : E.compProfile(S.crawl.pages.filter(function (p) { return !p.error; }).slice(0, 3)), maxS = cands[0].score, res = [], i = 0;
            S.T = T;
            var worker = function () {
              var c = cands[i++]; if (!c) return Promise.resolve();
              stageUI(done, "COMPETITORS", "reading " + c.domain);
              var home = c.urls[0] ? new URL(c.urls[0]).origin + "/" : "https://" + c.domain + "/";
              return fetcher(home).then(function (r) {
                if (r.error || r.status >= 400 || !r.body) return;
                var hp = E.parsePage(r.body, home, r); hp.depth = 0;
                var pats = [/pric|plans|packag/, /servic|product|solution|treatment|menu|course/, /about|why-|story/, /review|testimon|case|work|portfolio/, /faq|help/, /blog|insight|article|resource/, /contact/], picked = [];
                pats.forEach(function (re) { var l = hp.internalLinks.filter(function (x) { return re.test(x.url) && picked.indexOf(x.url) < 0 && E.normUrl(x.url) !== E.normUrl(home); })[0]; if (l) picked.push(l.url); });
                picked = picked.slice(0, Math.max(0, COMP_PAGES - 1));
                if (has("techStack")) (S.compTech = S.compTech || {})[c.domain] = E.techStack(r.body, r.headers);
                return Promise.all(picked.map(function (u2) { return fetcher(u2).then(function (r2) { return r2.body && !r2.error && !(r2.status >= 400) ? E.parsePage(r2.body, u2, r2) : null; }); })).then(function (more) { return [hp].concat(more.filter(Boolean)); }).then(function (pages) {
                  var C = E.compProfile(pages); if (!C) return;
                  var cmp = E.compareCompetitor(T, C, c, B.city, maxS), ins = S.blocked ? { advantages: [], weaknesses: [], opportunity: "Your own pages could not be read, so a side-by-side comparison was not possible. What they show: " + ([C.pricing && "prices", C.testimonials && "testimonials", C.faq && "an FAQ", C.blog && "a blog"].filter(Boolean).join(", ") || "none of prices, testimonials, FAQ or blog") + "." } : E.compInsights(T, C);
                  var nm = (hp.og.site_name || (hp.title || "").split(/\s[|–—\-:]\s/).pop() || c.domain).trim().slice(0, 60);
                  var evid = ev.add({ type: "competitor", claim: nm + " (" + c.domain + "): " + cmp.reason, sourceUrl: C.url, sourceName: c.sources.join(" + ") + " + their website", pageUrl: C.url, evidenceText: "Headline: “" + (C.headline || "—") + "” · Title: " + C.title, label: "OBSERVED" });
                  res.push({ pagesRead: pages.length, name: nm, domain: c.domain, url: C.url, source: c.sources, reason: cmp.reason, confidence: cmp.confidence, score: cmp.score, overlaps: cmp, profile: C, insights: ins, queries: c.queries, evidence: [evid].concat((c.evidence || []).slice(0, 2)) });
                });
              }).then(worker, worker);
            };
            return Promise.all([worker(), worker(), worker()]).then(function () {
              S.comps = res.filter(function (c) { return c.score >= 25 || c.overlaps.serviceOverlap >= 0.06; }).sort(function (a, b) { return b.score - a.score; }).slice(0, E.CFG.MAX_COMPETITORS);
              S.positioning = S.comps.length && !S.blocked ? E.positioning(T, S.comps.map(function (c) { return c.profile; })) : null;
              if (S.blocked) S.T = null;
              if (has("contentGap") && !S.blocked && S.comps.length >= 2) S.gap = E.contentGap(S.crawl.pages.filter(function (p) { return !p.error; }).map(function (p) { return [p.title, p.metaDescription, (p.h1 || []).join(" "), ((p.headings || {}).h2 || []).join(" "), ((p.headings || {}).h3 || []).join(" "), (p.text || "").slice(0, 20000)].join(" "); }).join(" "), S.comps);
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
        if (!P.search) { S.voice = E.voice(items, S.B ? E.entityContext(S.B, input) : null); modules.CUSTOMER_RESEARCH = { status: items.length ? "partial" : "unavailable", note: "Public reviews and discussions need a search provider." }; return; }
        var qs = S.queries.filter(function (q) { return q.kind === "voice"; }), ectx = E.entityContext(B, input); S.voiceOut = [];
        if (has("moreVoice") && L) { var nm0 = B.name.value, svc0 = (input.product || B.services.value[0] || B.industry.value || "").trim(); [nm0 + " complaints", nm0 + " customer experience", svc0 && svc0 + " problems customers face"].filter(Boolean).forEach(function (q) { if (!qs.some(function (x) { return x.q.toLowerCase() === q.toLowerCase(); })) qs.push({ q: q, kind: "voice" }); }); }
        return Promise.all(qs.map(function (q) { return search(q.q).then(function (res) {
          if (!res) return;
          res.web.filter(function (r) { return !res.discussions.some(function (d) { return d.url === r.url; }); }).concat(res.discussions.map(function (d) { return { url: d.url, description: [d.question, d.description, d.top].join(". "), host: d.domain, title: d.title, forum: d.forum }; })).concat(res.faq.map(function (f) { return { url: f.url, description: f.question + " " + f.answer, host: f.domain, title: f.question }; })).forEach(function (r) {
            if (r.domain === B.domain) return;
            var txt = [r.description].concat(r.extra || []).join(". "); if (!txt || txt.length < 30) return;
            // v17.2: don't let another company with the same name into this business's customer voice
            var who = E.aboutUs([r.title, txt].join(" "), r.url, ectx);
            if (!who.ok) { S.voiceOut.push({ url: r.url, title: r.title || r.host || "", why: who.why }); return; }
            var id = ev.add({ type: "voice", claim: "Public text from " + (r.host || E.domainOf(r.url)), sourceUrl: r.url, sourceName: (r.forum ? r.forum + ": " : "") + (r.host || "search result") + " (via " + SN + ")", evidenceText: txt });
            items.push({ text: txt, url: r.url, source: r.host || E.domainOf(r.url), evidence: [id] });
          });
        }); })).then(function () { S.voice = E.voice(items, S.B ? E.entityContext(S.B, input) : null); modules.CUSTOMER_RESEARCH = { status: items.length ? "ok" : "unavailable", note: items.length ? "Based on " + items.length + " public snippets (search-result excerpts, not full reviews)." : "No public reviews or discussions came back from the searches." }; });
      });
    }).then(function () {
      return stage("SEO", function () {
        stageUI(done, "SEO", "waiting for Google PageSpeed (up to 60 s)");
        return Promise.race([psiP, sleep(75000).then(function () { S.psiError = "PageSpeed took too long"; return null; })]).then(function (psi) {
          S.psi = psi; S.tech = E.techChecks(S.crawl, S.B, psi, ev);
          var siteText = S.blocked ? (S.B.snippetText || "") : S.crawl.pages.map(function (p) { return (p.title || "") + " " + (p.h1 || []).join(" ") + " " + ((p.headings || {}).h2 || []).join(" ") + " " + (p.metaDescription || ""); }).join(" ");
          var volP = P.seo && has("volume") && S.serpA ? callJ("seo", { jobId: jobId, keywords: S.serpA.filter(function (s) { return s.kind !== "brand" && s.kind !== "voice"; }).map(function (s) { return s.q; }), location: input.country || "India" }).then(function (j) { return j.ok ? j.items : null; }, function () { return null; }) : Promise.resolve(null);
          if (has("techStack") && S.homeRaw) S.techStack = E.techStack(S.homeRaw.body, S.homeRaw.headers);
          var lcP = Promise.resolve(null);
          if (has("externalLinks") && !S.blocked && (!L || L.LINKCHECK)) {
            var ext = {}; S.crawl.pages.forEach(function (p) { (p.externalLinks || []).forEach(function (l) { if (/^https?:\/\//i.test(l.url) && !/^https?:\/\/(wa\.me|api\.whatsapp\.com)/i.test(l.url)) (ext[l.url.split("#")[0]] = ext[l.url.split("#")[0]] || []).push(p.finalUrl); }); });
            var urls = Object.keys(ext).slice(0, L ? L.LINKCHECK : 40), chunks = []; for (var ci = 0; ci < urls.length; ci += 40) chunks.push(urls.slice(ci, ci + 40));
            stageUI(done, "SEO", "checking " + urls.length + " outgoing links");
            lcP = chunks.reduce(function (pr, ch) { return pr.then(function (acc) { return callJ("linkcheck", { jobId: jobId, urls: ch }, { tries: 1, timeout: 60000 }).then(function (j) { return j.ok ? Object.assign(acc, j.status) : acc; }, function () { return acc; }); }); }, Promise.resolve({})).then(function (stt) {
              var bad = Object.keys(stt).filter(function (u) { var c = stt[u]; return c === 0 || c === 404 || c === 410 || c >= 500; }), shy = Object.keys(stt).filter(function (u) { var c = stt[u]; return c === 401 || c === 403 || c === 429 || c === 999; });
              S.extLinks = { checked: Object.keys(stt).length, found: Object.keys(ext).length, broken: bad.map(function (u) { return { url: u, status: stt[u], on: ext[u].slice(0, 3) }; }), refused: shy.length };
            });
          }
          var gscP = L && ((ACC && ACC.current()) || job.bg) ? callJ("gsc", { jobId: jobId }, { tries: 1, timeout: 60000 }).then(function (j) { S.gsc = j; }, function () { S.gsc = { ok: false, reason: "Search Console did not answer." }; }) : Promise.resolve();
          var auP = has("authority") && P.authority ? callJ("authority", { jobId: jobId, domains: [S.B.domain].concat((S.comps || []).map(function (c) { return c.domain; })) }, { tries: 1, timeout: 20000 }).then(function (j) { S.authority = j.ok ? j.items : null; }, function () {}) : Promise.resolve();
          return Promise.all([volP, lcP, auP, gscP]).then(function (x) { var vol = x[0]; S.volumes = vol; S.kw = S.serpA ? E.keywordOpps(S.serpA, siteText, vol) : []; });
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
        var brandPl = B.local || S.placesMarket ? placesQ((B.name.value + " " + (input.city || B.city || "")).trim()).then(function (j) { S.placesBrand = j; }) : Promise.resolve();
        // AI visibility (prompt §37): the same buyer questions to every connected AI engine
        var vqs = S.queries.filter(function (q) { return q.kind === "category" || q.kind === "best"; }).map(function (q) { return /^best /i.test(q.q) ? "What are the " + q.q + "? Please recommend specific businesses." : "Which businesses would you recommend for " + q.q + "?"; });
        if (AIQ > vqs.length) S.queries.filter(function (q) { return q.kind === "pricing" || q.kind === "alternatives" || q.kind === "problem"; }).forEach(function (q) { vqs.push(q.kind === "alternatives" ? "What are good " + q.q + "? Name specific businesses." : q.kind === "pricing" ? "Who offers good value for " + q.q.replace(/ price| pricing/i, "") + "? Name specific businesses." : q.q.replace(/^how to choose /i, "Which provider should I choose for ") + "? Name specific businesses."); });
        vqs = vqs.slice(0, AIQ);
        var visP = P.ai && vqs.length ? callJ("ai", { jobId: jobId, mode: "visibility", pack: { questions: vqs } }, { tries: 1, timeout: 90000 }).then(function (j) { S.vis = j.ok ? E.visibility(j.answers, B, (S.comps || []).map(function (c) { return { name: c.name, domain: c.domain }; })) : null; }, function () { S.vis = null; }) : Promise.resolve();
        if (P.ai && vqs.length) stageUI(done, "CONVERSION", "asking AI assistants " + vqs.length + " buyer questions");
        return Promise.all([placeP, brandPl, visP]).then(function (x) { var place = x[0];
          S.presence = E.presence(B, brand && brand.res, place, SN);
          var pr = S.presence;
          if (pr.searched) {
            var rc = pr.ratings.length ? { id: "R_offsite", area: "trust", group: "Off-site reviews", name: "Public rating found in search results", status: pr.ratings[0].value >= 4.2 ? "pass" : pr.ratings[0].value >= 3.6 ? "warn" : "fail", score: Math.round(pr.ratings[0].value / 5 * 100), weight: 2, detail: pr.ratings.map(function (r) { return r.value + "/5" + (r.count ? " (" + r.count + " reviews)" : "") + " on " + r.host; }).join("; "), evidence: [ev.add({ type: "reviews", claim: "Public ratings in search snippets", sourceUrl: pr.ratings[0].url, sourceName: pr.ratings[0].host + " (via " + SN + ")", evidenceText: pr.ratings.map(function (r) { return r.value + "/5 " + (r.count || "") + " " + r.host; }).join(" · ") })], label: "OBSERVED", pages: [] }
              : { id: "R_offsite", area: "trust", group: "Off-site reviews", name: "Public rating found in search results", status: "warn", score: 40, weight: 1, detail: "No rating appeared in the search results for your name, reviews may exist but weren't visible in this sample.", evidence: brand && brand.evidence || [], label: "INFERRED", pages: [] };
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
        if (S.presence && S.presence.excluded && S.presence.excluded.length >= 2) extra.push({ key: "D_nameClash", detail: S.presence.excluded.length + " results in the search for your name are about a different company with the same name (e.g. “" + (S.presence.excluded[0].title || S.presence.excluded[0].url).slice(0, 70) + "”). People and AI assistants can confuse you with them, and a weak own-name ranking may be partly this, not only SEO.", evidence: brand ? brand.evidence : [], label: "OBSERVED" });
        if (S.blocked) extra.push({ key: "W_blocked", detail: "Every request from FODO's reader got " + S.blocked.error + ". Search engines and AI assistants may be turned away the same way.", evidence: [ev.add({ type: "technical", claim: "The website refused FODO's reader", pageUrl: S.blocked.finalUrl, evidenceText: S.blocked.error + " (tried with FODO's own agent and a standard “compatible” agent" + ", with and without www)", label: "OBSERVED" })], label: "INFERRED" });
        if (!S.blocked && !Object.keys(B.socials).length) extra.push({ key: "D_social", detail: "No social profile links found on the site.", evidence: [], label: "OBSERVED" });
        var hi = (S.kw || []).filter(function (k) { return k.opportunity === "High"; });
        if (hi.length) extra.push({ key: "K_gap", detail: hi.length + " high-opportunity search(es): " + hi.slice(0, 3).map(function (k) { return "“" + k.keyword + "”"; }).join(", ") + ".", evidence: [].concat.apply([], hi.slice(0, 3).map(function (k) { return k.evidence || []; })), label: "INFERRED" });
        S.compMetrics = S.T && S.comps && S.comps.length ? E.competitiveMetrics(S.T, S.comps.map(function (c) { return c.profile; })) : [];
        var behind = S.compMetrics.filter(function (m) { return m.you < m.median; });
        if (behind.length >= 3) extra.push({ key: "M_compGap", detail: "Behind the competitor median on: " + behind.map(function (m) { return m.name.split(/ — |: /)[0]; }).join(", ") + ".", evidence: [].concat.apply([], S.comps.map(function (c) { return c.evidence.slice(0, 1); })), label: "OBSERVED" });
        if (S.positioning && S.positioning.sameAsEveryone.length >= 2) extra.push({ key: "M_sameMessage", detail: "Your headline phrases also used by competitors: " + S.positioning.sameAsEveryone.slice(0, 5).map(function (x) { return "“" + x + "”"; }).join(", ") + ".", evidence: B.offer.evidence.concat(S.comps.slice(0, 2).map(function (c) { return c.evidence[0]; })), label: "INFERRED" });
        var cmpl = S.voice && S.voice.complaints[0];
        if (S.extLinks && S.extLinks.broken.length) { var bl = S.extLinks.broken; extra.push({ key: "X_extBroken", detail: bl.length + " of " + S.extLinks.checked + " outgoing links checked do not work: " + bl.slice(0, 3).map(function (b) { return b.url.replace(/^https?:\/\//, "").slice(0, 60) + " (" + (b.status || "no answer") + ")"; }).join(", ") + ".", pages: [].concat.apply([], bl.map(function (b) { return b.on; })).filter(function (v, i, a) { return a.indexOf(v) === i; }), evidence: [ev.add({ type: "technical", claim: "Outgoing links that returned an error", pageUrl: bl[0].on[0], evidenceText: bl.slice(0, 10).map(function (b) { return b.url + " → " + (b.status || "no answer"); }).join(" · "), label: "OBSERVED" })], label: "OBSERVED" }); }
        if (S.gap && S.gap.topics.length >= 3) extra.push({ key: "G_contentGap", detail: S.gap.topics.length + " topics most competitors cover but your pages never mention: " + S.gap.topics.slice(0, 5).map(function (t) { return "“" + t.topic + "”"; }).join(", ") + ".", evidence: [].concat.apply([], S.gap.topics.slice(0, 4).map(function (t) { return t.evidence; })).filter(function (v, i, a) { return a.indexOf(v) === i; }).slice(0, 6), label: "INFERRED" });
        if (S.placesBrand || S.placesMarket) { S.local = E.local(S.placesBrand ? S.placesBrand.items : [], S.placesMarket ? S.placesMarket.items : [], B, S.comps || []);
          var lev = ev.add({ type: "listing", claim: "Google Maps results for “" + ((S.placesBrand || S.placesMarket).q) + "”", sourceUrl: "https://www.google.com/maps/search/" + encodeURIComponent((S.placesBrand || S.placesMarket).q), sourceName: "Google Maps results (via Serper)", evidenceText: S.local.me ? S.local.me.name + ": " + (S.local.me.rating != null ? S.local.me.rating + "★, " + (S.local.me.reviews || 0) + " reviews" : "no rating") : "Your business was not among the results", label: "OBSERVED" });
          S.local.evidence = [lev];
          if (B.local && S.placesBrand && !S.local.me) extra.push({ key: "L_noListing", detail: "Searching Google Maps for “" + S.placesBrand.q + "” did not show your business.", evidence: [lev], label: "OBSERVED" });
          if (S.local.me && (S.local.behindOnRating || S.local.behindOnReviews)) extra.push({ key: "L_weak", detail: "Your listing: " + (S.local.me.rating != null ? S.local.me.rating + "★" : "no rating") + ", " + (S.local.me.reviews || 0) + " reviews · local competitors' median: " + (S.local.medianRating != null ? S.local.medianRating + "★" : "—") + ", " + (S.local.medianReviews || 0) + " reviews (" + S.local.compared + " listings).", evidence: [lev], label: "OBSERVED" }); }
        if (S.vis && S.vis.tested >= 3 && S.vis.brandIn === 0) extra.push({ key: "A_invisible", detail: "None of the " + S.vis.tested + " AI answers named you" + (S.vis.compIn ? "; " + S.vis.compIn + " named a competitor" : "") + ".", evidence: [ev.add({ type: "ai", claim: "AI assistants asked " + S.vis.tested + " buyer questions", sourceName: S.vis.engines.map(function (e) { return e.name; }).join(" + "), evidenceText: S.vis.rows.slice(0, 3).map(function (r) { return r.q + " → " + (r.competitors.join(", ") || "no known business named"); }).join(" · "), label: "OBSERVED" })], label: "INFERRED" });
        if (cmpl && cmpl.count >= 2 && !/^other$/i.test(cmpl.theme)) extra.push({ key: "V_complaint", detail: "Most common complaint theme in public text: “" + cmpl.theme + "” (" + cmpl.count + " mentions).", evidence: [].concat.apply([], cmpl.quotes.map(function (q) { return q.evidence || []; })).slice(0, 4), label: "INFERRED" });
        S.checks = checks;
        S.scores = E.scores(checks, { searchName: SN, serp: serpA, presence: S.presence, reviewCheck: S.reviewCheck, competitive: S.compMetrics, compCount: (S.comps || []).length });
        if (S.blocked) ["conversion", "trust", "competitive"].forEach(function (k) { var a = S.scores.areas[k]; if (a && a.score == null) { a.quality = "UNAVAILABLE"; a.note = "Data unavailable, the website's pages could not be read."; } });
        if (S.blocked) { var wa = S.scores.areas.website; wa.note = "Only Google PageSpeed, the pages themselves could not be read."; if (wa.score != null) wa.quality = "LOW"; }
        S.opps = E.opportunities(checks, extra, ev, { industryId: S.B && S.B.industry && S.B.industry.id });
        S.top = E.pickTop(S.opps); S.plan = E.plan(S.opps);
        // v17 deterministic views of the same findings
        S.leaks = E.leaks(S.opps); S.matrix4 = E.matrix4(S.opps); S.funnel = S.blocked ? null : E.funnel(checks, B.offer.score);
        if (has("roadmapLite")) S.plan90 = E.plan90(S.opps);
        if (has("whyWinning") && S.T && S.comps && S.comps.length) S.why = S.comps.map(function (c) { return E.whyWinning(S.T, c, S.opps, S.serpA); }).filter(Boolean);
        // v14 deterministic extras (each only for the levels that include it)
        S.matrix = S.T && S.comps && S.comps.length ? E.compMatrix(S.T, S.comps, { domain: B.domain }) : null;
        if (has("shareOfVoice")) S.sov = E.shareOfVoice(S.serpA, B.domain, S.comps);
        if (has("keywordMap") && !S.blocked) S.kwMap = E.keywordMap(S.kw, S.crawl.pages);
        if (has("trackingAudit") && S.techStack) S.track = E.trackingAudit(S.techStack, S.compTech, S.homeRaw && S.homeRaw.body);
        if (has("schemaCode")) S.schema = E.schemaCode(B, { country: S.country });
        if (has("adLibrary") && S.comps && S.comps.length) S.ads = E.adLinks(S.comps, S.country);
      });
    }).then(function () {
      var B = S.B;
      return stage("SYNTHESIS", function () {
        if (!P.ai) { modules.SYNTHESIS = { status: "unavailable", note: "AI not connected, summary written by rules from the data." }; S.syn = null; return; }
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
        return Promise.all([
          callJ("ai", { jobId: jobId, mode: "synthesis", pack: { ids: ids, data: data } }, { tries: 2, timeout: 80000 }).then(function (j) { S.syn = j.ok ? j.synthesis : null; S.synDropped = j.dropped || []; S.synModel = j.model || ""; if (!j.ok) modules.SYNTHESIS = { status: "unavailable", note: j.reason || "AI unavailable, rules-based summary shown." }; }, function () { modules.SYNTHESIS = { status: "unavailable", note: "AI did not answer, rules-based summary shown." }; }),
        ].concat(edgeCalls()));
      });
    }).then(function () {
      var rep = assemble(jobId, S, ev, modules, Date.now() - t0);
      rep.completeness = completeness(S, P, L, has);
      rep.tier = L ? L.tier : null; rep.features = FE; rep.limits = L ? { pages: L.MAX_PAGES, competitors: L.MAX_COMPETITORS, compPages: COMP_PAGES } : null; E.CFG = Object.assign({}, BASE);
      // v19: in the background there is no login session, the server already told us which X-Ray to compare with
      var histP = job.bg ? Promise.resolve({ items: job.compareWith ? [{ job_id: job.compareWith, status: "COMPLETE" }] : [] }) : ACC ? ACC.history({ domain: rep.business.domain }) : Promise.resolve({ items: [] });
      return (has("compare") && (ACC || job.bg) && L ? histP.then(function (h) {
        var prev = (h.items || []).filter(function (x) { return x.job_id !== jobId && x.status === "COMPLETE"; })[0]; if (!prev) { rep.compare = { none: true }; return; }
        return call("report/" + encodeURIComponent(prev.job_id), undefined, { tries: 1 }).then(function (r) { return r.ok ? r.json() : null; }).then(function (old) { if (old && old.scores) rep.compare = compareReports(old, rep); }, function () {});
      }, function () {}) : Promise.resolve()).then(function () { return rep; });
    }).then(function (rep) {
      stageUI(done, null); status("Saving your report…", "busy");
      var keep = rep.gsc; delete rep.gsc; var txt = JSON.stringify(rep); rep.gsc = keep;   // Search Console numbers are private: never stored in the shareable report
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

  /* ---------- v13: compare with the last X-Ray of the same site ---------- */
  function compareReports(old, rep) {
    var A0 = old.scores.areas || {}, A1 = rep.scores.areas, k = function (o) { return o.key || o.title; };
    var t0 = (old.opportunities || []).map(k), t1 = rep.opportunities.map(k);
    return { previousJob: old.jobId, previousDate: old.createdAt, overallBefore: old.scores.overall, overallNow: rep.scores.overall, pagesBefore: old.crawl ? old.crawl.pages : null, pagesNow: rep.crawl.pages, tierBefore: old.tier || null,
      areas: Object.keys(A1).map(function (a) { return { name: A1[a].name, before: A0[a] ? A0[a].score : null, now: A1[a].score }; }),
      fixed: (old.opportunities || []).filter(function (o) { return t1.indexOf(k(o)) < 0; }).map(function (o) { return o.title; }),
      added: rep.opportunities.filter(function (o) { return t0.indexOf(k(o)) < 0; }).map(function (o) { return o.title; }) };
  }

  /* ---------- the report object ---------- */
  function rulesSummary(S) {
    var sc = S.scores, a = sc.areas, best = Object.keys(a).filter(function (k) { return a[k].score != null; }).sort(function (x, y) { return a[y].score - a[x].score; });
    var top = S.opps[0];
    return { executiveSummary: S.B.name.value + " scores " + (sc.overall == null ? "—" : sc.overall + "/100") + " on " + sc.basedOn + " of 6 measured areas. Strongest: " + (best[0] ? a[best[0]].name + " (" + a[best[0]].score + ")" : "—") + ". Weakest: " + (best.length ? a[best[best.length - 1]].name + " (" + a[best[best.length - 1]].score + ")" : "—") + "." + (top ? " The first thing to fix: " + top.title.toLowerCase() + "." : ""),
      doingWell: S.checks.filter(function (c) { return c.status === "pass" && c.weight >= 2; }).slice(0, 4).map(function (c) { return { text: c.name + ": " + c.detail, evidence: c.evidence }; }),
      holdingBack: S.opps.slice(0, 4).map(function (o) { return { text: o.title + (o.description ? ": " + o.description : ""), evidence: o.evidence }; }), whyProblem: null,
      competitorsDifferent: (S.comps || []).filter(function (c) { return c.insights.advantages.length; }).slice(0, 3).map(function (c) { return { text: c.name + ": " + c.insights.advantages.slice(0, 2).join("; "), evidence: c.evidence.slice(0, 1) }; }),
      customersWant: S.voice ? (S.voice.needs || []).slice(0, 3).map(function (g) { return { text: g.theme + " (" + g.count + " mentions)", evidence: [].concat.apply([], g.quotes.map(function (q) { return q.evidence || []; })).slice(0, 2) }; }) : [],
      marketOpportunities: S.voice && S.voice.marketOpportunity ? [{ text: S.voice.marketOpportunity, evidence: [] }] : [], doFirst: S.opps.slice(0, 5).map(function (o) { return o.id; }), notPrioritize: S.opps.filter(function (o) { return o.priority === "P3"; }).slice(0, 2).map(function (o) { return { text: o.title, why: "Low impact compared with the items above." }; }), unknowns: [], rules: true };
  }
  /* v17 Data Completeness (prompt §29): how much of the planned research actually came back. A research-quality number, NOT a business score. */
  function completeness(S, P, L, has) {
    var parts = [], add = function (name, w, pct, note) { parts.push({ name: name, weight: w, pct: Math.max(0, Math.min(100, Math.round(pct))), note: note || "" }); };
    var cp = S.blocked ? 0 : S.crawl.pages.length >= 3 ? 100 : S.crawl.pages.length * 33;
    add("Website pages", 25, cp, S.blocked ? "The site blocked FODO's reader (" + S.blocked.error + ")." : S.crawl.pages.length + " pages read");
    add("Speed (Google PageSpeed)", 10, S.psi ? 100 : 0, S.psi ? (S.psi.field ? "Lab + real-user (field) data" : "Lab data only, no sufficient real-user field data for this site") : (S.psiError || "unavailable"));
    var sq = (S.serps || []).length, sok = (S.serps || []).filter(function (x) { return x.res; }).length;
    add("Google search research", 15, !P.search ? 0 : sq ? sok / sq * 100 : 0, !P.search ? "No search provider connected" : (sok < sq && (S.searchErrors || []).some(function (x) { return /budget is used up/.test(x); }) ? "today's search limit (SEARCH_DAILY_CAP) was used up: " : "") + sok + " of " + sq + " searches returned results");
    var want = Math.min(3, E.CFG.MAX_COMPETITORS || 3), nc = (S.comps || []).length;
    add("Competitors", 15, Math.min(100, nc / want * 100), nc + " confirmed (aim: " + want + ")");
    add("Customer voice", 10, S.voice ? (S.voice.snippets >= 5 ? 100 : 60) : 0, S.voice ? S.voice.snippets + " public snippets" : "No public reviews or discussions came back");
    if (S.B && S.B.local) add("Local listings (Google Maps)", 5, S.placesBrand || S.placesMarket ? 100 : 0, S.placesBrand || S.placesMarket ? "Google Maps results via Serper" : "Local listings unavailable");
    add("AI visibility", 10, S.vis ? Math.min(100, S.vis.tested / Math.max(1, S.vis.rows.length) * 100) : 0, S.vis ? S.vis.tested + " AI answers from " + S.vis.engines.length + " engine(s)" : P.ai ? "AI engines did not answer" : "No AI engine connected");
    if (L) add("Google Search Console (your own data)", 10, S.gsc && S.gsc.ok ? 100 : 0, S.gsc && S.gsc.ok ? "Connected: " + S.gsc.property : (S.gsc && S.gsc.reason) || "Not connected, connect it in your account");
    if (P.seo && has("volume")) add("Search volumes (DataForSEO)", 5, S.volumes ? 100 : 0, S.volumes ? "Estimated volumes" : "unavailable");
    var W = parts.reduce(function (a, x) { return a + x.weight; }, 0), overall = Math.round(parts.reduce(function (a, x) { return a + x.pct * x.weight; }, 0) / W);
    return { overall: overall, parts: parts, partial: overall < 70, missing: parts.filter(function (x) { return x.pct < 50; }).map(function (x) { return x.name + ": " + x.note; }), label: "Research-quality indicator, how much planned data was collected. Not a business score." };
  }
  function assemble(jobId, S, ev, modules, ms) {
    var dq = {
      "Business discovery": S.B.industry.label === "OBSERVED" ? "HIGH" : "MEDIUM", "Website crawl": S.blocked ? "UNAVAILABLE" : S.crawl.pages.length >= 10 ? "HIGH" : S.crawl.pages.length >= 3 ? "MEDIUM" : "LOW", "Speed (PageSpeed)": S.psi ? "HIGH" : "UNAVAILABLE",
      "Market research": (S.serps || []).some(function (s) { return s.res; }) ? "MEDIUM" : "UNAVAILABLE", "Competitors": (S.comps || []).length >= 3 ? "MEDIUM" : (S.comps || []).length ? "LOW" : "UNAVAILABLE", "Customer voice": S.voice ? S.voice.quality : "UNAVAILABLE",
      "Search demand (volumes)": S.volumes ? "MEDIUM" : "UNAVAILABLE", "Digital presence": S.presence && S.presence.searched ? "MEDIUM" : "LOW", "AI visibility (sampled)": S.vis ? "LOW" : "UNAVAILABLE", "Competitor traffic": "UNAVAILABLE",
    };
    var syn = S.syn || rulesSummary(S);
    var srcs = {}; ev.list.forEach(function (e) { var k = e.sourceUrl || e.pageUrl; if (k && !srcs[k]) srcs[k] = { url: k, name: e.sourceName, retrievedAt: e.retrievedAt }; });
    var c = S.crawl;
    return {
      leaks: S.leaks || [], matrix4: S.matrix4 || null, funnel: S.funnel || null, plan90: S.plan90 || null, why: S.why || null, local: S.local || null, gsc: S.gsc || null,
      placesSource: S.placesMarket || S.placesBrand ? { q: [S.placesMarket && S.placesMarket.q, S.placesBrand && S.placesBrand.q].filter(Boolean), retrievedAt: (S.placesMarket || S.placesBrand).retrievedAt } : null,
      matrix: S.matrix || null, sov: S.sov || null, kwMap: S.kwMap || null, tracking: S.track || null, schema: S.schema || null, ads: S.ads || null, edge: S.edge && Object.keys(S.edge).length ? S.edge : null, edgeModel: S.edgeModel || "",
      techStack: S.techStack || null, compTech: S.compTech || null, contentGap: S.gap || null, extLinks: S.extLinks || null, authority: S.authority || null,
      version: "xray-1", jobId: jobId, createdAt: new Date().toISOString(), durationMs: ms, input: S.input, providers: S.providers,
      business: S.B, scores: S.scores, checks: S.checks, opportunities: S.opps, top: { immediate: S.top.immediate.map(function (o) { return o.id; }), growth: S.top.growth.map(function (o) { return o.id; }), strategic: S.top.strategic.map(function (o) { return o.id; }) }, plan: S.plan,
      crawl: { blocked: c.blocked || null, pages: c.blocked ? 0 : c.pages.length, list: E.compact(c), robotsFound: c.robotsFound, sitemapFound: c.sitemapFound, sitemapUrls: c.sitemapUrls.length, skippedRobots: c.skippedRobots.length, errors: c.errors.length, limitsHit: c.limitsHit, durationMs: c.durationMs, broken: c.broken.slice(0, 30) },
      psi: S.psi, psiError: S.psiError || "", serps: (S.serpA || []).map(function (s) { return { q: s.q, kind: s.kind, intent: s.intent, ok: s.ok, ourPos: s.ourPos, competitors: s.competitors.slice(0, 5), directories: s.directories.slice(0, 5), evidence: s.evidence }; }),
      keywords: S.kw || [], volumes: !!S.volumes, competitors: (S.comps || []).map(function (x) { var p = x.profile; return { name: x.name, pagesRead: x.pagesRead || 1, domain: x.domain, url: x.url, source: x.source, reason: x.reason, confidence: x.confidence, score: x.score, overlaps: { search: x.overlaps.searchOverlap, service: x.overlaps.serviceOverlap, geo: x.overlaps.geoOverlap, positioning: x.overlaps.positioningSimilarity }, insights: x.insights, evidence: x.evidence,
        profile: { headline: p.headline, title: p.title, meta: p.meta, ctas: p.ctas, pricing: p.pricing, pricingSamples: p.pricingSamples, testimonials: p.testimonials, faq: p.faq, trust: p.trust, schema: p.schema, blog: p.blog, socials: p.socials, offerScore: p.offerScore, whatsapp: p.whatsapp } }; }),
      compMetrics: S.compMetrics || [], positioning: S.positioning, target: S.T ? { offerScore: S.T.offerScore, pricing: S.T.pricing, testimonials: S.T.testimonials, faq: S.T.faq, trust: S.T.trust, blog: S.T.blog } : null,
      voice: S.voice ? { needs: S.voice.needs, complaints: S.voice.complaints, objections: S.voice.objections, triggers: S.voice.triggers, positive: S.voice.positive, snippets: S.voice.snippets, quality: S.voice.quality, marketOpportunity: S.voice.marketOpportunity, excluded: (S.voiceOut || []).slice(0, 8), excludedCount: (S.voiceOut || []).length } : null,
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
      '<p class="xr-meta">Impact ' + o.impact + "/5 · Effort " + o.effort + "/5 · Urgency " + o.urgency + "/5 · Confidence <b title=\"Rule-based: OBSERVED in the data = high, INFERRED from several signals = medium, ESTIMATED or thin data = low\">" + (o.confidence >= 0.8 ? "HIGH" : o.confidence >= 0.55 ? "MEDIUM" : "LOW") + "</b> (" + Math.round(o.confidence * 100) + "%) " + lbl(o.label) + "</p>" +
      '<p><b>Fix:</b> ' + esc(o.recommendation) + "</p>" + (o.affectedPages.length ? '<p class="xr-pages">Pages: ' + o.affectedPages.slice(0, 4).map(function (u) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(u.replace(/^https?:\/\/(www\.)?/, "")) + "</a>"; }).join(", ") + (o.affectedPages.length > 4 ? " +" + (o.affectedPages.length - 4) : "") + "</p>" : "") +
      '<div class="xr-opp-f">' + evBtn(o.evidence) + toolLink(o.tool) + "</div></li>";
  }
  var oppById = function (r, id) { return r.opportunities.filter(function (o) { return o.id === id; })[0]; };
  function secH(n, t, q) { return '<section class="xr-sec" id="xr-s' + n + '"><div class="xr-sec-h"><span class="section-num">' + ("0" + n).slice(-2) + "</span><h2>" + esc(t) + "</h2>" + (q ? dqB(q) : "") + "</div>"; }
  function render(r) {
    var B = r.business, sc = r.scores, A = sc.areas, syn = r.synthesis, h = "", full = hasF(r, "fullReport"), paid = function (f) { return !!r.features && !hasF(r, f); };
    var first = r.opportunities[0], growth = r.top.growth.map(function (id) { return oppById(r, id); }).filter(Boolean)[0] || r.opportunities[1];
    var top5 = (syn.doFirst && syn.doFirst.length ? syn.doFirst.map(function (id) { return oppById(r, id); }).filter(Boolean) : []).concat(r.opportunities).filter(function (o, i, a) { return a.indexOf(o) === i; }).slice(0, 5);
    h += '<div class="xr-hero panel hud"><div><p class="eyebrow">YOUR BUSINESS X-RAY</p><h2 class="xr-name">' + esc(B.name.value) + '</h2><p class="muted">' + esc(r.input.url) + " · " + esc(new Date(r.createdAt).toLocaleString()) + " · " + r.crawl.pages + " pages read</p>" +
      (r.tier ? '<p class="xr-tier"><span class="tag">' + esc(r.tier.toUpperCase()) + " X-RAY</span> up to " + r.limits.pages + " pages · " + r.limits.competitors + " competitors</p>" : "") +
      (r.completeness ? '<p class="xr-dc"><a href="#xr-dcb" title="' + esc(r.completeness.label) + '">Data completeness <b>' + r.completeness.overall + "%</b></a> · Data collected: " + esc(new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })) + "</p>" : "") + '<p class="xr-share" id="xr-share" hidden></p>' +
      (hasF(r, "export") ? '<div class="btn-row xr-acts"><button type="button" class="btn sm" data-x="pdf">Download PDF</button><button type="button" class="btn sm ghost" data-x="xlsx">Excel</button><button type="button" class="btn sm ghost" data-x="csv">Findings CSV</button><button type="button" class="btn sm ghost" data-x="plan">Action plan CSV</button><button type="button" class="btn sm ghost" data-x="share">Copy share link</button><button type="button" class="btn sm ghost" data-x="json">JSON</button></div></div>'
        : '<div class="btn-row xr-acts"><button type="button" class="btn sm ghost" data-x="share">Copy share link</button><a class="btn sm" href="' + ROOT + 'plans/">Unlock PDF &amp; Excel downloads</a></div></div>') +
      '<div class="xr-ring ' + tone(sc.overall) + '" style="--v:' + (sc.overall || 0) + '"><b>' + (sc.overall == null ? "—" : sc.overall) + '</b><small>/100</small></div><div class="xr-ring-l"><b>Digital Growth Health</b><span>' + esc(sc.status) + '</span><small class="muted">Based on ' + sc.basedOn + " of " + sc.of + " areas with data · your online presence, not your sales or profit (FODO can't see those)</small></div></div>";
    if (r.compare && !r.compare.none) { var cm = r.compare, dl = function (a, b) { return a == null || b == null ? "" : b - a > 0 ? ' <b class="xr-plus">+' + (b - a) + "</b>" : b - a < 0 ? ' <b class="xr-minus">' + (b - a) + "</b>" : ' <span class="muted">±0</span>'; };
      h += '<div class="panel hud xr-compare"><span class="tag hot">SINCE YOUR LAST X-RAY</span><p>Compared with ' + esc(new Date(cm.previousDate).toLocaleDateString()) + ': overall <b>' + (cm.overallBefore == null ? "—" : cm.overallBefore) + " → " + (cm.overallNow == null ? "—" : cm.overallNow) + "</b>" + dl(cm.overallBefore, cm.overallNow) + (cm.tierBefore && cm.tierBefore !== r.tier ? ' <small class="muted">(the earlier X-Ray ran on the ' + esc(cm.tierBefore) + " level, so it read a different number of pages)</small>" : "") + '</p><ul class="xr-cmp">' + cm.areas.map(function (a) { return "<li><span>" + esc(a.name) + "</span> " + (a.before == null ? "—" : a.before) + " → " + (a.now == null ? "—" : a.now) + dl(a.before, a.now) + "</li>"; }).join("") + "</ul>" +
        '<div class="grid g2"><div><h3>Fixed since then (' + cm.fixed.length + ")</h3>" + (cm.fixed.length ? "<ul>" + cm.fixed.slice(0, 10).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" : '<p class="muted">None of the earlier issues have gone yet.</p>') + "</div><div><h3>New since then (" + cm.added.length + ")</h3>" + (cm.added.length ? "<ul>" + cm.added.slice(0, 10).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" : '<p class="muted">No new issues.</p>') + "</div></div></div>"; }
    else if (r.compare && r.compare.none) h += '<p class="muted xr-compare-none">This is your first X-Ray of ' + esc(B.domain) + ", run it again after you make changes to see what improved.</p>";
    if (r.crawl.blocked) h += '<div class="panel xr-limited" role="note"><span class="tag">LIMITED X-RAY</span><p><b>' + esc(r.business.domain) + " did not let FODO read its pages</b> (" + esc(r.crawl.blocked.error) + "), many large sites block automated readers. This report uses what Google Search and Google PageSpeed show about the site, plus real competitors and public customer text. Page-level checks (titles, CTAs, forms, trust signals) are <b>Data unavailable</b>, not guessed.</p></div>";
    if (r.completeness && r.completeness.partial) h += '<div class="panel xr-limited" role="note"><span class="tag">PARTIAL ANALYSIS</span><p><b>Data completeness: ' + r.completeness.overall + "%.</b> Some planned research did not come back, so parts of this report say “Data unavailable” instead of guessing. Missing: " + esc(r.completeness.missing.join(" · ")) + "</p></div>";
    h += navBlock(r);
    h += '<div class="grid g3 xr-big"><div class="panel"><span class="tag">BIGGEST PROBLEM</span>' + (first ? "<h3>" + esc(first.title) + '</h3><p class="muted">' + esc(first.description) + "</p>" + evBtn(first.evidence) : "<p>No major problem found.</p>") + '</div><div class="panel"><span class="tag hot">BIGGEST OPPORTUNITY</span>' + (growth ? "<h3>" + esc(growth.title) + '</h3><p class="muted">' + esc(growth.recommendation) + "</p>" + evBtn(growth.evidence) : "<p>—</p>") + '</div><div class="panel"><span class="tag">TOP 5 ACTIONS</span><ol class="xr-top5">' + top5.map(function (o) { return "<li><b>" + esc(o.title) + "</b><br><span class=\"muted\">" + esc(o.recommendation) + "</span></li>"; }).join("") + "</ol></div></div>" + advThreat(r);
    // 1 executive summary
    h += secH(1, "Executive Summary") + '<p class="lead">' + esc(syn.executiveSummary) + '</p><p class="mono muted">Written by: ' + esc(r.synthesisBy) + (r.synthesisDropped.length ? " · " + r.synthesisDropped.length + " AI statement(s) removed because they had no evidence" : "") + "</p>" +
      synList("Doing well", syn.doingWell) + synList("Holding it back", syn.holdingBack) + (syn.whyProblem ? '<h3>Why the problem exists</h3><p>' + esc(syn.whyProblem.text) + " " + evBtn(syn.whyProblem.evidence) + "</p>" : "") + (syn.notPrioritize && syn.notPrioritize.length ? "<h3>Don't prioritise yet</h3><ul>" + syn.notPrioritize.map(function (x) { return "<li><b>" + esc(x.text) + "</b>: " + esc(x.why) + "</li>"; }).join("") + "</ul>" : "") + (syn.unknowns && syn.unknowns.length ? '<h3>Unknown</h3><ul class="muted">' + syn.unknowns.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") + "</section>";
    // 2 overall health (drillable)
    h += secH(2, "Digital Growth Health") + '<div class="xr-tiles">' + ["market", "website", "search", "trust", "conversion", "competitive"].map(function (k) { var a = A[k]; return '<details class="xr-tile ' + tone(a.score) + '"><summary><span>' + esc(a.name) + "</span><b>" + (a.score == null ? "—" : a.score) + "</b>" + (a.score == null ? '<small>Data unavailable</small>' : "") + '</summary><div class="xr-tile-b">' + (a.components.length ? "<ul>" + a.components.map(function (c) { return "<li><span>" + esc(c.name) + "</span><b>" + (c.score == null ? "—" : c.score) + "</b></li>"; }).join("") + "</ul>" : "") + '<p class="muted">' + esc(a.note || "") + "</p>" + dqB(a.quality) + "</div></details>"; }).join("") + "</div><p class=\"muted\">Tap a score to see exactly how it was calculated. Every score is the weighted average of the checks below, nothing is hard-coded.</p></section>";
    // 3 business overview
    var bf = [["Name", B.name], ["Industry", B.industry], ["Business model", B.model], ["Locations", B.locations], ["Audience", B.audience], ["Services / products", B.services], ["Main headline", B.valueProp], ["Prices seen", B.pricing], ["Differentiation claims", B.usp]];
    h += secH(3, "Business Overview", r.dataQuality["Business discovery"]) + '<dl class="xr-dl">' + bf.map(function (f) { var v = f[1] || {}, val = Array.isArray(v.value) ? v.value.join(" · ") : v.value; return "<div><dt>" + f[0] + "</dt><dd>" + (val ? esc(val) : '<span class="muted">Could not be reliably determined from public data.</span>') + " " + lbl(v.label || "UNKNOWN") + " " + (v.evidence && v.evidence.length ? evBtn(v.evidence, "Evidence") : "") + "</dd></div>"; }).join("") +
      "<div><dt>Contact</dt><dd>" + esc([B.contacts.phones.join(", "), B.contacts.emails.join(", "), B.contacts.whatsapp.length ? "WhatsApp" : "", B.contacts.address].filter(Boolean).join(" · ") || "None found") + "</dd></div><div><dt>Social</dt><dd>" + (Object.keys(B.socials).map(function (k) { return '<a href="' + esc(B.socials[k]) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(k) + "</a>"; }).join(" · ") || "None linked") + "</dd></div></dl></section>";
    // 4 market position
    var mk = A.market;
    h += secH(4, "Digital Market Presence", mk.quality) + (mk.score == null ? '<p class="muted">' + esc(mk.note) + "</p>" : '<p>Digital market presence <b>' + mk.score + "</b>/100: " + esc(mk.note) + '</p><p class="muted">How visible you are where your market searches (own name, category searches, listings). It is not a judgement of how good your business is.</p>' + serpTable(r.serps.filter(function (s) { return s.kind !== "voice"; }))) + "</section>";
    // 5 biggest problem
    h += secH(5, "Biggest Problem") + (first ? '<ul class="xr-opps">' + oppCard(first) + "</ul>" : "<p>None found.</p>") + "</section>";
    // 6 website
    h += secH(6, "Website X-Ray", r.dataQuality["Website crawl"]) + (r.crawl.blocked ? '<p class="muted">Pages: Data unavailable, the site answered ' + esc(r.crawl.blocked.error) + ".</p>" : "") + '<p class="muted"' + (r.crawl.blocked ? " hidden" : "") + ">" + r.crawl.pages + " pages read in " + (r.crawl.durationMs / 1000).toFixed(0) + " s · robots.txt " + (r.crawl.robotsFound ? "found" : "not found") + " · sitemap " + (r.crawl.sitemapFound ? "found (" + r.crawl.sitemapUrls + " URLs)" : "not found") + (r.crawl.skippedRobots ? " · " + r.crawl.skippedRobots + " URL(s) skipped because robots.txt disallows them" : "") + (r.crawl.limitsHit.length ? " · limit reached: " + r.crawl.limitsHit.join(", ") : "") + "</p>" +
      (r.psi ? psiBlock(r.psi) : '<p class="muted">Speed: ' + esc(r.psiError || "not measured") + ".</p>") + checksTable(r.checks.filter(function (c) { return c.area === "website"; })) + '<details class="xr-more"><summary>Every page read (' + r.crawl.list.length + ")</summary>" + pagesTable(r.crawl.list) + "</details>" +
      (r.techStack ? "<h3>Technology stack</h3>" + techBlock(r.techStack) + '<p class="muted">' + lbl("OBSERVED") + " Read from your homepage code and server headers. “Not detected” does not prove a tool is missing, some load only after a click or consent.</p>" : paid("techStack") ? lockCard("Technology stack (CMS, analytics, ad pixels, chat, payments)", "techStack") : "") +
      (r.extLinks ? "<h3>Outgoing links</h3>" + (r.extLinks.broken.length ? '<table class="xr-t"><thead><tr><th>Link</th><th>Answer</th><th>Found on</th></tr></thead><tbody>' + r.extLinks.broken.map(function (b) { return '<tr><td><a href="' + esc(b.url) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(b.url.slice(0, 80)) + "</a></td><td>" + (b.status || "no answer") + "</td><td>" + b.on.map(function (u) { return esc(u.replace(/^https?:\/\/(www\.)?/, "")); }).join("<br>") + "</td></tr>"; }).join("") + "</tbody></table>" : "<p>All " + r.extLinks.checked + " outgoing links checked answer normally.</p>") + '<p class="muted">' + r.extLinks.checked + " of " + r.extLinks.found + " outgoing links checked" + (r.extLinks.refused ? " · " + r.extLinks.refused + " site(s) refused automated checks (e.g. LinkedIn), not counted as broken" : "") + ".</p>" : paid("externalLinks") ? lockCard("Broken outgoing links check", "externalLinks") : "") + trackingBlock(r, paid) + schemaBlock(r, paid) + "</section>";
    // 7 SEO / search
    h += secH(7, "SEO / Search X-Ray", A.search.quality) + (r.keywords.length ? (full ? '<p class="muted">' + (r.volumes ? "Search volumes from DataForSEO (ESTIMATED by Google Ads data)." : "Search volume: Data unavailable" + (paid("volume") ? " on this plan." : " (no SEO data provider).") + " Opportunity labels are based on intent, relevance to your pages and whether competitors appear where you don't.") + "</p>" + kwTable(r.keywords) : "<p>" + r.keywords.length + " searches checked · " + r.keywords.filter(function (k) { return k.opportunity === "High"; }).length + " high-opportunity.</p>" + lockCard("The full keyword table (position, competitors, opportunity for every search)", "fullReport")) : '<p class="muted">' + esc(A.search.note) + "</p>") +
      (r.contentGap ? "<h3>Content gap</h3>" + (r.contentGap.topics.length ? '<p class="muted">' + lbl("INFERRED") + " Topics from the titles, headings and menus of " + r.contentGap.compared + " competitors that your pages never mention. Only add the ones you really offer.</p><table class='xr-t'><thead><tr><th>Topic</th><th>Covered by</th><th>Competitors</th></tr></thead><tbody>" + r.contentGap.topics.map(function (t) { return "<tr><td><b>" + esc(t.topic) + "</b></td><td>" + t.count + " of " + t.of + "</td><td>" + esc(t.competitors.join(", ")) + " " + evBtn(t.evidence, "Evidence") + "</td></tr>"; }).join("") + "</tbody></table>" : '<p class="muted">No clear gaps: the topics competitors share already appear on your pages.</p>') : paid("contentGap") ? lockCard("Content gap (topics competitors cover that you don't)", "contentGap") : "") + kwMapBlock(r, paid) + gscBlock(r) + "</section>";
    // 8 competitors
    h += secH(8, "Competitor X-Ray", r.dataQuality.Competitors) + (r.competitors.length ? (full ? matrixBlock(r) + sovBlock(r, paid) + adsBlock(r, paid) + "<h3>Each competitor</h3>" + '<div class="xr-comps">' + r.competitors.map(function (c) { return compCard(c, r.compTech && r.compTech[c.domain]); }).join("") + "</div>" : '<ul class="xr-comp-mini">' + r.competitors.map(function (c) { return "<li><b>" + esc(c.name) + '</b> <small class="muted">' + esc(c.domain) + "</small>: " + esc(c.reason) + "</li>"; }).join("") + "</ul>" + lockCard("Competitor details (their headline, prices, trust signals, advantages and weaknesses)", "fullReport")) +
      (r.authority && r.authority.length ? "<h3>Domain authority</h3><table class='xr-t'><thead><tr><th>Website</th><th>Open PageRank (0–10)</th><th>Global rank</th></tr></thead><tbody>" + r.authority.map(function (a) { return "<tr" + (a.domain === B.domain ? ' class="xr-you"' : "") + "><td>" + esc(a.domain) + (a.domain === B.domain ? " (you)" : "") + "</td><td>" + (a.rank == null ? "Data unavailable" : a.rank.toFixed(1) + " " + lbl("ESTIMATED")) + "</td><td>" + (a.globalRank ? "#" + a.globalRank.toLocaleString("en-IN") : "—") + "</td></tr>"; }).join("") + '</tbody></table><p class="muted">Open PageRank is a free estimate built from links between websites (Common Crawl). It is not Moz DA or Ahrefs DR, and it does not list individual backlinks.</p>' : paid("authority") ? lockCard("Domain authority for you and every competitor", "authority") : "") + (r.compMetrics.length ? "<h3>You vs competitor median</h3>" + '<ul class="xr-bars">' + r.compMetrics.map(function (m) { return "<li><span>" + esc(m.name) + '</span><i style="--v:' + m.score + '" class="' + tone(m.score) + '"></i></li>'; }).join("") + "</ul>" : "") : '<p class="muted">' + esc((r.modules.COMPETITORS || {}).note || "No competitors confirmed.") + "</p>") + whyBlock(r, paid) + '<p><a class="xr-tool" href="' + ROOT + 'competitor-finder/">Find every local or brand competitor in Competitor Finder →</a></p></section>';
    // 9 customer voice
    h += secH(9, "Customer Voice", r.dataQuality["Customer voice"]) + (r.voice ? (full ? voiceBlock(r.voice) : "<p>" + r.voice.snippets + " public snippets read · " + (r.voice.needs || []).length + " needs and " + (r.voice.complaints || []).length + " complaint themes found.</p>" + lockCard("Customer quotes, complaints, buying triggers and objections", "fullReport")) : '<p class="muted">' + esc((r.modules.CUSTOMER_RESEARCH || {}).note || "Data unavailable.") + "</p>") + "</section>";
    // 10 offer & positioning
    var O = B.offer;
    h += secH(10, "Offer & Positioning") + (O.score == null ? '<p class="muted">Offer Strength Score: Data unavailable, the homepage could not be read.</p>' : "") + '<p' + (O.score == null ? ' hidden' : "") + '>Offer Strength Score <b>' + O.score + "</b>/100 " + lbl("INFERRED") + ', does the homepage say <i>who</i> it is for, the <i>problem</i>, the <i>outcome</i> and <i>why you</i>?</p><blockquote class="xr-q">' + esc(O.hero || "(no headline found)") + "</blockquote>" +
      '<ul class="xr-parts">' + ["audience", "problem", "outcome", "differentiation"].map(function (k) { var p = O.parts[k]; return '<li class="' + (p.found ? "ok" : "no") + '"><b>' + k + "</b> " + (p.found ? "“" + esc(p.match) + "”" : "not stated") + "</li>"; }).join("") + "</ul>" + evBtn(O.evidence) +
      (r.positioning ? "<h3>Where you sound like everyone else</h3>" + (r.positioning.sameAsEveryone.length ? "<p>" + r.positioning.sameAsEveryone.map(function (x) { return '<span class="chip">' + esc(x) + "</span>"; }).join(" ") + "</p>" : '<p class="muted">No headline phrases shared with most competitors.</p>') +
        "<h3>White space, claims no competitor makes</h3>" + (r.positioning.whiteSpace.length ? "<ul>" + r.positioning.whiteSpace.map(function (w) { return "<li><b>" + esc(w.claim) + "</b>: " + (w.youHave ? "you already make it: lead with it." : "nobody owns it yet: an opening if it is true for you.") + "</li>"; }).join("") + "</ul>" : '<p class="muted">Competitors cover all the common claims we check.</p>') + '<p class="muted">' + lbl("INFERRED") + " Compared with the " + r.competitors.length + " competitor(s) above.</p>" : '<p class="muted">Positioning comparison needs confirmed competitors.</p>') + "</section>";
    // 11 conversion
    h += secH(11, "Conversion X-Ray", "MEDIUM") + '<p class="muted">Journey: Visitor → Understanding → Trust → Interest → Action. Checks are read from the page HTML; button placement is INFERRED from page order' + (r.psi && r.psi.screenshot ? ", the mobile screenshot below is from Google PageSpeed" : "") + ".</p>" + funnelBlock(r) + leaksBlock(r, full) + checksTable(r.checks.filter(function (c) { return c.area === "conversion" || c.area === "trust"; })) + "</section>";
    // 12 digital presence
    h += secH(12, "Digital Presence", r.dataQuality["Digital presence"]) + localBlock(r) + presenceBlock(r) + "</section>";
    // 13 AI visibility
    h += secH(13, "AI Visibility", r.dataQuality["AI visibility (sampled)"]) + aiBlock(r, full) + "</section>";
    // 14 biggest opportunities
    var grp = function (t, ids) { var os = ids.map(function (id) { return oppById(r, id); }).filter(Boolean); return os.length ? "<h3>" + t + '</h3><ul class="xr-opps">' + os.map(oppCard).join("") + "</ul>" : ""; };
    h += secH(14, "Biggest Opportunities") + grp("Top 3 immediate fixes", r.top.immediate) + (full ? matrix4Block(r) + grp("Top 5 growth opportunities", r.top.growth) + grp("Top 5 strategic opportunities", r.top.strategic) + '<details class="xr-more"><summary>All ' + r.opportunities.length + " opportunities</summary><ul class=\"xr-opps\">" + r.opportunities.map(oppCard).join("") + "</ul></details>" : lockCard("All " + r.opportunities.length + " opportunities with fixes, affected pages and evidence", "fullReport")) + "</section>";
    // 15 top 5 actions
    h += secH(15, "Top 5 Actions") + '<ol class="xr-actions">' + top5.map(function (o) { return "<li><b>" + esc(o.title) + "</b> <span class=\"xr-p " + o.priority.toLowerCase() + "\">" + o.priority + "</span> " + actSel(o.key, o.title) + "<br>" + esc(o.recommendation) + " " + evBtn(o.evidence, "Evidence") + " " + toolLink(o.tool) + "</li>"; }).join("") + '</ol><p class="muted xr-act-note">Mark each action To do / In progress / Done: FODO remembers it' + (ACC && ACC.current() ? " in your account" : " in this browser (log in to keep it everywhere)") + " and keeps it across re-scans of " + esc(B.domain) + '.</p><div class="panel hud xr-help"><div><h3>Want FODO to help implement this?</h3><p class="muted">Our team can fix the top actions for you, pages, speed, Google profile, ads and content, and re-run the X-Ray to show what changed.</p></div><a class="btn" data-route="contact" href="' + ROOT + 'contact/?mode=audit">Talk to FODO</a></div></section>';
    // 16 plan
    h += secH(16, "30-Day Action Plan") + '<div class="xr-plan">' + r.plan.map(function (w) { return '<div class="panel"><span class="tag">' + w.label + "</span><h3>" + esc(w.focus) + "</h3>" + (w.items.length ? "<ul>" + w.items.map(function (i) { return "<li><b>Problem:</b> " + esc(i.problem) + " " + actSel((oppById(r, i.opportunity) || {}).key, i.problem) + "<br><b>Action:</b> " + esc(i.action) + "<br><b>Expected impact:</b> " + i.expectedImpact + " " + evBtn(i.evidence, "Evidence") + "</li>"; }).join("") + "</ul>" : '<p class="muted">Nothing left for this week, use it to measure results.</p>') + "</div>"; }).join("") + "</div>" + roadmapBlock(r, paid) + "</section>";
    // 17 evidence & sources
    h += edgeBlock(r, paid);
    h += secH(17, "Evidence & Sources") + dcBlock(r) + '<div class="xr-dqgrid">' + Object.keys(r.dataQuality).map(function (k) { return "<div><span>" + esc(k) + "</span>" + dqB(r.dataQuality[k]) + "</div>"; }).join("") + "</div>" +
      (Object.keys(r.modules).length ? "<h3>What was unavailable</h3><ul>" + Object.keys(r.modules).filter(function (k) { return r.modules[k].status !== "ok"; }).map(function (k) { return "<li><b>" + esc(k.replace(/_/g, " ").toLowerCase()) + ":</b> " + esc(r.modules[k].note) + "</li>"; }).join("") + "</ul>" : "") +
      '<details class="xr-more"><summary>All ' + r.evidence.length + ' evidence items</summary><ol class="xr-evlist">' + r.evidence.map(evItem).join("") + '</ol></details><details class="xr-more"><summary>' + r.sources.length + " sources</summary><ul>" + r.sources.map(function (s) { return '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(s.url) + "</a>: " + esc(s.name) + "</li>"; }).join("") + "</ul></details>" +
      '<p class="muted">Search results via ' + esc((r.providers && r.providers.searchName) || "—") + '. Speed data via Google PageSpeed Insights. Map data © OpenStreetMap contributors / Geoapify. FODO did not use any private analytics or account data.</p></section>';
    var el = $("xr-report"); el.innerHTML = h; el.hidden = false;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    loadActions(r); loadShare(r);
    var fx = FOCUS[qs.get("focus")]; if (fx && $(fx)) setTimeout(function () { $(fx).scrollIntoView({ behavior: "smooth", block: "start" }); }, 600);
    if (qs.get("tool")) toolView(r, qs.get("tool"));
  }
  /* v15: tell the account which features were used in the browser (admin dashboard); silent, best effort */
  var ping = function (kind, detail) { try { if (ACC && ACC.current()) ACC.api("event", { kind: kind, detail: detail || "" }); } catch (e) {} };
  /* ---------- v14 blocks ---------- */
  var copyBtn = function (id, label) { return '<button type="button" class="btn sm ghost xr-copy" data-copy="' + id + '">' + esc(label || "Copy") + "</button>"; };
  var edgeTag = '<span class="tag hot">FODO EDGE</span>';
  /* ---------- v17 blocks ---------- */
  /* v18: a standalone PRO tool shows only its own part of the research (the full X-Ray stays one click away) */
  var catP = null, catalog = function () { return catP = catP || fetch(ROOT + "api/lab/catalog").then(function (x) { return x.ok ? x.json() : null; }).catch(function () { return null; }); };
  function toolView(r, id) {
    catalog().then(function (c) {
      var t = c && c.ok ? (c.tools || []).filter(function (x) { return x.id === id && x.view; })[0] : null, el = $("xr-report"); if (!t || !el) return;
      var keep = t.view.map(function (n) { return "xr-" + n; }).concat(["xr-s17"]);
      el.classList.add("xr-toolmode"); el.dataset.tool = id;
      el.querySelectorAll("section.xr-sec, section.xr-edge, .xr-big, .xr-big2").forEach(function (s0) { if (keep.indexOf(s0.id) < 0) s0.hidden = true; });
      el.querySelectorAll(".xr-nav a").forEach(function (a) { var tgt = (a.getAttribute("href") || "").replace(/^#/, ""), sec0 = tgt && document.getElementById(tgt); if (sec0 && sec0.hidden) a.hidden = true; });
      var b = document.createElement("div"); b.className = "panel hud xr-toolbar"; b.setAttribute("role", "note");
      b.innerHTML = '<span class="tag hot">PRO TOOL</span><h2>' + esc(t.name) + '</h2><p class="muted">' + esc(t.benefit) + " · from the Business X-Ray of <b>" + esc(r.business.domain) + "</b>, " + esc(new Date(r.createdAt).toLocaleDateString("en-IN")) + ". Every finding links to its evidence.</p>" +
        '<div class="btn-row"><button type="button" class="btn sm ghost" id="xr-toolall">Show the full X-Ray</button><a class="btn sm ghost" href="' + ROOT + "growth-lab/" + esc(id) + '/">About this tool</a></div>';
      el.insertBefore(b, el.firstChild);
      $("xr-toolall").onclick = function () { el.querySelectorAll("[hidden]").forEach(function (x) { if (!x.classList.contains("xr-whyp")) x.hidden = false; }); el.classList.remove("xr-toolmode"); this.remove(); };
      if (t.focus && $(t.focus)) setTimeout(function () { $(t.focus).scrollIntoView({ behavior: "smooth", block: "start" }); }, 500);
      try { if (window.FODO_TOOL) window.FODO_TOOL("complete", id, r.business.domain, true); } catch (e) {}
    });
  }
  var FOCUS = { leaks: "xr-leaks", conversion: "xr-s11", website: "xr-s6", competitors: "xr-s8", why: "xr-whyw", market: "xr-s4", ai: "xr-s13", search: "xr-s7", local: "xr-local", presence: "xr-s12", offer: "xr-s10", plan: "xr-s16", roadmap: "xr-roadmap" };
  var actSel = function (key, title) { if (!key) return ""; return '<select class="xr-act" data-akey="' + esc(key) + '" data-title="' + esc(String(title || "").slice(0, 150)) + '" aria-label="Status of: ' + esc(title) + '"><option value="todo">To do</option><option value="doing">In progress</option><option value="done">Done</option></select>'; };
  var actLocal = function (dom) { try { return JSON.parse(localStorage.getItem("fodo-act:" + dom) || "{}"); } catch (e) { return {}; } };
  /* v17.1 share control: the person who ran the X-Ray can switch the share link off or give it an expiry date */
  function loadShare(r) {
    var el = $("xr-share"); if (!el || !ACC || !ACC.current() || !r.jobId || r.jobId === "sample") return;
    fetch(ROOT + "api/lab/share?jobId=" + encodeURIComponent(r.jobId), { credentials: "same-origin" }).then(function (x) { return x.json(); }).then(function (j) {
      if (!j.ok) return; var cur = j.share === "off" ? "off" : j.share === "until" || j.share === "expired" ? "until" : "on";
      el.innerHTML = '<label>Share link <select id="xr-shsel" aria-label="Who can open the share link"><option value="on">Anyone with the link</option><option value="7">Anyone, for 7 days</option><option value="30">Anyone, for 30 days</option><option value="90">Anyone, for 90 days</option><option value="off">Only me (sharing off)</option></select></label> <small class="muted" id="xr-shnote">' + (j.share === "until" ? "until " + esc(new Date(j.until).toLocaleDateString()) : j.share === "expired" ? "link expired" : "") + "</small>";
      el.hidden = false; var sel = $("xr-shsel"); if (cur === "until") { var o = document.createElement("option"); o.value = "keep"; o.textContent = j.share === "expired" ? "Expired " + new Date(j.until).toLocaleDateString() : "Anyone, until " + new Date(j.until).toLocaleDateString(); sel.insertBefore(o, sel.firstChild); sel.value = "keep"; } else sel.value = cur;
      sel.onchange = function () { if (sel.value === "keep") return; fetch(ROOT + "api/lab/share", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: r.jobId, mode: sel.value }) }).then(function (x) { return x.json(); }).then(function (k) { $("xr-shnote").textContent = k.ok ? (k.share === "off" ? "only you (and the FODO team) can open it" : k.until ? "until " + new Date(k.until).toLocaleDateString() : "anyone with the link") : (k.reason || ""); }); };
    }, function () {});
  }
  function loadActions(r) {
    var dom = r.business.domain, paint = function (m) { document.querySelectorAll("select.xr-act").forEach(function (sel) { var v = m[sel.dataset.akey]; sel.value = v || "todo"; sel.className = "xr-act " + (v || "todo"); }); };
    paint(actLocal(dom));
    if (ACC && ACC.current()) fetch(ROOT + "api/lab/actions?domain=" + encodeURIComponent(dom), { credentials: "same-origin" }).then(function (x) { return x.json(); }).then(function (j) { if (!j.ok) return; var m = actLocal(dom); j.items.forEach(function (it) { m[it.key] = it.status; }); paint(m); }, function () {});
  }
  document.addEventListener("change", function (e) {
    var sel = e.target.closest && e.target.closest("select.xr-act"); if (!sel || !report) return;
    var dom = report.business.domain, m = actLocal(dom); m[sel.dataset.akey] = sel.value; try { localStorage.setItem("fodo-act:" + dom, JSON.stringify(m)); } catch (x) {}
    document.querySelectorAll('select.xr-act[data-akey="' + sel.dataset.akey + '"]').forEach(function (o) { o.value = sel.value; o.className = "xr-act " + sel.value; });
    if (ACC && ACC.current()) fetch(ROOT + "api/lab/actions", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain: dom, key: sel.dataset.akey, status: sel.value, title: sel.dataset.title }) }).catch(function () {});
  });
  document.addEventListener("change", function (e) { var sel = e.target.closest && e.target.closest("#xr-whysel"); if (!sel) return; document.querySelectorAll(".xr-whyp").forEach(function (p) { p.hidden = p.dataset.d !== sel.value; }); ping("why_winning", sel.value); });
  function advThreat(r) {
    var A = r.scores.areas, best = Object.keys(A).filter(function (k) { return A[k].score != null; }).sort(function (x, y) { return A[y].score - A[x].score; })[0], a = best && A[best];
    var good = a && a.score >= 60 ? (a.components || []).slice().sort(function (x, y) { return (y.score || 0) - (x.score || 0); })[0] : null;
    var pass = r.checks.filter(function (c) { return c.status === "pass" && c.weight >= 2; })[0];
    var adv = a && a.score >= 60 ? "<h3>" + esc(a.name) + ": " + a.score + "/100</h3><p class=\"muted\">" + esc(good ? "Best part: " + good.name + (good.score != null ? " (" + good.score + ")" : "") : "") + (pass ? (good ? " · " : "") + esc(pass.name) : "") + "</p>" + (pass ? evBtn(pass.evidence) : "") : '<p class="muted">No area scores 60 or more yet, fix the problems above first.</p>';
    var c = (r.competitors || [])[0], sv = r.sov && r.sov.rows ? r.sov.rows.filter(function (x) { return c && x.domain === c.domain; })[0] : null;
    var thr = c ? "<h3>" + esc(c.name) + ' <small class="muted">' + esc(c.domain) + "</small></h3><p class=\"muted\">Closest competitor (" + c.score + "/100 match)" + (c.insights.advantages.length ? " · they do better: " + esc(c.insights.advantages.slice(0, 2).join("; ")) : "") + (sv ? " · owns " + sv.share + "% of the first page in your market searches" : "") + "</p>" + evBtn(c.evidence) : '<p class="muted">Data unavailable, no competitor could be confirmed.</p>';
    return '<div class="grid g2 xr-big2"><div class="panel"><span class="tag">YOUR STRONGEST ADVANTAGE</span>' + adv + '</div><div class="panel"><span class="tag hot">BIGGEST COMPETITIVE THREAT</span>' + thr + "</div></div>";
  }
  function dcBlock(r) {
    var c = r.completeness; if (!c) return "";
    return '<h3 id="xr-dcb">Data completeness: ' + c.overall + '%</h3><p class="muted">' + esc(c.label) + '</p><table class="xr-t"><thead><tr><th>Planned research</th><th>Collected</th><th>Weight</th><th>Note</th></tr></thead><tbody>' + c.parts.map(function (p) { return '<tr><td>' + esc(p.name) + '</td><td><span class="xr-st ' + (p.pct >= 80 ? "pass" : p.pct >= 40 ? "warn" : "fail") + '">' + p.pct + "%</span></td><td>" + p.weight + "</td><td>" + esc(p.note) + "</td></tr>"; }).join("") + "</tbody></table>";
  }
  function funnelBlock(r) {
    if (!r.funnel) return "";
    return '<h3>Conversion funnel</h3><ol class="xr-funnel">' + r.funnel.map(function (f) { return '<li class="' + tone(f.score) + '"><b>' + esc(f.name) + "</b><span>" + (f.score == null ? "Data unavailable" : f.score + "/100") + '</span><small class="muted">' + esc(f.note) + (f.checks.length ? " · from " + f.checks.length + " check(s)" : "") + "</small></li>"; }).join("") + '</ol><p class="muted">' + lbl("INFERRED") + " Each stage is the weighted average of the checks below that show it on your pages. Lead and customer stages need your own form, CRM or sales data: FODO does not guess them.</p>";
  }
  function leaksBlock(r, full) {
    var L = r.leaks || []; if (!L.length) return '<h3 id="xr-leaks">Revenue leaks</h3><p class="muted">No conversion leaks found in the pages read.</p>';
    var rows = full ? L : L.slice(0, 3);
    return '<h3 id="xr-leaks">Revenue leaks, where enquiries slip away</h3><div class="xr-scroll"><table class="xr-t"><thead><tr><th>Leak</th><th>Evidence</th><th>Potential impact</th><th>Confidence</th><th>Effort</th><th>Fix</th></tr></thead><tbody>' + rows.map(function (x) { return "<tr><td><b>" + esc(x.leak) + "</b>" + (x.detail ? '<br><small class="muted">' + esc(x.detail) + "</small>" : "") + "</td><td>" + evBtn(x.evidence, "Evidence") + " " + lbl(x.label) + "</td><td>" + x.impact + "</td><td>" + x.confidence + "</td><td>" + x.effort + "</td><td>" + esc(x.fix) + " " + actSel(x.key, x.leak) + "</td></tr>"; }).join("") + '</tbody></table></div><p class="muted">“Potential impact” is a rule-based rating. FODO never states lost revenue in rupees without your own sales or analytics data.</p>' + (full || L.length <= 3 ? "" : lockCard("All " + L.length + " revenue leaks with fixes", "fullReport"));
  }
  function localBlock(r) {
    var L = r.local; if (!L) return r.business.local ? '<h3 id="xr-local">Local visibility</h3><p class="muted">Data unavailable, local listings could not be checked' + (r.providers && r.providers.search !== "serper" ? " (needs the Serper search key)" : "") + ".</p>" : "";
    var me = L.me, src = r.placesSource || {}, star = function (p) { return p.rating != null ? "<b>" + p.rating + "★</b> · " + (p.reviews || 0).toLocaleString("en-IN") + " reviews" : '<span class="muted">no rating</span>'; };
    return '<h3 id="xr-local">Local visibility: Google Maps</h3><div class="grid g2"><div class="panel"><span class="tag">YOUR LISTING</span>' + (me ? "<h4>" + esc(me.name) + "</h4><p>" + star(me) + (me.category ? ' · <span class="muted">' + esc(me.category) + "</span>" : "") + '</p><p class="muted">' + esc(me.address || "") + (L.inMarketResults ? " · #" + L.inMarketResults + " in the local results" : "") + '</p><a href="' + esc(me.mapsUrl || "#") + '" target="_blank" rel="noopener noreferrer nofollow">Open on Google Maps ↗</a>' : '<p><b>Not found</b> on Google Maps for your name' + (src.q && src.q[1] ? " (“" + esc(src.q[1]) + "”)" : "") + ".</p>") + '</div><div class="panel"><span class="tag hot">LOCAL COMPETITORS</span><p>Median of ' + L.compared + " listings: <b>" + (L.medianRating != null ? L.medianRating + "★" : "—") + "</b> · <b>" + (L.medianReviews || 0).toLocaleString("en-IN") + "</b> reviews</p>" + (me ? "<p>" + (L.behindOnRating || L.behindOnReviews ? '<span class="xr-st fail">Behind</span> ' + [L.behindOnRating && "lower rating", L.behindOnReviews && "fewer reviews"].filter(Boolean).join(" and ") + " than the local median." : '<span class="xr-st pass">On par or ahead</span> of the local median.') + "</p>" : "") + "</div></div>" +
      (L.competitors.length ? '<div class="xr-scroll"><table class="xr-t"><thead><tr><th>Business</th><th>Rating</th><th>Reviews</th><th>Website</th></tr></thead><tbody>' + L.competitors.map(function (p) { return "<tr><td>" + esc(p.name) + '<br><small class="muted">' + esc(p.category || "") + "</small></td><td>" + (p.rating != null ? p.rating + "★" : "—") + "</td><td>" + (p.reviews != null ? p.reviews.toLocaleString("en-IN") : "—") + "</td><td>" + (p.website ? esc(E.domainOf(p.website) || p.website) : "—") + "</td></tr>"; }).join("") + "</tbody></table></div>" : "") +
      '<p class="muted">' + lbl("OBSERVED") + " Google Maps results (via Serper) for " + (src.q || []).map(function (q) { return "“" + esc(q) + "”"; }).join(" and ") + (src.retrievedAt ? " · retrieved " + esc(new Date(src.retrievedAt).toLocaleString()) : "") + ". Ratings and review counts belong to Google; FODO does not copy reviews. These factors may improve local visibility, no one can promise a #1 Maps position.</p>" + (L.evidence ? evBtn(L.evidence) : "");
  }
  function aiBlock(r, full) {
    var v = r.visibility; if (!v) return '<p class="muted">Data unavailable, no AI source connected.</p>';
    var eng = v.engines || [{ id: "workers-ai", name: "Llama on Cloudflare Workers AI", asked: v.tested, you: v.brandIn, comp: v.compIn, withCites: 0, model: v.model }], sc = v.score;
    var h = (sc ? '<div class="xr-aiscore"><div class="xr-ring ' + tone(sc.score) + '" style="--v:' + sc.score + '"><b>' + sc.score + '</b><small>/100</small></div><div><b>FODO AI Visibility Score</b><ul class="xr-mini2">' + sc.parts.map(function (p) { return "<li>" + esc(p.name) + ": <b>" + p.score + "</b> <small class=\"muted\">(" + p.w + "%)</small></li>"; }).join("") + '</ul><small class="muted">' + esc(sc.label) + "</small></div></div>" : "") +
      '<p><b>Sampled AI visibility:</b> ' + v.tested + " answers · your brand named in " + v.brandIn + " · competitors named in " + v.compIn + ".</p>" +
      '<table class="xr-t"><thead><tr><th>AI engine</th><th>Live web?</th><th>Answers</th><th>Named you</th><th>Named a competitor</th><th>Cited your site</th></tr></thead><tbody>' + eng.map(function (e) { return "<tr><td>" + esc(e.name) + (e.model ? '<br><small class="muted">' + esc(e.model) + "</small>" : "") + "</td><td>" + (e.live ? "Yes: Google Search" : "No, training data") + "</td><td>" + e.asked + "</td><td>" + e.you + "</td><td>" + e.comp + "</td><td>" + (e.withCites ? e.cited + " of " + e.withCites : "—") + "</td></tr>"; }).join("") + "</tbody></table>" +
      '<p class="muted">Only the engines listed were asked, this is NOT ChatGPT, Perplexity or Google AI Overviews, and a handful of questions is not your total AI visibility.</p>';
    if (!full) return h + lockCard("Every AI question, every engine's answer and which businesses it named", "fullReport");
    return h + '<div class="xr-scroll"><table class="xr-t"><thead><tr><th>Question</th><th>Engine</th><th>You?</th><th>Competitors named</th><th>Sources it used</th></tr></thead><tbody>' + v.rows.map(function (x) { return "<tr><td>" + esc(x.q) + "</td><td>" + esc(x.engineName || "Workers AI") + "</td><td>" + (x.answered ? (x.aboutYou ? "Not counted, the question names you" : x.brand ? (x.recommended ? "Yes, among first picks" : "Yes") : "No") : "no answer") + "</td><td>" + esc(x.competitors.join(", ") || "—") + "</td><td>" + ((x.citations || []).length ? x.citations.slice(0, 4).map(function (c) { return (c.you ? "<b>" : "") + esc(c.title) + (c.you ? " (you)</b>" : ""); }).join(", ") : "—") + "</td></tr>"; }).join("") + "</tbody></table></div>";
  }
  function matrix4Block(r) {
    var q = r.matrix4; if (!q) return "";
    var box = function (t, cls, sub, list) { return '<div class="xr-q4 ' + cls + '"><b>' + t + '</b><small class="muted">' + sub + "</small><ul>" + (list.length ? list.slice(0, 6).map(function (o) { return '<li><span class="xr-p ' + o.priority.toLowerCase() + '">' + o.priority + "</span> " + esc(o.title) + "</li>"; }).join("") + (list.length > 6 ? '<li class="muted">+' + (list.length - 6) + " more</li>" : "") : '<li class="muted">—</li>') + "</ul></div>"; };
    return '<h3>Priority matrix</h3><div class="xr-matrix4">' + box("Do first", "quick", "High impact · low effort", q.quick) + box("Plan next", "big", "High impact · high effort", q.big) + box("Quick tidy-ups", "small", "Low impact · low effort", q.small) + box("Later", "later", "Low impact · high effort", q.later) + '</div><p class="muted">Impact 4–5 = high · effort 1–2 = low (the same scores as each opportunity card).</p>';
  }
  function roadmapBlock(r, paid) {
    if (!r.plan90) return paid("roadmapLite") ? '<div id="xr-roadmap">' + lockCard("90-day growth roadmap (foundation → acquisition → optimisation, with KPIs)", "roadmapLite") + "</div>" : "";
    return '<h3 id="xr-roadmap">90-day growth roadmap</h3><div class="xr-plan">' + r.plan90.map(function (m) { return '<div class="panel"><span class="tag">MONTH ' + m.month + " · " + esc(m.name.toUpperCase()) + "</span><h3>" + esc(m.goal) + "</h3>" + (m.items.length ? "<ul>" + m.items.map(function (i) { return "<li><b>" + esc(i.problem) + "</b> " + actSel(i.key, i.problem) + "<br>" + esc(i.task) + '<br><small class="muted">KPI: ' + esc(i.kpi) + (i.dependsOn ? " · after " + esc(i.dependsOn) : "") + "</small> " + evBtn(i.evidence, "Evidence") + "</li>"; }).join("") + "</ul>" : '<p class="muted">Nothing left for this month, re-run the X-Ray to measure.</p>') + "</div>"; }).join("") + '</div><p class="muted">' + lbl("INFERRED") + " Built by rules from this X-Ray's findings (no AI). Owner, status and deadline: use the To do / In progress / Done tracker.</p>";
  }
  function whyBlock(r, paid) {
    if (!r.why || !r.why.length) return paid("whyWinning") && r.competitors.length ? '<div id="xr-whyw">' + lockCard("Why are they winning?, head-to-head with each competitor and how to catch them", "whyWinning") + "</div>" : "";
    var list = function (t, a) { return "<h4>" + t + "</h4>" + (a.length ? "<ul>" + a.map(function (x) { return "<li><b>" + esc(x.title) + "</b>: " + esc(x.fix) + " " + evBtn(x.evidence, "Evidence") + " " + actSel(x.key, x.title) + "</li>"; }).join("") + "</ul>" : '<p class="muted">Nothing specific for this period.</p>'); };
    return '<h3 id="xr-whyw">Why are they winning?</h3><label class="xr-whysel">Compare with <select id="xr-whysel">' + r.why.map(function (w) { return '<option value="' + esc(w.domain) + '">' + esc(w.name) + " (" + esc(w.domain) + ")</option>"; }).join("") + "</select></label>" + r.why.map(function (w, i) {
      return '<div class="panel xr-whyp" data-d="' + esc(w.domain) + '"' + (i ? " hidden" : "") + '><div class="grid g2"><div><h4>Why ' + esc(w.name) + " wins</h4>" + (w.wins.length ? "<ul>" + w.wins.map(function (a) { return "<li><b>" + esc(a.area) + "</b>" + (a.note ? ": " + esc(a.note) : ", them " + a.them + " vs you " + a.you) + "</li>"; }).join("") + "</ul>" : '<p class="muted">On the pages read, they are not ahead of you on any of the areas compared.</p>') + "</div><div><h4>Where you win</h4>" + (w.youWin.length ? "<ul>" + w.youWin.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>" : '<p class="muted">—</p>') + "</div></div>" +
        "<h4>How to catch them</h4>" + list("Immediately", w.immediate) + list("Within 30 days", w.d30) + list("Within 90 days", w.d90) + '<p class="muted">' + lbl("OBSERVED") + " Compared from both websites and the same Google searches. " + evBtn(w.evidence, "Their evidence") + "</p></div>"; }).join("");
  }
  function gscBlock(r) {
    var g = r.gsc;
    if (!g) return r.completeness && r.completeness.parts.some(function (x) { return /Search Console/.test(x.name) && x.pct === 100; }) ? '<p class="muted xr-gsc-priv">Google Search Console data was used in this X-Ray but is private, it is shown only to the person who connected it, never in shared links.</p>' : "";
    if (!g.ok) return '<div class="panel xr-gsc"><span class="tag">GOOGLE SEARCH CONSOLE</span><p>' + esc(g.reason || "Search Console data unavailable.") + "</p>" + (g.connected === false ? '<a class="btn sm" href="' + ROOT + 'account/#search-console">Connect Google Search Console (free, read-only)</a>' : "") + "</div>";
    var T = g.totals, ctr = E.ctrOpps(g), row = function (x) { return "<tr><td>" + esc(x.key) + "</td><td>" + x.clicks.toLocaleString("en-IN") + "</td><td>" + x.impressions.toLocaleString("en-IN") + "</td><td>" + x.ctr + "%</td><td>" + x.position + "</td></tr>"; };
    return '<div class="panel xr-gsc"><span class="tag hot">GOOGLE SEARCH CONSOLE · YOUR DATA</span><p class="muted">' + esc(g.property) + " · " + esc(g.startDate) + " to " + esc(g.endDate) + ' · first-party data from your own Google account. <b>Private:</b> only you see this, it is not saved in shared report links.</p><ul class="xr-nums">' + [[T.clicks.toLocaleString("en-IN"), "clicks"], [T.impressions.toLocaleString("en-IN"), "impressions"], [T.ctr + "%", "click-through rate"], [T.position, "average position"]].map(function (n) { return "<li><b>" + n[0] + "</b><span>" + n[1] + "</span></li>"; }).join("") + "</ul>" +
      (ctr.length ? '<h4>CTR quick wins</h4><div class="xr-scroll"><table class="xr-t"><thead><tr><th>Search</th><th>Impressions</th><th>CTR now</th><th>Usual CTR at this position</th><th>Position</th><th>Extra clicks / month</th><th>Do this</th></tr></thead><tbody>' + ctr.map(function (x) { return "<tr><td><b>" + esc(x.query) + "</b></td><td>" + x.impressions.toLocaleString("en-IN") + "</td><td>" + x.ctr + "%</td><td>~" + x.expected + "%</td><td>" + x.position + "</td><td>~" + x.extraClicks + " " + lbl("ESTIMATED") + "</td><td>" + esc(x.action) + "</td></tr>"; }).join("") + '</tbody></table></div><p class="muted">“Usual CTR” is a typical click-through rate for that position; your real lift will differ.</p>' : '<p class="muted">No obvious CTR quick wins in the top searches.</p>') +
      '<h4>Top searches</h4><div class="xr-scroll"><table class="xr-t"><thead><tr><th>Search</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Position</th></tr></thead><tbody>' + g.queries.slice(0, 15).map(row).join("") + '</tbody></table></div><details class="xr-more"><summary>Top pages (' + g.pages.length + ") and devices</summary><table class=\"xr-t\"><thead><tr><th>Page</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Position</th></tr></thead><tbody>" + g.pages.slice(0, 15).map(row).join("") + g.devices.map(row).join("") + "</tbody></table></details></div>";
  }
  function navBlock(r) {
    var fails = r.checks.filter(function (c) { return c.status === "fail"; }).length, srch = (r.serps || []).filter(function (s) { return s.ok; }).length;
    var nums = [[r.crawl.pages, "pages read"], [fails, "checks failed"], [r.opportunities.length, "opportunities"], [r.competitors.length, "competitors"], [srch, "searches checked"], [r.evidence.length, "evidence items"]];
    var nav = [["xr-s1", "Summary"], ["xr-s2", "Health"], ["xr-s6", "Website"], ["xr-s7", "Search"], ["xr-s8", "Competitors"], ["xr-s9", "Customers"], ["xr-s13", "AI visibility"], ["xr-s14", "Opportunities"], ["xr-s16", "30-day plan"]].concat(r.edge ? [["xr-edge", "FODO Edge ★"]] : []).concat([["xr-s17", "Evidence"]]);
    return '<ul class="xr-nums">' + nums.map(function (n) { return "<li><b>" + n[0] + "</b><span>" + n[1] + "</span></li>"; }).join("") + '</ul><nav class="xr-nav" aria-label="Report sections">' + nav.map(function (n) { return '<a href="#' + n[0] + '">' + esc(n[1]) + "</a>"; }).join("") + "</nav>";
  }
  function matrixBlock(r) {
    var m = r.matrix; if (!m) return "";
    var cell = function (v, num) { return v == null ? '<td class="na">—</td>' : num ? "<td><b>" + v + "</b></td>" : v ? '<td class="ok" aria-label="yes">✓</td>' : '<td class="no" aria-label="no">✗</td>'; };
    return "<h3>You vs competitors, side by side</h3>" + '<div class="xr-scroll"><table class="xr-t xr-matrix"><thead><tr><th>What buyers see</th>' + m.cols.map(function (c) { return "<th" + (c.you ? ' class="xr-youcol"' : "") + ">" + esc(c.you ? "You" : c.name) + (c.you ? "" : '<br><small class="muted">' + esc(c.domain) + "</small>") + "</th>"; }).join("") + "</tr></thead><tbody>" +
      m.rows.map(function (row) { return "<tr><td>" + esc(row.name) + "</td>" + row.values.map(function (v, i) { return cell(v, row.num).replace("<td", i ? "<td" : '<td data-you="1"'); }).join("") + "</tr>"; }).join("") + '</tbody></table></div><p class="muted">' + lbl("OBSERVED") + " Read from each homepage and up to " + ((r.limits && r.limits.compPages) || 2) + " more pages per competitor. ✓ = found, ✗ = not found on the pages read.</p>";
  }
  function sovBlock(r, paid) {
    if (!r.sov) return paid("shareOfVoice") ? lockCard("Search share of voice (how much of Google's first page each business owns)", "shareOfVoice") : "";
    var mx = Math.max.apply(null, r.sov.rows.map(function (x) { return x.share; }).concat([1]));
    return "<h3>Share of Google's first page</h3><p class=\"muted\">" + lbl("INFERRED") + " Across " + r.sov.searches + " market searches: position 1 counts most, position 10 least. Who owns the first page today.</p>" + '<ul class="xr-sov">' + r.sov.rows.map(function (x) { return '<li class="' + (x.you ? "you" : "") + '"><span>' + esc(x.name) + (x.you ? "" : ' <small class="muted">' + esc(x.domain) + "</small>") + '</span><i style="--v:' + Math.round(100 * x.share / mx) + '"></i><b>' + x.share + "%</b><small>" + x.appearances + " of " + r.sov.searches + "</small></li>"; }).join("") + "</ul>";
  }
  function adsBlock(r, paid) {
    if (!r.ads) return paid("adLibrary") ? lockCard("Competitor ads (links to every competitor's live Meta, Google and LinkedIn ads)", "adLibrary") : "";
    return "<h3>See your competitors' live ads</h3><p class=\"muted\">Official, public ad libraries, open them to see every ad each competitor is running right now, the creatives and since when.</p><table class='xr-t'><thead><tr><th>Competitor</th><th>Meta (Facebook + Instagram)</th><th>Google Ads</th><th>LinkedIn</th></tr></thead><tbody>" + r.ads.map(function (a) { return "<tr><td><b>" + esc(a.name) + '</b><br><small class="muted">' + esc(a.domain) + '</small></td><td><a href="' + esc(a.meta) + '" target="_blank" rel="noopener noreferrer">Open Meta Ad Library ↗</a></td><td><a href="' + esc(a.google) + '" target="_blank" rel="noopener noreferrer">Open Google Ads Transparency ↗</a></td><td><a href="' + esc(a.linkedin) + '" target="_blank" rel="noopener noreferrer">Open LinkedIn Ad Library ↗</a></td></tr>'; }).join("") + "</tbody></table>";
  }
  function kwMapBlock(r, paid) {
    if (!r.kwMap) return paid("keywordMap") ? lockCard("Keyword → page map (which page should rank for each search, and which pages are missing)", "keywordMap") : "";
    if (!r.kwMap.length) return "";
    return "<h3>Keyword → page map</h3><p class=\"muted\">" + lbl("INFERRED") + " For each search, the page of yours whose title, H1 and text match it best.</p><table class='xr-t'><thead><tr><th>Search</th><th>Your page</th><th>Fit</th><th>Do this</th></tr></thead><tbody>" + r.kwMap.map(function (k) { return "<tr><td>" + esc(k.keyword) + "</td><td>" + (k.page ? '<a href="' + esc(k.page) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(k.page.replace(/^https?:\/\/(www\.)?/, "")) + "</a>" : '<span class="muted">No matching page</span>') + '</td><td><span class="xr-fit ' + k.fit.toLowerCase() + '">' + k.fit + "</span></td><td>" + esc(k.action) + "</td></tr>"; }).join("") + "</tbody></table>";
  }
  function trackingBlock(r, paid) {
    if (!r.tracking) return paid("trackingAudit") ? lockCard("Tracking & ads readiness (analytics, pixels, Search Console, and what competitors run)", "trackingAudit") : "";
    var t = r.tracking, yn = function (v) { return v === true ? '<span class="xr-st pass">Yes</span>' : v === false ? '<span class="xr-st fail">Not detected</span>' : '<span class="xr-st na">Unknown</span>'; };
    return "<h3>Tracking & ads readiness</h3>" + (t.gaps.length ? '<p class="xr-alert"><b>Competitors measure what you don\'t:</b> ' + t.gaps.map(esc).join(" · ") + "</p>" : "") + "<table class='xr-t'><thead><tr><th>Tool</th><th>You</th><th>Competitors using it</th><th>Why it matters</th></tr></thead><tbody>" + t.rows.map(function (x) { return "<tr><td>" + esc(x.item) + "</td><td>" + yn(x.you) + (x.how ? '<br><small class="muted">' + esc(x.how) + "</small>" : "") + "</td><td>" + (x.competitors == null ? "—" : x.competitors + " of " + x.of) + "</td><td>" + esc(x.why) + "</td></tr>"; }).join("") + '</tbody></table><p class="muted">' + lbl("OBSERVED") + " From the homepage code. <b>Not detected</b> = not in the page code (it may still load after a click or cookie consent, or from the server). <b>Unknown</b> = there are signs it may be set up in a way we can't see from outside.</p>";
  }
  function schemaBlock(r, paid) {
    if (!r.schema) return paid("schemaCode") ? lockCard("Ready-to-paste schema code (JSON-LD) built from your business details", "schemaCode") : "";
    var sc = r.schema;
    return "<h3>Ready-to-paste schema code</h3><p class=\"muted\">" + esc(sc.type) + " + WebSite schema built only from details found on your site" + (sc.existing.length ? " (you already have: " + esc(sc.existing.join(", ")) + ")" : " (none found on your site today)") + ". Paste it inside &lt;head&gt; on the homepage, then test it in Google's Rich Results Test." + (sc.missing.length ? " Not found on the site, so not included: " + esc(sc.missing.join(", ")) + "." : "") + '</p><pre class="xr-code" id="xr-schema-code">' + esc(sc.code) + "</pre>" + copyBtn("xr-schema-code", "Copy schema code");
  }
  function edgeBlock(r, paid) {
    if (!r.edge) return r.features && paid("fixPack") ? '<section class="xr-sec xr-edge" id="xr-edge"><div class="xr-sec-h"><span class="section-num">★</span><h2>FODO Edge</h2></div>' + lockCard("FODO Edge: AI Fix Pack (rewritten titles, metas, headlines, FAQs), competitor battle cards, a 90-day roadmap and a ready client pitch", "fixPack") + "</section>" : "";
    var e = r.edge, err = function (x) { return '<p class="muted">' + esc(x.error) + "</p>"; }, h = '<section class="xr-sec xr-edge" id="xr-edge"><div class="xr-sec-h"><span class="section-num">★</span><h2>FODO Edge</h2>' + edgeTag + '</div><p class="muted">Tools you won\'t find in other audit reports. Written by AI (' + esc(r.edgeModel || "Workers AI") + ") from this X-Ray's own data, pages, competitors and opportunities it was not given are removed. <b>AI draft: review before you publish or send.</b></p>";
    var f = e.fixPack; if (f) h += '<div class="panel xr-edge-p"><h3>AI Fix Pack, copy that fixes your pages</h3>' + (f.error ? err(f) : (f.headlines.length ? "<h4>Homepage headline options</h4><ol>" + f.headlines.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ol>" : "") + (f.cta ? "<p><b>Better button text:</b> “" + esc(f.cta) + "”</p>" : "") +
      (f.pages.length ? '<div class="xr-scroll"><table class="xr-t"><thead><tr><th>Page</th><th>New title</th><th>New meta description</th><th>New H1</th></tr></thead><tbody>' + f.pages.map(function (p) { return '<tr><td><a href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(p.url.replace(/^https?:\/\/(www\.)?/, "")) + "</a></td><td>" + esc(p.title) + ' <small class="muted">(' + p.title.length + ")</small></td><td>" + esc(p.meta) + ' <small class="muted">(' + p.meta.length + ")</small></td><td>" + esc(p.h1) + "</td></tr>"; }).join("") + "</tbody></table></div>" : "") +
      (f.faq.length ? '<h4>FAQ to add</h4><dl class="xr-faq">' + f.faq.map(function (q) { return "<dt>" + esc(q.q) + "</dt><dd>" + esc(q.a) + "</dd>"; }).join("") + "</dl>" : "")) + "</div>";
    var b = e.battleCards; if (b) h += '<div class="panel xr-edge-p"><h3>Competitor battle cards</h3>' + (b.error ? err(b) : '<div class="xr-battle">' + b.cards.map(function (c) { var nm = (r.competitors.filter(function (x) { return x.domain === c.domain; })[0] || {}).name || c.domain;
      return '<div class="xr-card"><h4>vs ' + esc(nm) + ' <small class="muted">' + esc(c.domain) + '</small></h4><div class="xr-ins"><div><b>They win on</b><ul>' + c.theyWinOn.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div><div><b>You win on</b><ul>" + c.youWinOn.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div></div><b>How to win</b><ol>" + c.howToWin.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ol>" + (c.talkTrack ? '<blockquote class="xr-q">“' + esc(c.talkTrack) + "”</blockquote>" : "") + "</div>"; }).join("") + "</div>") + "</div>";
    var m = e.roadmap90; if (m) h += '<div class="panel xr-edge-p"><h3>90-day growth roadmap</h3>' + (m.error ? err(m) : '<div class="xr-road">' + m.months.map(function (mo) { return '<div><span class="tag">MONTH ' + mo.month + "</span><h4>" + esc(mo.goal) + "</h4><ol>" + mo.weeks.map(function (w) { return '<li><b>Week ' + w.week + ": " + esc(w.focus) + "</b>" + (w.tasks.length ? "<ul>" + w.tasks.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" : "") + (w.kpi ? '<small class="muted">Measure: ' + esc(w.kpi) + "</small>" : "") + (w.opportunities.length ? ' <small class="muted">· ' + w.opportunities.join(", ") + "</small>" : "") + "</li>"; }).join("") + "</ol></div>"; }).join("") + "</div>") + "</div>";
    var c = e.clientPitch; if (c) h += '<div class="panel xr-edge-p"><h3>Client pitch, ready to send</h3>' + (c.error ? err(c) : '<p><b>Subject:</b> ' + esc(c.subject) + '</p><pre class="xr-code xr-mail" id="xr-pitch">' + esc("Subject: " + c.subject + "\n\n" + c.email) + "</pre>" + copyBtn("xr-pitch", "Copy email") + (c.proposal.length ? "<h4>Proposal outline</h4><ol>" + c.proposal.map(function (p) { return "<li><b>" + esc(p.phase) + "</b>: " + esc(p.what) + (p.outcome ? ' <span class="muted">→ ' + esc(p.outcome) + "</span>" : "") + "</li>"; }).join("") + "</ol>" : "")) + "</div>";
    return h + "</section>";
  }
  document.addEventListener("click", function (e) { var b = e.target.closest(".xr-copy"); if (!b) return; var el = $(b.dataset.copy); if (!el) return; ping(b.dataset.copy === "xr-pitch" ? "copy_pitch" : "copy_schema", report && report.business.domain); var t = el.textContent, done = function () { var o = b.textContent; b.textContent = "Copied ✓"; setTimeout(function () { b.textContent = o; }, 1800); };
    if (X && X.copyText) X.copyText(t, "Copy").then(function (h) { if (h === "copied") done(); }); else if (navigator.clipboard) navigator.clipboard.writeText(t).then(done); });
  function synList(t, arr) { return arr && arr.length ? "<h3>" + t + "</h3><ul>" + arr.map(function (x) { return "<li>" + esc(x.text) + " " + evBtn(x.evidence, "Evidence") + "</li>"; }).join("") + "</ul>" : ""; }
  function checksTable(cs) { return '<table class="xr-t xr-checks"><thead><tr><th>Check</th><th>Result</th><th>Score</th><th>Why</th></tr></thead><tbody>' + cs.map(function (c) { return '<tr class="' + c.status + '"><td>' + esc(c.name) + "<br><small class=\"muted\">" + esc(c.group) + "</small></td><td><span class=\"xr-st " + c.status + "\">" + ({ pass: "Pass", warn: "Warning", fail: "Fail", na: "n/a" }[c.status]) + "</span> " + lbl(c.label) + "</td><td>" + (c.score == null ? "—" : c.score) + "</td><td>" + esc(c.detail) + " " + evBtn(c.evidence, "Evidence") + "</td></tr>"; }).join("") + "</tbody></table>"; }
  function pagesTable(list) { return '<table class="xr-t"><thead><tr><th>Page</th><th>Status</th><th>Type</th><th>Title</th><th>Words</th></tr></thead><tbody>' + list.map(function (p) { return "<tr><td><a href=\"" + esc(p.finalUrl) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(p.finalUrl.replace(/^https?:\/\/(www\.)?/, "")) + "</a></td><td>" + (p.error ? esc(p.error) : p.status) + (p.noindex ? " · noindex" : "") + "</td><td>" + esc(p.type) + "</td><td>" + esc(p.title) + "</td><td>" + p.words + "</td></tr>"; }).join("") + "</tbody></table>"; }
  function serpTable(s) { return s.length ? '<table class="xr-t"><thead><tr><th>Search</th><th>Intent</th><th>Your position</th><th>Who shows up</th></tr></thead><tbody>' + s.map(function (x) { return "<tr><td>" + esc(x.q) + "</td><td>" + esc(x.intent) + "</td><td>" + (x.ok ? x.ourPos ? "#" + x.ourPos : "not in top 10" : "unavailable") + "</td><td>" + esc(x.competitors.slice(0, 3).map(function (c) { return c.domain; }).concat(x.directories.slice(0, 2).map(function (d) { return d.host; })).join(", ")) + " " + evBtn(x.evidence, "Results") + "</td></tr>"; }).join("") + '</tbody></table><p class="muted">Positions come from ' + esc((report && report.providers && report.providers.searchName) || "the search provider") + ' at the time of the X-Ray, a snapshot for one country, not a ranking report.</p>' : ""; }
  function kwTable(k) { return '<table class="xr-t"><thead><tr><th>Search</th><th>Intent</th><th>Volume</th><th>Your position</th><th>Competitors in top 10</th><th>Opportunity</th></tr></thead><tbody>' + k.map(function (x) { return "<tr><td>" + esc(x.keyword) + "</td><td>" + esc(x.intent) + "</td><td>" + (x.volume != null ? x.volume.toLocaleString("en-IN") + " " + lbl("ESTIMATED") : "Data unavailable") + "</td><td>" + (x.ourPos ? "#" + x.ourPos : "—") + "</td><td>" + x.competitorsInTop10 + '</td><td><span class="xr-op ' + x.opportunity.toLowerCase() + '">' + x.opportunity + "</span></td></tr>"; }).join("") + "</tbody></table>"; }
  function techBlock(t) { if (!t.length) return '<p class="muted">No common tools detected.</p>'; var g = {}; t.forEach(function (x) { (g[x.cat] = g[x.cat] || []).push(x.name); }); return '<dl class="xr-dl sm xr-tech">' + Object.keys(g).map(function (k) { return "<div><dt>" + esc(k) + "</dt><dd>" + g[k].map(esc).join(" · ") + "</dd></div>"; }).join("") + "</dl>"; }
  function compCard(c, tech) { var p = c.profile, i = c.insights; return '<div class="panel xr-comp"><div class="xr-comp-h"><span class="xr-av" aria-hidden="true">' + esc((c.name || c.domain).charAt(0).toUpperCase()) + '</span><div class="xr-comp-n"><h3>' + esc(c.name) + '</h3><a class="muted" href="' + esc(c.url) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(c.domain) + ' ↗</a></div><div class="xr-cscore ' + tone(c.score) + '" title="How closely this business competes with you (0–100)"><b>' + c.score + '</b><small>match</small></div></div><p class="muted">Why a competitor: ' + esc(c.reason) + " · confidence <b>" + esc(c.confidence) + "</b> (" + c.score + "/100) · source: " + esc(c.source.join(", ")) + (c.pagesRead ? " · " + c.pagesRead + " page" + (c.pagesRead === 1 ? "" : "s") + " read" : "") + "</p>" + (tech ? '<details class="xr-more"><summary>Their technology (' + tech.length + ")</summary>" + techBlock(tech) + "</details>" : "") +
    '<dl class="xr-dl sm"><div><dt>Headline</dt><dd>' + esc(p.headline || "—") + "</dd></div><div><dt>CTA</dt><dd>" + esc(p.ctas.join(" · ") || "—") + "</dd></div><div><dt>Pricing</dt><dd>" + (p.pricing ? esc(p.pricingSamples.join(", ") || "shown") : "not shown") + "</dd></div><div><dt>Trust</dt><dd>" + esc([p.testimonials && "testimonials", p.faq && "FAQ"].concat(p.trust.slice(0, 3)).filter(Boolean).join(" · ") || "—") + "</dd></div></dl>" +
    '<div class="xr-ins"><div><b>Competitor advantage</b><ul>' + (i.advantages.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") || "<li class=muted>None found</li>") + "</ul></div><div><b>Competitor weakness</b><ul>" + (i.weaknesses.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") || "<li class=muted>None found</li>") + "</ul></div></div><p><b>Opportunity:</b> " + esc(i.opportunity) + "</p>" + evBtn(c.evidence) + ' <a class="xr-tool" href="' + esc(c.url) + '" target="_blank" rel="noopener noreferrer nofollow">Visit site ↗</a></div>'; }
  function voiceBlock(v) {
    var blk = function (t, arr) { return '<div class="panel"><h3>' + t + "</h3>" + (arr && arr.length ? "<ul>" + arr.slice(0, 4).map(function (g) { return "<li><b>" + esc(g.theme) + "</b> · " + g.count + " mention(s)" + (g.quotes[0] ? '<br><q class="muted">' + esc(g.quotes[0].text) + "</q> <small>— " + esc(g.quotes[0].source) + "</small> " + evBtn([].concat.apply([], g.quotes.map(function (q) { return q.evidence || []; })), "Sources") : "") + "</li>"; }).join("") + "</ul>" : '<p class="muted">Nothing found in the sample.</p>') + "</div>"; };
    return '<p class="muted">From ' + v.snippets + " public text snippets (search-result excerpts, forum previews, and testimonials on your own site, clearly marked). Not a survey.</p>" + (v.marketOpportunity ? '<p class="lead"><b>Market opportunity:</b> ' + esc(v.marketOpportunity) + " " + lbl("INFERRED") + "</p>" : "") + '<div class="grid g2 xr-voice">' + blk("Top customer needs", v.needs) + blk("Top customer complaints", v.complaints) + blk("Top buying triggers", v.triggers) + blk("Top objections", v.objections) + "</div>" +
      (v.excludedCount ? '<details class="xr-excl"><summary>' + v.excludedCount + " result(s) left out, they name “" + esc(((v.excluded[0] || {}).why || "").replace(/^names “([^”]+)”.*$/, "$1")) + "” but look like a different company</summary><ul>" + v.excluded.map(function (x) { return '<li><a href="' + esc(x.url) + '" target="_blank" rel="noopener nofollow">' + esc(x.title || x.url) + "</a> <small class=muted>— " + esc(x.why) + "</small></li>"; }).join("") + '</ul><p class="muted">FODO only counts a result when it names your website, or your name together with your category, services or city. ' + lbl("OBSERVED") + "</p></details>" : "");
  }
  function psiBlock(p) { return '<div class="xr-psi">' + (p.screenshot ? '<img src="' + esc(p.screenshot) + '" alt="Mobile screenshot of the homepage from Google PageSpeed Insights" width="160" loading="lazy">' : "") + '<div><b>Google PageSpeed (mobile)</b><ul class="xr-mini">' + [["Performance", p.performance], ["SEO", p.seo], ["Accessibility", p.accessibility], ["Best practices", p.bestPractices]].map(function (x) { return '<li class="' + tone(x[1]) + '"><b>' + (x[1] == null ? "—" : x[1]) + "</b><span>" + x[0] + "</span></li>"; }).join("") + "</ul>" + (p.field ? '<p class="muted">Real-user data (Chrome UX Report): LCP ' + (p.field.lcpMs / 1000).toFixed(1) + " s · " + esc(p.field.overall) + "</p>" : '<p class="muted">No real-user (CrUX) data for this site, lab test only.</p>') + "</div></div>"; }
  function clipS(t, n) { t = String(t || ""); return t.length > n ? t.slice(0, n - 1) + "…" : t; }
  function presenceBlock(r) {
    var p = r.presence; if (!p) return '<p class="muted">Not checked.</p>';
    var L = Object.keys(p.listings);
    return '<dl class="xr-dl"><div><dt>Platforms showing you in search</dt><dd>' + (p.searched ? (L.length ? L.map(function (k) { return '<a href="' + esc(p.listings[k].url) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(k) + "</a>"; }).join(" · ") : "None in the top 10 for your name") : '<span class="muted">Data unavailable (no search provider)</span>') + "</dd></div>" +
      "<div><dt>Social profiles linked on your site</dt><dd>" + (Object.keys(p.siteSocials).join(" · ") || "None") + "</dd></div><div><dt>Public ratings seen</dt><dd>" + (p.ratings.length ? p.ratings.map(function (x) { return x.value + "/5" + (x.count ? " (" + x.count + ")" : "") + ": " + esc(x.host); }).join("; ") : p.searched ? "None visible in the sample" : "Data unavailable") + "</dd></div>" +
      "<div><dt>Phone numbers on the site</dt><dd>" + p.phoneCount + (p.phoneCount > 2 ? ", check they are all current (consistency)" : "") + "</dd></div><div><dt>Map listing</dt><dd>" + (p.mapListing ? p.mapListing.none ? "Not found on the open map data searched" : esc(p.mapListing.name + ": " + p.mapListing.address) + " (" + esc(p.mapListing.source) + ")" : '<span class="muted">Not checked</span>') + '</dd></div>' + (p.excluded && p.excluded.length ? '<div><dt>Left out (same name, different company)</dt><dd>' + p.excluded.map(function (x) { return '<a href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(clipS(x.title || x.url, 60)) + "</a>"; }).join(" · ") + ' <small class="muted">— not counted in your listings or ratings</small></dd></div>' : "") + '</dl><p class="muted">Google Business Profile insights (views, calls) need the owner\'s login: FODO never claims them from public data.</p>';
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
    if (k !== "share" && !hasF(report, "export")) { upsell("PDF, Excel, CSV and JSON downloads are part of the Starter plan and above."); $("xr-up").scrollIntoView({ block: "center" }); return; }
    if (k === "pdf") { var blob, wl = whiteLabel(); try { blob = X.pdf(wl ? wl.blocks(pdfBlocks(report)) : pdfBlocks(report), wl ? wl.meta : { title: "FODO Business X-Ray - " + report.business.name.value, footer: "FODO Business X-Ray - " + report.input.url + " - " + new Date(report.createdAt).toLocaleDateString() }); } catch (er) { if (window.console) console.error(er); return; } X.deliver(blob, fname("pdf"), { kind: "PDF" }); }
    if (k === "csv") X.deliver(X.csv(safe(oppRows())), fname("csv").replace(".csv", "-findings.csv"), { kind: "CSV" });
    if (k === "plan") X.deliver(X.csv(safe(planRows())), fname("csv").replace(".csv", "-30-day-plan.csv"), { kind: "CSV" });
    if (k === "json") X.deliver(new Blob([JSON.stringify(report, null, 1)], { type: "application/json" }), fname("json"), { kind: "JSON" });
    if (k === "xlsx") {
      var A = report.scores.areas;
      X.deliver(X.xlsx([
        { name: "Summary", header: false, widths: [32, 100], rows: [["FODO Business X-Ray"], ["Website", report.input.url], ["Business", report.business.name.value], ["Date", new Date(report.createdAt).toLocaleString()], ["Digital Growth Health", report.scores.overall == null ? "Data unavailable" : report.scores.overall], ["Status", report.scores.status], []].concat(Object.keys(A).map(function (k2) { return [A[k2].name, A[k2].score == null ? "Data unavailable" : A[k2].score]; })).concat([[], ["Executive summary", report.synthesis.executiveSummary], ["Written by", report.synthesisBy]]), boldRows: [0] },
        { name: "Opportunities", rows: safe(oppRows()), freezeCols: 5 }, { name: "30-day plan", rows: safe(planRows()) },
        { name: "Checks", rows: safe([["ID", "Area", "Group", "Check", "Result", "Score", "Label", "Detail", "Evidence IDs"]].concat(report.checks.map(function (c) { return [c.id, c.area, c.group, c.name, c.status, c.score == null ? "" : c.score, c.label, c.detail, c.evidence.join(" ")]; }))) },
        { name: "Competitors", rows: safe([["Name", "Domain", "Confidence", "Score", "Why", "Advantages", "Weaknesses", "Opportunity", "Headline", "Pricing shown"]].concat(report.competitors.map(function (c) { return [c.name, c.domain, c.confidence, c.score, c.reason, c.insights.advantages.join("; "), c.insights.weaknesses.join("; "), c.insights.opportunity, c.profile.headline, c.profile.pricing ? "Yes" : "No"]; }))) },
        { name: "Searches", rows: safe([["Search", "Intent", "Your position", "Opportunity", "Volume"]].concat(report.keywords.map(function (x) { return [x.keyword, x.intent, x.ourPos || "", x.opportunity, x.volume == null ? "Data unavailable" : x.volume]; }))) },
        { name: "Pages", rows: safe([["URL", "Status", "Type", "Title", "Meta description", "H1", "Words", "Noindex"]].concat(report.crawl.list.map(function (p) { return [p.finalUrl, p.status || p.error, p.type, p.title, p.meta, p.h1, p.words, p.noindex ? "yes" : ""]; }))) },
        report.techStack || report.compTech ? { name: "Tech stack", rows: safe([["Website", "Category", "Tool"]].concat((report.techStack || []).map(function (t) { return [report.business.domain, t.cat, t.name]; })).concat([].concat.apply([], Object.keys(report.compTech || {}).map(function (d) { return report.compTech[d].map(function (t) { return [d, t.cat, t.name]; }); })))) } : null,
        report.contentGap ? { name: "Content gap", rows: safe([["Topic", "Competitors covering it", "Of", "Which"]].concat(report.contentGap.topics.map(function (t) { return [t.topic, t.count, t.of, t.competitors.join(", ")]; }))) } : null,
        report.extLinks ? { name: "Broken links", rows: safe([["Outgoing link", "Answer", "Found on"]].concat(report.extLinks.broken.map(function (b) { return [b.url, b.status || "no answer", b.on.join(" ")]; }))) } : null,
        report.matrix ? { name: "You vs competitors", rows: safe([["What buyers see"].concat(report.matrix.cols.map(function (c) { return c.you ? "You" : c.name + " (" + c.domain + ")"; }))].concat(report.matrix.rows.map(function (row) { return [row.name].concat(row.values.map(function (v) { return v == null ? "" : v === true ? "Yes" : v === false ? "No" : v; })); }))) } : null,
        report.sov ? { name: "Share of voice", rows: safe([["Business", "Domain", "Share of first page %", "Searches appeared on", "Of"]].concat(report.sov.rows.map(function (x) { return [x.name, x.domain, x.share, x.appearances, report.sov.searches]; }))) } : null,
        report.kwMap ? { name: "Keyword-page map", rows: safe([["Search", "Your page", "Fit", "Action"]].concat(report.kwMap.map(function (k) { return [k.keyword, k.page || "", k.fit, k.action]; }))) } : null,
        report.tracking ? { name: "Tracking audit", rows: safe([["Tool", "You", "Competitors using it", "Of", "Why"]].concat(report.tracking.rows.map(function (x) { return [x.item, x.you == null ? "Unknown" : x.you ? "Yes" : "Not detected", x.competitors == null ? "" : x.competitors, x.of, x.why]; }))) } : null,
        report.ads ? { name: "Competitor ads", rows: safe([["Competitor", "Domain", "Meta Ad Library", "Google Ads Transparency", "LinkedIn Ad Library"]].concat(report.ads.map(function (a) { return [a.name, a.domain, a.meta, a.google, a.linkedin]; }))) } : null,
        report.edge && report.edge.fixPack && report.edge.fixPack.pages ? { name: "AI Fix Pack", rows: safe([["Page", "New title", "New meta description", "New H1"]].concat(report.edge.fixPack.pages.map(function (p) { return [p.url, p.title, p.meta, p.h1]; }))) } : null,
        report.edge && report.edge.battleCards && report.edge.battleCards.cards ? { name: "Battle cards", rows: safe([["Competitor", "They win on", "You win on", "How to win", "Talk track"]].concat(report.edge.battleCards.cards.map(function (c) { return [c.domain, c.theyWinOn.join("; "), c.youWinOn.join("; "), c.howToWin.join("; "), c.talkTrack]; }))) } : null,
        report.edge && report.edge.roadmap90 && report.edge.roadmap90.months ? { name: "90-day roadmap", rows: safe([["Month", "Goal", "Week", "Focus", "Tasks", "Measure", "Opportunity IDs"]].concat([].concat.apply([], report.edge.roadmap90.months.map(function (m) { return m.weeks.map(function (w) { return [m.month, m.goal, w.week, w.focus, w.tasks.join("; "), w.kpi, w.opportunities.join(" ")]; }); })))) } : null,
        report.authority ? { name: "Authority", rows: safe([["Domain", "Open PageRank (0-10, estimated)", "Global rank"]].concat(report.authority.map(function (a) { return [a.domain, a.rank == null ? "Data unavailable" : a.rank, a.globalRank || ""]; }))) } : null,
        report.leaks && report.leaks.length ? { name: "Revenue leaks", rows: safe([["Leak", "Detail", "Potential impact", "Confidence", "Effort", "Fix", "Evidence IDs"]].concat(report.leaks.map(function (x) { return [x.leak, x.detail, x.impact, x.confidence, x.effort, x.fix, x.evidence.join(" ")]; }))) } : null,
        report.plan90 ? { name: "90-day roadmap (rules)", rows: safe([["Month", "Phase", "Goal", "Problem", "Task", "KPI", "Depends on", "Opportunity ID"]].concat([].concat.apply([], report.plan90.map(function (m) { return m.items.map(function (i) { return [m.month, m.name, m.goal, i.problem, i.task, i.kpi, i.dependsOn || "", i.opportunity]; }); })))) } : null,
        report.local ? { name: "Local listings", rows: safe([["Business", "Rating", "Reviews", "Category", "Website", "Address"]].concat((report.local.me ? [report.local.me] : []).concat(report.local.competitors).map(function (p, i) { return [(i === 0 && report.local.me ? "YOU: " : "") + p.name, p.rating == null ? "" : p.rating, p.reviews == null ? "" : p.reviews, p.category || "", p.website || "", p.address || ""]; }))) } : null,
        report.visibility ? { name: "AI visibility", rows: safe([["Question", "Engine", "Model", "Named you", "Among first picks", "Competitors named", "Sources cited"]].concat(report.visibility.rows.map(function (x) { return [x.q, x.engineName || "Workers AI", x.model || "", x.brand ? "Yes" : "No", x.recommended ? "Yes" : "No", x.competitors.join(", "), (x.citations || []).map(function (c) { return c.title; }).join(", ")]; }))) } : null,
        report.completeness ? { name: "Data completeness", rows: safe([["Planned research", "Collected %", "Weight", "Note"]].concat(report.completeness.parts.map(function (x) { return [x.name, x.pct, x.weight, x.note]; })).concat([["Overall", report.completeness.overall, "", report.completeness.label]])) } : null,
        { name: "Evidence", rows: safe([["ID", "Label", "Claim", "Evidence", "Source", "URL", "Retrieved"]].concat(report.evidence.map(function (x) { return [x.id, x.label, x.claim, x.evidenceText, x.sourceName, x.sourceUrl, x.retrievedAt]; }))) },
      ].filter(Boolean), { title: "FODO Business X-Ray" }), fname("xlsx"), { kind: "Excel" });
    }
    if (k === "share") { var u = location.origin + ROOT + "business-x-ray/?r=" + report.jobId; (X.copyText ? X.copyText(u, "Copy the share link") : navigator.clipboard.writeText(u)).then(function (h) { if (h === "copied") { var o = b.textContent; b.textContent = "Link copied ✓"; setTimeout(function () { b.textContent = o; }, 2000); } }); }
    track("xray_export", { kind: k }); ping(k === "share" ? "share" : "export_" + k, report.business.domain);
  });
  /* v13 white-label (Agency): the PDF carries the agency's name, colour and logo instead of FODO's */
  function whiteLabel() {
    var u = ACC && ACC.current(), br = u && u.brand; if (!br || !br.name || !hasF(report, "whiteLabel") || !report.features) return null;
    var hex = /^#([0-9a-f]{6})$/i.exec(br.color || ""), acc = hex ? [0, 2, 4].map(function (i) { return parseInt(hex[1].substr(i, 2), 16) / 255; }) : null, logo = null;
    if (/^data:image\/jpeg;base64,/.test(br.logo || "")) { try { var bin = atob(br.logo.split(",")[1]), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); logo = a; } catch (e) {} }
    var swap = function (t) { return typeof t === "string" ? t.replace(/FODO Business X-Ray/g, br.name + " Website X-Ray").replace(/ \| FODO tool: [^|]*/g, "") : t; };
    return { meta: { title: br.name + " - Website X-Ray - " + report.business.name.value, footer: "Prepared by " + br.name + " - " + report.input.url + " - " + new Date(report.createdAt).toLocaleDateString(), accent: acc, logo: logo, whiteLabel: true },
      blocks: function (bl) { return bl.map(function (b) { var o = {}; Object.keys(b).forEach(function (k2) { o[k2] = Array.isArray(b[k2]) ? b[k2].map(function (x) { return Array.isArray(x) ? x.map(swap) : swap(x); }) : swap(b[k2]); }); return o; }).filter(function (b) { return !(b.p && /Every number in this report comes from/.test(b.p)); }).concat([{ p: "Prepared by " + br.name + ". Data from the website itself, Google Search, Google PageSpeed Insights and the other sources named in each finding.", muted: true, size: 8.5 }]); } };
  }
  /* the PDF is built from the report data (structured text), not from a screenshot of the page */
  function pdfBlocks(r) {
    var B = r.business, A = r.scores.areas, syn = r.synthesis, out = [], P = function (o) { out.push(o); };
    var ev = function (ids) { ids = (ids || []).filter(Boolean); return ids.length ? " [Evidence: " + ids.slice(0, 6).join(", ") + "]" : ""; };
    var opp = function (id) { return oppById(r, id); };
    P({ h1: "FODO Business X-Ray: " + B.name.value }); P({ p: r.input.url + " | " + new Date(r.createdAt).toLocaleString() + " | " + r.crawl.pages + " pages read", muted: true });
    P({ pill: "Digital Growth Health " + (r.scores.overall == null ? "-" : r.scores.overall + "/100") + " | " + r.scores.status + " | based on " + r.scores.basedOn + " of " + r.scores.of + " areas" });
    if (r.completeness) P({ p: "Data completeness " + r.completeness.overall + "% (research quality, not a business score)" + (r.completeness.partial ? " - PARTIAL ANALYSIS. Missing: " + r.completeness.missing.join("; ") : "") + " | Data collected " + new Date(r.createdAt).toLocaleDateString(), muted: true, size: 8.5 });
    P({ h2: "1. Executive Summary" }); P({ p: syn.executiveSummary }); P({ p: "Written by: " + r.synthesisBy, muted: true, size: 8.5 });
    if (syn.doingWell && syn.doingWell.length) { P({ h3: "Doing well" }); P({ li: syn.doingWell.map(function (x) { return x.text + ev(x.evidence); }) }); }
    if (syn.holdingBack && syn.holdingBack.length) { P({ h3: "Holding it back" }); P({ li: syn.holdingBack.map(function (x) { return x.text + ev(x.evidence); }) }); }
    P({ h2: "2. Digital Growth Health" }); P({ p: "Scores your online presence (website, search, trust signals, conversion, competition). It does not measure sales, profit or customer numbers: FODO cannot see those.", muted: true });
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
    if (r.leaks && r.leaks.length) { P({ h3: "Revenue leaks (potential impact - no rupee figure without your own data)" }); P({ li: r.leaks.map(function (x) { return x.leak + " | impact " + x.impact + ", confidence " + x.confidence + ", effort " + x.effort + " | fix: " + x.fix + ev(x.evidence); }) }); }
    if (r.matrix4) { P({ h3: "Priority matrix" }); P({ kv: [["Do first (high impact, low effort)", r.matrix4.quick.map(function (o) { return o.title; }).join("; ") || "-"], ["Plan next (high impact, high effort)", r.matrix4.big.map(function (o) { return o.title; }).join("; ") || "-"], ["Quick tidy-ups", r.matrix4.small.map(function (o) { return o.title; }).join("; ") || "-"], ["Later", r.matrix4.later.map(function (o) { return o.title; }).join("; ") || "-"]] }); }
    P({ h2: "7. 30-Day Action Plan" });
    r.plan.forEach(function (w) { P({ h3: w.label + " - " + w.focus }); P({ li: w.items.length ? w.items.map(function (i) { return "Problem: " + i.problem + ". Action: " + i.action + ". Expected impact: " + i.expectedImpact + ev(i.evidence); }) : ["Nothing left for this week - measure results."] }); });
    if (r.plan90) { P({ h3: "90-day growth roadmap (rules-based)" }); r.plan90.forEach(function (m) { P({ p: "Month " + m.month + " - " + m.name + ": " + m.goal, bold: true }); P({ li: m.items.length ? m.items.map(function (i) { return i.problem + " - " + i.task + " | KPI: " + i.kpi + ev(i.evidence); }) : ["Re-run the X-Ray to measure."] }); }); }
    P({ h2: "8. Website & Search" });
    P({ p: r.crawl.pages + " pages read | robots.txt " + (r.crawl.robotsFound ? "found" : "not found") + " | sitemap " + (r.crawl.sitemapFound ? "found" : "not found") + (r.psi ? " | PageSpeed mobile performance " + r.psi.performance + "/100" : " | Speed: " + (r.psiError || "not measured")) });
    P({ li: r.checks.filter(function (c) { return c.status === "fail" || c.status === "warn"; }).slice(0, 25).map(function (c) { return (c.status === "fail" ? "FAIL" : "WARN") + " - " + c.name + ": " + c.detail + ev(c.evidence); }) });
    if (r.keywords.length) { P({ h3: "Searches checked" + (r.volumes ? "" : " (search volume: data unavailable)") }); P({ li: r.keywords.map(function (k) { return k.keyword + " | " + k.intent + " | your position: " + (k.ourPos ? "#" + k.ourPos : "not in top 10") + " | opportunity: " + k.opportunity + (k.volume != null ? " | volume " + k.volume + " (estimated)" : ""); }) }); }
    if (r.compare && !r.compare.none) { P({ h3: "Since the last X-Ray (" + new Date(r.compare.previousDate).toLocaleDateString() + ")" }); P({ li: ["Overall: " + (r.compare.overallBefore == null ? "-" : r.compare.overallBefore) + " -> " + (r.compare.overallNow == null ? "-" : r.compare.overallNow)].concat(r.compare.areas.map(function (a) { return a.name + ": " + (a.before == null ? "-" : a.before) + " -> " + (a.now == null ? "-" : a.now); })).concat(["Fixed: " + (r.compare.fixed.join("; ") || "none"), "New: " + (r.compare.added.join("; ") || "none")]) }); }
    if (r.techStack) { P({ h3: "Technology stack (from the homepage code)" }); P({ li: r.techStack.length ? r.techStack.map(function (t) { return t.cat + ": " + t.name; }) : ["No common tools detected."] }); }
    if (r.extLinks) { P({ h3: "Outgoing links: " + r.extLinks.broken.length + " broken of " + r.extLinks.checked + " checked" }); if (r.extLinks.broken.length) P({ li: r.extLinks.broken.slice(0, 30).map(function (b) { return b.url + " -> " + (b.status || "no answer") + " (on " + b.on[0] + ")"; }) }); }
    if (r.contentGap && r.contentGap.topics.length) { P({ h3: "Content gap: topics competitors cover that your pages don't mention" }); P({ li: r.contentGap.topics.map(function (t) { return t.topic + " - " + t.count + " of " + t.of + " competitors (" + t.competitors.join(", ") + ")"; }) }); }
    P({ h2: "9. Competitors" });
    if (r.competitors.length) r.competitors.forEach(function (c) { P({ h3: c.name + " (" + c.domain + ") - confidence " + c.confidence }); P({ kv: [["Why a competitor", c.reason], ["Their advantages", c.insights.advantages.join("; ") || "None found"], ["Their weaknesses", c.insights.weaknesses.join("; ") || "None found"], ["Opportunity", c.insights.opportunity], ["Source", c.source.join(", ")]] }); });
    else P({ p: (r.modules.COMPETITORS || {}).note || "No competitors confirmed.", muted: true });
    if (r.authority && r.authority.length) { P({ h3: "Domain authority (Open PageRank 0-10, estimated)" }); P({ li: r.authority.map(function (a) { return a.domain + ": " + (a.rank == null ? "data unavailable" : a.rank.toFixed(1)) + (a.globalRank ? " (global rank #" + a.globalRank + ")" : ""); }) }); }
    if (r.compTech) Object.keys(r.compTech).forEach(function (d) { if (r.competitors.some(function (c) { return c.domain === d; }) && r.compTech[d].length) P({ p: d + " runs: " + r.compTech[d].map(function (t) { return t.name; }).join(", "), size: 9 }); });
    if (r.why && r.why.length) { P({ h3: "Why are they winning?" }); r.why.forEach(function (w) { P({ p: w.name + " (" + w.domain + ")", bold: true }); P({ li: (w.wins.length ? w.wins.map(function (a) { return "They win on " + a.area + (a.note ? ": " + a.note : " (them " + a.them + " vs you " + a.you + ")"); }) : ["Not ahead of you on the areas compared."]).concat(w.immediate.map(function (x) { return "Now: " + x.fix; })).concat(w.d30.map(function (x) { return "30 days: " + x.fix; })).concat(w.d90.map(function (x) { return "90 days: " + x.fix; })) }); }); }
    if (r.local) { P({ h3: "Local visibility (Google Maps via Serper)" }); P({ li: [r.local.me ? "Your listing: " + r.local.me.name + " - " + (r.local.me.rating != null ? r.local.me.rating + " stars, " + (r.local.me.reviews || 0) + " reviews" : "no rating") : "Your business was not found on Google Maps for your name.", "Local competitors' median: " + (r.local.medianRating != null ? r.local.medianRating + " stars" : "-") + ", " + (r.local.medianReviews || 0) + " reviews (" + r.local.compared + " listings)"] }); }
    if (r.visibility && r.visibility.score) { P({ h3: "FODO AI Visibility Score: " + r.visibility.score.score + "/100" }); P({ li: r.visibility.score.parts.map(function (x) { return x.name + ": " + x.score; }).concat([r.visibility.score.label]) }); }
    P({ h2: "10. Customer Voice" });
    if (r.voice) { P({ p: "From " + r.voice.snippets + " public text snippets (search-result excerpts, not full reviews). Data quality " + r.voice.quality + "." + (r.voice.excludedCount ? " " + r.voice.excludedCount + " result(s) about a different company with the same name were left out." : ""), muted: true }); [["Needs", r.voice.needs], ["Complaints", r.voice.complaints], ["Buying triggers", r.voice.triggers], ["Objections", r.voice.objections]].forEach(function (g) { if (g[1] && g[1].length) { P({ h3: g[0] }); P({ li: g[1].slice(0, 4).map(function (t) { return t.theme + " (" + t.count + ")" + (t.quotes[0] ? ': "' + t.quotes[0].text + '" - ' + t.quotes[0].source : ""); }) }); } }); }
    else P({ p: "Data unavailable.", muted: true });
    P({ h2: "11. AI Visibility (sampled)" });
    P({ p: r.visibility ? r.visibility.tested + " questions asked to one open model (" + r.visibility.model + "); your brand appeared in " + r.visibility.brandIn + ", competitors in " + r.visibility.compIn + ". A small sample - not your total AI visibility." : "Data unavailable." });
    var yn = function (v) { return v == null ? "-" : v === true ? "yes" : v === false ? "no" : String(v); };
    if (r.matrix) { P({ h3: "You vs competitors" }); P({ li: r.matrix.rows.map(function (row) { return row.name + ": " + r.matrix.cols.map(function (c, i) { return (c.you ? "You" : c.name) + " " + yn(row.values[i]); }).join(" | "); }) }); }
    if (r.sov) { P({ h3: "Share of Google's first page (" + r.sov.searches + " searches)" }); P({ li: r.sov.rows.map(function (x) { return x.name + (x.you ? "" : " (" + x.domain + ")") + ": " + x.share + "% - on " + x.appearances + " of " + r.sov.searches + " searches"; }) }); }
    if (r.ads) { P({ h3: "Competitor ad libraries" }); P({ li: r.ads.map(function (a) { return a.name + ": Meta " + a.meta + " | Google " + a.google; }) }); }
    if (r.kwMap && r.kwMap.length) { P({ h3: "Keyword -> page map" }); P({ li: r.kwMap.map(function (k) { return k.keyword + " -> " + (k.page || "no matching page") + " (" + k.fit + "): " + k.action; }) }); }
    if (r.tracking) { P({ h3: "Tracking & ads readiness" }); P({ li: r.tracking.rows.map(function (x) { return x.item + ": you " + (x.you == null ? "unknown" : x.you ? "yes" : "not detected") + (x.competitors == null ? "" : " | competitors " + x.competitors + " of " + x.of); }) }); }
    if (r.schema) { P({ h3: "Schema code to add (" + r.schema.type + ")" }); P({ p: r.schema.code, size: 7.5 }); }
    if (r.edge) {
      P({ h2: "FODO Edge (AI drafts - review before use)" });
      var e = r.edge;
      if (e.fixPack && !e.fixPack.error) { P({ h3: "AI Fix Pack" }); if (e.fixPack.headlines.length) P({ li: e.fixPack.headlines.map(function (x) { return "Headline: " + x; }) }); e.fixPack.pages.forEach(function (pg) { P({ kv: [["Page", pg.url], ["Title", pg.title], ["Meta", pg.meta], ["H1", pg.h1]] }); }); if (e.fixPack.faq.length) P({ li: e.fixPack.faq.map(function (q) { return q.q + " - " + q.a; }) }); }
      if (e.battleCards && !e.battleCards.error) { P({ h3: "Competitor battle cards" }); e.battleCards.cards.forEach(function (c) { P({ kv: [["Competitor", c.domain], ["They win on", c.theyWinOn.join("; ")], ["You win on", c.youWinOn.join("; ")], ["How to win", c.howToWin.join("; ")], ["Talk track", c.talkTrack]] }); }); }
      if (e.roadmap90 && !e.roadmap90.error) { P({ h3: "90-day roadmap" }); e.roadmap90.months.forEach(function (mo) { P({ p: "Month " + mo.month + ": " + mo.goal, bold: true }); P({ li: mo.weeks.map(function (w) { return "Week " + w.week + " - " + w.focus + ": " + w.tasks.join("; ") + (w.kpi ? " (measure: " + w.kpi + ")" : ""); }) }); }); }
      if (e.clientPitch && !e.clientPitch.error) { P({ h3: "Client pitch" }); P({ p: "Subject: " + e.clientPitch.subject, bold: true }); P({ p: e.clientPitch.email }); }
    }
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
  /* v17 sample report (prompt §78): a real X-Ray of a TEST website, clearly labelled demo data, never a customer */
  /* v19: background runner page (opened by FODO's runner in a headless browser, needs the job's token) */
  if (qs.get("bg") && qs.get("t")) {
    window.__fodoBg = null; status("Background X-Ray runner…", "busy");
    fetch(ROOT + "api/xray/bg/job/" + encodeURIComponent(qs.get("bg")) + "?t=" + encodeURIComponent(qs.get("t"))).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok || !j.jobId) throw new Error(j.reason || "not allowed");
      busy = true; curJob = j.jobId; return execute(j, j.input);
    }).then(function (rep) { busy = false; window.__fodoBg = { ok: true, jobId: rep && rep.jobId, opportunities: rep ? rep.opportunities.length : 0 }; status("Background X-Ray saved.", "ok"); },
      function (e) { busy = false; window.__fodoBg = { ok: false, error: String((e && e.message) || e).slice(0, 200), refundable: !!(e && e.refundable) }; status("Background X-Ray stopped: " + window.__fodoBg.error, "warn"); });
  } else {
    var bgP = fetch(ROOT + "api/xray/health").then(function (r) { return r.json(); }).then(function (h) { if (h && h.background && $("xr-bgwrap")) $("xr-bgwrap").hidden = false; }, function () {});
  }
  if (qs.get("bg")) { /* runner page: nothing else to load */ }
  else if (qs.get("r") === "sample") {
    status("Loading the sample report…", "busy");
    fetch(ROOT + "data/xray-sample.json").then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("The sample report is not available.")); }).then(function (rep) { report = rep; render(rep);
      var b = document.createElement("div"); b.className = "panel xr-limited xr-demo"; b.setAttribute("role", "note"); b.innerHTML = '<span class="tag hot">DEMO REPORT: SAMPLE DATA</span><p>This is a real Business X-Ray of <b>a test website</b> (' + esc(rep.business.domain) + ') built for demos, not a real business or customer. Every number on it was produced by the same engine your X-Ray uses. <a href="' + ROOT + 'business-x-ray/">Run your own X-Ray →</a></p>';
      $("xr-report").insertBefore(b, $("xr-report").firstChild); status("Sample report (demo data from a test website).", "ok"); }, function (e) { status(e.message, "warn"); });
  } else if (qs.get("tool") && qs.get("run") && qs.get("u")) {
    // v18: a standalone tool's fresh scan, paid/checked on the server (the run id is tied to this account and website)
    $("xr-url").value = qs.get("u");
    catalog().then(function (c) { var t = c && c.ok ? (c.tools || []).filter(function (x) { return x.id === qs.get("tool"); })[0] : null; var n = document.createElement("p"); n.className = "xr-focus panel"; n.innerHTML = "<b>" + esc(t ? t.name : "Pro tool") + "</b>, researching " + esc(qs.get("u")) + ". When it finishes, the report opens at " + esc(t ? t.name : "the tool") + "."; $("xr-form").insertBefore(n, $("xr-form").firstChild); });
    var go0 = function () { run({ toolRun: qs.get("run") }); };
    if (ACC) Promise.all([ACC.config().then(function () { return ACC.me(); }), bgP]).then(go0, go0); else go0();
  } else if (qs.get("u") && qs.get("go") === "1" && !qs.get("r")) {
    // v21: a one-click "start this X-Ray" link (e.g. from FODO Brain), fills the address and starts it for the logged-in user
    $("xr-url").value = qs.get("u");
    var go1 = function () { $("xr-form").requestSubmit ? $("xr-form").requestSubmit() : $("xr-form").dispatchEvent(new Event("submit", { cancelable: true })); };
    if (ACC) Promise.all([ACC.config().then(function () { return ACC.me(); }), bgP]).then(go1, go1); else go1();
  } else if (qs.get("r")) {
    status("Loading the saved X-Ray…", "busy");
    call("report/" + encodeURIComponent(qs.get("r")), undefined, { tries: 2 }).then(function (r) { return r.ok ? r.json() : r.status === 403 ? r.json().then(function (j) { throw new Error((j.reason || "This report is private.") + " Log in as its owner to open it."); }) : r.status === 404 ? call("status/" + encodeURIComponent(qs.get("r")), undefined, { tries: 1 }).then(function (x) { return x.json(); }).then(function (s) {
        // v19: a background X-Ray that is still running → watch it here
        if (s && s.ok && s.status !== "COMPLETE" && s.status !== "FAILED") return watch(qs.get("r"));
        throw new Error(s && s.status === "FAILED" ? (s.note || "This X-Ray could not finish.") : "This report was not found or has expired.");
      }) : Promise.reject(new Error("Could not load the report.")); })
      .then(function (rep) { report = rep; $("xr-url").value = rep.input.url; render(rep); track("report_view", { tool: "xray" }); status("Saved X-Ray from " + new Date(rep.createdAt).toLocaleString() + ". Run it again for fresh data.", "ok"); }, function (e) { status(e.message, "warn"); });
  }
  /* ---------- v13 account bits on the form: plan note, client folder (Agency), bulk X-Ray (Agency) ---------- */
  if (ACC) ACC.config().then(function (c) {
    if (!c.enabled) return;
    var note = $("xr-note"), fp = (c.plans || [])[0] || {};
    ACC.onChange(function (u) {
      me = u;
      if (note) note.innerHTML = (u ? "<b>" + esc(u.planName) + " plan</b> · " + u.credits.total + " X-Ray" + (u.credits.total === 1 ? "" : "s") + " left · each reads up to " + u.limits.MAX_PAGES + " pages and " + u.limits.MAX_COMPETITORS + " competitors. " : "<b>Log in free</b> to run your first " + (fp.xrays || 2) + " X-Rays. ") + '<a href="' + ROOT + 'plans/">Plans</a>. It takes 1–4 minutes, keep this tab open. FODO only reads public pages and never logs in anywhere.';
      var F = u ? u.limits.features : [], box = $("xr-agency");
      if (F.indexOf("clients") > -1 || F.indexOf("bulk") > -1) {
        if (!box) { box = document.createElement("div"); box.id = "xr-agency"; box.className = "xr-agency"; form.querySelector(".btn-row").insertAdjacentElement("beforebegin", box); }
        box.innerHTML = (F.indexOf("clients") > -1 ? '<div class="cf-f"><label for="xr-client">Client folder</label><select id="xr-client"><option value="">No client</option></select></div>' : "") +
          (F.indexOf("bulk") > -1 ? '<details class="xr-opt"><summary>Bulk X-Ray <span class="muted">(up to 20 websites, one after another)</span></summary><label for="xr-bulk" class="muted">One website per line</label><textarea id="xr-bulk" rows="4" placeholder="client1.com&#10;client2.in"></textarea><button type="button" class="btn sm ghost" id="xr-bulk-go">Run all</button><ol id="xr-bulk-list" class="xr-bulk-list"></ol></details>' : "");
        if ($("xr-client")) ACC.api("clients").then(function (j) { $("xr-client").innerHTML = '<option value="">No client</option>' + (j.items || []).map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.name) + "</option>"; }).join(""); });
        if ($("xr-bulk-go")) $("xr-bulk-go").onclick = bulk;
      } else if (box) box.remove();
    });
  });
  function bulk() {
    var list = $("xr-bulk").value.split(/[\n,]+/).map(function (x) { return x.trim(); }).filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i; }).slice(0, 20), ol = $("xr-bulk-list");
    if (!list.length) return; ol.innerHTML = list.map(function (u, i) { return '<li id="xr-b' + i + '">' + esc(u) + ' <small class="muted">waiting</small></li>'; }).join("");
    list.reduce(function (p, u, i) { return p.then(function () { $("xr-b" + i).querySelector("small").textContent = "running…"; return run({ url: u, name: "", industry: "", city: "", product: "", audience: "" }).then(function (rep) { $("xr-b" + i).innerHTML = rep ? '<a href="' + ROOT + "business-x-ray/?r=" + encodeURIComponent(rep.jobId) + '" target="_blank" rel="noopener">' + esc(u) + "</a>: " + (rep.scores.overall == null ? "—" : rep.scores.overall) + "/100" : esc(u) + ' <small class="muted">' + esc($("xr-status").textContent) + "</small>"; }); }); }, Promise.resolve());
  }
  /* v17: a Growth Lab tool card links here with ?focus=…, say which part of the X-Ray it opens */
  (function () { var f = qs.get("focus"), names = { leaks: "Revenue Leak Finder", conversion: "Conversion X-Ray", website: "Website Health Audit", competitors: "Competitor War Room", why: "Why Are They Winning?", market: "Market Position Analyzer", ai: "AI Visibility Audit", search: "Search Visibility Audit", local: "Local Visibility Audit", presence: "Brand Presence Audit", offer: "Offer Strength Analyzer", plan: "30-Day Growth Blueprint", roadmap: "90-Day Growth Roadmap" };
    if (names[f] && $("xr-note")) { var n = document.createElement("p"); n.className = "xr-focus panel"; n.innerHTML = "<b>" + esc(names[f]) + "</b> runs inside the Business X-Ray, it needs the same research. Run it once and the report opens at " + esc(names[f]) + "."; $("xr-form").insertBefore(n, $("xr-form").firstChild); } })();
  window.FODO_XRAY = { report: function () { return report; }, run: run };
})();
