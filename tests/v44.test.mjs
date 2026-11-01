// v44: Projects 2.0: time slots, hourly + retainer projects, change requests, tasks, team projects (several pros), refunds.
// Run: node --no-warnings tests/v44.test.mjs
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as admin } from "../functions/api/admin/[[path]].js";
import { onRequest as xray } from "../functions/api/xray/[[path]].js";
import { onRequest as brain } from "../functions/api/owner-brain/[[path]].js";
import { onRequest as bizApi } from "../functions/api/biz/[[path]].js";
import { fundMilestone, cleanSlots, milestoneForCheckout } from "../functions/_lib/biz.js";
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
const calls = []; let rzpRefundStatus = "processed";
globalThis.fetch = async (u, o = {}) => { u = String(u); const J = (x, s) => new Response(JSON.stringify(x), { status: s || 200, headers: { "content-type": "application/json" } });
  if (/cashfree\.com\/pg\/orders\/[^/]+\/refunds/.test(u)) { const b = JSON.parse(o.body); calls.push({ p: "cf", u, b, idem: o.headers["x-idempotency-key"] }); return J({ cf_refund_id: 778899, refund_id: b.refund_id, refund_status: "PENDING", refund_amount: b.refund_amount }); }
  if (/api\.razorpay\.com\/v1\/orders\/order_RZ1\/payments/.test(u)) return J({ items: [{ id: "pay_FAILED1", status: "failed" }, { id: "pay_CAPT1", status: "captured" }] });
  if (/api\.razorpay\.com\/v1\/payments\/pay_CAPT1\/refund/.test(u)) { calls.push({ p: "rzp", u, b: JSON.parse(o.body) }); return J({ id: "rfnd_TEST1", status: rzpRefundStatus }); }
  return new Response("x", { status: 599 }); };
const KV = new Map(), CHAT_KV = { get: async (k) => KV.get(k) || null, put: async (k, v) => { KV.set(k, v); }, getWithMetadata: async (k) => ({ value: KV.get(k) || null, metadata: null }), delete: async (k) => KV.delete(k), list: async () => ({ keys: [] }) };
const env = { XRAY_DB: d1(), CHAT_KV, ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", MAIL_FROM: "FODO <hello@fodo.co.in>" };
H.biz = bizApi;
const Z = (p, body, who, o) => call("biz/" + p, body, Object.assign({ as: who || "c" }, o || {}));
const A = (pid, act, body, who) => Z("projects/" + pid + "/" + act, body || {}, who);
const P = async (pid, who) => (await Z("projects/" + pid, undefined, who || "c")).j.project;
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10), today = day(0);
const order = (id, amount, rz) => env.XRAY_DB.db.prepare("INSERT INTO acct_orders (order_id, user_id, kind, item, amount, status, cf_order_id, created_at, paid_at) VALUES (?,?,?,?,?,?,?,?,?)").run(id, "u", "milestone", "x", amount, "PAID", rz || "12345", today, today);
const fund = async (m, oid, rz) => { if (oid) order(oid, m.amount, rz); return fundMilestone(env, m.id, oid || "test_" + m.id); };

await login("anmol@fodo.co.in", null, "own"); await login("client@biz.in", null, "c"); await login("pro@studio.in", null, "p"); await login("pro2@edit.in", null, "p2"); await login("other@biz.in", null, "o"); await login("fin@fodo.co.in", null, "fin"); await login("c2@biz.in", null, "c2");
await Z("admin/staff", { email: "fin@fodo.co.in", role: "finance" }, "own");
const mkPro = async (who, name, role) => { const inv = (await Z("admin/invites", { note: name, maxUses: 1 }, "own")).j.token;
  await Z("pro", { invite: inv, name, role, skills: "reels", city: "Delhi", onsite: true, langs: "Hindi", bio: "Professional for restaurants and cafes in Delhi NCR. Short-form reels and brand films.", days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], rateDay: 18000, terms: true }, who);
  await Z("pro/packages", { name: "Pack", price: 15000 }, who); await Z("pro/portfolio", { kind: "video", title: "Film", url: "https://vimeo.com/1" }, who); await Z("pro/submit", {}, who);
  const id = (await Z("pro", undefined, who)).j.pro.id; await Z("admin/pros/" + id, { action: "approve" }, "own"); return id; };
const pro1 = await mkPro("p", "Aarav Films", "Cinematographer"), pro2 = await mkPro("p2", "Cut Studio", "Video Editor");

/* ---------- 1. time slots ---------- */
ok(cleanSlots(["09:00-13:00", "12:00-15:00", "14:00-18:00", "25:00-26:00", "18:00-17:00", "x"]).join() === "09:00-13:00,14:00-18:00", "slots: valid, sorted, no overlaps");
let r = await Z("pro/slots", { slots: ["14:00-18:00", "09:00-13:00"] }, "p"); ok(r.j.ok && r.j.slots.join() === "09:00-13:00,14:00-18:00", "pro saves time slots");
ok((await Z("pro", undefined, "p")).j.pro.status === "approved", "saving slots doesn't send the profile back to review");
const D = day(5);
r = await Z("projects", { proId: pro1, title: "Morning shoot", brief: "Breakfast menu photos please", day: D, slot: "10:00-11:00" }, "c"); ok(r.status === 400, "a slot that isn't the pro's is refused");
r = await Z("projects", { proId: pro1, title: "Morning shoot", brief: "Breakfast menu photos please", day: D, slot: "09:00-13:00" }, "c"); const sA = r.j.project.id; ok(r.j.ok && r.j.project.slot === "09:00-13:00", "request a morning slot");
await A(sA, "propose", { milestones: [{ title: "Shoot", amount: 5000 }] }, "p"); r = await A(sA, "accept"); ok(r.j.project.status === "accepted", "accepted → the slot is booked");
r = await Z("market/" + pro1, undefined, "o"); ok(r.j.pro.bookedSlots.some((b) => b.day === D && b.slot === "09:00-13:00") && r.j.pro.booked.indexOf(D) < 0, "the profile shows the booked slot (day still open)");
r = await Z("projects", { proId: pro1, title: "Whole day", brief: "Full day event coverage", day: D }, "o"); ok(r.status === 409, "a whole-day request on a day with a booked slot is refused");
r = await Z("projects", { proId: pro1, title: "Same slot", brief: "Another morning shoot", day: D, slot: "09:00-13:00" }, "o"); ok(r.status === 409, "the same slot can't be requested again");
r = await Z("projects", { proId: pro1, title: "Afternoon", brief: "Afternoon reels for the cafe", day: D, slot: "14:00-18:00" }, "c2"); const sB = r.j.project.id; await A(sB, "propose", { milestones: [{ title: "Reels", amount: 6000 }] }, "p"); r = await A(sB, "accept", {}, "c2");
ok(r.j.project.status === "accepted", "the afternoon slot on the same day can be booked");
const D2 = day(6); r = await Z("projects", { proId: pro1, title: "Full day", brief: "Wedding shoot, all day", day: D2 }, "o"); const sC = r.j.project.id; r = await Z("projects", { proId: pro1, title: "Slot", brief: "Small shoot in the morning", day: D2, slot: "09:00-13:00" }, "c2"); const sD = r.j.project.id;
await A(sC, "propose", { milestones: [{ title: "Day", amount: 9000 }] }, "p"); await A(sD, "propose", { milestones: [{ title: "Slot", amount: 3000 }] }, "p");
r = await A(sC, "accept", {}, "o"); ok(r.j.ok, "whole day accepted"); r = await A(sD, "accept", {}, "c2"); ok(r.status === 409 && /booked/.test(r.j.reason), "…then a slot that day can't be accepted (no double booking)");
r = await Z("pro/dashboard", undefined, "p"); ok(r.j.bookings.filter((b) => b.day === D).length === 2 && r.j.slots.length === 2, "pro calendar data lists both slot bookings");

/* ---------- 2. hourly project ---------- */
r = await Z("projects", { proId: pro1, title: "Social media help", brief: "Ongoing editing help, billed hourly" }, "c"); const H1 = r.j.project.id;
r = await A(H1, "propose", { mode: "hourly", rate: 50, milestones: [] }, "p"); ok(r.status === 400, "hourly needs a rate of ₹100+");
r = await A(H1, "propose", { mode: "hourly", rate: 2000, cap: 6, milestones: [] }, "p"); ok(r.j.ok && r.j.project.mode === "hourly" && r.j.project.rate === 2000 && r.j.project.cap === 6 && r.j.project.status === "proposed", "hourly proposal: ₹2,000/h, max 6 h, no milestones needed");
r = await A(H1, "time_add", { day: today, hours: 2 }, "p"); ok(r.status === 409, "no time logging before the client accepts");
await A(H1, "accept"); r = await A(H1, "time_add", { day: today, hours: 3, note: "Edited 3 reels" }, "p"); ok(r.j.ok && r.j.project.time.length === 1 && r.j.project.status === "in_progress", "lead pro logs 3 h → in progress");
r = await A(H1, "time_add", { day: day(2), hours: 1 }, "p"); ok(r.status === 400, "no time in the future");
r = await A(H1, "time_add", { day: today, hours: 4 }, "p"); ok(r.status === 409 && /6 hours/.test(r.j.reason), "can't go over the agreed hours");
r = await A(H1, "time_add", { day: today, hours: 2.5 }, "p"); r = await A(H1, "time_add", { day: today, hours: 1 }, "c"); ok(r.status === 403, "the client can't log the pro's time");
r = await A(H1, "time_bill", {}, "p"); const hm = r.j.project.milestones.find((m) => m.kind === "hours"); ok(hm && hm.amount === 11000 && /5\.5 h/.test(hm.title) && r.j.project.time.every((t) => t.status === "billed"), "bill: 5.5 h × ₹2,000 = ₹11,000 (from the database)");
r = await A(H1, "time_bill", {}, "p"); ok(r.status === 409, "nothing left to bill");
r = await A(H1, "complete"); ok(r.status === 409, "can't complete with an unpaid bill");
await fund(hm); let pj = await P(H1); ok(pj.milestones.find((m) => m.id === hm.id).status === "submitted", "paid hours count as delivered work, waiting for the client's approval");
r = await A(H1, "approve", { milestoneId: hm.id }); ok(r.j.ok, "client approves the hours");
r = await A(H1, "complete"); ok(r.j.ok && r.j.project.status === "completed", "client completes the hourly project");
r = await Z("pro/earnings", undefined, "p"); ok(r.j.items.some((x) => x.gross === 11000), "the pro's payout is for the billed amount");

/* ---------- 3. retainer ---------- */
r = await Z("projects", { proId: pro1, title: "Monthly content", brief: "Monthly reels retainer for the cafe" }, "c"); const R1 = r.j.project.id;
r = await A(R1, "propose", { mode: "retainer", rate: 30000, cap: 2, milestones: [] }, "p"); const rm1 = r.j.project.milestones.find((m) => m.kind === "retainer"); ok(rm1 && rm1.amount === 30000 && /Retainer: /.test(rm1.title), "retainer proposal creates the first month (₹30,000)");
await A(R1, "accept"); r = await A(R1, "retainer_next"); ok(r.status === 409 && /first/.test(r.j.reason), "next month only after this month is approved");
await fund(rm1); await A(R1, "submit", { milestoneId: rm1.id, note: "8 reels delivered" }, "p"); await A(R1, "approve", { milestoneId: rm1.id });
r = await A(R1, "retainer_next", {}, "p"); const rms = r.j.project.milestones.filter((m) => m.kind === "retainer"); ok(rms.length === 2 && rms[1].period > rms[0].period && rms[1].amount === 30000, "lead pro adds the next month (same fee, next period)");
await fund(rms[1]); await A(R1, "submit", { milestoneId: rms[1].id }, "p"); await A(R1, "approve", { milestoneId: rms[1].id });
r = await A(R1, "retainer_next"); ok(r.status === 409 && /2 months/.test(r.j.reason), "the agreed number of months is respected");
r = await A(R1, "retainer_next", {}, "o"); ok(r.status === 404, "outsiders can't touch it");

/* ---------- 4. change requests + tasks (fixed project) ---------- */
r = await Z("projects", { proId: pro1, title: "Launch film", brief: "A 60 second launch film for the cafe" }, "c"); const F1 = r.j.project.id;
await A(F1, "propose", { milestones: [{ title: "Shoot", amount: 9000 }, { title: "Edit", amount: 6000 }] }, "p");
r = await A(F1, "change_add", { title: "Extra reel", amount: 3000 }, "p"); ok(r.status === 409, "change requests start after acceptance");
await A(F1, "accept"); r = await A(F1, "change_add", { title: "2 extra reels", detail: "Vertical cuts for Instagram", amount: 5000, days: 3 }, "p"); const ch1 = r.j.project.changes[0]; ok(r.j.ok && ch1.status === "open" && ch1.amount === 5000, "pro proposes a paid change (+₹5,000, +3 days)");
r = await A(F1, "change_answer", { changeId: ch1.id, accept: true }, "p"); ok(r.status === 403, "the author can't accept their own change");
r = await A(F1, "change_add", { title: "Bad", amount: 50 }, "p"); ok(r.status === 400, "an extra amount must be ₹100+");
r = await A(F1, "change_answer", { changeId: ch1.id, accept: true }); const cm = r.j.project.milestones.find((m) => m.kind === "change"); ok(cm && cm.amount === 5000 && cm.status === "pending" && r.j.project.budget === 20000 && r.j.project.changes[0].status === "accepted", "client accepts → new ₹5,000 milestone, budget ₹20,000");
r = await A(F1, "change_answer", { changeId: ch1.id, accept: true }); ok(r.status === 409, "a decided change can't be answered twice");
r = await A(F1, "change_add", { title: "Use our own music", amount: 0 }); const ch2 = r.j.project.changes.find((c) => c.title === "Use our own music"); r = await A(F1, "change_answer", { changeId: ch2.id, accept: false }, "p"); ok(r.j.project.changes.find((c) => c.id === ch2.id).status === "declined" && !r.j.project.milestones.some((m) => /music/.test(m.title)), "pro declines the client's change (no milestone)");
r = await A(F1, "change_add", { title: "Withdraw me" }); const ch3 = r.j.project.changes.find((c) => c.title === "Withdraw me"); r = await A(F1, "change_withdraw", { changeId: ch3.id }, "p"); ok(r.status === 403, "only the author withdraws"); r = await A(F1, "change_withdraw", { changeId: ch3.id }); ok(r.j.project.changes.find((c) => c.id === ch3.id).status === "withdrawn", "author withdraws");
r = await A(F1, "task_add", { title: "Send logo files", who: "client", due: day(2) }); const tk = r.j.project.tasks[0]; ok(r.j.ok && tk.status === "todo" && tk.who === "client", "client adds a task");
r = await A(F1, "task_set", { taskId: tk.id, status: "done", title: "Hacked" }, "p"); const tk2 = r.j.project.tasks.find((t) => t.id === tk.id); ok(tk2.status === "done" && tk2.title === "Send logo files", "pro ticks it off (can't rename someone else's task)");
r = await A(F1, "task_del", { taskId: tk.id }, "p"); ok(r.status === 403, "only the author deletes a task"); r = await A(F1, "task_add", { title: "x" }, "own"); ok(r.status === 403 || r.status === 404, "staff can't add tasks");
r = await A(F1, "task_add", { title: "Nope" }, "o"); ok(r.status === 404, "outsiders get 404");

/* ---------- 5. team project ---------- */
r = await A(F1, "add_pro", { proId: pro2, role: "Editor" }, "p"); ok(r.status === 403, "only the client builds the team");
r = await A(F1, "add_pro", { proId: pro1 }); ok(r.status === 409, "the lead is already on it");
r = await A(F1, "add_pro", { proId: pro2, role: "Editor" }); ok(r.j.ok && r.j.project.team.length === 2 && r.j.project.team[1].status === "invited", "client invites a second professional");
pj = await P(F1, "p2"); ok(pj.side === "invited" && /60 second/.test(pj.brief) && !pj.milestones.length && !pj.messages.length && pj.invitedRole === "Editor", "the invited pro sees only the brief");
r = await A(F1, "message", { body: "hi" }, "p2"); ok(r.status === 403, "no chat before joining");
r = await Z("projects", undefined, "p2"); ok(r.j.items.some((x) => x.id === F1), "the invitation shows in their project list");
r = await Z("pro/dashboard", undefined, "p2"); ok(r.j.counts.invites === 1 && r.j.next.some((n) => /Team invitation/.test(n.text)), "…and as a Next action on their dashboard");
r = await A(F1, "member_answer", { accept: true }, "p2"); ok(r.j.project.side === "pro" && r.j.project.lead === false && r.j.project.team[1].status === "accepted", "they join");
r = await A(F1, "propose", { mode: "hourly", rate: 9999, milestones: [{ title: "Colour grade", amount: 4000 }] }, "p2"); const pm = r.j.project.milestones.find((m) => m.title === "Colour grade"); ok(pm && pm.status === "proposed" && pm.mine && r.j.project.mode === "fixed", "team member proposes their own milestone (can't change the pricing mode)");
r = await A(F1, "propose", { milestones: [{ title: "Shoot", amount: 1 }] }, "p2"); ok(r.status === 400, "milestone amounts are validated for members too");
let thrown = null; try { await milestoneForCheckout(env, (await Z("me", undefined, "c")).j.user, pm.id); } catch (e) { thrown = e; } ok(thrown && thrown.status === 409, "a proposed (not accepted) milestone can't be paid");
r = await A(F1, "accept_member", { proId: pro2 }); ok(r.j.project.milestones.find((m) => m.id === pm.id).status === "pending", "client accepts the member's milestone");
await fund(pm); r = await A(F1, "submit", { milestoneId: pm.id }, "p"); ok(r.status === 403, "the lead can't submit the member's milestone");
r = await A(F1, "submit", { milestoneId: pm.id, note: "Graded" }, "p2"); ok(r.j.ok, "the member submits their own work");
await A(F1, "approve", { milestoneId: pm.id }); r = await Z("pro/earnings", undefined, "p2"); ok(r.j.items.length === 1 && r.j.items[0].gross === 4000, "the payout goes to the member, not the lead");
r = await A(F1, "remove_pro", { proId: pro2 }); ok(r.status === 409, "a member with paid work can't be removed");
r = await A(F1, "message", { body: "Hello team" }, "p2"); const msg = r.j.project.messages.pop(); ok(msg.name === "Cut Studio" && msg.mine && !("user_id" in msg), "team chat shows names (never user ids)");

/* ---------- 6. refunds ---------- */
let pj1 = await P(F1); const shoot = pj1.milestones.find((m) => m.title === "Shoot"), edit = pj1.milestones.find((m) => m.title === "Edit");
r = await A(F1, "refund_request", { milestoneId: shoot.id, reason: "x" }); ok(r.status === 409, "an unpaid milestone can't be refunded");
await fund(shoot, "ord_cf_1"); r = await A(F1, "refund_request", { milestoneId: shoot.id, reason: "no" }); ok(r.status === 400, "the client says why");
r = await A(F1, "refund_request", { milestoneId: shoot.id, reason: "The shoot date fell through" }); const rf1 = r.j.project.refunds[0]; ok(rf1.status === "requested", "client asks for a refund");
r = await A(F1, "refund_request", { milestoneId: shoot.id, reason: "again please" }); ok(r.status === 409, "one open refund per milestone");
r = await A(F1, "refund_answer", { refundId: rf1.id, accept: true }, "p2"); ok(r.status === 403, "another team member can't accept it");
r = await A(F1, "refund_answer", { refundId: rf1.id, accept: false }, "p"); ok(r.j.project.refunds[0].status === "declined" && r.j.project.milestones.find((m) => m.id === shoot.id).status === "funded", "the pro declines (money stays in escrow)");
r = await A(F1, "refund_request", { milestoneId: shoot.id, reason: "Please, the date fell through" }); const rf2 = r.j.project.refunds[0];
r = await A(F1, "refund_answer", { refundId: rf2.id, accept: true }, "p"); let rfd = r.j.project.refunds.find((x) => x.id === rf2.id); ok(rfd.status === "needs_manual" && r.j.project.milestones.find((m) => m.id === shoot.id).status === "refunded", "no gateway connected → refund approved, waiting for FODO finance (never shown as refunded)");
r = await A(F1, "refund_manual", { refundId: rf2.id, ref: "UTR998877" }, "c"); ok(r.status === 403, "only finance marks it sent");
r = await A(F1, "refund_manual", { refundId: rf2.id, ref: "UTR998877" }, "fin"); ok(r.j.project.refunds.find((x) => x.id === rf2.id).status === "refunded", "finance records the refund reference → Refunded");
/* with Cashfree */
env.CASHFREE_APP_ID = "CFAPP"; env.CASHFREE_SECRET_KEY = "cf_SECRET_key"; await fund(edit, "ord_cf_2");
r = await A(F1, "refund_request", { milestoneId: edit.id }, "p"); rfd = r.j.project.refunds[0]; const c1 = calls.find((x) => x.p === "cf");
ok(c1 && c1.b.refund_amount === 6000 && /ord_cf_2\/refunds/.test(c1.u) && c1.idem === rfd.id && rfd.status === "processing" && rfd.provider === "cashfree", "the pro refunds directly → Cashfree refund for exactly ₹6,000 (idempotent), shown as 'processing'");
/* partial refund by FODO (Razorpay) */
r = await Z("projects", { proId: pro1, title: "Dispute me", brief: "A project that goes wrong" }, "c"); const X1 = r.j.project.id; await A(X1, "propose", { milestones: [{ title: "Work", amount: 9000 }] }, "p"); await A(X1, "accept");
const wm = (await P(X1)).milestones[0]; env.RAZORPAY_KEY_ID = "rzp_test_K"; env.RAZORPAY_KEY_SECRET = "rzp_SECRET"; await fund(wm, "ord_rz_1", "order_RZ1");
await A(X1, "dispute", { reason: "Half the work is missing" });
r = await A(X1, "refund_process", { milestoneId: wm.id, amount: 4000 }, "c"); ok(r.status === 403, "clients can't force a refund");
r = await A(X1, "refund_process", { milestoneId: wm.id, amount: 99999 }, "fin"); ok(r.status === 400, "a refund can't exceed what was paid");
r = await A(X1, "refund_process", { milestoneId: wm.id, amount: 4000, reason: "Half delivered" }, "fin"); const c2 = calls.find((x) => x.p === "rzp"); rfd = r.j.project.refunds[0];
ok(c2 && c2.b.amount === 400000 && rfd.status === "refunded" && rfd.provider === "razorpay", "finance: partial refund ₹4,000 through Razorpay (captured payment, in paise)");
r = await Z("pro/earnings", undefined, "p"); ok(r.j.items.some((x) => x.gross === 5000), "…and the remaining ₹5,000 becomes the pro's payout");
r = await A(X1, "refund_process", { milestoneId: wm.id }, "fin"); ok(r.status === 409, "a milestone can't be refunded twice");
r = await Z("admin/refunds", undefined, "fin"); ok(r.j.ok && r.j.items.length === 4 && r.j.items.filter((x) => x.status === "refunded").length === 2, "finance sees every refund (declined, refunded, processing)"); r = await Z("admin/refunds", undefined, "c"); ok(r.status === 403, "clients can't");
/* cancel after a full refund */
r = await Z("projects", { proId: pro1, title: "Cancel me", brief: "Plans changed for this one" }, "c"); const K1 = r.j.project.id; await A(K1, "propose", { milestones: [{ title: "Only", amount: 2000 }] }, "p"); await A(K1, "accept");
const km = (await P(K1)).milestones[0]; await fund(km); r = await A(K1, "cancel"); ok(r.status === 409, "can't cancel with money in it");
await A(K1, "refund_request", { milestoneId: km.id }, "p"); r = await A(K1, "cancel"); ok(r.j.project.status === "cancelled", "after the refund the project can be cancelled");

/* ---------- 7. old projects still work, nothing leaks ---------- */
pj = await P(sA); ok(pj.mode === "fixed" && pj.milestones.length === 1 && !("order_id" in pj.milestones[0]), "old-style fixed projects unchanged; payment order ids are not sent to the browser");
ok(!all.some((t) => /rzp_SECRET|cf_SECRET|pay_CAPT1/.test(t)), "no gateway secrets or payment ids in any answer");
const WS = fs.readFileSync(new URL("../js/workspace.js", import.meta.url), "utf8");
ok(/function p2\(/.test(WS) && /teamPicker/.test(WS) && /time_bill/.test(WS) && /retainer_next/.test(WS) && /change_add/.test(WS) && /task_add/.test(WS) && /refund_request/.test(WS) && /pro\/slots/.test(WS) && /hr-slot/.test(WS) && /member_answer/.test(WS), "workspace UI: team, time, retainer, change requests, tasks, refunds, slots, invitations");
console.log("\nv44: " + pass + " passed, " + fail + " failed"); if (fail) process.exit(1);
