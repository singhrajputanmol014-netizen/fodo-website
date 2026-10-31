/* FODO BRAIN: Social media page (connect accounts, upload once → post everywhere in original quality, numbers) and the
   Access page (owners give team members full or limited Brain access). Uses the helpers exposed by owner-brain.js. */
(function () {
  "use strict";
  var B = window.__OB; if (!B) return;
  var api = B.api, esc = B.esc, V = B.V, VIEWS = B.VIEWS, badge = B.badge, num = B.num, fmtDate = B.fmtDate, API = B.API;
  var ICON = { facebook: "f", instagram: "◎", linkedin: "in", linkedin_org: "in", x: "𝕏", youtube: "▶" };
  var NAME = { facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", linkedin_org: "LinkedIn page", x: "X", youtube: "YouTube" };
  var PART = 4 * 1024 * 1024, POLL = null, UP = [];   // UP: files in the composer [{id, name, mime, size, url, state, pct, jpeg}]

  VIEWS.social = function () {
    clearTimeout(POLL);
    api("social").then(function (j) {
      if (!j.ok) { V().innerHTML = '<p class="ob-empty">' + esc(j.reason) + "</p>"; return; }
      var A = j.accounts || [], av = j.available || {}, P = j.platforms || {}, hs = decodeURIComponent(location.hash), err = (/err=([^&]+)/.exec(hs) || [])[1], ok = /[?&]ok=/.test(hs);
      var conn = function (key, label, plat, href) { var on = av[plat]; return '<div class="ob-soc-c"><span class="ob-soc-i ' + plat + '">' + ICON[plat] + "</span><div><b>" + label + "</b><small>" + (on ? "Ready to connect" : "Needs " + esc((P[plat] || {}).needs || "keys")) + "</small></div>" + (j.canManage ? (on ? '<a class="ob-btn sm pri" href="' + href + '">Connect</a>' : '<a class="ob-btn sm" href="#social" data-help="' + plat + '">How?</a>') : "") + "</div>"; };
      V().innerHTML = '<h2 class="ob-h">Social media</h2><p class="ob-sub">Upload once, post everywhere. FODO sends your file exactly as you uploaded it, no resizing, no re-compression (each platform then applies its own processing). Every post is logged; scheduled posts go out within the hour.</p>' +
        (err ? '<div class="ob-card ob-warn">Couldn\'t connect: ' + esc(err) + "</div>" : ok ? '<div class="ob-card ob-good">Connected. Your accounts are below.</div>' : "") +
        '<div class="ob-grid g2"><div class="ob-card"><h2>Compose</h2><div id="ob-cmp"></div></div><div class="ob-card"><h2>Accounts (' + A.length + ')</h2><div id="ob-acc">' +
        (A.length ? A.map(function (a) { return '<div class="ob-soc-a"><span class="ob-soc-i ' + a.platform + '">' + (a.avatar ? '<img src="' + esc(a.avatar) + '" alt="" referrerpolicy="no-referrer">' : ICON[a.platform]) + '</span><div class="t"><b>' + esc(a.name || a.handle) + "</b><small>" + NAME[a.platform] + (a.handle && a.handle !== a.name ? " · " + esc(a.handle) : "") + (a.via ? " · " + esc(a.via) : "") + (a.expiresSoon ? ' · <span style="color:var(--b-warn)">expires ' + esc(String(a.expires_at).slice(0, 10)) + ", reconnect</span>" : "") + "</small></div>" + (j.canManage && a.platform !== "youtube" ? '<button class="ob-btn sm" data-dis="' + esc(a.id) + '" aria-label="Disconnect">✕</button>' : "") + "</div>"; }).join("") : '<p class="ob-empty">No accounts yet.</p>') +
        '</div><div class="ob-soc-cs">' + conn("meta", "Facebook Page + Instagram", "facebook", API + "connect/meta") + conn("linkedin", "LinkedIn", "linkedin", API + "connect/linkedin") + conn("x", "X (Twitter)", "x", API + "connect/x") + '<div class="ob-soc-c"><span class="ob-soc-i youtube">▶</span><div><b>YouTube</b><small>Through your Google account (YouTube upload ticked)</small></div>' + (j.canManage ? '<a class="ob-btn sm" href="#connectors">Google</a>' : "") + "</div></div></div></div>" +
        '<div class="ob-card" style="margin-top:14px"><div class="ob-row" style="justify-content:space-between"><h2 style="margin:0">Numbers</h2><button class="ob-btn sm" id="ob-sst">Load live numbers</button></div><div id="ob-stats"><p class="ob-empty">Followers, reach and how your recent posts did, straight from each platform.</p></div></div>' +
        '<div class="ob-card" style="margin-top:14px"><h2>Posts</h2><div id="ob-posts"></div></div>';
      composer(A, P); posts(j.posts || []);
      V().querySelectorAll("[data-dis]").forEach(function (b) { b.onclick = function () { if (confirm("Disconnect this account from FODO Brain?")) api("social/accounts/" + encodeURIComponent(b.dataset.dis), "DELETE").then(VIEWS.social); }; });
      V().querySelectorAll("[data-help]").forEach(function (b) { b.onclick = function (e) { e.preventDefault(); help(b.dataset.help); }; });
      document.getElementById("ob-sst").onclick = stats;
    });
  };
  function help(p) {
    var o = location.origin, t = {
      facebook: "1) developers.facebook.com → My Apps → Create app → type Business.\n2) Add products: Facebook Login for Business + Instagram.\n3) Valid OAuth Redirect URIs: " + o + "/api/owner-brain/connect/meta/callback\n4) App settings → Basic: copy App ID + App secret → Cloudflare secrets META_APP_ID and META_APP_SECRET.\n5) Your Instagram must be a Professional account linked to your Facebook Page.",
      linkedin: "1) linkedin.com/developers → Create app (link your FODO company page).\n2) Products: add “Sign In with LinkedIn using OpenID Connect” and “Share on LinkedIn”. For company-page posting also request “Community Management API”.\n3) Auth → Redirect URLs: " + o + "/api/owner-brain/connect/linkedin/callback\n4) Copy Client ID + Client Secret → secrets LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET. After LinkedIn approves the company-page product, add LINKEDIN_ORG_APPROVED = 1 and reconnect.",
      x: "1) developer.x.com → Projects & Apps → your app → User authentication settings: OAuth 2.0, type “Web App, Automated App or Bot”, permissions Read and write.\n2) Callback URI: " + o + "/api/owner-brain/connect/x/callback\n3) Keys and tokens → OAuth 2.0 Client ID and Client Secret → secrets X_CLIENT_ID and X_CLIENT_SECRET.\n4) X bills each post (pay-per-use), add billing in the X developer console.",
    }[p] || "Add the platform's keys in Cloudflare.";
    alert(t);
  }
  /* ---------- composer ---------- */
  function composer(A, P) {
    var el = document.getElementById("ob-cmp"), postable = A.filter(function (a) { return a.status === "ok"; });
    el.innerHTML = '<textarea class="ob-ta" id="ob-cap" placeholder="Write your post… #hashtags work everywhere" maxlength="63000"></textarea><div class="ob-row ob-small"><span id="ob-cnt">0 characters</span><span id="ob-xw"></span></div>' +
      '<div class="ob-drop" id="ob-drop" tabindex="0" role="button" aria-label="Add photos or video"><input type="file" id="ob-file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm" multiple hidden><b>+ Add photos or a video</b><small>Drag files here or tap. Photos: JPG/PNG/WebP (up to 10). Video: MP4/MOV up to 300 MB. Sent in original quality.</small></div><div class="ob-thumbs" id="ob-thumbs"></div>' +
      '<div class="ob-tg"><div class="ob-row" style="justify-content:space-between"><b>Post to</b>' + (postable.length > 1 ? '<label class="ob-chk"><input type="checkbox" id="ob-all"> All</label>' : "") + '</div><div class="ob-tgl">' +
      (postable.length ? postable.map(function (a) { return '<label class="ob-chk ob-tgc"><input type="checkbox" name="tg" value="' + esc(a.id) + '" data-p="' + a.platform + '"><span class="ob-soc-i ' + a.platform + ' sm">' + ICON[a.platform] + "</span>" + esc(a.name || a.handle) + "</label>"; }).join("") : '<p class="ob-empty">Connect an account first.</p>') + "</div></div>" +
      '<details class="ob-per"><summary>Different text per platform (optional)</summary><div id="ob-perw"></div></details>' +
      '<div class="ob-row" style="margin-top:12px"><label class="ob-chk">⏱ <input type="datetime-local" class="ob-in" id="ob-when" style="width:auto"></label><span class="sp" style="flex:1"></span><button class="ob-btn pri" id="ob-go" disabled>Post now</button></div><p class="ob-empty" id="ob-pmsg"></p>';
    var cap = document.getElementById("ob-cap"), cnt = function () { var n = cap.value.length, xs = [].slice.call(document.querySelectorAll('input[name=tg]:checked')).some(function (c) { return c.dataset.p === "x"; }); document.getElementById("ob-cnt").textContent = n + " characters"; var xt = (document.getElementById("ob-per-x") || {}).value; document.getElementById("ob-xw").innerHTML = xs ? ((xt != null && xt !== "" ? xt.length : n) > 280 ? '<span style="color:var(--b-err)">X allows 280, write a shorter X version below</span>' : "X: " + (xt ? xt.length : n) + "/280") : ""; ready(); };
    cap.oninput = cnt;
    var plats = function () { var o = {}; [].slice.call(document.querySelectorAll("input[name=tg]:checked")).forEach(function (c) { o[c.dataset.p] = 1; }); return Object.keys(o); };
    var per = function () { var w = document.getElementById("ob-perw"), keep = {}; w.querySelectorAll("textarea").forEach(function (t) { keep[t.dataset.p] = t.value; }); w.innerHTML = plats().map(function (p) { return "<label>" + NAME[p] + '<textarea class="ob-ta" style="min-height:70px" id="ob-per-' + p + '" data-p="' + p + '" placeholder="Leave empty to use the main text">' + esc(keep[p] || "") + "</textarea></label>"; }).join("") || '<p class="ob-empty">Choose accounts first.</p>'; w.querySelectorAll("textarea").forEach(function (t) { t.oninput = cnt; }); };
    el.querySelectorAll("input[name=tg]").forEach(function (c) { c.onchange = function () { per(); cnt(); }; });
    var all = document.getElementById("ob-all"); if (all) all.onchange = function () { el.querySelectorAll("input[name=tg]").forEach(function (c) { c.checked = all.checked; }); per(); cnt(); };
    per();
    var drop = document.getElementById("ob-drop"), file = document.getElementById("ob-file");
    drop.onclick = function () { file.click(); }; drop.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } };
    file.onchange = function () { add([].slice.call(file.files)); file.value = ""; };
    drop.ondragover = function (e) { e.preventDefault(); drop.classList.add("on"); }; drop.ondragleave = function () { drop.classList.remove("on"); };
    drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove("on"); add([].slice.call(e.dataTransfer.files || [])); };
    var when = document.getElementById("ob-when"); when.oninput = function () { document.getElementById("ob-go").textContent = when.value ? "Schedule" : "Post now"; };
    document.getElementById("ob-go").onclick = function () {
      var b = this, targets = [].slice.call(document.querySelectorAll("input[name=tg]:checked")).map(function (c) { return c.value; }), caps = {};
      document.querySelectorAll("#ob-perw textarea").forEach(function (t) { if (t.value.trim()) caps[t.dataset.p] = t.value; });
      var media = UP.filter(function (u) { return u.state === "ready"; }).map(function (u) { return u.id; });
      if (!confirm((when.value ? "Schedule this post for " + new Date(when.value).toLocaleString("en-IN") : "Post NOW") + " to " + targets.length + " account(s)?")) return;
      b.disabled = true; b.textContent = "Posting…"; msg("");
      api("social/posts", "POST", { caption: cap.value, captions: caps, media: media, targets: targets, scheduleAt: when.value ? new Date(when.value).toISOString() : null }).then(function (r) {
        b.textContent = when.value ? "Schedule" : "Post now";
        if (!r.ok) { msg(r.reason, true); ready(); return; }
        msg(r.post.status === "scheduled" ? "Scheduled ✓" : "Publishing… you can keep working, this page shows each platform's result."); cap.value = ""; UP = []; thumbs(); per(); cnt(); when.value = "";
        api("social").then(function (j) { posts(j.posts || []); });
      });
    };
    function ready() { var t = document.querySelectorAll("input[name=tg]:checked").length, up = UP.some(function (u) { return u.state !== "ready" && u.state !== "error"; }); document.getElementById("ob-go").disabled = !t || up || (!cap.value.trim() && !UP.length); }
    function msg(t, bad) { var m = document.getElementById("ob-pmsg"); m.textContent = t || ""; m.style.color = bad ? "var(--b-err)" : ""; }
    function thumbs() { var w = document.getElementById("ob-thumbs"); w.innerHTML = UP.map(function (u, i) { return '<div class="ob-th">' + (/^video/.test(u.mime) ? '<video src="' + u.url + '" muted playsinline></video><span class="v">▶</span>' : '<img src="' + u.url + '" alt="">') + '<div class="bar"><i style="width:' + u.pct + '%"></i></div><small>' + (u.state === "ready" ? "✓ " + (u.size / 1048576).toFixed(1) + " MB" : u.state === "error" ? "✕ " + esc(u.error) : u.pct + "%") + '</small><button data-rm="' + i + '" aria-label="Remove">✕</button></div>'; }).join("");
      w.querySelectorAll("[data-rm]").forEach(function (b) { b.onclick = function () { UP.splice(+b.dataset.rm, 1); thumbs(); ready(); }; }); ready(); }
    function add(files) {
      files.forEach(function (f) {
        if (!/^(image\/(jpeg|png|webp|gif)|video\/(mp4|quicktime|webm))$/.test(f.type)) { msg(f.name + ": this file type can't be posted.", true); return; }
        if (f.size > 300 * 1048576) { msg(f.name + " is larger than 300 MB.", true); return; }
        var u = { name: f.name, mime: f.type, size: f.size, url: URL.createObjectURL(f), state: "uploading", pct: 0 }; UP.push(u); thumbs();
        dims(f, u).then(function (d) { return upload(f, d, null, function (p) { u.pct = p; thumbs(); }); }).then(function (id) { u.id = id;
          if (/^image\/(png|webp)$/.test(f.type)) return jpegCopy(f).then(function (jb) { return upload(jb, {}, id, function () {}); });   // Instagram only takes JPG: a maximum-quality JPG copy is kept for Instagram only
        }).then(function () { u.state = "ready"; u.pct = 100; thumbs(); }, function (e) { u.state = "error"; u.error = e.message; thumbs(); });
      });
    }
  }
  function dims(f, u) { return new Promise(function (ok) { if (/^image/.test(f.type)) { var i = new Image(); i.onload = function () { ok({ width: i.naturalWidth, height: i.naturalHeight }); }; i.onerror = function () { ok({}); }; i.src = u.url; } else { var v = document.createElement("video"); v.preload = "metadata"; v.onloadedmetadata = function () { ok({ width: v.videoWidth, height: v.videoHeight, duration: v.duration }); }; v.onerror = function () { ok({}); }; v.src = u.url; } }); }
  function jpegCopy(f) { return new Promise(function (ok, no) { var i = new Image(); i.onload = function () { var c = document.createElement("canvas"); c.width = i.naturalWidth; c.height = i.naturalHeight; var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(i, 0, 0); c.toBlob(function (b) { if (!b) return no(new Error("JPG copy failed")); b.name = f.name.replace(/\.\w+$/, "") + ".jpg"; ok(b); }, "image/jpeg", 1); }; i.onerror = function () { no(new Error("Can't read the image")); }; i.src = URL.createObjectURL(f); }); }
  function upload(f, d, variantOf, onPct) {
    return api("social/media", "POST", { name: f.name || "image.jpg", mime: f.type, size: f.size, width: d.width, height: d.height, duration: d.duration, variantOf: variantOf }).then(function (r) {
      if (!r.ok) throw new Error(r.reason); var n = r.parts, done = 0, next = 0;
      function one() { if (next >= n) return Promise.resolve(); var i = next++, blob = f.slice(i * PART, Math.min(f.size, (i + 1) * PART)), tries = 0;
        function put() { return fetch(API + "social/media/" + r.id + "/" + i, { method: "PUT", credentials: "same-origin", headers: { "content-type": "application/octet-stream" }, body: blob }).then(function (x) { return x.json(); }).then(function (j) { if (!j.ok) throw new Error(j.reason || "upload failed"); done++; onPct(Math.round(done / n * 97)); }).catch(function (e) { if (++tries < 3) return new Promise(function (ok) { setTimeout(ok, 1500 * tries); }).then(put); throw e; }); }
        return put().then(one); }
      return Promise.all([one(), one(), one()]).then(function () { return api("social/media/" + r.id + "/done", "POST", {}); }).then(function (x) { if (!x.ok) throw new Error(x.reason); onPct(100); return r.id; });
    });
  }
  /* ---------- posts + live progress ---------- */
  function posts(L) {
    var el = document.getElementById("ob-posts"); if (!el) return;
    el.innerHTML = L.length ? L.map(function (p) {
      return '<div class="ob-post"><div class="ob-row" style="justify-content:space-between"><div><b>' + esc((p.caption || "(media only)").slice(0, 110)) + "</b><small class=\"ob-empty\"> · " + (p.status === "scheduled" ? "scheduled for " + fmtDate(p.scheduled_at) : fmtDate(p.created_at)) + (p.created_by ? " · " + esc(p.created_by) : "") + "</small></div><span>" + badge(p.status === "done" ? "ok" : p.status === "failed" ? "error" : p.status === "partial" ? "important" : "info") + " " + esc(p.status) + (p.status === "scheduled" ? ' <button class="ob-btn sm" data-cancel="' + esc(p.id) + '">Cancel</button>' : "") + "</span></div><div class=\"ob-pt\">" +
        p.targets.map(function (t) { var r = p.results[t] || {}, plat = t.split(":")[0]; return '<span class="ob-pt-i ' + esc(r.status) + '"><span class="ob-soc-i ' + plat + ' sm">' + ICON[plat] + "</span>" + (r.url ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.status) + " ↗</a>" : esc(r.status || "queued")) + (r.error ? ' <small title="' + esc(r.error) + '">' + esc(r.error.slice(0, 90)) + "</small>" : r.note ? ' <small title="' + esc(r.note) + '">ⓘ</small>' : r.status === "working" && r.lastError ? ' <small>retrying…</small>' : "") + "</span>"; }).join("") + "</div></div>";
    }).join("") : '<p class="ob-empty">Nothing posted yet.</p>';
    el.querySelectorAll("[data-cancel]").forEach(function (b) { b.onclick = function () { api("social/posts/" + b.dataset.cancel + "/cancel", "POST", {}).then(function () { api("social").then(function (j) { posts(j.posts || []); }); }); }; });
    var live = L.filter(function (p) { return p.status === "publishing"; })[0];
    clearTimeout(POLL); if (live) POLL = setTimeout(function () { if (!document.getElementById("ob-posts")) return; api("social/posts/" + live.id + "/run", "POST", {}).then(function () { api("social").then(function (j) { posts(j.posts || []); }); }); }, 1500);
  }
  function stats() {
    var el = document.getElementById("ob-stats"); el.innerHTML = '<p class="ob-empty">Asking each platform…</p>';
    api("social/stats").then(function (j) { var L = j.items || [];
      el.innerHTML = L.length ? '<div class="ob-grid g3">' + L.map(function (s) {
        return '<div class="ob-card ob-kpi"><div class="ob-row"><span class="ob-soc-i ' + s.platform + ' sm">' + ICON[s.platform] + "</span><b style=\"font-size:15px;display:inline\">" + esc(s.name || NAME[s.platform]) + "</b></div>" + (s.error ? '<small style="color:var(--b-err)">' + esc(s.error) + "</small>" :
          "<b>" + num(s.followers) + '</b><span>' + (s.platform === "youtube" ? "subscribers" : "followers") + "</span><small>" + [s.posts != null ? num(s.posts) + " posts" : "", s.views != null ? num(s.views) + " views" : "", s.reachToday != null ? num(s.reachToday) + " reach today" : ""].filter(Boolean).join(" · ") + (s.note ? "<br>" + esc(s.note) : "") + "</small>" +
          ((s.recent || []).length ? '<ul class="ob-list" style="margin-top:8px">' + s.recent.slice(0, 4).map(function (r) { return '<li><div class="t"><small>' + (r.url ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc((r.text || r.title || r.type || "post").slice(0, 60)) + "</a>" : esc((r.text || r.title || "").slice(0, 60))) + "<br>" + [r.likes != null ? "♥ " + num(r.likes) : "", r.reactions != null ? "♥ " + num(r.reactions) : "", r.views != null ? num(r.views) + " views" : "", r.comments != null ? "💬 " + num(r.comments) : "", r.shares ? "↗ " + num(r.shares) : ""].filter(Boolean).join(" · ") + "</small></div></li>"; }).join("") + "</ul>" : "")) + "</div>";
      }).join("") + "</div>" : '<p class="ob-empty">Connect an account to see its numbers.</p>'; });
  }

  /* ---------- Access (owners only) ---------- */
  VIEWS.access = function () {
    api("members").then(function (j) {
      if (!j.ok) { V().innerHTML = '<p class="ob-empty">' + esc(j.reason) + "</p>"; return; }
      var L = j.items || [], P = j.perms || {};
      V().innerHTML = '<h2 class="ob-h">Access</h2><p class="ob-sub">Give anyone with a FODO login access to the Brain. They sign in on the website with their own email, no passwords to share. Only the two owners can change this.</p>' +
        '<div class="ob-grid g2"><form class="ob-card" id="ob-mf"><h2>Give access</h2><label>Email<input class="ob-in" name="email" type="email" required placeholder="teammate@company.com"></label>' +
        '<div class="ob-row" style="margin:12px 0"><label class="ob-chk"><input type="radio" name="role" value="full"> <b>Full</b></label><label class="ob-chk"><input type="radio" name="role" value="limited" checked> <b>Limited</b></label></div>' +
        '<p class="ob-empty" id="ob-fullnote" hidden>Full = everything in the Brain except managing access, connecting/disconnecting accounts, Brain settings, the full export and the owners\' personal memories. Secrets are never available to anyone.</p>' +
        '<div id="ob-perms" class="ob-perms">' + Object.keys(P).map(function (k) { return '<label class="ob-chk"><input type="checkbox" name="perm" value="' + k + '"' + (k === "chat" ? " checked" : "") + "> " + esc(P[k]) + "</label>"; }).join("") + "</div>" +
        '<label style="margin-top:10px">Note (optional)<input class="ob-in" name="note" placeholder="e.g. social media manager"></label><div class="ob-row" style="margin-top:12px"><button class="ob-btn pri" type="submit">Save access</button><span class="ob-empty" id="ob-mm"></span></div></form>' +
        '<div class="ob-card"><h2>People with access (' + L.length + ")</h2>" + (L.length ? '<ul class="ob-list">' + L.map(function (m) { return '<li><span class="ob-av">' + esc(m.email.charAt(0).toUpperCase()) + '</span><div class="t"><b>' + esc(m.email) + "</b><small>" + (m.role === "full" ? "<b>Full access</b>" : "Limited: " + esc(m.perms.map(function (p) { return (P[p] || p).split(" (")[0]; }).join(", "))) + (m.note ? " · " + esc(m.note) : "") + "<br>added by " + esc(m.added_by) + " · " + (m.last_seen ? "last used " + fmtDate(m.last_seen) : "not used yet") + '</small></div><button class="ob-btn sm" data-edit="' + esc(m.email) + '">Edit</button><button class="ob-btn sm danger" data-rm="' + esc(m.email) + '">Remove</button></li>'; }).join("") + "</ul>" : '<p class="ob-empty">Only the owners can use the Brain right now.</p>') + "</div></div>";
      var f = document.getElementById("ob-mf"), sync = function () { var full = f.role.value === "full"; document.getElementById("ob-perms").hidden = full; document.getElementById("ob-fullnote").hidden = !full; };
      f.querySelectorAll("input[name=role]").forEach(function (r) { r.onchange = sync; }); sync();
      f.onsubmit = function (e) { e.preventDefault(); var perms = [].slice.call(f.querySelectorAll("input[name=perm]:checked")).map(function (c) { return c.value; });
        api("members", "POST", { email: f.email.value, role: f.role.value, perms: perms, note: f.note.value }).then(function (r) { document.getElementById("ob-mm").textContent = r.ok ? "Saved: " + r.item.email + " can open " + location.origin + "/owner-brain/ after signing in." : r.reason; if (r.ok) setTimeout(VIEWS.access, 1600); }); };
      V().querySelectorAll("[data-rm]").forEach(function (b) { b.onclick = function () { if (confirm("Remove " + b.dataset.rm + "'s Brain access?")) api("members/" + encodeURIComponent(b.dataset.rm), "DELETE").then(VIEWS.access); }; });
      V().querySelectorAll("[data-edit]").forEach(function (b) { b.onclick = function () { var m = L.filter(function (x) { return x.email === b.dataset.edit; })[0]; f.email.value = m.email; f.note.value = m.note || ""; f.querySelector("input[value=" + m.role + "]").checked = true; f.querySelectorAll("input[name=perm]").forEach(function (c) { c.checked = m.perms.indexOf(c.value) > -1; }); sync(); f.scrollIntoView({ behavior: "smooth" }); }; });
    });
  };
})();
