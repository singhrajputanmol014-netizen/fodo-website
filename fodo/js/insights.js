/* FODO first-party analytics beacon (v16) — page views, where visitors came from, key clicks, time on page.
   No cookies, nothing personal: the server counts a visitor per day from a salted hash and never stores the IP.
   Feeds the admin dashboard (/admin/ → Traffic). Server: functions/api/t.js. */
(function () {
  "use strict";
  if (navigator.doNotTrack === "1" || /^\/admin\//.test(location.pathname) || /[?&]bg=/.test(location.search)) return;   // v19: the background runner page is not a visitor
  var send = function (o) { try { var b = JSON.stringify(o); if (navigator.sendBeacon && navigator.sendBeacon("/api/t", new Blob([b], { type: "text/plain" }))) return; fetch("/api/t", { method: "POST", body: b, keepalive: true, headers: { "content-type": "text/plain" } }); } catch (e) {} };
  // "new or returning" uses a plain yes/no flag in the browser, and only after the visitor accepted analytics cookies
  var ret = null; try { var cs = JSON.parse(localStorage.getItem("fodo-consent") || "null"); if (cs && cs.analytics) { ret = localStorage.getItem("fodo-seen") ? 1 : 0; localStorage.setItem("fodo-seen", "1"); } } catch (e) {}
  send({ t: "pv", p: location.pathname, r: document.referrer || "", q: location.search, w: screen.width || innerWidth, l: navigator.language || "", ret: ret });
  var q = [], t0 = Date.now();
  var flush = function () { if (q.length) { send({ t: "ev", p: location.pathname, e: q.splice(0, 20) }); } };
  var wrap = function () { var orig = window.FODO_TRACK; if (!orig || orig._fodoIns) return !!orig;
    var w = function (name, params) { try { params = params || {}; q.push([String(name), String(params.cta_text || params.tool || params.link_domain || params.kind || params.percent_scrolled || params.form_id || "").slice(0, 60)]); if (q.length >= 8) flush(); } catch (e) {} return orig.apply(this, arguments); };
    w._fodoIns = true; window.FODO_TRACK = w; return true; };
  if (!wrap()) { var tries = 0, iv = setInterval(function () { if (wrap() || ++tries > 40) clearInterval(iv); }, 250); }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") { flush(); send({ t: "time", p: location.pathname, s: Math.round((Date.now() - t0) / 1000) }); } else t0 = Date.now();   // only time the page was visible
  });
  addEventListener("pagehide", flush);
})();
