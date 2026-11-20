/* FODO v53.8 Admin ▸ Email campaigns (owners only).
   Upload an Excel (.xlsx) or CSV list of people, write one message (with {first_name}, {name}, {company}), attach a file
   (the FODO Studio pitch PDF), send yourself a test, then send to everyone. Each person gets their OWN email (never one mail with
   everyone in To/CC), from FODO's Gmail mailbox (anmol@fodo.co.in, the same Google connection as Admin ▸ Studio ▸ Inbox), so
   replies land in that inbox and can be answered with a FODO Studio key. Without the Gmail connection it falls back to Resend.

   Sending runs in small batches while the Admin page is open (Cloudflare limits how long one request may run); a daily cap keeps
   the mailbox inside Google's sending limits. Everyone can opt out: every mail says "reply STOP", "Check replies" turns a STOP
   reply into a permanent opt-out (camp_unsub) and nobody on that list is ever mailed again by any campaign. */
import { db as adb, cleanEmail, nowIso, randId, sendMail } from "./accounts.js";
import { parseCsv } from "./crm.js";
import * as SCH from "./schema.js";

const err = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").slice(0, n);
const all = async (d, sql, ...a) => (await d.prepare(sql).bind(...a).all()).results || [];
const one = (d, sql, ...a) => d.prepare(sql).bind(...a).first();
const run = (d, sql, ...a) => d.prepare(sql).bind(...a).run();
export const MAX_RECIPIENTS = 5000, MAX_ATTACH = 10 * 1048576, BATCH = 8;
export const dailyCap = (env) => Math.max(10, Math.min(1800, +((env && env.CAMPAIGN_DAILY_CAP) || 500)));

const DDL = [
  "CREATE TABLE IF NOT EXISTS camp_campaigns (id TEXT PRIMARY KEY, name TEXT, subject TEXT, body TEXT, att_name TEXT, att_mime TEXT, att_size INTEGER, status TEXT, total INTEGER, created_by TEXT, created_at TEXT, updated_at TEXT, started_at TEXT, done_at TEXT)",
  "CREATE TABLE IF NOT EXISTS camp_recips (id TEXT PRIMARY KEY, campaign_id TEXT, email TEXT, name TEXT, company TEXT, status TEXT, error TEXT, via TEXT, msg_id TEXT, thread_id TEXT, sent_at TEXT, reply_at TEXT, reply_text TEXT, key_sent_at TEXT)",
  "CREATE UNIQUE INDEX IF NOT EXISTS camp_recips_ce ON camp_recips(campaign_id, email)",
  "CREATE INDEX IF NOT EXISTS camp_recips_cs ON camp_recips(campaign_id, status)",
  "CREATE INDEX IF NOT EXISTS camp_recips_sent ON camp_recips(sent_at)",
  "CREATE TABLE IF NOT EXISTS camp_unsub (email TEXT PRIMARY KEY, at TEXT, why TEXT)",
];
export async function campDb(env) { const d = await adb(env); await SCH.setup(d, "campaigns", () => SCH.ddl(d, DDL)); return d; }

/* ---------------- reading the uploaded sheet: .xlsx (a zip of XML) or .csv ---------------- */
const b64ToBytes = (b64) => { const s = atob(String(b64 || "").replace(/^data:[^,]*,/, "").replace(/\s+/g, "")), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
const u16 = (b, o) => b[o] | (b[o + 1] << 8), u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
async function inflateRaw(bytes) {
  const ds = new DecompressionStream("deflate-raw"), out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}
/* the files inside a zip, via the central directory (works for every Excel / Google Sheets / LibreOffice export) */
export async function unzip(bytes, want) {
  let e = -1; for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (u32(bytes, i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw err("This doesn't look like an Excel file. Save it as .xlsx or .csv and try again.");
  const n = u16(bytes, e + 10); let p = u32(bytes, e + 16); const out = {};
  for (let k = 0; k < n; k++) {
    if (u32(bytes, p) !== 0x02014b50) break;
    const method = u16(bytes, p + 10), csize = u32(bytes, p + 20), nlen = u16(bytes, p + 28), xlen = u16(bytes, p + 30), clen = u16(bytes, p + 32), off = u32(bytes, p + 42);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nlen)); p += 46 + nlen + xlen + clen;
    if (!want(name)) continue;
    const lo = off + 30 + u16(bytes, off + 26) + u16(bytes, off + 28), data = bytes.subarray(lo, lo + csize);
    out[name] = new TextDecoder().decode(method === 0 ? data : method === 8 ? await inflateRaw(data) : new Uint8Array());
  }
  return out;
}
const ent = (s) => String(s).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const texts = (xml) => { let t = ""; xml.replace(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, (_, x) => { t += ent(x); return ""; }); return t; };
const colIdx = (ref) => { const m = /^([A-Z]+)/.exec(ref || ""); if (!m) return -1; let n = 0; for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
export async function readXlsx(bytes) {
  const files = await unzip(bytes, (n) => /^xl\/(sharedStrings\.xml|workbook\.xml|_rels\/workbook\.xml\.rels|worksheets\/sheet\d+\.xml)$/.test(n));
  const shared = []; (files["xl/sharedStrings.xml"] || "").replace(/<si>([\s\S]*?)<\/si>/g, (_, x) => { shared.push(texts(x)); return ""; });
  let sheet = "";   // the first sheet in the workbook's order
  const first = /<sheet\b[^>]*r:id="([^"]+)"/.exec(files["xl/workbook.xml"] || ""), rels = files["xl/_rels/workbook.xml.rels"] || "";
  if (first) { const m = new RegExp('Id="' + first[1] + '"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="' + first[1] + '"').exec(rels); if (m) sheet = "xl/" + String(m[1] || m[2]).replace(/^\/?xl\//, "").replace(/^\//, ""); }
  if (!files[sheet]) sheet = Object.keys(files).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  if (!sheet || !files[sheet]) throw err("Couldn't find a sheet in this Excel file.");
  const rows = [];
  files[sheet].replace(/<row\b[^>]*>([\s\S]*?)<\/row>/g, (_, rx) => {
    const r = []; let auto = 0;
    rx.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (__, attrs, inner) => {
      const ref = (/\br="([A-Z]+\d+)"/.exec(attrs) || [])[1], t = (/\bt="([^"]+)"/.exec(attrs) || [])[1] || "n";
      const i = ref ? colIdx(ref) : auto; auto = i + 1; inner = inner || "";
      const v = (/<v>([\s\S]*?)<\/v>/.exec(inner) || [])[1];
      let val = t === "s" ? shared[+v] || "" : t === "inlineStr" ? texts(inner) : v != null ? ent(v) : "";
      if (t === "b") val = v === "1" ? "TRUE" : "FALSE";
      if (i >= 0 && i < 200) r[i] = String(val).trim();
      return "";
    });
    for (let k = 0; k < r.length; k++) if (r[k] == null) r[k] = "";
    if (r.some((x) => x)) rows.push(r);
    return "";
  });
  return rows;
}
export async function readSheet(b64, filename) {
  const bytes = b64ToBytes(b64);
  if (!bytes.length) throw err("The file is empty.");
  if (bytes.length > 8 * 1048576) throw err("The sheet can be up to 8 MB.");
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (/\.xls$/i.test(filename || "") && !isZip) throw err("Old .xls files aren't supported. In Excel: File, Save As, Excel Workbook (.xlsx) or CSV.");
  if (isZip) return readXlsx(bytes);
  return parseCsv(new TextDecoder().decode(bytes));
}

/* which column is the email, the name, the company. Headers first; otherwise the column that is mostly emails. */
const HEAD = { email: /e-?mail/i, name: /^(full ?)?name$|contact( name)?|client( name)?|customer( name)?|^name\b/i, first: /^first/i, last: /^(last|sur)/i, company: /company|business|organi[sz]ation|firm|brand|agency/i };
export function mapColumns(rows) {
  const head = (rows[0] || []).map((h) => String(h || "").trim()), map = {};
  Object.keys(HEAD).forEach((k) => { const i = head.findIndex((h) => HEAD[k].test(h) && !(k === "name" && HEAD.email.test(h))); if (i > -1) map[k] = i; });
  let header = map.email != null || map.name != null;
  if (map.email == null) {   // no "Email" header: pick the column that holds the most email addresses
    let best = -1, bestN = 0; const w = Math.max(...rows.slice(0, 50).map((r) => r.length), 0);
    for (let c = 0; c < w; c++) { const n = rows.slice(0, 200).filter((r) => cleanEmail(r[c])).length; if (n > bestN) { best = c; bestN = n; } }
    if (best > -1) { map.email = best; if (cleanEmail(head[best])) header = false; }
  }
  if (map.email == null) throw err("Couldn't find an email column. Put the emails in a column called Email.");
  return { map, header, headers: head };
}
const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "";
export function recipientsFrom(rows, m, unsub) {
  const out = [], seen = new Set(); let invalid = 0, dups = 0, optedOut = 0;
  rows.slice(m.header ? 1 : 0).forEach((r) => {
    const email = cleanEmail(r[m.map.email]); if (!email) { if (String(r[m.map.email] || "").trim()) invalid++; return; }
    if (seen.has(email)) { dups++; return; } seen.add(email);
    if (unsub && unsub.has(email)) { optedOut++; return; }
    let name = m.map.name != null ? r[m.map.name] : [m.map.first != null ? r[m.map.first] : "", m.map.last != null ? r[m.map.last] : ""].join(" ");
    name = clip(String(name || "").replace(/\s+/g, " ").trim(), 120);
    out.push({ email, name, company: m.map.company != null ? clip(String(r[m.map.company] || "").trim(), 120) : "" });
  });
  return { list: out.slice(0, MAX_RECIPIENTS), invalid, duplicates: dups, optedOut, truncated: out.length > MAX_RECIPIENTS };
}
async function unsubSet(d) { return new Set((await all(d, "SELECT email FROM camp_unsub")).map((x) => x.email)); }

/* preview before saving: what will be imported */
export async function parse(env, b) {
  const d = await campDb(env), rows = await readSheet(b.file, b.filename);
  if (rows.length < 1) throw err("The sheet has no rows.");
  const m = mapColumns(rows), r = recipientsFrom(rows, m, await unsubSet(d));
  const label = (k) => (m.map[k] != null ? (m.header ? m.headers[m.map[k]] || "Column " + (m.map[k] + 1) : "Column " + (m.map[k] + 1)) : "");
  return { rows: rows.length - (m.header ? 1 : 0), valid: r.list.length, invalid: r.invalid, duplicates: r.duplicates, optedOut: r.optedOut, truncated: r.truncated,
    columns: { email: label("email"), name: label("name") || [label("first"), label("last")].filter(Boolean).join(" + "), company: label("company") }, preview: r.list.slice(0, 8) };
}

/* ---------------- the message ---------------- */
export const FOOTER = "You're getting this one email from FODO (fodo.co.in, New Delhi). If you'd rather not hear from us again, just reply STOP.";
export function fill(t, p) {
  const fn = firstName(p.name);
  return String(t || "").replace(/\{\s*first_?name\s*\}/gi, fn || "there").replace(/\{\s*name\s*\}/gi, p.name || fn || "there")
    .replace(/\{\s*company\s*\}/gi, p.company || "your business").replace(/\{\s*email\s*\}/gi, p.email || "");
}
const escH = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const linkify = (s) => s.replace(/\b(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" style="color:#7B61FF">$1</a>').replace(/(^|[\s(])((?:www\.)?fodo\.co\.in(?:\/[^\s<]*[^\s<.,;:!?)])?)/g, (m0, a, u) => a + '<a href="https://' + (u.startsWith("www.") ? u : "www." + u) + '" style="color:#7B61FF">' + u + "</a>");
export function render(c, p) {
  const text = fill(c.body, p).replace(/\r/g, "").trim() + "\n\n--\n" + FOOTER;
  const paras = fill(c.body, p).replace(/\r/g, "").trim().split(/\n{2,}/).map((x) => "<p style=\"margin:0 0 14px 0\">" + linkify(escH(x)).replace(/\n/g, "<br>") + "</p>").join("");
  const html = '<!doctype html><html><body style="margin:0;padding:0;background:#ffffff"><div style="max-width:620px;padding:8px 4px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#111111">' +
    paras + '<p style="margin:26px 0 0 0;padding-top:12px;border-top:1px solid #e5e5e5;font-size:12px;line-height:1.5;color:#777777">' + escH(FOOTER) + "</p></div></body></html>";
  return { subject: fill(c.subject, p).slice(0, 200), text, html };
}

/* ---------------- attachment (kept in KV as MIME-ready base64, so a send never re-encodes the file) ---------------- */
const attKey = (id) => "camp:att:" + id;
function wrapB64(s) { const out = []; for (let i = 0; i < s.length; i += 76) out.push(s.slice(i, i + 76)); return out.join("\r\n"); }
async function putAttachment(env, id, b) {
  if (!b.att) return null;
  if (!env.CHAT_KV) throw err("Attachments need the CHAT_KV storage on the website.", 400);
  const b64 = String(b.att).replace(/^data:[^,]*,/, "").replace(/\s+/g, ""), size = Math.floor(b64.length * 3 / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
  if (!/^[A-Za-z0-9+/]+=*$/.test(b64)) throw err("The attachment could not be read. Choose the file again.");
  if (size > MAX_ATTACH) throw err("The attachment can be up to 10 MB.");
  const name = clip(b.att_name || "attachment", 120).replace(/["\\\r\n]/g, "") || "attachment";
  const mime = /^[a-z]+\/[a-z0-9.+-]+$/i.test(b.att_mime || "") ? b.att_mime : /\.pdf$/i.test(name) ? "application/pdf" : "application/octet-stream";
  await env.CHAT_KV.put(attKey(id), wrapB64(b64));
  return { name, mime, size };
}
const getAttachment = async (env, c) => (c.att_name && env.CHAT_KV ? env.CHAT_KV.get(attKey(c.id)) : null);

/* ---------------- sending ---------------- */
const b64e = (s) => { const u = new TextEncoder().encode(s); let b = ""; for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(b); };
const hdrEnc = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : "=?UTF-8?B?" + b64e(s) + "?=");
const fileHdr = (s) => (/^[\x20-\x7e]*$/.test(s) ? '"' + s + '"' : "UTF-8''" + encodeURIComponent(s));
export function mime(from, to, m, att) {
  const mix = "fodo_m_" + randId(10), alt = "fodo_a_" + randId(10);
  const L = ["From: " + hdrEnc("Anmol from FODO") + " <" + from + ">", "To: " + to, "Subject: " + hdrEnc(m.subject), "MIME-Version: 1.0",
    "List-Unsubscribe: <mailto:" + from + "?subject=STOP>"];
  const altPart = ["Content-Type: multipart/alternative; boundary=\"" + alt + "\"", "", "--" + alt, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrapB64(b64e(m.text)),
    "--" + alt, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrapB64(b64e(m.html)), "--" + alt + "--"];
  if (!att) return L.concat(altPart, [""]).join("\r\n");
  return L.concat(["Content-Type: multipart/mixed; boundary=\"" + mix + "\"", "", "--" + mix], altPart,
    ["--" + mix, "Content-Type: " + att.mime + "; name=" + fileHdr(att.name), "Content-Disposition: attachment; filename" + (/^[\x20-\x7e]*$/.test(att.name) ? "=" : "*=") + fileHdr(att.name), "Content-Transfer-Encoding: base64", "", att.data, "--" + mix + "--", ""]).join("\r\n");
}
/* which way mail goes: FODO's Gmail mailbox when it is connected (replies come back to it), else Resend */
async function sender(env) {
  try { const IB = await import("./sinbox.js"), s = await IB.status(env); if (s.connected) return { via: "gmail", account: s.account }; } catch (e) {}
  if (env.RESEND_API_KEY) return { via: "resend", account: "" };
  throw err("No way to send email yet: log in with Google in Admin ▸ Studio ▸ Inbox (anmol@fodo.co.in), or set RESEND_API_KEY.", 409);
}
async function deliver(env, how, to, m, att, by) {
  if (how.via === "gmail") {
    const GO = await import("./brain/google.js");
    const r = await GO.g(env, how.account, "https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media", { method: "POST", raw: true, headers: { "content-type": "message/rfc822" }, body: mime(how.account, to, m, att) });
    return { id: r.id || "", thread: r.threadId || "", via: "gmail" };
  }
  const { STUDIO_FROM, STUDIO_REPLY } = await import("./slicense.js");
  await sendMail(env, to, m.subject, m.html, m.text, { from: STUDIO_FROM(env), replyTo: STUDIO_REPLY(env), kind: "campaign", by,
    attachments: att ? [{ filename: att.name, content: att.data.replace(/\r\n/g, "") }] : undefined, headers: { "List-Unsubscribe": "<mailto:" + STUDIO_REPLY(env) + "?subject=STOP>" } });
  return { id: "", thread: "", via: "resend" };
}
async function sentToday(d) {
  const ist = new Date(Date.now() + 5.5 * 3600e3), start = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 5.5 * 3600e3).toISOString();
  return (await one(d, "SELECT COUNT(*) n FROM camp_recips WHERE sent_at >= ?1", start)).n || 0;
}

/* ---------------- campaigns ---------------- */
async function counts(d, id) {
  const c = { pending: 0, sent: 0, failed: 0, skipped: 0, replied: 0, stopped: 0 };
  (await all(d, "SELECT status, COUNT(*) n FROM camp_recips WHERE campaign_id=?1 GROUP BY status", id)).forEach((r) => { c[r.status] = r.n; });
  c.total = Object.values(c).reduce((a, b) => a + b, 0); c.delivered = c.sent + c.replied + c.stopped; return c;
}
const out = (c) => ({ id: c.id, name: c.name, subject: c.subject, body: c.body, attachment: c.att_name ? { name: c.att_name, mime: c.att_mime, size: c.att_size } : null, status: c.status, total: c.total, created_by: c.created_by, created_at: c.created_at, started_at: c.started_at, done_at: c.done_at });
async function getC(d, id) { const c = await one(d, "SELECT * FROM camp_campaigns WHERE id=?1", clip(id, 40)); if (!c) throw err("Campaign not found.", 404); return c; }
const checkText = (b) => {
  const subject = clip(b.subject, 200).trim(), body = clip(b.body, 20000).trim();
  if (!subject) throw err("Write a subject."); if (body.length < 10) throw err("Write the message.");
  return { subject, body };
};
export async function create(env, b, by) {
  const d = await campDb(env), t = checkText(b);
  if (!b.file) throw err("Upload the Excel or CSV list first.");
  const rows = await readSheet(b.file, b.filename), m = mapColumns(rows), r = recipientsFrom(rows, m, await unsubSet(d));
  if (!r.list.length) throw err("No valid email addresses found in the sheet.");
  const id = "cp" + randId(14), now = nowIso(), att = await putAttachment(env, id, b);
  await run(d, "INSERT INTO camp_campaigns (id, name, subject, body, att_name, att_mime, att_size, status, total, created_by, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'draft',?8,?9,?10,?10)",
    id, clip(b.name, 120).trim() || t.subject.slice(0, 80), t.subject, t.body, att ? att.name : null, att ? att.mime : null, att ? att.size : null, r.list.length, clip(by, 160), now);
  for (let i = 0; i < r.list.length; i += 90) await d.batch(r.list.slice(i, i + 90).map((p) => d.prepare("INSERT OR IGNORE INTO camp_recips (id, campaign_id, email, name, company, status) VALUES (?1,?2,?3,?4,?5,'pending')").bind("cr" + randId(14), id, p.email, p.name, p.company)));
  return { campaign: out(await getC(d, id)), counts: await counts(d, id), skipped: { invalid: r.invalid, duplicates: r.duplicates, optedOut: r.optedOut, truncated: r.truncated } };
}
export async function list(env) {
  const d = await campDb(env), L = await all(d, "SELECT * FROM camp_campaigns ORDER BY created_at DESC LIMIT 100");
  const items = []; for (const c of L) items.push(Object.assign(out(c), { counts: await counts(d, c.id) }));
  let how = null; try { how = await sender(env); } catch (e) { how = { via: null, reason: e.message }; }
  return { items, sender: how, cap: dailyCap(env), today: await sentToday(d), optedOut: (await one(d, "SELECT COUNT(*) n FROM camp_unsub")).n || 0 };
}
export async function detail(env, id, q) {
  const d = await campDb(env), c = await getC(d, id), st = clip((q && q.status) || "", 20), off = Math.max(0, +((q && q.offset) || 0));
  const rows = st ? await all(d, "SELECT * FROM camp_recips WHERE campaign_id=?1 AND status=?2 ORDER BY COALESCE(reply_at, sent_at, '') DESC, email LIMIT 200 OFFSET ?3", c.id, st, off)
    : await all(d, "SELECT * FROM camp_recips WHERE campaign_id=?1 ORDER BY CASE status WHEN 'replied' THEN 0 WHEN 'failed' THEN 1 WHEN 'stopped' THEN 2 WHEN 'sent' THEN 3 ELSE 4 END, COALESCE(reply_at, sent_at, '') DESC, email LIMIT 200 OFFSET ?2", c.id, off);
  let how = null; try { how = await sender(env); } catch (e) { how = { via: null, reason: e.message }; }
  return { campaign: out(c), counts: await counts(d, c.id), cap: dailyCap(env), today: await sentToday(d), sender: how,
    recipients: rows.map((r) => ({ id: r.id, email: r.email, name: r.name, company: r.company, status: r.status, error: r.error, via: r.via, sent_at: r.sent_at, reply_at: r.reply_at, reply: r.reply_text, key_sent_at: r.key_sent_at })) };
}
export async function update(env, id, b) {
  const d = await campDb(env), c = await getC(d, id); if (c.status === "done") throw err("This campaign is finished. Make a new one.");
  const t = checkText(b); await run(d, "UPDATE camp_campaigns SET subject=?2, body=?3, name=COALESCE(NULLIF(?4,''), name), updated_at=?5 WHERE id=?1", c.id, t.subject, t.body, clip(b.name, 120).trim(), nowIso());
  return detail(env, c.id);
}
export async function remove(env, id) {
  const d = await campDb(env), c = await getC(d, id);
  await d.batch([d.prepare("DELETE FROM camp_recips WHERE campaign_id=?1").bind(c.id), d.prepare("DELETE FROM camp_campaigns WHERE id=?1").bind(c.id)]);
  if (env.CHAT_KV) await env.CHAT_KV.delete(attKey(c.id)).catch(() => {});
  return { deleted: true };
}
/* a test mail to yourself, filled in with the first person's name (or a sample) */
export async function test(env, id, to, by) {
  const d = await campDb(env), c = await getC(d, id), dest = cleanEmail(to); if (!dest) throw err("Type the email for the test.");
  const p = (await one(d, "SELECT * FROM camp_recips WHERE campaign_id=?1 AND name != '' LIMIT 1", c.id)) || { name: "Ravi Kumar", company: "Example Studio", email: dest };
  const how = await sender(env), data = await getAttachment(env, c), m = render(c, p);
  const r = await deliver(env, how, dest, Object.assign({}, m, { subject: "[TEST] " + m.subject }), data ? { name: c.att_name, mime: c.att_mime, data } : null, by);
  return { test: true, to: dest, via: r.via, as: p.name || p.email };
}
export async function setStatus(env, id, status) {
  const d = await campDb(env), c = await getC(d, id);
  if (status === "sending" && c.status === "done") throw err("This campaign is finished.");
  await run(d, "UPDATE camp_campaigns SET status=?2, started_at=COALESCE(started_at, CASE WHEN ?2='sending' THEN ?3 END), updated_at=?3 WHERE id=?1", c.id, status, nowIso());
  return detail(env, c.id);
}
/* send the next few; the Admin page calls this again and again while "Sending" is on */
export async function batch(env, id, by) {
  const d = await campDb(env), c = await getC(d, id);
  if (c.status !== "sending") return Object.assign(await detail(env, c.id), { stop: "not_sending" });
  const cap = dailyCap(env), today = await sentToday(d), room = Math.min(BATCH, cap - today);
  if (room <= 0) return Object.assign(await detail(env, c.id), { stop: "daily_limit" });
  const how = await sender(env), data = await getAttachment(env, c), att = data ? { name: c.att_name, mime: c.att_mime, data } : null;
  if (c.att_name && !data) throw err("The attachment is missing from storage. Make the campaign again with the file.", 409);
  const unsub = await unsubSet(d), L = await all(d, "SELECT * FROM camp_recips WHERE campaign_id=?1 AND status='pending' ORDER BY rowid LIMIT ?2", c.id, room);
  let sent = 0, failed = 0;
  for (const p of L) {
    if (unsub.has(p.email)) { await run(d, "UPDATE camp_recips SET status='skipped', error='opted out' WHERE id=?1", p.id); continue; }
    try {
      const r = await deliver(env, how, p.email, render(c, p), att, by);
      await run(d, "UPDATE camp_recips SET status='sent', error=NULL, via=?2, msg_id=?3, thread_id=?4, sent_at=?5 WHERE id=?1", p.id, r.via, r.id, r.thread, nowIso()); sent++;
    } catch (e) {
      const msg = clip(e.message || e, 300);
      if (/\b(429|rate|quota|limit exceeded)\b/i.test(msg)) return Object.assign(await detail(env, c.id), { stop: "provider_limit", reason: "Gmail asked to slow down: " + msg, sent, failed });
      await run(d, "UPDATE camp_recips SET status='failed', error=?2, sent_at=?3 WHERE id=?1", p.id, msg, nowIso()); failed++;
    }
  }
  const left = (await one(d, "SELECT COUNT(*) n FROM camp_recips WHERE campaign_id=?1 AND status='pending'", c.id)).n || 0;
  if (!left) await run(d, "UPDATE camp_campaigns SET status='done', done_at=?2, updated_at=?2 WHERE id=?1", c.id, nowIso());
  return Object.assign(await detail(env, c.id), { sent, failed, stop: left ? null : "done" });
}
/* failed ones back to the queue */
export async function retry(env, id) {
  const d = await campDb(env), c = await getC(d, id);
  await run(d, "UPDATE camp_recips SET status='pending', error=NULL WHERE campaign_id=?1 AND status='failed'", c.id);
  if (c.status === "done") await run(d, "UPDATE camp_campaigns SET status='paused', done_at=NULL WHERE id=?1", c.id);
  return detail(env, c.id);
}
/* replies: a later message in the same Gmail thread from that person. "STOP" (or unsubscribe) = opt out for good. */
export const isStop = (t) => /^\s*(stop|unsubscribe|remove me|please remove|no thanks?|not interested)\b/i.test(String(t || ""));
export async function checkReplies(env, id) {
  const d = await campDb(env), c = await getC(d, id), how = await sender(env);
  if (how.via !== "gmail") throw err("Reply tracking needs the Gmail mailbox connected (Admin ▸ Studio ▸ Inbox).", 409);
  const GO = await import("./brain/google.js"), IB = await import("./sinbox.js");
  const L = await all(d, "SELECT * FROM camp_recips WHERE campaign_id=?1 AND status='sent' AND thread_id != '' ORDER BY COALESCE(reply_at,'') , sent_at LIMIT 40", c.id);
  let replied = 0, stopped = 0;
  for (const p of L) {
    let th; try { th = await GO.g(env, how.account, "https://gmail.googleapis.com/gmail/v1/users/me/threads/" + encodeURIComponent(p.thread_id) + "?format=metadata&metadataHeaders=From"); } catch (e) { continue; }
    const theirs = (th.messages || []).filter((m) => IB.emailOf(((m.payload && m.payload.headers) || []).filter((h) => h.name.toLowerCase() === "from").map((h) => h.value)[0]) === p.email);
    if (!theirs.length) continue;
    const last = theirs[theirs.length - 1], snip = clip(String(last.snippet || "").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&"), 400), at = new Date(+last.internalDate || Date.now()).toISOString();
    if (isStop(snip)) { stopped++; await run(d, "UPDATE camp_recips SET status='stopped', reply_at=?2, reply_text=?3 WHERE id=?1", p.id, at, snip); await run(d, "INSERT OR IGNORE INTO camp_unsub (email, at, why) VALUES (?1,?2,'replied STOP')", p.email, nowIso()); }
    else { replied++; await run(d, "UPDATE camp_recips SET status='replied', reply_at=?2, reply_text=?3 WHERE id=?1", p.id, at, snip); }
  }
  return Object.assign(await detail(env, c.id), { checked: L.length, replied, stopped });
}
/* the person asked for a key: send it in the same Gmail thread (Admin ▸ Studio's key mail) */
export async function sendKey(env, rid, b, by) {
  const d = await campDb(env), p = await one(d, "SELECT * FROM camp_recips WHERE id=?1", clip(rid, 40)); if (!p) throw err("Not found.", 404);
  const IB = await import("./sinbox.js"); let r;
  if (p.thread_id) {   // reply inside the thread: find their latest message in it
    const GO = await import("./brain/google.js"), s = await IB.status(env);
    const th = await GO.g(env, s.account, "https://gmail.googleapis.com/gmail/v1/users/me/threads/" + encodeURIComponent(p.thread_id) + "?format=minimal");
    const ms = th.messages || [], last = ms[ms.length - 1];
    try { r = await IB.sendKey(env, last ? { id: last.id, message: b.message } : { email: p.email, message: b.message }, by); }
    catch (e) { if (e.status && e.status < 500) throw e; r = await IB.sendKey(env, { email: p.email, message: b.message }, by); }   // thread gone: a new mail to them
  } else {
    const LIC = await import("./slicense.js"); r = await LIC.emailKey(env, p.email, clip(b.message, 1500), by, p.name);
  }
  await run(d, "UPDATE camp_recips SET key_sent_at=?2 WHERE id=?1", p.id, nowIso());
  return { key: r, campaign: p.campaign_id };
}
export async function unsubscribe(env, email, why) {
  const d = await campDb(env), e = cleanEmail(email); if (!e) throw err("Type a correct email.");
  await run(d, "INSERT OR REPLACE INTO camp_unsub (email, at, why) VALUES (?1,?2,?3)", e, nowIso(), clip(why || "added by FODO", 80));
  await run(d, "UPDATE camp_recips SET status='skipped', error='opted out' WHERE email=?1 AND status='pending'", e);
  return { unsubscribed: e };
}
