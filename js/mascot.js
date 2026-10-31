/* FODO mascot, original SVG/CSS "3D" robot. States: idle · wave · think · happy · surprised. Eyes follow the pointer. */
(function(){
  const SVG=(id)=>`<svg class="mas" viewBox="0 0 200 220" aria-hidden="true">
  <defs>
    <radialGradient id="${id}-sh" cx="35%" cy="25%" r="80%"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#e9ecf4"/><stop offset="1" stop-color="#b9c0d2"/></radialGradient>
    <radialGradient id="${id}-ac" cx="35%" cy="25%" r="80%"><stop offset="0" stop-color="#cfe6ff"/><stop offset=".6" stop-color="#8fbaf0"/><stop offset="1" stop-color="#5a86c8"/></radialGradient>
    <linearGradient id="${id}-sc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1d2b"/><stop offset="1" stop-color="#0b0d16"/></linearGradient>
    <radialGradient id="${id}-gl" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#9ff3ff"/><stop offset="1" stop-color="#3fd3ff"/></radialGradient>
    <filter id="${id}-blur"><feGaussianBlur stdDeviation="3"/></filter>
  </defs>
  <ellipse class="mas-shadow" cx="100" cy="212" rx="46" ry="7" fill="#000" opacity=".18" filter="url(#${id}-blur)"/>
  <g class="mas-body">
    <g class="mas-arm mas-arm-l"><ellipse cx="46" cy="148" rx="13" ry="30" fill="url(#${id}-sh)" transform="rotate(25 46 148)"/><ellipse cx="52" cy="128" rx="11" ry="12" fill="url(#${id}-ac)"/></g>
    <g class="mas-arm mas-arm-r"><ellipse cx="154" cy="148" rx="13" ry="30" fill="url(#${id}-sh)" transform="rotate(-25 154 148)"/><ellipse cx="148" cy="128" rx="11" ry="12" fill="url(#${id}-ac)"/></g>
    <path d="M62 120 Q100 108 138 120 L144 170 Q100 200 56 170 Z" fill="url(#${id}-sh)"/>
    <path d="M66 122 Q100 112 134 122 L130 150 Q100 162 70 150 Z" fill="url(#${id}-ac)" opacity=".95"/>
    <path d="M92 150 Q100 170 108 150 L104 178 Q100 184 96 178 Z" fill="url(#${id}-ac)" opacity=".9"/>
    <circle cx="100" cy="138" r="9" fill="url(#${id}-gl)" class="mas-core"/>
  </g>
  <g class="mas-head">
    <ellipse class="mas-ear" cx="34" cy="58" rx="9" ry="20" fill="url(#${id}-ac)" transform="rotate(-20 34 58)"/>
    <ellipse class="mas-ear mas-ear-r" cx="166" cy="58" rx="9" ry="20" fill="url(#${id}-ac)" transform="rotate(20 166 58)"/>
    <circle cx="44" cy="84" r="10" fill="url(#${id}-ac)"/><circle cx="156" cy="84" r="10" fill="url(#${id}-ac)"/>
    <rect x="46" y="38" width="108" height="86" rx="30" fill="url(#${id}-sh)"/>
    <rect x="58" y="52" width="84" height="60" rx="18" fill="url(#${id}-sc)"/>
    <path d="M66 60 h8 M66 60 v8 M134 60 h-8 M134 60 v8 M66 104 h8 M66 104 v-8 M134 104 h-8 M134 104 v-8" stroke="#7fe9ff" stroke-width="2" fill="none" opacity=".8"/>
    <g class="mas-eyes">
      <g class="mas-eye"><ellipse class="mas-pupil" cx="86" cy="82" rx="9" ry="11" fill="url(#${id}-gl)"/></g>
      <g class="mas-eye"><ellipse class="mas-pupil" cx="114" cy="82" rx="9" ry="11" fill="url(#${id}-gl)"/></g>
      <path class="mas-smile" d="M86 82 q6 -8 12 0 M102 82 q6 -8 12 0" stroke="#9ff3ff" stroke-width="4" stroke-linecap="round" fill="none" opacity="0"/>
      <rect class="mas-lid" x="58" y="52" width="84" height="0" rx="18" fill="url(#${id}-sc)"/>
    </g>
    <ellipse cx="80" cy="46" rx="22" ry="5" fill="#fff" opacity=".55"/>
  </g>
  <g class="mas-fx"><circle cx="170" cy="30" r="3" fill="#ffd166"/><circle cx="178" cy="22" r="2" fill="#ff8a9b"/><circle cx="24" cy="24" r="2.5" fill="#9b7bff"/></g>
</svg>`;
  const make=(id)=>{ const w=document.createElement("span"); w.className="mascot idle"; w.innerHTML=SVG(id); return w; };
  const all=[]; window.FODO_MASCOT={make:(id)=>{const m=make(id);all.push(m);return m;},set(state,ms){ all.forEach(m=>{ m.className="mascot "+state; }); if(ms)setTimeout(()=>all.forEach(m=>m.className="mascot idle"),ms); }};
  // eyes follow pointer (desktop)
  if(matchMedia("(hover:hover)").matches){ let raf; document.addEventListener("mousemove",e=>{ cancelAnimationFrame(raf); raf=requestAnimationFrame(()=>{ all.forEach(m=>{ const r=m.getBoundingClientRect(); if(!r.width)return; const dx=Math.max(-1,Math.min(1,(e.clientX-(r.left+r.width/2))/300)), dy=Math.max(-1,Math.min(1,(e.clientY-(r.top+r.height/2))/300)); m.style.setProperty("--ex",(dx*5).toFixed(1)+"px"); m.style.setProperty("--ey",(dy*4).toFixed(1)+"px"); m.style.setProperty("--tilt",(dx*6).toFixed(1)+"deg"); }); }); },{passive:true}); }
  // random blink
  setInterval(()=>{ all.forEach(m=>{ if(m.classList.contains("idle")){ m.classList.add("blink"); setTimeout(()=>m.classList.remove("blink"),180); } }); },3200+Math.random()*1500);
  // fast scroll → surprised
  let ly=scrollY,lt=Date.now(); addEventListener("scroll",()=>{ const now=Date.now(); const v=Math.abs(scrollY-ly)/Math.max(1,now-lt); ly=scrollY; lt=now; if(v>3)window.FODO_MASCOT.set("surprised",900); },{passive:true});
})();
