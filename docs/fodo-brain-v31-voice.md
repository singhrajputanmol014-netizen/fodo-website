# FODO Brain v31 — human-like live voice

| Problem | Fix |
|---|---|
| Long conversations stopped after ~10–15 min | `contextWindowCompression.slidingWindow` (no session length cap) + `sessionResumption`: the page keeps the newest handle; on Google's `goAway` or an unexpected drop it reconnects with a fresh token **and the handle**, so the same conversation continues (up to 4 automatic retries). |
| Cut him off mid-sentence / lost details in long speech | `realtimeInputConfig.automaticActivityDetection`: end-of-speech sensitivity LOW, 1.1 s silence; instructions: listen fully, keep every number/name, pass the complete request to fodo_brain. |
| Couldn't interrupt FODO while it talked | The echo gate was a fixed 0.055 RMS (too loud for phones). Now it follows the speaker-leak level during playback (min 0.018), so a normal voice gets through. |
| "Answer only when I say FODO" vs alone | Mode **Always answer** / **Only when I say "FODO"** (voice panel chip + Settings). Group mode: Gemini `proactivity.proactiveAudio` + instructions, and the page itself drops any reply (and blocks any Brain action) for a turn that doesn't contain the wake word — except a 20 s follow-up window after FODO answered. |
| General questions | Live session has Google Search; instructions say answer any question fully. |
| Voices | All 30 Gemini Live voices, picker in the voice panel and Settings, **▶ Preview** plays a real sample. |
| History on phone | Chat history drawer (☰ History) with delete; live voice turns are saved to chat history (`POST /api/owner-brain/voicelog`). |
| A newer Live feature refused by Google | Token tries rich → mid → basic → open; and if a session is refused at setup the page retries automatically as a plain session. |

Tests: `tests/v31-live-client.test.js` (fake Gemini WebSocket in Chromium, 15), `tests/v26-live.test.mjs` (22), `tests/v30-brain-xray.test.mjs` (voice log), v21 e2e (phone history + voice controls).
Website Builder v31: `docs/website-builder-store.md` + 22 new templates (37 total), category filter, motion (Style → Motion: subtle / lively / none), new landing page.
