# FODO v48: Workspace Design 2.0 ("Signal")

The signed-in product (Workspace, FODO Pros, Marketplace admin) now carries the same personality as the public site. No behaviour changed: same pages, same API, same permissions. Only how it looks, reads and guides.

## The design idea

**Signal.** The public site is built around one purple signal dot (the FODO logo). Inside the product that dot becomes the *area accent*: every part of the app glows in its own colour, so you always know where you are, and the glow sits behind the page title like a stage light.

| Area | Accent | Pages |
|---|---|---|
| Grow | violet | Business X-Ray, Growth Lab, Content & Ads, AI Studio |
| Hire | teal | Build a Team, Hire FODO Pros, Quotes, Projects |
| Business | amber | Website Builder, CRM, Brand Kit, Files |
| Money | green | Billing, contracts, earnings |
| Pro | rose | the FODO Pros portal |
| FODO | blue | Marketplace admin |

Dark is the default (deep indigo black, not grey). Light is a soft lavender-grey with white cards and real shadows. Both come from one token set in `css/workspace-2.css`; every existing class maps onto it, so nothing had to be rewritten.

## What changed, page by page

**Shell**
- Sidebar in groups (Overview · Grow · Hire · Business · Account · FODO; for Pros: Dashboard · Work · You · Account) with 18 px line icons instead of unicode symbols; the active item carries the area accent.
- **Dark / light switch** in the sidebar (Workspace + Pros), in the Website Builder home bar and editor, and in the Owner Brain (already there). One saved preference (`fodo-theme`) across the public site and the apps.
- Gradient avatar from the person's name; "Become a FODO Pro" is a small card at the bottom for clients (not for staff).

**Overview (home)**
- A welcome card that speaks to the person by name and says what to do now.
- **Set up in 5 steps** with a progress ring: Brand Kit, website, X-Ray, content, CRM. Ticks from real data.
- "Next best actions" only when there are any.
- Stat cards only once there is data; before that, the six "What FODO can do for you" tiles explain each product in one sentence with a call to action.

**Guided empty states**
- Every empty screen shows the orbit mark, one sentence that says what the page is for, and where it helps a 3-step guide (Projects, Content, Ad campaigns, Pro requests) or sample search chips (Hire FODO Pros).

**FODO Pros home**
- Welcome card with the next job, profile ring with what is missing, a **This week** strip (7 days, booked days marked), earned badges, and only three stat cards (waiting / active / earned); the others appear when they have a value.

**Marketplace admin**
- The ten zero cards are gone; a status line shows the live counts that are not zero (applications, pending profiles, disputes, money held, owed). Mission Control's cards read "None yet" instead of 0.

**Forms**
- Brand Kit in three steps (Identity · Colours & type · Voice) with a **live preview card** that renders the name, tagline, colours, fonts and radius as you type.
- Fieldsets, inputs, focus rings, pills, tabs (scrollable, pill style), modals and toasts all restyled from the tokens.

## Files

- `css/workspace-2.css` (new, loaded after `workspace.css` by the Workspace and Pros shells).
- `js/workspace.js`: icons, groups, theme switch, `empty()` with guides, Overview, Pro home, admin header, Brand Kit preview.
- `js/wb-home.js`, `js/website-builder.js`: theme switch. `js/ws-mission.js`: zero cards.
- `functions/_lib/biz.js`: dashboard flags (brand, crm, xray) and the Pro's badges on the dashboard.
- `tests/v48.test.mjs`: 25 checks.
