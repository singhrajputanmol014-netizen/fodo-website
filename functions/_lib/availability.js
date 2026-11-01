/* FODO v47.2 availability engine: one place that decides whether a FODO Pro can take given days, and the database-level
   booking of those days. Used by matching (production.js), team invitations and acceptance (teams.js).
   A Pro's rules: timezone, working days (+ extra working days = date overrides), working hours (shown for online work),
   blocked dates, minimum notice, how far ahead they take bookings (horizon), most bookings per week, and a travel buffer
   (free days needed before / after an out-of-town booking).
   Double booking is prevented by the database: one whole-day row per Pro and day in biz_bookings (UNIQUE pro_id, day, slot),
   re-checked after insert against time-slot bookings (the same pattern as v44 projects), all-or-nothing for multi-day work. */
import { nowIso, randId } from "./accounts.js";
import { err } from "./biz.js";

const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
const one = (d, sql, ...a) => d.prepare(sql).bind(...a).first();
const all = async (d, sql, ...a) => (await d.prepare(sql).bind(...a).all()).results || [];
const run = (d, sql, ...a) => d.prepare(sql).bind(...a).run();
export const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export const addDays = (day, n) => new Date(Date.parse(day + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export const dayList = (start, n) => { const out = []; for (let i = 0; i < Math.max(1, Math.min(60, n || 1)); i++) out.push(addDays(start, i)); return out; };
/* today in the Pro's timezone (minimum notice is counted from their local date) */
export function todayIn(tz) { try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); } catch (e) { return nowIso().slice(0, 10); } }
const isoWeek = (day) => { const t = new Date(day + "T00:00:00Z"), dn = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - dn + 3); const f = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return t.getUTCFullYear() + "-" + Math.round(((t - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7 + 1); };
export const rulesOf = (p) => ({ tz: p.tz || "Asia/Kolkata", days: J(p.days, []), blackout: J(p.blackout, []), overrides: J(p.overrides, []), notice: p.notice_days || 0, horizon: p.horizon_days || 365, maxWeek: p.max_week || 0, travelBuffer: p.travel_buffer || 0, hours: p.hours_start && p.hours_end ? p.hours_start + "–" + p.hours_end : null });

/* can this Pro take these days? reasons are plain sentences (shown to admins and in "Why not") */
export async function proFree(d, p, days, opt) {
  opt = opt || {}; const R = rulesOf(p), today = todayIn(R.tz), why = [];
  for (const day of days) {
    if (!DAY.test(day)) { why.push("Bad date " + day); continue; }
    const dow = DOW[new Date(day + "T00:00:00Z").getUTCDay()];
    if (R.blackout.indexOf(day) > -1) why.push(day + " is blocked by the professional");
    else if (R.days.length && R.days.indexOf(dow) < 0 && R.overrides.indexOf(day) < 0) why.push(day + " isn't a working day for this professional");
    if (day < addDays(today, R.notice)) why.push(day + " is too soon (needs " + R.notice + " days' notice)");
    if (day > addDays(today, R.horizon)) why.push(day + " is further ahead than this professional takes bookings (" + R.horizon + " days)");
    if (await one(d, "SELECT 1 x FROM biz_bookings WHERE pro_id=?1 AND day=?2 AND project_id != ?3", p.id, day, opt.except || "-")) why.push("Already booked on " + day);
  }
  if (R.maxWeek) { const weeks = {}; days.forEach((x) => { weeks[isoWeek(x)] = (weeks[isoWeek(x)] || 0) + 1; });
    for (const w of Object.keys(weeks)) { const ds = days.filter((x) => isoWeek(x) === w), lo = addDays(ds[0], -7), hi = addDays(ds[ds.length - 1], 7);
      const have = (await all(d, "SELECT DISTINCT day FROM biz_bookings WHERE pro_id=?1 AND day BETWEEN ?2 AND ?3 AND project_id != ?4", p.id, lo, hi, opt.except || "-")).filter((x) => isoWeek(x.day) === w).length;
      if (have + weeks[w] > R.maxWeek) why.push("Would be more than " + R.maxWeek + " booked days in the week of " + ds[0]); } }
  /* out-of-town work: the buffer days before and after must be free (travel) */
  const away = opt.city && p.city && String(p.city).toLowerCase().indexOf(String(opt.city).toLowerCase()) < 0 && String(opt.city).toLowerCase().indexOf(String(p.city).toLowerCase()) < 0;
  if (away && R.travelBuffer && days.length) { const first = days[0], last = days[days.length - 1];
    for (let i = 1; i <= R.travelBuffer; i++) for (const x of [addDays(first, -i), addDays(last, i)]) if (await one(d, "SELECT 1 x FROM biz_bookings WHERE pro_id=?1 AND day=?2 AND project_id != ?3", p.id, x, opt.except || "-")) why.push("Needs " + R.travelBuffer + " travel day(s) around out-of-town work, but is booked on " + x); }
  return { ok: !why.length, why };
}
/* all-or-nothing: book every day for this Pro under `ref` (a team id); any conflict → nothing stays booked */
export async function bookDays(d, proId, ref, days) {
  const made = [], undo = async () => { for (const id of made) await run(d, "DELETE FROM biz_bookings WHERE id=?1", id); };
  for (const day of days) { const id = "bk" + randId(12);
    try { await run(d, "INSERT INTO biz_bookings (id, pro_id, project_id, day, created_at, slot) VALUES (?1,?2,?3,?4,?5,'')", id, proId, ref, day, nowIso()); made.push(id); }
    catch (e) { if (await one(d, "SELECT 1 x FROM biz_bookings WHERE pro_id=?1 AND day=?2 AND project_id=?3 AND slot=''", proId, day, ref)) continue; await undo(); return { ok: false, day }; }
    if (await one(d, "SELECT 1 x FROM biz_bookings WHERE pro_id=?1 AND day=?2 AND project_id != ?3", proId, day, ref)) { await undo(); return { ok: false, day }; }   // a time-slot booking made at the same moment
  }
  return { ok: true, ids: made };
}
export const releaseDays = (d, proId, ref) => run(d, "DELETE FROM biz_bookings WHERE pro_id=?1 AND project_id=?2", proId, ref);

/* the Pro's own rules (Workspace → FODO Pros → Calendar) */
export async function saveRules(d, p, b) {
  const tz = typeof b.tz === "string" && /^[A-Za-z_]+\/[A-Za-z_\/+-]+$/.test(b.tz) ? b.tz : p.tz || "Asia/Kolkata"; try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch (e) { throw err("Unknown timezone."); }
  const hm = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v || "") ? v : null, hs = hm(b.hoursStart), he = hm(b.hoursEnd); if (hs && he && hs >= he) throw err("Working hours: the start must be before the end.");
  const n = (v, lo, hi, def) => { if (v === "" || v == null) return def; const x = Math.round(+v); if (!isFinite(x) || x < lo || x > hi) throw err("Value out of range (" + lo + "–" + hi + ")."); return x; };
  const ov = (Array.isArray(b.overrides) ? b.overrides : []).filter((x) => DAY.test(x)).slice(0, 60);
  await run(d, "UPDATE biz_pros SET tz=?2, hours_start=?3, hours_end=?4, horizon_days=?5, max_week=?6, travel_buffer=?7, overrides=?8, updated_at=?9 WHERE id=?1", p.id, tz, hs, he, n(b.horizonDays, 7, 730, 365), n(b.maxWeek, 0, 7, 0), n(b.travelBuffer, 0, 3, 0), JSON.stringify(ov), nowIso());
  return rulesOf(await one(d, "SELECT * FROM biz_pros WHERE id=?1", p.id));
}

/* ---------- equipment: units per day, enforced by the primary key (equipment_id, day, unit) ---------- */
export async function holdEquipment(d, eq, ref, qty, start, end, status) {
  const id = "eh" + randId(12), now = nowIso();
  if (eq.qty == null) { await run(d, "INSERT INTO biz_equipment_holds (id, team_id, equipment_id, qty, start_day, end_day, status, created_at) VALUES (?1,?2,?3,?4,?5,?6,'partner_confirm',?7)", id, ref, eq.id, qty, start, end, now); return { id, status: "partner_confirm" }; }
  const days = []; for (let x = start; x <= end; x = addDays(x, 1)) days.push(x);
  await run(d, "INSERT INTO biz_equipment_holds (id, team_id, equipment_id, qty, start_day, end_day, status, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)", id, ref, eq.id, qty, start, end, status || "held", now);
  for (const day of days) { let got = 0;
    for (let unit = 1; unit <= eq.qty && got < qty; unit++) { try { await run(d, "INSERT INTO biz_equipment_days (equipment_id, day, unit, hold_id) VALUES (?1,?2,?3,?4)", eq.id, day, unit, id); got++; } catch (e) {} }
    if (got < qty) { await run(d, "DELETE FROM biz_equipment_days WHERE hold_id=?1", id); await run(d, "UPDATE biz_equipment_holds SET status='unavailable' WHERE id=?1", id); return { id, status: "unavailable", day }; } }
  return { id, status: status || "held" };
}
export async function releaseHold(d, holdId, to) { await run(d, "DELETE FROM biz_equipment_days WHERE hold_id=?1", holdId); await run(d, "UPDATE biz_equipment_holds SET status=?2 WHERE id=?1", holdId, to || "released"); }
export async function equipmentFree(d, eq, start, end) { if (eq.qty == null) return null; let min = eq.qty; for (let x = start; x <= end; x = addDays(x, 1)) { const r = await one(d, "SELECT count(*) n FROM biz_equipment_days WHERE equipment_id=?1 AND day=?2", eq.id, x); min = Math.min(min, eq.qty - (r ? r.n : 0)); } return min; }
