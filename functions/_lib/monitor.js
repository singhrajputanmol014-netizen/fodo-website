/* FODO Growth Lab v17: Monitoring / Competitor Change Detector (prompt §35, §52).
   A snapshot of a website's public homepage (+ sitemap size) is stored; the next check compares old vs new and writes an
   event only when something meaningful changed: WHAT CHANGED · WHY IT MATTERS · WHAT YOU SHOULD DO (rules, not AI).
   Runs from: the daily free cron (GitHub Actions → POST /api/monitor/tick with the CRON_KEY secret) and the "Check now" button.
   Kept small for Cloudflare's free plan (~10 ms CPU per request): one website per request, first 250 KB of the page only. */
import { safeFetch, regDomain, UA } from "./xray-core.js";

export const DDL = [
  "CREATE TABLE IF NOT EXISTS mon_targets (id TEXT PRIMARY KEY, user_id TEXT, domain TEXT, url TEXT, kind TEXT, label TEXT, created_at TEXT, last_check TEXT, next_check INTEGER, last_status TEXT, checks INTEGER DEFAULT 0, snap TEXT)",
  "CREATE INDEX IF NOT EXISTS mon_targets_user ON mon_targets(user_id)",
  "CREATE INDEX IF NOT EXISTS mon_targets_due ON mon_targets(next_check)",
  "CREATE TABLE IF NOT EXISTS mon_events (id INTEGER PRIMARY KEY AUTOINCREMENT, target_id TEXT, user_id TEXT, domain TEXT, t TEXT, kind TEXT, severity TEXT, what TEXT, why TEXT, todo TEXT, seen INTEGER DEFAULT 0)",
  "CREATE INDEX IF NOT EXISTS mon_events_user ON mon_events(user_id, t)",
];
const made = new WeakSet();
export async function mdb(env) { const d = env.XRAY_DB; if (!d) return null; if (!made.has(d)) { await d.batch(DDL.map((s) => d.prepare(s))); made.add(d); } return d; }
export const EVERY_MS = { free: 7 * 864e5, paid: 864e5 };

const ent = (s) => String(s || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n));
const txt = (s, n) => ent(String(s || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, n || 200);
const uniq = (a) => a.filter((v, i) => v && a.indexOf(v) === i);
const all = (re, s, f, max) => { const o = []; let m; re.lastIndex = 0; while ((m = re.exec(s)) && o.length < (max || 50)) o.push(f(m)); return o; };
async function sha(s) { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join(""); }
async function readCapped(r, max) { const rd = r.body && r.body.getReader ? r.body.getReader() : null; if (!rd) return (await r.text()).slice(0, max); const parts = []; let n = 0;
  while (n < max) { const { done, value } = await rd.read(); if (done) break; parts.push(value); n += value.length; } try { rd.cancel(); } catch (e) {} const u = new Uint8Array(Math.min(n, max)); let o = 0; for (const p of parts) { const k = Math.min(p.length, u.length - o); u.set(p.subarray(0, k), o); o += k; if (o >= u.length) break; } return new TextDecoder().decode(u); }

/* homepage → snapshot (all OBSERVED from the public page) */
export function parseSnap(html, url) {
  const host = regDomain(new URL(url).hostname), body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<!--[\s\S]*?-->/gi, " ");
  const text = txt(body, 400000);
  const links = all(/<a\b[^>]*href\s*=\s*["']([^"'#]+)[^>]*>([\s\S]*?)<\/a>/gi, body, (m) => [m[1], txt(m[2], 60)], 400).map(([h, t]) => { try { const u = new URL(ent(h), url); return regDomain(u.hostname) === host && /^https?:/.test(u.protocol) ? { path: (u.pathname.replace(/\/+$/, "") || "/").toLowerCase().slice(0, 120), text: t } : null; } catch (e) { return null; } }).filter((x) => x && x.text && x.path !== "/");
  const nav = []; links.forEach((l) => { if (!nav.some((x) => x.path === l.path)) nav.push(l); });
  const prices = uniq(all(/(?:₹|rs\.?|inr|\$|usd|aed|£|€)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|lakh|lac|\/-|per month|\/mo|\/month|\/year))?/gi, text, (m) => m[0].replace(/\s+/g, " ").toLowerCase(), 60)).slice(0, 25);
  const ctas = uniq(all(/<(button)\b[^>]*>([\s\S]*?)<\/button>|<a\b[^>]*>([\s\S]*?)<\/a>/gi, body, (m) => txt(m[2] || m[3], 50), 400).filter((t) => t && t.length <= 40 && /\b(book|call|contact|quote|buy|order|get|start|try|demo|enquir|inquir|whatsapp|register|sign up|subscribe|download|shop|consult|appointment|free)\b/i.test(t))).slice(0, 15);
  const schema = uniq(all(/"@type"\s*:\s*"([A-Za-z]+)"/g, html, (m) => m[1], 60)).slice(0, 15);
  return { title: txt((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(body) || [])[1], 160), meta: ent(((/<meta[^>]+name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']*)["']/i.exec(html) || /<meta[^>]+content\s*=\s*["']([^"']*)["'][^>]*name\s*=\s*["']description["']/i.exec(html)) || [])[1] || "").slice(0, 300),
    h1: uniq(all(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, body, (m) => txt(m[1], 160), 5)), h2: uniq(all(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, body, (m) => txt(m[1], 100), 30)).slice(0, 20),
    nav: nav.slice(0, 80), prices, ctas, schema, noindex: /<meta[^>]+name\s*=\s*["']robots["'][^>]*content\s*=\s*["'][^"']*noindex/i.test(html), words: text ? text.split(" ").length : 0, textSample: text.slice(0, 50000) };
}
export async function snapshot(env, url) {
  const t0 = Date.now(), H = { "user-agent": UA, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "accept-language": "en-IN,en;q=0.9" };
  let r, finalUrl;
  try { ({ r, finalUrl } = await safeFetch(url, { headers: H }, { timeout: 15000, env })); } catch (e) { return { ok: false, status: 0, error: e.code === "blocked" ? "blocked" : e.name === "TimeoutError" ? "timeout" : "unreachable", t: new Date().toISOString() }; }
  const ct = r.headers.get("content-type") || "";
  if (r.status >= 400 || !/html|xml|text/i.test(ct)) { try { r.body && r.body.cancel(); } catch (e) {} return { ok: false, status: r.status, error: "HTTP " + r.status, t: new Date().toISOString() }; }
  const html = await readCapped(r, 250000), s = parseSnap(html, finalUrl);
  s.hash = await sha(s.textSample); delete s.textSample;
  s.ok = true; s.status = r.status; s.finalUrl = finalUrl; s.https = /^https:/.test(finalUrl); s.t = new Date().toISOString();
  try { const sm = await safeFetch(new URL("/sitemap.xml", finalUrl).toString(), { headers: H }, { timeout: 10000, env }); if (sm.r.ok) { const x = await readCapped(sm.r, 1500000); const n = (x.match(/<loc>/gi) || []).length; s.sitemap = /<sitemapindex/i.test(x) ? { index: true, files: n } : { urls: n }; } else { try { sm.r.body && sm.r.body.cancel(); } catch (e) {} s.sitemap = null; } } catch (e) { s.sitemap = null; }
  s.ms = Date.now() - t0;
  return s;
}

/* old vs new → events. own = the user's own site (more alarms), else a competitor (opportunities) */
export function diff(a, b, own, label) {
  const ev = [], who = own ? "Your site" : label, add = (kind, severity, what, why, todo) => ev.push({ kind, severity, what, why, todo });
  if (!b.ok) { if (!a || a.ok) add("down", own ? "high" : "medium", who + " did not load (" + (b.error || "error") + ").", own ? "Visitors, Google and ads land on an error page while it is down." : "If it stays down, their buyers look elsewhere, including at you.", own ? "Check hosting/DNS now and fix the error; re-check here when it is back." : "Make sure your own ads and listings are live and visible this week."); return ev; }
  if (!a || !a.ok) { if (a && !a.ok) add("up", "low", who + " is reachable again.", "", ""); return ev; }
  if (b.noindex && !a.noindex) add("noindex", own ? "high" : "medium", who + "'s homepage now tells Google not to index it (noindex).", own ? "Google will drop the homepage from search results." : "They will fade from Google if it stays, a window to win their searches.", own ? "Remove the noindex robots tag immediately and request indexing in Search Console." : "Push your pages for the searches they ranked for.");
  if (a.https && !b.https) add("https", own ? "high" : "low", who + " is no longer served over HTTPS.", "Browsers warn visitors about insecure sites.", own ? "Restore the SSL certificate and the http → https redirect." : "");
  if (a.title !== b.title && b.title) add("title", "medium", who + " changed the homepage title: “" + a.title + "” → “" + b.title + "”.", own ? "The title is what Google shows, rankings and clicks can move." : "A new title usually means new target searches or a new message.", own ? "Make sure the main search phrase and your brand are still in it." : "Check which searches the new title targets and whether you have a page for them.");
  const h1a = (a.h1 || []).join(" | "), h1b = (b.h1 || []).join(" | ");
  if (h1a !== h1b && h1b) add("headline", own ? "low" : "high", who + " has a new headline: “" + h1b + "”" + (h1a ? " (was “" + h1a + "”)." : "."), own ? "" : "A new headline is a new positioning, what they want buyers to believe now.", own ? "" : "Compare it with your hero: is your claim still different and stronger?");
  const pa = a.prices || [], pb = b.prices || [], pAdd = pb.filter((x) => pa.indexOf(x) < 0), pDel = pa.filter((x) => pb.indexOf(x) < 0);
  if (pAdd.length || pDel.length) add("pricing", own ? "low" : "high", who + " pricing changed on the homepage" + (pAdd.length ? ", new: " + pAdd.slice(0, 5).join(", ") : "") + (pDel.length ? ", removed: " + pDel.slice(0, 5).join(", ") : "") + ".", own ? "" : "Price moves change what buyers compare you on.", own ? "" : "Review your prices/packages against theirs; if you are cheaper or better value, say so clearly.");
  const na = (a.nav || []).map((x) => x.path), nb = (b.nav || []).map((x) => x.path), nAdd = (b.nav || []).filter((x) => na.indexOf(x.path) < 0), nDel = (a.nav || []).filter((x) => nb.indexOf(x.path) < 0);
  if (nAdd.length) add("new_pages", own ? "low" : "medium", who + " links to " + nAdd.length + " new page(s): " + nAdd.slice(0, 6).map((x) => "“" + x.text + "” (" + x.path + ")").join(", ") + ".", own ? "" : "New menu/homepage links usually mean a new service, offer or campaign.", own ? "" : "Open them: if it is a service you also offer, make sure you have a page that answers it better.");
  if (nDel.length >= 3) add("removed_pages", "low", who + " removed " + nDel.length + " link(s) from the homepage: " + nDel.slice(0, 5).map((x) => "“" + x.text + "”").join(", ") + ".", own ? "Removed links can orphan pages Google used to find." : "They may have dropped a service or restructured the site.", own ? "Check those pages are still linked from somewhere (menu, footer or related pages)." : "If they dropped a service you offer, that is demand you can pick up.");
  const ca = a.ctas || [], cb = b.ctas || [], cAdd = cb.filter((x) => ca.indexOf(x) < 0);
  if (cAdd.length && !own) add("cta", "medium", label + " added new calls to action: " + cAdd.slice(0, 4).map((x) => "“" + x + "”").join(", ") + ".", "A new CTA often means a new offer (free trial, consultation, discount).", "Decide whether to match or beat that offer, and make your own first step just as easy.");
  const sa = a.schema || [], sAdd = (b.schema || []).filter((x) => sa.indexOf(x) < 0);
  if (sAdd.length && !own) add("schema", "low", label + " added structured data: " + sAdd.join(", ") + ".", "Schema helps them win rich results (stars, FAQs, prices) in Google.", "Add the same types to your pages where they are true (your X-Ray has ready-to-paste code on Pro).");
  const ua = a.sitemap && a.sitemap.urls, ub = b.sitemap && b.sitemap.urls;
  if (ua != null && ub != null && ub - ua >= Math.max(5, Math.round(ua * 0.1))) add("content_up", own ? "low" : "high", who + "'s sitemap grew from " + ua + " to " + ub + " pages (+" + (ub - ua) + ").", own ? "" : "Publishing many new pages is how sites win more searches.", own ? "" : "See what kind of pages were added (blog, locations, services) and plan your own answer.");
  if (ua != null && ub != null && ua - ub >= Math.max(5, Math.round(ua * 0.2))) add("content_down", own ? "high" : "low", who + "'s sitemap shrank from " + ua + " to " + ub + " pages.", own ? "Pages missing from the sitemap may drop out of Google." : "They removed or merged content.", own ? "Check the missing pages are intentional; fix the sitemap if not." : "");
  const wa = a.words || 0, wb = b.words || 0, h2a = a.h2 || [], h2b = b.h2 || [], keep = h2b.filter((x) => h2a.indexOf(x) > -1).length;
  if (wa > 150 && wb > 150 && (Math.abs(wb - wa) / wa > 0.4 || (h2a.length >= 4 && keep / h2a.length < 0.4))) add("redesign", own ? "medium" : "high", who + "'s homepage content changed a lot (" + wa + " → " + wb + " words, " + keep + " of " + h2a.length + " section headings kept).", own ? "Big content changes can move rankings for weeks." : "This looks like a redesign or a new message.", own ? "Keep the old URLs, titles and key phrases where they still fit." : "Read the new page side by side with yours; note any claim, proof or offer you don't match.");
  else if (a.hash !== b.hash && ev.length === 0 && Math.abs(wb - wa) > 40) add("content", "low", who + " updated homepage text (" + wa + " → " + wb + " words).", "", "");
  return ev;
}

/* one check of one target: snapshot → compare with the last good snapshot → events → store. Returns the new events. */
export async function runCheck(env, d, t, paid, sendMail) {
  const s = await snapshot(env, t.url), old = t.snap ? JSON.parse(t.snap) : null, own = t.kind === "own", label = t.label || t.domain;
  let events = [];
  if (!s.ok) { if (t.last_status !== "down") events = diff(old, s, own, label); }
  else {
    if (t.last_status === "down") events.push({ kind: "up", severity: "low", what: (own ? "Your site" : label) + " is reachable again.", why: "", todo: "" });
    if (!old) events.push({ kind: "baseline", severity: "low", what: "Monitoring started for " + label + ": saved the homepage title, " + (s.h1.length ? "headline, " : "") + s.nav.length + " linked pages, " + s.prices.length + " price(s)" + (s.sitemap && s.sitemap.urls != null ? ", " + s.sitemap.urls + " sitemap pages" : "") + ".", why: "Every later check is compared with this snapshot.", todo: "" });
    else events = events.concat(diff(old, s, own, label));
  }
  const now = new Date().toISOString(), next = Date.now() + (paid ? EVERY_MS.paid : EVERY_MS.free);
  const st = [d.prepare("UPDATE mon_targets SET last_check=?2, next_check=?3, last_status=?4, checks=checks+1" + (s.ok ? ", snap=?5" : "") + " WHERE id=?1").bind(...[t.id, now, next, s.ok ? "ok" : "down"].concat(s.ok ? [JSON.stringify(s)] : []))];
  events.forEach((e) => st.push(d.prepare("INSERT INTO mon_events (target_id, user_id, domain, t, kind, severity, what, why, todo) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)").bind(t.id, t.user_id, t.domain, now, e.kind, e.severity, e.what.slice(0, 600), (e.why || "").slice(0, 400), (e.todo || "").slice(0, 400))));
  await d.batch(st);
  const loud = events.filter((e) => e.severity === "high" || e.severity === "medium");
  if (loud.length && sendMail && env.RESEND_API_KEY) {
    try { const u = await d.prepare("SELECT email FROM acct_users WHERE id=?1").bind(t.user_id).first(); const key = "mon-mail:" + t.user_id + ":" + now.slice(0, 10);
      const sent = await d.prepare("SELECT n FROM acct_counters WHERE k=?1").bind(key).first();
      if (u && u.email && !(sent && sent.n >= 3)) { await d.prepare("INSERT INTO acct_counters (k, n, exp) VALUES (?1, 1, ?2) ON CONFLICT(k) DO UPDATE SET n = n + 1").bind(key, Date.now() + 2 * 864e5).run();
        const esc = (x) => String(x || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
        await sendMail(env, u.email, "FODO Monitoring: " + loud.length + " change(s) on " + label, "<p>FODO noticed these changes on <b>" + esc(label) + "</b>:</p><ul>" + loud.map((e) => "<li><b>" + esc(e.what) + "</b><br>Why it matters: " + esc(e.why) + "<br>What to do: " + esc(e.todo) + "</li>").join("") + '</ul><p><a href="https://www.fodo.co.in/account/#monitoring">Open your monitoring</a></p>', loud.map((e) => "- " + e.what + "\n  Why: " + e.why + "\n  Do: " + e.todo).join("\n")); } } catch (e) {}
  }
  return { ok: s.ok, status: s.status, events };
}
