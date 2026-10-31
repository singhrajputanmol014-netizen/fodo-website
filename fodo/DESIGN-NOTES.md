# FODO Studio redesign (2026-10-25)

## Concept
The hero has a single idea. The headline's last word, *disappear.*, is fading out, and a glass lens brings it back into focus. That is what FODO does for a brand. Everything else stays quiet: white editorial pages, ink type, and one accent colour (FODO iris, `#4C3BCF`). Liquid Glass is used only for controls (secondary buttons, header, round icon buttons). Content cards are solid surfaces.

## Tokens (css/studio.css)
| Token | Light | Dark | Role |
|---|---|---|---|
| `--paper` | `#FAFAFB` | `#101114` | Page background |
| `--surface` | `#FFFFFF` | `#17181C` | Cards, forms |
| `--mist` | `#F2F3F5` | `#1D1F24` | Quiet fills, chat bubbles |
| `--ink` | `#15161A` | `#F3F4F6` | Headings, primary button |
| `--graphite` | `#454A54` | `#C3C7CF` | Body text |
| `--slate` | `#636873` | `#9A9FA9` | Secondary text |
| `--accent` | `#4C3BCF` | `#9C91FF` | Links, focus, logo dot |

- **Type:** Outfit (display, 600 weight, tight tracking) and Manrope (body), as before.
- **Spacing scale:** `--s-1` to `--s-8`.
- **Radii:** `--r-xs` 8px, `--r-sm` 12px, `--r` 18px, `--r-lg` 26px, `--r-pill`.

## Buttons
| Type | Look |
|---|---|
| Primary `.btn` | Ink capsule with a top sheen and lower shade, plus a two-layer shadow. Porcelain capsule on dark surfaces. |
| Secondary `.btn.ghost` | Liquid Glass: tinted translucent fill, visible 1px edge, inner specular line and soft shadow. Falls back to a solid fill where `backdrop-filter` is not supported. |

States covered: hover (pointer devices only), active (press), `:focus-visible` (2px accent ring), `[disabled]` / `[aria-disabled]`, and `[aria-busy="true"]` (spinner).

## Removed decoration
- animated aurora background, grid textures and the loading screen
- "SEC 01" counters
- 01/02 corner counters on cards that aren't a sequence
- fade-up on every section (there is now one hero entrance)
- the fake growth-chart canvas in the hero

## Files
| File | Change |
|---|---|
| `css/studio.css` | **New.** Design system layer, loaded last |
| `scripts/build_pages.py` | New home hero markup, the `studio.css` link, and the dark closing CTA band. All pages regenerated. |
| `js/pages.js` | Lens positioning and pointer-follow (desktop only, off with reduced motion) |
| `tests/design-smoke.test.js` | **New** |

No new dependencies, fonts or images.

## Every page gets an art-directed hero (v2)
All heroes share one material: the glass objects of the home-page lens. Each page has one idea, and every label comes from the site's real content.

| Page | Visual |
|---|---|
| About | The six Growth System stages as rising glass columns |
| Services | Seven pillars orbiting "One system" |
| Industries | Seven playbook pills |
| Work | Three concept case cards, fanned |
| Insights | An article sheet under a lens |
| Resources | A checklist being ticked |
| Growth Score | A 0–100 dial |
| ROI | Three input sliders, labelled "Scenario, not a promise" |
| Game | A play button and the four rounds |
| Quiz | A real quiz question |
| Reviews | "Verified only" quote |
| FAQ | A real Q&A pair |
| Legal | A shield |
| Contact | Najafgarh pin with the NCR areas served |
| Thank-you | A check mark |
| 404 | The lens again, over "out." |

The 20 service pages get one visual per pillar:

| Pillar | Visual |
|---|---|
| Paid | Target, with the service's real channels |
| SEO | Search bar, with the page's own keyword |
| Content / social | Phone |
| Brand | Positioning and proof cards |
| Automation | Lead → reply → reminder → booked |
| Web | Landing page window |

Service pages also get an index strip: Channels, We track, You get (from data.js).

- **Code:** `scripts/hero_art.py` builds the visuals. CSS is section 17 of `css/studio.css`, and all classes are prefixed `g-` / `gt-` so they cannot collide with older styles.
- **Motion:** one staggered entrance per page, switched off with reduced motion.
- **Accessibility:** the visuals are `aria-hidden`.

## v3 — Editorial Noir (chosen direction, 2026-10-26)
The previous white "glass" version read as an Apple imitation, so the identity moved to an **editorial noir** system.

**Canvas and accent**
- Dark is the default. The canvas is `#0D1015` with `#EEF0F3` text.
- One violet spotlight (`#A193FF` on dark, `#5440D8` on paper).
- The light theme is the same system printed on cool paper `#F5F6F8`.

**Type**
- **Instrument Serif:** all headlines, with italic for the second thought.
- **Inter Tight:** reading and UI text.
- Both are self-hosted in `assets/fonts/` (OFL licences included). The Google Fonts request is gone, so the page makes fewer network calls and loads its fonts without depending on Google.

**Home hero**
- *disappear.* is set in italic and fades into the dark.
- A soft spotlight (radial mask) follows the pointer and brings the word back into focus. Without the pointer, it rests on the word.

**Inner heroes**
- Each page has a big serif headline plus an editorial side index of real content.
- That index lists the Growth System stages, the seven pillars, the case titles, a service's "What we do", and similar. Many entries link to the matching section.
- The glass "gadget" visuals were removed.

**Other changes**
- Closing call-to-action band: the one light panel on the dark page (inverted on paper).
- Footer: an oversized serif FODO wordmark.

## v4: Studio template system (2026-10-26)
This version follows the patterns of the marketplace references the client shared (OpenLayouts / Framer agency templates, WebbyTemplate). Those sites were readable as text only, so their exact visuals were not copied.

**Canvas and cards**
- Light stone canvas `#F4F4F2` with white cards (24px radius).
- The first card of a grid is a dark or violet feature tile spanning two columns.

**Type**
- Headlines: tight bold Inter Tight (600, about -0.05em tracking).
- Instrument Serif italic is kept as the second voice for one word, e.g. *disappear.*

**Buttons and labels**
- Primary: black pill with a violet arrow chip that turns on hover.
- Secondary: white pill with a hairline border.
- Section labels: pills with a dot.

**Home hero (centred)**
- A status pill. Its text comes from real data: Founding cohort Q4 2026 · 10 partner slots.
- Headline, lead copy and both buttons.
- Trust row with three true promises: free growth audit, ad spend stays in your accounts, no lock-in.
- A row of service-pillar pills, each linking to its service page.

**Inner pages**
- Centred hero with a pill label.
- The side index from v3 is now shown as a row of pills.

**Other**
- Closing band: solid violet `#5B3DF5`.
- Dark theme: the same system on charcoal.

## Scroll-driven 3D background (2026-10-26)
`js/scene3d.js` is about 8 KB of raw WebGL, with no library. One particle cloud (9,000 points on desktop, 3,600 on phones) morphs as the page scrolls:

| Order | Shape | Meaning |
|---|---|---|
| 1 | Orb | Attention |
| 2 | Ring | Demand |
| 3 | Rising wave | Growth |
| 4 | Double helix | System |
| 5 | FODO wordmark | Formed just before the footer |

**Movement and colour**
- On wide screens the shape drifts left and right between sections and follows the pointer a little.
- Colours follow the theme: ink and violet on light, white and violet on dark.

**Safeguards**
- Reduced motion: shows a single static orb.
- Data Saver: switched off.
- Hidden tab: paused.
- Pixel density is capped, and phones use fewer points.
- Without WebGL nothing is added to the page.
