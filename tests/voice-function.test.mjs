import { onRequestPost, onRequestGet, voiceInstructions } from "../functions/api/voice-session.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const ORIGIN = "https://www.fodo.co.in";
const KEY = "sk-test-SECRET-123";
const mkReq = (body, o = {}) => { const h = { "content-type": o.ct || "application/json", "cf-connecting-ip": o.ip || "1.1.1.1" }; if (o.origin !== null) h.origin = o.origin || ORIGIN; return new Request(ORIGIN + "/api/voice-session", { method: "POST", headers: h, body: typeof body === "string" ? body : JSON.stringify(body) }); };
const calls = [];
let upstream = () => new Response(JSON.stringify({ value: "ek_test_abc", expires_at: 1900000000 }), { status: 200 });
globalThis.fetch = async (url, init) => { calls.push({ url, init }); return upstream(url, init); };
const post = async (req, env) => { const r = await onRequestPost({ request: req, env }); return { status: r.status, json: await r.json() }; };

// health
{ const j = await (await onRequestGet({ request: new Request(ORIGIN + "/api/voice-session"), env: {} })).json(); ok(j.ok && j.configured === false, "health: not configured"); }
{ const j = await (await onRequestGet({ request: new Request(ORIGIN + "/api/voice-session"), env: { OPENAI_API_KEY: KEY } })).json(); ok(j.configured === true && !JSON.stringify(j).includes("sk-"), "health: configured, no key leak"); }
// not configured -> 503 and no upstream call
{ const n = calls.length; const r = await post(mkReq({ lang: "en-IN" }, { ip: "2.2.2.1" }), {}); ok(r.status === 503 && r.json.reason === "not-configured" && calls.length === n, "missing key -> 503, no upstream"); }
// origin checks
ok((await post(mkReq({}, { origin: "https://evil.example" }), { OPENAI_API_KEY: KEY })).status === 403, "foreign origin blocked");
ok((await post(mkReq({}, { origin: null }), { OPENAI_API_KEY: KEY })).status === 403, "missing origin blocked");
// bad input
ok((await post(mkReq("{bad", { ip: "3.3.3.1" }), { OPENAI_API_KEY: KEY })).status === 400, "bad json 400");
ok((await post(mkReq({ x: "y".repeat(5000) }, { ip: "3.3.3.2" }), { OPENAI_API_KEY: KEY })).status === 413, "oversize 413");
ok((await post(mkReq("a=b", { ip: "3.3.3.3", ct: "text/plain" }), { OPENAI_API_KEY: KEY })).status === 415, "non-json 415");
// happy path
{ const r = await post(mkReq({ lang: "hi-IN" }, { ip: "4.4.4.4" }), { OPENAI_API_KEY: KEY });
  ok(r.status === 200 && r.json.ok && r.json.value === "ek_test_abc" && r.json.model === "gpt-realtime-2.1", "happy path returns ephemeral secret");
  ok(!JSON.stringify(r.json).includes(KEY), "permanent key never returned");
  const c = calls.at(-1); const body = JSON.parse(c.init.body);
  ok(c.url === "https://api.openai.com/v1/realtime/client_secrets", "calls client_secrets endpoint");
  ok(c.init.headers.Authorization === "Bearer " + KEY, "server uses key in Authorization header");
  ok(body.session.type === "realtime" && body.session.audio.output.voice === "marin" && body.expires_after.seconds === 120, "session config shape");
  ok(body.session.instructions.includes("FODO FACTS") && /Hindi/.test(body.session.instructions) && /Never invent client names/.test(body.session.instructions), "instructions carry knowledge + language + truth rules");
  ok(/chose Hindi/.test(body.session.instructions), "hi-IN hint applied"); }
// env overrides
{ await post(mkReq({}, { ip: "5.5.5.5" }), { OPENAI_API_KEY: KEY, REALTIME_MODEL: "gpt-realtime", REALTIME_VOICE: "cedar" }); const b = JSON.parse(calls.at(-1).init.body); ok(b.session.model === "gpt-realtime" && b.session.audio.output.voice === "cedar", "model/voice env override"); }
// rate limit (3/min default)
{ const env = { OPENAI_API_KEY: KEY }; const s = []; for (let i = 0; i < 4; i++) s.push((await post(mkReq({}, { ip: "6.6.6.6" }), env)).status); ok(s.slice(0, 3).every((x) => x === 200) && s[3] === 429, "per-minute rate limit: " + s.join(",")); }
// KV daily cap
{ const store = new Map(); const KV = { async get(k) { return store.get(k) || null; }, async put(k, v) { store.set(k, v); } };
  const env = { OPENAI_API_KEY: KEY, CHAT_KV: KV, VOICE_PER_DAY: "1", VOICE_PER_MIN: "10", VOICE_PER_HOUR: "10" };
  const a = await post(mkReq({}, { ip: "7.7.7.7" }), env), b = await post(mkReq({}, { ip: "7.7.7.7" }), env); ok(a.status === 200 && b.status === 429 && b.json.reason === "daily-limit", "KV daily cap"); }
// upstream failure / timeout
{ upstream = () => new Response(JSON.stringify({ error: { message: "bad key sk-test-SECRET-123" } }), { status: 401 }); const r = await post(mkReq({}, { ip: "8.8.8.1" }), { OPENAI_API_KEY: KEY }); ok(r.status === 502 && r.json.reason === "upstream" && !JSON.stringify(r.json).includes("sk-"), "upstream error hidden"); }
{ upstream = () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; }; const r = await post(mkReq({}, { ip: "8.8.8.2" }), { OPENAI_API_KEY: KEY }); ok(r.status === 504 && r.json.reason === "timeout", "timeout -> 504"); }
ok(voiceInstructions("en-IN").includes("Start in English"), "en hint");
console.log(`voice-session function: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
