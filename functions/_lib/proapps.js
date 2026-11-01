/* FODO v47.4 "Become a FODO Pro": public application pipeline, Profile 2.0 helpers, case studies and real-data badges.
   Rules:
   - Applying needs a FODO account. One application per account. Everything is decided on the server.
   - The pipeline is a fixed state machine; every staff action is written to biz_pro_app_events and the audit log.
     Internal notes are never shown to the applicant; messages are.
   - Approval needs the identity and portfolio checks ticked by a person (the Brain can't tick them), then it creates or
     activates the applicant's FODO Pro profile. FODO Pro profiles stay private (signed-in clients only); /fodo-pros/ stays invite-gated.
   - Case studies are published only after moderation and only with the client's permission.
   - Badges come only from real FODO data with criteria the owner can tune; nothing is invented or bought. */
import { isOwner, nowIso, randId, sendMail } from "./accounts.js";
import { bdb, can, err, auditLog, notify, PRO_ROLES, PRO_CATS } from "./biz.js";

const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").trim().slice(0, n);
const line = (s, n) => clip(s, n).replace(/\s+/g, " ");
const arr = (a, n, m) => (Array.isArray(a) ? a : String(a || "").split(",")).map((x) => line(x, m || 60)).filter(Boolean).filter((x, i, L) => L.indexOf(x) === i).slice(0, n || 20);
const int = (v, lo, hi) => { if (v === "" || v == null) return null; const n = Math.round(+v); return isFinite(n) && n >= lo && n <= hi ? n : null; };
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
const https = (s) => { s = clip(s, 400); return /^https:\/\/[^\s<>"']+\.[^\s<>"']+$/i.test(s) ? s : ""; };
const all = async (d, sql, ...a) => (await d.prepare(sql).bind(...a).all()).results || [];
const one = (d, sql, ...a) => d.prepare(sql).bind(...a).first();
const run = (d, sql, ...a) => d.prepare(sql).bind(...a).run();
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/* ---------- application pipeline ---------- */
export const APP_STATES = ["draft", "submitted", "under_review", "needs_information", "interview", "verification", "approved", "rejected", "archived"];
export const APP_LABEL = { draft: "Draft", submitted: "Submitted", under_review: "Under review", needs_information: "Needs information", interview: "Interview", verification: "Verification", approved: "Approved", rejected: "Not approved", archived: "Archived" };
/* staff action → [new status, from which statuses] */
const ACTIONS = {
  review: ["under_review", ["submitted"]],
  request_info: ["needs_information", ["submitted", "under_review", "interview", "verification"]],
  interview: ["interview", ["under_review", "verification"]],
  verify: ["verification", ["under_review", "interview"]],
  approve: ["approved", ["under_review", "interview", "verification"]],
  reject: ["rejected", ["submitted", "under_review", "needs_information", "interview", "verification"]],
  archive: ["archived", ["draft", "submitted", "under_review", "needs_information", "interview", "verification", "rejected"]],
  reopen: ["under_review", ["rejected", "archived"]],
};
export const CHECKS = [["identity", "Identity checked (name, phone, a government ID seen on a call; never stored)"], ["portfolio", "Portfolio checked (the work is theirs, links open)"], ["references", "References or past clients checked"], ["interview", "Interview done"]];
const NEED_TO_APPROVE = ["identity", "portfolio"];
export const REAPPLY_DAYS = 30;
const AVAIL = ["full_time", "part_time", "weekends", "per_project"];

export function cleanApp(b, old) {
  b = b || {}; const o = Object.assign({}, old || {}), has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  if (has("name")) o.name = line(b.name, 80);
  if (has("phone")) o.phone = line(b.phone, 20).replace(/[^\d+ -]/g, "");
  if (has("city")) o.city = line(b.city, 60);
  if (has("role")) o.role = PRO_ROLES.indexOf(b.role) > -1 ? b.role : "";
  if (has("roles2")) o.roles2 = arr(b.roles2, 10, 60).filter((r) => PRO_ROLES.indexOf(r) > -1 && r !== o.role).slice(0, 3);
  if (has("years")) o.years = int(b.years, 0, 60);
  if (has("langs")) o.langs = arr(b.langs, 8, 30);
  if (has("about")) o.about = clip(b.about, 1500);
  ["specializations", "industries", "skills", "tools", "equipment"].forEach((k) => { if (has(k)) o[k] = arr(b[k], k === "equipment" ? 30 : 15, 60); });
  if (has("remote")) o.remote = !!b.remote; if (has("onsite")) o.onsite = !!b.onsite; if (has("travel")) o.travel = !!b.travel;
  if (has("radiusKm")) o.radiusKm = int(b.radiusKm, 0, 3000);
  if (has("rateDay")) o.rateDay = int(b.rateDay, 0, 1e7); if (has("rateProject")) o.rateProject = int(b.rateProject, 0, 1e8);
  if (has("availability")) o.availability = AVAIL.indexOf(b.availability) > -1 ? b.availability : "";
  if (has("days")) o.days = arr(b.days, 7, 3).filter((x) => DAYS.indexOf(x) > -1);
  if (has("links")) o.links = (Array.isArray(b.links) ? b.links : String(b.links || "").split(/[\n,]+/)).map((x) => typeof x === "object" && x ? { title: line(x.title, 100), url: https(x.url) } : { title: "", url: https(x) }).filter((x) => x.url).filter((x, i, L) => L.findIndex((y) => y.url === x.url) === i).slice(0, 8);
  if (has("showreel")) o.showreel = https(b.showreel); if (has("website")) o.website = https(b.website);
  if (has("instagram")) o.instagram = line(b.instagram, 60).replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/[^\w.@]/g, "");
  if (has("bestWork")) o.bestWork = clip(b.bestWork, 1200); if (has("whyFodo")) o.whyFodo = clip(b.whyFodo, 800); if (has("referral")) o.referral = line(b.referral, 120);
  if (has("agree")) o.agree = !!b.agree; if (has("truthful")) o.truthful = !!b.truthful;
  return o;
}
/* what is still missing before submitting, grouped by the form step */
export function missingOf(a) {
  a = a || {}; const m = [];
  if (!a.name || a.name.length < 2) m.push([1, "Your professional name"]);
  if ((a.phone || "").replace(/\D/g, "").length < 10) m.push([1, "A phone number FODO can call"]);
  if (!a.city) m.push([1, "City"]); if (!a.role) m.push([1, "Primary role"]); if (a.years == null) m.push([1, "Years of experience"]);
  if (!(a.about || "").length || a.about.length < 60) m.push([1, "About you (60+ characters)"]);
  if (!(a.skills || []).length) m.push([2, "At least one skill"]); if (!a.remote && !a.onsite) m.push([2, "How you work (remote and / or on-site)"]);
  if (!a.availability) m.push([2, "Availability"]);
  if (((a.links || []).length + (a.showreel ? 1 : 0)) < 2) m.push([3, "At least 2 links to your own work (or 1 link + a showreel)"]);
  if (!a.agree) m.push([4, "Accept the FODO Pros terms"]); if (!a.truthful) m.push([4, "Confirm the work and details are your own and true"]);
  return m.map((x) => ({ step: x[0], item: x[1] }));
}
const pubEvent = (e) => ({ kind: e.kind, status: e.to_status, label: APP_LABEL[e.to_status] || null, message: e.public ? e.note : null, at: e.created_at });
function appOut(a, staff) {
  const o = { id: a.id, status: a.status, label: APP_LABEL[a.status], data: J(a.data, {}), message: a.message || null, submittedAt: a.submitted_at, decidedAt: a.decided_at, createdAt: a.created_at, updatedAt: a.updated_at, proId: a.pro_id || null };
  if (staff) Object.assign(o, { reviewer: a.reviewer || null, checks: J(a.checks, {}), email: a.email || null, decidedBy: a.decided_by || null });
  return o;
}
async function event(d, appId, actor, kind, from, to, note, isPublic) { await run(d, "INSERT INTO biz_pro_app_events (app_id, actor, kind, from_status, to_status, note, public, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)", appId, actor || "", kind, from || null, to || null, clip(note, 1500) || null, isPublic ? 1 : 0, nowIso()); }

/* applicant side */
export async function myApplication(env, u) {
  const d = await bdb(env), a = await one(d, "SELECT * FROM biz_pro_applications WHERE user_id=?1", u.id), pro = await one(d, "SELECT id, status FROM biz_pros WHERE user_id=?1", u.id);
  const out = { application: null, hasPro: !!pro, proStatus: pro ? pro.status : null, roles: PRO_ROLES, categories: PRO_CATS, checksNeeded: NEED_TO_APPROVE.length, reapplyDays: REAPPLY_DAYS };
  if (!a) return out;
  out.application = appOut(a); out.application.missing = missingOf(J(a.data, {}));
  out.application.canEdit = a.status === "draft" || a.status === "needs_information";
  out.application.events = (await all(d, "SELECT kind, to_status, note, public, created_at FROM biz_pro_app_events WHERE app_id=?1 AND (public=1 OR kind IN ('submit','resubmit','status')) ORDER BY id", a.id)).map(pubEvent);
  if (["rejected", "archived"].indexOf(a.status) > -1 && a.decided_at) { const at = Date.parse(a.decided_at) + REAPPLY_DAYS * 864e5; out.application.reapplyFrom = new Date(at).toISOString().slice(0, 10); out.application.canReapply = Date.now() >= at; }
  return out;
}
export async function saveApplication(env, u, b) {
  const d = await bdb(env), now = nowIso();
  if (await one(d, "SELECT 1 x FROM biz_pros WHERE user_id=?1", u.id)) throw err("You already have a FODO Pro profile. Open it from FODO Pros.", 409);
  let a = await one(d, "SELECT * FROM biz_pro_applications WHERE user_id=?1", u.id);
  if (a && (a.status === "rejected" || a.status === "archived")) {   // a fresh start after the waiting period (the old history stays)
    if (!a.decided_at || Date.now() < Date.parse(a.decided_at) + REAPPLY_DAYS * 864e5) throw err("You can apply again from " + new Date(Date.parse(a.decided_at || now) + REAPPLY_DAYS * 864e5).toISOString().slice(0, 10) + ".", 409);
    await run(d, "UPDATE biz_pro_applications SET status='draft', message=NULL, reviewer=NULL, checks=NULL, decided_at=NULL, decided_by=NULL, updated_at=?2 WHERE id=?1", a.id, now); await event(d, a.id, u.email, "reapply", a.status, "draft", null, false);
    a = await one(d, "SELECT * FROM biz_pro_applications WHERE id=?1", a.id);
  }
  if (a && a.status !== "draft" && a.status !== "needs_information") throw err("Your application is with FODO (" + APP_LABEL[a.status].toLowerCase() + "). You can change it when FODO asks for more information.", 409);
  const data = cleanApp(b, a ? J(a.data, {}) : {}), s = JSON.stringify(data); if (s.length > 20000) throw err("That's too much text, please shorten it.");
  if (!a) { const id = "pa" + randId(14); await run(d, "INSERT INTO biz_pro_applications (id, user_id, status, data, created_at, updated_at) VALUES (?1,?2,'draft',?3,?4,?4)", id, u.id, s, now); await event(d, id, u.email, "create", null, "draft", null, false); }
  else await run(d, "UPDATE biz_pro_applications SET data=?2, updated_at=?3 WHERE id=?1", a.id, s, now);
  return myApplication(env, u);
}
export async function submitApplication(env, u) {
  const d = await bdb(env), a = await one(d, "SELECT * FROM biz_pro_applications WHERE user_id=?1", u.id); if (!a) throw err("Fill in the application first.", 404);
  if (a.status !== "draft" && a.status !== "needs_information") throw err("Already submitted.", 409);
  const miss = missingOf(J(a.data, {})); if (miss.length) throw Object.assign(err("Almost there. Still missing: " + miss.map((x) => x.item).join(", ") + "."), { missing: miss.map((x) => x.item) });
  const back = a.status === "needs_information", now = nowIso();
  const x = await run(d, "UPDATE biz_pro_applications SET status='submitted', submitted_at=COALESCE(submitted_at, ?2), updated_at=?2 WHERE id=?1 AND status=?3", a.id, now, a.status); if (!x.meta.changes) throw err("Already submitted.", 409);
  await event(d, a.id, u.email, back ? "resubmit" : "submit", a.status, "submitted", null, false); await auditLog(env, u.email, "proapp:" + (back ? "resubmit" : "submit"), a.id);
  return myApplication(env, u);
}

/* staff side */
export async function adminApplications(env, R, q) {
  if (!can(R, ["admin", "moderator", "viewer"])) throw err("Not allowed.", 403); const d = await bdb(env), st = APP_STATES.indexOf((q || {}).status) > -1 ? q.status : "";
  const counts = {}; for (const r of await all(d, "SELECT status, count(*) n FROM biz_pro_applications GROUP BY status")) counts[r.status] = r.n;
  const s = clip((q || {}).q, 60).toLowerCase(), L = await all(d, "SELECT a.*, u.email FROM biz_pro_applications a LEFT JOIN acct_users u ON u.id=a.user_id WHERE " + (st ? "a.status=?1" : "(a.status NOT IN ('draft','archived') AND ?1='')") + " ORDER BY CASE a.status WHEN 'submitted' THEN 0 WHEN 'needs_information' THEN 3 ELSE 1 END, COALESCE(a.submitted_at, a.updated_at) LIMIT 300", st);
  const items = L.map((a) => { const x = J(a.data, {}); return { id: a.id, status: a.status, label: APP_LABEL[a.status], name: x.name || "(no name yet)", role: x.role || "", city: x.city || "", years: x.years, email: a.email, reviewer: a.reviewer, submittedAt: a.submitted_at, updatedAt: a.updated_at, links: (x.links || []).length + (x.showreel ? 1 : 0), checks: Object.keys(J(a.checks, {})).filter((k) => J(a.checks, {})[k]).length }; })
    .filter((x) => !s || (x.name + " " + x.role + " " + x.city + " " + (x.email || "")).toLowerCase().indexOf(s) > -1);
  const waiting = ["submitted", "under_review", "interview", "verification"].reduce((n, k) => n + (counts[k] || 0), 0);
  return { items, counts, waiting, states: APP_STATES.map((k) => ({ key: k, label: APP_LABEL[k] })) };
}
export async function adminApplication(env, R, id) {
  if (!can(R, ["admin", "moderator", "viewer"])) throw err("Not allowed.", 403); const d = await bdb(env), a = await one(d, "SELECT a.*, u.email FROM biz_pro_applications a LEFT JOIN acct_users u ON u.id=a.user_id WHERE a.id=?1", id); if (!a) throw err("Not found.", 404);
  const o = appOut(a, true); o.missing = missingOf(o.data); o.events = await all(d, "SELECT id, actor, kind, from_status, to_status, note, public, created_at FROM biz_pro_app_events WHERE app_id=?1 ORDER BY id", id);
  o.actions = Object.keys(ACTIONS).filter((k) => ACTIONS[k][1].indexOf(a.status) > -1); o.checkList = CHECKS.map((c) => ({ key: c[0], label: c[1], required: NEED_TO_APPROVE.indexOf(c[0]) > -1 }));
  o.canAct = can(R, ["admin", "moderator"]);
  return o;
}
const MSG_TO = { request_info: "FODO needs a little more information for your FODO Pro application", interview: "FODO would like to talk to you about your FODO Pro application", verify: "Your FODO Pro application is in verification", approve: "Welcome to FODO Pros: your application is approved", reject: "About your FODO Pro application", reopen: "Your FODO Pro application is being reviewed again" };
export async function decideApplication(env, u, R, id, b) {
  if (!can(R, ["admin", "moderator"])) throw err("Only FODO admins and moderators review applications.", 403);
  const d = await bdb(env), a = await one(d, "SELECT * FROM biz_pro_applications WHERE id=?1", id); if (!a) throw err("Not found.", 404);
  b = b || {}; const action = String(b.action || ""), msg = clip(b.message, 1500), note = clip(b.note, 1500), now = nowIso();
  if (action === "note") { if (note.length < 2) throw err("Write the note."); await event(d, id, u.email, "note", a.status, a.status, note, false); await auditLog(env, u.email, "proapp:note", id); return adminApplication(env, R, id); }
  if (action === "assign") { const who = b.reviewer === "" ? null : (clip(b.reviewer, 120).toLowerCase() || u.email); await run(d, "UPDATE biz_pro_applications SET reviewer=?2, updated_at=?3 WHERE id=?1", id, who, now); await event(d, id, u.email, "assign", a.status, a.status, who ? "Reviewer: " + who : "Reviewer removed", false); await auditLog(env, u.email, "proapp:assign", id, who || "none"); return adminApplication(env, R, id); }
  if (action === "check") { const k = String(b.key || ""); if (!CHECKS.some((c) => c[0] === k)) throw err("Unknown check."); if (["approved", "rejected", "archived", "draft"].indexOf(a.status) > -1) throw err("Checks can be changed only while the application is being reviewed.", 409);
    const C = J(a.checks, {}); if (b.value) C[k] = { by: u.email, at: now }; else delete C[k];
    await run(d, "UPDATE biz_pro_applications SET checks=?2, updated_at=?3 WHERE id=?1", id, JSON.stringify(C), now); await event(d, id, u.email, "check", a.status, a.status, (b.value ? "Ticked: " : "Unticked: ") + k + (note ? " · " + note : ""), false); await auditLog(env, u.email, "proapp:check", id, k + "=" + !!b.value); return adminApplication(env, R, id); }
  const A = ACTIONS[action]; if (!A) throw err("Unknown action.");
  if (A[1].indexOf(a.status) < 0) throw err("You can't " + action.replace("_", " ") + " an application that is " + APP_LABEL[a.status].toLowerCase() + ".", 409);
  if (action === "request_info" && msg.length < 10) throw err("Tell the applicant what to add or change (10+ characters).");
  if (action === "interview" && msg.length < 10) throw err("Tell the applicant when and how the interview happens (10+ characters).");
  if (action === "reject" && msg.length < 10) throw err("Give the applicant a short, kind reason (10+ characters).");
  let proId = a.pro_id || null;
  if (action === "approve") {
    const C = J(a.checks, {}), miss = NEED_TO_APPROVE.filter((k) => !C[k]); if (miss.length) throw err("Before approving, tick: " + miss.map((k) => CHECKS.find((c) => c[0] === k)[1].split(" (")[0]).join(", ") + ".", 409);
    const m = missingOf(J(a.data, {})); if (m.length) throw err("The application is incomplete: " + m.map((x) => x.item).join(", ") + ".", 409);
    proId = await createPro(env, d, a, u);
  }
  const to = A[0], x = await run(d, "UPDATE biz_pro_applications SET status=?2, message=CASE WHEN ?3 != '' THEN ?3 ELSE message END, decided_at=CASE WHEN ?2 IN ('approved','rejected','archived') THEN ?4 ELSE NULL END, decided_by=CASE WHEN ?2 IN ('approved','rejected','archived') THEN ?5 ELSE decided_by END, pro_id=COALESCE(?6, pro_id), reviewer=COALESCE(reviewer, ?5), updated_at=?4 WHERE id=?1 AND status=?7", id, to, msg, now, u.email, proId, a.status);
  if (!x.meta.changes) throw err("Someone changed this application meanwhile. Reload it.", 409);
  await event(d, id, u.email, "status", a.status, to, msg || null, !!msg); if (note) await event(d, id, u.email, "note", to, to, note, false);
  await auditLog(env, u.email, "proapp:" + action, id, msg || note);
  if (MSG_TO[action]) {
    const link = action === "approve" ? "/fodo-pros/" : "/workspace/#apply";
    await notify(env, a.user_id, "application", MSG_TO[action] + (msg ? ": " + msg.slice(0, 160) : "."), action === "approve" ? "#pro" : "#apply");
    const usr = await one(d, "SELECT email FROM acct_users WHERE id=?1", a.user_id), e = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
    if (usr && usr.email && action !== "verify") await sendMail(env, usr.email, MSG_TO[action], "<p>" + e(MSG_TO[action]) + ".</p>" + (msg ? "<p>" + e(msg).replace(/\n/g, "<br>") + "</p>" : "") + '<p><a href="https://www.fodo.co.in' + link + '">' + (action === "approve" ? "Open FODO Pros" : "Open your application") + "</a></p>", MSG_TO[action] + "." + (msg ? "\n\n" + msg : "") + "\n\nhttps://www.fodo.co.in" + link, { kind: "pro" }).catch(() => {});
  }
  return adminApplication(env, R, id);
}
/* approval: the applicant's details become their FODO Pro profile (approved; still private to signed-in clients) */
async function createPro(env, d, a, u) {
  const x = J(a.data, {}), now = nowIso(), ex = await one(d, "SELECT * FROM biz_pros WHERE user_id=?1", a.user_id);
  if (ex) { if (ex.status === "suspended") throw err("This person's FODO Pro profile is suspended. Restore it under Professionals first.", 409);
    await run(d, "UPDATE biz_pros SET status='approved', approved_at=?2, approved_by=?3, note=NULL, updated_at=?2 WHERE id=?1", ex.id, now, u.email); await auditLog(env, u.email, "pro:approve", ex.id, "application " + a.id); return ex.id; }
  const id = "pr" + randId(14), cats = Object.keys(PRO_CATS).filter((c) => PRO_CATS[c].indexOf(x.role) > -1), days = (x.days || []).length ? x.days : (x.availability === "weekends" ? ["sat", "sun"] : ["mon", "tue", "wed", "thu", "fri", "sat"]);
  await run(d, "INSERT INTO biz_pros (id, user_id, name, title, role, cats, skills, tools, years, city, radius_km, remote, onsite, langs, bio, rate_day, photo, days, blackout, notice_days, terms_at, status, submitted_at, approved_at, approved_by, invite, specializations, industries, equipment, rate_project, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,'',?17,'[]',0,?18,'approved',?19,?20,?21,?22,?23,?24,?25,?26,?20,?20)",
    id, a.user_id, x.name, (x.specializations || [])[0] ? x.role + " · " + x.specializations[0] : x.role, x.role, JSON.stringify(cats), JSON.stringify(x.skills || []), JSON.stringify(x.tools || []), x.years, x.city, x.radiusKm || 0, x.remote ? 1 : 0, x.onsite ? 1 : 0, JSON.stringify(x.langs || []), x.about, x.rateDay, JSON.stringify(days),
    a.submitted_at || now, a.submitted_at || now, now, u.email, "app:" + a.id, JSON.stringify(x.specializations || []), JSON.stringify(x.industries || []), JSON.stringify(x.equipment || []), x.rateProject);
  const links = (x.showreel ? [{ title: "Showreel", url: x.showreel }] : []).concat(x.links || []).slice(0, 10);
  for (const l of links) await run(d, "INSERT INTO biz_portfolio (id, pro_id, kind, title, url, role, industry, descr, created_at) VALUES (?1,?2,?3,?4,?5,?6,'','',?7)", "pf" + randId(12), id, /youtube|youtu\.be|vimeo/i.test(l.url) ? "video" : "link", l.title || "Work sample", l.url, x.role, now);
  await auditLog(env, u.email, "pro:create", id, "from application " + a.id);
  return id;
}

/* ---------- case studies ---------- */
export const CS_STATES = ["draft", "pending", "published", "rejected", "hidden"];
async function proRow(d, u) { const p = await one(d, "SELECT * FROM biz_pros WHERE user_id=?1", u.id); if (!p) throw err("Create your FODO Pro profile first.", 404); return p; }
function csOut(c, mine) {
  const o = { id: c.id, title: c.title, client: c.client_name || null, industry: c.industry || null, role: c.role || null, challenge: c.challenge || "", approach: c.approach || "", result: c.result || "", metrics: c.metrics || "", links: J(c.links, []), fodoProject: !!c.project_id, publishedAt: c.published_at };
  if (mine) Object.assign(o, { status: c.status, note: c.mod_note || null, projectId: c.project_id || null, clientPermission: !!c.client_permission, updatedAt: c.updated_at });
  return o;
}
async function projectOk(d, proId, pid) {
  if (!pid) return null; const pj = await one(d, "SELECT id, status, pro_id FROM biz_projects WHERE id=?1", pid); if (!pj) throw err("That FODO project wasn't found.", 404);
  const mem = pj.pro_id === proId || !!(await one(d, "SELECT 1 x FROM biz_project_pros WHERE project_id=?1 AND pro_id=?2 AND status='accepted'", pid, proId));
  if (!mem) throw err("You can link only FODO projects you worked on.", 403); if (pj.status !== "completed") throw err("Link a FODO project after it is completed.", 409); return pj.id;
}
export async function myCases(env, u) { const d = await bdb(env), p = await proRow(d, u);
  return { items: (await all(d, "SELECT * FROM biz_pro_case_studies WHERE pro_id=?1 ORDER BY updated_at DESC", p.id)).map((c) => csOut(c, true)),
    projects: await all(d, "SELECT j.id, j.title FROM biz_projects j WHERE j.status='completed' AND (j.pro_id=?1 OR EXISTS (SELECT 1 FROM biz_project_pros x WHERE x.project_id=j.id AND x.pro_id=?1 AND x.status='accepted')) ORDER BY j.updated_at DESC LIMIT 50", p.id) }; }
export async function saveCase(env, u, b) {
  const d = await bdb(env), p = await proRow(d, u), now = nowIso(); b = b || {}; if (p.status === "suspended") throw err("Your profile is suspended. Contact FODO.", 403);
  const title = line(b.title, 120); if (title.length < 4) throw err("Give the case study a title.");
  const links = (Array.isArray(b.links) ? b.links : String(b.links || "").split(/[\n,]+/)).map(https).filter(Boolean).slice(0, 6);
  const v = [title, line(b.client, 80), line(b.industry, 60), line(b.role, 60), clip(b.challenge, 1500), clip(b.approach, 2000), clip(b.result, 1500), clip(b.metrics, 600), JSON.stringify(links), await projectOk(d, p.id, line(b.projectId, 40)), b.clientPermission ? 1 : 0];
  if (b.id) { const c = await one(d, "SELECT * FROM biz_pro_case_studies WHERE id=?1 AND pro_id=?2", b.id, p.id); if (!c) throw err("Not found.", 404);
    const st = c.status === "published" || c.status === "pending" ? "pending" : c.status === "rejected" ? "draft" : c.status;   // a changed published story goes back to review
    await run(d, "UPDATE biz_pro_case_studies SET title=?3, client_name=?4, industry=?5, role=?6, challenge=?7, approach=?8, result=?9, metrics=?10, links=?11, project_id=?12, client_permission=?13, status=?14, updated_at=?15 WHERE id=?1 AND pro_id=?2", c.id, p.id, ...v, st, now); }
  else { if (((await one(d, "SELECT count(*) n FROM biz_pro_case_studies WHERE pro_id=?1", p.id)) || {}).n >= 12) throw err("Up to 12 case studies.");
    await run(d, "INSERT INTO biz_pro_case_studies (id, pro_id, title, client_name, industry, role, challenge, approach, result, metrics, links, project_id, client_permission, status, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,'draft',?14,?14)", "cs" + randId(12), p.id, ...v, now); }
  return myCases(env, u);
}
export async function submitCase(env, u, id) {
  const d = await bdb(env), p = await proRow(d, u), c = await one(d, "SELECT * FROM biz_pro_case_studies WHERE id=?1 AND pro_id=?2", id, p.id); if (!c) throw err("Not found.", 404);
  if (["approved", "published"].indexOf(p.status) < 0) throw err("Case studies can be sent for review once your profile is approved.", 409);
  if (!c.client_permission) throw err("Tick that the client allowed you to publish this work. FODO publishes case studies only with the client's permission.");
  if ((c.challenge + c.approach + c.result).length < 120) throw err("Tell the story first: the challenge, what you did and the result (120+ characters together).");
  if (c.status === "pending" || c.status === "published") return myCases(env, u);
  await run(d, "UPDATE biz_pro_case_studies SET status='pending', updated_at=?2 WHERE id=?1", id, nowIso()); await auditLog(env, u.email, "case:submit", id); return myCases(env, u);
}
export async function delCase(env, u, id) { const d = await bdb(env), p = await proRow(d, u); await run(d, "DELETE FROM biz_pro_case_studies WHERE id=?1 AND pro_id=?2", id, p.id); return myCases(env, u); }
export async function adminCases(env, R, q) {
  if (!can(R, ["admin", "moderator", "viewer"])) throw err("Not allowed.", 403); const d = await bdb(env), st = CS_STATES.indexOf((q || {}).status) > -1 ? q.status : "pending";
  const counts = {}; for (const r of await all(d, "SELECT status, count(*) n FROM biz_pro_case_studies GROUP BY status")) counts[r.status] = r.n;
  return { counts, items: (await all(d, "SELECT c.*, p.name pro_name, p.role pro_role FROM biz_pro_case_studies c JOIN biz_pros p ON p.id=c.pro_id WHERE c.status=?1 ORDER BY c.updated_at LIMIT 200", st)).map((c) => Object.assign(csOut(c, true), { proId: c.pro_id, proName: c.pro_name, proRole: c.pro_role, moderatedBy: c.moderated_by })) };
}
export async function moderateCase(env, u, R, id, b) {
  if (!can(R, ["admin", "moderator"])) throw err("Only FODO admins and moderators.", 403); const d = await bdb(env), c = await one(d, "SELECT * FROM biz_pro_case_studies WHERE id=?1", id); if (!c) throw err("Not found.", 404);
  const map = { publish: "published", reject: "rejected", hide: "hidden" }, to = map[(b || {}).action], note = clip((b || {}).note, 600), now = nowIso(); if (!to) throw err("Unknown action.");
  if (to === "published" && !c.client_permission) throw err("The professional hasn't confirmed the client's permission.", 409);
  if (to === "published" && c.status !== "pending" && c.status !== "hidden") throw err("Only case studies sent for review (or hidden ones) can be published.", 409);
  if (to !== "published" && note.length < 5) throw err("Say why (the professional sees it).");
  await run(d, "UPDATE biz_pro_case_studies SET status=?2, mod_note=?3, moderated_by=?4, moderated_at=?5, published_at=CASE WHEN ?2='published' THEN ?5 ELSE published_at END, updated_at=?5 WHERE id=?1", id, to, note || null, u.email, now);
  await auditLog(env, u.email, "case:" + b.action, id, note); const p = await one(d, "SELECT user_id FROM biz_pros WHERE id=?1", c.pro_id);
  if (p) await notify(env, p.user_id, "moderation", "Your case study \"" + c.title.slice(0, 60) + "\" is " + to + (note ? ": " + note.slice(0, 160) : "."), "#pro");
  return adminCases(env, R, { status: c.status === "pending" ? "pending" : to });
}
export async function publicCases(d, proId) { return (await all(d, "SELECT * FROM biz_pro_case_studies WHERE pro_id=?1 AND status='published' AND client_permission=1 ORDER BY published_at DESC LIMIT 12", proId)).map((c) => csOut(c)); }

/* ---------- FODO Recommended (editorial, audited) ---------- */
export async function recommend(env, u, R, proId, b) {
  if (!can(R, ["admin"])) throw err("Only FODO admins mark professionals as FODO Recommended.", 403);
  const d = await bdb(env), p = await one(d, "SELECT id, status, name FROM biz_pros WHERE id=?1", proId); if (!p) throw err("Not found.", 404);
  const on = !!(b || {}).on, note = clip((b || {}).note, 200);
  if (on && ["approved", "published"].indexOf(p.status) < 0) throw err("Only approved professionals can be recommended.", 409);
  if (on && note.length < 10) throw err("Write why FODO recommends them (10+ characters). Clients see it.");
  await run(d, "UPDATE biz_pros SET recommended=?2, recommended_note=?3, recommended_by=?4, recommended_at=?5 WHERE id=?1", proId, on ? 1 : 0, on ? note : null, u.email, nowIso());
  await auditLog(env, u.email, on ? "pro:recommend" : "pro:unrecommend", proId, note); return { ok: true, recommended: on, note: on ? note : null };
}

/* ---------- badges from real data ---------- */
export const BADGE_DEFAULTS = { fastHours: 6, fastMin: 3, responseRate: 90, responseMin: 5, completionRate: 90, completionMin: 5, repeatClients: 2 };
export const BADGES = [["verified", "Verified by FODO"], ["fast_response", "Fast Response"], ["top_response", "Top Response"], ["high_completion", "High Completion"], ["repeat_favorite", "Repeat Client Favorite"], ["recommended", "FODO Recommended"]];
export async function badgeConfig(env) { const d = await bdb(env), r = await one(d, "SELECT v FROM biz_settings WHERE k='badges'"); return Object.assign({}, BADGE_DEFAULTS, J(r && r.v, {})); }
export async function saveBadgeConfig(env, u, b) {
  if (!isOwner(u)) throw err("Only FODO owners change the badge rules.", 403); b = b || {}; const reason = clip(b.reason, 300); if (reason.length < 5) throw err("Say why the rules change (kept in the audit log).");
  const lim = { fastHours: [1, 72], fastMin: [1, 50], responseRate: [50, 100], responseMin: [1, 100], completionRate: [50, 100], completionMin: [1, 100], repeatClients: [2, 20] }, c = await badgeConfig(env);
  for (const k of Object.keys(lim)) if (b[k] != null && b[k] !== "") { const v = int(b[k], lim[k][0], lim[k][1]); if (v == null) throw err(k + " must be " + lim[k][0] + " – " + lim[k][1] + "."); c[k] = v; }
  await run(await bdb(env), "INSERT OR REPLACE INTO biz_settings (k, v) VALUES ('badges', ?1)", JSON.stringify(c)); await auditLog(env, u.email, "settings:badges", "", reason + " · " + JSON.stringify(c)); return c;
}
const median = (L) => { if (!L.length) return null; const s = L.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/* per-professional numbers behind the badges, for every professional with any history (bounded queries, computed together) */
export async function proStats(d) {
  const S = {}, get = (id) => S[id] || (S[id] = { answered: 0, missed: 0, hours: [], completed: 0, cancelled: 0, clients: {} });
  for (const r of await all(d, "SELECT pro_id, invited_at, answered_at, status FROM biz_team_members WHERE pro_id IS NOT NULL AND invited_at IS NOT NULL AND (answered_at IS NOT NULL OR status='expired') LIMIT 50000")) {
    const s = get(r.pro_id); if (r.answered_at) { s.answered++; const h = (Date.parse(r.answered_at) - Date.parse(r.invited_at)) / 36e5; if (isFinite(h) && h >= 0) s.hours.push(h); } else s.missed++; }
  const P = await all(d, "SELECT j.pro_id, j.id, j.client_id, j.status, EXISTS (SELECT 1 FROM biz_milestones m WHERE m.project_id=j.id AND m.funded_at IS NOT NULL) paid FROM biz_projects j WHERE j.status IN ('completed','cancelled') AND j.pro_id IS NOT NULL " +
    "UNION SELECT x.pro_id, j.id, j.client_id, j.status, EXISTS (SELECT 1 FROM biz_milestones m WHERE m.project_id=j.id AND m.funded_at IS NOT NULL) paid FROM biz_project_pros x JOIN biz_projects j ON j.id=x.project_id WHERE x.status='accepted' AND j.status IN ('completed','cancelled') LIMIT 50000");
  for (const r of P) { const s = get(r.pro_id); if (r.status === "completed") { s.completed++; s.clients[r.client_id] = (s.clients[r.client_id] || 0) + 1; } else if (r.paid) s.cancelled++; }   // a cancellation counts only after money was paid (the work had started)
  return S;
}
export function badgesFor(p, s, C) {
  const out = [], add = (k, why) => out.push({ key: k, label: BADGES.find((b) => b[0] === k)[1], why });
  s = s || { answered: 0, missed: 0, hours: [], completed: 0, cancelled: 0, clients: {} };
  if (p.status === "approved" || p.status === "published") add("verified", "Profile reviewed and approved by FODO.");
  const med = median(s.hours); if (s.hours.length >= C.fastMin && med != null && med <= C.fastHours) add("fast_response", "Usually answers team invitations within " + (med < 1 ? "an hour" : Math.round(med) + " h") + " (median of " + s.hours.length + ").");
  const asked = s.answered + s.missed; if (asked >= C.responseMin && s.answered / asked * 100 >= C.responseRate) add("top_response", "Answered " + s.answered + " of " + asked + " team invitations.");
  const fin = s.completed + s.cancelled; if (s.completed >= C.completionMin && s.completed / fin * 100 >= C.completionRate) add("high_completion", s.completed + " of " + fin + " paid FODO projects completed.");
  const rep = Object.keys(s.clients).filter((k) => s.clients[k] >= 2).length; if (rep >= C.repeatClients) add("repeat_favorite", rep + " clients hired them again on FODO.");
  if (p.recommended) add("recommended", String(p.recommended_note || "Picked by the FODO team").replace(/\.?$/, "."));
  return out;
}
export async function badgeMap(env, rows) { const d = await bdb(env), C = await badgeConfig(env), S = rows.length ? await proStats(d) : {}, M = {}; rows.forEach((p) => { M[p.id] = badgesFor(p, S[p.id], C); }); return M; }
export async function badgeOverview(env, u, R) {
  if (!can(R, ["admin", "moderator", "finance", "viewer"])) throw err("Not allowed.", 403); const d = await bdb(env), C = await badgeConfig(env), S = await proStats(d), rows = await all(d, "SELECT * FROM biz_pros WHERE status IN ('approved','published') LIMIT 5000"), counts = {};
  BADGES.forEach((b) => { counts[b[0]] = 0; }); const holders = rows.map((p) => { const L = badgesFor(p, S[p.id], C); L.forEach((b) => { counts[b.key]++; }); return { id: p.id, name: p.name, role: p.role, recommended: !!p.recommended, badges: L.map((b) => b.key) }; });
  return { config: C, defaults: BADGE_DEFAULTS, badges: BADGES.map((b) => ({ key: b[0], label: b[1], holders: counts[b[0]] })), pros: holders.sort((a, b) => b.badges.length - a.badges.length).slice(0, 200), canEdit: isOwner(u) };
}
/* the profile view a signed-in client sees: proOut + Profile 2.0 + badges + published case studies */
export async function enrich(env, p, o) {
  const d = await bdb(env); o.badges = (await badgeMap(env, [p]))[p.id]; o.caseStudies = await publicCases(d, p.id); return o;
}
