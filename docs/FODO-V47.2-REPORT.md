# FODO v47.2: Team staffing, availability engine, no double booking, equipment reservations

The second phase of V47. An accepted quote now turns into a real team that FODO staffs, people confirm, and FODO locks. Every booked day and equipment unit is protected by the database.

## 1. From quote to team

When a client accepts a quote, a **team** is created automatically. It is idempotent: one team per quote.

**Slots:**
- One slot per person in the accepted version (a "2 × PA" line becomes two slots).
- Each slot keeps its fee from the quote: rate × time ÷ people. That is the Pro's agreed amount.

**Dates:** dates, days, city and mode come from the quote answers.

**Equipment:** the quote's equipment is reserved for the shoot days, plus a pickup / return day either side (configurable, default 1).

**Notifications:** owners get "Staff the team for …".

**Team states:**

| State | Meaning |
|---|---|
| draft | Needs people |
| invitations_pending | Invitations sent |
| partially_confirmed | Some people confirmed |
| confirmed | Everyone confirmed |
| locked | FODO locked the team |
| active / completed | Reserved for the contract phase |
| cancelled | Cancelled |

## 2. Staffing (Workspace → Marketplace admin → Teams)

**Find people** per slot: approved FODO Pros ranked with the admin matching weights.
- **Facts shown:** "Why FODO recommends this Pro" (real facts only) and "not available" with the reason (booked, blocked, notice, horizon, weekly limit, travel days).
- **Desk roles** (post-production, creative, marketing, web, business) also match remote Pros, with no travel rule.

**Invite:**
- The Pro is notified with role, dates, city and their own fee.
- They have 48 hours to answer (configurable in pricing rules).

**Other actions:**

| Action | What happens |
|---|---|
| Resend | Extends the time to answer and reminds the Pro |
| Replace / Remove | Needs a reason when the person had accepted or the team is locked. The Pro is told and their days are freed. History is kept. |
| Add a person | Clearly marked as outside the accepted quote: revise the quote or make an amendment |
| Lock team | Only when every slot is accepted. The client and every Pro are told. |
| Unlock | With a reason |
| Change date | Reason required. Every booking is released and re-checked; see below. |
| Cancel team | With a reason. Releases every day and every equipment unit; everyone is told. |

**Change date details:**
- People who can't make the new dates become **"Date conflict"** and need a replacement.
- Everyone else is re-booked on the new days.
- Equipment is re-reserved.
- No stale bookings stay behind, and a locked team is unlocked.

**Declined or expired invitations:**
- The slot reopens; the reason is kept.
- Owners are told.
- **Auto-replacement** (off by default, owner setting): FODO invites the next best available Pro, but never into a locked team.

**Reminder:** the day before a locked team starts, the client and every confirmed Pro get a reminder (sent once).

## 3. FODO Pro side

**Team invitations** (new menu):
- **Pending invitations:** role, dates, city, mode, team size, **their own fee** and the time left to answer.
- **Their own teams** and earlier invitations.
- **Hidden from the Pro:** the client's email, the client price, FODO's margin and other Pros' fees.

**Accept:**
- Books those days in the database, all-or-nothing for multi-day work.
- If something else took a day meanwhile, the acceptance is refused and nothing stays booked.

**Calendar:**
- Shows team days.
- New **Availability rules**: timezone, working hours, how far ahead they take work, most booked days per week, travel days around out-of-town work, and extra working days (overrides).

## 4. Availability engine (`functions/_lib/availability.js`)

One function decides for matching, invitations, acceptance and date changes. It checks:

- working days + overrides;
- blocked dates;
- minimum notice (from the Pro's local date in their timezone);
- horizon;
- existing bookings (projects and teams);
- weekly limit;
- travel buffer for out-of-town work.

**Double booking at database level:**
- `biz_bookings` keeps one whole-day row per Pro and day (unique index).
- Every multi-day booking is re-checked after insert and undone completely on any conflict.

## 5. Equipment reservations

**Inventory:** set "Units in inventory" for FODO-owned items (Catalog & pricing → Equipment).

**Reservations:**
- Each reserved unit-day is a row with primary key (item, day, unit), so the same unit can't be given twice.
- Items without a tracked inventory are "Partner confirms".
- **Equipment calendar** (Teams → Equipment calendar): units, booked unit-days and utilisation for 30 days, every reservation, and maintenance blocks (only on free units). Unblock / Mark returned.
- A reservation that couldn't be made shows "Not free", with **Try again** after something moves.

## 6. Client side

The accepted quote shows **Your team**:
- x of y people confirmed, the date, and a progress bar;
- each confirmed person's name and role;
- "the team is locked";
- **never fees.**

## 7. Owner Brain

| Tool | Level | What it does |
|---|---|---|
| `marketplace_teams` | 0 | Teams by status, how many confirmed |
| `marketplace_team_detail` | 0 | Slots, people, fees, equipment, activity + top 3 replacement suggestions for open slots |
| `marketplace_capacity` | 0 | Busiest Pros (next 30 days) and equipment utilisation |
| `marketplace_team_invite` | 2 | Invite a Pro to a slot. **Needs the owner's confirmation**; the Pro must still accept. |

## 8. Other changes

- **Quote totals:** now equal the lines exactly (the old ₹10 rounding made the total differ from the subtotal by a few rupees).
- **Pricing rules (owners):** new settings for invitation answer time, auto-replacement on/off and equipment pickup / return days.
- **Scheduler (`/api/monitor/tick`):** also expires unanswered invitations and sends the day-before reminders.

## 9. API (`/api/biz/`)

**Pro:**

| Method | Endpoints |
|---|---|
| GET | `pro/teams` · `pro/availability` |
| POST | `pro/teams/<memberId>/accept\|decline` · `pro/availability` |

**Client:** GET `quotes/<id>/team`.

**Admin:**

| Method | Endpoints |
|---|---|
| GET | `admin/teams[?status]` · `admin/teams/<id>` · `admin/equipment[?from&to]` |
| POST | `admin/teams/<id>/suggest\|invite\|resend\|remove\|replace\|add_slot\|lock\|unlock\|change_date\|cancel\|equipment_retry` · `admin/quotes/<id>/team` · `admin/equipment/block` · `admin/equipment/release/<holdId>` |

## 10. Database (additive)

- **New tables:** `biz_teams`, `biz_team_members`, `biz_team_events`, `biz_equipment_holds`, `biz_equipment_days`.
- **New indexes:** two partial unique indexes (one live person per slot; one live slot per Pro per team).
- **New `biz_pros` columns:** `tz`, `hours_start`, `hours_end`, `horizon_days`, `max_week`, `travel_buffer`, `overrides`.

## 11. Tests

- **New `tests/v472.test.mjs`: 74 checks.** It covers:
  - team creation and fees;
  - client / Pro / admin visibility;
  - suggestions with reasons, invite, accept;
  - database bookings, all-or-nothing on a day-2 conflict, the database refusing a duplicate day;
  - decline / expiry / auto-replacement, lock rules;
  - date change (conflict, release, re-book, equipment moved), replace with history and notification;
  - availability rules (horizon, weekly limit, travel buffer, overrides, timezone / hours validation);
  - equipment calendar, maintenance blocks, retry;
  - cancel releasing everything, reminders sent once;
  - audit, UI wiring, Brain tools.
- **v47: 136 checks still pass.**
- **Visual checks:** admin team, find people, Pro invitations, Pro calendar with rules, client team, equipment calendar, phone width (no overflow).

## 12. Setup

1. **Catalog & pricing → Equipment:** set "Units in inventory" for items FODO owns, so they are tracked and can't be double-reserved.
2. **Pricing rules:** check the invitation answer time (48 h) and decide whether auto-replacement should be on.
3. **Pros:** ask them to fill in Calendar → Availability rules.
