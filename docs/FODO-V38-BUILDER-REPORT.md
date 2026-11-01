# FODO v38: Website Builder "Level 100", engineering report

Scope: the "FODO Website Builder Level 100" brief. Rule followed: audit → preserve → refactor → redesign → connect → test. Nothing was rebuilt from scratch and no working feature was removed.

## 1. What was audited

**Routes:**
- `/website-builder/` with hash states: home, `#new=1`, `#site=<id>`, `&settings=`, `&preview=`, `#archived=1`.

**Modules:**
- `js/website-builder.js`: editor, canvas, undo/redo, autosave, conflicts.
- `js/wb-create.js`: home, wizard, gallery.
- `js/wb-panels.js`, `js/wb-v34.js`, `js/wb-assets.js`, `js/wb-collections.js`.
- `sites/lib/render.js`, `templates.js`, `industry.js`, `design.js`, `audit.js`.

**Backend:**
- `functions/api/sites/[[path]].js` and `functions/_lib/sites.js`, on D1 + KV.

**What already worked and is preserved:**
- **Gallery:** live previews, filters, favourites, recently viewed, device preview with style variations.
- **Wizard:** guided wizard with server-reported stages, plus import (SSRF-safe, rights-aware).
- **Canvas editing:** click-to-edit and inline text, drag & drop sections, components, collections.
- **Responsive and AI:** responsive overrides, Make Responsive, Responsive Health, AI command bar, AI Edit.
- **Saving and publishing:** versions, conflict dialog, offline save, publish with checks and audit score, domains, analytics, store, media library, SEO and Search Console.

**What was weak (matches the screenshots):**
- The home screen was an admin dashboard with a large empty area.
- The "What would you like to do?" screen was an oversized modal.
- There were only 37 templates in 10 categories.
- There was no global search outside the editor.
- No builder analytics.
- Plain error and loading text.
- Cramped editor tabs and raw property names in the inspector.

## 2. What changed

| Area | Change |
|---|---|
| Home | New composition: builder nav (Templates, My websites, Archived, Help, search ⌘K, New website) → hero with the AI creation workspace and a live website preview → Continue designing (your real websites in browser frames) → Featured designs (bento) → Popular industries → template gallery → What FODO does. Signed-out visitors get the same page; actions ask them to log in. |
| AI creation | Prompt box with animated border, cursor-reactive glow and typed example prompts (stops on focus); goal and style selectors; 6 example chips that fill the prompt. The goal and style are carried into the wizard. |
| Creation screen (`#new=1`) | Full-page: prompt on the left, live preview on the right, four compact paths, featured designs below. Replaces the boxed modal. |
| Generation | A website-assembling animation next to the real stage list. Stages still turn green only when the server reports them. |
| Templates | 37 → **214**. 177 come from a family generator (59 niche briefs × 3 styles × 3 layouts) built on the shared section library and design-system tokens. |
| Discovery | **24** industry categories with counts, 10 style pills, sort (Featured / Most used / Newest / A–Z), "More filters", paging (24 at a time), visual cards with browser chrome, hover overlay and favourites. |
| Popularity | "Most used" comes from real counts of websites created from each template (new `uses` map on `/api/sites/templates`). Nothing is invented. |
| Search / command palette | Ctrl/Cmd+K on the home page searches commands, your websites, templates, industries and styles. In the editor it covers commands (preview, publish, undo/redo, save version, history, audit, responsive health, make responsive, media, collections, settings, domain, design, SEO, devices), "Add <section>", pages, and **Ask FODO AI** for anything else (which runs the existing structured AI edit). Keyboard: ↑ ↓ Enter Esc. |
| Editor | Icon + label tab bar; readable property names; compact ✦ AI rewrite control; shortcuts (Ctrl+K/Z/Y/S) keep working while the canvas has focus; skeleton while opening; long section names no longer push the delete button out of the panel. |
| Website cards | Open / Preview / View live / ⋯ (Open, **Rename**, Duplicate, Share preview link, Settings, Archive, Delete). The menu is keyboard-navigable. |
| States | Skeleton loading on the home and editor. "We hit a problem. Your work is safe." error screen with Try again / Go back / Contact support (home and editor). |
| Motion | `css/wb-studio.css` motion presets: fade-up, fade, scale, blur reveal, float, gradient shift, shimmer, stagger. Hover lift, preview scroll on hover and the 3D preview tilt. Everything stops with `prefers-reduced-motion`; the rotating preview stops too. |
| Analytics | 10 builder events counted on the existing cookieless first-party endpoint (`/api/t`), and they respect Do Not Track: template previewed/selected, AI generation started/completed, website created, section added, previewed, published, palette used, example prompt. |

## 3. New architecture

- `sites/lib/families.js`:
  - niche briefs (copy, pages, goal, 3 styles)
  - `compose()` with 3 layouts
  - per-style palettes
  - `CATEGORIES` + `catsOf()`
  - `FEATURED`

  Adding a niche is one entry; adding a style is one line. `templates.js` appends the families after the 37 hand-made templates.
- `js/wb-home.js`: the home and shared hero pieces (`aiBox`, `heroVisual`, `errorState`).
- `js/wb-palette.js`: the generic palette (`openPalette(sources)`, ranking `score()`), `bindKey`, `track`.
- `css/wb-studio.css`: tokens (radius, shadow, easing, durations), motion presets, all new UI. One file, so styles are not duplicated across modules.

## 4. Backend changes

- `templateUses(env)`: counts websites created per template; `ai:` / import / blank creations are excluded. Returned as `uses` by `GET /api/sites/templates`. Only counts, no owners or ids.
- `functions/_lib/traffic.js`: builder event names added to the allow-list, with their detail recorded.
- No database migration. Existing websites, URLs, domains and assets are untouched.

## 5. Tests

- **New suite:** `tests/v38.test.mjs` (24 checks):
  - 214 unique templates
  - one H1 per generated page and no lorem
  - no invented reviews or numbers
  - families really differ (style, palette, layout)
  - industry copy
  - audit average ≥ 70
  - metadata
  - 24 non-empty categories
  - server resolves generated ids
  - creating from a generated template
  - real "Most used" counts without private data
  - builder events counted, unknown events ignored
  - palette ranking
  - recommendation ranking (curated templates win ties)
  - versioned modules
  - reduced motion
  - script-free previews
  - error state
  - canvas shortcuts
  - no fake social proof
- **`v21-e2e` (+12, Chromium):**
  - home hero, live preview and featured designs
  - example chips each fill their own prompt
  - categories and style filters
  - Ctrl+K finds and opens templates
  - phone layout at 390px for the home and creation screens
  - editor palette adds a section
- **Visual QA** at 1440, 768 and 390 px: no horizontal scroll. The only console errors were Google Fonts failing to download in the offline test sandbox.
- **Bugs found and fixed:**
  - the "Dental clinic" example chip filled the filmmaker prompt
  - Ctrl+K did nothing after clicking the canvas
  - long section names pushed the delete button out of the panel
  - the nav overflowed at 768px
  - sandboxed previews logged blocked-script errors

- **Full run (`npm test`):**

  | | Suites | Checks | Failing |
  |---|---:|---:|---:|
  | v37 | 54 | 3,324 | 0 |
  | v38 | 55 | 3,359 | 0 |

  - The first full run had one failure: generated templates outranked curated ones in recommendations. Ranking was fixed, then the unit, integration and builder groups were re-run clean.
  - SEO audit: 0 errors. Secret scan: clean.
- **Performance:**
  - Public pages are unchanged (median JS 38.4 KB).
  - `/website-builder/` is +38.9 KB gzip, mostly the 177 generated templates' copy (`families.js`, 20 KB gzip) and the new UI.
  - Template previews load lazily, 24 at a time.

## 6. Remaining limitations

Not implemented, so not claimed:

- **Element-level free editing:** free drag/resize, rulers, snapping guides, multi-select, group/lock per element, and a nested layers tree. The builder edits sections and their fields; free elements need a new document model.
- **Template images:** templates use colour-block image slots. No stock photo library is connected.
- **Inspiration feed:** "Use this style" from other websites is not built. Template style variations exist in the preview.
- **Brand kit:** no separate brand kit. Business details, design system and media library cover part of it.
- **Browsers:** tested in Chromium only. Safari and Firefox need a manual pass.
- **Template count:** 214 is not 500. Every niche added to `families.js` adds three.
- **Popularity data:** "Trending this week" is not shown because there is no real weekly data yet. "Most used" is all-time.

## 7. Recommended next steps

1. Connect an image source (Cloudflare Images or a licensed stock API) so templates and AI drafts get real photos.
2. Element-level layer (child elements inside sections) as a planned document-model change, with a migration.
3. A brand kit stored per account and applied when creating new sites.
4. Trending from `wb_template_selected` events once there are a few weeks of data.
