/* FODO v47.6 (lazy module of the Workspace): large uploads in parts (R2 multipart, resumable), private calendar feeds
   (subscribe in Google / Apple / Outlook), organizations (Settings → Organization) and the admin Jobs tab.
   Every rule is enforced on the server; this file only shows and sends. */
(function () {
  "use strict";
  var W = window.FODO_WS; if (!W) return;
  var api = W.api, act = W.act, esc = W.esc, inr = W.inr, day = W.day, toast = W.toast, head = W.head, empty = W.empty, fail = W.fail, fd = W.fd, $ = W.$, $$ = W.$$;

  /* ---------- multipart upload: start → PUT parts (3 at a time, each retried) → complete ---------- */
  function putPart(id, n, blob, tries) {
    return new Promise(function (res) { var x = new XMLHttpRequest(); x.open("PUT", "/api/biz/files/multipart/" + encodeURIComponent(id) + "/part?n=" + n); x.setRequestHeader("x-fodo-upload", "1"); x.setRequestHeader("content-type", "application/octet-stream");
      x.onload = function () { var j; try { j = JSON.parse(x.responseText); } catch (e) { j = { ok: false, reason: "Part " + n + " failed (" + x.status + ")." }; } res(j); }; x.onerror = function () { res({ ok: false, offline: true, reason: "Connection lost." }); }; x.send(blob); })
      .then(function (j) { if (j.ok || j._status === 415 || /isn't allowed|declared size|expired|not found/i.test(j.reason || "") || !(tries > 0)) return j; return new Promise(function (r) { setTimeout(r, 1500); }).then(function () { return putPart(id, n, blob, tries - 1); }); });
  }
  function mpUpload(file, params, bar, info) {
    var body = { name: file.name, size: file.size, project: params.project || "", milestone: params.milestone || "", kind: params.kind || "", replaces: params.replaces || "", note: params.note || "" };
    return api("files/multipart", body).then(function (j) { if (!j.ok) return j; var up = j.upload, PS = up.partSize, N = up.parts, done = 0, failed = null, next = 1, sent = {};
      var tick = function () { if (bar) bar.value = Math.round(done / N * 100); };
      var one = function () { if (failed || next > N) return Promise.resolve(); var n = next++; var blob = file.slice((n - 1) * PS, Math.min(file.size, n * PS));
        return putPart(up.id, n, blob, 3).then(function (r) { if (!r.ok) { failed = r; return; } sent[n] = true; done++; tick(); return one(); }); };
      return Promise.all([one(), one(), one()]).then(function () { if (failed) { api("files/multipart/" + up.id + "/abort", {}); return failed; } return api("files/multipart/" + up.id + "/complete", {}); }); });
  }

  /* ---------- calendar feed box ---------- */
  function calendar(box, kind) {
    api("calendar/link?kind=" + kind).then(function (j) { if (!box.isConnected) return; if (!j.ok) { box.innerHTML = '<p class="ws-sub">' + esc(j.reason) + "</p>"; return; } var f = j.feed;
      box.innerHTML = '<h2>Calendar sync</h2><p class="ws-sub">' + (kind === "pro" ? "Your booked days, team dates and blocked days" : kind === "staff" ? "Every team date and invitation deadline" : "Your project days, shoot dates, milestone due dates and quote expiry dates") + ' in Google Calendar, Apple Calendar or Outlook. Subscribe once; it refreshes itself. The link is private: anyone who has it sees these dates, so regenerate it if it leaks.</p>' +
        '<div class="ws-row sy-link"><input readonly value="' + esc(f.url) + '" aria-label="Calendar feed link" id="cal-url"><button type="button" class="ws-btn sm" id="cal-copy">Copy link</button><a class="ws-btn sm" href="' + esc(f.webcal) + '">Open in calendar app</a><a class="ws-btn sm" href="https://calendar.google.com/calendar/r/settings/addbyurl?cid=' + encodeURIComponent(f.url) + '" target="_blank" rel="noopener noreferrer">Add to Google Calendar</a></div>' +
        '<p class="ws-sub">Created ' + esc(day(f.createdAt)) + (f.lastUsed ? " · last fetched " + esc(new Date(f.lastUsed).toLocaleString("en-IN")) : " · not fetched by a calendar yet") + ' · <button type="button" class="ws-link" id="cal-new">Regenerate link</button> · <button type="button" class="ws-link" id="cal-off">Switch off</button></p>';
      $("#cal-copy", box).onclick = function () { var i = $("#cal-url", box); i.select(); try { navigator.clipboard.writeText(i.value); toast("Link copied."); } catch (e) { document.execCommand("copy"); toast("Link copied."); } };
      $("#cal-new", box).onclick = function () { if (confirm("Regenerate? The old link stops working and you subscribe again with the new one.")) act(this, "calendar/link", { kind: kind }, function () { toast("New link ready."); calendar(box, kind); }); };
      $("#cal-off", box).onclick = function () { if (confirm("Switch the calendar link off? Calendars that use it stop updating.")) act(this, "calendar/revoke", { kind: kind }, function () { toast("Switched off."); calendar(box, kind); }); };
    });
  }

  /* ---------- organization (Settings) ---------- */
  var RL = { owner: "Owner", admin: "Admin", member: "Member" };
  function org(box) {
    api("org").then(function (j) { if (!box.isConnected) return; if (!j.ok) { box.innerHTML = '<p class="ws-sub">' + esc(j.reason) + "</p>"; return; } var o = j.org;
      var inv = j.invitations.length ? '<div class="ws-status st-pending"><b>Invitation' + (j.invitations.length > 1 ? "s" : "") + "</b>" + j.invitations.map(function (i) { return '<span>' + esc(i.invited_by) + " invited you to <b>" + esc(i.name) + '</b> <button type="button" class="ws-btn sm pri" data-oa="' + esc(i.id) + '">Join</button> <button type="button" class="ws-btn sm" data-od="' + esc(i.id) + '">Decline</button></span>'; }).join("") + "</div>" : "";
      box.innerHTML = "<h2>Organization</h2>" + (o ? '<p class="ws-sub">People in <b>' + esc(o.name) + "</b> see each other's quotes, contracts, invoices and projects (read-only). Accepting, signing and paying stay with the person who owns the record" + (o.actOnBehalf ? ", except that the owner and admins may accept a quote or sign a contract for a colleague (switched on below)" : "") + ". The billing details below appear on your quotes, contracts and invoices.</p>" : '<p class="ws-sub">Work as a company: colleagues see each other\'s quotes, contracts, invoices and projects, and your company\'s legal name and GSTIN go on every document. One organization per person.</p>') + inv +
        (o ? '<form class="ws-form" id="og-f"><div class="ws-g2"><label class="ws-f"><span>Organization name</span><input name="name" maxlength="80" value="' + esc(o.name) + '"' + (j.canManage ? "" : " disabled") + '></label><label class="ws-f"><span>Legal name (on invoices)</span><input name="legalName" maxlength="120" value="' + esc(o.legalName) + '"' + (j.canManage ? "" : " disabled") + '></label></div><div class="ws-g2"><label class="ws-f"><span>GSTIN (optional)</span><input name="gstin" maxlength="15" value="' + esc(o.gstin) + '" placeholder="07ABCDE1234F1Z5"' + (j.canManage ? "" : " disabled") + '></label><label class="ws-f"><span>Website</span><input name="website" type="url" value="' + esc(o.website) + '"' + (j.canManage ? "" : " disabled") + '></label></div><label class="ws-f"><span>Billing address</span><textarea name="address" rows="2" maxlength="300"' + (j.canManage ? "" : " disabled") + ">" + esc(o.address) + '</textarea></label>' +
          (o.myRole === "owner" ? '<label class="ws-ck"><input type="checkbox" name="actOnBehalf"' + (o.actOnBehalf ? " checked" : "") + "> The owner and admins may accept quotes and sign contracts on behalf of colleagues (the signature records who signed).</label>" : "") + (j.canManage ? '<div class="ws-row"><button class="ws-btn pri" type="submit">Save organization</button></div>' : "") + "</form>" +
          '<h3 class="ws-h3">People</h3><ul class="ws-rows">' + j.members.map(function (m) { return "<li><b>" + esc(m.name || m.email) + "</b><span>" + esc(m.email) + "</span>" + '<i class="ws-pill' + (m.status === "active" ? " ok" : "") + '">' + esc(RL[m.role] || m.role) + (m.status === "invited" ? " · invited" : "") + "</i>" + (j.canManage && m.role !== "owner" ? '<span class="ws-acts">' + (o.myRole === "owner" && m.status === "active" ? '<button type="button" class="ws-btn sm" data-role="' + (m.role === "admin" ? "member" : "admin") + '" data-em="' + esc(m.email) + '">Make ' + (m.role === "admin" ? "member" : "admin") + '</button><button type="button" class="ws-btn sm" data-tr="' + esc(m.email) + '">Make owner</button>' : "") + '<button type="button" class="ws-btn sm danger" data-rm="' + esc(m.email) + '">Remove</button></span>' : "") + "</li>"; }).join("") + "</ul>" +
          (j.canManage ? '<form class="ws-form ws-inline" id="og-inv"><input name="email" type="email" required placeholder="colleague@company.com" aria-label="Email"><select name="role" aria-label="Role"><option value="member">Member</option><option value="admin">Admin</option></select><button class="ws-btn" type="submit">Invite</button></form>' : "") +
          '<p class="ws-sub"><button type="button" class="ws-link" id="og-leave">' + (o.myRole === "owner" ? "Delete the organization" : "Leave the organization") + "</button></p>"
        : '<form class="ws-form ws-inline" id="og-new"><input name="name" required maxlength="80" placeholder="Company name" aria-label="Company name"><button class="ws-btn pri" type="submit">Create organization</button></form>');
      $$("[data-oa]", box).forEach(function (b) { b.onclick = function () { act(b, "org/answer", { orgId: b.dataset.oa, accept: true }, function () { toast("Welcome aboard."); org(box); }); }; });
      $$("[data-od]", box).forEach(function (b) { b.onclick = function () { act(b, "org/answer", { orgId: b.dataset.od, accept: false }, function () { org(box); }); }; });
      if ($("#og-new", box)) $("#og-new", box).onsubmit = function (e) { e.preventDefault(); act(e.submitter, "org", fd(this), function () { toast("Organization created."); org(box); }); };
      if ($("#og-f", box)) $("#og-f", box).onsubmit = function (e) { e.preventDefault(); act(e.submitter, "org/settings", fd(this), function () { toast("Saved."); org(box); }); };
      if ($("#og-inv", box)) $("#og-inv", box).onsubmit = function (e) { e.preventDefault(); act(e.submitter, "org/invite", fd(this), function () { toast("Invited. They accept it under Settings → Organization after logging in with that email."); org(box); }); };
      $$("[data-rm]", box).forEach(function (b) { b.onclick = function () { if (confirm("Remove " + b.dataset.rm + "?")) act(b, "org/member", { email: b.dataset.rm, remove: true }, function () { org(box); }); }; });
      $$("[data-role]", box).forEach(function (b) { b.onclick = function () { act(b, "org/member", { email: b.dataset.em, role: b.dataset.role }, function () { org(box); }); }; });
      $$("[data-tr]", box).forEach(function (b) { b.onclick = function () { if (confirm("Make " + b.dataset.tr + " the owner? You become an admin.")) act(b, "org/transfer", { email: b.dataset.tr }, function () { org(box); }); }; });
      if ($("#og-leave", box)) $("#og-leave", box).onclick = function () { if (confirm(o.myRole === "owner" ? "Delete the organization? Only possible when you are the last person in it." : "Leave the organization?")) act(this, "org/leave", {}, function () { toast("Done."); org(box); }); };
    });
  }
  /* the shared view: what colleagues have (client Quotes page) */
  function shared(box) {
    api("org/shared").then(function (j) { if (!box.isConnected || !j.ok || !j.org) return;
      var row = function (x, href) { return '<li><a href="' + href + '"><b>' + esc(x.number ? x.number + " · " : "") + esc(x.title) + "</b></a><span>" + esc(x.owner || "") + "</span>" + (x.total != null ? "<span>" + inr(x.total) + "</span>" : "") + '<i class="ws-pill">' + esc(String(x.status || "").replace(/_/g, " ")) + "</i></li>"; };
      box.innerHTML = '<details class="ws-fold"><summary>' + esc(j.org.name) + ": colleagues' quotes, contracts, invoices and projects (" + (j.quotes.length + j.contracts.length + j.invoices.length + j.projects.length) + ")</summary>" +
        (j.quotes.length ? '<h3 class="ws-h3">Quotes</h3><ul class="ws-rows">' + j.quotes.map(function (x) { return row(x, "#quote=" + esc(x.id)); }).join("") + "</ul>" : "") + (j.contracts.length ? '<h3 class="ws-h3">Contracts</h3><ul class="ws-rows">' + j.contracts.map(function (x) { return row(x, "#contract=" + esc(x.id)); }).join("") + "</ul>" : "") +
        (j.invoices.length ? '<h3 class="ws-h3">Invoices</h3><ul class="ws-rows">' + j.invoices.map(function (x) { return row(x, "/api/biz/invoices/" + esc(x.id) + "/print"); }).join("") + "</ul>" : "") + (j.projects.length ? '<h3 class="ws-h3">Projects</h3><ul class="ws-rows">' + j.projects.map(function (x) { return row(x, "#project=" + esc(x.id)); }).join("") + "</ul>" : "") + (j.members < 2 ? '<p class="ws-sub">Invite colleagues under Settings → Organization.</p>' : "") + "</details>";
    });
  }

  /* ---------- admin: background jobs ---------- */
  function jobs(B, q) {
    var st = q.get("status") || "";
    api("admin/jobs?status=" + st).then(function (j) { if (!B.isConnected) return; if (!j.ok) return fail(B, j, function () { jobs(B, q); });
      B.innerHTML = '<p class="ws-sub">Background work (emails, housekeeping, provider checks, webhooks) runs through this queue: ' + esc(j.queue) + ". A job runs once per attempt, failures retry with backoff (up to 5 times), then it is marked dead and logged.</p>" +
        '<div class="ws-cards">' + ["queued", "running", "done", "failed", "dead"].map(function (k) { return '<a class="ws-card" href="#admin?tab=mission&sub=jobs&status=' + k + '"><small>' + k + "</small><b>" + (j.counts[k] || 0) + "</b></a>"; }).join("") + "</div>" +
        '<div class="ws-row"><button type="button" class="ws-btn" id="jb-run">Run due jobs now</button><a class="ws-btn" href="#admin?tab=mission&sub=jobs">All</a></div>' +
        (j.items.length ? '<ul class="ws-rows">' + j.items.map(function (x) { return "<li><b>" + esc(x.kind) + "</b><span>" + esc(x.summary || "") + "</span><small>" + esc(new Date(x.createdAt).toLocaleString("en-IN")) + " · by " + esc(x.by) + " · attempt " + x.attempts + "/" + x.maxAttempts + (x.error ? " · " + esc(x.error) : "") + '</small><i class="ws-pill' + (x.status === "done" ? " ok" : x.status === "failed" || x.status === "dead" ? " warn" : "") + '">' + esc(x.status) + "</i>" + (x.status === "failed" || x.status === "dead" ? '<button type="button" class="ws-btn sm" data-retry="' + esc(x.id) + '">Retry</button>' : "") + "</li>"; }).join("") + "</ul>" : empty("No jobs" + (st ? " with status " + st : "") + ".")) +
        '<details class="ws-fold"><summary>Job kinds</summary><ul class="ws-rows">' + j.kinds.map(function (k) { return "<li><b>" + esc(k.kind) + "</b><span>" + esc(k.desc) + "</span></li>"; }).join("") + "</ul></details>";
      $("#jb-run", B).onclick = function () { act(this, "admin/jobs/run", { n: 10 }, function (r) { toast("Ran " + r.ran + ": " + r.done + " done, " + r.failed + " failed" + (r.dead ? ", " + r.dead + " dead" : "") + "."); jobs(B, q); }); };
      $$("[data-retry]", B).forEach(function (b) { b.onclick = function () { act(b, "admin/jobs/" + b.dataset.retry + "/retry", {}, function () { jobs(B, q); }); }; });
    });
  }
  window.FODO_WS_SYNC = { mpUpload: mpUpload, calendar: calendar, org: org, shared: shared, jobs: jobs };
})();
