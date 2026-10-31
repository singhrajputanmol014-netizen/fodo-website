// v30 FODO Brain: voice/chat Business X-Ray of any website (runs in the Brain page, result spoken), web search with the free
// Gemini key (Google Search grounding), spoken domain/X-Ray normalisation, chat history delete. Run: node --no-warnings tests/v30-brain-xray.test.mjs
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
const ask = (message, threadId, who) => B("chat", { message, threadId }, who);

/* ---------- mocks: the AI answers according to which Brain prompt it receives ---------- */
const prompts = [], sent = [], gem = []; let gemDown = false; let aiDown = false, groqCalls = 0;
const reply = (sys, user) => {
  if (/You choose which FODO Brain tools/.test(sys)) {
    if (/email/i.test(user)) return JSON.stringify({ tools: [{ name: "send_email", args: { to: "lead@client.in", subject: "Your X-Ray", body: "Hi — your X-Ray is ready." } }] });
    if (/price/i.test(user)) return JSON.stringify({ tools: [{ name: "change_price", args: { kind: "plan", id: "starter", price: 649 } }] });
    if (/malformed/i.test(user)) return "sure! here you go {tools: [oops";
    if (/delete the user|block/i.test(user)) return JSON.stringify({ tools: [{ name: "block_user", args: { email: "ravi@shop.in", blocked: true } }] });
    if (/run_sql|drop table/i.test(user)) return JSON.stringify({ tools: [{ name: "run_sql", args: { sql: "DROP TABLE acct_users" } }] });
    return JSON.stringify({ tools: [] });
  }
  if (/Turn the owner's message into ONE structured item/.test(sys)) {
    if (/WANTED: TASK/.test(user)) return JSON.stringify({ kind: "task", title: "Add testimonials near the homepage CTAs", detail: "From the latest X-Ray: no testimonials found.", priority: "P0", project: "Website" });
    const m = /OWNER MESSAGE:\n([\s\S]*)$/.exec(user)[1];
    return JSON.stringify({ kind: "memory", type: /idea/i.test(m) ? "IDEA" : "DECISION", title: /D2C/.test(m) ? "Focus this quarter: D2C brands" : "Focus this quarter: agency clients", content: m.replace(/^remember that /i, ""), scope: "fodo" });
  }
  if (/You read one document/.test(sys)) return JSON.stringify({ summary: "FODO's 2027 pricing plan: Starter stays at ₹499, an annual plan is proposed.", facts: ["Starter stays at ₹499 a month in 2027."], decisions: ["Launch an annual plan with 2 months free."], tasks: [{ title: "Design the annual plan page", priority: "P1" }], risks: ["Annual discount may reduce monthly revenue."], opportunities: ["Agencies prefer yearly billing."], entities: ["FODO"], open_questions: ["When to launch?"] });
  return "ANSWER: grounded in the data above.";
};
const AI = { run: async (model, inp) => { if (aiDown) throw new Error("4006: you have used up your daily free allocation of 10,000 neurons"); const sys = inp.messages[0].content, user = inp.messages[inp.messages.length - 1].content; prompts.push({ sys, user, model }); return { response: reply(sys, user) }; } };
globalThis.fetch = async (u, o = {}) => {
  u = String(u);
  if (/api\.groq\.com/.test(u)) { groqCalls++; const b = JSON.parse(o.body), sys = b.messages[0].content; prompts.push({ sys, user: b.messages[b.messages.length - 1].content, model: "groq" }); return new Response(JSON.stringify({ choices: [{ message: { content: reply(sys, b.messages[b.messages.length - 1].content) } }] })); }
  if (/generativelanguage\.googleapis\.com\/v1beta\/models\/.*:generateContent/.test(u)) { gem.push({ u, key: o.headers["x-goog-api-key"], body: JSON.parse(o.body) }); if (gemDown) return new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Top SEO agencies in Delhi include Agency A and Agency B (2026 lists)." }] }, groundingMetadata: { groundingChunks: [{ web: { uri: "https://example.com/list", title: "Best SEO agencies Delhi" } }, { web: { uri: "https://news.example.in/a", title: "Agency rankings" } }] } }] })); }
  if (/api\.resend\.com\/emails$/.test(u)) { sent.push(JSON.parse(o.body)); return new Response(JSON.stringify({ id: "re_" + sent.length })); }
  return new Response("not mocked " + u, { status: 599 });
};
const env = { XRAY_DB: d1(), ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", XRAY_PER_HOUR: "99", AI, GROQ_API_KEY: "gsk_SECRETgroqKEY123456", RESEND_API_KEY: "re_SECRETresendKEY12345", MAIL_FROM: "FODO <hello@fodo.co.in>", SUPPORT_EMAIL: "support@fodo.co.in", CRON_KEY: "cron_SECRET_key_1234567890", GEMINI_API_KEY: "AIza_SECRET_gemini_KEY_123" };
const db = () => env.XRAY_DB.db;

/* ---------- seed real data: users, a paid customer, two X-Rays of the same site ---------- */
await login("anmol@fodo.co.in", null, "own");
await login("ravi@shop.in", "growth", "cust");
await login("viewer@fodo.co.in", null, "view");
await login("admin2@fodo.co.in", null, "adm");
await call("admin/viewers", { email: "viewer@fodo.co.in", role: "viewer" }, { as: "own" });
await call("admin/viewers", { email: "admin2@fodo.co.in", role: "admin" }, { as: "own" });
const save = async (score, opps) => { const r = await call("xray/start", { url: "spicehub.test" }, { as: "own" }), job = r.j.jobId;
  await xray({ request: new Request(SITE + "/api/xray/report", { method: "POST", headers: { "content-type": "application/json", "x-job": job, cookie: jars.own }, body: JSON.stringify({ jobId: job, input: { url: "https://spicehub.test/" }, createdAt: new Date().toISOString(), scores: { overall: score, areas: { website: { name: "Website", score: score + 10 } } }, opportunities: opps, top: { immediate: opps.map((o) => o.id) }, competitors: [{ name: "Curry House" }], crawl: { blocked: null, pages: 3 }, completeness: { overall: 80, parts: [] } }) }), env, params: { path: ["report"] } });
  db().prepare("UPDATE acct_runs SET created_at=? WHERE job_id=?").run(new Date(Date.now() - (score === 55 ? 864e5 : 0)).toISOString(), job); return job; };
await save(55, [{ id: "O1", title: "No testimonials or reviews on the site", recommendation: "Add 3–6 named testimonials.", priority: "P0", evidence: ["E1"] }, { id: "O2", title: "Slow mobile pages", recommendation: "Compress images.", priority: "P1", evidence: ["E2"] }]);
const job2 = await save(64, [{ id: "O1", title: "No testimonials or reviews on the site", recommendation: "Add 3–6 named testimonials.", priority: "P0", evidence: ["E1"] }, { id: "O3", title: "Headline doesn't say who it's for", recommendation: "Name the audience in the hero.", priority: "P0", evidence: ["E3"] }]);


import { route, spoken } from "../functions/_lib/brain/orchestrator.js";
import { instructions } from "../functions/_lib/brain/live.js";

/* routing: spoken requests */
const R = (m) => route(m, {});
ok(R("fodo.co.in ka xray karke do").calls[0].name === "start_xray" && R("fodo.co.in ka xray karke do").calls[0].args.website === "fodo.co.in", "'fodo.co.in ka xray karke do' → start X-Ray of fodo.co.in (wake word 'fodo' not stripped from the domain)");
ok(R("FODO dot co dot in ka X ray karke batao").calls[0].args.website.toLowerCase() === "fodo.co.in", "voice transcript 'fodo dot co dot in' + 'X ray' understood");
ok(R("fodo.co.in website ka x-ray bana do").intent === "start_xray", "'website ka x-ray bana do' is an X-Ray, not a website code change");
ok(R("एक्स रे करो zomato.com ka").calls[0].args.website === "zomato.com", "Hindi 'एक्स रे' understood");
ok(R("fodo.co.in ka latest x-ray dikhao").intent === "latest_xray", "'latest x-ray dikhao' → reads the saved report");
ok(R("Email lead@client.in that their X-Ray is ready.").intent !== "start_xray", "an email about an X-Ray is not an X-Ray run");
ok(R("zomato.com website check karo").calls.some((c) => c.name === "read_webpage" && c.args.url === "zomato.com"), "'<site> check karo' → reads that website");
ok(R("google pe search karo best seo agency delhi").calls.some((c) => c.name === "web_search"), "'google pe search karo' → web search");
ok(R("delhi me best dentist dhoondo").calls.some((c) => c.name === "web_search"), "'dhoondo' → web search");
ok(spoken("Analyze my latest X-Ray.") === "Analyze my latest X-Ray.", "normal text left unchanged");
ok(/X-Ray of ANY website/.test(instructions({}, { name: "Anmol" })) && /\[X-RAY RESULT\]/.test(instructions({}, {})), "live voice instructions: X-Ray / websites / web search go to FODO Brain; results are read aloud");

/* start_xray from chat: runs inside the Brain page (no background runner) */
let r = await ask("fodo.co.in ka xray karke do");
ok(r.j.ok && r.j.intent === "start_xray" && r.j.ui.some((u) => u.action === "xray" && /fodo\.co\.in/.test(u.value) && u.domain === "fodo.co.in"), "chat: X-Ray handed to the Brain page (ui action 'xray')");
ok(/X-Ray shuru/.test(r.j.answer) && /2–4 minute/.test(r.j.answer), "honest Hinglish answer: started, takes 2–4 minutes, result comes here");
r = await B("chat", { message: "Run an X-Ray of example.com", voice: true });
ok(/Starting the X-Ray of \*\*example\.com\*\*/.test(r.j.answer) && /out loud/.test(r.j.answer), "English + voice wording");
r = await ask("x-ray karo localhost:8080"); ok(!(r.j.ui || []).some((u) => u.action === "xray"), "private/odd addresses never start an X-Ray");
r = await ask("spicehub.test ka latest x-ray result batao — score, sabse weak areas aur top 3 fixes");
ok(r.j.tools_used.some((t) => t.tool === "latest_xray" && t.ok), "result summary reads the real saved report (latest_xray)");

/* web search without Serper/Brave → Gemini Google Search grounding (free key) */
r = await ask("google pe search karo best seo agency delhi");
const ws = r.j.tools_used.find((t) => t.tool === "web_search");
ok(ws && ws.ok && gem.length === 1 && gem[0].body.tools[0].google_search && gem[0].key === env.GEMINI_API_KEY, "web search works with only GEMINI_API_KEY (Google Search grounding)");
ok(/Agency A/.test(prompts[prompts.length - 1].sys) && /example\.com\/list/.test(prompts[prompts.length - 1].sys), "grounded answer + real source links reach the answer");
gemDown = true; r = await ask("search karo seo agency"); const ws2 = r.j.tools_used.find((t) => t.tool === "web_search"); ok(ws2 && !ws2.ok && /Web search failed/.test(ws2.error), "search failure reported honestly"); gemDown = false;

/* v31: a live voice conversation is saved to chat history */
r = await B("voicelog", { turns: [{ role: "you", text: "FODO, aaj kitne users aaye?" }, { role: "fodo", text: "Aaj 12 naye users aaye." }, { role: "you", text: "" }] });
ok(r.j.ok && r.j.saved === 2 && /^c_/.test(r.j.threadId) && /🎙/.test(r.j.threadTitle), "voice turns saved as a conversation (empty turns skipped)");
const vt = r.j.threadId; r = await B("voicelog", { threadId: vt, turns: [{ role: "you", text: "aur kal?" }] }); ok(r.j.threadId === vt, "…later turns go to the same conversation");
r = await B("thread/" + vt); ok(r.j.messages.length === 3 && r.j.messages[1].role === "assistant" && r.j.messages[1].meta.voice, "voice conversation visible in history (any device)");
r = await B("voicelog", { turns: [{ role: "you", text: "x" }] }, "cust"); ok(r.status === 403, "customers can't write to the Brain's history");

/* chat history: delete one / delete all */
await ask("hello there brain"); const T1 = (await B("threads")).j.items; ok(T1.length >= 3, "several conversations exist");
r = await B("thread/" + T1[0].id, undefined, "own", { method: "DELETE" }); ok(r.j.ok && !(await B("threads")).j.items.some((t) => t.id === T1[0].id), "delete one conversation");
r = await B("threads", undefined, "cust", { method: "DELETE" }); ok(r.status === 403, "a customer can't delete chat history");
r = await B("threads", undefined, "own", { method: "DELETE", headers: { origin: "https://evil.test" } }); ok(r.status === 403 && (await B("threads")).j.items.length > 0, "cross-site delete refused");
r = await B("threads", undefined, "own", { method: "DELETE" }); ok(r.j.ok && r.j.deleted >= 2 && (await B("threads")).j.items.length === 0 && db().prepare("SELECT COUNT(*) n FROM brain_messages").get().n === 0, "delete ALL chat history (messages too)");
ok(db().prepare("SELECT COUNT(*) n FROM brain_audit WHERE tool='delete_history'").get().n === 1, "history deletion is audited");
ok(!all.some((t) => /AIza_SECRET_gemini|gsk_SECRET|re_SECRET/.test(t)), "no key in any response");

console.log("\nv30 brain voice x-ray: " + pass + "/" + (pass + fail) + " passed");
process.exit(fail ? 1 : 0);
