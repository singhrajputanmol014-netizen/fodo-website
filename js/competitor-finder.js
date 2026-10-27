/* FODO Competitor Finder v8 — /competitor-finder/
   • Local businesses: any business type near any place on earth, radius 0.5–100 km (slider or typed).
     Every listed business is returned (no cap) from OpenStreetMap, searched straight from this browser (js/free-places.js);
     when the site has a Google Places key, Google results (up to 60, or more with "Deep Google search" tiles) are merged in.
   • Brands & startups: competitors of any company or industry from Wikidata — optionally only those headquartered near a city.
   • Every record carries every field we can find (phones, email, website, socials, hours, address parts, tags, HQ, founders …),
     and "Find emails & socials" reads each competitor's own website (/api/enrich) to fill in contacts.
   • Every search is added to one sheet in this browser → Excel (one row per competitor, every column), CSV or Google Sheets. */
(function () {
  "use strict";
  window.FODO_CF_VERSION = "8.0";
  var U = window.FODO_UTIL || {}, esc = U.esc || function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var $ = function (id) { return document.getElementById(id); };
  var form = $("cf"), bform = $("cfb"); if (!form || !bform) return;
  var tIn = $("cf-type"), aIn = $("cf-area"), bIn = $("cf-brand"), cIn = $("cf-country"), blIn = $("cf-bloc");
  var status = $("cf-status"), list = $("cf-list"), frame = $("cf-frame"), read = $("cf-read"), filt = $("cf-filter"), mapBox = $("cf-map"), card = $("cf-brandcard"), pinsEl = $("cf-pins");
  var mode = "local", data = null, sortBy = "best", coords = null, place = null, brandPick = null, bplace = null, busy = false, shown = 0, PAGE = 50, google = null, view = [];
  var ROOT = U.root || "/";
  var tmo = function (ms) { return window.AbortSignal && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined; };
  var fetchT = function (u, o, ms) { return fetch(u, Object.assign({}, o, { signal: tmo(ms || 9000) })); };
  var mapSrc = function (q, z) { return "https://maps.google.com/maps?q=" + encodeURIComponent(q) + "&z=" + (z || 14) + "&output=embed"; };
  var km = function (m) { return m == null ? "" : m < 1000 ? m + " m" : (m / 1000).toFixed(1) + " km"; };
  var stars = function (r) { var f = Math.round(r), s = ""; for (var i = 1; i <= 5; i++) s += i <= f ? "★" : "☆"; return s; };
  var setStatus = function (t, kind) { status.textContent = t; status.className = "cf-status" + (kind ? " " + kind : ""); };
  var ver = function (diag) { var v = document.querySelector(".cf-ver"); if (v) v.textContent = "Finder v" + window.FODO_CF_VERSION + (diag ? " · " + diag : ""); };
  var LS = { get: function (k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } } };
  var nrm = function (s) { return String(s || "").toLowerCase().replace(/[^a-z0-9ऀ-ॿ ]+/g, " ").replace(/\s+/g, " ").trim(); };
  var href = function (u) { return /^https?:/i.test(u) ? u : "https://" + u; };

  /* ================= radius: slider + typed km, kept in sync ================= */
  function radius(pre) {
    var r = $(pre + "-radius-r"), n = $(pre + "-radius");
    var clamp = function (v) { v = parseFloat(String(v).replace(",", ".")); if (!isFinite(v)) v = 2; return Math.min(100, Math.max(0.2, v)); };
    var paint = function () { r.style.setProperty("--fill", ((Math.min(100, Math.max(0.5, +r.value)) - 0.5) / 99.5 * 100) + "%"); };
    r.addEventListener("input", function () { n.value = r.value; paint(); });
    n.addEventListener("input", function () { var v = parseFloat(n.value); if (isFinite(v)) { r.value = Math.min(100, Math.max(0.5, v)); paint(); } });
    n.addEventListener("change", function () { n.value = clamp(n.value); r.value = Math.min(100, Math.max(0.5, +n.value)); paint(); });
    paint();
    return { km: function () { return clamp(n.value); }, m: function () { return Math.round(clamp(n.value) * 1000); }, set: function (v) { n.value = clamp(v); r.value = Math.min(100, Math.max(0.5, +n.value)); paint(); } };
  }
  var R1 = radius("cf"), R2 = radius("cfb");
  ver();

  /* ================= typing suggestions (accessible combobox) ================= */
  function combo(input, listEl, source, onPick) {
    var items = [], act = -1, timer = 0, seq = 0;
    var close = function () { listEl.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); act = -1; };
    var paintL = function () {
      if (!items.length) { close(); return; }
      listEl.innerHTML = items.map(function (it, i) { return '<li role="option" id="' + listEl.id + "-" + i + '" aria-selected="' + (i === act) + '"><b>' + esc(it.label) + "</b>" + (it.sub ? "<small>" + esc(it.sub) + "</small>" : "") + "</li>"; }).join("");
      listEl.hidden = false; input.setAttribute("aria-expanded", "true");
      if (act > -1) input.setAttribute("aria-activedescendant", listEl.id + "-" + act); else input.removeAttribute("aria-activedescendant");
    };
    var pick = function (i) { var it = items[i]; if (!it) return; input.value = it.value || it.label; close(); onPick(it); };
    input.addEventListener("input", function () {
      clearTimeout(timer); var q = input.value.trim(), my = ++seq; onPick(null, true);
      timer = setTimeout(function () { Promise.resolve(source(q)).then(function (r) { if (my !== seq || document.activeElement !== input) return; items = (r || []).slice(0, 8); act = -1; paintL(); }, function () {}); }, 180);
    });
    input.addEventListener("focus", function () { if (!input.value.trim()) Promise.resolve(source("")).then(function (r) { if (document.activeElement !== input) return; items = (r || []).slice(0, 8); paintL(); }); });
    input.addEventListener("keydown", function (e) {
      if (listEl.hidden) return;
      if (e.key === "ArrowDown") { e.preventDefault(); act = (act + 1) % items.length; paintL(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); act = (act - 1 + items.length) % items.length; paintL(); }
      else if (e.key === "Enter" && act > -1) { e.preventDefault(); pick(act); }
      else if (e.key === "Escape") { close(); }
    });
    listEl.addEventListener("mousedown", function (e) { var li = e.target.closest("li"); if (!li) return; e.preventDefault(); pick(+li.id.split("-").pop()); });
    input.addEventListener("blur", function () { setTimeout(close, 120); });
    return { close: close };
  }
  var TYPES = ["Cafe", "Restaurant", "Bakery", "Cloud kitchen", "Dentist", "Clinic", "Hospital", "Pharmacy", "Gym", "Yoga studio", "Salon", "Beauty parlour", "Spa",
    "Boutique", "Clothing store", "Shoe store", "Jewellery shop", "Mobile shop", "Electronics store", "Supermarket", "Furniture store", "Hardware store", "Florist", "Gift shop",
    "Coaching centre", "School", "Play school", "Real estate agent", "Hotel", "Travel agency", "Car dealer", "Car repair", "Car wash", "Chartered accountant", "Lawyer",
    "Architect", "Interior designer", "Wedding planner", "Photographer", "Printing press", "Laundry", "Pet shop", "Veterinary clinic", "Optician", "Bookstore",
    "Software company", "IT services company", "Startup", "Digital marketing agency", "Advertising agency", "Consulting firm", "Coworking space", "Logistics company",
    "Insurance agency", "Financial advisor", "Recruitment agency", "Manufacturer", "NGO"];
  combo(tIn, $("cf-type-list"), function (q) {
    var n = nrm(q); var r = TYPES.filter(function (t) { return !n || nrm(t).indexOf(n) > -1; });
    r.sort(function (a, b) { return (nrm(a).indexOf(n) === 0 ? 0 : 1) - (nrm(b).indexOf(n) === 0 ? 0 : 1); });
    if (n && !r.some(function (t) { return nrm(t) === n; })) r.push(q.trim());
    return r.map(function (t) { return { label: t }; });
  }, function () {});
  var placeCache = {};
  function placeSource(withNear) {
    return function (q) {
      if (q.length < 2) return withNear ? [{ label: "Use my current location", value: "", sub: "Asks your browser for your location", near: true }] : [];
      if (placeCache[q]) return placeCache[q];
      return fetchT("https://photon.komoot.io/api/?limit=7&lang=en&q=" + encodeURIComponent(q), {}, 6000).then(function (r) { return r.json(); }).then(function (j) {
        var seen = {}, out = (j.features || []).map(function (f) {
          var p = f.properties || {}, main = p.name || p.street || p.city || "", sub = [p.district, p.city !== main ? p.city : "", p.state, p.country].filter(function (x, i, a) { return x && a.indexOf(x) === i && x !== main; }).join(", ");
          return { label: main, sub: sub, value: [main, p.city !== main ? p.city : "", p.country].filter(Boolean).join(", "), lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], type: p.type || p.osm_value || "" };
        }).filter(function (x) { var k = x.label + "|" + x.sub; if (!x.label || seen[k]) return false; seen[k] = 1; return true; });
        placeCache[q] = out; return out;
      }).catch(function () { return []; });
    };
  }
  combo(aIn, $("cf-area-list"), placeSource(true), function (it, typing) {
    if (typing) { place = null; coords = null; return; }
    if (!it) return; if (it.near) { useMyLocation(); return; }
    place = it; coords = { lat: it.lat, lng: it.lng };
  });
  combo(blIn, $("cf-bloc-list"), placeSource(false), function (it, typing) { bplace = typing ? null : it; });
  var brandCache = {};
  var INDUSTRIES = ["Food delivery", "Fintech", "Edtech", "E-commerce", "Electric vehicles", "Online travel", "Cosmetics", "Fashion", "Software as a service", "Cybersecurity", "Artificial intelligence", "Ride hailing", "Telecommunications", "Insurance", "Banking", "Real estate", "Healthcare", "Pharmaceutical industry", "Logistics", "Streaming media", "Video games", "Airline", "Hospitality industry", "Automotive industry"];
  combo(bIn, $("cf-brand-list"), function (q) {
    if (!q) return INDUSTRIES.slice(0, 8).map(function (x) { return { label: x, sub: "Industry" }; });
    if (brandCache[q]) return brandCache[q];
    return fetchT("https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&origin=*&language=en&uselang=en&type=item&limit=8&search=" + encodeURIComponent(q), {}, 6000)
      .then(function (r) { return r.json(); }).then(function (j) {
        var out = (j.search || []).map(function (x) { return { label: x.label || x.id, sub: x.description || "", id: x.id }; });
        var n = nrm(q); INDUSTRIES.forEach(function (i) { if (nrm(i).indexOf(n) === 0 && !out.some(function (o) { return nrm(o.label) === nrm(i); })) out.push({ label: i, sub: "Industry" }); });
        brandCache[q] = out; return out;
      }).catch(function () { return INDUSTRIES.filter(function (i) { return nrm(i).indexOf(nrm(q)) > -1; }).map(function (x) { return { label: x, sub: "Industry" }; }); });
  }, function (it, typing) { brandPick = typing ? null : it; });

  /* ================= mode tabs ================= */
  var tabs = [].slice.call(document.querySelectorAll(".cf-tabs [role=tab]"));
  function setMode(m, focus) {
    mode = m; tabs.forEach(function (t) { var on = t.dataset.mode === m; t.setAttribute("aria-selected", on); t.tabIndex = on ? 0 : -1; });
    form.hidden = m !== "local"; bform.hidden = m !== "brand";
    card.hidden = !(m === "brand" && data && data.mode === "brand");
    document.querySelectorAll('.cf-sort [data-sort="rating"],.cf-sort [data-sort="reviews"]').forEach(function (b) { b.hidden = m !== "local"; });
    $("cf-results").textContent = m === "local" ? "Nearby competitors" : "Brand & startup competitors";
    if (data && data.mode !== m) { data = null; view = []; list.innerHTML = '<li class="cf-empty">Run a search above — results appear here and are added to your sheet automatically.</li>'; $("cf-more").hidden = true; read.textContent = "Run a search to get a quick read."; clearPins(); }
    if (focus) (m === "local" ? tIn : bIn).focus();
    try { history.replaceState(null, "", m === "brand" ? "#brands" : location.pathname + location.search); } catch (e) {}
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { setMode(t.dataset.mode, true); });
    t.addEventListener("keydown", function (e) { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); var n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); setMode(n.dataset.mode); } });
  });

  /* ================= is Google connected? (decides whether to merge Google results) ================= */
  var health = fetchT(ROOT + "api/competitors?health=1", { headers: { accept: "application/json" } }, 6000).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
    .then(function (h) { google = !!h.google; $("cf-deep-wrap").hidden = !google; return h; });

  /* ================= local search ================= */
  var last = LS.get("fodo-cf", null);
  if (last) { tIn.value = last.t || ""; aIn.value = last.a || ""; if (last.km) R1.set(last.km); if (last.lat != null) { coords = { lat: last.lat, lng: last.lng }; place = { lat: last.lat, lng: last.lng, value: last.a }; } }
  var qs = new URLSearchParams(location.search); if (qs.get("type")) tIn.value = qs.get("type"); if (qs.get("area")) { aIn.value = qs.get("area"); coords = null; place = null; } if (qs.get("km")) R1.set(qs.get("km"));
  form.addEventListener("click", function (e) {
    var b = e.target.closest(".chip"); if (!b) return;
    if (b.dataset.area) { aIn.value = b.dataset.area; coords = null; place = null; }
    if (b.dataset.type) tIn.value = b.dataset.type;
    if (tIn.value.trim() && aIn.value.trim()) run(); else (tIn.value.trim() ? aIn : tIn).focus();
  });
  form.addEventListener("submit", function (e) { e.preventDefault(); run(); });
  function useMyLocation() {
    if (!navigator.geolocation) { setStatus("Location is not available in this browser — type a place instead.", "warn"); return; }
    setStatus("Asking for your location…");
    navigator.geolocation.getCurrentPosition(function (p) { coords = { lat: p.coords.latitude, lng: p.coords.longitude }; place = null; aIn.value = "Near me"; if (!tIn.value.trim()) { setStatus("Got your location. Now type a business type."); tIn.focus(); } else run(); },
      function () { setStatus("Location permission was declined — type a place instead.", "warn"); aIn.focus(); }, { timeout: 10000, maximumAge: 600000 });
  }
  $("cf-near").addEventListener("click", useMyLocation);
  var freeMod = null;
  var lib = function () { return freeMod = freeMod || import(ROOT + "js/free-places.js?v=" + window.FODO_CF_VERSION); };
  function api(params, ms) {
    var u = ROOT + "api/competitors?" + Object.keys(params).filter(function (k) { return params[k] !== "" && params[k] != null; }).map(function (k) { return k + "=" + encodeURIComponent(params[k]); }).join("&");
    return fetchT(u, { headers: { accept: "application/json" } }, ms || 40000).then(function (r) { return r.json().catch(function () { return { ok: false, reason: "code " + r.status }; }); });
  }
  function googleAll(type, area, c, rm, deep) {
    if (!c) return api({ type: type, area: area, radius: rm }).then(function (j) { return j.ok && j.source === "google" ? j : null; });
    var n = !deep ? 1 : rm <= 3000 ? 2 : rm <= 15000 ? 3 : rm <= 40000 ? 4 : 5, tiles = [];
    var dLat = rm / 111320, dLng = rm / (111320 * Math.cos(c.lat * Math.PI / 180));
    if (n === 1) tiles.push(null);
    else for (var i = 0; i < n; i++) for (var k = 0; k < n; k++) { var a = c.lat - dLat + 2 * dLat * i / n, b = c.lng - dLng + 2 * dLng * k / n; tiles.push([a, b, a + 2 * dLat / n, b + 2 * dLng / n].map(function (x) { return x.toFixed(6); }).join(",")); }
    var out = [], done = 0;
    var next = function (idx) {
      if (idx >= tiles.length) return Promise.resolve();
      return api(tiles[idx] ? { type: type, rect: tiles[idx] } : { type: type, area: area, lat: c.lat, lng: c.lng, radius: rm }).then(function (j) {
        done++; if (tiles.length > 1) setStatus("Deep Google search: area " + done + " of " + tiles.length + " · " + out.length + " found so far…", "busy");
        if (j && j.ok && j.source === "google") out = out.concat(j.results || []);
      }, function () { done++; }).then(function () { return next(idx + 1); });
    };
    return next(0).then(function () { return out.length ? { ok: true, source: "google", results: out } : null; });
  }
  function run() {
    var type = tIn.value.trim(), area = aIn.value.trim(), rm = R1.m();
    if (!type) { setStatus("Type a business type, for example “Cafe” or “Software company”.", "warn"); tIn.focus(); return; }
    if (!area && !coords) { setStatus("Type a place — any city, area or address — or use your location.", "warn"); aIn.focus(); return; }
    if (busy) return; busy = true; ver();
    var where = coords ? (area && area !== "Near me" ? area : "you") : area, areaQ = area === "Near me" ? "" : area;
    frame.src = mapSrc(type + " near " + (coords ? coords.lat + "," + coords.lng : area), rm > 20000 ? 10 : rm > 5000 ? 12 : 14);
    LS.set("fodo-cf", { t: type, a: areaQ, km: R1.km(), lat: place ? place.lat : undefined, lng: place ? place.lng : undefined });
    setStatus("Searching every " + type.toLowerCase() + " within " + R1.km() + " km of " + where + "… (big areas can take up to a minute)", "busy");
    list.innerHTML = '<li class="cf-empty">Looking up ' + esc(type) + " near " + esc(where) + "…</li>"; $("cf-more").hidden = true;
    var deep = $("cf-deep").checked;
    lib().then(function (m) {
      var F = m.freePlaces(fetchT, {});
      var center = coords ? Promise.resolve(coords) : F.geocode(areaQ);
      return center.then(function (c) {
        if (!c) throw Object.assign(new Error("place"), { reason: "That place was not found. Pick one from the suggestions while typing." });
        var osmP = F.search({ type: type, area: areaQ, center: { lat: c.lat, lng: c.lng }, radius: rm }).catch(function (e) { return { results: [], failed: e && e.tried ? e.tried.join(", ") : (e && e.message) }; });
        var gP = health.then(function () { return google ? googleAll(type, areaQ, c, rm, deep).catch(function () { return null; }) : null; });
        return Promise.all([osmP, gP]).then(function (r) {
          var osm = r[0], g = r[1], res;
          if (g && g.results.length) { var gl = m.dedupe(g.results); res = m.mergeSources(gl, osm.results || []); }
          else res = osm.results || [];
          res.forEach(function (p) { p.distance = m.dist(c, p); });
          res = res.filter(function (p) { return p.distance <= rm * 1.05; }).sort(function (a, b) { return a.distance - b.distance; });
          if (!res.length && osm.failed && !(g && g.results.length)) {
            // last try: the server route (it may reach the map servers when this browser can't)
            return api({ type: type, area: areaQ, lat: c.lat, lng: c.lng, radius: rm }, 60000).then(function (j) {
              if (j && j.ok && j.results && j.results.length) return Object.assign(j, { mode: "local", viaServer: true });
              throw Object.assign(new Error("all"), { reason: "The free map servers did not answer right now. Please try again in a minute.", diag: osm.failed });
            });
          }
          return { ok: true, mode: "local", type: type, area: areaQ || "your location", radius: rm, center: c, results: res, source: g && g.results.length ? (osm.results && osm.results.length ? "google+osm" : "google") : "osm" };
        });
      });
    }).then(function (j) { show(j); }, function (e) {
      busy = false; data = null; view = [];
      var q = type + " near " + (coords ? coords.lat + "," + coords.lng : area);
      setStatus((e && e.reason) || "Something went wrong — please try again.", "warn"); ver(e && (e.diag || e.message));
      list.innerHTML = '<li class="cf-empty">The Google Maps view on this page still shows businesses for your search. <a href="https://www.google.com/maps/search/' + encodeURIComponent(q) + '" target="_blank" rel="noopener noreferrer">Open the full list on Google Maps ↗</a></li>';
      setMapView("google");
    });
  }

  /* ================= brand & startup search (Wikidata) ================= */
  bform.addEventListener("click", function (e) { var b = e.target.closest(".chip[data-brand]"); if (!b) return; bIn.value = b.dataset.brand; brandPick = null; runBrand(); });
  bform.addEventListener("submit", function (e) { e.preventDefault(); runBrand(); });
  var WD = "https://query.wikidata.org/sparql?format=json&query=";
  function sparql(q) { return fetchT(WD + encodeURIComponent(q), { headers: { accept: "application/sparql-results+json" } }, 45000).then(function (r) { if (!r.ok) throw new Error("wikidata " + r.status); return r.json(); }).then(function (j) { return j.results.bindings; }); }
  var val = function (b, k) { return b[k] ? b[k].value : ""; };
  var qid = function (uri) { return String(uri || "").split("/").pop(); };
  var GENERIC = "wd:Q4830453, wd:Q783794, wd:Q6881511, wd:Q891723, wd:Q43229, wd:Q167037, wd:Q1589009, wd:Q18388277, wd:Q155076, wd:Q219577, wd:Q658255, wd:Q778575, wd:Q431289, wd:Q1137109, wd:Q163740, wd:Q2659904, wd:Q4120211";
  function resolveSeed(q) {
    if (brandPick && brandPick.id && nrm(brandPick.label) === nrm(q)) return Promise.resolve(brandPick);
    return fetchT("https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&origin=*&language=en&uselang=en&type=item&limit=1&search=" + encodeURIComponent(q), {}, 8000)
      .then(function (r) { return r.json(); }).then(function (j) { var x = (j.search || [])[0]; if (!x) throw Object.assign(new Error("not found"), { reason: "No company or industry called “" + q + "” was found. Try the full name, or pick one from the suggestions." }); return { id: x.id, label: x.label, sub: x.description || "" }; });
  }
  function placeCoords() {
    var t = blIn.value.trim(); if (!t) return Promise.resolve(null);
    if (bplace && bplace.lat != null) return Promise.resolve(bplace);
    return lib().then(function (m) { return m.freePlaces(fetchT, {}).geocode(t); }).then(function (c) { if (!c) throw Object.assign(new Error("place"), { reason: "That city or region was not found — pick one from the suggestions." }); return Object.assign({ value: t }, c); });
  }
  function runBrand() {
    var q = bIn.value.trim(); if (!q) { setStatus("Type a brand, company or industry — for example “Zomato” or “fintech”.", "warn"); bIn.focus(); return; }
    if (busy) return; busy = true; ver();
    var country = cIn.value, cname = cIn.options[cIn.selectedIndex].text, rkm = R2.km();
    setStatus("Finding competitors of " + q + "…", "busy");
    list.innerHTML = '<li class="cf-empty">Looking up companies that compete with ' + esc(q) + "…</li>"; $("cf-more").hidden = true;
    Promise.all([resolveSeed(q), placeCoords()]).then(function (r) {
      var seed = r[0], loc = r[1], S = "wd:" + seed.id;
      var cf = country ? "?c wdt:P17 wd:" + country + " ." : "";
      var lf = loc ? '?c wdt:P159 ?hqf . SERVICE wikibase:around { ?hqf wdt:P625 ?hqloc . bd:serviceParam wikibase:center "Point(' + (+loc.lng).toFixed(5) + " " + (+loc.lat).toFixed(5) + ')"^^geo:wktLiteral . bd:serviceParam wikibase:radius "' + rkm + '" . }' : "";
      var compQ = "SELECT ?c ?cLabel ?cDescription ?website ?email ?phone ?countryLabel ?hqLabel ?coord ?inception ?employees ?revenue ?ceoLabel ?founderLabel ?parentLabel ?exchangeLabel ?ticker ?productLabel ?ciLabel ?typeLabel ?tw ?ig ?fb ?li ?yt ?article ?shared ?links WHERE {" +
        "{ SELECT ?c (COUNT(DISTINCT ?ind) AS ?shared) (MAX(?sl) AS ?links) WHERE { VALUES ?seed { " + S + " } " +
        "{ ?seed wdt:P452 ?ind . ?c wdt:P452 ?ind . } UNION { ?seed wdt:P31 ?ind . FILTER(?ind NOT IN (" + GENERIC + ")) ?c wdt:P31 ?ind . } UNION { BIND(?seed AS ?ind) ?c wdt:P452 ?ind . } " +
        "FILTER(?c != ?seed) " + cf + " " + lf + " ?c wikibase:sitelinks ?sl . } GROUP BY ?c ORDER BY DESC(?shared) DESC(?links) LIMIT 300 }" +
        "OPTIONAL { ?c wdt:P856 ?website . } OPTIONAL { ?c wdt:P968 ?email . } OPTIONAL { ?c wdt:P1329 ?phone . } OPTIONAL { ?c wdt:P17 ?country . }" +
        "OPTIONAL { ?c wdt:P159 ?hq . OPTIONAL { ?hq wdt:P625 ?coord . } } OPTIONAL { ?c wdt:P571 ?inception . } OPTIONAL { ?c wdt:P1128 ?employees . } OPTIONAL { ?c wdt:P2139 ?revenue . }" +
        "OPTIONAL { ?c wdt:P169 ?ceo . } OPTIONAL { ?c wdt:P112 ?founder . } OPTIONAL { ?c wdt:P749 ?parent . } OPTIONAL { ?c wdt:P414 ?exchange . } OPTIONAL { ?c p:P414/pq:P249 ?ticker . }" +
        "OPTIONAL { ?c wdt:P1056 ?product . } OPTIONAL { ?c wdt:P452 ?ci . } OPTIONAL { ?c wdt:P31 ?type . } OPTIONAL { ?c wdt:P2002 ?tw . } OPTIONAL { ?c wdt:P2003 ?ig . } OPTIONAL { ?c wdt:P2013 ?fb . }" +
        "OPTIONAL { ?c wdt:P4264 ?li . } OPTIONAL { ?c wdt:P2397 ?yt . } OPTIONAL { ?article schema:about ?c ; schema:isPartOf <https://en.wikipedia.org/> . }" +
        ' SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }';
      var seedQ = 'SELECT ?sLabel ?sDescription ?indLabel ?countryLabel ?website ?inception WHERE { BIND(' + S + ' AS ?s) OPTIONAL { ?s wdt:P452 ?ind . } OPTIONAL { ?s wdt:P17 ?country . } OPTIONAL { ?s wdt:P856 ?website . } OPTIONAL { ?s wdt:P571 ?inception . } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }';
      return Promise.all([sparql(compQ), sparql(seedQ).catch(function () { return []; })]).then(function (rr) {
        var rows = rr[0], srows = rr[1], by = {}, order = [];
        var ARR = ["websites", "emails", "phones", "countries", "hq", "industries", "types", "ceos", "founders", "parents", "exchanges", "tickers", "products"];
        rows.forEach(function (b) {
          var id = qid(val(b, "c")); if (!by[id]) { by[id] = { id: id, name: val(b, "cLabel"), description: val(b, "cDescription"), founded: "", employees: "", revenue: "", coord: "", wikipedia: "", tw: "", ig: "", fb: "", li: "", yt: "", shared: +val(b, "shared") || 0, links: +val(b, "links") || 0 }; ARR.forEach(function (k) { by[id][k] = []; }); order.push(id); }
          var o = by[id], add = function (k, v) { if (v && o[k].indexOf(v) < 0) o[k].push(v); };
          add("websites", val(b, "website")); add("emails", val(b, "email").replace(/^mailto:/, "")); add("phones", val(b, "phone").replace(/^tel:/, "")); add("countries", val(b, "countryLabel")); add("hq", val(b, "hqLabel"));
          add("industries", val(b, "ciLabel")); add("types", val(b, "typeLabel")); add("ceos", val(b, "ceoLabel")); add("founders", val(b, "founderLabel")); add("parents", val(b, "parentLabel")); add("exchanges", val(b, "exchangeLabel")); add("tickers", val(b, "ticker")); add("products", val(b, "productLabel"));
          var inc = val(b, "inception"); if (inc && (!o.founded || inc < o.founded)) o.founded = inc;
          var em = +val(b, "employees"); if (em && (!o.employees || em > o.employees)) o.employees = em;
          var rv = +val(b, "revenue"); if (rv && (!o.revenue || rv > o.revenue)) o.revenue = rv;
          ["tw", "ig", "fb", "li", "yt"].forEach(function (k) { o[k] = o[k] || val(b, k); }); o.coord = o.coord || val(b, "coord"); o.wikipedia = o.wikipedia || val(b, "article");
        });
        var res = order.map(function (id) {
          var o = by[id], pt = (o.coord.match(/Point\(([-\d.]+) ([-\d.]+)\)/) || []), j = function (a, n) { return a.filter(function (x) { return !/^Q\d+$/.test(x); }).slice(0, n || 4).join(", "); };
          return { mode: "brand", id: id, name: o.name, description: o.description, website: o.websites[0] || "", email: o.emails.join("; "), phone: o.phones.join("; "),
            country: j(o.countries), hq: j(o.hq, 2), founded: o.founded ? o.founded.slice(0, 4) : "", employees: o.employees || "", revenue: o.revenue || "", industry: j(o.industries, 3), kind: j(o.types, 3),
            ceo: j(o.ceos, 2), founders: j(o.founders, 5), parent: j(o.parents, 2), exchange: j(o.exchanges, 2), ticker: o.tickers.slice(0, 2).join(", "), products: j(o.products, 6),
            twitter: o.tw ? "https://x.com/" + o.tw : "", instagram: o.ig ? "https://instagram.com/" + o.ig : "", facebook: o.fb ? "https://facebook.com/" + o.fb : "", linkedin: o.li ? "https://www.linkedin.com/company/" + o.li : "", youtube: o.yt ? "https://www.youtube.com/channel/" + o.yt : "",
            wikipedia: o.wikipedia, wikidata: "https://www.wikidata.org/wiki/" + id, lat: pt[2] ? +pt[2] : null, lng: pt[1] ? +pt[1] : null, score: o.shared * 1000 + o.links };
        }).filter(function (x) { return x.name && !/^Q\d+$/.test(x.name); });
        var seedInfo = { id: seed.id, label: seed.label, sub: seed.sub, industries: [], country: "", website: "", founded: "" };
        srows.forEach(function (b) { var i = val(b, "indLabel"); if (i && seedInfo.industries.indexOf(i) < 0) seedInfo.industries.push(i); seedInfo.country = seedInfo.country || val(b, "countryLabel"); seedInfo.website = seedInfo.website || val(b, "website"); seedInfo.founded = seedInfo.founded || val(b, "inception").slice(0, 4); if (val(b, "sDescription")) seedInfo.sub = val(b, "sDescription"); if (val(b, "sLabel")) seedInfo.label = val(b, "sLabel"); });
        var where = [loc ? "within " + rkm + " km of " + (loc.value || blIn.value) : "", country ? cname : ""].filter(Boolean).join(", ") || "Worldwide";
        return { ok: true, mode: "brand", type: seed.label, area: where, seed: seedInfo, loc: loc, results: res, source: "wikidata" };
      });
    }).then(function (j) { show(j); }, function (e) {
      busy = false; data = null; view = [];
      setStatus(e && e.reason ? e.reason : "Wikidata did not answer right now — please try again in a minute.", "warn"); ver(e && e.message);
      list.innerHTML = '<li class="cf-empty">No results yet. Try another spelling, pick a suggestion while typing, remove the city, or search an industry such as “food delivery”.</li>';
    });
  }

  /* ================= results ================= */
  function show(j) { try { show_(j); } catch (e) { busy = false; if (window.console) console.error("[finder] render failed", e); setStatus("Could not show the results.", "warn"); ver(e.message); } }
  function show_(j) {
    busy = false; data = j; data.results.forEach(function (p, i) { p._i = i; });
    var n = j.results.length;
    if (j.mode === "local") {
      var src = j.source === "google+osm" ? "Google Maps + OpenStreetMap" : j.source === "google" ? "Google Maps" : "OpenStreetMap, with Google Maps links";
      setStatus(n ? n.toLocaleString("en-IN") + " businesses found within " + km(j.radius) + " · " + src : (j.note || "No listed businesses found. Try a bigger radius, another spelling or a nearby area."), n ? "ok" : "warn");
      setMapView("pins");
    } else {
      setStatus(n ? n + " competitors of " + j.type + " · " + j.area + " · from Wikidata" : "No competitors listed for " + j.type + " (" + j.area + "). Try a bigger radius, “Any country”, or the industry name.", n ? "ok" : "warn");
      brandCard(j.seed); setMapView("pins");
    }
    ver(j.viaServer ? "server" : "");
    $("cf-enrich").disabled = !n || !j.results.some(function (p) { return p.website; }); $("cf-enrich-s").textContent = "";
    if (n) { addToSheet(j); paint(true); } else { list.innerHTML = '<li class="cf-empty">Nothing listed here yet. Try a wider search.</li>'; $("cf-more").hidden = true; }
    pins(); insight();
  }
  filt.addEventListener("input", function () { paint(true); });
  document.querySelector(".cf-sort").addEventListener("click", function (e) {
    var b = e.target.closest("[data-sort]"); if (!b) return; sortBy = b.dataset.sort;
    this.querySelectorAll("[data-sort]").forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); paint(true);
  });
  $("cf-more-b").addEventListener("click", function () { paint(false, PAGE); });
  $("cf-all-b").addEventListener("click", function () { paint(false, 1e9); });
  list.addEventListener("click", function (e) {
    var b = e.target.closest("[data-show]"); if (!b || !data) return;
    var p = data.results[+b.dataset.show]; if (!p) return;
    if (map && p.lat != null) { setMapView("pins"); map.setView([p.lat, p.lng], Math.max(map.getZoom(), 16)); var mk = markers[p._i]; if (mk) mk.openPopup(); }
    else { setMapView("google"); frame.src = mapSrc(p.name + ", " + (p.address || p.hq || data.area), 16); }
    list.querySelectorAll(".cf-item").forEach(function (li) { li.classList.toggle("on", li.dataset.i === b.dataset.show); });
    if (matchMedia("(max-width:899px)").matches) mapBox.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  function paint(reset, more) {
    if (!data) return;
    if (reset) {
      var f = nrm(filt.value);
      view = data.results.filter(function (p) { return !f || nrm([p.name, p.address, p.description, p.country, p.hq, p.industry, p.category, p.email, p.phone].join(" ")).indexOf(f) > -1; }).slice();
      view.sort(function (a, b) {
        if (sortBy === "rating") return (b.rating || 0) - (a.rating || 0) || (b.reviews || 0) - (a.reviews || 0);
        if (sortBy === "reviews") return (b.reviews || 0) - (a.reviews || 0);
        if (sortBy === "name") return a.name.localeCompare(b.name);
        return data.mode === "local" ? (a.distance == null ? 1e12 : a.distance) - (b.distance == null ? 1e12 : b.distance) : b.score - a.score;
      });
      shown = 0; list.innerHTML = "";
      if (!view.length) { list.innerHTML = '<li class="cf-empty">No result matches “' + esc(filt.value) + "”.</li>"; $("cf-more").hidden = true; return; }
    }
    var to = Math.min(view.length, shown + (more || PAGE)), html = "";
    for (var k = shown; k < to; k++) html += data.mode === "local" ? localItem(view[k], k) : brandItem(view[k], k);
    list.insertAdjacentHTML("beforeend", html); shown = to;
    var left = view.length - shown; $("cf-more").hidden = left <= 0;
    $("cf-more-b").textContent = "Show " + Math.min(PAGE, left) + " more"; $("cf-all-b").textContent = "Show all " + view.length.toLocaleString("en-IN");
  }
  var link = function (u, t, cls) { return u ? '<a class="btn sm ' + (cls || "ghost") + '" href="' + esc(href(u)) + '" target="_blank" rel="noopener noreferrer nofollow">' + t + "</a>" : ""; };
  function contacts(p) {
    var c = [];
    if (p.phone) c.push(["Phone", String(p.phone).split(/;\s*/).map(function (x) { return '<a href="tel:' + esc(x.replace(/[^\d+]/g, "")) + '">' + esc(x) + "</a>"; }).join(", ")]);
    if (p.mobile) c.push(["Mobile", '<a href="tel:' + esc(p.mobile.replace(/[^\d+]/g, "")) + '">' + esc(p.mobile) + "</a>"]);
    if (p.whatsapp) c.push(["WhatsApp", '<a href="https://wa.me/' + esc(String(p.whatsapp).split(/[;,]/)[0].replace(/\D/g, "")) + '" target="_blank" rel="noopener noreferrer">' + esc(p.whatsapp) + "</a>"]);
    if (p.email) c.push(["Email", String(p.email).split(/;\s*/).map(function (x) { return '<a href="mailto:' + esc(x) + '">' + esc(x) + "</a>"; }).join(", ")]);
    if (p.hours) c.push(["Hours", esc(p.hours)]);
    var soc = [["Instagram", p.instagram], ["Facebook", p.facebook], ["LinkedIn", p.linkedin], ["X", p.twitter], ["YouTube", p.youtube]].filter(function (s) { return s[1]; });
    if (soc.length) c.push(["Social", soc.map(function (s) { return '<a href="' + esc(href(s[1])) + '" target="_blank" rel="noopener noreferrer nofollow">' + s[0] + "</a>"; }).join(" · ")]);
    return c.length ? '<dl class="cf-contacts">' + c.map(function (x) { return "<div><dt>" + x[0] + "</dt><dd>" + x[1] + "</dd></div>"; }).join("") + "</dl>" : "";
  }
  function localItem(p, k) {
    var rate = p.rating != null ? '<span class="cf-rate" aria-label="Rated ' + p.rating + ' out of 5"><b>' + (+p.rating).toFixed(1) + '</b> <span aria-hidden="true">' + stars(p.rating) + '</span> <span class="muted">(' + (p.reviews || 0).toLocaleString("en-IN") + " reviews)</span></span>" : "";
    var extra = [p.price, p.cuisine && "Cuisine: " + p.cuisine, p.brand && p.brand !== p.name && "Brand: " + p.brand].filter(Boolean).join(" · ");
    var flags = (p.open === true ? '<span class="cf-flag ok">Open now</span>' : p.open === false ? '<span class="cf-flag">Closed now</span>' : "") + (!p.website ? '<span class="cf-flag warn">No website listed</span>' : "") + (p.status && p.status !== "OPERATIONAL" ? '<span class="cf-flag">' + esc(p.status.replace(/_/g, " ").toLowerCase()) + "</span>" : "");
    return '<li class="cf-item" data-i="' + p._i + '"><span class="cf-n">' + (k + 1) + '</span><div class="cf-body"><h3>' + esc(p.name) + "</h3>" +
      '<p class="cf-meta"><span class="cf-cat">' + esc(p.category || "") + "</span>" + (p.category && p.distance != null ? " · " : "") + km(p.distance) + "</p>" + (p.address ? '<p class="cf-addr">' + esc(p.address) + "</p>" : "") + rate +
      (extra ? '<p class="cf-addr">' + esc(extra) + "</p>" : "") + contacts(p) + (flags ? '<p class="cf-flags">' + flags + "</p>" : "") +
      '<div class="cf-acts"><a class="btn sm" href="' + esc(p.mapsUrl) + '" target="_blank" rel="noopener noreferrer">Google Maps ↗</a><button type="button" class="btn sm ghost" data-show="' + p._i + '">Show on map</button>' +
      (p.lat != null ? '<a class="btn sm ghost" href="https://www.google.com/maps/dir/?api=1&amp;destination=' + p.lat + "," + p.lng + '" target="_blank" rel="noopener noreferrer">Directions</a>' : "") +
      link(p.website, "Website") + "</div></div></li>";
  }
  function brandItem(p, k) {
    var facts = [p.kind && ["Type", p.kind], p.country && ["Country", p.country], p.hq && ["HQ", p.hq], p.founded && ["Founded", p.founded], p.employees && ["Employees", (+p.employees).toLocaleString("en-IN")],
      p.ceo && ["CEO", p.ceo], p.founders && ["Founders", p.founders], p.parent && ["Parent", p.parent], p.ticker && ["Ticker", p.ticker + (p.exchange ? " (" + p.exchange + ")" : "")], p.products && ["Products", p.products]].filter(Boolean);
    return '<li class="cf-item" data-i="' + p._i + '"><span class="cf-n">' + (k + 1) + '</span><div class="cf-body"><h3>' + esc(p.name) + "</h3>" +
      (p.industry ? '<p class="cf-meta"><span class="cf-cat">' + esc(p.industry) + "</span></p>" : "") + (p.description ? '<p class="cf-addr">' + esc(p.description) + "</p>" : "") +
      (facts.length ? '<dl class="cf-facts">' + facts.map(function (f) { return "<div><dt>" + f[0] + "</dt><dd>" + esc(f[1]) + "</dd></div>"; }).join("") + "</dl>" : "") + contacts(p) +
      (!p.website ? '<p class="cf-flags"><span class="cf-flag warn">No website listed</span></p>' : "") +
      '<div class="cf-acts">' + link(p.website, "Website ↗", "") + link(p.wikipedia, "Wikipedia") +
      '<a class="btn sm ghost" href="https://www.google.com/search?q=' + encodeURIComponent(p.name + " company") + '" target="_blank" rel="noopener noreferrer">Google it</a>' +
      (p.linkedin ? "" : '<a class="btn sm ghost" href="https://www.linkedin.com/search/results/companies/?keywords=' + encodeURIComponent(p.name) + '" target="_blank" rel="noopener noreferrer">LinkedIn</a>') +
      (p.lat != null ? '<button type="button" class="btn sm ghost" data-show="' + p._i + '">Show HQ on map</button>' : "") + "</div></div></li>";
  }
  function brandCard(s) {
    if (!s) { card.hidden = true; return; }
    card.hidden = false;
    var ind = s.industries[0] || s.label;
    card.innerHTML = '<span class="tag">YOUR SEARCH</span><h3>' + esc(s.label) + "</h3>" + (s.sub ? '<p class="muted">' + esc(s.sub) + "</p>" : "") +
      '<dl class="cf-facts">' + (s.industries.length ? "<div><dt>Industry</dt><dd>" + esc(s.industries.slice(0, 3).join(", ")) + "</dd></div>" : "") + (s.country ? "<div><dt>Country</dt><dd>" + esc(s.country) + "</dd></div>" : "") + (s.founded ? "<div><dt>Founded</dt><dd>" + esc(s.founded) + "</dd></div>" : "") + "</dl>" +
      '<div class="btn-row" style="margin:12px 0 0">' + (s.website ? link(s.website, "Website ↗") : "") + '<button type="button" class="btn sm" id="cf-tolocal" data-type="' + esc(ind) + '">Find local ' + esc(ind) + " businesses on a map</button></div>";
    $("cf-tolocal").addEventListener("click", function () { tIn.value = this.dataset.type; if (data && data.loc) { aIn.value = data.loc.value || blIn.value; coords = { lat: data.loc.lat, lng: data.loc.lng }; place = data.loc; R1.set(R2.km()); } setMode("local", true); });
  }
  function insight() {
    if (!data) return;
    var r = data.results, n = r.length;
    if (!n) { read.textContent = data.mode === "local" ? "No listed competitors here — a strong Google Business Profile could make you the first name people see." : "No competitors listed — try the industry name, a bigger radius or another country."; return; }
    if (data.mode === "local") {
      var rated = r.filter(function (p) { return p.rating != null; }), noWeb = r.filter(function (p) { return !p.website; }).length, withMail = r.filter(function (p) { return p.email; }).length, withPhone = r.filter(function (p) { return p.phone || p.mobile; }).length;
      var avg = rated.length ? rated.reduce(function (s, p) { return s + p.rating; }, 0) / rated.length : null;
      var top = rated.slice().sort(function (a, b) { return (b.reviews || 0) - (a.reviews || 0); })[0];
      var near = r.filter(function (p) { return p.distance != null && p.distance <= 1000; }).length;
      var dens = n / (Math.PI * Math.pow(data.radius / 1000, 2));
      read.innerHTML = "<b>" + n.toLocaleString("en-IN") + "</b> " + esc(String(data.type).toLowerCase()) + " listings within " + km(data.radius) + " — about <b>" + (dens >= 1 ? dens.toFixed(1) : dens.toFixed(2)) + " per km²</b>." + (near ? " " + near + " are within 1 km." : "") +
        (avg != null ? " Average Google rating: <b>" + avg.toFixed(1) + "★</b>." : "") + (top ? " Most reviewed: <b>" + esc(top.name) + "</b> (" + (top.reviews || 0).toLocaleString("en-IN") + " reviews)." : "") +
        " Listed contacts: <b>" + withPhone + "</b> with a phone, <b>" + withMail + "</b> with an email, <b>" + (n - noWeb) + "</b> with a website" + (noWeb / n > 0.4 ? " — most have no website, so a good, fast site is an easy edge." : ".") + (n - noWeb ? " Tap <b>Find emails &amp; socials</b> to read their websites." : "");
    } else {
      var cc = {}; r.forEach(function (p) { (p.country || "Unknown").split(", ").forEach(function (c) { cc[c] = (cc[c] || 0) + 1; }); });
      var topC = Object.keys(cc).sort(function (a, b) { return cc[b] - cc[a]; }).slice(0, 3).map(function (c) { return esc(c) + " (" + cc[c] + ")"; }).join(", ");
      var yrs = r.map(function (p) { return +p.founded; }).filter(Boolean).sort(function (a, b) { return a - b; }), med = yrs.length ? yrs[Math.floor(yrs.length / 2)] : null;
      var young = yrs.filter(function (y) { return y >= new Date().getFullYear() - 10; }).length;
      read.innerHTML = "<b>" + n + "</b> companies compete in the same space as <b>" + esc(data.type) + "</b>. Most are in " + topC + "." + (med ? " Typical founding year: <b>" + med + "</b>" + (young ? "; " + young + " were founded in the last 10 years — the market is still moving." : ".") : "") +
        " Start with the top five: compare positioning, pricing page and the channels they lead with.";
    }
  }

  /* ================= map with every competitor (Leaflet + OpenStreetMap tiles) ================= */
  var map = null, layer = null, markers = {}, leaflet = null;
  function loadLeaflet() {
    if (window.L && window.L.map) return Promise.resolve(window.L);
    return leaflet = leaflet || new Promise(function (res, rej) {
      var css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"; document.head.appendChild(css);
      var s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"; s.onload = function () { res(window.L); }; s.onerror = rej; document.head.appendChild(s);
    });
  }
  function clearPins() { if (layer) layer.clearLayers(); markers = {}; }
  function pins() {
    var pts = (data && data.results || []).filter(function (p) { return p.lat != null && isFinite(p.lat); });
    if (!pts.length) { setMapView("google"); return; }
    loadLeaflet().then(function (L) {
      if (!map) {
        map = L.map(pinsEl, { preferCanvas: true, scrollWheelZoom: false, worldCopyJump: true, zoomControl: false }); L.control.zoom({ position: "bottomright" }).addTo(map);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
        layer = L.layerGroup().addTo(map);
      }
      clearPins();
      var accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#5B3DF5";
      pts.forEach(function (p) {
        var m = L.circleMarker([p.lat, p.lng], { radius: 6, color: "#fff", weight: 1.5, fillColor: accent, fillOpacity: .9 });
        m.bindPopup("<b>" + esc(p.name) + "</b><br>" + esc(p.category || p.industry || "") + (p.address ? "<br>" + esc(p.address) : p.hq ? "<br>HQ: " + esc(p.hq) : "") + (p.phone ? "<br>" + esc(p.phone) : "") + (p.website ? '<br><a href="' + esc(href(p.website)) + '" target="_blank" rel="noopener">Website</a>' : "") + (p.mapsUrl ? ' · <a href="' + esc(p.mapsUrl) + '" target="_blank" rel="noopener">Google Maps</a>' : ""));
        m.addTo(layer); markers[p._i] = m;
      });
      if (data.mode === "local" && data.center) { L.circle([data.center.lat, data.center.lng], { radius: data.radius, color: accent, weight: 1, fill: false, dashArray: "4 6" }).addTo(layer); }
      setTimeout(function () { map.invalidateSize(); map.fitBounds(L.latLngBounds(pts.map(function (p) { return [p.lat, p.lng]; })).pad(0.08), { maxZoom: 16 }); }, 60);
    }, function () { setMapView("google"); });
  }
  function setMapView(v) {
    var pinsOk = v === "pins";
    pinsEl.hidden = !pinsOk; frame.hidden = pinsOk;
    document.querySelectorAll(".cf-maptabs [data-map]").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.map === v); });
    if (pinsOk && map) setTimeout(function () { map.invalidateSize(); }, 30);
  }
  document.querySelector(".cf-maptabs").addEventListener("click", function (e) { var b = e.target.closest("[data-map]"); if (!b) return; setMapView(b.dataset.map); if (b.dataset.map === "pins" && !map) pins(); });
  setMapView("google");

  /* ================= contacts from each competitor's own website ================= */
  $("cf-enrich").addEventListener("click", function () {
    if (!data) return;
    var b = this, st = $("cf-enrich-s"), todo = data.results.filter(function (p) { return p.website && !p._enriched; });
    if (!todo.length) { st.textContent = "All websites already checked."; return; }
    b.disabled = true; var done = 0, found = 0, BATCH = 4, stop = false;
    var step = function (i) {
      if (i >= todo.length || stop) { b.disabled = false; st.textContent = "Done — checked " + done + " websites, found new contact details for " + found + "."; refreshSheet(); paint(true); return; }
      var batch = todo.slice(i, i + BATCH);
      st.textContent = "Reading websites… " + done + " of " + todo.length + (found ? " · " + found + " with new details" : "");
      fetchT(ROOT + "api/enrich", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ urls: batch.map(function (p) { return href(p.website); }) }) }, 30000)
        .then(function (r) { return r.json(); }).then(function (j) {
          if (!j.ok) { st.textContent = j.reason || "Website reader is busy — try again later."; stop = true; return; }
          batch.forEach(function (p) {
            var x = j.results[href(p.website)] || {}; p._enriched = true; done++; if (x.error) return; var before = JSON.stringify([p.email, p.phone, p.instagram, p.facebook, p.linkedin, p.twitter, p.youtube, p.whatsapp]);
            var join = function (a, b) { return a.concat(b).filter(function (v, i, arr) { return v && arr.indexOf(v) === i; }).join("; "); };
            p.email = join(String(p.email || "").split(/;\s*/), x.emails || []); p.phone = join(String(p.phone || "").split(/;\s*/), x.phones || []); p.whatsapp = join(String(p.whatsapp || "").split(/;\s*/), x.whatsapp || []);
            ["instagram", "facebook", "linkedin", "twitter", "youtube"].forEach(function (k) { p[k] = p[k] || x[k] || ""; });
            p.siteTitle = x.title || ""; p.siteDescription = x.description || ""; p.contactPage = x.contactPage || "";
            if (JSON.stringify([p.email, p.phone, p.instagram, p.facebook, p.linkedin, p.twitter, p.youtube, p.whatsapp]) !== before) found++;
          });
        }, function () { done += batch.length; }).then(function () { step(i + BATCH); });
    };
    step(0);
  });

  /* ================= one sheet for every search + export (every column) ================= */
  var SHEET_KEY = "fodo-cf-sheet2", sheet = LS.get(SHEET_KEY, { local: [], brand: [], searches: [] });
  var LOCAL_COLS = [["Search", "search"], ["Name", "name"], ["Category", "category"], ["Address", "address"], ["Street", "street"], ["Locality", "locality"], ["City", "city"], ["State", "state"], ["Postcode", "postcode"], ["Country", "country"],
    ["Phone", "phone"], ["International phone", "intlPhone"], ["Mobile", "mobile"], ["WhatsApp", "whatsapp"], ["Email", "email"], ["Website", "website"], ["Contact page", "contactPage"],
    ["Instagram", "instagram"], ["Facebook", "facebook"], ["LinkedIn", "linkedin"], ["X / Twitter", "twitter"], ["YouTube", "youtube"],
    ["Rating", "rating"], ["Reviews", "reviews"], ["Price", "price"], ["Open now", "openTxt"], ["Opening hours", "hours"], ["Business status", "status"], ["Google types", "types"],
    ["Brand", "brand"], ["Operator", "operator"], ["Cuisine", "cuisine"], ["Payment", "payment"], ["Delivery", "delivery"], ["Takeaway", "takeaway"], ["Wheelchair", "wheelchair"], ["Established", "established"], ["Description", "description"],
    ["Website title", "siteTitle"], ["Website description", "siteDescription"], ["Distance (km)", "km"], ["Latitude", "lat"], ["Longitude", "lng"], ["Google Maps", "mapsUrl"], ["OpenStreetMap", "osmUrl"], ["Wikidata", "wikidata"], ["Source", "source"], ["All OSM tags", "tags"]];
  var BRAND_COLS = [["Search", "search"], ["Company", "name"], ["Description", "description"], ["Industry", "industry"], ["Type", "kind"], ["Country", "country"], ["Headquarters", "hq"], ["Founded", "founded"], ["Employees", "employees"], ["Revenue", "revenue"],
    ["CEO", "ceo"], ["Founders", "founders"], ["Parent company", "parent"], ["Stock exchange", "exchange"], ["Ticker", "ticker"], ["Products / services", "products"],
    ["Website", "website"], ["Email", "email"], ["Phone", "phone"], ["WhatsApp", "whatsapp"], ["Contact page", "contactPage"], ["LinkedIn", "linkedin"], ["Instagram", "instagram"], ["Facebook", "facebook"], ["X / Twitter", "twitter"], ["YouTube", "youtube"],
    ["Website title", "siteTitle"], ["Website description", "siteDescription"], ["Wikipedia", "wikipedia"], ["Wikidata", "wikidata"], ["HQ latitude", "lat"], ["HQ longitude", "lng"]];
  function rowOf(j, p, label) {
    var o = { search: label };
    (j.mode === "local" ? LOCAL_COLS : BRAND_COLS).forEach(function (c) { if (c[1] !== "search") o[c[1]] = p[c[1]] == null ? "" : p[c[1]]; });
    if (j.mode === "local") { o.openTxt = p.open === true ? "Yes" : p.open === false ? "No" : ""; o.km = p.distance == null ? "" : +(p.distance / 1000).toFixed(2); }
    o.key = j.mode === "local" ? nrm(p.name) + "|" + (p.lat != null ? (+p.lat).toFixed(4) + "," + (+p.lng).toFixed(4) : nrm(p.address)) : p.id;
    return o;
  }
  function addToSheet(j) {
    var label = j.mode === "local" ? j.type + " · " + (j.radius / 1000) + " km of " + (j.area || "you") : j.type + " · " + j.area, arr = sheet[j.mode], idx = {};
    arr.forEach(function (x, i) { idx[x.key] = i; });
    var added = 0;
    j.results.forEach(function (p) { var r = rowOf(j, p, label); p._key = r.key; if (idx[r.key] != null) return; idx[r.key] = arr.length; arr.push(r); added++; });
    if (sheet.searches.indexOf(label) < 0) sheet.searches.push(label);
    saveSheet(); sheetUI(added);
  }
  function refreshSheet() {   // after "Find emails & socials" — write the new fields into the sheet rows
    if (!data) return; var arr = sheet[data.mode], idx = {}; arr.forEach(function (x, i) { idx[x.key] = i; });
    data.results.forEach(function (p) { var i = idx[p._key]; if (i == null) return; var r = rowOf(data, p, arr[i].search); arr[i] = r; });
    saveSheet(); sheetUI(0);
  }
  function saveSheet() { if (!LS.set(SHEET_KEY, sheet)) { var slim = JSON.parse(JSON.stringify(sheet)); ["local"].forEach(function (k) { slim[k].forEach(function (r) { r.tags = ""; }); }); if (!LS.set(SHEET_KEY, slim)) $("cf-sheet-n").textContent += " (too big to keep after reload — download it now)"; } }
  function sheetUI(added) {
    var n = sheet.local.length + sheet.brand.length;
    $("cf-sheet-n").textContent = n ? n.toLocaleString("en-IN") + " competitors from " + sheet.searches.length + (sheet.searches.length === 1 ? " search" : " searches") + (added ? " · " + added.toLocaleString("en-IN") + " new just added" : "") + " — download them all at once." : "Empty — every search you run is added here.";
    ["cf-x-xlsx", "cf-x-csv", "cf-x-copy", "cf-x-clear"].forEach(function (id) { $(id).disabled = !n; });
    $("cf-sheet").classList.toggle("has", !!n);
  }
  sheetUI(0);
  var cell = function (v) { v = v == null ? "" : String(v); if (/^[=@\t\r]/.test(v) || (/^[+\-]/.test(v) && !/^[+\-][\d\s().;+\-]*$/.test(v))) v = "'" + v; return v; };   // stop spreadsheet formula injection (phone numbers like +91… stay as they are)
  function rowsFor(kind) { var cols = kind === "local" ? LOCAL_COLS : BRAND_COLS; return [cols.map(function (c) { return c[0]; })].concat(sheet[kind].map(function (x) { return cols.map(function (c) { var v = x[c[1]]; return typeof v === "number" ? v : cell(v); }); })); }
  function stamp() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function download(name, blob) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800); }
  function toCSV() {
    var out = [];
    ["local", "brand"].forEach(function (k) { if (!sheet[k].length) return; if (out.length) out.push([]); out.push([k === "local" ? "LOCAL COMPETITORS" : "BRAND & STARTUP COMPETITORS"]); rowsFor(k).forEach(function (r) { out.push(r); }); });
    return out.map(function (r) { return r.map(function (v) { v = String(v == null ? "" : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\r\n");
  }
  $("cf-x-csv").addEventListener("click", function () { download("FODO-competitors-" + stamp() + ".csv", new Blob(["﻿" + toCSV()], { type: "text/csv;charset=utf-8" })); flash(this, "Downloaded ✓"); });
  $("cf-x-copy").addEventListener("click", function () {
    var b = this, out = [];
    ["local", "brand"].forEach(function (k) { if (!sheet[k].length) return; if (out.length) out.push(""); rowsFor(k).forEach(function (r) { out.push(r.map(function (v) { return String(v == null ? "" : v).replace(/[\t\r\n]+/g, " "); }).join("\t")); }); });
    var t = out.join("\n");
    (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { flash(b, "Copied — paste into Google Sheets ✓"); }, function () { if (U.copy) U.copy(t, b); });
  });
  $("cf-x-clear").addEventListener("click", function () { if (!confirm("Clear all " + (sheet.local.length + sheet.brand.length) + " competitors from your sheet?")) return; sheet = { local: [], brand: [], searches: [] }; saveSheet(); sheetUI(0); });
  function flash(b, t) { var o = b.textContent; b.textContent = t; setTimeout(function () { b.textContent = o; }, 2200); }
  var xlsxLib = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return xlsxLib = xlsxLib || new Promise(function (res, rej) { var s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload = function () { res(window.XLSX); }; s.onerror = rej; document.head.appendChild(s); });
  }
  $("cf-x-xlsx").addEventListener("click", function () {
    var b = this; b.disabled = true; var o = b.textContent; b.textContent = "Preparing…";
    loadXLSX().then(function (X) {
      var wb = X.utils.book_new();
      var sum = [["FODO Competitor Sheet"], ["Exported", new Date().toLocaleString()], ["Local competitors", sheet.local.length], ["Brand & startup competitors", sheet.brand.length], [], ["Searches"]].concat(sheet.searches.map(function (s) { return [s]; }));
      X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(sum), "Summary");
      [["local", "Local competitors"], ["brand", "Brands & startups"]].forEach(function (k) { if (!sheet[k[0]].length) return; var rows = rowsFor(k[0]), ws = X.utils.aoa_to_sheet(rows); ws["!cols"] = rows[0].map(function (h) { return { wch: /tags|description/i.test(h) ? 60 : Math.max(12, Math.min(40, h.length + 14)) }; }); ws["!autofilter"] = { ref: ws["!ref"] }; ws["!freeze"] = { xSplit: 2, ySplit: 1 }; X.utils.book_append_sheet(wb, ws, k[1]); });
      X.writeFile(wb, "FODO-competitors-" + stamp() + ".xlsx");
      b.textContent = "Downloaded ✓";
    }, function () { download("FODO-competitors-" + stamp() + ".csv", new Blob(["﻿" + toCSV()], { type: "text/csv;charset=utf-8" })); b.textContent = "Excel unavailable — saved CSV"; })
      .then(function () { setTimeout(function () { b.textContent = o; b.disabled = false; }, 2200); });
  });
  window.FODO_CF = { pins: function () { return Object.keys(markers).length; }, sheet: function () { return sheet; }, csv: toCSV, rows: rowsFor, data: function () { return data; }, radius: function () { return [R1.km(), R2.km()]; } };

  /* ================= start ================= */
  if (location.hash === "#brands") setMode("brand"); else setMode("local");
  if (qs.get("brand")) { setMode("brand"); bIn.value = qs.get("brand"); runBrand(); }
  else if (tIn.value.trim() && aIn.value.trim() && qs.get("type")) run();
})();
