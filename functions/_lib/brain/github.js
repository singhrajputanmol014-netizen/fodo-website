/* FODO OWNER BRAIN — code agent: change the website / admin / add features by talking.
   Safe path to production (never a live edit):
     1. propose  — the Brain reads the relevant files from GitHub, the AI writes exact find→replace edits, every edit is checked to
                   apply cleanly; nothing is written yet (preview shown to the owner).
     2. open PR  — (owner confirms) a new branch + one commit + a pull request. Cloudflare Pages builds a PREVIEW of that branch.
     3. merge    — (owner confirms again, destructive level) squash-merge into main → Cloudflare deploys production.
   Protected paths (auth, the Brain itself, CI, headers/routes) can never be changed this way.
   Secrets: GITHUB_TOKEN (fine-grained, this repo only: Contents read/write + Pull requests read/write). Optional: GITHUB_REPO,
   GITHUB_BRANCH (default main), PAGES_PROJECT (the Cloudflare Pages project name, for preview links). */
import { brainDb, nowIso, rid, clip, clean, audit } from "./store.js";
import { brainAI, parseJson } from "./models.js";

export const ghOn = (env) => !!(env && env.GITHUB_TOKEN);
export const repo = (env) => String(env.GITHUB_REPO || "singhrajputanmol014-netizen/fodo-website").replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
export const base = (env) => env.GITHUB_BRANCH || "main";
/* v27 path classes — HARD: never from the Brain (the QA gate itself, deploy config, secrets). GUARDED: the Brain's own code, auth,
   payments, headers/routes — only with the typed phrase CONFIRM PRODUCTION CHANGE and passed QA. Everything else is NORMAL. */
export const HARD = [/^\.github\//, /^wrangler\.toml$/, /^runner\/wrangler\.toml$/, /(^|\/)\.env/, /\.(pem|key)$/, /(^|\/)\.git\//];
export const GUARDED = [/^functions\/_lib\/accounts\.js$/, /^functions\/_lib\/brain\//, /^functions\/api\/owner-brain\//, /^functions\/api\/account\//, /^_headers$/, /^_routes\.json$/, /^runner\//];
export const PROTECTED = HARD.concat(GUARDED);   // v22 behaviour (chat's propose_change): neither class
export const pathClass = (p) => HARD.some((re) => re.test(p)) ? "hard" : GUARDED.some((re) => re.test(p)) ? "guarded" : "normal";
export const PHRASE = "CONFIRM PRODUCTION CHANGE";
const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|svg|woff2?|ttf|otf|mp4|webm|mp3|wav|pdf|zip|gz)$/i;
const SKIP = /^(node_modules|\.wrangler|assets\/img|data\/xray-sample|tests\/xray-fixtures)\//;

export async function gh(env, path, opt) {
  opt = opt || {};
  const r = await fetch("https://api.github.com" + path, { method: opt.method || "GET", headers: { authorization: "Bearer " + env.GITHUB_TOKEN, accept: opt.textMatch ? "application/vnd.github.text-match+json" : "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "FODO-Brain", "content-type": "application/json" }, body: opt.body ? JSON.stringify(opt.body) : undefined, signal: AbortSignal.timeout(20000) });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
  if (!r.ok) throw Object.assign(new Error("GitHub " + r.status + ": " + clip((j && j.message) || t, 160)), { status: r.status });
  return j;
}
export const b64utf8 = (s) => { const u = new TextEncoder().encode(s); let b = ""; for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(b); };
export const unb64utf8 = (s) => { const b = atob(String(s).replace(/\n/g, "")), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new TextDecoder().decode(u); };

let treeCache = null;
export async function tree(env, fresh) {
  if (!fresh && treeCache && treeCache.repo === repo(env) && Date.now() - treeCache.at < 300e3) return treeCache.paths;
  const j = await gh(env, "/repos/" + repo(env) + "/git/trees/" + encodeURIComponent(base(env)) + "?recursive=1");
  const paths = (j.tree || []).filter((x) => x.type === "blob" && !BINARY.test(x.path) && !SKIP.test(x.path)).map((x) => ({ path: x.path, size: x.size }));
  treeCache = { repo: repo(env), at: Date.now(), paths }; return paths;
}
export async function readFile(env, path, ref) {
  const j = await gh(env, "/repos/" + repo(env) + "/contents/" + path.split("/").map(encodeURIComponent).join("/") + "?ref=" + encodeURIComponent(ref || base(env)));
  if (!j || j.type !== "file") throw new Error("Not a file: " + path);
  if (j.size > 900000) throw new Error(path + " is too large to edit here.");
  return { path, sha: j.sha, text: j.content ? unb64utf8(j.content) : "" };
}
/* "where is X handled?" — GitHub code search, then a path match fallback */
export async function searchCode(env, q) {
  const out = [];
  try { const j = await gh(env, "/search/code?per_page=12&q=" + encodeURIComponent(clean(q, 120) + " repo:" + repo(env))); (j.items || []).forEach((x) => out.push({ path: x.path, why: "content match" })); } catch (e) {}
  const w = String(q || "").toLowerCase().split(/[^a-z0-9_-]+/).filter((x) => x.length > 2);
  (await tree(env)).filter((f) => w.some((x) => f.path.toLowerCase().indexOf(x) > -1)).slice(0, 12).forEach((f) => { if (!out.some((o) => o.path === f.path)) out.push({ path: f.path, why: "path match" }); });
  return out.slice(0, 15);
}
/* snippets around the words of the request, with line numbers — keeps prompts small for big files */
export function snippets(text, request, max) {
  const lines = text.split("\n"); if (text.length <= (max || 14000)) return { full: true, text };
  const w = String(request || "").toLowerCase().split(/[^a-z0-9ऀ-ॿ_-]+/).filter((x) => x.length > 3);
  const hit = new Set(); lines.forEach((l, i) => { const L = l.toLowerCase(); if (w.some((x) => L.indexOf(x) > -1)) for (let k = Math.max(0, i - 6); k <= Math.min(lines.length - 1, i + 6); k++) hit.add(k); });
  const idx = [...hit].sort((a, b) => a - b).slice(0, 220); let out = "", last = -2;
  idx.forEach((i) => { if (i !== last + 1) out += "\n…\n"; out += (i + 1) + ": " + clip(lines[i], 600) + "\n"; last = i; });
  return { full: false, text: clip(out || lines.slice(0, 120).map((l, i) => (i + 1) + ": " + clip(l, 400)).join("\n"), max || 14000) };
}
export const SITE_NOTES = "FODO website repo notes: static site on Cloudflare Pages. Public pages (*/index.html) are GENERATED by scripts/build_pages.py — when you change page text/markup, change BOTH the generated index.html AND the matching source in scripts/build_pages.py so the next build keeps it. Shared styles: css/styles.css, css/theme-glass.css, css/studio.css; admin UI: js/admin.js + css/admin.css; server code: functions/api/** and functions/_lib/** (Cloudflare Pages Functions, ES modules). Keep the existing code style. Never add secrets, keys or tracking without being asked.";

/* step 1: plan + edits (nothing is written) */
export async function proposeChange(ctx, request, history) {
  const env = ctx.env; if (!ghOn(env)) throw new Error("GitHub is not connected — add GITHUB_TOKEN in Cloudflare (see Brain → Connectors).");
  const files = await tree(env), list = files.filter((f) => !PROTECTED.some((re) => re.test(f.path))).map((f) => f.path);
  const hits = await searchCode(env, request).catch(() => []);
  const pick = await brainAI(env, { kind: "deep", json: true, purpose: "code-plan", provider: ctx.settings && ctx.settings.provider, max: 500, messages: [
    { role: "system", content: SITE_NOTES + "\nPick the files that must change for the owner's request. Reply JSON only: {\"files\":[\"path\",…max 4],\"plan\":\"one sentence\"}. Use only paths from FILES." },
    { role: "user", content: "REQUEST: " + request + (history ? "\nCONTEXT: " + clip(history, 1200) : "") + "\nLIKELY (search hits): " + hits.map((h) => h.path).join(", ") + "\nFILES:\n" + list.slice(0, 900).join("\n") }] });
  const pj = parseJson(pick.text) || {}, chosen = (pj.files || []).filter((p) => list.indexOf(p) > -1).slice(0, 4);
  if (!chosen.length) throw new Error("I couldn't work out which files to change — say which page or part of the admin you mean.");
  const docs = await Promise.all(chosen.map((p) => readFile(env, p)));
  const ctxText = docs.map((f) => { const s = snippets(f.text, request + " " + (pj.plan || "")); return "=== FILE " + f.path + (s.full ? " (full)" : " (relevant lines; line numbers are NOT part of the file)") + " ===\n" + s.text; }).join("\n\n");
  const gen = await brainAI(env, { kind: "deep", json: true, purpose: "code-edit", provider: ctx.settings && ctx.settings.provider, max: 3500, messages: [
    { role: "system", content: SITE_NOTES + "\nWrite the smallest correct change. Reply JSON only:\n{\"title\":\"PR title, max 70 chars\",\"summary\":\"what changes and why, 2-4 sentences, plain words\",\"risk\":\"low|medium|high\",\"edits\":[{\"path\":\"…\",\"find\":\"EXACT text copied from the file (no line numbers), unique in the file, include enough context\",\"replace\":\"new text\"}],\"newFiles\":[{\"path\":\"…\",\"content\":\"…\"}],\"test\":\"how the owner can check it on the preview\"}\nRules: 'find' must match the file byte-for-byte; never touch protected files; no placeholder code; keep features working." },
    { role: "user", content: "REQUEST: " + request + "\nPLAN: " + (pj.plan || "") + "\n\n" + ctxText }] });
  const g = parseJson(gen.text); if (!g || (!(g.edits || []).length && !(g.newFiles || []).length)) throw new Error("The AI could not produce a clean change for that. Try describing it more exactly.");
  // validate: every edit applies exactly once; protected paths refused
  const byPath = {}; docs.forEach((f) => { byPath[f.path] = f.text; });
  const problems = [], applied = {};
  for (const e of (g.edits || []).slice(0, 20)) {
    const p = String(e.path || ""); if (PROTECTED.some((re) => re.test(p))) { problems.push(p + " is protected"); continue; }
    if (byPath[p] == null) { try { byPath[p] = (await readFile(env, p)).text; } catch (x) { problems.push("can't read " + p); continue; } }
    const cur = applied[p] != null ? applied[p] : byPath[p], f = String(e.find || ""), n = f ? cur.split(f).length - 1 : 0;
    if (n !== 1) { problems.push(p + ": the text to replace was found " + n + " times"); continue; }
    applied[p] = cur.replace(f, () => String(e.replace == null ? "" : e.replace));
  }
  for (const nf of (g.newFiles || []).slice(0, 5)) { const p = String(nf.path || ""); if (!p || PROTECTED.some((re) => re.test(p)) || /\.\.|^\//.test(p)) { problems.push("can't create " + p); continue; } if (files.some((f) => f.path === p)) { problems.push(p + " already exists"); continue; } applied[p] = String(nf.content || ""); }
  if (!Object.keys(applied).length) throw new Error("The change didn't apply cleanly: " + problems.join("; "));
  const d = await brainDb(env), id = "ch_" + rid(10), now = nowIso();
  const edits = Object.keys(applied).map((p) => ({ path: p, before: byPath[p] == null ? null : byPath[p], after: applied[p] }));
  const diff = (g.edits || []).filter((e) => applied[e.path] != null).map((e) => "── " + e.path + "\n- " + clip(String(e.find), 500).replace(/\n/g, "\n- ") + "\n+ " + clip(String(e.replace), 500).replace(/\n/g, "\n+ ")).concat((g.newFiles || []).filter((x) => applied[x.path] != null).map((x) => "── new file " + x.path + " (" + String(x.content).length + " chars)")).join("\n\n");
  await d.prepare("INSERT INTO brain_changes (id, title, request, summary, edits, risk, status, note, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,'proposed',?7,?8,?8)")
    .bind(id, clip(clean(g.title || request, 90), 90), clip(request, 1000), clip(clean(g.summary, 1200), 1200), JSON.stringify(edits.map((e) => ({ path: e.path, after: e.after, isNew: e.before == null }))), Object.keys(applied).some((p) => /^functions\//.test(p)) ? "high" : /^(low|medium|high)$/.test(g.risk) ? g.risk : "medium", clip((Object.keys(applied).some((p) => /^functions\//.test(p)) ? "Server code — review the diff carefully before merging. " : "") + (problems.length ? "Skipped: " + problems.join("; ") + ". " : "") + (g.test ? "Check: " + g.test : ""), 600), now).run();
  await audit(env, { owner: ctx.owner.email, kind: "code", tool: "propose_change", status: "ok", detail: id + " · " + Object.keys(applied).join(", ") });
  return { changeId: id, title: clip(g.title || request, 90), summary: g.summary || "", risk: Object.keys(applied).some((p) => /^functions\//.test(p)) ? "high" : g.risk || "medium", files: Object.keys(applied), diff: clip(diff, 6000), skipped: problems, test: g.test || "" };
}
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "change";
export function previewUrl(env, branch) { return env.PAGES_PROJECT ? "https://" + branch.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28).replace(/-$/, "") + "." + env.PAGES_PROJECT + ".pages.dev" : null; }

/* step 2: branch + commit + PR (owner-confirmed) */
export async function openPr(ctx, changeId) {
  const env = ctx.env, d = await brainDb(env), c = await d.prepare("SELECT * FROM brain_changes WHERE id=?1").bind(changeId).first();
  if (!c) throw new Error("Change not found."); if (c.status !== "proposed") return { already: true, status: c.status, pr: c.pr_url, preview: c.preview_url };
  const R = repo(env), B = base(env), edits = JSON.parse(c.edits || "[]");
  if (edits.some((e) => pathClass(e.path) === "hard")) throw new Error("A protected file is in this change — refused.");
  if (edits.some((e) => pathClass(e.path) === "guarded") && c.klass !== "guarded") throw new Error("This change touches FODO's core (Brain, login, payments) — prepare it from Engineer with the confirmation phrase.");
  const ref = await gh(env, "/repos/" + R + "/git/ref/heads/" + encodeURIComponent(B)), headSha = ref.object.sha;
  const commit = await gh(env, "/repos/" + R + "/git/commits/" + headSha);
  const treeItems = []; for (const e of edits) { if (e.delete) { treeItems.push({ path: e.path, mode: "100644", type: "blob", sha: null }); continue; }   // rollback of a file the change created
    const blob = await gh(env, "/repos/" + R + "/git/blobs", { method: "POST", body: { content: b64utf8(e.after), encoding: "base64" } }); treeItems.push({ path: e.path, mode: "100644", type: "blob", sha: blob.sha }); }
  const t = await gh(env, "/repos/" + R + "/git/trees", { method: "POST", body: { base_tree: commit.tree.sha, tree: treeItems } });
  const nc = await gh(env, "/repos/" + R + "/git/commits", { method: "POST", body: { message: c.title + "\n\n" + c.summary + "\n\nRequested by the owner via FODO Brain (" + c.id + ").", tree: t.sha, parents: [headSha] } });
  const branch = "brain/" + slug(c.title) + "-" + c.id.slice(3, 8);
  await gh(env, "/repos/" + R + "/git/refs", { method: "POST", body: { ref: "refs/heads/" + branch, sha: nc.sha } });
  const pr = await gh(env, "/repos/" + R + "/pulls", { method: "POST", body: { title: c.title, head: branch, base: B, body: c.summary + "\n\n**Request:** " + c.request + "\n\n**Risk:** " + c.risk + (c.note ? "\n\n" + c.note : "") + "\n\nCreated by FODO Brain after the owner confirmed. GitHub Actions (FODO Engineer → qa) tests the Cloudflare preview; deploy from FODO Brain → Engineer." + (function () { try { const r = (JSON.parse(c.plan || "{}").routes || []).filter((x) => /^\/[\w\-\/.]*$/.test(x)); return r.length ? "\n\n<!-- fodo-routes: " + r.join(",") + " -->" : ""; } catch (e) { return ""; } })() } });
  const preview = previewUrl(env, branch);
  await d.prepare("UPDATE brain_changes SET status='pr_open', branch=?2, pr_number=?3, pr_url=?4, preview_url=?5, updated_at=?6, head_sha=?7, base_sha=?8, qa_status='waiting' WHERE id=?1").bind(c.id, branch, pr.number, pr.html_url, preview, nowIso(), nc.sha, headSha).run();
  return { opened: true, changeId: c.id, pr: pr.html_url, number: pr.number, branch, preview: preview || "Cloudflare posts the preview link on the pull request in ~1–2 minutes." };
}
/* step 3: merge → production (owner-confirmed, destructive level) */
export async function mergePr(ctx, changeId) {
  const env = ctx.env, d = await brainDb(env), c = await d.prepare("SELECT * FROM brain_changes WHERE id=?1").bind(changeId).first();
  if (!c || !c.pr_number) throw new Error("No open pull request for that change."); if (c.status === "merged") return { already: true, pr: c.pr_url };
  if (c.qa_status === "failed") throw new Error("QA failed on the preview — not deployed. Open the change in Engineer to see why (or let it repair).");
  if (c.qa_status === "waiting" && c.kind && c.kind !== "rollback") throw new Error("QA is still running on the preview (or repairing it) — deploy when it has passed.");
  if (c.klass === "guarded" && c.qa_status !== "passed") throw new Error("This is a core change (Brain, login or payments): it can only go live after QA has passed on the preview.");
  const m = await gh(env, "/repos/" + repo(env) + "/pulls/" + c.pr_number + "/merge", { method: "PUT", body: { merge_method: "squash", commit_title: c.title + " (#" + c.pr_number + ")" } });
  try { await gh(env, "/repos/" + repo(env) + "/git/refs/heads/" + c.branch.split("/").map(encodeURIComponent).join("/"), { method: "DELETE" }); } catch (e) {}
  await d.prepare("UPDATE brain_changes SET status='merged', updated_at=?2, merged_sha=?3, approved_by=?4 WHERE id=?1").bind(c.id, nowIso(), m.sha || null, (ctx.owner && ctx.owner.email) || null).run();
  if (c.rollback_of) await d.prepare("UPDATE brain_changes SET status='rolled_back', updated_at=?2 WHERE id=?1").bind(c.rollback_of, nowIso()).run();
  return { merged: !!m.merged, sha: m.sha, pr: c.pr_url, note: "Merged into " + base(env) + " — Cloudflare deploys it to www.fodo.co.in in ~1–2 minutes." };
}
export async function closePr(ctx, changeId) {
  const env = ctx.env, d = await brainDb(env), c = await d.prepare("SELECT * FROM brain_changes WHERE id=?1").bind(changeId).first(); if (!c) throw new Error("Change not found.");
  if (c.pr_number) { try { await gh(env, "/repos/" + repo(env) + "/pulls/" + c.pr_number, { method: "PATCH", body: { state: "closed" } }); await gh(env, "/repos/" + repo(env) + "/git/refs/heads/" + c.branch.split("/").map(encodeURIComponent).join("/"), { method: "DELETE" }); } catch (e) {} }
  await d.prepare("UPDATE brain_changes SET status='discarded', updated_at=?2 WHERE id=?1").bind(c.id, nowIso()).run(); return { discarded: true, id: c.id };
}
export async function listChanges(env) { const d = await brainDb(env); return ((await d.prepare("SELECT id, title, request, summary, risk, status, branch, pr_number, pr_url, preview_url, note, created_at, updated_at FROM brain_changes ORDER BY created_at DESC LIMIT 100").all()).results || []); }
export async function ghStatus(env) { if (!ghOn(env)) return { connected: false }; try { const j = await gh(env, "/repos/" + repo(env)); return { connected: true, repo: j.full_name, private: j.private, defaultBranch: j.default_branch, canPush: !!(j.permissions && j.permissions.push) }; } catch (e) { return { connected: false, error: e.message }; } }

/* v27: one more commit on a Brain branch (automatic QA repairs) — never on main */
export async function commitToBranch(env, branch, files, message) {
  if (!/^brain\//.test(branch)) throw new Error("Only Brain branches can be changed this way.");
  if (files.some((f) => pathClass(f.path) !== "normal")) throw new Error("Repairs never touch protected files.");
  const R = repo(env), ref = await gh(env, "/repos/" + R + "/git/ref/heads/" + branch.split("/").map(encodeURIComponent).join("/")), head = ref.object.sha, commit = await gh(env, "/repos/" + R + "/git/commits/" + head);
  const items = []; for (const f of files) { const blob = await gh(env, "/repos/" + R + "/git/blobs", { method: "POST", body: { content: b64utf8(f.content), encoding: "base64" } }); items.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha }); }
  const t = await gh(env, "/repos/" + R + "/git/trees", { method: "POST", body: { base_tree: commit.tree.sha, tree: items } });
  const nc = await gh(env, "/repos/" + R + "/git/commits", { method: "POST", body: { message, tree: t.sha, parents: [head] } });
  await gh(env, "/repos/" + R + "/git/refs/heads/" + branch.split("/").map(encodeURIComponent).join("/"), { method: "PATCH", body: { sha: nc.sha } });
  return nc.sha;
}
export async function headOf(env) { const r = await gh(env, "/repos/" + repo(env) + "/git/ref/heads/" + encodeURIComponent(base(env))); return r.object.sha; }
export async function recentCommits(env, n) { const j = await gh(env, "/repos/" + repo(env) + "/commits?per_page=" + (n || 5) + "&sha=" + encodeURIComponent(base(env))); return (j || []).map((c) => ({ sha: c.sha, message: String(c.commit.message).split("\n")[0], date: c.commit.author && c.commit.author.date, author: c.commit.author && c.commit.author.name })); }
export async function commitFiles(env, sha) { const j = await gh(env, "/repos/" + repo(env) + "/commits/" + sha); return { parent: (j.parents || [])[0] && j.parents[0].sha, files: (j.files || []).map((f) => ({ path: f.filename, status: f.status, previous: f.previous_filename || null })) }; }
export async function dispatch(env, workflow, inputs) { await gh(env, "/repos/" + repo(env) + "/actions/workflows/" + encodeURIComponent(workflow) + "/dispatches", { method: "POST", body: { ref: base(env), inputs } }); return true; }
