# FODO v44: Projects 2.0

FODO Pros projects now handle the ways real work is bought: time slots, hourly work, monthly retainers, scope changes, a shared task list, teams of several professionals, and refunds.

## 1. Time slots
- **Setting slots:** Calendar → **Time slots**. A professional sets bookable parts of a day, for example `09:00-13:00, 14:00-18:00`. Up to 8 slots are allowed. Overlaps and invalid times are removed. Saving slots does not send the profile back to review.
- **Requesting:** when a client requests a date, they pick **Whole day** or a slot. Booked slots are disabled in the form.
- **No double booking:**
  - Each pro + day + slot can be booked once.
  - A whole-day booking blocks every slot that day, and any booked slot blocks a whole-day booking.
  - The check runs on request, again on accept, and once more right after the booking is written. That last check catches a whole day and a slot accepted at the same moment.
- **Database:** the old unique index (pro + day) is replaced by pro + day + slot. Existing bookings become whole-day bookings (`slot = ''`).

## 2. Pricing modes (chosen in the proposal)
- **Fixed price:** milestones, as before.
- **Hourly:**
  - The proposal sets a rate per hour (₹100 or more) and an optional maximum number of hours.
  - The lead professional logs time: a past day, 0.25 to 16 h, and a note. Going over the agreed hours is refused.
  - **Bill** turns the open hours into one milestone. The amount is computed on the server as hours × rate, never sent by the browser.
  - Once the client pays it, it counts as delivered work. The client approves it to release the payout.
- **Monthly retainer:**
  - The proposal sets a monthly fee and an optional number of months. The first month becomes a milestone.
  - **Add next month** works only after the previous month is approved or refunded, and stops at the agreed number of months.
  - Nothing is ever charged automatically.
- **Finishing:** hourly and retainer projects are finished by the client with **Complete the project**. This is refused while anything is unpaid, unapproved or unbilled.

## 3. Change requests
- **Who and when:** either side, after acceptance.
- **What a request holds:** what changes, details, an extra amount (₹0, or ₹100 or more) and the extra days needed.
- **Deciding:**
  - The other side accepts or declines. The author can withdraw it.
  - An accepted amount becomes a new milestone to pay. The budget is updated, and a delivered project goes back to in progress.
- **Team projects:** the client chooses which professional the change is for.

## 4. Tasks
- **Shared checklist:** client and professionals share one list. Each task has who does it (client or professional), an optional due date, and status ○ to do, ◐ doing, ● done.
- **Permissions:** anyone on the project can tick a task. Only its author renames or deletes it. FODO staff can only read.

## 5. Team projects (several professionals)
- **Building the team:** the client clicks **Add a professional** and picks from their shortlist or a search.
- **Invitation:** the professional gets an invitation. Until they join they see only the brief: no milestones, chat or files. Invitations also show on their dashboard as a Next action.
- **Members' milestones:**
  - A member sends their own milestones. The client accepts or declines them; proposed milestones can't be paid.
  - Each milestone belongs to one professional. Only they can submit it, and the payout goes to them.
  - Completing the project counts it for every professional with approved work.
- **Removing a member:** the client can remove a member who has no paid work.
- **Chat:** messages now show names (never user ids).

## 6. Refunds
- **Who can start one:**

| Who | What | Allowed when |
|---|---|---|
| Client | Asks for a refund, with a reason | Milestone paid, not approved yet |
| That milestone's professional | Accepts or declines the client's request | A request is open |
| That milestone's professional | Refunds the client directly | Milestone paid, not approved yet |
| FODO finance / admin | Full or partial refund (also during a dispute) | Milestone paid, not approved yet |

- **Partial refunds:** the rest of the money becomes the professional's payout.
- **Real gateway refunds:**
  - **Razorpay:** refunds the captured payment of that order, in paise.
  - **Cashfree:** `POST /orders/<id>/refunds`, with an idempotency key.
  - The status shows **processing** until the gateway confirms.
- **Never faked:** if no gateway order exists or the call fails, the refund shows **"approved, FODO finance sends it"**. Finance then records the bank / UPI reference, and only then does it say **Refunded**.
- **Limits and records:** one open refund per milestone, never more than was paid, audited. Finance has a list at `GET /api/biz/admin/refunds`.
- **Cancelling:** refunded milestones no longer block cancelling a project.

## Safety
- **Amounts:** every amount comes from the database (rate, logged time, retainer fee, accepted change), never from the browser.
- **Permissions:** every action checks the person's role on that project on the server. Outsiders get 404.
- **Private payment data:** payment order ids are no longer sent to the browser.

## Files
- **New:**
  - `functions/_lib/projects2.js`.
  - `tests/v44.test.mjs` (85 checks).
- **Changed:**
  - `functions/_lib/biz.js`:
    - migrations;
    - `projectFor` (team members, invited);
    - `slotFree` / `cleanSlots` / `setSlots`;
    - pricing modes in the proposal;
    - member milestones;
    - payouts per milestone owner;
    - refunded milestones handled in completion and cancel;
    - pro dashboard (invites, slots).
  - `functions/api/biz/[[path]].js`: `pro/slots`, `admin/refunds`.
  - `functions/_lib/files.js`: invited pros can't open or upload files.
  - `js/workspace.js`, `css/workspace.css`.
- **Database:**
  - New tables: `biz_project_pros`, `biz_tasks`, `biz_changes`, `biz_time`, `biz_refunds`.
  - New columns, added automatically: pros `slots`; projects `slot` / `mode` / `rate` / `cap`; milestones `pro_id` / `kind` / `period` / `refunded`; bookings `slot`.
  - Old projects keep working as fixed-price projects.

## Next (roadmap)
- v45: full CRM, Content / Ad Studio AI.
- v46: payout adapters, admin analytics, Brain tools, DPDP privacy, notification preferences, enforced CSP, migration version table.
