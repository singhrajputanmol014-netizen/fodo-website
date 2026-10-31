# FODO background runner (v19)

The runner is a separate Cloudflare Worker. It builds a Business X-Ray even after the visitor closes the tab. It uses Cloudflare's free plan:

| Part | What it does | Free plan limit |
|---|---|---|
| Queue `fodo-xray` | Holds background X-Rays, with retries | 10,000 operations / day (each X-Ray uses about 3–6) |
| Browser Rendering | A headless browser opens the job's runner page, which runs the same X-Ray engine | **10 minutes of browser time / day** (about 3–6 X-Rays), 3 at once |
| Cron every 15 min | Puts runs that died back on the queue | free |
| GitHub Actions *(optional)* | Takes over when the day's browser time is used up | public repo: free · private: 2,000 min / month |

When the browser time runs out and GitHub is not connected, the job waits in the queue and starts again by itself every 15 minutes. If it can't start within 2½ hours, the X-Ray credit is refunded. The visitor's tab, if still open, shows the real state: queued, waiting, the live stages, then the report. The user also gets an email when the report is ready. On the Workers Paid plan ($5/month) browser time is billed instead of capped.

## Setup (once)

### 1. Make a runner key

In PowerShell:

```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | % {[char]$_})
```

### 2. Create the queue

Cloudflare → **Storage & Databases → Queues → Create queue** → name it `fodo-xray`.

### 3. Create the Worker from this repo

1. Cloudflare → **Workers & Pages → Create → Import a repository**.
2. Pick `fodo-website`.
3. Set **Root directory** to `runner`, the build command to `npm install` and the deploy command to `npx wrangler deploy`.
4. Click **Deploy**. Every push now redeploys it.

### 4. Add the Worker's secret

Worker `fodo-runner` → **Settings → Variables and Secrets** → add Secret `RUNNER_KEY` = the key from step 1.

Copy the Worker's address, for example `https://fodo-runner.<your-account>.workers.dev`.

### 5. Connect the website

Cloudflare → **fodo-website** (Pages) → **Settings → Variables and Secrets** → add two Secrets:
- `RUNNER_URL` = the Worker address from step 4
- `RUNNER_KEY` = the same key

Then **Retry deployment**.

### 6. Check it works

- Open `https://<worker address>/health`. It should show `queue: true, browser: true, key: true`.
- Admin → Costs & profit → System health → "Background X-Rays" should say healthy, or "no calls (24 h)".
- The X-Ray form now shows **Run in the background**.

### 7. Optional: GitHub fallback for more X-Rays per day

1. GitHub → Settings → Developer settings → **Fine-grained token**. Give it access to this repo only, with *Contents: Read and write*.
2. Add it to the Worker as Secret `GH_TOKEN`, and add Variable `GH_REPO` = `singhrajputanmol014-netizen/fodo-website`.
3. In the repo → Settings → Secrets and variables → Actions → add `FODO_RUNNER_KEY` = the same runner key.

## What is protected

- The website only accepts runner calls that carry `x-runner-key`.
- A job's runner page needs an HMAC token of the job id. Only someone holding `RUNNER_KEY` can make that token.
- A job can run only once. Credits are checked when the X-Ray starts, exactly as in the browser.
- No secret ever reaches a browser. The runner page sees only its own job.
