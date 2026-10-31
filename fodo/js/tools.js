/* FODO tools — Growth Score (self-assessment) and ROI/Growth Calculator. All outputs are illustrative. */
(function(){
  const U=window.FODO_UTIL, R=U.routes, e=U.esc, route=document.body.dataset.route;

  /* ---------- GROWTH SCORE ----------
     Scoring logic (transparent, rules-based): 7 categories, each 0–100, from the self-reported answers below.
     Overall = weighted mean: Brand 10%, Traffic 15%, Content 15%, SEO 15%, Paid 15%, Conversion 15%, Analytics 15%.
     "I don't know" answers score low on purpose (unknown ≠ good) and raise the "risk" flag for measurement. */
  U.safe(()=>{ if(route!=="score")return;
    const form=document.getElementById("score-form"), out=document.getElementById("score-result"), steps=[...form.querySelectorAll(".step")], prog=form.querySelector(".progress i"), counter=document.getElementById("step-counter"); let i=0;
    const show=n=>{ i=Math.max(0,Math.min(steps.length-1,n)); steps.forEach((s,k)=>s.hidden=k!==i); prog.style.width=((i+1)/steps.length*100)+"%"; counter.textContent=`Step ${i+1} of ${steps.length}`; form.querySelector("[data-prev]").disabled=i===0; form.querySelector("[data-next]").hidden=i===steps.length-1; form.querySelector("[data-run]").hidden=i!==steps.length-1; steps[i].querySelector("h3,legend,label").focus(); };
    const valid=()=>{ const s=steps[i]; const req=s.querySelector("[required]"); const err=s.querySelector(".err"); if(!req)return true; let ok=true;
      if(req.type==="radio"){ ok=!!s.querySelector("input:checked"); } else { ok=req.value.trim().length>0; if(req.name==="handle"&&ok){ ok=/^(@?[\w.]{2,40}|https?:\/\/\S+|[\w-]+\.[\w.-]+\S*)$/i.test(req.value.trim()); } }
      if(err)err.textContent=ok?"":(req.name==="handle"?"Enter a website URL or an @handle.":"Please choose an option to continue."); s.classList.toggle("invalid",!ok); return ok; };
    form.addEventListener("click",ev=>{ if(ev.target.closest("[data-next]")&&valid())show(i+1); if(ev.target.closest("[data-prev]"))show(i-1); });
    form.addEventListener("keydown",ev=>{ if(ev.key==="Enter"&&ev.target.tagName!=="TEXTAREA"){ ev.preventDefault(); if(i<steps.length-1){ if(valid())show(i+1);} } });
    form.addEventListener("submit",ev=>{ ev.preventDefault(); if(!valid())return; run(); });
    const v=n=>{ const el=form.querySelector(`[name="${n}"]:checked`)||form.querySelector(`[name="${n}"]`); return el?+el.value||0:0; };
    function run(){ const terminal=document.getElementById("terminal"); out.hidden=false; form.hidden=true; terminal.textContent=""; const lines=["> reading self-reported inputs…","> scoring 7 categories (rules-based)…","> weighting: brand 10% · others 15% each…","> finding weakest and strongest category…","> done. SELF-ASSESSMENT — not a crawl or audit."]; let k=0; const reduce=matchMedia("(prefers-reduced-motion:reduce)").matches;
      const tick=()=>{ terminal.textContent+=lines[k]+"\n"; k++; if(k<lines.length)setTimeout(tick,reduce?0:350); else setTimeout(render,reduce?0:300); }; tick(); }
    function render(){ // category scores from answers (each input value is 0–100 directly)
      const ind=form.querySelector('[name="industry"]').value||"your industry"; const budget=v("budget"), traffic=v("traffic"), leads=v("leads"), social=v("social"), paid=v("paid"), seo=v("seo"), content=v("content"), track=v("track");
      const cats={Brand:Math.round(social*.6+content*.4),Traffic:Math.round(traffic*.7+seo*.3),Content:content,SEO:seo,"Paid Media":Math.round(paid*.7+budget*.3),Conversion:Math.round(leads*.6+track*.4),Analytics:track};
      const w={Brand:.1,Traffic:.15,Content:.15,SEO:.15,"Paid Media":.15,Conversion:.15,Analytics:.15}; let score=0; for(const k in cats)score+=cats[k]*w[k]; score=Math.max(0,Math.min(100,Math.round(score)));
      const band=score<30?"Early signal":score<55?"Building foundations":score<78?"Structured growth":"Measurement-led";
      const sorted=Object.entries(cats).sort((a,b)=>a[1]-b[1]); const weak=sorted[0][0], weak2=sorted[1][0]; const risk=cats.Analytics<40?"Analytics: decisions are being made without reliable measurement.":`${weak}: the lowest-scoring area is where growth is most likely stuck.`;
      const map={Brand:["brand-strategy","Brand Strategy"],Traffic:["seo","SEO"],Content:["content-marketing","Content Marketing"],SEO:["seo","SEO"],"Paid Media":["paid-advertising","Paid Advertising"],Conversion:["cro","Conversion Rate Optimisation"],Analytics:["analytics","Analytics & Measurement"]};
      const recs=[weak,weak2].map(k=>`<li>Strengthen <b>${k}</b> → <a href="${R.services}${map[k][0]}/">${map[k][1]}</a></li>`).join("")+(cats.Analytics<60&&weak!=="Analytics"&&weak2!=="Analytics"?`<li>Fix measurement first → <a href="${R.services}analytics/">Analytics & Measurement</a></li>`:"");
      const WINS={Brand:["Write one line: who you're for, the outcome you give, and why you — use it on your bio, site and ads.","Pick 3 content pillars and post on them consistently for 30 days."],
        Traffic:["List the 10 questions customers ask before buying; answer each on your site or socials.","Make sure your Google Business Profile is complete with photos and hours."],
        Content:["Turn your best-performing post into 3 formats (Reel, carousel, WhatsApp message).","Plan 4 weeks of content around real customer questions, not trends."],
        SEO:["Give every key page one clear topic and a title that says what and where (e.g. 'Dental clinic in Dwarka').","Fix speed on mobile: compress images and remove unused scripts."],
        "Paid Media":["Run one campaign per objective with a clear cost-per-result target.","Test 3 creative angles before raising budget."],
        Conversion:["Add a click-to-WhatsApp button next to your main form.","Cut your enquiry form to the 3–4 fields you truly need."],
        Analytics:["Agree one definition of a 'lead' and track it in one place.","Install conversion tracking and test it with a real submission."]};
      const plan=[weak,weak2].map((k,n)=>`<li><b>Week ${n*2+1}–${n*2+2} · ${k}</b><span>${WINS[k][0]}</span></li>`).join("")+`<li><b>Week 5–6 · ${weak}</b><span>${WINS[weak][1]}</span></li><li><b>Week 7–8 · Re-check</b><span>Run this score again and compare.</span></li>`;
      let prev=null; try{ prev=JSON.parse(localStorage.getItem("fodo-score-last")||"null"); localStorage.setItem("fodo-score-last",JSON.stringify({score,at:Date.now(),cats})); }catch(_){}
      const delta=prev&&typeof prev.score==="number"?score-prev.score:null;
      if(window.FODO_LAB){ const L=window.FODO_LAB; L.record("score",score); L.badge("score_done"); setTimeout(()=>L.addXP(60,"Growth Score completed"),400); }
      const summary=`FODO Growth Score (self-assessment): ${score}/100 — ${band}. Weakest: ${weak}, ${weak2}. Industry: ${ind}.`;
      document.getElementById("score-panel").innerHTML=`<p class="eyebrow">Your FODO Growth Score</p>
      <div class="grid g2" style="align-items:center"><div><svg class="radial" viewBox="0 0 120 120" role="img" aria-label="Score ${score} out of 100"><circle class="track" cx="60" cy="60" r="52"/><circle class="val" cx="60" cy="60" r="52" stroke-dasharray="326.7" stroke-dashoffset="326.7" id="radial-val"/><text x="60" y="68" text-anchor="middle" fill="var(--text)" font-size="30" font-family="Space Grotesk,sans-serif" font-weight="700">${score}</text></svg><p class="mono signal" style="text-align:center">${band.toUpperCase()}</p></div>
      <div class="bars">${Object.entries(cats).map(([k,val])=>`<div class="bar"><span>${k}</span><i><b data-w="${val}"></b></i><span class="mono">${val}</span></div>`).join("")}</div></div>
      <div class="grid g2" style="margin-top:24px"><div class="panel raised"><span class="label signal">Your biggest opportunity</span><p style="margin:8px 0 0">${weak} scored lowest (${cats[weak]}). Improving it usually has the largest effect on everything downstream.</p></div><div class="panel raised"><span class="label" style="color:var(--warn)">Your biggest digital risk</span><p style="margin:8px 0 0">${risk}</p></div></div>
      ${delta!=null?`<p class="gs-delta ${delta>=0?"up":"down"}">${delta>0?"▲ +"+delta:delta<0?"▼ "+delta:"No change"} since your last check (${prev.score}).</p>`:""}
      <h3 style="margin-top:24px">Your 8-week starter plan</h3><ol class="gs-plan">${plan}</ol>
      <h3 style="margin-top:24px">Where FODO can help</h3><ul>${recs}</ul>
      <p class="notice">SELF-ASSESSMENT SCORE — NOT A REAL AUDIT OR GUARANTEE. Based only on the answers you gave; FODO has not crawled or reviewed your site.</p>
      <div class="btn-row"><a class="btn" href="${R.audit}&score=${score}&industry=${encodeURIComponent(ind)}">Get my Free Growth Audit</a><a class="btn ghost" href="${U.wa(summary+" — I'd like to discuss this.")}" target="_blank" rel="noopener noreferrer">Discuss this on WhatsApp</a><button class="btn ghost" type="button" id="copy-sum">Copy my result</button><button class="btn ghost" type="button" id="run-again">Run again</button></div>`;
      document.getElementById("copy-sum").addEventListener("click",ev=>U.copy(summary+" Plan: "+[weak,weak2].map(k=>k+" — "+WINS[k][0]).join(" | "),ev.currentTarget));
      requestAnimationFrame(()=>{ document.getElementById("radial-val").style.strokeDashoffset=326.7*(1-score/100); document.querySelectorAll(".bar b").forEach(b=>b.style.width=b.dataset.w+"%"); });
      document.getElementById("run-again").addEventListener("click",()=>{ form.reset(); out.hidden=true; form.hidden=false; show(0); });
      document.getElementById("score-panel").querySelector(".eyebrow").focus?.(); out.scrollIntoView({block:"start",behavior:"smooth"}); }
    show(0);
  },"growth-score");

  /* ---------- ROI / GROWTH CALCULATOR ----------
     current conversions = visitors × CR; current value = conversions × value-per-conversion.
     projected CR = CR × (1 + lift); projected conversions/value recomputed; ROAS = value ÷ spend (shown only if spend > 0).
     Lift is a user-editable assumption, NOT a FODO result. */
  U.safe(()=>{ if(route!=="roi")return; const f=document.getElementById("roi-form"), o=document.getElementById("roi-out");
    const num=(n,min,max,def)=>{ let x=parseFloat(f[n].value); if(!isFinite(x))x=def; x=Math.min(max,Math.max(min,x)); return x; };
    const sync=(a,b)=>{ f[a].addEventListener("input",()=>{f[b].value=f[a].value;calc();}); f[b].addEventListener("input",()=>{f[a].value=f[b].value;calc();}); };
    sync("spend","spend_n"); ["value","visitors","cr","lift","scenario","industry"].forEach(n=>f[n].addEventListener("input",calc));
    f.addEventListener("input",()=>{ if(window.FODO_TOOL) window.FODO_TOOL("complete","roi","",true); },{once:true});   // v17.1: first real use of the calculator
    function calc(){ const spend=num("spend",0,10000000,50000), value=num("value",0,100000000,2000), visitors=num("visitors",0,100000000,5000), cr=num("cr",0,100,2), lift=num("lift",0,300,20); const sc=f.scenario.value;
      f.spend_n.value=spend; const conv=visitors*cr/100, val=conv*value, pcr=Math.min(100,cr*(1+lift/100)), pconv=visitors*pcr/100, pval=pconv*value; const label=sc==="leads"?"leads":"sales";
      const roas=spend>0?(val/spend):null, proas=spend>0?(pval/spend):null;
      o.querySelector("[data-k=conv]").textContent=Math.round(conv).toLocaleString("en-IN")+" "+label; o.querySelector("[data-k=val]").textContent=U.inr(val);
      o.querySelector("[data-k=pconv]").textContent=Math.round(pconv).toLocaleString("en-IN")+" "+label; o.querySelector("[data-k=pval]").textContent=U.inr(pval);
      o.querySelector("[data-k=diff]").textContent=(pval-val>=0?"+":"")+U.inr(pval-val)+" / month";
      o.querySelector("[data-k=roas]").textContent=roas==null?"— (enter spend)":`${roas.toFixed(2)}x → ${proas.toFixed(2)}x`;
      const max=Math.max(val,pval,1); o.querySelector("[data-bar=cur]").style.height=(val/max*100)+"%"; o.querySelector("[data-bar=proj]").style.height=(pval/max*100)+"%";
      const summary=`Growth Calculator (illustrative): spend ${U.inr(spend)}, ${visitors} visitors, CR ${cr}% → ${Math.round(conv)} ${label} (${U.inr(val)}). With assumed +${lift}% lift: ${Math.round(pconv)} ${label} (${U.inr(pval)}). Industry: ${f.industry.value||"n/a"}.`;
      document.getElementById("roi-discuss").href=R.audit+"&calc="+encodeURIComponent(summary.slice(0,400)); document.getElementById("roi-wa").href=U.wa(summary+" — can we discuss my numbers?"); }
    calc();
  },"roi");
})();
