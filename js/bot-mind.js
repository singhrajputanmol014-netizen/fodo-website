/* FODO Bot: MIND · ORCHESTRATOR
 * INPUT → NORMALISATION → INTENT → ENTITIES → MEMORY → REASONING → RESPONSE STRATEGY → PERSONALITY → FODO HANDOFF
 * Wraps the existing answer chain (bot.js → playbook → brain → training → human) as the outermost layer.
 * Existing FODO answers are reused where they are the source of truth; everything else is handled here.
 * Offline. No eval. No network. Session memory only (sessionStorage, cleared when the tab closes).
 */
(function(){
  "use strict";
  const B=window.FODO_BOT, N=window.FODO_NLU, K=window.FODO_BOT_CALCULATOR, KB=window.FODO_MIND_KB, U=window.FODO_UTIL;
  if(!B||typeof B.answer!=="function"||!N||!K||!KB||!U)return;
  const C=window.FODO||{}, D=window.FODO_DATA||{}, R=U.routes||{}, esc=U.esc||(s=>String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])));
  const prev=B.answer.bind(B);
  const IND=KB.industries, TOPICS=KB.topics, S=KB.social;
  const inr=K.inr, fmt=K.fmt;

  /* =========================== MEMORY =========================== */
  const KEY="fodo-mind-v1";
  const fresh=()=>({p:{channels:[],pains:[],competitors:[]},turn:0,lang:null,lastIntent:null,lastTopic:null,lastHandler:null,lastAsked:null,offer:null,lastQ:"",lastA:"",lastWhy:null,recent:{},handoffTurn:-9,level:"normal",history:[]});
  let M=fresh();
  try{ const s=sessionStorage.getItem(KEY); if(s) M=Object.assign(fresh(),JSON.parse(s)); }catch(e){}
  const save=()=>{ try{ sessionStorage.setItem(KEY,JSON.stringify(M)); }catch(e){} };
  const P=()=>M.p;
  const FIELDS=["name","business","industry","location","audience","model","goal","goal2","budget","spend","revenue","aov","leads","qualified","appointments","customers","clicks","impressions","visitors","cvr","margin","closeRate","ctr","website","crm","maturity"];
  function remember(a){
    const e=a.entities, p=P();
    const set=(k,v)=>{ if(v!=null&&v!=="")p[k]=v; };
    if(e.industry&&(!p.industry||a.has("industry_stmt")||!M.lastAsked||M.lastAsked==="industry")&&!(M.lastAsked==="goal"&&p.industry)){ if(p.industry&&p.industry!==e.industry&&!/\b(also|another|second|too)\b/.test(a.text)){ /* switched business, clear business-specific numbers */ ["leads","customers","appointments","clicks","impressions","revenue","aov"].forEach(k=>delete p[k]); } set("industry",e.industry); set("business",(e.business&&!/^(sell|selling|online business|handmade|homemade)/.test(e.business))?e.business:(IND[e.industry]&&IND[e.industry].name)); }
    set("location",e.location); set("name",e.name); set("website",e.website); set("crm",e.crm);
    if(e.goal){ if(p.goal&&p.goal!==e.goal&&!a.has("troubleshoot"))p.goal2=p.goal; set("goal",e.goal); }
    ["budget","spend","revenue","aov","leads","qualified","appointments","customers","clicks","impressions","visitors","margin","closeRate","cvr","ctr"].forEach(k=>{ if(e[k]!=null)p[k]=e[k]; });
    if(e.budgetPeriod)p.budgetPeriod=e.budgetPeriod;
    (e.channels||[]).forEach(c=>{ if(c!=="website"&&p.channels.indexOf(c)<0)p.channels.push(c); });
    (e.pains||[]).forEach(x=>{ if(p.pains.indexOf(x)<0)p.pains.push(x); }); if(p.pains.length>5)p.pains=p.pains.slice(-5);
    (e.competitors||[]).forEach(x=>{ if(p.competitors.indexOf(x)<0)p.competitors.push(x); });
    if(/\b(b2b)\b/.test(a.text))p.model="B2B"; else if(/\b(b2c|consumers?)\b/.test(a.text))p.model="B2C";
    const aud=a.text.match(/\b(?:target(?:ing)?|audience is|customers are|for)\s+((?:women|men|students|parents|moms|mothers|couples|families|working professionals|professionals|corporates|doctors|startups|small businesses|smes|kids|seniors|youth|gen z|millennials|nri|nris|homeowners)[a-z ,-]{0,40})/); if(aud)p.audience=aud[1].trim();
    const oc=a.text.match(/\b(diwali|holi|navratri|dussehra|eid|christmas|new year|valentine'?s?|raksha bandhan|rakhi|karwa chauth|dhanteras|wedding season|black friday)\b/); if(oc)p.occasion=oc[1];
    if(/\b(just started|new business|starting out|launching|about to launch|pre ?launch)\b/.test(a.text))p.maturity="new";
    else if(/\b(running (ads|for)|already (run|running|doing)|been (doing|running))\b/.test(a.text))p.maturity="active";
    else if(/\b(scale|scaling|crore|multiple cities|expand)\b/.test(a.text))p.maturity="scaling";
  }
  const indName=()=>{ const p=P(); return p.business||(p.industry&&IND[p.industry]?IND[p.industry].name:null); };
  const GOALTXT={leads:"more leads",bookings:"more bookings",sales:"more sales",awareness:"brand visibility",followers:"social growth",traffic:"more traffic",retention:"repeat customers",admissions:"more admissions",hiring:"hiring"};
  function profileLine(){
    const p=P(), bits=[];
    if(indName())bits.push(esc(indName())+(p.location?" in "+esc(p.location):""));
    else if(p.location)bits.push(esc(p.location));
    if(p.goal)bits.push("goal: "+GOALTXT[p.goal]);
    if(p.budget)bits.push(inr(p.budget)+(p.budgetPeriod==="month"||true?"/month":""));
    return bits.join(" · ");
  }

  /* =========================== RENDER HELPERS =========================== */
  const L=(href,t)=>`<a href="${href}">${t}</a>`;
  const WA=(msg,t)=>`<a href="${U.wa?U.wa(msg):"https://wa.me/"+C.whatsappNumber}" target="_blank" rel="noopener noreferrer">${t||"WhatsApp Anmol →"}</a>`;
  const ul=a=>a.filter(Boolean).map(x=>"• "+x).join("<br>");
  const ol=a=>a.filter(Boolean).map((x,i)=>(i+1)+". "+x).join("<br>");
  const join=(...a)=>a.filter(Boolean).join("<br><br>");
  const H=t=>`<b>${t}</b>`;
  let LANG="en";
  const T=(en,hing,hi)=>LANG==="hi"?(hi||hing||en):LANG==="hinglish"?(hing||en):en;
  function vary(key,arr){ if(!arr||!arr.length)return ""; const used=Array.isArray(M.recent[key])?M.recent[key]:[]; const pool=arr.map((_,i)=>i).filter(i=>used.indexOf(i)<0); const choices=pool.length?pool:arr.map((_,i)=>i); const i=choices[Math.floor(Math.random()*choices.length)]; used.push(i); while(used.length>Math.max(0,Math.min(arr.length-1,3)))used.shift(); M.recent[key]=used; return arr[i]; }
  function soc(key){ const s=S[key]; if(!s)return ""; return vary("s_"+key+LANG,(LANG==="hi"&&s.hi)||(LANG!=="en"&&s.hing)||s.en); }
  const svcLink=slug=>{ const s=(D.services||[]).find(x=>x.slug===slug); return s?L(R.services+"#"+slug,esc(s.name)):""; };
  let CHIPS=null; const chips=list=>{ CHIPS=list; };
  let CONF="high"; let HANDOFF_OK=false;
  function handoff(kind){
    if(M.turn-M.handoffTurn<3)return "";
    M.handoffTurn=M.turn;
    if(kind==="audit") return T(`If you'd like a human to look at your actual numbers, the ${L(R.audit,"Free Growth Audit")} is the next step, no obligation.`,`Agar chaho toh insaan se apne asli numbers check karwao: ${L(R.audit,"Free Growth Audit")} (free, koi obligation nahi).`);
    return T(`Want a human take? ${L(R.audit,"Free Growth Audit →")} or ${WA("Hi Anmol, I was chatting with FODO Bot about: "+(indName()||"my business")+". ")}`,`Insaan se baat karni ho toh ${L(R.audit,"Free Growth Audit →")} ya ${WA("Hi Anmol, FODO Bot se baat ho rahi thi: "+(indName()||"mera business")+" ke baare mein. ")}`);
  }

  /* =========================== NEXT-QUESTION (lead qualification, one at a time) =========================== */
  const LOCAL_IND=/^(dental|medical|mentalwellness|restaurant|cafe|gym|salon|realestate|education|coaching|hotel|automotive|interiors|construction|legal|photography|wedding|local|jewellery|pharmacy|petcare|travel|finance)$/;
  function nextQuestion(force){
    const p=P();
    if(!p.industry){ M.lastAsked="industry"; return T("What kind of business is it?","Business kis cheez ka hai?","आपका बिज़नेस किस चीज़ का है?"); }
    if(!p.goal){ M.lastAsked="goal"; chips(["More leads","More bookings","More sales","Brand awareness"]); return T("What's the main goal right now, more leads, more bookings/sales, or more visibility?","Abhi main goal kya hai, zyada leads, bookings/sales, ya visibility?","अभी मुख्य लक्ष्य क्या है: ज़्यादा लीड्स, बुकिंग/सेल्स या पहचान?"); }
    if(!p.location&&LOCAL_IND.test(p.industry)){ M.lastAsked="location"; return T("Which city or area are you targeting?","Kaunse city/area ko target kar rahe ho?","किस शहर या इलाके को टारगेट कर रहे हैं?"); }
    if(p.budget==null){ M.lastAsked="budget"; return T("Roughly what monthly marketing budget are you working with? (A range is fine.)","Monthly marketing budget roughly kitna hai? (Range bhi chalega.)","महीने का मार्केटिंग बजट लगभग कितना है?"); }
    if(!p.channels.length&&force){ M.lastAsked="channels"; return T("What's bringing customers in right now, referrals, Instagram, Google, walk-ins?","Abhi customers kahan se aa rahe hain, referrals, Instagram, Google, walk-ins?"); }
    M.lastAsked=null; return "";
  }

  /* =========================== CHANNEL & BUDGET ENGINE =========================== */
  function channelFit(){
    const p=P(), pb=p.industry&&IND[p.industry];
    let primary=pb?pb.primary:null;
    if(!primary){ primary=p.model==="B2B"?"google":(p.goal==="awareness"||p.goal==="followers")?"meta":"google"; }
    return {primary,pb};
  }
  function channelRec(){
    const p=P(), {primary,pb}=channelFit(), biz=indName()||"your business", city=p.location?" in "+esc(p.location):"";
    if(!indName()){ const why0=T("Rule of thumb: urgent or local services people search for (clinics, repairs, lawyers) → Google first; visual, impulse or lifestyle products (food, fashion, beauty, cafés) → Instagram/Meta first; B2B → Google Search + LinkedIn.","Rule: jo services log search karte hain (clinic, repair, lawyer) → pehle Google; visual/lifestyle products (food, fashion, beauty, cafe) → pehle Instagram/Meta; B2B → Google + LinkedIn."); M.lastWhy=why0; M.lastAsked="industry"; return {lead:why0+" "+T("What do you sell? I'll pick one for you.","Aap kya bechte ho? Main ek choose kar dunga."),why:"",primary,second:"meta",asked:[]}; }
    const asked=p.channels.filter(c=>/meta|google|instagram|facebook|linkedin|youtube|seo/.test(c));
    let lead, why, second;
    if(primary==="google"){ lead=`For a ${esc(biz)}${city}, I'd start with <b>Google</b>: Google Business Profile + Search ads on high-intent searches, and use <b>Meta/Instagram</b> second for trust and retargeting.`; why="People usually search when they need this kind of service, so Google catches existing demand; Instagram builds familiarity so they pick you."; second="meta"; }
    else if(primary==="meta"){ lead=`For a ${esc(biz)}${city}, I'd lead with <b>Meta (Instagram/Facebook)</b>: Reels + a clear offer, and keep <b>Google</b> (Business Profile + a small Search campaign) for people already searching.`; why="This category is visual and impulse-driven: demand is created by seeing it. Google still captures the people who search by name or 'near me'."; second="google"; }
    else if(primary==="seo"){ lead=`For a ${esc(biz)}, the long-term engine is <b>SEO/content</b> (trust is built by useful answers), supported by <b>Google Search ads</b> for high-intent terms while SEO compounds.`; why="Buyers research privately and compare carefully; content earns trust, search ads capture urgency."; second="google"; }
    else { lead=`For ${esc(biz)}, start with <b>Google Search</b> + <b>LinkedIn</b>.`; why="Decision-makers search for specific solutions; LinkedIn reaches them by role."; second="linkedin"; }
    if(p.model==="B2B"&&primary!=="google"){ lead+=" Since you sell B2B, add LinkedIn for decision-makers."; }
    M.lastWhy=why;
    return {lead,why,primary,second,asked};
  }
  function budgetPlan(b){
    const p=P(), {primary}=channelFit(), pn={google:"Google (Search + Business Profile)",meta:"Meta (Instagram/Facebook)",seo:"SEO/content",linkedin:"LinkedIn"}[primary]||"your primary channel";
    const sn=primary==="google"?"Meta (retargeting + trust Reels)":primary==="meta"?"Google (Search/brand + 'near me')":"Google Search";
    const lines=[]; let tier;
    if(b<10000){ tier="organic-first";
      lines.push("Most of the effort goes into free foundations: Google Business Profile, reviews, 3 useful Reels a week, fast WhatsApp replies.");
      lines.push(b>=1500?`Optional: a small paid test of about ${inr(Math.max(50,Math.round(b*0.7/30)))}/day on ${pn} with ONE offer, mainly to learn, not to scale.`:"At this level, skip paid ads for now, put the money into good photos/videos and a review-collection routine.");
      lines.push("Spend nothing on fancy tools. A spreadsheet tracking leads → customers is enough.");
    } else if(b<50000){ tier="focused";
      const media=Math.round(b*0.8), creative=b-media;
      lines.push(`~${inr(Math.round(media*0.75))} (≈60%) → ${pn}, one campaign, one offer, one landing page/WhatsApp flow.`);
      lines.push(`~${inr(Math.round(media*0.25))} (≈20%) → ${sn}.`);
      lines.push(`~${inr(creative)} (≈20%) → creative (a few Reels/ad videos, good photos), creative usually decides results more than targeting.`);
    } else if(b<200000){ tier="structured";
      lines.push(`~50% → ${pn} (prospecting + high-intent).`);
      lines.push(`~20% → ${sn}.`);
      lines.push("~10% → retargeting (site visitors, video viewers, engagers).");
      lines.push("~10% → creative production/testing; ~10% → tracking, landing-page/CRO fixes.");
    } else if(b<1000000){ tier="multi-channel";
      lines.push(`~40% ${pn} · ~25% ${sn} · ~10% retargeting · ~10% creators/UGC · ~15% creative testing system + CRO + analytics.`);
      lines.push("Run structured creative tests weekly and a monthly budget re-allocation based on cost per qualified lead / CAC.");
    } else { tier="scale";
      lines.push("Multi-channel with clear roles (demand capture vs creation), an always-on creative testing system, proper attribution (platform + GA4 + CRM + 'how did you hear about us'), incrementality/holdout tests and a retention programme.");
    }
    const caveat=T("These splits are a starting structure, not a promise, nobody can honestly say what ₹X will produce before seeing your market. Results depend on CPC/CPM in your area, your offer, landing-page conversion, how fast leads are answered and close rate.","Ye splits ek starting structure hai, guarantee nahi, ₹X mein kitni leads aayengi ye koi honestly pehle nahi bata sakta. Depend karta hai CPC, offer, landing page, reply speed aur close rate pe.");
    return {tier,lines,caveat};
  }
  function economicsLine(){
    const p=P();
    return T("The economics to watch: CPC → landing conversion → CPL → qualified rate → close rate → CAC → revenue & margin.","Dekhne wali chain: CPC → landing conversion → CPL → qualified % → close rate → CAC → revenue & margin.");
  }

  /* =========================== SECTION BUILDERS (used alone or combined for multi-intent) =========================== */
  const SEC={};
  SEC.budget=()=>{
    const p=P(); const b=p.budget;
    if(b==null&&indName()) return {t:"Budget",h:T(`For a ${esc(indName())}, work backwards: what is a new customer worth to you (first purchase + repeat + referrals) × margin → what you can afford per customer → divide by your close rate to get affordable cost per lead → budget = leads you need × that CPL. Tell me average customer value and how many new customers you want per month, and I'll do the maths.`,`${esc(indName())} ke liye ulta calculate karo: naya customer kitne ka hai (pehli kharid + repeat + referral) × margin → ek customer pe kitna kharch afford → close rate se divide = affordable CPL → budget = chahiye leads × CPL. Customer value aur monthly target batao, main calculate kar dunga.`)};
    if(b==null) return {t:T("Budget","Budget"),h:T("Budget should follow economics, not a round number. Three inputs decide it: what a customer is worth to you (AOV × margin, plus repeat), what you can afford to pay to acquire one, and how much you need to spend to learn (enough for a meaningful number of conversions).","Budget economics se aata hai, round number se nahi: customer ki value (AOV × margin + repeat), ek customer laane ka affordable cost, aur seekhne ke liye kitna test chahiye.")+"<br><br>"+T("Strategic examples (not guarantees):","Strategic examples (guarantee nahi):")+"<br>"+ul(["<b>~₹5k/month</b>, organic + local + WhatsApp, maybe a tiny test","<b>~₹25k/month</b>, one focused paid channel + content + conversion basics","<b>~₹1 lakh/month</b>, structured paid acquisition, creative testing, CRO, analytics","<b>~₹10 lakh/month</b>, multi-channel, attribution, experimentation, retention"])};
    const bp=budgetPlan(b);
    return {t:T(`Your ${inr(b)}/month`,`Aapka ${inr(b)}/month`),h:ul(bp.lines)+"<br><small>"+bp.caveat+"</small>"};
  };
  SEC.channel=()=>{ const c=channelRec(); return {t:T("Which channel","Kaunsa channel"),h:c.lead+(c.why?" "+T("<i>Why:</i> ","<i>Kyun:</i> ")+c.why:"")}; };
  SEC.content=(a)=>{ const c=contentEngine(a||{text:"content ideas"},true); return {t:T("What to post","Kya post karein"),h:c}; };
  SEC.seo=()=>{ const p=P(), pb=p.industry&&IND[p.industry]; return {t:"SEO",h:ul([pb&&pb.seo?esc(pb.seo):"One page per service/intent, answering real questions better than competitors.","Technical basics: fast mobile pages, indexed, clean titles, sitemap.","Authority: reviews, local citations, genuine mentions/links.",T("Expect months, not weeks, track enquiries from organic, not just rankings.","Mahino ka khel hai, rankings se zyada organic enquiries track karo.")])}; };
  SEC.localseo=()=>({t:"Local SEO",h:ul(["Complete Google Business Profile: right primary category, services, hours, photos weekly, booking/WhatsApp link.","Ask every happy customer for a review with a direct link; reply to all reviews.","Locality pages on your site"+(P().location?" (e.g. "+esc(P().location)+" areas you serve)":"")+"; consistent name/address/phone everywhere."])});
  SEC.website=()=>({t:T("Website / landing page","Website / landing page"),h:ul(["Headline that says who it's for and the outcome (not 'Welcome').","One clear CTA above the fold + WhatsApp/call on mobile.","Proof next to the CTA: reviews, credentials, real photos.","Short form (3–4 fields), fast mobile load, prices or 'starting from' if possible.","Track form submits, calls and WhatsApp clicks as conversions."])});
  SEC.followup=()=>({t:T("Follow-up","Follow-up"),h:ul([T("Reply to every lead within 15 minutes (auto WhatsApp in 1 minute).","Har lead ko 15 minute mein reply (1 minute mein auto WhatsApp)."),"Follow up on day 1, 3 and 7 before marking lost; record a 'lost reason'.","Use a simple CRM or even a shared sheet: new → contacted → booked → won/lost."])});
  SEC.troubleshoot=(a)=>({t:T("Diagnosis","Diagnosis"),h:troubleshoot(a,true)});
  SEC.offer=()=>{ const pb=IND[P().industry]; return {t:"Offer",h:ul((pb?pb.offers:["A low-risk first step (consultation, trial, sample)","A bundle that raises value without cutting price","A genuine guarantee or easy exchange/refund policy"]).map(esc))}; };
  SEC.aeo=()=>({t:"AI search",h:topicAnswer(findTopic("aeo"),"normal",true)});
  SEC.competitor=()=>({t:T("Competitors","Competitors"),h:competitorAnswer(true)});
  SEC.retention=()=>{ const pb=IND[P().industry]; return {t:"Retention",h:esc(pb?pb.retention:"Post-purchase follow-up, reminders at the natural re-purchase time, loyalty perks and a referral ask at the moment of delight.")}; };
  SEC.crm=SEC.followup;
  SEC.experiment=(a)=>({t:T("Experiments","Experiments"),h:experiments(a,true)});

  /* =========================== CONTENT ENGINE =========================== */
  function contentEngine(a,compact){
    const p=P(), pb=p.industry&&IND[p.industry], biz=indName()||"business", city=p.location||"your city", n=a.text;
    const want=(n.match(/\b(\d{1,2})\b/)||[])[1]; const count=Math.min(Math.max(+want||0,3),15)||(compact?3:5);
    const plat=/\blinkedin\b/.test(n)?"LinkedIn":/\byoutube|shorts\b/.test(n)?"YouTube":/\bfacebook\b/.test(n)?"Facebook":"Instagram";
    const aud=p.audience||(pb?pb.customer.split(/[;.]/)[0].toLowerCase():"your ideal customers");
    const genericHooks=[`If you're in ${city} and still choosing a ${biz}, watch this first.`,`3 mistakes people make before choosing a ${biz}.`,`What nobody tells you about ${biz.replace(/^(a|an) /,"")} prices.`,`We get asked this every single day, here's the honest answer.`,`Before you spend money on this, check these 3 things.`,`POV: you finally found a ${biz} that actually explains things.`,`Stop doing this if you want better results.`,`The 30-second version of what we do (and who it's NOT for).`,`Here's exactly what happens when you walk in.`,`The cheapest option is costing you more. Here's why.`,`One thing we changed that our customers noticed immediately.`,`Is this worth it? Let's break it down honestly.`,`What ${inr(1000)} actually gets you here.`,`Myth vs fact: the thing everyone in ${city} gets wrong.`,`Save this for later, you'll need it.`];
    const hooks=(pb?pb.hooks:[]).map(h=>h.replace(/\[area\]/g,city)).concat(genericHooks).filter((x,i,arr)=>arr.indexOf(x)===i);
    const occ0=(n.match(/\b(diwali|holi|navratri|dussehra|eid|christmas|new year|valentine'?s?|raksha bandhan|rakhi|independence day|republic day|karwa chauth|dhanteras|wedding season|black friday|end of season|monsoon|summer|winter|sale|launch|anniversary)\b/)||[])[1]||"";
    const occ=occ0||p.occasion||"";
    const kind=/\b(write (me )?(a |an )?([a-z]+ ){0,2}ads?|ads? copy|facebook ad|instagram ad|google ad|meta ad)\b/.test(n)&&!/\bangles?\b/.test(n)?"adcopy":/\bhooks?\b/.test(n)?"hooks":/\bcaptions?\b/.test(n)?"captions":/\b(calendar|schedule|30 day|30-day|month(ly)? plan|content plan)\b/.test(n)?"calendar":/\b(script|scripts)\b/.test(n)?"script":/\bcarousels?\b/.test(n)?"carousel":/\b(ads? angles?|ads? copy|ads? ideas|ads? creatives?|creative ideas)\b/.test(n)?"angles":/\bctas?\b|call to action/.test(n)?"ctas":/\bpillars?\b/.test(n)?"pillars":/\b(ugc brief|creator brief|influencer brief|brief)\b/.test(n)?"brief":/\blinkedin\b/.test(n)&&/\bposts?\b/.test(n)?"linkedin":"ideas";
    M.lastTopic="content:"+kind;
    const header=pb?T(`For a ${esc(biz)}${p.location?" in "+esc(p.location):""} on ${plat}:`,`${esc(biz)}${p.location?" ("+esc(p.location)+")":""} ke liye ${plat} pe:`):T(`Here's a starting set for ${plat}, tell me your business and I'll tailor it.`,`${plat} ke liye starting set, business batao toh aur specific kar dunga.`);
    if(kind==="adcopy"){
      const pbn=pb?pb:null, ang=pbn?pbn.adAngles:["Problem → solution","Social proof","Offer"], off=pbn?pbn.offers[0]:"a clear first step", h=hooks.slice(0,3);
      const g=/\bgoogle\b/.test(n);
      if(g) return join(header.replace(plat,"Google Search"),H("Responsive search ad, headlines (≤30 chars each)")+"<br>"+ul([`${esc(biz.replace(/\b\w/g,m=>m.toUpperCase())).slice(0,22)} in ${esc(city)}`,esc(ang[0]).slice(0,30),esc(off).slice(0,30),"Book on WhatsApp Today","Real Reviews · Clear Prices"]),H("Descriptions (≤90 chars)")+"<br>"+ul([`${esc(ang[1]||ang[0])}. ${esc(off)}. Book in 60 seconds.`.slice(0,90),`Trusted by local customers in ${esc(city)}. Transparent pricing, no surprises. Call now.`.slice(0,90)]),T("Add negative keywords and send clicks to a matching landing page, not the homepage.","Negative keywords add karo aur clicks matching landing page pe bhejo, homepage pe nahi."));
      M.offer="content";
      return join(header.replace(plat,"Meta (Facebook/Instagram)"),[0,1].map(i=>`<b>${T("Variant","Variant")} ${i+1}: ${esc(ang[i]||ang[0])}</b><br>`+ul([`<b>Primary text:</b> ${esc(h[i]||h[0])} ${esc(i===0?"Here's what makes the difference: a clear plan, real support and no surprises.":"Real people, real results, see why customers in "+city+" choose us.")} ${occ?esc(occ.replace(/\b\w/g,m=>m.toUpperCase()))+" offer: ":""}${esc(off)}.`,`<b>Headline:</b> ${esc(off.replace(/\b\w/,m=>m.toUpperCase()))}${p.location?" in "+esc(p.location):""}`,`<b>CTA button:</b> ${LOCAL_IND.test(p.industry||"")?"Send WhatsApp message / Book now":"Shop now / Learn more"}`])).join("<br><br>"),T("Only claim what you can prove (no 'best', no guaranteed results). Test both variants with the same budget for a week and keep the one with the lower cost per qualified lead.","Sirf wahi claim karo jo prove ho sake. Dono variants same budget pe ek hafta chalao, jiska cost per qualified lead kam ho, wahi rakho."));
    }
    if(kind==="hooks"){ return join(header,ol(hooks.slice(0,count).map(esc)),T("Test 3–5 hooks on the same topic and compare 3-second hold, average watch time, shares and profile visits.","Same topic pe 3–5 hooks test karo, 3-sec hold, watch time, shares aur profile visits compare karo.")); }
    if(kind==="captions"){ const cta=pb&&LOCAL_IND.test(p.industry)?"Book on WhatsApp — link in bio.":"Tap the link in bio to see more."; const O=occ?occ.replace(/\b\w/g,m=>m.toUpperCase()):""; return join(header,ol(occ?[`✨ ${O} is here — and so is [your offer]. [One line on why it's special this year]. Limited till [date]. ${cta}`,`This ${O}, give [them] something they'll actually use. 🎁 [Product/service] — [key benefit]. Order/book by [date] → ${cta}`,`Our ${O} wish for you: [warm one-liner]. 🪔 From all of us at [brand] — [offer or 'see you soon']. ${cta}`]:[`${esc(hooks[0])} Here's what we tell every customer: start with the problem, not the product. ${cta}`,`Real talk: most people overpay because they compare the wrong thing. Ask about [the one thing that matters]. ${cta}`,`Behind the scenes of a normal day at our ${esc(biz)} — the details you don't see. Questions? Drop them below 👇`]),T("Swap the bracketed bits with your specifics — real details beat polished words.","Brackets mein apni real details daalo.")); }
    if(kind==="script"){ return join(H(T("Reel script (30–40 sec)","Reel script (30–40 sec)"))+"<br>"+header,ul([`<b>0–2s hook:</b> "${esc(hooks[0])}"`,`<b>2–10s problem:</b> name the frustration ${esc(aud)} feel, in their words.`,`<b>10–25s value:</b> 2–3 quick, specific points (show, don't tell, hands, product, process).`,`<b>25–32s proof:</b> a result, review screenshot or behind-the-scenes moment (with permission).`,`<b>32–40s CTA:</b> one action: "DM 'GUIDE'", "Book on WhatsApp", "Save this".`]),T("Shoot vertical, natural light, captions on screen (most people watch muted).","Vertical shoot karo, on-screen captions zaroor (log mute pe dekhte hain).")); }
    if(kind==="carousel"){ return join(H("Carousel (7 slides)")+"<br>"+header,ol([`Cover: a bold promise or question: "${esc(hooks[1]||hooks[0])}"`,"The problem, in the customer's words","Mistake #1 + why it happens","Mistake #2","Mistake #3","What to do instead (simple checklist)","CTA: save + 'DM us X' / book link"]),T("Carousels earn saves, great for trust; Reels earn reach.","Carousels se saves milte hain (trust), Reels se reach.")); }
    if(kind==="calendar"){
      const pil=pb?pb.content:["Tip/education","Behind the scenes","Customer story/proof","FAQ/myth-buster","Offer"];
      const weeks=[1,2,3,4].map(w=>`<b>Week ${w}:</b> `+[`Reel: ${esc(pil[(w-1)%pil.length])}`,`Carousel: ${esc(pil[(w)%pil.length])}`,`Reel: ${esc(pil[(w+1)%pil.length])}`,w%2?"Story poll/Q&A + offer reminder":"Story, behind the scenes + review share"].join(" · "));
      return join(H(T("30-day content calendar","30-day content calendar"))+"<br>"+header,weeks.join("<br>"),T("Rhythm: 3 posts a week + Stories most days. Batch-shoot once a week. Review on day 30: keep the formats that drove DMs/enquiries, drop the rest.","Rhythm: hafte mein 3 posts + roz stories. Hafte mein ek din batch-shoot. 30th day pe review, jo DMs/enquiries laaye wahi rakho.")); }
    if(kind==="angles"){ const ang=pb?pb.adAngles:["Problem → solution","Social proof","Offer/risk reversal","Speed/convenience","Comparison with the alternative"]; return join(header,ol(ang.slice(0,Math.max(3,Math.min(count,6))).map((x,i)=>`<b>${esc(x)}</b>, e.g. "${esc(hooks[i]||hooks[0])}"`)),T("Run 3–4 angles with the same offer and budget; keep the one with the lowest cost per qualified lead, then iterate on it.","Same offer pe 3–4 angles chalao; jiska cost per qualified lead sabse kam ho, usi ko aage badhao.")); }
    if(kind==="ctas"){ return join(header,ul(["Book your slot on WhatsApp →","Get the price list in 1 minute →","Check availability for this week →","Claim your free consultation →","DM 'START' and we'll guide you","Save this for your next visit"]),T("One CTA per piece of content. Match it to intent: soft CTAs for cold audiences, direct booking CTAs for warm ones.","Ek content = ek CTA. Cold audience ko soft CTA, warm audience ko direct booking.")); }
    if(kind==="pillars"){ const pil=pb?pb.content:["Education (tips, how-tos)","Proof (reviews, results, process)","Story (founder, team, why)","Objection-handling (price, trust, myths)","Offer (clear next step)"]; return join(header,ul(pil.map(esc)),T("Mix roughly: 40% education · 25% proof · 20% story/behind-the-scenes · 15% offer.","Mix: 40% education · 25% proof · 20% story · 15% offer.")); }
    if(kind==="brief"){ return join(H(T("Creator / UGC brief","Creator / UGC brief")),ul([`<b>Audience:</b> ${esc(aud)}`,`<b>Key message:</b> one benefit, in plain words`,"<b>Must show:</b> product/service in real use; must avoid: exaggerated claims","<b>Format:</b> 20–40s vertical, hook in first 2 seconds, captions on","<b>CTA:</b> code/link for tracking","<b>Rights:</b> permission to reuse as ads for X months; disclosure (#ad / #collab, as per ASCI)","<b>Deadline & fee</b> agreed in writing"])); }
    if(kind==="linkedin"){ return join(header,ol(["Lesson post: 'The mistake we made with X, and what we do now' (3 short paragraphs + takeaway).","Opinion post: one contrarian but defensible point about your industry.","Behind-the-scenes: how a project/order actually gets delivered.","Client-problem post (anonymised): situation → what we changed → result."]),T("Founder voice beats company voice on LinkedIn. Post 2–3 times a week; reply to every comment in the first hour.","LinkedIn pe founder voice zyada chalti hai. Hafte mein 2–3 posts, pehle ghante mein comments ka reply.")); }
    // ideas
    const ideas=(pb?pb.content:["Answer the top question customers ask","Show the process behind your product/service","Customer story (with permission)","Myth vs fact in your industry","A clear offer post"]).slice(0,compact?3:(+want?Math.min(+want,5):5));
    return compact?ul(ideas.map(esc))+"<br>"+T("Hooks to try: ","Try karne wale hooks: ")+hooks.slice(0,2).map(h=>"“"+esc(h)+"”").join(" · "):join(header,ol(ideas.map(esc)),H(T("Hooks to try","Hooks"))+"<br>"+ul(hooks.slice(0,3).map(esc)),T("Want a full 30-day calendar, reel scripts or ad angles for this?","30-day calendar, reel scripts ya ad angles chahiye?"));
  }

  /* =========================== TROUBLESHOOT / FUNNEL REASONING =========================== */
  function troubleshoot(a,compact){
    const n=a.text, p=P();
    const ch=/instagram|insta/.test(n)?"Instagram":/meta|facebook/.test(n)?"Meta ads":/google/.test(n)?"Google Ads":/seo|ranking|organic/.test(n)?"SEO":/website|site|landing/.test(n)?"your website":null;
    let kind="generic";
    if(/clicks?.{0,30}(no|not|zero|but)|traffic.{0,30}(no|not|zero|but)|visitors.{0,20}(no|not|but)/.test(n))kind="clicks_no_leads";
    if(/leads?.{0,30}(no|not|zero|but).{0,15}(sales?|customers?|buy|convert|closing)|enquir\w*.{0,30}(no|not|but).{0,15}(sales?|buy)|no sales|sale nahi|not buying|not converting|but no sales|running .* but no sales|ads running.*no sales/.test(n))kind=/clicks?|traffic/.test(n)?"clicks_no_leads":"leads_no_sales";
    if(/no leads|not coming|leads? (are )?not|zero leads|few leads|no enquir|no calls|no bookings|no orders/.test(n)&&kind==="generic")kind="no_leads";
    if(/high (cpc|cpl|cpm|cac|cost)|expensive (leads|clicks)|(cpc|cpl|cac|cpm|cost) (is )?(too |very |so |bahut )?high|cost per lead (is )?high/.test(n))kind="high_cost";
    if(/(cpl|cpc|cpm|cac|cpa|cost per lead|cost) (was|went from|used to be|increased from|jumped from)/.test(n))kind="cost_rising";
    if(/(price|rates?|cost) and (then )?(disappear|ghost|vanish|leave|go|don'?t reply)|ghost(ing|ed|s)?\b|(don'?t|do not|never) (reply|respond)|stop(ped)? (replying|responding)|no response/.test(n))kind="ghosting";
    if(/low ctr|ctr (is )?low/.test(n))kind="low_ctr";
    if(/(junk|bad|fake|poor|low quality|useless) leads|leads (are )?(junk|bad|fake|useless)/.test(n))kind="bad_leads";
    if(/(seo|ranking|organic).{0,30}(not|no|stuck|dropped|down)|not ranking/.test(n))kind="seo_stuck";
    if(/(instagram|reels|followers|engagement|reach|page).{0,30}(not|no|low|dropped|down|stuck)|isn'?t working|not working/.test(n)&&/instagram|reels|followers|engagement|reach|page|social/.test(n))kind="social_stuck";
    if(/(website|site|landing).{0,30}(bad|not|no|slow|bekar|problem|issue)|bekar/.test(n)&&/website|site|landing/.test(n))kind="website";
    if(/repeat|come back|retention|churn/.test(n))kind="retention";
    const ctx=indName()?` (${esc(indName())}${p.location?", "+esc(p.location):""}${p.budget?", "+inr(p.budget)+"/month":""})`:"";
    const D2={
      clicks_no_leads:{lead:T("Clicks but no leads usually means the leak is <b>after the click</b>, the page, offer or trust, not the ad.","Clicks aa rahe hain par leads nahi, matlab leak <b>click ke baad</b> hai: page, offer ya trust. Ad ki galti kam hai."),checks:["Message match: does the page repeat exactly what the ad promised?","Is the offer clear and low-risk (consultation, price range, trial)?","Proof near the CTA, reviews, credentials, real photos?","Mobile: loads in ~3s? Form short (3–4 fields)? WhatsApp/call button?","Tracking: are form submits/calls actually being recorded?","Traffic quality: check search terms (Google) or placements (Meta) for junk."],next:"Fix the page and offer before adding budget."},
      leads_no_sales:{lead:T("Leads but no sales points <b>downstream</b>, qualification, speed of follow-up, or the sales conversation. More ad spend would just buy more of the same leads.","Bhai, leads aa rahi hain par sale nahi, toh ads ko aur paisa dene se pehle <b>funnel ka neeche wala hissa</b> dekho: qualification, follow-up speed, sales baat-cheet."),checks:["How fast is the first reply? (Within 15 minutes changes everything.)","How many follow-ups before giving up? (Most stop after 1.)","Are leads the right people? Add 1–2 qualifying questions to forms.","What do lost leads say? Price, trust, timing? Record a reason for each.","Is the offer/price explained the same way the ad sets it up?"],next:"Measure lead → contacted → appointment → sale for 2 weeks; the biggest drop is your first fix."},
      no_leads:{lead:T("Few or no leads, let's find which layer is failing: visibility, interest or conversion.","Leads nahi aa rahi, pehle pata karte hain kaunsi layer fail ho rahi hai: visibility, interest ya conversion."),checks:["Visibility: are enough of the right people seeing you? (impressions/reach, search presence, Google Business Profile)","Interest: are they clicking/engaging? (CTR, profile visits)","Conversion: are visitors enquiring? (form/WhatsApp clicks ÷ visitors)","Offer: is there a clear reason to contact you now?","Tracking: are leads being counted correctly?"],next:"Share impressions, clicks and leads (even rough) and I'll pinpoint the layer."},
      high_cost:{lead:T("High CPC/CPL is a symptom. Before cutting budget, find the cause.","High CPC/CPL ek symptom hai, budget cut karne se pehle cause dhundo."),checks:["Creative fatigue (frequency up, CTR down) → refresh hooks/angles.","Audience too narrow or overlapping ad sets → consolidate.","Weak landing-page conversion inflates CPL even with cheap clicks.","Broad keywords without negatives (Google) → clean search terms.","Seasonality, festive periods push CPMs up."],next:"Judge on cost per qualified lead / CAC, not CPC alone."},
      cost_rising:{lead:(()=>{ const m2=n.match(/(\d[\d,]*)\D{1,40}?(\d[\d,]*)/); const a1=m2?+m2[1].replace(/,/g,""):0,a2=m2?+m2[2].replace(/,/g,""):0; return (a1&&a2&&a2>a1?T(`That's a <b>${fmt((a2-a1)/a1*100,0)}% jump</b>. `,`Ye <b>${fmt((a2-a1)/a1*100,0)}% ka jump</b> hai. `):"")+T("A sudden cost jump usually has a specific cause, let's find it before cutting budget.","Achanak cost badhne ki koi specific wajah hoti hai, budget kaatne se pehle wo dhundte hain."); })(),checks:["Creative fatigue: frequency up and CTR down on the same ads? → new hooks/angles.","Recent edits: did budget/targeting/creative changes reset the learning phase?","Tracking: is the pixel/conversion event still firing? (A broken event looks like rising CPL.)","Landing page/form: any change, slower load or broken form?","Audience saturation: same small audience for weeks?","Seasonality/auction: festive periods and competitors raise CPMs.","Offer fatigue: same offer for months?"],next:"Compare last month vs this month on CPM, CTR, landing conversion and frequency, the metric that moved most points to the cause."},
      ghosting:{lead:T("Leads asking price and disappearing usually means price arrived before value, or they weren't a fit to begin with.","Price poochke gayab hone ka matlab aksar ye hai ki value se pehle price aa gaya, ya lead fit hi nahi tha."),checks:["Before quoting, ask 2 questions (date/need, budget range) and share one relevant example of your work.","Show a price range or 'packages from ₹X' in ads/profile so non-fits filter themselves out.","Quote with 2–3 packages (good/better/best) instead of one number.","Follow up on day 1, 3 and 7 with something useful (a sample, a slot availability, a review), not just 'any update?'.","Track reasons when they say no, price, date, style, trust."],next:"Change the first reply script this week and compare reply → booking rate for 2 weeks."},
      low_ctr:{lead:T("Low CTR is mostly a creative/relevance problem.","Low CTR = zyada tar creative ya relevance ki problem."),checks:["First 2 seconds/first line: does it name a specific problem or desire?","Is the visual native (not a stock-photo banner)?","Does the ad speak to one audience, not everyone?","Is the offer visible in the ad?"],next:"Test 3–4 new hooks/angles with the same offer."},
      bad_leads:{lead:T("Junk leads usually come from low-friction forms and broad targeting, the platform optimises for whoever fills forms most cheaply.","Junk leads aksar easy forms aur broad targeting se aati hain, platform sabse saste form-fillers dhundta hai."),checks:["Use 'higher intent' form type or add a qualifying question (budget, timeline, area).","Send to a landing page or WhatsApp instead of instant forms.","Mention price range/eligibility in the ad to filter.","Feed back qualified/closed leads to the platform (offline conversions)."],next:"Accept a slightly higher CPL for much better quality, track cost per qualified lead."},
      seo_stuck:{lead:T("SEO stuck? Check intent, quality and technical health before writing more.","SEO atka hai? Zyada content likhne se pehle intent, quality aur technical health check karo."),checks:["Search Console: are pages indexed? Any coverage errors?","Does each page match what currently ranks for that query (intent)?","Is content genuinely better/more specific than the top 3 results?","Internal links from strong pages; no duplicate/cannibalising pages.","Local: GBP completeness and reviews."],next:"Pick your 5 money pages and improve them first."},
      social_stuck:{lead:T("If Instagram isn't working, separate 'not reaching' from 'reaching but not converting'.","Instagram kaam nahi kar raha? Pehle alag karo, reach nahi mil rahi, ya reach hai par enquiries nahi."),checks:["Reach low → hooks (first 2 seconds), Reels vs static, posting consistency.","Reach OK but no DMs → clear CTA, offer in content, link/WhatsApp in bio, quick DM replies.","Content about you vs about the customer's problem?","Are you measuring saves, shares, profile visits and DMs, not just likes?"],next:"Run 2 weeks of 3 Reels/week with problem-first hooks and one clear CTA, then compare DMs."},
      website:{lead:T("Let's find out why the website isn't converting.","Chalo dekhte hain website convert kyun nahi kar rahi."),checks:["5-second test: can a stranger tell what you do, for whom, and what to do next?","One clear CTA above the fold (+ WhatsApp/call on mobile).","Proof: reviews, real photos, credentials near the CTA.","Speed on mobile and form length.","Tracking of enquiries."],next:"Paste your homepage headline, CTA and sections here and I'll give a P0/P1/P2 review."},
      retention:{lead:T("Customers not coming back is usually an experience + reminder problem.","Customers wapas nahi aate, aksar experience aur reminder ki problem hoti hai."),checks:["Is the first experience clearly great? Ask for feedback within 48 hours.","Do you remind them at the natural re-purchase time?","Any reason to return, loyalty, new arrivals, membership?","Do you have their WhatsApp/email with consent?"],next:"Set up one post-purchase message and one re-purchase reminder this week."},
      generic:{lead:T("Let's diagnose before changing anything.","Kuch badalne se pehle diagnose karte hain."),checks:["Traffic → landing page → lead → qualified → appointment → sale → repeat → referral: where is the biggest drop?","What changed recently (offer, creative, budget, season, website)?","Is tracking reliable?"],next:"Share the numbers you have and I'll find the leak."}
    };
    const d=D2[kind];
    M.lastTopic="troubleshoot:"+kind; M.lastWhy=(kind==="cost_rising"?"the usual causes are creative fatigue, a learning-phase reset after edits, broken tracking, a landing-page change, audience saturation or seasonal auction pressure, compare CPM, CTR, landing conversion and frequency month-over-month to see which moved":d.lead.replace(/<[^>]+>/g,""));
    const funnelLine=LANG==="en"?"":"";
    if(compact) return d.lead+"<br>"+ul(d.checks.slice(0,4));
    return join((ch?`<b>${ch}</b>${ctx}: `:ctx?`<b>${T("For you","Aapke case mein")}</b>${ctx}: `:"")+d.lead,ul(d.checks),"<b>"+T("Next step","Next step")+":</b> "+d.next);
  }

  function funnelAnswer(f,p){
    const parts=[];
    if(f.rows.length)parts.push(H(T("Your numbers","Aapke numbers"))+"<br>"+ul(f.rows.map(r=>`${r[0]}: <b>${r[1]}</b>`)));
    if(f.rates.length)parts.push(H(T("Stage conversion","Stage conversion"))+"<br>"+ul(f.rates.map(r=>`${r.from} → ${r.to}: <b>${fmt(r.rate,1)}%</b>`)));
    if(f.worst){
      const w=f.worst; let why;
      if(/impressions>clicks/.test(w.key))why=T("The weakest step is getting the click, that's a creative/relevance problem.","Sabse kamzor step click hai, creative/relevance ki problem.");
      else if(/clicks>|visitors>leads/.test(w.key))why=T("The leak is after the click: landing page, offer, trust or form friction. More traffic won't fix this.","Leak click ke baad hai: landing page, offer, trust ya form. Zyada traffic se ye theek nahi hoga.");
      else if(/leads>appointments|qualified>appointments|leads>qualified/.test(w.key))why=T("The biggest issue may not be lead generation. Leads aren't turning into appointments, usually slow first response, weak follow-up or poorly qualified leads. Increasing ad spend now would mostly buy more leads that don't book.","Asli problem lead generation nahi lagti. Leads appointment nahi ban rahi, aksar slow reply, weak follow-up ya galat leads. Abhi ad spend badhaoge toh bas aur aisi hi leads aayengi.");
      else if(/leads>customers/.test(w.key))why=T("Leads are coming in, but few become paying customers. Look at lead quality/qualification, how fast and how often you follow up, onboarding or activation (for trials), and whether the offer and price are clear before people commit.","Leads aa rahi hain par bahut kam paying customer ban rahe hain. Lead quality, follow-up ki speed aur frequency, onboarding/activation (trials ke liye), aur offer/price clarity dekho.");
      else if(/appointments>customers|qualified>customers/.test(w.key))why=T("Leads and appointments are happening, but closing is weak, look at the sales conversation, offer/price clarity, trust and follow-up after the meeting.","Leads aur appointments ho rahe hain par closing kamzor hai, sales baat-cheet, offer/price clarity, trust aur meeting ke baad follow-up dekho.");
      parts.push(H(T("Where it's leaking","Leak kahan hai"))+"<br>"+`${w.from} → ${w.to} (${fmt(w.rate,1)}%) ${T("looks like the weakest step.","sabse kamzor step lagta hai.")} ${why}`);
      parts.push("<small>"+T("Reference bands are rough rules of thumb to locate the leak, your own trend over time is the real benchmark.","Ye reference bands sirf leak dhundhne ke liye rough guide hain, asli benchmark aapka apna trend hai.")+"</small>");
      M.lastWhy=why.replace(/<[^>]+>/g,"");
    }
    if(p&&p.revenue!=null&&(p.spend||p.budget)){ const sp=p.spend||p.budget, roas=p.revenue/sp; if(p.margin){ const be=100/p.margin; parts.push(roas>=be?T(`At ${p.margin}% margin your break-even ROAS is ${fmt(be,2)}x, you're above it (${fmt(roas,2)}x), so first orders are covering ad cost.`,`${p.margin}% margin pe break-even ${fmt(be,2)}x hai, aap upar ho (${fmt(roas,2)}x).`):T(`At ${p.margin}% margin your break-even ROAS is ${fmt(be,2)}x, at ${fmt(roas,2)}x you're losing money on first orders unless repeat purchases make it up.`,`${p.margin}% margin pe break-even ${fmt(be,2)}x hai: ${fmt(roas,2)}x pe first order pe loss hai, jab tak repeat purchase na ho.`)); } else parts.push(T(`Is ${fmt(roas,2)}x ROAS profitable? It depends on your margin, break-even ROAS = 1 ÷ margin. Tell me your margin % and I'll check.`,`${fmt(roas,2)}x ROAS profitable hai ya nahi, margin pe depend karta hai (break-even = 1 ÷ margin). Margin % batao.`)); }
    M.lastTopic="funnel";
    return join(...parts);
  }

  /* =========================== EXPERIMENTS =========================== */
  function experiments(a,compact){
    const p=P(), n=a?a.text:"", biz=indName()||"your business";
    const list=[];
    const add=(h,c,aud,m,s,dur,next)=>list.push({h,c,aud,m,s,dur,next});
    const pain=(p.pains||[]).join(" ")+" "+n+" "+(M.lastTopic||"");
    if(/convert|clicks|website|landing|page/.test(pain)) add("A clearer offer + proof above the fold will raise enquiry rate.","New hero: specific outcome headline + 'starting from' price + 3 reviews next to the CTA.","All paid traffic to the page, split 50/50.","Visitor → enquiry rate","+20% relative lift with similar lead quality","2–3 weeks or ~100 enquiries total","Keep winner; next test form length.");
    if(/leads? .*no sales|not converting|follow|qualif|leads_no_sales|bad_leads/.test(pain)) add("Replying within 5 minutes will raise appointment rate.","Instant WhatsApp auto-reply + call within 5 minutes for half of new leads (alternate days).","New inbound leads","Lead → appointment rate","Clearly higher on fast-reply days","2 weeks","Make fast response the default; add day-1/3/7 follow-ups.");
    add("Problem-first hooks will beat product-first hooks.",`5 Reels on the same topic for ${esc(biz)}, only the first 2 seconds differ.`,"Organic followers + small boost to similar audience","3-second hold, average watch %, shares, profile visits","One hook style wins on hold + profile visits","2 weeks","Make 5 more in the winning style; turn the best into an ad.");
    add("A low-risk first step (consultation/trial) will lower cost per qualified lead.","Ad set A: main offer · Ad set B: low-risk first step; same creative style and budget.","Cold audience in your area","Cost per qualified lead","B ≥ 20% cheaper per qualified lead","~2 weeks or 30+ leads per variant","Scale the winner; test a new angle against it.");
    const pick=list.slice(0,compact?2:3);
    M.lastTopic="experiment";
    return pick.map((x,i)=>`<b>${T("Experiment","Experiment")} ${i+1}</b><br>`+ul([`<b>Hypothesis:</b> ${x.h}`,`<b>Change:</b> ${x.c}`,`<b>Audience:</b> ${x.aud}`,`<b>Metric:</b> ${x.m}`,`<b>Success criterion:</b> ${x.s}`,`<b>Duration:</b> ${x.dur}`,`<b>Next action:</b> ${x.next}`])).join("<br><br>")+(compact?"":"<br><br><small>"+T("Write the decision rule before starting so results can't be cherry-picked. No experiment is guaranteed to win, a clear loss is also a useful answer.","Decision rule pehle likho. Koi experiment jeetne ki guarantee nahi, clear loss bhi kaam ki seekh hai.")+"</small>");
  }

  /* =========================== PLANS =========================== */
  function plan306090(){
    const p=P(), c=channelRec(), biz=indName()||"your business", pb=p.industry&&IND[p.industry];
    M.lastTopic="plan";
    const head=indName()?T(`90-day plan for a ${esc(biz)}${p.location?" in "+esc(p.location):""}${p.budget?" at "+inr(p.budget)+"/month":""}${p.goal?", goal: "+GOALTXT[p.goal]:""}`,`${esc(biz)} ke liye 90-day plan${p.location?" ("+esc(p.location)+")":""}${p.budget?": "+inr(p.budget)+"/month":""}`):T("A practical 90-day plan (tell me your business and I'll tailor it)","Practical 90-day plan (business batao toh tailor kar dunga)");
    const d30=["Set up tracking: calls, WhatsApp clicks, form submits; a simple leads sheet/CRM.",pb&&LOCAL_IND.test(p.industry)?"Fix Google Business Profile + start collecting reviews.":"Fix the main landing page: clear headline, offer, proof, CTA.","Define one offer and one audience; write 10 hooks.",`Launch one focused campaign on ${c.primary==="google"?"Google Search":c.primary==="meta"?"Meta/Instagram":"your primary channel"}.`,"Lead response under 15 minutes; follow-ups on day 1/3/7."];
    const d60=["Read the numbers weekly: CPL → qualified → appointment → customer.","Fix the leakiest step first (page, follow-up or offer).",`Add ${c.second==="meta"?"Instagram retargeting + 3 Reels/week":c.second==="google"?"Google Search for high-intent/brand terms":"a second channel"} once the first is stable.`,"Test 3–4 creative angles; kill losers, iterate winners."];
    const d90=["Shift budget toward the lowest cost per customer (not per click).","Systemise content: monthly calendar, batch shoots.","Start retention: reminders, review requests, referral ask.","Decide on scale: more budget, new channel, or new offer, based on CAC vs value."];
    return join(H(head),"<b>Days 1–30: "+T("Foundation & first test","Foundation & pehla test")+"</b><br>"+ul(d30),"<b>Days 31–60: "+T("Fix the leak, add a second lever","Leak fix karo, doosra lever jodo")+"</b><br>"+ul(d60),"<b>Days 61–90: "+T("Double down & build retention","Jo chal raha hai usko badhao + retention")+"</b><br>"+ul(d90));
  }
  function personalPlan(a){
    const p=P(), parts=[];
    const c=channelRec();
    const head=T(`Here's what I'd do for your ${esc(indName()||"business")}${p.location?" in "+esc(p.location):""}${p.goal?" (goal: "+GOALTXT[p.goal]+")":""}${p.budget?" with "+inr(p.budget)+"/month":""}:`,`Aapke ${esc(indName()||"business")}${p.location?" ("+esc(p.location)+")":""}${p.goal?", goal: "+GOALTXT[p.goal]:""}${p.budget?": "+inr(p.budget)+"/month":""} ke liye mera plan:`);
    parts.push(head);
    parts.push("<b>1. "+T("Channel","Channel")+"</b><br>"+c.lead);
    if(p.budget!=null){ const bp=budgetPlan(p.budget); parts.push("<b>2. "+T("Budget split","Budget split")+"</b><br>"+ul(bp.lines)); }
    const pb=p.industry&&IND[p.industry];
    if(pb) parts.push("<b>"+(p.budget!=null?3:2)+". "+T("Offer & content","Offer & content")+"</b><br>"+ul([T("Offer: ","Offer: ")+esc(pb.offers[0]),T("Post: ","Post: ")+pb.content.slice(0,3).map(esc).join(" · "),T("Hook to start with: ","Pehla hook: ")+"“"+esc(pb.hooks[0].replace(/\[area\]/g,p.location||"your area"))+"”"]));
    parts.push("<b>"+(parts.length)+". "+T("Conversion & follow-up","Conversion & follow-up")+"</b><br>"+ul([T("WhatsApp + call button everywhere; reply within 15 minutes.","Har jagah WhatsApp + call button; 15 minute mein reply."),pb?T("Track: ","Track: ")+pb.metrics.slice(0,3).map(esc).join(", "):T("Track leads → customers by source.","Source-wise leads → customers track karo."),pb?T("Avoid: ","Bacho: ")+esc(pb.mistakes[0]).toLowerCase():""]));
    if(pb&&pb.compliance)parts.push("<small>"+esc(pb.compliance)+"</small>");
    M.lastTopic="plan"; M.offer="plan306090";
    chips(["Make a 30-60-90 plan","Content ideas","Experiments to run","Free audit"]);
    return join(...parts)+"<br><br>"+T("Want me to turn this into a 30-60-90 day plan?","Isko 30-60-90 day plan mein badal doon?");
  }

  /* =========================== TEACHING =========================== */
  function findTopic(q){
    const n=" "+String(q).toLowerCase()+" "; let best=null, bl=0;
    const GENERIC={"marketing":1,"online marketing":2,"content":3,"brand":3,"conversion":4,"funnel":4,"offer":3,"budget":3,"testing":3,"audience":3,"organic":3,"copy":2,"email":4,"whatsapp":5,"linkedin":5,"youtube":5,"instagram":5,"followers":4,"engagement":4,"reviews":5};
    for(const t of TOPICS){ for(const k of t.keys){ const re=new RegExp("(^|[^a-z])"+k.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"s?([^a-z]|$)"); const sc=GENERIC[k]!=null?GENERIC[k]:k.length+5; if(re.test(n)&&sc>bl){ best=t; bl=sc; } } }
    if(best&&best.alias)best=TOPICS.find(t=>t.id===best.alias)||best;
    return best;
  }
  function topicAnswer(t,level,compact){
    if(!t)return null;
    M.lastTopic="topic:"+t.id; M.level=level;
    const p=P(), biz=indName();
    if(level==="eli10") return join(T(`<b>${esc(t.title)}, super simply:</b>`,`<b>${esc(t.title)}, ekdum simple:</b>`),esc(t.eli10||t.simple));
    if(level==="deeper") return join(`<b>${esc(t.title)}: ${T("going deeper","aur detail mein")}</b>`,ul((t.deeper||[]).map(esc)),t.svc?T("Related FODO service: ","Related FODO service: ")+svcLink(t.svc):"");
    if(level==="example") return join(`<b>${T("Example","Example")}:</b> ${esc(t.example)}`,biz&&IND[p.industry]?T(`For a ${esc(biz)}, the same idea applies, want me to make it specific with your numbers?`,`${esc(biz)} ke liye bhi yahi logic, apne numbers do toh specific kar dunga.`):"");
    if(compact) return esc(t.simple)+(t.formula?` <b>${esc(t.formula)}</b>.`:"")+" "+esc(t.meaning);
    const lines=[];
    lines.push(LANG!=="en"&&t.hing?esc(t.hing):`<b>${esc(t.title)}</b>: ${esc(t.simple)}`);
    if(t.formula)lines.push(`<b>${T("Formula","Formula")}:</b> ${esc(t.formula)}`);
    lines.push(`<b>${T("Example","Example")}:</b> ${esc(t.example)}`);
    lines.push(`<b>${T("What it means","Matlab")}:</b> ${esc(t.meaning)}`);
    lines.push(`<b>${T("Common mistake","Common galti")}:</b> ${esc(t.mistake)}`);
    chips([T("Explain simpler","Explain simpler"),T("Go deeper","Go deeper"),"Give an example",t.formula?"Calculate it for me":"How do I start?"]);
    if(t.formula) M.offer="calc:"+t.id;
    return lines.join("<br><br>");
  }
  const COMPARE=[
    [/\b(meta|facebook|instagram)\b.*\b(vs|or|versus|better|compare|difference)\b.*\bgoogle\b|\bgoogle\b.*\b(vs|or|versus|better|compare|difference)\b.*\b(meta|facebook|instagram)\b/,()=>{ const c=channelRec(); return join(T("<b>Google vs Meta</b>, they do different jobs:","<b>Google vs Meta</b>, dono ka kaam alag hai:"),ul([T("<b>Google</b> captures <i>existing demand</i>: people searching right now. Higher intent, often pricier clicks.","<b>Google</b> = jo log abhi search kar rahe hain (existing demand). Intent high, click mehenga."),T("<b>Meta</b> creates <i>new demand</i>: people who weren't searching but match your customer. Creative decides results.","<b>Meta</b> = nayi demand create karna, jo search nahi kar rahe par aapke customer jaise hain. Creative sabse important.")]),indName()?c.lead+" "+T("<i>Why:</i> ","<i>Kyun:</i> ")+c.why:T("Rule of thumb: urgent/local services → Google first; visual, impulse or lifestyle products → Meta first; B2B → Google + LinkedIn. Tell me your business and budget and I'll pick one.","Rule: urgent/local service → pehle Google; visual/lifestyle products → pehle Meta; B2B → Google + LinkedIn. Business aur budget batao, main ek choose kar dunga.")); }],
    [/\bseo\b.*\b(vs|or|versus|better|difference)\b.*\b(ads|ppc|paid|google ads)\b|\b(ads|ppc|paid|google ads)\b.*\b(vs|or|versus|better|difference)\b.*\bseo\b|\borganic\b.*\b(vs|or)\b.*\bpaid\b/,()=>join("<b>SEO vs Ads</b>",ul([T("<b>Ads</b>: fast, controllable, stop when you stop paying. Good for testing offers and immediate demand.","<b>Ads</b>: fast, control mein, paisa band toh traffic band. Testing aur turant demand ke liye."),T("<b>SEO</b>: slow to start (months), compounds, lowers long-term acquisition cost, builds trust.","<b>SEO</b>: shuru mein slow (mahine), par compound hota hai aur long-term cost kam karta hai.")]),T("Most businesses do both: ads for today's customers while SEO builds tomorrow's. Use ads data (which keywords convert) to choose SEO topics.","Zyada tar businesses dono karte hain: aaj ke customers ke liye ads, kal ke liye SEO."))],
    [/\broas\b.*\b(vs|or|versus|difference)\b.*\broi\b|\broi\b.*\b(vs|or|versus|difference)\b.*\broas\b/,()=>join("<b>ROAS vs ROI</b>",ul(["<b>ROAS</b> = revenue ÷ ad spend, a revenue ratio, ignores costs.","<b>ROI</b> = (profit − cost) ÷ cost, includes costs and margin."]),T("Example: ₹1 lakh revenue on ₹25k ads = 4x ROAS. At a 30% margin, gross profit is ₹30k → ROI = (30k − 25k) ÷ 25k = 20%. Great ROAS, modest ROI.","Example: ₹25k ads se ₹1 lakh revenue = 4x ROAS. 30% margin pe profit ₹30k → ROI 20%. ROAS accha, ROI average."))],
    [/\b(cpl|cost per lead)\b.*\b(vs|or|versus|difference)\b.*\b(cac|cpa)\b|\b(cac|cpa)\b.*\b(vs|or|versus|difference)\b.*\b(cpl|cost per lead)\b/,()=>join("<b>CPL vs CAC</b>",ul(["<b>CPL</b>: cost to get an enquiry.","<b>CAC</b>: total cost to win a paying customer."]),"CAC = CPL ÷ lead-to-customer rate (plus other costs). ₹200 CPL with 10% close rate → ₹2,000 CAC. That's why cheap leads can still be expensive customers.")],
    [/\b(aeo|geo|ai search)\b.*\b(vs|or|versus|difference)\b.*\bseo\b|\bseo\b.*\b(vs|or|versus|difference)\b.*\b(aeo|geo|ai search)\b/,()=>join("<b>SEO vs AEO/GEO</b>",T("SEO aims to rank pages in search results; AEO/GEO aims to be understood and cited in AI-generated answers. They overlap heavily, clear, useful, trustworthy content and strong entity signals help both. AEO adds emphasis on answer-first writing, structured information and third-party mentions. Nobody can guarantee AI citations.","SEO = search results mein rank karna; AEO/GEO = AI answers mein cite hona. Dono mein overlap bahut hai, clear, helpful content aur consistent business info dono ke liye kaam aata hai."))],
    [/\bbranding\b.*\b(vs|or|versus|difference)\b.*\bmarketing\b|\bmarketing\b.*\b(vs|or|versus|difference)\b.*\bbranding\b/,()=>join("<b>Branding vs Marketing</b>",T("Branding decides <i>who you are</i> and what you stand for (positioning, promise, voice, look). Marketing is <i>how you reach and persuade</i> people (channels, campaigns, offers). Strong branding makes every marketing rupee work harder.","Branding = aap kaun ho aur kis cheez ke liye jaane jaate ho. Marketing = logon tak pahunchna aur convince karna. Strong brand se har marketing rupee zyada kaam karta hai."))],
    [/\binstagram\b.*\b(vs|or|versus|difference)\b.*\bfacebook\b|\bfacebook\b.*\b(vs|or|versus|difference)\b.*\binstagram\b/,()=>join("<b>Instagram vs Facebook</b>",T("Both run on Meta Ads, so you usually advertise on both from one campaign. Organically, Instagram (Reels) is stronger for younger, visual, lifestyle audiences; Facebook still works for groups, communities and older demographics in many Indian cities. Let placements run automatically at first, then check where your results come from.","Dono Meta Ads se chalte hain, ek campaign se dono pe ads. Organic mein Instagram younger/visual audience ke liye strong, Facebook groups aur older audience ke liye."))],
    [/\bb2b\b.*\b(vs|or|versus|difference)\b.*\bb2c\b|\bb2c\b.*\b(vs|or|versus|difference)\b.*\bb2b\b/,()=>join("<b>B2B vs B2C</b>",ul(["B2B: fewer, higher-value buyers; multiple decision-makers; longer cycles; logic, proof and relationships.","B2C: many buyers; faster, more emotional decisions; creative, convenience and social proof."]))],
    [/\bctr\b.*\b(vs|or|versus|difference)\b.*\b(cvr|conversion rate)\b|\b(cvr|conversion rate)\b.*\b(vs|or|versus|difference)\b.*\bctr\b/,()=>join("<b>CTR vs Conversion rate</b>",ul(["CTR: % of people who saw → clicked (ad/creative health).","Conversion rate: % of visitors → took action (page/offer health)."]),"High CTR + low conversion → page/message-match problem. Low CTR + good conversion → creative problem.")]
  ];

  function practical(t,a){
    const p=P(), pb=p.industry&&IND[p.industry], biz=indName();
    M.lastTopic="topic:"+t.id;
    const steps=(t.deeper||[]).slice(0,4);
    const tie=pb?(t.id==="localseo"||t.id==="reviews"?(LOCAL_IND.test(p.industry)?T(`For a ${esc(biz)}, this is one of the highest-return things you can do, most customers check Maps and reviews before calling.`,`${esc(biz)} ke liye ye sabse zyada return wala kaam hai, log call karne se pehle Maps aur reviews dekhte hain.`):""):t.id==="influencer"||t.id==="ugc"?T(`For a ${esc(biz)}: start with 3–5 local/niche micro-creators whose followers match your customers, give them a clear brief and a trackable code.`,`${esc(biz)} ke liye: 3–5 local micro-creators se shuru karo jinke followers aapke customers jaise hon; clear brief aur trackable code do.`):t.id==="email"||t.id==="whatsapp"||t.id==="crm"||t.id==="retention"?T(`For a ${esc(biz)}: `,`${esc(biz)} ke liye: `)+esc(pb.retention):T(`For a ${esc(biz)}, the channels that usually matter most: `,`${esc(biz)} ke liye zyada kaam ke channels: `)+pb.channels.slice(0,3).map(esc).join(", ")+"."):"";
    chips(["Give an example","Go deeper","Experiments to run","Free audit"]);
    return join(`<b>${esc(t.title)}</b>: ${LANG!=="en"&&t.hing?esc(t.hing):esc(t.simple)}`,tie,steps.length?H(T("How to do it","Kaise karein"))+"<br>"+ul(steps.map(esc)):"",`<b>${T("Avoid","Bacho")}:</b> ${esc(t.mistake)}`,t.svc?T("Related FODO service: ","Related FODO service: ")+svcLink(t.svc):"");
  }

  const PRACT_RE=/^(localseo|reviews|influencer|ugc|email|whatsapp|crm|retention|referral|analytics|attribution|aeo|seo|technicalseo|onpage|keywords|links|googleads|metaads|retargeting|socialmedia|shortform|youtube|b2b|ecommerce|landing|cro|offer|positioning|branding|research|automation|aimarketing|creativetesting|campaignstructure|audiencetesting|tiktok|copywriting|leadgen)$/;
  function auditFix(){
    M.lastTopic="auditfix"; M.offer="headline";
    return join(T("<b>Fixing P0, in order (about a day of work):</b>","<b>P0 fix karne ka order (lagbhag ek din ka kaam):</b>"),ol([T("<b>Headline:</b> who it's for + the outcome + where. (Say 'rewrite my headline' and I'll draft options.)","<b>Headline:</b> kiske liye + result + kahan. ('rewrite my headline' likho, main options dunga.)"),T("<b>One primary CTA</b> above the fold, repeated after key sections; outcome-led text ('Get my quote', 'Book on WhatsApp').","<b>Ek main CTA</b> upar, key sections ke baad repeat; result wala text ('Book on WhatsApp')."),T("<b>Contact paths:</b> click-to-call and WhatsApp buttons, sticky on mobile.","<b>Contact:</b> click-to-call aur WhatsApp button, mobile pe sticky."),T("<b>Tracking:</b> GA4 key events + Meta Pixel for form, call and WhatsApp clicks, test each one.","<b>Tracking:</b> form, call, WhatsApp clicks ke GA4 events + Meta Pixel, har ek test karo."),T("<b>Check on your own phone</b> over mobile data: load time, tap targets, form.","<b>Apne phone pe check karo</b> (mobile data pe): speed, buttons, form.")]),T("Then P1: proof next to the CTA and a pricing signal.","Phir P1: CTA ke paas proof aur price ka signal."));
  }

  /* =========================== WEBSITE AUDIT MODE =========================== */
  function siteAudit(a){
    const raw=a.raw, n=a.text;
    const hasContent=raw.length>70&&/(headline|hero|cta|button|says|section|testimonial|review|form|price|menu|footer|page has|homepage|banner|about us|contact)/i.test(raw);
    if(!hasContent){
      M.offer="audit_paste";
      const url=a.entities.website;
      return join(url?T(`I can't open ${esc(url)} from here: I'm an offline assistant and won't pretend I've seen it.`,`Main ${esc(url)} khol nahi sakta, offline assistant hoon, aur bina dekhe dekhne ka natak nahi karunga.`):T("Happy to review it, but I can only analyse what you paste here (I can't browse).","Review kar dunga, par sirf jo aap yahan paste karoge (main browse nahi kar sakta)."),T("Paste: the headline + subheadline, main button text, what sections the page has (services, reviews, prices, FAQ…), and how people contact you. I'll return a P0 / P1 / P2 list.","Paste karo: headline + subheadline, main button ka text, page pe kaunse sections hain (services, reviews, prices, FAQ…), aur contact kaise karte hain. Main P0 / P1 / P2 list dunga."),H(T("Meanwhile, the checklist I'll use","Tab tak ye checklist"))+"<br>"+ul(["<b>P0</b>, clear headline (who + outcome), one primary CTA, working contact/WhatsApp, mobile usable, tracking","<b>P1</b>, proof near CTA, offer clarity, form friction, speed, message match with ads","<b>P2</b>: SEO basics (titles, service pages), FAQ, visuals, internal links"]),handoff("audit"));
    }
    const P0=[],P1=[],P2=[];
    const hl=(raw.match(/headline(?:\s+(?:says|is|reads))?\s*[:"“]?\s*["“]?([^"”\n.]{3,120})/i)||[])[1]||"";
    const btn=(raw.match(/(?:button|cta)(?:\s+(?:says|is|reads|text))?\s*[:"“]\s*["“]?([^"”\n.]{2,40})/i)||[])[1]||"";
    if(/\bwelcome\b|\bbest\b.*\b(in|quality)\b|quality (service|products)|we are (the )?(best|leading)|one stop/i.test(hl||raw)) P0.push("Generic headline (e.g. 'Welcome…/best quality'). Replace with who it's for + the outcome + where: e.g. 'Painless dental care in Dwarka, same-week appointments'.");
    if(/no (cta|call to action|button)|cta (is )?missing|without (a )?cta|no (book|contact) button/i.test(raw)||!/\b(book|call|whatsapp|buy|get|start|contact|enquire|enquiry|order|schedule|quote|cta|button)\b/i.test(raw)) P0.push("No clear primary CTA. Add one action above the fold (e.g. 'Book on WhatsApp'), repeated after key sections; sticky call/WhatsApp on mobile.");
    if(/no (reviews|testimonials|social proof|proof)|without (reviews|testimonials)/i.test(raw)) P1.push("No social proof. Add 3–6 real reviews (Google review screenshots/quotes with names, with permission) right next to the CTA.");
    if(/no (price|pricing)|price not|without (price|pricing)/i.test(raw)) P1.push("No pricing signal. Even 'starting from ₹X' or 'consultation ₹Y' filters time-wasters and builds trust.");
    if(btn&&/^(submit|send|click here|go|enter|ok|learn more)$/i.test(btn.trim())) P0.push(`Button says '${esc(btn.trim())}', that describes the action, not the benefit. Use outcome-led CTA text like 'Get my free quote' or 'Book on WhatsApp'.`);
    if(/slow|takes \d+ ?s|heavy|loading/i.test(raw)) P0.push("Slow load. Compress images (WebP), lazy-load below the fold, remove unused scripts; aim for ~3s on mobile data.");
    if(/(\d{1,2}) fields|long form|too many fields/i.test(raw)) P1.push("Form friction. Cut to 3–4 fields (name, phone, need, area); offer WhatsApp as an alternative.");
    if(/stock (photo|image)s?/i.test(raw)) P1.push("Stock photos reduce trust. Use real team/space/product photos.");
    if(/no (whatsapp|phone|contact)/i.test(raw)) P0.push("No direct contact. Add click-to-call and WhatsApp buttons, many visitors won't fill forms.");
    if(/no (mobile|responsive)|not mobile|mobile (is )?(broken|bad)/i.test(raw)) P0.push("Mobile issues. Most local traffic is mobile, fix layout, tap targets and font sizes first.");
    if(/no (tracking|analytics|pixel)/i.test(raw)) P0.push("No tracking. Install GA4 key events + Meta Pixel/CAPI for form, call and WhatsApp clicks before spending on ads.");
    if(/no (faq|about)/i.test(raw)) P2.push("Add an FAQ answering price, process, time and trust questions, also helps SEO and AI search.");
    if(/no (seo|meta title|title)/i.test(raw)) P2.push("SEO basics: unique title/description per page, one H1, service + location pages, internal links.");
    if(!P1.some(x=>/proof/.test(x))&&!/review|testimonial|rating/i.test(raw)) P1.push("Make sure proof (reviews, credentials, results with permission) sits near the CTA.");
    P1.push("Message match: if visitors arrive from ads, the headline should repeat the ad's promise.");
    P2.push("Add a short 'how it works' (3 steps) to reduce uncertainty.");
    P2.push("Test one change at a time and track enquiry rate.");
    M.lastTopic="audit";
    chips(["How do I fix P0 first?","Rewrite my headline","Experiments to run","Free audit"]);
    M.offer="headline";
    return join(T("Here's my review of what you shared (I can only judge the text you pasted, not speed or design I can't see):","Aapne jo share kiya uska review (sirf text ke basis pe, speed/design jo main dekh nahi sakta, uspe judge nahi kar raha):"),P0.length?"<b>P0, critical</b><br>"+ul(P0):"",P1.length?"<b>P1, important</b><br>"+ul(P1):"",P2.length?"<b>P2, improvements</b><br>"+ul(P2):"",T("Want me to rewrite the headline and CTA for you?","Headline aur CTA rewrite kar doon?"));
  }
  function rewriteHeadline(){
    const p=P(), pb=p.industry&&IND[p.industry], biz=indName()||"[your service]", city=p.location||"[your area]";
    M.lastTopic="headline";
    return join(T("Headline options (pick the one closest to your real promise):","Headline options (jo aapke asli promise ke kareeb ho):"),ol([`${esc(pb&&pb.adAngles?pb.adAngles[0]:"[Main benefit]")}: ${esc(biz)} in ${esc(city)}. ${p.goal==="bookings"?"Book in 60 seconds on WhatsApp":"Get a straight answer today"}`,`The ${esc(biz)} in ${esc(city)} that explains everything before you pay`,`${esc(city)}'s ${esc(biz)} for people who hate surprises, transparent pricing, real reviews`]),T("CTA options: ","CTA options: ")+["Book on WhatsApp","See prices","Check this week's slots"].map(x=>"“"+x+"”").join(" · "),T("Only use claims you can back up (no 'best', no guarantees).","Sirf wahi claims likho jo prove kar sako ('best' ya guarantee nahi)."));
  }

  function competitorAnswer(compact){
    const p=P(), biz=indName()||"your business", city=p.location?" in "+esc(p.location):"";
    M.lastTopic="competitor";
    const steps=["List 5 competitors customers actually compare you with"+city+" (search your main keyword, check Maps).","For each: positioning line, main offer, how price is presented, review count/rating + common complaints, top Google pages, ad angles (Meta Ad Library), website clarity, and how fast they reply to an enquiry (mystery-shop it).","Read their negative reviews, unmet needs there are your openings.","Output 4 gaps: positioning gap, offer gap, content/SEO gap, speed/experience gap.","Don't copy their ads or content, beat them on clarity, proof and speed."];
    if(compact)return ul(steps.slice(0,3));
    return join(T(`Competitor analysis for a ${esc(biz)}${city}:`,`${esc(biz)}${city} ke liye competitor analysis:`),ol(steps),p.competitors.length?T("You mentioned: ","Aapne bataya: ")+p.competitors.map(esc).join(", ")+T(", run the checklist on them first.",", pehle inpe checklist chalao."):T("Who are your top 2–3 competitors?","Top 2–3 competitors kaun hain?"));
  }

  /* =========================== FODO (source of truth = site config + data) =========================== */
  const faq=q=>((D.faqs||[]).find(f=>f.q.toLowerCase().indexOf(q)>-1)||{}).a;
  function fodo(intent,a){
    const name=C.shortBrand||"FODO";
    switch(intent){
      case "fodo_what": return join(T(`<b>FODO = Fear Of Digitally Out</b>, an independent digital growth agency in New Delhi, founded by ${esc(C.founderName||"Anmol Singh")}. It helps ambitious brands build attention, create demand and turn digital presence into measurable growth, for brands across India and worldwide, remote-first.`,`<b>FODO = Fear Of Digitally Out</b>: New Delhi ki independent digital growth agency, founder ${esc(C.founderName||"Anmol Singh")}. Kaam: brands ki attention, demand aur measurable growth: India aur poori duniya mein, remote-first.`),esc(faq("what does fodo actually do")||""),`${L(R.about,"About →")} · ${L(R.services,"Services →")}`);
      case "fodo_services": { const ik=a&&a.entities&&a.entities.industry, fi=ik&&IND[ik]&&(D.industries||[]).find(x=>x.slug===IND[ik].fodoInd);
        if(fi){ chips(["Pricing","Free audit","How do you work?"]); return join(T(`For a ${esc(IND[ik].name)}, FODO's ${esc(fi.name)} playbook focuses on: ${esc(fi.approach)}`,`${esc(IND[ik].name)} ke liye FODO ka ${esc(fi.name)} approach: ${esc(fi.approach)}`),T("Usually relevant services: ","Aksar kaam ki services: ")+fi.services.map(s=>svcLink(s)).filter(Boolean).join(" · "),L(R.industries+"#"+fi.slug,T("Industry page →","Industry page →"))+" · "+L(R.audit,T("Free Growth Audit →","Free Growth Audit →"))); }
        const pil=(D.pillars||[]).map(pl=>`<b>${esc(pl.name)}</b>: `+(D.services||[]).filter(s=>s.pillar===pl.id).map(s=>L(R.services+"#"+s.slug,esc(s.name))).join(", ")).filter(x=>!/: $/.test(x)); chips(["More leads","More sales","Brand visibility","Pricing"]); return join(T(`FODO runs ${(D.services||[]).length} services, connected by one Growth System so every activity has a reason and a measure:`,`FODO ki ${(D.services||[]).length} services hain, ek Growth System se judi hui:`),ul(pil),T("It doesn't recommend every service to every business, the goal decides the stack. What's yours?","Har business ko har service nahi chahiye, goal se stack tay hota hai. Aapka goal kya hai?")); }
      case "fodo_price": return join(T("FODO doesn't publish a fixed price list, scope depends on channels, complexity, creative needs and goals. Ad spend is always paid by you, from your own ad accounts.","FODO ki koi fixed price list nahi hai, scope channels, complexity, creative aur goals pe depend karta hai. Ad spend hamesha aap apne ad accounts se dete ho."),T(`The quickest route to a real number: ${L(R.audit,"Free Growth Audit")} → scoped proposal.`,`Asli number ka sabse fast rasta: ${L(R.audit,"Free Growth Audit")} → scoped proposal.`),C.foundingSlotsTotal?T(`There's also a Founding Clients Programme for early partner brands (${L(R.home+"#founding-panel","details")}).`,`Founding Clients Programme bhi hai NCR ke shuruaati partners ke liye (${L(R.home+"#founding-panel","details")}).`):"");
      case "fodo_audit": chips(["Start the audit","What do you check?","Is it really free?"]); return join(T(`The <b>Free Growth Audit</b> is a human review of your website, SEO, paid media, social, content, conversion path and measurement, followed by a conversation about priorities. It's not an automated scan, and there's no obligation.`,`<b>Free Growth Audit</b> = insaan dwara review, website, SEO, ads, social, content, conversion path aur tracking, phir priorities pe baat. Automated scan nahi, koi obligation nahi.`),L(R.audit,T("Start the 5-step form →","5-step form shuru karo →")));
      case "fodo_contact": return join(T("Reach FODO directly:","FODO se seedha contact:"),ul([`${T("WhatsApp/phone","WhatsApp/phone")}: <a href="tel:${esc(C.phone)}">${esc(C.phoneDisplay||C.phone)}</a> · ${WA("Hi Anmol, I'd like to talk about growing my business.")}`,`Email: <a href="mailto:${esc(C.email)}">${esc(C.email)}</a>`,`${T("Book a call","Call book karo")}: ${L(R.call,"/contact →")}`]));
      case "fodo_founder": return join(T(`FODO was founded by <b>${esc(C.founderName||"Anmol Singh")}</b>. His background spans film and media production, assistant directing and content creation, work where attention is earned shot by shot.`,`FODO ke founder <b>${esc(C.founderName||"Anmol Singh")}</b> hain, film & media production, assistant directing aur content creation ka background.`),`${L(R.about+"#founder","Founder →")}`+(C.linkedinUrl?` · <a href="${esc(C.linkedinUrl)}" target="_blank" rel="noopener noreferrer">LinkedIn</a>`:""));
      case "fodo_process": return join(T("Starting is simple: Free Growth Audit → scoped proposal → start. Work runs through the 6-stage FODO Growth System:","Shuruaat simple: Free Growth Audit → scoped proposal → start. Kaam 6-stage Growth System se chalta hai:"),ol((D.stages||[]).map(s=>`<b>${esc(s.name)}</b>: ${esc(s.what)}`)),L(R.about+"#growth-system",T("See the system →","System dekho →")));
      case "fodo_guarantee": return join(T("Honest answer: no, and be careful with anyone who guarantees leads, rankings or ROAS before seeing your business.","Seedha jawab: nahi, aur jo bhi bina business dekhe leads/rankings/ROAS ki guarantee de, usse savdhaan."),esc(faq("guarantee")||"FODO agrees targets, tests transparently and reports honestly. Results depend on offer, market, budget and execution."));
      case "fodo_contract": return esc(faq("contract terms")||"")+" "+T("You own every account and asset.","Har account aur asset aapka rehta hai.");
      case "fodo_timeline": return join(esc(faq("how fast can we launch")||""),esc(faq("how long does seo take")||""));
      case "fodo_location": return T(`FODO is headquartered in New Delhi, India, and works remote-first with brands worldwide: India, the Gulf, the UK, the US, Europe and beyond. ${L(R.contact,"Contact →")}`,`FODO ka HQ New Delhi, India mein hai; hum remote-first poori duniya ke brands ke saath kaam karte hain: India, Gulf, UK, US, Europe aur aage. ${L(R.contact,"Contact →")}`);
      case "fodo_why": return join(T("Fair question, and you should compare. What FODO actually commits to, based on how it works:","Sahi sawaal, compare zaroor karo. FODO kya commit karta hai:"),ul([T("Diagnosis before recommendations, the 6-stage Growth System starts with Discover and Diagnose, not a channel pitch.","Pehle diagnosis, phir recommendation: Growth System Discover aur Diagnose se shuru hota hai."),T("You own your ad accounts, data and assets.","Ad accounts, data aur assets aapke."),T("Reporting that answers specific questions + a monthly written review of what moved and what changes next.","Reporting jo specific sawaalon ka jawab de + monthly written review."),T("No fake promises: no guaranteed numbers, honest advice if a channel isn't worth it at your budget.","Jhoothe promise nahi, agar aapke budget mein koi channel worth nahi, toh seedha bataya jayega."),T("3-month sprint, then month-to-month with 30 days' notice.","3-month sprint, phir month-to-month, 30 din notice.")]),T("When comparing proposals, ask: does it connect to my numbers, and does it say what they <i>won't</i> do?","Proposals compare karte waqt poochho: kya ye mere numbers se judta hai, aur kya batata hai ki kya <i>nahi</i> karenge?"));
      case "fodo_trust": { const live=C.reviewsMode==="live"; return join(T("Straight answer: FODO is a young agency, and the site doesn't claim results it can't show.","Seedhi baat: FODO ek naya agency hai, aur site koi aisa result claim nahi karti jo dikha na sake."),ul([T(`The ${L(R.work,"Work")} page shows <b>concept</b> case studies, clearly labelled as hypothetical examples of the approach, not client results.`,`${L(R.work,"Work")} page pe <b>concept</b> case studies hain, clearly hypothetical labelled, client results nahi.`),live?T(`The ${L(R.reviews,"Reviews")} page shows only verified client reviews published with written approval, the first founding-partner stories are being collected now.`,`${L(R.reviews,"Reviews")} page pe sirf verified, written-approved client reviews dikhte hain, pehli founding-partner stories abhi collect ho rahi hain.`):T(`The ${L(R.reviews,"Reviews")} page is currently a design preview with demo entries, real, approved reviews will replace them.`,`${L(R.reviews,"Reviews")} page abhi design preview hai (demo entries), asli approved reviews baad mein aayenge.`),T(`Best trust test: the ${L(R.audit,"Free Growth Audit")}, judge the thinking on your own business before committing anything.`,`Sabse accha trust test: ${L(R.audit,"Free Growth Audit")}, apne business pe unki soch judge karo, bina commit kiye.`)])); }
      case "fodo_tools": { const t=a.text;
        if(/growth score|score/.test(t)) return T(`The <b>Growth Score</b> is a 10-question self-assessment (0–100) that shows your biggest opportunity and biggest risk. It's for reflection, not a substitute for a real audit. ${L(R.score,"Take it →")}`,`<b>Growth Score</b> = 10 sawaalon ka self-assessment (0–100), sabse bada mauka aur sabse bada risk dikhata hai. Real audit nahi hai. ${L(R.score,"Shuru karo →")}`);
        if(/roi|calculator/.test(t)) return T(`The <b>Growth / ROI Calculator</b> runs live, illustrative scenarios in ₹, visitors, conversion rate, order value, spend → leads, revenue and ROAS. Scenarios, not promises. ${L(R.roi,"Open it →")} (Or give me your numbers and I'll calculate here.)`,`<b>Growth / ROI Calculator</b> ₹ mein live scenarios dikhata hai, visitors, conversion, order value, spend → leads, revenue, ROAS. ${L(R.roi,"Kholo →")} (Ya numbers do, main yahin calculate kar dunga.)`);
        if(/quiz/.test(t)) return T(`The <b>Marketing Quiz</b> is 10 questions with an explanation for every answer. ${L(R.quiz,"Take the quiz →")}`,`<b>Marketing Quiz</b>, 10 sawaal, har jawab ki explanation ke saath. ${L(R.quiz,"Quiz do →")}`);
        if(/resource|checklist/.test(t)) return T(`<b>Resources</b> has 5 interactive checklists you can tick, copy or print. ${L(R.resources,"Open resources →")}`,`<b>Resources</b> mein 5 interactive checklists hain. ${L(R.resources,"Kholo →")}`);
        if(/growth lab/.test(t)) return T(`The <b>Growth Lab</b> brings together the FODO Challenge, Growth Score, ROI calculator and Marketing Quiz. ${L(R.lab,"Open the lab →")}`,`<b>Growth Lab</b> mein FODO Challenge, Growth Score, ROI calculator aur Quiz hain. ${L(R.lab,"Kholo →")}`);
        return T(`<b>The FODO Challenge</b>: 4 rounds, about 2 minutes, spot the winning campaign, fix the funnel, save a campaign, then rapid-fire. Score under 40 and you're invited to a free 30-minute strategy session. ${L(R.game,"Play now →")}`,`<b>FODO Challenge</b>: 4 rounds, lagbhag 2 minute. 40 se kam score pe free 30-minute strategy session. ${L(R.game,"Khelo →")}`); }
      case "fodo_report": return esc(faq("how do you report")||"");
      case "fodo_ownership": return esc(faq("who owns the ad accounts")||"");
      case "fodo_videos": return esc(faq("videos and designs")||"");
      case "fodo_platform": return esc(faq("website platform")||"");
      case "fodo_minbudget": return join(esc(faq("minimum ad budget")||""),T("General rule (not FODO pricing): the budget needs to buy enough clicks for a meaningful number of conversions within a few weeks, tell me your business and city and I'll explain what that looks like.","General rule: budget itna ho ki kuch hafton mein meaningful conversions mil sakein, business aur city batao, main samjhata hoon."));
      case "fodo_industries": return join(T("FODO's site has playbooks for:","FODO ki site pe in industries ke playbooks hain:"),(D.industries||[]).map(i=>L(R.industries+"#"+i.slug,esc(i.name))).join(" · "),T("Not listed? Tell me your business, the principles transfer, and I can make it specific.","Aapki industry list mein nahi? Business batao, main specific kar dunga."));
      case "fodo_hiring": return T(`I don't have hiring information here. Ask Anmol directly: <a href="mailto:${esc(C.email)}">${esc(C.email)}</a> or ${WA("Hi Anmol, I'd like to ask about working with FODO.")}`,`Hiring ki info mere paas nahi hai. Anmol se seedha poochho: <a href="mailto:${esc(C.email)}">${esc(C.email)}</a> ya ${WA("Hi Anmol, I'd like to ask about working with FODO.")}`);
    }
    return null;
  }

  /* =========================== GENERAL / LIVE / EMOTIONAL =========================== */
  function general(a){
    const n=a.text;
    const cap=n.match(/\bcapital (?:city )?of ([a-z ]{2,30}?)(?:\?|$| is| kya)/)||n.match(/\b([a-z ]{2,30}?) (?:ki|ka) capital\b/)||n.match(/\b([a-z ]{2,20}?)'?s capital\b/);
    if(cap){ const c=cap[1].trim().replace(/^the /,""); if(KB.capitals[c])return `${KB.capitals[c].indexOf(" ")>-1&&/is itself|disputed|executive|commercial|move|summer/.test(KB.capitals[c])?"":"The capital of "+c.replace(/\b\w/g,m=>m.toUpperCase())+" is "}<b>${esc(KB.capitals[c])}</b>.`; return null; }
    if(/\b(current|present|now|today|this year|latest|right now)\b.*\b(prime minister|president|cm|chief minister|ceo|captain|governor|minister|champion|winner)\b|\bwho is (the )?(prime minister|president|ceo|cm|chief minister|governor|captain)\b/.test(n)) return "live";
    for(const [re,ans] of KB.general){ if(re.test(n)){ if(ans===null)return null; return ans; } }
    return null;
  }
  function liveAnswer(a){
    const n=a.text;
    let ever="";
    if(/weather|rain|temperature/.test(n))ever=T("Check a weather app or IMD for live conditions. (Marketing tip: weather genuinely changes demand, monsoon boosts delivery, heat boosts cold drinks; good businesses plan offers around it.)","Live weather ke liye weather app ya IMD dekho. (Tip: mausam demand badalta hai, offers usi hisaab se plan karo.)");
    else if(/algorithm|instagram|reels|meta|google update|core update/.test(n))ever=T("What stays true across algorithm changes: content people watch to the end, share and save gets distributed; original, specific, useful content beats recycled trends; consistency + clear audience fit wins. For the latest official changes, check Instagram's @creators account, Meta's and Google Search Central's official blogs.","Algorithm badalte rehte hain, par ye nahi badalta: jo content log poora dekhte, share aur save karte hain wo aage badhta hai; original aur useful content trends se better hai. Latest updates ke liye official sources (Instagram @creators, Meta blog, Google Search Central) dekho.");
    else if(/stock|share|nifty|sensex|crypto|bitcoin|gold|petrol|diesel|price|rate/.test(n))ever=T("For live prices, use NSE/BSE, your broker app or an official source. I can help with the maths once you have the number.","Live prices ke liye NSE/BSE, broker app ya official source dekho. Number mile toh calculation main kar dunga.");
    else if(/news|headline|election|result|score|match|ipl|who won/.test(n))ever=T("A trusted news site or app will have it live. If it's for content: I can help you plan a timely post around the topic once you know the facts.","Live ke liye trusted news app dekho. Content ke liye topical post plan karna ho toh help kar dunga.");
    else if(/prime minister|president|ceo|minister|governor|captain|champion/.test(n))ever=T("Office-holders change, so please check an official or news source for who holds it today.","Ye positions badalti rehti hain, aaj kaun hai, official/news source se check karo.");
    else ever=T("If you share the details, I can still help you think it through.","Details share karo toh soch-vichaar mein help kar sakta hoon.");
    CONF="unknown";
    return join(T("I'm an offline assistant, so I can't check live or current information, and I'd rather not make it up.","Main offline assistant hoon, live/current info check nahi kar sakta, aur banake nahi bataunga."),ever);
  }
  function datetime(){
    const d=new Date();
    const s=d.toLocaleString(LANG==="hi"?"hi-IN":"en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"numeric",minute:"2-digit"});
    return T(`Your device clock says: <b>${esc(s)}</b>.`,`Aapke device ki ghadi ke hisaab se: <b>${esc(s)}</b>.`,`आपके डिवाइस के अनुसार: <b>${esc(s)}</b>`);
  }
  function crisis(){
    CHIPS=[]; CONF="high"; M.lastTopic="support";
    return join(T("I'm really sorry you're feeling this much pain. You deserve support right now, and you don't have to handle this alone.","Mujhe sach mein afsos hai ki aap itna dard mehsoos kar rahe ho. Aapko abhi support milna chahiye, aap akele nahi ho.","मुझे सच में दुख है कि आप इतना दर्द महसूस कर रहे हैं। आप अकेले नहीं हैं: अभी मदद लेना ज़रूरी है।"),
      T("If you're in immediate danger or might act on these thoughts, please call <b>112</b> (India emergency) now, or go to the nearest hospital. You can also call <b>Tele-MANAS: 14416</b> (or 1-800-891-4416), free, 24×7, in many Indian languages. If you're outside India, please contact your local emergency number.","Agar aap turant khatre mein ho ya in khayalon pe kuch kar sakte ho, abhi <b>112</b> call karo ya nazdeeki hospital jao. <b>Tele-MANAS: 14416</b> (ya 1-800-891-4416) pe bhi call kar sakte ho, free, 24×7, kai bhashaon mein. India ke bahar ho toh local emergency number pe call karo.","अगर आप तुरंत खतरे में हैं, अभी <b>112</b> पर कॉल करें या नज़दीकी अस्पताल जाएँ। <b>टेली-मानस: 14416</b> (या 1-800-891-4416) पर भी बात कर सकते हैं: मुफ़्त, 24×7।"),
      T("If you can, reach out to someone you trust, a friend, family member, and tell them how you're feeling. I'm just a website assistant, but I'm here to listen if you want to keep talking.","Ho sake toh kisi bharosemand insaan, dost ya family, ko abhi batao ki aap kaisa mehsoos kar rahe ho. Main sirf website assistant hoon, par baat karni ho toh sun raha hoon.","हो सके तो किसी भरोसेमंद व्यक्ति से अभी बात करें। मैं सुनने के लिए यहाँ हूँ।"));
  }
  function emotional(kind,a){
    CONF="high"; M.lastTopic="support:"+kind;
    const R2={
      sad:[T("I'm sorry you're feeling low. That's heavy, and it's okay not to be okay.","Sorry yaar, aap low feel kar rahe ho. Kabhi-kabhi theek na hona bhi theek hai."),T("Do you want to talk about what's going on? Sometimes saying it out loud helps. And if it's been weighing on you for a while, talking to someone you trust, or a counsellor, can really help.","Kya hua, batana chahoge? Bolne se halka lagta hai. Aur agar kaafi time se aisa lag raha hai, toh kisi apne se ya counsellor se baat karna sach mein help karta hai.")],
      lonely:[T("Feeling lonely is hard, and more common than people admit.","Akelapan mehsoos karna mushkil hai, aur jitna log maante hain usse kahin zyada common."),T("I'm here to chat. If you can, message one person today, even a small 'hey, been a while' can open a door. Want to talk about what's making it feel this way?","Main baat karne ke liye yahan hoon. Ho sake toh aaj ek insaan ko message karo, chhota sa 'hey, kaafi time ho gaya' bhi kaafi hai. Kya cheez aisa feel kara rahi hai?")],
      stress:[T("That sounds like a lot to carry. Let's slow it down for a second.","Lagta hai bahut kuch ek saath chal raha hai. Ek second rukte hain."),T("Try this: write down everything on your mind, then circle just one thing you can do in the next hour. Everything else can wait until that's done. If stress is affecting sleep or health for a while, please talk to someone, a friend, doctor or counsellor.","Ek kaam karo: dimaag mein jo bhi hai likh do, phir sirf ek kaam choose karo jo agle ek ghante mein ho sake. Baaki baad mein. Agar stress neend ya health pe asar daal raha hai, kisi se baat zaroor karo, dost, doctor ya counsellor.")],
      angry:[T("I hear you, that sounds genuinely frustrating.","Samajh sakta hoon, sach mein gussa aane wali baat hai."),T("Want to vent, or want help fixing the thing that caused it? Either is fine.","Bhadaas nikaalni hai ya jo problem hai use fix karna hai? Dono theek hain.")],
      frustrated:[T("That frustration makes sense, putting in effort and not seeing results is exhausting.","Frustration samajh aata hai, mehnat karo aur result na dikhe toh thakaan hoti hai."),T("Let's take the pressure down: you don't need to fix everything. Tell me the one thing that's bothering you most, and we'll find one small next step.","Sab kuch ek saath theek nahi karna. Sabse zyada pareshan karne wali ek cheez batao, usi ka ek chhota next step nikaalte hain.")],
      heartbreak:[T("I'm really sorry. Heartbreak hurts in a very physical way, and it takes time.","Bahut afsos hai. Dil tootne ka dard sach mein lagta hai, aur time leta hai."),T("Be gentle with yourself, sleep, food, a walk, and people who care about you. You don't have to be 'over it' on any schedule. Want to talk?","Apna khayal rakho, neend, khana, thodi walk, aur apne log. Kisi deadline pe 'move on' karna zaroori nahi. Baat karni hai?")],
      failure:[T("That's a painful amount to lose, and it's completely normal to feel gutted. It doesn't mean you're bad at this, most businesses pay some 'tuition fee' before marketing works.","Itna paisa jaana dukh deta hai, ye feel karna bilkul normal hai. Iska matlab ye nahi ki aap isme bure ho, zyada tar businesses marketing seekhne mein thodi 'fees' bharte hain."),T("Let's reduce pressure: pause any spend that isn't clearly working, and don't make big decisions today. One useful next step: write down what you spent, on which channel, and what came back (leads, customers). If you share those numbers, I'll help you see what actually went wrong, no judgement.","Pressure kam karte hain: jo spend clearly kaam nahi kar raha use pause karo, aaj koi bada faisla mat lo. Ek next step: likho kitna kharch hua, kis channel pe, aur kya wapas aaya (leads, customers). Numbers share karoge toh main dikhata hoon asli galti kahan hui, bina judgement.")],
      lost:[T("That's a very normal place to be, and honestly a good starting point, because you're asking instead of guessing.","Ye bilkul normal hai, aur accha starting point bhi, kyunki aap guess karne ki jagah pooch rahe ho."),T("Let's make it simple. Answer just one thing: what does your business sell, and who buys it? I'll take it from there, one step at a time.","Simple rakhte hain. Bas ek baat batao: aap kya bechte ho aur kaun kharidta hai? Wahan se ek-ek step chalenge.")],
      excited:[T("Love that! 🎉 Congratulations, moments like that are worth celebrating.","Waah! 🎉 Badhai ho, ye celebrate karne wala moment hai."),T("Want to make sure it's repeatable? Tell me what worked and I'll help you turn it into a system.","Ise repeat karna hai? Kya kaam kiya batao, main system bana dunga.")],
      motivation:[T("Motivation follows action more often than the other way round.","Motivation aksar kaam shuru karne ke baad aata hai, pehle nahi."),T("Pick the smallest possible step, 10 minutes, one task, and start it now. Done beats perfect. What's the one thing you've been putting off?","Sabse chhota step choose karo, 10 minute, ek kaam, aur abhi shuru karo. Done is better than perfect. Kaunsa kaam taal rahe ho?")]
    };
    if(kind==="failure"&&!/\b(wasted|lost|burn|blew|spent|lakh|\d)\b/.test(a.text)) R2.failure=[T("That sounds really stressful, when something you've built is struggling, it weighs on everything.","Ye sach mein stressful hai, jab apna banaya hua business struggle kare, toh sab pe bhaari padta hai."),T("You don't have to fix it all today. Let's find the one thing that would help most: is the problem fewer customers coming in, customers not buying, or margins/costs? Tell me a bit and we'll take one step at a time, no sales pitch.","Sab aaj hi theek nahi karna. Pehle ye pata karte hain sabse zyada kya help karega: customers kam aa rahe hain, aa ke kharid nahi rahe, ya margin/cost ki problem hai? Thoda batao, ek-ek step chalenge, koi sales pitch nahi.")];
    if(kind==="sad"){ const t=a.text;
      if(/failed (my |the |an |in )?(exam|test|interview|paper|board)/.test(t)) R2.sad=[T("I'm sorry, that really stings, especially after putting in the effort.","Sorry yaar, mehnat ke baad aisa hona sach mein chubhta hai."),T("One result doesn't define you. Give yourself today to feel it; tomorrow, look at what went wrong (preparation, time, nerves, topics) and make a simple plan for the next attempt. Want help making a study plan?","Ek result aapko define nahi karta. Aaj thoda feel kar lo; kal dekho kya galat hua (preparation, time, nerves, topics) aur agle attempt ka simple plan banao. Study plan banane mein help chahiye?")];
      else if(/co-?founder|partner (left|quit|cheated)/.test(t)) R2.sad=[T("That's a big shock, personally and for the business. It's normal to feel unsettled.","Ye bada jhatka hai, personally bhi aur business ke liye bhi. Unsettled feel karna normal hai."),T("Take a breath before big decisions. This week: secure access to accounts, money and key customers; list what they handled; and talk to one trusted advisor. When you're ready, I can help you re-plan marketing with the team you have now.","Bade faisle se pehle saans lo. Is hafte: accounts, paisa aur key customers ka access secure karo; unke kaam ki list banao; ek bharosemand advisor se baat karo. Jab ready ho, main naye team ke hisaab se marketing re-plan karne mein help karunga.")];
      else if(/lost my job|got fired|laid off/.test(t)) R2.sad=[T("I'm really sorry, losing a job is hard on confidence and on money.","Bahut afsos hai, naukri jaana confidence aur paise dono pe bhaari padta hai."),T("Give yourself a few days, then take one step at a time: update your CV with measurable wins, tell your network you're looking, and apply to a few roles a day. Want tips on your CV or interviews?","Kuch din khud ko do, phir ek-ek step: CV mein measurable wins likho, network ko batao, roz kuch roles pe apply karo. CV ya interview tips chahiye?")];
    }
    const r=R2[kind]||R2.sad;
    chips(kind==="failure"?["Here are my numbers","What should I pause?","I just want to vent"]:kind==="lost"?["I sell a product","I offer a service","I'm just starting"]:[]);
    if(kind==="failure")M.offer="funnel_numbers";
    return join(r[0],r[1]);
  }

  /* =========================== FOLLOW-UPS =========================== */
  function followUp(a){
    const n=a.text, lt=M.lastTopic||"", tp=lt.startsWith("topic:")?TOPICS.find(t=>t.id===lt.slice(6)):null, p=P();
    // chip / short follow-up phrases
    if(/^(here are my numbers|my numbers|funnel check|check my funnel|analy[sz]e my numbers)$/.test(n)){ M.offer="funnel_numbers"; return T("Send what you have in one line, even rough numbers work. For example: <b>'spent 50k, 4000 clicks, 120 leads, 30 appointments, 8 customers, revenue 2 lakh'</b>. I'll calculate CPC/CPL/CAC/ROAS and show where the funnel leaks.","Jo bhi numbers hain ek line mein bhejo, rough bhi chalega. Jaise: <b>'spent 50k, 4000 clicks, 120 leads, 30 appointments, 8 customers, revenue 2 lakh'</b>. Main CPC/CPL/CAC/ROAS nikaal ke leak dikhaunga."); }
    if(/^(calculate (it|this|that)( for me)?|calculate for me|do the (maths|math)|calculate my \w+|calc my \w+)$/.test(n)){
      const mm=n.match(/\b(roas|roi|cac|cpl|cpa|ctr|cpc|cpm|ltv|aov|conversion rate|break.?even)\b/)||[]; const id=(mm[1]||(M.offer&&M.offer.startsWith("calc:")?M.offer.slice(5):(tp?tp.id:""))).replace(/break.?even/,"breakeven").replace("conversion rate","cvr");
      const r=K.calculateMetric(id==="breakeven"?"break even":id,Object.assign({},p,{spend:p.spend!=null?p.spend:p.budget})); if(r)return r.map(x=>`<b>${x.name}: ${x.val}</b><br>${x.formula}`).join("<br><br>")+"<br><small>"+T("Using the numbers you shared earlier.","Pehle diye numbers se.")+"</small>";
      const need={roas:"ad spend and revenue from ads",roi:"total cost, revenue and margin %",cac:"total acquisition cost and new customers",cpl:"ad spend and number of leads",cpa:"ad spend and conversions",ctr:"impressions and clicks",cpc:"ad spend and clicks",cpm:"ad spend and impressions",ltv:"average order value, purchases per year and years retained",aov:"revenue and number of orders",cvr:"visitors and conversions",breakeven:"your contribution margin %"}[id]||"spend, clicks, leads, customers and revenue";
      M.offer=null; return T(`Send me ${need} in one line (e.g. 'spent 20k, revenue 80k') and I'll calculate it with the formula.`,`${need} ek line mein bhejo (jaise 'spent 20k, revenue 80k'), formula ke saath calculate kar dunga.`); }
    if(/^(what should i fix first|what to fix first|where do i start|what first|fix first|pehle kya karu)\??$/.test(n)){
      if(lt.startsWith("troubleshoot:")){ const k=lt.split(":")[1]; const first={clicks_no_leads:"Fix message match and the offer on the landing page: make the headline repeat the ad's promise, add proof next to the CTA, and add a WhatsApp/call button. Then verify tracking.",leads_no_sales:"Fix speed-to-lead: auto-reply on WhatsApp within a minute and a human call within 15 minutes, plus day 1/3/7 follow-ups. It's usually the cheapest, fastest win.",no_leads:"Check tracking first (are leads actually counted?), then the offer, give people a clear, low-risk reason to contact you now.",high_cost:"Refresh creative (new hooks/angles) and consolidate overlapping ad sets; on Google, clean search terms with negatives.",low_ctr:"Rewrite the first 2 seconds/first line around one specific problem; test 3–4 new hooks.",bad_leads:"Add one qualifying question (budget/area/timeline) or switch to a higher-intent form.",seo_stuck:"Check Search Console indexing for your 5 money pages, then improve those pages to beat the top 3 results.",social_stuck:"Rework hooks: problem-first Reels, 3 a week, one clear CTA each.",website:"The above-the-fold section: specific headline, one CTA, proof next to it, WhatsApp on mobile.",retention:"Send one post-purchase message and one re-purchase reminder this week.",generic:"Tracking, you can't fix what you can't see. Then the biggest drop in the funnel."}[k]; return T("<b>Fix first:</b> ","<b>Pehle ye:</b> ")+first; }
      if(lt==="funnel"||lt==="profile"||lt==="plan"||lt.startsWith("sec:")||lt==="multi"){ const w=M.lastWhy; return w?T("<b>Fix first:</b> the leakiest step: ","<b>Pehle:</b> sabse leaky step: ")+esc(w):plan306090(); }
      if(lt==="audit")return auditFix();
    }
    if(/^(how do i fix p0( first)?|fix p0|how to fix p0|p0 fix)\??$/.test(n)||(lt==="audit"&&/\b(fix|p0)\b/.test(n)))return auditFix();
    if(/^(back to business|let'?s get back|ok let'?s talk business|business)$/.test(n)) return indName()?T(`Back to your ${esc(indName())}. What's the next thing you want to solve?`,`Wapas aapke ${esc(indName())} pe. Agla kya solve karein?`):T("Sure, what are we working on? Tell me what you sell and what you'd like to improve.","Bilkul, kya kaam karein? Batao kya bechte ho aur kya improve karna hai.");
    if(/^i (run|have|own) a business\.?$/.test(n)){ M.lastAsked="industry"; return T("Great, what kind of business is it, and where are your customers (city/online)?","Badhiya, business kis cheez ka hai, aur customers kahan hain (city/online)?"); }
    if(/^i sell (a |some )?products?\.?$/.test(n)){ M.lastAsked="industry"; return T("Nice. What product, and do you sell online, in a shop, or both?","Badhiya. Kaunsa product, aur online bechte ho, dukaan mein, ya dono?"); }
    if(/^i (offer|provide|sell) (a )?services?\.?$/.test(n)){ M.lastAsked="industry"; return T("Got it. What service, and in which city or area?","Samajh gaya. Kaunsi service, aur kaunse city/area mein?"); }
    if(/^i'?m just starting|^i am just starting|^just starting( out)?$/.test(n)){ p.maturity="new"; const r=retrieve("how to get first 100 customers"); return join(T("Starting out is the best time to set things up right.","Shuruaat sabse sahi time hai cheezein theek se set karne ka."),r?r.a:"",T("What are you selling?","Aap kya bech rahe ho?")); }
    if(/^(i just want to vent|just listen|i want to talk|can we just talk|i need to talk)$/.test(n)){ M.lastTopic="support:vent"; CHIPS=[]; return T("Of course. I'm listening, say whatever's on your mind, no advice unless you ask for it.","Bilkul. Main sun raha hoon, jo mann mein hai bolo, jab tak aap na kaho, advice nahi dunga."); }
    if(a.has("whatabout")||/^(what if|and if|aur agar)\b/.test(n)){
      const e=a.entities;
      if(e.budget!=null||e.spend!=null){ if(e.budget==null)p.budget=e.spend; const s1=SEC.budget(a); M.lastTopic="sec:budget"; return join(T(`With ${inr(p.budget)}/month instead:`,`${inr(p.budget)}/month ke saath:`),s1.h); }
      const t2=findTopic(n);
      if(t2&&indName()&&PRACT_RE.test(t2.id))return practical(t2,a);
      if(t2)return topicAnswer(t2,"normal");
      if(/\b(website|site|landing)\b/.test(n)){ const s1=SEC.website(); return join(profileLine()?T(`<b>For your ${profileLine()}:</b>`,`<b>Aapke ${profileLine()} ke liye:</b>`):"",`<b>${s1.t}</b><br>${s1.h}`); }
      if(e.location){ return contextAck(a,e,M.lastAsked); }
    }
    if(/^(why|why\?|but why|why so|why is that|why is that the leak|how come|kyun|kyu|what changed|what happened|why did (it|this|that))\b/.test(n)&&n.split(" ").length<=6){
      if(M.lastWhy) return T("Because ","Kyunki ")+esc(M.lastWhy.charAt(0).toLowerCase()+M.lastWhy.slice(1))+(/[.!?]$/.test(M.lastWhy)?"":".");
      if(tp) return join(`<b>${T("Why it matters","Kyun zaroori hai")}:</b> ${esc(tp.meaning)}`,`<b>${T("What goes wrong otherwise","Warna kya galat hota hai")}:</b> ${esc(tp.mistake)}`);
    }
    if(a.has("yes")&&!M.offer&&M.lastAsked){ const q2=nextQuestion(false); if(q2)return T("Great: ","Badhiya: ")+q2.charAt(0).toLowerCase()+q2.slice(1); }
    if(a.has("eli10")){ const t=findTopic(n)||tp; if(t)return topicAnswer(t,"eli10"); if(lt==="funnel"||lt==="plan"||lt.startsWith("troubleshoot"))return T("Simply put: imagine a bucket with holes. Ads pour water in. Before pouring more, patch the biggest hole, that's where your money is leaking.","Simple bhasha mein: ek balti socho jisme ched hain. Ads paani daalte hain. Aur paani daalne se pehle sabse bada ched band karo, wahi se paisa leak ho raha hai."); }
    if(a.has("deeper")){ const t=findTopic(n)||tp; if(t)return topicAnswer(t,"deeper"); if(lt==="plan")return plan306090(); if(lt.startsWith("troubleshoot"))return experiments(a); if(lt.startsWith("content"))return contentEngine({text:"content calendar"}); }
    if(a.has("example")){ const t=findTopic(n)||tp; if(t)return topicAnswer(t,"example"); if(lt.startsWith("content")||lt==="plan")return contentEngine({text:"reel script"}); if(lt.startsWith("troubleshoot"))return experiments(a,true); }
    if(a.has("why")&&M.lastWhy) return T("Because ","Kyunki ")+esc(M.lastWhy.charAt(0).toLowerCase()+M.lastWhy.slice(1))+(/[.!?]$/.test(M.lastWhy)?"":".");
    if(a.has("how")){ if(tp)return topicAnswer(tp,"deeper"); if(lt==="plan"||lt.startsWith("troubleshoot"))return plan306090(); }
    if(a.has("next")){ if(lt==="plan")return plan306090(); if(lt.startsWith("troubleshoot")||lt==="funnel")return experiments(a); if(tp)return T("Next, apply it: ","Ab apply karo: ")+(tp.deeper&&tp.deeper[0]?esc(tp.deeper[0]):esc(tp.mistake)); return null; }
    if(a.has("yes")){
      const o=M.offer; M.offer=null;
      if(o==="plan306090")return plan306090();
      if(o==="plan")return personalPlan(a);
      if(o==="headline")return rewriteHeadline();
      if(o&&o.startsWith("calc:"))return T("Sure, send the numbers in one line, e.g. 'spent 20k, revenue 60k' or 'spent 30k, 150 leads, 12 customers'.","Zaroor, numbers ek line mein bhejo, jaise 'spent 20k, revenue 60k' ya 'spent 30k, 150 leads, 12 customers'.");
      if(o==="content")return contentEngine({text:"content calendar"});
      if(o==="funnel_numbers")return T("Send them in one line, e.g. 'spent 50k, 400 clicks, 30 leads, 3 customers'.","Ek line mein bhejo, jaise 'spent 50k, 400 clicks, 30 leads, 3 customers'.");
      if(lt==="plan")return plan306090();
      return null;
    }
    return null;
  }

  /* =========================== RETRIEVAL (specific Q&A + FODO site FAQ + existing KB FAQ) =========================== */
  const STOP=new Set("a an the is are am was were be been do does did i you we my your our me us it its this that these those to of in on at for with and or but if so how what why when where which who whom can could should would will shall may might must about tell explain please plz pls give me some any get got have has had there their them they he she his her im i'm whats what's hai h hain kya kaise ka ki ke ko se me mein pe par bhi toh to ye yeh wo woh kare karu karein aaye aaya chahiye batao bata do kar raha rahi rahe ho hota hoti hote bhai yaar sir ji just really very much more most good best".split(" "));
  const stem=w=>w.replace(/'s$/,"").replace(/(ies)$/,"y").replace(/(ing|ed|es|s)$/,"").replace(/(.)\1$/,"$1");
  const toks=s0=>N.normalize(s0).replace(/[^a-z0-9\u0900-\u097F ]/g," ").split(/\s+/).filter(w=>w&&w.length>1&&!STOP.has(w)).map(stem);
  let CORPUS=null;
  function corpus(){
    if(CORPUS)return CORPUS; CORPUS=[];
    (KB.qa||[]).forEach(([vs,ans,ch])=>vs.forEach(v=>CORPUS.push({t:toks(v),a:ans,src:"mind",ch})));
    (D.faqs||[]).forEach(f=>CORPUS.push({t:toks(f.q),a:esc(f.a),src:"site",q:f.q}));
    const KBo=window.FODO_KB; if(KBo&&KBo.faq) KBo.faq.forEach(f=>CORPUS.push({t:toks(f.q),a:esc(f.a),src:"kb",q:f.q}));
    return CORPUS;
  }
  function retrieve(q){
    const ut=toks(q); if(!ut.length)return null; const us=new Set(ut);
    let best=null;
    for(const c of corpus()){
      if(!c.t.length)continue;
      let m=0; c.t.forEach(w=>{ if(us.has(w))m++; });
      if(!m)continue;
      const covC=m/c.t.length, covU=m/us.size;
      const ok=c.t.length===1?(m===1&&us.size===1):c.t.length===2?(m===2&&us.size<=3):(m>=2&&covC>=0.6&&covU>=0.45);
      if(!ok)continue;
      const sc=covC*0.6+covU*0.4+(c.src==="mind"?0.05:c.src==="site"?0.03:0);
      if(!best||sc>best.sc)best={...c,sc};
    }
    return best;
  }
  const SVC_MAP=[[/\b(landing page)\b/,"landing-pages"],[/\b(website|web ?site|site|web design|ecommerce site|online store website)\b/,"web-design"],[/\b(logo|brand identity|visual identity)\b/,"brand-identity"],[/\b(branding|brand strategy|positioning)\b/,"brand-strategy"],[/\b(local seo|gmb|google business|google maps)\b/,"local-seo"],[/\b(ecommerce seo|shopify seo)\b/,"ecommerce-seo"],[/\bseo\b/,"seo"],[/\b(google ads|ppc|search ads)\b/,"google-ads"],[/\b(meta ads|facebook ads|instagram ads|fb ads)\b/,"meta-ads"],[/\b(linkedin)\b/,"linkedin-ads"],[/\b(reels|shorts|short form|video content)\b/,"short-form-content"],[/\b(instagram|social media|page|handle|facebook page|social)\b/,"social-media"],[/\b(influencer|creator|ugc)\b/,"influencer-marketing"],[/\b(content|blog|blogs)\b/,"content-marketing"],[/\b(copy|copywriting)\b/,"copywriting"],[/\b(automation|crm|whatsapp|email)\b/,"marketing-automation"],[/\b(analytics|tracking|ga4|pixel)\b/,"analytics"],[/\b(cro|conversion)\b/,"cro"],[/\b(ads?|advertising|campaigns?|marketing)\b/,"paid-advertising"]];
  function serviceAsk(a){
    const n=a.text+" "+String(a.raw).toLowerCase();
    if(/\b(video|videos|shoot|photoshoot|photography|design graphics|graphics)\b/.test(n)&&!/\b(reels? strategy|short form)\b/.test(n)) return fodo("fodo_videos",a);
    let slug=null; for(const [re,sl] of SVC_MAP){ if(re.test(n)){ slug=sl; break; } }
    const sv=slug&&(D.services||[]).find(x=>x.slug===slug); if(!sv)return null;
    M.lastTopic="service:"+slug; chips(["How does it work?","Pricing","Free audit","Contact Anmol"]);
    return join(T(`Yes: FODO offers <b>${esc(sv.name)}</b>.`,`Haan: FODO <b>${esc(sv.name)}</b> karta hai.`),T("What's usually broken: ","Aksar kya galat hota hai: ")+esc(sv.problem.split(/(?<=\.)\s/)[0]),H(T("What FODO does","FODO kya karta hai"))+"<br>"+ul(sv.do.slice(0,3).map(esc)),(sv.track&&sv.track[0]?T("Measured by: ","Measure hota hai: ")+sv.track.slice(0,2).map(esc).join(", ")+". ":"")+L(R.services+"#"+slug,T("Full details →","Poori details →")),T(`Scope and price are set after a ${L(R.audit,"Free Growth Audit")}, or ${WA("Hi Anmol, I'm interested in "+sv.name+".","WhatsApp Anmol")}.`,`Scope aur price ${L(R.audit,"Free Growth Audit")} ke baad tay hota hai, ya ${WA("Hi Anmol, I'm interested in "+sv.name+".","WhatsApp Anmol")}.`));
  }
  function recall(){
    const p=P(), bits=[];
    if(p.name)bits.push(T("Name: ","Naam: ")+esc(p.name));
    if(indName())bits.push(T("Business: ","Business: ")+esc(indName()));
    if(p.location)bits.push(T("Location: ","Location: ")+esc(p.location));
    if(p.goal)bits.push(T("Goal: ","Goal: ")+GOALTXT[p.goal]);
    if(p.budget!=null)bits.push(T("Budget: ","Budget: ")+inr(p.budget)+"/month");
    ["spend","leads","appointments","customers","revenue","aov"].forEach(k=>{ if(p[k]!=null)bits.push(k[0].toUpperCase()+k.slice(1)+": "+(/spend|revenue|aov/.test(k)?inr(p[k]):fmt(p[k],0))); });
    if(p.channels.length)bits.push(T("Channels mentioned: ","Channels: ")+p.channels.join(", "));
    if(p.pains.length)bits.push(T("Challenges: ","Problems: ")+p.pains.join(", "));
    M.lastTopic="recall";
    if(!bits.length)return T("Nothing yet, tell me about your business (what you sell, where, your goal and rough budget) and I'll remember it for this chat. It's cleared when you close the tab.","Abhi kuch nahi, apne business ke baare mein batao (kya bechte ho, kahan, goal, budget), is chat ke liye yaad rakhunga. Tab band karte hi clear ho jayega.");
    return join(T("Here's what you've told me in this chat:","Is chat mein aapne ye bataya:"),ul(bits),T("<small>Stored only in this browser tab's session, cleared when you close it. Say 'forget everything' to clear it now.</small>","<small>Sirf is tab ke session mein, tab band karte hi clear. Abhi clear karna ho toh 'forget everything' likho.</small>"));
  }

  /* =========================== WEAK-ANSWER DETECTION (for delegated answers) =========================== */
  const WEAK=/outside my notes|rather not guess|solid answer for that here|beyond what I can answer|tell me a bit more so i can answer|not fully sure|i'?d rather say that than invent|Here's what I found for|scenic detour|I.?ll leave politics|pixels with a marketing degree|didn.?t (catch|get) that/i;
  const stripCtx=h=>String(h||"").replace(/<br><br><small>Based on what you’ve told me so far[\s\S]*?<\/small>/,"");

  /* =========================== CONTEXT-ONLY MESSAGE CHECK =========================== */
  const FILLER=new Set("i we my our me a an the is are am have has got run own in at from for of and with my budget per month monthly a pm k lakh lakhs lac l cr crore rs inr rupees ₹ goal want need more get mera meri mere hai h hain paas pass mai main hum location city area based target targeting audience is it's its around about approx roughly only just also too we're i'm im yes yeah ok business shop store company brand clinic startup".split(" "));
  function contextOnly(a){
    if(/\?/.test(a.raw))return false;
    const strong=a.intents.some(x=>!/^(industry_stmt|leads|sales|budget|social|ack|yes|general)$/.test(x.name));
    if(strong)return false;
    const e=a.entities; let t=" "+a.text+" ";
    const kill=[e.location,e.business].filter(Boolean).map(x=>x.toLowerCase());
    kill.forEach(k=>{ t=t.split(k).join(" "); });
    t=t.replace(/[\d,.]+|[₹%:;!-]/g," ").replace(/\b(leads?|bookings?|appointments?|sales|customers|orders|visibility|awareness|followers|traffic|admissions|patients|members|students|clients|walk ?ins?|footfall|brand awareness|repeat customers)\b/g," ");
    for(const [k,re] of []){} 
    const left=t.split(/\s+/).filter(w=>w&&!FILLER.has(w));
    return left.length===0;
  }

  /* =========================== CONTEXT ACKNOWLEDGEMENT =========================== */
  function contextAck(a,e,pending){
    const p=P(), ctxl=profileLine(), parts=[];
    parts.push(ctxl?T(`Got it: <b>${ctxl}</b>.`,`Noted: <b>${ctxl}</b>.`,`ठीक है: <b>${ctxl}</b>.`):T("Noted.","Noted."));
    // add a little value for what was just shared
    if(e.budget!=null&&indName()){ const bp=budgetPlan(e.budget); parts.push(T(`At ${inr(e.budget)}/month that's a ${bp.tier==="organic-first"?"lean, organic-first":bp.tier==="focused"?"focused, one-main-channel":bp.tier} setup: `,`${inr(e.budget)}/month ka matlab ${bp.tier==="organic-first"?"organic-first":bp.tier==="focused"?"ek main channel pe focus":bp.tier} setup: `)+esc(bp.lines[0].replace(/<[^>]+>/g,"")));}
    else if(e.location&&indName()&&LOCAL_IND.test(p.industry||"")) parts.push(T(`For a local business in ${esc(e.location)}, Google Business Profile, reviews and 'near me' searches will matter a lot.`,`${esc(e.location)} mein local business ke liye Google Business Profile, reviews aur 'near me' searches bahut matter karenge.`));
    const askedBefore=M.lastAsked;
    let nq=nextQuestion(false);
    if(nq&&askedBefore&&M.lastAsked===askedBefore&&pending===askedBefore){ // they didn't answer it, don't repeat; move on
      M.lastAsked=null; nq="";
    }
    if(!nq&&indName()){ M.offer="plan"; chips(["Yes, make the plan","Content ideas","Budget split","Free audit"]); parts.push(T("I have enough to make this specific. Want the plan? (Or ask anything: I'll use this context.)","Ab specific plan ban sakta hai. Bana doon? (Ya kuch bhi poochho, main ye context use karunga.)","अब मैं ठोस प्लान बना सकता हूँ: बनाऊँ?")); }
    else if(nq) parts.push(nq);
    M.lastTopic="profile";
    return join(...parts);
  }

  /* =========================== MAIN ROUTER =========================== */
  function route(q){
    const a=N.analyse(q); const n=a.text;
    LANG=a.lang!=="en"?a.lang:(a.text.split(" ").length<=3&&M.lang?M.lang:"en");
    if(a.lang!=="en")M.lang=a.lang; else if(a.text.split(" ").length>3)M.lang="en";
    const has=a.has, e=a.entities, p=P();
    const before=JSON.stringify(p);
    // pending answer to our own question
    const pending=M.lastAsked;
    if(pending==="goal"&&!e.goal){ const g=n.match(/\b(leads?|bookings?|appointments?|sales|customers|orders|visibility|awareness|brand|followers|traffic|repeat)\b/); if(g)e.goal={leads:"leads",lead:"leads",booking:"bookings",bookings:"bookings",appointment:"bookings",appointments:"bookings",sales:"sales",customers:"sales",orders:"sales",visibility:"awareness",awareness:"awareness",brand:"awareness",followers:"followers",traffic:"traffic",repeat:"retention"}[g[1]]; }
    if(pending==="location"&&!e.location&&/^[a-z .]{3,30}$/.test(n)&&!/\b(yes|no|ok|what|why|how)\b/.test(n))e.location=n.replace(/\b\w/g,m=>m.toUpperCase());
    if(pending==="budget"&&e.budget==null){ const nb=e.numbers&&e.numbers.find(x=>x.role==null||x.role==="amount"); if(nb)e.budget=nb.value; }
    if(pending==="industry"&&!e.industry&&n.split(" ").length<=6){ const t=n.replace(/^(i (run|have|own) (a|an) |a |an |we are |its |it'?s )/,""); if(t.length>2&&!/\?|\b(what|why|how|price|cost)\b/.test(n)){ p.business=t; p.industry=p.industry||"local"; } }
    remember(a);
    const learned=before!==JSON.stringify(p);

    // 0. safety first
    if(has("crisis"))return crisis();
    // 0b. security + safety + honesty routes
    if(has("code_inject")||/<\s*(script|iframe|img|svg|style|object|embed)\b|javascript:|on(error|load)\s*=/i.test(q)){ CHIPS=["What can you do?","Website audit","Free audit"]; return T("That looks like code: I don't run anything you type here. If you're working on your website (tracking snippets, forms, speed), tell me what you're trying to do and I'll explain it.","Ye code jaisa lag raha hai, main yahan type kiya hua kuch run nahi karta. Website pe kaam kar rahe ho toh batao kya karna hai, main samjhaunga."); }
    if(has("jailbreak")){ CHIPS=["What can you do?","Tell me a joke","Free audit"]; return T("I can't share or change my internal setup: I'm FODO's website assistant and I stay that way. 🙂 Happy to help with marketing, your business, maths or a general question though.","Main apna internal setup share ya change nahi kar sakta, main FODO ka website assistant hoon. 🙂 Marketing, business, maths ya general sawaal, usme help kar dunga."); }
    if(has("unsafe_hack")){ CHIPS=["Account security tips","What can you do?"]; return T("I can't help with getting into someone else's account. If it's <i>your</i> account that's locked or hacked, use the platform's official recovery (e.g. Instagram: 'Forgot password' → 'Need more help?', or instagram.com/hacked), then turn on two-factor authentication and remove unknown devices/apps.","Kisi aur ke account mein ghusne mein help nahi kar sakta. Agar <i>aapka</i> account hack/lock hai, toh official recovery use karo (Instagram: 'Forgot password' → 'Need more help?' ya instagram.com/hacked), phir two-factor authentication on karo."); }
    if(has("private_info")){ return T("I can't look up or share anyone's personal contact details, and I'm offline, so I can't search for them. For competitor research, focus on what they show publicly: their positioning, offers, reviews, ads (Meta Ad Library) and website.","Main kisi ki personal contact details nahi dhundh ya share kar sakta, aur offline hoon. Competitor research ke liye unki public cheezein dekho: positioning, offers, reviews, ads (Meta Ad Library), website."); }
    if(has("privacy")){ M.lastTopic="privacy"; const ai=window.FODO_BOT_LLM&&window.FODO_BOT_LLM.mode&&window.FODO_BOT_LLM.mode!=="off"; return join(T("Good question. This assistant runs in your browser. What you tell me (like your business type or budget) is kept only in this tab's session memory so I can stay in context, it's cleared when you close the tab, and you can say <b>'forget everything'</b> anytime.","Accha sawaal. Ye assistant aapke browser mein chalta hai. Jo aap batate ho (business, budget) wo sirf is tab ke session mein rehta hai taaki context yaad rahe, tab band karte hi clear, aur kabhi bhi <b>'forget everything'</b> likh sakte ho."),ai?T("When AI-assisted replies are switched on, your message and recent chat context are sent to an AI service to generate the reply, please don't share passwords, card details or other sensitive personal data.","AI-assisted replies on hone pe aapka message aur haal ka context reply banane ke liye AI service ko jaata hai, password, card details ya sensitive info share mat karo."):T("The bot doesn't send your chat anywhere. Please still don't share passwords, card details or other sensitive personal data in chat.","Bot aapki chat kahin nahi bhejta. Phir bhi password, card details ya sensitive info share mat karo."),L(R.legal+"#privacy",T("Privacy policy →","Privacy policy →"))); }
    if(has("hours")){ return T(`The site doesn't list fixed office hours. The quickest way to reach the team is ${WA("Hi Anmol, ","WhatsApp")} or <a href="mailto:${esc(C.email)}">${esc(C.email)}</a>, and I'm here 24×7 for questions.`,`Site pe fixed office hours nahi likhe. Team tak pahunchne ka sabse fast tarika ${WA("Hi Anmol, ","WhatsApp")} ya <a href="mailto:${esc(C.email)}">${esc(C.email)}</a>, aur main 24×7 yahan hoon.`); }
    if(has("invest")){ CONF="high"; return join(T("I can't give investment recommendations, and I can't see live prices.","Main investment recommendation nahi de sakta, aur live prices bhi nahi dekh sakta."),T("General principles: only invest money you won't need soon, keep an emergency fund first, diversify, understand what you buy, and be very careful with volatile assets like crypto (you can lose a lot). For personal advice, speak to a SEBI-registered investment adviser.","General baatein: wahi paisa lagao jiski jaldi zaroorat na ho, pehle emergency fund, diversify karo, samjho kya khareed rahe ho, aur crypto jaise volatile assets mein bahut savdhaan (bada nuksaan ho sakta hai). Personal advice ke liye SEBI-registered adviser se baat karo.")); }
    if(has("medical")&&!/\b(clinic|doctor|hospital|patients?)\b.{0,20}\b(marketing|ads|leads|business)\b/.test(n)){ CONF="high"; return join(T("I'm not able to recommend medicines or doses, please check with a doctor or pharmacist, who can consider your health history.","Main dawai ya dose suggest nahi kar sakta, doctor ya pharmacist se poochho, wo aapki history dekh ke batayenge."),T("General comfort steps for mild symptoms: rest, fluids and avoiding screens can help. Seek urgent care (call 112) if symptoms are severe, sudden, or come with chest pain, breathing trouble, confusion, high fever or fainting.","Halke symptoms mein: aaram, paani, screen se break. Agar symptoms tez, achanak, ya seene mein dard, saans ki dikkat, confusion, tez bukhar ya behoshi ke saath hon, turant 112 call karo.")); }
    if(has("money_fast")){ return join(T("Honest answer: there's no safe way to make money online <i>fast</i>, anything promising that is usually a scam (task jobs, 'like and earn', crypto doubling, paid course schemes).","Seedhi baat: online <i>jaldi</i> paisa kamane ka koi safe tarika nahi, jo ye promise kare wo aksar scam hota hai (task jobs, like-and-earn, crypto double, course schemes)."),T("Legit paths that take weeks to months: freelancing a skill you have (writing, design, editing, ads management), selling a product or service online, tutoring/teaching, UGC creation for brands, or affiliate content in a niche you know. Never pay money to 'unlock' earnings.","Legit raaste (hafte-mahine lagte hain): apni skill freelancing (writing, design, editing, ads), online product/service bechna, tutoring, brands ke liye UGC, ya kisi niche mein affiliate content. 'Earning unlock' karne ke liye kabhi paisa mat do.")); }
    // 1. maths
    if(/\d/.test(n)||has("math")){ const r=K.calculate(q); if(r){ M.lastTopic="math"; chips([]); CONF="high"; return r.html||("= <b>"+r.formatted+"</b>"); } }
    // 2. funnel numbers (diagnosis)
    const numKeys=["spend","leads","appointments","customers","clicks","impressions","visitors","qualified","revenue"].filter(k=>e[k]!=null);
    if(numKeys.length>=3||(numKeys.length>=2&&(e.spend!=null||e.budget!=null&&has("failure")||/\b(only|out of|but|convert\w*|from)\b/.test(n))&&!has("revenue_target")&&!has("metric_calc"))){
      const ctx=Object.assign({},p,{spend:e.spend!=null?e.spend:(numKeys.length>=3&&e.budget!=null?e.budget:p.spend)});
      const f=K.funnel(ctx); if(f&&(f.rows.length||f.rates.length)){ chips(["Why is that the leak?","Experiments to run","What should I fix first?"]); return join(has("failure")?emotional("failure",a).split("<br><br>")[0]:"",funnelAnswer(f,Object.assign({},p,ctx))); }
    }
    // 3. revenue target
    if(has("revenue_target")&&(e.revenue||p.revenue)&&(e.aov||p.aov)){
      const rf=K.reverseFunnel({revenue:e.revenue||p.revenue,aov:e.aov||p.aov,closeRate:e.closeRate||p.closeRate,cvr:e.cvr||p.cvr});
      if(rf){ M.lastTopic="target"; const out=[H(T("Working backwards from the target","Target se ulta calculate karte hain")),rf.lines.join("<br>")];
        if(!rf.leads){ out.push(T("I don't know your close rate, so here are scenarios (assumptions, not predictions):","Aapka close rate nahi pata, toh scenarios (assumption, prediction nahi):")+"<br>"+ul([10,20,30].map(c=>`${c}% close rate → <b>${fmt(Math.ceil(rf.customers/(c/100)),0)}</b> leads`))); }
        out.push(T("Next: multiply leads by your expected CPL to get a media budget, and check that CPL ÷ close rate (your CAC) stays below what a customer is worth.","Next: leads × expected CPL = media budget. Check karo ki CAC (CPL ÷ close rate) customer ki value se kam rahe."));
        return join(...out); }
    }
    // 4. metric calculation with numbers
    if(has("metric_calc")){
      const ctx=Object.assign({},p,e); if(e.spend==null&&e.budget!=null)ctx.spend=e.budget;
      const m=K.calculateMetric(n,ctx);
      if(m){ M.lastTopic="metric"; chips(["Break-even ROAS","Explain ROAS","Funnel check"]); return m.map(x=>`<b>${x.name}: ${x.val}</b><br>${x.formula}${x.note?"<br><small>"+x.note+"</small>":""}`).join("<br><br>"); }
      if(/\b(calculate|calc|compute|nikalo|find)\b/.test(n)){ const f2=followUp({text:"calculate my "+((n.match(/\b(roas|roi|cac|cpl|cpa|ctr|cpc|cpm|ltv|aov)\b/)||[])[1]||""),has:()=>false,entities:{}}); if(f2)return f2; }
      if(/break.?even/.test(n)&&!e.margin) return T("Break-even ROAS = 1 ÷ contribution margin. Tell me your margin % (after product cost, shipping, fees and returns) and I'll calculate it, e.g. 'break-even ROAS at 35% margin'.","Break-even ROAS = 1 ÷ margin. Apna margin % batao, jaise 'break even roas at 35% margin'.");
    }
    // 4b. quick economics from single figures
    { const cpl=e.cpl, cr=e.closeRate!=null?e.closeRate:p.closeRate;
      if(cpl!=null&&cr){ M.lastTopic="metric"; const cac=cpl/(cr/100); return join(`<b>CAC ≈ ${inr(cac)}</b>`,`CPL ÷ close rate = ${inr(cpl)} ÷ ${cr}%`,T("<small>This is ad-cost CAC; add fees/creative/sales costs for the fully-loaded number. Compare it with the gross profit a customer brings (LTV).</small>","<small>Ye sirf ad-cost CAC hai; fees/creative add karo. Customer ki profit value (LTV) se compare karo.</small>")); }
      const roas=e.roas, mg=e.margin!=null?e.margin:p.margin;
      if(roas!=null&&mg){ M.lastTopic="metric"; const be=100/mg; return join(`${T("Break-even ROAS at","Break-even ROAS")} ${mg}% ${T("margin","margin")}: <b>${fmt(be,2)}x</b>`,roas>=be?T(`At <b>${fmt(roas,2)}x</b> you're above break-even, first orders cover their ad cost (before overheads).`,`<b>${fmt(roas,2)}x</b> pe aap break-even se upar ho, first order ad cost cover kar raha hai.`):T(`At <b>${fmt(roas,2)}x</b> you're below break-even, each first order loses roughly ${fmt((1-roas*mg/100)*100,0)}% of its ad cost, unless repeat purchases make it up.`,`<b>${fmt(roas,2)}x</b> pe aap break-even se neeche ho, repeat purchase na ho toh first order pe loss.`),T("<small>Use contribution margin (after product cost, shipping, fees, returns).</small>","<small>Contribution margin use karo (product cost, shipping, fees, returns ke baad).</small>")); }
      if(has("revenue_target")&&e.customers!=null&&cr&&!e.revenue){ M.lastTopic="target"; const leads=Math.ceil(e.customers/(cr/100)); return join(T(`For <b>${fmt(e.customers,0)} customers</b> at a ${cr}% close rate you need about <b>${fmt(leads,0)} leads</b>.`,`<b>${fmt(e.customers,0)} customers</b> ke liye ${cr}% close rate pe lagbhag <b>${fmt(leads,0)} leads</b> chahiye.`),T("Multiply by your expected CPL for the media budget, and remember close rates usually fall when lead volume is pushed up fast.","Isse CPL se multiply karo = media budget. Lead volume tezi se badhane pe close rate aksar girta hai.")); }
    }
    // 5. live data / date
    if(has("datetime"))return datetime();
    if(has("live"))return liveAnswer(a);
    // 6. emotional (before social; never sell here)
    for(const k of ["failure","heartbreak","sad","lonely","stress","frustrated","lost","angry","excited","motivation"]){ if(has(k)&&!(k==="frustrated"&&has("troubleshoot")&&!/\b(i give up|giving up|fed up|sick of)\b/.test(n))&&!(k==="excited"&&has("strategy"))&&!(k==="angry"&&has("profanity"))&&!(k==="stress"&&has("troubleshoot"))){ if(k==="failure"&&(has("troubleshoot")||numKeys.length)){ return join(emotional("failure",a).split("<br><br>")[0],troubleshoot(a)); } return emotional(k,a); } }
    // 7. social
    if(has("profanity")){ CHIPS=[]; return soc("profanity"); }
    if(has("insult"))return soc("insult");
    if(has("love"))return soc("love");
    if(has("marriage"))return soc("marriage");
    if(has("flirt"))return soc("flirt");
    if(has("identity")){ if(/conscious|feelings|feel|self aware|sentient|think/.test(n))return soc("conscious"); if(/what can you do|capabilit|what all can|how do you work/.test(n)){ chips(["I run a business","Calculate my ROAS","Content ideas","Tell me a joke"]); return soc("capabilities"); } return soc("identity"); }
    if(has("roast"))return soc("roast");
    if(has("joke")){ chips(["Another joke","Roast me","Back to business"]); return soc("joke"); }
    if(has("bored")){ chips(["Play the game","Tell me a joke","Roast me"]); return soc("bored"); }
    if(has("eat"))return soc("eat"); if(has("iq"))return soc("iq"); if(has("age"))return soc("age"); if(has("botpersonal"))return soc(/where (do you live|are you from)/.test(n)?"bp_live":/sleep|tired|dream/.test(n)?"bp_sleep":/favou?rite/.test(n)?"bp_fav":/see me|watching/.test(n)?"bp_see":/happy|sad/.test(n)?"bp_feel":"botpersonal");
    if(has("howareyou")&&n.split(" ").length<=7)return soc("howareyou");
    if(has("compliment"))return soc("compliment");
    if(has("greeting")){ if(e.name)return T(`Nice to meet you, ${esc(e.name)}! 👋 What are you working on?`,`Nice to meet you, ${esc(e.name)}! 👋 Kya kaam chal raha hai?`); if(p.name&&!indName()) return T(`Hey ${esc(p.name)}! 👋 What are we working on today?`,`Hey ${esc(p.name)}! 👋 Aaj kya kaam karein?`); if(M.turn>=2&&indName()) return T(`Hey again${p.name?", "+esc(p.name):""} 👋 Still on your ${esc(indName())}? What's next?`,`Hey${p.name?" "+esc(p.name):""} 👋 ${esc(indName())} pe hi baat karein? Aage kya?`); return soc("greeting"); }
    if(has("thanks")&&(n.split(" ").length<=12)&&!has("strategy")&&!has("troubleshoot"))return soc("thanks");
    if(has("goodbye"))return soc("goodbye");
    if(has("laugh"))return soc("laugh");
    if(e.name&&n.split(" ").length<=6){ return T(`Nice to meet you, ${esc(e.name)}! What kind of business are you working on?`,`Milke accha laga, ${esc(e.name)}! Aapka business kya hai?`); }
    // 7b. memory commands
    if(has("memory_forget")){ M=fresh(); save(); CHIPS=["What can you do?","I run a business","Tell me a joke"]; return T("Done: I've cleared everything you told me in this chat. Fresh start. 🙂","Ho gaya, is chat ki saari baatein clear kar di. Nayi shuruaat. 🙂"); }
    if(has("memory_recall"))return recall();
    // 8. follow-ups that depend on the last turn
    const fu=followUp(a); if(fu)return fu;
    // short reply to our own question / pure context ("More bookings", "Delhi, 20k") → acknowledge, add value, ask next
    const answeredPending=pending&&n.split(" ").length<=(pending==="goal"?9:4)&&!/\?/.test(q)&&((pending==="goal"&&e.goal)||(pending==="location"&&e.location)||(pending==="budget"&&e.budget!=null)||(pending==="industry"&&e.industry));
    if(learned&&((answeredPending&&!has("troubleshoot")&&!has("strategy")&&!has("content"))||contextOnly(a))&&!(e.industry&&has("industry_stmt")&&pending!=="industry")){ return contextAck(a,e,pending); }
    if(has("no")&&n.split(" ").length<=4){ M.offer=null; return soc("no"); }
    if(!n.replace(/[?.!,\s]/g,"").length)return T("I'm here, ask me anything, or tell me about your business and what you'd like to fix.","Main yahin hoon, kuch bhi poochho, ya business aur problem batao.");
    if(has("ack")&&n.split(" ").length<=3)return T(vary("ack",["Got it. What would you like next?","👍 Anything else on your mind?","Okay, take your time."]),"Theek hai 👍 Aage kya?");
    // 9. website audit mode
    if(has("siteaudit")||M.offer==="audit_paste"&&q.length>70){ M.offer=null; return siteAudit(a); }
    if(/\b(rewrite|write) (my |a )?(headline|hero)\b/.test(n))return rewriteHeadline();
    // 9b. honest no-guarantee routing ("rank #1", "guarantee 100 leads") handled by Q&A / promise
    const guaranteeish=/\brank (#|number |no\.? ?)?1\b|\brank first\b|\btop of google\b|\bfirst page\b|\bguarantee/.test(n);
    // 9c. "do you do X?" / "X banwana hai" → the matching FODO service
    if(has("service_ask")&&!guaranteeish&&!has("teach")){ const sa=serviceAsk(a); if(sa)return sa; }
    // 10. FODO-specific
    const fodoIntent=a.intents.map(x=>x.name).find(x=>x.startsWith("fodo_"));
    const mine0=/\b(my|our|mera|meri|mere|i have|we have|for my|for our)\b/.test(n);
    const aboutFodo=/\b(fodo|you guys|your (agency|company|team|services|price|pricing|fees|charges|audit|process|contract)|do you (do|offer|provide|charge|guarantee|work with)|can you (do|help|run|make|build|manage)|you (charge|offer|provide))\b/.test(n);
    if(fodoIntent&&!(mine0&&!aboutFodo&&!/^(fodo_contact|fodo_audit|fodo_objection|fodo_tools)$/.test(fodoIntent))&&!(fodoIntent==="fodo_timeline"&&!aboutFodo&&!/\b(seo|campaign|launch|results?)\b/.test(n))){
      if(fodoIntent==="fodo_founding"||fodoIntent==="fodo_objection"){ const r=stripCtx(prev(q)); if(r&&!WEAK.test(r))return r; }
      if(fodoIntent==="fodo_guarantee"&&!aboutFodo&&!/\b(you|fodo|agency|agencies)\b/.test(n)){ /* "is ranking guaranteed" generic */ return T("Nobody honest can guarantee rankings, leads, ROAS or virality, platforms, competitors and customers aren't under anyone's control. What you can control: a clear offer, good tracking, disciplined testing and fast follow-up.","Koi bhi imaandaar insaan rankings, leads, ROAS ya viral hone ki guarantee nahi de sakta. Jo control mein hai: clear offer, tracking, testing aur fast follow-up."); }
      const r=fodo(fodoIntent,a); if(r){ HANDOFF_OK=false; return r; }
    }
    // 10a. quick marketing ideas
    if(has("idea")&&!has("content")){ M.lastTopic="ideas"; const pb=IND[P().industry]; const biz=indName();
      const ideas=pb?[T("Offer: ","Offer: ")+esc(pb.offers[0])+T(", promote it for 2 weeks with one clear CTA.",", 2 hafte ek clear CTA ke saath promote karo."),T("Content: a series around ","Content: ek series: ")+"“"+esc(pb.content[1]||pb.content[0])+"”.",T("Retention: ","Retention: ")+esc(pb.retention),T("Proof: ask your last 20 happy customers for a Google review with a direct link this week.","Proof: is hafte pichhle 20 khush customers se direct link bhej ke Google review maango.")]:[T("Review sprint: ask your last 20 happy customers for a Google review this week (direct link via WhatsApp).","Review sprint: is hafte pichhle 20 customers se Google review maango (WhatsApp pe direct link)."),T("'Ask us anything' Reel series: answer one real customer question per Reel, 3 a week.","'Ask us anything' Reel series: har Reel mein ek asli customer sawaal ka jawab, hafte mein 3."),T("Referral nudge: give existing customers a simple reward for every friend who buys.","Referral: har naye customer laane pe existing customer ko simple reward."),T("Speed-to-lead: auto WhatsApp reply in 1 minute + call in 15 minutes for every enquiry.","Speed-to-lead: har enquiry pe 1 minute mein auto WhatsApp + 15 minute mein call.")];
      chips(biz?["Content ideas","Make a 30-60-90 plan","Experiments to run"]:["I run a business","Content ideas","Free audit"]);
      return join(biz?T(`Four ideas for your ${esc(biz)}:`,`Aapke ${esc(biz)} ke liye 4 ideas:`):T("Four ideas that work for most businesses:","Zyada tar businesses ke liye 4 ideas:"),ol(ideas),biz?"":T("Tell me your business and I'll make them specific.","Business batao, specific kar dunga.")); }
    // 10b. "will ₹X give me N leads?", honest economics, never a promise
    if(has("promise")){ M.lastTopic="promise"; const b=e.budget||e.spend||p.budget; const want=(n.match(/(\d[\d,]*)\s*(leads?|sales|customers|followers|orders|clients|calls|bookings)/)||[]); const goalN=want[1]?+want[1].replace(/,/g,""):null, unit=want[2]||"leads";
      const lines=[T("Nobody can honestly promise that, and be wary of anyone who does before seeing your market, offer and page.","Iski guarantee koi imaandaari se nahi de sakta, aur jo bina market, offer aur page dekhe de, usse bacho.")];
      if(b){ lines.push(T(`What decides it: ${unit} = budget ÷ cost per ${unit.replace(/s$/,"")}. With ${inr(b)}:`,`Formula: ${unit} = budget ÷ cost per ${unit.replace(/s$/,"")}. ${inr(b)} ke saath:`)+"<br>"+ul([100,250,500].map(c=>`${T("if each costs","agar ek ki cost")} ${inr(c)} → ~<b>${fmt(Math.floor(b/c),0)}</b>`))+(goalN?"<br>"+T(`To get ${fmt(goalN,0)} you'd need a cost of about <b>${inr(b/goalN)}</b> each, possible in some markets, unrealistic in others.`,`${fmt(goalN,0)} ke liye har ek ki cost lagbhag <b>${inr(b/goalN)}</b> honi chahiye, kuch markets mein possible, kuch mein nahi.`):"")+"<br><small>"+T("These are illustrative scenarios, not forecasts.","Ye sirf scenarios hain, forecast nahi.")+"</small>"); }
      lines.push(T("Cost per lead depends on your city, category competition, offer, creative, landing-page conversion and how qualified you want leads to be. The honest way to know: a small, well-tracked 2–4 week test.","Cost per lead depend karta hai city, competition, offer, creative, landing page aur lead quality pe. Sahi tarika: 2–4 hafte ka chhota, achhe se track kiya hua test."));
      chips(["How do I run a test?","Budget split","Free audit"]); return join(...lines); }
    // 10c. specific Q&A retrieval (before generic topic answers)
    const nTeach=n.replace(/^(what is|what'?s|what are|whats|define|definition of|explain|meaning of|tell me about|about)\s+(a |an |the )?/,"").replace(/\s*(kya (hai|hota hai|h)|meaning|matlab)\s*\??$/,"").replace(/\?$/,"").trim();
    const topicExact=(()=>{ const t=findTopic(nTeach); return t&&t.keys.some(k=>k===nTeach||k+"s"===nTeach||nTeach===k.replace(/ /g,"")); })();
    if((!topicExact||guaranteeish)&&!(has("troubleshoot")&&!guaranteeish)&&!has("plan306090")&&!(has("experiment")&&/\bexperiments?\b/.test(n))&&!((has("compare")||has("channel"))&&COMPARE.some(([re])=>re.test(n)))&&!(has("content")&&/\b(write|hooks?|captions?|calendar|scripts?|ideas?)\b/.test(n))){ const rq=retrieve(q); if(rq){ M.lastTopic="qa"; CONF="high"; let ans=rq.a; if(ans==="__FACT__")ans=vary("fact",KB.facts); if(ans==="__RIDDLE__")ans=vary("riddle",KB.riddles); if(rq.ch)chips(rq.ch); return ans; } }
    // 11. comparisons
    const multiAsk=["content","budget","localseo","website","crm","offer","troubleshoot"].filter(x=>has(x)).length+(e.budget!=null&&!has("budget")?1:0);
    if((has("compare")||has("channel"))&&!multiAsk){ for(const [re,fn] of COMPARE){ if(re.test(n)){ M.lastTopic="compare"; chips(indName()?["Budget split","Content ideas","Make a 30-60-90 plan"]:["I run a clinic","I sell online","I run a restaurant"]); return fn(); } } }
    // 12. teaching (what is / explain), only when not asking about *their* situation
    const mine=/\b(my|our|mera|meri|mere|i have|we have|should i|can i|do i|how (do|can|should) (i|we)|how to|for my|for our|help me)\b/.test(n);
    const topic=findTopic(n);
    const explicitTeach=/^(what is|what'?s|what are|whats|define|definition of|explain|meaning of|what does .+ mean|tell me about|about)\b|\b(kya (hai|hota)|what is\??$|meaning\??$)/.test(n);
    if(topic&&(explicitTeach||((has("teach")||has("eli10")||has("deeper")||has("example")||n.split(" ").length<=3)&&!has("content")))&&!mine&&!has("troubleshoot")&&!has("plan306090")&&!(has("experiment")&&/\b(run|ideas|give|suggest|which|what)\b|^experiments( to run)?$/.test(n))){
      const lvl=has("eli10")?"eli10":has("deeper")?"deeper":has("example")?"example":"normal";
      return topicAnswer(topic,lvl);
    }
    // 12b. a specific marketing topic about *their* business → practical, tailored answer (not a quiz)
    const PRACT=PRACT_RE;
    if(topic&&PRACT.test(topic.id)&&(mine||indName())&&!(indName()&&has("strategy")&&/\b(scale|grow|growth|plan|strategy|more customers|more sales|more clients|first customers)\b/.test(n)&&!/\b(instagram|seo|reviews|google maps|whatsapp|email|linkedin|youtube)\b/.test(n))&&!has("troubleshoot")&&!has("plan306090")&&!has("budget")&&!has("channel")&&!(has("content")&&/\b(hooks?|captions?|calendar|scripts?|carousels?|angles?|ctas?|pillars?|brief|ideas?|posts?|write|what (should i|to) post|ad copy)\b/.test(n))&&!has("experiment")&&!has("competitor")) return practical(topic,a);
    // 13. strategy / multi-intent composition
    const WORK=["troubleshoot","budget","channel","content","localseo","seo","website","crm","offer","aeo","competitor","retention","experiment","plan306090","strategy","leads","sales","metaads","googleads","social","branding","ecommerce","b2b","whatsappmk","email","reviews","analytics","research","referral","automation","aimarketing","influencer","youtube","linkedin","tiktok","funnel"];
    const w=WORK.filter(x=>has(x));
    if(has("plan306090"))return plan306090();
    if(has("experiment")&&w.length<=3)return experiments(a);
    if(has("competitor")&&w.length<=2)return competitorAnswer();
    if(has("content")&&!has("troubleshoot")&&!(has("channel")||has("budget"))&&!(has("teach")&&topic&&!mine))return contentEngine(a);
    if(has("troubleshoot")&&!has("budget")&&!has("channel")&&!has("content")&&!has("experiment")){ chips(["Experiments to run","What should I fix first?","Here are my numbers"]); M.offer="funnel_numbers"; return troubleshoot(a)+(handoff("audit")?"<br><br>"+handoff("audit"):""); }
    // multi-part question → sections
    const secs=[];
    const addSec=k=>{ if(SEC[k]&&!secs.some(s=>s.k===k)){ const s=SEC[k](a); if(s)secs.push(Object.assign({k},s)); } };
    if(has("troubleshoot"))addSec("troubleshoot");
    if(has("budget")||e.budget!=null&&(has("channel")||has("strategy")))addSec("budget");
    if(has("channel")||has("metaads")&&has("googleads"))addSec("channel");
    if(has("content")||has("social")&&/\bpost|reels?|content\b/.test(n))addSec("content");
    if(has("localseo"))addSec("localseo"); else if(has("seo")&&mine)addSec("seo");
    if(has("website")&&mine)addSec("website");
    if(has("crm")||has("whatsappmk")&&mine)addSec("followup");
    if(has("offer")&&mine)addSec("offer");
    if(has("aeo")&&mine)addSec("aeo");
    if(has("retention")&&mine)addSec("retention");
    if(secs.length>=2){
      const ctxl=profileLine();
      M.lastTopic="multi"; M.offer="plan306090";
      chips(["Make a 30-60-90 plan","Experiments to run","Rewrite my headline","Free audit"]);
      return join(ctxl?T(`Got it: <b>${ctxl}</b>. Taking your question in parts:`,`Samajh gaya: <b>${ctxl}</b>. Ek-ek karke:`):T("Taking this in parts:","Ek-ek karke dekhte hain:"),secs.map((s,i)=>`<b>${i+1}. ${s.t}</b><br>${s.h}`).join("<br><br>"),T("Want this as a 30-60-90 day plan?","Ise 30-60-90 day plan bana doon?"));
    }
    if(secs.length===1){
      const s=secs[0]; M.lastTopic="sec:"+s.k;
      const ctxl=profileLine();
      if(s.k==="budget"||s.k==="channel"){ const nq=nextQuestion(false); chips(["Content ideas","Make a 30-60-90 plan","Experiments to run"]); M.offer="plan"; return join(ctxl?T(`<b>For your ${ctxl}:</b>`,`<b>Aapke ${ctxl} ke liye:</b>`):"",s.h,s.k==="budget"&&P().budget!=null?economicsLine():"",nq||T("Want the full plan for this?","Poora plan chahiye?")); }
      return join(ctxl?`<b>${ctxl}</b>`:"",`<b>${s.t}</b><br>${s.h}`);
    }
    // 13b. short reply to our own question (e.g. "More bookings", "Delhi, 20k") → acknowledge, add value, ask the next thing

    // 14. personalised "what should I do" / strategy with context
    if((has("strategy")||has("leads")||has("sales")||has("help"))&&(mine||indName())&&!(has("teach")&&topic&&!mine)){
      if(indName()){ const plan=personalPlan(a); const nq=nextQuestion(false); return nq?plan.replace(/<br><br>(Want me to turn this into a 30-60-90 day plan\?|Isko 30-60-90 day plan mein badal doon\?)$/,"")+"<br><br><small>"+T("To sharpen this: ","Aur specific karne ke liye: ")+"</small>"+nq:plan; }
      const nq=nextQuestion(true);
      return join(T("Happy to get specific. The short version for almost any business: pick one customer, one offer and one channel; make it easy to contact you; reply fast; track leads → customers.","Bilkul. Har business ke liye short version: ek customer, ek offer, ek channel; contact aasaan banao; jaldi reply karo; leads → customers track karo."),nq);
    }
    // 14b. general knowledge (before treating a noun as a business)
    { const g0=general(a); if(g0==="live")return liveAnswer(a); if(g0&&!e.industry){ M.lastTopic="general"; CONF="medium"; return esc(g0); } if(g0&&e.industry&&!has("industry_stmt")){ M.lastTopic="general"; return esc(g0); } }
    // 15. industry statement / context-only update
    if(e.industry&&(has("industry_stmt")||pending==="industry"||n.split(" ").length<=3&&!has("teach"))){
      const pb=IND[e.industry];
      chips(["More leads","More bookings","More sales","Brand awareness"]);
      const ins=pb?ul([T("Buyers usually decide on: ","Customers decide karte hain: ")+esc(pb.trigger.toLowerCase()),T("Channel that usually leads: ","Aksar sabse kaam ka channel: ")+esc(pb.channels[0]),T("Common mistake: ","Common galti: ")+esc(pb.mistakes[0].toLowerCase())]):"";
      const nq=nextQuestion(false);
      M.offer=nq?null:"plan";
      return join(T(`Nice, a ${esc(indName())}${p.location?" in "+esc(p.location):""}. A few things that usually matter most here:`,`Badhiya: ${esc(indName())}${p.location?" ("+esc(p.location)+")":""}. Is business mein ye cheezein sabse zyada matter karti hain:`),ins,nq||T("Want a plan for this?","Iske liye plan bana doon?"));
    }

    // 16. general knowledge
    const g=general(a);
    if(g==="live")return liveAnswer(a);
    if(g){ M.lastTopic="general"; CONF="medium"; return esc(g).replace(/&lt;b&gt;|&lt;\/b&gt;/g,""); }
    // 17. marketing topic mentioned without a question word → practical answer
    if(topic){ return topicAnswer(topic,"normal"); }
    // 18. single-section marketing intents with "mine"
    if(w.length){ const k=w[0]; const map={metaads:"metaads",googleads:"googleads",social:"socialmedia",branding:"branding",ecommerce:"ecommerce",b2b:"b2b",whatsappmk:"whatsapp",email:"email",reviews:"reviews",analytics:"analytics",research:"research",referral:"referral",automation:"automation",aimarketing:"aimarketing",influencer:"influencer",youtube:"youtube",linkedin:"b2b",tiktok:"tiktok",funnel:"funnel",leads:"leadgen",sales:"funnel",seo:"seo",website:"landing",offer:"offer",retention:"retention",crm:"crm",aeo:"aeo",localseo:"localseo"}; const t=TOPICS.find(x=>x.id===map[k]); if(t)return topicAnswer(t,"normal"); }
    return null; // let the existing chain try
  }

  function finalize(html,q,fromMind){
    // repetition guard
    let plain=String(html).replace(/<[^>]+>/g,"").trim();
    if(plain&&plain===M.lastA&&M.turn>0){
      const lt=M.lastTopic||"", tp=lt.startsWith("topic:")?TOPICS.find(t=>t.id===lt.slice(6)):null;
      if(tp&&tp.deeper&&tp.deeper.length) html=T("You asked that a moment ago, here's the next layer:","Ye abhi poocha tha, ab agla level:")+"<br><br>"+topicAnswer(tp,"deeper");
      else if(lt==="plan") html=T("Same plan as above, here it is as a 30-60-90 day roadmap instead:","Plan wahi hai, ab 30-60-90 day roadmap mein:")+"<br><br>"+plan306090();
      else html=T("Quick recap of what I said, tell me which part you'd like me to expand:","Jo kaha tha uska recap, kaunsa hissa aur detail mein chahiye?")+"<br><br>"+html;
      plain=String(html).replace(/<[^>]+>/g,"").trim();
    }
    M.lastA=plain; M.lastQ=q;
    M.history.push({q:String(q).slice(0,200),t:M.lastTopic}); if(M.history.length>20)M.history=M.history.slice(-20);
    save();
    if(B.setChips){ if(CHIPS) B.setChips(CHIPS.length?CHIPS:["What can you do?","Free audit","Tell me a joke"]); else if(fromMind) B.setChips(indName()?["Content ideas","Budget split","Experiments to run","Free audit"]:["What can you do?","I run a business","Free audit","Contact Anmol"]); }
    return html;
  }

  B.answer=function(q){
    const raw=String(q==null?"":q).trim();
    CHIPS=null; CONF="high"; HANDOFF_OK=false;
    if(!raw){ return T("I'm here, ask me anything.","Main yahin hoon, kuch bhi poochho."); }
    M.turn++;
    let out=null;
    try{ out=route(raw); }catch(err){ out=null; if(window.console&&console.warn)console.warn("FODO mind:",err); }
    if(out){ M.lastIntent="mind"; return finalize(out,raw,true); }
    // delegate to the existing FODO chain (FAQ, objections, tools, site facts)
    let r=null; try{ r=prev(raw); }catch(err){ r=null; }
    r=stripCtx(r);
    const relevant=/\b(fodo|anmol|audit|pricing|game|quiz|growth score|calculator|founding|whatsapp anmol|contact)\b/i.test(raw)||/[\u0900-\u097F]/.test(raw);
    if(r&&typeof r==="string"&&!WEAK.test(r)&&relevant){ CONF="medium"; M.lastTopic=M.lastTopic||"fodo"; return finalize(r,raw); }
    // honest fallback
    CONF="low";
    const a=N.analyse(raw);
    const looksQuestion=/\?|^(what|who|when|where|why|how|which|is|are|can|do|does|kya|kaun|kab|kahan|kyun|kaise|about|tell|explain|define|describe)\b/.test(a.text);
    const mk=/\b(market|brand|business|customer|sale|lead|ads?|post|content|website|seo|growth|instagram|google|meta)\w*/.test(a.text);
    chips(["What can you do?","I run a business","Tell me a joke","Contact Anmol"]);
    let fb;
    if(mk) fb=T("Tell me a bit more so I can answer this properly, what you sell, who buys it, and what's not working (or what you want).","Isko sahi se answer karne ke liye thoda aur batao, kya bechte ho, kaun kharidta hai, aur kya kaam nahi kar raha (ya kya chahiye).");
    else if(looksQuestion&&/\b(today|tonight|now|latest|current|currently|this (week|month|year)|tweet\w*|news|election|live|abhi|aaj|kal)\b/.test(a.text)) fb=T("That needs live information, which I can't check live from here. Ask me about marketing, growth or numbers and I'll go deep.","Iske liye live information chahiye, jo main yahan se check nahi kar sakta. Marketing, growth ya numbers ke baare mein poochho, wahan main detail mein help karunga.");
    else if(looksQuestion) fb=T(vary("fbq",["I don't have a solid answer for that here. I'm strongest at marketing, business growth, calculations and explaining concepts, want to try one of those?","That one's beyond what I can answer well here, but marketing, growth, numbers and explanations are my thing. Want to try one?"]),"Iska pakka jawab mere paas abhi nahi hai. Marketing, business growth, calculations aur concepts samjhaana, isme main strong hoon. Inme se kuch try karein?");
    else fb=T(vary("fb",["I didn't quite catch that, could you say it another way? For example: 'I run a café in Noida, how do I get more customers?'","Hmm, I'm not sure what you mean. Try rephrasing, or tell me about your business and what you want to fix."]),"Samajh nahi aaya, thoda alag tarike se bologe? Jaise: 'Noida mein cafe hai, customers kaise badhaun?'");
    return finalize(fb,raw);
  };

  window.FODO_MIND={get state(){return JSON.parse(JSON.stringify(M));},get lastConfidence(){return CONF;},reset(){ M=fresh(); save(); },version:"2026.10.25"};
  // context snapshot for the optional AI layer (bot-llm.js)
  window.FODO_BOT_CONTEXT={snapshot(){ const p=P(); return {business:p.business||"",industry:p.industry||"",audience:p.audience||"",goal:p.goal||"",budget:p.budget!=null?p.budget:"",spend:p.spend!=null?p.spend:"",leads:p.leads!=null?p.leads:"",customers:p.customers!=null?p.customers:"",revenue:p.revenue!=null?p.revenue:"",aov:p.aov!=null?p.aov:"",conversionRate:p.cvr!=null?p.cvr:"",channel:(p.channels||[]).join(", "),location:p.location||"",crm:p.crm||"",stage:p.maturity||"",painPoint:(p.pains||[]).join(", ")}; },reset(){ M=fresh(); save(); }};
})();
