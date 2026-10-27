/* FODO Competitor Finder v7 — /competitor-finder/
   Two modes:
   • Local businesses — any business type near any place in the world. /api/competitors (Google Places when a key is set,
     free OpenStreetMap sources otherwise); if that route fails, the browser runs the same free search (js/free-places.js).
   • Brands & startups — competitors of any company or industry, from Wikidata (companies sharing the same industry).
   Typing suggestions: business types (built-in list), places (Photon, worldwide), brands/industries (Wikidata).
   Every result is added to one sheet in this browser; download it as Excel or CSV, or copy it into Google Sheets. */
(function () {
  "use strict";
  window.FODO_CF_VERSION = "7.0";
  var U = window.FODO_UTIL || {}, esc = U.esc || function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var $ = function (id) { return document.getElementById(id); };
  var form = $("cf"), bform = $("cfb"); if (!form || !bform) return;
  var tIn = $("cf-type"), aIn = $("cf-area"), rIn = $("cf-radius"), bIn = $("cf-brand"), cIn = $("cf-country");
  var status = $("cf-status"), list = $("cf-list"), frame = $("cf-frame"), read = $("cf-read"), filt = $("cf-filter"), mapBox = $("cf-map"), card = $("cf-brandcard");
  var mode = "local", data = null, sortBy = "best", coords = null, place = null, brandPick = null, busy = false;
  var tmo = function (ms) { return window.AbortSignal && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined; };
  var fetchT = function (u, o, ms) { return fetch(u, Object.assign({}, o, { signal: tmo(ms || 9000) })); };
  var mapSrc = function (q, z) { return "https://maps.google.com/maps?q=" + encodeURIComponent(q) + "&z=" + (z || 14) + "&output=embed"; };
  var km = function (m) { return m == null ? "" : m < 1000 ? m + " m" : (m / 1000).toFixed(1) + " km"; };
  var stars = function (r) { var f = Math.round(r), s = ""; for (var i = 1; i <= 5; i++) s += i <= f ? "★" : "☆"; return s; };
  var setStatus = function (t, kind) { status.textContent = t; status.className = "cf-status" + (kind ? " " + kind : ""); };
  var ver = function (diag) { var v = document.querySelector(".cf-ver"); if (v) v.textContent = "Finder v" + window.FODO_CF_VERSION + (diag ? " · " + diag : ""); };
  var LS = { get: function (k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

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
      timer = setTimeout(function () {
        Promise.resolve(source(q)).then(function (r) { if (my !== seq || document.activeElement !== input) return; items = (r || []).slice(0, 8); act = -1; paintL(); }, function () {});
      }, 180);
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
  var nrm = function (s) { return String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").trim(); };
  combo(tIn, $("cf-type-list"), function (q) {
    var n = nrm(q); var r = TYPES.filter(function (t) { return !n || nrm(t).indexOf(n) > -1; });
    r.sort(function (a, b) { return (nrm(a).indexOf(n) === 0 ? 0 : 1) - (nrm(b).indexOf(n) === 0 ? 0 : 1); });
    if (n && !r.some(function (t) { return nrm(t) === n; })) r.push(q.trim());
    return r.map(function (t) { return { label: t }; });
  }, function () {});
  var placeCache = {};
  combo(aIn, $("cf-area-list"), function (q) {
    if (q.length < 2) return [{ label: "Use my current location", value: "", sub: "Asks your browser for your location", near: true }];
    if (placeCache[q]) return placeCache[q];
    return fetchT("https://photon.komoot.io/api/?limit=7&lang=en&q=" + encodeURIComponent(q), {}, 6000).then(function (r) { return r.json(); }).then(function (j) {
      var seen = {}, out = (j.features || []).map(function (f) {
        var p = f.properties || {}, main = p.name || p.street || p.city || "", sub = [p.district, p.city !== main ? p.city : "", p.state, p.country].filter(function (x, i, a) { return x && a.indexOf(x) === i && x !== main; }).join(", ");
        return { label: main, sub: sub, value: [main, p.city !== main ? p.city : "", p.country].filter(Boolean).join(", "), lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
      }).filter(function (x) { var k = x.label + "|" + x.sub; if (!x.label || seen[k]) return false; seen[k] = 1; return true; });
      placeCache[q] = out; return out;
    }).catch(function () { return []; });
  }, function (it, typing) {
    if (typing) { place = null; coords = null; return; }
    if (!it) return;
    if (it.near) { useMyLocation(); return; }
    place = it; coords = { lat: it.lat, lng: it.lng };
  });
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
    mapBox.hidden = m !== "local"; if (m === "local") card.hidden = true; else card.hidden = !(data && data.mode === "brand");
    document.querySelectorAll('.cf-sort [data-sort="rating"],.cf-sort [data-sort="reviews"]').forEach(function (b) { b.hidden = m !== "local"; });
    $("cf-results").textContent = m === "local" ? "Nearby competitors" : "Brand & startup competitors";
    if (data && data.mode !== m) { data = null; list.innerHTML = '<li class="cf-empty">Run a search above — results appear here and are added to your sheet automatically.</li>'; read.textContent = "Run a search to get a quick read."; }
    if (focus) (m === "local" ? tIn : bIn).focus();
    try { history.replaceState(null, "", m === "brand" ? "#brands" : location.pathname + location.search); } catch (e) {}
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { setMode(t.dataset.mode, true); });
    t.addEventListener("keydown", function (e) { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); var n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); setMode(n.dataset.mode); } });
  });

  /* ================= local search ================= */
  var last = LS.get("fodo-cf", null); if (last) { tIn.value = last.t || ""; aIn.value = last.a || ""; if (last.r) rIn.value = last.r; if (last.lat != null) { coords = { lat: last.lat, lng: last.lng }; place = { lat: last.lat, lng: last.lng, value: last.a }; } }
  var qs = new URLSearchParams(location.search); if (qs.get("type")) tIn.value = qs.get("type"); if (qs.get("area")) { aIn.value = qs.get("area"); coords = null; place = null; }
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
  function clientFree(type, area, c, radius) {
    freeMod = freeMod || import((U.root || "/") + "js/free-places.js?v=" + window.FODO_CF_VERSION);
    return freeMod.then(function (m) { return m.freePlaces(fetchT, {}).search({ type: type, area: area, center: c, radius: radius }); })
      .then(function (o) { return { ok: true, type: type, area: area || "your location", radius: radius, source: o.source, via: o.via, center: o.center, results: o.results, note: o.note }; },
        function (e) { throw new Error(e && e.tried ? e.tried.join(", ") : (e && e.message) || "failed"); });
  }
  function run() {
    var type = tIn.value.trim(), area = aIn.value.trim();
    if (!type) { setStatus("Type a business type, for example “Cafe” or “Software company”.", "warn"); tIn.focus(); return; }
    if (!area && !coords) { setStatus("Type a place — any city, area or address — or use your location.", "warn"); aIn.focus(); return; }
    if (busy) return; busy = true; ver();
    var where = coords ? (area && area !== "Near me" ? area : "you") : area;
    frame.src = mapSrc(type + " near " + (coords ? coords.lat + "," + coords.lng : area), 14);
    LS.set("fodo-cf", { t: type, a: area === "Near me" ? "" : area, r: rIn.value, lat: place ? place.lat : undefined, lng: place ? place.lng : undefined });
    setStatus("Searching " + type + " near " + where + "…", "busy");
    list.innerHTML = '<li class="cf-empty">Looking up ' + esc(type) + " near " + esc(where) + "…</li>";
    var u = (U.root || "/") + "api/competitors?type=" + encodeURIComponent(type) + "&area=" + encodeURIComponent(area === "Near me" ? "" : area) + "&radius=" + rIn.value + (coords ? "&lat=" + coords.lat + "&lng=" + coords.lng : "");
    fetchT(u, { headers: { accept: "application/json" } }, 40000).then(function (r) {
      return r.json().catch(function () { return { ok: false, reason: r.status === 404 ? "The finder service is not deployed (404)." : "The finder service did not answer (code " + r.status + ")." }; })
        .then(function (j) { j._s = r.status; return j; });
    }).then(function (j) {
      if (!j.ok) throw Object.assign(new Error(j.reason || "failed"), { reason: j.reason, soft: j._s === 400 || j._s === 429, errors: j.errors });
      show(Object.assign(j, { mode: "local" }));
    }).catch(function (err) {
      var reason = err && err.reason ? err.reason : "Could not reach the finder service (" + ((err && err.message) || "network") + ").";
      if (err && err.soft) { busy = false; fallback(reason); return; }
      setStatus("Trying the map servers directly…", "busy");
      clientFree(type, area === "Near me" ? "" : area, coords, +rIn.value).then(function (j) { show(Object.assign(j, { mode: "local", direct: true })); },
        function (e2) { busy = false; fallback("Free map servers did not answer right now. Please try again in a minute.", reason + " · direct: " + ((e2 && e2.message) || "failed")); });
    });
  }
  function fallback(reason, diag) {
    data = null;
    var q = tIn.value.trim() + " near " + (coords ? coords.lat + "," + coords.lng : aIn.value.trim());
    setStatus(reason + " The map below still shows the Google Maps listings for your search.", "warn"); ver(diag);
    list.innerHTML = '<li class="cf-empty">The Google Maps view on this page shows the businesses for your search. <a href="https://www.google.com/maps/search/' + encodeURIComponent(q) + '" target="_blank" rel="noopener noreferrer">Open the full list on Google Maps ↗</a></li>';
    read.textContent = "Open the top three listings on Google Maps and compare their reviews, photos and hours with yours. That is where most local wins come from.";
  }

  /* ================= brand & startup search (Wikidata) ================= */
  bform.addEventListener("click", function (e) { var b = e.target.closest(".chip[data-brand]"); if (!b) return; bIn.value = b.dataset.brand; brandPick = null; runBrand(); });
  bform.addEventListener("submit", function (e) { e.preventDefault(); runBrand(); });
  var WD = "https://query.wikidata.org/sparql?format=json&query=";
  function sparql(q) { return fetchT(WD + encodeURIComponent(q), { headers: { accept: "application/sparql-results+json" } }, 30000).then(function (r) { if (!r.ok) throw new Error("wikidata " + r.status); return r.json(); }).then(function (j) { return j.results.bindings; }); }
  var val = function (b, k) { return b[k] ? b[k].value : ""; };
  var qid = function (uri) { return String(uri || "").split("/").pop(); };
  function resolveSeed(q) {
    if (brandPick && brandPick.id && nrm(brandPick.label) === nrm(q)) return Promise.resolve(brandPick);
    return fetchT("https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&origin=*&language=en&uselang=en&type=item&limit=1&search=" + encodeURIComponent(q), {}, 8000)
      .then(function (r) { return r.json(); }).then(function (j) { var x = (j.search || [])[0]; if (!x) throw Object.assign(new Error("not found"), { reason: "No company or industry called “" + q + "” was found. Try the full name, or pick one from the suggestions." }); return { id: x.id, label: x.label, sub: x.description || "" }; });
  }
  function runBrand() {
    var q = bIn.value.trim(); if (!q) { setStatus("Type a brand, company or industry — for example “Zomato” or “fintech”.", "warn"); bIn.focus(); return; }
    if (busy) return; busy = true; ver();
    var country = cIn.value, cname = cIn.options[cIn.selectedIndex].text;
    setStatus("Finding competitors of " + q + (country ? " in " + cname : "") + "…", "busy");
    list.innerHTML = '<li class="cf-empty">Looking up companies that compete with ' + esc(q) + "…</li>";
    resolveSeed(q).then(function (seed) {
      var S = "wd:" + seed.id, cf = country ? "?c wdt:P17 wd:" + country + " ." : "";
      var compQ = 'SELECT ?c ?cLabel ?cDescription ?website ?countryLabel ?hqLabel ?inception ?employees ?ciLabel ?article ?shared ?links WHERE {' +
        '{ SELECT ?c (COUNT(DISTINCT ?ind) AS ?shared) (MAX(?sl) AS ?links) WHERE { VALUES ?seed { ' + S + ' } { ?seed wdt:P452 ?ind . } UNION { BIND(?seed AS ?ind) } ' +
        '?c wdt:P452 ?ind . FILTER(?c != ?seed) ' + cf + ' ?c wikibase:sitelinks ?sl . } GROUP BY ?c ORDER BY DESC(?shared) DESC(?links) LIMIT 60 }' +
        'OPTIONAL { ?c wdt:P856 ?website . } OPTIONAL { ?c wdt:P17 ?country . } OPTIONAL { ?c wdt:P159 ?hq . } OPTIONAL { ?c wdt:P571 ?inception . } OPTIONAL { ?c wdt:P1128 ?employees . } OPTIONAL { ?c wdt:P452 ?ci . }' +
        'OPTIONAL { ?article schema:about ?c ; schema:isPartOf <https://en.wikipedia.org/> . } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }';
      var seedQ = 'SELECT ?sLabel ?sDescription ?indLabel ?countryLabel ?website ?inception WHERE { BIND(' + S + ' AS ?s) OPTIONAL { ?s wdt:P452 ?ind . } OPTIONAL { ?s wdt:P17 ?country . } OPTIONAL { ?s wdt:P856 ?website . } OPTIONAL { ?s wdt:P571 ?inception . } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }';
      return Promise.all([sparql(compQ), sparql(seedQ).catch(function () { return []; })]).then(function (r) {
        var rows = r[0], srows = r[1], by = {}, order = [];
        rows.forEach(function (b) {
          var id = qid(val(b, "c")); if (!by[id]) { by[id] = { id: id, name: val(b, "cLabel"), description: val(b, "cDescription"), websites: [], countries: [], hq: [], industries: [], founded: "", employees: "", wikipedia: val(b, "article"), shared: +val(b, "shared") || 0, links: +val(b, "links") || 0 }; order.push(id); }
          var o = by[id], add = function (arr, v) { if (v && arr.indexOf(v) < 0) arr.push(v); };
          add(o.websites, val(b, "website")); add(o.countries, val(b, "countryLabel")); add(o.hq, val(b, "hqLabel")); add(o.industries, val(b, "ciLabel"));
          var inc = val(b, "inception"); if (inc && (!o.founded || inc < o.founded)) o.founded = inc;
          var em = +val(b, "employees"); if (em && (!o.employees || em > o.employees)) o.employees = em;
          if (!o.wikipedia) o.wikipedia = val(b, "article");
        });
        var res = order.map(function (id) { var o = by[id]; return { mode: "brand", id: id, name: o.name, description: o.description, website: o.websites[0] || "", country: o.countries.join(", "), hq: o.hq[0] || "",
          founded: o.founded ? o.founded.slice(0, 4) : "", employees: o.employees || "", industry: o.industries.slice(0, 3).join(", "), wikipedia: o.wikipedia, wikidata: "https://www.wikidata.org/wiki/" + id, score: o.shared * 1000 + o.links }; })
          .filter(function (x) { return x.name && !/^Q\d+$/.test(x.name); });
        var seedInfo = { id: seed.id, label: seed.label, sub: seed.sub, industries: [], country: "", website: "", founded: "" };
        srows.forEach(function (b) { var i = val(b, "indLabel"); if (i && seedInfo.industries.indexOf(i) < 0) seedInfo.industries.push(i); seedInfo.country = seedInfo.country || val(b, "countryLabel"); seedInfo.website = seedInfo.website || val(b, "website"); seedInfo.founded = seedInfo.founded || val(b, "inception").slice(0, 4); if (val(b, "sDescription")) seedInfo.sub = val(b, "sDescription"); if (val(b, "sLabel")) seedInfo.label = val(b, "sLabel"); });
        return { ok: true, mode: "brand", type: seed.label, area: country ? cname : "Worldwide", seed: seedInfo, results: res, source: "wikidata" };
      });
    }).then(function (j) { show(j); }, function (e) {
      busy = false; data = null;
      setStatus(e && e.reason ? e.reason : "Wikidata did not answer right now — please try again in a minute.", "warn"); ver(e && e.message);
      list.innerHTML = '<li class="cf-empty">No results yet. Try another spelling, pick a suggestion while typing, or search an industry such as “food delivery”.</li>';
    });
  }

  /* ================= results ================= */
  function show(j) { try { show_(j); } catch (e) { busy = false; if (window.console) console.error("[finder] render failed", e); setStatus("Could not show the results.", "warn"); ver(e.message); } }
  function show_(j) {
    busy = false; data = j; data.results.forEach(function (p, i) { p._i = i; });
    var n = j.results.length;
    if (j.mode === "local") {
      setStatus(n ? n + " businesses found within " + km(j.radius) + (j.source === "google" ? " · from Google Maps" : " · from OpenStreetMap, with Google Maps links") : (j.note || "No listed businesses found. Try a bigger radius, another spelling or a nearby area."), n ? "ok" : "warn");
    } else {
      setStatus(n ? n + " competitors of " + j.type + " found" + (j.area !== "Worldwide" ? " in " + j.area : " worldwide") + " · from Wikidata" : "No competitors listed for " + j.type + (j.area !== "Worldwide" ? " in " + j.area + ". Try “Any country”." : ". Try its industry instead (e.g. “food delivery”)."), n ? "ok" : "warn");
      brandCard(j.seed);
    }
    ver(j.direct ? "direct" : "");
    if (n) { addToSheet(j); paint(); } else list.innerHTML = '<li class="cf-empty">Nothing listed here yet. Try a wider search.</li>';
    insight();
  }
  filt.addEventListener("input", paint);
  document.querySelector(".cf-sort").addEventListener("click", function (e) {
    var b = e.target.closest("[data-sort]"); if (!b) return; sortBy = b.dataset.sort;
    this.querySelectorAll("[data-sort]").forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); paint();
  });
  list.addEventListener("click", function (e) {
    var b = e.target.closest("[data-show]"); if (!b || !data) return;
    var p = data.results[+b.dataset.show]; if (!p) return;
    frame.src = mapSrc(p.name + ", " + (p.address || data.area), 16);
    list.querySelectorAll(".cf-item").forEach(function (li) { li.classList.toggle("on", li.dataset.i === b.dataset.show); });
    if (matchMedia("(max-width:899px)").matches) mapBox.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  var href = function (u) { return /^https?:/i.test(u) ? u : "https://" + u; };
  function paint() {
    if (!data) return;
    var f = nrm(filt.value);
    var r = data.results.filter(function (p) { return !f || nrm([p.name, p.address, p.description, p.country, p.industry, p.category].join(" ")).indexOf(f) > -1; }).slice();
    r.sort(function (a, b) {
      if (sortBy === "rating") return (b.rating || 0) - (a.rating || 0) || (b.reviews || 0) - (a.reviews || 0);
      if (sortBy === "reviews") return (b.reviews || 0) - (a.reviews || 0);
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return data.mode === "local" ? (a.distance == null ? 1e12 : a.distance) - (b.distance == null ? 1e12 : b.distance) : b.score - a.score;
    });
    if (!r.length) { list.innerHTML = '<li class="cf-empty">No result matches “' + esc(filt.value) + "”.</li>"; return; }
    list.innerHTML = r.map(function (p, k) { return data.mode === "local" ? localItem(p, k) : brandItem(p, k); }).join("");
  }
  function localItem(p, k) {
    var rate = p.rating != null ? '<span class="cf-rate" aria-label="Rated ' + p.rating + ' out of 5"><b>' + (+p.rating).toFixed(1) + '</b> <span aria-hidden="true">' + stars(p.rating) + '</span> <span class="muted">(' + (p.reviews || 0).toLocaleString("en-IN") + " reviews)</span></span>" : '<span class="cf-rate muted">Rating on Google Maps</span>';
    var flags = (p.open === true ? '<span class="cf-flag ok">Open now</span>' : p.open === false ? '<span class="cf-flag">Closed now</span>' : "") + (!p.website ? '<span class="cf-flag warn">No website listed</span>' : "") + (p.status && p.status !== "OPERATIONAL" ? '<span class="cf-flag">' + esc(p.status.replace(/_/g, " ").toLowerCase()) + "</span>" : "");
    return '<li class="cf-item" data-i="' + p._i + '"><span class="cf-n">' + (k + 1) + '</span><div class="cf-body"><h3>' + esc(p.name) + "</h3>" +
      '<p class="cf-meta"><span class="cf-cat">' + esc(p.category || "") + "</span>" + (p.category && p.distance != null ? " · " : "") + km(p.distance) + "</p>" + (p.address ? '<p class="cf-addr">' + esc(p.address) + "</p>" : "") + rate +
      (flags ? '<p class="cf-flags">' + flags + "</p>" : "") + (p.hours ? '<p class="cf-addr">Hours: ' + esc(p.hours) + "</p>" : "") +
      '<div class="cf-acts"><a class="btn sm" href="' + esc(p.mapsUrl) + '" target="_blank" rel="noopener noreferrer">Google Maps listing ↗</a><button type="button" class="btn sm ghost" data-show="' + p._i + '">Show on map</button>' +
      (p.lat != null ? '<a class="btn sm ghost" href="https://www.google.com/maps/dir/?api=1&amp;destination=' + p.lat + "," + p.lng + '" target="_blank" rel="noopener noreferrer">Directions</a>' : "") +
      (p.phone ? '<a class="btn sm ghost" href="tel:' + esc(String(p.phone).replace(/[^\d+]/g, "")) + '">Call</a>' : "") +
      (p.website ? '<a class="btn sm ghost" href="' + esc(href(p.website)) + '" target="_blank" rel="noopener noreferrer nofollow">Website</a>' : "") + "</div></div></li>";
  }
  function brandItem(p, k) {
    var facts = [p.country && ["Country", p.country], p.hq && ["HQ", p.hq], p.founded && ["Founded", p.founded], p.employees && ["Employees", (+p.employees).toLocaleString("en-IN")]].filter(Boolean);
    return '<li class="cf-item" data-i="' + p._i + '"><span class="cf-n">' + (k + 1) + '</span><div class="cf-body"><h3>' + esc(p.name) + "</h3>" +
      (p.industry ? '<p class="cf-meta"><span class="cf-cat">' + esc(p.industry) + "</span></p>" : "") + (p.description ? '<p class="cf-addr">' + esc(p.description) + "</p>" : "") +
      (facts.length ? '<dl class="cf-facts">' + facts.map(function (f) { return "<div><dt>" + f[0] + "</dt><dd>" + esc(f[1]) + "</dd></div>"; }).join("") + "</dl>" : "") +
      (!p.website ? '<p class="cf-flags"><span class="cf-flag warn">No website listed</span></p>' : "") +
      '<div class="cf-acts">' + (p.website ? '<a class="btn sm" href="' + esc(href(p.website)) + '" target="_blank" rel="noopener noreferrer nofollow">Website ↗</a>' : "") +
      (p.wikipedia ? '<a class="btn sm ghost" href="' + esc(p.wikipedia) + '" target="_blank" rel="noopener noreferrer">Wikipedia</a>' : "") +
      '<a class="btn sm ghost" href="https://www.google.com/search?q=' + encodeURIComponent(p.name + " company") + '" target="_blank" rel="noopener noreferrer">Google it</a>' +
      '<a class="btn sm ghost" href="https://www.linkedin.com/search/results/companies/?keywords=' + encodeURIComponent(p.name) + '" target="_blank" rel="noopener noreferrer">LinkedIn</a></div></div></li>';
  }
  function brandCard(s) {
    if (!s) { card.hidden = true; return; }
    card.hidden = false;
    card.innerHTML = '<span class="tag">YOUR SEARCH</span><h3>' + esc(s.label) + "</h3>" + (s.sub ? '<p class="muted">' + esc(s.sub) + "</p>" : "") +
      '<dl class="cf-facts">' + (s.industries.length ? "<div><dt>Industry</dt><dd>" + esc(s.industries.slice(0, 3).join(", ")) + "</dd></div>" : "") + (s.country ? "<div><dt>Country</dt><dd>" + esc(s.country) + "</dd></div>" : "") + (s.founded ? "<div><dt>Founded</dt><dd>" + esc(s.founded) + "</dd></div>" : "") + "</dl>" +
      (s.website ? '<a class="btn sm ghost" href="' + esc(href(s.website)) + '" target="_blank" rel="noopener noreferrer nofollow">Website ↗</a>' : "");
  }
  function insight() {
    if (!data) return;
    var r = data.results, n = r.length;
    if (!n) { read.textContent = data.mode === "local" ? "No listed competitors nearby — a strong Google Business Profile could make you the first name people see." : "No competitors listed — try the industry name or a different country."; return; }
    if (data.mode === "local") {
      var rated = r.filter(function (p) { return p.rating != null; }), noWeb = r.filter(function (p) { return !p.website; }).length;
      var avg = rated.length ? rated.reduce(function (s, p) { return s + p.rating; }, 0) / rated.length : null;
      var top = rated.slice().sort(function (a, b) { return (b.reviews || 0) - (a.reviews || 0); })[0];
      var near = r.filter(function (p) { return p.distance != null && p.distance <= 1000; }).length;
      var crowd = n >= 25 ? "very crowded" : n >= 12 ? "competitive" : n >= 5 ? "moderately competitive" : "open";
      read.innerHTML = "<b>" + n + "</b> " + esc(String(data.type).toLowerCase()) + " listings within " + km(data.radius) + " — the area looks <b>" + crowd + "</b>." + (near ? " " + near + " are within 1 km." : "") +
        (avg != null ? " Average Google rating: <b>" + avg.toFixed(1) + "★</b>." : "") + (top ? " Most reviewed: <b>" + esc(top.name) + "</b> (" + (top.reviews || 0).toLocaleString("en-IN") + " reviews) — that is the listing to study." : "") +
        " <b>" + noWeb + " of " + n + "</b> show no website" + (noWeb / n > 0.4 ? " — a good, fast site is an easy edge here." : ".");
    } else {
      var cc = {}; r.forEach(function (p) { (p.country || "Unknown").split(", ").forEach(function (c) { cc[c] = (cc[c] || 0) + 1; }); });
      var topC = Object.keys(cc).sort(function (a, b) { return cc[b] - cc[a]; }).slice(0, 3).map(function (c) { return esc(c) + " (" + cc[c] + ")"; }).join(", ");
      var yrs = r.map(function (p) { return +p.founded; }).filter(Boolean).sort(function (a, b) { return a - b; }), med = yrs.length ? yrs[Math.floor(yrs.length / 2)] : null;
      var young = yrs.filter(function (y) { return y >= new Date().getFullYear() - 10; }).length;
      read.innerHTML = "<b>" + n + "</b> companies compete in the same space as <b>" + esc(data.type) + "</b>. Most are in " + topC + "." + (med ? " Typical founding year: <b>" + med + "</b>" + (young ? "; " + young + " were founded in the last 10 years — the market is still moving." : ".") : "") +
        " Start with the top five: compare their positioning, pricing page and the channels they lead with.";
    }
  }

  /* ================= one sheet for every search + export ================= */
  var SHEET_KEY = "fodo-cf-sheet", sheet = LS.get(SHEET_KEY, { local: [], brand: [], searches: [] });
  var LOCAL_COLS = [["Search", "search"], ["Name", "name"], ["Category", "category"], ["Address", "address"], ["Phone", "phone"], ["Website", "website"], ["Rating", "rating"], ["Reviews", "reviews"], ["Open now", "openTxt"], ["Hours", "hours"], ["Distance (km)", "km"], ["Latitude", "lat"], ["Longitude", "lng"], ["Google Maps", "mapsUrl"], ["Source", "source"]];
  var BRAND_COLS = [["Search", "search"], ["Company", "name"], ["Description", "description"], ["Industry", "industry"], ["Country", "country"], ["Headquarters", "hq"], ["Founded", "founded"], ["Employees", "employees"], ["Website", "website"], ["Wikipedia", "wikipedia"], ["Wikidata", "wikidata"]];
  function addToSheet(j) {
    var label = j.mode === "local" ? j.type + " near " + (j.area || "you") : j.type + " · " + j.area, arr = sheet[j.mode], seen = {};
    arr.forEach(function (x) { seen[x.key] = 1; });
    var added = 0;
    j.results.forEach(function (p) {
      var key = j.mode === "local" ? nrm(p.name) + "|" + (p.lat != null ? (+p.lat).toFixed(4) + "," + (+p.lng).toFixed(4) : nrm(p.address)) : p.id;
      if (seen[key]) return; seen[key] = 1; added++;
      arr.push(j.mode === "local" ? { key: key, search: label, name: p.name, category: p.category || "", address: p.address || "", phone: p.phone || "", website: p.website || "", rating: p.rating == null ? "" : p.rating, reviews: p.reviews == null ? "" : p.reviews,
        openTxt: p.open === true ? "Yes" : p.open === false ? "No" : "", hours: p.hours || "", km: p.distance == null ? "" : +(p.distance / 1000).toFixed(2), lat: p.lat, lng: p.lng, mapsUrl: p.mapsUrl || "", source: j.source === "google" ? "Google Maps" : "OpenStreetMap" }
        : { key: key, search: label, name: p.name, description: p.description, industry: p.industry, country: p.country, hq: p.hq, founded: p.founded, employees: p.employees, website: p.website, wikipedia: p.wikipedia, wikidata: p.wikidata });
    });
    if (sheet.searches.indexOf(label) < 0) sheet.searches.push(label);
    LS.set(SHEET_KEY, sheet); sheetUI(added);
  }
  function sheetUI(added) {
    var n = sheet.local.length + sheet.brand.length;
    $("cf-sheet-n").textContent = n ? n + " competitors from " + sheet.searches.length + (sheet.searches.length === 1 ? " search" : " searches") + (added ? " · " + added + " new just added" : "") + " — download them all at once." : "Empty — every search you run is added here.";
    ["cf-x-xlsx", "cf-x-csv", "cf-x-copy", "cf-x-clear"].forEach(function (id) { $(id).disabled = !n; });
    $("cf-sheet").classList.toggle("has", !!n);
  }
  sheetUI(0);
  var cell = function (v) { v = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return v; };   // stop spreadsheet formula injection
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
  $("cf-x-clear").addEventListener("click", function () { if (!confirm("Clear all " + (sheet.local.length + sheet.brand.length) + " competitors from your sheet?")) return; sheet = { local: [], brand: [], searches: [] }; LS.set(SHEET_KEY, sheet); sheetUI(0); });
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
      [["local", "Local competitors"], ["brand", "Brands & startups"]].forEach(function (k) { if (!sheet[k[0]].length) return; var ws = X.utils.aoa_to_sheet(rowsFor(k[0])); ws["!cols"] = rowsFor(k[0])[0].map(function (h) { return { wch: Math.max(12, Math.min(48, h.length + 18)) }; }); ws["!autofilter"] = { ref: ws["!ref"] }; X.utils.book_append_sheet(wb, ws, k[1]); });
      X.writeFile(wb, "FODO-competitors-" + stamp() + ".xlsx");
      b.textContent = "Downloaded ✓";
    }, function () { download("FODO-competitors-" + stamp() + ".csv", new Blob(["﻿" + toCSV()], { type: "text/csv;charset=utf-8" })); b.textContent = "Excel unavailable — saved CSV"; })
      .then(function () { setTimeout(function () { b.textContent = o; b.disabled = false; }, 2200); });
  });
  window.FODO_CF = { sheet: function () { return sheet; }, csv: toCSV, rows: rowsFor };

  /* ================= start ================= */
  if (location.hash === "#brands") setMode("brand"); else setMode("local");
  if (qs.get("brand")) { setMode("brand"); bIn.value = qs.get("brand"); runBrand(); }
  else if (tIn.value.trim() && aIn.value.trim() && qs.get("type")) run();
})();
