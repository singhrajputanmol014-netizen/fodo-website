# FODO v51.8 (16 November 2026)

Search Console fix: stop Google indexing JS/CSS asset URLs.

## Finding (GSC Page indexing report, 16 Nov)
- 61 "Crawled - currently not indexed" URLs were almost all /js/*.js?v=... and /sites/lib/*.js?v=... assets: wasted crawl budget and report noise.
- 27 "Alternate page with proper canonical tag" were the /fodo/ duplicates (already removed in v51.6; will clear on recrawl). Remaining reasons (404s, robots-blocked, noindex, redirect) are intentional or self-clearing.

## Change
- `scripts/build_pages.py` (_headers writer): `X-Robots-Tag: noindex` added for `/js/*`, `/css/*` and `/sites/lib/*`. NOT blocked in robots.txt, so Googlebot can still fetch assets to render pages; it just will not index the asset URLs.

## Tested
- Rebuilt 114 routes; `_headers` carries the new rules; check.mjs 632 files OK.

## Done in Search Console today (anmol@fodo.co.in)
- sitemap.xml resubmitted (113 pages discovered).
- Indexing requested: homepage + /insights/competitor-analysis-small-business/.
