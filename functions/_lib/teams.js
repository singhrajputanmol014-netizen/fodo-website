/* FODO v47.2 Team Builder (staffing): an accepted quote becomes a team with one slot per person in the quote.
   FODO staff fill each slot with a FODO Pro (suggestions ranked by the same matching engine), the Pro accepts or declines,
   declined / expired invitations get replacement suggestions (and, if switched on, the next best Pro is invited),
   a fully confirmed team is locked, and a date change re-checks every booking (nothing stale is left behind).
   Money: nothing is committed by an invitation; a Pro's days are booked only when they accept (database-level, all-or-nothing);
   the Pro sees only their own fee, never the client price, FODO's margin or other Pros' fees.
   Team states: draft → invitations_pending → partially_confirmed → confirmed → locked → active → completed | cancelled. */
import { nowIso, randId, OWNER_EMAILS } from "./accounts.js";
import { bdb, err, can, auditLog, notify, proOut } from "./biz.js";
import { pdb, match, pricingConfig, equipment as eqList } from "./production.js";
import { proFree, bookDays, releaseDays, dayList, addDays, holdEquipment, releaseHold, DAY } from "./availability.js";

const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
const all = async (d, sql, ...a) => (await d.prepare(sql).bind(...a).all()).results || [];
const one = (d, sql, ...a) => d.prepare(sql).bind(...a).first();
const run = (d, sql, ...a) => d.prepare(sql).bind(...a).run();
export const TEAM_STATES = ["draft", "invitations_pending", "partially_confirmed", "confirmed", "locked", "active", "completed", "cancelled"];
const LIVE = ["open", "invited", "accepted", "conflict"], FIXED = ["locked", "active", "completed", "cancelled"];
const ev = (d, t, kind, by, note) => run(d, "INSERT INTO biz_team_events (team_id, kind, by_email, note, created_at) VALUES (?1,?2,?3,?4,?5)", t, kind, by || "", clip(note, 500), nowIso());
const staff = (R) => can(R, ["admin", "finance", "viewer", "moderator"]);
async function owners(env, text, link) { try { const d = await bdb(env); for (const o of await all(d, "SELECT id FROM acct_users WHERE lower(email) IN (" + OWNER_EMAILS.map(() => "?").join(",") + ")", ...OWNER_EMAILS)) await notify(env, o.id, "team", text, link); } catch (e) {} }
const daysOf = (t) => t.start_day ? dayList(t.start_day, t.days || 1) : [];
/* desk roles (post-production, creative, marketing, web, business) can work remotely: no "local or travels" filter, no travel buffer */
const DESK = ["Post-production", "Creative", "Marketing", "Web", "Business"];
async function deskRole(d, roleId) { const r = roleId && await one(d, "SELECT category FROM biz_roles WHERE id=?1", roleId); return !!(r && DESK.indexOf(r.category) > -1); }
const cityFor = async (d, t, roleId) => t.mode === "online" || await deskRole(d, roleId) ? null : t.city;

/* ---------- create from an accepted quote (called by quotes.answer; idempotent: one team per quote) ---------- */
export async function fromQuote(env, quoteId, by) {
  const d = await pdb(env), q = await one(d, "SELECT * FROM biz_quotes WHERE id=?1", quoteId); if (!q) throw err("Quote not found.", 404);
  const ex = await one(d, "SELECT id FROM biz_teams WHERE quote_id=?1", q.id); if (ex) return ex.id;
  const v = J((await one(d, "SELECT data FROM biz_quote_versions WHERE quote_id=?1 AND version=?2", q.id, q.accepted_version || q.version)).data, {}), now = nowIso(), id = "tm" + randId(14), A = v.answers || {};
  const roleIds = {}; (await all(d, "SELECT id, name FROM biz_roles")).forEach((r) => { roleIds[r.name] = r.id; });
  try { await run(d, "INSERT INTO biz_teams (id, quote_id, client_id, title, template_id, status, start_day, days, city, mode, quote_version, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,'draft',?6,?7,?8,?9,?10,?11,?11)", id, q.id, q.client_id, v.title, v.templateId, DAY.test(A.date || "") ? A.date : null, Math.max(1, +A.shoot_days || 1), A.city || null, A.mode || v.mode || "onsite", q.accepted_version || q.version, now); }
  catch (e) { const again = await one(d, "SELECT id FROM biz_teams WHERE quote_id=?1", q.id); if (again) return again.id; throw e; }
  let slot = 0; for (const x of v.team || []) for (let i = 0; i < (x.qty || 1); i++) { slot++;   // one slot per person; the fee is this person's share of the quote line (rate × time)
    await run(d, "INSERT INTO biz_team_members (id, team_id, slot, role_id, role_name, pro_id, status, rate, units, unit, amount, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,NULL,'open',?6,?7,?8,?9,?10,?10)", "tmm" + randId(12), id, slot, roleIds[x.role] || null, x.role, x.rate, x.units, x.unitLabel, x.amount == null ? null : Math.round(x.amount / (x.qty || 1)), now); }
  await ev(d, id, "created", by || "system", "from quote " + q.number + " v" + (q.accepted_version || q.version) + ", " + slot + " people");
  if ((v.equipment || []).length) await holdAll(env, d, { id, start_day: DAY.test(A.date || "") ? A.date : null, days: Math.max(1, +A.shoot_days || 1) }, v.equipment, by);
  await auditLog(env, by || "system", "team:create", id, q.number); await owners(env, "Staff the team for " + v.title + " (" + slot + " people)", "#admin?tab=teams&id=" + id); return id;
}
async function holdAll(env, d, t, lines, by) {
  if (!t.start_day) return; const C = await pricingConfig(env), buf = C.equipmentBufferDays || 0, start = addDays(t.start_day, -buf), end = addDays(t.start_day, (t.days || 1) - 1 + buf);
  const byName = {}; (await eqList(env, true, true)).forEach((e) => { byName[e.name] = e; });
  for (const l of lines) { const e = byName[l.item]; if (!e) continue; const raw = await one(d, "SELECT * FROM biz_equipment WHERE id=?1", e.id); const h = await holdEquipment(d, raw, t.id, l.qty || 1, start, end);
    if (h.status === "unavailable") await ev(d, t.id, "equipment_unavailable", by || "system", e.name + " × " + (l.qty || 1) + " not free on " + h.day); }
}
/* status from the slots (a locked / active / finished team keeps its state) */
async function recalc(d, teamId) {
  const t = await one(d, "SELECT * FROM biz_teams WHERE id=?1", teamId); if (!t || FIXED.indexOf(t.status) > -1) return t && t.status;
  const L = await all(d, "SELECT status FROM biz_team_members WHERE team_id=?1 AND status IN ('open','invited','accepted','conflict')", teamId), acc = L.filter((x) => x.status === "accepted").length, inv = L.filter((x) => x.status === "invited").length;
  const st = L.length && acc === L.length ? "confirmed" : acc ? "partially_confirmed" : inv ? "invitations_pending" : "draft";
  if (st !== t.status) await run(d, "UPDATE biz_teams SET status=?2, updated_at=?3 WHERE id=?1", teamId, st, nowIso()); return st;
}

/* ---------- reads ---------- */
async function members(d, teamId) { return all(d, "SELECT m.*, p.name pro_name, p.city pro_city, p.photo pro_photo, p.user_id pro_user FROM biz_team_members m LEFT JOIN biz_pros p ON p.id=m.pro_id WHERE m.team_id=?1 ORDER BY m.slot, m.created_at", teamId); }
export async function adminTeams(env, R, q) { if (!staff(R)) throw err("Not allowed.", 403); const d = await pdb(env), st = TEAM_STATES.indexOf(q.status) > -1 ? q.status : "";
  return all(d, "SELECT t.id, t.title, t.status, t.start_day, t.days, t.city, t.updated_at, u.email client, q.number, (SELECT count(*) FROM biz_team_members m WHERE m.team_id=t.id AND m.status IN ('open','invited','accepted','conflict')) slots, (SELECT count(*) FROM biz_team_members m WHERE m.team_id=t.id AND m.status='accepted') confirmed FROM biz_teams t LEFT JOIN acct_users u ON u.id=t.client_id LEFT JOIN biz_quotes q ON q.id=t.quote_id WHERE (?1='' OR t.status=?1) ORDER BY t.updated_at DESC LIMIT 200", st); }
export async function adminTeam(env, R, id) {
  if (!staff(R)) throw err("Not allowed.", 403); const d = await pdb(env), t = await one(d, "SELECT t.*, q.number, u.email client FROM biz_teams t LEFT JOIN biz_quotes q ON q.id=t.quote_id LEFT JOIN acct_users u ON u.id=t.client_id WHERE t.id=?1", clip(id, 40)); if (!t) throw err("Team not found.", 404);
  const M = await members(d, t.id), holds = await all(d, "SELECT h.*, e.name FROM biz_equipment_holds h LEFT JOIN biz_equipment e ON e.id=h.equipment_id WHERE h.team_id=?1 ORDER BY h.created_at", t.id);
  return { team: { id: t.id, title: t.title, status: t.status, quote: t.number, quoteId: t.quote_id, client: t.client, startDay: t.start_day, days: t.days, city: t.city, mode: t.mode, lockedAt: t.locked_at, cost: M.filter((m) => LIVE.indexOf(m.status) > -1).reduce((a, m) => a + (m.amount || 0), 0) },
    slots: M.filter((m) => LIVE.indexOf(m.status) > -1).map((m) => ({ id: m.id, slot: m.slot, roleId: m.role_id, role: m.role_name, status: m.status, pro: m.pro_id ? { id: m.pro_id, name: m.pro_name, city: m.pro_city } : null, fee: m.amount, units: m.units, unit: m.unit, invitedAt: m.invited_at, expiresAt: m.expires_at, note: m.note })),
    history: M.filter((m) => LIVE.indexOf(m.status) < 0).map((m) => ({ slot: m.slot, role: m.role_name, pro: m.pro_name, status: m.status, note: m.note, at: m.answered_at || m.updated_at })),
    equipment: holds.map((h) => ({ id: h.id, item: h.name, qty: h.qty, from: h.start_day, to: h.end_day, status: h.status })), events: await all(d, "SELECT kind, by_email, note, created_at FROM biz_team_events WHERE team_id=?1 ORDER BY id DESC LIMIT 100", t.id) };
}
/* the client: who is confirmed (names and roles), never fees */
export async function clientTeam(env, u, R, quoteId) {
  const d = await pdb(env), t = await one(d, "SELECT * FROM biz_teams WHERE quote_id=?1", clip(quoteId, 40)); if (!t) return null; if (t.client_id !== u.id && !staff(R)) throw err("Not found.", 404);
  const M = (await members(d, t.id)).filter((m) => LIVE.indexOf(m.status) > -1);
  return { status: t.status, startDay: t.start_day, days: t.days, slots: M.length, confirmed: M.filter((m) => m.status === "accepted").length, people: M.filter((m) => m.status === "accepted").map((m) => ({ role: m.role_name, name: m.pro_name, photo: m.pro_photo })), locked: !!t.locked_at };
}
/* the Pro: their invitations and team bookings (own fee only; city, not the exact address) */
export async function proTeams(env, u) {
  const d = await pdb(env), p = await one(d, "SELECT * FROM biz_pros WHERE user_id=?1", u.id); if (!p) throw err("Create your FODO Pro profile first.", 404); await expireDue(env);
  return (await all(d, "SELECT m.id, m.status, m.role_name, m.amount, m.units, m.unit, m.expires_at, m.invited_at, m.answered_at, t.id team_id, t.title, t.status team_status, t.start_day, t.days, t.city, t.mode, (SELECT count(*) FROM biz_team_members x WHERE x.team_id=t.id AND x.status IN ('open','invited','accepted','conflict')) size FROM biz_team_members m JOIN biz_teams t ON t.id=m.team_id WHERE m.pro_id=?1 AND m.status IN ('invited','accepted','conflict','declined','expired','removed') ORDER BY CASE m.status WHEN 'invited' THEN 0 WHEN 'conflict' THEN 1 WHEN 'accepted' THEN 2 ELSE 3 END, t.start_day LIMIT 100", p.id))
    .map((x) => ({ id: x.id, status: x.status, role: x.role_name, fee: x.amount, units: x.units, unit: x.unit, expiresAt: x.expires_at, team: { id: x.team_id, title: x.title, status: x.team_status, startDay: x.start_day, days: x.days, city: x.city, mode: x.mode, size: x.size } }));
}

/* ---------- Pro answers ---------- */
export async function proAnswer(env, u, memberId, accept, b) {
  const d = await pdb(env), p = await one(d, "SELECT * FROM biz_pros WHERE user_id=?1", u.id); if (!p) throw err("Not found.", 404); await expireDue(env);
  const m = await one(d, "SELECT * FROM biz_team_members WHERE id=?1 AND pro_id=?2", clip(memberId, 40), p.id); if (!m) throw err("Invitation not found.", 404);
  if (m.status === "expired") throw err("This invitation expired. FODO may invite you again.", 409); if (m.status !== "invited") throw err("You already answered this invitation.", 409);
  if (["approved", "published"].indexOf(p.status) < 0) throw err("Your profile isn't active.", 403);
  const t = await one(d, "SELECT * FROM biz_teams WHERE id=?1", m.team_id), now = nowIso(); if (t.status === "cancelled") throw err("This project was cancelled.", 409);
  if (accept) { const days = daysOf(t);
    if (days.length) { const f = await proFree(d, p, days, { except: t.id, city: await cityFor(d, t, m.role_id) }); if (!f.ok) throw err("You can't take these dates: " + f.why[0] + ". Decline, or free the date first.", 409);
      const bk = await bookDays(d, p.id, t.id, days); if (!bk.ok) throw err(bk.day + " was just booked by something else. Decline, or ask FODO.", 409); }
    const x = await run(d, "UPDATE biz_team_members SET status='accepted', answered_at=?2, updated_at=?2 WHERE id=?1 AND status='invited'", m.id, now); if (!x.meta.changes) { await releaseDays(d, p.id, t.id); throw err("This invitation changed meanwhile, reload.", 409); }
    await ev(d, t.id, "accepted", u.email, m.role_name + ": " + p.name); }
  else { await run(d, "UPDATE biz_team_members SET status='declined', answered_at=?2, updated_at=?2, note=?3 WHERE id=?1 AND status='invited'", m.id, now, clip(b && b.reason, 300) || null); await ev(d, t.id, "declined", u.email, m.role_name + ": " + p.name + (b && b.reason ? " (" + clip(b.reason, 200) + ")" : ""));
    await reopen(env, d, t, m, "declined"); }
  const st = await recalc(d, t.id); await auditLog(env, u.email, "team:" + (accept ? "accept" : "decline"), t.id, m.role_name);
  await owners(env, p.name + (accept ? " accepted " : " declined ") + m.role_name + " for " + t.title + (st === "confirmed" ? ". The team is complete: lock it." : ""), "#admin?tab=teams&id=" + t.id);
  return proTeams(env, u);
}
/* a slot needs someone again: a new open row, ranked suggestions for FODO staff, optionally invite the next best automatically.
   After the client-approved team is locked, nobody is replaced automatically. */
async function reopen(env, d, t, m, why) {
  await run(d, "INSERT INTO biz_team_members (id, team_id, slot, role_id, role_name, pro_id, status, rate, units, unit, amount, note, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,NULL,'open',?6,?7,?8,?9,?10,?11,?11)", "tmm" + randId(12), t.id, m.slot, m.role_id, m.role_name, m.rate, m.units, m.unit, m.amount, "needs someone (" + why + ")", nowIso());
  const C = await pricingConfig(env); if (!C.teamAutoInvite || FIXED.indexOf(t.status) > -1 || !m.role_id) return;
  const s = await suggestFor(env, d, t, m.role_id, 1); if (s[0] && s[0].available !== false) { try { await inviteSlot(env, d, t, m.slot, s[0].pro.id, "auto-replacement"); } catch (e) {} }
}
async function suggestFor(env, d, t, roleId, limit) {
  const inTeam = (await all(d, "SELECT pro_id FROM biz_team_members WHERE team_id=?1 AND pro_id IS NOT NULL AND status IN ('invited','accepted','conflict','declined','expired','removed')", t.id)).map((x) => x.pro_id);
  const r = await match(env, { roles: ["admin"] }, { roleId, date: t.start_day, days: t.days, city: t.city, mode: await deskRole(d, roleId) ? "any" : t.mode, limit: 10 }); return r.items.filter((x) => inTeam.indexOf(x.pro.id) < 0).slice(0, limit || 5);
}
async function inviteSlot(env, d, t, slot, proId, by) {
  const C = await pricingConfig(env), m = await one(d, "SELECT * FROM biz_team_members WHERE team_id=?1 AND slot=?2 AND status='open'", t.id, slot); if (!m) throw err("That slot isn't open.", 409);
  const p = await one(d, "SELECT * FROM biz_pros WHERE id=?1", clip(proId, 40)); if (!p || ["approved", "published"].indexOf(p.status) < 0) throw err("This professional isn't active.", 404);
  if (await one(d, "SELECT 1 x FROM biz_team_members WHERE team_id=?1 AND pro_id=?2 AND status IN ('invited','accepted','conflict')", t.id, p.id)) throw err(p.name + " is already on this team.", 409);
  const days = daysOf(t); if (days.length) { const f = await proFree(d, p, days, { except: t.id, city: await cityFor(d, t, m.role_id) }); if (!f.ok) throw err(p.name + " isn't available: " + f.why[0] + ".", 409); }
  const now = nowIso(), exp = new Date(Date.now() + (C.inviteHours || 48) * 3600e3).toISOString();
  const x = await run(d, "UPDATE biz_team_members SET pro_id=?2, status='invited', invited_at=?3, expires_at=?4, updated_at=?3, note=NULL WHERE id=?1 AND status='open'", m.id, p.id, now, exp); if (!x.meta.changes) throw err("That slot changed meanwhile, reload.", 409);
  await ev(d, t.id, "invited", by, m.role_name + ": " + p.name); await recalc(d, t.id);
  await notify(env, p.user_id, "team", "FODO invites you as " + m.role_name + " for " + t.title + (t.start_day ? " on " + t.start_day + (t.days > 1 ? " (" + t.days + " days)" : "") : "") + (m.amount != null ? ", fee ₹" + (+m.amount).toLocaleString("en-IN") : "") + ". Please answer within " + (C.inviteHours || 48) + " hours.", "/fodo-pros/#pro-teams");
  return m.id;
}
/* invitations nobody answered in time (the scheduler and every read call this) */
export async function expireDue(env) {
  const d = await pdb(env), now = nowIso(), L = await all(d, "SELECT * FROM biz_team_members WHERE status='invited' AND expires_at < ?1 LIMIT 50", now);
  for (const m of L) { const x = await run(d, "UPDATE biz_team_members SET status='expired', answered_at=?2, updated_at=?2 WHERE id=?1 AND status='invited'", m.id, now); if (!x.meta.changes) continue;
    const t = await one(d, "SELECT * FROM biz_teams WHERE id=?1", m.team_id); await ev(d, t.id, "expired", "system", m.role_name + ": no answer in time"); await reopen(env, d, t, m, "invitation expired"); await recalc(d, t.id);
    await owners(env, "An invitation for " + m.role_name + " (" + t.title + ") expired. Pick someone else.", "#admin?tab=teams&id=" + t.id); }
  return L.length;
}
/* the day before a locked team starts: a reminder to the client and every confirmed Pro (once) */
export async function remindDue(env) {
  const d = await pdb(env), tomorrow = addDays(nowIso().slice(0, 10), 1), L = await all(d, "SELECT * FROM biz_teams WHERE status IN ('locked','active') AND start_day=?1 AND reminded_at IS NULL LIMIT 50", tomorrow);
  for (const t of L) { const x = await run(d, "UPDATE biz_teams SET reminded_at=?2 WHERE id=?1 AND reminded_at IS NULL", t.id, nowIso()); if (!x.meta.changes) continue;
    await notify(env, t.client_id, "team", "Reminder: " + t.title + " starts tomorrow (" + t.start_day + ").", "#quote=" + t.quote_id);
    for (const m of await members(d, t.id)) if (m.status === "accepted" && m.pro_user) await notify(env, m.pro_user, "team", "Reminder: you're " + m.role_name + " on " + t.title + " tomorrow (" + t.start_day + (t.city ? ", " + t.city : "") + ").", "/fodo-pros/#pro-teams"); }
  return L.length;
}

/* ---------- FODO staff actions ---------- */
export async function adminAction(env, u, R, id, act, b) {
  if (act === "suggest") { if (!staff(R)) throw err("Not allowed.", 403); } else if (!can(R, ["admin"])) throw err("Only FODO admins change teams.", 403);
  const d = await pdb(env), t = await one(d, "SELECT * FROM biz_teams WHERE id=?1", clip(id, 40)); if (!t) throw err("Team not found.", 404);
  if (t.status === "cancelled" && act !== "suggest") throw err("This team was cancelled.", 409);
  const reason = clip(b.reason, 300), locked = FIXED.indexOf(t.status) > -1, now = nowIso();
  if (act === "suggest") { const m = await one(d, "SELECT * FROM biz_team_members WHERE team_id=?1 AND slot=?2 AND status IN ('open','invited','accepted','conflict')", t.id, +b.slot); if (!m || !m.role_id) throw err("Slot not found.", 404); return { slot: m.slot, role: m.role_name, items: await suggestFor(env, d, t, m.role_id, 5) }; }
  if (act === "invite") { if (locked) throw err("The team is locked. Unlock it first (with a reason).", 409); await inviteSlot(env, d, t, +b.slot, b.proId, u.email); }
  else if (act === "resend") { const C = await pricingConfig(env), m = await one(d, "SELECT m.*, p.user_id FROM biz_team_members m JOIN biz_pros p ON p.id=m.pro_id WHERE m.id=?1 AND m.team_id=?2 AND m.status='invited'", clip(b.memberId, 40), t.id); if (!m) throw err("No open invitation to resend.", 409);
    await run(d, "UPDATE biz_team_members SET expires_at=?2, updated_at=?3 WHERE id=?1", m.id, new Date(Date.now() + (C.inviteHours || 48) * 3600e3).toISOString(), now); await notify(env, m.user_id, "team", "Reminder: FODO is waiting for your answer: " + m.role_name + " for " + t.title + ".", "/fodo-pros/#pro-teams"); await ev(d, t.id, "resent", u.email, m.role_name); }
  else if (act === "remove" || act === "replace") {
    const m = await one(d, "SELECT * FROM biz_team_members WHERE id=?1 AND team_id=?2 AND status IN ('invited','accepted','conflict')", clip(b.memberId, 40), t.id); if (!m) throw err("Team member not found.", 404);
    if ((locked || m.status === "accepted") && reason.length < 3) throw err("Say why (the professional is told, and it's kept in the team history).");
    await run(d, "UPDATE biz_team_members SET status='removed', note=?2, answered_at=COALESCE(answered_at, ?3), updated_at=?3 WHERE id=?1", m.id, reason || "removed by FODO", now); if (m.pro_id) await releaseDays(d, m.pro_id, t.id);
    await run(d, "INSERT INTO biz_team_members (id, team_id, slot, role_id, role_name, pro_id, status, rate, units, unit, amount, note, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,NULL,'open',?6,?7,?8,?9,?10,?11,?11)", "tmm" + randId(12), t.id, m.slot, m.role_id, m.role_name, m.rate, m.units, m.unit, m.amount, "replacing", now);
    const pu = m.pro_id && await one(d, "SELECT user_id, name FROM biz_pros WHERE id=?1", m.pro_id); if (pu) await notify(env, pu.user_id, "team", "FODO removed you from " + t.title + " (" + m.role_name + ")" + (reason ? ": " + reason : "") + ". Those days are free again.", "/fodo-pros/#pro-teams");
    await ev(d, t.id, act === "replace" ? "replaced" : "removed", u.email, m.role_name + (pu ? ": " + pu.name : "") + (reason ? " · " + reason : ""));
    if (locked) await run(d, "UPDATE biz_teams SET status='confirmed', locked_at=NULL, updated_at=?2 WHERE id=?1 AND status='locked'", t.id, now);   // a locked team that loses someone is no longer complete
    if (act === "replace" && b.proId) { const t2 = await one(d, "SELECT * FROM biz_teams WHERE id=?1", t.id); await inviteSlot(env, d, t2, m.slot, b.proId, u.email); } }
  else if (act === "add_slot") { if (locked) throw err("The team is locked. Unlock it first.", 409); const r = await one(d, "SELECT * FROM biz_roles WHERE id=?1", clip(b.roleId, 40)); if (!r) throw err("Unknown role.", 404);
    const n = ((await one(d, "SELECT MAX(slot) n FROM biz_team_members WHERE team_id=?1", t.id)) || {}).n || 0; await run(d, "INSERT INTO biz_team_members (id, team_id, slot, role_id, role_name, pro_id, status, rate, units, unit, amount, note, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,NULL,'open',?6,?7,?8,?9,?10,?11,?11)", "tmm" + randId(12), t.id, n + 1, r.id, r.name, r.rate, t.days || 1, r.unit, r.rate == null ? null : r.rate * (r.unit === "day" ? t.days || 1 : 1), "added by FODO (not in the quote: needs a quote revision / amendment)", now);
    await ev(d, t.id, "slot_added", u.email, r.name + " (outside the accepted quote)"); }
  else if (act === "lock") { const L = await all(d, "SELECT status FROM biz_team_members WHERE team_id=?1 AND status IN ('open','invited','accepted','conflict')", t.id); if (!L.length || L.some((x) => x.status !== "accepted")) throw err("Every slot needs an accepted professional before the team can be locked.", 409);
    await run(d, "UPDATE biz_teams SET status='locked', locked_at=?2, locked_by=?3, updated_at=?2 WHERE id=?1", t.id, now, u.email); await ev(d, t.id, "locked", u.email, "");
    await notify(env, t.client_id, "team", "Your team for " + t.title + " is confirmed and locked (" + L.length + " people).", "#quote=" + t.quote_id);
    for (const m of await members(d, t.id)) if (m.status === "accepted" && m.pro_user) await notify(env, m.pro_user, "team", "The team for " + t.title + " is locked. See you " + (t.start_day ? "on " + t.start_day : "soon") + ".", "/fodo-pros/#pro-teams"); }
  else if (act === "unlock") { if (t.status !== "locked") throw err("The team isn't locked.", 409); if (reason.length < 3) throw err("Say why the team is unlocked."); await run(d, "UPDATE biz_teams SET status='confirmed', locked_at=NULL, updated_at=?2 WHERE id=?1", t.id, now); await ev(d, t.id, "unlocked", u.email, reason); }
  else if (act === "change_date") { const start = DAY.test(b.startDay || "") ? b.startDay : null, n = Math.max(1, Math.min(60, Math.round(+b.days || t.days || 1))); if (!start) throw err("Pick the new start date."); if (reason.length < 3) throw err("Say why the date changes (everyone on the team is told).");
    await run(d, "UPDATE biz_teams SET start_day=?2, days=?3, updated_at=?4 WHERE id=?1", t.id, start, n, now); const t2 = await one(d, "SELECT * FROM biz_teams WHERE id=?1", t.id), days = daysOf(t2), out = [];
    for (const m of await members(d, t.id)) { if (!m.pro_id || ["accepted", "invited", "conflict"].indexOf(m.status) < 0) continue; await releaseDays(d, m.pro_id, t.id);   // nothing stale stays booked
      const p = await one(d, "SELECT * FROM biz_pros WHERE id=?1", m.pro_id), f = await proFree(d, p, days, { except: t.id, city: await cityFor(d, t2, m.role_id) });
      if (m.status === "invited") { if (!f.ok) out.push(m.role_name + ": " + p.name + " (invited) can't make it: " + f.why[0]); if (p.user_id) await notify(env, p.user_id, "team", "The dates for " + t.title + " changed to " + start + (n > 1 ? " (" + n + " days)" : "") + ". Please check before you answer.", "/fodo-pros/#pro-teams"); continue; }
      const bk = f.ok ? await bookDays(d, p.id, t.id, days) : { ok: false };
      if (bk.ok) { if (m.status === "conflict") await run(d, "UPDATE biz_team_members SET status='accepted', updated_at=?2 WHERE id=?1", m.id, now); if (p.user_id) await notify(env, p.user_id, "team", "New dates for " + t.title + ": " + start + (n > 1 ? " (" + n + " days)" : "") + ". You're booked.", "/fodo-pros/#pro-teams"); }
      else { await run(d, "UPDATE biz_team_members SET status='conflict', note=?2, updated_at=?3 WHERE id=?1", m.id, "not available on the new dates", now); out.push(m.role_name + ": " + p.name + " can't make the new dates" + (f.why[0] ? " (" + f.why[0] + ")" : "")); if (p.user_id) await notify(env, p.user_id, "team", "The dates for " + t.title + " changed to " + start + " and you look busy then. FODO will contact you.", "/fodo-pros/#pro-teams"); } }
    for (const h of await all(d, "SELECT * FROM biz_equipment_holds WHERE team_id=?1 AND status IN ('held','partner_confirm','unavailable')", t.id)) { await releaseHold(d, h.id, "moved"); const e = await one(d, "SELECT * FROM biz_equipment WHERE id=?1", h.equipment_id); const C = await pricingConfig(env), buf = C.equipmentBufferDays || 0;
      const r = await holdEquipment(d, e, t.id, h.qty, addDays(start, -buf), addDays(start, n - 1 + buf)); if (r.status === "unavailable") out.push(e.name + " isn't free on " + r.day); }
    if (locked) await run(d, "UPDATE biz_teams SET status='confirmed', locked_at=NULL WHERE id=?1 AND status='locked'", t.id);
    await ev(d, t.id, "date_changed", u.email, start + " × " + n + " day(s) · " + reason + (out.length ? " · conflicts: " + out.join("; ") : "")); await notify(env, t.client_id, "team", "The dates for " + t.title + " changed to " + start + (n > 1 ? " (" + n + " days)" : "") + ".", "#quote=" + t.quote_id);
    await auditLog(env, u.email, "team:date", t.id, start + " " + n + " · " + reason); await recalc(d, t.id); return Object.assign(await adminTeam(env, R, t.id), { conflicts: out }); }
  else if (act === "cancel") { if (reason.length < 3) throw err("Say why the team is cancelled."); for (const m of await members(d, t.id)) { if (m.pro_id && ["invited", "accepted", "conflict"].indexOf(m.status) > -1) { await releaseDays(d, m.pro_id, t.id); if (m.pro_user) await notify(env, m.pro_user, "team", t.title + " was cancelled. Those days are free again.", "/fodo-pros/#pro-teams"); } }
    await run(d, "UPDATE biz_team_members SET status='removed', note=?2, updated_at=?3 WHERE team_id=?1 AND status IN ('open','invited','accepted','conflict')", t.id, "team cancelled", now);
    for (const h of await all(d, "SELECT id FROM biz_equipment_holds WHERE team_id=?1 AND status IN ('held','partner_confirm','unavailable')", t.id)) await releaseHold(d, h.id, "released");
    await run(d, "UPDATE biz_teams SET status='cancelled', updated_at=?2 WHERE id=?1", t.id, now); await ev(d, t.id, "cancelled", u.email, reason); }
  else if (act === "equipment_retry") { const h = await one(d, "SELECT * FROM biz_equipment_holds WHERE id=?1 AND team_id=?2 AND status='unavailable'", clip(b.holdId, 40), t.id); if (!h) throw err("Nothing to retry.", 409); await releaseHold(d, h.id, "retried");
    const e = await one(d, "SELECT * FROM biz_equipment WHERE id=?1", h.equipment_id), r = await holdEquipment(d, e, t.id, h.qty, h.start_day, h.end_day); await ev(d, t.id, "equipment_" + r.status, u.email, e.name); }
  else throw err("Unknown action.");
  if (act !== "lock" && act !== "unlock" && act !== "cancel") await recalc(d, t.id);
  await auditLog(env, u.email, "team:" + act, t.id, reason); return adminTeam(env, R, t.id);
}
export async function createForQuote(env, u, R, quoteId) { if (!can(R, ["admin"])) throw err("Only FODO admins.", 403); const d = await pdb(env), q = await one(d, "SELECT status FROM biz_quotes WHERE id=?1", clip(quoteId, 40)); if (!q) throw err("Quote not found.", 404); if (q.status !== "accepted") throw err("Teams are staffed for accepted quotes.", 409); return fromQuote(env, clip(quoteId, 40), u.email); }

/* ---------- equipment availability + maintenance blocks ---------- */
export async function equipmentBoard(env, R, q) { if (!staff(R)) throw err("Not allowed.", 403); const d = await pdb(env), from = DAY.test(q.from || "") ? q.from : nowIso().slice(0, 10), to = DAY.test(q.to || "") ? q.to : addDays(from, 30);
  return { from, to, items: await all(d, "SELECT e.id, e.name, e.qty, e.owner, (SELECT count(*) FROM biz_equipment_days x WHERE x.equipment_id=e.id AND x.day BETWEEN ?1 AND ?2) unit_days FROM biz_equipment e WHERE e.active=1 ORDER BY e.category, e.name", from, to),
    holds: await all(d, "SELECT h.id, h.team_id, t.title, e.name, h.qty, h.start_day, h.end_day, h.status, h.note FROM biz_equipment_holds h JOIN biz_equipment e ON e.id=h.equipment_id LEFT JOIN biz_teams t ON t.id=h.team_id WHERE h.end_day >= ?1 AND h.start_day <= ?2 AND h.status IN ('held','partner_confirm','unavailable','maintenance') ORDER BY h.start_day LIMIT 300", from, to) }; }
export async function blockEquipment(env, u, R, b) { if (!can(R, ["admin"])) throw err("Only FODO admins.", 403); const d = await pdb(env), e = await one(d, "SELECT * FROM biz_equipment WHERE id=?1", clip(b.equipmentId, 40)); if (!e) throw err("Unknown equipment.", 404);
  if (e.qty == null) throw err("Set how many units FODO has before blocking days."); const s = DAY.test(b.from || "") ? b.from : null, t = DAY.test(b.to || "") ? b.to : s; if (!s || t < s) throw err("Pick the dates.");
  const r = await holdEquipment(d, e, null, Math.max(1, Math.min(e.qty, +b.qty || 1)), s, t, "maintenance"); if (r.status === "unavailable") throw err("Those units are booked on " + r.day + ".", 409);
  await run(d, "UPDATE biz_equipment_holds SET note=?2 WHERE id=?1", r.id, clip(b.reason, 200) || "maintenance"); await auditLog(env, u.email, "equipment:block", e.id, s + "→" + t); return r; }
export async function releaseEquipment(env, u, R, holdId) { if (!can(R, ["admin"])) throw err("Only FODO admins.", 403); const d = await pdb(env), h = await one(d, "SELECT * FROM biz_equipment_holds WHERE id=?1", clip(holdId, 40)); if (!h) throw err("Not found.", 404); await releaseHold(d, h.id, h.status === "maintenance" ? "released" : "returned"); await auditLog(env, u.email, "equipment:release", h.id, h.status); return { ok: true }; }
