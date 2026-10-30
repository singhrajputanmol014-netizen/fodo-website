/* FODO first-party website analytics (v16) — no cookies, nothing stored in the visitor's browser.
   A visitor is counted once per day by a hash of (secret salt + day + IP + browser), the same idea as Plausible / Fathom, so no
   consent banner is needed for it and the IP itself is never stored. Daily totals live in D1 (web_daily), so the admin dashboard
   reads a few hundred rows, not every hit. Needs only the XRAY_DB binding (works with accounts on or off). */

const DDL = [
  "CREATE TABLE IF NOT EXISTS web_daily (day TEXT, dim TEXT, k TEXT, n INTEGER, PRIMARY KEY (day, dim, k))",
  "CREATE TABLE IF NOT EXISTS web_vis (day TEXT, vk TEXT, src TEXT, ch TEXT, hits INTEGER DEFAULT 0, PRIMARY KEY (day, vk))",
  "CREATE TABLE IF NOT EXISTS web_live (ts INTEGER, vk TEXT, path TEXT, src TEXT, country TEXT, device TEXT)",
  "CREATE INDEX IF NOT EXISTS web_live_ts ON web_live(ts)",
];
const readyT = new WeakSet();   // per-instance flag, never a promise shared across requests (see accounts.js db())
export async function tdb(env) { const d = env.XRAY_DB; if (!d) return null; if (!readyT.has(d)) { await d.batch(DDL.map((s) => d.prepare(s))); readyT.add(d); } return d; }
export const istDay = (t) => new Date((t || Date.now()) + 5.5 * 3600e3).toISOString().slice(0, 10);

const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const SEARCH = [[/(^|\.)google\./, "Google"], [/(^|\.)bing\.com$/, "Bing"], [/duckduckgo\.com$/, "DuckDuckGo"], [/(^|\.)yahoo\./, "Yahoo"], [/yandex\./, "Yandex"], [/ecosia\.org$/, "Ecosia"], [/baidu\.com$/, "Baidu"]];
const SOCIAL = [[/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, "Facebook"], [/instagram\.com$/, "Instagram"], [/(linkedin\.com|lnkd\.in)$/, "LinkedIn"], [/(^|\.)(t\.co|twitter\.com|x\.com)$/, "X (Twitter)"], [/(youtube\.com|youtu\.be)$/, "YouTube"], [/(whatsapp\.com|wa\.me)$/, "WhatsApp"], [/pinterest\./, "Pinterest"], [/reddit\.com$/, "Reddit"], [/quora\.com$/, "Quora"], [/(t\.me|telegram\.org)$/, "Telegram"], [/threads\.net$/, "Threads"]];
const AI = [[/(chatgpt\.com|chat\.openai\.com)$/, "ChatGPT"], [/perplexity\.ai$/, "Perplexity"], [/gemini\.google\.com$/, "Gemini"], [/claude\.ai$/, "Claude"], [/copilot\.microsoft\.com$/, "Copilot"], [/(you\.com|phind\.com|meta\.ai)$/, "Other AI"]];
const pick = (list, h) => { for (const [re, n] of list) if (re.test(h)) return n; return ""; };
/* where a visit came from: UTM tags win, then the referrer */
export function sourceOf(refHost, q, siteHost) {
  const us = (q.get("utm_source") || "").toLowerCase().slice(0, 40), um = (q.get("utm_medium") || "").toLowerCase().slice(0, 30);
  if (q.get("gclid")) return { src: "Google Ads", ch: "Paid ads" };
  if (q.get("fbclid") && !us) return { src: "Facebook", ch: "Social" };
  if (us) { const nm = pick(SOCIAL, us + ".com") || pick(SEARCH, us + ".com") || us.replace(/[^a-z0-9 ._-]/g, "");
    return { src: nm, ch: /cpc|ppc|paid|ads?$/.test(um) ? "Paid ads" : /email|newsletter/.test(um) ? "Email" : pick(SOCIAL, us + ".com") || /social|insta|ig|fb|wa/.test(us + um) ? "Social" : "Campaign" }; }
  if (!refHost) return { src: "Direct", ch: "Direct" };
  if (refHost === siteHost || refHost.replace(/^www\./, "") === siteHost.replace(/^www\./, "")) return null;   // a click inside the site
  let n;
  if ((n = pick(AI, refHost))) return { src: n, ch: "AI assistants" };
  if ((n = pick(SEARCH, refHost))) return { src: n, ch: "Search" };
  if ((n = pick(SOCIAL, refHost))) return { src: n, ch: "Social" };
  return { src: refHost.replace(/^www\./, "").slice(0, 60), ch: "Referral" };
}
export function deviceOf(ua, w) {
  const tab = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua), mob = !tab && /Mobi|iPhone|Android/i.test(ua);
  const device = tab || (w >= 600 && w < 1024 && /Android|iPad/.test(ua)) ? "Tablet" : mob || (w && w < 600) ? "Mobile" : "Desktop";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /UCBrowser/.test(ua) ? "UC Browser" : /FBAN|FBAV|Instagram/.test(ua) ? "Facebook/Instagram app" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Other";
  const os = /Windows/.test(ua) ? "Windows" : /iPhone|iPad|iOS/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Other";
  return { device, browser, os };
}
export const EV = ["whatsapp_click", "phone_click", "email_click", "booking_click", "audit_cta_click", "cta_click", "outbound_click", "form_submit", "tool_use", "generate_lead", "xray_start", "xray_complete", "xray_export", "cf_search", "cf_export", "bot_answer", "scroll_depth", "search_open", "login_open", "tool_start", "tool_complete", "tool_login_required", "upgrade_click", "service_cta_click", "report_view", "budget_plan"];
export const CONV = ["whatsapp_click", "phone_click", "email_click", "booking_click", "audit_cta_click", "form_submit", "generate_lead", "xray_start", "service_cta_click"];
const cleanPath = (p) => { p = String(p || "/").split(/[?#]/)[0].slice(0, 120).replace(/[^\w\-\/.~%]/g, ""); return p.charAt(0) === "/" ? p : "/" + p; };
const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f<>"]/g, " ").trim().slice(0, n);
const BOT = /bot|crawl|spider|slurp|bingpreview|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|curl|wget|python|axios|node-fetch|go-http/i;

export async function collect(request, env) {
  const d = await tdb(env); if (!d) return new Response(null, { status: 204 });
  const ua = request.headers.get("user-agent") || "", test = env.XRAY_TEST_MODE === "1";
  if (!ua || (BOT.test(ua) && !test)) return new Response(null, { status: 204 });
  let b = null; try { b = JSON.parse((await request.text()).slice(0, 8000)); } catch (e) {}
  if (!b || typeof b !== "object") return new Response(null, { status: 204 });
  const now = Date.now(), day = istDay(now), site = new URL(request.url).hostname, cf = request.cf || {};
  const ip = request.headers.get("cf-connecting-ip") || "0";
  const vk = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode((env.TRAFFIC_SALT || "fodo-web") + "|" + day + "|" + ip + "|" + ua))).slice(0, 20);
  const path = cleanPath(b.p), up = [], add = (dim, k, n) => { if (k !== "" && k != null) up.push(d.prepare("INSERT INTO web_daily (day, dim, k, n) VALUES (?1,?2,?3,?4) ON CONFLICT(day, dim, k) DO UPDATE SET n = n + excluded.n").bind(day, dim, String(k).slice(0, 120), n || 1)); };
  // one visitor row per day; also caps a single visitor at 600 hits a day
  await d.prepare("INSERT OR IGNORE INTO web_vis (day, vk, src, ch, hits) VALUES (?1,?2,'','',0)").bind(day, vk).run();
  const v = await d.prepare("UPDATE web_vis SET hits = hits + 1 WHERE day=?1 AND vk=?2 RETURNING hits, src, ch").bind(day, vk).first();
  if (!v || v.hits > 600) return new Response(null, { status: 204 });
  if (b.t === "pv") {
    let refHost = ""; try { refHost = b.r ? new URL(String(b.r)).hostname.toLowerCase() : ""; } catch (e) {}
    const q = new URLSearchParams(String(b.q || "").slice(0, 400)), s = sourceOf(refHost, q, site), dv = deviceOf(ua, +b.w || 0);
    const country = String(cf.country || "XX").slice(0, 2), city = cf.city ? clip(cf.city, 40) + ", " + country : "";
    add("pv", "all"); add("page", path);
    if (s) {   // a new visit (came from outside the site)
      add("ses", "all"); add("entry", path); add("src", s.src); add("ch", s.ch); if (refHost) add("ref", refHost.replace(/^www\./, ""));
      const camp = clip(q.get("utm_campaign"), 60); if (camp) add("camp", camp + " · " + (q.get("utm_source") || "").slice(0, 30));
      if (!v.src) await d.prepare("UPDATE web_vis SET src=?3, ch=?4 WHERE day=?1 AND vk=?2").bind(day, vk, s.src, s.ch).run();
    }
    if (v.hits === 1) {   // first hit of this visitor today
      add("uv", "all"); add("country", country); if (city) add("city", city); add("device", dv.device); add("browser", dv.browser); add("os", dv.os);
      add("lang", clip(String(b.l || "").split("-")[0], 5).toLowerCase() || "?"); add("uv_ch", (s || { ch: v.ch || "Direct" }).ch); add("uv_src", (s || { src: v.src || "Direct" }).src);
      if (b.ret === 1) add("ret", "returning"); else if (b.ret === 0) add("ret", "new");
    }
    up.push(d.prepare("INSERT INTO web_live (ts, vk, path, src, country, device) VALUES (?1,?2,?3,?4,?5,?6)").bind(now, vk, path, (s && s.src) || v.src || "Direct", country, dv.device));
  } else if (b.t === "ev") {
    const src = v.src || "Direct", ch = v.ch || "Direct";
    (Array.isArray(b.e) ? b.e : []).slice(0, 20).forEach((e) => { const n = String((e && e[0]) || ""); if (EV.indexOf(n) < 0) return;
      if (n === "scroll_depth" && String(e[1]) !== "75") return;
      const det = clip(e[1], 60);
      add("ev", n); add("evp", n + "|" + path);
      if (det && /^(cta_click|tool_use|outbound_click|cf_export|xray_export|tool_start|tool_complete|tool_login_required|upgrade_click|service_cta_click)$/.test(n)) add("evd", n + "|" + det);
      if (CONV.indexOf(n) > -1) { add("conv", "all"); add("conv_src", src); add("conv_ch", ch); add("conv_page", path); add("conv_kind", n); }
    });
  } else if (b.t === "time") {
    const sec = Math.max(0, Math.min(1800, Math.round(+b.s || 0))); if (sec >= 1) { add("tsum", path, sec); add("tcnt", path, 1); add("tsum", "all", sec); add("tcnt", "all", 1); }
  }
  if (up.length) await d.batch(up);
  if (Math.random() < 0.03) { await d.prepare("DELETE FROM web_live WHERE ts < ?1").bind(now - 3 * 3600e3).run(); await d.prepare("DELETE FROM web_vis WHERE day < ?1").bind(istDay(now - 3 * 864e5)).run(); await d.prepare("DELETE FROM web_daily WHERE day < ?1").bind(istDay(now - 400 * 864e5)).run(); }
  return new Response(null, { status: 204 });
}

/* admin: totals for a period (+ the period before, for trends), daily series and who is on the site right now */
export async function report(env, days) {
  const d = await tdb(env); days = Math.min(365, Math.max(1, days || 30));
  const from = istDay(Date.now() - (days - 1) * 864e5), prevFrom = istDay(Date.now() - (2 * days - 1) * 864e5), now = Date.now();
  const [rows, prev, series, live, livePages, liveSrc] = await Promise.all([
    d.prepare("SELECT dim, k, sum(n) n FROM web_daily WHERE day >= ?1 GROUP BY dim, k").bind(from).all(),
    d.prepare("SELECT dim, sum(n) n FROM web_daily WHERE day >= ?1 AND day < ?2 AND k = 'all' GROUP BY dim").bind(prevFrom, from).all(),
    d.prepare("SELECT day, dim, n FROM web_daily WHERE day >= ?1 AND k = 'all' AND dim IN ('pv','uv','ses','conv')").bind(from).all(),
    d.prepare("SELECT count(DISTINCT vk) n FROM web_live WHERE ts > ?1").bind(now - 5 * 60e3).first(),
    d.prepare("SELECT path, count(DISTINCT vk) n FROM web_live WHERE ts > ?1 GROUP BY path ORDER BY n DESC LIMIT 8").bind(now - 5 * 60e3).all(),
    d.prepare("SELECT src, country, device, count(DISTINCT vk) n FROM web_live WHERE ts > ?1 GROUP BY src, country, device ORDER BY n DESC LIMIT 8").bind(now - 30 * 60e3).all(),
  ]);
  const dims = {}; (rows.results || []).forEach((r) => { (dims[r.dim] = dims[r.dim] || []).push({ k: r.k, n: r.n }); });
  Object.keys(dims).forEach((k) => dims[k].sort((a, b) => b.n - a.n));
  const dayList = []; for (let i = days - 1; i >= 0; i--) dayList.push(istDay(now - i * 864e5));
  const ser = { pv: {}, uv: {}, ses: {}, conv: {} }; (series.results || []).forEach((r) => { if (ser[r.dim]) ser[r.dim][r.day] = r.n; });
  const P = {}; (prev.results || []).forEach((r) => { P[r.dim] = r.n; });
  return { days: dayList, dims, prev: P, series: Object.fromEntries(Object.keys(ser).map((k) => [k, dayList.map((x) => ser[k][x] || 0)])), live: { now: (live && live.n) || 0, pages: livePages.results || [], visitors: liveSrc.results || [] } };
}
