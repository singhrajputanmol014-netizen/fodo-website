/* FODO Bot — product & member layer (v20.3). Loaded LAST in the bot chain (after bot-llm.js).
   The bot now knows everything built on the site, always with LIVE data — nothing is hard-coded here:
     /api/help/kb        help articles + live plan / pack / tool prices (the same source as the Help page)
     /api/lab/catalog    the Growth Lab tools: what each does, its one-run price, which plans already include it, its page
     /api/help/me        the person's OWN account (plan, X-Rays left, latest X-Ray with its top actions, tool runs, tickets)
     data/search-index.json  every page of the site (for "where do I find …")
   It answers Growth Lab / plan / price / account questions exactly; everything else goes to the existing chain unchanged.
   Paying members: personal answers from their own plan and latest X-Ray; coaching questions go to the AI (which sees
   their report) when AI replies are on. */
(function () {
  "use strict";
  var B = window.FODO_BOT, U = window.FODO_UTIL;
  if (!B || typeof B.answer !== "function" || !U) return;
  var ROOT = U.root || "/", esc = U.esc || function (s) { return String(s); };
  var A = function (p, t) { return '<a href="' + esc(ROOT + p) + '">' + esc(t) + "</a>"; };
  var D = { kb: null, cat: null, me: undefined, idx: null }, meAt = 0;

  /* ---------- live data (cached for the tab; the account is re-read every 2 minutes) ---------- */
  function cached(path, key, ttl) {
    try { var c = JSON.parse(sessionStorage.getItem(key) || "null"); if (c && Date.now() - c.t < ttl) return Promise.resolve(c.d); } catch (e) {}
    return fetch(ROOT + path, { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j) { try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d: j })); } catch (e) {} } return j; }, function () { return null; });
  }
  function loadMe(force) {
    if (!force && D.me !== undefined && Date.now() - meAt < 120000) return Promise.resolve(D.me);
    return fetch(ROOT + "api/help/me", { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { D.me = j && j.ok ? j.facts || null : null; meAt = Date.now(); return D.me; }, function () { D.me = null; return null; });
  }
  function loadAll() {
    return Promise.all([
      D.kb ? D.kb : cached("api/help/kb", "fodo-bot-kb", 30 * 60e3).then(function (j) { D.kb = j && j.ok ? j : null; }),
      D.cat ? D.cat : cached("api/lab/catalog", "fodo-bot-cat", 30 * 60e3).then(function (j) { D.cat = j && j.ok ? j : null; }),
      loadMe()]);
  }
  function loadIdx() { return D.idx ? Promise.resolve(D.idx) : cached("data/search-index.json", "fodo-bot-idx", 60 * 60e3).then(function (j) { D.idx = Array.isArray(j) ? j : []; return D.idx; }); }
  setTimeout(loadAll, 300);
  try { if (window.FODO_ACCOUNT && window.FODO_ACCOUNT.onChange) window.FODO_ACCOUNT.onChange(function () { meAt = 0; D.me = undefined; }); } catch (e) {}

  /* ---------- understanding ---------- */
  var HI = /[ऀ-ॿ]|\b(kya|hai|hain|mera|meri|mere|kitne|kitna|kitni|kaise|batao|bataiye|chahiye|karu|karun|karna|bache|baki|bacha|kaun|kab|nahi|hoga|milega|kahan|kaha|wala|wale)\b/i;
  var PRICEW = /\b(price|prices|pricing|kitna|kitne|kitni|cost|costs|charges?|fees?|rate|rates|₹|rs\.?|rupees?|paisa|paise|subscription)\b/i;
  var LABW = /\b(x-?rays?|growth lab|lab|starter|agency plan|pro plan|growth plan|packs?|pro tools?|plans)\b/i;
  var ASKW = /\b(what|which|kya|kaun|kaunse|konse|batao|tell|show|list|explain|samjhao|dikhao|do you have|hai kya)\b/i;
  // "my plan", "mera plan kya hai", "plan kaunsa hai mera", "kitne x-ray bache" — the possessive must sit next to the thing,
  // so "my d2c brand … content plan" or "improve my landing page" stay with the marketing brain
  var OWN = "(?:my|mera|meri|mere|apna|apni|apne)", THING = "(?:current |active )?(?:plan|subscription|x-?rays?|credits?|reports?|account|tickets?|payments?|pro tools?|tool runs?)";
  var MINE = new RegExp("\\b" + OWN + "\\s+" + THING + "\\b|(?:^|\\s)" + THING + "\\b[^.?!]{0,16}\\b(?:mera|meri|mere|apna|apni)\\s*(?:hai|he|h)?\\W*$", "i");   // Hindi: "plan kaunsa hai mera"
  var LEFT = /\b(left|remaining|bache|baki|bacha|bachi)\b/i;
  var COACH = /\b(fix first|pehle kya (fix|theek|karu|karun)|kya fix kar|what (should|do) i fix|what should i do first|where do i start|kahan se shuru|explain my (report|x-?ray)|(report|x-?ray) samjhao|meri report|my report|my x-?ray|mera x-?ray|improve my (score|growth health))\b/i;
  var FREEW = /\b(free tools?|free me|free mein|muft|free kya|without (paying|login)|bina paise)\b/i;
  var ARTW = /\b(x-?ray|growth lab|refund|renew|auto.?renew|cancel (my )?(plan|subscription)|invoice|gst bill|receipt|log ?in|otp|login code|monitor(ing)?|search console|gsc|white.?label|bulk x-?ray|team seats?|client folders?|ticket|help desk|support|data completeness|data unavailable|ai visibility|fodo edge|competitor finder|share (link|report)|download (report|pdf)|pdf report|excel|compare (with )?(last|previous)|background)\b/i;
  var WHERE = /\b(where|kahan|kaha|which page|kis page|link)\b/i;
  var TOOLS = [["revenue-leak", /revenue leak/], ["conversion-xray", /conversion x-?ray/], ["website-health", /website health/], ["war-room", /war ?room/],
    ["why-winning", /why (are )?they winning|why.?winning/], ["market-position", /market position/], ["ai-visibility", /ai visibility (audit|tool)/], ["search-visibility", /search visibility/],
    ["local-visibility", /local visibility/], ["brand-presence", /brand presence/], ["offer-strength", /offer strength/], ["blueprint30", /(30.?day )?growth blueprint|blueprint/],
    ["roadmap90", /90.?day (growth )?roadmap/]];
  function toolOf(q) { for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i][1].test(q)) return TOOLS[i][0]; return null; }
  function intent(q) {
    var n = String(q || "").toLowerCase();
    if (COACH.test(n) && /report|x-?ray|score|growth health/.test(n)) return "coach";   // "what should I fix first?" alone stays with the marketing brain
    if (MINE.test(n) || (LEFT.test(n) && /x-?rays?|credits?/.test(n))) return "mine";
    var t = toolOf(n); if (t) return "tool:" + t;
    if (FREEW.test(n) && /tools?|kya|what|which/.test(n)) return "free";
    if (LABW.test(n) && (PRICEW.test(n) || ASKW.test(n)) && !/\b(marketing|content|90.?day|30.?60.?90|business|social|ad|ads|media) plans?\b/.test(n)) return /x-?ray kya|what is (a |the )?(business )?x-?ray|x-?ray (kya|what)/.test(n) ? "article" : "plans";
    if (ARTW.test(n)) return "article";
    return null;
  }

  /* ---------- answers ---------- */
  function T(hi, en, h) { return h ? hi : en; }
  function chips(l) { try { B.setChips(l); } catch (e) {} }
  var prices = function () { return D.kb && D.kb.prices; };
  function plansAns(h) {
    var P = prices(), c = D.cat;
    if (!P) return T("Growth Lab ke plans aur live prices yahan hain: ", "The Growth Lab plans and live prices are here: ", h) + A("plans/", "Plans") + ".";
    var cheapest = c && c.tools ? Math.min.apply(null, c.tools.filter(function (t) { return t.price; }).map(function (t) { return t.price; })) : null;
    return "<b>" + T("FODO Growth Lab — plans (live prices)", "FODO Growth Lab — plans (live prices)", h) + "</b><ul>" + P.plans.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" +
      "<b>" + T("X-Ray packs (kabhi expire nahi hote)", "X-Ray packs (never expire)", h) + ":</b> " + esc(P.packs.join(" · ")) + "<br>" +
      (cheapest && isFinite(cheapest) ? T("Ek Pro tool ek baar chalane ke liye ₹" + cheapest.toLocaleString("en-IN") + " se. ", "Single Pro tool runs from ₹" + cheapest.toLocaleString("en-IN") + ". ", h) : "") +
      T("Higher plan zyada pages aur competitors padhte hain aur report ke zyada sections kholte hain. ", "Higher plans read more pages and competitors and unlock more report sections. ", h) +
      A("plans/", T("Plans compare karo →", "Compare plans →", h)) + " · " + A("growth-lab/", "Growth Lab");
  }
  function toolAns(id, h) {
    var t = D.cat && D.cat.tools && D.cat.tools.filter(function (x) { return x.id === id; })[0];
    if (!t) return T("Is tool ki details aur live price iske page par hain: ", "This tool's details and live price are on its page: ", h) + A("growth-lab/" + id + "/", "open →");
    if (t.on === false) return esc(t.name) + T(" abhi available nahi hai. ", " is not available right now. ", h) + A("growth-lab/", "Growth Lab");
    var me = D.me, inc = (t.includedIn || []), mine = me && me.plan && inc.indexOf(me.plan) > -1;
    return "<b>" + esc(t.name) + "</b> — " + esc(t.line || "") + "<br>" +
      (t.price ? T("Ek run: <b>₹" + Number(t.price).toLocaleString("en-IN") + "</b>. ", "One run: <b>₹" + Number(t.price).toLocaleString("en-IN") + "</b>. ", h) : "") +
      (inc.length ? T(inc.join(", ") + " plan ke X-Ray mein pehle se shamil hai. ", "Already included in X-Rays on " + inc.join(", ") + ". ", h) : "") +
      (mine ? "<b>" + T("Aapke " + esc(me.plan) + " plan mein yeh shamil hai — alag se kharidne ki zaroorat nahi.", "Your " + esc(me.plan) + " plan includes it — no need to buy it separately.", h) + "</b> " : "") +
      T("Agar same website ka full X-Ray pichhle 30 din mein chala hai to tool usi se khul jaata hai. ", "If you ran a full X-Ray of the same website in the last 30 days, the tool opens straight from it. ", h) +
      A(t.where || "growth-lab/" + id + "/", T("Tool kholo →", "Open the tool →", h));
  }
  function freeAns(h) {
    var L = [["business-x-ray/", "Business X-Ray", T("login ke baad 2 free", "2 free after login", h)], ["growth-score/", "Growth Score", T("10 sawaal, 0–100 score", "10 questions, a 0–100 score", h)],
      ["roi-calculator/", "ROI Calculator", T("ad spend se leads aur payback", "leads and payback from ad spend", h)], ["marketing-budget/", "Marketing Budget Planner", T("budget channels mein baanto", "split a budget across channels", h)],
      ["competitor-finder/", "Competitor Finder", T("aas-paas ke ya brand ke competitors", "nearby or brand competitors", h)], ["fodo-challenge/", "FODO Challenge", T("2 minute ka game", "a 2-minute game", h)],
      ["marketing-quiz/", "Marketing Quiz", ""], ["templates/", "Templates", ""], ["resources/", "Checklists", ""], ["teardowns/", "Teardowns", ""]];
    return "<b>" + T("Free tools (bina paise):", "Free tools:", h) + "</b><ul>" + L.map(function (x) { return "<li>" + A(x[0], x[1]) + (x[2] ? " — " + esc(x[2]) : "") + "</li>"; }).join("") + "</ul>";
  }
  function articleAns(q, h) {
    var a = search(q)[0];
    if (!a) return null;
    return "<b>" + esc(a.q) + "</b><br>" + esc(a.a) + (a.link ? "<br>" + A(a.link, T("Aur dekho →", "More →", h)) : "") +
      "<br><small>" + T("Kuch aur chahiye? ", "Need a person? ", h) + A("help/", T("Help page par ticket kholo", "Open a ticket on the Help page", h)) + "</small>";
  }
  function search(q) {
    var arts = (D.kb && D.kb.articles) || [], w = String(q).toLowerCase().split(/[^a-z0-9ऀ-ॿ-]+/).filter(function (x) { return x.length > 2 && !/^(the|and|for|you|your|how|what|kya|hai|mera|meri|can|does|with|this|that|are|kaise)$/.test(x); });
    return arts.map(function (a) { var t = (a.q + " " + a.a).toLowerCase(), qq = a.q.toLowerCase(); return { a: a, s: w.reduce(function (s, x) { return s + (qq.indexOf(x) > -1 ? 3 : t.indexOf(x) > -1 ? 1 : 0); }, 0) }; })
      .filter(function (x) { return x.s >= 3; }).sort(function (x, y) { return y.s - x.s; }).map(function (x) { return x.a; });
  }
  function mineAns(q, h) {
    var me = D.me;
    if (!me) return T("Apna plan, bache hue X-Rays aur reports dekhne ke liye pehle log in karo: ", "To see your own plan, X-Rays left and reports, please log in first: ", h) + A("account/?login=1", T("Log in →", "Log in →", h));
    var L = me.xraysLeft, left = typeof L === "string" ? esc(L) : (L.thisMonth || 0) + T(" is mahine", " this month", h) + (L.packs ? " + " + L.packs + " pack" : "") + (L.free ? " + " + L.free + " free" : "");
    var x = me.latestXray, out = "<b>" + T("Aapka account", "Your account", h) + "</b><ul><li>Plan: <b>" + esc(me.plan) + "</b>" + (me.planUntil ? T(" (" + esc(me.planUntil) + " tak)", " (until " + esc(me.planUntil) + ")", h) : "") + "</li>" +
      "<li>" + T("X-Rays bache: ", "X-Rays left: ", h) + "<b>" + left + "</b></li>" +
      (me.toolRuns && me.toolRuns.length ? "<li>" + T("Khareede hue tool runs: ", "Bought tool runs: ", h) + esc(me.toolRuns.join(", ")) + "</li>" : "") +
      (x ? "<li>" + T("Aakhri X-Ray: ", "Latest X-Ray: ", h) + A(String(x.link || "").replace(/^\//, ""), x.website) + (x.score ? " — " + esc(x.score) : "") + (x.date ? " (" + esc(x.date) + ")" : "") + "</li>" : "") +
      (me.openTickets && me.openTickets.length ? "<li>" + T("Khule tickets: ", "Open tickets: ", h) + esc(me.openTickets.join("; ")) + "</li>" : "") + "</ul>" + A("account/", T("Account kholo →", "Open your account →", h));
    return out;
  }
  function coachAns(h) {
    var me = D.me, x = me && me.latestXray;
    if (!me) return mineAns("", h);
    if (!x) return T("Abhi aapka koi poora X-Ray nahi hai. Pehle apni website ka ", "You don't have a finished X-Ray yet. Run one on your website first: ", h) + A("business-x-ray/", "Business X-Ray") + T(" chalao — phir main bataunga pehle kya theek karna hai.", " — then I'll tell you what to fix first.", h);
    var acts = x.topActions || [];
    return "<b>" + T("Aapke X-Ray (" + esc(x.website) + ", " + esc(x.score || "") + ") ke hisaab se pehle ye karo:", "From your X-Ray of " + esc(x.website) + " (" + esc(x.score || "") + "), do these first:", h) + "</b><ol>" +
      acts.map(function (a) { return "<li><b>" + esc(a.problem) + "</b>" + (a.priority ? " <small>[" + esc(a.priority) + "]</small>" : "") + "<br>" + esc(a.fix) + "</li>"; }).join("") + "</ol>" +
      (x.areas && x.areas.length ? "<small>" + T("Area scores: ", "Area scores: ", h) + esc(x.areas.join(" · ")) + "</small><br>" : "") +
      A(String(x.link || "").replace(/^\//, ""), T("Poori report kholo →", "Open the full report →", h)) +
      (me.paid ? "" : "<br><small>" + T("Paid plans mein main har action step-by-step samjhata hoon aur re-scan se progress compare hoti hai. ", "On paid plans I coach every action step by step and re-scans show your progress. ", h) + A("plans/", "Plans") + "</small>");
  }
  function whereAns(q, h) {
    var w = String(q).toLowerCase().split(/[^a-z0-9-]+/).filter(function (x) { return x.length > 3 && !/^(where|kahan|which|page|link|find|milega|hai|the|what|this)$/.test(x); });
    if (!w.length || !D.idx) return null;
    var hits = D.idx.map(function (p) { var t = (p.t + " " + (p.d || "") + " " + (p.h || []).join(" ")).toLowerCase(); return { p: p, s: w.reduce(function (s, x) { return s + (String(p.t).toLowerCase().indexOf(x) > -1 ? 3 : t.indexOf(x) > -1 ? 1 : 0); }, 0) }; })
      .filter(function (x) { return x.s >= 3; }).sort(function (a, b) { return b.s - a.s; }).slice(0, 3);
    if (!hits.length) return null;
    return T("Yeh pages dekho:", "These pages have it:", h) + "<ul>" + hits.map(function (x) { return "<li>" + A(x.p.u || "", x.p.t) + (x.p.d ? " — <small>" + esc(String(x.p.d).slice(0, 110)) + "</small>" : "") + "</li>"; }).join("") + "</ul>";
  }
  function productAnswer(q, it) {
    var h = HI.test(q), r = null;
    if (it === "mine") { r = mineAns(q, h); chips(["What should I fix first in my X-Ray?", "Plans", "Pro tools"]); }
    else if (it === "coach") { r = coachAns(h); chips(["My plan", "Plans", "Talk to a person"]); }
    else if (it && it.indexOf("tool:") === 0) { r = toolAns(it.slice(5), h); chips(["Plans", "Free tools", "Business X-Ray"]); }
    else if (it === "free") { r = freeAns(h); chips(["Plans", "Business X-Ray", "Pro tools"]); }
    else if (it === "plans") { r = plansAns(h); chips(["Pro tools", "Free tools", "My plan"]); }
    else if (it === "article") { r = articleAns(q, h); if (r) chips(["Plans", "Pro tools", "Talk to a person"]); }
    if (!r && WHERE.test(q)) r = whereAns(q, h);
    if (r) { try { B.lastKey = "product"; } catch (e) {} }
    return r;
  }
  /* "how much do you charge?" — keep FODO's service pricing answer, and add the self-serve prices under it */
  var CHARGE = /\b(how much|charge|charges|pricing|price|prices|fees?|kitna|kitne|cost)\b/i;
  function augment(q, out) {
    if (typeof out !== "string" || !CHARGE.test(q) || /Growth Lab/i.test(out) || !prices()) return out;
    var P = prices(), st = (P.plans || []).filter(function (x) { return /^Starter/.test(x); })[0];
    return out + "<br><br><b>Self-serve (Growth Lab):</b> " + T("login ke baad 2 free Business X-Rays", "2 free Business X-Rays after login", HI.test(q)) + (st ? "; " + esc(st) : "") + ". " + A("plans/", T("Saare plans →", "All plans →", HI.test(q)));
  }

  /* ---------- wiring ---------- */
  var inner = B.answer;
  B.answer = function (q) {
    var it = intent(q);
    var ready = it === "free" || ((it === "mine" || it === "coach") ? D.me !== undefined : !!D.kb);
    if (it && ready) { var r = productAnswer(q, it); if (r) return r; }
    if (!D.kb) loadAll();
    return augment(q, inner.apply(B, arguments));
  };
  var innerA = B.answerAsync;
  if (typeof innerA === "function") {
    B.answerAsync = function (q) {
      var it = intent(q), LLM = window.FODO_BOT_LLM;
      if (!it && !WHERE.test(q)) return innerA.apply(B, arguments);
      // a paying member asking for coaching → the AI (it sees their latest X-Ray) when AI replies are on
      if (it === "coach" && LLM && LLM.aiOn && LLM.aiOn() && LLM.member && LLM.member() && LLM.member().paid) return innerA.apply(B, arguments);
      var args = arguments;
      return Promise.all([loadAll(), WHERE.test(q) ? loadIdx() : null]).then(function () {
        var r = productAnswer(q, it);
        if (!r) return innerA.apply(B, args);
        try { if (LLM && LLM.remember) { LLM.remember("user", q); LLM.remember("assistant", r.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 800)); } } catch (e) {}
        try { if (window.FODO_TRACK) window.FODO_TRACK("bot_answer", { source: "product", intent: String(it || "where").slice(0, 30) }); } catch (e) {}
        return r;
      });
    };
  }
  window.FODO_BOT_PRODUCT = { version: "2026.10.30", intent: intent, data: D, reload: function () { D.kb = D.cat = null; D.me = undefined; return loadAll(); } };
})();
