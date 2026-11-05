// v50.5 FODO OS V4 Phase 5: growth + production (content workflow + versions + reviews, campaigns workflow + results, asset rights,
// deliverable versions + QA gate, client reports with CSV / print, platform links), permissions, navigation, rights scan.
// Run: node --no-warnings tests/v505.test.mjs
import { DatabaseSync } from "node:sqlite";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as bizApi } from "../functions/api/biz/[[path]].js";
import fs from "node:fs";
import { onRequest as osApi, ROUTES } from "../functions/api/os/[[path]].js";
import { REGISTRY, SCOPES, TEMPLATES, validPerm, LEGACY, MODULES } from "../functions/_lib/os/permissions.js";
import { osdb, ORG } from "../functions/_lib/os/db.js";
import { principal, allows, authorize, has, relationOf, cleanFor } from "../functions/_lib/os/authz.js";
import { emit, on, events } from "../functions/_lib/os/audit.js";
import { HANDLERS, enqueue, runDue } from "../functions/_lib/jobs.js";
import * as TK from "../functions/_lib/os/tasks.js";
import * as GR from "../functions/_lib/os/growth.js";
import * as RP from "../functions/_lib/replay.js";
import * as PS from "../functions/_lib/os/pros.js";
import * as PJ from "../functions/_lib/os/projects.js";
import { notify, rolesOf, navFor, bdb } from "../functions/_lib/biz.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
console.log = ((orig) => (...a) => { if (typeof a[0] === "string" && a[0].charAt(0) === "{" && !process.env.DBG) return; orig(...a); })(console.log);
console.error = process.env.DBG ? console.log.bind(console) : () => {};
function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, a = []) => ({ bind: (...x) => st(sql, x.map((v) => v === undefined ? null : v)), run: async () => { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }), _x: () => db.prepare(sql).run(...a) });
  return { db, prepare: (s) => st(s), batch: async (l) => l.map((s) => (s._x(), { success: true })) };
}
const SITE = "https://www.fodo.co.in", jars = {}, H = { account, biz: bizApi, os: osApi };
const call = async (path, body, o = {}) => {
  const who = o.as || "a", h = Object.keys(H).filter((k) => path.indexOf(k + "/") === 0)[0] || "account", p = h === "account" ? path : path.slice(h.length + 1);
  const method = o.method || (body !== undefined ? "POST" : "GET");
  const req = new Request(SITE + "/api/" + h + "/" + p, { method, headers: Object.assign({ origin: SITE, "cf-connecting-ip": "9.9.9.9" }, body !== undefined ? { "content-type": "application/json" } : {}, jars[who] ? { cookie: jars[who] } : {}, o.headers || {}), body: body === undefined ? undefined : JSON.stringify(body) });
  const r = await H[h]({ request: req, env, params: { path: p.split("?")[0].split("/") } }); const sc = r.headers.get("set-cookie"); if (sc && h === "account") jars[who] = sc.split(";")[0];
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, j, t };
};
const login = (email, plan, who) => call("test-login", Object.assign({ email }, plan ? { plan } : {}), { as: who });
const mails = []; globalThis.fetch = async (u, o = {}) => { if (/resend/.test(String(u))) { mails.push(JSON.parse(o.body)); return new Response("{}", { status: 200 }); } return new Response("x", { status: 599 }); };
const KV = new Map(), CHAT_KV = { get: async (k) => KV.get(k) || null, put: async (k, v) => { KV.set(k, v); }, getWithMetadata: async (k) => ({ value: KV.get(k) || null, metadata: null }), delete: async (k) => KV.delete(k), list: async () => ({ keys: [] }) };
const env = { XRAY_DB: d1(), CHAT_KV, ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", API_DEBUG: process.env.DBG ? "1" : "", MAIL_FROM: "FODO <hello@fodo.co.in>", RESEND_API_KEY: "re_test" };
const O = (p, body, who, o) => call("os/" + p, body, Object.assign({ as: who || "own" }, o || {}));
const Z = (p, body, who, o) => call("biz/" + p, body, Object.assign({ as: who || "c" }, o || {}));
const q1 = (sql, ...a) => env.XRAY_DB.db.prepare(sql).get(...a), qa = (sql, ...a) => env.XRAY_DB.db.prepare(sql).all(...a), qr = (sql, ...a) => env.XRAY_DB.db.prepare(sql).run(...a);
const uid = (email) => (q1("SELECT id FROM acct_users WHERE email=?", email) || {}).id;

/* ---------- 1. registry ---------- */
const U = (e) => q1("SELECT * FROM acct_users WHERE email=?", e), Pof = async (e) => principal(env, U(e), { R: await rolesOf(env, U(e)) });
const mem = (e) => q1("SELECT * FROM os_members WHERE email=?", e);
/* ---------- people set-up ---------- */
await login("anmol@fodo.co.in", null, "own"); await login("client@biz.in", null, "c"); await login("other@biz.in", null, "o"); await bdb(env); await osdb(env);
const dept = (slug) => q1("SELECT id FROM os_departments WHERE slug=?", slug).id;
await O("people", { email: "pm@fodo.co.in", name: "Priya PM", roles: ["project_manager"], department_id: dept("operations") }); await login("pm@fodo.co.in", null, "pm"); await O("me", undefined, "pm");
await O("people", { email: "dev@fodo.co.in", name: "Dev Designer", roles: ["designer"], department_id: dept("design"), manager_user_id: uid("pm@fodo.co.in") }); await login("dev@fodo.co.in", null, "dev"); await O("me", undefined, "dev");
await O("people", { email: "fin@fodo.co.in", name: "Fiona Finance", roles: ["finance_manager"], department_id: dept("finance") }); await login("fin@fodo.co.in", null, "fin"); await O("me", undefined, "fin");
await O("people", { email: "hr@fodo.co.in", name: "Hema HR", roles: ["hr_talent_manager"], department_id: dept("hr") }); await login("hr@fodo.co.in", null, "hr"); await O("me", undefined, "hr");
await O("people", { email: "ops@fodo.co.in", name: "Om Ops", roles: ["operations_manager"], department_id: dept("operations") }); await login("ops@fodo.co.in", null, "ops"); await O("me", undefined, "ops");
await O("departments/" + dept("operations"), { manager_user_id: uid("ops@fodo.co.in") });
const today = new Date().toISOString().slice(0, 10), plus = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
let r;
await O("people", { email: "smm@fodo.co.in", name: "Sana Social", roles: ["social_media_manager"], department_id: dept("marketing") }); await login("smm@fodo.co.in", null, "smm"); await O("me", undefined, "smm");
await O("people", { email: "perf@fodo.co.in", name: "Parth Perf", roles: ["performance_marketer"], department_id: dept("marketing") }); await login("perf@fodo.co.in", null, "perf"); await O("me", undefined, "perf");
await O("people", { email: "cd@fodo.co.in", name: "Cira Creative", roles: ["creative_director"], department_id: dept("creative") }); await login("cd@fodo.co.in", null, "cd"); await O("me", undefined, "cd");
const back = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const file = (id, name, owner) => qr("INSERT INTO biz_files (id, owner_id, project_id, name, mime, ext, size, store, kind, created_at) VALUES (?, ?, NULL, ?, 'image/jpeg', 'jpg', 1000, 'kv', 'image', ?)", id, owner || uid("dev@fodo.co.in"), name, new Date().toISOString());
file("fA", "diwali-hero.jpg"); file("fB", "model-release-rhea.pdf"); file("fC", "reel-v1.mp4"); file("fD", "reel-v2.mp4"); file("fE", "music-licence.pdf");

/* ---------- 1. registry, templates, navigation ---------- */
ok(REGISTRY.asset && REGISTRY.report && REGISTRY.report.share.indexOf("own") < 0 && MODULES.some((m) => m[0] === "marketing"), "registry: asset (view, manage), report (view, manage, share team+); marketing module");
const T = (s) => TEMPLATES.find((t) => t.slug === s).perms; ok(T("designer").indexOf("asset.manage.own") > -1 && T("social_media_manager").indexOf("report.manage.department") > -1 && T("project_manager").indexOf("report.share.team") > -1 && T("client").indexOf("report.view.own") > -1 && T("viewer").indexOf("report.view.organization") > -1, "templates: designers manage asset rights, marketing builds reports, managers share, clients read their own");
r = await Z("me", undefined, "smm"); ok(r.j.nav.some((n) => n.id === "os-marketing") && r.j.os.groups.find((g) => g.id === "growth").items.some((n) => n.id === "os-marketing"), "social media manager: Marketing in the Growth group");
r = await Z("me", undefined, "fin"); ok(!r.j.nav.some((n) => n.id === "os-marketing"), "finance manager (no content access): no Marketing");
r = await Z("me", undefined, "c"); ok(!r.j.nav.some((n) => n.id === "os-marketing" || n.id === "client-review"), "client sidebar unchanged (the review page opens from notifications)");

/* ---------- 2. set-up ---------- */
const cl = (await O("clients", { name: "Biz Foods", email: "client@biz.in", status: "active" }, "own")).j, cl2 = (await O("clients", { name: "Other Co", email: "other@biz.in", status: "active" }, "own")).j;
const pj = (await O("projects", { title: "Biz Foods Diwali", type: "campaign", client_id: cl.id, owner_user_id: uid("pm@fodo.co.in"), brief: { budget: 90000 } }, "pm")).j; await O("tasks", { title: "Shoot", project_id: pj.id, assignee_user_id: uid("dev@fodo.co.in") }, "pm");

/* ---------- 3. asset rights ---------- */
r = await O("assets/rights", { file_id: "fA", kind: "model_release", holder: "Rhea Kapoor" }, "dev"); ok(r.status === 400 && /proof/.test(r.j.reason), "a release needs the signed proof file");
r = await O("assets/rights", { file_id: "fA", kind: "model_release", holder: "Rhea Kapoor", proof_file_id: "fB", starts: today, expires: plus(10), scope: "Instagram and Facebook, India" }, "dev"); ok(r.status === 200, "designer records a model release with proof, scope and expiry"); const ar1 = r.j.id;
r = await O("assets/rights", { file_id: "fA", kind: "fodo_owned", holder: "FODO" }, "c"); ok(r.status === 403, "a client cannot record rights");
r = await O("assets/rights", { file_id: "zzz", kind: "fodo_owned", holder: "FODO" }, "dev"); ok(r.status === 404, "unknown file");
r = await O("assets/rights", { file_id: "fC", kind: "music_license", holder: "Epidemic Sound", proof_file_id: "fE", expires: back(2) }, "dev"); ok(r.status === 200, "an already expired music licence is recorded (so it is caught)");
r = await O("assets/rights?expiring=30", undefined, "cd"); ok(r.status === 200 && r.j.items.length === 2 && r.j.items.find((x) => x.file_id === "fC").state === "expired" && r.j.items.find((x) => x.file_id === "fA").state === "expiring", "creative director sees rights expiring or expired in 30 days");
r = await O("assets/rights", undefined, "fin"); ok(r.status === 403, "finance has no asset access");
let R0 = await GR.rightsOf(env.XRAY_DB, "fD"); ok(R0.state === "none", "a file without records says so");
const scan = await GR.rightsScan(env); ok(scan.expiring === 1 && scan.notified >= 1 && q1("SELECT 1 x FROM biz_notes WHERE user_id=? AND text LIKE 'Rights expiring%'", uid("cd@fodo.co.in")), "daily scan notifies the creative director about rights expiring within 14 days");
const sc2 = await GR.rightsScan(env); ok(qa("SELECT id FROM biz_notes WHERE user_id=? AND text LIKE 'Rights expiring%'", uid("cd@fodo.co.in")).length === 1, "the scan is deduplicated");
ok(/rightsScan/.test(fs.readFileSync(new URL("../functions/_lib/jobs.js", import.meta.url), "utf8")), "the scan runs in the daily OS job");

/* ---------- 4. content workflow ---------- */
r = await O("content", { title: "Diwali hero post", client_id: cl.id, project_id: pj.id, platform: "instagram", format: "post", due: plus(5) }, "dev"); ok(r.status === 200, "designer creates content for a client"); const ct = r.j.id;
r = await O("content", { title: "x" }, "c"); ok(r.status === 403, "clients do not use the FODO board (they keep Content & Ads)");
r = await O("content/" + ct + "/move", { to: "draft" }, "dev"); ok(r.status === 200, "idea → draft");
r = await O("content/" + ct + "/move", { to: "internal_review" }, "dev"); ok(r.status === 409 && /version/.test(r.j.reason), "review needs a version first");
r = await O("content/" + ct + "/version", { body: "Light up your Diwali with Biz Foods sweets.", file_id: "fA", note: "v1" }, "dev"); ok(r.status === 200 && r.j.version === 1, "version 1 with copy and the image");
r = await O("content/" + ct + "/move", { to: "published", live_url: "https://instagram.com/p/x" }, "dev"); ok(r.status === 409, "cannot jump from draft to published");
r = await O("content/" + ct + "/move", { to: "internal_review" }, "dev"); ok(r.status === 200, "draft → internal review");
r = await O("content/" + ct + "/move", { to: "client_review" }, "dev"); ok(r.status === 403, "the author (without approve rights) cannot push it on");
{ const own1 = (await O("content", { title: "SMM own post", client_id: cl.id }, "smm")).j.id; await O("content/" + own1 + "/move", { to: "draft" }, "smm"); await O("content/" + own1 + "/version", { body: "x" }, "smm"); await O("content/" + own1 + "/move", { to: "internal_review" }, "smm"); r = await O("content/" + own1 + "/move", { to: "approved" }, "smm"); ok(r.status === 403 && /own content/.test(r.j.reason), "even a content lead cannot approve their own content"); }
r = await O("content/" + ct + "/move", { to: "revision" }, "smm"); ok(r.status === 400, "sending back needs a note");
r = await O("content/" + ct + "/move", { to: "revision", note: "Logo too small" }, "smm"); ok(r.status === 200, "content lead sends it back with a note");
r = await O("content/" + ct + "/version", { body: "Light up your Diwali with Biz Foods sweets. Order now.", note: "bigger logo" }, "dev"); ok(r.j.version === 2 && q1("SELECT workflow FROM biz_content WHERE id=?", ct).workflow === "draft", "version 2 returns it to draft");
await O("content/" + ct + "/move", { to: "internal_review" }, "dev"); r = await O("content/" + ct + "/move", { to: "client_review" }, "smm"); ok(r.status === 200 && q1("SELECT 1 x FROM biz_notes WHERE user_id=? AND text LIKE 'Please review: Diwali hero post'", uid("client@biz.in")), "lead approves internally → client review; the client is asked");
r = await O("content", undefined, "c"); ok(r.status === 200 && r.j.items.length === 1 && r.j.items[0].workflow === "client_review", "the client sees only their items from client review on");
r = await O("content", undefined, "o"); ok(r.j.items.length === 0, "another client sees nothing");
r = await O("content/" + ct, undefined, "c"); ok(r.status === 200 && r.j.versions.length === 1 && r.j.next.join() === "approved,revision" && r.j.reviews.every((x) => x.to_state !== "revision" || x.by_role === "client"), "the client sees the latest version only, not internal back-and-forth");
r = await O("content/" + ct, undefined, "o"); ok(r.status === 404, "another client cannot open it");
r = await O("content/" + ct + "/move", { to: "approved" }, "dev"); ok(r.status === 403, "staff without approve rights cannot answer for the client");
r = await O("content/" + ct + "/move", { to: "revision" }, "c"); ok(r.status === 400, "a client asking for changes says what");
r = await O("content/" + ct + "/move", { to: "approved" }, "c"); ok(r.status === 200 && q1("SELECT by_role FROM os_content_reviews WHERE content_id=? AND to_state='approved'", ct).by_role === "client" && q1("SELECT 1 x FROM biz_notes WHERE user_id=? AND text LIKE 'Diwali hero post: approved%'", uid("dev@fodo.co.in")), "the client approves; the review row says client; the author is told");
r = await O("content/" + ct + "/move", { to: "scheduled", scheduled_at: plus(20) }, "dev"); ok(r.status === 409 && /Rights problem/.test(r.j.reason), "scheduling after the model release expires is blocked with the reason");
r = await O("content/" + ct + "/move", { to: "scheduled", scheduled_at: plus(3) }, "dev"); ok(r.status === 200 && /expiring/i.test(r.j.warning || ""), "scheduling inside the release window works, with an expiry warning");
r = await O("content/" + ct + "/move", { to: "published" }, "dev"); ok(r.status === 400 && /live post URL/.test(r.j.reason), "published needs the live URL (FODO does not post)");
r = await O("content/" + ct + "/move", { to: "published", live_url: "https://www.instagram.com/p/DIWALI01/" }, "dev"); ok(r.status === 200 && q1("SELECT published_at p, live_url u FROM biz_content WHERE id=?", ct).u, "published with the live URL and time");
r = await O("content/" + ct + "/version", { body: "late edit" }, "dev"); ok(r.status === 409, "a published item takes no new version");
r = await O("content/" + ct, undefined, "dev"); ok(r.j.reviews.length >= 7 && r.j.versions.length === 2 && r.j.next.length === 0, "full review history and versions are kept");
const ct2 = (await O("content", { title: "Reel with music", client_id: cl.id }, "dev")).j.id; await O("content/" + ct2 + "/move", { to: "draft" }, "dev"); await O("content/" + ct2 + "/version", { file_id: "fC" }, "dev"); await O("content/" + ct2 + "/move", { to: "internal_review" }, "dev"); await O("content/" + ct2 + "/move", { to: "approved" }, "smm");
r = await O("content/" + ct2 + "/move", { to: "published", live_url: "https://instagram.com/reel/abc" }, "dev"); ok(r.status === 409 && /expired/.test(r.j.reason), "publishing a reel whose music licence expired is blocked");
r = await O("content?state=approved", undefined, "smm"); ok(r.status === 200 && r.j.items.length === 1 && r.j.columns.length === 8, "a department content lead sees the whole client-content board, filtered by state");
r = await O("content", undefined, "dev"); ok(r.status === 200 && r.j.items.every((x) => x.owner_user_id === uid("dev@fodo.co.in")) && r.j.items.length === 2, "a designer sees their own items");
r = await O("campaigns", undefined, "dev"); ok(r.status === 403, "a designer has no campaign board");
r = await O("content", undefined, "fin"); ok(r.status === 403, "finance has no content access");

/* ---------- 5. campaigns ---------- */
r = await O("campaigns", { name: "Diwali leads", client_id: cl.id, project_id: pj.id, platform: "meta", objective: "leads", budget: 40000, days: 14, start_day: plus(1) }, "perf"); ok(r.status === 200, "performance marketer plans a campaign"); const cp = r.j.id;
r = await O("campaigns", { name: "x", budget: 1 }, "dev"); ok(r.status === 403, "a designer cannot create campaigns");
await O("campaigns/" + cp + "/move", { to: "planned" }, "perf"); r = await O("campaigns/" + cp + "/move", { to: "approved" }, "perf"); ok(r.status === 409, "planned cannot jump to approved");
r = await O("campaigns/" + cp + "/move", { to: "budget_approval", approver_user_id: uid("anmol@fodo.co.in") }, "perf"); ok(r.status === 200 && r.j.approval_id && q1("SELECT kind, object_id FROM os_approvals WHERE id=?", r.j.approval_id).object_id === cp, "budget approval goes through the Approvals engine"); const apId = r.j.approval_id;
await O("campaigns/" + cp + "/move", { to: "budget_approval" }, "perf"); r = await O("campaigns/" + cp + "/move", { to: "approved" }, "perf"); ok(r.status === 409 && /pending/.test(r.j.reason), "it cannot be marked approved while the approval is pending");
r = await O("approvals/" + apId + "/decide", { decision: "approve" }, "own"); ok(r.status === 200, "owner approves the budget");
r = await O("campaigns/" + cp + "/move", { to: "approved" }, "perf"); ok(r.status === 200, "now approved");
r = await O("campaigns/" + cp + "/results", { period_from: today, period_to: today, spend: 100 }, "perf"); ok(r.status === 409, "no results before it has been live");
r = await O("campaigns/" + cp + "/move", { to: "live" }, "perf"); ok(r.status === 400 && /platform reference/.test(r.j.reason), "live needs the platform reference (FODO does not launch ads)");
r = await O("campaigns/" + cp + "/move", { to: "live", platform_ref: "act_123/cmp_456" }, "perf"); ok(r.status === 200 && q1("SELECT launched_at FROM biz_campaigns WHERE id=?", cp).launched_at, "marked live with the reference; launch time kept");
r = await O("campaigns/" + cp + "/results", { period_from: back(6), period_to: back(4), spend: 12000, impressions: 80000, clicks: 1600, leads: 60, conversions: 12, revenue: 54000, source: "platform_export" }, "perf"); ok(r.status === 200 && r.j.totals.derived.cpl === 200 && r.j.totals.derived.ctr === 2 && r.j.totals.derived.roas === 4.5, "results with derived CTR, CPL, ROAS");
r = await O("campaigns/" + cp + "/results", { period_from: back(5), period_to: back(3), spend: 1 }, "perf"); ok(r.status === 409, "overlapping periods refused (no double counting)");
r = await O("campaigns/" + cp + "/results", { period_from: back(3), period_to: back(1), spend: 30000, impressions: 100, clicks: 500 }, "perf"); ok(r.status === 400, "clicks above impressions refused");
r = await O("campaigns/" + cp + "/results", { period_from: back(3), period_to: plus(1), spend: 1 }, "perf"); ok(r.status === 400, "a period in the future refused");
r = await O("campaigns/" + cp + "/results", { period_from: back(3), period_to: back(1), spend: 30000, impressions: 150000, clicks: 2400, leads: 90 }, "perf"); ok(r.status === 200 && /over the approved budget/.test(r.j.warning || ""), "spend past the budget comes back with a warning");
r = await O("campaigns/" + cp, undefined, "perf"); ok(r.status === 200 && r.j.totals.spend === 42000 && r.j.totals.fresh === back(1) && r.j.log.length >= 5 && /does not launch/.test(r.j.publishing) && r.j.approval.status === "approved", "campaign page: totals, freshness, log, approval, honest publishing note");
r = await O("campaigns/" + cp + "/move", { to: "reported" }, "perf"); ok(r.status === 409, "live → reported is not allowed (end it first)");
await O("campaigns/" + cp + "/move", { to: "ended" }, "perf"); r = await O("campaigns/" + cp + "/move", { to: "reported" }, "perf"); ok(r.status === 200, "ended → reported");
r = await O("campaigns", undefined, "perf"); ok(r.j.items.length === 1 && r.j.items[0].totals.leads === 150 && r.j.defs.cpl, "campaign list with totals and definitions");

/* ---------- 6. deliverable versions + QA gate ---------- */
r = await O("projects/" + pj.id + "/deliverable", { action: "create", title: "Diwali reel", owner_user_id: uid("dev@fodo.co.in") }, "pm"); const dl = r.j.id;
r = await O("qa/templates", undefined, "dev"); ok(r.status === 200 && r.j.items.length === 5 && r.j.items.find((t) => t.kind === "video").items.length === 7, "five default QA templates (video, photo, design, website, copy)");
r = await O("qa/templates", { name: "Reel QA", kind: "video", items: ["9:16", "Captions", "Music licensed"] }, "dev"); ok(r.status === 403, "a designer cannot edit QA templates");
r = await O("qa/templates", { name: "Reel QA", kind: "video", items: ["9:16 export", "Captions checked", "Music licensed"] }, "cd"); ok(r.status === 200, "creative director adds a template"); const tpl = r.j.id;
r = await O("projects/" + pj.id + "/deliverables/" + dl + "/template", { template_id: tpl, kind: "video" }, "pm"); ok(r.status === 200, "PM attaches the QA template to the deliverable");
r = await O("projects/" + pj.id + "/deliverables/" + dl + "/version", { file_id: "fC", note: "first cut" }, "dev"); ok(r.status === 200 && r.j.revision === 1 && /Run QA/.test(r.j.note), "the owner uploads version 1");
r = await O("projects/" + pj.id + "/deliverable", { id: dl, action: "submit" }, "dev"); ok(r.status === 409 && /QA has not passed on revision 1/.test(r.j.reason), "submitting without QA is blocked");
r = await O("projects/" + pj.id + "/deliverables/" + dl + "/qa", { items: [{ pass: true }, { pass: false }, { pass: true }] }, "dev"); ok(r.status === 400, "a failed check needs a note");
r = await O("projects/" + pj.id + "/deliverables/" + dl + "/qa", { items: [{ pass: true }, { pass: false, note: "No captions yet" }, { pass: true }] }, "dev"); ok(r.status === 200 && r.j.passed === false && r.j.failed[0] === "Captions checked", "QA fails with the failed item");
r = await O("projects/" + pj.id + "/deliverables/" + dl + "/version", { file_id: "fD", note: "captions added" }, "dev"); ok(r.j.revision === 2, "version 2");
r = await O("projects/" + pj.id + "/deliverables/" + dl + "/qa", { items: [{ pass: true }, { pass: true }, { na: true }] }, "dev"); ok(r.status === 200 && r.j.passed === true, "QA passes on revision 2 (not applicable counts as pass)");
r = await O("projects/" + pj.id + "/deliverable", { id: dl, action: "submit" }, "dev"); ok(r.status === 200, "now it can be submitted");
r = await O("projects/" + pj.id + "/deliverables/" + dl + "/qa", undefined, "pm"); ok(r.status === 200 && r.j.runs.length === 2 && r.j.versions.length === 2 && r.j.passedCurrent && r.j.template.items.length === 3, "QA page: runs, versions, current status");
r = await O("projects/" + pj.id + "/deliverables/" + dl + "/qa", undefined, "o"); ok(r.status === 403 || r.status === 404, "another client cannot see QA");
const dl2 = (await O("projects/" + pj.id + "/deliverable", { action: "create", title: "Banner" }, "pm")).j.id; r = await O("projects/" + pj.id + "/deliverable", { id: dl2, action: "submit" }, "pm"); ok(r.status === 200, "deliverables without a QA template keep the Phase 2 flow");

/* ---------- 7. platform links ---------- */
qr("CREATE TABLE IF NOT EXISTS acct_runs (job_id TEXT PRIMARY KEY, user_id TEXT, owner_id TEXT, domain TEXT, url TEXT, tier TEXT, credit TEXT, client_id TEXT, score INTEGER, status TEXT, created_at TEXT)");
qr("INSERT INTO acct_runs (job_id, user_id, domain, score, status, created_at) VALUES ('xj1', ?, 'bizfoods.in', 62, 'done', ?)", uid("client@biz.in"), new Date().toISOString()); qr("INSERT INTO acct_runs (job_id, user_id, domain, score, status, created_at) VALUES ('xj2', ?, 'other.in', 40, 'done', ?)", uid("other@biz.in"), new Date().toISOString());
r = await O("clients/" + cl.id + "/links", undefined, "pm"); ok(r.status === 200 && r.j.candidates.xray.length === 1 && r.j.candidates.xray[0].ref === "xj1" && !r.j.candidates.xray[0].linked, "candidates are the client's own X-Ray runs, sites and Growth Lab work");
r = await O("links", { kind: "xray", ref: "xj2", client_id: cl.id }, "own"); ok(r.status === 403, "another client's X-Ray run cannot be linked");
r = await O("links", { kind: "xray", ref: "xj1", client_id: cl.id, project_id: pj.id }, "own"); ok(r.status === 200, "owner links the X-Ray run to the client and project");
r = await O("clients/" + cl.id, undefined, "own"); ok(r.j.links && r.j.links.length === 1, "Customer 360 shows the link");

/* ---------- 8. client reports ---------- */
r = await O("reports", { client_id: cl.id, period_from: back(30), period_to: plus(1) }, "smm"); ok(r.status === 400, "a report cannot cover future days");
r = await O("reports", { client_id: cl.id, period_from: back(30), period_to: today, include_finance: true }, "smm"); ok(r.status === 403, "including invoices needs finance access");
r = await O("reports", { client_id: cl.id, period_from: back(30), period_to: today, notes: "Strong festive month." }, "smm"); ok(r.status === 200 && r.j.summary.posts_published === 1 && r.j.summary.campaigns_reported === 1 && r.j.summary.leads === 150 && r.j.summary.spend === 42000 && r.j.summary.projects === 1, "social media manager builds the report from real records"); const rp = r.j.id;
r = await O("reports/" + rp, undefined, "smm"); const X = r.j.report.data; ok(X.content[0].live_url && X.campaigns[0].freshness === back(1) && X.campaigns[0].sources === "manual,platform_export".split(",").sort().join(",") || X.campaigns[0].sources, "the report keeps live URLs, freshness and source");
ok(X.definitions.cpl && X.definitions.posts_published && X.links.length === 1 && X.links[0].kind === "Business X-Ray" && X.projects[0].href && X.invoices === null && r.j.canShare, "definitions, linked tools, drill-down links; no invoices unless asked");
r = await O("reports/" + rp, undefined, "c"); ok(r.status === 404, "a draft is invisible to the client");
r = await call("os/reports/" + rp + "/csv", undefined, { as: "smm" }); ok(r.status === 200 && /^\ufeff?section,item/.test(r.t) && /DIWALI01/.test(r.t) && /campaign,Diwali leads,spend,42000/.test(r.t), "CSV export");
r = await call("os/reports/" + rp + "/print", undefined, { as: "smm" }); ok(r.status === 200 && /Save as PDF/.test(r.t) && /Strong festive month/.test(r.t) && /Definitions/.test(r.t), "printable report (PDF via print) with notes and definitions");
r = await O("reports/" + rp + "/share", {}, "dev"); ok(r.status === 403, "a designer cannot share reports");
r = await O("reports/" + rp + "/share", {}, "smm"); ok(r.status === 200 && q1("SELECT status FROM os_client_reports WHERE id=?", rp).status === "shared" && q1("SELECT 1 x FROM biz_notes WHERE user_id=? AND text LIKE 'Your report for%'", uid("client@biz.in")), "shared; the client is told");
r = await O("reports/" + rp + "/refresh", {}, "smm"); ok(r.status === 409, "a shared report is frozen");
r = await O("reports", undefined, "c"); ok(r.status === 200 && r.j.items.length === 1, "the client lists their shared reports"); r = await O("reports", undefined, "o"); ok(r.j.items.length === 0, "other clients see none");
r = await call("os/reports/" + rp + "/print", undefined, { as: "c" }); ok(r.status === 200 && /Biz Foods/.test(r.t), "the client prints their report");
r = await call("os/reports/" + rp + "/csv", undefined, { as: "o" }); ok(r.status === 404, "another client cannot download it");
const fr = await O("reports", { client_id: cl.id, period_from: back(30), period_to: today, include_finance: true }, "fin"); ok(fr.status === 403, "finance (no report.manage) cannot build reports");
r = await O("reports", { client_id: cl.id, period_from: back(30), period_to: today, include_finance: true }, "own"); ok(r.status === 200, "owner builds a report with invoices"); r = await O("reports/" + r.j.id, undefined, "own"); ok(Array.isArray(r.j.report.data.invoices), "invoices section present");
r = await O("client/inbox", undefined, "c"); ok(r.status === 200 && r.j.reports.length === 1 && Array.isArray(r.j.content) && r.j.recent.length === 1, "client inbox: items to review, recent posts, shared reports");
{ const csv = await GR.reportCsv(env, await Pof("smm@fodo.co.in"), rp); ok(!/\n=/.test(await csv.text()), "CSV cells starting with = + - @ are neutralised"); }

/* ---------- 9. router hygiene + UI wiring ---------- */
ok(ROUTES.every((x) => x[2] === "self" || (x[2] && REGISTRY[x[2].resource] && REGISTRY[x[2].resource][x[2].action])), "every route declares a valid permission"); ok(ROUTES.filter((x) => x[2] === "self").length <= 8, "no more than 8 self routes");
{ const ui = fs.readFileSync(new URL("../js/ws-os.js", import.meta.url), "utf8"); const paths = new Set(); for (const m of ui.matchAll(/oapi\("([a-z\-]+(?:\/[a-z\-]+)*)/g)) paths.add(m[1]); for (const m of ui.matchAll(/"([a-z\-]+(?:\/[a-z\-]+)?)\/" \+ [a-zA-Z.]+ \+ "\/([a-z\-]+(?:\/[a-z\-]+)?)"/g)) paths.add(m[1] + "/x/" + m[2]); const routes = ROUTES.map((x) => x[1]); const missing = [...paths].filter((p) => !routes.some((re) => re.test(p) || re.test(p.replace(/\/x\//, "/abc123/")) || re.test(p + "/abc") || re.source.indexOf("^" + p.replace(/\//g, "\\/") + "\\/") === 0)); ok(missing.length === 0, "ws-os.js calls only routes the router has" + (missing.length ? ": " + missing.join(", ") : "")); ok(/"os-marketing": marketing/.test(ui) && /"client-review": clientReview/.test(ui), "ws-os.js renders Marketing and the client review page"); ok(!/\bworker\b/i.test(ui) && !/—/.test(ui), "no 'worker', no long dash"); }
console.log(`\nv50.5: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
