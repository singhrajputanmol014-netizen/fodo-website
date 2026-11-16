# FODO v51.7 (16 November 2026)

First full-depth Insights article, targeting "competitor analysis for small business".

## Changes
- `js/data.js`: new article `competitor-analysis-small-business` (cat SEO, 1,029 words), first in FODO_DATA.articles. Internal links to /competitor-finder/, /business-x-ray/ and /contact/.
- `scripts/seo_chunk.py`: ART_TITLES + ART_DESC overrides for the new slug (title 54 chars, description 151 chars).

## Tested
- build_pages: 114 routes + 404. check.mjs: 631 files OK.
- seo_audit.py: 120 pages, remaining errors/warnings are only the intentionally-noindexed /workspace/ and /fodo-pros/ shells. The new article page: no findings, Article schema with wordCount 1029.

## How blog posts are added (for reference)
1. Append an article object (slug, cat, title, date, body HTML in a template literal, no backticks/${}) to FODO_DATA.articles in js/data.js, newest first.
2. Optional: ART_TITLES / ART_DESC override in scripts/seo_chunk.py (title <=60, description 110-160).
3. `python3 scripts/build_pages.py` writes /insights/<slug>/ with Article schema, breadcrumbs, related links; sitemap updates automatically.
