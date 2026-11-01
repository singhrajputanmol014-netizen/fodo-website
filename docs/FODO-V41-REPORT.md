# FODO v41: Website Builder element-level design

The first and biggest item of the V41 brief (§10–§13): the builder goes from section-only editing to editing **individual elements**.

## What works

**Selecting elements**
- **Click any element on the canvas**: heading, text, link/button, image, list item or quote. The right panel becomes the **element inspector**, with a breadcrumb `Section › Element`. Click the section name to go back up.
- **Shift + click** adds or removes elements (within one section). Changes then apply to every selected element.

**Inspector**
- **Typography:** font (from the builder's font library), size, weight, line height, letter spacing, align, case, italic, underline.
- **Colour:** text, background, opacity.
- **Spacing & size:** padding, margin (CSS shorthand in px), max width.
- **Border & effects:** border width, colour, radius, shadow (small / medium / large / glow), rotate, scale.
- **Visibility:** hide on desktop / tablet / mobile.
- **Motion:** scroll entrance (fade, fade up/down, slide, scale, blur, reveal) and hover (lift, grow, glow). Reduced-motion visitors see none. Scroll entrance uses CSS scroll timelines, so browsers without them simply show the element.
- **Accessibility:** aria-label.

**Breakpoints**
- Switch the device to Tablet or Mobile, and edits are stored as overrides for that size only.
- Desktop styles cascade down; mobile edits never change desktop.

**Layers**
- Selecting a section lists every element in it ("Layers in this section"), with custom names, 🚫 hidden and 🔒 locked markers.
- Elements can be renamed and locked (locked = controls disabled).

**Keyboard and tools**
- Esc → back to the section.
- Delete → hide the element on the current device.
- Ctrl+Alt+C / Ctrl+Alt+V → copy / paste style.
- Undo / redo, autosave and versions work as before. Every change goes through the normal `change()` path.

**Phone editor:** tap an element, use the "Edit" chip, and the inspector opens as a bottom sheet.

## Storage and safety (backward compatible)

- **Format:** `section.el = { "<tag>-<n>": { name, lock, hide:{d,t,m}, st:{…}, t:{…}, m:{…}, anim, hover, aria } }`. The key is the n-th `<tag>` in that section.
- **One validator everywhere:** `cleanEl()` in `sites/lib/render.js` is used by the editor, the server (`validateDoc`) and the published-site renderer.
- **What it allows:** only known properties, numbers inside ranges, `#rrggbb` colours, listed keywords and known fonts. Names and aria-labels lose `<>"`. Nothing can inject CSS or HTML.
- **Old websites are unchanged:** a section without `el` renders exactly as before, and all 214 templates were tested for this. Live pages mark only styled elements; the editor marks every element.
- Exactly one H1 per page is still enforced.

## Known limits (honest)

- An element key is its position (e.g. the 2nd paragraph of the section). If you later add or remove a paragraph *before* a styled one in the same section, the style moves with the position.
- **Not in v41:**
  - free drag / resize, rulers, smart guides, group / ungroup, duplicating or deleting single elements (content still lives in the section);
  - global components with master → instance overrides;
  - design-token editor;
  - AI "make responsive" preview → apply;
  - side-by-side breakpoints;
  - motion timeline;
  - R2 private assets.

  These are the next builder versions.

## Tests

- **New `tests/v41.test.mjs` (15 checks):** old-document compatibility across all templates, validation / sanitising, desktop / tablet / mobile CSS, visibility, motion + reduced motion, aria, live-vs-editor markers, one H1, `validateDoc`, editor wiring.
- **`v21-e2e`, 3 new browser checks:** select and restyle a heading, Shift multi-select, Esc back to the section with its layers.
- **Full suite** (`node tests/run.mjs all`): **58 suites, 3,573 checks, 0 failing**.
