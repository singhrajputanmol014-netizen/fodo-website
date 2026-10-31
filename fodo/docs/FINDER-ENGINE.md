# FODO Competitor Finder — v11 engine

## Why it was rebuilt
| Problem users saw | Root cause (v8) | v11 fix |
|---|---|---|
| Local search sometimes works, sometimes not | Sources were tried one after another, each with a 30–65 s timeout; one Overpass mirror (kumi.systems) no longer exists; no cache | All sources run **at the same time**; results appear as each one answers; own cached Overpass proxy `/api/osm` (24 h); dead mirror removed; second server is asked only if the first is slow (hedged) |
| Brand / startup mode gives nothing | Only Wikidata "industry" (P452) links — most Indian startups don't have them; hard stop when the brand isn't on Wikidata | Three layers together: same industry, **similar description** (keyword search), **AI suggestions** (Workers AI) checked on Wikidata. Brand not on Wikidata → still works |
| Export doesn't work in all formats | Excel needed a library from a CDN; sheet in localStorage (5 MB) silently stopped saving | Own Excel writer (no outside library), CSV with BOM, sheet kept in **IndexedDB** |
| Phone: file downloaded but not in Files | In-app browsers (Instagram/Facebook/LinkedIn) and some Android webviews ignore downloads made inside the page | Phone dialog: **Save or share file** (share sheet → Save to Files/Drive/WhatsApp), **Download** (real web download via `/api/export`, works everywhere), in-app browser hint, "where to find it" text, copy-box fallback for Google Sheets |

## Sources
| Mode | Source | Needs | Notes |
|---|---|---|---|
| Local | OpenStreetMap via `/api/osm` → public Overpass servers → Photon | nothing | free, every listed business, phone/website/hours when mapped |
| Local | Geoapify Places via `/api/geo` | `GEOAPIFY_KEY` (free: 3,000 credits/day ≈ 60,000 places, no card) | fills gaps, phone + website; results may be exported |
| Local | Google Places via `/api/competitors` | `GOOGLE_PLACES_KEY` (paid after free credit) | ratings, reviews; **shown on screen only** — Google's terms don't allow exporting its place details, so the sheet keeps the name + Google Maps link |
| Brand | Wikidata (industry, type, description search) | nothing | CC0 data |
| Brand | Workers AI `/api/brand-ai` | `AI` binding (already in wrangler.toml) | suggestions only; each checked on Wikidata, unconfirmed ones marked "AI suggestion — verify" |
| Both | Each competitor's own website `/api/enrich` | nothing | emails, phones, WhatsApp, socials |

Nominatim is used only to find the typed place (one look-up), never to list businesses — its usage policy forbids that.

## Setup (Cloudflare Pages → Settings → Variables and Secrets)
1. **GEOAPIFY_KEY** (recommended): sign up free at geoapify.com → My projects → create project → copy the API key → add as a *Secret* named `GEOAPIFY_KEY` → redeploy.
2. **GOOGLE_PLACES_KEY** (optional): as before.
3. KV binding `CHAT_KV` and AI binding `AI` are already in `wrangler.toml`.
4. Optional limits (per visitor per hour): `OSM_PER_HOUR` (80), `GEO_PER_HOUR` (60), `BRAND_AI_PER_HOUR` (30), `EXPORT_PER_HOUR` (40).

Check what's on: open `https://www.fodo.co.in/api/competitors?health=1` → `{"version":"11.0","google":…,"geoapify":…,"ai":…,"kv":…}`.

## Files
- `js/competitor-finder.js` — engine + UI (v11)
- `js/cf-export.js` — Excel/CSV writer, phone dialog, IndexedDB store
- `functions/_lib/free-places.js` → copied to `js/free-places.js` by the build — query builder, Geoapify normaliser, merge/dedupe
- `functions/_lib/finder-common.js` — rate limit, cache key, hedged fetch
- `functions/api/osm.js`, `geo.js`, `brand-ai.js`, `export.js`, `competitors.js`
- Tests: `tests/finder-v11-functions.test.mjs`, `tests/v11-finder.test.js`, `tests/v8-finder.test.js`, `tests/competitors-function.test.mjs`

## v12 — better brand & startup competitors
- Industry lists are weighted by how specific they are (a list of 120 companies counts more than one of 40,000); very broad "type"
  lists (website, mobile app, brand, startup …) are never used — they returned every website before.
- Keyword layer searches quoted phrases from the brand's description ("food delivery", "restaurant aggregator"), not every word.
- Closed companies (dissolved / end date) and the brand's own group (parent, owner, subsidiaries) are left out, and the status says so.
- Companies from the brand's own country rank higher.
- With `SERPER_API_KEY` set, the AI layer is grounded in two Google searches ("<brand> competitors", "<brand> alternatives"):
  a name is shown as "found in Google results" only if that result's text really contains it, with a link to where it was named.
  Costs 2 Serper searches per new brand (results cached 7 days).
