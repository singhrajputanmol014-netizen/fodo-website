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
  function sendText(t) { send({ realtimeInput: { text: String(t) } }); }   // the current Live API way to type into a running voice session
  function send(o) { if (L.ws && L.ws.readyState === 1) L.ws.send(JSON.stringify(o)); }

  /* group mode: answer only when addressed ("FODO …"), or as a follow-up right after FODO answered, or for injected text */
  var WAKE = /(?:^|[^a-z])(fodo|phodo|fodu|foodo|fordo|fodo's|fo do|photo|podo|vodo)(?![a-z])|फोडो|फ़ोडो|फोदो|फ़ोदो|फोटो/i;
  function allowed() { return L.mode !== "wake" || L.injected || L.pendingTools > 0 || Date.now() < (L.followUntil || 0) || WAKE.test(L.youText || ""); }
  /* microphone → 16 kHz PCM16 → ~100 ms chunks */
  function onFrame(fr) {
    if (!L.active || !L.ready) return;
    var f = fr.f, ratio = fr.sr / 16000, n = Math.floor(f.length / ratio), out = new Int16Array(n);
    // while FODO talks, its own voice leaking from the speaker is held back, but your voice still gets through (so you can interrupt):
    // the gate follows the leak level during playback instead of a fixed loud threshold (v31; was 0.055 — too deaf on phones)
    if (L.playing) L.pb = L.pb ? L.pb * 0.97 + fr.rms * 0.03 : fr.rms; else L.pb = 0;
    var gate = L.playing && fr.rms < Math.max(0.018, L.pb * 1.7);
    for (var i = 0; i < n; i++) { var s0 = Math.floor(i * ratio), s1 = Math.floor((i + 1) * ratio), acc = 0; for (var k = s0; k < s1; k++) acc += f[k]; var v = gate ? 0 : acc / Math.max(1, s1 - s0); out[i] = Math.max(-1, Math.min(1, v)) * 0x7fff; }
    L.chunk.push(out); L.chunkLen += n;
    if (L.chunkLen >= 1600) { var all = new Int16Array(L.chunkLen), o = 0; L.chunk.forEach(function (c) { all.set(c, o); o += c.length; }); L.chunk = []; L.chunkLen = 0;
      send({ realtimeInput: { audio: { data: b64(new Uint8Array(all.buffer)), mimeType: "audio/pcm;rate=16000" } } }); L.sent++; }
    L.mic = Math.max(L.mic * .9, fr.rms);
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
    L.recv++; L.last = Object.keys(m)[0] || ""; if (m.serverContent) L.last = Object.keys(m.serverContent).join("+");
    if (m.setupComplete) { L.ready = true; L.fails = 0; clearTimeout(L.setupTimer); emit("ready", true); emit("state", "listening"); if (L.firstText) { sendText(L.firstText); L.firstText = null; L.injected = true; emit("state", "thinking"); } return; }
    if (m.sessionResumptionUpdate && m.sessionResumptionUpdate.newHandle && m.sessionResumptionUpdate.resumable !== false) L.handle = m.sessionResumptionUpdate.newHandle;
    var sc = m.serverContent;
    if (sc) {
      if (sc.interrupted) { flush(); if (L.fodoText.trim()) emit("turn", { role: "fodo", text: L.fodoText.trim() + " …" }); L.fodoText = ""; L.drop = false; emit("state", "listening"); }
      if (sc.inputTranscription && sc.inputTranscription.text) { if (L.turnDone) { L.youText = ""; L.turnDone = false; } L.youText += sc.inputTranscription.text; emit("you", L.youText.trim()); }
      if (sc.outputTranscription && sc.outputTranscription.text) { L.fodoText += sc.outputTranscription.text; emit("fodo", L.fodoText.trim()); }
      if (sc.modelTurn && sc.modelTurn.parts) { if (L.turnAllowed == null) L.turnAllowed = allowed(); if (!L.turnAllowed) L.drop = true;
        sc.modelTurn.parts.forEach(function (p) { if (!L.drop && p.inlineData && /audio\/pcm/.test(p.inlineData.mimeType || "")) play(p.inlineData.data, +((/rate=(\d+)/.exec(p.inlineData.mimeType) || [])[1]) || 24000); }); }
      if (sc.turnComplete) { var said = L.fodoText.trim(), heard = L.youText.trim();
        if (heard) emit("turn", { role: "you", text: heard, ignored: !!L.drop });
        if (said && !L.drop) { emit("turn", { role: "fodo", text: said }); L.followUntil = Date.now() + 20000; }
        if (L.drop) emit("ignored", heard);
        L.turnDone = true; L.fodoText = ""; L.drop = false; L.turnAllowed = null; L.injected = false; if (!L.playing && !L.pendingTools) emit("state", "listening"); }
    }
    if (m.toolCall && m.toolCall.functionCalls) m.toolCall.functionCalls.forEach(function (fc) {
      if (!allowed()) { send({ toolResponse: { functionResponses: [{ id: fc.id, name: fc.name, response: { result: "This was not said to you (no 'FODO'). Stay silent." } }] } }); L.drop = true; return; }
      L.pendingTools++; L.followUntil = Date.now() + 60000; emit("state", "thinking");
      var req = (fc.args && (fc.args.request || fc.args.query)) || "";
      Promise.resolve(L.tool ? L.tool(req) : { answer: "FODO Brain is not available." }).then(function (r) {
        L.pendingTools--; emit("brain", r);
        var resp = { result: String((r && r.answer) || "No answer.").slice(0, 3500) };
        if (r && r.actions && r.actions.length) resp.needs_confirmation = r.actions.map(function (a) { return String(a.preview || "").split("\n")[0]; }).join("; ") + " — tell him to tap Confirm on the screen.";
        send({ toolResponse: { functionResponses: [{ id: fc.id, name: fc.name, response: resp }] } });
      }, function (e) { L.pendingTools--; send({ toolResponse: { functionResponses: [{ id: fc.id, name: fc.name, response: { error: String(e && e.message || e) } }] } }); });
    });
    if (m.toolCallCancellation) { /* the answer may still arrive; Gemini ignores it */ }
    if (m.goAway) { reconnect("goAway"); }   // Google ends every connection after a while: continue seamlessly with the resumption handle
    if (m.error) emit("error", (m.error.message || "Gemini error"));
  }

  function start(opt) {
    opt = opt || {}; if (L.active) return Promise.resolve(true);
    if (!window.FodoVoice) { emit("error", "voice engine missing"); return Promise.resolve(false); }
    L.active = true; L.ready = false; L.turnDone = true; L.sent = 0; L.recv = 0; L.mic = 0; L.last = ""; L.youText = L.fodoText = ""; L.firstText = opt.text || null; L.tool = opt.tool; L.mode = opt.mode === "wake" ? "wake" : "chat"; L.voice = opt.voice || ""; L.handle = null; L.lite = false; L.fails = 0; L.reconnects = 0; L.followUntil = 0; L.drop = false; L.turnAllowed = null; emit("state", "connecting");
    return FodoVoice.start().then(function (ok) {
      if (!ok) throw new Error("mic");
      L.ac = FodoVoice.context(); L.an = L.ac.createAnalyser(); L.an.fftSize = 256; L.an.connect(L.ac.destination);
      FodoVoice.pauseVad(true);
      if (!L.frameFn) { L.frameFn = onFrame; FodoVoice.on("frame", function (fr) { if (L.frameFn) L.frameFn(fr); }); FodoVoice.on("level", function (v) { if (L.active && !L.playing) emit("level", v); }); }
      return connect();
    }).catch(function (e) { stop(true); emit("error", e.message === "mic" ? "mic" : String(e.message || e)); return false; });
  }
  function tokenUrl() { var q = ["mode=" + encodeURIComponent(L.mode)]; if (L.voice) q.push("voice=" + encodeURIComponent(L.voice)); if (L.handle) q.push("handle=" + encodeURIComponent(L.handle)); if (L.lite) q.push("lite=1"); return "/api/owner-brain/live?" + q.join("&"); }
  /* a (re)connection: fresh single-use token; with a resumption handle Gemini continues the SAME conversation */
  function connect() {
    return fetch(tokenUrl(), { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json(); }).then(function (t) {
      if (!t || !t.ok) throw new Error((t && t.reason) || "no token");
      if (!L.active) return false; L.tier = t.tier;
      return new Promise(function (resolve, reject) {
        var ws = new WebSocket(t.ws); L.ws = ws; L.sessionStart = Date.now(); var opened = false;
        ws.onopen = function () { opened = true; send({ setup: t.setup }); levelLoop(); clearInterval(L.diagT); L.diagT = setInterval(function () { if (!L.active) { clearInterval(L.diagT); return; } emit("diag", { ready: L.ready, sent: L.sent, recv: L.recv, mic: L.mic, last: L.last, model: t.model, playing: L.playing, tier: L.tier, mode: L.mode, resumable: !!L.handle, reconnects: L.reconnects }); }, 700); L.setupTimer = setTimeout(function () { if (L.active && !L.ready && ws === L.ws) {
          if (!L.lite && L.tier !== "basic") { L.lite = true; L.handle = null; L.ws = null; ws.onclose = null; try { ws.close(1000, "lite"); } catch (e) {} connect().catch(function (e) { stop(true); emit("error", String(e.message || e)); }); return; }
          L.why = "Gemini didn't accept the voice session (no reply in 10 s)."; stop(true); emit("error", L.why); } }, 10000); resolve(true); };
        ws.onmessage = function (ev) { var go = function (txt) { var m; try { m = JSON.parse(txt); } catch (e) { return; } handle(m); }; if (typeof ev.data === "string") go(ev.data); else if (ev.data && ev.data.text) ev.data.text().then(go); else if (ev.data instanceof ArrayBuffer) go(new TextDecoder().decode(ev.data)); };
        ws.onerror = function () { if (!opened) reject(new Error("Couldn't connect to Gemini Live.")); };
        ws.onclose = function (ev) { if (ws !== L.ws && L.ws) return; var was = L.active, ready = L.ready; L.ws = null; clearTimeout(L.setupTimer); if (!opened) return reject(new Error("Gemini Live closed: " + (ev.reason || ev.code)));
          if (!was) return; var why = ev.reason || ("code " + ev.code);
          if (!ready && !L.lite && L.tier !== "basic") { L.lite = true; L.handle = null; emit("state", "connecting"); connect().catch(function (e) { stop(true); emit("error", String(e.message || e)); }); return; }   // a newer feature was refused → plain session
          if (ready && ev.code !== 1000 && (L.fails = (L.fails || 0) + 1) <= 4) { reconnect(why); return; }   // dropped mid-conversation → come back with the same conversation
          stop(true); if (!ready) emit("error", "Gemini rejected the session: " + why); else emit("closed", why); };
      });
    });
  }
  function reconnect(why) {
    if (!L.active || L.reconnecting) return; L.reconnecting = true; L.reconnects = (L.reconnects || 0) + 1; emit("reconnect", why);
    var old = L.ws; L.ws = null; L.ready = false; if (old) { old.onclose = null; old.onmessage = null; try { old.close(1000, "resume"); } catch (e) {} }
    setTimeout(function () { connect().then(function () { L.reconnecting = false; }, function (e) { L.reconnecting = false; stop(true); emit("error", String(e.message || e)); }); }, L.playing ? 400 : 50);
  }
  function stop(keepMic) {
    var was = L.active; L.active = false; L.ready = false; clearTimeout(L.setupTimer); flush();
    if (L.ws) { try { L.ws.close(1000, "bye"); } catch (e) {} L.ws = null; }
    if (window.FodoVoice) FodoVoice.pauseVad(false);
    if (was) emit("state", "closed");
  }
  function say(text) { if (L.active && L.ready) { L.injected = true; sendText(text); emit("state", "thinking"); } }
  function setMode(m) { L.mode = m === "wake" ? "wake" : "chat"; }
  /* Voice check (Settings): token → WebSocket → setup → Gemini says hello in text. No microphone needed. */
  function test(voice) {
    var t0 = Date.now(), out = { ok: false, step: "token" };
    return fetch("/api/owner-brain/live" + (voice ? "?voice=" + encodeURIComponent(voice) : ""), { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json(); }).then(function (t) {
      if (!t || !t.ok) { out.detail = (t && t.reason) || "no token"; return out; }
      out.model = t.model; out.version = t.version; out.locked = t.locked; out.step = "connect";
      return new Promise(function (res) {
        var ws, done = false, fin = function (ok, d) { if (done) return; done = true; out.ok = ok; if (d) out.detail = d; out.ms = Date.now() - t0; try { ws.close(1000, "test"); } catch (e) {} res(out); };
        try { ws = new WebSocket(t.ws); } catch (e) { return fin(false, String(e.message || e)); }
        var to = setTimeout(function () { fin(false, "no answer from Gemini in 12 s (step: " + out.step + ")"); }, 12000);
        ws.onopen = function () { out.step = "setup"; ws.send(JSON.stringify({ setup: t.setup })); };
        ws.onmessage = function (ev) { var go = function (txt) { var m; try { m = JSON.parse(txt); } catch (e) { return; }
          if (m.setupComplete) { out.step = "reply"; out.setup = true; ws.send(JSON.stringify({ realtimeInput: { text: "Voice check: reply with just the word OK." } })); }
          if (m.serverContent && (m.serverContent.modelTurn || m.serverContent.outputTranscription)) { clearTimeout(to); fin(true); } };
          if (typeof ev.data === "string") go(ev.data); else if (ev.data && ev.data.text) ev.data.text().then(go); };
        ws.onclose = function (ev) { clearTimeout(to); fin(false, "Gemini closed the connection at step '" + out.step + "': " + (ev.reason || "code " + ev.code)); };
        ws.onerror = function () {};
      });
    }).catch(function (e) { out.detail = String(e.message || e); return out; });
  }
  /* Settings → "Preview": a 1-turn session that SPEAKS a short hello in the chosen voice (audio only, no microphone) */
  function preview(voice, line) {
    var AC = window.AudioContext || window.webkitAudioContext, ac = AC ? new AC() : null, next = 0;
    return fetch("/api/owner-brain/live?lite=1&voice=" + encodeURIComponent(voice || ""), { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json(); }).then(function (t) {
      if (!t || !t.ok || !ac) return { ok: false, detail: (t && t.reason) || "no audio" };
      return new Promise(function (res) { var ws = new WebSocket(t.ws), done = false, fin = function (ok, d) { if (done) return; done = true; try { ws.close(1000, "preview"); } catch (e) {} setTimeout(function () { try { ac.close(); } catch (e) {} }, Math.max(0, (next - ac.currentTime) * 1000) + 300); res({ ok: ok, detail: d }); };
        var to = setTimeout(function () { fin(false, "no audio in 15 s"); }, 15000);
        ws.onopen = function () { ws.send(JSON.stringify({ setup: t.setup })); };
        ws.onmessage = function (ev) { var go = function (txt) { var m; try { m = JSON.parse(txt); } catch (e) { return; }
          if (m.setupComplete) ws.send(JSON.stringify({ realtimeInput: { text: line || "Introduce yourself in one short, warm Hinglish sentence as FODO, Anmol's assistant." } }));
          var sc = m.serverContent; if (sc && sc.modelTurn && sc.modelTurn.parts) sc.modelTurn.parts.forEach(function (p) { if (p.inlineData && /audio\/pcm/.test(p.inlineData.mimeType || "")) { var b = unb64(p.inlineData.data), pcm = new Int16Array(b.buffer, b.byteOffset, b.byteLength >> 1), buf = ac.createBuffer(1, pcm.length, 24000), ch = buf.getChannelData(0); for (var i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768; var src = ac.createBufferSource(); src.buffer = buf; src.connect(ac.destination); var at = Math.max(ac.currentTime + 0.05, next); src.start(at); next = at + buf.duration; } });
          if (sc && sc.turnComplete) { clearTimeout(to); fin(true); } };
          if (typeof ev.data === "string") go(ev.data); else if (ev.data && ev.data.text) ev.data.text().then(go); };
        ws.onclose = function (ev) { clearTimeout(to); fin(next > 0, ev.reason || "closed"); }; ws.onerror = function () {};
      });
    }).catch(function (e) { return { ok: false, detail: String(e.message || e) }; });
  }
  window.FodoLive = { preview: preview, setMode: setMode, mode: function () { return L.mode; }, test: test, on: function (n, f) { (E[n] = E[n] || []).push(f); }, start: start, stop: stop, say: say, isActive: function () { return L.active; }, isSpeaking: function () { return L.playing; }, interrupt: function () { flush(); } };
})();
