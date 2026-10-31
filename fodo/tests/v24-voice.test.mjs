// v24 FODO BRAIN voice — hearing (Whisper + FODO vocabulary, hallucination filter, Urdu→Hindi retry, Nova-3 backup), speaking (Aura-2,
// Aura-1 backup, Hinglish → Devanagari for the Hindi voice), language mirroring, bigger model for voice, the browser WAV encoder.
// Run: node --no-warnings tests/v24-voice.test.mjs




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

import vm from "node:vm";
import fs from "node:fs";
import { speechLang, cleanText, prompt, transcribe } from "../functions/_lib/brain/voice.js";

const runs = [], prompts = []; let whisperQueue = [], auraFail = false, novaUsed = 0;
const AI = { run: async (model, inp) => {
  runs.push({ model, inp });
  if (/whisper/.test(model)) { const x = whisperQueue.length ? whisperQueue.shift() : { text: "FODO aaj kitne users aaye?" }; if (x === "throw") throw new Error("whisper down"); return x; }
  if (/nova-3/.test(model)) { novaUsed++; return { results: { channels: [{ alternatives: [{ transcript: "FODO open social" }] }] } }; }
  if (/aura-2/.test(model)) { if (auraFail) throw new Error("aura2 down"); return new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("ID3-aura2")); c.close(); } }); }
  if (/aura-1/.test(model)) return { audio: btoa("ID3-aura1") };
  if (/bge-m3/.test(model)) return { data: inp.text.map(() => [1, 0]) };
  const sys = inp.messages[0].content, user = inp.messages[inp.messages.length - 1].content; prompts.push({ sys, user, model });
  if (/Convert the user's Hinglish/.test(sys)) return { response: "फोडो आज बहुत अच्छा चल रहा है, 12 नए यूज़र्स आए।" };
  if (/You choose which FODO Brain tools/.test(sys)) return { response: JSON.stringify({ tools: [] }) };
  return { response: "ANSWER" }; } };
globalThis.fetch = async (u, o) => new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
const env = { XRAY_DB: d1(), ACCOUNTS_ENABLED: "1", XRAY_TEST_MODE: "1", AI };
await login("anmol@fodo.co.in", null, "own"); await login("ravi@shop.in", "starter", "cust");

/* ---------- language detection ---------- */
ok(speechLang("How is FODO doing today?") === "en" && speechLang("FODO aaj kaisa chal raha hai, kitne users aaye?") === "hinglish" && speechLang("आज कितने यूज़र्स आए?") === "hi", "speech language: English / Hinglish / Hindi detected");
ok(speechLang("Send the proposal to Rahul") === "en", "a plain English sentence is not mistaken for Hinglish");

/* ---------- hearing ---------- */
ok(cleanText("Thank you.", "") === "" && cleanText("Thanks for watching!", "") === "" && cleanText("धन्यवाद", "") === "" && cleanText("Subtitles by the Amara.org community", "") === "", "Whisper's silence hallucinations are dropped");
ok(cleanText("yes yes yes yes yes yes yes", "") === "", "repetition loops are dropped");
const P = prompt("Anmol"); ok(cleanText("Instagram aur LinkedIn pe post karo.", P) === "" && cleanText("FODO kaise ho", P) === "FODO kaise ho", "a repeated chunk of the prompt is dropped, a short real command is kept");
ok(/FODO/.test(P) && /X-Ray/.test(P) && /Growth Lab/.test(P) && /Anmol/.test(P), "the prompt teaches Whisper FODO's words and the owner's name");
let r = await transcribe(env, btoa("RIFFxxxxWAVE"), { name: "Anmol" }); const w = runs.filter((x) => /whisper/.test(x.model)).pop();
ok(r.text === "FODO aaj kitne users aaye?" && w.inp.initial_prompt && w.inp.vad_filter === true && w.inp.condition_on_previous_text === false && !w.inp.language, "Whisper large-v3-turbo with FODO prompt, VAD filter, auto language (Hindi/English/Hinglish)");
whisperQueue = [{ text: "فوڈو آج کتنے یوزرز آئے" }, { text: "फोडो आज कितने यूज़र्स आए" }]; r = await transcribe(env, "AAAA", {});
ok(r.text === "फोडो आज कितने यूज़र्स आए" && /\(hi\)/.test(r.engine) && runs.filter((x) => /whisper/.test(x.model)).pop().inp.language === "hi", "Hindi heard as Urdu script → retried as Hindi (Devanagari)");
whisperQueue = [{ text: "Thank you." }]; r = await transcribe(env, "AAAA", {}); ok(r.text === "" && r.dropped === "Thank you.", "silence → nothing (and the dropped text is reported)");
whisperQueue = ["throw"]; r = await transcribe(env, "AAAA", { mime: "audio/wav" }); ok(r.text === "FODO open social" && r.engine === "nova-3" && novaUsed === 1, "Whisper down → Deepgram Nova-3 backup");
whisperQueue = [{ text: "हिंदी" }]; await transcribe(env, "AAAA", { lang: "hi" }); ok(runs.filter((x) => /whisper/.test(x.model)).pop().inp.language === "hi", "'I speak mostly Hindi' setting is passed to Whisper");

r = await B("stt", { audioB64: btoa("RIFF....WAVE"), mime: "audio/wav", lang: "" }); ok(r.j.ok && r.j.text === "FODO aaj kitne users aaye?" && r.j.engine, "POST /stt → text");
r = await B("stt", { audioB64: "" }); ok(r.status === 400, "empty audio refused");
r = await B("stt", { audioB64: "x".repeat(4100000) }); ok(r.status === 400, "over-long audio refused");
r = await B("stt", { audioB64: "AAAA" }, "cust"); ok(r.status === 403, "customers can't use the Brain's hearing");

/* ---------- speaking ---------- */
r = await B("tts", { text: "Good morning Anmol. Revenue is up twelve percent." }); ok(r.status === 200 && /ID3-aura2/.test(r.t) && runs.some((x) => /aura-2-en/.test(x.model) && x.inp.speaker === "thalia"), "English → Aura-2 (natural voice 'thalia')");
await B("settings", { voice: "apollo" }); r = await B("tts", { text: "Hello there." }); ok(runs.filter((x) => /aura-2/.test(x.model)).pop().inp.speaker === "apollo", "the owner's chosen Aura-2 voice is used");
auraFail = true; r = await B("tts", { text: "Backup voice please." }); ok(r.status === 200 && /ID3-aura1/.test(r.t), "Aura-2 down → Aura-1 backup"); auraFail = false;
r = await B("tts", { text: "FODO aaj bahut accha chal raha hai, 12 naye users aaye hain." }); ok(r.status === 415 && r.j.lang === "hi-IN" && /[ऀ-ॿ]/.test(r.j.speakText) && /12/.test(r.j.speakText), "Hinglish → Devanagari version for the device's Hindi voice (natural pronunciation)");
r = await B("tts", { text: "नमस्ते अनमोल" }); ok(r.status === 415 && r.j.speakText === "नमस्ते अनमोल", "Hindi stays Hindi");
await B("settings", { voice: "browser" }); r = await B("tts", { text: "Hello." }); ok(r.status === 415 && r.j.lang === "en-IN", "'device voice only' setting respected"); await B("settings", { voice: "thalia" });

/* ---------- answering ---------- */
prompts.length = 0; r = await ask("FODO aaj kitne users aaye?", null, "own", { voice: true });
const last = prompts[prompts.length - 1]; ok(/LANGUAGE: reply in the SAME language/.test(last.sys) && /Hinglish/.test(last.sys) && /VOICE MODE/.test(last.sys), "the answer mirrors the language (Hinglish in → Hinglish out) and is short for voice");
ok(/llama-3\.3-70b/.test(last.model), "voice answers use the 70B model (not the small 8B)");
prompts.length = 0; r = await ask("kaise ho fodo?"); ok(/llama-3\.3-70b/.test(prompts[prompts.length - 1].model), "small talk also uses the bigger model (better Hinglish)");

/* ---------- the browser hearing engine (WAV encoder) ---------- */
const ctx = { window: {}, navigator: {}, Float32Array, Int16Array, Uint8Array, ArrayBuffer, DataView, Math, String, btoa: (s) => Buffer.from(s, "binary").toString("base64") }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL("../js/owner-brain-voice.js", import.meta.url), "utf8"), ctx);
const sr = 48000, frames = [0, 1, 2, 3].map((k) => { const f = new Float32Array(2048); for (let i = 0; i < f.length; i++) f[i] = 0.1 * Math.sin((k * 2048 + i) / sr * 2 * Math.PI * 300); return f; });
const b = Buffer.from(ctx.window.FodoVoice._wav(frames, sr), "base64");
ok(b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WAVE" && b.readUInt32LE(24) === 16000 && b.readUInt16LE(22) === 1 && b.readUInt16LE(34) === 16, "browser encodes speech as 16 kHz mono 16-bit WAV (what Whisper expects)");
ok(Math.abs(b.readUInt32LE(40) / 2 - Math.floor(4 * 2048 / 3)) <= 1, "48 kHz microphone audio is resampled to 16 kHz");
let peak = 0; for (let i = 44; i < b.length; i += 2) peak = Math.max(peak, Math.abs(b.readInt16LE(i))); ok(peak > 25000, "quiet speech is normalised (a phone held far away still gets heard)");
ok(ctx.window.FodoVoice.cfg.preRollMs >= 300 && ctx.window.FodoVoice.cfg.endSilenceMs >= 700 && ctx.window.FodoVoice.cfg.endSilenceMs <= 1000, "VAD keeps the first syllable (pre-roll) and waits ~0.8 s of silence before sending");

console.log("\nv24 voice: " + pass + "/" + (pass + fail) + " passed");
process.exit(fail ? 1 : 0);
