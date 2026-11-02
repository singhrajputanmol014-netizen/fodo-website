/* FODO v47.5 Mission Control (lazy module of the Workspace, Marketplace admin → Mission Control):
   Today (what needs a person, next team dates, latest staff actions) · Hiring intelligence · Exports.
   Every number comes from /api/biz/admin/* and is a real count or sum; nothing is estimated here. */
(function () {
  "use strict";
  var W = window.FODO_WS; if (!W) return;
  var api = W.api, esc = W.esc, inr = W.inr, day = W.day, head = W.head, empty = W.empty, fail = W.fail, toast = W.toast, $ = W.$, $$ = W.$$;
  var KIND = { urgent: "Urgent", soon: "Expiring soon", wait: "Waiting on someone else", work: "To do" };
  function admin(B, q) {
    var sub = q.get("sub") || "today";
    B.innerHTML = '<div class="ws-tabs sm">' + [["today", "Today"], ["hiring", "Hiring intelligence"], ["exports", "Exports"], ["jobs", "Jobs"], ["calendar", "Calendar"]].map(function (t) { return '<a aria-selected="' + (sub === t[0]) + '" href="#admin?tab=mission&sub=' + t[0] + '">' + t[1] + "</a>"; }).join("") + '</div><div id="mc-b"><div class="ws-skel"><i></i><i></i></div></div>';
    var X = $("#mc-b", B); if (sub === "hiring") return hiring(X, q); if (sub === "exports") return exportsView(X, q);
    if (sub === "jobs" || sub === "calendar") return W.lazy("/js/ws-sync.js").then(function () { if (sub === "jobs") window.FODO_WS_SYNC.jobs(X, q); else window.FODO_WS_SYNC.calendar(X, "staff"); }, function () { X.innerHTML = empty("Couldn't load this section."); });   /* v47.6 */
    today(X, q);
  }
  function today(X, q) {
    api("admin/mission").then(function (j) { if (!X.isConnected) return; if (!j.ok) return fail(X, j, function () { today(X, q); });
      var groups = ["urgent", "soon", "work", "wait"].map(function (k) { return { k: k, items: j.attention.filter(function (a) { return a.kind === k; }) }; }).filter(function (g) { return g.items.length; });
      var T = j.totals;
      X.innerHTML = '<div class="ws-cards">' + [["Open quotes", T.quotesOpen], ["Teams locked or active", T.teamsLive], ["Active projects", T.projectsActive], ["Live professionals", T.prosLive]].concat(j.finance ? [["Held for clients", inr(T.held)], ["Owed to professionals", inr(T.owed)]] : []).map(function (c) { var z = c[1] === 0 || c[1] === "₹0"; return '<div class="ws-card' + (z ? " zero" : "") + '"><small>' + c[0] + "</small><b>" + (z ? "None yet" : c[1]) + "</b></div>"; }).join("") + "</div>" +
        '<h3 class="ws-h3">Needs a FODO person</h3>' + (groups.length ? groups.map(function (g) { return '<div class="mc-g mc-' + g.k + '"><h4>' + KIND[g.k] + "</h4><ul>" + g.items.map(function (a) { return '<li><a href="' + esc(a.href) + '"><b>' + a.n + "</b><span>" + esc(a.label) + "</span></a></li>"; }).join("") + "</ul></div>"; }).join("") : '<div class="pb-okmsg"><b>Nothing waiting.</b> Every quote, team, contract, application and payout is where it should be.</div>') +
        '<p class="ws-sub">Counted from FODO\'s own tables at ' + esc(new Date(j.generatedAt).toLocaleString("en-IN")) + '. <button type="button" class="ws-link" id="mc-rf">Refresh</button></p>' +
        '<div class="ws-g2 mc-cols"><section><h3 class="ws-h3">Next team dates</h3>' + (j.schedule.length ? '<ul class="ws-rows">' + j.schedule.map(function (t) { return '<li><a href="#admin?tab=teams&id=' + esc(t.id) + '"><b>' + esc(t.title) + "</b></a><span>" + esc(day(t.start_day)) + (t.days > 1 ? " · " + t.days + " days" : "") + (t.city ? " · " + esc(t.city) : "") + '</span><i class="ws-pill' + (t.confirmed === t.slots && t.slots ? " ok" : t.confirmed < t.slots ? " warn" : "") + '">' + t.confirmed + "/" + t.slots + " confirmed · " + esc(t.status.replace(/_/g, " ")) + "</i></li>"; }).join("") + "</ul>" : empty("No upcoming teams.")) + "</section>" +
        '<section><h3 class="ws-h3">Latest staff actions</h3>' + (j.recent.length ? '<ul class="mc-log">' + j.recent.map(function (r) { return "<li><small>" + esc(new Date(r.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })) + " · " + esc(r.actor) + "</small><b>" + esc(r.action) + "</b>" + (r.detail ? "<span>" + esc(String(r.detail).slice(0, 120)) + "</span>" : "") + "</li>"; }).join("") + "</ul>" : empty("No actions yet.")) + "</section></div>" +
        '<p class="ws-sub">Press <kbd>Ctrl K</kbd> to find any quote, team, contract, project, professional, application, client, invoice or payout.</p>';
      $("#mc-rf", X).onclick = function () { today(X, q); };
    });
  }
  function hiring(X, q) {
    var days = +(q.get("days") || 90), role = q.get("role") || "";
    api("admin/hiring?days=" + days + "&role=" + encodeURIComponent(role)).then(function (j) { if (!X.isConnected) return; if (!j.ok) return fail(X, j, function () { hiring(X, q); });
      var P = { "no professionals": "No approved professional", high: "High pressure", medium: "Some pressure", ok: "Covered" };
      X.innerHTML = '<form class="ws-form ws-inline" id="hi-f"><select name="days" aria-label="Window">' + [30, 90, 180, 365].map(function (d) { return '<option value="' + d + '"' + (d === days ? " selected" : "") + ">Last " + d + " days</option>"; }).join("") + '</select><input name="role" maxlength="60" placeholder="Only this role" aria-label="Role" value="' + esc(role) + '"><button class="ws-btn" type="submit">Show</button></form>' +
        (j.note ? '<p class="pb-okmsg">' + esc(j.note) + "</p>" : "") +
        '<h3 class="ws-h3">Demand vs supply by role (since ' + esc(day(j.since)) + ")</h3>" + (j.demand.length ? '<div class="ws-tw"><table class="ws-table"><thead><tr><th>Role</th><th>Slots</th><th>Filled</th><th>Open</th><th>Declined</th><th>No answer</th><th>Fill rate</th><th>Median hours to accept</th><th>Approved pros</th><th>Pressure</th><th>Cities with no pro</th></tr></thead><tbody>' +
          j.demand.map(function (r) { return "<tr><td><b>" + esc(r.role) + "</b></td><td>" + r.slots + "</td><td>" + r.filled + "</td><td>" + r.open + "</td><td>" + r.declined + "</td><td>" + r.expired + "</td><td>" + (r.fillRate == null ? "–" : r.fillRate + "%") + "</td><td>" + (r.medianHours == null ? "–" : r.medianHours) + "</td><td>" + r.approvedPros + '</td><td><i class="ws-pill' + (r.pressure === "ok" ? " ok" : r.pressure === "no professionals" || r.pressure === "high" ? " warn" : "") + '">' + P[r.pressure] + "</i></td><td>" + esc(r.cityGaps.join(", ") || "–") + "</td></tr>"; }).join("") + "</tbody></table></div>" : empty("No team slots in this window.")) +
        '<div class="ws-g2 mc-cols"><section><h3 class="ws-h3">Still open for the next 60 days</h3>' + (j.upcoming.length ? '<ul class="ws-rows">' + j.upcoming.map(function (x) { return "<li><b>" + x.n + " × " + esc(x.role) + "</b><span>" + (x.city ? esc(x.city) + " · " : "") + "first " + esc(day(x.first)) + "</span></li>"; }).join("") + "</ul>" : empty("Every upcoming slot is filled.")) + "</section>" +
        '<section><h3 class="ws-h3">Why professionals decline (their own words, grouped)</h3>' + (j.declineReasons.length ? '<ul class="ws-rows">' + j.declineReasons.map(function (x) { return "<li><b>" + esc(x.reason) + "</b><span>" + x.n + "</span></li>"; }).join("") + "</ul>" : empty("No decline reasons recorded.")) + "</section></div>" +
        '<div class="ws-g2 mc-cols"><section><h3 class="ws-h3">Application pipeline by role</h3>' + (j.pipeline.length ? '<ul class="ws-rows">' + j.pipeline.map(function (x) { return "<li><b>" + esc(x.role) + "</b><span>" + x.open + " open · " + x.approved + " approved · " + x.rejected + " not approved</span></li>"; }).join("") + "</ul>" : empty("No applications yet.", "Share fodo.co.in/become-a-pro/ with professionals.")) + "</section>" +
        '<section><h3 class="ws-h3">Most reliable (invitations answered)</h3>' + (j.reliability.length ? '<ul class="ws-rows">' + j.reliability.map(function (x) { return '<li><a href="#admin?tab=pros&status=approved&id=' + esc(x.id) + '"><b>' + esc(x.name) + "</b></a><span>" + esc(x.role) + (x.city ? " · " + esc(x.city) : "") + "</span><i class=\"ws-pill" + (x.acceptRate >= 80 ? " ok" : "") + '">' + x.accepted + " of " + x.asked + " accepted</i></li>"; }).join("") + "</ul>" : empty("Needs at least 2 invitations per person.")) + "</section></div>" +
        '<p class="ws-sub">Computed at ' + esc(new Date(j.generatedAt).toLocaleString("en-IN")) + " from team invitations, profiles and applications. Nothing estimated.</p>";
      $("#hi-f", X).onsubmit = function (e) { e.preventDefault(); location.hash = "admin?tab=mission&sub=hiring&days=" + this.elements.days.value + "&role=" + encodeURIComponent(this.elements.role.value); };
    });
  }
  function exportsView(X, q) {
    api("admin/mission").then(function (j) { if (!X.isConnected) return; if (!j.ok) return fail(X, j, function () { exportsView(X, q); });
      X.innerHTML = '<p class="ws-sub">Each export is a CSV of FODO\'s own records, opens in Excel or Google Sheets, and is written to the audit log with your email and the row count. Money exports need the finance or admin role. Phone numbers and application text are never exported.</p>' +
        '<ul class="ws-rows">' + j.exports.map(function (x) { return '<li><b>' + esc(x.label) + "</b>" + (x.finance ? '<i class="ws-pill">Finance</i>' : "") + '<a class="ws-btn sm" href="/api/biz/admin/export/' + esc(x.key) + '" download>Download CSV</a></li>'; }).join("") + "</ul>";
      $$("a[download]", X).forEach(function (a) { a.addEventListener("click", function () { toast("Preparing " + a.closest("li").querySelector("b").textContent + "…"); }); });
    });
  }
  window.FODO_WS_MISSION = { admin: admin };
})();
