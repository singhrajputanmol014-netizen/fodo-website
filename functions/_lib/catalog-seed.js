/* FODO v47.1 production catalog: the FIRST values only. Every rate here is tagged source "benchmark_seed": a research-informed
   starting point from the V47 brief, not truth. Owners / admins change every value in Workspace → Marketplace admin → Catalog,
   and each change is kept in the price history. Equipment without a benchmark in the brief has rate null: the engine shows
   "rate to be confirmed" and leaves it out of the total instead of inventing a number.
   Role units: day · hour · project (one fixed fee) · month · item (per deliverable). `match` = the FODO Pro roles that can fill it. */

const R = (id, name, cat, unit, min, max, def, match, desc) => ({ id, name, category: cat, unit, rate_min: min, rate_max: max, rate: def, match: match || [name], description: desc || "" });
export const ROLES = [
  /* production (₹ per day, brief section 23) */
  R("exec_producer", "Executive Producer", "Production", "day", 25000, 60000, 35000, ["Producer"]),
  R("producer", "Producer", "Production", "day", 12000, 30000, 18000, ["Producer"]),
  R("production_manager", "Production Manager", "Production", "day", 8000, 20000, 12000, ["Production Manager", "Producer"]),
  R("production_coordinator", "Production Coordinator", "Production", "day", 5000, 12000, 7000, ["Production Manager"]),
  R("director", "Director", "Production", "day", 20000, 75000, 35000, ["Director"]),
  R("first_ad", "1st Assistant Director", "Production", "day", 8000, 30000, 12000, ["Assistant Director"]),
  R("second_ad", "2nd Assistant Director", "Production", "day", 3000, 10000, 5000, ["Assistant Director"]),
  R("pa", "Production Assistant", "Production", "day", 3000, 8000, 4000, ["Production Manager", "Event/Activation Professional"]),
  /* camera */
  R("dop", "Director of Photography (DOP)", "Camera", "day", 20000, 100000, 35000, ["Director of Photography", "Cinematographer"]),
  R("camera_operator", "Camera Operator", "Camera", "day", 8000, 25000, 12000, ["Cinematographer", "Videographer"]),
  R("videographer", "Videographer", "Camera", "day", 8000, 25000, 12000, ["Videographer", "Cinematographer"]),
  R("first_ac", "1st Assistant Camera", "Camera", "day", 4000, 20000, 8000, ["Videographer", "Cinematographer"]),
  R("second_ac", "2nd Assistant Camera", "Camera", "day", 2000, 8000, 4000, ["Videographer"]),
  R("photographer", "Photographer", "Camera", "day", 8000, 30000, 12000, ["Photographer"]),
  R("drone_operator", "Drone Operator (licensed)", "Camera", "day", 8000, 25000, 12000, ["Drone Operator"]),
  R("bts_photographer", "BTS Photographer", "Camera", "day", 4000, 12000, 6000, ["Photographer"]),
  R("bts_videographer", "BTS Videographer", "Camera", "day", 5000, 15000, 7000, ["Videographer"]),
  /* lighting + sound */
  R("gaffer", "Gaffer", "Lighting", "day", 6000, 20000, 10000, ["Director of Photography", "Cinematographer"]),
  R("lighting_assistant", "Lighting Assistant", "Lighting", "day", 3000, 8000, 4000, ["Videographer"]),
  R("sound_recordist", "Sound Recordist", "Sound", "day", 8000, 30000, 12000, ["Sound Designer"]),
  R("boom_operator", "Boom Operator", "Sound", "day", 3500, 15000, 5000, ["Sound Designer"]),
  /* art, styling */
  R("art_director", "Art Director", "Art & Styling", "day", 10000, 40000, 15000, ["Art Director"]),
  R("production_designer", "Production Designer", "Art & Styling", "day", 10000, 40000, 15000, ["Art Director"]),
  R("stylist", "Stylist", "Art & Styling", "day", 5000, 25000, 8000, ["Stylist"]),
  R("makeup_artist", "Makeup Artist", "Art & Styling", "day", 4000, 20000, 7000, ["Makeup Artist"]),
  R("hair_artist", "Hair Artist", "Art & Styling", "day", 3000, 15000, 5000, ["Makeup Artist", "Stylist"]),
  /* post */
  R("editor", "Video Editor", "Post-production", "day", 8000, 30000, 12000, ["Video Editor"]),
  R("motion_designer", "Motion Designer", "Post-production", "day", 8000, 35000, 15000, ["Motion Designer", "Animator"]),
  R("colorist", "Colorist", "Post-production", "day", 8000, 30000, 12000, ["Video Editor"]),
  R("sound_designer", "Sound Designer", "Post-production", "day", 6000, 25000, 10000, ["Sound Designer"]),
  R("photo_retoucher", "Photo Retoucher", "Post-production", "item", 150, 800, 300, ["Graphic Designer", "Photographer"], "Per edited photo"),
  R("animator", "Animator", "Post-production", "day", 8000, 35000, 15000, ["Animator", "3D Artist", "Motion Designer"]),
  /* creative (project fees) */
  R("creative_director", "Creative Director", "Creative", "day", 20000, 75000, 30000, ["Creative Director"]),
  R("copywriter", "Copywriter", "Creative", "project", 5000, 25000, 10000, ["Copywriter"]),
  R("scriptwriter", "Scriptwriter", "Creative", "project", 8000, 40000, 15000, ["Scriptwriter"]),
  R("voice_artist", "Voice-over Artist", "Creative", "item", 3000, 15000, 5000, ["Voice Artist"], "Per finished voice-over"),
  R("ugc_creator", "UGC Creator", "Creative", "item", 3000, 15000, 5000, ["UGC Creator", "Creator"], "Per finished video"),
  R("talent", "Model / On-screen Talent", "Creative", "day", 5000, 50000, 10000, ["Model", "Actor"], "Day fee; usage rights are priced separately"),
  /* marketing (₹ per month unless said) */
  R("content_strategist", "Content Strategist", "Marketing", "month", 15000, 60000, 25000, ["Content Strategist"]),
  R("social_media_manager", "Social Media Manager", "Marketing", "month", 15000, 60000, 25000, ["Social Media Manager"]),
  R("graphic_designer", "Graphic Designer", "Marketing", "day", 4000, 15000, 6000, ["Graphic Designer"]),
  R("performance_marketer", "Performance Marketer", "Marketing", "month", 20000, 80000, 35000, ["Performance Marketer", "PPC Specialist"]),
  R("media_buyer", "Media Buyer", "Marketing", "month", 15000, 60000, 25000, ["Media Buyer"]),
  R("creative_strategist", "Creative Strategist", "Marketing", "project", 10000, 50000, 20000, ["Marketing Strategist", "Creative Director"]),
  R("seo_specialist", "SEO Specialist", "Marketing", "month", 15000, 60000, 25000, ["SEO Specialist"]),
  R("influencer_manager", "Influencer Manager", "Marketing", "month", 15000, 50000, 25000, ["Marketing Strategist", "Social Media Manager"]),
  /* business + web (project fees) */
  R("business_strategist", "Business Strategist", "Business", "project", 25000, 150000, 50000, ["Marketing Strategist"]),
  R("brand_strategist", "Brand Strategist", "Business", "project", 25000, 150000, 50000, ["Brand Strategist"]),
  R("brand_designer", "Brand Identity Designer", "Business", "project", 25000, 150000, 50000, ["Brand Designer"]),
  R("ui_designer", "UI/UX Designer", "Web", "project", 20000, 150000, 40000, ["UI/UX Designer", "Web Designer"]),
  R("web_developer", "Web Developer", "Web", "project", 25000, 200000, 60000, ["Web Developer"]),
  R("shopify_specialist", "Shopify Specialist", "Web", "project", 20000, 150000, 45000, ["Shopify Specialist"]),
  R("landing_page_developer", "Landing Page Developer", "Web", "project", 10000, 60000, 20000, ["Web Developer", "Web Designer"]),
  R("crm_specialist", "CRM Specialist", "Business", "project", 15000, 80000, 30000, ["Marketing Strategist"]),
];

/* equipment: rate = FODO client price per day (benchmark mid-point); cost_rate (partner cost) starts unset */
const E = (id, name, cat, rate, min, max, note, bundle) => ({ id, name, category: cat, rate, rate_min: min, rate_max: max, note: note || "", bundle: bundle || [] });
export const EQUIPMENT = [
  E("fx3", "Sony FX3 kit", "Cameras", 3200, 2500, 4000, "Body, batteries, media"),
  E("fx6", "Sony FX6 kit", "Cameras", 4800, 3500, 6000, "Body, batteries, media"),
  E("fx9", "Sony FX9 kit", "Cameras", 6500, 5000, 8000, "Body, batteries, media"),
  E("red_komodo", "RED Komodo kit", "Cameras", 13000, 8000, 18000, "Body, batteries, media"),
  E("a7s3", "Sony A7S III kit", "Cameras", null, null, null),
  E("bmpcc", "Blackmagic Pocket 6K kit", "Cameras", null, null, null),
  E("cinema_premium", "Premium cinema camera (ARRI etc.)", "Cameras", null, null, null, "Dynamic quote"),
  E("lens_zoom", "Standard zoom lens (24–70 / 70–200)", "Lenses", 1400, 800, 2000),
  E("lens_prime", "Prime lens", "Lenses", 1000, 500, 1500),
  E("cine_lens_set", "Cinema lens set", "Lenses", 8000, 4000, 12000),
  E("gimbal", "Gimbal (DJI RS class)", "Support", 1800, 1000, 2500),
  E("tripod", "Video tripod", "Support", null, null, null),
  E("slider", "Slider", "Support", null, null, null),
  E("audio_basic", "Basic audio kit (wireless mics + recorder)", "Audio", 2800, 1500, 4000),
  E("audio_pro", "Professional audio package", "Audio", null, null, null, "Dynamic quote"),
  E("light_basic", "LED light (single)", "Lighting", 1600, 800, 2500),
  E("light_package", "Professional lighting package", "Lighting", 12000, 5000, 20000, "COB / LED, stands, modifiers"),
  E("monitor", "Field monitor", "Monitoring", 1300, 700, 2000),
  E("drone", "Drone kit", "Drone", null, null, null, "Operator is a separate role"),
  E("teleprompter", "Teleprompter", "Production", null, null, null),
  E("walkies", "Walkie-talkie set", "Production", null, null, null),
  E("green_screen", "Green screen + stands", "Production", null, null, null),
  E("backdrop", "Paper backdrop + stands", "Production", null, null, null),
];

/* ---------- project templates ---------- */
/* question types: text · number · yesno · select · date · city · mode. `when` on a rule: [questionId, op, value], op = "=" | ">=" | "yes" */
const Q = (id, label, type, extra) => Object.assign({ id, label, type }, extra || {});
const SHOOT_Q = [
  Q("promote", "What are you promoting?", "text", { required: true, ph: "e.g. our new summer clothing collection" }),
  Q("city", "City", "city", { required: true }), Q("outstation", "Shooting outside your city (crew travel)?", "yesno", { def: "no" }), Q("date", "Shoot date", "date"), Q("shoot_days", "Shoot days", "number", { min: 1, max: 30, def: 1 }),
  Q("locations", "Number of locations", "number", { min: 1, max: 10, def: 1 }), Q("setting", "Indoor or outdoor?", "select", { options: ["Indoor", "Outdoor", "Both"], def: "Indoor" }),
  Q("products", "Number of products", "number", { min: 0, max: 200, def: 5 }), Q("talent", "On-screen talent / models", "number", { min: 0, max: 50, def: 1 }),
  Q("script", "Do you need a script?", "yesno", { def: "yes" }), Q("dialogue", "Will people speak on camera (dialogue)?", "yesno", { def: "no" }),
  Q("studio_lighting", "Controlled / studio lighting look?", "yesno", { def: "yes" }), Q("drone", "Drone shots?", "yesno", { def: "no" }),
  Q("styling", "Styling, hair and makeup?", "yesno", { def: "no" }), Q("setups", "Different setups / scenes", "number", { min: 1, max: 40, def: 4 }),
  Q("hero", "Main (hero) videos", "number", { min: 0, max: 20, def: 1 }), Q("reels", "Short-form cutdowns / reels", "number", { min: 0, max: 100, def: 4 }),
  Q("photos", "Edited photos", "number", { min: 0, max: 500, def: 0 }), Q("voiceover", "Voice-over?", "yesno", { def: "no" }),
  Q("motion", "Motion graphics / titles?", "yesno", { def: "no" }), Q("bts", "Behind-the-scenes content?", "yesno", { def: "no" }),
  Q("usage", "Where will it run (usage rights)?", "select", { options: ["Organic social", "Paid ads", "TV / OTT", "All media"], def: "Organic social" }),
  Q("budget", "Budget (₹, optional)", "number", { min: 0, max: 1e9 }), Q("notes", "Anything else?", "text") ];
const SHOOT_RULES = [
  { when: ["drone", "yes"], add: [["role", "drone_operator", 1, "shoot"], ["eq", "drone", 1]], why: "Drone shots need a licensed drone operator" },
  { when: ["dialogue", "yes"], add: [["role", "sound_recordist", 1, "shoot"], ["eq", "audio_basic", 1]], why: "People speaking on camera need clean recorded sound" },
  { when: ["studio_lighting", "yes"], add: [["role", "gaffer", 1, "shoot"]], tiers: ["professional", "premium"], why: "A controlled lighting look needs a gaffer" },
  { when: ["talent", ">=", 5], add: [["role", "production_coordinator", 1, "shoot"]], why: "5+ talent on set: a production coordinator keeps the schedule" },
  { when: ["setups", ">=", 10], add: [["role", "first_ad", 1, "shoot"]], tiers: ["professional", "premium"], why: "10+ setups: a 1st AD runs the floor" },
  { when: ["styling", "yes"], add: [["role", "stylist", 1, "shoot"], ["role", "makeup_artist", 1, "shoot"]], why: "Styling, hair and makeup were requested" },
  { when: ["script", "yes"], add: [["role", "scriptwriter", 1, "fixed"]], why: "A script was requested" },
  { when: ["voiceover", "yes"], add: [["role", "voice_artist", 1, "fixed"]], why: "A voice-over was requested" },
  { when: ["motion", "yes"], add: [["role", "motion_designer", 1, "motion"]], why: "Motion graphics were requested" },
  { when: ["bts", "yes"], add: [["role", "bts_videographer", 1, "shoot"]], why: "Behind-the-scenes content was requested" },
  { when: ["photos", ">=", 1], add: [["role", "photographer", 1, "shoot"], ["role", "photo_retoucher", 1, "photos"]], why: "Edited photos were requested" },
];
const SHOOT_TIERS = {
  essential: { label: "Essential", sub: "Lean team, 1 location", roles: [["producer", 1, "shoot"], ["director", 1, "shoot"], ["first_ac", 1, "shoot"], ["pa", 1, "shoot"], ["editor", 1, "post"]], equipment: [["fx3", 1], ["lens_zoom", 1], ["gimbal", 1], ["light_basic", 2]],
    capacity: { setups: 4, hero: 1, reels: 4, photos: 15 }, assumptions: ["Director doubles as camera (Director + DOP)", "1 location per day", "Basic lighting", "Standard edit, 2 rounds of changes"] },
  professional: { label: "Professional", sub: "Recommended", roles: [["producer", 1, "shoot"], ["director", 1, "shoot"], ["dop", 1, "shoot"], ["first_ac", 1, "shoot"], ["pa", 1, "shoot"], ["editor", 1, "post"], ["colorist", 1, "color"]], equipment: [["fx6", 1], ["lens_zoom", 2], ["gimbal", 1], ["light_package", 1], ["monitor", 1]],
    capacity: { setups: 8, hero: 1, reels: 6, photos: 25 }, assumptions: ["Separate director and DOP", "Controlled lighting", "Up to 8 setups per day", "Colour grade on the hero video", "2 rounds of changes"] },
  premium: { label: "Premium", sub: "Full production", roles: [["exec_producer", 1, "shoot"], ["producer", 1, "shoot"], ["director", 1, "shoot"], ["first_ad", 1, "shoot"], ["dop", 1, "shoot"], ["first_ac", 1, "shoot"], ["second_ac", 1, "shoot"], ["gaffer", 1, "shoot"], ["lighting_assistant", 2, "shoot"], ["art_director", 1, "shoot"], ["pa", 2, "shoot"], ["editor", 1, "post"], ["colorist", 1, "color"], ["sound_designer", 1, "color"]],
    equipment: [["red_komodo", 1], ["cine_lens_set", 1], ["gimbal", 1], ["light_package", 2], ["monitor", 2]],
    capacity: { setups: 12, hero: 2, reels: 10, photos: 40 }, assumptions: ["Full camera, lighting and art departments", "Cinema camera and lens set", "Up to 12 setups per day", "Colour grade and sound design", "3 rounds of changes"] } };
/* post-production days from the deliverables (configurable per template): editor days = ceil(Σ count × factor) */
const SHOOT_POST = { post: { hero: 2, reels: 0.4, min: 1 }, color: { hero: 0.5, reels: 0.1, min: 0.5 }, motion: { hero: 1, reels: 0.3, min: 1 }, photos: { photos: 1 } };

const PHOTO_TIERS = {
  essential: { label: "Essential", sub: "Photographer + assistant", roles: [["photographer", 1, "shoot"], ["pa", 1, "shoot"]], equipment: [["light_basic", 2]], capacity: { setups: 6, hero: 0, reels: 0, photos: 30 }, assumptions: ["Photographer brings camera body and lenses", "Simple setups"] },
  professional: { label: "Professional", sub: "Recommended", roles: [["producer", 1, "shoot"], ["photographer", 1, "shoot"], ["lighting_assistant", 1, "shoot"], ["stylist", 1, "shoot"]], equipment: [["light_package", 1], ["backdrop", 1]], capacity: { setups: 10, hero: 0, reels: 0, photos: 50 }, assumptions: ["Studio lighting", "On-set styling"] },
  premium: { label: "Premium", sub: "Fashion / campaign grade", roles: [["producer", 1, "shoot"], ["art_director", 1, "shoot"], ["photographer", 1, "shoot"], ["lighting_assistant", 2, "shoot"], ["stylist", 1, "shoot"], ["makeup_artist", 1, "shoot"], ["hair_artist", 1, "shoot"], ["pa", 1, "shoot"]], equipment: [["light_package", 2], ["backdrop", 1], ["monitor", 1]], capacity: { setups: 14, hero: 0, reels: 0, photos: 80 }, assumptions: ["Art direction", "Full hair, makeup and styling", "Tethered shooting"] } };
const PHOTO_Q = SHOOT_Q.filter((q) => ["promote", "city", "date", "shoot_days", "locations", "setting", "products", "talent", "styling", "setups", "photos", "usage", "budget", "notes"].indexOf(q.id) > -1).map((q) => q.id === "photos" ? Object.assign({}, q, { def: 30 }) : q);
const PHOTO_RULES = [{ when: ["photos", ">=", 1], add: [["role", "photo_retoucher", 1, "photos"]], why: "Every delivered photo is retouched" }, SHOOT_RULES[4], SHOOT_RULES[5]];

const POST_Q = [Q("promote", "What is it for?", "text", { required: true }), Q("hero", "Long / main videos", "number", { min: 0, max: 50, def: 1 }), Q("reels", "Short videos / reels", "number", { min: 0, max: 200, def: 5 }),
  Q("photos", "Photos to edit", "number", { min: 0, max: 1000, def: 0 }), Q("motion", "Motion graphics?", "yesno", { def: "no" }), Q("voiceover", "Voice-over?", "yesno", { def: "no" }), Q("date", "Needed by", "date"), Q("budget", "Budget (₹, optional)", "number", { min: 0, max: 1e9 }), Q("notes", "Anything else?", "text")];
const POST_TIERS = { essential: { label: "Essential", sub: "One editor", roles: [["editor", 1, "post"]], equipment: [], capacity: {}, assumptions: ["Remote work", "2 rounds of changes"] },
  professional: { label: "Professional", sub: "Recommended", roles: [["editor", 1, "post"], ["colorist", 1, "color"]], equipment: [], capacity: {}, assumptions: ["Remote work", "Colour grade", "2 rounds of changes"] },
  premium: { label: "Premium", sub: "Full post house", roles: [["creative_director", 1, "fixed"], ["editor", 1, "post"], ["colorist", 1, "color"], ["sound_designer", 1, "color"], ["motion_designer", 1, "motion"]], equipment: [], capacity: {}, assumptions: ["Creative direction", "Grade, sound design and motion", "3 rounds of changes"] } };
const POST_RULES = [SHOOT_RULES[7], SHOOT_RULES[8], { when: ["photos", ">=", 1], add: [["role", "photo_retoucher", 1, "photos"]], why: "Photos to edit" }];

const MONTHS_Q = (what) => [Q("promote", "Business and goal", "text", { required: true, ph: what }), Q("months", "How many months?", "number", { min: 1, max: 24, def: 3 }), Q("mode", "Work mode", "mode", { def: "online" }), Q("budget", "Budget (₹, optional)", "number", { min: 0, max: 1e9 }), Q("notes", "Anything else?", "text")];
const ADS_Q = MONTHS_Q("e.g. more leads for our clinic").concat([Q("ad_spend", "Monthly ad spend (paid to Meta / Google, separate from FODO's fee)", "number", { min: 0, max: 1e9, def: 50000 }), Q("creatives", "New ad creatives per month", "number", { min: 0, max: 100, def: 8 }), Q("landing", "Need a landing page?", "yesno", { def: "no" })]);
const ADS_TIERS = { essential: { label: "Essential", sub: "One specialist", roles: [["performance_marketer", 1, "months"]], equipment: [], capacity: {}, assumptions: ["Ad spend is paid by you to the ad platform and is not part of FODO's fee", "Campaigns are never shown as live until the ad account confirms it"] },
  professional: { label: "Professional", sub: "Recommended", roles: [["performance_marketer", 1, "months"], ["graphic_designer", 1, "creatives"], ["copywriter", 1, "fixed"]], equipment: [], capacity: {}, assumptions: ["Strategy → tracking → creative → launch → optimisation → monthly report", "Ad spend is separate"] },
  premium: { label: "Premium", sub: "Full growth team", roles: [["creative_strategist", 1, "fixed"], ["performance_marketer", 1, "months"], ["media_buyer", 1, "months"], ["graphic_designer", 1, "creatives"], ["editor", 1, "creatives_video"], ["copywriter", 1, "fixed"]], equipment: [], capacity: {}, assumptions: ["Separate strategy, buying and creative", "Video ad edits", "Ad spend is separate"] } };
const ADS_RULES = [{ when: ["landing", "yes"], add: [["role", "landing_page_developer", 1, "fixed"]], why: "A landing page was requested" }];
const RET = (roles, extra) => ({ essential: { label: "Essential", sub: "Core", roles: roles[0], equipment: [], capacity: {}, assumptions: ["Monthly reporting from real data only"] }, professional: { label: "Professional", sub: "Recommended", roles: roles[1], equipment: [], capacity: {}, assumptions: ["Monthly reporting", "Weekly check-in"].concat(extra || []) }, premium: { label: "Premium", sub: "Full team", roles: roles[2], equipment: [], capacity: {}, assumptions: ["Dedicated team", "Weekly reporting"] } });

const CONTENT_Q = MONTHS_Q("e.g. a café that wants more walk-ins").concat([Q("city", "City (for shoots)", "city"), Q("shoot_days", "Shoot days per month", "number", { min: 0, max: 10, def: 2 }), Q("reels", "Reels per month", "number", { min: 0, max: 60, def: 12 }), Q("photos", "Static posts / carousels per month", "number", { min: 0, max: 100, def: 16 }), Q("posting", "FODO posts for you?", "yesno", { def: "yes" })]);
const CONTENT_TIERS = { essential: { label: "Essential", sub: "Create + edit", roles: [["videographer", 1, "shoot_month"], ["editor", 1, "post_month"], ["graphic_designer", 1, "design_month"]], equipment: [], capacity: {}, assumptions: ["Videographer brings a camera kit", "Captions by the editor"] },
  professional: { label: "Professional", sub: "Recommended", roles: [["content_strategist", 1, "months"], ["videographer", 1, "shoot_month"], ["photographer", 1, "shoot_month"], ["editor", 1, "post_month"], ["graphic_designer", 1, "design_month"], ["social_media_manager", 1, "months"]], equipment: [["gimbal", 1]], capacity: {}, assumptions: ["Monthly content calendar", "Posting and monthly report"] },
  premium: { label: "Premium", sub: "Studio-grade content", roles: [["content_strategist", 1, "months"], ["producer", 1, "shoot_month"], ["videographer", 1, "shoot_month"], ["photographer", 1, "shoot_month"], ["editor", 1, "post_month"], ["motion_designer", 1, "design_month"], ["graphic_designer", 1, "design_month"], ["social_media_manager", 1, "months"], ["copywriter", 1, "fixed"]], equipment: [["fx3", 1], ["gimbal", 1], ["light_package", 1]], capacity: {}, assumptions: ["Producer on shoot days", "Motion graphics", "Copywriting"] } };
const CONTENT_POST = { post_month: { reels: 0.35, min: 1 }, design_month: { photos: 0.25, min: 1 } };

const WEB_Q = [Q("promote", "What does the business do?", "text", { required: true }), Q("pages", "Number of pages", "number", { min: 1, max: 200, def: 6 }), Q("ecommerce", "Online store?", "yesno", { def: "no" }), Q("products", "Products to upload", "number", { min: 0, max: 5000, def: 0 }),
  Q("copy", "Need the words written?", "yesno", { def: "yes" }), Q("branding", "Need a logo / brand identity?", "yesno", { def: "no" }), Q("mode", "Work mode", "mode", { def: "online" }), Q("date", "Launch by", "date"), Q("budget", "Budget (₹, optional)", "number", { min: 0, max: 1e9 }), Q("notes", "Anything else?", "text")];
const WEB_TIERS = { essential: { label: "Essential", sub: "Built on the FODO Website Builder", roles: [["web_developer", 1, "fixed"]], equipment: [], capacity: {}, assumptions: ["Built with the FODO Website Builder", "Your content and images"] },
  professional: { label: "Professional", sub: "Recommended", roles: [["ui_designer", 1, "fixed"], ["web_developer", 1, "fixed"], ["seo_specialist", 1, "once"]], equipment: [], capacity: {}, assumptions: ["Custom design", "Basic on-page SEO setup", "2 rounds of design changes"] },
  premium: { label: "Premium", sub: "Brand-grade website", roles: [["brand_strategist", 1, "fixed"], ["ui_designer", 1, "fixed"], ["web_developer", 1, "fixed"], ["copywriter", 1, "fixed"], ["seo_specialist", 1, "once"]], equipment: [], capacity: {}, assumptions: ["Strategy and content plan", "Custom design and copy", "3 rounds of changes"] } };
const WEB_RULES = [{ when: ["ecommerce", "yes"], add: [["role", "shopify_specialist", 1, "fixed"]], why: "An online store was requested" }, { when: ["copy", "yes"], add: [["role", "copywriter", 1, "fixed"]], tiers: ["essential", "professional"], why: "Website words were requested" }, { when: ["branding", "yes"], add: [["role", "brand_designer", 1, "fixed"]], why: "A logo / brand identity was requested" }];

const BIZ_Q = [Q("promote", "What business are you launching?", "text", { required: true }), Q("city", "City", "city"), Q("website", "Need a website?", "yesno", { def: "yes" }), Q("branding", "Need a brand identity?", "yesno", { def: "yes" }), Q("ads", "Run ads at launch?", "yesno", { def: "no" }), Q("content", "Launch content shoot?", "yesno", { def: "no" }), Q("mode", "Work mode", "mode", { def: "hybrid" }), Q("date", "Launch by", "date"), Q("budget", "Budget (₹, optional)", "number", { min: 0, max: 1e9 }), Q("notes", "Anything else?", "text")];
const BIZ_TIERS = { essential: { label: "Essential", sub: "Plan + identity", roles: [["business_strategist", 1, "fixed"]], equipment: [], capacity: {}, assumptions: ["Launch plan", "Legal / accounting partners only where FODO supports them"] },
  professional: { label: "Professional", sub: "Recommended", roles: [["business_strategist", 1, "fixed"], ["brand_strategist", 1, "fixed"]], equipment: [], capacity: {}, assumptions: ["Launch plan and positioning"] },
  premium: { label: "Premium", sub: "Full launch team", roles: [["business_strategist", 1, "fixed"], ["brand_strategist", 1, "fixed"], ["copywriter", 1, "fixed"]], equipment: [], capacity: {}, assumptions: ["Launch plan, positioning and messaging"] } };
const BIZ_RULES = [{ when: ["website", "yes"], add: [["role", "web_developer", 1, "fixed"]], why: "A website was requested" }, { when: ["branding", "yes"], add: [["role", "brand_designer", 1, "fixed"]], why: "A brand identity was requested" }, { when: ["ads", "yes"], add: [["role", "performance_marketer", 1, "once"]], why: "Launch ads were requested" }, { when: ["content", "yes"], add: [["role", "videographer", 1, "fixed_day"], ["role", "photographer", 1, "fixed_day"], ["role", "editor", 1, "fixed_day"]], why: "A launch content shoot was requested" }];

const EVENT_TIERS = { essential: { label: "Essential", sub: "One shooter", roles: [["videographer", 1, "shoot"], ["editor", 1, "post"]], equipment: [], capacity: { setups: 0, hero: 1, reels: 3, photos: 0 }, assumptions: ["Videographer brings a camera kit", "Highlight film"] },
  professional: { label: "Professional", sub: "Recommended", roles: [["videographer", 2, "shoot"], ["photographer", 1, "shoot"], ["editor", 1, "post"]], equipment: [["audio_basic", 1]], capacity: { setups: 0, hero: 1, reels: 6, photos: 100 }, assumptions: ["Two cameras", "Photos + highlight film"] },
  premium: { label: "Premium", sub: "Full coverage", roles: [["producer", 1, "shoot"], ["camera_operator", 3, "shoot"], ["photographer", 2, "shoot"], ["drone_operator", 1, "shoot"], ["editor", 2, "post"]], equipment: [["fx6", 2], ["audio_basic", 1], ["drone", 1]], capacity: { setups: 0, hero: 2, reels: 12, photos: 250 }, assumptions: ["Multi-camera", "Drone", "Same-week highlights"] } };
const EVENT_Q = SHOOT_Q.filter((q) => ["promote", "city", "outstation", "date", "shoot_days", "hero", "reels", "photos", "drone", "budget", "notes"].indexOf(q.id) > -1);

const POD_TIERS = { essential: { label: "Essential", sub: "Audio + 1 camera", roles: [["videographer", 1, "shoot"], ["editor", 1, "post"]], equipment: [["audio_basic", 1]], capacity: { setups: 1, hero: 1, reels: 4, photos: 0 }, assumptions: ["Up to 2 speakers", "1 episode per shoot day"] },
  professional: { label: "Professional", sub: "Recommended", roles: [["producer", 1, "shoot"], ["camera_operator", 2, "shoot"], ["sound_recordist", 1, "shoot"], ["editor", 1, "post"]], equipment: [["fx3", 2], ["audio_basic", 1], ["light_basic", 3]], capacity: { setups: 1, hero: 2, reels: 8, photos: 0 }, assumptions: ["Two cameras", "Clean recorded sound", "Up to 2 episodes per day"] },
  premium: { label: "Premium", sub: "Studio show", roles: [["producer", 1, "shoot"], ["director", 1, "shoot"], ["camera_operator", 3, "shoot"], ["sound_recordist", 1, "shoot"], ["gaffer", 1, "shoot"], ["editor", 1, "post"], ["motion_designer", 1, "motion"]], equipment: [["fx6", 3], ["audio_basic", 1], ["light_package", 1]], capacity: { setups: 2, hero: 3, reels: 12, photos: 0 }, assumptions: ["Three cameras", "Branded graphics", "Up to 3 episodes per day"] } };

const FAM = {
  shoot: { questions: SHOOT_Q, tiers: SHOOT_TIERS, rules: SHOOT_RULES, post: SHOOT_POST, mode: "onsite" },
  photo: { questions: PHOTO_Q, tiers: PHOTO_TIERS, rules: PHOTO_RULES, post: SHOOT_POST, mode: "onsite" },
  event: { questions: EVENT_Q, tiers: EVENT_TIERS, rules: [SHOOT_RULES[0]], post: SHOOT_POST, mode: "onsite" },
  podcast: { questions: SHOOT_Q.filter((q) => ["promote", "city", "date", "shoot_days", "hero", "reels", "budget", "notes"].indexOf(q.id) > -1), tiers: POD_TIERS, rules: [], post: SHOOT_POST, mode: "onsite" },
  post: { questions: POST_Q, tiers: POST_TIERS, rules: POST_RULES, post: SHOOT_POST, mode: "online" },
  content: { questions: CONTENT_Q, tiers: CONTENT_TIERS, rules: [], post: CONTENT_POST, mode: "hybrid" },
  ads: { questions: ADS_Q, tiers: ADS_TIERS, rules: ADS_RULES, post: {}, mode: "online" },
  web: { questions: WEB_Q, tiers: WEB_TIERS, rules: WEB_RULES, post: {}, mode: "online" },
  biz: { questions: BIZ_Q, tiers: BIZ_TIERS, rules: BIZ_RULES, post: {}, mode: "hybrid" },
  smm: { questions: MONTHS_Q("e.g. a skincare brand growing on Instagram"), tiers: RET([[["social_media_manager", 1, "months"]], [["social_media_manager", 1, "months"], ["graphic_designer", 1, "design_fixed"]], [["content_strategist", 1, "months"], ["social_media_manager", 1, "months"], ["graphic_designer", 1, "design_fixed"], ["copywriter", 1, "fixed"]]]), rules: [], post: {}, mode: "online" },
  seo: { questions: MONTHS_Q("e.g. rank for 'dentist in Dwarka'"), tiers: RET([[["seo_specialist", 1, "months"]], [["seo_specialist", 1, "months"], ["copywriter", 1, "fixed"]], [["seo_specialist", 1, "months"], ["content_strategist", 1, "months"], ["copywriter", 1, "fixed"], ["web_developer", 1, "fixed"]]]), rules: [], post: {}, mode: "online" },
  strategy: { questions: [Q("promote", "What do you want to figure out?", "text", { required: true }), Q("mode", "Work mode", "mode", { def: "online" }), Q("date", "Needed by", "date"), Q("budget", "Budget (₹, optional)", "number", { min: 0, max: 1e9 }), Q("notes", "Anything else?", "text")],
    tiers: { essential: { label: "Essential", sub: "One strategist", roles: [["brand_strategist", 1, "fixed"]], equipment: [], capacity: {}, assumptions: ["One workshop, written plan"] }, professional: { label: "Professional", sub: "Recommended", roles: [["brand_strategist", 1, "fixed"], ["creative_strategist", 1, "fixed"]], equipment: [], capacity: {}, assumptions: ["Research, workshop and plan"] }, premium: { label: "Premium", sub: "Strategy + creative", roles: [["business_strategist", 1, "fixed"], ["brand_strategist", 1, "fixed"], ["creative_director", 2, "fixed_day"]], equipment: [], capacity: {}, assumptions: ["Business and brand strategy", "Creative direction"] } }, rules: [], post: {}, mode: "online" },
  custom: { questions: [Q("promote", "Describe what you need", "text", { required: true }), Q("mode", "Work mode", "mode", { def: "online" }), Q("city", "City (if onsite)", "city"), Q("date", "Start date", "date"), Q("shoot_days", "Working days", "number", { min: 1, max: 60, def: 1 }), Q("budget", "Budget (₹, optional)", "number", { min: 0, max: 1e9 }), Q("notes", "Anything else?", "text")],
    tiers: { essential: { label: "Custom", sub: "Pick the roles yourself", roles: [], equipment: [], capacity: {}, assumptions: ["FODO reviews every custom project before quoting"] } }, rules: [], post: {}, mode: "hybrid" },
};
const T = (id, name, group, family, desc, over) => Object.assign({ id, name, group, family, description: desc }, over || {});
export const TEMPLATES = [
  T("ad_shoot", "Advertisement Shoot", "Creative & Production", "shoot", "A commercial for your product or brand, from script to final cut."),
  T("brand_film", "Brand Film", "Creative & Production", "shoot", "A story-led film about your brand."),
  T("product_shoot", "Product Shoot (video)", "Creative & Production", "shoot", "Product videos for ads, website and marketplaces."),
  T("corporate_video", "Corporate Video", "Creative & Production", "shoot", "Company profile, culture or explainer video."),
  T("social_shoot", "Social Media Shoot", "Creative & Production", "shoot", "A day of content for Instagram, YouTube Shorts and more."),
  T("reels_shoot", "Reels Shoot", "Creative & Production", "shoot", "Short vertical videos, many per day."),
  T("youtube_production", "YouTube Production", "Creative & Production", "shoot", "Long-form videos for your channel."),
  T("music_video", "Music Video", "Creative & Production", "shoot", "Performance and story music videos."),
  T("documentary", "Documentary", "Creative & Production", "shoot", "Real stories, interviews and b-roll."),
  T("short_film", "Short Film", "Creative & Production", "shoot", "Scripted short fiction."),
  T("interview_production", "Interview Production", "Creative & Production", "podcast", "Interviews and talking heads."),
  T("podcast_production", "Podcast Production", "Creative & Production", "podcast", "Video podcast shoots and edits."),
  T("photography_shoot", "Photography Shoot", "Creative & Production", "photo", "Brand, lifestyle or people photography."),
  T("product_photography", "Product Photography", "Creative & Production", "photo", "Clean product photos for e-commerce and ads."),
  T("fashion_shoot", "Fashion Shoot", "Creative & Production", "photo", "Lookbooks and campaign photography.", { tierDefault: "professional" }),
  T("event_coverage", "Event Coverage", "Creative & Production", "event", "Photos and videos of your event."),
  T("ugc_production", "UGC Production", "Creative & Production", "post", "Creator-style videos for ads.", { extraRoles: [["ugc_creator", 1, "reels_items"]] }),
  T("influencer_campaign", "Influencer Campaign", "Marketing", "smm", "Plan and run creator collaborations.", { extraRoles: [["influencer_manager", 1, "months"]] }),
  T("drone_shoot", "Drone Shoot", "Creative & Production", "event", "Aerial photos and video.", { forceAnswers: { drone: "yes" } }),
  T("animation_project", "Animation Project", "Creative & Production", "post", "2D / 3D animation.", { extraRoles: [["animator", 1, "motion"]] }),
  T("motion_graphics", "Motion Graphics", "Creative & Production", "post", "Animated titles, explainers and ads.", { forceAnswers: { motion: "yes" } }),
  T("video_editing", "Video Editing", "Creative & Production", "post", "Edit your footage into finished videos."),
  T("photo_editing", "Photo Editing", "Creative & Production", "post", "Retouching and colour for your photos."),
  T("monthly_content", "Monthly Content Package", "Marketing", "content", "Shoots, reels, posts, captions and posting every month."),
  T("social_media_management", "Social Media Management", "Marketing", "smm", "Your social accounts, managed every month."),
  T("meta_ads", "Meta Ads", "Marketing", "ads", "Facebook and Instagram ads (ad spend separate)."),
  T("google_ads", "Google Ads", "Marketing", "ads", "Search, YouTube and Performance Max (ad spend separate)."),
  T("performance_marketing", "Performance Marketing", "Marketing", "ads", "Multi-channel paid growth (ad spend separate)."),
  T("seo", "SEO", "Marketing", "seo", "Rank higher on Google, every month."),
  T("content_strategy", "Content Strategy", "Marketing", "strategy", "What to post, where and why."),
  T("influencer_marketing", "Influencer Marketing", "Marketing", "smm", "Creator partnerships at scale.", { extraRoles: [["influencer_manager", 1, "months"]] }),
  T("brand_strategy", "Brand Strategy", "Marketing", "strategy", "Positioning, audience and messaging."),
  T("campaign_strategy", "Campaign Strategy", "Marketing", "strategy", "A campaign plan from idea to media."),
  T("marketing_audit", "Marketing Audit", "Marketing", "strategy", "What works, what doesn't, what to fix first."),
  T("business_setup", "Business Setup", "Business", "biz", "Plan, brand, website and launch."),
  T("brand_launch", "Brand Launch", "Business", "biz", "Launch a new brand or product."),
  T("website_development", "Website Development", "Business", "web", "A new website for your business."),
  T("ecommerce_setup", "E-commerce Setup", "Business", "web", "Sell online with a store.", { forceAnswers: { ecommerce: "yes" } }),
  T("shopify_setup", "Shopify Setup", "Business", "web", "A Shopify store set up properly.", { forceAnswers: { ecommerce: "yes" } }),
  T("website_redesign", "Website Redesign", "Business", "web", "Make your current website better."),
  T("lead_generation", "Lead Generation", "Business", "ads", "Campaigns + landing page built for leads.", { forceAnswers: { landing: "yes" } }),
  T("crm_setup", "CRM Setup", "Business", "strategy", "Set up a CRM and lead follow-up.", { extraRoles: [["crm_specialist", 1, "fixed"]] }),
  T("growth_strategy", "Growth Strategy", "Business", "strategy", "A plan for the next 6–12 months of growth."),
  T("xray_execution", "Business X-Ray + Execution", "Business", "strategy", "Turn your Business X-Ray findings into done work."),
  T("custom", "Create Custom Project", "Custom", "custom", "Anything else: describe it and pick the roles."),
];
export const FAMILIES = FAM;
export const GROUPS = ["Creative & Production", "Marketing", "Business", "Custom"];
