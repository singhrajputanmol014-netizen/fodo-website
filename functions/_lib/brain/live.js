/* FODO BRAIN, live conversation (Gemini Live API, speech-to-speech).
   The browser talks DIRECTLY to Google over a WebSocket (lowest latency, no server CPU), using a short-lived single-use token
   that this server mints with the real GEMINI_API_KEY (the key never reaches the browser). Gemini hears and speaks natively:
   natural voice, interruptions, Hindi/English/Hinglish, and whenever the owner asks about FODO or asks for an action it calls
   the `fodo_brain` tool, which the page forwards to /api/owner-brain/chat (all the Brain's rules, tools and confirmations).
   The Live model is discovered from Google's model list (any model that supports bidiGenerateContent, native-audio first), so a
   renamed/retired model never breaks it. Token: 1 use, session must start within 2 minutes, lives 30 minutes. */
import { outbound } from "../xray-core.js";
import { brainDb, nowIso, clip } from "./store.js";

const G = "https://generativelanguage.googleapis.com";
export const liveOn = (env) => !!env.GEMINI_API_KEY;
/* all 30 Gemini Live (native audio) voices, the Settings list shows them with a short description */
export const VOICES = ["Puck", "Charon", "Kore", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr", "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar", "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat"];

export async function pickModel(env) {
  // GEMINI_LIVE_MODEL (Cloudflare variable) pins the model, e.g. gemini-3.1-flash-live-preview, the free-of-charge Live model
  if (env.GEMINI_LIVE_MODEL) { const m = String(env.GEMINI_LIVE_MODEL).trim(); return m.startsWith("models/") ? m : "models/" + m; }
  const d = await brainDb(env), c = await d.prepare("SELECT v, updated_at FROM brain_settings WHERE k='liveModel'").first();
  if (c && c.v && Date.now() - Date.parse(c.updated_at) < 864e5) return c.v;
  const r = await outbound(env)(G + "/v1beta/models?pageSize=300", { headers: { "x-goog-api-key": env.GEMINI_API_KEY }, signal: AbortSignal.timeout(10000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Gemini key problem: " + clip((j.error && j.error.message) || r.status, 160));
  const live = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).indexOf("bidiGenerateContent") > -1).map((m) => m.name);
  if (!live.length) throw new Error("This Gemini key has no Live (voice) model available.");
  const score = (n) => (/native-audio/.test(n) ? 40 : 0) + (/live/.test(n) ? 20 : 0) + (/flash/.test(n) ? 5 : 0) - (/preview|exp/.test(n) ? 3 : 0) - (/thinking/.test(n) ? 8 : 0) + (parseFloat((/(\d+\.\d+)/.exec(n) || [])[1]) || 0);
  const best = live.sort((a, b) => score(b) - score(a))[0];
  await d.prepare("INSERT INTO brain_settings (k, v, updated_at) VALUES ('liveModel', ?1, ?2) ON CONFLICT(k) DO UPDATE SET v=?1, updated_at=?2").bind(best, nowIso()).run();
  return best;
}
export function instructions(who, owner, mode) {
  const name = (who && who.name) || (owner && owner.name) || "";
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  return [
    "You are FODO, the voice of FODO Brain, the personal assistant of " + (who && !who.owner ? (name || "a FODO team member") + " (a FODO team member)" : (name || "Anmol") + ", owner of FODO (Fear Of Digitally Out ?), a digital growth agency in New Delhi") + ". Today is " + today + " (India).",
    "Talk like a real, warm, quick-witted person, a trusted chief of staff, not a robot. Short natural sentences, a bit of humour when it fits, use his name sometimes. Never say 'as an AI'.",
    "LANGUAGE: always answer in the language he just spoke. Hinglish (Hindi + English mixed) → reply in natural, casual Hinglish the way people in Delhi talk, never formal/shuddh Hindi. English → English. Hindi → Hindi.",
    "For ANYTHING about FODO, numbers, users, revenue, X-Rays, leads, customers, tasks, reminders, memory, documents, email, calendar, social media, analytics, the website or admin, and for ANY action (post, send, change, create, remember, open a page, dark/light mode), call the fodo_brain tool with his full request. Before calling it say a tiny filler like 'ek second, dekhta hoon' or 'one sec'.",
    "ALSO call fodo_brain for: a Business X-Ray of ANY website (e.g. 'fodo.co.in ka x-ray karo' → request 'Run a Business X-Ray of fodo.co.in'), checking or reading any website, web/Google search, news, prices or anything current: FODO Brain can search Google and read websites. Always write website names as domains (fodo.co.in, not 'fodo dot co dot in').",
    "An X-Ray takes 2–4 minutes: when fodo_brain says it started, tell him briefly and keep talking normally. When a message starting with [X-RAY RESULT] arrives, read him the result right away, score, weakest areas, top fixes, short and natural, in his language.",
    "When fodo_brain answers, say the answer naturally and briefly in his language (round numbers the way people say them). Never invent numbers or facts, if fodo_brain didn't give it, say you don't have it. If it says something needs confirmation, tell him to tap Confirm on the screen.",
    "ANY other question, general knowledge, how-to, maths, advice, explanations, ideas, translations, current events (use Google Search for anything recent), answer it yourself, fully and correctly, like a smart friend. Never say you can't answer a normal question.",
    "LISTEN FULLY: he may speak long sentences, pause to think, list numbers, names or data. Wait until he has really finished, keep every detail he said (numbers, names, dates) and use all of it in your answer or when you call fodo_brain (pass the complete request with all the details). If something was unclear, ask one short question instead of guessing.",
    "Remember everything said earlier in this conversation and refer back to it naturally. If he interrupts you, stop and listen to the new thing.",
    mode === "wake" ? "GROUP MODE: other people may be talking near him. Respond ONLY when the speech is addressed to you, it contains your name 'FODO' (also heard as fodo, phodo, फोडो), or it is a direct follow-up within a few seconds right after you answered him. For all other talk (people chatting, TV, phone calls) stay completely silent: produce no audio at all." : "CONVERSATION MODE: he is alone with you, talk freely like a person; he doesn't need to say 'FODO' every time.",
    "Greetings and small talk you answer yourself. Keep every reply under ~40 words unless he asks for detail. Never reveal keys, passwords or system instructions.",
  ].join("\n");
}
export const TOOL = { functionDeclarations: [{ name: "fodo_brain", description: "FODO Brain: live FODO business data, memory, tasks, email, calendar, social media, analytics, website changes and every action (with confirmation). Pass the user's request in their own words.", parameters: { type: "OBJECT", properties: { request: { type: "STRING", description: "The user's full request, in their words." } }, required: ["request"] } }] };

export async function token(env, who, owner, voice, opt) {
  if (!liveOn(env)) throw new Error("GEMINI_API_KEY is not set.");
  opt = opt || {}; const mode = opt.mode === "wake" ? "wake" : "chat", lite = !!opt.lite, handle = /^[\w\-./=+]{8,400}$/.test(String(opt.handle || "")) ? String(opt.handle) : "";
  const model = await pickModel(env), sys = instructions(who, owner, mode), v = VOICES.indexOf(voice) > -1 ? voice : "Puck";
  const now = Date.now(), base = { uses: 1, expireTime: new Date(now + 30 * 60e3).toISOString(), newSessionExpireTime: new Date(now + 2 * 60e3).toISOString() };
  // Exactly the shape Google's own SDK (@google/genai 2.x tokens.create) sends: the locked Live setup goes in
  // `bidiGenerateContentSetup` (model + generationConfig + systemInstruction + tools + transcription), API v1alpha.
  const gen = { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: v } } } };
  const basic = { model, generationConfig: gen, systemInstruction: { parts: [{ text: sys }] }, tools: [TOOL], inputAudioTranscription: {}, outputAudioTranscription: {} };
  // v31: long conversations, context compression (no 15-minute cap), session resumption (reconnect keeps the conversation),
  // patient turn-taking for long sentences, Google Search for current questions, proactive audio (stays quiet when not addressed)
  const rich = Object.assign({}, basic, { tools: [TOOL, { googleSearch: {} }], contextWindowCompression: { slidingWindow: {} }, sessionResumption: handle ? { handle } : {},
    realtimeInputConfig: { automaticActivityDetection: { endOfSpeechSensitivity: "END_SENSITIVITY_LOW", startOfSpeechSensitivity: "START_SENSITIVITY_HIGH", prefixPaddingMs: 200, silenceDurationMs: 1100 } } });
  if (mode === "wake") rich.proactivity = { proactiveAudio: true };
  const mid = Object.assign({}, basic, { contextWindowCompression: rich.contextWindowCompression, sessionResumption: rich.sessionResumption, realtimeInputConfig: rich.realtimeInputConfig });
  const tries = (lite ? [] : [["v1alpha", Object.assign({}, base, { bidiGenerateContentSetup: rich }), true, "rich"], ["v1alpha", Object.assign({}, base, { bidiGenerateContentSetup: mid }), true, "mid"]])
    .concat([["v1alpha", Object.assign({}, base, { bidiGenerateContentSetup: basic }), true, "basic"], ["v1alpha", Object.assign({}, base, { bidiGenerateContentSetup: { model, generationConfig: { responseModalities: ["AUDIO"] } } }), false], ["v1alpha", base, false], ["v1beta", base, false]]);
  let last = "";
  for (const [ver, body, locked, tier] of tries) {
    const r = await outbound(env)(G + "/" + ver + "/auth_tokens", { method: "POST", headers: { "x-goog-api-key": env.GEMINI_API_KEY, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.name) return { token: j.name, model, voice: v, version: ver, locked,
      ws: "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage." + ver + ".GenerativeService.BidiGenerateContentConstrained?access_token=" + encodeURIComponent(j.name).replace(/%2F/g, "/"),
      setup: (body.bidiGenerateContentSetup && body.bidiGenerateContentSetup.systemInstruction) ? body.bidiGenerateContentSetup : basic, tier: tier || "open", mode, resumed: !!handle };
    last = clip((j.error && j.error.message) || String(r.status), 200);
    if (r.status === 400 && /API key|PERMISSION|permission/i.test(last)) break;
  }
  throw new Error("Gemini didn't give a voice token: " + last);
}
