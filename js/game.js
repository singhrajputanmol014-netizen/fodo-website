/* FODO Challenge, 4-round browser game. Scoring: R1 2×15, R2 20, R3 2×15, R4 5×4 = 100 max; streak bonus +1 per consecutive correct after the 2nd (cap +5), total clamped to 100. */
(function(){
  const U=window.FODO_UTIL, R=U.routes, e=U.esc, C=window.FODO, G=window.FODO_DATA.game; if(document.body.dataset.route!=="game")return;
  U.safe(()=>{
    const host=document.getElementById("game"), hud=document.getElementById("hud"); const TOTAL=120; let S;
    const LAB=window.FODO_LAB; let DAILY=false; let RND=Math.random;
    const pick=(arr,n)=>{ const a=arr.slice(); for(let k=a.length-1;k>0;k--){ const j=Math.floor(RND()*(k+1)); [a[k],a[j]]=[a[j],a[k]]; } return a.slice(0,n); };
    const reset=()=>{ S={round:0,score:0,streak:0,bonus:0,time:TOTAL,paused:false,over:false,log:[],r1:pick(G.round1,2),r3:pick(G.round3,2),r4:pick(G.round4,5),sub:0,sel:null,slots:[]}; };
    const H=()=>{ hud.innerHTML=["Time",S.time+"s","Score",S.score,"Streak",(S.streak>=3?"🔥 ":"")+S.streak+"×","Round",Math.min(4,S.round+1)+"/4","Progress",Math.round(progress()*100)+"%"].reduce((a,x,i,arr)=>i%2?a:a+`<div class="panel"><span class="label muted">${x}</span><div class="big">${arr[i+1]}</div></div>`,""); };
    const progress=()=>{ const parts=[2,1,2,5]; let done=0,tot=parts.reduce((a,b)=>a+b); for(let r=0;r<S.round;r++)done+=parts[r]; done+=S.sub; return Math.min(1,done/tot); };
    let lastEl=null;
    const correct=(pts)=>{ S.streak++; if(S.streak>2&&S.bonus<5){S.bonus++;pts++;} S.score=Math.min(100,S.score+pts); S.bestStreak=Math.max(S.bestStreak||0,S.streak);
      if(LAB){ LAB.floatPts(lastEl||host,"+"+pts+(S.streak>2?"  🔥"+S.streak:""),true); if(S.streak>=3&&lastEl){ const r=lastEl.getBoundingClientRect(); LAB.burst(r.left+r.width/2,r.top,12); } if(S.streak===5)LAB.badge("streak5"); } };
    const wrong=()=>{ S.streak=0; if(LAB) LAB.shake(host); };
    let timer; const tick=()=>{ if(S.paused||S.over)return; S.time--; H(); if(S.time<=0){S.time=0;end();} };
    const startTimer=()=>{ clearInterval(timer); timer=setInterval(tick,1000); };
    document.addEventListener("visibilitychange",()=>{ if(!S||S.over)return; if(document.hidden){S.paused=true;render(true);} });
    const rounds=()=>`<div class="rounds" aria-hidden="true">${[0,1,2,3].map(r=>`<i class="${r<S.round?"done":r===S.round?"cur":""}"></i>`).join("")}</div>`;
    const controls=`<div class="btn-row" style="margin-top:12px"><button class="btn sm ghost" type="button" data-pause>Pause</button><button class="btn sm ghost" type="button" data-restart>Restart</button><a class="btn sm ghost" href="${R.lab}">Leave</a></div>`;
    const explain=(ok,txt,next)=>`<div class="notice ${ok?"ok":"err"}"><b>${ok?"Correct.":"Not quite."}</b> ${e(txt)}</div><button class="btn" type="button" data-cont>${next||"Continue"}</button>`;
    function render(pausedScreen){ H();
      if(S.paused){ host.innerHTML=`<p class="eyebrow">Paused</p><h3>Timer stopped${pausedScreen&&document.hidden?" (tab hidden)":""}.</h3><div class="btn-row"><button class="btn" type="button" data-resume>Resume</button><button class="btn ghost" type="button" data-restart>Restart</button><a class="btn ghost" href="${R.lab}">Leave</a></div>`; return; }
      if(S.round===0){ const sc=S.r1[S.sub]; const card=(k,c)=>`<button class="panel choice" type="button" data-pick="${k}" style="min-height:140px"><span class="tag warn">HYPOTHETICAL</span><h4 style="margin:10px 0 6px">${e(c.n)}</h4>${c.m.map(m=>{const [a,b]=m.split(":");return `<div class="mono" style="letter-spacing:.04em;text-transform:none"><span class="muted">${e(a)}</span><b>${e((b||"").trim())}</b></div>`;}).join("")}<span class="btn sm" style="margin-top:12px;pointer-events:none">Choose ${k.toUpperCase()}</span></button>`;
        host.innerHTML=rounds()+`<p class="eyebrow">Round 1 · Spot the winner (${S.sub+1}/2)</p><h3>${e(sc.obj)}</h3><p class="muted">Pick the campaign that better serves the objective, not the one with the prettiest vanity metric.</p><div class="grid g2">${card("a",sc.a)}${card("b",sc.b)}</div><div id="fb"></div>${controls}`; }
      else if(S.round===1){ const items=G.round2.order; if(!S.pool){ S.pool=items.slice().sort(()=>Math.random()-.5); S.slots=new Array(items.length).fill(null); }
        host.innerHTML=rounds()+`<p class="eyebrow">Round 2 · Fix the funnel</p><h3>Arrange the stages in the right order.</h3><p class="muted">Drag a stage into a slot, or tap a stage then tap a slot. Keyboard: Tab to a stage, Enter to select, Tab to a slot, Enter to place.</p>
        <div class="pool" id="pool">${S.pool.map((p,n)=>p?`<button class="btn ghost" type="button" draggable="true" data-item="${n}" aria-pressed="${S.sel===n}">${e(p)}</button>`:"").join("")}</div>
        <div class="funnel-slots">${S.slots.map((s,n)=>`<div class="slot ${s?"filled":""} ${S.sel!=null?"sel":""}" tabindex="0" role="button" aria-label="Slot ${n+1}${s?": "+s:" empty"}" data-slot="${n}"><span>${n+1}. ${s?e(s):"<span class='muted'>drop here</span>"}</span>${s?`<button class="btn sm ghost" type="button" data-unslot="${n}" aria-label="Remove ${e(s)}">×</button>`:""}</div>`).join("")}</div>
        <div class="btn-row"><button class="btn" type="button" data-check ${S.slots.every(Boolean)?"":"disabled"}>Check order</button></div><div id="fb"></div>${controls}`; }
      else if(S.round===2){ const sc=S.r3[S.sub]; host.innerHTML=rounds()+`<p class="eyebrow">Round 3 · Save the campaign (${S.sub+1}/2)</p><span class="tag warn">HYPOTHETICAL</span><h3 style="margin-top:12px">${e(sc.s)}</h3><div class="grid g3">${sc.o.map((o,n)=>`<button class="btn ghost choice" type="button" data-opt="${n}" data-letter="${String.fromCharCode(65+n)}" style="min-height:64px">${o}</button>`).join("")}</div><div id="fb"></div>${controls}`; }
      else if(S.round===3){ const q=S.r4[S.sub]; host.innerHTML=rounds()+`<p class="eyebrow">Round 4 · Growth mode (${S.sub+1}/5)</p><div class="timer-bar" aria-hidden="true"><i id="qbar"></i></div><h3>${e(q.q)}</h3>${q.o.map((o,n)=>`<button class="panel choice" type="button" data-opt="${n}" data-letter="${String.fromCharCode(65+n)}">${e(o)}</button>`).join("")}<div id="fb"></div>${controls}`;
        const bar=document.getElementById("qbar"); let t=10; S.qt=setInterval(()=>{ if(S.paused)return; t--; bar.style.width=(t/10*100)+"%"; if(t<=0){clearInterval(S.qt); fb(false,"Time's up for this question. Speed matters in growth mode."); wrong(); S.log.push([q.q,"(no answer)",q.o[q.a]]);} },1000); }
      else end(); }
    const fb=(ok,txt,next)=>{ const f=document.getElementById("fb"); host.querySelectorAll(".choice,[data-pick],[data-opt]").forEach(b=>b.disabled=true); f.innerHTML=explain(ok,txt,next); f.querySelector("[data-cont]").focus(); };
    const next=()=>{ clearInterval(S.qt); const lens=[2,1,2,5]; S.sub++; if(S.sub>=lens[S.round]){S.round++;S.sub=0;} render(); };
    host.addEventListener("click",ev=>{ lastEl=ev.target.closest("button")||lastEl; },true);
    host.addEventListener("click",ev=>{ const t=ev.target;
      if(t.closest("[data-pause]")){S.paused=true;render();return;} if(t.closest("[data-resume]")){S.paused=false;render();return;} if(t.closest("[data-restart]")){start();return;} if(t.closest("[data-cont]")){next();return;} if(t.closest("[data-again]")){DAILY=false;start();return;} if(t.closest("[data-daily]")){DAILY=true;start();return;}
      if(S.round===0&&t.closest("[data-pick]")){ const k=t.closest("[data-pick]").dataset.pick, sc=S.r1[S.sub], ok=k===sc.w; ok?correct(15):wrong(); S.log.push([sc.obj,k.toUpperCase(),sc.w.toUpperCase()+": "+sc.e]); t.closest("[data-pick]").classList.add(ok?"correct":"wrong"); fb(ok,sc.e); }
      if(S.round===1){ const it=t.closest("[data-item]"), sl=t.closest("[data-slot]"), un=t.closest("[data-unslot]");
        if(un){ const n=+un.dataset.unslot; S.pool[S.pool.indexOf(null)]=S.slots[n]; S.slots[n]=null; render(); return; }
        if(it){ S.sel=S.sel===+it.dataset.item?null:+it.dataset.item; render(); return; }
        if(sl&&S.sel!=null&&!S.slots[+sl.dataset.slot]){ place(S.sel,+sl.dataset.slot); return; }
        if(t.closest("[data-check]")){ const ok=S.slots.every((s,n)=>s===G.round2.order[n]); const right=S.slots.filter((s,n)=>s===G.round2.order[n]).length; ok?correct(20):(S.score=Math.min(100,S.score+right*4),wrong()); S.log.push(["Funnel order",S.slots.join(" → "),G.round2.order.join(" → ")]); host.querySelector("[data-check]").disabled=true; fb(ok,ok?G.round2.e:`${right}/5 in the right place. Correct order: ${G.round2.order.join(" → ")}. ${G.round2.e}`); } }
      if(S.round===2&&t.closest("[data-opt]")){ const n=+t.closest("[data-opt]").dataset.opt, sc=S.r3[S.sub], ok=n===sc.a; ok?correct(15):wrong(); host.querySelectorAll("[data-opt]").forEach(b=>b.classList.add(+b.dataset.opt===sc.a?"correct":+b.dataset.opt===n?"wrong":"x")); S.log.push([sc.s,sc.o[n],sc.o[sc.a]+": "+sc.e]); fb(ok,sc.e); }
      if(S.round===3&&t.closest("[data-opt]")){ clearInterval(S.qt); const n=+t.closest("[data-opt]").dataset.opt, q=S.r4[S.sub], ok=n===q.a; ok?correct(4):wrong(); host.querySelectorAll("[data-opt]").forEach(b=>b.classList.add(+b.dataset.opt===q.a?"correct":+b.dataset.opt===n?"wrong":"x")); S.log.push([q.q,q.o[n],q.o[q.a]]); fb(ok,"Correct answer: "+q.o[q.a],S.sub===4?"Finish":"Next"); }
    });
    host.addEventListener("keydown",ev=>{ if(S.round!==1)return; const sl=ev.target.closest("[data-slot]"); if(sl&&(ev.key==="Enter"||ev.key===" ")&&S.sel!=null&&!S.slots[+sl.dataset.slot]){ev.preventDefault();place(S.sel,+sl.dataset.slot);} });
    host.addEventListener("dragstart",ev=>{ const it=ev.target.closest("[data-item]"); if(it){ev.dataTransfer.setData("text/plain",it.dataset.item);} });
    host.addEventListener("dragover",ev=>{ if(ev.target.closest("[data-slot]"))ev.preventDefault(); });
    host.addEventListener("drop",ev=>{ const sl=ev.target.closest("[data-slot]"); if(!sl)return; ev.preventDefault(); const n=+ev.dataTransfer.getData("text/plain"); if(!S.slots[+sl.dataset.slot]&&S.pool[n])place(n,+sl.dataset.slot); });
    host.addEventListener("touchmove",ev=>{ if(S.round===1&&ev.target.closest("[data-item]"))ev.preventDefault(); },{passive:false});
    function place(item,slot){ S.slots[slot]=S.pool[item]; S.pool[item]=null; S.sel=null; render(); }
    function end(){ S.over=true; clearInterval(timer); clearInterval(S.qt); H(); const sc=S.score; const low=sc<40; const PR=progressPanel(sc); const code="FODO-"+Math.random().toString(36).slice(2,6).toUpperCase();
      let reward="";
      if(low){ reward=`<div class="panel hud" style="border-color:var(--signal)"><h3 style="text-transform:uppercase">You didn't lose.</h3><h3 style="text-transform:uppercase;color:var(--signal)">You just earned a free marketing consultation.</h3><p>Every failed experiment teaches us something. Let's find out where your growth is getting stuck.</p><p class="mono muted">${e(C.challengeRewardText)} · Reference ${code}</p><button class="btn" type="button" data-claim>Claim free consultation</button></div>`; }
      else if(C.discountsEnabled){ const tier=(C.discountTiers||[]).find(t=>sc>=t.min&&sc<=t.max); if(tier)reward=`<div class="panel hud" style="border-color:var(--signal)"><h3>${tier.pct}% reward unlocked (pending verification)</h3><p class="mono muted">Reference ${code} · valid ${C.rewardValidityDays} days from issue</p><p style="font-size:14px">Terms: applies to eligible FODO services; one reward per person/business; no cash value; cannot be combined with another offer; expires after ${C.rewardValidityDays} days; subject to FODO verification and approval. A browser-generated code is not proof of eligibility: FODO confirms manually${C.formEndpoint?" after receiving your claim":""}.</p><button class="btn" type="button" data-claim>Claim reward</button></div>`; }
      else { reward=`<div class="panel hud" style="border-color:var(--ok)"><h3>Challenge complete.</h3><p>You read the evidence well. Your next step: the FODO Growth Playbook, a checklist built from the same decisions you just made.</p><div class="btn-row"><a class="btn" href="${R.resources}">Open the Growth Playbook</a><a class="btn ghost" href="${R.call}">Request a strategy call</a></div></div>`; }
      host.innerHTML=`<p class="eyebrow">${S.daily?"Daily Challenge #"+(LAB?LAB.dayNo():""):"Result"}</p><div class="big">${sc} / 100</div><p class="muted mono">Accuracy-based score · streak bonus included: +${S.bonus}</p>${PR}${reward}
      <div class="btn-row">${LAB?"":`<button class="btn ghost" type="button" data-again>Play again</button>`}<button class="btn ghost" type="button" data-answers aria-expanded="false" aria-controls="answers">View answers</button><a class="btn ghost" href="${R.lab}">Back to Growth Lab</a></div>
      <div id="answers" hidden class="table-wrap" style="margin-top:20px"><table><thead><tr><th>Scenario</th><th>Your answer</th><th>Correct / why</th></tr></thead><tbody>${S.log.map(l=>`<tr><td>${e(l[0])}</td><td>${e(l[1])}</td><td>${e(l[2])}</td></tr>`).join("")}</tbody></table></div>
      <div id="claim" hidden class="panel" style="margin-top:20px"><h3>Claim your reward</h3><p class="muted" style="font-size:14px">Name plus email or WhatsApp is all we need. Details are used only to contact you about this reward; nothing is stored in your browser.</p>
        <form id="claim-form" novalidate><div class="field"><label for="cn">Name</label><input id="cn" name="name" required maxlength="80"><span class="err"></span></div><div class="field"><label for="ce">Email or WhatsApp number</label><input id="ce" name="contact" required maxlength="80"><span class="err"></span></div>
        <label class="check"><input type="checkbox" name="consent" required> I agree that FODO may contact me about this reward. <a href="${R.legal}#privacy">Privacy</a></label><span class="err" id="cerr"></span>
        <div class="btn-row"><button class="btn" type="submit">${C.formEndpoint?"Send claim":"Send via WhatsApp"}</button><button class="btn ghost" type="button" data-copycode>Copy code</button></div>
        <p class="muted" style="font-size:13px;margin-top:10px">${C.formEndpoint?"Your claim is sent to FODO for manual confirmation.":"WhatsApp opens with your details pre-filled, you still need to press Send. Your request needs manual confirmation from FODO."}</p></form></div>`;
      host.querySelector("[data-answers]").addEventListener("click",ev=>{ const a=document.getElementById("answers"); a.hidden=!a.hidden; ev.currentTarget.setAttribute("aria-expanded",!a.hidden); });
      const cl=host.querySelector("[data-claim]"); if(cl)cl.addEventListener("click",()=>{ document.getElementById("claim").hidden=false; document.getElementById("cn").focus(); });
      host.querySelector("[data-copycode]").addEventListener("click",ev=>U.copy(code,ev.currentTarget));
      document.getElementById("claim-form").addEventListener("submit",async ev=>{ ev.preventDefault(); const f=ev.target; let ok=true; [...f.querySelectorAll("[required]")].forEach(i=>{ const bad=i.type==="checkbox"?!i.checked:!i.value.trim(); if(i.type!=="checkbox"){i.closest(".field").classList.toggle("invalid",bad);i.closest(".field").querySelector(".err").textContent=bad?"Required":"";} else document.getElementById("cerr").textContent=bad?"Consent is required to claim.":""; if(bad)ok=false; }); if(!ok)return;
        const payload={source:"fodo-challenge",score:sc,tier:low?"consultation":"completion",code,timestamp:new Date().toISOString(),name:f.name.value.trim(),contact:f.contact.value.trim(),consent:true};
        if(C.formEndpoint){ try{ const r=await fetch(C.formEndpoint,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(payload)}); if(!r.ok)throw new Error(r.status); location.href=R.thanks+"?state=sent&from=challenge"; }catch(err){ f.insertAdjacentHTML("beforeend",`<div class="notice err">Sending failed. <a href="${U.wa(claimMsg(payload))}" target="_blank" rel="noopener noreferrer">Send via WhatsApp instead</a>.</div>`); } }
        else { window.open(U.wa(claimMsg(payload)),"_blank","noopener"); location.href=R.thanks+"?state=whatsapp&from=challenge"; } });
      const claimMsg=p=>`Hi FODO, I played the FODO Challenge and scored ${p.score}/100. Reference ${p.code}. I'd like to claim: ${low?C.challengeRewardText:"my reward"}. Name: ${p.name}. Contact: ${p.contact}.`;
    }
    function progressPanel(sc){
      if(!LAB) return "";
      const titles=[[0,"Rookie"],[40,"Analyst"],[60,"Strategist"],[75,"Growth lead"],[90,"Growth legend"]], title=titles.filter(t=>sc>=t[0]).pop()[1];
      const r=LAB.record("game",sc,{daily:S.daily,streak:S.bestStreak||0}); const P=LAB.profile;
      if(S.daily){ const k="game-daily-"+LAB.today(); P.best[k]=Math.max(sc,P.best[k]||0); try{ localStorage.setItem("fodo-lab",JSON.stringify(P)); }catch(_){} LAB.badge("game_daily"); }
      LAB.badge("game_done"); if(sc>=80) LAB.badge("game_80");
      const xp=sc+(S.daily?40:0)+(r.isBest?30:0); setTimeout(()=>{ LAB.addXP(xp,`FODO Challenge: ${sc}/100`); if(r.isBest||sc>=80) LAB.burst(); },350);
      const best=P.best.game, hrs=Math.ceil(LAB.msToMidnight()/36e5);
      const share=`I scored ${sc}/100 in the FODO Challenge${S.daily?" (Daily #"+LAB.dayNo()+")":""}, rank: ${title}. Can you beat it? ${location.origin+location.pathname}`;
      return `<div class="gm-progress panel"><div><span>Rank</span><b>${e(title)}</b></div><div><span>Your best</span><b>${best}</b>${r.isBest?' <em class="tag ok">New best</em>':""}</div><div><span>Best streak</span><b>${S.bestStreak||0}</b></div><div><span>XP earned</span><b>+${xp}</b></div>
        <p class="gm-next">${sc<best?`You're <b>${best-sc}</b> points off your best, one more run?`:sc<100?`Next rank at <b>${(titles.find(t=>t[0]>sc)||[100])[0]}</b> points.`:"Perfect score. Legendary."} ${S.daily?`Next Daily Challenge in ${hrs}h.`:`Today's Daily Challenge #${LAB.dayNo()} is waiting.`}</p>
        <div class="btn-row"><button class="btn" type="button" data-again>Play again</button>${S.daily?"":'<button class="btn ghost" type="button" data-daily>Play the Daily Challenge</button>'}<a class="btn ghost" href="${U.wa(share)}" target="_blank" rel="noopener noreferrer">Challenge a friend</a></div></div>`;
    }
    function start(){ RND=DAILY&&LAB?LAB.rng(LAB.dailySeed()^0x9e3):Math.random; reset(); S.daily=DAILY; S.pool=null; render(); startTimer(); }
    const go=daily=>{ DAILY=daily; document.getElementById("intro").hidden=true; document.getElementById("play").hidden=false; start(); };
    document.getElementById("start").addEventListener("click",()=>go(false));
    (function(){ const b=document.getElementById("start"); const row=document.createElement("div"); row.className="btn-row gm-start"; b.parentNode.insertBefore(row,b); row.appendChild(b);
      const d=document.createElement("button"); d.type="button"; d.className="btn ghost"; d.id="start-daily"; d.textContent="Daily Challenge #"+(LAB?LAB.dayNo():1); row.appendChild(d); d.addEventListener("click",()=>go(true));
      if(LAB){ const P=LAB.profile, dk="game-daily-"+LAB.today(); const info=document.createElement("p"); info.className="muted gm-info";
        info.innerHTML=(P.best.game!=null?`Your best: <b>${P.best.game}</b> / 100. `:"First time? Average run takes about two minutes. ")+(P.best[dk]!=null?`Today's daily: <b>${P.best[dk]}</b>. Next daily in ${Math.ceil(LAB.msToMidnight()/36e5)}h.`:"Today's Daily Challenge is the same set for everyone, one shot at a clean score.");
        row.after(info); } })();
  },"game");
})();
