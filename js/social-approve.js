/* FODO v52 Social Studio: client approval page (/approve/<token>). Shows the project's drafts and scheduled posts; Approve or
   Request changes (a note is required). The server holds a post with requested changes as a draft so it never goes live. */
(function () {
  "use strict";
  var root = document.getElementById("ap"); if (!root) return; var T = root.getAttribute("data-token"), D = null;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function when(iso, tz) { if (!iso) return "Time not set yet"; try { return new Intl.DateTimeFormat("en-IN", { timeZone: tz, weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch (e) { return iso; } }
  function state(r) { return r ? (r.decision === "approve" ? ["ok", "Approved"] : ["chg", "Changes requested"]) : ["", "Waiting for you"]; }
  function draw() {
    var P = D.project; document.title = P.name + " · content for approval"; document.documentElement.style.setProperty("--c", P.color);
    root.innerHTML = '<header class="ap-h"><div class="ap-dot">' + esc(P.name.charAt(0).toUpperCase()) + "</div><div><h1>" + esc(P.name) + " · content for approval</h1><p>Watch each video, check the caption and press <b>Approve</b> or <b>Request changes</b>. Posts you ask to change are held and will not go live.</p></div></header>" +
      '<div class="ap-name"><label>Your name <input id="ap-nm" maxlength="60" placeholder="Optional"></label></div><div class="ap-grid">' +
      (D.posts.length ? D.posts.map(function (p) { var s = state(p.review), md = p.media ? (/^video\//.test(p.media.mime) ? '<video controls preload="metadata" playsinline src="' + esc(p.media.url) + '"></video>' : '<img alt="" src="' + esc(p.media.url) + '">') : "";
        return '<div class="ap-card" data-id="' + esc(p.id) + '">' + md + '<div class="ap-b"><span class="ap-st ' + s[0] + '">' + s[1] + "</span><h3>" + esc(p.title || "Post") + '</h3><div class="ap-meta">' + esc(when(p.when, P.tz)) + "<br>" + esc(p.platforms.join(" · ")) + "</div><pre>" + (esc(p.caption) || "<i>(no caption)</i>") + "</pre>" +
          (p.review && p.review.note ? '<div class="ap-note">Note: ' + esc(p.review.note) + "</div>" : "") + '<textarea placeholder="What should change? (only needed for Request changes)"></textarea><div class="ap-btns"><button type="button" class="ok" data-d="approve">✓ Approve</button><button type="button" class="chg" data-d="changes">Request changes</button></div></div></div>'; }).join("") : '<div class="ap-empty">Nothing is waiting for approval right now.</div>') + "</div>";
  }
  root.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-d]"); if (!b) return; var card = b.closest(".ap-card"), d = b.getAttribute("data-d"), note = card.querySelector("textarea").value.trim();
    if (d === "changes" && !note) { alert("Please write what should change."); return; }
    b.disabled = true;
    fetch("/api/social/approval/" + T + "/decide", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ post: card.getAttribute("data-id"), decision: d, note: note, name: (document.getElementById("ap-nm") || {}).value || "" }) })
      .then(function (r) { return r.json(); }).then(function (j) { b.disabled = false; if (!j.ok) return alert(j.reason || "That didn't work."); var s = card.querySelector(".ap-st"); s.className = "ap-st " + (d === "approve" ? "ok" : "chg"); s.textContent = d === "approve" ? "Approved, thank you!" : "Changes requested, we will update it"; }, function () { b.disabled = false; alert("You seem to be offline."); });
  });
  fetch("/api/social/approval/" + T + "?open=1", { credentials: "same-origin" }).then(function (r) { return r.json(); }).then(function (j) { if (!j.ok) { root.innerHTML = '<div class="ap-empty"><h1>Link not available</h1><p>' + esc(j.reason) + "</p></div>"; return; } D = j; draw(); }, function () { root.innerHTML = '<div class="ap-empty">You seem to be offline.</div>'; });
})();
