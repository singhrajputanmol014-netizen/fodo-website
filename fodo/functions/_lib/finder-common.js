/* Shared helpers for the Competitor Finder functions (v11).
   Everything here is CPU-light on purpose: Cloudflare's free plan allows ~10 ms of CPU per request, so bodies are
   passed through as raw bytes (no JSON parsing) wherever possible. Waiting on the network does not count as CPU. */
export const json = (b, s, h) => new Response(JSON.stringify(b), { status: s || 200, headers: Object.assign({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, h || {}) });
export const UA = "FODO-CompetitorFinder/11 (+https://www.fodo.co.in/competitor-finder/; anmol@fodo.co.in)";

/* per-visitor hourly limit in KV (skipped when KV is not bound) */
export async function limited(env, request, name, perHour) {
  const kv = env.CHAT_KV; if (!kv) return false;
  try {
    const ip = request.headers.get("cf-connecting-ip") || "anon", hour = Math.floor(Date.now() / 3600000), k = `${name}:rl:${ip}:${hour}`;
    const n = parseInt((await kv.get(k)) || "0", 10); if (n >= perHour) return true;
    await kv.put(k, String(n + 1), { expirationTtl: 3700 });
  } catch (e) {}
  return false;
}
export async function sha(s) { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join(""); }

/* "Hedged" fetch: start the first server, add the next one if no answer arrives within `stagger` ms, first good answer wins.
   This keeps load on the free public servers low (usually only one request) but survives a slow or dead server. */
export function hedged(urls, makeInit, { stagger = 7000, timeout = 40000, ok = (r) => r.ok } = {}) {
  return new Promise((resolve, reject) => {
    const ctrls = [], errs = []; let settled = false, started = 0, finished = 0, timer = 0;
    const done = (fn, v) => { if (settled) return; settled = true; clearTimeout(timer); ctrls.forEach((c) => { try { c.abort(); } catch (e) {} }); fn(v); };
    const launch = () => {
      if (settled || started >= urls.length) return;
      const i = started++, c = new AbortController(); ctrls.push(c);
      const t = setTimeout(() => c.abort(), timeout);
      fetch(urls[i], Object.assign({}, makeInit(i), { signal: c.signal })).then((r) => {
        clearTimeout(t); finished++;
        if (ok(r)) return done(resolve, { r, url: urls[i] });
        errs.push(urls[i].split("/")[2] + " " + r.status); if (started < urls.length) { clearTimeout(timer); launch(); } else if (finished >= started) done(reject, Object.assign(new Error("all failed"), { tried: errs }));
      }, (e) => {
        clearTimeout(t); finished++; errs.push(urls[i].split("/")[2] + " " + (e && e.name === "AbortError" ? "timeout" : "failed"));
        if (started < urls.length) { clearTimeout(timer); launch(); } else if (finished >= started) done(reject, Object.assign(new Error("all failed"), { tried: errs }));
      });
      if (started < urls.length) timer = setTimeout(launch, stagger);
    };
    launch();
  });
}
