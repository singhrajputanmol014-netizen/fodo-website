# FODO Website Builder — v32 (Complete Product Upgrade)

Everything below works end-to-end and is covered by `tests/v32-builder.test.mjs` (server, 54 checks)
and the builder section of `tests/v21-e2e.test.js` (browser, real clicks).

## Onboarding
- **Landing** (`/website-builder/`): prompt box ("Describe your website…"), features, templates.
- **Start options:** Build with AI · Guided (step by step) · Choose a template · Import a website · Start from blank.
- **Guided wizard:** type → industry (searchable, synonyms) → business info → goals → style (10 live previews,
  one recommended) → **editable AI sitemap** (rename / switch off / add pages; shows each page's sections) →
  Generate with AI or one of 3 recommended templates (match %).
- **Making screen** shows the real stages: understand → sitemap → design → pages → copy → QA → motion → open.
  If the AI copy step fails, the site still opens with a "Generation paused — Continue generation" banner (nothing is lost).

## Industry intelligence (`sites/lib/industry.js`)
24 industry profiles (dental, medical, restaurant, agency, real estate, fitness, salon, education, e-commerce,
tech/AI, nonprofit, events, …). Each sets the sitemap, CTA ("Book Appointment", "Reserve a Table" …), palette,
font pairing, motion level and schema type. Prompt parsing pulls industry, location, style and goals out of one sentence.

## Design system (`sites/lib/design.js`)
- 10 style presets: minimal, luxury, modern, corporate, creative, playful, dark, editorial, glass, futuristic —
  switch without rebuilding (optionally keeping your colours).
- 12 palettes (light + dark tokens), 12 font pairings from 19 fonts, button/shadow/density/container/hover tokens,
  light / dark / auto mode, automatic contrast fix.
- **Motion:** none / subtle / modern / dynamic / experimental + per-section entrance animation; respects reduced-motion.

## Editor
- Tabs: Add (33 section types, drag onto the canvas) · Sections · Pages · Design · SEO · Store · Layers (Advanced) · More.
- Right-click menu: duplicate, copy/paste, save as component, move, delete. Keys: Ctrl+S/Z/Y/D/C/V, Delete.
- Section **Style & animation**: background, padding, alignment, width, entrance, hide on mobile/desktop,
  fit-to-small-screens, anchor id, lock.
- Reusable **components** (edit once → updates everywhere; detach anytime).
- Typed **form builder** (text, email, phone, date, select, checkbox, textarea…), webhook (https only, SSRF-safe),
  email notification, thank-you page. Site **search** page.
- Legal pages (privacy, terms, refund, shipping, cookies) — generated as drafts marked **"needs review"**.
- Find & replace, cookie banner, WhatsApp button, custom code (only served on the client's own domain).

## Quality
- **Audit** (`sites/lib/audit.js`): 7 scores (Design, SEO, Performance, Accessibility, Mobile, Conversion, Security)
  from real checks. Every issue says problem → why → fix. "Fix all auto-fixable" shows before → after.
  "Check & fix mobile" measures the page at 375 px. Repeated issues count less, so one problem across 5 pages
  doesn't zero a score.
- New sites are audited + auto-fixed automatically at creation.
- **Publish** shows staged progress and a 10-point checklist; critical issues block publishing.

## Team & clients
- Roles: owner / admin / editor / viewer (Settings → Members). Transfer ownership.
- **Share preview links** (tokens, revocable) with client **Approve / Request changes** — owner gets an email.
- Dashboard: thumbnails, status, review state, leads, duplicate, archive/restore, delete.
- Owner can save any site as a **template** (business details become `{{variables}}`).

## Import
Paste a URL → FODO reads navigation, headings, colours, fonts, contact details (SSRF-safe fetch) and builds an
**original** FODO site with the same structure. You must confirm you have rights to the content.

## Owner Brain
- `eng_site_audit` — audit any client website by name/domain.
- `eng_site_fix` — apply the safe automatic fixes, saved as a draft (publish stays a separate, confirmed step).

## Not built yet (honest list)
- Free-form element-level drag/resize with alignment guides (editing is section-level).
- File-upload form fields; WhatsApp notifications (needs WhatsApp Business API).
- Multi-language switcher / RTL; per-breakpoint font sizes (mobile has fit/hide only).
- Version compare view; AI-generated image alt text; template "variations" are style presets, not separate designs.
