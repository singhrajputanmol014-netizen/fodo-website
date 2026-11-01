# FODO v39: Website Builder inside the Growth Lab

Request: put the Website Builder into the main website's Growth Lab, with a reasonable price, some free templates, a login (like the other paid tools), included free in the bigger paid plans, and a much better phone UI.

## 1. Plans and prices (server-enforced)

All values live in `functions/_lib/plans.js` (`BUILDER`). The owner can change the two sellable prices in **Admin → Prices & tools → Website Builder plans**.

| Level | Price | Websites | Pages each | Templates | Custom domains | AI actions / day |
|---|---|---:|---:|---|---:|---:|
| Builder Free | ₹0, login needed | 1 | 6 | 16 free templates + AI builder + blank | 0 | 40 |
| Website Builder | ₹299 / month | 3 | 25 | every template | 1 | 300 |
| Builder Business | ₹799 / month | 10 | 60 | every template | 5 | 1,000 |
| Builder Agency | with the Agency plan only | 50 | 100 | every template | 50 | 4,000 |

**Included at no extra cost** (`BUILDER_IN_PLAN`):

| Growth Lab plan | Builder level included |
|---|---|
| Growth | Website Builder |
| Pro | Builder Business |
| Agency | Builder Agency |

FODO owners get everything free. Accounts with "unlimited" also get everything free.

**How an account's level is decided:**
- `accounts.builderTier()` takes the bigger of two things: a bought Builder month that is still running, and the level the active Growth Lab plan includes.
- Purchases are stored in the new columns `acct_users.builder_plan` and `builder_until` (added through the existing `MIGRATE` list).

**Checkout:**
- The checkout `kind` is `"builder"`, with `item` `builder` or `business`.
- The server sets the price.
- The payment is verified again with Razorpay or Cashfree before anything is granted.
- `grantBuilder` is idempotent per order: the same order never adds a month twice.
- Renewing the same level adds 30 days to the end date. Upgrading starts a fresh 30 days.

**The server refuses to sell:**
- a level the account already gets from its plan (for example, Pro buying Website Builder returns 409);
- Builder Agency on its own;
- unknown items.

## 2. Free templates and gating

- `sites/lib/templates.js` → `FREE_TEMPLATES` lists 16 original templates across 16 industries. These are restaurant, cafe, salon, gym, clinic, local service, store, portfolio, coaching, consultant, blog, startup, resume, NGO, pet care and photography.
- Every template object has `free: true/false`. The gallery badges and the server check use this same list.
- `createSite` (mode `template`) behaves as follows on a free account:
  - It refuses a paid template or a FODO custom template with **402**, `upgrade: true` and a link to `/plans/#builder`.
  - When no template is chosen, it auto-picks only free ones.
- AI building and blank starts stay free, with the same plan limits as before.
- New route `GET /api/sites/plan` returns this account's Builder level, its limits and the template counts.
- The `limits` returned by the list route now include `tier`, `tierName` and `allTemplates`.

**Fixed along the way:** `sites.LIMITS` had no `growth` entry, so Growth users silently got Free builder limits. Limits now come from `builderInfo()`.

## 3. Login

- Every builder API route already needed a session (401 with `login: true`), and that is unchanged.
- The public template catalogue stays browsable without a login, the same way the Growth Lab tool catalogue is public.
- Using the builder (creating, editing, publishing) always needs a login.

## 4. Growth Lab, plans page, account, help

**`/growth-lab/`:**
- A new "Website Builder" section (02). It has a free-start badge, the ₹299 price (refreshed live from `/api/lab/catalog`), a note that it is included in the bigger plans, and an "Open Website Builder" button.
- The catalogue (`CATALOG` in `functions/api/lab/[[path]].js`) has a `website-builder` entry, and the catalogue sends `builder` plans.

**`/plans/#builder`:**
- Four Builder plan cards. Static HTML is built from `plans.js`, so search engines see real prices.
- The JS then adds the right button for each card:
  - Choose / Renew
  - Included in your plan
  - Below your level
  - Start free

**`/account/`:**
- A "Website Builder" panel shows the level, how the account got it (plan or bought), the end date, the limits, and buttons to open the builder or upgrade.
- Builder purchases appear in the credit history as ✓.

**Help:**
- The help AI's live price facts now include the Builder prices.
- There is a new help article, "How much does the Website Builder cost?".

**Admin:** a new "Website Builder plans" price table (owner only, validated).

## 5. Builder app

**Gallery:**
- Each card has a **Free** or **🔒 Builder** badge, with the badge placed next to the ♥ button.
- There is a **Free** filter chip with a count.
- On a locked template, the button reads "Unlock" in the grid and "🔒 Unlock with Builder" in the preview.

**Upgrade sheet** (instead of an error):
- It explains the free plan and the Website Builder and Business plans, and that they are included in Growth, Pro and Agency.
- Buttons: See Builder plans, Show free templates, Build with AI (free).
- It also opens when the server answers 402 during creation.

**Home:**
- A "Your Builder plan" strip shows the level, its limits and an upgrade button.
- "+ New website" at the website limit opens the upgrade sheet before the wizard starts.

**Analytics:** new whitelisted event `wb_upgrade_shown`.

## 6. Phone UI (≤ 760 px)

**Editor (`js/wb-mobile.js` + CSS in `css/wb-studio.css`):**
- A compact top bar with back, name, save state, undo, redo and Publish. The desktop-only tools move to "More".
- The website preview fills the whole width and height. The desktop zoom bar is hidden.
- A bottom navigation: **Add · Sections · Edit · AI · More**. It respects the iPhone home bar (`safe-area-inset-bottom`).
- The left panel and the inspector open as **bottom sheets**. Each sheet has a title and ✕.
- A sheet closes with a tap outside, Escape, or a swipe down on its top bar.
- Tapping a section on the website shows a floating "✎ Edit Hero" chip instead of covering the page, so a double-tap can still edit text in place. Picking a section from the Sections list opens its settings directly.
- **More** opens a 3×3 menu: Pages, Design, SEO, Store, Preview, Audit, Share, Settings, and Forms/history.
- Inputs are 16 px (no iOS zoom). Touch targets are at least 40–44 px.

**Wizard:**
- The step pills form one scrollable row that keeps the current step in view.
- The Back/Next bar is sticky at the bottom.
- The recommendation cards fill the width and show Free or Builder.

**Desktop:** unchanged. The bottom navigation is hidden by CSS above 760 px, and an e2e check confirms it.

**Visual QA:**
- Screens: Growth Lab, plans and account at 390 and 1440; builder home, gallery, upgrade sheet, editor, each sheet, More menu and AI box at 390; wizard steps at 375.
- No sideways scroll anywhere.

## 6b. Builder System Health (from the V39/V40 brief, §3 "37 designs")

The template count in the builder was already computed from the data (`CR.all().length`), never typed in. A screen that shows "37 designs" is therefore running **pre-v38 files**: the v38 zip not deployed yet, or an old cached page.

**What was added:**
- `data/build.json` (build stamp) and `<meta name="fodo-build">` on `/website-builder/`. Every builder module was already versioned through the import map (v33.1).
- Public `GET /api/sites/version`: the server's real template count, a registry hash and the API version. It returns no account data.
- On load, the builder compares its own build and template count with the deployed ones. If they differ, it shows **"A newer version of the Website Builder is live, Reload"** instead of a wrong number.
- Owner-only `GET /api/sites/system-health`, plus a **Builder system health** button on the builder home (owners only). It shows:
  - the page build and the deployed build;
  - the API version;
  - the server and page template counts;
  - the registry hash;
  - the environment;
  - the cache status;
  - DB schema checks (sites, custom templates, v39 builder columns);
  - SITES_HOST, the sites secret (set / not set, never the value), the Cloudflare domains API and AI.

## 7. Tests

- New `tests/v39.test.mjs` (66 checks, including the version and system-health routes). It covers prices, levels, plan inclusion, owner access, free templates, login, gating, the auto-pick, website limits, checkout (amount, already included, unsellable plans, verify, idempotency), admin price changes and reset, the catalogue, the pages, help, the phone editor wiring and secrets.
- `v21-e2e`: 9 new browser checks. They cover the free plan strip, the Free filter, the upgrade sheet, the phone editor layout, the Add sheet, tap-outside close, chip → edit sheet, More → Design, and the unchanged desktop.
- `v13-accounts-e2e`: the X-Ray plan check now reads `#pl-grid .pl-card`, because the plans page also has Builder cards.
- Tests updated for the new rule that a paid template needs a Builder level:
  - `v28-builder` and `v38`: the paying test user is now on Growth, which includes the Website Builder.
  - `v38`: a free user trying a paid template is now an expected 402.

## 8. Not done / honest limits

- Builder subscriptions are one month at a time. Auto-renew for Builder plans isn't offered.
- When a plan ends, nothing is deleted and existing websites stay published. Creating more websites, paid templates or more domains is blocked. A website with more pages than the new limit can't be saved until pages are removed or the plan is renewed (same rule as before v39).
- Starter doesn't include the paid builder ("bigger plans" = Growth, Pro, Agency). Starter accounts that made more than one website earlier keep them all.
- The static help article's prices are written text. The help AI uses the live prices.

## 9. Final test run

- Full suite (`node tests/run.mjs all`): **56 suites, 3,435 checks, 0 failing**.
- `v13-accounts-e2e` and `xray-e2e` were run again on their own, on a clean machine:
  - `v13-accounts-e2e` failed in the first full run because its plans check used an outdated selector. After the test fix it passed 75/75.
  - `xray-e2e` failed in the first full run with a timeout. A leftover local test server from an earlier run was still on the same port; it passed 116/116 after a clean start. X-Ray code is unchanged in v39.
- `v21-e2e` was run again after the last change (106/106).
