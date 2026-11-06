/* FODO v47.6 calendar sync: a private iCalendar feed (subscribe in Google Calendar, Apple Calendar or Outlook) per person.
   - The feed URL carries a long random token; no session, so it can be subscribed to. Regenerating the token kills the old URL.
   - A FODO Pro's feed: booked days (project title only, no client price), accepted team dates (+ reminder), blackout days.
   - A client's feed: project days, team dates, milestone due dates, quote expiry dates.
   - Staff feed: every team that is locked or active, and open invitations' deadlines.
   Nothing is written to anyone's calendar; this is read-only from the calendar app's side. */
import { nowIso, randId } from "./accounts.js";
import { bdb, can, err, auditLog } from "./biz.js";
import { qdb } from "./quotes.js";

const all = async (d, sql, ...a) => (await d.prepare(sql).bind(...a).all()).results || [];
const one = (d, sql, ...a) => d.prepare(sql).bind(...a).first();
const run = (d, sql, ...a) => d.prepare(sql).bind(...a).run();
const DDL = "CREATE TABLE IF NOT EXISTS biz_cal_tokens (token TEXT PRIMARY KEY, user_id TEXT, kind TEXT, created_at TEXT, used_at TEXT, revoked INTEGER DEFAULT 0)";
import * as SCH from "./schema.js";
export async function cdb(env) { const d = await bdb(env); await qdb(env); await SCH.setup(d, "calendar", () => d.prepare(DDL).run()); return d; }
const KINDS = ["pro", "client", "staff"];

export async function feedFor(env, u, R, kind, origin, regenerate) {
  if (KINDS.indexOf(kind) < 0) throw err("Unknown calendar.");
  if (kind === "pro" && !R.pro) throw err("Create your FODO Pro profile first.", 404);
  if (kind === "staff" && !can(R, ["admin", "moderator", "finance", "viewer"])) throw err("Not allowed.", 403);
  const d = await cdb(env); let t = await one(d, "SELECT * FROM biz_cal_tokens WHERE user_id=?1 AND kind=?2 AND revoked=0", u.id, kind);
  if (t && regenerate) { await run(d, "UPDATE biz_cal_tokens SET revoked=1 WHERE token=?1", t.token); await auditLog(env, u.email, "calendar:regenerate", kind); t = null; }
  if (!t) { const token = randId(40); await run(d, "INSERT INTO biz_cal_tokens (token, user_id, kind, created_at) VALUES (?1,?2,?3,?4)", token, u.id, kind, nowIso()); t = { token, created_at: nowIso(), used_at: null }; }
  return { kind, url: (origin || "https://www.fodo.co.in") + "/api/biz/calendar/" + t.token + ".ics", createdAt: t.created_at, lastUsed: t.used_at, webcal: (origin || "https://www.fodo.co.in").replace(/^https?/, "webcal") + "/api/biz/calendar/" + t.token + ".ics" };
}
export async function revoke(env, u, kind) { const d = await cdb(env); await run(d, "UPDATE biz_cal_tokens SET revoked=1 WHERE user_id=?1 AND kind=?2", u.id, kind); await auditLog(env, u.email, "calendar:revoke", kind); return { ok: true }; }

/* ---------- the feed ---------- */
const esc = (s) => String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fold = (line) => { const out = []; let s = line; while (s.length > 72) { out.push(s.slice(0, 72)); s = " " + s.slice(72); } out.push(s); return out.join("\r\n"); };
const ymd = (s) => String(s).replace(/-/g, "").slice(0, 8), next = (day, n) => { const t = new Date(day + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + (n || 1)); return t.toISOString().slice(0, 10); };
const stamp = () => nowIso().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
function vevent(e) {
  const L = ["BEGIN:VEVENT", "UID:" + e.uid + "@fodo.co.in", "DTSTAMP:" + stamp(), "SUMMARY:" + esc(e.title)];
  if (e.time) { const [a, b] = e.time.split("-"); L.push("DTSTART;TZID=Asia/Kolkata:" + ymd(e.day) + "T" + a.replace(":", "") + "00", "DTEND;TZID=Asia/Kolkata:" + ymd(e.day) + "T" + b.replace(":", "") + "00"); }
  else L.push("DTSTART;VALUE=DATE:" + ymd(e.day), "DTEND;VALUE=DATE:" + ymd(next(e.day, e.days || 1)));
  if (e.descr) L.push("DESCRIPTION:" + esc(e.descr)); if (e.loc) L.push("LOCATION:" + esc(e.loc)); if (e.url) L.push("URL:" + e.url);
  if (e.status) L.push("STATUS:" + e.status); if (e.alarm) L.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + esc(e.title), "TRIGGER:-PT" + e.alarm + "H", "END:VALARM");
  L.push("END:VEVENT"); return L.map(fold).join("\r\n");
}
const TZ = "BEGIN:VTIMEZONE\r\nTZID:Asia/Kolkata\r\nBEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nTZOFFSETFROM:+0530\r\nTZOFFSETTO:+0530\r\nTZNAME:IST\r\nEND:STANDARD\r\nEND:VTIMEZONE";
export function ics(name, events) { return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FODO//Workspace//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:" + esc(name), "X-WR-TIMEZONE:Asia/Kolkata", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", TZ].map(fold).concat(events.map(vevent)).concat(["END:VCALENDAR"]).join("\r\n") + "\r\n"; }

export async function events(env, d, t, origin) {
  const from = next(nowIso().slice(0, 10), -60), E = [], W = origin || "https://www.fodo.co.in";
  if (t.kind === "pro") {
    const p = await one(d, "SELECT id, blackout FROM biz_pros WHERE user_id=?1", t.user_id); if (!p) return E;
    for (const b of await all(d, "SELECT b.day, b.slot, j.title, j.id pid FROM biz_bookings b LEFT JOIN biz_projects j ON j.id=b.project_id WHERE b.pro_id=?1 AND b.day >= ?2 AND j.id IS NOT NULL ORDER BY b.day LIMIT 500", p.id, from)) E.push({ uid: "bk-" + b.pid + "-" + b.day + "-" + (b.slot || "day"), day: b.day, time: b.slot || null, title: "FODO: " + (b.title || "Booked"), url: W + "/fodo-pros/#project=" + b.pid, alarm: 20 });
    for (const m of await all(d, "SELECT t.id, t.title, t.start_day, t.days, t.city, t.mode, t.status, m.role_name FROM biz_team_members m JOIN biz_teams t ON t.id=m.team_id WHERE m.pro_id=?1 AND m.status='accepted' AND t.start_day >= ?2 AND t.status NOT IN ('cancelled') ORDER BY t.start_day LIMIT 200", p.id, from)) E.push({ uid: "tm-" + m.id, day: m.start_day, days: m.days || 1, title: "FODO team: " + m.title + " (" + m.role_name + ")", descr: "Role: " + m.role_name + ". Team status: " + m.status.replace(/_/g, " ") + ". Details in FODO Pros → Team invitations.", loc: m.city || "", url: W + "/fodo-pros/#pro-teams", alarm: 24, status: m.status === "locked" || m.status === "active" ? "CONFIRMED" : "TENTATIVE" });
    let bl = []; try { bl = JSON.parse(p.blackout || "[]"); } catch (e) {} bl.filter((x) => x >= from).forEach((x) => E.push({ uid: "bl-" + p.id + "-" + x, day: x, title: "Not available (FODO blackout)", status: "CONFIRMED" }));
  } else if (t.kind === "client") {
    for (const j of await all(d, "SELECT id, title, day, slot, status FROM biz_projects WHERE client_id=?1 AND day >= ?2 AND status NOT IN ('cancelled') LIMIT 300", t.user_id, from)) E.push({ uid: "pj-" + j.id, day: j.day, time: j.slot || null, title: "FODO project: " + j.title, url: W + "/workspace/#project=" + j.id, alarm: 20 });
    for (const m of await all(d, "SELECT m.id, m.title, m.due, m.amount, j.title ptitle, j.id pid FROM biz_milestones m JOIN biz_projects j ON j.id=m.project_id WHERE j.client_id=?1 AND m.due >= ?2 AND m.status NOT IN ('approved','refunded') LIMIT 300", t.user_id, from)) E.push({ uid: "ms-" + m.id, day: m.due, title: "Due: " + m.title + " · " + m.ptitle, descr: "Milestone of " + m.ptitle + ".", url: W + "/workspace/#project=" + m.pid });
    for (const tm of await all(d, "SELECT id, title, start_day, days, city, status FROM biz_teams WHERE client_id=?1 AND start_day >= ?2 AND status NOT IN ('cancelled') LIMIT 200", t.user_id, from)) E.push({ uid: "tm-" + tm.id, day: tm.start_day, days: tm.days || 1, title: "FODO shoot: " + tm.title, loc: tm.city || "", descr: "Team status: " + tm.status.replace(/_/g, " ") + ".", url: W + "/workspace/#quotes", alarm: 24, status: tm.status === "locked" || tm.status === "active" ? "CONFIRMED" : "TENTATIVE" });
    for (const q of await all(d, "SELECT id, number, title, expires_at FROM biz_quotes WHERE client_id=?1 AND status IN ('sent','viewed','revised') AND expires_at IS NOT NULL AND expires_at >= ?2 LIMIT 100", t.user_id, from)) E.push({ uid: "qt-" + q.id, day: q.expires_at.slice(0, 10), title: "FODO quote " + q.number + " expires: " + q.title, url: W + "/workspace/#quote=" + q.id, alarm: 24 });
  } else {
    for (const tm of await all(d, "SELECT t.id, t.title, t.start_day, t.days, t.city, t.status, u.email client, (SELECT count(*) FROM biz_team_members m WHERE m.team_id=t.id AND m.status='accepted') c, (SELECT count(*) FROM biz_team_members m WHERE m.team_id=t.id AND m.status IN ('open','invited','accepted','conflict')) s FROM biz_teams t LEFT JOIN acct_users u ON u.id=t.client_id WHERE t.start_day >= ?1 AND t.status NOT IN ('cancelled','completed') ORDER BY t.start_day LIMIT 300", from)) E.push({ uid: "tm-" + tm.id, day: tm.start_day, days: tm.days || 1, title: "Team: " + tm.title + " (" + tm.c + "/" + tm.s + ")", loc: tm.city || "", descr: (tm.client || "") + " · " + tm.status.replace(/_/g, " "), url: W + "/workspace/#admin?tab=teams&id=" + tm.id, status: tm.status === "locked" || tm.status === "active" ? "CONFIRMED" : "TENTATIVE", alarm: 48 });
    for (const m of await all(d, "SELECT m.id, m.role_name, m.expires_at, t.title FROM biz_team_members m JOIN biz_teams t ON t.id=m.team_id WHERE m.status='invited' AND m.expires_at >= ?1 LIMIT 200", nowIso())) E.push({ uid: "inv-" + m.id, day: m.expires_at.slice(0, 10), title: "Invitation deadline: " + m.role_name + " · " + m.title, url: W + "/workspace/#admin?tab=teams" });
  }
  return E;
}
export async function serve(env, tokenWithExt, origin) {
  const token = String(tokenWithExt || "").replace(/\.ics$/, ""); if (!/^[a-z0-9]{40}$/.test(token)) return null;
  const d = await cdb(env), t = await one(d, "SELECT * FROM biz_cal_tokens WHERE token=?1 AND revoked=0", token); if (!t) return null;
  await run(d, "UPDATE biz_cal_tokens SET used_at=?2 WHERE token=?1", token, nowIso());
  const name = { pro: "FODO Pros", client: "FODO projects", staff: "FODO teams" }[t.kind];
  return ics(name, await events(env, d, t, origin));
}
