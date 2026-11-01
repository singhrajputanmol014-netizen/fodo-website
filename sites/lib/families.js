/* FODO Website Builder v38, template families. Templates are NOT hand-coded one by one: each niche below is a short brief
   (real-sounding copy for that business, its pages and goal) and the generator composes it from the shared section library,
   the design-system styles/palettes and three layout variants. Adding a niche = adding one entry; adding a style = one line.
   Rules kept from v32: reviews, numbers, team members and prices stay clearly marked [placeholders], never invented. */
import { designFor } from "./industry.js";

export const FAMILY_LICENSE = { license: "FODO Original", commercial_allowed: true, client_use_allowed: true, attribution_required: false, modification_allowed: true, redistribution_allowed: false, source_url: "", verified: "2026-11-01" };

/* the category navigation (one template can be in several) */
export const CATEGORIES = [
  ["all", "All"], ["business", "Business"], ["agency", "Agency"], ["tech", "SaaS & Tech"], ["startup", "Startup"], ["restaurant", "Restaurant"], ["cafe", "Cafe & Bakery"],
  ["health", "Healthcare"], ["dental", "Dental"], ["fitness", "Fitness"], ["beauty", "Salon & Beauty"], ["realestate", "Real Estate"], ["ecommerce", "E-commerce"],
  ["fashion", "Fashion"], ["portfolio", "Portfolio"], ["photo", "Photo & Film"], ["creator", "Creator"], ["education", "Education"], ["finance", "Finance"],
  ["legal", "Legal"], ["travel", "Travel & Hotel"], ["events", "Events & Wedding"], ["nonprofit", "Nonprofit"], ["personal", "Personal"], ["local", "Local Business"],
];
const CAT_RX = { business: /consult|agency|account|law|finance|b2b|corporate|business|construction|it services/, agency: /agency|marketing|advertis|studio/, tech: /saas|software|tech|app\b|ai\b|it services|fintech/, startup: /startup|launch|fintech|ai startup/,
  restaurant: /restaurant|kitchen|dining|catering|food/, cafe: /cafe|bakery|coffee/, health: /clinic|doctor|dental|medical|health|therap|psycholog|physio|hospital|yoga/, dental: /dental|dentist/, fitness: /gym|fitness|yoga|trainer/,
  beauty: /salon|beauty|makeup|spa|skin/, realestate: /real estate|property|interior|architect|construction/, ecommerce: /store|shop|ecommerce|jewel|fashion|retail|product/, fashion: /fashion|jewel|boutique|clothing/,
  portfolio: /portfolio|photograph|designer|architect|film|video|artist|musician|personal|creative/, photo: /photograph|film|video|production/, creator: /creator|influencer|youtube|podcast|blog|musician/,
  education: /school|college|education|coaching|course|tutor|academy/, finance: /finance|account|fintech|wealth|insurance|tax/, legal: /law|legal|advocate|attorney/, travel: /travel|hotel|resort|tour|homestay/,
  events: /event|wedding|conference/, nonprofit: /ngo|nonprofit|charity|foundation|community/, personal: /personal|resume|coach|creator|freelanc|portfolio/, local: /local|shop|pet|car|repair|salon|bakery|gym|garage|laundry/ };
export const catsOf = (t) => { const k = (t.category + " " + (t.tags || []).join(" ") + " " + (t.industry || "")).toLowerCase(); return Object.keys(CAT_RX).filter((c) => CAT_RX[c].test(k)); };

/* niche briefs: [id, name, industry (for the industry engine), tags, eyebrow, headline, subtitle, cta, services page title, 4 services, 3 reasons, 2 FAQs, 3 styles, goal, extra page] */
const N = (a) => ({ id: a[0], name: a[1], industry: a[2], tags: a[3], eyebrow: a[4], h: a[5], sub: a[6], cta: a[7], svcTitle: a[8], svc: a[9], why: a[10], faq: a[11], styles: a[12], goal: a[13], extra: a[14] || "" });
const NICHES = [
  N(["marketing", "Marketing Agency", "Marketing Agency", ["agency", "marketing", "digital", "ads", "seo"], "Performance marketing", "Marketing that pays for itself.", "Ads, SEO and content planned around one number: the customers you actually win.", "Book a strategy call", "Services",
    [["Paid ads", "Google and Meta campaigns built around cost per customer, not clicks."], ["SEO", "Pages that rank for what your buyers search."], ["Content", "Posts, reels and articles with a job to do."], ["Analytics", "One dashboard that shows what is working."]],
    [["Senior team", "The people you meet are the people who do the work."], ["Clear reporting", "Monthly numbers in plain language."], ["No lock-in", "Month-to-month, because results should keep you."]],
    [["How soon will we see results?", "Ads can move in weeks; SEO usually takes three to six months."], ["Do you work with small businesses?", "Yes, we plan budgets that make sense for your size."]], ["modern", "dark", "minimal"], "Get Leads", "work"]),
  N(["creative-agency", "Creative Agency", "Advertising", ["agency", "creative", "branding", "studio", "design"], "Brand & design studio", "We build brands people remember.", "Strategy, identity and campaigns for companies that would rather be noticed than safe.", "Start a project", "What we do",
    [["Brand strategy", "Positioning, naming and the story behind the logo."], ["Identity design", "Logo, type, colour and a system that scales."], ["Campaigns", "Ideas that travel across film, print and social."], ["Websites", "Fast, beautiful sites that sell the brand."]],
    [["Ideas first", "Every project starts with a single sharp idea."], ["Craft", "Details obsessed over, from kerning to copy."], ["Partnership", "We stay after launch to make it work."]],
    [["What does a branding project include?", "Strategy, identity and guidelines, scoped together in the first call."], ["How long does it take?", "Most identities take six to ten weeks."]], ["creative", "editorial", "dark"], "Showcase Portfolio", "work"]),
  N(["film-production", "Film Production", "Filmmaker", ["film", "video", "production", "commercials", "creative"], "Film & commercial production", "Stories, shot like they matter.", "Brand films, commercials and documentaries, from the first idea to the final grade.", "Discuss your film", "Production",
    [["Brand films", "The story of your company, told with feeling."], ["Commercials", "Thirty seconds that people remember."], ["Documentaries", "Real people, real stories, beautifully shot."], ["Post-production", "Edit, grade, sound and motion graphics."]],
    [["One team", "Writers, directors and editors under one roof."], ["Cinema-grade kit", "Shot and finished to broadcast standards."], ["On schedule", "Clear timelines from script to delivery."]],
    [["Do you write the script?", "Yes, or we work from yours."], ["Can you shoot outside the city?", "Yes, we travel for production across India and abroad."]], ["dark", "editorial", "creative"], "Showcase Portfolio", "work"]),
  N(["photographer", "Photographer", "Photographer", ["photography", "photographer", "portfolio", "wedding", "portrait"], "Photographer", "Moments, kept honestly.", "Weddings, portraits and brands, photographed with patience and a quiet eye.", "Check availability", "Sessions",
    [["Weddings", "Full-day coverage, candid and calm."], ["Portraits", "Studio or outdoor sessions that feel like you."], ["Brand shoots", "Photos for websites, menus and social."], ["Albums & prints", "Hand-finished albums that last."]],
    [["Natural direction", "Gentle prompts, no stiff poses."], ["Fast delivery", "A preview gallery within days."], ["Every photo edited", "No filters, careful colour on each image."]],
    [["How far ahead should we book?", "Wedding dates fill early; three to six months is ideal."], ["Do you travel?", "Yes, travel is quoted with the session."]], ["minimal", "editorial", "dark"], "Showcase Portfolio", "work"]),
  N(["videographer", "Videographer", "Videographer", ["video", "videographer", "reels", "events", "creative"], "Video production", "Video that people watch to the end.", "Reels, events and brand videos, shot and edited for the screens your audience uses.", "Get a quote", "Services",
    [["Reels & shorts", "Vertical videos built for the first three seconds."], ["Event films", "Highlights and full coverage, delivered fast."], ["Product videos", "Show it working, simply."], ["Editing", "Your footage, cut into something watchable."]],
    [["Fast turnaround", "Highlights within days, not weeks."], ["Platform-ready", "Exports for Instagram, YouTube and ads."], ["Simple pricing", "Packages you can understand."]],
    [["Do you provide raw footage?", "Yes, on request with any package."], ["Can you edit footage we shot?", "Yes, editing-only projects are welcome."]], ["dark", "modern", "creative"], "Get Enquiries", "work"]),
  N(["restaurant-fire", "Restaurant: Open Fire", "Restaurant", ["restaurant", "dining", "food", "grill", "fine dining"], "Restaurant", "Seasonal food. Open-fire cooking.", "A short menu that changes with the market, cooked over wood and charcoal.", "Reserve a table", "Menu",
    [["Small plates", "Built for sharing across the table."], ["From the fire", "Meat, fish and vegetables cooked over wood."], ["Seasonal specials", "Whatever the market brings in this week."], ["Desserts", "Simple, made in-house every day."]],
    [["Seasonal menu", "It changes because the produce does."], ["Open kitchen", "Watch your dinner being cooked."], ["Private dining", "A room for birthdays and team dinners."]],
    [["Do you take walk-ins?", "Yes, but weekends are busy, so booking is safer."], ["Do you have vegetarian dishes?", "Yes, several, marked on the menu."]], ["luxury", "editorial", "dark"], "Accept Bookings", "reservations"]),
  N(["restaurant-family", "Family Restaurant", "Restaurant", ["restaurant", "family", "food", "north indian", "dining"], "Family restaurant", "Big tables. Bigger portions.", "Home-style North Indian food, made fresh for families who like to eat together.", "Book a table", "Menu",
    [["Tandoor", "Breads and kebabs straight from the clay oven."], ["Curries", "Slow-cooked gravies, mild to fiery."], ["Thalis", "A complete meal on one plate."], ["Takeaway", "Order ahead, pick up hot."]],
    [["Fresh every day", "Gravies and breads made from scratch."], ["Kids welcome", "Space, high chairs and a kids' menu."], ["Parties", "Group menus for birthdays and get-togethers."]],
    [["Do you deliver?", "Yes, through our phone line and delivery apps."], ["Can we book for large groups?", "Yes, call ahead for groups over ten."]], ["playful", "modern", "minimal"], "Accept Bookings", "reservations"]),
  N(["cafe", "Cafe", "Cafe", ["cafe", "coffee", "breakfast", "bakery"], "Neighbourhood cafe", "Good coffee, slow mornings.", "Specialty coffee, all-day breakfast and a corner table that's always yours.", "Find us", "Menu",
    [["Coffee", "Single-origin beans, brewed your way."], ["All-day breakfast", "Eggs, toast and pancakes until close."], ["Bakes", "Croissants and cakes from our own oven."], ["Work-friendly", "Wi-Fi, plugs and no rush."]],
    [["Roasted fresh", "Beans roasted in small batches."], ["Made here", "Everything baked on site each morning."], ["Pet friendly", "Dogs welcome on the patio."]],
    [["Do you have oat milk?", "Yes, oat and almond at no extra cost."], ["Can I work from the cafe?", "Of course, stay as long as you like."]], ["minimal", "playful", "editorial"], "Inform Customers"]),
  N(["bakery", "Bakery", "Bakery", ["bakery", "cakes", "pastry", "cafe"], "Bakery & patisserie", "Baked this morning.", "Breads, celebration cakes and pastries made by hand, in small batches, every day.", "Order a cake", "Bakes",
    [["Celebration cakes", "Designed with you, baked for your day."], ["Breads", "Sourdough and loaves with a real crust."], ["Pastries", "Croissants, tarts and cookies."], ["Eggless range", "Full flavour, no eggs."]],
    [["Real butter", "No shortcuts, no premixes."], ["Custom designs", "Cakes made to your theme."], ["Same-day slots", "Limited same-day orders every day."]],
    [["How early should I order a cake?", "Two days ahead for custom designs."], ["Do you deliver?", "Yes, within the city for a small fee."]], ["playful", "minimal", "luxury"], "Get Enquiries"]),
  N(["cloud-kitchen", "Cloud Kitchen", "Cloud Kitchen", ["cloud kitchen", "delivery", "food", "restaurant"], "Delivery kitchen", "Hot food, at your door.", "Rice bowls, wraps and biryanis cooked to order and packed so they arrive the way they left.", "Order now", "Menu",
    [["Biryanis", "Slow-cooked, sealed and delivered hot."], ["Rice bowls", "A full meal you can eat at your desk."], ["Wraps & rolls", "Quick, filling and tidy to eat."], ["Combos", "Meals for one, two or the whole office."]],
    [["Cooked to order", "Nothing sits under a heat lamp."], ["Spill-proof packing", "Sealed containers that travel well."], ["Office orders", "Bulk lunches with one invoice."]],
    [["Where do you deliver?", "Within about 6 km of our kitchen."], ["Do you take bulk orders?", "Yes, order a day ahead for groups."]], ["playful", "dark", "modern"], "Sell Products"]),
  N(["dental-advanced", "Dental Clinic: Advanced", "Dentist", ["dental", "dentist", "clinic", "healthcare", "implants"], "Dental clinic", "Advanced dental care, designed around you.", "Check-ups, implants, aligners and smile design in a calm clinic with modern equipment.", "Book appointment", "Treatments",
    [["Check-ups & cleaning", "Preventive care that keeps problems away."], ["Implants", "Permanent, natural-looking replacements."], ["Aligners & braces", "Straighter teeth, discreetly."], ["Smile design", "Whitening, veneers and bonding."]],
    [["Gentle approach", "Modern anaesthesia and no rushed visits."], ["Clear pricing", "A written estimate before treatment starts."], ["Sterilised kits", "Every instrument, every patient."]],
    [["Is treatment painful?", "We use modern anaesthesia and gentle techniques."], ["Do you treat children?", "Yes, from their first tooth."]], ["modern", "minimal", "luxury"], "Book Appointments", "book"]),
  N(["dental-family", "Dental Clinic: Family", "Dentist", ["dental", "dentist", "family", "kids", "clinic"], "Family dentist", "Healthy smiles for the whole family.", "Friendly dental care for kids, parents and grandparents, with evening and Sunday slots.", "Book a visit", "Treatments",
    [["Kids' dentistry", "Patient, playful visits for little ones."], ["Fillings & root canals", "Saving teeth, comfortably."], ["Dentures", "Comfortable fit, natural look."], ["Emergency care", "Same-day help when it hurts."]],
    [["Evening slots", "Appointments after school and work."], ["Family plans", "One check-up visit for everyone."], ["Reminders", "We remind you when check-ups are due."]],
    [["Do you accept walk-ins?", "Yes, but booking means no waiting."], ["How often should we visit?", "Every six months for a check-up and clean."]], ["playful", "corporate", "minimal"], "Book Appointments", "book"]),
  N(["doctor", "Doctor", "Doctor", ["doctor", "physician", "clinic", "healthcare", "medical"], "General physician", "Care that listens first.", "Consultations, health check-ups and long-term care for chronic conditions, with time to talk.", "Book a consultation", "Services",
    [["Consultations", "Unhurried appointments, clear next steps."], ["Health check-ups", "Annual packages for every age."], ["Chronic care", "Diabetes, BP and thyroid, managed together."], ["Online follow-ups", "Video calls for review visits."]],
    [["Time to talk", "Appointments that don't feel rushed."], ["Clear advice", "Explanations in plain language."], ["Continuity", "The same doctor at every visit."]],
    [["Do you do home visits?", "For elderly patients nearby, on request."], ["Can I consult online?", "Yes, for follow-ups and reports review."]], ["corporate", "minimal", "modern"], "Book Appointments", "book"]),
  N(["psychologist", "Psychologist", "Therapist", ["psychologist", "therapist", "counselling", "mental health", "wellness"], "Counselling & therapy", "A calm space to talk.", "Confidential therapy for anxiety, stress, relationships and life changes, in person or online.", "Book a session", "Therapy",
    [["Individual therapy", "One-to-one sessions at your pace."], ["Couples counselling", "Better conversations, together."], ["Stress & anxiety", "Practical tools that help day to day."], ["Online sessions", "Private video sessions from home."]],
    [["Confidential", "What you share stays in the room."], ["Evidence-based", "Approaches with research behind them."], ["Flexible", "Evening and online slots."]],
    [["How many sessions will I need?", "It varies; we review progress together every few weeks."], ["Is online therapy effective?", "For many people it works as well as in person."]], ["minimal", "editorial", "modern"], "Book Appointments", "book"]),
  N(["physio", "Physiotherapy", "Physiotherapy", ["physiotherapy", "physio", "rehab", "clinic", "healthcare"], "Physiotherapy clinic", "Move without pain again.", "Treatment for back pain, sports injuries and post-surgery rehab, with a plan you can follow at home.", "Book an assessment", "Treatments",
    [["Back & neck pain", "Find the cause, not just the ache."], ["Sports injuries", "Back to play, safely."], ["Post-surgery rehab", "Strength and mobility after surgery."], ["Home visits", "Sessions at home when travel is hard."]],
    [["One-to-one", "Your therapist for the whole session."], ["Home plan", "Exercises you can actually do."], ["Progress tracked", "Clear goals at every visit."]],
    [["Do I need a doctor's referral?", "No, you can book an assessment directly."], ["How long is a session?", "About 45 minutes."]], ["modern", "minimal", "corporate"], "Book Appointments", "book"]),
  N(["gym", "Gym", "Fitness", ["gym", "fitness", "training", "strength"], "Gym & strength club", "Stronger, every week.", "Strength training, conditioning and coaches who write a plan around you.", "Book a free trial", "Training",
    [["Strength floor", "Racks, platforms and free weights."], ["Personal training", "One coach, one plan, real progress."], ["Group classes", "HIIT, mobility and conditioning."], ["Nutrition", "Simple guidance that fits your life."]],
    [["Coached, not crowded", "Trainers on the floor at every hour."], ["Progress check-ins", "Monthly assessments, honest numbers."], ["Open early", "From 5 am for early starters."]],
    [["Is there a free trial?", "Yes, one free session with a coach."], ["Do you have women-only hours?", "Yes, ask us for the current timings."]], ["dark", "modern", "playful"], "Get Leads"]),
  N(["fitness-coach", "Fitness Coach", "Fitness", ["fitness", "coach", "personal trainer", "online coaching"], "Online fitness coach", "Fit, without living in the gym.", "Personal training plans, nutrition and weekly check-ins that work around a busy life.", "Apply for coaching", "Coaching",
    [["1:1 coaching", "A plan written for your body and schedule."], ["Nutrition guidance", "Indian meals, real portions."], ["Weekly check-ins", "Adjustments every week."], ["Home workouts", "Plans that need little equipment."]],
    [["Built for busy people", "Workouts that fit 40 minutes."], ["Food you like", "No crash diets."], ["Accountability", "A coach who checks in."]],
    [["Do I need a gym?", "No, home plans are available."], ["How long is the program?", "Most clients start with twelve weeks."]], ["playful", "dark", "modern"], "Get Leads"]),
  N(["yoga", "Yoga Studio", "Yoga", ["yoga", "studio", "wellness", "meditation"], "Yoga studio", "Breathe. Stretch. Begin again.", "Small classes for beginners and regulars, with teachers who know your name.", "Book a class", "Classes",
    [["Hatha", "Steady, foundational practice."], ["Vinyasa", "Flowing, breath-led sequences."], ["Prenatal", "Gentle classes for mothers-to-be."], ["Meditation", "Quiet, guided sessions."]],
    [["Small groups", "Room to be corrected."], ["Beginner friendly", "Every class has options."], ["Online too", "Live classes from home."]],
    [["I'm not flexible, can I join?", "Yes, flexibility comes from practice."], ["What should I bring?", "Water and comfortable clothes; mats are here."]], ["minimal", "editorial", "playful"], "Accept Bookings"]),
  N(["salon", "Salon", "Salon", ["salon", "hair", "beauty", "unisex"], "Hair & beauty salon", "Look like you, only better.", "Cuts, colour and care from stylists who take time to understand what you want.", "Book an appointment", "Services",
    [["Cuts & styling", "Consultation first, then the cut."], ["Colour", "Highlights, balayage and global colour."], ["Hair treatments", "Smoothing, repair and scalp care."], ["Grooming", "Beard, brows and skincare."]],
    [["Consultation first", "We listen before we cut."], ["Quality products", "Brands we trust on every client."], ["On time", "Your slot, kept."]],
    [["Do you take walk-ins?", "When we have a free chair; booking is safer."], ["How long does colour take?", "Two to three hours, depending on the service."]], ["luxury", "playful", "minimal"], "Book Appointments", "book"]),
  N(["makeup", "Makeup Artist", "Beauty", ["makeup", "bridal", "beauty", "artist"], "Bridal & party makeup", "Makeup that lasts all day.", "Bridal, engagement and party looks that photograph beautifully and still feel like you.", "Check dates", "Looks",
    [["Bridal makeup", "Trial session plus the big day."], ["Engagement & reception", "Looks for every function."], ["Party makeup", "Quick, polished, long-lasting."], ["Hair styling", "Buns, braids and blow-dries."]],
    [["Skin first", "Prep that keeps makeup in place."], ["Premium products", "Professional, long-wear brands."], ["Travel ready", "We come to your venue."]],
    [["When should I book for my wedding?", "Two to four months ahead for peak dates."], ["Do you do trials?", "Yes, a paid trial before the wedding."]], ["luxury", "playful", "editorial"], "Get Enquiries"]),
  N(["spa", "Spa", "Spa", ["spa", "massage", "wellness", "beauty"], "Day spa", "An hour that's only yours.", "Massages, facials and body therapies in a quiet space designed for slowing down.", "Book a treatment", "Treatments",
    [["Massages", "Swedish, deep tissue and aromatherapy."], ["Facials", "For every skin type."], ["Body therapies", "Scrubs, wraps and polishes."], ["Couples packages", "Side-by-side treatments."]],
    [["Certified therapists", "Trained, experienced hands."], ["Hygiene first", "Fresh linen for every guest."], ["Calm space", "Phones off, music low."]],
    [["What should I wear?", "We provide robes and disposables."], ["Can I gift a treatment?", "Yes, ask us for a gift voucher."]], ["luxury", "minimal", "glass"], "Book Appointments", "book"]),
  N(["real-estate", "Real Estate Agency", "Real Estate", ["real estate", "property", "homes", "realtor"], "Real estate", "Find the home that fits your life.", "Verified listings, honest advice and help with paperwork, from first visit to registry.", "Schedule a visit", "Properties",
    [["Buy", "Shortlisted homes that match your brief."], ["Sell", "Pricing, photos and buyers who are ready."], ["Rent", "Verified tenants and landlords."], ["Paperwork", "Agreements, loans and registry support."]],
    [["Verified listings", "We visit before we list."], ["Local knowledge", "Schools, commute and prices, explained."], ["End-to-end", "We stay until the keys change hands."]],
    [["Do you charge buyers?", "Our fees are explained before any visit."], ["Can you help with a home loan?", "Yes, we work with several lenders."]], ["corporate", "luxury", "modern"], "Get Leads"]),
  N(["property-agent", "Property Agent", "Real Estate", ["property", "agent", "realtor", "personal brand", "real estate"], "Independent property consultant", "Your property, handled personally.", "One consultant who answers the phone, knows the area and keeps you informed at every step.", "Call me", "How I help",
    [["Buying advice", "Shortlists based on your budget and commute."], ["Selling", "Right price, real buyers."], ["Rentals", "Tenant checks and agreements."], ["NRI services", "Property managed while you're away."]],
    [["Direct contact", "You deal with me, not a call centre."], ["Honest pricing", "Data, not guesswork."], ["Quick replies", "Same-day answers on WhatsApp."]],
    [["Which areas do you cover?", "[Add your areas]"], ["Do you manage rented properties?", "Yes, including rent collection and repairs."]], ["minimal", "corporate", "modern"], "Get Calls"]),
  N(["architect", "Architect", "Architecture", ["architect", "architecture", "design", "studio", "portfolio"], "Architecture studio", "Spaces shaped around how you live.", "Homes, workplaces and renovations, designed with light, proportion and budget in mind.", "Discuss your project", "Practice",
    [["Residential", "Homes designed from the plot up."], ["Commercial", "Offices and retail that work hard."], ["Renovation", "New life for existing buildings."], ["Approvals", "Drawings and permissions handled."]],
    [["Design + delivery", "We stay involved on site."], ["Budget aware", "Clear costs at every stage."], ["Sustainable", "Light, air and materials that last."]],
    [["What do your fees include?", "Design, drawings and site visits, set out in a proposal."], ["Do you take small projects?", "Yes, including single-room renovations."]], ["editorial", "minimal", "luxury"], "Showcase Portfolio", "work"]),
  N(["interior", "Interior Designer", "Interior Design", ["interior", "design", "home", "decor", "turnkey"], "Interior design", "Homes that feel finished.", "Turnkey interiors for apartments and villas: design, materials and execution handled for you.", "Book a consultation", "Services",
    [["Full-home interiors", "Concept to handover."], ["Modular kitchens", "Planned around how you cook."], ["Wardrobes & storage", "Every inch used well."], ["Styling", "Furniture, lighting and decor."]],
    [["3D before we build", "See it before you sign off."], ["Fixed timelines", "Dates written into the contract."], ["One point of contact", "A designer who sees it through."]],
    [["How long does a 2BHK take?", "Typically 45 to 60 days after design approval."], ["Do you work within a budget?", "Yes, we design to the number you set."]], ["luxury", "minimal", "editorial"], "Get Leads", "work"]),
  N(["lawyer", "Law Firm", "Legal", ["lawyer", "law", "legal", "advocate", "firm"], "Advocates & legal consultants", "Clear advice when it matters most.", "Civil, corporate and family matters handled with care, discretion and straight answers.", "Book a consultation", "Practice areas",
    [["Civil litigation", "Property, recovery and contract disputes."], ["Corporate law", "Contracts, compliance and company matters."], ["Family law", "Handled sensitively and privately."], ["Legal drafting", "Agreements, notices and wills."]],
    [["Straight answers", "What your options are, in plain words."], ["Discretion", "Your matter stays confidential."], ["Responsive", "Updates without chasing."]],
    [["Is the first consultation free?", "[Add your consultation policy]"], ["Do you appear in all courts?", "[Add the courts you practise in]"]], ["corporate", "editorial", "luxury"], "Get Enquiries"]),
  N(["ca", "Chartered Accountant", "Accounting", ["ca", "accounting", "tax", "gst", "finance"], "Chartered accountants", "Your numbers, in order.", "GST, income tax, audits and bookkeeping for businesses and individuals, done on time.", "Talk to a CA", "Services",
    [["GST filing", "Monthly and annual returns, on time."], ["Income tax", "Returns, planning and notices."], ["Audits", "Statutory and internal audits."], ["Bookkeeping", "Clean books every month."]],
    [["Deadlines met", "Reminders before every due date."], ["Clear fees", "A fixed quote before we start."], ["Digital", "Share documents online."]],
    [["Do you handle GST notices?", "Yes, replies and representation."], ["Can you work with my accounting software?", "Yes, most popular tools are supported."]], ["corporate", "minimal", "modern"], "Get Enquiries"]),
  N(["consultant", "Business Consultant", "Consulting", ["consultant", "consulting", "strategy", "advisor"], "Business consultant", "Clearer decisions, faster growth.", "Strategy, operations and growth advice for founders who want a sharp outside view.", "Book a call", "How I help",
    [["Growth strategy", "Where to focus for the next 12 months."], ["Operations", "Processes that free up your time."], ["Pricing", "Charge what you're worth."], ["Advisory", "A monthly sounding board."]],
    [["Practical", "Plans you can start next week."], ["Founder-friendly", "Built for small teams."], ["Measured", "Every plan has numbers."]],
    [["What size businesses do you work with?", "Mostly founder-led companies."], ["Do you work remotely?", "Yes, with in-person workshops when useful."]], ["corporate", "minimal", "editorial"], "Get Leads"]),
  N(["life-coach", "Coach", "Coaching", ["coach", "coaching", "life coach", "personal brand"], "Coach", "Change that sticks.", "One-to-one coaching for professionals who want clarity, confidence and a plan they'll follow.", "Book a discovery call", "Programs",
    [["1:1 coaching", "Weekly sessions, real accountability."], ["Career transitions", "Find and land the next role."], ["Leadership", "Lead with confidence."], ["Workshops", "Sessions for teams."]],
    [["Practical tools", "Exercises you'll use."], ["Accountability", "Progress reviewed every week."], ["Confidential", "A safe space to think."]],
    [["How long is a program?", "Most clients work with me for three months."], ["Is the discovery call free?", "Yes, 20 minutes, no obligation."]], ["minimal", "playful", "editorial"], "Get Leads"]),
  N(["startup", "Startup", "Startup", ["startup", "launch", "product", "tech"], "Now in early access", "The simpler way to run your day.", "One clean app for tasks, notes and plans, so your team spends less time organising work.", "Join early access", "Product",
    [["Plan", "Projects and tasks in one view."], ["Collaborate", "Comments and updates, in context."], ["Automate", "Repeat work, done for you."], ["Integrate", "Works with the tools you use."]],
    [["Fast", "Opens instantly, everywhere."], ["Simple", "Learn it in five minutes."], ["Secure", "Your data, protected."]],
    [["When does it launch?", "[Add your launch date]"], ["Is there a free plan?", "[Add your pricing]"]], ["modern", "futuristic", "minimal"], "Collect Emails"]),
  N(["saas", "SaaS Product", "SaaS", ["saas", "software", "b2b", "product", "tech"], "Software for growing teams", "Less busywork. More real work.", "Automate reports, approvals and follow-ups so your team can focus on customers.", "Start free trial", "Features",
    [["Workflows", "Automate repeat steps in clicks."], ["Dashboards", "The numbers that matter, live."], ["Integrations", "Connect your existing tools."], ["Permissions", "The right access for every role."]],
    [["Set up in a day", "Templates for common workflows."], ["Support that answers", "Real people, quick replies."], ["Secure by default", "Access controls and audit logs."]],
    [["Is there a free trial?", "[Add your trial terms]"], ["Can we import our data?", "Yes, from spreadsheets and common tools."]], ["modern", "glass", "minimal"], "Get Leads", "pricing"]),
  N(["mobile-app", "Mobile App", "Mobile App", ["app", "mobile app", "product", "tech"], "Mobile app", "Everything you need, in your pocket.", "A fast, simple app that helps you track, plan and stay on top of your day.", "Download the app", "Features",
    [["Track", "See everything at a glance."], ["Reminders", "Gentle nudges at the right time."], ["Offline", "Works without a connection."], ["Sync", "Your data on every device."]],
    [["Lightweight", "Small download, fast app."], ["Private", "Your data stays yours."], ["Free to start", "Core features free."]],
    [["Is it on Android and iPhone?", "[Add your store links]"], ["Is my data private?", "Yes, see our privacy policy."]], ["playful", "futuristic", "modern"], "Collect Emails"]),
  N(["ai-startup", "AI Startup", "AI Startup", ["ai", "artificial intelligence", "startup", "tech"], "AI for operations", "Your team, with an AI co-worker.", "Turn documents, emails and data into answers and actions, with humans in the loop.", "Request a demo", "Platform",
    [["Ask your data", "Answers from your own documents."], ["Automate tasks", "Draft, classify and route work."], ["Human review", "Approvals before anything goes out."], ["Secure deployment", "Your data never trains public models."]],
    [["Grounded answers", "Every answer cites its source."], ["Control", "Permissions and audit logs."], ["Fast setup", "Connect sources in minutes."]],
    [["Where is our data stored?", "[Add your hosting regions]"], ["Do you train on our data?", "No."]], ["futuristic", "dark", "glass"], "Get Leads"]),
  N(["fintech", "Fintech", "Finance", ["fintech", "finance", "payments", "startup"], "Fintech", "Money, made simple.", "Payments, invoices and payouts for small businesses, in one secure dashboard.", "Get started", "Product",
    [["Accept payments", "UPI, cards and netbanking."], ["Invoices", "Professional invoices in seconds."], ["Payouts", "Pay vendors in bulk."], ["Reports", "Reconciliation without spreadsheets."]],
    [["Secure", "Bank-grade security practices."], ["Transparent fees", "No hidden charges."], ["Fast settlements", "Money where it should be."]],
    [["Is my money safe?", "[Add your regulatory and banking partners]"], ["What are the fees?", "[Add your pricing]"]], ["corporate", "futuristic", "modern"], "Get Leads"]),
  N(["it-services", "IT Services", "Technology", ["it services", "software", "development", "tech", "b2b"], "Software development", "Software that works on day one.", "Web apps, mobile apps and cloud systems, built by a team that ships and supports what it builds.", "Discuss your project", "Services",
    [["Web apps", "Fast, secure and easy to use."], ["Mobile apps", "Android and iOS."], ["Cloud & DevOps", "Reliable infrastructure."], ["Support", "Maintenance after launch."]],
    [["Fixed milestones", "Clear deliverables and dates."], ["Senior engineers", "Experienced people on your code."], ["You own the code", "Full handover, always."]],
    [["Do you sign NDAs?", "Yes, before any detailed discussion."], ["Do you offer support after launch?", "Yes, monthly support plans."]], ["corporate", "dark", "modern"], "Get Leads"]),
  N(["online-store", "Online Store", "Online Store", ["store", "shop", "ecommerce", "products"], "Online store", "Things you'll actually use.", "Thoughtfully made products, shipped fast across India with easy returns.", "Shop now", "Collections",
    [["New arrivals", "Fresh drops every week."], ["Best sellers", "What everyone's buying."], ["Gift sets", "Ready to give."], ["Sale", "Limited-time offers."]],
    [["Fast shipping", "Dispatched within 48 hours."], ["Easy returns", "Hassle-free returns."], ["Secure checkout", "UPI, cards and COD."]],
    [["How long does delivery take?", "Usually 3 to 6 working days."], ["Do you offer COD?", "Yes, on most pin codes."]], ["minimal", "modern", "playful"], "Sell Products"]),
  N(["fashion", "Fashion Brand", "Fashion", ["fashion", "clothing", "boutique", "apparel", "store"], "Fashion label", "Made to be worn, often.", "Everyday clothing in honest fabrics, cut to fit and designed to last more than a season.", "Shop the collection", "Collections",
    [["Women", "Dresses, co-ords and essentials."], ["Men", "Shirts, kurtas and basics."], ["Occasion", "Festive and wedding edits."], ["Accessories", "Bags, scarves and jewellery."]],
    [["Honest fabrics", "Cotton, linen and blends that breathe."], ["True to size", "Size guides that work."], ["Small batches", "Less waste, more care."]],
    [["How do I find my size?", "Each product has a size chart."], ["Can I exchange?", "Yes, within seven days of delivery."]], ["editorial", "luxury", "minimal"], "Sell Products"]),
  N(["jewellery", "Jewellery", "Jewelry", ["jewellery", "jewelry", "gold", "diamond", "store"], "Fine jewellery", "Pieces for the moments that matter.", "Gold, diamond and silver jewellery, certified and crafted for every day and every occasion.", "Explore collections", "Collections",
    [["Bridal", "Sets for the big day."], ["Everyday gold", "Light pieces for daily wear."], ["Diamonds", "Certified stones."], ["Custom design", "Made to your idea."]],
    [["Certified", "Hallmarked gold, certified diamonds."], ["Lifetime exchange", "[Add your exchange policy]"], ["Insured shipping", "Delivered safely."]],
    [["Is your gold hallmarked?", "[Add your certification details]"], ["Can I customise a design?", "Yes, book a design consultation."]], ["luxury", "editorial", "minimal"], "Sell Products"]),
  N(["beauty-brand", "Skincare Brand", "Beauty", ["skincare", "beauty", "cosmetics", "store"], "Skincare", "Skincare that does what it says.", "Simple routines with ingredients you can read, made for Indian weather and skin.", "Shop skincare", "Products",
    [["Cleansers", "Gentle, everyday cleansing."], ["Serums", "Targeted care for your concern."], ["Moisturisers", "Light textures for humid days."], ["Sunscreen", "Daily protection, no white cast."]],
    [["Clear labels", "Every ingredient listed."], ["Dermatologist reviewed", "[Add only if true]"], ["Cruelty free", "[Add only if certified]"]],
    [["Which products suit my skin?", "Take our routine guide or ask us on WhatsApp."], ["Are products tested?", "[Add your testing details]"]], ["minimal", "playful", "luxury"], "Sell Products"]),
  N(["portfolio-designer", "Designer Portfolio", "Designer", ["portfolio", "designer", "ui ux", "personal"], "Product designer", "I design products people enjoy using.", "UX and interface design for startups, from early research to polished, shipped screens.", "Get in touch", "Work",
    [["UX research", "Understand users before designing."], ["UI design", "Clean, accessible interfaces."], ["Design systems", "Components that scale."], ["Prototyping", "Test ideas before building."]],
    [["Outcome-focused", "Design tied to product goals."], ["Collaborative", "Works closely with engineers."], ["Detail-minded", "Polish in every state."]],
    [["Are you available for freelance?", "[Add your availability]"], ["Do you work remotely?", "Yes, across time zones."]], ["minimal", "creative", "editorial"], "Showcase Portfolio", "work"]),
  N(["filmmaker", "Filmmaker Portfolio", "Filmmaker", ["filmmaker", "director", "portfolio", "film"], "Director / Filmmaker", "Director. Filmmaker. Visual storyteller.", "Short films, music videos and brand stories made with a strong point of view.", "Work with me", "Films",
    [["Brand stories", "Films that feel human."], ["Music videos", "Visual worlds for sound."], ["Short films", "Personal, festival-driven work."], ["Direction", "From script to final cut."]],
    [["Point of view", "Every frame has intent."], ["Small crews", "Agile, intimate productions."], ["End-to-end", "Writing, directing and editing."]],
    [["Where are you based?", "[Add your city]"], ["Do you take commissions?", "Yes, for projects with a story to tell."]], ["dark", "editorial", "creative"], "Showcase Portfolio", "work"]),
  N(["influencer", "Influencer", "Influencer", ["influencer", "creator", "personal brand", "collaborations"], "Creator", "Stories that start conversations.", "Lifestyle and travel content for a community that trusts real recommendations.", "Collaborate", "Collaborations",
    [["Brand campaigns", "Content made for your audience."], ["Reels", "Short videos that travel."], ["Events", "Appearances and hosting."], ["UGC", "Content for your own channels."]],
    [["Real community", "Engaged followers, not bought ones."], ["Honest reviews", "Only products I believe in."], ["Professional", "Briefs, deadlines and reports."]],
    [["What are your rates?", "Ask for the media kit."], ["Which niches do you cover?", "[Add your niches]"]], ["playful", "creative", "dark"], "Get Enquiries"]),
  N(["youtuber", "YouTuber", "Creator", ["youtuber", "creator", "youtube", "channel"], "YouTube creator", "New videos every week.", "Honest reviews, tutorials and behind-the-scenes, for people who like to learn by watching.", "Watch the latest", "Videos",
    [["Reviews", "Tested properly before talking about it."], ["Tutorials", "Step by step, no fluff."], ["Vlogs", "Behind the camera."], ["Sponsorships", "Partnerships that fit the channel."]],
    [["Weekly uploads", "A new video every week."], ["Community first", "Answers to your comments."], ["Transparent", "Sponsored content is always labelled."]],
    [["How can brands work with you?", "Use the contact form with your brief."], ["What gear do you use?", "[Add your gear list]"]], ["dark", "playful", "creative"], "Build Brand"]),
  N(["musician", "Musician", "Musician", ["musician", "singer", "band", "artist"], "Musician", "Live music, made for rooms full of people.", "Original songs, covers and live sets for weddings, events and venues.", "Book a show", "Music",
    [["Live shows", "Sets for venues and festivals."], ["Weddings & events", "Sangeet, receptions and parties."], ["Original music", "Listen on all platforms."], ["Collaborations", "Features and sessions."]],
    [["Full band or solo", "Formats for every venue."], ["Own sound system", "[Add only if true]"], ["Custom setlists", "Songs chosen with you."]],
    [["How long is a set?", "Usually 90 minutes, with breaks."], ["Do you travel?", "Yes, travel is quoted separately."]], ["dark", "creative", "editorial"], "Get Enquiries"]),
  N(["events", "Event Company", "Event", ["event", "events", "conference", "corporate events"], "Event management", "Events people talk about after.", "Conferences, launches and celebrations, planned and run so you can enjoy the day.", "Plan an event", "Services",
    [["Corporate events", "Conferences, offsites and launches."], ["Social events", "Birthdays and anniversaries."], ["Production", "Stage, sound and lights."], ["Vendors", "Venues, catering and decor."]],
    [["One planner", "A single point of contact."], ["On budget", "Costs agreed upfront."], ["Run on the day", "We manage every detail."]],
    [["How early should we book?", "Two to three months for large events."], ["Do you work outside the city?", "Yes, across India."]], ["modern", "dark", "playful"], "Get Enquiries"]),
  N(["wedding", "Wedding Planner", "Wedding", ["wedding", "planner", "events", "decor"], "Wedding planning", "Your wedding, without the stress.", "Planning, decor and coordination for weddings that feel personal from the first ritual to the last dance.", "Plan your wedding", "Services",
    [["Full planning", "From venue to vidaai."], ["Decor & design", "Themes, florals and lighting."], ["Destination weddings", "Travel, stay and logistics."], ["Day-of coordination", "We run it, you enjoy it."]],
    [["Personal", "Every wedding designed from scratch."], ["Trusted vendors", "Partners we've worked with before."], ["Calm", "A plan for every surprise."]],
    [["When should we start planning?", "Six to nine months ahead is ideal."], ["Do you plan destination weddings?", "Yes, in India and abroad."]], ["luxury", "editorial", "playful"], "Get Enquiries"]),
  N(["hotel", "Boutique Hotel", "Hotel", ["hotel", "stay", "boutique", "rooms", "hospitality"], "Boutique hotel", "Stay somewhere that feels like a story.", "Thoughtfully designed rooms, slow breakfasts and a team that remembers how you take your tea.", "Check availability", "Rooms",
    [["Deluxe rooms", "Quiet, light and comfortable."], ["Suites", "Space to spread out."], ["Dining", "Local food, made fresh."], ["Experiences", "Walks, tastings and day trips."]],
    [["Best rate direct", "[Add only if true]"], ["Flexible check-in", "On request."], ["Local hosts", "Tips only locals know."]],
    [["What time is check-in?", "[Add check-in and check-out times]"], ["Is breakfast included?", "[Add your breakfast policy]"]], ["luxury", "editorial", "minimal"], "Accept Bookings"]),
  N(["homestay", "Homestay", "Resort", ["homestay", "stay", "travel", "mountains", "hospitality"], "Homestay in the hills", "Mountain mornings, home-cooked food.", "A family-run homestay with warm rooms, valley views and meals cooked the local way.", "Book your stay", "Rooms",
    [["Valley-view rooms", "Wake up to the mountains."], ["Home-cooked meals", "Local recipes, fresh produce."], ["Treks & walks", "Guided by our family."], ["Workations", "Wi-Fi and quiet corners."]],
    [["Family run", "Hosts who live here."], ["Peaceful", "Away from traffic and crowds."], ["Pet friendly", "[Add your pet policy]"]],
    [["How do we reach you?", "[Add travel directions]"], ["Is there power backup?", "[Add details]"]], ["minimal", "editorial", "playful"], "Accept Bookings"]),
  N(["travel", "Travel Agency", "Travel Agency", ["travel", "tours", "holidays", "agency"], "Holidays & tours", "Trips planned around you.", "Holiday packages, honeymoons and group tours with flights, stays and visas handled end to end.", "Plan my trip", "Packages",
    [["Holiday packages", "Domestic and international."], ["Honeymoons", "Romantic, relaxed, sorted."], ["Group tours", "Families, friends and offices."], ["Visas", "Paperwork made simple."]],
    [["Tailor-made", "No copy-paste itineraries."], ["24/7 on trip", "Support while you travel."], ["Clear pricing", "What's included, in writing."]],
    [["Can you customise a package?", "Yes, every package can be changed."], ["Do you help with visas?", "Yes, for most destinations."]], ["modern", "playful", "luxury"], "Get Leads"]),
  N(["school", "School", "School", ["school", "education", "kids", "admissions"], "School", "Curious minds, kind hearts.", "A school where children learn by asking, building and exploring, with teachers who know each child.", "Admissions enquiry", "Academics",
    [["Early years", "Play-based learning."], ["Primary", "Strong foundations, curious learners."], ["Activities", "Sports, music and arts."], ["Transport", "Safe, tracked school buses."]],
    [["Small classes", "Attention for every child."], ["Safe campus", "CCTV and trained staff."], ["Parent partnership", "Regular updates and meetings."]],
    [["When do admissions open?", "[Add your admission dates]"], ["What is the curriculum?", "[Add your board/curriculum]"]], ["playful", "corporate", "modern"], "Get Enquiries"]),
  N(["coaching-institute", "Coaching Institute", "Coaching", ["coaching", "classes", "exam prep", "education"], "Coaching institute", "Prepared, not stressed.", "Small batches, regular tests and teachers who explain until it clicks, for school and entrance exams.", "Book a demo class", "Courses",
    [["School classes", "Grades 6 to 12."], ["Entrance prep", "Structured test series."], ["Doubt sessions", "Every week, in small groups."], ["Online batches", "Live classes from home."]],
    [["Small batches", "Every student is noticed."], ["Regular tests", "Know where you stand."], ["Parent updates", "Progress shared monthly."]],
    [["Is there a demo class?", "Yes, attend one before joining."], ["What are the batch timings?", "[Add your timings]"]], ["modern", "playful", "corporate"], "Get Leads"]),
  N(["online-course", "Online Course", "Online Course", ["course", "online course", "education", "creator"], "Online course", "Learn a skill that pays.", "A practical, self-paced course with projects, feedback and a community to learn alongside.", "Enrol now", "Curriculum",
    [["Video lessons", "Short, focused and practical."], ["Projects", "Build real work for your portfolio."], ["Feedback", "Reviews on your assignments."], ["Community", "Learn with others."]],
    [["Learn at your pace", "Lifetime access."], ["Practical", "Projects over theory."], ["Certificate", "On completion."]],
    [["How long is the course?", "[Add duration]"], ["Is there a refund policy?", "[Add your refund policy]"]], ["modern", "playful", "dark"], "Sell Courses", "pricing"]),
  N(["college", "College", "College", ["college", "university", "education", "admissions"], "College", "Education that opens doors.", "Undergraduate and postgraduate programs with industry projects, placements support and a lively campus.", "Apply now", "Programs",
    [["Undergraduate", "Degree programs across disciplines."], ["Postgraduate", "Advanced, industry-linked study."], ["Placements", "Training and recruiter connections."], ["Campus life", "Clubs, sports and events."]],
    [["Industry projects", "Learn on real problems."], ["Mentors", "Faculty who guide you."], ["Scholarships", "[Add scholarship details]"]],
    [["What is the admission process?", "[Add your process]"], ["Is hostel accommodation available?", "[Add hostel details]"]], ["corporate", "modern", "editorial"], "Get Leads"]),
  N(["ngo", "NGO", "Nonprofit", ["ngo", "nonprofit", "charity", "foundation"], "Nonprofit", "Small help, real change.", "Education and health programs for families who need them, run by volunteers and funded by people like you.", "Donate now", "Programs",
    [["Education", "Learning support for children."], ["Health camps", "Free check-ups in villages."], ["Women's livelihoods", "Skills and income."], ["Volunteering", "Give your time and skills."]],
    [["Transparent", "Reports published every year."], ["Local teams", "People who know the communities."], ["Tax benefits", "[Add 80G details only if registered]"]],
    [["Is my donation tax-deductible?", "[Add 80G details only if registered]"], ["How can I volunteer?", "Fill the form and we'll call you."]], ["minimal", "editorial", "playful"], "Get Enquiries"]),
  N(["local-shop", "Local Shop", "Local Business", ["local business", "shop", "store", "neighbourhood"], "Neighbourhood store", "Everything you need, around the corner.", "Daily essentials, fresh stock and home delivery, from a shop that knows its regulars.", "Order on WhatsApp", "What we stock",
    [["Groceries", "Daily essentials, fair prices."], ["Fresh produce", "Fruits and vegetables every morning."], ["Home delivery", "Order by phone or WhatsApp."], ["Monthly lists", "Your regular order, delivered."]],
    [["Fair prices", "Same price as the bill."], ["Quick delivery", "Within the hour nearby."], ["Familiar faces", "Service with a smile."]],
    [["What are your timings?", "[Add your timings]"], ["Is there a minimum order?", "[Add delivery terms]"]], ["playful", "minimal", "modern"], "Get WhatsApp Messages"]),
  N(["car-service", "Car Service", "Automotive", ["car", "garage", "automotive", "service", "local business"], "Car service & repair", "Your car, serviced honestly.", "Periodic service, repairs and detailing with photos of every part we replace.", "Book a service", "Services",
    [["Periodic service", "As per your car's schedule."], ["Repairs", "Diagnosis before we fix."], ["Detailing", "Inside and out."], ["Pick-up & drop", "We collect, you relax."]],
    [["Photo proof", "See what we changed."], ["Genuine parts", "[Add your parts policy]"], ["Upfront estimate", "Approve before work starts."]],
    [["How long does a service take?", "Usually same day."], ["Do you pick up the car?", "Yes, within the city."]], ["dark", "corporate", "modern"], "Book Appointments", "book"]),
  N(["pet-care", "Pet Care", "Local Business", ["pet", "grooming", "pet care", "local business"], "Pet grooming & care", "Happy pets, clean coats.", "Grooming, boarding and daycare from people who treat your pet like family.", "Book grooming", "Services",
    [["Grooming", "Bath, trim and nails."], ["Daycare", "Play and rest while you work."], ["Boarding", "Safe stays when you travel."], ["Pick-up", "We collect and drop."]],
    [["Gentle handling", "Calm, patient groomers."], ["Clean space", "Sanitised after every pet."], ["Updates", "Photos while they're with us."]],
    [["Which breeds do you groom?", "All dog and cat breeds."], ["Do you need vaccination records?", "Yes, for daycare and boarding."]], ["playful", "minimal", "modern"], "Book Appointments", "book"]),
  N(["personal-brand", "Personal Brand", "Freelancer", ["personal brand", "freelancer", "resume", "portfolio", "personal"], "Freelance writer & strategist", "Words that make people act.", "Website copy, content strategy and brand messaging for companies that want to sound like themselves.", "Hire me", "Services",
    [["Website copy", "Pages that explain and sell."], ["Content strategy", "What to write, and why."], ["Brand messaging", "Your voice, defined."], ["Editing", "Sharper, clearer drafts."]],
    [["Research first", "Understand before writing."], ["On deadline", "Delivered when promised."], ["Measurable", "Copy tied to goals."]],
    [["What are your rates?", "[Add your rates or 'on request']"], ["How do projects start?", "A short call, then a written brief."]], ["editorial", "minimal", "creative"], "Get Enquiries"]),
  N(["conference", "Conference", "Event", ["conference", "event", "summit", "tickets"], "Annual summit", "Two days. The people shaping what's next.", "Talks, workshops and conversations with operators and builders, in one room.", "Get tickets", "Agenda",
    [["Keynotes", "Ideas from people doing the work."], ["Workshops", "Hands-on sessions in small groups."], ["Networking", "Meet the right people."], ["Expo", "Products to try."]],
    [["Curated", "A focused lineup."], ["Practical", "Take-home lessons."], ["Community", "Conversations that continue."]],
    [["Where is it held?", "[Add venue]"], ["Are tickets refundable?", "[Add refund policy]"]], ["dark", "futuristic", "modern"], "Get Leads"]),
];

/* three layouts: same content, different composition (so a family is really three different websites) */
const S = (type, props) => ({ type, props: props || {} });
const PH = { quote: "[Add a real customer review]", name: "[Customer name]", role: "" };
const icons = ["✦", "◆", "●", "▲", "■", "★"];
function compose(n, style, layout) {
  const cta = { label: n.cta, href: n.extra === "book" ? "book/" : n.extra === "reservations" ? "reservations/" : "contact/" };
  const nav = S("navbar", { cta }), foot = S("footer", { text: "" });
  const svc = S("services", { title: n.svcTitle, items: n.svc.map((x, i) => ({ title: x[0], text: x[1], icon: icons[i] })) });
  const why = S("features", { title: "Why people choose us", items: n.why.map((x, i) => ({ title: x[0], text: x[1], icon: icons[i + 3] })) });
  const faq = S("faq", { title: "Questions", items: n.faq.map((x) => ({ q: x[0], a: x[1] })) });
  const reviews = S("testimonials", { title: "What clients say", items: [PH, PH, PH] });
  const close = S("cta", { title: n.cta + "?", text: "It takes a minute, and we reply quickly.", button: cta });
  const heroBg = layout === "a" ? "gradient" : layout === "b" ? "theme" : "dark";
  const hero = S("hero", { eyebrow: n.eyebrow, title: n.h, subtitle: n.sub, cta, cta2: { label: n.svcTitle, href: "services/" }, align: layout === "b" ? "center" : "left", bg: heroBg });
  const portfolio = /work/.test(n.extra) ? S("portfolio", { title: "Selected work", items: [{ title: "[Project name]", category: "", text: "[What you did and the result]" }, { title: "[Project name]", category: "", text: "[What you did and the result]" }, { title: "[Project name]", category: "", text: "[What you did and the result]" }] }) : null;
  const process = S("process", { title: "How it works", items: [{ title: "Get in touch", text: "Call, WhatsApp or send the form." }, { title: "We plan", text: "A clear plan and price." }, { title: "It's done", text: "Delivered, on time." }] });
  const stats = S("stats", { title: "", items: [{ value: "[Add]", label: "years experience" }, { value: "[Add]", label: "happy clients" }, { value: "[Add]", label: "projects" }] });
  const homeSecs = layout === "a" ? [hero, svc, why, portfolio, reviews, faq, close]
    : layout === "b" ? [hero, why, svc, stats, portfolio, reviews, close]
    : [hero, S("about", { title: "About us", text: n.sub, points: n.why.map((x) => x[0]) }), portfolio, svc, process, faq, close];
  const pages = [{ slug: "home", title: "Home", sections: [nav].concat(homeSecs.filter(Boolean)).concat([foot]) },
    { slug: "services", title: n.svcTitle, sections: [nav, svc, process, faq, close, foot] },
    { slug: "about", title: "About", sections: [nav, S("about", { title: "About us", text: n.sub, points: n.why.map((x) => x[0]) }), S("team", { title: "The team", items: [{ name: "[Team member name]", role: "[Role]" }] }), foot] }];
  if (n.extra === "work") pages.splice(1, 0, { slug: "work", title: "Work", sections: [nav, portfolio, close, foot] });
  if (n.extra === "pricing") pages.splice(2, 0, { slug: "pricing", title: "Pricing", sections: [nav, S("pricing", { title: "Plans", items: [{ name: "Starter", price: "[Add price]", period: "", features: [n.svc[0][0], n.svc[1][0]], cta }, { name: "Growth", price: "[Add price]", period: "", features: n.svc.slice(0, 3).map((x) => x[0]), featured: true, cta }, { name: "Scale", price: "[Add price]", period: "", features: n.svc.map((x) => x[0]), cta }] }), faq, foot] });
  if (n.extra === "book" || n.extra === "reservations") pages.push({ slug: n.extra, title: n.extra === "book" ? "Book" : "Reservations", sections: [nav, S("booking", { title: n.cta, text: "Pick a date and time, we'll confirm by phone or WhatsApp.", services: n.svc.map((x) => x[0]), button: "Request booking", hours: [] }), S("hours", { title: "Opening hours", items: [{ day: "Monday – Saturday", time: "[Add timings]" }, { day: "Sunday", time: "[Add timings]" }] }), foot] });
  pages.push({ slug: "contact", title: "Contact", sections: [nav, S("contact", { title: "Get in touch", text: "Tell us what you need, we reply within one working day.", button: "Send message", fields: ["name", "email", "phone", "message"] }), S("map", { address: "" }), foot] });
  return pages;
}
/* palettes chosen per style so that the three versions of a niche never look alike */
const PALETTE_FOR = { minimal: ["blue-white", "forest", "teal-soft"], luxury: ["charcoal-gold", "cream-burgundy", "beige-brown"], modern: ["midnight-purple", "navy-cyan", "teal-soft"], corporate: ["navy-cyan", "blue-white", "forest"],
  creative: ["purple-pink", "orange-black", "black-lime"], playful: ["orange-black", "purple-pink", "teal-soft"], dark: ["midnight-purple", "black-lime", "mono-red"], editorial: ["cream-burgundy", "mono-red", "beige-brown"],
  glass: ["navy-cyan", "midnight-purple", "purple-pink"], futuristic: ["black-lime", "midnight-purple", "navy-cyan"] };
const FEATURED = new Set(["restaurant-fire-luxury", "dental-advanced-modern", "creative-agency-creative", "saas-modern", "photographer-minimal", "ai-startup-futuristic", "hotel-luxury", "fashion-editorial", "gym-dark", "interior-luxury"]);
const STYLE_NAME = { minimal: "Minimal", luxury: "Luxury", modern: "Modern", corporate: "Corporate", creative: "Creative", playful: "Playful", dark: "Dark", editorial: "Editorial", glass: "Glass", futuristic: "Futuristic" };

let CACHE = null;
export function familyTemplates() {
  if (CACHE) return CACHE;
  const out = [];
  NICHES.forEach((n, ni) => n.styles.forEach((style, k) => {
    const pal = PALETTE_FOR[style][(ni + k) % 3], t0 = designFor({ profile: "local", style, palette: pal });
    const theme = Object.assign({}, t0, { style }), layout = ["a", "b", "c"][k];
    const id = n.id + "-" + style;
    out.push({ id, name: n.name + ": " + STYLE_NAME[style], category: n.name.split(":")[0], industry: n.industry, tags: n.tags.concat([style, theme.mode]), theme, pages: compose(n, style, layout),
      license: FAMILY_LICENSE, responsive: true, tech: ["HTML", "CSS"], features: ["contact form", "SEO", "mobile menu", "analytics"],
      family: n.id, layout, goal: n.goal, featured: FEATURED.has(id), created: "2026-11-01" });
  }));
  CACHE = out; return out;
}
export const NICHE_COUNT = NICHES.length;
