# FODO Website Engineer — architecture (v27)

The owner talks to FODO Brain → the Brain reads the **real** FODO repository on GitHub → writes a plan → writes the edits → GitHub Actions tests them on a Cloudflare **preview** (desktop + mobile screenshots) → the Brain repairs failures itself (up to 3 tries) → the owner approves → it goes live → it can be rolled back.

This builds on the existing v22 code agent (`functions/_lib/brain/github.js`, table `brain_changes`, tools `propose_change` / `open_change` / `merge_change`). It does not run a second, parallel system.

## 1. What the repository is (inspected, not assumed)

| Part | Where | Notes |
|---|---|---|
| Hosting | Cloudflare Pages project (`wrangler.toml`: `pages_build_output_dir = "."`) | Every git branch gets a preview: `https://<branch>.<PAGES_PROJECT>.pages.dev` |
| Public pages | `*/index.html`, **generated** by `scripts/build_pages.py` | A text or markup change must go into both the generated page and the generator, otherwise the next build undoes it |
| Shared design | `css/styles.css`, `css/theme-glass.css`, `css/studio.css`; tokens on `:root` | Dark theme is the default; `[data-theme=light]` overrides |
| Front-end JS | `js/*.js` (plain browser scripts, no bundler) | |
| Back end | Cloudflare Pages Functions `functions/api/**` (routes), libraries in `functions/_lib/**` | ES modules |
| Database | D1 `XRAY_DB` | Tables are created by `CREATE TABLE IF NOT EXISTS` / `MIGRATE` arrays inside `functions/_lib/*.js` — there is no separate migrations folder |
| KV / AI | `CHAT_KV`, Workers AI `AI` | |
| Background | `runner/` (separate Worker: Queue + Browser Rendering) and `.github/workflows/*` (cron: monitor, brain tick, runner fallback) | |
| Auth | `functions/_lib/accounts.js` (sessions, `isOwner`, CSRF `sameOrigin`); Brain access in `functions/_lib/brain/access.js` | |
| Admin | `/admin` → `js/admin.js` + `functions/api/admin/[[path]].js` | |
| Growth Lab | `growth-lab/*`, `plans/`, `account/`, `functions/api/xray`, `functions/api/account` | |
| Tests | `tests/*.test.mjs` (Node 22, `node:sqlite` mocks — no network); `tests/*.test.js` (Playwright + wrangler) | |

## 2. Security model

- **Owner only.** Every `/api/owner-brain/eng/*` route needs a valid server session whose account is one of the owner logins (`isOwner`, via `access.who(...).owner === true`). Team members never get it, not even "full" members. The permission is called `website_engineer`, and only owners can hold it. Nothing from the browser (localStorage, query strings, hidden buttons) is trusted.
- **CSRF.** The existing rule applies: same origin plus a JSON body for every write.
- **Secrets.**
  - The indexer records environment-variable **names** only, as `SECRET_EXISTS=true` or `false`, and never their values.
  - Every proposed diff goes through a secret scanner (key patterns, `env.X` values, tokens). A diff that contains a secret is refused.
  - Results pass through the existing `redact` and `scrubEnv` filters.
- **Three path classes.**
  - **HARD** — never editable from the Brain: `.github/**` (the QA gate itself), `wrangler.toml`, `.env*`, `*.pem`, `*.key`, `runner/wrangler.toml`.
  - **GUARDED** — editable only when the owner types `CONFIRM PRODUCTION CHANGE` and QA has passed:
    - Brain code: `functions/_lib/brain/**`, `functions/api/owner-brain/**`
    - Auth: `functions/_lib/accounts.js`, `functions/_lib/brain/access.js`
    - `_headers`, `_routes.json`
    - Payments: `functions/api/account/**`
  - **NORMAL** — everything else. The usual plan → approve → preview → approve flow applies.
- **No direct production writes.**
  - Code changes go only through a branch, a commit and a pull request.
  - Production changes only by merging that pull request, which is a level-4 confirmation.
  - Database schema changes are code. A migration in a `MIGRATE` array runs on the next request after deploy.
  - Destructive SQL (`DROP`, `TRUNCATE`, mass `DELETE`) is refused by the security reviewer unless the owner typed `CONFIRM PRODUCTION CHANGE`.
  - There is no raw-SQL or shell tool.
- **Self-modification.** Allowed only as a GUARDED change, so it needs the typed phrase, QA must pass, and the owner merges. The Brain cannot change `.github/**`, so it cannot weaken the tests that gate it. Automatic repairs never touch GUARDED or HARD paths.
- **Untrusted input.** File contents and web pages are data. The prompts tell the model to ignore instructions found inside files.

## 3. Data flow

```
Owner request ─▶ /eng/plan
                   │  index (project map from the GitHub tree + key files, cached per commit)
                   │  find (GitHub code search + path match + map lookups)
                   │  orchestrator picks agents: analyst · design · frontend · backend · database · api · seo · performance · security · qa
                   ▼
              CHANGE PLAN (files, components, backend, database, risk, path classes, dependents, rollback)  ◀── shown to owner
                   │  [Build preview]
                   ▼
              /eng/build ─▶ edits (find→replace, each must apply exactly once) + new files
                   │  security review (deterministic scanner + security agent)
                   ▼
              DIFF shown  ── [Open preview] (level-2 confirm) ─▶ branch brain/… + commit + PR
                                                                   │  Cloudflare Pages builds the preview
                                                                   │  GitHub Actions "FODO QA" (fodo-qa.yml + scripts/qa.mjs)
                                                                   ▼
                                     QA report ─▶ POST /api/owner-brain/eng/qa (x-cron-key) ─▶ brain_changes.qa
                                     fail? ─▶ repair (max 3: error → fix edits → new commit on the branch → QA re-runs)
                                     pass  ─▶ owner sees before/after screenshots at 4 breakpoints
                   [Deploy] (level-4 confirm; GUARDED also needs the phrase) ─▶ squash-merge ─▶ Cloudflare deploys production
                   [Rollback] (level-4) ─▶ new PR that restores every changed file to its pre-merge content ─▶ merge
```

## 4. Tools (all real API calls; nothing is "pretended")

| Tool | Does | Level |
|---|---|---|
| `eng_map` | Project map: routes, pages, APIs, tables, env names, design tokens, components, workflows | 0 |
| `eng_find` | "Where is X?" Exact files with line numbers | 0 |
| `code_read` / `code_search` | Existing tools, kept | 0 |
| `eng_plan` | The change plan; writes nothing | 1 |
| `propose_change` | Existing tool: edits and diff (now design-system aware, security-reviewed, guarded paths need the phrase) | 1 |
| `eng_replace` | Global literal replace ("change the WhatsApp number everywhere"). Shows the count first, then prepares a change | 1 |
| `open_change` | Existing: branch, PR and preview | 2 |
| `merge_change` | Existing: deploy (QA must not have failed; GUARDED needs passed QA) | 4 |
| `eng_rollback` | Revert a merged change through a PR, then merge | 4 |
| `eng_inspect` | Visual inspection of any FODO page (desktop/tablet/mobile screenshots, console errors, broken images, overflow), run by GitHub Actions | 1 |
| `eng_health` | Command-center data: real checks only; "Not connected" when a source is missing | 0 |

## 5. Agents

Each agent has its own system prompt, which the orchestrator in `engineer.js` adds to each step. They are not separate processes, but they share one structured result format: `{status, agent, files_changed, warnings, tests, next_step}`.

| Agent | Job |
|---|---|
| WEBSITE_ANALYST | Picks the files and reads the dependencies |
| DESIGN_AGENT | Applies FODO design tokens; reuses before extending, extends before creating |
| FRONTEND_AGENT | `index.html` plus `build_pages.py`, CSS and JS |
| BACKEND_AGENT | `functions/**`: auth, validation, rate limits |
| DATABASE_AGENT | Additive migrations only |
| SEO_AGENT | Titles, meta, canonical, schema, sitemap |
| PERFORMANCE_AGENT | Lazy loading, sizes, render-blocking |
| SECURITY_AGENT | Reviews every diff |
| QA_AGENT | Decides which routes to screenshot; reads the QA report and writes the repair |
| DEPLOYMENT_AGENT | PR, merge, rollback |
| BRAIN_ENGINEER | Changes to the Brain's own code (GUARDED) |

Code generation uses the `code` model route: Gemini first (the free key), then Groq, then Workers AI, with larger outputs.

## 6. Database changes

New columns on `brain_changes` (PRAGMA-checked, additive):

- `plan` (JSON)
- `klass` (normal|guarded)
- `qa` (JSON: status, checks, failures, shots)
- `qa_status`
- `attempts`
- `head_sha`
- `merged_sha`
- `base_sha`
- `approved_by`
- `rollback_of`
- `kind` (change|replace|rollback|inspect)

New table: `brain_eng_index (k PRIMARY KEY, sha, data, updated_at)` caches the project map per commit.

Screenshots are stored in KV (`CHAT_KV`, key `eng:shot:<id>`, 14-day TTL) and served only to owners through `GET /eng/shot/<id>`.

## 7. API

- `GET`:
  - `eng/overview` (command center)
  - `eng/map`
  - `eng/find?q=`
  - `eng/changes`
  - `eng/change/<id>` (plan, diff, QA, screenshots)
  - `eng/shot/<id>`
  - `eng/health`
- `POST`:
  - `eng/plan {request}`
  - `eng/build/<planId> {phrase?}`
  - `eng/replace {find, replace, phrase?}`
  - `eng/inspect {path}`
  - `eng/rollback/<id>` (returns a confirmation card)
  - `eng/repair/<id>`
- `POST eng/qa` is called by GitHub Actions. It is authenticated with `x-cron-key` (= `CRON_KEY` / `FODO_CRON_KEY`), not by a session. It only accepts reports for changes the Brain itself opened, matched by branch and head sha.

## 8. UI

FODO Brain → **Engineer** (owners only):

- **Command center.** Website, admin, Growth Lab, API, database, workers, last deployment, last change and the health score, all from real checks.
- **Workspace.** "What do you want to change?" with quick actions: Analyze website, Create feature, Fix issue, Redesign page, Find anything, Change everywhere.
- **Change card.** The plan, then the diff, then QA results with before/after screenshots at 375, 768, 1280 and 1440. Buttons: Open preview, Deploy, Discard, Rollback.
- **Project map.** Pages, APIs, tables, env names (exists ✓ / missing), design tokens.
- **History.** Every change with who approved it, the tests, the deployment and rollbacks.

## 9. Deployment and rollback strategy

- **Default flow:** edit → test → preview → owner approval → deploy.
- **Auto-deploy:** Settings → Engineer → "Auto-deploy low-risk changes" (off by default). It is only for NORMAL, low-risk changes whose QA passed. GUARDED changes never auto-deploy.
- **Rollback:** a new PR restores the exact pre-merge content of every file the change touched (deletes files it created), then merges. The original change is marked `rolled_back`, and the rollback is an auditable change of its own.

## 10. Health score (no fake numbers)

| Area | Source |
|---|---|
| Performance, SEO, Accessibility, Best practices | Google PageSpeed (Lighthouse) for the homepage, mobile |
| Reliability | Admin health (provider failure rates), D1 ping, latest QA run |
| Code health | Latest QA syntax, link and asset checks |

A missing source shows "Not connected" and is left out of the average. It is never filled with a made-up number.

## 11. Setup (once)

| Where | What |
|---|---|
| GitHub fine-grained token `GITHUB_TOKEN` | This repo only: **Contents** read/write, **Pull requests** read/write, **Actions** read/write (to start the visual inspection) |
| Cloudflare variable `PAGES_PROJECT` | The Pages project name (`fodo-website`) → preview links |
| GitHub repo secret `FODO_CRON_KEY` | Already used by the hourly Brain workflow → QA reports back |
| GitHub repo variable `FODO_PAGES_PROJECT` | Optional; defaults to `fodo-website` |

## 12. Limits (stated honestly)

- The Brain edits code through free AI models (Gemini free tier first). Large redesigns get split into several smaller changes.
- A plan shows at most about 8 files per change. Bigger requests become a multi-step task list of changes.
- Visual checks run on GitHub Actions (free for public repos; 2,000 minutes a month for private ones). A QA run takes about 3–6 minutes, mostly waiting for the Cloudflare preview.
- Cloudflare deployment status and rollback go through git, because there is no Cloudflare API token. With `CF_API_TOKEN` and `CF_ACCOUNT_ID`, the command center also shows the live deployment from Cloudflare. Without them it says "via GitHub".
