/* Free (no-key) place search for the FODO Competitor Finder — shared by the Cloudflare function
   (functions/api/competitors.js) and the browser (copied to js/free-places.js by scripts/build_pages.py).
   Sources, tried in order until one returns businesses:
     1. Overpass (OpenStreetMap)  — richest: phone, website, hours       (3 servers)
     2. Nominatim (OpenStreetMap) — category search inside a box, with phone/website/hours
     3. Photon (komoot, OpenStreetMap) — fast category search
   Every call has its own time limit, so one slow server never blocks the next. */

export const OSM_TYPES = [
  // companies, startups and B2B first, so "software company" is not read as a "shop"
  [/software|saas|\bit\b|tech (company|startup)|app develop|web develop|startup/, [["office", "it|company|software|telecommunication|research"]]],
  [/marketing|advertising|digital agency|seo agency|branding|pr agency|media agency/, [["office", "advertising_agency|company|consulting"]]],
  [/cowork/, [["amenity", "coworking_space"], ["office", "coworking"]]],
  [/consult/, [["office", "consulting|company"]]],
  [/logistic|courier|freight|transport company/, [["office", "logistics|courier|company"], ["amenity", "courier"]]],
  [/insurance/, [["office", "insurance"]]],
  [/travel agen|tour operator|travel company/, [["shop", "travel_agency"], ["office", "travel_agent"]]],
  [/architect/, [["office", "architect"]]],
  [/ngo|non.?profit|charity/, [["office", "ngo|association|charity"]]],
  [/financ|loan|investment|fintech/, [["office", "financial|financial_advisor|company"], ["amenity", "bank"]]],
  [/recruit|staffing|employment|hr agency/, [["office", "employment_agency"]]],
  [/print/, [["shop", "copyshop|printing"], ["craft", "printer"]]],
  [/manufactur|factory|industrial/, [["man_made", "works"], ["industrial", "factory"], ["landuse", "industrial"]]],
  [/laundry|dry clean/, [["shop", "laundry|dry_cleaning"]]],
  [/florist|flower/, [["shop", "florist"]]],
  [/hardware|paint|tiles|sanitary/, [["shop", "hardware|doityourself|paint|tiles|bathroom_furnishing"]]],
  [/shoe|footwear/, [["shop", "shoes"]]],
  [/sport/, [["shop", "sports"], ["leisure", "sports_centre"]]],
  [/toy|gift/, [["shop", "toys|gift"]]],
  [/car wash/, [["amenity", "car_wash"]]],
  [/caf[eé]|coffee|chai|tea/, [["amenity", "cafe"]]],
  [/restaurant|dhaba|food|biryani|pizza|eatery|diner/, [["amenity", "restaurant|fast_food|food_court"]]],
  [/bakery|cake|sweet|mithai|halwai/, [["shop", "bakery|confectionery|pastry"]]],
  [/dentist|dental/, [["amenity", "dentist"], ["healthcare", "dentist"]]],
  [/clinic|doctor|physician|skin|derma|\beye\b|\bent\b|pediatric|gyn/, [["amenity", "clinic|doctors"], ["healthcare", "clinic|doctor"]]],
  [/hospital|nursing home/, [["amenity", "hospital"]]],
  [/pharma|chemist|medical store/, [["amenity", "pharmacy"], ["shop", "chemist"]]],
  [/gym|fitness|crossfit/, [["leisure", "fitness_centre|sports_centre"]]],
  [/yoga|pilates|zumba|dance/, [["leisure", "fitness_centre|dance"], ["sport", "yoga"]]],
  [/salon|hair|barber|parlou?r|beauty|makeup|nail/, [["shop", "hairdresser|beauty|cosmetics"]]],
  [/spa|massage/, [["leisure", "spa"], ["shop", "massage"], ["amenity", "spa"]]],
  [/boutique|cloth|fashion|garment|saree|apparel/, [["shop", "clothes|boutique|fashion|tailor"]]],
  [/jewel/, [["shop", "jewelry"]]],
  [/mobile|phone shop/, [["shop", "mobile_phone|electronics"]]],
  [/electronic|appliance|computer|laptop/, [["shop", "electronics|computer|appliance"]]],
  [/supermarket|grocery|kirana|mart|general store/, [["shop", "supermarket|convenience|grocery"]]],
  [/coaching|tuition|institute|academy|classes/, [["amenity", "college|school|language_school|training"], ["office", "educational_institution"]]],
  [/play ?school|preschool|kindergarten|daycare/, [["amenity", "kindergarten|childcare"]]],
  [/school/, [["amenity", "school"]]],
  [/real estate|property|estate agent|broker/, [["office", "estate_agent"], ["shop", "estate_agent"]]],
  [/hotel|guest ?house|hostel|stay/, [["tourism", "hotel|guest_house|hostel|motel"]]],
  [/car dealer|showroom|bike dealer/, [["shop", "car|motorcycle"]]],
  [/car repair|garage|mechanic|service centre/, [["shop", "car_repair|tyres|motorcycle_repair"]]],
  [/chartered|accountant|\bca\b|tax/, [["office", "accountant|tax_advisor"]]],
  [/lawyer|advocate|legal/, [["office", "lawyer"]]],
  [/interior|furniture|decor/, [["shop", "furniture|interior_decoration"], ["craft", "interior_work"]]],
  [/photograph|studio/, [["shop", "photo"], ["craft", "photographer"]]],
  [/wedding|event|banquet/, [["amenity", "events_venue|banquet_hall"], ["shop", "wedding"]]],
  [/bank|atm/, [["amenity", "bank"]]],
  [/petrol|fuel|pump/, [["amenity", "fuel"]]],
  [/pet|vet/, [["amenity", "veterinary"], ["shop", "pet"]]],
  [/optic|spectacle|glasses/, [["shop", "optician"]]],
  [/book|stationer/, [["shop", "books|stationery"]]],
];
export function osmTags(type) { const t = String(type).toLowerCase(); for (const [re, tags] of OSM_TYPES) if (re.test(t)) return tags; return null; }

// popular Delhi NCR areas: known centres, no geocoding call needed
export const AREAS = { "najafgarh": [28.6092, 76.9798], "dwarka": [28.5921, 77.046], "uttam nagar": [28.6219, 77.055], "janakpuri": [28.6219, 77.0878], "rajouri garden": [28.6492, 77.122],
  "punjabi bagh": [28.6683, 77.132], "pitampura": [28.7036, 77.1318], "rohini": [28.7383, 77.0822], "connaught place": [28.6315, 77.2167], "karol bagh": [28.6519, 77.1907],
  "lajpat nagar": [28.5677, 77.2433], "saket": [28.5245, 77.2066], "hauz khas": [28.5494, 77.2001], "greater kailash": [28.5482, 77.238], "vasant kunj": [28.52, 77.159],
  "mayur vihar": [28.609, 77.294], "laxmi nagar": [28.6304, 77.2777], "preet vihar": [28.6418, 77.295], "gurugram sector 29": [28.4683, 77.064], "cyber city gurugram": [28.495, 77.089],
  "sohna road gurugram": [28.41, 77.044], "noida sector 18": [28.57, 77.326], "noida sector 62": [28.627, 77.365], "greater noida": [28.4744, 77.504], "indirapuram ghaziabad": [28.646, 77.369],
  "faridabad sector 15": [28.396, 77.326], "gurugram": [28.4595, 77.0266], "gurgaon": [28.4595, 77.0266], "noida": [28.5355, 77.391], "ghaziabad": [28.6692, 77.4538], "faridabad": [28.4089, 77.3178],
  "west delhi": [28.6519, 77.0597], "south delhi": [28.5355, 77.2167], "new delhi": [28.6139, 77.209], "delhi": [28.6139, 77.209] };
export function knownArea(area) {
  const n = String(area || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const m = n.replace(/\b(new delhi|delhi|india|ncr)\b/g, "").replace(/\s+/g, " ").trim();
  const k = AREAS[n] || AREAS[m]; return k ? { lat: k[0], lng: k[1], label: area } : null;
}
export function dist(a, b) { const R = 6371000, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r; const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2; return Math.round(2 * R * Math.asin(Math.sqrt(h))); }
export const gmapsSearch = (name, addr) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([name, addr].filter(Boolean).join(", "));
const bbox = (c, r) => { const dLat = r / 111320, dLng = r / (111320 * Math.cos(c.lat * Math.PI / 180)); return { minLat: c.lat - dLat, maxLat: c.lat + dLat, minLng: c.lng - dLng, maxLng: c.lng + dLng }; };
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const errName = (e) => (e && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : (e && e.message) || "failed");
export const MAX_RADIUS = 100000;      // 100 km
export const MAX_RESULTS = 5000;

/* ---- turn raw OpenStreetMap tags into one flat, export-ready record ---- */
const first = (t, keys) => { for (const k of keys) if (t[k]) return String(t[k]); return ""; };
const handle = (v, base) => { if (!v) return ""; v = String(v).trim(); if (/^https?:\/\//i.test(v)) return v; return base + v.replace(/^@/, ""); };
export function fromTags(t, extra) {
  t = t || {};
  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  const locality = t["addr:suburb"] || t["addr:neighbourhood"] || t["addr:quarter"] || t["addr:district"] || "";
  const city = t["addr:city"] || t["addr:town"] || t["addr:village"] || "";
  const rec = {
    name: t.name || t["name:en"] || t.brand || "",
    category: (t.amenity || t.shop || t.office || t.leisure || t.tourism || t.healthcare || t.craft || t.industrial || "").replace(/_/g, " "),
    address: t["addr:full"] || [street, locality, city, t["addr:postcode"]].filter(Boolean).join(", "),
    street, locality, city, state: t["addr:state"] || "", postcode: t["addr:postcode"] || "", country: t["addr:country"] || "",
    phone: first(t, ["phone", "contact:phone", "telephone"]), mobile: first(t, ["mobile", "contact:mobile", "phone:mobile"]),
    whatsapp: first(t, ["contact:whatsapp", "whatsapp"]), email: first(t, ["email", "contact:email"]),
    website: first(t, ["website", "contact:website", "url", "brand:website"]),
    instagram: handle(first(t, ["contact:instagram", "instagram"]), "https://instagram.com/"), facebook: handle(first(t, ["contact:facebook", "facebook"]), "https://facebook.com/"),
    twitter: handle(first(t, ["contact:twitter", "twitter", "contact:x"]), "https://x.com/"), linkedin: handle(first(t, ["contact:linkedin", "linkedin"]), "https://linkedin.com/company/"),
    youtube: handle(first(t, ["contact:youtube", "youtube"]), "https://youtube.com/"),
    hours: t.opening_hours || "", brand: t.brand || "", operator: t.operator || "", cuisine: (t.cuisine || "").replace(/;/g, ", ").replace(/_/g, " "),
    description: t.description || "", wheelchair: t.wheelchair || "", delivery: t.delivery || "", takeaway: t.takeaway || "",
    payment: Object.keys(t).filter((k) => /^payment:/.test(k) && t[k] === "yes").map((k) => k.slice(8).replace(/_/g, " ")).join(", "),
    established: t.start_date || "", wikidata: t.wikidata ? "https://www.wikidata.org/wiki/" + t.wikidata : "",
    tags: Object.keys(t).filter((k) => !/^name:|^source|^note|^fixme/i.test(k)).map((k) => k + "=" + t[k]).join("; "),
  };
  return Object.assign(rec, extra || {});
}

/* fetchT(url, options, ms) must add a time limit. headers: extra headers (the server adds a User-Agent; browsers may not). */
export function freePlaces(fetchT, headers) {
  headers = headers || {};
  const finish = (o, area) => Object.assign({ rating: null, reviews: null, open: null, status: "" }, o, { mapsUrl: o.mapsUrl || gmapsSearch(o.name, o.address || area) });

  async function geocode(area) {
    const known = knownArea(area); if (known) return known;
    try {
      const r = await fetchT("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" + encodeURIComponent(area), { headers }, 8000);
      if (r.ok) { const j = await r.json(); if (j.length) return { lat: +j[0].lat, lng: +j[0].lon, label: j[0].display_name }; }
    } catch (e) {}
    const r2 = await fetchT("https://photon.komoot.io/api/?limit=1&q=" + encodeURIComponent(area), { headers }, 8000);
    if (!r2.ok) throw new Error("geocode " + r2.status);
    const f = ((await r2.json()).features || [])[0]; if (!f) return null;
    return { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], label: (f.properties && f.properties.name) || area };
  }

  // Overpass: every tagged business of this category in the circle, plus (for smaller circles) anything whose name contains the word
  async function overpass(type, area, c, radius, eps, max) {
    const tags = osmTags(type), around = `(around:${radius},${c.lat},${c.lng})`, word = String(type).replace(/["\\.*+?^${}()|[\]]/g, "").trim().slice(0, 40);
    const parts = tags ? tags.map(([k, v]) => `nwr["${k}"~"^(${v})$"]${around};`) : [];
    if (!tags || radius <= 15000) {
      const w = word.split(/\s+/).filter((x) => x.length > 2 && !/^(shop|store|company|agency|centre|center|services?)$/i.test(x)).slice(0, 2);
      if (w.length) ["shop", "amenity", "office", "craft", "healthcare", "leisure", "tourism"].forEach((k) => parts.push(`nwr["${k}"]["name"~"${w.join(".*")}",i]${around};`));
    }
    if (!parts.length) parts.push(`nwr["name"~"${word}",i]["shop"]${around};`);
    const tmo = radius > 30000 ? 60 : 25;
    const q = `[out:json][timeout:${tmo}][maxsize:268435456];(${parts.join("")});out center tags ${max || MAX_RESULTS};`;
    let last = "";
    for (const ep of eps) {
      try {
        const r = await fetchT(ep, { method: "POST", body: "data=" + encodeURIComponent(q), headers: Object.assign({ "content-type": "application/x-www-form-urlencoded" }, headers) }, (tmo + 5) * 1000);
        if (!r.ok) { last = r.status; continue; }
        const j = await r.json();
        return (j.elements || []).map((e) => {
          const lat = e.lat ?? (e.center && e.center.lat), lng = e.lon ?? (e.center && e.center.lon);
          return finish(fromTags(e.tags, { id: e.type + "/" + e.id, lat, lng, osmUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`, source: "OpenStreetMap" }), area);
        });
      } catch (e) { last = errName(e); }
    }
    throw new Error("overpass " + last);
  }

  // Nominatim: category search inside the box, paged with exclude_place_ids (up to 5 pages × 40)
  async function nominatim(type, area, c, radius) {
    const b = bbox(c, radius), tags = osmTags(type);
    const words = [type].concat(tags ? [tags[0][1].split("|")[0].replace(/_/g, " ")] : []).filter((w, i, a) => a.indexOf(w) === i);
    let last = "", out = [];
    for (const w of words) {
      const ex = [];
      for (let page = 0; page < 5; page++) {
        try {
          const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=40&bounded=1&extratags=1&addressdetails=1&namedetails=1&viewbox=${b.minLng},${b.maxLat},${b.maxLng},${b.minLat}&q=` + encodeURIComponent(w) + (ex.length ? "&exclude_place_ids=" + ex.join(",") : "");
          const r = await fetchT(u, { headers: Object.assign({ "accept-language": "en" }, headers) }, 9000);
          if (!r.ok) { last = r.status; break; }
          const j = await r.json(); if (!j.length) break;
          j.forEach((x) => { ex.push(x.place_id); if (!x.name) return; const a = x.address || {}, t = Object.assign({}, x.extratags || {});
            t.name = x.name; t["addr:housenumber"] = a.house_number; t["addr:street"] = a.road; t["addr:suburb"] = a.suburb || a.neighbourhood || a.quarter; t["addr:city"] = a.city || a.town || a.village || a.city_district; t["addr:state"] = a.state; t["addr:postcode"] = a.postcode; t["addr:country"] = a.country;
            if (!t.amenity && !t.shop && !t.office) t[x.category || "amenity"] = x.type;
            out.push(finish(fromTags(t, { id: (x.osm_type || "n") + "/" + x.osm_id, lat: +x.lat, lng: +x.lon, osmUrl: x.osm_type ? `https://www.openstreetmap.org/${x.osm_type}/${x.osm_id}` : "", source: "OpenStreetMap" }), area)); });
          if (j.length < 40) break;
        } catch (e) { last = errName(e); break; }
      }
      if (out.length) return out;
    }
    if (last && !out.length) throw new Error("nominatim " + last);
    return out;
  }

  async function photon(type, area, c, radius) {
    const b = bbox(c, radius), tags = osmTags(type);
    const tq = tags ? tags.flatMap(([k, v]) => v.split("|").map((x) => "&osm_tag=" + encodeURIComponent(k + ":" + x))).join("") : "";
    const u = `https://photon.komoot.io/api/?limit=50&lang=en&lat=${c.lat}&lon=${c.lng}&bbox=${b.minLng},${b.minLat},${b.maxLng},${b.maxLat}&q=` + encodeURIComponent(type) + tq;
    try {
      const r = await fetchT(u, { headers }, 8000);
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      return (j.features || []).filter((f) => f.properties && f.properties.name).map((f) => {
        const p = f.properties, t = { name: p.name, "addr:housenumber": p.housenumber, "addr:street": p.street, "addr:suburb": p.district || p.locality, "addr:city": p.city, "addr:state": p.state, "addr:postcode": p.postcode, "addr:country": p.country };
        t[p.osm_key || "amenity"] = p.osm_value;
        const ot = { N: "node", W: "way", R: "relation" }[p.osm_type] || "";
        return finish(fromTags(t, { id: (p.osm_type || "n") + "/" + p.osm_id, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], osmUrl: ot ? `https://www.openstreetmap.org/${ot}/${p.osm_id}` : "", source: "OpenStreetMap" }), area);
      });
    } catch (e) { throw new Error("photon " + errName(e)); }
  }

  /* search → { source, via, center, results (ALL within the radius, nearest first), tried } ; throws only if every source failed */
  async function search({ type, area, center, radius, max }) {
    radius = Math.min(MAX_RADIUS, Math.max(200, +radius || 2000));
    if (!center) center = await geocode(area);
    if (!center) return { source: "osm", center: null, results: [], note: "Place not found. Try adding the city and country, e.g. “Soho, London”.", tried: [] };
    const steps = [["overpass", () => overpass(type, area, center, radius, OVERPASS.slice(0, 1), max)], ["overpass-mirror", () => overpass(type, area, center, radius, OVERPASS.slice(1), max)],
                   ["nominatim", () => nominatim(type, area, center, radius)], ["photon", () => photon(type, area, center, radius)]];
    const tried = []; let empty = false;
    for (const [name, fn] of steps) {
      try {
        const res = dedupe(await fn());
        res.forEach((p) => { p.distance = dist(center, p); });
        const near = res.filter((p) => p.distance <= radius * 1.05).sort((a, b) => a.distance - b.distance);
        tried.push(name + ":" + near.length);
        if (near.length) return { source: "osm", via: name, center, radius, results: near, tried };
        empty = true;
      } catch (e) { tried.push(String(e.message || e)); }
    }
    if (empty) return { source: "osm", center, radius, results: [], tried };
    const err = new Error("all map servers failed"); err.tried = tried; throw err;
  }
  return { search, geocode };
}

/* remove duplicates (same name within ~120 m), keeping the record with the most filled-in fields */
const filled = (p) => Object.keys(p).filter((k) => p[k] !== "" && p[k] != null).length;
const nkey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, "");
export function dedupe(list) {
  const out = [], byKey = new Map();
  for (const p of list) {
    if (!p.name || p.lat == null || !isFinite(p.lat)) continue;
    const k = nkey(p.name), same = byKey.get(k) || [], dup = same.find((q) => dist(p, q) < 120);
    if (!dup) { out.push(p); same.push(p); byKey.set(k, same); }
    else Object.assign(dup, pick(p, dup));
  }
  return out;
}
const pick = (src, dst) => { const o = {}; for (const k in src) if (src[k] !== "" && src[k] != null && (!dst || dst[k] === "" || dst[k] == null)) o[k] = src[k]; return o; };
/* merge Google + OpenStreetMap: Google wins on rating/reviews/hours, OSM fills email, socials and tags */
export function mergeSources(google, osm) {
  const out = google.map((g) => Object.assign({}, g));
  for (const o of osm) {
    const k = nkey(o.name), m = out.find((g) => dist(g, o) < 150 && (nkey(g.name) === k || nkey(g.name).indexOf(k) > -1 || k.indexOf(nkey(g.name)) > -1));
    if (m) { Object.assign(m, pick(o, m)); m.source = "Google Maps + OpenStreetMap"; } else out.push(o);
  }
  return out;
}
