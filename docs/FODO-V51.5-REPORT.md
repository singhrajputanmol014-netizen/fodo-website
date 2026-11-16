# FODO v51.5 (16 November 2026)

Entity SEO: LinkedIn company page and Facebook Page linked across the site (completes the v51.4 social entity graph).

## Changes
- `scripts/seo_config.py`: `LINKEDIN_COMPANY` (https://www.linkedin.com/company/fodo_co_in/) and `FACEBOOK_PAGE` (facebook.com/profile.php?id=61576317054529); Organization `sameAs` is now [Instagram, X, LinkedIn company, Facebook Page].
- `scripts/build_pages.py`: inline ProfessionalService `sameAs` carries all four profiles + founder LinkedIn; `STATIC_FOOTER` adds LinkedIn and Facebook links (crawler-visible on all 113 routes).
- `js/config.js`: `linkedinCompanyUrl`, `facebookUrl`.
- `js/main.js`: `ico.fb` icon; JS footer renders "FODO on LinkedIn" and "FODO on Facebook" after the X link.

## Tested
- `python3 scripts/build_pages.py`: 113 routes + 404 rebuilt.
- `node scripts/check.mjs`: 951 files checked, nothing found.
- `node --check` on js/config.js and js/main.js: pass.
- Home entity graph `sameAs` verified to carry all four profiles.

## Note for Rohit
- The Facebook Page has no username yet; once @fodo set, update `FACEBOOK_PAGE` + `facebookUrl` to the clean URL.
- Google Business Profile ka Maps URL milte hi `sameAs` mein add karna (same pattern).
