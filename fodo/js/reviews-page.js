/* Reviews page — featured top reviews, filters, show-more.
   live mode (config.js reviewsMode:"live"): shows ONLY records with verified:true && demo!==true; if none, a polished empty state.
   preview mode: shows sample records behind a visible "Design preview" banner with DEMO tags (internal design use only).
   Data: js/reviews.js (generated from data/reviews.csv by scripts/build_reviews.py). Tolerates a missing/empty/malformed dataset. */
(function(){ const U=window.FODO_UTIL, C=window.FODO||{}, e=U.esc; if(document.body.dataset.route!=="reviews")return;
  U.safe(()=>{
    const live=C.reviewsMode!=="preview";                       // anything other than an explicit "preview" is treated as live
    const $=id=>document.getElementById(id);
    const str=v=>typeof v==="string"?v.trim():(v==null?"":String(v).trim());
    const raw=Array.isArray(window.FODO_REVIEWS)?window.FODO_REVIEWS:[];
    const norm=raw.filter(r=>r&&typeof r==="object").map(r=>({
        id:str(r.id), name:str(r.name).replace(/\s+\d{2,}$/,""), cat:str(r.cat)||"Other", type:str(r.type), area:str(r.area)||"Delhi NCR",
        text:str(r.text), services:Array.isArray(r.services)?r.services.map(str).filter(Boolean):[],
        rating:Number.isInteger(r.rating)&&r.rating>=1&&r.rating<=5?r.rating:null, date:str(r.date), source:str(r.source),
        verified:r.verified===true&&r.demo!==true, featured:r.featured===true }))
      .filter(r=>r.name&&r.text);
    const all=live?norm.filter(r=>r.verified):norm;
    const wa=U.wa?U.wa("Hi Anmol, I'd like to share a review of working with FODO."):"#";
    const gUrl=/^https:\/\//.test(str(C.googleReviewUrl))?str(C.googleReviewUrl):"";
    const banner=$("reviews-banner"), list=$("reviews-list"), invite=$("reviews-invite");

    // Google review button in the "Worked with FODO?" panel — only when a real URL is configured
    const g=$("google-review-link"); if(g&&gUrl){ g.href=gUrl; g.hidden=false; }

    if(!all.length){
      if(list)list.hidden=true; if(invite)invite.hidden=true;
      if(banner)banner.innerHTML=`<div class="panel hud reviews-empty-state"><span class="tag">VERIFIED REVIEWS ONLY</span>
        <h2>We're collecting our first verified client stories.</h2>
        <p class="muted">FODO publishes a review only when it comes from a real client and they have approved it in writing — no samples, no stock quotes, no edits beyond typo fixes. Our first founding-partner stories are being gathered now.</p>
        <div class="btn-row"><a class="btn" href="${e(wa)}" target="_blank" rel="noopener noreferrer">Share your review on WhatsApp</a>${gUrl?`<a class="btn ghost" href="${e(gUrl)}" target="_blank" rel="noopener noreferrer">Review FODO on Google</a>`:""}<a class="btn ghost" href="${e((U.routes||{}).work||"../work/")}">See how we work</a></div></div>`;
      return;
    }
    if(list)list.hidden=false; if(invite)invite.hidden=false;
    if(!live&&banner) banner.innerHTML=`<div class="notice" style="margin:0 0 20px"><b>Design preview.</b> The reviews below are sample entries used to preview this page's layout — they are not from verified FODO clients. Only verified, written-approved reviews are shown when <code>reviewsMode</code> is "live".</div>`;

    const star=n=>n?`<span class="stars" aria-label="${n} out of 5">${"★".repeat(n)}${"☆".repeat(5-n)}</span>`:"";
    const badge=r=>r.verified?`<span class="tag ok">VERIFIED CLIENT</span>`:`<span class="tag warn">DEMO</span>`;
    const meta=r=>[r.services.map(e).join(" · "),r.date&&e(r.date),r.source&&("via "+e(r.source))].filter(Boolean).join(" · ");
    const card=(r,feat)=>`<article class="panel ${feat?"hud":""} review"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><b>${e(r.name)}</b><div class="mono muted" style="font-size:11px">${e(r.type||r.cat)} · ${e(r.area)}</div></div>${badge(r)}</div>${star(r.rating)}<p style="margin:10px 0 8px;font-size:15px">“${e(r.text)}”</p><div class="mono muted" style="font-size:10px;letter-spacing:.1em">${meta(r)}</div></article>`;

    // stats — average only from reviews that actually carry a rating
    const cats=[...new Set(all.map(r=>r.cat))], areas=[...new Set(all.map(r=>r.area))].sort();
    const rated=all.filter(r=>r.rating); const avg=rated.length?(rated.reduce((a,r)=>a+r.rating,0)/rated.length).toFixed(1)+" / 5":"—";
    const stats=$("reviews-stats"); if(stats)stats.innerHTML=[["Reviews",all.length],["Average rating",avg],["Industries",cats.length],["Areas in NCR",areas.length]].map(([l,v])=>`<div class="panel" style="padding:14px"><span class="label muted">${l}</span><div class="big" style="font-size:26px">${v}</div></div>`).join("");

    const filt=$("reviews-filters"), areaSel=$("reviews-area"), more=$("reviews-more"); let cat="All", area="", shown=9;
    if(filt)filt.innerHTML=["All",...cats].map((c,i)=>`<button type="button" aria-pressed="${i===0}" data-f="${e(c)}">${e(c)}</button>`).join("");
    if(areaSel)areas.forEach(a=>areaSel.insertAdjacentHTML("beforeend",`<option>${e(a)}</option>`));
    const matches=()=>all.filter(r=>(cat==="All"||r.cat===cat)&&(!area||r.area===area));
    const render=()=>{ const m=matches(); const feat=m.filter(r=>r.featured).concat(m.filter(r=>!r.featured)).slice(0,3);
      $("reviews-top").innerHTML=feat.map(r=>card(r,true)).join(""); const rest=m.filter(r=>!feat.includes(r));
      $("reviews-all").innerHTML=rest.slice(0,shown).map(r=>card(r,false)).join("");
      const allHead=$("reviews-all-h"); if(allHead)allHead.hidden=!rest.length;
      if(more){ more.hidden=rest.length<=shown; more.textContent=`Show more reviews (${Math.max(0,rest.length-shown)} more)`; }
      const empty=$("reviews-empty"); if(empty)empty.hidden=m.length>0; };
    if(filt)filt.addEventListener("click",ev=>{ const b=ev.target.closest("button"); if(!b)return; cat=b.dataset.f; shown=9; filt.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",x===b)); render(); });
    if(areaSel)areaSel.addEventListener("change",()=>{ area=areaSel.value; shown=9; render(); });
    if(more)more.addEventListener("click",()=>{ shown+=9; render(); });
    render(); },"reviews"); })();
