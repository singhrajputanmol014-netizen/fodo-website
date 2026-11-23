/* FODO Admin, the team dashboard at /admin/ (v15).
   Data: /api/admin/* (server checks who you are on every call). Owners (the two FODO owner logins) can block users and give
   plans, X-Rays or single features free; viewers added under Team can only look. Login uses the site's own login (js/account.js). */
(function () {
  "use strict";
  var A = window.FODO_ACCOUNT, root = document.getElementById("adm"); if (!A || !root) return;
  var esc = A.esc, inr = function (n) { return "₹" + Math.round(+n || 0).toLocaleString("en-IN"); }, $ = function (s, el) { return (el || document).querySelector(s); }, $$ = function (s, el) { return [].slice.call((el || document).querySelectorAll(s)); };
  var ME = null, OV = null;
  var api = function (p, body) { return fetch("/api/admin/" + p, { method: body === undefined ? "GET" : "POST", credentials: "same-origin", headers: body === undefined ? {} : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }).then(function (r) { return r.json().catch(function () { return { ok: false, reason: "Bad answer (" + r.status + ")" }; }).then(function (j) { j._status = r.status; return j; }); }, function () { return { ok: false, reason: "No connection." }; }); };
  var date = function (s, t) { if (!s) return "—"; var d = new Date(s); return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + (t ? " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""); };
  var ago = function (s) { if (!s) return "never"; var m = (Date.now() - Date.parse(s)) / 6e4; return m < 1 ? "just now" : m < 60 ? Math.round(m) + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago"; };
  var KIND = { login_google: "Logged in · Google", login_email: "Logged in · email code", xray_start: "Started an X-Ray", xray_done: "Finished an X-Ray", xray_refund: "X-Ray refunded (site unreadable)", limit_hit: "Ran out of X-Rays", checkout: "Opened payment", paid: "Paid",
    export_pdf: "Downloaded PDF", export_xlsx: "Downloaded Excel", export_csv: "Downloaded findings CSV", export_plan: "Downloaded plan CSV", export_json: "Downloaded JSON", share: "Copied share link", finder_export: "Downloaded competitor sheet",
    edge_fixPack: "FODO Edge · AI Fix Pack", edge_battleCards: "FODO Edge · Battle cards", edge_roadmap90: "FODO Edge · 90-day roadmap", edge_clientPitch: "FODO Edge · Client pitch", linkcheck: "Broken-link check", authority: "Domain authority", copy_schema: "Copied schema code", copy_pitch: "Copied client pitch", blocked_try: "Tried to log in while blocked", admin_grant: "Given free by FODO", admin_block: "Blocked / unblocked by FODO" };
  var kind = function (k) { return KIND[k] || (k === "tool_use" ? "Used a tool" : String(k).replace(/_/g, " ").replace(/^./, function (c) { return c.toUpperCase(); })); };
  var PLAN_C = { free: "", starter: "t-s", growth: "t-g", pro: "t-p", agency: "t-a", owner: "t-o" };
  var badge = function (plan) { return '<span class="ad-plan ' + (PLAN_C[plan] || "") + '">' + esc(plan) + "</span>"; };
  var csv = function (rows, name) { var t = rows.map(function (r) { return r.map(function (v) { v = v == null ? "" : String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\n"); var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + t], { type: "text/csv" })); a.download = name + "-" + new Date().toISOString().slice(0, 10) + ".csv"; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 500); };
  var toast = function (t, bad) { var el = document.createElement("div"); el.className = "ad-toast" + (bad ? " bad" : ""); el.textContent = t; el.setAttribute("role", "status"); document.body.appendChild(el); setTimeout(function () { el.classList.add("out"); }, 2600); setTimeout(function () { el.remove(); }, 3100); };
  var owner = function () { return ME && (ME.role === "owner" || ME.role === "admin"); };   // can change things
  var who = function (u) { return (u && (u.email || u.phone || u.name)) || "—"; }, ini = function (u) { return esc(String((u && (u.name || u.email || u.phone)) || "U").charAt(0).toUpperCase()); };
  /* in-page dialog (some phone browsers block window.prompt/confirm, which made Block do nothing) */
  function ask(o) {
    return new Promise(function (res) {
      var w = document.createElement("div"); w.className = "cfx ad-dlg"; w.innerHTML = '<div class="cfx-back" data-x></div><div class="cfx-box" role="dialog" aria-modal="true" aria-labelledby="ad-dt"><h3 id="ad-dt">' + esc(o.title) + "</h3>" + (o.text ? '<p class="muted">' + esc(o.text) + "</p>" : "") +
        (o.input ? '<label class="ad-dl2" for="ad-di">' + esc(o.input) + '</label>' + (o.area ? '<textarea id="ad-di" class="ad-in ad-ta" rows="5" maxlength="1500" placeholder="' + esc(o.ph || "") + '"></textarea>' : '<input id="ad-di" class="ad-in" maxlength="200" placeholder="' + esc(o.ph || "") + '">') : "") + '<div class="btn-row"><button type="button" class="btn ' + (o.danger ? "danger" : "") + '" data-ok>' + esc(o.ok || "OK") + '</button><button type="button" class="btn ghost" data-x>Cancel</button></div></div>';
      document.body.appendChild(w); var done = function (v) { w.remove(); res(v); }, inp = w.querySelector("#ad-di");
      w.querySelector("[data-ok]").onclick = function () { done(inp ? inp.value.trim() : true); }; w.querySelectorAll("[data-x]").forEach(function (b) { b.onclick = function () { done(null); }; });
      w.onkeydown = function (e) { if (e.key === "Escape") done(null); if (e.key === "Enter" && inp && !o.area) done(inp.value.trim()); }; setTimeout(function () { (inp || w.querySelector("[data-ok]")).focus(); }, 30);
    });
  }

  /* ---------- shell ---------- */
  var TABS = [["overview", "Overview", "M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z"], ["traffic", "Traffic", "M3 3v18h18M7 15l4-4 3 3 6-6"], ["users", "Users", "M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4zM8 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.7 0-6 1.3-6 4v2h8v-2c0-1 .4-2 1.1-2.8A9 9 0 0 0 8 13zm8 0c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z"],
    ["studio", "Studio", "M4 5h16v11H4zM8 20h8M12 16v4M10 8.5l4 2.5-4 2.5z"],
    ["xrays", "X-Rays", "M11 2a9 9 0 1 0 5.6 16l4.7 4.7 1.4-1.4-4.7-4.7A9 9 0 0 0 11 2zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14z"], ["leads", "Leads", "M12 2l2.9 6.9L22 9.3l-5.5 4.7L18.2 21 12 17.3 5.8 21l1.7-7L2 9.3l7.1-.4z"],
    ["payments", "Payments", "M2 6h20v12H2zm2 2v2h16V8zm0 6v2h6v-2z"], ["activity", "Activity", "M3 12h4l3-8 4 16 3-8h4"], ["lab", "Growth Lab", "M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"], ["businesses", "Businesses", "M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1M9 13h1m4 0h1M9 17h1m4 0h1"], ["findings", "Findings", "M4 6h16M4 12h10M4 18h7M18 15l3 3-3 3"], ["quality", "Quality", "M9 12l2 2 4-4M12 3l8 4v5c0 5-3.4 8.6-8 9-4.6-.4-8-4-8-9V7z"], ["prompts", "AI prompts", "M4 5h16v11H8l-4 4zM8 9h8M8 12h5"], ["costs", "Costs & profit", "M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"], ["monitoring", "Monitoring", "M2 12h4l2-6 4 12 2-6h8"], ["settings", "Prices & tools", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8.5-3a8.5 8.5 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a8.6 8.6 0 0 0-2.2-1.3L15.5 2h-4l-.4 2.5a8.6 8.6 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a8.5 8.5 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a8.6 8.6 0 0 0 2.2 1.3l.4 2.5h4l.4-2.5a8.6 8.6 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3z"], ["team", "Team", "M12 1l9 4v6c0 5-3.8 9.7-9 11-5.2-1.3-9-6-9-11V5z"]];
  // v34 enquiries + website settings
  TABS.push(["security", "Security reports", "M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"], ["enquiries", "Enquiries", "M4 4h16v12H5.2L4 17.2zM8 8h8M8 11h5"], ["sitesettings", "Website settings", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 4-2.1-.7.5-2.2-1.9-1.1-1.6 1.6L14 8.5 13 6.5h-2l-1 2-2 .9-1.6-1.6-1.9 1.1.5 2.2L3 12l2.1.7-.5 2.2 1.9 1.1 1.6-1.6 2 .9 1 2h2l1-2 2-.9 1.6 1.6 1.9-1.1-.5-2.2z"]);
  // v20 help desk
  TABS.push(["campaigns", "Email campaigns", "M3 6h18v12H3zm0 0 9 7 9-7M17 3l4 3"]);   // v53.8
  TABS.push(["outreach", "Client Emails", "M4 5h16v14H4zm0 0 8 7 8-7M8 15h4"]);   // v54.2
  TABS.push(["pitch", "Bulk pitch", "M3 11l18-7-7 18-2-8zM12 14l9-10"]);   // v54.6
  TABS.push(["li-dash", "Lead dashboard", "M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z"], ["li-find", "Find businesses", "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4.3-4.3"], ["li-people", "Decision makers", "M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-7 9a7 7 0 0 1 14 0"], ["li-leads", "All leads", "M4 6h16M4 12h16M4 18h16"],
    ["li-hot", "Hot leads", "M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-10z"], ["li-audit", "Website audit", "M4 4h16v12H4zM8 20h8M12 16v4M8 10l2 2 4-4"], ["li-analytics", "Lead analytics", "M3 3v18h18M7 15l4-4 3 3 6-6"], ["li-outreach", "Outreach manager", "M3 11l18-7-7 18-2-8z"], ["li-settings", "Integrations", "M10 14l-6 6M14 10l6-6M8 6l10 10M6 8l2-2 10 10-2 2z"]);   // v55 Lead Intelligence
  TABS.push(["helpdesk", "Help desk", "M4 4h16v12H7l-3 3zm4 5h8M8 12h5"], ["mail", "Mail", "M3 6h18v12H3zm0 0 9 7 9-7"], ["chats", "AI chats", "M4 5h16v10H9l-5 4zM8 9h.01M12 9h.01M16 9h.01"]);
  /* v17.1 navigation: grouped sidebar + ☰ menu (all sections, quick links) */
  var GROUPS = [["", ["overview"]], ["Growth Lab", ["lab", "xrays", "businesses", "findings", "quality", "monitoring", "prompts"]], ["Support", ["helpdesk", "mail", "chats"]], ["Lead Intelligence", ["li-dash", "li-find", "li-people", "li-leads", "li-hot", "li-audit", "li-analytics", "li-outreach", "li-settings"]], ["Customers", ["enquiries", "users", "studio", "pitch", "outreach", "campaigns", "leads", "payments", "activity"]], ["Website", ["traffic", "sitesettings", "security"]], ["Money & setup", ["costs", "settings", "team"]]];
  var TAB = {}; TABS.forEach(function (t) { TAB[t[0]] = t; });
  var MOBILE = ["overview", "lab", "users", "costs"];
  var navLink = function (id) { var t = TAB[id]; return t ? '<a href="#' + t[0] + '" data-tab="' + t[0] + '">' + ico(t[2]) + "<span>" + t[1] + "</span></a>" : ""; };
  function menu() {
    var w = document.createElement("div"); w.className = "ad-menu"; w.setAttribute("role", "dialog"); w.setAttribute("aria-modal", "true"); w.setAttribute("aria-label", "All sections");
    w.innerHTML = '<div class="ad-menu-back" data-mx></div><aside class="ad-menu-box"><div class="ad-menu-h"><b>All sections</b><button type="button" class="ad-ib" data-mx aria-label="Close menu">×</button></div>' +
      GROUPS.map(function (g) { return (g[0] ? '<p class="ad-gl">' + esc(g[0]) + "</p>" : "") + '<div class="ad-menu-g">' + g[1].map(navLink).join("") + "</div>"; }).join("") +
      '<p class="ad-gl">Quick links</p><div class="ad-menu-g"><a href="/growth-lab/" target="_blank" rel="noopener">' + ico("M14 3h7v7M10 14 21 3M19 14v7H3V5h7") + '<span>Growth Lab page</span></a><a href="/business-x-ray/" target="_blank" rel="noopener">' + ico("M14 3h7v7M10 14 21 3M19 14v7H3V5h7") + '<span>Business X-Ray</span></a><a href="/plans/" target="_blank" rel="noopener">' + ico("M14 3h7v7M10 14 21 3M19 14v7H3V5h7") + '<span>Plans page</span></a><a href="/" target="_blank" rel="noopener">' + ico("M14 3h7v7M10 14 21 3M19 14v7H3V5h7") + "<span>fodo.co.in</span></a>" +
      '<button type="button" data-mxall>' + ico("M12 3v12m0 0-4-4m4 4 4-4M4 19h16") + '<span>Export all data (Excel)</span></button><button type="button" data-mtheme>' + ico("M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z") + '<span>Dark / light</span></button><button type="button" data-mout>' + ico("M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10") + "<span>Log out</span></button></div></aside>";
    document.body.appendChild(w); document.body.classList.add("ad-menu-on");
    var close = function () { w.remove(); document.body.classList.remove("ad-menu-on"); $("#ad-menu").focus(); };
    w.querySelectorAll("[data-mx]").forEach(function (b) { b.onclick = close; }); w.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", function () { setTimeout(close, 0); }); });
    w.querySelector("[data-mxall]").onclick = function () { close(); exportAll(); }; w.querySelector("[data-mtheme]").onclick = function () { $("#ad-theme").click(); }; w.querySelector("[data-mout]").onclick = function () { close(); $("#ad-out").click(); };
    w.onkeydown = function (e) { if (e.key === "Escape") close(); };
    var cur = (location.hash || "#overview").slice(1).split("/")[0]; w.querySelectorAll("a[data-tab]").forEach(function (a) { if (a.dataset.tab === cur) a.classList.add("on"); });
    setTimeout(function () { var f = w.querySelector("a.on") || w.querySelector("a"); if (f) f.focus(); }, 30);
  }
  var ico = function (d) { return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>'; };
  function shell() {
    root.innerHTML = '<header class="ad-top"><a class="wordmark" href="/" aria-label="FODO home"><b class="so-mark">FOD<span class="so">O<i></i></span></b><small>FEAR OF DIGITALLY OUT ?</small></a><span class="ad-badge">ADMIN</span><span class="ad-sp"></span>' +
      (ME.role === "owner" ? '<a class="ad-ib ad-brain" href="/owner-brain/" title="FODO BRAIN, owner only" aria-label="Open FODO Brain">✦</a>' : "") + '<span class="ad-role ' + esc(ME.role) + '">' + ({ owner: "Owner · full control", admin: "Admin · full control", viewer: "View only" }[ME.role]) + '</span><button class="ad-ib" type="button" id="ad-theme" aria-label="Switch dark / light mode" title="Dark / light"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg></button><button class="ad-ib ad-burger" type="button" id="ad-menu" aria-label="Open menu, all sections" aria-haspopup="dialog"><i></i><i></i><i></i></button><button class="btn sm ghost ad-xall" type="button" id="ad-xall" title="Download all data as one Excel file">Export all</button><span class="ad-live" id="ad-live" aria-live="polite"></span><button class="ad-ib ad-me" type="button" id="ad-out" title="Log out">' + esc((ME.name || ME.email || "A").charAt(0).toUpperCase()) + "</button></header>" +
      '<nav class="ad-nav" aria-label="Dashboard">' + GROUPS.map(function (g) { return (g[0] ? '<p class="ad-gl">' + esc(g[0]) + "</p>" : "") + g[1].map(function (id) { return navLink(id).replace("<a ", MOBILE.indexOf(id) > -1 ? '<a class="ad-mob" ' : "<a "); }).join(""); }).join("") +
        '<button type="button" class="ad-more" id="ad-more" aria-label="More sections">' + ico("M4 6h16M4 12h16M4 18h16") + "<span>More</span></button>" + '<a class="ad-site" href="/" target="_blank" rel="noopener">' + ico("M14 3h7v7M10 14 21 3M19 14v7H3V5h7") + "<span>Open fodo.co.in</span></a></nav>" +
      '<main class="ad-main" id="ad-view" tabindex="-1"></main>';
    $("#ad-out").onclick = function () { ask({ title: "Log out?", text: "You are logged in as " + who(ME) + ".", ok: "Log out" }).then(function (ok) { if (ok) A.logout().then(function () { location.reload(); }); }); };
    $("#ad-xall").onclick = exportAll; $("#ad-menu").onclick = menu; $("#ad-more").onclick = menu;
    $("#ad-theme").onclick = function () { var h = document.documentElement, t = h.getAttribute("data-theme") === "light" ? "dark" : "light"; h.setAttribute("data-theme", t); try { localStorage.setItem("fodo-theme", t); } catch (e) {} if (OV && location.hash.indexOf("overview") > -1) route(); };
  }
  function gate(msg, btn) {
    root.innerHTML = '<div class="ad-gate panel hud"><a class="wordmark" href="/"><b class="so-mark">FOD<span class="so">O<i></i></span></b><small>FEAR OF DIGITALLY OUT ?</small></a><span class="ad-badge">ADMIN</span><h1>FODO dashboard</h1><p class="muted">' + msg + "</p>" + btn + "</div>";
    var l = $("#ad-login"); if (l) l.onclick = function () { A.login("Log in with your FODO email to open the dashboard.").then(start, function () {}); };
    var o = $("#ad-logout"); if (o) o.onclick = function () { A.logout().then(function () { location.reload(); }); };
  }
  function start() {
    A.config().then(function (c) {
      if (!c.enabled) return gate("Accounts are not switched on (ACCOUNTS_ENABLED).", "");
      return api("me").then(function (j) {
        if (j._status === 401) return gate("Log in with <b>anmol@fodo.co.in</b> or <b>singhrajputanmol014@gmail.com</b> for full control. Team members your owner added can log in to view.", '<button class="btn" id="ad-login" type="button">Log in</button>');
        if (j._status === 403) return gate("This dashboard is only for the FODO team. You are logged in as a customer account.", '<button class="btn ghost" id="ad-logout" type="button">Log out</button> <a class="btn" href="/">Go to fodo.co.in</a>');
        if (!j.ok) return gate(esc(j.reason || "Could not load."), "");
        ME = j; shell(); route();
      });
    });
  }
  addEventListener("hashchange", function () { if (ME) route(); });
  /* live: the views that change by the minute refresh themselves every 20 s while the tab is open */
  var LIVE = { overview: 1, traffic: 1, activity: 1 }, liveT = null;
  function liveTick() {
    var tab = (location.hash || "#overview").slice(1).split("/")[0] || "overview", el = $("#ad-live");
    if (el) el.innerHTML = LIVE[tab] ? '<i></i>Live · ' + new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
    if (!LIVE[tab] || document.hidden || document.querySelector(".ad-dlg,.cfx:not([hidden])")) return;
    ({ overview: overview, traffic: trafficView, activity: activityView }[tab])(true);
  }
  setInterval(function () { if (ME) liveTick(); }, 20000);
  function route() {
    var h = (location.hash || "#overview").slice(1), parts = h.split("/"), tab = parts[0] || "overview";
    root.querySelectorAll(".ad-nav a[data-tab]").forEach(function (a) { var on = a.dataset.tab === tab || (tab === "user" && a.dataset.tab === "users") || (tab === "business" && a.dataset.tab === "businesses") || (tab === "report" && a.dataset.tab === "xrays") || (tab === "li-lead" && a.dataset.tab === "li-leads"); a.classList.toggle("on", on); if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    var v = $("#ad-view"); v.innerHTML = '<div class="ad-load">Loading…</div>';
    setTimeout(liveTick, 50);
    ({ overview: overview, traffic: trafficView, users: usersView, studio: studioView, user: function () { userView(parts[1]); }, xrays: runsView, leads: leadsView, payments: paymentsView, activity: activityView, team: teamView, costs: costsView, monitoring: monitoringView, settings: settingsView, lab: labView, businesses: businessesView, business: function () { businessView(decodeURIComponent(parts.slice(1).join("/"))); }, findings: findingsView, quality: qualityView, report: function () { reportView(parts[1]); }, prompts: promptsView,
      campaigns: function () { campaignsView(parts[1]); }, outreach: outreachView, pitch: pitchView, "li-dash": function () { liDash(false); }, "li-analytics": function () { liDash(true); }, "li-find": liFind, "li-people": function () { liLeads("li-people"); }, "li-leads": function () { liLeads("li-leads"); }, "li-hot": function () { liLeads("li-hot"); }, "li-audit": function () { liLeads("li-audit"); }, "li-outreach": function () { liLeads("li-outreach"); }, "li-settings": liSettings, "li-lead": function () { liLead(decodeURIComponent(parts[1] || "")); }, helpdesk: helpdeskView, ticket: function () { ticketView(parts[1]); }, mail: mailView, chats: chatsView, enquiries: enquiriesView, sitesettings: siteSettingsView, security: securityView, chat: function () { chatView(parts[1]); } }[tab] || overview)();
    scrollTo(0, 0);
  }
  /* ---------- v17: API costs & profitability, system health ---------- */
  var K = function (n, l, sub, c) { return '<div class="ad-kpi ' + (c || "") + '"><b>' + n + "</b><span>" + l + "</span>" + (sub ? "<small>" + sub + "</small>" : "") + "</div>"; };
  var rs = function (n) { return n == null ? "—" : (+n < 0 ? "−₹" : "₹") + (Math.round(Math.abs(+n) * 100) / 100).toLocaleString("en-IN"); };
  var ST = { healthy: "ok", live: "ok", configured: "ok", sandbox: "mid", degraded: "mid", "no calls (24 h)": "mid", down: "bad", "not connected": "off" };
  function costsView() {
    var days = +(location.hash.split("/")[1] || 30) || 30;
    Promise.all([api("costs?days=" + days), api("health")]).then(function (x) {
      var o = x[0], h = x[1]; if (!o.ok) return fail(o); var T = o.totals;
      $("#ad-view").innerHTML = head("Costs & profit", "Every call FODO makes to an outside data provider, what it cost and what it earned. Costs are <b>estimated</b> from list prices (DataForSEO sends its real cost). Only the FODO team sees this.",
          '<div class="btn-row"><select id="ad-cd" class="ad-in" aria-label="Period">' + [7, 30, 90, 365].map(function (d) { return '<option value="' + d + '"' + (d === days ? " selected" : "") + ">Last " + d + " days</option>"; }).join("") + '</select><button class="btn sm ghost" id="ad-ccsv" type="button">Export CSV</button></div>') +
        '<div class="ad-kpis">' + K(rs(T.costInr), "API cost", "$" + T.costUsd + " · " + T.calls + " calls") + K(rs(T.avgReportCostInr), "avg cost per X-Ray", T.reports + " X-Rays (" + T.paidRuns + " paid · " + T.freeRuns + " free · " + T.giftRuns + " owner/gift)") + K(rs(T.revenue), "revenue (paid orders)", "") + K(rs(T.contribution), "contribution", T.marginPct == null ? "no revenue yet" : T.marginPct + "% margin", T.contribution < 0 ? "bad" : "") + K(T.cacheRate + "%", "served from cache", T.cached + " calls saved") + K(T.failed, "failed calls", rs(T.failedCostInr) + " cost on failures") + "</div>" +
        '<div class="panel ad-card"><h2>System health <small class="muted">last 24 hours</small></h2><div class="ad-table"><table><thead><tr><th>Data source</th><th>Status</th><th>Calls</th><th>Failed</th><th>Last call</th><th>Note</th></tr></thead><tbody>' + (h.sources || []).map(function (s0) { return '<tr><td><b>' + esc(s0.name) + '</b></td><td data-l="Status"><span class="ad-st ' + (ST[s0.status] || "") + '">' + esc(s0.status) + '</span></td><td data-l="Calls">' + (s0.calls == null ? "—" : s0.calls) + '</td><td data-l="Failed">' + (s0.failed == null ? "—" : s0.failed) + '</td><td data-l="Last">' + (s0.last ? ago(s0.last) : "—") + '</td><td data-l="Note" class="muted">' + esc(s0.note || "") + "</td></tr>"; }).join("") + "</tbody></table></div></div>" +
        '<div class="ad-grid2"><div class="panel ad-card"><h2>Cost per day</h2>' + (o.byDay.length ? '<div class="ad-table"><table><thead><tr><th>Day</th><th>Calls</th><th>Cached</th><th>Cost</th></tr></thead><tbody>' + o.byDay.slice().reverse().slice(0, 31).map(function (d) { return "<tr><td>" + esc(d.day) + '</td><td data-l="Calls">' + d.calls + '</td><td data-l="Cached">' + (d.cached || 0) + '</td><td data-l="Cost">' + rs(d.costInr) + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<p class="muted">No calls yet.</p>') + "</div>" +
        '<div class="panel ad-card"><h2>By provider</h2><div class="ad-table"><table><thead><tr><th>Provider</th><th>Calls</th><th>Cached</th><th>Failed</th><th>Avg time</th><th>Cost</th></tr></thead><tbody>' + o.byProvider.map(function (p) { return "<tr><td><b>" + esc(p.provider) + '</b></td><td data-l="Calls">' + p.calls + '</td><td data-l="Cached">' + (p.cached || 0) + '</td><td data-l="Failed">' + (p.failed || 0) + '</td><td data-l="Time">' + (p.ms == null ? "—" : p.ms + " ms") + '</td><td data-l="Cost">' + rs(p.costInr) + "</td></tr>"; }).join("") + "</tbody></table></div></div></div>" +
        '<div class="panel ad-card"><h2>Profit per plan <small class="muted">price per X-Ray minus average API cost</small></h2><div class="ad-table"><table><thead><tr><th>Plan</th><th>Price</th><th>X-Rays</th><th>Price per X-Ray</th><th>Runs</th><th>Avg API cost</th><th>Contribution / X-Ray</th><th>Margin</th></tr></thead><tbody>' + o.plans.map(function (p) { return "<tr><td>" + badge(p.id) + '</td><td data-l="Price">' + inr(p.price) + '</td><td data-l="X-Rays">' + p.xrays + '</td><td data-l="Each">' + rs(p.pricePerXray) + '</td><td data-l="Runs">' + p.runs + '</td><td data-l="Cost">' + rs(p.avgCostInr) + '</td><td data-l="Contribution">' + rs(p.contributionPerXray) + '</td><td data-l="Margin">' + (p.marginPct == null ? "—" : p.marginPct + "%") + "</td></tr>"; }).join("") + '</tbody></table></div><p class="muted">Infrastructure: Cloudflare free plan (₹0). Estimated list prices in USD at ₹' + o.rate + "/$: " + o.prices.filter(function (x) { return x.usd > 0; }).map(function (x) { return esc(x.provider) + " $" + x.usd; }).join(" · ") + ", change them with the COST_USD_JSON / USD_INR variables.</p></div>" +
        '<div class="ad-grid2"><div class="panel ad-card"><h2>Cost per report</h2><div class="ad-table"><table><thead><tr><th>Website</th><th>Level</th><th>Calls</th><th>Data</th><th>Cost</th><th>When</th></tr></thead><tbody>' + o.reports.slice(0, 50).map(function (r) { return '<tr><td><a href="/business-x-ray/?r=' + encodeURIComponent(r.job_id) + '" target="_blank" rel="noopener">' + esc(r.domain) + ' ↗</a></td><td data-l="Level">' + badge(r.tier || "free") + '</td><td data-l="Calls">' + r.calls + (r.cached ? " (" + r.cached + " cached)" : "") + '</td><td data-l="Data">' + (r.completeness == null ? "—" : r.completeness + "%") + '</td><td data-l="Cost">' + rs(r.costInr) + '</td><td data-l="When">' + date(r.created_at, 1) + "</td></tr>"; }).join("") + "</tbody></table></div></div>" +
        '<div class="panel ad-card"><h2>By tool</h2><div class="ad-table"><table><thead><tr><th>Tool · endpoint</th><th>Calls</th><th>Cost</th></tr></thead><tbody>' + o.byTool.map(function (t) { return "<tr><td>" + esc(t.tool + " · " + t.endpoint) + '</td><td data-l="Calls">' + t.calls + '</td><td data-l="Cost">' + rs(t.costInr) + "</td></tr>"; }).join("") + '</tbody></table></div><h2 style="margin-top:18px">Top users by cost</h2><div class="ad-table"><table><thead><tr><th>User</th><th>X-Rays</th><th>Cost</th></tr></thead><tbody>' + o.byUser.map(function (u) { return '<tr><td><a href="#user/' + esc(u.user_id) + '">' + esc(u.who) + '</a></td><td data-l="X-Rays">' + u.runs + '</td><td data-l="Cost">' + rs(u.costInr) + "</td></tr>"; }).join("") + "</tbody></table></div></div></div>";
      $("#ad-cd").onchange = function () { location.hash = "costs/" + this.value; };
      $("#ad-ccsv").onclick = function () { csv([["Website", "Job", "Level", "Credit", "Calls", "Cached", "Data completeness %", "Cost INR", "When"]].concat(o.reports.map(function (r) { return [r.domain, r.job_id, r.tier, r.credit, r.calls, r.cached, r.completeness, r.costInr, r.created_at]; })).concat([[], ["Provider", "Calls", "Cached", "Failed", "Cost INR"]]).concat(o.byProvider.map(function (p) { return [p.provider, p.calls, p.cached, p.failed, p.costInr]; })), "fodo-api-costs"); };
    });
  }
  function monitoringView() {
    api("monitoring").then(function (o) { if (!o.ok) return fail(o);
      $("#ad-view").innerHTML = head("Monitoring", "Every website customers monitor (Competitor Change Detector + their own site) and the latest changes found.") +
        '<div class="ad-kpis">' + K(o.targets.length, "monitored websites", o.targets.filter(function (t) { return t.kind === "own"; }).length + " own sites · " + o.targets.filter(function (t) { return t.kind !== "own"; }).length + " competitors") + K(o.events.length, "recent changes", o.events.filter(function (e) { return e.severity === "high"; }).length + " high") + K(o.targets.filter(function (t) { return t.last_status === "down"; }).length, "down right now", "") + "</div>" +
        '<div class="ad-grid2"><div class="panel ad-card"><h2>Websites</h2><div class="ad-table"><table><thead><tr><th>Website</th><th>Type</th><th>User</th><th>Checks</th><th>Last check</th></tr></thead><tbody>' + o.targets.map(function (t) { return "<tr><td><b>" + esc(t.domain) + '</b></td><td data-l="Type">' + esc(t.kind) + '</td><td data-l="User">' + esc(t.email || "—") + '</td><td data-l="Checks">' + t.checks + (t.last_status === "down" ? ' <span class="ad-st bad">down</span>' : "") + '</td><td data-l="Last">' + ago(t.last_check) + "</td></tr>"; }).join("") + '</tbody></table></div></div><div class="panel ad-card"><h2>Latest changes</h2><ul class="ad-feed">' + o.events.slice(0, 60).map(function (e) { return '<li><span class="ad-st ' + (e.severity === "high" ? "bad" : e.severity === "medium" ? "mid" : "off") + '">' + esc(e.severity) + "</span> <b>" + esc(e.domain) + "</b> " + esc(e.what) + ' <small class="muted">' + esc(e.email || "") + " · " + ago(e.t) + "</small></li>"; }).join("") + "</ul></div></div>";
    });
  }
  function settingsView() {
    api("config").then(function (o) { if (!o.ok) return fail(o); var C = o.config, D = o.defaults, ed = !!o.canEdit, dis = ed ? "" : " disabled";
      var num = function (id, v, d, min) { return '<input class="ad-in ad-num" type="number" inputmode="numeric" min="' + (min || 0) + '" step="1" data-f="' + id + '" value="' + v + '"' + dis + '>' + (v !== d ? ' <small class="muted">default ' + d + "</small>" : ""); };
      $("#ad-view").innerHTML = head("Prices & tools", "Change plan and pack prices, X-Rays included and monitored websites, checkout uses these numbers straight away (payments are still verified with the payment gateway). Switch a tool off for maintenance." + (ed ? "" : " <b>View only.</b>")) +
        '<div class="panel ad-card"><h2>Plans</h2><div class="ad-table"><table><thead><tr><th>Plan</th><th>Price (₹ / month)</th><th>X-Rays</th><th>Monitored websites</th></tr></thead><tbody>' + Object.keys(C.plans).map(function (id) { var p = C.plans[id], d = D.plans[id]; return "<tr><td>" + badge(id) + '</td><td data-l="Price">' + (id === "free" ? "₹0" : num("plans." + id + ".price", p.price, d.price, 1)) + '</td><td data-l="X-Rays">' + num("plans." + id + ".xrays", p.xrays, d.xrays, 1) + (id === "free" ? ' <small class="muted">lifetime</small>' : "") + '</td><td data-l="Monitors">' + num("plans." + id + ".monitors", p.monitors, d.monitors) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
        '<h2 style="margin-top:18px">X-Ray packs</h2><div class="ad-table"><table><thead><tr><th>Pack</th><th>Price (₹)</th><th>X-Rays</th></tr></thead><tbody>' + Object.keys(C.packs).map(function (id) { var p = C.packs[id], d = D.packs[id]; return "<tr><td><b>" + esc(id) + '</b></td><td data-l="Price">' + num("packs." + id + ".price", p.price, d.price, 1) + '</td><td data-l="X-Rays">' + num("packs." + id + ".xrays", p.xrays, d.xrays, 1) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
        (C.products ? '<h2 style="margin-top:18px">Standalone PRO tools <small class="muted">one run each</small></h2><p class="muted">The price of buying one run of a tool. Plans whose X-Rays already include a tool still get it as part of their X-Rays. Untick to hide a tool from sale.</p><div class="ad-table"><table><thead><tr><th>Tool</th><th>Price (₹ / run)</th><th>On sale</th></tr></thead><tbody>' + Object.keys(C.products).map(function (id) { var p = C.products[id], d = (D.products || {})[id] || {}; return "<tr><td><b>" + esc(p.name) + '</b><br><small class="muted">' + esc(p.cat) + '</small></td><td data-l="Price">' + num("products." + id + ".price", p.price, d.price, 1) + '</td><td data-l="On sale"><input type="checkbox" data-po="' + esc(id) + '"' + (p.on ? " checked" : "") + dis + ' aria-label="' + esc(p.name) + ' on sale"></td></tr>'; }).join("") + "</tbody></table></div>" : "") +
        (C.builder ? '<h2 style="margin-top:18px">Website Builder plans <small class="muted">per month</small></h2><p class="muted">Sold on their own on /plans/. Growth, Pro and Agency include a Builder level for free.</p><div class="ad-table"><table><thead><tr><th>Builder plan</th><th>Price (₹ / month)</th><th>Websites</th></tr></thead><tbody>' + Object.keys(C.builder).map(function (id) { var p = C.builder[id], d = (D.builder || {})[id] || {}; return "<tr><td><b>" + esc(p.name) + '</b></td><td data-l="Price">' + num("builder." + id + ".price", p.price, d.price, 1) + '</td><td data-l="Websites">' + p.sites + "</td></tr>"; }).join("") + "</tbody></table></div>" : "") +
        '<h2 style="margin-top:18px">Tools</h2><div class="ad-tools">' + Object.keys(C.tools).map(function (k) { return '<label class="ad-tog"><input type="checkbox" data-t="' + esc(k) + '"' + (C.tools[k].on ? " checked" : "") + dis + "> <span>" + esc(C.tools[k].name) + "</span></label>"; }).join("") + "</div>" +
        (ed ? '<div class="btn-row" style="margin-top:18px"><button class="btn" id="ad-cfs" type="button">Save changes</button><button class="btn ghost" id="ad-cfr" type="button">Reset to defaults</button></div>' : "") + '<p class="muted">The plans page and checkout pick up changes within a minute. Static fallback text on /plans/ (for search engines) shows the defaults until the next site build.</p></div>';
      if (!ed) return;
      $("#ad-cfs").onclick = function () { var b = { plans: {}, packs: {}, tools: {}, products: {}, builder: {} };
        document.querySelectorAll("#ad-view [data-f]").forEach(function (i) { var f = i.dataset.f.split("."); (b[f[0]][f[1]] = b[f[0]][f[1]] || {})[f[2]] = +i.value; });
        document.querySelectorAll("#ad-view [data-t]").forEach(function (i) { b.tools[i.dataset.t] = i.checked; });
        document.querySelectorAll("#ad-view [data-po]").forEach(function (i) { (b.products[i.dataset.po] = b.products[i.dataset.po] || {}).on = i.checked; });
        ask({ title: "Save prices & tools?", text: "Checkout will use the new prices right away.", ok: "Save" }).then(function (y) { if (!y) return; api("config", b).then(function (j) { if (j.ok) { toast("Saved"); settingsView(); } else toast((j.errors || [j.reason]).join(" "), true); }); }); };
      $("#ad-cfr").onclick = function () { ask({ title: "Reset every price and tool to the defaults?", ok: "Reset", danger: true }).then(function (y) { if (y) api("config", { reset: true }).then(function (j) { if (j.ok) { toast("Back to defaults"); settingsView(); } }); }); };
    });
  }
  /* ================= v17.1 Growth Lab views ================= */
  var LV = { money: ["₹", "Money"], quality: ["!", "Quality"], health: ["♥", "Health"], setup: ["⚙", "Setup"], customers: ["★", "Customers"] };
  function nba(el) { if (!el) return; api("insights").then(function (j) { if (!j.ok) return; var it = j.items || [];
    el.innerHTML = '<div class="panel ad-card ad-nba"><div class="ad-ch"><h2>Next best actions</h2><small class="muted">from your data, updated live</small></div>' + (it.length ? '<ul class="ad-nbl">' + it.map(function (x) { var l = LV[x.level] || ["•", ""]; return '<li class="' + esc(x.level) + '"><i aria-hidden="true">' + l[0] + '</i><div><b>' + esc(x.title) + "</b><span>" + esc(x.detail) + '</span></div><a class="btn sm ghost" href="#' + esc(x.link) + '">Open</a></li>'; }).join("") + "</ul>" : '<p class="muted">Nothing urgent, everything is connected and no customer needs attention right now.</p>') + "</div>"; }); }
  var pc = function (n) { return n == null ? "—" : n + "%"; }, secs = function (n) { return n == null ? "—" : n < 60 ? n + " s" : Math.floor(n / 60) + " min " + (n % 60) + " s"; };
  function labView() {
    var days = +(location.hash.split("/")[1] || 30) || 30;
    api("lab?days=" + days).then(function (o) { if (!o.ok) return fail(o); var X = o.xray, M = o.money, tmax = Math.max.apply(null, o.tools.map(function (t) { return t.views; }).concat([1])), fmax = Math.max.apply(null, o.funnel.map(function (f) { return f.n; }).concat([1]));
      $("#ad-view").innerHTML = head("Growth Lab", "Every tool on the Growth Lab, how many people see it, use it, finish it and pay, plus the full visitor → customer funnel. Views and tool use come from first-party analytics (no cookies); accounts, X-Rays and payments from the database.",
          '<div class="btn-row"><select id="ad-ld" class="ad-in" aria-label="Period">' + [7, 30, 90, 365].map(function (d) { return '<option value="' + d + '"' + (d === days ? " selected" : "") + ">Last " + d + " days</option>"; }).join("") + '</select><button class="btn sm ghost" id="ad-lcsv" type="button">Export CSV</button></div>') +
        '<div class="ad-kpis">' + K(X.done || 0, "X-Rays completed", (X.starts || 0) + " started · " + (X.refunded || 0) + " refunded · " + (X.stuck || 0) + " unfinished", "north") + K(o.tools.reduce(function (s0, t) { return s0 + t.completed; }, 0), "free tool uses", o.tools.filter(function (t) { return t.completed; }).length + " tools used") + K(o.signups, "new accounts", (X.users || 0) + " ran an X-Ray") + K(inr(M.revenue), "revenue", (M.n || 0) + " payments · " + (M.plans || 0) + " plans · " + (M.packs || 0) + " packs", "money") +
          K(o.monitoring.sites, "monitored websites", o.monitoring.users + " users · " + o.gscConnected + " Search Console") + K(pc(X.avgData), "avg data completeness", "avg score " + (X.avgScore == null ? "—" : X.avgScore) + " · avg " + secs(X.avgSec)) + "</div>" +
        '<div class="ad-grid2"><div class="panel ad-card"><h2>Visitor → customer funnel</h2><ul class="ad-funnel ad-fun2">' + o.funnel.map(function (f, i) { return "<li><span>" + esc(f.step) + "<small class=\"muted\">" + esc(f.note) + "</small></span>" + bar(f.n, fmax, "f" + Math.min(4, i)) + "<b>" + (f.n || 0) + "</b><small>" + (i && o.funnel[0].n && (f.n || 0) <= o.funnel[0].n ? Math.round(1000 * (f.n || 0) / o.funnel[0].n) / 10 + "%" : "") + "</small></li>"; }).join("") + '</ul><p class="muted ad-tip">Each step is counted from its own source for the period (not one tracked group of people), so read it as where people drop off, not exact conversion.</p></div>' +
        '<div class="panel ad-card"><h2>X-Ray quality</h2><ul class="ad-rows">' + [["Verified", X.verified], ["Needs review", X.review], ["Failed QC", X.qcFailed], ["Paid X-Rays", X.paid], ["Free X-Rays", X.free], ["Owner / gift", X.gift], ["PDF downloads", X.exportsPdf], ["Excel downloads", X.exportsXlsx], ["Share links copied", X.shares], ["Ran out of free X-Rays", X.limitHits.users + " users"]].map(function (r) { return "<li><span>" + r[0] + "</span><b>" + (r[1] == null ? 0 : r[1]) + "</b></li>"; }).join("") + '</ul><a class="btn sm ghost" href="#quality">Open quality control</a></div></div>' +
        '<div class="panel ad-card"><h2>Every Growth Lab tool</h2><div class="ad-table"><table><thead><tr><th>Tool</th><th>Views</th><th>Started</th><th>Completed</th><th>Completion</th><th>Logged-in uses</th><th>Users</th><th>Avg time on page</th></tr></thead><tbody>' + o.tools.map(function (t) { return '<tr><td><b>' + esc(t.name) + '</b><br><a class="muted" href="' + esc(t.path) + '" target="_blank" rel="noopener">' + esc(t.path) + '</a></td><td data-l="Views">' + bar(t.views, tmax) + " " + t.views + '</td><td data-l="Started">' + (t.started || "—") + '</td><td data-l="Completed">' + (t.completed || 0) + '</td><td data-l="Completion">' + pc(t.completionRate) + '</td><td data-l="Logged in">' + t.loggedInUses + '</td><td data-l="Users">' + t.users + '</td><td data-l="Time">' + secs(t.avgTimeSec) + "</td></tr>"; }).join("") + "</tbody></table></div></div>" +
        (o.products && o.products.length ? '<div class="panel ad-card"><h2>Standalone PRO tools</h2><p class="muted">Each run either reuses a recent full X-Ray of the same site (no new research, ₹0 API cost) or runs a fresh scan.</p><div class="ad-table"><table><thead><tr><th>Tool</th><th>Price</th><th>Runs</th><th>Reused X-Ray</th><th>Fresh scan</th><th>Finished</th><th>Via plan</th><th>Runs bought</th><th>Revenue</th></tr></thead><tbody>' + o.products.map(function (t) { return "<tr><td><b>" + esc(t.name) + "</b>" + (t.on ? "" : ' <span class="ad-st warn">off</span>') + '</td><td data-l="Price">' + inr(t.price) + '</td><td data-l="Runs">' + t.runs + '</td><td data-l="Reused">' + t.reused + '</td><td data-l="Fresh">' + t.fresh + '</td><td data-l="Finished">' + t.done + '</td><td data-l="Via plan">' + t.viaPlan + '</td><td data-l="Bought">' + t.bought + '</td><td data-l="Revenue"><b>' + inr(t.revenue) + "</b></td></tr>"; }).join("") + "</tbody></table></div></div>" : "") +
        '<div class="ad-grid3"><div class="panel ad-card"><h2>X-Rays by level</h2><ul class="ad-rows">' + o.tiers.map(function (t) { return "<li><span>" + badge(t.tier) + "</span><b>" + t.n + "</b><small>score " + (t.score == null ? "—" : t.score) + " · data " + pc(t.data) + "</small></li>"; }).join("") + "</ul></div>" +
        '<div class="panel ad-card"><h2>Top industries</h2>' + rowsList(o.industries) + '</div><div class="panel ad-card"><h2>Top locations</h2>' + rowsList(o.locations) + "</div></div>" +
        '<div class="panel ad-card"><h2>Action tracker</h2><p>' + o.actions.n + " actions tracked by " + o.actions.users + " users · <b>" + o.actions.done + "</b> marked done</p></div>";
      $("#ad-ld").onchange = function () { location.hash = "lab/" + this.value; };
      $("#ad-lcsv").onclick = function () { csv([["Tool", "Path", "Views", "Started", "Completed", "Completion %", "Logged-in uses", "Users", "Avg time (s)"]].concat(o.tools.map(function (t) { return [t.name, t.path, t.views, t.started, t.completed, t.completionRate, t.loggedInUses, t.users, t.avgTimeSec]; })).concat([[], ["Funnel step", "Count", "Source"]]).concat(o.funnel.map(function (f) { return [f.step, f.n, f.note]; })), "fodo-growth-lab"); };
    });
  }
  function rowsList(a) { var mx = Math.max.apply(null, a.map(function (x) { return x.n; }).concat([1])); return a.length ? '<ul class="ad-rows">' + a.map(function (x) { return "<li><span>" + esc(x.k) + "</span>" + bar(x.n, mx) + "<b>" + x.n + "</b></li>"; }).join("") + "</ul>" : '<p class="muted">No data yet.</p>'; }
  function businessesView() {
    $("#ad-view").innerHTML = head("Businesses", "Every website that has been X-Rayed, the business behind it, latest score, data completeness and who ran it. Open one for its full history.", '<button class="btn sm ghost" id="ad-bcsv" type="button">Export CSV</button>') + '<div class="ad-bar2"><input id="ad-bq" type="search" placeholder="Search website" aria-label="Search businesses"></div><div id="ad-bl"><div class="ad-load">Loading…</div></div>';
    var items = [], t, load = function () { api("businesses?q=" + encodeURIComponent($("#ad-bq").value.trim())).then(function (j) { if (!j.ok) return fail(j); items = j.items;
      $("#ad-bl").innerHTML = items.length ? '<div class="ad-table"><table><thead><tr><th>Business</th><th>Industry · location</th><th>Latest score</th><th>Data</th><th>X-Rays</th><th>Users</th><th>Last X-Ray</th></tr></thead><tbody>' + items.map(function (b) { return '<tr><td><a href="#business/' + encodeURIComponent(b.domain) + '"><b>' + esc(b.name || b.domain) + "</b></a><br><small class=\"muted\">" + esc(b.domain) + '</small></td><td data-l="Industry">' + esc([b.industry, b.location].filter(Boolean).join(" · ") || "—") + '</td><td data-l="Score">' + (b.score == null ? "—" : "<b>" + b.score + "</b>") + '</td><td data-l="Data">' + pc(b.data) + '</td><td data-l="X-Rays">' + b.runs + '</td><td data-l="Users">' + b.users + '</td><td data-l="Last">' + date(b.last, 1) + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<div class="panel ad-card"><p class="muted">No businesses yet, they appear here after the first X-Ray.</p></div>'; }); };
    $("#ad-bq").oninput = function () { clearTimeout(t); t = setTimeout(load, 250); };
    $("#ad-bcsv").onclick = function () { csv([["Business", "Domain", "Industry", "Location", "Latest score", "Data completeness %", "X-Rays", "Users", "Last X-Ray"]].concat(items.map(function (b) { return [b.name, b.domain, b.industry, b.location, b.score, b.data, b.runs, b.users, b.last]; })), "fodo-businesses"); };
    load();
  }
  function businessView(dom) {
    api("business/" + encodeURIComponent(dom)).then(function (o) { if (!o.ok) return fail(o); var S = o.summary;
      $("#ad-view").innerHTML = '<p><a href="#businesses">← All businesses</a></p>' + head(esc((S && S.name) || o.domain), esc(o.domain) + (S ? " · " + esc([S.industry, S.city].filter(Boolean).join(" · ")) : ""), '<a class="btn sm" href="/business-x-ray/?url=' + encodeURIComponent(o.domain) + '" target="_blank" rel="noopener">Run a new X-Ray ↗</a>') +
        '<div class="ad-kpis">' + K(S && S.overall != null ? S.overall : "—", "latest Growth Health", S ? "data completeness " + pc(S.completeness) : "", "north") + K(o.runs.length, "X-Rays", o.runs.filter(function (r) { return r.status === "COMPLETE"; }).length + " complete") + K(S && S.ai != null ? S.ai : "—", "FODO AI Visibility Score", "") + K(S && S.local ? S.local.rating + "★" : "—", "Google Maps rating", S && S.local ? (S.local.reviews || 0) + " reviews · local median " + (S.local.median || "—") + "★" : "") + K(o.watchers.length, "monitoring it", o.events.length + " changes logged") + K(rs(o.costInr), "API cost (all X-Rays)", (o.actions.done || 0) + " of " + (o.actions.n || 0) + " actions done") + "</div>" +
        (S ? '<div class="ad-grid2"><div class="panel ad-card"><h2>Areas (latest X-Ray)</h2><ul class="ad-rows">' + S.scores.map(function (a) { return "<li><span>" + esc(a.name) + "</span>" + bar(a.score || 0, 100) + "<b>" + (a.score == null ? "—" : a.score) + "</b></li>"; }).join("") + '</ul></div><div class="panel ad-card"><h2>Top problems</h2><ol>' + S.top.map(function (x) { return "<li><b>" + esc(x.title) + '</b> <small class="muted">' + esc(x.priority + " · " + x.category) + "</small></li>"; }).join("") + "</ol><h2>Competitors</h2>" + (S.competitors.length ? "<ul>" + S.competitors.map(function (c) { return "<li>" + esc(c.name) + ' <small class="muted">' + esc(c.domain) + " · " + c.score + "/100</small></li>"; }).join("") + "</ul>" : '<p class="muted">None confirmed.</p>') + "</div></div>" : "") +
        '<div class="panel ad-card"><h2>X-Ray history</h2><div class="ad-table"><table><thead><tr><th>When</th><th>By</th><th>Level</th><th>Score</th><th>Data</th><th>Time</th><th>QC</th></tr></thead><tbody>' + o.runs.map(function (r) { return '<tr><td><a href="#report/' + esc(r.job_id) + '">' + date(r.created_at, 1) + '</a></td><td data-l="By">' + (r.uid ? '<a href="#user/' + esc(r.uid) + '">' + esc(r.email) + "</a>" : "—") + '</td><td data-l="Level">' + badge(r.tier || "free") + '</td><td data-l="Score">' + (r.score == null ? "—" : r.score) + '</td><td data-l="Data">' + pc(r.completeness) + '</td><td data-l="Time">' + secs(r.duration_ms == null ? null : Math.round(r.duration_ms / 1000)) + '</td><td data-l="QC">' + qcBadge(r.qc) + "</td></tr>"; }).join("") + "</tbody></table></div></div>" +
        '<div class="panel ad-card"><h2>Monitoring & changes</h2>' + (o.watchers.length ? "<p>" + o.watchers.map(function (w) { return esc(w.email || "—") + " (" + esc(w.kind) + ", last check " + ago(w.last_check) + ")"; }).join(" · ") + "</p>" : '<p class="muted">Nobody monitors this website yet.</p>') + (o.events.length ? '<ul class="ad-feed">' + o.events.map(function (e) { return '<li><span class="ad-st ' + (e.severity === "high" ? "bad" : e.severity === "medium" ? "mid" : "off") + '">' + esc(e.severity) + "</span> " + esc(e.what) + ' <small class="muted">' + ago(e.t) + "</small></li>"; }).join("") + "</ul>" : "") + "</div>";
    });
  }
  var QC = { verified: ["ok", "Verified"], needs_review: ["mid", "Needs review"], failed: ["bad", "Failed"] };
  var qcBadge = function (q) { return q && QC[q] ? '<span class="ad-st ' + QC[q][0] + '">' + QC[q][1] + "</span>" : '<span class="muted">—</span>'; };
  function findingsView() {
    var parts = location.hash.split("/"), days = +(parts[1] || 90) || 90, ind = decodeURIComponent(parts[2] || "");
    api("findings?days=" + days + (ind ? "&industry=" + encodeURIComponent(ind) : "")).then(function (o) { if (!o.ok) return fail(o);
      $("#ad-view").innerHTML = head("Findings", "What goes wrong most across every X-Ray, use it for FODO's own content, offers and sales conversations. " + o.reports + " completed X-Rays in this view.",
          '<div class="btn-row"><select id="ad-fi" class="ad-in" aria-label="Industry"><option value="">All industries</option>' + o.industries.map(function (x) { return '<option value="' + esc(x.k) + '"' + (x.k === ind ? " selected" : "") + ">" + esc(x.k) + " (" + x.n + ")</option>"; }).join("") + '</select><select id="ad-fd" class="ad-in" aria-label="Period">' + [30, 90, 365].map(function (d) { return '<option value="' + d + '"' + (d === days ? " selected" : "") + ">Last " + d + " days</option>"; }).join("") + '</select><button class="btn sm ghost" id="ad-fcsv" type="button">Export CSV</button></div>') +
        '<div class="ad-grid2"><div class="panel ad-card"><h2>Most common opportunities</h2>' + (o.opportunities.length ? '<div class="ad-table"><table><thead><tr><th>Problem</th><th>In reports</th><th>Share</th><th>Avg priority</th><th>P0</th></tr></thead><tbody>' + o.opportunities.map(function (x) { return "<tr><td><b>" + esc(x.title) + '</b></td><td data-l="Reports">' + x.reports + '</td><td data-l="Share">' + bar(x.share, 100) + " " + x.share + '%</td><td data-l="Priority">' + (x.score == null ? "—" : x.score) + '</td><td data-l="P0">' + (x.p0 || 0) + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<p class="muted">No completed X-Rays in this period.</p>') + "</div>" +
        '<div class="panel ad-card"><h2>Checks that fail most</h2>' + (o.checks.length ? '<ul class="ad-rows">' + o.checks.slice(0, 25).map(function (c) { return "<li><span>" + esc(c.name || c.id) + ' <small class="muted">' + esc(c.area) + "</small></span><b>" + (c.fails || 0) + '</b><small>fail · ' + (c.warns || 0) + " warn</small></li>"; }).join("") + "</ul>" : '<p class="muted">—</p>') + "<h2 style=\"margin-top:18px\">Competitors seen most</h2>" + (o.competitors.length ? '<ul class="ad-rows">' + o.competitors.map(function (c) { return "<li><span>" + esc(c.domain) + "</span><b>" + c.reports + "</b><small>avg match " + (c.fit == null ? "—" : c.fit) + "</small></li>"; }).join("") + "</ul>" : '<p class="muted">—</p>') + "</div></div>";
      $("#ad-fi").onchange = $("#ad-fd").onchange = function () { location.hash = "findings/" + $("#ad-fd").value + ($("#ad-fi").value ? "/" + encodeURIComponent($("#ad-fi").value) : ""); };
      $("#ad-fcsv").onclick = function () { csv([["Problem", "Reports", "Share %", "Avg priority score", "P0"]].concat(o.opportunities.map(function (x) { return [x.title, x.reports, x.share, x.score, x.p0]; })).concat([[], ["Check", "Area", "Fails", "Warnings"]]).concat(o.checks.map(function (c) { return [c.name || c.id, c.area, c.fails, c.warns]; })), "fodo-findings"); };
    });
  }
  function qualityView() {
    var below = +(location.hash.split("/")[1] || 60) || 60;
    api("quality?below=" + below).then(function (j) { if (!j.ok) return fail(j);
      $("#ad-view").innerHTML = head("Quality control", "Reports with data completeness under " + below + "%, unfinished runs and anything not yet reviewed. Open a report, check its sources and API calls, then mark it Verified, Needs review or Failed.", '<select id="ad-qb" class="ad-in" aria-label="Threshold">' + [40, 60, 80, 101].map(function (v) { return '<option value="' + v + '"' + (v === below ? " selected" : "") + ">" + (v > 100 ? "All reports" : "Under " + v + "%") + "</option>"; }).join("") + "</select>") +
        (j.items.length ? '<div class="ad-table"><table><thead><tr><th>Website</th><th>By</th><th>Level</th><th>Score</th><th>Data</th><th>Status</th><th>QC</th><th>When</th></tr></thead><tbody>' + j.items.map(function (r) { return '<tr><td><a href="#report/' + esc(r.job_id) + '"><b>' + esc(r.domain) + '</b></a></td><td data-l="By">' + esc(r.email || "—") + '</td><td data-l="Level">' + badge(r.tier || "free") + '</td><td data-l="Score">' + (r.score == null ? "—" : r.score) + '</td><td data-l="Data">' + pc(r.completeness) + '</td><td data-l="Status">' + esc(r.status) + '</td><td data-l="QC">' + qcBadge(r.qc) + '</td><td data-l="When">' + date(r.created_at, 1) + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<div class="panel ad-card"><p class="muted">Nothing to review.</p></div>');
      $("#ad-qb").onchange = function () { location.hash = "quality/" + this.value; };
    });
  }
  function reportView(job) {
    api("report/" + encodeURIComponent(job)).then(function (o) { if (!o.ok) return fail(o); var r = o.run || {}, R = o.report, C = R && R.completeness;
      var mods = R ? Object.keys(R.modules).filter(function (k) { return R.modules[k].status !== "ok"; }) : [];
      $("#ad-view").innerHTML = '<p><a href="#xrays">← All X-Rays</a>' + (r.domain ? ' · <a href="#business/' + encodeURIComponent(r.domain) + '">' + esc(r.domain) + "</a>" : "") + "</p>" + head("X-Ray report " + esc(job.slice(0, 8)), esc(r.domain || (o.input && o.input.url) || "") + " · " + date(r.created_at, 1) + " · " + (r.uid ? '<a href="#user/' + esc(r.uid) + '">' + esc(r.email) + "</a>" : "no account"), (r.status === "COMPLETE" ? '<a class="btn sm" href="/business-x-ray/?r=' + encodeURIComponent(job) + '" target="_blank" rel="noopener">Open report ↗</a>' : "")) +
        '<div class="ad-kpis">' + K(R && R.overall != null ? R.overall : "—", "Growth Health", R ? esc(R.status) : esc(r.status || "")) + K(C ? C.overall + "%" : "—", "data completeness", C && C.partial ? "partial analysis" : "") + K(o.calls.length, "API calls", o.calls.filter(function (c) { return c.cached; }).length + " cached · " + o.calls.filter(function (c) { return !c.ok; }).length + " failed") + K(rs(o.costInr), "cost of this report", "") + K(R ? secs(Math.round((R.durationMs || 0) / 1000)) : "—", "generation time", R ? esc(R.version || "") : "") + K(qcBadge(r.qc), "quality check", r.qc_by ? esc(r.qc_by) + " · " + ago(r.qc_at) : "") + "</div>" +
        '<div class="panel ad-card"><h2>Quality check</h2><div class="btn-row ad-qc">' + ["verified", "needs_review", "failed"].map(function (k) { return '<button type="button" class="btn sm ' + (r.qc === k ? "" : "ghost") + '" data-qc="' + k + '">' + QC[k][1] + "</button>"; }).join("") + '<button type="button" class="btn sm ghost" data-qc="">Clear</button></div>' + (r.qc_note ? '<p class="muted">Note: ' + esc(r.qc_note) + "</p>" : "") + "</div>" +
        (R ? '<div class="ad-grid2"><div class="panel ad-card"><h2>Scores & data</h2><ul class="ad-rows">' + R.areas.map(function (a) { return "<li><span>" + esc(a.name) + ' <small class="muted">' + esc(a.quality) + "</small></span>" + bar(a.score || 0, 100) + "<b>" + (a.score == null ? "—" : a.score) + "</b></li>"; }).join("") + "</ul>" + (C ? '<h2 style="margin-top:16px">Data completeness</h2><ul class="ad-rows">' + C.parts.map(function (p) { return "<li><span>" + esc(p.name) + '<small class="muted"> ' + esc(p.note) + "</small></span>" + bar(p.pct, 100) + "<b>" + p.pct + "%</b></li>"; }).join("") + "</ul>" : "") + "</div>" +
          '<div class="panel ad-card"><h2>What the report contains</h2><ul class="ad-rows">' + [["Pages read", R.crawl ? R.crawl.pages : "—"], ["Checks failed / warn / pass", R.checks.fail + " / " + R.checks.warn + " / " + R.checks.pass], ["Opportunities", R.opportunities.length], ["Evidence items", R.evidence], ["Sources", R.sources], ["Competitors", R.competitors.length], ["AI answers", R.ai ? R.ai.tested + " (" + R.ai.engines.join(", ") + ")" : "—"], ["AI statements removed (no evidence)", R.synthesisDropped], ["Written by", R.synthesisBy]].map(function (x) { return "<li><span>" + x[0] + "</span><b>" + esc(String(x[1])) + "</b></li>"; }).join("") + "</ul>" +
          (mods.length ? "<h2 style=\"margin-top:16px\">Unavailable / errors</h2><ul>" + mods.map(function (k) { return "<li><b>" + esc(k) + ":</b> " + esc(R.modules[k].note) + "</li>"; }).join("") + "</ul>" : '<p class="muted">Every module ran.</p>') + "</div></div>" : '<div class="panel ad-card"><p class="muted">The report was not saved (the X-Ray did not finish).</p></div>') +
        '<div class="panel ad-card"><h2>API calls (' + o.calls.length + ")</h2>" + (o.calls.length ? '<div class="ad-table"><table><thead><tr><th>Time</th><th>Provider</th><th>Endpoint</th><th>Prompt / tool</th><th>Status</th><th>ms</th><th>Cost</th></tr></thead><tbody>' + o.calls.map(function (c) { return "<tr><td>" + esc(new Date(c.t).toLocaleTimeString("en-IN")) + '</td><td data-l="Provider">' + esc(c.provider) + '</td><td data-l="Endpoint">' + esc(c.endpoint) + '</td><td data-l="Tool">' + esc(c.tool || "") + '</td><td data-l="Status">' + (c.cached ? '<span class="ad-st ok">cache</span>' : c.ok ? c.status : '<span class="ad-st bad">' + c.status + "</span>") + '</td><td data-l="ms">' + (c.ms || 0) + '</td><td data-l="Cost">' + (c.cost_usd ? "₹" + c.costInr + ' <small class="muted">' + esc(c.cost_kind) + "</small>" : "₹0") + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<p class="muted">No outside calls logged.</p>') + "</div>" +
        (o.payments.length ? '<div class="panel ad-card"><h2>This user\'s payments</h2><ul>' + o.payments.map(function (p) { return "<li>" + inr(p.amount) + " · " + esc(p.kind + " " + p.item) + " · " + date(p.paid_at) + "</li>"; }).join("") + "</ul></div>" : "") +
        '<details class="panel ad-card"><summary>Input</summary><pre class="ad-pre">' + esc(JSON.stringify(o.input, null, 2)) + "</pre></details>";
      $("#ad-view").querySelectorAll("[data-qc]").forEach(function (b) { b.onclick = function () { if (!owner()) return toast("View-only access.", true); ask({ title: "Mark as " + (QC[b.dataset.qc] ? QC[b.dataset.qc][1] : "not reviewed") + "?", input: "Note (optional)", ok: "Save" }).then(function (note) { if (note === null) return; api("report/" + encodeURIComponent(job) + "/qc", { status: b.dataset.qc, note: note }).then(function (j) { if (j.ok) { toast("Saved"); reportView(job); } else toast(j.reason, true); }); }); }; });
    });
  }
  /* ---------- v20 Help desk: tickets, the support mailbox, AI chats ---------- */
  var TST = { open: "Open", pending: "Waiting for customer", solved: "Solved", closed: "Closed" }, TSC = { open: "warn", pending: "na", solved: "ok", closed: "ok" };
  var tst = function (s) { return '<span class="ad-st ' + (TSC[s] || "na") + '">' + esc(TST[s] || s) + "</span>"; };
  var chan = function (c) { return { web: "Help form", email: "Email", chat: "AI chat → person", admin: "Started by FODO" }[c] || c; };
  var canHelp = function () { return ME && ME.role !== "viewer"; };
  function helpdeskView() {
    var st = (location.hash.split("/")[1] || ""), qv = decodeURIComponent(location.hash.split("/")[2] || "");
    api("help?status=" + encodeURIComponent(st) + "&q=" + encodeURIComponent(qv)).then(function (o) { if (!o.ok) return fail(o); var c = o.counts || {}, k = o.kpi || {};
      $("#ad-view").innerHTML = head("Help desk", "Every ticket from the help page, email and the AI assistant, reply here and the customer gets an email (Reply-To " + esc(o.support) + ") and sees it on the help page." + (o.email ? "" : " <b>Email is not connected (RESEND_API_KEY), replies are saved but not emailed.</b>") + (o.inbound ? "" : " Customers' email replies come in once RESEND_WEBHOOK_SECRET is set."), canHelp() ? '<button class="btn sm" id="ad-hnew" type="button">New email</button>' : "") +
        '<div class="ad-kpis">' + K(c.open || 0, "open", (k.waiting24 || 0) + " waiting over 24 h", "north") + K(c.pending || 0, "waiting for customer") + K(k.solved7 || 0, "solved (7 days)") + K(k.firstReplyHours == null ? "—" : k.firstReplyHours + " h", "avg first reply (30 days)") + K(k.chats7 || 0, "AI chats (7 days)", (k.escalated7 || 0) + " sent to a person · 👍 " + (k.up7 || 0) + " 👎 " + (k.down7 || 0)) + "</div>" +
        '<div class="ad-bar2"><select id="ad-hst" class="ad-in" aria-label="Status"><option value="">All statuses</option>' + o.statuses.map(function (x) { return '<option value="' + x + '"' + (x === st ? " selected" : "") + ">" + esc(TST[x]) + " (" + (c[x] || 0) + ")</option>"; }).join("") + '</select><input id="ad-hq" type="search" class="ad-in" placeholder="Ticket, email or subject" value="' + esc(qv) + '" aria-label="Search tickets"></div>' +
        (o.items.length ? '<div class="ad-table"><table><thead><tr><th>Ticket</th><th>Customer</th><th>Topic</th><th>Status</th><th>Priority</th><th>Came from</th><th>Updated</th></tr></thead><tbody>' + o.items.map(function (t) {
          return '<tr><td><a href="#ticket/' + esc(t.id) + '"><b>' + esc(t.id) + "</b> " + esc(t.subject) + "</a>" + (t.last_from === "customer" && t.status === "open" ? ' <span class="ad-st warn">needs reply</span>' : "") + '</td><td data-l="Customer">' + esc(t.email) + (t.plan && t.plan_until && Date.parse(t.plan_until) > Date.now() ? " " + badge(t.plan) : "") + '</td><td data-l="Topic">' + esc(t.category) + '</td><td data-l="Status">' + tst(t.status) + '</td><td data-l="Priority">' + (t.priority === "high" ? '<span class="ad-st bad">high</span>' : esc(t.priority)) + '</td><td data-l="From">' + esc(chan(t.channel)) + '</td><td data-l="Updated">' + date(t.updated_at, 1) + "</td></tr>"; }).join("") + "</tbody></table></div>"
          : '<div class="panel ad-card"><p class="muted">No tickets' + (st ? " with this status" : " yet") + ". They appear here from the <a href=\"/help/\">help page</a>, email and the AI assistant.</p></div>") +
        (o.cats.length ? '<div class="panel ad-card"><h2>Topics (30 days)</h2>' + rowsList(o.cats.map(function (x) { return { k: x.category, n: x.n }; })) + "</div>" : "");
      $("#ad-hst").onchange = function () { location.hash = "helpdesk/" + this.value + "/" + encodeURIComponent($("#ad-hq").value); };
      $("#ad-hq").onkeydown = function (e) { if (e.key === "Enter") location.hash = "helpdesk/" + $("#ad-hst").value + "/" + encodeURIComponent(this.value); };
      if ($("#ad-hnew")) $("#ad-hnew").onclick = compose;
    });
  }
  function compose(pre) {
    pre = pre || {};
    var d = document.createElement("div"); d.className = "cfx ad-dlg"; d.innerHTML = '<div class="cfx-back" data-x></div><div class="cfx-box" role="dialog" aria-modal="true" aria-label="New email"><h3>New email</h3><p class="muted">Sent from FODO with Reply-To the support mailbox, it becomes a ticket, so the answer comes back here.</p>' +
      '<label>To <input class="ad-in" id="ad-mto" type="email" value="' + esc(pre.to || "") + '"></label><label>Subject <input class="ad-in" id="ad-msu" maxlength="160"></label><label>Message <textarea class="ad-in ad-ta" id="ad-mtx" rows="8"></textarea></label><div class="btn-row"><button class="btn" id="ad-msend" type="button">Send</button><button class="btn ghost" data-x type="button">Cancel</button></div><p class="cf-status" id="ad-mst"></p></div>';
    document.body.appendChild(d); d.addEventListener("click", function (e) { if (e.target.closest("[data-x]")) d.remove(); });
    $("#ad-msend").onclick = function () { $("#ad-mst").textContent = "Sending…"; api("mail/send", { to: $("#ad-mto").value, subject: $("#ad-msu").value, text: $("#ad-mtx").value }).then(function (j) { if (!j.ok) { $("#ad-mst").textContent = j.reason; return; } d.remove(); toast(j.mailed ? "Sent · ticket " + j.ticket : j.reason, !j.mailed); location.hash = "ticket/" + j.ticket; }); };
  }
  function ticketView(id) {
    api("help/" + encodeURIComponent(id)).then(function (o) { if (!o.ok) return fail(o); var t = o.ticket, c = o.customer, ed = canHelp();
      var msg = function (m) { return '<li class="ad-tm ' + m.dir + '"><div><b>' + (m.dir === "out" ? "FODO · " + esc(m.author) : m.dir === "note" ? "Internal note · " + esc(m.author) : esc(t.name || m.author || "Customer")) + '</b> <small class="muted">' + date(m.created_at, 1) + " · " + esc({ web: "help page", email: "email", chat: "AI chat", admin: "admin" }[m.source] || m.source) + "</small></div><p>" + esc(m.text).replace(/\n/g, "<br>") + "</p></li>"; };
      $("#ad-view").innerHTML = head("Ticket " + esc(t.id), esc(t.subject) + " · " + esc(chan(t.channel)) + " · opened " + date(t.created_at, 1), '<a class="btn sm ghost" href="#helpdesk">← All tickets</a>') +
        '<div class="ad-grid2 ad-tgrid"><div><div class="panel ad-card"><div class="ad-row">' + tst(t.status) + " <span class=\"muted\">Priority " + esc(t.priority) + " · " + esc(t.category) + (t.assignee ? " · assigned to " + esc(t.assignee) : "") + "</span></div>" +
        '<ol class="ad-thread">' + o.messages.map(msg).join("") + "</ol>" +
        (ed ? '<div class="ad-reply"><label for="ad-rtx"><b>Reply to ' + esc(t.email) + '</b></label><textarea id="ad-rtx" class="ad-in ad-ta" rows="6" placeholder="Write the reply, it is emailed and shown on the customer\'s help page"></textarea><div class="btn-row"><button class="btn" id="ad-rsend" type="button">Send reply</button><select id="ad-rst" class="ad-in" aria-label="Status after reply"><option value="pending">then: waiting for customer</option><option value="solved">then: solved</option><option value="open">then: keep open</option></select><button class="btn ghost" id="ad-rnote" type="button">Add internal note</button></div></div>' : '<p class="muted">View only.</p>') + "</div>" +
        (o.chat.length ? '<div class="panel ad-card"><h2>The AI chat before this ticket</h2><ol class="ad-thread">' + o.chat.map(function (m) { return '<li class="ad-tm ' + (m.role === "user" ? "in" : "ai") + '"><div><b>' + (m.role === "user" ? "Customer" : "Assistant") + '</b> <small class="muted">' + date(m.t, 1) + (m.model ? " · " + esc(m.model.split("/").pop()) : "") + "</small></div><p>" + esc(m.text).replace(/\n/g, "<br>") + "</p></li>"; }).join("") + "</ol></div>" : "") +
        (o.mails.length ? '<div class="panel ad-card"><h2>Emails on this ticket</h2><ul class="ad-rows">' + o.mails.map(function (m) { return "<li><span>" + (m.dir === "in" ? "⬇ from " + esc(m.from_addr) : "⬆ to " + esc(m.to_addr)) + " <small class=\"muted\">" + esc(m.subject) + "</small></span><b>" + esc(m.status) + "</b><small>" + date(m.t, 1) + (m.error ? " · " + esc(m.error) : "") + "</small></li>"; }).join("") + "</ul></div>" : "") + "</div>" +
        '<div><div class="panel ad-card"><h2>Customer</h2>' + (c ? '<p><a href="#user/' + esc(c.id) + '"><b>' + esc(c.name || c.email) + "</b></a>" + (c.name || c.phone ? "<br><small class=\"muted\">" + (c.name ? esc(c.email) : "") + (c.phone ? (c.name ? " · " : "") + esc(c.phone) : "") + "</small>" : "") + "</p>" +
          '<ul class="ad-rows"><li><span>Plan</span><b>' + esc(c.plan) + "</b><small>" + (c.planUntil && c.plan !== "Free" ? "until " + date(c.planUntil) : "") + "</small></li><li><span>X-Rays left</span><b>" + (c.monthly || 0) + " + " + (c.packs || 0) + " pack + " + (c.free || 0) + " free</b><small></small></li>" + (c.tools.length ? "<li><span>Bought tool runs</span><b>" + c.tools.map(function (x) { return esc(x.tool) + " ×" + x.credits; }).join(", ") + "</b><small></small></li>" : "") + (c.blocked ? '<li><span>Account</span><b class="bad">blocked</b><small></small></li>' : "") + "</ul>" +
          "<h3>Payments</h3>" + (c.orders.length ? '<ul class="ad-rows">' + c.orders.map(function (x) { return "<li><span>" + esc(x.kind + " · " + x.item) + "</span><b>" + inr(x.amount) + "</b><small>" + (x.status === "PAID" ? '<span class="ad-st ok">paid</span>' : '<span class="ad-st warn">' + esc(String(x.status).toLowerCase()) + "</span>") + " " + date(x.paid_at || x.created_at, 1) + "</small></li>"; }).join("") + "</ul>" : '<p class="muted">No payments.</p>') +
          "<h3>Recent X-Rays</h3>" + (c.runs.length ? '<ul class="ad-rows">' + c.runs.map(function (x) { return '<li><span><a href="#report/' + esc(x.job_id) + '">' + esc(x.domain) + "</a></span><b>" + esc(x.status) + "</b><small>" + date(x.created_at) + "</small></li>"; }).join("") + "</ul>" : '<p class="muted">None.</p>')
          : '<p class="muted">' + esc(t.email) + ", no FODO account with this email.</p>") + "</div>" +
        (ed ? '<div class="panel ad-card"><h2>Ticket</h2><label>Status <select id="ad-tst" class="ad-in">' + o.statuses.map(function (x) { return '<option value="' + x + '"' + (x === t.status ? " selected" : "") + ">" + esc(TST[x]) + "</option>"; }).join("") + '</select></label><label>Priority <select id="ad-tpr" class="ad-in">' + ["high", "normal", "low"].map(function (x) { return "<option" + (x === t.priority ? " selected" : "") + ">" + x + "</option>"; }).join("") + '</select></label><label>Topic <select id="ad-tca" class="ad-in">' + o.categories.map(function (x) { return "<option" + (x === t.category ? " selected" : "") + ">" + esc(x) + "</option>"; }).join("") + '</select></label><label>Assigned to <input id="ad-tas" class="ad-in" type="email" value="' + esc(t.assignee || "") + '" placeholder="team member email"></label></div>' : "") +
        (o.others.length ? '<div class="panel ad-card"><h2>Other tickets from this customer</h2><ul class="ad-rows">' + o.others.map(function (x) { return '<li><span><a href="#ticket/' + esc(x.id) + '">' + esc(x.id) + "</a> " + esc(x.subject) + "</span>" + tst(x.status) + "<small>" + date(x.updated_at) + "</small></li>"; }).join("") + "</ul></div>" : "") + "</div></div>";
      if (!ed) return;
      var act = function (b, okMsg) { return api("help/" + encodeURIComponent(t.id), b).then(function (j) { if (!j.ok) return toast(j.reason, true); if (j.reason) toast(j.reason, true); else if (okMsg) toast(okMsg); ticketView(t.id); }); };
      $("#ad-rsend").onclick = function () { var v = $("#ad-rtx").value.trim(); if (!v) return; act({ action: "reply", text: v, status: $("#ad-rst").value }, "Reply sent"); };
      $("#ad-rnote").onclick = function () { var v = $("#ad-rtx").value.trim(); if (!v) return; act({ action: "note", text: v }, "Note added (the customer doesn't see it)"); };
      $("#ad-tst").onchange = function () { act({ action: "status", status: this.value }, "Status changed"); };
      $("#ad-tpr").onchange = function () { act({ action: "priority", priority: this.value }); };
      $("#ad-tca").onchange = function () { act({ action: "category", category: this.value }); };
      $("#ad-tas").onchange = function () { act({ action: "assign", email: this.value }); };
    });
  }
  function mailView() {
    var dir = location.hash.split("/")[1] || "";
    api("mail?dir=" + dir).then(function (o) { if (!o.ok) return fail(o); var T = {}; (o.totals || []).forEach(function (x) { T[x.dir + ":" + x.status] = x.n; });
      $("#ad-view").innerHTML = head("Mail", "Every email FODO sends (login codes are never stored) and every email customers send to " + esc(o.support) + ".", canHelp() ? '<button class="btn sm" id="ad-mnew" type="button">New email</button>' : "") +
        '<div class="ad-kpis">' + K(T["in:received"] || 0, "received (30 days)") + K(T["out:sent"] || 0, "sent (30 days)") + K((T["out:failed"] || 0) + (T["out:not sent"] || 0), "not delivered", o.email ? "" : "RESEND_API_KEY missing") + K(o.inbound ? "on" : "off", "incoming email", o.inbound ? "Resend webhook verified" : "set RESEND_WEBHOOK_SECRET") + "</div>" +
        '<div class="ad-bar2"><div class="ad-tabs2">' + [["", "All"], ["in", "Inbox"], ["out", "Sent"]].map(function (x) { return '<a class="btn sm ' + (x[0] === dir ? "" : "ghost") + '" href="#mail/' + x[0] + '">' + x[1] + "</a>"; }).join("") + "</div></div>" +
        (o.items.length ? '<div class="ad-table"><table><thead><tr><th></th><th>From / to</th><th>Subject</th><th>Type</th><th>Status</th><th>When</th></tr></thead><tbody>' + o.items.map(function (m) {
          return "<tr><td>" + (m.dir === "in" ? "⬇" : "⬆") + '</td><td data-l="Who">' + esc(m.dir === "in" ? m.from_addr : m.to_addr) + '</td><td data-l="Subject"><a href="#" data-mail="' + m.id + '"><b>' + esc(m.subject) + "</b></a><br><small class=\"muted\">" + esc((m.preview || "").slice(0, 140)) + "</small>" + (m.ticket_id ? ' <a class="ad-st na" href="#ticket/' + esc(m.ticket_id) + '">' + esc(m.ticket_id) + "</a>" : "") + '</td><td data-l="Type">' + esc(m.kind) + '</td><td data-l="Status"><span class="ad-st ' + (m.status === "sent" || m.status === "received" ? "ok" : "bad") + '">' + esc(m.status) + "</span>" + (m.error ? '<br><small class="muted">' + esc(m.error) + "</small>" : "") + '</td><td data-l="When">' + date(m.t, 1) + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<div class="panel ad-card"><p class="muted">No emails yet.</p></div>');
      if ($("#ad-mnew")) $("#ad-mnew").onclick = function () { compose(); };
      $("#ad-view").onclick = function (e) { var a = e.target.closest("[data-mail]"); if (!a) return; e.preventDefault(); api("mailone/" + a.dataset.mail).then(function (j) { if (!j.ok) return; var m = j.mail;
        ask({ title: m.subject || "(no subject)", text: (m.dir === "in" ? "From " + m.from_addr : "To " + m.to_addr) + " · " + new Date(m.t).toLocaleString("en-IN") + "\n\n" + (m.text || ""), ok: m.ticket_id ? "Open ticket" : "Close" }).then(function (y) { if (y && m.ticket_id) location.hash = "ticket/" + m.ticket_id; }); }); };
    });
  }
  function chatsView() {
    api("chats").then(function (o) { if (!o.ok) return fail(o);
      $("#ad-view").innerHTML = head("AI chats", "Every conversation with the FODO help assistant on /help/. It answers only from the help articles, live prices and the asker's own account; refunds and payment problems are sent to a person.") +
        '<div class="ad-kpis">' + K(o.items.length, "chats (latest 200)") + K(o.items.filter(function (c) { return c.ticket_id; }).length, "became tickets") + K(o.items.filter(function (c) { return c.rating === 1; }).length + " / " + o.items.filter(function (c) { return c.rating === -1; }).length, "👍 / 👎") + K((o.models || []).map(function (m) { return (m.model || "").split("/").pop() + " " + m.n; }).join(" · ") || "—", "answered by (30 days)") + "</div>" +
        (o.items.length ? '<div class="ad-table"><table><thead><tr><th>First question</th><th>Who</th><th>Messages</th><th>Ticket</th><th>Rating</th><th>Last</th></tr></thead><tbody>' + o.items.map(function (c) { return '<tr><td><a href="#chat/' + esc(c.id) + '">' + esc((c.first || "").slice(0, 90)) + '</a></td><td data-l="Who">' + esc(c.email || "visitor") + '</td><td data-l="Msgs">' + c.msgs + '</td><td data-l="Ticket">' + (c.ticket_id ? '<a href="#ticket/' + esc(c.ticket_id) + '">' + esc(c.ticket_id) + "</a>" : "—") + '</td><td data-l="Rating">' + (c.rating === 1 ? "👍" : c.rating === -1 ? "👎" : "—") + '</td><td data-l="Last">' + date(c.updated_at, 1) + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<div class="panel ad-card"><p class="muted">No chats yet.</p></div>');
    });
  }
  function chatView(id) {
    api("chat/" + encodeURIComponent(id)).then(function (o) { if (!o.ok) return fail(o); var c = o.chat;
      $("#ad-view").innerHTML = head("AI chat", esc(c.email || "Visitor (not logged in)") + " · " + date(c.started_at, 1) + (c.ticket_id ? ' · became <a href="#ticket/' + esc(c.ticket_id) + '">' + esc(c.ticket_id) + "</a>" : ""), '<a class="btn sm ghost" href="#chats">← All chats</a>') +
        '<div class="panel ad-card"><ol class="ad-thread">' + o.messages.map(function (m) { return '<li class="ad-tm ' + (m.role === "user" ? "in" : "ai") + '"><div><b>' + (m.role === "user" ? "Customer" : "Assistant") + '</b> <small class="muted">' + date(m.t, 1) + (m.model ? " · " + esc(m.model.split("/").pop()) : "") + "</small></div><p>" + esc(m.text).replace(/\n/g, "<br>") + "</p></li>"; }).join("") + "</ol></div>";
    });
  }
  function promptsView() {
    api("prompts").then(function (o) { if (!o.ok) return fail(o); var ed = !!o.canEditPrompts;
      $("#ad-view").innerHTML = head("AI prompts", "Every instruction FODO gives an AI, with its version, how often it ran, errors and statements removed for having no evidence (last 30 days). " + esc(o.note) + (ed ? "" : " <b>Only the two owner logins can edit prompts.</b>")) +
        o.prompts.map(function (p) { var st = p.versions.filter(function (v) { return v.ver === p.ver; })[0] || {};
          return '<div class="panel ad-card ad-prompt"><div class="ad-ch"><h2>' + esc(p.name) + ' <small class="muted">' + esc(p.key) + '</small></h2><span class="ad-st ' + (p.custom ? "mid" : "ok") + '">' + (p.custom ? "custom " : "default ") + esc(p.ver) + "</span></div>" +
            '<ul class="ad-rows">' + [["Model", p.model], ["Runs (this version)", st.calls || 0], ["Errors (unreadable answers)", (st.failed || 0) + (st.calls ? " (" + Math.round(100 * (st.failed || 0) / st.calls) + "%)" : "")], ["Avg statements removed", st.dropped == null ? "—" : st.dropped], ["Avg time", st.ms ? st.ms + " ms" : "—"], ["Last used", st.last ? ago(st.last) : "—"]].map(function (x) { return "<li><span>" + x[0] + "</span><b>" + esc(String(x[1])) + "</b></li>"; }).join("") + "</ul>" +
            (p.versions.length > 1 ? '<details><summary>All versions seen (' + p.versions.length + ")</summary><ul>" + p.versions.map(function (v) { return "<li>" + esc(v.ver) + ": " + v.calls + " runs · " + (v.failed || 0) + " errors · avg removed " + (v.dropped == null ? "—" : v.dropped) + "</li>"; }).join("") + "</ul></details>" : "") +
            '<details' + (ed ? "" : "") + '><summary>' + (ed ? "View / edit text" : "View text") + '</summary><textarea class="ad-in ad-ta" data-pk="' + esc(p.key) + '"' + (ed ? "" : " readonly") + ">" + esc(p.text) + "</textarea>" + (ed ? '<div class="btn-row"><button type="button" class="btn sm" data-psave="' + esc(p.key) + '">Save as new version</button>' + (p.custom ? '<button type="button" class="btn sm ghost" data-preset="' + esc(p.key) + '">Back to default</button>' : "") + "</div>" : "") +
            (p.history.length ? '<p class="muted">History:</p><ul class="ad-ph">' + p.history.map(function (h) { return "<li>" + esc(h.ver) + " · " + esc(h.created_by || "") + " · " + date(h.created_at, 1) + (h.note ? " · " + esc(h.note) : "") + (h.active ? ' <span class="ad-st ok">active</span>' : ed ? ' <button type="button" class="xr-why" data-pact="' + esc(p.key) + '" data-id="' + h.id + '">Use this</button>' : "") + "</li>"; }).join("") + "</ul>" : "") + "</details></div>"; }).join("");
      if (!ed) return;
      var V = $("#ad-view");
      V.querySelectorAll("[data-psave]").forEach(function (b) { b.onclick = function () { var k = b.dataset.psave, t = V.querySelector('textarea[data-pk="' + k + '"]').value; ask({ title: "Save a new version of “" + k + "”?", text: "It is used for every new X-Ray straight away. You can go back to any earlier version.", input: "What changed (optional)", ok: "Save" }).then(function (note) { if (note === null) return; api("prompts", { key: k, text: t, note: note }).then(function (j) { if (j.ok) { toast("Saved " + j.ver); promptsView(); } else toast(j.reason, true); }); }); }; });
      V.querySelectorAll("[data-preset]").forEach(function (b) { b.onclick = function () { ask({ title: "Go back to the default prompt?", ok: "Reset" }).then(function (y) { if (y) api("prompts", { key: b.dataset.preset, reset: true }).then(function () { toast("Back to default"); promptsView(); }); }); }; });
      V.querySelectorAll("[data-pact]").forEach(function (b) { b.onclick = function () { api("prompts", { key: b.dataset.pact, activate: +b.dataset.id }).then(function (j) { if (j.ok) { toast("Restored"); promptsView(); } else toast(j.reason, true); }); }; });
    });
  }
  var head = function (t, sub, right) { return '<div class="ad-h"><div><h1>' + t + "</h1>" + (sub ? '<p class="muted">' + sub + "</p>" : "") + "</div>" + (right || "") + "</div>"; };

  /* ---------- charts (inline SVG, no libraries) ---------- */
  function lineChart(days, sets) {   // daily columns read better than a line when most days are 0
    var W = 640, H = 200, P = 28, s = sets[0], max = Math.max.apply(null, s.v.concat([1])), bw = (W - P - 8) / days.length;
    var y = function (v) { return H - 22 - v * (H - 40) / max; };
    var grid = [0, 0.5, 1].map(function (f) { var v = Math.round(max * f); return '<line x1="' + P + '" x2="' + W + '" y1="' + y(v) + '" y2="' + y(v) + '" class="g"/><text x="2" y="' + (y(v) + 4) + '">' + (s.n === "₹" && v >= 1000 ? Math.round(v / 1000) + "k" : v) + "</text>"; }).join("");
    var lab = [0, 10, 20, 29].map(function (i) { return '<text x="' + (P + i * bw + bw / 2) + '" y="' + (H - 4) + '" text-anchor="middle">' + days[i].slice(5).split("-").reverse().join("/") + "</text>"; }).join("");
    var cols = s.v.map(function (v, i) { var h = Math.max(v ? 2 : 0, (H - 22) - y(v)); return '<rect class="col ' + s.c + '" x="' + (P + i * bw + 1.5).toFixed(1) + '" y="' + (H - 22 - h).toFixed(1) + '" width="' + Math.max(2, bw - 3).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2"><title>' + days[i] + ": " + (s.n === "₹" ? "₹" + v : v + " " + s.n) + "</title></rect>"; }).join("");
    return '<svg class="ad-chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Last 30 days, ' + esc(s.n) + '">' + grid + lab + cols + "</svg>";
  }
  var bar = function (v, max, cls) { return '<i class="ad-bar ' + (cls || "") + '" style="--v:' + Math.round(100 * v / Math.max(1, max)) + '"></i>'; };

  /* ---------- overview ---------- */
  function overview() {
    api("overview").then(function (o) {
      if (!o.ok) return fail(o); OV = o;
      var U = o.users, R = o.runs, M = o.money, F = o.funnel, s = o.series, sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
      var kpi = function (n, l, sub, c) { return '<div class="ad-kpi ' + (c || "") + '"><b>' + n + "</b><span>" + l + "</span>" + (sub ? "<small>" + sub + "</small>" : "") + "</div>"; };
      var funnel = [["Signed up", F.signed], ["Ran 1st X-Ray", F.ran1], ["Ran 2+ X-Rays", F.ran2], ["Ran out of free X-Rays", F.limited], ["Paid", F.paid]];
      var fmax = funnel[0][1] || 1, fmx = Math.max.apply(null, o.features.map(function (f) { return f.n; }).concat([1]));
      var plans = ["free", "starter", "growth", "pro", "agency"].map(function (p) { var r = o.plans.filter(function (x) { return x.p === p; })[0]; return [p, r ? r.n : 0]; }), pmax = Math.max.apply(null, plans.map(function (p) { return p[1]; }).concat([1]));
      var chartSel = (sessionStorage.getItem("ad-chart") || "xrays");
      var SETS = { xrays: [{ n: "X-Rays", v: s.xrays, c: "c1" }], signups: [{ n: "sign-ups", v: s.signups, c: "c2" }], logins: [{ n: "people logged in", v: s.logins, c: "c3" }], revenue: [{ n: "₹", v: s.revenue, c: "c4" }] };
      $("#ad-view").innerHTML = head("Overview", "Live from the Growth Lab database · " + new Date().toLocaleString("en-IN"), '<span class="ad-row"><button class="btn sm ghost" id="ad-ref" type="button">Refresh</button><button class="btn sm" id="ad-xall2" type="button">Export all (Excel)</button></span>') +
        '<div class="ad-kpis">' + kpi(U.total || 0, "users", "+" + (U.new7 || 0) + " this week · +" + (U.new30 || 0) + " in 30 days") + kpi(o.active1, "active today", o.active7 + " active this week") + kpi(R.total || 0, "X-Rays run", (R.last7 || 0) + " this week · avg score " + (R.avgScore == null ? "—" : R.avgScore)) +
          kpi(U.paid || 0, "paying users", (U.gifted || 0) + " given free · " + (U.blocked || 0) + " blocked", "ok") + kpi(inr(M.revenue), "revenue (all time)", inr(M.month) + " this month · " + (M.paidOrders || 0) + " payments", "money") + kpi(F.signed ? Math.round(100 * F.paid / F.signed) + "%" : "—", "sign-up → paid", (F.limited || 0) + " ran out of free X-Rays") + "</div>" +
        '<div id="ad-nba"></div><div class="ad-grid2"><div class="panel ad-card"><div class="ad-ch"><h2>Last 30 days</h2><div class="ad-chips" role="group" aria-label="Chart">' + [["xrays", "X-Rays", sum(s.xrays)], ["signups", "Sign-ups", sum(s.signups)], ["logins", "Logins", sum(s.logins)], ["revenue", "Revenue", inr(sum(s.revenue))]].map(function (c) { return '<button type="button" class="chip" aria-pressed="' + (c[0] === chartSel) + '" data-chart="' + c[0] + '">' + c[1] + " <b>" + c[2] + "</b></button>"; }).join("") + "</div></div>" + lineChart(o.days, SETS[chartSel]) + "</div>" +
        '<div class="panel ad-card"><h2>Funnel</h2><ul class="ad-funnel">' + funnel.map(function (f, i) { return "<li><span>" + f[0] + "</span>" + bar(f[1], fmax, "f" + i) + "<b>" + (f[1] || 0) + "</b><small>" + (i && funnel[0][1] && (f[1] || 0) <= funnel[0][1] ? Math.round(100 * (f[1] || 0) / funnel[0][1]) + "%" : "") + "</small></li>"; }).join("") + '</ul><p class="muted ad-tip">“Ran out of free X-Rays” are your warmest sales leads, see <a href="#leads">Leads</a>.</p></div></div>' +
        '<div class="ad-grid3"><div class="panel ad-card"><h2>Feature use · 30 days</h2>' + (o.features.length ? '<ul class="ad-rows">' + o.features.map(function (f) { return "<li><span>" + esc(kind(f.kind)) + "</span>" + bar(f.n, fmx) + "<b>" + f.n + "</b><small>" + f.users + " user" + (f.users === 1 ? "" : "s") + "</small></li>"; }).join("") + "</ul>" : '<p class="muted">Nothing yet.</p>') + "</div>" +
        '<div class="panel ad-card"><h2>Users by plan</h2><ul class="ad-rows">' + plans.map(function (p) { return "<li><span>" + badge(p[0]) + "</span>" + bar(p[1], pmax, PLAN_C[p[0]]) + "<b>" + p[1] + "</b></li>"; }).join("") + "</ul><h2 style=\"margin-top:20px\">X-Rays by level</h2><ul class=\"ad-rows\">" + o.tiers.map(function (t) { return "<li><span>" + badge(t.tier) + "</span>" + bar(t.n, R.total) + "<b>" + t.n + "</b></li>"; }).join("") + "</ul></div>" +
        '<div class="panel ad-card"><h2>Most X-Rayed websites</h2>' + (o.domains.length ? '<ul class="ad-rows ad-doms">' + o.domains.map(function (d) { return '<li><span><a href="#business/' + encodeURIComponent(d.domain) + '">' + esc(d.domain) + "</a></span><b>" + d.n + "×</b><small>score " + (d.score == null ? "—" : d.score) + "</small></li>"; }).join("") + "</ul>" : '<p class="muted">No X-Rays yet.</p>') + "</div></div>" +
        '<div class="panel ad-card"><div class="ad-ch"><h2>Latest activity</h2><a href="#activity">See all →</a></div>' + feed(o.recent.slice(0, 12)) + "</div>";
      $("#ad-ref").onclick = function () { overview(); }; $("#ad-xall2").onclick = function () { exportAll(); };
      nba($("#ad-nba"));
      $("#ad-view").querySelectorAll("[data-chart]").forEach(function (b) { b.onclick = function () { sessionStorage.setItem("ad-chart", b.dataset.chart); overview(); }; });
    });
  }
  function feed(list) { return list.length ? '<ol class="ad-feed">' + list.map(function (e) { return '<li><i class="k ' + esc(e.kind.split("_")[0]) + '"></i><div><b>' + esc(kind(e.kind)) + "</b>" + (e.detail ? ' <span class="muted">' + esc(e.detail) + "</span>" : "") + "<br><small>" + (e.uid ? '<a href="#user/' + esc(e.uid) + '">' + esc(e.email || e.phone || e.name || "user") + "</a> · " : "") + esc(ago(e.created_at)) + "</small></div></li>"; }).join("") + "</ol>" : '<p class="muted">Nothing yet.</p>'; }
  function fail(j) { $("#ad-view").innerHTML = '<div class="panel ad-card"><p class="cf-status warn">' + esc(j.reason || "Could not load.") + "</p></div>"; }

  /* ---------- users ---------- */
  var uq = "", uf = "";
  /* ---------- v53: FODO Studio keys: who uses Studio, key given or not, computers, block ---------- */
  var sf = "", sq = "";

  /* ---------- v54.2 Client Emails (owners + Full-control admins): any email type to any client, one fixed FODO design ---------- */
  var OR = null, orPt = null;
  var OR_ST = { sent: ["Sent", "ok"], failed: ["Failed", "bad"], sending: ["Sending", "mid"] };
  var OR_F = [["name", "Name"], ["business", "Business name"], ["email", "Email"], ["phone", "Phone"], ["city", "City"], ["industry", "Industry"], ["service", "Service"], ["amount", "Amount (e.g. ₹50,000 one-time)"]];
  var OR_B = [["eyebrow", "Eyebrow label", 1], ["headline", "Headline (*words* = serif italic accent)", 1], ["intro", "Intro (blank line = new paragraph, **bold**)", 6], ["items", "List rows (one per line, Label | value)", 4], ["stats", "Stat boxes (one per line, Value | label)", 2], ["cta_text", "Button text (optional)", 1], ["cta_link", "Button link (https://, mailto: or tel:)", 1], ["closing", "Closing", 3]];
  var OR_V = [["amount", "{amount}"], ["date", "{date}"], ["next_step", "{next_step}"], ["link", "{link}"]];
  function outreachView() {
    if (ME && !owner()) { $("#ad-view").innerHTML = head("Client Emails", "") + '<div class="panel ad-card"><p class="cf-status warn">Only FODO owners and Full-control admins can open Client Emails.</p></div>'; return; }
    api("outreach").then(function (j) {
      if (!j.ok) return fail(j);
      var prev = OR || {};
      OR = { clients: j.clients, types: j.types, statuses: j.statuses, sends: j.sends, cfg: j.config, me: j.me, q: prev.q || "", sel: prev.sel || (j.clients[0] && j.clients[0].id) || "", type: prev.type || "proposal", blocks: prev.blocks || null, subject: prev.subject != null ? prev.subject : null, vars: prev.vars || {}, atts: prev.atts || [], lf: prev.lf || { client: "", status: "" } };
      if (!OR.blocks) orReset();
      orDraw();
    });
  }
  var orType = function () { return OR.types.filter(function (t) { return t.id === OR.type; })[0] || OR.types[0]; };
  var orClient = function () { return OR.clients.filter(function (c) { return c.id === OR.sel; })[0] || null; };
  function orReset() { var t = orType(); OR.blocks = {}; Object.keys(t.blocks).forEach(function (k) { OR.blocks[k] = t.blocks[k] || ""; }); OR.subject = t.subject; OR.edited = false; }
  function orCfg() {
    var c = OR.cfg;
    return c.configured ? '<p class="muted ad-or-cfg">Sends with <b>' + esc(c.provider) + "</b> from <b>" + esc(c.from) + "</b>, replies go to <b>" + esc(c.replyTo) + "</b>. This hour: " + c.used + " of " + c.hourly + " client emails. The same email type to the same client is blocked for " + c.dupMinutes + " minutes.</p>"
      : '<div class="panel ad-card"><p class="cf-status warn">Email sending is not connected yet. Open <a href="#studio">Studio ▸ Inbox</a> and log in with Google as anmol@fodo.co.in, then come back. You can still add clients, write emails and preview them.</p></div>';
  }
  function orDraw() {
    var c = orClient(), t = orType();
    $("#ad-view").innerHTML = head("Client Emails", "Pick a client, pick an email type, edit the content and preview it in the FODO design. Then send a test to yourself, or send it to the client.", '<button type="button" class="btn sm" id="or-new">+ New client</button>') + orCfg() +
      '<div class="ad-or-grid">' +
      '<section class="panel ad-card ad-or-cl" aria-label="Clients"><input id="or-q" type="search" class="ad-in" placeholder="Search clients…" value="' + esc(OR.q) + '" aria-label="Search clients"><div class="ad-or-list">' +
        (OR.clients.length ? OR.clients.map(function (x) { return '<button type="button" class="ad-or-ci' + (x.id === OR.sel ? " on" : "") + '" data-ci="' + esc(x.id) + '"><b>' + esc(x.business || x.name) + "</b><small>" + esc([x.name !== x.business ? x.name : "", x.city, x.status].filter(Boolean).join(" · ")) + "</small><small>" + esc(x.email) + "</small></button>"; }).join("") : '<p class="muted">No clients found.</p>') +
      "</div></section>" +
      '<section class="panel ad-card ad-or-ed" aria-label="Write the email">' +
        (c ? '<div class="ad-or-to"><div><b>' + esc(c.business || c.name) + "</b> <span class=\"ad-tag\">" + esc(c.status) + '</span><br><small class="muted">' + esc([c.name, c.email, c.phone, c.city, c.industry].filter(Boolean).join(" · ")) + "</small>" + (c.service ? '<br><small class="muted">Service: ' + esc(c.service) + (c.amount ? " · " + esc(c.amount) : "") + "</small>" : "") + '</div><button type="button" class="btn sm ghost" id="or-edit">Edit client</button></div>' : '<p class="muted">Add or pick a client on the left.</p>') +
        '<label class="ad-dl2" for="or-type">Email type</label><select id="or-type" class="ad-in">' + OR.types.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === OR.type ? " selected" : "") + ">" + esc(x.label) + (x.marketing ? " (marketing, has unsubscribe link)" : "") + "</option>"; }).join("") + "</select>" +
        '<label class="ad-dl2" for="or-subj">Subject (variables allowed)</label><input id="or-subj" class="ad-in" maxlength="300" value="' + esc(OR.subject || "") + '">' +
        '<div class="ad-or-vars">' + OR_V.map(function (v) { return '<label><span class="ad-dl2">' + v[1] + '</span><input class="ad-in" data-ov="' + v[0] + '" maxlength="400" placeholder="' + (v[0] === "amount" && c && c.amount ? esc(c.amount) : v[0] === "date" ? "e.g. 30 Nov 2026" : v[0] === "link" ? "https://…" : "") + '" value="' + esc(OR.vars[v[0]] || "") + '"></label>'; }).join("") + "</div>" +
        OR_B.map(function (b) { return '<label class="ad-dl2" for="or-b-' + b[0] + '">' + b[1] + "</label>" + (b[2] > 1 ? '<textarea id="or-b-' + b[0] + '" class="ad-in ad-ta" rows="' + b[2] + '" data-ob="' + b[0] + '" maxlength="6000">' + esc(OR.blocks[b[0]] || "") + "</textarea>" : '<input id="or-b-' + b[0] + '" class="ad-in" data-ob="' + b[0] + '" maxlength="400" value="' + esc(OR.blocks[b[0]] || "") + '">'); }).join("") +
        '<div class="ad-or-att"><p class="ad-dl2">Attachments <span class="muted">(any file: PDF, image, Word, Excel, PPT, zip · up to ' + (OR.cfg.maxFiles || 5) + ' files, 10 MB each, 15 MB together)</span></p>' +
          '<div class="ad-or-atl">' + OR.atts.map(function (a) { return '<span class="ad-or-chip">📎 ' + esc(a.name) + ' <small class="muted">' + kb(a.size) + '</small><button type="button" class="ad-ib" data-ax="' + esc(a.id) + '" aria-label="Remove ' + esc(a.name) + '">×</button></span>'; }).join("") + "</div>" +
          (OR.cfg.attach === false ? '<p class="muted">Attachments need CHAT_KV storage on the website.</p>' : '<label class="btn sm ghost" for="or-attf">+ Attach file</label><input type="file" id="or-attf" class="sr-only" multiple>') + "</div>" +
        '<p class="muted ad-or-hint">Variables: {client_name} {first_name} {business_name} {city} {industry} {service} {amount} {pricing} {date} {next_step} {link} {phone} {email}. The design, header, "Anmol · FODO" sign-off and footer are fixed.</p>' +
        '<p id="or-empty" class="cf-status warn" hidden></p>' +
        '<div class="btn-row"><button type="button" class="btn ghost" id="or-test"' + (c ? "" : " disabled") + '>Send a test to me</button><button type="button" class="btn" id="or-send"' + (c ? "" : " disabled") + '>Send to client…</button><button type="button" class="btn ghost" id="or-reset">Reset to the ' + esc(t.label.toLowerCase()) + " template</button></div>" +
      "</section>" +
      '<section class="panel ad-card ad-or-pvw" aria-label="Preview"><p class="ad-dl2">Live preview <span id="or-pvs" class="muted"></span></p><iframe id="or-pv" class="ad-cp-pv" title="Email preview" sandbox=""></iframe></section>' +
      "</div>" + orLog();
    var on = function (sel, fn) { var el = $(sel); if (el) el.onclick = fn; };
    on("#or-new", function () { orClientForm(null); });
    on("#or-edit", function () { orClientForm(orClient()); });
    $$("[data-ci]").forEach(function (b) { b.onclick = function () { OR.sel = b.dataset.ci; orDraw(); }; });
    var qt; $("#or-q").oninput = function () { var v = this.value; clearTimeout(qt); qt = setTimeout(function () { api("outreach/clients?q=" + encodeURIComponent(v)).then(function (j) { if (j.ok) { OR.q = v; OR.clients = j.clients; orDraw(); var el = $("#or-q"); el.focus(); el.setSelectionRange(v.length, v.length); } }); }, 300); };
    $("#or-type").onchange = function () { var v = this.value, go = function () { OR.type = v; orReset(); orDraw(); };
      if (!OR.edited) return go(); ask({ title: "Switch the email type?", text: "Your edits to the content blocks will be replaced by the new type's template.", ok: "Switch" }).then(function (x) { if (x) go(); else this.value = OR.type; }.bind(this)); };
    $("#or-subj").oninput = function () { OR.subject = this.value; OR.edited = true; orPreview(); };
    $$("[data-ob]").forEach(function (el) { el.oninput = function () { OR.blocks[el.dataset.ob] = el.value; OR.edited = true; orPreview(); }; });
    $$("[data-ov]").forEach(function (el) { el.oninput = function () { OR.vars[el.dataset.ov] = el.value; orPreview(); }; });
    on("#or-reset", function () { ask({ title: "Reset the content?", text: "Subject and all content blocks go back to the template.", ok: "Reset" }).then(function (x) { if (x) { orReset(); orDraw(); } }); });
    $$("[data-ax]").forEach(function (b) { b.onclick = function () { OR.atts = OR.atts.filter(function (a) { return a.id !== b.dataset.ax; }); orDraw(); }; });
    var af = $("#or-attf"); if (af) af.onchange = function () { orAttach([].slice.call(this.files || [])); this.value = ""; };
    on("#or-test", function () { orSend(true); });
    on("#or-send", function () { orSend(false); });
    orLogWire(); orPreview(true);
  }
  var orBody = function () { return { client_id: OR.sel, type: OR.type, subject: OR.subject, blocks: OR.blocks, vars: OR.vars, attachments: OR.atts.map(function (a) { return a.id; }) }; };
  function orAttach(files) {
    if (!files.length) return;
    var max = OR.cfg.maxFiles || 5, total = OR.atts.reduce(function (s, a) { return s + a.size; }, 0);
    if (OR.atts.length + files.length > max) return toast("Attach up to " + max + " files.", true);
    for (var i = 0; i < files.length; i++) { if (files[i].size > 10 * 1048576) return toast(files[i].name + " is over 10 MB.", true); total += files[i].size; }
    if (total > 15 * 1048576) return toast("Attachments can be up to 15 MB together.", true);
    var next = function (k) {
      if (k >= files.length) { orDraw(); return; }
      var f = files[k]; toast("Uploading " + f.name + "…");
      readB64(f).then(function (b64) { return api("outreach/attach", { file: b64, name: f.name, mime: f.type || "" }); }).then(function (j) {
        if (!j.ok) { toast(j.reason || "Could not attach " + f.name, true); return orDraw(); }
        OR.atts.push(j.attachment); next(k + 1);
      }).catch(function () { toast("Could not read " + f.name, true); orDraw(); });
    };
    next(0);
  }
  function orPreview(now) {
    clearTimeout(orPt); if (!OR.sel) { var f = $("#or-pv"); if (f) f.srcdoc = ""; return; }
    orPt = setTimeout(function () { api("outreach/preview", orBody()).then(function (j) { var f = $("#or-pv"), e = $("#or-empty"), s = $("#or-pvs"); if (!f) return;
      if (!j.ok) { if (s) s.textContent = "· " + (j.reason || "Could not build the preview."); return; }
      f.srcdoc = j.html; if (s) s.textContent = "· To " + j.to + " · " + j.subject;
      if (e) { e.hidden = !j.empty.length; e.textContent = j.empty.length ? "Still empty: " + j.empty.map(function (x) { return "{" + x + "}"; }).join(", ") + ". Fill these in (above, or in the client record) before sending." : ""; } }); }, now ? 0 : 450);
  }
  function orSend(test) {
    var c = orClient(), t = orType(); if (!c) return;
    var go = function (override, to) {
      toast(test ? "Sending the test…" : "Sending…");
      api("outreach/send", Object.assign(orBody(), test ? { test: true, to: to || OR.me } : { confirm: true, override: !!override })).then(function (j) {
        if (j.ok) { toast(test ? "Test sent to " + j.send.email : "Sent to " + j.send.email); OR.cfg.used = j.used; return orReloadLog(); }
        if (j.duplicate) return ask({ title: "Send it again?", text: j.reason, ok: "Send again", danger: true }).then(function (x) { if (x) go(true); });
        toast(j.reason || "Could not send.", true); orReloadLog();
      });
    };
    if (test) return ask({ title: "Send a test email", text: "You get exactly what " + (c.business || c.name) +  " would get" + (OR.atts.length ? ", with the " + OR.atts.length + " attached file" + (OR.atts.length > 1 ? "s" : "") : "") + ", with [TEST] in the subject. Nothing goes to the client.", input: "Send the test to", ph: OR.me, ok: "Send test" }).then(function (v) { if (v === null) return; go(false, v === true || !v ? OR.me : v); });
    api("outreach/preview", orBody()).then(function (j) {
      if (!j.ok) return toast(j.reason || "Could not build the email.", true);
      var w = document.createElement("div"); w.className = "cfx ad-dlg";
      w.innerHTML = '<div class="cfx-back" data-x></div><div class="cfx-box" role="dialog" aria-modal="true" aria-labelledby="or-ct"><h3 id="or-ct">Send this email to the client?</h3>' +
        '<dl class="ad-or-conf"><dt>To</dt><dd>' + esc(j.to) + " (" + esc(c.business || c.name) + ")</dd><dt>Subject</dt><dd>" + esc(j.subject) + "</dd><dt>Email type</dt><dd>" + esc(t.label) + (j.marketing ? " · marketing (includes an unsubscribe link)" : " · transactional") + "</dd><dt>Attachments</dt><dd>" + (j.attachments && j.attachments.length ? j.attachments.map(function (a) { return "📎 " + esc(a.name) + " (" + kb(a.size) + ")"; }).join("<br>") : "None") + "</dd></dl>" +
        (j.empty.length ? '<p class="cf-status warn">Still empty: ' + esc(j.empty.map(function (x) { return "{" + x + "}"; }).join(", ")) + "</p>" : "") +
        '<p class="muted">This sends a real email now. It cannot be unsent.</p><div class="btn-row"><button type="button" class="btn" data-ok>Yes, send it</button><button type="button" class="btn ghost" data-x>Cancel</button></div></div>';
      document.body.appendChild(w); var close = function () { w.remove(); };
      $$("[data-x]", w).forEach(function (b) { b.onclick = close; }); w.onkeydown = function (e) { if (e.key === "Escape") close(); };
      $("[data-ok]", w).onclick = function () { close(); go(false); }; setTimeout(function () { $("[data-x].btn", w).focus(); }, 30);
    });
  }
  function orLog() {
    var opts = function (list, cur) { return list.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === cur ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join(""); };
    var name = function (id) { var c = OR.clients.filter(function (x) { return x.id === id; })[0]; return c ? c.business || c.name : ""; };
    return '<h2 class="ad-or-h2">Send log</h2><div class="ad-bar2"><select id="or-lc" class="ad-in" aria-label="Filter by client">' + opts([["", "All clients"]].concat(OR.clients.map(function (c) { return [c.id, c.business || c.name]; })), OR.lf.client) + '</select><select id="or-ls" class="ad-in" aria-label="Filter by status">' + opts([["", "Any status"], ["sent", "Sent"], ["failed", "Failed"]], OR.lf.status) + "</select></div>" +
      (OR.sends.length ? '<div class="ad-table"><table><thead><tr><th>When</th><th>Client</th><th>Type</th><th>Subject</th><th>Status</th><th>By</th><th></th></tr></thead><tbody>' + OR.sends.map(function (s) { var st = OR_ST[s.status] || [s.status, ""];
        return "<tr><td>" + date(s.at, true) + "</td><td>" + esc(name(s.client_id) || "-") + '<br><small class="muted">' + esc(s.email) + "</small></td><td>" + esc(s.type_label) + (s.test ? ' <span class="ad-tag">test</span>' : "") + "</td><td>" + esc(s.subject) + (s.attachments && s.attachments.length ? '<br><small class="muted">📎 ' + s.attachments.map(function (a) { return esc(a.name); }).join(", ") + "</small>" : "") + '</td><td><span class="ad-tag ' + st[1] + '">' + st[0] + "</span>" + (s.attempts > 1 ? ' <small class="muted">' + s.attempts + " tries</small>" : "") + (s.error ? '<br><small class="muted">' + esc(s.error) + "</small>" : "") + (s.provider_id ? '<br><small class="muted">id ' + esc(s.provider_id) + "</small>" : "") + "</td><td><small>" + esc(s.admin || "") + "</small></td>" +
          '<td class="ad-cp-act"><a class="btn sm ghost" href="/api/admin/outreach/sends/' + encodeURIComponent(s.id) + '/html" target="_blank" rel="noopener">View</a>' + (s.status === "failed" ? '<button type="button" class="btn sm" data-retry="' + esc(s.id) + '">Retry</button>' : "") + "</td></tr>"; }).join("") + "</tbody></table></div>"
        : '<div class="panel ad-card"><p class="muted">Nothing sent yet.</p></div>');
  }
  function orLogWire() {
    var ch = function () { OR.lf = { client: $("#or-lc").value, status: $("#or-ls").value }; orReloadLog(); };
    $("#or-lc").onchange = ch; $("#or-ls").onchange = ch;
    $$("[data-retry]").forEach(function (b) { b.onclick = function () { b.disabled = true; b.textContent = "Retrying…"; api("outreach/sends/" + encodeURIComponent(b.dataset.retry) + "/retry", {}).then(function (j) { toast(j.ok ? "Sent to " + j.send.email : j.reason || "Still not sent.", !j.ok); orReloadLog(); }); }; });
  }
  function orReloadLog() {
    return api("outreach/sends?client=" + encodeURIComponent(OR.lf.client) + "&status=" + encodeURIComponent(OR.lf.status)).then(function (j) {
      if (!j.ok) return; OR.sends = j.sends; var h = $(".ad-or-h2"); if (!h) return;
      var box = document.createElement("div"); box.innerHTML = orLog(); while (h.nextSibling) h.parentNode.removeChild(h.nextSibling); h.parentNode.removeChild(h);
      while (box.firstChild) $("#ad-view").appendChild(box.firstChild); orLogWire(); var cf = $(".ad-or-cfg"); if (cf && OR.cfg.configured) cf.outerHTML = orCfg();
    });
  }
  /* ---------- v54.6 Bulk pitch: one presentation + one email design to many prospects (owners and Full-control admins) ---------- */
  var PI = null, piPt = null;
  var PI_ST = { queued: ["Queued", "mid"], sent: ["Sent", "ok"], failed: ["Failed", "bad"], opted_out: ["Opted out", ""] };
  /* ---------- v55 Lead Intelligence (owners + Full-control admins). Real data only: every figure comes from /api/admin/li/*. ---------- */
  var LIST = [["new", "New"], ["not_contacted", "Not contacted"], ["contacted", "Contacted"], ["email_sent", "Email sent"], ["called", "Called"], ["interested", "Interested"], ["follow_up", "Follow-up required"], ["meeting", "Meeting scheduled"], ["proposal", "Proposal sent"], ["converted", "Converted"], ["not_interested", "Not interested"], ["dnc", "Do not contact"]];
  var LIND = ["Healthcare", "Dental clinics", "Dermatology", "Real estate", "Interior design", "Restaurants", "Hotels", "Gyms", "Salons", "Education", "Coaching institutes", "Law firms", "CA firms", "Automobile", "E-commerce", "Manufacturing", "IT companies", "SaaS", "Logistics", "Other"];
  var LPRI = { hot: ["Hot lead", "ok"], high: ["High potential", "ok"], medium: ["Medium potential", "mid"], low: ["Low priority", ""] };
  var LCONF = { verified: ["Verified", "ok"], partial: ["Partially verified", "mid"], unverified: ["Unverified", "bad"], not_found: ["Not found", ""] };
  var LNCR = [["", "Delhi NCR (choose)"], ["New Delhi", "New Delhi"], ["Delhi", "Delhi"], ["Gurugram", "Gurugram"], ["Noida", "Noida"], ["Greater Noida", "Greater Noida"], ["Ghaziabad", "Ghaziabad"], ["Faridabad", "Faridabad"]];
  var lst = function (s) { var x = LIST.filter(function (r) { return r[0] === s; })[0]; return x ? x[1] : (s || ""); };
  var lpri = function (p, sc) { var x = LPRI[p]; return x ? '<span class="ad-st ' + x[1] + '">' + (sc != null ? sc + " · " : "") + x[0] + "</span>" : '<span class="ad-st">Not scored</span>'; };
  var lconf = function (c) { var x = LCONF[c] || LCONF.not_found; return '<span class="ad-st ' + x[1] + '">' + x[0] + "</span>"; };
  var lday = function (s) { return s ? date(s, true) : "Never"; };
  var opt = function (list, cur, blank) { return (blank != null ? '<option value="">' + esc(blank) + "</option>" : "") + list.map(function (o) { var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (v === cur ? " selected" : "") + ">" + esc(l) + "</option>"; }).join(""); };
  var lnav = function (cur) { var T = [["li-dash", "Dashboard"], ["li-find", "Find businesses"], ["li-people", "Decision makers"], ["li-leads", "All leads"], ["li-hot", "Hot leads"], ["li-audit", "Website audit"], ["li-analytics", "Analytics"], ["li-outreach", "Outreach"], ["li-settings", "Integrations"]];
    return '<nav class="ad-li-tabs" aria-label="Lead Intelligence">' + T.map(function (t) { return '<a href="#' + t[0] + '"' + (t[0] === cur ? ' aria-current="page" class="on"' : "") + ">" + t[1] + "</a>"; }).join("") + "</nav>"; };
  function liGate(title) { if (ME && !owner()) { $("#ad-view").innerHTML = head(title, "") + '<div class="panel ad-card"><p class="cf-status warn">Only FODO owners and Full-control admins can open Lead Intelligence.</p></div>'; return true; } return false; }
  var lqs = function (o) { return Object.keys(o).filter(function (k) { return o[k] !== "" && o[k] != null; }).map(function (k) { return k + "=" + encodeURIComponent(o[k]); }).join("&"); };
  var lbars = function (rows, lab) { var mx = Math.max.apply(null, [1].concat(rows.map(function (r) { return r.n; }))); return rows.length ? '<div class="ad-li-bars">' + rows.map(function (r) { return '<div class="ad-li-br"><span>' + esc(lab ? lab(r.k) : r.k) + '</span><i class="ad-bar" style="--v:' + Math.round(r.n / mx * 100) + '"></i><b>' + r.n + "</b></div>"; }).join("") + "</div>" : '<p class="muted">No data yet.</p>'; };
  var lrow = function (x) { return '<tr data-li="' + esc(x.id) + '" tabindex="0"><td><b>' + esc(x.name) + '</b><small class="muted ad-li-sub">' + esc([x.category || x.industry, x.locality || x.city].filter(Boolean).join(" · ")) + '</small></td><td data-l="Score">' + lpri(x.priority, x.score) + '</td><td data-l="Status">' + esc(lst(x.status)) + "</td></tr>"; };
  var lclick = function (sel) { $$(sel || "[data-li]").forEach(function (r) { var go = function (e) { if (e && e.target && /INPUT|SELECT|BUTTON|A/.test(e.target.tagName)) return; location.hash = "li-lead/" + r.dataset.li; }; r.onclick = go; r.onkeydown = function (e) { if (e.key === "Enter") go(e); }; }); };

  /* 1 · dashboard + 7 · analytics (same real counts, analytics adds breakdowns) */
  function liDash(full) {
    var tab = full ? "li-analytics" : "li-dash", title = full ? "Lead analytics" : "Lead Intelligence"; if (liGate(title)) return;
    var p = location.hash.split("/"), from = decodeURIComponent(p[1] || ""), to = decodeURIComponent(p[2] || "");
    api("li/stats?" + lqs({ from: from, to: to })).then(function (j) {
      if (!j.ok) return fail(j); var t = j.totals;
      $("#ad-view").innerHTML = head(title, full ? "Breakdowns of every lead in the database. Counts are live from the database; nothing is estimated." : "Find real businesses, research their websites, score them with evidence and track outreach. Nothing here is sent automatically.", '<a class="btn sm" href="#li-find">Find businesses</a>') + lnav(tab) +
        '<div class="ad-li-dates"><label class="ad-dl2" for="li-df">From</label><input type="date" id="li-df" class="ad-in" value="' + esc(from) + '"><label class="ad-dl2" for="li-dt">To</label><input type="date" id="li-dt" class="ad-in" value="' + esc(to) + '"><button type="button" class="btn sm ghost" id="li-dc">All time</button></div>' +
        '<div class="ad-kpis">' + K(t.discovered, "Businesses discovered") + K(t.researched, "Researched") + K(t.qualified, "Qualified (60+)") + K(t.hot, "Hot leads (80+)", t.high + " high potential") + K(t.founders, "Decision makers found", t.founders_verified + " verified on own website") + K(t.verified_contacts, "With a contact from the website") + "</div>" +
        '<div class="ad-kpis">' + K(t.contacted, "Contacted") + K(t.meetings, "Meetings") + K(t.proposals, "Proposals") + K(t.converted, "Converted") + K(t.discovered ? Math.round(t.converted / t.discovered * 1000) / 10 + "%" : "0%", "Conversion rate") + K(t.contacted ? Math.round(t.meetings / t.contacted * 1000) / 10 + "%" : "0%", "Contacted to meeting") + "</div>" +
        '<div class="ad-grid2"><div class="panel ad-card"><h2>' + (full ? "Highest scores" : "Top leads") + '</h2><div class="ad-table"><table><thead><tr><th>Business</th><th>Score</th><th>Status</th></tr></thead><tbody>' + (j.top.length ? j.top.map(lrow).join("") : '<tr><td colspan="3" class="muted">No researched leads yet.</td></tr>') + "</tbody></table></div></div>" +
        '<div class="panel ad-card"><h2>Recently discovered</h2><div class="ad-table"><table><thead><tr><th>Business</th><th>Score</th><th>Status</th></tr></thead><tbody>' + (j.recent.length ? j.recent.map(lrow).join("") : '<tr><td colspan="3" class="muted">No businesses yet. Start with Find businesses.</td></tr>') + "</tbody></table></div></div></div>" +
        '<div class="ad-grid3"><div class="panel ad-card"><h2>By industry</h2>' + lbars(j.by_industry) + '</div><div class="panel ad-card"><h2>By city</h2>' + lbars(j.by_city) + '</div><div class="panel ad-card"><h2>By priority</h2>' + lbars(j.by_priority, function (k) { return (LPRI[k] || ["Not scored"])[0]; }) + "</div></div>" +
        (full ? '<div class="ad-grid3"><div class="panel ad-card"><h2>Outreach status</h2>' + lbars(j.by_status, lst) + '</div><div class="panel ad-card"><h2>Lead source</h2>' + lbars(j.by_source, function (k) { return { google_places: "Google Places", openstreetmap: "OpenStreetMap" }[k] || k; }) + '</div><div class="panel ad-card"><h2>Funnel</h2>' + lbars([{ k: "Discovered", n: t.discovered }, { k: "Researched", n: t.researched }, { k: "Qualified", n: t.qualified }, { k: "Contacted", n: t.contacted }, { k: "Meeting", n: t.meetings }, { k: "Proposal", n: t.proposals }, { k: "Converted", n: t.converted }]) + "</div></div>" : "");
      var go = function () { location.hash = tab + "/" + encodeURIComponent($("#li-df").value) + "/" + encodeURIComponent($("#li-dt").value); };
      $("#li-df").onchange = $("#li-dt").onchange = go; $("#li-dc").onclick = function () { location.hash = tab; }; lclick();
    });
  }

  /* 2 · find businesses */
  var LF = null;
  function liFind() {
    if (liGate("Find businesses")) return;
    var f = LF || { country: "India", state: "Delhi", city: "", locality: "", industry: "", sub_industry: "", keywords: "", website: "any", size: "any", growth: "any", limit: 20, schedule: "once" };
    var inp = function (id, label, ph) { return '<div><label class="ad-dl2" for="lf-' + id + '">' + label + '</label><input id="lf-' + id + '" class="ad-in" maxlength="80" placeholder="' + esc(ph || "") + '" value="' + esc(f[id] || "") + '"></div>'; };
    var sel = function (id, label, list) { return '<div><label class="ad-dl2" for="lf-' + id + '">' + label + '</label><select id="lf-' + id + '" class="ad-in">' + opt(list, f[id]) + "</select></div>"; };
    $("#ad-view").innerHTML = head("Find businesses", "Searches Google Places when its key is set, otherwise OpenStreetMap. Each result keeps its source. Already-saved businesses are matched by name, website, phone and address and are not added twice.") + lnav("li-find") +
      '<form class="panel ad-card ad-li-form" id="lf-form"><div class="ad-li-fg">' + inp("country", "Country") + inp("state", "State") +
      '<div><label class="ad-dl2" for="lf-city">City</label><input id="lf-city" class="ad-in" list="lf-ncr" maxlength="80" placeholder="New Delhi" value="' + esc(f.city) + '"><datalist id="lf-ncr">' + LNCR.slice(1).map(function (c) { return '<option value="' + esc(c[0]) + '">'; }).join("") + "</datalist></div>" +
      inp("locality", "Locality", "Dwarka, Connaught Place, Sector 29") + '<div><label class="ad-dl2" for="lf-industry">Industry</label><select id="lf-industry" class="ad-in">' + opt(LIND, f.industry, "Choose an industry") + "</select></div>" +
      inp("sub_industry", "Sub-industry", "dentist, orthodontist") + inp("keywords", "Keywords", "implants, 24 hours") +
      sel("website", "Website", [["any", "Any"], ["has", "Has a website"], ["none", "No website"]]) + sel("size", "Size (by Google review count)", [["any", "Any"], ["small", "Small (under 50 reviews)"], ["medium", "Medium (50 to 499)"], ["large", "Large (500+)"]]) +
      sel("growth", "Growth signals", [["any", "Any"], ["active", "Active (10+ reviews, rating 4+)"], ["established", "Established (100+ reviews)"]]) +
      '<div><label class="ad-dl2" for="lf-limit">Max new leads</label><input id="lf-limit" type="number" min="1" max="60" class="ad-in" value="' + (+f.limit || 20) + '"></div>' +
      sel("schedule", "Run", [["once", "Once"], ["daily", "Daily (save search)"], ["weekly", "Weekly (save search)"]]) + "</div>" +
      '<p class="muted">Size and growth filters need review counts, which only Google Places provides. Without them those filters leave businesses out rather than guess.</p>' +
      '<div class="ad-acts"><button type="submit" class="btn" id="lf-go">Search now</button><button type="button" class="btn ghost" id="lf-save">Save search</button></div></form>' +
      '<div id="lf-out"></div><div id="lf-jobs"></div>';
    var read = function () { var o = {}; ["country", "state", "city", "locality", "industry", "sub_industry", "keywords", "website", "size", "growth", "limit", "schedule"].forEach(function (k) { o[k] = $("#lf-" + k).value.trim(); }); LF = o; return o; };
    $("#lf-form").onsubmit = function (e) {
      e.preventDefault(); var o = read(), b = $("#lf-go"); b.disabled = true; b.textContent = "Searching…"; $("#lf-out").innerHTML = '<div class="ad-load">Searching ' + esc([o.locality, o.city].filter(Boolean).join(", ")) + "…</div>";
      api("li/search", o).then(function (j) {
        b.disabled = false; b.textContent = "Search now";
        if (!j.ok) { $("#lf-out").innerHTML = '<div class="panel ad-card"><p class="cf-status warn">' + esc(j.reason) + "</p></div>"; return; }
        var src = { google_places: "Google Places", openstreetmap: "OpenStreetMap" }[j.source] || j.source;
        $("#lf-out").innerHTML = '<div class="panel ad-card"><h2>Results <small class="muted">' + esc(j.query) + " · " + esc(j.area) + " · " + esc(src) + "</small></h2>" +
          (j.errors.length ? '<p class="cf-status warn">' + j.errors.map(esc).join("<br>") + "</p>" : "") +
          '<p>' + j.found + " found · <b>" + j.added.length + " new</b> · " + j.duplicates.length + " already saved · " + j.filtered + " left out by filters</p>" +
          (j.added.length ? '<ul class="ad-li-ul">' + j.added.map(function (a) { return '<li><a href="#li-lead/' + esc(a.id) + '">' + esc(a.name) + '</a> <small class="muted">' + esc(a.id) + "</small></li>"; }).join("") + '</ul><div class="ad-acts"><button type="button" class="btn sm" id="lf-res">Research these ' + j.added.length + '</button><span class="muted" id="lf-rs"></span></div>' : (j.found ? "" : '<p class="muted">No businesses came back for this search. Try a wider area or different words.</p>')) + "</div>";
        var r = $("#lf-res"); if (r) r.onclick = function () { r.disabled = true; liResearchMany(j.added.map(function (a) { return a.id; }), $("#lf-rs"), function () { r.textContent = "Done"; }); };
        liJobs();
      });
    };
    $("#lf-save").onclick = function () { var o = read(); api("li/jobs/save", { filters: o, schedule: o.schedule }).then(function (j) { if (!j.ok) return toast(j.reason, true); toast(o.schedule === "once" ? "Search saved" : "Saved: runs " + o.schedule); liJobs(); }); };
    liJobs();
  }
  function liResearchMany(ids, el, done) {
    var i = 0, okN = 0, bad = 0;
    (function next() {
      if (i >= ids.length) { el.textContent = okN + " researched" + (bad ? ", " + bad + " failed" : "") + "."; if (done) done(); return; }
      el.textContent = "Researching " + (i + 1) + " of " + ids.length + "… (website, contacts, people, audit)";
      api("li/research/" + encodeURIComponent(ids[i++]), {}).then(function (j) { if (j.ok) okN++; else bad++; next(); });
    })();
  }
  function liJobs() {
    api("li/jobs").then(function (j) {
      var el = $("#lf-jobs"); if (!el || !j.ok) return;
      el.innerHTML = '<div class="ad-grid2"><div class="panel ad-card"><h2>Saved searches</h2>' + (j.jobs.length ? '<div class="ad-table"><table><thead><tr><th>Search</th><th>Runs</th><th>Last run</th><th>Next run</th><th></th></tr></thead><tbody>' + j.jobs.map(function (x) { return "<tr><td><b>" + esc(x.name) + '</b></td><td data-l="Runs">' + esc(x.schedule) + '</td><td data-l="Last run">' + lday(x.last_run) + '</td><td data-l="Next run">' + (x.next_run ? date(x.next_run, true) : "Manual") + '</td><td><button type="button" class="btn sm ghost" data-jr="' + esc(x.id) + '">Run</button> <button type="button" class="ad-ib" data-jd="' + esc(x.id) + '" aria-label="Delete saved search">×</button></td></tr>'; }).join("") + "</tbody></table></div>" : '<p class="muted">None yet. Daily and weekly searches run with the daily scheduler (one per run) and skip businesses already saved.</p>') + "</div>" +
        '<div class="panel ad-card"><h2>Search log</h2>' + (j.runs.length ? '<div class="ad-table"><table><thead><tr><th>When</th><th>Source</th><th>Found</th><th>New</th><th>Errors</th></tr></thead><tbody>' + j.runs.slice(0, 20).map(function (r) { var e = []; try { e = JSON.parse(r.errors || "[]"); } catch (x) {} return "<tr><td>" + date(r.at, true) + (r.job_id ? ' <span class="ad-tag">scheduled</span>' : "") + '</td><td data-l="Source">' + esc(r.source) + '</td><td data-l="Found">' + r.found + '</td><td data-l="New">' + r.added + '</td><td data-l="Errors">' + (e.length ? '<span class="ad-tag bad" title="' + esc(e.join(" | ")) + '">' + e.length + "</span>" : "0") + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<p class="muted">No searches yet.</p>') + "</div></div>";
      $$("[data-jr]", el).forEach(function (b) { b.onclick = function () { b.disabled = true; b.textContent = "Running…"; api("li/jobs/" + encodeURIComponent(b.dataset.jr) + "/run", {}).then(function (r) { toast(r.ok ? r.added.length + " new, " + r.duplicates.length + " already saved" : r.reason, !r.ok); liJobs(); }); }; });
      $$("[data-jd]", el).forEach(function (b) { b.onclick = function () { ask({ title: "Delete this saved search?", text: "Leads it already found stay.", ok: "Delete" }).then(function (v) { if (v) api("li/jobs/" + encodeURIComponent(b.dataset.jd) + "/delete", {}).then(liJobs); }); }; });
    });
  }

  /* 4 · all leads, 5 · hot leads, 3 · decision makers, 6 · audits, 8 · outreach: one table with different presets */
  var LQ = {};
  function liLeads(mode) {
    var titles = { "li-leads": "All leads", "li-hot": "Hot leads", "li-people": "Founder & decision maker finder", "li-audit": "Website audit", "li-outreach": "Outreach manager" };
    if (liGate(titles[mode])) return;
    var q = LQ[mode] || (LQ[mode] = mode === "li-hot" ? { min: 60, sort: "score" } : mode === "li-audit" ? { researched: "1", sort: "updated" } : { sort: mode === "li-outreach" ? "updated" : "score" });
    var subs = { "li-leads": "Every saved business. Click a row for the full profile. Exports include sources and confidence.", "li-hot": "Leads scoring 60 or more (High potential and Hot). The score is the sum of 8 evidenced parts; open a lead to see why.",
      "li-people": "Decision makers come from the business's own website (Verified) or public search results that name the business (Partially verified). LinkedIn is never opened or scraped, and no name or email is guessed.",
      "li-audit": "Automatic checks of each business's own website: HTTPS, mobile tag, speed, SEO basics, broken links, forms, booking, chat, analytics and ad tags. AI summaries are labelled.", "li-outreach": "Track every lead through 12 statuses. Drafts are written for you to copy; nothing is sent from here. Do not contact and unsubscribed emails are blocked." };
    api("li/leads?" + lqs(q)).then(function (j) {
      if (!j.ok) return fail(j);
      var L = j.leads, sel = {};
      var filt = '<div class="ad-li-filt"><input id="lq-q" class="ad-in" placeholder="Search name, website, owner, email, ID" value="' + esc(q.q || "") + '">' +
        '<select id="lq-status" class="ad-in" aria-label="Status">' + opt(LIST, q.status || "", "Any status") + "</select>" +
        '<select id="lq-priority" class="ad-in" aria-label="Priority">' + opt([["hot", "Hot lead"], ["high", "High potential"], ["medium", "Medium potential"], ["low", "Low priority"]], q.priority || "", "Any priority") + "</select>" +
        '<select id="lq-industry" class="ad-in" aria-label="Industry">' + opt(LIND, q.industry || "", "Any industry") + "</select>" +
        '<input id="lq-city" class="ad-in" placeholder="City" value="' + esc(q.city || "") + '">' +
        '<select id="lq-website" class="ad-in" aria-label="Website">' + opt([["has", "Has website"], ["none", "No website"]], q.website || "", "Website: any") + "</select>" +
        '<select id="lq-people" class="ad-in" aria-label="Decision maker">' + opt([["verified", "Verified"], ["partial", "Partially verified"], ["unverified", "Unverified"], ["not_found", "Not found"]], q.people || "", "Decision maker: any") + "</select>" +
        '<select id="lq-researched" class="ad-in" aria-label="Researched">' + opt([["1", "Researched"], ["0", "Not researched"]], q.researched || "", "Researched: any") + "</select>" +
        '<select id="lq-sort" class="ad-in" aria-label="Sort">' + opt([["score", "Sort: score"], ["newest", "Sort: newest"], ["updated", "Sort: updated"], ["name", "Sort: name"], ["reviews", "Sort: reviews"]], q.sort || "score") + "</select>" +
        '<label class="ad-tog"><input type="checkbox" id="lq-archived"' + (q.archived === "1" ? " checked" : "") + "> Archived</label></div>";
      var cols = mode === "li-people" ? ["Decision maker", "Confidence"] : mode === "li-audit" ? ["Website", "Researched"] : mode === "li-outreach" ? ["Contact", "Change status"] : ["Contact", "Decision maker"];
      var cell = function (x) {
        if (mode === "li-people") return '<td data-l="Decision maker">' + (x.owner_name ? "<b>" + esc(x.owner_name) + "</b><small class=\"muted ad-li-sub\">" + esc(x.owner_role || "") + "</small>" : '<span class="muted">' + (x.researched_at ? "None found" : "Not searched yet") + "</span>") + '</td><td data-l="Confidence">' + lconf(x.owner_conf) + "</td>";
        if (mode === "li-audit") return '<td data-l="Website">' + (x.website ? '<a href="' + esc(x.website) + '" target="_blank" rel="noopener nofollow">' + esc(x.website.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40)) + "</a>" : '<span class="muted">No website</span>') + '</td><td data-l="Researched">' + lday(x.researched_at) + "</td>";
        if (mode === "li-outreach") return '<td data-l="Contact">' + esc(x.email || x.phone || "None public") + '</td><td data-l="Change status"><select class="ad-in" data-ls="' + esc(x.id) + '" aria-label="Status for ' + esc(x.name) + '">' + opt(LIST, x.status) + "</select></td>";
        return '<td data-l="Contact">' + esc(x.email || x.phone || "None public") + '</td><td data-l="Decision maker">' + (x.owner_name ? esc(x.owner_name) + " " + lconf(x.owner_conf) : '<span class="muted">None yet</span>') + "</td>";
      };
      $("#ad-view").innerHTML = head(titles[mode], subs[mode], '<a class="btn sm" href="#li-find">+ Find businesses</a>') + lnav(mode) + filt +
        '<div class="ad-li-bulk"><span id="lq-n" class="muted">' + j.total + " leads" + (j.total > L.length ? " (showing " + L.length + ")" : "") + '</span><span class="ad-li-ba" id="lq-ba" hidden><b id="lq-sn">0</b> selected · ' +
        '<button type="button" class="btn sm" data-ba="research">Research</button><select class="ad-in" id="lq-bst" aria-label="Set status">' + opt(LIST, "", "Set status…") + "</select>" +
        '<button type="button" class="btn sm ghost" data-ba="csv">CSV</button><button type="button" class="btn sm ghost" data-ba="xlsx">Excel</button><button type="button" class="btn sm" data-ba="queue">Outreach queue</button><button type="button" class="btn sm ghost" data-ba="pitch">Add to Bulk pitch</button>' +
        '<button type="button" class="btn sm ghost" data-ba="' + (q.archived === "1" ? "unarchive" : "archive") + '">' + (q.archived === "1" ? "Restore" : "Archive") + '</button><button type="button" class="btn sm ghost" data-ba="delete">Delete</button></span>' +
        '<span class="ad-li-ex"><button type="button" class="btn sm ghost" id="lq-csv">Export all CSV</button> <button type="button" class="btn sm ghost" id="lq-xlsx">Excel</button>' + (mode === "li-leads" ? ' <button type="button" class="btn sm ghost" id="lq-dup">Check duplicates</button>' : "") + "</span></div>" +
        '<div class="ad-table"><table><thead><tr><th><input type="checkbox" id="lq-all" aria-label="Select all"></th><th>Business</th><th>Score</th><th>' + cols[0] + "</th><th>" + cols[1] + "</th><th>Status</th></tr></thead><tbody>" +
        (L.length ? L.map(function (x) { return '<tr data-li="' + esc(x.id) + '" tabindex="0"><td><input type="checkbox" data-ck="' + esc(x.id) + '" aria-label="Select ' + esc(x.name) + '"></td><td><b>' + esc(x.name) + '</b><small class="muted ad-li-sub">' + esc([x.id, x.category || x.industry, x.locality || x.city].filter(Boolean).join(" · ")) + '</small></td><td data-l="Score">' + lpri(x.priority, x.score) + "</td>" + cell(x) + '<td data-l="Status">' + esc(lst(x.status)) + "</td></tr>"; }).join("")
          : '<tr><td colspan="6" class="muted">No leads match. ' + (mode === "li-hot" ? "Research leads to score them." : "Use Find businesses to add some.") + "</td></tr>") + "</tbody></table></div><div id=\"lq-dups\"></div>";
      var reload = function () { liLeads(mode); };
      var setQ = function () { ["q", "status", "priority", "industry", "city", "website", "people", "researched", "sort"].forEach(function (k) { q[k] = $("#lq-" + k).value.trim(); }); q.archived = $("#lq-archived").checked ? "1" : ""; reload(); };
      ["status", "priority", "industry", "website", "people", "researched", "sort"].forEach(function (k) { $("#lq-" + k).onchange = setQ; }); $("#lq-archived").onchange = setQ;
      $("#lq-q").onkeydown = $("#lq-city").onkeydown = function (e) { if (e.key === "Enter") setQ(); };
      var ids = function () { return Object.keys(sel).filter(function (k) { return sel[k]; }); };
      var upd = function () { var n = ids().length; $("#lq-ba").hidden = !n; $("#lq-sn").textContent = n; };
      $$("[data-ck]").forEach(function (c) { c.onchange = function () { sel[c.dataset.ck] = c.checked; upd(); }; });
      $("#lq-all").onchange = function () { var on = this.checked; $$("[data-ck]").forEach(function (c) { c.checked = on; sel[c.dataset.ck] = on; }); upd(); };
      $$("[data-ls]").forEach(function (s) { s.onchange = function () { api("li/lead/" + encodeURIComponent(s.dataset.ls), { status: s.value }).then(function (r) { toast(r.ok ? "Status: " + lst(s.value) : r.reason, !r.ok); }); }; });
      $("#lq-bst").onchange = function () { var v = this.value; if (!v) return; api("li/bulk", { ids: ids(), action: "status", status: v }).then(function (r) { toast(r.ok ? r.changed + " updated" : r.reason, !r.ok); reload(); }); };
      $$("[data-ba]").forEach(function (b) { b.onclick = function () {
        var a = b.dataset.ba, I = ids(); if (!I.length) return;
        if (a === "research") { b.disabled = true; return liResearchMany(I, $("#lq-n"), reload); }
        if (a === "csv" || a === "xlsx") return liExport(a, I);
        if (a === "pitch") return liToPitch(I);
        if (a === "queue") return liQueue(I);
        var run = function () { api("li/bulk", { ids: I, action: a }).then(function (r) { toast(r.ok ? r.changed + " " + a + "d" : r.reason, !r.ok); reload(); }); };
        if (a === "delete") ask({ title: "Delete " + I.length + " lead" + (I.length > 1 ? "s" : "") + "?", text: "Their contacts, people, audit, score and outreach history are removed for good. Archive keeps them instead.", ok: "Delete" }).then(function (v) { if (v) run(); }); else run();
      }; });
      $("#lq-csv").onclick = function () { liExport("csv"); }; $("#lq-xlsx").onclick = function () { liExport("xlsx"); };
      var du = $("#lq-dup"); if (du) du.onclick = function () { api("li/duplicates").then(function (r) { if (!r.ok) return toast(r.reason, true); $("#lq-dups").innerHTML = '<div class="panel ad-card"><h2>Possible duplicates</h2>' + (r.groups.length ? '<ul class="ad-li-ul">' + r.groups.map(function (g) { return "<li>Same " + esc(g.by) + ": " + g.ids.map(function (id) { return '<a href="#li-lead/' + esc(id) + '">' + esc(id) + "</a>"; }).join(", ") + ' <small class="muted">' + esc(g.names) + "</small></li>"; }).join("") + "</ul>" : '<p class="muted">No duplicates found.</p>') + "</div>"; }); };
      lclick("tr[data-li]");
    });
  }
  function liExport(kind, ids) {
    var q = LQ[(location.hash.slice(1).split("/")[0])] || {};
    api("li/export?" + lqs(Object.assign({}, q, ids ? { ids: ids.join(",") } : {}))).then(function (j) {
      if (!j.ok) return toast(j.reason, true); if (!j.rows.length) return toast("Nothing to export.", true);
      var keys = Object.keys(j.rows[0]), rows = [keys].concat(j.rows.map(function (r) { return keys.map(function (k) { return r[k]; }); })), name = "fodo-leads-" + new Date().toISOString().slice(0, 10);
      if (kind === "csv") csv(rows, name + ".csv"); else xlsxDownload(rows, name + ".xlsx", "Leads");
      toast(j.rows.length + " leads exported");
    });
  }
  function liToPitch(ids) {
    api("pitch").then(function (j) {
      if (!j.ok) return toast(j.reason, true); if (!j.campaigns.length) return toast("Create a Bulk pitch campaign first.", true);
      ask({ title: "Add to a Bulk pitch campaign", text: "Only leads with a public email from their website or listing are added. Do not contact leads and unsubscribed emails are skipped. Sending stays in Bulk pitch (test first, then confirm).\n\nCampaigns: " + j.campaigns.map(function (c) { return c.id + " (" + c.name + ")"; }).join(", "), input: "Campaign ID", ok: "Add" }).then(function (cid) {
        if (!cid) return; api("li/to-pitch", { ids: ids, campaign_id: cid }).then(function (r) { toast(r.ok ? r.added + " added, " + r.skipped + " skipped (no email)" : r.reason, !r.ok); });
      });
    });
  }
  /* minimal .xlsx writer (stored zip, inline strings) so Excel export needs no library */
  function xlsxDownload(rows, name, sheet) {
    var x = function (s) { return String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
    var col = function (i) { var s = ""; i++; while (i) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; };
    var data = rows.map(function (r, ri) { return '<row r="' + (ri + 1) + '">' + r.map(function (v, ci) { var ref = col(ci) + (ri + 1); return typeof v === "number" && isFinite(v) ? '<c r="' + ref + '"><v>' + v + "</v></c>" : '<c r="' + ref + '" t="inlineStr"' + (ri === 0 ? ' s="1"' : "") + "><is><t>" + x(v) + "</t></is></c>"; }).join("") + "</row>"; }).join("");
    var F = {
      "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      "xl/workbook.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + x(sheet) + '" sheetId="1" r:id="rId1"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      "xl/styles.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>',
      "xl/worksheets/sheet1.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>' + data + "</sheetData></worksheet>"
    };
    var enc = new TextEncoder(), T = [], crcT = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
    var crc = function (b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
    var parts = [], cen = [], off = 0, u16 = function (v) { return [v & 255, (v >>> 8) & 255]; }, u32 = function (v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; };
    Object.keys(F).forEach(function (fn) {
      var nm = enc.encode(fn), b = enc.encode(F[fn]), cr = crc(b);
      var lh = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(cr), u32(b.length), u32(b.length), u16(nm.length), u16(0));
      parts.push(new Uint8Array(lh), nm, b);
      cen.push(new Uint8Array([].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(cr), u32(b.length), u32(b.length), u16(nm.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off))), nm);
      off += lh.length + nm.length + b.length;
    });
    var cl = cen.reduce(function (s, a) { return s + a.length; }, 0);
    var end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(Object.keys(F).length), u16(Object.keys(F).length), u32(cl), u32(off), u16(0)));
    var blob = new Blob(parts.concat(cen, [end]), { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* lead detail: score breakdown, contacts with sources, people, audit, opportunities, drafts, history */
  function liLead(id) {
    if (liGate("Lead")) return;
    api("li/lead/" + encodeURIComponent(id || "")).then(function (j) {
      if (!j.ok) return fail(j);
      var x = j.lead, A = j.audit, C = (A && A.checks) || {}, S = j.score;
      var srcName = { google_places: "Google Places", openstreetmap: "OpenStreetMap" }[x.source] || x.source;
      var link = function (u, t) { return u && /^https?:\/\//.test(u) ? '<a href="' + esc(u) + '" target="_blank" rel="noopener nofollow">' + esc(t || u.replace(/^https?:\/\/(www\.)?/, "").slice(0, 48)) + "</a>" : esc(u || ""); };
      var KL = { email: "Email", phone: "Phone", whatsapp: "WhatsApp", website: "Website", maps: "Google Maps", instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", x: "X", youtube: "YouTube" };
      var chk = function (v, label) { return '<li class="' + (v ? "ok" : "no") + '"><span aria-hidden="true">' + (v ? "✓" : "✕") + "</span> " + esc(label) + "</li>"; };
      $("#ad-view").innerHTML = head(esc(x.name), esc([x.id, x.category || x.industry, x.address].filter(Boolean).join(" · ")), '<a class="btn sm ghost" href="#li-leads">All leads</a>') + lnav("") +
        (x.status === "dnc" || j.opted_out ? '<div class="panel ad-card"><p class="cf-status warn">' + (j.opted_out ? "This email has unsubscribed from FODO emails." : "Marked Do not contact.") + " No drafts, no Bulk pitch.</p></div>" : "") +
        '<div class="ad-kpis">' + K(x.score == null ? "?" : x.score + "/100", "Lead score", x.priority ? LPRI[x.priority][0] : "Run research to score") + K(x.rating == null ? "n/a" : x.rating + "★", "Google rating", x.reviews == null ? "No review data" : x.reviews + " reviews") + K(esc(srcName), "Source", lday(x.created_at)) + K(lday(x.researched_at), "Last researched") + "</div>" +
        '<div class="panel ad-card ad-li-bar"><label class="ad-dl2" for="ll-st">Status</label><select id="ll-st" class="ad-in">' + opt(LIST, x.status) + '</select><button type="button" class="btn sm" id="ll-res">' + (x.researched_at ? "Research again" : "Research now") + '</button><button type="button" class="btn sm ghost" id="ll-edit">Edit</button><button type="button" class="btn sm ghost" id="ll-arc">' + (x.archived ? "Restore" : "Archive") + '</button><span class="muted" id="ll-msg"></span></div>' +
        '<div class="ad-grid2"><div class="panel ad-card"><h2>Why this score</h2>' + (S ? '<div class="ad-li-score">' + S.parts.map(function (p) { return '<div class="ad-li-sp"><div><b>' + esc(p.label) + "</b><small class=\"muted\">" + esc(p.evidence) + '</small></div><i class="ad-bar" style="--v:' + Math.round(p.points / p.max * 100) + '"></i><span>' + p.points + "/" + p.max + "</span></div>"; }).join("") + '</div><p class="muted">Parts with no data score 0. Scored ' + date(S.at, true) + ".</p>" : '<p class="muted">Not scored yet. Research reads the business\'s own website and builds the score from what it finds.</p>') + "</div>" +
        '<div class="panel ad-card"><h2>Decision makers</h2>' + (j.people.length ? '<ul class="ad-li-ul">' + j.people.map(function (p) { return "<li><b>" + esc(p.name) + "</b> · " + esc(p.role) + " " + lconf(p.confidence) + '<small class="muted ad-li-sub">' + esc(p.evidence) + " · source: " + link(p.source_url) + (p.profile_url ? " · profile: " + link(p.profile_url) : "") + "</small></li>"; }).join("") + "</ul>" : '<p class="muted">' + (x.researched_at ? "Not found on the website or in public search results. Nothing is guessed." : "Run research to look.") + "</p>") +
        '<h2>Contacts</h2>' + (j.contacts.length ? '<ul class="ad-li-ul">' + j.contacts.map(function (c) { return "<li><b>" + esc(c.label || KL[c.kind] || c.kind) + ":</b> " + (/^https?:/.test(c.value) ? link(c.value) : c.kind === "email" ? '<a href="mailto:' + esc(c.value) + '">' + esc(c.value) + "</a>" : esc(c.value)) + '<small class="muted ad-li-sub">' + esc(c.status || "") + (c.source_url ? " · source: " + link(c.source_url) : "") + "</small></li>"; }).join("") + "</ul>" : '<p class="muted">No public contacts found.</p>') + "</div></div>" +
        '<div class="panel ad-card"><h2>Website audit ' + (A ? '<small class="muted">' + date(A.at, true) + " · " + link(A.url) + "</small>" : "") + "</h2>" + (A ? (A.checks.findings && A.checks.findings.length ? '<ul class="ad-li-ul">' + A.checks.findings.map(function (f) { return '<li><span class="ad-st ' + (f[0] === "high" ? "bad" : f[0] === "medium" ? "mid" : "") + '">' + esc(f[0]) + "</span> " + esc(f[1]) + "</li>"; }).join("") + "</ul>" : '<p class="muted">No problems found in the automatic checks.</p>') +
          (C.reachable ? '<ul class="ad-li-chk">' + chk(C.https, "HTTPS") + chk(C.viewport, "Mobile viewport") + chk(C.title, "Title") + chk(C.description, "Meta description") + chk(C.h1, "H1 heading") + chk(C.canonical, "Canonical") + chk(C.schema, "Structured data") + chk(C.contact_form, "Contact form") + chk(C.booking, "Booking") + chk(C.whatsapp_link || C.chat_widget, "WhatsApp / chat") + chk(C.analytics, "Analytics") + chk(C.meta_pixel || C.google_ads_tag, "Ad tracking tag") + chk((C.socials || []).length, "Social links") + chk(!(C.broken_links || []).length, "No broken links (sample)") + "</ul><p class=\"muted\">First response " + (C.response_ms / 1000).toFixed(1) + " s · " + C.html_kb + " KB · " + C.images + " images, " + C.images_no_alt + " without alt text" + (C.pagespeed && C.pagespeed.score != null ? " · PageSpeed mobile " + C.pagespeed.score + "/100" : " · PageSpeed not run") + "</p>" : "") +
          (A.ai_summary ? '<div class="ad-li-ai"><p class="ad-dl2">AI summary <span class="ad-tag">AI · ' + esc((A.ai_model || "").split("/").pop()) + '</span> <small class="muted">written from the checks above; hypotheses are not facts</small></p><p>' + esc(A.ai_summary).replace(/\n/g, "<br>") + "</p></div>" : "") + ((C.notes || []).length ? '<p class="muted">' + C.notes.map(esc).join("<br>") + "</p>" : "") : '<p class="muted">Not audited yet.</p>') + "</div>" +
        '<div class="panel ad-card"><h2>Opportunities for FODO</h2>' + (j.opportunities.length ? '<div class="ad-table"><table><thead><tr><th>Service</th><th>Problem and evidence</th><th>Why it matters</th><th>Outreach angle</th></tr></thead><tbody>' + j.opportunities.map(function (o) { return "<tr><td><b>" + esc(o.service) + '</b> <span class="ad-tag">' + (o.kind === "observed" ? "observed" : "AI hypothesis") + '</span></td><td data-l="Problem"><b>' + esc(o.problem) + '</b><small class="muted ad-li-sub">' + esc(o.evidence) + '</small></td><td data-l="Why">' + esc(o.why) + '<small class="muted ad-li-sub">' + esc(o.value) + '</small></td><td data-l="Angle">' + esc(o.angle) + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<p class="muted">None yet.</p>') + "</div>" +
        liMsgPanel(j) + '<div class="ad-grid2"><div><div class="panel ad-card">' +
          '<label class="ad-dl2" for="ll-notes">Notes</label><textarea id="ll-notes" class="ad-in ad-ta" rows="3" maxlength="4000">' + esc(x.notes || "") + '</textarea><button type="button" class="btn sm ghost" id="ll-ns">Save notes</button></div></div>' +
        '<div class="panel ad-card">' + ((j.replies || []).length ? '<h2>Replies and enquiries <span class="ad-tag ok">' + j.replies.length + '</span></h2><ul class="ad-li-ul">' + j.replies.map(function (e) { return '<li><a href="#enquiries">' + esc(e.name || e.email || e.phone) + '</a> · ' + esc(e.source || 'website') + '<small class="muted ad-li-sub">' + date(e.created_at, true) + ' · ' + esc(e.status || '') + '</small></li>'; }).join('') + '</ul>' : '') + '<h2>History</h2>' + (j.history.length ? '<ul class="ad-li-ul">' + j.history.map(function (h) { return "<li>" + esc(lst(h.from_status)) + " → <b>" + esc(lst(h.to_status)) + "</b>" + (h.channel ? " · " + esc(h.channel) : "") + (h.note ? " · " + esc(h.note) : "") + '<small class="muted ad-li-sub">' + date(h.at, true) + " · " + esc(h.by_email || "") + "</small></li>"; }).join("") + "</ul>" : '<p class="muted">No status changes yet.</p>') +
          "<h2>Research sources</h2>" + (j.sources.length || x.source_ref || x.maps_url ? '<ul class="ad-li-ul">' + (x.maps_url ? "<li>Listing: " + link(x.maps_url) + "</li>" : x.source_ref ? "<li>Listing: " + link(x.source_ref) + "</li>" : "") + j.sources.map(function (s) { return "<li>" + link(s.url) + ' <small class="muted">HTTP ' + s.http + " · " + date(s.at, true) + "</small></li>"; }).join("") + "</ul>" : '<p class="muted">None.</p>') + "</div></div>";
      var reload = function () { liLead(x.id); };
      $("#ll-st").onchange = function () { var v = this.value; ask({ title: "Change status to " + lst(v) + "?", input: "Note (optional)", ok: "Save" }).then(function (note) { if (note === null) { $("#ll-st").value = x.status; return; } api("li/lead/" + encodeURIComponent(x.id), { status: v, note: note }).then(function (r) { toast(r.ok ? "Status saved" : r.reason, !r.ok); reload(); }); }); };
      $("#ll-res").onclick = function () { var b = this; b.disabled = true; $("#ll-msg").textContent = "Reading the website, contact and about pages, checking people and email domain… this can take up to a minute."; api("li/research/" + encodeURIComponent(x.id), {}).then(function (r) { if (!r.ok) { b.disabled = false; $("#ll-msg").textContent = r.reason; return; } toast("Research done · score " + r.lead.score); reload(); }); };
      $("#ll-arc").onclick = function () { api("li/bulk", { ids: [x.id], action: x.archived ? "unarchive" : "archive" }).then(function (r) { toast(r.ok ? (x.archived ? "Restored" : "Archived") : r.reason, !r.ok); reload(); }); };
      $("#ll-edit").onclick = function () { ask({ title: "Website", text: "Fix or add the official website (https://…). Research again afterwards.", input: "Website", ok: "Save" }).then(function (w) { if (w === null) return; api("li/lead/" + encodeURIComponent(x.id), { website: w }).then(function (r) { toast(r.ok ? "Saved" : r.reason, !r.ok); reload(); }); }); };
      $("#ll-ns").onclick = function () { api("li/lead/" + encodeURIComponent(x.id), { notes: $("#ll-notes").value }).then(function (r) { toast(r.ok ? "Notes saved" : r.reason, !r.ok); }); };
      liMsgWire(j, reload);
    });
  }

  /* 9 · integrations & settings */
  function liSettings() {
    if (liGate("Integrations & settings")) return;
    Promise.all([api("li/integrations"), api("li/activity")]).then(function (R) {
      var j = R[0], a = R[1]; if (!j.ok) return fail(j);
      $("#ad-view").innerHTML = head("Integrations & settings", "Keys are stored as Cloudflare secrets on the server and never sent to the browser. A feature whose service is not connected says so instead of showing results.") + lnav("li-settings") +
        '<div class="ad-table"><table><thead><tr><th>Service</th><th>Status</th><th>Used (30 days)</th><th>Cost</th><th></th></tr></thead><tbody>' + j.items.map(function (i) { var u = i.usage || {}; return "<tr><td><b>" + esc(i.name) + '</b><small class="muted ad-li-sub">' + esc(i.role) + (i.secret ? " · Setting: " + esc(i.secret) : "") + '</small></td><td data-l="Status"><span class="ad-st ' + (i.configured ? "ok" : "mid") + '">' + (i.configured ? "Connected" : "Not configured") + '</span></td><td data-l="Used">' + (u.calls == null ? '<span class="muted">n/a</span>' : u.calls + " calls" + (u.errors ? ' <span class="ad-tag bad">' + u.errors + " errors</span>" : "") + '<small class="muted ad-li-sub">today ' + (u.today || 0) + "</small>") + '</td><td data-l="Cost"><small>' + esc(i.cost) + '</small></td><td><button type="button" class="btn sm ghost" data-lt="' + esc(i.key) + '">Test</button><small class="muted ad-li-sub" id="lt-' + esc(i.key) + '"></small></td></tr>'; }).join("") + "</tbody></table></div>" +
        '<div class="panel ad-card"><h2>How to connect</h2><ol class="ad-li-ol"><li><b>Google Places</b> (best results, Delhi NCR phones, websites, reviews): Google Cloud Console, enable Places API (New), create an API key restricted to Places API, set a budget alert, then in Cloudflare Pages ▸ Settings ▸ Variables and Secrets add <code>GOOGLE_PLACES_KEY</code> as a secret. The public Competitor Finder already uses the same key.</li><li><b>Decision-maker search</b>: create a Serper.dev (or Brave Search API) key and add <code>SERPER_API_KEY</code> (or <code>BRAVE_API_KEY</code>). Without it, decision makers come only from business websites.</li><li><b>PageSpeed</b> (optional): Google Cloud Console, enable PageSpeed Insights API, add <code>PAGESPEED_API_KEY</code>.</li><li><b>Scheduled searches</b> run through the existing daily scheduler (GitHub Actions calling /api/monitor/tick), one search per run.</li><li>Nothing here turns on a paid plan by itself. Each paid API bills only when its key is added and used.</li></ol></div>' +
        '<div class="ad-grid2"><div class="panel ad-card"><h2>Recent errors</h2>' + (j.errors.length ? '<ul class="ad-li-ul">' + j.errors.map(function (e) { return "<li>" + esc(e.detail) + '<small class="muted ad-li-sub">' + date(e.at, true) + "</small></li>"; }).join("") + "</ul>" : '<p class="muted">No errors.</p>') + "</div>" +
        '<div class="panel ad-card"><h2>Activity</h2>' + (a.ok && a.items.length ? '<ul class="ad-li-ul">' + a.items.slice(0, 40).map(function (e) { return "<li><b>" + esc(e.kind.replace(/_/g, " ")) + "</b> " + (e.business_id ? '<a href="#li-lead/' + esc(e.business_id) + '">' + esc(e.business_id) + "</a> " : "") + esc(e.detail || "") + '<small class="muted ad-li-sub">' + date(e.at, true) + " · " + esc(e.by_email || "") + "</small></li>"; }).join("") + "</ul>" : '<p class="muted">No activity yet.</p>') + "</div></div>";
      $$("[data-lt]").forEach(function (b) { b.onclick = function () { var k = b.dataset.lt, out = $("#lt-" + k); b.disabled = true; out.textContent = "Testing…"; api("li/test/" + encodeURIComponent(k), {}).then(function (r) { b.disabled = false; out.textContent = r.ok ? "OK · " + (r.detail || "") : (r.reason || "Failed"); out.className = "ad-li-sub " + (r.ok ? "ad-li-ok" : "ad-li-bad"); }); }; });
    });
  }

  /* ---------- v55.6 Outreach desk: message a lead on its own channels from your own apps (nothing is sent by the server) ---------- */
  var LDR = { whatsapp: "whatsapp", email: "email", linkedin: "linkedin", instagram: "dm", facebook: "dm", x: "dm" };
  var LBEST = ["whatsapp", "email", "linkedin", "instagram", "facebook", "x"];
  var LOPEN = { whatsapp: "Open WhatsApp", email: "Open in Gmail", linkedin: "Copy & open LinkedIn", instagram: "Copy & open Instagram", facebook: "Copy & open Facebook", x: "Copy & open X" };
  function liCopy(t) { return navigator.clipboard ? navigator.clipboard.writeText(t).then(function () { return true; }, function () { return false; }) : Promise.resolve(false); }
  function liOpen(c, text) {
    var u = ""; if (c.channel !== "email") text = String(text).replace(/^\s*Subject:[^\n]*\n+/i, "");
    if (c.channel === "whatsapp") u = "https://wa.me/" + encodeURIComponent(c.target) + "?text=" + encodeURIComponent(text);
    else if (c.channel === "email") { var m = String(text).match(/^\s*Subject:\s*(.+)\n+([\s\S]*)$/i), su = m ? m[1].trim() : "", body = m ? m[2].trim() : text;
      u = "https://mail.google.com/mail/?authuser=" + encodeURIComponent("anmol@fodo.co.in") + "&view=cm&fs=1&to=" + encodeURIComponent(c.target) + "&su=" + encodeURIComponent(su) + "&body=" + encodeURIComponent(body); }
    else u = /^https?:\/\//.test(c.target) ? c.target : "";
    if (c.channel !== "whatsapp" && c.channel !== "email") liCopy(text).then(function (ok) { toast(ok ? "Message copied. Paste it in the chat and send." : "Copy the message from the box, then paste it in the chat.", !ok); });
    if (u) window.open(u, "_blank", "noopener");
  }
  function liSent(id, ch, note) { return api("li/sent/" + encodeURIComponent(id), { channel: ch, note: note || "" }); }
  function liDraft(id, ch) { return api("li/drafts/" + encodeURIComponent(id), { channel: ch }); }
  /* lead page panel: every platform side by side; ones research did not find can still be drafted and searched */
  var LPLAT = [["whatsapp", "WhatsApp"], ["email", "Email"], ["instagram", "Instagram"], ["facebook", "Facebook"], ["linkedin", "LinkedIn"], ["x", "X"]];
  function liChans(j) { var C = j.channels || []; return LPLAT.filter(function (p) { return p[0] !== "x" || C.some(function (c) { return c.channel === "x"; }); }).map(function (p) { return C.find(function (c) { return c.channel === p[0]; }) || { channel: p[0], label: p[1], target: "", missing: true }; }); }
  var lfind = function (x, ch) { return "https://www.google.com/search?q=" + encodeURIComponent([String(x.name).split(/\s[|\-–]\s|,/)[0], x.locality || x.city, { whatsapp: "whatsapp number", email: "email", instagram: "instagram", facebook: "facebook", linkedin: "linkedin owner", x: "twitter" }[ch]].filter(Boolean).join(" ")); };
  function liMsgPanel(j) {
    var x = j.lead, blocked = x.status === "dnc" || j.opted_out;
    return '<div class="panel ad-card ad-li-msg"><h2>Message this business <small class="muted">one complete message for every platform: what works, what is missing and how FODO fixes it</small></h2>' +
      (blocked ? '<p class="cf-status warn">Do not contact. Messaging is switched off for this business.</p>' :
      '<div class="ad-li-plat" role="group" aria-label="Platforms">' + liChans(j).map(function (c, i) { return '<button type="button" class="ad-li-pb' + (c.missing ? " miss" : "") + '" data-mc="' + i + '" aria-pressed="false"><b>' + esc(c.missing ? LPLAT.find(function (p) { return p[0] === c.channel; })[1] : c.label) + "</b><small>" + esc(c.missing ? "not found yet" : String(c.target).replace(/^https?:\/\/(www\.)?/, "").slice(0, 34)) + "</small></button>"; }).join("") + "</div>" +
      '<div id="ll-mw" hidden></div><p class="muted ad-li-more">More: <button type="button" class="ad-li-lnk" data-dr="followup">follow-up email text</button> · <button type="button" class="ad-li-lnk" data-dr="opener">3 opening lines</button></p>') + "</div>";
  }
  function liEmailBox(x, d, to) {
    var B = d.blocks || {}, f = function (k, label, rows, hint) { return '<label class="ad-dl2" for="le-' + k + '">' + label + (hint ? ' <span class="muted">' + hint + "</span>" : "") + '</label><textarea id="le-' + k + '" class="ad-in ad-ta" rows="' + rows + '">' + esc(B[k] || "") + "</textarea>"; };
    return '<p class="muted" id="ll-drm">' + (d.ai ? "Subject, intro and closing written by AI from the research; findings and numbers come straight from the data. Check before sending." : "Template text built from the research. Edit before sending.") + "</p>" +
      '<div class="ad-li-eg"><div><label class="ad-dl2" for="le-to">To</label><input id="le-to" class="ad-in" value="' + esc(to || "") + '" placeholder="no public email found: type one you have verified">' +
      '<label class="ad-dl2" for="le-subject">Subject</label><input id="le-subject" class="ad-in" maxlength="150" value="' + esc(d.subject || "") + '">' +
      '<label class="ad-dl2" for="le-headline">Headline <span class="muted">*word* = purple italic</span></label><input id="le-headline" class="ad-in" maxlength="120" value="' + esc(B.headline || "") + '">' +
      f("intro", "Intro", 5) + f("items", "What is missing", 5, "one per line: what is missing | why it costs them customers") + f("stats", "Numbers", 2, "value | label, from research") + f("closing", "Closing", 3) +
      '<input type="hidden" id="le-eyebrow" value="' + esc(B.eyebrow || "") + '"><input type="hidden" id="le-cta_text" value="' + esc(B.cta_text || "") + '"><input type="hidden" id="le-cta_link" value="' + esc(B.cta_link || "") + '"></div>' +
      '<div><p class="ad-dl2">Preview</p><iframe id="le-pv" class="ad-li-pv" title="Email preview" sandbox=""></iframe></div></div>' +
      '<div class="ad-acts"><button type="button" class="btn sm ghost" id="le-prev">Update preview</button><button type="button" class="btn sm ghost" id="le-test">Send test to me</button><button type="button" class="btn sm" id="le-send">Send email</button></div>';
  }
  var leRead = function (w) { var g = function (k) { var e = $("#le-" + k, w); return e ? e.value : ""; }; return { to: g("to").trim(), subject: g("subject").trim(), blocks: { eyebrow: g("eyebrow"), headline: g("headline"), intro: g("intro"), items: g("items"), stats: g("stats"), cta_text: g("cta_text"), cta_link: g("cta_link"), closing: g("closing") } }; };
  function leWire(w, id, after) {
    var pv = function () { var m = leRead(w); api("li/email-preview/" + encodeURIComponent(id), m).then(function (r) { if (r.ok) $("#le-pv", w).srcdoc = r.html; else toast(r.reason, true); }); };
    pv(); $("#le-prev", w).onclick = pv;
    $("#le-test", w).onclick = function () { var b = this; b.disabled = true; api("li/email-send/" + encodeURIComponent(id), Object.assign(leRead(w), { test: true })).then(function (r) { b.disabled = false; toast(r.ok ? "Test sent to " + r.sent.to : r.reason, !r.ok); }); };
    $("#le-send", w).onclick = function () { var m = leRead(w), b = this; if (!m.to) return toast("Add the email address first.", true);
      ask({ title: "Send this email to " + m.to + "?", text: "Subject: " + m.subject + "\n\nIt goes from anmol@fodo.co.in in the FODO design, with an unsubscribe link.", ok: "Send email" }).then(function (y) { if (!y) return; b.disabled = true;
        var go = function (ov) { api("li/email-send/" + encodeURIComponent(id), Object.assign(m, { confirm: true, override: !!ov })).then(function (r) { b.disabled = false;
          if (!r.ok && /Send again anyway/.test(r.reason || "")) return ask({ title: "Send again?", text: r.reason, ok: "Send again" }).then(function (z) { if (z) go(true); });
          toast(r.ok ? "Email sent to " + m.to : r.reason, !r.ok); if (r.ok && after) after(r); }); }; go(); }); };
  }
  function liMsgWire(j, reload) {
    var x = j.lead, C = liChans(j), w = $("#ll-mw"), cur = null;
    var show = function (c, kind) {
      cur = c; w.hidden = false; w.innerHTML = '<p class="muted">Writing ' + esc(c ? (LPLAT.find(function (p) { return p[0] === c.channel; }) || [0, ""])[1] : "the") + " message from the research…</p>";
      liDraft(x.id, kind || c.channel).then(function (r) {
        if (!r.ok) { w.innerHTML = '<p class="cf-status warn">' + esc(r.reason) + "</p>"; return; }
        if (c && c.channel === "email") { w.innerHTML = liEmailBox(x, r, c.target); return leWire(w, x.id, function () { reload(); }); }
        w.innerHTML = '<p class="muted" id="ll-drm">' + (c ? (c.missing ? "Not found in research. " : "To " + esc(c.target) + (c.note ? " (" + esc(c.note) + ")" : "") + ". ") : "") + (r.ai ? "AI draft from the research, check before sending." : "Template draft, edit before sending.") + "</p>" +
          '<textarea id="ll-dr" class="ad-in ad-ta" rows="14" aria-label="Message">' + esc(r.text) + "</textarea>" + (r.note ? '<p class="muted">LinkedIn connection requests allow about 300 characters. Send this short note with the request, and the full message once they accept: <button type="button" class="ad-li-lnk" id="ll-note">Copy connection note</button></p>' : "") +
          '<div class="ad-acts">' + (c && !c.missing ? '<button type="button" class="btn sm" id="ll-open">' + LOPEN[c.channel] + "</button>" : "") + (c && c.missing ? '<a class="btn sm ghost" href="' + esc(lfind(x, c.channel)) + '" target="_blank" rel="noopener">Find on Google</a>' : "") + '<button type="button" class="btn sm ghost" id="ll-cp">Copy</button></div>' +
          '<div class="ad-acts ad-li-ok2" id="ll-did" hidden><span>Did you send it?</span><button type="button" class="btn sm" id="ll-yes">Yes, mark as sent</button><button type="button" class="btn sm ghost" id="ll-no">Not sent</button></div>';
        var o = $("#ll-open"); if (o) o.onclick = function () { var t = $("#ll-dr").value.trim(); if (t) { liOpen(cur, t); $("#ll-did").hidden = false; } };
        var nb = $("#ll-note"); if (nb) nb.onclick = function () { liCopy(r.note).then(function (ok) { toast(ok ? "Connection note copied" : r.note); }); };
        $("#ll-cp").onclick = function () { var t = $("#ll-dr").value; liCopy(t).then(function (ok) { if (ok) toast("Copied"); else $("#ll-dr").select(); }); if (cur && cur.missing) $("#ll-did") && ($("#ll-did").hidden = false); };
        var y = $("#ll-yes"); if (y) y.onclick = function () { liSent(x.id, cur.channel, "Sent on " + (cur.label || cur.channel)).then(function (rr) { toast(rr.ok ? "Logged as sent" : rr.reason, !rr.ok); if (rr.ok) reload(); }); };
        var n = $("#ll-no"); if (n) n.onclick = function () { $("#ll-did").hidden = true; };
      });
    };
    $$("[data-mc]").forEach(function (b) { b.onclick = function () { $$("[data-mc]").forEach(function (o) { o.setAttribute("aria-pressed", o === b ? "true" : "false"); }); show(C[+b.dataset.mc]); }; });
    $$(".ad-li-msg [data-dr]").forEach(function (b) { b.onclick = function () { $$("[data-mc]").forEach(function (o) { o.setAttribute("aria-pressed", "false"); }); show(null, b.dataset.dr); }; });
  }
  /* outreach queue: one lead after another, you press Send in your own app, the desk logs it and moves on */
  function liQueue(ids) {
    ask({ title: "Outreach queue: " + ids.length + " leads", text: "Pick the channel. For each lead the message is written for you; you open it in WhatsApp, Gmail or the profile, press Send, then mark it sent here. Leads without that channel, Do not contact and unsubscribed leads are skipped.\n\nChannel: whatsapp, email, linkedin, instagram, facebook, x, or best (first available)", input: "Channel", ok: "Start" }).then(function (chv) {
      if (chv === null) return; chv = String(chv || "best").toLowerCase().trim(); if (["best"].concat(LBEST).indexOf(chv) < 0) return toast("Unknown channel: " + chv, true);
      var w = document.createElement("div"); w.className = "cfx ad-dlg ad-li-q"; document.body.appendChild(w);
      var i = 0, sent = 0, skipped = [], pre = {}, close = function () { w.remove(); toast(sent + " sent, " + skipped.length + " skipped"); route(); };
      var load = function (k) { if (pre[k]) return pre[k]; var id = ids[k];
        return (pre[k] = api("li/lead/" + encodeURIComponent(id)).then(function (j) {
          if (!j.ok) return { id: id, skip: j.reason || "could not open" };
          if (j.lead.status === "dnc" || j.opted_out) return { id: id, name: j.lead.name, skip: "Do not contact" };
          var c = (j.channels || []).filter(function (c) { return chv === "best" ? true : c.channel === chv; }).sort(function (a, b) { return LBEST.indexOf(a.channel) - LBEST.indexOf(b.channel); })[0];
          if (!c) return { id: id, name: j.lead.name, skip: "no " + (chv === "best" ? "public channel" : chv) };
          return liDraft(id, c.channel).then(function (r) { return { id: id, name: j.lead.name, j: j, c: c, d: r, text: r.ok ? r.text || "" : "", ai: r.ai, err: r.ok ? "" : r.reason }; });
        })); };
      var draw = function () {
        if (i >= ids.length) { w.innerHTML = '<div class="cfx-back"></div><div class="cfx-box" role="dialog" aria-modal="true"><h3>Queue finished</h3><p>' + sent + " sent, " + skipped.length + " skipped.</p>" + (skipped.length ? '<ul class="ad-li-ul">' + skipped.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul>" : "") + '<div class="ad-acts"><button type="button" class="btn" data-qx>Close</button></div></div>'; w.querySelector("[data-qx]").onclick = close; return; }
        w.innerHTML = '<div class="cfx-back"></div><div class="cfx-box" role="dialog" aria-modal="true" aria-labelledby="lq-t"><p class="muted">Lead ' + (i + 1) + " of " + ids.length + " · " + sent + ' sent</p><h3 id="lq-t">Loading…</h3></div>';
        load(i).then(function (q) {
          if (i + 1 < ids.length) load(i + 1);   // prepare the next one while you send this one
          if (q.skip) { skipped.push((q.name || q.id) + ": " + q.skip); i++; return draw(); }
          if (q.c.channel === "email" && q.d && q.d.ok) {   // designed email: preview + send straight from the queue (your click is the confirmation)
            w.innerHTML = '<div class="cfx-back"></div><div class="cfx-box ad-li-qb ad-li-qe" role="dialog" aria-modal="true" aria-labelledby="lq-t"><p class="muted">Lead ' + (i + 1) + " of " + ids.length + " · " + sent + " sent · " + skipped.length + ' skipped</p><h3 id="lq-t">' + esc(q.name) + "</h3>" + liEmailBox(q.j.lead, q.d, q.c.target).replace('<button type="button" class="btn sm" id="le-send">Send email</button>', '<button type="button" class="btn sm" id="lq-esend">Send email, next</button><button type="button" class="btn sm ghost" id="lq-skip">Skip</button><button type="button" class="btn sm ghost" id="lq-stop">Stop</button>') + "</div>";
            var pv = function () { api("li/email-preview/" + encodeURIComponent(q.id), leRead(w)).then(function (r) { if (r.ok) $("#le-pv", w).srcdoc = r.html; }); }; pv(); $("#le-prev", w).onclick = pv;
            $("#le-test", w).onclick = function () { api("li/email-send/" + encodeURIComponent(q.id), Object.assign(leRead(w), { test: true })).then(function (r) { toast(r.ok ? "Test sent to " + r.sent.to : r.reason, !r.ok); }); };
            $("#lq-esend", w).onclick = function () { var b = this; b.disabled = true; api("li/email-send/" + encodeURIComponent(q.id), Object.assign(leRead(w), { confirm: true })).then(function (r) { if (r.ok) { sent++; i++; draw(); } else { b.disabled = false; toast(r.reason, true); } }); };
            $("#lq-skip", w).onclick = function () { skipped.push(q.name + ": skipped"); i++; draw(); }; $("#lq-stop", w).onclick = close; return;
          }
          w.innerHTML = '<div class="cfx-back"></div><div class="cfx-box ad-li-qb" role="dialog" aria-modal="true" aria-labelledby="lq-t"><p class="muted">Lead ' + (i + 1) + " of " + ids.length + " · " + sent + " sent · " + skipped.length + ' skipped</p>' +
            '<h3 id="lq-t">' + esc(q.name) + '</h3><p class="muted">' + esc(q.c.label + ": " + q.c.target) + (q.c.note ? " · " + esc(q.c.note) : "") + (q.err ? '<br><span class="ad-li-bad">' + esc(q.err) + "</span>" : "") + "</p>" +
            '<textarea class="ad-in ad-ta" rows="14" id="lq-tx" aria-label="Message">' + esc(q.text) + '</textarea>' +
            '<div class="ad-acts"><button type="button" class="btn" id="lq-open">' + LOPEN[q.c.channel] + '</button><button type="button" class="btn ghost" id="lq-sent" disabled>Sent, next</button><button type="button" class="btn sm ghost" id="lq-skip">Skip</button><button type="button" class="btn sm ghost" id="lq-stop">Stop</button></div>' +
            '<p class="muted">' + (q.ai ? "AI draft, check it before sending." : "Template draft, edit before sending.") + "</p></div>";
          $("#lq-open", w).onclick = function () { var t = $("#lq-tx", w).value.trim(); if (!t) return; liOpen(q.c, t); $("#lq-sent", w).disabled = false; $("#lq-sent", w).classList.remove("ghost"); };
          $("#lq-sent", w).onclick = function () { this.disabled = true; liSent(q.id, q.c.channel, "Sent on " + q.c.label + " (queue)").then(function (r) { if (r.ok) sent++; else skipped.push(q.name + ": " + r.reason); i++; draw(); }); };
          $("#lq-skip", w).onclick = function () { skipped.push(q.name + ": skipped"); i++; draw(); };
          $("#lq-stop", w).onclick = close;
        });
      };
      w.onkeydown = function (e) { if (e.key === "Escape") close(); };
      draw();
    });
  }

  function pitchView() {
    if (ME && !owner()) { $("#ad-view").innerHTML = head("Bulk pitch", "") + '<div class="panel ad-card"><p class="cf-status warn">Only FODO owners and Full-control admins can open Bulk pitch.</p></div>'; return; }
    api("pitch").then(function (j) {
      if (!j.ok) return fail(j);
      var prev = PI || {};
      PI = { list: j.campaigns, defaults: j.defaults, cfg: j.config, me: j.me, sel: prev.sel || (j.campaigns[0] && j.campaigns[0].id) || "", c: null, draft: null, pvEmail: prev.pvEmail || "", load: null, busy: false };
      if (PI.sel) return piOpen(PI.sel); piNew();
    });
  }
  function piNew() { var d = PI.defaults; PI.sel = ""; PI.c = null; PI.load = null; PI.draft = { name: "", subject: d.subject, copy: JSON.parse(JSON.stringify(d.copy)), pres: null, pres_link: "" }; piDraw(); }
  function piOpen(id) {
    api("pitch/" + encodeURIComponent(id)).then(function (j) {
      if (!j.ok) { toast(j.reason || "Could not open the campaign.", true); return piNew(); }
      PI.sel = id; PI.c = j.campaign; PI.draft = { id: id, name: j.campaign.name, subject: j.campaign.subject, copy: JSON.parse(JSON.stringify(j.campaign.copy)), pres: j.campaign.pres, pres_link: j.campaign.pres_link }; piDraw();
    });
  }
  function piCfg() {
    var c = PI.cfg;
    return c.configured ? '<p class="muted ad-or-cfg">Sends with <b>' + esc(c.provider) + "</b>, " + c.batch + " emails per batch, " + (c.delayMs / 1000) + " s between emails. Shared hourly cap with Client Emails: " + c.used + " of " + c.hourly + " used this hour (CLIENT_MAIL_HOURLY). Every email has an unsubscribe link; opted-out addresses are skipped.</p>"
      : '<div class="panel ad-card"><p class="cf-status warn">Email sending is not connected yet. Open <a href="#studio">Studio ▸ Inbox</a> and log in with Google as anmol@fodo.co.in. You can still build the campaign and preview it.</p></div>';
  }
  function piDraw() {
    var D = PI.draft, c = PI.c, s = c ? c.summary : null, cp = D.copy;
    var fld = function (id, label, val, max, rows) { return '<label class="ad-dl2" for="pi-' + id + '">' + label + "</label>" + (rows ? '<textarea id="pi-' + id + '" class="ad-in ad-ta" rows="' + rows + '" data-pc="' + id + '" maxlength="' + max + '">' + esc(val || "") + "</textarea>" : '<input id="pi-' + id + '" class="ad-in" data-pc="' + id + '" maxlength="' + max + '" value="' + esc(val || "") + '">'); };
    var rc = c ? c.recipients : [];
    $("#ad-view").innerHTML = head("Bulk pitch", "Pitch FODO Studio to many prospects at once: one presentation, one email in the FODO design, filled per person with {first_name}, {business_name} and {city}. Test to yourself first, then send in batches.", '<button type="button" class="btn sm" id="pi-new">+ New campaign</button>') + piCfg() +
      '<div class="ad-or-grid">' +
      '<section class="panel ad-card ad-or-cl" aria-label="Campaigns"><div class="ad-or-list">' + (PI.list.length ? PI.list.map(function (x) { return '<button type="button" class="ad-or-ci' + (x.id === PI.sel ? " on" : "") + '" data-pi="' + esc(x.id) + '"><b>' + esc(x.name) + "</b><small>" + x.sent + " of " + x.total + " sent" + (x.failed ? " · " + x.failed + " failed" : "") + "</small><small>" + date(x.updated_at, true) + "</small></button>"; }).join("") : '<p class="muted">No campaigns yet.</p>') + "</div></section>" +
      '<section class="panel ad-card ad-or-ed" aria-label="Campaign">' +
        '<h2 class="ad-or-h3">1 · Campaign</h2>' + fld("name", "Campaign name", D.name, 120) + fld("subject", "Subject (variables allowed)", D.subject, 300) +
        '<div class="ad-or-att"><p class="ad-dl2">Presentation <span class="muted">(PDF up to 10 MB, attached to every email, or a link)</span></p>' +
          (D.pres ? '<div class="ad-or-atl"><span class="ad-or-chip">📎 ' + esc(D.pres.name) + ' <small class="muted">' + kb(D.pres.size) + '</small><button type="button" class="ad-ib" id="pi-px" aria-label="Remove the PDF">×</button></span></div>' : "") +
          (PI.cfg.attach === false ? '<p class="muted">PDF upload needs CHAT_KV storage.</p>' : '<label class="btn sm ghost" for="pi-pf">' + (D.pres ? "Replace PDF" : "+ Upload PDF") + '</label><input type="file" id="pi-pf" class="sr-only" accept="application/pdf,.pdf">') +
          fld("pres_link", "or presentation link (https://)", D.pres_link, 500) + "</div>" +
        '<h2 class="ad-or-h3">Pitch copy</h2>' + fld("eyebrow", "Eyebrow label", cp.eyebrow, 80) + fld("headline", "Headline (*words* = serif italic accent)", cp.headline, 160) + fld("intro", "Intro (blank line = new paragraph, **bold**)", cp.intro, 3000, 5) +
        '<p class="ad-dl2">3 benefit rows</p>' + cp.benefits.map(function (b, i) { return '<div class="ad-pi-ben"><input class="ad-in" data-pb="' + i + '" data-pk="title" maxlength="80" placeholder="Title" aria-label="Benefit ' + (i + 1) + ' title" value="' + esc(b.title) + '"><input class="ad-in" data-pb="' + i + '" data-pk="text" maxlength="200" placeholder="Text" aria-label="Benefit ' + (i + 1) + ' text" value="' + esc(b.text) + '"></div>'; }).join("") +
        fld("stats", "Stat boxes (one per line, Value | label)", cp.stats, 600, 2) + fld("cta_text", "Button text", cp.cta_text, 60) + fld("cta_link", "Button link (https://, mailto: or tel:)", cp.cta_link, 500) + fld("closing", "Closing", cp.closing, 2000, 3) +
        '<p class="muted ad-or-hint">Variables: {first_name} {business_name} {city}. The design, header, "Anmol · FODO" sign-off, footer and unsubscribe link are fixed.</p>' +
        '<div class="btn-row"><button type="button" class="btn" id="pi-save">' + (c ? "Save changes" : "Save campaign") + "</button>" + (c && !c.tested ? '<span class="ad-tag mid">Needs a test send</span>' : c ? '<span class="ad-tag ok">Tested</span>' : "") + "</div>" +
        (c ? '<h2 class="ad-or-h3">2 · Recipients</h2><p class="muted">Paste a list or upload a CSV with columns <b>name, business, email, city</b> (email required). Invalid emails, duplicates and opted-out addresses are skipped. Loading again replaces everyone not yet sent.</p>' +
          '<textarea id="pi-csv" class="ad-in ad-ta" rows="5" maxlength="2000000" placeholder="name,business,email,city&#10;Rahul Mehta,Rahul Gaming,rahul@example.com,Delhi" aria-label="Recipient list"></textarea>' +
          '<div class="btn-row"><label class="btn sm ghost" for="pi-cf">Upload CSV</label><input type="file" id="pi-cf" class="sr-only" accept=".csv,text/csv,text/plain"><label class="ad-pi-ck"><input type="checkbox" id="pi-ov"> Also re-send to people who already got this campaign</label><button type="button" class="btn sm" id="pi-load">Load list</button></div>' +
          (PI.load ? '<p class="ad-pi-counts"><span class="ad-tag ok">' + PI.load.counts.valid + " valid</span> <span class=\"ad-tag bad\">" + PI.load.counts.invalid + " invalid</span> <span class=\"ad-tag\">" + PI.load.counts.duplicate + " duplicate</span> <span class=\"ad-tag\">" + PI.load.counts.opted_out + " opted out</span> <span class=\"ad-tag\">" + PI.load.counts.already_sent + " already sent</span> <span class=\"ad-tag mid\">" + PI.load.counts.queued + " queued</span></p>" +
            (PI.load.invalid.length ? '<p class="muted">Invalid: ' + PI.load.invalid.slice(0, 12).map(function (x) { return "line " + x.line + " (" + esc(x.value || "empty") + ")"; }).join(", ") + "</p>" : "") : "") +
          '<h2 class="ad-or-h3">3 · Send</h2><div class="ad-pi-sum"><span><b>' + s.total + "</b> on the list</span><span><b>" + s.queued + "</b> queued</span><span><b>" + s.sent + "</b> sent</span><span><b>" + s.failed + "</b> failed</span><span><b>" + s.opted_out + "</b> opted out</span><span><b>" + s.unsubscribed + "</b> unsubscribed after</span><span><b>" + (s.opened == null ? "n/a" : s.opened) + "</b> opened</span></div>" +
          (s.total ? '<div class="ad-pi-bar" role="progressbar" aria-label="Sent" aria-valuemin="0" aria-valuemax="' + s.total + '" aria-valuenow="' + s.sent + '"><i style="width:' + Math.round(100 * s.sent / Math.max(1, s.total)) + '%"></i></div>' : "") +
          '<p id="pi-prog" class="muted" aria-live="polite"></p>' +
          '<div class="btn-row"><button type="button" class="btn ghost" id="pi-test">Send a test to me</button><button type="button" class="btn" id="pi-send"' + (c.tested && s.queued && PI.cfg.configured ? "" : " disabled") + ">Send to " + s.queued + " people…</button>" + (s.failed ? '<button type="button" class="btn ghost" id="pi-retry">Retry ' + s.failed + " failed</button>" : "") + "</div>" +
          (c.tested ? "" : '<p class="muted">The real send unlocks after a test to your own email (and again after any change).</p>') : '<p class="muted">Save the campaign to add recipients.</p>') +
      "</section>" +
      '<section class="panel ad-card ad-or-pvw" aria-label="Preview"><p class="ad-dl2">Preview for <select id="pi-pvsel" class="ad-in ad-pi-pvs" aria-label="Preview for recipient">' + (rc.length ? rc.slice(0, 300).map(function (r) { return '<option value="' + esc(r.email) + '"' + (r.email === PI.pvEmail ? " selected" : "") + ">" + esc((r.business || r.name || r.email) + " · " + r.email) + "</option>"; }).join("") : '<option value="">Sample prospect</option>') + '</select> <span id="pi-pvs" class="muted"></span></p><p id="pi-empty" class="cf-status warn" hidden></p><iframe id="pi-pv" class="ad-cp-pv" title="Email preview" sandbox=""></iframe></section>' +
      "</div>" + piLog(rc);
    var on = function (sel, fn) { var el = $(sel); if (el) el.onclick = fn; };
    on("#pi-new", piNew);
    $$("[data-pi]").forEach(function (b) { b.onclick = function () { PI.load = null; piOpen(b.dataset.pi); }; });
    $$("[data-pc]").forEach(function (el) { el.oninput = function () { var k = el.dataset.pc; if (k === "name" || k === "subject" || k === "pres_link") D[k] = el.value; else D.copy[k] = el.value; piPreview(); }; });
    $$("[data-pb]").forEach(function (el) { el.oninput = function () { D.copy.benefits[+el.dataset.pb][el.dataset.pk] = el.value; piPreview(); }; });
    on("#pi-px", function () { D.pres = null; piDraw(); });
    var pf = $("#pi-pf"); if (pf) pf.onchange = function () { var f = this.files && this.files[0]; this.value = ""; if (!f) return;
      if (!/\.pdf$/i.test(f.name)) return toast("The presentation must be a PDF.", true); if (f.size > 10 * 1048576) return toast(f.name + " is over 10 MB.", true);
      toast("Uploading " + f.name + "…"); readB64(f).then(function (b64) { return api("pitch/pres", { file: b64, name: f.name, mime: "application/pdf" }); }).then(function (j) { if (!j.ok) return toast(j.reason || "Could not upload the PDF.", true); D.pres = j.attachment; toast("PDF ready. Save the campaign to keep it."); piDraw(); }); };
    on("#pi-save", function () { api("pitch/save", { id: D.id, name: D.name, subject: D.subject, copy: D.copy, pres: D.pres ? { id: D.pres.id } : null, pres_link: D.pres_link }).then(function (j) {
      if (!j.ok) return toast(j.reason || "Could not save.", true); toast("Saved" + (j.campaign.tested ? "" : ". Send a test before the real send.")); PI.sel = j.campaign.id;
      api("pitch").then(function (k) { if (k.ok) { PI.list = k.campaigns; PI.cfg = k.config; } piOpen(PI.sel); }); }); });
    var cf = $("#pi-cf"); if (cf) cf.onchange = function () { var f = this.files && this.files[0]; this.value = ""; if (!f) return; if (f.size > 2 * 1048576) return toast("The CSV can be up to 2 MB.", true); var r = new FileReader(); r.onload = function () { $("#pi-csv").value = String(r.result || ""); toast(f.name + " read. Press Load list."); }; r.readAsText(f); };
    on("#pi-load", function () { var v = $("#pi-csv").value; if (!v.trim()) return toast("Paste a list or upload a CSV first.", true);
      api("pitch/" + encodeURIComponent(PI.sel) + "/recipients", { csv: v, override: $("#pi-ov").checked }).then(function (j) { if (!j.ok) return toast(j.reason || "Could not load the list.", true); PI.load = j; PI.c = j.campaign; toast(j.counts.queued + " queued"); piDraw(); }); });
    var ps = $("#pi-pvsel"); if (ps) ps.onchange = function () { PI.pvEmail = this.value; piPreview(true); };
    on("#pi-test", piTest); on("#pi-send", piSend);
    on("#pi-retry", function () { api("pitch/" + encodeURIComponent(PI.sel) + "/retry", {}).then(function (j) { if (!j.ok) return toast(j.reason || "Could not retry.", true); PI.c = j.campaign; toast(j.requeued + " back in the queue. Press Send to continue."); piDraw(); }); });
    piPreview(true);
  }
  function piPreview(now) {
    clearTimeout(piPt);
    piPt = setTimeout(function () { var D = PI.draft, c = PI.c, dirty = !c || JSON.stringify([D.name, D.subject, D.copy, D.pres && D.pres.id, D.pres_link]) !== JSON.stringify([c.name, c.subject, c.copy, c.pres && c.pres.id, c.pres_link]);
      var req = dirty ? api("pitch/preview", { subject: D.subject, copy: D.copy, pres: D.pres, pres_link: D.pres_link }) : api("pitch/" + encodeURIComponent(PI.sel) + "/preview", { email: PI.pvEmail || "" });
      req.then(function (j) { var f = $("#pi-pv"), s = $("#pi-pvs"), e = $("#pi-empty"); if (!f) return;
        if (!j.ok) { if (s) s.textContent = "· " + (j.reason || "Could not build the preview."); return; }
        f.srcdoc = j.html; if (s) s.textContent = "· " + j.subject + (dirty && c ? " (unsaved changes, sample prospect)" : "");
        if (e) { e.hidden = !j.empty.length; e.textContent = j.empty.length ? "Empty for this person: " + j.empty.map(function (x) { return "{" + x + "}"; }).join(", ") : ""; } }); }, now ? 0 : 450);
  }
  function piTest() {
    ask({ title: "Send a test email", text: "You get exactly what a prospect gets, filled for the person picked in the preview, with the presentation attached and [TEST] in the subject. Nobody on the list gets anything.", input: "Send the test to", ph: PI.me, ok: "Send test" }).then(function (v) {
      if (v === null) return; toast("Sending the test…");
      api("pitch/" + encodeURIComponent(PI.sel) + "/test", { to: v === true || !v ? PI.me : v, email: PI.pvEmail || "" }).then(function (j) { if (!j.ok) return toast(j.reason || "The test was not sent.", true); PI.c = j.campaign; toast("Test sent to " + j.test.to + ". The real send is now unlocked."); piDraw(); });
    });
  }
  function piSend() {
    var c = PI.c, n = c.summary.queued; if (!n) return;
    api("pitch/" + encodeURIComponent(PI.sel) + "/preview", { email: PI.pvEmail || "" }).then(function (j) {
      if (!j.ok) return toast(j.reason || "Could not build the email.", true);
      var w = document.createElement("div"); w.className = "cfx ad-dlg";
      w.innerHTML = '<div class="cfx-back" data-x></div><div class="cfx-box" role="dialog" aria-modal="true" aria-labelledby="pi-ct"><h3 id="pi-ct">Send this pitch?</h3>' +
        '<dl class="ad-or-conf"><dt>Recipients</dt><dd>' + n + " people</dd><dt>Subject</dt><dd>" + esc(c.subject) + '<br><small class="muted">e.g. ' + esc(j.subject) + "</small></dd><dt>Attachments</dt><dd>" + (j.attachments.length ? j.attachments.map(function (a) { return "📎 " + esc(a.name) + " (" + kb(a.size) + ")"; }).join("<br>") : "None (presentation link in the email)") + "</dd><dt>Type</dt><dd>Marketing · unsubscribe link and List-Unsubscribe header on every email</dd></dl>" +
        '<p class="cf-status warn">This sends to ' + n + " people and cannot be unsent.</p><p class=\"muted\">Goes out in batches of " + PI.cfg.batch + ", " + (PI.cfg.delayMs / 1000) + " s apart. Keep this page open; if the hourly cap is reached the rest waits in the queue.</p>" +
        '<div class="btn-row"><button type="button" class="btn" data-ok>Yes, send to ' + n + ' people</button><button type="button" class="btn ghost" data-x>Cancel</button></div></div>';
      document.body.appendChild(w); var close = function () { w.remove(); };
      $$("[data-x]", w).forEach(function (b) { b.onclick = close; }); w.onkeydown = function (e) { if (e.key === "Escape") close(); };
      $("[data-ok]", w).onclick = function () { close(); piRun(); }; setTimeout(function () { $("[data-x].btn", w).focus(); }, 30);
    });
  }
  function piRun() {
    if (PI.busy) return; PI.busy = true; var id = PI.sel, b = $("#pi-send"); if (b) b.disabled = true;
    var step = function () {
      api("pitch/" + encodeURIComponent(id) + "/send", { confirm: true }).then(function (j) {
        if (!j.ok) { PI.busy = false; toast(j.reason || "Sending stopped.", true); return piOpen(id); }
        PI.c = j.campaign; if (j.used != null) PI.cfg.used = j.used; var s = j.campaign.summary, p = $("#pi-prog");
        if (PI.sel === id) { var bar = $(".ad-pi-bar i"); if (bar) bar.style.width = Math.round(100 * s.sent / Math.max(1, s.total)) + "%"; if (p) p.textContent = "Queued " + s.queued + " · sent " + s.sent + " · failed " + s.failed; }
        if (j.paused) { PI.busy = false; toast(j.reason, true); return piOpen(id); }
        if (j.more) return step();
        PI.busy = false; toast("Done: " + s.sent + " sent" + (s.failed ? ", " + s.failed + " failed" : "")); api("pitch").then(function (k) { if (k.ok) { PI.list = k.campaigns; PI.cfg = k.config; } piOpen(id); });
      });
    };
    step();
  }
  function piLog(rc) {
    if (!PI.c) return "";
    return '<h2 class="ad-or-h2">Send log</h2>' + (rc.length ? '<div class="ad-table"><table><thead><tr><th>Recipient</th><th>Business</th><th>City</th><th>Status</th><th>When</th></tr></thead><tbody>' + rc.map(function (r) { var st = PI_ST[r.status] || [r.status, ""];
      return "<tr><td>" + esc(r.name || "-") + '<br><small class="muted">' + esc(r.email) + "</small></td><td>" + esc(r.business || "-") + "</td><td>" + esc(r.city || "-") + '</td><td><span class="ad-tag ' + st[1] + '">' + st[0] + "</span>" + (r.error ? '<br><small class="muted">' + esc(r.error) + "</small>" : "") + (r.provider_id ? '<br><small class="muted">id ' + esc(r.provider_id) + "</small>" : "") + "</td><td>" + (r.at ? date(r.at, true) : "") + (r.send_id ? ' <a class="btn sm ghost" href="/api/admin/outreach/sends/' + encodeURIComponent(r.send_id) + '/html" target="_blank" rel="noopener">View</a>' : "") + "</td></tr>"; }).join("") + "</tbody></table></div>"
      : '<div class="panel ad-card"><p class="muted">No recipients yet.</p></div>');
  }
  function orClientForm(c) {
    var x = c || { status: "lead" }, w = document.createElement("div"); w.className = "cfx ad-dlg";
    w.innerHTML = '<div class="cfx-back" data-x></div><div class="cfx-box ad-cp-dlg" role="dialog" aria-modal="true" aria-labelledby="or-ft"><h3 id="or-ft">' + (c ? "Edit client" : "New client") + '</h3><div class="ad-or-form">' +
      OR_F.map(function (f) { return '<label><span class="ad-dl2">' + f[1] + '</span><input class="ad-in" data-cf="' + f[0] + '" maxlength="' + (f[0] === "email" ? 254 : 160) + '"' + (f[0] === "email" ? ' type="email"' : "") + ' value="' + esc(x[f[0]] || "") + '"></label>'; }).join("") +
      '<label><span class="ad-dl2">Status</span><select class="ad-in" data-cf="status">' + OR.statuses.map(function (s) { return '<option value="' + s + '"' + (s === x.status ? " selected" : "") + ">" + s + "</option>"; }).join("") + "</select></label></div>" +
      '<label class="ad-dl2" for="or-fp">Pricing rows for {pricing} (one per line, Label | value)</label><textarea id="or-fp" class="ad-in ad-ta" rows="3" data-cf="pricing" maxlength="2000">' + esc(x.pricing || "") + "</textarea>" +
      '<label class="ad-dl2" for="or-fn">Notes</label><textarea id="or-fn" class="ad-in ad-ta" rows="3" data-cf="notes" maxlength="4000">' + esc(x.notes || "") + "</textarea>" +
      '<p id="or-fe" class="cf-status warn" hidden></p><div class="btn-row"><button type="button" class="btn" data-ok>Save client</button><button type="button" class="btn ghost" data-x>Cancel</button></div></div>';
    document.body.appendChild(w); var close = function () { w.remove(); };
    $$("[data-x]", w).forEach(function (b) { b.onclick = close; }); w.onkeydown = function (e) { if (e.key === "Escape") close(); };
    $("[data-ok]", w).onclick = function () { var b = { id: c ? c.id : undefined }; $$("[data-cf]", w).forEach(function (el) { b[el.dataset.cf] = el.value; });
      api("outreach/clients", b).then(function (j) { if (!j.ok) { var e = $("#or-fe", w); e.hidden = false; e.textContent = j.reason || "Could not save."; return; }
        close(); toast("Saved " + (j.client.business || j.client.name)); OR.sel = j.client.id; OR.q = ""; api("outreach/clients").then(function (k) { if (k.ok) { OR.clients = k.clients; orDraw(); } }); }); };
    setTimeout(function () { $("[data-cf]", w).focus(); }, 30);
  }

  /* ---------- v53.8 Email campaigns (owners): Excel/CSV list → one personal email each, from FODO's Gmail, with an attachment ---------- */
  var CP_BODY = "Hi {first_name},\n\nI'm Anmol from FODO (fodo.co.in), a digital growth studio in New Delhi.\n\nWe built FODO Studio for our own client work, and now we're opening it up: one calendar for every social account, one inbox for comments, client approval links and reports, plus AI clipping that turns long videos into captioned short clips on your own computer.\n\nI've attached a short PDF with what it does and how to install it (one line on Windows or Mac).\n\nIf you'd like to try it, just reply to this email and I'll send your personal key. Pricing is on request.\n\nAnmol Singh\nFODO · www.fodo.co.in · WhatsApp +91 78270 07676";
  var CP_ST = { pending: ["Waiting", ""], sent: ["Sent", "ok"], failed: ["Failed", "bad"], skipped: ["Skipped", ""], replied: ["Replied", "mid"], stopped: ["Opted out", "bad"] };
  var CP_CS = { draft: ["Draft", ""], sending: ["Sending", "mid"], paused: ["Paused", ""], done: ["Finished", "ok"] };
  var cpTimer = null;
  var cpk = function (n, l, sub, c) { return '<div class="ad-kpi ' + (c || "") + '"><b>' + n + "</b><span>" + l + "</span>" + (sub ? "<small>" + sub + "</small>" : "") + "</div>"; };
  var readB64 = function (file) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(",")[1] || ""); }; r.onerror = function () { rej(new Error("Could not read the file.")); }; r.readAsDataURL(file); }); };
  var kb = function (n) { return n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; };
  function cpSender(j) {
    var s = j.sender || {};
    if (!s.via) return '<div class="panel ad-card"><p class="cf-status warn">' + esc(s.reason || "Email is not connected.") + ' <a href="#studio">Open Studio ▸ Inbox</a></p></div>';
    return '<p class="muted ad-cp-from">Sends from <b>' + esc(s.via === "gmail" ? s.account : "Resend (anmol@fodo.co.in)") + "</b>" + (s.via === "gmail" ? ", so replies come to that inbox." : ". Connect Gmail in Studio ▸ Inbox to see replies here.") + " Today: " + (j.today || 0) + " of " + (j.cap || 0) + " daily limit used.</p>";
  }
  function campaignsView(id) {
    clearTimeout(cpTimer);
    if (ME && ME.role !== "owner") { $("#ad-view").innerHTML = head("Email campaigns", "") + '<div class="panel ad-card"><p class="cf-status warn">Only FODO owners can send email campaigns.</p></div>'; return; }
    if (id === "new") return cpNew();
    if (id) return cpDetail(id);
    api("campaigns").then(function (j) {
      if (!j.ok) return fail(j);
      $("#ad-view").innerHTML = head("Email campaigns", "Upload an Excel or CSV list, write one message, attach a file and send. Everyone gets their own email; replies come to your inbox.", '<a class="btn sm" href="#campaigns/new">+ New campaign</a>') + cpSender(j) +
        (j.items.length ? '<div class="ad-table"><table><thead><tr><th>Campaign</th><th>Status</th><th>Sent</th><th>Replied</th><th>Created</th></tr></thead><tbody>' + j.items.map(function (c) { var st = CP_CS[c.status] || [c.status, ""], k = c.counts;
          return '<tr data-cp="' + esc(c.id) + '" tabindex="0"><td><b>' + esc(c.name) + "</b><br><small class=\"muted\">" + esc(c.subject) + (c.attachment ? " · 📎 " + esc(c.attachment.name) : "") + '</small></td><td><span class="ad-tag ' + st[1] + '">' + st[0] + "</span></td><td>" + k.delivered + " / " + k.total + "</td><td>" + (k.replied || 0) + (k.stopped ? ' <small class="muted">+' + k.stopped + " STOP</small>" : "") + "</td><td>" + date(c.created_at) + "</td></tr>"; }).join("") + "</tbody></table></div>"
          : '<div class="panel ad-card"><p>No campaigns yet.</p><a class="btn" href="#campaigns/new">Make the first one</a></div>') +
        (j.optedOut ? '<p class="muted" style="margin-top:12px">' + j.optedOut + " people asked not to be emailed. They are skipped in every campaign.</p>" : "");
      $$("[data-cp]").forEach(function (r) { var go = function () { location.hash = "campaigns/" + r.dataset.cp; }; r.onclick = go; r.onkeydown = function (e) { if (e.key === "Enter") go(); }; });
    });
  }
  var CP_BRIEF = "Introduce FODO Studio, the tool FODO built for its own client work: one calendar for every social account (Instagram, Facebook, YouTube and more), one inbox for comments, client approval links and reports, plus AI clipping that turns long videos into captioned short clips on their own computer. A short PDF is attached with what it does and how to install it (one line on Windows or Mac). Ask them to reply to this email to get their personal key. Pricing is on request.";
  function cpNew() {
    var sheet = null, att = null;
    $("#ad-view").innerHTML = head("New email campaign", '<a href="#campaigns">← All campaigns</a>') +
      '<div class="panel ad-card ad-cp"><h2>1. Upload your client sheet</h2><p class="muted">Excel (.xlsx) or CSV with an email column. Every column is kept (name, company, work, city, notes…) and shown like a CRM. Duplicates, wrong emails and people who said STOP are left out.</p>' +
      '<input type="file" id="cp-sheet" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Excel or CSV file"><div id="cp-prev"></div></div>' +
      '<div class="panel ad-card ad-cp"><h2>2. What is this email about?</h2><p class="muted">AI writes every person their own subject and message from this, using their name and their work from the sheet. You review and edit everything before anything is sent. Each email ends with "Regards, Team FODO".</p>' +
      '<label class="ad-dl2" for="cp-name">Campaign name (only you see it)</label><input id="cp-name" class="ad-in" maxlength="120" value="FODO Studio pitch">' +
      '<label class="ad-dl2" for="cp-eb">Small label on the email</label><input id="cp-eb" class="ad-in" maxlength="40" value="FODO Studio">' +
      '<label class="ad-dl2" for="cp-brief">The offer / what to tell them</label><textarea id="cp-brief" class="ad-in ad-ta ad-cp-ta" rows="7" maxlength="3000"></textarea></div>' +
      '<div class="panel ad-card ad-cp"><h2>3. Attach a file (optional)</h2><p class="muted">Any file up to 10 MB: the FODO Studio pitch PDF, a deck, a brochure. You can change it later too.</p><input type="file" id="cp-att" aria-label="Attachment"><div id="cp-attn" class="muted"></div></div>' +
      '<div class="btn-row"><button type="button" class="btn" id="cp-save" disabled>Save and see the clients</button><a class="btn ghost" href="#campaigns">Cancel</a></div><p class="muted">Saving does not send anything.</p>';
    $("#cp-brief").value = CP_BRIEF;
    var ready = function () { $("#cp-save").disabled = !(sheet && sheet.valid); };
    $("#cp-sheet").onchange = function () {
      var f = this.files[0]; sheet = null; ready(); if (!f) return;
      if (f.size > 8 * 1048576) { $("#cp-prev").innerHTML = '<p class="cf-status warn">The sheet can be up to 8 MB.</p>'; return; }
      $("#cp-prev").innerHTML = '<p class="muted">Reading ' + esc(f.name) + "…</p>";
      readB64(f).then(function (b64) { return api("campaigns/parse", { file: b64, filename: f.name }).then(function (j) {
        if (!j.ok) { $("#cp-prev").innerHTML = '<p class="cf-status warn">' + esc(j.reason) + "</p>"; return; }
        sheet = { b64: b64, name: f.name, valid: j.valid };
        $("#cp-prev").innerHTML = '<div class="ad-kpis ad-cp-k">' + cpk(j.valid, "clients found", "", "ok") + cpk(j.duplicates, "duplicates") + cpk(j.invalid, "wrong emails") + cpk(j.optedOut, "said STOP before") + "</div>" +
          '<p class="muted">Email = <b>' + esc(j.columns.email) + "</b>" + (j.columns.name ? " · name = <b>" + esc(j.columns.name) + "</b>" : " · no name column") + (j.columns.company ? " · company = <b>" + esc(j.columns.company) + "</b>" : "") + (j.columns.work ? " · work = <b>" + esc(j.columns.work) + "</b>" : " · no work column (add one like Work, Role or Business type for better messages)") + (j.headers && j.headers.length ? " · " + j.headers.length + " columns kept" : "") + (j.truncated ? " · only the first 5,000 are used" : "") + ".</p>";
        ready();
      }); }).catch(function (e) { $("#cp-prev").innerHTML = '<p class="cf-status warn">' + esc(e.message) + "</p>"; });
    };
    $("#cp-att").onchange = function () {
      var f = this.files[0]; att = null; $("#cp-attn").textContent = ""; if (!f) return;
      if (f.size > 10 * 1048576) { $("#cp-attn").textContent = "The attachment can be up to 10 MB."; this.value = ""; return; }
      readB64(f).then(function (b64) { att = { b64: b64, name: f.name, mime: f.type || "" }; $("#cp-attn").textContent = "📎 " + f.name + " (" + kb(f.size) + ")"; });
    };
    $("#cp-save").onclick = function () {
      var btn = this; btn.disabled = true; btn.textContent = "Saving…";
      api("campaigns", { name: $("#cp-name").value, eyebrow: $("#cp-eb").value, brief: $("#cp-brief").value, file: sheet.b64, filename: sheet.name, att: att ? att.b64 : "", att_name: att ? att.name : "", att_mime: att ? att.mime : "" }).then(function (j) {
        if (!j.ok) { btn.disabled = false; btn.textContent = "Save and see the clients"; return toast(j.reason || "Could not save.", true); }
        toast("Saved: " + j.counts.total + " clients"); location.hash = "campaigns/" + j.campaign.id;
      });
    };
  }
  function cpDetail(id) {
    var data = null, filt = "", qtext = "", sending = false, writing = false, chosen = {};
    var url = function () { return "campaigns/" + encodeURIComponent(id) + "?status=" + encodeURIComponent(filt) + "&q=" + encodeURIComponent(qtext); };
    function load() { return api(url()).then(function (j) { if (!j.ok) return fail(j); data = j; draw(); return j; }); }
    function act(b, okMsg, quiet) { return api("campaigns/" + encodeURIComponent(id), b).then(function (j) { if (!j.ok) { toast(j.reason || "Could not do that.", true); return null; } if (j.campaign && j.recipients) { data = j; if (!quiet) draw(); } else if (j.counts && data) { data.counts = j.counts; } if (okMsg) toast(okMsg); return j; }); }
    function writeLoop() {
      if (!writing || location.hash.indexOf("#campaigns/" + id) !== 0) { writing = false; return; }
      act({ action: "write", view: { status: filt, q: qtext } }).then(function (j) {
        if (!j) { writing = false; draw(); return; }
        if (j.more) return setTimeout(writeLoop, 200);
        writing = false; draw(); toast(j.counts.toWrite ? j.counts.toWrite + " could not be written. Press Write again or write them yourself." : "Every selected client has their own message. Review them, then send.");
      });
    }
    function sendLoop() {
      if (!sending || location.hash.indexOf("#campaigns/" + id) !== 0) { sending = false; return; }
      act({ action: "batch" }).then(function (j) {
        if (!j) { sending = false; draw(); return; }
        if (j.stop === "done") { sending = false; load(); toast("All selected clients have been emailed."); return; }
        if (j.stop === "daily_limit") { sending = false; draw(); return ask({ title: "Daily limit reached", text: "Today's " + j.cap + " emails are used up, so sending stopped to keep the mailbox safe. Open this campaign tomorrow and press Send again.", ok: "OK" }); }
        if (j.stop === "provider_limit") { sending = false; act({ action: "pause" }); return ask({ title: "Gmail asked to slow down", text: (j.reason || "") + " Wait a while (an hour is safe), then send again.", ok: "OK" }); }
        if (j.stop === "not_sending") { sending = false; draw(); return; }
        cpTimer = setTimeout(sendLoop, 1500);
      });
    }
    function startSend(all) {
      var c = data.campaign, k = data.counts;
      var go = function () { act({ action: "start" }).then(function (j) { if (j) { sending = true; draw(); sendLoop(); } }); };
      var n = all ? k.pending : k.selectedPending, unwritten = data.counts.toWrite;
      if (!n) return toast(all ? "Nobody is waiting to be emailed." : "Tick the clients you want to email first.", true);
      ask({ title: "Email " + n + " client" + (n === 1 ? "" : "s") + " now?", text: "Each person gets their own email from " + (data.sender && data.sender.account || "FODO") + (c.attachment ? " with " + c.attachment.name : "") + "." + (unwritten ? " " + unwritten + " of them have no personal message yet and will get your template." : "") + " Keep this page open while it sends. Up to " + data.cap + " a day.", ok: "Send " + n + " emails" }).then(function (v) {
        if (!v) return;
        if (all) act({ action: "select", all: true, sel: 1 }, "", true).then(function (j) { if (j) go(); }); else go();
      });
    }
    function review(r) {
      var w = document.createElement("div"); w.className = "cfx ad-dlg";
      w.innerHTML = '<div class="cfx-back" data-x></div><div class="cfx-box ad-cp-rv" role="dialog" aria-modal="true" aria-labelledby="cp-rt"><div class="ad-cp-rvh"><h3 id="cp-rt">' + esc(r.name || r.email) + '</h3><button type="button" class="ad-ib" data-x aria-label="Close">×</button></div>' +
        '<p class="muted">' + esc([r.email, r.work, r.company].filter(Boolean).join(" · ")) + "</p>" +
        '<div class="ad-cp-rvg"><div><dl class="ad-cp-f">' + Object.keys(r.fields || {}).map(function (k) { return "<dt>" + esc(k) + "</dt><dd>" + esc(r.fields[k]) + "</dd>"; }).join("") + "</dl>" +
        '<label class="ad-dl2" for="rv-s">Subject</label><input id="rv-s" class="ad-in" maxlength="200"><label class="ad-dl2" for="rv-b">Message</label><textarea id="rv-b" class="ad-in ad-ta" rows="12" maxlength="20000"></textarea>' +
        '<p class="muted">"Regards, Team FODO", the attachment and the FODO design are added automatically.</p><div class="btn-row"><button type="button" class="btn" id="rv-save">Save</button><button type="button" class="btn ghost" id="rv-ai">✦ Rewrite with AI</button><button type="button" class="btn ghost" id="rv-test">Send me this one</button></div></div>' +
        '<div><p class="ad-dl2">Preview</p><iframe id="rv-pv" class="ad-cp-pv" title="Email preview" sandbox=""></iframe></div></div></div>';
      document.body.appendChild(w);
      var S = $("#rv-s", w), B = $("#rv-b", w), close = function () { w.remove(); };
      S.value = r.subject || ""; B.value = r.body || "";
      var pv = function () { api("campaigns/" + encodeURIComponent(id), { action: "preview", rid: r.id, subject: S.value || null, body: B.value || null }).then(function (j) { if (j.ok) $("#rv-pv", w).srcdoc = j.html; }); }, pt;
      S.oninput = B.oninput = function () { clearTimeout(pt); pt = setTimeout(pv, 500); }; pv();
      $$("[data-x]", w).forEach(function (b) { b.onclick = close; }); w.onkeydown = function (e) { if (e.key === "Escape") close(); };
      $("#rv-save", w).onclick = function () { act({ action: "recip", rid: r.id, subject: S.value, body: B.value }, "Saved", true).then(function (j) { if (j) { r.subject = S.value; r.body = B.value; r.ai = "edited"; close(); draw(); } }); };
      $("#rv-ai", w).onclick = function () { var b = this; b.disabled = true; b.textContent = "Writing…"; act({ action: "write", rid: r.id, view: { status: filt, q: qtext } }, "", true).then(function (j) { b.disabled = false; b.textContent = "✦ Rewrite with AI"; if (!j) return; var n = (j.recipients || []).filter(function (x) { return x.id === r.id; })[0]; if (n && n.subject) { S.value = n.subject; B.value = n.body; r.subject = n.subject; r.body = n.body; r.ai = n.ai; pv(); } else toast("The AI didn't answer. Try again.", true); }); };
      $("#rv-test", w).onclick = function () { act({ action: "recip", rid: r.id, subject: S.value, body: B.value }, "", true).then(function (j) { if (j) act({ action: "test", rid: r.id, to: ME.email }).then(function (k) { if (k) toast("Sent to " + k.to + " exactly as " + (r.name || r.email) + " will get it"); }); }); };
      setTimeout(function () { S.focus(); }, 30);
    }
    function draw() {
      var c = data.campaign, k = data.counts, st = CP_CS[c.status] || [c.status, ""], R = data.recipients || [], cols = (c.cols || []).filter(function (h) { return !/e-?mail|^name$|client name|full name|company|business name|work|role|designation/i.test(h); }).slice(0, 2);
      var nSel = R.filter(function (r) { return r.sel; }).length, allSel = R.length && R.every(function (r) { return r.sel || r.status !== "pending"; });
      $("#ad-view").innerHTML = head(esc(c.name) + ' <span class="ad-tag ' + st[1] + '">' + (sending ? "Sending…" : writing ? "Writing…" : st[0]) + "</span>", '<a href="#campaigns">← All campaigns</a>') + cpSender(data) +
        '<div class="ad-kpis">' + cpk(k.total, "clients") + cpk(k.selected, "selected") + cpk(k.written, "messages written", "", "money") + cpk(k.delivered, "sent", "", "ok") + cpk(k.replied || 0, "replied", "", "money") + cpk((k.failed || 0) + (k.stopped || 0), "failed / opted out") + "</div>" +
        '<div class="panel ad-card ad-cp-tools"><div class="btn-row">' +
          (!data.ai ? "" : '<button type="button" class="btn" id="cp-write"' + (writing || sending ? " disabled" : "") + ">" + (writing ? "Writing… " + k.written + " done" : "✦ Write personal messages" + (k.toWrite ? " (" + k.toWrite + ")" : "")) + "</button>") +
          (sending ? '<button type="button" class="btn" id="cp-pause">Pause sending</button>' : '<button type="button" class="btn" id="cp-sendsel"' + (writing ? " disabled" : "") + ">Send to selected (" + k.selectedPending + ")</button>" + '<button type="button" class="btn ghost" id="cp-sendall"' + (writing ? " disabled" : "") + ">Send all (" + k.pending + ")</button>") +
          '<button type="button" class="btn ghost" id="cp-test">Send me a test</button>' +
          (data.sender && data.sender.via === "gmail" && k.delivered ? '<button type="button" class="btn ghost" id="cp-rep">Check replies</button>' : "") +
          (k.failed ? '<button type="button" class="btn ghost" id="cp-retry">Retry failed (' + k.failed + ")</button>" : "") +
          '<a class="btn ghost" id="cp-exp" href="/api/admin/campaigns/' + encodeURIComponent(c.id) + '/export" download>Export all clients</a></div>' +
          '<div class="ad-cp-att"><span>' + (c.attachment ? "📎 <b>" + esc(c.attachment.name) + "</b> " + kb(c.attachment.size) : "No attachment") + '</span><label class="btn sm ghost" for="cp-attf">' + (c.attachment ? "Change file" : "Attach a file") + '</label><input type="file" id="cp-attf" class="sr-only">' + (c.attachment ? '<button type="button" class="btn sm ghost" id="cp-attx">Remove</button>' : "") +
          '<button type="button" class="btn sm ghost" id="cp-brief">Edit what the email is about</button><button type="button" class="btn sm ghost" id="cp-del">Delete campaign</button></div></div>' +
        '<div class="ad-bar2"><input id="cp-q" type="search" placeholder="Search name, email, company, work…" value="' + esc(qtext) + '" aria-label="Search clients"><div class="ad-chips">' +
          [["", "All"], ["selected", "Selected"], ["unwritten", "No message yet"], ["written", "Message ready"], ["pending", "Not sent"], ["sent", "Sent"], ["replied", "Replied"], ["failed", "Failed"], ["stopped", "Opted out"]].map(function (f) { return '<button type="button" class="chip" data-cf="' + f[0] + '" aria-pressed="' + (filt === f[0]) + '">' + f[1] + "</button>"; }).join("") + "</div></div>" +
        (R.length ? '<div class="ad-table ad-cp-t"><table><thead><tr><th><input type="checkbox" id="cp-all" aria-label="Select all shown"' + (allSel ? " checked" : "") + '></th><th>Client</th><th>Work</th><th>Company</th>' + cols.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "<th>Personal subject</th><th>Status</th><th></th></tr></thead><tbody>" + R.map(function (r) { var s2 = CP_ST[r.status] || [r.status, ""];
            return '<tr><td><input type="checkbox" data-sel="' + esc(r.id) + '"' + (r.sel ? " checked" : "") + (r.status !== "pending" ? " disabled" : "") + ' aria-label="Select ' + esc(r.name || r.email) + '"></td><td><b>' + esc(r.name || "—") + '</b><br><small class="muted">' + esc(r.email) + "</small></td><td>" + esc(r.work || "—") + "</td><td>" + esc(r.company || "—") + "</td>" +
              cols.map(function (h) { return "<td>" + esc((r.fields || {})[h] || "—") + "</td>"; }).join("") +
              '<td class="ad-cp-sub">' + (r.subject ? esc(r.subject) + (r.ai === "edited" ? ' <span class="ad-tag">edited</span>' : "") : r.ai === "failed" ? '<span class="ad-tag bad">AI failed</span>' : '<span class="muted">Not written</span>') + "</td>" +
              '<td><span class="ad-tag ' + s2[1] + '">' + s2[0] + "</span>" + (r.error ? '<br><small class="muted">' + esc(r.error) + "</small>" : "") + (r.reply ? '<br><small class="ad-cp-rep">“' + esc(r.reply) + "”</small>" : "") + "</td>" +
              '<td class="ad-cp-act"><button type="button" class="btn sm ghost" data-rv="' + esc(r.id) + '">' + (r.status === "pending" ? "Review" : "View") + "</button>" + (r.status === "replied" || r.status === "sent" ? '<button type="button" class="btn sm' + (r.status === "replied" ? "" : " ghost") + '" data-key="' + esc(r.id) + '" data-em="' + esc(r.email) + '">' + (r.key_sent_at ? "Key sent ✓" : "Send key") + "</button>" : "") + "</td></tr>"; }).join("") +
          "</tbody></table></div>" + (data.matching > R.length ? '<p class="muted">Showing ' + R.length + " of " + data.matching + ". Search or filter to find the rest.</p>" : "")
          : '<div class="panel ad-card"><p class="muted">Nobody here.</p></div>');
      var on = function (sel, fn) { var el = $(sel); if (el) el.onclick = fn; };
      on("#cp-write", function () { writing = true; draw(); writeLoop(); });
      on("#cp-pause", function () { sending = false; clearTimeout(cpTimer); act({ action: "pause" }, "Paused"); });
      on("#cp-sendsel", function () { startSend(false); });
      on("#cp-sendall", function () { startSend(true); });
      on("#cp-test", function () { ask({ title: "Send a test email", text: "You get the first selected client's personal email, with the attachment and the FODO design, exactly as they will.", input: "Send the test to", ph: ME.email, ok: "Send test" }).then(function (v) { if (v === null) return; toast("Sending the test…"); act({ action: "test", to: v === true || !v ? ME.email : v }).then(function (j) { if (j) toast("Test sent to " + j.to + " (as " + (j.as || "sample") + ")"); }); }); });
      on("#cp-rep", function () { toast("Checking Gmail…"); act({ action: "replies" }).then(function (j) { if (j) toast(j.replied + " new repl" + (j.replied === 1 ? "y" : "ies") + (j.stopped ? ", " + j.stopped + " said STOP" : "") + " (checked " + j.checked + ")"); }); });
      on("#cp-retry", function () { act({ action: "retry" }, "Failed ones are back in the queue"); });
      on("#cp-attx", function () { act({ action: "attach" }, "Attachment removed"); });
      var af = $("#cp-attf"); if (af) af.onchange = function () { var f = this.files[0]; if (!f) return; if (f.size > 10 * 1048576) return toast("The attachment can be up to 10 MB.", true); toast("Uploading " + f.name + "…"); readB64(f).then(function (b64) { act({ action: "attach", att: b64, att_name: f.name, att_mime: f.type || "" }, "Attached " + f.name); }); };
      on("#cp-brief", function () {
        var w = document.createElement("div"); w.className = "cfx ad-dlg"; w.innerHTML = '<div class="cfx-back" data-x></div><div class="cfx-box ad-cp-dlg" role="dialog" aria-modal="true" aria-labelledby="cp-bt"><h3 id="cp-bt">What is this email about?</h3><p class="muted">AI uses this for every message it writes or rewrites. Messages already written stay as they are (rewrite them from Review).</p><label class="ad-dl2" for="cp-bb">The offer / what to tell them</label><textarea id="cp-bb" class="ad-in ad-ta ad-cp-ta" rows="8" maxlength="3000"></textarea><label class="ad-dl2" for="cp-bl">Small label on the email</label><input id="cp-bl" class="ad-in" maxlength="40"><div class="btn-row"><button type="button" class="btn" data-ok>Save</button><button type="button" class="btn ghost" data-x>Cancel</button></div></div>';
        document.body.appendChild(w); $("#cp-bb", w).value = c.brief || CP_BRIEF; $("#cp-bl", w).value = c.eyebrow || "FODO Studio";
        $$("[data-x]", w).forEach(function (b) { b.onclick = function () { w.remove(); }; });
        $("[data-ok]", w).onclick = function () { act({ action: "update", brief: $("#cp-bb", w).value, eyebrow: $("#cp-bl", w).value, subject: c.subject, body: c.body }, "Saved").then(function (j) { if (j) w.remove(); }); };
      });
      on("#cp-del", function () { ask({ title: "Delete this campaign?", text: "Its client list, messages and statuses are removed. Emails already sent stay sent.", ok: "Delete" }).then(function (v) { if (v) act({ action: "delete" }).then(function (j) { if (j) location.hash = "campaigns"; }); }); });
      var qt; $("#cp-q").oninput = function (e) { clearTimeout(qt); qt = setTimeout(function () { qtext = e.target.value.trim(); load(); }, 300); };
      $$("[data-cf]").forEach(function (b) { b.onclick = function () { filt = b.dataset.cf; load(); }; });
      var ca = $("#cp-all"); if (ca) ca.onchange = function () { var v = this.checked, ids = R.filter(function (r) { return r.status === "pending"; }).map(function (r) { return r.id; }); R.forEach(function (r) { if (r.status === "pending") r.sel = v ? 1 : 0; }); act({ action: "select", ids: ids, sel: v ? 1 : 0 }, "", true).then(function () { draw(); }); };
      $$("[data-sel]").forEach(function (b) { b.onchange = function () { var v = this.checked, r = R.filter(function (x) { return x.id === b.dataset.sel; })[0]; if (r) r.sel = v ? 1 : 0; act({ action: "select", ids: [b.dataset.sel], sel: v ? 1 : 0 }, "", true).then(function () { draw(); }); }; });
      $$("[data-rv]").forEach(function (b) { b.onclick = function () { var r = R.filter(function (x) { return x.id === b.dataset.rv; })[0]; if (r) review(r); }; });
      $$("[data-key]").forEach(function (b) { b.onclick = function () {
        ask({ title: "Email the FODO Studio key to " + b.dataset.em + "?", text: "It goes as a reply in the same email thread, with their personal key and the install steps.", input: "Your message (optional)", area: true, ph: "e.g. Great to hear from you! Here is your key.", ok: "Send the key" }).then(function (v) {
          if (v === null) return; toast("Sending the key…");
          api("campaigns/key/" + encodeURIComponent(b.dataset.key), { message: v === true ? "" : v }).then(function (j) { if (!j.ok) return toast(j.reason || "Could not send.", true); toast("Key sent to " + b.dataset.em); load(); });
        });
      }; });
    }
    $("#ad-view").innerHTML = '<div class="ad-load">Loading…</div>';
    load().then(function (j) { if (j && j.campaign && j.campaign.status === "sending") { sending = true; draw(); sendLoop(); } else if (j && j.ai && j.counts.toWrite && j.counts.written === 0 && j.campaign.status === "draft") { writing = true; draw(); writeLoop(); } });
  }
  function studioView() {
    $("#ad-view").innerHTML = head("Studio", "Everyone who opened FODO Studio. Each person gets a key from their account; Studio (website and app) works only after they enter it. " + (owner() ? "Copy or WhatsApp the key to give access, block anyone (the app stops at its next check-in: within an hour online, at most " : "Read-only view. ") + (owner() ? "48 h offline)." : ""), '<button class="btn sm ghost" id="ad-scsv" type="button">Export CSV</button>') +
      '<div id="ad-sreq"></div><div id="ad-sinbox"></div><div id="ad-skpi" class="ad-kpis"></div><div class="ad-bar2"><input id="ad-sq" type="search" placeholder="Search email or name" value="' + esc(sq) + '" aria-label="Search Studio people"><div class="ad-chips">' +
      [["", "All"], ["waiting", "Key not entered"], ["active", "Active"], ["blocked", "Blocked"]].map(function (f) { return '<button type="button" class="chip" data-sf="' + f[0] + '" aria-pressed="' + (sf === f[0]) + '">' + f[1] + "</button>"; }).join("") + '</div></div><div id="ad-slist"><div class="ad-load">Loading…</div></div>';
    var data = null, t;
    $("#ad-sq").oninput = function (e) { clearTimeout(t); t = setTimeout(function () { sq = e.target.value.trim().toLowerCase(); draw(); }, 200); };
    $$("[data-sf]").forEach(function (b) { b.onclick = function () { sf = b.dataset.sf; $$("[data-sf]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); draw(); }; });
    $("#ad-scsv").onclick = function () { if (data) csv([["Email", "Name", "Status", "Key ends", "Entered", "Via", "Computers", "Device limit", "Last seen", "Blocked reason", "Note"]].concat(data.items.map(function (x) { return [x.email, x.name, x.status, x.hint, x.entered_at, x.entered_via, x.devices.filter(function (d) { return d.active; }).length, x.max_devices, x.last_seen, x.block_reason, x.note]; })), "fodo-studio-keys"); };
    var ST = { waiting: ["Key not entered", "mid"], active: ["Active", "ok"], blocked: ["Blocked", "bad"] };
    function load() { api("studio").then(function (j) { if (!j.ok) return fail(j); data = j; draw(); }); }
    var rqAll = false;
    /* v53.2: "Request access" from the app's email screen. FODO answers by emailing the key (from anmol@fodo.co.in). */
    function sendKey(call, email) {
      ask({ title: "Email the FODO Studio key to " + email + "?", text: "Sent from " + (data.mail_from || "anmol@fodo.co.in") + ". The email has their key and the steps for the app and the website; replies come back to you. Add a message on top if you like.", input: "Your message (optional)", area: true, ph: "e.g. Hi Ravi, welcome to FODO Studio! Your plan runs till 31 Dec.", ok: "Send the key" }).then(function (v) {
        if (v === null) return; toast("Sending…");
        call({ action: "email", message: v === true ? "" : v }).then(function (j) {
          if (!j.ok) return toast(j.reason || "Could not send.", true);
          data = j; draw();
          if (j.mail && j.mail.sent) toast("Key emailed to " + j.mail.email);
          else ask({ title: "The email did not go out", text: (j.mail && j.mail.error) || "Copy the key and send it yourself.", ok: "OK" });
        });
      });
    }
    function drawReq() {
      var R = data.requests || [], open = R.filter(function (r) { return r.status === "new" || r.status === "failed"; }), done = R.filter(function (r) { return r.status !== "new" && r.status !== "failed"; });
      var show = rqAll ? R : open;
      var RS = { "new": ["New", "mid"], failed: ["Email failed", "bad"], sent: ["Key sent", "ok"], ignored: ["Ignored", ""] };
      $("#ad-sreq").innerHTML = '<div class="panel ad-card ad-req"><div class="ad-ch"><h2>Access requests' + (open.length ? ' <span class="ad-tag mid">' + open.length + " waiting</span>" : "") + '</h2><span class="muted">People who typed their email in the app (or on the website) and asked for a key. ' + (owner() ? "Press <b>Email the key</b> to give access." : "") + (data.mail_on === false ? ' <b class="bad">Email is not set up on the website, keys can only be copied.</b>' : "") + "</span>" +
        (done.length ? '<button type="button" class="btn sm ghost" id="ad-rqall">' + (rqAll ? "Hide answered" : "Show answered (" + done.length + ")") + "</button>" : "") + "</div>" +
        (show.length ? '<ul class="ad-rqs">' + show.map(function (r) { var st = RS[r.status] || [r.status, ""];
          return '<li data-rq="' + esc(r.id) + '"><div class="ad-who"><span class="ad-av">' + esc((r.name || r.email).charAt(0).toUpperCase()) + "</span><div><b>" + esc(r.email) + "</b><small>" + esc(r.name || "") + (r.name ? " · " : "") + (r.src === "web" ? "website" : "app" + (r.device_name ? " on " + esc(r.device_name) : "") + (r.platform ? " (" + esc(r.platform) + ")" : "") + (r.version ? " · " + esc(r.version) : "")) + " · " + esc(ago(r.updated_at)) + (r.tries > 1 ? " · asked " + r.tries + "×" : "") + "</small>" +
            (r.note ? '<p class="ad-rqn">“' + esc(r.note) + "”</p>" : "") + (r.error ? '<p class="ad-rqn bad">' + esc(r.error) + "</p>" : "") + (r.sent_at ? "<small>" + esc(st[0]) + " " + esc(ago(r.sent_at)) + (r.sent_by ? " by " + esc(r.sent_by) : "") + "</small>" : "") + "</div></div>" +
            '<div class="ad-rqa"><span class="ad-tag ' + st[1] + '">' + st[0] + "</span>" + (owner() ? (r.status === "ignored" ? '<button type="button" class="btn sm ghost" data-r="reopen">Undo</button>' : '<button type="button" class="btn sm" data-r="send">' + (r.status === "sent" ? "Send again" : "Email the key") + "</button>" + (r.status === "new" || r.status === "failed" ? ' <button type="button" class="btn sm ghost" data-r="ignore">Ignore</button>' : "")) : "") + "</div></li>"; }).join("") + "</ul>"
          : '<p class="muted">' + (R.length ? "No new requests." : "No requests yet. When someone opens the app and types their email, it shows here.") + "</p>") + "</div>";
      var all = $("#ad-rqall"); if (all) all.onclick = function () { rqAll = !rqAll; drawReq(); };
      $$("#ad-sreq [data-rq]").forEach(function (li) { var id = li.dataset.rq, r = R.filter(function (y) { return y.id === id; })[0];
        li.querySelectorAll("[data-r]").forEach(function (b) { b.onclick = function () { var k = b.dataset.r, call = function (body) { return api("studio/req/" + id, body); };
          if (k === "send") sendKey(function (body) { return call({ action: "send", message: body.message }); }, r.email);
          else call({ action: k }).then(function (j) { if (!j.ok) return toast(j.reason || "Could not save.", true); data = j; draw(); toast(k === "ignore" ? "Ignored" : "Back in the list"); }); }; }); });
    }
    function draw() {
      if (!data) return; var c = data.counts;
      $("#ad-skpi").innerHTML = K(c.total, "People in Studio") + K(c.waiting, "Key not entered yet", "waiting for the key", c.waiting ? "mid" : "") + K(c.active, "Active", "key entered") + K(c.blocked, "Blocked", "", c.blocked ? "bad" : "") + K(c.computers, "Computers with the app");
      drawReq();
      var L = data.items.filter(function (x) { return (!sf || x.status === sf) && (!sq || (x.email + " " + x.name).toLowerCase().indexOf(sq) > -1); });
      $("#ad-slist").innerHTML = L.length ? '<div class="ad-table"><table><thead><tr><th>Person</th><th>Status</th><th>Key</th><th>Computers</th><th>Last seen</th>' + (owner() ? "<th></th>" : "") + "</tr></thead><tbody>" + L.map(function (x) {
        var st = ST[x.status] || [x.status, ""], act = x.devices.filter(function (d) { return d.active; });
        return '<tr data-s="' + esc(x.user_id) + '"><td><div class="ad-who"><span class="ad-av">' + ini(x) + "</span><div><b>" + esc(x.email || "—") + "</b><small>" + esc(x.name || "") + (x.note ? " · " + esc(x.note) : "") + "</small></div></div></td>" +
          '<td data-l="Status"><span class="ad-tag ' + st[1] + '">' + st[0] + "</span>" + (x.status === "blocked" && x.block_reason ? "<br><small>" + esc(x.block_reason) + "</small>" : "") + (x.entered_at ? "<br><small>entered " + esc(date(x.entered_at)) + (x.entered_via ? " · " + esc(x.entered_via) : "") + "</small>" : "") + "</td>" +
          '<td data-l="Key"><code>FODO-…-' + esc(x.hint) + "</code>" + (owner() ? '<br><button type="button" class="btn sm ghost" data-k="copy">Copy key</button> <button type="button" class="btn sm ghost" data-k="wa">WhatsApp</button>' : "") + "</td>" +
          '<td data-l="Computers">' + act.length + " / " + x.max_devices + (act.length ? "<br><small>" + act.map(function (d) { return esc(d.name) + " · " + esc(d.platform || "") + " · " + esc(ago(d.last_seen)) + (owner() ? ' <a href="#" data-dev="' + esc(d.id) + '">remove</a>' : ""); }).join("<br>") + "</small>" : "") + "</td>" +
          '<td data-l="Last seen">' + esc(ago(x.last_seen)) + "</td>" +
          (owner() ? '<td class="ad-sacts">' + (x.status === "blocked" ? '<button type="button" class="btn sm" data-k="unblock">Unblock</button>' : '<button type="button" class="btn sm danger" data-k="block">Block</button>') +
            (x.status === "waiting" ? ' <button type="button" class="btn sm ghost" data-k="activate" title="Turn Studio on without them typing the key">Activate</button>' : "") +
            (x.email && /@/.test(x.email) && x.status !== "blocked" ? ' <button type="button" class="btn sm ghost" data-k="email" title="Email the key from ' + esc(data.mail_from || "") + '">Email key</button>' : "") +
            ' <button type="button" class="btn sm ghost" data-k="regen">New key</button> <button type="button" class="btn sm ghost" data-k="devices">Limit</button> <button type="button" class="btn sm ghost" data-k="note">Note</button></td>' : "") + "</tr>";
      }).join("") + "</tbody></table></div>" : '<div class="panel ad-card"><p class="muted">' + (data.items.length ? "Nobody matches." : "Nobody has opened FODO Studio yet.") + "</p></div>";
      $$("#ad-slist tr[data-s]").forEach(function (r) {
        var uid = r.dataset.s, x = data.items.filter(function (y) { return y.user_id === uid; })[0];
        var post = function (b, msg) { return api("studio/" + uid, b).then(function (j) { if (!j.ok) return toast(j.reason || "Could not save.", true); data = j; draw(); toast(msg); }); };
        var key = function () { return api("studio/" + uid + "/key").then(function (j) { if (!j.ok) { toast(j.reason || "Could not load the key.", true); return null; } return j.key; }); };
        r.querySelectorAll("[data-k]").forEach(function (b) { b.onclick = function () { var k = b.dataset.k;
          if (k === "copy") key().then(function (v) { if (!v) return; (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { toast("Key copied: " + v); }, function () { ask({ title: "Studio key for " + x.email, text: v, ok: "Done" }); }); });
          else if (k === "wa") key().then(function (v) { if (!v) return; var msg = "Your FODO Studio key: " + v + "\n\nOpen https://www.fodo.co.in/studio/ (log in with " + x.email + ") and enter the key. For clipping on your computer, download the app from Studio ▸ Get the app and enter the same key there."; window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank", "noopener"); });
          else if (k === "block") ask({ title: "Block " + x.email + "?", text: "Studio stops on the website at once, and in the app at its next check-in (at most 48 h if the computer stays offline).", input: "Reason (shown to them)", ph: "e.g. Payment pending", ok: "Block", danger: true }).then(function (v) { if (v !== null) post({ action: "block", reason: v }, "Blocked"); });
          else if (k === "email") sendKey(function (b) { return api("studio/" + uid, b); }, x.email);
          else if (k === "unblock") post({ action: "unblock" }, "Unblocked");
          else if (k === "activate") ask({ title: "Activate Studio for " + x.email + "?", text: "Turns Studio on for the website without them typing the key. The app still needs the key.", ok: "Activate" }).then(function (v) { if (v) post({ action: "activate" }, "Activated"); });
          else if (k === "regen") ask({ title: "Make a new key for " + x.email + "?", text: "The old key stops working and every computer is signed out. Give them the new key.", ok: "Make new key", danger: true }).then(function (v) { if (v) post({ action: "regen" }, "New key made: copy it with Copy key"); });
          else if (k === "devices") ask({ title: "How many computers may " + x.email + " use?", input: "Number of computers (1-20)", ph: String(x.max_devices), ok: "Save" }).then(function (v) { if (v) post({ action: "devices", max: v }, "Saved"); });
          else if (k === "note") ask({ title: "Note for " + x.email, input: "Note (only FODO sees it)", ph: x.note || "e.g. Paid till March", ok: "Save" }).then(function (v) { if (v !== null) post({ action: "note", note: v }, "Saved"); });
        }; });
        r.querySelectorAll("[data-dev]").forEach(function (a) { a.onclick = function (e) { e.preventDefault(); ask({ title: "Remove this computer?", text: "The app on it stops at its next check-in and needs the key again.", ok: "Remove", danger: true }).then(function (v) { if (v) post({ action: "remove_device", device: a.dataset.dev }, "Computer removed"); }); }; });
      });
    }
    load();
    if (owner()) inbox();
    /* v53.3: FODO's own Gmail (anmol@fodo.co.in) inside Admin ▸ Studio: read, reply, reply with the sender's key */
    var ibq = "in:inbox", ibAcc = "", ibData = null;
    var KS = { none: ["No key yet", ""], account: ["No key yet", ""], waiting: ["Key not entered", "mid"], active: ["Has a key", "ok"], blocked: ["Blocked", "bad"], me: ["You", ""] };
    function ibDate(x) { var d = new Date(x.at || Date.parse(x.date) || 0); return isNaN(d) ? "" : (Date.now() - d < 864e5 ? d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })); }
    function ibName(f) { var m = /^\s*"?([^"<]+?)"?\s*</.exec(f || ""); return m ? m[1] : String(f || "").replace(/[<>]/g, ""); }
    function inbox(page) {
      var el = $("#ad-sinbox"); if (!el) return;
      if (!page) el.innerHTML = '<div class="panel ad-card ad-mbx"><div class="ad-ch"><h2>Inbox</h2><span class="muted">Loading the mailbox…</span></div></div>';
      api("studio/inbox?q=" + encodeURIComponent(ibq) + (ibAcc ? "&account=" + encodeURIComponent(ibAcc) : "") + (page ? "&page=" + encodeURIComponent(page) : "")).then(function (j) {
        if (!$("#ad-sinbox")) return;
        if (!j.ok) { el.innerHTML = '<div class="panel ad-card ad-mbx"><div class="ad-ch"><h2>Inbox</h2></div><p class="cf-status warn">' + esc(j.reason || "Could not open the mailbox.") + '</p><a class="btn sm" href="/api/admin/studio/connect">Log in with Google again</a></div>'; return; }
        var st = j.status || {};
        if (!st.available) { el.innerHTML = '<div class="panel ad-card ad-mbx"><div class="ad-ch"><h2>Inbox</h2></div><p class="muted">Google login is not set up on the website (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET), so the mailbox can\'t be opened here.</p></div>'; return; }
        if (!st.connected) { el.innerHTML = '<div class="panel ad-card ad-mbx ad-mbx0"><div><h2>Inbox · ' + esc(st.want) + '</h2><p class="muted">Log in with Google once to read FODO\'s mail here, reply to anyone, and reply with their FODO Studio key in one click. Replies go from your real mailbox and stay in the same Gmail thread.' + (st.others && st.others.length ? " Connected without Gmail: " + esc(st.others.join(", ")) + "." : "") + '</p></div><a class="btn" href="/api/admin/studio/connect">Log in with Google</a></div>'; return; }
        if (page && ibData) { ibData.items = ibData.items.concat(j.items); ibData.next = j.next; } else ibData = j;
        ibDraw();
      });
      function ibDraw() {
        var j = ibData, st = j.status || {};
        var chips = [["in:inbox", "Inbox"], ["in:inbox is:unread", "Unread"], ["in:inbox (key OR studio OR access OR login)", "Key requests"], ["in:sent", "Sent"]];
        el.innerHTML = '<div class="panel ad-card ad-mbx"><div class="ad-ch"><h2>Inbox · ' + esc(j.account) + "</h2>" +
          (st.accounts.length > 1 ? '<select id="ad-ibacc" aria-label="Mailbox">' + st.accounts.map(function (a) { return '<option' + (a === j.account ? " selected" : "") + ">" + esc(a) + "</option>"; }).join("") + "</select>" : "") +
          '<span class="ad-ibb"><button type="button" class="btn sm" id="ad-ibkey">Send key to any email</button> <button type="button" class="btn sm ghost" id="ad-ibre">Refresh</button></span></div>' +
          '<div class="ad-bar2"><input id="ad-ibq" type="search" value="' + esc(ibq) + '" placeholder="Search mail (like Gmail: from:ravi, is:unread)" aria-label="Search mail"><div class="ad-chips">' + chips.map(function (c) { return '<button type="button" class="chip" data-ibq="' + esc(c[0]) + '" aria-pressed="' + (ibq === c[0]) + '">' + c[1] + "</button>"; }).join("") + "</div></div>" +
          (j.items.length ? '<ul class="ad-ibl">' + j.items.map(function (x, i) { var k = KS[x.key] || KS.none;
            return '<li data-ib="' + i + '" class="' + (x.unread ? "un" : "") + '"><span class="ad-av">' + esc((ibName(x.from) || "?").charAt(0).toUpperCase()) + '</span><div class="ad-ibm"><div class="ad-ibt"><b>' + esc(ibName(x.from)) + "</b><small>" + esc(x.email) + '</small><time>' + esc(ibDate(x)) + "</time></div><p><b>" + esc(x.subject || "(no subject)") + "</b> · " + esc(x.snippet) + '</p></div><div class="ad-iba">' + (x.key === "me" ? "" : '<span class="ad-tag ' + k[1] + '">' + k[0] + "</span>") +
              '<button type="button" class="btn sm ghost" data-iba="open">Open</button>' + (x.key !== "me" && x.key !== "blocked" && x.email ? '<button type="button" class="btn sm" data-iba="key">Reply with key</button>' : "") + "</div></li>"; }).join("") + "</ul>" + (j.next ? '<button type="button" class="btn sm ghost" id="ad-ibmore">Load more</button>' : "")
            : '<p class="muted">No mail matches.</p>') + "</div>";
        var acc = $("#ad-ibacc"); if (acc) acc.onchange = function () { ibAcc = acc.value; inbox(); };
        var t; $("#ad-ibq").onkeydown = function (e) { if (e.key === "Enter") { ibq = e.target.value.trim() || "in:inbox"; inbox(); } };
        $$("[data-ibq]").forEach(function (b) { b.onclick = function () { ibq = b.dataset.ibq; inbox(); }; });
        $("#ad-ibre").onclick = function () { inbox(); };
        var more = $("#ad-ibmore"); if (more) more.onclick = function () { more.disabled = true; inbox(j.next); };
        $("#ad-ibkey").onclick = function () { ask({ title: "Send a FODO Studio key", text: "Type their email. Their account and key are made if needed, and the key goes from " + j.account + ".", input: "Email address", ph: "name@gmail.com", ok: "Next" }).then(function (to) { if (!to) return; keyTo({ email: to }, to); }); };
        $$("#ad-sinbox [data-ib]").forEach(function (li) { var x = j.items[+li.dataset.ib];
          li.querySelectorAll("[data-iba]").forEach(function (b) { b.onclick = function () { if (b.dataset.iba === "open") openMail(x); else keyTo({ id: x.id }, x.email); }; }); });
      }
      function keyTo(target, who) {
        ask({ title: "Send the FODO Studio key to " + who + "?", text: "Sent from " + ibData.account + (target.id ? " as a reply in the same Gmail thread" : "") + ". It has their key and the steps for the app and the website. Add a message on top if you like.", input: "Your message (optional)", area: true, ph: "e.g. Hi, welcome to FODO Studio!", ok: "Send the key" }).then(function (v) {
          if (v === null) return; toast("Sending…");
          api(target.id ? "studio/inbox/" + encodeURIComponent(target.id) : "studio/sendkey", Object.assign({ action: "key", message: v === true ? "" : v, account: ibData.account }, target.email ? { email: target.email } : {})).then(function (r) {
            if (!r.ok) return ask({ title: "The key was not sent", text: r.reason || "Gmail did not send it.", ok: "OK" });
            toast("Key sent to " + r.mail.to + " from " + r.mail.from); if (r.items) { data = r; draw(); } inbox(); });
        });
      }
      function openMail(x) {
        var w = document.createElement("div"); w.className = "cfx ad-dlg ad-ibdlg";
        w.innerHTML = '<div class="cfx-back" data-x></div><div class="cfx-box" role="dialog" aria-modal="true" aria-labelledby="ad-ibh"><h3 id="ad-ibh">' + esc(x.subject || "(no subject)") + '</h3><p class="muted">' + esc(x.from) + " · " + esc(x.date) + '</p><div class="ad-ibtx">Loading…</div>' +
          '<label class="ad-dl2" for="ad-ibr">Reply to ' + esc(x.email) + '</label><textarea id="ad-ibr" class="ad-in ad-ta" rows="5" maxlength="20000" placeholder="Write your reply"></textarea>' +
          '<div class="btn-row"><button type="button" class="btn" data-ibs>Send reply</button>' + (x.key !== "me" && x.key !== "blocked" ? '<button type="button" class="btn ghost" data-ibk>Reply with key</button>' : "") + '<button type="button" class="btn ghost" data-x>Close</button></div></div>';
        document.body.appendChild(w); var close = function () { w.remove(); };
        w.querySelectorAll("[data-x]").forEach(function (b) { b.onclick = close; }); w.onkeydown = function (e) { if (e.key === "Escape") close(); };
        api("studio/inbox/" + encodeURIComponent(x.id) + "?account=" + encodeURIComponent(ibData.account)).then(function (r) { var tx = w.querySelector(".ad-ibtx"); if (!tx) return; tx.textContent = r.ok ? r.mail.text || "(empty)" : r.reason || "Could not open it."; });
        w.querySelector("[data-ibs]").onclick = function () { var b = this, t = w.querySelector("#ad-ibr").value.trim(); if (!t) return toast("Write the reply first.", true); b.disabled = true;
          api("studio/inbox/" + encodeURIComponent(x.id), { action: "reply", text: t, account: ibData.account }).then(function (r) { b.disabled = false; if (!r.ok) return toast(r.reason || "Not sent.", true); close(); toast("Reply sent to " + r.mail.to); inbox(); }); };
        var kb = w.querySelector("[data-ibk]"); if (kb) kb.onclick = function () { close(); keyTo({ id: x.id }, x.email); };
        setTimeout(function () { w.querySelector("#ad-ibr").focus(); }, 30);
      }
    }
    if (/[?&]google=/.test(location.search)) { var gq = /[?&]google=([^&]*)/.exec(location.search)[1]; toast(gq === "ok" ? "Google connected: the mailbox is open below" : "Google login: " + decodeURIComponent(gq), gq !== "ok"); try { history.replaceState(null, "", "/admin/#studio"); } catch (e) {} }
  }
  function usersView() {
    $("#ad-view").innerHTML = head("Users", "Everyone who logged in to the Growth Lab. Tap a person to see what they used" + (owner() ? ", block them or give features free." : "."), '<button class="btn sm ghost" id="ad-ucsv" type="button">Export CSV</button>') +
      '<div class="ad-bar2"><input id="ad-uq" type="search" placeholder="Search email or name" value="' + esc(uq) + '" aria-label="Search users"><div class="ad-chips">' + [["", "All"], ["paid", "Paying"], ["gifted", "Given free"], ["blocked", "Blocked"]].map(function (f) { return '<button type="button" class="chip" data-f="' + f[0] + '" aria-pressed="' + (uf === f[0]) + '">' + f[1] + "</button>"; }).join("") + '</div></div><div id="ad-ulist"><div class="ad-load">Loading…</div></div>';
    var t; $("#ad-uq").oninput = function (e) { clearTimeout(t); t = setTimeout(function () { uq = e.target.value.trim(); load(); }, 250); };
    $("#ad-view").querySelectorAll("[data-f]").forEach(function (b) { b.onclick = function () { uf = b.dataset.f; usersView(); }; });
    var items = [];
    $("#ad-ucsv").onclick = function () { csv([["Email", "Name", "Plan", "Plan until", "X-Rays run", "Paid (INR)", "Blocked", "Unlimited", "Extra features", "Joined", "Last login"]].concat(items.map(function (u) { return [u.email, u.name, u.plan, u.plan_until, u.runs, u.paid, u.blocked ? "yes" : "", u.unlimited ? "yes" : "", u.extra_features || "", u.created_at, u.last_login]; })), "fodo-users"); };
    function load() {
      api("users?q=" + encodeURIComponent(uq) + "&filter=" + uf).then(function (j) {
        if (!j.ok) return fail(j); items = j.items;
        var now = Date.now(), plan = function (u) { return u.owner ? "owner" : u.plan !== "free" && Date.parse(u.plan_until) > now ? u.plan : "free"; };
        $("#ad-ulist").innerHTML = items.length ? '<div class="ad-table"><table><thead><tr><th>User</th><th>Plan</th><th>X-Rays</th><th>Paid</th><th>Last seen</th><th>Joined</th></tr></thead><tbody>' + items.map(function (u) {
          var tags = (u.blocked ? '<span class="ad-tag bad">Blocked</span>' : "") + (u.unlimited ? '<span class="ad-tag ok">Unlimited</span>' : "") + (u.extra_features && u.extra_features !== "[]" ? '<span class="ad-tag">+ features</span>' : "");
          return '<tr data-u="' + esc(u.id) + '" tabindex="0"><td><div class="ad-who"><span class="ad-av">' + ini(u) + "</span><div><b>" + esc(who(u)) + "</b><small>" + esc(u.email ? u.name || "" : u.login_via || "") + " " + tags + '</small></div></div></td><td data-l="Plan">' + badge(plan(u)) + '</td><td data-l="X-Rays">' + u.runs + '</td><td data-l="Paid">' + (u.paid ? inr(u.paid) : "—") + '</td><td data-l="Last seen">' + esc(ago(u.last_login)) + '</td><td data-l="Joined">' + esc(date(u.created_at)) + "</td></tr>"; }).join("") + "</tbody></table></div>" + (items.length === 100 ? '<p class="muted">Showing the 100 most recent, search to find others.</p>' : "") : '<p class="muted">No users match.</p>';
        $("#ad-ulist").querySelectorAll("tr[data-u]").forEach(function (r) { var go = function () { location.hash = "user/" + r.dataset.u; }; r.onclick = go; r.onkeydown = function (e) { if (e.key === "Enter") go(); }; });
      });
    }
    load();
  }

  /* ---------- one user ---------- */
  function userView(id) {
    api("user/" + encodeURIComponent(id || "")).then(function (j) {
      if (!j.ok) return fail(j);
      var u = j.user, can = owner() && !u.owner, umax = Math.max.apply(null, j.usage.map(function (x) { return x.n; }).concat([1]));
      var st = (u.blocked ? '<span class="ad-tag bad">Blocked</span>' : '<span class="ad-tag ok">Active</span>') + (u.owner ? '<span class="ad-tag">FODO owner</span>' : "") + (u.unlimited ? '<span class="ad-tag ok">Unlimited X-Rays</span>' : "");
      var feats = ME.features.map(function (f) { return '<label class="ad-feat"><input type="checkbox" value="' + esc(f.id) + '"' + (u.features.indexOf(f.id) > -1 ? " checked" : "") + (can ? "" : " disabled") + "><span>" + esc(f.label) + "</span></label>"; }).join("");
      $("#ad-view").innerHTML = '<a class="ad-back" href="#users">← All users</a>' +
        '<div class="panel hud ad-card ad-user"><div class="ad-who big"><span class="ad-av">' + ini(u) + "</span><div><h1>" + esc(who(u)) + "</h1><p class=\"muted\">" + esc(u.name || "—") + (u.phone ? " · " + esc(u.phone) : "") + " · joined " + esc(date(u.created)) + " · last login " + esc(ago(u.lastLogin)) + " · " + (u.google ? "Google" : "email code") + " · " + u.sessions + " active session" + (u.sessions === 1 ? "" : "s") + "</p><p>" + badge(u.plan) + (u.planUntil && u.plan !== "free" ? ' <small class="muted">until ' + esc(date(u.planUntil)) + "</small>" : "") + " " + st + "</p></div></div>" +
        '<ul class="ad-mini"><li><b>' + j.runs.length + "</b><span>X-Rays</span></li><li><b>" + (u.unlimited || u.owner ? "∞" : (u.plan !== "free" ? u.monthly : 0) + u.packs + (u.plan === "free" ? u.free : 0)) + "</b><span>X-Rays left</span></li><li><b>" + inr(j.orders.filter(function (o) { return o.status === "PAID"; }).reduce(function (a, o) { return a + o.amount; }, 0)) + "</b><span>paid</span></li><li><b>" + j.events.length + "</b><span>actions</span></li></ul></div>" +
        '<div class="panel ad-card ad-actions"><div class="ad-ch"><h2>Control</h2>' + (can ? "" : '<span class="muted">' + (u.owner ? "Owner logins always have everything." : "View only, ask a FODO owner or admin to change this.") + "</span>") + "</div>" +
          '<div class="ad-acts"><div><h3>Access</h3><button class="btn sm ' + (u.blocked ? "" : "danger") + '" id="ad-blk" type="button"' + (can ? "" : " disabled") + ">" + (u.blocked ? "Unblock" : "Block this user") + '</button><p class="muted">Blocking logs them out everywhere and stops login and X-Rays.</p>' + (u.note ? '<p class="muted">Note: ' + esc(u.note) + "</p>" : "") + "</div>" +
          '<div><h3>Give a plan free</h3><div class="ad-row"><select id="ad-gp"' + (can ? "" : " disabled") + ">" + ME.plans.map(function (p) { return '<option value="' + p.id + '"' + (p.id === "pro" ? " selected" : "") + ">" + esc(p.name) + (p.price ? " (worth " + inr(p.price) + "/mo)" : ", remove plan") + "</option>"; }).join("") + '</select><input id="ad-gd" type="number" min="1" max="3650" value="30" aria-label="Days"' + (can ? "" : " disabled") + '><span class="muted">days</span><button class="btn sm" id="ad-gpb" type="button"' + (can ? "" : " disabled") + ">Give</button></div></div>" +
          '<div><h3>Give X-Rays free</h3><div class="ad-row"><input id="ad-gn" type="number" min="-1000" max="1000" value="10" aria-label="Number of X-Rays"' + (can ? "" : " disabled") + '><button class="btn sm" id="ad-gnb" type="button"' + (can ? "" : " disabled") + '>Add</button></div><label class="ad-feat"><input type="checkbox" id="ad-unl"' + (u.unlimited ? " checked" : "") + (can ? "" : " disabled") + "><span><b>Unlimited X-Rays</b> (nothing is ever deducted)</span></label></div></div>" +
          '<details class="ad-fx"' + (u.features.length ? " open" : "") + "><summary><b>Give single features free</b> <span class=\"muted\">(" + u.features.length + " given), on top of their plan</span></summary><div class=\"ad-feats\">" + feats + "</div>" + (can ? '<button class="btn sm" id="ad-fsave" type="button">Save features</button>' : "") + "</details></div>" +
        '<div class="ad-grid2"><div class="panel ad-card"><h2>What they used</h2>' + (j.usage.length ? '<ul class="ad-rows">' + j.usage.map(function (x) { return "<li><span>" + esc(kind(x.kind)) + "</span>" + bar(x.n, umax) + "<b>" + x.n + "×</b><small>" + esc(ago(x.last)) + "</small></li>"; }).join("") + "</ul>" : '<p class="muted">Nothing yet.</p>') + "</div>" +
          '<div class="panel ad-card"><h2>Their X-Rays</h2>' + (j.runs.length ? '<ul class="ad-rows ad-doms">' + j.runs.slice(0, 30).map(function (r) { return "<li><span>" + (r.status === "COMPLETE" ? '<a href="/business-x-ray/?r=' + encodeURIComponent(r.job_id) + '" target="_blank" rel="noopener">' + esc(r.domain) + " ↗</a>" : esc(r.domain)) + "</span>" + badge(r.tier) + "<b>" + (r.score == null ? "—" : r.score) + "</b><small>" + esc(date(r.created_at, 1)) + "</small></li>"; }).join("") + "</ul>" : '<p class="muted">No X-Rays yet.</p>') + "</div></div>" +
        '<div class="ad-grid2"><div class="panel ad-card"><h2>Activity</h2>' + feed(j.events.slice(0, 60).map(function (e) { return Object.assign({}, e, { uid: "" }); })) + "</div>" +
          '<div class="panel ad-card"><h2>Payments</h2>' + (j.orders.length ? '<ul class="ad-rows">' + j.orders.map(function (o) { return "<li><span>" + esc(o.kind + " · " + o.item) + "</span><b>" + inr(o.amount) + '</b><small class="' + (o.status === "PAID" ? "ok" : "") + '">' + esc(o.status) + " · " + esc(date(o.paid_at || o.created_at)) + "</small></li>"; }).join("") + "</ul>" : '<p class="muted">No payments.</p>') +
          "<h2 style=\"margin-top:20px\">Credits</h2>" + (j.ledger.length ? '<ul class="ad-rows">' + j.ledger.map(function (l) { return "<li><span>" + esc(l.note || l.kind) + "</span><b class=\"" + (l.delta > 0 ? "ok" : "") + "\">" + (l.delta > 0 ? "+" : "") + l.delta + "</b><small>" + esc(date(l.created_at)) + "</small></li>"; }).join("") + "</ul>" : '<p class="muted">—</p>') + (j.team.length ? "<h2 style=\"margin-top:20px\">Their team</h2><ul class=\"ad-rows\">" + j.team.map(function (t) { return "<li><span>" + esc(t.email) + "</span></li>"; }).join("") + "</ul>" : "") + "</div></div>";
      if (!can) return;
      var post = function (p, b, okMsg) { return api("user/" + encodeURIComponent(u.id) + "/" + p, b).then(function (r) { if (r.ok) { toast(okMsg); userView(u.id); } else toast(r.reason || "Could not save (" + r._status + ").", true); }); };
      $("#ad-blk").onclick = function () {
        if (u.blocked) return ask({ title: "Unblock " + who(u) + "?", text: "They can log in and run X-Rays again.", ok: "Unblock" }).then(function (ok) { if (ok) post("block", { blocked: false }, "Unblocked " + who(u)); });
        ask({ title: "Block " + who(u) + "?", text: "They are logged out at once and can't log in or run X-Rays until you unblock them.", input: "Reason (optional, only the FODO team sees it)", ph: "e.g. spam sign-ups", ok: "Block", danger: true }).then(function (n) { if (n !== null) post("block", { blocked: true, note: n }, "Blocked " + who(u)); }); };
      $("#ad-gpb").onclick = function () { var p = $("#ad-gp").value, d = +$("#ad-gd").value || 30; ask({ title: p === "free" ? "Remove the plan from " + who(u) + "?" : "Give " + p + " free to " + who(u) + " for " + d + " days?", ok: p === "free" ? "Remove" : "Give" }).then(function (ok) { if (ok) post("grant", { type: "plan", plan: p, days: d }, p === "free" ? "Plan removed" : p + " given for " + d + " days"); }); };
      $("#ad-gnb").onclick = function () { var n = Math.round(+$("#ad-gn").value || 0); if (n) post("grant", { type: "credits", n: n }, (n > 0 ? n + " X-Rays added" : -n + " X-Rays removed")); };
      $("#ad-unl").onchange = function (e) { post("grant", { type: "unlimited", on: e.target.checked }, e.target.checked ? "Unlimited X-Rays on" : "Unlimited X-Rays off"); };
      $("#ad-fsave").onclick = function () { var f = [].slice.call($("#ad-view").querySelectorAll(".ad-feats input:checked")).map(function (i) { return i.value; }); post("grant", { type: "features", features: f }, f.length + " feature" + (f.length === 1 ? "" : "s") + " given free"); };
    });
  }

  /* ---------- X-Rays, leads, payments, activity, team ---------- */
  function runsView() {
    var q0 = decodeURIComponent((location.hash.split("/")[1] || ""));
    $("#ad-view").innerHTML = head("X-Rays", "Every Business X-Ray run with an account.", '<button class="btn sm ghost" id="ad-rcsv" type="button">Export CSV</button>') + '<div class="ad-bar2"><input id="ad-rq" type="search" placeholder="Search website or email" value="' + esc(q0) + '" aria-label="Search X-Rays"></div><div id="ad-rl"><div class="ad-load">Loading…</div></div>';
    var items = [], t;
    var load = function () { api("runs?q=" + encodeURIComponent($("#ad-rq").value.trim())).then(function (j) { if (!j.ok) return fail(j); items = j.items;
      $("#ad-rl").innerHTML = items.length ? '<div class="ad-table"><table><thead><tr><th>Website</th><th>By</th><th>Level</th><th>Score</th><th>Data</th><th>Status</th><th>When</th></tr></thead><tbody>' + items.map(function (r) { return "<tr><td>" + ('<a href="#report/' + encodeURIComponent(r.job_id) + '"><b>' + esc(r.domain) + "</b></a>" + (r.status === "COMPLETE" ? ' <a class="muted" href="/business-x-ray/?r=' + encodeURIComponent(r.job_id) + '" target="_blank" rel="noopener" title="Open the report">↗</a>' : "")) + '</td><td data-l="By">' + (r.uid ? '<a href="#user/' + esc(r.uid) + '">' + esc(r.email) + "</a>" : "—") + '</td><td data-l="Level">' + badge(r.tier) + (r.credit === "owner" || r.credit === "gift" ? ' <small class="muted">free</small>' : "") + '</td><td data-l="Score">' + (r.score == null ? "—" : r.score) + '</td><td data-l="Data">' + (r.completeness == null ? "—" : '<span class="ad-st ' + (r.completeness >= 70 ? "ok" : r.completeness >= 50 ? "mid" : "bad") + '">' + r.completeness + "%</span>") + '</td><td data-l="Status">' + esc({ COMPLETE: "Done", running: "Not finished", refunded: "Refunded" }[r.status] || r.status) + '</td><td data-l="When">' + esc(date(r.created_at, 1)) + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<p class="muted">No X-Rays found.</p>'; }); };
    $("#ad-rq").oninput = function () { clearTimeout(t); t = setTimeout(load, 250); };
    $("#ad-rcsv").onclick = function () { csv([["Website", "Email", "Level", "Credit", "Score", "Status", "When", "Report"]].concat(items.map(function (r) { return [r.domain, r.email, r.tier, r.credit, r.score, r.status, r.created_at, r.status === "COMPLETE" ? location.origin + "/business-x-ray/?r=" + r.job_id : ""]; })), "fodo-xrays"); };
    load();
  }
  /* v34: enquiries from the contact / audit / call forms (saved in D1; email + WhatsApp still work) */
  function enquiriesView() {
    var st = (location.hash.split("?status=")[1] || "");
    api("enquiries" + (st ? "?status=" + encodeURIComponent(st) : "")).then(function (j) {
      if (!j.ok) return fail(j);
      var opts = function (v) { return j.statuses.map(function (x) { return '<option value="' + x + '"' + (x === v ? " selected" : "") + ">" + x + "</option>"; }).join(""); };
      $("#ad-view").innerHTML = head("Enquiries", "Every contact, audit and call request from fodo.co.in, with the page and campaign it came from.", '<div class="btn-row"><select id="eq-f" class="ad-in" aria-label="Filter"><option value="">All</option>' + opts(st) + '</select><button class="btn sm ghost" id="eq-csv" type="button">Export CSV</button></div>') +
        (j.items.length ? '<div class="ad-leads">' + j.items.map(function (l) { var D = l.data || {}, ph = String(l.phone || "").replace(/\D/g, "");
          return '<div class="panel ad-card ad-lead" data-id="' + esc(l.id) + '"><div class="ad-who"><span class="ad-av">' + esc((l.name || "?").charAt(0).toUpperCase()) + '</span><div><b>' + esc(l.name) + (l.business ? " · " + esc(l.business) : "") + "</b><small>" + esc(l.mode) + " · " + esc(ago(l.created_at)) + "</small></div></div>" +
            '<p class="muted">' + esc([l.email, l.phone].filter(Boolean).join(" · ")) + "</p>" + (D.goal || D.budget || D.website || D.date ? '<p class="muted">' + esc([D.website, D.goal, D.budget, D.date ? "call " + D.date + " " + (D.time || "") : ""].filter(Boolean).join(" · ")) + "</p>" : "") +
            '<p class="muted"><small>Page ' + esc(l.page || "?") + (l.source ? " · from " + esc(l.source) : "") + (l.campaign ? " · campaign " + esc(l.campaign) : "") + "</small></p>" +
            '<div class="btn-row"><select class="ad-in eq-st" aria-label="Status"' + (j.canEdit ? "" : " disabled") + ">" + opts(l.status) + "</select>" + (l.email ? '<a class="btn sm" href="mailto:' + esc(l.email) + '">Email</a>' : "") + (ph.length >= 10 ? '<a class="btn sm ghost" target="_blank" rel="noopener noreferrer" href="https://wa.me/' + (ph.length === 10 ? "91" + ph : ph) + '">WhatsApp</a>' : "") + "</div>" +
            '<textarea class="ad-in eq-n" rows="2" placeholder="Notes (only the FODO team sees these)"' + (j.canEdit ? "" : " disabled") + ">" + esc(l.notes || "") + "</textarea></div>"; }).join("") + "</div>"
          : '<div class="panel ad-card"><p>No enquiries yet' + (st ? " with status “" + esc(st) + "”" : "") + '. They appear here as soon as someone sends the contact, audit or call form.</p><a class="btn sm" href="/contact/" target="_blank">Open the contact form</a></div>');
      $("#eq-f").onchange = function () { location.hash = "enquiries" + (this.value ? "?status=" + this.value : ""); };
      $("#eq-csv").onclick = function () { csv([["Date", "Type", "Name", "Business", "Email", "Phone", "Status", "Page", "Source", "Campaign", "Notes"]].concat(j.items.map(function (l) { return [l.created_at, l.mode, l.name, l.business, l.email, l.phone, l.status, l.page, l.source, l.campaign, l.notes]; })), "fodo-enquiries.csv"); };
      $$(".ad-lead[data-id]").forEach(function (c) { var id = c.dataset.id, save = function (b) { api("enquiries/" + encodeURIComponent(id), b).then(function (r) { toast(r.ok ? "Saved" : (r.reason || "Not saved"), !r.ok); }); };
        var sel = c.querySelector(".eq-st"), n = c.querySelector(".eq-n"); if (sel) sel.onchange = function () { save({ status: sel.value }); }; if (n) n.onchange = function () { save({ notes: n.value }); }; });
    });
  }
  /* v35: what the report-only Content-Security-Policy would block (grouped; no visitor data) */
  function securityView() {
    api("security").then(function (j) {
      if (!j.ok) return fail(j);
      $("#ad-view").innerHTML = head("Security reports", "fodo.co.in sends a Content-Security-Policy in report-only mode: nothing is blocked yet. Each row is something the policy WOULD block. When a row is a real tool you use, add its address to the policy in _headers; when the list stays empty for a few weeks, the policy can be switched to enforcing.", j.canEdit && j.items.length ? '<button class="btn sm ghost" id="sec-clr" type="button">Clear list</button>' : "") +
        (j.items.length ? '<div class="panel ad-card"><div class="xr-scroll"><table class="ad-t"><thead><tr><th>Directive</th><th>Would block</th><th>Page</th><th>Times</th><th>Last</th></tr></thead><tbody>' + j.items.map(function (x) { return '<tr><td data-l="Directive">' + esc(x.directive) + '</td><td data-l="Would block">' + esc(x.blocked || "?") + '</td><td data-l="Page">' + esc(x.page || "") + '</td><td data-l="Times">' + x.n + '</td><td data-l="Last">' + esc(ago(x.last_at)) + "</td></tr>"; }).join("") + "</tbody></table></div></div>"
          : '<div class="panel ad-card"><p>No reports yet. That is good news: nothing on the site would be blocked by the policy.</p></div>');
      if ($("#sec-clr")) $("#sec-clr").onclick = function () { if (confirm("Clear all reports?")) api("security/clear", {}).then(function () { securityView(); }); };
    });
  }
  /* v34: settings the team changes without a deploy */
  function siteSettingsView() {
    api("site-settings").then(function (j) {
      if (!j.ok) return fail(j); var c = j.config, dis = j.canEdit ? "" : " disabled";
      var F = function (k, label, ph, help, type) { return '<label class="ad-lab">' + label + '<input class="ad-in" name="' + k + '" type="' + (type || "text") + '" value="' + esc(c[k] == null ? "" : c[k]) + '" placeholder="' + esc(ph || "") + '"' + dis + ">" + (help ? '<small class="muted">' + help + "</small>" : "") + "</label>"; };
      $("#ad-view").innerHTML = head("Website settings", "Booking, analytics, review link and the Founding Programme counter for fodo.co.in. Changes go live within a minute, no deploy needed.") +
        '<form id="ss-f" class="panel ad-card ad-form"><h2>Booking</h2>' + F("bookingUrl", "Booking link", "https://cal.com/fodo/30min", "Calendly, Cal.com or Google appointment page. Empty = visitors request a time with the call form.") + F("bookingProvider", "Provider name", "Cal.com") + F("meetingType", "Meeting type", "30-minute growth call") +
        "<h2>Analytics</h2>" + F("ga4Id", "Google Analytics 4 ID", "G-XXXXXXXXXX", "Loads only after a visitor accepts analytics cookies.") + F("metaPixelId", "Meta Pixel ID", "123456789012345", "Same consent rule as GA4.") +
        '<p class="muted"><small>Google Search Console: verify fodo.co.in with a DNS TXT record (Cloudflare → DNS). It needs no code on the site.</small></p>' +
        "<h2>Reviews</h2>" + F("reviewUrl", "Google review link", "https://g.page/r/…/review", "Shown where FODO asks happy clients for a review.") +
        "<h2>Founding Programme</h2>" + F("foundingSlotsTotal", "Total slots", "10", "", "number") + F("foundingSlotsTaken", "Slots taken", "0", "Update as real clients sign; the home page shows the live number.", "number") + F("foundingCohort", "Cohort", "Q4 2026") +
        "<h2>Enquiries</h2>" + F("leadEmail", "Send new enquiries to", "anmol@fodo.co.in", "Leave empty to use the owner email.", "email") +
        (j.canEdit ? '<div class="btn-row"><button class="btn" type="submit">Save settings</button></div>' : '<p class="muted">View-only access.</p>') + '<p class="cf-status" id="ss-s" role="status"></p></form>';
      if (j.canEdit) $("#ss-f").onsubmit = function (ev) { ev.preventDefault(); var b = {}; [].forEach.call(this.querySelectorAll("input[name]"), function (i) { b[i.name] = i.value.trim(); });
        api("site-settings", b).then(function (r) { $("#ss-s").textContent = r.ok ? "Saved ✓ Live within a minute." : (r.errors || [r.reason]).join(" "); $("#ss-s").className = "cf-status " + (r.ok ? "ok" : "warn"); }); };
    });
  }
  function leadsView() {
    api("leads").then(function (j) {
      if (!j.ok) return fail(j);
      $("#ad-view").innerHTML = head("Leads", "People who used up their free X-Rays (or hit a limit) and have not paid yet, they already know the tool works for them. Reach out with an offer.", '<button class="btn sm ghost" id="ad-lcsv" type="button">Export CSV</button>') +
        (j.items.length ? '<div class="ad-leads">' + j.items.map(function (l) { var ph = String(l.phone || "").replace(/\D/g, "").slice(-10);
          return '<div class="panel ad-card ad-lead"><div class="ad-who"><span class="ad-av">' + ini(l) + '</span><div><a href="#user/' + esc(l.id) + '"><b>' + esc(who(l)) + "</b></a><small>" + esc(l.name || "") + (ph ? " · " + esc(ph) : "") + "</small></div></div><p class=\"muted\">" + l.runs + " X-Ray" + (l.runs === 1 ? "" : "s") + " · ran out " + l.hits + "× · last " + esc(ago(l.last_hit)) + "</p>" + (l.domains ? '<p class="ad-dl">' + esc(String(l.domains).split(",").slice(0, 4).join(", ")) + "</p>" : "") +
            '<div class="btn-row">' + (l.email ? '<a class="btn sm" href="mailto:' + esc(l.email) + "?subject=" + encodeURIComponent("Your FODO Business X-Ray") + "&body=" + encodeURIComponent("Hi " + (l.name || "") + ",\n\nThanks for trying the FODO Business X-Ray on " + (String(l.domains || "").split(",")[0] || "your website") + ". I'd love to walk you through what it found and how to fix the top issues.\n\nWould a 15-minute call this week work?\n\nAnmol\nFODO") + '">Email</a>' : "") + (ph ? '<a class="btn sm ghost" href="https://wa.me/91' + ph + '" target="_blank" rel="noopener">WhatsApp</a>' : "") + "</div></div>"; }).join("") + "</div>" : '<div class="panel ad-card"><p class="muted">No leads yet. They appear here as soon as someone runs out of free X-Rays without paying.</p></div>');
      $("#ad-lcsv").onclick = function () { csv([["Email", "Name", "Phone", "X-Rays", "Times ran out", "Last time", "Websites"]].concat(j.items.map(function (l) { return [l.email, l.name, l.phone, l.runs, l.hits, l.last_hit, l.domains]; })), "fodo-leads"); };
    });
  }
  function paymentsView() {
    api("orders").then(function (j) {
      if (!j.ok) return fail(j);
      var paid = j.items.filter(function (o) { return o.status === "PAID"; }), total = paid.reduce(function (a, o) { return a + o.amount; }, 0);
      $("#ad-view").innerHTML = head("Payments", paid.length + " paid · " + inr(total) + " collected", '<button class="btn sm ghost" id="ad-pcsv" type="button">Export CSV</button>') +
        (j.items.length ? '<div class="ad-table"><table><thead><tr><th>Order</th><th>Customer</th><th>What</th><th>Amount</th><th>Status</th><th>When</th></tr></thead><tbody>' + j.items.map(function (o) { return "<tr><td><code>" + esc(o.order_id) + '</code></td><td data-l="Customer">' + (o.uid ? '<a href="#user/' + esc(o.uid) + '">' + esc(o.email) + "</a>" : "—") + '</td><td data-l="What">' + esc(o.kind + " · " + o.item) + '</td><td data-l="Amount"><b>' + inr(o.amount) + '</b></td><td data-l="Status"><span class="ad-tag ' + (o.status === "PAID" ? "ok" : "") + '">' + esc(o.status) + '</span></td><td data-l="When">' + esc(date(o.paid_at || o.created_at, 1)) + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<div class="panel ad-card"><p class="muted">No payments yet. They appear here once payments are switched on and someone buys.</p></div>');
      $("#ad-pcsv").onclick = function () { csv([["Order", "Email", "Kind", "Item", "Amount", "Status", "Created", "Paid"]].concat(j.items.map(function (o) { return [o.order_id, o.email, o.kind, o.item, o.amount, o.status, o.created_at, o.paid_at]; })), "fodo-payments"); };
    });
  }
  function activityView() { api("events?limit=200").then(function (o) { if (!o.ok) return fail(o); $("#ad-view").innerHTML = head("Activity", "The latest 200 actions across all users, updates live.", '<button class="btn sm ghost" id="ad-ecsv" type="button">Export CSV</button>') + '<div class="panel ad-card">' + feed(o.items) + "</div>";
    $("#ad-ecsv").onclick = function () { api("events?limit=5000").then(function (j) { csv([["When", "User", "Action", "Detail"]].concat((j.items || []).map(function (e) { return [e.created_at, e.email || e.phone || e.name, kind(e.kind), e.detail]; })), "fodo-activity"); }); }; }); }
  function teamView() {
    api("viewers").then(function (j) {
      if (!j.ok) return fail(j);
      var admins = j.items.filter(function (v) { return v.role === "admin"; }), viewers = j.items.filter(function (v) { return v.role !== "admin"; });
      var li = function (v) { return "<li><span>" + esc(v.email) + '</span><small>added by ' + esc(v.added_by) + " · " + esc(date(v.added_at)) + "</small>" + (owner() ? '<span class="ad-row"><button class="btn sm ghost" type="button" data-role="' + esc(v.email) + '" data-to="' + (v.role === "admin" ? "viewer" : "admin") + '">' + (v.role === "admin" ? "Make view-only" : "Make admin") + '</button><button class="btn sm ghost" type="button" data-rm="' + esc(v.email) + '">Remove</button></span>' : "") + "</li>"; };
      $("#ad-view").innerHTML = head("Team", "Who can open this dashboard. Everyone logs in with their own email (Google or the email code).") + '<div class="panel ad-card"><h2>Owners</h2><p class="muted">Always full control, can\'t be removed or blocked.</p><ul class="ad-rows ad-team"><li><span>anmol@fodo.co.in</span><span class="ad-tag ok">Owner</span></li><li><span>singhrajputanmol014@gmail.com</span><span class="ad-tag ok">Owner</span></li></ul>' +
        '<h2 style="margin-top:22px">Admins</h2><p class="muted">Full control like an owner: block users, give plans and features free, add or remove team members.</p>' + (admins.length ? '<ul class="ad-rows ad-team">' + admins.map(li).join("") + "</ul>" : '<p class="muted">No admins yet.</p>') +
        '<h2 style="margin-top:22px">View only</h2><p class="muted">Can see everything, can\'t change anything.</p>' + (viewers.length ? '<ul class="ad-rows ad-team">' + viewers.map(li).join("") + "</ul>" : '<p class="muted">Nobody yet.</p>') +
        (owner() ? '<h2 style="margin-top:22px">Add someone</h2><form class="ad-row" id="ad-vf"><input type="email" id="ad-ve" class="ad-in" placeholder="teammate@company.com" aria-label="Email" required><select id="ad-vr" class="ad-in" aria-label="Role"><option value="viewer">View only</option><option value="admin">Admin (full control)</option></select><button class="btn sm" type="submit">Add</button></form>' : "") + "</div>";
      if (!owner()) return;
      $("#ad-vf").onsubmit = function (e) { e.preventDefault(); var em = $("#ad-ve").value.trim(), rl = $("#ad-vr").value;
        (rl === "admin" ? ask({ title: "Make " + em + " an admin?", text: "Admins have full control: they can block users, give anything free and add other admins.", ok: "Make admin" }) : Promise.resolve(true)).then(function (ok) { if (ok) api("viewers", { email: em, role: rl }).then(function (r) { if (r.ok) { toast(rl === "admin" ? "Admin added" : "Viewer added"); teamView(); } else toast(r.reason, true); }); }); };
      $("#ad-view").querySelectorAll("[data-rm]").forEach(function (b) { b.onclick = function () { ask({ title: "Remove " + b.dataset.rm + "?", text: "They lose access to this dashboard at once.", ok: "Remove", danger: true }).then(function (ok) { if (ok) api("viewers", { email: b.dataset.rm, remove: true }).then(function (r) { toast(r.ok ? "Removed" : r.reason, !r.ok); teamView(); }); }); }; });
      $("#ad-view").querySelectorAll("[data-role]").forEach(function (b) { b.onclick = function () { api("viewers", { email: b.dataset.role, role: b.dataset.to }).then(function (r) { toast(r.ok ? (b.dataset.to === "admin" ? "Now an admin" : "Now view-only") : r.reason, !r.ok); teamView(); }); }; });
    });
  }
  /* ---------- website traffic (first-party, all visitors, logged in or not) ---------- */
  var tDays = +(sessionStorage.getItem("ad-tdays") || 30), CC = { IN: "India", US: "United States", GB: "United Kingdom", AE: "UAE", CA: "Canada", AU: "Australia", SG: "Singapore", SA: "Saudi Arabia", QA: "Qatar", DE: "Germany", FR: "France", NZ: "New Zealand", ZA: "South Africa", NP: "Nepal", BD: "Bangladesh", PK: "Pakistan", LK: "Sri Lanka", XX: "Unknown" };
  var EVN = { whatsapp_click: "WhatsApp clicks", phone_click: "Phone clicks", email_click: "Email clicks", booking_click: "Booking clicks", audit_cta_click: "Free-audit clicks", cta_click: "Button clicks", outbound_click: "Clicks to other sites", form_submit: "Forms sent", tool_use: "Growth Lab tool used", generate_lead: "Leads (thank-you page)", xray_start: "X-Rays started", xray_complete: "X-Rays finished", xray_export: "X-Ray downloads", cf_search: "Competitor searches", cf_export: "Competitor sheet downloads", bot_answer: "Chatbot answers", scroll_depth: "Read 75% of a page" };
  var tdim = function (T, k) { return (T.dims[k] || []); }, tot = function (T, k) { var r = tdim(T, k)[0]; return r ? r.n : 0; };
  var trend = function (now, before) { if (!before) return now ? '<small class="up">new</small>' : ""; var p = Math.round(100 * (now - before) / before); return '<small class="' + (p >= 0 ? "up" : "down") + '">' + (p >= 0 ? "▲ " : "▼ ") + Math.abs(p) + "%</small>"; };
  var secs = function (s) { s = Math.round(s || 0); return s < 60 ? s + " s" : Math.floor(s / 60) + " m " + (s % 60) + " s"; };
  function tTable(id, title, rows, cols, note) {
    return '<div class="panel ad-card ad-tt"><div class="ad-ch"><h2>' + esc(title) + '</h2><button class="btn sm ghost" type="button" data-tcsv="' + id + '">CSV</button></div>' + (note ? '<p class="muted ad-note">' + note + "</p>" : "") +
      (rows.length ? '<div class="ad-scroll"><table class="ad-mt" id="' + id + '"><thead><tr>' + cols.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" + rows.map(function (r) { return "<tr>" + r.map(function (v, i) { return "<td>" + (i === 1 && typeof r[r.length - 1] === "number" && r._bar != null ? "" : "") + v + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>" : '<p class="muted">No data yet for this period.</p>') + "</div>";
  }
  function insightsOf(T) {
    var out = [], uv = tot(T, "uv"), pv = tot(T, "pv"), ses = tot(T, "ses") || 1, ch = {}, chT = 0; tdim(T, "ch").forEach(function (r) { ch[r.k] = r.n; chT += r.n; });
    var pc = function (k) { return chT ? Math.round(100 * (ch[k] || 0) / chT) : 0; };
    if (!pv) return [["info", "No visits recorded yet. Data starts the moment this version is live, check back after a few visitors."]];
    if (pc("Direct") >= 45) out.push(["warn", pc("Direct") + "% of visits show no source (typed address, WhatsApp/Instagram apps, bookmarks). Add UTM tags to every link you share, e.g. fodo.co.in/?utm_source=instagram&utm_medium=social, so you can see which post works."]);
    if (pc("Search") < 25) out.push(["warn", "Google & other search engines bring only " + pc("Search") + "% of visits. SEO is your biggest free channel: write pages for the searches your buyers use (run the Business X-Ray on fodo.co.in itself)."]); else out.push(["ok", "Search brings " + pc("Search") + "% of visits, keep publishing pages for the searches buyers use."]);
    if (ch["AI assistants"]) out.push(["ok", ch["AI assistants"] + " visits came from AI assistants (ChatGPT, Perplexity, Gemini…). Keep FAQs, schema and clear service pages, that's what they quote."]); else out.push(["info", "No visits from ChatGPT / Perplexity / Gemini yet. Clear FAQ pages, schema and being listed on directories help AI assistants recommend you."]);
    if (pc("Social") >= 10) out.push(["ok", "Social brings " + pc("Social") + "% of visits, the best social source is " + esc(((tdim(T, "src").filter(function (r) { return /Facebook|Instagram|LinkedIn|YouTube|X \(|WhatsApp|Threads/.test(r.k); })[0]) || {}).k || "—") + "."]); else out.push(["warn", "Social media sends only " + pc("Social") + "% of visits. Put the website link in every Instagram/LinkedIn bio and post, with UTM tags."]);
    var dev = {}; tdim(T, "device").forEach(function (r) { dev[r.k] = r.n; }); var mob = uv ? Math.round(100 * (dev.Mobile || 0) / uv) : 0;
    if (mob >= 55) out.push(["info", mob + "% of visitors use a phone, check every new page on mobile first (speed, tap targets, WhatsApp button)."]);
    var conv = tot(T, "conv"); out.push([conv ? "ok" : "warn", conv ? conv + " key actions (WhatsApp, calls, forms, audits, X-Rays) = " + (Math.round(1000 * conv / ses) / 10) + "% of visits. Industry average for service sites is roughly 2–5%." : "No key actions yet (WhatsApp, calls, forms, X-Rays). Make the main button on each page obvious."]);
    var cs = {}; tdim(T, "conv_src").forEach(function (r) { cs[r.k] = r.n; }); var best = tdim(T, "uv_src").filter(function (r) { return r.n >= 5; }).map(function (r) { return [r.k, (cs[r.k] || 0) / r.n]; }).sort(function (a, b) { return b[1] - a[1]; })[0];
    if (best && best[1] > 0) out.push(["ok", "Visitors from " + esc(best[0]) + " take action most often (" + Math.round(100 * best[1]) + "% of them). Spend more effort there."]);
    var tsum = {}, tcnt = {}; tdim(T, "tsum").forEach(function (r) { tsum[r.k] = r.n; }); tdim(T, "tcnt").forEach(function (r) { tcnt[r.k] = r.n; });
    var cpage = {}; tdim(T, "conv_page").forEach(function (r) { cpage[r.k] = r.n; });
    var weak = tdim(T, "page").filter(function (r) { return r.n >= 20 && !/^\/(legal|thank-you|account|admin)/.test(r.k); }).map(function (r) { return [r.k, r.n, (cpage[r.k] || 0) / r.n, tcnt[r.k] ? tsum[r.k] / tcnt[r.k] : null]; });
    weak.filter(function (w) { return w[2] === 0; }).slice(0, 2).forEach(function (w) { out.push(["warn", esc(w[0]) + " had " + w[1] + " views but no key action. Add a clear call-to-action (WhatsApp / free audit) near the top."]); });
    weak.filter(function (w) { return w[3] != null && w[3] < 15; }).slice(0, 2).forEach(function (w) { out.push(["warn", "People leave " + esc(w[0]) + " after " + secs(w[3]) + " on average, the first screen isn't holding them. Make the headline say who it's for and what they get."]); });
    var top = tdim(T, "page")[0]; if (top) out.push(["info", "Most viewed page: " + esc(top.k) + " (" + top.n + " views). Make sure it links to your money pages (services, contact, X-Ray)."]);
    var ind = 0; tdim(T, "country").forEach(function (r) { if (r.k === "IN") ind = r.n; }); if (uv && ind / uv < 0.7) out.push(["info", Math.round(100 * (1 - ind / uv)) + "% of visitors are outside India, your global pages (UAE, UK, USA) matter."]);
    if (T.prev.uv) { var g = Math.round(100 * (uv - T.prev.uv) / T.prev.uv); out.push([g >= 0 ? "ok" : "warn", "Visitors are " + (g >= 0 ? "up " : "down ") + Math.abs(g) + "% vs the previous " + T.days.length + " days."]); }
    return out;
  }
  function trafficView(silent) {
    api("traffic?days=" + tDays).then(function (T) {
      if (!T.ok) return fail(T); window.__T = T;
      var uv = tot(T, "uv"), pv = tot(T, "pv"), ses = tot(T, "ses"), conv = tot(T, "conv"), ts = tot(T, "tsum"), tc = tot(T, "tcnt");
      var m = function (k) { var o = {}; tdim(T, k).forEach(function (r) { o[r.k] = r.n; }); return o; };
      var uvs = m("uv_src"), cs = m("conv_src"), sesS = m("src"), uvc = m("uv_ch"), cch = m("conv_ch"), tsum = m("tsum"), tcnt = m("tcnt"), cpage = m("conv_page"), entry = m("entry");
      var pct = function (a, b) { return b ? Math.round(1000 * a / b) / 10 + "%" : "—"; }, sumT = function (k) { return tdim(T, k).reduce(function (a, r) { return a + r.n; }, 0); };
      var KP = function (n, l, sub) { return '<div class="ad-kpi"><b>' + n + "</b><span>" + l + "</span>" + (sub ? "<small>" + sub + "</small>" : "") + "</div>"; };
      var sel = sessionStorage.getItem("ad-tchart") || "uv", SETS = { uv: [{ n: "visitors", v: T.series.uv, c: "c1" }], pv: [{ n: "page views", v: T.series.pv, c: "c3" }], ses: [{ n: "visits", v: T.series.ses, c: "c2" }], conv: [{ n: "key actions", v: T.series.conv, c: "c4" }] };
      var chRows = tdim(T, "ch").map(function (r) { return [esc(r.k), r.n, pct(r.n, ses), uvc[r.k] || 0, cch[r.k] || 0, pct(cch[r.k] || 0, r.n)]; });
      var srcRows = tdim(T, "src").map(function (r) { return [esc(r.k), uvs[r.k] || 0, r.n, cs[r.k] || 0, pct(cs[r.k] || 0, r.n)]; });
      var pageRows = tdim(T, "page").slice(0, 60).map(function (r) { return ['<a href="' + esc(r.k) + '" target="_blank" rel="noopener">' + esc(r.k) + "</a>", r.n, entry[r.k] || 0, tcnt[r.k] ? secs(tsum[r.k] / tcnt[r.k]) : "—", cpage[r.k] || 0]; });
      var simple = function (k, map) { return tdim(T, k).slice(0, 40).map(function (r) { return [esc(map ? map(r.k) : r.k), r.n, pct(r.n, sumT(k))]; }); };
      var evRows = tdim(T, "ev").map(function (r) { return [esc(EVN[r.k] || r.k), r.n]; });
      var evd = tdim(T, "evd").slice(0, 40).map(function (r) { var a = r.k.split("|"); return [esc(EVN[a[0]] || a[0]), esc(a.slice(1).join("|")), r.n]; });
      var live = T.live, ins = insightsOf(T);
      $("#ad-view").innerHTML = head("Traffic", "Every visitor to fodo.co.in, logged in or not. No cookies; a visitor is counted once a day.", '<div class="ad-chips">' + [7, 30, 90].map(function (d) { return '<button type="button" class="chip" data-td="' + d + '" aria-pressed="' + (d === tDays) + '">' + d + " days</button>"; }).join("") + '</div><button class="btn sm ghost" id="ad-txls" type="button">Export Excel</button>') +
        '<div class="ad-kpis">' + KP(uv, "visitors", trend(uv, T.prev.uv)) + KP(ses, "visits", trend(ses, T.prev.ses)) + KP(pv, "page views", (ses ? (Math.round(10 * pv / ses) / 10) + " pages a visit" : "")) + KP(tc ? secs(ts / tc) : "—", "avg time on a page", "") + KP(conv, "key actions", pct(conv, ses) + " of visits " + trend(conv, T.prev.conv)) +
        '<div class="ad-kpi live"><b>' + live.now + '</b><span><i class="ad-dot"></i> on the site now</span><small>' + (live.pages[0] ? esc(live.pages.map(function (p) { return p.path + " (" + p.n + ")"; }).slice(0, 3).join(" · ")) : "last 5 minutes") + "</small></div></div>" +
        '<div class="ad-grid2"><div class="panel ad-card"><div class="ad-ch"><h2>Daily</h2><div class="ad-chips" role="group">' + [["uv", "Visitors"], ["ses", "Visits"], ["pv", "Page views"], ["conv", "Key actions"]].map(function (c) { return '<button type="button" class="chip" data-tc="' + c[0] + '" aria-pressed="' + (c[0] === sel) + '">' + c[1] + "</button>"; }).join("") + "</div></div>" + lineChart(T.days, SETS[sel]) + "</div>" +
          '<div class="panel ad-card ad-ins"><h2>What to work on</h2><ul>' + ins.map(function (x) { return '<li class="' + x[0] + '">' + x[1] + "</li>"; }).join("") + "</ul></div></div>" +
        '<div class="ad-grid2">' + tTable("t-ch", "Channels, where visitors come from", chRows, ["Channel", "Visits", "Share", "New visitors", "Key actions", "Action rate"], "Search = Google/Bing · Social = Instagram, Facebook, LinkedIn… · AI assistants = ChatGPT, Perplexity, Gemini · Direct = typed address or apps that hide the source.") +
          tTable("t-src", "Sources", srcRows, ["Source", "New visitors", "Visits", "Key actions", "Action rate"]) + "</div>" +
        tTable("t-page", "Pages", pageRows, ["Page", "Views", "Visits started here", "Avg time", "Key actions"]) +
        '<div class="ad-grid3">' + tTable("t-ref", "Referring websites", simple("ref"), ["Website", "Visits", "Share"]) + tTable("t-camp", "Campaigns (UTM)", simple("camp"), ["Campaign · source", "Visits", "Share"], "Tag links with ?utm_source=…&utm_campaign=… to see them here.") + tTable("t-ev", "Clicks & actions", evRows, ["Action", "Count"]) + "</div>" +
        '<div class="ad-grid3">' + tTable("t-country", "Countries", simple("country", function (k) { return (CC[k] || k); }), ["Country", "Visitors", "Share"]) + tTable("t-city", "Cities", simple("city"), ["City", "Visitors", "Share"]) + tTable("t-dev", "Devices", simple("device").concat(simple("os").map(function (r) { r[0] = "· " + r[0]; return r; })), ["Device / system", "Visitors", "Share"]) + "</div>" +
        '<div class="ad-grid3">' + tTable("t-br", "Browsers", simple("browser"), ["Browser", "Visitors", "Share"]) + tTable("t-lang", "Languages", simple("lang"), ["Language", "Visitors", "Share"]) + tTable("t-evd", "Top buttons & tools", evd, ["Type", "Which", "Count"]) + "</div>" +
        tTable("t-live", "Right now (last 30 minutes)", (live.visitors || []).map(function (v) { return [esc(v.src), esc(CC[v.country] || v.country), esc(v.device), v.n]; }), ["Source", "Country", "Device", "Visitors"]) +
        '<p class="muted ad-note">FODO counts visitors itself (no Google Analytics needed). Old data stays for 400 days. Bots and crawlers are left out.</p>';
      $("#ad-view").querySelectorAll("[data-td]").forEach(function (b) { b.onclick = function () { tDays = +b.dataset.td; sessionStorage.setItem("ad-tdays", tDays); trafficView(); }; });
      $("#ad-view").querySelectorAll("[data-tc]").forEach(function (b) { b.onclick = function () { sessionStorage.setItem("ad-tchart", b.dataset.tc); trafficView(); }; });
      $("#ad-view").querySelectorAll("[data-tcsv]").forEach(function (b) { b.onclick = function () { var t = $("#" + b.dataset.tcsv); if (!t) return; csv([].slice.call(t.querySelectorAll("tr")).map(function (tr) { return [].slice.call(tr.children).map(function (c) { return c.textContent; }); }), "fodo-" + b.dataset.tcsv.slice(2) + "-" + tDays + "d"); }; });
      $("#ad-txls").onclick = function () { exportAll(["traffic"]); };
    });
  }
  /* ---------- export everything to one Excel file ---------- */
  function exportAll(only) {
    var X = window.FODO_EXPORT; if (!X) return toast("Excel export is not loaded.", true);
    toast("Preparing the Excel file…");
    var want = function (k) { return !only || only.indexOf(k) > -1; };
    Promise.all([want("users") ? api("users?all=1") : null, want("runs") ? api("runs") : null, want("orders") ? api("orders") : null, want("leads") ? api("leads") : null, want("events") ? api("events?limit=5000") : null, api("traffic?days=" + (only ? tDays : 90)), want("overview") ? api("overview") : null, want("lab") ? api("lab?days=90") : null, want("businesses") ? api("businesses") : null, want("findings") ? api("findings?days=365") : null, want("costs") ? api("costs?days=90") : null, want("monitoring") ? api("monitoring") : null]).then(function (r) {
      var sh = [], S = function (name, rows) { if (rows && rows.length > 1) sh.push({ name: name, rows: rows.map(function (row) { return row.map(function (v) { if (typeof v === "number") return v; v = v == null ? "" : String(v); return /^[=+\-@]/.test(v) ? "'" + v : v; }); }) }); };
      var O = r[6]; if (O && O.ok) S("Summary", [["FODO Growth Lab, exported " + new Date().toLocaleString("en-IN")], ["Users", O.users.total], ["New this week", O.users.new7], ["Active this week", O.active7], ["Paying users", O.users.paid], ["X-Rays run", O.runs.total], ["Revenue (INR)", O.money.revenue], ["Revenue this month", O.money.month], ["Signed up", O.funnel.signed], ["Ran 1st X-Ray", O.funnel.ran1], ["Ran 2+", O.funnel.ran2], ["Ran out of free", O.funnel.limited], ["Paid", O.funnel.paid]].concat([[], ["Feature (30 days)", "Uses", "Users"]]).concat(O.features.map(function (f) { return [kind(f.kind), f.n, f.users]; })));
      if (r[0] && r[0].ok) S("Users", [["Email", "Phone", "Name", "Login via", "Plan", "Plan until", "X-Rays run", "Paid INR", "Blocked", "Unlimited", "Extra features", "Joined", "Last login"]].concat(r[0].items.map(function (u) { return [u.email, u.phone, u.name, u.login_via, u.plan, u.plan_until, u.runs, u.paid, u.blocked ? "yes" : "", u.unlimited ? "yes" : "", u.extra_features, u.created_at, u.last_login]; })));
      if (r[1] && r[1].ok) S("X-Rays", [["Website", "Email", "Level", "Credit", "Score", "Status", "When"]].concat(r[1].items.map(function (x) { return [x.domain, x.email, x.tier, x.credit, x.score, x.status, x.created_at]; })));
      if (r[2] && r[2].ok) S("Payments", [["Order", "Email", "Kind", "Item", "Amount", "Status", "Created", "Paid"]].concat(r[2].items.map(function (o) { return [o.order_id, o.email, o.kind, o.item, o.amount, o.status, o.created_at, o.paid_at]; })));
      if (r[3] && r[3].ok) S("Leads", [["Email", "Name", "Phone", "X-Rays", "Times ran out", "Last time", "Websites"]].concat(r[3].items.map(function (l) { return [l.email, l.name, l.phone, l.runs, l.hits, l.last_hit, l.domains]; })));
      if (r[4] && r[4].ok) S("Activity", [["When", "User", "Action", "Detail"]].concat(r[4].items.map(function (e) { return [e.created_at, e.email || e.phone || e.name, kind(e.kind), e.detail]; })));
      var T = r[5]; if (T && T.ok) { S("Traffic daily", [["Day", "Visitors", "Visits", "Page views", "Key actions"]].concat(T.days.map(function (d, i) { return [d, T.series.uv[i], T.series.ses[i], T.series.pv[i], T.series.conv[i]]; })));
        [["src", "Sources"], ["ch", "Channels"], ["page", "Pages"], ["entry", "Entry pages"], ["ref", "Referrers"], ["camp", "Campaigns"], ["country", "Countries"], ["city", "Cities"], ["device", "Devices"], ["browser", "Browsers"], ["os", "Systems"], ["ev", "Actions"], ["conv_src", "Actions by source"], ["conv_page", "Actions by page"]].forEach(function (x) { S("Traffic " + x[1], [[x[1], "Count"]].concat((T.dims[x[0]] || []).map(function (d) { return [x[0] === "country" ? (CC[d.k] || d.k) : x[0] === "ev" ? (EVN[d.k] || d.k) : d.k, d.n]; }))); }); }
      var GL = r[7]; if (GL && GL.ok) { S("Growth Lab tools", [["Tool", "Path", "Views", "Started", "Completed", "Completion %", "Logged-in uses", "Users", "Avg time (s)"]].concat(GL.tools.map(function (t) { return [t.name, t.path, t.views, t.started, t.completed, t.completionRate, t.loggedInUses, t.users, t.avgTimeSec]; }))); S("Funnel (90 days)", [["Step", "Count", "Source"]].concat(GL.funnel.map(function (f) { return [f.step, f.n, f.note]; }))); S("Industries", [["Industry", "X-Rays"]].concat(GL.industries.map(function (x) { return [x.k, x.n]; }))); S("Locations", [["Location", "X-Rays"]].concat(GL.locations.map(function (x) { return [x.k, x.n]; }))); }
      if (r[8] && r[8].ok) S("Businesses", [["Business", "Domain", "Industry", "Location", "Latest score", "Data %", "X-Rays", "Users", "Last X-Ray"]].concat(r[8].items.map(function (b) { return [b.name, b.domain, b.industry, b.location, b.score, b.data, b.runs, b.users, b.last]; })));
      if (r[9] && r[9].ok) { S("Top findings", [["Problem", "Reports", "Share %", "Avg priority", "P0"]].concat(r[9].opportunities.map(function (x) { return [x.title, x.reports, x.share, x.score, x.p0]; }))); S("Failing checks", [["Check", "Area", "Fails", "Warnings", "Reports"]].concat(r[9].checks.map(function (c) { return [c.name || c.id, c.area, c.fails, c.warns, c.reports]; }))); }
      if (r[10] && r[10].ok) { S("API cost per report", [["Website", "Job", "Level", "Calls", "Cached", "Data %", "Cost INR", "When"]].concat(r[10].reports.map(function (x) { return [x.domain, x.job_id, x.tier, x.calls, x.cached, x.completeness, x.costInr, x.created_at]; }))); S("API cost by provider", [["Provider", "Calls", "Cached", "Failed", "Cost INR"]].concat(r[10].byProvider.map(function (x) { return [x.provider, x.calls, x.cached, x.failed, x.costInr]; }))); S("Profit per plan", [["Plan", "Price", "X-Rays", "Price per X-Ray", "Runs", "Avg API cost", "Contribution per X-Ray", "Margin %"]].concat(r[10].plans.map(function (x) { return [x.name, x.price, x.xrays, x.pricePerXray, x.runs, x.avgCostInr, x.contributionPerXray, x.marginPct]; }))); }
      if (r[11] && r[11].ok) { S("Monitored websites", [["Website", "Type", "User", "Checks", "Last check", "Status"]].concat(r[11].targets.map(function (t) { return [t.domain, t.kind, t.email, t.checks, t.last_check, t.last_status]; }))); S("Monitoring changes", [["When", "Website", "Severity", "What", "User"]].concat(r[11].events.map(function (e) { return [e.t, e.domain, e.severity, e.what, e.email]; }))); }
      if (!sh.length) return toast("Nothing to export yet.", true);
      X.deliver(X.xlsx(sh.map(function (x) { x.name = x.name.slice(0, 31); return x; }), { title: "FODO admin export" }), "FODO-admin-export-" + new Date().toISOString().slice(0, 10) + ".xlsx", { kind: "Excel" });
    });
  }
  start();
})();
