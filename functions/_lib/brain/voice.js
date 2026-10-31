/* FODO BRAIN, voice on the server.
   Hearing: the page detects when someone starts/stops speaking (VAD) and sends just that clip here. Whisper large-v3-turbo
   (Workers AI) transcribes it: Hindi, English and Hinglish, guided by an initial prompt with FODO's own words ("FODO",
   "X-Ray", "Growth Lab"…) so the wake word and product names come out right. Whisper's known silence hallucinations
   ("Thank you.", "Subscribe…") are dropped; Urdu-script output is retried as Hindi; Deepgram Nova-3 is the backup engine.
   Speaking: English → Deepgram Aura-2 (natural, 40 voices; Aura-1 as backup). Hindi/Hinglish → the device's Hindi voice reads a
   Devanagari version (a Hindi voice pronounces Devanagari naturally; Roman Hinglish sounds broken). */
import { brainAI } from "./models.js";

const HINGLISH = /\b(hai|hain|ho|hoon|kya|kyu|kyun|nahi|nahin|aap|aapka|aapke|tum|tumhara|mera|meri|mere|hum|hamara|kar|karo|karna|karke|kiya|haan|ji|tha|thi|the|bhi|abhi|kal|aaj|kaise|kaisa|kitna|kitne|boliye|batao|bataiye|dekh|dekho|chahiye|wala|wali|wale|raha|rahi|rahe|gaya|gayi|ke|ki|ka|ko|se|mein|pe|par|aur|ya|lekin|matlab|accha|achha|theek|thik|bas|bahut|zyada|kam|sab|kuch|koi|yeh|ye|woh|wo)\b/gi;
export function speechLang(t) {
  t = String(t || ""); if (/[ऀ-ॿ]/.test(t)) return "hi";
  const w = t.split(/\s+/).filter(Boolean).length, h = (t.match(HINGLISH) || []).length;
  return h >= 3 || (w > 0 && h / w >= 0.2 && h >= 2) ? "hinglish" : "en";
}
export async function toDevanagari(env, text, settings) {
  const r = await brainAI(env, { kind: "deep", purpose: "tts-devanagari", provider: settings && settings.provider, max: 700, temp: 0.1, messages: [
    { role: "system", content: "Convert the user's Hinglish (Hindi written in English letters, mixed with English) into Devanagari script so a Hindi text-to-speech voice reads it naturally. Write English words the way an Indian would say them, in Devanagari (Instagram → इंस्टाग्राम, revenue → रेवेन्यू, FODO → फोडो, X-Ray → एक्स-रे). Keep numbers as digits and ₹ as रुपये. Do not translate, do not add or remove anything. Output ONLY the converted text." },
    { role: "user", content: String(text).slice(0, 1500) }] });
  const out = String(r.text || "").replace(/^["'\s]+|["'\s]+$/g, "");
  if (!/[ऀ-ॿ]/.test(out) || out.length > text.length * 3) throw new Error("bad conversion");
  return out;
}

/* ---------- speaking (English) ---------- */
const AURA2 = "amalthea andromeda apollo arcas aries asteria athena atlas aurora callista cora cordelia delia draco electra harmonia helena hera hermes hyperion iris janus juno jupiter luna mars minerva neptune odysseus ophelia orion orpheus pandora phoebe pluto saturn thalia theia vesta zeus".split(" ");
async function toBody(out) {
  if (!out) throw new Error("no audio");
  if (typeof ReadableStream !== "undefined" && out instanceof ReadableStream) return out;
  if (out instanceof Response) return out.body;
  if (out instanceof ArrayBuffer || out instanceof Uint8Array) return out;
  if (out.audio) { const b = atob(out.audio), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  throw new Error("unknown audio format");
}
export async function aura(env, text, voice) {
  const t0 = Date.now(), speaker = AURA2.indexOf(voice) > -1 ? voice : "thalia";
  try { return { body: await toBody(await env.AI.run("@cf/deepgram/aura-2-en", { text, speaker, encoding: "mp3" })), model: "aura-2 " + speaker, ms: Date.now() - t0 }; }
  catch (e) { const sp1 = ["asteria", "luna", "stella", "athena", "hera", "orion", "arcas", "perseus", "angus", "orpheus", "helios", "zeus"].indexOf(voice) > -1 ? voice : "asteria";
    return { body: await toBody(await env.AI.run("@cf/deepgram/aura-1", { text, speaker: sp1, encoding: "mp3" })), model: "aura-1 " + sp1, ms: Date.now() - t0 }; }
}

/* ---------- hearing ---------- */
const HALLU = /^(thank(s| you)( (so much|very much|for watching|for listening))?|thanks for watching|please subscribe|subscribe( to (my|our|the) channel)?|like and subscribe|bye( bye)?|you|okay|ok|so|um+|uh+|hmm+|\.+|music|applause|silence|subtitles? by .*|transcribed by .*|amara\.org.*|www\..*|धन्यवाद|शुक्रिया|सब्सक्राइब.*|♪+|\[.*\]|\(.*\))[\s.!?…]*$/i;
const b64bytes = (s) => { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
export function prompt(name) { return "Hey FODO, FODO kaise ho? " + (name ? name + " here. " : "") + "Aaj ka revenue kitna hai? Instagram aur LinkedIn pe post karo. Open the X-Ray, Growth Lab, Brain, social page. Light mode kar do."; }
export function cleanText(t, promptText) {
  t = String(t || "").replace(/\s+/g, " ").trim();
  if (!t || HALLU.test(t)) return "";
  if (promptText && promptText.toLowerCase().indexOf(t.toLowerCase().replace(/[.!?]+$/, "")) > -1 && t.length > 28) return "";   // Whisper repeated its prompt
  if (/(\b\w+\b)(?:[\s,]+\1\b){5,}/i.test(t)) return "";   // stuck repetition loop
  return t;
}
async function whisper(env, audioB64, lang, initial) {
  const o = { audio: audioB64, task: "transcribe", vad_filter: true, condition_on_previous_text: false, no_speech_threshold: 0.55, initial_prompt: initial };
  if (lang === "hi" || lang === "en") o.language = lang;
  const r = await env.AI.run("@cf/openai/whisper-large-v3-turbo", o);
  return String((r && r.text) || "");
}
export async function transcribe(env, audioB64, opt) {
  opt = opt || {}; const t0 = Date.now(), initial = prompt(opt.name); let text = "", engine = "whisper-large-v3-turbo", raw = "";
  try {
    raw = await whisper(env, audioB64, opt.lang, initial);
    if (/[؀-ۿ]/.test(raw)) { raw = await whisper(env, audioB64, "hi", initial); engine += " (hi)"; }   // Hindi heard as Urdu script → ask for Hindi
    text = cleanText(raw, initial);
  } catch (e) {
    engine = "nova-3";
    const r = await env.AI.run("@cf/deepgram/nova-3", { audio: { body: b64bytes(audioB64), contentType: opt.mime || "audio/wav" }, detect_language: true, smart_format: true, punctuate: true, keyterm: "FODO" });
    const alt = r && r.results && r.results.channels && r.results.channels[0] && r.results.channels[0].alternatives && r.results.channels[0].alternatives[0];
    raw = String((alt && alt.transcript) || ""); text = cleanText(raw, "");
  }
  return { text, engine, ms: Date.now() - t0, dropped: raw && !text ? raw.slice(0, 80) : null };
}
