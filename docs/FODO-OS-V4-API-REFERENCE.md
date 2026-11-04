# FODO OS V4: API reference (v50.1, Phase 1)

Base: `/api/os/*` (`functions/api/os/[[path]].js`). Session cookie required. Writes: same origin + `content-type: application/json`. Rate limits: 400 writes / hour, 3,000 reads / hour per person. Every route declares its permission in the route table; the static check refuses an undeclared route. Responses: `{ ok: true, ... }` or `{ ok: false, reason }` with 400 / 401 / 403 / 404 / 409 / 429 / 503. Responses are `cache-control: no-store`.

During view-as (owner viewing as someone), every GET on `/api/os` and `/api/biz` answers as that person; every non-GET answers 403 "View-as is read-only" until `view-as/stop`.

| Method | Path | Permission | Body / query | Returns |
|---|---|---|---|---|
| GET | registry | self | | `registry` (resource → action → scopes), `scopes`, `templates` |
| GET | me | self | | `me` (kind, home, owner, roles, department, memberId, name, title, readOnly, impersonating, `can` map), `enabled` |
| GET | prefs | self | | `prefs` (per-user UI preferences) |
| POST | prefs | self | `{ k, v }` | `prefs` |
| GET | people | people.view | `q, status, department, limit` | `items` (scope-filtered; cost_rate and employment only with people.manage), `scope` |
| GET | directory | self | `q` | `items` (user_id, name, email, title, department) for pickers; needs people.view team or task.assign team, else only yourself |
| POST | people | people.manage | `{ email, name, roles[], department_id, manager_user_id, title, kind, employment_type, started_at, weekly_hours, cost_rate, skills[], reason }` | `id, email, accountExists, onboardingTasks` (invitation mail sent when mail is configured) |
| GET | people/:id | people.view (own record allowed) | | `member, roles, grants, sessions, open (tasks, projects, approvals), manage` |
| POST | people/:id | people.manage | same fields as invite (partial) + `roles[]`, `reason` | `ok` |
| POST | people/:id/status | people.manage | `{ status: active or suspended, reason }` | suspension deletes sessions |
| POST | people/:id/grant | people.manage | `{ perm, days (1 to 365), reason }` | `id, expires_at`; only permissions the granter holds (owner: any) |
| POST | people/:id/grant/:gid/revoke | people.manage | | `ok` |
| POST | people/:id/sessions/revoke | people.manage | | `revoked` |
| GET | people/:id/handoff | people.manage | | `tasks, projects, approvals, reports` that would move |
| POST | people/:id/offboard | people.manage | `{ replacement_user_id, reason }` | `tasks, projects, approvals, members` moved; sessions and grants ended; status offboarded; managers and replacement notified |
| GET | departments | people.view | | `items` (members count, manager name) |
| POST | departments | people.manage | `{ name, manager_user_id }` | `id` (409 on duplicate) |
| POST | departments/:id | people.manage | `{ name, manager_user_id, status: active or archived }` | `ok` |
| GET | roles | people.view | | `items` (perms count, members count, template flag), `templates` |
| GET | roles/:id | people.view | | `role, perms[], members[]` |
| POST | roles | people.manage | `{ name, template, perms[], home, department_id, dashboard[] }` | `id` (perms limited to what the creator holds; system / brain owner-only) |
| POST | roles/:id | people.manage | `{ name, perms[], home, department_id, status }` | `ok` (Owner role never loses permissions) |
| GET | audit | audit.view | `actor, action, target, before, src=os, limit` | `items` merged from os_audit, biz_audit, brain_audit (newest first), `next` |
| GET | activity | audit.view | `kind (prefix), actor, subject, before, limit` | `items` from os_events, `next` |
| POST | view-as | system.impersonate | `{ user (id or email), reason }` | `id, target, until` (30 minutes) |
| POST | view-as/stop | self | | `ok` |
| GET | settings | system.settings | | `settings.os_enabled` |
| POST | settings | system.settings | `{ os_enabled, reason }` | kill switch (audited) |
| GET | modules | system.modules | | `modules[] (key, name, enabled)` |
| POST | modules | system.modules | `{ key, enabled, reason }` | `modules[]` |
| GET | health | system.health | | `probes`: d1, kv, r2_files, queue, mail, whatsapp, payments, payouts, test_mode, jobs counts, csp_reports_24h, fts5 (each configured / not configured / ok / failing) |

## Changes to existing endpoints

- `GET /api/biz/me` now also returns `os`: `{ enabled, kind, home, roles, owner, groups, can (employees only), readOnly, impersonating, name, title }`. `nav` is the role-aware navigation (clients and Pros: identical to v47). If the OS layer fails for any reason, `os.enabled = false` and the v47 navigation is returned; the Workspace never breaks because of the OS.
- `/api/biz/*` honours view-as (GET as the viewed person, writes refused).
- `notify(env, userId, kind, text, link, { category, urgency, dedupe })`: optional sixth argument; a note with the same `dedupe` key within one hour is stored once.
- `auditLog()` also emits an `os_events` row.
