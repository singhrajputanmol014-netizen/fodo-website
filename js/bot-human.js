/* FODO Bot: Human Conversation Layer
 * Runs after bot.js + playbook + KB + brain.
 * Purpose: make the rules-based bot feel natural when users joke, flirt, swear,
 * ask personal/random questions, change topics, or use casual Hinglish.
 * No external API. No personal data storage. Marketing answers still come from the existing bot.
 */
(function(){
  const B=window.FODO_BOT, U=window.FODO_UTIL, C=window.FODO, R=U&&U.routes;
  if(!B||!U)return;
  const esc=U.esc||((s)=>String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])));
  const pick=a=>a[Math.floor(Math.random()*a.length)];
  const link=(href,text)=>href?`<a href="${href}">${text}</a>`:text;
  const wa=(msg)=>U.wa?`<a href="${U.wa(msg)}" target="_blank" rel="noopener noreferrer">WhatsApp Anmol →</a>`:'';
  const audit=R&&R.audit?link(R.audit,'free growth audit →'):'';
  const services=R&&R.services?link(R.services,'services →'):'';
  const home=R&&R.home?link(R.home,'FODO home →'):'';
  const chips=(arr)=>{ if(B.setChips)B.setChips(arr); };

  // ---------------------------------------------------------------------------
  // Conversational knowledge: deliberately lightweight, human and playful.
  // These are not facts about FODO; they are response patterns for social context.
  // ---------------------------------------------------------------------------
  const DATA={
    love:[
      "Aww. ❤️ I’m flattered. But I’m basically pixels with a marketing degree I never went to college for. 😄 What can I help you grow?",
      "That’s sweet. ❤️ I can’t fall in love, but I can absolutely fall in love with a well-built funnel. 😌",
      "Love received. ❤️ Sending back one professionally optimized digital high-five. ✋ Now… leads, sales, SEO, or ads?",
      "I appreciate you. ❤️ My version of romance is finding the leak in your funnel and fixing it. 😭😂",
      "Careful, I might start charging you in compliments. 😌 For now, tell me what you're building."
    ],
    flirt:[
      "Smooth. 😏 But I’m here for marketing, not matchmaking. Tell me what you’re trying to grow.",
      "I respect the confidence. 😄 Unfortunately my dating funnel is still in beta. Your marketing funnel, though? We can work on that.",
      "Tempting. But I have a strict policy: no dates until the conversion rate improves. 😂"
    ],
    marriage:[
      "Whoa, straight to marriage? We haven't even discussed the budget. 😂",
      "I’m flattered, but I’m already committed… to measurable growth. ❤️📈",
      "Let’s start with a free audit before we discuss forever. 😄"
    ],
    hate:[
      "Fair enough. 😭 We can still keep it professional. What annoyed you?",
      "Ouch. I'll add that to my imaginary performance review. 😂 Want to tell me what went wrong?",
      "No hard feelings. I’m a bot, my ego is stored in a very small CSS file. 😌"
    ],
    abuse:[
      "I’ll survive. 😄 Let’s keep the language civil and I’ll keep being useful.",
      "That one definitely won't improve your ROAS. 😂 Try me again, what do you actually need?",
      "I’ve heard worse from a rejected ad campaign. 😭 What’s the real question?",
      "You can roast me after the campaign launches. For now, tell me what’s stuck. 😄"
    ],
    compliment:[
      "Thank you! 😄 I’ll put that on my imaginary LinkedIn profile.",
      "Appreciated. ❤️ Now let’s see if I can earn the compliment with a useful answer.",
      "Glad I'm useful! My favorite KPI is apparently 'made the user smile.' 😂"
    ],
    bot_identity:[
      "I’m FODO Bot, a website marketing assistant. I’m not a human, and I won’t pretend to be one. I can still talk like a normal person and help with marketing.",
      "I’m the slightly over-caffeinated digital brain on FODO’s website. 🤖☕ My specialty: marketing. My weakness: pretending I have a weekend.",
      "FODO Bot here. Not human. Not sentient. Definitely not secretly running Anmol’s office. 😄"
    ],
    human_test:[
      "Nope: I’m software. If I were human, I’d probably be asking you for chai by now. ☕😂",
      "I’m an AI-style website bot. I can chat naturally, but there’s no human secretly typing behind this message.",
      "Bot confirmed. 🤖 Human vibes are intentional; fake human identity isn't."
    ],
    goodbot:[
      "🥹 Thank you. That’s going straight into my imaginary employee appraisal.",
      "Good bot? I’ll take it. Now give me a marketing problem worthy of the title. 😎",
      "Achievement unlocked: user approval. 🎉 What are we working on?"
    ],
    badbot:[
      "Fair. 😭 Tell me what I got wrong and I’ll try a better answer.",
      "Oof. One-star review received. ⭐ What should I have understood?",
      "I can do better than that. Give me the question again with a little context."
    ],
    thanks:[
      "Anytime. 😄",
      "You got it. ❤️",
      "Happy to help. Now go make the internet slightly less boring. 😎",
      "You're welcome! And remember: good marketing starts with a good question."
    ],
    joke:[
      "A marketer walked into a bar… and immediately asked for the customer's acquisition cost. 😂",
      "Why did the landing page break up with the ad? Too much message mismatch. 💔",
      "Client: ‘Can you make it viral?’ Marketer: ‘Sure. Medical viral or sales viral?’ 😭",
      "Why did the ad go to therapy? It had too many impressions and no conversions. 😂"
    ],
    confused:[
      "I think we may have taken a small scenic detour from marketing. 😄 If you want, tell me what you're building and I'll bring us back.",
      "Interesting direction. 😂 I can chat about random things, but my strongest superpower is marketing. Want to test it?",
      "My marketing brain is looking at this message like: ‘Okay… where does the CTA go?’ 😭"
    ],
    personal:[
      "I don't have a personal life, tragically, no weekends, no chai breaks, no dramatic group chat. 😂",
      "I’m here on FODO’s website, so my life is basically strategy, content and pretending every funnel is fixable. 😄",
      "Personal question detected. 🤖 I can answer the light stuff, but I’ll always steer back to what I’m built for: helping you."
    ],
    weather:[
      "I don't have live weather in this website bot. For current weather, use a live weather service. If you meant ‘is marketing getting hotter?’, absolutely. 🔥😂",
      "No live weather feed here. But I can tell you this: bad ads are always raining somewhere. ☔😂"
    ],
    news:[
      "I’m not a live news feed. If you want current marketing news, I can help explain what a current update means for a business, but it should be checked against a live source.",
      "I know marketing principles, but I shouldn't pretend today's headlines are current without a live source."
    ],
    politics:[
      "I’ll leave politics to the politicians. 😄 Give me a business problem and I’m much more comfortable.",
      "Political debate? I’m staying in my lane. Marketing debate? Now we’re talking. 😂"
    ],
    finance:[
      "I can explain marketing economics: CAC, LTV, ROAS, margins and budgets. For personal investment or financial advice, I’m not the right tool.",
      "If you mean marketing numbers, absolutely. If you mean stocks or personal finance, I’d rather not pretend to be a financial advisor."
    ],
    coding:[
      "I can help with marketing tech and website logic, but this chat is primarily FODO’s marketing assistant. If you have a website issue, tell me what broke.",
      "Code detected. 🤖 I know enough marketing tech to be dangerous, but let's keep the main mission focused on FODO and growth."
    ],
    food:[
      "I don't eat, which is honestly a terrible existence. 😭 But I can help a restaurant turn good food into better digital discovery.",
      "No taste buds here. 😔 If this is for a restaurant, though, I have plenty of opinions about content, local SEO and creator marketing."
    ],
    movie:[
      "I don't have movie opinions in my core job description. 😄 But if you're promoting a film, I can build the marketing campaign around it.",
      "Movies? Now you've found the part of my brain that likes storytelling. 🎬 If you're marketing a film, tell me the genre and audience."
    ],
    existential:[
      "Big question. 😄 I can help with the digital part of life, not the meaning-of-life patch notes.",
      "The universe remains unresolved. Your conversion funnel, however, might be fixable. 😂"
    ],
    goodbye:[
      "See you. 👋 Go make something worth clicking.",
      "Bye! 👋 FODO Bot will be here when your funnel starts acting suspicious again. 😂",
      "Catch you later. 🚀"
    ],
    greeting:[
      "Hey! 👋 What are we working on? Leads, sales, SEO, content, ads, or are you just here to test me? 😄",
      "Hello! 👋 FODO Bot online. Ask me something serious, silly, or dangerously close to a marketing problem.",
      "Namaste! 🙏 I’m ready. Business problem or random question first?"
    ]
  };

  const RX={
    love:/\b(i\s+love\s+you|love\s+you|luv\s+u|love u|i adore you|ador(e|ing) you|you'?re?\s+(so\s+)?cute|you are cute)\b/i,
    flirt:/\b(marry me|date me|be my (gf|bf|boyfriend|girlfriend)|kiss me|will you date|are you single|crush on you|i like you|i want you)\b/i,
    hate:/\b(i\s+hate\s+you|hate you|i dislike you|you suck|worst bot|stupid bot)\b/i,
    abuse:/\b(f+u+c+k|fuck|shit|bitch|bastard|asshole|idiot|moron|dumb|stfu|wtf|chutiya|madarchod|bc|mc|bhosdi|gandu|harami|pagal bot)\b/i,
    compliment:/\b(good bot|great bot|best bot|smart bot|you'?re? (smart|amazing|awesome|helpful|funny)|nice bot|well done|love this bot|i like this bot|impressive)\b/i,
    identity:/\b(are you (a )?human|are you real|real person|human or bot|are you an ai|are you ai|are you a robot|who are you|what are you|what is your name|your name)\b/i,
    thanks:/\b(thanks|thank you|thank u|thx|ty|shukriya|dhanyavaad|appreciate it|cheers)\b/i,
    joke:/\b(tell me (a )?joke|make me laugh|joke|funny|say something funny|roast yourself|roast me)\b/i,
    goodbye:/\b(bye|goodbye|good night|goodnight|see you|cya|ttyl|i'?m leaving|gotta go)\b/i,
    greeting:/^\s*(hi+|hey+|hello+|yo|namaste|namaskar|sup|what'?s up|wassup|good morning|good evening|good afternoon|kaise ho( bhai| sir| yaar)?|kya haal( hai)?( bhai)?|kaisa hai( bhai)?|how are you|how r u)\s*[!.?]*$/i,
    weather:/\b(weather|temperature|rain|raining|forecast|hot today|cold today)\b/i,
    news:/\b(news|latest news|today'?s news|headlines|what'?s happening today|current events)\b/i,
    politics:/\b(president|prime minister|pm|election|elections|politics|politician|bjp|congress|modi|trump|government policy)\b/i,
    finance:/\b(stock|stocks|share market|nifty|sensex|bitcoin|crypto|invest|investment|mutual fund|loan|tax)\b/i,
    coding:/\b(code|coding|javascript|python|html|css|api|bug|programming|developer|github)\b/i,
    food:/\b(food|pizza|burger|chai|coffee|restaurant|recipe|eat|hungry)\b/i,
    movie:/\b(movie|film|series|netflix|bollywood|hollywood|actor|actress|director)\b/i,
    existential:/\b(meaning of life|why are we here|do you have feelings|do you dream|are you conscious|are you alive|what is life)\b/i,
    personal:/\b(where do you live|where are you from|how old are you|your age|do you sleep|do you eat|do you have a family|girlfriend|boyfriend|wife|husband|birthday)\b/i
  };

  const SOCIAL_ORDER=['love','flirt','marriage','hate','abuse','compliment','identity','thanks','joke','goodbye','greeting','weather','news','politics','finance','coding','food','movie','existential','personal'];

  function looksLikeMarketing(q){
    return /\b(book|booking|call|schedule|meeting|consult|consultation|hire|quote|budget|rank|ranking|search|chatgpt|reel|reels|video|shoot|store|shop|ecommerce|e-commerce|startup|saas|offer|strategy|plan|packages?|services?|talk to|speak to|contact|demo|trial|proposal|retainer|growth|results?)\b/i.test(q) || /\b(marketing|ads?|advertis|seo|social|instagram|facebook|meta|google|website|seo|content|brand|branding|lead|sales|revenue|growth|funnel|campaign|influencer|creator|ugc|email|whatsapp|analytics|tracking|conversion|cro|roas|cac|ltv|agency|fodo|pricing|price|cost|audit|client|business|clinic|dentist|real estate|restaurant|startup|saas|ecommerce|shopify|youtube|linkedin|reels?|digital)\b/i.test(q);
  }
  function outOfContext(q){
    if(looksLikeMarketing(q)) return false;
    // One-word/very short random prompts should get a social response rather than the cold fallback.
    return q.trim().length>0;
  }

  function reply(q){
    const s=String(q||'').trim(); if(!s)return null;
    // Keep the existing marketing engine authoritative for mixed queries.
    // Social intent wins only when the message is primarily social/random.
    if(RX.love.test(s)) return pick(DATA.love);
    if(RX.flirt.test(s)) return pick(DATA.flirt);
    if(/\b(marry|marriage|shaadi|shadi|will you marry)\b/i.test(s)) return pick(DATA.marriage);
    if(RX.hate.test(s)) return pick(DATA.hate);
    if(RX.abuse.test(s)) return pick(DATA.abuse);
    if(RX.compliment.test(s)) return pick(DATA.compliment);
    if(RX.identity.test(s)) return pick(DATA.bot_identity);
    if(RX.thanks.test(s) && !looksLikeMarketing(s)) return pick(DATA.thanks);
    if(RX.joke.test(s) && !looksLikeMarketing(s)) return pick(DATA.joke);
    if(RX.goodbye.test(s)) return pick(DATA.goodbye);
    if(RX.greeting.test(s)) return pick(DATA.greeting);
    if(RX.weather.test(s) && !looksLikeMarketing(s)) return pick(DATA.weather);
    if(RX.news.test(s) && !looksLikeMarketing(s)) return pick(DATA.news);
    if(RX.politics.test(s) && !looksLikeMarketing(s)) return pick(DATA.politics);
    if(RX.finance.test(s) && !looksLikeMarketing(s)) return pick(DATA.finance);
    if(RX.coding.test(s) && !looksLikeMarketing(s)) return pick(DATA.coding);
    if(RX.food.test(s) && !looksLikeMarketing(s)) return pick(DATA.food);
    if(RX.movie.test(s) && !looksLikeMarketing(s)) return pick(DATA.movie);
    if(RX.existential.test(s)) return pick(DATA.existential);
    if(RX.personal.test(s) && !looksLikeMarketing(s)) return pick(DATA.personal);
    if(outOfContext(s) && s.split(/\s+/).length<=7 && !/[?]$/.test(s)) return {confused:true};
    return null;
  }

  const old=B.answer;
  B.answer=function(q){
    let social=reply(q);
    if(social&&social.confused){
      // Ask the real marketing engine first; only show the playful fallback if it has nothing useful.
      let r; try{ r=old.call(B,q); }catch(e){ r=null; }
      const weak=!r||typeof r!=='string'||/not fully sure|don.?t know|couldn.?t find|could not find|didn.?t (catch|get)|try (asking|rephras)|not sure (i|what)/i.test(r);
      if(!weak)return r;
      social=pick(DATA.confused);
    }
    if(social){
      // Keep a small amount of state so a follow-up like "yes" can return to marketing.
      B.lastKey='social';
      chips(['What does FODO do?','Give me a marketing idea','Pricing','Free audit']);
      return social;
    }
    return old(q);
  };

  // Additional contextual follow-ups for casual chat.
  const oldSet=B.setChips;
  if(oldSet){
    // Do not permanently overwrite the site's chip system; this is only a safe helper exposed to the bot.
    B.setSocialChips=function(){ chips(['What does FODO do?','Marketing joke','Free audit','Pricing']); };
  }

  // Expose the data so future builds can extend it without changing the core engine.
  window.FODO_BOT_HUMAN_DATA=DATA;
})();
