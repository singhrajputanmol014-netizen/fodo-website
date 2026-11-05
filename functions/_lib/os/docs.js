/* FODO OS V4 Phase 7 (v50.7): document centre.
   Templates with {{placeholders}} → documents (contract, NDA, scope of work, offer letter, policy, other) linked to a client,
   project, vendor or team member → approval through the central engine (kind "document") → sent → signed → expiry alerts.
   Every open, print and status change is written to an access log. Legal texts: a template stays marked "not reviewed by a
   lawyer" (and printed copies say "Draft") until an owner records who reviewed it. E-signature only when a provider is configured;
   until then documents are signed on paper or PDF and the signed copy is attached (FODO records who signed and when). */
import { nowIso } from "../accounts.js";
import { notify } from "../biz.js";
import { osdb, one, all, run, J, clip, err, DAY, rid, ORG } from "./db.js";
import { has, allows, authorize } from "./authz.js";
import { audit, emit } from "./audit.js";
import { today, addDays, numberFor, scopeWhere, nameOf, chainOf } from "./kit.js";

const DDL = [
  "CREATE TABLE IF NOT EXISTS os_doc_templates (id TEXT PRIMARY KEY, org_id TEXT, name TEXT, kind TEXT, body TEXT, fields TEXT, version INTEGER, status TEXT, legal_reviewer TEXT, legal_reviewed_version INTEGER, legal_reviewed_at TEXT, created_by TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS os_documents (id TEXT PRIMARY KEY, org_id TEXT, number TEXT, title TEXT, kind TEXT, template_id TEXT, template_version INTEGER, legal_reviewed INTEGER DEFAULT 0, body TEXT, link_kind TEXT, link_id TEXT, link_label TEXT, owner_user_id TEXT, department_id TEXT, file_id TEXT, signed_file_id TEXT, status TEXT, approval_id TEXT, effective_on TEXT, expires_on TEXT, sent_at TEXT, sent_to TEXT, signed_on TEXT, signed_by TEXT, sign_method TEXT, void_reason TEXT, created_by TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE INDEX IF NOT EXISTS os_docs_s ON os_documents(org_id, status, expires_on)",
  "CREATE TABLE IF NOT EXISTS os_doc_access (id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id TEXT, user_id TEXT, action TEXT, note TEXT, created_at TEXT)",
  "CREATE INDEX IF NOT EXISTS os_doc_access_d ON os_doc_access(doc_id, created_at)"
];
const made = new WeakSet();
export async function ddb(env) { const d = await osdb(env); if (!made.has(d)) { for (const q of DDL) await d.prepare(q).run(); made.add(d); } return d; }
export const KINDS = ["contract", "nda", "sow", "offer_letter", "policy", "agreement", "other"], LINKS = ["client", "project", "vendor", "member"];
export const esignOn = (env) => !!(env.ESIGN_PROVIDER && env.ESIGN_API_KEY);
const PH = /\{\{\s*([a-z][a-z0-9_]{0,39})\s*\}\}/g;
export const fieldsOf = (body) => { const out = []; String(body || "").replace(PH, (_, k) => { if (out.indexOf(k) < 0) out.push(k); return ""; }); return out; };
const manageAny = (P) => P.isOwner || has(P, "document", "manage", "department");
const canEdit = (P, x) => P.isOwner || x.created_by === P.user.id || x.owner_user_id === P.user.id || has(P, "document", "manage", "organization") || (has(P, "document", "manage", "department") && x.department_id === P.dept);
async function seeDoc(env, P, x) { if (P.isOwner || x.created_by === P.user.id || x.owner_user_id === P.user.id) return true; const s = allows(P, "document", "view"); if (!s) return false; if (s === "organization" || s === "all") return true; if (s === "department") return x.department_id === P.dept; if (s === "team") return !!(await one(await osdb(env), "SELECT 1 x FROM os_members WHERE user_id=?1 AND manager_user_id=?2", x.owner_user_id, P.user.id)); return false; }
const log = (d, docId, uid, action, note) => run(d, "INSERT INTO os_doc_access (doc_id, user_id, action, note, created_at) VALUES (?1,?2,?3,?4,?5)", docId, uid, action, note ? clip(note, 200) : null, nowIso());

/* ---------------- templates ---------------- */
export async function templates(env, P) { const d = await ddb(env); const rows = await all(d, "SELECT t.*, " + nameOf("t.created_by") + " AS author FROM os_doc_templates t WHERE t.org_id=?1 AND t.status<>'archived' ORDER BY t.kind, t.name", ORG); return { items: rows.map((t) => Object.assign(t, { fields: J(t.fields, []), reviewed_current: !!(t.legal_reviewer && t.legal_reviewed_version === t.version) })), kinds: KINDS, canManage: manageAny(P), canReview: P.isOwner }; }
export async function templateSave(env, P, b) {
  if (!manageAny(P)) throw err("Department leads, operations or HR manage templates.", 403); const d = await ddb(env), now = nowIso(), name = clip(b.name, 120), body = String(b.body || "").replace(/\u0000/g, "").slice(0, 60000).trim(); if (!name) throw err("Name the template."); if (body.length < 30) throw err("Write the template text.");
  const fields = fieldsOf(body), kind = KINDS.indexOf(b.kind) > -1 ? b.kind : "other"; if (fields.length > 40) throw err("Keep it under 40 placeholders.");
  if (b.id) { const t = await one(d, "SELECT * FROM os_doc_templates WHERE id=?1 AND org_id=?2", clip(b.id, 40), ORG); if (!t) throw err("Not found.", 404); const v = t.body !== body ? t.version + 1 : t.version;
    await run(d, "UPDATE os_doc_templates SET name=?2, kind=?3, body=?4, fields=?5, version=?6, updated_at=?7 WHERE id=?1", t.id, name, kind, body, JSON.stringify(fields), v, now); await audit(env, P, "DOC_TEMPLATE_EDITED", { kind: "doc_template", id: t.id }, { version: t.version }, { version: v }); return { id: t.id, version: v, legal_review_needed: v !== t.legal_reviewed_version }; }
  const id = rid("dt"); await run(d, "INSERT INTO os_doc_templates (id, org_id, name, kind, body, fields, version, status, created_by, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,1,'active',?7,?8,?8)", id, ORG, name, kind, body, JSON.stringify(fields), P.user.id, now);
  await audit(env, P, "DOC_TEMPLATE_ADDED", { kind: "doc_template", id }, null, { name, kind, fields: fields.length }); return { id, version: 1, fields, legal_review_needed: true };
}
export async function templateLegal(env, P, id, b) {
  if (!P.isOwner) throw err("Only an owner records a legal review.", 403); const d = await ddb(env), t = await one(d, "SELECT * FROM os_doc_templates WHERE id=?1 AND org_id=?2", clip(id, 40), ORG); if (!t) throw err("Not found.", 404); const who = clip(b.reviewer, 120); if (who.length < 3) throw err("Name the lawyer or firm who reviewed this version.");
  await run(d, "UPDATE os_doc_templates SET legal_reviewer=?2, legal_reviewed_version=?3, legal_reviewed_at=?4, updated_at=?4 WHERE id=?1", t.id, who, t.version, nowIso()); await audit(env, P, "DOC_TEMPLATE_LEGAL_REVIEWED", { kind: "doc_template", id: t.id }, null, { version: t.version, reviewer: who }); return { ok: true, version: t.version };
}
export async function templateArchive(env, P, id) { if (!manageAny(P)) throw err("Not allowed.", 403); const d = await ddb(env); await run(d, "UPDATE os_doc_templates SET status='archived', updated_at=?2 WHERE id=?1 AND org_id=?3", clip(id, 40), nowIso(), ORG); await audit(env, P, "DOC_TEMPLATE_ARCHIVED", { kind: "doc_template", id: clip(id, 40) }, null, null); return { ok: true }; }

/* ---------------- documents ---------------- */
async function linkLabel(env, d, P, kind, id) {
  if (!kind || !id) return null; if (LINKS.indexOf(kind) < 0) throw err("Unknown link.");
  if (kind === "project") { await authorize(env, P, { resource: "project", action: "view", target: { kind: "project", id } }); const p = await one(d, "SELECT title FROM biz_projects WHERE id=?1", id); if (!p) throw err("Unknown project.", 404); return p.title; }
  if (kind === "client") { const c = await one(d, "SELECT name FROM os_clients WHERE id=?1", id); if (!c) throw err("Unknown client.", 404); return c.name; }
  if (kind === "vendor") { const v = await one(d, "SELECT name FROM os_vendors WHERE id=?1", id).catch(() => null); if (!v) throw err("Unknown vendor.", 404); return v.name; }
  const m = await one(d, "SELECT name, email FROM os_members WHERE user_id=?1 AND org_id=?2", id, ORG); if (!m) throw err("Unknown team member.", 404); return m.name || m.email;
}
export async function list(env, P, q) {
  const d = await ddb(env), s = allows(P, "document", "view"); if (!s) throw err("You don't have access to documents.", 403); const args = []; let W;
  if (s === "department") { args.push(P.dept || "-", P.user.id); W = "x.org_id='" + ORG + "' AND (x.department_id=?1 OR x.owner_user_id=?2 OR x.created_by=?2)"; }
  else { const sw = scopeWhere(P, s, "x.owner_user_id", args); args.push(P.user.id); W = "x.org_id='" + ORG + "' AND (" + sw + " OR x.created_by=?" + args.length + ")"; }
  if (q && q.status) { args.push(clip(q.status, 12)); W += " AND x.status=?" + args.length; } if (q && q.kind) { args.push(clip(q.kind, 20)); W += " AND x.kind=?" + args.length; } if (q && q.link) { args.push(clip(q.link, 40)); W += " AND x.link_id=?" + args.length; }
  const rows = await all(d, "SELECT x.id, x.number, x.title, x.kind, x.status, x.link_kind, x.link_label, x.owner_user_id, x.expires_on, x.signed_on, x.legal_reviewed, x.updated_at, " + nameOf("x.owner_user_id") + " AS owner FROM os_documents x WHERE " + W + " ORDER BY x.updated_at DESC LIMIT 300", ...args), t = today();
  return { items: rows.map((x) => Object.assign(x, { expiring: x.expires_on && ["signed", "sent", "approved"].indexOf(x.status) > -1 && x.expires_on >= t && x.expires_on <= addDays(t, 30) })), kinds: KINDS, canCreate: has(P, "document", "manage", "own"), esign: esignOn(env) };
}
export async function create(env, P, b) {
  if (!has(P, "document", "manage", "own")) throw err("You can't create documents.", 403); const d = await ddb(env), now = nowIso(); let title = clip(b.title, 160), body = String(b.body || "").slice(0, 80000), kind = KINDS.indexOf(b.kind) > -1 ? b.kind : "other", tpl = null;
  if (b.template_id) { tpl = await one(d, "SELECT * FROM os_doc_templates WHERE id=?1 AND org_id=?2 AND status='active'", clip(b.template_id, 40), ORG); if (!tpl) throw err("Unknown template.", 404); const vals = b.values || {}, missing = J(tpl.fields, []).filter((f) => !clip(vals[f], 400)); if (missing.length) throw Object.assign(err("Fill in: " + missing.join(", ").replace(/_/g, " ") + "."), { missing });
    body = tpl.body.replace(PH, (_, k) => clip(vals[k], 400)); kind = tpl.kind; title = title || tpl.name; }
  if (!title) throw err("Give the document a title."); if (!b.file_id && body.trim().length < 20) throw err("Use a template, write the text, or attach the file.");
  const lk = LINKS.indexOf(b.link_kind) > -1 ? b.link_kind : null, lid = lk ? clip(b.link_id, 40) : null, label = await linkLabel(env, d, P, lk, lid);
  const id = rid("dc"), number = await numberFor(d, "os_documents", "number", "DOC"), eff = DAY.test(b.effective_on || "") ? b.effective_on : null, exp = DAY.test(b.expires_on || "") ? b.expires_on : null; if (eff && exp && exp < eff) throw err("It expires before it starts.");
  await run(d, "INSERT INTO os_documents (id, org_id, number, title, kind, template_id, template_version, legal_reviewed, body, link_kind, link_id, link_label, owner_user_id, department_id, file_id, status, effective_on, expires_on, created_by, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,'draft',?16,?17,?18,?19,?19)", id, ORG, number, title, kind, tpl ? tpl.id : null, tpl ? tpl.version : null, tpl && tpl.legal_reviewer && tpl.legal_reviewed_version === tpl.version ? 1 : 0, body, lk, lid, label, P.user.id, P.dept || null, clip(b.file_id, 40) || null, eff, exp, P.user.id, now);
  await log(d, id, P.user.id, "created"); await audit(env, P, "DOCUMENT_CREATED", { kind: "document", id }, null, { number, kind, template: tpl ? tpl.name : null }); return { id, number };
}
export async function get(env, P, id) {
  const d = await ddb(env), x = await one(d, "SELECT x.*, " + nameOf("x.owner_user_id") + " AS owner, (SELECT name FROM os_doc_templates t WHERE t.id=x.template_id) AS template FROM os_documents x WHERE x.id=?1 AND x.org_id=?2", clip(id, 40), ORG); if (!x || !(await seeDoc(env, P, x))) throw err("Not found.", 404);
  await log(d, x.id, P.user.id, "view"); const access = canEdit(P, x) ? await all(d, "SELECT a.action, a.note, a.created_at, " + nameOf("a.user_id") + " AS who FROM os_doc_access a WHERE a.doc_id=?1 ORDER BY a.id DESC LIMIT 100", x.id) : null;
  return { document: x, access, canEdit: canEdit(P, x), esign: esignOn(env), next: NEXT[x.status] || [] };
}
const NEXT = { draft: ["in_review", "void"], in_review: [], approved: ["sent", "signed", "void"], sent: ["signed", "void"], signed: ["void"], expired: ["void"], void: [] };
export async function edit(env, P, id, b) {
  const d = await ddb(env), x = await one(d, "SELECT * FROM os_documents WHERE id=?1 AND org_id=?2", clip(id, 40), ORG); if (!x) throw err("Not found.", 404); if (!canEdit(P, x)) throw err("Not yours to edit.", 403); if (x.status !== "draft") throw err("Only a draft is edited. Void it and create a new one to change a sent or signed document.", 409);
  const eff = DAY.test(b.effective_on || "") ? b.effective_on : x.effective_on, exp = DAY.test(b.expires_on || "") ? b.expires_on : x.expires_on, body = b.body == null ? x.body : String(b.body).slice(0, 80000);
  await run(d, "UPDATE os_documents SET title=?2, body=?3, effective_on=?4, expires_on=?5, file_id=COALESCE(?6, file_id), legal_reviewed=CASE WHEN ?3<>body THEN 0 ELSE legal_reviewed END, updated_at=?7 WHERE id=?1", x.id, clip(b.title, 160) || x.title, body, eff, exp, clip(b.file_id, 40) || null, nowIso()); await log(d, x.id, P.user.id, "edit"); return { ok: true };
}
export async function submit(env, P, id) {
  const d = await ddb(env), x = await one(d, "SELECT * FROM os_documents WHERE id=?1 AND org_id=?2", clip(id, 40), ORG); if (!x) throw err("Not found.", 404); if (!canEdit(P, x)) throw err("Not yours.", 403); if (x.status !== "draft") throw err("Already " + x.status + ".", 409);
  const approver = (await chainOf(d, P.user.id))[0]; if (!approver) throw err("Nobody can approve this yet: set a manager or a department manager.", 409);
  const AP = await import("./approvals.js"); const a = await AP.request(env, P, { kind: "document", object_kind: "document", object_id: x.id, title: x.number + " · " + x.title + (x.link_label ? " (" + x.link_label + ")" : ""), detail: (x.legal_reviewed ? "From a lawyer-reviewed template." : "Text NOT reviewed by a lawyer.") + (x.expires_on ? " Expires " + x.expires_on + "." : ""), approver_user_id: approver, department_id: x.department_id }, { system: true });
  await run(d, "UPDATE os_documents SET status='in_review', approval_id=?2, updated_at=?3 WHERE id=?1", x.id, a.id, nowIso()); await log(d, x.id, P.user.id, "submitted"); return { ok: true, approval_id: a.id };
}
export async function onDecided(env, P, a, decision, note) { const d = await ddb(env); const x = await one(d, "SELECT * FROM os_documents WHERE id=?1", a.object_id); if (!x || x.status !== "in_review") return; await run(d, "UPDATE os_documents SET status=?2, updated_at=?3 WHERE id=?1", x.id, decision === "approved" ? "approved" : "draft", nowIso()); await log(d, x.id, P.user.id, decision, note); await emit(env, P, "document." + decision, { kind: "document", id: x.id }, { number: x.number, kind: x.kind }); }
export async function setStatus(env, P, id, b) {
  const d = await ddb(env), x = await one(d, "SELECT * FROM os_documents WHERE id=?1 AND org_id=?2", clip(id, 40), ORG); if (!x) throw err("Not found.", 404); if (!canEdit(P, x)) throw err("Not yours.", 403); const to = clip(b.status, 12); if ((NEXT[x.status] || []).indexOf(to) < 0 || to === "in_review") throw err("A " + x.status + " document can't become " + to + ".", 409); const now = nowIso();
  if (to === "sent") { const toWhom = clip(b.sent_to, 160); if (toWhom.length < 3) throw err("Who was it sent to?"); await run(d, "UPDATE os_documents SET status='sent', sent_at=?2, sent_to=?3, updated_at=?2 WHERE id=?1", x.id, now, toWhom); await log(d, x.id, P.user.id, "sent", toWhom); return { status: to }; }
  if (to === "signed") { const by = clip(b.signed_by, 200), on = DAY.test(b.signed_on || "") ? b.signed_on : null; if (by.length < 3) throw err("Who signed it (names)?"); if (!on || on > today()) throw err("The date it was signed."); const f = clip(b.signed_file_id, 40) || null; if (!f && x.kind !== "policy") throw err("Attach the signed copy (upload it in Files and pick it).");
    await run(d, "UPDATE os_documents SET status='signed', signed_on=?2, signed_by=?3, sign_method='manual', signed_file_id=?4, updated_at=?5 WHERE id=?1", x.id, on, by, f, now); await log(d, x.id, P.user.id, "signed", by); await audit(env, P, "DOCUMENT_SIGNED", { kind: "document", id: x.id }, { status: x.status }, { status: "signed", signed_by: by, method: "manual" }); await emit(env, P, "document.signed", { kind: "document", id: x.id }, { number: x.number, kind: x.kind }); return { status: to }; }
  if (to === "void") { const why = clip(b.reason, 300); if (why.length < 5) throw err("Say why it is void."); await run(d, "UPDATE os_documents SET status='void', void_reason=?2, updated_at=?3 WHERE id=?1", x.id, why, now); if (x.approval_id) await run(d, "UPDATE os_approvals SET status='cancelled', updated_at=?2 WHERE id=?1 AND status='pending'", x.approval_id, now); await log(d, x.id, P.user.id, "void", why); await audit(env, P, "DOCUMENT_VOIDED", { kind: "document", id: x.id }, { status: x.status }, { status: "void" }, why); return { status: to }; }
  throw err("Unknown status.");
}
export async function print(env, P, id) {
  const d = await ddb(env), x = await one(d, "SELECT * FROM os_documents WHERE id=?1 AND org_id=?2", clip(id, 40), ORG); if (!x || !(await seeDoc(env, P, x))) throw err("Not found.", 404); await log(d, x.id, P.user.id, "print");
  const e = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]), draft = !x.legal_reviewed || ["draft", "in_review"].indexOf(x.status) > -1;
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + e(x.number + " " + x.title) + '</title><meta name="robots" content="noindex"><style>body{font:15px/1.6 Georgia,serif;color:#111;max-width:760px;margin:32px auto;padding:0 16px}pre{white-space:pre-wrap;font:inherit}.mark{border:1px solid #b00;color:#b00;padding:6px 10px;font:13px system-ui,sans-serif;margin-bottom:16px}small{color:#555;font-family:system-ui,sans-serif}</style></head><body>' + (draft ? '<div class="mark">' + (!x.legal_reviewed ? "Draft: this text has not been reviewed by a lawyer." : "Draft: not approved yet.") + "</div>" : "") + "<h1>" + e(x.title) + "</h1><p><small>" + e(x.number) + (x.link_label ? " · " + e(x.link_label) : "") + (x.effective_on ? " · from " + e(x.effective_on) : "") + (x.expires_on ? " · until " + e(x.expires_on) : "") + "</small></p><pre>" + e(x.body) + "</pre>" + (x.status === "signed" ? "<p><small>Signed " + e(x.signed_on) + " by " + e(x.signed_by) + ".</small></p>" : "") + "</body></html>";
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
/* daily: 30-day expiry alerts, expired documents marked */
export async function daily(env) {
  const d = await ddb(env), t = today(); let alerted = 0, expired = 0;
  const ex = await run(d, "UPDATE os_documents SET status='expired', updated_at=?2 WHERE status IN ('signed','sent','approved') AND expires_on IS NOT NULL AND expires_on<?1", t, nowIso()); expired = (ex.meta && ex.meta.changes) || 0;
  for (const x of await all(d, "SELECT id, number, title, owner_user_id, expires_on FROM os_documents WHERE status IN ('signed','sent','approved') AND expires_on IS NOT NULL AND expires_on<=?1", addDays(t, 30))) { if (!x.owner_user_id) continue; await notify(env, x.owner_user_id, "system", x.number + " " + x.title + " expires on " + x.expires_on + ".", "/workspace/#documents?id=" + x.id, { category: "system", urgency: "action", dedupe: "doc-exp-" + x.id + "-" + x.expires_on }).catch(() => {}); alerted++; }
  return { alerted, expired };
}
