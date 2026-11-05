/* FODO OS V4 Phase 7 (v50.7): knowledge base + SOPs.
   Articles (SOP, guide, policy, FAQ, procedure) with an owner, a department, a review date and every saved version kept. Anyone on
   the team drafts; department leads publish for their department, operations / HR for everyone. Editing a published article makes a
   new version: people with publish rights keep it published, others send it for review. Policies and procedures carry an extra
   flag: a policy says whether a lawyer reviewed it; a procedure (incident response, continuity) is "signed off" by an owner.
   search() feeds the Assistant, which answers "how do we…" questions with the article title and version as the citation. */
import { nowIso } from "../accounts.js";
import { notify } from "../biz.js";
import { osdb, one, all, run, J, clip, err, DAY, rid, ORG } from "./db.js";
import { has } from "./authz.js";
import { audit, emit } from "./audit.js";
import { today, addDays, nameOf } from "./kit.js";

const DDL = [
  "CREATE TABLE IF NOT EXISTS os_kb_articles (id TEXT PRIMARY KEY, org_id TEXT, title TEXT, kind TEXT, body TEXT, department_id TEXT, owner_user_id TEXT, status TEXT, version INTEGER, review_on TEXT, visibility TEXT, tags TEXT, legal_review TEXT, signed_off_by TEXT, signed_off_at TEXT, signed_version INTEGER, created_by TEXT, created_at TEXT, updated_at TEXT, published_at TEXT, reviewed_at TEXT)",
  "CREATE INDEX IF NOT EXISTS os_kb_s ON os_kb_articles(org_id, status, kind)",
  "CREATE TABLE IF NOT EXISTS os_kb_versions (article_id TEXT, version INTEGER, title TEXT, body TEXT, by_user_id TEXT, note TEXT, created_at TEXT, PRIMARY KEY (article_id, version))"
];
const made = new WeakSet();
export async function kdb(env) { const d = await osdb(env); if (!made.has(d)) { for (const q of DDL) await d.prepare(q).run(); made.add(d); } return d; }
export const KINDS = ["sop", "guide", "policy", "faq", "procedure"];
const REVIEW_DAYS = 180;
/* may this person publish this article? department leads for their department, organization publishers for all */
const canPublish = (P, a) => P.isOwner || has(P, "knowledge", "publish", "organization") || (has(P, "knowledge", "publish", "department") && (!a || !a.department_id || a.department_id === P.dept));
const canEdit = (P, a) => P.isOwner || a.created_by === P.user.id || a.owner_user_id === P.user.id || has(P, "knowledge", "manage", "organization") || (has(P, "knowledge", "manage", "department") && a.department_id === P.dept);
const visible = (P, a) => a.status === "published" ? (a.visibility !== "department" || !a.department_id || a.department_id === P.dept || P.isOwner || has(P, "knowledge", "manage", "organization")) : canEdit(P, a) || canPublish(P, a);
const shape = (a, t) => Object.assign(a, { tags: J(a.tags, []), review_due: a.status === "published" && a.review_on && a.review_on <= (t || today()), sign_off_current: a.kind === "procedure" ? !!(a.signed_off_by && a.signed_version === a.version) : null });

export async function list(env, P, q) {
  if (!has(P, "knowledge", "view", "own")) throw err("You don't have access to the knowledge base.", 403); const d = await kdb(env), W = ["a.org_id=?1"], args = [ORG];
  if (q && q.kind && KINDS.indexOf(q.kind) > -1) { args.push(q.kind); W.push("a.kind=?" + args.length); } if (q && q.q) { args.push("%" + clip(q.q, 80) + "%"); W.push("(a.title LIKE ?" + args.length + " OR a.body LIKE ?" + args.length + " OR a.tags LIKE ?" + args.length + ")"); }
  if (q && q.status) { args.push(clip(q.status, 12)); W.push("a.status=?" + args.length); } else W.push("a.status<>'archived'");
  const rows = (await all(d, "SELECT a.id, a.title, a.kind, a.department_id, a.owner_user_id, a.created_by, a.status, a.version, a.review_on, a.visibility, a.tags, a.legal_review, a.signed_off_by, a.signed_version, a.updated_at, " + nameOf("a.owner_user_id") + " AS owner, (SELECT name FROM os_departments x WHERE x.id=a.department_id) AS department FROM os_kb_articles a WHERE " + W.join(" AND ") + " ORDER BY a.status='published' DESC, a.updated_at DESC LIMIT 300", ...args)).filter((a) => visible(P, a)), t = today();
  return { items: rows.map((a) => shape(a, t)), kinds: KINDS, canWrite: has(P, "knowledge", "manage", "own"), canPublish: canPublish(P, null) };
}
export async function get(env, P, id, ver) {
  const d = await kdb(env), a = await one(d, "SELECT a.*, " + nameOf("a.owner_user_id") + " AS owner, " + nameOf("a.signed_off_by") + " AS signed_by, (SELECT name FROM os_departments x WHERE x.id=a.department_id) AS department FROM os_kb_articles a WHERE a.id=?1 AND a.org_id=?2", clip(id, 40), ORG); if (!a || !visible(P, a)) throw err("Not found.", 404);
  const versions = await all(d, "SELECT v.version, v.title, v.note, v.created_at, " + nameOf("v.by_user_id") + " AS by FROM os_kb_versions v WHERE v.article_id=?1 ORDER BY v.version DESC LIMIT 100", a.id);
  let shown = null; if (ver && +ver !== a.version) { shown = await one(d, "SELECT version, title, body, created_at FROM os_kb_versions WHERE article_id=?1 AND version=?2", a.id, +ver || 0); if (!shown) throw err("No such version.", 404); }
  return { article: shape(a), versions, old: shown, canEdit: canEdit(P, a), canPublish: canPublish(P, a), canSignOff: a.kind === "procedure" && P.isOwner };
}
export async function save(env, P, b) {
  if (!has(P, "knowledge", "manage", "own")) throw err("You can't write articles.", 403); const d = await kdb(env), now = nowIso(), title = clip(b.title, 160), body = String(b.body == null ? "" : b.body).replace(/\u0000/g, "").slice(0, 40000).trim(); if (!title) throw err("Give the article a title."); if (body.length < 20) throw err("Write the article (at least a few lines).");
  const kind = KINDS.indexOf(b.kind) > -1 ? b.kind : "guide", vis = b.visibility === "department" ? "department" : "team", tags = (Array.isArray(b.tags) ? b.tags : String(b.tags || "").split(",")).map((x) => clip(x, 30).toLowerCase()).filter(Boolean).slice(0, 10), review = DAY.test(b.review_on || "") ? b.review_on : null, note = clip(b.note, 300);
  const dep = has(P, "knowledge", "manage", "organization") || P.isOwner ? clip(b.department_id, 40) || P.dept || null : P.dept || null;
  if (b.id) { const a = await one(d, "SELECT * FROM os_kb_articles WHERE id=?1 AND org_id=?2", clip(b.id, 40), ORG); if (!a) throw err("Not found.", 404); if (!canEdit(P, a)) throw err("Only the author, the owner or a lead edits this article.", 403); if (a.status === "archived") throw err("An archived article is closed; restore it first.", 409);
    const changed = a.title !== title || a.body !== body; const v = changed ? a.version + 1 : a.version, st = a.status === "published" && changed && !canPublish(P, a) ? "in_review" : a.status;
    await run(d, "UPDATE os_kb_articles SET title=?2, body=?3, kind=?4, visibility=?5, tags=?6, review_on=COALESCE(?7, review_on), version=?8, status=?9, legal_review=CASE WHEN ?4='policy' AND ?10=1 THEN 'needed' ELSE legal_review END, updated_at=?11 WHERE id=?1", a.id, title, body, kind, vis, JSON.stringify(tags), review, v, st, changed ? 1 : 0, now);
    if (changed) await run(d, "INSERT INTO os_kb_versions (article_id, version, title, body, by_user_id, note, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)", a.id, v, title, body, P.user.id, note || null, now);
    await audit(env, P, "KB_EDITED", { kind: "article", id: a.id }, { version: a.version, status: a.status }, { version: v, status: st }, note); if (st === "in_review" && a.status !== "in_review") await askReview(env, d, P, a.id, title, a.department_id); return { id: a.id, version: v, status: st }; }
  const id = rid("kb"); await run(d, "INSERT INTO os_kb_articles (id, org_id, title, kind, body, department_id, owner_user_id, status, version, review_on, visibility, tags, legal_review, created_by, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'draft',1,?8,?9,?10,?11,?12,?13,?13)", id, ORG, title, kind, body, dep, clip(b.owner_user_id, 40) || P.user.id, review, vis, JSON.stringify(tags), kind === "policy" ? "needed" : null, P.user.id, now);
  await run(d, "INSERT INTO os_kb_versions (article_id, version, title, body, by_user_id, note, created_at) VALUES (?1,1,?2,?3,?4,?5,?6)", id, title, body, P.user.id, note || "first draft", now); await audit(env, P, "KB_DRAFTED", { kind: "article", id }, null, { title, kind });
  if (b.publish) return Object.assign(await setStatus(env, P, id, { status: "published" }), { id }); return { id, version: 1, status: "draft" };
}
async function askReview(env, d, P, id, title, dep) { const L = await all(d, "SELECT DISTINCT m.user_id FROM os_members m JOIN os_member_roles mr ON mr.member_id=m.id JOIN os_role_perms rp ON rp.role_id=mr.role_id WHERE m.org_id=?1 AND m.status='active' AND m.user_id IS NOT NULL AND (rp.perm IN ('knowledge.publish.organization','knowledge.publish.all') OR (rp.perm='knowledge.publish.department' AND m.department_id=?2)) LIMIT 5", ORG, dep || "-"); for (const r of L) if (r.user_id !== P.user.id) notify(env, r.user_id, "approval", "Article to review: " + title, "/workspace/#knowledge?id=" + id, { category: "approval", urgency: "action", dedupe: "kb-rv-" + id }).catch(() => {}); }
export async function setStatus(env, P, id, b) {
  const d = await kdb(env), a = await one(d, "SELECT * FROM os_kb_articles WHERE id=?1 AND org_id=?2", clip(id, 40), ORG); if (!a) throw err("Not found.", 404); const to = clip(b.status, 12), now = nowIso();
  if (to === "in_review") { if (!canEdit(P, a)) throw err("Only the author sends it for review.", 403); if (a.status !== "draft") throw err("Only a draft goes for review.", 409); await run(d, "UPDATE os_kb_articles SET status='in_review', updated_at=?2 WHERE id=?1", a.id, now); await askReview(env, d, P, a.id, a.title, a.department_id); return { status: to }; }
  if (to === "published") { if (!canPublish(P, a)) throw err("Your department lead (or operations / HR) publishes articles.", 403); if (["draft", "in_review", "archived"].indexOf(a.status) < 0) throw err("Already published.", 409);
    const review = a.review_on && a.review_on > today() ? a.review_on : addDays(today(), REVIEW_DAYS); await run(d, "UPDATE os_kb_articles SET status='published', published_at=?2, review_on=?3, updated_at=?2 WHERE id=?1", a.id, now, review);
    await audit(env, P, "KB_PUBLISHED", { kind: "article", id: a.id }, { status: a.status }, { status: "published", version: a.version }); await emit(env, P, "knowledge.published", { kind: "article", id: a.id }, { title: a.title, kind: a.kind, version: a.version }); if (a.owner_user_id !== P.user.id) notify(env, a.owner_user_id, "system", "Published: " + a.title, "/workspace/#knowledge?id=" + a.id).catch(() => {}); return { status: "published", review_on: review }; }
  if (to === "draft") { if (!canPublish(P, a) && !canEdit(P, a)) throw err("Not yours to change.", 403); if (a.status !== "in_review") throw err("Only an article in review goes back to draft.", 409); const why = clip(b.note, 300); if (canPublish(P, a) && a.created_by !== P.user.id && why.length < 3) throw err("Tell the author what to change."); await run(d, "UPDATE os_kb_articles SET status='draft', updated_at=?2 WHERE id=?1", a.id, now); if (a.created_by !== P.user.id) notify(env, a.created_by, "system", "Changes asked on \"" + a.title + "\": " + why, "/workspace/#knowledge?id=" + a.id).catch(() => {}); return { status: "draft" }; }
  if (to === "archived") { if (!canPublish(P, a) && !canEdit(P, a)) throw err("Not yours to archive.", 403); const why = clip(b.note, 300); if (why.length < 3) throw err("Say why it is archived."); await run(d, "UPDATE os_kb_articles SET status='archived', updated_at=?2 WHERE id=?1", a.id, now); await audit(env, P, "KB_ARCHIVED", { kind: "article", id: a.id }, { status: a.status }, { status: "archived" }, why); return { status: "archived" }; }
  throw err("Unknown status.");
}
/* the owner of a published article confirms it is still right: next review in 180 days */
export async function reviewed(env, P, id, b) {
  const d = await kdb(env), a = await one(d, "SELECT * FROM os_kb_articles WHERE id=?1 AND org_id=?2", clip(id, 40), ORG); if (!a) throw err("Not found.", 404); if (!(canEdit(P, a) || canPublish(P, a))) throw err("The article owner or a lead reviews it.", 403); if (a.status !== "published") throw err("Only a published article is reviewed.", 409);
  const next = DAY.test(b.next || "") && b.next > today() ? b.next : addDays(today(), REVIEW_DAYS), now = nowIso(); await run(d, "UPDATE os_kb_articles SET reviewed_at=?2, review_on=?3, updated_at=?2 WHERE id=?1", a.id, now, next); await audit(env, P, "KB_REVIEWED", { kind: "article", id: a.id }, { review_on: a.review_on }, { review_on: next }, clip(b.note, 300)); return { review_on: next };
}
/* policy: an owner records that a lawyer reviewed this version. procedure: an owner signs off this version. */
export async function legal(env, P, id, b) {
  if (!P.isOwner) throw err("Only an owner records a legal review or a sign-off.", 403); const d = await kdb(env), a = await one(d, "SELECT * FROM os_kb_articles WHERE id=?1 AND org_id=?2", clip(id, 40), ORG); if (!a) throw err("Not found.", 404); const now = nowIso();
  if (a.kind === "procedure") { await run(d, "UPDATE os_kb_articles SET signed_off_by=?2, signed_off_at=?3, signed_version=?4, updated_at=?3 WHERE id=?1", a.id, P.user.id, now, a.version); await audit(env, P, "PROCEDURE_SIGNED_OFF", { kind: "article", id: a.id }, null, { version: a.version }); return { signed_version: a.version }; }
  if (a.kind !== "policy") throw err("Only policies (legal review) and procedures (sign-off) take this step.", 409); const who = clip(b.reviewer, 120); if (who.length < 3) throw err("Name the lawyer or firm who reviewed it.");
  await run(d, "UPDATE os_kb_articles SET legal_review=?2, updated_at=?3 WHERE id=?1", a.id, "done v" + a.version + " · " + who + " · " + now.slice(0, 10), now); await audit(env, P, "POLICY_LEGAL_REVIEW_RECORDED", { kind: "article", id: a.id }, null, { version: a.version, reviewer: who }); return { ok: true };
}
/* for the Assistant: published articles this person may read, best match first, with a short excerpt */
export async function search(env, P, text, n) {
  const d = await kdb(env), words = String(text || "").toLowerCase().replace(/[^a-z0-9ऀ-ॿ ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && ["how", "what", "the", "for", "and", "our", "kaise", "kya", "hai", "karte", "karna", "process", "sop", "policy", "about", "with", "does", "fodo"].indexOf(w) < 0).slice(0, 6); if (!words.length) return [];
  const rows = (await all(d, "SELECT id, title, kind, body, version, department_id, visibility, status, created_by, owner_user_id, tags FROM os_kb_articles WHERE org_id=?1 AND status='published' AND (" + words.map((_, i) => "lower(title||' '||body||' '||COALESCE(tags,'')) LIKE ?" + (i + 2)).join(" OR ") + ") LIMIT 50", ORG, ...words.map((w) => "%" + w + "%"))).filter((a) => visible(P, a));
  return rows.map((a) => { const hay = (a.title + " " + a.title + " " + a.body).toLowerCase(), score = words.reduce((s, w) => s + (hay.split(w).length - 1), 0), i = Math.max(0, a.body.toLowerCase().indexOf(words.find((w) => a.body.toLowerCase().indexOf(w) > -1) || "")); return { id: a.id, title: a.title, kind: a.kind, version: a.version, score, excerpt: clip(a.body.slice(Math.max(0, i - 60), i + 220).replace(/\s+/g, " "), 280) }; }).sort((x, y) => y.score - x.score).slice(0, n || 3);
}
export async function reminders(env) { const d = await kdb(env), t = today(); let n = 0; for (const a of await all(d, "SELECT id, title, owner_user_id, review_on FROM os_kb_articles WHERE status='published' AND review_on IS NOT NULL AND review_on<=?1", t)) { if (a.owner_user_id) { await notify(env, a.owner_user_id, "system", "Time to check the article: " + a.title, "/workspace/#knowledge?id=" + a.id, { category: "system", urgency: "info", dedupe: "kb-" + a.id + "-" + a.review_on }).catch(() => {}); n++; } } return { reminded: n }; }
