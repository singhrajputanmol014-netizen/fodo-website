/* Free (no-key) place search for the FODO Competitor Finder, shared by the Cloudflare function
   (functions/api/competitors.js) and the browser (copied to js/free-places.js by scripts/build_pages.py).
   Sources, tried in order until one returns businesses (v11):
     1. /api/osm, this site's own Overpass proxy with a 24-hour shared cache (fastest; protects the public servers)
     2. Overpass (OpenStreetMap) straight from the browser, 3 public servers, a second one only if the first is slow
     3. Photon (komoot, OpenStreetMap), fast category search, top 50
   Nominatim is used only to find the typed place (one look-up per search), never to list businesses:
   its usage policy does not allow downloading the points of interest of an area. */

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
export const OVERPASS = ["https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass-api.de/api/interpreter"];
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

/* The Overpass query for one search, shared by the browser, the server fallback and /api/osm (which only accepts this shape). */
export function overpassQuery(type, c, radius, max) {
  radius = Math.round(Math.min(MAX_RADIUS, Math.max(200, +radius || 2000)));
  const tags = osmTags(type), around = `(around:${radius},${(+c.lat).toFixed(6)},${(+c.lng).toFixed(6)})`, word = String(type).replace(/["\\.*+?^${}()|[\]]/g, "").trim().slice(0, 40);
  const parts = tags ? tags.map(([k, v]) => `nwr["${k}"~"^(${v})$"]${around};`) : [];
  if (!tags || radius <= 10000) {
    const w = word.split(/\s+/).filter((x) => x.length > 2 && !/^(shop|store|company|agency|centre|center|services?)$/i.test(x)).slice(0, 2);
    if (w.length) ["shop", "amenity", "office", "craft", "healthcare", "leisure", "tourism"].forEach((k) => parts.push(`nwr["${k}"]["name"~"${w.join(".*")}",i]${around};`));
  }
  if (!parts.length) parts.push(`nwr["name"~"${word}",i]["shop"]${around};`);
  const tmo = radius > 30000 ? 60 : radius > 10000 ? 40 : 25;
  return `[out:json][timeout:${tmo}][maxsize:268435456];(${parts.join("")});out center tags ${Math.min(5000, max || MAX_RESULTS)};`;
}

/* Geoapify Places (optional source via /api/geo) → the same flat record shape. Its raw OpenStreetMap tags fill the extras. */
export const GEO_CATS = [
  [/caf[eé]|coffee|chai|tea/, "catering.cafe"], [/restaurant|dhaba|food|biryani|pizza|eatery|diner/, "catering.restaurant,catering.fast_food"], [/bakery|cake|sweet|mithai/, "commercial.food_and_drink.bakery,commercial.food_and_drink.confectionery"],
  [/bar|pub/, "catering.bar,catering.pub"], [/dentist|dental/, "healthcare.dentist"], [/clinic|doctor|skin|derma|\beye\b|\bent\b/, "healthcare.clinic_or_praxis"], [/hospital|nursing home/, "healthcare.hospital"],
  [/pharma|chemist|medical store/, "healthcare.pharmacy"], [/gym|fitness|yoga|crossfit/, "sport.fitness"], [/salon|hair|barber|parlou?r|beauty|spa|nail/, "service.beauty"],
  [/boutique|cloth|fashion|garment|saree|apparel/, "commercial.clothing"], [/shoe|footwear/, "commercial.clothing.shoes"], [/jewel/, "commercial.jewelry"], [/mobile|phone shop|electronic|appliance|computer|laptop/, "commercial.elektronics"],
  [/supermarket|grocery|kirana|mart|general store/, "commercial.supermarket,commercial.convenience"], [/furniture|interior|decor/, "commercial.furniture_and_interior"], [/hardware|paint|tiles/, "commercial.houseware_and_hardware"],
  [/florist|flower/, "commercial.florist"], [/toy|gift/, "commercial.toy_and_game,commercial.gift_and_souvenir"], [/book|stationer/, "commercial.books,commercial.stationery"], [/optic|spectacle/, "commercial.health_and_beauty.optician"],
  [/pet|vet/, "pet"], [/school|play ?school|kindergarten/, "education.school,childcare"], [/coaching|tuition|institute|academy|classes/, "education"], [/hotel|guest ?house|hostel|stay/, "accommodation"],
  [/travel agen|tour operator/, "service.travel_agency,office.travel_agent"], [/real estate|property|estate agent|broker/, "office.estate_agent"], [/car dealer|showroom/, "commercial.vehicle"], [/car repair|garage|mechanic/, "service.vehicle.repair"],
  [/car wash/, "service.vehicle.car_wash"], [/chartered|accountant|\bca\b|tax/, "office.accountant,office.tax_advisor"], [/lawyer|advocate|legal/, "office.lawyer"], [/software|saas|\bit\b|tech|startup|app develop|web develop/, "office.it,office.company"],
  [/marketing|advertising|digital agency|branding|seo/, "office.advertising_agency,office.company"], [/cowork/, "office.coworking"], [/consult/, "office.consulting,office.company"], [/insurance/, "office.insurance"],
  [/financ|loan|investment|fintech|bank/, "office.financial,service.financial"], [/recruit|staffing|employment/, "office.employment_agency"], [/logistic|courier|freight/, "office.logistics,service.post"], [/wedding|event|banquet/, "entertainment,service"],
];
export function geoCats(type) { const t = String(type).toLowerCase(); for (const [re, c] of GEO_CATS) if (re.test(t)) return { cat: c, name: "" }; return { cat: "commercial,office,service,catering,healthcare,education", name: String(type).trim().slice(0, 40) }; }
export function fromGeoapify(f) {
  const p = (f && f.properties) || {}, raw = (p.datasource && p.datasource.raw) || {};
  if (!p.name || p.lat == null) return null;
  const t = Object.assign({}, raw, { name: p.name });
  const rec = fromTags(t, { id: "geo/" + (p.place_id || p.lat + "," + p.lon), lat: p.lat, lng: p.lon, source: "Geoapify" });
  rec.address = p.formatted || rec.address; rec.street = rec.street || [p.housenumber, p.street].filter(Boolean).join(" "); rec.city = rec.city || p.city || ""; rec.state = rec.state || p.state || ""; rec.postcode = rec.postcode || p.postcode || ""; rec.country = rec.country || p.country || "";
  rec.phone = rec.phone || (p.contact && p.contact.phone) || ""; rec.email = rec.email || (p.contact && p.contact.email) || ""; rec.website = rec.website || p.website || ""; rec.hours = rec.hours || p.opening_hours || "";
  rec.category = rec.category || String((p.categories || [])[0] || "").split(".").pop().replace(/_/g, " ");
  if (raw.osm_id && raw.osm_type) rec.osmUrl = "https://www.openstreetmap.org/" + ({ n: "node", w: "way", r: "relation" }[raw.osm_type] || raw.osm_type) + "/" + raw.osm_id;
  return Object.assign({ rating: null, reviews: null, open: null, status: "" }, rec, { mapsUrl: gmapsSearch(rec.name, rec.address) });
}

/* fetchT(url, options, ms) must add a time limit. headers: extra headers (the server adds a User-Agent; browsers may not).
   opts.proxy: URL of this site's /api/osm (browser only), tried first. */
export function freePlaces(fetchT, headers, opts) {
  opts = opts || {};
  headers = headers || {};
  const finish = (o, area) => Object.assign({ rating: null, reviews: null, open: null, status: "" }, o, { mapsUrl: o.mapsUrl || gmapsSearch(o.name, o.address || area) });

  async function geocode(area) {
    const known = knownArea(area); if (known) return known;
    try {
      const r2 = await fetchT("https://photon.komoot.io/api/?limit=1&q=" + encodeURIComponent(area), { headers }, 8000);
      if (r2.ok) { const f = ((await r2.json()).features || [])[0]; if (f) return { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], label: (f.properties && f.properties.name) || area }; }
    } catch (e) {}
    const r = await fetchT("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" + encodeURIComponent(area), { headers }, 8000);
    if (!r.ok) throw new Error("geocode " + r.status);
    const j = await r.json(); return j.length ? { lat: +j[0].lat, lng: +j[0].lon, label: j[0].display_name } : null;
  }

  // Overpass: every tagged business of this category in the circle, plus (for smaller circles) anything whose name contains the word.
  // Through the proxy: one request. Direct: the first server, a second only if the first has not answered in 6 s (first good answer wins).
  const parse = (j, area) => (j.elements || []).map((e) => {
    const lat = e.lat ?? (e.center && e.center.lat), lng = e.lon ?? (e.center && e.center.lon);
    return finish(fromTags(e.tags, { id: e.type + "/" + e.id, lat, lng, osmUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`, source: "OpenStreetMap" }), area);
  });
  async function ask(ep, q, ms) {
    const viaProxy = !/overpass|mail\.ru/.test(ep);
    const r = await fetchT(ep, viaProxy ? { method: "POST", body: q, headers: { "content-type": "text/plain" } } : { method: "POST", body: "data=" + encodeURIComponent(q), headers: Object.assign({ "content-type": "application/x-www-form-urlencoded" }, headers) }, ms);
    if (!r.ok) throw new Error(ep.split("/")[2] + " " + r.status);
    const j = await r.json();
    if (!j || !Array.isArray(j.elements)) throw new Error(ep.split("/")[2] + " bad answer");
    if (!j.elements.length && /runtime error|timed out|out of memory/i.test(j.remark || "")) throw new Error(ep.split("/")[2] + " server timeout");
    return j;
  }
  async function overpass(type, area, c, radius, eps, max) {
    const q = overpassQuery(type, c, radius, max), ms = (+/\[timeout:(\d+)\]/.exec(q)[1] + 20) * 1000;
    if (eps.length === 1) return parse(await ask(eps[0], q, ms), area);
    return new Promise((resolve, reject) => {
      const errs = []; let started = 0, finished = 0, done = false, timer = 0;
      const launch = () => {
        if (done || started >= eps.length) return;
        const ep = eps[started++];
        ask(ep, q, ms).then((j) => { if (!done) { done = true; clearTimeout(timer); resolve(parse(j, area)); } }, (e) => {
          finished++; errs.push(errName(e)); if (done) return;
          if (started < eps.length) { clearTimeout(timer); launch(); } else if (finished >= started) { done = true; reject(new Error("overpass " + errs.join(", "))); }
        });
        if (started < eps.length) timer = setTimeout(launch, 6000);
      };
      launch();
    });
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
    const steps = (opts.proxy ? [["cache", () => overpass(type, area, center, radius, [opts.proxy], max)]] : [])
      .concat([["overpass", () => overpass(type, area, center, radius, OVERPASS, max)], ["photon", () => photon(type, area, center, radius)]]);
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
