/* FODO Growth Lab v17 — "My Growth Lab" sections on /account/: Growth Score history, action progress, Monitoring
   (Competitor Change Detector + your own site), Google Search Console connection and the Monthly Growth Report.
   Talks to /api/lab/* and /api/account/*; every outside string goes through esc(). Called by lab-pages.js after it draws the account. */
(function () {
  "use strict";
  var A = window.FODO_ACCOUNT, U = window.FODO_UTIL || {}, ROOT = U.root || "/", X = window.FODO_EXPORT; if (!A) return;
  var esc = A.esc || function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var $ = function (id) { return document.getElementById(id); };
  var lab = function (p, body) { return fetch(ROOT + "api/lab/" + p, { method: body === undefined ? "GET" : "POST", credentials: "same-origin", headers: body === undefined ? {} : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }).then(function (r) { return r.json().catch(function () { return { ok: false, reason: "Bad answer (" + r.status + ")" }; }).then(function (j) { j._status = r.status; return j; }); }, function () { return { ok: false, reason: "Network error." }; }); };
  var date = function (s) { if (!s) return "—"; var d = new Date(s); return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };
  var ago = function (s) { if (!s) return "not yet"; var m = (Date.now() - Date.parse(s)) / 6e4; return m < 1 ? "just now" : m < 60 ? Math.round(m) + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago"; };
  var sec = function (n, id, t, inner) { return '<section class="xr-sec" id="' + id + '"><div class="xr-sec-h"><span class="section-num">' + n + "</span><h2>" + t + '</h2></div><div id="' + id + '-b">' + inner + "</div></section>"; };
  var say = function (id, t, kind) { var el = $(id); if (el) { el.textContent = t; el.className = "cf-status" + (kind ? " " + kind : ""); } };
  var HIST = null;

  window.FODO_LAB17 = function (u, acc) {
    if (!u || !acc) return;
    var F = (u.limits && u.limits.features) || [], hasF = function (f) { return F.indexOf(f) > -1; };
    var box = document.createElement("div"); box.id = "ac-v17";
    box.innerHTML = sec("04", "businesses", "My businesses", hasF("history") ? '<p class="muted">Loading…</p>' : '<p class="muted">A dashboard for each of your websites (score, top problems, competitors, changes, what to do next) comes with Starter and above. <a href="' + ROOT + 'plans/">See plans</a>.</p>') +
      sec("05", "history", "Growth Score history & report versions", hasF("history") ? '<p class="muted">Loading…</p>' : '<p class="muted">Your X-Ray scores over time come with Starter and above. <a href="' + ROOT + 'plans/">See plans</a>.</p>') +
      sec("06", "actions", "Action progress", '<p class="muted">Loading…</p>') +
      sec("07", "monitoring", "Monitoring", '<p class="muted">Loading…</p>') +
      sec("08", "search-console", "Google Search Console", '<p class="muted">Loading…</p>') +
      sec("09", "monthly", "Monthly Growth Report", hasF("monthlyReport") ? '<p class="muted">Loading…</p>' : '<p class="muted">The monthly report (last month vs this month, what improved, what declined, competitor changes and what to do next) comes with Starter and above. <a href="' + ROOT + 'plans/">See plans</a>.</p>');
    acc.appendChild(box);
    (hasF("history") ? A.history() : Promise.resolve({ items: [] })).then(function (j) { HIST = (j.items || []).filter(function (r) { return r.status === "COMPLETE"; }); if (hasF("history")) { history(); bizCards(); } if (hasF("monthlyReport")) monthly(); });
    actions(); monitoring(); gsc();
    var h = location.hash.slice(1); if (h && $(h)) setTimeout(function () { $(h).scrollIntoView({ block: "start" }); }, 300);
  };

  /* ---------- Growth Score history (prompt §17 "Growth Score" monitor) ---------- */
  function history() {
    var by = {}; HIST.forEach(function (r) { (by[r.domain] = by[r.domain] || []).push(r); });
    var doms = Object.keys(by);
    $("history-b").innerHTML = doms.length ? '<div class="xr-scroll"><table class="xr-t"><thead><tr><th>Website</th><th>Latest score</th><th>Change</th><th>Scores over time (oldest → newest)</th><th>X-Rays</th></tr></thead><tbody>' + doms.map(function (d) {
      var l = by[d].slice().reverse(), s = l.map(function (r) { return r.score; }).filter(function (x) { return x != null; }), last = s[s.length - 1], prev = s[s.length - 2], ch = last != null && prev != null ? last - prev : null;
      return "<tr><td><b>" + esc(d) + "</b></td><td>" + (last == null ? "—" : last) + "</td><td>" + (ch == null ? "—" : ch > 0 ? '<b class="xr-plus">+' + ch + "</b>" : ch < 0 ? '<b class="xr-minus">' + ch + "</b>" : "±0") + "</td><td>" + spark(s) + " " + esc(s.join(" → ")) + "</td><td>" + l.length + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      // report versions (prompt §51): every X-Ray is kept; compare any two versions of the same site
      '<h3>Report versions</h3><div class="acct-f ac-monf"><select id="vs-dom" aria-label="Website">' + doms.map(function (d) { return '<option value="' + esc(d) + '">' + esc(d) + "</option>"; }).join("") + '</select><select id="vs-a" aria-label="Older version"></select><span class="muted">vs</span><select id="vs-b" aria-label="Newer version"></select><button type="button" class="btn sm" id="vs-go">Compare</button></div><div id="vs-list"></div><div id="vs-out"></div>'
      : '<p class="muted">Run your first Business X-Ray to start your score history.</p>';
    if (!doms.length) return;
    var fill = function () { var l = by[$("vs-dom").value].slice().reverse(), opt = function (r, i) { return '<option value="' + esc(r.job_id) + '">Version ' + (i + 1) + " · " + esc(date(r.created_at)) + " · score " + (r.score == null ? "—" : r.score) + "</option>"; };
      $("vs-a").innerHTML = l.map(opt).join(""); $("vs-b").innerHTML = l.map(opt).join(""); if (l.length > 1) { $("vs-a").selectedIndex = l.length - 2; $("vs-b").selectedIndex = l.length - 1; }
      $("vs-list").innerHTML = '<ol class="ac-vers">' + l.map(function (r, i) { return '<li><b>Version ' + (i + 1) + "</b> · " + esc(date(r.created_at)) + " · score " + (r.score == null ? "—" : r.score) + (r.completeness != null ? " · data " + r.completeness + "%" : "") + ' · <a href="' + ROOT + "business-x-ray/?r=" + encodeURIComponent(r.job_id) + '">open</a>' + shareTag(r) + "</li>"; }).join("") + "</ol>"; $("vs-out").innerHTML = ""; };
    $("vs-dom").onchange = fill; fill();
    $("vs-go").onclick = function () { var a = $("vs-a").value, b = $("vs-b").value; if (a === b) { $("vs-out").innerHTML = '<p class="cf-status warn">Pick two different versions.</p>'; return; } $("vs-out").innerHTML = '<p class="muted">Comparing…</p>';
      Promise.all([getRep(a), getRep(b)]).then(function (x) { if (!x[0] || !x[1]) { $("vs-out").innerHTML = '<p class="cf-status warn">Could not read one of the reports.</p>'; return; } $("vs-out").innerHTML = diffHtml(x[0], x[1]); }); };
  }
  var shareTag = function (r) { return r.share === "off" ? ' <span class="xr-st fail">sharing off</span>' : r.share_until ? (Date.parse(r.share_until) < Date.now() ? ' <span class="xr-st warn">link expired</span>' : ' <span class="xr-st warn">link until ' + esc(date(r.share_until)) + "</span>") : ""; };
  var getRep = function (id) { return fetch(ROOT + "api/xray/report/" + encodeURIComponent(id), { credentials: "same-origin" }).then(function (x) { return x.ok ? x.json() : null; }, function () { return null; }); };
  function diffHtml(a, b) {
    if (Date.parse(a.createdAt) > Date.parse(b.createdAt)) { var t = a; a = b; b = t; }
    var key = function (o) { return o.key || o.title; }, ka = a.opportunities.map(key), kb = b.opportunities.map(key);
    var fixed = a.opportunities.filter(function (o) { return kb.indexOf(key(o)) < 0; }), added = b.opportunities.filter(function (o) { return ka.indexOf(key(o)) < 0; });
    var d = function (x, y) { return x == null || y == null ? "" : y - x > 0 ? ' <b class="xr-plus">+' + (y - x) + "</b>" : y - x < 0 ? ' <b class="xr-minus">' + (y - x) + "</b>" : " ±0"; }, A = a.scores.areas, B2 = b.scores.areas;
    return '<div class="panel hud ac-mr"><p class="eyebrow">' + esc(date(a.createdAt)) + " → " + esc(date(b.createdAt)) + "</p><h3>Overall " + (a.scores.overall == null ? "—" : a.scores.overall) + " → " + (b.scores.overall == null ? "—" : b.scores.overall) + d(a.scores.overall, b.scores.overall) + "</h3>" + (a.tier !== b.tier ? '<p class="muted">The two X-Rays ran on different plan levels (' + esc(a.tier || "free") + " vs " + esc(b.tier || "free") + "), so they read a different number of pages.</p>" : "") +
      '<ul class="xr-cmp">' + Object.keys(B2).map(function (k) { return "<li><span>" + esc(B2[k].name) + "</span> " + (A[k] && A[k].score != null ? A[k].score : "—") + " → " + (B2[k].score == null ? "—" : B2[k].score) + d(A[k] && A[k].score, B2[k].score) + "</li>"; }).join("") + "</ul>" +
      '<div class="grid g2"><div><h4>Fixed (' + fixed.length + ")</h4>" + (fixed.length ? "<ul>" + fixed.map(function (o) { return "<li>" + esc(o.title) + "</li>"; }).join("") + "</ul>" : '<p class="muted">—</p>') + "</div><div><h4>New (" + added.length + ")</h4>" + (added.length ? "<ul>" + added.map(function (o) { return "<li>" + esc(o.title) + "</li>"; }).join("") + "</ul>" : '<p class="muted">—</p>') + "</div></div>" +
      (a.completeness && b.completeness ? '<p class="muted">Data completeness ' + a.completeness.overall + "% → " + b.completeness.overall + "%</p>" : "") + "</div>";
  }
  /* ---------- My businesses (prompt §49): one card per website ---------- */
  function bizCards() {
    var b = $("businesses-b"), by = {}, order = []; HIST.forEach(function (r) { if (!by[r.domain]) { by[r.domain] = r; order.push(r.domain); } });
    if (!order.length) { b.innerHTML = '<p class="muted">Run your first Business X-Ray — each website you check gets its own dashboard here.</p><a class="btn" href="' + ROOT + 'business-x-ray/">Run a Business X-Ray</a>'; return; }
    Promise.all([Promise.all(order.slice(0, 6).map(function (d) { return getRep(by[d].job_id); })), lab("monitor"), lab("gsc/status")]).then(function (x) {
      var reps = x[0], mon = x[1], gs = x[2];
      b.innerHTML = '<div class="grid g2 ac-biz">' + reps.map(function (R, i) { if (!R) return ""; var d = order[i], ev = (mon.events || []).filter(function (e) { return e.domain === d || (R.competitors || []).some(function (c) { return c.domain === e.domain; }); }).filter(function (e) { return e.kind !== "baseline"; }).slice(0, 3);
        var growth = (R.top && R.top.growth || []).map(function (id) { return R.opportunities.filter(function (o) { return o.id === id; })[0]; }).filter(Boolean).slice(0, 3);
        var watched = (mon.targets || []).some(function (t) { return t.domain === d; }), next = nextTool(R, watched, gs, by[d]);
        return '<div class="panel hud ac-bcard"><div class="ac-bh"><div><h3>' + esc(R.business.name.value || d) + '</h3><small class="muted">' + esc(d) + " · last X-Ray " + esc(date(R.createdAt)) + '</small></div><div class="ac-score"><b>' + (R.scores.overall == null ? "—" : R.scores.overall) + "</b><small>Growth Health</small></div></div>" +
          '<p class="muted">' + (R.completeness ? "Data completeness " + R.completeness.overall + "% · " : "") + (R.visibility && R.visibility.score ? "AI visibility " + R.visibility.score.score + " · " : "") + (R.local && R.local.me && R.local.me.rating != null ? "Google Maps " + R.local.me.rating + "★ (" + (R.local.me.reviews || 0) + ")" : "") + "</p>" +
          "<h4>Top problems</h4><ol>" + R.opportunities.slice(0, 3).map(function (o) { return "<li>" + esc(o.title) + "</li>"; }).join("") + "</ol>" + (growth.length ? "<h4>Top opportunities</h4><ul>" + growth.map(function (o) { return "<li>" + esc(o.title) + "</li>"; }).join("") + "</ul>" : "") +
          ((R.competitors || []).length ? "<h4>Competitors</h4><p>" + R.competitors.slice(0, 4).map(function (c) { return esc(c.name); }).join(" · ") + "</p>" : "") +
          "<h4>Recent changes</h4>" + (ev.length ? "<ul>" + ev.map(function (e) { return "<li>" + esc(e.what) + "</li>"; }).join("") + "</ul>" : '<p class="muted">' + (watched ? "Nothing meaningful changed." : "Not monitored yet.") + "</p>") +
          '<p class="ac-next"><b>Recommended next:</b> ' + next[0] + '</p><div class="btn-row"><a class="btn sm" href="' + next[1] + '">' + esc(next[2]) + '</a><a class="btn sm ghost" href="' + ROOT + "business-x-ray/?r=" + encodeURIComponent(by[d].job_id) + '">Latest report</a></div></div>'; }).join("") + "</div>" + (order.length > 6 ? '<p class="muted">Showing your 6 most recent websites.</p>' : "");
    });
  }
  /* rule: the one thing that adds most to this business's picture right now */
  function nextTool(R, watched, gs, run) {
    var age = (Date.now() - Date.parse(R.createdAt)) / 864e5, comp = R.completeness ? R.completeness.overall : 100;
    if (!watched && (R.competitors || []).length) return ["watch " + esc(R.competitors[0].name) + " and your other competitors for price, page and content changes.", "#monitoring", "Start monitoring"];
    if (gs && gs.available && !gs.connected) return ["connect Google Search Console to add your real clicks and impressions to the next X-Ray.", "#search-console", "Connect Search Console"];
    if (age > 28) return ["it has been " + Math.round(age) + " days — re-run the X-Ray to see what improved.", ROOT + "business-x-ray/?url=" + encodeURIComponent(R.business.domain), "Re-run X-Ray"];
    if ((R.leaks || []).length >= 3) return ["fix the " + R.leaks.length + " revenue leaks on your pages first.", ROOT + "business-x-ray/?r=" + encodeURIComponent(run.job_id) + "&focus=leaks", "See revenue leaks"];
    if (comp < 70) return ["your last X-Ray had only " + comp + "% of the planned data — run it again for a fuller picture.", ROOT + "business-x-ray/?url=" + encodeURIComponent(R.business.domain), "Run again"];
    return ["work through the 30-day plan and mark actions done.", ROOT + "business-x-ray/?r=" + encodeURIComponent(run.job_id) + "&focus=plan", "Open the plan"];
  }
  function spark(v) { if (v.length < 2) return ""; var w = 90, h = 24, mx = 100, pts = v.map(function (x, i) { return (i * w / (v.length - 1)).toFixed(1) + "," + (h - x * h / mx).toFixed(1); }).join(" "); return '<svg class="ac-spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="currentColor" stroke-width="2"/></svg>'; }

  /* ---------- action tracker summary ---------- */
  function actions() {
    lab("actions/summary").then(function (j) {
      var it = j.items || [];
      $("actions-b").innerHTML = it.length ? '<ul class="ac-prog">' + it.map(function (x) { var p = x.n ? Math.round(100 * x.done / x.n) : 0; return "<li><b>" + esc(x.domain) + '</b><i style="--v:' + p + '"></i><span>' + x.done + " done · " + x.doing + " in progress · " + (x.n - x.done - x.doing) + ' to do</span><a href="' + ROOT + "business-x-ray/?url=" + encodeURIComponent(x.domain) + '">Re-scan →</a></li>'; }).join("") + "</ul>" : '<p class="muted">Mark actions as To do / In progress / Done inside any X-Ray report — your progress shows up here.</p>';
    });
  }

  /* ---------- monitoring ---------- */
  var SEV = { high: "fail", medium: "warn", low: "na" };
  function monitoring() {
    lab("monitor").then(function (j) {
      var b = $("monitoring-b"); if (!b) return;
      if (!j.ok) { b.innerHTML = '<p class="muted">' + esc(j.reason || "Monitoring is unavailable right now.") + "</p>"; return; }
      var full = j.used >= j.limit, keep = $("mon-url") ? $("mon-url").value : "", keepK = $("mon-kind") ? $("mon-kind").value : "";   // a re-render never loses what was typed
      b.innerHTML = '<p class="muted">FODO checks each website ' + (j.every === "daily" ? "every day" : "every week") + " and tells you only when something meaningful changes — prices, headline, new pages, content, downtime or a noindex tag. " + j.used + " of " + j.limit + " website" + (j.limit === 1 ? "" : "s") + " used.</p>" +
        '<form class="acct-f ac-monf" id="mon-f"><input id="mon-url" placeholder="competitor.com or your-site.com" aria-label="Website to monitor" maxlength="200"' + (full ? " disabled" : "") + '><select id="mon-kind" aria-label="Whose website"' + (full ? " disabled" : "") + '><option value="competitor">Competitor</option><option value="own">My own site</option></select><button class="btn sm" type="submit"' + (full ? " disabled" : "") + ">Start monitoring</button>" + (full ? ' <a class="btn sm ghost" href="' + ROOT + 'plans/">Monitor more</a>' : "") + '</form><p class="cf-status" id="mon-st" role="status" aria-live="polite"></p>' +
        (HIST && HIST.length && !full ? '<p><button type="button" class="xr-why" id="mon-fromx">Add the competitors from my last X-Ray</button></p>' : "") +
        (j.targets.length ? '<div class="xr-scroll"><table class="xr-t"><thead><tr><th>Website</th><th>Type</th><th>Last check</th><th>Status</th><th></th></tr></thead><tbody>' + j.targets.map(function (t) { return "<tr><td><b>" + esc(t.label || t.domain) + '</b><br><small class="muted">' + esc(t.domain) + "</small></td><td>" + (t.kind === "own" ? "Your site" : "Competitor") + "</td><td>" + esc(ago(t.last_check)) + '</td><td><span class="xr-st ' + (t.last_status === "down" ? "fail" : "pass") + '">' + (t.last_status === "down" ? "Down" : t.last_check ? "OK" : "Waiting") + '</span></td><td><button type="button" class="xr-why" data-monchk="' + esc(t.id) + '">Check now</button> <button type="button" class="xr-why" data-monrm="' + esc(t.id) + '">Remove</button></td></tr>'; }).join("") + "</tbody></table></div>" : "") +
        "<h3>Changes found</h3>" + (j.events.length ? '<ol class="ac-mon">' + j.events.slice(0, 60).map(function (e) { return '<li><span class="xr-st ' + (SEV[e.severity] || "na") + '">' + esc(e.severity) + "</span> <b>" + esc(e.what) + "</b>" + (e.why ? "<br><span>Why it matters: " + esc(e.why) + "</span>" : "") + (e.todo ? "<br><span>What to do: " + esc(e.todo) + "</span>" : "") + ' <small class="muted">' + esc(e.domain) + " · " + esc(ago(e.t)) + "</small></li>"; }).join("") + "</ol>" : '<p class="muted">No changes yet. The first check saves a snapshot; later checks compare against it.</p>');
      if (keep && !full) { $("mon-url").value = keep; $("mon-kind").value = keepK || "competitor"; }
      $("mon-f").onsubmit = function (e) { e.preventDefault(); var v = $("mon-url").value.trim(); if (!v) return; say("mon-st", "Reading " + v + "…", "busy"); lab("monitor", { url: v, kind: $("mon-kind").value }).then(function (r) { say("mon-st", r.ok ? "Monitoring started for " + r.domain + "." : r.reason, r.ok ? "ok" : "warn"); if (r.ok) monitoring(); }); };
      b.onclick = function (e) {
        var c = e.target.closest("[data-monchk]"), rm = e.target.closest("[data-monrm]");
        if (c) { say("mon-st", "Checking…", "busy"); lab("monitor/check", { id: c.dataset.monchk }).then(function (r) { say("mon-st", r.ok ? (r.result.events.length ? r.result.events.length + " change(s) found." : "Checked — nothing meaningful changed.") : r.reason, r.ok ? "ok" : "warn"); if (r.ok) monitoring(); }); }
        if (rm) lab("monitor/remove", { id: rm.dataset.monrm }).then(function () { monitoring(); });
        if (e.target.id === "mon-fromx") fromXray();
      };
    });
  }
  function fromXray() {
    var last = HIST[0]; say("mon-st", "Reading your last X-Ray of " + last.domain + "…", "busy");
    fetch(ROOT + "api/xray/report/" + encodeURIComponent(last.job_id), { credentials: "same-origin" }).then(function (r) { return r.json(); }).then(function (rep) {
      var cs = (rep.competitors || []).slice(0, 5); if (!cs.length) return say("mon-st", "That X-Ray found no competitors to monitor.", "warn");
      return cs.reduce(function (p, c) { return p.then(function (n) { return lab("monitor", { url: c.url || c.domain, kind: "competitor", label: c.name }).then(function (r) { return n + (r.ok ? 1 : 0); }); }); }, Promise.resolve(0)).then(function (n) { say("mon-st", n + " competitor(s) added.", n ? "ok" : "warn"); monitoring(); });
    }, function () { say("mon-st", "Could not read that X-Ray.", "warn"); });
  }

  /* ---------- Google Search Console ---------- */
  var GMSG = { connected: ["Search Console connected. Your next X-Ray of a verified site shows your real clicks and impressions.", "ok"], denied: ["You cancelled the Google permission — nothing was connected.", "warn"], expired: ["That connection link expired. Please try again.", "warn"], norefresh: ["Google did not give FODO lasting access. Remove FODO under myaccount.google.com → Security → Third-party access, then connect again.", "warn"], scope: ["Please tick the Search Console permission on Google's screen.", "warn"], error: ["Google did not answer. Please try again.", "warn"], off: ["Search Console connection is not switched on yet.", "warn"], login: ["Please log in first.", "warn"] };
  function gsc() {
    lab("gsc/status").then(function (j) {
      var b = $("search-console-b"), m = GMSG[new URLSearchParams(location.search).get("gsc")]; if (!b) return;
      if (!j.ok || !j.available) { b.innerHTML = '<p class="muted">Connecting Google Search Console is coming soon.</p>'; return; }
      b.innerHTML = (m ? '<p class="cf-status ' + m[1] + '">' + esc(m[0]) + "</p>" : "") + (j.connected
        ? '<p><span class="xr-st pass">Connected</span> since ' + esc(date(j.connectedAt)) + (j.lastUsed ? " · last used " + esc(ago(j.lastUsed)) : "") + '</p><p class="muted">Properties FODO can read (read-only):</p><ul>' + (j.sites || []).map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + '</ul><button type="button" class="btn sm ghost" id="gsc-off">Disconnect</button> <small class="muted">FODO deletes its access and asks Google to revoke it.</small>'
        : '<p>Add your <b>real</b> Google clicks, impressions, click-through rate and positions to every X-Ray of your own website — and see the searches where a better title would win more clicks.</p><ul class="muted"><li>Read-only access (webmasters.readonly). FODO cannot change anything in your Search Console.</li><li>Only you see this data. It is never shown in shared report links.</li><li>Disconnect any time.</li></ul><a class="btn" href="' + ROOT + 'api/lab/gsc/start">Connect Google Search Console</a>');
      if ($("gsc-off")) $("gsc-off").onclick = function () { lab("gsc/disconnect", {}).then(function () { try { window.history.replaceState(null, "", location.pathname + "#search-console"); } catch (x) {} gsc(); }); };
    });
  }

  /* ---------- Monthly Growth Report (prompt §53): previous vs current X-Ray + monitoring + actions → one page ---------- */
  function monthly() {
    var b = $("monthly-b"), by = {}; HIST.forEach(function (r) { (by[r.domain] = by[r.domain] || []).push(r); });
    var doms = Object.keys(by);
    if (!doms.length) { b.innerHTML = '<p class="muted">Run an X-Ray to start. The report compares your latest X-Ray with the one before it (run one each month).</p>'; return; }
    b.innerHTML = '<div class="acct-f ac-monf"><select id="mr-dom" aria-label="Website">' + doms.map(function (d) { return '<option value="' + esc(d) + '">' + esc(d) + " (" + by[d].length + " X-Ray" + (by[d].length === 1 ? "" : "s") + ")</option>"; }).join("") + '</select><button type="button" class="btn sm" id="mr-go">Create report</button></div><div id="mr-out"></div>';
    $("mr-go").onclick = function () { build($("mr-dom").value, by[$("mr-dom").value]); };
  }
  function build(dom, runs) {
    var out = $("mr-out"); out.innerHTML = '<p class="muted">Building…</p>';
    var get = function (r) { return r ? fetch(ROOT + "api/xray/report/" + encodeURIComponent(r.job_id), { credentials: "same-origin" }).then(function (x) { return x.ok ? x.json() : null; }, function () { return null; }) : Promise.resolve(null); };
    Promise.all([get(runs[0]), get(runs[1]), lab("monitor"), lab("actions?domain=" + encodeURIComponent(dom))]).then(function (x) {
      var cur = x[0], prev = x[1], mon = x[2], act = x[3]; if (!cur) { out.innerHTML = '<p class="cf-status warn">Could not read the latest X-Ray.</p>'; return; }
      var since = Date.now() - 31 * 864e5, A0 = prev ? prev.scores.areas : {}, A1 = cur.scores.areas, key = function (o) { return o.key || o.title; };
      var k0 = prev ? prev.opportunities.map(key) : [], k1 = cur.opportunities.map(key);
      var improved = prev ? prev.opportunities.filter(function (o) { return k1.indexOf(key(o)) < 0; }) : [], declined = prev ? cur.opportunities.filter(function (o) { return k0.indexOf(key(o)) < 0; }) : [];
      var st = {}; (act.items || []).forEach(function (a) { st[a.key] = a.status; });
      var next = cur.opportunities.filter(function (o) { return st[o.key] !== "done"; }).slice(0, 5);
      var comps = (cur.competitors || []).map(function (c) { return c.domain; }), ev = (mon.events || []).filter(function (e) { return Date.parse(e.t) >= since && e.kind !== "baseline" && (e.domain === dom || comps.indexOf(e.domain) > -1); });
      var areas = Object.keys(A1).map(function (k) { return { name: A1[k].name, before: A0[k] ? A0[k].score : null, now: A1[k].score }; });
      var R = { dom: dom, cur: cur, prev: prev, areas: areas, improved: improved, declined: declined, next: next, ev: ev, done: (act.items || []).filter(function (a) { return a.status === "done"; }).length, doing: (act.items || []).filter(function (a) { return a.status === "doing"; }).length };
      var d = function (a, b2) { return a == null || b2 == null ? "" : b2 - a > 0 ? ' <b class="xr-plus">+' + (b2 - a) + "</b>" : b2 - a < 0 ? ' <b class="xr-minus">' + (b2 - a) + "</b>" : " ±0"; };
      out.innerHTML = '<div class="panel hud ac-mr"><p class="eyebrow">MONTHLY GROWTH REPORT · ' + esc(dom) + "</p><h3>" + (prev ? esc(date(prev.createdAt)) + " → " + esc(date(cur.createdAt)) : "Baseline: " + esc(date(cur.createdAt))) + "</h3>" +
        "<p>Overall Growth Health <b>" + (prev ? (prev.scores.overall == null ? "—" : prev.scores.overall) + " → " : "") + (cur.scores.overall == null ? "—" : cur.scores.overall) + "</b>" + (prev ? d(prev.scores.overall, cur.scores.overall) : "") + (cur.completeness ? ' <small class="muted">· data completeness ' + cur.completeness.overall + "%</small>" : "") + "</p>" +
        '<ul class="xr-cmp">' + areas.map(function (a) { return "<li><span>" + esc(a.name) + "</span> " + (prev ? (a.before == null ? "—" : a.before) + " → " : "") + (a.now == null ? "—" : a.now) + d(a.before, a.now) + "</li>"; }).join("") + "</ul>" +
        (prev ? '<div class="grid g2"><div><h4>What improved (' + improved.length + ")</h4>" + (improved.length ? "<ul>" + improved.slice(0, 8).map(function (o) { return "<li>" + esc(o.title) + "</li>"; }).join("") + "</ul>" : '<p class="muted">None of last month\'s issues are gone yet.</p>') + "</div><div><h4>What declined / is new (" + declined.length + ")</h4>" + (declined.length ? "<ul>" + declined.slice(0, 8).map(function (o) { return "<li>" + esc(o.title) + "</li>"; }).join("") + "</ul>" : '<p class="muted">No new issues.</p>') + "</div></div>" : '<p class="muted">Run another X-Ray next month to see what changed. This page is your baseline.</p>') +
        "<h4>Competitor & site changes this month (" + ev.length + ")</h4>" + (ev.length ? "<ul>" + ev.slice(0, 10).map(function (e) { return "<li><b>" + esc(e.domain) + ":</b> " + esc(e.what) + "</li>"; }).join("") + "</ul>" : '<p class="muted">' + (mon.ok && mon.targets && mon.targets.length ? "No meaningful changes found." : "Add your competitors under Monitoring to see their changes here.") + "</p>") +
        "<h4>Your actions</h4><p>" + R.done + " done · " + R.doing + " in progress</p><h4>What to do next</h4><ol>" + next.map(function (o) { return "<li><b>" + esc(o.title) + "</b> — " + esc(o.recommendation) + "</li>"; }).join("") + "</ol>" +
        '<div class="btn-row"><button type="button" class="btn sm" id="mr-pdf">Download PDF</button><a class="btn sm ghost" href="' + ROOT + "business-x-ray/?url=" + encodeURIComponent(dom) + '">Run this month\'s X-Ray</a></div><p class="muted">Built only from your saved X-Rays, monitoring and action tracker — no estimates added.</p></div>';
      $("mr-pdf").onclick = function () { if (!X) return; var B = [{ h1: "FODO Monthly Growth Report: " + dom }, { p: prev ? date(prev.createdAt) + " -> " + date(cur.createdAt) : "Baseline " + date(cur.createdAt), muted: true }, { pill: "Overall Growth Health " + (prev ? (prev.scores.overall == null ? "-" : prev.scores.overall) + " -> " : "") + (cur.scores.overall == null ? "-" : cur.scores.overall) }, { h2: "Areas" }, { li: areas.map(function (a) { return a.name + ": " + (prev ? (a.before == null ? "-" : a.before) + " -> " : "") + (a.now == null ? "-" : a.now); }) }];
        if (prev) { B.push({ h2: "What improved" }); B.push({ li: improved.length ? improved.map(function (o) { return o.title; }) : ["None yet."] }); B.push({ h2: "What declined / is new" }); B.push({ li: declined.length ? declined.map(function (o) { return o.title; }) : ["No new issues."] }); }
        B.push({ h2: "Competitor & site changes" }); B.push({ li: ev.length ? ev.slice(0, 15).map(function (e) { return e.domain + ": " + e.what; }) : ["No meaningful changes found."] }); B.push({ h2: "What to do next" }); B.push({ li: next.map(function (o) { return o.title + " - " + o.recommendation; }) });
        X.deliver(X.pdf(B, { title: "FODO Monthly Growth Report - " + dom, footer: "FODO Growth Lab - " + dom + " - " + new Date().toLocaleDateString() }), "FODO-Monthly-Report-" + dom.replace(/[^a-z0-9.-]/gi, "-") + "-" + new Date().toISOString().slice(0, 7) + ".pdf", { kind: "PDF" });
        try { A.api("event", { kind: "monthly_report", detail: dom }); } catch (e) {} };
    });
  }
})();
