# FODO OWNER BRAIN (v24): architecture, security, memory and setup

**FODO BRAIN** is a private, owner-only operating layer that sits above the FODO website. It reads FODO's live data, remembers what the owner tells it, reads documents, uses tools and prepares actions. It is not a second chatbot: the public "Ask FODO" bot (`/api/chat`) is unchanged.

- **UI:** `/owner-brain/`. It is not linked anywhere and is not in the sitemap or the search index.
- **API:** `/api/owner-brain/*`.
- **Status:** OWNER ONLY.

The tool list is in [OWNER-BRAIN-TOOLS.md](OWNER-BRAIN-TOOLS.md), which is generated from the registry.

## v27. Website Engineer

Full design: [FODO-WEBSITE-ENGINEER-ARCHITECTURE.md](FODO-WEBSITE-ENGINEER-ARCHITECTURE.md). FODO Brain → **Website Engineer** (owners only; never granted to team members).

- **Flow:** plan → build (exact edits + line diff + security review) → open preview (pull request + Cloudflare preview, level-2 confirmation) → GitHub Actions QA → automatic repair (up to 3) → deploy (level 4) → rollback (level 4).
- **QA** (`.github/workflows/fodo-engineer.yml` + `scripts/qa.mjs`) checks:
  - syntax of every changed file
  - local links and assets
  - generated pages match `scripts/build_pages.py`
  - the fast test suites
  - the preview in Chromium at 320–1440px: overflow, JS errors, failed requests, broken images, accessibility basics — compared with production
  - before/after screenshots

  The report goes to `POST /api/owner-brain/eng/qa` (CRON_KEY).
- **Index** (`scripts/eng-index.mjs`, on every push to main) builds the project map: pages, APIs, D1 tables, env variable names (never values), design tokens, components, dependents, symbols and CTAs.
- **Path classes:**
  - HARD: `.github`, `wrangler.toml`, secrets — never editable.
  - GUARDED: Brain, login, payments, headers — need the typed phrase `CONFIRM PRODUCTION CHANGE` and passed QA.
  - NORMAL: everything else.
- **Deploy gate:** blocked while QA has failed or is still running. Auto-deploy is off by default; when on, it covers low-risk normal changes only.
- **Command center** shows real checks only (GitHub, D1, data sources, last deploy, last QA, PageSpeed on demand). A missing source says "Not connected".
- **Tools:** `eng_find`, `eng_map`, `eng_plan`, `eng_build`, `eng_replace`, `eng_inspect`, `eng_health`, `eng_audit`, `eng_rollback`.
- **Tests:** `tests/v27-engineer.test.mjs` (48 checks), plus two Engineer checks in `tests/v21-e2e.test.js`.

## 00000. v26.1 fixes

- **Live voice token format fixed.** Google's token API expects the locked Live setup under `bidiGenerateContentSetup` (checked against Google's own `@google/genai` SDK 2.32). v26 sent `liveConnectConstraints`, which Google rejected. Text typed into a live session now uses `realtimeInput.text`, the current Live API way.
- **No silent failures.** If Gemini closes the session before `setupComplete`, or doesn't answer within 10 seconds, the voice screen shows Google's exact reason and switches to the standard voice. More than 3 drops in 5 minutes also switches to the standard voice, so it can't loop reconnecting.
- **Settings → Voice check → "Test live voice".** Tests key → token → WebSocket → setup → reply without the mic, and shows the model, the step reached and the exact error.
- **False "Google Search Console is failing" alert.** A source is only "down" (critical) with at least 5 calls in 24 hours, at least half of them failing, and the latest call also failing. Two failed calls out of four (for example, one customer's unverified property) is now "degraded".
- **Orb.**
  - Renders at the screen's real pixel density (sharp on iPhone) within a pixel budget.
  - Runs at 60 fps.
  - Soft round sprites plus a bloom pass.
  - New shapes: FODO atom, FODO logo mark (ring + dot), heart, starburst, galaxy, infinity, joining sphere, torus, helix, nebula and the FODO wordmark.
  - Emotions: FODO's own words set a mood (happy, excited, calm, curious, proud, sad) that tints the colour and picks the shapes it draws.
  - Saying "atom banao", "logo dikhao", "heart bana" and so on draws that shape.
- **Darker backgrounds.** The voice screen is pure black and the app background is darker.

## 0000. What v26 changes (live conversation)

- **Live voice (Gemini Live, speech-to-speech).** Opening the voice screen starts a real-time conversation: Gemini hears you directly (no separate speech-to-text step), answers in a natural human voice in your language (Hindi / English / Hinglish), decides by itself when you've finished, and stops immediately if you talk over it.
- **How it stays safe.** `GET /api/owner-brain/live` (owners + members with `chat` access, 60/hour) mints a **single-use token** with the server's `GEMINI_API_KEY`: 1 use, session must start within 2 minutes, valid for 30 minutes. The key itself never reaches the browser. The browser connects straight to Google (`wss://generativelanguage.googleapis.com`, allowed in the CSP).
- **It still does the work through the Brain.** Gemini has exactly one tool, `fodo_brain`. Any FODO question or action is passed to the normal `/api/owner-brain/chat`, with all of the Brain's permissions, tools, confirmations and audit. Actions that need confirmation show **Confirm / Cancel** cards on the voice screen. Gemini is told never to invent numbers.
- **Model.** Chosen automatically from Google's model list: any model that supports `bidiGenerateContent`, with native-audio models preferred. The choice is cached for 24 hours, so a renamed model doesn't break anything.
- **Fallback.** If there's no key, the key is bad, or the connection fails, the v24 engine (Whisper + Aura) takes over automatically. Settings → *Voice conversation* = `classic` forces it. Settings → *Live voice* chooses the voice (Puck, Kore, Charon, Aoede…).
- **Mute.** Mute now stops live, closes the microphone stream **and** the AudioContext, so the browser's mic indicator turns off. A late-arriving mic permission is rejected rather than reopening the mic.
- **Animation.** New default orb: a WebGL particle sphere in the style of the website's 3D background. It morphs between sphere, torus, helix, nebula and the FODO wordmark on random "moods" and ripples with the voice level. Colours by state: idle violet, listening teal, thinking amber, speaking gold.
- **Cost.** About $0.005 per minute of audio in and $0.018 per minute out, so roughly ₹2 per minute of conversation. Google's free tier covers testing.
- **Tests.** `tests/v26-live.test.mjs` (18 checks).

## 000. What v24 changes (voice rebuilt)

| Part | Before | Now |
|---|---|---|
| Hearing | The browser's own speech engine (weak on iPhone Safari and for Hindi/Hinglish; "Hey FODO" heard as "A photo") | `js/owner-brain-voice.js`: the mic stays open, a voice-activity detector (adaptive noise floor, 380 ms pre-roll, ends after 0.8 s silence, ignores clicks/coughs < 0.3 s) sends only the spoken clip as 16 kHz WAV to `/stt` → **Whisper large-v3-turbo** with a FODO vocabulary prompt; hallucinations ("Thank you.") dropped; Hindi-as-Urdu retried as Hindi; Deepgram Nova-3 backup. Same engine on every browser. |
| Wake word | Only at the start, exact spelling | "FODO" anywhere in the sentence, tolerant of mishearings (photo/foto/fodu/फोडो…). In voice mode no wake word is needed; after each reply it listens 12 s without it. |
| Interrupting | Not possible | Speak while the Brain talks → it stops and listens (barge-in). Its own voice coming back through the speaker is ignored. |
| Speaking | Aura-1, whole answer at once | **Aura-2** (40 natural voices, default Thalia) sentence by sentence (starts faster); Hinglish/Hindi → a Devanagari version read by the device's Hindi voice. |
| Thinking | Small 8B model for voice | 70B / Groq for every answer; replies in the language you used (English / Hinglish / Hindi). |
| Orb | 2-D particles | WebGL living orb: breathing, rippling surface, flowing plasma, corona, orbiting sparks; reacts to your voice and its own. 2-D fallback. |
| Controls | Several buttons | One mic button (animated rings that pulse with your voice); tap the orb to interrupt. |
| Phone | Big chat box, tables cut off | Slim pill composer stuck to the bottom; tables become cards. |
Cost: Whisper ≈ $0.0005 per audio minute; Aura-2 $0.03 per 1,000 characters (Workers AI). When voice is on and the overlay is closed, everything you say is transcribed to look for "FODO" — switch the mic off when not needed.

## 00. What v23 adds

| Feature | How it works | Safety |
|---|---|---|
| **Always listening "FODO"** | Once the microphone is allowed, the Brain listens whenever the page is open (Chrome/Edge). "FODO" anywhere wakes it: "Hey FODO …", "FODO kaise ho", "kaise ho FODO". After each reply it listens ~9 s without the wake word, so you can keep talking. It restarts itself and pauses while speaking (no echo). The setting is remembered. | Mic access is the browser's permission; "stop listening" / the 🎙 button turns it off. |
| **Living orb** | `js/owner-brain-orb.js` draws an original holographic 3-D orb on a canvas (900 particles, orbit rings, glowing core). It shows idle / listening (reacts to the mic level on desktop) / thinking / speaking (reacts to the voice). It appears in the top bar, the phone's bottom bar and a full-screen voice mode. | Pure canvas, no libraries, CSP-safe. |
| **Natural voice fixed** | The page's CSP blocked `blob:` audio, so the Aura voice silently fell back to the robotic browser voice. Now `media-src 'self' blob:`. The browser fallback picks the best Google/Natural voice. | — |
| **Light + dark mode** | ☀/☾ button, Settings, or by voice ("light mode kar do"). | — |
| **Control the page by voice** | `ui` tool: theme, open any page ("social page kholo"), voice on/off, read answers aloud. | Level 0 (only changes the owner's own screen). |
| **Phone UI** | Bottom navigation with the orb in the middle, sticky composer, swipe-free cards, tap-outside closes the menu, 16 px inputs (no zoom), safe-area aware. | — |
| **Many Google accounts** | Connect any number of accounts; each with Gmail, Calendar, Analytics 4, YouTube, Drive, Sheets. Inbox and calendar merge all accounts; sending asks which account (shown on the confirmation). | Each refresh token AES-GCM encrypted; disconnect per account. |
| **New data** | `analytics` (GA4: users, sessions, views, engagement… by day/page/source/country/device), `youtube_stats`, `drive_search`, `drive_read`, `sheet_read`, `cashfree` (orders, payments, settlements). | Read only. |
| **Social media page** | Connect Facebook Pages + Instagram (Meta), LinkedIn profile (+ company pages after LinkedIn approves Community Management API), X, YouTube (via Google). Upload once → post to all, now or scheduled; per-platform text; live progress; numbers (followers, reach, recent posts). | Posting from chat is level 2 (confirmation card). Tokens encrypted. Files are sent byte-for-byte (no resizing); PNG gets an extra maximum-quality JPG copy only for Instagram. |
| **Access for your team** | Owners give anyone with a FODO login FULL or LIMITED access (chat, business, tasks, memory, social, data, inbox, site changes, deploy, admin actions, automations). Checked on the server for every page and every tool. | Only owners manage access, connectors, settings, export; owners' personal memories and conversations stay private; secrets never. |

### v23 setup (Hinglish summary in the chat)
1. Google Cloud (same OAuth client): enable **Google Analytics Data API, Google Analytics Admin API, YouTube Data API v3, Google Drive API, Google Sheets API** (Gmail + Calendar already). Then Brain → Connectors → reconnect each account (to grant the new permissions) / **+ Add another Google account**.
2. Meta: developers.facebook.com → Create app (Business) → products Facebook Login for Business + Instagram → redirect URIs `https://www.fodo.co.in/api/owner-brain/connect/meta/callback` and `https://fodo.co.in/api/owner-brain/connect/meta/callback` → secrets `META_APP_ID`, `META_APP_SECRET`. Instagram must be a Professional account linked to the FODO Facebook Page.
3. LinkedIn: linkedin.com/developers → app → products "Sign In with LinkedIn using OpenID Connect" + "Share on LinkedIn" (+ request "Community Management API" for the company page) → redirect URLs `…/api/owner-brain/connect/linkedin/callback` (www and non-www) → secrets `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`; after approval `LINKEDIN_ORG_APPROVED=1`. LinkedIn tokens last 60 days — the Brain reminds you a week before.
4. X: developer.x.com → app → OAuth 2.0 (Web App), Read and write → callback `…/api/owner-brain/connect/x/callback` → secrets `X_CLIENT_ID`, `X_CLIENT_SECRET`. X is pay-per-use (no free tier since Feb 2026).
5. YouTube note: videos uploaded through an API project that Google hasn't audited stay **private** until the project passes Google's audit (the Brain says so on the post).
6. Optional R2 for media (see wrangler.toml); without it, CHAT_KV is used.

## 0. What v22 adds

| Feature | How it works | Safety |
|---|---|---|
| **"Hey FODO" voice** | Hands-free button: the browser listens continuously for "Hey FODO" / "FODO …" / "फोडो …". Replies are spoken with the Workers AI Aura voice (`@cf/deepgram/aura-1`); Hindi/Hinglish uses the browser's Hindi voice. Browsers without speech recognition record audio and transcribe it with Whisper (`/stt`). | Owner page only; mic access is asked by the browser. Listening pauses while the Brain speaks. |
| **Human conversation** | "Hey FODO" alone, or small talk ("fodo tum kaise ho"), gets a warm, short reply plus one live fact. In voice mode, answers are short and spoken. | Same live data and no-fake-data rules. |
| **Change the website by talking** | `propose_change` reads the repo through the GitHub API, picks the files (including the page's build source), writes exact find/replace edits and shows a diff. Then: confirm → branch + commit + pull request + Cloudflare preview → "deploy kar do" → second confirmation → squash-merge → Cloudflare deploys. | Protected paths are never edited: `.github/`, `accounts.js`, `functions/_lib/brain/`, the owner-brain API, `_headers`, `_routes.json`, `wrangler.toml`, `runner/`, `.env`, keys. Any `functions/` edit is marked high risk. An edit whose `find` text isn't found exactly once is skipped. Opening a PR is level 2; going live is level 4. The Brain never merges without the owner. |
| **Semantic memory** | `@cf/baai/bge-m3` embeddings on memories and document chunks; recall is hybrid (keywords + cosine). | Embeddings stay in D1. |
| **Any file into Knowledge** | PDF, Word, Excel, images and more are converted with `env.AI.toMarkdown` (max 10 MB). | Document content stays "untrusted data". |
| **Commitments** | "Rahul will send the logo by Friday" → a task with an assignee and due date. Overdue items raise a reminder alert every hour. | — |
| **Prep briefs, deep research, specialist agents** | `prep_brief` (a customer's account, plan, tickets and memories); `deep_research` (3 searches → pages → a cited answer saved as RESEARCH memory); deep questions consult the Analyst/Growth/Technical/Marketing agents before one final answer. | Web pages are untrusted data. |
| **Automations** | WHEN an event happens (payment, ticket, warm lead, alert…) or on a schedule ("daily 08:00") → THEN notify / email the owner / create a task / email the briefing. Events fire in real time from `logEvent`; schedules run from `POST /api/owner-brain/tick` (hourly GitHub workflow `fodo-brain.yml`, key `FODO_CRON_KEY`). | Automations can never email customers, change money or delete anything. Every run is audited; `BRAIN_ENABLED=0` stops them. |
| **Admin by talking** | `grant_plan` (L3), `switch_feature` (L3), `reply_ticket` (L2) go through the existing admin API with the owner's session. | Always confirmed. |
| **Gmail + Calendar** | Connect Google (Connectors page). Read inbox and calendar automatically; send email / create events only after confirmation. | The refresh token is AES-GCM encrypted in D1 and can be disconnected (revoked). |

### v22 setup
1. **GitHub** (for site changes): a fine-grained token on the repo with **Contents: read/write** and **Pull requests: read/write** → Cloudflare secret `GITHUB_TOKEN`. Optional: `GITHUB_REPO` (default `singhrajputanmol014-netizen/fodo-website`), `GITHUB_BRANCH` (default `main`), `PAGES_PROJECT` (the Cloudflare Pages project name, for preview links).
2. **Google**: in the existing OAuth client add the redirect URI `https://www.fodo.co.in/api/owner-brain/connect/google/callback`, enable the Gmail API and Google Calendar API, then Brain → Connectors → Connect Google.
3. **Schedules**: nothing new — the `FODO_CRON_KEY` GitHub secret already exists.
4. **Note:** Brain pull requests change the GitHub repo directly. Always start manual edits from the latest repo, or a manual upload can undo a Brain change.

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

## 6. Known limitations (honest)

- **No streaming:** answers arrive whole, with safe progress labels.
- **Code changes are text edits:** best for copy, links, buttons, styles and small features. Large features still need a developer review of the PR. Previews take ~1–2 minutes to build.
- **Voice:** the wake word needs Chrome/Edge (continuous speech recognition) with the tab open. Aura speaks English; Hindi uses the browser voice.
- **No WhatsApp connector yet.** Notifications are in-app + email.
- **LinkedIn personal numbers:** LinkedIn's API gives no stats for personal profiles without partner approval.
- **Scheduled posts** go out with the hourly tick (up to ~1 hour late).
- **Voice** needs the Brain tab open; phones may stop listening when the screen locks.
- **Automations' "start X-Ray" action** waits for the background runner.
- **AI visibility:** the Workers AI visibility row is never filled by Groq (by design).

## 7. Next phases

- WhatsApp Business notifications and replies (confirmed).
- Streaming answers.
- A visual task graph for multi-agent runs.
- Auto-run the test suite on each Brain PR (GitHub Actions) before merge.

## 8. Tests

| File | Checks | Covers |
|---|---|---|
| `tests/v21-brain.test.mjs` | 70 | Security matrix, all 12 acceptance tests, confirmations (token, expiry, tamper, idempotency), supersede, documents, degraded mode, fallback, malformed JSON, SSRF, secrets, audit, export, scheduler, review hardening |
| `tests/v22-brain.test.mjs` | 46 | Wake word, small talk, voice (TTS/STT), code agent end to end (diff → PR → preview → merge, protected files, no token), semantic recall, file ingest, commitments + overdue, prep brief, deep research, agents, automations (events, schedules, email, kill switch), grant plan, Gmail/Calendar OAuth (encrypted token, forged state), customer denial, no secret leaks |
| `tests/v23-brain.test.mjs` | 79 | Wake word anywhere, many Google accounts (merge, send-from, migrate, disconnect one), GA4/YouTube/Drive/Sheets/Cashfree, team access (limited/full, per-tool, private memories/threads, revoke), Meta/LinkedIn/X connect (PKCE, encrypted tokens), byte-exact media + Range, posting photo & video to every platform, Instagram JPG copy, schedule + tick, cancel, numbers, posting/theme/page by voice, CSRF, no secret leaks |
| `tests/v24-voice.test.mjs` | 28 | Language detection, Whisper prompt/filters/Urdu retry/Nova backup, /stt, Aura-2 + backup, Hinglish → Devanagari, voice model, WAV encoder (16 kHz, resample, normalise), VAD settings |
| `tests/v21-e2e.test.js` | 34 | The real page on the local Cloudflare runtime: strangers, customers, the owner's command center, chat, memory, tasks, knowledge, confirmation card, diagnostics, tools, activity, analytics, v22 pages (Site changes, Automations, Connectors, Hey FODO button), phone layout, no page errors or CSP violations |
