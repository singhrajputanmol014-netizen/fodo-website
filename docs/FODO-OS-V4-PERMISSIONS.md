# FODO OS V4: permissions (v50.1)

Single source of truth: `functions/_lib/os/permissions.js` (`REGISTRY`, `SCOPES`, `TEMPLATES`). `scripts/check.mjs` fails the build if a permission string appears anywhere else in `functions/` or `js/`.

## 1. Format

`resource.action.scope`, for example `task.update.assigned`. Scopes, narrow to wide:

| Scope | Means |
|---|---|
| own | I created it or it is mine (my task, my project as a client, my member record) |
| assigned | I am the assignee, the creator of a task on it, a team member on it, or an accepted Pro on it |
| team | someone I manage (their records), a team I am in or manage, a project whose tasks my reports hold |
| department | same `department_id` as me |
| organization | anything inside the FODO organization (every employee relation) |
| all | everything, including client-owned records; the owner's default |

`authorize()` passes when the widest scope the person holds for `resource.action` is at least as wide as one of the relationships they have to the target (`relationOf`). No target = the person only needs the permission at any scope (lists then filter by that scope).

## 2. Registry (resource → actions → allowed scopes)

| Resource | Actions | Notes |
|---|---|---|
| project | view, create, update, assign, delete, archive | delete only organization / all |
| task | view, create, update, assign, delete | assign and delete from team |
| file | read, upload, manage | manage from team |
| approval | request, decide | decide from team |
| message | read, write | |
| client | view, manage | view from assigned, manage from department |
| crm | view, manage | own, team, department, organization, all |
| quote, contract | view, manage | manage from department |
| finance | view, manage | view from department, manage from organization |
| expense | view, submit, approve | approve from team |
| payout | view, approve | view from organization, **approve only all** |
| pro | view, manage | manage from department |
| people | view, manage | view from own (own record), manage from organization |
| calendar | view | |
| campaign | view, manage, publish | publish from department |
| content | view, manage, approve | approve from team |
| site, growthlab, xray | view / edit / publish, view / run | own, assigned, organization, all |
| analytics | view, export | export from organization |
| equipment | view, manage | view from team, manage from department |
| production | view, manage | manage from team |
| workload | view | from team |
| audit | view | from organization |
| system | settings, override, impersonate, health, modules, flags | settings / override / impersonate / modules / flags **only all** |
| brain | use | only all |
| assistant | use | own, all |

## 3. Role templates (seeded once into `os_roles`, editable like any role)

| Template | Department | Home | Holds (summary) |
|---|---|---|---|
| owner | Management | command | every permission at `all` (cannot lose any) |
| admin | Management | command | everything at `all` except system.override / impersonate / settings / modules / flags, brain, payout.approve; plus health, audit, payout.view at organization |
| operations_manager | Operations | work | projects, tasks, clients, pros, equipment, production, calendar, approvals, workload, people view, analytics, quotes and contracts view at organization |
| project_manager | Operations | work | base + team: projects, tasks, files, approvals, messages, calendar, people view, workload, analytics, expenses approve, client / quote / contract view, production manage, equipment view |
| production_manager | Production | work | department set + production / equipment manage, pro view, calendar organization |
| creative_director | Creative | work | department set + content view / manage / approve, campaign view |
| designer | Design | my-fodo | base + content own / assigned |
| video_editor | Post Production | my-fodo | base + content own / assigned, production assigned |
| performance_marketer | Marketing | work | base + campaigns team / department (publish), analytics department, client assigned, growthlab / xray assigned |
| social_media_manager | Marketing | work | base + content department, approve team, campaign view, analytics department |
| sales_executive | Sales | work | base + crm own (manage) and team (view), client / quote assigned |
| finance_manager | Finance | work | base + projects / tasks view organization, finance view + manage, payout view, quotes / contracts / clients / expenses / analytics (export) / audit at organization |
| hr_talent_manager | HR | people | base + people view + manage, pro view + manage, workload, calendar, contracts view at organization |
| developer | Technology | my-fodo | base + site view / edit / publish organization, system.health organization, project assigned |
| viewer | Management | my-fodo | read only: projects, tasks, clients, pros, quotes, contracts, calendar, analytics, people at organization; **no finance** |
| fodo_pro | (none) | pro-home | assigned projects, tasks, files, messages, production; own calendar |
| client | (none) | overview | own projects, tasks, files, messages, quotes, contracts, calendar, crm, content, campaigns, sites, growthlab, xray, approval request |

"base" = own task view / update, assigned task view / update / create, assigned project view, own + assigned file read / upload, own + assigned messages, assigned approval request, own + assigned calendar, own expense view / submit, own people view, assistant.use.own.

Everyone also carries the `client` template on their own records (an employee's own workspace keeps working). FODO Pros carry `fodo_pro`. Legacy marketplace roles map through `LEGACY`: owner → owner, admin → admin, moderator → operations_manager, finance → finance_manager, viewer → viewer.

## 4. Escalation guards (enforced in `people.js` and `authz.js`)

- Nobody can grant (temporary access) or put into a role a permission they do not hold themselves; owners can.
- Only owners give the Owner role, `system.*` or `brain.*` permissions. The Owner role cannot lose permissions. Owners cannot be suspended or offboarded. Nobody suspends or offboards themselves.
- A person cannot change their own roles (needs people.manage with a relation other than own; owners excepted).
- Temporary grants expire by date (checked on every request); revoked grants stop at once.
- Suspended or offboarded members: sessions deleted, grants revoked, every `authorize()` refuses with 403.

## 5. How a request is checked

1. `sessionUser()` → the cookie's user.
2. View-as: if the owner is viewing as someone, GETs resolve as that person; writes are refused.
3. `principal()` → member row (linked by e-mail on first login; `invited` becomes `active`), active roles, role permissions ∪ unexpired grants, legacy fallback, templates for Pro / client, owner flag.
4. Route table: every `/api/os` route declares `{ resource, action }` (or `"self"` for the caller's own data). `authorize()` runs before the handler.
5. Module functions call `authorize()` again with the target row (object-level).
6. `cleanFor()` strips cost, commission, net, margin, profit, internal notes for people without the matching permission.
