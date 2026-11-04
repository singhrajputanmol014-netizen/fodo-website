# FODO OS V4: security model (v50.1, Phase 1)

What is enforced today, where, and how it is tested. The gap list and the later-phase items are in `FODO-OS-V4-SECURITY-AUDIT.md`.

## 1. Identity and session
- Cookie session (`fodo_s`, HttpOnly, Secure, SameSite=Lax, 30 days), token hashed in `acct_sessions`; `last_seen` added.
- Suspension and offboarding delete every session of the person; `authorize()` refuses them even after a fresh login (403 with the status).
- Owners can end any member's sessions (People & Access → Log out everywhere), audited.

## 2. Authorization (deny by default)
- Permission strings live only in `functions/_lib/os/permissions.js`; the static check fails CI if one appears elsewhere.
- Every `/api/os` route declares `{ resource, action }` or `"self"`; the router calls `authorize()` before the handler; the static check fails CI for an undeclared route and when more than eight routes are `"self"`.
- Object-level checks: module functions call `authorize()` with the target row; `relationOf()` resolves own / assigned / team / department / organization from real rows (tasks, teams, managers, projects, members).
- Lists are filtered by the widest scope held (team = my reports, department = my department); scope `own` on people lists returns 403 (use `people/:id` or `directory`).
- Field-level: `cleanFor()` removes cost_rate, cost, margin, commission, net, gross, profit and internal notes for people without finance view / people manage; the directory never carries cost rates.
- Escalation guards: see `FODO-OS-V4-PERMISSIONS.md` section 4 (cannot grant what you do not hold; owner-only system / brain; Owner role immutable; no self-role change; no self-suspend).
- Legacy marketplace checks (`can(R, [...])`, `isOwner()`) remain in force on `/api/biz`; nothing was removed.

## 3. View-as (impersonation)
- Owner only (`system.impersonate`), reason required, 30-minute token in KV, logged in `os_impersonations`, start and stop audited (`OWNER_IMPERSONATED_USER`, `OWNER_STOPPED_IMPERSONATION`).
- Read-only: every non-GET on `/api/os` and `/api/biz` answers 403 while active; no session is swapped, nothing can escalate; the banner shows who is viewed and until when; expired tokens are ignored.

## 4. Audit and events
- `os_audit`: actor, action, target, before, after, reason, source; payload keys matching secret / token / password / key / bank / account / ifsc / vpa are scrubbed. Writes never throw into the action.
- Owner actions audited: OWNER_INVITED_MEMBER, OWNER_CHANGED_MEMBER, OWNER_CHANGED_ROLE, OWNER_CHANGED_PERMISSION, OWNER_SUSPENDED_MEMBER, OWNER_UNSUSPENDED_MEMBER, OWNER_REVOKED_SESSIONS, OWNER_OFFBOARDED_MEMBER, OWNER_CREATED_DEPARTMENT, OWNER_CHANGED_DEPARTMENT, OWNER_CREATED_ROLE, OWNER_IMPERSONATED_USER, OWNER_STOPPED_IMPERSONATION, OWNER_CHANGED_SYSTEM_SETTING.
- The audit viewer merges os_audit + biz_audit + brain_audit and needs `audit.view` (finance manager, admin, owner).
- `os_events` records every audited marketplace write and OS event; automations run isolated (one failure never blocks the write).

## 5. Transport and input
- CSRF: same origin + JSON content type on every write; rate limits per person on reads and writes.
- All SQL bound; every user string clipped (`clip`); e-mails normalised (`cleanEmail`); enums validated (status, kind, employment type, scopes, permissions, days 1 to 365).
- Errors return a message and a status; stack traces only to the console in test mode with `API_DEBUG=1`.

## 6. Kill switch and modules
- `biz_settings.os_enabled = "0"`: `/api/os/*` → 503, navigation falls back to v47; only the owner's `settings` call still works so it can be switched back on. Audited.
- `os_modules`: a disabled module leaves non-owner navigation; the legacy routes of that module keep their own checks (Phase 2 ties module switches to the API).

## 7. Tests (tests/v501.test.mjs, 119 checks)
Registry validity · seeds and legacy backfill (twice) · permission matrix for every template × resource.action · negative matrix (designer → finance, editor → payouts, sales → finance, PM → system, Pro → clients, client → people / audit, HR → finance manage, admin → brain) · object-level relations (assigned, team, own, 403 for unrelated projects, IDOR for clients) · cleanFor · People API (403 for designer listing, team scope for PM, no cost rates in the directory, role change refused for PM and for self, duplicate / invalid invites, audit with reason, second role applies, own record readable, grants effective / expired / revoked, PM cannot grant, suspension kills sessions and refuses after re-login, owner cannot be suspended, departments archive, custom roles only with held permissions, HR cannot give finance or Owner, Owner role cannot shrink, offboarding handoff moves tasks and keeps records) · view-as (owner only, reason required, GET as target, writes refused on both APIs, stop, audit, self refused, expiry) · audit filters and access · marketplace writes → events · automation isolation and secret scrubbing · notification dedupe / category / urgency · navigation (owner groups, client unchanged, Pro unchanged, PM trimmed) · modules · kill switch · router hygiene (declared permissions, CSRF, JSON, 401, 404) · health probes honest · prefs · OWNER_CAN_ACCESS_ALL_SYSTEM_MODULES, OWNER_CAN_SEE_EVERY_NAV_ENTRY, OWNER_CAN_VIEW_ALL list routes.
