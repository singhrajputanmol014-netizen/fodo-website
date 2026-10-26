/* FODO — scroll-driven 3D particle background (raw WebGL, no library, ~8 KB).
   As you scroll, one cloud of particles morphs through FODO's story:
     orb (attention) → ring (demand) → rising wave (growth) → double helix (system) → the FODO wordmark.
   Respects reduced motion (static orb), pauses in hidden tabs, lighter on phones, no-ops without WebGL. */
(function () {
  "use strict";
  if (window.__fodo3d) return; window.__fodo3d = 1;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var saveData = navigator.connection && navigator.connection.saveData;
  if (saveData) return;
  var mobile = matchMedia("(max-width: 767px)").matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
  var N = mobile ? 3600 : 9000;

  var canvas = document.createElement("canvas");
  canvas.className = "fodo-3d"; canvas.setAttribute("aria-hidden", "true");
  var gl = canvas.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: false, powerPreference: "low-power" });
  if (!gl) return;
  document.body.prepend(canvas);
  var scrim = document.createElement("div"); scrim.className = "fodo-3d-scrim"; scrim.setAttribute("aria-hidden", "true"); canvas.after(scrim);
  document.documentElement.classList.add("has-3d");

  /* ---------- shapes (each N xyz points, roughly unit-sized) ---------- */
  function rnd(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function shape(fn) { var a = new Float32Array(N * 3); for (var i = 0; i < N; i++) { var p = fn(i); a[i * 3] = p[0]; a[i * 3 + 1] = p[1]; a[i * 3 + 2] = p[2]; } return a; }
  var GA = Math.PI * (3 - Math.sqrt(5));
  var sphere = shape(function (i) { var y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), t = GA * i, k = 1 + (rnd(i) - .5) * .06; return [Math.cos(t) * r * k, y * k, Math.sin(t) * r * k]; });
  var torus = shape(function (i) { var u = rnd(i) * Math.PI * 2, v = rnd(i + 7) * Math.PI * 2, R = 1.05, r = .32; return [(R + r * Math.cos(v)) * Math.cos(u), r * Math.sin(v), (R + r * Math.cos(v)) * Math.sin(u)]; });
  var side = Math.ceil(Math.sqrt(N));
  var wave = shape(function (i) { var gx = (i % side) / (side - 1) - .5, gz = Math.floor(i / side) / (side - 1) - .5, x = gx * 3.2, z = gz * 3.2;
    var y = Math.sin(x * 2.2 + z * 1.4) * .18 + (x + 1.6) * .32 - .55; return [x, y, z]; });
  var helix = shape(function (i) { var s = i % 2 ? Math.PI : 0, t = (i / N) * Math.PI * 9 - Math.PI * 4.5, r = .55 + (rnd(i) - .5) * .08; return [Math.cos(t + s) * r, t / 8, Math.sin(t + s) * r]; });
  var word = (function () { // sample the wordmark from a 2D canvas
    var c = document.createElement("canvas"), W = 460, H = 150; c.width = W; c.height = H;
    var x = c.getContext("2d"); x.fillStyle = "#000"; x.font = "800 128px Inter Tight, Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("FODO", W / 2, H / 2 + 6);
    var d = x.getImageData(0, 0, W, H).data, pts = [];
    for (var yy = 0; yy < H; yy += 2) for (var xx = 0; xx < W; xx += 2) if (d[(yy * W + xx) * 4 + 3] > 128) pts.push([(xx / W - .5) * 3.0, -(yy / H - .5) * .98, 0]);
    if (!pts.length) return sphere;
    return shape(function (i) { var p = pts[i % pts.length]; return [p[0] + (rnd(i) - .5) * .015, p[1] + (rnd(i + 3) - .5) * .015, (rnd(i + 9) - .5) * .12]; });
  })();
  var SHAPES = reduce ? [sphere] : [sphere, torus, wave, helix, word];

  /* ---------- GL program ---------- */
  var VS = "attribute vec3 a;attribute vec3 b;attribute float s;uniform float t,time,size,ax,ay,aspect,dx,dy,scale;varying float vA;varying float vS;" +
    "void main(){vec3 p=mix(a,b,t);float w=sin(time*.9+s*40.0)*.012;p+=normalize(p+vec3(.0001))*w;" +
    "float cy=cos(ay),sy=sin(ay),cx=cos(ax),sx=sin(ax);p=vec3(cy*p.x+sy*p.z,p.y,-sy*p.x+cy*p.z);p=vec3(p.x,cx*p.y-sx*p.z,sx*p.y+cx*p.z);" +
    "p*=scale;float z=p.z+3.2;vec2 q=vec2(p.x/aspect,p.y)*(2.2/z)+vec2(dx,dy);gl_Position=vec4(q,0.,1.);" +
    "gl_PointSize=size*(2.6/z)*(.7+s*.6);vA=clamp(1.75-z*.3,.3,1.);vS=s;}";
  var FS = "precision mediump float;uniform vec3 c1,c2;uniform float alpha;varying float vA;varying float vS;" +
    "void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d);if(r>.25)discard;float e=smoothstep(.25,.05,r);" +
    "vec3 col=mix(c1,c2,step(.82,vS));gl_FragColor=vec4(col,e*vA*alpha*(vS>.82?1.3:1.));}";
  function sh(type, src) { var o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; }
  var prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); document.documentElement.classList.remove("has-3d"); return; }
  gl.useProgram(prog);
  var bufs = SHAPES.map(function (arr) { var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW); return b; });
  var seeds = new Float32Array(N); for (var i = 0; i < N; i++) seeds[i] = rnd(i * 3.7 + 1);
  var sb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, sb); gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
  var LA = gl.getAttribLocation(prog, "a"), LB = gl.getAttribLocation(prog, "b"), LS = gl.getAttribLocation(prog, "s");
  gl.enableVertexAttribArray(LA); gl.enableVertexAttribArray(LB); gl.enableVertexAttribArray(LS);
  gl.bindBuffer(gl.ARRAY_BUFFER, sb); gl.vertexAttribPointer(LS, 1, gl.FLOAT, false, 0, 0);
  var U = {}; ["t", "time", "size", "ax", "ay", "aspect", "dx", "dy", "scale", "c1", "c2", "alpha"].forEach(function (k) { U[k] = gl.getUniformLocation(prog, k); });
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  var bound = [-1, -1];
  function bind(i, j) { if (bound[0] === i && bound[1] === j) return; gl.bindBuffer(gl.ARRAY_BUFFER, bufs[i]); gl.vertexAttribPointer(LA, 3, gl.FLOAT, false, 0, 0); gl.bindBuffer(gl.ARRAY_BUFFER, bufs[j]); gl.vertexAttribPointer(LB, 3, gl.FLOAT, false, 0, 0); bound = [i, j]; }

  /* ---------- colours follow the theme ---------- */
  function hex(h) { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255]; }
  var theme = "", col1, col2, alpha;
  function paint() { theme = document.documentElement.getAttribute("data-theme") || "light";
    if (theme === "dark") { col1 = hex("#C9C9D6"); col2 = hex("#9C8BFF"); alpha = .68; } else { col1 = hex("#4A4A56"); col2 = hex("#6A50F6"); alpha = .62; } }
  paint(); new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  /* ---------- size, scroll, pointer ---------- */
  var W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
  function resize() { W = innerWidth; H = innerHeight; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); gl.viewport(0, 0, canvas.width, canvas.height); }
  resize(); addEventListener("resize", resize);
  var target = 0, prog01 = 0, mx = 0, my = 0, tmx = 0, tmy = 0;
  function readScroll() { var max = Math.max(1, document.documentElement.scrollHeight - innerHeight); target = Math.min(1, Math.max(0, scrollY / Math.max(1, max - footerH()))); }
  function footerH() { var f = document.querySelector("footer"); return f ? Math.min(f.offsetHeight, document.documentElement.scrollHeight * .4) : 0; }
  readScroll(); addEventListener("scroll", readScroll, { passive: true });
  if (!mobile) addEventListener("pointermove", function (e) { tmx = e.clientX / W - .5; tmy = e.clientY / H - .5; }, { passive: true });

  var ease = function (x) { return x * x * (3 - 2 * x); };
  var last = performance.now(), clock = 0, running = true, raf = 0;
  function frame(now) {
    raf = 0; if (!running) return;
    var dt = Math.min(.05, (now - last) / 1000); last = now; if (!reduce) clock += dt;
    prog01 += (target - prog01) * Math.min(1, dt * 4.5);
    mx += (tmx - mx) * Math.min(1, dt * 3); my += (tmy - my) * Math.min(1, dt * 3);
    var heroIn = scrollY < innerHeight * .6;
    var S = SHAPES.length, seg = prog01 * (S - 1), i = Math.min(S - 1, Math.floor(seg)), j = Math.min(S - 1, i + 1), t = reduce ? 0 : ease(seg - i);
    bind(i, j);
    var wide = W > 900, side = wide ? (i % 2 ? -1 : 1) : 0, isWord = !reduce && j === S - 1 && t > .5;
    var dxTarget = wide ? (isWord ? 0 : (i === 0 && t < .5 ? .0 : side * .42 * (Math.sin(seg * Math.PI) * .5 + .5))) : 0;
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(U.t, t); gl.uniform1f(U.time, clock);
    gl.uniform1f(U.size, (mobile ? 2.8 : 3.2) * dpr);
    var spin = isWord ? (1 - t) * 1.2 : 1;
    gl.uniform1f(U.ay, (clock * .12 + prog01 * Math.PI * 2.2) * spin + mx * .5);
    gl.uniform1f(U.ax, (.35 + Math.sin(prog01 * Math.PI) * .45) * spin + my * .35);
    gl.uniform1f(U.aspect, W / H); gl.uniform1f(U.dx, dxTarget); var wordT = (j === S - 1 && !reduce) ? t : 0; gl.uniform1f(U.dy, (mobile ? .12 : 0) + wordT * (mobile ? .28 : .34));
    gl.uniform1f(U.scale, ((mobile ? .78 : .95) - wordT * (mobile ? .36 : .05)) * (1 + .32 * Math.max(0, 1 - prog01 * 12)));
    gl.uniform3fv(U.c1, col1); gl.uniform3fv(U.c2, col2); gl.uniform1f(U.alpha, alpha * (heroIn ? 1.25 : 1));
    var heroK = Math.min(1, scrollY / (innerHeight * .9)); scrim.style.opacity = (.25 + .75 * heroK).toFixed(3);
    gl.drawArrays(gl.POINTS, 0, N);
    if (!reduce || Math.abs(target - prog01) > .001) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && running) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  kick();
  if (reduce) addEventListener("scroll", kick, { passive: true });
  document.addEventListener("visibilitychange", function () { running = !document.hidden; if (running) kick(); });
  window.FODO_3D = { shapes: SHAPES.length, points: N, state: function () { return { progress: prog01, reduce: reduce, mobile: mobile }; } };
})();
