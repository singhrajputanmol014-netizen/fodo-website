/* FODO Growth Lab — /plans/ (prices, buy) and /account/ (plan, credits, payment return, history, team, clients, white-label).
   Everything comes from /api/account/* through window.FODO_ACCOUNT (js/account.js). Prices shown = prices charged
   (both read from functions/_lib/plans.js on the server). */
(function () {
  "use strict";
  var A = window.FODO_ACCOUNT; if (!A) return;
  var U = window.FODO_UTIL || {}, ROOT = U.root || "/", esc = A.esc, inr = A.inr;
  var $ = function (id) { return document.getElementById(id); };
  var msg = function (el, t, kind) { if (!el) return; el.textContent = t || ""; el.className = "cf-status" + (kind ? " " + kind : ""); };
  var date = function (s) { try { return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return s; } };
  var RANK = ["free", "starter", "growth", "pro", "agency"];
  var buyErr = function (el) { return function (e) { if (!e || e.cancelled) return; msg(el, e.message || "Could not start the payment.", "warn"); }; };

  /* ================= /plans/ ================= */
  var grid = $("pl-grid");
  if (grid) {
    var st = $("pl-status"), auto = false;
    Promise.all([A.config(), A.me()]).then(function (x) {
      var c = x[0], u = x[1];
      if (!c.enabled) { msg(st, "Paid plans open soon. Until then the Business X-Ray stays free with fair-use limits.", "ok"); }
      var tg = $("pl-auto"); if (tg) { tg.hidden = !c.autoRenew; tg.querySelector("input").addEventListener("change", function (e) { auto = e.target.checked; draw(); }); }
      function draw() {
        var cur = u ? u.plan : null;
        grid.innerHTML = c.plans.map(function (p, pi) { var prev = pi > 0 ? c.plans[pi - 1] : null;
          var mine = cur === p.id, lower = cur && RANK.indexOf(p.id) < RANK.indexOf(cur);
          var btn = p.id === "free" ? (u ? '<span class="btn ghost sm" aria-disabled="true">' + (mine ? "Your plan" : "Included") + "</span>" : '<button class="btn ghost" type="button" data-login>Start free</button>')
            : mine ? '<button class="btn ghost" type="button" data-buy="plan" data-item="' + p.id + '">Renew ' + esc(p.name) + "</button>" : lower ? '<span class="btn ghost sm" aria-disabled="true">Below your plan</span>'
            : '<button class="btn" type="button" data-buy="plan" data-item="' + p.id + '"' + (c.payments ? "" : " disabled") + ">Choose " + esc(p.name) + "</button>";
          return '<article class="panel hud pl-card' + (p.id === "growth" ? " pl-pop" : "") + (mine ? " pl-mine" : "") + '">' + (p.id === "growth" ? '<span class="tag hot">MOST POPULAR</span>' : "") + "<h3>" + esc(p.name) + '</h3><p class="pl-price"><b>' + (p.price ? inr(p.price) : "₹0") + "</b><span>" + (p.price ? "/ month" : "forever") + "</span></p>" +
            '<ul class="pl-keys"><li><b>' + p.xrays + "</b> Business X-Ray" + (p.xrays === 1 ? "" : "s") + (p.period === "lifetime" ? " (one-time)" : " / month") + "</li><li>Up to <b>" + p.pages + "</b> pages read per site</li><li><b>" + p.competitors + "</b> competitors compared</li>" + (p.seats > 1 ? "<li><b>" + p.seats + "</b> team seats</li>" : "") + "</ul>" +
            (prev && prev.features.length ? '<p class="pl-plus">Everything in ' + esc(prev.name) + ", plus:</p>" : "") + '<ul class="pl-feats">' + (p.features.length ? p.features.filter(function (f) { return !prev || !prev.features.some(function (q) { return q.id === f.id; }); }).map(function (f) { return "<li>" + esc(f.label) + "</li>"; }).join("") : "<li>Score, biggest problem, top 3 fixes and the 30-day plan, with evidence</li>") + "</ul>" + btn + "</article>";
        }).join("");
        $("pl-packs").innerHTML = c.packs.map(function (k) { return '<div class="panel pl-pack"><b>' + esc(k.name) + "</b><span>" + inr(k.price) + ' · never expire</span><button class="btn sm ghost" type="button" data-buy="pack" data-item="' + k.id + '"' + (c.payments ? "" : " disabled") + ">Buy</button></div>"; }).join("");
      }
      draw();
      document.addEventListener("click", function (e) {
        var b = e.target.closest("[data-buy]"); if (b && grid.contains(b) || b && $("pl-packs").contains(b)) { e.preventDefault(); msg(st, "Opening the secure payment page…", "busy"); A.checkout(b.dataset.buy, b.dataset.item, { autoRenew: auto && b.dataset.buy === "plan" }).catch(buyErr(st)); return; }
        if (e.target.closest("[data-login]")) A.login().then(function () { location.href = ROOT + "business-x-ray/"; }, function () {});
      });
      A.onChange(function (nu) { u = nu; draw(); });
    });
  }

  /* ================= /account/ ================= */
  var acc = $("ac-root");
  if (!acc) return;
  var qs = new URLSearchParams(location.search), st2 = $("ac-status");
  function payReturn() {
    var oid = qs.get("order_id"), sid = qs.get("subscription_id"); if (!oid && !sid) return Promise.resolve();
    msg(st2, "Confirming your payment with Cashfree…", "busy");
    var tries = 0;
    var once = function () {
      return A.api("verify", oid ? { order_id: oid } : { subscription_id: sid }).then(function (j) {
        if (j.paid || j.active) { try { history.replaceState(null, "", location.pathname); sessionStorage.removeItem("fodo-pay"); } catch (e) {} return A.me(true).then(function () { msg(st2, "Payment received — your account is updated. Thank you!", "ok"); }); }
        if (j._status === 404 || j._status === 401) { msg(st2, j.reason || "This payment is not linked to the account you are logged in with.", "warn"); return; }
        var s = j.status || "";
        if (/FAILED|CANCELLED|EXPIRED|TERMINATED/.test(s)) { msg(st2, "The payment did not go through (" + s.toLowerCase() + "). Nothing was charged for this order — you can try again from Plans.", "warn"); return; }
        if (++tries < 6) { msg(st2, "Waiting for the bank to confirm… (" + tries + ")", "busy"); return new Promise(function (r) { setTimeout(r, 3500); }).then(once); }
        msg(st2, "The payment is still pending. If money left your account, it will be added automatically within a few minutes (Cashfree tells us directly). Refresh this page later.", "warn");
      });
    };
    return once();
  }
  function draw(u) {
    if (!u) { acc.innerHTML = '<div class="panel hud ac-login"><h2>Your Growth Lab account</h2><p class="muted">Log in to run Business X-Rays, see your plan and download reports. Your first 2 X-Rays are free.</p><button class="btn" type="button" id="ac-login">Log in</button></div>'; $("ac-login").onclick = function () { A.login().catch(function () {}); }; return; }
    var cr = u.credits, F = u.limits.features, hasF = function (f) { return F.indexOf(f) > -1; };
    acc.innerHTML = '<div class="grid g2 ac-top"><div class="panel hud"><p class="eyebrow">YOUR PLAN</p><h2 class="ac-plan">' + esc(u.planName) + "</h2>" +
      '<p class="muted">' + (u.unlimited ? "FODO owner access — every feature unlocked, unlimited X-Rays, nothing is charged." : u.plan === "free" ? "Free plan — " + cr.free + " of 2 free X-Rays left." : "Active until <b>" + esc(date(u.planUntil)) + "</b>" + (u.autoRenew ? " · renews automatically" : " · pay again to extend") + ".") + (u.team ? " Shared with you by " + esc(u.team.owner) + "." : "") + "</p>" +
      '<ul class="ac-credits"><li><b>' + cr.total + "</b><span>X-Rays left</span></li>" + (u.plan !== "free" ? "<li><b>" + cr.monthly + "</b><span>this month</span></li>" : "") + "<li><b>" + cr.packs + '</b><span>from packs</span></li></ul><div class="btn-row"><a class="btn" href="' + ROOT + 'business-x-ray/">Run a Business X-Ray</a>' + (u.owner !== false && !u.unlimited ? '<a class="btn ghost" href="' + ROOT + 'plans/">' + (u.plan === "agency" ? "Buy more X-Rays" : "Upgrade") + "</a>" : "") + "</div>" +
      (u.autoRenew && u.owner !== false ? '<p><button type="button" class="xr-why" id="ac-cancel">Stop auto-renew</button> <small class="muted">Your plan stays until its end date.</small></p>' : "") + "</div>" +
      '<div class="panel"><p class="eyebrow">ACCOUNT</p><dl class="xr-dl sm"><div><dt>Email</dt><dd>' + esc(u.email) + "</dd></div><div><dt>Each X-Ray reads</dt><dd>up to " + u.limits.MAX_PAGES + " pages · " + u.limits.MAX_COMPETITORS + " competitors</dd></div></dl>" +
      '<form id="ac-prof" class="acct-f"><label for="ac-name">Name</label><input id="ac-name" maxlength="80" value="' + esc(u.name || "") + '"><label for="ac-phone">Mobile (for payment receipts)</label><input id="ac-phone" inputmode="tel" maxlength="14" value="' + esc(u.phone || "") + '"><div class="btn-row"><button class="btn sm ghost" type="submit">Save</button><button class="btn sm ghost" type="button" id="ac-out">Log out</button></div></form></div></div>' +
      '<section class="xr-sec"><div class="xr-sec-h"><span class="section-num">01</span><h2>Your X-Rays</h2></div><div id="ac-hist">' + (hasF("history") ? '<p class="muted">Loading…</p>' : '<p class="muted">Saved history comes with Starter and above. <a href="' + ROOT + 'plans/">See plans</a>.</p>') + "</div></section>" +
      '<section class="xr-sec"><div class="xr-sec-h"><span class="section-num">02</span><h2>Credit activity</h2></div><div id="ac-ledger"><p class="muted">Loading…</p></div></section>' +
      (hasF("team") && u.owner !== false ? '<section class="xr-sec"><div class="xr-sec-h"><span class="section-num">03</span><h2>Agency tools</h2></div><div class="grid g3 ac-agency"><div class="panel"><h3>Team</h3><div id="ac-team"></div><form id="ac-teamf" class="acct-f"><input type="email" id="ac-tm" placeholder="colleague@agency.com" aria-label="Team member email"><button class="btn sm" type="submit">Add</button></form></div>' +
        '<div class="panel"><h3>Client folders</h3><div id="ac-clients"></div><form id="ac-clf" class="acct-f"><input id="ac-cl" maxlength="60" placeholder="Client name" aria-label="Client name"><button class="btn sm" type="submit">Add</button></form></div>' +
        '<div class="panel"><h3>White-label PDF</h3><form id="ac-brf" class="acct-f"><label for="ac-bn">Agency name on reports</label><input id="ac-bn" maxlength="60" value="' + esc((u.brand || {}).name || "") + '"><label for="ac-bc">Accent colour</label><input id="ac-bc" type="color" value="' + esc((u.brand || {}).color || "#4C3BCF") + '"><label for="ac-bl">Logo (PNG/JPG, shown top-right)</label><input id="ac-bl" type="file" accept="image/png,image/jpeg,image/webp">' + ((u.brand || {}).logo ? '<img src="' + esc(u.brand.logo) + '" alt="Current logo" class="ac-logo">' : "") + '<button class="btn sm" type="submit">Save branding</button></form></div></div><p class="cf-status" id="ac-agmsg" role="status"></p></section>' : "");
    $("ac-out").onclick = function () { A.logout().then(function () { draw(null); }); };
    $("ac-prof").onsubmit = function (e) { e.preventDefault(); A.api("profile", { name: $("ac-name").value, phone: $("ac-phone").value }).then(function (j) { msg(st2, j.ok ? "Saved." : j.reason, j.ok ? "ok" : "warn"); if (j.ok) A.me(true); }); };
    if ($("ac-cancel")) $("ac-cancel").onclick = function () { if (!confirm("Stop auto-renew? Your plan stays active until " + date(u.planUntil) + ".")) return; A.api("cancel", {}).then(function (j) { msg(st2, j.ok ? "Auto-renew stopped. Your plan stays until " + date(u.planUntil) + "." : j.reason, j.ok ? "ok" : "warn"); A.me(true); }); };
    if (hasF("history")) A.history().then(function (j) {
      var it = j.items || []; $("ac-hist").innerHTML = it.length ? '<table class="xr-t"><thead><tr><th>Website</th><th>Date</th><th>Plan level</th><th>Score</th><th>Status</th><th></th></tr></thead><tbody>' + it.map(function (r) { return "<tr><td>" + esc(r.domain) + "</td><td>" + esc(date(r.created_at)) + "</td><td>" + esc(r.tier) + "</td><td>" + (r.score == null ? "—" : r.score) + "</td><td>" + esc({ COMPLETE: "Done", running: "Not finished", refunded: "Refunded (credit back)" }[r.status] || r.status) + "</td><td>" + (r.status === "COMPLETE" ? '<a href="' + ROOT + "business-x-ray/?r=" + encodeURIComponent(r.job_id) + '">Open</a>' : "") + "</td></tr>"; }).join("") + "</tbody></table>" : '<p class="muted">No X-Rays yet.</p>';
    });
    A.api("ledger").then(function (j) { var it = j.items || []; $("ac-ledger").innerHTML = it.length ? '<ul class="ac-led">' + it.slice(0, 30).map(function (l) { return "<li><b class=\"" + (l.delta > 0 ? "plus" : "minus") + '">' + (l.delta > 0 ? "+" : "") + l.delta + "</b> " + esc(l.note || l.kind) + ' <small class="muted">' + esc(date(l.created_at)) + "</small></li>"; }).join("") + "</ul>" : '<p class="muted">Nothing yet.</p>'; });
    if ($("ac-team")) agency();
    if (window.FODO_LAB17) window.FODO_LAB17(u, acc);   // v17 My Growth Lab: score history, actions, monitoring, Search Console, monthly report
  }
  function agency() {
    var am = st2, done = function (j) { msg(am, j.ok ? "Saved." : j.reason, j.ok ? "ok" : "warn"); agency(); };
    A.api("team").then(function (j) { $("ac-team").innerHTML = '<p class="muted">' + ((j.members || []).length + 1) + " of " + j.seats + " seats used (you + " + (j.members || []).length + ")</p><ul class=\"ac-list\">" + (j.members || []).map(function (m) { return "<li>" + esc(m.email) + ' <button type="button" class="xr-why" data-rmteam="' + esc(m.email) + '">Remove</button></li>'; }).join("") + "</ul><p class=\"muted\">Members log in with that email (Google or a code) and use your plan's X-Rays.</p>"; });
    A.api("clients").then(function (j) { $("ac-clients").innerHTML = (j.items || []).length ? '<ul class="ac-list">' + j.items.map(function (c) { return "<li>" + esc(c.name) + ' <button type="button" class="xr-why" data-rmcl="' + esc(c.id) + '">Remove</button></li>'; }).join("") + "</ul>" : '<p class="muted">No clients yet. Pick a client before running an X-Ray to file it there.</p>'; });
    $("ac-teamf").onsubmit = function (e) { e.preventDefault(); A.api("team", { email: $("ac-tm").value }).then(done); };
    $("ac-clf").onsubmit = function (e) { e.preventDefault(); A.api("clients", { name: $("ac-cl").value }).then(done); };
    acc.onclick = function (e) { var t = e.target.closest("[data-rmteam]"), c = e.target.closest("[data-rmcl]"); if (t) A.api("team", { email: t.dataset.rmteam, remove: true }).then(done); if (c) A.api("clients", { remove: c.dataset.rmcl }).then(done); };
    $("ac-brf").onsubmit = function (e) {
      e.preventDefault(); var f = $("ac-bl").files[0], cur = (A.current() || {}).brand || {};
      (f ? toJpeg(f) : Promise.resolve(cur.logo || "")).then(function (logo) { return A.api("brand", { name: $("ac-bn").value, color: $("ac-bc").value, logo: logo }); }).then(function (j) { msg(am, j.ok ? "Branding saved — your next PDFs use it." : j.reason, j.ok ? "ok" : "warn"); if (j.ok) A.me(true); }, function (er) { msg(am, er.message, "warn"); });
    };
  }
  /* logo → small JPEG on a white background (≤ 400×160 px, under 150 KB) so the PDF can embed it */
  function toJpeg(file) {
    return new Promise(function (ok, no) {
      if (file.size > 5e6) return no(new Error("That image is too large (max 5 MB)."));
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () { var s = Math.min(1, 400 / img.width, 160 / img.height), cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(img.width * s)); cv.height = Math.max(1, Math.round(img.height * s)); var cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
        var q = 0.9, d = cv.toDataURL("image/jpeg", q); while (d.length > 190000 && q > 0.3) { q -= 0.15; d = cv.toDataURL("image/jpeg", q); } d.length > 200000 ? no(new Error("Logo is still too large after shrinking.")) : ok(d); };
      img.onerror = function () { no(new Error("Could not read that image.")); }; img.src = url;
    });
  }
  A.config().then(function (c) {
    if (!c.enabled) { acc.innerHTML = '<div class="panel hud"><h2>Accounts open soon</h2><p class="muted">The Business X-Ray is free to use right now — no login needed.</p><a class="btn" href="' + ROOT + 'business-x-ray/">Run a Business X-Ray</a></div>'; return; }
    A.onChange(draw);
    A.me().then(function (u) { draw(u); return payReturn(); });
  });
})();
