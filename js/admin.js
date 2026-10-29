/* FODO Admin — the team dashboard at /admin/ (v15).
   Data: /api/admin/* (server checks who you are on every call). Owners (the two FODO owner logins) can block users and give
   plans, X-Rays or single features free; viewers added under Team can only look. Login uses the site's own login (js/account.js). */
(function () {
  "use strict";
  var A = window.FODO_ACCOUNT, root = document.getElementById("adm"); if (!A || !root) return;
  var esc = A.esc, inr = function (n) { return "₹" + Math.round(+n || 0).toLocaleString("en-IN"); }, $ = function (s, el) { return (el || document).querySelector(s); };
  var ME = null, OV = null;
  var api = function (p, body) { return fetch("/api/admin/" + p, { method: body === undefined ? "GET" : "POST", credentials: "same-origin", headers: body === undefined ? {} : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }).then(function (r) { return r.json().catch(function () { return { ok: false, reason: "Bad answer (" + r.status + ")" }; }).then(function (j) { j._status = r.status; return j; }); }, function () { return { ok: false, reason: "No connection." }; }); };
  var date = function (s, t) { if (!s) return "—"; var d = new Date(s); return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + (t ? " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""); };
  var ago = function (s) { if (!s) return "never"; var m = (Date.now() - Date.parse(s)) / 6e4; return m < 1 ? "just now" : m < 60 ? Math.round(m) + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago"; };
  var KIND = { login_google: "Logged in · Google", login_email: "Logged in · email code", xray_start: "Started an X-Ray", xray_done: "Finished an X-Ray", xray_refund: "X-Ray refunded (site unreadable)", limit_hit: "Ran out of X-Rays", checkout: "Opened payment", paid: "Paid",
    export_pdf: "Downloaded PDF", export_xlsx: "Downloaded Excel", export_csv: "Downloaded findings CSV", export_plan: "Downloaded plan CSV", export_json: "Downloaded JSON", share: "Copied share link", finder_export: "Downloaded competitor sheet",
    edge_fixPack: "FODO Edge · AI Fix Pack", edge_battleCards: "FODO Edge · Battle cards", edge_roadmap90: "FODO Edge · 90-day roadmap", edge_clientPitch: "FODO Edge · Client pitch", linkcheck: "Broken-link check", authority: "Domain authority", copy_schema: "Copied schema code", copy_pitch: "Copied client pitch", blocked_try: "Tried to log in while blocked", admin_grant: "Given free by FODO", admin_block: "Blocked / unblocked by FODO" };
  var kind = function (k) { return KIND[k] || k; };
  var PLAN_C = { free: "", starter: "t-s", growth: "t-g", pro: "t-p", agency: "t-a", owner: "t-o" };
  var badge = function (plan) { return '<span class="ad-plan ' + (PLAN_C[plan] || "") + '">' + esc(plan) + "</span>"; };
  var csv = function (rows, name) { var t = rows.map(function (r) { return r.map(function (v) { v = v == null ? "" : String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\n"); var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + t], { type: "text/csv" })); a.download = name + "-" + new Date().toISOString().slice(0, 10) + ".csv"; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 500); };
  var toast = function (t, bad) { var el = document.createElement("div"); el.className = "ad-toast" + (bad ? " bad" : ""); el.textContent = t; el.setAttribute("role", "status"); document.body.appendChild(el); setTimeout(function () { el.classList.add("out"); }, 2600); setTimeout(function () { el.remove(); }, 3100); };
  var owner = function () { return ME && ME.role === "owner"; };

  /* ---------- shell ---------- */
  var TABS = [["overview", "Overview", "M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z"], ["users", "Users", "M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4zM8 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.7 0-6 1.3-6 4v2h8v-2c0-1 .4-2 1.1-2.8A9 9 0 0 0 8 13zm8 0c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z"],
    ["xrays", "X-Rays", "M11 2a9 9 0 1 0 5.6 16l4.7 4.7 1.4-1.4-4.7-4.7A9 9 0 0 0 11 2zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14z"], ["leads", "Leads", "M12 2l2.9 6.9L22 9.3l-5.5 4.7L18.2 21 12 17.3 5.8 21l1.7-7L2 9.3l7.1-.4z"],
    ["payments", "Payments", "M2 6h20v12H2zm2 2v2h16V8zm0 6v2h6v-2z"], ["activity", "Activity", "M3 12h4l3-8 4 16 3-8h4"], ["team", "Team", "M12 1l9 4v6c0 5-3.8 9.7-9 11-5.2-1.3-9-6-9-11V5z"]];
  var ico = function (d) { return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>'; };
  function shell() {
    root.innerHTML = '<header class="ad-top"><a class="wordmark" href="/" aria-label="FODO home"><b class="so-mark">FOD<span class="so">O<i></i></span></b><small>FEAR OF DIGITALLY OUT ?</small></a><span class="ad-badge">ADMIN</span><span class="ad-sp"></span>' +
      '<span class="ad-role ' + esc(ME.role) + '">' + (owner() ? "Owner · full control" : "View only") + '</span><button class="ad-ib" type="button" id="ad-theme" aria-label="Dark / light">◐</button><button class="ad-ib ad-me" type="button" id="ad-out" title="Log out">' + esc((ME.name || ME.email).charAt(0).toUpperCase()) + "</button></header>" +
      '<nav class="ad-nav" aria-label="Dashboard">' + TABS.map(function (t) { return '<a href="#' + t[0] + '" data-tab="' + t[0] + '">' + ico(t[2]) + "<span>" + t[1] + "</span></a>"; }).join("") + '<a class="ad-site" href="/" target="_blank" rel="noopener">' + ico("M14 3h7v7M10 14 21 3M19 14v7H3V5h7") + "<span>Open fodo.co.in</span></a></nav>" +
      '<main class="ad-main" id="ad-view" tabindex="-1"></main>';
    $("#ad-out").onclick = function () { if (confirm("Log out of " + ME.email + "?")) A.logout().then(function () { location.reload(); }); };
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
  function route() {
    var h = (location.hash || "#overview").slice(1), parts = h.split("/"), tab = parts[0] || "overview";
    root.querySelectorAll(".ad-nav a[data-tab]").forEach(function (a) { var on = a.dataset.tab === tab || (tab === "user" && a.dataset.tab === "users"); a.classList.toggle("on", on); if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    var v = $("#ad-view"); v.innerHTML = '<div class="ad-load">Loading…</div>';
    ({ overview: overview, users: usersView, user: function () { userView(parts[1]); }, xrays: runsView, leads: leadsView, payments: paymentsView, activity: activityView, team: teamView }[tab] || overview)();
    scrollTo(0, 0);
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
      $("#ad-view").innerHTML = head("Overview", "Live from the Growth Lab database · " + new Date().toLocaleString("en-IN"), '<button class="btn sm ghost" id="ad-ref" type="button">Refresh</button>') +
        '<div class="ad-kpis">' + kpi(U.total || 0, "users", "+" + (U.new7 || 0) + " this week · +" + (U.new30 || 0) + " in 30 days") + kpi(o.active1, "active today", o.active7 + " active this week") + kpi(R.total || 0, "X-Rays run", (R.last7 || 0) + " this week · avg score " + (R.avgScore == null ? "—" : R.avgScore)) +
          kpi(U.paid || 0, "paying users", (U.gifted || 0) + " given free · " + (U.blocked || 0) + " blocked", "ok") + kpi(inr(M.revenue), "revenue (all time)", inr(M.month) + " this month · " + (M.paidOrders || 0) + " payments", "money") + kpi(F.signed ? Math.round(100 * F.paid / F.signed) + "%" : "—", "sign-up → paid", (F.limited || 0) + " ran out of free X-Rays") + "</div>" +
        '<div class="ad-grid2"><div class="panel ad-card"><div class="ad-ch"><h2>Last 30 days</h2><div class="ad-chips" role="group" aria-label="Chart">' + [["xrays", "X-Rays", sum(s.xrays)], ["signups", "Sign-ups", sum(s.signups)], ["logins", "Logins", sum(s.logins)], ["revenue", "Revenue", inr(sum(s.revenue))]].map(function (c) { return '<button type="button" class="chip" aria-pressed="' + (c[0] === chartSel) + '" data-chart="' + c[0] + '">' + c[1] + " <b>" + c[2] + "</b></button>"; }).join("") + "</div></div>" + lineChart(o.days, SETS[chartSel]) + "</div>" +
        '<div class="panel ad-card"><h2>Funnel</h2><ul class="ad-funnel">' + funnel.map(function (f, i) { return "<li><span>" + f[0] + "</span>" + bar(f[1], fmax, "f" + i) + "<b>" + (f[1] || 0) + "</b><small>" + (i && funnel[0][1] ? Math.round(100 * (f[1] || 0) / funnel[0][1]) + "%" : "") + "</small></li>"; }).join("") + '</ul><p class="muted ad-tip">“Ran out of free X-Rays” are your warmest sales leads — see <a href="#leads">Leads</a>.</p></div></div>' +
        '<div class="ad-grid3"><div class="panel ad-card"><h2>Feature use · 30 days</h2>' + (o.features.length ? '<ul class="ad-rows">' + o.features.map(function (f) { return "<li><span>" + esc(kind(f.kind)) + "</span>" + bar(f.n, fmx) + "<b>" + f.n + "</b><small>" + f.users + " user" + (f.users === 1 ? "" : "s") + "</small></li>"; }).join("") + "</ul>" : '<p class="muted">Nothing yet.</p>') + "</div>" +
        '<div class="panel ad-card"><h2>Users by plan</h2><ul class="ad-rows">' + plans.map(function (p) { return "<li><span>" + badge(p[0]) + "</span>" + bar(p[1], pmax, PLAN_C[p[0]]) + "<b>" + p[1] + "</b></li>"; }).join("") + "</ul><h2 style=\"margin-top:20px\">X-Rays by level</h2><ul class=\"ad-rows\">" + o.tiers.map(function (t) { return "<li><span>" + badge(t.tier) + "</span>" + bar(t.n, R.total) + "<b>" + t.n + "</b></li>"; }).join("") + "</ul></div>" +
        '<div class="panel ad-card"><h2>Most X-Rayed websites</h2>' + (o.domains.length ? '<ul class="ad-rows ad-doms">' + o.domains.map(function (d) { return '<li><span><a href="#xrays/' + encodeURIComponent(d.domain) + '">' + esc(d.domain) + "</a></span><b>" + d.n + "×</b><small>score " + (d.score == null ? "—" : d.score) + "</small></li>"; }).join("") + "</ul>" : '<p class="muted">No X-Rays yet.</p>') + "</div></div>" +
        '<div class="panel ad-card"><div class="ad-ch"><h2>Latest activity</h2><a href="#activity">See all →</a></div>' + feed(o.recent.slice(0, 12)) + "</div>";
      $("#ad-ref").onclick = overview;
      $("#ad-view").querySelectorAll("[data-chart]").forEach(function (b) { b.onclick = function () { sessionStorage.setItem("ad-chart", b.dataset.chart); overview(); }; });
    });
  }
  function feed(list) { return list.length ? '<ol class="ad-feed">' + list.map(function (e) { return '<li><i class="k ' + esc(e.kind.split("_")[0]) + '"></i><div><b>' + esc(kind(e.kind)) + "</b>" + (e.detail ? ' <span class="muted">' + esc(e.detail) + "</span>" : "") + "<br><small>" + (e.uid ? '<a href="#user/' + esc(e.uid) + '">' + esc(e.email || "") + "</a> · " : "") + esc(ago(e.created_at)) + "</small></div></li>"; }).join("") + "</ol>" : '<p class="muted">Nothing yet.</p>'; }
  function fail(j) { $("#ad-view").innerHTML = '<div class="panel ad-card"><p class="cf-status warn">' + esc(j.reason || "Could not load.") + "</p></div>"; }

  /* ---------- users ---------- */
  var uq = "", uf = "";
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
          return '<tr data-u="' + esc(u.id) + '" tabindex="0"><td><div class="ad-who"><span class="ad-av">' + esc((u.name || u.email).charAt(0).toUpperCase()) + "</span><div><b>" + esc(u.email) + "</b><small>" + esc(u.name || "") + " " + tags + '</small></div></div></td><td data-l="Plan">' + badge(plan(u)) + '</td><td data-l="X-Rays">' + u.runs + '</td><td data-l="Paid">' + (u.paid ? inr(u.paid) : "—") + '</td><td data-l="Last seen">' + esc(ago(u.last_login)) + '</td><td data-l="Joined">' + esc(date(u.created_at)) + "</td></tr>"; }).join("") + "</tbody></table></div>" + (items.length === 100 ? '<p class="muted">Showing the 100 most recent — search to find others.</p>' : "") : '<p class="muted">No users match.</p>';
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
        '<div class="panel hud ad-card ad-user"><div class="ad-who big"><span class="ad-av">' + esc((u.name || u.email).charAt(0).toUpperCase()) + "</span><div><h1>" + esc(u.email) + "</h1><p class=\"muted\">" + esc(u.name || "—") + (u.phone ? " · " + esc(u.phone) : "") + " · joined " + esc(date(u.created)) + " · last login " + esc(ago(u.lastLogin)) + " · " + (u.google ? "Google" : "email code") + " · " + u.sessions + " active session" + (u.sessions === 1 ? "" : "s") + "</p><p>" + badge(u.plan) + (u.planUntil && u.plan !== "free" ? ' <small class="muted">until ' + esc(date(u.planUntil)) + "</small>" : "") + " " + st + "</p></div></div>" +
        '<ul class="ad-mini"><li><b>' + j.runs.length + "</b><span>X-Rays</span></li><li><b>" + (u.unlimited || u.owner ? "∞" : (u.plan !== "free" ? u.monthly : 0) + u.packs + (u.plan === "free" ? u.free : 0)) + "</b><span>X-Rays left</span></li><li><b>" + inr(j.orders.filter(function (o) { return o.status === "PAID"; }).reduce(function (a, o) { return a + o.amount; }, 0)) + "</b><span>paid</span></li><li><b>" + j.events.length + "</b><span>actions</span></li></ul></div>" +
        '<div class="panel ad-card ad-actions"><div class="ad-ch"><h2>Control</h2>' + (can ? "" : '<span class="muted">' + (u.owner ? "Owner logins always have everything." : "View only — only the FODO owner logins can change this.") + "</span>") + "</div>" +
          '<div class="ad-acts"><div><h3>Access</h3><button class="btn sm ' + (u.blocked ? "" : "danger") + '" id="ad-blk" type="button"' + (can ? "" : " disabled") + ">" + (u.blocked ? "Unblock" : "Block this user") + '</button><p class="muted">Blocking logs them out everywhere and stops login and X-Rays.</p>' + (u.note ? '<p class="muted">Note: ' + esc(u.note) + "</p>" : "") + "</div>" +
          '<div><h3>Give a plan free</h3><div class="ad-row"><select id="ad-gp"' + (can ? "" : " disabled") + ">" + ME.plans.map(function (p) { return '<option value="' + p.id + '"' + (p.id === "pro" ? " selected" : "") + ">" + esc(p.name) + (p.price ? " (worth " + inr(p.price) + "/mo)" : " — remove plan") + "</option>"; }).join("") + '</select><input id="ad-gd" type="number" min="1" max="3650" value="30" aria-label="Days"' + (can ? "" : " disabled") + '><span class="muted">days</span><button class="btn sm" id="ad-gpb" type="button"' + (can ? "" : " disabled") + ">Give</button></div></div>" +
          '<div><h3>Give X-Rays free</h3><div class="ad-row"><input id="ad-gn" type="number" min="-1000" max="1000" value="10" aria-label="Number of X-Rays"' + (can ? "" : " disabled") + '><button class="btn sm" id="ad-gnb" type="button"' + (can ? "" : " disabled") + '>Add</button></div><label class="ad-feat"><input type="checkbox" id="ad-unl"' + (u.unlimited ? " checked" : "") + (can ? "" : " disabled") + "><span><b>Unlimited X-Rays</b> (nothing is ever deducted)</span></label></div></div>" +
          '<details class="ad-fx"' + (u.features.length ? " open" : "") + "><summary><b>Give single features free</b> <span class=\"muted\">(" + u.features.length + " given) — on top of their plan</span></summary><div class=\"ad-feats\">" + feats + "</div>" + (can ? '<button class="btn sm" id="ad-fsave" type="button">Save features</button>' : "") + "</details></div>" +
        '<div class="ad-grid2"><div class="panel ad-card"><h2>What they used</h2>' + (j.usage.length ? '<ul class="ad-rows">' + j.usage.map(function (x) { return "<li><span>" + esc(kind(x.kind)) + "</span>" + bar(x.n, umax) + "<b>" + x.n + "×</b><small>" + esc(ago(x.last)) + "</small></li>"; }).join("") + "</ul>" : '<p class="muted">Nothing yet.</p>') + "</div>" +
          '<div class="panel ad-card"><h2>Their X-Rays</h2>' + (j.runs.length ? '<ul class="ad-rows ad-doms">' + j.runs.slice(0, 30).map(function (r) { return "<li><span>" + (r.status === "COMPLETE" ? '<a href="/business-x-ray/?r=' + encodeURIComponent(r.job_id) + '" target="_blank" rel="noopener">' + esc(r.domain) + " ↗</a>" : esc(r.domain)) + "</span>" + badge(r.tier) + "<b>" + (r.score == null ? "—" : r.score) + "</b><small>" + esc(date(r.created_at, 1)) + "</small></li>"; }).join("") + "</ul>" : '<p class="muted">No X-Rays yet.</p>') + "</div></div>" +
        '<div class="ad-grid2"><div class="panel ad-card"><h2>Activity</h2>' + feed(j.events.slice(0, 60).map(function (e) { return Object.assign({}, e, { uid: "" }); })) + "</div>" +
          '<div class="panel ad-card"><h2>Payments</h2>' + (j.orders.length ? '<ul class="ad-rows">' + j.orders.map(function (o) { return "<li><span>" + esc(o.kind + " · " + o.item) + "</span><b>" + inr(o.amount) + '</b><small class="' + (o.status === "PAID" ? "ok" : "") + '">' + esc(o.status) + " · " + esc(date(o.paid_at || o.created_at)) + "</small></li>"; }).join("") + "</ul>" : '<p class="muted">No payments.</p>') +
          "<h2 style=\"margin-top:20px\">Credits</h2>" + (j.ledger.length ? '<ul class="ad-rows">' + j.ledger.map(function (l) { return "<li><span>" + esc(l.note || l.kind) + "</span><b class=\"" + (l.delta > 0 ? "ok" : "") + "\">" + (l.delta > 0 ? "+" : "") + l.delta + "</b><small>" + esc(date(l.created_at)) + "</small></li>"; }).join("") + "</ul>" : '<p class="muted">—</p>') + (j.team.length ? "<h2 style=\"margin-top:20px\">Their team</h2><ul class=\"ad-rows\">" + j.team.map(function (t) { return "<li><span>" + esc(t.email) + "</span></li>"; }).join("") + "</ul>" : "") + "</div></div>";
      if (!can) return;
      var post = function (p, b, okMsg) { return api("user/" + encodeURIComponent(u.id) + "/" + p, b).then(function (r) { if (r.ok) { toast(okMsg); userView(u.id); } else toast(r.reason || "Could not save.", true); }); };
      $("#ad-blk").onclick = function () { if (u.blocked) return post("block", { blocked: false }, "Unblocked " + u.email); var n = prompt("Block " + u.email + "?\nThey are logged out at once and cannot log in or run X-Rays.\n\nReason (optional, only you see it):", ""); if (n === null) return; post("block", { blocked: true, note: n }, "Blocked " + u.email); };
      $("#ad-gpb").onclick = function () { var p = $("#ad-gp").value, d = +$("#ad-gd").value || 30; if (confirm(p === "free" ? "Remove the plan from " + u.email + "?" : "Give " + p + " free to " + u.email + " for " + d + " days?")) post("grant", { type: "plan", plan: p, days: d }, p === "free" ? "Plan removed" : p + " given for " + d + " days"); };
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
      $("#ad-rl").innerHTML = items.length ? '<div class="ad-table"><table><thead><tr><th>Website</th><th>By</th><th>Level</th><th>Score</th><th>Status</th><th>When</th></tr></thead><tbody>' + items.map(function (r) { return "<tr><td>" + (r.status === "COMPLETE" ? '<a href="/business-x-ray/?r=' + encodeURIComponent(r.job_id) + '" target="_blank" rel="noopener"><b>' + esc(r.domain) + "</b> ↗</a>" : "<b>" + esc(r.domain) + "</b>") + '</td><td data-l="By">' + (r.uid ? '<a href="#user/' + esc(r.uid) + '">' + esc(r.email) + "</a>" : "—") + '</td><td data-l="Level">' + badge(r.tier) + (r.credit === "owner" || r.credit === "gift" ? ' <small class="muted">free</small>' : "") + '</td><td data-l="Score">' + (r.score == null ? "—" : r.score) + '</td><td data-l="Status">' + esc({ COMPLETE: "Done", running: "Not finished", refunded: "Refunded" }[r.status] || r.status) + '</td><td data-l="When">' + esc(date(r.created_at, 1)) + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<p class="muted">No X-Rays found.</p>'; }); };
    $("#ad-rq").oninput = function () { clearTimeout(t); t = setTimeout(load, 250); };
    $("#ad-rcsv").onclick = function () { csv([["Website", "Email", "Level", "Credit", "Score", "Status", "When", "Report"]].concat(items.map(function (r) { return [r.domain, r.email, r.tier, r.credit, r.score, r.status, r.created_at, r.status === "COMPLETE" ? location.origin + "/business-x-ray/?r=" + r.job_id : ""]; })), "fodo-xrays"); };
    load();
  }
  function leadsView() {
    api("leads").then(function (j) {
      if (!j.ok) return fail(j);
      $("#ad-view").innerHTML = head("Leads", "People who used up their free X-Rays (or hit a limit) and have not paid yet — they already know the tool works for them. Reach out with an offer.", '<button class="btn sm ghost" id="ad-lcsv" type="button">Export CSV</button>') +
        (j.items.length ? '<div class="ad-leads">' + j.items.map(function (l) { var ph = String(l.phone || "").replace(/\D/g, "").slice(-10);
          return '<div class="panel ad-card ad-lead"><div class="ad-who"><span class="ad-av">' + esc((l.name || l.email).charAt(0).toUpperCase()) + '</span><div><a href="#user/' + esc(l.id) + '"><b>' + esc(l.email) + "</b></a><small>" + esc(l.name || "") + (ph ? " · " + esc(ph) : "") + "</small></div></div><p class=\"muted\">" + l.runs + " X-Ray" + (l.runs === 1 ? "" : "s") + " · ran out " + l.hits + "× · last " + esc(ago(l.last_hit)) + "</p>" + (l.domains ? '<p class="ad-dl">' + esc(String(l.domains).split(",").slice(0, 4).join(", ")) + "</p>" : "") +
            '<div class="btn-row"><a class="btn sm" href="mailto:' + esc(l.email) + "?subject=" + encodeURIComponent("Your FODO Business X-Ray") + "&body=" + encodeURIComponent("Hi " + (l.name || "") + ",\n\nThanks for trying the FODO Business X-Ray on " + (String(l.domains || "").split(",")[0] || "your website") + ". I'd love to walk you through what it found and how to fix the top issues.\n\nWould a 15-minute call this week work?\n\nAnmol\nFODO") + '">Email</a>' + (ph ? '<a class="btn sm ghost" href="https://wa.me/91' + ph + '" target="_blank" rel="noopener">WhatsApp</a>' : "") + "</div></div>"; }).join("") + "</div>" : '<div class="panel ad-card"><p class="muted">No leads yet. They appear here as soon as someone runs out of free X-Rays without paying.</p></div>');
      $("#ad-lcsv").onclick = function () { csv([["Email", "Name", "Phone", "X-Rays", "Times ran out", "Last time", "Websites"]].concat(j.items.map(function (l) { return [l.email, l.name, l.phone, l.runs, l.hits, l.last_hit, l.domains]; })), "fodo-leads"); };
    });
  }
  function paymentsView() {
    api("orders").then(function (j) {
      if (!j.ok) return fail(j);
      var paid = j.items.filter(function (o) { return o.status === "PAID"; }), total = paid.reduce(function (a, o) { return a + o.amount; }, 0);
      $("#ad-view").innerHTML = head("Payments", paid.length + " paid · " + inr(total) + " collected · Cashfree", '<button class="btn sm ghost" id="ad-pcsv" type="button">Export CSV</button>') +
        (j.items.length ? '<div class="ad-table"><table><thead><tr><th>Order</th><th>Customer</th><th>What</th><th>Amount</th><th>Status</th><th>When</th></tr></thead><tbody>' + j.items.map(function (o) { return "<tr><td><code>" + esc(o.order_id) + '</code></td><td data-l="Customer">' + (o.uid ? '<a href="#user/' + esc(o.uid) + '">' + esc(o.email) + "</a>" : "—") + '</td><td data-l="What">' + esc(o.kind + " · " + o.item) + '</td><td data-l="Amount"><b>' + inr(o.amount) + '</b></td><td data-l="Status"><span class="ad-tag ' + (o.status === "PAID" ? "ok" : "") + '">' + esc(o.status) + '</span></td><td data-l="When">' + esc(date(o.paid_at || o.created_at, 1)) + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<div class="panel ad-card"><p class="muted">No payments yet. They appear here once Cashfree is switched on and someone buys.</p></div>');
      $("#ad-pcsv").onclick = function () { csv([["Order", "Email", "Kind", "Item", "Amount", "Status", "Created", "Paid"]].concat(j.items.map(function (o) { return [o.order_id, o.email, o.kind, o.item, o.amount, o.status, o.created_at, o.paid_at]; })), "fodo-payments"); };
    });
  }
  function activityView() { api("overview").then(function (o) { if (!o.ok) return fail(o); $("#ad-view").innerHTML = head("Activity", "The latest 40 actions across all users.") + '<div class="panel ad-card">' + feed(o.recent) + "</div>"; }); }
  function teamView() {
    api("viewers").then(function (j) {
      if (!j.ok) return fail(j);
      $("#ad-view").innerHTML = head("Team", "Who can open this dashboard.") + '<div class="panel ad-card"><h2>Full control</h2><ul class="ad-rows"><li><span>anmol@fodo.co.in</span><span class="ad-tag ok">Owner</span></li><li><span>singhrajputanmol014@gmail.com</span><span class="ad-tag ok">Owner</span></li></ul>' +
        '<h2 style="margin-top:20px">View only</h2><p class="muted">They log in with this email (Google or email code) and can see everything, but cannot block anyone or give anything.</p>' + (j.items.length ? '<ul class="ad-rows">' + j.items.map(function (v) { return "<li><span>" + esc(v.email) + '</span><small>added by ' + esc(v.added_by) + " · " + esc(date(v.added_at)) + "</small>" + (owner() ? '<button class="btn sm ghost" type="button" data-rm="' + esc(v.email) + '">Remove</button>' : "") + "</li>"; }).join("") + "</ul>" : '<p class="muted">Nobody yet.</p>') +
        (owner() ? '<form class="ad-row" id="ad-vf"><input type="email" id="ad-ve" placeholder="teammate@company.com" aria-label="Email" required><button class="btn sm" type="submit">Add viewer</button></form>' : "") + "</div>";
      if (!owner()) return;
      $("#ad-vf").onsubmit = function (e) { e.preventDefault(); api("viewers", { email: $("#ad-ve").value }).then(function (r) { if (r.ok) { toast("Viewer added"); teamView(); } else toast(r.reason, true); }); };
      $("#ad-view").querySelectorAll("[data-rm]").forEach(function (b) { b.onclick = function () { if (confirm("Remove " + b.dataset.rm + "?")) api("viewers", { email: b.dataset.rm, remove: true }).then(function () { toast("Removed"); teamView(); }); }; });
    });
  }
  start();
})();
