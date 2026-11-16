# FODO v51.4 (16 November 2026)

Entity SEO: X (Twitter) brand profile added across the site.

## Changes
- `scripts/seo_config.py`: new `X_PROFILE = "https://x.com/fodo_media"`; the Organization entity's `sameAs` is now `[INSTAGRAM, X_PROFILE]` (home page entity graph).
- `scripts/build_pages.py`: the inline ProfessionalService schema (contact page block) adds `https://x.com/fodo_media` to `sameAs`; `STATIC_FOOTER` now carries crawler-visible social links: Instagram @fodo.co.in and X @fodo_media.
- `js/config.js`: new `xHandle` / `xUrl` fields.
- `js/main.js`: new `ico.x` icon; the JS footer renders an X link after Instagram when `C.xUrl` is set.

## Tested
- `python3 scripts/build_pages.py`: 113 routes + 404 rebuilt.
- `node scripts/check.mjs`: 950 files checked, nothing found.
- `node --check` on js/config.js and js/main.js: pass.
- Verified `x.com/fodo_media` present in the home entity graph and location pages' static footer.

## Pending (needs URLs from Rohit)
- LinkedIn company page URL, Facebook Page URL, Google Business Profile Maps URL → add to `sameAs` and the footer the same way.
