# FODO v47.1: Build a Team, production catalog, pricing engine, versioned quotes, refund fix

The first phase of the V47 brief ("Production Marketplace + Team Builder + Admin OS"). The brief has about 180 sections, so V47 ships in phases. Each phase is complete, tested and deployable.

| Phase | Scope |
|---|---|
| **v47.1 (this)** | Refund fix, catalog, pricing engine, team builder engine, matching, Project Builder, quotes, admin catalog / quotes, Brain tools |
| v47.2 | Team invitations, acceptance, replacement and locking; availability engine (timezones, buffers, limits); bookings with database-level double-booking protection; equipment bookings |
| v47.3 | Contracts (versions, acceptance, amendments), payment plans → milestones, ledger, settlement, invoices, credit notes, reconciliation, Cashfree Easy Split adapter |
| v47.4 | Become a FODO Pro (public application pipeline), Profile 2.0, case studies, badges from real data, public /fodo-pros/ landing |
| v47.5 | Admin Mission Control: global search, Ctrl/Cmd+K, hiring intelligence, project command centre, alerts, exports |
| v47.6 | Large media (R2 multipart, resumable, signed URLs), Cloudflare Queues, calendar sync, organizations, full CI matrix |

## 1. Audit summary (what existed)

- **Business OS (`functions/_lib/biz.js`):** server-side roles, Pro profiles and moderation, projects with a state machine, milestones, bookings (unique per pro + day + slot), messages, reviews after completion, disputes, payouts.
- **Projects 2.0 (`projects2.js`):** teams via `biz_project_pros`, tasks, change requests, hourly time, retainers, refunds.
- **Payout adapters (`payouts.js`):** Cashfree Payouts and RazorpayX, idempotent transfer ids.
- **Files:** private R2 / KV files (`files.js`).
- **Platform:** DPDP privacy, notification preferences, `migrateOnce` migrations, admin analytics, enforced CSP on the app pages.

**The bug found:** `projects2.process()` set the milestone to `refunded` **before** the gateway confirmed the refund. It also created the partial-refund payout straight away, and left the milestone "refunded" even when the gateway call failed (`needs_manual`).

## 2. Critical refund fix

The milestone now follows:

`funded / submitted → refund_processing (held) → refunded` once the gateway or finance confirms

or

`→ failed`, with the earlier state restored.

| Situation | What happens now |
|---|---|
| Refund started | Milestone `refund_processing`. It can't be submitted, approved, paid out or completed, and the project can't be cancelled. |
| Gateway says SUCCESS (straight away, via **Check status**, or the daily scheduler) | Refund `refunded`, milestone `refunded`. Only now does the unrefunded rest of a partial refund become the pro's payout. |
| Gateway says FAILED / CANCELLED / REJECTED | Refund `failed`, milestone back to `funded` / `submitted`. |
| No gateway order / error | `needs_manual`, money held, until finance records the bank reference (**Mark sent**) or marks it **failed**. |

**Safety rules:**
- Every step is a guarded `UPDATE … WHERE status=…`. A double click, a retry or a second check cannot move money twice.
- Every step is audited (`refund:start / refunded / failed / manual`).
- **Schedule:** `POST /api/monitor/tick` checks refunds that are still processing.

**Workspace (staff):**
- The milestone shows "Refund in progress (held)".
- New buttons: **Check status** and **Mark failed**.

## 3. Production catalog (admin-managed)

**Roles:**
- 54 roles: production, camera, lighting, sound, art & styling, post, creative, marketing, business and web.
- Units: day / hour / project / month / item.
- Each role has a rate, a band, the FODO Pro roles that can fill it, and skills.

**Equipment:**
- 23 items.
- Client price per day, half day and week; partner cost; deposit; source (FODO / Pro / partner / vendor); inventory quantity.

**Benchmark seeds:**
- Every starting value is tagged **`benchmark_seed`** (shown as "seed" in Admin), taken from the brief's bands.
- Items without a benchmark in the brief (drone kit, tripod, teleprompter…) have **no rate**. The engine shows "rate to be confirmed", leaves them out of the total, and marks the total incomplete.
- A quote with unpriced items can't be sent.

**Project types:**
- 45 types (creative / production, marketing, business, custom), built on 13 families.
- Each family defines its questions, Essential / Professional / Premium teams, conditional rules, post-production factors, capacity and assumptions.
- **Conditional rules (examples):**
  - drone → drone operator + drone kit;
  - dialogue → sound recordist + audio kit;
  - 5+ talent → production coordinator;
  - 10+ setups → 1st AD;
  - studio lighting → gaffer;
  - styling → stylist + makeup;
  - photos → photographer + retoucher.
- **Admin editing:** admins can rename or switch off a type, change its team options, or create a new type on a family without code. Teams can use only catalog items.

**Who can change what:**
- Admins edit the catalog; finance and viewers read it.
- Pricing rules: **owners only**, a reason is required.
- **Price history** (`biz_price_history`): every change of rate, unit, status, rule or template, with old → new, who and why.
- Existing quotes keep their prices.

## 4. Pricing engine

**Client price** = people + equipment + production / location + post + travel + rush / weekend surcharge (crew) + **FODO production management** + contingency − discount + tax.

**Default rules (all editable by owners):**

| Rule | Default |
|---|---|
| Management fee bands | Up to ₹1L: 15 % · up to ₹3L: 12 % · up to ₹10L: 10 % · above ₹10L: 8 %, flagged "custom negotiated" |
| Fee limits | Minimum ₹7,500; optional maximum |
| Contingency | 5 % |
| Rush | 15 % if the shoot is within 3 days |
| Weekend | 0 % |
| Quote validity | 7 days |
| Payment plan | 50 / 50 |

- **Tax:** 18 % GST is added **only when `FODO_GSTIN` is set**. Otherwise it shows "Not charged", unless the owner forces it.
- **Internal view (staff only):** provider cost / payout, equipment price vs partner cost, FODO revenue, gross margin %, contingency held.
- **Client view:** grouped totals and line amounts, no margins.
- **Rates:** clients can change roles, quantities and days, never a rate or a discount.

## 5. Team builder engine and matching

**Estimate (`POST /api/biz/builder/estimate`) returns:**
- All three options, or one option with the client's changes (remove / add roles and equipment, quantity, days).
- **Capacity:** "With the Professional team, FODO estimates this scope can reasonably support…", with assumptions and honest warnings when asking for more.
- **Ways to reduce cost:** real savings and what you lose.
- **Budget fit:** whether each option fits the client's budget.

**Matching (`builder/match`):**
- **Hard filters, on the server:** role → onsite / city or travels → remote for online work → date (working day, blackout, notice, existing bookings).
- **Ranking:** the admin weights (role 25, skills 20, availability 15, portfolio 10, budget 10, location 5, experience 5, verified 5, completion 3, reliability 2).
- **"Why FODO recommends this Pro":** real facts only, never "AI selected".
- **Privacy:** clients don't see private day rates.

**Team availability (`builder/availability`):** "x / y roles have an available FODO Pro" on the date.

## 6. Build a Team (Workspace)

**Steps:**
1. **What do you need?** Shoot, Ads, Content, Website, Marketing, Branding, Business setup or Custom.
2. **Project type.**
3. **Questions.**
4. **Three team options** with estimated capacity.
5. **Choose an option and customise:**
   - quantity and days, remove (×), add role, add equipment;
   - **Who?** (matches and why);
   - **Check team availability**;
   - ways to reduce cost.
6. **Live price** (sticky on desktop).
7. **Save draft** or **Request a quote.**

**Notes:**
- Drafts can be resumed or deleted.
- Lazy-loaded (`js/ws-builder.js`), so the Workspace bundle doesn't grow.
- Tested at 1440 and 390 px with no overflow and no page errors.
- "Build my team" button on Hire FODO Pros.

## 7. Quotes

**Numbering:** FQ-YYMM-0001.

**States:** requested · draft · sent · viewed · negotiation · revised · accepted · rejected · expired · cancelled.

**Versions:**
- **Before the first send,** edits replace the draft.
- **After a send,** any edit creates the **next version**, with a change note the client sees.
- **Immutability:** a sent version is never changed.
- **What the client sees:** only sent versions; a FODO draft stays private.

**Acceptance:**
- **Checks:** the latest sent version only, plus an explicit "I agree" tick.
- **Recorded:** user, time, version, a SHA-256 hash of the IP (not the IP) and the browser.
- **Expiry:** an expired quote can't be accepted.
- **After acceptance:** nothing is charged; FODO confirms the team, then sends the contract and payment schedule (v47.3).

**Formats:**
- Web view.
- **Printable HTML:** cover page for large projects, executive summary, scope, deliverables, team, equipment, timeline, investment, payment schedule, assumptions, exclusions, terms, acceptance. Use Print → Save as PDF.
- WhatsApp / email summary.
- CSV line items (formula-injection safe).
- JSON.

**Admin:**
- List by status, full view with the internal margin cards, versions, activity timeline.
- **Edit:** team option, remove items, discount, management % / contingency % override, travel, location, validity, summary, notes.
- **Actions:** Send, Clone (re-priced with today's catalog, never the old prices), Cancel, Print, "New quote for a client".

## 8. Owner Brain (FODO Operations)

| Tool | Level | What it does |
|---|---|---|
| `marketplace_catalog` | 0 | Templates, role rates, equipment price and partner cost |
| `marketplace_team_recommend` | 0 | Team options with ESTIMATE label, FODO margin, capacity, warnings, ways to reduce |
| `marketplace_pricing_calculate` | 0 | "What if we remove the gaffer / give ₹30,000 off / add travel" |
| `marketplace_pros_search` | 0 | Who is available for a role, date and city, with reasons |
| `marketplace_quotes_list` | 0 | Quotes by status |
| `marketplace_quote_draft` | 1 | Prepares a private draft. **The Brain never sends quotes, payouts or refunds.** |

## 9. API (all under `/api/biz/`, session + same-origin, rate-limited)

**Builder:**

| Method | Endpoints |
|---|---|
| GET | `builder/catalog` · `builder/templates/<id>` · `builder/drafts` · `builder/drafts/<id>` |
| POST | `builder/estimate` · `builder/match` · `builder/availability` · `builder/drafts` |
| DELETE | `builder/drafts/<id>` |

**Quotes (client):**

| Method | Endpoints |
|---|---|
| GET | `quotes` · `quotes/<id>` · `quotes/<id>/print\|summary\|csv\|json` |
| POST | `quotes {buildId}` · `quotes/<id>/accept\|decline\|changes` |

**Admin:**

| Method | Endpoints |
|---|---|
| GET | `admin/catalog` · `admin/catalog/templates/<id>` · `admin/price-history` · `admin/quotes` · `admin/quotes/<id>` |
| POST | `admin/catalog/roles\|equipment\|templates` · `admin/pricing` · `admin/quotes` · `admin/quotes/<id>/revise\|send\|cancel\|clone` |

## 10. Database (additive, `migrateOnce`)

- **New tables:**
  - `biz_roles`, `biz_equipment`, `biz_templates` (seeded once with `INSERT OR IGNORE`; admin edits are never overwritten);
  - `biz_price_history`, `biz_builds`;
  - `biz_quotes`, `biz_quote_versions`, `biz_quote_events`.
- **New columns:** `biz_milestones.pre_refund`, `biz_refunds.attempts`.
- **Settings:** pricing rules are stored in `biz_settings` key `pricing`.

## 11. Tests

- **New `tests/v47.test.mjs`: 136 checks.** It covers:
  - the refund state machine (start, confirm, fail, manual, scheduler, idempotency, blocking);
  - seeds;
  - the engine (tiers, conditional rules, units, capacity, warnings, customisation, rate tampering, ways to reduce, budget, ads / web / content / custom);
  - pricing (fee bands, minimum, custom band, GST only with GSTIN, rush, discount, travel, internal view hidden from clients);
  - matching (filters, reasons, privacy, weights);
  - drafts and quotes (IDOR, versions, immutability, acceptance rules, expiry, clone, cancel, formats, unsent drafts private);
  - catalog admin (permissions, reasons, history, new roles / types, switching off, owner-only pricing rules);
  - Brain tools.
- **Updated `tests/v44.test.mjs`:** it now expects the held state instead of the old wrong "refunded".
- **Visual checks:** client flow, admin quote, catalog, pricing rules, printable quote, phone width. 0 page errors.

## 12. Setup

- Nothing new is required. The catalog seeds itself on first use.
- Then, in Workspace → Marketplace admin → **Catalog & pricing**:
  1. Replace the seed rates with FODO's real rates (each change asks for a reason).
  2. Set partner costs for equipment so margins are exact.
  3. Add rates for the items marked "not set" (drone, tripod…).
  4. Check the management fee bands and the default payment plan.
- **GST:** set `FODO_GSTIN` before charging it (check with your CA).
- **Legal:** the default quote terms are a starting text. Have them reviewed by a lawyer.
