/* FODO BRAIN — live conversation with Gemini Live (speech in → speech out, like talking to a person).
   1. GET /api/owner-brain/live → a single-use token minted by our server (the Gemini key never reaches the page).
   2. WebSocket straight to Google: microphone → 16 kHz PCM chunks every ~100 ms; Gemini's voice ← 24 kHz PCM, played gap-free
      through the shared AudioContext (works on iPhone once the mic tap unlocked it).
   3. Gemini decides when you've finished speaking, and stops instantly when you talk over it ("interrupted").
   4. When it needs FODO (numbers, tasks, posting, website, any action) it calls the fodo_brain tool → we run the Brain's normal
      /chat (all permissions + confirmations) → hand the answer back → Gemini says it in your language.
   Events: state (connecting|listening|thinking|speaking|closed) · level (0..1) · you (text) · fodo (text) · brain (chat result)
           error (message) · closed. */
(function () {
  "use strict";
  var E = {}, L = { ws: null, active: false, ac: null, next: 0, srcs: [], an: null, chunk: [], chunkLen: 0, playing: false, youText: "", fodoText: "", pendingTools: 0, outLvl: 0, frameFn: null, levelLoop: false, sessionStart: 0 };
  function emit(n, x) { (E[n] || []).forEach(function (f) { try { f(x); } catch (e) {} }); }
  function b64(bytes) { var bin = "", CH = 0x8000; for (var i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH)); return btoa(bin); }
  function unb64(s) { var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function send(o) { if (L.ws && L.ws.readyState === 1) L.ws.send(JSON.stringify(o)); }

  /* microphone → 16 kHz PCM16 → ~100 ms chunks */
  function onFrame(fr) {
    if (!L.active || !L.ready) return;
    var f = fr.f, ratio = fr.sr / 16000, n = Math.floor(f.length / ratio), out = new Int16Array(n);
    var gate = L.playing && fr.rms < 0.055;   // while FODO talks, only clear speech gets through (its own voice from the speaker doesn't)
    for (var i = 0; i < n; i++) { var s0 = Math.floor(i * ratio), s1 = Math.floor((i + 1) * ratio), acc = 0; for (var k = s0; k < s1; k++) acc += f[k]; var v = gate ? 0 : acc / Math.max(1, s1 - s0); out[i] = Math.max(-1, Math.min(1, v)) * 0x7fff; }
    L.chunk.push(out); L.chunkLen += n;
    if (L.chunkLen >= 1600) { var all = new Int16Array(L.chunkLen), o = 0; L.chunk.forEach(function (c) { all.set(c, o); o += c.length; }); L.chunk = []; L.chunkLen = 0;
      send({ realtimeInput: { audio: { data: b64(new Uint8Array(all.buffer)), mimeType: "audio/pcm;rate=16000" } } }); }
  }
  /* Gemini's voice: 24 kHz PCM16 → scheduled back-to-back */
  function play(data, rate) {
    var ac = L.ac; if (!ac) return; var bytes = unb64(data), pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 1), buf = ac.createBuffer(1, pcm.length, rate || 24000), ch = buf.getChannelData(0);
    for (var i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
    var src = ac.createBufferSource(); src.buffer = buf; src.connect(L.an);
    var at = Math.max(ac.currentTime + 0.04, L.next); src.start(at); L.next = at + buf.duration; L.srcs.push(src);
    src.onended = function () { L.srcs = L.srcs.filter(function (x) { return x !== src; }); if (!L.srcs.length) { L.playing = false; if (L.turnDone && !L.pendingTools) emit("state", "listening"); } };
    if (!L.playing) { L.playing = true; emit("state", "speaking"); }
  }
  function flush() { L.srcs.forEach(function (s) { try { s.onended = null; s.stop(); } catch (e) {} }); L.srcs = []; L.next = 0; L.playing = false; }
  function levelLoop() { if (L.levelLoop) return; L.levelLoop = true; var data = new Uint8Array(128); (function loop() { if (!L.active) { L.levelLoop = false; return; } if (L.an) { L.an.getByteFrequencyData(data); var s = 0; for (var k = 2; k < 48; k++) s += data[k]; L.outLvl = Math.min(1, s / (46 * 140)); if (L.playing) emit("level", L.outLvl); } requestAnimationFrame(loop); })(); }

  function handle(m) {
    if (m.setupComplete) { L.ready = true; emit("state", "listening"); if (L.firstText) { send({ clientContent: { turns: [{ role: "user", parts: [{ text: L.firstText }] }], turnComplete: true } }); L.firstText = null; emit("state", "thinking"); } return; }
    var sc = m.serverContent;
    if (sc) {
      if (sc.interrupted) { flush(); L.fodoText = ""; emit("state", "listening"); }
      if (sc.inputTranscription && sc.inputTranscription.text) { if (L.turnDone) { L.youText = ""; L.turnDone = false; } L.youText += sc.inputTranscription.text; emit("you", L.youText.trim()); }
      if (sc.outputTranscription && sc.outputTranscription.text) { L.fodoText += sc.outputTranscription.text; emit("fodo", L.fodoText.trim()); }
      if (sc.modelTurn && sc.modelTurn.parts) sc.modelTurn.parts.forEach(function (p) { if (p.inlineData && /audio\/pcm/.test(p.inlineData.mimeType || "")) play(p.inlineData.data, +((/rate=(\d+)/.exec(p.inlineData.mimeType) || [])[1]) || 24000); });
      if (sc.turnComplete) { L.turnDone = true; L.fodoText = ""; if (!L.playing && !L.pendingTools) emit("state", "listening"); }
    }
    if (m.toolCall && m.toolCall.functionCalls) m.toolCall.functionCalls.forEach(function (fc) {
      L.pendingTools++; emit("state", "thinking");
      var req = (fc.args && (fc.args.request || fc.args.query)) || "";
      Promise.resolve(L.tool ? L.tool(req) : { answer: "FODO Brain is not available." }).then(function (r) {
        L.pendingTools--; emit("brain", r);
        var resp = { result: String((r && r.answer) || "No answer.").slice(0, 3500) };
        if (r && r.actions && r.actions.length) resp.needs_confirmation = r.actions.map(function (a) { return String(a.preview || "").split("\n")[0]; }).join("; ") + " — tell him to tap Confirm on the screen.";
        send({ toolResponse: { functionResponses: [{ id: fc.id, name: fc.name, response: resp }] } });
      }, function (e) { L.pendingTools--; send({ toolResponse: { functionResponses: [{ id: fc.id, name: fc.name, response: { error: String(e && e.message || e) } }] } }); });
    });
    if (m.toolCallCancellation) { /* the answer may still arrive; Gemini ignores it */ }
    if (m.goAway) { L.reconnect = true; }
    if (m.error) emit("error", (m.error.message || "Gemini error"));
  }

  function start(opt) {
    opt = opt || {}; if (L.active) return Promise.resolve(true);
    if (!window.FodoVoice) { emit("error", "voice engine missing"); return Promise.resolve(false); }
    L.active = true; L.ready = false; L.turnDone = true; L.youText = L.fodoText = ""; L.firstText = opt.text || null; L.tool = opt.tool; emit("state", "connecting");
    return FodoVoice.start().then(function (ok) {
      if (!ok) throw new Error("mic");
      L.ac = FodoVoice.context(); L.an = L.ac.createAnalyser(); L.an.fftSize = 256; L.an.connect(L.ac.destination);
      FodoVoice.pauseVad(true);
      if (!L.frameFn) { L.frameFn = onFrame; FodoVoice.on("frame", function (fr) { if (L.frameFn) L.frameFn(fr); }); FodoVoice.on("level", function (v) { if (L.active && !L.playing) emit("level", v); }); }
      return fetch("/api/owner-brain/live" + (opt.voice ? "?voice=" + encodeURIComponent(opt.voice) : ""), { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json(); });
    }).then(function (t) {
      if (!t || !t.ok) throw new Error((t && t.reason) || "no token");
      if (!L.active) return false;
      return new Promise(function (resolve, reject) {
        var ws = new WebSocket(t.ws); L.ws = ws; L.sessionStart = Date.now(); var opened = false;
        ws.onopen = function () { opened = true; send({ setup: t.setup }); levelLoop(); resolve(true); };
        ws.onmessage = function (ev) { var go = function (txt) { var m; try { m = JSON.parse(txt); } catch (e) { return; } handle(m); }; if (typeof ev.data === "string") go(ev.data); else if (ev.data && ev.data.text) ev.data.text().then(go); else if (ev.data instanceof ArrayBuffer) go(new TextDecoder().decode(ev.data)); };
        ws.onerror = function () { if (!opened) reject(new Error("Couldn't connect to Gemini Live.")); };
        ws.onclose = function (ev) { var was = L.active; L.ws = null; if (!opened) return reject(new Error("Gemini Live closed: " + (ev.reason || ev.code))); if (was) { var why = ev.reason || ("code " + ev.code); stop(true); emit("closed", why); } };
      });
    }).catch(function (e) { stop(true); emit("error", e.message === "mic" ? "mic" : String(e.message || e)); return false; });
  }
  function stop(keepMic) {
    var was = L.active; L.active = false; L.ready = false; flush();
    if (L.ws) { try { L.ws.close(1000, "bye"); } catch (e) {} L.ws = null; }
    if (window.FodoVoice) FodoVoice.pauseVad(false);
    if (was) emit("state", "closed");
  }
  function say(text) { if (L.active && L.ready) { send({ clientContent: { turns: [{ role: "user", parts: [{ text: text }] }], turnComplete: true } }); emit("state", "thinking"); } }
  window.FodoLive = { on: function (n, f) { (E[n] = E[n] || []).push(f); }, start: start, stop: stop, say: say, isActive: function () { return L.active; }, isSpeaking: function () { return L.playing; }, interrupt: function () { flush(); } };
})();
