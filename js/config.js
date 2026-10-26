/* FODO — single source of truth. Edit business details and feature switches here only. */
window.FODO = {
  brand: "FODO — Fear Of Digitally Out ?",
  shortBrand: "FODO",
  meaning: "Fear Of Digitally Out",
  tagline: "Don't get left behind.",
  siteUrl: "https://www.fodo.co.in",
  email: "anmol@fodo.co.in",
  phone: "+917827007676",
  phoneDisplay: "+91 7827007676",
  whatsappNumber: "917827007676",
  address: "65 M Block, New Roshanpura, Najafgarh, New Delhi – 110043, India",
  instagramHandle: "@fodo.co.in",
  instagramUrl: "https://instagram.com/fodo.co.in",
  linkedinUrl: "https://www.linkedin.com/in/anmol-singh-43720724a",
  founderName: "Anmol Singh",
  founderTitle: "Founder, FODO",
  formEndpoint: "",        // Optional (Formspree/Apps Script URL). Blank = WhatsApp + copy fallback.
  bookingUrl: "",          // Optional Calendly/Cal.com URL. Blank = request a preferred slot via form.
  founderPhoto: "",        // Not used in this build (founder section is text-only by request).
  discountsEnabled: false, // Keep OFF until terms + verification process are confirmed.
  rewardMode: "consultation",
  rewardValidityDays: 30,
  challengeRewardText: "A free 30-minute marketing strategy session",
  analyticsConsentRequired: true,
  ga4Id: "",               // Optional: Google Analytics 4 ID (G-XXXXXXXXXX). Loads ONLY after cookie consent.
  metaPixelId: "",         // Optional: Meta Pixel ID. Loads ONLY after cookie consent.
  foundingSlotsTotal: 10,   // Founding Clients Programme — total partner slots
  foundingSlotsTaken: 0,    // UPDATE as real clients sign (shown on home page)
  foundingCohort: "Q4 2026",
  reviewsMode: "live",      // "live" = only verified, written-approved reviews (js/reviews.js, built from data/reviews.csv); "preview" = sample data behind a visible design-preview banner (internal only)
  // ---- AI chat ----
  llmMode: "auto",          // "auto" = AI replies switch on by themselves when /api/chat is deployed and healthy (Git deploy + Workers AI); otherwise the offline bot answers. "off" = never use AI.
  // ---- Voice mode (chat bot "Talk to FODO AI") ----
  voiceEnabled: true,                       // show the mic button in the chat
  voiceProvider: "browser",                 // "browser" = free browser speech (default) · "openai-realtime" = paid realtime voice (needs /api/voice-session + OPENAI_API_KEY)
  voiceSessionEndpoint: "/api/voice-session",
  voiceMaxMinutes: 5,                       // hard cap per voice conversation
  googleReviewUrl: "",      // Paste FODO's Google Business Profile "Ask for reviews" link (https://g.page/r/.../review). The Google review button appears only when this is set.
  // Reward tiers used ONLY when discountsEnabled === true
  discountTiers: [
    { min: 40, max: 69, pct: 5 },
    { min: 70, max: 84, pct: 10 },
    { min: 85, max: 94, pct: 15 },
    { min: 95, max: 100, pct: 20 }
  ]
};
