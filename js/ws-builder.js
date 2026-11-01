/* FODO v47.1 Project Builder + Quotes (lazy module of the Workspace, loaded on #project-builder, #quotes, #quote=…).
   "Tell FODO what you need. FODO builds the team, plan and price." Every number comes from the server (/api/biz/builder/*):
   the client changes roles, quantities and days, never a rate; capacity is an estimate with its assumptions; no fake urgency. */
(function () {
  "use strict";
  var W = window.FODO_WS; if (!W) return;
  var api = W.api, act = W.act, esc = W.esc, inr = W.inr, day = W.day, toast = W.toast, modal = W.modal, head = W.head, empty = W.empty, fail = W.fail, $ = W.$, $$ = W.$$;
  var money = function (n) { return n == null ? '<i class="pb-tbc">rate to be confirmed</i>' : inr(n); };
  var CATS = [
    ["shoot", "Shoot", "Ads, brand films, product & social shoots", ["ad_shoot", "brand_film", "product_shoot", "corporate_video", "social_shoot", "reels_shoot", "youtube_production", "music_video", "documentary", "short_film", "interview_production", "podcast_production", "photography_shoot", "product_photography", "fashion_shoot", "event_coverage", "drone_shoot"]],
    ["ads", "Ads", "Meta, Google and lead generation", ["meta_ads", "google_ads", "performance_marketing", "lead_generation"]],
    ["content", "Content", "Monthly content, reels, UGC, editing", ["monthly_content", "social_media_management", "ugc_production", "video_editing", "photo_editing", "motion_graphics", "animation_project"]],
    ["website", "Website", "New site, store, Shopify, redesign", ["website_development", "ecommerce_setup", "shopify_setup", "website_redesign"]],
    ["marketing", "Marketing", "SEO, strategy, influencers, audits", ["seo", "content_strategy", "influencer_marketing", "influencer_campaign", "campaign_strategy", "marketing_audit", "growth_strategy"]],
    ["branding", "Branding", "Brand strategy and launch", ["brand_strategy", "brand_launch"]],
    ["business", "Business setup", "Launch, CRM, X-Ray execution", ["business_setup", "crm_setup", "xray_execution"]],
    ["custom", "Custom", "Describe it, pick the roles", ["custom"]]];
  var CAT = null, TPL = null, ANS = {}, EST = null, TIER = null, CUSTOM = { remove: [], roles: [], equipment: [] }, DRAFT = null, timer = null;

  /* ---------- the builder ---------- */
  function builder(el, q) {
    el.innerHTML = head("Build a Team", "Tell FODO what you need. FODO builds the team, plan and price. You can change everything before asking for a quote.", '<div class="ws-hx"><a class="ws-btn" href="#quotes">My quotes</a></div>') + '<div id="pb-drafts"></div><div id="pb"></div>';
    api("builder/catalog").then(function (c) {
      if (!c.ok) return fail(el, c, function () { builder(el, q); });
      W.CATALOG = c;
      api("builder/drafts").then(function (d) { if (!$("#pb-drafts")) return; var L = (d.items || []).filter(function (x) { return x.status === "draft"; }); if (!L.length) return;
        $("#pb-drafts").innerHTML = '<h2 class="ws-h3">Your drafts</h2><ul class="ws-rows">' + L.slice(0, 5).map(function (x) { return '<li><b>' + esc(x.title) + "</b><span>" + esc(x.tier || "") + " · " + inr(x.total) + " estimate · " + day(x.updated_at) + '</span><button type="button" class="ws-btn sm" data-open="' + esc(x.id) + '">Continue</button><button type="button" class="ws-btn sm" data-del="' + esc(x.id) + '" aria-label="Delete draft ' + esc(x.title) + '">Delete</button></li>'; }).join("") + "</ul>";
        $$("[data-open]", el).forEach(function (b) { b.onclick = function () { resume(b.dataset.open); }; });
        $$("[data-del]", el).forEach(function (b) { b.onclick = function () { if (confirm("Delete this draft?")) act(b, "builder/drafts/" + b.dataset.del, null, function () { b.closest("li").remove(); }, "DELETE"); }; }); });
      var t = q.get("type"); if (t && c.templates.some(function (x) { return x.id === t; })) pick(t); else cats();
    });
  }
  function resume(id) { api("builder/drafts/" + id).then(function (j) { if (!j.ok) return toast(j.reason, true); var d = j.draft; DRAFT = d.id; ANS = d.answers || {}; TIER = d.tier; CUSTOM = norm(d.custom); pick(d.templateId, true); }); }
  function norm(c) { c = c || {}; return { remove: c.remove || [], roles: c.roles || [], equipment: c.equipment || [] }; }
  function cats() {
    var box = $("#pb"); TPL = null; EST = null;
    box.innerHTML = '<h2 class="pb-q">What do you need?</h2><div class="pb-cats" role="list">' + CATS.map(function (c) { return '<button type="button" class="pb-cat" role="listitem" data-cat="' + c[0] + '"' + (CAT === c[0] ? ' aria-pressed="true"' : "") + "><b>" + esc(c[1]) + "</b><span>" + esc(c[2]) + "</span></button>"; }).join("") + '</div><div id="pb-types"></div>';
    $$("[data-cat]", box).forEach(function (b) { b.onclick = function () { CAT = b.dataset.cat; $$("[data-cat]", box).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); types(); }; });
    if (CAT) types();
  }
  function types() {
    var c = CATS.filter(function (x) { return x[0] === CAT; })[0], all = W.CATALOG.templates, L = c[3].map(function (id) { return all.filter(function (t) { return t.id === id; })[0]; }).filter(Boolean);
    if (CAT === "shoot") all.forEach(function (t) { if (t.custom && t.group === "Creative & Production" && L.indexOf(t) < 0) L.push(t); });   // admin-created types
    if (L.length === 1) return pick(L[0].id);
    $("#pb-types").innerHTML = '<h2 class="pb-q">Which project?</h2><div class="pb-types">' + L.map(function (t) { return '<button type="button" class="pb-type" data-t="' + esc(t.id) + '"><b>' + esc(t.name) + "</b><span>" + esc(t.description) + "</span></button>"; }).join("") + "</div>";
    $$("[data-t]", $("#pb-types")).forEach(function (b) { b.onclick = function () { ANS = {}; TIER = null; CUSTOM = norm(); DRAFT = null; pick(b.dataset.t); }; });
    $("#pb-types").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function pick(id, resumed) {
    api("builder/templates/" + id).then(function (j) {
      if (!j.ok) return toast(j.reason, true); TPL = j.template; var box = $("#pb");
      var f = function (qq) { var v = ANS[qq.id] != null ? ANS[qq.id] : (qq.def != null ? qq.def : ""), nm = "pb-" + qq.id, lab = '<span>' + esc(qq.label) + (qq.required ? " *" : "") + "</span>";
        if (qq.type === "yesno") return '<label class="ws-f" for="' + nm + '">' + lab + '<select id="' + nm + '" name="' + qq.id + '"><option value="no"' + (v !== "yes" ? " selected" : "") + '>No</option><option value="yes"' + (v === "yes" ? " selected" : "") + ">Yes</option></select></label>";
        if (qq.type === "select" || qq.type === "mode") { var opts = qq.type === "mode" ? ["online", "onsite", "hybrid"] : qq.options; return '<label class="ws-f" for="' + nm + '">' + lab + '<select id="' + nm + '" name="' + qq.id + '">' + opts.map(function (o) { return '<option value="' + esc(o) + '"' + (String(v) === o ? " selected" : "") + ">" + esc(qq.type === "mode" ? { online: "Online / remote", onsite: "On-site", hybrid: "Hybrid" }[o] : o) + "</option>"; }).join("") + "</select></label>"; }
        if (qq.type === "number") return '<label class="ws-f" for="' + nm + '">' + lab + '<input id="' + nm + '" name="' + qq.id + '" type="number" inputmode="numeric" min="' + (qq.min || 0) + '" max="' + (qq.max || 1e9) + '" value="' + esc(v) + '"></label>';
        if (qq.type === "date") return '<label class="ws-f" for="' + nm + '">' + lab + '<input id="' + nm + '" name="' + qq.id + '" type="date" value="' + esc(v) + '"></label>';
        if (qq.id === "promote" || qq.id === "notes") return '<label class="ws-f pb-wide" for="' + nm + '">' + lab + '<textarea id="' + nm + '" name="' + qq.id + '" rows="2" maxlength="1000" placeholder="' + esc(qq.ph || "") + '">' + esc(v) + "</textarea></label>";
        return '<label class="ws-f" for="' + nm + '">' + lab + '<input id="' + nm + '" name="' + qq.id + '" maxlength="80" value="' + esc(v) + '" placeholder="' + esc(qq.ph || "") + '"></label>'; };
      box.innerHTML = '<nav class="pb-crumb" aria-label="Steps"><button type="button" class="ws-link" id="pb-back">← Project types</button> <b>' + esc(TPL.name) + "</b></nav>" +
        '<form class="ws-form pb-form" id="pb-f" novalidate><p class="ws-sub">' + esc(TPL.description) + '</p><div class="pb-qs">' + TPL.questions.map(f).join("") + '</div><div class="ws-acts"><button class="ws-btn pri" type="submit">See my team options</button></div></form><div id="pb-out" aria-live="polite"></div>';
      $("#pb-back").onclick = cats;
      $("#pb-f").onsubmit = function (e) { e.preventDefault(); ANS = read(); var miss = TPL.questions.filter(function (x) { return x.required && !ANS[x.id]; }); if (miss.length) { toast("Please answer: " + miss.map(function (x) { return x.label; }).join(", "), true); var m = $("#pb-" + miss[0].id); if (m) m.focus(); return; } if (!resumed) { TIER = null; CUSTOM = norm(); } resumed = false; run(true); };
      if (resumed) { $("#pb-f").requestSubmit ? $("#pb-f").requestSubmit() : run(true); }
      box.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  function read() { var o = {}; TPL.questions.forEach(function (qq) { var f = $("#pb-f"); { var x = f.querySelector('[name="' + qq.id + '"]'); if (x && x.value !== "") o[qq.id] = x.value; } }); return o; }
  /* all three options first; after a pick, only that option with the client's changes */
  function run(scenarios) {
    var out = $("#pb-out"); out.setAttribute("aria-busy", "true");
    api("builder/estimate", scenarios ? { templateId: TPL.id, answers: ANS } : { templateId: TPL.id, answers: ANS, tier: TIER, custom: CUSTOM }).then(function (j) {
      out.removeAttribute("aria-busy"); if (!j.ok) return toast(j.reason, true);
      if (scenarios) { EST = j; if (TIER && j.tiers[TIER]) { if (CUSTOM.remove.length || CUSTOM.roles.length || CUSTOM.equipment.length) return run(false); return detail(); } return options(); }
      EST.tiers[TIER] = j.tiers[TIER]; detail(true);
    });
  }
  function options() {
    var out = $("#pb-out"), budget = EST.budget;
    out.innerHTML = '<h2 class="pb-q">Your team options</h2><p class="ws-sub">Prices are estimates from FODO\'s rate card until you accept a quote. Capacity is what this scope can reasonably support, not a guarantee.</p><div class="pb-tiers">' + EST.order.map(function (k) { var T = EST.tiers[k];
      return '<article class="pb-tier' + (k === EST.recommended ? " rec" : "") + '"><header><b>' + esc(T.label) + "</b>" + (k === EST.recommended ? '<i class="ws-pill">Recommended</i>' : "") + "<small>" + esc(T.sub) + '</small></header><p class="pb-big">' + inr(T.price.total) + (T.price.incomplete ? " +" : "") + "</p><p>" + T.people + " " + (T.people === 1 ? "person" : "people") + " · " + T.equipment.length + " equipment item" + (T.equipment.length === 1 ? "" : "s") + "</p>" +
        (budget ? '<p class="ws-pill ' + (T.fitsBudget ? "ok" : "warn") + '">' + (T.fitsBudget ? "Within your budget" : "Above your budget") + "</p>" : "") +
        "<ul>" + T.team.slice(0, 7).map(function (x) { return "<li>" + (x.qty > 1 ? x.qty + " × " : "") + esc(x.name) + "</li>"; }).join("") + (T.team.length > 7 ? "<li>+" + (T.team.length - 7) + " more</li>" : "") + "</ul>" + (T.capacityText ? '<p class="pb-cap">' + esc(T.capacityText) + "</p>" : "") +
        '<button type="button" class="ws-btn ' + (k === EST.recommended ? "pri" : "") + '" data-tier="' + k + '">Choose ' + esc(T.label) + "</button></article>"; }).join("") + "</div>";
    $$("[data-tier]", out).forEach(function (b) { b.onclick = function () { TIER = b.dataset.tier; CUSTOM = norm(); detail(); }; });
    out.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function detail(keepScroll) {
    var T = EST.tiers[TIER], out = $("#pb-out"), C = W.CATALOG, P = T.price;
    var roleRow = function (x) { return '<li class="pb-row"><div><b>' + esc(x.name) + "</b>" + (x.why ? "<small>" + esc(x.why) + "</small>" : "") + '</div><label class="pb-num">Qty<input type="number" min="1" max="50" value="' + x.qty + '" data-rq="' + esc(x.id) + '" aria-label="' + esc(x.name) + ' quantity"></label><label class="pb-num">' + esc(x.unitLabel) + '<input type="number" min="0.5" max="365" step="0.5" value="' + x.units + '" data-ru="' + esc(x.id) + '" aria-label="' + esc(x.name) + " " + esc(x.unitLabel) + '"></label><span class="pb-amt">' + money(x.amount) + '</span><button type="button" class="ws-x pb-rm" data-rm="' + esc(x.id) + '" aria-label="Remove ' + esc(x.name) + '">×</button><button type="button" class="ws-link pb-mt" data-match="' + esc(x.id) + '">Who?</button></li>'; };
    var eqRow = function (x) { return '<li class="pb-row"><div><b>' + esc(x.name) + "</b>" + (x.why ? "<small>" + esc(x.why) + "</small>" : "") + '</div><label class="pb-num">Qty<input type="number" min="1" max="50" value="' + x.qty + '" data-eq="' + esc(x.id) + '" aria-label="' + esc(x.name) + ' quantity"></label><label class="pb-num">days<input type="number" min="1" max="365" value="' + x.days + '" data-ed="' + esc(x.id) + '" aria-label="' + esc(x.name) + ' days"></label><span class="pb-amt">' + money(x.amount) + '</span><button type="button" class="ws-x pb-rm" data-rm="' + esc(x.id) + '" aria-label="Remove ' + esc(x.name) + '">×</button></li>'; };
    out.innerHTML = '<div class="pb-grid"><div><div class="ws-tabs sm" role="tablist">' + EST.order.map(function (k) { return '<a role="tab" href="#project-builder" aria-selected="' + (k === TIER) + '" data-sw="' + k + '">' + esc(EST.tiers[k].label) + "</a>"; }).join("") + "</div>" +
      (T.warnings.length ? '<div class="pb-warn" role="note">' + T.warnings.map(function (w) { return "<p>" + esc(w) + "</p>"; }).join("") + "</div>" : "") +
      '<h2 class="ws-h3">Team · ' + T.people + ' people</h2><ul class="pb-list">' + T.team.map(roleRow).join("") + '</ul><div class="pb-add"><label class="sr" for="pb-ar">Add a role</label><select id="pb-ar"><option value="">+ Add a role…</option>' + groupOpts(C.roles, T.team) + '</select></div>' +
      '<h2 class="ws-h3">Equipment</h2>' + (T.equipment.length ? '<ul class="pb-list">' + T.equipment.map(eqRow).join("") + "</ul>" : '<p class="ws-sub">No equipment in this option.</p>') + '<div class="pb-add"><label class="sr" for="pb-ae">Add equipment</label><select id="pb-ae"><option value="">+ Add equipment…</option>' + groupOpts(C.equipment, T.equipment) + "</select></div>" +
      (T.capacityText ? '<h2 class="ws-h3">Estimated capacity</h2><p>' + esc(T.capacityText) + "</p>" : "") + '<h2 class="ws-h3">Assumptions</h2><ul class="pb-ul">' + T.assumptions.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>" +
      (T.notes.length ? '<p class="ws-sub">' + T.notes.map(esc).join(" ") + "</p>" : "") +
      (T.reduce.length ? '<h2 class="ws-h3">Ways to reduce cost</h2><ul class="ws-rows">' + T.reduce.map(function (r) { return "<li><b>" + esc(r.label) + "</b><span>saves " + inr(r.saves) + " · " + esc(r.effect) + '</span><button type="button" class="ws-btn sm" data-rm="' + esc(r.id) + '">Apply</button></li>'; }).join("") + "</ul>" : "") +
      '</div><aside class="pb-price" aria-label="Price"><h2 class="ws-h3">Estimated price</h2><dl>' + P.groups.map(function (g) { return "<div><dt>" + esc(g.label) + "</dt><dd>" + inr(g.amount) + "</dd></div>"; }).join("") + "<div><dt>Subtotal</dt><dd>" + inr(P.subtotal) + "</dd></div><div><dt>" + esc(P.tax.label) + (P.tax.charged ? " (" + P.tax.pct + "%)" : "") + "</dt><dd>" + (P.tax.charged ? inr(P.tax.amount) : "Not charged") + '</dd></div><div class="pb-total"><dt>Total</dt><dd>' + inr(P.total) + (P.incomplete ? " +" : "") + "</dd></div></dl>" +
      (P.tax.note ? "<small>" + esc(P.tax.note) + "</small>" : "") + (P.band ? "<small>" + esc(P.band) + "</small>" : "") + (P.incomplete ? "<small>+ items with a rate to be confirmed are added by FODO in the quote.</small>" : "") +
      '<div id="pb-av" class="pb-av"></div><button type="button" class="ws-btn" id="pb-chk">Check team availability</button><button type="button" class="ws-btn" id="pb-save">Save draft</button><button type="button" class="ws-btn pri" id="pb-quote">Request a quote</button><small>Nothing is booked or charged until you accept a quote.</small></aside></div>';
    $$("[data-sw]", out).forEach(function (a) { a.onclick = function (e) { e.preventDefault(); TIER = a.dataset.sw; CUSTOM = norm(); run(false); }; });
    $$("[data-rm]", out).forEach(function (b) { b.onclick = function () { CUSTOM.remove.push(b.dataset.rm); CUSTOM.roles = CUSTOM.roles.filter(function (r) { return r.id !== b.dataset.rm; }); CUSTOM.equipment = CUSTOM.equipment.filter(function (r) { return r.id !== b.dataset.rm; }); run(false); }; });
    var upR = function (id, k, v) { var r = CUSTOM.roles.filter(function (x) { return x.id === id; })[0]; if (!r) { var t = T.team.filter(function (x) { return x.id === id; })[0]; r = { id: id, qty: t.qty }; CUSTOM.roles.push(r); } r[k] = +v; later(); };
    var upE = function (id, k, v) { var r = CUSTOM.equipment.filter(function (x) { return x.id === id; })[0]; if (!r) { var t = T.equipment.filter(function (x) { return x.id === id; })[0]; r = { id: id, qty: t.qty }; CUSTOM.equipment.push(r); } r[k] = +v; later(); };
    $$("[data-rq]", out).forEach(function (i) { i.onchange = function () { upR(i.dataset.rq, "qty", i.value); }; });
    $$("[data-ru]", out).forEach(function (i) { i.onchange = function () { upR(i.dataset.ru, "units", i.value); }; });
    $$("[data-eq]", out).forEach(function (i) { i.onchange = function () { upE(i.dataset.eq, "qty", i.value); }; });
    $$("[data-ed]", out).forEach(function (i) { i.onchange = function () { upE(i.dataset.ed, "days", i.value); }; });
    $("#pb-ar").onchange = function () { var v = this.value; if (!v) return; CUSTOM.remove = CUSTOM.remove.filter(function (x) { return x !== v; }); CUSTOM.roles.push({ id: v, qty: 1 }); run(false); };
    $("#pb-ae").onchange = function () { var v = this.value; if (!v) return; CUSTOM.remove = CUSTOM.remove.filter(function (x) { return x !== v; }); CUSTOM.equipment.push({ id: v, qty: 1 }); run(false); };
    $$("[data-match]", out).forEach(function (b) { b.onclick = function () { who(b.dataset.match); }; });
    $("#pb-chk").onclick = function () { var b = this; act(b, "builder/availability", { roles: T.team.map(function (x) { return x.id; }), date: ANS.date, city: ANS.city, mode: ANS.mode }, function (j) {
      $("#pb-av").innerHTML = "<p><b>" + j.covered + "/" + j.of + "</b> roles have an available FODO Pro" + (j.date ? " on " + esc(day(j.date)) : "") + ".</p><small>" + (j.covered < j.of ? "FODO staffs the rest from its network and confirms the team before you pay." : "FODO confirms each person before the team is locked.") + "</small>"; }); };
    $("#pb-save").onclick = function () { save(this).then(function (d) { if (d) toast("Draft saved."); }); };
    $("#pb-quote").onclick = function () { var b = this; save(b).then(function (d) { if (!d) return; act(b, "quotes", { buildId: d.id }, function (j) { toast("Quote requested. FODO reviews it and sends the final quote."); location.hash = "#quote=" + j.quote.id; }); }); };
    if (!keepScroll) out.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function groupOpts(L, have) { var g = {}; L.forEach(function (x) { if (have.some(function (h) { return h.id === x.id; })) return; (g[x.category] = g[x.category] || []).push(x); });
    return Object.keys(g).map(function (k) { return '<optgroup label="' + esc(k) + '">' + g[k].map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.name) + (x.rate != null ? " · " + inr(x.rate) + (x.unit ? "/" + x.unit : "/day") : "") + "</option>"; }).join("") + "</optgroup>"; }).join(""); }
  function later() { clearTimeout(timer); timer = setTimeout(function () { run(false); }, 350); }
  function save(btn) { return act(btn, "builder/drafts", { buildId: DRAFT, templateId: TPL.id, answers: ANS, tier: TIER, custom: CUSTOM }, function (j) { DRAFT = j.draft.id; }).then(function (j) { return j && j.ok ? j.draft : null; }); }
  function who(roleId) {
    var m = modal('<h2>Who could do this?</h2><div id="pb-who"><div class="ws-skel"><i></i></div></div>');
    api("builder/match", { roleId: roleId, date: ANS.date, city: ANS.city, mode: ANS.mode, budget: null }).then(function (j) { var B = $("#pb-who", m.el); if (!j.ok) { B.innerHTML = "<p>" + esc(j.reason) + "</p>"; return; }
      B.innerHTML = "<p class=\"ws-sub\">" + esc(j.role.name) + ": " + j.total + " approved FODO Pro" + (j.total === 1 ? "" : "s") + " match" + (j.total === 1 ? "es" : "") + ". FODO confirms the final team after your quote.</p>" + (j.note ? "<p>" + esc(j.note) + "</p>" : "") +
        '<ul class="ws-rows">' + j.items.map(function (x) { return "<li><b>" + esc(x.pro.name) + "</b><span>" + esc([x.pro.title, x.pro.city].filter(Boolean).join(" · ")) + "</span>" + (x.available === false ? '<i class="ws-pill">Not available</i>' : x.available ? '<i class="ws-pill ok">Available</i>' : "") +
          '<div class="pb-why"><small>Why FODO recommends this Pro</small><ul>' + x.why.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + x.notes.map(function (w) { return '<li class="no">' + esc(w) + "</li>"; }).join("") + "</ul></div></li>"; }).join("") + "</ul>"; });
  }

  /* ---------- quotes ---------- */
  var QS = { requested: "Requested, FODO is preparing it", sent: "Ready for you", viewed: "Ready for you", negotiation: "Changes requested", revised: "FODO is revising it", accepted: "Accepted", rejected: "Declined", expired: "Expired", cancelled: "Cancelled" };
  function quotes(el) {
    el.innerHTML = head("Quotes", "Quotes from FODO for the projects you built. A sent quote never changes; FODO sends a new version if anything changes.", '<div class="ws-hx"><a class="ws-btn pri" href="#project-builder">Build a team</a></div>') + '<div id="qt-l"><div class="ws-skel"><i></i></div></div>';
    api("quotes").then(function (j) { if (!$("#qt-l")) return; if (!j.ok) return fail(el, j, function () { quotes(el); });
      $("#qt-l").innerHTML = j.items.length ? '<ul class="ws-rows">' + j.items.map(function (x) { return '<li><a href="#quote=' + esc(x.id) + '"><b>' + esc(x.title) + "</b></a><span>" + esc(x.number) + " · " + (x.sent_version ? inr(x.total) : "estimate " + inr(x.total)) + '</span><i class="ws-pill">' + esc(QS[x.status] || x.status) + "</i></li>"; }).join("") + "</ul>"
        : empty("No quotes yet", "Build a team for your project and ask FODO for a quote.", '<a class="ws-btn pri" href="#project-builder">Build a team</a>'); });
  }
  function quote(el, q) {
    var id = q.get("id"); api("quotes/" + id).then(function (j) { if (!j.ok) return fail(el, j, function () { quote(el, q); }); render(el, j.quote); });
  }
  function render(el, Q) {
    var v = Q.data || {}, P = v.price || {}, open = ["sent", "viewed", "negotiation"].indexOf(Q.status) > -1;
    if (v.pending) { el.innerHTML = head(v.title || "Quote", Q.number + " · " + (QS[Q.status] || Q.status)) + empty("FODO is preparing your quote", "We check the team, availability and every line before sending. You'll get a notification when it's ready.", '<a class="ws-btn" href="#quotes">All quotes</a>'); return; }
    el.innerHTML = head(v.title, Q.number + " · version " + Q.version + " · " + (QS[Q.status] || Q.status) + (Q.expiresAt && open ? " · valid until " + day(Q.expiresAt) : ""), '<div class="ws-hx"><a class="ws-btn" href="/api/biz/quotes/' + esc(Q.id) + '/print" target="_blank" rel="noopener">Print / PDF</a><button type="button" class="ws-btn" id="qt-wa">Share summary</button></div>') +
      (v.changeNote ? '<p class="pb-warn">What changed in this version: ' + esc(v.changeNote) + "</p>" : "") +
      '<div class="ws-cards"><div class="ws-card"><small>Investment</small><b>' + inr(P.total) + "</b><small>" + (P.tax && P.tax.charged ? "incl. " + esc(P.tax.label) : esc((P.tax && P.tax.note) || "")) + '</small></div><div class="ws-card"><small>Team</small><b>' + (v.team || []).reduce(function (a, x) { return a + x.qty; }, 0) + " people</b><small>" + esc(v.tierLabel) + '</small></div><div class="ws-card"><small>Mode</small><b>' + esc(v.mode) + "</b></div>" + (v.timeline && v.timeline.date ? '<div class="ws-card"><small>Date</small><b>' + esc(day(v.timeline.date)) + "</b></div>" : "") + "</div>" +
      "<p>" + esc(v.summary) + "</p>" + ((v.deliverables || []).length ? '<h2 class="ws-h3">Deliverables</h2><ul class="pb-ul">' + v.deliverables.map(function (x) { return "<li>" + x.count + " " + esc(x.label) + "</li>"; }).join("") + "</ul>" + (v.capacity ? '<p class="ws-sub">' + esc(v.capacity) + " An estimate, not a guarantee.</p>" : "") : "") +
      '<h2 class="ws-h3">Team</h2><table class="pb-t"><thead><tr><th>Role</th><th>Qty</th><th>Time</th><th class="n">Amount</th></tr></thead><tbody>' + (v.team || []).map(function (x) { return "<tr><td>" + esc(x.role) + "</td><td>" + x.qty + "</td><td>" + esc(x.units + " " + x.unitLabel) + '</td><td class="n">' + money(x.amount) + "</td></tr>"; }).join("") + "</tbody></table>" +
      ((v.equipment || []).length ? '<h2 class="ws-h3">Equipment</h2><table class="pb-t"><tbody>' + v.equipment.map(function (x) { return "<tr><td>" + esc(x.item) + "</td><td>" + x.qty + " × " + x.days + (x.days === 1 ? " day" : " days") + '</td><td class="n">' + money(x.amount) + "</td></tr>"; }).join("") + "</tbody></table>" : "") +
      '<h2 class="ws-h3">Investment</h2><table class="pb-t"><tbody>' + (P.groups || []).map(function (g) { return "<tr><td>" + esc(g.label) + '</td><td class="n">' + inr(g.amount) + "</td></tr>"; }).join("") + '<tr><td>Subtotal</td><td class="n">' + inr(P.subtotal) + "</td></tr><tr><td>" + esc((P.tax || {}).label) + '</td><td class="n">' + ((P.tax || {}).charged ? inr(P.tax.amount) : "Not charged") + '</td></tr><tr class="pb-total"><td>Total</td><td class="n">' + inr(P.total) + "</td></tr></tbody></table>" +
      '<h2 class="ws-h3">Payment schedule</h2><ul class="ws-rows">' + (v.schedule || []).map(function (s) { return "<li><b>" + esc(s.label) + "</b><span>" + s.pct + "%</span><span>" + inr(s.amount) + "</span></li>"; }).join("") + "</ul>" +
      '<details class="ws-fold"><summary>Assumptions, exclusions and terms</summary><h3 class="ws-h3">Assumptions</h3><ul class="pb-ul">' + (v.assumptions || []).map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + '</ul><h3 class="ws-h3">Not included</h3><ul class="pb-ul">' + (v.exclusions || []).map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>" + ((v.warnings || []).length ? '<h3 class="ws-h3">Please note</h3><ul class="pb-ul">' + v.warnings.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>" : "") + "<p>" + esc(v.terms) + "</p>" + (v.usage ? "<p>Usage rights: " + esc(v.usage) + "</p>" : "") + "</details>" +
      (Q.versions && Q.versions.length > 1 ? '<p class="ws-sub">Versions sent: ' + Q.versions.map(function (x) { return "v" + x.version + " (" + inr(x.total) + ")"; }).join(", ") + "</p>" : "") +
      '<div class="pb-dl"><a class="ws-link" href="/api/biz/quotes/' + esc(Q.id) + '/csv">CSV</a> · <a class="ws-link" href="/api/biz/quotes/' + esc(Q.id) + '/json">JSON</a></div>' +
      (open ? '<div class="pb-accept" role="group" aria-label="Your answer"><h2 class="ws-h3">Your answer</h2>' + (Q.status === "negotiation" ? "<p>You asked for changes. FODO will send a new version; you can still accept this one.</p>" : "") + '<label class="ws-ck"><input type="checkbox" id="qt-agree"> I agree to this quote (version ' + Q.version + '), its assumptions and terms.</label><div class="ws-acts"><button type="button" class="ws-btn pri" id="qt-acc">Accept quote</button><button type="button" class="ws-btn" id="qt-chg">Request changes</button><button type="button" class="ws-btn danger" id="qt-dec">Decline</button></div><small>Accepting doesn\'t charge you. FODO confirms the team, then sends the contract and the payment schedule.</small></div>' : "") +
      (Q.status === "accepted" ? '<p class="ws-pill ok">Accepted on ' + esc(day(Q.acceptedAt)) + " (version " + Q.acceptedVersion + "). FODO is confirming the team and will send the contract and payment schedule.</p>" : "");
    $("#qt-wa").onclick = function () { fetch("/api/biz/quotes/" + Q.id + "/summary", { credentials: "same-origin" }).then(function (r) { return r.text(); }).then(function (t) {
      modal('<h2>Share summary</h2><textarea class="pb-sum" rows="14" readonly>' + esc(t) + '</textarea><div class="ws-acts"><button type="button" class="ws-btn" id="qt-cp">Copy</button><a class="ws-btn pri" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(t) + '">Open WhatsApp</a></div>', function (m) { $("#qt-cp", m).onclick = function () { try { navigator.clipboard.writeText(t).then(function () { toast("Copied."); }); } catch (e) { toast("Select the text and copy it.", true); } }; }); }); };
    if (open) {
      $("#qt-acc").onclick = function () { if (!$("#qt-agree").checked) { toast("Tick that you agree first.", true); $("#qt-agree").focus(); return; } act(this, "quotes/" + Q.id + "/accept", { version: Q.version, agree: true }, function (j) { toast("Quote accepted. FODO will be in touch."); render(el, j.quote); }); };
      $("#qt-chg").onclick = function () { var b = this; modal('<h2>Request changes</h2><form class="ws-form" id="qt-cf"><label class="ws-f" for="qt-cn"><span>What should FODO change?</span><textarea id="qt-cn" rows="4" maxlength="2000" required></textarea></label><div class="ws-acts"><button class="ws-btn pri" type="submit">Send</button></div></form>', function (m, close) { $("#qt-cf", m).onsubmit = function (e) { e.preventDefault(); act(b, "quotes/" + Q.id + "/changes", { note: $("#qt-cn", m).value }, function (j) { close(); toast("Sent to FODO."); render(el, j.quote); }); }; }); };
      $("#qt-dec").onclick = function () { var r = prompt("Why are you declining? (optional, helps FODO)"); if (r === null) return; act(this, "quotes/" + Q.id + "/decline", { reason: r }, function (j) { render(el, j.quote); }); };
    }
  }
  window.FODO_WS_BUILDER = { "project-builder": builder, quotes: quotes, quote: quote, renderQuote: render };
})();
