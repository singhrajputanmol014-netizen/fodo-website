/* FODO pages — data-driven hubs with URL-hash detail states (services, industries, work, insights), checklists, FAQ, growth system. */
(function(){
  const U=window.FODO_UTIL, D=window.FODO_DATA, R=U.routes, e=U.esc, C=window.FODO;
  const route=document.body.dataset.route;
  const chart=(seed,label,pillar)=>{ let s=seed.length, v=[]; for(let i=0;i<12;i++){ s=(s*9301+49297)%233280; v.push(s/233280); }
    let body="",cap="";
    if(pillar==="paid"||pillar==="web"){ // bars: spend (grey) vs results (orange) — results grow faster
      body=v.map((x,i)=>`<rect x="${i*27+2}" y="${80-30-x*10}" width="10" height="${30+x*10}" fill="var(--bar-dim)"/><rect x="${i*27+13}" y="${80-(10+i*5+x*8)}" width="10" height="${10+i*5+x*8}" fill="var(--signal)"/>`).join(""); cap="Grey: spend · Orange: results — results should outgrow spend"; }
    else if(pillar==="seo"||pillar==="content"){ // compounding curve
      const pts=v.map((x,i)=>`${i*30},${(78-Math.pow(i/11,1.8)*60-x*4).toFixed(1)}`).join(" "); body=`<polyline fill="none" stroke="var(--signal)" stroke-width="2" points="${pts}"/><polyline fill="none" stroke="var(--line-3)" stroke-dasharray="3 3" points="0,60 330,60"/>`; cap="Slow start, compounding later — typical organic curve"; }
    else if(pillar==="social"){ // dots: posts with occasional spikes
      body=v.map((x,i)=>`<circle cx="${i*30+5}" cy="${70-x*55}" r="${x>.75?5:2.5}" fill="${x>.75?"var(--signal)":"var(--dot-dim)"}"/>`).join("")+`<polyline fill="none" stroke="var(--line-3)" points="0,70 330,70"/>`; cap="Each dot a post; orange = content that broke out"; }
    else if(pillar==="brand"){ // before/after bars for clarity scores
      const lab=["Clarity","Recall","Trust","Fit"]; body=lab.map((l,i)=>`<rect x="${i*80+10}" y="${80-25-v[i]*15}" width="24" height="${25+v[i]*15}" fill="var(--bar-dim)"/><rect x="${i*80+38}" y="${80-50-v[i+4]*20}" width="24" height="${50+v[i+4]*20}" fill="var(--signal)"/><text x="${i*80+36}" y="88" fill="var(--muted)" font-size="7" text-anchor="middle">${l}</text>`).join(""); cap="Grey: before positioning work · Orange: after — illustrative"; }
    else { // automation/analytics: funnel steps
      const st=[100,62,40,27,18]; body=st.map((w,i)=>`<rect x="${(330-w*3)/2}" y="${i*15+4}" width="${w*3}" height="12" fill="${i===st.length-1?"var(--signal)":"var(--bar-dim)"}"/>`).join(""); cap="Funnel stages — each step should be measured, not guessed"; }
    return `<figure class="panel" style="margin:24px 0"><svg viewBox="0 0 330 92" role="img" aria-label="${e(label)} — illustrative chart" style="width:100%;height:auto">${body}</svg><figcaption class="mono muted" style="margin-top:8px;font-size:11px">${e(label)} · ${cap} · ILLUSTRATIVE</figcaption></figure>`; };
  const hashState=(container,render,listSel)=>{ // detail state manager
    const show=()=>{ const id=decodeURIComponent(location.hash.slice(1)); const det=container.querySelector(".detail"); const list=document.querySelector(listSel);
      if(id&&render(id,det)){ det.hidden=false; if(list)list.hidden=true; det.querySelector(".detail-back").focus({preventScroll:true}); det.scrollIntoView({block:"start"}); }
      else { det.hidden=true; if(list)list.hidden=false; } };
    addEventListener("hashchange",show); show();
    container.addEventListener("click",ev=>{ if(ev.target.closest(".detail-back")){ ev.preventDefault(); if(history.length>1&&document.referrer.includes(location.pathname))history.back(); else location.hash=""; } });
  };
  const back=(label)=>`<a href="#" class="btn ghost sm detail-back">← Back to ${label}</a>`;
  const cta=`<div class="btn-row"><a class="btn" href="${R.audit}">Get Your Free Growth Audit</a><a class="btn ghost" href="${R.contact}">Start a Conversation</a></div>`;
  const svcLink=s=>{ const x=D.services.find(v=>v.slug===s); return x?`<a href="${R.services}${x.slug}/">${e(x.name)}</a>`:""; };
  const svcCard=s=>`<a class="panel hud" href="${R.services}${s.slug}/" data-pillar="${s.pillar}"><span class="tag">${e(D.pillars.find(p=>p.id===s.pillar).name)}</span>${U.ico.arrow}<h3 style="margin-top:12px">${e(s.name)}</h3><p class="muted" style="margin:0;font-size:14px">${e(s.h)}</p><span class="panel-line"></span></a>`;

  /* HOME hero "disappear." — letters dissolve and re-form on their own (works on every device);
     the pointer (desktop) or a finger (phone) brings the letters it touches back into focus. */
  U.safe(()=>{ const st=document.querySelector("[data-lens]"); if(!st)return;
    st.classList.add("vanish-on");
    const word=st.querySelector("h1 .fade"); if(!word)return;
    const txt=word.textContent;
    word.innerHTML=`<span class="sr-only">${U.esc(txt)}</span>`+[...txt].map((c,i)=>`<span class="ch" aria-hidden="true" style="--i:${i}">${c===" "?"&nbsp;":U.esc(c)}</span>`).join("");
    const chars=[...word.querySelectorAll(".ch")], R=()=>Math.max(60,word.getBoundingClientRect().height*1.1);
    let raf=0, px=-1e4, py=-1e4, active=false;
    const paint=()=>{ raf=0; const r=R(); chars.forEach(c=>{ const b=c.getBoundingClientRect(), d=Math.hypot(b.left+b.width/2-px,b.top+b.height/2-py); c.classList.toggle("lit",active&&d<r); }); };
    const at=(x,y)=>{ px=x; py=y; active=true; if(!raf) raf=requestAnimationFrame(paint); };
    const off=()=>{ active=false; if(!raf) raf=requestAnimationFrame(paint); };
    st.addEventListener("pointermove",e=>at(e.clientX,e.clientY));
    st.addEventListener("pointerleave",off);
    st.addEventListener("touchstart",e=>{ const t=e.touches[0]; at(t.clientX,t.clientY); },{passive:true});
    st.addEventListener("touchmove",e=>{ const t=e.touches[0]; at(t.clientX,t.clientY); },{passive:true});
    st.addEventListener("touchend",()=>setTimeout(off,900),{passive:true});
    // a tap anywhere on the headline brings the whole word back for a moment
    st.addEventListener("click",()=>{ word.classList.add("all-lit"); clearTimeout(word._t); word._t=setTimeout(()=>word.classList.remove("all-lit"),1600); });
  },"lens");

  /* HOME dynamic bits */
  U.safe(()=>{ if(route!=="home")return;
    const strip=document.getElementById("services-strip"); if(strip)strip.innerHTML=D.services.map(s=>`<a href="${R.services}${s.slug}/">${e(s.name)}</a>`).join("");
    const work=document.getElementById("home-work"); if(work)work.innerHTML=D.cases.map(c=>`<a class="panel work-card" href="${R.work}#${c.slug}"><span class="tag warn">CONCEPT ENGAGEMENT</span>${U.ico.arrow}<h3 style="margin-top:12px">${e(c.title)}</h3><p class="muted" style="margin:0;font-size:14px">${c.tags.join(" · ")}</p><span class="panel-line"></span></a>`).join("");
    const ins=document.getElementById("home-insights"); if(ins)ins.innerHTML=D.articles.slice(0,3).map(a=>`<a class="panel" href="${R.insights}#${a.slug}"><span class="tag">${e(a.cat)}</span>${U.ico.arrow}<h3 style="margin-top:12px;font-size:20px">${e(a.title)}</h3><span class="panel-line"></span></a>`).join("");
    const st=document.getElementById("home-stages"); if(st)st.innerHTML=D.stages.map(s=>`<button class="panel explain stage-card" type="button" data-title="${s.n} · ${e(s.name)}" data-body="${e(s.what)} What FODO does: ${e(s.fodo)} You receive: ${e(s.client)} Measured: ${e(s.measure)} Next: ${e(s.next)}"><span class="mono signal">${s.n}</span><b class="stage-name">${e(s.name)}</b><span class="stage-what">${e(s.what)}</span><span class="more-hint">Tap for details →</span></button>`).join("");
    U.rereveal();
  },"home");

  /* SERVICES */
  U.safe(()=>{ if(route!=="services")return;
    { const h=decodeURIComponent(location.hash.slice(1)); if(h&&D.services.some(x=>x.slug===h)){ location.replace(R.services+h+"/"); return; } }
    const grid=document.getElementById("services-grid"), filt=document.getElementById("services-filters"), wrap=document.getElementById("services-wrap");
    grid.innerHTML=D.services.map(svcCard).join("");
    filt.innerHTML=`<button type="button" aria-pressed="true" data-f="all">All (20)</button>`+D.pillars.map(p=>`<button type="button" aria-pressed="false" data-f="${p.id}">${e(p.name)}</button>`).join("");
    filt.addEventListener("click",ev=>{ const b=ev.target.closest("button"); if(!b)return; filt.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",x===b)); grid.querySelectorAll("[data-pillar]").forEach(c=>c.style.display=(b.dataset.f==="all"||c.dataset.pillar===b.dataset.f)?"":"none"); });
    hashState(wrap,(id,det)=>{ const s=D.services.find(x=>x.slug===id); if(!s)return false;
      document.title=`${s.name} — FODO`;
      det.innerHTML=`<div class="detail-head">${back("all services")}<span class="tag">${e(D.pillars.find(p=>p.id===s.pillar).name)}</span></div>
      <p class="eyebrow">Service · ${e(s.name)}</p><h2 style="font-size:clamp(28px,4vw,48px)">${e(s.h)}</h2>
      <h3>The problem</h3><p>${e(s.problem)}</p>
      <h3>What we do</h3><ul>${s.do.map(x=>`<li>${e(x)}</li>`).join("")}</ul>
      <h3>Our process</h3><p>Discover → Diagnose → Strategize → Build → Launch → Optimize. Every step has an approval and a measure. <a href="${R.about}#growth-system">See the Growth System</a>.</p>
      <h3>What we track</h3><ul>${s.track.map(x=>`<li>${e(x)}</li>`).join("")}</ul>
      ${chart(s.slug,s.name,s.pillar)}
      <h3>Channels / platforms</h3><p>${s.channels.map(e).join(" · ")}</p>
      <h3>Deliverables</h3><ul>${s.deliv.map(x=>`<li>${e(x)}</li>`).join("")}</ul>
      <h3>Who it is for</h3><p>${e(s.who)}</p>
      <h3>Expected business outcomes</h3><p>${e(s.outcomes)} <em class="muted">Outcomes are not guaranteed and depend on your offer, market, budget and execution.</em></p>
      <h3>FAQs</h3>${s.faqs.map((f,i)=>`<div class="acc"><button type="button" aria-expanded="false" aria-controls="sf${i}">${e(f[0])}</button><div class="acc-body" id="sf${i}" hidden>${e(f[1])}</div></div>`).join("")}
      <h3>Related services</h3><p>${s.related.map(svcLink).filter(Boolean).join(" · ")}</p>${cta}`;
      return true; },"#services-list");
  },"services");

  /* INDUSTRIES */
  U.safe(()=>{ if(route!=="industries")return;
    const grid=document.getElementById("industries-grid"), wrap=document.getElementById("industries-wrap");
    grid.innerHTML=D.industries.map(i=>`<a class="panel hud" href="#${i.slug}"><span class="tag">Industry</span>${U.ico.arrow}<h3 style="margin-top:12px">${e(i.name)}</h3><p class="muted" style="margin:0;font-size:14px">${e(i.h)}</p><span class="panel-line"></span></a>`).join("");
    hashState(wrap,(id,det)=>{ const i=D.industries.find(x=>x.slug===id); if(!i)return false; document.title=`${i.name} marketing — FODO`;
      det.innerHTML=`<div class="detail-head">${back("all industries")}<span class="tag">${e(i.name)}</span></div><h2 style="font-size:clamp(28px,4vw,48px)">${e(i.h)}</h2>
      ${i.note?`<div class="notice">${e(i.note)}</div>`:""}
      <h3>Typical challenges</h3><ul>${i.challenges.map(x=>`<li>${e(x)}</li>`).join("")}</ul>
      <h3>Customer behaviour</h3><p>${e(i.behaviour)}</p>
      <h3>The FODO approach</h3><p>${e(i.approach)}</p>
      <h3>Possible channels</h3><p>${i.channels.map(e).join(" · ")}</p>
      <h3>KPIs worth tracking</h3><ul>${i.kpis.map(x=>`<li>${e(x)}</li>`).join("")}</ul>
      <h3>Suggested services</h3><p>${i.services.map(svcLink).join(" · ")}</p>
      <p class="muted" style="font-size:13px">General, reasoned guidance — not market research or a results guarantee.</p>${cta}`; return true; },"#industries-list");
  },"industries");

  /* WORK */
  U.safe(()=>{ if(route!=="work")return;
    const grid=document.getElementById("work-grid"), filt=document.getElementById("work-filters"), wrap=document.getElementById("work-wrap");
    const tags=["ALL","E-COMMERCE","B2B","LOCAL BUSINESS","LEAD GENERATION","BRANDING","SOCIAL","PAID MEDIA","SEO"];
    filt.innerHTML=tags.map((t,i)=>`<button type="button" aria-pressed="${i===0}" data-f="${t}">${t}</button>`).join("");
    grid.innerHTML=D.cases.map(c=>`<a class="panel hud work-card" href="#${c.slug}" data-tags="${c.tags.join("|")}"><span class="tag warn">CONCEPT ENGAGEMENT</span>${U.ico.arrow}<h3 style="margin-top:12px">${e(c.title)}</h3><p class="muted" style="margin:0;font-size:14px">${c.tags.join(" · ")} · ${e(c.industry)}</p><span class="panel-line"></span></a>`).join("");
    filt.addEventListener("click",ev=>{ const b=ev.target.closest("button"); if(!b)return; filt.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",x===b)); grid.querySelectorAll("[data-tags]").forEach(c=>c.style.display=(b.dataset.f==="ALL"||c.dataset.tags.split("|").includes(b.dataset.f))?"":"none"); });
    hashState(wrap,(id,det)=>{ const c=D.cases.find(x=>x.slug===id); if(!c)return false; document.title=`${c.title} — FODO (concept)`;
      const sec=(t,b)=>`<h3>${t}</h3><p>${b}</p>`;
      det.innerHTML=`<div class="detail-head">${back("work")}<span class="tag warn">CONCEPT ENGAGEMENT</span></div><h2 style="font-size:clamp(26px,3.6vw,44px)">${e(c.title)}</h2>
      <div class="kpi"><div class="panel"><span class="label muted">Client</span><br><b>Concept engagement</b></div><div class="panel"><span class="label muted">Industry</span><br><b>${e(c.industry)}</b></div><div class="panel"><span class="label muted">Channels</span><br><b>${c.channels.map(e).join(", ")}</b></div></div>
      ${sec("The challenge",e(c.challenge))}${sec("The insight",e(c.insight))}${sec("The strategy",e(c.strategy))}${sec("The execution",e(c.execution))}${sec("Creative approach",e(c.creative))}
      <h3>KPIs to be measured</h3><ul>${c.kpis.map(x=>`<li>${e(x)}</li>`).join("")}</ul>
      ${sec("The result","Measured against the KPIs above over the first 90 days. Figures are published here only after client validation — ask us for the current status of this engagement type on your audit call.")}${sec("The lesson",e(c.lesson))}
      <h3>Related services</h3><p>${D.services.filter(s=>c.tags.some(t=>({"PAID MEDIA":"paid","SEO":"seo","SOCIAL":"social","BRANDING":"brand"}[t]===s.pillar))).slice(0,4).map(s=>svcLink(s.slug)).join(" · ")||svcLink("paid-advertising")}</p>${cta}`; return true; },"#work-list");
  },"work");

  /* INSIGHTS */
  U.safe(()=>{ if(route!=="insights")return;
    const grid=document.getElementById("insights-grid"), filt=document.getElementById("insights-filters"), search=document.getElementById("insights-search"), wrap=document.getElementById("insights-wrap");
    const cats=["All","Growth","Paid Media","SEO","Brand","Social","AI","Content","Strategy"]; let cat="All";
    const words=a=>a.body.replace(/<[^>]+>/g," ").split(/\s+/).filter(Boolean).length;
    const card=a=>`<a class="panel" href="#${a.slug}" data-cat="${a.cat}"><span class="tag">${e(a.cat)}</span>${U.ico.arrow}<h3 style="margin-top:12px;font-size:20px">${e(a.title)}</h3><p class="muted" style="margin:0;font-size:13px">${Math.max(1,Math.round(words(a)/220))} min read · ${a.date}</p><span class="panel-line"></span></a>`;
    const apply=()=>{ const q=(search.value||"").toLowerCase(); let n=0; grid.querySelectorAll("a").forEach(c=>{ const a=D.articles.find(x=>x.slug===c.getAttribute("href").slice(1)); const ok=(cat==="All"||a.cat===cat)&&(!q||(a.title+a.body).toLowerCase().includes(q)); c.style.display=ok?"":"none"; if(ok)n++; }); document.getElementById("insights-empty").hidden=n>0; };
    grid.innerHTML=D.articles.map(card).join(""); filt.innerHTML=cats.map((c,i)=>`<button type="button" aria-pressed="${i===0}" data-f="${c}">${c}</button>`).join("");
    filt.addEventListener("click",ev=>{ const b=ev.target.closest("button"); if(!b)return; cat=b.dataset.f; filt.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",x===b)); apply(); }); search.addEventListener("input",apply);
    hashState(wrap,(id,det)=>{ const a=D.articles.find(x=>x.slug===id); if(!a)return false; document.title=`${a.title} — FODO Insights`;
      const rel=D.articles.filter(x=>x.slug!==a.slug).slice(0,3);
      det.innerHTML=`<div class="detail-head">${back("insights")}<span class="tag">${e(a.cat)}</span></div><h2 style="font-size:clamp(26px,3.6vw,44px);text-transform:none">${e(a.title)}</h2>
      <p class="mono muted">By ${e(C.founderName)} · ${a.date} · ${Math.max(1,Math.round(words(a)/220))} min read</p><div class="prose">${a.body}</div>
      <h3>Related reading</h3><p>${rel.map(r=>`<a href="#${r.slug}">${e(r.title)}</a>`).join("<br>")}</p>
      <h3>Related services</h3><p>${svcLink("paid-advertising")} · ${svcLink("seo")} · ${svcLink("cro")} · ${svcLink("analytics")}</p>${cta}`;
      const ld=document.getElementById("article-ld"); if(ld)ld.textContent=JSON.stringify({"@context":"https://schema.org","@type":"Article",headline:a.title,datePublished:a.date,author:{"@type":"Person",name:C.founderName},publisher:{"@type":"Organization",name:"FODO"}}); return true; },"#insights-list");
  },"insights");

  /* RESOURCES checklists */
  U.safe(()=>{ if(route!=="resources")return; const host=document.getElementById("checklists");
    host.innerHTML=D.checklists.map(c=>`<section class="panel hud checklist" id="${c.id}" style="padding-top:24px"><h3>${e(c.name)}</h3><div class="progress" aria-hidden="true"><i></i></div><p class="mono muted" data-prog>0 / ${c.items.length} complete</p><ul>${c.items.map((it,i)=>`<li><label><input type="checkbox" data-k="${c.id}-${i}"> <span>${e(it)}</span></label></li>`).join("")}</ul>
      <div class="btn-row"><button class="btn sm" type="button" data-copy>Copy checklist</button><button class="btn sm ghost" type="button" data-print>Print / Save as PDF</button><button class="btn sm ghost" type="button" data-reset>Reset</button></div></section>`).join("");
    const KEY="fodo-checklists"; let saved={}; try{ saved=JSON.parse(localStorage.getItem(KEY)||"{}"); }catch(e){}
    host.querySelectorAll("input[data-k]").forEach(i=>{ i.checked=!!saved[i.dataset.k]; });
    const update=sec=>{ const all=[...sec.querySelectorAll("input")], n=all.filter(x=>x.checked).length; sec.querySelector(".progress i").style.width=(n/all.length*100)+"%"; sec.querySelector("[data-prog]").textContent=`${n} / ${all.length} complete`; };
    host.querySelectorAll("section").forEach(update);
    host.addEventListener("change",ev=>{ const i=ev.target; if(!i.matches("input"))return; saved[i.dataset.k]=i.checked; try{ localStorage.setItem(KEY,JSON.stringify(saved)); }catch(e){} update(i.closest("section")); });
    host.addEventListener("click",ev=>{ const sec=ev.target.closest("section"); if(!sec)return;
      if(ev.target.closest("[data-copy]")){ const txt=sec.querySelector("h3").textContent+"\n"+[...sec.querySelectorAll("li")].map(l=>(l.querySelector("input").checked?"[x] ":"[ ] ")+l.querySelector("span").textContent).join("\n")+"\n— FODO · "+C.siteUrl; U.copy(txt,ev.target.closest("button")); }
      if(ev.target.closest("[data-print]")){ host.querySelectorAll("section").forEach(s=>s.classList.toggle("print-hide",s!==sec)); const st=document.createElement("style"); st.textContent="@media print{.print-hide,.page-intro{display:none!important}}"; document.head.appendChild(st); window.print(); setTimeout(()=>{st.remove();host.querySelectorAll("section").forEach(s=>s.classList.remove("print-hide"));},500); }
      if(ev.target.closest("[data-reset]")){ sec.querySelectorAll("input").forEach(i=>{i.checked=false;delete saved[i.dataset.k];}); try{ localStorage.setItem(KEY,JSON.stringify(saved)); }catch(e){} update(sec); } });
  },"resources");

  /* FAQ */
  U.safe(()=>{ if(route!=="faq")return; const host=document.getElementById("faq-list"), filt=document.getElementById("faq-filters"), search=document.getElementById("faq-search");
    const cats=["All",...new Set(D.faqs.map(f=>f.c))]; let cat="All";
    host.innerHTML=D.faqs.map((f,i)=>`<div class="acc" data-cat="${e(f.c)}"><button type="button" aria-expanded="false" aria-controls="fq${i}">${e(f.q)}</button><div class="acc-body" id="fq${i}" hidden>${e(f.a)}</div></div>`).join("");
    filt.innerHTML=cats.map((c,i)=>`<button type="button" aria-pressed="${i===0}" data-f="${e(c)}">${e(c)}</button>`).join("");
    const apply=()=>{ const q=(search.value||"").toLowerCase(); let n=0; host.querySelectorAll(".acc").forEach(a=>{ const ok=(cat==="All"||a.dataset.cat===cat)&&(!q||a.textContent.toLowerCase().includes(q)); a.style.display=ok?"":"none"; if(ok)n++; }); document.getElementById("faq-empty").hidden=n>0; };
    filt.addEventListener("click",ev=>{ const b=ev.target.closest("button"); if(!b)return; cat=b.dataset.f; filt.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",x===b)); apply(); }); search.addEventListener("input",apply);
    const ld=document.getElementById("faq-ld"); if(ld)ld.textContent=JSON.stringify({"@context":"https://schema.org","@type":"FAQPage",mainEntity:D.faqs.map(f=>({"@type":"Question",name:f.q,acceptedAnswer:{"@type":"Answer",text:f.a}}))});
  },"faq");

  /* GROWTH SYSTEM (about page) */
  U.safe(()=>{ const host=document.getElementById("stages"); if(!host)return;
    host.innerHTML=D.stages.map((s,i)=>`<button class="stage" type="button" aria-expanded="false" aria-controls="stage-detail" data-i="${i}"><span class="mono signal">${s.n}</span><b>${s.name.toUpperCase()}</b></button>`).join("")+`<div class="stage-detail" id="stage-detail" hidden></div>`;
    const det=host.querySelector("#stage-detail");
    host.addEventListener("click",ev=>{ const b=ev.target.closest(".stage"); if(!b)return; const open=b.getAttribute("aria-expanded")==="true"; host.querySelectorAll(".stage").forEach(x=>x.setAttribute("aria-expanded","false")); if(open){det.hidden=true;return;} b.setAttribute("aria-expanded","true"); const s=D.stages[+b.dataset.i];
      det.innerHTML=`<p class="eyebrow">Stage ${s.n} · ${e(s.name)}</p><div class="grid g2"><div><h4>What happens</h4><p>${e(s.what)}</p><h4>What FODO does</h4><p>${e(s.fodo)}</p></div><div><h4>What you receive</h4><p>${e(s.client)}</p><h4>What gets measured</h4><p>${e(s.measure)}</p><h4>Next</h4><p class="signal mono">→ ${e(s.next)}</p></div></div>`; det.hidden=false; });
  },"stages");

  /* Generic accordion (delegated) */
  document.addEventListener("click",ev=>{ const b=ev.target.closest(".acc > button"); if(!b)return; const o=b.getAttribute("aria-expanded")==="true"; b.setAttribute("aria-expanded",!o); const body=document.getElementById(b.getAttribute("aria-controls")); if(body)body.hidden=o; });

  /* Offset hash scroll for sticky header on load */
  U.safe(()=>{ if(location.hash&&document.getElementById(location.hash.slice(1))&&!document.querySelector(".detail")){ setTimeout(()=>{ const t=document.getElementById(location.hash.slice(1)); const y=t.getBoundingClientRect().top+scrollY-80; scrollTo({top:y}); },50); } },"hashoffset");
})();
