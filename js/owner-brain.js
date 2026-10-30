/* FODO BRAIN — owner command center (/owner-brain/). The page holds no data: everything comes from /api/owner-brain/*, which
   checks the owner session on the server. Anyone else sees a plain "Page not found". */
(function () {
  "use strict";
  var app = document.getElementById("ob"), API = "/api/owner-brain/";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var api = function (path, method, body) {
    return fetch(API + path, { method: method || (body ? "POST" : "GET"), credentials: "same-origin", cache: "no-store", headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return { ok: false, reason: "No answer (" + r.status + ")." }; }).then(function (j) { j._s = r.status; return j; }); }, function () { return { ok: false, reason: "No connection." }; });
  };
  var S = { status: null, thread: null, voiceOut: false, busy: false };
  try { S.voiceOut = localStorage.getItem("ob-voice") === "1"; S.thread = sessionStorage.getItem("ob-thread"); } catch (e) {}
  var fmtDate = function (t) { if (!t) return "—"; var d = new Date(t); return isNaN(d) ? esc(t) : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); };
  var inr = function (n) { return n == null ? "—" : "₹" + Number(n).toLocaleString("en-IN"); };
  var num = function (n) { return n == null ? "—" : Number(n).toLocaleString("en-IN"); };
  var badge = function (s) { return '<span class="ob-badge ' + esc(s) + '">' + esc(s) + "</span>"; };

  /* safe markdown-lite: **bold**, `code`, bullets, numbered lists, [text](/path or https) */
  function md(t) {
    var lines = String(t || "").split("\n"), out = [], list = null;
    var inl = function (s) { return esc(s).replace(/\*\*([^*]{1,200})\*\*/g, "<b>$1</b>").replace(/_\(([^)]{1,200})\)_/g, "<i>($1)</i>").replace(/`([^`]{1,120})`/g, "<code>$1</code>")
      .replace(/\[([^\]]{1,120})\]\(((?:\/(?!\/)|https:\/\/)[^)\s]{1,400})\)/g, function (m, a, h) { var ext = /^https:/.test(h), host = ext ? (/^https:\/\/([^/?#]+)/.exec(h) || [])[1] || "" : ""; return '<a href="' + h.replace(/"/g, "%22") + '"' + (ext ? ' target="_blank" rel="noopener noreferrer nofollow"' : "") + ">" + a + "</a>" + (ext ? ' <small class="ob-empty">(' + host + ")</small>" : ""); }); };
    var close = function () { if (list) { out.push("</" + list + ">"); list = null; } };
    lines.forEach(function (l) {
      var b = /^\s*[-*•]\s+(.*)$/.exec(l), n = /^\s*\d+[.)]\s+(.*)$/.exec(l), h = /^\s*#{1,4}\s+(.*)$/.exec(l);
      if (b || n) { var k = b ? "ul" : "ol"; if (list !== k) { close(); out.push("<" + k + ">"); list = k; } out.push("<li>" + inl((b || n)[1]) + "</li>"); }
      else { close(); if (h) out.push("<p><b>" + inl(h[1]) + "</b></p>"); else if (l.trim()) out.push("<p>" + inl(l) + "</p>"); }
    });
    close(); return out.join("");
  }

  /* ---------------- boot: authenticate on the server, then render ---------------- */
  api("status").then(function (s) {
    if (!s.ok) { document.title = "Page not found — FODO"; app.className = "ob-gate"; app.innerHTML = "<div><h1>Page not found</h1><p>This page doesn't exist. <a href=\"/\">Go to FODO</a></p></div>"; return; }
    S.status = s; frame(); window.addEventListener("hashchange", go); go();
    setInterval(function () { if (!document.hidden) api("status").then(function (x) { if (x.ok) { S.status = x; pill(); } }); }, 60000);
  });

  var NAV = [["Command", [["home", "Overview", "◎"], ["chat", "Brain", "✦"], ["alerts", "Notifications", "◉"]]], ["Work", [["tasks", "Tasks & projects", "☑"], ["memory", "Memory", "◈"], ["knowledge", "Knowledge", "▤"]]],
    ["System", [["activity", "Activity", "≡"], ["tools", "Tools", "⚙"], ["diagnostics", "Diagnostics", "✚"], ["analytics", "Analytics", "▦"], ["settings", "Settings", "⋯"]]]];
  function frame() {
    document.title = "FODO BRAIN";
    app.className = "ob-app";
    app.innerHTML = '<aside class="ob-side" id="ob-side"><div class="ob-brand"><span class="ob-orb" id="ob-orb"></span><span><b>FODO BRAIN</b><small>OWNER ONLY</small></span></div><nav class="ob-nav">' +
      NAV.map(function (g) { return '<div class="grp">' + g[0] + "</div>" + g[1].map(function (n) { return '<a href="#' + n[0] + '" data-v="' + n[0] + '"><span aria-hidden="true">' + n[2] + "</span>" + n[1] + (n[0] === "alerts" ? '<span class="n" id="ob-alertn" hidden></span>' : "") + "</a>"; }).join(""); }).join("") +
      '</nav><div class="foot">Signed in as ' + esc(S.status.owner.email) + '<br><a href="/admin/">Admin</a> · <a href="/">Website</a></div></aside>' +
      '<div class="ob-main"><header class="ob-top"><button class="ob-menu" id="ob-menu" aria-label="Menu">☰</button><h1>FODO BRAIN</h1><span class="tag">OWNER ONLY</span><span class="sp"></span><button class="ob-pill" id="ob-pill" aria-haspopup="true"><span class="ob-dot" id="ob-dot"></span><span id="ob-pillt">BRAIN ONLINE</span></button></header><main class="ob-view" id="ob-view"></main></div>';
    document.getElementById("ob-menu").onclick = function () { document.getElementById("ob-side").classList.toggle("open"); };
    document.getElementById("ob-pill").onclick = statusPop; pill();
  }
  function pill() {
    var s = S.status, ai = s.ai.status === "online", bad = s.database !== "healthy";
    var dot = document.getElementById("ob-dot"); if (!dot) return;
    dot.className = "ob-dot" + (bad ? " err" : !ai ? " warn" : "");
    document.getElementById("ob-pillt").textContent = bad ? "DATABASE ISSUE" : ai ? "BRAIN ONLINE" : "BRAIN · NO AI";
    var n = document.getElementById("ob-alertn"); if (n) { n.hidden = !s.active_alerts; n.textContent = s.active_alerts; }
  }
  function statusPop(e) {
    e.stopPropagation(); var old = document.getElementById("ob-pop"); if (old) { old.remove(); return; }
    var s = S.status, p = document.createElement("div"); p.className = "ob-pop"; p.id = "ob-pop";
    var pr = s.ai.providers;
    p.innerHTML = "<b>Brain status</b><ul>" + [["Brain", s.brain], ["Database", s.database], ["AI", s.ai.status], ["Workers AI", pr["workers-ai"] ? "connected" : "not connected"], ["Groq", pr.groq ? "connected" : "not connected"], ["Gemini", pr.gemini ? "connected" : "not connected"], ["Memory", s.memory.active + " active"], ["Tools", s.tools + " registered"], ["Background runner", s.runner], ["Open alerts", s.active_alerts], ["Open tasks", s.open_tasks]].map(function (r) { return "<li><span>" + r[0] + "</span><b>" + esc(r[1]) + "</b></li>"; }).join("") + '</ul><p style="margin:10px 0 0"><a href="#diagnostics">Run full diagnostics →</a></p>';
    document.body.appendChild(p); setTimeout(function () { document.addEventListener("click", function h() { p.remove(); document.removeEventListener("click", h); }); }, 0);
  }
  var V = function () { return document.getElementById("ob-view"); };
  function go() {
    var h = (location.hash || "#home").slice(1).split("/"), v = h[0] || "home";
    document.querySelectorAll(".ob-nav a").forEach(function (a) { a.classList.toggle("on", a.dataset.v === v); });
    document.getElementById("ob-side").classList.remove("open");
    var f = VIEWS[v] || VIEWS.home; V().innerHTML = '<p class="ob-empty">Loading…</p>'; f(h[1]);
  }
  var busy = function (on) { var o = document.getElementById("ob-orb"); if (o) o.classList.toggle("busy", !!on); };

  /* ---------------- views ---------------- */
  var VIEWS = {};
  VIEWS.home = function () {
    var name = (S.status.owner.name || "").split(" ")[0] || "Anmol", hr = new Date().getHours(), greet = hr < 5 ? "Working late" : hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
    V().innerHTML = '<p class="ob-greet">' + greet + ", " + esc(name) + '.</p><p class="ob-sub" id="ob-hsub">Loading FODO\'s live status…</p>' +
      '<form class="ob-cmd" id="ob-cmd"><span class="ob-orb" aria-hidden="true" style="width:18px;height:18px"></span><input id="ob-cmdin" placeholder="Ask FODO Brain anything…" autocomplete="off" aria-label="Ask FODO Brain"><button class="ob-btn pri" type="submit">Ask</button></form>' +
      '<div class="ob-quick">' + [["System check", "Run a full system check."], ["Today's brief", "How is FODO doing today?"], ["Business analysis", "Analyze today's business and what changed this week."], ["Latest X-Ray", "Analyze the latest X-Ray."], ["Growth opportunities", "What should I focus on?"], ["Costs", "What's costing us the most this month?"], ["Create task", "#tasks"], ["Upload knowledge", "#knowledge"]].map(function (q) { return '<button class="ob-btn sm" data-q="' + esc(q[1]) + '">' + q[0] + "</button>"; }).join("") + "</div>" +
      '<div id="ob-hbody"><p class="ob-empty">Loading the briefing…</p></div>';
    document.getElementById("ob-cmd").onsubmit = function (e) { e.preventDefault(); var v = document.getElementById("ob-cmdin").value.trim(); if (v) ask(v); };
    V().querySelectorAll("[data-q]").forEach(function (b) { b.onclick = function () { var q = b.dataset.q; if (q.charAt(0) === "#") location.hash = q; else ask(q); }; });
    busy(true);
    api("briefing?ai=0").then(function (b) { busy(false); if (!document.getElementById("ob-hbody")) return; if (!b.ok) { document.getElementById("ob-hbody").innerHTML = '<p class="ob-empty">' + esc(b.reason) + "</p>"; return; } renderHome(b); });
  };
  function renderHome(b) {
    if (!document.getElementById("ob-hsub")) return;   // the owner already moved to another view
    var t = b.today, h = b.health;
    document.getElementById("ob-hsub").innerHTML = "FODO is " + (h ? (h.overall === "HEALTHY" ? "operational" : h.overall === "DEGRADED" ? "running with warnings" : "having failures") : "—") + " · " + (b.alerts || []).length + " open alert(s) · " + (b.tasks || []).length + " open task(s)";
    var stat = h ? h.checks.filter(function (c) { return ["database", "workers-ai", "groq", "gemini", "runner", "email", "research", "memory"].indexOf(c.id) > -1 || /^src_(search|crawler)/.test(c.id); }).map(function (c) { return '<div class="ob-st"><span class="k">' + esc(c.name) + "</span>" + badge(c.status) + "</div>"; }).join("") : '<p class="ob-empty">No health data.</p>';
    var k = function (v, l, s) { return '<div class="ob-card ob-kpi"><b>' + v + "</b><span>" + l + "</span>" + (s ? "<small>" + s + "</small>" : "") + "</div>"; };
    var kp = t ? '<div class="ob-grid g5">' + k(num(t.users.signups.today), "sign-ups today", num(t.users.signups.last7days) + " in 7 days · " + num(t.users.total) + " total") + k(num(t.xrays.daily.today), "X-Rays today", num(t.xrays.daily.last7days) + " in 7 days (prev " + num(t.xrays.daily.previous7days) + ")") +
      k(inr(t.revenueINR.daily.today), "revenue today", inr(t.revenueINR.thisMonth) + " this month") + k(num(t.leads ? t.leads.total : null), "warm leads", "out of free X-Rays, not paid") + k(num(t.helpDesk ? t.helpDesk.open : null), "open tickets", t.helpDesk ? t.helpDesk.unansweredOver24h + " waiting > 24 h" : "help desk off") + "</div>" : '<p class="ob-empty">Business data unavailable.</p>';
    var al = (b.alerts || []).length ? '<ul class="ob-list">' + b.alerts.slice(0, 6).map(function (a) { return '<li>' + badge(a.severity) + '<div class="t"><b>' + esc(a.title) + "</b><small>" + esc(a.reason) + (a.action ? " → " + esc(a.action) : "") + "</small></div></li>"; }).join("") + "</ul>" : '<p class="ob-empty">No alerts. Nothing needs your attention.</p>';
    var ins = (b.insights || []).length ? '<ul class="ob-list">' + b.insights.slice(0, 6).map(function (x) { return "<li><div class=\"t\"><b>" + esc(x.title) + "</b><small>" + esc(x.detail || "") + "</small></div></li>"; }).join("") + "</ul>" : '<p class="ob-empty">No insights from the data yet.</p>';
    var tk = (b.tasks || []).length ? '<ul class="ob-list">' + b.tasks.slice(0, 6).map(function (x) { return "<li>" + badge(x.priority) + '<div class="t"><b>' + esc(x.title) + "</b><small>" + esc(x.status) + (x.project ? " · " + esc(x.project) : "") + "</small></div></li>"; }).join("") + "</ul>" : '<p class="ob-empty">No open tasks. <a href="#tasks">Create one</a>.</p>';
    document.getElementById("ob-hbody").innerHTML = kp + '<div class="ob-grid g3" style="margin-top:14px"><div class="ob-card"><h2>FODO status</h2>' + stat + '</div><div class="ob-card"><h2>Alerts</h2>' + al + '</div><div class="ob-card"><h2>Brain insights</h2>' + ins + "</div></div>" +
      '<div class="ob-grid g2" style="margin-top:14px"><div class="ob-card"><h2>Today\'s tasks</h2>' + tk + '</div><div class="ob-card"><h2>Executive briefing</h2><div id="ob-brief">' + (b.text ? '<div class="ob-brief">' + md(b.text) + "</div>" : '<p class="ob-empty">Written by the Brain from the numbers above.</p>') + '</div><div class="ob-row" style="margin-top:10px"><button class="ob-btn sm" id="ob-mkbrief">' + (b.text ? "Refresh briefing" : "Write today's briefing") + '</button><small class="ob-empty">' + (b.at ? "Updated " + fmtDate(b.at) : "") + "</small></div></div></div>";
    document.getElementById("ob-mkbrief").onclick = function () { var x = this; x.disabled = true; x.textContent = "Writing…"; busy(true); api("briefing?force=1").then(function (r) { busy(false); if (r.ok) renderHome(r); else { x.disabled = false; x.textContent = r.reason || "Failed"; } }); };
  }
  function ask(q) { location.hash = "#chat"; setTimeout(function () { send(q); }, 50); }

  /* ---- chat ---- */
  VIEWS.chat = function (tid) {
    if (tid) S.thread = tid;
    V().innerHTML = '<div class="ob-chat"><div class="ob-threads" id="ob-threads"><button class="ob-btn sm" id="ob-new" style="width:100%;margin-bottom:8px">+ New conversation</button><div id="ob-tl"></div></div>' +
      '<div class="ob-conv"><div class="ob-log" id="ob-log" aria-live="polite"></div><form class="ob-compose" id="ob-form"><textarea class="ob-ta" id="ob-in" placeholder="Ask, command or say “remember …” — Enter to send, Shift+Enter for a new line" aria-label="Message"></textarea>' +
      '<button type="button" class="ob-btn ob-mic" id="ob-mic" title="Push to talk" aria-label="Voice input">🎙</button><button type="button" class="ob-btn" id="ob-spk" title="Read answers aloud" aria-pressed="' + S.voiceOut + '">' + (S.voiceOut ? "🔊" : "🔈") + '</button><button class="ob-btn pri" type="submit">Send</button></form></div></div>';
    document.getElementById("ob-new").onclick = function () { S.thread = null; try { sessionStorage.removeItem("ob-thread"); } catch (e) {} VIEWS.chat(); };
    var inp = document.getElementById("ob-in");
    document.getElementById("ob-form").onsubmit = function (e) { e.preventDefault(); var v = inp.value.trim(); if (v) { inp.value = ""; send(v); } };
    inp.onkeydown = function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); document.getElementById("ob-form").requestSubmit(); } };
    voice(); threads();
    var log = document.getElementById("ob-log");
    if (S.thread) api("thread/" + encodeURIComponent(S.thread)).then(function (j) { if (!j.ok) { S.thread = null; hello(); return; } log.innerHTML = ""; j.messages.forEach(function (m) { m.role === "user" ? bubbleU(m.content) : bubbleA({ answer: m.content, messageId: m.id, confidence: m.meta && m.meta.confidence, sources: m.meta && m.meta.sources, tools_used: m.meta && m.meta.tools, model: m.meta && m.meta.model }); }); log.scrollTop = log.scrollHeight; });
    else hello();
    function hello() { log.innerHTML = '<div class="ob-msg a"><p><b>FODO Brain is ready.</b> I work from FODO\'s live data, my memory and the documents you give me. Try:</p><ul><li>How is FODO doing today?</li><li>Check the whole system.</li><li>Analyze my latest X-Ray.</li><li>Remember that we are focusing on agency clients this quarter.</li><li>What can you do?</li></ul></div>'; }
  };
  function threads() { api("threads").then(function (j) { var el = document.getElementById("ob-tl"); if (!el) return; el.innerHTML = (j.items || []).map(function (t) { return '<a href="#chat/' + esc(t.id) + '" class="' + (t.id === S.thread ? "on" : "") + '" title="' + esc(t.title) + '">' + esc(t.title) + "</a>"; }).join("") || '<p class="ob-empty">No conversations yet.</p>'; }); }
  function bubbleU(t) { var d = document.createElement("div"); d.className = "ob-msg u"; d.textContent = t; document.getElementById("ob-log").appendChild(d); return d; }
  function bubbleA(r) {
    var d = document.createElement("div"); d.className = "ob-msg a";
    var src = (r.sources || []).map(function (s) { return s.name; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
    d.innerHTML = md(r.answer) + (r.actions || []).map(function (a) { return '<div class="ob-act" data-id="' + esc(a.id) + '" data-tok="' + esc(a.token) + '"><b>Needs your confirmation</b> · ' + badge(a.risk || "") + "<pre>" + esc(a.preview) + '</pre><div class="ob-row"><button class="ob-btn sm" data-d="cancel">Cancel</button><button class="ob-btn sm pri" data-d="run">Execute</button><small class="ob-empty">Expires in ' + (a.expiresInMin || 15) + " min</small></div></div>"; }).join("") +
      '<div class="ob-meta">' + (r.confidence ? badge(r.confidence) : "") + (src.length ? "<span>Based on: " + esc(src.join(", ")) + "</span>" : "") + (r.model ? "<span>· " + esc(r.model) + "</span>" : "") + (r.messageId ? '<span style="margin-left:auto"></span><button data-f="1" aria-label="Useful">👍</button><button data-f="-1" aria-label="Not useful">👎</button><button data-why="1">Why?</button>' : "") + "</div>";
    d.querySelectorAll(".ob-act button").forEach(function (b) { b.onclick = function () { var box = b.closest(".ob-act"); box.querySelectorAll("button").forEach(function (x) { x.disabled = true; });
      api("confirm", "POST", { actionId: box.dataset.id, token: box.dataset.tok, decision: b.dataset.d === "cancel" ? "cancel" : "run" }).then(function (j) { box.innerHTML = j.ok ? (j.cancelled ? "<b>Cancelled.</b> Nothing was done." : "<b>Done.</b> " + esc(summ(j.result))) : "<b>Not executed:</b> " + esc(j.error || j.reason); }); }; });
    d.querySelectorAll("[data-f]").forEach(function (b) { b.onclick = function () { var note = b.dataset.f === "-1" ? prompt("What was wrong? (optional)") || "" : ""; api("feedback", "POST", { messageId: r.messageId, rating: +b.dataset.f, note: note }); b.parentNode.querySelectorAll("[data-f]").forEach(function (x) { x.disabled = true; }); b.style.borderColor = "#8b7bff"; }; });
    var w = d.querySelector("[data-why]"); if (w) w.onclick = function () { send("Why? Give me the evidence for your last answer."); };
    document.getElementById("ob-log").appendChild(d); return d;
  }
  function summ(x) { if (!x) return ""; if (x.sent) return "Email sent to " + x.to + ". " + (x.note || ""); if (x.changed) return x.kind + " " + x.id + " now costs ₹" + Number(x.price).toLocaleString("en-IN") + "."; if (x.deleted) return "Deleted “" + (x.title || x.deleted) + "”."; if (x.done) return x.email + (x.blocked ? " blocked." : " unblocked."); return JSON.stringify(x).slice(0, 200); }
  var STEPS = ["Retrieving data…", "Checking FODO systems…", "Reading memory…", "Analyzing results…"];
  function send(q) {
    if (S.busy) return; var log = document.getElementById("ob-log"); if (!log) { ask(q); return; }
    if (/FODO Brain is ready/.test(log.textContent) && log.children.length === 1) log.innerHTML = "";
    S.busy = true; busy(true); bubbleU(q);
    var w = document.createElement("div"); w.className = "ob-msg a"; w.innerHTML = '<div class="ob-steps"><span class="ob-orb busy" style="width:14px;height:14px"></span><span id="ob-step">' + STEPS[0] + "</span></div>"; log.appendChild(w); log.scrollTop = log.scrollHeight;
    var i = 0, tick = setInterval(function () { var s = document.getElementById("ob-step"); if (s) s.textContent = STEPS[++i % STEPS.length]; }, 1600);
    api("chat", "POST", { message: q, threadId: S.thread }).then(function (r) {
      clearInterval(tick); w.remove(); S.busy = false; busy(false);
      if (!r.ok) { bubbleA({ answer: "**I couldn't answer:** " + (r.reason || r.error || "error") }); return; }
      if (r.threadId && r.threadId !== S.thread) { S.thread = r.threadId; try { sessionStorage.setItem("ob-thread", r.threadId); } catch (e) {} threads(); }
      bubbleA(r); log.scrollTop = log.scrollHeight; if (S.voiceOut) speak(r.answer);
      if (r.memory_updates && r.memory_updates.length || /create_task|remember/.test(r.intent || "")) api("status").then(function (x) { if (x.ok) { S.status = x; pill(); } });
    });
  }
  /* ---- voice: push-to-talk (browser speech recognition) + spoken replies ---- */
  function voice() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition, mic = document.getElementById("ob-mic"), spk = document.getElementById("ob-spk");
    spk.onclick = function () { S.voiceOut = !S.voiceOut; try { localStorage.setItem("ob-voice", S.voiceOut ? "1" : "0"); } catch (e) {} spk.textContent = S.voiceOut ? "🔊" : "🔈"; spk.setAttribute("aria-pressed", S.voiceOut); if (!S.voiceOut && window.speechSynthesis) speechSynthesis.cancel(); };
    if (!SR) { mic.disabled = true; mic.title = "Voice input is not supported in this browser (try Chrome)"; return; }
    var rec = null;
    mic.onclick = function () {
      if (rec) { rec.stop(); return; }
      rec = new SR(); rec.lang = "en-IN"; rec.interimResults = true; rec.continuous = false; mic.classList.add("on");
      var inp = document.getElementById("ob-in"), final = "";
      rec.onresult = function (e) { var t = ""; for (var k = e.resultIndex; k < e.results.length; k++) { if (e.results[k].isFinal) final += e.results[k][0].transcript; else t += e.results[k][0].transcript; } inp.value = (final + t).trim(); };
      rec.onend = function () { mic.classList.remove("on"); rec = null; var v = inp.value.trim(); if (v) { inp.value = ""; send(v.replace(/^(hey |ok |hi )?(jarvis|fodo|brain)[, ]+/i, "")); } };
      rec.onerror = function () { mic.classList.remove("on"); rec = null; };
      rec.start();
    };
  }
  function speak(t) { if (!window.speechSynthesis) return; speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(String(t).replace(/[*_`#>\[\]]|\(\/[^)]*\)/g, "").slice(0, 900)); u.lang = /[ऀ-ॿ]/.test(t) ? "hi-IN" : "en-IN"; u.rate = 1.03; speechSynthesis.speak(u); }

  /* ---- alerts ---- */
  VIEWS.alerts = function () {
    api("alerts?all=1").then(function (j) {
      var L = j.items || [];
      V().innerHTML = '<h2 class="ob-h">Notifications</h2><p class="ob-sub">Alerts the Brain found in FODO\'s real data — system failures, cost spikes, X-Ray failures, customers waiting, unusual changes. The daily scan runs with the 06:47 scheduler and whenever you open Overview.</p><div class="ob-card">' +
        (L.length ? '<ul class="ob-list">' + L.map(function (a) { return "<li>" + badge(a.severity) + '<div class="t"><b>' + esc(a.title) + "</b><small>" + esc(a.reason) + (a.evidence ? " · Evidence: " + esc(a.evidence) : "") + (a.action ? "<br>→ " + esc(a.action) : "") + "<br>" + fmtDate(a.created_at) + "</small></div>" + (a.status === "open" ? '<button class="ob-btn sm" data-ack="' + esc(a.id) + '">Acknowledge</button>' : '<span class="ob-badge">' + esc(a.status) + "</span>") + "</li>"; }).join("") + "</ul>" : '<p class="ob-empty">No alerts yet. When something needs your attention it appears here.</p>') + "</div>";
      V().querySelectorAll("[data-ack]").forEach(function (b) { b.onclick = function () { api("alerts/" + b.dataset.ack + "/ack", "POST", {}).then(function () { VIEWS.alerts(); api("status").then(function (x) { if (x.ok) { S.status = x; pill(); } }); }); }; });
    });
  };
  /* ---- tasks & projects ---- */
  VIEWS.tasks = function () {
    Promise.all([api("tasks?all=1"), api("projects")]).then(function (r) {
      var T = r[0].items || [], P = r[1].items || [], open = T.filter(function (t) { return t.status !== "done"; }), done = T.filter(function (t) { return t.status === "done"; });
      var row = function (t) { return "<tr><td>" + badge(t.priority) + '</td><td><b>' + esc(t.title) + "</b>" + (t.detail ? '<br><small class="ob-empty">' + esc(t.detail) + "</small>" : "") + "<br><small class=\"ob-empty\">" + esc(t.source || "") + "</small></td><td>" + esc(t.project || "—") + '</td><td><select class="ob-sel" data-st="' + t.id + '">' + ["suggested", "todo", "doing", "done"].map(function (s) { return "<option" + (s === t.status ? " selected" : "") + ">" + s + "</option>"; }).join("") + '</select></td><td><button class="ob-btn sm danger" data-del="' + t.id + '">Delete</button></td></tr>'; };
      V().innerHTML = '<h2 class="ob-h">Tasks & projects</h2><p class="ob-sub">Real tasks — created here or by saying “create a task to …” to the Brain. Tasks found in documents arrive as <i>suggested</i>.</p>' +
        '<form class="ob-card" id="ob-tf" style="margin-bottom:14px"><h2>New task</h2><div class="ob-grid g4"><input class="ob-in" name="title" placeholder="What needs doing?" required style="grid-column:span 2"><select class="ob-sel" name="priority"><option>P0</option><option>P1</option><option selected>P2</option><option>P3</option></select><input class="ob-in" name="project" placeholder="Project (optional)"></div><div class="ob-row" style="margin-top:10px"><input class="ob-in" name="due" type="date" style="max-width:200px"><button class="ob-btn pri" type="submit">Add task</button></div></form>' +
        (P.length ? '<div class="ob-grid g4" style="margin-bottom:14px">' + P.map(function (p) { return '<div class="ob-card ob-kpi"><b>' + p.open + '</b><span>open · ' + esc(p.project) + "</span><small>" + p.done + " done · " + p.memories + " memories</small></div>"; }).join("") + "</div>" : "") +
        '<div class="ob-card ob-scroll"><h2>Open (' + open.length + ")</h2>" + (open.length ? '<table class="ob-table"><thead><tr><th>P</th><th>Task</th><th>Project</th><th>Status</th><th></th></tr></thead><tbody>' + open.map(row).join("") + "</tbody></table>" : '<p class="ob-empty">No open tasks.</p>') + "</div>" +
        (done.length ? '<div class="ob-card ob-scroll" style="margin-top:14px"><h2>Done (' + done.length + ')</h2><table class="ob-table"><tbody>' + done.slice(0, 50).map(row).join("") + "</tbody></table></div>" : "");
      document.getElementById("ob-tf").onsubmit = function (e) { e.preventDefault(); var f = new FormData(this), b = {}; f.forEach(function (v, k) { b[k] = v; }); api("tasks", "POST", b).then(function (j) { if (j.ok) VIEWS.tasks(); else alert(j.reason); }); };
      V().querySelectorAll("[data-st]").forEach(function (s) { s.onchange = function () { api("tasks/" + s.dataset.st, "PATCH", { status: s.value }).then(function () { VIEWS.tasks(); }); }; });
      V().querySelectorAll("[data-del]").forEach(function (b) { b.onclick = function () { if (confirm("Delete this task permanently?")) api("tasks/" + b.dataset.del, "DELETE").then(function () { VIEWS.tasks(); }); }; });
    });
  };
  /* ---- memory ---- */
  var TYPES = ["FACT", "DECISION", "GOAL", "IDEA", "PREFERENCE", "NOTE", "BELIEF", "HYPOTHESIS", "PROCESS", "SOP", "INSIGHT", "WARNING", "LEARNING", "RESEARCH"];
  VIEWS.memory = function () {
    V().innerHTML = '<h2 class="ob-h">Memory</h2><p class="ob-sub">Everything the Brain remembers — view, search, edit, delete, export. Business and personal memory are kept apart. A newer decision replaces an older one (the old one stays as history, marked superseded).</p>' +
      '<div class="ob-row" style="margin-bottom:12px"><input class="ob-in" id="ob-mq" placeholder="Search memory…" style="max-width:320px"><select class="ob-sel" id="ob-mt" style="max-width:170px"><option value="">All types</option>' + TYPES.map(function (t) { return "<option>" + t + "</option>"; }).join("") + '</select><select class="ob-sel" id="ob-ms" style="max-width:150px"><option value="">Business + personal</option><option value="fodo">FODO business</option><option value="personal">Personal</option></select><select class="ob-sel" id="ob-mst" style="max-width:150px"><option value="">Active + history</option><option value="active">Active</option><option value="superseded">Superseded</option></select><a class="ob-btn sm" href="' + API + 'export">Export all (JSON)</a><button class="ob-btn sm danger" id="ob-mfp">Forget all personal</button></div>' +
      '<form class="ob-card" id="ob-mf" style="margin-bottom:14px"><h2>Add to memory</h2><div class="ob-grid g4"><select class="ob-sel" name="type">' + TYPES.map(function (t) { return "<option" + (t === "DECISION" ? " selected" : "") + ">" + t + "</option>"; }).join("") + '</select><input class="ob-in" name="title" placeholder="Short title" required style="grid-column:span 2"><select class="ob-sel" name="scope"><option value="fodo">FODO business</option><option value="personal">Personal</option></select></div><textarea class="ob-ta" name="content" placeholder="The full statement" required style="margin-top:10px;min-height:70px"></textarea><div class="ob-row" style="margin-top:10px"><input class="ob-in" name="project" placeholder="Project (optional)" style="max-width:260px"><button class="ob-btn pri" type="submit">Save</button></div></form><div class="ob-card ob-scroll" id="ob-ml"></div>';
    var load = function () { api("memory?q=" + encodeURIComponent(document.getElementById("ob-mq").value) + "&type=" + document.getElementById("ob-mt").value + "&scope=" + document.getElementById("ob-ms").value + "&status=" + document.getElementById("ob-mst").value).then(function (j) {
      var L = j.items || [], el = document.getElementById("ob-ml"); if (!el) return;
      el.innerHTML = L.length ? '<table class="ob-table"><thead><tr><th>Type</th><th>Memory</th><th>Scope</th><th>Source</th><th>Date</th><th></th></tr></thead><tbody>' + L.map(function (m) { return "<tr" + (m.status !== "active" ? ' style="opacity:.55"' : "") + "><td>" + badge(m.type) + (m.status !== "active" ? "<br><small>" + esc(m.status) + "</small>" : "") + "</td><td><b>" + esc(m.title) + '</b><br><span class="ob-empty">' + esc(m.content) + "</span>" + (m.project ? '<br><small class="ob-empty">project: ' + esc(m.project) + "</small>" : "") + "</td><td>" + esc(m.scope) + "</td><td><small>" + esc(m.source || "") + "<br>confidence " + Math.round((m.confidence || 0) * 100) + "% · imp " + m.importance + "</small></td><td><small>" + fmtDate(m.created_at) + (m.valid_until ? "<br>until " + fmtDate(m.valid_until) : "") + '</small></td><td><button class="ob-btn sm" data-ed="' + m.id + '">Edit</button> <button class="ob-btn sm danger" data-fg="' + m.id + '">Forget</button></td></tr>'; }).join("") + "</tbody></table>" : '<p class="ob-empty">No memories yet. Tell the Brain “remember …” or add one above.</p>';
      el.querySelectorAll("[data-fg]").forEach(function (b) { b.onclick = function () { if (confirm("Forget this memory permanently (with its history)?")) api("memory/" + b.dataset.fg, "DELETE").then(load); }; });
      el.querySelectorAll("[data-ed]").forEach(function (b) { b.onclick = function () { var m = L.filter(function (x) { return x.id === b.dataset.ed; })[0], c = prompt("Edit the memory:", m.content); if (c != null && c.trim() && c !== m.content) api("memory/" + m.id, "PATCH", { content: c }).then(load); }; });
    }); };
    ["ob-mq", "ob-mt", "ob-ms", "ob-mst"].forEach(function (id) { document.getElementById(id).addEventListener(id === "ob-mq" ? "input" : "change", load); });
    document.getElementById("ob-mf").onsubmit = function (e) { e.preventDefault(); var f = new FormData(this), b = {}; f.forEach(function (v, k) { b[k] = v; }); api("memory", "POST", b).then(function (j) { if (j.ok) { e.target.reset(); load(); } else alert(j.reason); }); };
    document.getElementById("ob-mfp").onclick = function () { if (confirm("Forget ALL personal memory permanently? FODO business memory is kept.")) api("memory?scope=personal", "DELETE").then(load); };
    load();
  };
  /* ---- knowledge (documents) ---- */
  VIEWS.knowledge = function () {
    V().innerHTML = '<h2 class="ob-h">Knowledge</h2><p class="ob-sub">Give the Brain a document — it extracts the summary, facts, decisions, tasks, risks and opportunities, stores them, and can find any passage later. Text files (.txt, .md, .csv, .json, .html) or pasted text; for PDF/Word, paste the text (v1).</p>' +
      '<form class="ob-card" id="ob-kf"><h2>Add a document</h2><div class="ob-grid g3"><input class="ob-in" name="title" placeholder="Title" required><select class="ob-sel" name="scope"><option value="fodo">FODO business</option><option value="personal">Personal</option></select><input class="ob-in" name="project" placeholder="Project (optional)"></div>' +
      '<div class="ob-row" style="margin:10px 0"><input type="file" id="ob-kfile" accept=".txt,.md,.markdown,.csv,.json,.html,.htm,.xml,text/*"><small class="ob-empty" id="ob-kinfo"></small></div><textarea class="ob-ta" name="text" id="ob-ktext" placeholder="…or paste the text here" style="min-height:160px"></textarea><div class="ob-row" style="margin-top:10px"><button class="ob-btn pri" type="submit">Understand this</button><span class="ob-empty" id="ob-kst"></span></div></form><div id="ob-kres"></div><div class="ob-card ob-scroll" style="margin-top:14px" id="ob-kl"></div>';
    var file = document.getElementById("ob-kfile");
    file.onchange = function () { var f = file.files[0]; if (!f) return; if (/\.(pdf|docx?|xlsx?|pptx?)$/i.test(f.name)) { document.getElementById("ob-kinfo").textContent = "PDF/Office files can't be read in this version — open it and paste the text."; file.value = ""; return; }
      if (f.size > 1.5e6) { document.getElementById("ob-kinfo").textContent = "Too large (max ~1.5 MB of text)."; file.value = ""; return; }
      var r = new FileReader(); r.onload = function () { document.getElementById("ob-ktext").value = String(r.result).slice(0, 400000); var t = document.querySelector('#ob-kf [name=title]'); if (!t.value) t.value = f.name.replace(/\.[^.]+$/, ""); document.getElementById("ob-kinfo").textContent = f.name + " · " + Math.round(f.size / 1024) + " KB loaded"; }; r.readAsText(f); };
    document.getElementById("ob-kf").onsubmit = function (e) { e.preventDefault(); var f = new FormData(this), b = { kind: (file.files[0] && file.files[0].name.split(".").pop()) || "text" }; f.forEach(function (v, k) { b[k] = v; }); var st = document.getElementById("ob-kst"); st.textContent = "Reading and understanding…"; busy(true);
      api("ingest", "POST", b).then(function (j) { busy(false); if (!document.getElementById("ob-kres")) return; st.textContent = j.ok ? "" : j.reason || j.error; if (!j.ok) return;
        var F = j.found, li = function (t, a) { return a && a.length ? "<p><b>" + t + " (" + a.length + ")</b></p><ul>" + a.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : ""; };
        document.getElementById("ob-kres").innerHTML = '<div class="ob-card" style="margin-top:14px"><h2>' + esc(j.title || "Document") + (j.version ? " · v" + j.version : "") + "</h2>" + (j.duplicate ? "<p>" + esc(j.note) + "</p>" : "<p>" + esc(j.summary) + "</p>" + (F ? li("Facts", F.facts) + li("Decisions", F.decisions) + li("Tasks", F.tasks) + li("Risks", F.risks) + li("Opportunities", F.opportunities) + li("Open questions", F.open_questions) : "") + '<p class="ob-empty">' + esc(j.note) + "</p>") + "</div>";
        e.target.reset(); file.value = ""; list(); }); };
    var list = function () { api("docs").then(function (j) { var L = j.items || [], el = document.getElementById("ob-kl"); if (!el) return; el.innerHTML = "<h2>Documents (" + L.length + ")</h2>" + (L.length ? '<table class="ob-table"><thead><tr><th>Document</th><th>Summary</th><th>Added</th><th></th></tr></thead><tbody>' + L.map(function (d) { return "<tr><td><b>" + esc(d.title) + "</b><br><small>v" + d.version + " · " + esc(d.kind) + " · " + Math.round(d.size / 1024) + " KB · " + esc(d.scope) + "</small></td><td><small>" + esc(String(d.summary || "").slice(0, 300)) + "</small></td><td><small>" + fmtDate(d.created_at) + '</small></td><td><button class="ob-btn sm danger" data-dd="' + d.id + '">Delete</button></td></tr>'; }).join("") + "</tbody></table>" : '<p class="ob-empty">No documents yet.</p>');
      el.querySelectorAll("[data-dd]").forEach(function (b) { b.onclick = function () { if (confirm("Delete this document and its passages? (Memories already extracted from it stay — delete them in Memory.)")) api("docs/" + b.dataset.dd, "DELETE").then(list); }; }); }); };
    list();
  };
  /* ---- activity (audit log) ---- */
  VIEWS.activity = function () { api("activity").then(function (j) { var L = j.items || [];
    V().innerHTML = '<h2 class="ob-h">Activity</h2><p class="ob-sub">Everything the Brain did — when, which tool, result, time, model. Arguments are stored only as a hash; secrets are never logged.</p><div class="ob-card ob-scroll">' + (L.length ? '<table class="ob-table"><thead><tr><th>When</th><th>What</th><th>Tool</th><th>Result</th><th>Time</th><th>Model</th><th>Detail</th></tr></thead><tbody>' + L.map(function (a) { return "<tr><td><small>" + fmtDate(a.t) + "</small></td><td>" + esc(a.kind) + (a.intent ? "<br><small class=\"ob-empty\">" + esc(a.intent) + "</small>" : "") + "</td><td>" + esc(a.tool || "—") + "</td><td>" + badge(a.status === "ok" ? "ok" : /error|bad|fail/.test(a.status) ? "error" : a.status) + "</td><td><small>" + (a.ms ? a.ms + " ms" : "") + "</small></td><td><small>" + esc(a.model || "") + "</small></td><td><small>" + esc(a.detail || "") + "</small></td></tr>"; }).join("") + "</tbody></table>" : '<p class="ob-empty">No activity yet.</p>') + "</div>"; }); };
  /* ---- tools ---- */
  VIEWS.tools = function () { api("tools").then(function (j) { var L = j.items || [];
    V().innerHTML = '<h2 class="ob-h">Tools</h2><p class="ob-sub">The only things the Brain can do. Reads run straight away; communication, money and destructive tools always wait for your confirmation; security tools never run.</p><div class="ob-card ob-scroll"><table class="ob-table"><thead><tr><th>Tool</th><th>Purpose</th><th>Risk</th><th>Status</th><th>Last used</th></tr></thead><tbody>' + L.map(function (t) { return "<tr><td><b>" + esc(t.name) + "</b><br><small class=\"ob-empty\">" + esc(t.cat) + "</small></td><td><small>" + esc(t.desc) + "</small></td><td>" + badge(t.never ? "critical" : t.level >= 2 ? "important" : t.level === 1 ? "info" : "ok") + "<br><small>" + esc(t.risk) + (t.confirmation && !t.never ? " · asks first" : "") + "</small></td><td>" + (t.never ? "<small>never runs</small>" : '<label><input type="checkbox" data-tool="' + esc(t.name) + '"' + (t.enabled ? " checked" : "") + "> on</label>") + "</td><td><small>" + (t.lastUsed ? fmtDate(t.lastUsed) + " · " + t.uses + "×" + (t.failures ? ", " + t.failures + " failed" : "") : "never") + "</small></td></tr>"; }).join("") + "</tbody></table></div>";
    V().querySelectorAll("[data-tool]").forEach(function (c) { c.onchange = function () { var off = {}; V().querySelectorAll("[data-tool]").forEach(function (x) { if (!x.checked) off[x.dataset.tool] = true; }); api("settings", "POST", { toolsOff: off }); }; }); }); };
  /* ---- diagnostics ---- */
  VIEWS.diagnostics = function () {
    V().innerHTML = '<h2 class="ob-h">Diagnostics</h2><p class="ob-sub">Live tests of every system — database read/write, KV, each AI provider (a tiny real request), data sources, runner, email, research, memory and tools.</p><div class="ob-card" id="ob-dg"><p class="ob-empty">Running the tests… (AI providers take a few seconds)</p></div>';
    busy(true); api("diagnostics").then(function (j) { busy(false); var el = document.getElementById("ob-dg"); if (!el) return; if (!j.ok) { el.innerHTML = '<p class="ob-empty">' + esc(j.reason) + "</p>"; return; }
      el.innerHTML = '<div class="ob-row" style="margin-bottom:10px"><b>Overall</b> ' + badge(j.overall) + '<small class="ob-empty">' + fmtDate(j.at) + '</small><button class="ob-btn sm" id="ob-dgr" style="margin-left:auto">Run again</button></div><table class="ob-table"><tbody><tr><td>Authentication</td><td>' + badge(j.auth.status) + "</td><td><small>" + esc(j.auth.evidence) + "</small></td></tr>" + j.checks.map(function (c) { return "<tr><td>" + esc(c.name) + "</td><td>" + badge(c.status) + "</td><td><small>" + esc(c.evidence) + "</small></td></tr>"; }).join("") + "</tbody></table>";
      document.getElementById("ob-dgr").onclick = VIEWS.diagnostics; });
  };
  /* ---- analytics ---- */
  VIEWS.analytics = function () { api("analytics").then(function (j) {
    var A = j.activity || [], sum = function (k, st) { return A.filter(function (x) { return x.kind === k && (!st || x.status === st); }).reduce(function (s, x) { return s + x.n; }, 0); };
    var M = j.models || [], usd = M.reduce(function (s, x) { return s + (+x.usd || 0); }, 0), tok = M.reduce(function (s, x) { return s + (+x.tokens || 0); }, 0);
    var k = function (v, l) { return '<div class="ob-card ob-kpi"><b>' + v + "</b><span>" + l + "</span></div>"; };
    V().innerHTML = '<h2 class="ob-h">Brain analytics</h2><p class="ob-sub">Last 30 days, from the audit log and the API cost log.</p><div class="ob-grid g5">' + k(num(sum("chat")), "messages answered") + k(num(sum("tool")), "tool calls") + k(num(sum("tool", "error")), "failed tool calls") + k(num(sum("action")), "actions prepared") + k(num(j.memories), "memories stored") + "</div>" +
      '<div class="ob-grid g4" style="margin-top:14px">' + k(num(tok), "tokens (est.)") + k("$" + usd.toFixed(3), "estimated AI cost") + k(num(j.feedback && j.feedback.up || 0), "👍") + k(num(j.feedback && j.feedback.down || 0), "👎") + "</div>" +
      '<div class="ob-card ob-scroll" style="margin-top:14px"><h2>By provider</h2>' + (M.length ? '<table class="ob-table"><thead><tr><th>Provider</th><th>Calls</th><th>Failed</th><th>Tokens</th><th>Est. cost</th><th>Avg latency</th></tr></thead><tbody>' + M.map(function (x) { return "<tr><td>" + esc(x.provider) + "</td><td>" + num(x.calls) + "</td><td>" + num(x.failed) + "</td><td>" + num(x.tokens) + "</td><td>$" + (+x.usd || 0).toFixed(4) + "</td><td>" + Math.round(x.ms || 0) + " ms</td></tr>"; }).join("") + "</tbody></table>" : '<p class="ob-empty">No AI calls yet.</p>') + "</div>"; }); };
  /* ---- settings ---- */
  VIEWS.settings = function () { api("settings").then(function (j) { var s = j.settings, P = j.providers;
    var sel = function (n, opts, v) { return '<select class="ob-sel" name="' + n + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === v ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>"; };
    V().innerHTML = '<h2 class="ob-h">Settings</h2><p class="ob-sub">How the Brain works. Security rules (owner-only access, confirmations for risky actions, no secrets) can\'t be switched off.</p><form class="ob-card" id="ob-sf"><div class="ob-grid g2">' +
      "<label>Primary AI provider" + sel("provider", [["auto", "Automatic (Workers AI → Groq → Gemini)"], ["workers-ai", "Workers AI first" + (P["workers-ai"] ? "" : " (not connected)")], ["groq", "Groq first" + (P.groq ? "" : " (not connected)")], ["gemini", "Gemini first" + (P.gemini ? "" : " (not connected)")]], s.provider) + "</label>" +
      "<label>Memory" + sel("memory", [["on", "On — remember when I say so"], ["off", "Off — don't store anything new"]], s.memory) + "</label>" +
      "<label>Daily briefing (06:47 scheduler)" + sel("briefing", [["on", "On"], ["off", "Off"]], s.briefing) + "</label>" +
      "<label>Proactive alerts" + sel("alerts", [["on", "On"], ["off", "Off"]], s.alerts) + "</label>" +
      '</div><div class="ob-row" style="margin-top:14px"><button class="ob-btn pri" type="submit">Save</button><span class="ob-empty" id="ob-sst"></span></div></form>' +
      '<div class="ob-card" style="margin-top:14px"><h2>Your data</h2><div class="ob-row"><a class="ob-btn sm" href="' + API + 'export">Export everything (JSON)</a><a class="ob-btn sm" href="#memory">Manage memory</a><a class="ob-btn sm" href="#activity">Audit log</a></div></div>';
    document.getElementById("ob-sf").onsubmit = function (e) { e.preventDefault(); var f = new FormData(this), b = {}; f.forEach(function (v, k) { b[k] = v; }); api("settings", "POST", b).then(function (r) { document.getElementById("ob-sst").textContent = r.ok ? "Saved." : r.reason; }); }; }); };
})();
