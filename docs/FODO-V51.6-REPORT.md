# FODO v51.6 (16 November 2026)

SEO hardening: removed the accidental duplicate site copy and verified the whole public site with scripts/seo_audit.py.

## Changes
- **Deleted the stray `fodo/` folder from the repo root.** It was a full duplicate copy of the site (from a zip paste that included the top-level folder), live at www.fodo.co.in/fodo/... as duplicate content: 334 audit errors (wrong canonicals, old v51.2-era pages, duplicate titles) all came from it.
- `_redirects`: added `/fodo/* /:splat 301` so any indexed /fodo/ URL permanently redirects to its canonical page.

## Audit result (scripts/seo_audit.py)
- Before: 224 pages, 334 errors, 41 warnings.
- After: 119 pages, 11 errors, 9 warnings — ALL remaining items are /workspace/ and /fodo-pros/, which are intentionally noindex app shells (CLAUDE.md rule 9) and correctly out of the sitemap. Public pages: clean.
- `node scripts/check.mjs`: 629 files, nothing found. Pages rebuilt (113 routes).

## Deploy note (IMPORTANT, for Rohit)
GitHub Desktop "Replace all" paste does NOT delete extra folders. Before committing:
1. Unzip and paste as usual into C:\GitHub\fodo-website.
2. **Manually delete the folder `C:\GitHub\fodo-website\fodo`** (the duplicate).
3. Commit + push. GitHub Desktop will show ~100+ deleted files under fodo/ — that is correct.
