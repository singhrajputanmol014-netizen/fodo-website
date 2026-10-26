/* FODO main — shared shell (header, drawer, footer, cookie), utilities, hero signal. Each module is error-isolated. */
(function(){
  const C = window.FODO || {};
  const root = (document.querySelector('meta[name="fodo-root"]')||{}).content || "./";
  const U = window.FODO_UTIL = {
    root,
    esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); },
    wa(msg){ return `https://wa.me/${C.whatsappNumber}?text=${encodeURIComponent(msg||"Hi FODO, I'd like to talk about growing my business.")}`; },
    q(name){ try{ return new URLSearchParams(location.search).get(name)||""; }catch(e){ return ""; } },
    inr(n){ return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n); },
    safe(fn,label){ try{ fn(); }catch(e){ console.warn("[FODO module failed]",label,e); } },
    copy(text,btn){ const done=()=>{ if(btn){const o=btn.textContent;btn.textContent="COPIED ✓";setTimeout(()=>btn.textContent=o,1800);} };
      const fail=()=>{ if(btn){const o=btn.textContent;btn.textContent="COPY FAILED — SELECT & COPY";setTimeout(()=>btn.textContent=o,2500);} window.prompt("Copy this text:",text); };
      if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(done,()=>{U.copyLegacy(text)?done():fail();}); } else { U.copyLegacy(text)?done():fail(); } },
    copyLegacy(text){ try{ const t=document.createElement("textarea");t.value=text;t.setAttribute("readonly","");t.style.position="fixed";t.style.left="-9999px";document.body.appendChild(t);t.select();const ok=document.execCommand("copy");document.body.removeChild(t);return ok; }catch(e){ return false; } },
    focusTrap(el){ const f=()=>[...el.querySelectorAll('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x=>x.offsetParent!==null);
      return e=>{ if(e.key!=="Tab")return; const n=f(); if(!n.length)return; const a=n[0],z=n[n.length-1]; if(e.shiftKey&&document.activeElement===a){z.focus();e.preventDefault();} else if(!e.shiftKey&&document.activeElement===z){a.focus();e.preventDefault();} }; },
    openModal(id,opener){ const m=document.getElementById(id); if(!m)return; m.classList.add("open"); document.body.classList.add("locked"); m._opener=opener||document.activeElement; const trap=U.focusTrap(m); m._trap=trap; m.addEventListener("keydown",trap);
      const first=m.querySelector('.modal-close,button,a,input'); if(first)first.focus();
      m._esc=e=>{ if(e.key==="Escape")U.closeModal(id); }; document.addEventListener("keydown",m._esc);
      m._out=e=>{ if(e.target===m)U.closeModal(id); }; m.addEventListener("click",m._out); },
    closeModal(id){ const m=document.getElementById(id); if(!m)return; m.classList.remove("open"); document.body.classList.remove("locked"); document.removeEventListener("keydown",m._esc); m.removeEventListener("keydown",m._trap); m.removeEventListener("click",m._out); if(m._opener&&m._opener.focus)m._opener.focus(); },
    reveal(){ const els=document.querySelectorAll(".reveal"); if(!("IntersectionObserver" in window)){els.forEach(e=>e.classList.add("in"));return;} const io=new IntersectionObserver(en=>en.forEach(x=>{if(x.isIntersecting){x.target.classList.add("in");io.unobserve(x.target);}}),{threshold:.12}); els.forEach(e=>io.observe(e)); }
  };
  const P = p => root + p; // route helper
  const routes = {
    home:P(""), about:P("about/"), services:P("services/"), industries:P("industries/"), work:P("work/"), insights:P("insights/"), resources:P("resources/"),
    lab:P("#growth-lab"), score:P("growth-score/"), roi:P("roi-calculator/"), game:P("fodo-challenge/"), quiz:P("marketing-quiz/"),
    contact:P("contact/"), reviews:P("reviews/"), audit:P("contact/?mode=audit"), call:P("contact/?mode=call"), faq:P("faq/"), pricing:P("faq/#pricing"), legal:P("legal/"), thanks:P("thank-you/")
  };
  U.routes = routes;
  const here = (document.body.dataset.route==="service"?"services":document.body.dataset.route) || "";
  const cur = key => key===here ? ' aria-current="page"' : "";
  const ext = ' target="_blank" rel="noopener noreferrer"';
  const ico = {
    menu:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
    close:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    wa:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.8-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.1.6 2.8.5a2.4 2.4 0 0 0 1.6-1.1 2 2 0 0 0 .1-1.1c0-.1-.2-.2-.5-.3z"/></svg>',
    mail:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
    tel:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
    ig:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>',
    li:'<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5A2.5 2.5 0 1 1 5 8.5a2.5 2.5 0 0 1-.02-5zM3 9h4v12H3zM10 9h3.8v1.7h.1c.5-1 1.8-2 3.7-2 4 0 4.4 2.6 4.4 6V21h-4v-5.3c0-1.3 0-2.9-1.8-2.9s-2.1 1.4-2.1 2.8V21h-4z"/></svg>',
    pin:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    wa16:'<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.8-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.1.6 2.8.5a2.4 2.4 0 0 0 1.6-1.1 2 2 0 0 0 .1-1.1c0-.1-.2-.2-.5-.3z"/></svg>',
    sun:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    arrow:'<svg class="arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 17L17 7M8 7h9v9"/></svg>'
  };
  U.ico = ico;

  /* ---- Header / drawer / mobile bar ---- */
  U.safe(()=>{
    const h=document.getElementById("site-header"); if(!h)return;
    h.className="header"; h.innerHTML=`<div class="container">
      <a class="wordmark" href="${routes.home||'./'}" aria-label="FODO home"><b>FODO</b><small>FEAR OF DIGITALLY OUT ?</small></a>
      <nav class="nav" aria-label="Primary">
        <a href="${routes.work}"${cur("work")}>Work</a><a href="${routes.reviews}"${cur("reviews")}>Reviews</a><a href="${routes.services}"${cur("services")}>Services</a>
        <div class="sub"><button class="sub-btn" type="button" aria-expanded="false" aria-haspopup="true">Growth Lab <span aria-hidden="true">▾</span></button>
          <div class="sub-menu"><a href="${routes.lab}"${cur("lab")}>Growth Lab</a><a href="${routes.score}"${cur("score")}>Growth Score</a><a href="${routes.roi}"${cur("roi")}>ROI Calculator</a><a href="${routes.game}"${cur("game")}>FODO Challenge</a><a href="${routes.quiz}"${cur("quiz")}>Marketing Quiz</a></div></div>
        <a href="${routes.about}"${cur("about")}>About</a><a href="${routes.insights}"${cur("insights")}>Insights</a><a href="${routes.contact}"${cur("contact")}>Contact</a>
      </nav>
      <button class="theme-btn" type="button" id="theme-toggle" aria-label="Toggle dark / light mode" title="Dark / light"><span class="tb-sun">${ico.sun}</span><span class="tb-moon">${ico.moon}</span></button><a class="btn header-cta" href="${routes.audit}">Book a Free Growth Audit</a>
      <button class="burger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="drawer">${ico.menu}</button></div>`;
    const sub=h.querySelector(".sub"), sb=h.querySelector(".sub-btn");
    sb.addEventListener("click",()=>{const o=sub.classList.toggle("open");sb.setAttribute("aria-expanded",o);});
    document.addEventListener("click",e=>{ if(!sub.contains(e.target)){sub.classList.remove("open");sb.setAttribute("aria-expanded","false");} });
    sub.addEventListener("keydown",e=>{ if(e.key==="Escape"){sub.classList.remove("open");sb.setAttribute("aria-expanded","false");sb.focus();} });
    addEventListener("scroll",()=>h.classList.toggle("scrolled",scrollY>8),{passive:true});
    // Drawer
    const d=document.createElement("div"); d.id="drawer"; d.className="drawer"; d.setAttribute("role","dialog"); d.setAttribute("aria-modal","true"); d.setAttribute("aria-label","Menu");
    const grp=(t,items,cls)=>`<div class="dgrp"><span class="dlabel">${t}</span><div class="${cls||"dlist"}">${items.map(l=>`<a href="${routes[l[1]]}" class="${l[2]||""}"${cur(l[1])}>${l[0]}</a>`).join("")}</div></div>`;
    d.innerHTML=`<div class="drawer-top"><a class="wordmark" href="${routes.home||'./'}"><b>FODO</b><small>FEAR OF DIGITALLY OUT ?</small></a><button class="burger" type="button" aria-label="Close menu">${ico.close}</button></div>
      <nav aria-label="Mobile">${grp("Explore",[["Home","home"],["About","about"],["Services","services"],["Industries","industries"],["Work","work"],["Insights","insights"]])}
      ${grp("Growth Lab",[["Growth Score","score"],["ROI Calculator","roi"],["Play the Game","game","hot"],["Marketing Quiz","quiz"]],"dgrid")}
      ${grp("More",[["Resources","resources"],["FAQ","faq"],["Pricing","pricing"],["Contact","contact"]],"dgrid")}</nav>
      <a class="btn" href="${routes.audit}">Book a Free Growth Audit</a><div class="dcontact"><a href="${U.wa()}" target="_blank" rel="noopener noreferrer">WhatsApp</a> · <a href="mailto:${C.email}">Email</a> · <a href="tel:${C.phone}">Call</a></div>`;
    document.body.appendChild(d);
    const open=h.querySelector(".burger"), close=d.querySelector(".burger"); let trap, scrollPos=0;
    const show=()=>{scrollPos=scrollY;d.classList.add("open");document.body.classList.add("locked");open.setAttribute("aria-expanded","true");trap=U.focusTrap(d);d.addEventListener("keydown",trap);close.focus();};
    const hide=()=>{d.classList.remove("open");document.body.classList.remove("locked");open.setAttribute("aria-expanded","false");d.removeEventListener("keydown",trap);open.focus();scrollTo(0,scrollPos);};
    open.addEventListener("click",show); close.addEventListener("click",hide);
    document.addEventListener("keydown",e=>{ if(e.key==="Escape"&&d.classList.contains("open"))hide(); });
    d.querySelectorAll("nav a").forEach(a=>a.addEventListener("click",()=>{d.classList.remove("open");document.body.classList.remove("locked");}));
    matchMedia("(min-width:1024px)").addEventListener("change",e=>{ if(e.matches&&d.classList.contains("open"))hide(); });
    // (mobile sticky bar removed by request)
  },"header");

  /* ---- Footer ---- */
  U.safe(()=>{
    const f=document.getElementById("site-footer"); if(!f)return; f.className="footer";
    const S=s=>`${routes.services}${s}/`;
    f.innerHTML=`<div class="container"><div class="footer-mark" aria-hidden="true">FODO</div><div class="footer-sub">FEAR OF DIGITALLY OUT.</div>
    <div class="footer-cols">
      <div><h4>Company</h4><ul><li><a href="${routes.about}">About</a></li><li><a href="${routes.about}#founder">Founder</a></li><li><a href="${routes.work}">Work</a></li><li><a href="${routes.reviews}">Reviews</a></li><li><a href="${routes.insights}">Insights</a></li><li><a href="${routes.contact}">Contact</a></li></ul></div>
      <div><h4>Services</h4><ul><li><a href="${S('paid-advertising')}">Paid Media</a></li><li><a href="${S('seo')}">SEO</a></li><li><a href="${S('content-marketing')}">Content</a></li><li><a href="${S('social-media')}">Social</a></li><li><a href="${S('brand-strategy')}">Brand</a></li><li><a href="${S('marketing-automation')}">Automation</a></li></ul></div>
      <div><h4>Tools</h4><ul><li><a href="${routes.score}">Growth Score</a></li><li><a href="${routes.roi}">ROI Calculator</a></li><li><a href="${routes.lab}">Growth Lab</a></li><li><a href="${routes.game}">FODO Challenge</a></li><li><a href="${routes.quiz}">Marketing Quiz</a></li></ul></div>
      <div><h4>Legal</h4><ul><li><a href="${routes.legal}#privacy">Privacy</a></li><li><a href="${routes.legal}#cookies">Cookie Policy</a></li><li><a href="${routes.legal}#terms">Terms</a></li><li><a href="${routes.legal}#disclaimer">Disclaimer</a></li></ul></div>
      <div><h4>Contact</h4><address class="contact-list"><span class="ci"><i class="ic">${ico.pin}</i><span>${U.esc(C.address)}</span></span><a class="ci" href="mailto:${C.email}"><i class="ic">${ico.mail}</i>${C.email}</a><a class="ci" href="tel:${C.phone}"><i class="ic">${ico.tel}</i>${U.esc(C.phoneDisplay)}</a><a class="ci" href="${U.wa()}"${ext}><i class="ic wa-c">${ico.wa16}</i>WhatsApp</a><a class="ci" href="${C.instagramUrl}"${ext}><i class="ic ig-c">${ico.ig}</i>${U.esc(C.instagramHandle)}</a>${C.linkedinUrl?`<a class="ci" href="${C.linkedinUrl}"${ext}><i class="ic li-c">${ico.li}</i>CONNECT ON LINKEDIN</a>`:""}</address></div>
    </div>
    <div class="footer-bottom"><span>© ${new Date().getFullYear()} FODO · Independent thinking. Intentional growth.</span><button type="button" id="cookie-settings-link">Cookie settings</button></div></div>`;
  },"footer");

  /* ---- Cookie banner + settings ---- */
  U.safe(()=>{
    const KEY="fodo-consent"; let state=null; try{ state=JSON.parse(localStorage.getItem(KEY)||"null"); }catch(e){}
    const b=document.createElement("div"); b.className="cookie"; b.setAttribute("role","region"); b.setAttribute("aria-label","Cookie choices");
    b.innerHTML=`<p>We use essential cookies to make this site work. Optional analytics stays off until you accept. <a href="${routes.legal}#cookies">Cookie policy</a></p><div class="cookie-actions"><button class="btn sm" type="button" data-c="accept">Accept</button><button class="btn sm ghost" type="button" data-c="reject">Reject</button><button class="btn sm ghost" type="button" data-c="settings">Settings</button></div>`;
    document.body.appendChild(b);
    const m=document.createElement("div"); m.id="cookie-modal"; m.className="modal"; m.setAttribute("role","dialog"); m.setAttribute("aria-modal","true"); m.setAttribute("aria-labelledby","ck-title");
    m.innerHTML=`<div class="modal-box"><button class="modal-close" type="button" aria-label="Close">${ico.close}</button><h3 id="ck-title">Cookie settings</h3>
      <div class="toggle"><div><b>Essential</b><br><small class="muted">Required for navigation, forms and your choices. Always on.</small></div><button class="switch" type="button" role="switch" aria-checked="true" disabled aria-label="Essential cookies always on"></button></div>
      <div class="toggle"><div><b>Analytics</b><br><small class="muted">Anonymous usage measurement. No analytics is loaded unless you turn this on.</small></div><button class="switch" type="button" role="switch" aria-checked="false" id="ck-analytics" aria-label="Analytics cookies"></button></div>
      <div class="btn-row"><button class="btn" type="button" id="ck-save">Save choices</button></div></div>`;
    document.body.appendChild(m);
    const save=s=>{ state=s; try{ localStorage.setItem(KEY,JSON.stringify(s)); }catch(e){} b.classList.remove("show"); U.closeModal("cookie-modal"); if(s.analytics)window.dispatchEvent(new CustomEvent("fodo:analytics-consent")); };
    const sw=m.querySelector("#ck-analytics"); sw.addEventListener("click",()=>sw.setAttribute("aria-checked",sw.getAttribute("aria-checked")!=="true"));
    m.querySelector("#ck-save").addEventListener("click",()=>save({analytics:sw.getAttribute("aria-checked")==="true",t:Date.now()}));
    m.querySelector(".modal-close").addEventListener("click",()=>U.closeModal("cookie-modal"));
    const openSettings=e=>{ sw.setAttribute("aria-checked",!!(state&&state.analytics)); U.openModal("cookie-modal",e&&e.currentTarget); };
    b.addEventListener("click",e=>{ const c=e.target.closest("[data-c]"); if(!c)return; if(c.dataset.c==="accept")save({analytics:true,t:Date.now()}); else if(c.dataset.c==="reject")save({analytics:false,t:Date.now()}); else openSettings(e); });
    const link=document.getElementById("cookie-settings-link"); if(link)link.addEventListener("click",openSettings);
    document.querySelectorAll("[data-open-cookies]").forEach(x=>x.addEventListener("click",openSettings));
    if(!state) setTimeout(()=>b.classList.add("show"),matchMedia("(max-width:767px)").matches?4000:1200);
  },"cookies");

  /* ---- Loader: markup is static in index.html (paints before JS); JS only handles skip + removal ---- */
  U.safe(()=>{ const l=document.querySelector(".loader"); if(!l)return; if(document.documentElement.classList.contains("no-loader")){l.remove();return;} const kill=()=>l.remove(); l.addEventListener("click",kill); setTimeout(kill,2000); },"loader");

  /* ---- Cursor labels (desktop, fine pointer) ---- */
  U.safe(()=>{
    if(!matchMedia("(hover:hover) and (pointer:fine)").matches||matchMedia("(prefers-reduced-motion:reduce)").matches)return;
    const c=document.createElement("div"); c.className="cursor-label"; c.setAttribute("aria-hidden","true"); document.body.appendChild(c);
    document.addEventListener("mousemove",e=>{ c.style.left=e.clientX+"px"; c.style.top=e.clientY+"px"; },{passive:true});
    document.addEventListener("mouseover",e=>{ const t=e.target.closest("a,button"); if(!t){c.classList.remove("on");return;} let lab="OPEN"; if(t.closest(".work-card"))lab="VIEW"; else if(t.getAttribute("href")&&/fodo-challenge/.test(t.getAttribute("href")))lab="PLAY"; else if(t.target==="_blank")lab="GO"; c.textContent=lab; c.classList.add("on"); });
  },"cursor");

  /* ---- Hero Growth Signal: Attention → Demand → Growth (illustrative) ---- */
  U.safe(()=>{
    const cv=document.getElementById("signal"); if(!cv)return; const ctx=cv.getContext("2d"); const reduce=matchMedia("(prefers-reduced-motion:reduce)").matches; const mobile=matchMedia("(max-width:767px)").matches;
    let W,H,t=0,run=true,mx=.5,t0=performance.now(); const size=()=>{ const r=cv.getBoundingClientRect(); W=cv.width=r.width*devicePixelRatio; H=cv.height=r.height*devicePixelRatio; }; size(); addEventListener("resize",size);
    if(!mobile)cv.addEventListener("mousemove",e=>{ const r=cv.getBoundingClientRect(); mx=(e.clientX-r.left)/r.width; });
    const s=()=>devicePixelRatio, F=px=>`${px*s()}px ui-monospace,monospace`; const cs=()=>getComputedStyle(document.documentElement); const col=n=>cs().getPropertyValue(n).trim()||"#4F8BFF";
    const stages=[["ATTENTION","Seen by the right people"],["DEMAND","They enquire"],["GROWTH","They buy & return"]];
    const draw=()=>{ const k=s(); ctx.clearRect(0,0,W,H); const pad=28*k, x0=pad, x1=W-pad, y0=18*k, y1=H-34*k;
      // grid
      ctx.strokeStyle=col("--canvas-grid"); ctx.lineWidth=1; for(let i=0;i<=4;i++){ const y=y0+(y1-y0)*i/4; ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke(); }
      // progress (0..1) animates once then idles
      const prog=reduce?1:Math.min(1,t/2.4);
      // three stage bands
      stages.forEach((st,i)=>{ const bx=x0+(x1-x0)*i/3, bw=(x1-x0)/3; ctx.fillStyle=i===Math.floor((t*.5)%3)&&!reduce?col("--canvas-band"):"transparent"; ctx.fillRect(bx,y0,bw,y1-y0); ctx.strokeStyle=col("--canvas-grid"); ctx.beginPath(); ctx.moveTo(bx,y0); ctx.lineTo(bx,y1); ctx.stroke();
        ctx.fillStyle=col("--signal"); ctx.font=F(10); ctx.fillText(st[0],bx+8*k,y1+14*k); if(bw>150*k){ ctx.fillStyle=col("--muted"); ctx.font=F(10); ctx.fillText(st[1],bx+8*k,y1+26*k); } });
      // growth curve with area
      const pts=[]; const N=60; for(let i=0;i<=N*prog;i++){ const p=i/N; const y=y1-(y1-y0)*(0.08+0.84*Math.pow(p,1.6))+Math.sin(p*10+t)*(reduce?0:2*k); pts.push([x0+(x1-x0)*p,y]); }
      if(pts.length>1){ ctx.beginPath(); ctx.moveTo(pts[0][0],y1); pts.forEach(q=>ctx.lineTo(q[0],q[1])); ctx.lineTo(pts[pts.length-1][0],y1); ctx.closePath(); const g=ctx.createLinearGradient(0,y0,0,y1); g.addColorStop(0,col("--canvas-fill")); g.addColorStop(1,"rgba(0,0,0,0)"); ctx.fillStyle=g; ctx.fill();
        ctx.beginPath(); pts.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1])); ctx.strokeStyle=col("--signal"); ctx.lineWidth=2*k; ctx.stroke();
        const last=pts[pts.length-1]; ctx.fillStyle=col("--signal"); ctx.beginPath(); ctx.arc(last[0],last[1],4*k,0,Math.PI*2); ctx.fill(); if(!reduce){ ctx.strokeStyle=col("--canvas-ring"); ctx.beginPath(); ctx.arc(last[0],last[1],(6+Math.sin(t*3)*3)*k,0,Math.PI*2); ctx.stroke(); } }
      // markers at stage boundaries
      [1/3,2/3,1].forEach((p,i)=>{ if(p>prog+.01)return; const x=x0+(x1-x0)*p, y=y1-(y1-y0)*(0.08+0.84*Math.pow(p,1.6)); ctx.fillStyle=col("--text"); ctx.beginPath(); ctx.arc(x,y,2.5*k,0,Math.PI*2); ctx.fill(); ctx.fillStyle=col("--muted"); ctx.font=F(10); const lab=["VISIBLE","ENQUIRIES","REVENUE"][i]; ctx.fillText(lab,x-ctx.measureText(lab).width-6*k,y-6*k); });
      // hover cursor (desktop)
      if(!mobile&&mx>0&&mx<1){ const x=x0+(x1-x0)*mx; ctx.strokeStyle=col("--canvas-grid"); ctx.beginPath(); ctx.moveTo(x,y0); ctx.lineTo(x,y1); ctx.stroke(); }
      ctx.fillStyle=col("--muted"); ctx.font=F(10); ctx.fillText("GROWTH SIGNAL · ILLUSTRATIVE PATH, NOT DATA",x0,y0-6*k);
      if(!reduce)t=(performance.now()-t0)/1000; if(run&&!reduce)requestAnimationFrame(draw); };
    if("IntersectionObserver" in window){ new IntersectionObserver(en=>{ const vis=en[0].isIntersecting; if(vis&&!run){run=true;draw();} if(!vis)run=false; }).observe(cv); }
    draw();
  },"signal");

  /* ---- Word rotators ---- */
  U.safe(()=>{
    document.querySelectorAll("[data-rotate]").forEach(el=>{ const words=el.dataset.rotate.split("|"); let i=0; el.textContent=words[0]; if(matchMedia("(prefers-reduced-motion:reduce)").matches)return; setInterval(()=>{ i=(i+1)%words.length; el.style.opacity=0; setTimeout(()=>{el.textContent=words[i];el.style.opacity=1;},200); },2400); });
  },"rotate");

  /* ---- Link fill from config: [data-wa], [data-mail], [data-tel], [data-li], [data-ig], [data-route] ---- */
  U.safe(()=>{
    const pre=(a,k,cls)=>{ if(a.classList.contains("ci")&&!a.querySelector(".ic"))a.insertAdjacentHTML("afterbegin",`<i class="ic ${cls||""}">${ico[k]}</i>`); };
    document.querySelectorAll("[data-wa]").forEach(a=>{ a.href=U.wa(a.dataset.wa||undefined); a.target="_blank"; a.rel="noopener noreferrer"; pre(a,"wa16","wa-c"); });
    document.querySelectorAll("[data-mail]").forEach(a=>{ a.href="mailto:"+C.email; if(!a.textContent.trim())a.textContent=C.email; pre(a,"mail"); });
    document.querySelectorAll("[data-tel]").forEach(a=>{ a.href="tel:"+C.phone; if(!a.textContent.trim())a.textContent=C.phoneDisplay; pre(a,"tel"); });
    document.querySelectorAll("[data-li]").forEach(a=>{ if(C.linkedinUrl){a.href=C.linkedinUrl;a.target="_blank";a.rel="noopener noreferrer";pre(a,"li","li-c");} else a.remove(); });
    document.querySelectorAll("[data-ig]").forEach(a=>{ a.href=C.instagramUrl; a.target="_blank"; a.rel="noopener noreferrer"; pre(a,"ig","ig-c"); });
    document.querySelectorAll("[data-route]").forEach(a=>{ if(routes[a.dataset.route])a.href=routes[a.dataset.route]; });
    document.querySelectorAll("[data-text]").forEach(el=>{ if(C[el.dataset.text]!=null)el.textContent=C[el.dataset.text]; });
    // canonical
    const can=document.querySelector('link[rel="canonical"]'); if(can&&document.body.dataset.path!=null)can.href=C.siteUrl+document.body.dataset.path;
  },"links");

  U.safe(U.reveal,"reveal");
  // Reveal elements added later
  U.rereveal=()=>U.safe(U.reveal,"reveal2");
  document.dispatchEvent(new CustomEvent("fodo:ready"));
})();
(function(){ try{ document.querySelectorAll("main h2, .hero h1").forEach(h=>{ if(h.querySelector("span"))return; const t=h.lastChild; if(t&&t.nodeType===3&&/[.?!]\s*$/.test(t.textContent)){ const s=t.textContent.replace(/\s+$/,""); t.textContent=s.slice(0,-1); const sp=document.createElement("span"); sp.className="dot"; sp.style.color="var(--signal)"; sp.textContent=s.slice(-1); h.appendChild(sp);} }); }catch(e){} })();
(function(){ try{ const C=window.FODO; const o=document.getElementById("slots-open"); if(!o)return; const open=Math.max(0,(C.foundingSlotsTotal||10)-(C.foundingSlotsTaken||0)); o.textContent=open; const bar=document.getElementById("slots-bar"); if(bar)setTimeout(()=>bar.style.width=((C.foundingSlotsTaken||0)/(C.foundingSlotsTotal||10)*100)+"%",300); }catch(e){} })();

/* Explain modal: any .explain[data-title][data-body] opens a full-explanation dialog */
(function(){ try{ const U=window.FODO_UTIL; const m=document.createElement("div"); m.id="explain-modal"; m.className="modal"; m.setAttribute("role","dialog"); m.setAttribute("aria-modal","true"); m.setAttribute("aria-labelledby","ex-title");
  m.innerHTML=`<div class="modal-box"><button class="modal-close" type="button" aria-label="Close">${U.ico.close}</button><p class="eyebrow">Details</p><h3 id="ex-title"></h3><div id="ex-body" style="color:var(--text-2);line-height:1.6"></div><div class="btn-row"><a class="btn sm" href="${U.routes.audit}">Get a free growth audit</a><button class="btn sm ghost" type="button" data-close>Close</button></div></div>`;
  document.body.appendChild(m); const close=()=>U.closeModal("explain-modal"); m.querySelector(".modal-close").addEventListener("click",close); m.querySelector("[data-close]").addEventListener("click",close);
  document.addEventListener("click",ev=>{ const b=ev.target.closest(".explain"); if(!b||ev.target.closest("a"))return; m.querySelector("#ex-title").textContent=b.dataset.title||b.querySelector("h3,b")?.textContent||""; m.querySelector("#ex-body").textContent=b.dataset.body||""; U.openModal("explain-modal",b); });
}catch(e){} })();
/* Mobile: limit items per section, "Show all" expands in place */
(function(){ try{ if(!matchMedia("(max-width:767px)").matches)return;
  const lim=(sel,n,label)=>{ document.querySelectorAll(sel).forEach(g=>{ if(g.closest(".detail")||g.closest(".bot-panel"))return; const kids=[...g.children]; if(kids.length<=n)return; kids.slice(n).forEach(k=>k.classList.add("m-hidden")); const b=document.createElement("button"); b.type="button"; b.className="btn ghost sm showall"; b.textContent=`${label} (${kids.length})`; b.setAttribute("aria-expanded","false"); b.addEventListener("click",()=>{ const open=b.getAttribute("aria-expanded")==="true"; kids.slice(n).forEach(k=>k.classList.toggle("m-hidden",open)); b.setAttribute("aria-expanded",!open); b.textContent=open?`${label} (${kids.length})`:"Show less"; if(open)g.scrollIntoView({block:"start"}); }); g.after(b); }); };
  lim("main section .grid.g3, main section .grid.g4, main section .grid.g2.cards",3,"Show all"); lim("main .marquee",6,"Show all services"); lim("#checklists",2,"Show all checklists");
  document.addEventListener("fodo:rendered",()=>{ lim("#services-grid, #industries-grid, #work-grid, #insights-grid",4,"Show all"); });
  setTimeout(()=>{ lim("#services-grid, #industries-grid, #work-grid, #insights-grid",4,"Show all"); lim("#services-strip",6,"Show all services"); lim("#home-work, #home-insights",3,"Show all"); },0);
}catch(e){} })();
/* Mobile: long detail states → collapsible sections (first 2 open) */
(function(){ try{ if(!matchMedia("(max-width:767px)").matches)return;
  const fold=det=>{ if(det.dataset.folded)return; det.dataset.folded="1"; const hs=[...det.querySelectorAll(":scope > h3")]; hs.forEach((h,i)=>{ const grp=[]; let n=h.nextElementSibling; while(n&&n.tagName!=="H3"&&!n.classList.contains("btn-row")){grp.push(n);n=n.nextElementSibling;} if(!grp.length)return; const open=i<2; h.classList.add("fold"); h.setAttribute("role","button"); h.setAttribute("tabindex","0"); h.setAttribute("aria-expanded",open); grp.forEach(g=>g.hidden=!open); const t=()=>{ const o=h.getAttribute("aria-expanded")==="true"; h.setAttribute("aria-expanded",!o); grp.forEach(g=>g.hidden=o); }; h.addEventListener("click",t); h.addEventListener("keydown",e=>{ if(e.key==="Enter"||e.key===" "){e.preventDefault();t();} }); }); };
  const scan=()=>document.querySelectorAll(".detail:not([hidden])").forEach(fold);
  scan(); new MutationObserver(()=>{ document.querySelectorAll(".detail").forEach(d=>{ if(d.dataset.folded&&d.dataset.lastHtml!==d.innerHTML.length+""){ delete d.dataset.folded; } }); scan(); document.querySelectorAll(".detail").forEach(d=>d.dataset.lastHtml=d.innerHTML.length+""); }).observe(document.body,{childList:true,subtree:true});
}catch(e){} })();

/* Theme toggle (dark / light) — persisted; default follows system */
(function(){ try{ const root=document.documentElement; const KEY="fodo-theme";
  const apply=t=>{ root.setAttribute("data-theme",t); document.querySelectorAll("#theme-toggle,#theme-toggle-m").forEach(b=>b.setAttribute("aria-pressed",t==="dark")); const m=document.querySelector('meta[name="theme-color"]'); if(m)m.content=t==="dark"?"#0f0f16":"#f2f1f6"; };
  const cur=()=>root.getAttribute("data-theme")||"dark";
  const toggle=()=>{ const t=cur()==="dark"?"light":"dark"; apply(t); try{ localStorage.setItem(KEY,t); }catch(e){} };
  document.querySelectorAll("#theme-toggle").forEach(b=>b.addEventListener("click",toggle));
  const d=document.getElementById("drawer"); if(d){ const b=document.createElement("button"); b.type="button"; b.id="theme-toggle-m"; b.className="btn ghost sm"; b.style.marginTop="10px"; b.textContent="Switch dark / light"; b.addEventListener("click",toggle); d.appendChild(b); }
  apply(cur());
}catch(e){} })();

(function(){ try{  }catch(e){} })();
/* Mobile footer: collapsible columns + compact icon row for contact */
(function(){ try{ if(!matchMedia("(max-width:767px)").matches)return; const cols=document.querySelectorAll(".footer-cols>div"); cols.forEach((c,i)=>{ const h=c.querySelector("h4"); const body=c.querySelector("ul,address"); if(!h||!body)return; if(body.tagName==="ADDRESS"){ c.classList.add("fcontact"); return; } c.classList.add("facc"); h.setAttribute("role","button"); h.setAttribute("tabindex","0"); h.setAttribute("aria-expanded","false"); body.hidden=true; const t=()=>{ const o=h.getAttribute("aria-expanded")==="true"; h.setAttribute("aria-expanded",!o); body.hidden=o; }; h.addEventListener("click",t); h.addEventListener("keydown",e=>{ if(e.key==="Enter"||e.key===" "){e.preventDefault();t();} }); }); }catch(e){} })();
