# FODO v47.5: Admin Mission Control

The fifth phase of V47. Marketplace admin now opens on **Mission Control**: one screen that says what needs a FODO person today, a search across every marketplace record (Ctrl+K for staff), hiring intelligence from real team records, and audited CSV exports.

Every number on these screens is a count or a sum from FODO's own tables. Nothing is estimated.

## 1. Mission Control → Today

**Needs a FODO person** (only non-zero rows are shown, each links into the right admin tab):

| Group | Rows |
|---|---|
| Urgent | Teams starting within 3 days and not locked · Open disputes · Settlements in manual review |
| Expiring soon | Quotes expiring within 24 h · Team invitations expiring within 24 h |
| To do | Quote requests to answer · Quote drafts not sent · Quotes the client wants changed · Teams with open or declined slots · Contracts drafted, not sent · FODO Pro applications waiting · Profiles pending review · Case studies to moderate · Payouts to send |
| Waiting on someone else | Contracts waiting for the client's signature · Work submitted, waiting for client approval · Refunds in progress or needing a hand · Approved professionals without a payout method |

Money rows (settlements, payouts, refunds, payout methods) and the money totals appear only for admin, finance and viewer roles. Moderators see the rest.

**Also on the screen:** totals (open quotes, teams locked or active, active projects, live professionals, money held, money owed), the next 12 team dates with confirmed / total slots, and the latest 15 staff actions from the audit log.

## 2. Search (Ctrl+K)

Staff get two things in the Ctrl+K box:
- **Admin jumps:** Mission Control, Quotes, Teams, Contracts & money, Pro applications, Professionals, Catalog & pricing, Payouts, Disputes, Hiring intelligence, Exports, Analytics.
- **"FODO · …" groups** from `admin/search`: Quotes (number, title, client email), Teams (title, city, date), Contracts, Projects, Professionals (any status: name, role, city, skills, specializations, email), Applications (name, role, email), Clients (accounts), and for finance roles Invoices and Payouts. A role word also offers "Who can do <role>" → hiring intelligence.

Results deep-link into the record: a quote, team or contract opens directly; a professional opens their profile; an application opens its detail.

Clients still get only their own search. Suspended or draft professionals never appear for them.

## 3. Hiring intelligence (Mission Control → Hiring intelligence)

From team slots in the chosen window (30 / 90 / 180 / 365 days, optional role filter):

| Block | What it shows |
|---|---|
| Demand vs supply by role | Slots, filled, open, declined, no answer, fill rate, median hours to accept, approved professionals for that role, pressure (covered / some / high / no professionals), cities with demand but no professional |
| Still open for the next 60 days | Open slots by role and city, earliest date |
| Why professionals decline | Their own decline notes, grouped: dates, fee, location, role, other |
| Application pipeline by role | Open / approved / not approved applications |
| Most reliable | Professionals with 2+ invitations: accepted of asked, accept rate |

"Approved professionals for a role" uses the catalog role's match list (e.g. a DOP slot counts Directors of Photography and Cinematographers).

## 4. Exports (Mission Control → Exports)

CSV files, UTF-8 with BOM (open straight in Excel / Google Sheets). **Every export is written to the audit log** with who and how many rows.

| Export | Who |
|---|---|
| Quotes · Teams · Team slots (every invitation) · Projects · Professionals · FODO Pro applications | staff |
| Contracts · Milestones (payments) · Settlement lines · Ledger · Invoices and credit notes · Payouts · Audit log | finance / admin / viewer |

**Kept out on purpose:** phone numbers, application free text, payout method details. Cells starting with `=`, `+`, `-`, `@` are neutralised against spreadsheet formula injection.

## 5. Owner Brain (read-only)

| Tool | What it does |
|---|---|
| `marketplace_mission` | The attention list (urgent marked), totals, next team dates, latest staff actions |
| `marketplace_search` | Find any marketplace record |
| `marketplace_hiring` | Demand, decline reasons, pipeline, upcoming need, most reliable |

The Brain has no export tool.

## 6. API (`/api/biz/admin/`)

| Method | Endpoint |
|---|---|
| GET | `mission` (+ the export list for this role) · `search?q` · `hiring?days&role` · `export/<what>` (CSV) |

## 7. Database

No new tables. (`quotes.js` and `payouts.js` now export their table set-up so Mission Control can query every marketplace table.)

## 8. Also changed

- Marketplace admin opens on Mission Control; the tab order is Mission Control, Analytics, Quotes, Teams, Contracts & money, Catalog & pricing, Pro applications, Professionals, …
- Professionals and Pro applications tabs accept `&id=` so search results open the record.

## 9. Tests

- **New `tests/v475.test.mjs`: 58 checks.** Roles (401 / 403, moderator vs finance rows), attention counts from real quotes / teams / invitations / applications, next team dates, audit feed, staff search (title, number, city, email, application JSON, any-status professionals, hiring hint, wildcard safety, client search unchanged), hiring maths (fill rate, median hours, decline grouping, reliability, city gaps, pressure, window cap), exports (role gates, header, rows, notes, no phone / free text, formula injection, audit rows), Brain tools, UI wiring, no "worker", no long dash.
- Full regression and visual checks: see the delivery note.
