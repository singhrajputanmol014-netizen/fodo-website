/* FODO Bot — 2026 Marketing Intelligence Addendum
 * Research-informed additions. Durable principles first; current claims are dated and should be refreshed.
 * Sources used for this addendum: Google Search Central, Meta, HubSpot 2026 research.
 */
(function(){
  const K=window.FODO_KB; if(!K)return;
  K.faq=K.faq||[]; K.channels=K.channels||[]; K.glossary=K.glossary||[];
  const addFaq=(q,a)=>{ if(!K.faq.some(x=>x.q.toLowerCase()===q.toLowerCase())) K.faq.push({q,a}); };
  const addChannel=(t,lines)=>{ if(!K.channels.some(x=>x.t.toLowerCase()===t.toLowerCase())) K.channels.push({t,lines}); };
  const addGloss=(t,d)=>{ if(!K.glossary.some(x=>x.t.toLowerCase()===t.toLowerCase())) K.glossary.push({t,d}); };

  // ---- AI search / SEO ----
  addFaq("How should I optimise my website for AI search?","Start with normal SEO fundamentals: crawlability, useful pages, clear headings, internal links, original evidence, expertise, good page experience and content written to satisfy people. Do not chase secret AI-search hacks. Google says there are no special technical requirements or special AI markup needed for AI Overviews or AI Mode; the same foundational SEO guidance remains relevant.");
  addFaq("Do I need special AI SEO markup?","No magic markup. Treat AI-search visibility as an extension of good search fundamentals: make pages accessible, useful, specific, trustworthy and easy to understand. Structured data can help search engines understand content when it is valid and relevant, but it is not an AI-ranking shortcut.");
  addFaq("Does AI-generated content hurt SEO?","AI assistance is not automatically the problem. The risk is inaccurate, low-value, mass-produced or search-engine-first content. Review AI output for accuracy, originality, usefulness and real expertise before publishing. Human review matters.");
  addFaq("What is AEO?","AEO usually means Answer Engine Optimisation: structuring useful content so answer systems can understand and potentially cite it. The practical foundation is still strong SEO, clear answers, original expertise, trustworthy sources and satisfying the user's intent.");
  addFaq("What is GEO in marketing?","GEO is often used for Generative Engine Optimisation — improving the likelihood that a brand is understood and mentioned in generative/answer experiences. Treat it as a strategic layer, not a replacement for SEO. There is no guaranteed GEO ranking formula.");
  addFaq("How do I get mentioned by ChatGPT or AI search?","There is no honest guaranteed submission trick. Build a clear entity footprint: authoritative website pages, original information, consistent business details, genuine reviews and useful content. For current platform-specific requirements, check the platform's latest documentation.");

  // ---- Social / creators / video ----
  addFaq("What is working on social media in 2026?","The broad direction is interest-based discovery, short-form video, creator content, social search, community and channel-specific creative. But the correct mix depends on the customer and business model. Current 2026 research from HubSpot reports short-form video as a leading ROI format and highlights authenticity, social search and creator marketing as major themes.");
  addFaq("Should I post every day?","Not automatically. A smaller number of strong, useful pieces that you can sustain is usually better than forcing daily filler. Choose a cadence that gives you enough tests without sacrificing quality or burning out the team.");
  addFaq("Are followers still important?","They can help with distribution and social proof, but follower count is not the same as demand. Track qualified profile visits, saves, shares, DMs, leads, bookings and revenue alongside reach and follower growth.");
  addFaq("Should I use micro influencers or celebrities?","Choose by objective and audience fit, not follower count. Micro and nano creators can be strong when trust, niche relevance and conversion matter. A celebrity may make sense for broad awareness. Always vet audience quality and track the campaign.");
  addFaq("Does authentic content really work better than polished content?","Often, especially on social, but 'authentic' does not mean careless. Strong content can be simple, native and human while still having good strategy, audio, framing, editing and a clear idea.");
  addFaq("Should every brand make Reels?","Not necessarily. Short-form video is powerful, but the correct format depends on the audience, message and production capacity. B2B may also benefit from carousels, articles, case studies, webinars and founder-led content.");

  // ---- Performance / measurement ----
  addFaq("What should I measure every week?","Measure the smallest set that explains the business: spend, qualified leads, lead-to-customer rate, CAC, revenue, conversion rate and channel-level efficiency. Add creative and audience diagnostics such as CTR and CPC when needed. Do not report dozens of metrics without a decision attached.");
  addFaq("Why are platform conversions higher than my actual sales?","Platforms use their own attribution windows and models, while your CRM records actual sales. Compare ad-platform data with CRM and revenue data, check duplicate leads, call/WhatsApp attribution and follow-up quality, and use blended metrics or experiments where possible.");
  addFaq("What is a good ROAS in 2026?","There is no universal good ROAS. Break-even depends on gross margin, fulfilment, refunds, overhead and repeat purchase value. A 4x ROAS can be unprofitable for one business and excellent for another. Start with break-even economics.");
  addFaq("How much should I spend on ads?","Budget from unit economics, not a random percentage. Work backwards from customer value, gross margin, close rate and acceptable CAC/CPL. Then choose a budget large enough to learn, while keeping enough cash for creative, landing pages and lead follow-up.");
  addFaq("Why do I get cheap leads but no customers?","Cheap leads can be expensive if they do not buy. Common causes are weak qualification, broad targeting, misleading creative, low-intent offers, slow follow-up, pricing mismatch or a broken sales process. Measure lead-to-customer rate and revenue per lead.");

  // ---- Conversion / website ----
  addFaq("What should my homepage say first?","In a few seconds, the visitor should understand who you help, what outcome you create and what they can do next. Then support the claim with proof, process, services and objections. Do not bury the value proposition under agency jargon.");
  addFaq("How can I improve my landing page?","Start with message match between ad and page, one clear goal, strong headline, proof, specific benefits, visible CTA, low-friction form, mobile speed and objection handling. Then test one meaningful hypothesis at a time.");
  addFaq("Why is my website getting traffic but no leads?","Traffic is only the beginning. Check search intent, page-message match, offer clarity, trust, mobile UX, page speed, CTA visibility, form friction and lead follow-up. More traffic will not fix a conversion leak.");

  // ---- AI / automation ----
  addFaq("Where should I use AI in marketing?","Use AI where it creates leverage: research synthesis, ideation, copy variations, repurposing, analysis, reporting, workflow automation and personalization. Keep humans responsible for positioning, facts, taste, relationships, approvals and high-stakes decisions.");
  addFaq("Can AI replace a marketing team?","AI can reduce repetitive work and increase output, but it does not remove the need for strategy, brand judgment, creative direction, customer understanding, data interpretation and accountability. The strongest setup is usually human strategy plus AI-assisted execution.");
  addFaq("What marketing tasks should not be automated blindly?","Claims, medical/financial/legal messaging, final brand positioning, sensitive customer communication, crisis responses, ad-policy decisions and factual publishing should have human review. Automation should remove repetitive work, not responsibility.");

  // ---- Customer journey / strategy ----
  addFaq("What is a modern customer journey?","It is rarely a straight funnel. Someone may discover a brand on Instagram, search Google, watch a video, ask an AI system, read reviews, visit the site, return through an ad and then message on WhatsApp. Strategy should connect these touchpoints instead of optimising each one in isolation.");
  addFaq("Should I focus on organic or paid marketing?","Usually both have different jobs. Paid can buy targeted attention and test offers quickly; organic content, SEO and community can build compounding visibility and trust. The mix depends on cash flow, urgency, search demand and customer economics.");
  addFaq("What is the biggest marketing mistake small businesses make?","Doing tactics before diagnosing the constraint. A business may need better positioning, faster lead follow-up, stronger proof, a better offer or tracking before it needs more ad spend.");

  // ---- Conversational / trust answers ----
  addFaq("Can FODO guarantee results?","No. FODO can control process, measurement, testing, communication and optimisation; market response cannot be guaranteed. Be suspicious of agencies promising guaranteed rankings, leads, revenue or virality.");
  addFaq("Can I keep my ad accounts?","Yes. FODO's site model says ad spend stays in the client's own accounts and the client retains control of accounts and assets.");
  addFaq("What happens if I stop working with FODO?","The site position is no lock-in and client-owned accounts/assets remain with the client. Exact exit terms should be confirmed in the scoped engagement before work starts.");

  // ---- Channel playbooks ----
  addChannel("Social Search",[
    "Treat social platforms as discovery engines: use natural customer language in captions, on-screen text, titles and profile copy.",
    "Answer specific questions instead of posting only promotional slogans.",
    "Build content around searchable problems, comparisons, local intent and product use cases.",
    "Track profile visits, DMs, website clicks and assisted conversions, not only reach."
  ]);
  addChannel("AI Search",[
    "Make important pages crawlable, clear and useful; avoid hiding core answers behind unnecessary UI.",
    "Add original information, evidence, examples, authorship/context where appropriate and strong internal linking.",
    "Answer real questions directly while still providing depth and differentiation.",
    "Do not create large volumes of thin pages simply because an AI system might cite them."
  ]);
  addChannel("Short-form Video",[
    "Start with a specific audience problem or curiosity hook.",
    "Show or explain the payoff quickly; remove slow intros.",
    "Use native captions, clear visual changes and a single useful idea per video.",
    "Test hooks and topics systematically; do not treat one viral video as proof of a repeatable strategy."
  ]);
  addChannel("Creator Marketing",[
    "Select creators using audience fit, credibility, geography, engagement quality and conversion potential.",
    "Define deliverables, usage rights, disclosure, deadlines and approval process in writing.",
    "Give creators a clear outcome and guardrails rather than a robotic script when authenticity matters.",
    "Track codes, links, UTM, branded search lift, enquiries or other business outcomes."
  ]);

  // ---- New glossary ----
  addGloss("AIO", "AI Overviews — Google's AI-generated summary experience in Search.");
  addGloss("AI Mode", "A more conversational Google Search experience that can answer complex questions across multiple searches and sources.");
  addGloss("First-party data", "Customer or prospect information a business collects directly with appropriate permission, such as CRM or consented email data.");
  addGloss("Message match", "The consistency between the promise in an ad or search result and the page the user lands on.");
  addGloss("Speed-to-lead", "How quickly a business responds after a lead or enquiry arrives.");
  addGloss("Social search", "Using social platforms to discover information, products, places, creators or brands instead of relying only on traditional search engines.");
  addGloss("Search intent", "The underlying job a person is trying to accomplish with a search query, such as learning, comparing, finding a local service or buying.");
  addGloss("Creative fatigue", "A decline in ad performance caused partly by an audience seeing the same creative too often or becoming less responsive to it.");
  addGloss("Incrementality", "The additional business outcome caused by marketing that would not have happened without the marketing activity.");

  K.fodo2026={
    lastReviewed:"2026-10-25",
    principles:[
      "People-first content over search-engine-first content.",
      "AI is leverage, not a substitute for strategy and human review.",
      "Short-form video is a major format, but not a universal answer.",
      "Social is increasingly a discovery/search/commerce/customer-service environment.",
      "Creator selection should optimise for fit and business outcome, not follower count alone.",
      "Measure business outcomes and lead quality, not vanity metrics alone.",
      "Use current platform documentation for changing policies/features."
    ],
    sources:[
      {name:"Google Search Central — Helpful, reliable, people-first content",url:"https://developers.google.com/search/docs/fundamentals/creating-helpful-content"},
      {name:"Google Search Central — Generative AI content guidance",url:"https://developers.google.com/search/docs/fundamentals/using-gen-ai-content"},
      {name:"HubSpot — 2026 State of Marketing",url:"https://blog.hubspot.com/marketing/hubspot-blog-marketing-industry-trends-report"},
      {name:"HubSpot — Future of Social Media 2026",url:"https://blog.hubspot.com/marketing/social-media-future"},
      {name:"Meta — AI and omnichannel shopping in India",url:"https://about.fb.com/news/2026/02/ai-fuels-indias-omnichannel-shopping-surge-meta-retailers-association-of-india/"}
    ]
  };
})();
