/* FODO Website Builder, industry intelligence (v32). What works for each kind of business: which pages it needs (sitemap),
   which sections each page has, the right call-to-action, colours, fonts and motion. Used by the onboarding (sitemap you can
   edit before generating), by the server (builds the website from the plan, then the AI writes the copy) and by the audit.
   Rules: every page has a purpose; no fake reviews, numbers, logos or credentials, those stay clearly marked placeholders. */
import { applyStyle, applyPalette, applyPairing, STYLES } from "./design.js";

/* ---------- searchable industry list (grouped) → profile ---------- */
const G = (group, items) => items.map((x) => (Array.isArray(x) ? { name: x[0], profile: x[1], group, syn: x[2] || "" } : { name: x, profile: null, group, syn: "" }));
export const INDUSTRIES = [].concat(
  G("Business", [["Consulting", "professional", "consultant advisor coach strategy"], ["Marketing Agency", "agency", "digital marketing seo ads social media"], ["Advertising", "agency", "ads branding creative"], ["Finance", "professional", "investment wealth insurance loans"], ["Accounting", "professional", "ca chartered accountant tax gst audit bookkeeping"], ["Legal", "professional", "lawyer advocate law firm attorney"], ["Real Estate", "realestate", "property builder broker realtor homes flats"], ["Construction", "industrial", "builder contractor civil renovation"], ["Manufacturing", "industrial", "factory plant industrial products"], ["B2B", "industrial", "wholesale supplier distributor"], ["Technology", "tech", "it software web development app"]]),
  G("Health", [["Doctor", "medical", "physician general practitioner"], ["Dentist", "dental", "dental clinic teeth orthodontist"], ["Psychiatrist", "medical", "mental health"], ["Therapist", "wellness", "counselling counselor psychologist mental wellness"], ["Hospital", "medical", "multispeciality"], ["Clinic", "medical", "health clinic"], ["Physiotherapy", "medical", "physio rehab"], ["Dermatology", "medical", "skin dermatologist"], ["Fitness", "fitness", "gym trainer crossfit"], ["Yoga", "wellness", "meditation pilates"], ["Wellness", "wellness", "ayurveda holistic"], ["Spa", "salon", "massage spa"], ["Massage", "salon", ""], ["Salon", "salon", "beauty parlour hair makeup nails"]]),
  G("Food", [["Restaurant", "restaurant", "dining dhaba fine dining"], ["Cafe", "cafe", "coffee tea"], ["Bakery", "cafe", "cakes pastry"], ["Cloud Kitchen", "restaurant", "delivery food"], ["Catering", "restaurant", "caterer events food"], ["Food Brand", "ecommerce", "packaged food snacks pickles"]]),
  G("Creative", [["Photographer", "creative", "photography wedding photographer"], ["Videographer", "creative", "video production"], ["Filmmaker", "creative", "films"], ["Designer", "creative", "graphic designer ui ux"], ["Artist", "personal", "painter illustrator"], ["Musician", "personal", "singer band music"], ["Influencer", "personal", "creator youtuber"], ["Creator", "personal", "content creator"], ["Podcast", "personal", "podcaster"], ["Portfolio", "personal", "resume cv"], ["Architecture", "creative", "architect"], ["Interior Design", "creative", "interiors decor"]]),
  G("Education", [["School", "education", "kids preschool"], ["College", "education", "university institute"], ["Coaching", "education", "coaching centre classes tuition"], ["Tutor", "education", "tuition teacher"], ["Online Course", "education", "course creator elearning"], ["EdTech", "tech", "learning platform"]]),
  G("Retail", [["Fashion", "ecommerce", "clothing boutique apparel"], ["Jewelry", "ecommerce", "jewellery gold diamond"], ["Electronics", "ecommerce", "mobile gadgets"], ["Furniture", "ecommerce", "home decor furniture"], ["Beauty", "ecommerce", "cosmetics skincare"], ["Lifestyle", "ecommerce", "gifts lifestyle products"], ["Online Store", "ecommerce", "shop ecommerce store sell products"]]),
  G("Hospitality", [["Hotel", "hospitality", "resort homestay stay rooms"], ["Resort", "hospitality", ""], ["Travel Agency", "hospitality", "tours holidays packages visa"], ["Tour Operator", "hospitality", "tours"]]),
  G("Technology", [["SaaS", "tech", "software as a service app"], ["AI Startup", "ai", "artificial intelligence ml"], ["Startup", "tech", "startup launch"], ["Mobile App", "tech", "app"]]),
  G("Community", [["Nonprofit", "nonprofit", "ngo charity foundation trust"], ["Church / Community", "nonprofit", "temple community religious"], ["Event", "events", "conference meetup"], ["Wedding", "events", "wedding planner"], ["Blog", "blog", "blogger writer"], ["Local Business", "local", "shop service local"], ["Automotive", "local", "car garage service workshop car rental taxi"], ["Freelancer", "personal", "freelance"], ["Coming Soon", "coming", "launching soon"], ["Landing Page", "landing", "single page campaign"]]),
);
export function findIndustry(q) {
  q = String(q || "").toLowerCase().trim(); if (!q) return null;
  let best = null, score = 0;
  for (const it of INDUSTRIES) { const hay = (it.name + " " + it.syn).toLowerCase(); let sc = hay === q ? 100 : it.name.toLowerCase() === q ? 90 : 0;
    q.split(/[\s,/]+/).filter((w) => w.length > 2).forEach((w) => { if (new RegExp("\\b" + w.replace(/[^a-z0-9]/g, "")).test(hay)) sc += w.length; });
    if (sc > score) { score = sc; best = it; } }
  return score ? best : null;
}
export const SITE_TYPES = ["Business", "Portfolio", "Agency", "Restaurant", "Ecommerce", "Personal", "Blog", "Startup", "SaaS", "Landing Page", "Event", "Community", "Nonprofit", "Education", "Other"];
const TYPE_PROFILE = { Business: "local", Portfolio: "personal", Agency: "agency", Restaurant: "restaurant", Ecommerce: "ecommerce", Personal: "personal", Blog: "blog", Startup: "tech", SaaS: "tech", "Landing Page": "landing", Event: "events", Community: "nonprofit", Nonprofit: "nonprofit", Education: "education", Other: "local" };
export const GOALS = ["Get Leads", "Get Calls", "Get WhatsApp Messages", "Book Appointments", "Sell Products", "Showcase Portfolio", "Build Brand", "Get Enquiries", "Collect Emails", "Promote Services", "Sell Courses", "Accept Bookings", "Inform Customers"];

/* ---------- profiles: sitemap + CTA + design language + motion + what to prioritise ---------- */
const pg = (slug, title, purpose, sections) => ({ slug, title, purpose, sections });
export const PROFILES = {
  dental: { cta: "Book Appointment", style: "modern", palette: "teal-soft", pairing: "clean-modern", motion: "subtle", schema: "Dentist", priorities: ["Treatments", "Doctors", "Appointment", "Reviews", "Location", "FAQ"],
    pages: [pg("home", "Home", "Show care + get appointments", ["hero", "services", "process", "testimonials", "faq", "cta"]), pg("treatments", "Treatments", "Explain treatments", ["services", "pricing", "faq", "cta"]), pg("doctors", "Doctors", "Build trust in the team", ["team", "about"]), pg("about", "About", "Clinic story + values", ["about", "stats"]), pg("book", "Book Appointment", "Convert", ["booking", "hours"]), pg("contact", "Contact", "Reach + location", ["contact", "map", "hours"])] },
  medical: { cta: "Book Appointment", style: "corporate", palette: "teal-soft", pairing: "clean-modern", motion: "subtle", schema: "MedicalClinic", priorities: ["Services", "Doctor", "Appointment", "Timings", "Location"],
    pages: [pg("home", "Home", "Trust + appointments", ["hero", "services", "about", "faq", "cta"]), pg("services", "Services", "Explain care", ["services", "process", "cta"]), pg("doctors", "Doctors", "Credentials (real only)", ["team"]), pg("book", "Book Appointment", "Convert", ["booking", "hours"]), pg("contact", "Contact", "Reach + location", ["contact", "map", "hours"])] },
  restaurant: { cta: "Reserve a Table", style: "luxury", palette: "cream-burgundy", pairing: "classic-editorial", motion: "modern", schema: "Restaurant", priorities: ["Menu", "Reservation", "Location", "Reviews", "Gallery", "Opening hours"],
    pages: [pg("home", "Home", "Appetite + reservations", ["hero", "features", "gallery", "testimonials", "hours", "cta"]), pg("menu", "Menu", "What we serve", ["services", "text"]), pg("about", "About", "Our story", ["about", "team"]), pg("gallery", "Gallery", "Food & ambience", ["gallery"]), pg("reservations", "Reservations", "Convert", ["booking"]), pg("location", "Location", "Find us", ["map", "hours", "contact"])] },
  cafe: { cta: "See the Menu", style: "playful", palette: "beige-brown", pairing: "warm-lora", motion: "modern", schema: "CafeOrCoffeeShop", priorities: ["Menu", "Location", "Hours", "Gallery"],
    pages: [pg("home", "Home", "Vibe + visit", ["hero", "features", "gallery", "hours", "cta"]), pg("menu", "Menu", "What we serve", ["services"]), pg("about", "About", "Story", ["about"]), pg("contact", "Visit us", "Find us", ["contact", "map", "hours"])] },
  agency: { cta: "Start a Project", style: "creative", palette: "midnight-purple", pairing: "creative-syne", motion: "dynamic", schema: "ProfessionalService", priorities: ["Services", "Work", "Case studies", "Process", "Testimonials"],
    pages: [pg("home", "Home", "Positioning + projects", ["hero", "logos", "services", "portfolio", "process", "testimonials", "cta"]), pg("services", "Services", "What we do", ["services", "process", "faq", "cta"]), pg("work", "Work", "Proof", ["portfolio", "cta"]), pg("about", "About", "Team + values", ["about", "team", "stats"]), pg("contact", "Contact", "Convert", ["contact"])] },
  professional: { cta: "Book a Consultation", style: "corporate", palette: "navy-cyan", pairing: "corporate-plex", motion: "subtle", schema: "ProfessionalService", priorities: ["Services", "Credentials", "Team", "Consultation", "FAQ"],
    pages: [pg("home", "Home", "Trust + consultations", ["hero", "services", "process", "faq", "cta"]), pg("services", "Services", "Practice areas", ["services", "cta"]), pg("about", "About", "Firm + credentials (real only)", ["about", "team"]), pg("contact", "Contact", "Convert", ["contact", "map"])] },
  realestate: { cta: "View Properties", style: "luxury", palette: "charcoal-gold", pairing: "luxury-serif", motion: "modern", schema: "RealEstateAgent", priorities: ["Listings", "Locations", "Property detail", "Agents", "Enquiry"],
    pages: [pg("home", "Home", "Listings + enquiries", ["hero", "portfolio", "features", "testimonials", "cta"]), pg("properties", "Properties", "Listings (filter by location)", ["portfolio", "cta"]), pg("agents", "Agents", "Who you deal with", ["team"]), pg("about", "About", "Track record (real only)", ["about"]), pg("contact", "Contact", "Enquiry", ["contact", "map"])] },
  fitness: { cta: "Book a Free Trial", style: "playful", palette: "mono-red", pairing: "bold-sora", motion: "dynamic", schema: "ExerciseGym", priorities: ["Programs", "Trainers", "Pricing", "Schedule", "Booking"],
    pages: [pg("home", "Home", "Energy + trials", ["hero", "features", "pricing", "testimonials", "cta"]), pg("programs", "Programs", "What you get", ["services", "hours"]), pg("trainers", "Trainers", "People", ["team"]), pg("pricing", "Pricing", "Plans", ["pricing", "faq"]), pg("contact", "Join", "Convert", ["booking", "map"])] },
  wellness: { cta: "Book a Session", style: "minimal", palette: "forest", pairing: "warm-lora", motion: "subtle", schema: "HealthAndBeautyBusiness", priorities: ["Sessions", "Teacher", "Schedule", "Booking"],
    pages: [pg("home", "Home", "Calm + bookings", ["hero", "services", "about", "cta"]), pg("sessions", "Sessions", "What we offer", ["services", "pricing"]), pg("schedule", "Schedule", "When", ["hours"]), pg("book", "Book", "Convert", ["booking"]), pg("contact", "Contact", "Reach", ["contact", "map"])] },
  salon: { cta: "Book Now", style: "playful", palette: "purple-pink", pairing: "elegant-instrument", motion: "modern", schema: "BeautySalon", priorities: ["Services", "Prices", "Gallery", "Booking"],
    pages: [pg("home", "Home", "Look + book", ["hero", "services", "gallery", "testimonials", "cta"]), pg("services", "Services & prices", "Menu", ["pricing", "services"]), pg("gallery", "Gallery", "Work", ["gallery"]), pg("book", "Book", "Convert", ["booking", "hours"]), pg("contact", "Contact", "Find us", ["contact", "map"])] },
  education: { cta: "Enquire for Admission", style: "modern", palette: "blue-white", pairing: "friendly-outfit", motion: "modern", schema: "EducationalOrganization", priorities: ["Programs", "Teachers", "Admissions", "Events", "FAQ"],
    pages: [pg("home", "Home", "Trust + admissions", ["hero", "services", "process", "testimonials", "cta"]), pg("programs", "Programs", "Courses", ["services", "pricing"]), pg("teachers", "Teachers", "Faculty", ["team"]), pg("admissions", "Admissions", "Convert", ["process", "booking", "faq"]), pg("contact", "Contact", "Reach", ["contact", "map"])] },
  creative: { cta: "View Portfolio", style: "minimal", palette: "mono-red", pairing: "creative-syne", motion: "modern", schema: "ProfessionalService", priorities: ["Portfolio", "Gallery", "Services", "Booking"],
    pages: [pg("home", "Home", "Work first", ["hero", "portfolio", "services", "cta"]), pg("portfolio", "Portfolio", "Projects", ["portfolio"]), pg("services", "Services", "Packages", ["services", "pricing"]), pg("about", "About", "Who", ["about"]), pg("contact", "Book", "Convert", ["booking"])] },
  personal: { cta: "Get in Touch", style: "minimal", palette: "blue-white", pairing: "clean-modern", motion: "modern", schema: "Person", priorities: ["About", "Work", "Contact"],
    pages: [pg("home", "Home", "Who + what", ["hero", "about", "portfolio", "cta"]), pg("work", "Work", "Proof", ["portfolio"]), pg("contact", "Contact", "Reach", ["contact", "social"])] },
  ecommerce: { cta: "Shop Now", style: "modern", palette: "mono-red", pairing: "clean-modern", motion: "modern", schema: "Store", priorities: ["Products", "Categories", "Cart", "Shipping", "Returns"],
    pages: [pg("home", "Home", "Bestsellers + trust", ["hero", "products", "features", "testimonials", "newsletter"]), pg("shop", "Shop", "All products", ["products"]), pg("about", "About", "Brand story", ["about"]), pg("faq", "FAQ", "Remove doubts", ["faq"]), pg("contact", "Contact", "Support", ["contact"]), pg("shipping", "Shipping Policy", "Legal", ["legal:shipping"]), pg("returns", "Returns & Refunds", "Legal", ["legal:refund"])] },
  hospitality: { cta: "Check Availability", style: "luxury", palette: "beige-brown", pairing: "classic-editorial", motion: "modern", schema: "LodgingBusiness", priorities: ["Rooms / packages", "Gallery", "Booking", "Location"],
    pages: [pg("home", "Home", "Escape + bookings", ["hero", "services", "gallery", "testimonials", "cta"]), pg("packages", "Rooms & Packages", "Offer", ["services", "pricing"]), pg("gallery", "Gallery", "See it", ["gallery"]), pg("book", "Book", "Convert", ["booking"]), pg("contact", "Location", "Find us", ["map", "contact"])] },
  tech: { cta: "Start Free", style: "dark", palette: "midnight-purple", pairing: "tech-grotesk", motion: "dynamic", schema: "SoftwareApplication", priorities: ["Features", "How it works", "Pricing", "FAQ", "Sign-up"],
    pages: [pg("home", "Home", "Value + sign-ups", ["hero", "logos", "features", "process", "pricing", "faq", "cta"]), pg("pricing", "Pricing", "Plans", ["pricing", "faq"]), pg("about", "About", "Team + mission", ["about", "team"]), pg("contact", "Contact", "Sales / support", ["contact"])] },
  ai: { cta: "Try It Free", style: "futuristic", palette: "black-lime", pairing: "tech-grotesk", motion: "experimental", schema: "SoftwareApplication", priorities: ["Demo", "Features", "Use cases", "Pricing"],
    pages: [pg("home", "Home", "Wow + sign-ups", ["hero", "features", "process", "video", "pricing", "faq", "cta"]), pg("pricing", "Pricing", "Plans", ["pricing"]), pg("contact", "Contact", "Sales", ["contact"])] },
  industrial: { cta: "Get a Quote", style: "corporate", palette: "orange-black", pairing: "corporate-plex", motion: "subtle", schema: "LocalBusiness", priorities: ["Services", "Projects", "Quote"],
    pages: [pg("home", "Home", "Capability + quotes", ["hero", "services", "portfolio", "process", "cta"]), pg("services", "Services", "Capabilities", ["services", "faq"]), pg("projects", "Projects", "Proof", ["portfolio"]), pg("about", "About", "Company", ["about", "stats"]), pg("contact", "Get a Quote", "Convert", ["contact", "map"])] },
  nonprofit: { cta: "Get Involved", style: "minimal", palette: "forest", pairing: "warm-lora", motion: "subtle", schema: "NGO", priorities: ["Mission", "Programs", "Volunteer", "Donate", "Transparency"],
    pages: [pg("home", "Home", "Mission + involvement", ["hero", "services", "process", "cta"]), pg("about", "About", "Mission + registration", ["about"]), pg("programs", "Programs", "Our work", ["services", "gallery"]), pg("get-involved", "Get Involved", "Convert", ["contact"])] },
  events: { cta: "Plan My Event", style: "luxury", palette: "purple-pink", pairing: "elegant-instrument", motion: "dynamic", schema: "EventPlanner", priorities: ["Services", "Gallery", "Packages", "Enquiry"],
    pages: [pg("home", "Home", "Inspiration + enquiries", ["hero", "services", "gallery", "testimonials", "cta"]), pg("services", "Services", "What we plan", ["services", "pricing"]), pg("gallery", "Gallery", "Proof", ["gallery"]), pg("contact", "Contact", "Convert", ["contact"])] },
  blog: { cta: "Read the Blog", style: "editorial", palette: "cream-burgundy", pairing: "news-baskerville", motion: "subtle", schema: "Blog", priorities: ["Posts", "About", "Newsletter"],
    pages: [pg("home", "Home", "Latest writing", ["hero", "blog", "newsletter"]), pg("about", "About", "Author", ["about"]), pg("contact", "Contact", "Reach", ["contact"])] },
  local: { cta: "Call Now", style: "modern", palette: "blue-white", pairing: "friendly-outfit", motion: "modern", schema: "LocalBusiness", priorities: ["Services", "Contact", "Location", "WhatsApp"],
    pages: [pg("home", "Home", "Services + calls", ["hero", "services", "process", "faq", "cta"]), pg("services", "Services", "What we do", ["services"]), pg("about", "About", "Who", ["about"]), pg("contact", "Contact", "Reach", ["contact", "map", "hours"])] },
  landing: { cta: "Get Started", style: "modern", palette: "midnight-purple", pairing: "clean-modern", motion: "dynamic", schema: "Organization", priorities: ["One offer", "Proof", "CTA"],
    pages: [pg("home", "Home", "One clear action", ["hero", "features", "process", "pricing", "faq", "contact"])] },
  coming: { cta: "Notify Me", style: "futuristic", palette: "black-lime", pairing: "tech-grotesk", motion: "experimental", schema: "Organization", priorities: ["Launch date", "Email capture"],
    pages: [pg("home", "Home", "Collect emails before launch", ["hero", "countdown", "newsletter"])] },
};
export const profileFor = (industry, siteType) => { const it = typeof industry === "string" ? findIndustry(industry) : industry; return (it && it.profile) || TYPE_PROFILE[siteType] || "local"; };

/* ---------- sitemap planner: profile + goals → pages (each with a purpose); never empty pages ---------- */
export function planSitemap(o) {
  o = o || {}; const key = PROFILES[o.profile] ? o.profile : profileFor(o.industry, o.type), P = PROFILES[key], goals = (o.goals || []).map((g) => String(g).toLowerCase());
  const pages = JSON.parse(JSON.stringify(P.pages)), has = (slug) => pages.some((p) => p.slug === slug), home = pages[0];
  const want = (g) => goals.some((x) => x.indexOf(g) > -1);
  if (want("sell products") && !home.sections.includes("products")) { home.sections.splice(1, 0, "products"); if (!has("shop")) pages.splice(1, 0, pg("shop", "Shop", "All products", ["products"])); }
  if ((want("book appointment") || want("accept booking")) && !pages.some((p) => p.sections.includes("booking"))) pages.splice(pages.length - 1, 0, pg("book", "Book", "Convert", ["booking", "hours"]));
  if (want("showcase portfolio") && !pages.some((p) => p.sections.includes("portfolio"))) pages.splice(1, 0, pg("work", "Work", "Proof", ["portfolio"]));
  if (want("collect emails") && !home.sections.includes("newsletter")) home.sections.push("newsletter");
  if (want("whatsapp")) { if (!home.sections.includes("whatsapp")) home.sections.splice(home.sections.length - 1, 0, "whatsapp"); }
  if (want("sell courses") && !pages.some((p) => p.sections.includes("pricing"))) pages.splice(1, 0, pg("courses", "Courses", "What you can learn", ["services", "pricing", "faq"]));
  if ((want("inform customers") || want("build brand")) && !has("blog") && key !== "blog") pages.push(pg("blog", "Blog", "Helpful articles (SEO)", ["blog"]));
  if (o.size === "starter") pages.splice(5);
  if (o.forms !== false && !pages.some((p) => /privacy/.test(p.slug))) pages.push(pg("privacy", "Privacy Policy", "Legal (your forms collect personal data)", ["legal:privacy"]));
  if (key === "ecommerce" && !has("terms")) pages.push(pg("terms", "Terms", "Legal", ["legal:terms"]));
  return { profile: key, cta: P.cta, priorities: P.priorities, pages: pages.map((p) => Object.assign(p, { slug: p.slug === "blog" ? "articles" : p.slug })) };
}
/* design system recommendation for a profile + chosen style + optional palette/pairing */
export function designFor(o) {
  const P = PROFILES[o.profile] || PROFILES.local, style = STYLES[o.style] ? o.style : P.style;
  let t = applyStyle({}, style, false);
  t = applyPalette(t, o.palette || (STYLES[o.style] ? STYLES[o.style].palette : P.palette), o.mode || (STYLES[o.style] ? STYLES[o.style].mode : "light"));
  if (o.pairing) t = applyPairing(t, o.pairing); else if (!STYLES[o.style]) t = applyPairing(t, P.pairing);
  if (!o.style) t.motion = P.motion;   // industry motion language (law = subtle, tech = dynamic, AI = experimental …)
  return t;
}

/* ---------- building blocks with neutral starter copy (the AI rewrites it; reviews/numbers/people stay placeholders) ---------- */
const it3 = (a) => a.map((x) => ({ title: x[0], text: x[1], icon: x[2] || "" }));
export function sectionDefaults(type, ctx) {
  const n = ctx.name || "Your business", city = ctx.city || "", cta = { label: ctx.cta || "Contact us", href: ctx.ctaHref || "contact/" }, ind = (ctx.industry || "business").toLowerCase();
  switch (type) {
    case "navbar": return { cta };
    case "footer": return { text: ctx.tagline || "" };
    case "hero": return { eyebrow: (ctx.industry || "") + (city ? " · " + city : ""), title: ctx.tagline || n + ": " + (ctx.industry || "done right"), subtitle: ctx.description || "Tell visitors in one sentence what you do and who you help" + (city ? " in " + city : "") + ".", cta, cta2: { label: "Learn more", href: (ctx.secondHref || "about/") }, align: "left", bg: "gradient" };
    case "services": case "features": return { title: type === "features" ? "Why choose " + n : "What we offer", items: it3((ctx.services && ctx.services.length ? ctx.services : ["Service one", "Service two", "Service three"]).slice(0, 6).map((s, i) => [s, "Explain this " + (type === "features" ? "benefit" : "service") + " in one or two sentences.", ["✦", "◆", "●", "▲", "■", "★"][i]])) };
    case "about": return { title: "About " + n, text: ctx.about || "Share how " + n + " started, who you serve and what makes your " + ind + " different.", points: [], cta: { label: cta.label, href: cta.href } };
    case "process": return { title: "How it works", items: it3([["Get in touch", "Call, WhatsApp or fill the form."], ["We plan", "A clear plan and price."], ["Done", "Delivered on time."]]) };
    case "testimonials": return { title: "What customers say", items: [{ quote: "[Add a real customer review]", name: "[Customer name]", role: "" }, { quote: "[Add a real customer review]", name: "[Customer name]", role: "" }] };
    case "stats": return { title: "", items: [{ value: "[Add]", label: "years of experience" }, { value: "[Add]", label: "happy customers" }] };
    case "team": return { title: "Our team", items: [{ name: "[Team member name]", role: "[Role]" }] };
    case "logos": return { title: "Trusted by", items: [] };
    case "pricing": return { title: "Plans & prices", items: [{ name: "Basic", price: "[Add price]", period: "", features: ["What's included"], cta }, { name: "Popular", price: "[Add price]", period: "", features: ["Everything in Basic", "More value"], featured: true, cta }] };
    case "faq": return { title: "Questions", items: [{ q: "How do I get started?", a: "Contact us, we reply quickly." }, { q: "Where are you located?", a: city ? "We are in " + city + "." : "[Add your location]" }] };
    case "gallery": return { title: "Gallery", images: [{}, {}, {}, {}, {}, {}] };
    case "portfolio": return { title: "Selected work", items: [{ title: "Project one", category: "", text: "What you did and the result." }, { title: "Project two", category: "", text: "What you did and the result." }, { title: "Project three", category: "", text: "What you did and the result." }] };
    case "cta": return { title: "Ready to start?", text: "Talk to " + n + " today.", button: cta };
    case "contact": return { title: "Get in touch", text: "Tell us what you need, we reply quickly.", button: "Send message", phone: ctx.phone || "", whatsapp: ctx.whatsapp || "", email: ctx.email || "", address: ctx.address || city };
    case "booking": return { title: ctx.cta || "Book an appointment", text: "Pick a date and time, we'll confirm by phone or WhatsApp.", services: (ctx.services || []).slice(0, 12), button: "Request booking", hours: [] };
    case "map": return { title: "Find us", address: ctx.address || city };
    case "hours": return { title: "Opening hours", items: [{ day: "Monday – Saturday", time: "[Add timings]" }, { day: "Sunday", time: "[Add timings]" }] };
    case "newsletter": return { title: "Get updates", text: "", button: "Subscribe" };
    case "whatsapp": return { title: "Questions? Chat with us", text: "We reply on WhatsApp.", number: ctx.whatsapp || "", button: "Chat on WhatsApp" };
    case "products": return { title: "Shop", subtitle: "", limit: 8 };
    case "blog": return { title: "Latest articles", limit: 6 };
    case "video": return { title: "See it in action", url: "" };
    case "countdown": return { title: "Launching soon", date: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), cta: null };
    case "text": return { title: "", body: "Write something here." };
    case "social": return { title: "Follow us", links: [] };
    default: return {};
  }
}
/* plan + business + design → a complete website document (navbar/footer on every page) */
export function buildDoc(plan, biz, theme) {
  biz = biz || {}; const ctx = { name: biz.name, city: biz.city || biz.location, industry: biz.industry, tagline: biz.tagline, description: biz.description, about: biz.about, phone: biz.phone, whatsapp: biz.whatsapp, email: biz.email, address: biz.location, services: biz.services || [], cta: plan.cta };
  const bookPage = plan.pages.find((p) => p.sections.includes("booking")), contactPage = plan.pages.find((p) => p.sections.includes("contact"));
  ctx.ctaHref = bookPage ? bookPage.slug + "/" : contactPage ? contactPage.slug + "/" : "#contact"; ctx.secondHref = (plan.pages[1] && plan.pages[1].slug + "/") || "#";
  const legal = (k) => legalText(k, biz);
  const pages = plan.pages.map((p) => ({ slug: p.slug, title: p.title, seo: {}, nav: /^(privacy|terms|shipping|returns|cookies|refund)/.test(p.slug) ? false : undefined,
    sections: [{ type: "navbar", props: sectionDefaults("navbar", ctx) }].concat(p.sections.map((t) => /^legal:/.test(t) ? { type: "legal", props: legal(t.slice(6)) } : { type: t, props: sectionDefaults(t, ctx) })).concat([{ type: "footer", props: sectionDefaults("footer", ctx) }]) }));
  const settings = { business: { name: biz.name, tagline: biz.tagline || "", phone: biz.phone || "", email: biz.email || "", whatsapp: biz.whatsapp || "", address: biz.location || "", city: biz.city || biz.location || "", description: biz.description || "", schemaType: (PROFILES[plan.profile] || {}).schema, industry: biz.industry || "", social: biz.social || {} }, notifyEmail: biz.email || "", lang: biz.lang || "en", whatsappFloat: !!biz.whatsapp };
  if (pages.some((p) => p.slug === "privacy")) settings.cookies = { on: false, policy: "privacy/" };
  return { theme, settings, pages };
}

/* ---------- legal pages (generated drafts, the editor marks them "review for your business and jurisdiction") ---------- */
export function legalText(kind, biz) {
  const n = (biz && biz.name) || "We", e = (biz && biz.email) || "[your email]", c = (biz && (biz.city || biz.location)) || "[your city]", d = new Date().toISOString().slice(0, 10);
  const T = {
    privacy: ["Privacy Policy", "## Who we are\n" + n + " (" + c + "). Contact: " + e + ".\n\n## What we collect\n- Details you send us through forms (name, phone, email, message)\n- Basic, anonymous visit statistics (pages viewed, device type), no advertising cookies unless you agree\n\n## Why we use it\n- To reply to your enquiry or booking\n- To improve this website\n\n## Sharing\nWe do not sell your data. We share it only with service providers who help us run this website, or when the law requires it.\n\n## How long we keep it\nOnly as long as needed for the purpose above.\n\n## Your rights\nYou can ask us to see, correct or delete your data: write to " + e + "."],
    terms: ["Terms of Use", "## Using this website\nBy using this website you agree to these terms.\n\n## Content\nThe content is for general information. We may change it at any time.\n\n## Orders and services\nPrices, availability and delivery times are confirmed when you order or book.\n\n## Liability\nWe are not liable for indirect losses from using this website, as far as the law allows.\n\n## Law\nThese terms follow the laws of India; courts in " + c + " have jurisdiction.\n\n## Contact\n" + e],
    refund: ["Returns & Refunds", "## Returns\nYou can request a return within [X] days of delivery if the item is unused and in its original packaging.\n\n## Refunds\nApproved refunds are paid to the original payment method within [X] working days.\n\n## Damaged or wrong items\nWrite to " + e + " within 48 hours with a photo, we will replace or refund.\n\n## Non-returnable items\n[List items that cannot be returned]"],
    shipping: ["Shipping Policy", "## Where we deliver\n[Your delivery area]\n\n## Delivery time\nOrders are dispatched within [X] working days; delivery usually takes [X–Y] days.\n\n## Charges\nShipping charges are shown at checkout.\n\n## Tracking\nYou receive tracking details once your order is dispatched. Questions: " + e],
    cookies: ["Cookie Policy", "## Cookies we use\n- **Necessary:** to make the website and cart work\n- **Analytics (only with your consent):** anonymous visit statistics\n- **Marketing (only with your consent):** none unless stated\n\n## Your choice\nYou can change your choice any time by clearing this site's data in your browser.\n\nQuestions: " + e],
  };
  const x = T[kind] || T.privacy; return { title: x[0], body: x[1], updated: d, generated: true, reviewed: false };
}

/* ---------- "Build a premium website for a dental clinic in Delhi focused on cosmetic dentistry." ---------- */
export function parsePrompt(text) {
  const t = String(text || ""), low = t.toLowerCase(), out = { raw: t.slice(0, 600) };
  const ind = findIndustry(low.replace(/\b(build|create|make|website|site|for|a|an|the|my|premium|modern|luxury|focused|on|in|with|and)\b/g, " ")); if (ind) { out.industry = ind.name; out.profile = ind.profile; }
  const loc = /\b(?:in|at|from|near)\s+([A-Z][\w.]+(?:[\s,]+[A-Z][\w.]+){0,2})/.exec(t); if (loc) out.location = loc[1].replace(/[.,]$/, "");
  const sty = [["luxury", /\b(premium|luxury|luxurious|high[- ]end|elegant)\b/], ["minimal", /\b(minimal|minimalist|clean|simple)\b/], ["corporate", /\b(corporate|professional)\b/], ["creative", /\b(creative|artistic|bold)\b/], ["playful", /\b(playful|fun|colorful|colourful|bright)\b/], ["dark", /\bdark\b/], ["editorial", /\b(editorial|magazine)\b/], ["glass", /\b(glass|glassmorphism)\b/], ["futuristic", /\b(futuristic|ai|tech[- ]looking)\b/], ["modern", /\bmodern\b/]].find((x) => x[1].test(low));
  if (sty) out.style = sty[0];
  const goals = [];
  if (/\b(appointment|booking|book)\b/.test(low)) goals.push("Book Appointments"); if (/\b(sell|shop|store|ecommerce|products?)\b/.test(low)) goals.push("Sell Products"); if (/\b(leads?|enquir|inquir)/.test(low)) goals.push("Get Leads");
  if (/whatsapp/.test(low)) goals.push("Get WhatsApp Messages"); if (/\b(portfolio|showcase|projects)\b/.test(low)) goals.push("Showcase Portfolio"); if (/\b(newsletter|emails?)\b/.test(low)) goals.push("Collect Emails"); if (/\bcourses?\b/.test(low)) goals.push("Sell Courses"); if (/\bblog\b/.test(low)) goals.push("Inform Customers");
  out.goals = goals;
  const name = /\b(?:called|named)\s+["“]?([^"”,.]{2,40})/.exec(t) || /["“]([^"”]{2,40})["”]/.exec(t); if (name) out.name = name[1].trim();
  const focus = /\bfocus(?:ed|sed)? on\s+([^.]{3,80})/i.exec(t); if (focus) out.focus = focus[1].trim();
  return out;
}
export const CTA_FOR = Object.fromEntries(Object.keys(PROFILES).map((k) => [k, PROFILES[k].cta]));
