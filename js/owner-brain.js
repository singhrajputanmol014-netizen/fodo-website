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
  /* theme: dark (default) / light — remembered per browser, changeable by voice ("light mode kar do") */
  function setTheme(t, save) { t = t === "light" ? "light" : "dark"; document.documentElement.setAttribute("data-theme", t); var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", t === "light" ? "#f6f5fb" : "#07070c"); try { localStorage.setItem("ob-theme", t); } catch (e) {} var b = document.getElementById("ob-theme"); if (b) { b.textContent = t === "light" ? "☾" : "☀"; b.title = t === "light" ? "Dark mode" : "Light mode"; } if (save) api("settings", "POST", { theme: t }); }
  try { setTheme(localStorage.getItem("ob-theme") || "dark"); } catch (e) { setTheme("dark"); }
  /* who is using the Brain: an owner (everything) or a team member (only what the owners allowed) */
  var can = function (p) { var me = S.status && S.status.me; return !me || me.owner || p == null || (p !== "owner" && me.perms.indexOf(p) > -1); };
  var VIEW_NEED = { home: null, chat: "chat", alerts: "business", tasks: "tasks", changes: "changes", memory: "memory", knowledge: "memory", social: "social", automations: "automations", connectors: "owner", access: "owner", activity: "owner", tools: null, diagnostics: "business", analytics: "business", settings: null };
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
  var bootT = setTimeout(function () { app.innerHTML = "<div><h1>FODO Brain is taking too long</h1><p>The server didn't answer in 30 seconds. Refresh the page; if it keeps happening, open <a href=\"/api/owner-brain/status\">the status check</a> and send the message you see.</p></div>"; }, 30000);
  api("status").then(function (s) {
    clearTimeout(bootT);
    if (s.ok && s.settings && s.settings.theme && !localStorage.getItem("ob-theme")) setTheme(s.settings.theme);
    if (!s.ok && s._s === 500) { app.className = "ob-gate"; app.innerHTML = "<div><h1>FODO Brain hit a problem</h1><p>" + esc(s.reason || "Unknown error") + "</p><p><a href=\"\">Try again</a></p></div>"; return; }
    if (!s.ok) { document.title = "Page not found — FODO"; app.className = "ob-gate"; app.innerHTML = "<div><h1>Page not found</h1><p>This page doesn't exist. <a href=\"/\">Go to FODO</a></p></div>"; return; }
    S.status = s; frame(); window.addEventListener("hashchange", go); go();
    setInterval(function () { if (!document.hidden) api("status").then(function (x) { if (x.ok) { S.status = x; pill(); } }); }, 60000);
  });

  var NAV = [["Command", [["home", "Overview", "◎"], ["chat", "Brain", "✦"], ["social", "Social media", "◍"], ["alerts", "Notifications", "◉"]]], ["Work", [["tasks", "Tasks & commitments", "☑"], ["changes", "Site changes", "⌘"], ["memory", "Memory", "◈"], ["knowledge", "Knowledge", "▤"]]],
    ["System", [["automations", "Automations", "↻"], ["connectors", "Connectors", "⇄"], ["access", "Access", "⚿"], ["activity", "Activity", "≡"], ["tools", "Tools", "⚙"], ["diagnostics", "Diagnostics", "✚"], ["analytics", "Analytics", "▦"], ["settings", "Settings", "⋯"]]]];
  function frame() {
    document.title = "FODO BRAIN";
    app.className = "ob-app";
    var me = S.status.me || { owner: true, role: "owner", email: S.status.owner.email };
    app.innerHTML = '<aside class="ob-side" id="ob-side"><div class="ob-brand"><span class="ob-orb" id="ob-orb"></span><span><b>FODO BRAIN</b><small>' + (me.owner ? "OWNER" : esc(me.role).toUpperCase() + " ACCESS") + '</small></span></div><nav class="ob-nav">' +
      NAV.map(function (g) { var items = g[1].filter(function (n) { return can(VIEW_NEED[n[0]]); }); return items.length ? '<div class="grp">' + g[0] + "</div>" + items.map(function (n) { return '<a href="#' + n[0] + '" data-v="' + n[0] + '"><span aria-hidden="true">' + n[2] + "</span>" + n[1] + (n[0] === "alerts" ? '<span class="n" id="ob-alertn" hidden></span>' : "") + "</a>"; }).join("") : ""; }).join("") +
      '</nav><div class="foot">Signed in as ' + esc(me.email || S.status.owner.email) + (me.owner ? '<br><a href="/admin/">Admin</a> · ' : "<br>") + '<a href="/">Website</a></div></aside><div class="ob-scrim" id="ob-scrim" aria-hidden="true"></div>' +
      '<div class="ob-main"><header class="ob-top"><button class="ob-menu" id="ob-menu" aria-label="Menu">☰</button><h1>FODO BRAIN</h1><span class="tag">' + (me.owner ? "OWNER" : esc(me.role).toUpperCase()) + '</span><span class="sp"></span>' +
      '<button class="ob-hfb" id="ob-hf" title="Hands-free: say “Hey FODO …” — tap to open voice mode" aria-pressed="false"><canvas id="ob-hfc" width="34" height="34" aria-hidden="true"></canvas><span id="ob-hft">Hey FODO</span></button>' +
      '<button class="ob-icon" id="ob-theme" aria-label="Switch theme">☀</button><button class="ob-pill" id="ob-pill" aria-haspopup="true"><span class="ob-dot" id="ob-dot"></span><span id="ob-pillt">BRAIN ONLINE</span></button></header><main class="ob-view" id="ob-view"></main></div>' +
      '<nav class="ob-bnav" aria-label="Quick navigation"><a href="#home" data-v="home"><span>◎</span>Home</a><a href="#chat" data-v="chat"><span>✦</span>Brain</a><button id="ob-bvo" aria-label="Voice mode"><canvas id="ob-bvc" width="56" height="56"></canvas></button>' + (can("social") ? '<a href="#social" data-v="social"><span>◍</span>Social</a>' : '<a href="#tasks" data-v="tasks"><span>☑</span>Tasks</a>') + '<button id="ob-bmenu"><span>☰</span>More</button></nav>';
    var vo = document.createElement("div"); vo.className = "ob-vo"; vo.id = "ob-vo"; vo.hidden = true;
    vo.innerHTML = '<div class="ob-vo-bg" aria-hidden="true"></div><header class="ob-vo-h"><span class="ob-vo-brand">FODO</span><button class="ob-vo-x" id="ob-vox" aria-label="Close voice mode">✕</button></header>' +
      '<button class="ob-vo-stage" id="ob-vostage" aria-label="Tap to talk or to stop"><canvas id="ob-voc" aria-hidden="true"></canvas></button>' +
      '<div class="ob-vo-text"><p class="ob-vo-st" id="ob-vost">Tap the mic to start</p><p class="ob-vo-tr" id="ob-votr"></p><div class="ob-vo-ans" id="ob-voans"></div></div>' +
      '<div class="ob-vo-ctrl"><button class="ob-micbtn" id="ob-vomic" aria-pressed="false" aria-label="Microphone on/off"><span class="r r1"></span><span class="r r2"></span><span class="r r3"></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z"/></svg></button><p class="ob-vo-hint" id="ob-vohint">Talk freely — no wake word needed here</p></div>';
    document.body.appendChild(vo);
    document.getElementById("ob-menu").onclick = document.getElementById("ob-bmenu").onclick = function () { document.getElementById("ob-side").classList.toggle("open"); };
    document.getElementById("ob-scrim").onclick = function () { document.getElementById("ob-side").classList.remove("open"); };
    document.getElementById("ob-pill").onclick = statusPop; pill();
    document.getElementById("ob-theme").onclick = function () { setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light", true); }; setTheme(document.documentElement.getAttribute("data-theme"));
    ORB.top = window.FodoOrb ? FodoOrb.mount(document.getElementById("ob-hfc"), { small: true, size: 34 }) : null;
    ORB.bottom = window.FodoOrb ? FodoOrb.mount(document.getElementById("ob-bvc"), { small: true, size: 56 }) : null;
    document.getElementById("ob-hf").onclick = document.getElementById("ob-bvo").onclick = function () { voOpen(); if (!HF.on) hfStart(); };
    document.getElementById("ob-vox").onclick = voClose;
    document.getElementById("ob-vomic").onclick = function () { HF.on ? hfStop() : hfStart(); };
    document.getElementById("ob-vostage").onclick = function () { if (HF.speaking) stopSpeaking(); else if (!HF.on) hfStart(); };
    var pref = null; try { pref = localStorage.getItem("ob-hf"); } catch (e) {}
    if (S.status.settings.wakeWord !== "off" && pref === "1" && window.FodoVoice) hfStart(true);   // was on last time: resume (the first tap anywhere if the browser needs one)
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
    var h = (location.hash || "#home").slice(1).split("?")[0].split("/"), v = h[0] || "home";
    if (!can(VIEW_NEED[v])) { V().innerHTML = '<h2 class="ob-h">Not included</h2><p class="ob-sub">Your FODO Brain access doesn\'t include this page. Ask an owner if you need it.</p>'; return; }
    document.querySelectorAll(".ob-nav a, .ob-bnav a").forEach(function (a) { a.classList.toggle("on", a.dataset.v === v); });
    document.getElementById("ob-side").classList.remove("open");
    var f = VIEWS[v] || VIEWS.home; V().innerHTML = '<p class="ob-empty">Loading…</p>'; f(h[1]);
  }
  var busy = function (on) { var o = document.getElementById("ob-orb"); if (o) o.classList.toggle("busy", !!on); };

  /* ---------------- views ---------------- */
  var VIEWS = {};
  VIEWS.home = function () {
    var name = ((S.status.me && S.status.me.name) || S.status.owner.name || "").split(" ")[0] || (S.status.me && !S.status.me.owner ? "there" : "Anmol"), hr = new Date().getHours(), greet = hr < 5 ? "Working late" : hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
    V().innerHTML = '<p class="ob-greet">' + greet + ", " + esc(name) + '.</p><p class="ob-sub" id="ob-hsub">Loading FODO\'s live status…</p>' +
      '<form class="ob-cmd" id="ob-cmd"><span class="ob-orb" aria-hidden="true" style="width:18px;height:18px"></span><input id="ob-cmdin" placeholder="Ask FODO Brain anything…" autocomplete="off" aria-label="Ask FODO Brain"><button class="ob-btn pri" type="submit">Ask</button></form>' +
      '<div class="ob-quick">' + [["System check", "Run a full system check."], ["Today's brief", "How is FODO doing today?"], ["Business analysis", "Analyze today's business and what changed this week."], ["Latest X-Ray", "Analyze the latest X-Ray."], ["Growth opportunities", "What should I focus on?"], ["Costs", "What's costing us the most this month?"], ["Create task", "#tasks"], ["Upload knowledge", "#knowledge"]].map(function (q) { return '<button class="ob-btn sm" data-q="' + esc(q[1]) + '">' + q[0] + "</button>"; }).join("") + "</div>" +
      '<div id="ob-hbody"><p class="ob-empty">Loading the briefing…</p></div>';
    document.getElementById("ob-cmd").onsubmit = function (e) { e.preventDefault(); var v = document.getElementById("ob-cmdin").value.trim(); if (v) ask(v); };
    V().querySelectorAll("[data-q]").forEach(function (b) { b.onclick = function () { var q = b.dataset.q; if (q.charAt(0) === "#") location.hash = q; else ask(q); }; });
    if (!can("business")) { document.getElementById("ob-hbody").innerHTML = '<div class="ob-card"><p class="ob-empty">Ask me anything you have access to — or say “Hey FODO”.</p></div>'; document.getElementById("ob-hsub").textContent = "Your access: " + ((S.status.me && S.status.me.perms) || []).join(", "); return; }
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
  function ask(q, opt) { location.hash = "#chat"; setTimeout(function () { send(q, opt); }, 80); }

  /* ---- chat ---- */
  VIEWS.chat = function (tid) {
    if (tid) S.thread = tid;
    V().innerHTML = '<div class="ob-chat"><div class="ob-threads" id="ob-threads"><button class="ob-btn sm" id="ob-new" style="width:100%;margin-bottom:8px">+ New conversation</button><div id="ob-tl"></div></div>' +
      '<div class="ob-conv"><div class="ob-log" id="ob-log" aria-live="polite"></div><form class="ob-compose" id="ob-form"><textarea class="ob-ta" id="ob-in" rows="1" placeholder="Message FODO…" aria-label="Message"></textarea>' +
      '<button type="button" class="ob-cbtn" id="ob-spk" title="Read answers aloud" aria-pressed="' + S.voiceOut + '"><svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 4V6L7 10H3Zm13.5 2a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4Zm-2.5-9v2.1a7 7 0 0 1 0 13.8V21a9 9 0 0 0 0-18Z"/></svg></button>' +
      '<button type="button" class="ob-cbtn ob-mic" id="ob-mic" title="Speak" aria-label="Speak"><svg viewBox="0 0 24 24"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z"/></svg></button>' +
      '<button class="ob-cbtn send" type="submit" aria-label="Send"><svg viewBox="0 0 24 24"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z"/></svg></button></form></div></div>';
    document.getElementById("ob-new").onclick = function () { S.thread = null; try { sessionStorage.removeItem("ob-thread"); } catch (e) {} VIEWS.chat(); };
    var inp = document.getElementById("ob-in");
    document.getElementById("ob-form").onsubmit = function (e) { e.preventDefault(); var v = inp.value.trim(); if (v) { inp.value = ""; inp.style.height = ""; send(v); } };
    inp.onkeydown = function (e) { if (e.key === "Enter" && !e.shiftKey && !/Mobi|Android|iPhone/i.test(navigator.userAgent)) { e.preventDefault(); document.getElementById("ob-form").requestSubmit(); } };
    inp.oninput = function () { inp.style.height = "auto"; inp.style.height = Math.min(140, inp.scrollHeight) + "px"; };
    voice(); threads();
    var log = document.getElementById("ob-log");
    if (S.thread) api("thread/" + encodeURIComponent(S.thread)).then(function (j) { if (!j.ok) { S.thread = null; hello(); return; } log.innerHTML = ""; j.messages.forEach(function (m) { m.role === "user" ? bubbleU(m.content) : bubbleA({ answer: m.content, messageId: m.id, confidence: m.meta && m.meta.confidence, sources: m.meta && m.meta.sources, tools_used: m.meta && m.meta.tools, model: m.meta && m.meta.model }); }); log.scrollTop = log.scrollHeight; });
    else hello();
    function hello() { log.innerHTML = '<div class="ob-msg a"><p><b>FODO Brain is ready.</b> I work from FODO\'s live data, my memory and the documents you give me. Try:</p><ul><li>How is FODO doing today?</li><li>Check the whole system.</li><li>Analyze my latest X-Ray.</li><li>Remember that we are focusing on agency clients this quarter.</li><li>What can you do?</li></ul></div>'; }
  };
  function threads() { api("threads").then(function (j) { var el = document.getElementById("ob-tl"); if (!el) return; el.innerHTML = (j.items || []).map(function (t) { return '<a href="#chat/' + esc(t.id) + '" class="' + (t.id === S.thread ? "on" : "") + '" title="' + esc(t.title) + '">' + esc(t.title) + "</a>"; }).join("") || '<p class="ob-empty">No conversations yet.</p>'; }); }
  function LOG() { return document.getElementById("ob-log") || S.vlog || (S.vlog = document.createElement("div")); }
  function bubbleU(t) { var d = document.createElement("div"); d.className = "ob-msg u"; d.textContent = t; LOG().appendChild(d); return d; }
  function bubbleA(r) {
    var d = document.createElement("div"); d.className = "ob-msg a";
    var src = (r.sources || []).map(function (s) { return s.name; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
    d.innerHTML = md(r.answer) + (r.attachments || []).map(function (x) {
      if (x.kind === "change") return '<div class="ob-act" style="border-color:rgba(139,123,255,.45);background:rgba(139,123,255,.06)"><b>Prepared change: ' + esc(x.title) + "</b> · " + badge(x.risk === "high" ? "important" : x.risk === "low" ? "ok" : "info") + " <small>" + esc(x.risk) + " risk · " + esc((x.files || []).join(", ")) + '</small><pre style="font:12px/1.5 var(--b-mono);max-height:320px;overflow:auto">' + esc(x.diff) + "</pre>" + (x.test ? '<small class="ob-empty">Check on the preview: ' + esc(x.test) + "</small>" : "") + "</div>";
      if (x.kind === "sources") return '<div class="ob-meta"><span>Sources: ' + (x.sources || []).map(function (s0, i) { return '<a href="' + esc(/^https:\/\//.test(s0.link) ? s0.link : "#") + '" target="_blank" rel="noopener noreferrer nofollow">[' + (i + 1) + "] " + esc(String(s0.title).slice(0, 40)) + "</a>"; }).join(" ") + "</span></div>";
      return ""; }).join("") + (r.actions || []).map(function (a) { return '<div class="ob-act" data-id="' + esc(a.id) + '" data-tok="' + esc(a.token) + '"><b>Needs your confirmation</b> · ' + badge(a.risk || "") + "<pre>" + esc(a.preview) + '</pre><div class="ob-row"><button class="ob-btn sm" data-d="cancel">Cancel</button><button class="ob-btn sm pri" data-d="run">Execute</button><small class="ob-empty">Expires in ' + (a.expiresInMin || 15) + " min</small></div></div>"; }).join("") +
      '<div class="ob-meta">' + (r.confidence ? badge(r.confidence) : "") + (src.length ? "<span>Based on: " + esc(src.join(", ")) + "</span>" : "") + (r.model ? "<span>· " + esc(r.model) + "</span>" : "") + (r.messageId ? '<span style="margin-left:auto"></span><button data-f="1" aria-label="Useful">👍</button><button data-f="-1" aria-label="Not useful">👎</button><button data-why="1">Why?</button>' : "") + "</div>";
    d.querySelectorAll(".ob-act button").forEach(function (b) { b.onclick = function () { var box = b.closest(".ob-act"); box.querySelectorAll("button").forEach(function (x) { x.disabled = true; });
      api("confirm", "POST", { actionId: box.dataset.id, token: box.dataset.tok, decision: b.dataset.d === "cancel" ? "cancel" : "run" }).then(function (j) { box.innerHTML = j.ok ? (j.cancelled ? "<b>Cancelled.</b> Nothing was done." : "<b>Done.</b> " + esc(summ(j.result))) : "<b>Not executed:</b> " + esc(j.error || j.reason); }); }; });
    d.querySelectorAll("[data-f]").forEach(function (b) { b.onclick = function () { var note = b.dataset.f === "-1" ? prompt("What was wrong? (optional)") || "" : ""; api("feedback", "POST", { messageId: r.messageId, rating: +b.dataset.f, note: note }); b.parentNode.querySelectorAll("[data-f]").forEach(function (x) { x.disabled = true; }); b.style.borderColor = "#8b7bff"; }; });
    var w = d.querySelector("[data-why]"); if (w) w.onclick = function () { send("Why? Give me the evidence for your last answer."); };
    LOG().appendChild(d); return d;
  }
  function summ(x) { if (!x) return ""; if (x.sent) return "Email sent to " + x.to + ". " + (x.note || ""); if (x.changed) return x.kind + " " + x.id + " now costs ₹" + Number(x.price).toLocaleString("en-IN") + "."; if (x.deleted) return "Deleted “" + (x.title || x.deleted) + "”."; if (x.done) return x.email + (x.blocked ? " blocked." : " unblocked."); return JSON.stringify(x).slice(0, 200); }
  var STEPS = ["Retrieving data…", "Checking FODO systems…", "Reading memory…", "Analyzing results…"];
  function applyUi(u) {
    if (!u) return; if (u.action === "theme") setTheme(u.value, true);
    else if (u.action === "open") setTimeout(function () { location.hash = "#" + u.value; }, 400);
    else if (u.action === "voice") { if (u.value === "off") setTimeout(hfStop, 2500); else hfStart(); }
    else if (u.action === "speak") { S.voiceOut = u.value !== "off"; try { localStorage.setItem("ob-voice", S.voiceOut ? "1" : "0"); } catch (e) {} }
  }
  function send(q, opt) {
    opt = opt || {};
    if (S.busy) { if (opt.done) opt.done({ answer: "One moment — I'm still on the last request." }); return; }
    var log = document.getElementById("ob-log");
    if (!log && opt.voice) log = LOG();   // voice works on any page: answers go to the voice panel
    if (!log) { location.hash = "#chat"; setTimeout(function () { send(q, opt); }, 80); return; }
    if (/FODO Brain is ready/.test(log.textContent) && log.children.length === 1) log.innerHTML = "";
    S.busy = true; busy(true); bubbleU(q);
    var w = document.createElement("div"); w.className = "ob-msg a"; w.innerHTML = '<div class="ob-steps"><span class="ob-orb busy" style="width:14px;height:14px"></span><span id="ob-step">' + STEPS[0] + "</span></div>"; log.appendChild(w); log.scrollTop = log.scrollHeight;
    var i = 0, tick = setInterval(function () { var s = document.getElementById("ob-step"); if (s) s.textContent = STEPS[++i % STEPS.length]; }, 1600);
    if (opt.voice) orbState("thinking");
    api("chat", "POST", { message: q, threadId: S.thread, voice: !!opt.voice }).then(function (r) {
      clearInterval(tick); w.remove(); S.busy = false; busy(false);
      if (!r.ok) { var em = "**I couldn't answer:** " + (r.reason || r.error || "error"); bubbleA({ answer: em }); if (opt.done) opt.done({ answer: em }); if (opt.voice) speak("Sorry, I couldn't do that."); return; }
      (r.ui || []).forEach(applyUi);
      if (r.threadId && r.threadId !== S.thread) { S.thread = r.threadId; try { sessionStorage.setItem("ob-thread", r.threadId); } catch (e) {} threads(); }
      bubbleA(r); log.scrollTop = log.scrollHeight; if (S.voiceOut || opt.voice) speak(r.answer); else if (HF.on) orbState("listening"); if (opt.done) opt.done(r);
      if (r.memory_updates && r.memory_updates.length || /create_task|remember/.test(r.intent || "")) api("status").then(function (x) { if (x.ok) { S.status = x; pill(); } });
    });
  }
  /* ---- voice: push-to-talk (browser speech recognition) + spoken replies ---- */
  function voice() {
    var mic = document.getElementById("ob-mic"), spk = document.getElementById("ob-spk");
    if (spk) spk.onclick = function () { S.voiceOut = !S.voiceOut; try { localStorage.setItem("ob-voice", S.voiceOut ? "1" : "0"); } catch (e) {} spk.classList.toggle("on", S.voiceOut); spk.setAttribute("aria-pressed", S.voiceOut); if (!S.voiceOut) stopSpeaking(); };
    if (spk) spk.classList.toggle("on", S.voiceOut);
    if (!mic) return;
    if (!window.FodoVoice) { mic.disabled = true; return; }
    mic.onclick = function () {   // tap → speak one sentence → it is written into the box and sent
      var inp = document.getElementById("ob-in"), was = HF.on;
      if (HF.ptt) { HF.ptt = null; mic.classList.remove("on"); if (!was) FodoVoice.stop(); return; }
      wire(); mic.classList.add("on"); inp.placeholder = "Listening… speak now";
      HF.ptt = function (t, j) { mic.classList.remove("on"); inp.placeholder = "Message FODO…"; if (!was && !HF.on) FodoVoice.stop(); if (t) send(t, { voice: S.voiceOut }); else if (j && !j.ok) bubbleA({ answer: "**Couldn't hear that:** " + (j.reason || "try again") }); };
      FodoVoice.start();
    };
  }
  /* ---------------- VOICE: FODO hears with its own engine (VAD + Whisper), answers in a natural voice ---------------- */
  var ORB = { top: null, bottom: null, big: null };
  var HF = { on: false, speaking: false, armedUntil: 0, busy: false, queue: [], lastSpoken: "", tapWait: null, ptt: null };
  function orbState(st) { HF.state = st; ["top", "bottom", "big"].forEach(function (k) { if (ORB[k]) ORB[k].state(st); }); var vo = document.getElementById("ob-vo"); if (vo) vo.setAttribute("data-state", st);
    var x = document.getElementById("ob-vost"); if (x) x.textContent = { listening: HF.armedUntil > Date.now() || voIsOpen() ? "Listening…" : "Say “Hey FODO …”", hearing: "Hearing you…", thinking: "Thinking…", speaking: "Speaking — tap the orb to interrupt", idle: HF.on ? "Listening…" : "Tap the mic to start" }[st] || ""; hfLabel(); }
  function orbLevel(v) { ["top", "bottom", "big"].forEach(function (k) { if (ORB[k]) ORB[k].level(v); }); var m = document.getElementById("ob-vomic"); if (m) m.style.setProperty("--lvl", Math.min(1, v * 1.6).toFixed(2)); }
  function voIsOpen() { var vo = document.getElementById("ob-vo"); return !!(vo && !vo.hidden); }
  function voOpen() { var vo = document.getElementById("ob-vo"); if (!vo) return; vo.hidden = false; document.body.classList.add("ob-vo-on"); if (!ORB.big && window.FodoOrb) ORB.big = FodoOrb.mount(document.getElementById("ob-voc"), { big: true }); orbState(HF.speaking ? "speaking" : HF.busy ? "thinking" : HF.on ? "listening" : "idle"); }
  function voClose() { var vo = document.getElementById("ob-vo"); if (vo) vo.hidden = true; document.body.classList.remove("ob-vo-on"); if (ORB.big) { ORB.big.destroy(); ORB.big = null; } orbState(HF.state || "idle"); }
  function voSay(t, who) { var a = document.getElementById("ob-voans"); if (a) a.innerHTML = who === "u" ? '<p class="u">“' + esc(t) + "”</p>" : md(t); }
  function hfLabel() { var b = document.getElementById("ob-hf"), x = document.getElementById("ob-hft"); if (b) { b.setAttribute("aria-pressed", HF.on); b.classList.toggle("on", HF.on); }
    if (x) x.textContent = !HF.on ? (HF.tapWait ? "Tap to wake" : "Voice off") : HF.state === "thinking" ? "Thinking…" : HF.state === "speaking" ? "Speaking" : HF.state === "hearing" ? "Hearing…" : "Hey FODO";
    var m = document.getElementById("ob-vomic"); if (m) { m.setAttribute("aria-pressed", HF.on); m.classList.toggle("on", HF.on); }
    var h = document.getElementById("ob-vohint"); if (h) h.textContent = HF.tapWait ? "Tap anywhere once — your browser needs a tap before it can listen" : HF.on ? "Talk freely here — outside this screen, start with “FODO …”" : "Microphone is off"; }

  /* speaking: English → Aura-2 (natural), sentence by sentence so it starts fast; Hindi/Hinglish → the device's Hindi voice reading a Devanagari version */
  var audio = null, speakMeter = null, HIN = /\b(hai|hain|kya|nahi|aap|tum|mera|meri|kar|karo|haan|ji|bhi|abhi|kal|aaj|kaise|kitna|kitne|batao|chahiye|wala|raha|rahi|gaya|ke|ki|ka|ko|se|mein|pe|aur|theek|bas|bahut|sab|kuch)\b/gi;
  function plainSpeech(t) { return String(t || "").replace(/```[\s\S]*?```/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/https?:\/\/\S+/g, "").replace(/[*_`#>|]/g, "").replace(/\n+/g, ". ").replace(/\s+/g, " ").trim().slice(0, 1400); }
  function sentences(t) { var out = [], cur = ""; (t.match(/[^.!?।]+[.!?।]+|[^.!?।]+$/g) || [t]).forEach(function (x) { if ((cur + x).length > 220 && cur) { out.push(cur.trim()); cur = x; } else cur += x; }); if (cur.trim()) out.push(cur.trim()); return out; }
  var VOICES = null; function hiVoice(lang) { var vs = (window.speechSynthesis && speechSynthesis.getVoices()) || []; var L = vs.filter(function (v) { return v.lang.replace("_", "-").toLowerCase().indexOf(lang.toLowerCase()) === 0; }); return L.filter(function (v) { return /Google|Natural|Neural|Enhanced|Premium|Lekha|Swara|Madhur/i.test(v.name); })[0] || L[0] || null; }
  function browserSay(t, lang, done) { if (!window.speechSynthesis) { if (done) done(); return; } var u = new SpeechSynthesisUtterance(t); u.lang = lang || "hi-IN"; var v = hiVoice(u.lang); if (v) u.voice = v; u.rate = 1.0; u.pitch = 1.02;
    var sim = setInterval(function () { orbLevel(0.22 + Math.random() * 0.5); }, 110), end = function () { clearInterval(sim); orbLevel(0); if (done) done(); }; u.onend = end; u.onerror = end; speechSynthesis.speak(u); }
  function stopSpeaking() { HF.queue = []; HF.speakId = (HF.speakId || 0) + 1; if (audio) { try { audio.pause(); } catch (e) {} audio = null; } if (speakMeter) { speakMeter.stop(); speakMeter = null; } if (window.speechSynthesis) speechSynthesis.cancel(); if (HF.speaking) { HF.speaking = false; if (window.FodoVoice) FodoVoice.guard(false); orbLevel(0); orbState(HF.on ? "listening" : "idle"); } }
  function speak(t, done) {
    t = plainSpeech(t); if (!t) { if (done) done(); return; }
    stopSpeaking(); var id = HF.speakId; HF.speaking = true; HF.lastSpoken = t; if (window.FodoVoice) FodoVoice.guard(true); orbState("speaking");
    var fin = function () { if (id !== HF.speakId || !HF.speaking) return; HF.speaking = false; if (window.FodoVoice) FodoVoice.guard(false); orbLevel(0); HF.armedUntil = Date.now() + 12000; orbState(HF.on ? "listening" : "idle"); if (done) done(); };
    var hindi = /[ऀ-ॿ]/.test(t) || (t.match(HIN) || []).length >= 3;
    if (hindi) { api("tts", "POST", { text: t }).then(function (j) { if (id !== HF.speakId) return; browserSay(j.speakText || t, j.lang || "hi-IN", fin); }); return; }
    var parts = sentences(t), cache = {};
    var get = function (i) { if (!cache[i]) cache[i] = fetch(API + "tts", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: parts[i] }) }).then(function (r) { if (r.ok && /audio/.test(r.headers.get("content-type") || "")) return r.blob(); return r.json().then(function (j) { return { say: j.speakText || parts[i], lang: j.lang || "en-IN" }; }); }); return cache[i]; };
    (function play(i) {
      if (id !== HF.speakId) return; if (i >= parts.length) return fin();
      get(i).then(function (b) { if (id !== HF.speakId) return; if (i + 1 < parts.length) get(i + 1);
        if (!(b instanceof Blob)) return browserSay(b.say, b.lang, function () { play(i + 1); });
        audio = new Audio(URL.createObjectURL(b)); audio.setAttribute("playsinline", ""); audio.onended = function () { if (speakMeter) { speakMeter.stop(); speakMeter = null; } play(i + 1); }; audio.onerror = function () { browserSay(parts[i], "en-IN", function () { play(i + 1); }); };
        if (window.FodoOrb) speakMeter = FodoOrb.meter(audio, orbLevel); if (!speakMeter) { var sim = setInterval(function () { if (!audio || audio.paused) return clearInterval(sim); orbLevel(0.25 + Math.random() * 0.45); }, 110); }
        audio.play().catch(function () { browserSay(parts[i], "en-IN", function () { play(i + 1); }); });
      }, function () { browserSay(parts[i], "en-IN", function () { play(i + 1); }); });
    })(0);
  }

  /* hearing */
  var WAKE_ANY = /(?:\b(?:hey|hi|ok|okay|hello|oye|arre|suno|a|ae|ay|he)\b[\s,]*)?(?:\b(?:fodo|phodo|fodu|foodo|fordo|fodo's|fo do|for do|photo|foto|fodor|podo|vodo|todo|foto's)\b|फोडो|फ़ोडो|फ़ोदो|फोदो|फोटो)[\s,!.:?-]*/i;
  function wakeSplit(t) {   // returns the command after/around the wake word, "" if only the wake word, null if no wake word
    var m = WAKE_ANY.exec(t); if (!m) return null; var before = t.slice(0, m.index).trim(), after = t.slice(m.index + m[0].length).trim();
    if (/^(photo|foto|todo|podo)/i.test(m[0].replace(/^\W*(hey|hi|ok|okay|hello|oye|arre|suno|a|ae|ay|he)?\W*/i, "")) && before.split(/\s+/).filter(Boolean).length > 2) return null;   // "send this photo" isn't a wake word
    return (before && after ? before + " " + after : before || after).replace(/^[\s,.!?-]+|[\s,]+$/g, "");
  }
  function similar(a, b) { var A = String(a).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [], B = String(b).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []; if (!A.length) return 0; var set = {}; B.forEach(function (w) { set[w] = 1; }); return A.filter(function (w) { return set[w]; }).length / A.length; }
  var wired = false;
  function wire() {
    if (wired || !window.FodoVoice) return; wired = true;
    FodoVoice.on("level", function (v) { if (!HF.speaking) orbLevel(v); });
    FodoVoice.on("speechstart", function () { if (HF.speaking) { stopSpeaking(); } if (!HF.busy) orbState("hearing"); });
    FodoVoice.on("speechend", function () { if (!HF.busy && HF.state === "hearing") orbState("thinking"); });
    FodoVoice.on("error", function (e) { if (e.message === "tap") { waitForTap(); return; } HF.on = false; try { localStorage.removeItem("ob-hf"); } catch (x) {} voOpen(); var x = document.getElementById("ob-vost"); if (x) x.textContent = e.message === "blocked" ? "Microphone blocked — allow it for fodo.co.in (Safari: aA → Website Settings → Microphone · Chrome: 🔒 → Microphone), then tap the mic." : e.message === "nomic" ? "No microphone found." : "Mic error: " + e.message; hfLabel(); });
    FodoVoice.on("utterance", function (u) {
      var wasSpeaking = HF.speaking, lang = (localStorage.getItem("ob-lang") || "auto");
      api("stt", "POST", { audioB64: u.b64, mime: "audio/wav", lang: lang === "auto" ? "" : lang }).then(function (j) {
        var t = j.ok ? String(j.text || "").trim() : "";
        if (HF.ptt) { var cb = HF.ptt; HF.ptt = null; cb(t, j); return; }
        if (!t) { if (HF.state === "thinking" && !HF.busy) orbState("listening"); return; }
        if (wasSpeaking && similar(t, HF.lastSpoken) > 0.6) return;   // its own voice came back through the speaker
        var tr = document.getElementById("ob-votr"); if (tr) tr.textContent = t;
        var conv = voIsOpen() || HF.armedUntil > Date.now(), rest = wakeSplit(t);
        if (conv) return command(rest !== null && rest.length > 1 ? rest : t);
        if (rest === null) { orbState("listening"); return; }
        if (rest.length > 1) return command(rest);
        HF.armedUntil = Date.now() + 12000; var nm = (((S.status.me && S.status.me.name) || S.status.owner.name || "").split(" ")[0]); speak(nm ? "Haan " + nm + ", boliye?" : "Haan, boliye?");
      });
    });
  }
  function waitForTap() {
    HF.tapWait = true; HF.on = false; hfLabel(); orbState("idle");
    var go = function () { document.removeEventListener("pointerdown", go, true); document.removeEventListener("keydown", go, true); HF.tapWait = false; hfStart(); };
    document.addEventListener("pointerdown", go, true); document.addEventListener("keydown", go, true);
  }
  function hfStart(auto) {
    if (!window.FodoVoice) return; wire(); if (window.FodoOrb) FodoOrb.unlock();
    FodoVoice.start().then(function (ok) { if (!ok) return; HF.on = true; HF.tapWait = false; try { localStorage.setItem("ob-hf", "1"); } catch (e) {} orbState("listening"); });
  }
  function hfStop() { HF.on = false; HF.armedUntil = 0; try { localStorage.setItem("ob-hf", "0"); } catch (e) {} if (window.FodoVoice) FodoVoice.stop(); stopSpeaking(); orbLevel(0); orbState("idle"); }
  function command(t) {
    t = String(t || "").replace(/^[\s,.!?-]+/, ""); if (!t) return; HF.busy = true; orbState("thinking"); voSay(t, "u"); HF.armedUntil = Date.now() + 12000;
    send(t, { voice: true, done: function (r) { HF.busy = false; if (r && r.answer) voSay(r.answer); if (!HF.speaking) orbState(HF.on ? "listening" : "idle"); } });
  }
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
      var today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
      var row = function (t) { return "<tr><td>" + badge(t.priority) + (t.kind && t.kind !== "task" ? "<br>" + badge(t.kind) : "") + '</td><td><b>' + esc(t.title) + "</b>" + (t.assignee || t.due ? '<br><small class="ob-empty">' + (t.assignee ? "👤 " + esc(t.assignee) + " " : "") + (t.due ? (t.due < today && t.status !== "done" ? '<b style="color:#ff5d73">overdue · due ' + esc(t.due) + "</b>" : "due " + esc(t.due)) : "") + "</small>" : "") + (t.detail ? '<br><small class="ob-empty">' + esc(t.detail) + "</small>" : "") + "<br><small class=\"ob-empty\">" + esc(t.source || "") + "</small></td><td>" + esc(t.project || "—") + '</td><td><select class="ob-sel" data-st="' + t.id + '">' + ["suggested", "todo", "doing", "done"].map(function (s) { return "<option" + (s === t.status ? " selected" : "") + ">" + s + "</option>"; }).join("") + '</select></td><td><button class="ob-btn sm danger" data-del="' + t.id + '">Delete</button></td></tr>'; };
      V().innerHTML = '<h2 class="ob-h">Tasks & projects</h2><p class="ob-sub">Real tasks — created here or by saying “create a task to …” to the Brain. Tasks found in documents arrive as <i>suggested</i>. Say “Rahul will send the logo by Friday” and the Brain tracks it as a commitment — overdue ones raise an alert.</p>' +
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
    V().innerHTML = '<h2 class="ob-h">Knowledge</h2><p class="ob-sub">Give the Brain a document — it extracts the summary, facts, decisions, tasks, risks and opportunities, stores them, and can find any passage later. PDF, Word, Excel, PowerPoint, images/screenshots, text, Markdown, CSV, JSON — or paste the text.</p>' +
      '<form class="ob-card" id="ob-kf"><h2>Add a document</h2><div class="ob-grid g3"><input class="ob-in" name="title" placeholder="Title" required><select class="ob-sel" name="scope"><option value="fodo">FODO business</option><option value="personal">Personal</option></select><input class="ob-in" name="project" placeholder="Project (optional)"></div>' +
      '<div class="ob-row" style="margin:10px 0"><input type="file" id="ob-kfile" accept=".txt,.md,.markdown,.csv,.json,.html,.htm,.xml,.pdf,.docx,.xlsx,.xls,.pptx,.odt,.ods,.jpg,.jpeg,.png,.webp,text/*,image/*"><small class="ob-empty" id="ob-kinfo"></small></div><textarea class="ob-ta" name="text" id="ob-ktext" placeholder="…or paste the text here" style="min-height:160px"></textarea><div class="ob-row" style="margin-top:10px"><button class="ob-btn pri" type="submit">Understand this</button><span class="ob-empty" id="ob-kst"></span></div></form><div id="ob-kres"></div><div class="ob-card ob-scroll" style="margin-top:14px" id="ob-kl"></div>';
    var file = document.getElementById("ob-kfile");
    var bin = null;
    file.onchange = function () { var f = file.files[0]; bin = null; if (!f) return;
      if (/\.(pdf|docx|xlsx|xls|pptx|odt|ods|jpe?g|png|webp)$/i.test(f.name) || /^image\//.test(f.type)) {   // converted on the server (Workers AI → Markdown)
        if (f.size > 10e6) { document.getElementById("ob-kinfo").textContent = "Too large (max 10 MB)."; file.value = ""; return; }
        var fr = new FileReader(); fr.onload = function () { bin = { fileB64: String(fr.result).split(",")[1], fileName: f.name, mime: f.type }; var t = document.querySelector("#ob-kf [name=title]"); if (!t.value) t.value = f.name.replace(/\.[^.]+$/, ""); document.getElementById("ob-kinfo").textContent = f.name + " · " + Math.round(f.size / 1024) + " KB — FODO Brain will read it"; document.getElementById("ob-ktext").placeholder = "(the file will be converted — no need to paste)"; }; fr.readAsDataURL(f); return; }
      if (f.size > 1.5e6) { document.getElementById("ob-kinfo").textContent = "Too large (max ~1.5 MB of text)."; file.value = ""; return; }
      var r = new FileReader(); r.onload = function () { document.getElementById("ob-ktext").value = String(r.result).slice(0, 400000); var t = document.querySelector('#ob-kf [name=title]'); if (!t.value) t.value = f.name.replace(/\.[^.]+$/, ""); document.getElementById("ob-kinfo").textContent = f.name + " · " + Math.round(f.size / 1024) + " KB loaded"; }; r.readAsText(f); };
    document.getElementById("ob-kf").onsubmit = function (e) { e.preventDefault(); var f = new FormData(this), b = { kind: (file.files[0] && file.files[0].name.split(".").pop()) || "text" }; f.forEach(function (v, k) { b[k] = v; }); if (bin) { b.fileB64 = bin.fileB64; b.fileName = bin.fileName; b.mime = bin.mime; b.text = ""; } else if (!String(b.text || "").trim()) { document.getElementById("ob-kst").textContent = "Choose a file or paste the text."; return; } var st = document.getElementById("ob-kst"); st.textContent = "Reading and understanding…"; busy(true);
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
      "<label>Brain's English voice" + sel("voice", [["thalia", "Thalia — warm, clear female"], ["andromeda", "Andromeda — calm female"], ["helena", "Helena — friendly female"], ["asteria", "Asteria — classic female"], ["apollo", "Apollo — confident male"], ["orion", "Orion — calm male"], ["arcas", "Arcas — deep male"], ["zeus", "Zeus — rich male"], ["browser", "Device voice only"]], s.voice) + "</label>" +
      "<label>Email me important alerts" + sel("notifyEmail", [["on", "On"], ["off", "Off"]], s.notifyEmail) + "</label>" +
      "<label>“Hey FODO” wake word" + sel("wakeWord", [["on", "On — always listening while this page is open"], ["off", "Off"]], s.wakeWord) + "</label>" +
      "<label>Theme" + sel("theme", [["dark", "Dark"], ["light", "Light"]], s.theme || "dark") + "</label>" +
      '<label>I speak<select class="ob-sel" id="ob-lang">' + [["auto", "Automatic — Hindi, English, Hinglish (best)"], ["hi", "Mostly Hindi"], ["en", "Mostly English"]].map(function (o) { var cur = (function () { try { return localStorage.getItem("ob-lang") || "auto"; } catch (e) { return "auto"; } })(); return '<option value="' + o[0] + '"' + (o[0] === cur ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" +
      '</div><div class="ob-row" style="margin-top:14px"><button class="ob-btn pri" type="submit">Save</button><span class="ob-empty" id="ob-sst"></span></div></form>' +
      '<div class="ob-card" style="margin-top:14px"><h2>Your data</h2><div class="ob-row"><a class="ob-btn sm" href="' + API + 'export">Export everything (JSON)</a><a class="ob-btn sm" href="#memory">Manage memory</a><a class="ob-btn sm" href="#activity">Audit log</a></div></div>';
    if (!j.owner) { V().querySelectorAll("#ob-sf select:not(#ob-lang):not([name=theme])").forEach(function (x) { x.disabled = true; }); }
    document.getElementById("ob-lang").onchange = function () { try { localStorage.setItem("ob-lang", this.value); } catch (e) {} };
    document.getElementById("ob-sf").onsubmit = function (e) { e.preventDefault(); var f = new FormData(this), b = {}; f.forEach(function (v, k) { b[k] = v; }); if (b.theme) setTheme(b.theme); if (!j.owner) { document.getElementById("ob-sst").textContent = "Saved on this device."; return; } api("settings", "POST", b).then(function (r) { document.getElementById("ob-sst").textContent = r.ok ? "Saved." : r.reason; }); }; }); };
  /* ---- site changes (code agent) ---- */
  VIEWS.changes = function () { api("changes").then(function (j) { var L = j.items || [], G = j.github || {};
    V().innerHTML = '<h2 class="ob-h">Site changes</h2><p class="ob-sub">Ask the Brain to change the website or admin — “homepage headline ko … kar do”, “pricing page pe WhatsApp button daalo”, “admin users me phone column add karo”. It prepares the exact edit → you confirm → a GitHub pull request with a Cloudflare <b>preview</b> → you confirm again → it goes live. Login, security and the Brain itself are protected and never changed this way.</p>' +
      (G.connected ? '<p class="ob-empty">GitHub: ' + esc(G.repo) + (G.canPush ? " · can push" : " · <b>read-only token</b> — give it Contents + Pull requests write") + "</p>" : '<div class="ob-card" style="margin-bottom:14px"><b>GitHub is not connected.</b> <span class="ob-empty">Add a GITHUB_TOKEN secret — see <a href="#connectors">Connectors</a>.</span></div>') +
      '<form class="ob-cmd" id="ob-chf" style="margin-bottom:14px"><input id="ob-chin" placeholder="Describe a change to the website or admin…" autocomplete="off"><button class="ob-btn pri" type="submit">Prepare</button></form><div class="ob-card ob-scroll">' +
      (L.length ? '<table class="ob-table"><thead><tr><th>Change</th><th>Status</th><th>Links</th><th></th></tr></thead><tbody>' + L.map(function (c) { return "<tr><td><b>" + esc(c.title) + '</b><br><small class="ob-empty">' + esc(c.summary || c.request) + "</small>" + (c.note ? '<br><small class="ob-empty">' + esc(c.note) + "</small>" : "") + "</td><td>" + badge(c.status === "merged" ? "ok" : c.status === "pr_open" ? "info" : c.status === "discarded" ? "error" : "important") + "<br><small>" + esc(c.status.replace("_", " ")) + " · " + esc(c.risk) + " risk</small><br><small>" + fmtDate(c.updated_at) + "</small></td><td>" + (c.pr_url ? '<a href="' + esc(c.pr_url) + '" target="_blank" rel="noopener">Pull request</a>' : "") + (c.preview_url ? '<br><a href="' + esc(c.preview_url) + '" target="_blank" rel="noopener">Preview</a>' : "") + "</td><td>" + (c.status === "proposed" ? '<button class="ob-btn sm pri" data-ch="open" data-id="' + c.id + '">Open PR + preview</button> ' : "") + (c.status === "pr_open" ? '<button class="ob-btn sm pri" data-ch="merge" data-id="' + c.id + '">Deploy live</button> ' : "") + (c.status === "proposed" || c.status === "pr_open" ? '<button class="ob-btn sm" data-ch="discard" data-id="' + c.id + '">Discard</button>' : "") + '<div class="ob-chact" id="cha-' + c.id + '"></div></td></tr>'; }).join("") + "</tbody></table>" : '<p class="ob-empty">No changes yet.</p>') + "</div>";
    document.getElementById("ob-chf").onsubmit = function (e) { e.preventDefault(); var v = document.getElementById("ob-chin").value.trim(); if (v) ask(v); };
    V().querySelectorAll("[data-ch]").forEach(function (b) { b.onclick = function () { b.disabled = true; api("changes/" + b.dataset.id + "/" + b.dataset.ch, "POST", {}).then(function (r) { var box = document.getElementById("cha-" + b.dataset.id);
      if (!r.ok) { box.innerHTML = '<small style="color:#ff5d73">' + esc(r.reason) + "</small>"; b.disabled = false; return; }
      if (!r.pending) { VIEWS.changes(); return; }
      var a = r.action; box.innerHTML = '<div class="ob-act"><pre>' + esc(a.preview) + '</pre><div class="ob-row"><button class="ob-btn sm" data-d="cancel">Cancel</button><button class="ob-btn sm pri" data-d="run">Execute</button></div></div>';
      box.querySelectorAll("[data-d]").forEach(function (x) { x.onclick = function () { box.querySelectorAll("button").forEach(function (y) { y.disabled = true; }); api("confirm", "POST", { actionId: a.id, token: a.token, decision: x.dataset.d === "cancel" ? "cancel" : "run" }).then(function (res) { box.innerHTML = res.ok ? (res.cancelled ? "Cancelled." : "<b>Done.</b> " + esc(res.result && (res.result.note || res.result.preview || res.result.pr) || "")) : '<small style="color:#ff5d73">' + esc(res.error || res.reason) + "</small>"; setTimeout(VIEWS.changes, 1800); }); }; }); }); }; }); }); };
  /* ---- automations ---- */
  VIEWS.automations = function () { api("automations").then(function (j) { var L = j.items || [], EV = j.events || {}, AC = j.actions || {};
    V().innerHTML = '<h2 class="ob-h">Automations</h2><p class="ob-sub">WHEN something happens on FODO (or on a schedule) → THEN the Brain acts. Events fire the moment they happen; schedules run every hour from GitHub. Automations can only notify you, email you, create tasks or send your briefing — they can never email customers or touch money.</p>' +
      '<div class="ob-card ob-scroll"><table class="ob-table"><thead><tr><th>On</th><th>Automation</th><th>When</th><th>Then</th><th>Last run</th><th></th></tr></thead><tbody>' + (L.map(function (a) { return '<tr><td><input type="checkbox" data-tg="' + a.id + '"' + (a.enabled ? " checked" : "") + '></td><td><b>' + esc(a.name) + "</b></td><td><small>" + esc(a.trigger_type === "event" ? (EV[a.trigger_value] || a.trigger_value) : a.trigger_value) + (a.cond ? " · if contains “" + esc(JSON.parse(a.cond).contains) + "”" : "") + (a.next_run ? "<br>next " + fmtDate(a.next_run) : "") + "</small></td><td><small>" + esc(AC[a.action] || a.action) + "</small></td><td><small>" + (a.last_run ? fmtDate(a.last_run) + " · " + a.runs + "×" : "never") + '</small></td><td><button class="ob-btn sm danger" data-del="' + a.id + '">Delete</button></td></tr>'; }).join("") || '<tr><td colspan="6" class="ob-empty">No automations.</td></tr>') + "</tbody></table></div>" +
      '<form class="ob-card" id="ob-af" style="margin-top:14px"><h2>New automation</h2><div class="ob-grid g3"><input class="ob-in" name="name" placeholder="Name" required><select class="ob-sel" name="trigger_type" id="ob-att"><option value="event">When an event happens</option><option value="schedule">On a schedule</option></select><span id="ob-atv"></span><select class="ob-sel" name="action">' + Object.keys(AC).map(function (k) { return '<option value="' + k + '">' + esc(AC[k]) + "</option>"; }).join("") + '</select><input class="ob-in" name="text" placeholder="Message / task title (optional)"><input class="ob-in" name="contains" placeholder="Only if the detail contains… (optional)"></div><div class="ob-row" style="margin-top:10px"><button class="ob-btn pri" type="submit">Create</button><span class="ob-empty" id="ob-ast"></span></div></form>';
    var tv = function () { document.getElementById("ob-atv").innerHTML = document.getElementById("ob-att").value === "event" ? '<select class="ob-sel" name="trigger_value">' + Object.keys(EV).map(function (k) { return '<option value="' + k + '">' + esc(EV[k]) + "</option>"; }).join("") + "</select>" : '<input class="ob-in" name="trigger_value" value="daily 08:00" placeholder="daily 08:00 · weekly mon 09:30 · hourly">'; };
    document.getElementById("ob-att").onchange = tv; tv();
    document.getElementById("ob-af").onsubmit = function (e) { e.preventDefault(); var f = new FormData(this), b = {}; f.forEach(function (v, k) { b[k] = v; }); api("automations", "POST", { name: b.name, trigger_type: b.trigger_type, trigger_value: b.trigger_value, action: b.action, action_args: b.text ? { text: b.text, title: b.text } : {}, cond: b.contains ? { contains: b.contains } : null }).then(function (r) { if (r.ok) VIEWS.automations(); else document.getElementById("ob-ast").textContent = r.reason; }); };
    V().querySelectorAll("[data-tg]").forEach(function (c) { c.onchange = function () { api("automations/" + c.dataset.tg + "/toggle", "POST", { on: c.checked }); }; });
    V().querySelectorAll("[data-del]").forEach(function (b) { b.onclick = function () { if (confirm("Delete this automation?")) api("automations/" + b.dataset.del, "DELETE").then(VIEWS.automations); }; }); }); };
  /* ---- connectors ---- */
  VIEWS.connectors = function () { api("connectors").then(function (j) {
    var hs = location.hash, msg = (/google=([^&]+)/.exec(hs) || [])[1], acct = (/account=([^&]+)/.exec(hs) || [])[1], row = function (name, ok, detail, act) { return "<tr><td><b>" + name + "</b></td><td>" + badge(ok ? "ok" : "important") + "</td><td><small>" + detail + "</small></td><td>" + (act || "") + "</td></tr>"; };
    var g = j.google || {}, gh = j.github || {}, so = j.social || {}, GA = g.accounts || [];
    var gRows = !g.available ? '<p class="ob-empty">Needs GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (already used for Search Console).</p>' :
      (GA.length ? '<ul class="ob-list">' + GA.map(function (a) { return '<li><span class="ob-av">' + esc(a.account.charAt(0).toUpperCase()) + '</span><div class="t"><b>' + esc(a.account) + "</b><small>" + esc((a.scopes || []).join(" · ") || "no permissions") + " · last used " + fmtDate(a.lastUsed) + '</small></div><button class="ob-btn sm danger" data-gdis="' + esc(a.account) + '">Disconnect</button></li>'; }).join("") + "</ul>" : '<p class="ob-empty">No Google account connected yet.</p>') +
      '<div class="ob-row" style="margin-top:10px"><a class="ob-btn sm pri" href="' + API + 'connect/google">' + (GA.length ? "+ Add another Google account" : "Connect Google") + '</a><small class="ob-empty">Each account: Gmail, Calendar, Analytics 4, YouTube, Drive, Sheets — untick anything on Google\'s screen you don\'t want to share.</small></div>';
    V().innerHTML = '<h2 class="ob-h">Connectors</h2><p class="ob-sub">Everything the Brain can read or act on. Keys live only in Cloudflare secrets — never in the page. Sending, posting and paying always ask you first.</p>' +
      (msg ? '<div class="ob-card" style="margin-bottom:14px">' + (msg === "ok" ? "<b>Google connected" + (acct ? ": " + esc(decodeURIComponent(acct)) : "") + ".</b> Try: “aaj ke important emails?”, “last week ka website traffic?”, “YouTube kaisa chal raha hai?”" : "Google: " + esc(decodeURIComponent(msg))) + "</div>" : "") +
      '<div class="ob-card" style="margin-bottom:14px"><h2>Google accounts (' + GA.length + ")</h2>" + gRows + "</div>" +
      '<div class="ob-card" style="margin-bottom:14px"><h2>Google Analytics 4 property</h2><div class="ob-row"><select class="ob-sel" id="ob-gap" style="max-width:420px"><option value="">Automatic (the property whose name contains “fodo”)</option></select><button class="ob-btn sm" id="ob-gaps">Save</button><small class="ob-empty" id="ob-gapm"></small></div></div>' +
      '<div class="ob-card ob-scroll"><table class="ob-table"><tbody>' +
      row("Social media", so.facebook || so.linkedin || so.x, "Facebook " + (so.facebook ? "✓" : "✗") + " · Instagram " + (so.instagram ? "✓" : "✗") + " · LinkedIn " + (so.linkedin ? "✓" : "✗") + (so.linkedin_org ? " (+ company pages)" : "") + " · X " + (so.x ? "✓" : "✗") + " · YouTube " + (so.youtube ? "✓ via Google" : "✗"), '<a class="ob-btn sm" href="#social">Open Social</a>') +
      row("Cashfree payments", j.cashfree, j.cashfree ? "orders, payments and settlements (read only)" : "CASHFREE_APP_ID + CASHFREE_SECRET_KEY (step 5 of the setup)") +
      row("GitHub (site changes)", gh.connected, gh.connected ? esc(gh.repo) + (gh.canPush ? " · write access" : " · read-only — add Contents + Pull requests write") : "Add secret <code>GITHUB_TOKEN</code> — a fine-grained token for the fodo-website repo with <i>Contents: read &amp; write</i> and <i>Pull requests: read &amp; write</i>. Optional <code>PAGES_PROJECT</code> = your Cloudflare Pages project name (for preview links).") +
      row("AI — Workers AI", j.ai["workers-ai"], j.ai["workers-ai"] ? "answers, embeddings (semantic memory), voice (Aura), speech-to-text (Whisper), file reading" : "AI binding missing") +
      row("AI — Groq", j.ai.groq, j.ai.groq ? "fallback for answers" : "optional: GROQ_API_KEY") + row("AI — Gemini", j.ai.gemini, j.ai.gemini ? "fallback for answers" : "optional: GEMINI_API_KEY") +
      row("Email (Resend)", j.email, j.email ? "alerts to you + sending from FODO" : "RESEND_API_KEY") + row("Web search", j.search, j.search ? "research + web_search" : "SERPER_API_KEY or BRAVE_API_KEY") +
      row("Files (PDF, Word, Excel, images)", j.files, j.files ? "converted with Workers AI" : "needs the AI binding") + row("Media storage (social uploads)", !!j.media, j.media === "r2" ? "Cloudflare R2 bucket" : j.media === "kv" ? "Workers KV (free 1 GB; Instagram/Facebook wait ~1 min after upload). Optional: bind an R2 bucket as MEDIA." : "none") +
      row("Scheduler", j.cron, j.cron ? "hourly automations, scheduled posts (GitHub workflow “FODO brain”) + daily briefing" : "CRON_KEY + GitHub secret FODO_CRON_KEY") + "</tbody></table></div>";
    V().querySelectorAll("[data-gdis]").forEach(function (b) { b.onclick = function () { if (confirm("Disconnect " + b.dataset.gdis + "? The Brain stops reading its Gmail, Calendar, Analytics, YouTube and Drive.")) api("connectors/google/disconnect", "POST", { account: b.dataset.gdis }).then(VIEWS.connectors); }; });
    var sel = document.getElementById("ob-gap"), cur = j.gaProperty || "";
    if (GA.length) fetchProps(); else sel.disabled = true;
    function fetchProps() { api("ga/properties").then(function (r) { (r.items || []).forEach(function (p) { var o = document.createElement("option"); o.value = p.property; o.textContent = p.name + " (" + p.property + ") · " + p.account; if (p.property === cur) o.selected = true; sel.appendChild(o); }); if (r.reason) document.getElementById("ob-gapm").textContent = r.reason; }); }
    document.getElementById("ob-gaps").onclick = function () { api("settings", "POST", { gaProperty: sel.value }).then(function (r) { document.getElementById("ob-gapm").textContent = r.ok ? "Saved." : r.reason; }); };
  }); };
  window.__OB = { api: api, esc: esc, md: md, V: V, VIEWS: VIEWS, send: send, speak: speak, S: S, fmtDate: fmtDate, num: num, inr: inr, badge: badge, can: can, go: go, API: API, setTheme: setTheme };
})();
