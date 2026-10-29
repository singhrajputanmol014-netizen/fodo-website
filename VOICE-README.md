# FODO Bot — Voice mode ("Talk to FODO AI") · 2026-10-25

## What it does
A mic button sits next to **Send** in the existing chat. When a visitor presses it:

1. The browser asks for microphone permission. Nothing is requested before the click.
2. The visitor's speech becomes text.
3. The text goes through the **same chat pipeline as a typed message**: `FODO_BOT.ask()` → `answerAsync` (the AI endpoint, if `llmMode` is on) → the offline FODO engine. There are no hard-coded voice answers.
4. The question and the reply appear in the chat, and the reply is read aloud.
5. The conversation loops: listen → think → speak → listen, until the visitor ends it.

**States:** Ready · Listening · Thinking · Speaking · Mic muted · Ended. They are shown with an animated level indicator and live captions.

**Controls:**

| Control | What it does |
|---|---|
| Mute mic | Pauses listening without ending the conversation |
| Stop speaking | Interrupts the spoken reply and starts listening again |
| Mic button while it is speaking | Same as Stop speaking (interrupt) |
| End voice | Ends voice mode |
| Language toggle | `EN / Hinglish` (en-IN) or `हिंदी` (hi-IN) |

All controls are real buttons with labels, so they work with the keyboard and screen readers.

**Voice mode also ends automatically when:**
- the chat is closed or the tab is hidden
- there has been no speech for three listening rounds in a row
- the call reaches `voiceMaxMinutes` (5 minutes by default)

## Providers (js/config.js)
| `voiceProvider` | Cost | How it works |
|---|---|---|
| `"browser"` (default) | No extra voice cost | Browser `SpeechRecognition` (speech → text) and `speechSynthesis` (text → speech). Works with the plain static upload. |
| `"openai-realtime"` | Paid per minute (see below) | Speech-to-speech over WebRTC with OpenAI. Needs the Pages Function `/api/voice-session` and the `OPENAI_API_KEY` secret. **If the function or key is missing, it automatically falls back to `"browser"`.** |

Other settings:

| Setting | Default | What it does |
|---|---|---|
| `voiceEnabled` | `true` | `false` hides the mic button |
| `voiceSessionEndpoint` | `"/api/voice-session"` | Endpoint that hands out the realtime session |
| `voiceMaxMinutes` | `5` | Longest allowed voice call |

### Browser mode: limits to know
- **Speech-to-text works in:**
  - Chrome and Edge on desktop and Android
  - Safari on Mac and iPhone (14.1 or later)
- **Firefox:** has no speech-to-text, so the bot says so and moves the visitor to text chat.
- **Chrome uses Google's servers:** in Chrome, speech recognition runs through Google's online speech service. That needs internet, and the audio goes to Google. This is disclosed in the voice panel and in the privacy policy. FODO never receives or stores the audio.
- **Read-aloud voices depend on the device.** A Hindi voice is used only when the device has one installed.
  - The code never reads Devanagari with an English voice. Those lines stay as captions only.
  - If there is no Hindi voice, the visitor is told once.
- **Language of replies:**
  - Hinglish speech is best recognised in the `EN / Hinglish` setting.
  - Hindi speech needs `हिंदी` (it gives Devanagari text).
  - The offline bot understands Devanagari but mostly replies in Hinglish with some Hindi lines.
  - Fully natural Hindi replies need the AI layer (`llmMode`) or realtime mode.
- **Interrupting:** while a reply is being spoken, the visitor interrupts with a tap (Stop speaking or the mic button). Talking over the reply does not interrupt it, because the device's own speaker audio would be picked up as speech. Realtime mode handles talk-over natively.
- **Cost:** browser mode adds no voice cost. If `llmMode` is on, each spoken question is one `/api/chat` call, the same as a typed one (Workers AI free allowance, then paid).

## Realtime mode: deployment (optional, paid)
The drag-and-drop **"Upload assets"** deploy in the Cloudflare dashboard does **not** run Functions. That is why it rejected `_routes.json`. Realtime mode needs a deploy that includes the `functions/` folder.

1. **Get an OpenAI API key.** Sign in at platform.openai.com → API keys → create a key, and add billing credit.
2. **Deploy with Functions.** Use one of these:
   - **Git (recommended):** push the project folder to a GitHub repo, then go to Cloudflare → Workers & Pages → your Pages project → Settings → Builds & deployments → Connect to Git. Build command: *none*. Output directory: `/`.
   - **Wrangler CLI:** from the project folder, run `npx wrangler pages deploy . --project-name <your-pages-project>`.
3. **Add the secret.** Pages project → Settings → Variables and Secrets → Add:
   - Type: **Secret**
   - Name: `OPENAI_API_KEY`
   - Value: your key
   - Scope: Production (and Preview if you test there)

   Then redeploy.
4. **Optional variables** (same screen, type: Text):

   | Name | Default | What it sets |
   |---|---|---|
   | `REALTIME_MODEL` | `gpt-realtime-2.1` | Model. Use `gpt-realtime-2.1-mini` for roughly a third of the cost. |
   | `REALTIME_VOICE` | `marin` | Voice |
   | `VOICE_PER_MIN` | `3` | Sessions per visitor per minute |
   | `VOICE_PER_HOUR` | `10` | Sessions per visitor per hour |
   | `VOICE_PER_DAY` | `15` | Sessions per visitor per day. Needs a KV binding named `CHAT_KV`. |
   | `ALLOWED_ORIGINS` | none | Extra origins allowed to call the endpoint |

5. **Check the endpoint.** Open `https://www.fodo.co.in/api/voice-session`. It should show `{"ok":true,"service":"fodo-voice","configured":true}`.
6. **Switch it on.** In `js/config.js`, set `voiceProvider: "openai-realtime"`, then redeploy.

### Security
- The permanent key exists only as a Cloudflare secret. The function exchanges it for a client secret that lasts **120 seconds** (`/v1/realtime/client_secrets`). The browser uses that short-lived secret only to open the WebRTC call (`/v1/realtime/calls`).
- The key never appears in frontend files, config, responses or logs. The function logs only the upstream HTTP status.
- **Request checks:**
  - same-origin only (`ALLOWED_ORIGINS` for extras)
  - JSON body, at most 2 KB
  - per-IP rate limits (IP is hashed), plus an optional daily cap through KV
  - 10-second timeout on the upstream call
- No audio or transcripts pass through or are stored on FODO's side.

### Approximate realtime cost
Based on OpenAI's published audio token rates as re-checked by third parties in October 2026. **Verify on OpenAI's pricing page before going live.**

| Model | Audio input | Audio output | Typical cost per minute |
|---|---|---|---|
| `gpt-realtime-2.1` | ~$32 per 1M tokens | ~$64 per 1M tokens | ~$0.06–0.11 (can be higher without caching) |
| `gpt-realtime-2.1-mini` | lower | lower | ~$0.02–0.05 |

Use the rate limits and `voiceMaxMinutes` to cap spend, and set a monthly budget limit in the OpenAI dashboard.

## Files
| File | Change |
|---|---|
| `js/bot-voice.js` | **New.** Voice UI, state machine, browser provider, OpenAI Realtime provider with automatic fallback |
| `functions/api/voice-session.js` | **New.** Secure session endpoint (optional, paid mode) |
| `js/bot.js` | Exposes `FODO_BOT.ask`, `FODO_BOT.open`, `FODO_BOT.ui`, and fires a `fodo:bot-reply` event after each reply (no behaviour change) |
| `js/config.js` | Adds `voiceEnabled`, `voiceProvider`, `voiceSessionEndpoint`, `voiceMaxMinutes` |
| `css/theme-glass.css` | Adds voice-mode styles (mic button, status bar, controls, mobile, reduced motion) |
| `scripts/build_pages.py` + all pages | Adds `bot-voice` to the lazy bot loader, plus a voice paragraph in the Privacy Policy |
| `tests/voice-ui.test.js` | **New.** Browser test of voice mode (51 checks, including the realtime provider with WebRTC stubbed) |
| `tests/voice-function.test.mjs` | **New.** Tests for the session endpoint (21 checks) |

## Tests
```bash
node tests/voice-ui.test.js http://localhost:8765   # serve the folder first: python3 -m http.server 8765
node tests/voice-function.test.mjs
node tests/bot-regression.test.js
```
The UI test runs the real site and the real bot engine. Headless Chromium has no speech service and no voices, so only the browser speech APIs (`SpeechRecognition`, `speechSynthesis`) are simulated.

Not testable here:
- a real microphone with a real speech service, on real phones
- a live OpenAI Realtime call, which needs a key

Check those manually after deploying.

## Call-quality update (2026-10-25, v2)
* **Greeting:** voice mode opens with a short spoken greeting in the chosen language, like picking up a call.
* **Speech unlocked on click:** the first reply is no longer silent on iPhone or Safari.
* **No cut-offs on pauses (desktop):** one listening session per turn, and the turn ends after about 1.3 s of silence. A pause mid-sentence ("how do I get more leads … for my clinic") stays one question.
* **Mobile:** uses short sessions, because continuous mode is unreliable on Android and iOS.
* **Short spoken answers:** the bot speaks a 1–4 sentence summary (about 320 characters) and says the full answer is in the chat. It no longer reads a 250-word reply aloud.
* **Natural reading:**
  * "₹20,000/month" is read as "20,000 rupees per month", and "~₹12k (≈60%)" as "about 12 thousand rupees, about 60%"
  * "e.g." is read as "for example", and "vs" as "versus"
  * arrows, bullets, dashes and slashes are cleaned up before speaking
* **Reliability:**
  * waits for the device's voices to load before the first reply
  * a keep-alive stops Chrome's long-speech freeze
  * a safety timer means the call never gets stuck on "Speaking"
* **Call feel:**
  * call timer (m:ss)
  * screen stays awake during the call (Wake Lock, where supported)
  * friendlier "Still here — go ahead…" prompt before ending after silence
* **Realtime mode:** greets the visitor as soon as the connection opens.
