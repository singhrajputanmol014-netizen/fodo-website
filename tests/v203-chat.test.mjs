// v20.3 — /api/chat (the "Ask FODO" bot): live Growth Lab knowledge, the member's own account + latest X-Ray, paid limits, Groq fallback.
// Run: node --no-warnings tests/v203-chat.test.mjs
import { DatabaseSync } from "node:sqlite";
import { onRequest as account } from "../functions/api/account/[[path]].js";
import { onRequest as xray } from "../functions/api/xray/[[path]].js";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
console.log = ((orig) => (...a) => { if (typeof a[0] === "string" && a[0].charAt(0) === "{") return; orig(...a); })(console.log);

function d1() {
  const db = new DatabaseSync(":memory:");
  const st = (sql, a = []) => ({ bind: (...x) => st(sql, x), run: async () => { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }), _x: () => db.prepare(sql).run(...a) });
  return { db, prepare: (s) => st(s), batch: async (l) => l.map((s) => (s._x(), { success: true })) };
}
const SITE = "https://www.fodo.co.in", jars = {};
const call = async (env, path, body, o = {}) => {
  const who = o.as || "a", isA = path.indexOf("admin/") === 0, isX = path.indexOf("xray/") === 0, isL = path.indexOf("lab/") === 0, p = isX ? path.slice(5) : isA ? path.slice(6) : isL ? path.slice(4) : path;
  const h = Object.assign({ "cf-connecting-ip": "7.7.7.7", origin: SITE }, body !== undefined ? { "content-type": "application/json" } : {}, jars[who] ? { cookie: jars[who] } : {});
  const req = new Request(SITE + "/api/" + (isX ? "xray/" : isA ? "admin/" : isL ? "lab/" : "account/") + p, { method: body !== undefined ? "POST" : "GET", headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  const r = await (isX ? xray : isA ? admin : isL ? lab : account)({ request: req, env, params: { path: p.split("?")[0].split("/") } });
  const sc = r.headers.get("set-cookie"); if (sc) jars[who] = /Max-Age=0/.test(sc) ? "" : sc.split(";")[0];
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, j };
};
const login = (env, email, plan, who) => call(env, "test-login", Object.assign({ email }, plan ? { plan } : {}), { as: who });
const save = (env, job, who, extra) => xray({ request: new Request(SITE + "/api/xray/report", { method: "POST", headers: { "content-type": "application/json", "x-job": job, cookie: jars[who || "a"] }, body: JSON.stringify(Object.assign({ jobId: job, scores: { overall: 64 }, crawl: { blocked: null, pages: 3 }, completeness: { overall: 80, parts: [] } }, extra || {})) }), env, params: { path: ["report"] } });
// (harness above copied from the v18 tests)
import { onRequestPost as chatPost, onRequestGet as chatGet } from "../functions/api/chat.js";
import { saveConfig } from "../functions/_lib/config.js";
let groq = 0, aiFail = false; const prompts = [];
globalThis.fetch = async (u, o = {}) => {
  u = String(u);
  if (/api\.groq\.com/.test(u)) { groq++; return new Response(JSON.stringify({ choices: [{ message: { content: "Groq reply" } }] })); }
  return new Response("not mocked " + u, { status: 599 });
};
const AI = { run: async (m, inp) => { if (aiFail) throw new Error("4006: you have used up your daily free allocation of 10,000 neurons"); prompts.push(inp.messages[0].content); return { response: "AI reply" }; } };
const env = { XRAY_DB: d1(), ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", XRAY_PER_HOUR: "99", AI, GROQ_API_KEY: "gsk_t", RATE_PER_MIN: "3", RATE_PER_HOUR: "40" };
const chat = async (msg, who, ip) => { const r = await chatPost({ request: new Request(SITE + "/api/chat", { method: "POST", headers: Object.assign({ origin: SITE, "content-type": "application/json", "cf-connecting-ip": ip || "8.8.8.8" }, jars[who] ? { cookie: jars[who] } : {}), body: JSON.stringify({ message: msg, history: [] }) }), env }); return { status: r.status, j: await r.json() }; };
const health = async (who) => (await chatGet({ request: new Request(SITE + "/api/chat", { headers: jars[who] ? { cookie: jars[who] } : {} }), env })).json();

/* 1. a visitor: the bot knows the Growth Lab with LIVE prices (an admin price change shows at once) */
await saveConfig(env, { plans: { starter: { price: 599 } } }, "test");
let r = await chat("what plans do you have?", "v", "1.1.1.1"), sys = prompts[prompts.length - 1];
ok(r.j.ok && /Starter ₹599\/month/.test(sys) && /Competitor War Room ₹2,999/.test(sys) && /Business X-Ray: enter any website/.test(sys), "prompt has the Growth Lab, Pro tools and LIVE prices (admin changed Starter to ₹599)");
ok(/# PLANS IN DETAIL/.test(sys) && /# PRO TOOLS/.test(sys) && /HELP ARTICLES/.test(sys), "a plans question adds plan details, every tool and the matching help articles");
ok(/Not logged in/.test(sys) && !/latestXray/.test(sys), "visitor: no account data");
r = await chat("how do I write a good instagram caption?", "v", "1.1.1.2"); sys = prompts[prompts.length - 1];
ok(/FODO GROWTH LAB/.test(sys) && !/# PLANS IN DETAIL/.test(sys), "other questions: only the short catalogue (keeps the prompt small)");
let h = await health("v"); ok(h.ai && h.member === null, "health: AI on, no member for a visitor");

/* 2. a paying member: their own plan + latest X-Ray in the prompt, higher limits */
await login(env, "rohit@shop.in", "growth", "m");
r = await call(env, "xray/start", { url: "spicehub.test" }, { as: "m" }); const job = r.j.jobId;
await save(env, job, "m", { opportunities: [{ id: "O1", title: "No testimonials or reviews on the site", recommendation: "Add 3–6 named testimonials.", priority: "P0" }], top: { immediate: ["O1"] }, scores: { overall: 61, areas: { website: { name: "Website", score: 86 } } }, competitors: [{ name: "ICE India" }] });
h = await health("m"); ok(h.member && h.member.paid && h.member.plan === "Growth", "health tells the bot: paying member (Growth)");
r = await chat("what should I fix first?", "m", "2.2.2.2"); sys = prompts[prompts.length - 1];
ok(/PAYING customer \(Growth plan\)/.test(sys) && /No testimonials or reviews/.test(sys) && /Website 86/.test(sys) && /ICE India/.test(sys) && /spicehub\.test/.test(sys), "paid: the prompt has their own latest X-Ray (top actions, area scores, competitors)");
ok(!/anmol@|ravi@/.test(sys.split("# THE PERSON")[1] || ""), "only their own account is in the prompt");
let codes = []; for (let i = 0; i < 4; i++) codes.push((await chat("hi " + i, "m", "2.2.2.2")).status);
let vcodes = []; for (let i = 0; i < 4; i++) vcodes.push((await chat("hello " + i, "v", "3.3.3.3")).status);
ok(codes.every((c) => c === 200) && vcodes.filter((c) => c === 429).length >= 1, "paid members get higher limits (" + codes.join(",") + " vs visitor " + vcodes.join(",") + ")");

/* 3. Workers AI over its daily limit → Groq answers, the bot never goes silent */
aiFail = true; r = await chat("plans?", "m", "4.4.4.4"); aiFail = false;
ok(r.j.ok && r.j.reply === "Groq reply" && /^groq\//.test(r.j.model) && groq === 1, "Workers AI quota used up → Groq replies");
delete env.AI; r = await chat("plans?", "m", "4.4.4.5"); env.AI = AI;
ok(r.j.ok && r.j.reply === "Groq reply", "no Workers AI binding at all → Groq still answers");

console.log("\nv20.3 chat: " + pass + "/" + (pass + fail) + " passed"); process.exit(fail ? 1 : 0);
