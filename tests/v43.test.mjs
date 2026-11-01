// v43: private Workspace files (project files, deliverables with versions, personal files) on R2 or KV.
// Run: node --no-warnings tests/v43.test.mjs
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as admin } from "../functions/api/admin/[[path]].js";
import { onRequest as xray } from "../functions/api/xray/[[path]].js";
import { onRequest as brain } from "../functions/api/owner-brain/[[path]].js";
import { onRequest as bizApi } from "../functions/api/biz/[[path]].js";
import { fundMilestone } from "../functions/_lib/biz.js";
import { sniff, typeOf, cleanName, LIMITS } from "../functions/_lib/files.js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
console.log = ((orig) => (...a) => { if (typeof a[0] === "string" && a[0].charAt(0) === "{" && !process.env.DBG) return; orig(...a); })(console.log);
console.error = () => {};
function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, a = []) => ({ bind: (...x) => st(sql, x.map((v) => v === undefined ? null : v)), run: async () => { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }), _x: () => db.prepare(sql).run(...a) });
  return { db, prepare: (s) => st(s), batch: async (l) => l.map((s) => (s._x(), { success: true })) };
}
const SITE = "https://www.fodo.co.in", jars = {}, H = { account, admin, xray, "owner-brain": brain };
const call = async (path, body, o = {}) => {
  const who = o.as || "a", h = Object.keys(H).filter((k) => path.indexOf(k + "/") === 0)[0] || "account", p = h === "account" ? path : path.slice(h.length + 1);
  const method = o.method || (body !== undefined ? "POST" : "GET");
  const req = new Request(SITE + "/api/" + h + "/" + p, { method, headers: Object.assign({ origin: SITE, "cf-connecting-ip": "9.9.9.9" }, body !== undefined ? { "content-type": "application/json" } : {}, jars[who] ? { cookie: jars[who] } : {}, o.headers || {}), body: body === undefined ? undefined : JSON.stringify(body) });
  const r = await H[h]({ request: req, env, params: { path: p.split("?")[0].split("/") } }); const sc = r.headers.get("set-cookie"); if (sc && h === "account") jars[who] = sc.split(";")[0];
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} all.push(t); return { status: r.status, j, t };
};
const all = [];
const login = (email, plan, who) => call("test-login", Object.assign({ email }, plan ? { plan } : {}), { as: who });
globalThis.fetch = async () => new Response("x", { status: 599 });
const KV = new Map(), CHAT_KV = { get: async (k, o) => { const v = KV.has(k) ? KV.get(k) : null; if (v && o && o.type === "arrayBuffer") return v instanceof Uint8Array ? v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) : v; return v; }, put: async (k, v) => { KV.set(k, v instanceof ArrayBuffer ? new Uint8Array(v) : v); }, getWithMetadata: async (k) => ({ value: KV.get(k) || null, metadata: null }), delete: async (k) => KV.delete(k), list: async () => ({ keys: [] }) };
const R2 = new Map(), FILES = { put: async (k, v) => { R2.set(k, new Uint8Array(v instanceof ArrayBuffer ? v : v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength))); }, delete: async (k) => R2.delete(k),
  get: async (k, o) => { const v = R2.get(k); if (!v) return null; const s = o && o.range ? v.subarray(o.range.offset, o.range.offset + o.range.length) : v; return { body: new Blob([s]).stream(), size: v.length }; } };
const env = { XRAY_DB: d1(), CHAT_KV, ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", MAIL_FROM: "FODO <hello@fodo.co.in>" };
H.biz = bizApi;
const Z = (p, body, who, o) => call("biz/" + p, body, Object.assign({ as: who || "c" }, o || {}));
/* raw upload, like the browser does it */
const up = async (who, qs, bytes, o = {}) => { const req = new Request(SITE + "/api/biz/files/upload?" + qs, { method: "POST", body: bytes, headers: Object.assign({ origin: SITE, "x-fodo-upload": "1", "content-type": "application/octet-stream", "cf-connecting-ip": "9.9.9.9" }, jars[who] ? { cookie: jars[who] } : {}, o.headers || {}) });
  const r = await bizApi({ request: req, env, params: { path: ["files", "upload"] } }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} all.push(t); return { status: r.status, j }; };
const dl = async (who, id, o = {}) => { const req = new Request(SITE + "/api/biz/files/" + id + "/download" + (o.inline ? "?inline=1" : ""), { method: o.method || "GET", headers: Object.assign({ origin: SITE }, jars[who] ? { cookie: jars[who] } : {}, o.headers || {}) });
  const r = await bizApi({ request: req, env, params: { path: ["files", id, "download"] } }); return { status: r.status, h: r.headers, bytes: new Uint8Array(await r.arrayBuffer()) }; };
const enc = (s) => new TextEncoder().encode(s), cat = (...a) => { const n = a.reduce((x, y) => x + y.length, 0), o = new Uint8Array(n); let i = 0; a.forEach((x) => { o.set(x, i); i += x.length; }); return o; };
const PNG = cat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), enc("fake-png-body-1234567890")), PDF = enc("%PDF-1.7\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"), MP4 = cat(new Uint8Array([0, 0, 0, 0x18]), enc("ftypmp42"), new Uint8Array(4000).fill(7));
const ZIP = cat(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), enc("word/document.xml....")), TXT = enc("Shot list\n1. Exterior\n2. Kitchen\n"), HTML = enc("<html><script>alert(document.cookie)</script></html>"), SVG = enc('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'), EXE = cat(enc("MZ"), new Uint8Array([0, 0x90, 0, 3, 0, 0]));

/* ---------- 0. type detection from the bytes (never the name) ---------- */
ok(sniff(PNG) === "png" && sniff(PDF) === "pdf" && sniff(MP4) === "iso" && sniff(ZIP) === "zip" && sniff(TXT) === "text", "bytes decide the type: PNG, PDF, MP4, ZIP/Office, text");
ok(sniff(HTML) === null && sniff(SVG) === null && sniff(EXE) === null && sniff(enc("javascript:alert(1)")) === null, "HTML, SVG, scripts and executables are refused");
ok(typeOf("evil.png", PDF).ext === "pdf" && typeOf("photo.jpg", PNG).ext === "png" && typeOf("brief.docx", ZIP).ext === "docx" && typeOf("clip.mov", MP4).ext === "mov", "a wrong extension can't change the real type");
ok(typeOf("page.html", HTML) === null && typeOf("x.png", HTML) === null, "an HTML file renamed to .png is still refused");
ok(cleanName('../../etc/"pass<wd>".png', "png") === "_etc_ pass_wd_.png".replace(" ", "") || /^[^\\/:*?"<>|]+\.png$/.test(cleanName('../../etc/"pass<wd>".png', "png")), "file names are cleaned (no paths or special characters)");

await login("anmol@fodo.co.in", null, "own"); await login("client@biz.in", null, "c"); await login("pro@studio.in", null, "p"); await login("other@biz.in", null, "o"); await login("mod@fodo.co.in", null, "m");
/* a project between client c and professional p */
await Z("admin/staff", { email: "mod@fodo.co.in", role: "moderator" }, "own");
let r = await Z("admin/invites", { note: "x", maxUses: 1 }, "own"); const inv = r.j.token;
await Z("pro", { invite: inv, name: "Aarav Films", role: "Cinematographer", skills: "food, reels", tools: "FX3", years: 7, city: "Delhi", onsite: true, langs: "Hindi", bio: "Cinematographer for restaurants and cafes in Delhi NCR. Short-form reels and brand films.", days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], rateDay: 18000, terms: true }, "p");
await Z("pro/packages", { name: "Reels", price: 15000, days: 7 }, "p"); await Z("pro/portfolio", { kind: "video", title: "Film", url: "https://vimeo.com/1" }, "p"); await Z("pro/submit", {}, "p");
const proId = (await Z("pro", undefined, "p")).j.pro.id; await Z("admin/pros/" + proId, { action: "approve" }, "m");
r = await Z("projects", { proId, title: "Cafe reels", brief: "Five reels for the cafe launch" }, "c"); const pid = r.j.project.id;
await Z("projects/" + pid + "/propose", { milestones: [{ title: "Shoot", amount: 9000 }, { title: "Edit", amount: 6000 }] }, "p"); await Z("projects/" + pid + "/accept", {}, "c");
const ms = (await Z("projects/" + pid, undefined, "c")).j.project.milestones;

for (const mode of ["kv", "r2"]) {
  if (mode === "r2") env.FILES = FILES; const T = (m) => "[" + mode + "] " + m;
  /* ---------- 1. storage info ---------- */
  r = await Z("files/storage", undefined, "c"); ok(r.j.ok && r.j.storage.store === mode && r.j.storage.maxFile === LIMITS[mode].file && r.j.storage.used >= 0, T("storage: mode, per-file limit and usage"));
  /* ---------- 2. upload rules ---------- */
  r = await up("nobody", "name=a.png", PNG); ok(r.status === 401, T("no upload without login"));
  r = await up("c", "name=a.png", PNG, { headers: { "x-fodo-upload": "" } }); ok(r.status === 403, T("upload needs the custom header (blocks cross-site forms)"));
  r = await up("c", "name=a.png", PNG, { headers: { origin: "https://evil.test" } }); ok(r.status === 403, T("cross-site upload refused"));
  r = await up("c", "name=x.html", HTML); ok(r.status === 415, T("HTML refused"));
  r = await up("c", "name=logo.svg", SVG); ok(r.status === 415, T("SVG refused"));
  r = await up("c", "name=empty.txt", new Uint8Array(0)); ok(r.status === 400, T("empty file refused"));
  r = await up("c", "name=big.bin", new Uint8Array(LIMITS[mode].file + 1), { headers: { "content-length": String(LIMITS[mode].file + 1) } }); ok(r.status === 413, T("too big refused before reading"));
  /* ---------- 3. personal files ---------- */
  r = await up("c", "name=" + encodeURIComponent("Brand logo.png"), PNG); const f1 = r.j.file; ok(r.j.ok && f1.name === "Brand logo.png" && f1.type === "Image" && f1.mine && !("store" in f1) && !/biz-files/.test(JSON.stringify(r.j)), T("personal upload: no storage key or bucket in the answer"));
  let d = await dl("c", f1.id); ok(d.status === 200 && d.bytes.length === PNG.length && d.bytes.every((x, i) => x === PNG[i]), T("owner downloads the exact bytes"));
  ok(d.h.get("x-content-type-options") === "nosniff" && /sandbox/.test(d.h.get("content-security-policy")) && /no-store/.test(d.h.get("cache-control")) && /^attachment/.test(d.h.get("content-disposition")) && d.h.get("content-type") === "image/png", T("safe headers: nosniff, sandbox CSP, no-store, attachment"));
  d = await dl("c", f1.id, { inline: true }); ok(/^inline/.test(d.h.get("content-disposition")), T("images can open inline"));
  d = await dl("o", f1.id); ok(d.status === 404, T("another user can't download it (404, not even 'forbidden')"));
  d = await dl("own", f1.id); ok(d.status === 404, T("not even a FODO owner can open someone's personal file"));
  d = await dl("nobody", f1.id); ok(d.status === 401, T("no download without login"));
  r = await Z("files", undefined, "o"); ok(r.j.files.length === 0, T("other users don't see it in their list"));
  r = await Z("files/" + f1.id, undefined, "o", { method: "DELETE" }); ok(r.status === 404, T("other users can't delete it"));
  /* text is always a download */
  r = await up("c", "name=shotlist.txt", TXT); d = await dl("c", r.j.file.id, { inline: true }); ok(/^attachment/.test(d.h.get("content-disposition")) && /text\/plain/.test(d.h.get("content-type")), T("text never opens inline"));
  /* ---------- 4. project files ---------- */
  r = await up("o", "project=" + pid + "&name=x.png", PNG); ok(r.status === 404, T("an outsider can't upload to a project"));
  r = await up("c", "project=" + pid + "&name=" + encodeURIComponent("Menu.pdf"), PDF); const pf = r.j.file; ok(r.j.ok && pf.projectId === pid && pf.kind === "file", T("client uploads a brief file to the project"));
  r = await Z("notes", undefined, "p"); ok(r.j.items.some((n) => /New file: Menu\.pdf/.test(n.text)), T("the professional is notified"));
  d = await dl("p", pf.id); ok(d.status === 200 && d.bytes.length === PDF.length, T("the project's professional can download it"));
  d = await dl("p", pf.id, { inline: true }); ok(/^inline/.test(d.h.get("content-disposition")) && !/sandbox/.test(d.h.get("content-security-policy")), T("PDF opens inline (viewer, no sandbox block)"));
  d = await dl("m", pf.id); ok(d.status === 200, T("FODO moderator can read project files (support / disputes)"));
  d = await dl("o", pf.id); ok(d.status === 404, T("outsiders can't"));
  r = await up("m", "project=" + pid + "&name=x.png", PNG); ok(r.status === 403, T("staff can read but not add project files"));
  r = await up("c", "project=" + pid + "&kind=deliverable&name=x.png", PNG); ok(r.status === 403, T("only the professional uploads deliverables"));
  r = await Z("files?project=" + pid, undefined, "p"); ok(r.j.ok && r.j.files.some((f) => f.id === pf.id && f.who === "client") && r.j.canUpload, T("project file list shows who uploaded"));
  r = await Z("files/" + pf.id, undefined, "p", { method: "DELETE" }); ok(r.status === 403, T("the professional can't delete the client's file"));
  /* ---------- 5. deliverables, versions, review ---------- */
  const m1 = ms[mode === "kv" ? 0 : 1]; await fundMilestone(env, m1.id, "order_test_" + mode);
  r = await up("p", "project=" + pid + "&milestone=" + m1.id + "&kind=deliverable&name=reel-1.mp4", MP4); const v1 = r.j.file; ok(r.j.ok && v1.kind === "deliverable" && v1.type === "Video" && v1.ver === 1, T("professional uploads a deliverable video"));
  r = await up("c", "project=" + pid + "&replaces=" + v1.id + "&name=reel-1.mp4", MP4); ok(r.status === 403, T("only the uploader adds a new version"));
  r = await up("p", "project=" + pid + "&replaces=" + v1.id + "&name=reel-1-final.mp4", MP4); const v2 = r.j.file; ok(r.j.ok && v2.ver === 2 && v2.grp === v1.grp && v2.milestoneId === m1.id, T("new version keeps the group and milestone (v2)"));
  if (mode === "r2") { d = await dl("c", v2.id, { headers: { range: "bytes=0-99" } }); ok(d.status === 206 && d.bytes.length === 100 && d.h.get("content-range") === "bytes 0-99/" + MP4.length, T("video seeking: Range requests")); }
  if (mode === "kv") {
    r = await Z("projects/" + pid + "/submit", { milestoneId: m1.id, note: "First cut", files: [v2.id, pf.id] }, "p"); const pr = r.j.project;
    ok(r.j.ok && pr.files.filter((f) => f.milestone_id === m1.id).length === 2 && !pr.files.some((f) => f.id === pf.id && f.milestone_id), T("submit links the professional's own files only (not the client's)"));
    r = await Z("files/" + v2.id, undefined, "p", { method: "DELETE" }); ok(r.status === 409 && /under review/.test(r.j.reason), T("files under review can't be deleted"));
    await Z("projects/" + pid + "/approve", { milestoneId: m1.id }, "c");
    r = await Z("files/" + v1.id, undefined, "p", { method: "DELETE" }); ok(r.status === 409 && /approved work/.test(r.j.reason), T("files of approved work are kept as evidence"));
    r = await up("p", "project=" + pid + "&milestone=" + m1.id + "&kind=deliverable&name=late.mp4", MP4); ok(r.status === 409, T("no new deliverables on an approved milestone"));
  }
  /* ---------- 6. delete + audit ---------- */
  r = await Z("files/" + f1.id, undefined, "c", { method: "DELETE" }); d = await dl("c", f1.id); ok(r.j.ok && d.status === 404 && ![...(mode === "r2" ? R2 : KV).keys()].some((k) => k.indexOf(f1.id) > -1), T("owner deletes: row gone from lists, bytes removed from storage"));
}
/* quota */
const big = new Uint8Array(9 * 1048576); big.set(PNG); delete env.FILES; let full = false; for (let i = 0; i < 14 && !full; i++) { r = await up("o", "name=b" + i + ".png", big); if (r.status === 413) full = /storage is full/.test(r.j.reason); }
ok(full, "per-person storage quota (KV: 100 MB) is enforced");
/* audit + disputes */
const audit = env.XRAY_DB.db.prepare("SELECT action FROM biz_audit WHERE action LIKE 'file:%'").all().map((x) => x.action);
ok(audit.indexOf("file:upload") > -1 && audit.indexOf("file:delete") > -1 && audit.indexOf("file:staff-download") > -1, "uploads, deletes and staff downloads are audited");
r = await Z("projects/" + pid + "/dispute", { reason: "The edit is missing two reels" }, "c"); const keep = (await Z("files?project=" + pid, undefined, "c")).j.files.find((f) => f.mine);
r = await Z("files/" + keep.id, undefined, "c", { method: "DELETE" }); ok(r.status === 409 && /evidence/.test(r.j.reason), "during a dispute nobody but an admin deletes project files");
r = await Z("files/" + keep.id, undefined, "own", { method: "DELETE" }); ok(r.j.ok, "a FODO admin can remove a file (e.g. abuse), audited");
/* nothing leaks */
ok(!all.some((t) => /biz-files\/|sha256|re_SECRET|owner_id/.test(t)), "no storage keys, full hashes or internal ids in any answer");
/* UI wiring */
const WS = fs.readFileSync(new URL("../js/workspace.js", import.meta.url), "utf8"); ok(/x-fodo-upload/.test(WS) && /VIEWS\.files/.test(WS) && /filesBox\(\$\("#pj-files"\)/.test(WS) && /Submit for review/.test(WS) && /earlier version/.test(WS), "workspace: Files page, project Files box, deliverable submit, versions");
ok(/binding = "FILES"/.test(fs.readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8")), "wrangler.toml explains the private R2 bucket");
console.log("\nv43: " + pass + " passed, " + fail + " failed"); if (fail) process.exit(1);
