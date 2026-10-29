/* FODO Growth Lab plans — the single source of truth for prices, limits and features (server enforces, pages display).
   Change prices here only. Amounts are INR. "needs" = a data provider that must be connected before that feature is
   shown or sold (the plans page hides features whose provider is missing, so nothing is promised that cannot be delivered). */
export const PLANS = {
  free:    { id: "free",    name: "Free",    price: 0,    xrays: 2,   period: "lifetime", pages: 15,  competitors: 2,  compPages: 2, searches: 8,  aiQuestions: 2,  perHour: 2,  runtime: 180, seats: 1,
    features: [] },
  starter: { id: "starter", name: "Starter", price: 499,  xrays: 10,  period: "month",    pages: 50,  competitors: 5,  compPages: 2, searches: 14, aiQuestions: 4,  perHour: 6,  runtime: 240, seats: 1,
    features: ["fullReport", "export", "history"] },
  growth:  { id: "growth",  name: "Growth",  price: 1499, xrays: 30,  period: "month",    pages: 150, competitors: 8,  compPages: 3, searches: 20, aiQuestions: 10, perHour: 10, runtime: 360, seats: 1,
    features: ["fullReport", "export", "history", "compare", "contentGap", "moreVoice", "volume"] },
  pro:     { id: "pro",     name: "Pro",     price: 3999, xrays: 80,  period: "month",    pages: 300, competitors: 10, compPages: 6, searches: 24, aiQuestions: 10, perHour: 20, runtime: 480, seats: 1,
    features: ["fullReport", "export", "history", "compare", "contentGap", "moreVoice", "volume", "techStack", "deepCompetitors", "externalLinks", "authority"] },
  agency:  { id: "agency",  name: "Agency",  price: 9999, xrays: 250, period: "month",    pages: 500, competitors: 10, compPages: 6, searches: 24, aiQuestions: 10, perHour: 40, runtime: 600, seats: 5,
    features: ["fullReport", "export", "history", "compare", "contentGap", "moreVoice", "volume", "techStack", "deepCompetitors", "externalLinks", "authority", "whiteLabel", "team", "clients", "bulk"] },
};
export const ORDER = ["free", "starter", "growth", "pro", "agency"];
/* one-time packs: extra X-Rays that never expire; each runs at your plan's level (at least Starter) */
export const PACKS = {
  p5:  { id: "p5",  name: "5 X-Rays",  xrays: 5,  price: 299 },
  p20: { id: "p20", name: "20 X-Rays", xrays: 20, price: 999 },
  p60: { id: "p60", name: "60 X-Rays", xrays: 60, price: 2499 },
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
  return { plans: ORDER.map((id) => { const p = PLANS[id]; return { id, name: p.name, price: p.price, xrays: p.xrays, period: p.period, pages: p.pages, competitors: p.competitors, seats: p.seats,
    features: p.features.filter(ok).map((f) => ({ id: f, label: FEATURE_INFO[f].label })), pending: p.features.filter((f) => !ok(f)).map((f) => ({ id: f, label: FEATURE_INFO[f].label })) }; }), packs: Object.values(PACKS) };
}
