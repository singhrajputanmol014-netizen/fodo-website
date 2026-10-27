/* FODO Competitor Finder — page logic for /competitor-finder/.
   Calls /api/competitors (Google Places when the key is set, OpenStreetMap otherwise), lists nearby businesses,
   shows the search and each business on an embedded Google Map, and gives a quick read of the area. */
(function () {
  "use strict";
  window.FODO_CF_VERSION = "6.3";
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
        if (!j.ok) throw Object.assign(new Error(j.reason || "failed"), { reason: j.reason, soft: j._s === 400 || j._s === 429 });
        show(j);
      }).catch(function (err) {
        clearTimeout(tm);
        var reason = err && err.reason ? err.reason : err && err.name === "AbortError" ? "The map servers took too long to answer." : "Could not reach the finder service.";
        if (err && err.soft) { busy = false; data = null; fallback(type, area, reason); return; }
        // server route failed — ask OpenStreetMap directly from the browser
        setStatus("Trying the map servers directly…", "busy");
        clientOSM(type, area, coords, +rIn.value).then(function (j) { j.direct = true; show(j); }, function (e2) { busy = false; data = null; fallback(type, area, reason + " " + (e2 && e2.message ? "(" + e2.message + ")" : "")); });
      });
  }
  function show(j) {
    busy = false; data = j; data.results.forEach(function (p, i) { p._i = i; });
    var n = j.results.length;
    setStatus(n ? n + " businesses found within " + km(j.radius) + (j.source === "google" ? " · from Google Maps" : " · from OpenStreetMap, with Google Maps links") : (j.note || "No listed businesses found. Try a bigger radius or a nearby area."), n ? "ok" : "warn");
    if (n) paint(); else list.innerHTML = '<li class="cf-empty">No listed businesses found here. Try a bigger radius, a nearby area, or check the Google map.</li>';
    insight();
  }

  /* ---- browser-side OpenStreetMap search (used only if /api/competitors is unreachable) ---- */
  var OSM_T = [["caf[e\u00e9]|coffee|chai|tea", [["amenity", "cafe"]]], ["restaurant|dhaba|food|biryani|pizza|eatery|diner", [["amenity", "restaurant|fast_food|food_court"]]], ["bakery|cake|sweet|mithai|halwai", [["shop", "bakery|confectionery|pastry"]]], ["dentist|dental", [["amenity", "dentist"], ["healthcare", "dentist"]]], ["clinic|doctor|physician|skin|derma|\\beye\\b|\\bent\\b|pediatric|gyn", [["amenity", "clinic|doctors"], ["healthcare", "clinic|doctor"]]], ["hospital|nursing home", [["amenity", "hospital"]]], ["pharma|chemist|medical store", [["amenity", "pharmacy"], ["shop", "chemist"]]], ["gym|fitness|crossfit", [["leisure", "fitness_centre|sports_centre"]]], ["yoga|pilates|zumba|dance", [["leisure", "fitness_centre|dance"], ["sport", "yoga"]]], ["salon|hair|barber|parlou?r|beauty|makeup|nail", [["shop", "hairdresser|beauty|cosmetics"]]], ["spa|massage", [["leisure", "spa"], ["shop", "massage"], ["amenity", "spa"]]], ["boutique|cloth|fashion|garment|saree|apparel", [["shop", "clothes|boutique|fashion|tailor"]]], ["jewel", [["shop", "jewelry"]]], ["mobile|phone shop", [["shop", "mobile_phone|electronics"]]], ["electronic|appliance|computer|laptop", [["shop", "electronics|computer|appliance"]]], ["supermarket|grocery|kirana|mart|general store", [["shop", "supermarket|convenience|grocery"]]], ["coaching|tuition|institute|academy|classes", [["amenity", "college|school|language_school|training"], ["office", "educational_institution"]]], ["play ?school|preschool|kindergarten|daycare", [["amenity", "kindergarten|childcare"]]], ["school", [["amenity", "school"]]], ["real estate|property|estate agent|broker", [["office", "estate_agent"], ["shop", "estate_agent"]]], ["hotel|guest ?house|hostel|stay", [["tourism", "hotel|guest_house|hostel|motel"]]], ["car dealer|showroom|bike dealer", [["shop", "car|motorcycle"]]], ["car repair|garage|mechanic|service centre", [["shop", "car_repair|tyres|motorcycle_repair"]]], ["chartered|accountant|\\bca\\b|tax", [["office", "accountant|tax_advisor"]]], ["lawyer|advocate|legal", [["office", "lawyer"]]], ["interior|furniture|decor", [["shop", "furniture|interior_decoration"], ["craft", "interior_work"]]], ["photograph|studio", [["shop", "photo"], ["craft", "photographer"]]], ["wedding|event|banquet", [["amenity", "events_venue|banquet_hall"], ["shop", "wedding"]]], ["bank|atm", [["amenity", "bank"]]], ["petrol|fuel|pump", [["amenity", "fuel"]]], ["pet|vet", [["amenity", "veterinary"], ["shop", "pet"]]], ["optic|spectacle|glasses", [["shop", "optician"]]], ["book|stationer", [["shop", "books|stationery"]]]], AREAS = {"najafgarh": [28.6092, 76.9798], "dwarka": [28.5921, 77.046], "uttam nagar": [28.6219, 77.055], "janakpuri": [28.6219, 77.0878], "rajouri garden": [28.6492, 77.122], "punjabi bagh": [28.6683, 77.132], "pitampura": [28.7036, 77.1318], "rohini": [28.7383, 77.0822], "connaught place": [28.6315, 77.2167], "karol bagh": [28.6519, 77.1907], "lajpat nagar": [28.5677, 77.2433], "saket": [28.5245, 77.2066], "hauz khas": [28.5494, 77.2001], "greater kailash": [28.5482, 77.238], "vasant kunj": [28.52, 77.159], "mayur vihar": [28.609, 77.294], "laxmi nagar": [28.6304, 77.2777], "preet vihar": [28.6418, 77.295], "gurugram sector 29": [28.4683, 77.064], "cyber city gurugram": [28.495, 77.089], "sohna road gurugram": [28.41, 77.044], "noida sector 18": [28.57, 77.326], "noida sector 62": [28.627, 77.365], "greater noida": [28.4744, 77.504], "indirapuram ghaziabad": [28.646, 77.369], "faridabad sector 15": [28.396, 77.326], "gurugram": [28.4595, 77.0266], "gurgaon": [28.4595, 77.0266], "noida": [28.5355, 77.391], "ghaziabad": [28.6692, 77.4538], "faridabad": [28.4089, 77.3178], "west delhi": [28.6519, 77.0597], "south delhi": [28.5355, 77.2167], "new delhi": [28.6139, 77.209], "delhi": [28.6139, 77.209]};
  var OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
  function tmo(ms) { if (window.AbortSignal && AbortSignal.timeout) return AbortSignal.timeout(ms); return undefined; }
  function known(area) { var n = area.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim(); var m = n.replace(/\b(new delhi|delhi|india|ncr)\b/g, "").replace(/\s+/g, " ").trim(); var k = AREAS[n] || AREAS[m]; return k ? { lat: k[0], lng: k[1], label: area } : null; }
  function geo(area) {
    var k = known(area); if (k) return Promise.resolve(k);
    return fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&viewbox=76.80,28.95,77.65,28.25&q=" + encodeURIComponent(area), { signal: tmo(8000) })
      .then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; })
      .then(function (j) { if (j && j.length) return { lat: +j[0].lat, lng: +j[0].lon, label: area };
        return fetch("https://photon.komoot.io/api/?limit=1&lat=28.61&lon=77.21&q=" + encodeURIComponent(area), { signal: tmo(8000) }).then(function (r) { return r.json(); }).then(function (g) { var f = (g.features || [])[0]; if (!f) throw new Error("area not found"); return { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], label: area }; }); });
  }
  function dist(a, b) { var R = 6371000, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r, h = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.pow(Math.sin(dLng / 2), 2); return Math.round(2 * R * Math.asin(Math.sqrt(h))); }
  function clientOSM(type, area, c, radius) {
    return (c ? Promise.resolve(c) : geo(area)).then(function (center) {
      var t = type.toLowerCase(), tags = null; for (var i = 0; i < OSM_T.length; i++) if (new RegExp(OSM_T[i][0]).test(t)) { tags = OSM_T[i][1]; break; }
      var around = "(around:" + radius + "," + center.lat + "," + center.lng + ")", w = type.replace(/["\\.*+?^${}()|[\]]/g, "").slice(0, 40);
      var parts = tags ? tags.map(function (kv) { return 'nwr["' + kv[0] + '"~"^(' + kv[1] + ')$"]["name"]' + around + ";"; }) : ["shop", "amenity", "office"].map(function (k) { return 'nwr["name"~"' + w + '",i]["' + k + '"]' + around + ";"; });
      var q = "[out:json][timeout:12];(" + parts.join("") + ");out center tags 60;";
      var tryEp = function (k) {
        if (k >= OVERPASS.length) return Promise.reject(new Error("map servers busy"));
        return fetch(OVERPASS[k], { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "content-type": "application/x-www-form-urlencoded" }, signal: tmo(12000) })
          .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).catch(function () { return tryEp(k + 1); });
      };
      return tryEp(0).then(function (j) {
        var seen = {}, res = (j.elements || []).map(function (e) {
          var g = e.tags || {}, lat = e.lat != null ? e.lat : e.center && e.center.lat, lng = e.lon != null ? e.lon : e.center && e.center.lon;
          var addr = [g["addr:housenumber"], g["addr:street"], g["addr:suburb"] || g["addr:neighbourhood"], g["addr:city"]].filter(Boolean).join(", "), nm = g.name || g["name:en"] || "";
          return { name: nm, address: addr, lat: lat, lng: lng, rating: null, reviews: null, phone: g.phone || g["contact:phone"] || "", website: g.website || g["contact:website"] || "", hours: g.opening_hours || "",
            mapsUrl: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([nm, addr || area].filter(Boolean).join(", ")), open: null, status: "",
            category: (g.amenity || g.shop || g.office || g.leisure || g.tourism || g.healthcare || "").replace(/_/g, " "), distance: lat != null ? dist(center, { lat: lat, lng: lng }) : null };
        }).filter(function (p) { var k = p.name.toLowerCase(); if (!k || p.lat == null || seen[k] || p.distance > radius * 1.6) return false; seen[k] = 1; return true; })
          .sort(function (a, b) { return a.distance - b.distance; }).slice(0, 40);
        return { ok: true, type: type, area: area || "your location", radius: radius, source: "osm", center: center, results: res };
      });
    });
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
