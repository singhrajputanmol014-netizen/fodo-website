/* FODO v46.1 privacy (India DPDP Act 2023): "Download my data" and "Delete my account", with a log of what was done.
   Export: everything FODO keeps about you, as one JSON file (file contents are listed, download them from Files).
   Delete: personal data is erased; records the law makes us keep (payments, invoices, payouts, refunds: tax law) stay,
   but are no longer linked to your name, email or phone. Work shared with other people (projects, messages) keeps the
   other person's record but your messages are replaced by "removed". Blocked while money or a dispute is open. */
import { db as adb, nowIso, isOwner, sendMail, count } from "./accounts.js";
import { err } from "./biz.js";

const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
const LOG = "CREATE TABLE IF NOT EXISTS privacy_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, kind TEXT, detail TEXT, created_at TEXT)";
async function d0(env) { const d = await adb(env); if (!d) throw err("Database not connected.", 503); await d.prepare(LOG).run(); return d; }
const safeAll = async (d, sql, ...a) => { try { return (await d.prepare(sql).bind(...a).all()).results || []; } catch (e) { return []; } };
const safeOne = async (d, sql, ...a) => { try { return await d.prepare(sql).bind(...a).first(); } catch (e) { return null; } };
const safeRun = async (d, sql, ...a) => { try { const r = await d.prepare(sql).bind(...a).run(); return (r.meta && r.meta.changes) || 0; } catch (e) { return 0; } };
export async function logPrivacy(env, uid, kind, detail) { const d = await d0(env); await d.prepare("INSERT INTO privacy_log (user_id, kind, detail, created_at) VALUES (?1,?2,?3,?4)").bind(uid, kind, String(detail || "").slice(0, 400), nowIso()).run(); }
export async function history(env, u) { const d = await d0(env); return (await safeAll(d, "SELECT kind, detail, created_at FROM privacy_log WHERE user_id=?1 ORDER BY id DESC LIMIT 50", u.id)); }

/* ---------- export ---------- */
export async function exportData(env, u) {
  if (await count(env, "pexport:" + u.id, 5, 86400)) throw err("You can download your data 5 times a day.", 429);
  const d = await d0(env), uid = u.id, me = await safeOne(d, "SELECT id, email, name, phone, plan, plan_until, created_at, last_login, login_via FROM acct_users WHERE id=?1", uid) || {};
  const pro = await safeOne(d, "SELECT * FROM biz_pros WHERE user_id=?1", uid), proId = pro ? pro.id : "-";
  const projects = await safeAll(d, "SELECT id, title, brief, status, mode, budget, day, slot, created_at, updated_at, CASE WHEN client_id=?1 THEN 'client' ELSE 'professional' END AS your_role FROM biz_projects WHERE client_id=?1 OR pro_id=?2 OR id IN (SELECT project_id FROM biz_project_pros WHERE pro_id=?2) LIMIT 2000", uid, proId);
  const pids = projects.map((p) => p.id), inP = pids.length ? " IN (" + pids.map(() => "?").join(",") + ")" : " IN ('-')";
  const sites = await safeAll(d, "SELECT id, name, slug, status, doc, created_at, updated_at, published_at FROM sites WHERE owner_user_id=?1 AND deleted_at IS NULL", uid), sids = sites.map((s) => s.id), inS = sids.length ? " IN (" + sids.map(() => "?").join(",") + ")" : " IN ('-')";
  const out = {
    about: { generated_at: nowIso(), by: "FODO (www.fodo.co.in)", note: "Everything FODO keeps that is linked to your account. File contents are not inside this JSON: download them from Workspace → Files.", law: "Digital Personal Data Protection Act, 2023 (India)" },
    account: me, events: await safeAll(d, "SELECT kind, detail, created_at FROM acct_events WHERE user_id=?1 ORDER BY id DESC LIMIT 2000", uid),
    payments: { orders: await safeAll(d, "SELECT order_id, kind, item, amount, status, created_at, paid_at FROM acct_orders WHERE user_id=?1", uid), ledger: await safeAll(d, "SELECT kind, delta, note, created_at FROM acct_ledger WHERE user_id=?1", uid), subscriptions: await safeAll(d, "SELECT plan, amount, status, created_at, updated_at FROM acct_subs WHERE user_id=?1", uid) },
    xrays: await safeAll(d, "SELECT domain, url, tier, score, status, created_at FROM acct_runs WHERE user_id=?1 OR owner_id=?1 LIMIT 2000", uid),
    tools: await safeAll(d, "SELECT tool, domain, status, created_at FROM lab_tool_runs WHERE user_id=?1 LIMIT 2000", uid), monitoring: await safeAll(d, "SELECT domain, url, label, created_at, last_check FROM mon_targets WHERE user_id=?1", uid),
    websites: sites.map((s) => Object.assign({}, s, { doc: J(s.doc, null) })), website_form_submissions: sids.length ? await safeAll(d, "SELECT site_id, page, data, created_at FROM site_forms WHERE site_id" + inS + " LIMIT 5000", ...sids) : [],
    website_orders: sids.length ? await safeAll(d, "SELECT site_id, number, status, items, total, created_at FROM site_orders WHERE site_id" + inS + " LIMIT 5000", ...sids) : [],
    workspace: { brand_kit: J(((await safeOne(d, "SELECT data FROM biz_brand WHERE user_id=?1", uid)) || {}).data, null), content: await safeAll(d, "SELECT title, platform, format, status, due, brief, copy, created_at FROM biz_content WHERE user_id=?1", uid), ad_plans: await safeAll(d, "SELECT name, platform, objective, budget, days, status, copy, created_at FROM biz_campaigns WHERE user_id=?1", uid),
      shortlist: await safeAll(d, "SELECT pro_id, note, created_at FROM biz_shortlist WHERE user_id=?1", uid), notifications: await safeAll(d, "SELECT kind, text, created_at FROM biz_notes WHERE user_id=?1 ORDER BY id DESC LIMIT 1000", uid),
      notification_settings: J(((await safeOne(d, "SELECT data FROM biz_notify_prefs WHERE user_id=?1", uid)) || {}).data, null) },
    fodo_pro_profile: pro ? Object.assign({}, pro, { packages: await safeAll(d, "SELECT name, descr, price, days FROM biz_packages WHERE pro_id=?1", proId), portfolio: await safeAll(d, "SELECT kind, title, url FROM biz_portfolio WHERE pro_id=?1", proId), payouts: await safeAll(d, "SELECT gross, commission, net, status, ref, created_at, paid_at FROM biz_payouts WHERE pro_id=?1", proId) }) : null,
    projects: projects.map((p) => Object.assign(p, { your_messages: [] })), files: await safeAll(d, "SELECT name, size, kind, ver, project_id, created_at FROM biz_files WHERE owner_id=?1 AND deleted_at IS NULL", uid),
    crm: { contacts: await safeAll(d, "SELECT name, email, phone, company, title, city, source, tags, notes, created_at FROM crm_contacts WHERE user_id=?1", uid), deals: await safeAll(d, "SELECT title, value, stage, prob, close_on, created_at FROM crm_deals WHERE user_id=?1", uid), activities: await safeAll(d, "SELECT kind, body, due, done, created_at FROM crm_acts WHERE user_id=?1", uid) },
    support: { tickets: await safeAll(d, "SELECT id, subject, category, status, created_at FROM help_tickets WHERE user_id=?1", uid) },
    privacy_log: await history(env, u),
  };
  if (pids.length) { const msgs = await safeAll(d, "SELECT project_id, body, created_at FROM biz_messages WHERE user_id=?1 AND project_id" + inP, uid, ...pids); out.projects.forEach((p) => { p.your_messages = msgs.filter((m) => m.project_id === p.id).map((m) => ({ body: m.body, created_at: m.created_at })); }); }
  await logPrivacy(env, uid, "export", "Downloaded a copy of my data");
  return out;
}

/* ---------- what stops a deletion right now ---------- */
export async function blockers(env, u) {
  const d = await d0(env), uid = u.id, B = [], pro = await safeOne(d, "SELECT id FROM biz_pros WHERE user_id=?1", uid), pid = pro ? pro.id : "-";
  if (isOwner(u)) B.push("FODO owner accounts can't be deleted here.");
  const held = await safeOne(d, "SELECT count(*) n FROM biz_milestones m JOIN biz_projects j ON j.id=m.project_id WHERE m.status IN ('funded','submitted') AND (j.client_id=?1 OR COALESCE(m.pro_id, j.pro_id)=?2)", uid, pid);
  if (held && held.n) B.push(held.n + " paid milestone(s) are still in progress: finish, approve or refund them first.");
  const disp = await safeOne(d, "SELECT count(*) n FROM biz_projects WHERE status='disputed' AND (client_id=?1 OR pro_id=?2)", uid, pid); if (disp && disp.n) B.push("A project of yours is in dispute: wait for FODO's decision.");
  const owed = await safeOne(d, "SELECT count(*) n FROM biz_payouts WHERE pro_id=?1 AND status != 'paid'", pid); if (owed && owed.n) B.push("FODO still owes you " + owed.n + " payout(s): we pay them first so you get your money.");
  const ref = await safeOne(d, "SELECT count(*) n FROM biz_refunds r JOIN biz_projects j ON j.id=r.project_id WHERE r.status IN ('requested','processing','needs_manual') AND j.client_id=?1", uid); if (ref && ref.n) B.push("A refund to you is still being processed.");
  const sub = await safeOne(d, "SELECT count(*) n FROM acct_subs WHERE user_id=?1 AND status IN ('ACTIVE','active','BANK_APPROVAL_PENDING')", uid); if (sub && sub.n) B.push("Your plan renews automatically: cancel auto-renew in Billing first.");
  return B;
}

/* ---------- delete ---------- */
export async function deleteAccount(env, u, b) {
  if (String(b && b.confirm || "").trim().toUpperCase() !== "DELETE") throw err("Type DELETE to confirm.");
  const B = await blockers(env, u); if (B.length) throw Object.assign(err("Your account can't be deleted yet: " + B.join(" "), 409), { blockers: B });
  const d = await d0(env), uid = u.id, now = nowIso(), n = {}, pro = await safeOne(d, "SELECT id FROM biz_pros WHERE user_id=?1", uid), email = u.email;
  const del = async (k, sql, ...a) => { n[k] = (n[k] || 0) + await safeRun(d, sql, ...a); };
  /* your own workspace data: erased */
  await del("crm", "DELETE FROM crm_acts WHERE user_id=?1", uid); await del("crm", "DELETE FROM crm_deals WHERE user_id=?1", uid); await del("crm", "DELETE FROM crm_contacts WHERE user_id=?1", uid);
  for (const t of ["biz_brand", "biz_content", "biz_campaigns", "biz_shortlist", "biz_notes", "biz_leads", "biz_notify_prefs", "lab_actions", "lab_gsc", "lab_tool_credits"]) await del("workspace", "DELETE FROM " + t + " WHERE user_id=?1", uid);
  await del("monitoring", "DELETE FROM mon_events WHERE user_id=?1", uid); await del("monitoring", "DELETE FROM mon_targets WHERE user_id=?1", uid);
  /* personal files: bytes and rows */
  for (const f of await safeAll(d, "SELECT id, store FROM biz_files WHERE owner_id=?1 AND project_id IS NULL AND deleted_at IS NULL", uid)) { try { if (f.store === "r2" && env.FILES) await env.FILES.delete("biz-files/" + f.id); else if (env.CHAT_KV) await env.CHAT_KV.delete("biz-files/" + f.id); } catch (e) {} await del("files", "UPDATE biz_files SET deleted_at=?2, deleted_by='account-deleted' WHERE id=?1", f.id, now); }
  /* websites: taken offline and removed (their form submissions are the website visitors' data, erased with them) */
  for (const s of await safeAll(d, "SELECT id FROM sites WHERE owner_user_id=?1 AND deleted_at IS NULL", uid)) { await del("websites", "UPDATE sites SET deleted_at=?2, status='draft', doc='{}' WHERE id=?1", s.id, now); await safeRun(d, "DELETE FROM site_forms WHERE site_id=?1", s.id); await safeRun(d, "DELETE FROM site_versions WHERE site_id=?1", s.id); await safeRun(d, "DELETE FROM site_members WHERE site_id=?1", s.id); await safeRun(d, "DELETE FROM site_shares WHERE site_id=?1", s.id); }
  await safeRun(d, "DELETE FROM site_members WHERE email=?1", email);
  /* shared work keeps the other side's record; your words are removed */
  await del("messages", "UPDATE biz_messages SET body='Message removed (account deleted).' WHERE user_id=?1", uid);
  if (pro) { await del("pro", "UPDATE biz_pros SET name='Deleted professional', title='', bio='', photo='', skills='[]', tools='[]', langs='[]', city='', status='archived', invite=NULL, updated_at=?2 WHERE id=?1", pro.id, now);
    await safeRun(d, "DELETE FROM biz_portfolio WHERE pro_id=?1", pro.id); await safeRun(d, "UPDATE biz_packages SET active=0 WHERE pro_id=?1", pro.id); await safeRun(d, "UPDATE biz_project_pros SET status='removed' WHERE pro_id=?1 AND status IN ('invited','accepted','declined')", pro.id); }
  await del("support", "UPDATE help_tickets SET email='', name='' WHERE user_id=?1", uid);
  /* sign-in: every session ends; the account row stays only as an anonymous key for the kept payment records */
  await safeRun(d, "DELETE FROM acct_sessions WHERE user_id=?1", uid); await safeRun(d, "DELETE FROM acct_team WHERE owner_id=?1 OR email=?2", uid, email);
  await d.prepare("UPDATE acct_users SET email=?2, name='', phone='', picture='', google_sub=NULL, fb_uid=NULL, wa_phone=NULL, brand=NULL, admin_note=NULL, plan='free', blocked=1, deleted_at=?3 WHERE id=?1").bind(uid, "deleted+" + uid + "@deleted.fodo.invalid", now).run();   // must succeed (not "safe")
  try { await sendMail(env, email, "Your FODO account was deleted", "<p>Your FODO account and its personal data were deleted, as you asked.</p><p>Payment records are kept for tax law, without your name or contact details.</p>", "Your FODO account and its personal data were deleted. Payment records are kept for tax law, without your name or contact details.", { kind: "privacy" }); } catch (e) {}
  await safeRun(d, "UPDATE help_mail SET to_addr='', from_addr=CASE WHEN from_addr LIKE ?2 THEN '' ELSE from_addr END, text='[removed: account deleted]' WHERE to_addr LIKE ?2 OR from_addr LIKE ?2", uid, "%" + email + "%");   // the mail log too
  await logPrivacy(env, uid, "delete", "Account deleted. Kept without your name or contact details: payments, invoices, payouts and refunds (tax law).");
  return { ok: true, removed: n, kept: ["Payments, invoices and receipts (tax law, without your name or contact details)", "Payouts and refunds linked to projects", "Projects you shared with others (your messages are removed)"] };
}
