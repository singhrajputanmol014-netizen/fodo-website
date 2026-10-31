# FODO Bot — upgrade notes (2026-10-25)

Bot-only upgrade. **No page, CSS, layout, copy, route, SEO markup or non-bot script was changed.** The only edits to existing files are the bot script list in each page's lazy loader and three small bot-UI changes in `js/bot.js`.

## 1. Files changed

| File | Change |
|---|---|
| `js/bot-mind-nlu.js` | **New.** Input understanding: normalisation (typos, slang, repeated letters, emoji), Hinglish/Roman-Hindi + Devanagari mapping, language detection, entity extraction (₹ amounts incl. k/lakh/crore/हजार, city, industry, goal, channel, spend/leads/appointments/customers/revenue/AOV/margin/close-rate…), multi-label intent scoring. |
| `js/bot-mind-calc.js` | **New.** Safe calculator (recursive-descent parser — no `eval`/`Function`), %, GST/tax, unit conversion, compound interest, marketing metrics (CTR, CPC, CPM, CPL, CPA, CAC, ROAS, ROI, CVR, AOV, LTV, break-even ROAS), funnel diagnosis, reverse funnel (revenue target → customers → leads). |
| `js/bot-mind-knowledge.js` | **New.** 62 teaching topics (simple → formula → example → meaning → mistake, plus "explain like I'm 10" and "go deeper"), 33 industry playbooks, 88 specific Q&As, evergreen general knowledge, social/personality lines (EN + Hinglish). |
| `js/bot-mind.js` | **New.** Orchestrator: session memory, follow-ups, multi-intent answers, marketing reasoning, budget engine, content engine, website-audit mode (P0/P1/P2), experiment engine, emotional + crisis handling, safety/honesty routes, FODO facts from `config.js` + `data.js`. |
| `js/bot-llm.js` | **New (from the LLM pack, adapted).** Optional AI layer — **OFF by default**. |
| `functions/api/chat.js`, `functions/_lib/knowledge.js`, `_routes.json` | **New (from the LLM pack).** Cloudflare Pages Function for the optional AI layer. Ignored unless deployed with Functions + a Workers AI binding. |
| `scripts/build_llm_knowledge.js` | **New.** Rebuilds `functions/_lib/knowledge.js` from `config.js` + `data.js`. |
| `tests/bot-cases.js`, `tests/bot-regression.test.js`, `tests/llm-function.test.mjs` | **New.** Test suites. |
| `js/bot.js` | Bot UI only: (1) uses `FODO_BOT.answerAsync` when present (needed for the optional AI layer), with an error-safe fallback; (2) input `maxlength` 200 → 1200 so visitors can paste page text for a website audit; (3) a long answer scrolls to its first line instead of its last. |
| all 17 `*.html` + `scripts/build_pages.py` | Only the lazy bot-loader list: appended `bot-mind-nlu, bot-mind-calc, bot-mind-knowledge, bot-mind, bot-llm`, plus a bot-only cache key (`?bot=20261025`). |

Untouched (byte-identical): `css/*`, `js/main.js`, `js/pages.js`, `js/data.js`, `js/config.js`, `js/forms.js`, `js/tools.js`, `js/game.js`, `js/quiz.js`, `js/mascot.js`, `js/analytics.js`, `js/reviews*.js`, all assets, and the previous bot layers (`bot-playbook`, `bot-kb`, `bot-knowledge-2026`, `bot-brain`, `bot-training`, `bot-human`). The originals of every bot file are in `_bot-backup-original/` in the ZIP (outside the site folder).

## 2. Architecture

```
visitor message
 → NLU (normalise · language · entities · intents)          bot-mind-nlu.js
 → MEMORY (session profile: business, city, goal, budget, numbers, pains…)
 → ROUTER (bot-mind.js), in priority order:
     crisis → security/safety → maths → funnel numbers → revenue target → metric calc
     → live-data honesty → emotions → social → memory commands → follow-ups
     → pending-answer acknowledgement → website audit → "do you do X?" → FODO facts
     → honest no-promise answers → Q&A retrieval → comparisons → teaching
     → practical topic for *your* business → content engine → troubleshooting
     → multi-part sections → personal plan → general knowledge
 → existing FODO chain (bot.js → playbook → brain → training → human) for objections / founding programme
 → honest fallback ("I don't want to guess…") — never invented facts
```

Load order (unchanged mechanism, lazy after first interaction): `bot → bot-playbook → bot-kb → bot-knowledge-2026 → bot-brain → bot-training → bot-human → bot-mind-nlu → bot-mind-calc → bot-mind-knowledge → bot-mind → bot-llm`. Each layer wraps `FODO_BOT.answer`; `bot-mind` is the outermost offline layer.

## 3. What the bot can now do (highlights)

* Understands English, Hinglish, simple Hindi, typos and slang (`wht is seo`, `seo kya h bhai`, `bhai leads nahi aa rhi`, `बजट 20 हजार है`).
* Remembers the conversation (this tab only): "I run a salon" → "More bookings" → "Delhi, 20k" → "What should I do?" gives a salon + Delhi + bookings + ₹20,000 plan. Never re-asks what it knows, never asks the same question twice in a row. `what is my business?` recalls; `forget everything` clears.
* Multi-intent: "I have 30k, Meta or Google for my dental clinic in Delhi, and what should I post?" → budget split + channel choice + content, in one answer.
* Diagnoses funnels from numbers ("spent 50k, 500 leads, 50 appointments, 10 customers" → CPL ₹100, CAC ₹5,000, leak at lead→appointment, don't raise budget yet).
* Maths and marketing metrics with formulas and caveats; break-even ROAS; "will 10k give me 100 leads?" answered with honest scenarios, never promises.
* Teaching mode (explain simpler / go deeper / example / why), comparisons (Meta vs Google, ROAS vs ROI…), 33 industry playbooks.
* Content engine: hooks, captions (incl. festival), reel scripts, carousels, 30-day calendars, ad copy (Meta + Google RSA), ad angles, CTAs, pillars, UGC briefs, LinkedIn posts.
* Website audit mode: paste page text → P0 / P1 / P2. It never claims to have opened a URL.
* Experiments (hypothesis → change → audience → metric → success criterion → duration → next action), 30-60-90 plans.
* Emotional intelligence without selling; crisis messages get 112 + Tele-MANAS 14416 and no sales content.
* Honest about limits: no live news/prices/weather/algorithm claims; no investment or medical advice; refuses hacking / personal-data lookups / prompt-injection; explains its privacy.
* FODO answers come only from `js/config.js` + `js/data.js` (services, Growth System, FAQ, contact, tools). It never invents clients, prices, results or guarantees, and it says the Work page has concept case studies and that Reviews is in preview while `reviewsMode` is `"preview"`.

## 4. Optional AI mode (off by default)

The site works fully offline. To let open-ended questions go to a free Cloudflare Workers AI model (offline engine stays the fallback, and maths/crisis/funnel numbers always stay offline):

1. Deploy with Functions (Git integration or `npx wrangler pages deploy .`); drag-and-drop uploads may skip `/functions`.
2. Pages → Settings → Bindings → add **Workers AI** with variable name `AI` (Production + Preview), redeploy. Check `https://<site>/api/chat` returns `{"ok":true,…,"ai":true}`.
3. In `js/config.js` add inside `window.FODO = { … }`: `llmMode: "llm-first",` (or `"local-first"`), `llmEndpoint: "/api/chat",` `llmMaxPerSession: 40,`
4. Add a line to the Privacy section saying chat text may be processed by an AI provider (Cloudflare Workers AI) when AI replies are on. The bot's own privacy answer already switches wording automatically.
5. After editing `config.js` or `data.js`, run `node scripts/build_llm_knowledge.js`.

## 5. Editing the bot

* New Q&A: add `[["question variant", "another variant"], "answer"]` to `K.qa` in `js/bot-mind-knowledge.js`.
* New topic or industry: copy an existing entry in `T` / `IND` in the same file.
* Business facts: edit `js/config.js` / `js/data.js` only — the bot reads them live.
* After any bot edit run the tests (below).

## 6. Tests

```bash
# from the fodo folder (needs Node 18+ and Playwright: npm i -D playwright && npx playwright install chromium)
node tests/bot-regression.test.js          # 547 cases against the real site in headless Chromium
node tests/llm-function.test.mjs           # 21 checks for the optional AI endpoint (mocked AI)
python3 scripts/audit.py                   # existing static site audit
```

Results at delivery: **547/547** regression cases passed (marketing 110, general 50, casual/social 50, Hinglish 30, Hindi 20, typos 30, maths 42, multi-intent 30, follow-up/memory 50, emotional 20, FODO 25, industry 24, budget 20, live/unknown 20, safety/honesty 26); **21/21** AI-endpoint checks; static audit passed; no page errors. Real widget tested on desktop (1366px) and mobile (390px): open, type, Enter, chip click, long answers, no horizontal overflow. AI layer tested in-browser with a mocked endpoint (on / off / failing) — links sanitised, HTML escaped, offline fallback works.

## 7. Known limitations

* It is a deterministic, rules + knowledge engine, not a language model. It handles a very wide range of phrasings, but unusual wording can still miss; when unsure it says so instead of guessing. AI mode (above) covers open-ended questions if you enable it.
* General knowledge is a curated evergreen set, not encyclopaedic.
* Benchmarks it quotes are labelled rough orientation (or FODO's own indicative bands); real numbers vary by market.
* Hindi (Devanagari) input is understood; replies are mostly Hinglish/English with key lines in Hindi.
* Memory lives in `sessionStorage` for the current tab only.
* The `FODO-BOT-UPGRADE-REPORT.md` you supplied describes upgraded `bot-training.js` / `bot-human.js` files and a `tests/bot-regression.test.js` that were not inside any of the ZIPs; those capabilities were rebuilt in the new `bot-mind-*` files instead, and the existing layers were left byte-identical.

## 8. Reviews system (updated 2026-10-25)

* Source of truth: `data/reviews.csv` → run `python3 scripts/build_reviews.py` → generates `js/reviews.js`.
* `js/config.js` now has `reviewsMode: "live"`: the Reviews page shows **only** rows with `record_type=client`, `is_verified_client=true` and `has_written_permission=true`. With none, it shows "We're collecting our first verified client stories." plus a WhatsApp button (and a Google button once `googleReviewUrl` is set).
* The 150 rows currently in the CSV are `record_type=sample` — they are never shown in live mode. `reviewsMode: "preview"` shows them behind a design-preview banner with DEMO tags, for internal layout checks only.
* To add a real review: add a row with `record_type=client`, `is_verified_client=true`, `has_written_permission=true`, `rating` 1–5, `review_date` (YYYY-MM), `review_source` (Google/WhatsApp/Email/Direct), then rebuild.
