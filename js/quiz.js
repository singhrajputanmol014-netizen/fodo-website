/* FODO Marketing Quiz: "speed run" edition.
   10 questions per run drawn from a 34-question pool (mixed categories, easy → hard), 20-second timer per question,
   points = 100 base + speed bonus (up to +50) × streak multiplier (×1 → ×2), two lifelines (50:50, Skip),
   keyboard 1–4 / A–D, instant explanations, best score + XP + badges via FODO_LAB, review, WhatsApp share.
   Accuracy (x/10) is still shown, so the "ten questions" promise on the page stays true. */
(function(){
  const U=window.FODO_UTIL, R=U.routes, e=U.esc; if(document.body.dataset.route!=="quiz")return;
  U.safe(()=>{
    const host=document.getElementById("quiz"), LAB=window.FODO_LAB, D=window.FODO_DATA;
    const reduce=matchMedia("(prefers-reduced-motion:reduce)").matches, T=20, N=10;
    const shuffle=(a,r=Math.random)=>{ a=a.slice(); for(let k=a.length-1;k>0;k--){ const j=Math.floor(r()*(k+1)); [a[k],a[j]]=[a[j],a[k]]; } return a; };
    const RANKS=[[0,"Marketing newbie"],[400,"Campaign apprentice"],[800,"Growth thinker"],[1150,"Performance pro"],[1450,"Growth strategist"],[1700,"Marketing mastermind"]];
    const rankOf=p=>RANKS.filter(r=>p>=r[0]).pop()[1];
    let S, timer=0;

    function build(daily){
      const r=daily&&LAB?LAB.rng(LAB.dailySeed()^0x51f):Math.random;
      const pool=shuffle(D.quiz,r); const pickD=d=>pool.filter(q=>(q.d||1)===d);
      let set=[...pickD(1).slice(0,4),...pickD(2).slice(0,4),...pickD(3).slice(0,2)];
      if(set.length<N) set=set.concat(pool.filter(q=>!set.includes(q))).slice(0,N);
      return set.map(q=>{ const order=shuffle(q.o.map((_,n)=>n),r); return {q:q.q,e:q.e,c:q.c||"Marketing",d:q.d||1,o:order.map(n=>q.o[n]),a:order.indexOf(q.a)}; });
    }
    function intro(){
      clearInterval(timer);
      const P=LAB&&LAB.profile, best=P&&P.best.quiz, daily=P&&P.best["quiz-daily-"+(LAB?LAB.today():"")];
      host.innerHTML=`<div class="qz-intro"><p class="eyebrow">Marketing quiz · speed run</p><h2 class="qz-title">10 questions. 20 seconds each.<br><em>How sharp are your instincts?</em></h2>
      <ul class="qz-rules"><li><b>Speed bonus</b><span>Answer faster, score more (up to +50 per question).</span></li><li><b>Streak multiplier</b><span>Every correct answer in a row raises it, up to ×2.</span></li><li><b>Two lifelines</b><span>50:50 removes two wrong answers. Skip gives you a fresh question.</span></li></ul>
      <div class="btn-row"><button class="btn" type="button" data-start="practice">Start quiz</button><button class="btn ghost" type="button" data-start="daily">Daily quiz #${LAB?LAB.dayNo():1}</button></div>
      <p class="muted qz-meta">${best!=null?`Your best: <b>${best}</b> points. `:""}${daily!=null?`Today's daily: <b>${daily}</b>. `:""}Keyboard: press 1–4 to answer, Enter for next.</p></div>`;
    }
    function start(mode){
      const daily=mode==="daily";
      S={daily,qs:build(daily),i:0,pts:0,correct:0,streak:0,best:0,fast:0,ans:[],ff:true,skip:true,locked:false,left:T,removed:[]};
      if(daily) S.spare=build(false).filter(x=>!S.qs.some(q=>q.q===x.q))[0];
      else S.spare=shuffle(D.quiz).map(q=>({q:q.q,e:q.e,c:q.c||"Marketing",d:q.d||1,o:q.o.slice(),a:q.a})).find(x=>!S.qs.some(q=>q.q===x.q));
      render(); host.scrollIntoView({block:"start",behavior:reduce?"auto":"smooth"});
    }
    const mult=()=>Math.min(2,1+S.streak*0.25);
    function hud(){ return `<div class="qz-hud"><div><span>Question</span><b>${S.i+1}<small>/${N}</small></b></div><div><span>Points</span><b id="qz-pts">${S.pts}</b></div><div><span>Streak</span><b class="${S.streak>=3?"hot":""}">${S.streak}<small> ×${mult().toFixed(2).replace(/0$/,"")}</small></b></div>
      <div class="qz-life"><button type="button" class="qz-ll" data-ff ${S.ff&&S.ans[S.i]==null?"":"disabled"} aria-label="50:50 lifeline${S.ff?"":", used"}">50:50</button><button type="button" class="qz-ll" data-skip ${S.skip&&S.ans[S.i]==null&&S.spare?"":"disabled"} aria-label="Skip lifeline${S.skip?"":", used"}">Skip</button></div></div>
      <div class="qz-dots" aria-hidden="true">${S.qs.map((_,n)=>`<i class="${n<S.i?(S.ans[n]&&S.ans[n].ok?"ok":"no"):n===S.i?"cur":""}"></i>`).join("")}</div>`; }
    function render(){
      clearInterval(timer);
      if(S.i>=N) return result();
      const q=S.qs[S.i], a=S.ans[S.i];
      host.innerHTML=hud()+`<div class="qz-card"><p class="qz-cat"><span>${e(q.c)}</span><span>${["","Easy","Medium","Hard"][q.d]||""}</span></p>
        <div class="qz-timer" aria-hidden="true"><i id="qz-bar" style="width:${a?0:S.left/T*100}%"></i></div><p class="sr-only" id="qz-time-sr" aria-live="off"></p>
        <h3 id="qq" tabindex="-1">${e(q.q)}</h3>
        <div class="qz-opts" role="group" aria-labelledby="qq">${q.o.map((o,n)=>{ const gone=!a&&S.removed.includes(n); const cls=a?(n===q.a?"correct":n===a.pick?"wrong":"dim"):""; return `<button class="qz-opt ${cls}" type="button" data-n="${n}" ${a||gone?"disabled":""} ${gone?'aria-hidden="true" style="visibility:hidden"':""}><kbd>${n+1}</kbd><span>${e(o)}</span></button>`; }).join("")}</div>
        <div id="qz-fb" aria-live="polite">${a?feedback(a,q):""}</div></div>`;
      host.querySelector("#qq").focus({preventScroll:true});
      if(!a){ S.t0=performance.now()-(T-S.left)*1000; const bar=host.querySelector("#qz-bar");
        timer=setInterval(()=>{ S.left=Math.max(0,T-(performance.now()-S.t0)/1000); if(bar) bar.style.width=(S.left/T*100)+"%"; if(bar) bar.classList.toggle("low",S.left<6); if(S.left<=0){ clearInterval(timer); answer(-1); } },reduce?1000:100); }
    }
    function feedback(a,q){
      const pts=a.ok?`<span class="qz-gain">+${a.gain}</span>`:"";
      return `<div class="notice ${a.ok?"ok":"err"} qz-note"><b>${a.ok?(a.secs<5?"Lightning fast. ":"Correct. "):a.pick===-1?"Time's up. ":"Not quite. "}</b>${pts} ${e(q.e)}</div>
        <div class="btn-row"><button class="btn" type="button" data-next>${S.i===N-1?"See my result":"Next question"}</button></div>`;
    }
    function answer(pick){
      if(S.locked||S.ans[S.i])return; S.locked=true; clearInterval(timer);
      const q=S.qs[S.i], secs=(performance.now()-S.t0)/1000, ok=pick===q.a; let gain=0;
      if(ok){ const speed=Math.round(50*Math.max(0,(T-secs))/T); gain=Math.round((100+speed)*mult()); S.pts+=gain; S.correct++; S.streak++; S.best=Math.max(S.best,S.streak); if(secs<5)S.fast++; }
      else S.streak=0;
      S.ans[S.i]={pick,ok,gain,secs}; S.removed=[];
      render(); S.locked=false;
      const btn=host.querySelector(`.qz-opt[data-n="${pick}"]`)||host.querySelector(".qz-card");
      if(LAB){ if(ok){ LAB.floatPts(btn,"+"+gain,true); if(S.streak>=3) LAB.burst(btn.getBoundingClientRect().left+btn.offsetWidth/2,btn.getBoundingClientRect().top,14); if(S.streak===5)LAB.badge("streak5"); if(S.streak===10)LAB.badge("streak10"); } else LAB.shake(host.querySelector(".qz-card")); }
      const nx=host.querySelector("[data-next]"); if(nx) nx.focus({preventScroll:true});
    }
    function result(){
      clearInterval(timer);
      const acc=S.correct, pts=S.pts, rank=rankOf(pts); let isBest=false;
      if(LAB){ const r=LAB.record("quiz",pts,{acc,daily:S.daily}); isBest=r.isBest;
        if(S.daily){ const P=LAB.profile, k="quiz-daily-"+LAB.today(); P.best[k]=Math.max(pts,P.best[k]||0); try{ localStorage.setItem("fodo-lab",JSON.stringify(P)); }catch(_){} }
        LAB.badge("quiz_done"); if(acc===N)LAB.badge("quiz_perfect"); if(S.fast>=5)LAB.badge("quiz_speed");
        LAB.addXP(Math.round(pts/10)+(acc===N?50:0)+(S.daily?25:0),`Quiz: ${acc}/${N} correct`); if(isBest||acc>=8) LAB.burst(); }
      const weak={}; S.qs.forEach((q,n)=>{ if(!S.ans[n]||!S.ans[n].ok) weak[q.c]=(weak[q.c]||0)+1; }); const weakCat=Object.entries(weak).sort((a,b)=>b[1]-a[1])[0];
      const share=`I scored ${pts} points (${acc}/${N}) on the FODO marketing quiz${S.daily?`: Daily #${LAB?LAB.dayNo():""}`:""}. Rank: ${rank}. Beat me: ${location.origin+location.pathname}`;
      const svc={Ads:"paid-advertising",SEO:"seo",Brand:"brand-strategy",Conversion:"cro",Content:"content-marketing",Social:"social-media",Analytics:"analytics","Email & WhatsApp":"marketing-automation"};
      host.innerHTML=`<div class="qz-result"><p class="eyebrow">${S.daily?`Daily quiz #${LAB?LAB.dayNo():""}`:"Your result"}</p>
        <div class="qz-score"><b>${pts}</b><span>points</span></div>
        <p class="qz-rank">${e(rank)}${isBest?' <span class="tag ok">New best</span>':""}</p>
        <div class="qz-stats"><div><b>${acc}/${N}</b><span>correct</span></div><div><b>${S.best}</b><span>best streak</span></div><div><b>${S.fast}</b><span>answers under 5s</span></div></div>
        ${weakCat?`<p class="lead" style="margin:18px auto 0">Your biggest gap today: <b>${e(weakCat[0])}</b>. <a href="${R.services}${svc[weakCat[0]]||""}/">See how FODO handles ${e(weakCat[0])} →</a></p>`:`<p class="lead" style="margin:18px auto 0">A perfect run. You think like a growth marketer.</p>`}
        <div class="btn-row" style="justify-content:center;margin-top:24px"><button class="btn" type="button" data-again>Play again</button><a class="btn ghost" href="${U.wa(share)}" target="_blank" rel="noopener noreferrer">Challenge a friend</a><a class="btn ghost" href="${R.game}">Try the FODO Challenge</a></div></div>
        <h3 style="margin-top:36px">Review your answers</h3>${S.qs.map((q,n)=>{ const a=S.ans[n]; return `<div class="acc"><button type="button" aria-expanded="false" aria-controls="qr${n}">${a&&a.ok?"✓":"✗"} ${e(q.q)}</button><div class="acc-body" id="qr${n}" hidden><b>Answer: ${e(q.o[q.a])}.</b> ${e(q.e)}</div></div>`; }).join("")}
        <div class="btn-row" style="margin-top:20px"><a class="btn ghost" href="${R.score}">Get my Growth Score</a></div>`;
      host.scrollIntoView({block:"start",behavior:reduce?"auto":"smooth"});
    }
    host.addEventListener("click",ev=>{
      const t=ev.target;
      const st=t.closest("[data-start]"); if(st){ start(st.dataset.start); return; }
      const o=t.closest(".qz-opt"); if(o&&!o.disabled){ answer(+o.dataset.n); return; }
      if(t.closest("[data-next]")){ S.i++; S.left=T; render(); return; }
      if(t.closest("[data-again]")){ intro(); host.querySelector("[data-start]").focus(); return; }
      if(t.closest("[data-ff]")&&S.ff&&!S.ans[S.i]){ S.ff=false; const q=S.qs[S.i]; S.removed=shuffle(q.o.map((_,n)=>n).filter(n=>n!==q.a)).slice(0,Math.max(0,q.o.length-2)); render(); return; }
      if(t.closest("[data-skip]")&&S.skip&&!S.ans[S.i]&&S.spare){ S.skip=false; const sp=S.spare; const order=shuffle(sp.o.map((_,n)=>n)); S.qs[S.i]={q:sp.q,e:sp.e,c:sp.c,d:sp.d,o:order.map(n=>sp.o[n]),a:order.indexOf(sp.a)}; S.left=T; S.removed=[]; render(); return; }
    });
    document.addEventListener("keydown",ev=>{
      if(!S||S.i>=N||ev.altKey||ev.ctrlKey||ev.metaKey||/INPUT|TEXTAREA|SELECT/.test((ev.target.tagName||"")))return;
      if(!host.contains(document.activeElement)&&document.activeElement!==document.body)return;
      const k=ev.key.toLowerCase(), map={"1":0,"2":1,"3":2,"4":3,a:0,b:1,c:2,d:3};
      if(k in map&&!S.ans[S.i]){ const b=host.querySelector(`.qz-opt[data-n="${map[k]}"]`); if(b&&!b.disabled){ ev.preventDefault(); answer(map[k]); } }
    });
    document.addEventListener("visibilitychange",()=>{ if(!S||S.ans[S.i]||S.i>=N)return; if(document.hidden){ clearInterval(timer); S.paused=true; } else if(S.paused){ S.paused=false; render(); } });
    intro();
  },"quiz");
})();
