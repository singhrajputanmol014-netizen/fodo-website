/* FODO Marketing Budget Planner (free Growth Lab tool, v17 — prompt §43).
   Rules, not predictions: a starting split from FODO's planning playbook for your business type and goal, adjusted for how
   established you are, trimmed so every channel gets at least a workable amount, with a test budget for each.
   Output is labelled STRATEGIC RECOMMENDATION — never a forecast of results. Runs entirely in the browser. */
(function () {
  "use strict";
  var f = document.getElementById("bp-form"); if (!f) return;
  var $ = function (id) { return document.getElementById(id); }, X = window.FODO_EXPORT;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var inr = function (n) { return "₹" + Math.round(n).toLocaleString("en-IN"); };
  var CH = {
    search: { name: "Google Search Ads", role: "Capture people already searching for what you sell", kpi: "Cost per lead or sale; conversion rate of the landing page", risk: "Clicks get expensive in crowded categories — needs tight keywords, negative keywords and a page that converts", min: 15000, paid: true },
    meta: { name: "Meta Ads (Facebook + Instagram)", role: "Create demand and retarget visitors", kpi: "Cost per lead; lead-to-customer rate", risk: "Lead quality varies and creatives tire in 2–4 weeks — refresh them and qualify leads fast", min: 10000, paid: true },
    gbp: { name: "Google Business Profile & local listings", role: "Win “near me” and Google Maps searches", kpi: "Calls, direction requests, new reviews per month", risk: "Slow to build; depends on steady reviews and accurate details", min: 2000, paid: false },
    seo: { name: "SEO & content", role: "Compounding traffic you don't pay for per click", kpi: "Organic clicks and impressions (Google Search Console)", risk: "Takes 3–6 months to show results — fund it steadily", min: 15000, paid: false },
    linkedin: { name: "LinkedIn Ads & outreach", role: "Reach decision makers by job title and company", kpi: "Cost per qualified lead; meetings booked", risk: "High cost per click — target narrowly and use lead forms", min: 20000, paid: true },
    youtube: { name: "YouTube / video ads", role: "Build awareness and trust with video", kpi: "View rate; growth in searches for your brand", risk: "Needs a decent video; results are indirect", min: 15000, paid: true },
    email: { name: "Email & WhatsApp to your customers", role: "Repeat sales, referrals and nurturing", kpi: "Repeat-purchase rate; replies and referrals", risk: "Needs consent and a list; don't spam", min: 1500, paid: false },
    market: { name: "Marketplace ads (Amazon, Flipkart, Swiggy, Zomato …)", role: "Sell where buyers already shop", kpi: "ROAS / ACoS on the marketplace", risk: "Platform fees and dependence on one platform", min: 10000, paid: true },
    creative: { name: "Creative & landing pages", role: "Make every other channel convert better", kpi: "Landing-page conversion rate", risk: "Skipping it wastes ad money on pages that don't convert", min: 3000, paid: false },
  };
  var W = {
    local: { leads: { search: 35, meta: 25, gbp: 15, creative: 10, seo: 10, email: 5 }, footfall: { gbp: 25, search: 25, meta: 30, creative: 10, email: 10 }, awareness: { meta: 40, youtube: 20, gbp: 10, creative: 15, seo: 15 } },
    ecom: { sales: { meta: 35, search: 25, market: 15, email: 10, creative: 10, seo: 5 }, awareness: { meta: 40, youtube: 25, creative: 15, seo: 10, email: 10 } },
    b2b: { leads: { search: 30, linkedin: 25, seo: 20, email: 15, creative: 10 }, awareness: { linkedin: 35, seo: 25, youtube: 15, creative: 15, email: 10 } },
    saas: { leads: { search: 30, seo: 25, meta: 15, linkedin: 10, creative: 10, email: 10 }, awareness: { seo: 30, youtube: 20, meta: 20, linkedin: 15, creative: 15 } },
    edu: { leads: { meta: 40, search: 25, youtube: 15, creative: 10, email: 10 }, awareness: { meta: 35, youtube: 30, seo: 15, creative: 10, email: 10 } },
  };
  var GOAL_ALIAS = { sales: "leads", leads: "sales", footfall: "leads" };
  function plan(b, type, goal, stage, have) {
    var T = W[type] || W.local, base = T[goal] || T[GOAL_ALIAS[goal]] || T.leads || T.sales, w = {}, notes = [];
    Object.keys(base).forEach(function (k) { w[k] = base[k]; });
    if (stage === "new") { if (w.search) w.search += 5; if (w.gbp) w.gbp += 5; if (w.seo) w.seo = Math.max(5, w.seo - 5); if (w.email) w.email = Math.max(0, w.email - 5); notes.push("New business: more weight on channels that bring enquiries quickly (search, Google Maps); content still gets a share because it compounds."); }
    if (stage === "established") { if (w.email != null) w.email += 5; else w.email = 5; if (w.seo) w.seo += 5; if (w.meta) w.meta = Math.max(5, w.meta - 5); notes.push("Established business: more on repeat customers (email/WhatsApp) and SEO, which compound on your existing reputation."); }
    var keys = Object.keys(w).filter(function (k) { return w[k] > 0; });
    var total = function () { return keys.reduce(function (s, k) { return s + w[k]; }, 0); };
    // too small a budget spread too thin helps nobody: drop the smallest channels until each gets its minimum (max 3 channels under ₹30,000)
    var cap = b < 30000 ? 3 : b < 80000 ? 5 : 9, dropped = [];
    // the main channel for this goal (highest weight; paid first on a tie) is always kept — even when the budget is below its usual minimum
    var main = keys.slice().sort(function (a, c) { return w[c] - w[a] || (CH[c].paid ? 1 : 0) - (CH[a].paid ? 1 : 0); })[0];
    var short = function () { var t = total(); return keys.filter(function (k) { return k !== main && b * w[k] / t < CH[k].min * (CH[k].paid ? 1 : 0.5); }); };
    while (keys.length > 1 && (keys.length > cap || short().length)) {
      var sh = short(), pool = sh.length ? sh : keys.filter(function (k) { return k !== main; }); pool.sort(function (a, c) { return w[a] - w[c]; });
      var out = pool[0]; keys.splice(keys.indexOf(out), 1); dropped.push(out);
    }
    if (b < CH[main].min) notes.push(CH[main].name + " usually needs about " + inr(CH[main].min) + " a month to learn and get steady results — at " + inr(b) + " expect a slower start, so keep targeting very narrow.");
    if (dropped.length) notes.push("Left out for now (budget too small to run them properly): " + dropped.map(function (k) { return CH[k].name; }).join(", ") + ". Add them when the budget grows.");
    var t = total(), rows = keys.sort(function (a, c) { return w[c] - w[a]; }).map(function (k) {
      var amt = Math.round(b * w[k] / t / 100) * 100, c = CH[k];
      return { key: k, channel: c.name, share: Math.round(100 * w[k] / t), amount: amt, role: c.role, reason: (have.indexOf(k) > -1 ? "You already use it — keep what works and fix what doesn't. " : "") + reason(k, type, goal), risk: c.risk, kpi: c.kpi, test: c.paid ? Math.min(amt, Math.max(Math.round(amt * 0.3 / 100) * 100, Math.min(amt, c.min))) : null };
    });
    var diff = b - rows.reduce(function (s, r) { return s + r.amount; }, 0); if (rows.length) rows[0].amount += diff;
    return { rows: rows, notes: notes, budget: b };
  }
  function reason(k, type, goal) {
    var R = { search: "Buyers with intent search on Google first" + (type === "local" ? ", often with “near me”." : "."), meta: goal === "awareness" ? "The cheapest way to put your brand in front of many people in your area or audience." : "Strong targeting by interest and location, plus retargeting of site visitors.",
      gbp: "Google Maps decides which local businesses get the call — completing and reviewing your profile costs time, not ad money.", seo: "Every page that ranks keeps bringing visitors without paying per click.", linkedin: "Where B2B buyers can be targeted by role, seniority and company.",
      youtube: "Video builds trust before people are ready to buy.", email: "Selling again to people who already know you is the cheapest sale you will make.", market: "Online shoppers in many categories start on marketplaces, not search.", creative: "Better ads and landing pages raise the results of every rupee above." };
    return R[k];
  }
  f.addEventListener("submit", function (e) {
    e.preventDefault();
    var b = Math.round(+String($("bp-budget").value).replace(/[^\d.]/g, "")), out = $("bp-out");
    if (!b || b < 5000) { out.innerHTML = '<p class="cf-status warn">Enter a monthly budget of at least ₹5,000.</p>'; return; }
    var have = [].slice.call(document.querySelectorAll("[name=bp-have]:checked")).map(function (x) { return x.value; });
    var P = plan(b, $("bp-type").value, $("bp-goal").value, $("bp-stage").value, have);
    out.innerHTML = '<div class="panel hud bp-res"><span class="tag hot">STRATEGIC RECOMMENDATION</span><h2>' + inr(b) + ' / month — suggested split</h2><p class="muted">From FODO\'s planning rules for your business type, goal and stage. This is not a forecast — real results depend on your offer, pages and execution. Test first, then move money to what works.</p>' +
      '<ul class="bp-bars">' + P.rows.map(function (r) { return '<li><span>' + esc(r.channel) + '</span><i style="--v:' + r.share + '"></i><b>' + r.share + "% · " + inr(r.amount) + "</b></li>"; }).join("") + "</ul>" +
      '<div class="xr-scroll"><table class="xr-t"><thead><tr><th>Channel</th><th>Budget</th><th>Its job</th><th>Why</th><th>Risk</th><th>Measure (KPI)</th><th>Test budget (first 2–4 weeks)</th></tr></thead><tbody>' + P.rows.map(function (r) { return "<tr><td><b>" + esc(r.channel) + "</b></td><td>" + inr(r.amount) + " (" + r.share + "%)</td><td>" + esc(r.role) + "</td><td>" + esc(r.reason) + "</td><td>" + esc(r.risk) + "</td><td>" + esc(r.kpi) + "</td><td>" + (r.test == null ? "— (time / production)" : inr(r.test)) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      (P.notes.length ? "<ul class=\"muted\">" + P.notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>" : "") +
      '<div class="btn-row"><button type="button" class="btn sm ghost" id="bp-csv">Download CSV</button><a class="btn sm" href="../business-x-ray/">Check where your website leaks first — Business X-Ray</a><a class="btn sm ghost" data-route="contact" href="#">Talk to FODO about running it</a></div></div>';
    out.scrollIntoView({ behavior: "smooth", block: "start" });
    $("bp-csv").onclick = function () { if (!X) return; X.deliver(X.csv([["Channel", "Budget INR", "Share %", "Job", "Why", "Risk", "KPI", "Test budget INR"]].concat(P.rows.map(function (r) { return [r.channel, r.amount, r.share, r.role, r.reason, r.risk, r.kpi, r.test == null ? "" : r.test]; })).concat([[], ["STRATEGIC RECOMMENDATION - FODO planning rules, not a forecast"]])), "FODO-budget-plan-" + b + ".csv", { kind: "CSV" }); };
    try { if (window.FODO_TOOL) window.FODO_TOOL("complete", "budget", "₹" + b + " · " + $("bp-type").value + " · " + $("bp-goal").value); } catch (x) {}
  });
  window.FODO_BUDGET = { plan: plan };
})();
