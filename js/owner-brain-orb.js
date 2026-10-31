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
  /* ---------- v26: the FODO particle sphere (default) — the website's 3-D sphere, alive ----------
     Thousands of glowing particles on a sphere (the same look as fodo.co.in's background) that breathe, ripple with sound and
     drift through noise. Its "mood" wanders on its own: now and then it flows into a ring, a double helix, a nebula — or spells
     FODO — and back. Listening: teal and alert. You speaking: waves run through it. Thinking: it twists into a helix and spins.
     FODO speaking: warm gold pulses with every syllable. Everything is computed live; nothing loops. */
  var PST = {
    idle: { c1: [0.62, 0.55, 1.0], c2: [0.35, 0.65, 1.0], amp: 0.07, spin: 0.10, size: 1.0 },
    listening: { c1: [0.25, 0.95, 0.88], c2: [0.45, 0.6, 1.0], amp: 0.10, spin: 0.16, size: 1.05 },
    hearing: { c1: [0.4, 1.0, 0.95], c2: [0.65, 0.55, 1.0], amp: 0.16, spin: 0.24, size: 1.15 },
    thinking: { c1: [1.0, 0.72, 0.30], c2: [0.70, 0.50, 1.0], amp: 0.12, spin: 0.9, size: 1.0 },
    speaking: { c1: [1.0, 0.66, 0.28], c2: [1.0, 0.85, 0.55], amp: 0.12, spin: 0.22, size: 1.15 },
  };
  var NOISE = "vec3 m289(vec3 x){return x-floor(x*(1./289.))*289.;}vec4 m289(vec4 x){return x-floor(x*(1./289.))*289.;}vec4 pm(vec4 x){return m289(((x*34.)+1.)*x);}" +
    "float sn(vec3 v){const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);" +
    "vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=m289(i);vec4 p=pm(pm(pm(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));" +
    "float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);" +
    "vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;" +
    "vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);vec4 nm=1.79284291400159-.85373472095314*vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3));p0*=nm.x;p1*=nm.y;p2*=nm.z;p3*=nm.w;" +
    "vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}";
  var PVS = "attribute vec3 a;attribute vec3 b;attribute float s;uniform float T,L,A,M,ax,ay,az,sz,asp,rip,fq;varying float vD;varying float vN;varying float vS;" + NOISE +
    "void main(){vec3 p=mix(a,b,M);float n=sn(p*fq+vec3(0.,T*.35,T*.2));float n2=sn(p*3.7-vec3(T*.8));" +
    "float r=length(p);vec3 dir=p/max(r,.0001);float wave=sin(r*9.-T*11.+n*2.)*rip;" +
    "p+=dir*(n*A+n2*L*.16+wave)+vec3(sin(T*.7+s*30.),cos(T*.6+s*21.),sin(T*.5+s*17.))*.012;p*=1.+L*.12+sin(T*1.5)*.015;" +
    "float cy=cos(ay),sy=sin(ay),cx=cos(ax),sx=sin(ax),cz=cos(az),sz2=sin(az);p=vec3(cy*p.x+sy*p.z,p.y,-sy*p.x+cy*p.z);p=vec3(p.x,cx*p.y-sx*p.z,sx*p.y+cx*p.z);p=vec3(cz*p.x-sz2*p.y,sz2*p.x+cz*p.y,p.z);" +
    "float z=p.z+3.;vec2 q=vec2(p.x/asp,p.y)*(2.25/z)*.62;gl_Position=vec4(q,0.,1.);" +
    "gl_PointSize=sz*(2.4/z)*(.55+s*.9)*(1.+L*.6+max(n,0.)*.5);vD=clamp(1.35-(z-2.)*.55,.15,1.);vN=n;vS=s;}";
  var PFS = "precision mediump float;uniform vec3 c1,c2;uniform float br,L;varying float vD;varying float vN;varying float vS;" +
    "void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d);if(r>.25)discard;float e=smoothstep(.25,0.,r);vec3 col=mix(c2,c1,clamp(vN*.8+.5,0.,1.));" +
    "col=mix(col,vec3(1.),step(.93,vS)*.6);gl_FragColor=vec4(col*e*vD*br*(vS>.93?1.6:1.),e*vD*br);}";
  function mountParticles(cv, opt) {
    opt = opt || {}; var gl = null; try { gl = cv.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false }); } catch (e) {}
    if (!gl) return mountCircuit(cv, opt);
    var mobile = /Android|iPhone|iPad/i.test(navigator.userAgent), N = opt.small ? 900 : mobile ? 4200 : 8000;
    function sh(t, src) { var o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }
    var pr; try { pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, PVS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, PFS)); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw 0; } catch (e) { return mountCircuit(cv, opt); }
    gl.useProgram(pr);
    function rnd(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
    function shape(fn) { var a = new Float32Array(N * 3); for (var i = 0; i < N; i++) { var p = fn(i); a[i * 3] = p[0]; a[i * 3 + 1] = p[1]; a[i * 3 + 2] = p[2]; } return a; }
    var GA = Math.PI * (3 - Math.sqrt(5));
    var sphere = shape(function (i) { var y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), t = GA * i, k = 1 + (rnd(i) - .5) * .05; return [Math.cos(t) * r * k, y * k, Math.sin(t) * r * k]; });
    var torus = shape(function (i) { var u = rnd(i) * 6.2832, v = rnd(i + 7) * 6.2832; return [(1.05 + .3 * Math.cos(v)) * Math.cos(u), .3 * Math.sin(v), (1.05 + .3 * Math.cos(v)) * Math.sin(u)]; });
    var helix = shape(function (i) { var sd = i % 2 ? Math.PI : 0, t = (i / N) * Math.PI * 7 - Math.PI * 3.5, r = .62 + (rnd(i) - .5) * .12; return [Math.cos(t + sd) * r, t / 4.6, Math.sin(t + sd) * r]; });
    var nebula = shape(function (i) { var r = Math.pow(rnd(i + 3), .6) * 1.15, th = rnd(i + 5) * 6.2832, ph = Math.acos(2 * rnd(i + 11) - 1); return [r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * .7, r * Math.sin(ph) * Math.sin(th)]; });
    var word = (function () { try { var c = document.createElement("canvas"), W = 300, H = 100; c.width = W; c.height = H; var x = c.getContext("2d"); x.font = "800 86px Inter, Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("FODO", W / 2, H / 2 + 4); var d = x.getImageData(0, 0, W, H).data, pts = []; for (var yy = 0; yy < H; yy += 2) for (var xx = 0; xx < W; xx += 2) if (d[(yy * W + xx) * 4 + 3] > 128) pts.push([(xx / W - .5) * 2.9, -(yy / H - .5) * .97, 0]); if (!pts.length) return null; return shape(function (i) { var p = pts[Math.floor(i * pts.length / N) % pts.length]; return [p[0], p[1], (rnd(i + 9) - .5) * .1]; }); } catch (e) { return null; } })();
    var SH = { sphere: sphere, torus: torus, helix: helix, nebula: nebula }; if (word && !opt.small) SH.word = word;
    var B = {}; Object.keys(SH).forEach(function (k) { var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, SH[k], gl.STATIC_DRAW); B[k] = b; });
    var seeds = new Float32Array(N); for (var i = 0; i < N; i++) seeds[i] = rnd(i * 3.7 + 1); var sb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, sb); gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
    var LA = gl.getAttribLocation(pr, "a"), LB = gl.getAttribLocation(pr, "b"), LS = gl.getAttribLocation(pr, "s");
    gl.enableVertexAttribArray(LA); gl.enableVertexAttribArray(LB); gl.enableVertexAttribArray(LS);
    gl.bindBuffer(gl.ARRAY_BUFFER, B.sphere); gl.vertexAttribPointer(LA, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, sb); gl.vertexAttribPointer(LS, 1, gl.FLOAT, false, 0, 0);
    var U = {}; ["T", "L", "A", "M", "ax", "ay", "az", "sz", "asp", "rip", "fq", "c1", "c2", "br"].forEach(function (k) { U[k] = gl.getUniformLocation(pr, k); });
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    var stN = "idle", st = PST.idle, c1 = st.c1.slice(), c2 = st.c2.slice(), amp = st.amp, spin = st.spin, lvl = 0, lvlT = 0, prevL = 0, T = Math.random() * 100;
    var yaw = Math.random() * 6.28, tilt = 0.3, roll = 0, goal = { tilt: 0.3, roll: 0, fq: 1.4, spinMul: 1 }, fq = 1.4, morph = 0, morphGoal = 0, target = "torus", nextMood = performance.now() + 3500, raf = 0, dead = false, last = performance.now();
    function bindB(k) { target = k; gl.bindBuffer(gl.ARRAY_BUFFER, B[k]); gl.vertexAttribPointer(LB, 3, gl.FLOAT, false, 0, 0); } bindB("torus");
    function mood(now, burst) {
      goal.tilt = (Math.random() - .5) * 1.4; goal.roll = (Math.random() - .5) * .7; goal.fq = 0.9 + Math.random() * 1.6; goal.spinMul = (Math.random() < .2 ? -1 : 1) * (.6 + Math.random() * 1.1);
      if (stN === "thinking") { if (morph < .05) bindB("helix"); morphGoal = .55 + Math.random() * .3; }
      else if (stN === "idle" && Math.random() < .45) { if (morph < .05) bindB(["torus", "nebula", "helix"].concat(SH.word ? ["word", "word"] : [])[Math.random() * (SH.word ? 5 : 3) | 0]); morphGoal = target === "word" ? .92 : .35 + Math.random() * .4; }
      else if (burst && stN === "speaking" && Math.random() < .3) { if (morph < .05) bindB("nebula"); morphGoal = .25 + Math.random() * .25; }
      else morphGoal = 0;
      nextMood = now + (burst ? 1500 : 3000) + Math.random() * (stN === "idle" ? 7000 : 4000);
    }
    function frame(now) {
      if (dead) return; raf = requestAnimationFrame(frame);
      if (document.hidden || !cv.offsetParent) { last = now; return; }
      var dt = Math.min(.05, (now - last) / 1000); if ((opt.small || mobile) && dt < .028) return; last = now; T += dt;
      var dpr = Math.min(window.devicePixelRatio || 1, opt.small ? 2 : mobile ? 1.5 : 1.75), W = Math.round((cv.clientWidth || 100) * dpr), H = Math.round((cv.clientHeight || 100) * dpr);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; } gl.viewport(0, 0, W, H);
      lvl += (lvlT - lvl) * (lvlT > lvl ? .5 : .1);
      var f = .05; for (var q = 0; q < 3; q++) { c1[q] += (st.c1[q] - c1[q]) * f; c2[q] += (st.c2[q] - c2[q]) * f; } amp += (st.amp - amp) * f;
      var burst = lvl - prevL > .2; prevL = lvl; if (now > nextMood || (burst && !opt.small && Math.random() < .5)) mood(now, burst);
      if (stN !== "idle" && target === "word") morphGoal = 0;
      morph += (morphGoal - morph) * dt * (target === "word" ? 1.1 : .7); if (morph < .02 && morphGoal === 0 && target === "word") morph = 0;
      tilt += (goal.tilt - tilt) * dt * .5; roll += (goal.roll - roll) * dt * .4; fq += (goal.fq - fq) * dt * .4;
      var sp = st.spin * goal.spinMul * (1 + lvl * 1.8) * (target === "word" && morph > .5 ? .15 : 1); spin += (sp - spin) * dt * 1.5; yaw += spin * dt;
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(U.T, T); gl.uniform1f(U.L, lvl); gl.uniform1f(U.A, amp * (1 + lvl * 1.5)); gl.uniform1f(U.M, morph);
      var wordK = target === "word" ? Math.min(1, morph * 1.4) : 0; gl.uniform1f(U.ax, (tilt + Math.sin(T * .31) * .08) * (1 - wordK)); gl.uniform1f(U.ay, target === "word" && morph > .5 ? Math.sin(T * .4) * .35 * (1 - morph) : yaw); gl.uniform1f(U.az, roll * (1 - wordK));
      gl.uniform1f(U.sz, (opt.small ? 1.9 : mobile ? 2.1 : 2.3) * dpr * st.size); gl.uniform1f(U.asp, W / H); gl.uniform1f(U.rip, stN === "speaking" || stN === "hearing" ? lvl * .09 : 0); gl.uniform1f(U.fq, fq);
      gl.uniform3fv(U.c1, c1); gl.uniform3fv(U.c2, c2); gl.uniform1f(U.br, (opt.small ? .5 : mobile ? .36 : .3) * (1 + lvl * .6) * (document.documentElement.getAttribute("data-theme") === "light" ? 1.25 : 1));
      gl.drawArrays(gl.POINTS, 0, N);
    }
    raf = requestAnimationFrame(frame);
    cv.addEventListener("webglcontextlost", function (e) { e.preventDefault(); dead = true; });
    return { state: function (s) { if (PST[s] && s !== stN) { stN = s; st = PST[s]; nextMood = performance.now() + (s === "thinking" ? 200 : 1500); if (target === "word") morphGoal = 0; } }, level: function (v) { lvlT = Math.max(0, Math.min(1, +v || 0)); }, destroy: function () { dead = true; cancelAnimationFrame(raf); try { var x = gl.getExtension("WEBGL_lose_context"); if (x) x.loseContext(); } catch (e) {} }, particles: true };
  }
  /* ---------- v25: the FODO neural circuit sphere (default) ----------
     Glowing traces grow across three shells of a 3-D sphere like circuitry being drawn live, branch, fade and are replaced by new
     ones; broken ring arcs orbit it on drifting axes. Nothing is pre-recorded: every trace is generated on the fly, and the
     "mood" (spin, tilt, density, growth speed) keeps wandering towards new random targets — and jumps whenever the voice peaks —
     so it never repeats. Sound drives it: louder speech → more traces, faster growth, brighter glow, a pulsing radius. */
  var CIRC = {
    idle: { c: [150, 130, 255], c2: [95, 170, 255], spin: 0.10, grow: 0.5, dens: 0.55 },
    listening: { c: [70, 225, 210], c2: [110, 160, 255], spin: 0.16, grow: 0.8, dens: 0.75 },
    hearing: { c: [110, 245, 235], c2: [150, 140, 255], spin: 0.26, grow: 1.4, dens: 1.0 },
    thinking: { c: [255, 185, 90], c2: [175, 125, 255], spin: 0.55, grow: 2.2, dens: 1.0 },
    speaking: { c: [255, 168, 80], c2: [255, 215, 150], spin: 0.30, grow: 1.6, dens: 1.0 },
  };
  function mountCircuit(cv, opt) {
    opt = opt || {}; var ctx = cv.getContext("2d"); if (!ctx) return mount2d(cv, opt);
    var small = !!opt.small, MAXT = small ? 70 : 260, raf = 0, dead = false, last = performance.now(), t = 0;
    var st = CIRC.idle, col = st.c.slice(), col2 = st.c2.slice(), lvl = 0, lvlT = 0, prevL = 0;
    var mood = { spin: 0.1, tilt: 0.35, roll: 0, dens: 0.6, grow: 0.6 }, goal = { tilt: 0.35, roll: 0, spinMul: 1, dens: 1 }, nextGoal = 0;
    var yaw = Math.random() * 6.28, pitch = 0.35, roll = 0, traces = [], rings = [], R = Math.random;
    var SHELLS = small ? [{ r: 1, band: 1.6, w: 1 }, { r: 0.55, band: 1.6, w: 0.6 }] : [{ r: 1, band: 1.6, w: 1 }, { r: 0.56, band: 1.6, w: 0.7 }, { r: 1.17, band: 0.42, w: 0.55 }];
    function newRing() { return { tilt: (R() - 0.5) * 2.4, phase: R() * 6.28, sp: (R() < 0.5 ? -1 : 1) * (0.15 + R() * 0.5), r: 1.08 + R() * 0.3, arcs: Array.from({ length: 3 + (R() * 4 | 0) }, function () { var a = R() * 6.28; return [a, a + 0.25 + R() * 1.4]; }), life: 0, max: 6 + R() * 10 }; }
    for (var k = 0; k < (small ? 1 : 3); k++) { var rg = newRing(); rg.life = R() * rg.max; rings.push(rg); }
    var DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    function spawn(lat, lon, shell) {
      var sh = shell == null ? (R() < 0.62 ? 0 : R() < 0.6 || SHELLS.length < 3 ? 1 : 2) : shell, S = SHELLS[sh];
      lat = lat != null ? lat : (R() * 2 - 1) * S.band * 0.95; lon = lon != null ? lon : R() * 6.283;
      traces.push({ sh: sh, pts: [[lat, lon]], dir: (R() * 8) | 0, max: 8 + (R() * (small ? 20 : 44) | 0), age: 0, fade: 0, acc: 0, step: 0.028 + R() * 0.03 });
    }
    for (var i = 0; i < MAXT * 0.5; i++) { spawn(); var tr = traces[traces.length - 1], n = R() * tr.max | 0; while (n--) grow(tr); }
    function grow(tr) {
      var S = SHELLS[tr.sh], p = tr.pts[tr.pts.length - 1];
      if (R() < 0.22) tr.dir = (tr.dir + (R() < 0.5 ? 1 : 7)) % 8;   // 45° turns, like real circuit traces
      var d = DIRS[tr.dir], lat = p[0] + d[1] * tr.step, lon = p[1] + d[0] * tr.step / Math.max(0.25, Math.cos(p[0]));
      if (Math.abs(lat) > S.band) { tr.dir = (tr.dir + 4) % 8; lat = p[0]; }
      tr.pts.push([lat, lon]);
      if (R() < 0.035 && traces.length < MAXT) spawn(lat, lon, tr.sh);   // branch
    }
    function rot(x, y, z) {   // yaw (Y) → pitch (X) → roll (Z)
      var cy = Math.cos(yaw), sy = Math.sin(yaw), x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
      var cp = Math.cos(pitch), sp = Math.sin(pitch), y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      var cr = Math.cos(roll), sr = Math.sin(roll); return [x1 * cr - y2 * sr, x1 * sr + y2 * cr, z2];
    }
    function size() { var d = Math.min(window.devicePixelRatio || 1, small ? 2 : 1.75), w = Math.round((cv.clientWidth || 100) * d), h = Math.round((cv.clientHeight || 100) * d); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } return d; }
    function rgba(c, a) { return "rgba(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + "," + Math.max(0, Math.min(1, a)).toFixed(3) + ")"; }
    function frame(now) {
      if (dead) return; raf = requestAnimationFrame(frame);
      if (document.hidden || !cv.offsetParent) { last = now; return; }
      var dt = Math.min(0.05, (now - last) / 1000); if (small && dt < 0.03) return; last = now; t += dt;
      var dpr = size(), W = cv.width, H = cv.height, cx = W / 2, cy = H / 2, base = Math.min(W, H) * (small ? 0.40 : 0.33);
      // sound + mood
      lvl += (lvlT - lvl) * (lvlT > lvl ? 0.45 : 0.08);
      for (var q = 0; q < 3; q++) { col[q] += (st.c[q] - col[q]) * 0.06; col2[q] += (st.c2[q] - col2[q]) * 0.06; }
      if (now > nextGoal || (lvl - prevL > 0.22 && !small)) { goal.tilt = (R() - 0.5) * 1.6; goal.roll = (R() - 0.5) * 0.9; goal.spinMul = (R() < 0.25 ? -1 : 1) * (0.6 + R() * 1.2); goal.dens = 0.6 + R() * 0.6; nextGoal = now + 2500 + R() * 6000;
        if (lvl - prevL > 0.22) for (var b = 0; b < 10 && traces.length < MAXT; b++) spawn(); }
      prevL = lvl;
      mood.tilt += (goal.tilt - mood.tilt) * dt * 0.6; mood.roll += (goal.roll - mood.roll) * dt * 0.5;
      var spinT = st.spin * goal.spinMul * (1 + lvl * 2.2); mood.spin += (spinT - mood.spin) * dt * 1.5;
      yaw += mood.spin * dt; pitch = mood.tilt + Math.sin(t * 0.37) * 0.08; roll = mood.roll + Math.sin(t * 0.23) * 0.05;
      var pulse = 1 + Math.sin(t * 1.4) * 0.018 + lvl * 0.16 + (Math.sin(t * 9.3) * 0.5 + 0.5) * lvl * 0.05, Rr = base * pulse;
      // grow / spawn / retire traces
      var target = MAXT * st.dens * goal.dens * (0.75 + lvl * 0.5); while (traces.length < target) spawn();
      var g = st.grow * (1 + lvl * 3), alive = [];
      traces.forEach(function (tr) { tr.age += dt; if (tr.pts.length < tr.max) { tr.acc += g * dt * 18; while (tr.acc > 1 && tr.pts.length < tr.max) { grow(tr); tr.acc--; } } else tr.fade += dt * (0.35 + R() * 0.3 + lvl * 0.6); if (tr.fade < 1) alive.push(tr); });
      traces = alive;
      // draw
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
      var halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rr * 1.55); halo.addColorStop(0, rgba(col, 0.20 + lvl * 0.25)); halo.addColorStop(0.45, rgba(col, 0.07 + lvl * 0.08)); halo.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter"; ctx.lineJoin = "round"; ctx.lineCap = "round";
      var front = [new Path2D(), new Path2D(), new Path2D()], back = new Path2D(), dots = new Path2D();
      traces.forEach(function (tr) {
        var S = SHELLS[tr.sh], rr = Rr * S.r, P = [], vis = 0;
        for (var j = 0; j < tr.pts.length; j++) { var a = tr.pts[j], cl = Math.cos(a[0]), v = rot(cl * Math.cos(a[1]), Math.sin(a[0]), cl * Math.sin(a[1])), f = 3.2 / (3.2 + v[2]); P.push([cx + v[0] * rr * f, cy + v[1] * rr * f, v[2]]); vis += v[2]; }
        var path = vis / P.length < 0.05 ? front[tr.sh] : back, fadeIn = Math.min(1, tr.age * 3);
        if (tr.fade > 0.55 || fadeIn < 0.4) path = back;
        path.moveTo(P[0][0], P[0][1]); for (var m = 1; m < P.length; m++) path.lineTo(P[m][0], P[m][1]);
        var e = P[P.length - 1]; if (e[2] < 0.1 && !small) { dots.moveTo(e[0] + 1.6 * dpr, e[1]); dots.arc(e[0], e[1], 1.6 * dpr, 0, 6.283); }
      });
      var bright = 0.75 + lvl * 0.45;
      ctx.lineWidth = 1 * dpr; ctx.strokeStyle = rgba(col2, 0.16 * bright); ctx.stroke(back);
      for (var sIdx = front.length - 1; sIdx >= 0; sIdx--) { if (!SHELLS[sIdx]) continue;
        ctx.lineWidth = (small ? 2.4 : 3.6) * dpr; ctx.strokeStyle = rgba(col, 0.10 * bright * SHELLS[sIdx].w); ctx.stroke(front[sIdx]);
        ctx.lineWidth = (small ? 1.1 : 1.15) * dpr; ctx.strokeStyle = rgba(sIdx === 1 ? col2 : col, 0.85 * bright * SHELLS[sIdx].w); ctx.stroke(front[sIdx]); }
      ctx.lineWidth = 1 * dpr; ctx.strokeStyle = rgba(col, 0.9 * bright); ctx.stroke(dots);
      // orbiting broken rings
      rings.forEach(function (rg, ri) {
        rg.life += dt; rg.phase += rg.sp * dt * (1 + lvl * 1.5); var fadeR = Math.min(1, rg.life, (rg.max - rg.life)); if (rg.life > rg.max) { rings[ri] = newRing(); return; }
        var ct = Math.cos(rg.tilt), stt = Math.sin(rg.tilt), rr = Rr * rg.r; ctx.beginPath();
        rg.arcs.forEach(function (ar) { for (var a = ar[0]; a <= ar[1]; a += 0.05) { var x = Math.cos(a + rg.phase), z0 = Math.sin(a + rg.phase), v = rot(x, z0 * stt, z0 * ct), f = 3.2 / (3.2 + v[2]), px = cx + v[0] * rr * f, py = cy + v[1] * rr * f; a === ar[0] ? ctx.moveTo(px, py) : ctx.lineTo(px, py); } });
        ctx.lineWidth = (small ? 1 : 1.4) * dpr; ctx.strokeStyle = rgba(col, (0.35 + lvl * 0.4) * fadeR); ctx.stroke();
        ctx.lineWidth = 4 * dpr; ctx.strokeStyle = rgba(col, 0.06 * fadeR); ctx.stroke();
      });
      // core
      ctx.globalCompositeOperation = "lighter";
      var core = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rr * 0.55); core.addColorStop(0, rgba([255, 240, 220], 0.35 + lvl * 0.4)); core.addColorStop(0.3, rgba(col, 0.18 + lvl * 0.25)); core.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(cx, cy, Rr * 0.55, 0, 6.283); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
    raf = requestAnimationFrame(frame);
    return { state: function (s) { if (CIRC[s]) st = CIRC[s]; }, level: function (v) { lvlT = Math.max(0, Math.min(1, +v || 0)); }, destroy: function () { dead = true; cancelAnimationFrame(raf); }, circuit: true };
  }
  function mountGL(cv, opt) {
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
  window.FodoOrb = { mount: function (cv, opt) { opt = opt || {}; return opt.style === "plasma" ? mountGL(cv, opt) : opt.style === "circuit" ? mountCircuit(cv, opt) : mountParticles(cv, opt); }, meter: meter, unlock: unlock };
})();
