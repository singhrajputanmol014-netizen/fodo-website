/* FODO Competitor Finder — contact details from a business's own public website.
 *   POST /api/enrich  { "urls": ["https://example.com", …] }   (max 4 per call — the browser sends batches)
 *   → { ok, results: { "<url>": { emails, phones, whatsapp, instagram, facebook, linkedin, twitter, youtube, title, description, contactPage, error } } }
 * Reads the home page and, if linked, one contact/about page. Only public http(s) sites; private and local addresses are refused.
 * Nothing is stored. CPU is kept small (pages are cut at 250 KB) so it fits Cloudflare's free plan. */
const UA = "Mozilla/5.0 (compatible; FODO-CompetitorFinder/2.0; +https://www.fodo.co.in/competitor-finder/)";
const json = (b, s) => new Response(JSON.stringify(b), { status: s || 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const MAX_URLS = 4, MAX_BYTES = 250000;

export function safeUrl(u) {
  try {
    const x = new URL(/^https?:\/\//i.test(u) ? u : "https://" + u);
    if (!/^https?:$/.test(x.protocol) || x.username || x.password) return null;
    const h = x.hostname.toLowerCase();
    if (!h.includes(".") || /^(localhost|.*\.local|.*\.internal|.*\.lan|metadata\.google\.internal)$/.test(h)) return null;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) { const [a, b] = h.split(".").map(Number); if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224) return null; }
    if (h.startsWith("[") || h.includes(":")) return null;
    if (x.port && !["80", "443", ""].includes(x.port)) return null;
    return x;
  } catch (e) { return null; }
}
async function getPage(url) {
  const r = await fetch(url.href, { headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" }, redirect: "follow", signal: AbortSignal.timeout(7000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const ct = r.headers.get("content-type") || ""; if (!/html|xml|text/i.test(ct)) throw new Error("not a web page");
  const reader = r.body.getReader(), dec = new TextDecoder(); let html = "", n = 0;
  while (n < MAX_BYTES) { const { done, value } = await reader.read(); if (done) break; n += value.length; html += dec.decode(value, { stream: true }); }
  try { reader.cancel(); } catch (e) {}
  return { html, final: new URL(r.url || url.href) };
}
const uniq = (a) => a.filter((x, i) => x && a.indexOf(x) === i);
const BAD_MAIL = /\.(png|jpe?g|gif|svg|webp|avif)$|@(example|domain|email|sentry|wixpress|sentry-next)\.|^(name|your|you|user|email)@/i;
export function extract(html, base) {
  const h = html.replace(/<script[\s\S]*?<\/script>/gi, (m) => (/ld\+json/i.test(m) ? m : " ")).replace(/<style[\s\S]*?<\/style>/gi, " ");
  const dec = (s) => s.replace(/&#64;|&commat;/g, "@").replace(/&amp;/g, "&").replace(/\s*\[\s*at\s*\]\s*|\s+\(at\)\s+/gi, "@").replace(/\s*\[\s*dot\s*\]\s*/gi, ".");
  const text = dec(h);
  const emails = uniq([...text.matchAll(/mailto:([^"'?\s>]+)/gi)].map((m) => decodeURIComponent(m[1]).toLowerCase())
    .concat([...text.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi)].map((m) => m[0].toLowerCase()))).filter((e) => !BAD_MAIL.test(e) && e.length < 80).slice(0, 6);
  const phones = uniq([...text.matchAll(/href=["']tel:([^"']+)["']/gi)].map((m) => decodeURIComponent(m[1]).replace(/[^\d+]/g, "")).filter((p) => p.replace(/\D/g, "").length >= 7)).slice(0, 5);
  const links = [...text.matchAll(/href=["']([^"'#]+)["']/gi)].map((m) => m[1]);
  const find = (re) => { const l = links.find((x) => re.test(x)); return l ? l.split("?")[0] : ""; };
  const whatsapp = uniq(links.filter((l) => /wa\.me\/|api\.whatsapp\.com\/send|whatsapp\.com\/send/i.test(l)).map((l) => { const m = l.match(/wa\.me\/(\d+)|phone=(\d+)/i); return m ? "+" + (m[1] || m[2]) : ""; })).slice(0, 3);
  const title = ((h.match(/<title[^>]*>([^<]{1,200})<\/title>/i) || [])[1] || "").replace(/\s+/g, " ").trim();
  const description = ((h.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']{1,400})/i) || h.match(/<meta[^>]+content=["']([^"']{1,400})["'][^>]*name=["']description["']/i) || [])[1] || "").trim();
  let contactPage = "";
  const c = links.find((l) => /contact|reach-us|get-in-touch|about/i.test(l) && !/^(mailto|tel|javascript):/i.test(l));
  if (c) { try { const u = new URL(c, base); if (u.hostname.replace(/^www\./, "") === base.hostname.replace(/^www\./, "")) contactPage = u.href; } catch (e) {} }
  return { emails, phones, whatsapp, instagram: find(/instagram\.com\/(?!p\/|reel|explore|sharer)[^/]+/i), facebook: find(/facebook\.com\/(?!sharer|share|dialog|plugins|tr\b)[^/]+/i),
    linkedin: find(/linkedin\.com\/(company|in|school)\//i), twitter: find(/(^|\/\/|\.)(twitter|x)\.com\/(?!share|intent|home)[A-Za-z0-9_]+/i), youtube: find(/youtube\.com\/(@|c\/|channel\/|user\/)/i), title, description, contactPage };
}
const mergeInfo = (a, b) => { for (const k of ["emails", "phones", "whatsapp"]) a[k] = uniq(a[k].concat(b[k] || [])).slice(0, 6); for (const k of ["instagram", "facebook", "linkedin", "twitter", "youtube"]) a[k] = a[k] || b[k] || ""; return a; };

export async function onRequestPost({ request, env }) {
  let body; try { body = await request.json(); } catch (e) { return json({ ok: false, reason: "Send JSON: { urls: [...] }" }, 400); }
  const urls = (Array.isArray(body && body.urls) ? body.urls : []).slice(0, MAX_URLS);
  if (!urls.length) return json({ ok: false, reason: "No websites to read." }, 400);
  const kv = env.CHAT_KV, ip = request.headers.get("cf-connecting-ip") || "anon", hour = Math.floor(Date.now() / 3600000);
  if (kv) { try { const rk = `en:rl:${ip}:${hour}`, n = parseInt((await kv.get(rk)) || "0", 10); if (n >= parseInt(env.ENRICH_PER_HOUR || "150", 10)) return json({ ok: false, reason: "Too many website look-ups this hour — try again later." }, 429); await kv.put(rk, String(n + 1), { expirationTtl: 3700 }); } catch (e) {} }
  const results = {};
  await Promise.all(urls.map(async (raw) => {
    const u = safeUrl(String(raw || "")); if (!u) { results[raw] = { error: "not a public website" }; return; }
    const ck = "en:c1:" + u.hostname + u.pathname;
    if (kv) { try { const hit = await kv.get(ck, "json"); if (hit) { results[raw] = hit; return; } } catch (e) {} }
    try {
      const p = await getPage(u), info = extract(p.html, p.final);
      if (info.contactPage && (!info.emails.length || !info.phones.length)) {
        const cu = safeUrl(info.contactPage);
        if (cu) { try { const p2 = await getPage(cu); mergeInfo(info, extract(p2.html, p2.final)); } catch (e) {} }
      }
      results[raw] = info;
      if (kv) { try { await kv.put(ck, JSON.stringify(info), { expirationTtl: 7 * 86400 }); } catch (e) {} }
    } catch (e) { results[raw] = { error: String(e && e.name === "TimeoutError" ? "timeout" : (e && e.message) || "failed") }; }
  }));
  return json({ ok: true, results });
}
export const onRequestGet = () => json({ ok: true, service: "enrich", method: "POST { urls: [...] }", max: MAX_URLS });
