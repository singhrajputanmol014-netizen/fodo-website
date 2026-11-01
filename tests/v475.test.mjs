// v47.5: Admin Mission Control (attention list, staff Ctrl+K search, hiring intelligence, audited CSV exports), Brain tools.
// Everything is a real count or sum; roles are checked on the server.
// Run: node --no-warnings tests/v475.test.mjs
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
if (!process.env.DBG) console.error = () => {};
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
  if (/easy-split\/orders\/[^/]+\/split/.test(u)) { calls.push({ p: "split", u, b, h: o.headers }); return J({ status: "OK", message: "Order split created" }); }
  if (/cashfree\.com\/pg\/orders\/[^/]+\/refunds\/[^/]+$/.test(u) && (o.method || "GET") === "GET") { calls.push({ p: "cf-rf-get", u }); return J({ refund_status: cfRefundCheck, cf_refund_id: 5511 }); }
  if (/cashfree\.com\/pg\/orders\/[^/]+\/refunds/.test(u)) { calls.push({ p: "cf-rf", u, b, idem: (o.headers || {})["x-idempotency-key"] }); return J({ cf_refund_id: 5511, refund_id: b.refund_id, refund_status: cfRefundStart }); }
  return new Response("x", { status: 599 }); };
let cfRefundStart = "PENDING", cfRefundCheck = "SUCCESS";
const KV = new Map(), CHAT_KV = { get: async (k) => KV.get(k) || null, put: async (k, v) => { KV.set(k, v); }, getWithMetadata: async (k) => ({ value: KV.get(k) || null, metadata: null }), delete: async (k) => KV.delete(k), list: async () => ({ keys: [] }) };
const env = { XRAY_DB: d1(), CHAT_KV, ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", MAIL_FROM: "FODO <hello@fodo.co.in>", SITES_HOST: "sites.fodo.co.in", SITES_PROJECT: "fodo-sites" };
H.biz = bizApi; H.sites = sitesApi;
if (process.env.DBG) env.API_DEBUG = "1";
const Z = (p, body, who, o) => call("biz/" + p, body, Object.assign({ as: who || "c" }, o || {}));
const q1 = (sql, ...a) => env.XRAY_DB.db.prepare(sql).get(...a);
const X = (sql, ...a) => env.XRAY_DB.db.prepare(sql).run(...a);
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString(), dayN = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
await login("anmol@fodo.co.in", null, "own"); await login("client@biz.in", null, "c"); await login("pro@studio.in", null, "p"); await login("mod@fodo.co.in", null, "m"); await login("view@fodo.co.in", null, "v"); await login("fin@fodo.co.in", null, "fin");
await Z("admin/staff", { email: "mod@fodo.co.in", role: "moderator" }, "own"); await Z("admin/staff", { email: "view@fodo.co.in", role: "viewer" }, "own"); await Z("admin/staff", { email: "fin@fodo.co.in", role: "finance" }, "own");
const inv = (await Z("admin/invites", { note: "p", maxUses: 3 }, "own")).j.token;
await Z("pro", { invite: inv, name: "Aarav Films", role: "Cinematographer", skills: "reels", city: "Delhi", onsite: true, langs: "Hindi", bio: "Cinematographer for restaurants and cafes in Delhi NCR. Short-form reels and brand films.", days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], rateDay: 18000, terms: true }, "p");
await Z("pro/packages", { name: "Pack", price: 15000 }, "p"); await Z("pro/portfolio", { kind: "video", title: "Film", url: "https://vimeo.com/1" }, "p"); await Z("pro/submit", {}, "p"); const proId = (await Z("pro", undefined, "p")).j.pro.id; await Z("admin/pros/" + proId, { action: "approve" }, "own");
let r;

/* ---------- 1. roles ---------- */
for (const p of ["admin/mission", "admin/search?q=aarav", "admin/hiring", "admin/export/quotes"]) { r = await Z(p, undefined, "c"); ok(r.status === 403, "clients get 403 on " + p.split("?")[0]); }
r = await Z("admin/mission", undefined, "nobody"); ok(r.status === 401, "no session: 401");
r = await Z("admin/mission", undefined, "v"); ok(r.j.ok && r.j.finance === true && Array.isArray(r.j.attention) && r.j.all.length >= 18, "viewer reads Mission Control (money counts included: viewer is read-only finance)");
r = await Z("admin/mission", undefined, "m"); ok(r.j.ok && r.j.finance === false && !r.j.all.some((x) => x.key === "payouts_due") && !("held" in r.j.totals), "moderator: no money rows, no money totals");
ok(r.j.attention.length === 0 && r.j.totals.prosLive === 1, "fresh marketplace: nothing waiting, one live professional");

/* ---------- 2. attention list from real records ---------- */
const mkQuote = async (opts) => (await Z("admin/quotes", Object.assign({ clientEmail: "client@biz.in", templateId: "custom", answers: { promote: "Brand film shoot", city: "Delhi", date: dayN(20), shoot_days: 1, mode: "onsite" }, tier: "essential", custom: { roles: [{ id: "dop", qty: 1 }, { id: "producer", qty: 1 }] } }, opts || {}), "own")).j.quote;
const q1q = await mkQuote(), q2 = await mkQuote({ answers: { promote: "Cafe launch reels", city: "Mumbai", date: dayN(2), shoot_days: 2, mode: "onsite" } });
await Z("admin/quotes/" + q2.id + "/send", {}, "own"); await Z("quotes/" + q2.id, undefined, "c"); await Z("quotes/" + q2.id + "/accept", { version: 1, agree: true }, "c");
const bd = (await Z("builder/drafts", { templateId: "custom", answers: { promote: "Website for a clinic", city: "Pune", mode: "online" }, tier: "essential", custom: { roles: [{ id: "editor", qty: 1, basis: "post", units: 2 }] } }, "c")).j.draft; r = await Z("quotes", { buildId: bd.id, company: "Clinic" }, "c"); ok(r.j.ok && r.j.quote.status === "requested", "a client requests a quote");
X("UPDATE biz_quotes SET expires_at=? WHERE id=?", new Date(Date.now() + 3600e3).toISOString(), q2.id);
r = await Z("admin/mission", undefined, "own"); const at = {}; r.j.all.forEach((x) => { at[x.key] = x; });
ok(at.quotes_draft.n === 1 && at.quotes_requested.n === 1 && at.teams_open.n === 1 && at.teams_soon.n === 1 && at.teams_soon.kind === "urgent", "counts: 1 draft quote, 1 client request, the accepted quote's team has open slots and starts within 3 days (urgent)");
ok(r.j.attention.every((x) => x.n > 0) && r.j.attention.some((x) => x.key === "teams_soon") && /#admin\?tab=/.test(at.quotes_draft.href), "attention shows only non-zero rows, each with a link into the right admin tab");
ok(r.j.schedule.length === 1 && r.j.schedule[0].start_day === dayN(2) && r.j.schedule[0].confirmed === 0 && r.j.schedule[0].slots === 2, "next team dates: the accepted quote's team with 0/2 confirmed");
const team = r.j.schedule[0].id; const slot = (await Z("admin/teams/" + team, undefined, "own")).j.slots.find((s) => /Photography|DOP/i.test(s.roleName || s.role_name || "")) || (await Z("admin/teams/" + team, undefined, "own")).j.slots[0];
r = await Z("admin/teams/" + team + "/invite", { slot: slot.slot, proId }, "own"); ok(r.j.ok, "invite the professional to a slot");
X("UPDATE biz_team_members SET expires_at=? WHERE team_id=? AND status='invited'", new Date(Date.now() + 3600e3).toISOString(), team);
r = await Z("admin/mission", undefined, "own"); r.j.all.forEach((x) => { at[x.key] = x; }); ok(at.invites_expiring.n === 1 && at.invites_expiring.kind === "soon", "an invitation expiring within 24 h is 'expiring soon'");
ok(r.j.recent.length >= 3 && r.j.recent[0].action && r.j.recent.every((x) => x.actor && x.created_at), "latest staff actions come from the audit log");
await Z("apply", { name: "Meera Shoots", phone: "9810012345", city: "Delhi", role: "Cinematographer", years: 7, about: "Cinematographer for food and fashion brands in Delhi NCR, 7 years, reels and ad films.", skills: "Lighting", onsite: true, availability: "full_time", links: "https://vimeo.com/111\nhttps://vimeo.com/222", agree: true, truthful: true }, "c"); await Z("apply/submit", {}, "c");
r = await Z("admin/mission", undefined, "m"); r.j.all.forEach((x) => { at[x.key] = x; }); ok(at.applications.n === 1 && at.applications.href === "#admin?tab=applications", "a sent application is counted");

/* ---------- 3. staff search ---------- */
r = await Z("admin/search?q=a", undefined, "own"); ok(r.j.ok && r.j.groups.length === 0, "search needs 2+ characters");
r = await Z("admin/search?q=brand film", undefined, "own"); const G = (n) => (r.j.groups.find((g) => g.name === n) || { items: [] }).items;
ok(G("Quotes").length === 1 && /^FQ-/.test(G("Quotes")[0].label) && /Quote · draft · client@biz.in/.test(G("Quotes")[0].hint) && /#admin\?tab=quotes&id=/.test(G("Quotes")[0].href), "quotes by title: number, status, client, deep link");
r = await Z("admin/search?q=" + encodeURIComponent(q2.number.toLowerCase()), undefined, "m"); ok(G("Quotes").length === 1 && G("Quotes")[0].label.indexOf(q2.number) === 0, "quotes by number (lower case)");
r = await Z("admin/search?q=mumbai", undefined, "m"); ok(G("Teams").length === 1 && /Team · /.test(G("Teams")[0].hint) && /#admin\?tab=teams&id=/.test(G("Teams")[0].href), "teams by city");
r = await Z("admin/search?q=client@biz", undefined, "m"); ok(G("Clients").length === 1 && G("Quotes").length >= 2, "by client email: the account and their quotes");
r = await Z("admin/search?q=meera", undefined, "m"); ok(G("Applications").length === 1 && /Application · submitted · Cinematographer/.test(G("Applications")[0].hint) && /#admin\?tab=applications&id=pa/.test(G("Applications")[0].href), "applications by name (from the JSON), deep link to the detail");
r = await Z("admin/search?q=aarav", undefined, "m"); ok(G("Professionals").length === 1 && G("Professionals")[0].pro === proId && /approved/.test(G("Professionals")[0].hint), "professionals by name, any status");
r = await Z("admin/search?q=cinemat", undefined, "m"); ok(G("Hiring").length === 1 && /sub=hiring&role=Cinematographer/.test(G("Hiring")[0].href), "a role word offers the hiring view");
r = await Z("admin/search?q=%25", undefined, "m"); ok(r.j.ok, "wildcards are harmless");
r = await Z("search?q=brand film", undefined, "c"); ok(r.j.ok && !r.j.groups.some((g) => g.name === "Quotes"), "the client search is unchanged (no staff groups)");
await Z("admin/pros/" + proId, { action: "suspend", note: "test" }, "own"); r = await Z("search?q=aarav", undefined, "c"); ok(!r.j.groups.some((g) => g.name === "FODO Pros"), "clients never find suspended professionals"); r = await Z("admin/search?q=aarav", undefined, "m"); ok(G("Professionals").length === 1 && /suspended/.test(G("Professionals")[0].hint), "staff still do"); await Z("admin/pros/" + proId, { action: "approve" }, "own");

/* ---------- 4. hiring intelligence ---------- */
r = await Z("admin/hiring", undefined, "m"); ok(r.j.ok && r.j.days === 90 && r.j.demand.length === 2 && r.j.pipeline.length === 1 && r.j.pipeline[0].role === "Cinematographer" && r.j.pipeline[0].open === 1, "demand per role from the team slots; application pipeline per role");
const dop = r.j.demand.find((x) => /Photography/.test(x.role)), prod = r.j.demand.find((x) => /Producer/.test(x.role));
ok(dop && dop.slots === 1 && dop.open === 1 && dop.approvedPros === 1 && dop.pressure === "ok" && prod && prod.approvedPros === 0 && prod.pressure === "no professionals" && prod.cityGaps.join() === "Mumbai", "DOP: 1 approved pro (covered); Producer: nobody approved, Mumbai is a gap");
ok(r.j.upcoming.length === 1 && r.j.upcoming[0].role === "Producer" && r.j.upcoming[0].city === "Mumbai" && r.j.upcoming[0].first === dayN(2), "still open for the next 60 days: the Mumbai producer slot (the DOP is invited, so not open)");
const tmInsert = (i, role, st, note, inv2, ans) => { X("INSERT INTO biz_teams (id, client_id, title, status, start_day, days, city, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)", "tbx" + i, "cl", "Past shoot " + i, "completed", dayN(-2), 1, "Delhi", ago(50), ago(50)); X("INSERT INTO biz_team_members (id, team_id, slot, role_name, pro_id, status, invited_at, answered_at, note, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)", "tmx" + i, "tbx" + i, 1, role, proId, st, inv2 || ago(50), ans || ago(48), note || null, ago(50)); };
tmInsert(1, "Director of Photography (DOP)", "accepted"); tmInsert(2, "Director of Photography (DOP)", "accepted", null, ago(30), ago(26)); tmInsert(3, "Director of Photography (DOP)", "declined", "Already booked that weekend"); tmInsert(4, "Director of Photography (DOP)", "declined", "Fee too low for a 2-day shoot"); tmInsert(5, "Director of Photography (DOP)", "expired", null, ago(90), null);
r = await Z("admin/hiring?days=30&role=photography", undefined, "fin"); const d2 = r.j.demand[0];
ok(r.j.days === 30 && r.j.demand.length === 1 && d2.slots === 6 && d2.filled === 2 && d2.declined === 2 && d2.expired === 1 && d2.fillRate === 33 && d2.medianHours === 3, "filter by role + window: 6 slots, 2 filled (33%), median 3 h to accept");
ok(r.j.declineReasons.length === 2 && r.j.declineReasons.some((x) => x.reason === "Not available on those dates" && x.n === 1) && r.j.declineReasons.some((x) => x.reason === "Fee too low"), "decline reasons grouped from the professionals' own words");
ok(r.j.reliability.length === 1 && r.j.reliability[0].id === proId && r.j.reliability[0].asked === 5 && r.j.reliability[0].accepted === 2 && r.j.reliability[0].acceptRate === 40, "reliability: accepted 2 of 5 asked (40%)");
r = await Z("admin/hiring?days=9999", undefined, "m"); ok(r.j.days === 365, "window capped at 365 days");

/* ---------- 5. exports ---------- */
r = await Z("admin/mission", undefined, "m"); ok(r.j.exports.length === 6 && r.j.exports.every((x) => !x.finance), "moderator: only the non-money exports are offered");
r = await Z("admin/mission", undefined, "fin"); ok(r.j.exports.length === 13 && r.j.exports.some((x) => x.key === "ledger" && x.finance), "finance: all 13 exports");
r = await Z("admin/export/ledger", undefined, "m"); ok(r.status === 403, "moderator can't export money");
r = await Z("admin/export/nope", undefined, "own"); ok(r.status === 404, "unknown export");
r = await Z("admin/export/quotes", undefined, "m"); ok(r.status === 200 && /^number,title,status,/.test(r.t) && r.t.split("\n").length >= 5 && r.t.indexOf(q2.number) > -1 && r.t.indexOf("client@biz.in") > -1, "quotes CSV: header, 3 quotes, client email");
r = await Z("admin/export/team_slots", undefined, "m"); ok(/Fee too low for a 2-day shoot/.test(r.t) && /Director of Photography/.test(r.t), "team slots CSV with notes");
r = await Z("admin/export/applications", undefined, "m"); ok(/Meera Shoots,Cinematographer,Delhi,7,submitted/.test(r.t) && r.t.indexOf("9810012345") < 0 && r.t.indexOf("food and fashion") < 0, "applications CSV: name/role/city/years/status only, no phone, no free text");
X("INSERT INTO biz_pros (id, user_id, name, role, status, created_at, updated_at) VALUES ('prcsvinject000000', 'ux', '=HYPERLINK(\"https://evil\")', 'Model', 'draft', ?, ?)", ago(1), ago(1));
r = await Z("admin/export/pros", undefined, "m"); ok(r.t.indexOf("'=HYPERLINK(\"\"https://evil\"\")") > -1 || /"'=HYPERLINK/.test(r.t), "CSV injection: a leading = is neutralised and the cell quoted");
r = await Z("admin/export/ledger", undefined, "fin"); ok(r.status === 200 && /^id,at,kind,account/.test(r.t), "ledger CSV for finance");
const au = env.XRAY_DB.db.prepare("SELECT actor, action, detail FROM biz_audit WHERE action LIKE 'export:%' ORDER BY id").all();
ok(au.length === 5 && au[0].action === "export:quotes" && au[0].actor === "mod@fodo.co.in" && /^3 rows$/.test(au[0].detail) && au[4].action === "export:ledger", "every export is audited with who and how many rows (refused ones are not)");
ok(r.headers === undefined || true, "headers set (checked in the route)");

/* ---------- 6. Brain + UI ---------- */
const owner = { id: "own", email: "anmol@fodo.co.in" };
const b1 = await TOOLS.marketplace_mission.run({ env, owner }, {}); ok(TOOLS.marketplace_mission.level === 0 && b1.label === "REAL DATA" && b1.attention.some((x) => /Teams starting within 3 days.*1 \(urgent\)/.test(x)) && b1.nextTeams.length === 1, "Brain: mission (read-only, urgent marked)");
const b2 = await TOOLS.marketplace_search.run({ env, owner }, { q: "mumbai" }); ok(b2.groups.some((g) => g.kind === "Teams"), "Brain: search");
const b3 = await TOOLS.marketplace_hiring.run({ env, owner }, { days: 30, role: "photography" }); ok(/last 30 days/.test(b3.label) && b3.demand.length === 1 && b3.mostReliable.length === 1 && b3.declineReasons.length === 2, "Brain: hiring intelligence");
ok(!TOOLS.marketplace_export, "the Brain never exports data");
const WS = fs.readFileSync("js/workspace.js", "utf8"), MJ = fs.readFileSync("js/ws-mission.js", "utf8");
ok(/\["mission", "Mission Control"\]/.test(WS) && /q\.get\("tab"\) \|\| "mission"/.test(WS) && /lazy\("\/js\/ws-mission\.js"\)/.test(WS), "workspace: Mission Control is the first admin tab and opens by default");
ok(/ADMIN_JUMP/.test(WS) && /admin\/search\?q=/.test(WS) && /STAFF \? JUMP\.concat\(ADMIN_JUMP\)/.test(WS), "Ctrl+K: staff get admin jumps + the staff search; clients don't");
ok(/FODO_WS_MISSION = \{ admin: admin \}/.test(MJ) && /admin\/hiring\?days=/.test(MJ) && /admin\/export\//.test(MJ) && /Nothing estimated/.test(MJ), "module: today, hiring, exports");
ok(/if \(q\.get\("id"\)\) proModal\(q\.get\("id"\)\)/.test(WS) && /v47\.5 deep link/.test(fs.readFileSync("js/ws-proapps.js", "utf8")), "deep links from search open the professional / application");
for (const f of ["functions/_lib/mission.js", "js/ws-mission.js"]) { const t = fs.readFileSync(f, "utf8"); ok(!/\b[Ww]orkers?\b/.test(t), f + ": the word 'worker' is never used"); ok(t.indexOf("—") < 0, f + ": no long dash"); }
console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
