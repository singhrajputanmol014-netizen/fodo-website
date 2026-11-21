// v54.2 Admin ▸ Client Emails: clients, email types in one fixed design, preview, confirm, test send, rate limit, duplicate block,
// failure + retry, send log, opt-out link for marketing types, access only for owners and Full-control admins. Resend is mocked:
// no real email is sent. Run: node --no-warnings tests/v542-client-emails.test.mjs
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as adminApi } from "../functions/api/admin/[[path]].js";
import { onRequest as optout } from "../functions/api/optout.js";
import * as T from "../functions/_lib/clientmail.js";
import { optOutUrl, mimeOf } from "../functions/_lib/outreach.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
console.log = ((orig) => (...a) => { if (typeof a[0] === "string" && a[0].charAt(0) === "{" && !process.env.DBG) return; orig(...a); })(console.log);
console.error = () => {};
function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, a = []) => ({ bind: (...x) => st(sql, x.map((v) => v === undefined ? null : v)), run: async () => { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }), _x: () => db.prepare(sql).run(...a) });
  return { db, prepare: (s) => st(s), batch: async (l) => l.map((s) => (s._x(), { success: true })) };
}
const SITE = "https://www.fodo.co.in", jars = {};
const env = { XRAY_DB: d1(), ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", RESEND_API_KEY: "re_test_x", CLIENT_MAIL_HOURLY: "5" };
const q1 = (sql, ...a) => env.XRAY_DB.db.prepare(sql).get(...a), X = (sql, ...a) => env.XRAY_DB.db.prepare(sql).run(...a);
const mails = []; let resendDown = false;
globalThis.fetch = async (u, o = {}) => { u = String(u);
  if (/api\.resend\.com\/emails/.test(u)) { const b = JSON.parse(o.body); mails.push({ body: b, headers: o.headers }); if (resendDown) return new Response(JSON.stringify({ message: "Service unavailable" }), { status: 503 }); return new Response(JSON.stringify({ id: "re_" + mails.length }), { status: 200 }); }
  return new Response("{}", { status: 404 }); };
const call = async (path, body, who, o = {}) => {
  const h = path.indexOf("admin/") === 0 ? "admin" : "account", p = h === "admin" ? path.slice(6) : path;
  const req = new Request(SITE + "/api/" + h + "/" + p, { method: body !== undefined ? "POST" : "GET", headers: Object.assign({ origin: SITE, "cf-connecting-ip": "9.9.9.9" }, body !== undefined ? { "content-type": "application/json" } : {}, jars[who] ? { cookie: jars[who] } : {}), body: body === undefined ? undefined : JSON.stringify(body) });
  const r = await (h === "admin" ? adminApi : account)({ request: req, env, params: { path: p.split("?")[0].split("/").map(decodeURIComponent) }, waitUntil: () => {} });
  const sc = r.headers.get("set-cookie"); if (sc && h === "account") jars[who] = sc.split(";")[0];
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, j, t, h: r.headers };
};
await call("test-login", { email: "anmol@fodo.co.in" }, "o");
await call("test-login", { email: "rohit@fodo.co.in" }, "adm");
await call("test-login", { email: "viewer@fodo.co.in" }, "v");
await call("test-login", { email: "random@gmail.com" }, "x");
X("CREATE TABLE IF NOT EXISTS acct_admins (email TEXT PRIMARY KEY, role TEXT, added_by TEXT, added_at TEXT)");
X("INSERT INTO acct_admins (email, role) VALUES ('rohit@fodo.co.in','admin'),('viewer@fodo.co.in','viewer')");
const OR = (p, b, who) => call("admin/outreach" + (p ? "/" + p : ""), b, who || "o");

/* access */
ok((await OR("", undefined, "x")).status === 403 && (await OR("", undefined, "v")).status === 403 && (await OR("send", { client_id: "cl_shagun", type: "proposal", test: true }, "v")).status === 403, "only owners and Full-control admins: a viewer or outsider can't open or send");
const ov = await OR("", undefined, "adm"); ok(ov.status === 200 && ov.j.ok, "a Full-control admin can open Client Emails");

/* seeded client + types */
const sh = ov.j.clients.find((c) => c.id === "cl_shagun");
ok(sh && sh.business === "Shagun Banquet Hall" && sh.city === "Motihari" && sh.email === "singhrajputanmol014@gmail.com" && sh.service === "AI Digital Growth System" && /50,000/.test(sh.amount) && /4,300 to ₹12,800/.test(sh.pricing) && /₹500 \/ day/.test(sh.pricing), "Shagun Banquet Hall (Motihari) is the first client with its pricing");
ok(["proposal", "follow_up", "welcome", "invoice_reminder", "project_update", "report_delivery", "custom"].every((t) => ov.j.types.some((x) => x.id === t)) && ov.j.config.configured && ov.j.config.hourly === 5, "all 7 email types listed; provider configured; hourly limit from env");
ok(!JSON.stringify(ov.j).match(/re_test_x/), "the provider API key never reaches the browser");

/* preview: same design, content per client */
const pv = (await OR("preview", { client_id: "cl_shagun", type: "proposal", vars: { date: "30 Nov 2026", next_step: "a 20-minute call on Monday" } })).j;
ok(pv.ok && pv.subject === "Proposal for Shagun Banquet Hall: AI Digital Growth System" && pv.to === "singhrajputanmol014@gmail.com", "subject variables filled from the client record");
const H = pv.html;
ok(/#0B0B0C/.test(H) && /#151517/.test(H) && /#2A2A2F/.test(H) && /#F4F4F2/.test(H) && /#8F7BFF/.test(H) && /Inter Tight/.test(H) && /max-width:640px/.test(H) && /FEAR OF DIGITALLY OUT \?/.test(H) && /favicon-192\.png/.test(H) && /Anmol · FODO/.test(H), "fixed design: colours, Inter Tight, 640px, logo + tagline, 'Anmol · FODO' sign-off");
ok(/font-style:italic;font-weight:400;white-space:nowrap[^>]*>× FODO<\/span>/.test(H) && /Shagun Banquet Hall/.test(H) && /₹4,300 to ₹12,800 \/ month/.test(H) && /₹50,000 one-time/.test(H) && /30 Nov 2026/.test(H) && /a 20-minute call on Monday/.test(H), "proposal: serif italic '× FODO' accent, pricing rows, stat boxes, next step");
ok(!/<script/i.test(H) && !/ on[a-z]+=/i.test(H) && !/—/.test(H) && !/\bfree\b/i.test(H), "email has no script, no inline handlers, no long dash, no 'free' wording");
ok(!/Unsubscribe/.test(H) && pv.marketing === false, "proposal is transactional: no unsubscribe link");
ok(/mailto:anmol@fodo\.co\.in\?subject=Confirm%20proposal%20for%20Shagun%20Banquet%20Hall/.test(H), "button link variables are URL-encoded");
const fu = (await OR("preview", { client_id: "cl_shagun", type: "follow_up" })).j;
ok(fu.marketing === true && /Unsubscribe<\/a>/.test(fu.html) && /\/api\/optout\?e=singhrajputanmol014%40gmail\.com&amp;t=/.test(fu.html) && /next_step/.test(fu.empty.join(",")), "follow-up is marketing: unsubscribe link; empty {next_step} is reported");
const s1 = /<td valign="middle" align="right"[^]*?<\/td>/.exec(H)[0], s2 = /<td valign="middle" align="right"[^]*?<\/td>/.exec(fu.html)[0];
ok(s1 === s2 && H.slice(H.indexOf("Regards,")) .replace(/Unsubscribe[^]*$/, "").length > 0 && H.slice(H.indexOf("<tr><td class=\"cm-px\" style=\"padding:4px")) === fu.html.slice(fu.html.indexOf("<tr><td class=\"cm-px\" style=\"padding:4px")).replace(/ · <a href="[^"]*optout[^"]*"[^>]*>Unsubscribe<\/a>/, ""), "header, sign-off and footer are identical across email types");

/* HTML typed by an admin is stripped; bad links refused */
const xs = (await OR("preview", { client_id: "cl_shagun", type: "custom", subject: "<b>Hi</b> {first_name}", blocks: { headline: "<img src=x onerror=alert(1)>Hello", intro: "<script>alert(1)</script>Plain **bold** text", items: "A | <i>b</i>" } })).j;
ok(xs.ok && !/<script|onerror|<img src=x|<i>b<\/i>/.test(xs.html) && /<b style="[^"]*">bold<\/b>/.test(xs.html) && xs.subject === "Hi Shagun Banquet Hall", "HTML in user fields is stripped; **bold** still works");
ok((await OR("preview", { client_id: "cl_shagun", type: "custom", blocks: { cta_text: "Go", cta_link: "javascript:alert(1)" } })).status === 400, "javascript: button links are refused");
const plainText = T.renderMail({ subject: "s", blocks: T.blocksFor("proposal", {}) }).text; ok(/Regards,\nAnmol · FODO/.test(plainText) && !/<[a-z]/i.test(plainText), "plain-text version is generated automatically");

/* clients: add, edit, search, validate */
ok((await OR("clients", { name: "X", email: "not-an-email" })).status === 400 && (await OR("clients", { email: "a@b.co" })).status === 400, "client needs a name and a valid email");
const nc = (await OR("clients", { name: "Priya Sharma", business: "Glow <b>Salon</b>", email: "Priya@Glow.in", city: "Noida", industry: "Salon", service: "Instagram growth", status: "lead" })).j;
const gp = (await OR("preview", { client_id: nc.client.id, type: "custom" })).j; ok(/Hi Priya,/.test(gp.html) && /Hi Shagun Banquet Hall,/.test(pv.html), "greets the contact person by first name, or the business when there is no person");
ok(nc.ok && nc.client.business === "Glow Salon" && nc.client.email === "priya@glow.in", "new client saved (HTML stripped, email cleaned)");
const ed = (await OR("clients", { id: nc.client.id, name: "Priya Sharma", business: "Glow Salon", email: "priya@glow.in", city: "Greater Noida", status: "active" })).j;
ok(ed.ok && ed.client.city === "Greater Noida" && ed.client.status === "active", "client edited");
ok((await OR("clients?q=greater", undefined)).j.clients.length === 1, "client search");

/* sending */
ok((await OR("send", { client_id: "cl_shagun", type: "proposal" })).j.needConfirm === true && mails.length === 0, "a real send needs explicit confirmation");
const ts = (await OR("send", { client_id: "cl_shagun", type: "proposal", test: true, to: "anmol@fodo.co.in" })).j;
ok(ts.ok && mails.length === 1 && mails[0].body.to[0] === "anmol@fodo.co.in" && /^\[TEST\] Proposal for Shagun/.test(mails[0].body.subject) && ts.send.test, "test send goes to the admin only, marked [TEST]");
const rs = (await OR("send", { client_id: "cl_shagun", type: "proposal", confirm: true, vars: { date: "30 Nov 2026", next_step: "call" } }, "adm")).j;
const m2 = mails[1];
ok(rs.ok && m2.body.to.length === 1 && m2.body.to[0] === "singhrajputanmol014@gmail.com" && m2.body.reply_to === "anmol@fodo.co.in" && m2.body.from === "FODO <anmol@fodo.co.in>" && m2.body.text.length > 50 && /Bearer re_test_x/.test(m2.headers.authorization) && !m2.body.headers["List-Unsubscribe"], "real send: one recipient, from/reply-to from config, plain text included, key only in the server header");
const lg = q1("SELECT * FROM cm_sends WHERE id=?1", rs.send.id);
ok(lg && lg.status === "sent" && lg.provider_id === "re_2" && lg.admin === "rohit@fodo.co.in" && lg.client_id === "cl_shagun" && lg.type === "proposal" && lg.at, "logged: time, admin, client, type, subject, status, provider message id");
const dup = await OR("send", { client_id: "cl_shagun", type: "proposal", confirm: true });
ok(dup.status === 409 && dup.j.duplicate && mails.length === 2, "same type to the same client within 10 minutes is blocked");
ok((await OR("send", { client_id: "cl_shagun", type: "proposal", confirm: true, override: true })).j.ok && mails.length === 3, "admin can override the duplicate block");
ok((await OR("send", { client_id: "cl_shagun", type: "welcome", confirm: true })).j.ok, "a different type to the same client is fine");

/* failure + retry */
resendDown = true; const fl = await OR("send", { client_id: nc.client.id, type: "project_update", confirm: true });
ok(fl.status === 502 && !fl.j.ok && /not sent/.test(fl.j.reason) && fl.j.send.status === "failed" && q1("SELECT status FROM cm_sends WHERE id=?1", fl.j.send.id).status === "failed", "a failed send is logged as failed with a clear error, never as sent");
resendDown = false; const rt = (await OR("sends/" + fl.j.send.id + "/retry", {})).j;
ok(rt.ok && rt.send.status === "sent" && rt.send.attempts === 2 && rt.send.provider_id, "Retry re-sends it and only then marks it sent");
ok((await OR("sends/" + fl.j.send.id + "/retry", {})).status === 409, "a sent email can't be retried again");

/* hourly limit: 4 real sends already this hour */
env.CLIENT_MAIL_HOURLY = "4";
const lim = await OR("send", { client_id: nc.client.id, type: "report_delivery", confirm: true, vars: { link: "https://www.fodo.co.in/r/1" } });
ok(lim.status === 429 && lim.j.limit, "hourly rate limit stops real sends");
ok((await OR("send", { client_id: nc.client.id, type: "custom", test: true })).j.ok, "test sends still work at the limit"); env.CLIENT_MAIL_HOURLY = "5";

/* log + filters */
const lgAll = (await OR("sends", undefined)).j.sends, lgF = (await OR("sends?status=failed", undefined)).j.sends, lgC = (await OR("sends?client=" + nc.client.id, undefined)).j.sends;
ok(lgAll.length >= 6 && lgF.every((s) => s.status === "failed") && lgC.every((s) => s.client_id === nc.client.id) && lgC.length >= 1, "send log with filters by client and status");
const view = await OR("sends/" + rs.send.id + "/html", undefined); ok(view.status === 200 && /sandbox/.test(view.h.get("content-security-policy")) && /Shagun/.test(view.t), "a sent email can be viewed (sandboxed)");

/* opt-out */
X("DELETE FROM cm_sends"); const ou = await optOutUrl(env, "priya@glow.in");
const og = await optout({ request: new Request(ou), env }); const otb = await og.text();
ok(og.status === 200 && /<form method="post"/.test(otb) && !q1("SELECT email FROM camp_unsub WHERE email='priya@glow.in'"), "opt-out link shows a confirm button (opening it alone does nothing)");
ok((await optout({ request: new Request(ou.replace(/t=[^&]+/, "t=bad")), env })).status === 400, "a forged opt-out link is refused");
await optout({ request: new Request(ou, { method: "POST" }), env });
ok(!!q1("SELECT email FROM camp_unsub WHERE email='priya@glow.in'"), "pressing Unsubscribe adds them to the opt-out list");
const blk = await OR("send", { client_id: nc.client.id, type: "follow_up", confirm: true });
ok(blk.status === 409 && blk.j.optedOut, "marketing emails are never sent to someone who unsubscribed");
const tr = (await OR("send", { client_id: nc.client.id, type: "invoice_reminder", confirm: true, vars: { amount: "₹10,000", date: "1 Dec", link: "https://pay.example/x" } })).j;
ok(tr.ok, "transactional emails (invoice reminder) still reach them");
const mk = (await OR("send", { client_id: "cl_shagun", type: "follow_up", confirm: true, vars: { next_step: "call" } })).j, lm = mails[mails.length - 1];
ok(mk.ok && /^<https:\/\/www\.fodo\.co\.in\/api\/optout\?e=/.test(lm.body.headers["List-Unsubscribe"]) && lm.body.headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click", "marketing sends carry List-Unsubscribe (one-click) headers");

/* not configured */
const k = env.RESEND_API_KEY; delete env.RESEND_API_KEY;
const nc2 = await OR("send", { client_id: "cl_shagun", type: "custom", test: true }); env.RESEND_API_KEY = k;
ok(nc2.status === 503 && nc2.j.setup && /RESEND_API_KEY/.test(nc2.j.reason), "without the provider key: clear set-up message, nothing sent");

/* Gmail path: one proper MIME message from the mailbox */
const mm = mimeOf("FODO <anmol@fodo.co.in>", "x@y.in", { id: "cm_1", subject: "Proposal for Shagun × FODO", html: "<p>Hi</p>", text: "Hi", optOut: "https://www.fodo.co.in/api/optout?e=x&t=y" }, "anmol@fodo.co.in");
ok(/^From: FODO <anmol@fodo\.co\.in>\r\nTo: x@y\.in\r\nSubject: =\?UTF-8\?B\?/.test(mm) && /Reply-To: anmol@fodo\.co\.in/.test(mm) && /List-Unsubscribe-Post: List-Unsubscribe=One-Click/.test(mm) && /multipart\/alternative/.test(mm) && (mm.match(/\r\nTo: /g) || []).length === 1, "Gmail send builds one MIME mail (From anmol@, Reply-To, unsubscribe headers, text + HTML)");
/* admin UI */
const AJ = fs.readFileSync("js/admin.js", "utf8"), i0 = AJ.indexOf("function outreachView"), blk2 = AJ.slice(i0 - 400, AJ.indexOf("/* ---------- v53.8 Email campaigns"));
ok(/"outreach", "Client Emails"/.test(AJ) && /"outreach", "campaigns"/.test(AJ) && /outreach: outreachView/.test(AJ) && !/\son[a-z]+=["']/.test(blk2) && /Yes, send it/.test(blk2) && /data-retry/.test(blk2) && /sandbox=""/.test(blk2), "Admin has the Client Emails page (confirm dialog, retry, sandboxed preview, no inline handlers)");
ok(fs.existsSync("docs/CLIENT-EMAILS.md") && fs.existsSync("docs/client-emails.env.example") && !/re_[A-Za-z0-9]{10,}/.test(fs.readFileSync("docs/client-emails.env.example", "utf8")), "README and env config file exist, with no real keys");

console.log("\n" + pass + " passed, " + fail + " failed"); if (fail) process.exit(1);
