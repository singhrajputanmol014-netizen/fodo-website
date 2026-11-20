/* FODO v52 Studio on fodo.co.in (/studio/): the FODO Studio app's look (same sidebar, cards, buttons, theme bar, UI 2.0 icons)
   on the website. Data comes from /api/social/* (functions/_lib/sstudio.js); the pages are js/ws-social.js, rendered in the app's
   design: this shell gives it window.FODO_WS (api helpers, modal, toast) and maps its classes onto the app's components.
   Heavy work (AI clipping, editor, captions) runs in the FODO Studio app on the person's own computer, never on FODO's servers. */
(function () {
  "use strict";
  var root = document.getElementById("fs"); if (!root) return;
  var $ = function (s, el) { return (el || document).querySelector(s); }, $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  /* the app's sidebar (same sections and order as the FODO Studio app) */
  var NAV = [["dash", "Home", "🏠", "overview"], "Social", ["calendar", "Calendar", "📅", "calendar"], ["posts", "Publish", "🚀", "posts"], ["inbox", "Inbox", "📨", "inbox"], ["clients", "Clients", "👥", "accounts"],
    "Studio", ["clipping", "AI Clipping", "✂", "clipping"], ["editor", "Editor", "🎛", "clipping"], ["captions", "Caption & Font Studio", "Aa", "clipping"],
    "Marketing", ["planner", "Content Planner", "🧠", "planner"], ["analytics", "Analytics & Reports", "📈", "analytics"], ["bio", "Link in bio", "🔗", "bio"],
    "You", ["control", "Control panel", "🛠", "control"], ["app", "Get the app", "⬇", "app"]];
  var TITLE = { overview: ["Home", "Plan, post, answer and grow every account, for you and your clients, from one place."], calendar: ["Content calendar", "Every scheduled, draft and posted video. Drag a scheduled post to another day to move it (the time stays the same)."],
    posts: ["Publish", "Upload videos, schedule them on one or many accounts, approve drafts and see what went out."], inbox: ["Inbox", "Every comment on your posts, all projects in one list. Leads and questions are tagged so nobody waits."],
    accounts: ["Clients", "Each client project has its own accounts, posting slots and approval links."], clipping: ["AI Clipping", "Clipping, editing and captions run on your own computer with the FODO Studio app, using your computer's power."],
    planner: ["Content planner", "Plan posts from idea to published. Drag cards between stages."], analytics: ["Analytics & reports", "Real numbers from the platforms. Best time to post, top videos and a client report in one click."], bio: ["Link in bio", "One page with your links, a WhatsApp button and your latest videos. Counts views and clicks."],
    control: ["Control panel", "Your own FODO Studio: account, computers, connected accounts, storage and recent activity."], app: ["Get the app", "FODO Studio for Windows and Mac, and on your phone's home screen."] };
  var CUR = "overview";

  /* ---------- helpers the Social Studio module expects (window.FODO_WS) ---------- */
  function toast(t, bad) { var d = $("#fs-toast"); if (!d) { d = document.createElement("div"); d.id = "fs-toast"; d.className = "toast"; d.setAttribute("role", "status"); document.body.appendChild(d); }
    d.textContent = t; d.style.borderLeftColor = bad ? "var(--err)" : "var(--orange)"; d.style.display = "block"; clearTimeout(d._t); d._t = setTimeout(function () { d.style.display = "none"; }, 5000); }
  function modal(html, onOpen) { var m = document.createElement("div"); m.className = "pmodal fs-modal"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true");
    m.innerHTML = '<div class="box ws-mc"><button type="button" class="btn ghost sm fs-x" data-x aria-label="Close">✕</button>' + html + "</div>"; document.body.appendChild(m);
    var close = function () { m.remove(); document.removeEventListener("keydown", k); }, k = function (e) { if (e.key === "Escape") close(); }; document.addEventListener("keydown", k);
    m.addEventListener("click", function (e) { if (e.target === m || e.target.closest("[data-x]")) close(); }); skin(m); var f = m.querySelector("input:not([type=hidden]),select,textarea"); if (f) f.focus(); if (onOpen) onOpen(m, close); return { el: m, close: close }; }
  var fd = function (form) { var o = {}; new FormData(form).forEach(function (v, k) { if (o[k] !== undefined) o[k] = [].concat(o[k], v); else o[k] = v; }); $$("input[type=checkbox]", form).forEach(function (c) { if (!c.value || c.value === "on") o[c.name] = c.checked; }); return o; };
  var empty = function (t, sub, cta) { return '<div class="empty ws-empty"><b>' + esc(t) + "</b>" + (sub ? "<p>" + esc(sub) + "</p>" : "") + (cta || "") + "</div>"; };
  var head = function (t, sub, extra) { var T = TITLE[CUR] || [t, sub]; return '<header class="ws-h"><div><h1>' + esc(T[0]) + '</h1><p class="sub">' + esc(sub && CUR !== "overview" && sub !== TITLE.overview[1] ? sub : T[1]) + "</p></div>" + (extra || "") + "</header>"; };
  window.FODO_WS = { esc: esc, $: $, $$: $$, toast: toast, modal: modal, fd: fd, empty: empty, head: head, me: function () { return null; } };

  /* ---------- the app's components for the module's markup ---------- */
  function skin(scope) {
    if (!scope || !scope.querySelectorAll) return;
    $$(".ws-btn", scope).concat(scope.matches && scope.matches(".ws-btn") ? [scope] : []).forEach(function (b) { if (b._sk) return; b._sk = 1; b.classList.add("btn"); if (!b.classList.contains("pri")) b.classList.add("ghost"); });
    $$(".ws-card", scope).forEach(function (c) { if (c._sk) return; c._sk = 1; c.classList.add("kpi"); var s = c.querySelector(":scope>small"), b = c.querySelector(":scope>b"), n = c.querySelector(":scope>span"); if (s) s.classList.add("k"); if (b) b.classList.add("v"); if (n) n.classList.add("n"); });
    $$(".ws-pill", scope).forEach(function (p) { if (p._sk) return; p._sk = 1; p.classList.add("pst"); if (p.classList.contains("st-cancelled")) p.classList.add("err"); if (p.classList.contains("on")) p.classList.add("run"); });
    $$(".ss-box", scope).forEach(function (c) { c.classList.add("card"); });
    $$(".ws-badge", scope).forEach(function (c) { c.classList.add("badge", "warn"); });
  }
  new MutationObserver(function (ms) { ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) skin(n.parentElement || n); }); }); }).observe(document.body, { childList: true, subtree: true });

  /* ---------- theme (same three buttons as the app) ---------- */
  function setTheme(m) { try { localStorage.setItem("fodo-studio-theme", m); } catch (e) {} var t = m === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : m; document.documentElement.setAttribute("data-theme", t); $$(".themebar button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-th") === m); }); }
  window.setTheme = setTheme;

  /* ---------- shell ---------- */
  function shell(me) {
    root.innerHTML = '<div class="fs-top"><button type="button" class="btn ghost sm" id="fs-burger" aria-label="Menu" aria-expanded="false">☰</button><b>FODO Studio</b></div><div class="app" id="appView" style="display:grid"><div class="side" id="fs-side"><div class="brand"><div class="bmark">F</div><div><div class="logo">FODO <span>STUDIO</span></div><div class="tag">Social · Studio · Marketing</div></div></div>' +
      NAV.map(function (n) { return typeof n === "string" ? '<div class="navsec">' + n + "</div>" : '<button type="button" class="nav" data-v="' + n[0] + '" data-tab="' + n[3] + '"><i>' + n[2] + "</i>" + esc(n[1]) + (n[0] === "inbox" ? ' <span id="ibNavBadge" class="badge warn" style="display:none;margin-left:auto"></span>' : "") + "</button>"; }).join("") +
      '<div class="navsec">FODO</div><a class="nav" href="/workspace/"><i>⚙</i>FODO Workspace</a><div style="flex:1"></div><div class="themebar" title="Theme"><button type="button" data-th="light">☀️ Light</button><button type="button" data-th="dark">🌙 Dark</button><button type="button" data-th="system">Auto</button></div>' +
      '<div class="who"><span class="mut">' + esc(me.email || "") + '</span><button type="button" class="nav out" id="fs-out" title="Log out">Log out</button></div></div><div class="main" id="v-main"><div id="v-' + CUR + '"></div></div></div>';
    $$(".side .nav[data-v]").forEach(function (b) { b.addEventListener("click", function () { nav(b.getAttribute("data-v")); }); });
    $$(".themebar button").forEach(function (b) { b.addEventListener("click", function () { setTheme(b.getAttribute("data-th")); }); });
    $("#fs-out").addEventListener("click", function () { fetch("/api/account/logout", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" }).then(function () { location.href = "/"; }); });
    $("#fs-burger").addEventListener("click", function () { var o = document.body.classList.toggle("fs-navopen"); this.setAttribute("aria-expanded", String(o)); });
    var t = "dark"; try { t = localStorage.getItem("fodo-studio-theme") || "dark"; } catch (e) {} setTheme(t);
  }
  /* sidebar → hash route (#social?tab=…, the same links the module uses) */
  function nav(v) { var n = NAV.filter(function (x) { return typeof x !== "string" && x[0] === v; })[0]; if (!n) return; location.hash = "social?tab=" + n[3] + (v === "editor" || v === "captions" ? "&open=" + v : ""); }
  window.nav = nav;
  function route() {
    var h = location.hash.slice(1), parts = h.split("?"), q = new URLSearchParams(parts[1] || ""); if (parts[0] && parts[0] !== "social") q = new URLSearchParams("tab=" + parts[0]);
    var tab = q.get("tab") || "overview"; if (!TITLE[tab]) tab = "overview"; CUR = tab;
    var open = q.get("open"), act = open === "editor" ? "editor" : open === "captions" ? "captions" : ({ overview: "dash", calendar: "calendar", posts: "posts", inbox: "inbox", accounts: "clients", clipping: "clipping", planner: "planner", analytics: "analytics", bio: "bio", control: "control", app: "app" })[tab];
    $$(".side .nav[data-v]").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-v") === act); });
    document.body.classList.remove("fs-navopen"); document.title = (TITLE[tab] || TITLE.overview)[0] + " · FODO Studio";
    var main = $("#v-main"); main.innerHTML = '<div id="v-' + tab + '"><div class="empty"><span class="spinner"></span></div></div>'; var el = main.firstElementChild;
    window.FODO_WS_SOCIAL.view(el, q); scrollTo(0, 0);
    try { if (window.nav && window.nav.ui2) {} } catch (e) {}
  }
  function badge() { fetch("/api/social/state", { credentials: "same-origin" }).then(function (r) { return r.json(); }).then(function (j) { var b = $("#ibNavBadge"); if (b && j.ok) { b.textContent = j.kpis.inbox; b.style.display = j.kpis.inbox ? "" : "none"; } }, function () {}); }
  function login() {
    root.innerHTML = '<div class="fs-login"><div class="card"><div class="brand"><div class="bmark">F</div><div><div class="logo">FODO <span>STUDIO</span></div><div class="tag">Social · Studio · Marketing</div></div></div><h1>Log in to FODO Studio</h1><p class="sub">Plan, post and grow every social account, for you and your clients. Use your FODO account (Google or email).</p><a class="btn" href="/workspace/#social">Log in</a></div></div>';
  }
  /* ---------- v53: Studio key gate ---------- */
  function getLic() { return fetch("/api/social/license", { credentials: "same-origin" }).then(function (r) { return r.json(); }); }
  function gate(u, go) {
    getLic().then(function (j) {
      var L = j && j.license; if (j && j.ok && L && L.status === "active") return go();
      if (!j || !L) { root.innerHTML = '<div class="empty">Couldn\'t check your Studio access. Check your connection and reload.</div>'; return; }
      var blocked = L.status === "blocked";
      root.innerHTML = '<div class="fs-login"><div class="card fs-gate"><div class="brand"><div class="bmark">F</div><div><div class="logo">FODO <span>STUDIO</span></div><div class="tag">Social · Studio · Marketing</div></div></div>' +
        (blocked ? '<h1>Your FODO Studio is blocked</h1><p class="sub">' + esc(L.blocked_reason ? "Reason: " + L.blocked_reason + ". " : "") + "Please contact FODO to turn it back on.</p>" :
          '<h1>Enter your Studio key</h1><p class="sub">FODO Studio is invite only. FODO gives every person their own key (FODO-XXXX-XXXX-XXXX-XXXX-XXXX). Your key ends in <b>' + esc(L.hint || "") + '</b>. Enter it once to open Studio here; the same key unlocks the desktop app.</p>' +
          '<form id="fs-kf" class="fs-kf" autocomplete="off"><label for="fs-key">Studio key</label><input id="fs-key" name="key" inputmode="text" autocapitalize="characters" spellcheck="false" maxlength="40" placeholder="FODO-XXXX-XXXX-XXXX-XXXX-XXXX" required><button class="btn" type="submit">Open Studio</button><p id="fs-kmsg" class="fs-kmsg" role="status" aria-live="polite"></p></form>' +
          '<p class="sub small">No key yet? Ask FODO on <a href="https://wa.me/?text=' + encodeURIComponent("Hi FODO, please send my FODO Studio key. My login: " + (u.email || "")) + '" target="_blank" rel="noopener">WhatsApp</a> and share your login email: <b>' + esc(u.email || "") + "</b>.</p>") +
        '<p class="sub small">Logged in as ' + esc(u.email || "") + ' · <a href="#" id="fs-gout">Log out</a></p></div></div>';
      $("#fs-gout").addEventListener("click", function (e) { e.preventDefault(); fetch("/api/account/logout", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" }).then(function () { location.href = "/"; }); });
      var f = $("#fs-kf"); if (!f) return;
      var inp = $("#fs-key"), msg = $("#fs-kmsg"); inp.focus();
      inp.addEventListener("input", function () { var c = inp.value.toUpperCase().replace(/[^0-9A-Z]/g, ""); if (c.indexOf("FODO") === 0) c = c.slice(4); var g = c.slice(0, 20).match(/.{1,4}/g) || []; inp.value = g.length ? "FODO-" + g.join("-") : inp.value.toUpperCase(); });
      f.addEventListener("submit", function (e) {
        e.preventDefault(); var b = f.querySelector("button"); b.disabled = true; msg.textContent = "Checking…"; msg.className = "fs-kmsg";
        fetch("/api/social/license", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: inp.value }) }).then(function (r) { return r.json(); }).then(function (k) {
          b.disabled = false; if (k.ok && k.license && k.license.status === "active") { msg.textContent = "Studio is on. Opening…"; return go(); }
          msg.textContent = k.reason || "That key didn't work."; msg.className = "fs-kmsg bad";
        }, function () { b.disabled = false; msg.textContent = "No connection. Try again."; msg.className = "fs-kmsg bad"; });
      });
    }, function () { root.innerHTML = '<div class="empty">Couldn\'t check your Studio access. Check your connection and reload.</div>'; });
  }
  function boot() {
    var sc = document.createElement("script"), v = (document.querySelector('script[src*="/js/fodo-studio.js"]') || {}).src || "", ver = v.indexOf("v=") > -1 ? "?v=" + v.split("v=")[1] : "";
    fetch("/api/account/me", { credentials: "same-origin" }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._s = r.status; return j; }); }, function () { return { _s: 0 }; }).then(function (me) {
      var u = me && (me.user || me.account || (me.email ? me : null)); if (!u || !u.email) return login();
      /* v53: Studio opens only after the person's key (given by FODO) is entered */
      gate(u, function () { sc.src = "/js/ws-social.js" + ver; sc.onload = function () { shell(u); route(); badge(); window.addEventListener("hashchange", route); };
      sc.onerror = function () { root.innerHTML = '<div class="empty">Couldn\'t load FODO Studio. Check your connection and reload.</div>'; }; document.head.appendChild(sc); });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
