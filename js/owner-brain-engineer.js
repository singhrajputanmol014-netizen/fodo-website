/* FODO BRAIN — v27 Website Engineer (owner-only page #engineer). Command center · workspace (plan → build → diff → preview → QA →
   deploy) · changes with QA screenshots · project map · find anything · setup. Every number shown comes from a real check;
   anything not connected says so. The server decides access (owner only) — this page only shows what the server returns. */
(function () {
  "use strict";
  var B = window.__OB; if (!B) return;
  var api = B.api, esc = B.esc, V = B.V, VIEWS = B.VIEWS, badge = B.badge, fmtDate = B.fmtDate, md = B.md;
  var TAB = "center", POLL = null, OV = null, PHRASE = "CONFIRM PRODUCTION CHANGE";
  var TABS = [["center", "Command center"], ["work", "Workspace"], ["sites", "Websites"], ["changes", "Changes"], ["map", "Project map"], ["find", "Find"], ["setup", "Setup"]];
  var KLASS = { normal: "", guarded: '<span class="eg-k g">core</span>', hard: '<span class="eg-k h">protected</span>' };
  function stat(s) { return { planned: "plan ready", proposed: "diff ready", pr_open: "preview open", merged: "live", discarded: "discarded", rolled_back: "rolled back", inspecting: "inspecting…", inspected: "inspected" }[s] || s; }
  function qaBadge(q) { return q ? '<span class="eg-qa ' + esc(q) + '">QA ' + esc({ waiting: "running…", passed: "passed", failed: "failed", error: "error", skipped: "skipped" }[q] || q) + "</span>" : ""; }
  function diffHtml(t) { return '<pre class="eg-diff">' + String(t || "").split("\n").map(function (l) { var c = /^\+ /.test(l) ? "a" : /^- /.test(l) ? "d" : /^── /.test(l) ? "h" : ""; return '<span class="' + c + '">' + esc(l) + "</span>"; }).join("\n") + "</pre>"; }
  function err(el, r) { el.innerHTML = '<p class="eg-err">' + esc((r && (r.reason || r.error)) || "Something went wrong.") + "</p>"; }
  /* the confirmation card (same server-side token flow as chat) */
  function confirmInto(box, a, done) {
    box.innerHTML = '<div class="ob-act"><pre>' + esc(a.preview) + '</pre><p class="ob-empty">Risk: ' + esc(a.risk) + ' · expires in 15 min</p><div class="ob-row"><button class="ob-btn sm" data-d="cancel">Cancel</button><button class="ob-btn sm pri" data-d="run">Confirm</button></div></div>';
    box.querySelectorAll("[data-d]").forEach(function (x) { x.onclick = function () { box.querySelectorAll("button").forEach(function (y) { y.disabled = true; });
      api("confirm", "POST", { actionId: a.id, token: a.token, decision: x.dataset.d === "cancel" ? "cancel" : "run" }).then(function (res) { box.innerHTML = res.ok ? (res.cancelled ? "<p>Cancelled.</p>" : "<p><b>Done.</b> " + esc((res.result && (res.result.note || res.result.preview || res.result.pr)) || "") + "</p>") : '<p class="eg-err">' + esc(res.error || res.reason) + "</p>"; if (done) setTimeout(done, 1500); }); }; }); }
  function act(path, box, done) { api(path, "POST", {}).then(function (r) { if (!r.ok) return err(box, r); if (r.pending) return confirmInto(box, r.action, done); if (done) done(); }); }

  VIEWS.engineer = function () {
    clearTimeout(POLL); var t = (/[?&]tab=(\w+)/.exec(location.hash) || [])[1]; if (t) TAB = t;
    V().innerHTML = '<div class="eg"><div class="eg-top"><div><h2 class="ob-h">Website Engineer</h2><p class="ob-sub">Talk → plan → preview → tested at 8 screen sizes → you approve → live. Works on FODO\'s real code on GitHub; production only changes when you confirm.</p></div><span class="eg-env">● PRODUCTION · www.fodo.co.in</span></div>' +
      '<nav class="eg-tabs" role="tablist">' + TABS.map(function (x) { return '<button role="tab" data-t="' + x[0] + '" aria-selected="' + (x[0] === TAB) + '">' + x[1] + "</button>"; }).join("") + '</nav><div id="eg-body"><p class="ob-empty">Loading…</p></div></div>';
    V().querySelectorAll("[data-t]").forEach(function (b) { b.onclick = function () { TAB = b.dataset.t; VIEWS.engineer(); }; });
    ({ center: center, work: work, sites: sitesView, changes: changes, map: mapView, find: findView, setup: setup })[TAB]();
  };
  function body() { return document.getElementById("eg-body"); }
  function load() { return api("eng/overview").then(function (j) { OV = j; return j; }); }

  /* ---------- command center ---------- */
  function center() {
    load().then(function (o) {
      if (!o.ok) return err(body(), o);
      var G = o.github || {}, src = o.sources || [], sv = function (re) { var x = src.filter(function (s) { return re.test(s.name); }); if (!x.length) return ["Not connected", "warn"]; var bad = x.filter(function (s) { return s.status === "down"; }).length, deg = x.filter(function (s) { return s.status === "degraded"; }).length; return bad ? ["Down", "err"] : deg ? ["Degraded", "warn"] : ["Healthy", "ok"]; };
      var tile = function (name, val, cls, sub) { return '<div class="eg-tile ' + (cls || "") + '"><span>' + esc(name) + "</span><b>" + esc(val) + "</b>" + (sub ? "<small>" + sub + "</small>" : "") + "</div>"; };
      var ai = sv(/^AI/), crawler = sv(/crawler|Search results|PageSpeed/), db = o.database || {}, last = o.commits && o.commits[0], sc = o.score || {};
      body().innerHTML = '<div class="eg-tiles">' +
        tile("Website", o.index ? o.index.pages + " pages" : "Not indexed", o.index ? "ok" : "warn", o.index ? "indexed " + fmtDate(o.index.at) : "runs on the next push to main") +
        tile("API", o.index ? o.index.apis + " routes" : "—", "", "AI: " + ai[0] + " · data: " + crawler[0]) +
        tile("Database", db.ok ? "Healthy" : "Error", db.ok ? "ok" : "err", db.ok ? db.tables + " tables" : esc(db.error || "")) +
        tile("GitHub", G.connected ? (G.canPush ? "Connected" : "Read-only") : "Not connected", G.connected && G.canPush ? "ok" : "err", G.connected ? esc(G.repo) : "add GITHUB_TOKEN") +
        tile("Deployment", last ? "Live" : "—", last ? "ok" : "", last ? esc(last.message).slice(0, 70) + " · " + fmtDate(last.date) : "via GitHub") +
        tile("Last change", o.lastChange ? stat(o.lastChange.status) : "None yet", "", o.lastChange ? esc(o.lastChange.title) + " · " + fmtDate(o.lastChange.updated_at) : "") +
        tile("QA", o.lastQa ? o.lastQa.status : "No runs yet", o.lastQa ? (o.lastQa.status === "passed" ? "ok" : "err") : "", o.lastQa ? (o.lastQa.checks - o.lastQa.failing) + "/" + o.lastQa.checks + " checks · " + fmtDate(o.lastQa.at) : "runs on every Brain pull request") +
        '</div><div class="eg-score ob-card"><div><span>FODO WEBSITE HEALTH SCORE</span><b>' + (sc.total != null ? sc.total + "<small>/100</small>" : "—") + '</b></div><div class="eg-parts">' +
        ((sc.parts || []).map(function (p) { return '<div><span>' + esc(p.name) + "</span><i style=\"--w:" + p.score + '%"></i><b>' + p.score + "</b><small>" + esc(p.source) + "</small></div>"; }).join("") || '<p class="ob-empty">No checks yet — run the audit (Google PageSpeed, ~30 s).</p>') +
        '</div><div class="ob-row"><button class="ob-btn sm" id="eg-aud">Run audit</button>' + (o.audit ? '<small class="ob-empty">PageSpeed ' + fmtDate(o.audit.at) + (o.audit.lcp ? " · LCP " + esc(o.audit.lcp) : "") + (o.audit.cls ? " · CLS " + esc(o.audit.cls) : "") + "</small>" : "") + "</div>" +
        (o.audit && o.audit.opportunities && o.audit.opportunities.length ? '<ul class="eg-opps">' + o.audit.opportunities.map(function (x) { return "<li>" + esc(x.title) + (x.saving ? " <small>" + esc(x.saving) + "</small>" : "") + "</li>"; }).join("") + "</ul>" : "") + "</div>" +
        '<div class="eg-quick">' + [["Ask Brain", "work"], ["Edit website", "work"], ["Create feature", "work:Create a new feature: "], ["Fix issue", "work:Fix this issue: "], ["Find anything", "find"], ["Changes & deploy", "changes"]].map(function (q) { return '<button class="ob-btn" data-q="' + esc(q[1]) + '">' + esc(q[0]) + "</button>"; }).join("") + "</div>" +
        (src.length ? '<div class="ob-card"><h2>Data sources (24 h)</h2><div class="eg-src">' + src.map(function (s) { return "<span>" + badge(s.status === "healthy" ? "ok" : s.status === "down" ? "error" : s.configured ? "important" : "info") + " " + esc(s.name) + " <small>" + esc(s.status) + "</small></span>"; }).join("") + "</div></div>" : "");
      document.getElementById("eg-aud").onclick = function () { var b = this; b.disabled = true; b.textContent = "Running PageSpeed…"; api("eng/audit", "POST", {}).then(function (r) { if (!r.ok) { b.disabled = false; b.textContent = "Run audit"; alert(r.reason); return; } center(); }); };
      body().querySelectorAll("[data-q]").forEach(function (b) { b.onclick = function () { var q = b.dataset.q.split(":"); TAB = q[0]; VIEWS.engineer(); if (q[1]) { var ta = document.getElementById("eg-req"); if (ta) { ta.value = q.slice(1).join(":"); ta.focus(); } } }; });
    });
  }

  /* ---------- workspace: request → plan → build → diff → preview ---------- */
  function work() {
    body().innerHTML = '<form class="ob-card eg-ask" id="eg-f"><label for="eg-req"><b>What do you want to change?</b></label><textarea id="eg-req" rows="3" placeholder="Make the homepage hero more premium and conversion focused · Add an AI Marketing service page · Add a revenue section to admin · Fix the mobile menu"></textarea>' +
      '<div class="eg-chips">' + ["Make the homepage more premium", "Create a landing page for dentists in Delhi", "Add a new service: AI Marketing", "Improve homepage conversion", "Optimize FODO SEO", "Fix mobile layout issues on the services page"].map(function (x) { return '<button type="button" class="eg-chip">' + esc(x) + "</button>"; }).join("") + "</div>" +
      '<div class="ob-row"><button class="ob-btn pri" type="submit">Make a plan</button><button class="ob-btn" type="button" id="eg-insp">Inspect a page</button><button class="ob-btn" type="button" id="eg-opr">Operate a website</button><button class="ob-btn" type="button" id="eg-rep">Change text everywhere</button></div></form><div id="eg-out"></div>';
    var out = document.getElementById("eg-out");
    body().querySelectorAll(".eg-chip").forEach(function (c) { c.onclick = function () { document.getElementById("eg-req").value = c.textContent; }; });
    document.getElementById("eg-f").onsubmit = function (e) { e.preventDefault(); var v = document.getElementById("eg-req").value.trim(); if (!v) return; out.innerHTML = '<div class="ob-card"><p class="ob-empty">Reading FODO\'s code and making a plan… (20–60 s)</p></div>';
      api("eng/plan", "POST", { request: v }).then(function (p) { if (!p.ok) return err(out, p); planCard(out, p); }); };
    document.getElementById("eg-insp").onclick = function () { var p = prompt("Which page? (e.g. / or /services/)", "/"); if (!p) return; api("eng/inspect", "POST", { path: p }).then(function (r) { if (!r.ok) return err(out, r); out.innerHTML = '<div class="ob-card"><p>' + esc(r.note) + '</p><button class="ob-btn sm" id="eg-goc">Open in Changes</button></div>'; document.getElementById("eg-goc").onclick = function () { TAB = "changes"; VIEWS.engineer(); }; }); };
    document.getElementById("eg-opr").onclick = function () {
      out.innerHTML = '<form class="ob-card" id="eg-of"><h2>Web Operator</h2><p class="ob-empty">FODO Brain opens the website in a real browser, clicks, types and checks the result — then shows EXPECTED vs ACTUAL with screenshots. Works on FODO and FODO-built websites.</p><input class="ob-in" name="url" value="https://www.fodo.co.in/" required><textarea class="ob-in" name="goal" rows="3" style="margin-top:8px" placeholder="Test whether a new user can start a Business X-Ray for example.com and see the report" required></textarea><div class="ob-row" style="margin-top:10px"><button class="ob-btn pri" type="submit">Run it</button></div></form><div id="eg-oout"></div>';
      document.getElementById("eg-of").onsubmit = function (e) { e.preventDefault(); var f = new FormData(this), oo = document.getElementById("eg-oout"); oo.innerHTML = '<p class="ob-empty">Planning the browser steps…</p>';
        api("eng/operate", "POST", { url: f.get("url"), goal: f.get("goal") }).then(function (r) { if (!r.ok) return err(oo, r); oo.innerHTML = '<div class="ob-card"><p>' + esc(r.note) + "</p><ol>" + r.steps.map(function (x) { return "<li><b>" + esc(x.do) + "</b> " + esc(x.say || x.target || x.value) + "</li>"; }).join("") + '</ol><button class="ob-btn sm" id="eg-goo">Open in Changes</button></div>'; document.getElementById("eg-goo").onclick = function () { TAB = "changes"; VIEWS.engineer(); }; }); };
    };
    document.getElementById("eg-rep").onclick = function () {
      out.innerHTML = '<form class="ob-card" id="eg-rf"><h2>Change text everywhere</h2><p class="ob-empty">Finds the exact text in every page, the page generator, JS and CSS. You see the count and the diff before anything happens.</p><div class="ob-grid g2"><input class="ob-in" name="find" placeholder="Current text (exact)" required><input class="ob-in" name="replace" placeholder="New text"></div><input class="ob-in" name="phrase" placeholder="Only for core files: ' + PHRASE + '" style="margin-top:8px"><div class="ob-row" style="margin-top:10px"><button class="ob-btn pri" type="submit">Find &amp; prepare</button></div></form><div id="eg-rout"></div>';
      document.getElementById("eg-rf").onsubmit = function (e) { e.preventDefault(); var f = new FormData(this), ro = document.getElementById("eg-rout"); ro.innerHTML = '<p class="ob-empty">Searching the repository…</p>';
        api("eng/replace", "POST", { find: f.get("find"), replace: f.get("replace"), phrase: f.get("phrase") }).then(function (r) { if (!r.ok) return err(ro, r); if (!r.changeId) { ro.innerHTML = '<p class="ob-empty">' + esc(r.note || "Nothing found.") + "</p>"; return; }
          ro.innerHTML = '<div class="ob-card"><h2>Found ' + r.found + " location(s) in " + r.files + ' file(s)</h2><p class="ob-empty">' + r.kinds.pages + " pages · " + r.kinds.generator + " generator · " + r.kinds.frontend + " JS/CSS · " + r.kinds.backend + " backend" + (r.skipped.length ? " · skipped (protected): " + esc(r.skipped.join(", ")) : "") + (r.more ? " · " + r.more + " more file(s) — run again after this one" : "") + "</p>" + diffHtml(r.diff) + '<div class="ob-row"><button class="ob-btn pri" id="eg-ro">Open preview</button></div><div id="eg-rbox"></div></div>';
          document.getElementById("eg-ro").onclick = function () { this.disabled = true; act("changes/" + r.changeId + "/open", document.getElementById("eg-rbox"), function () { TAB = "changes"; VIEWS.engineer(); }); }; }); };
    };
  }
  function planCard(out, p) {
    var files = (p.files || []).map(function (f) { return "<li><code>" + esc(f.path) + "</code> " + (KLASS[f.cls] || "") + '<small class="ob-empty">' + esc(f.action) + " · " + esc(f.why) + "</small></li>"; }).join("");
    out.innerHTML = '<div class="ob-card eg-plan"><p class="eyebrow">CHANGE PLAN</p><h2>' + esc(p.title) + "</h2><p>" + esc(p.understanding) + "</p>" +
      (p.blocked ? '<p class="eg-err">' + esc(p.blocked) + "</p>" : "") +
      '<div class="eg-pgrid"><div><b>Files affected (' + (p.files || []).length + ")</b><ul>" + files + "</ul></div><div><b>Components</b><p>" + esc((p.components || []).join(", ") || "—") + "</p><b>Backend</b><p>" + esc(p.backend) + "</p><b>Database</b><p>" + esc(p.database) + "</p><b>SEO</b><p>" + esc(p.seo) + "</p><b>Risk</b><p>" + esc(p.risk) + (p.klass === "guarded" ? " · touches FODO's core (Brain, login or payments)" : "") + "</p><b>Rollback</b><p>" + esc(p.rollback) + "</p></div></div>" +
      ((p.deps || []).length ? '<div class="eg-warn">' + p.deps.map(function (d) { return "<p><code>" + esc(d.path) + "</code> is used by <b>" + d.usedBy + " pages</b> (" + esc(d.pages.slice(0, 6).join(", ")) + (d.usedBy > 6 ? "…" : "") + ")</p>"; }).join("") + "</div>" : "") +
      (p.tooBig && (p.steps || []).length ? '<div class="eg-steps"><b>This is big — I\'ll do it in steps (each its own preview):</b><ol>' + p.steps.map(function (s) { return "<li>" + esc(s.title) + "</li>"; }).join("") + "</ol><p class=\"ob-empty\">This plan covers the files above; ask for the next step after it's live.</p></div>" : "") +
      (p.klass === "guarded" ? '<label class="eg-ph">Type <b>' + PHRASE + '</b> to allow a core change<input class="ob-in" id="eg-phr" autocomplete="off"></label>' : "") +
      '<p class="ob-empty">Planned by ' + esc(p.model || "AI") + '</p><div class="ob-row"><button class="ob-btn" id="eg-pc">Cancel</button>' + (p.blocked ? "" : '<button class="ob-btn pri" id="eg-pb">Build preview</button>') + '</div><div id="eg-bout"></div></div>';
    document.getElementById("eg-pc").onclick = function () { api("changes/" + p.changeId + "/discard", "POST", {}).then(function () { out.innerHTML = '<p class="ob-empty">Plan discarded.</p>'; }); };
    var pb = document.getElementById("eg-pb"); if (pb) pb.onclick = function () { buildInto(p.changeId, document.getElementById("eg-bout"), pb); };
  }
  function buildInto(id, box, btn, feedback) {
    if (btn) btn.disabled = true; box.innerHTML = '<p class="ob-empty">Writing the code and checking it applies cleanly… (30–90 s)</p>';
    var ph = document.getElementById("eg-phr");
    api("eng/build/" + id, "POST", { phrase: ph ? ph.value : "", feedback: feedback || "" }).then(function (r) { if (btn) btn.disabled = false; if (!r.ok) return err(box, r);
      var sec = r.security || {};
      box.innerHTML = '<h3>Diff — ' + (r.files || []).length + ' file(s)</h3>' + diffHtml(r.diff) +
        ((sec.warn || []).length ? '<div class="eg-warn"><b>Security notes</b>' + sec.warn.map(function (w) { return "<p>" + esc(w) + "</p>"; }).join("") + "</div>" : '<p class="eg-ok">Security check: no secrets, no destructive SQL, no unsafe patterns found.</p>') +
        ((r.skipped || []).length ? '<p class="ob-empty">Skipped: ' + esc(r.skipped.join("; ")) + "</p>" : "") +
        '<p class="ob-empty">Screens tested after you open the preview: ' + esc((r.routes || []).join(", ")) + ' at 320–1440px.</p><div class="ob-row"><button class="ob-btn pri" id="eg-op">Open preview (pull request)</button><button class="ob-btn" id="eg-fb">Change something</button></div><div id="eg-obox"></div>';
      document.getElementById("eg-op").onclick = function () { this.disabled = true; act("changes/" + id + "/open", document.getElementById("eg-obox"), function () { TAB = "changes"; VIEWS.engineer(); }); };
      document.getElementById("eg-fb").onclick = function () { var f = prompt("What should be different?"); if (f) buildInto(id, box, null, f); };
    });
  }

  /* ---------- changes: QA, screenshots, deploy, repair, rollback ---------- */
  function changes(openId) {
    load().then(function (o) {
      var L = (o.changes || []);
      body().innerHTML = '<div class="eg-split"><div class="ob-card eg-list">' + (L.length ? L.map(function (c) { return '<button class="eg-row" data-id="' + esc(c.id) + '"><b>' + esc(c.title) + "</b>" + (KLASS[c.klass] || "") + "<small>" + esc(stat(c.status)) + " · " + fmtDate(c.updated_at) + "</small>" + qaBadge(c.qa_status) + "</button>"; }).join("") : '<p class="ob-empty">No changes yet — start in Workspace.</p>') + '</div><div id="eg-det" class="eg-det"></div></div>';
      body().querySelectorAll(".eg-row").forEach(function (b) { b.onclick = function () { detail(b.dataset.id); }; });
      var first = openId || (L[0] && L[0].id); if (first) detail(first);
    });
  }
  function detail(id) {
    clearTimeout(POLL); var box = document.getElementById("eg-det"); if (!box) return;
    api("eng/change/" + id).then(function (r) { if (!r.ok) return err(box, r); var c = r.change, P = c.plan || {}, Q = c.qa;
      var shots = Q && Q.shots || [], after = shots.filter(function (s) { return s.kind === "after"; }), before = shots.filter(function (s) { return s.kind === "before"; });
      box.innerHTML = '<div class="ob-card"><p class="eyebrow">' + esc((c.kind || "change").toUpperCase()) + " · " + esc(stat(c.status)) + "</p><h2>" + esc(c.title) + (KLASS[c.klass] || "") + "</h2><p>" + esc(c.summary || c.request) + "</p>" +
        (c.note ? '<p class="ob-empty">' + esc(c.note) + "</p>" : "") +
        '<div class="ob-row">' + (c.preview_url ? '<a class="ob-btn sm" href="' + esc(c.preview_url) + '" target="_blank" rel="noopener">Open preview ↗</a>' : "") + (c.pr_url ? '<a class="ob-btn sm" href="' + esc(c.pr_url) + '" target="_blank" rel="noopener">Pull request ↗</a>' : "") + (Q && Q.run ? '<a class="ob-btn sm" href="' + esc(Q.run) + '" target="_blank" rel="noopener">QA run ↗</a>' : "") + "</div>" +
        (c.status === "pr_open" || c.kind === "inspect" ? '<div class="eg-qabox"><h3>QA ' + qaBadge(c.qa_status) + (c.attempts ? ' <small class="ob-empty">automatic repairs: ' + c.attempts + "/3</small>" : "") + "</h3>" +
          (Q ? '<ul class="eg-checks">' + (Q.checks || []).map(function (x) { return '<li class="' + (x.ok ? "ok" : "no") + '">' + (x.ok ? "✓" : "✗") + " " + esc(x.name) + (x.detail ? " <small>" + esc(x.detail) + "</small>" : "") + "</li>"; }).join("") + "</ul>" + ((Q.issues || []).length ? '<details><summary>' + Q.issues.length + " accessibility / SEO notes</summary><ul>" + Q.issues.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul></details>" : "") : '<p class="ob-empty">Waiting for GitHub Actions — it waits for the Cloudflare preview, then opens it at 8 screen sizes (3–6 min). This page refreshes by itself.</p>') + "</div>" : "") +
        (after.length ? '<div class="eg-shots">' + after.map(function (s) { var b = before.filter(function (x) { return x.bp === s.bp; })[0]; return '<figure><figcaption>' + s.bp + "px · " + esc(s.route) + "</figcaption>" + (b ? '<div class="eg-ba"><a href="' + B.API + "eng/shot/" + b.id + '" target="_blank"><img alt="Before at ' + s.bp + 'px" loading="lazy" src="' + B.API + "eng/shot/" + b.id + '"><span>before</span></a>' : "") + '<a href="' + B.API + "eng/shot/" + s.id + '" target="_blank"><img alt="After at ' + s.bp + 'px" loading="lazy" src="' + B.API + "eng/shot/" + s.id + '"><span>' + (c.kind === "inspect" ? "now" : "after") + "</span></a>" + (b ? "</div>" : "") + "</figure>"; }).join("") + "</div>" : "") +
        (P.diff ? '<details' + (c.status === "proposed" ? " open" : "") + '><summary>Diff</summary>' + diffHtml(P.diff) + "</details>" : "") +
        '<div class="ob-row eg-acts">' +
          (c.status === "planned" ? '<button class="ob-btn pri" data-a="build">Build preview</button>' : "") +
          (c.status === "proposed" ? '<button class="ob-btn pri" data-a="open">Open preview</button>' : "") +
          (c.status === "pr_open" ? '<button class="ob-btn pri" data-a="merge"' + (c.qa_status === "failed" || (c.klass === "guarded" && c.qa_status !== "passed") ? " disabled title=\"QA must pass first\"" : "") + '>Deploy to production</button>' + (c.qa_status === "failed" ? '<button class="ob-btn" data-a="repair">Repair now</button>' : "") : "") +
          (c.status === "merged" && c.kind !== "rollback" ? '<button class="ob-btn" data-a="rollback">Rollback</button>' : "") +
          (c.kind === "inspect" && c.status === "inspected" ? '<button class="ob-btn pri" data-a="fix">Fix these issues</button>' : "") +
          (["planned", "proposed", "pr_open"].indexOf(c.status) > -1 ? '<button class="ob-btn" data-a="discard">Discard</button>' : "") +
        '</div><div id="eg-abox"></div><p class="ob-empty">' + esc(c.id) + " · created " + fmtDate(c.created_at) + (c.approved_by ? " · approved by " + esc(c.approved_by) : "") + "</p></div>";
      var ab = document.getElementById("eg-abox"), again = function () { changes(id); };
      box.querySelectorAll("[data-a]").forEach(function (b) { b.onclick = function () { var a = b.dataset.a; b.disabled = true;
        if (a === "build") { TAB = "work"; VIEWS.engineer(); setTimeout(function () { var o = document.getElementById("eg-out"); o.innerHTML = '<div class="ob-card" id="eg-bb"></div>'; buildInto(id, document.getElementById("eg-bb")); }, 50); return; }
        if (a === "open" || a === "merge" || a === "discard") return act("changes/" + id + "/" + a, ab, again);
        if (a === "repair") return api("eng/repair/" + id, "POST", {}).then(function (r) { if (!r.ok) return err(ab, r); ab.innerHTML = "<p>" + (r.fixed ? "Fix committed — QA runs again on the new commit." : "No clean fix found — describe what's wrong in Workspace.") + "</p>"; setTimeout(again, 1500); });
        if (a === "rollback") return act("eng/rollback/" + id, ab, again);
        if (a === "fix") { TAB = "work"; VIEWS.engineer(); setTimeout(function () { var ta = document.getElementById("eg-req"); ta.value = "Fix these issues found on " + ((P.routes || ["/"])[0]) + ": " + (Q.checks || []).filter(function (x) { return !x.ok; }).map(function (x) { return x.name + " (" + x.detail + ")"; }).concat(Q.issues || []).join("; ").slice(0, 1500); }, 50); }
      }; });
      if (c.qa_status === "waiting" || c.status === "inspecting") POLL = setTimeout(function () { if (location.hash.indexOf("#engineer") === 0 && TAB === "changes") detail(id); }, 15000);
    });
  }

  /* ---------- every FODO Website Builder website (owner: global, audited) ---------- */
  function sitesView() {
    api("eng/sites").then(function (j) { if (!j.ok) return err(body(), j); var L = j.sites || [];
      body().innerHTML = '<div class="ob-row" style="margin-bottom:12px"><a class="ob-btn pri" href="/website-builder/#new=1" target="_blank" rel="noopener">+ Build a website</a><a class="ob-btn" href="/website-builder/" target="_blank" rel="noopener">Open Website Builder ↗</a></div>' +
        (L.length ? '<div class="ob-card ob-scroll"><table class="ob-table"><thead><tr><th>Website</th><th>Owner</th><th>Status</th><th>Domain</th><th></th></tr></thead><tbody>' + L.map(function (s) { return "<tr><td><b>" + esc(s.name) + "</b><br><small class=\"ob-empty\">" + esc(s.slug) + " · " + fmtDate(s.updated_at) + "</small></td><td><small>" + esc(s.owner_email || "") + "</small></td><td>" + badge(s.status === "live" ? "ok" : "info") + " " + esc(s.status) + "</td><td><small>" + esc(s.domain || "—") + '</small></td><td><a class="ob-btn sm" target="_blank" rel="noopener" href="/website-builder/#site=' + esc(s.id) + '">Edit</a> <button class="ob-btn sm" data-chk="' + esc(s.id) + '">Check</button><div id="ck-' + esc(s.id) + '"></div></td></tr>'; }).join("") + "</tbody></table></div>" : '<p class="ob-empty">No builder websites yet.</p>');
      body().querySelectorAll("[data-chk]").forEach(function (b) { b.onclick = function () { var box = document.getElementById("ck-" + b.dataset.chk); box.innerHTML = '<small class="ob-empty">Checking…</small>'; api("eng/site-check?site=" + b.dataset.chk).then(function (r) { if (!r.ok) return err(box, r); var q = r.quality || {}; box.innerHTML = '<small>' + (r.live ? (r.live.status ? "HTTP " + r.live.status + " · " + r.live.ms + " ms" : "down: " + esc(r.live.error)) : "not published") + " · " + (q.issues || []).filter(function (x) { return x.level === "critical"; }).length + " critical · " + (q.issues || []).length + " notes" + (r.domains || []).map(function (d) { return " · " + esc(d.domain) + " " + esc(d.status); }).join("") + "</small>"; }); }; });
    });
  }
  /* ---------- project map ---------- */
  function mapView() {
    api("eng/map").then(function (j) { var m = j.map; if (!j.ok || !m) return err(body(), j.ok ? { reason: "GitHub is not connected — add GITHUB_TOKEN (Setup)." } : j);
      var tok = m.tokens || {};
      body().innerHTML = (m.light ? '<p class="eg-warn">Quick map from the GitHub file list — the full index (tables, env names, design tokens, components) arrives after the next push to main (FODO Engineer → index).</p>' : '<p class="ob-empty">Indexed commit ' + esc(String(m.sha || "").slice(0, 7)) + " · " + fmtDate(m.indexedAt || m.at) + " · " + m.files + " files</p>") +
        '<div class="ob-row" style="margin-bottom:10px"><button class="ob-btn sm" id="eg-rix">Re-index now</button><span class="ob-empty" id="eg-rixs"></span></div>' +
        '<div class="eg-mgrid"><div class="ob-card ob-scroll"><h2>Pages (' + (m.pages || []).length + ")</h2><table class=\"ob-table\"><tbody>" + (m.pages || []).map(function (p) { return "<tr><td><a href=\"" + esc(p.route) + '" target="_blank">' + esc(p.route) + "</a></td><td><small>" + esc(p.title || "") + "</small></td></tr>"; }).join("") + "</tbody></table></div>" +
        '<div class="ob-card ob-scroll"><h2>APIs (' + (m.apis || []).length + ")</h2><table class=\"ob-table\"><tbody>" + (m.apis || []).map(function (a) { return "<tr><td><code>" + esc(a.route) + "</code></td><td><small>" + esc((a.methods || []).join(" ")) + "</small></td></tr>"; }).join("") + "</tbody></table></div>" +
        '<div class="ob-card ob-scroll"><h2>Database tables (' + (m.tables || []).length + ")</h2><table class=\"ob-table\"><tbody>" + (m.tables || []).map(function (t) { return "<tr><td><code>" + esc(t.name) + "</code><br><small>" + esc((t.columns || []).slice(0, 10).join(", ")) + "</small></td><td><small>" + esc(t.file) + "</small></td></tr>"; }).join("") + "</tbody></table></div>" +
        '<div class="ob-card ob-scroll"><h2>Environment (names only)</h2><div class="eg-env-list">' + (m.env || []).map(function (e) { return '<span class="' + (e.exists ? "y" : "n") + '">' + (e.exists ? "✓" : "✗") + " " + esc(e.name) + "</span>"; }).join("") + "</div></div>" +
        '<div class="ob-card ob-scroll"><h2>Design tokens</h2><div class="eg-tok">' + Object.keys(tok).map(function (k) { var v = tok[k], col = /^(#|rgb|hsl)/.test(v); return "<span>" + (col ? '<i style="background:' + esc(v) + '"></i>' : "") + "<code>" + esc(k) + "</code> <small>" + esc(v) + "</small></span>"; }).join("") + "</div></div>" +
        '<div class="ob-card ob-scroll"><h2>Components (class → pages)</h2><div class="eg-tok">' + Object.keys(m.components || {}).slice(0, 60).map(function (k) { return "<span><code>." + esc(k) + "</code> <small>" + m.components[k] + "</small></span>"; }).join("") + "</div></div></div>";
      document.getElementById("eg-rix").onclick = function () { this.disabled = true; api("eng/reindex", "POST", {}).then(function (r) { document.getElementById("eg-rixs").textContent = r.ok ? r.note : r.reason; }); };
    });
  }
  /* ---------- find anything ---------- */
  function findView() {
    body().innerHTML = '<form class="ob-cmd" id="eg-ff"><input id="eg-fq" placeholder="Where is the WhatsApp CTA? · which file controls the navbar? · where are credits calculated?" autocomplete="off"><button class="ob-btn pri" type="submit">Find</button></form><div id="eg-fo"></div>';
    document.getElementById("eg-ff").onsubmit = function (e) { e.preventDefault(); var q = document.getElementById("eg-fq").value.trim(), o = document.getElementById("eg-fo"); if (!q) return; o.innerHTML = '<p class="ob-empty">Searching…</p>';
      api("eng/find?q=" + encodeURIComponent(q)).then(function (r) { if (!r.ok) return err(o, r); var repo = OV && OV.github && OV.github.repo;
        o.innerHTML = '<div class="ob-card">' + (r.results.length ? r.results.map(function (x) { var href = repo ? "https://github.com/" + repo + "/blob/main/" + x.path + (x.line ? "#L" + x.line : "") : null; return '<div class="eg-hit"><b>' + (href ? '<a href="' + esc(href) + '" target="_blank" rel="noopener">' : "") + esc(x.path) + (x.line ? ":" + x.line : "") + (href ? "</a>" : "") + "</b> <small>" + esc(x.why) + "</small>" + (x.fragment ? "<pre>" + esc(x.fragment) + "</pre>" : "") + "</div>"; }).join("") : '<p class="ob-empty">Nothing found.</p>') + (r.indexed ? "" : '<p class="ob-empty">Tip: results get better once the project index has run.</p>') + "</div>"; }); };
  }
  /* ---------- setup ---------- */
  function setup() {
    load().then(function (o) { var G = o.github || {}, row = function (ok, t, how) { return '<li class="' + (ok ? "ok" : "no") + '">' + (ok ? "✓" : "✗") + " <b>" + t + "</b>" + (ok ? "" : "<small>" + how + "</small>") + "</li>"; };
      body().innerHTML = '<div class="ob-card"><h2>Setup</h2><ul class="eg-checks">' +
        row(G.connected, "GitHub connected", "Cloudflare secret GITHUB_TOKEN — a fine-grained token for this repo only: Contents read/write, Pull requests read/write, Actions read/write.") +
        row(G.connected && G.canPush, "Token can push", "Edit the token on GitHub → give Contents + Pull requests: Read and write.") +
        row(o.previews, "Preview links", "Cloudflare variable PAGES_PROJECT = your Pages project name (fodo-website).") +
        row(o.qaKey, "QA reports", "CRON_KEY in Cloudflare and the same value as FODO_CRON_KEY in GitHub → Settings → Secrets → Actions (already used by the hourly Brain workflow).") +
        row(!!o.index, "Project index", "Push this update to main once — the FODO Engineer workflow indexes the project automatically.") +
        '</ul></div><form class="ob-card" id="eg-sf"><h2>Deployment</h2><label>Auto-deploy<select class="ob-sel" name="autoDeploy"><option value="off">Off — I approve every deployment (recommended)</option><option value="low">Low-risk changes whose QA passed (never core changes)</option></select></label><div class="ob-row" style="margin-top:10px"><button class="ob-btn pri" type="submit">Save</button><span class="ob-empty" id="eg-ss"></span></div></form>';
      api("settings").then(function (s) { var sel = document.querySelector("#eg-sf select"); if (sel && s.settings) sel.value = s.settings.autoDeploy || "off"; });
      document.getElementById("eg-sf").onsubmit = function (e) { e.preventDefault(); api("settings", "POST", { autoDeploy: new FormData(this).get("autoDeploy") }).then(function (r) { document.getElementById("eg-ss").textContent = r.ok ? "Saved." : r.reason; }); };
    });
  }
})();
