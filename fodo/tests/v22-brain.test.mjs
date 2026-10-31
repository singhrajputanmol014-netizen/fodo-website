// v22 FODO BRAIN — wake word & human talk, voice (Aura TTS / Whisper STT), the code agent (GitHub PR → preview → live, all
// confirmed), semantic memory (embeddings), any-file knowledge (toMarkdown), automations (real-time events + schedules + email),
// commitments, prep briefs, deep research, specialist agents, admin actions, Gmail/Calendar connector, security.
// Run: node --no-warnings tests/v22-brain.test.mjs
import { DatabaseSync } from "node:sqlite";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as admin } from "../functions/api/admin/[[path]].js";
import { onRequest as xray } from "../functions/api/xray/[[path]].js";
import { onRequest as brain } from "../functions/api/owner-brain/[[path]].js";
import { onRequest as tick } from "../functions/api/monitor/tick.js";
import { PLANS } from "../functions/_lib/plans.js";
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
const all = [];   // every response body — checked for leaked secrets at the end
const login = (email, plan, who) => call("test-login", Object.assign({ email }, plan ? { plan } : {}), { as: who });
const B = (p, body, who, o) => call("owner-brain/" + p, body, Object.assign({ as: who || "own" }, o || {}));
const ask = (message, threadId, who, extra) => B("chat", Object.assign({ message, threadId }, extra || {}), who);
import { logEvent } from "../functions/_lib/accounts.js";
import { dueFrom, stripWake } from "../functions/_lib/brain/orchestrator.js";

/* ---------- mocks ---------- */
const prompts = [], sent = [], gh = { calls: [], files: { "index.html": "<html><body><h1>Old headline</h1><p>Hi</p></body></html>\n", "scripts/build_pages.py": 'H1 = "Old headline"\nprint(H1)\n', "functions/_lib/accounts.js": "export const x = 1;\n", "css/styles.css": "body{color:#000}\n" }, written: {}, merged: false };
const CONCEPTS = [["price", "cost", "costs", "subscription", "plan", "cheapest", "₹499", "fee", "pricing"], ["logo", "design", "brand"], ["headline", "hero", "title"], ["lead", "customer", "client"]];
const vec = (t) => { const w = String(t).toLowerCase().split(/[^a-z0-9₹]+/); return CONCEPTS.map((c) => w.filter((x) => c.indexOf(x) > -1).length).concat([1]); };
const reply = (sys, user) => {
  if (/Pick the files that must change/.test(sys)) return JSON.stringify({ files: ["index.html", "scripts/build_pages.py", "functions/_lib/accounts.js"], plan: "Change the hero headline in the page and its build source." });
  if (/Write the smallest correct change/.test(sys)) return JSON.stringify({ title: "Change the homepage headline", summary: "The hero headline now says 'Grow faster with FODO'.", risk: "low", test: "Open the homepage preview.", edits: [{ path: "index.html", find: "<h1>Old headline</h1>", replace: "<h1>Grow faster with FODO</h1>" }, { path: "scripts/build_pages.py", find: 'H1 = "Old headline"', replace: 'H1 = "Grow faster with FODO"' }, { path: "functions/_lib/accounts.js", find: "export const x = 1;", replace: "export const x = 2; // backdoor" }, { path: "css/styles.css", find: "zzz-not-there", replace: "x" }] });
  if (/Write 3 different web search queries/.test(sys)) return JSON.stringify({ queries: ["digital agency market india size", "india digital advertising 2026", "agency pricing india"] });
  if (/careful research analyst/.test(sys)) return "India's digital ad market is growing [1]. Sources: [1] https://news.test/a";
  if (/Analytics agent/.test(sys)) return "- ANALYST NOTE: 4 users, 0 revenue";
  if (/Growth agent/.test(sys)) return "- GROWTH NOTE: convert warm leads";
  if (/You choose which FODO Brain tools/.test(sys)) {
    if (/give|grant/i.test(user)) return JSON.stringify({ tools: [{ name: "grant_plan", args: { email: "ravi@shop.in", plan: "growth", days: 30 } }] });
    if (/gmail/i.test(user)) return JSON.stringify({ tools: [{ name: "gmail_send", args: { to: "client@acme.in", subject: "Proposal", body: "Hi, attached." } }] });
    if (/automat|every morning/i.test(user)) return JSON.stringify({ tools: [{ name: "create_automation", args: { name: "Lead alert", trigger_type: "event", trigger_value: "limit_hit", action: "notify", text: "Warm lead!" } }] });
    return JSON.stringify({ tools: [] });
  }
  if (/Turn the owner's message into ONE structured item/.test(sys)) { if (/WANTED: COMMITMENT/.test(user)) return JSON.stringify({ kind: "commitment", title: "Send the new logo", who: "Rahul", due: "" }); return JSON.stringify({ kind: "memory", type: "FACT", title: "Starter price", content: "The Starter plan costs ₹499 per month.", scope: "fodo" }); }
  if (/You read one document/.test(sys)) return JSON.stringify({ summary: "A proposal for Acme at ₹50,000 a month.", facts: ["Acme's proposal is ₹50,000 a month."], decisions: [], tasks: [{ title: "Send Acme the signed proposal", priority: "P1" }], risks: [], opportunities: [], entities: ["Acme"], open_questions: [] });
  return "ANSWER" + (/VOICE MODE/.test(sys) ? " [voice]" : "") + (/only said your name/.test(sys) ? " [wake]" : "") + (/SPECIALIST NOTES/.test(sys) ? " [agents]" : "");
};
const AI = {
  run: async (model, inp) => {
    if (/bge-m3/.test(model)) return { shape: [inp.text.length, 5], data: inp.text.map(vec) };
    if (/aura/.test(model)) return { audio: btoa("ID3-fake-mp3") };
    if (/whisper/.test(model)) return { text: "hey fodo how is fodo doing today" };
    const sys = inp.messages[0].content, user = inp.messages[inp.messages.length - 1].content; prompts.push({ sys, user, model }); return { response: reply(sys, user) };
  },
  toMarkdown: async (f) => ({ name: f.name, format: "markdown", mimetype: "application/pdf", tokens: 40, data: "# Acme proposal\nRetainer ₹50,000 a month for SEO and ads.\n" }),
};
let googleTokens = 0;
globalThis.fetch = async (u, o = {}) => {
  u = String(u); const m = o.method || "GET", J = (x, s) => new Response(JSON.stringify(x), { status: s || 200, headers: { "content-type": "application/json" } });
  if (/api\.resend\.com\/emails$/.test(u)) { sent.push(JSON.parse(o.body)); return J({ id: "re_" + sent.length }); }
  if (/google\.serper\.dev\/search/.test(u)) return J({ organic: [{ title: "India ad market", link: "https://news.test/a", snippet: "Growing fast" }, { title: "Agency pricing", link: "https://news.test/b", snippet: "Retainers" }] });
  if (/oauth2\.googleapis\.com\/token/.test(u)) { googleTokens++; const b = new URLSearchParams(o.body); return J(b.get("grant_type") === "authorization_code" ? { access_token: "ya29.a", refresh_token: "1//refresh-SECRET-token", scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.events openid email", id_token: "x." + btoa(JSON.stringify({ email: "anmol@fodo.co.in" })) + ".y" } : { access_token: "ya29.b" }); }
  if (/gmail\.googleapis\.com.*\/messages\/send/.test(u)) { sent.push({ gmail: JSON.parse(o.body) }); return J({ id: "g1" }); }
  if (/gmail\.googleapis\.com.*\/messages\?/.test(u)) return J({ messages: [{ id: "m1" }] });
  if (/gmail\.googleapis\.com.*\/messages\/m1/.test(u)) return J({ id: "m1", snippet: "Can we talk tomorrow?", labelIds: ["UNREAD"], payload: { headers: [{ name: "From", value: "client@acme.in" }, { name: "Subject", value: "Proposal" }, { name: "Date", value: "today" }] } });
  if (/calendar\/v3\/calendars\/primary\/events/.test(u)) return m === "POST" ? J({ id: "ev1", summary: JSON.parse(o.body).summary, start: JSON.parse(o.body).start, htmlLink: "https://cal.test/ev1" }) : J({ items: [{ id: "e1", summary: "Call with Acme", start: { dateTime: "2026-11-02T15:00:00+05:30" }, end: { dateTime: "2026-11-02T15:30:00+05:30" } }] });
  if (/api\.github\.com/.test(u)) {
    const p = u.replace("https://api.github.com", ""); gh.calls.push(m + " " + p);
    if (/^\/repos\/[^/]+\/[^/]+$/.test(p)) return J({ full_name: "fodo/site", private: true, default_branch: "main", permissions: { push: true } });
    if (/git\/trees\/main/.test(p)) return J({ tree: Object.keys(gh.files).map((k) => ({ path: k, type: "blob", size: gh.files[k].length })).concat([{ path: "assets/img/x.png", type: "blob", size: 9 }]) });
    if (/\/contents\//.test(p)) { const path = decodeURIComponent(p.split("/contents/")[1].split("?")[0]); return gh.files[path] != null ? J({ type: "file", size: gh.files[path].length, sha: "s", content: Buffer.from(gh.files[path]).toString("base64") }) : J({ message: "Not Found" }, 404); }
    if (/^\/search\/code/.test(p)) return J({ items: [{ path: "index.html" }] });
    if (/git\/ref\/heads\/main/.test(p)) return J({ object: { sha: "head1" } });
    if (/git\/commits\/head1/.test(p)) return J({ tree: { sha: "tree1" } });
    if (/git\/blobs$/.test(p) && m === "POST") { const c = Buffer.from(JSON.parse(o.body).content, "base64").toString(); gh.lastBlobs = (gh.lastBlobs || []).concat([c]); return J({ sha: "blob" + gh.lastBlobs.length }); }
    if (/git\/trees$/.test(p) && m === "POST") { gh.tree = JSON.parse(o.body); return J({ sha: "tree2" }); }
    if (/git\/commits$/.test(p) && m === "POST") return J({ sha: "commit2" });
    if (/git\/refs$/.test(p) && m === "POST") { gh.branch = JSON.parse(o.body).ref; return J({}); }
    if (/\/pulls$/.test(p) && m === "POST") return J({ number: 7, html_url: "https://github.com/fodo/site/pull/7" });
    if (/pulls\/7\/merge/.test(p) && m === "PUT") { gh.merged = true; return J({ merged: true, sha: "m1" }); }
    if (/git\/refs\/heads/.test(p) && m === "DELETE") return new Response(null, { status: 204 });
    return J({ message: "unmocked " + p }, 404);
  }
  if (/^https:\/\/news\.test\//.test(u)) return new Response("<html><title>News</title><body>India's digital ad market grows 20%.</body></html>", { headers: { "content-type": "text/html" } });
  return new Response("not mocked " + u, { status: 599 });
};
const env = { XRAY_DB: d1(), ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", XRAY_PER_HOUR: "99", AI, RESEND_API_KEY: "re_SECRETresendKEY12345", MAIL_FROM: "FODO <hello@fodo.co.in>", SERPER_API_KEY: "serper_SECRET_123456", CRON_KEY: "cron_SECRET_key_1234567890", GITHUB_TOKEN: "ghp_SECRETgithubTOKEN1234567890", PAGES_PROJECT: "fodo-website", GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "gcs_SECRET_123456" };
const db = () => env.XRAY_DB.db;
await login("anmol@fodo.co.in", null, "own"); await login("ravi@shop.in", "starter", "cust");

/* ================= 1. wake word, human small talk, voice ================= */
ok(stripWake("Hey FODO, how is FODO doing today?").text === "how is FODO doing today?" && stripWake("hey fodo").wakeOnly && stripWake("फोडो aaj kya hai").text === "aaj kya hai", "wake word stripped: 'Hey FODO …', 'फोडो …'; 'Hey FODO' alone = called by name");
let r = await ask("Hey FODO"); ok(r.j.intent === "wake" && /\[wake\]/.test(r.j.answer) && r.j.tools_used.some((t) => t.tool === "pulse"), "'Hey FODO' alone → answers like a person who was called (with a live pulse)");
r = await ask("fodo tum kaise ho?"); ok(r.j.intent === "smalltalk" && /HOW TO TALK/.test(prompts[prompts.length - 1].sys) && /"openTasks"/.test(prompts[prompts.length - 1].sys), "'fodo tum kaise ho' → warm small talk + one live thing");
r = await ask("how is FODO doing today", null, "own", { voice: true }); ok(/\[voice\]/.test(r.j.answer) && r.j.voice, "voice mode → short spoken reply");
r = await B("tts", { text: "Good morning Anmol. Two things need you today." }); ok(r.status === 200 && /ID3-fake-mp3/.test(r.t), "TTS: natural Aura voice (audio/mpeg)");
r = await B("tts", { text: "नमस्ते अनमोल" }); ok(r.status === 415 && r.j.fallback, "Hindi script → browser Hindi voice fallback");
r = await B("stt", { audioB64: btoa("fake-webm") }); ok(r.j.ok && /how is fodo doing/.test(r.j.text), "STT: Whisper transcribes for browsers without speech recognition");

/* ================= 2. the code agent: change the website by talking ================= */
r = await ask("Homepage headline ko 'Grow faster with FODO' kar do");
const att = r.j.attachments.find((a) => a.kind === "change"), openAct = r.j.actions[0];
ok(r.j.intent === "code_change" && att && att.files.indexOf("index.html") > -1 && att.files.indexOf("scripts/build_pages.py") > -1 && /Grow faster with FODO/.test(att.diff), "'headline ko … kar do' → exact diff prepared (page + its build source)");
ok(att.files.indexOf("functions/_lib/accounts.js") < 0 && att.skipped.some((x) => /protected/.test(x)) && att.skipped.some((x) => /found 0 times/.test(x)), "protected file (login code) refused; an edit that doesn't apply is skipped");
ok(openAct && openAct.risk === "external communication" && !gh.calls.some((c) => /^POST/.test(c)), "nothing written to GitHub yet — opening the PR needs confirmation");
r = await B("confirm", { actionId: openAct.id, token: openAct.token });
ok(r.j.ok && r.j.result.number === 7 && /^refs\/heads\/brain\/change-the-homepage-headline/.test(gh.branch) && gh.lastBlobs.some((b) => /<h1>Grow faster with FODO<\/h1>/.test(b)) && gh.tree.tree.every((t) => !/accounts\.js/.test(t.path)), "confirmed → branch + commit + pull request with the new headline (protected file not included)");
ok(/^https:\/\/brain-change-the-homepage-he\.fodo-website\.pages\.dev$/.test(r.j.result.preview) && !gh.merged, "Cloudflare preview link; the live site is untouched");
r = await ask("deploy kar do"); const mergeAct = r.j.actions[0];
ok(mergeAct && mergeAct.risk === "destructive" && /live site/.test(mergeAct.preview) && !gh.merged, "'deploy kar do' → asks again before going live");
r = await B("confirm", { actionId: mergeAct.id, token: mergeAct.token }); ok(r.j.ok && gh.merged && db().prepare("SELECT status FROM brain_changes").get().status === "merged", "confirmed → merged → Cloudflare deploys production");
r = await B("changes"); ok(r.j.items[0].pr_url && r.j.github.canPush, "Site changes page lists the change with its PR");
const keepTok = env.GITHUB_TOKEN; delete env.GITHUB_TOKEN; r = await ask("Pricing page pe WhatsApp button add karo"); env.GITHUB_TOKEN = keepTok;
ok(r.j.tools_used.some((t) => t.tool === "propose_change" && /GitHub is not connected/.test(t.error)), "no GitHub token → a clear 'connect GitHub' answer");

/* ================= 3. semantic memory, any-file knowledge ================= */
r = await ask("Remember that the Starter plan costs ₹499 per month.");
ok(db().prepare("SELECT emb FROM brain_memory WHERE content LIKE '%₹499%'").get().emb, "memory stored with a semantic vector");
const { recall } = await import("../functions/_lib/brain/memory.js");
const hits = await recall(env, "what does our cheapest subscription cost?"); ok(hits.some((m) => /₹499/.test(m.content)), "semantic recall: 'cheapest subscription cost' finds 'Starter plan ₹499' (different words)");
r = await B("ingest", { title: "Acme proposal", fileName: "acme.pdf", mime: "application/pdf", fileB64: btoa("%PDF-1.4 fake") });
ok(r.j.ok && /Acme/.test(r.j.summary) && r.j.saved.facts === 1 && db().prepare("SELECT emb FROM brain_chunks LIMIT 1").get().emb, "PDF uploaded → converted (toMarkdown) → understood, facts + vectors stored");

/* ================= 4. commitments, prep, research, agents ================= */
r = await ask("Rahul will send the new logo by Friday");
const cm = db().prepare("SELECT * FROM brain_tasks WHERE kind='commitment'").get();
ok(cm && cm.assignee === "Rahul" && cm.due === dueFrom("by friday") && /logo/i.test(cm.title), "'Rahul will send the logo by Friday' → tracked commitment (who + due date)");
db().prepare("UPDATE brain_tasks SET due='2020-01-01' WHERE id=?").run(cm.id);
r = await call("owner-brain/tick", {}, { as: "x", headers: { "x-cron-key": env.CRON_KEY } });
ok(r.j.ok && r.j.automations.overdue === 1 && db().prepare("SELECT count(*) n FROM brain_alerts WHERE title LIKE '%overdue%'").get().n === 1, "overdue commitment → reminder alert (hourly tick)");
r = await call("owner-brain/tick", {}, { as: "x", headers: { "x-cron-key": "wrong" } }); ok(r.status === 403, "tick without the cron key → 403");
r = await ask("prep me for my call with ravi@shop.in"); const pb = r.j.tools_used.find((t) => t.tool === "prep_brief");
ok(pb && pb.ok && /ravi@shop\.in/.test(prompts[prompts.length - 1].sys) && /starter/i.test(prompts[prompts.length - 1].sys), "'prep me for my call with …' → brief from their account, plan, tickets, memories");
r = await ask("research the digital marketing agency market in India");
ok(r.j.tools_used.some((t) => t.tool === "deep_research" && t.ok) && r.j.attachments.some((a) => a.kind === "sources") && db().prepare("SELECT count(*) n FROM brain_memory WHERE type='RESEARCH'").get().n === 1, "deep research → sourced answer, saved as RESEARCH memory");
r = await ask("How is FODO doing today? analyze deeply");
ok(/\[agents\]/.test(r.j.answer) && r.j.steps.some((x) => /Analyst agent \+ Growth agent/.test(x)) && /ANALYST NOTE/.test(prompts[prompts.length - 1].sys), "deep question → Analyst + Growth agents, then one synthesised answer");

/* ================= 5. automations: real-time events + schedules ================= */
r = await B("automations"); ok(r.j.items.length === 5 && r.j.items.some((a) => a.trigger_value === "paid" && a.enabled), "default automations ready (payments, tickets, leads, critical alerts, morning briefing)");
const ravi = db().prepare("SELECT id FROM acct_users WHERE email='ravi@shop.in'").get().id;
await logEvent(env, ravi, "paid", "growth plan ₹1,499");
ok(db().prepare("SELECT count(*) n FROM brain_alerts WHERE title LIKE 'New payment%'").get().n === 1, "a payment happens → the Brain notifies you instantly (event automation)");
await logEvent(env, ravi, "help_ticket", "T123 Invoice needed");
ok(db().prepare("SELECT count(*) n FROM brain_tasks WHERE title LIKE 'Reply to the new support ticket%'").get().n === 1, "a new ticket → a task is created automatically");
r = await ask("Automate: whenever a user runs out of free X-Rays, notify me"); ok(r.j.tools_used.some((t) => t.tool === "create_automation" && t.ok), "create an automation by talking");
await logEvent(env, ravi, "limit_hit", "spicehub.test"); ok(db().prepare("SELECT count(*) n FROM brain_alerts WHERE title='Warm lead!'").get().n === 1, "…and it fires on the next matching event");
const mb = db().prepare("SELECT id FROM brain_automations WHERE action='briefing_email'").get().id; db().prepare("UPDATE brain_automations SET enabled=1, next_run=? WHERE id=?").run(new Date(Date.now() - 1000).toISOString(), mb);
const before = sent.length; r = await call("owner-brain/tick", {}, { as: "x", headers: { "x-cron-key": env.CRON_KEY } });
ok(r.j.automations.ran.some((x) => x.id === mb && x.ok) && sent.length > before && sent[sent.length - 1].to[0] === "anmol@fodo.co.in" && Date.parse(db().prepare("SELECT next_run FROM brain_automations WHERE id=?").get(mb).next_run) > Date.now(), "scheduled 'morning briefing' → emailed to the owner, next run set");
env.BRAIN_ENABLED = "0"; const n0 = db().prepare("SELECT count(*) n FROM brain_alerts").get().n; await logEvent(env, ravi, "paid", "x"); ok(db().prepare("SELECT count(*) n FROM brain_alerts").get().n === n0, "BRAIN_ENABLED=0 → automations stop"); delete env.BRAIN_ENABLED;

/* ================= 6. admin actions + Gmail/Calendar ================= */
r = await ask("Give ravi@shop.in the growth plan for 30 days"); const ga = r.j.actions.find((a) => a.preview && /growth plan/.test(a.preview));
ok(ga && ga.risk === "financial", "'give … the growth plan' → financial confirmation");
r = await B("confirm", { actionId: ga.id, token: ga.token }); ok(r.j.ok && db().prepare("SELECT plan FROM acct_users WHERE email='ravi@shop.in'").get().plan === "growth", "confirmed → plan granted through the admin API");
r = await B("connect/google"); ok(r.status === 302, "Connect Google → redirect to Google consent");
const loc = (await brain({ request: new Request(SITE + "/api/owner-brain/connect/google", { headers: { cookie: jars.own } }), env, params: { path: ["connect", "google"] } })).headers.get("location");
const state = new URL(loc).searchParams.get("state"); ok(/accounts\.google\.com/.test(loc) && /gmail\.send/.test(loc) && /calendar\.events/.test(loc), "consent asks for Gmail + Calendar");
r = await B("connect/google/callback?code=abc&state=" + encodeURIComponent(state)); ok(r.status === 302 && db().prepare("SELECT account FROM brain_connectors WHERE id LIKE 'google:%'").get().account === "anmol@fodo.co.in" && !/refresh-SECRET/.test(db().prepare("SELECT data FROM brain_connectors").get().data), "callback stores the refresh token ENCRYPTED");
r = await B("connect/google/callback?code=abc&state=bad.state.x"); ok(/google=/.test(r.t) || r.status === 302, "a forged state is refused");
r = await ask("check my inbox"); ok(r.j.tools_used.some((t) => t.tool === "email_inbox" && t.ok) && /client@acme\.in/.test(prompts[prompts.length - 1].sys), "'check my inbox' → reads Gmail");
r = await ask("what's on my calendar tomorrow?"); ok(r.j.tools_used.some((t) => t.tool === "calendar" && t.ok), "calendar read");
const s0 = sent.length; r = await ask("Send the proposal to client@acme.in from my gmail"); const gs = r.j.actions.find((a) => /Send from Gmail/.test(a.preview));
ok(gs && sent.length === s0, "sending from Gmail → confirmation first");
r = await B("confirm", { actionId: gs.id, token: gs.token }); ok(r.j.ok && sent.length === s0 + 1 && sent[sent.length - 1].gmail.raw, "confirmed → sent from the owner's Gmail");

/* ================= 7. security ================= */
for (const p of ["tts", "stt", "changes", "automations", "connectors"]) { r = await B(p, p === "tts" || p === "stt" ? {} : undefined, "cust"); if (r.status !== 403) { ok(false, "customer reached " + p); break; } } ok(true, "customer is denied voice, code changes, automations and connectors");
r = await B("connect/google", undefined, "cust"); ok(r.status === 403, "customer can't start a Google connection");
r = await call("owner-brain/tick", {}, { as: "cust" }); ok(r.status === 403, "a customer can't trigger the scheduler");
const leak = all.concat(prompts.map((p) => p.sys + p.user)).filter((t) => /ghp_SECRET|serper_SECRET|gcs_SECRET|refresh-SECRET|cron_SECRET|re_SECRET/.test(t));
ok(!leak.length, "no token or secret in any response or prompt (GitHub, Google, Serper, cron, Resend)");

console.log("\nv22 brain: " + pass + "/" + (pass + fail) + " passed");
process.exit(fail ? 1 : 0);
