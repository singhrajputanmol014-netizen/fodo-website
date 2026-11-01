# FODO v47.3: Contracts, payment plan, settlement, ledger, invoices, reconciliation

The third phase of V47. A locked team now becomes a signed contract. The contract opens the project workspace with its payment plan. Every rupee is followed from the client's payment to each professional's payout.

The three money concepts are kept apart:

| Concept | Meaning |
|---|---|
| **Payment** | What the client paid FODO (a funded milestone, held until approved) |
| **Settlement** | How one approved milestone is split between the professionals, equipment partners, tax and FODO |
| **Payout** | What is actually sent to a professional |

## 1. Contracts

**Where:** Teams → a locked team → **Contract**. It creates the draft (`CT-YYMM-0001`).

**What the contract contains:**
- client, the confirmed team (names and roles only, **no individual fees**);
- scope, deliverables, timeline;
- the investment table, with FODO's management fee shown separately;
- the payment plan, from the accepted quote;
- revisions, usage rights;
- the cancellation policy (stored inside the contract);
- 10 clauses: scope, payment, revisions, IP/usage, cancellation & refunds, travel & expenses, confidentiality, taxes, FODO's role & fee, disputes;
- the terms version;
- a "have it reviewed by your lawyer / CA" note.

**Internal snapshot (staff only):** each person's agreed fee and the equipment partner cost.

**Sending and signing:**
- **Send:** a sent version is frozen. The client gets a notification and sees "Review and sign" on the accepted quote.
- **Sign:** the client ticks "I agree" and **types their full name**.
- **Recorded:** the name, user, time, version, a hash of the IP (not the IP), the browser and the terms version.
- Signing never charges money.

**After signing:** the **project workspace opens**.
- The producer (or director) leads it; the rest of the team joins.
- The payment plan becomes the milestones, for example "Booking (50%)" and "On final delivery (50%)".
- The team becomes "active".
- **What professionals see:** the project and the work, **never the client price** (amounts are hidden for them).
- **Locked by the contract:** milestones can't be re-proposed, and the client can't add people outside it.

**Amendments:**
- Only after signing: a new version with a description, a price change, and **who gets what** from an increase (the rest goes to FODO).
- The client signs it again; the signed v1 never changes.
- An increase becomes a new milestone. A reduction comes off unpaid milestones only (paid money goes through refunds).

**Cancellation calculator (signed contracts):**
- Inputs: days to the start, and the policy band from the **signed contract** (not today's settings).
- Default policy: 14+ days 90 %, 7+ days 50 %, less 0 %.
- Output: money held vs already released, non-refundable partner costs, the refundable amount and what FODO keeps.
- It is a calculation only: refunds still go through the project's refund tools.

## 2. Settlement (when the client approves a paid contract milestone)

The milestone is split **once** (unique per milestone):
- each professional gets **their fee × the milestone's share**, and the last milestone pays the exact remainder, so the totals equal the agreed fees to the rupee;
- equipment partners get their share of the partner cost;
- tax gets its share (when charged);
- FODO gets the rest: management fee, contingency, equipment margin.

**Other cases:**
- **Amendment milestones:** split exactly as allocated in the amendment.
- **Partial refund of a contract milestone:** once the refund is confirmed, the unrefunded part is split the same way.
- **If the allocations ever exceed the money,** the settlement goes to **manual review**. No payouts are created until finance checks it and presses Release (with a note).

**Payouts:** each professional's line becomes their own payout (labelled "Project: milestone · role (name)"). It is visible in their Earnings and in Admin → Payouts. It is sent by the payout adapter (Cashfree Payouts / RazorpayX) or by hand.

**Cashfree Easy Split (adapter):**
- **When it runs:** `CASHFREE_SPLIT_ON=1` is set, the order is a Cashfree order, and every professional has a Cashfree vendor id (Admin → `admin/vendors/<proId>`).
- **What it does:** FODO calls Cashfree's *split after payment* API (`POST /easy-split/orders/{order_id}/split`), idempotent with the settlement id.
- **After the split:** those payouts are marked **via split**. They can't be sent again or marked paid by hand, so there is no double payment.
- **Otherwise:** the settlement says "awaiting provider activation" and the normal payouts apply.

## 3. Ledger (append-only)

Every money event is one row, recorded once (unique kind + account + reference):

| Event | Ledger account |
|---|---|
| Client payment | `client_receipts` |
| Settlement lines | `pro_payable`, `partner_payable`, `tax_payable`, `fodo_revenue` |
| Payout paid (adapter or by hand) | `payouts_paid` |
| Refund confirmed | `client_refunds` |

**The database itself refuses to change or delete a ledger row** (triggers).

**Reports:** history comes from these rows and the frozen contract snapshots, never from today's settings.

## 4. Invoices and credit notes

**Invoices:**
- Each paid contract milestone gets an invoice `FI-YYMM-0001`.
- Lines are proportional to the contract's investment table and always add up.
- **Wording:** it is a **"Payment receipt" without `FODO_GSTIN`**, or a "Tax invoice" with it.

**Credit notes:** a confirmed refund gets a credit note `CN-…` against that invoice. The invoice becomes "partly credited" / "credited".

**Where:**
- Printable pages: Print → Save as PDF.
- Clients see them on the contract page; admins see them under Contracts & money → Invoices.

## 5. Reconciliation

For each paid milestone, these are compared:
- gateway order;
- milestone amount;
- the ledger payment;
- settlement vs paid minus refunded;
- settlement lines vs settlement total;
- payouts paid.

| Result | Meaning |
|---|---|
| matched | Everything agrees |
| pending | Something is still running (payouts not paid yet, refund in progress, settlement under review) |
| mismatch | Two sources disagree; the exact difference is shown |
| manual review | No gateway order on record, or a payment from before the ledger existed |

## 6. Admin (Marketplace admin → **Contracts & money**)

| Section | What it shows |
|---|---|
| Contracts | Versions, activity, internal fees, Send / Amend / Cancellation calculator / Cancel (unsigned only) / Print |
| Settlements | Lines and payout status, Easy Split status, Release for manual review |
| Reconciliation | Summary cards + table with the issues |
| Ledger | Totals per account + every row |
| Invoices | Every invoice and credit note |

## 7. Owner Brain (read-only)

| Tool | What it does |
|---|---|
| `marketplace_finance_summary` | Ledger totals, reconciliation, settlements to review, Easy Split status |
| `marketplace_contracts` | List of contracts |
| `marketplace_cancellation` | "What would they get back if they cancel today", as a calculation |

The Brain never signs, amends, settles, pays or refunds.

## 8. API (`/api/biz/`)

**Client:**

| Method | Endpoints |
|---|---|
| GET | `contracts/<id>` · `contracts/<id>/print` · `quotes/<id>/contract` · `invoices[?project]` · `invoices/<id>/print` |
| POST | `contracts/<id>/sign` |

**Admin:**

| Method | Endpoints |
|---|---|
| GET | `admin/contracts` · `admin/contracts/<id>[?version]` · `admin/contracts/<id>/cancellation` · `admin/settlements` · `admin/ledger` · `admin/reconciliation[?status]` · `admin/invoices` |
| POST | `admin/teams/<id>/contract` · `admin/contracts/<id>/send\|amend\|cancel` · `admin/settlements/<id>/release` · `admin/vendors/<proId>` |

## 9. Database (additive)

- **New tables:** `biz_contracts`, `biz_contract_versions`, `biz_contract_events`, `biz_settlements`, `biz_settlement_lines`, `biz_ledger` (+ 2 triggers), `biz_invoices` (+ unique invoice per milestone, unique credit note per refund).
- **New columns:** `biz_payouts.source_milestone`, `biz_payouts.label`, `biz_pros.cf_vendor_id`.

## 10. Also fixed

- **Contract lead:** "Director of Photography" no longer counts as the lead "Director" (the producer leads).
- **Project titles:** custom projects no longer start with "Create Custom Project:".

## 11. Tests

- **New `tests/v473.test.mjs`: 77 checks.** It covers:
  - contract rules (lock first, one per team, private until sent, IDOR, signing requirements, version checks, double signing);
  - project + team + milestones, professionals not seeing prices, locked milestones;
  - ledger payment, receipt and printing;
  - Easy Split (call, vendor shares, idempotency key, no double payment);
  - settlement maths (shares, exact final remainder), single settlement;
  - amendments (allocation limits, v1 frozen, new milestone, settlement as allocated, reductions only on unpaid);
  - partial refund → credit note + settling the rest;
  - completion of project, contract and team;
  - ledger append-only + idempotent;
  - payouts by hand in the ledger, reconciliation (matched / pending / mismatch);
  - cancellation calculator, printable contract without fees, UI wiring, Brain tools.
- **Earlier suites still pass:** v40 115 · v43 83 · v44 86 · v46 46 · v462 47 · v47 136 · v472 74.
- **Visual checks:** admin contract, quote → contract card, contract sign, project workspace, printable contract, all Contracts & money sections, phone width (390 px, no overflow).

## 12. Setup

1. **Contract text:** read the 10 clauses and the cancellation policy (in the contract) with your lawyer / CA. They are configurable defaults, not legal advice.
2. **`FODO_GSTIN`:** set it only once GST registration is done. Invoices then become tax invoices.
3. **Optional, Cashfree Easy Split:** activate Easy Split in Cashfree and onboard the professionals as vendors (KYC). Then set `CASHFREE_SPLIT_ON=1` and save each professional's vendor id.
