# FODO OWNER BRAIN (v21): architecture, security, memory and setup

**FODO BRAIN** is a private, owner-only operating layer that sits above the FODO website. It reads FODO's live data, remembers what the owner tells it, reads documents, uses tools and prepares actions. It is not a second chatbot: the public "Ask FODO" bot (`/api/chat`) is unchanged.

- **UI:** `/owner-brain/`. It is not linked anywhere and is not in the sitemap or the search index.
- **API:** `/api/owner-brain/*`.
- **Status:** OWNER ONLY.

The tool list is in [OWNER-BRAIN-TOOLS.md](OWNER-BRAIN-TOOLS.md), which is generated from the registry.

## 1. What v1 does (and how it maps to the 12 acceptance tests)

| # | Owner says / does | What happens |
|---|---|---|
| 1 | "How is FODO doing today?" | `fodo_today` and `admin_insights` read the real D1 data through the existing admin API: users, sign-ups, X-Rays, revenue, active users, leads, help desk. The answer shows confidence (HIGH) and its sources. |
| 2 | "Check the whole system." | `system_check` tests D1 read/write/delete, KV, each AI provider, the data sources (admin health), the runner, email, research, memory and tools. The **Diagnostics** page runs live AI pings. |
| 3 | "Analyze my latest X-Ray." | `latest_xray` reads the real report. It returns the score, areas, top opportunities and competitors, and compares the score with the previous X-Ray of the same site: what is newly flagged and what is no longer flagged. |
| 4 | "What should I focus on?" | Business data, insights, open tasks, the latest X-Ray and goal/decision memories are combined into ranked recommendations. |
| 5 | "Remember that we are focusing on X." | Stored as a **DECISION**. A newer decision about the same thing supersedes the old one. |
| 6 | "What are we focusing on?" | Hybrid retrieval finds the active decision. Superseded ones appear only when asked about the past. |
| 7 | Upload a document, then "Understand this". | It is chunked by sections, given a version by hash, and the AI extracts a summary, facts, decisions, tasks, risks, opportunities, entities and open questions. All of it is stored. |
| 8 | "What did that document say?" | `search_documents` returns the matching passages with the title and date. |
| 9 | "Create a task to fix this." | A real task is created. "This" is resolved from the conversation. |
| 10 | "What can you do?" | The list is built from the live tool registry, never hard-coded. |
| 11 | A customer calls the API. | 403. |
| 12 | A sensitive action. | A preview card with a confirmation token. Nothing happens until **Execute**. |

**Other parts of v1**
- **Pages:** Overview (command center), Brain (chat with conversation threads), Notifications (alerts), Tasks & projects, Memory, Knowledge, Activity (audit log), Tools, Diagnostics, Analytics and Settings.
- **Voice:** push-to-talk uses the browser's speech recognition (en-IN). Spoken replies are optional. Saying "Jarvis/Brain, …" works, but a wake word is not required.
- **Modes:** "think like my CEO / CTO / CMO" and "personal mode". Modes change the context and style, never the permissions.
- **Daily briefing and alert scan:** they run from the existing daily scheduler (`/api/monitor/tick` at 06:47 IST), once a day, and also whenever Overview is opened.
- **Degraded mode:** with no AI provider, every tool still runs and the answer is built from the data. The Brain says so and never pretends.

## 2. Architecture

```
owner ─▶ /owner-brain/ (empty shell, js/owner-brain.js) ─▶ /api/owner-brain/* (gate: owner session on the server)
   chat ─▶ orchestrator.route()        fast intent rules (EN/Hinglish): health, today, X-Ray, focus, costs, leads, memory…
         ─▶ planner (AI, JSON)          only when no rule matched or the owner asked for an action
         ─▶ executor                    validate args → risk level → run (≤1) or create a pending action (2–4) · never (5)
         ─▶ retrieval                   memory (keyword + stem + importance + recency + time windows) + document passages
         ─▶ context builder             LIVE DATA > memory > documents, strict size limits, secrets scrubbed
         ─▶ model router                Workers AI → Groq → Gemini (owner can pick the first one) → degraded mode
         ─▶ answer + sources + confidence + actions ─▶ conversation + audit log
```

**Files**

| Path | What it holds |
|---|---|
| `functions/api/owner-brain/[[path]].js` | API router and owner gate |
| `functions/_lib/brain/store.js` | D1 tables, audit, settings, secret redaction |
| `functions/_lib/brain/models.js` | Model router, fallback, cost logging, JSON parsing |
| `functions/_lib/brain/memory.js` | Memory (supersede, versions), retrieval, tasks/projects, documents, `vectorStore` interface |
| `functions/_lib/brain/tools.js` | Tool registry, executor, confirmations, system check, today's numbers, report summary |
| `functions/_lib/brain/orchestrator.js` | Intent, planner, chat flow, extraction, document ingestion |
| `functions/_lib/brain/insights.js` | Alerts, briefing, daily scheduler hook |
| `js/owner-brain.js`, `css/owner-brain.css`, `owner-brain/index.html` | UI. The page is generated by `scripts/build_pages.py` |

**Reused, not rebuilt**
- Admin API handlers, called in-process with the owner's own session (same code, same checks).
- Workers AI / Groq / Gemini (`aivis.js`).
- `api_usage` cost log.
- `safeFetch` / `safeUrl` (SSRF-safe fetching).
- The X-Ray start route and background runner.
- `sendMail` / the Admin → Mail log.
- `config.js` live prices.
- `prompts.js`: Brain prompts are versioned and editable by owners in Admin → AI prompts (`brainCore`, `brainPlanner`, `brainExtract`, `brainDocument`).
- The daily cron.

## 3. Security model

**The gate (every request)**
1. `BRAIN_ENABLED` is not `"0"`.
2. Accounts are on.
3. There is a valid session cookie, checked in D1.
4. The account is one of the `OWNER_EMAILS`.

Admins, viewers, customers and anonymous visitors all get the same plain `403 {"reason":"Not available."}`. Headers, query strings, localStorage and "I am the owner" messages are never trusted. The page shell shows "Page not found" to them.

**CSRF:** POST/PATCH require same origin and a JSON body. DELETE requires same origin.

**Risk levels and confirmations**
- Level 0–1 tools run directly.
- Level 2 (email), 3 (price change) and 4 (block user, delete memory or task) create a **pending action**:
  - a random 32-character token, stored only as a hash;
  - bound to the owner;
  - a hash of the exact arguments, with the target resolved to an id before the preview is shown;
  - a 15-minute expiry;
  - single use: an atomic `pending → running` claim makes it idempotent.
- `/confirm` re-checks all of these. A replayed confirm returns the stored result and never runs again.
- Level 5 (secrets) never runs.

**The model can only call registered tools**
- There is no SQL, shell, code or unrestricted fetch.
- Arguments are validated against each tool's schema. Unknown tools are dropped.
- `read_webpage` and `start_xray` use the SSRF-safe fetcher: http/https only, private and metadata IPs blocked, every redirect hop re-checked. Size and time are limited.

**Secrets**
- Tool results pass through `redact()`, and everything sent to a model or the browser passes through `scrubEnv()`, which removes the literal values of every secret.
- The audit log stores arguments as a hash only. The export is redacted.

**Prompt injection**
- Documents, web pages, search results and customer-written text inside tool results are labelled DATA in the prompt.
- Memories derived from a document are labelled "unverified".
- Links from model output render only as internal `/paths`, or as `https` links that show their host.

**The page:** noindex, no framing (`frame-ancestors 'none'`, `X-Frame-Options: DENY`), and a strict CSP (scripts only from this site).

**Scheduler session:** the daily briefing runs as the first owner account. It uses a session that lives 5 minutes, is never sent out, and is deleted in `finally`.

## 4. Memory

**Tables** (all additive, in `XRAY_DB`, created automatically)

| Area | Tables |
|---|---|
| Memory | `brain_memory`, `brain_memory_versions` |
| Work | `brain_tasks`, `brain_threads`, `brain_messages` |
| Documents | `brain_docs`, `brain_chunks` |
| Actions and logs | `brain_actions`, `brain_audit`, `brain_alerts`, `brain_feedback` |
| Configuration | `brain_settings`, `brain_briefings` |

**Memory types:** FACT, BELIEF, HYPOTHESIS, DECISION, PREFERENCE, GOAL, PROJECT, IDEA, NOTE, PROCESS, SOP, LEARNING, INSIGHT, WARNING, RESEARCH, DOCUMENT.

**Scopes:** `fodo` (business) and `personal`. They are never mixed by default.

**Temporal knowledge**
- A new FACT/DECISION/… about the same thing (word overlap ≥ 0.5) marks the old one `superseded`, sets `valid_until` and `superseded_by`, and writes a version row.
- Editing writes a version row.
- **Forget** deletes the memory and its history. In chat, forget asks for confirmation.
- **Forget all personal** is on the Memory page.

**Retrieval (v1):** keyword match with simple stemming, title weighted ×3, plus importance, recency, a boost for decisions and a penalty for superseded items. It understands "today / yesterday / last week / last month" and "before / previous". Swapping in Cloudflare Vectorize later only replaces `vectorStore` in `memory.js`.

**Documents:** split into sections by heading (~1,200 characters). The same content (hash) is not stored twice, and a changed document with the same title gets a new version.

**What happens to extracted items**
- Tasks found in a document are created as `suggested`.
- Decisions are stored as "not yet confirmed".
- Nothing is stored silently: memory is written only when the owner says so, or when the owner uploads a document. The Settings switch "Memory off" stops all new writes.

## 5. Setup and deployment

No new Cloudflare binding is needed. It runs on the existing `XRAY_DB` (D1), the `AI` binding and `GROQ_API_KEY` / `GEMINI_API_KEY`.

1. Push v21 the usual way.
2. Log in on the site with `anmol@fodo.co.in` or `singhrajputanmol014@gmail.com`.
3. Open `https://www.fodo.co.in/owner-brain/`.

**Optional environment variables**

| Variable | Purpose |
|---|---|
| `BRAIN_ENABLED=0` | Switches the Brain off completely |
| `CRON_KEY` | Already set: the daily briefing rides on the monitoring scheduler |

The model choice, memory switch, alerts, briefing and per-tool on/off live in Brain → Settings, stored in D1.

## 6. Known limitations of v1 (honest)

- **No streaming:** answers arrive whole, with safe progress labels.
- **Files:** PDF, Word and Excel files must be pasted as text. Text, Markdown, CSV, JSON and HTML files upload directly.
- **Retrieval is keyword-based,** not semantic. The vector interface is ready.
- **One-step planning:** up to 5 tools per message. There is no multi-agent orchestration or visible task graph yet.
- **No connectors yet:** no Gmail, Calendar, WhatsApp sending, social media, GitHub or codebase index. Email sending uses the site's Resend account.
- **Automations:** only the daily briefing and alert scan. There is no automation builder yet.
- **Notifications are in-app only.**
- **AI visibility:** the Workers AI visibility row is never filled by Groq (by design).

## 7. Next phases

- Vectorize embeddings and semantic retrieval.
- An automation builder (event → condition → action, with an audit trail).
- Email/WhatsApp notifications for critical alerts.
- Gmail and Calendar connectors (send and create always confirmed).
- A codebase index for "where is X handled?".
- Multi-agent roles (Analytics → Marketing → Growth) with a visible task graph.
- A web research pipeline with stored research memory.
- PDF/DOCX parsing in a background job.

## 8. Tests

| File | Checks | Covers |
|---|---|---|
| `tests/v21-brain.test.mjs` | 70 | Security matrix, all 12 acceptance tests, confirmations (token, expiry, tamper, idempotency), supersede, documents, degraded mode, fallback, malformed JSON, SSRF, secrets, audit, export, scheduler, review hardening |
| `tests/v21-e2e.test.js` | 20 | The real page on the local Cloudflare runtime: strangers, customers, the owner's command center, chat, memory, tasks, knowledge, confirmation card, diagnostics, tools, activity, analytics, phone layout, no page errors or CSP violations |
