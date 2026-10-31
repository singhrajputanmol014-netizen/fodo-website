/* FODO site knowledge for the AI assistants (v20.3) — everything the site sells and offers, built LIVE from the same files the
   site runs on, so the bot never falls behind what is built:
     plans.js     → plans, X-Rays, limits and features   (prices as set in Admin → Prices & tools, via applyConfig)
     products.js  → the 13 Pro tools, their price for one run and which plans already include them
     helpkb.js    → the help articles (also shown on /help/)
   Used by /api/chat (the "Ask FODO" bot) and the help assistant. Nothing here is invented: if a fact is not in these files,
   the assistant must say it is not sure. */
import { PLANS, PACKS, ORDER, FEATURE_INFO } from "./plans.js";
import { PRODUCTS, plansIncluding } from "./products.js";
import { HELP_KB } from "./helpkb.js";
import { kbSearch } from "./help.js";

const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
export const FREE_TOOLS = [
  ["Business X-Ray (2 free after login)", "/business-x-ray/"], ["Growth Score", "/growth-score/"], ["ROI Calculator", "/roi-calculator/"],
  ["Marketing Budget Planner", "/marketing-budget/"], ["Competitor Finder", "/competitor-finder/"], ["FODO Challenge (game)", "/fodo-challenge/"],
  ["Marketing Quiz", "/marketing-quiz/"], ["Templates", "/templates/"], ["Checklists", "/resources/"], ["Teardowns", "/teardowns/"]];

/* words that mean the question is about what FODO's site sells or about the person's own account */
export const PRODUCT_RE = /\b(x-?ray|xray|growth lab|lab|plans?|pricing|price|prices|cost|kitna|kitne|kitni|charges?|fees?|packs?|credits?|subscription|renew|refund|invoice|starter|growth plan|pro plan|agency plan|pro tools?|war room|revenue leak|offer strength|ai visibility|blueprint|roadmap|monitor(ing)?|competitor finder|growth score|roi calculator|budget planner|quiz|challenge|templates?|checklists?|teardowns?|account|login|log in|report|my plan|mera plan|ticket|support|help desk|white.?label|bulk|client folders?|search console|fodo edge)\b/i;

/* short catalogue — always in the prompt (≈1.5k chars) */
export function productBrief() {
  const plans = ORDER.map((id) => { const p = PLANS[id]; return p.name + " " + (p.price ? inr(p.price) + "/month" : "free") + " (" + p.xrays + " X-Rays" + (id === "free" ? " lifetime" : "/month") + ")"; }).join("; ");
  const packs = Object.keys(PACKS).map((k) => PACKS[k].name + " " + inr(PACKS[k].price)).join("; ");
  const tools = Object.keys(PRODUCTS).filter((k) => PRODUCTS[k].on !== false).map((k) => PRODUCTS[k].name + " " + inr(PRODUCTS[k].price)).join("; ");
  return "# FODO GROWTH LAB (self-serve software on this site — prices are LIVE, quote them exactly)\n" +
    "Business X-Ray: enter any website → a full growth report in a few minutes (website health, search visibility, competitors, customer voice, AI visibility, conversion, 30-day plan; every finding has evidence; missing data is shown as 'Data unavailable', never guessed). Page: /business-x-ray/\n" +
    "Plans: " + plans + ". X-Ray packs (never expire): " + packs + ". Plans: /plans/\n" +
    "Pro tools (one run each, built on the X-Ray research; a full X-Ray of the same site from the last 30 days is reused): " + tools + ". Pages: /growth-lab/<tool>/ · all: /growth-lab/\n" +
    "Free tools: " + FREE_TOOLS.map((t) => t[0] + " " + t[1]).join(", ") + ".\n" +
    "Account: /account/ (plan, X-Rays left, saved reports, Pro tool reports, monitoring). Help & tickets: /help/. FODO's done-for-you agency services are separate: fixed price after a free scoping call (/pricing/).";
}

/* full detail — added when the question is about plans, tools, prices or the account */
export function productDetail(question) {
  const plans = ORDER.map((id) => { const p = PLANS[id], prev = ORDER[ORDER.indexOf(id) - 1], had = prev ? PLANS[prev].features : [];
    const add = p.features.filter((f) => had.indexOf(f) < 0 && FEATURE_INFO[f]).map((f) => FEATURE_INFO[f].label.split(":")[0].split(" — ")[0]);
    return "- " + p.name + ": " + (p.price ? inr(p.price) + "/month" : "free") + ", " + p.xrays + " X-Rays" + (id === "free" ? " (lifetime)" : "/month") + ", reads up to " + p.pages + " pages and " + p.competitors + " competitors, " + p.monitors + " monitored competitor(s), " + p.seats + " seat(s)" + (add.length ? "; " + (prev ? "adds " : "") + add.join(", ") : "") + "."; }).join("\n");
  const tools = Object.keys(PRODUCTS).filter((k) => PRODUCTS[k].on !== false).map((k) => { const t = PRODUCTS[k], inc = plansIncluding(k).map((x) => PLANS[x].name);
    return "- " + t.name + " (" + inr(t.price) + " a run; /growth-lab/" + k + "/): " + t.line + (inc.length ? " Included in X-Rays on: " + inc.join(", ") + "." : ""); }).join("\n");
  const arts = kbSearch(question || "", 5);
  return "\n\n# PLANS IN DETAIL\n" + plans + "\n\n# PRO TOOLS\n" + tools + (arts.length ? "\n\n# HELP ARTICLES (FODO's own answers)\n" + arts.map((a) => "- " + a.q + " " + a.a + " (/" + a.link + ")").join("\n") : "");
}

/* the person's own account, for the assistants — their data only */
export function memberBlock(facts) {
  if (!facts) return "\n\n# THE PERSON\nNot logged in. For questions about their own plan, X-Rays or payments, ask them to log in (top of any page) or open a ticket at /help/.";
  return "\n\n# THE PERSON (logged in — their OWN account; use it to personalise, never reveal it to anyone else)\n" + JSON.stringify(facts) +
    (facts.paid ? "\nThis is a PAYING customer (" + facts.plan + " plan). Act as their growth coach: when they ask what to do, use their latest X-Ray (topActions, areas, competitors) and be specific, step by step; point to the exact report or Pro tool page." :
      "\nFree account. Help fully; when a paid feature would genuinely help, mention it once (with its price) — never push.");
}
