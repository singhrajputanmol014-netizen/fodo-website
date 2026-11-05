# FODO v50.5 report: OS Phase 5 (Growth + production)

Phase 5 of `docs/FODO-OS-V4-IMPLEMENTATION-PLAN.md`. Library `functions/_lib/os/growth.js`, views `#os-marketing` (staff, Growth group) and `#client-review` (clients, opened from notifications; the client sidebar is unchanged). Design unchanged (ws-* system).

FODO never posts, launches ads or invents numbers: "published" needs the live URL, "live" needs the platform reference, results carry their period and source.

## What is new
| Area | Routes (`/api/os/`) | What it does |
| --- | --- | --- |
| Content for clients | `content`, `content/<id>`, `/version`, `/move` | Idea → draft → internal review → client review → approved → scheduled → published (+ revision, cancelled). Versions (copy + file) and an immutable review history (`os_content_versions`, `os_content_reviews`). Nobody approves their own content. The client decides at client review; staff recording a client's answer must write a note. Clients see only their items from client review on, and only the latest version. |
| Campaigns | `campaigns`, `/move`, `/results` | Draft → planned → budget approval (through the Approvals engine) → approved (only after the approver says yes) → live (platform reference required, campaign publish right) → paused / ended → reported (needs results). Results per period with source (platform export, typed, client), no overlapping periods, sanity checks, CTR / CPC / CPL / CPA / ROAS with definitions, freshness, over-budget warning. |
| Asset rights | `assets/rights`, `/revoke` | Model / location / property releases, music / stock / font licences, ownership, with holder, scope, start, expiry and the signed proof file (required for releases and licences). Checked before content is scheduled or published (expired = blocked, expiring = warning). Daily scan notifies the creative director 14 days ahead (deduplicated). |
| Deliverable versions + QA | `projects/<id>/deliverables/<d>/version`, `/qa`, `/template`, `qa/templates` | Each new file is a revision (`os_deliverable_versions`). Five seeded QA templates (video, photo, design, website, copy), editable by department content leads. A deliverable with a template cannot be submitted (or approved internally) until QA passes on its current revision; failed checks need a note; N/A allowed. Deliverables without a template keep the Phase 2 flow. |
| Client reports | `reports`, `/refresh`, `/share`, `/csv`, `/print` | Built from real records for a period: projects + progress, approved deliverables, published posts with live URLs, campaign results with freshness and source, support tickets, optional invoices (finance access), linked tools, definitions. Draft → shared (frozen; client notified). CSV (formula-safe) and printable HTML (Ctrl + P → PDF). |
| Platform links | `clients/<id>/links`, `links`, `links/remove` | Link a client's own Business X-Ray runs, websites and Growth Lab work to the client and a project; shown in Customer 360 and in reports. Records of another client cannot be linked. |
| Client side | `client/inbox` | Items waiting for review, recently published posts, shared reports. |

## Permissions
New resources `asset` (view, manage) and `report` (view, manage, share team+). Designers / video editors manage rights on their files; creative director and social media manager department-wide; managers build and share reports for their team; performance marketer and social media manager build reports; operations manager organisation-wide; viewer reads; clients read their own shared reports. Because every employee also carries the client template, FODO's boards require content access at "assigned" or wider and campaign rights at "team" or wider (finance and designers do not get a campaign board).

## Notes
- Files keep working on KV (current set-up). The R2 bucket `fodo-files` is still recommended before large video files are stored.
- `jobs.js` daily job now runs `rightsScan`. Verified that the Pages bundler leaves the not-yet-written Phase 6 module imports as runtime imports inside try/catch (no build failure).

## Tests
`tests/v505.test.mjs` 109 checks. v501 119, v502 123, v503 104, v504 96. Visual: 15 screenshots desktop + 390 px; the only console errors were from the screenshot script's own upload helper (no CSRF header), not from the app.
