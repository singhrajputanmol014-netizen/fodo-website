/* FODO v54.6 Admin ▸ Bulk pitch (owners and Full-control admins only).
   Pitch FODO Studio to many prospects at once: one campaign = one subject, one presentation (PDF attached to every email, or a
   link) and one copy, sent in the fixed FODO email design (_lib/clientmail.js renderMail) with per-recipient {first_name}
   {business_name} {city}.

   Rules
   - Marketing email: every message carries the /api/optout link and a List-Unsubscribe header; opted-out addresses (camp_unsub,
     shared with Client Emails and Email campaigns) are skipped when the list is loaded and again right before each send.
   - A test send to the admin is required before the real send, and again after any change to the subject, copy or presentation.
   - The real send needs confirm:true and goes out in small batches (PITCH_BATCH, default 5 per request) with PITCH_DELAY_MS
     (default 1500 ms) between messages. Every real send counts against the shared CLIENT_MAIL_HOURLY cap of Client Emails.
   - Each recipient is sent the same campaign once. Sending again to an address that already got it needs the admin's override.
   - A failed send stays "failed" with its error; "Retry failed" puts only those back in the queue. Nothing is marked sent unless
     the provider returned an id.
   - Every send, test or real, is a row in cm_sends (type "studio_pitch", campaign_id set). Client Emails' own log hides these rows.
   - Text from the admin and from CSV files is plain text only (tags stripped); HTML only comes from the fixed template. */
import { cleanEmail, nowIso, randId, mailLog } from "./accounts.js";
import * as T from "./clientmail.js";
import * as OR from "./outreach.js";
import * as SCH from "./schema.js";

const err = (m, s, extra) => Object.assign(new Error(m), { status: s || 400 }, extra || {});
const all = async (d, sql, ...a) => (await d.prepare(sql).bind(...a).all()).results || [];
const one = (d, sql, ...a) => d.prepare(sql).bind(...a).first();
const run = (d, sql, ...a) => d.prepare(sql).bind(...a).run();
export const TYPE = "studio_pitch", MAX_RCPT = 2000, PDF_MAX = 10 * 1048576;
export const batchSize = (env) => Math.max(1, Math.min(20, +((env && env.PITCH_BATCH) || 5)));
export const delayMs = (env) => Math.max(0, Math.min(10000, +((env && env.PITCH_DELAY_MS) != null && env.PITCH_DELAY_MS !== "" ? env.PITCH_DELAY_MS : 1500)));
const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

/* tables live with Client Emails (outreach.js owns cm_sends; v54.6 added cm_sends.campaign_id there) */
const DDL = [
  "CREATE TABLE IF NOT EXISTS cm_pitch (id TEXT PRIMARY KEY, name TEXT, subject TEXT, copy TEXT, pres TEXT, pres_link TEXT, admin TEXT, created_at TEXT, updated_at TEXT, tested_at TEXT, tested_hash TEXT)",
  "CREATE TABLE IF NOT EXISTS cm_pitch_rcpt (campaign_id TEXT, email TEXT, name TEXT, business TEXT, city TEXT, status TEXT, override INTEGER DEFAULT 0, send_id TEXT, provider_id TEXT, error TEXT, at TEXT, PRIMARY KEY (campaign_id, email))",
  "CREATE INDEX IF NOT EXISTS cm_pitch_rcpt_st ON cm_pitch_rcpt(campaign_id, status)",
];
export async function pdb(env) {
  const d = await OR.cmDb(env);
  await SCH.setup(d, "pitch", async () => { await SCH.ddl(d, DDL); });
  return d;
}

/* ---------------- the "FODO Studio pitch" template (only the copy changes; design is clientmail.js) ---------------- */
export const DEFAULT_COPY = {
  eyebrow: "FODO Studio",
  headline: "Clip anything. *Post everywhere.*",
  intro: "Hi {first_name},\n\nGTA 6 is out and big creators are paying clippers per view. **FODO Studio** turns long streams, gameplay and videos into short, captioned clips on your own computer, then plans and posts them for {business_name}.",
  benefits: [
    { title: "Paste any link", text: "YouTube, Kick, Twitch, live streams or your own files" },
    { title: "AI finds the moments", text: "Ranked topics, 9:16 cuts, captions in Hindi, English and Hinglish" },
    { title: "Post everywhere", text: "Schedule to Instagram, YouTube, TikTok and Facebook from one desk" },
  ],
  stats: "5 to 15 min | One-line install on Windows or Mac\n2 computers | Work on one personal key",
  cta_text: "Request your key",
  cta_link: "https://www.fodo.co.in/fodo-studio/",
  closing: "The presentation is attached, with every feature and how to install it. Reply to this email or WhatsApp +91 78270 07676 and we will set you up. Pricing is on request.",
};
export const DEFAULT_SUBJECT = "{first_name}, clip GTA 6 and any stream with FODO Studio";
export const VARS = ["first_name", "business_name", "city"];

const p = (s, n) => T.plain(s, n).trim();
export function cleanCopy(c) {
  c = c || {}; const d = DEFAULT_COPY;
  const ben = (Array.isArray(c.benefits) ? c.benefits : d.benefits).slice(0, 3).map((b) => ({ title: p(b && b.title, 80).replace(/\|/g, "/"), text: p(b && b.text, 200) }));
  while (ben.length < 3) ben.push({ title: "", text: "" });
  const out = { eyebrow: p(c.eyebrow != null ? c.eyebrow : d.eyebrow, 80), headline: p(c.headline != null ? c.headline : d.headline, 160), intro: p(c.intro != null ? c.intro : d.intro, 3000),
    benefits: ben, stats: p(c.stats != null ? c.stats : d.stats, 600).split("\n").slice(0, 4).join("\n"), cta_text: p(c.cta_text != null ? c.cta_text : d.cta_text, 60),
    cta_link: p(c.cta_link != null ? c.cta_link : d.cta_link, 500), closing: p(c.closing != null ? c.closing : d.closing, 2000) };
  if (out.cta_text && out.cta_link && !T.safeUrl(out.cta_link)) throw err("The button link must start with https://, mailto: or tel:.");
  return out;
}
/* the template's blocks for one recipient */
function blocksFor(copy, v, presLink) {
  const f = (s) => T.fill(s, v);
  let closing = f(copy.closing);
  if (presLink) closing = (closing ? closing + "\n\n" : "") + "See the presentation: " + presLink;
  return { eyebrow: f(copy.eyebrow), headline: f(copy.headline), intro: f(copy.intro),
    items: copy.benefits.filter((b) => b.title || b.text).map((b) => f(b.title) + " | " + f(b.text)).join("\n"), stats: f(copy.stats),
    cta_text: f(copy.cta_text), cta_link: /^\{[a-z_]+\}$/.test(copy.cta_link) ? f(copy.cta_link) : copy.cta_link.replace(/\{([a-z_]+)\}/g, (m, x) => (Object.prototype.hasOwnProperty.call(v, x) ? encodeURIComponent(v[x]) : m)), closing };
}
export const varsOf = (r) => { const v = T.varsFor({ name: r.name, business: r.business, city: r.city, email: r.email }); return { first_name: v.first_name, business_name: v.business_name || "your business", city: v.city }; };
/* build one email for one recipient: { subject, html, text, optOut } */
export async function render(env, camp, r, opts) {
  opts = opts || {}; const v = varsOf(r);
  const subject = (opts.test ? "[TEST] " : "") + T.fill(camp.subject, v).replace(/\s+/g, " ").trim().slice(0, 200);
  const optOut = await OR.optOutUrl(env, r.email);
  const m = T.renderMail({ subject, blocks: blocksFor(camp.copy, v, camp.pres_link), optOutUrl: optOut, attachments: camp.pres ? [camp.pres] : [] });
  return { subject, html: m.html, text: m.text, optOut };
}

/* ---------------- recipients: CSV / pasted list ---------------- */
export function parseCsv(txt) {
  const rows = []; let row = [], cell = "", q = false; txt = String(txt || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < txt.length; i++) { const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true; else if (ch === "," || ch === ";" || ch === "\t") { row.push(cell); cell = ""; } else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; } else cell += ch; }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c));
}
const looksEmail = (s) => /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i.test(String(s || "").trim());
/* → { valid:[{email,name,business,city}], invalid:[{line,value}], duplicates:[email] } (the email column is required) */
export function readList(txt) {
  const rows = parseCsv(T.plain(txt, 2e6)); let cols = { name: 0, business: 1, email: 2, city: 3 }, start = 0;
  if (rows.length && rows[0].some((c) => /^e-?mail/i.test(c))) { const h = rows[0].map((c) => c.toLowerCase().replace(/[^a-z]/g, "")); cols = {};
    h.forEach((c, i) => { if (/^e?mail|emailaddress/.test(c) && cols.email == null) cols.email = i; else if (/^(name|firstname|contact|contactname|fullname)$/.test(c) && cols.name == null) cols.name = i; else if (/^(business|businessname|company|brand|shop)$/.test(c) && cols.business == null) cols.business = i; else if (/^(city|town|location)$/.test(c) && cols.city == null) cols.city = i; });
    start = 1; }
  const valid = [], invalid = [], duplicates = [], seen = new Set();
  for (let i = start; i < rows.length; i++) {
    const r = rows[i]; let raw = cols.email != null ? r[cols.email] : "";
    if (cols.email == null || !raw) { const f = r.find(looksEmail); if (f) raw = f; else if (r.length === 1) raw = r[0]; }
    const email = looksEmail(raw) ? cleanEmail(raw) : "";
    if (!email) { invalid.push({ line: i + 1, value: T.plain(raw || r.join(", "), 120) }); continue; }
    if (seen.has(email)) { duplicates.push(email); continue; } seen.add(email);
    const g = (k) => (r.length > 1 && cols[k] != null && cols[k] !== cols.email ? p(r[cols[k]], k === "business" ? 160 : 120) : "");
    valid.push({ email, name: g("name"), business: g("business"), city: p(g("city"), 80) });
    if (valid.length > MAX_RCPT) throw err("Up to " + MAX_RCPT + " recipients per campaign.");
  }
  return { valid, invalid, duplicates };
}

/* ---------------- campaigns ---------------- */
const parse = (s, d) => { try { return JSON.parse(s); } catch (e) { return d; } };
const pubCamp = (r) => r && { id: r.id, name: r.name, subject: r.subject, copy: parse(r.copy, DEFAULT_COPY), pres: parse(r.pres, null), pres_link: r.pres_link || "", created_at: r.created_at, updated_at: r.updated_at, tested_at: r.tested_at || "" };
const hashOf = (c) => JSON.stringify([c.subject, c.copy, c.pres && c.pres.id, c.pres_link]);
export const testedOk = (c, row) => !!(row.tested_at && row.tested_hash === hashOf(c));
async function getCamp(d, id) { const r = await one(d, "SELECT * FROM cm_pitch WHERE id=?1", String(id || "")); if (!r) throw err("That pitch campaign was not found.", 404); return { row: r, camp: pubCamp(r) }; }

export async function savePres(env, b) {
  b = b || {}; const name = String(b.name || ""), mime = String(b.mime || "");
  if (!/\.pdf$/i.test(name) || (mime && mime !== "application/pdf")) throw err("The presentation must be a PDF file.");
  const b64 = String(b.file || "").replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  if (Math.floor(b64.length * 3 / 4) > PDF_MAX) throw err("The PDF can be up to 10 MB.");
  if (!/^JVBER/.test(b64)) throw err("That file is not a PDF. Export the presentation as PDF and upload it again.");
  return OR.attach(env, { file: b64, name, mime: "application/pdf" });
}
export async function saveCampaign(env, b, admin) {
  const d = await pdb(env); b = b || {};
  const name = p(b.name, 120); if (!name) throw err("Give the campaign a name.");
  const subject = p(b.subject != null ? b.subject : DEFAULT_SUBJECT, 300).replace(/\s+/g, " "); if (!subject) throw err("Add a subject.");
  const copy = cleanCopy(b.copy);
  let pres = null; const presId = b.pres && b.pres.id;
  if (presId) { if (!env.CHAT_KV) throw err("Attachments need the CHAT_KV storage on the website.", 503);
    const r = await env.CHAT_KV.getWithMetadata("cm:att:" + String(presId)); if (!r || r.value == null || !r.metadata) throw err("The presentation file is no longer available. Upload it again.", 410);
    if (r.metadata.mime !== "application/pdf") throw err("The presentation must be a PDF file."); pres = { id: String(presId), name: r.metadata.name, mime: "application/pdf", size: r.metadata.size }; }
  const pres_link = p(b.pres_link, 500); if (pres_link && !/^https:\/\/[^\s"'<>]{3,500}$/.test(pres_link)) throw err("The presentation link must start with https://.");
  if (!pres && !pres_link) throw err("Add the presentation: upload a PDF or paste a link.");
  const t = nowIso();
  if (b.id) { const { row } = await getCamp(d, b.id);
    await run(d, "UPDATE cm_pitch SET name=?2, subject=?3, copy=?4, pres=?5, pres_link=?6, updated_at=?7 WHERE id=?1", row.id, name, subject, JSON.stringify(copy), pres ? JSON.stringify(pres) : null, pres_link, t);
    return { campaign: await campaign(env, row.id) }; }
  const id = "pc_" + randId(12);
  await run(d, "INSERT INTO cm_pitch (id,name,subject,copy,pres,pres_link,admin,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)", id, name, subject, JSON.stringify(copy), pres ? JSON.stringify(pres) : null, pres_link, T.plain(admin, 254), t);
  return { campaign: await campaign(env, id) };
}
/* load a list into a campaign. Queued (not yet sent) recipients are replaced; sent ones stay sent and are not queued again unless override. */
export async function loadRecipients(env, id, b) {
  const d = await pdb(env); const { row } = await getCamp(d, id); b = b || {};
  const L = readList(b.csv || b.text || "");
  const unsub = new Set((await all(d, "SELECT email FROM camp_unsub")).map((x) => x.email));
  const prior = new Map((await all(d, "SELECT email, status FROM cm_pitch_rcpt WHERE campaign_id=?1", row.id)).map((x) => [x.email, x.status]));
  const sentBefore = new Set((await all(d, "SELECT DISTINCT email FROM cm_sends WHERE campaign_id=?1 AND test=0 AND status='sent'", row.id)).map((x) => x.email));
  if (!b.append) await run(d, "DELETE FROM cm_pitch_rcpt WHERE campaign_id=?1 AND status IN ('queued','opted_out','failed')", row.id);
  const optedOut = [], already = [], queued = [], t = nowIso();
  for (const r of L.valid) {
    if (unsub.has(r.email)) { optedOut.push(r.email); continue; }
    if ((sentBefore.has(r.email) || prior.get(r.email) === "sent") && !b.override) { already.push(r.email); continue; }
    await run(d, "INSERT OR REPLACE INTO cm_pitch_rcpt (campaign_id,email,name,business,city,status,override,at) VALUES (?1,?2,?3,?4,?5,'queued',?6,?7)", row.id, r.email, r.name, r.business, r.city, b.override && (sentBefore.has(r.email) || prior.get(r.email) === "sent") ? 1 : 0, t);
    queued.push(r.email);
  }
  return { counts: { valid: L.valid.length, invalid: L.invalid.length, duplicate: L.duplicates.length, opted_out: optedOut.length, already_sent: already.length, queued: queued.length },
    invalid: L.invalid.slice(0, 100), duplicates: L.duplicates.slice(0, 100), opted_out: optedOut.slice(0, 100), already_sent: already.slice(0, 100), campaign: await campaign(env, row.id) };
}
export async function campaign(env, id) {
  const d = await pdb(env); const { row, camp } = await getCamp(d, id);
  const rcpt = await all(d, "SELECT email,name,business,city,status,send_id,provider_id,error,at FROM cm_pitch_rcpt WHERE campaign_id=?1 ORDER BY at, email LIMIT " + MAX_RCPT, row.id);
  const n = (s) => rcpt.filter((r) => r.status === s).length;
  const firstSend = await one(d, "SELECT MIN(at) AS at FROM cm_sends WHERE campaign_id=?1 AND test=0", row.id);
  const unsubAfter = firstSend && firstSend.at ? ((await one(d, "SELECT COUNT(*) AS n FROM camp_unsub u JOIN cm_pitch_rcpt r ON r.email=u.email AND r.campaign_id=?1 AND r.status='sent' WHERE u.at >= ?2", row.id, firstSend.at)) || {}).n || 0 : 0;
  return Object.assign(camp, { tested: testedOk(camp, row), recipients: rcpt,
    summary: { total: rcpt.length, queued: n("queued"), sent: n("sent"), failed: n("failed"), opted_out: n("opted_out"), unsubscribed: unsubAfter, opened: null } });
}
export async function list(env) {
  const d = await pdb(env);
  const rows = await all(d, "SELECT p.id,p.name,p.subject,p.updated_at,p.tested_at, (SELECT COUNT(*) FROM cm_pitch_rcpt r WHERE r.campaign_id=p.id) AS total, (SELECT COUNT(*) FROM cm_pitch_rcpt r WHERE r.campaign_id=p.id AND r.status='sent') AS sent, (SELECT COUNT(*) FROM cm_pitch_rcpt r WHERE r.campaign_id=p.id AND r.status='failed') AS failed FROM cm_pitch p ORDER BY p.updated_at DESC LIMIT 100");
  const pv = await OR.provider(env);
  return { campaigns: rows, defaults: { subject: DEFAULT_SUBJECT, copy: DEFAULT_COPY }, vars: VARS,
    config: { configured: !!pv.via, provider: pv.via === "gmail" ? "Gmail (" + pv.account + ")" : pv.via === "resend" ? "Resend" : "", hourly: OR.hourly(env), used: await OR.usedThisHour(env), batch: batchSize(env), delayMs: delayMs(env), attach: !!env.CHAT_KV, opens: false } };
}
/* preview for one recipient (by email from the list, or a sample) */
export async function preview(env, id, b) {
  const d = await pdb(env); b = b || {};
  let camp, r = null;
  if (id) camp = (await getCamp(d, id)).camp;
  else camp = { subject: p(b.subject || DEFAULT_SUBJECT, 300), copy: cleanCopy(b.copy), pres: b.pres && b.pres.name ? { name: p(b.pres.name, 140), size: +b.pres.size || 0 } : null, pres_link: p(b.pres_link, 500) };
  if (id && b.email) r = await one(d, "SELECT email,name,business,city FROM cm_pitch_rcpt WHERE campaign_id=?1 AND email=?2", camp.id, cleanEmail(b.email));
  if (!r && id) r = await one(d, "SELECT email,name,business,city FROM cm_pitch_rcpt WHERE campaign_id=?1 ORDER BY at, email LIMIT 1", camp.id);
  if (!r) r = { email: "prospect@example.com", name: "Aman Verma", business: "Aman Gaming", city: "Delhi" };
  const m = await render(env, camp, r);
  const empty = VARS.filter((k) => !varsOf(r)[k] && (camp.subject + JSON.stringify(camp.copy)).indexOf("{" + k + "}") > -1);
  return { to: r.email, subject: m.subject, html: m.html, text: m.text, empty, attachments: camp.pres ? [{ name: camp.pres.name, size: camp.pres.size }] : [] };
}

/* ---------------- sending ---------------- */
async function files(env, camp) { if (!camp.pres) return []; const v = await env.CHAT_KV.get("cm:att:" + camp.pres.id); if (v == null) throw err("The presentation file is no longer available. Upload it again.", 410); return [Object.assign({}, camp.pres, { data: v })]; }
async function sendOne(env, d, camp, r, admin, test) {
  const m = await render(env, camp, r, { test }), id = "cm_" + randId(14), t = nowIso();
  await run(d, "INSERT INTO cm_sends (id,at,last_at,admin,client_id,email,type,subject,status,test,marketing,attempts,html,text,atts,campaign_id) VALUES (?1,?2,?2,?3,'',?4,?5,?6,'sending',?7,1,1,?8,?9,?10,?11)",
    id, t, T.plain(admin, 254), r.email, TYPE, m.subject, test ? 1 : 0, m.html, m.text, JSON.stringify(camp.pres ? [camp.pres] : []), camp.id);
  let res;
  try { res = await OR.deliver(env, { id, to: r.email, subject: m.subject, html: m.html, text: m.text, files: await files(env, camp), optOut: m.optOut }); }
  catch (e) { await run(d, "UPDATE cm_sends SET status='failed', error=?2, last_at=?3 WHERE id=?1", id, String(e.message || e).slice(0, 300), nowIso()); throw e; }
  await run(d, "UPDATE cm_sends SET status=?2, provider_id=?3, error=?4, last_at=?5 WHERE id=?1", id, res.ok ? "sent" : "failed", res.ok ? res.id : null, res.ok ? null : res.error, nowIso());
  await mailLog(env, { kind: "client_" + TYPE, from: OR.fromAddr(env), to: r.email, subject: m.subject, text: m.text.slice(0, 20000), status: res.ok ? "sent" : "failed", providerId: res.ok ? res.id : null, error: res.ok ? null : res.error, by: admin }).catch(() => {});
  return { id, ok: !!(res.ok && res.id), provider_id: res.ok ? res.id : null, error: res.ok ? null : res.error || "not sent" };
}
/* test to the admin's own email; required before the real send */
export async function testSend(env, id, b, admin) {
  const d = await pdb(env); const { row, camp } = await getCamp(d, id); b = b || {};
  const to = cleanEmail(b.to || admin); if (!to) throw err("Enter a valid email for the test.");
  const used = await one(d, "SELECT COUNT(*) AS n FROM cm_sends WHERE test=1 AND last_at > ?1", new Date(Date.now() - 3600e3).toISOString());
  if (used && used.n >= 40) throw err("Too many test emails this hour. Try again a bit later.", 429, { limit: true });
  const sample = (b.email && (await one(d, "SELECT email,name,business,city FROM cm_pitch_rcpt WHERE campaign_id=?1 AND email=?2", row.id, cleanEmail(b.email)))) || (await one(d, "SELECT email,name,business,city FROM cm_pitch_rcpt WHERE campaign_id=?1 ORDER BY at, email LIMIT 1", row.id)) || { name: "Aman Verma", business: "Aman Gaming", city: "Delhi" };
  const r = await sendOne(env, d, camp, Object.assign({}, sample, { email: to }), admin, true);
  if (!r.ok) throw err("The test was not sent: " + r.error, 502);
  await run(d, "UPDATE cm_pitch SET tested_at=?2, tested_hash=?3 WHERE id=?1", row.id, nowIso(), hashOf(camp));
  return { test: { to, provider_id: r.provider_id }, campaign: await campaign(env, row.id) };
}
/* one batch of the real send. The page calls this again until nothing is queued (or the hourly cap pauses it). */
export async function sendBatch(env, id, b, admin) {
  const d = await pdb(env); const { row, camp } = await getCamp(d, id); b = b || {};
  if (!b.confirm) throw err("Please confirm the send first.", 400, { needConfirm: true });
  if (!testedOk(camp, row)) throw err("Send a test to yourself first. The campaign changed since the last test, or has not been tested.", 409, { needTest: true });
  const q = await all(d, "SELECT * FROM cm_pitch_rcpt WHERE campaign_id=?1 AND status='queued' ORDER BY at, email LIMIT ?2", row.id, batchSize(env));
  const done = [];
  for (let i = 0; i < q.length; i++) {
    const r = q[i];
    if ((await OR.usedThisHour(env)) >= OR.hourly(env)) return Object.assign({ paused: "limit", reason: "Hourly limit reached (" + OR.hourly(env) + " emails per hour). The rest stays queued: press Continue later.", done }, { campaign: await campaign(env, row.id) });
    if (await one(d, "SELECT email FROM camp_unsub WHERE email=?1", r.email)) { await run(d, "UPDATE cm_pitch_rcpt SET status='opted_out', at=?3 WHERE campaign_id=?1 AND email=?2", row.id, r.email, nowIso()); done.push({ email: r.email, status: "opted_out" }); continue; }
    if (!r.override && (await one(d, "SELECT id FROM cm_sends WHERE campaign_id=?1 AND email=?2 AND test=0 AND status='sent' LIMIT 1", row.id, r.email))) { await run(d, "UPDATE cm_pitch_rcpt SET status='sent', at=?3 WHERE campaign_id=?1 AND email=?2", row.id, r.email, nowIso()); done.push({ email: r.email, status: "already_sent" }); continue; }
    if (i > 0) await sleep(delayMs(env));
    let s; try { s = await sendOne(env, d, camp, r, admin, false); } catch (e) { s = { ok: false, error: String(e.message || e).slice(0, 300) }; if (e.setup) { await run(d, "UPDATE cm_pitch_rcpt SET status='failed', error=?3, at=?4 WHERE campaign_id=?1 AND email=?2", row.id, r.email, s.error, nowIso()); throw e; } }
    await run(d, "UPDATE cm_pitch_rcpt SET status=?3, send_id=?4, provider_id=?5, error=?6, at=?7 WHERE campaign_id=?1 AND email=?2", row.id, r.email, s.ok ? "sent" : "failed", s.id || null, s.ok ? s.provider_id : null, s.ok ? null : s.error, nowIso());
    done.push({ email: r.email, status: s.ok ? "sent" : "failed", error: s.ok ? null : s.error });
  }
  const c = await campaign(env, row.id);
  return { done, more: c.summary.queued > 0, campaign: c, used: await OR.usedThisHour(env), hourly: OR.hourly(env) };
}
export async function retryFailed(env, id) {
  const d = await pdb(env); const { row } = await getCamp(d, id);
  const r = await run(d, "UPDATE cm_pitch_rcpt SET status='queued', error=NULL WHERE campaign_id=?1 AND status='failed'", row.id);
  return { requeued: (r.meta && r.meta.changes) || 0, campaign: await campaign(env, row.id) };
}
