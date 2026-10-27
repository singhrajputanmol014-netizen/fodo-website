/* FODO Competitor Finder — page logic for /competitor-finder/.
   Calls /api/competitors (Google Places when the key is set, OpenStreetMap otherwise), lists nearby businesses,
   shows the search and each business on an embedded Google Map, and gives a quick read of the area. */
(function () {
  "use strict";
  var U = window.FODO_UTIL || {}, esc = U.esc || function (s) { return String(s); };
  var $ = function (id) { return document.getElementById(id); };
  var form = $("cf"); if (!form) return;
  var tIn = $("cf-type"), aIn = $("cf-area"), rIn = $("cf-radius"), status = $("cf-status"), list = $("cf-list"), frame = $("cf-frame"), read = $("cf-read"), filt = $("cf-filter");
  var data = null, sortBy = "distance", coords = null, busy = false;

  var mapSrc = function (q, z) { return "https://maps.google.com/maps?q=" + encodeURIComponent(q) + "&z=" + (z || 14) + "&output=embed"; };
  var km = function (m) { return m == null ? "" : m < 1000 ? m + " m" : (m / 1000).toFixed(1) + " km"; };
  var stars = function (r) { if (r == null) return ""; var f = Math.round(r), s = ""; for (var i = 1; i <= 5; i++) s += i <= f ? "★" : "☆"; return s; };
  var setStatus = function (t, kind) { status.textContent = t; status.className = "cf-status" + (kind ? " " + kind : ""); };

  // remember the last search for this visitor (convenience only)
  try { var last = JSON.parse(localStorage.getItem("fodo-cf") || "null"); if (last) { tIn.value = last.t || ""; aIn.value = last.a || ""; if (last.r) rIn.value = last.r; } } catch (e) {}
  var qs = new URLSearchParams(location.search); if (qs.get("type")) tIn.value = qs.get("type"); if (qs.get("area")) aIn.value = qs.get("area");

  form.addEventListener("click", function (e) {
    var b = e.target.closest(".chip"); if (!b) return;
    if (b.dataset.area) { aIn.value = b.dataset.area; coords = null; }
    if (b.dataset.type) tIn.value = b.dataset.type;
    if (tIn.value.trim() && aIn.value.trim()) run(); else (tIn.value.trim() ? aIn : tIn).focus();
  });
  aIn.addEventListener("input", function () { coords = null; });
  form.addEventListener("submit", function (e) { e.preventDefault(); run(); });
  $("cf-near").addEventListener("click", function () {
    if (!navigator.geolocation) { setStatus("Location is not available in this browser — type your area instead.", "warn"); return; }
    setStatus("Asking for your location…");
    navigator.geolocation.getCurrentPosition(function (p) { coords = { lat: p.coords.latitude, lng: p.coords.longitude }; aIn.value = "Near me"; if (!tIn.value.trim()) { setStatus("Got your location. Now type a business type."); tIn.focus(); } else run(); },
      function () { setStatus("Location permission was declined — type your area instead.", "warn"); aIn.focus(); }, { timeout: 10000, maximumAge: 600000 });
  });
  document.querySelector(".cf-sort").addEventListener("click", function (e) {
    var b = e.target.closest("[data-sort]"); if (!b) return; sortBy = b.dataset.sort;
    this.querySelectorAll("[data-sort]").forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); paint();
  });
  filt.addEventListener("input", paint);
  list.addEventListener("click", function (e) {
    var b = e.target.closest("[data-show]"); if (!b || !data) return;
    var p = data.results[+b.dataset.show]; if (!p) return;
    frame.src = mapSrc(p.name + ", " + (p.address || data.area), 16);
    list.querySelectorAll(".cf-item").forEach(function (li) { li.classList.toggle("on", li.dataset.i === b.dataset.show); });
    if (matchMedia("(max-width:899px)").matches) $("cf-map").scrollIntoView({ behavior: "smooth", block: "center" });
  });

  function run() {
    var type = tIn.value.trim(), area = aIn.value.trim();
    if (!type) { setStatus("Type a business type, for example “Cafe”.", "warn"); tIn.focus(); return; }
    if (!area && !coords) { setStatus("Type an area, for example “Dwarka”, or use your location.", "warn"); aIn.focus(); return; }
    if (busy) return; busy = true;
    var mapQ = type + " near " + (coords ? coords.lat + "," + coords.lng : area + ", Delhi NCR");
    frame.src = mapSrc(mapQ, 14);
    try { localStorage.setItem("fodo-cf", JSON.stringify({ t: type, a: coords ? "" : area, r: rIn.value })); } catch (e) {}
    setStatus("Searching " + type + " near " + (coords ? "you" : area) + "…", "busy");
    list.innerHTML = '<li class="cf-empty">Looking up businesses near ' + esc(coords ? "you" : area) + "…</li>";
    var u = (U.root || "/") + "api/competitors?type=" + encodeURIComponent(type) + "&area=" + encodeURIComponent(coords ? "" : area) + "&radius=" + rIn.value + (coords ? "&lat=" + coords.lat + "&lng=" + coords.lng : "");
    var ac = "AbortController" in window ? new AbortController() : null, tm = ac ? setTimeout(function () { ac.abort(); }, 35000) : 0;
    fetch(u, { headers: { accept: "application/json" }, signal: ac ? ac.signal : undefined }).then(function (r) { clearTimeout(tm); return r.json().catch(function () { return { ok: false, reason: r.status === 404 ? "The finder service is not deployed yet (404)." : "The finder service did not answer (code " + r.status + ")." }; }).then(function (j) { j._s = r.status; if (!j.ok && j.errors && j.errors.length) j.reason = (j.reason || "") + " [" + j.errors.join(", ") + "]"; return j; }); })
      .then(function (j) {
        busy = false;
        if (!j.ok) { data = null; fallback(type, area, j.reason); return; }
        data = j; data.results.forEach(function (p, i) { p._i = i; });
        var n = j.results.length;
        setStatus(n ? n + " businesses found within " + km(j.radius) + (j.source === "google" ? " · from Google Maps" : " · from OpenStreetMap, with Google Maps links") : (j.note || "No listed businesses found. Try a bigger radius or a nearby area."), n ? "ok" : "warn");
        paint(); insight();
      }, function (err) { clearTimeout(tm); busy = false; data = null; fallback(type, area, err && err.name === "AbortError" ? "The map servers took too long to answer." : "Could not reach the finder — check your connection or turn off any ad-blocker for this site."); });
  }
  function fallback(type, area, reason) {
    var q = type + " near " + (coords ? coords.lat + "," + coords.lng : area + ", Delhi NCR");
    setStatus((reason || "The live list is not available right now.") + " The map shows the Google Maps listings for your search.", "warn");
    list.innerHTML = '<li class="cf-empty">The Google Maps view on this page shows the businesses for your search. <a href="https://www.google.com/maps/search/' + encodeURIComponent(q) + '" target="_blank" rel="noopener noreferrer">Open the full list on Google Maps ↗</a></li>';
    read.textContent = "Open the top three listings on Google Maps and compare their reviews, photos and hours with yours. That is where most local wins come from.";
  }
  function paint() {
    if (!data) return;
    var f = (filt.value || "").toLowerCase().trim();
    var r = data.results.filter(function (p) { return !f || (p.name + " " + p.address).toLowerCase().indexOf(f) > -1; }).slice();
    r.sort(function (a, b) {
      if (sortBy === "rating") return (b.rating || 0) - (a.rating || 0) || (b.reviews || 0) - (a.reviews || 0);
      if (sortBy === "reviews") return (b.reviews || 0) - (a.reviews || 0);
      return (a.distance == null ? 1e9 : a.distance) - (b.distance == null ? 1e9 : b.distance);
    });
    if (!r.length) { list.innerHTML = '<li class="cf-empty">' + (f ? "No result matches “" + esc(f) + "”." : "No listed businesses found here. Try a bigger radius or a nearby area.") + "</li>"; return; }
    list.innerHTML = r.map(function (p, k) {
            var rate = p.rating != null ? '<span class="cf-rate" aria-label="Rated ' + p.rating + ' out of 5"><b>' + p.rating.toFixed(1) + '</b> <span aria-hidden="true">' + stars(p.rating) + "</span> <span class=\"muted\">(" + (p.reviews || 0).toLocaleString("en-IN") + " reviews)</span></span>" : '<span class="cf-rate muted">Rating on Google Maps</span>';
      var flags = (p.open === true ? '<span class="cf-flag ok">Open now</span>' : p.open === false ? '<span class="cf-flag">Closed now</span>' : "") + (!p.website ? '<span class="cf-flag warn">No website listed</span>' : "") + (p.status && p.status !== "OPERATIONAL" ? '<span class="cf-flag">' + esc(p.status.replace(/_/g, " ").toLowerCase()) + "</span>" : "");
      return '<li class="cf-item" data-i="' + p._i + '"><span class="cf-n">' + (k + 1) + '</span><div class="cf-body"><h3>' + esc(p.name) + "</h3>" +
        '<p class="cf-meta"><span class="cf-cat">' + esc(p.category || "") + '</span>' + (p.category && p.distance != null ? " · " : "") + km(p.distance) + "</p>" + (p.address ? '<p class="cf-addr">' + esc(p.address) + "</p>" : "") + rate + (flags ? '<p class="cf-flags">' + flags + "</p>" : "") +
        (p.hours ? '<p class="cf-addr">Hours: ' + esc(p.hours) + "</p>" : "") +
        '<div class="cf-acts"><a class="btn sm" href="' + esc(p.mapsUrl) + '" target="_blank" rel="noopener noreferrer">Google Maps listing ↗</a>' +
        '<button type="button" class="btn sm ghost" data-show="' + p._i + '">Show on map</button>' +
        (p.lat != null ? '<a class="btn sm ghost" href="https://www.google.com/maps/dir/?api=1&amp;destination=' + p.lat + "," + p.lng + '" target="_blank" rel="noopener noreferrer">Directions</a>' : "") +
        (p.phone ? '<a class="btn sm ghost" href="tel:' + esc(p.phone.replace(/[^\d+]/g, "")) + '">Call</a>' : "") +
        (p.website ? '<a class="btn sm ghost" href="' + esc(/^https?:/.test(p.website) ? p.website : "https://" + p.website) + '" target="_blank" rel="noopener noreferrer nofollow">Website</a>' : "") + "</div></div></li>";
    }).join("");
  }
  function insight() {
    var r = data.results, n = r.length; if (!n) { read.textContent = "No listed competitors nearby — a strong Google Business Profile could make you the first name people see."; return; }
    var rated = r.filter(function (p) { return p.rating != null; }), noWeb = r.filter(function (p) { return !p.website; }).length;
    var avg = rated.length ? rated.reduce(function (s, p) { return s + p.rating; }, 0) / rated.length : null;
    var top = rated.slice().sort(function (a, b) { return (b.reviews || 0) - (a.reviews || 0); })[0];
    var near = r.filter(function (p) { return p.distance != null && p.distance <= 1000; }).length;
    var crowd = n >= 25 ? "very crowded" : n >= 12 ? "competitive" : n >= 5 ? "moderately competitive" : "open";
    read.innerHTML = "<b>" + n + "</b> " + esc(data.type.toLowerCase()) + " listings within " + km(data.radius) + " — the area looks <b>" + crowd + "</b>." +
      (near ? " " + near + " are within 1 km." : "") +
      (avg != null ? " Average Google rating: <b>" + avg.toFixed(1) + "★</b>." : "") +
      (top ? " Most reviewed: <b>" + esc(top.name) + "</b> (" + (top.reviews || 0).toLocaleString("en-IN") + " reviews) — that is the listing to study." : "") +
      " <b>" + noWeb + " of " + n + "</b> show no website" + (noWeb / n > 0.4 ? " — a good, fast site is an easy edge here." : ".");
  }
  if (tIn.value.trim() && aIn.value.trim() && qs.get("type")) run();
})();
