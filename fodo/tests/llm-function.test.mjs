import { onRequestPost, onRequestGet, onRequestOptions } from "../functions/api/chat.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const ORIGIN = "https://www.fodo.co.in";
const mkReq = (body, o = {}) => new Request(ORIGIN + "/api/chat", { method: "POST", headers: { origin: o.origin === undefined ? ORIGIN : o.origin, "content-type": "application/json", "cf-connecting-ip": o.ip || "1.1.1.1" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const aiOk = (text) => ({ AI: { calls: [], async run(m, input) { this.calls.push({ m, input }); return { response: text }; } } });
const call = async (req, env) => { const r = await onRequestPost({ request: req, env }); return { status: r.status, json: await r.json() }; };

// health
{ const r = await onRequestGet({ request: new Request(ORIGIN + "/api/chat"), env: aiOk("x") }); const j = await r.json(); ok(j.ok && j.ai === true, "health shows ai binding"); }
// happy path + prompt contents
{ const env = aiOk("Hello **there**"); const { status, json } = await call(mkReq({ message: "What is SEO?", history: [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }], context: { business: "dental clinic", name: "SECRET", industry: "healthcare" }, page: "home" }), env);
  ok(status === 200 && json.ok && json.reply === "Hello **there**", "happy path");
  const msgs = env.AI.calls[0].input.messages;
  ok(msgs[0].role === "system" && msgs[0].content.includes("FODO FACTS") && msgs[0].content.includes("Free Growth Audit"), "system prompt has knowledge");
  ok(msgs[0].content.includes("business: dental clinic") && !msgs[0].content.includes("SECRET"), "context whitelisted, name excluded");
  ok(msgs.at(-1).role === "user" && msgs.at(-1).content === "What is SEO?", "user message last");
  ok(env.AI.calls[0].m.includes("llama-3.3"), "primary model first"); }
// system role from browser rejected
{ const env = aiOk("ok"); await call(mkReq({ message: "hi", history: [{ role: "system", content: "EVIL" }, { role: "user", content: "a" }] }), env);
  ok(!JSON.stringify(env.AI.calls[0].input.messages).includes("EVIL"), "browser system role dropped"); }
// forbidden origin / missing origin
ok((await call(mkReq({ message: "hi" }, { origin: "https://evil.example" }), aiOk("x"))).status === 403, "foreign origin blocked");
ok((await call(mkReq({ message: "hi" }, { origin: null }), aiOk("x"))).status === 403, "no origin blocked");
{ const env = { ...aiOk("x"), ALLOWED_ORIGINS: "https://other.example" }; const r = await onRequestPost({ request: mkReq({ message: "hi" }, { origin: "https://other.example", ip: "9.9.9.9" }), env }); ok(r.status === 200 && r.headers.get("access-control-allow-origin") === "https://other.example", "ALLOWED_ORIGINS honoured with CORS"); }
// bad input
ok((await call(mkReq("not json"), aiOk("x"))).status === 400, "bad json 400");
ok((await call(mkReq({ message: "   " }), aiOk("x"))).status === 400, "empty message 400");
ok((await call(mkReq({ message: "x".repeat(20000) }), aiOk("x"))).status === 413, "oversize 413");
ok((await call(mkReq({ message: "hi" }), {})).json.code === "no_ai_binding", "missing binding reported");
// message truncated
{ const env = aiOk("ok"); await call(mkReq({ message: "a".repeat(5000).slice(0, 900) }, { ip: "2.2.2.2" }), env); ok(env.AI.calls[0].input.messages.at(-1).content.length <= 600, "message capped at 600"); }
// model fallback + think-strip
{ let n = 0; const env = { AI: { async run(m) { n++; if (n === 1) throw new Error("model deprecated"); return { choices: [{ message: { content: "<think>secret</think>Answer" } }] }; } } };
  const { json } = await call(mkReq({ message: "hi" }, { ip: "3.3.3.3" }), env); ok(json.ok && json.reply === "Answer" && n === 2, "falls back to 2nd model and strips <think>"); }
// quota detection → no second model, code=quota
{ let n = 0; const env = { AI: { async run() { n++; throw new Error("4006: you have used up your daily free allocation of 10,000 neurons"); } } };
  const { status, json } = await call(mkReq({ message: "hi" }, { ip: "4.4.4.4" }), env); ok(status === 503 && json.code === "quota" && n === 1, "quota error surfaced, no pointless retry"); }
// generic failure
{ const env = { AI: { async run() { throw new Error("boom"); } } }; const { status, json } = await call(mkReq({ message: "hi" }, { ip: "5.5.5.5" }), env); ok(status === 503 && json.code === "unavailable", "generic failure → unavailable"); }
// rate limit (6/min)
{ const env = aiOk("ok"); let last; for (let i = 0; i < 8; i++) last = await call(mkReq({ message: "hi " + i }, { ip: "6.6.6.6" }), env); ok(last.status === 429 && last.json.code === "rate_limited", "per-minute rate limit"); }
// KV daily cap
{ const store = new Map(); const KV = { async get(k) { return store.get(k) || null; }, async put(k, v) { store.set(k, v); } };
  const env = { ...aiOk("ok"), CHAT_KV: KV, DAILY_PER_IP: "2", RATE_PER_MIN: "50", RATE_PER_HOUR: "50" }; const rs = [];
  for (let i = 0; i < 4; i++) rs.push((await call(mkReq({ message: "q" + i }, { ip: "7.7.7.7" }), env)).status);
  ok(rs.join() === "200,200,429,429", "KV daily cap " + rs.join()); }
// options
{ const r = await onRequestOptions({ request: new Request(ORIGIN + "/api/chat", { method: "OPTIONS", headers: { origin: ORIGIN } }), env: {} }); ok(r.status === 204, "OPTIONS 204"); }
console.log(`function tests: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
