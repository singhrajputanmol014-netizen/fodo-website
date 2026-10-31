/* FODO content data, edit copy here. All examples are CONCEPT / HYPOTHETICAL; no client claims. */
window.FODO_DATA = {};

/* ---------- SERVICES (20) ---------- */
FODO_DATA.pillars = [
  { id:"paid", name:"Paid Media", first:"paid-advertising" },
  { id:"seo", name:"SEO", first:"seo" },
  { id:"content", name:"Content", first:"content-marketing" },
  { id:"social", name:"Social", first:"social-media" },
  { id:"brand", name:"Brand", first:"brand-strategy" },
  { id:"automation", name:"Automation", first:"marketing-automation" },
  { id:"web", name:"Web & CRO", first:"web-design" }
];
FODO_DATA.services = [
 {slug:"paid-advertising",pillar:"paid",name:"Paid Advertising",h:"BUY ATTENTION. TURN IT INTO GROWTH.",
  problem:"Many accounts grow spend before they grow structure: mixed objectives in one campaign, audiences overlapping, and no clear link between a click and a business result.",
  do:["Account and campaign structure built around one objective per campaign","Audience strategy: prospecting, warm and retargeting layers where they make sense","Creative testing plan with clear hypotheses","Landing-page alignment so the ad promise matches the page","Budgets always controlled and approved by you","Conversion measurement set up before spend starts"],
  track:["Cost per lead / acquisition","Conversion rate by audience and creative","Lead quality feedback from your sales team","Spend pacing vs. agreed budget"],
  channels:["Meta","Google","LinkedIn","TikTok"],deliv:["Account audit & restructure plan","Campaign build","Monthly creative test log","Reporting dashboard"],
  who:"Businesses already spending (or ready to spend) on ads who want decisions based on evidence, not platform suggestions.",
  outcomes:"Clearer cost per result, less wasted spend, and a learning loop you can keep running.",
  faqs:[["Who controls the ad budget?","You do. Spend is paid from your ad accounts; FODO plans and manages within the limit you approve."],["Do you guarantee a cost per lead?","No. We agree targets and report honestly against them; outcomes depend on offer, market and landing experience."],["How long before results show?","Early signals typically appear within the first few weeks of testing; a stable read needs more data. We never promise a timeline."],["Which platform should I start with?","The one where your buyers already look for you. Discovery decides this, not a default."]],
  related:["meta-ads","google-ads","landing-pages","analytics"]},
 {slug:"meta-ads",pillar:"paid",name:"Meta Ads",h:"WHERE YOUR CUSTOMERS SCROLL. BE THERE.",
  problem:"Boosted posts, one audience, one creative, then the cost rises and nobody knows why. Creative fatigue and weak tracking quietly eat the budget.",
  do:["Facebook and Instagram placement strategy","Prospecting audiences built from interests, lookalikes and broad targeting tests","Retargeting only where the funnel supports it","Creative testing: hooks, formats, angles","Pixel / Conversions API tracking review","Creative fatigue monitoring and refresh cadence"],
  track:["Cost per result","Click-through and hook rate","Frequency and fatigue signals","Purchase or lead conversion rate"],
  channels:["Facebook","Instagram","Messenger","Audience Network (optional)"],deliv:["Audience map","Creative test matrix","Campaign build","Weekly performance notes"],
  who:"D2C brands, local services, lifestyle and hospitality businesses whose customers discover visually.",
  outcomes:"Better creative learning, controlled frequency, and spend aimed at people likely to act.",
  faqs:[["Do you make the creatives?","We write concepts, hooks and copy. Design and video production are scoped separately in discovery."],["Is retargeting always needed?","No. Small audiences and short sales cycles sometimes do not justify it; we test before committing budget."],["What about iOS tracking limits?","We set up server-side tracking where possible and read results with that limitation in mind."],["Can you work in my existing ad account?","Yes, we prefer it. Your data stays yours."]],
  related:["paid-advertising","short-form-content","landing-pages","cro"]},
 {slug:"google-ads",pillar:"paid",name:"Google Ads",h:"BE THE ANSWER WHEN THEY SEARCH.",
  problem:"Broad match everything, no negative keywords, and a homepage as the landing page. Intent is the most valuable thing in Google Ads, and the easiest to waste.",
  do:["Search campaigns built around intent clusters","Keyword and negative-keyword structure maintained weekly","Display and YouTube only when the objective calls for them","Ad copy matched to query and landing page","Conversion tracking and call tracking review","Budget pacing and bid strategy decisions explained in plain language"],
  track:["Cost per conversion","Search impression share on priority terms","Quality signals (relevance, landing experience)","Wasted-spend share from irrelevant queries"],
  channels:["Google Search","Performance Max (cautiously)","YouTube","Display"],deliv:["Keyword & intent map","Negative keyword library","Campaign build","Search-term review log"],
  who:"Businesses with existing demand: people already search for what they sell.",
  outcomes:"Spend concentrated on high-intent queries and pages that answer them.",
  faqs:[["Should I use Performance Max?","Sometimes. It needs strong conversion data and clear exclusions; we test it alongside Search, not instead of it."],["Why do my clicks not convert?","Often the landing page, not the ad. We review both together."],["Do you claim Google Partner status?","No. FODO makes no partnership claims it cannot show."],["How often do you review search terms?","Weekly during active optimisation."]],
  related:["paid-advertising","landing-pages","seo","analytics"]},
 {slug:"linkedin-ads",pillar:"paid",name:"LinkedIn Ads",h:"REACH DECISION-MAKERS, NOT JUST CLICKS.",
  problem:"LinkedIn costs more per click than most platforms. Treating it like Meta, broad audiences, no offer, burns budget fast.",
  do:["Decision-maker targeting by role, seniority, company size and industry","Offer design for longer B2B cycles (guides, demos, assessments)","Lead Gen Forms vs. landing-page tests","Lead quality scoring with your sales team","Retargeting website visitors and engagers","Cost awareness built into every recommendation"],
  track:["Cost per qualified lead (not just lead)","Meeting or demo rate","Audience overlap and frequency","Pipeline feedback from sales"],
  channels:["LinkedIn Sponsored Content","Message Ads","Lead Gen Forms"],deliv:["ICP & audience plan","Offer brief","Campaign build","Lead quality report"],
  who:"B2B, SaaS, consulting and professional services with a defined buyer profile.",
  outcomes:"Fewer, better leads and clearer feedback from sales to marketing.",
  faqs:[["Is LinkedIn too expensive for small budgets?","It can be. We advise honestly if your budget would be better used elsewhere."],["Lead Gen Forms or landing pages?","Forms lower friction; pages qualify better. We often test both."],["How do you judge lead quality?","Through a simple scoring sheet agreed with your sales team."],["How long are B2B cycles?","Often weeks to months, reporting reflects that instead of chasing weekly conversions."]],
  related:["paid-advertising","copywriting","marketing-automation","analytics"]},
 {slug:"tiktok-ads",pillar:"paid",name:"TikTok Ads",h:"SHORT VIDEOS. LONG MEMORY.",
  problem:"Polished brand ads feel out of place on TikTok. Without native-feeling creative and fast hook testing, spend buys views that never become customers.",
  do:["Short-form creative concepts and scripts","Hook testing across the first 1–3 seconds","Native-feeling formats (UGC-style, voiceover, text-on-screen)","Landing-page alignment for mobile-first visitors","Spark Ads where creator content exists","Clear scope: FODO plans and scripts; footage production is agreed separately"],
  track:["Hook rate and watch-through","Cost per click / result","Conversion rate on mobile landing pages","Creative win rate"],
  channels:["TikTok In-Feed","Spark Ads"],deliv:["Creative concept deck","Script library","Campaign build","Creative performance log"],
  who:"Consumer brands with a visual product or a story that fits short video.",
  outcomes:"A repeatable way to find hooks that work, before scaling spend.",
  faqs:[["Do you shoot the videos?","Not by default. We script and direct concepts; production is scoped with you or a creator."],["Is TikTok right for B2B?","Rarely the first choice. We will say so."],["How many creatives do we need?","Enough to test, usually several variations per concept at launch."],["Can we reuse Instagram Reels?","Often yes, with adjustments to hooks and captions."]],
  related:["short-form-content","meta-ads","influencer-marketing","landing-pages"]},
 {slug:"seo",pillar:"seo",name:"SEO",h:"BE FOUND BEFORE YOU'RE NEEDED.",
  problem:"Rankings for your brand name, nothing for the problems you solve. Technical issues block crawling and content is written for nobody in particular.",
  do:["Technical audit: crawlability, indexing, speed, structure","On-page optimisation matched to search intent","Content plan that answers real questions","Internal linking architecture","Ethical off-page approach, no bought links","Transparent monthly reporting"],
  track:["Non-brand organic visibility","Indexed pages and technical health","Organic leads or sales, not just sessions","Priority keyword movement"],
  channels:["Google Search","Bing","AI-powered search surfaces"],deliv:["Technical audit","Keyword & intent map","Content briefs","Monthly SEO report"],
  who:"Businesses that want durable, compounding demand rather than rented attention.",
  outcomes:"Visibility for the searches that matter, on pages built to convert.",
  faqs:[["How long does SEO take?","Months, not days. We set expectations in discovery and show progress along the way."],["Do you guarantee rankings?","No one honestly can. We commit to the work and the reporting."],["Will you write the content?","We can brief, write, or edit, scope is agreed per project."],["Do you buy links?","No."]],
  related:["local-seo","ecommerce-seo","content-marketing","web-design"]},
 {slug:"local-seo",pillar:"seo",name:"Local SEO",h:"OWN YOUR NEIGHBOURHOOD ON GOOGLE.",
  problem:"Inconsistent address details, an unmanaged Google Business Profile, and no process for reviews. Nearby customers find a competitor instead.",
  do:["Google Business Profile setup and guidance","Accurate, consistent business details everywhere","Location-specific landing pages","Review request and response process","Local content and citations","Tracking of calls, directions and messages"],
  track:["Profile views, calls and direction requests","Map-pack visibility for priority terms","Review volume and response time","Local landing-page conversions"],
  channels:["Google Business Profile","Google Maps","Local directories"],deliv:["Profile optimisation","Location page templates","Review process guide","Monthly local report"],
  who:"Clinics, restaurants, salons, showrooms, agencies, any business people visit or call.",
  outcomes:"More of the right local enquiries from people ready to act.",
  faqs:[["Can you guarantee a map-pack position?","No. We improve the signals Google uses and report what changes."],["Do you write fake reviews?","Never. We help you ask real customers properly."],["Multiple branches?","Yes, each gets its own accurate profile and page."],["How do we track calls?","Through profile insights and, where appropriate, call tracking."]],
  related:["seo","web-design","analytics","social-media"]},
 {slug:"ecommerce-seo",pillar:"seo",name:"E-commerce SEO",h:"TURN SEARCHES INTO CARTS.",
  problem:"Thousands of product pages, thin descriptions, duplicate category URLs and filters that create crawl chaos. Shoppers search; your store is not in the results.",
  do:["Category and product URL structure review","Collection-page optimisation for commercial intent","Product content guidelines that help buyers decide","Faceted navigation and duplicate control","Internal linking from content to categories","Technical health monitoring"],
  track:["Organic revenue and assisted conversions","Category-page visibility","Indexation vs. crawl waste","Product-page conversion rate from search"],
  channels:["Google Search","Google Shopping (organic listings)","Merchant Center"],deliv:["Store technical audit","Category keyword map","Product content guide","Quarterly roadmap"],
  who:"Online stores on Shopify, WooCommerce or custom platforms with a real catalogue.",
  outcomes:"Category pages that rank for buying terms and product pages that help people decide.",
  faqs:[["Which platform do you work with?","Any: Shopify, WooCommerce, Magento, custom."],["Do you fix technical issues yourselves?","We specify them clearly; implementation is by your developer or ours, as scoped."],["Is Shopping ads SEO?","No, that is paid. Organic Shopping listings via Merchant Center are covered."],["How many products can you optimise?","We prioritise by revenue potential rather than doing everything at once."]],
  related:["seo","cro","google-ads","analytics"]},
 {slug:"content-marketing",pillar:"content",name:"Content Marketing",h:"CONTENT THAT EARNS ATTENTION.",
  problem:"Publishing for the calendar, not the customer. Posts go out; questions stay unanswered; nothing connects to a sale.",
  do:["Content strategy tied to business goals","Audience question research","Editorial calendar with owners and formats","Distribution plan, content does not promote itself","Measurement framework beyond views","Repurposing system across channels"],
  track:["Content-assisted leads and conversions","Engaged time and return visits","Search visibility of content","Share of content that is reused"],
  channels:["Website / blog","Email","LinkedIn","Instagram","YouTube (as scoped)"],deliv:["Content strategy","Editorial calendar","Briefs & drafts","Monthly content report"],
  who:"Brands that want to be trusted before they are chosen.",
  outcomes:"A library of useful material that keeps working after it is published.",
  faqs:[["How much content do we need?","Less than you think, done better. Discovery sets a sustainable cadence."],["Do you write it?","We can, or we brief your team, your choice."],["How do you measure content?","By what it helps cause: enquiries, trials, assisted sales, not just views."],["Do you use AI tools?","Where they help with drafts and research; everything is edited by a human and checked for accuracy."]],
  related:["copywriting","seo","social-media","short-form-content"]},
 {slug:"copywriting",pillar:"content",name:"Copywriting",h:"WORDS THAT MAKE PEOPLE ACT.",
  problem:"Clever headlines that say nothing. Features listed, benefits missing. Calls to action that ask for nothing in particular.",
  do:["Message hierarchy: what to say first, second, last","Hooks and headlines for ads and pages","Offer framing and objection handling","Landing page, email and ad copy","Clear calls to action","Message testing so copy decisions use evidence"],
  track:["Click-through on headlines and hooks","Landing-page conversion rate","Email reply and click rate","Variant win rate in tests"],
  channels:["Ads","Landing pages","Email","Website","WhatsApp scripts"],deliv:["Messaging guide","Copy decks","Variant sets for testing","Copy review notes"],
  who:"Anyone whose words have to carry the sale, founders, D2C brands, B2B teams.",
  outcomes:"Copy that is clearer, more specific and easier to act on.",
  faqs:[["Do you write in Hindi or Hinglish?","Yes, where it fits your audience."],["How many revisions?","Agreed per project; we aim for alignment early with a messaging guide."],["Can you fix our existing pages?","Yes, copy audits are a common starting point."],["Do you write long-form?","Yes, including articles, guides and case-study drafts."]],
  related:["landing-pages","content-marketing","brand-strategy","cro"]},
 {slug:"social-media",pillar:"social",name:"Social Media Management",h:"SHOW UP. STAND OUT. STAY CONSISTENT.",
  problem:"Posting when there is time, going quiet when there is not. No platform strategy, no voice, no idea what any of it is for.",
  do:["Platform strategy, where to be and why","Content pillars tied to business goals","Publishing calendar with approvals","Community response process","Monthly reporting on what moved","Content-production scope clarified in discovery"],
  track:["Reach and saves on priority content","Profile visits to website clicks","Response time to messages","Enquiries attributed to social"],
  channels:["Instagram","LinkedIn","Facebook","YouTube / TikTok (as scoped)"],deliv:["Social strategy","Monthly calendar","Caption & creative briefs","Monthly report"],
  who:"Brands that want consistency and purpose, not just presence.",
  outcomes:"A recognisable presence that sends people somewhere useful.",
  faqs:[["Do you design the posts?","Design and video production are scoped separately; strategy, calendar and captions are included."],["How many posts per week?","As many as you can sustain with quality, set in discovery."],["Do you reply to comments and DMs?","We set the process and can manage it within agreed hours."],["Can you grow followers?","We focus on the right audience and actions, not follower counts."]],
  related:["short-form-content","content-marketing","influencer-marketing","brand-identity"]},
 {slug:"short-form-content",pillar:"social",name:"Short-Form Content Strategy",h:"15 SECONDS TO EARN A FOLLOW.",
  problem:"Reels made without a hook, a point or a next step. Effort goes in; nothing memorable comes out.",
  do:["Hook frameworks for the first three seconds","Story structures that fit 15–60 seconds","Scripting and shot lists","Editing guidance (edits only when agreed in scope)","Testing and repurposing across Reels, Shorts and TikTok","Honest scope: no footage is implied, we plan what you or a creator will shoot"],
  track:["Hook retention","Completion rate","Saves, shares and profile visits","Conversions from pinned or linked content"],
  channels:["Instagram Reels","YouTube Shorts","TikTok"],deliv:["Hook library","Script bank","Shot list templates","Performance review"],
  who:"Founders, D2C and lifestyle brands, educators and personal brands.",
  outcomes:"A repeatable system for making short videos that earn attention and action.",
  faqs:[["Do you film?","Not by default. We script and direct; filming is by you, your team or a creator we help brief."],["Do we need to show our face?","No, voiceover, text and product formats work too."],["How often should we post?","Consistency beats volume; we set a pace you can keep."],["Can old videos be reused?","Often, with new hooks and captions."]],
  related:["social-media","tiktok-ads","meta-ads","copywriting"]},
 {slug:"influencer-marketing",pillar:"social",name:"Influencer Marketing",h:"BORROW TRUST. EARN IT BACK.",
  problem:"Paying for follower counts instead of fit. No brief, no usage rights, no tracking, just a post and a hope.",
  do:["Creator fit assessment based on audience, not vanity numbers","Outreach workflow and negotiation support","Clear briefs with do's and don'ts","Deliverables, usage rights and approvals documented","Tracking links and codes","Reporting on what each collaboration produced"],
  track:["Engaged reach within your target audience","Traffic and conversions per creator","Content reuse value","Cost per result vs. other channels"],
  channels:["Instagram","YouTube","LinkedIn (B2B creators)"],deliv:["Creator shortlist (built per project, no pre-made roster)","Brief template","Agreement checklist","Campaign report"],
  who:"Consumer brands and B2B teams that want third-party credibility.",
  outcomes:"Collaborations that are chosen, briefed and measured properly.",
  faqs:[["Do you have a creator roster?","No fixed roster. We shortlist for each brief so the fit is real."],["Who pays the creator?","You do, directly or via an agreed process; we support negotiation."],["Micro or macro?","Usually micro and mid for fit and cost; we recommend per objective."],["How is it tracked?","Links, codes and agreed reporting windows."]],
  related:["social-media","short-form-content","brand-strategy","analytics"]},
 {slug:"brand-strategy",pillar:"brand",name:"Brand Strategy",h:"KNOW WHO YOU ARE BEFORE THEY ASK.",
  problem:"Every channel says something slightly different. Pricing says premium; copy says cheap; the team cannot explain why you are different in one sentence.",
  do:["Audience and competitor understanding","Positioning and promise","Differentiators that are true and provable","Voice and tone guidelines","Message hierarchy for every touchpoint","Go-to-market priorities"],
  track:["Message consistency across channels","Clarity tests with real prospects","Conversion impact of repositioned pages","Sales team adoption"],
  channels:["All owned, earned and paid touchpoints"],deliv:["Brand strategy document","Messaging framework","Voice guide","Launch priorities"],
  who:"Founders launching, repositioning or scaling past word-of-mouth.",
  outcomes:"One clear story the whole business can tell consistently.",
  faqs:[["How long does it take?","Typically a few weeks of workshops and refinement, set in discovery."],["Is this just a logo?","No. Identity comes after strategy; see Brand Identity."],["Do you interview customers?","Where possible, yes, it is the fastest route to truth."],["Will it change our pricing?","It may inform it; positioning and pricing should agree."]],
  related:["brand-identity","copywriting","web-design","content-marketing"]},
 {slug:"brand-identity",pillar:"brand",name:"Brand Identity",h:"LOOK LIKE YOU MEAN IT.",
  problem:"A logo from years ago, three fonts, colours chosen per post. The brand looks different every time someone meets it.",
  do:["Identity system: logo usage, typography, palette","Digital-first components for social, web and ads","Usage principles so the team stays consistent","Templates for recurring formats","Accessibility-aware colour choices","Handover kit for designers and freelancers"],
  track:["Consistency across live touchpoints","Time saved producing assets","Recognition in audience feedback"],
  channels:["Web","Social","Ads","Print (as scoped)"],deliv:["Identity guidelines","Asset kit","Templates","Handover session"],
  who:"Businesses whose visuals have fallen behind their ambition.",
  outcomes:"A coherent, recognisable look that is easy to apply.",
  faqs:[["Do you redesign logos?","Yes, or refine the existing mark where it still works."],["Do you claim design awards?","No awards or certifications are claimed anywhere on this site."],["Which tools do you deliver in?","Figma or Canva templates depending on your team."],["Can we keep our current colours?","Often yes, we make them work harder."]],
  related:["brand-strategy","web-design","social-media","landing-pages"]},
 {slug:"web-design",pillar:"web",name:"Web Design",h:"A WEBSITE THAT WORKS AS HARD AS YOU DO.",
  problem:"A beautiful site nobody can navigate, or a functional one nobody trusts. Slow, confusing and silent about what to do next.",
  do:["Responsive information architecture","Content hierarchy that guides the visitor","Conversion paths on every key page","Accessibility and performance built in","Analytics and tracking set up at launch","Technical handover and documentation"],
  track:["Core conversions (enquiries, calls, purchases)","Page speed and accessibility scores","Key-page engagement","Form completion rate"],
  channels:["WordPress","Shopify","Webflow","Custom static or framework builds"],deliv:["Sitemap & wireframes","Design system","Built site","Handover docs"],
  who:"Businesses whose website is the first meeting with most customers.",
  outcomes:"A site that is fast, clear, trustworthy and measurable.",
  faqs:[["Which platform do you recommend?","Depends on content, commerce and team, decided in discovery."],["Do you host the site?","We help choose hosting; you own the accounts."],["Will it be accessible?","We target WCAG AA practices as standard."],["Do you provide copy?","Yes, via Copywriting; it is scoped alongside design."]],
  related:["landing-pages","cro","seo","brand-identity"]},
 {slug:"landing-pages",pillar:"web",name:"Landing Pages",h:"ONE PAGE. ONE JOB.",
  problem:"Ads sent to the homepage. Five calls to action. A form asking for twelve fields. The click was earned; the page lost it.",
  do:["Message match between ad and page","One clear goal per page","Friction reduction in layout and form design","Trust elements that are true and specific","Event tracking for every meaningful action","Variant setup for testing"],
  track:["Conversion rate","Form start vs. completion","Scroll depth to key sections","Cost per conversion impact"],
  channels:["Paid search","Paid social","Email","QR / offline campaigns"],deliv:["Page wireframe","Copy","Built page","Tracking plan"],
  who:"Anyone running campaigns that deserve a focused destination.",
  outcomes:"More of the clicks you pay for turn into enquiries or sales.",
  faqs:[["Can it be built on our site?","Yes, or on a dedicated page builder if faster."],["How many fields should a form have?","As few as you need to follow up well."],["Do you A/B test?","When traffic supports it; otherwise we iterate on evidence."],["How fast can one be live?","Often within days once copy and offer are agreed."]],
  related:["cro","copywriting","paid-advertising","analytics"]},
 {slug:"cro",pillar:"web",name:"Conversion Rate Optimisation",h:"YOUR ADS AREN'T THE PROBLEM. YOUR FUNNEL MIGHT BE.",
  problem:"Traffic grows, conversions do not. Decisions are made on opinion, and 'tests' end before anything is learned.",
  do:["Analytics review to find where people leave","Hypotheses ranked by impact and effort","UX friction review on key pages and forms","Experiments where traffic allows; structured iterations where it does not","Clear measurement plans before any change","Honest reporting: no significance claimed without the data"],
  track:["Step-by-step funnel conversion","Form abandonment points","Revenue or leads per visitor","Experiment learning log"],
  channels:["Website","Landing pages","Checkout","Lead forms"],deliv:["Funnel diagnosis","Hypothesis backlog","Experiment plans","Learning reports"],
  who:"Sites with meaningful traffic and unclear results.",
  outcomes:"Fewer leaks, better decisions, and a record of what you learned.",
  faqs:[["Do we need lots of traffic?","For formal A/B tests, yes. For structured improvement, no."],["What tools do you use?","GA4, heatmaps and session recordings where consent allows, plus your platform's data."],["How quickly do we see change?","Depends on traffic and the size of the leak; some fixes show fast."],["Will you redesign our site?","Only if the evidence says so."]],
  related:["landing-pages","analytics","web-design","paid-advertising"]},
 {slug:"marketing-automation",pillar:"automation",name:"Marketing Automation",h:"FOLLOW UP WHILE YOU SLEEP.",
  problem:"Leads arrive and wait. Follow-up depends on who is free. Nobody knows which enquiry went where.",
  do:["Email, WhatsApp and CRM workflow planning","Consent-aware follow-up sequences","Segmentation so messages fit the lead","Hand-off rules between marketing and sales","Failure handling: what happens when a message fails","Reporting on speed-to-lead and sequence results"],
  track:["Time to first response","Sequence completion and reply rates","Lead stage movement","Failed deliveries caught and resolved"],
  channels:["Email","WhatsApp Business API (via approved providers)","CRM (HubSpot, Zoho, others)"],deliv:["Workflow maps","Sequence copy","Setup & QA","Monitoring checklist"],
  who:"Businesses that generate leads faster than they can follow up by hand.",
  outcomes:"Consistent, timely follow-up that respects consent and reaches a human when needed.",
  faqs:[["Which CRM?","The one your team will use. We work with the common ones."],["Is WhatsApp automation allowed?","Through official Business API providers with opt-in, yes."],["Will it feel robotic?","Not if written well and handed to humans at the right moment."],["What if a message fails?","We design failure paths, alerts and fallbacks, from the start."]],
  related:["analytics","copywriting","landing-pages","linkedin-ads"]},
 {slug:"analytics",pillar:"automation",name:"Analytics & Measurement",h:"STOP GUESSING. START TRACKING.",
  problem:"GA4 installed, nothing configured. Conversions counted twice or not at all. Reports full of numbers, empty of answers.",
  do:["Event taxonomy, a naming plan everyone understands","GA4 and tag setup where appropriate","Conversion events that reflect business value","Dashboards that answer specific questions","QA of every tag before launch","Consent-aware implementation"],
  track:["Conversion accuracy vs. source of truth","Dashboard adoption by your team","Data gaps identified and closed"],
  channels:["GA4","Google Tag Manager","Meta / platform pixels","Looker Studio dashboards"],deliv:["Measurement plan","Tag implementation","Dashboard","QA document"],
  who:"Anyone making marketing decisions with numbers they do not fully trust.",
  outcomes:"Numbers you can defend and dashboards that lead to decisions.",
  faqs:[["Do you claim a Google or Meta partnership?","No. FODO makes no platform partnership claims."],["Can you fix double-counted conversions?","Usually, it is one of the most common problems."],["Do you build dashboards?","Yes, focused on the questions you actually ask."],["What about consent and privacy?","Tracking respects consent choices; we implement accordingly."]],
  related:["cro","paid-advertising","marketing-automation","seo"]}
];

/* ---------- INDUSTRIES (7) ---------- */
FODO_DATA.industries = [
 {slug:"ecommerce",name:"E-commerce & D2C",h:"GET FOUND. GET CHOSEN. GET BOUGHT AGAIN.",
  challenges:["Discovery in crowded categories","Product and category findability","Product-page confidence (reviews, details, trust)","Cart and checkout friction","Retention and repeat purchase"],
  behaviour:"Shoppers compare quickly, trust specifics, abandon slow checkouts and return when the experience was easy.",
  approach:"Diagnose the funnel from first visit to repeat order, fix the biggest leak first, then grow demand with paid and organic search together.",
  channels:["Meta Ads","Google Shopping & Search","E-commerce SEO","Email/WhatsApp retention"],
  kpis:["Conversion rate","Cost per acquisition","Average order value","Repeat purchase rate"],services:["ecommerce-seo","meta-ads","cro","marketing-automation"]},
 {slug:"healthcare",name:"Healthcare & Wellness",h:"BE THE PRACTICE PEOPLE TRUST: AND FIND.",
  note:"Applicable healthcare advertising rules, platform policies and patient-privacy requirements must be checked before any campaign launches. FODO never promises clinical outcomes or makes unsupported medical claims.",
  challenges:["Local discovery and trust","Appointment requests that get lost","Educational content that stays compliant","Cautious claims and privacy obligations"],
  behaviour:"Patients search locally, read reviews, compare credentials and want a simple way to book or ask.",
  approach:"Accurate local presence, clear service pages, careful educational content and a follow-up process that respects privacy.",
  channels:["Local SEO","Google Search Ads (policy-checked)","Educational content","Appointment follow-up automation"],
  kpis:["Appointment requests","Call and direction requests","Review volume and response","Page-to-enquiry rate"],services:["local-seo","content-marketing","web-design","marketing-automation"]},
 {slug:"real-estate",name:"Real Estate",h:"FEWER TYRE-KICKERS. MORE SERIOUS BUYERS.",
  challenges:["Lead quality over lead volume","Location and project pages that convert","Enquiry funnels that leak","Sales follow-up over long cycles"],
  behaviour:"Buyers research for months, shortlist by location and budget, and respond to fast, specific follow-up.",
  approach:"Qualify in the funnel, build location-specific pages, align ads with budget and intent, and automate follow-up without losing the human touch.",
  channels:["Google Search","Meta lead campaigns","Location SEO","CRM + WhatsApp follow-up"],
  kpis:["Qualified lead rate","Cost per site visit booked","Follow-up speed","Lead-to-visit conversion"],services:["google-ads","landing-pages","marketing-automation","local-seo"]},
 {slug:"startups",name:"Startups",h:"TEST FAST. LEARN FASTER. SPEND WISELY.",
  challenges:["Audience validation","Lean experiments with small budgets","Go-to-market sequencing","Learning velocity"],
  behaviour:"Early customers are curious but sceptical; clear positioning and proof beat polish.",
  approach:"Prioritise one audience and one message, run small structured tests, and invest only where evidence appears.",
  channels:["Landing-page tests","Targeted paid tests","Founder-led content","Email/WhatsApp nurture"],
  kpis:["Cost per qualified signup","Message test win rate","Activation rate","Learning per rupee spent"],services:["brand-strategy","landing-pages","paid-advertising","analytics"]},
 {slug:"saas",name:"SaaS",h:"TURN PAIN POINTS INTO PIPELINE.",
  challenges:["Pain-point messaging","Trial and demo acquisition","Funnel conversion from visit to activation","Lifecycle content","Pipeline quality"],
  behaviour:"Buyers compare features, read documentation, want proof and prefer trying before talking.",
  approach:"Intent-led search, decision-maker targeting on LinkedIn, lifecycle content and measurement from first visit to retained account.",
  channels:["Google Search","LinkedIn Ads","SEO & content","Lifecycle automation"],
  kpis:["Trial/demo conversion rate","Cost per qualified pipeline","Activation rate","Content-assisted pipeline"],services:["linkedin-ads","seo","marketing-automation","cro"]},
 {slug:"local-business",name:"Local Business",h:"WHEN THEY SEARCH NEARBY, BE THE ANSWER.",
  challenges:["Local search visibility","Accurate business details everywhere","Calls and messages that get answered","Reputation management","Location-specific landing pages"],
  behaviour:"People search with intent to visit or call today; proximity, reviews and clear hours decide.",
  approach:"Fix the basics first, profile, details, reviews, then add local pages and targeted ads where demand exists.",
  channels:["Google Business Profile","Local SEO","Local search ads","Instagram"],
  kpis:["Calls and direction requests","Map-pack visibility","Review rating and volume","Enquiry response time"],services:["local-seo","google-ads","social-media","web-design"]},
 {slug:"personal-brands",name:"Personal Brands",h:"BE KNOWN FOR SOMETHING SPECIFIC.",
  challenges:["Positioning","Content pillars","Credibility and audience trust","Consistent distribution","Lead capture"],
  behaviour:"Audiences follow people who are consistent, specific and useful, and buy when trust meets a clear offer.",
  approach:"Define one position, build three to four content pillars, distribute consistently and capture interest with a simple offer.",
  channels:["LinkedIn","Instagram / short-form","Newsletter","Landing page"],
  kpis:["Profile visits to link clicks","Newsletter growth","Enquiries per month","Content consistency"],services:["brand-strategy","short-form-content","content-marketing","landing-pages"]}
];

/* ---------- CASE STUDIES (6 CONCEPTS) ---------- */
FODO_DATA.cases = [
 {slug:"d2c-skincare-funnel",title:"D2C skincare: fixing the funnel before scaling ads",tags:["E-COMMERCE","PAID MEDIA"],industry:"E-commerce",
  challenge:"Rising ad costs with flat revenue; traffic landing on a slow homepage.",insight:"The ad was not the problem, the path from ad to cart was.",strategy:"Pause scaling; build product-specific landing pages; restructure Meta campaigns by objective.",execution:"Three landing pages, creative test matrix, Conversions API tracking review.",creative:"Ingredient-led hooks and real usage demos (scripted; footage client-side).",channels:["Meta Ads","Landing pages","Email"],kpis:["Cost per purchase","Landing-page conversion rate","Repeat purchase rate"],lesson:"Fix the leak, then turn up the tap."},
 {slug:"b2b-saas-linkedin",title:"B2B SaaS: decision-maker pipeline on LinkedIn",tags:["B2B","LEAD GENERATION"],industry:"SaaS",
  challenge:"Many leads, few that sales wanted to call.",insight:"Targeting by job title alone brought the wrong seniority.",strategy:"Rebuild audiences around company size and seniority; swap the ebook for a 20-minute assessment offer.",execution:"Lead Gen Form vs. landing page test, lead scoring sheet with sales.",creative:"Problem-first copy, no product screenshots in cold ads.",channels:["LinkedIn Ads","Email nurture"],kpis:["Cost per qualified lead","Meeting rate","Pipeline created"],lesson:"Lead quality is a targeting and offer problem, not a volume problem."},
 {slug:"clinic-local-seo",title:"Multi-location clinic: owning local search",tags:["LOCAL BUSINESS","SEO"],industry:"Healthcare",
  challenge:"Inconsistent profiles, no review process, one branch invisible on Maps.",insight:"Each branch needed its own accurate presence and page.",strategy:"Clean business details, per-location pages, review request process, compliant educational content.",execution:"Profile optimisation, location page template, staff review script.",creative:"Plain-language service explanations; no outcome claims.",channels:["Google Business Profile","Local SEO","Content"],kpis:["Calls and directions","Map-pack visibility","Appointment requests"],lesson:"Accuracy and consistency are the first ranking factors you control."},
 {slug:"restaurant-social-reels",title:"Restaurant group: a short-form system that fits the kitchen",tags:["SOCIAL","LOCAL BUSINESS"],industry:"Hospitality",
  challenge:"Sporadic posting; no connection between content and bookings.",insight:"The team had great moments but no system to capture them.",strategy:"Four content pillars, a weekly 30-minute shoot routine, hooks library, booking link in every post.",execution:"Shot lists, caption templates, monthly review.",creative:"Behind-the-pass moments, dish reveals, staff voices.",channels:["Instagram Reels","Google Business posts"],kpis:["Saves and shares","Profile to booking clicks","Posting consistency"],lesson:"A system the team can keep beats a campaign they cannot."},
 {slug:"realestate-lead-quality",title:"Real estate developer: qualifying leads inside the funnel",tags:["LEAD GENERATION","PAID MEDIA"],industry:"Real Estate",
  challenge:"Hundreds of leads, mostly outside budget; slow follow-up.",insight:"The form invited everyone; the sales team paid for it.",strategy:"Add budget and timeline qualifiers, align ad copy with price band, automate first response on WhatsApp.",execution:"Campaign rebuild, landing page with qualifiers, CRM workflow.",creative:"Location and lifestyle framing with transparent price band.",channels:["Google Search","Meta","WhatsApp automation"],kpis:["Qualified lead rate","Speed to first response","Site visits booked"],lesson:"A little friction in the right place saves a lot of wasted calls."},
 {slug:"founder-brand-reposition",title:"Consulting founder: repositioning a personal brand",tags:["BRANDING","B2B"],industry:"Professional services",
  challenge:"Known as a generalist; inbound enquiries were small and random.",insight:"Being for everyone made the founder memorable to no one.",strategy:"Narrow to one audience and one promise; three content pillars; a single assessment offer.",execution:"Messaging guide, LinkedIn content calendar, landing page.",creative:"Opinionated, specific posts drawn from real client patterns (anonymised).",channels:["LinkedIn","Newsletter","Landing page"],kpis:["Enquiry fit","Newsletter growth","Profile to page clicks"],lesson:"Specific positioning filters as much as it attracts, that is the point."}
];

/* ---------- ARTICLES (8) ---------- */
FODO_DATA.articles = [
 {slug:"traffic-vs-customers",cat:"Growth",title:"Why more traffic does not automatically mean more customers",date:"2026-10-01",
  body:`<p>Traffic is the easiest marketing number to grow and the easiest to misread. Buy more clicks, publish more posts, and the sessions chart goes up. The bank balance often does not follow. Understanding why is the first step to spending more intelligently.</p>
<h3>Traffic is a cost until it converts</h3><p>Every visit costs something, money for ads, time for content, attention from your team. A visit only becomes valuable when it does something: enquires, buys, signs up, or returns later. If you measure traffic without measuring what traffic does, you are measuring spend and calling it progress.</p>
<h3>Three reasons traffic grows while customers do not</h3><p><strong>Wrong people.</strong> Broad targeting and curiosity-driven content attract visitors who were never going to buy. The sessions are real; the intent is not.</p><p><strong>Broken path.</strong> The visitor was right but the page was wrong: slow, unclear, no obvious next step, a form that asks too much. Illustratively, if a page converts 1 in 100 visitors, doubling traffic doubles the cost of every leak too.</p><p><strong>No follow-up.</strong> Many customers do not buy on the first visit. Without email, WhatsApp or retargeting, each visit is a one-time event.</p>
<h3>What to measure instead</h3><ul><li>Conversion rate by source, which channels bring people who act?</li><li>Cost per lead or acquisition, not cost per click.</li><li>Lead quality, agreed with the people who talk to leads.</li><li>Return visits and repeat purchases.</li></ul>
<h3>A practical check</h3><p>Pick your top three traffic sources. For each, write down the conversion rate and the cost per conversion. If one source has high traffic and low conversion, decide: fix the page it lands on, or stop paying for it. That one exercise usually changes next month's budget more than any new channel would.</p>`},
 {slug:"diagnose-landing-page",cat:"Paid Media",title:"How to diagnose a landing page before increasing ad spend",date:"2026-09-24",
  body:`<p>Scaling spend on a leaking page is the most common way to lose money in paid media. Before you raise a budget, spend thirty minutes on this diagnosis.</p>
<h3>1. Message match</h3><p>Open your ad and your landing page side by side. Does the headline on the page repeat the promise in the ad? If the ad says "free assessment" and the page says "welcome to our company", visitors feel lost and leave.</p>
<h3>2. One job</h3><p>Count the calls to action. If there are more than one (plus a small secondary), the page is asking the visitor to make decisions you should have made for them.</p>
<h3>3. Above-the-fold clarity</h3><p>Without scrolling, can a stranger answer three questions: what is this, who is it for, what do I do next? Read it on a phone, not a monitor.</p>
<h3>4. Speed</h3><p>Load the page on mobile data. If you notice the wait, your visitors are already gone. Compress images, remove unused scripts, and avoid heavy embeds above the fold.</p>
<h3>5. Form friction</h3><p>Every field should earn its place. Ask what you need to follow up well, usually name, one contact method, and one qualifying question. Add the rest later in conversation.</p>
<h3>6. Trust that is true</h3><p>Specific, honest proof beats generic badges. If you do not have testimonials yet, say what you do and how you work. Never invent proof; it is both risky and obvious.</p>
<h3>7. Tracking</h3><p>Submit a test enquiry. Did it appear in your analytics as a conversion? Did someone receive it? If either answer is no, fix tracking before spending another rupee.</p>
<p>If the page passes all seven, increase the budget in steps and watch cost per conversion, not just volume. If it fails any, fix that first, it is almost always cheaper than buying more traffic.</p>`},
 {slug:"small-business-seo-foundation",cat:"SEO",title:"A practical small-business SEO foundation",date:"2026-09-17",
  body:`<p>SEO advice is often written for large sites with large teams. A small business needs a foundation it can actually maintain. Here is one.</p>
<h3>Get the technical basics right once</h3><ul><li>One version of your site (www or non-www, HTTPS) with the other redirecting.</li><li>Every important page reachable within two or three clicks from the homepage.</li><li>Fast pages, compressed images, no bloated plugins.</li><li>A sitemap submitted in Google Search Console.</li></ul>
<h3>One page per thing you sell</h3><p>A single "services" page that lists everything rarely ranks for anything. Give each core service its own page that explains the problem, the process, who it is for, and how to enquire. Write for a person, not for a keyword list.</p>
<h3>Match the words people use</h3><p>Look at how customers describe their problem in emails and calls. Those phrases belong in your headings. Search Console will show you which queries already bring impressions, start there.</p>
<h3>Local signals if you are local</h3><p>Keep your Google Business Profile accurate and active, make sure your address and phone match everywhere, and ask real customers for reviews with a simple, consistent process.</p>
<h3>Internal links are free</h3><p>Link from articles to service pages and from service pages to related services. Use descriptive anchor text. This helps visitors and search engines understand what matters.</p>
<h3>Publish less, but useful</h3><p>One well-answered question a month beats four thin posts. Answer what customers actually ask before they buy.</p>
<h3>Measure what matters</h3><p>Track enquiries and calls from organic search, not just sessions. SEO takes months; the measure of progress is more of the right visitors doing the right thing.</p>`},
 {slug:"social-content-pillars",cat:"Social",title:"How to choose social content pillars that support business goals",date:"2026-09-10",
  body:`<p>Content pillars are the three to five themes your social presence keeps returning to. Chosen well, they make planning easier and make your brand recognisable. Chosen badly, they are just categories for random posts.</p>
<h3>Start from the goal, not the platform</h3><p>Write down what social media should cause for the business: enquiries, bookings, store visits, trust before a sales call. Every pillar should be able to answer "how does this help that happen?"</p>
<h3>A simple pillar structure</h3><ul><li><strong>Proof</strong>, how you work, behind the scenes, process, results you can honestly show.</li><li><strong>Teach</strong>, answers to the questions customers ask before buying.</li><li><strong>Point of view</strong>, what you believe about your field that others do not say.</li><li><strong>Offer</strong>, what you sell and how to start, stated clearly and regularly.</li></ul>
<h3>Test pillars against reality</h3><p>Can your team produce this content every week without heroics? If a pillar needs a video crew you do not have, it will die in month two. Illustratively, a founder who can record one voice note a day has a sustainable pillar; one who needs a studio does not.</p>
<h3>Give each pillar a job and a metric</h3><p>Proof builds trust (saves, profile visits). Teach builds reach (shares). Point of view builds memory (comments). Offer builds action (link clicks, messages). Review monthly which pillar is doing its job.</p>
<h3>Rotate, do not ration</h3><p>You do not need equal volume. Lean toward what works for your goals while keeping the others alive so the feed does not become a sales page.</p>`},
 {slug:"useful-marketing-dashboard",cat:"Strategy",title:"What a useful marketing dashboard should answer",date:"2026-09-03",
  body:`<p>Most dashboards are built by asking "what data do we have?" Useful ones are built by asking "what decisions do we make?" Here is how to design one that gets opened.</p>
<h3>Start with five questions</h3><ol><li>Are we getting enough of the right enquiries or sales this month?</li><li>What does each one cost, by channel?</li><li>Where in the funnel are we losing people?</li><li>Which content or creative is working right now?</li><li>Is anything broken, tracking, forms, spend pacing?</li></ol>
<h3>One number per question, then detail</h3><p>The top row should answer each question at a glance. Trends and breakdowns live below. If a visitor needs to scroll to know whether the month is on track, the dashboard has failed.</p>
<h3>Agree definitions first</h3><p>What counts as a lead? A form submission, a qualified call, a booked meeting? Write it down. Illustratively, two teams reporting "leads" with different definitions will argue about numbers instead of acting on them.</p>
<h3>Compare against something</h3><p>A number alone means nothing. Show the previous period and the agreed target. Colour only when it changes a decision.</p>
<h3>Trust it or fix it</h3><p>Add a small "data health" section: last tracking QA date, known gaps, platform discrepancies. A dashboard that admits its limits is more useful than one that hides them.</p>
<h3>Keep it short</h3><p>If it needs a tour, it is a report, not a dashboard. Monthly deep-dives belong in a separate document with commentary.</p>`},
 {slug:"first-paid-media-experiment",cat:"Paid Media",title:"How to structure a first paid-media experiment",date:"2026-08-27",
  body:`<p>A first campaign should be designed to teach you something, not to "go viral". Here is a structure that keeps the lesson clear and the cost controlled.</p>
<h3>Choose one objective</h3><p>Leads, purchases or bookings, one. Mixed objectives make every result ambiguous.</p>
<h3>Choose one audience and one page</h3><p>Pick the audience you understand best and send them to a page built for this offer. Changing audience, creative and page at once means you will never know what mattered.</p>
<h3>Write a hypothesis</h3><p>"We believe [audience] will respond to [message] because [reason]. We will know within [time/budget] if cost per [result] is under [threshold]." Illustrative thresholds are fine, the point is deciding in advance what success looks like.</p>
<h3>Test creative, not everything</h3><p>Run three to five creative angles against the same audience. Hooks and formats are where early learning is fastest and cheapest.</p>
<h3>Set a learning budget</h3><p>Decide how much you are willing to spend to learn, and stop there to review. Do not let the platform's "learning phase" become your budgeting strategy.</p>
<h3>Verify tracking before launch</h3><p>Fire a test conversion and see it land in your analytics and your inbox. Nothing is more expensive than a week of unmeasured spend.</p>
<h3>Review with evidence</h3><p>At the end, answer: which creative won, what did a result cost, what surprised us, and what is the next single change? That answer is worth more than the first campaign's results.</p>`},
 {slug:"positioning-and-conversion",cat:"Brand",title:"How brand positioning affects conversion",date:"2026-08-20",
  body:`<p>Positioning sounds like a branding exercise. It is actually a conversion lever. The clearer a visitor is about what you are and who you are for, the faster they decide.</p>
<h3>Confusion is friction</h3><p>When a page tries to appeal to everyone, each visitor has to work out whether it applies to them. Most will not bother. A clear statement: "for growing D2C brands who have outgrown boosted posts", lets the right people lean in and the wrong people leave quickly, which also improves your ad metrics.</p>
<h3>Specific beats superior</h3><p>"Best digital agency" is a claim; "we fix funnels before scaling ads" is a position. Claims invite doubt. Positions invite the question "is that my problem?", a much better conversation to start.</p>
<h3>Positioning shapes the whole page</h3><p>Once the position is clear, headlines, proof, objections and calls to action write themselves. Without it, every section argues with the next.</p>
<h3>Price and position must agree</h3><p>Premium pricing with discount-shop language, or value pricing with luxury visuals, creates a mismatch the visitor feels before they can explain it.</p>
<h3>A simple test</h3><p>Show your homepage to someone outside your business for ten seconds and ask them to describe who it is for and what it does. If their answer is vague, the problem is positioning, not design.</p>`},
 {slug:"simple-lead-follow-up-system",cat:"Growth",title:"A simple follow-up system for inbound leads",date:"2026-08-13",
  body:`<p>Most businesses do not have a lead problem; they have a follow-up problem. Enquiries arrive, sit in an inbox, and go cold. This system takes an afternoon to set up.</p>
<h3>1. One inbox, one owner</h3><p>Route every enquiry, forms, WhatsApp, email, calls, into one place (a CRM, a shared sheet, or a labelled inbox). Name one person responsible each day.</p>
<h3>2. Acknowledge in minutes</h3><p>Automate a short, honest reply: what you received, what happens next, when they will hear from a human. On WhatsApp this is a template; on email it is an autoresponder.</p>
<h3>3. Qualify with two questions</h3><p>Ask what they want to achieve and when. Those two answers tell you how to prioritise and how to prepare.</p>
<h3>4. A five-touch sequence</h3><p>Day 0 reply, day 1 call or message, day 3 useful resource, day 7 check-in, day 14 final friendly close. Write the messages once; personalise the first line each time.</p>
<h3>5. Record outcomes</h3><p>Won, lost, no response, not a fit, and why. Within a month you will see patterns: which sources bring fit, which messages get replies.</p>
<h3>6. Review weekly</h3><p>Fifteen minutes: how many enquiries, how fast the first response, how many moved forward. Speed to first response is usually the number that moves everything else.</p>
<p>Automation can run steps 2 and 4; humans must own steps 3 and 5. Done consistently, this system often matters more than the next campaign.</p>`}
];

/* ---------- FAQS ---------- */
FODO_DATA.faqs = [
 {c:"Services",q:"What does FODO actually do?",a:"We plan and run digital growth work: paid media, SEO, content, social, brand, websites, automation and measurement, connected by one Growth System so every activity has a reason and a measure."},
 {c:"Services",q:"Do you produce videos and designs?",a:"We plan, script and brief. Design and video production are scoped separately with you or a partner; we never imply footage exists when it does not."},
 {c:"Pricing",q:"How much does it cost?",a:"There is no fixed price list. Scope depends on channels, complexity, creative needs and goals. Ad spend is always paid by you, from your accounts. Request a custom growth plan and we will scope it with you."},
 {c:"Pricing",q:"Is there a minimum ad budget?",a:"We advise a realistic minimum per channel during discovery based on your market; we will tell you honestly if a channel is not worth it at your budget."},
 {c:"Process",q:"What is the FODO Growth System?",a:"Six stages: Discover, Diagnose, Strategize, Build, Launch, Optimize, that keep work accountable. See it on the About page."},
 {c:"Process",q:"What do you need from us to start?",a:"Access to your analytics and ad accounts, a clear owner on your side, your goals, and honest answers in discovery."},
 {c:"Ads",q:"Do you guarantee results from ads?",a:"No. We agree targets, test transparently and report honestly. Results depend on offer, market, budget and execution."},
 {c:"Ads",q:"Who owns the ad accounts?",a:"You do. We work inside your accounts so data and history stay with you."},
 {c:"SEO",q:"How long does SEO take?",a:"Typically months before meaningful movement. We show progress indicators along the way and never promise rankings."},
 {c:"Websites",q:"Which website platform do you use?",a:"WordPress, Shopify, Webflow or custom builds, chosen for your content, commerce and team."},
 {c:"Timelines",q:"How fast can we launch a campaign?",a:"Once tracking, creative and landing page are approved, launch can be quick. Typical timeline: 2–3 weeks from kickoff to first live campaign, agreed in your proposal."},
 {c:"Reporting",q:"How do you report?",a:"A dashboard that answers specific questions plus a monthly written review of what moved, what we learned and what changes next."},
 {c:"Contracts",q:"What are the contract terms?",a:"Most engagements start with a 3-month sprint and continue month-to-month with 30 days' notice. Payment terms are set out in your proposal."},
 {c:"Growth Audit",q:"What is the Free Growth Audit?",a:"A human review of your website, SEO, paid media, social, content, conversion path and measurement, followed by a conversation about priorities. It is not an automated scan."},
 {c:"Growth Audit",q:"Is it really free?",a:"Yes. It is how we understand whether we can help before anyone commits."},
 {c:"Tools/Game",q:"Is the Growth Score a real audit?",a:"No. It is a self-assessment based on your answers, useful for reflection, not a substitute for a real audit."},
 {c:"Tools/Game",q:"What do I get from the FODO Challenge?",a:"A score, explanations for every answer, and, if you score under 40, an invitation to a free 30-minute consultation. Higher scores unlock the Growth Playbook and a strategy-call option."}
];

/* ---------- GROWTH SYSTEM ---------- */
FODO_DATA.stages = [
 {n:"01",name:"Discover",what:"We learn your goals, audience, current channels and business context.",fodo:"Structured discovery call, account and analytics access review, competitor scan.",client:"A clear brief that reflects your business, not a template.",measure:"Baseline numbers and the gaps in them.",next:"Diagnose"},
 {n:"02",name:"Diagnose",what:"We find bottlenecks, evidence gaps, funnel friction and measurement problems.",fodo:"Funnel walk-through, tracking QA, creative and content review.",client:"A prioritised list of what is leaking and why.",measure:"Conversion by step, data quality, wasted spend.",next:"Strategize"},
 {n:"03",name:"Strategize",what:"We decide the right audience, message, channel mix and KPIs.",fodo:"Strategy document with hypotheses, budget logic and success measures.",client:"A plan you can approve, question and hold us to.",measure:"Agreed KPIs and thresholds.",next:"Build"},
 {n:"04",name:"Build",what:"We create campaign structures, content plans, landing pages or tracking, whatever is in scope.",fodo:"Build, copy, setup, QA checklists.",client:"Working assets reviewed before anything goes live.",measure:"QA pass rate, tracking verification.",next:"Launch"},
 {n:"05",name:"Launch",what:"We launch only after approvals, QA, tracking verification and budget agreement.",fodo:"Controlled launch, pacing checks, early-signal monitoring.",client:"Confidence that nothing goes live unapproved.",measure:"Delivery, pacing, early cost per result.",next:"Optimize"},
 {n:"06",name:"Optimize",what:"We assess evidence, learn, iterate and report.",fodo:"Weekly optimisation, monthly review, next-step recommendations.",client:"Plain-language reports and a clear next decision.",measure:"KPI movement vs. targets, learning log.",next:"Discover (next cycle)"}
];

/* ---------- CHECKLISTS ---------- */
FODO_DATA.checklists = [
 {id:"general",name:"General Marketing Checklist",items:["One-sentence positioning written down","Primary audience defined","One business goal per quarter for marketing","Conversion tracking verified this month","Follow-up process for every enquiry","Monthly review scheduled with owners","Budget split by channel with reasons","Brand voice guide exists and is used"]},
 {id:"ads",name:"Ad Audit Checklist",items:["One objective per campaign","Audiences do not overlap heavily","Negative keywords / exclusions maintained","Ad message matches landing page headline","Creative refreshed before fatigue","Conversion events fire once and correctly","Budget pacing checked weekly","Search terms / placements reviewed"]},
 {id:"seo",name:"SEO Checklist",items:["Single canonical domain with HTTPS","Sitemap submitted and indexed pages reviewed","One page per core service or category","Titles and headings match real search phrases","Internal links from content to service pages","Images compressed, pages load fast on mobile","Google Business Profile accurate (if local)","Organic enquiries tracked, not just sessions"]},
 {id:"landing",name:"Landing Page Checklist",items:["Headline repeats the ad promise","One primary call to action","Who it is for stated above the fold","Form asks only what is needed","Loads quickly on mobile data","Trust elements are specific and true","Thank-you state confirms next steps","All events tracked and tested"]},
 {id:"social",name:"Social Media Audit",items:["Bio states who you help and how to start","Link goes to a page with one job","Three to five content pillars defined","Posting cadence is sustainable","Comments and DMs answered within a set time","Profile visits to link clicks tracked","Highlights / pinned posts show proof and offer","Monthly review of what moved"]}
];

/* ---------- QUIZ (10) ---------- */
FODO_DATA.quiz = [
 {q:"An ad has a high click-through rate but very few conversions. The most likely first place to look is:",o:["The ad's colours","The landing page and offer","The platform's algorithm","The time of day"],a:1,e:"A high CTR means the ad is earning clicks; losing people afterwards usually points to the landing page, offer or form."},
 {q:"In SEO, 'search intent' means:",o:["How often a word is searched","What the searcher is actually trying to do","The keyword's cost per click","The page's load speed"],a:1,e:"Intent is the goal behind the query, learn, compare, buy, find nearby. Pages that match intent perform better."},
 {q:"Brand positioning is primarily about:",o:["Your logo and colours","Being everywhere at once","Who you are for and why you are different","Having the lowest price"],a:2,e:"Positioning is the clear space you occupy in a customer's mind, audience, promise and difference."},
 {q:"Which change is most likely to improve a lead form's completion rate?",o:["Adding more fields to qualify leads","Removing unnecessary fields","Making the submit button smaller","Hiding the privacy note"],a:1,e:"Each field adds friction. Ask only what you need to follow up well."},
 {q:"The best measure of content marketing success is usually:",o:["Total page views","Number of posts published","Actions it helps cause, enquiries, trials, assisted sales","Word count"],a:2,e:"Views are an input. Content should be judged by what it helps the business achieve."},
 {q:"A social content pillar should be chosen because:",o:["It is trending this week","It supports a business goal and is sustainable to produce","Competitors post about it","It gets the most likes"],a:1,e:"Pillars are long-term themes; they must connect to goals and be realistic to keep producing."},
 {q:"'Conversion rate' means:",o:["Clicks divided by impressions","Visitors who take the desired action divided by total visitors","Money spent per click","Followers gained per post"],a:1,e:"Conversion rate = desired actions ÷ visitors (or sessions). CTR is clicks ÷ impressions."},
 {q:"Before increasing an ad budget you should first:",o:["Change the creative colours","Verify tracking and check the landing page","Add every possible audience","Switch platforms"],a:1,e:"Scaling without verified tracking or a working page multiplies waste."},
 {q:"In Google Ads, negative keywords are used to:",o:["Attack competitors","Stop ads showing for irrelevant searches","Lower the quality score","Increase impressions"],a:1,e:"Negatives exclude searches that are not relevant, protecting budget for real intent."},
 {q:"A useful marketing dashboard should mainly:",o:["Show every metric available","Answer the specific decisions the team makes","Use as many colours as possible","Update once a year"],a:1,e:"Dashboards exist to support decisions; start from questions, not from available data."}
];

/* ---------- GAME ROUNDS (all HYPOTHETICAL) ---------- */
FODO_DATA.game = {
 round1:[ // Spot the winner, objective + two cards
  {obj:"Objective: lowest cost per purchase",a:{n:"Campaign A",m:["Clicks: 4,200","CTR: 3.1%","Purchases: 42","Cost/Purchase: ₹950"]},b:{n:"Campaign B",m:["Clicks: 1,100","CTR: 1.2%","Purchases: 55","Cost/Purchase: ₹610"]},w:"b",e:"B has fewer clicks and a lower CTR but more purchases at lower cost. The objective was purchases, not clicks."},
  {obj:"Objective: qualified B2B leads",a:{n:"Campaign A",m:["Leads: 180","Cost/Lead: ₹400","Sales-accepted: 9"]},b:{n:"Campaign B",m:["Leads: 60","Cost/Lead: ₹1,100","Sales-accepted: 24"]},w:"b",e:"A looks cheaper per lead, but B produced far more leads sales actually accepted. Cost per qualified lead is what matters."},
  {obj:"Objective: store bookings",a:{n:"Campaign A",m:["Reach: 220,000","Likes: 3,400","Bookings: 12"]},b:{n:"Campaign B",m:["Reach: 40,000","Likes: 300","Bookings: 31"]},w:"b",e:"Reach and likes are vanity here; B delivered more bookings."},
  {obj:"Objective: lowest cost per lead with equal quality",a:{n:"Campaign A",m:["Spend: ₹30,000","Leads: 75","Cost/Lead: ₹400"]},b:{n:"Campaign B",m:["Spend: ₹30,000","Leads: 50","Cost/Lead: ₹600"]},w:"a",e:"With quality equal, A's lower cost per lead wins. Don't overthink, sometimes the obvious metric is the right one."}
 ],
 round2:{order:["Attention","Landing Page","Lead","Follow-up","Conversion"],e:"Attention brings people in, the landing page earns the lead, follow-up turns the lead into a conversion."},
 round3:[
  {s:"Hypothetical: a Search campaign has spent 60% of budget, cost per lead is 30% under target, lead quality is confirmed good by sales.",o:["PAUSE","SCALE","OPTIMIZE"],a:1,e:"Evidence is strong across cost, quality and pacing, scaling in steps is the right call."},
  {s:"Hypothetical: a Meta campaign's cost per purchase doubled in a week; frequency rose to 6 and CTR fell by half.",o:["PAUSE","SCALE","OPTIMIZE"],a:2,e:"Signs of creative fatigue. Refresh creative and audiences rather than pausing everything or scaling."},
  {s:"Hypothetical: tracking shows 0 conversions for 3 days; a test submission does not appear in analytics.",o:["PAUSE","SCALE","OPTIMIZE"],a:0,e:"Tracking is broken, pause spend until measurement is fixed. Optimising blind wastes money."},
  {s:"Hypothetical: a LinkedIn campaign brings many leads at low cost, but sales rejects 90% as wrong seniority.",o:["PAUSE","SCALE","OPTIMIZE"],a:2,e:"The targeting and offer need fixing. Low cost per bad lead is still waste."}
 ],
 round4:[
  {q:"Hook rate on a Reel is low. First fix?",o:["Longer video","Stronger first 2 seconds","More hashtags"],a:1},
  {q:"A query 'best CRM for small teams' signals intent to:",o:["Buy immediately","Compare options","Find a nearby store"],a:1},
  {q:"Form conversion drops after adding a 'company size' field. Likely cause?",o:["Added friction","Bad weather","Font choice"],a:0},
  {q:"A lead replies at 9pm. Best automated action?",o:["Ignore till Monday","Acknowledge now, human follow-up next morning","Send a discount"],a:1},
  {q:"Two 'leads' definitions in two reports. First step?",o:["Average them","Agree one definition","Pick the bigger number"],a:1},
  {q:"Your ad promises 'free audit'; page headline says 'Welcome'. Problem?",o:["Message mismatch","Too many colours","Good practice"],a:0},
  {q:"Retargeting audience is 300 people. You should:",o:["Spend heavily on it","Expect little scale; focus on prospecting","Duplicate it five times"],a:1},
  {q:"Which proves a landing page change worked?",o:["It looks nicer","Conversion rate improved with enough data","The team liked it"],a:1},
  {q:"GA4 shows double the conversions of your CRM. Likely issue?",o:["Tag firing twice","CRM is wrong","Ignore it"],a:0},
  {q:"Best measure for a brand awareness campaign that aims to drive searches later?",o:["Likes","Branded search volume trend","Number of posts"],a:1}
 ]
};

/* ---------- Growth Lab content pack (2026-10-26), more variety for replays. Hypothetical / educational only. ---------- */
FODO_DATA.quizCats = ["Ads","SEO","Brand","Conversion","Content","Social","Analytics","Email & WhatsApp"];
FODO_DATA.quiz.forEach(function(q,i){ q.c=q.c||["Ads","SEO","Brand","Conversion","Content","Social","Conversion","Ads","Ads","Analytics"][i]||"Ads"; q.d=q.d||1; });
FODO_DATA.quiz.push(
 {c:"Ads",d:1,q:"ROAS of 4x means:",o:["₹4 of revenue for every ₹1 of ad spend","4% of visitors bought","Profit is 4 times the spend","The ad was shown 4 times per person"],a:0,e:"ROAS = revenue ÷ ad spend. It ignores product cost, so 4x is not the same as 4x profit."},
 {c:"Ads",d:2,q:"Your product margin is 25%. Roughly what ROAS do you need just to break even on the first order?",o:["1.25x","2.5x","4x","25x"],a:2,e:"Break-even ROAS ≈ 1 ÷ margin. At 25% margin, 1 ÷ 0.25 = 4x."},
 {c:"Ads",d:2,q:"Frequency is 7 and CTR keeps falling on a Meta campaign. Most likely:",o:["The pixel is broken","Creative fatigue","The budget is too low","SEO competition"],a:1,e:"High frequency with falling CTR is the classic sign that the same people are tired of the same ad. Refresh creative."},
 {c:"Ads",d:1,q:"In Google Search, a 'broad match' keyword:",o:["Only shows for the exact phrase","Can show for related searches the system thinks match","Only shows on YouTube","Is the same as a negative keyword"],a:1,e:"Broad match reaches related searches, which is why it needs good conversion tracking and negative keywords."},
 {c:"SEO",d:1,q:"A Google Business Profile matters most for:",o:["International e-commerce","Local 'near me' and Maps searches","Email open rates","YouTube views"],a:1,e:"The local pack and Maps results are driven largely by the Business Profile, reviews and distance."},
 {c:"SEO",d:2,q:"Two pages on your site target the exact same keyword. This is called:",o:["Keyword cannibalisation","Link building","Schema markup","Crawl budget"],a:0,e:"Cannibalisation splits signals between pages. Merge them or give each page a distinct intent."},
 {c:"SEO",d:2,q:"Which is a technical SEO issue?",o:["A blog post that is too short","Important pages blocked in robots.txt","A boring headline","Too few Instagram posts"],a:1,e:"If crawlers are blocked, pages can't be indexed no matter how good the content is."},
 {c:"SEO",d:3,q:"Structured data (schema) mainly helps search engines:",o:["Rank you #1 automatically","Understand what the page is about and show rich results","Speed up your server","Remove competitors"],a:1,e:"Schema clarifies meaning (FAQ, product, business) and can enable rich results, it is not a ranking guarantee."},
 {c:"Brand",d:1,q:"A strong value proposition answers:",o:["What we sell, for whom, and why us","Our office address","Our founding year","How many followers we have"],a:0,e:"Who it's for, the outcome, and the reason to believe, in one clear line."},
 {c:"Brand",d:2,q:"'We offer the best quality at the best price' is weak positioning because:",o:["It is too short","Every competitor says it","It mentions price","It is in English"],a:1,e:"Positioning must be specific and different. A claim everyone makes differentiates no one."},
 {c:"Conversion",d:1,q:"Above the fold on a landing page should first make clear:",o:["Your company history","What it is, who it's for and the next step","Every service you offer","Your social media links"],a:1,e:"Visitors decide in seconds. Lead with the outcome, the audience and one clear call to action."},
 {c:"Conversion",d:2,q:"An A/B test shows +40% conversions after 2 days and 12 total conversions. You should:",o:["Declare a winner","Keep running until you have enough data","Stop all ads","Copy it to every page"],a:1,e:"Twelve conversions is far too few. Early swings are often noise, wait for a meaningful sample."},
 {c:"Conversion",d:2,q:"Most enquiries come via WhatsApp but your page only has a long form. Quick win?",o:["Remove the form","Add a click-to-WhatsApp button","Add more form fields","Hide the phone number"],a:1,e:"Meet buyers where they already want to talk. Keep the form, add the channel they prefer."},
 {c:"Content",d:1,q:"The best topic list for content usually comes from:",o:["Random trending hashtags","The real questions customers ask before buying","Competitors' logos","The longest keywords"],a:1,e:"Customer questions show intent and objections. Answering them builds trust and search visibility."},
 {c:"Content",d:2,q:"'Repurposing' content means:",o:["Deleting old posts","Turning one strong piece into several formats","Copying a competitor","Posting the same image daily"],a:1,e:"One article can become a Reel, a carousel, an email and a WhatsApp message, more reach for the same thinking."},
 {c:"Social",d:1,q:"On Reels and Shorts, the most important part of the video is usually:",o:["The last 5 seconds","The first 2–3 seconds","The caption length","The number of hashtags"],a:1,e:"If the hook doesn't stop the scroll, nothing else is seen."},
 {c:"Social",d:2,q:"Which is the better signal of genuine interest on a post?",o:["Likes","Saves and shares","Impressions","Follower count"],a:1,e:"Saves and shares take effort and show the content was useful enough to keep or pass on."},
 {c:"Social",d:2,q:"Choosing an influencer for a local café, the most important check is:",o:["Total followers","Whether their audience actually lives nearby","Their camera brand","How many brands they've worked with"],a:1,e:"Reach is useless if the audience can't visit. Audience location and fit beat follower count."},
 {c:"Analytics",d:1,q:"UTM parameters on a link help you:",o:["Make the page load faster","See which campaign or source brought the visitor","Hide the link from Google","Increase CTR automatically"],a:1,e:"UTMs label traffic so analytics can attribute visits and conversions to the right source."},
 {c:"Analytics",d:2,q:"CAC stands for:",o:["Cost to acquire a customer","Clicks after conversion","Content and campaigns","Cost per ad click"],a:0,e:"Customer Acquisition Cost = total sales and marketing cost ÷ new customers acquired."},
 {c:"Analytics",d:3,q:"LTV:CAC of 3:1 roughly means:",o:["A customer is worth about three times what it cost to win them","You lose money on every customer","You need three ads per sale","Retention is 3%"],a:0,e:"A common healthy benchmark, each customer brings back about 3x their acquisition cost over their lifetime."},
 {c:"Email & WhatsApp",d:1,q:"The best time to reply to a new lead is:",o:["Within minutes","Next week","After 3 follow-up ads","Only during office hours next month"],a:0,e:"Speed to lead matters: the business that replies first is often the one that wins the sale."},
 {c:"Email & WhatsApp",d:2,q:"WhatsApp Business messages that start a conversation after 24 hours need:",o:["An approved template","A GIF","A discount code","Nothing special"],a:0,e:"Outside the 24-hour customer-service window, business-initiated WhatsApp messages must use approved templates."},
 {c:"Email & WhatsApp",d:2,q:"An abandoned-cart email works best when it:",o:["Arrives months later","Reminds the person what they left, soon, with one clear link back","Lists every product in the store","Has no button"],a:1,e:"Timely, specific and one-click back to the cart. Optional incentive only if margins allow."}
);
FODO_DATA.game.round1.push(
 {obj:"Objective: app installs that stay active",a:{n:"Campaign A",m:["Installs: 2,400","Cost/Install: ₹18","Day-7 active: 6%"]},b:{n:"Campaign B",m:["Installs: 900","Cost/Install: ₹42","Day-7 active: 38%"]},w:"b",e:"A's installs are cheap but almost nobody stays. B delivers far more active users per rupee."},
 {obj:"Objective: walk-ins to a showroom",a:{n:"Campaign A",m:["Website visits: 9,000","Direction requests: 40","Calls: 25"]},b:{n:"Campaign B",m:["Website visits: 2,100","Direction requests: 190","Calls: 70"]},w:"b",e:"Direction requests and calls are much closer to a walk-in than website visits."},
 {obj:"Objective: lowest cost per sale (same product, same price)",a:{n:"Campaign A",m:["Spend: ₹40,000","Sales: 80","Cost/Sale: ₹500"]},b:{n:"Campaign B",m:["Spend: ₹40,000","Sales: 64","Cost/Sale: ₹625"]},w:"a",e:"Same spend, same product: A simply sells more for less. The obvious answer is right."}
);
FODO_DATA.game.round3.push(
 {s:"Hypothetical: a new campaign launched yesterday; cost per lead is 40% above target after ₹2,000 spend.",o:["PAUSE","SCALE","OPTIMIZE"],a:2,e:"Far too early to judge. Let it learn, check targeting and creative, and decide on more data."},
 {s:"Hypothetical: a Google Ads campaign has a strong cost per sale, but search terms show 35% of spend on 'free' and 'jobs' searches.",o:["PAUSE","SCALE","OPTIMIZE"],a:2,e:"Add negative keywords to cut the waste first; then the good results get even better."},
 {s:"Hypothetical: a retargeting campaign's ROAS is 9x for four straight weeks, frequency is 2.1, and the audience is growing.",o:["PAUSE","SCALE","OPTIMIZE"],a:1,e:"Healthy frequency, a growing pool and consistent returns, scale in steps."}
);
FODO_DATA.game.round4.push(
 {q:"Break-even ROAS at a 50% margin?",o:["1x","2x","5x"],a:1},
 {q:"Cheapest lead source is sending junk. Judge by:",o:["Cost per lead","Cost per qualified lead","Clicks"],a:1},
 {q:"Reel gets views, no profile visits. Add:",o:["A clear reason to tap through","More filters","Longer captions"],a:0},
 {q:"Local clinic wants more calls. Fastest channel?",o:["Google Search + Business Profile","A brand film","A podcast"],a:0},
 {q:"Pixel fires twice per purchase. Effect?",o:["Inflated conversions","Lower CPM","Better ROAS, really"],a:0},
 {q:"Page loads in 9 seconds on mobile. Do first:",o:["Compress images & cut scripts","Raise ad budget","Add a pop-up"],a:0},
 {q:"Same ad, new audience, CPA halves. Next step?",o:["Scale that audience gradually","Delete the old audience instantly","Change the ad"],a:0},
 {q:"Email list never mailed in a year. First send should:",o:["Re-confirm interest","Push a big discount to all","Be sent 5 times"],a:0}
);
