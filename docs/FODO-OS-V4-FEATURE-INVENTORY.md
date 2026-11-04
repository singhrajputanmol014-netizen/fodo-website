# FODO OS V4: feature inventory (Phase 0 audit, part 2)

Status words: **Working** = verified user journey exists and is tested · **Partial** = exists but misses what V4 asks · **Missing** = nothing in the code. "Verified" means a test suite covers the journey (suite named) or it was exercised in this audit; a page that merely loads is not "Working".

Recommendation words: Preserve (leave as is, connect through permissions) · Improve (extend additively) · Integrate (connect to the OS layer) · Build (new module).

## A. Existing modules

| Module | Route | Purpose | Front end | Back end | Database | Auth / authz today | Integrations | Status | Issues vs V4 | Recommendation |
|---|---|---|---|---|---|---|---|---|---|---|
| Marketing site | `/` + 100 pages | Agency site, SEO, lead capture, bot | `main.js`, `pages.js`, `fx.js`, `scene3d.js`, `bot*.js` | `api/leads`, `api/chat`, `api/stats` | `fodo_leads`, `web_*` | public | GA4, Meta pixel, WhatsApp | Working (v5-pages 668, v9-seo 137, bot-regression 547) | none for V4 | Preserve |
| Accounts | `/account/` | Login, plans, credits, privacy export / delete | `account.js` | `api/account` | `acct_*`, `privacy_log` | session cookie | Google, Firebase, Resend | Working (v13-accounts-e2e 75) | no session list / revoke per user, no notification prefs UI beyond alerts, no impersonation | Improve |
| Growth Lab | `/growth-lab/` + tools | Free + plan tools, monitoring, GSC, AI visibility | `lab*.js`, `tools.js` | `api/lab` | `lab_*`, `mon_*` | plan + seats (`acct_team`) | GSC OAuth, AI providers | Working (lab 20, ai-auto 12) | runs not linked to a client / project record | Integrate |
| Business X-Ray | `/business-xray/` | Site audit reports, scores, findings, competitors | `tool.js` | `api/xray`, `runner/` | `xray_*` (13) | own report; admins all | runner Worker | Working (xray-e2e 116) | not linked to CRM / project | Integrate |
| Website Builder | `/website-builder/` | Multi-page sites, shop, revisions, publishing, members | `website-builder.js`, `wb-*.js` | `api/sites` | `site_*` (16) | `site_members` tenant rule (`docs/tenant-security.md`) | fodo-sites, Razorpay / Cashfree checkout | Working (builder suites; performance fixes in place) | own membership table; no `site.*` permission mapping | Preserve + Integrate (permission map only) |
| Workspace: overview, brand kit, content, campaigns, AI Studio, CRM, files, billing, notifications, settings | `/workspace/#…` | Client self-service workspace | `workspace.js` | `api/biz` | `biz_brand`, `biz_content` (8 states), `biz_campaigns`, `biz_studio`, `crm_*`, `biz_files`, `biz_notes` | own user | AI providers | Working (v21-e2e 117, v40 suites) | CRM is per-user (`user_id`), 6 stages, no company / lead / opportunity objects, no client health; campaigns have `status`, no honest workflow states; content has no version history | Improve (CRM, content versions, campaign flow) |
| Projects (marketplace) | `#projects`, `#project=<id>` | Client ↔ Pro projects: milestones, tasks (client / pro), messages, files, change requests, time, retainers, refunds, contract, invoices | `workspace.js` | `projects2.js`, `biz.js` | `biz_projects`, `biz_milestones`, `biz_tasks`, `biz_messages`, `biz_changes`, `biz_time`, `biz_refunds` | project party (client, pro, staff read) | payments | Working (v17/v19/v21 e2e, v47 suites) | no internal projects, project types, brief / scope object, deliverables, risks, progress engine, daily reports, closure; tasks lack assignee / priority / dependencies | Improve (additive columns + new objects) |
| Build a Team + catalog + pricing + quotes | `#builder`, `#quotes` | Role catalog, rate rules, team composition, versioned quotes `FQ-` | `ws-builder.js` | `production.js`, `quotes.js` | `biz_catalog*`, `biz_builds`, `biz_quotes*` | client own; staff by role | | Working (v471 suite) | matching considers Pros only, not employees | Improve |
| Team staffing, availability, equipment | `#admin?tab=teams`, Pro calendar | Invitations, accept / decline, DB-level double-booking guard, equipment holds | `ws-teams.js` | `teams.js`, `availability.js` | `biz_teams*`, `biz_availability*`, `biz_bookings` (unique day index), `biz_equipment*` | staff / Pro | iCal feeds | Working (v472 suite) | no time zones / hours / travel buffer, no equipment maintenance fields, no vendor rentals | Improve |
| Contracts, settlements, payouts, ledger, invoices, reconciliation | `#finance`, admin finance | `CT-` contracts (versions, amendments, signing), payment plan, settlements + lines, payouts (Cashfree / RazorpayX, Easy Split), append-only ledger, `FI-` / `CN-` invoices, reconciliation | `ws-finance.js` | `finance.js`, `payouts.js` | `biz_contracts*`, `biz_settlements*`, `biz_payouts`, `biz_ledger`, `biz_invoices`, `biz_credit_notes` | roles admin / finance / viewer; owner | providers, webhooks | Working (v473 suite; refund states already funded → requested → processing → refunded / failed) | no expenses, budgets, payables, cash position, forecast, profitability; invoice statuses lack viewed / partially paid / overdue; no PDF archive | Improve |
| FODO Pros | `/fodo-pros/`, `/become-a-pro/` | Application pipeline with checks, Profile 2.0, packages, portfolio, case studies + moderation, badges from real data, Recommended, earnings, payouts, reviews, disputes | `workspace.js` (pro mode), `ws-proapps.js` | `proapps.js`, `biz.js` | `biz_pros`, `biz_pro_applications`, `biz_pro_case_studies`, `biz_reviews`, `biz_disputes` | Pro own; staff by role; owner | | Working (v474 suite 124) | no single lifecycle field, no performance passport (on-time, repeat bookings), no appeal flow, matching is one-stage score, no workroom tasks for Pros | Improve |
| Admin Mission Control | `#admin?tab=mission` | Attention list (exceptions), staff Ctrl+K search, hiring intelligence, 13 audited CSV exports, jobs view | `ws-mission.js` | `mission.js`, `jobs.js` | reads all | staff roles | | Working (v475 58, v476 100) | marketplace-only; no finance / people / project risk signals; no activity feed | Improve → becomes part of the Command Centre |
| Organizations (clients) | `#settings` | Client company: members, shared read, billing profile, act on behalf | `workspace.js` | `orgs.js` | `biz_orgs`, `biz_org_members` | org roles | | Working (v476) | this is the client-side organization, not FODO's | Preserve |
| Files | `#files`, project files | Private files, type sniffing, versions, multipart to 1 GB (R2) | `workspace.js` | `files.js` | `biz_files`, `biz_file_uploads` | owner or project party | R2 | Working (v476) | no comments / approval / usage rights / licenses / expiry; no links to task, client, contract | Improve |
| Calendar feeds | Pro calendar, settings, Mission Control | Private iCal (Pro, client, staff) | | `calendar.js` | `biz_cal_tokens` | token | Google / Apple / Outlook subscribe | Working (v476) | no in-app day / week / month view | Improve |
| Background jobs | Mission Control → Jobs | Queue with retries, dead letter, cron | | `jobs.js` | `biz_jobs` | admin | optional Queue | Working (v476) | no generic event bus; handlers are a fixed list | Improve |
| Notifications | `#notifications`, bell | In-app notes, e-mail / WhatsApp by category prefs (instant / daily / off) | `workspace.js` | `biz.js notify`, `alerts.js` | `biz_notes`, `biz_notify_prefs` | own | Resend, WhatsApp | Working | no urgency levels, no escalation, no digests beyond daily mail, no push | Improve |
| Help / support | `/help/`, chat widget, admin Help | Tickets (status, priority, category, channel, assignee, first reply time), chats, mail-in | `help.js`, `admin.js` | `help*.js` | `help_*` (5) | ticket token / user; admins | Resend | Working (help suites) | no SLA timers, escalation, satisfaction survey, KB suggestions, client-visible ticket list inside Workspace | Improve |
| Admin dashboard | `/admin/` | Accounts, orders, X-Ray runs, help, analytics, lab config, bot metrics | `admin.js` | `api/admin` | reads all | `acct_admins` | | Working | second admin surface with its own role table | Integrate (single staff model), keep the pages |
| Owner Brain | `/owner-brain/` | Chat with 106 registered tools (levels 0 / 1 / 2), memory with versions, Google / social connectors, automations, voice, Website Engineer (PRs), audit | `owner-brain*.js` | `brain/*` | `brain_*` (22) | OWNER_EMAILS + `brain_members.perms` | Google, Meta, LinkedIn, YouTube, GitHub, AI providers | Working (brain suites) | tools read modules directly (no permission layer), no agent registry with cost / token limits per agent, no business memory graph (memory is documents), no role-scoped assistant for employees | Improve |
| Privacy | `/account/` privacy | Export JSON, delete with blockers, privacy log | `account.js` | `privacy.js` | `privacy_log` | own | | Working | no consent records, retention policy, rights-request workflow, grievance handling (DPDP) | Improve |
| Monitoring | Growth Lab monitoring, CSP reports, builder client errors | | | `monitor.js`, `api/csp-report` | `mon_*`, `csp_reports`, `site_client_errors` | | | Partial | no system-health page, no error-rate view, no integration registry | Build (health + integration registry) |

## B. V4 modules with no code today (Missing)

| V4 section | Module | What exists nearby | Size |
|---|---|---|---|
| 5, 32 | Permission + scope registry, departments, employees, custom roles, temporary access, session revoke, view-as | role lists in four tables; design in `FODO-OS-ARCHITECTURE.md` with 9 draft files | L |
| 5.2, 5.3 | Universal record fields + shared activity timeline | `biz_audit`, `brain_audit` (flat) | M |
| 5.4 | Event bus with idempotency / correlation | `biz_jobs` only | M |
| 6, 7 | Owner Command Centre, priority feed, action centre, executive reports, Control Tower health scores with formulas | Mission Control attention list (marketplace only) | L |
| 8 | Project lifecycle 13 states, scope object + change requests tied to contract, progress engine, health engine, daily PM reports, closure, risks | `biz_changes` (change requests), milestones | L |
| 9 | Customer 360 (company, contacts, leads, opportunities, requirements → brief, client health, renewals) | `crm_*` per user | L |
| 10 | Support SLA, escalation, satisfaction, KB suggestions, Workspace ticket list | `help_tickets` | M |
| 11 | Client portal items: approvals of deliverables, support inside Workspace | project page | M (most exists) |
| 12 | Employee Work OS, profile, HR (recruitment, leave, attendance, reviews, training, offboarding) | nothing (staff are e-mail rows) | L |
| 13 | Pro passport, two-stage matching, booking time zones / buffers / reschedule, Pro workroom tasks, appeals | Pros v47.4, availability v47.2 | M |
| 14, 15 | Expenses, budgets, payables, cash position, forecast (3 scenarios), profitability, revenue leakage, service / client / department analytics | ledger, invoices, settlements | L |
| 16 | Sales-to-delivery handover checklist | quote → contract → project exists; no gate | S |
| 17 | QA templates / checklists, deliverable versions, immutable approval history | case-study moderation only | M |
| 18 | Resource planning: capacity, heatmap, skills matrix, leave impact | availability for Pros only | M |
| 19 | Marketing attribution, ad-platform adapters (Meta / Google Ads / GA4 / LinkedIn / YouTube / TikTok) | Brain social connectors (publish), GSC | L (platform APIs) |
| 20 | Asset rights: releases, licenses, expiry, usage rights | files have none | M |
| 21 | Knowledge base / SOPs with versions, search, AI citations | Brain memory (owner-only) | M |
| 22 | Document centre: templates, approval workflow, e-sign integration, expiry alerts, access logs | contracts (typed-name signing), quotes | M |
| 23 | Vendors, procurement, purchase orders, vendor invoices | nothing | M |
| 24 | Unified inbox (Gmail / Outlook / WhatsApp), meeting notes, conversation → task | Brain Gmail read, help mail-in | L |
| 25 | Workflow Studio (visual, triggers / conditions / actions / approval, execution history) | `brain_automations` (owner-only, no UI builder) | L |
| 26 | Agent registry, AI governance (cost / token limits, prompt versions, eval sets, emergency stop), business memory graph | brain levels + audit | M |
| 27 | Problem detection engine (typed problems with evidence, owner, resolution) | Mission Control rules (12) | M |
| 28 | Simulation engine, decision journal | nothing | M (only honest with finance data in place) |
| 29 | Risk register, incident log, continuity plan | nothing | S |
| 30 | Global search with FTS, filters, recent searches, permissions | staff Ctrl+K (LIKE, marketplace only) | M |
| 31 | Integration registry (status, last sync, token expiry, revoke), subscriptions tracker | `brain_connectors` | M |
| 33 | Escalations, digests, push | alerts prefs | S |
| 36 | DPDP: consent records, retention, rights requests, grievance, breach procedure | privacy export / delete | M |
| 37 | Reporting engine (period, definitions, freshness, drill-down, exports) | 13 CSV exports | M |

Size: S = one session · M = one release · L = two or more releases.

## C. What V4 asks for that the code already does (do not rebuild)

Refund state machine with provider finality · settlements separate from payouts separate from payments · idempotent money writes and verified webhooks · append-only ledger · versioned quotes and contracts with immutable signed snapshots · atomic double-booking guard · multipart uploads with validation · private signed file access · Brain action levels with owner confirmation · Brain never moves money · honest "Awaiting provider activation" states · audited CSV exports · dead-letter job queue · DB-level tenant isolation tests for the Builder · privacy export / delete.
