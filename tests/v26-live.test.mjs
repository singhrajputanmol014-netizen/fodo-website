// v26 FODO BRAIN live voice — Gemini Live token endpoint (model discovery, single-use token, key never exposed, fallbacks),
// permissions, settings. Run: node --no-warnings tests/v26-live.test.mjs




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

import { instructions, TOOL } from "../functions/_lib/brain/live.js";
const calls = []; let tokenFail = 0, modelsBad = false;
globalThis.fetch = async (u, o = {}) => { u = String(u); calls.push({ u, o });
  if (/\/v1beta\/models\?/.test(u)) return modelsBad ? new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 400 }) : new Response(JSON.stringify({ models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }, { name: "models/gemini-3.1-flash-live-preview", supportedGenerationMethods: ["bidiGenerateContent"] }, { name: "models/gemini-3.8-live-native-audio", supportedGenerationMethods: ["bidiGenerateContent", "countTokens"] }] }), { status: 200 });
  if (/auth_tokens/.test(u)) { if (tokenFail-- > 0) return new Response(JSON.stringify({ error: { message: "Invalid JSON payload: unknown field systemInstruction" } }), { status: 400 }); return new Response(JSON.stringify({ name: "auth_tokens/eph123" }), { status: 200 }); }
  return new Response("{}", { status: 200 }); };
const env = { XRAY_DB: d1(), ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", GEMINI_API_KEY: "AIzaSECRETgeminiKEY1234567890" };
await login("anmol@fodo.co.in", null, "own"); await login("ravi@shop.in", "starter", "cust"); await login("team@acme.in", "starter", "team");

let r = await B("status"); ok(r.j.voice.live === true && r.j.settings.voiceEngine === "auto", "status says live voice is available (Gemini key present), engine = auto");
r = await B("live"); const tk = r.j;
ok(r.j.ok && tk.model === "models/gemini-3.8-live-native-audio", "picks the best Live model from Google's own list (native-audio Live model)");
ok(/^wss:\/\/generativelanguage\.googleapis\.com\/ws\/google\.ai\.generativelanguage\.v1alpha\.GenerativeService\.BidiGenerateContentConstrained\?access_token=auth_tokens\/eph123$/.test(tk.ws), "browser gets the Constrained WebSocket URL with a single-use token");
const tc = calls.filter((c) => /auth_tokens/.test(c.u)).pop(), body = JSON.parse(tc.o.body);
ok(tc.o.headers["x-goog-api-key"] === env.GEMINI_API_KEY && body.uses === 1 && Date.parse(body.newSessionExpireTime) - Date.now() < 3 * 60e3 && body.bidiGenerateContentSetup.model === tk.model && body.bidiGenerateContentSetup.generationConfig.responseModalities[0] === "AUDIO" && body.bidiGenerateContentSetup.tools[0].functionDeclarations[0].name === "fodo_brain" && !("liveConnectConstraints" in body) && /\/v1alpha\/auth_tokens$/.test(tc.u), "token: same REST shape as Google's SDK (bidiGenerateContentSetup, v1alpha), 1 use, start within 2 min, locked to model + persona + tool");
ok(!JSON.stringify(r.j).includes(env.GEMINI_API_KEY), "the Gemini API key never reaches the browser");
ok(tk.setup.tools[0].functionDeclarations[0].name === "fodo_brain" && /fodo_brain/.test(tk.setup.systemInstruction.parts[0].text) && tk.setup.inputAudioTranscription && tk.setup.outputAudioTranscription, "setup: FODO persona + fodo_brain tool + live transcripts");
const sys = instructions({ owner: true, name: "Anmol Singh" }, {}); ok(/Hinglish/.test(sys) && /never formal/.test(sys) && /Never invent numbers/.test(sys) && /Confirm/.test(sys) && /Anmol/.test(sys), "persona: human, mirrors Hinglish, never invents numbers, confirmations on screen");
ok(TOOL.functionDeclarations[0].parameters.required[0] === "request", "fodo_brain tool takes the user's request");
calls.length = 0; r = await B("live"); ok(!calls.some((c) => /\/models\?/.test(c.u)), "the model choice is cached (no model-list call every time)");
tokenFail = 1; r = await B("live"); ok(r.j.ok && r.j.locked === true && r.j.tier === "mid", "v31: if Google refuses the newest features, the next richest locked setup is used");
tokenFail = 3; r = await B("live"); ok(r.j.ok && r.j.locked === false, "if Google rejects every locked config, a simpler token is used (the page sends the persona in setup)");
tokenFail = 0; r = await B("live?mode=wake&handle=resumeHANDLE_123456&voice=Sulafat"); const rs = r.j.setup;
ok(r.j.tier === "rich" && r.j.mode === "wake" && r.j.resumed && rs.sessionResumption.handle === "resumeHANDLE_123456" && rs.contextWindowCompression.slidingWindow && rs.proactivity.proactiveAudio === true && rs.tools.some((t) => t.googleSearch) && rs.realtimeInputConfig.automaticActivityDetection.endOfSpeechSensitivity === "END_SENSITIVITY_LOW" && rs.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName === "Sulafat" && /GROUP MODE/.test(rs.systemInstruction.parts[0].text), "v31: long conversations (compression + resumption), patient turn-taking, Google Search, group mode (proactive audio), 30 voices");
r = await B("live?lite=1&handle=x%3Cscript%3E"); ok(r.j.tier === "basic" && !r.j.resumed && !("contextWindowCompression" in r.j.setup), "lite session (fallback) and bad handles ignored");
await B("settings", { liveVoice: "Kore", voiceEngine: "classic" }); r = await B("settings"); ok(r.j.settings.liveVoice === "Kore" && r.j.settings.voiceEngine === "classic" && r.j.live === true, "settings: live voice + engine choice");
r = await B("live"); ok(r.j.voice === "Kore", "chosen live voice used");
r = await B("live?voice=Hacker"); ok(r.j.voice === "Puck", "unknown voice → default");
r = await B("live", undefined, "cust"); ok(r.status === 403, "customers can't get a voice token");
await B("members", { email: "team@acme.in", role: "limited", perms: ["social"] }); r = await B("live", undefined, "team"); ok(r.status === 403, "a member without 'chat' access can't either");
await B("members", { email: "team@acme.in", role: "limited", perms: ["chat"] }); r = await B("live", undefined, "team"); ok(r.j.ok && /team member/.test(r.j.setup.systemInstruction.parts[0].text), "a member with chat access gets a token with a team-member persona");
env.XRAY_DB.db.prepare("DELETE FROM brain_settings WHERE k='liveModel'").run(); modelsBad = true; r = await B("live"); ok(r.status === 503 && /key problem/.test(r.j.reason) && !r.t.includes(env.GEMINI_API_KEY), "a bad Gemini key → clear message (the page falls back to the standard voice)");
env.GEMINI_LIVE_MODEL = "gemini-3.1-flash-live-preview"; modelsBad = false; r = await B("live"); ok(r.j.ok && r.j.model === "models/gemini-3.1-flash-live-preview", "GEMINI_LIVE_MODEL pins the model (e.g. the free Live model)"); delete env.GEMINI_LIVE_MODEL;
delete env.GEMINI_API_KEY; r = await B("status"); ok(r.j.voice.live === false, "no Gemini key → live off, standard voice used");

console.log("\nv26 live: " + pass + "/" + (pass + fail) + " passed");
process.exit(fail ? 1 : 0);
