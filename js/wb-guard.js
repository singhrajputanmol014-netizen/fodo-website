/* FODO Website Builder, load guard (classic script). If the builder module can't start (a file missing on the server, an old
   cached file, a blocked script), show the REAL reason with a retry button instead of "Loading…" forever. */
(function () {
  var errs = [];
  addEventListener("error", function (e) { var t = e.target; errs.push(t && t.src ? "Couldn't load " + t.src.replace(location.origin, "") : (e.message || "error") + (e.filename ? " (" + e.filename.replace(location.origin, "").split("?")[0] + ")" : "")); }, true);
  addEventListener("unhandledrejection", function (e) { errs.push(String((e.reason && e.reason.message) || e.reason)); });
  var MODS = ["/sites/lib/render.js", "/sites/lib/templates.js", "/sites/lib/shop.js", "/js/website-store.js", "/js/website-builder.js"];
  var waited = 0;
  setTimeout(function check() {
    var w = document.getElementById("wb"); if (!w || !/Loading FODO Website Builder/.test(w.textContent)) return;
    // v40.2: a slow phone connection is not an error, keep waiting (up to ~25 s) while nothing has failed
    if (!errs.length && waited < 2) { waited++; var p = w.querySelector(".wb-boot p"); if (p) p.textContent = "Still loading, slow connection…"; return setTimeout(check, 8000); }
    var checks = MODS.map(function (m) { return fetch(m, { cache: "no-store" }).then(function (r) { return r.ok ? null : m + " → HTTP " + r.status; }, function () { return m + " → network error"; }); });
    Promise.all(checks).then(function (bad) {
      bad = bad.filter(Boolean); var why = bad.length ? "These files are missing on the server: " + bad.join(", ") + ", upload/deploy the latest version." : errs.length ? errs.slice(-3).join(" · ") : "The builder script did not start.";
      w.innerHTML = '<div class="wb-pad"><h2>The Website Builder didn\'t start</h2><p class="wb-muted" style="word-break:break-word">' + why.replace(/[<>&]/g, "") + '</p><p><button class="wb-btn pri" id="wb-retry">Reload (fresh)</button></p><p class="wb-muted">If it keeps happening: press Ctrl + Shift + R, or send this message to FODO.</p></div>';
      document.getElementById("wb-retry").onclick = function () { location.href = location.pathname + "?fresh=" + Date.now() + location.hash; };
    });
  }, 9000);
})();
