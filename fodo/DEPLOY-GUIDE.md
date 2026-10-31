# FODO: switch on AI chat and realtime voice (step by step)

Drag-and-drop **Upload assets** only publishes static files. The AI parts run as Cloudflare **Functions** (`functions/` folder), and Functions only deploy from **Git** (or Wrangler). Do this once. After that, every `git push` redeploys the site automatically.

## What you need
| Item | Cost | For |
|---|---|---|
| GitHub account | Free | Holds the site code |
| Cloudflare account (you already have one) | Free | Hosting + Workers AI |
| Workers AI | Free daily allowance, then pay-as-you-go | AI chat replies |
| KV namespace | Free tier | Usage counters + daily per-visitor caps |
| OpenAI API key | **Paid**, optional | Realtime voice only |

---

## Step 1: Put the project on GitHub (≈10 min)
1. Unzip **FODO-site-full-project.zip**. Use the `fodo` folder inside it, **not** the upload zip.
2. github.com → **New repository** → name it `fodo-website` → **Private** → Create.
3. On the new repo page, click **uploading an existing file**.
4. Drag **everything inside** the `fodo` folder into it. Include `functions/`, `wrangler.toml`, `js/`, `css/`, every page folder, and the rest.
5. Click **Commit changes**.

> GitHub's web uploader takes at most 100 files at a time, and the project has about 110. Upload in two batches:
> 1. Upload `js`, `css`, `assets` and `functions`, then commit.
> 2. Click **Add file → Upload files**, upload everything else, then commit again.
>
> Or use GitHub Desktop, which has no limit.

## Step 2: Connect Cloudflare Pages to GitHub (≈10 min)
1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Choose `fodo-website` and fill in:

   | Setting | Value |
   |---|---|
   | Framework preset | **None** |
   | Build command | *(leave empty)* |
   | Build output directory | `/` |

3. Click **Save and Deploy**.
4. When it's live, open **Custom domains** → add `fodo.co.in` and `www.fodo.co.in`. Remove them from the old drag-and-drop project first, if they are attached there.

> `wrangler.toml` already declares the free **Workers AI** binding named `AI`. If the dashboard doesn't pick it up, add it by hand: project → **Settings → Bindings → Add → Workers AI** → variable name `AI`. Then redeploy.

## Step 3: Add a KV namespace (recommended, ≈3 min)
1. **Workers & Pages → KV → Create namespace**, name it `fodo-chat`.
2. Pages project → **Settings → Bindings → Add → KV namespace**. Set the variable name to `CHAT_KV` and choose `fodo-chat`.
3. Redeploy: **Deployments → … → Retry deployment**.

This turns on two things:
- the **daily cap per visitor**, which protects your free allowance
- **usage counters**

## Step 4: Check that it works
| Open in a browser | You should see |
|---|---|
| `https://www.fodo.co.in/api/chat` | `{"ok":true,"service":"fodo-bot","ai":true,"kv":true}` |
| `https://www.fodo.co.in/api/voice-session` | `{"ok":true,"service":"fodo-voice","configured":false}` (`false` until Step 6) |
| The site's chatbot | Ask something open-ended, e.g. "explain inflation simply". The note under the input box changes to **"AI-assisted replies"**. |

**No config change is needed.** `llmMode` is `"auto"`, so the chat switches AI on by itself once `/api/chat` reports `ai:true`. On a static upload it stays offline automatically.

## Step 5: Usage dashboard (optional)
1. Pages → **Settings → Variables and Secrets → Add**. Set type **Secret**, name `STATS_TOKEN`, and use any long password as the value.
2. Open `https://www.fodo.co.in/api/stats?days=7&token=YOUR_TOKEN`.

You get daily counts:
- `requests`
- `ok`
- `fallback_quota` / `fallback_error`
- `rate_limited`
- `avg_latency_ms`
- `fallback_rate`
- `voice_sessions`

No message text, IPs or audio are stored.

If GA4 is enabled and the visitor accepted analytics cookies, the browser also sends a `bot_answer` event with `source` = ai | local | offline | fallback. Message text is never included.

## Step 6: Realtime AI voice (optional, paid)
1. platform.openai.com → **API keys** → create a key. Add billing and set a **monthly budget limit**.
2. Pages → **Settings → Variables and Secrets → Add**. Set type **Secret**, name `OPENAI_API_KEY`, and paste the key as the value.
3. In `js/config.js`, change `voiceProvider: "browser"` to `voiceProvider: "openai-realtime"`. Commit on GitHub. Cloudflare redeploys by itself.
4. `/api/voice-session` should now show `"configured":true`.
5. Test the mic in Chrome on desktop and on Android.

Costs and limits are in VOICE-README.md. If anything fails, the visitor automatically gets the free browser voice instead.

## Emergency switches (no code change)
Use **Settings → Variables and Secrets** → add a plain variable, then redeploy.

| Variable | Effect |
|---|---|
| `BOT_AI_DISABLED` = `1` | AI chat off. The offline bot answers everything. |
| `VOICE_DISABLED` = `1` | Realtime voice off. Browser voice still works. |
| `RATE_PER_MIN` / `RATE_PER_HOUR` / `DAILY_PER_IP` | Chat limits per visitor (defaults 6 / 40 / 60) |
| `VOICE_PER_MIN` / `VOICE_PER_HOUR` / `VOICE_PER_DAY` | Voice-session limits (defaults 3 / 10 / 15) |

## Updating the site later
Edit files on GitHub, or upload the new versions, and commit. Cloudflare redeploys in about a minute. **Stop using the drag-and-drop zip** once Git is connected. It would publish a second site without the AI.
