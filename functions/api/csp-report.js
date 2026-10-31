/* v35 POST /api/csp-report: browsers send what the report-only Content-Security-Policy WOULD have blocked. We keep only a
   grouped count (directive · blocked origin · page path), never the full URL, query string or any visitor data, so the team
   can see what to allow before the policy is enforced. Rate limited; bodies over 8 KB are ignored. */
import { count } from "../_lib/accounts.js";
const clip = (s, n) => String(s == null ? "" : s).slice(0, n);
const origin = (u) => { const s = String(u || ""); if (/^(inline|eval|data|blob|self|wasm-eval|trusted-types-sink)$/.test(s)) return s; try { return new URL(s).origin; } catch (e) { return clip(s.split(/[?#]/)[0], 80); } };
const path = (u) => { try { return new URL(String(u)).pathname.slice(0, 120); } catch (e) { return ""; } };
export async function onRequestPost({ request, env }) {
  const ok = new Response(null, { status: 204 }); const d = env.XRAY_DB; if (!d) return ok;
  const ip = request.headers.get("cf-connecting-ip") || ""; if (await count(env, "csp:" + ip, 60, 3600).catch(() => false)) return ok;
  const raw = (await request.text()).slice(0, 8192); let j; try { j = JSON.parse(raw); } catch (e) { return ok; }
  const list = (Array.isArray(j) ? j.map((x) => x && x.body) : [j && (j["csp-report"] || j.body || j)]).filter(Boolean).slice(0, 10);
  await d.prepare("CREATE TABLE IF NOT EXISTS csp_reports (k TEXT PRIMARY KEY, directive TEXT, blocked TEXT, page TEXT, n INTEGER, first_at TEXT, last_at TEXT)").run();
  const now = new Date().toISOString();
  for (const r of list) {
    const dir = clip(r["effective-directive"] || r.effectiveDirective || r["violated-directive"] || r.violatedDirective || "", 40).split(" ")[0], blk = origin(r["blocked-uri"] || r.blockedURL || r.blockedUri), pg = path(r["document-uri"] || r.documentURL || r.documentUri);
    if (!dir || !/^[a-z-]+$/.test(dir)) continue; const k = dir + "|" + blk + "|" + pg;
    await d.prepare("INSERT INTO csp_reports (k, directive, blocked, page, n, first_at, last_at) VALUES (?1,?2,?3,?4,1,?5,?5) ON CONFLICT(k) DO UPDATE SET n = n + 1, last_at = ?5").bind(k.slice(0, 300), dir, blk, pg, now).run();
  }
  return ok;
}
