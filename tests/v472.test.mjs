// v47.2: teams from accepted quotes, invitations / acceptance / decline / expiry / replacement / locking, availability engine
// (rules, horizon, max per week, travel buffer, overrides), database-level double booking (all-or-nothing), date changes,
// equipment holds + maintenance, client + Pro views, Brain team tools. Run: node --no-warnings tests/v472.test.mjs
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as admin } from "../functions/api/admin/[[path]].js";
import { onRequest as xray } from "../functions/api/xray/[[path]].js";
import { onRequest as brain } from "../functions/api/owner-brain/[[path]].js";
import { onRequest as bizApi } from "../functions/api/biz/[[path]].js";
import { onRequest as sitesApi } from "../functions/api/sites/[[path]].js";
import { fundMilestone } from "../functions/_lib/biz.js";
import { priceIt, PRICING_DEFAULTS } from "../functions/_lib/production.js";
import { ROLES, EQUIPMENT, TEMPLATES } from "../functions/_lib/catalog-seed.js";
import { TOOLS } from "../functions/_lib/brain/tools.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
console.log = ((orig) => (...a) => { if (typeof a[0] === "string" && a[0].charAt(0) === "{" && !process.env.DBG) return; orig(...a); })(console.log);
console.error = () => {};
function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, a = []) => ({ bind: (...x) => st(sql, x.map((v) => v === undefined ? null : v)), run: async () => { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }), _x: () => db.prepare(sql).run(...a) });
  return { db, prepare: (s) => st(s), batch: async (l) => l.map((s) => (s._x(), { success: true })) };
}
const SITE = "https://www.fodo.co.in", jars = {}, H = { account, admin, xray, "owner-brain": brain };
const call = async (path, body, o = {}) => {
  const who = o.as || "a", h = Object.keys(H).filter((k) => path.indexOf(k + "/") === 0)[0] || "account", p = h === "account" ? path : path.slice(h.length + 1);
  const method = o.method || (body !== undefined ? "POST" : "GET");
  const req = new Request(SITE + "/api/" + h + "/" + p, { method, headers: Object.assign({ origin: SITE, "cf-connecting-ip": "9.9.9.9" }, body !== undefined ? { "content-type": "application/json" } : {}, jars[who] ? { cookie: jars[who] } : {}, o.headers || {}), body: body === undefined ? undefined : JSON.stringify(body) });
  const r = await H[h]({ request: req, env, params: { path: p.split("?")[0].split("/") } }); const sc = r.headers.get("set-cookie"); if (sc && h === "account") jars[who] = sc.split(";")[0];
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} all.push(t); return { status: r.status, j, t };
};
const all = [];
const login = (email, plan, who) => call("test-login", Object.assign({ email }, plan ? { plan } : {}), { as: who });
const calls = []; let cfStatus = "RECEIVED", cfCheck = "SUCCESS", rzStatus = "processing", rzCheck = "processed", cfFail = false;
globalThis.fetch = async (u, o = {}) => { u = String(u); const J = (x, s) => new Response(JSON.stringify(x), { status: s || 200, headers: { "content-type": "application/json" } }); const b = o.body ? JSON.parse(o.body) : null;
  if (/cashfree\.com\/payout\/beneficiary/.test(u)) { calls.push({ p: "cf-bene", b, h: o.headers }); return calls.filter((c) => c.p === "cf-bene").length > 1 ? J({ message: "exists" }, 409) : J({ beneficiary_id: b.beneficiary_id }); }
  if (/cashfree\.com\/payout\/transfers\?/.test(u)) { calls.push({ p: "cf-get", u }); return J({ status: cfCheck, cf_transfer_id: 991 }); }
  if (/cashfree\.com\/payout\/transfers/.test(u)) { calls.push({ p: "cf-tx", b, h: o.headers }); if (cfFail) return J({ message: "Beneficiary bank account invalid" }, 422); return J({ cf_transfer_id: 991, transfer_id: b.transfer_id, status: cfStatus }); }
  if (/api\.razorpay\.com\/v1\/payouts\//.test(u)) { calls.push({ p: "rz-get", u }); return J({ id: "pout_1", status: rzCheck }); }
  if (/api\.razorpay\.com\/v1\/payouts/.test(u)) { calls.push({ p: "rz-tx", b, h: o.headers }); return J({ id: "pout_1", status: rzStatus }); }
  if (/cashfree\.com\/pg\/orders\/[^/]+\/refunds\/[^/]+$/.test(u) && (o.method || "GET") === "GET") { calls.push({ p: "cf-rf-get", u }); return J({ refund_status: cfRefundCheck, cf_refund_id: 5511 }); }
  if (/cashfree\.com\/pg\/orders\/[^/]+\/refunds/.test(u)) { calls.push({ p: "cf-rf", u, b, idem: (o.headers || {})["x-idempotency-key"] }); return J({ cf_refund_id: 5511, refund_id: b.refund_id, refund_status: cfRefundStart }); }
  return new Response("x", { status: 599 }); };
let cfRefundStart = "PENDING", cfRefundCheck = "SUCCESS";
const KV = new Map(), CHAT_KV = { get: async (k) => KV.get(k) || null, put: async (k, v) => { KV.set(k, v); }, getWithMetadata: async (k) => ({ value: KV.get(k) || null, metadata: null }), delete: async (k) => KV.delete(k), list: async () => ({ keys: [] }) };
const env = { XRAY_DB: d1(), CHAT_KV, ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", MAIL_FROM: "FODO <hello@fodo.co.in>", SITES_HOST: "sites.fodo.co.in", SITES_PROJECT: "fodo-sites" };
H.biz = bizApi; H.sites = sitesApi;
const Z = (p, body, who, o) => call("biz/" + p, body, Object.assign({ as: who || "c" }, o || {}));
const q1 = (sql, ...a) => env.XRAY_DB.db.prepare(sql).get(...a);
await login("anmol@fodo.co.in", null, "own"); await login("client@biz.in", null, "c"); await login("pro@studio.in", null, "p"); await login("fin@fodo.co.in", null, "fin"); await login("other@biz.in", null, "o");
await Z("admin/staff", { email: "fin@fodo.co.in", role: "finance" }, "own");
const inv = (await Z("admin/invites", { note: "p", maxUses: 1 }, "own")).j.token;
await Z("pro", { invite: inv, name: "Aarav Films", role: "Cinematographer", skills: "reels", city: "Delhi", onsite: true, langs: "Hindi", bio: "Professional for restaurants and cafes in Delhi NCR. Short-form reels and brand films.", days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], rateDay: 18000, terms: true }, "p");
await Z("pro/packages", { name: "Pack", price: 15000 }, "p"); await Z("pro/portfolio", { kind: "video", title: "Film", url: "https://vimeo.com/1" }, "p"); await Z("pro/submit", {}, "p"); const proId = (await Z("pro", undefined, "p")).j.pro.id; await Z("admin/pros/" + proId, { action: "approve" }, "own");
const mkPayout = async (amount) => { const pid = (await Z("projects", { proId, title: "Job " + amount, brief: "A project for the payout tests" })).j.project.id; await Z("projects/" + pid + "/propose", { milestones: [{ title: "Work", amount }] }, "p"); await Z("projects/" + pid + "/accept", {});
  const m = (await Z("projects/" + pid)).j.project.milestones[0]; await fundMilestone(env, m.id, "o_" + amount); await Z("projects/" + pid + "/submit", { milestoneId: m.id, note: "done" }, "p"); await Z("projects/" + pid + "/approve", { milestoneId: m.id }); return q1("SELECT id, net FROM biz_payouts WHERE milestone_id=?", m.id); };

const today = new Date().toISOString();
const order = (id, amount) => env.XRAY_DB.db.prepare("INSERT INTO acct_orders (order_id, user_id, kind, item, amount, status, cf_order_id, created_at, paid_at) VALUES (?,?,?,?,?,?,?,?,?)").run(id, "u", "milestone", "x", amount, "PAID", "12345", today, today);
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
let r;

/* more professionals */
const mkPro = async (who, email, o) => { await login(email, null, who); const iv = (await Z("admin/invites", { note: who, maxUses: 1 }, "own")).j.token;
  await Z("pro", Object.assign({ invite: iv, langs: "Hindi", bio: "Professional crew member for brand shoots and commercials in India.", days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], terms: true }, o), who);
  await Z("pro/packages", { name: "Day", price: 10000 }, who); await Z("pro/portfolio", { kind: "video", title: "Work", url: "https://vimeo.com/2" }, who); await Z("pro/submit", {}, who); const id = (await Z("pro", undefined, who)).j.pro.id; await Z("admin/pros/" + id, { action: "approve" }, "own"); return id; };
const p2 = await mkPro("p2", "producer@crew.in", { name: "Riya Productions", role: "Producer", city: "Delhi", onsite: true, rateDay: 15000 });
const p3 = await mkPro("p3", "dop@mumbai.in", { name: "Kabir Lens", role: "Cinematographer", city: "Mumbai", onsite: true, rateDay: 30000 });
const p4 = await mkPro("p4", "edit@remote.in", { name: "Neha Cuts", role: "Video Editor", city: "Pune", remote: true, rateDay: 9000 });
const p5 = await mkPro("p5", "dop2@delhi.in", { name: "Arjun Frames", role: "Cinematographer", city: "Delhi", onsite: true, rateDay: 25000 });
await Z("admin/catalog/equipment", { id: "fx6", qty: 1, reason: "FODO owns one FX6" }, "own");
const D1 = day(12);
/* a quote the client accepts → a team */
const mkTeam = async (date, days, who) => { const q0 = (await Z("admin/quotes", { clientEmail: "client@biz.in", templateId: "custom", answers: { promote: "Brand film shoot", city: "Delhi", date, shoot_days: days, mode: "onsite" }, tier: "essential", custom: { roles: [{ id: "dop", qty: 1 }, { id: "producer", qty: 1 }, { id: "editor", qty: 1, basis: "post", units: 2 }], equipment: [{ id: "fx6", qty: 1 }] } }, "own")).j.quote;
  await Z("admin/quotes/" + q0.id + "/send", {}, "own"); await Z("quotes/" + q0.id, undefined, who || "c"); const a = await Z("quotes/" + q0.id + "/accept", { version: 1, agree: true }, who || "c"); return { q: q0, a }; };
let T1q = await mkTeam(D1, 2);
ok(T1q.a.j.quote.status === "accepted", "client accepts the quote");
r = await Z("admin/teams", undefined, "own"); const T1 = r.j.items[0]; ok(r.j.items.length === 1 && T1.slots === 3 && T1.confirmed === 0 && T1.status === "draft", "accepting creates the team: 3 slots (one per person), nobody yet");
r = await Z("admin/teams", undefined, "c"); ok(r.status === 403, "clients can't see the staffing board");
r = await Z("admin/teams/" + T1.id, undefined, "own"); let TD = r.j; const sl = (role) => TD.slots.find((s) => s.role.indexOf(role) > -1);
ok(TD.team.startDay === D1 && TD.team.days === 2 && sl("DOP").fee === 70000 && sl("Producer").fee === 36000, "dates and per-person fees come from the accepted quote (DOP 2 days × ₹35,000)");
ok(TD.equipment.length === 1 && TD.equipment[0].status === "held" && TD.equipment[0].from === day(11) && TD.equipment[0].to === day(14), "FX6 reserved with a pickup / return day either side");
r = await Z("quotes/" + T1q.q.id + "/team"); ok(r.j.team.slots === 3 && r.j.team.confirmed === 0 && !JSON.stringify(r.j).match(/70000|fee/), "client sees the team status without fees");
r = await Z("quotes/" + T1q.q.id + "/team", undefined, "o"); ok(r.status === 404, "other clients can't");
r = await Z("notes", undefined, "own"); ok(r.j.items.some((n) => /Staff the team/.test(n.text)), "owners are asked to staff it");
/* suggestions */
r = await Z("admin/teams/" + T1.id + "/suggest", { slot: sl("DOP").slot }, "own");
ok(r.j.items.map((x) => x.pro.name).sort().join() === "Aarav Films,Arjun Frames,Kabir Lens" && r.j.items.every((x) => x.why.length), "suggestions for the DOP slot: the 3 cinematographers, with reasons");
r = await Z("admin/teams/" + T1.id + "/suggest", { slot: sl("Editor").slot }, "own"); ok(r.j.items.length === 1 && r.j.items[0].pro.name === "Neha Cuts", "editor slot: the remote editor");
/* invite + accept */
r = await Z("admin/teams/" + T1.id + "/invite", { slot: sl("DOP").slot, proId: proId }, "fin"); ok(r.status === 403, "finance can't staff teams");
r = await Z("admin/teams/" + T1.id + "/invite", { slot: sl("DOP").slot, proId: p4 }, "own"); ok(r.j.ok, "admins can invite (role fit is the admin's call)");
await Z("admin/teams/" + T1.id + "/remove", { memberId: r.j.slots.find((s) => s.pro && s.pro.id === p4).id, reason: "wrong role" }, "own");
r = await Z("admin/teams/" + T1.id + "/invite", { slot: sl("DOP").slot, proId: proId }, "own"); TD = r.j;
ok(sl("DOP").status === "invited" && TD.team.status === "invitations_pending", "invite Aarav for DOP → invitations pending");
r = await Z("admin/teams/" + T1.id + "/invite", { slot: sl("Producer").slot, proId: proId }, "own"); ok(r.status === 409 && /already on this team/.test(r.j.reason), "the same person can't fill two slots");
r = await Z("notes", undefined, "p"); ok(r.j.items.some((n) => /invites you as Director of Photography/.test(n.text) && /₹70,000/.test(n.text)), "the Pro is notified with their own fee");
r = await Z("pro/teams", undefined, "p"); let my = r.j.items[0]; ok(my.status === "invited" && my.fee === 70000 && my.team.city === "Delhi" && !JSON.stringify(r.j).match(/client@biz|36000|total|margin/i), "Pro sees role, dates, city and their fee only");
r = await Z("pro/teams/" + my.id + "/accept", {}, "p2"); ok(r.status === 404, "another Pro can't answer it");
r = await Z("pro/teams/" + my.id + "/accept", {}, "p"); ok(r.j.items[0].status === "accepted", "Aarav accepts");
ok(q1("SELECT count(*) n FROM biz_bookings WHERE pro_id=? AND project_id=?", proId, T1.id).n === 2, "…both shoot days are booked in the database");
r = await Z("pro/teams/" + my.id + "/accept", {}, "p"); ok(r.status === 409, "answering twice is refused");
r = await Z("pro/dashboard", undefined, "p"); ok(r.j.bookings.some((b) => b.kind === "team" && b.day === D1), "the team days show in the Pro's calendar");
/* double booking */
let T2q = await mkTeam(D1, 1); const T2 = (await Z("admin/teams", undefined, "own")).j.items.find((t) => t.id !== T1.id);
r = await Z("admin/teams/" + T2.id, undefined, "own"); const t2dop = r.j.slots.find((s) => /DOP/.test(s.role)).slot;
ok(r.j.equipment[0].status === "unavailable", "FODO's only FX6 is already reserved → the second team's FX6 shows 'not free'");
r = await Z("admin/teams/" + T2.id + "/invite", { slot: t2dop, proId }, "own"); ok(r.status === 409 && /Already booked/.test(r.j.reason), "Aarav is booked that day → can't be invited to another team");
r = await Z("admin/teams/" + T2.id + "/suggest", { slot: t2dop }, "own"); ok(r.j.items.find((x) => x.pro.name === "Aarav Films").available === false && r.j.items.find((x) => x.pro.name === "Aarav Films").notes.some((n) => /Already booked/.test(n)), "suggestions show him as not available, and why");
await Z("admin/teams/" + T2.id + "/invite", { slot: t2dop, proId: p5 }, "own"); r = await Z("admin/teams/" + T1.id + "/invite", { slot: sl("Producer").slot, proId: p2 }, "own");
env.XRAY_DB.db.prepare("INSERT INTO biz_bookings (id, pro_id, project_id, day, created_at, slot) VALUES ('bkX', ?, 'pjOther', ?, ?, '')").run(p2, day(13), new Date().toISOString());   // a booking that appears after the invite
my = (await Z("pro/teams", undefined, "p2")).j.items[0]; r = await Z("pro/teams/" + my.id + "/accept", {}, "p2");
ok(r.status === 409 && q1("SELECT count(*) n FROM biz_bookings WHERE pro_id=? AND project_id=?", p2, T1.id).n === 0, "a conflict on day 2 → acceptance refused and day 1 is NOT left booked (all-or-nothing)");
env.XRAY_DB.db.prepare("DELETE FROM biz_bookings WHERE id='bkX'").run();
let thr = null; try { env.XRAY_DB.db.prepare("INSERT INTO biz_bookings (id, pro_id, project_id, day, created_at, slot) VALUES ('bkY', ?, 'pjZ', ?, ?, '')").run(proId, D1, "x"); } catch (e) { thr = e; } ok(thr, "the database itself refuses a second whole-day booking for the same Pro and day");
/* decline → reopen; expiry */
r = await Z("pro/teams/" + my.id + "/decline", { reason: "Another shoot" }, "p2"); ok(r.j.items[0].status === "declined", "the producer declines");
r = await Z("admin/teams/" + T1.id, undefined, "own"); TD = r.j; ok(sl("Producer").status === "open" && TD.history.some((h) => h.status === "declined" && /Another shoot/.test(h.note || "")), "the slot is open again; the decline and its reason are kept");
r = await Z("notes", undefined, "own"); ok(r.j.items.some((n) => /declined Producer/.test(n.text)), "owners are told");
await Z("admin/teams/" + T1.id + "/invite", { slot: sl("Editor").slot, proId: p4 }, "own");
env.XRAY_DB.db.prepare("UPDATE biz_team_members SET expires_at='2020-01-01T00:00:00Z' WHERE pro_id=? AND status='invited'").run(p4);
const TMm = await import("../functions/_lib/teams.js"); ok(await TMm.expireDue(env) === 1, "an unanswered invitation expires");
r = await Z("admin/teams/" + T1.id, undefined, "own"); TD = r.j; ok(sl("Editor").status === "open" && TD.history.some((h) => h.status === "expired"), "…its slot reopens");
r = await Z("pro/teams", undefined, "p4"); my = r.j.items.find((x) => x.status === "expired"); r = await Z("pro/teams/" + my.id + "/accept", {}, "p4"); ok(r.status === 409 && /expired/.test(r.j.reason), "an expired invitation can't be accepted");
/* auto-replacement */
await Z("admin/pricing", { teamAutoInvite: true, reason: "Try auto replacement" }, "own");
await Z("admin/teams/" + T1.id + "/invite", { slot: sl("Producer").slot, proId: p2 }, "own"); my = (await Z("pro/teams", undefined, "p2")).j.items.find((x) => x.status === "invited");
const before = q1("SELECT count(*) n FROM biz_team_members WHERE team_id=? AND status='invited'", T1.id).n;
await Z("pro/teams/" + my.id + "/decline", { reason: "busy" }, "p2"); r = await Z("admin/teams/" + T1.id, undefined, "own"); TD = r.j;
ok(sl("Producer").status === "open", "auto-replacement only invites someone who is available and fits the role (no other producer → stays open)");
await Z("admin/pricing", { teamAutoInvite: false, reason: "off" }, "own");
/* fill the team, lock */
await Z("admin/catalog/roles", { id: "producer", match: ["Producer", "Video Editor"], reason: "editors can produce small shoots" }, "own");
r = await Z("admin/teams/" + T1.id + "/invite", { slot: sl("Producer").slot, proId: p4 }, "own"); r = await Z("admin/teams/" + T1.id + "/lock", {}, "own"); ok(r.status === 409, "lock needs every slot accepted");
my = (await Z("pro/teams", undefined, "p4")).j.items.find((x) => x.status === "invited"); await Z("pro/teams/" + my.id + "/accept", {}, "p4");
r = await Z("admin/teams/" + T1.id, undefined, "own"); TD = r.j; await Z("admin/teams/" + T1.id + "/invite", { slot: sl("Editor").slot, proId: p3 }, "own");
my = (await Z("pro/teams", undefined, "p3")).j.items.find((x) => x.status === "invited"); await Z("pro/teams/" + my.id + "/accept", {}, "p3");
r = await Z("admin/teams/" + T1.id, undefined, "own"); TD = r.j; ok(TD.team.status === "confirmed" && TD.slots.every((s) => s.status === "accepted"), "everyone accepted → confirmed");
r = await Z("admin/teams/" + T1.id + "/lock", {}, "own"); ok(r.j.team.status === "locked", "the team is locked");
r = await Z("notes", undefined, "c"); ok(r.j.items.some((n) => /confirmed and locked \(3 people\)/.test(n.text)), "the client is told");
r = await Z("quotes/" + T1q.q.id + "/team"); ok(r.j.team.confirmed === 3 && r.j.team.locked && r.j.team.people.some((x) => x.name === "Aarav Films"), "client sees the 3 confirmed people (names, roles)");
r = await Z("admin/teams/" + T1.id + "/invite", { slot: 1, proId: p5 }, "own"); ok(r.status === 409, "no invitations into a locked team");
const ed = TD.slots.find((s) => s.pro && s.pro.id === p3); r = await Z("admin/teams/" + T1.id + "/remove", { memberId: ed.id }, "own"); ok(r.status === 400, "removing someone from a locked team needs a reason (never silent)");
/* date change */
await Z("pro/blackout", { day: day(20), on: true }, "p");
r = await Z("admin/teams/" + T1.id + "/change_date", { startDay: day(19), days: 2 }, "own"); ok(r.status === 400, "a date change needs a reason");
r = await Z("admin/teams/" + T1.id + "/change_date", { startDay: day(19), days: 2, reason: "Client moved the launch" }, "own"); TD = r.j;
ok(sl("DOP").status === "conflict" && TD.conflicts.some((c) => /Aarav/.test(c)) && TD.team.status === "partially_confirmed", "new dates: Aarav blocked day 20 → flagged 'conflict', team no longer locked");
ok(q1("SELECT count(*) n FROM biz_bookings WHERE project_id=? AND day IN (?,?)", T1.id, D1, day(13)).n === 0 && q1("SELECT count(*) n FROM biz_bookings WHERE project_id=? AND pro_id=? AND day=?", T1.id, p4, day(19)).n === 1, "old days released for everyone, others re-booked on the new dates (nothing stale)");
ok(TD.equipment.some((h) => h.status === "moved") && TD.equipment.some((h) => h.status === "held" && h.from === day(18)), "equipment re-reserved for the new dates");
r = await Z("notes", undefined, "p4"); ok(r.j.items.some((n) => /New dates for/.test(n.text)), "re-booked Pros are told");
r = await Z("admin/teams/" + T1.id + "/replace", { memberId: sl("DOP").id, proId: p5, reason: "Aarav can't make the new dates" }, "own"); ok(r.j.ok && r.j.slots.find((s) => /DOP/.test(s.role)).status === "invited" && r.j.slots.find((s) => /DOP/.test(s.role)).pro.name === "Arjun Frames" && r.j.history.some((h) => h.status === "removed" && h.pro === "Aarav Films"), "replace the DOP who can't make it: Arjun invited, Aarav removed (kept in history)");
r = await Z("notes", undefined, "p"); ok(r.j.items.some((n) => /removed you from/.test(n.text) && /free again/.test(n.text)), "the replaced Pro is told, with the reason");
/* availability rules */
r = await Z("pro/availability", { maxWeek: 1, travelBuffer: 1, horizonDays: 30, overrides: [day(40)], tz: "Asia/Kolkata", hoursStart: "10:00", hoursEnd: "19:00" }, "p3"); ok(r.j.rules.maxWeek === 1 && r.j.rules.travelBuffer === 1 && r.j.rules.hours === "10:00–19:00", "Pro saves availability rules");
r = await Z("pro/availability", { tz: "Mars/Olympus" }, "p3"); ok(r.status === 400, "unknown timezone refused");
r = await Z("pro/availability", { hoursStart: "19:00", hoursEnd: "10:00" }, "p3"); ok(r.status === 400, "hours must make sense");
const AV = await import("../functions/_lib/availability.js"), P3 = q1("SELECT * FROM biz_pros WHERE id=?", p3), dd = env.XRAY_DB;
let f = await AV.proFree(dd, P3, [day(45)], {}); ok(!f.ok && /further ahead/.test(f.why[0]), "horizon: 30 days ahead at most");
const BU = q1("SELECT day FROM biz_bookings WHERE pro_id=? ORDER BY day LIMIT 1", p3); ok(BU && BU.day === day(19), "the Mumbai DOP is booked on the new date (Delhi shoot)");
f = await AV.proFree(dd, P3, [day(21)], { city: "Delhi" }); ok(!f.ok && f.why.some((w) => /more than 1 booked days/.test(w) || /travel day/.test(w)), "max 1 booked day per week / travel buffer next to an out-of-town booking");
f = await AV.proFree(dd, P3, [day(26)], { city: "Mumbai" }); ok(f.ok || f.why.every((w) => !/travel/.test(w)), "in their own city no travel buffer is needed");
env.XRAY_DB.db.prepare("UPDATE biz_pros SET days=? WHERE id=?").run(JSON.stringify(["mon"]), p5); const P5 = q1("SELECT * FROM biz_pros WHERE id=?", p5);
const off = [...Array(7).keys()].map((i) => day(30 + i)).find((x) => new Date(x + "T00:00:00Z").getUTCDay() !== 1); f = await AV.proFree(dd, P5, [off], {}); ok(!f.ok && /working day/.test(f.why[0]), "a day off isn't bookable…");
env.XRAY_DB.db.prepare("UPDATE biz_pros SET overrides=? WHERE id=?").run(JSON.stringify([off]), p5); f = await AV.proFree(dd, q1("SELECT * FROM biz_pros WHERE id=?", p5), [off], {}); ok(f.ok, "…unless it's an extra working day (override)");
r = await Z("builder/match", { roleId: "dop", date: day(19), city: "Delhi" }); ok(r.j.items.find((x) => x.pro.name === "Kabir Lens").available === false, "matching uses the same availability engine");
/* equipment board + maintenance */
r = await Z("admin/equipment", undefined, "own"); ok(r.j.items.find((e) => e.id === "fx6").unit_days === 4 && r.j.holds.some((h) => h.status === "held"), "equipment calendar: FX6 4 unit-days reserved");
r = await Z("admin/equipment/block", { equipmentId: "fx6", from: day(18), to: day(18), reason: "service" }, "own"); ok(r.status === 409, "can't block a unit that is reserved");
r = await Z("admin/equipment/block", { equipmentId: "fx6", from: day(50), to: day(52), reason: "sensor clean" }, "own"); ok(r.j.hold.status === "maintenance", "maintenance block on free days");
r = await Z("admin/equipment/block", { equipmentId: "gimbal", from: day(50), to: day(52) }, "own"); ok(r.status === 400, "items without a tracked inventory can't be blocked");
r = await Z("admin/equipment/release/" + q1("SELECT id FROM biz_equipment_holds WHERE status='maintenance'").id, {}, "own"); ok(r.j.ok && !q1("SELECT 1 x FROM biz_equipment_days WHERE day=?", day(51)), "unblock frees the units");
r = await Z("admin/teams/" + T2.id + "/equipment_retry", { holdId: q1("SELECT id FROM biz_equipment_holds WHERE team_id=? AND status='unavailable'", T2.id).id }, "own"); ok(r.j.equipment.some((h) => h.status === "held"), "after T1 moved, T2's FX6 can be reserved again");
/* cancel releases everything */
r = await Z("admin/teams/" + T2.id + "/cancel", { reason: "Client cancelled" }, "own"); ok(r.j.team.status === "cancelled" && !q1("SELECT 1 x FROM biz_bookings WHERE project_id=?", T2.id) && !q1("SELECT 1 x FROM biz_equipment_days d JOIN biz_equipment_holds h ON h.id=d.hold_id WHERE h.team_id=?", T2.id), "cancelling releases every Pro day and equipment unit");
/* reminders + scheduler */
env.XRAY_DB.db.prepare("UPDATE biz_teams SET status='locked', start_day=? WHERE id=?").run(day(1), T1.id); ok(await TMm.remindDue(env) === 1 && await TMm.remindDue(env) === 0, "day-before reminder, sent once");
r = await Z("notes", undefined, "c"); ok(r.j.items.some((n) => /starts tomorrow/.test(n.text)), "client reminded");
const tick = await import("../functions/api/monitor/tick.js"); ok(/teams/.test(tick.onRequest.toString() + fs.readFileSync("functions/api/monitor/tick.js", "utf8")), "the scheduler runs invitation expiry + reminders");
/* audit, UI, Brain */
ok(q1("SELECT count(*) n FROM biz_audit WHERE action LIKE 'team:%'").n >= 10, "team actions are audited");
const WS = fs.readFileSync("js/workspace.js", "utf8"), TJ = fs.readFileSync("js/ws-teams.js", "utf8"), BJ = fs.readFileSync("js/ws-builder.js", "utf8");
ok(/pro-teams/.test(WS) && /ws-teams\.js/.test(WS) && /"teams"/.test(WS) && /pro\/teams/.test(TJ) && /admin\/teams/.test(TJ) && /pro\/availability/.test(TJ) && /admin\/equipment/.test(TJ) && /clientTeam/.test(BJ), "UI: Team invitations (Pro), availability rules, admin Teams + equipment calendar, client team status (lazy)");
const { TOOLS: TL } = await import("../functions/_lib/brain/tools.js"), bctx = { env, owner: { email: "anmol@fodo.co.in", id: q1("SELECT id FROM acct_users WHERE email='anmol@fodo.co.in'").id } };
ok(TL.marketplace_teams.level === 0 && TL.marketplace_team_detail.level === 0 && TL.marketplace_capacity.level === 0 && TL.marketplace_team_invite.level === 2, "Brain: teams, team detail, capacity (read-only), invite needs confirmation");
let bt = await TL.marketplace_teams.run(bctx, {}); ok(bt.items.length === 2 && bt.items.some((t) => t.status === "cancelled"), "Brain lists teams");
bt = await TL.marketplace_team_detail.run(bctx, { id: T1.id }); ok(bt.slots.length === 3 && bt.recent.length, "Brain: team detail with activity");
bt = await TL.marketplace_capacity.run(bctx, {}); ok(bt.busiestPros.length >= 1 && bt.equipment.some((e) => e.item === "Sony FX6 kit"), "Brain: who is busiest, equipment utilisation");
ok(all.every((t) => !/cf_SECRET_key/.test(t)), "no secrets in any answer");
console.log("\nv47.2: " + pass + " passed, " + fail + " failed"); if (fail) process.exit(1);
