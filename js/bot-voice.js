/* FODO Bot: VOICE MODE ("Talk to FODO AI")
 * Adds a mic control to the existing chat. The visitor's speech becomes text, goes through the SAME chat pipeline
 * as typed messages (FODO_BOT.ask → answerAsync / offline engine), and the real reply is read aloud.
 *
 * Providers (modular, pick in js/config.js → voiceProvider):
 *   "browser"          FREE. Browser SpeechRecognition (speech→text) + speechSynthesis (text→speech). Default.
 *   "openai-realtime"  PAID, optional. Speech-to-speech over WebRTC. Needs the Pages Function /api/voice-session
 *                      with OPENAI_API_KEY set as a Cloudflare secret. Falls back to "browser" if not configured.
 * No audio is recorded or stored by FODO. Mic access is requested only after the visitor presses the mic button.
 */
(function () {
  "use strict";
  var B = window.FODO_BOT, C = window.FODO || {}, U = window.FODO_UTIL || {};
  if (!B || !B.ui || !B.ask || C.voiceEnabled === false || window.FODO_VOICE) return;
  var ui = B.ui, box = ui.box, form = ui.form;
  var esc = U.esc || function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var TTS = window.speechSynthesis && window.SpeechSynthesisUtterance ? window.speechSynthesis : null;
  var MAX_MS = Math.max(1, Number(C.voiceMaxMinutes) || 5) * 60000;
  var LABEL = { ready: "Ready", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking…", ended: "Ended", muted: "Mic muted", connecting: "Connecting…", error: "Voice error" };

  /* ---------------- language helpers ---------------- */
  var HINGLISH = /\b(hai|hain|kya|kyu|kyun|nahi|nahin|mera|meri|mujhe|aap|aapka|kaise|kaisa|karo|karna|chahiye|bhai|haan|toh|bhi|wala|wali|kitna|kitne|batao|samjhao|kar|raha|rahi|sakta|sakte|abhi|accha|acha|theek|matlab|lekin|aur)\b/gi;
  function langOf(t) {
    t = String(t || "");
    var dev = (t.match(/[ऀ-ॿ]/g) || []).length, letters = (t.match(/[A-Za-zऀ-ॿ]/g) || []).length || 1;
    if (dev / letters > 0.3) return "hi";
    return (t.match(HINGLISH) || []).length >= 2 ? "hinglish" : "en";
  }
  var voices = [];
  function loadVoices() { try { voices = TTS ? TTS.getVoices() || [] : []; } catch (_) { voices = []; } }
  if (TTS) { loadVoices(); try { TTS.addEventListener("voiceschanged", loadVoices); } catch (_) { TTS.onvoiceschanged = loadVoices; } }
  /* Voice quality ranking, prefer neural / cloud voices, avoid old robotic system voices. */
  var HUMAN = /Neerja|Swara|Prabhat|Madhur|Aarav|Ananya|Kavya|Lekha|Rishi|Veena|Isha|Sangeeta|Google हिन्दी|Google Hindi/i;
  function quality(v) {
    var n = v.name || "", q = 0;
    if (/natural|neural/i.test(n)) q += 12;
    if (/premium/i.test(n)) q += 10;
    if (/enhanced|siri/i.test(n)) q += 7;
    if (/online/i.test(n)) q += 4;
    if (/google/i.test(n)) q += 5;
    if (HUMAN.test(n)) q += 3;
    if (!v.localService) q += 1;
    if (/^Microsoft (?!.*(Online|Natural))/i.test(n)) q -= 5;            // old Windows desktop voices sound robotic
    if (/espeak|compact|eloquence|fred|albert|zarvox|bad news|bells|trinoids|whisper|robot/i.test(n)) q -= 20;
    return q;
  }
  function langMatch(v, p) { var l = String(v.lang || "").toLowerCase().replace("_", "-"); p = p.toLowerCase(); return p.length > 2 ? l === p : l.slice(0, 2) === p; }
  var PREFS = { hi: [["hi-IN", 3], ["hi", 2]], hinglish: [["en-IN", 4], ["hi-IN", 3], ["en-GB", 1], ["en-US", 1], ["en", 0]], en: [["en-IN", 4], ["en-GB", 2], ["en-US", 2], ["en", 0]] };
  function candidates(kind) {
    loadVoices(); var out = [];
    voices.forEach(function (v) {
      var best = -1; (PREFS[kind] || PREFS.en).forEach(function (pr) { if (best < 0 && langMatch(v, pr[0])) best = pr[1]; });
      if (best >= 0) out.push({ v: v, s: quality(v) + best * 2 });
    });
    return out.sort(function (a, b) { return b.s - a.s; });
  }
  var chosen = {}; try { chosen = JSON.parse(localStorage.getItem("fodo-voice-pick") || "{}") || {}; } catch (_) {}
  function voiceFor(kind) {
    var list = candidates(kind); if (!list.length) return null;                 // "hi" never falls back to an English voice
    var want = chosen[kind]; if (want) for (var i = 0; i < list.length; i++) if (list[i].v.name === want) return list[i].v;
    return list[0].v;
  }
  function pickVoice(prefs) { return voiceFor(/^hi/.test(prefs[0]) && prefs.length <= 2 ? "hi" : "en"); }
  function humanName(v) { return String(v.name || "").replace(/^Microsoft\s+/i, "").replace(/\s*Online\s*\(Natural\)/i, " (Natural)").replace(/\s*-\s*(English|Hindi).*$/i, "").trim(); }
  function speakable(el) {
    var c = el.cloneNode(true);
    Array.prototype.forEach.call(c.querySelectorAll(".typing,script,style,code,pre"), function (x) { x.remove(); });
    Array.prototype.forEach.call(c.querySelectorAll("li"), function (x) { x.insertAdjacentText("afterend", ". "); });
    Array.prototype.forEach.call(c.querySelectorAll("br"), function (x) { x.replaceWith(". "); });
    var t = (c.textContent || "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
      .replace(/₹\s?([\d,.]+)\s*(k|K)\b/g, "$1 thousand rupees").replace(/₹\s?([\d,.]+(\s?(lakh|crore|L|Cr))?)/g, "$1 rupees").replace(/₹/g, "rupees ")
      .replace(/≈|~/g, " about ").replace(/\/(month|mo)\b/gi, " per month").replace(/\/(day)\b/gi, " per day").replace(/\/(week|wk)\b/gi, " per week")
      .replace(/\be\.g\./gi, "for example").replace(/\bi\.e\./gi, "that is").replace(/\bvs\.?\b/gi, "versus").replace(/\s&\s/g, " and ")
      .replace(/(\d)\s*[–-]\s*(\d)/g, "$1 to $2").replace(/\(([^)]{0,60})\)/g, ", $1, ")
      .replace(/[→←↗•·|*_#>=+]+/g, " ").replace(/\s+([,.!?।])/g, "$1")
      .replace(/([A-Za-z])\/([A-Za-z])/g, "$1 or $2").replace(/\s*[—–]\s*/g, ", ").replace(/\s+/g, " ")
      .replace(/[:,;]\s*([.!?।])/g, "$1").replace(/,(\s*,)+/g, ",").replace(/([.!?।:])\s*,/g, "$1").replace(/([.!?।])(\s*[.,])+/g, "$1").replace(/^[,\s]+/, "").trim();
    var cut = t.length > 900;
    if (cut) { t = t.slice(0, 900).replace(/[^.!?।]*$/, ""); }
    return { text: t, cut: cut };
  }
  var SAY_MORE = { en: " I've put the full details in the chat.", hinglish: " Baaki details maine chat mein likh di hain.", hi: " बाकी जानकारी चैट में लिख दी है।" };
  var OPENERS = { en: ["Sure.", "Okay, so,", "Good question.", ""], hinglish: ["Achha,", "Dekhiye,", "Theek hai, toh", ""], hi: ["अच्छा,", "देखिए,", ""] }, turnNo = 0;
  function opener(kind, t) {
    if (/^(hi|hey|hello|namaste|sorry|yes|no|haan|nahi)\b/i.test(t)) return "";
    var o = OPENERS[kind] || OPENERS.en; return o[(turnNo++) % o.length];
  }
  function spokenSummary(t, kind) {
    var sents = t.match(/[^.!?।]+[.!?।]+|[^.!?।]+$/g) || [t], out = "", i = 0;
    for (; i < sents.length; i++) { var nx = (out + " " + sents[i].trim()).trim(); if (out && (nx.length > 320 || i >= 4)) break; out = nx; }
    if (out.length > 420) out = out.slice(0, 400).replace(/\s+\S*$/, "") + ".";
    var op = opener(kind, out); if (op) out = op + " " + (/[.!?।]$/.test(op) || /^[A-Z]{2}|^[A-Z][a-z]*[A-Z]|^I\b/.test(out) ? out : out.charAt(0).toLowerCase() + out.slice(1));
    return i < sents.length ? out + (SAY_MORE[kind] || SAY_MORE.en) : out;
  }
  function chunks(t) {
    var parts = t.match(/[^.!?।\n]+[.!?।]*|\S+/g) || [], out = [], cur = "";
    // one utterance per sentence (natural breathing pauses); very short sentences are merged
    parts.forEach(function (p) { p = p.trim(); if (!p) return; if (cur && (cur.length >= 55 || (cur + " " + p).length > 190)) { out.push(cur); cur = p; } else cur = cur ? cur + " " + p : p; });
    if (cur) out.push(cur);
    return out;
  }

  /* ---------------- UI ---------------- */
  var mic = document.createElement("button");
  mic.type = "button"; mic.className = "bot-mic"; mic.setAttribute("aria-label", "Talk to FODO AI (voice mode)"); mic.setAttribute("aria-pressed", "false"); mic.title = "Talk to FODO AI";
  mic.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 1 0-7 0v6A3.5 3.5 0 0 0 12 15zm6-3.5a1 1 0 1 0-2 0 4 4 0 0 1-8 0 1 1 0 1 0-2 0 6 6 0 0 0 5 5.91V20H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.59a6 6 0 0 0 5-5.91z"/></svg>';
  var send = form.querySelector('button[type="submit"]'); form.insertBefore(mic, send);

  var bar = document.createElement("div");
  bar.className = "bot-voice"; bar.hidden = true; bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "Voice conversation");
  bar.innerHTML =
    '<div class="bv-top"><span class="bv-state" data-s="ready"><i class="bv-wave" aria-hidden="true"><b></b><b></b><b></b><b></b><b></b></i><span class="bv-label" aria-live="polite">Ready</span><span class="bv-time" aria-hidden="true"></span></span>' +
    '<span class="bv-opts"><label class="skip" for="bv-voice">Voice</label><select id="bv-voice" class="bv-voice-sel" aria-label="Reading voice"></select><button type="button" class="bv-lang" aria-label="Speech language"></button></span></div>' +
    '<p class="bv-cap" aria-live="polite"></p>' +
    '<div class="bv-ctrl"><button type="button" class="bv-btn" data-a="mute" aria-pressed="false">Mute mic</button><button type="button" class="bv-btn" data-a="stop" disabled>Stop speaking</button><button type="button" class="bv-btn end" data-a="end">End voice</button></div>' +
    '<p class="bv-note"></p>';
  form.parentNode.insertBefore(bar, form);
  var $ = function (s) { return bar.querySelector(s); };
  var stateEl = $(".bv-state"), labelEl = $(".bv-label"), capEl = $(".bv-cap"), langBtn = $(".bv-lang"), noteEl = $(".bv-note");
  var timeEl = $(".bv-time"), voiceSel = $(".bv-voice-sel");
  function curKind() { return LANGS[langIdx].code === "hi-IN" ? "hi" : (S.lastKind || "en"); }
  function paintVoices() {
    var kind = curKind() === "hi" ? "hi" : "en", list = candidates(kind).slice(0, 8), cur = voiceFor(kind);
    voiceSel.hidden = list.length < 2;
    voiceSel.innerHTML = list.map(function (c) { return '<option value="' + esc(c.v.name) + '"' + (cur && cur.name === c.v.name ? " selected" : "") + ">" + esc(humanName(c.v)) + (c === list[0] ? " ★" : "") + "</option>"; }).join("");
  }
  voiceSel.addEventListener("change", function () {
    var kind = curKind() === "hi" ? "hi" : "en"; chosen[kind] = voiceSel.value; if (kind === "en") chosen.hinglish = voiceSel.value;
    try { localStorage.setItem("fodo-voice-pick", JSON.stringify(chosen)); } catch (_) {}
    if (TTS && S.active && S.state !== "speaking") { try { TTS.cancel(); var u = new SpeechSynthesisUtterance(kind === "hi" ? "यह आवाज़ कैसी लगी?" : "Hi, this is how I'll sound."); var v = voiceFor(kind); u.voice = v; u.lang = v.lang; TTS.speak(u); } catch (_) {} }
  });
  var muteBtn = $('[data-a="mute"]'), stopBtn = $('[data-a="stop"]'), endBtn = $('[data-a="end"]');

  var LANGS = [{ code: "en-IN", label: "EN / Hinglish" }, { code: "hi-IN", label: "हिंदी" }];
  var langIdx = /^hi/i.test(navigator.language || "") ? 1 : 0;
  try { var saved = sessionStorage.getItem("fodo-voice-lang"); if (saved) langIdx = saved === "hi-IN" ? 1 : 0; } catch (_) {}
  function paintLang() { langBtn.textContent = LANGS[langIdx].label; langBtn.setAttribute("aria-label", "Speech language: " + LANGS[langIdx].label + ". Press to switch."); }
  paintLang();

  var S = { active: false, state: "ready", muted: false, provider: null, rec: null, pending: false, timer: 0, maxTimer: 0, misses: 0, speakingQ: 0, hiNoticed: false, t0: 0, clock: 0, keep: 0, lock: null, commit: 0 };
  var UA = navigator.userAgent || "", MOBILE = /Android|iPhone|iPad|iPod/i.test(UA) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(UA));
  var CONTINUOUS = !MOBILE;                 // desktop: one long session per turn (no cut-offs on pauses); mobile: short sessions (continuous mode is buggy there)
  var END_SILENCE = 1300;                   // ms of silence that ends the visitor's turn (desktop)
  function setState(s, text) {
    S.state = s; stateEl.setAttribute("data-s", s); labelEl.textContent = text || LABEL[s] || s;
    stopBtn.disabled = s !== "speaking"; mic.setAttribute("data-s", s);
    mic.setAttribute("aria-label", S.active ? (s === "speaking" ? "Interrupt and speak" : "Voice mode on, press to end") : "Talk to FODO AI (voice mode)");
    if (window.FODO_MASCOT) { try { FODO_MASCOT.set(s === "thinking" ? "think" : s === "speaking" ? "happy" : "idle"); } catch (_) {} }
  }
  function caption(who, text) { capEl.innerHTML = text ? "<b>" + esc(who) + ":</b> " + esc(text) : ""; }
  function botNote(html) { ui.add(html, "bot"); }

  /* ---------------- shared lifecycle ---------------- */
  function begin(provider) {
    S.active = true; S.provider = provider; S.muted = false; S.misses = 0; S.hiNoticed = false;
    bar.hidden = false; mic.setAttribute("aria-pressed", "true"); mic.classList.add("on");
    muteBtn.setAttribute("aria-pressed", "false"); muteBtn.textContent = "Mute mic";
    langBtn.hidden = provider.name !== "browser";
    noteEl.textContent = provider.note;
    clearTimeout(S.maxTimer); S.maxTimer = setTimeout(function () { end("Voice mode ended after " + Math.round(MAX_MS / 60000) + " minutes. Press the mic to start again."); }, MAX_MS);
    S.t0 = Date.now(); clearInterval(S.clock); timeEl.textContent = "0:00"; paintVoices(); if (TTS) setTimeout(paintVoices, 1000);
    S.clock = setInterval(function () { var s2 = Math.floor((Date.now() - S.t0) / 1000); timeEl.textContent = Math.floor(s2 / 60) + ":" + String(s2 % 60).padStart(2, "0"); }, 1000);
    try { if (navigator.wakeLock) navigator.wakeLock.request("screen").then(function (l) { S.lock = l; }, function () {}); } catch (_) {}
  }
  function end(msg) {
    if (!S.active && S.state === "ended") return;
    S.active = false; S.pending = false; clearTimeout(S.timer); clearTimeout(S.maxTimer); clearTimeout(S.commit); clearInterval(S.clock); clearInterval(S.keep);
    try { S.lock && S.lock.release(); } catch (_) {} S.lock = null;
    try { S.provider && S.provider.stop(); } catch (_) {}
    S.provider = null;
    setState("ended"); caption("", ""); mic.setAttribute("aria-pressed", "false"); mic.classList.remove("on");
    if (msg) botNote(esc(msg));
    setTimeout(function () { if (!S.active) { bar.hidden = true; setState("ready"); } }, 1600);
  }
  function fail(html) { var was = S.active; end(); botNote(html); if (!was) setState("ready"); }
  var typeInstead = ' You can keep typing your question below, the text chat works the same.';

  /* ---------------- provider: BROWSER (free) ---------------- */
  var browserProvider = {
    name: "browser",
    note: "Speech-to-text runs through your browser's speech service (in Chrome this uses Google's servers). FODO doesn't record or store audio.",
    supported: function () { return !!SR && window.isSecureContext !== false; },
    start: function () { greet(); },
    stop: function () { stopRec(); if (TTS) TTS.cancel(); },
    mute: function (m) { if (m) { stopRec(); setState("muted"); } else listen(); },
    stopSpeaking: function () { clearInterval(S.keep); clearTimeout(S.timer); S.speakingQ = 0; if (TTS) TTS.cancel(); listen(); }
  };
  var GREET = { en: "Hi, I'm FODO. I'm listening, what would you like help with?", hinglish: "Haan ji, main FODO. Boliye, main sun raha hoon, kis cheez mein madad chahiye?", hi: "नमस्ते, मैं FODO हूँ। बोलिए, मैं सुन रहा हूँ: किस चीज़ में मदद चाहिए?" };
  function greet() {
    var kind = LANGS[langIdx].code === "hi-IN" ? (voiceFor("hi") ? "hi" : "hinglish") : (/^hi/i.test(navigator.language || "") ? "hinglish" : "en");
    var line = GREET[kind];
    caption("FODO", line);
    sayText(line, kind, true);
  }
  function stopRec() { var r = S.rec; S.rec = null; if (r) { r.onresult = r.onend = r.onerror = null; try { r.abort(); } catch (_) {} } }
  function listen() {
    if (!S.active || S.provider !== browserProvider) return;
    if (S.muted) { setState("muted"); return; }
    stopRec(); clearTimeout(S.commit);
    var r; try { r = new SR(); } catch (err) { fail("Voice input couldn't start in this browser." + typeInstead); return; }
    S.rec = r; r.lang = LANGS[langIdx].code; r.interimResults = true; r.continuous = CONTINUOUS; r.maxAlternatives = 1;
    var finals = "", interim = "", done = false;
    var commit = function () {
      if (done || S.rec !== r) return; done = true; clearTimeout(S.commit);
      var q = (finals + " " + interim).replace(/\s+/g, " ").trim();
      stopRec(); stateEl.classList.remove("loud");
      if (q) { S.misses = 0; ask(q); } else listen();
    };
    r.onresult = function (ev) {
      finals = ""; interim = "";
      for (var i = 0; i < ev.results.length; i++) { var t = ev.results[i][0].transcript; if (ev.results[i].isFinal) finals += t + " "; else interim += t; }
      stateEl.classList.add("loud"); labelEl.textContent = "Listening…"; caption("You", (finals + interim).trim());
      if (CONTINUOUS) { clearTimeout(S.commit); S.commit = setTimeout(commit, interim ? END_SILENCE + 400 : END_SILENCE); }
    };
    r.onspeechend = function () { stateEl.classList.remove("loud"); };
    r.onerror = function (ev) {
      var e = ev && ev.error;
      if (e === "no-speech" || e === "aborted") return;                       // handled in onend
      S.rec = null;
      if (e === "not-allowed" || e === "service-not-allowed") fail("Microphone access is blocked. Allow the mic for fodo.co.in in your browser's site settings (🔒 icon in the address bar), then press the mic again." + typeInstead);
      else if (e === "audio-capture") fail("No microphone was found on this device." + typeInstead);
      else if (e === "network") fail("The browser's speech service couldn't be reached, check your internet connection." + typeInstead);
      else if (e === "language-not-supported") { langIdx = 0; paintLang(); setTimeout(listen, 200); }
      else fail("Voice input stopped unexpectedly (" + esc(e || "unknown") + ")." + typeInstead);
    };
    r.onend = function () {
      stateEl.classList.remove("loud");
      if (S.rec !== r || !S.active || done) return;
      if ((finals + interim).trim()) { commit(); return; }
      S.rec = null;
      if (S.muted) return;
      if (++S.misses >= 3) { end("I didn't hear anything for a while, so voice mode has ended. Press the mic whenever you want to talk again."); return; }
      setState("listening", S.misses === 2 ? "Still here, go ahead…" : "Listening…"); setTimeout(listen, 150);
    };
    try { r.start(); setState("listening"); }
    catch (err) { S.rec = null; setTimeout(listen, 400); }
  }
  function ask(q) {
    setState("thinking"); caption("You", q); S.pending = true;
    clearTimeout(S.timer);
    S.timer = setTimeout(function () { if (S.pending) { S.pending = false; setState("ready", "No reply yet, try again"); setTimeout(listen, 900); } }, 30000);
    B.ask(q);                                                                    // same pipeline as a typed message
  }
  document.addEventListener("fodo:bot-reply", function (ev) {
    if (!S.active || !S.pending || S.provider !== browserProvider) return;
    S.pending = false; clearTimeout(S.timer);
    var el = ev.detail && ev.detail.el; if (!el) { listen(); return; }
    speak(el);
  });
  function speak(el) {
    var sp = speakable(el), kind = langOf(sp.text); S.lastKind = kind === "hi" ? "hi" : "en";
    if (!sp.text) { listen(); return; }
    var line = spokenSummary(sp.text, kind);
    caption("FODO", line.length > 170 ? line.slice(0, 170) + "…" : line);
    sayText(line, kind, false);
  }
  function whenVoicesReady(cb) {
    loadVoices(); if (!TTS || voices.length) { cb(); return; }
    var doneV = false, go = function () { if (doneV) return; doneV = true; loadVoices(); cb(); };
    try { TTS.addEventListener("voiceschanged", go, { once: true }); } catch (_) {}
    setTimeout(go, 900);
  }
  function sayText(text, kind, isGreeting) {
    whenVoicesReady(function () {
      if (!S.active) return;
      var v = TTS ? voiceFor(kind) : null;
      if (!TTS || !v) {
        if (!S.hiNoticed && !isGreeting) { S.hiNoticed = true; botNote(kind === "hi" ? "This device has no Hindi voice installed, so I'll show answers as text while voice input keeps working." : "This browser can't read answers aloud, so I'll show them as text while voice input keeps working."); }
        listen(); return;
      }
      var parts = chunks(text);
      try { TTS.cancel(); } catch (_) {}
      if (kind !== "hi" && !voiceFor("hi")) parts = parts.filter(function (p) { return !/[ऀ-ॿ]/.test(p); });
      if (!parts.length) { listen(); return; }
      S.speakingQ = parts.length; setState("speaking");
      var finished = function () { clearInterval(S.keep); if (S.active && S.state === "speaking") setTimeout(listen, 350); };
      try {
        parts.forEach(function (p) {
          var pv = v; if (/[ऀ-ॿ]/.test(p)) { var hv = voiceFor("hi"); if (hv) pv = hv; else { S.speakingQ--; return; } }
          var good = quality(pv) >= 9, q = /\?\s*$/.test(p);
          var u = new SpeechSynthesisUtterance(p); try { u.voice = pv; } catch (_) {} u.lang = pv.lang;
          u.rate = good ? (kind === "en" ? 1.0 : 0.97) : (kind === "en" ? 0.94 : 0.9);   // older voices sound far less robotic a bit slower
          u.pitch = good ? 1 : (q ? 1.06 : 1.02) + (Math.random() * 0.04 - 0.02);
          u.onend = u.onerror = function () { if (--S.speakingQ <= 0) finished(); };
          TTS.speak(u);
        });
      } catch (err) { S.speakingQ = 0; try { TTS.cancel(); } catch (_) {} listen(); return; }
      if (S.speakingQ <= 0) { finished(); return; }
      // Chrome can silently pause long speech: nudge it; and never stay stuck in "speaking"
      clearInterval(S.keep); S.keep = setInterval(function () { try { if (TTS.paused) TTS.resume(); } catch (_) {} }, 5000);
      clearTimeout(S.timer); S.timer = setTimeout(function () { if (S.active && S.state === "speaking" && !(TTS.speaking || TTS.pending)) { S.speakingQ = 0; finished(); } }, Math.min(90000, 5000 + text.length * 85));
    });
  }

  /* ---------------- provider: OPENAI REALTIME (optional, paid) ---------------- */
  var rt = { pc: null, dc: null, stream: null, audio: null };
  var realtimeProvider = {
    name: "realtime",
    note: "Your voice is sent to OpenAI's realtime service to generate spoken answers. FODO doesn't record or store audio.",
    start: function () {
      setState("connecting");
      var endpoint = C.voiceSessionEndpoint || "/api/voice-session", ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 12000);
      return fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang: LANGS[langIdx].code, page: document.body.dataset.route || "" }), signal: ctl.signal })
        .then(function (r) { clearTimeout(t); return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || !j.ok || !j.value) { var e = new Error(j.reason || ("HTTP " + r.status)); e.fallback = true; throw e; } return j; }); })
        .then(function (sess) {
          return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(function (stream) {
            if (!S.active) { stream.getTracks().forEach(function (x) { x.stop(); }); return; }
            rt.stream = stream; var pc = rt.pc = new RTCPeerConnection();
            rt.audio = document.createElement("audio"); rt.audio.autoplay = true;
            pc.ontrack = function (e) { rt.audio.srcObject = e.streams[0]; };
            pc.onconnectionstatechange = function () { if (/failed|disconnected|closed/.test(pc.connectionState) && S.active && S.provider === realtimeProvider) fail("The voice connection dropped." + typeInstead); };
            stream.getTracks().forEach(function (tr) { pc.addTrack(tr, stream); });
            var dc = rt.dc = pc.createDataChannel("oai-events");
            dc.onmessage = function (m) { var ev; try { ev = JSON.parse(m.data); } catch (_) { return; } onRealtimeEvent(ev); };
            dc.onopen = function () {
              setState("listening");
              sendRT({ type: "response.create", response: { instructions: LANGS[langIdx].code === "hi-IN" ? "Greet the visitor warmly in one short Hindi sentence as FODO and ask how you can help." : "Greet the visitor in one short sentence as FODO and ask how you can help. If their browser language looks Indian, a light Hinglish tone is fine." } });
            };
            return pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).then(function () {
              return fetch("https://api.openai.com/v1/realtime/calls", { method: "POST", body: pc.localDescription.sdp, headers: { Authorization: "Bearer " + sess.value, "Content-Type": "application/sdp" } });
            }).then(function (r) { if (!r.ok) throw new Error("SDP " + r.status); return r.text(); })
              .then(function (sdp) { return pc.setRemoteDescription({ type: "answer", sdp: sdp }); });
          });
        });
    },
    stop: function () {
      try { rt.dc && rt.dc.close(); } catch (_) {} try { rt.pc && rt.pc.close(); } catch (_) {}
      if (rt.stream) rt.stream.getTracks().forEach(function (x) { x.stop(); });
      if (rt.audio) { rt.audio.srcObject = null; }
      rt = { pc: null, dc: null, stream: null, audio: null };
    },
    mute: function (m) { if (rt.stream) rt.stream.getAudioTracks().forEach(function (x) { x.enabled = !m; }); setState(m ? "muted" : "listening"); },
    stopSpeaking: function () { sendRT({ type: "response.cancel" }); sendRT({ type: "output_audio_buffer.clear" }); setState("listening"); }
  };
  function sendRT(o) { try { if (rt.dc && rt.dc.readyState === "open") rt.dc.send(JSON.stringify(o)); } catch (_) {} }
  var rtBuf = "";
  function onRealtimeEvent(ev) {
    var t = ev.type || "";
    if (t === "input_audio_buffer.speech_started") { setState("listening"); stateEl.classList.add("loud"); }
    else if (t === "input_audio_buffer.speech_stopped") { stateEl.classList.remove("loud"); setState("thinking"); }
    else if (t === "conversation.item.input_audio_transcription.completed" && ev.transcript) { ui.add(esc(ev.transcript.trim()), "me"); caption("You", ev.transcript.trim()); }
    else if (/^response\.(output_)?audio_transcript\.delta$/.test(t)) { rtBuf += ev.delta || ""; caption("FODO", rtBuf.slice(-160)); }
    else if (/^response\.(output_)?audio_transcript\.done$/.test(t)) { var full = (ev.transcript || rtBuf).trim(); rtBuf = ""; if (full) ui.add(esc(full), "bot"); }
    else if (t === "output_audio_buffer.started" || t === "response.output_audio.delta" || t === "response.audio.delta") { if (S.state !== "speaking") setState("speaking"); }
    else if (t === "output_audio_buffer.stopped" || t === "response.done") { if (S.active && !S.muted) setState("listening"); }
    else if (t === "error") { var msg = ev.error && ev.error.message; if (msg && !/cancel/i.test(msg)) noteEl.textContent = "Voice service: " + msg; }
  }

  /* ---------------- start / controls ---------------- */
  function permission() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.resolve();   // SpeechRecognition will prompt itself
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) { s.getTracks().forEach(function (x) { x.stop(); }); });
  }
  function permissionError(err) {
    var n = err && err.name;
    if (n === "NotAllowedError" || n === "SecurityError") return "Microphone permission was denied. To use voice, allow the mic for this site (🔒 icon in the address bar → Microphone → Allow) and press the mic again." + typeInstead;
    if (n === "NotFoundError" || n === "OverconstrainedError") return "No microphone was found on this device." + typeInstead;
    if (n === "NotReadableError") return "Your microphone is being used by another app. Close it and try again." + typeInstead;
    return "Couldn't access the microphone." + typeInstead;
  }
  function startBrowser() {
    if (!browserProvider.supported()) {
      botNote("Voice input isn't supported in this browser (it works in Chrome, Edge and Safari on most devices)." + typeInstead);
      setTimeout(function () { ui.inp.focus(); }, 50); return;
    }
    setState("connecting", "Waiting for mic permission…"); bar.hidden = false;
    permission().then(function () { begin(browserProvider); browserProvider.start(); }, function (err) { bar.hidden = true; setState("ready"); botNote(permissionError(err)); });
  }
  function start() {
    if (box.hidden && B.open) B.open();
    if (TTS) { try { TTS.cancel(); var w = new SpeechSynthesisUtterance(" "); w.volume = 0; TTS.speak(w); } catch (_) {} }
    if (C.voiceProvider === "openai-realtime" && window.RTCPeerConnection && navigator.mediaDevices) {
      begin(realtimeProvider);
      realtimeProvider.start().catch(function (err) {
        try { realtimeProvider.stop(); } catch (_) {}
        S.active = false; clearTimeout(S.maxTimer);
        if (err && err.name === "NotAllowedError") { bar.hidden = true; setState("ready"); botNote(permissionError(err)); return; }
        noteEl.textContent = "";
        botNote(err && err.fallback ? "Live AI voice isn't set up yet, so I'm using your browser's free voice mode instead." : "Live AI voice couldn't connect, so I'm using your browser's free voice mode instead.");
        startBrowser();
      });
      return;
    }
    startBrowser();
  }
  mic.addEventListener("click", function () {
    if (!S.active) { start(); return; }
    if (S.state === "speaking") { S.provider.stopSpeaking(); return; }               // tap to interrupt
    end("Voice mode ended.");
  });
  muteBtn.addEventListener("click", function () {
    if (!S.active) return; S.muted = !S.muted;
    muteBtn.setAttribute("aria-pressed", String(S.muted)); muteBtn.textContent = S.muted ? "Unmute mic" : "Mute mic";
    S.provider.mute(S.muted);
  });
  stopBtn.addEventListener("click", function () { if (S.active && S.state === "speaking") S.provider.stopSpeaking(); });
  endBtn.addEventListener("click", function () { end("Voice mode ended."); });
  langBtn.addEventListener("click", function () {
    langIdx = (langIdx + 1) % LANGS.length; paintLang();
    try { sessionStorage.setItem("fodo-voice-lang", LANGS[langIdx].code); } catch (_) {}
    paintVoices();
    if (S.active && S.provider === browserProvider && S.state === "listening") listen();
  });
  // end cleanly when the chat closes or the tab is hidden
  new MutationObserver(function () { if (box.hidden && S.active) end(); }).observe(box, { attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("visibilitychange", function () { if (document.hidden && S.active) end("Voice mode paused because the tab was hidden."); });
  addEventListener("pagehide", function () { if (S.active) end(); });

  window.FODO_VOICE = { version: "2026.10.25", state: function () { return { active: S.active, state: S.state, muted: S.muted, provider: S.provider && S.provider.name, lang: LANGS[langIdx].code }; }, langOf: langOf, end: end, debug: { summary: spokenSummary, speakable: function (html) { var d = document.createElement("div"); d.innerHTML = html; return speakable(d).text; } } };
})();
