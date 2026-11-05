# FODO v50.4 report: OS Phase 4 (Finance)

Phase 4 of `docs/FODO-OS-V4-IMPLEMENTATION-PLAN.md`. Built on the existing ledger, invoices, payouts and settlements; nothing moves money (payments are recorded, never sent). Design unchanged (ws-* system); a new **Finance** group in the staff sidebar holds Finance and Expenses.

## What is new
| Area | Library / routes (`/api/os/`) | What it does | Honest limits |
| --- | --- | --- | --- |
| Expenses | `expenses`, `/decide`, `/reimburse` · view `#expenses` | Everyone on the team claims (amount, category, project, vendor, spend date, billable). Manager approves (finance if no manager); nobody approves their own; reject needs a note; finance marks reimbursed with a payment reference → ledger `expenses_paid`. Budget warning when a project goes over (not blocked). | Bills are attached through Files (no OCR) |
| Budgets | `finance/budgets` | Project (lifetime), department and FODO-wide (monthly), optional category; actual from approved expenses + vendor bills; ok / watch 80% / over 100% | |
| Receivables | `finance/invoices`, `/pay`, `/void`, `finance/receivables` | OS invoices on `biz_invoices` (kind invoice, number FI-YYMM-nnnn), lines, net terms or due date, partial payments (`os_invoice_payments`, ledger `client_receipts`), void only without payments, aging buckets, by client; billable expenses and approved change requests are marked billed. Client sees the invoice in their Workspace. | GST only when `FODO_GSTIN` is set; e-mail only when mail is configured |
| Payables | `finance/payables`, `/pay`, `/cancel` | Pending Pro payouts (due 7 days after creation), approved unreimbursed expenses, vendor bills; aging; vendor payment → ledger `vendors_paid` | Pro payouts are still sent from the payouts screen |
| Cash | `finance/cash` | Latest balance per bank account entered by finance (stale after 7 days) next to the ledger movement (receipts minus payouts, refunds, expenses, vendor payments) | No bank feed |
| Forecast | `finance/forecast` | 3 / 6 / 12 months, three scenarios, seven written assumptions (collection on due date, overdue share, subscriptions, payables, expense run rate, payroll from cost rates, scenario multipliers), tunable by finance; labelled an estimate; says "not enough data" instead of inventing | Employees without a cost rate are left out (and counted in the note) |
| Profitability | `finance/profitability(/id)` | Internal projects: OS invoices before tax vs expenses + vendor bills + estimated labour (task estimate × cost rate). Marketplace: FODO commission. "Confirmed" only when completed and fully paid | Labour uses estimates, not timesheets |
| Revenue leakage | `finance/leakage` | 7 rules with evidence and a fix: delivered / completed project not invoiced, approved change not invoiced, extra work waiting for approval after delivery, billable expense not billed, invoice > 30 days late, approved marketplace milestone without a settlement, quote discount ≥ 20% | |
| Analytics | `finance/analytics` | Monthly invoiced / collected / commission / expenses / payouts with definitions; by client, service (project type), department, category | |
| Invoice archive | `finance/archive`, `finance/invoices/<id>/print` | Every invoice and credit note (void kept), search, by month, printable (Ctrl + P → PDF) | Browser print, no server PDF |
| Change requests | `projects/<id>/change` | The client approves / rejects their own change request; staff record a decision with a note; approved + amount notifies finance | |

## Security and correctness
- **Webhook replay guard** (`functions/_lib/replay.js`): after the signature check, Cashfree timestamps must be within 15 minutes (5 in the future); a delivery processed successfully is remembered (SHA-256 of provider + body) and a repeat is acknowledged without processing. A delivery that failed is not remembered, so provider retries still work. Used by both payment webhooks.
- Invoice print: OS invoices show "Amount due" and the received amount; the marketplace "Total paid" receipt wording is unchanged. No "contract undefined".
- Router: a handler may return a `Response` (used for the printable invoice).
- Command Centre "collected this month" now reads ledger account `client_receipts` (it read a kind that is never written).
- Permissions: `expense.view/submit.own` for every employee, `expense.view/approve.team` for managers, `expense.*.organization` for Finance Manager. Finance screens need `finance.view` department or wider; writes need `finance.manage` organization.

## Tests
`tests/v504.test.mjs` 96 checks (navigation + templates, expenses, budgets, invoices + partial payments + void + print, payables, cash, forecast + assumptions, profitability, change decisions, all 7 leakage rules, analytics, archive, overview, replay guard, router hygiene, UI wiring). v501 119 (owner sidebar now has six groups), v502 123, v503 104, v476 100, accounts 134, v27 razorpay 16. Visual: 18 screenshots, desktop + 390 px, zero console errors.

## Not built (later phases)
Phases 5 to 8. Phase 5 needs the R2 bucket `fodo-files`.
