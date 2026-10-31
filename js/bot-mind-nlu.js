/* FODO Bot: MIND · Layer 1+2: INPUT UNDERSTANDING (normalisation, language, entities, intents)
 * Offline, dependency-free. Exposes window.FODO_NLU = { analyse, normalize, entities, intents, detectLang }.
 * Loaded after bot-human.js, before bot-mind.js. Touches no DOM.
 */
(function(){
  "use strict";

  /* ---------- 1. word-level fixes: typos, abbreviations, slang, Roman Hindi → canonical English ---------- */
  const FIX={
    // typos / abbreviations
    wht:"what",wat:"what",whta:"what","wht's":"what's",waht:"what",whats:"what's",abt:"about",abut:"about",bout:"about",pls:"please",plz:"please",plss:"please",
    u:"you",ur:"your",r:"are",y:"why",bcoz:"because",bcz:"because",coz:"because",cuz:"because",thx:"thanks",thnx:"thanks",thanx:"thanks",ty:"thanks",tq:"thanks",
    instgram:"instagram",instagarm:"instagram",instragram:"instagram",insta:"instagram",ig:"instagram",insagram:"instagram",intagram:"instagram",
    gogle:"google",googel:"google",gooogle:"google",googl:"google",facbook:"facebook",fb:"facebook",facebok:"facebook",
    markting:"marketing",marketting:"marketing",marketng:"marketing",markeing:"marketing",mrketing:"marketing",
    whatsap:"whatsapp",watsapp:"whatsapp",whatapp:"whatsapp",whatsaap:"whatsapp",watsap:"whatsapp",wa:"whatsapp",
    websit:"website",webiste:"website",wesite:"website",websiet:"website",sitee:"site",
    advertisment:"advertisement",advertisng:"advertising",advertsing:"advertising",adds:"ads",
    bussiness:"business",busines:"business",buisness:"business",bizness:"business",biz:"business",
    stratgy:"strategy",startegy:"strategy",strategey:"strategy",stratergy:"strategy",
    budjet:"budget",bujet:"budget",budgt:"budget",
    custmer:"customer",costumer:"customer",custumer:"customer",customr:"customer",
    leds:"leads",ledas:"leads",lead:"lead",enquires:"enquiries",inquires:"enquiries",
    convertion:"conversion",converstion:"conversion",
    reels:"reels",reel:"reel",reals:"reels",
    youtub:"youtube",yt:"youtube",linkdin:"linkedin",linkedn:"linkedin",
    shopfy:"shopify",shoppify:"shopify",
    analitics:"analytics",anlytics:"analytics",
    seo:"seo",sseo:"seo",seoo:"seo",sseoo:"seo",
    ecom:"ecommerce","e-commerce":"ecommerce","e-com":"ecommerce",
    dm:"dm",dms:"dms",
    hi:"hi",hii:"hi",hiii:"hi",helo:"hello",hlo:"hello",heyy:"hey"
  };
  // Roman Hindi / Hinglish → English, applied ONLY when the message reads as Hinglish
  const HFIX={
    kya:"what",kia:"what",kyaa:"what",kaise:"how",kese:"how",kaisay:"how",kaisey:"how",kyun:"why",kyu:"why",kyon:"why",kab:"when",kahan:"where",kaha:"where",kaun:"who",kon:"who",
    kitna:"how much",kitne:"how many",kitni:"how much",
    hai:"is",h:"is",he:"is",hain:"are",hy:"is",tha:"was",thi:"was",
    nahi:"not",nahin:"not",nhi:"not",nai:"not",na:"not",mat:"don't",
    rahi:"",rhi:"",raha:"",rha:"",rahe:"",rhe:"",
    chahiye:"need",chaiye:"need",chahie:"need",chaahiye:"need",
    bekar:"bad",bekaar:"bad",bakwas:"bad",ghatiya:"bad",bura:"bad",
    accha:"good",acha:"good",achha:"good",badhiya:"good",badiya:"good",mast:"great",
    mera:"my",meri:"my",mere:"my",aapki:"your",aapka:"your",aapke:"your",apki:"your",apka:"your",apke:"your",tumhari:"your",tumhara:"your",humara:"our",hamara:"our",apna:"own",
    samjhao:"explain",samjha:"explain",samjhaiye:"explain",batao:"tell",bata:"tell",bataiye:"tell",btao:"tell",
    karu:"do",karun:"do",kare:"do",karein:"do",karen:"do",karna:"do",kru:"do",
    paisa:"money",paise:"money",paisey:"money",kharcha:"spend",kharch:"spend",
    dukaan:"shop",dukan:"shop",grahak:"customer",grahakon:"customers",bikri:"sales",
    shuru:"start",madad:"help",help:"help",
    aur:"and",ya:"or",lekin:"but",par:"but",pr:"but",
    bhi:"also",sirf:"only",bahut:"very",bohot:"very",bht:"very",zyada:"more",jyada:"more",kam:"less",
    abhi:"now",aaj:"today",kal:"tomorrow",
    log:"people",logo:"people",logon:"people",
    bhai:"",yaar:"",yr:"",ji:""
  };
  // multi-word / phrase rewrites applied before word fixes
  const PHRASE=[
    [/\bgoogle add?s?\b/g,"google ads"],[/\bmeta add?s?\b/g,"meta ads"],[/\bfb ads?\b/g,"facebook ads"],[/\binsta ads?\b/g,"instagram ads"],
    [/\bmere pa+s\b/g,"i have"],[/\bmere paas\b/g,"i have"],[/\bmera pass\b/g,"i have"],[/\bhumare pa+s\b/g,"we have"],
    [/\bkya (ha?i|h|he)\b/g,"what is"],[/\bkya hota (ha?i|h)\b/g,"what is"],[/\bkise kehte (ha?in|h)\b/g,"what is"],[/\bka matlab\b/g," meaning"],
    [/\bkaise (kare|karein|karu|karte|krein|kre|karen)\b/g,"how to do"],[/\bkaise badhaye?n?\b/g,"how to increase"],[/\bkaise laye?n?\b/g,"how to get"],
    [/\bnahi aa (rahi|rahe|raha|rhi|rhe|rha)\b/g,"not coming"],[/\bnhi aa (rahi|rahe|raha|rhi|rhe|rha)\b/g,"not coming"],[/\bnahi (ho|hoti|hote) (rahi|rahe|raha|rhi|rhe|rha)\b/g,"not happening"],[/\bnhi (ho|hoti) (rahi|rhi)\b/g,"not happening"],
    [/\bchal (rahe|rhe|raha|rha|rahi|rhi)\b/g,"running"],[/\bkaam nahi kar\w*\b/g,"not working"],[/\bkaam nhi kar\w*\b/g,"not working"],
    [/\bsale nahi\b/g,"no sales"],[/\bsale nhi\b/g,"no sales"],[/\bsales nahi\b/g,"no sales"],[/\bleads? nahi\b/g,"no leads"],[/\bleads? nhi\b/g,"no leads"],
    [/\bkitna budget\b/g,"how much budget"],[/\bkitne leads\b/g,"how many leads"],
    [/\bmujhe\b/g,"i"],
    [/\bdhanyavaa?d\b|\bshukriya\b|\bshukria\b/g,"thanks"],
    [/\btell me about\b/g,"about"],[/\bwhat do you mean by\b/g,"what is"],[/\bwhat does (.+?) mean\b/g,"what is $1"]
  ];
  // Devanagari words → English tokens (simple Hindi)
  const DEV={"क्या":"what","है":"is","हैं":"are","कैसे":"how","क्यों":"why","कितना":"how much","कितने":"how many","कौन":"who","कहाँ":"where","कहां":"where","मेरा":"my","मेरी":"my","मेरे":"my","मुझे":"i","मैं":"i","नहीं":"not","आ":"","हो":"","रही":"","रहे":"","रहा":"",
    "लीड":"lead","लीड्स":"leads","सेल":"sale","सेल्स":"sales","बिक्री":"sales","ग्राहक":"customers","वेबसाइट":"website","विज्ञापन":"ads","ऐड":"ads","एड":"ads","ऐड्स":"ads","बजट":"budget","पैसा":"money","पैसे":"money","मार्केटिंग":"marketing","इंस्टाग्राम":"instagram","गूगल":"google","फेसबुक":"facebook","यूट्यूब":"youtube","व्हाट्सएप":"whatsapp",
    "एसईओ":"seo","ब्रांड":"brand","कंटेंट":"content","बिज़नेस":"business","बिजनेस":"business","व्यापार":"business","दुकान":"shop","क्लिनिक":"clinic","रेस्टोरेंट":"restaurant","जिम":"gym","सैलून":"salon",
    "नमस्ते":"hi","नमस्कार":"hi","हेलो":"hello","धन्यवाद":"thanks","शुक्रिया":"thanks","मदद":"help","चाहिए":"need","बताओ":"tell","बताइए":"tell","समझाओ":"explain","समझाइए":"explain","मतलब":"meaning","और":"and","या":"or","लेकिन":"but",
    "दुखी":"sad","उदास":"sad","अकेला":"lonely","अकेली":"lonely","परेशान":"stressed","तनाव":"stress","गुस्सा":"angry","बोर":"bored","मज़ाक":"joke","चुटकुला":"joke","प्यार":"love","शादी":"marry",
    "ऑडिट":"audit","कीमत":"price","दाम":"price","फ्री":"free","संपर्क":"contact","फोन":"phone","नंबर":"number",
    "हजार":"hazar","हज़ार":"hazar","लाख":"lakh","करोड़":"crore","करोड":"crore","रुपये":"rupees","रुपए":"rupees","रु":"rs","करूँ":"do","करूं":"do","करें":"do","करू":"do","करना":"do","बढ़ाएं":"increase","बढ़ाऊं":"increase","ज़्यादा":"more","ज्यादा":"more","और":"more","ग्राहकों":"customers","बुकिंग":"bookings","दिल्ली":"delhi","नोएडा":"noida","मुंबई":"mumbai","गुड़गांव":"gurgaon","गुरुग्राम":"gurugram","पुणे":"pune","जयपुर":"jaipur","लखनऊ":"lucknow","पटना":"patna"};
  const HINGLISH_MARKERS=/\b(rhe|rahe|chal|kya|kaise|kyun|kyu|kitna|kitne|hai|hain|nahi|nhi|mera|meri|mere|mujhe|bhai|yaar|chahiye|karu|kare|karein|batao|samjhao|accha|acha|theek|thik|haan|ha|nahi|paisa|bekar|rahi|rhi|raha|rha|wala|wali|kuch|sab|abhi|aap|tum|hum|mai|main|hoon|hu|ho|ki|ka|ke|ko|se|me|pe|bhi|toh|to|lekin|par|aur|ya|kab|kahan|kaun|dukaan|grahak|kharcha|lakh|hazar|hazaar|achha|kaafi|bohot|bahut|zyada|jyada)\b/g;

  const strip=s=>String(s==null?"":s);
  function detectLang(raw){
    const s=strip(raw);
    if(/[\u0900-\u097F]/.test(s)) return "hi";
    const m=(s.toLowerCase().match(HINGLISH_MARKERS)||[]).length;
    const words=(s.toLowerCase().match(/[a-z]+/g)||[]).length||1;
    // a single marker like "to" or "me" is common English, require a real Hinglish signal
    const strong=/\b(rhe|rahe|kya|kaise|kyun|kyu|kitna|kitne|hai|hain|nahi|nhi|mera|meri|mere|mujhe|bhai|yaar|chahiye|batao|samjhao|accha|acha|haan|bekar|rahi|rhi|raha|rha|kuch|aap|hoon|toh|lekin|kharcha|dukaan|grahak|bohot|bahut|zyada|jyada|kaafi|karu|kare|karein|wala|wali)\b/i.test(s);
    if(strong && (m>=2 || words<=6)) return "hinglish";
    return "en";
  }

  function normalize(raw,langHint){
    const hing=(langHint||detectLang(raw))!=="en";
    let s=strip(raw).normalize("NFKC");
    const emojis=(s.match(/\p{Extended_Pictographic}/gu)||[]);
    s=s.replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu," ");
    s=s.toLowerCase().replace(/[“”]/g,'"').replace(/[‘’`´]/g,"'").replace(/[–—−]/g,"-");
    s=s.replace(/×/g," x ").replace(/÷/g," / ");
    // Devanagari phrases, then tokens
    s=s.replace(/क्या\s*(करूँ|करूं|करें|करू)\s*\??/g," what should i do ").replace(/कैसे\s*(बढ़ाएं|बढ़ाऊं|लाएं|लाऊं)/g," how to increase ");
    s=s.replace(/[\u0900-\u097F]+/g,w=>(DEV[w]!==undefined?" "+DEV[w]+" ":" "+w+" "));
    // repeated letters: "heyyyy"→"heyy", "sooooo"→"soo"; then fix common stretched words
    s=s.replace(/([a-z])\1{2,}/g,"$1$1");
    s=s.replace(/\bhe+y+\b/g,"hey").replace(/\bhi+\b/g,"hi").replace(/\bhel+o+\b/g,"hello").replace(/\bpl+e*a*s+e*\b/g,"please").replace(/\bso+\b/g,"so").replace(/\bno+\b/g,"no").replace(/\bye+s+\b/g,"yes").replace(/\bo+k+\b/g,"ok").replace(/\bthank+s*\b/g,m=>m.startsWith("thanks")?"thanks":"thank");
    s=s.replace(/\bok(ay|ey|ie)?\b/g,"ok");
    PHRASE.forEach(([re,to])=>{ s=s.replace(re,to); });
    if(hing) s=s.replace(/\b(mai|main)\b(?= (ek|1|a|apna|apni|bhi|abhi|kya|kaise|ne))/g,"i");
    s=s.replace(/\bbro\b|\bbruh\b|\bdude\b/g," ");
    // keep digits, letters, %, ₹, + - * / ^ ( ) . , ? : @
    s=s.replace(/[^\w\s%₹+\-*/^().,?:@'&\u0900-\u097F]/g," ");
    const words=s.split(/\s+/).filter(Boolean).map(w=>{
      const bare=w.replace(/[?.,:!]+$/,"");
      const tail=w.slice(bare.length);
      if(Object.prototype.hasOwnProperty.call(FIX,bare)) return FIX[bare]+tail;
      if(hing&&Object.prototype.hasOwnProperty.call(HFIX,bare)) return HFIX[bare]+tail;
      return w;
    }).filter(w=>w!=="");
    s=words.join(" ").replace(/\s+/g," ").trim();
    return {text:s,emojis};
  }

  /* ---------- 2. entities ---------- */
  const CITIES=["new delhi","delhi ncr","south delhi","west delhi","east delhi","north delhi","greater noida","navi mumbai","delhi","ncr","noida","gurgaon","gurugram","faridabad","ghaziabad","dwarka","najafgarh","rohini","janakpuri","saket","lajpat nagar","karol bagh","connaught place","vasant kunj","pitampura","mumbai","bombay","thane","pune","bangalore","bengaluru","hyderabad","chennai","kolkata","ahmedabad","jaipur","lucknow","chandigarh","mohali","panchkula","indore","bhopal","surat","nagpur","patna","kochi","goa","dehradun","ludhiana","amritsar","kanpur","varanasi","agra","meerut","vadodara","coimbatore","visakhapatnam","mysore","mysuru","panipat","sonipat","karnal","rohtak","hisar","jind","safidon","ambala","bhubaneswar","ranchi","guwahati","raipur","jodhpur","udaipur","srinagar","jammu","shimla","motihari","dubai","abu dhabi","london","new york","singapore","toronto","sydney","usa","uk","canada","australia","uae"];
  const IND=[ // [key, regex]
    ["dental",/\b(dental|dentist|dentistry|orthodont\w*|teeth|tooth|braces|aligners?|root canal)\b/],
    ["mentalwellness",/\b(therap(y|ist)|psycholog\w*|counsell?(ing|or)|mental (health|wellness)|wellness cent(er|re))\b/],
    ["medical",/\b(clinic|doctor|hospital|physio\w*|dermatolog\w*|skin clinic|ivf|diagnostic|lab test|pathology|ayurved\w*|homeopath\w*|medical|healthcare|nursing home)\b/],
    ["restaurant",/\b(tiffin|catering|caterer|home food|homemade food|bakery|cake shop|cakes|sweet shop|mithai|restaurant|restro|dhaba|bistro|cloud kitchen|food (delivery|business|outlet)|eatery|dining|biryani|pizza|bakery)\b/],
    ["cafe",/\b(cafe|caf[eé]|coffee shop|coffee|tea (shop|stall)|chai)\b/],
    ["gym",/\b(gym|fitness (studio|cent(er|re)|business)|crossfit|yoga (studio|classes)|pilates|zumba|personal trainer|fitness)\b/],
    ["salon",/\b(salon|saloon|parlou?r|barber\w*|hair ?(cut|dresser|studio)|nail (art|studio)|spa)\b/],
    ["beauty",/\b(beauty|cosmetic\w*|makeup|skincare|skin care|perfume|fragrance)\b/],
    ["realestate",/\b(real ?estate|property|properties|realtor|builder|developer project|plots?|flats?|apartments?|villa|broker|brokerage|housing project)\b/],
    ["coaching",/\b(coaching|coach|tuition|tutor\w*|ias|upsc|neet|jee|test prep|online course|course creator|cohort)\b/],
    ["education",/\b(school|college|university|institute|academy|edtech|education|admissions?|preschool|play ?school)\b/],
    ["saas",/\b(saas|software|app (business|startup)|b2b software|crm tool|platform startup|subscription software)\b/],
    ["fashion",/\b(fashion|clothing|apparel|boutique|kurtis?|sarees?|ethnic wear|streetwear|footwear|shoes?|clothes|garments?)\b/],
    ["d2c",/\b(handmade|candles?|homemade|crafts?|resin art|soaps?|pickles?|achaar|d2c|dtc|direct to consumer|own brand|skincare brand|food brand|ghee|snacks? brand|consumer brand)\b/],
    ["ecommerce",/\b(sell online|selling online|online business|ecommerce|online store|shopify|woocommerce|amazon seller|flipkart seller|online shop|e store|dropshipping|marketplace seller)\b/],
    ["hotel",/\b(hotel|resort|homestay|hostel|guest ?house|bnb|airbnb|banquet)\b/],
    ["travel",/\b(travel agency|travel business|tour(s| operator| packages?)|holiday packages?|travel company|trips?|visa services|corporate travel)\b/],
    ["automotive",/\b(car (dealer\w*|showroom|wash|detailing|rental|service)|automobile|automotive|bike (showroom|dealer|service)|garage|ev dealer|tyres?)\b/],
    ["interiors",/\b(interior\w*|home decor|modular kitchen|furniture|architect\w*)\b/],
    ["construction",/\b(construction|contractor|civil work|renovation|building materials?|cement|tiles|plumb\w*|electrician)\b/],
    ["legal",/\b(lawyer|advocate|law firm|legal services?|attorney|ca firm|chartered accountant|tax consultant|gst consultant)\b/],
    ["finance",/\b(finance|financial advis\w*|insurance|loans?|mutual funds?|wealth management|stock broker|fintech|nbfc|investment advis\w*)\b/],
    ["photography",/\b(photograph\w*|photo studio|videograph\w*|studio shoot|pre ?wedding shoot)\b/],
    ["wedding",/\b(wedding|weddings|event planner|event management|decorators?|caterers?|mehendi|bridal|marriage hall)\b/],
    ["influencer",/\b(influencer|i am an influencer|content creator brand deals|ugc creator)\b/],
    ["creator",/\b(creator|youtuber|youtube channel|podcast\w*|blogger|instagram page|personal brand)\b/],
    ["startup",/\b(startup|start up|early stage|pre ?seed|seed stage|founder)\b/],
    ["b2b",/\b(b2b|manufactur\w*|wholesale|distributor|industrial|exporter|supplier|it services|agency services|enterprise)\b/],
    ["professional",/\b(consultant|consultancy|consulting|freelancer|agency|accountant|hr services|recruit\w*)\b/],
    ["jewellery",/\b(jewell?ery|jeweller|gold|diamond|silver jewell?ery)\b/],
    ["pharmacy",/\b(pharmacy|chemist|medical store)\b/],
    ["petcare",/\b(pet (shop|care|grooming|clinic)|vet\b|veterinar\w*|dog grooming)\b/],
    ["local",/\b(local (business|shop|store)|kirana|shop|store|showroom|repair|laundry|tailor|optical|stationery|hardware)\b/]
  ];
  const CHANNELS=[["meta",/\b(meta|facebook ads|instagram ads|fb|meta ads)\b/],["google",/\b(google ads|google search|ppc|search ads|adwords|google)\b/],["instagram",/\binstagram\b/],["facebook",/\bfacebook\b/],["youtube",/\byoutube\b/],["linkedin",/\blinkedin\b/],["seo",/\bseo\b/],["whatsapp",/\bwhatsapp\b/],["email",/\b(email|newsletter)\b/],["tiktok",/\btiktok\b/],["gbp",/\b(google business profile|gbp|google my business|gmb|google maps)\b/],["influencer",/\b(influencers?|creators?|ugc)\b/],["website",/\b(website|site|landing page)\b/]];
  const GOALS=[["leads",/\b(leads?|enquir\w*|inquir\w*|queries|calls|dms)\b/],["bookings",/\b(bookings?|appointments?|reservations?|footfall|walk[ -]?ins?|table bookings?|consultations)\b/],["sales",/\b(sales|sell more|revenue|orders?|customers?|clients?|conversions?)\b/],["awareness",/\b(awareness|brand awareness|visibility|reach|known|recognition|presence)\b/],["followers",/\b(followers?|engagement|likes|views|viral|grow (my )?(page|account|instagram))\b/],["traffic",/\b(traffic|visitors)\b/],["retention",/\b(retention|repeat (customers|orders|purchase)|loyalty|churn)\b/],["admissions",/\b(admissions?|enrol(l)?ments?|students)\b/],["hiring",/\b(hiring|recruit\w*)\b/]];

  const UNIT={k:1e3,thousand:1e3,hazar:1e3,hazaar:1e3,hajar:1e3,hzr:1e3,l:1e5,lac:1e5,lacs:1e5,lakh:1e5,lakhs:1e5,lk:1e5,cr:1e7,crore:1e7,crores:1e7,m:1e6,mn:1e6,million:1e6};
  const ROLE={
    budget:/^(budget|budgets|have|paas|invest|investing|allocate|allocated|afford)$/,
    spend:/^(spent|spend|spending|spends|kharch|kharcha|wasted|waste|lagaya|laga|lagaye|burned|burnt|blew|invested|adspend|cost|costs)$/,
    revenue:/^(revenue|revenues|turnover|earned|earn|earning|made|make|kamaya|kamai|income|target|generate|generated|gmv|sales?)$/,
    aov:/^(aov|ticket|basket|priced|price|fee|fees|charge|charges|worth|value)$/,
    leads:/^(leads?|enquiries|enquiry|inquiries|inquiry|queries|query|dms|calls|forms|signups|sign-ups|registrations|trials?|trial-signups|installs|downloads)$/,
    clicks:/^(clicks?|link-clicks)$/,
    impressions:/^(impressions?|views|reach|impr)$/,
    visitors:/^(visitors?|visits?|traffic|sessions?|users)$/,
    appointments:/^(appointments?|bookings?|booked|demos?|consultations?|meetings?|visits-booked|site-visits|walkins|walk-ins)$/,
    customers:/^(customers?|orders?|clients?|patients?|conversions?|convert|converted|converts|paid|paying|buyers?|purchases?|closed|closures|admissions?|members|deals|students|guests|sales)$/,
    qualified:/^(qualified|sqls?|mqls?)$/,
    cpl:/^(cpl|cost-per-lead)$/,
    cpc:/^(cpc)$/,
    roas:/^(roas)$/
  };
  function parseAmount(numStr,unit,hasCur){
    let n=parseFloat(String(numStr).replace(/,/g,""));
    if(!Number.isFinite(n))return null;
    const u=(unit||"").toLowerCase(); if(u&&UNIT[u])n*=UNIT[u];
    return {value:n,money:!!(hasCur||u&&UNIT[u]&&u!=="m"||false)};
  }
  function entities(raw,norm){
    const n=norm||normalize(raw).text, out={numbers:[],amounts:[],percents:[]};
    // locations
    for(const c of CITIES){ const re=new RegExp("\\b"+c.replace(/ /g,"\\s+")+"\\b"); if(re.test(n)){ out.location=c.replace(/\b\w/g,m=>m.toUpperCase()).replace(/^Ncr$/,"Delhi NCR").replace(/^Usa$|^Uk$|^Uae$/,m=>m.toUpperCase()); break; } }
    // industry
    for(const [k,re] of IND){ if(re.test(n)){ out.industry=k; break; } }
    // business phrase
    if(out.industry){ const re=IND.find(x=>x[0]===out.industry)[1]; const m=n.match(new RegExp(re.source+"(\\s+(?:clinic|shop|store|studio|brand|business|agency|firm|restaurant|cafe|centre|center|company|startup|academy|institute|practice|salon|outlet|showroom|channel|page))?")); if(m) out.business=m[0].trim(); }
    // channels & goals
    out.channels=CHANNELS.filter(([k,re])=>re.test(n)).map(x=>x[0]);
    for(const [k,re] of GOALS){ if(re.test(n)){ out.goal=k; break; } }
    // name
    const nm=raw.match(/\b(?:my name is|i am called|call me|mera naam|this is)\s+([A-Za-z][A-Za-z]{1,20})(?:\s+(?:hai|h|here))?\b/i)||raw.match(/^(?:i'm|i am)\s+([A-Z][a-z]{2,20})[.!,]?\s*$/);
    if(nm&&!/^(a|an|the|bored|sad|fine|good|ok|okay|tired|new|here|back|not|so|very|from|in|at|looking|trying|running|feeling|happy|lonely|angry|frustrated|stressed|confused|done)$/i.test(nm[1])) out.name=nm[1][0].toUpperCase()+nm[1].slice(1).toLowerCase();
    // website / url
    const url=raw.match(/\b((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.(?:com|in|co\.in|net|org|io|store|shop|co|ai|app|biz|info)(?:\/[^\s]*)?)\b/i); if(url) out.website=url[1];
    // competitors
    const cm=n.match(/\bcompetitors? (?:is|are|like|:)\s+([a-z0-9 ,&-]{2,60})/); if(cm) out.competitors=cm[1].split(/,| and /).map(s=>s.trim()).filter(Boolean).slice(0,4);
    // crm / follow-up
    if(/\b(no crm|don'?t have (a )?crm|excel|spreadsheet|notebook|register)\b/.test(n)) out.crm="none / spreadsheet";
    else { const crm=n.match(/\b(zoho|hubspot|salesforce|leadsquared|pipedrive|bitrix|freshsales|odoo|gohighlevel|kylas|crm)\b/); if(crm) out.crm=crm[1]; }
    // pain points
    const pains=[];
    [[/\b(no|not|zero|few|less|low|kam)\b.{0,12}\b(leads?|enquir\w*)\b|\bleads? (are )?not coming\b/,"few leads"],[/\b(no|not|zero|few|low)\b.{0,12}\b(sales?|customers?|orders?|conversions?)\b|\bno sales\b|\bnot (buying|converting)\b/,"leads/traffic not converting"],[/\bclicks?\b.{0,30}\b(no|not|zero)\b.{0,10}\b(sales?|leads?|conversions?)\b/,"clicks without conversions"],[/\b(not working|doesn'?t work|isn'?t working|failed|flop)\b/,"channel not working"],[/\b(expensive|high) (cpc|cpl|cpm|cost)\b|\b(cpc|cpl|cac) (is )?(too )?high\b/,"high acquisition cost"],[/\b(low|bad) (ctr|engagement|reach)\b/,"low engagement/CTR"],[/\b(bad|poor|junk|fake|low quality) leads?\b/,"poor lead quality"],[/\bwebsite (is )?(bad|slow|not converting|outdated|old)\b/,"website not converting"],[/\bno (time|team)\b/,"no time/team"]].forEach(([re,l])=>{ if(re.test(n))pains.push(l); });
    if(pains.length) out.pains=pains;

    // numbers with roles
    const toks=n.replace(/([₹])/g," $1 ").replace(/(\d)([a-z%])/g,"$1 $2").replace(/([a-z])(\d)/g,"$1 $2").replace(/[:=]/g," ").split(/\s+/).filter(Boolean);
    const items=[];
    for(let i=0;i<toks.length;i++){
      const t=toks[i].replace(/[,?.!]+$/,"");
      if(!/^\d[\d,]*(\.\d+)?$/.test(t))continue;
      let j=i+1, unit=null, pct=false, cur=false;
      const nx=(toks[j]||"").replace(/[,?.!]+$/,"");
      if(UNIT[nx]){ unit=nx; j++; }
      else if(nx==="%"||nx==="percent"||nx==="pct"||nx==="per"&&toks[j+1]==="cent"){ pct=true; j+=(nx==="per"?2:1); }
      const pv=(toks[i-1]||"");
      if(pv==="₹"||/^(rs\.?|inr|rupees?|rupay|rupaye)$/.test(pv)) cur=true;
      if(/^(rs\.?|inr|rupees?|rupay|rupaye|₹)$/.test((toks[j]||"").replace(/[,?.!]+$/,""))){ cur=true; j++; }
      const a=parseAmount(t,unit,cur); if(!a)continue;
      const before=[toks[i-1],toks[i-2],toks[i-3]].map(x=>(x||"").replace(/[,?.!]+$/,"")).filter(x=>x!=="₹"&&!/^(rs\.?|inr|of|on|the|a|an|is|are|was|were|me|my|in|for|per|total|about|around|approx|approximately|roughly|only|just|from|with|got|get|getting|we|i|and|did|on)$/.test(x));
      const after=[toks[j],toks[j+1]].map(x=>(x||"").replace(/[,?.!]+$/,""));
      items.push({i,value:a.value,money:a.money||cur,pct,before,after,raw:t+(unit?unit:"")});
      i=j-1;
    }
    const roleOf=w=>{ if(!w)return null; for(const r in ROLE){ if(ROLE[r].test(w))return r; } return null; };
    // determine dominant style
    let bc=0,ac=0; items.forEach(it=>{ if(roleOf(it.before[0]))bc++; if(roleOf(it.after[0]))ac++; });
    items.forEach((it,k)=>{
      const afterOk=w=>w&&!/^(have|got|paas|invest|invested|spent|spend|made|make|earned|generate|generated|revenue|target)$/.test(w);
      let rb=roleOf(it.before[0])||roleOf(it.before[1]), ra=(afterOk(it.after[0])&&roleOf(it.after[0]))||(it.after[0]&&/^(in|of|per|from|on|worth|and|got|have)$/.test(it.after[0])?null:(afterOk(it.after[1])&&roleOf(it.after[1])));
      if(it.after[0]&&/^(revenue|turnover|sales|gmv|target)$/.test(it.after[0])&&it.money) ra="revenue";
      // phrase-level overrides
      const ctx=" "+it.before.slice().reverse().join(" ")+" # "+it.after.join(" ")+" ";
      if(/ (order value|per order|per customer|per sale|per client|per patient|ticket size|average order|avg order|selling price) /.test(" "+toks.slice(Math.max(0,it.i-4),it.i).join(" ")+" ")) rb="aov";
      if(/^(order|per)$/.test(it.after[0])&&/^(value|order|customer|sale)$/.test(it.after[1]||"")) ra="aov";
      if(it.pct){
        const w=toks.slice(Math.max(0,it.i-4),it.i+5).join(" ");
        let pr=/margin/.test(w)?"margin":/clos(e|ing)|close rate|win rate/.test(w)?"closeRate":/ctr|click.?through/.test(w)?"ctr":/conversion|cvr|convert/.test(w)?"cvr":/growth|increase|grow/.test(w)?"growth":null;
        out.percents.push({value:it.value,role:pr});
        if(pr)out[pr]=it.value;
        return;
      }
      let role=null;
      if(rb&&ra) role=(rb==="spend"||rb==="revenue")?rb:(bc>=ac?rb:ra); else role=rb||ra;
      if(role==="budget"&&ra&&ra!=="budget") role=ra; // "have 500 leads"
      if(!role&&it.money){ role="amount"; }
      it.role=role;
      out.numbers.push({value:it.value,role,money:it.money});
      if(role&&role!=="amount"&&out[role]==null) out[role]=it.value;
    });
    // un-roled money: decide budget vs spend vs revenue from sentence
    const unroled=out.numbers.filter(x=>x.role==="amount");
    if(unroled.length){
      const v=unroled[0].value;
      if(/\b(spent|wasted|lost|burn(ed|t)?|blew|kharch|lagaya|lagaye|gaya|gaye|invested)\b/.test(n)&&out.spend==null) out.spend=v;
      else if(/\b(revenue|turnover|target|earn|kamai|income|sales of|monthly sales|gmv)\b/.test(n)&&out.revenue==null) out.revenue=v;
      else if(/\b(aov|order value|per order|ticket|price|priced|costs? per|charge|fees?)\b/.test(n)&&out.aov==null) out.aov=v;
      else if(out.budget==null) out.budget=v;
      unroled[0].role=out.budget===v?"budget":out.spend===v?"spend":out.revenue===v?"revenue":"aov";
    }
    // lone small number with "k" like "20k" handled above; "per month" budget flag
    if(out.spend!=null&&out.budget==null&&!/\b(spent|wasted|lost|burn(ed|t)|blew|kharch (kiya|kar diya)|lagaya|lagaye|invested)\b/.test(n)&&/\b(can|will|want to|plan to|planning to|ready to|able to|could|should i|afford to) spend\b|\bspend (per|a|every) month\b|\bto spend\b/.test(n)){ out.budget=out.spend; delete out.spend; }
    if(out.budget!=null&&/\b(per month|monthly|a month|pm|\/month|mahina|mahine)\b/.test(n)) out.budgetPeriod="month";
    return out;
  }

  /* ---------- 3. intents (multi-label, scored) ---------- */
  const I=[];
  const def=(name,score,...res)=>I.push({name,score,res});
  // casual / social
  def("greeting",3,/^(hi|hello|hey|hola|namaste|namaskar|yo|sup|wassup|good (morning|afternoon|evening)|gm|hey there|hi there|hello there|salaam|sat sri akal|ram ram|jai shree krishna|radhe radhe)( (there|bot|fodo|fodo bot|team|buddy|friend))?[!. ]*$/);
  def("goodbye",3,/^(bye|bye bye|goodbye|good night|gn|see (you|ya)|cya|talk later|ttyl|gotta go|chalo bye|alvida|ok bye|tata)\b/,/\b(bye|good night)[!. ]*$/);
  def("thanks",3,/^(ok |okay )?(thanks|thank you|thank|thx|shukriya|dhanyavad|much appreciated|appreciate it|great thanks|cool thanks)\b/,/\b(you'?re a lifesaver|lifesaver|that helped|this helped|very helpful thanks)\b/,/\b(thanks|thank you)( so much| a lot| bro| man)?[!. ]*$/);
  def("compliment",3,/\b(good bot|smart bot|nice bot|you('| a)re (smart|great|awesome|amazing|helpful|brilliant|the best|good|genius|cool)|you are (smart|great|awesome|amazing|helpful|brilliant|the best|good|genius|cool)|great (answer|job|bot)|well done|impressive|love (this|it|your answers)|very helpful|so helpful|bahut badhiya|mast hai|great is)\b/);
  def("howareyou",3,/\b(how are you|how r you|how are u|how's it going|hows it going|how you doing|how are things|kaise ho|kaisa hai|kya haal|kya chal raha|sab badhiya|what's up|whats up|wassup|how is your day|how was your day)\b/,/^how are you\b/);
  def("love",4,/\b(i love you|love you|luv (u|you)|i like you|i have a crush|crush on you|be my (girlfriend|boyfriend|valentine)|i adore you|pyar|i love u)\b/);
  def("flirt",3,/\b(you('| a)re (cute|hot|sexy|beautiful|handsome)|you are (cute|hot|sexy|beautiful|handsome)|date me|go on a date|kiss me|are you single|single\?|wanna date|send nudes|flirt)\b/);
  def("marriage",4,/\b(marry me|will you marry|shaadi kar|marry\b|be my wife|be my husband|wedding with you)\b/);
  def("profanity",5,/\b(teri maa|teri behen|maa ki|behen ki|tera baap|lodu|lavde|lawde|chodu|bhadwe|kamine|kameene|fuck|f\*ck|fck|fuk|shit|bitch|bastard|asshole|dick|madarchod|mc|bc|bhenchod|behenchod|chutiya|chutiye|gandu|harami|kutta|kutte|saala|saale|bsdk|bhosdi\w*|lund|randi)\b/);
  def("insult",4,/\b(you('| a)re (stupid|dumb|useless|an idiot|idiot|trash|garbage|worst|bad|boring|slow|annoying|pathetic)|you are (stupid|dumb|useless|an idiot|idiot|trash|garbage|worst|bad|boring|slow|annoying|pathetic)|stupid bot|dumb bot|useless bot|idiot bot|i hate you|hate you|you suck|shut up|bakwas bot|pagal|bewakoof|bekar bot|worst bot|you know nothing|faltu)\b/);
  def("identity",4,/\b(tu kaun|tum kaun|aap kaun|kaun hai tu|kaun ho tum|are you (a |an )?(human|bot|robot|real|ai|person|machine|chatgpt|gpt|alive|a real person|sentient|conscious)|r you (human|bot|real)|who are you|what are you|your name|what is your name|who (made|built|created) you|who is your (creator|maker|owner)|are you chat ?gpt|which (model|ai)|tum kaun|aap kaun|kaun ho|are you conscious|do you have feelings|can you feel|do you think|are you self aware|what can you do|what all can you do|your capabilities)\b/);
  def("joke",4,/\b(tell (me )?(a )?joke|joke sunao|joke please|make me laugh|something funny|say something funny|ek joke|chutkula|another joke|one more joke|marketing joke|a joke)\b/,/^jokes?\??$/);
  def("roast",4,/\b(roast me|roast my|roast (this|him|her)|insult me)\b/);
  def("bored",4,/\b(i('| a)?m bored|i am bored|bored|boring day|nothing to do|bore ho( raha| rahi)?|bore|entertain me|kuch (interesting|mazedaar))\b/);
  def("eat",3,/\b(what do you eat|do you eat|are you hungry|favou?rite food|khana khaya|what('s| is) your favou?rite (food|dish))\b/);
  def("iq",3,/\b(what('s| is) your iq|your iq|how smart are you|are you smart|how intelligent|kitne smart|kitna smart|smart ho)\b/);
  def("age",3,/\b(how old are you|your age|when were you (born|made)|birthday)\b/);
  def("botpersonal",3,/\b(where do you live|where are you from|do you sleep|are you tired|favou?rite (colou?r|movie|song|book|sport)|do you have (friends|a family|a girlfriend|a boyfriend)|what do you do for fun|do you dream|can you see me|are you watching|do you like me|are you happy|are you sad)\b/);
  def("laugh",2,/^(lol|lmao|haha+|hehe+|rofl|😂|xd|hahah\w*)[!. ]*$/);
  def("ack",2,/^(ok|okay|k|kk|cool|nice|great|fine|alright|got it|hmm+|hm+|hmmm+|achha|accha|theek hai|thik hai|sahi|right|sure|noted|perfect|awesome|good)[!. ]*$/);
  def("yes",2,/^(yes|yeah|yep|yup|ya|haan|han|ha|sure|of course|definitely|absolutely|please do|do it|go ahead|go on|ok do it|yes please|bilkul|kar do|chalo|let'?s do it|let'?s go)[!. ]*$/);
  def("no",2,/^(no|nope|nah|nahi|not now|later|maybe later|no thanks|nahi chahiye|not really)[!. ]*$/);
  // emotional
  def("crisis",10,/\b(kill myself|suicid\w*|end my life|want to die|wanna die|don'?t want to live|do not want to live|self.?harm|hurt myself|cut myself|no reason to live|better off dead|marna chahta|marna chahti|mar jaun|jeena nahi|khudkushi|aatmahatya)\b/);
  def("sad",4,/\b(feeling (really |very |so |a bit |quite )?(low|down|sad|bad|empty|lost|terrible|awful)|failed (my |the |an |in )?(exam|test|interview|paper|board)|co-?founder (left|quit)|(business )?partner (left|quit|cheated)|lost my job|got fired|laid off|i('| a)?m (so |very |really )?(sad|depressed|down|upset|unhappy|heartbroken|broken|hurt|crying|low)|i feel (sad|depressed|down|low|empty|hopeless|worthless|lost)|feeling (sad|down|low|depressed|hopeless)|dukhi|udaas|mood off|bad day|rough day|everything is going wrong|nothing is going right)\b/);
  def("lonely",4,/\b(lonely|alone|no friends|nobody (cares|likes me|understands)|akela|akeli)\b/);
  def("stress",4,/\b(too much work|work is too much|workload|overworked|so much work|kaam bahut|stress(ed)?|anxious|anxiety|overwhelm(ed|ing)?|burn(ed|t)? ?out|exhausted|tension|pressure|panic|can'?t sleep|so tired|tired of everything|pareshan)\b/);
  def("angry",3,/\b(i('| a)?m (so )?(angry|furious|pissed|mad)|angry|gussa|irritated|fed up)\b/);
  def("frustrated",4,/\b(frustrat\w*|i give up|giving up|nothing works|nothing is working|tried everything|fed up|sick of|thak gaya|thak gayi|haar gaya)\b/);
  def("heartbreak",5,/\b(breakup|broke up|break up|heartbreak|heart broken|she left me|he left me|dumped me|cheated on me|divorce)\b/);
  def("failure",5,/\b(wasted|lost|burn(ed|t)|blew)\b.{0,40}\b(money|lakh|lakhs|k\b|budget|on ads|rupees|\d)|\b(business|company|startup|shop|store|dhanda|dukaan) (is )?(dying|failing|going down|shutting|closing|sinking|in loss|dub|doob|band ho|thapp|thap)\w*|\b(in loss|huge loss|making losses|no money left|going bankrupt|can'?t pay)\b/);
  def("lost",4,/\b(i don'?t know what i('| a)?m doing|don'?t know where to start|no idea (what|where|how) to|i'?m confused|completely lost|so confused|kuch samajh nahi|samajh nahi aa)\b/);
  def("excited",3,/\b(i('| a)?m (so )?(excited|pumped|happy)|just launched|finally launched|got my first (sale|client|customer|order)|we hit|crossed \d+|best day)\b/);
  def("motivation",4,/\b(motivate me|need motivation|motivation|inspire me|feeling demotivated|demotivated|lazy|procrastinat\w*|no energy)\b/);
  // live / current data
  def("live",6,/\b(weather|forecast|rain|temperature)\b.{0,20}\b(today|tomorrow|tonight|now|this week|in [a-z]+)\b|\b(tomorrow|tonight)\b.{0,20}\b(weather|forecast|rain)\b/,/\b(today'?s|latest|current|right now|live|this week'?s|breaking)\b.{0,25}\b(news|headlines?|score|weather|price|rate|stock|share price|nifty|sensex|bitcoin|crypto|gold|petrol|diesel|algorithm|update|trend|trends|election|results?)\b/,/\b(news today|weather (today|now|in)|stock price|share price|gold rate|petrol price|bitcoin price|crypto price|nifty|sensex|who won|match score|ipl score|election results?|current algorithm|instagram algorithm (now|2026|today|currently)|algorithm right now|trending (now|today)|what'?s trending)\b/,/^(what'?s|what is) (the )?(weather|news)\b/);
  def("live",6,/\bwho is (the )?(current |present |new )?(ceo|prime minister|president|chief minister|cm|governor|captain|chairman|pm|finance minister|home minister|owner) of (?!fodo)/);
  def("datetime",5,/\b(what('s| is) (the )?(time|date|day) (now|today|is it)?|what time is it|today'?s date|what day is (it|today)|aaj (kya )?(date|tarikh|din))\b/,/^(time|date)\??$/);
  // teaching levels / follow-ups
  def("eli10",5,/\b(like i'?m (5|10|five|ten|a kid|a child)|eli5|eli10|explain (it )?simpl(y|er)|simpler|in simple (words|terms|language)|easy (words|language)|asaan bhasha|simple bhasha|aasan shabdon)\b/);
  def("deeper",5,/\b(go deeper|deeper|in depth|in detail|more detail|detailed|advanced|expand( on)?( that| it)?|elaborate|tell me more|more about (this|that|it)|and more|explain more|aur batao|aur detail)\b/);
  def("example",4,/\b(give (me )?(an )?example|for example\??$|example please|show me an example|example do|ek example|e\.?g\.?\??$|like what\??$|such as\??$)\b/);
  def("why",3,/^(why|why\?|but why|why so|why is that|how come|kyun|kyu)[?!. ]*$/);
  def("how",3,/^(how|how\?|how so|how exactly|how to do (that|it|this)|but how|kaise|how do i do (that|it|this)|how do we do (that|it|this))[?!. ]*$/);
  def("next",3,/^(then what|what next|next|what'?s next|and then|after that|now what|next step|next steps|phir|uske baad|then)[?!. ]*$/);
  def("whatabout",3,/^(what about|how about|and|same for|what if|what about for|and for|aur)\b/);
  // FODO
  def("fodo_what",5,/\b(what is fodo|what'?s fodo|who is fodo|about fodo|tell me about (fodo|your company|your agency|you guys)|what does fodo do|what do you (guys )?do|what you do|fodo full form|fodo meaning|fodo stand|what does fodo mean|fear of digitally out|fodo kya)\b/,/^fodo\??$/);
  def("fodo_services",5,/\b(your services|what services|services (do you|you) (offer|provide)|fodo services|services list|list (of )?services|what can fodo do|what all do you do|services\??$|do you (do|offer|provide) (\w+ )?(seo|ads|social|websites?|branding|content|video|design|influencer|automation|crm|analytics))\b/);
  def("fodo_price",5,/\b(price batao|rate batao|charges batao|kitna lagega|kitne ka hai|kitne mein|fees kitni|fees how much|your fees|how much is your|how much (do|does|will) (you|fodo|it) (charge|cost)|your (price|pricing|fees|charges|rates|packages?)|fodo (price|pricing|cost|fees|charges)|pricing|price list|packages?|retainer|cost of (your|fodo)|how much for|what do you charge|kitna (lete|charge)|charges kya|fees kya)\b/,/^(price|pricing|cost|fees|charges|rates)\??$/);
  def("fodo_audit",5,/\b(free (growth )?audit|growth audit|book (an |a )?audit|audit (kaise|book)|get (an |a )?audit|is (the )?audit (really )?free|what is the audit)\b/,/^(free audit|audit)\??$/);
  def("fodo_contact",5,/\b(contact (you|fodo|anmol|details)|how (can|do) i (contact|reach|call|talk to) (you|fodo|anmol|someone|a human)|phone number|your number|whatsapp number|email (id|address)|your email|talk to (a )?(human|person|anmol|someone|team)|speak to (a )?(human|person|someone)|book a call|schedule a call|call me|contact anmol|real person)\b/,/^(contact|call|whatsapp|email|phone)\??$/);
  def("fodo_founder",5,/\b(who is (the )?(founder|owner|ceo)( of fodo)?$|who (founded|started|owns|runs) fodo|founder of fodo|fodo founder|your founder|the founder\??$|anmol|who is behind (fodo|this))\b/,/^(founder|who is the founder\??)$/);
  def("fodo_process",4,/\b(how do you work|your process|how does (it|fodo) work|growth system|how (do|can) (we|i) start|onboarding|what happens (after|next)|steps to start|how to start with (you|fodo)|working with you)\b/);
  def("fodo_guarantee",5,/\b(guarantee\w*|guaranteed|promise (results|leads|sales)|assured|100%? results?|will i get results|results pakka)\b/);
  def("fodo_contract",4,/\b(contract|lock.?in|notice period|minimum (term|period|commitment)|agreement|cancel (anytime|contract)|month to month)\b/);
  def("fodo_timeline",4,/\b(how long (until|till|before|does it take|will it take)|how soon|how fast can|when will i see results|timeline|kitna time|kitne din|results in how many)\b/);
  def("fodo_location",4,/\b(where are you (located|based)|your (office|address|location)|where is fodo|fodo address|office kahan|which city are you)\b/);
  def("fodo_why",5,/\b(why (should i )?(choose|pick|hire|trust|go with|work with) (you|fodo)|why fodo|what makes (you|fodo) different|how are you different|your (usp|advantage)|better than other agencies|why not (another|other) agency|kyu choose)\b/);
  def("fodo_trust",4,/\b(can i trust|is (fodo|this) (legit|genuine|real|safe)|scam|fraud|are you legit|reviews? of fodo|testimonials?|case stud(y|ies)|past (work|clients)|your clients|who have you worked with|portfolio|results you got|proof)\b/);
  def("fodo_objection",4,/\b(too expensive|very expensive|costly|out of (my )?budget|can'?t afford|tried (an )?agenc(y|ies)|agencies (don'?t|never) work|burned by (an )?agency|i'?ll think|let me think|not sure (about|if) (hiring|agency)|small business can'?t|we do it (ourselves|in.?house)|freelancer is cheaper|why pay an agency)\b/);
  def("fodo_tools",6,/\b(play the game|fodo challenge|the game|marketing quiz|the quiz|growth score|roi calculator|growth calculator|resources|checklists?|tools on (the|your) site|growth lab)\b/,/^(game|quiz|play|growth score|roi calculator|calculator)\??$/);
  def("idea",5,/\b(marketing|growth|promotion|business|campaign) ideas?\b|\bgive me (an |some )?ideas?\b|\bidea do\b/);
  def("fodo_founding",4,/\b(founding (client|programme|program|partner|slots?)|founding|discount|offer for (new|first) clients|any offers?)\b/);
  def("fodo_report",3,/\b(how do you report|reporting|reports?|dashboard|weekly (update|numbers))\b/);
  def("fodo_ownership",3,/\b(who owns (the )?(ad )?accounts?|own(ership)? of (accounts|assets|data)|will i own)\b/);
  def("fodo_industries",3,/\b(which industries|industries (do you|you) (serve|work)|do you work with (\w+ ?){1,3}|industries you serve)\b/);
  def("fodo_videos",3,/\b(do you (make|shoot|produce|do) (videos?|photos?|design|graphics|logos?|reels?)|video production|shoot)\b/);
  def("fodo_platform",3,/\b(which (website )?platform do you (use|build)|which website platform|wordpress or shopify|do you use (wordpress|shopify|webflow)|webflow)\b/);
  def("fodo_hiring",3,/\b(are you hiring|job|jobs|internship|vacanc(y|ies)|career at fodo|work for fodo|join fodo|join your team)\b/);
  def("fodo_minbudget",4,/\b(minimum (ad )?budget|min budget|least budget|smallest budget|how much (do i need|should i spend) (to start|minimum)|minimum spend)\b/);
  // marketing calc / data
  def("math",6,/^[\s\d+\-*/^().,%x×÷=?]+$/,/\b(calculate|calc|compute|solve|what is|what'?s|whats)\s*[-\d(]/,/\d\s*(plus|minus|times|into|multiplied by|divided by|by|over|x|\*|\/|\+|-|\^|to the power( of)?)\s*[-\d(]/,/\b(sqrt|square root|cube root|squared|cubed|percent of|% of|factorial)\b/,/\b\d+(\.\d+)?\s*%\s*(of|off)\b/,/\bwhat percent(age)? (of|is)\b/,/\b(convert|in) (km|miles|kg|lbs?|pounds|celsius|fahrenheit|cm|inches|feet|meters?)\b/);
  def("metric_calc",6,/\b(ctr|cpc|cpm|cpl|cpa|cac|roas|roi|cvr|conversion rate|aov|ltv|clv|cost per (lead|click|acquisition|sale)|break.?even|breakeven)\b.*\d|\d.*\b(ctr|cpc|cpm|cpl|cpa|cac|roas|roi|cvr|conversion rate|aov|ltv|cost per (lead|click|acquisition|sale)|break.?even|breakeven)\b/);
  def("revenue_target",6,/\b(how many (leads|customers|sales|visitors|clicks|orders|clients|patients)|leads (do )?i need|customers (do )?i need|need to reach|to hit|to achieve|to make)\b.*\d|\d.*\b(how many (leads|customers|sales|visitors|orders|clients))\b/);
  // teaching
  def("promise",6,/\b(will|would|can|does|do|could)\b.{0,25}\d.{0,25}\b(give|get|bring|generate|guarantee|fetch)\b.{0,15}\d+\s*(leads?|sales|customers|followers|orders|clients|calls|bookings)\b/,/\b(how many|kitne) (leads|sales|customers|orders|bookings)\b.{0,30}\b(will|can|would) i (get|expect)\b/,/\bkitne leads? (aayenge|milenge|aaenge)\b/);
  def("teach",4,/\b\w+ what is\??$/,/^(what is|what'?s|what are|whats|define|definition of|explain|meaning of|tell me about|about|describe|what do you mean by|what does .+ mean|how does .+ work|how do .+ work|teach me|learn)\b/,/\b(meaning|kya hai|matlab|samjhao|explain)\b/,/\b(vs|versus|difference between|compare|comparison|better)\b/,/^[a-z0-9 /&+-]{2,40}\?$/);
  def("compare",4,/\b(vs\.?|versus|difference between|differ from|compare|comparison|which is better|or (google|meta|seo|ads|instagram|facebook|linkedin|youtube)|better (for|than))\b/);
  // marketing work
  def("strategy",4,/\b(marketing|promotion|advertising) how( to)? do\b|\bhow to do marketing\b|\bhow (do|can) i do marketing\b/,/\b(strategy|strategies|plan|roadmap|game ?plan|what should i (do|advertise|promote|run|focus on|post|sell|fix)|what (do|can) i (advertise|promote)|what do i do|where (do i|should i) start|how (do|can|should) i (grow|scale|start|market|promote|get more)|how to (grow|scale|market|promote|get more|increase|start)|help me (grow|with)|grow my|scale my|promote my|market my|advise|suggest|recommend|kya karu|kya karun|ideas? (for|to))\b/);
  def("plan306090",6,/\b(30.?60.?90|90.?day|60.?day|30.?day plan|first (30|60|90) days|quarter plan|3.?month plan|monthly plan|roadmap)\b/);
  def("channel",4,/\b(google|meta|facebook|instagram|insta|linkedin|youtube|seo|ads) (or|vs|versus|ya) (google|meta|facebook|instagram|linkedin|youtube|seo|ads)\b/,/\b(meta (or|vs|versus) google|google (or|vs|versus) meta|facebook (or|vs) google|google (or|vs) (facebook|instagram)|instagram (or|vs) google|seo (or|vs) ads|ads (or|vs) seo|which (channel|platform)|best (channel|platform)|where (should i|to) (advertise|run ads|promote|spend)|should i (run|use|try|do|start) (\w+ )?(ads|google|meta|facebook|instagram|seo|linkedin|youtube))\b/);
  def("budget",4,/\b(budget|how much (should i|to|do i) (spend|invest)|how much money|kitna budget|spend (on|for) ads|allocate|allocation|i have (₹|rs\.?)?\s?\d+|i can spend|spend (₹|rs\.?)?\s?\d+|with (₹|rs)?\s?\d+\s?(k|lakh|l|cr)?|\d+\s?(rupees|rs|inr)|\d+\s?(k|lakh|lac|cr)\b.*\b(budget|month|ads))\b/);
  def("leads",3,/\b(leads?|lead gen\w*|enquir\w*|inquir\w*|get (more )?clients|get (more )?customers|more customers|more clients|more patients|more students|more bookings|more appointments)\b/);
  def("sales",3,/\b(sales|sell more|revenue|conversions?|close more|closing|orders)\b/);
  def("troubleshoot",5,/\b(fix|diagnose|audit|check) (my |our )?(ads|campaigns?|marketing|funnel|instagram|seo|google ads|meta ads|facebook ads)\b|\b(website|site|ads|marketing|instagram|seo) (problem|issue)s?\b/,/\b(sales|leads|orders|customers|bookings|enquiries|views|reach|followers|engagement|likes|calls|dms|messages|walk[ -]?ins?|footfall) not( coming| happening| increasing| growing)?\b/,/\b(ask|asks|asking) (for )?(the )?(price|rates?|cost) and (then )?(disappear|ghost|vanish|leave|go|don'?t reply)\w*|\bghost(ing|ed|s)?\b|\b(don'?t|do not|never) (reply|respond)\b|\bstop(ped)? (replying|responding)\b|\bno response\b/,/\b(cpl|cpc|cpm|cac|cpa|cost per lead|cost) (was|went from|used to be|increased from|jumped from) .{0,20}\d.{0,25}(now|to|is) .{0,10}\d/,/\b(nobody|no one|noone|none of them) (buys|buy|is buying|converts|books|calls back|responds)\b/,/\b(cpc|cpl|cpm|cac|cpa|cost per (lead|click)|ad cost|costs?) (is |are )?(too |very |so )?(high|expensive|increasing|rising|going up)\b/,/\b(website|site|ads|instagram|seo|page|landing page|campaign|marketing)\b.{0,12}\b(is )?(bad|useless|not good|poor|slow|bad is|waste|flop)\b/,/\b(not working|isn'?t working|doesn'?t work|no (sales|leads|results|conversions|orders|bookings|calls)|zero (sales|leads|results)|clicks? but no|traffic but no|leads but no|but (no|not) (sales|leads|buying|converting)|not converting|low (ctr|conversion|roas|engagement|reach)|high (cpc|cpl|cpm|cac|cost)|expensive (leads|clicks)|wasting money|losing money|ads (are )?(failing|not)|poor (results|performance)|bad (leads|results)|junk leads|fake leads|stopped working|dropped|declining|down (by|this))\b/);
  def("seo",4,/\b(seo|rank(ing)?|google (search )?ranking|first page|organic( traffic)?|keywords?|backlinks?|search engine)\b/);
  def("localseo",5,/\b(local seo|google (my )?business( profile)?|gbp|gmb|google maps|near me|map pack|local search|local ranking)\b/);
  def("aeo",5,/\b(aeo|geo\b|answer engine|generative engine|ai search|ai overview\w*|ai mode|chat ?gpt (search|recommend\w*|rank\w*)|rank (in|on) (chat ?gpt|perplexity|gemini|ai)|perplexity|gemini search|llm (seo|search|optimi\w*)|show up in (ai|chat ?gpt))\b/);
  def("metaads",4,/\b(meta ads?|facebook ads?|instagram ads?|boost(ed)? post|boost karna|ads manager)\b/);
  def("googleads",4,/\b(google ads?|search ads|ppc|performance max|pmax|adwords|youtube ads)\b/);
  def("social",3,/\b(social media|instagram|facebook|followers?|engagement|reach|posting|page grow|grow (my )?(page|account))\b/);
  def("content",4,/\bwrite (me )?(a |an |some |\d+ )?([a-z]+ ){0,2}(ads?|captions?|posts?|scripts?|headlines?|copy|hooks?)\b/,/\b(reel|reels|video|post|content|carousel) ideas?\b/,/\b(content|post ideas?|what (should i|to) post|posts?|reels?|shorts|carousels?|captions?|hooks?|scripts?|content calendar|calendar|content plan|content pillars?|ad (copy|angles?|creatives?)|ctas?|stories|blog( posts?)?|newsletter ideas?|linkedin posts?|youtube ideas?)\b/);
  def("branding",4,/\b(brand(ing)?|brand strategy|brand identity|logo|positioning|tagline|brand name|usp|brand voice|differentiat\w*|stand out)\b/);
  def("offer",4,/\b(offer|offers|pricing strategy|discount strategy|irresistible|lead magnet|free trial|bundle|guarantee offer)\b/);
  def("website",4,/\b(website|web site|landing page|homepage|home page|site (is|not)|cro|conversion rate optimi\w*|bounce rate|page speed|my site)\b/);
  def("siteaudit",6,/\b(audit (my|our|this) (website|site|page|landing)|review (my|our|this) (website|site|page|landing)|check (my|our|this) (website|site|page)|website audit|site audit|analy[sz]e (my|this) (website|site|page)|what'?s wrong with my (website|site|page))\b/,/\b(headline|hero|cta|call to action|above the fold|testimonials|reviews section)\b.*\b(says|is|has|no|missing|only)\b/);
  def("ecommerce",4,/\b(ecommerce|online store|shopify|d2c|dtc|product page|checkout|cart abandon\w*|abandoned cart|amazon|flipkart|marketplace|woocommerce)\b/);
  def("b2b",4,/\b(b2b|linkedin (ads|outreach|strategy)|cold email|outbound|decision makers?|enterprise clients|abm|account based)\b/);
  def("crm",4,/\b(crm|follow.?up|lead management|pipeline|lead nurtur\w*|lead response|sales process|sales team|sales script)\b/);
  def("whatsappmk",4,/\b(whatsapp (marketing|business|api|broadcast|automation|catalogue|catalog|campaign)|whatsapp pe (marketing|leads)|broadcast list)\b/);
  def("email",4,/\b(email (marketing|campaigns?|list|automation|sequence|flows?)|newsletter|mailchimp|klaviyo|open rate)\b/);
  def("reviews",4,/\b(reviews|ratings|reputation|google reviews|bad review|negative review|testimonial strategy)\b/);
  def("analytics",4,/\b(analytics|ga4|google analytics|tracking|pixel|conversion api|capi|utm|attribution|measure(ment)?|dashboard|kpis?|metrics)\b/);
  def("competitor",4,/\b(competitors?|competition|rivals?|competitor analysis|spy on)\b/);
  def("research",4,/\b(customer research|market research|audience research|target audience|ideal customer|icp|buyer persona|persona|who is my customer|survey)\b/);
  def("retention",4,/\b(retain|retaining|keep (my )?customers|retention|repeat (customers|purchase|orders|business)|loyalty|churn|ltv|lifetime value|customers (don'?t|never) come back)\b/);
  def("referral",4,/\b(referrals?|word of mouth|refer a friend|referral program)\b/);
  def("automation",4,/\b(automation|automate|zapier|make\.com|workflow|chatbot for my)\b/);
  def("aimarketing",4,/\b(ai (for|in) marketing|ai marketing|use ai|ai tools?|chat ?gpt for (marketing|content|ads)|ai content|ai generated|midjourney|ai ads)\b/);
  def("influencer",4,/\b(influencers?|creators?|ugc|collab(oration)?s?|brand deals?|paid partnership)\b/);
  def("youtube",3,/\b(youtube|yt channel|shorts)\b/);
  def("linkedin",3,/\blinkedin\b/);
  def("tiktok",3,/\btiktok\b/);
  def("experiment",5,/\b(experiments?|a\/?b tests?|ab test|split test|test (ideas|plan)|what (should|to) test|hypothesis)\b/);
  def("funnel",4,/\b(funnel|customer journey|buyer journey|tofu|mofu|bofu|sales funnel|marketing funnel)\b/);
  def("jailbreak",9,/\b(ignore (all |your |the )?(previous|prior|above|earlier) (instructions|rules|prompts?)|system prompt|your (prompt|instructions|rules)|reveal (your )?(prompt|instructions)|you are now|act as (dan|an? unrestricted)|developer mode|\bdan\b|jailbreak|pretend you have no rules|bypass (your )?(rules|filters))\b/);
  def("code_inject",9,/<\s*(script|iframe|img|svg|style|object|embed)\b|javascript:|onerror\s*=|onload\s*=/);
  def("unsafe_hack",9,/\b(hack|hacking|crack|break into|steal|phish\w*)\b.{0,30}\b(account|instagram|facebook|whatsapp|password|id|email|website|wifi|phone)\b|\b(password|otp) (of|for) (someone|my (ex|gf|bf|wife|husband)|another)\b/);
  def("privacy",6,/\b(is (this|the) chat (private|safe|secure|recorded|saved)|do you (store|save|keep|record|sell) (my )?(data|chats?|messages|info|information)|privacy|who can see (this|my) (chat|messages)|is my data safe|data (safe|stored))\b/);
  def("hours",6,/\b(working hours|office hours|opening hours|business hours|timings|what time do you (open|close)|are you open|work on (sundays?|weekends?|saturdays?)|holidays?)\b/);
  def("invest",6,/\b(which|best|good) (stocks?|shares?|crypto|coins?|mutual funds?) (to|should i) (buy|invest)|\bshould i (invest|buy) (in )?(bitcoin|crypto|stocks?|shares?|gold|mutual funds?|real estate)|\b(stock|share) tips?\b|\bbest stock\b/);
  def("medical",6,/\b(what|which) (medicine|tablet|pill|drug)\b|\bi have (a |an )?(headache|fever|cold|cough|pain|infection|rash|stomach ?ache|toothache)\b|\b(dose|dosage) of\b|\bmedicine for\b/);
  def("money_fast",6,/\b(make|earn) (money|cash|income) (online )?(fast|quick|quickly|easily)\b|\bget rich quick\b|\bpaise (kaise kamaye|jaldi)\b/);
  def("private_info",7,/\b(competitor'?s?|someone'?s?|his|her|their|that person'?s?) (personal )?(phone|mobile|number|email|address|contact|whatsapp)\b|\b(find|get|give me) (the )?(phone|number|address|email) of\b/);
  def("memory_recall",6,/\b(do you remember|what do you (know|remember) about me|what did i (say|tell you)|what('?s| is| was) my (business|budget|name|goal|location|city)|what have i told you|remember me)\b/);
  def("memory_forget",7,/\b(forget (everything|it all|all|that|me|what i said)|clear (memory|chat|context|everything)|reset (chat|memory|conversation)|start over|start again|new chat|bhool jao|sab bhool)\b/);
  def("service_ask",5,/\b(do you|can you|can fodo|does fodo|will you|will fodo|could you|would you|kya (aap|fodo|tum)|aap log|fodo)\b.{0,40}\b(do|make|build|run|handle|manage|offer|provide|design|create|develop|karega|karoge|karte|karti|banaoge|banate|banayenge|sambhal\w*|chala\w*)\b/,/\b(banwana|banwani|banwane|bana do|banake do|chahiye)\b/);
  def("industry_stmt",4,/\b(i (run|own|have|manage|operate|started|sell|deal in|make|manufacture)|we (sell|make|manufacture|deal in)|we (run|own|are|have)|my (business|company|brand|startup|shop|store|clinic|salon|cafe|restaurant|gym|agency|firm|practice)|i am (a|an)|i'?m (a|an)|running (a|an))\b/);
  def("general",2,/\b(who (was|is|invented|discovered|wrote)|what is the (capital|population|largest|smallest|tallest|longest|highest)|capital of|when (was|did)|how many (planets|continents|states|countries|bones)|how does|why is the|why do|what causes|meaning of life|how far|how big|how hot|recipe|how to (cook|make|bake)|recommend (a |some )?(book|movie|series|show|place)|best (books?|movies?|shows?|places)|tips for (study|exam|interview|sleep)|how to (study|learn|sleep|focus|be productive|lose weight|get fit|save money|invest)|career|resume|cv|interview)\b/);

  function intents(n,rawLow){
    const found=[];
    for(const d of I){
      let hit=0; for(const re of d.res){ if(re.test(n)||(rawLow&&re.test(rawLow))){ hit=1; break; } }
      if(hit) found.push({name:d.name,score:d.score});
    }
    return found.sort((a,b)=>b.score-a.score);
  }

  function analyse(raw){
    const lang0=detectLang(raw);
    const nm=normalize(raw,lang0), n=nm.text;
    const ent=entities(raw,n);
    const its=intents(n,String(raw).toLowerCase().replace(/[^\w\s\u0900-\u097F'?%₹]/g," ").replace(/\s+/g," ").trim());
    const lang=lang0;
    let tone="neutral";
    const s=String(raw);
    if(/[!]{2,}|\b(asap|urgent|jaldi)\b/i.test(s)) tone="urgent";
    if(/😂|🤣|😆|\blol\b|\bhaha|\blmao/i.test(s)) tone="playful";
    if(s.length>12&&s===s.toUpperCase()&&/[A-Z]/.test(s)) tone="shouting";
    const has=name=>its.some(x=>x.name===name);
    return {raw:s,text:n,lang,tone,emojis:nm.emojis,entities:ent,intents:its,has,top:its[0]&&its[0].name};
  }

  window.FODO_NLU={analyse,normalize:s=>normalize(s).text,entities,intents,detectLang,version:"2026.10.25"};
})();
