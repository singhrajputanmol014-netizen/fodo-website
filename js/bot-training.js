/* FODO BOT — CONVERSATIONAL TRAINING + REASONING LAYER
 * Version: 2026.10
 * Purpose: large deterministic training corpus + context engine for a static site bot.
 * This is not a neural model; it is a client-side intent, entity, dialogue and response layer.
 * It sits above FODO's existing knowledge/brain and below the human/social layer.
 */
(function(){
  'use strict';
  if(!window.FODO_BOT || typeof window.FODO_BOT.answer!=='function') return;
  const B=window.FODO_BOT;
  const old=B.answer.bind(B);
  const esc=s=>String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const clean=s=>String(s||'').toLowerCase().normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,' ').replace(/[^\p{L}\p{N}@.#%+&'\-\s]/gu,' ').replace(/\s+/g,' ').trim();
  const has=(s,re)=>re.test(clean(s));
  const pick=a=>a[Math.floor(Math.random()*a.length)];
  const link=(href,text)=>`<a href="${href}">${text}</a>`;
  const C=window.FODO||{}; const U=window.FODO_UTIL||{}; const R=U.routes||{};
  const wa=m=>U.wa?`<a href="${U.wa(m)}" target="_blank" rel="noopener noreferrer">WhatsApp Anmol →</a>`:'';

  /* ---------- LONG-FORM TRAINING CORPUS ---------- */
  const INTENTS={
    greeting:{patterns:['hi','hello','hey','yo','namaste','good morning','good evening','good afternoon','sup','hii','hiii','helo','heyy','what’s up','whats up','ka haal','kaise ho','kya haal'],responses:[
      'Hey! 👋 I’m FODO Bot. Tell me what you’re trying to grow — leads, sales, visibility, bookings, or your brand — and I’ll help you think it through.',
      'Namaste 👋 What are we fixing today: ads, SEO, Instagram, website, leads, sales, or the whole growth system?'
    ]},
    capabilities:{patterns:['what can you do','what do you do','how can you help','help me','what can i ask','what are you capable','tum kya kar sakte','kya help karoge'],responses:[
      'Quite a lot. 😄 I can diagnose marketing problems, explain channels, build a 30/60/90-day plan, review a funnel, suggest content, discuss budgets, compare Google vs Meta, explain SEO/AEO/GEO, and point you to the right FODO service. Give me the messy version — I’ll structure it.',
      'Think of me as the front desk + junior strategist of FODO. I can answer site questions and also reason through a marketing problem with you. If I need a human decision, I’ll say so.'
    ]},
    pricing:{patterns:['price','pricing','cost','how much','kitna','kitne','rate','fees','fee','charges','charge','budget','paisa','paise','expensive','cheap','affordable','retainer'],responses:[
      'FODO does not use one blanket price because the right scope depends on your goal, industry, funnel and channels. A sensible starting point is to diagnose the problem first, then scope the work. Ad spend is separate and should stay in your own ad accounts.',
      'If someone gives you a serious marketing quote without asking what you sell, your average order value, geography, funnel and current numbers… be suspicious. 😄 Tell me those four things and I can explain what a sensible budget structure looks like.'
    ]},
    audit:{patterns:['schedule a call','schedule a meeting','book a meeting','book meeting','set up a call','talk to someone','speak to someone','call me','arrange a call','audit','free audit','growth audit','review my business','analyse my business','analyze my business','check my business','where am i losing','what is wrong with my marketing'],responses:[
      'Start with a diagnosis, not random posting. FODO’s Growth Audit looks at positioning, acquisition, website/CRO, content/social, tracking and follow-up — then prioritises what to fix first. '+link(R.audit||'/contact/','Start the free growth audit →')
    ]},
    services:{patterns:['services','service','what do you offer','what do you provide','what does fodo do','fodo services','agency services','marketing services','kaam kya karte'],responses:[
      'FODO works across paid media, SEO, local SEO, social/content, creator marketing, branding, websites/CRO, analytics and automation. The important bit: we don’t recommend every service to every business. The goal determines the stack.'
    ]},
    leads:{patterns:['get more leads','more leads','generate leads','lead generation','leads nahi aa rahe','lead nahi aa rahe','leads kaise','enquiries','enquiries nahi','inquiries','inquiry','enquiry'],responses:[
      'First separate the problem: <b>traffic</b>, <b>conversion</b>, or <b>follow-up</b>. More traffic won’t fix a weak offer; more leads won’t fix slow response. Tell me your business, monthly enquiries and average customer value and I’ll diagnose the likely bottleneck.'
    ]},
    sales:{patterns:['more sales','increase sales','sales nahi','sales not coming','customers nahi','customers kaise','sell more','revenue','revenue badhao','conversion','conversion rate'],responses:[
      'Sales usually come from the whole chain: right audience → strong offer → qualified traffic → convincing page/conversation → fast follow-up → proof → retention. Don’t automatically blame ads. Tell me where people drop off.'
    ]},
    meta:{patterns:['facebook ads','meta ads','instagram ads','fb ads','meta advertising','instagram advertising','facebook advertising'],responses:[
      'Meta is strongest when you can create demand visually and repeatedly: offers, education, proof, creators, UGC and retargeting. For a lead-gen business, I’d usually test <b>creative + offer + audience + landing/WhatsApp flow</b> before increasing budget. Never scale a broken funnel.'
    ]},
    google:{patterns:['google ads','ppc','search ads','google advertising','adwords','search campaign'],responses:[
      'Google Search is useful when people already have intent. Structure around commercial intent, location, offer, landing-page message match and conversion tracking. If nobody is searching for the category, Google Search alone may not create enough demand.'
    ]},
    seo:{patterns:['seo','search engine optimization','rank on google','google ranking','website ranking','organic traffic','organic search'],responses:[
      'SEO is a compounding system: technical accessibility + search intent + genuinely useful pages + internal linking + authority/trust + measurement. Don’t judge SEO only by rankings; watch qualified organic traffic, enquiries and revenue.'
    ]},
    ai_search:{patterns:['ai search','ai overviews','ai overview','chatgpt search','ai mode','answer engine','aeo','geo','generative engine optimization','generative search'],responses:[
      'AI search changes how people discover answers, but there is no magic “AI ranking hack”. Build clear, original, trustworthy pages that answer real questions, use strong entity/context signals, and keep technical SEO healthy. Measure mentions, qualified visits and assisted conversions where possible.'
    ]},
    social:{patterns:['instagram growth','grow instagram','social media','social media marketing','instagram strategy','reels','content strategy','followers','followers badhao'],responses:[
      'Before chasing followers, choose the business outcome. For most brands: <b>positioning → content pillars → strong hooks → proof → CTA → conversion path</b>. A smaller audience that trusts you can outperform a huge passive audience.'
    ]},
    content:{patterns:['content ideas','content strategy','what should i post','what to post','post ideas','reel ideas','instagram content','blog ideas','content calendar'],responses:[
      'Use four buckets: <b>teach</b> something, <b>prove</b> something, <b>show</b> the process/personality, and <b>sell</b> a clear offer. Then turn each winning topic into multiple formats. If you tell me your niche, I can create a 30-day content system instead of 30 random posts.'
    ]},
    influencer:{patterns:['influencer','creator marketing','ugc','brand collaboration','creator collaboration','influencer marketing','micro influencer','nano influencer'],responses:[
      'Pick creators for audience relevance, trust, geography, content quality and conversion potential — not follower count alone. A group of relevant micro-creators can be more useful than one celebrity. Track unique links/codes, enquiries, sales and content reuse rights.'
    ]},
    website:{patterns:['website not converting','website conversion','website audit','landing page','homepage','website design','new website','website traffic but no sales','site not converting'],responses:[
      'A beautiful website can still be a terrible salesperson. Check five things: <b>clarity in 5 seconds, proof, offer, friction, and CTA</b>. Then check speed/mobile/technical SEO and analytics. If traffic arrives but nobody acts, fix conversion before buying more traffic.'
    ]},
    local:{patterns:['local business','local seo','google business profile','gbp','google maps','near me','restaurant marketing','salon marketing','gym marketing','clinic marketing','dentist marketing'],responses:[
      'For local businesses, I’d usually prioritise Google Business Profile, reviews, location/service pages, local intent content, strong offer pages, accurate tracking and fast WhatsApp/phone follow-up. Then add paid acquisition where the economics support it.'
    ]},
    ecommerce:{patterns:['ecommerce','e commerce','shopify','online store','d2c','d2c brand','product sales','sell products online'],responses:[
      'E-commerce growth is a loop: product/offer → creative → traffic → product page → checkout → retention. Track contribution margin, CAC, conversion rate, AOV and repeat purchase — not ROAS alone.'
    ]},
    budget_low:{patterns:['low budget','small budget','zero budget','no budget','budget nahi','paise nahi','cheap marketing','free marketing','5000 budget','10000 budget','20000 budget'],responses:[
      'Low budget means prioritisation, not magic. Start with offer clarity, Google Business Profile, reviews, conversion fixes, organic distribution, referrals and one focused paid test. Don’t spread ₹10k across six channels and call it strategy. 😄'
    ]},
    budget_high:{patterns:['1 lakh budget','100000 budget','2 lakh budget','big budget','large budget','scale ads','scaling budget'],responses:[
      'A larger budget only helps if the funnel can absorb it. Scale in controlled steps: tracking → creative/offer validation → conversion economics → channel expansion → retargeting → incrementality/attribution checks. Budget should follow evidence, not ego.'
    ]},
    timeline:{patterns:['how long','how many days','when results','results when','kab result','kitne din','timeline','how fast','quick results'],responses:[
      'Paid campaigns can produce signals quickly, but reliable optimisation needs enough data. SEO/content usually compounds over months. A practical plan is: <b>0–30 days</b> fix foundations and test, <b>31–60</b> optimise winners, <b>61–90</b> scale and build compounding assets. Your market and baseline can change that.'
    ]},
    guarantee:{patterns:['guarantee','guaranteed results','guarantee leads','100 leads','promise results','sure results'],responses:[
      'No honest marketer can guarantee a specific number of leads or sales before seeing the business, offer, market and economics. FODO should promise a disciplined process, clear metrics and transparent reporting — not fake certainty.'
    ]},
    tracking:{patterns:['tracking','analytics','ga4','conversion tracking','pixel','meta pixel','events','attribution','data tracking'],responses:[
      'If tracking is wrong, optimisation becomes guesswork. At minimum define the primary conversion, verify event firing, preserve UTM/source data, reconcile platform leads with actual CRM/sales and separate lead volume from qualified revenue.'
    ]},
    automation:{patterns:['automation','automate','crm','follow up','follow-up','whatsapp automation','email automation','chatbot','ai automation'],responses:[
      'Automate repetition, not judgement. Good candidates: lead capture, routing, reminders, qualification, appointment follow-up, reporting and reactivation. Keep human review where trust, nuance or high-value decisions matter.'
    ]},
    ai_content:{patterns:['ai content','chatgpt content','ai generated content','ai writing','use ai for marketing','ai marketing'],responses:[
      'AI can speed research, ideation, repurposing and first drafts. It should not become a factory for generic pages. Add human expertise, original evidence, customer language, editing and fact-checking — especially for important claims.'
    ]},
    competitor:{patterns:['competitor','competitors','competition','competitor analysis','spy on competitors','what are competitors doing'],responses:[
      'Competitor research should reveal gaps, not encourage copying. Compare offer, positioning, proof, channels, creative themes, landing pages, reviews, pricing signals and customer experience. Then find the angle competitors are under-serving.'
    ]},
    brand:{patterns:['branding','brand strategy','brand identity','logo','rebrand','brand name','positioning','brand positioning'],responses:[
      'Brand is the memory and expectation attached to your business. Start with positioning: who you serve, what problem you solve, why you’re credible and why someone should choose you. Visual identity comes after that foundation.'
    ]},
    reputation:{patterns:['reviews','bad reviews','reputation','google reviews','negative reviews','online reputation'],responses:[
      'Don’t bury negative reviews — fix the underlying experience, respond calmly, document the resolution and consistently earn more genuine reviews. Never buy fake reviews. Reputation is an operating system, not just a marketing asset.'
    ]},
    founder:{patterns:['who is anmol','who founded fodo','founder','who runs fodo','who is behind fodo','anmol'],responses:[
      'FODO was built by Anmol Singh. The positioning is intentionally practical: combine creative thinking, marketing execution and business development instead of treating channels as separate silos.'
    ]},
    ownership:{patterns:['who owns my account','do you own my ads','account ownership','my data','my ad account','agency owns account','can i leave','lock in','lock-in'],responses:[
      'The cleanest setup is for the client to own the core accounts, ad budgets and business assets. The agency gets the access required to operate them. That protects continuity if the relationship ever ends.'
    ]},
    start:{patterns:['where do i start','how to start','start marketing','marketing start','first step','pehla step','kahan se shuru','shuru kaise'],responses:[
      'Start with <b>one business goal</b>, <b>one target customer</b>, <b>one offer</b>, and <b>one measurable conversion</b>. Then audit the funnel before adding channels. If you tell me what you sell, where you sell it and your monthly budget, I’ll turn that into a starting plan.'
    ]},
    plan:{patterns:['marketing plan','growth plan','90 day plan','30 day plan','60 day plan','strategy plan','roadmap','road map','strategy banao','plan banao'],responses:[
      'A useful 90-day structure: <b>Days 1–30:</b> diagnosis, tracking, positioning, offer and quick conversion fixes. <b>31–60:</b> run controlled channel/creative tests and build content/SEO assets. <b>61–90:</b> scale winners, improve economics, strengthen retention and decide the next quarter based on evidence.'
    ]},
    comparison:{patterns:['google or meta','instagram or google','seo or ads','organic or paid','which channel','best channel','what channel should i use'],responses:[
      'There is no universal “best” channel. <b>Google</b> is strong for existing intent; <b>Meta/social</b> is strong for demand creation and visual storytelling; <b>SEO</b> compounds; <b>creators</b> add trust/distribution. Choose based on customer behaviour, economics, creative capacity and buying cycle.'
    ]},
    metrics:{patterns:['roas','cpa','cpl','cac','ltv','aov','ctr','cvr','conversion rate','cost per lead','customer acquisition cost','lifetime value','return on ad spend'],responses:[
      'Don’t optimise a single metric in isolation. A useful chain is <b>CTR → CPC → landing conversion → CPL/CAC → qualified rate → close rate → revenue/margin → LTV</b>. The business metric is what ultimately decides whether a channel deserves more budget.'
    ]},
    viral:{patterns:['go viral','viral','trending','trend','viral reel','viral video'],responses:[
      'Virality is an outcome, not a strategy. Improve the odds with a strong first 1–2 seconds, clear tension/curiosity, native format, retention-focused editing, a relevant topic and lots of learning cycles. Then make sure attention has somewhere useful to go.'
    ]},
    off_topic:{patterns:['what is the weather','weather','news today','stock market','bitcoin','crypto','politics','who is the prime minister','code this','python','java','recipe','movie recommendation','football score'],responses:[
      'That’s outside FODO’s core marketing brain. 😄 I can still chat, but if you’re here for FODO, give me the business problem and I’ll switch back into strategist mode.'
    ]}
  };

  /* 300+ natural variations are generated from semantic families so the browser file stays maintainable. */
  const VARIANTS={
    leads:['i need leads','need more enquiries','my leads are low','why am i getting no leads','ads are running but no leads','lead generation help','how do i get qualified leads','lead quality is bad','getting junk leads','lots of clicks no enquiries'],
    sales:['traffic is coming but no sales','people visit but don’t buy','why are my sales down','how to convert leads','leads but no customers','people ask price then disappear','customers stop replying','how do i close more leads'],
    ads:['my ads are not working','ads getting clicks but no sales','cpm is high','cpc is high','meta ads expensive','facebook ads not converting','google ads expensive','campaign has no conversions','should i increase ad budget','when should i scale ads'],
    seo:['why am i not ranking','seo not working','how to rank faster','organic traffic dropped','google traffic down','my website is invisible on google','seo strategy for small business'],
    social:['instagram not growing','reels getting no views','why are my reels dead','instagram has followers but no customers','how to get instagram leads','social media not converting','what should my business post'],
    website:['website gets traffic but no enquiries','homepage confusing','landing page not converting','people leave my website','website bounce rate high','do i need a new website','is my website good enough'],
    budget:['i only have 5000','i can spend 10000','my budget is 20k','can i market with 10k','marketing with small budget','i have very little money for ads'],
    casual:['you are smart','good bot','nice bot','you are funny','lol','haha','thanks bro','bro help me','bhai help','kya scene hai','are you real','are you human','you are ai'],
    emotional:['i am frustrated with marketing','marketing is stressing me out','nothing is working','i feel stuck','i am losing money on ads','i am confused about marketing']
  };
  const TRAINING=[];
  Object.keys(VARIANTS).forEach(k=>VARIANTS[k].forEach(x=>TRAINING.push({text:x,intent:k})));

  /* ---------- CONTEXT / MEMORY ---------- */
  const KEY='fodo_bot_context_v2';
  let state={industry:null,goal:null,budget:null,channel:null,location:null,offer:null,stage:null,lastIntent:null,lastQuestion:null,turns:0};
  try{ const saved=sessionStorage.getItem(KEY); if(saved) state=Object.assign(state,JSON.parse(saved)); }catch(e){}
  function save(){try{sessionStorage.setItem(KEY,JSON.stringify(state));}catch(e){}}
  function extract(q){
    const n=clean(q);
    const industries=[['dentist','healthcare'],['doctor','healthcare'],['clinic','healthcare'],['hospital','healthcare'],['real estate','real-estate'],['property','real-estate'],['builder','real-estate'],['restaurant','local-business'],['cafe','local-business'],['salon','local-business'],['gym','local-business'],['ecommerce','ecommerce'],['shopify','ecommerce'],['saas','saas'],['startup','startups'],['coach','personal-brand'],['creator','personal-brand']];
    industries.forEach(([x,v])=>{if(n.includes(x))state.industry=v;});
    const channels=['google ads','meta ads','facebook ads','instagram','seo','content','influencer','website','whatsapp','email']; channels.forEach(x=>{if(n.includes(x))state.channel=x;});
    const goals=[['leads','leads'],['enquir','leads'],['sales','sales'],['revenue','sales'],['booking','bookings'],['appointment','bookings'],['followers','visibility'],['brand awareness','visibility'],['traffic','traffic']]; goals.forEach(([x,v])=>{if(n.includes(x))state.goal=v;});
    const m=n.match(/(?:₹|rs\.?|inr)\s*([\d,]+)\s*(k|l|lakh|lac)?/i)||n.match(/\b([\d,]+)\s*(k|l|lakh|lac)\s*(?:budget|per month|monthly)?/i);
    if(m){let num=Number(m[1].replace(/,/g,'')); const unit=(m[2]||'').toLowerCase(); if(unit==='k')num*=1000; if(['l','lakh','lac'].includes(unit))num*=100000; state.budget=num;}
    const loc=n.match(/\b(delhi|ncr|noida|gurgaon|gurugram|mumbai|bangalore|bengaluru|pune|hyderabad|kolkata|india|dubai|usa|uk)\b/i); if(loc)state.location=loc[1];
    if(/not working|no leads|no sales|stuck|losing money|confused|frustrat/i.test(n))state.stage='problem';
    if(/start|new business|launch/i.test(n))state.stage='starting';
    if(/scale|scaling|increase budget|grow fast/i.test(n))state.stage='scaling';
    state.turns++; state.lastQuestion=q; save();
  }

  function contextual(){
    const bits=[];
    if(state.industry)bits.push(`industry: ${state.industry}`);
    if(state.goal)bits.push(`goal: ${state.goal}`);
    if(state.budget)bits.push(`budget: ₹${state.budget.toLocaleString('en-IN')}`);
    if(state.channel)bits.push(`channel: ${state.channel}`);
    return bits.join(' · ');
  }

  function matchIntent(q){
    const n=clean(q); let best=null,score=0;
    for(const [name,data] of Object.entries(INTENTS)){
      let s=0;
      data.patterns.forEach(p=>{const x=clean(p); if(!x)return; if(n===x)s+=8; else if((' '+n+' ').includes(' '+x+' '))s+=Math.min(5,1+x.split(' ').length);});
      if(s>score){score=s;best=name;}
    }
    // generated training examples
    TRAINING.forEach(t=>{const x=clean(t.text); if(!x)return; if(n===x) {best=t.intent;score=20;} else if((' '+n+' ').includes(' '+x+' ')||(' '+x+' ').includes(' '+n+' ')) {score=Math.max(score,3);best=t.intent;}});
    return score>=2?best:null;
  }

  function answerIntent(intent,q){
    const d=INTENTS[intent];
    if(!d)return null;
    state.lastIntent=intent; save();
    let out=pick(d.responses);
    // Contextual follow-up, but never fabricate facts.
    if(['leads','sales','plan','comparison','budget_low','budget_high','ads','seo','social','website'].includes(intent) && (state.industry||state.goal||state.budget)){
      out += `<br><br><small>Based on what you’ve told me so far${contextual()?` (${esc(contextual())})`:''}, I can make this much more specific if you give me your current monthly enquiries/sales and average customer value.</small>`;
    }
    return out;
  }

  function followup(q){
    const n=clean(q);
    if(/^(yes|yeah|yep|haan|ha|ok|okay|sure|go ahead|do it|please|please do|yes please)$/.test(n)){
      if(state.lastIntent==='leads'||state.lastIntent==='sales')return `Perfect. Give me just <b>3 numbers</b>: monthly enquiries, monthly customers, and average customer value. I’ll map the likely bottleneck and what I’d test first.`;
      if(state.lastIntent==='plan')return `Done. Tell me your business, location and monthly budget. I’ll turn the generic 90-day framework into a practical week-by-week plan.`;
      if(state.lastIntent==='content')return `Good. Tell me what you sell, who buys it, your city/market and your main offer. I’ll build the content pillars first, then the calendar.`;
      if(state.lastIntent==='website')return `Great. Paste the website URL. I’ll give you a prioritised conversion checklist rather than a generic “make it prettier” review.`;
    }
    if(/^(no|nope|nah|nahi|not now|leave it|never mind)$/.test(n))return pick(['No worries 😄','All good.','Fair enough. 😄'])+' What would you like to work on?';
    if(/^(what about|and|then|next|so|okay then|acha|accha)\b/.test(n) && state.lastIntent){
      return `Yep — continuing from <b>${esc(state.lastIntent.replace('_',' '))}</b>. Tell me the next detail and I’ll keep the context instead of starting from zero.`;
    }
    return null;
  }

  /* ---------- DOMAIN REASONING HEURISTICS ---------- */
  function diagnose(q){
    const n=clean(q);
    if(/clicks.*no (lead|sale)|traffic.*no (lead|sale)|visitors.*no (lead|sale)/i.test(n))
      return `That pattern usually points to a <b>conversion problem</b> before a traffic problem. Check offer clarity, message match, trust/proof, CTA friction, mobile UX and follow-up speed. If those are healthy, then inspect traffic quality.`;
    if(/lead.*but.*no sale|leads.*no customer|enquir.*no customer|people.*ask.*price.*disappear/i.test(n))
      return `You may have a <b>sales/follow-up bottleneck</b>. Audit lead qualification, response time, sales script, proof, pricing explanation and number of follow-ups before spending more on acquisition.`;
    if(/high cpl|expensive leads|cpl.*high/i.test(n))
      return `High CPL can come from audience, creative, offer, auction conditions, landing-page conversion or tracking. Don’t change everything at once. Find which step worsened first, then test one variable at a time.`;
    if(/followers.*sales|followers.*customer|lots of followers.*no/i.test(n))
      return `Follower count is not the diagnosis. Check whether your audience matches buyers, whether your content builds intent, and whether there is a clean path from profile → proof → offer → enquiry.`;
    if(/ad.*not working|ads.*dead|campaign.*bad/i.test(n))
      return `“Ads aren’t working” is too broad. Tell me <b>platform, spend, impressions, CTR, CPC, conversion rate and result</b>. Then we can identify whether the issue is creative, targeting, offer, landing page or measurement.`;
    return null;
  }

  /* ---------- NATURAL LANGUAGE REWRITES ---------- */
  const typoMap={'instgram':'instagram','instaagram':'instagram','facebok':'facebook','fcebook':'facebook','googel':'google','gogle':'google','whatsap':'whatsapp','whtsapp':'whatsapp','markting':'marketing','marketng':'marketing','busness':'business','bussiness':'business','stratergy':'strategy','stratgey':'strategy','adverising':'advertising','influencerz':'influencer'};
  function fixTypos(s){let n=clean(s);Object.entries(typoMap).forEach(([a,b])=>{n=n.replace(new RegExp('\\b'+a+'\\b','g'),b)});return n;}

  /* Public training data for future API/model migration. */
  window.FODO_BOT_TRAINING={version:'2026.10',intents:INTENTS,variants:VARIANTS,trainingExamples:TRAINING,contextKey:KEY};

  B.answer=function(question){
    const q=String(question||'').trim(); if(!q)return old(question);
    const normal=fixTypos(q); extract(normal);
    const f=followup(normal); if(f)return f;
    const d=diagnose(normal); if(d){state.lastIntent='diagnosis';save();return d;}
    const intent=matchIntent(normal);
    if(intent){const a=answerIntent(intent,normal);if(a)return a;}
    // Let the original, highly specific FODO brain handle complex questions.
    const result=old(question);
    // If the original engine is clearly unsure, provide a useful next-step rather than dead-ending.
    if(typeof result==='string' && /don.?t know|not sure|m[aá]f|cannot|can't|pata nahi|couldn.?t find/i.test(result)){
      return `I’m not fully sure about that one — and I’d rather say that than invent an answer. 😄 If this is about marketing, give me <b>what you sell + where you sell + your goal + rough budget</b> and I’ll reason from there. ${wa('Hi Anmol, I have a question the FODO Bot could not answer: '+q)}`;
    }
    return result;
  };
})();
