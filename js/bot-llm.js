/* FODO Bot: AI layer.
 * Adds FODO_BOT.answerAsync(): asks the AI endpoint (/api/chat, Cloudflare Workers AI) and falls back to the
 * offline rules bot whenever the AI is unavailable, rate-limited, out of daily quota, or the page is opened as a local file.
 * Switches live in js/config.js:  llmMode ("llm-first" | "local-first" | "off"), llmEndpoint, llmMaxPerSession.
 * Loaded LAST in the bot chain (after bot-human.js). */
(function () {
  "use strict";
  var B = window.FODO_BOT, U = window.FODO_UTIL, C = window.FODO || {};
  if (!B || typeof B.answer !== "function" || !U) return;

  // OFF by default: the site bot runs fully offline unless js/config.js sets llmMode ("llm-first" | "local-first")
  // AND the Cloudflare Pages Function at /api/chat is deployed with a Workers AI binding named AI.
  // "auto" (default): use AI only when the /api/chat backend answers its health check with ai:true, so the same files
  // work on a static upload (stays offline) and on a Git/Functions deploy (AI switches on by itself).
  var MODE = C.llmMode || "auto";
  var probe = null;   // null = unknown, true/false = backend healthy?
  var ENDPOINT = C.llmEndpoint || "/api/chat";
  var MAX_SESSION = +C.llmMaxPerSession || 40;
  var TIMEOUT_MS = 28000;
  var route = (document.body && document.body.dataset && document.body.dataset.route) || "";
  var NOTE_AI = "Enter to send · AI-assisted replies · please don’t share passwords or card details";
  var NOTE_OFFLINE = "Enter to send · Replies are generated offline";

  var hist = [];       // [{role:"user"|"assistant", content:"plain text"}], this tab only (sessionStorage), so the chat remembers across pages
  var failures = 0;    // consecutive hard failures (404, network) → circuit breaker
  var disabledUntil = 0;
  var used = 0;

  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (_) { } return null; }
  used = parseInt(ss("fodo-llm-used") || "0", 10) || 0;
  var HKEY = "fodo-llm-hist";
  try { var hh = JSON.parse(ss(HKEY) || "[]"); if (Array.isArray(hh)) hist = hh.filter(function (m) { return m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"; }).slice(-16); } catch (_) { hist = []; }
  function saveHist() { try { sessionStorage.setItem(HKEY, JSON.stringify(hist)); } catch (_) { } }
  disabledUntil = parseInt(ss("fodo-llm-off") || "0", 10) || 0;

  /* Visitor switch (v10): AI replies are OFF until the visitor turns them on, the offline engine answers otherwise. */
  /* v20.3: a paying member gets AI replies on by default (they can still switch them off), a bigger session allowance and a badge */
  var member = null; try { member = JSON.parse(ss("fodo-llm-member") || "null"); } catch (_) { member = null; }
  function paid() { return !!(member && member.paid); }
  function aiPref() { try { var v = localStorage.getItem("fodo-ai"); return v === "on" || (v !== "off" && paid()); } catch (_) { return paid(); } }
  function aiAvailable() { return MODE !== "off" && !!ENDPOINT && !(MODE === "auto" && probe !== true) && location.protocol !== "file:"; }
  function aiPossible() {
    if (MODE === "off" || !ENDPOINT) return false;
    if (!aiPref()) return false;
    if (MODE === "auto" && probe !== true) return false;
    if (location.protocol === "file:") return false;           // local double-click preview has no backend
    if (navigator.onLine === false) return false;
    if (Date.now() < disabledUntil) return false;
    if (used >= (paid() ? Math.max(MAX_SESSION, 200) : MAX_SESSION)) return false;   // protects the free daily allowance from one visitor
    return true;
  }
  function pause(ms) { disabledUntil = Date.now() + ms; ss("fodo-llm-off", String(disabledUntil)); setNote(); }

  /* ---------- composer note ---------- */
  function setNote() {
    var n = document.getElementById("bot-composer-note");
    if (n) n.textContent = aiPossible() ? NOTE_AI : NOTE_OFFLINE;
    ensureToggle();
  }
  function ensureToggle() {
    var n = document.getElementById("bot-form"); if (!n) return;
    var sw = document.getElementById("bot-ai-toggle");
    if (!aiAvailable()) { if (sw) sw.hidden = true; return; }
    if (!sw) {
      sw = document.createElement("button"); sw.type = "button"; sw.id = "bot-ai-toggle"; sw.className = "bot-ai-sw"; sw.setAttribute("role", "switch");
      sw.innerHTML = '<span class="bot-sw" aria-hidden="true"><i></i></span><span class="bot-sw-l">AI replies <b></b></span><span class="bot-sw-h"></span>';
      sw.addEventListener("click", function () {
        var on = !aiPref(); try { localStorage.setItem("fodo-ai", on ? "on" : "off"); } catch (_) { }
        track("bot_ai_toggle", { state: on ? "on" : "off" }); setNote();
      });
      n.parentNode.insertBefore(sw, n);
      if (!document.getElementById("bot-ai-sw-css")) { var st = document.createElement("style"); st.id = "bot-ai-sw-css";
        st.textContent = ".bot-ai-sw{display:flex;align-items:center;gap:8px;width:calc(100% - 24px);margin:6px 12px 0;padding:6px 2px;border:0;background:none;color:inherit;font:inherit;font-size:12.5px;cursor:pointer;text-align:left}.bot-ai-sw[hidden]{display:none}.bot-sw{position:relative;flex:0 0 auto;width:30px;height:18px;border-radius:99px;background:rgba(127,127,127,.35);transition:background .2s}.bot-sw i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3);transition:transform .2s}.bot-ai-sw[aria-checked=true] .bot-sw{background:var(--accent,#5B3DF5)}.bot-ai-sw[aria-checked=true] .bot-sw i{transform:translateX(12px)}.bot-sw-l b{font-weight:700}.bot-sw-h{margin-left:auto;opacity:.7;font-size:11.5px}.bot-ai-sw:focus-visible{outline:2px solid var(--accent,#5B3DF5);outline-offset:2px;border-radius:8px}";
        document.head.appendChild(st); }
    }
    var on = aiPref(); sw.hidden = false; sw.setAttribute("aria-checked", on ? "true" : "false");
    sw.querySelector("b").textContent = on ? "On" : "Off";
    sw.querySelector(".bot-sw-h").textContent = on ? "for open-ended questions" : "turn on only when you need it";
    sw.setAttribute("aria-label", "AI replies " + (on ? "on" : "off"));
  }
  { var pc = ss("fodo-llm-probe"); if (pc === "1" || pc === "0") probe = pc === "1"; }   // cached result applies at once, no 600 ms gap
  setNote();
  function runProbe() {
    if (MODE !== "auto" || location.protocol === "file:") return;
    var c = ss("fodo-llm-probe"); if (c === "1" || c === "0") { probe = c === "1"; setNote(); return; }
    var ctl = ("AbortController" in window) ? new AbortController() : null, t = setTimeout(function () { if (ctl) ctl.abort(); }, 5000);
    fetch(ENDPOINT, { method: "GET", headers: { accept: "application/json" }, signal: ctl ? ctl.signal : undefined, cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
      .then(function (j) { clearTimeout(t); probe = !!(j && j.ok && j.ai); ss("fodo-llm-probe", probe ? "1" : "0"); setMember(j && j.member); setNote(); });
  }
  function setMember(m) { member = m || null; ss("fodo-llm-member", JSON.stringify(member)); badge(); }
  function badge() {
    var h = document.querySelector(".bot-head, #bot-panel header, .bot-panel header"); if (!h) return;
    var b = document.getElementById("bot-member");
    if (!paid()) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement("span"); b.id = "bot-member"; b.className = "bot-member"; b.style.cssText = "margin-left:8px;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;background:rgba(124,92,255,.18);color:inherit;white-space:nowrap"; (h.querySelector("div > b") || h).appendChild(b); }
    b.textContent = member.plan + " · priority";
  }
  // logging in or out changes what the bot may say (own plan, own reports) → ask the server again
  function reprobe() { try { sessionStorage.removeItem("fodo-llm-probe"); } catch (_) { } probe = null; MODE === "auto" ? runProbe() : setMember(null); }
  try { if (window.FODO_ACCOUNT && window.FODO_ACCOUNT.onChange) { var lastId = null, first = true; window.FODO_ACCOUNT.onChange(function (u) { var id = u ? (u.id || u.email || "x") : null; if (!first && id !== lastId) reprobe(); first = false; lastId = id; }); } } catch (_) { }
  document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest(".bot-fab")) setTimeout(badge, 80); }, true);
  setTimeout(runProbe, 600);
  document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest(".bot-fab")) setTimeout(setNote, 60); }, true);
  [800, 2000, 4000].forEach(function (ms) { setTimeout(ensureToggle, ms); });   // plain timer: idle callbacks can starve while the 3D background animates
  function track(name, params) { try { if (window.FODO_TRACK) window.FODO_TRACK(name, params); } catch (_) { } }

  /* small style for code blocks the AI may return (kept here so no stylesheet cache needs bumping) */
  try {
    var st = document.createElement("style");
    st.textContent = ".msg pre.bot-code{margin:8px 0 0;padding:10px 12px;border-radius:10px;background:rgba(127,127,127,.14);overflow-x:auto;font-size:12px;line-height:1.5;white-space:pre}.msg code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em}";
    document.head.appendChild(st);
  } catch (_) { }

  /* ---------- helpers ---------- */
  function htmlToText(html) {
    var d = document.createElement("div");
    d.innerHTML = String(html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n");
    d.querySelectorAll(".hi").forEach(function (n) { n.remove(); });   // drop the Hindi echo line
    return (d.textContent || "").replace(/\s+\n/g, "\n").trim().slice(0, 700);
  }
  function remember(role, text) {
    text = String(text || "").trim();
    if (!text) return;
    hist.push({ role: role, content: text.slice(0, 900) });
    if (hist.length > 16) hist.splice(0, hist.length - 16);
    saveHist();
  }
  var lastLocalChips = null;
  function safeLocal(q) {
    // Run the offline engine for its side effects (session memory) while capturing, not applying, its chips.
    var setChips = B.setChips, out = null; lastLocalChips = null;
    try { B.setChips = function (l) { lastLocalChips = l; }; out = B.answer(q); } catch (e) { out = null; } finally { B.setChips = setChips; }
    return typeof out === "string" ? out : null;
  }

  /* Questions the offline engine answers better than any model: maths/metrics (exact), navigation chips, tiny talk. */
  var NAV = ["what do you do?", "what does fodo do?", "pricing", "free audit", "play the game", "contact anmol", "founding programme", "growth score", "quiz", "roi calculator", "game"];
  var TINY = /^(hi+|hello+|hey+|hii+|namaste|thanks?|thank you|thx|bye|good (morning|evening|night)|shukriya|dhanyavaad)\W*$/i;
  // Short replies that only make sense with the conversation ("haan", "ok", "yes please", "aur batao", "kar do", "nahi"...)
  var FOLLOW = /^(ha+n*|haa+|han|hm+|ji+|ji haan|yes+|yeah|yep|yup|ya+|sure|ok+|okay|okk|theek( hai)?|thik( hai)?|accha|acha|achha|bilkul|zaroor|kar do|karo|chalo|go ahead|please|yes please|do it|continue|aur|aur batao|more|next|phir|then|nahi|nhi|no|nope|na|why|kyun|kyu|kaise|how|example|details?|samjhao|explain)\b/i;
  function isFollowUp(q) { var n = q.trim().toLowerCase(); return hist.length > 0 && n.length <= 40 && n.split(/\s+/).length <= 6 && FOLLOW.test(n); }
  var MATHY = /[0-9]/;
  var MATHOP = /[+\-*/^()%×÷]|\b(?:calculate|calc|compute|solve|times|plus|minus|divided by|percent of|to the power)\b/i;
  function deterministic(q) {
    var K = window.FODO_BOT_CALCULATOR;
    if (!K) return false;
    try {
      if (MATHY.test(q) && MATHOP.test(q) && K.calculate(q)) return true;
      if (K.calculateMetric && K.calculateMetric(q)) return true;
    } catch (_) { }
    return false;
  }
  function localWins(q, local) {
    var n = q.trim().toLowerCase();
    if (NAV.indexOf(n) > -1) return true;
    if (deterministic(q)) return true;                                   // exact maths always from the calculator
    if (local && /14416|Tele-MANAS/i.test(local)) return true;          // crisis support always from the vetted offline text
    if (isFollowUp(q)) return false;                                     // "haan / ok / aur batao" → the AI, which sees the whole chat
    if (TINY.test(n) && !hist.length) return true;                       // a first "hi" / "thanks" needs no model
    // Safety (crisis support) always comes from the offline engine; numeric funnel maths too, but only when this message has numbers.
    try { var st = window.FODO_MIND && window.FODO_MIND.state; var lt = st && st.lastTopic || ""; if (/^(metric|funnel|target)$/.test(lt) && /\d/.test(q) && st.lastQ === q) return true; } catch (_) { }
    if (MODE === "local-first") return !isWeak(local);
    return false;
  }
  function isWeak(local) {
    if (!local) return true;
    try { if (window.FODO_MIND && /^(low|unknown)$/.test(window.FODO_MIND.lastConfidence)) return true; } catch (_) { }
    var t = htmlToText(local);
    return /outside my notes|rather not guess|solid answer for that here|tell me a bit more so i can answer|not fully sure|don.?t know|couldn.?t find|try (asking|rephras)|scenic detour|marketing brain is looking|where does the CTA go|my strongest superpower/i.test(t);
  }

  /* ---------- safe rendering of model text ---------- */
  var PATHS = ["services", "industries", "work", "insights", "resources", "growth-score", "roi-calculator", "fodo-challenge", "marketing-quiz", "about", "faq", "reviews", "legal", "contact", "thank-you",
    "business-x-ray", "growth-lab", "plans", "pricing", "account", "help", "competitor-finder", "marketing-budget", "templates", "teardowns", "founding-programme", "locations"];
  function safeHref(u) {
    u = String(u || "").trim();
    var site = String(C.siteUrl || "").replace(/\/$/, "");
    if (site && u.indexOf(site + "/") === 0) u = u.slice(site.length);
    if (u === "/") return { href: U.root || "./", ext: false };
    if (u.charAt(0) === "/" && u.charAt(1) !== "/") {
      var seg = u.slice(1).split(/[/?#]/)[0];
      if (PATHS.indexOf(seg) > -1) return { href: (U.root || "./") + u.slice(1), ext: false };
      return null;
    }
    var wa = "https://wa.me/" + C.whatsappNumber;
    if (C.whatsappNumber && (u === wa || u.indexOf(wa + "?") === 0 || u.indexOf(wa + "/") === 0)) return { href: u, ext: true };
    if (C.email && (u === "mailto:" + C.email || u.indexOf("mailto:" + C.email + "?") === 0)) return { href: u, ext: true };
    return null;   // any other URL is shown as plain text, never as a link
  }
  function inline(p) {
    var s = U.esc(p);
    s = s.replace(/\[([^\]\n]{1,90})\]\(([^)\s]{1,500})\)/g, function (m, t, u) {
      var h = safeHref(u.replace(/&amp;/g, "&"));
      if (!h) return t;
      return '<a href="' + U.esc(h.href) + '"' + (h.ext ? ' target="_blank" rel="noopener noreferrer"' : "") + ">" + t + "</a>";
    });
    s = s.replace(/\*\*([^*\n]{1,120})\*\*/g, "<b>$1</b>");
    s = s.replace(/`([^`\n]{1,120})`/g, "<code>$1</code>");
    s = s.split("\n").map(function (line) { return line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, function (m) { return /\d/.test(m) ? m.trim() + " " : "• "; }); }).join("<br>");
    return s.replace(/(<br>){3,}/g, "<br><br>");
  }
  function render(text) {
    var parts = String(text || "").split(/```[a-zA-Z0-9]*\n?/);
    return parts.map(function (p, i) {
      if (i % 2) return '<pre class="bot-code"><code>' + U.esc(p.replace(/\n+$/, "")) + "</code></pre>";
      return inline(p.trim());
    }).join("");
  }

  /* ---------- network ---------- */
  function contextSnapshot() {
    try { var s = window.FODO_BOT_CONTEXT && window.FODO_BOT_CONTEXT.snapshot(); if (!s) return {}; delete s.name; delete s.website; delete s.competitors; return s; } catch (_) { return {}; }
  }
  function callAI(q, prior) {
    var ctl = ("AbortController" in window) ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT_MS);
    used++; ss("fodo-llm-used", String(used));
    return fetch(ENDPOINT, {
      method: "POST", credentials: "same-origin", signal: ctl ? ctl.signal : undefined,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: q, history: prior.slice(-12), context: contextSnapshot(), page: route })
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        clearTimeout(timer);
        if (res.ok && data && data.ok && data.reply) { failures = 0; return String(data.reply); }
        var code = data && data.code;
        if (code === "quota") pause(15 * 60 * 1000);                    // daily free allowance used up: stay offline for a while
        else if (res.status === 429 || code === "rate_limited") pause(60 * 1000);
        else if (res.status === 404 || res.status === 405 || res.status === 403 || code === "no_ai_binding" || !data) { if (++failures >= 2) pause(30 * 60 * 1000); }
        throw new Error(code || ("http " + res.status));
      });
    }, function (err) { clearTimeout(timer); if (++failures >= 2) pause(10 * 60 * 1000); throw err; });
  }

  /* ---------- public entry point used by bot.js ---------- */
  B.answerAsync = function (q) {
    q = String(q || "").trim();
    var t0 = Date.now();
    if (!aiPossible()) { var h0 = B.answer(q); remember("user", q); remember("assistant", htmlToText(h0)); track("bot_answer", { source: "offline" }); return Promise.resolve(h0); }
    var local = safeLocal(q);
    var prior = hist.slice();          // earlier turns only, the current question travels separately as `message`
    remember("user", q);
    var useLocal = function () {
      if (local && lastLocalChips) { try { B.setChips(lastLocalChips); } catch (_) { } }
      var html = local || B.answer(q);
      remember("assistant", htmlToText(html));
      return html;
    };
    if (!aiPossible() || localWins(q, local)) { track("bot_answer", { source: "local" }); return Promise.resolve(useLocal()); }
    return callAI(q, prior).then(function (text) {
      remember("assistant", text); track("bot_answer", { source: "ai", latency_ms: Date.now() - t0 });
      B.lastKey = "ai";
      try { B.setChips(["Free audit", "Pricing", "Contact Anmol"]); } catch (_) { }
      return render(text);
    }).catch(function (err) {
      track("bot_answer", { source: "fallback", reason: String((err && err.code) || (err && err.message) || "error").slice(0, 40) });
      return useLocal();   // never leave the visitor without an answer
    });
  };

  // "New conversation" clears the model's memory too.
  document.addEventListener("click", function (ev) {
    if (ev.target && ev.target.closest && ev.target.closest(".bot-new")) { hist.length = 0; saveHist(); }
  });
  window.FODO_BOT_LLM = { version: "2026.10.30", mode: MODE, endpoint: ENDPOINT, render: render, safeHref: safeHref, aiOn: aiPossible, member: function () { return member; }, remember: remember,
    state: function () { return { used: used, failures: failures, pausedUntil: disabledUntil, history: hist.length, member: member }; } };
})();
