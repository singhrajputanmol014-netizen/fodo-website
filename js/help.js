/* FODO Help Desk v20 — /help/: search the answers, chat with the FODO help assistant, open a ticket, see your tickets,
   read & reply to a ticket from its email link (?ticket=T…&k=…). Everything goes to /api/help/* and shows in /admin/. */
(function () {
  "use strict";
  if (!document.getElementById("hp-cf")) return;
  var A = window.FODO_ACCOUNT, U = window.FODO_UTIL || {}, ROOT = U.root || (document.querySelector('meta[name="fodo-root"]') || {}).content || "/";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var api = function (path, body) {
    return fetch(ROOT + "api/help/" + path, { method: body ? "POST" : "GET", credentials: "same-origin", headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return { ok: false, reason: "The help desk did not answer (" + r.status + ")." }; }).then(function (j) { j._status = r.status; return j; }); }, function () { return { ok: false, reason: "No connection — check your internet." }; });
  };
  var say = function (id, t, k) { var el = $(id); if (el) { el.textContent = t || ""; el.className = "cf-status" + (k ? " " + k : ""); } };
  var me = null, chatId = null; try { chatId = sessionStorage.getItem("fodo-help-chat"); } catch (e) {}
  var track = function (n, p) { try { if (window.FODO_TRACK) window.FODO_TRACK(n, p || {}); } catch (e) {} };

  /* ---------- search the answers ---------- */
  $("hp-q").addEventListener("input", function () {
    var v = this.value.trim().toLowerCase(), words = v.split(/\s+/).filter(Boolean), any = false;
    document.querySelectorAll(".hp-a").forEach(function (a) { var t = a.textContent.toLowerCase(), hit = !words.length || words.every(function (w) { return t.indexOf(w) > -1; }); a.hidden = !hit; if (hit) any = true; });
    document.querySelectorAll(".hp-cat").forEach(function (c) { c.hidden = ![].some.call(c.querySelectorAll(".hp-a"), function (a) { return !a.hidden; }); });
    $("hp-none").hidden = any || !words.length;
  });
  fetch(ROOT + "api/help/kb").then(function (r) { return r.json(); }).then(function (k) { if (k && k.support) { $("hp-sup").textContent = k.support; $("hp-sup").href = "mailto:" + k.support; } }, function () {});

  /* ---------- the assistant ---------- */
  var log = $("hp-log");
  var bubble = function (who, text, cls) { var d = document.createElement("div"); d.className = "hp-m " + cls; d.innerHTML = "<b>" + esc(who) + "</b><p>" + esc(text).replace(/\n/g, "<br>") + "</p>"; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; };
  $("hp-cf").addEventListener("submit", function (e) {
    e.preventDefault(); var v = $("hp-in").value.trim(); if (!v) return;
    $("hp-in").value = ""; bubble("You", v, "u"); var wait = bubble("FODO Help", "…", "a wait");
    track("help_chat", {});
    api("chat", { chatId: chatId, message: v }).then(function (j) {
      wait.remove();
      if (!j.ok) { bubble("FODO Help", j.reason || "Sorry, something went wrong.", "a warn"); return; }
      chatId = j.chatId; try { sessionStorage.setItem("fodo-help-chat", chatId); } catch (x) {}
      var b = bubble("FODO Help", j.reply, "a");
      if (j.suggestTicket) { $("hp-human").classList.add("on"); b.insertAdjacentHTML("beforeend", '<button type="button" class="btn sm hp-esc2">Talk to a person</button>'); b.querySelector(".hp-esc2").onclick = escalate; }
      b.insertAdjacentHTML("beforeend", '<span class="hp-rate"><button type="button" data-r="1" aria-label="Helpful">👍</button><button type="button" data-r="-1" aria-label="Not helpful">👎</button></span>');
    });
  });
  log.addEventListener("click", function (e) { var r = e.target.closest("[data-r]"); if (!r || !chatId) return; api("chat/rate", { chatId: chatId, rating: +r.dataset.r }); r.parentNode.innerHTML = '<small class="muted">Thanks for the feedback.</small>'; });
  function escalate() {
    if (!chatId) { location.hash = "hp-ticket"; $("hp-msg").focus(); return; }
    var box = $("hp-escb"), go = function (email, name) {
      box.innerHTML = '<small class="muted">Sending…</small>';
      api("chat/escalate", { chatId: chatId, email: email, name: name }).then(function (j) {
        if (j.needEmail) return ask();
        box.innerHTML = j.ok ? '<b>Ticket ' + esc(j.ticket) + "</b> — a person will reply by email" + (j.link ? ' · <a href="' + esc(j.link) + '">open it</a>' : "") + "." : '<small class="warn">' + esc(j.reason) + "</small>";
        if (j.ok) { track("help_escalate", {}); myTickets(); }
      });
    }, ask = function () {
      box.innerHTML = '<span class="hp-escf"><input id="hp-ee" type="email" placeholder="your@email.com" aria-label="Your email"><button type="button" class="btn sm" id="hp-eeg">Send</button></span>';
      $("hp-eeg").onclick = function () { var v = $("hp-ee").value.trim(); if (v) go(v, ""); };
    };
    if (me && me.email) go(me.email, me.name); else ask();
  }
  $("hp-esc").onclick = escalate;

  /* ---------- ticket form ---------- */
  $("hp-tf").addEventListener("submit", function (e) {
    e.preventDefault();
    var b = { name: $("hp-name").value.trim(), email: $("hp-email").value.trim(), category: $("hp-cat").value, subject: $("hp-subj").value.trim(), message: $("hp-msg").value.trim(), website: $("hp-web").value };
    if (!b.email && !(me && me.email)) return say("hp-tst", "Enter your email so FODO can reply.", "warn");
    if (b.message.length < 10) return say("hp-tst", "Describe the problem in a sentence or two.", "warn");
    say("hp-tst", "Sending…", "busy");
    api("ticket", b).then(function (j) {
      if (!j.ok) return say("hp-tst", j.reason || "Could not send.", "warn");
      say("hp-tst", "Thanks — this is ticket " + j.ticket + ". " + (j.mailed ? "We emailed you a copy." : "") + " A person will reply by email, usually within one working day.", "ok");
      $("hp-msg").value = ""; $("hp-subj").value = ""; track("help_ticket", {}); myTickets();
    });
  });

  /* ---------- your tickets + one ticket's thread ---------- */
  var ST = { open: "Open", pending: "Waiting for you", solved: "Solved", closed: "Closed" };
  function myTickets() {
    if (!me) return;
    api("tickets").then(function (j) {
      var L = j.items || []; $("hp-myl").innerHTML = L.length ? "<ul class=\"hp-tl\">" + L.map(function (t) { return '<li><a href="?ticket=' + esc(t.id) + '#hp-thread"><b>' + esc(t.id) + "</b> " + esc(t.subject) + '</a> <span class="xr-st ' + (t.status === "solved" || t.status === "closed" ? "pass" : t.status === "pending" ? "warn" : "na") + '">' + esc(ST[t.status] || t.status) + "</span>" + (t.last_from === "fodo" && t.status === "pending" ? ' <small class="muted">FODO replied</small>' : "") + "</li>"; }).join("") + "</ul>" : '<p class="muted">No tickets yet.</p>';
    });
  }
  var qs = new URLSearchParams(location.search), tk = qs.get("ticket"), key = qs.get("k");
  function openTicket(id) {
    var box = $("hp-thread"); box.hidden = false; box.innerHTML = '<p class="muted">Loading ticket…</p>';
    api("ticket/" + encodeURIComponent(id) + (key ? "?k=" + encodeURIComponent(key) : "")).then(function (j) {
      if (!j.ok) { box.innerHTML = '<p class="warn">' + esc(j.reason || "Ticket not found.") + " Log in with the email you used, or open the link from your ticket email.</p>"; return; }
      var t = j.ticket;
      box.innerHTML = '<div class="hp-th"><span class="tag">' + esc(t.id) + '</span><h3>' + esc(t.subject) + '</h3><span class="xr-st ' + (t.status === "solved" ? "pass" : t.status === "pending" ? "warn" : "na") + '">' + esc(ST[t.status] || t.status) + "</span></div>" +
        '<ol class="hp-msgs">' + j.messages.map(function (m) { return '<li class="' + (m.dir === "out" ? "fodo" : "you") + '"><b>' + (m.dir === "out" ? "FODO" : "You") + '</b> <small class="muted">' + esc(new Date(m.at).toLocaleString("en-IN")) + (m.source === "email" ? " · by email" : "") + "</small><p>" + esc(m.text).replace(/\n/g, "<br>") + "</p></li>"; }).join("") + "</ol>" +
        '<form id="hp-rf" class="hp-rf"><label for="hp-rt">Reply</label><textarea id="hp-rt" rows="3" maxlength="8000"></textarea><div class="btn-row"><button class="btn sm" type="submit">Send reply</button>' + (t.status !== "solved" ? '<button class="btn sm ghost" type="button" id="hp-solve">Mark as solved</button>' : "") + '</div><p class="cf-status" id="hp-rst" role="status"></p></form>';
      $("hp-rf").onsubmit = function (e) { e.preventDefault(); var v = $("hp-rt").value.trim(); if (!v) return; say("hp-rst", "Sending…", "busy"); api("ticket/" + encodeURIComponent(t.id) + "/reply", { text: v, k: key }).then(function (r) { if (!r.ok) return say("hp-rst", r.reason, "warn"); openTicket(t.id); }); };
      if ($("hp-solve")) $("hp-solve").onclick = function () { api("ticket/" + encodeURIComponent(t.id) + "/solve", { k: key }).then(function () { openTicket(t.id); myTickets(); }); };
      box.scrollIntoView({ block: "start" });
    });
  }
  if (tk) openTicket(tk);
  if (A) A.config().then(function (c) { if (!c.enabled) return; A.onChange(function (u) { me = u; if (u) { if (u.email) { $("hp-email").value = u.email; } if (u.name && !$("hp-name").value) $("hp-name").value = u.name; myTickets(); } }); });
})();
