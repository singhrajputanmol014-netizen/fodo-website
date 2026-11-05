/* FODO v51: company assets register. The things FODO owns (cameras, lenses, laptops, phones, drives): tag, serial, cost, bought on,
   warranty, condition, location, who holds it now, status, maintenance date, and a history of every hand-over. Separate from
   biz_equipment, which is the rental catalogue production uses for quotes; an asset can point at its catalogue entry.
   Permission: the existing `equipment` resource (view team+, manage department+). Everyone sees what is assigned to them. */
import { nowIso } from "../accounts.js";
import { notify } from "../biz.js";
import { osdb, one, all, run, clip, err, int, DAY, rid, ORG } from "./db.js";
import { has } from "./authz.js";
import { audit, emit } from "./audit.js";
import { today, addDays, nameOf, ownerIds, looksLikeAccountNo } from "./kit.js";

const DDL = [
  "CREATE TABLE IF NOT EXISTS os_assets (id TEXT PRIMARY KEY, org_id TEXT, tag TEXT, name TEXT, category TEXT, serial TEXT, equipment_id TEXT, bought_on TEXT, cost INTEGER, vendor TEXT, warranty_until TEXT, condition TEXT, location TEXT, holder_user_id TEXT, status TEXT, maintenance_due TEXT, notes TEXT, retired_reason TEXT, created_by TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE UNIQUE INDEX IF NOT EXISTS os_assets_tag ON os_assets(org_id, tag)", "CREATE INDEX IF NOT EXISTS os_assets_holder ON os_assets(holder_user_id, status)",
  "CREATE TABLE IF NOT EXISTS os_asset_log (id INTEGER PRIMARY KEY AUTOINCREMENT, asset_id TEXT, kind TEXT, from_user_id TEXT, to_user_id TEXT, by_user_id TEXT, note TEXT, created_at TEXT)", "CREATE INDEX IF NOT EXISTS os_asset_log_a ON os_asset_log(asset_id, id)"
];
const made = new WeakSet();
export async function adb(env) { const d = await osdb(env); if (!made.has(d)) { for (const q of DDL) await d.prepare(q).run(); made.add(d); } return d; }
export const CATEGORIES = ["camera", "lens", "lighting", "audio", "drone", "laptop", "phone", "storage", "monitor", "furniture", "software_licence", "other"], CONDITIONS = ["new", "good", "fair", "poor"], STATUSES = ["available", "in_use", "repair", "lost", "retired"];
const manage = (P) => P.isOwner || has(P, "equipment", "manage", "department");
const SEL = "a.*, " + nameOf("a.holder_user_id") + " AS holder, (SELECT name FROM biz_equipment e WHERE e.id=a.equipment_id) AS catalogue";
async function nextTag(d) { const n = ((await one(d, "SELECT count(*) n FROM os_assets WHERE org_id=?1", ORG)) || {}).n || 0; for (let k = 1; k < 50; k++) { const t = "FA-" + String(n + k).padStart(4, "0"); if (!(await one(d, "SELECT 1 x FROM os_assets WHERE org_id=?1 AND tag=?2", ORG, t))) return t; } return "FA-" + Date.now().toString(36).toUpperCase(); }

export async function list(env, P, q) {
  const d = await adb(env), mine = !has(P, "equipment", "view", "team"), W = ["a.org_id=?1"], args = [ORG]; if (mine) { args.push(P.user.id); W.push("a.holder_user_id=?2"); }
  if (q && q.status) { args.push(clip(q.status, 12)); W.push("a.status=?" + args.length); } else W.push("a.status<>'retired'"); if (q && q.q) { args.push("%" + clip(q.q, 60) + "%"); W.push("(a.name LIKE ?" + args.length + " OR a.tag LIKE ?" + args.length + " OR a.serial LIKE ?" + args.length + " OR a.location LIKE ?" + args.length + ")"); }
  const rows = await all(d, "SELECT " + SEL + " FROM os_assets a WHERE " + W.join(" AND ") + " ORDER BY a.status='in_use' DESC, a.name LIMIT 500", ...args), t = today(), soon = addDays(t, 30);
  const items = rows.map((a) => Object.assign(a, { maintenance_due_soon: !!(a.maintenance_due && a.maintenance_due <= soon), warranty_ending: !!(a.warranty_until && a.warranty_until >= t && a.warranty_until <= soon) }));
  const tot = { count: items.length, in_use: items.filter((a) => a.status === "in_use").length, repair: items.filter((a) => a.status === "repair").length, value: items.reduce((s, a) => s + (a.cost || 0), 0), maintenance_due: items.filter((a) => a.maintenance_due_soon).length };
  return { items, totals: tot, mine, categories: CATEGORIES, conditions: CONDITIONS, statuses: STATUSES, canManage: manage(P) };
}
export async function get(env, P, id) {
  const d = await adb(env), a = await one(d, "SELECT " + SEL + " FROM os_assets a WHERE a.id=?1 AND a.org_id=?2", clip(id, 40), ORG); if (!a) throw err("Not found.", 404); if (!has(P, "equipment", "view", "team") && a.holder_user_id !== P.user.id) throw err("Not found.", 404);
  const log = await all(d, "SELECT l.kind, l.note, l.created_at, " + nameOf("l.from_user_id") + " AS from_name, " + nameOf("l.to_user_id") + " AS to_name, " + nameOf("l.by_user_id") + " AS by_name FROM os_asset_log l WHERE l.asset_id=?1 ORDER BY l.id DESC LIMIT 100", a.id); return { asset: a, log, canManage: manage(P) };
}
export async function save(env, P, b) {
  if (!manage(P)) throw err("Operations or a department lead manages assets.", 403); const d = await adb(env), now = nowIso(), name = clip(b.name, 120); if (!name) throw err("Name the asset.");
  const notes = clip(b.notes, 1000); if (looksLikeAccountNo(notes)) throw err("Don't keep card or account numbers in asset notes.");
  const o = { name, category: CATEGORIES.indexOf(b.category) > -1 ? b.category : "other", serial: clip(b.serial, 80), equipment_id: clip(b.equipment_id, 40) || null, bought_on: DAY.test(b.bought_on || "") ? b.bought_on : null, cost: int(b.cost, 0, 1e9), vendor: clip(b.vendor, 120), warranty_until: DAY.test(b.warranty_until || "") ? b.warranty_until : null, condition: CONDITIONS.indexOf(b.condition) > -1 ? b.condition : "good", location: clip(b.location, 120), maintenance_due: DAY.test(b.maintenance_due || "") ? b.maintenance_due : null, notes };
  if (o.bought_on && o.bought_on > today()) throw err("The purchase date is in the future."); if (o.equipment_id && !(await one(d, "SELECT 1 x FROM biz_equipment WHERE id=?1", o.equipment_id).catch(() => null))) throw err("Unknown catalogue entry.", 404);
  if (b.id) { const a = await one(d, "SELECT * FROM os_assets WHERE id=?1 AND org_id=?2", clip(b.id, 40), ORG); if (!a) throw err("Not found.", 404); if (a.status === "retired") throw err("A retired asset is closed.", 409);
    await run(d, "UPDATE os_assets SET name=?2, category=?3, serial=?4, equipment_id=?5, bought_on=?6, cost=?7, vendor=?8, warranty_until=?9, condition=?10, location=?11, maintenance_due=?12, notes=?13, updated_at=?14 WHERE id=?1", a.id, o.name, o.category, o.serial, o.equipment_id, o.bought_on, o.cost, o.vendor, o.warranty_until, o.condition, o.location, o.maintenance_due, o.notes, now);
    if (o.condition !== a.condition) await run(d, "INSERT INTO os_asset_log (asset_id, kind, by_user_id, note, created_at) VALUES (?1,'condition',?2,?3,?4)", a.id, P.user.id, a.condition + " → " + o.condition, now); await audit(env, P, "ASSET_EDITED", { kind: "asset", id: a.id }, null, { name }); return { id: a.id, tag: a.tag }; }
  const id = rid("as"), tag = clip(b.tag, 20).toUpperCase() || await nextTag(d); if (await one(d, "SELECT 1 x FROM os_assets WHERE org_id=?1 AND tag=?2", ORG, tag)) throw err("Tag " + tag + " is already used.", 409);
  await run(d, "INSERT INTO os_assets (id, org_id, tag, name, category, serial, equipment_id, bought_on, cost, vendor, warranty_until, condition, location, holder_user_id, status, maintenance_due, notes, created_by, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,NULL,'available',?14,?15,?16,?17,?17)", id, ORG, tag, o.name, o.category, o.serial, o.equipment_id, o.bought_on, o.cost, o.vendor, o.warranty_until, o.condition, o.location, o.maintenance_due, o.notes, P.user.id, now);
  await run(d, "INSERT INTO os_asset_log (asset_id, kind, by_user_id, note, created_at) VALUES (?1,'added',?2,?3,?4)", id, P.user.id, "registered", now); await audit(env, P, "ASSET_ADDED", { kind: "asset", id }, null, { tag, name, cost: o.cost }); return { id, tag };
}
/* hand-over: assign to a member, take back, send for repair, mark lost, retire */
export async function move(env, P, id, b) {
  if (!manage(P)) throw err("Operations or a department lead moves assets.", 403); const d = await adb(env), a = await one(d, "SELECT * FROM os_assets WHERE id=?1 AND org_id=?2", clip(id, 40), ORG); if (!a) throw err("Not found.", 404); if (a.status === "retired") throw err("A retired asset is closed.", 409);
  const act = clip(b.action, 12), note = clip(b.note, 400), now = nowIso(); let to = null, status = a.status;
  if (act === "assign") { to = clip(b.user_id, 40); if (!(await one(d, "SELECT 1 x FROM os_members WHERE user_id=?1 AND org_id=?2 AND status='active'", to, ORG))) throw err("Pick an active team member."); if (a.status === "repair" || a.status === "lost") throw err("Bring it back from " + a.status + " first.", 409); status = "in_use"; }
  else if (act === "return") { if (!a.holder_user_id) throw err("Nobody holds it.", 409); status = "available"; }
  else if (act === "repair") { if (note.length < 3) throw err("Say what is wrong."); status = "repair"; }
  else if (act === "back") { if (a.status !== "repair" && a.status !== "lost") throw err("It is not in repair or lost.", 409); status = a.holder_user_id ? "in_use" : "available"; to = a.holder_user_id; }
  else if (act === "lost") { if (note.length < 3) throw err("Say what happened."); status = "lost"; }
  else if (act === "retire") { if (note.length < 3) throw err("Say why it is retired."); status = "retired"; }
  else throw err("Unknown action.");
  await run(d, "UPDATE os_assets SET holder_user_id=?2, status=?3, retired_reason=CASE WHEN ?3='retired' THEN ?4 ELSE retired_reason END, updated_at=?5 WHERE id=?1", a.id, act === "assign" ? to : act === "return" ? null : act === "back" ? to : a.holder_user_id, status, note, now);
  await run(d, "INSERT INTO os_asset_log (asset_id, kind, from_user_id, to_user_id, by_user_id, note, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)", a.id, act, a.holder_user_id, act === "assign" ? to : null, P.user.id, note, now);
  await audit(env, P, "ASSET_" + act.toUpperCase(), { kind: "asset", id: a.id }, { status: a.status, holder: a.holder_user_id }, { status, holder: act === "assign" ? to : act === "return" ? null : a.holder_user_id }, note);
  if (act === "assign" && to !== P.user.id) notify(env, to, "system", a.tag + " " + a.name + " is now with you." + (note ? " " + note : ""), "/workspace/#assets?id=" + a.id, { category: "system", urgency: "info" }).catch(() => {});
  if (act === "return" && a.holder_user_id && a.holder_user_id !== P.user.id) notify(env, a.holder_user_id, "system", a.tag + " " + a.name + " was taken back.", "/workspace/#assets", { category: "system", urgency: "info" }).catch(() => {});
  await emit(env, P, "asset." + act, { kind: "asset", id: a.id }, { tag: a.tag, status }); return { status, holder_user_id: act === "assign" ? to : act === "return" ? null : a.holder_user_id };
}
/* daily: maintenance due within 7 days and warranties ending within 30 days, to operations and owners */
export async function daily(env) {
  const d = await adb(env), t = today(), to = (await ownerIds(d)).concat((await all(d, "SELECT DISTINCT m.user_id FROM os_members m JOIN os_member_roles mr ON mr.member_id=m.id JOIN os_roles r ON r.id=mr.role_id WHERE r.slug='operations_manager' AND m.org_id=?1 AND m.status='active' AND m.user_id IS NOT NULL", ORG).catch(() => [])).map((x) => x.user_id)).filter((u, i, a) => u && a.indexOf(u) === i); let n = 0;
  for (const a of await all(d, "SELECT id, tag, name, maintenance_due, warranty_until FROM os_assets WHERE org_id=?1 AND status<>'retired' AND ((maintenance_due IS NOT NULL AND maintenance_due<=?2) OR (warranty_until IS NOT NULL AND warranty_until BETWEEN ?3 AND ?4))", ORG, addDays(t, 7), t, addDays(t, 30))) {
    const what = a.maintenance_due && a.maintenance_due <= addDays(t, 7) ? "maintenance due " + a.maintenance_due : "warranty ends " + a.warranty_until; for (const u of to) await notify(env, u, "system", a.tag + " " + a.name + ": " + what, "/workspace/#assets?id=" + a.id, { category: "system", urgency: "info", dedupe: "as-" + a.id + "-" + (a.maintenance_due || "") + (a.warranty_until || "") }).catch(() => {}); n++; }
  return { reminded: n };
}
