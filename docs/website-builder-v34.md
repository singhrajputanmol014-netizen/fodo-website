# Website Builder v34

v34 builds on v28–v32 (it does not replace them). `website-builder-v32.md` still describes onboarding, the design system,
the audit, roles, sharing and import. This file covers what v34 adds.

## Responsive editing (desktop → tablet → mobile)

- **Devices:** the top bar has Desktop, Laptop (1280px), Tablet (820px) and Mobile (390px).
- **Which layer you edit:** Desktop and Laptop edit the base design. Tablet edits `style.tablet` and Mobile edits `style.mobile` on the selected section.
- **Clear labels:** the Style tab says which layer you are editing ("Editing: Mobile: changes here apply to phones only…"), and the bottom bar shows the device, width and layer.
- **Inheritance:** every field shows where its value comes from ("Inherits from tablet: 2 columns") and has Reset.
- **What can be overridden per breakpoint:** spacing, text size (70–120%), columns (1–4), alignment, width, card gap, stacked buttons, hide / show.
- **How it renders:** `render.js` turns the overrides into whitelisted classes (`t-*`, `m-*`). `respCss()` puts the rules inside `@media (max-width: tablet)` and `@media (max-width: mobile)`. Mobile rules come later, so they win on phones. Desktop never receives a tablet or mobile rule. Unknown keys are dropped.
- **Breakpoints:** 1024 / 767 by default. Advanced users can set `theme.bpTablet` / `theme.bpMobile` (360–1400).

## Make Responsive (preview, then Accept or Reject)

1. **Measure:** the real renderer runs in hidden sandboxed frames at tablet and 375px widths.
2. **Detect:** sections wider than the screen, oversized images / video, buttons wider than the screen or wrapping, text overflowing its box, grids with columns under 150px, very large phone spacing and stretched images.
3. **Propose:** rules only for the layer that has the problem (e.g. mobile: text 80%, 1 column, stacked buttons, smaller spacing).
4. **Review:** a phone preview of before and after with the list of changes.
5. **Decide:** Accept applies them through `change()`, so Undo works. Reject changes nothing. Desktop is never touched.

## Responsive Health

- Measures the page at 1440 / 1280 / 820 / 375px.
- Shows ✓ or ⚠ per breakpoint, with every issue.
- **Click an issue** to switch to that device and select the section.
- **Fix automatically** runs Make Responsive for that section.
- **Fix manually** opens the Style tab at that breakpoint.

## AI Edit for a section (✦ in the section header)

- **Actions:** Improve copy, Make shorter, Make premium, Make professional, Make friendly, Improve conversion, Rewrite for SEO, Translate to Hindi / English.
- **Preview first:** every text field of the section is rewritten through the existing `/rewrite` API, then you see a before / after list and a live preview.
- **Nothing changes until Apply.** Apply is one undo step.

## Saving, conflicts, offline

- **Status line:** Saving… / Saved just now / Unsaved changes / Offline: changes kept on this device / Sync failed: Retry.
- **Conflicts:**
  - Saves are optimistic (`rev`) and atomic on the server (`UPDATE … WHERE rev=?`). Two sessions saving at once: one wins, the other gets 409 with the server version and its time.
  - A dialog shows both versions, *Review changes* (which pages / sections differ), **Keep mine** and **Keep server**.
  - Keep mine first stores the server version in Version history (`keepServer`). Keep server leaves your version in Undo.
- **Offline:** a dropped connection shows "Offline" and retries with backoff, and again on the browser's `online` event. The local draft (`localStorage`) still protects against a closed tab.
- **Errors:** messages never show `undefined`, `[object Object]` or "Internal Server Error". `friendly()` turns them into "Something went wrong while saving. Your last saved version is safe."

## Canvas bar

- Zoom (30–150%), Fit, a 12-column grid overlay, the breakpoint chip, Responsive health and History.

## Password-protected pages

- Moved to PBKDF2 with a brute-force limit and a 12-hour signed cookie. Details are in `security-v34.md`.
- Older pages keep working with their old password.

## Not done in v34

- Free-form element-level drag / resize with snapping and spacing guides (editing stays section-level).
- A nested element layer tree.
- A full asset manager (folders, crop, WebP conversion).
- AI image tools.
- Per-page CMS collections beyond products and blog.
- Responsive overrides for typography families and absolute positioning (the builder has no absolute positioning).
