/* FODO OWNER BRAIN — storage (D1), audit log, settings, secret redaction.
   Every table is additive (CREATE TABLE IF NOT EXISTS) and lives next to the existing FODO tables in XRAY_DB.
   Nothing here deletes or changes an existing FODO table. */
export const DDL = [
  // long-term memory: facts, decisions, preferences, goals, ideas, notes … (status: active | superseded) — temporal: valid_from / valid_until / superseded_by
  "CREATE TABLE IF NOT EXISTS brain_memory (id TEXT PRIMARY KEY, scope TEXT, type TEXT, title TEXT, content TEXT, source TEXT, source_type TEXT, confidence REAL, importance INTEGER, status TEXT, superseded_by TEXT, valid_from TEXT, valid_until TEXT, project TEXT, tags TEXT, version INTEGER, created_at TEXT, updated_at TEXT, last_accessed_at TEXT, owner TEXT)",
  "CREATE INDEX IF NOT EXISTS brain_memory_s ON brain_memory (status, scope, type, created_at)",
  "CREATE TABLE IF NOT EXISTS brain_memory_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, memory_id TEXT, version INTEGER, title TEXT, content TEXT, status TEXT, changed_at TEXT, changed_by TEXT, note TEXT)",
  "CREATE TABLE IF NOT EXISTS brain_tasks (id TEXT PRIMARY KEY, title TEXT, detail TEXT, status TEXT, priority TEXT, project TEXT, scope TEXT, due TEXT, source TEXT, created_at TEXT, updated_at TEXT, done_at TEXT)",
  "CREATE TABLE IF NOT EXISTS brain_threads (id TEXT PRIMARY KEY, title TEXT, mode TEXT, scope TEXT, project TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS brain_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id TEXT, role TEXT, content TEXT, meta TEXT, created_at TEXT)",
  "CREATE INDEX IF NOT EXISTS brain_messages_t ON brain_messages (thread_id, id)",
  "CREATE TABLE IF NOT EXISTS brain_docs (id TEXT PRIMARY KEY, title TEXT, kind TEXT, hash TEXT, version INTEGER, size INTEGER, summary TEXT, extracted TEXT, scope TEXT, project TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS brain_chunks (id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id TEXT, n INTEGER, heading TEXT, content TEXT)",
  "CREATE INDEX IF NOT EXISTS brain_chunks_d ON brain_chunks (doc_id, n)",
  "CREATE TABLE IF NOT EXISTS brain_actions (id TEXT PRIMARY KEY, token_hash TEXT, tool TEXT, args TEXT, payload_hash TEXT, level INTEGER, preview TEXT, status TEXT, result TEXT, owner TEXT, thread_id TEXT, created_at TEXT, expires_at TEXT, done_at TEXT)",
  "CREATE TABLE IF NOT EXISTS brain_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, t TEXT, owner TEXT, kind TEXT, tool TEXT, intent TEXT, args_hash TEXT, status TEXT, ms INTEGER, model TEXT, detail TEXT)",
  "CREATE INDEX IF NOT EXISTS brain_audit_t ON brain_audit (t)",
  "CREATE TABLE IF NOT EXISTS brain_alerts (id TEXT PRIMARY KEY, akey TEXT UNIQUE, severity TEXT, title TEXT, reason TEXT, evidence TEXT, action TEXT, status TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS brain_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id INTEGER, rating INTEGER, note TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS brain_settings (k TEXT PRIMARY KEY, v TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS brain_briefings (day TEXT PRIMARY KEY, data TEXT, text TEXT, created_at TEXT)",
  // v22: code changes (GitHub pull requests), automations, connectors (Google), event inbox
  "CREATE TABLE IF NOT EXISTS brain_eng_index (k TEXT PRIMARY KEY, sha TEXT, data TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS brain_changes (id TEXT PRIMARY KEY, title TEXT, request TEXT, summary TEXT, edits TEXT, risk TEXT, status TEXT, branch TEXT, pr_number INTEGER, pr_url TEXT, preview_url TEXT, note TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS brain_automations (id TEXT PRIMARY KEY, name TEXT, trigger_type TEXT, trigger_value TEXT, cond TEXT, action TEXT, action_args TEXT, enabled INTEGER, last_run TEXT, next_run TEXT, runs INTEGER DEFAULT 0, last_result TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS brain_connectors (id TEXT PRIMARY KEY, data TEXT, scopes TEXT, account TEXT, connected_at TEXT, last_used TEXT)",
  "CREATE TABLE IF NOT EXISTS brain_events (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, user_id TEXT, detail TEXT, t TEXT, handled INTEGER DEFAULT 0)",
  // v23: people the owners gave Brain access to, social accounts, posts, uploaded media
  "CREATE TABLE IF NOT EXISTS brain_members (email TEXT PRIMARY KEY, role TEXT, perms TEXT, note TEXT, added_by TEXT, added_at TEXT, last_seen TEXT)",
  "CREATE TABLE IF NOT EXISTS brain_social (id TEXT PRIMARY KEY, platform TEXT, ext_id TEXT, name TEXT, handle TEXT, avatar TEXT, token TEXT, refresh TEXT, expires_at TEXT, meta TEXT, connected_by TEXT, connected_at TEXT, status TEXT, last_error TEXT)",
  "CREATE TABLE IF NOT EXISTS brain_social_posts (id TEXT PRIMARY KEY, caption TEXT, captions TEXT, media TEXT, targets TEXT, status TEXT, scheduled_at TEXT, results TEXT, created_by TEXT, created_at TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS brain_media (id TEXT PRIMARY KEY, name TEXT, mime TEXT, size INTEGER, parts INTEGER, store TEXT, width INTEGER, height INTEGER, duration REAL, variant_of TEXT, status TEXT, created_at TEXT, ready_at TEXT)",
];
/* additive column migrations (each may already exist → ignored) */
const MIGRATIONS = ["ALTER TABLE brain_memory ADD COLUMN emb TEXT", "ALTER TABLE brain_chunks ADD COLUMN emb TEXT", "ALTER TABLE brain_tasks ADD COLUMN assignee TEXT", "ALTER TABLE brain_tasks ADD COLUMN kind TEXT", "ALTER TABLE brain_threads ADD COLUMN owner TEXT",
  // v27 Website Engineer
  "ALTER TABLE brain_changes ADD COLUMN plan TEXT", "ALTER TABLE brain_changes ADD COLUMN klass TEXT", "ALTER TABLE brain_changes ADD COLUMN qa TEXT", "ALTER TABLE brain_changes ADD COLUMN qa_status TEXT", "ALTER TABLE brain_changes ADD COLUMN attempts INTEGER", "ALTER TABLE brain_changes ADD COLUMN head_sha TEXT", "ALTER TABLE brain_changes ADD COLUMN merged_sha TEXT", "ALTER TABLE brain_changes ADD COLUMN base_sha TEXT", "ALTER TABLE brain_changes ADD COLUMN approved_by TEXT", "ALTER TABLE brain_changes ADD COLUMN rollback_of TEXT", "ALTER TABLE brain_changes ADD COLUMN kind TEXT"];
const made = new WeakSet();
export async function brainDb(env) {
  const d = env && env.XRAY_DB; if (!d) return null;
  if (!made.has(d)) {
    await d.batch(DDL.map((s) => d.prepare(s)));
    // add only the columns that are missing (no failing ALTERs on every cold start)
    const seen = {}; for (const m of MIGRATIONS) { const x = /ALTER TABLE (\w+) ADD COLUMN (\w+)/.exec(m); try { const cols = seen[x[1]] || (seen[x[1]] = ((await d.prepare("PRAGMA table_info(" + x[1] + ")").all()).results || []).map((c) => c.name)); if (cols.indexOf(x[2]) < 0) { await d.prepare(m).run(); cols.push(x[2]); } } catch (e) {} }
    made.add(d);
  }
  return d;
}
export const nowIso = () => new Date().toISOString();
export const rid = (n) => [...crypto.getRandomValues(new Uint8Array(n || 16))].map((b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
export const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s))))].map((b) => b.toString(16).padStart(2, "0")).join("");
export const clip = (s, n) => { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
export const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").trim().slice(0, n || 4000);
export const istDay = (t) => new Date((t ? Date.parse(t) : Date.now()) + 5.5 * 3600e3).toISOString().slice(0, 10);
export const istTime = (t) => new Date(Date.parse(t) + 5.5 * 3600e3).toISOString().slice(0, 16).replace("T", " ");

/* ---------- secrets never leave the server: redact anything that looks like a key, token or session ---------- */
const SECRET_RE = /\b(gsk_[\w-]{10,}|sk-[\w-]{10,}|AIza[\w-]{20,}|re_[A-Za-z0-9_]{10,}|whsec_[\w+/=]{10,}|xox[abp]-[\w-]{10,}|ghp_[\w]{20,}|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{5,})/g;
const SECRET_KEYS = /^(.*(key|secret|token|password|passwd|authorization|cookie|session|otp|code_hash|token_hash).*)$/i;
export function redact(v, depth) {
  depth = depth || 0;
  if (v == null || depth > 8) return v;
  if (typeof v === "string") return v.replace(SECRET_RE, "[redacted]");
  if (Array.isArray(v)) return v.map((x) => redact(x, depth + 1));
  if (typeof v === "object") { const o = {}; Object.keys(v).forEach((k) => { o[k] = SECRET_KEYS.test(k) && !/^(monthly|pack|free)_?left$/i.test(k) ? "[redacted]" : redact(v[k], depth + 1); }); return o; }
  return v;
}
/* the raw values of the site's secrets — used by tests and as a last check before anything is sent to a model or the browser */
export function secretValues(env) { return Object.keys(env || {}).filter((k) => /KEY|SECRET|TOKEN|PASSWORD/i.test(k) && typeof env[k] === "string" && env[k].length >= 8).map((k) => env[k]); }
export function scrubEnv(env, text) { let t = String(text == null ? "" : text); secretValues(env).forEach((s) => { t = t.split(s).join("[redacted]"); }); return t; }

/* ---------- audit log (no secrets: arguments are stored as a hash) ---------- */
export async function audit(env, o) {
  try {
    const d = await brainDb(env);
    await d.prepare("INSERT INTO brain_audit (t, owner, kind, tool, intent, args_hash, status, ms, model, detail) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)")
      .bind(nowIso(), o.owner || "", o.kind || "", o.tool || "", clip(o.intent || "", 80), o.args ? (await sha(JSON.stringify(o.args))).slice(0, 16) : "", o.status || "ok", o.ms || 0, o.model || "", clip(scrubEnv(env, redact(o.detail || "")), 300)).run();
  } catch (e) {}
}

/* ---------- settings (owner-editable in the Brain) ---------- */
export const SETTING_DEFAULTS = { provider: "auto", memory: "on", tools: "{}", briefing: "on", alerts: "on", retentionDays: "365", voice: "thalia", notifyEmail: "on", wakeWord: "on", theme: "dark", gaProperty: "", liveVoice: "Puck", liveMode: "chat", voiceEngine: "auto", autoDeploy: "off" };
export async function getSettings(env) {
  const out = Object.assign({}, SETTING_DEFAULTS);
  try { const d = await brainDb(env); ((await d.prepare("SELECT k, v FROM brain_settings").all()).results || []).forEach((r) => { if (r.k in out) out[r.k] = r.v; }); } catch (e) {}
  try { out.toolsOff = JSON.parse(out.tools || "{}"); } catch (e) { out.toolsOff = {}; }
  return out;
}
export async function saveSettings(env, patch) {
  const d = await brainDb(env), ok = {};
  const allowed = { autoDeploy: /^(off|low)$/, provider: /^(auto|workers-ai|groq|gemini)$/, memory: /^(on|off)$/, briefing: /^(on|off)$/, alerts: /^(on|off)$/, retentionDays: /^\d{1,4}$/, voice: /^(amalthea|andromeda|apollo|arcas|aries|asteria|athena|atlas|aurora|callista|cora|cordelia|delia|draco|electra|harmonia|helena|hera|hermes|hyperion|iris|janus|juno|jupiter|luna|mars|minerva|neptune|odysseus|ophelia|orion|orpheus|pandora|phoebe|pluto|saturn|thalia|theia|vesta|zeus|stella|perseus|angus|helios|browser)$/, notifyEmail: /^(on|off)$/, wakeWord: /^(on|off)$/, theme: /^(dark|light|auto)$/, gaProperty: /^\d{0,14}$/, liveVoice: /^(Puck|Charon|Kore|Fenrir|Aoede|Leda|Orus|Zephyr|Callirrhoe|Autonoe|Enceladus|Iapetus|Umbriel|Algieba|Despina|Erinome|Algenib|Rasalgethi|Laomedeia|Achernar|Alnilam|Schedar|Gacrux|Pulcherrima|Achird|Zubenelgenubi|Vindemiatrix|Sadachbia|Sadaltager|Sulafat)$/, liveMode: /^(chat|wake)$/, voiceEngine: /^(auto|classic)$/ };
  for (const k of Object.keys(patch || {})) {
    let v = patch[k];
    if (k === "toolsOff") { if (typeof v !== "object" || !v) continue; const o = {}; Object.keys(v).slice(0, 80).forEach((t) => { if (/^[a-z_]{2,40}$/.test(t) && v[t]) o[t] = true; }); v = JSON.stringify(o); await d.prepare("INSERT INTO brain_settings (k, v, updated_at) VALUES ('tools', ?1, ?2) ON CONFLICT(k) DO UPDATE SET v=?1, updated_at=?2").bind(v, nowIso()).run(); ok.tools = true; continue; }
    if (!allowed[k] || !allowed[k].test(String(v))) continue;
    await d.prepare("INSERT INTO brain_settings (k, v, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(k) DO UPDATE SET v=?2, updated_at=?3").bind(k, String(v), nowIso()).run(); ok[k] = true;
  }
  return ok;
}
