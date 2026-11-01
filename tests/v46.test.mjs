// v46.1: DPDP privacy (download my data, delete my account), notification preferences + email + daily digest,
// migration version table, admin analytics. Run: node --no-warnings tests/v46.test.mjs
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as admin } from "../functions/api/admin/[[path]].js";
import { onRequest as xray } from "../functions/api/xray/[[path]].js";
import { onRequest as brain } from "../functions/api/owner-brain/[[path]].js";
import { onRequest as bizApi } from "../functions/api/biz/[[path]].js";
import { onRequest as sitesApi } from "../functions/api/sites/[[path]].js";
import { migrateOnce, migId } from "../functions/_lib/accounts.js";
import { fundMilestone } from "../functions/_lib/biz.js";
import { digest, catOf } from "../functions/_lib/alerts.js";
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
const mails = []; globalThis.fetch = async (u, o = {}) => { if (/api\.resend\.com/.test(String(u))) { mails.push(JSON.parse(o.body)); return new Response(JSON.stringify({ id: "m" + mails.length }), { status: 200, headers: { "content-type": "application/json" } }); } return new Response("x", { status: 599 }); };
const KV = new Map(), CHAT_KV = { get: async (k) => KV.get(k) || null, put: async (k, v) => { KV.set(k, v); }, getWithMetadata: async (k) => ({ value: KV.get(k) || null, metadata: null }), delete: async (k) => KV.delete(k), list: async () => ({ keys: [] }) };
const env = { XRAY_DB: d1(), CHAT_KV, ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", MAIL_FROM: "FODO <hello@fodo.co.in>", RESEND_API_KEY: "re_SECRET_test_key_123", SITES_HOST: "sites.fodo.co.in", SITES_PROJECT: "fodo-sites", SITES_SECRET_KEY: "test-sites-secret-key-0123456789abcdef" };
H.biz = bizApi; H.sites = sitesApi;
const Z = (p, body, who, o) => call("biz/" + p, body, Object.assign({ as: who || "c" }, o || {}));
const q1 = (sql, ...a) => env.XRAY_DB.db.prepare(sql).get(...a), qa = (sql, ...a) => env.XRAY_DB.db.prepare(sql).all(...a);

/* ---------- 1. migration version table ---------- */
{ const D = d1(); let runs = 0; const W = { prepare: (sql) => { const st = D.prepare(sql); return { bind: (...x) => { const b = st.bind(...x); return { run: async () => { if (/^ALTER|^CREATE INDEX|^DROP/.test(sql)) runs++; return b.run(); }, first: () => b.first(), all: () => b.all() }; }, run: async () => { if (/^ALTER|^CREATE INDEX|^DROP/.test(sql)) runs++; return st.run(); }, all: () => st.all(), first: () => st.first() }; } };
  await D.prepare("CREATE TABLE t (a TEXT)").run(); const L = ["ALTER TABLE t ADD COLUMN b TEXT", "ALTER TABLE t ADD COLUMN c TEXT", "ALTER TABLE missing ADD COLUMN x TEXT"];
  await migrateOnce(W, L); const first = runs; await migrateOnce(W, L); const second = runs - first;
  ok(first === 3 && second === 1, "migrations run once; a failed one (missing table) is retried, applied ones are skipped (" + first + " then " + second + ")");
  ok(D.db.prepare("SELECT count(*) n FROM schema_migrations").get().n === 2 && D.db.prepare("SELECT sql FROM schema_migrations WHERE id=?").get(migId(L[0])).sql === L[0], "schema_migrations records what was applied");
  const D2 = d1(); await D2.prepare("CREATE TABLE t (a TEXT, b TEXT)").run(); await migrateOnce(D2, ["ALTER TABLE t ADD COLUMN b TEXT"]); ok(D2.db.prepare("SELECT count(*) n FROM schema_migrations").get().n === 1, "'duplicate column' counts as already applied"); }

await login("anmol@fodo.co.in", null, "own"); await login("client@biz.in", null, "c"); await login("pro@studio.in", null, "p"); await login("other@biz.in", null, "o");
ok(q1("SELECT count(*) n FROM schema_migrations").n > 10, "the real databases record their migrations");

/* ---------- 2. notification preferences ---------- */
let r = await Z("settings/notify"); ok(r.j.ok && r.j.prefs.projects === "instant" && r.j.prefs.messages === "daily" && r.j.prefs.news === "off" && r.j.categories.length === 6 && r.j.mail, "defaults: projects instant, messages daily, news off");
r = await Z("settings/notify", { projects: "off", messages: "weird", news: "instant" }); ok(r.j.prefs.projects === "off" && r.j.prefs.messages === "daily" && r.j.prefs.news === "instant", "save: valid choices kept, unknown values ignored");
r = await Z("settings/notify", undefined, "o"); ok(r.j.prefs.projects === "instant", "settings are per person");
ok(catOf("funded") === "payments" && catOf("message") === "messages" && catOf("proposal") === "projects" && catOf("whatever") === "account", "notification kinds map to categories");
await Z("settings/notify", { projects: "instant", news: "off" });
/* a real flow: pro + project → notifications */
const inv = (await Z("admin/invites", { note: "p", maxUses: 1 }, "own")).j.token;
await Z("pro", { invite: inv, name: "Aarav Films", role: "Cinematographer", skills: "reels", city: "Delhi", onsite: true, langs: "Hindi", bio: "Professional for restaurants and cafes in Delhi NCR. Short-form reels and brand films.", days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], rateDay: 18000, terms: true }, "p");
await Z("pro/packages", { name: "Pack", price: 15000 }, "p"); await Z("pro/portfolio", { kind: "video", title: "Film", url: "https://vimeo.com/1" }, "p"); await Z("pro/submit", {}, "p"); const proId = (await Z("pro", undefined, "p")).j.pro.id;
mails.length = 0; await Z("admin/pros/" + proId, { action: "approve" }, "own");
const pid = (await Z("projects", { proId, title: "Cafe reels", brief: "Five reels for the cafe" })).j.project.id;
ok(mails.some((m) => m.to[0] === "pro@studio.in" && /New project request: Cafe reels/.test(m.subject) && /#project=/.test(m.text) && /#settings/.test(m.text)), "instant email for a project request (link + settings link)");
const before = mails.length; await Z("projects/" + pid + "/message", { body: "Hi!" }, "c"); ok(mails.length === before, "messages are 'daily' by default: no instant email");
await Z("settings/notify", { projects: "off" }, "p"); const b2 = mails.length; await Z("projects/" + pid + "/propose", { milestones: [{ title: "Shoot", amount: 9000 }] }, "p"); await Z("projects/" + pid + "/message", { body: "Proposal sent" }, "p");
r = await Z("notes", undefined, "c"); ok(mails.filter((m) => m.to[0] === "client@biz.in").length >= 1 && r.j.items.some((n) => /Proposal received/.test(n.text)), "the client still gets the proposal email + in-app note");
const b3 = mails.length; await Z("projects/" + pid + "/accept", {}); ok(!mails.slice(b3).some((m) => m.to[0] === "pro@studio.in"), "the pro switched project emails off: none sent (still in the app)");
r = await Z("notes", undefined, "p"); ok(r.j.items.some((n) => /accepted/.test(n.text)), "…the notification is in the app");
/* daily digest */
mails.length = 0; let dg = await digest(env); ok(dg.sent >= 1 && mails.some((m) => m.to[0] === "pro@studio.in" && /Your FODO day/.test(m.subject) && /New message on Cafe reels/.test(m.text)) && !mails.some((m) => /accepted/.test(m.text) && m.to[0] === "pro@studio.in"), "daily digest: the pro's unread messages (daily), not the categories they turned off");
dg = await digest(env); ok(dg.already, "the digest runs once a day");
const tickSrc = fs.readFileSync(new URL("../functions/api/monitor/tick.js", import.meta.url), "utf8"); ok(/alerts\.js"\)\)\.digest\(env\)/.test(tickSrc), "the daily scheduler sends the digest");

/* ---------- 3. download my data ---------- */
await Z("crm/contacts", { name: "Riya Sharma", email: "riya@example.com" }); await Z("brand", { name: "Spice Route", tone: "Warm" });
const site = await call("sites/create", { mode: "template", templateId: "cafe-cozy", name: "Spice Route", ai: false }, { as: "c" }); const sid = site.j.id;
await env.XRAY_DB.prepare("INSERT INTO site_forms (id, site_id, page, data, ip_hash, created_at) VALUES (?1,?2,'contact',?3,'x',?4)").bind("fm1", sid, JSON.stringify({ name: "Visitor", phone: "9811111111" }), new Date().toISOString()).run();
r = await call("biz/privacy/export", {}, { as: "c" }); const X = JSON.parse(r.t);
ok(r.status === 200 && X.account.email === "client@biz.in" && X.crm.contacts[0].name === "Riya Sharma" && X.workspace.brand_kit.name === "Spice Route" && X.websites[0].name === "Spice Route" && X.websites[0].doc && X.website_form_submissions.length === 1, "export: account, CRM, Brand Kit, websites (content), form submissions");
ok(X.projects[0].title === "Cafe reels" && X.projects[0].your_role === "client" && X.projects[0].your_messages.length === 1 && X.workspace.notifications !== undefined && /Digital Personal Data Protection/.test(X.about.law), "export: projects with your own messages only, notifications, the law named");
ok(!/re_SECRET|token_hash|code_hash|google_sub|sites-secret/.test(r.t) && !/pro@studio\.in/.test(r.t), "export has no secrets, session data or other people's emails");
r = await call("biz/privacy/export", {}, { as: "o" }); const XO = JSON.parse(r.t); ok(XO.crm.contacts.length === 0 && XO.websites.length === 0 && XO.projects.length === 0, "another person's export contains only their own data");
for (let i = 0; i < 4; i++) await call("biz/privacy/export", {}, { as: "c" }); r = await call("biz/privacy/export", {}, { as: "c" }); ok(r.status === 429, "5 exports a day");
r = await call("biz/privacy/export", {}, { as: "c", headers: { origin: "https://evil.test" } }); ok(r.status === 403, "cross-site export refused");
r = await Z("privacy"); ok(r.j.log.some((x) => x.kind === "export"), "exports are in the privacy log");

/* ---------- 4. delete my account ---------- */
const ms = (await Z("projects/" + pid)).j.project.milestones[0]; await fundMilestone(env, ms.id, "o1");
r = await Z("privacy"); ok(r.j.blockers.some((b) => /paid milestone/.test(b)), "money in progress blocks deletion (shown in advance)");
r = await Z("privacy/delete", { confirm: "DELETE" }); ok(r.status === 409 && r.j.blockers.length >= 1, "…and the delete is refused with the reasons");
r = await Z("privacy/delete", { confirm: "DELETE" }, "own"); ok(r.status === 409 && /owner/.test(r.j.reason), "owner accounts can't be deleted");
await Z("projects/" + pid + "/submit", { milestoneId: ms.id, note: "done" }, "p"); await Z("projects/" + pid + "/approve", { milestoneId: ms.id });
r = await Z("privacy", undefined, "p"); ok(r.j.blockers.some((b) => /owes you/.test(b)), "a pro with an unpaid payout can't delete yet (they'd lose money)");
r = await Z("privacy"); ok(r.j.blockers.length === 0, "client: nothing blocks now");
r = await Z("privacy/delete", { confirm: "yes" }); ok(r.status === 400, "must type DELETE");
const uidC = q1("SELECT id FROM acct_users WHERE email='client@biz.in'").id; env.XRAY_DB.db.prepare("INSERT INTO acct_orders (order_id, user_id, kind, item, amount, status, created_at, paid_at) VALUES ('ord_keep', ?, 'plan', 'growth', 999, 'PAID', ?, ?)").run(uidC, new Date().toISOString(), new Date().toISOString());
mails.length = 0; r = await Z("privacy/delete", { confirm: "delete" }); ok(r.j.ok && r.j.kept.length === 3, "account deleted (case-insensitive DELETE)");
ok(mails.some((m) => m.to[0] === "client@biz.in" && /deleted/.test(m.subject)), "a confirmation email went to the old address");
const U = q1("SELECT * FROM acct_users WHERE id=?", uidC); ok(U.email === "deleted+" + uidC + "@deleted.fodo.invalid" && !U.name && !U.phone && U.blocked === 1 && U.deleted_at, "the account row is anonymised (no name, email, phone)");
ok(q1("SELECT count(*) n FROM acct_sessions WHERE user_id=?", uidC).n === 0 && (await Z("me")).status === 401, "signed out everywhere");
ok(q1("SELECT count(*) n FROM crm_contacts WHERE user_id=?", uidC).n === 0 && q1("SELECT count(*) n FROM biz_brand WHERE user_id=?", uidC).n === 0 && q1("SELECT count(*) n FROM biz_notes WHERE user_id=?", uidC).n === 0, "CRM, Brand Kit and notifications erased");
ok(q1("SELECT deleted_at FROM sites WHERE id=?", sid).deleted_at && q1("SELECT doc FROM sites WHERE id=?", sid).doc === "{}" && q1("SELECT count(*) n FROM site_forms WHERE site_id=?", sid).n === 0, "websites removed (content and visitor form data erased)");
ok(qa("SELECT body FROM biz_messages WHERE user_id=?", uidC).every((m) => /removed/.test(m.body)) && q1("SELECT title FROM biz_projects WHERE id=?", pid).title === "Cafe reels", "shared project kept for the pro, the client's messages removed");
ok(q1("SELECT count(*) n FROM acct_orders WHERE user_id=? AND order_id='ord_keep'", uidC).n === 1, "payment records kept (tax law), now without a name or email");
ok(!q1("SELECT count(*) n FROM help_mail WHERE to_addr LIKE '%client@biz.in%'").n, "the email log no longer has the address");
ok(q1("SELECT count(*) n FROM privacy_log WHERE user_id=? AND kind='delete'", uidC).n === 1, "the deletion is logged (without personal data)");
await login("client@biz.in", null, "c"); r = await Z("crm/contacts"); ok(r.j.total === 0 && (await Z("brand")).j.brand === null, "signing up again with the same email starts empty");

/* ---------- 5. admin analytics ---------- */
r = await Z("admin/analytics", undefined, "c"); ok(r.status === 403, "clients can't see analytics");
r = await Z("admin/analytics", undefined, "own"); const A = r.j;
ok(r.j.ok && A.users.total === q1("SELECT count(*) n FROM acct_users WHERE deleted_at IS NULL AND email NOT LIKE 'deleted+%'").n && A.users.deleted === 1, "users: real count, deleted accounts excluded and counted separately");
ok(A.revenue.last30 === 999 && A.revenue.byKind[0].kind === "plan" && A.market.gmv30 === 9000 && A.market.commission30 === 900 && A.market.owed === 8100, "money: sales ₹999, GMV ₹9,000, commission ₹900, owed ₹8,100 (from the database)");
ok(A.trend.signups.length === 30 && A.trend.gmv.reduce((s, x) => s + x.n, 0) === 9000 && A.funnel.signedUp >= 1, "30-day series with every day present; funnel");
ok(A.builder.sites === 0 && A.tools.crmContacts === 0, "deleted websites and CRM data don't count");
const WS = fs.readFileSync(new URL("../js/workspace.js", import.meta.url), "utf8");
ok(/VIEWS\.settings/.test(WS) && /privacy\/export/.test(WS) && /privacy\/delete/.test(WS) && /settings\/notify/.test(WS) && /admin\/analytics/.test(WS) && /Type DELETE/.test(WS), "workspace UI: Settings & privacy, notification table, export, delete, admin analytics");
console.log("\nv46: " + pass + " passed, " + fail + " failed"); if (fail) process.exit(1);
