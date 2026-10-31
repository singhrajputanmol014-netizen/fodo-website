/* FODO Growth Lab v18 — a standalone PRO tool page (/growth-lab/<tool>/).
   Shows the live price and what this account already has (owner · bought runs · included in the plan), then:
     login → POST /api/lab/tool/start → reuse a recent X-Ray (opens the tool report at once)
                                      → or a fresh scan (opens the Business X-Ray engine in tool mode)
                                      → or 402: buy one run (Cashfree) → back here → verified on the server → continues.
   Nothing here unlocks anything: the server checks login, entitlement and payment for every run. */
(function () {
  "use strict";
  var f = document.getElementById("tl-form"); if (!f) return;
  var A = window.FODO_ACCOUNT, U = window.FODO_UTIL || {}, ROOT = U.root || (document.querySelector('meta[name="fodo-root"]') || {}).content || "/";
  var id = f.dataset.tool, $ = function (x) { return document.getElementById(x); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var inr = function (n) { return "₹" + Math.round(+n || 0).toLocaleString("en-IN"); };
  var say = function (t, k) { var el = $("tl-st"); el.textContent = t || ""; el.className = "cf-status" + (k ? " " + k : ""); };
  var KEY = "fodo-tool:" + id, tool = null, busy = false;
  var lab = function (path, body) {
    return fetch(ROOT + "api/lab/" + path, { method: body ? "POST" : "GET", credentials: "same-origin", headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return { ok: false, reason: "The Growth Lab service did not answer (" + r.status + ")." }; }).then(function (j) { j._status = r.status; return j; }); }, function () { return { ok: false, reason: "No connection. Check your internet and try again.", _status: 0 }; });
  };
  var track = function (stage, d) { try { if (window.FODO_TOOL) window.FODO_TOOL(stage, id, d || ""); } catch (e) {} };

  // live price + which plans include the tool (static text works without JavaScript)
  fetch(ROOT + "api/lab/catalog").then(function (r) { return r.ok ? r.json() : null; }).then(function (c) {
    tool = c && c.ok ? (c.tools || []).filter(function (t) { return t.id === id; })[0] : null; if (!tool) return;
    $("tl-price").innerHTML = "<b>" + inr(tool.price) + "</b> a run" + (tool.includedIn && tool.includedIn.length ? " · or included in the X-Rays of the " + esc(tool.includedIn.join(", ")) + " plan" + (tool.includedIn.length > 1 ? "s" : "") : "");
    if (tool.on === false) { $("tl-go").disabled = true; say(tool.name + " is being updated right now — back shortly.", "warn"); }
  }, function () {});
  // what this account has
  function mine() {
    var box = $("tl-me"); if (!A || !A.current || !A.current()) { box.innerHTML = "Log in (free) to see whether your plan already includes it."; return; }
    lab("tools/me").then(function (j) {
      if (!j.ok) { box.textContent = ""; return; }
      var t = j.tools[id] || {};
      box.innerHTML = t.free ? "<b>Owner access</b> — free." : t.credits ? "<b>You have " + t.credits + " run" + (t.credits === 1 ? "" : "s") + "</b> of this tool." : t.included ? "<b>Included in your plan</b> — reuses your recent X-Ray of the site, or uses one of your X-Rays (" + esc(j.xrays) + " left)." : "Not included in your current plan — buy one run, or see plans.";
    });
  }
  if (A) A.config().then(function (c) { if (c.enabled) A.onChange(mine); else $("tl-me").textContent = "Accounts open soon."; });

  function go(url) {
    if (busy) return; busy = true; $("tl-go").disabled = true; say("Checking your account…", "busy"); track("start", url);
    var start = function (again) { return lab("tool/start", { tool: id, url: url }).then(function (j) {
      if (j._status === 401 && A && !again) { say("Log in to run it — it's free.", "busy"); track("login_required"); return A.login("Log in to run " + (tool ? tool.name : "this tool") + ".").then(function () { return start(true); }); }
      return j; }); };
    start(false).then(function (j) {
      busy = false; $("tl-go").disabled = false;
      if (j.ok && j.reused) { try { sessionStorage.removeItem(KEY); } catch (e) {} say("Using your X-Ray of this website from " + new Date(j.from).toLocaleDateString("en-IN") + " — opening the report…", "ok"); location.href = ROOT + "business-x-ray/?r=" + encodeURIComponent(j.jobId) + "&tool=" + encodeURIComponent(id); return; }
      if (j.ok && j.needScan) { try { sessionStorage.removeItem(KEY); } catch (e) {} say("Starting the research…", "ok"); location.href = ROOT + "business-x-ray/?tool=" + encodeURIComponent(id) + "&run=" + encodeURIComponent(j.runId) + "&u=" + encodeURIComponent(url); return; }
      if (j._status === 402 && j.buy) return offer(j, url);
      say(j.reason || "Could not start.", "warn");
    }, function (e) { busy = false; $("tl-go").disabled = false; say(e && e.cancelled ? "" : (e && e.message) || "Could not start.", e && e.cancelled ? "" : "warn"); });
  }
  function offer(j, url) {
    say("", ""); var box = $("tl-me");
    box.innerHTML = '<div class="tl-buy"><p><b>' + esc(j.reason) + '</b></p><div class="btn-row"><button class="btn" type="button" id="tl-buy">Buy one run · ' + inr(j.price) + '</button><a class="btn ghost" href="' + ROOT + 'plans/">See plans</a></div></div>';
    $("tl-buy").onclick = function () {
      try { sessionStorage.setItem(KEY, JSON.stringify({ url: url, t: Date.now() })); } catch (e) {}
      try { if (window.FODO_TRACK) window.FODO_TRACK("upgrade_click", { tool: id, kind: "tool" }); } catch (e) {}
      say("Opening the payment page…", "busy");
      A.checkout("tool", id).catch(function (e) { if (e && e.cancelled) return say("", ""); say((e && e.message) || "Could not start the payment.", "warn"); });
    };
  }
  f.addEventListener("submit", function (e) {
    e.preventDefault(); var v = $("tl-url").value.trim();
    if (!v) { say("Enter your website address.", "warn"); $("tl-url").focus(); return; }
    go(v);
  });
  // back from Cashfree: verify on the server, then carry on with the website typed before paying
  var qs = new URLSearchParams(location.search), oid = qs.get("order_id");
  if (oid && A) {
    say("Checking your payment…", "busy");
    A.config().then(function () { return A.me(); }).then(function () { return A.api("verify", { order_id: oid }); }).then(function (j) {
      try { history.replaceState(null, "", location.pathname); } catch (e) {}
      if (!j.paid) return say(j.reason || "The payment is not complete yet (" + (j.status || "pending") + "). If money was taken, it is confirmed automatically within a few minutes.", "warn");
      var p = null; try { p = JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch (e) {}
      say("Payment received — thank you.", "ok"); mine();
      if (p && p.url) { $("tl-url").value = p.url; go(p.url); }
    });
  }
})();
