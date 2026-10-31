/* FODO Growth Lab home (v17): refresh prices, tool switches and connected data sources from /api/lab/catalog
   (the static page already lists every tool with default prices, so it works without JavaScript and for search engines). */
(function () {
  "use strict";
  var root = document.getElementById("gl-pro"); if (!root) return;
  var U = window.FODO_UTIL || {}, ROOT = U.root || "/", inr = function (n) { return "₹" + Math.round(+n || 0).toLocaleString("en-IN"); };
  fetch(ROOT + "api/lab/catalog").then(function (r) { return r.ok ? r.json() : null; }).then(function (c) {
    if (!c || !c.ok) return;
    var P = c.plans, txt = { pro: "PRO · " + c.freeXrays + " X-Rays free with login, then from " + inr(P.starter.price) + " for " + P.starter.xrays, growth: "PRO · Growth plan (" + inr(P.growth.price) + "/month) and above",
      starter: "PRO · Starter plan (" + inr(P.starter.price) + "/month) and above", monitor: "PRO · " + P.free.monitors + " website" + (P.free.monitors === 1 ? "" : "s") + " free · up to " + P.agency.monitors + " on paid plans" };
    document.querySelectorAll("[data-price]").forEach(function (el) { if (txt[el.dataset.price]) el.textContent = txt[el.dataset.price]; });
    var on = {}; (c.tools || []).forEach(function (t) { on[t.id] = t.on; });
    // v18: one-run price of each standalone tool + the plans whose X-Rays include it
    (c.tools || []).forEach(function (t) { if (!t.buy) return; document.querySelectorAll('[data-pid="' + t.id + '"]').forEach(function (el) { el.textContent = (t.levelName || "PRO") + " · " + inr(t.price) + " a run" + (t.includedIn && t.includedIn.length ? " · included in " + t.includedIn.join(", ") + " X-Rays" : ""); }); });
    document.querySelectorAll(".gl-card[data-tool]").forEach(function (a) { if (on[a.dataset.tool] === false) { a.classList.add("gl-off"); var p = document.createElement("p"); p.className = "gl-maint"; p.textContent = "Being updated, back shortly"; a.appendChild(p); } });
    var s = c.sources || {}, live = [s.search && "Google Search", s.places && "Google Maps", "PageSpeed", s.searchConsole && "Search Console", s.ai && s.ai.length && s.ai.length + " AI engine" + (s.ai.length === 1 ? "" : "s")].filter(Boolean);
    var el = document.getElementById("gl-live"); if (el) el.textContent = "Connected right now: " + live.join(" · ") + ".";
  }, function () {});
})();
