# FODO v42: Website Builder pro tools

Six builder features from the v42 request: global components with per-copy overrides, design tokens, make responsive with a preview, desktop / tablet / mobile side by side, element duplicate / remove, and rulers with guides. Old websites render exactly as before. No migration is needed because all new data is optional JSON in the site document.

## 1. Global components (master → every copy)
- **Master edits:** "Save as component" already existed. Editing the master updates every page that uses it.
- **Edit mode switch:** the panel now shows how many times the component is used, plus a **"All copies (master) / This copy only"** switch.
- **This copy only:** edits are stored as overrides on that copy (`section.over`, top-level fields). Every other field keeps following the master.
- **Override list:** the panel lists the overridden fields and has **Reset to master**.
- **Canvas typing:** double-click typing on the canvas respects the mode. A field that is already overridden keeps its override.
- **Detach / delete component:** the copy keeps what it showed, overrides included.
- **Server:** keeps `over` only when the component still exists. The value must be an object with at most 30 keys. Content is cleaned like any other content and HTML-escaped when rendered.

## 2. Design tokens
- **Where:** Design panel → **Design tokens**.
- **Live colour tokens:** primary, secondary, accent, background, surface, text, muted text and border. Each shows its real resolved colour, including the automatic mixes.
- **New editable tokens:**
  - Muted text colour and border colour (with a reset to automatic).
  - Heading scale: tight, normal or bold.
  - Body text size, 14 to 19 px.
- **Token colours for elements:** the element Colour panel has token swatches. An element can use, for example, "Accent", and it follows the theme when the theme changes. The value is stored as `@a` and rendered as `var(--a)`.
- **Export:** "Copy CSS variables" and "Copy tokens (JSON)".
- **Server validation:** `scale` must be tight or bold, `base` must be between 14 and 19, and `muted` / `border` must be hex colours. Anything else is dropped.

## 3. Make responsive: preview, then Apply or Discard
- **Measure first:** the page or section is measured on a tablet and a 375 px phone. Every proposed change is listed with the reason, and each has its own checkbox.
- **Before / after preview:** shown for **Phone or Tablet**. The previews open at the first changed section.
- **Nothing changes until Apply:**
  - **Apply N changes** applies only the ticked ones. It is one Undo step.
  - **Discard** closes without changing anything.
- **Desktop is never touched.**
- **Honest note:** this is measurement-based layout fixing (overflow, narrow columns, wrapping buttons, large spacing). It is not a generative AI redesign.

## 4. Desktop / tablet / mobile side by side
- **Opening it:** bottom bar → **⊞ Side by side**.
- **What it shows:** three live previews of the current page (1280 / 820 / 390 px), each scaled to fit.
- **Live updates:** every edit in the right panel updates all three.
- **Switching device:** click a device name to close the view and edit on that device.

## 5. Element duplicate / remove
- **⧉ Duplicate (Ctrl+D):** adds a copy right after the element, up to 6 copies.
  - Copies share the element's style.
  - Each copy can have its **own text** in the new "Copies" box. Leave it empty to repeat the original.
  - Copies never carry the inline-edit hooks, so typing on a copy can't change the original.
  - Copies of the page's main H1 are rendered as H2, so every page still has exactly one H1.
- **🗑 Remove:** hides the element on every device. Undo, or un-tick Visibility, brings it back.
  - Elements are generated from the section's content, so "remove" is a restorable hide.
  - To delete content permanently (for example a list item), use the section's list ✕ as before.
- **Copies box controls:** "− One copy" and "Remove all copies".

## 6. Rulers and guides
- **Turning them on:** bottom bar → **Rulers**. Pixel rulers appear along the top and left of the canvas, in website pixels, correct at any zoom.
- **Adding a guide:** drag out of the left ruler for a vertical guide, or the top ruler for a horizontal guide.
- **While dragging:** the position is shown in px.
- **Removing guides:**
  - Drag a guide back onto the ruler, or double-click it, to remove it.
  - × in the corner clears all guides.
- **Storage:** guides are saved per website in this browser.
- **Limit:** guides are visual alignment aids. The builder uses a responsive flow layout, so elements don't snap to them.

## Files
- **New:**
  - `js/wb-v42.js` (tokens, side by side, rulers / guides, component override helpers).
  - `tests/v42.test.mjs`.
- **Changed:**
  - `sites/lib/render.js`: `compProps`, `SCALES`, token colours, `dupEl`.
  - `functions/_lib/sites.js`: `over`, `scale` / `base` / `muted` / `border` validation, API v42.
  - `js/website-builder.js`, `js/wb-elements.js`, `js/wb-v34.js`, `js/wb-panels.js`, `css/website-builder.css`.
  - `scripts/build_pages.py`: app v42.
  - `tests/v21-e2e.test.js`: +3 browser checks.
  - `tests/v39.test.mjs`, `tests/run.mjs`.
