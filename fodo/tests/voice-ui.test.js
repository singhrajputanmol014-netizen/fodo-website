/* Voice mode UI test — real site + real bot engine; only the browser speech APIs are simulated
   (headless Chromium has no speech recognition service and no TTS voices). Run: node tests/voice-ui.test.js [baseURL] */
const { chromium } = require("playwright");
const BASE = process.argv[2] || "http://localhost:8765";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const FAKE = ({ voices, noSR, denyMic }) => {
  window.__said = []; window.__spoken = []; window.__q = []; window.__cancel = 0;
  window.__say = (t) => window.__q.push(t);
  window.__replies = () => window.__spoken.filter((x) => x.text.trim() && !/I'm listening|main sun raha|सुन रहा/.test(x.text));
  if (!noSR) {
    class FakeSR { constructor() { this.lang = ""; } start() { const me = this; window.__lastLang = this.lang; let waited = 0; const tick = () => { if (me.dead) return; if (!window.__q.length && waited < 3000) { waited += 100; return setTimeout(tick, 100); } const t = window.__q.shift(); if (t && t.includes("|")) { const parts = t.split("|"); const res = []; parts.forEach((pt, k) => setTimeout(() => { if (me.dead) return; const r = [{ transcript: pt }]; r.isFinal = true; res.push(r); me.onresult && me.onresult({ results: res.slice() }); }, k * 800)); return; } if (t) { const mk = (fin) => { const r = [{ transcript: t }]; r.isFinal = fin; const res = [r]; return { results: res }; }; me.onresult && me.onresult(mk(false)); me.onresult && me.onresult(mk(true)); } else { me.onerror && me.onerror({ error: "no-speech" }); } setTimeout(() => me.onend && me.onend(), 30); }; setTimeout(tick, 250); } abort() { this.dead = true; } stop() { this.dead = true; } }
    window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
  } else { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined; }
  const vs = (voices || []).map(([lang, name]) => ({ lang, name, localService: true, default: false, voiceURI: name }));
  const tts = { speaking: false, getVoices: () => vs, addEventListener() { }, cancel() { window.__cancel++; this._q = []; }, speak(u) { window.__spoken.push({ text: u.text, lang: u.lang, voice: u.voice && u.voice.name }); setTimeout(() => u.onend && u.onend(), window.__ttsDelay || 60); } };
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  Object.defineProperty(window, "speechSynthesis", { value: tts, configurable: true });
  if (denyMic) navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
  try { sessionStorage.setItem("fodo-loaded", "1"); sessionStorage.setItem("fodo-bot", "1"); localStorage.setItem("fodo-consent", "essential"); } catch (e) { }
};
const VOICES = [["en-IN", "Google English India"], ["hi-IN", "Google हिन्दी"], ["en-US", "Google US English"]];
(async () => {
  const br = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  async function page(opts, vw) {
    const ctx = await br.newContext({ viewport: { width: vw || 1366, height: 860 }, permissions: ["microphone"] });
    await ctx.addInitScript(FAKE, opts);
    if (opts.realtime) await ctx.route("**/js/config.js*", async (r) => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace('voiceProvider: "browser"', 'voiceProvider: "openai-realtime"') }); });
    const p = await ctx.newPage(); const errs = [];
    p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error" && !/ERR_TUNNEL|fonts|501|404|Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await p.goto(BASE + "/services/", { waitUntil: "networkidle" });
    await p.mouse.move(5, 5); await p.keyboard.press("Shift");
    await p.waitForFunction(() => window.FODO_VOICE, null, { timeout: 15000 });
    return { p, ctx, errs };
  }
  const mic = async (p) => { if (await p.evaluate(() => document.querySelector(".bot-panel").hidden)) { await p.click(".bot-fab"); await p.waitForTimeout(700); } await p.click(".bot-mic"); };
  const st = (p) => p.evaluate(() => window.FODO_VOICE.state());
  const waitState = (p, s, ms) => p.waitForFunction((s) => window.FODO_VOICE.state().state === s, s, { timeout: ms || 15000 });
  const lastBot = (p) => p.evaluate(() => { const m = [...document.querySelectorAll(".bot-log .msg.bot")]; return m.length ? m.at(-1).textContent : ""; });
  const lastMe = (p) => p.evaluate(() => { const m = [...document.querySelectorAll(".bot-log .msg.me")]; return m.length ? m.at(-1).textContent : ""; });

  // 1. English conversation + controls
  { const { p, ctx, errs } = await page({ voices: VOICES });
    ok(await p.$eval(".bot-mic", (b) => b.getAttribute("aria-label")).then((l) => /Talk to FODO AI/.test(l)), "mic button labelled");
    ok(await p.evaluate(() => !document.querySelector(".bot-voice") || document.querySelector(".bot-voice").hidden), "voice bar hidden before start (no auto mic)");
    await p.evaluate(() => window.__say("what is seo"));
    await mic(p); await p.waitForSelector(".bot-panel:not([hidden])");
    await p.waitForFunction(() => window.__replies().length > 0, null, { timeout: 15000 });
    ok(/seo/i.test(await lastMe(p)), "spoken question shown in chat");
    const bot = await lastBot(p); ok(/search|google|SEO/i.test(bot), "real bot reply shown: " + bot.slice(0, 60));
    const sp = await p.evaluate(() => window.__replies()); ok(sp[0].lang === "en-IN" && !/https?:|→/.test(sp.map(x => x.text).join(" ")), "English reply read with en-IN voice, no URLs/arrows");
    ok(await p.evaluate(() => window.__lastLang) === "en-IN", "recognition lang en-IN");
    await waitState(p, "listening"); ok(true, "returns to listening after speaking");
    const all = await p.evaluate(() => window.__spoken.map((x) => x.text));
    ok(all.some((t) => /I'm listening|sun raha/.test(t)), "greets the caller before listening");
    const replyLen = sp.map((x) => x.text).join(" ").length;
    ok(replyLen < 520, "spoken reply is a short summary (" + replyLen + " chars), not the whole chat answer");
    ok(/full details in the chat/.test(sp.map((x) => x.text).join(" ")) || bot.length < 420, "long answers point to the chat");
    ok(/^\d:\d\d$/.test(await p.textContent(".bv-time")), "call timer visible");
    const norm = await p.evaluate(() => window.FODO_VOICE.debug.speakable("Budget ₹20,000/month → ~₹12k (≈60%) for Meta · e.g. Reels"));
    ok(/20,000 rupees per month/.test(norm) && /12 thousand rupees/.test(norm) && !/[→·≈~]/.test(norm) && /for example/.test(norm), "speech text normalised: " + norm);
    // pause in the middle of a sentence must NOT cut the question (desktop continuous session)
    await waitState(p, "listening");
    await p.evaluate(() => { window.__spoken = []; window.__say("how do i get more leads|for my dental clinic in dwarka"); });
    await p.waitForFunction(() => window.__replies().length > 0, null, { timeout: 20000 });
    ok(/leads.*dental clinic in dwarka/i.test(await lastMe(p)), "mid-sentence pause kept in one question: " + (await lastMe(p)));
    await waitState(p, "listening");
    // mute / unmute
    await p.click('.bv-btn[data-a="mute"]'); ok((await st(p)).state === "muted", "mute -> muted");
    await p.click('.bv-btn[data-a="mute"]'); await waitState(p, "listening"); ok(true, "unmute -> listening");
    // stop speaking (interrupt)
    await p.evaluate(() => { window.__ttsDelay = 4000; window.__say("what is google ads"); });
    await waitState(p, "speaking", 20000); const c0 = await p.evaluate(() => window.__cancel);
    ok(!(await p.$eval('.bv-btn[data-a="stop"]', (b) => b.disabled)), "stop enabled while speaking");
    await p.click('.bv-btn[data-a="stop"]'); ok(await p.evaluate(() => window.__cancel) > c0, "stop speaking cancels TTS");
    await waitState(p, "listening"); ok(true, "after interrupt -> listening");
    await p.evaluate(() => { window.__ttsDelay = 60; });
    // keyboard: end button reachable and works
    await p.focus('.bv-btn[data-a="end"]'); await p.keyboard.press("Enter"); await waitState(p, "ended", 3000);
    ok(!(await st(p)).active, "end voice via keyboard");
    // text chat still works
    await p.fill("#bot-in", "pricing"); await p.press("#bot-in", "Enter"); await p.waitForTimeout(1500);
    ok(/scope|price|audit/i.test(await lastBot(p)), "typed chat still works");
    ok(!errs.length, "no console errors (EN): " + errs.join("|")); await ctx.close(); }

  // 2. Hinglish + 3. Hindi
  { const { p, ctx, errs } = await page({ voices: VOICES });
    await p.evaluate(() => window.__say("bhai mere salon ke liye leads nahi aa rahi kya karu"));
    await mic(p); await p.waitForFunction(() => window.__replies().length > 0, null, { timeout: 15000 });
    const hb = await lastBot(p), sp = await p.evaluate(() => window.__replies()[0]);
    ok(/\b(hai|karo|nahi|aapke|chahiye|leads)\b/i.test(hb), "Hinglish question -> Hinglish reply: " + hb.slice(0, 70));
    ok(sp.lang === "en-IN" || sp.lang === "hi-IN", "Hinglish read with Indian voice: " + sp.lang);
    await waitState(p, "listening");
    await p.click(".bv-lang"); ok(/हिंदी/.test(await p.textContent(".bv-lang")), "language toggle -> Hindi");
    await p.evaluate(() => { window.__spoken = []; window.__say("मेरा बजट 20 हजार है, मुझे ज़्यादा ग्राहक चाहिए"); });
    await p.waitForFunction(() => window.__replies().length > 0, null, { timeout: 15000 });
    ok(await p.evaluate(() => window.__lastLang) === "hi-IN", "recognition switched to hi-IN");
    const hiBot = await lastBot(p), hsp = await p.evaluate(() => window.__replies());
    const dev = /[ऀ-ॿ]/.test(hsp.map(x => x.text).join(""));
    ok(/20,000|20k|₹|budget|बजट/i.test(hiBot), "Hindi budget understood: " + hiBot.slice(0, 70));
    ok(hsp.every((x) => !/[\u0900-\u097F]/.test(x.text) || x.lang === "hi-IN"), "every Devanagari chunk uses the hi-IN voice");
    console.log("   Hindi reply sample:", hiBot.slice(0, 110).replace(/\s+/g, " "));
    ok(!errs.length, "no console errors (HI): " + errs.join("|")); await ctx.close(); }

  // 4. No Hindi voice on device
  { const { p, ctx } = await page({ voices: [["en-US", "Google US English"]] });
    await p.evaluate(() => { try { sessionStorage.setItem("fodo-voice-lang", "hi-IN"); } catch (e) { } });
    await mic(p); await p.click(".bv-lang").catch(() => { });
    await p.evaluate(() => window.__say("नमस्ते, एसईओ क्या है"));
    await p.waitForFunction(() => /no Hindi voice|can't read answers/i.test(document.querySelector(".bot-log").textContent) || window.__replies().length > 0, null, { timeout: 15000 });
    const spoken = await p.evaluate(() => window.__spoken), log = await p.textContent(".bot-log");
    ok(spoken.every((s) => !/[ऀ-ॿ]/.test(s.text)), "never reads Devanagari with an English voice");
    ok(/no Hindi voice/i.test(log) || spoken.length > 0, "missing Hindi voice handled");
    await ctx.close(); }

  // 4b. Human-sounding voice is preferred over old robotic system voices; picker lists them
  { const { p, ctx } = await page({ voices: [["en-IN", "Microsoft Heera - English (India)"], ["en-IN", "Microsoft Neerja Online (Natural) - English (India)"], ["hi-IN", "Microsoft Kalpana - Hindi (India)"], ["hi-IN", "Microsoft Swara Online (Natural) - Hindi (India)"], ["en-US", "Google US English"]] });
    await p.evaluate(() => window.__say("what is seo")); await mic(p);
    await p.waitForFunction(() => window.__replies().length > 0, null, { timeout: 15000 });
    ok((await p.evaluate(() => window.__replies()[0].voice)).includes("Neerja"), "natural Neerja voice chosen over robotic Heera");
    const opts = await p.$$eval(".bv-voice-sel option", (o) => o.map((x) => x.textContent));
    ok(opts.length >= 2 && /Neerja \(Natural\) ★/.test(opts[0]), "voice picker lists best voice first: " + opts.join(" | "));
    await p.selectOption(".bv-voice-sel", "Microsoft Heera - English (India)");
    ok(await p.evaluate(() => JSON.parse(localStorage.getItem("fodo-voice-pick")).en) === "Microsoft Heera - English (India)", "voice choice remembered");
    await p.click(".bv-lang"); await p.waitForTimeout(100);
    ok((await p.$$eval(".bv-voice-sel option", (o) => o.map((x) => x.textContent)))[0].includes("Swara"), "Hindi mode lists Swara (Natural) first");
    await ctx.close(); }

  // 5. Unsupported browser
  { const { p, ctx } = await page({ voices: VOICES, noSR: true });
    await mic(p); await p.waitForTimeout(400);
    ok(/isn't supported in this browser/.test(await lastBot(p)), "unsupported -> offers text chat");
    ok(await p.evaluate(() => document.activeElement && document.activeElement.id === "bot-in"), "focus moved to text input");
    ok(!(await st(p)).active, "voice not active when unsupported"); await ctx.close(); }

  // 6. Mic permission denied
  { const { p, ctx } = await page({ voices: VOICES, denyMic: true });
    await mic(p); await p.waitForTimeout(500);
    ok(/permission was denied/i.test(await lastBot(p)), "denied mic -> clear message");
    ok(!(await st(p)).active, "voice inactive after denial"); await ctx.close(); }

  // 7. Silence x3 -> ends ; closing chat ends voice
  { const { p, ctx } = await page({ voices: VOICES });
    await mic(p); await waitState(p, "ended", 25000);
    ok(/didn't hear anything/i.test(await lastBot(p)), "3x silence -> ended with message");
    await mic(p); await waitState(p, "listening"); await p.click(".bot-x"); await p.waitForTimeout(200);
    ok(!(await st(p)).active, "closing chat ends voice"); await ctx.close(); }

  // 8. Realtime configured but backend missing -> falls back to free browser voice
  { const { p, ctx, errs } = await page({ voices: VOICES, realtime: true });
    await p.evaluate(() => window.__say("what is cro"));
    await mic(p); await p.waitForFunction(() => window.__replies().length > 0, null, { timeout: 20000 });
    const log = await p.textContent(".bot-log");
    ok(/using your browser's free voice mode/i.test(log), "realtime unavailable -> fallback notice");
    ok((await st(p)).provider === "browser", "fallback provider = browser");
    ok(!errs.length, "no console errors (realtime fallback): " + errs.join("|")); await ctx.close(); }

  // 10. Realtime provider contract (WebRTC + OpenAI are stubbed: verifies request flow, auth header, event handling, cleanup)
  { const ctx = await br.newContext({ viewport: { width: 1366, height: 860 }, permissions: ["microphone"] });
    await ctx.addInitScript(FAKE, { voices: VOICES });
    await ctx.addInitScript(() => {
      window.__rt = { sent: [], closed: 0 };
      window.RTCPeerConnection = class { constructor() { this.connectionState = "new"; window.__pc = this; } addTrack() { } createDataChannel(n) { const dc = { label: n, readyState: "open", send: (m) => window.__rt.sent.push(JSON.parse(m)), close() { } }; window.__dc = dc; setTimeout(() => dc.onopen && dc.onopen(), 50); return dc; }
        async createOffer() { return { type: "offer", sdp: "v=0 fake" }; } async setLocalDescription(d) { this.localDescription = d; } async setRemoteDescription(d) { window.__rt.answer = d.sdp; } close() { window.__rt.closed++; } };
    });
    await ctx.route("**/js/config.js*", async (r) => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace('voiceProvider: "browser"', 'voiceProvider: "openai-realtime"') }); });
    let sessReq = null, sdpReq = null;
    await ctx.route("**/api/voice-session", async (r) => { sessReq = r.request(); r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, value: "ek_test_123", model: "gpt-realtime-2.1" }) }); });
    await ctx.route("https://api.openai.com/v1/realtime/calls", async (r) => { sdpReq = r.request(); r.fulfill({ contentType: "application/sdp", body: "v=0 answer", headers: { "access-control-allow-origin": "*" } }); });
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(BASE + "/services/", { waitUntil: "networkidle" }); await p.mouse.move(5, 5); await p.waitForFunction(() => window.FODO_VOICE);
    await mic(p); await waitState(p, "listening", 10000);
    ok(sessReq && sessReq.method() === "POST" && JSON.parse(sessReq.postData()).lang === "en-IN", "realtime: session requested via POST with lang");
    ok(sdpReq && sdpReq.headers()["authorization"] === "Bearer ek_test_123" && /application\/sdp/.test(sdpReq.headers()["content-type"]), "realtime: SDP sent with ephemeral key only");
    ok(await p.evaluate(() => window.__rt.answer === "v=0 answer" && window.__dc.label === "oai-events"), "realtime: answer applied, oai-events channel");
    ok((await st(p)).provider === "realtime", "realtime provider active");
    const fire = (ev) => p.evaluate((ev) => window.__dc.onmessage({ data: JSON.stringify(ev) }), ev);
    await fire({ type: "input_audio_buffer.speech_started" }); await fire({ type: "input_audio_buffer.speech_stopped" });
    ok((await st(p)).state === "thinking", "realtime: speech stop -> thinking");
    await fire({ type: "conversation.item.input_audio_transcription.completed", transcript: "SEO kya hai?" });
    await fire({ type: "output_audio_buffer.started" }); ok((await st(p)).state === "speaking", "realtime: audio -> speaking");
    await fire({ type: "response.output_audio_transcript.delta", delta: "SEO matlab " }); await fire({ type: "response.output_audio_transcript.done", transcript: "SEO matlab Google pe dikhna." });
    ok(await lastMe(p) === "SEO kya hai?" && /Google pe dikhna/.test(await lastBot(p)), "realtime: transcripts shown in chat");
    await p.click('.bv-btn[data-a="stop"]'); const sent = await p.evaluate(() => window.__rt.sent.map((x) => x.type));
    ok(sent.includes("response.cancel") && sent.includes("output_audio_buffer.clear"), "realtime: stop speaking sends cancel + clear");
    await p.click('.bv-btn[data-a="end"]'); ok(await p.evaluate(() => window.__rt.closed) === 1 && !(await st(p)).active, "realtime: end closes peer connection");
    ok(!errs.length, "no page errors (realtime): " + errs.join("|")); await ctx.close(); }

  // 9. Mobile layout
  { const { p, ctx } = await page({ voices: VOICES }, 390);
    await p.evaluate(() => window.__say("what is seo")); await mic(p);
    await p.waitForFunction(() => window.__replies().length > 0, null, { timeout: 15000 });
    const ov = await p.evaluate(() => { const b = document.querySelector(".bot-voice").getBoundingClientRect(); return b.right <= innerWidth + 1 && b.left >= -1; });
    ok(ov, "voice bar fits mobile width"); await p.screenshot({ path: "voice-mobile.png" }); await ctx.close(); }
  { const { p, ctx } = await page({ voices: VOICES }, 1366);
    await p.evaluate(() => { window.__ttsDelay = 3000; window.__say("how do i get more leads"); }); await mic(p);
    await waitState(p, "speaking", 20000); await p.screenshot({ path: "voice-desktop.png" }); await ctx.close(); }

  await br.close();
  console.log(`voice UI: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
