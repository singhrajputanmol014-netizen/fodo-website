# FODO Brain v30 — voice X-Ray, web search, chat history delete

## "fodo.co.in ka X-Ray karke do" (voice or chat)
1. The router understands spoken forms: `fodo dot co dot in` → `fodo.co.in`, `x ray / xray / एक्स रे` → X-Ray, and no longer
   strips the wake word "fodo" out of `fodo.co.in`. "website ka x-ray bana do" is an X-Ray, not a website code change.
2. `start_xray`: with the background runner (RUNNER_URL/RUNNER_KEY) the X-Ray runs there (email when ready). Without it,
   the tool returns a UI action and **the Brain page runs the real X-Ray itself** in a hidden same-site frame
   (`/business-x-ray/?u=…&go=1&embed=1`, same login, owner = free). Progress shows in a card in the chat.
3. When the X-Ray page finishes it posts `{fodo:"xray-done"}` to the Brain (same origin only). The Brain asks itself for
   the saved report (`latest_xray`) and posts the summary — and with live voice on, sends `[X-RAY RESULT] …` into the
   Gemini session so FODO **says** the score, weak areas and top fixes. Keep the Brain tab open for the 2–4 minutes.
4. "fodo.co.in ka latest X-Ray dikhao" reads the last saved report instead of running a new one.

## Web search + any website
- `web_search` order: Serper → Brave → **Gemini with Google Search grounding** (works on the free GEMINI_API_KEY; returns a
  short grounded answer plus the real source links). Optional `GEMINI_SEARCH_MODEL` env.
- Phrases: "google pe search karo …", "… dhoondo / khojo", "latest news", "<site> check karo / kya hai" (reads the site).
- Live voice instructions now send X-Rays, website checks, search and anything current to FODO Brain.
- Note: the X-Ray's own Google-ranking/competitor modules still need SERPER_API_KEY or BRAVE_API_KEY; without them the
  X-Ray still reads the website, PageSpeed etc. and marks those modules "unavailable" (never invented).

## Chat history
- ✕ next to each conversation deletes it; "Delete all chat history" (type DELETE) removes every conversation you may open
  (`DELETE /api/owner-brain/threads`, same-origin only, audited). Memory, tasks and documents are not touched.

Tests: `tests/v30-brain-xray.test.mjs` (26) + v21-e2e browser flow (X-Ray from chat → done → summary; delete all history).
