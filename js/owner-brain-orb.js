/* FODO BRAIN — the living orb. A holographic 3-D sphere of light (≈900 particles on a Fibonacci sphere, three tilted orbit rings
   and a glowing core) drawn on a 2-D canvas with perspective. It breathes when idle, glows teal while listening (reacting to the
   microphone level), swirls while thinking and pulses with the voice while speaking. Pure canvas — no libraries, CSP-safe.
   API: var o = FodoOrb.mount(canvas, {size}); o.state("idle|listening|thinking|speaking"); o.level(0..1); o.destroy(). */
(function () {
  "use strict";
  var PAL = {
    idle: [[139, 123, 255], [95, 184, 255]], listening: [[61, 220, 200], [95, 184, 255]],
    thinking: [[255, 191, 71], [139, 123, 255]], speaking: [[178, 140, 255], [255, 120, 210]],
  };
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function mount(cv, opt) {
    opt = opt || {}; var ctx = cv.getContext("2d"), N = opt.particles || (opt.small ? 260 : 900), pts = [], rings = [], raf = 0, t0 = performance.now();
    var st = { s: "idle", lvl: 0, lvlT: 0, col: [PAL.idle[0].slice(), PAL.idle[1].slice()], spin: 0.25, spinT: 0.25, amp: 0, light: false };
    var ga = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < N; i++) { var y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = ga * i; pts.push({ x: Math.cos(th) * r, y: y, z: Math.sin(th) * r, p: Math.random() * 6.28, s: 0.6 + Math.random() * 0.9 }); }
    for (var k = 0; k < 3; k++) rings.push({ tilt: 0.35 + k * 0.62, rot: k * 2.1, sp: (k % 2 ? -1 : 1) * (0.25 + k * 0.12), r: 1.18 + k * 0.1 });
    function size() { var d = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth || opt.size || 120, h = cv.clientHeight || opt.size || 120; if (cv.width !== Math.round(w * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); } return { w: cv.width, h: cv.height, d: d }; }
    function mix(a, b, f) { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; }
    function rgba(c, a) { return "rgba(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + "," + a.toFixed(3) + ")"; }
    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      var z = size(), W = z.w, H = z.h, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.27, t = (now - t0) / 1000;
      st.light = document.documentElement.getAttribute("data-theme") === "light";
      var P = PAL[st.s] || PAL.idle; st.col[0] = mix(st.col[0], P[0], 0.06); st.col[1] = mix(st.col[1], P[1], 0.06);
      st.spinT = st.s === "thinking" ? 1.6 : st.s === "speaking" ? 0.55 : st.s === "listening" ? 0.4 : 0.22; st.spin += (st.spinT - st.spin) * 0.05;
      st.lvl += ((st.s === "speaking" ? Math.max(st.lvlT, 0.25 + 0.2 * Math.sin(t * 9)) : st.lvlT) - st.lvl) * 0.25;
      var breathe = reduce ? 0 : Math.sin(t * 1.6) * 0.025, pulse = 1 + breathe + st.lvl * 0.22, Rr = R * pulse;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
      // outer halo
      var HR = Math.min(W, H) * 0.5, halo = ctx.createRadialGradient(cx, cy, Rr * 0.2, cx, cy, HR); halo.addColorStop(0, rgba(st.col[0], st.light ? 0.22 : 0.35)); halo.addColorStop(0.45, rgba(st.col[1], st.light ? 0.08 : 0.12)); halo.addColorStop(1, rgba(st.col[1], 0));
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, HR, 0, 6.2832); ctx.fill();
      ctx.globalCompositeOperation = st.light ? "source-over" : "lighter";
      // rings
      var rot = reduce ? 0 : t * st.spin;
      rings.forEach(function (g, gi) {
        var a0 = rot * g.sp * 2 + g.rot, ct = Math.cos(g.tilt), stt = Math.sin(g.tilt); ctx.beginPath();
        for (var s = 0; s <= 64; s++) { var a = (s / 64) * 6.2832, x = Math.cos(a) * g.r, yy = Math.sin(a) * g.r * stt, zz = Math.sin(a) * g.r * ct, xr = x * Math.cos(a0) - zz * Math.sin(a0), zr = x * Math.sin(a0) + zz * Math.cos(a0), f = 2.6 / (2.6 + zr); var px = cx + xr * Rr * f, py = cy + yy * Rr * f; s ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ctx.strokeStyle = rgba(gi % 2 ? st.col[1] : st.col[0], (st.light ? 0.35 : 0.22) + st.lvl * 0.3); ctx.lineWidth = z.d * (0.8 + st.lvl * 1.4); ctx.stroke();
      });
      // particles
      var cr = Math.cos(rot), sr = Math.sin(rot), tl = 0.38 + Math.sin(t * 0.3) * 0.08, ctl = Math.cos(tl), stl = Math.sin(tl), dot = Math.max(1, z.d * (opt.small ? 1.3 : 1.15));
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i], wob = 1 + (reduce ? 0 : Math.sin(t * 2.2 + p.p) * 0.03) + st.lvl * 0.18 * Math.sin(t * 7 + p.p * 3), x = p.x * wob, y = p.y * wob, zz = p.z * wob;
        var x1 = x * cr - zz * sr, z1 = x * sr + zz * cr, y1 = y * ctl - z1 * stl, z2 = y * stl + z1 * ctl, f = 2.8 / (2.8 + z2);
        var depth = (1 - z2) / 2, a = (0.15 + depth * 0.85) * (st.light ? 0.9 : 0.8), c = mix(st.col[1], st.col[0], depth);
        ctx.fillStyle = rgba(c, a); var sz = dot * p.s * (0.6 + depth * 0.9) * f; ctx.fillRect(cx + x1 * Rr * f - sz / 2, cy + y1 * Rr * f - sz / 2, sz, sz);
      }
      // core
      var core = ctx.createRadialGradient(cx - Rr * 0.18, cy - Rr * 0.22, 0, cx, cy, Rr * 0.95); core.addColorStop(0, rgba([255, 255, 255], 0.85)); core.addColorStop(0.18, rgba(st.col[0], 0.55 + st.lvl * 0.3)); core.addColorStop(0.6, rgba(st.col[1], 0.12)); core.addColorStop(1, rgba(st.col[1], 0));
      ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = core; ctx.beginPath(); ctx.arc(cx, cy, Rr * (0.55 + st.lvl * 0.12), 0, 6.2832); ctx.fill();
      // scanning arc while thinking
      if (st.s === "thinking" && !reduce) { ctx.beginPath(); ctx.arc(cx, cy, Rr * 1.42, t * 3, t * 3 + 1.4); ctx.strokeStyle = rgba(st.col[0], 0.7); ctx.lineWidth = 2 * z.d; ctx.stroke(); }
    }
    raf = requestAnimationFrame(frame);
    return { state: function (s) { if (PAL[s]) st.s = s; }, level: function (v) { st.lvlT = Math.max(0, Math.min(1, +v || 0)); }, destroy: function () { cancelAnimationFrame(raf); } };
  }
  /* microphone / audio-element level meter (feeds the orb) */
  function meter(source, onLevel) {
    try { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; var ac = meter.ac || (meter.ac = new AC()); if (!(source instanceof MediaStream) && ac.state !== "running") return null; var an = ac.createAnalyser(); an.fftSize = 256; var node = source instanceof MediaStream ? ac.createMediaStreamSource(source) : ac.createMediaElementSource(source); node.connect(an); if (!(source instanceof MediaStream)) an.connect(ac.destination);
      var buf = new Uint8Array(an.frequencyBinCount), on = true; (function loop() { if (!on) return; an.getByteFrequencyData(buf); var s = 0; for (var i = 2; i < 48; i++) s += buf[i]; onLevel(Math.min(1, s / (46 * 150))); requestAnimationFrame(loop); })();
      return { stop: function () { on = false; try { node.disconnect(); an.disconnect(); } catch (e) {} } };
    } catch (e) { return null; }
  }
  function unlock() { try { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; var ac = meter.ac || (meter.ac = new AC()); if (ac.state !== "running") ac.resume(); } catch (e) {} }
  window.FodoOrb = { mount: mount, meter: meter, unlock: unlock };
})();
