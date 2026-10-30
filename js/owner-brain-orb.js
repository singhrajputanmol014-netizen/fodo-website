/* FODO BRAIN — the living orb (v24). A WebGL "creature of light": a soft sphere whose surface breathes and ripples (noise-
   deformed edge), with plasma flowing inside (domain-warped fractal noise), an iridescent rim, a corona that flickers outwards
   and sparks that orbit it. It reacts to sound: the microphone while you talk, the Brain's own voice while it speaks.
   States: idle (violet, slow breath) · listening (teal, alert) · hearing (bright cyan, ripples with your voice) · thinking
   (amber-violet, fast swirl) · speaking (magenta-violet, pulses with each word). Falls back to a 2-D particle orb without WebGL.
   API: var o = FodoOrb.mount(canvas, {big|small}); o.state(name); o.level(0..1); o.destroy(). Pure WebGL, no libraries. */
(function () {
  "use strict";
  var PAL = {
    idle: [[139, 123, 255], [95, 184, 255]], listening: [[61, 220, 200], [95, 184, 255]], hearing: [[80, 240, 230], [120, 140, 255]],
    thinking: [[255, 191, 71], [139, 123, 255]], speaking: [[178, 140, 255], [255, 120, 210]],
  };
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* colours per state: c1 = main, c2 = deep, c3 = highlight; speed; amp = how much the surface moves */
  var GL_ST = {
    idle: { c1: [0.55, 0.45, 1.0], c2: [0.10, 0.08, 0.35], c3: [0.45, 0.80, 1.0], speed: 0.45, amp: 0.25 },
    listening: { c1: [0.20, 0.90, 0.85], c2: [0.04, 0.16, 0.32], c3: [0.55, 0.65, 1.0], speed: 0.6, amp: 0.35 },
    hearing: { c1: [0.30, 1.00, 0.95], c2: [0.05, 0.22, 0.40], c3: [0.75, 0.55, 1.0], speed: 0.9, amp: 0.55 },
    thinking: { c1: [1.00, 0.70, 0.25], c2: [0.22, 0.08, 0.38], c3: [0.70, 0.45, 1.0], speed: 1.7, amp: 0.6 },
    speaking: { c1: [0.80, 0.45, 1.00], c2: [0.20, 0.05, 0.35], c3: [1.00, 0.45, 0.80], speed: 0.85, amp: 0.5 },
  };
  var VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
  var FS = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\nuniform vec2 uR;uniform float uT,uL,uA,uS,uLight;uniform vec3 uC1,uC2,uC3;",
    "float h(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}",
    "float n(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}",
    "float fb(vec3 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*n(p);p=p*2.02+vec3(1.7,9.2,3.1);a*=.5;}return s;}",
    "void main(){",
    " vec2 uv=(gl_FragCoord.xy-.5*uR)/min(uR.x,uR.y)*2.;float r=length(uv);float t=uT*uS;",
    " vec2 dir=r>0.?uv/r:vec2(1.,0.);",
    " float wob=fb(vec3(dir*1.6,t*.55))*2.-1.;float wob2=n(vec3(dir*4.,t*1.3))*2.-1.;",
    " float R=.56*(1.+.03*sin(uT*1.6)+.025*sin(uT*.7)+uL*.17)*(1.+wob*(.05+uA*.07+uL*.12)+wob2*(.012+uL*.05));",
    " float d=r-R;vec3 col=vec3(0.);float a=0.;",
    " if(d<.015){float rr=min(r/R,1.);float z=sqrt(max(0.,1.-rr*rr));vec3 nn=normalize(vec3(uv/R,z));",
    "  vec3 q=nn*2.1+vec3(t*.32,t*.21,-t*.27);float w=fb(q+vec3(t*.1));float f=fb(q+w*1.35-vec3(0.,t*.25,0.));",
    "  vec3 deep=uC2*1.5+uC1*.22;vec3 base=mix(deep,uC1,smoothstep(.22,.82,f));base=mix(base,uC3,smoothstep(.6,.92,f)*.85);",
    "  float band=.5+.5*sin(nn.y*9.+f*6.-t*1.4);base+=uC3*pow(band,8.)*.18;",
    "  float fr=pow(1.-z,2.3);float sp=pow(max(dot(nn,normalize(vec3(-.45,.55,.75))),0.),28.);float core=1.-smoothstep(0.,.75,rr);",
    "  float vein=1.-smoothstep(0.,.035,abs(f-.52));",
    "  col=base*(.45+.55*z)+uC3*fr*1.25+vec3(1.)*sp*.5+mix(uC1,vec3(1.),.35)*core*(.3+uL*.8)+mix(uC1,uC3,.5)*vein*(.14+uL*.5);",
    "  col=mix(col,col*.75+uC1*.25,.25);",
    "  a=1.-smoothstep(-.012,.012,d);}",
    " float g=exp(-max(d,0.)*(6.-uL*2.5))*(.5+uL*.55);",
    " float rays=pow(max(0.,fb(vec3(dir*2.6,r*2.2-t*.9))-.38),1.6)*exp(-max(d,0.)*4.)*(1.3+uL*2.);",
    " vec3 gc=mix(uC1,uC3,.35+.3*sin(t*.3))*(g+rays);",
    " float sk=0.;for(int i=0;i<22;i++){float fi=float(i);float ang=fi*2.39996+t*(.25+.04*fi)*(mod(fi,2.)*2.-1.);float rad=R*(1.18+.22*fract(fi*.618)+.06*sin(t+fi));",
    "  vec2 sp2=vec2(cos(ang),sin(ang)*(.55+.4*fract(fi*.37)))*rad;float dd=length(uv-sp2);sk+=(.00055+uL*.0009)/(dd*dd+.00035)*(.5+.5*sin(uT*2.+fi));}",
    " gc+=uC3*min(sk,1.5)*.55;",
    " vec3 outc=col*a+gc*(1.-a);float al=clamp(max(a,(g+rays+min(sk,1.)*.5)*.95),0.,1.);",
    " if(uLight>.5){outc*=1.05;}",
    " gl_FragColor=vec4(outc*al,al);}",
  ].join("\n");
  function mount(cv, opt) {
    opt = opt || {}; var gl = null;
    try { gl = cv.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false, powerPreference: "low-power" }) || cv.getContext("experimental-webgl"); } catch (e) {}
    if (!gl) return mount2d(cv, opt);
    function sh(type, src) { var x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; }
    var pr; try { pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error("link"); } catch (e) { return mount2d(cv, opt); }
    gl.useProgram(pr); var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var U = {}; ["uR", "uT", "uL", "uA", "uS", "uLight", "uC1", "uC2", "uC3"].forEach(function (k) { U[k] = gl.getUniformLocation(pr, k); });
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.clearColor(0, 0, 0, 0);
    var cur = JSON.parse(JSON.stringify(GL_ST.idle)), want = GL_ST.idle, lvl = 0, lvlT = 0, raf = 0, t0 = performance.now(), last = 0, scale = opt.big ? 0.62 : 1, slow = 0, dead = false;
    function mix(a, b, f) { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; }
    function frame(now) {
      if (dead) return; raf = requestAnimationFrame(frame);
      if (document.hidden || !cv.offsetParent) return;
      var minGap = opt.big ? 15 : 32; if (now - last < minGap) return; var dt = now - last; last = now;
      if (opt.big && dt > 45) { if (++slow > 20 && scale > 0.38) { scale -= 0.08; slow = 0; } } else slow = Math.max(0, slow - 1);   // phone too slow → render fewer pixels
      var dpr = Math.min(window.devicePixelRatio || 1, 2), w = Math.max(16, Math.round((cv.clientWidth || 100) * dpr * scale)), hh = Math.max(16, Math.round((cv.clientHeight || 100) * dpr * scale));
      if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; }
      gl.viewport(0, 0, w, hh);
      var f = 0.05; cur.c1 = mix(cur.c1, want.c1, f); cur.c2 = mix(cur.c2, want.c2, f); cur.c3 = mix(cur.c3, want.c3, f); cur.speed += (want.speed - cur.speed) * f; cur.amp += (want.amp - cur.amp) * f;
      lvl += (lvlT - lvl) * (lvlT > lvl ? 0.4 : 0.12);
      var T = reduce ? 0 : ((now - t0) / 1000) % 1800;
      gl.uniform2f(U.uR, w, hh); gl.uniform1f(U.uT, T); gl.uniform1f(U.uL, lvl); gl.uniform1f(U.uA, cur.amp); gl.uniform1f(U.uS, cur.speed); gl.uniform1f(U.uLight, document.documentElement.getAttribute("data-theme") === "light" ? 1 : 0);
      gl.uniform3fv(U.uC1, cur.c1); gl.uniform3fv(U.uC2, cur.c2); gl.uniform3fv(U.uC3, cur.c3);
      gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    raf = requestAnimationFrame(frame);
    cv.addEventListener("webglcontextlost", function (e) { e.preventDefault(); dead = true; });
    return { state: function (s) { if (GL_ST[s]) want = GL_ST[s]; }, level: function (v) { lvlT = Math.max(0, Math.min(1, +v || 0)); }, destroy: function () { dead = true; cancelAnimationFrame(raf); try { var ext = gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext(); } catch (e) {} }, webgl: true };
  }
  function mount2d(cv, opt) {
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
    return { state: function (s) { if (PAL[s]) st.s = s === "hearing" ? "listening" : s; }, level: function (v) { st.lvlT = Math.max(0, Math.min(1, +v || 0)); }, destroy: function () { cancelAnimationFrame(raf); } };
  }
  /* microphone / audio-element level meter (feeds the orb) */
  function meter(source, onLevel) {
    try { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; var ac = (window.FodoVoice && FodoVoice.context()) || meter.ac || (meter.ac = new AC()); if (!(source instanceof MediaStream) && ac.state !== "running") return null; var an = ac.createAnalyser(); an.fftSize = 256; var node = source instanceof MediaStream ? ac.createMediaStreamSource(source) : ac.createMediaElementSource(source); node.connect(an); if (!(source instanceof MediaStream)) an.connect(ac.destination);
      var buf = new Uint8Array(an.frequencyBinCount), on = true; (function loop() { if (!on) return; an.getByteFrequencyData(buf); var s = 0; for (var i = 2; i < 48; i++) s += buf[i]; onLevel(Math.min(1, s / (46 * 150))); requestAnimationFrame(loop); })();
      return { stop: function () { on = false; try { node.disconnect(); an.disconnect(); } catch (e) {} } };
    } catch (e) { return null; }
  }
  function unlock() { try { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; var ac = (window.FodoVoice && FodoVoice.context()) || meter.ac || (meter.ac = new AC()); if (ac.state !== "running") ac.resume(); } catch (e) {} }
  window.FodoOrb = { mount: mount, meter: meter, unlock: unlock };
})();
