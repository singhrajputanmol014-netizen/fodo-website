/* FODO Growth Lab plans, the single source of truth for prices, limits and features (server enforces, pages display).
   Change prices here only. Amounts are INR. "needs" = a data provider that must be connected before that feature is
   shown or sold (the plans page hides features whose provider is missing, so nothing is promised that cannot be delivered). */
export const PLANS = {
  free:    { id: "free",    name: "Free",    price: 0,    xrays: 2,   period: "lifetime", pages: 15,  competitors: 2,  compPages: 2, searches: 8,  aiQuestions: 2,  perHour: 2,  runtime: 180, seats: 1, monitors: 1,
    features: [] },
  starter: { id: "starter", name: "Starter", price: 499,  xrays: 10,  period: "month",    pages: 50,  competitors: 5,  compPages: 2, searches: 14, aiQuestions: 4,  perHour: 6,  runtime: 240, seats: 1, monitors: 3,
    features: ["fullReport", "export", "history", "monthlyReport"] },
  growth:  { id: "growth",  name: "Growth",  price: 1499, xrays: 30,  period: "month",    pages: 150, competitors: 8,  compPages: 3, searches: 20, aiQuestions: 10, perHour: 10, runtime: 360, seats: 1, monitors: 6,
    features: ["fullReport", "export", "history", "compare", "contentGap", "moreVoice", "volume", "shareOfVoice", "keywordMap", "monthlyReport", "whyWinning", "roadmapLite"] },
  pro:     { id: "pro",     name: "Pro",     price: 3999, xrays: 80,  period: "month",    pages: 300, competitors: 10, compPages: 6, searches: 24, aiQuestions: 10, perHour: 20, runtime: 480, seats: 1, monitors: 15,
    features: ["fullReport", "export", "history", "compare", "contentGap", "moreVoice", "volume", "shareOfVoice", "keywordMap", "techStack", "deepCompetitors", "externalLinks", "authority", "trackingAudit", "schemaCode", "adLibrary", "monthlyReport", "whyWinning", "roadmapLite"] },
  agency:  { id: "agency",  name: "Agency",  price: 9999, xrays: 250, period: "month",    pages: 500, competitors: 10, compPages: 6, searches: 24, aiQuestions: 10, perHour: 40, runtime: 600, seats: 5, monitors: 40,
    features: ["fullReport", "export", "history", "compare", "contentGap", "moreVoice", "volume", "shareOfVoice", "keywordMap", "techStack", "deepCompetitors", "externalLinks", "authority", "trackingAudit", "schemaCode", "adLibrary", "monthlyReport", "whyWinning", "roadmapLite",
      "fixPack", "battleCards", "roadmap90", "clientPitch", "whiteLabel", "team", "clients", "bulk"] },
};
export const ORDER = ["free", "starter", "growth", "pro", "agency"];
/* one-time packs: extra X-Rays that never expire; each runs at your plan's level (at least Starter) */
export const PACKS = {
  p5:  { id: "p5",  name: "5 X-Rays",  xrays: 5,  price: 299 },
  p20: { id: "p20", name: "20 X-Rays", xrays: 20, price: 999 },
  p60: { id: "p60", name: "60 X-Rays", xrays: 60, price: 2499 },
  // ₹1 payment test (1 X-Ray). Hidden and NOT buyable unless the Cloudflare variable PAY_TEST = "1", switch it off after testing.
  ptest: { id: "ptest", name: "Payment test (1 X-Ray)", xrays: 1, price: 1, hidden: true },
};
export const FEATURE_INFO = {
  fullReport: { label: "Full report: every section, every opportunity, competitor details, customer quotes, keyword table, AI visibility" },
  export: { label: "PDF, Excel, CSV and JSON downloads" },
  history: { label: "Saved X-Ray history in your account" },
  compare: { label: "Re-scan & compare with your last X-Ray of the same site (what got fixed, what is new)" },
  contentGap: { label: "Content gap: topics your competitors cover that you don't" },
  moreVoice: { label: "Deeper customer voice (more review & forum searches)" },
  volume: { label: "Search volume, CPC and competition for every keyword", needs: "seo" },
  techStack: { label: "Technology stack of your site and every competitor (CMS, analytics, pixels, chat, payments)" },
  deepCompetitors: { label: "Competitor deep-crawl: up to 6 pages of each competitor" },
  externalLinks: { label: "Broken outgoing links check" },
  authority: { label: "Domain authority for you and every competitor (Open PageRank, estimated)", needs: "authority" },
  shareOfVoice: { label: "Search share of voice: how much of Google's first page you own vs each competitor" },
  keywordMap: { label: "Keyword → page map: which of your pages should rank for each search, and which pages are missing" },
  trackingAudit: { label: "Tracking & ads readiness: analytics, pixels and Search Console checked, and which pixels competitors run that you don't" },
  schemaCode: { label: "Ready-to-paste schema code (JSON-LD) built from your real business details" },
  adLibrary: { label: "Competitor ads: one-click links to every competitor's live Meta and Google ads" },
  monthlyReport: { label: "Monthly growth report: what improved, what declined, competitor changes and what to do next" },
  whyWinning: { label: "Why are they winning?, head-to-head with any competitor, and how to catch them (now / 30 / 90 days)" },
  roadmapLite: { label: "90-day growth roadmap (rules-based, from your own findings) with KPIs" },
  fixPack: { label: "FODO Edge · AI Fix Pack: rewritten titles, meta descriptions, headlines and FAQs for your pages, ready to paste", edge: true },
  battleCards: { label: "FODO Edge · Competitor battle cards: how to win against each competitor, with talk tracks for sales", edge: true },
  roadmap90: { label: "FODO Edge · 90-day growth roadmap, week by week, tied to the evidence", edge: true },
  clientPitch: { label: "FODO Edge · Client pitch: a ready email + proposal outline from the X-Ray, to win the client", edge: true },
  whiteLabel: { label: "White-label PDF with your agency name and logo" },
  team: { label: "Team: 5 seats sharing the plan" },
  clients: { label: "Client folders for your reports" },
  bulk: { label: "Bulk X-Ray: up to 20 websites in one go" },
};
export const has = (planId, f) => (PLANS[planId] || PLANS.free).features.indexOf(f) > -1;
export const rank = (planId) => Math.max(0, ORDER.indexOf(planId));
export function limitsFor(planId) {
  const p = PLANS[planId] || PLANS.free;
  return { tier: p.id, MAX_PAGES: p.pages, MAX_COMPETITORS: p.competitors, COMP_PAGES: p.compPages, MAX_QUERIES: p.searches, AI_QUESTIONS: p.aiQuestions,
    MAX_TOTAL_RUNTIME: p.runtime * 1000, MAX_FETCHES: p.pages + (p.competitors + 4) * p.compPages + 40, LINKCHECK: has(p.id, "externalLinks") ? 80 : 0, features: p.features.slice() };
}
export function publicPlans(providers) {
  const ok = (f) => !FEATURE_INFO[f].needs || (providers && providers[FEATURE_INFO[f].needs]);
  return { plans: ORDER.map((id) => { const p = PLANS[id]; return { id, name: p.name, price: p.price, xrays: p.xrays, period: p.period, pages: p.pages, competitors: p.competitors, seats: p.seats, monitors: p.monitors,
    features: p.features.filter(ok).map((f) => ({ id: f, label: FEATURE_INFO[f].label })), pending: p.features.filter((f) => !ok(f)).map((f) => ({ id: f, label: FEATURE_INFO[f].label })) }; }), packs: Object.values(PACKS).filter((k) => !k.hidden || (providers && providers.payTest)) };
}

/* ---------- v39 Website Builder plans (part of the Growth Lab). Prices in INR / month, server-enforced limits.
   free = any logged-in account (the builder always needs a login). "templates": "free" = only the templates marked free in
   sites/lib/templates.js (FREE_TEMPLATES); "all" = every template + FODO's own custom templates.
   The bigger Growth Lab plans include a Builder level at no extra cost (BUILDER_IN_PLAN). ---------- */
export const BUILDER = {
  free:     { id: "free",     name: "Builder Free",     price: 0,   sites: 1,  pages: 6,   media: 30,   domains: 0,  ai: 40,   templates: "free" },
  builder:  { id: "builder",  name: "Website Builder",  price: 299, sites: 3,  pages: 25,  media: 300,  domains: 1,  ai: 300,  templates: "all" },
  business: { id: "business", name: "Builder Business", price: 799, sites: 10, pages: 60,  media: 1000, domains: 5,  ai: 1000, templates: "all" },
  agency:   { id: "agency",   name: "Builder Agency",   price: 0,   sites: 50, pages: 100, media: 3000, domains: 50, ai: 4000, templates: "all", planOnly: true },
};
export const BUILDER_ORDER = ["free", "builder", "business", "agency"];
export const BUILDER_SELL = ["builder", "business"];   // what can be bought on its own (Agency comes only with the Agency plan)
export const BUILDER_IN_PLAN = { free: "free", starter: "free", growth: "builder", pro: "business", agency: "agency" };
export const builderRank = (t) => Math.max(0, BUILDER_ORDER.indexOf(t));
export const BUILDER_FEATURES = {
  free: ["1 website", "Up to 6 pages", "Free templates + AI website builder + blank start", "Forms, SEO settings, mobile preview", "Publish free on sites.fodo.co.in/your-name"],
  builder: ["3 websites", "Up to 25 pages each", "Every template (200+ designs)", "1 custom domain", "300 AI actions a day"],
  business: ["10 websites", "Up to 60 pages each", "Every template (200+ designs)", "5 custom domains", "1,000 AI actions a day"],
  agency: ["50 websites", "Up to 100 pages each", "Every template", "50 custom domains", "4,000 AI actions a day"],
};
export function publicBuilder() {
  return { plans: BUILDER_ORDER.map((id) => { const b = BUILDER[id]; return { id, name: b.name, price: b.price, sites: b.sites, pages: b.pages, domains: b.domains, ai: b.ai, media: b.media, allTemplates: b.templates === "all", buyable: BUILDER_SELL.indexOf(id) > -1, features: BUILDER_FEATURES[id].slice() }; }),
    includedIn: Object.keys(BUILDER_IN_PLAN).filter((p) => BUILDER_IN_PLAN[p] !== "free").map((p) => ({ plan: p, planName: PLANS[p].name, builder: BUILDER_IN_PLAN[p], builderName: BUILDER[BUILDER_IN_PLAN[p]].name })) };
}
