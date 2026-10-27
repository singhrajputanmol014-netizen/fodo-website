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

/* fetchT(url, options, ms) must add a time limit. headers: extra headers (the server adds a User-Agent; browsers may not). */
export function freePlaces(fetchT, headers) {
  headers = headers || {};
  const place = (o, area) => Object.assign({ rating: null, reviews: null, phone: "", website: "", hours: "", open: null, status: "" }, o, { mapsUrl: gmapsSearch(o.name, o.address || area) });

  async function geocode(area) {
    const known = knownArea(area); if (known) return known;
    try {
      const r = await fetchT("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" + encodeURIComponent(area), { headers }, 7000);
      if (r.ok) { const j = await r.json(); if (j.length) return { lat: +j[0].lat, lng: +j[0].lon, label: j[0].display_name }; }
    } catch (e) {}
    const r2 = await fetchT("https://photon.komoot.io/api/?limit=1&q=" + encodeURIComponent(area), { headers }, 7000);
    if (!r2.ok) throw new Error("geocode " + r2.status);
    const f = ((await r2.json()).features || [])[0]; if (!f) return null;
    return { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], label: (f.properties && f.properties.name) || area };
  }

  async function overpass(type, area, c, radius, eps) {
    const tags = osmTags(type), around = `(around:${radius},${c.lat},${c.lng})`, word = String(type).replace(/["\\.*+?^${}()|[\]]/g, "").slice(0, 40);
    const parts = tags ? tags.map(([k, v]) => `nwr["${k}"~"^(${v})$"]["name"]${around};`) : ["shop", "amenity", "office"].map((k) => `nwr["name"~"${word}",i]["${k}"]${around};`);
    const q = `[out:json][timeout:10];(${parts.join("")});out center tags 60;`;
    let last = "";
    for (const ep of eps) {
      try {
        const r = await fetchT(ep, { method: "POST", body: "data=" + encodeURIComponent(q), headers: Object.assign({ "content-type": "application/x-www-form-urlencoded" }, headers) }, 7000);
        if (!r.ok) { last = r.status; continue; }
        const j = await r.json();
        return (j.elements || []).map((e) => {
          const t = e.tags || {}, lat = e.lat ?? (e.center && e.center.lat), lng = e.lon ?? (e.center && e.center.lon);
          const addr = [t["addr:housenumber"], t["addr:street"], t["addr:suburb"] || t["addr:neighbourhood"], t["addr:city"]].filter(Boolean).join(", ");
          return place({ id: e.type + "/" + e.id, name: t.name || t["name:en"] || "", address: addr, lat, lng, phone: t.phone || t["contact:phone"] || "", website: t.website || t["contact:website"] || "", hours: t.opening_hours || "",
            category: (t.amenity || t.shop || t.office || t.leisure || t.tourism || t.healthcare || "").replace(/_/g, " ") }, area);
        });
      } catch (e) { last = errName(e); }
    }
    throw new Error("overpass " + last);
  }

  async function nominatim(type, area, c, radius) {
    const b = bbox(c, radius), tags = osmTags(type);
    const words = [type].concat(tags ? [tags[0][1].split("|")[0].replace(/_/g, " ")] : []).filter((w, i, a) => a.indexOf(w) === i);
    let last = "";
    for (const w of words) {
      try {
        const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=40&bounded=1&extratags=1&addressdetails=1&viewbox=${b.minLng},${b.maxLat},${b.maxLng},${b.minLat}&q=` + encodeURIComponent(w);
        const r = await fetchT(u, { headers: Object.assign({ "accept-language": "en" }, headers) }, 7000);
        if (!r.ok) { last = r.status; continue; }
        const j = await r.json();
        const out = (j || []).filter((x) => x.name).map((x) => {
          const a = x.address || {}, t = x.extratags || {};
          const addr = [a.house_number, a.road, a.suburb || a.neighbourhood || a.quarter, a.city || a.town || a.city_district].filter(Boolean).join(", ");
          return place({ id: (x.osm_type || "n") + "/" + x.osm_id, name: x.name, address: addr, lat: +x.lat, lng: +x.lon, phone: t.phone || t["contact:phone"] || "", website: t.website || t["contact:website"] || "", hours: t.opening_hours || "", category: String(x.type || x.category || "").replace(/_/g, " ") }, area);
        });
        if (out.length) return out;
      } catch (e) { last = errName(e); }
    }
    if (last) throw new Error("nominatim " + last);
    return [];
  }

  async function photon(type, area, c, radius) {
    const b = bbox(c, radius), tags = osmTags(type);
    const tq = tags ? tags.flatMap(([k, v]) => v.split("|").map((x) => "&osm_tag=" + encodeURIComponent(k + ":" + x))).join("") : "";
    const u = `https://photon.komoot.io/api/?limit=40&lang=en&lat=${c.lat}&lon=${c.lng}&bbox=${b.minLng},${b.minLat},${b.maxLng},${b.maxLat}&q=` + encodeURIComponent(type) + tq;
    try {
      const r = await fetchT(u, { headers }, 7000);
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      return (j.features || []).filter((f) => f.properties && f.properties.name).map((f) => {
        const p = f.properties; const addr = [p.housenumber, p.street, p.district || p.locality, p.city].filter(Boolean).join(", ");
        return place({ id: (p.osm_type || "n") + "/" + p.osm_id, name: p.name, address: addr, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], category: String(p.osm_value || "").replace(/_/g, " ") }, area);
      });
    } catch (e) { throw new Error("photon " + errName(e)); }
  }

  /* search → { source, center, results, tried: [..] } ; throws only if every source failed */
  async function search({ type, area, center, radius }) {
    if (!center) center = await geocode(area);
    if (!center) return { source: "osm", center: null, results: [], note: "Area not found. Try adding the city, e.g. “Dwarka, Delhi”.", tried: [] };
    const steps = [["overpass", () => overpass(type, area, center, radius, OVERPASS.slice(0, 1))], ["nominatim", () => nominatim(type, area, center, radius)],
                   ["photon", () => photon(type, area, center, radius)], ["overpass-mirror", () => overpass(type, area, center, radius, OVERPASS.slice(1))]];
    const tried = []; let empty = false;
    for (const [name, fn] of steps) {
      try {
        const seen = new Set();
        const res = (await fn()).filter((p) => { const k = (p.name || "").toLowerCase().trim(); if (!k || p.lat == null || !isFinite(p.lat) || seen.has(k)) return false; seen.add(k); return true; });
        res.forEach((p) => { p.distance = dist(center, p); });
        const near = res.filter((p) => p.distance <= radius * 1.6).sort((a, b) => a.distance - b.distance).slice(0, 40);
        tried.push(name + ":" + near.length);
        if (near.length) return { source: "osm", via: name, center, results: near, tried };
        empty = true;
      } catch (e) { tried.push(String(e.message || e)); }
    }
    if (empty) return { source: "osm", center, results: [], tried };
    const err = new Error("all map servers failed"); err.tried = tried; throw err;
  }
  return { search, geocode };
}
