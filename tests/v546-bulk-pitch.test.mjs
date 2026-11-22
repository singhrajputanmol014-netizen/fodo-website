// v54.6 Admin ▸ Bulk pitch: campaign, PDF presentation, CSV list (validate, dedupe, opt-out skip), per-recipient preview,
// test-first gate, confirm, batches, hourly cap, failure + retry-failed, re-send block, unsubscribe link + header, logging.
// Resend is mocked: no real email is sent. Run: node --no-warnings tests/v546-bulk-pitch.test.mjs
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as adminApi } from "../functions/api/admin/[[path]].js";
import { onRequest as optout } from "../functions/api/optout.js";

import * as PI from "../functions/_lib/pitch.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
console.log = ((orig) => (...a) => { if (typeof a[0] === "string" && a[0].charAt(0) === "{" && !process.env.DBG) return; orig(...a); })(console.log);
console.error = () => {};
function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, a = []) => ({ bind: (...x) => st(sql, x.map((v) => v === undefined ? null : v)), run: async () => { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }), _x: () => db.prepare(sql).run(...a) });
  return { db, prepare: (s) => st(s), batch: async (l) => l.map((s) => (s._x(), { success: true })) };
}
const SITE = "https://www.fodo.co.in", jars = {};
const KV = new Map(), KVM = new Map(), CHAT_KV = { get: async (k) => (KV.has(k) ? KV.get(k) : null), put: async (k, v, o) => { KV.set(k, v); KVM.set(k, (o && o.metadata) || null); }, getWithMetadata: async (k) => ({ value: KV.has(k) ? KV.get(k) : null, metadata: KVM.get(k) || null }), delete: async (k) => { KV.delete(k); KVM.delete(k); } };
const env = { XRAY_DB: d1(), CHAT_KV, ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", RESEND_API_KEY: "re_test_x", CLIENT_MAIL_HOURLY: "6", PITCH_BATCH: "2", PITCH_DELAY_MS: "0" };
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
const PP = (p, b, who) => call("admin/pitch" + (p ? "/" + p : ""), b, who || "o");
const shagunBefore = JSON.stringify((await call("admin/outreach", undefined, "o")).j.clients.find((c) => c.id === "cl_shagun"));
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF").toString("base64");

/* access */
ok((await PP("", undefined, "x")).status === 403 && (await PP("", undefined, "v")).status === 403 && (await PP("save", { name: "x" }, "v")).status === 403, "only owners and Full-control admins: a viewer or outsider can't open or change Bulk pitch");
const ov = await PP("", undefined, "adm"); ok(ov.status === 200 && ov.j.ok && ov.j.config.hourly === 6 && ov.j.config.batch === 2 && ov.j.defaults.copy.benefits.length === 3, "a Full-control admin can open it; hourly cap and batch size come from env");
ok(!JSON.stringify(ov.j).match(/re_test_x/), "the provider API key never reaches the browser");

/* presentation: PDF only, 10 MB */
ok((await PP("pres", { file: Buffer.from("hello").toString("base64"), name: "deck.pptx", mime: "application/vnd.ms-powerpoint" })).status === 400, "presentation must be a PDF (pptx refused)");
ok((await PP("pres", { file: Buffer.from("not a pdf at all").toString("base64"), name: "deck.pdf", mime: "application/pdf" })).status === 400, "a file named .pdf that is not a PDF is refused");
ok((await PP("pres", { file: "JVBER" + "A".repeat(Math.ceil(10.2 * 1048576 * 4 / 3)), name: "big.pdf", mime: "application/pdf" })).status === 400, "a PDF over 10 MB is refused");
const pres = (await PP("pres", { file: PDF, name: "FODO-Studio-Pitch.pdf", mime: "application/pdf" })).j;
ok(pres.ok && pres.attachment.mime === "application/pdf" && pres.attachment.size > 10, "PDF presentation uploaded");

/* campaign */
ok((await PP("save", { name: "GTA 6 clippers" })).status === 400, "a campaign needs a presentation (PDF or link)");
ok((await PP("save", { name: "X", pres_link: "javascript:alert(1)" })).status === 400 && (await PP("save", { name: "X", pres: { id: pres.attachment.id }, copy: { cta_text: "Go", cta_link: "javascript:alert(1)" } })).status === 400, "bad presentation or button links are refused");
const sv = (await PP("save", { name: "GTA 6 <b>clippers</b>", pres: { id: pres.attachment.id }, copy: { intro: "Hi {first_name},\n\n<script>alert(1)</script>Clip **{business_name}** in {city}." } })).j;
const CID = sv.campaign && sv.campaign.id;
ok(sv.ok && CID && sv.campaign.name === "GTA 6 clippers" && sv.campaign.subject === PI.DEFAULT_SUBJECT && !/script/.test(sv.campaign.copy.intro) && sv.campaign.tested === false, "campaign saved: HTML stripped from name and copy, default subject");

/* recipient list: validate, dedupe, opt-out skip, HTML stripped */
X("INSERT INTO camp_unsub (email, at, why) VALUES ('gone@example.com', '2026-01-01T00:00:00Z', 'test')");
const csv = 'name,business,email,city\n"Rahul Mehta","Rahul <b>Gaming</b>",Rahul@Example.com,Delhi\nPriya,Priya Clips,priya@example.com,Mumbai\nDup,Dup Biz,rahul@example.com,Pune\nBad,Bad Biz,not-an-email,X\nGone,Gone Biz,gone@example.com,Y\n,Only Biz,biz@example.com,\nNoMail,NoMail Biz,,Z\n';
const ld = (await PP(CID + "/recipients", { csv })).j;
ok(ld.ok && ld.counts.valid === 4 && ld.counts.invalid === 2 && ld.counts.duplicate === 1 && ld.counts.opted_out === 1 && ld.counts.queued === 3, "CSV: counts valid 4, invalid 2, duplicate 1, opted-out 1, queued 3");
const rr = ld.campaign.recipients; const rahul = rr.find((r) => r.email === "rahul@example.com");
ok(rahul && rahul.business === "Rahul Gaming" && !rr.some((r) => r.email === "gone@example.com"), "emails lower-cased and deduped, HTML stripped from CSV, opted-out address skipped");
const ld2 = (await PP(CID + "/recipients", { text: "a1@example.com\nA1@example.com\nb2@example.com", append: true })).j;
ok(ld2.ok && ld2.counts.valid === 2 && ld2.counts.duplicate === 1 && ld2.campaign.summary.queued === 5, "a pasted list of plain emails works too (appended)");
ok(PI.readList("email\nx@y.co").valid[0].name === "" && PI.readList("Rahul,Rahul Co,r@x.co,Agra").valid[0].city === "Agra", "header row optional; columns name, business, email, city");

/* preview per recipient */
const pv = (await PP(CID + "/preview", { email: "rahul@example.com" })).j, H = pv.html;
ok(pv.ok && pv.to === "rahul@example.com" && pv.subject === "Rahul, clip GTA 6 and any stream with FODO Studio" && /Hi Rahul,/.test(H) && /Rahul Gaming/.test(H) && /in Delhi\./.test(H), "preview for one recipient: {first_name} {business_name} {city} filled");
const pv2 = (await PP(CID + "/preview", { email: "biz@example.com" })).j; ok(/Hi Only Biz,/.test(pv2.html), "no contact name: greets the business");
ok(/#0B0B0C/.test(H) && /#151517/.test(H) && /#8F7BFF/.test(H) && /Inter Tight/.test(H) && /max-width:640px/.test(H) && /FEAR OF DIGITALLY OUT \?/.test(H) && /favicon-192\.png/.test(H) && /Anmol · FODO/.test(H), "same fixed FODO design: colours, Inter Tight, 640px, logo + tagline, sign-off");
ok(/Paste any link/.test(H) && /AI finds the moments/.test(H) && /Post everywhere/.test(H) && /One-line install/.test(H) && /Request your key/.test(H) && /FODO-Studio-Pitch\.pdf/.test(H), "pitch blocks: 3 benefit rows, stat boxes, button, attachment card");
ok(/Unsubscribe<\/a>/.test(H) && /\/api\/optout\?e=rahul%40example\.com&amp;t=/.test(H) && /Unsubscribe: https:\/\/www\.fodo\.co\.in\/api\/optout/.test(pv.text), "unsubscribe link in HTML and plain text");
ok(!/<script/i.test(H) && !/ on[a-z]+=/i.test(H) && !/—/.test(H) && !/\bfree\b/i.test(H) && !/<[a-z]/i.test(pv.text) && /Regards,\nAnmol · FODO/.test(pv.text), "no script/handlers, no long dash, no 'free'; plain-text fallback generated");

/* sending gates */
ok((await PP(CID + "/send", {})).j.needConfirm === true && mails.length === 0, "a real send needs explicit confirmation");
ok((await PP(CID + "/send", { confirm: true })).j.needTest === true && mails.length === 0, "the real send is blocked until a test went to the admin");
const ts = (await PP(CID + "/test", {}, "adm")).j;
ok(ts.ok && mails.length === 1 && mails[0].body.to[0] === "rohit@fodo.co.in" && /^\[TEST\] /.test(mails[0].body.subject) && ts.campaign.tested === true, "test goes to the admin's own email, marked [TEST]");
ok(mails[0].body.attachments && mails[0].body.attachments[0].filename === "FODO-Studio-Pitch.pdf" && mails[0].body.attachments[0].content === PDF, "the PDF presentation is attached");
await PP("save", { id: CID, name: "GTA 6 clippers", pres: { id: pres.attachment.id }, subject: "{first_name}, a new way to clip", copy: sv.campaign.copy });
ok((await PP(CID + "/send", { confirm: true })).j.needTest === true, "editing the campaign after the test needs a new test");
await PP(CID + "/test", {});

/* batches */
const b1 = (await PP(CID + "/send", { confirm: true })).j;
ok(b1.ok && b1.done.length === 2 && b1.done.every((x) => x.status === "sent") && b1.more === true && b1.campaign.summary.sent === 2 && mails.length === 4, "one request sends one batch (PITCH_BATCH=2), more stay queued");
const m3 = mails[2];
ok(m3.body.to.length === 1 && m3.body.headers["List-Unsubscribe"] && /api\/optout\?e=/.test(m3.body.headers["List-Unsubscribe"]) && m3.body.headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click" && m3.body.attachments.length === 1 && m3.body.text.length > 100, "every real email: one recipient, List-Unsubscribe header, PDF attached, plain text");
const lg = q1("SELECT * FROM cm_sends WHERE campaign_id=?1 AND test=0 AND email=?2", CID, m3.body.to[0]);
ok(lg && lg.status === "sent" && /^re_/.test(lg.provider_id) && lg.type === "studio_pitch" && lg.marketing === 1, "logged in cm_sends with campaign id, recipient, status, provider id");
X("INSERT INTO camp_unsub (email, at, why) VALUES (?1, ?2, 'link')", "priya@example.com", new Date().toISOString());
resendDown = true; const b2 = (await PP(CID + "/send", { confirm: true })).j; resendDown = false;
ok(b2.ok && b2.done.some((x) => x.status === "failed") && b2.campaign.summary.failed >= 1 && b2.campaign.recipients.filter((r) => r.status === "failed").every((r) => !r.provider_id && r.error), "provider down: marked failed with the error, never sent");
ok(!q1("SELECT 1 AS x FROM cm_sends WHERE campaign_id=?1 AND status='sent' AND provider_id IS NULL", CID), "nothing is marked sent without a provider id");
const pr = q1("SELECT status FROM cm_pitch_rcpt WHERE campaign_id=?1 AND email='priya@example.com'", CID);
ok(pr && (pr.status === "opted_out" || pr.status === "sent"), "someone who opts out mid-campaign is skipped (or was already sent before opting out)");
env.CLIENT_MAIL_HOURLY = "4"; let guard = 0, last; while (guard++ < 10) { last = (await PP(CID + "/send", { confirm: true })).j; if (!last.more || last.paused) break; }
ok(last.paused === "limit" && /Hourly limit/.test(last.reason), "the shared hourly cap (CLIENT_MAIL_HOURLY) pauses the send; the rest stays queued");
env.CLIENT_MAIL_HOURLY = "6"; X("UPDATE cm_sends SET last_at='2020-01-01T00:00:00Z'");
const rt = (await PP(CID + "/retry", {})).j; ok(rt.ok && rt.requeued >= 1 && rt.campaign.summary.failed === 0, "retry-failed puts only the failed ones back in the queue");
guard = 0; while (guard++ < 10) { last = (await PP(CID + "/send", { confirm: true })).j; if (!last.more || last.paused) break; }
ok(last.ok && last.campaign.summary.queued === 0 && last.campaign.summary.failed === 0 && last.campaign.summary.sent >= 4, "all sent after retry");
ok(last.campaign.summary.unsubscribed >= 0 && last.campaign.summary.opened === null, "summary: sent, failed, unsubscribed; opens not tracked (provider doesn't report them)");

/* re-send block */
const before = mails.length;
const again = (await PP(CID + "/recipients", { text: "rahul@example.com\nnew1@example.com" })).j;
ok(again.counts.already_sent === 1 && again.counts.queued === 1, "re-loading the list: an address that already got this campaign is not queued again");
X("UPDATE cm_sends SET last_at='2020-01-01T00:00:00Z'");
await PP(CID + "/send", { confirm: true });
ok(mails.length === before + 1 && mails[mails.length - 1].body.to[0] === "new1@example.com", "only the new address is sent");
const ovr = (await PP(CID + "/recipients", { text: "rahul@example.com", override: true })).j;
ok(ovr.counts.queued === 1, "the admin can override and queue a re-send");

/* Client Emails untouched */
ok(JSON.stringify((await call("admin/outreach", undefined, "o")).j.clients.find((c) => c.id === "cl_shagun")) === shagunBefore, "the Shagun client record is unchanged");
ok((await call("admin/outreach/sends", undefined, "o")).j.sends.every((s) => s.type !== "studio_pitch"), "Client Emails' send log does not list Bulk pitch sends");
ok(q1("SELECT COUNT(*) AS n FROM cm_sends WHERE campaign_id IS NOT NULL").n === q1("SELECT COUNT(*) AS n FROM cm_sends WHERE type='studio_pitch'").n, "every Bulk pitch send carries its campaign id");

/* opt-out link works end to end */
const url = new URL(/https:\/\/www\.fodo\.co\.in\/api\/optout\?[^>"\s]+/.exec(m3.body.headers["List-Unsubscribe"])[0]);
const r = await optout({ request: new Request(url.toString(), { method: "POST" }), env });
ok(r.status === 200 && q1("SELECT email FROM camp_unsub WHERE email=?1", url.searchParams.get("e")), "the email's unsubscribe link adds the address to the opt-out list");

/* admin UI */
const AJ = fs.readFileSync("js/admin.js", "utf8"), blk = AJ.slice(AJ.indexOf("v54.6 Bulk pitch: one presentation"), AJ.indexOf("function orClientForm"));
ok(/\["pitch", "Bulk pitch"/.test(AJ) && /"pitch", "outreach"/.test(AJ) && /pitch: pitchView/.test(AJ) && /cannot be unsent/.test(blk) && /This sends to ' \+ n \+ " people/.test(blk) && /sandbox=""/.test(blk) && !/\son[a-z]+=["']/.test(blk) && /Retry ' \+ s\.failed/.test(blk), "Admin has the Bulk pitch page next to Client Emails (confirm with count, retry failed, sandboxed preview, no inline handlers)");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
