/* FODO v54.2 Admin ▸ Client Emails (owners and Full-control admins only).
   One page to keep a list of clients and send any of them any type of email (proposal, follow-up, welcome, invoice reminder,
   project update, report, custom) in the one fixed FODO design (_lib/clientmail.js). Content blocks and the subject change per
   client and per email; {variables} fill from the client record.

   Sending: Resend (RESEND_API_KEY, set as a Cloudflare secret, never in code). From CLIENT_MAIL_FROM, replies to CLIENT_MAIL_REPLY_TO.
   Safety: the server needs confirm:true for a real send; at most CLIENT_MAIL_HOURLY (default 20) real sends per hour; the same email
   type to the same client within 10 minutes is refused unless the admin overrides; a failed send stays "failed" (Retry re-sends
   the exact same email); marketing types carry an opt-out link and are never sent to someone on the opt-out list (camp_unsub,
   shared with Email campaigns). Every send, test or real, is logged in cm_sends. */
import { db as adb, cleanEmail, nowIso, randId, mailLog } from "./accounts.js";
import { outbound } from "./xray-core.js";
import * as T from "./clientmail.js";
import * as SCH from "./schema.js";

const err = (m, s, extra) => Object.assign(new Error(m), { status: s || 400 }, extra || {});
const all = async (d, sql, ...a) => (await d.prepare(sql).bind(...a).all()).results || [];
const one = (d, sql, ...a) => d.prepare(sql).bind(...a).first();
const run = (d, sql, ...a) => d.prepare(sql).bind(...a).run();
const SITE = "https://www.fodo.co.in";
export const DUP_MIN = 10;
export const hourly = (env) => Math.max(1, Math.min(200, +((env && env.CLIENT_MAIL_HOURLY) || 20)));
export const fromAddr = (env) => (env && env.CLIENT_MAIL_FROM) || "FODO <anmol@fodo.co.in>";
export const replyTo = (env) => cleanEmail((env && env.CLIENT_MAIL_REPLY_TO) || "anmol@fodo.co.in") || "anmol@fodo.co.in";
const STATUSES = ["lead", "proposal", "active", "paused", "won", "lost", "archived"];

const DDL = [
  "CREATE TABLE IF NOT EXISTS cm_clients (id TEXT PRIMARY KEY, name TEXT, business TEXT, email TEXT, phone TEXT, city TEXT, industry TEXT, service TEXT, amount TEXT, pricing TEXT, status TEXT, notes TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE INDEX IF NOT EXISTS cm_clients_email ON cm_clients(email)",
  "CREATE TABLE IF NOT EXISTS cm_sends (id TEXT PRIMARY KEY, at TEXT, admin TEXT, client_id TEXT, email TEXT, type TEXT, subject TEXT, status TEXT, provider_id TEXT, error TEXT, test INTEGER DEFAULT 0, marketing INTEGER DEFAULT 0, attempts INTEGER DEFAULT 1, html TEXT, text TEXT, last_at TEXT)",
  "CREATE INDEX IF NOT EXISTS cm_sends_at ON cm_sends(at)",
  "CREATE INDEX IF NOT EXISTS cm_sends_ct ON cm_sends(client_id, type, at)",
  "CREATE TABLE IF NOT EXISTS camp_unsub (email TEXT PRIMARY KEY, at TEXT, why TEXT)",
];
/* the first client, added once (and again only if the table is emptied and the seed row was never made) */
export const SEED = { id: "cl_shagun", name: "", business: "Shagun Banquet Hall", email: "singhrajputanmol014@gmail.com", phone: "", city: "Motihari", industry: "Banquet hall / events",
  service: "AI Digital Growth System", amount: "₹50,000 one-time", status: "proposal",
  pricing: "AI Digital Growth System set-up | ₹50,000 one-time\nSoftware | ₹4,300 to ₹12,800 / month\nMeta Ads (optional) | ₹500 / day ad budget",
  notes: "One-time ₹50,000. Software ₹4,300 to ₹12,800 per month. Meta Ads optional at ₹500 per day." };
export async function cmDb(env) {
  const d = await adb(env);
  await SCH.setup(d, "outreach", async () => {
    await SCH.ddl(d, DDL);
    if (!(await one(d, "SELECT id FROM cm_clients WHERE id=?1", SEED.id))) { const t = nowIso(); const s = SEED;
      await run(d, "INSERT INTO cm_clients (id,name,business,email,phone,city,industry,service,amount,pricing,status,notes,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?13)", s.id, s.name, s.business, s.email, s.phone, s.city, s.industry, s.service, s.amount, s.pricing, s.status, s.notes, t); }
  });
  return d;
}

/* ---------------- clients ---------------- */
const pubClient = (r) => r && { id: r.id, name: r.name || "", business: r.business || "", email: r.email || "", phone: r.phone || "", city: r.city || "", industry: r.industry || "", service: r.service || "", amount: r.amount || "", pricing: r.pricing || "", status: r.status || "lead", notes: r.notes || "", created_at: r.created_at, updated_at: r.updated_at };
export function cleanClient(b) {
  b = b || {}; const p = (k, n) => T.plain(b[k], n).trim();
  const email = cleanEmail(b.email);
  if (!p("name", 120) && !p("business", 160)) throw err("Add the client's name or business name.");
  if (!email) throw err("Add a valid email address for the client.");
  const status = STATUSES.indexOf(String(b.status || "")) > -1 ? String(b.status) : "lead";
  const phone = p("phone", 40); if (phone && !/^[+\d][\d\s()-]{5,24}$/.test(phone)) throw err("The phone number doesn't look right.");
  return { name: p("name", 120), business: p("business", 160), email, phone, city: p("city", 80), industry: p("industry", 80), service: p("service", 160), amount: p("amount", 80), pricing: p("pricing", 2000), status, notes: p("notes", 4000) };
}
export async function listClients(env, q) {
  const d = await cmDb(env); q = T.plain(q, 80).trim().toLowerCase();
  const rows = q ? await all(d, "SELECT * FROM cm_clients WHERE lower(name||' '||business||' '||email||' '||city||' '||industry||' '||service||' '||coalesce(phone,'')) LIKE ?1 ORDER BY updated_at DESC LIMIT 300", "%" + q.replace(/[%_]/g, "") + "%")
    : await all(d, "SELECT * FROM cm_clients ORDER BY updated_at DESC LIMIT 300");
  return rows.map(pubClient);
}
export async function saveClient(env, b) {
  const d = await cmDb(env), c = cleanClient(b), t = nowIso();
  if (b && b.id) {
    const ex = await one(d, "SELECT id FROM cm_clients WHERE id=?1", String(b.id)); if (!ex) throw err("That client no longer exists.", 404);
    await run(d, "UPDATE cm_clients SET name=?2,business=?3,email=?4,phone=?5,city=?6,industry=?7,service=?8,amount=?9,pricing=?10,status=?11,notes=?12,updated_at=?13 WHERE id=?1", ex.id, c.name, c.business, c.email, c.phone, c.city, c.industry, c.service, c.amount, c.pricing, c.status, c.notes, t);
    return pubClient(await one(d, "SELECT * FROM cm_clients WHERE id=?1", ex.id));
  }
  const id = "cl_" + randId(12);
  await run(d, "INSERT INTO cm_clients (id,name,business,email,phone,city,industry,service,amount,pricing,status,notes,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?13)", id, c.name, c.business, c.email, c.phone, c.city, c.industry, c.service, c.amount, c.pricing, c.status, c.notes, t);
  return pubClient(await one(d, "SELECT * FROM cm_clients WHERE id=?1", id));
}
async function getClient(d, id) { const r = await one(d, "SELECT * FROM cm_clients WHERE id=?1", String(id || "")); if (!r) throw err("Pick a client first.", 404); return pubClient(r); }

/* ---------------- opt-out (marketing types only) ---------------- */
async function hmac(env, msg) {
  const secret = env.OPTOUT_SECRET || env.RESEND_API_KEY || "fodo-optout";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("optout|" + msg)));
  return btoa(String.fromCharCode(...sig.slice(0, 18))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function optOutUrl(env, email) { return SITE + "/api/optout?e=" + encodeURIComponent(email) + "&t=" + (await hmac(env, email)); }
export async function optOutCheck(env, email, token) { email = cleanEmail(email); return !!email && !!token && (await hmac(env, email)) === String(token); }
export async function optOut(env, email, why) { const d = await cmDb(env); email = cleanEmail(email); if (!email) return false; await run(d, "INSERT OR IGNORE INTO camp_unsub (email, at, why) VALUES (?1,?2,?3)", email, nowIso(), T.plain(why || "unsubscribe link", 120)); return true; }

/* ---------------- building one email ---------------- */
/* fill {vars}; inside the button link the values are URL-encoded (so a mailto subject stays one valid link), unless the whole link is one variable */
function fillBlocks(blocks, v) {
  const out = {};
  for (const k of T.BLOCKS) {
    if (k === "cta_link") { const s = String(blocks[k] || "").trim(); out[k] = /^\{[a-z_]+\}$/.test(s) ? T.fill(s, v) : s.replace(/\{([a-z_]+)\}/g, (m, x) => (Object.prototype.hasOwnProperty.call(v, x) ? encodeURIComponent(v[x]) : m)); }
    else out[k] = T.fill(blocks[k], v);
  }
  return out;
}
export async function compose(env, b, opts) {
  const d = await cmDb(env); b = b || {};
  const type = T.TYPES[b.type] ? b.type : "custom", t = T.TYPES[type];
  const client = b.client_id ? await getClient(d, b.client_id) : Object.assign({ id: "" }, cleanClient(b.client || {}));
  const v = T.varsFor(client, b.vars || {});
  const blocks = T.blocksFor(type, b.blocks || {});
  const subjT = T.plain(b.subject != null && String(b.subject).trim() ? b.subject : t.subject, 300).replace(/\s+/g, " ").trim();
  const marketing = b.marketing != null ? !!b.marketing : !!t.marketing;
  const filled = fillBlocks(blocks, v), subject = T.fill(subjT, v).replace(/\s+/g, " ").trim().slice(0, 200);
  if (filled.cta_text && filled.cta_link && !T.safeUrl(filled.cta_link)) throw err("The button link must start with https://, mailto: or tel:.");
  const ou = marketing ? await optOutUrl(env, client.email) : "";
  const r = T.renderMail({ subject, blocks: filled, optOutUrl: (opts && opts.test) ? ou || "" : ou });
  return { type, marketing, client, subject, blocks, html: r.html, text: r.text, empty: T.emptyVars(blocks, subjT, v), optOut: ou };
}
export async function preview(env, b) { const c = await compose(env, b); return { subject: c.subject, html: c.html, text: c.text, empty: c.empty, marketing: c.marketing, to: c.client.email }; }

/* ---------------- sending ---------------- */
async function resend(env, o) {
  if (!env.RESEND_API_KEY) throw err("Email sending is not set up yet. Add RESEND_API_KEY in Cloudflare (see docs/CLIENT-EMAILS.md).", 503, { setup: true });
  const body = { from: fromAddr(env), to: [o.to], subject: o.subject, html: o.html, text: o.text, reply_to: replyTo(env), headers: Object.assign({ "X-FODO-Mail": o.id }, o.optOut ? { "List-Unsubscribe": "<" + o.optOut + ">, <mailto:" + replyTo(env) + "?subject=unsubscribe>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : {}) };
  let r, j = {};
  try { r = await outbound(env)("https://api.resend.com/emails", { method: "POST", headers: { authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json", "idempotency-key": o.id + "-" + (o.attempt || 1) }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) }); j = await r.json().catch(() => ({})); }
  catch (e) { return { ok: false, error: "Could not reach the email provider (" + String((e && e.message) || e).slice(0, 80) + ")" }; }
  if (!r.ok || !j.id) return { ok: false, error: "Resend " + r.status + (j.message ? ": " + String(j.message).slice(0, 180) : "") };
  return { ok: true, id: j.id };
}
const pubSend = (r) => r && { id: r.id, at: r.at, last_at: r.last_at, admin: r.admin, client_id: r.client_id, email: r.email, type: r.type, type_label: (T.TYPES[r.type] || { label: r.type }).label, subject: r.subject, status: r.status, provider_id: r.provider_id, error: r.error, test: !!r.test, marketing: !!r.marketing, attempts: r.attempts || 1 };
export async function usedThisHour(env) { const d = await cmDb(env); const r = await one(d, "SELECT COUNT(*) AS n FROM cm_sends WHERE test=0 AND last_at > ?1", new Date(Date.now() - 3600e3).toISOString()); return (r && r.n) || 0; }

/* b: { client_id | client, type, subject, blocks, vars, marketing, test, to (test only), confirm, override } */
export async function send(env, b, admin) {
  const d = await cmDb(env); b = b || {}; const test = !!b.test;
  const c = await compose(env, b, { test });
  const to = test ? cleanEmail(b.to || admin) : c.client.email;
  if (!to) throw err(test ? "Enter a valid email for the test." : "This client has no valid email address.");
  if (!test && !b.confirm) throw err("Please confirm the send first.", 400, { needConfirm: true });
  if (!test && !c.client.id) throw err("Save the client before sending a real email.");
  if (!test && c.marketing && (await one(d, "SELECT email FROM camp_unsub WHERE email=?1", to))) throw err(to + " has unsubscribed from marketing emails. Choose a transactional email type, or remove them from the opt-out list first.", 409, { optedOut: true });
  if (!test && (await usedThisHour(env)) >= hourly(env)) throw err("Hourly limit reached (" + hourly(env) + " client emails per hour). Try again a bit later.", 429, { limit: true });
  if (test) { const r = await one(d, "SELECT COUNT(*) AS n FROM cm_sends WHERE test=1 AND last_at > ?1", new Date(Date.now() - 3600e3).toISOString()); if (r && r.n >= 40) throw err("Too many test emails this hour. Try again a bit later.", 429, { limit: true }); }
  if (!test && !b.override) {
    const dup = await one(d, "SELECT at FROM cm_sends WHERE test=0 AND status='sent' AND client_id=?1 AND type=?2 AND last_at > ?3 ORDER BY last_at DESC LIMIT 1", c.client.id, c.type, new Date(Date.now() - DUP_MIN * 60e3).toISOString());
    if (dup) throw err("A " + T.TYPES[c.type].label.toLowerCase() + " email went to this client " + Math.max(1, Math.round((Date.now() - Date.parse(dup.at)) / 60e3)) + " min ago. Send again anyway?", 409, { duplicate: true });
  }
  const id = "cm_" + randId(14), t = nowIso(), subject = (test ? "[TEST] " : "") + c.subject;
  await run(d, "INSERT INTO cm_sends (id,at,last_at,admin,client_id,email,type,subject,status,test,marketing,attempts,html,text) VALUES (?1,?2,?2,?3,?4,?5,?6,?7,'sending',?8,?9,1,?10,?11)", id, t, T.plain(admin, 254), c.client.id || "", to, c.type, subject, test ? 1 : 0, c.marketing ? 1 : 0, c.html, c.text);
  const r = await resend(env, { id, to, subject, html: c.html, text: c.text, optOut: c.marketing && !test ? c.optOut : "" }).catch((e) => { if (e.setup) throw e; return { ok: false, error: String(e.message || e).slice(0, 200) }; })
    .catch(async (e) => { await run(d, "UPDATE cm_sends SET status='failed', error=?2 WHERE id=?1", id, e.message); throw e; });
  await run(d, "UPDATE cm_sends SET status=?2, provider_id=?3, error=?4, last_at=?5 WHERE id=?1", id, r.ok ? "sent" : "failed", r.ok ? r.id : null, r.ok ? null : r.error, nowIso());
  await mailLog(env, { kind: "client_" + c.type, from: fromAddr(env), to, subject, text: c.text.slice(0, 20000), status: r.ok ? "sent" : "failed", providerId: r.ok ? r.id : null, error: r.ok ? null : r.error, by: admin }).catch(() => {});
  if (!test && r.ok && c.client.id) await run(d, "UPDATE cm_clients SET updated_at=?2 WHERE id=?1", c.client.id, nowIso());
  const row = pubSend(await one(d, "SELECT * FROM cm_sends WHERE id=?1", id));
  if (!r.ok) throw err("The email was not sent: " + r.error, 502, { send: row });
  return { send: row, used: await usedThisHour(env), hourly: hourly(env) };
}
/* re-send a failed email exactly as it was built (same subject, html and text) */
export async function retry(env, id, admin) {
  const d = await cmDb(env), s = await one(d, "SELECT * FROM cm_sends WHERE id=?1", String(id || ""));
  if (!s) throw err("That send is not in the log.", 404);
  if (s.status === "sent") throw err("This email was already sent.", 409);
  if (!s.test && (await usedThisHour(env)) >= hourly(env)) throw err("Hourly limit reached (" + hourly(env) + " client emails per hour). Try again a bit later.", 429, { limit: true });
  if (!s.test && s.marketing && (await one(d, "SELECT email FROM camp_unsub WHERE email=?1", s.email))) throw err(s.email + " has unsubscribed from marketing emails.", 409, { optedOut: true });
  const attempt = (s.attempts || 1) + 1;
  const r = await resend(env, { id: s.id, attempt, to: s.email, subject: s.subject, html: s.html, text: s.text, optOut: s.marketing && !s.test ? await optOutUrl(env, s.email) : "" });
  await run(d, "UPDATE cm_sends SET status=?2, provider_id=?3, error=?4, attempts=?5, last_at=?6, admin=?7 WHERE id=?1", s.id, r.ok ? "sent" : "failed", r.ok ? r.id : null, r.ok ? null : r.error, attempt, nowIso(), T.plain(admin, 254));
  await mailLog(env, { kind: "client_" + s.type, from: fromAddr(env), to: s.email, subject: s.subject, text: String(s.text || "").slice(0, 20000), status: r.ok ? "sent" : "failed", providerId: r.ok ? r.id : null, error: r.ok ? null : r.error, by: admin }).catch(() => {});
  const row = pubSend(await one(d, "SELECT * FROM cm_sends WHERE id=?1", s.id));
  if (!r.ok) throw err("Still not sent: " + r.error, 502, { send: row });
  return { send: row, used: await usedThisHour(env), hourly: hourly(env) };
}
export async function sends(env, f) {
  const d = await cmDb(env); f = f || {}; const w = [], a = [];
  if (f.client) { a.push(String(f.client)); w.push("client_id=?" + a.length); }
  if (["sent", "failed", "sending"].indexOf(f.status) > -1) { a.push(f.status); w.push("status=?" + a.length); }
  if (f.test === "0" || f.test === "1") { a.push(+f.test); w.push("test=?" + a.length); }
  const rows = await all(d, "SELECT id,at,last_at,admin,client_id,email,type,subject,status,provider_id,error,test,marketing,attempts FROM cm_sends" + (w.length ? " WHERE " + w.join(" AND ") : "") + " ORDER BY at DESC LIMIT 200", ...a);
  return rows.map(pubSend);
}
export async function sendHtml(env, id) { const d = await cmDb(env), s = await one(d, "SELECT html, subject FROM cm_sends WHERE id=?1", String(id || "")); if (!s) throw err("Not found.", 404); return s; }
export async function overview(env, q) {
  return { clients: await listClients(env, q), types: T.typeList().map((t) => ({ id: t.id, label: t.label, marketing: t.marketing, subject: t.subject, blocks: T.BLOCKS.reduce((o, k) => { o[k] = t[k]; return o; }, {}) })),
    statuses: STATUSES, sends: await sends(env, {}), config: { configured: !!env.RESEND_API_KEY, provider: "Resend", from: fromAddr(env), replyTo: replyTo(env), hourly: hourly(env), used: await usedThisHour(env), dupMinutes: DUP_MIN } };
}
