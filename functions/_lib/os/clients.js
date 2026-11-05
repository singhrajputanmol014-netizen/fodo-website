/* FODO OS V4 Phase 2 (v50.2): the canonical client record (Customer 360), client health, the FODO sales pipeline view and the
   sales-to-delivery handover gate. One os_clients row per client company; every marketplace record already carries the client's
   user id (biz_projects / biz_quotes / biz_contracts / biz_invoices.client_id), so the 360 view joins on that id, no row is copied
   and no second source of truth is created. Clients from the v47.6 client organizations (biz_orgs) link through org_id. */
import { nowIso } from "../accounts.js";
import { notify, auditLog } from "../biz.js";
import { osdb, one, all, run, J, clip, err, int, DAY, rid, ORG } from "./db.js";
import { authorize, allows, has, isEmployee } from "./authz.js";
import { audit, emit } from "./audit.js";

export const INDUSTRIES = ["Restaurant / cafe", "Retail / D2C", "Real estate", "Education", "Healthcare", "Technology", "Professional services", "Hospitality / travel", "Manufacturing", "Other"];
export const STATUS = ["lead", "active", "dormant", "churned"];
const out = (c) => Object.assign({}, c, { requirements: J(c.requirements, {}), tags: J(c.tags, []) });

/* backfill (idempotent): every user with a project, quote, contract or invoice gets a client record; later changes are made by people */
export async function backfill(env) {
  const d = await osdb(env), now = nowIso(); let n = 0;
  const rows = await all(d, "SELECT DISTINCT u.id, u.email, u.name FROM acct_users u WHERE u.id IN (SELECT client_id FROM biz_projects UNION SELECT client_id FROM biz_quotes UNION SELECT client_id FROM biz_contracts UNION SELECT client_id FROM biz_invoices) AND u.id NOT IN (SELECT primary_user_id FROM os_clients WHERE primary_user_id IS NOT NULL)").catch(() => []);
  for (const u of rows) { const org = await one(d, "SELECT o.id, o.name FROM biz_org_members m JOIN biz_orgs o ON o.id=m.org_id WHERE m.user_id=?1 AND m.status='active'", u.id).catch(() => null);
    await run(d, "INSERT OR IGNORE INTO os_clients (id, org_id, name, email, primary_user_id, client_org_id, status, industry, city, website, requirements, tags, created_by, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,'active','','','','{}','[]','backfill',?7,?7)", rid("cl"), ORG, clip((org && org.name) || u.name || u.email, 120), u.email, u.id, org ? org.id : null, now); n++; }
  return n;
}
const W_SCOPE = (P, s, args) => { if (s === "all" || s === "organization" || s === "department") return "1=1"; if (s === "team") { args.push(P.user.id); return "(c.account_manager_user_id=?" + args.length + " OR c.account_manager_user_id IN (SELECT user_id FROM os_members WHERE manager_user_id=?" + args.length + "))"; } args.push(P.user.id); return "(c.account_manager_user_id=?" + args.length + " OR EXISTS (SELECT 1 FROM biz_projects p WHERE p.client_id=c.primary_user_id AND (p.owner_user_id=?" + args.length + " OR EXISTS (SELECT 1 FROM biz_tasks t WHERE t.project_id=p.id AND t.assignee_user_id=?" + args.length + "))))"; };
export async function list(env, P, q) {
  const { scope } = await authorize(env, P, { resource: "client", action: "view" }); const d = await osdb(env); await backfill(env); const args = [], W = [W_SCOPE(P, scope, args)];
  if (q.q) { args.push("%" + clip(q.q, 60) + "%"); W.push("(c.name LIKE ?" + args.length + " OR c.email LIKE ?" + args.length + " OR c.city LIKE ?" + args.length + ")"); } if (q.status && STATUS.indexOf(q.status) > -1) { args.push(q.status); W.push("c.status=?" + args.length); }
  const rows = await all(d, "SELECT c.id, c.name, c.email, c.status, c.industry, c.city, c.renewal_at, c.health, c.health_at, c.primary_user_id, (SELECT name FROM os_members m WHERE m.user_id=c.account_manager_user_id) AS account_manager, (SELECT count(*) FROM biz_projects p WHERE p.client_id=c.primary_user_id AND p.status NOT IN ('completed','cancelled')) AS active_projects, (SELECT coalesce(sum(total),0) FROM biz_invoices i WHERE i.client_id=c.primary_user_id AND i.kind='invoice' AND i.status IN ('issued','viewed','partially_paid')) AS outstanding FROM os_clients c WHERE " + W.join(" AND ") + " ORDER BY c.status='active' DESC, c.name LIMIT " + Math.min(300, +(q.limit || 100)), ...args);
  return { items: rows, scope };
}
export async function get(env, P, id) {
  const d = await osdb(env), c = await one(d, "SELECT * FROM os_clients WHERE id=?1 AND org_id=?2", id, ORG); if (!c) throw err("Not found.", 404); try { await (await import("./growth.js")).gdb(env); } catch (e) {}   /* v51: the growth columns the activity query reads */
  await authorize(env, P, { resource: "client", action: "view", target: { kind: "client", row: { id: c.primary_user_id, account_manager_user_id: c.account_manager_user_id } } }); const uid = c.primary_user_id;
  const fin = has(P, "finance", "view", "department"), x = {
    client: out(c), projects: uid ? await all(d, "SELECT id, title, status, type, kind, lifecycle, due, created_at FROM biz_projects WHERE client_id=?1 ORDER BY created_at DESC LIMIT 50", uid) : [],
    quotes: uid && has(P, "quote", "view", "assigned") ? await all(d, "SELECT id, number, title, status, expires_at, updated_at FROM biz_quotes WHERE client_id=?1 ORDER BY updated_at DESC LIMIT 30", uid) : [],
    contracts: uid && has(P, "contract", "view", "assigned") ? await all(d, "SELECT id, number, title, status, updated_at FROM biz_contracts WHERE client_id=?1 ORDER BY updated_at DESC LIMIT 30", uid) : [],
    invoices: uid && fin ? await all(d, "SELECT id, number, title, total, status, issue_date, due_date FROM biz_invoices WHERE client_id=?1 AND kind='invoice' ORDER BY issue_date DESC LIMIT 30", uid) : [],
    tickets: await all(d, "SELECT id, subject, status, priority, category, created_at, updated_at FROM help_tickets WHERE user_id=?1 OR email=?2 ORDER BY updated_at DESC LIMIT 30", uid || "-", c.email).catch(() => []),
    contacts: await all(d, "SELECT id, name, email, phone, title FROM crm_contacts WHERE email=?1 OR company=?2 ORDER BY updated_at DESC LIMIT 20", c.email, c.name).catch(() => []),
    files: uid && has(P, "file", "read", "assigned") ? await all(d, "SELECT f.id, f.name, f.size, f.created_at, f.project_id FROM biz_files f WHERE f.owner_id=?1 AND f.deleted_at IS NULL ORDER BY f.created_at DESC LIMIT 20", uid) : [],
    links: await all(d, "SELECT kind, ref, project_id, created_at FROM os_links WHERE client_id=?1 ORDER BY created_at DESC", c.id).catch(() => []),
    activity: uid ? await all(d, "SELECT kind, subject_kind, subject_id, actor_name, created_at FROM os_events WHERE subject_id IN (SELECT id FROM biz_projects WHERE client_id=?1 UNION SELECT id FROM biz_quotes WHERE client_id=?1 UNION SELECT id FROM biz_contracts WHERE client_id=?1 UNION SELECT id FROM biz_invoices WHERE client_id=?1 UNION SELECT id FROM biz_content WHERE os_client_id=?2 UNION SELECT id FROM biz_campaigns WHERE os_client_id=?2) ORDER BY created_at DESC LIMIT 40", uid, c.id).catch(() => []) : [],   /* v51: growth work (content, campaigns) shows in the client's activity too */
    health: await health(env, c)
  };
  if (!isEmployee(P)) { delete x.invoices; } return x;
}
function cleanBody(b) { const o = {}; if (b.name != null) { o.name = clip(b.name, 120); if (!o.name) throw err("Enter the client's name."); } if (b.email != null) o.email = clip(b.email, 120).toLowerCase(); if (b.industry != null) o.industry = clip(b.industry, 60); if (b.city != null) o.city = clip(b.city, 60); if (b.website != null) o.website = clip(b.website, 200);
  if (b.status != null) { if (STATUS.indexOf(b.status) < 0) throw err("Unknown status."); o.status = b.status; } if (b.account_manager_user_id !== undefined) o.account_manager_user_id = clip(b.account_manager_user_id, 40) || null; if (b.renewal_at !== undefined) { if (b.renewal_at && !DAY.test(b.renewal_at)) throw err("Renewal date must be YYYY-MM-DD."); o.renewal_at = b.renewal_at || null; }
  if (b.notes != null) o.notes = clip(b.notes, 4000); if (b.tags != null) o.tags = JSON.stringify([].concat(b.tags).map((t) => clip(t, 30)).filter(Boolean).slice(0, 20));
  if (b.requirements != null && typeof b.requirements === "object") { const r = {}; ["goals", "audience", "positioning", "budget", "timeline", "deliverables", "expectations", "competitors", "success_metrics", "constraints"].forEach((k) => { if (b.requirements[k] != null) r[k] = clip(b.requirements[k], 1500); }); o.requirements = JSON.stringify(r); }
  return o; }
export async function save(env, P, id, b) {
  const d = await osdb(env), now = nowIso();
  if (!id) { await authorize(env, P, { resource: "client", action: "manage" }); const o = cleanBody(b); if (!o.name) throw err("Enter the client's name."); const u = o.email ? await one(d, "SELECT id FROM acct_users WHERE email=?1", o.email) : null; if (u && await one(d, "SELECT id FROM os_clients WHERE primary_user_id=?1", u.id)) throw err("A client record for this e-mail exists.", 409);
    const nid = rid("cl"); await run(d, "INSERT INTO os_clients (id, org_id, name, email, primary_user_id, status, industry, city, website, account_manager_user_id, renewal_at, notes, requirements, tags, created_by, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?16)", nid, ORG, o.name, o.email || "", u ? u.id : null, o.status || "lead", o.industry || "", o.city || "", o.website || "", o.account_manager_user_id || P.user.id, o.renewal_at || null, o.notes || "", o.requirements || "{}", o.tags || "[]", P.user.email, now);
    await audit(env, P, "CLIENT_CREATED", { kind: "client", id: nid }, null, { name: o.name }); await emit(env, P, "client.created", { kind: "client", id: nid }, { name: o.name }); return { id: nid }; }
  const c = await one(d, "SELECT * FROM os_clients WHERE id=?1 AND org_id=?2", id, ORG); if (!c) throw err("Not found.", 404); await authorize(env, P, { resource: "client", action: "manage", target: { kind: "client", row: { id: c.primary_user_id, account_manager_user_id: c.account_manager_user_id } } });
  const o = cleanBody(b), ks = Object.keys(o); if (ks.length) await run(d, "UPDATE os_clients SET " + ks.map((k, i) => k + "=?" + (i + 2)).join(", ") + ", updated_at=?" + (ks.length + 2) + " WHERE id=?1", id, ...ks.map((k) => o[k]), now);
  await audit(env, P, "CLIENT_UPDATED", { kind: "client", id }, ks.reduce((a, k) => { a[k] = c[k]; return a; }, {}), o, b.reason); return { ok: true };
}
/* client health (V4 section 9.4): transparent, from real records only, "insufficient data" when there is nothing to score */
export async function health(env, c) {
  const d = await osdb(env), uid = c.primary_user_id; if (!uid) return { score: null, reason: "No account linked yet, nothing to score." };
  const T = nowIso().slice(0, 10), f = {};
  const inv = await one(d, "SELECT count(*) n, sum(CASE WHEN status IN ('issued','viewed','partially_paid') AND due_date IS NOT NULL AND due_date<?2 THEN 1 ELSE 0 END) overdue, sum(status='paid') paid FROM biz_invoices WHERE client_id=?1 AND kind='invoice'", uid, T);
  const ms = await one(d, "SELECT count(*) n, sum(CASE WHEN m.status='submitted' AND m.submitted_at<?2 THEN 1 ELSE 0 END) slow FROM biz_milestones m JOIN biz_projects p ON p.id=m.project_id WHERE p.client_id=?1", uid, new Date(Date.now() - 5 * 864e5).toISOString());
  const pj = await one(d, "SELECT count(*) n, sum(status='completed') done, sum(status='disputed') disputed, sum(status='cancelled') cancelled FROM biz_projects WHERE client_id=?1", uid);
  const tk = await one(d, "SELECT count(*) n, sum(status IN ('open','pending')) open FROM help_tickets WHERE user_id=?1", uid).catch(() => ({ n: 0, open: 0 }));
  const msg = await one(d, "SELECT max(m.created_at) last FROM biz_messages m JOIN biz_projects p ON p.id=m.project_id WHERE p.client_id=?1 AND m.user_id=?1", uid);
  const parts = []; let score = 0, weight = 0;
  if (inv && inv.n) { const s = inv.overdue ? Math.max(0, 100 - inv.overdue * 35) : 100; parts.push({ factor: "Payment behaviour", score: s, detail: inv.overdue ? inv.overdue + " overdue invoice(s)" : "no overdue invoices", weight: 30 }); score += s * 30; weight += 30; }
  if (ms && ms.n) { const s = ms.slow ? Math.max(0, 100 - ms.slow * 25) : 100; parts.push({ factor: "Approval speed", score: s, detail: ms.slow ? ms.slow + " milestone(s) waiting more than 5 days" : "approvals within 5 days", weight: 25 }); score += s * 25; weight += 25; }
  if (pj && pj.n) { const s = Math.max(0, 100 - (pj.disputed || 0) * 40 - (pj.cancelled || 0) * 15); parts.push({ factor: "Project outcomes", score: s, detail: (pj.done || 0) + " completed, " + (pj.disputed || 0) + " disputed, " + (pj.cancelled || 0) + " cancelled", weight: 25 }); score += s * 25; weight += 25; }
  if (tk && tk.n) { const s = Math.max(0, 100 - (tk.open || 0) * 20); parts.push({ factor: "Support load", score: s, detail: (tk.open || 0) + " open ticket(s) of " + tk.n, weight: 10 }); score += s * 10; weight += 10; }
  if (msg && msg.last) { const days = Math.round((Date.now() - new Date(msg.last).getTime()) / 864e5), s = days > 60 ? 40 : days > 30 ? 70 : 100; parts.push({ factor: "Responsiveness", score: s, detail: "last message " + days + " day(s) ago", weight: 10 }); score += s * 10; weight += 10; }
  if (!weight) return { score: null, reason: "Insufficient data: no invoices, milestones, projects, tickets or messages yet.", factors: [] };
  const total = Math.round(score / weight), churnRisk = total < 55 ? "high" : total < 75 ? "medium" : "low";
  await run(d, "UPDATE os_clients SET health=?2, health_at=?3 WHERE id=?1", c.id, total, nowIso()).catch(() => {});
  return { score: total, previous: c.health, churnRisk, coverage: weight + "% of the formula had data", factors: parts, formula: "weighted mean: payment 30, approval speed 25, outcomes 25, support 10, responsiveness 10; factors without data are left out" };
}
/* the FODO sales pipeline: the CRM deals of FODO staff (crm.js keeps its own stages); scoped by crm.view */
export async function pipeline(env, P) {
  const s = allows(P, "crm", "view"); if (!s) throw err("You don't have access to crm (view).", 403); const d = await osdb(env), args = [], W = s === "own" ? "d.user_id=?1" : s === "team" ? "d.user_id IN (SELECT user_id FROM os_members WHERE manager_user_id=?1 OR user_id=?1)" : "d.user_id IN (SELECT user_id FROM os_members WHERE org_id='" + ORG + "' AND status='active')"; if (s === "own" || s === "team") args.push(P.user.id);
  const rows = await all(d, "SELECT d.id, d.title, d.value, d.stage, d.prob, d.close_on, d.lost_reason, d.updated_at, c.name AS contact, c.company, c.email, (SELECT name FROM os_members m WHERE m.user_id=d.user_id) AS owner FROM crm_deals d LEFT JOIN crm_contacts c ON c.id=d.contact_id WHERE " + W + " ORDER BY d.updated_at DESC LIMIT 300", ...args).catch(() => []);
  const stages = ["lead", "qualified", "proposal", "negotiation", "won", "lost"], by = {}; stages.forEach((x) => { by[x] = { stage: x, items: [], value: 0 }; }); rows.forEach((r) => { const k = by[r.stage] ? r.stage : "lead"; by[k].items.push(r); by[k].value += r.value || 0; });
  return { stages: stages.map((x) => by[x]), scope: s, note: "Stages are the CRM's (lead, qualified, proposal, negotiation, won, lost). A won deal goes through the handover gate before a project starts." };
}
/* sales-to-delivery handover (V4 section 16): checks, then creates the client (if missing), a project with its brief and the kick-off tasks */
export async function handover(env, P, b) {
  await authorize(env, P, { resource: "project", action: "create" }); const d = await osdb(env), deal = b.deal_id ? await one(d, "SELECT d.*, c.name AS contact, c.email AS cemail, c.company FROM crm_deals d LEFT JOIN crm_contacts c ON c.id=d.contact_id WHERE d.id=?1", clip(b.deal_id, 40)).catch(() => null) : null;
  const missing = [], get = (k, n) => { const v = b[k] != null && b[k] !== "" ? b[k] : (deal ? deal[n] : null); return v; };
  const client_id = clip(b.client_id, 40), client = client_id ? await one(d, "SELECT * FROM os_clients WHERE id=?1", client_id) : null; if (!client && !clip(b.client_name, 120) && !(deal && (deal.company || deal.contact))) missing.push("client");
  const title = clip(b.title || (deal && deal.title), 160); if (!title) missing.push("title"); const type = clip(b.type, 30); if (!type) missing.push("project type"); const goal = clip(b.goal, 1500); if (!goal) missing.push("goal"); const deliverables = [].concat(b.deliverables || []).map((x) => clip(x, 160)).filter(Boolean); if (!deliverables.length) missing.push("deliverables");
  const due = b.due && DAY.test(b.due) ? b.due : null; if (!due) missing.push("deadline"); const budget = int(b.budget, 0, 1e9); if (budget == null) missing.push("budget"); const pm = clip(b.pm_user_id, 40); if (!pm) missing.push("project manager");
  if (deal && deal.stage !== "won") missing.push("deal not won (stage " + deal.stage + ")"); if (b.quote_id && !(await one(d, "SELECT id FROM biz_quotes WHERE id=?1 AND status='accepted'", clip(b.quote_id, 40)))) missing.push("accepted quote");
  if (missing.length && !b.force) return { ok: false, blocked: true, missing, reason: "Handover blocked until these are in place: " + missing.join(", ") + "." };
  if (missing.length) throw err("A handover cannot be forced past missing information: " + missing.join(", ") + ".");
  let cl = client; if (!cl) { const r = await save(env, P, null, { name: b.client_name || deal.company || deal.contact, email: b.client_email || (deal && deal.cemail) || "", status: "active", account_manager_user_id: P.user.id }); cl = await one(d, "SELECT * FROM os_clients WHERE id=?1", r.id); }
  const PJ = await import("./projects.js"); const pj = await PJ.create(env, P, { title, type, client_id: cl.id, owner_user_id: pm, due, priority: b.priority || "normal", brief: { goal, deliverables, budget, start_day: b.start_day, end_day: due, location: b.location, mode: b.mode, expectations: b.expectations } });
  await audit(env, P, "HANDOVER_COMPLETED", { kind: "project", id: pj.id }, null, { client: cl.id, deal: deal ? deal.id : null, pm }); await emit(env, P, "handover.completed", { kind: "project", id: pj.id }, { client_id: cl.id }); if (pm !== P.user.id) notify(env, pm, "project", "New project handed to you: " + title, "/workspace/#os-project?id=" + pj.id).catch(() => {});
  return { ok: true, project_id: pj.id, client_id: cl.id };
}
