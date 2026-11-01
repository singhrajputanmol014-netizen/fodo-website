# FODO v47.4: Become a FODO Pro, Profile 2.0, case studies, real-data badges

The fourth phase of V47. Professionals can now apply to join FODO from a public page. A FODO person reviews each application, checks it, and approves it. Approval creates the FODO Pro profile. Profiles carry more detail, case studies (only with the client's permission) and badges earned from real FODO data.

What did **not** change:
- FODO Pro profiles are still private (signed-in FODO clients and the FODO team only).
- `/fodo-pros/` is still invite-gated: noindex, robots Disallow, not in the sitemap.
- Invite links keep working exactly as before.

## 1. Public page: `/become-a-pro/`

| Part | Content |
|---|---|
| Hero | "Do your best work. FODO brings the projects." + **Apply to become a FODO Pro** (→ `/workspace/#apply`) |
| Sections | Who FODO is looking for (6 role groups) · How it works (5 steps) · What FODO handles · Before you apply · 8 FAQs |
| Honest copy | Applying is free, profiles are never public pages, **no promised number of projects**, payment through FODO by milestone, automatic payouts only once the provider is active |
| SEO | Title + description, canonical, FAQPage + BreadcrumbList structured data, in the sitemap, in the site search index |
| Links | Site footer (static HTML + JS footer); the invite-only screen of `/fodo-pros/` ("Not invited? Apply…") |

## 2. The application (Workspace → **Become a FODO Pro**)

**Who:** anyone with a FODO account who has no FODO Pro profile yet. The menu item disappears once they have a profile. One application per account.

**Four steps, saved as you go:**
1. **About you:** name, phone, city, primary role (+ up to 2 more), years, languages, about.
2. **Your work:** specializations, industries, skills, tools, own equipment, remote / on-site / travel, radius, availability, days, day rate, project rate.
3. **Portfolio:** up to 8 work links, showreel, website, Instagram, best project.
4. **Review & send:** what's still missing (click to jump), terms, "the work is mine and true".

**Server-side cleaning:**
- Unknown roles are dropped.
- Only https links are kept (`javascript:` and `data:` are dropped); duplicates are removed.
- Numbers outside their range are dropped.
- An Instagram URL becomes a handle.

**Required to send:** name, phone (10+ digits), city, role, years, about (60+), a skill, a work mode, availability, 2 work links (or 1 + showreel), and both agreements.

**After sending:**
- The applicant sees the stage, FODO's message and a timeline.
- They can change the application only when FODO asks for information.
- Internal notes, checks and the reviewer are **never** sent to the applicant.

## 3. The pipeline (Marketplace admin → **Pro applications**)

| Action | From | To | Needs |
|---|---|---|---|
| Start review | submitted | under review | |
| Ask for information | submitted / review / interview / verification | needs information | message (10+) |
| Invite to interview | review / verification | interview | message with when & how (10+) |
| Move to verification | review / interview | verification | |
| **Approve** | review / interview / verification | approved | **identity + portfolio checks ticked**, complete application |
| Don't approve | any open stage | not approved | kind reason (10+) |
| Archive | anything but approved | archived | |
| Reopen | not approved / archived | under review | |

- **Checks:** identity (a government ID is seen on a call, never stored), portfolio, references, interview. Each tick records who ticked it and when.
- **Also:** internal notes (FODO only), "Assign to me". Each action is written to `biz_pro_app_events` and the audit log.
- **The applicant is told:** a workspace notification + email for "ask for information", "interview", "approved", "not approved" and "reopened".
- **Who can do what:** admins and moderators decide. Viewers can read. Clients get 403.
- **Approved is final:** the profile is then managed under Professionals.
- **Not approved:** the person can apply again after **30 days**. It is the same record, with the old answers kept and the history intact.

**On approval:**
- **New profile:** the applicant's FODO Pro profile is created, approved and private, from the application (role, categories, skills, Profile 2.0 fields, rates, work modes, days, terms date). Work links + showreel become portfolio items.
- **Existing draft profile** (e.g. from an invite): it is activated, not duplicated.
- **Suspended profile:** approval is refused until someone restores it on purpose.

## 4. Profile 2.0

**New fields:**
- specializations;
- industries;
- own equipment;
- project rate ("projects usually from");
- FODO Recommended (+ reason).

**Where they appear:**
- Pros edit them in **My profile**.
- Clients see them on the profile.
- An older form that doesn't send them keeps the saved values.

## 5. Case studies

**Writing (FODO Pro → My profile → Case studies):**
- Fields: title, client (optional), industry, role, challenge, what they did, result, numbers, links.
- An optional link to a **completed FODO project they worked on** (checked on the server).

**Rules:**
- **Sending for review needs:** an approved profile, "the client allowed me to publish this", and a real story (120+ characters).
- **Publishing:** FODO publishes only after review and only with that permission. Sending back or hiding needs a note to the professional, and the professional is notified.
- **Editing a published case study** sends it back to review and hides it meanwhile.

**Who sees them:**
- Clients see published case studies on the profile. Numbers are labelled "as reported by the professional".
- Internal fields are never sent to clients.
- Team matching counts published case studies with the portfolio and says so.

## 6. Badges (only from real FODO data)

| Badge | Earned when (default rule, owner can tune) |
|---|---|
| Verified by FODO | Profile approved by FODO |
| Fast Response | Median answer to team invitations ≤ 6 h, at least 3 answers |
| Top Response | ≥ 90 % of team invitations answered (not left to expire), at least 5 |
| High Completion | ≥ 90 % of paid projects completed, at least 5 completed (a cancellation counts only after money was paid) |
| Repeat Client Favorite | ≥ 2 clients hired them again on FODO |
| FODO Recommended | Picked by a FODO admin with a written reason (clients see it); audited |

**How they work:**
- Each badge carries its **reason with the numbers**, e.g. "Usually answers team invitations within 2 h (median of 5)".
- **Where they show:** Hire Pros cards, the profile, and team matching (as reasons, with no hidden score).
- **"FODO Recommended"** adds a small, stated bonus in Hire Pros ranking ("Recommended by FODO").
- **Changing the rules:** owner only, with a reason. Sane limits apply, the change is audited and it takes effect immediately.
- **Admin overview:** Badges & recommended shows the holders per badge and the Recommend button.

## 7. Owner Brain

| Tool | Level | What it does |
|---|---|---|
| `marketplace_pro_applications` | read | Waiting count, per-stage counts, the list (name, role, city, links, checks done), case studies waiting, badge holders |
| `marketplace_pro_application_decide` | 2 (owner confirms) | review / ask for information / interview / verify / approve / not approve / archive / reopen, with a message |

The Brain **cannot tick checks**. So it can't approve anyone a FODO person hasn't checked.

## 8. API (`/api/biz/`)

| Who | Method | Endpoints |
|---|---|---|
| Applicant | GET | `apply` |
| Applicant | POST | `apply` (save) · `apply/submit` |
| FODO Pro | GET | `pro/case-studies` |
| FODO Pro | POST | `pro/case-studies` · `pro/case-studies/<id>/submit` · `pro/case-studies/<id>/delete` |
| Admin | GET | `admin/applications[?status&q]` · `admin/applications/<id>` · `admin/case-studies?status` · `admin/badges` |
| Admin | POST | `admin/applications/<id>` `{action: review\|request_info\|interview\|verify\|approve\|reject\|archive\|reopen\|check\|note\|assign, message, note, key, value}` · `admin/case-studies/<id>` `{action: publish\|reject\|hide, note}` · `admin/badges` (owner) · `admin/pros/<id>/recommend` `{on, note}` |

`market/<id>` (the profile) now also returns `badges`, `caseStudies`, `specializations`, `industries`, `equipment`, `rateProject`, `recommended`. `market` and `builder/match` results carry `badges`.

## 9. Database (additive)

- **New tables:** `biz_pro_applications` (one per user), `biz_pro_app_events`, `biz_pro_case_studies`.
- **New `biz_pros` columns:** `specializations`, `industries`, `equipment`, `rate_project`, `recommended`, `recommended_note`, `recommended_by`, `recommended_at`.
- **New setting:** `biz_settings.badges`.

## 10. Tests

- **New `tests/v474.test.mjs`: 124 checks.** It covers:
  - the public page (copy, structured data, sitemap, robots, footer);
  - login required, saving, server-side cleaning, sending, locked after sending;
  - roles (client / viewer / moderator / owner), IDOR;
  - the state machine, messages, internal notes hidden, notification + email, resubmit;
  - checks before approval;
  - the Brain can't approve unchecked;
  - approval → profile + portfolio + audit, nav changes;
  - not approved → 30-day wait → fresh draft, reopen, archive;
  - an existing draft profile activated, a suspended one refused;
  - Profile 2.0;
  - case studies (ownership, FODO project link rules, permission, story length, moderation, publish / edit / hide, client view, match reason);
  - badges from team invitations and projects (including cancelled before / after payment), rule changes (owner-only, reason, limits, audit);
  - FODO Recommended (admin only, reason, approved only, route order);
  - overview, Brain tools, UI wiring;
  - no "worker", no long dash in API messages.
- **Earlier suites:** run in the full regression (see the delivery note).
- **Visual checks:** public page desktop + 390 px phone, the four apply steps, the missing list, sent, needs information, applicant on a phone, admin list + detail, approved, Pro case studies, admin case studies and badges, client profile with badges + case study, invite-only screen.

## 11. Setup

Nothing new to configure.
- Emails go out once `RESEND_API_KEY` is set; until then they are logged as "not sent".
- Owners can tune the badge rules in Marketplace admin → Pro applications → Badges & recommended.
