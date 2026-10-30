/* FODO BRAIN — hearing engine (works the same on iPhone Safari, Android Chrome and desktop).
   The way open-source voice assistants do it: the microphone stays open, a voice-activity detector (VAD) with an adaptive noise
   floor finds where speech starts and ends (with 350 ms of pre-roll so the first syllable isn't lost), and only that clip —
   16 kHz mono WAV — goes to the server for Whisper large-v3-turbo. No browser speech engine is used, so Hindi, English and
   Hinglish are heard by the same strong model everywhere.
   Events: level (0..1, for the orb) · speechstart · speechend · utterance {b64, ms} · error {message} · state {on}
   FodoVoice.start() must be called from a tap the first time (iOS / Chrome audio rules). */
(function () {
  "use strict";
  var E = {}, V = { on: false, ac: null, stream: null, src: null, node: null, sr: 48000, pre: [], buf: [], speaking: false, voiced: 0, silentMs: 0,
    noise: 0.006, level: 0, guard: false, frameMs: 42, startTimes: [] };
  function emit(n, x) { (E[n] || []).forEach(function (f) { try { f(x); } catch (e) {} }); }
  var CFG = { onsetFrames: 3, preRollMs: 380, endSilenceMs: 800, maxMs: 15000, minSpeechMs: 320, floor: 0.010, k: 3.0, guardK: 6.5, guardMin: 0.045 };

  function rms(f) { var s = 0; for (var i = 0; i < f.length; i++) s += f[i] * f[i]; return Math.sqrt(s / f.length); }
  function process(f) {
    var r = rms(f), startT = V.guard ? Math.max(V.noise * CFG.guardK, CFG.guardMin) : Math.max(V.noise * CFG.k, CFG.floor), endT = Math.max(V.noise * 1.8, CFG.floor * 0.7);
    V.level += ((Math.min(1, r * 9)) - V.level) * 0.35; emit("level", V.level);
    var copy = new Float32Array(f);
    if (!V.speaking) {
      V.pre.push(copy); var keep = Math.ceil(CFG.preRollMs / V.frameMs); while (V.pre.length > keep) V.pre.shift();
      if (r > startT) V.voiced++; else { V.voiced = 0; V.noise = Math.min(0.05, Math.max(0.0015, V.noise * 0.96 + r * 0.04)); }
      if (V.voiced >= CFG.onsetFrames) { V.speaking = true; V.buf = V.pre.slice(); V.preLen = Math.max(0, V.buf.length - CFG.onsetFrames); V.pre = []; V.silentMs = 0; emit("speechstart"); }
      return;
    }
    V.buf.push(copy);
    if (r < endT) V.silentMs += V.frameMs; else V.silentMs = 0;
    var dur = V.buf.length * V.frameMs;
    if (V.silentMs >= CFG.endSilenceMs || dur >= CFG.maxMs) finish(dur);
  }
  function finish(dur) {
    var frames = V.buf; V.buf = []; V.speaking = false; V.voiced = 0; var speechMs = dur - V.silentMs - (V.preLen || 0) * V.frameMs; V.silentMs = 0; emit("speechend");
    if (speechMs < CFG.minSpeechMs) return;
    var trimEnd = Math.max(0, frames.length - Math.floor(Math.max(0, CFG.endSilenceMs - 250) / V.frameMs));   // keep ~250 ms of trailing silence
    emit("utterance", { b64: wav(frames.slice(0, trimEnd || frames.length), V.sr), ms: Math.round(speechMs) });
  }
  /* float frames → 16 kHz 16-bit mono WAV → base64 */
  function wav(frames, sr) {
    var n = 0; frames.forEach(function (f) { n += f.length; }); var all = new Float32Array(n), o = 0; frames.forEach(function (f) { all.set(f, o); o += f.length; });
    var ratio = sr / 16000, len = Math.floor(n / ratio), pcm = new Int16Array(len), peak = 0.0001;
    for (var j = 0; j < n; j++) { var a = Math.abs(all[j]); if (a > peak) peak = a; }
    var gain = Math.min(8, 0.9 / peak);   // normalise quiet speech (phones held far away)
    for (var i = 0; i < len; i++) { var s0 = Math.floor(i * ratio), s1 = Math.min(n, Math.floor((i + 1) * ratio)), acc = 0, c = 0; for (var k = s0; k < s1; k++) { acc += all[k]; c++; } var v = (c ? acc / c : 0) * gain; pcm[i] = Math.max(-1, Math.min(1, v)) * 0x7fff; }
    var buf = new ArrayBuffer(44 + pcm.length * 2), dv = new DataView(buf), w = function (p, s) { for (var q = 0; q < s.length; q++) dv.setUint8(p + q, s.charCodeAt(q)); };
    w(0, "RIFF"); dv.setUint32(4, 36 + pcm.length * 2, true); w(8, "WAVE"); w(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, 16000, true); dv.setUint32(28, 32000, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, "data"); dv.setUint32(40, pcm.length * 2, true);
    new Int16Array(buf, 44).set(pcm);
    var bytes = new Uint8Array(buf), bin = "", CH = 0x8000; for (var x = 0; x < bytes.length; x += CH) bin += String.fromCharCode.apply(null, bytes.subarray(x, x + CH));
    return btoa(bin);
  }
  function start() {
    if (V.on) return Promise.resolve(true);
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { emit("error", { message: "This browser can't use the microphone here." }); return Promise.resolve(false); }
    V.ac = V.ac || new AC(); var resume = V.ac.state !== "running" ? V.ac.resume() : Promise.resolve();
    return resume.then(function () {
      if (V.ac.state !== "running") throw Object.assign(new Error("tap"), { name: "NeedsTap" });
      return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    }).then(function (st) {
      V.stream = st; V.sr = V.ac.sampleRate; V.src = V.ac.createMediaStreamSource(st);
      var size = V.sr > 32000 ? 2048 : 1024; V.frameMs = size / V.sr * 1000;
      V.node = V.ac.createScriptProcessor(size, 1, 1); V.node.onaudioprocess = function (e) { if (V.on) process(e.inputBuffer.getChannelData(0)); var out = e.outputBuffer.getChannelData(0); for (var i = 0; i < out.length; i++) out[i] = 0; };
      V.src.connect(V.node); V.node.connect(V.ac.destination);
      V.on = true; V.pre = []; V.buf = []; V.speaking = false; emit("state", { on: true }); return true;
    }).catch(function (e) {
      emit("error", { message: e && e.name === "NeedsTap" ? "tap" : e && (e.name === "NotAllowedError" || e.name === "SecurityError") ? "blocked" : e && e.name === "NotFoundError" ? "nomic" : String(e && e.message || e) }); return false;
    });
  }
  function stop() {
    V.on = false; V.speaking = false; V.buf = []; V.pre = [];
    try { if (V.node) { V.node.disconnect(); V.node.onaudioprocess = null; } if (V.src) V.src.disconnect(); } catch (e) {}
    if (V.stream) V.stream.getTracks().forEach(function (t) { t.stop(); }); V.stream = V.node = V.src = null; emit("level", 0); emit("state", { on: false });
  }
  window.FodoVoice = {
    on: function (n, f) { (E[n] = E[n] || []).push(f); }, start: start, stop: stop, isOn: function () { return V.on; },
    guard: function (g) { V.guard = !!g; },   // while the Brain speaks: only loud, sustained speech counts (lets you interrupt, ignores its own echo)
    unlock: function () { try { var AC = window.AudioContext || window.webkitAudioContext; V.ac = V.ac || new AC(); if (V.ac.state !== "running") V.ac.resume(); } catch (e) {} },
    context: function () { return V.ac; }, cfg: CFG, _wav: wav,
  };
})();
