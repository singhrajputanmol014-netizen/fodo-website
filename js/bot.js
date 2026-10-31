/* FODO Bot, free, rules-based assistant. Answers from site data (services, FAQs, industries, tools, contact), Hinglish-aware, hands off to WhatsApp/audit. No external API. */
(function(){
  const U=window.FODO_UTIL, C=window.FODO, D=window.FODO_DATA, R=U.routes, e=U.esc; if(!U||!D)return;
  const route=document.body.dataset.route;
  const pick=a=>a[Math.floor(Math.random()*a.length)];
  const norm=s=>s.toLowerCase().replace(/[^\w\s@.]/g," ").replace(/\s+/g," ").trim();
  // Hinglish / synonym map → canonical tokens
  const SYN={"kitna":"cost","kitne":"cost","rate":"cost","price":"cost","pricing":"cost","charge":"cost","charges":"cost","fees":"cost","paisa":"cost","paise":"cost","budget":"cost","kharcha":"cost","mehnga":"cost","sasta":"cost",
    "ads":"ad","advertising":"ad","advertisement":"ad","campaign":"ad","campaigns":"ad","paid":"ad","promotion":"ad","chalate":"ad","chalaoge":"ad",
    "insta":"instagram","ig":"instagram","fb":"facebook","meta":"meta","reels":"short-form","reel":"short-form","video":"short-form","videos":"short-form","shorts":"short-form","tiktok":"tiktok",
    "google":"google","search":"seo","ranking":"seo","rank":"seo","seo":"seo","website":"web","site":"web","web":"web","landing":"landing","page":"landing",
    "whatsapp":"whatsapp","wa":"whatsapp","call":"call","phone":"call","number":"call","contact":"contact","email":"contact","mail":"contact","address":"address","office":"address","location":"address","kahan":"address","where":"address",
    "audit":"audit","free":"audit","consultation":"audit","consult":"audit","review":"audit",
    "game":"game","challenge":"game","play":"game","khel":"game","quiz":"quiz","score":"score","calculator":"roi","roi":"roi",
    "start":"start","shuru":"start","begin":"start","kaise":"how","how":"how","process":"how","kya":"what","what":"what","karte":"what","services":"service","service":"service","kaam":"service",
    "brand":"brand","logo":"brand","branding":"brand","content":"content","blog":"content","social":"social","influencer":"influencer","automation":"automation","crm":"automation","analytics":"analytics","tracking":"analytics","ga4":"analytics",
    "time":"timeline","timeline":"timeline","kab":"timeline","din":"timeline","days":"timeline","weeks":"timeline","month":"timeline","results":"results","result":"results","guarantee":"guarantee","guaranteed":"guarantee",
    "contract":"contract","agreement":"contract","lockin":"contract","founder":"founder","anmol":"founder","who":"who","kaun":"who","team":"who","about":"who","fodo":"who","matlab":"who","meaning":"who",
    "ecommerce":"ecommerce","shopify":"ecommerce","d2c":"ecommerce","store":"ecommerce","clinic":"healthcare","doctor":"healthcare","hospital":"healthcare","dentist":"healthcare","property":"real-estate","realestate":"real-estate","builder":"real-estate","startup":"startups","saas":"saas","software":"saas","restaurant":"local-business","cafe":"local-business","salon":"local-business","gym":"local-business","shop":"local-business","local":"local-business","personal":"personal-brands","coach":"personal-brands","creator":"personal-brands",
    "founding":"founding","partner":"founding","offer":"founding","discount":"founding","hi":"hi","hello":"hi","hey":"hi","namaste":"hi","thanks":"thanks","thank":"thanks","shukriya":"thanks","ok":"thanks","bye":"thanks"};
  const DEV={"कीमत":"cost","दाम":"cost","कितना":"cost","कितने":"cost","रेट":"cost","प्राइस":"cost","बजट":"cost","ऐड":"ad","एड":"ad","विज्ञापन":"ad","सेवा":"service","सेवाएं":"service","सर्विस":"service","क्या":"what","कैसे":"how","शुरू":"start","कौन":"who","कहाँ":"address","कहां":"address","पता":"address","संपर्क":"contact","फोन":"call","नंबर":"call","गेम":"game","खेल":"game","ऑडिट":"audit","फ्री":"audit","मुफ्त":"audit","वेबसाइट":"web","गारंटी":"guarantee","समय":"timeline","कब":"timeline","नमस्ते":"hi","हेलो":"hi","धन्यवाद":"thanks","शुक्रिया":"thanks","लीड":"leads","लीड्स":"leads","सेल":"sales","सेल्स":"sales","ग्राहक":"sales","क्लिनिक":"healthcare","डॉक्टर":"healthcare","दुकान":"local-business","रेस्टोरेंट":"local-business","प्रॉपर्टी":"real-estate","स्टार्टअप":"startups","ब्रांड":"brand","कंटेंट":"content","सोशल":"social"};
  const toks=s=>s.toLowerCase().replace(/[^\w\s@.\u0900-\u097F]/g," ").replace(/\s+/g," ").trim().split(" ").map(w=>DEV[w]||SYN[w]||w);
  const L=(href,txt)=>`<a href="${href}">${txt}</a>`;
  const svc=slug=>D.services.find(s=>s.slug===slug);
  const svcLine=s=>`<b>${e(s.name)}</b>: ${e(s.problem.split(".")[0])}. ${L(R.services+"#"+s.slug,"Read more →")}`;
  const WA=m=>`<a href="${U.wa(m)}" target="_blank" rel="noopener noreferrer">WhatsApp Anmol →</a>`;
  const handoff=`Want a human? ${WA("Hi Anmol, I was chatting with the FODO bot and have a question: ")} or ${L(R.audit,"book a free growth audit →")}`;
  const HI={
    hi:"नमस्ते! मैं FODO Bot हूँ। सर्विस, प्राइसिंग, फ्री ऑडिट या गेम: कुछ भी पूछिए।",
    thanks:"शुक्रिया! और कुछ चाहिए तो WhatsApp पर अनमोल से बात करें।",
    cost:"FODO की कोई फिक्स्ड प्राइस लिस्ट नहीं है: स्कोप चैनल, क्रिएटिव और गोल पर निर्भर है; ऐड-स्पेंड हमेशा आपके अपने अकाउंट से जाता है। सबसे तेज़ रास्ता: फ्री ग्रोथ ऑडिट → स्कोप्ड प्रपोज़ल।",
    founding:"Founding Clients Programme: दिल्ली-NCR के पहले पार्टनर ब्रांड्स के लिए फाउंडिंग टर्म्स: अनमोल के साथ सीधा काम, हर हफ्ते नंबर, कोई लॉक-इन नहीं।",
    audit:"फ्री ग्रोथ ऑडिट में हम आपकी वेबसाइट, SEO, ऐड्स, सोशल, कंटेंट और ट्रैकिंग देखते हैं: फिर कॉल पर बताते हैं पहले क्या ठीक करना है। कोई ऑटोमेटेड स्कैन नहीं, कोई ज़बरदस्ती नहीं।",
    game:"FODO Challenge: 4 राउंड, करीब 2 मिनट। 40 से कम स्कोर पर फ्री 30-मिनट स्ट्रैटेजी सेशन मिलता है।",
    quiz:"मार्केटिंग क्विज़: 10 सवाल, हर जवाब की समझ के साथ।",
    score:"ग्रोथ स्कोर: 10 सवालों का सेल्फ-असेसमेंट (0–100): आपका सबसे बड़ा मौका और सबसे बड़ा रिस्क दिखाता है।",
    roi:"ग्रोथ कैलकुलेटर: ₹ में स्पेंड, विज़िटर, कन्वर्ज़न रेट डालिए: अनुमानित सीनारियो तुरंत दिखेगा।",
    whatsapp:"कॉल या WhatsApp कीजिए: ऊपर दिए नंबर पर अनमोल सीधे जवाब देंगे।",
    address:"FODO का मुख्यालय नई दिल्ली, भारत में है; हम रिमोट-फ़र्स्ट तरीके से भारत और पूरी दुनिया के ब्रांड्स के साथ काम करते हैं।",
    contact:"ईमेल, फोन या WhatsApp: जो आसान हो, उससे संपर्क करें।",
    founder:"FODO यानी Fear Of Digitally Out: नई दिल्ली की इंडिपेंडेंट ग्रोथ एजेंसी, फाउंडर अनमोल सिंह (फिल्म/मीडिया प्रोडक्शन, कंटेंट, बिज़नेस डेवलपमेंट और मार्केटिंग का अनुभव)।",
    how:"शुरुआत आसान है: फ्री ऑडिट → स्कोप्ड प्रपोज़ल → काम शुरू। काम 6-स्टेज ग्रोथ सिस्टम से चलता है।",
    guarantee:"सच यह है: मार्केटिंग रिज़ल्ट की गारंटी कोई नहीं दे सकता। हम टारगेट तय करते हैं, पारदर्शी टेस्ट करते हैं और हर हफ्ते रिपोर्ट देते हैं।",
    timeline:"आम तौर पर किकऑफ से पहला कैंपेन 2–3 हफ्ते में लाइव; SEO में असली असर महीनों में दिखता है।",
    contract:"ज़्यादातर काम 3 महीने के स्प्रिंट से शुरू होता है, फिर महीने-दर-महीने, 30 दिन के नोटिस पर। हर अकाउंट और एसेट आपका रहता है।",
    service:"हम 20 सर्विसेज़ देते हैं: पेड मीडिया, SEO, कंटेंट, सोशल, ब्रांड, वेब/CRO और ऑटोमेशन। अपना गोल बताइए (लीड्स, सेल्स, विज़िबिलिटी), मैं सही सर्विस बताऊँगा।",
    leads:"ज़्यादा लीड्स के लिए: Google Ads (इंटेंट) या Meta Ads (डिमांड) + एक फोकस्ड लैंडिंग पेज + फॉलो-अप ऑटोमेशन।",
    sales:"ज़्यादा सेल्स के लिए: पहले फनल ठीक करें (CRO), फिर Meta/Google से डिमांड बढ़ाएँ और ऑटोमेशन से रिटेंशन।",
    svc:"इस सर्विस के बारे में पूरी जानकारी लिंक पर है: या सीधे फ्री ऑडिट बुक करें।",
    ind:"आपकी इंडस्ट्री के लिए हमारा अप्रोच और सुझाई गई सर्विसेज़ ऊपर हैं: डिटेल इंडस्ट्री पेज पर।",
    faq:"(ऊपर FAQ का जवाब है। और सवाल हो तो पूछिए या WhatsApp करें।)",
    none:"माफ़ कीजिए, यह मुझे पक्का नहीं पता। WhatsApp पर अनमोल से पूछें या फ्री ग्रोथ ऑडिट बुक करें।"
  };
  const bi=(en,key)=>en+(HI[key]?`<span class="hi">${HI[key]}</span>`:"");
  // intent rules: [tokens any-of, handler]
  const rules=[
    [["hi"],()=>`Hi! I'm FODO Bot. Ask me about services, pricing, the free audit, or play the FODO Challenge. What are you working on?`],
    [["thanks"],()=>`Anytime. ${handoff}`],
    [["founding"],()=>`The <b>Founding Clients Programme</b> is our first cohort of NCR partner brands at founding terms, direct work with Anmol, weekly numbers, no lock-in. ${L(R.home+"#founding-panel","See slots →")} or ${L(R.audit,"apply →")}`],
    [["audit"],()=>`The <b>Free Growth Audit</b> is a human review of your website, SEO, paid media, social, content, conversion path and tracking, then a call on what to fix first. No automated scan, no obligation. ${L(R.audit,"Start the 5-step form →")}`],
    [["game"],()=>`<b>The FODO Challenge</b>: 4 rounds, ~2 minutes, spot the winning campaign, fix the funnel, save a campaign, then rapid-fire. Score under 40 and you earn a free 30-min strategy session. ${L(R.game,"Play now →")}`],
    [["quiz"],()=>`The <b>Marketing Quiz</b> is 10 shuffled questions with explanations. ${L(R.quiz,"Take it →")}`],
    [["score"],()=>`The <b>Growth Score</b> is a 10-question self-assessment (0–100) showing your biggest opportunity and risk. ${L(R.score,"Run it →")}`],
    [["roi"],()=>`The <b>Growth Calculator</b> runs illustrative scenarios in ₹, spend, visitors, conversion rate, lift. ${L(R.roi,"Open →")}`],
    [["whatsapp","call"],()=>`Call or WhatsApp <a href="tel:${C.phone}">${e(C.phoneDisplay)}</a> · ${WA("Hi Anmol, I'd like to talk about growing my business.")}`],
    [["address"],()=>`FODO is at ${e(C.address)}. We work with brands across Delhi NCR and remotely across India. ${L(R.contact,"Contact page →")}`],
    [["contact"],()=>`Email <a href="mailto:${C.email}">${C.email}</a>, phone <a href="tel:${C.phone}">${e(C.phoneDisplay)}</a>, or ${WA("Hi Anmol, I found FODO and would like to talk.")}`],
    [["founder","who"],()=>`<b>FODO = Fear Of Digitally Out</b>, an independent growth agency in New Delhi founded by <b>Anmol Singh</b>, with a background in film & media production, content, business development and marketing. ${L(R.about,"About →")} · ${L(R.about+"#founder","Founder →")}`],
    [["how","start"],()=>`Simple: ${L(R.audit,"free audit")} → scoped proposal → start. Work runs through the 6-stage Growth System (Discover → Diagnose → Strategize → Build → Launch → Optimize). ${L(R.about+"#growth-system","See the system →")}`],
    [["guarantee","results"],()=>`Honest answer: nobody can guarantee marketing results. We agree targets, test transparently and report weekly. Indicative benchmark ranges are on the ${L(R.home+"#main","home page")}; real numbers come from your audit.`],
    [["timeline"],()=>`Typically 2–3 weeks from kickoff to first live campaign; SEO shows meaningful movement over months, not days. Exact timelines are agreed in your proposal.`],
    [["contract"],()=>`Most engagements start with a 3-month sprint, then month-to-month with 30 days' notice. You own every account and asset, no lock-in.`],
    [["cost"],()=>`FODO doesn't publish fixed prices, scope depends on channels, creative needs and goals, and ad spend is always paid from your own accounts. The quickest way to a number: ${L(R.audit,"free growth audit →")} then a scoped proposal. Founding partners in Delhi NCR get founding-rate terms (${L(R.home+"#founding-panel","details")}).`],
    [["meta","facebook","instagram"],()=>svcLine(svc("meta-ads"))+" Also see "+L(R.services+"#social-media","Social Media")+"."],
    [["google"],()=>svcLine(svc("google-ads"))+" Organic? "+L(R.services+"#seo","SEO →")],
    [["short-form","tiktok"],()=>svcLine(svc("short-form-content"))+" Paid version: "+L(R.services+"#tiktok-ads","TikTok Ads →")],
    [["seo"],()=>svcLine(svc("seo"))+" Local business? "+L(R.services+"#local-seo","Local SEO →")+" Online store? "+L(R.services+"#ecommerce-seo","E-commerce SEO →")],
    [["landing"],()=>svcLine(svc("landing-pages"))+" Plus "+L(R.services+"#cro","CRO →")],
    [["web"],()=>svcLine(svc("web-design"))],
    [["ad"],()=>svcLine(svc("paid-advertising"))+" Channels: "+["meta-ads","google-ads","linkedin-ads","tiktok-ads"].map(s=>L(R.services+"#"+s,svc(s).name)).join(", ")],
    [["brand"],()=>svcLine(svc("brand-strategy"))+" and "+L(R.services+"#brand-identity","Brand Identity →")],
    [["content"],()=>svcLine(svc("content-marketing"))+" / "+L(R.services+"#copywriting","Copywriting →")],
    [["social"],()=>svcLine(svc("social-media"))],
    [["influencer"],()=>svcLine(svc("influencer-marketing"))],
    [["automation"],()=>svcLine(svc("marketing-automation"))],
    [["analytics"],()=>svcLine(svc("analytics"))],
    [["service","what"],()=>`We run 20 services across Paid Media, SEO, Content, Social, Brand, Web & CRO and Automation. Tell me your goal (leads, sales, visibility) or ${L(R.services,"browse all services →")}`],
  ];
  D.industries.forEach(i=>rules.unshift([[i.slug],()=>`For <b>${e(i.name)}</b>: ${e(i.approach)} Suggested: ${i.services.map(s=>L(R.services+"#"+s,svc(s).name)).join(", ")}. ${L(R.industries+"#"+i.slug,"Industry page →")}`]));
  const faqMatch=q=>{ const t=new Set(toks(q)); let best=null,bs=0; D.faqs.forEach(f=>{ const ft=new Set(toks(f.q+" "+f.a)); let s=0; t.forEach(x=>{ if(x.length>2&&ft.has(x))s++; }); if(s>bs){bs=s;best=f;} }); return bs>=2?best:null; };
  const KEYMAP={meta:"svc",facebook:"svc",instagram:"svc",google:"svc","short-form":"svc",tiktok:"svc",seo:"svc",landing:"svc",web:"svc",ad:"svc",brand:"svc",content:"svc",social:"svc",influencer:"svc",automation:"svc",analytics:"svc",what:"service",who:"founder",start:"how",results:"guarantee",call:"whatsapp"};
  function answer(q){ if(/how (are|r) (you|u)|kaise ho|kya haal|kaisa hai|whats up|what's up/i.test(q))q="mood"; else if(/\b(your|ur|tumhara|tumhra|tera|aapka|apka|bot ka) (name|naam)\b|\bwho are you\b|\b(tum|aap|ap) kaun\b/i.test(q))q="botname"; const t=toks(q); for(const [keys,h] of rules){ if(keys.some(k=>t.includes(k))){ const k=keys[0]; lastKey=k; const hk=HI[k]?k:(KEYMAP[k]||(D.industries.some(i=>i.slug===k)?"ind":k)); return bi(h(),hk); } } const f=faqMatch(q); if(f)return bi(`<b>${e(f.q)}</b><br>${e(f.a)}`,"faq"); const k=kb(q); if(k)return bi(k,"kb"); return bi(pick([`Hmm, that one's outside my notes. ${handoff}`,`Good question: I don't have a solid answer for that here. ${handoff}`]),"none"); }

  /* ---- UI ---- */
  // (B.answer assigned below once UI is ready)
  const btn=document.createElement("button"); btn.type="button"; btn.className="bot-fab"; btn.setAttribute("aria-label","Open FODO Bot chat"); btn.setAttribute("aria-expanded","false"); btn.innerHTML=`<span class="bot-av" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg><i class="bot-live"></i></span><span class="bot-fab-label">Ask FODO</span><span class="bot-hint" aria-hidden="true">Hi! 👋</span>`; if(window.FODO_MASCOT)btn.querySelector(".bot-av").appendChild(FODO_MASCOT.make("mfab"));
  const box=document.createElement("section"); box.className="bot-panel"; box.setAttribute("role","dialog"); box.setAttribute("aria-label","FODO Bot"); box.hidden=true;
  box.innerHTML=`<header><span class="bot-av bot-av-mark" aria-hidden="true"><b>O</b><i></i></span><div><b>FODO BOT</b><small>Online · chat saved only in this browser tab</small></div><button type="button" class="bot-new" aria-label="Start a new chat" title="New chat"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg></button><button type="button" class="bot-x" aria-label="Close chat">×</button></header>
  <div class="bot-log" id="bot-log" aria-live="polite"></div><div class="bot-chips" id="bot-chips"></div>
  <form class="bot-form" id="bot-form"><label class="skip" for="bot-in">Your message</label><input id="bot-in" autocomplete="off" maxlength="1200" placeholder="Ask in English or Hindi · हिंदी में पूछें…"><button class="btn sm" type="submit">Send</button></form>`;
  document.body.append(btn,box); if(window.FODO_MASCOT)box.querySelector("header .bot-av").appendChild(FODO_MASCOT.make("mhead"));
  const log=box.querySelector("#bot-log"), chips=box.querySelector("#bot-chips"), inp=box.querySelector("#bot-in");
  const add=(html,who)=>{ const d=document.createElement("div"); d.className="msg "+who; d.innerHTML=html; log.appendChild(d); log.scrollTop=log.scrollHeight; return d; };
  /* Chat memory: the conversation follows the visitor from page to page in this browser tab (sessionStorage, cleared when the tab closes or on "New chat"). */
  const LOGKEY="fodo-bot-log";
  const saveLog=()=>{ try{ const items=[...log.querySelectorAll(".msg")].filter(m=>!m.querySelector(".typing")).slice(-40).map(m=>({w:m.classList.contains("me")?"me":"bot",h:m.innerHTML})); sessionStorage.setItem(LOGKEY,JSON.stringify(items)); }catch(_){} };
  const loadLog=()=>{ try{ const items=JSON.parse(sessionStorage.getItem(LOGKEY)||"[]"); if(!Array.isArray(items)||!items.length)return false; items.forEach(it=>{ if(it&&typeof it.h==="string")add(it.h,it.w==="me"?"me":"bot"); }); return true; }catch(_){ return false; } };
  let restored=false; try{ restored=!!JSON.parse(sessionStorage.getItem(LOGKEY)||"[]").length; }catch(_){}
  const reduce=matchMedia("(prefers-reduced-motion:reduce)").matches;
  const botSay=(html,el,t0)=>{ if(window.FODO_MASCOT)FODO_MASCOT.set("think"); const d=el||add('<span class="typing"></span>',"bot"); const wait=reduce?0:Math.max(0,500-(t0?Date.now()-t0:0)); setTimeout(()=>{ d.innerHTML=html; saveLog(); try{ document.dispatchEvent(new CustomEvent("fodo:bot-reply",{detail:{el:d,html}})); }catch(_){} const lr=log.getBoundingClientRect(), dr=d.getBoundingClientRect(); if(dr.height>lr.height*0.75) log.scrollTop+=dr.top-lr.top-8; else log.scrollTop=log.scrollHeight; if(window.FODO_MASCOT)FODO_MASCOT.set("happy",1400); },wait); };
  const setChips=list=>{ chips.innerHTML=list.map(c=>`<button type="button">${c}</button>`).join(""); };
  const DEFAULT=["What do you do?","Pricing","Free audit","Play the game","Contact Anmol"]; const FOLLOW={cost:["Free audit","Founding programme","What do you do?"],leads:["Google Ads","Meta Ads","Landing pages","Free audit"],sales:["CRO","Meta Ads","Automation","ROI calculator"],seo:["Local SEO","E-commerce SEO","Content","Free audit"],game:["Play the game","Growth Score","Quiz"],help:["More leads","More sales","Brand visibility","Website problem"],marketing:["More leads","More sales","SEO","Ads"],yes:["More leads","More sales","SEO","Ads","Brand"]};
  let lastKey=""; const B=window.FODO_BOT={setChips,addChip(c){ if(!DEFAULT.includes(c))DEFAULT.splice(1,0,c); },get lastKey(){return lastKey;},set lastKey(v){lastKey=v;}};
  let lastQ="", lastAt=0;
  const ask=q=>{ const now=Date.now(); if(q===lastQ&&now-lastAt<1500)return; lastQ=q; lastAt=now; add(e(q),"me"); const chipsBefore=chips.innerHTML; const after=()=>{ if(chips.innerHTML===chipsBefore)setChips(FOLLOW[lastKey]||DEFAULT); };
    if(typeof B.answerAsync==="function"){ const t0=Date.now(), ph=add('<span class="typing"></span>',"bot"); if(window.FODO_MASCOT)FODO_MASCOT.set("think"); Promise.resolve().then(()=>B.answerAsync(q)).then(html=>{ botSay(html,ph,t0); after(); },()=>{ let html; try{ html=B.answer(q); }catch(err){ html="Sorry, something went wrong on my side. Please try again, or "+`<a href="${U.wa("Hi Anmol, ")}" target="_blank" rel="noopener noreferrer">WhatsApp Anmol →</a>`; } botSay(html,ph,t0); after(); }); return; }
    let html; try{ html=B.answer(q); }catch(err){ html="Sorry, something went wrong on my side. Please try again."; } botSay(html); after(); };
  B.ask=ask; B.ui={box,log,inp,add,form:box.querySelector("#bot-form")};
  chips.addEventListener("click",ev=>{ const b=ev.target.closest("button"); if(b)ask(b.textContent); });
  inp.addEventListener("focus",()=>setTimeout(vv,300));
  box.querySelector("#bot-form").addEventListener("submit",ev=>{ ev.preventDefault(); const q=inp.value.trim(); if(!q)return; inp.value=""; ask(q); if(isM())inp.focus(); });
  const isM=()=>matchMedia("(max-width:767px)").matches; let scrollY0=0;
  const vv=()=>{ if(!isM()||box.hidden)return; const h=(window.visualViewport?window.visualViewport.height:innerHeight); box.style.setProperty("--vvh",h+"px"); box.style.top=(window.visualViewport?window.visualViewport.offsetTop:0)+"px"; setTimeout(()=>{log.scrollTop=log.scrollHeight;},50); };
  if(window.visualViewport){ visualViewport.addEventListener("resize",vv); visualViewport.addEventListener("scroll",vv); }
  let opened=false; const open=B.open=()=>{ box.hidden=false; if(isM()){ scrollY0=scrollY; document.body.classList.add("bot-open"); document.body.style.top=(-scrollY0)+"px"; vv(); } btn.setAttribute("aria-expanded","true"); btn.classList.add("hide"); if(!opened){ opened=true; if(loadLog()){ setChips(DEFAULT); setTimeout(()=>{ log.scrollTop=log.scrollHeight; },30); } else greet(); } setTimeout(()=>inp.focus(),50); };
  const close=()=>{ box.hidden=true; if(document.body.classList.contains("bot-open")){ document.body.classList.remove("bot-open"); document.body.style.top=""; scrollTo(0,scrollY0); } btn.setAttribute("aria-expanded","false"); btn.classList.remove("hide"); btn.focus(); try{ sessionStorage.setItem("fodo-bot","1"); }catch(e){} };
  btn.addEventListener("click",open); btn.addEventListener("mouseenter",()=>window.FODO_MASCOT&&FODO_MASCOT.set("wave",1800)); inp.addEventListener("input",()=>window.FODO_MASCOT&&FODO_MASCOT.set(inp.value?"think":"idle")); box.querySelector(".bot-x").addEventListener("click",close);
  box.querySelector(".bot-new").addEventListener("click",()=>{ log.innerHTML=""; try{ ["fodo-bot-log","fodo-llm-hist","fodo-mind-v1"].forEach(k=>sessionStorage.removeItem(k)); if(window.FODO_MIND&&FODO_MIND.reset)FODO_MIND.reset(); }catch(_){} greet(); inp.focus(); }); document.addEventListener("keydown",ev=>{ if(ev.key==="Escape"&&!box.hidden)close(); });
  function greet(){ if(route==="home"){ botSay(bi(`Hi, I'm FODO Bot 👋 Think you can read campaign data better than most marketers? <b>The FODO Challenge</b> is 4 rounds, 2 minutes, score under 40 and the strategy session is on us. ${L(R.game,"Play →")}`,"game")); setChips(["Play the game","What do you do?","Pricing","Free audit"]); }
    else if(route==="game"){ botSay(`Tip: in Round 1, judge by the <b>objective</b>, not the biggest number. Need help after the game? Ask me anything.`); setChips(DEFAULT); }
    else if(route==="services"){ botSay(bi(`Looking for something specific? Tell me your goal, leads, sales, visibility, and I'll point you to the right service.`,"service")); setChips(["More leads","More sales","SEO","Meta ads","Pricing"]); }
    else { botSay(bi(`Hey! I'm FODO's marketing assistant. Strategy, SEO, social, content, ads, branding, websites, leads, tell me what you're trying to achieve, or what isn't working.`,"hi")); setChips(DEFAULT); } }

  /* ---- Personality: small talk + general marketing intents ---- */
  Object.assign(SYN,{"visibility":"brand","programme":"founding","program":"founding","website":"web","marketing":"marketing","digital":"marketing","online":"marketing","promote":"marketing","promotion":"marketing","grow":"growth","growth":"growth","scale":"growth","plan":"plan","strategy":"plan","roadmap":"plan","idea":"plan","ideas":"plan","help":"help","support":"help","problem":"help","issue":"help","stuck":"help","confused":"help",
    "yes":"yes","yeah":"yes","yep":"yes","haan":"yes","ha":"yes","sure":"yes","no":"no","nahi":"no","nope":"no","nope.":"no","later":"no",
    "name":"name","naam":"name","bot":"name","robot":"name","ai":"name","human":"name","insaan":"name","made":"name","banaya":"name",
    "how's":"mood","hows":"mood","kaise":"how","kaisa":"mood","kaisi":"mood","sup":"mood","wassup":"mood","good":"mood","fine":"mood","morning":"hi","evening":"hi","afternoon":"hi",
    "joke":"joke","funny":"joke","mazak":"joke","bored":"joke","lol":"joke","haha":"joke",
    "competitor":"competitor","competitors":"competitor","rival":"competitor","competition":"competitor",
    "followers":"followers","follower":"followers","likes":"followers","views":"followers","viral":"followers","engagement":"followers",
    "lead":"leads","enquiries":"leads","enquiry":"leads","inquiry":"leads","sale":"sales","revenue":"sales","orders":"sales","customers":"sales","conversion":"cro","conversions":"cro","funnel":"cro","traffic":"traffic","visitors":"traffic",
    "email":"emailmk","newsletter":"emailmk","youtube":"youtube","linkedin":"linkedin","b2b":"linkedin"});
  Object.assign(HI,{marketing:"मार्केटिंग का मतलब सिर्फ पोस्ट या ऐड नहीं: सही ऑडियंस, सही मैसेज, सही चैनल और सही मापन। बताइए आपका गोल क्या है, मैं रास्ता बताता हूँ।",growth:"ग्रोथ के लिए हम पहले लीक ढूँढते हैं, फिर डिमांड बढ़ाते हैं। शुरुआत फ्री ऑडिट से।",plan:"प्लान हमेशा ऑडिट के बाद बनता है: पहले देखते हैं कहाँ पैसा और ध्यान लीक हो रहा है। 5 मिनट में अपना ग्रोथ स्कोर निकालिए या सीधे फ्री ऑडिट लीजिए।",help:"ज़रूर! बताइए: लीड्स चाहिए, सेल्स, ब्रांड विज़िबिलिटी, या वेबसाइट/ट्रैकिंग की दिक्कत?",yes:"बढ़िया! तो बताइए किस पर बात करें: लीड्स, सेल्स, SEO, ऐड्स या ब्रांड?",no:"कोई बात नहीं। जब मन हो, मैं यहीं हूँ: या गेम खेल लीजिए, मज़ा आएगा।",name:"मैं FODO Bot हूँ: इंसान नहीं, पर इंसानों को समझने वाला। अनमोल और टीम ने बनाया है; मुश्किल सवाल सीधे अनमोल तक पहुँचा देता हूँ।",mood:"एकदम बढ़िया: नए ब्रांड्स को डिजिटल दुनिया में गायब होने से बचा रहा हूँ! आप बताइए, क्या चल रहा है?",joke:"मार्केटिंग जोक: क्लाइंट बोला 'वायरल करा दो': हमने पूछा 'खांसी वाला या सेल्स वाला?' 😄 अब बताइए, सच में क्या चाहिए?",competitor:"कॉम्पिटिटर से आगे निकलने का तरीका: वो जहाँ नहीं हैं वहाँ दिखो, और जहाँ हैं वहाँ बेहतर मैसेज रखो। ऑडिट में हम यही गैप निकालते हैं।",followers:"फॉलोअर्स/लाइक्स अच्छे हैं, पर बिल नहीं भरते। हम ऐसा कंटेंट सिस्टम बनाते हैं जो ध्यान को इनक्वायरी में बदले।",traffic:"ट्रैफिक तब काम का है जब वो कन्वर्ट हो। पहले लैंडिंग पेज और ट्रैकिंग ठीक, फिर ट्रैफिक बढ़ाना सस्ता पड़ता है।",cro:"कन्वर्ज़न/फनल की दिक्कत = ज़्यादातर ऐड की नहीं, पेज और फॉलो-अप की दिक्कत होती है। CRO सर्विस देखिए।",emailmk:"ईमेल/WhatsApp ऑटोमेशन से लीड ठंडी नहीं पड़ती, consent के साथ, इंसान तक सही समय पर पहुँचती है।",youtube:"YouTube के लिए हम शॉर्ट-फॉर्म स्ट्रैटेजी और Google/YouTube ऐड्स करते हैं; प्रोडक्शन अलग से स्कोप होता है।",linkedin:"LinkedIn/B2B में सही सीनियॉरिटी तक पहुँचना अहम है: लीड क्वालिटी पर फोकस, वॉल्यूम पर नहीं।",kb:"ऊपर आपके कीवर्ड से जुड़ी सर्विसेज़/लेख हैं। और स्पेसिफिक पूछिए, या फ्री ऑडिट बुक करें।"});
  const more=[
    [["joke"],()=>pick([`Marketing joke: a client said "make it go viral", we asked, "the cough kind or the sales kind?" 😄 Now, what do you actually need?`,`Why did the landing page break up with the ad? Message mismatch. 💔 Want me to check yours? ${L(R.audit,"Free audit →")}`,`Our office plant has better retention than most email lists. 🌱 Speaking of which, need help with follow-up? ${L(R.services+"#marketing-automation","Automation →")}`])],
    [["mood"],()=>pick([`Doing great, busy keeping brands from going digitally missing. How about you? What are you working on?`,`All systems green 🟢 Tell me what you're building and I'll point you somewhere useful.`])],
    [["botname"],()=>`I'm <b>FODO Bot</b>, not human, but trained on how humans buy. Built by Anmol's team at FODO. For anything I can't answer, I hand you to ${WA("Hi Anmol, FODO Bot sent me over with a question: ")}.`],
    [["yes"],()=>`Great. Pick one and I'll point you right: <b>leads</b>, <b>sales</b>, <b>SEO</b>, <b>ads</b>, <b>brand</b>, or say "audit" to start properly.`],
    [["no"],()=>pick([`No problem: I'm here whenever. Meanwhile, ${L(R.game,"the FODO Challenge")} is a fun 2 minutes.`,`Fair enough. If curiosity strikes later, ${L(R.insights,"Insights")} has some sharp reads.`])],
    [["help"],()=>`Happy to. What's the goal: <b>more leads</b>, <b>more sales</b>, <b>brand visibility</b>, or a <b>website/tracking</b> problem? Say it in your words and I'll map it to what FODO does.`],
    [["plan"],()=>`A good plan starts with a diagnosis, not a channel list. Two quick routes: ${L(R.score,"Growth Score")} (5 minutes, self-assessment) or the ${L(R.audit,"Free Growth Audit")} (human review + a prioritised plan). Tell me your industry and I'll suggest where to begin.`],
    [["marketing"],()=>`Marketing, the FODO way: right audience → right message → right channel → measured properly. We cover ${L(R.services+"#paid-advertising","paid media")}, ${L(R.services+"#seo","SEO")}, ${L(R.services+"#content-marketing","content")}, ${L(R.services+"#social-media","social")}, ${L(R.services+"#brand-strategy","brand")} and ${L(R.services+"#marketing-automation","automation")}. What's your goal?`],
    [["growth"],()=>`Growth = fix the leak, then turn up the tap. We diagnose first (${L(R.score,"Growth Score")}), then scale what works. Which stage are you at, just starting, running ads already, or scaling?`],
    [["competitor"],()=>`Beating competitors isn't about shouting louder, be visible where they aren't, and clearer where they are. ${L(R.services+"#seo","SEO")} + ${L(R.services+"#brand-strategy","positioning")} is usually the gap. Who are you up against?`],
    [["followers"],()=>`Followers and likes are nice; customers pay the bills. We build content systems that turn attention into enquiries: ${L(R.services+"#short-form-content","short-form")} + ${L(R.services+"#social-media","social management")}. Which platform matters most to you?`],
    [["traffic"],()=>`Traffic only matters if it converts. Check the page and tracking before buying more of it: ${L(R.insights+"#traffic-vs-customers","why more traffic ≠ more customers")}. Then ${L(R.services+"#seo","SEO")}/${L(R.services+"#paid-advertising","ads")} to scale.`],
    [["cro"],()=>`Funnel or conversion trouble? Usually it's the page and follow-up, not the ad. ${L(R.services+"#cro","CRO")} + ${L(R.services+"#landing-pages","landing pages")}. Want a quick diagnosis? ${L(R.audit,"Free audit →")}`],
    [["emailmk"],()=>`Email/WhatsApp follow-up is where most leads are won or lost. ${L(R.services+"#marketing-automation","Marketing Automation")} sets consent-aware sequences that hand off to a human at the right moment. ${L(R.insights+"#simple-lead-follow-up-system","Read the simple follow-up system →")}`],
    [["youtube"],()=>`YouTube: ${L(R.services+"#short-form-content","Shorts strategy")} for organic, ${L(R.services+"#google-ads","YouTube ads")} for paid. Production is scoped separately, we script and direct.`],
    [["linkedin"],()=>`For B2B/LinkedIn: ${L(R.services+"#linkedin-ads","LinkedIn Ads")} aimed at decision-makers, lead quality over volume. See ${L(R.industries+"#saas","SaaS")} playbook too.`]
  ];
  more.reverse().forEach(r=>rules.unshift(r));
  /* ---- Knowledge search fallback: any marketing keyword → matching services / articles / FAQs ---- */
  function kb(q){ const t=toks(q).filter(w=>w.length>2); if(!t.length)return null; const sc=(txt)=>{ const ft=toks(txt); return t.reduce((a,w)=>a+(ft.includes(w)?1:0),0); };
    const sv=D.services.map(s=>[sc(s.name+" "+s.h+" "+s.problem+" "+s.do.join(" ")+" "+s.channels.join(" ")),s]).filter(x=>x[0]>0).sort((a,b)=>b[0]-a[0]).slice(0,3);
    const ar=D.articles.map(a=>[sc(a.title+" "+a.cat),a]).filter(x=>x[0]>0).sort((a,b)=>b[0]-a[0]).slice(0,2);
    if(!sv.length&&!ar.length)return null;
    let out=`Here's what I found for <b>${e(q)}</b>:`; if(sv.length)out+=`<br>Services: ${sv.map(x=>L(R.services+"#"+x[1].slug,e(x[1].name))).join(" · ")}`; if(ar.length)out+=`<br>Reads: ${ar.map(x=>L(R.insights+"#"+x[1].slug,e(x[1].title))).join(" · ")}`;
    return out+`<br>Want this applied to your business? ${L(R.audit,"Free audit →")}`; }
  B.answer=answer;
  /* Context-aware call-outs: short bubbles that change with the section/page (max 3 words) */
  const hint=btn.querySelector(".bot-hint");
  const SAY={home:{0:["Hey there 👋","Welcome! ✨","Let's talk?"],1:["Psst… ask me","Curious? 💡"],2:["Pick a service?","Need SEO? Ads?"],3:["6 steps, easy","Ask how it works"],4:["Know your score?","Test yourself 🎯"],5:["Our thinking","Curious? Ask me"],6:["Why us? Ask","Honest answers"],7:["Meet Anmol","Founder here"],8:["Real numbers","Benchmarks? Ask"],9:["Founding slots!","Join early 🚀"],10:["Play a game?","Try the lab 🧪"],11:["Beat 40 points?","Game on? 🎮"],12:["Good reads","Learn something?"],13:["Free audit 👀","Start here"],14:["Let's chat 😄","Say hi!"]},
    services:["Which service?","Ask me anything","Need pricing?"],industries:["Your industry?","Tell me more"],work:["Want this too?","Ask how"],insights:["Nice read?","Ask me more"],resources:["Tick them off ✅","Need help?"],score:["Be honest 😉","Need a hand?"],roi:["Play with numbers","Realistic? Ask"],game:["Beat 40! 🎮","Tips? Ask me"],quiz:["Good luck 🍀","Stuck? Ask"],contact:["I can help ✍️","Prefer WhatsApp?"],reviews:["Real stories","Ask about them"],faq:["Not here? Ask","Quick answer?"],legal:["Need clarity?","Questions? Ask"],thanks:["Thank you! 🙌","Next step?"]};
  let lastSay="",sayT; const say=(txt,state)=>{ if(!box.hidden||!txt||txt===lastSay)return; lastSay=txt; hint.textContent=txt; btn.classList.add("say"); if(window.FODO_MASCOT)FODO_MASCOT.set(state||["wave","happy","surprised"][Math.floor(Math.random()*3)],1500); clearTimeout(sayT); sayT=setTimeout(()=>btn.classList.remove("say"),4200); };
  const pickFrom=a=>a[Math.floor(Math.random()*a.length)];
  if(route==="home"&&"IntersectionObserver" in window){ const secs=[...document.querySelectorAll("main>section")]; new IntersectionObserver(en=>{ en.forEach(x=>{ if(x.isIntersecting){ const i=secs.indexOf(x.target); const m=SAY.home[i]||SAY.home[14]; say(pickFrom(m)); } }); },{threshold:.45}).observe && secs.forEach(sec=>new IntersectionObserver(en=>{ if(en[0].isIntersecting){ const i=secs.indexOf(sec); say(pickFrom(SAY.home[i]||SAY.home[14])); } },{threshold:.4}).observe(sec)); }
  else if(SAY[route]){ setTimeout(()=>say(pickFrom(SAY[route])),1800); setInterval(()=>{ if(box.hidden)say(pickFrom(SAY[route])); },14000); }
  // idle nudge if nothing said for a while
  setInterval(()=>{ if(box.hidden&&!btn.classList.contains("say"))say(pickFrom(["Hi! 👋","Need help?","Ask me 💬","I'm here 🙂"])); },22000);
  // auto-open once per session on home (the game teaser)
  let seen=false; try{ seen=sessionStorage.getItem("fodo-bot"); }catch(e){}
  const mobile=matchMedia("(max-width:767px)").matches;
  if(route==="home"&&!seen&&!restored){ btn.classList.add("nudge"); btn.insertAdjacentHTML("beforeend",'<span class="bot-badge" aria-hidden="true">1</span>'); }  // the chat opens ONLY when the visitor clicks
  btn.addEventListener("click",()=>{ const bd=btn.querySelector(".bot-badge"); if(bd)bd.remove(); });
  // make "More leads/sales" useful
  rules.unshift([["leads"],()=>`For more leads we usually start with ${L(R.services+"#google-ads","Google Ads")} (intent) or ${L(R.services+"#meta-ads","Meta Ads")} (demand), a focused ${L(R.services+"#landing-pages","landing page")}, and ${L(R.services+"#marketing-automation","follow-up automation")}. Fastest route to specifics: ${L(R.audit,"free audit →")}`]);
  rules.unshift([["sales"],()=>`For more sales: fix the funnel first (${L(R.services+"#cro","CRO")}), then scale demand with ${L(R.services+"#meta-ads","Meta")}/${L(R.services+"#google-ads","Google")} and retention via ${L(R.services+"#marketing-automation","automation")}. ${L(R.roi,"Run a scenario →")}`]);
  SYN["lead"]="leads"; SYN["enquiries"]="leads"; SYN["enquiry"]="leads"; SYN["inquiry"]="leads"; SYN["sale"]="sales"; SYN["revenue"]="sales"; SYN["orders"]="sales"; SYN["customers"]="sales";
})();
