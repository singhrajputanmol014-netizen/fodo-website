/* FODO Competitor Finder v11 — /competitor-finder/
   v11 engine: every source runs at the same time and results appear as each one answers (chips show each source):
     local  → OpenStreetMap through this site's cached proxy (/api/osm, then the public servers, then Photon)
              + Geoapify (/api/geo, when GEOAPIFY_KEY is set) + Google Maps (/api/competitors, when GOOGLE_PLACES_KEY is set)
     brands → Wikidata same-industry + Wikidata similar-description + AI suggestions (/api/brand-ai, Workers AI) checked on Wikidata;
              a brand that is not on Wikidata still gets competitors. Exports: js/cf-export.js (own Excel writer, phone-safe download).
   (v8 notes below)
   • Local businesses: any business type near any place on earth, radius 0.5–100 km (slider or typed).
     Every listed business is returned (no cap) from OpenStreetMap, searched straight from this browser (js/free-places.js);
     when the site has a Google Places key, Google results (up to 60, or more with "Deep Google search" tiles) are merged in.
   • Brands & startups: competitors of any company or industry from Wikidata — optionally only those headquartered near a city.
   • Every record carries every field we can find (phones, email, website, socials, hours, address parts, tags, HQ, founders …),
     and "Find emails & socials" reads each competitor's own website (/api/enrich) to fill in contacts.
   • Every search is added to one sheet in this browser → Excel (one row per competitor, every column), CSV or Google Sheets. */
(function () {
  "use strict";
  window.FODO_CF_VERSION = "11";
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
  var track = function (n, p) { try { if (window.FODO_TRACK) window.FODO_TRACK(n, p || {}); } catch (e) {} };
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
    .then(function (h) { google = !!h.google; $("cf-deep-wrap").hidden = !google; return h || {}; });

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
  /* ---- source chips: what each source is doing right now ---- */
  var SRC_LABEL = { osm: "OpenStreetMap", geo: "Geoapify", google: "Google Maps", wd: "Wikidata industry", kw: "Wikidata keywords", ai: "AI suggestions" };
  var srcs = {};
  function chips(list) {
    var el = $("cf-srcs"); if (!el) { el = document.createElement("p"); el.id = "cf-srcs"; el.className = "cf-srcs"; el.setAttribute("aria-live", "polite"); status.parentNode.insertBefore(el, status.nextSibling); }
    srcs = {}; list.forEach(function (k) { srcs[k] = { s: "wait", t: "" }; }); paintChips();
  }
  function chip(k, s, t) { if (!srcs[k]) return; srcs[k] = { s: s, t: t || "" }; paintChips(); }
  function paintChips() {
    var el = $("cf-srcs"); if (!el) return;
    el.innerHTML = Object.keys(srcs).map(function (k) { var x = srcs[k]; return '<span class="cf-src ' + x.s + '"><i aria-hidden="true"></i>' + SRC_LABEL[k] + (x.t ? " · " + esc(x.t) : x.s === "wait" ? " · searching…" : "") + "</span>"; }).join("");
    el.hidden = !Object.keys(srcs).length;
  }
  var gmark = function (list) { (list || []).forEach(function (p) { var g = {}; Object.keys(p).forEach(function (k) { if (!/^(name|mapsUrl|source|id|_.*|distance)$/.test(k) && p[k] !== "" && p[k] != null && typeof p[k] !== "object") g[k] = p[k]; }); p._gf = g; }); return list; };
  /* Geoapify (only when this site has a GEOAPIFY_KEY): 500 places a page, up to 4 pages for big circles */
  function geoAll(m, type, c, rm) {
    var g = m.geoCats(type), out = [], pages = rm > 20000 ? 4 : rm > 5000 ? 3 : 2;
    var page = function (i) {
      var u = ROOT + "api/geo?cat=" + g.cat + (g.name ? "&name=" + encodeURIComponent(g.name) : "") + "&lat=" + (+c.lat).toFixed(5) + "&lng=" + (+c.lng).toFixed(5) + "&radius=" + rm + "&offset=" + i * 500;
      return fetchT(u, { headers: { accept: "application/json" } }, 25000).then(function (r) { if (!r.ok) throw new Error("geoapify " + r.status); return r.json(); }).then(function (j) {
        var f = (j.features || []).map(m.fromGeoapify).filter(Boolean); out = out.concat(f);
        if (f.length >= 500 && i + 1 < pages) return page(i + 1);
      });
    };
    return page(0).then(function () { return out; }, function (e) { if (out.length) return out; throw e; });
  }
  function run() {
    var type = tIn.value.trim(), area = aIn.value.trim(), rm = R1.m();
    if (!type) { setStatus("Type a business type, for example “Cafe” or “Software company”.", "warn"); tIn.focus(); return; }
    if (!area && !coords) { setStatus("Type a place — any city, area or address — or use your location.", "warn"); aIn.focus(); return; }
    if (busy) return; busy = true; ver();
    var where = coords ? (area && area !== "Near me" ? area : "you") : area, areaQ = area === "Near me" ? "" : area;
    frame.src = mapSrc(type + " near " + (coords ? coords.lat + "," + coords.lng : area), rm > 20000 ? 10 : rm > 5000 ? 12 : 14);
    LS.set("fodo-cf", { t: type, a: areaQ, km: R1.km(), lat: place ? place.lat : undefined, lng: place ? place.lng : undefined });
    setStatus("Searching every " + type.toLowerCase() + " within " + R1.km() + " km of " + where + "… results appear as each source answers.", "busy");
    list.innerHTML = '<li class="cf-empty">Looking up ' + esc(type) + " near " + esc(where) + "…</li>"; $("cf-more").hidden = true;
    var deep = $("cf-deep").checked, t0 = Date.now();
    track("cf_search", { mode: "local", type: type, km: R1.km() });
    Promise.all([lib(), health]).then(function (r0) {
      var m = r0[0], h = r0[1] || {};
      chips(["osm"].concat(h.geoapify ? ["geo"] : [], google ? ["google"] : []));
      var F = m.freePlaces(fetchT, {}, { proxy: ROOT + "api/osm" });
      var center = coords ? Promise.resolve(coords) : F.geocode(areaQ);
      return center.then(function (c) {
        if (!c) throw Object.assign(new Error("place"), { reason: "That place was not found. Pick one from the suggestions while typing." });
        var job = { ok: true, mode: "local", type: type, area: areaQ || "your location", radius: rm, center: { lat: c.lat, lng: c.lng }, results: [], source: "" };
        var pools = { osm: [], geo: [], google: [] }, fails = [];
        var merged = function () {
          var free = m.dedupe(pools.osm.concat(pools.geo)), res = pools.google.length ? m.mergeSources(m.dedupe(pools.google), free) : free;
          res.forEach(function (p) { p.distance = m.dist(c, p); if (p._gf && p.source === "OpenStreetMap") p.source = "Google Maps + OpenStreetMap"; });
          return res.filter(function (p) { return p.distance <= rm * 1.05; }).sort(function (a, b) { return a.distance - b.distance; });
        };
        var srcName = function () { return [pools.google.length && "Google Maps", pools.osm.length && "OpenStreetMap", pools.geo.length && "Geoapify"].filter(Boolean).join(" + ") || "OpenStreetMap"; };
        var update = function () { if (!busy) return; var res = merged(); if (!res.length) return; job.results = res; job.source = srcName(); show(job, true); };
        var task = function (k, p) {
          return p.then(function (list) { pools[k] = list || []; chip(k, pools[k].length ? "ok" : "empty", pools[k].length ? pools[k].length.toLocaleString("en-IN") + " found" : "none listed"); update(); },
            function (e) { fails.push(k + ": " + (e && (e.tried ? e.tried.join(", ") : e.message) || "failed")); chip(k, "fail", "did not answer"); });
        };
        var jobs = [task("osm", F.search({ type: type, area: areaQ, center: { lat: c.lat, lng: c.lng }, radius: rm }).then(function (r) { return r.results; }))];
        if (h.geoapify) jobs.push(task("geo", geoAll(m, type, c, rm)));
        if (google) jobs.push(task("google", googleAll(type, areaQ, c, rm, deep).then(function (g) { return g ? gmark(g.results) : []; })));
        return Promise.all(jobs).then(function () {
          var res = merged();
          if (!res.length && fails.length === jobs.length) {
            // every source failed in this browser — last try: the server route (it may reach the map servers when this browser can't)
            return api({ type: type, area: areaQ, lat: c.lat, lng: c.lng, radius: rm }, 60000).then(function (j) {
              if (j && j.ok && j.results && j.results.length) { if (j.source === "google") gmark(j.results); return Object.assign(j, { mode: "local", viaServer: true, center: j.center || job.center }); }
              throw Object.assign(new Error("all"), { reason: "The free map servers did not answer right now. Please try again in a minute.", diag: fails.join(" | ") });
            });
          }
          job.results = res; job.source = srcName(); job.ms = Date.now() - t0; return job;
        });
      });
    }).then(function (j) { show(j); }, function (e) {
      busy = false; data = null; view = [];
      var q = type + " near " + (coords ? coords.lat + "," + coords.lng : area);
      setStatus((e && e.reason) || "Something went wrong — please try again.", "warn"); ver(e && (e.diag || e.message));
      list.innerHTML = '<li class="cf-empty">The Google Maps view on this page still shows businesses for your search. <a href="https://www.google.com/maps/search/' + encodeURIComponent(q) + '" target="_blank" rel="noopener noreferrer">Open the full list on Google Maps ↗</a></li>';
      setMapView("google"); track("cf_fail", { mode: "local" });
    });
  }

  /* ================= brand & startup search (Wikidata — fast search API, no heavy SPARQL) =================
     1. find the company / industry (wbsearchentities)   2. read its industries + types (wbgetentities)
     3. find other companies with the same industry/type (CirrusSearch haswbstatement — answers in ~1 s)
     4. read every competitor's details in batches of 50 (wbgetentities)  5. names for countries, HQs, people (labels)
     6. optional: keep only companies headquartered within the radius of the chosen city
     7. then each website (and Google Maps, when connected) is read for contacts — see "contacts" below */
  bform.addEventListener("click", function (e) { var b = e.target.closest(".chip[data-brand]"); if (!b) return; bIn.value = b.dataset.brand; brandPick = null; runBrand(); });
  bform.addEventListener("submit", function (e) { e.preventDefault(); runBrand(); });
  var WAPI = "https://www.wikidata.org/w/api.php?format=json&origin=*&";
  var wget = function (params, ms) { return fetchT(WAPI + params, {}, ms || 20000).then(function (r) { if (!r.ok) throw new Error("wikidata " + r.status); return r.json(); }); };
  var GENERIC = { Q4830453: 1, Q783794: 1, Q6881511: 1, Q891723: 1, Q43229: 1, Q167037: 1, Q1589009: 1, Q18388277: 1, Q155076: 1, Q219577: 1, Q658255: 1, Q778575: 1, Q431289: 1, Q1137109: 1, Q163740: 1, Q2659904: 1, Q4120211: 1, Q5621421: 1, Q1664720: 1, Q15911314: 1, Q3918: 1, Q31855: 1, Q7210356: 1, Q21980538: 1, Q35127: 1, Q620615: 1, Q19967801: 1, Q1032372: 1, Q15633587: 1, Q60747379: 1, Q131524: 1, Q1153191: 1, Q484652: 1, Q2085381: 1, Q1616075: 1, Q7275: 1, Q1137109: 1, Q11032: 1, Q7397: 1, Q1668024: 1, Q166142: 1 };
  function claimVals(ent, p) {
    var cs = (ent.claims || {})[p] || []; var pref = cs.filter(function (c) { return c.rank === "preferred"; }); cs = (pref.length ? pref : cs).filter(function (c) { return c.rank !== "deprecated" && c.mainsnak && c.mainsnak.datavalue; });
    return cs.map(function (c) { var v = c.mainsnak.datavalue.value; return { v: v, q: c.qualifiers || {} }; });
  }
  var ids = function (ent, p) { return claimVals(ent, p).map(function (x) { return x.v && x.v.id; }).filter(Boolean); };
  var strs = function (ent, p) { return claimVals(ent, p).map(function (x) { return typeof x.v === "string" ? x.v : ""; }).filter(Boolean); };
  var num = function (ent, p) { var a = claimVals(ent, p).map(function (x) { return x.v && x.v.amount ? +x.v.amount : NaN; }).filter(isFinite); return a.length ? Math.max.apply(null, a) : ""; };
  var year = function (ent, p) { var a = claimVals(ent, p).map(function (x) { return x.v && x.v.time ? x.v.time.slice(1, 5) : ""; }).filter(Boolean).sort(); return a[0] || ""; };
  var coord = function (ent) { var a = claimVals(ent, "P625")[0]; return a && a.v && a.v.latitude != null ? { lat: a.v.latitude, lng: a.v.longitude } : null; };
  function entities(list, props) {      // 50 ids per call, 3 calls at a time
    var out = {}, chunks = []; for (var i = 0; i < list.length; i += 50) chunks.push(list.slice(i, i + 50));
    var k = 0, worker = function () { var c = chunks[k++]; if (!c) return Promise.resolve(); return wget("action=wbgetentities&ids=" + c.join("|") + "&props=" + (props || "labels|descriptions|claims|sitelinks/urls") + "&languages=en&sitefilter=enwiki").then(function (r) { Object.assign(out, r.entities || {}); }, function () {}).then(worker); };
    return Promise.all([worker(), worker(), worker()]).then(function () { return out; });
  }
  // light SPARQL: only the HQ (or own) coordinates for a list of companies — used for the city/radius filter
  function hqCoords(list) {
    var out = {}, chunks = []; for (var i = 0; i < list.length; i += 250) chunks.push(list.slice(i, i + 250));
    return Promise.all(chunks.map(function (c) {
      var q = "SELECT ?c ?coord WHERE { VALUES ?c { " + c.map(function (x) { return "wd:" + x; }).join(" ") + " } { ?c wdt:P159/wdt:P625 ?coord . } UNION { ?c wdt:P625 ?coord . } }";
      return fetchT("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q), { headers: { accept: "application/sparql-results+json" } }, 30000).then(function (r) { return r.json(); })
        .then(function (j) { j.results.bindings.forEach(function (b) { var m = (b.coord.value.match(/Point\(([-\d.]+) ([-\d.]+)\)/) || []); if (m[1]) out[b.c.value.split("/").pop()] = out[b.c.value.split("/").pop()] || { lat: +m[2], lng: +m[1] }; }); }, function () {});
    })).then(function () { return out; });
  }
  var label = function (e) { return e && e.labels && e.labels.en ? e.labels.en.value : ""; };
  function searchIds(stmts, country) {
    // one CirrusSearch per statement (well-known companies first). A list is worth more when it is specific (few hits):
    // "online food ordering" (300 companies) says more than "retail" (40,000). Very broad "type" lists are dropped.
    return Promise.all(stmts.map(function (s) {
      var q = "haswbstatement:" + s + (country ? " haswbstatement:P17=" + country : "");
      return wget("action=query&list=search&srnamespace=0&srlimit=500&srprop=&srinfo=totalhits&srsort=incoming_links_desc&srsearch=" + encodeURIComponent(q), 20000)
        .then(function (j) { var ids = ((j.query || {}).search || []).map(function (x) { return x.title; }); return { s: s, ids: ids, total: ((j.query || {}).searchinfo || {}).totalhits || ids.length }; }, function () { return { s: s, ids: [], total: 0 }; });
    })).then(function (lists) {
      var score = {}, hits = {}, order = [];
      lists.filter(function (l) { return l.ids.length && !(/^P31=/.test(l.s) && l.total > 3000); }).forEach(function (l) {
        var w = Math.max(0.25, Math.min(1.5, 3 / Math.log10(l.total + 10))) * (/^P452=/.test(l.s) ? 1 : 0.6);
        l.ids.forEach(function (id, rank) { if (!/^Q\d+$/.test(id)) return; if (!(id in score)) { score[id] = 0; hits[id] = 0; order.push(id); } score[id] += w * (1000 - Math.min(999, rank * 2)); hits[id]++; });
      });
      order.forEach(function (id) { score[id] += (hits[id] - 1) * 800; });   // in several industry/type lists → closer competitor
      return order.sort(function (a, b) { return score[b] - score[a]; }).map(function (id) { return { id: id, score: Math.round(score[id]) }; });
    });
  }
  var BRAND_PAGE = 200;
  var groupOf = function (e) { return ids(e, "P749").concat(ids(e, "P127"), ids(e, "P355")); };   // parent, owned by, subsidiaries
  var lastSeed = null;
  function brandRecords(o) {
      var L = function (list) { return list.map(function (x) { return label(o.labs[x]); }).filter(Boolean); };
      var res = [], S = o.s || lastSeed || {}, sid = (o.seed && o.seed.id) || S.id || "", sCountry = ids(S, "P17"), sGroup = groupOf(S);
      if (o.s) lastSeed = Object.assign({ id: sid }, o.s);
      o.dropped = o.dropped || { closed: 0, group: 0 };
      o.found.forEach(function (f) {
        var e = o.ents[f.id]; if (!e || e.missing !== undefined) return;
        if (claimVals(e, "P576").length || claimVals(e, "P582").length) { o.dropped.closed++; return; }                  // dissolved / ended
        var g = groupOf(e); if (sid && (g.indexOf(sid) > -1 || sGroup.indexOf(f.id) > -1 || g.some(function (x) { return sGroup.indexOf(x) > -1; }))) { o.dropped.group++; return; }   // same group, not a competitor
        var name = label(e); if (!name) return;
        var hqIds = ids(e, "P159"), hqC = coord(e) || (o.cc && o.cc[f.id]) || (f.lat != null ? { lat: f.lat, lng: f.lng } : null);
        var ex = claimVals(e, "P414"), tick = ex.map(function (x) { var t = (x.q.P249 || [])[0]; return t && t.datavalue ? t.datavalue.value : ""; }).filter(Boolean);
        var h = function (p, base) { var v = strs(e, p)[0]; return v ? base + v : ""; };
        var p = { mode: "brand", id: f.id, name: name, description: e.descriptions && e.descriptions.en ? e.descriptions.en.value : "",
          website: strs(e, "P856")[0] || "", email: strs(e, "P968").map(function (x) { return x.replace(/^mailto:/, ""); }).join("; "), phone: strs(e, "P1329").join("; "),
          country: L(ids(e, "P17")).slice(0, 3).join(", "), hq: L(hqIds).slice(0, 2).join(", "), founded: year(e, "P571"), employees: num(e, "P1128"), revenue: num(e, "P2139"),
          industry: L(ids(e, "P452")).slice(0, 3).join(", "), kind: L(ids(e, "P31").filter(function (t) { return !GENERIC[t]; })).slice(0, 3).join(", "),
          ceo: L(ids(e, "P169")).slice(0, 2).join(", "), founders: L(ids(e, "P112")).slice(0, 5).join(", "), parent: L(ids(e, "P749")).slice(0, 2).join(", "),
          exchange: L(ex.map(function (x) { return x.v && x.v.id; }).filter(Boolean)).slice(0, 2).join(", "), ticker: tick.slice(0, 2).join(", "), products: L(ids(e, "P1056")).slice(0, 6).join(", "),
          twitter: h("P2002", "https://x.com/"), instagram: h("P2003", "https://instagram.com/"), facebook: h("P2013", "https://facebook.com/"), linkedin: h("P4264", "https://www.linkedin.com/company/"), youtube: h("P2397", "https://www.youtube.com/channel/"),
          wikipedia: e.sitelinks && e.sitelinks.enwiki ? e.sitelinks.enwiki.url || "https://en.wikipedia.org/wiki/" + encodeURIComponent(e.sitelinks.enwiki.title.replace(/ /g, "_")) : "",
          via: f.via || "", wikidata: "https://www.wikidata.org/wiki/" + f.id, lat: hqC ? hqC.lat : null, lng: hqC ? hqC.lng : null,
          score: f.score + (e.sitelinks && e.sitelinks.enwiki ? 500 : 0) + (sCountry.length && ids(e, "P17").some(function (c) { return sCountry.indexOf(c) > -1; }) ? 1200 : 0) };   // same market as the brand
        p.mapsUrl = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(name + (p.hq ? ", " + p.hq : ""));
        res.push(p);
      });
      return res;
  }
  function resolveSeed(q) {   // never fatal: a brand that is not on Wikidata still gets keyword + AI competitors
    if (brandPick && brandPick.id && nrm(brandPick.label) === nrm(q)) return Promise.resolve(brandPick);
    return wget("action=wbsearchentities&language=en&uselang=en&type=item&limit=3&search=" + encodeURIComponent(q), 10000)
      .then(function (j) { var a = j.search || [], x = a.filter(function (s) { return /compan|business|startup|brand|firm|industry|service|platform|app|retail|chain|manufactur|bank|airline|provider/i.test(s.description || ""); })[0] || a[0]; return x ? { id: x.id, label: x.label, sub: x.description || "" } : null; }, function () { return null; });
  }
  function placeCoords() {
    var t = blIn.value.trim(); if (!t) return Promise.resolve(null);
    if (bplace && bplace.lat != null) return Promise.resolve(bplace);
    return lib().then(function (m) { return m.freePlaces(fetchT, {}).geocode(t); }).then(function (c) { if (!c) throw Object.assign(new Error("place"), { reason: "That city or region was not found — pick one from the suggestions." }); return Object.assign({ value: t }, c); });
  }
  var COMPANY_TYPES = "P31=Q4830453|P31=Q783794|P31=Q6881511|P31=Q891723|P31=Q1589009|P31=Q21980538|P31=Q18388277|P31=Q167037|P31=Q1058914|P31=Q210167|P31=Q131524";
  var STOP = /^(a|an|the|of|and|for|in|on|by|with|to|from|company|companies|business|businesses|startup|start|up|based|brand|brands|firm|private|public|limited|ltd|inc|llc|pvt|group|indian|american|british|chinese|german|french|japanese|global|online|multinational|international|leading|largest|biggest|popular|headquartered|founded|which|that|is|its|it|was|are|provider|service|services|operator|owner|subsidiary|conglomerate|listed|unicorn|website|app|platform|chain|maker|manufacturer|retailer|\d+)$/i;
  function phrases(text) {   // "Indian multinational restaurant aggregator and food delivery company" → ["restaurant aggregator", "food delivery"]
    var parts = String(text || "").toLowerCase().replace(/[^a-z0-9ऀ-ॿ\s-]+/g, " , ").split(/\s+/), out = [], run = [];
    var flush = function () { if (run.length >= 2) for (var i = 0; i < run.length - 1; i++) out.push(run[i] + " " + run[i + 1]); else if (run.length === 1 && run[0].length > 4) out.push(run[0]); run = []; };
    parts.forEach(function (w) { if (!w || w === "," || STOP.test(w) || w.length < 3) flush(); else run.push(w); }); flush();
    return uniqStr(out).sort(function (a, b) { return (b.indexOf(" ") > -1) - (a.indexOf(" ") > -1); }).slice(0, 3);
  }
  var uniqStr = function (a) { var s = {}; return a.filter(function (x) { if (s[x]) return false; s[x] = 1; return true; }); };
  function keywordIds(text, country) {    // companies whose Wikidata name/description contains the same phrase ("food delivery", "pet food" …)
    var ph = phrases(text); if (!ph.length) return Promise.resolve([]);
    return Promise.all(ph.map(function (p, pi) {
      var q = (p.indexOf(" ") > -1 ? '"' + p + '"' : p) + " haswbstatement:" + COMPANY_TYPES + (country ? " haswbstatement:P17=" + country : "");
      return wget("action=query&list=search&srnamespace=0&srlimit=100&srprop=&srsearch=" + encodeURIComponent(q), 15000)
        .then(function (j) { return ((j.query || {}).search || []).map(function (x, i) { return { id: x.title, score: (900 - Math.min(899, i * 8)) * (pi ? 0.8 : 1) }; }).filter(function (x) { return /^Q\d+$/.test(x.id); }); }, function () { return []; });
    })).then(function (lists) { return [].concat.apply([], lists); });
  }
  function aiSuggest(seed, q, cname, city) {
    return fetchT(ROOT + "api/brand-ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brand: seed ? seed.label : q, description: seed ? seed.sub : "", industry: (seed && seed.industries || []).join(", "), country: cname || (seed && seed.country) || "", city: city, web: true }) }, 50000)
      .then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (j) { if (!j.ok) throw new Error(j.reason || "ai"); return j.items || []; });
  }
  function verifyAI(items, seedName) {   // look each AI name up on Wikidata; keep the ones that match a company there
    var out = { ids: [], loose: [] }, k = 0, seedN = nrm(seedName);
    items = items.filter(function (x) { return nrm(x.name) && nrm(x.name) !== seedN; }).slice(0, 30);
    var worker = function () {
      var x = items[k++]; if (!x) return Promise.resolve();
      return wget("action=wbsearchentities&language=en&uselang=en&type=item&limit=3&search=" + encodeURIComponent(x.name), 10000).then(function (j) {
        var hit = (j.search || []).filter(function (s) { var a = nrm(s.label), b = nrm(x.name); return (a === b || a.indexOf(b) === 0 || b.indexOf(a) === 0) && !/human|person|film|song|album|novel|television|village|river|species|given name|family name|disambiguation/i.test(s.description || ""); })[0];
        if (hit) out.ids.push({ id: hit.id, score: (x.source ? 3000 : 2400) - out.ids.length * 10, ai: x, web: !!x.source }); else out.loose.push(x);
      }, function () { out.loose.push(x); }).then(worker);
    };
    return Promise.all([worker(), worker(), worker(), worker()]).then(function () { return out; });
  }
  function runBrand() {
    var q = bIn.value.trim(); if (!q) { setStatus("Type a brand, company or industry — for example “Zomato” or “fintech”.", "warn"); bIn.focus(); return; }
    if (busy) return; busy = true; ver();
    var country = cIn.value, cname = country ? cIn.options[cIn.selectedIndex].text : "", rkm = R2.km(), city = blIn.value.trim();
    setStatus("Finding competitors of " + q + "… three searches run together: Wikidata industry, Wikidata keywords and AI suggestions.", "busy");
    list.innerHTML = '<li class="cf-empty">Looking up companies that compete with ' + esc(q) + "…</li>"; $("cf-more").hidden = true;
    track("cf_search", { mode: "brand", brand: q });
    Promise.all([resolveSeed(q), placeCoords(), health]).then(function (r) {
      var seed = r[0], loc = r[1], h = r[2] || {};
      chips(["wd", "kw"].concat(h.ai ? ["ai"] : []));
      var seedEnt = seed ? entities([seed.id]).then(function (se) { return se[seed.id] || {}; }, function () { return {}; }) : Promise.resolve({});
      // layer 1: same industry / same kind of company (Wikidata statements)
      var L1 = seedEnt.then(function (s) {
        if (!seed) return [];
        var inds = ids(s, "P452"), types = ids(s, "P31").filter(function (t) { return !GENERIC[t]; });
        var stmts = inds.slice(0, 4).map(function (i) { return "P452=" + i; }).concat(types.slice(0, 2).map(function (t) { return "P31=" + t; }));
        if (!inds.length) stmts.unshift("P452=" + seed.id);                    // the search itself is an industry (e.g. "fintech")
        return searchIds(stmts, country);
      }).then(function (x) { chip("wd", x.length ? "ok" : "empty", x.length ? x.length + " found" : seed ? "none listed" : "brand not on Wikidata"); return x; }, function () { chip("wd", "fail", "did not answer"); return []; });
      // layer 2: companies described with the same words (works for startups without an "industry" statement)
      var L2 = seedEnt.then(function (s) {
        var d = (s.descriptions && s.descriptions.en && s.descriptions.en.value) || (seed && seed.sub) || "";
        return Promise.all([keywordIds(seed ? d || q : q, country), seed && /industry|sector|field|type of business|economic activity/i.test(d) ? keywordIds(q, country) : Promise.resolve([])]).then(function (a) { return a[0].concat(a[1]); });
      }).then(function (x) { chip("kw", x.length ? "ok" : "empty", x.length ? x.length + " found" : "none"); return x; }, function () { chip("kw", "fail", "did not answer"); return []; });
      // layer 3: AI suggestions, each checked against Wikidata
      var L3 = !h.ai ? Promise.resolve({ ids: [], loose: [] }) : aiSuggest(seed, q, cname, city).then(function (items) { return verifyAI(items, seed ? seed.label : q); })
        .then(function (x) { chip("ai", x.ids.length + x.loose.length ? "ok" : "empty", (x.ids.length + x.loose.length) + " suggested · " + x.ids.length + " confirmed on Wikidata"); return x; }, function () { chip("ai", "fail", "not available right now"); return { ids: [], loose: [] }; });
      return Promise.all([seedEnt, L1, L2, L3]).then(function (a) {
        var s = a[0], score = {}, via = {}, aiInfo = {}, order = [];
        var add = function (list, tag) { list.forEach(function (x) { if (seed && x.id === seed.id) return; if (!(x.id in score)) { score[x.id] = 0; order.push(x.id); via[x.id] = []; } score[x.id] += x.score; if (via[x.id].indexOf(tag) < 0) via[x.id].push(tag); if (x.ai) aiInfo[x.id] = x.ai; }); };
        add(a[1], "Same industry"); add(a[2], "Similar description"); add(a[3].ids.filter(function (x) { return x.web; }), "Google results + AI"); add(a[3].ids.filter(function (x) { return !x.web; }), "AI + Wikidata");
        order.forEach(function (id) { if (via[id].length > 1) score[id] += 1500 * (via[id].length - 1); });   // found by two layers → very likely a real competitor
        var found = order.sort(function (x, y) { return score[y] - score[x]; }).map(function (id) { return { id: id, score: score[id], via: via[id].join(", "), ai: aiInfo[id] }; });
        var total = found.length, loose = a[3].loose;
        if (!seed && !found.length && !loose.length) throw Object.assign(new Error("not found"), { reason: "No company or industry called “" + q + "” was found. Try the full name, an industry such as “food delivery”, or pick one from the suggestions." });
        var near = !loc ? Promise.resolve(found) : (setStatus("Checking where " + found.length + " companies are headquartered…", "busy"), hqCoords(found.slice(0, 1500).map(function (x) { return x.id; })).then(function (cc) {
          var R = 6371, rr = Math.PI / 180;
          return found.filter(function (x) { var p = cc[x.id]; if (!p) return false; var d = Math.pow(Math.sin((p.lat - loc.lat) * rr / 2), 2) + Math.cos(loc.lat * rr) * Math.cos(p.lat * rr) * Math.pow(Math.sin((p.lng - loc.lng) * rr / 2), 2); x.lat = p.lat; x.lng = p.lng; x.distance = Math.round(2 * R * Math.asin(Math.sqrt(d)) * 1000); return x.distance <= rkm * 1000; });
        }));
        return near.then(function (kept) {
          var first = kept.slice(0, BRAND_PAGE), o = { seed: seed || { id: "", label: q, sub: "" }, s: s, loc: loc, ents: {}, found: first, rest: kept.slice(BRAND_PAGE), total: total, loose: loose };
          if (!first.length) return o;
          setStatus("Reading details of " + first.length + (kept.length > first.length ? " of " + kept.length : "") + " companies…", "busy");
          return entities(first.map(function (x) { return x.id; })).then(function (ents) { o.ents = ents; return o; });
        });
      });
    }).then(function (o) {
      // names for everything the companies point to (countries, HQs, people, industries, products)
      var refs = {}, need = ["P17", "P159", "P169", "P112", "P749", "P414", "P1056", "P452", "P31"];
      Object.keys(o.ents).forEach(function (id) { need.forEach(function (p) { ids(o.ents[id], p).slice(0, 6).forEach(function (x) { refs[x] = 1; }); }); });
      ids(o.s, "P452").concat(ids(o.s, "P17")).forEach(function (x) { refs[x] = 1; });
      return entities(Object.keys(refs).slice(0, 3000), "labels").then(function (labs) { o.labs = labs; return o.loc || !o.found.length ? o : hqCoords(o.found.map(function (f) { return f.id; })).then(function (cc) { o.cc = cc; return o; }); });
    }).then(function (o) {
      var L = function (list) { return list.map(function (x) { return label(o.labs[x]); }).filter(Boolean); };
      var res = brandRecords(o);
      if (o.loc) res.forEach(function (p) { var f = o.found.filter(function (x) { return x.id === p.id; })[0]; if (f && f.distance != null) p.distance = f.distance; });
      // AI names that are not on Wikidata: shown, clearly labelled, checked through their website
      if (!o.loc) o.loose.forEach(function (x, i) {
        if (res.some(function (p) { return nrm(p.name) === nrm(x.name); })) return;
        res.push({ mode: "brand", id: "ai:" + nrm(x.name).replace(/ /g, "-"), name: x.name, description: x.why || "", website: x.website || "", country: x.country || "", via: x.source ? "Named in Google results — not on Wikidata" : "AI suggestion — verify", sourceUrl: x.source || "", unverified: !x.source, score: (x.source ? 1500 : 1200) - i,
          mapsUrl: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(x.name), lat: null, lng: null });
      });
      res.sort(function (a, b) { return b.score - a.score; });
      var s = o.s, seedInfo = { id: o.seed.id, label: label(s) || o.seed.label, sub: (s.descriptions && s.descriptions.en && s.descriptions.en.value) || o.seed.sub, industries: L(ids(s, "P452")), country: L(ids(s, "P17")).join(", "), website: strs(s, "P856")[0] || "", founded: year(s, "P571"), missing: !o.seed.id };
      var where = [o.loc ? "HQ within " + rkm + " km of " + (o.loc.value || blIn.value) : "", country ? cname : ""].filter(Boolean).join(", ") || "Worldwide";
      return { ok: true, mode: "brand", type: seedInfo.label, area: where, seed: seedInfo, loc: o.loc, results: res, rest: o.rest || [], total: Math.max((o.total || 0) - (o.dropped ? o.dropped.closed + o.dropped.group : 0), res.length), source: "wikidata", dropped: o.dropped };
    }).then(function (j) { show(j); }, function (e) {
      busy = false; data = null; view = [];
      setStatus(e && e.reason ? e.reason : "Wikidata did not answer right now — please try again in a minute.", "warn"); ver(e && e.message);
      list.innerHTML = '<li class="cf-empty">No results yet. Try another spelling, pick a suggestion while typing, remove the city, or search an industry such as “food delivery”.</li>';
      track("cf_fail", { mode: "brand" });
    });
  }

  /* ================= results ================= */
  function show(j, partial) { try { show_(j, partial); } catch (e) { busy = false; if (window.console) console.error("[finder] render failed", e); setStatus("Could not show the results.", "warn"); ver(e.message); } }
  function show_(j, partial) {
    if (!partial) busy = false; data = j; data.results.forEach(function (p, i) { p._i = i; });
    var n = j.results.length;
    if (partial) { setStatus(n.toLocaleString("en-IN") + " found so far · still asking the other sources…", "busy"); paint(true); setMapView("pins"); pins(); insight(); return; }
    if (j.mode === "local") {
      var src = { "google+osm": "Google Maps + OpenStreetMap", google: "Google Maps", osm: "OpenStreetMap" }[j.source] || j.source || "OpenStreetMap";
      setStatus(n ? n.toLocaleString("en-IN") + " businesses found within " + km(j.radius) + " · " + src + (j.ms ? " · " + (j.ms / 1000).toFixed(1) + " s" : "") : (j.note || "No listed businesses found. Try a bigger radius, another spelling or a nearby area."), n ? "ok" : "warn");
      setMapView("pins");
    } else {
      setStatus(n ? n + " competitors of " + j.type + " · " + j.area + " · from Wikidata" + (j.results.some(function (p) { return /AI/.test(p.via || ""); }) ? " + AI" : "") : "No competitors listed for " + j.type + " (" + j.area + "). Try a bigger radius, “Any country”, or the industry name.", n ? "ok" : "warn");
      brandCard(j.seed); setMapView("pins");
    }
    ver(j.viaServer ? "server" : "");
    $("cf-enrich").disabled = !n || !j.results.some(function (p) { return p.website; }); $("cf-enrich-s").textContent = "";
    if (n) { addToSheet(j); paint(true); } else { list.innerHTML = '<li class="cf-empty">Nothing listed here yet. Try a wider search.</li>'; $("cf-more").hidden = true; }
    pins(); insight(); brandMoreUI();
    $("cf-gmatch").hidden = !google || !n;
    if (j.mode === "brand" && j.total > n) setStatus(status.textContent + " · showing the " + n + " closest of " + j.total.toLocaleString("en-IN") + " found", "ok");
    if (j.mode === "brand" && j.dropped && (j.dropped.closed || j.dropped.group)) setStatus(status.textContent + " · left out " + [j.dropped.closed && j.dropped.closed + " closed", j.dropped.group && j.dropped.group + " from the same group"].filter(Boolean).join(" and "), "ok");
    if (n) autoEnrich(j.results);
  }
  filt.addEventListener("input", function () { paint(true); });
  document.querySelector(".cf-sort").addEventListener("click", function (e) {
    var b = e.target.closest("[data-sort]"); if (!b) return; sortBy = b.dataset.sort;
    this.querySelectorAll("[data-sort]").forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); paint(true);
  });
  $("cf-more-b").addEventListener("click", function () { paint(false, PAGE); });
  $("cf-load-b").addEventListener("click", function () {
    if (!data || data.mode !== "brand" || !data.rest.length || busy) return;
    var b = this, next = data.rest.slice(0, BRAND_PAGE); busy = true; b.disabled = true; b.textContent = "Loading…";
    entities(next.map(function (x) { return x.id; })).then(function (ents) {
      var refs = {}; Object.keys(ents).forEach(function (id) { ["P17", "P159", "P169", "P112", "P749", "P414", "P1056", "P452", "P31"].forEach(function (p) { ids(ents[id], p).slice(0, 6).forEach(function (x) { refs[x] = 1; }); }); });
      return Promise.all([entities(Object.keys(refs), "labels"), data.loc ? Promise.resolve({}) : hqCoords(next.map(function (x) { return x.id; }))]).then(function (r) {
        var more = brandRecords({ ents: ents, labs: r[0], cc: r[1], found: next });
        if (data.loc) more.forEach(function (p) { var f = next.filter(function (x) { return x.id === p.id; })[0]; if (f) p.distance = f.distance; });
        var base = data.results.length; more.forEach(function (p, i) { p._i = base + i; }); data.results = data.results.concat(more); data.rest = data.rest.slice(BRAND_PAGE);
        busy = false; addToSheet(Object.assign({}, data, { results: more })); paint(true); pins(); insight(); brandMoreUI();
        setStatus(data.results.length + " of " + data.total + " competitors of " + data.type + " loaded · from Wikidata", "ok"); autoEnrich(more);
      });
    }).catch(function () { busy = false; }).then(function () { b.disabled = false; brandMoreUI(); });
  });
  function brandMoreUI() { var b = $("cf-load-b"), n = data && data.mode === "brand" ? data.rest.length : 0; b.hidden = !n; b.textContent = "Load " + Math.min(BRAND_PAGE, n) + " more companies (" + n + " left)"; if (n) $("cf-more").hidden = false; }
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
      (p.industry ? '<p class="cf-meta"><span class="cf-cat">' + esc(p.industry) + "</span></p>" : "") + (p.description ? '<p class="cf-addr">' + esc(p.description) + "</p>" : "") + (p.address ? '<p class="cf-addr">📍 ' + esc(p.address) + "</p>" : "") +
      (p.rating != null && p.rating !== "" ? '<span class="cf-rate"><b>' + (+p.rating).toFixed(1) + '</b> <span aria-hidden="true">' + stars(p.rating) + '</span> <span class="muted">(' + (p.reviews || 0).toLocaleString("en-IN") + " Google reviews)</span></span>" : "") +
      (facts.length ? '<dl class="cf-facts">' + facts.map(function (f) { return "<div><dt>" + f[0] + "</dt><dd>" + esc(f[1]) + "</dd></div>"; }).join("") + "</dl>" : "") + contacts(p) +
      '<p class="cf-flags">' + (p.unverified ? '<span class="cf-flag warn">AI suggestion — verify</span>' : p.via ? '<span class="cf-flag">' + esc(p.via) + "</span>" : "") + (!p.website ? '<span class="cf-flag warn">No website listed</span>' : "") + "</p>" +
      '<div class="cf-acts">' + link(p.website, "Website ↗", "") + (p.sourceUrl ? link(p.sourceUrl, "Where it was named") : "") + '<a class="btn sm ghost" href="' + esc(p.mapsUrl) + '" target="_blank" rel="noopener noreferrer">Google Maps</a>' + link(p.wikipedia, "Wikipedia") +
      '<a class="btn sm ghost" href="https://www.google.com/search?q=' + encodeURIComponent(p.name + " company") + '" target="_blank" rel="noopener noreferrer">Google it</a>' +
      (p.linkedin ? "" : '<a class="btn sm ghost" href="https://www.linkedin.com/search/results/companies/?keywords=' + encodeURIComponent(p.name) + '" target="_blank" rel="noopener noreferrer">LinkedIn</a>') +
      (p.lat != null ? '<button type="button" class="btn sm ghost" data-show="' + p._i + '">Show HQ on map</button>' : "") + "</div></div></li>";
  }
  function brandCard(s) {
    if (!s) { card.hidden = true; return; }
    card.hidden = false;
    var ind = s.industries[0] || s.label;
    card.innerHTML = '<span class="tag">YOUR SEARCH</span><h3>' + esc(s.label) + "</h3>" + (s.sub ? '<p class="muted">' + esc(s.sub) + "</p>" : s.missing ? '<p class="muted">Not on Wikidata yet — competitors below come from similar company descriptions' + (data && data.results.some(function (p) { return p.unverified || /AI/.test(p.via || ""); }) ? " and AI suggestions (each checked where possible)" : "") + ".</p>" : "") +
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

  /* ================= contacts: each competitor's own website (free) and its Google Maps listing (when connected) ================= */
  var enriching = false;
  function mergeInfo(p, x) {
    if (!x || x.error) return false;
    var before = JSON.stringify([p.email, p.phone, p.instagram, p.facebook, p.linkedin, p.twitter, p.youtube, p.whatsapp, p.siteAddress]);
    var join = function (a, b) { return a.concat(b).map(function (v) { return String(v || "").trim(); }).filter(function (v, i, arr) { return v && arr.indexOf(v) === i; }).join("; "); };
    p.email = join(String(p.email || "").split(/;\s*/), x.emails || []); p.phone = join(String(p.phone || "").split(/;\s*/), x.phones || []); p.whatsapp = join(String(p.whatsapp || "").split(/;\s*/), x.whatsapp || []);
    ["instagram", "facebook", "linkedin", "twitter", "youtube"].forEach(function (k) { p[k] = p[k] || x[k] || ""; });
    p.siteTitle = x.title || p.siteTitle || ""; p.siteDescription = x.description || p.siteDescription || ""; p.contactPage = x.contactPage || p.contactPage || "";
    if (x.address) { p.siteAddress = x.address; if (!p.address) p.address = x.address; }
    if (x.founded && !p.founded) p.founded = x.founded;
    return JSON.stringify([p.email, p.phone, p.instagram, p.facebook, p.linkedin, p.twitter, p.youtube, p.whatsapp, p.siteAddress]) !== before;
  }
  function mergeGoogle(p, g) {
    if (!g) return false;
    var gf = p._gf = p._gf || {}, mark = function (k, v) { if (v !== "" && v != null) gf[k] = gf[k] != null && typeof v === "string" ? gf[k] + "; " + v : v; };
    mark("website", !p.website ? g.website : ""); mark("address", !p.address ? g.address : ""); if (p.rating == null && g.rating != null) { mark("rating", g.rating); mark("reviews", g.reviews); }
    mark("hours", !p.hours ? g.hours : ""); mark("phone", g.intlPhone || g.phone); mark("phone", g.phone);
    p.gName = g.name || ""; p.gAddress = g.address || ""; p.gPhone = g.intlPhone || g.phone || ""; p.gRating = g.rating == null ? "" : g.rating; p.gReviews = g.reviews == null ? "" : g.reviews;
    p.gHours = g.hours || ""; p.gMaps = g.mapsUrl || ""; p.gStatus = g.status || "";
    if (!p.website && g.website) p.website = g.website; if (!p.address && g.address) p.address = g.address; if (p.rating == null && g.rating != null) { p.rating = g.rating; p.reviews = g.reviews; }
    if (g.mapsUrl) p.mapsUrl = g.mapsUrl; if (!p.hours && g.hours) p.hours = g.hours;
    if (g.phone && String(p.phone || "").indexOf(g.phone) < 0) p.phone = [p.phone, g.intlPhone || g.phone].filter(Boolean).join("; ");
    return true;
  }
  function enrich(list, opts) {
    opts = opts || {};
    var st = $("cf-enrich-s"), b = $("cf-enrich");
    var sites = list.filter(function (p) { return p.website && !p._site; }), places = opts.google ? list.filter(function (p) { return !p._g; }) : [];
    if (!sites.length && !places.length) { if (!opts.auto) st.textContent = "Every website in this list has been read already."; return Promise.resolve(); }
    if (enriching) return Promise.resolve(); enriching = true; b.disabled = true; $("cf-gmatch").disabled = true;
    var jobs = sites.map(function (p) { return { p: p, kind: "site" }; }).concat(places.map(function (p) { return { p: p, kind: "g" }; }));
    var done = 0, found = 0, BATCH = 4, stopped = "";
    var step = function (i) {
      if (i >= jobs.length || stopped) {
        enriching = false; b.disabled = !data; $("cf-gmatch").disabled = !data;
        st.textContent = (stopped ? stopped + " " : "Done — ") + "checked " + done + " of " + jobs.length + (found ? ", new contact details for " + found : "") + "."; refreshSheet(); paint(true); insight(); return Promise.resolve();
      }
      var batch = jobs.slice(i, i + BATCH), body = { urls: [], places: [] };
      batch.forEach(function (j) { if (j.kind === "site") body.urls.push(href(j.p.website)); else body.places.push({ key: j.p._key || j.p.id || j.p.name, name: j.p.name, near: j.p.address || j.p.hq || j.p.country || data.area, lat: j.p.lat, lng: j.p.lng }); });
      st.textContent = (opts.google ? "Matching on Google Maps & reading websites… " : "Reading websites for emails, phones & socials… ") + done + " of " + jobs.length + (found ? " · " + found + " with new details" : "");
      return fetchT(ROOT + "api/enrich", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, 40000).then(function (r) { return r.json(); }).then(function (jr) {
        if (!jr.ok) { stopped = (jr.reason || "The website reader is busy.") + " Stopped —"; return; }
        batch.forEach(function (j) { done++;
          if (j.kind === "site") { j.p._site = true; if (mergeInfo(j.p, (jr.results || {})[href(j.p.website)])) found++; }
          else { j.p._g = true; if (mergeGoogle(j.p, (jr.places || {})[j.p._key || j.p.id || j.p.name])) found++; }
        });
      }, function () { done += batch.length; }).then(function () { if (i && i % 40 === 0) { refreshSheet(); } return step(i + BATCH); });
    };
    return step(0);
  }
  function autoEnrich(list) { var n = list.filter(function (p) { return p.website; }).length; if (!n) return; enrich(list.slice(0, 400), { auto: true }); }
  $("cf-enrich").addEventListener("click", function () { if (data) enrich(data.results); });
  $("cf-gmatch").addEventListener("click", function () { if (!data) return; if (data.results.length > 60 && !confirm("This looks up " + data.results.length + " businesses on Google Maps (uses Google credits). Continue?")) return; enrich(data.results, { google: true }); });

  /* ================= one sheet for every search + export (every column) =================
     Kept in IndexedDB (js/cf-export.js) so big sheets survive a reload; older sheets in localStorage are moved over.
     Google Maps terms do not allow exporting Google's place details, so values that came only from Google stay on screen;
     the sheet keeps the name, the Google Maps link and everything from OpenStreetMap, Geoapify, Wikidata and the business's own website. */
  var X = window.FODO_EXPORT, SHEET_KEY = "fodo-cf-sheet2", saveT = 0;
  var sheet = LS.get(SHEET_KEY, null) || { local: [], brand: [], searches: [] };
  function mergeSheets(a, b) {   // rows of b that a does not have yet
    ["local", "brand"].forEach(function (k) { var have = {}; a[k].forEach(function (r) { have[r.key] = 1; }); (b[k] || []).forEach(function (r) { if (!have[r.key]) { a[k].push(r); have[r.key] = 1; } }); });
    (b.searches || []).forEach(function (x) { if (a.searches.indexOf(x) < 0) a.searches.push(x); }); return a;
  }
  if (X) X.store.get("sheet3").then(function (v) { if (v && v.local) { sheet = mergeSheets(v, sheet); } if (sheet.local.length + sheet.brand.length) saveSheet(); sheetUI(0); });
  var LOCAL_COLS = [["Search", "search"], ["Name", "name"], ["Category", "category"], ["Address", "address"], ["Street", "street"], ["Locality", "locality"], ["City", "city"], ["State", "state"], ["Postcode", "postcode"], ["Country", "country"],
    ["Phone", "phone"], ["International phone", "intlPhone"], ["Mobile", "mobile"], ["WhatsApp", "whatsapp"], ["Email", "email"], ["Website", "website"], ["Contact page", "contactPage"],
    ["Instagram", "instagram"], ["Facebook", "facebook"], ["LinkedIn", "linkedin"], ["X / Twitter", "twitter"], ["YouTube", "youtube"],
    ["Rating", "rating"], ["Reviews", "reviews"], ["Price", "price"], ["Open now", "openTxt"], ["Opening hours", "hours"], ["Business status", "status"], ["Google types", "types"],
    ["Brand", "brand"], ["Operator", "operator"], ["Cuisine", "cuisine"], ["Payment", "payment"], ["Delivery", "delivery"], ["Takeaway", "takeaway"], ["Wheelchair", "wheelchair"], ["Established", "established"], ["Description", "description"],
    ["Google Maps listing", "gMaps"], ["Address (from website)", "siteAddress"], ["Website title", "siteTitle"], ["Website description", "siteDescription"], ["Distance (km)", "km"], ["Latitude", "lat"], ["Longitude", "lng"], ["Google Maps", "mapsUrl"], ["OpenStreetMap", "osmUrl"], ["Wikidata", "wikidata"], ["Source", "source"], ["Note", "gnote"], ["All OSM tags", "tags"]];
  var BRAND_COLS = [["Search", "search"], ["Company", "name"], ["Found by", "via"], ["Description", "description"], ["Industry", "industry"], ["Type", "kind"], ["Country", "country"], ["Headquarters", "hq"], ["Founded", "founded"], ["Employees", "employees"], ["Revenue", "revenue"],
    ["CEO", "ceo"], ["Founders", "founders"], ["Parent company", "parent"], ["Stock exchange", "exchange"], ["Ticker", "ticker"], ["Products / services", "products"],
    ["Website", "website"], ["Email", "email"], ["Phone", "phone"], ["WhatsApp", "whatsapp"], ["Contact page", "contactPage"], ["LinkedIn", "linkedin"], ["Instagram", "instagram"], ["Facebook", "facebook"], ["X / Twitter", "twitter"], ["YouTube", "youtube"],
    ["Address", "address"], ["Google Maps listing", "gMaps"], ["Address (from website)", "siteAddress"], ["Distance from city (km)", "km"], ["Website title", "siteTitle"], ["Website description", "siteDescription"], ["Wikipedia", "wikipedia"], ["Wikidata", "wikidata"], ["HQ latitude", "lat"], ["HQ longitude", "lng"], ["Note", "gnote"]];
  var KEEP = { search: 1, name: 1, mapsUrl: 1, gMaps: 1, km: 1, source: 1, via: 1, gnote: 1 };
  function rowOf(j, p, label) {
    var o = { search: label }, gf = p._gf || {}, cut = false;
    var strip = function (k, v) {
      var g = gf[k]; if (KEEP[k] || g == null || v === "" || v == null) return v;
      if (typeof v === "number" || typeof g === "number") { if (String(v) === String(g)) { cut = true; return ""; } return v; }
      var gp = String(g).split(/;\s*/), parts = String(v).split(/;\s*/), kept = parts.filter(function (x) { return gp.indexOf(x) < 0; });
      if (kept.length < parts.length) cut = true; return kept.join("; ");
    };
    (j.mode === "local" ? LOCAL_COLS : BRAND_COLS).forEach(function (c) { if (c[1] !== "search") o[c[1]] = strip(c[1], p[c[1]] == null ? "" : p[c[1]]); });
    if (j.mode === "local") o.openTxt = gf.open != null ? "" : p.open === true ? "Yes" : p.open === false ? "No" : "";
    o.km = p.distance == null ? "" : +(p.distance / 1000).toFixed(2);
    if (p.unverified) o.gnote = "AI suggestion — check the website before using";
    if (cut) o.gnote = (o.gnote ? o.gnote + ". " : "") + "Google Maps details (phone, rating, hours …) are shown on the site only, as Google's terms require — open the Google Maps link";
    o.key = j.mode === "local" ? nrm(p.name) + "|" + (p.lat != null ? (+p.lat).toFixed(4) + "," + (+p.lng).toFixed(4) : nrm(p.address)) : p.id;
    return o;
  }
  function addToSheet(j) {
    var label = j.mode === "local" ? j.type + " · " + (j.radius / 1000) + " km of " + (j.area || "you") : j.type + " · " + j.area, arr = sheet[j.mode], idx = {};
    arr.forEach(function (x, i) { idx[x.key] = i; });
    var added = 0;
    j.results.forEach(function (p) { var r = rowOf(j, p, label); p._key = r.key; if (idx[r.key] != null) { arr[idx[r.key]] = Object.assign(r, { search: arr[idx[r.key]].search }); return; } idx[r.key] = arr.length; arr.push(r); added++; });
    if (sheet.searches.indexOf(label) < 0) sheet.searches.push(label);
    saveSheet(); sheetUI(added);
  }
  function refreshSheet() {   // after "Find emails & socials" — write the new fields into the sheet rows
    if (!data) return; var arr = sheet[data.mode], idx = {}; arr.forEach(function (x, i) { idx[x.key] = i; });
    data.results.forEach(function (p) { var i = idx[p._key]; if (i == null) return; var r = rowOf(data, p, arr[i].search); arr[i] = r; });
    saveSheet(); sheetUI(0);
  }
  function saveSheet() {
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      if (!X) { LS.set(SHEET_KEY, sheet); return; }
      X.store.set("sheet3", sheet).then(function (ok) { if (ok) { try { localStorage.removeItem(SHEET_KEY); } catch (e) {} } else if ($("cf-sheet-n")) $("cf-sheet-n").textContent += " (could not be kept after reload — download it now)"; });
    }, 250);
  }
  function sheetUI(added) {
    if (!$("cf-sheet-n")) return;
    var n = sheet.local.length + sheet.brand.length;
    $("cf-sheet-n").textContent = n ? n.toLocaleString("en-IN") + " competitors from " + sheet.searches.length + (sheet.searches.length === 1 ? " search" : " searches") + (added ? " · " + added.toLocaleString("en-IN") + " new just added" : "") + " — download them all at once." : "Empty — every search you run is added here.";
    ["cf-x-xlsx", "cf-x-csv", "cf-x-copy", "cf-x-clear"].forEach(function (id) { $(id).disabled = !n; });
    $("cf-sheet").classList.toggle("has", !!n);
  }
  sheetUI(0);
  var cell = function (v) { v = v == null ? "" : String(v); if (/^[=@\t\r]/.test(v) || (/^[+\-]/.test(v) && !/^[+\-][\d\s().;+\-]*$/.test(v))) v = "'" + v; return v; };   // stop spreadsheet formula injection (phone numbers like +91… stay as they are)
  function rowsFor(kind) { var cols = kind === "local" ? LOCAL_COLS : BRAND_COLS; return [cols.map(function (c) { return c[0]; })].concat(sheet[kind].map(function (x) { return cols.map(function (c) { var v = x[c[1]]; return typeof v === "number" ? v : cell(v); }); })); }
  function stamp() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function csvRows() { var out = []; ["local", "brand"].forEach(function (k) { if (!sheet[k].length) return; if (out.length) out.push([]); out.push([k === "local" ? "LOCAL COMPETITORS" : "BRAND & STARTUP COMPETITORS"]); rowsFor(k).forEach(function (r) { out.push(r); }); }); return out; }
  function toCSV() { return csvRows().map(function (r) { return r.map(function (v) { v = String(v == null ? "" : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\r\n"); }
  function toTSV() { var out = []; ["local", "brand"].forEach(function (k) { if (!sheet[k].length) return; if (out.length) out.push([""]); rowsFor(k).forEach(function (r) { out.push(r); }); }); return X ? X.tsv(out) : out.map(function (r) { return r.join("\t"); }).join("\n"); }
  function workbook() {
    var sum = [["FODO Competitor Sheet"], ["Exported", new Date().toLocaleString()], ["Local competitors", sheet.local.length], ["Brand & startup competitors", sheet.brand.length], [],
      ["Sources", "OpenStreetMap contributors (ODbL), Geoapify, Wikidata (CC0), each business's own website. Google Maps details stay on the website as Google's terms require."], [], ["Searches"]].concat(sheet.searches.map(function (s) { return [s]; }));
    var out = [{ name: "Summary", rows: sum, header: false, widths: [30, 90], boldRows: [0, 7] }];
    [["local", "Local competitors"], ["brand", "Brands & startups"]].forEach(function (k) { if (sheet[k[0]].length) out.push({ name: k[1], rows: rowsFor(k[0]), freezeCols: 2 }); });
    return X.xlsx(out, { title: "FODO Competitor Sheet " + stamp() });
  }
  var csvBlob = function () { return X ? X.csv(csvRows()) : new Blob(["﻿" + toCSV()], { type: "text/csv;charset=utf-8" }); };
  // v13: with Growth Lab accounts switched on, downloading the sheet needs a free login (searching stays open to everyone)
  var gate = function () { var A = window.FODO_ACCOUNT; if (!A) return Promise.resolve(true); return A.config().then(function (c) { if (!c.enabled) return true; return A.me().then(function (u) { return u || A.login("Log in (free) to download your competitor sheet. Searching stays open to everyone."); }).then(function () { return true; }); }); };
  var save0 = function (blob, name, kind) { if (X) return X.deliver(blob, name, { kind: kind }); var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 800); return Promise.resolve("download"); };
  var save = function (blob, name, kind) { return gate().then(function () { var A = window.FODO_ACCOUNT; try { if (A && A.current()) A.api("event", { kind: "finder_export", detail: kind }); } catch (e) {} return save0(blob, name, kind); }, function () { return "cancelled"; }); };
  $("cf-x-csv").addEventListener("click", function () { var b = this; save(csvBlob(), "FODO-competitors-" + stamp() + ".csv", "CSV").then(function (h) { if (h === "download") flash(b, "Downloaded ✓"); }); });
  $("cf-x-copy").addEventListener("click", function () {
    var b = this, t = toTSV();
    (X ? X.copyText(t) : navigator.clipboard.writeText(t).then(function () { return "copied"; })).then(function (h) { if (h === "copied") flash(b, "Copied — paste into Google Sheets ✓"); }, function () { if (U.copy) U.copy(t, b); });
  });
  $("cf-x-clear").addEventListener("click", function () { if (!confirm("Clear all " + (sheet.local.length + sheet.brand.length) + " competitors from your sheet?")) return; sheet = { local: [], brand: [], searches: [] }; saveSheet(); sheetUI(0); });
  function flash(b, t) { var o = b.dataset.label || b.textContent; b.dataset.label = o; b.textContent = t; setTimeout(function () { b.textContent = o; }, 2200); }
  $("cf-x-xlsx").addEventListener("click", function () {
    var b = this, blob;
    try { blob = X ? workbook() : null; } catch (e) { blob = null; if (window.console) console.error("[finder] xlsx failed", e); }
    if (!blob) { save(csvBlob(), "FODO-competitors-" + stamp() + ".csv", "CSV"); flash(b, "Saved as CSV"); return; }
    save(blob, "FODO-competitors-" + stamp() + ".xlsx", "Excel").then(function (h) { if (h === "download") flash(b, "Downloaded ✓"); });
  });
  window.FODO_CF = { pins: function () { return Object.keys(markers).length; }, sheet: function () { return sheet; }, csv: toCSV, tsv: toTSV, rows: rowsFor, xlsx: function () { return workbook(); }, data: function () { return data; }, radius: function () { return [R1.km(), R2.km()]; }, sources: function () { return srcs; } };

  /* ================= start ================= */
  if (location.hash === "#brands") setMode("brand"); else setMode("local");
  if (qs.get("brand")) { setMode("brand"); bIn.value = qs.get("brand"); runBrand(); }
  else if (tIn.value.trim() && aIn.value.trim() && qs.get("type")) run();
})();
