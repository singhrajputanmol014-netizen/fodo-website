# FODO v37

## 1. The Owner Brain can create a new website

New tool: `eng_site_create` (owner only, level 1). Ask "make a website for Sharma Dental in Dwarka, goal: more appointments".

- **Same pipeline as the builder wizard:** sitemap → design system → pages → AI copy → automatic quality audit and safe fixes.
- **Always a private draft** under the owner's account. The tool never publishes. Publishing stays `eng_site_publish`, which needs a level-2 confirmation.
- **Uses only the details given** (name, industry, area, goal, phone, email, WhatsApp). Review slots are clearly marked placeholders; no reviews are invented.
- **What it returns:**
  - pages
  - quality score
  - what still needs real details (photos, reviews, prices)
  - the editor link
- **Ownership:** move the site to the client later with Transfer ownership in the builder.
- **Access:** non-owners can't use it, and client accounts don't see the owner's drafts.

## 2. Chatbot panel styles load with the chatbot

The chatbot scripts already load on demand (v35). Its panel and message styles still loaded on every page. They now live in `css/bot.css`, which the chatbot loads before its scripts (4-second fallback).

- **Size:** every page loads 2.4 KB less CSS (gzip). `bot.css` is 4.7 KB, fetched only when someone opens the chat.
- **Launcher button:** stays in the main CSS, so it looks the same before the chatbot loads.
- **Kept in both places:** rules that mix chatbot and other selectors stay in the main CSS and are also copied into `bot.css` in their original order. That keeps the CSS cascade exactly as it was.
- **Checked against v36, element by element, on desktop and phone:** computed styles of all 50 elements in the open chatbot are identical, and screenshots of the launcher and the open panel are identical in dark/light × desktop/phone. The only difference is the page animation showing through the panel's rounded corners.
- **Editing from now on:** chatbot panel styles go in `css/bot.css`.

Measured, honestly: this is a small win. Most of the always-loaded CSS is the launcher button and the shared design system.

The next big step is unused CSS across the three layered stylesheets (60 KB gzip on every page). It needs a coverage-based audit with visual checks per page, so it should be its own phase.

## Tests

- **New suite:** `tests/v37.test.mjs` (12 checks):
  - Brain creates a multi-page draft, under the owner account, with the details given
  - no invented reviews
  - level 1, owner only, invisible to clients
  - a name is required
  - CSS split: panel rules moved, launcher kept, loaded by the chatbot first

Full run: see the table below.

| | Suites | Checks | Failing |
|---|---:|---:|---:|
| v36 | 53 | 3,312 | 0 |
| v37 | 54 | 3,324 | 0 |

Audits: SEO 106 pages, 0 errors / 0 warnings; secret scan clean.
