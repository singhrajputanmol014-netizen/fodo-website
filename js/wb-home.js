/* FODO Website Builder v38, home. One composition for signed-in and signed-out visitors:
   builder nav (search ⌘K) → hero with the AI creation workspace + a live website preview → continue designing (your real
   websites, rendered) → featured designs → industries → the template gallery → what FODO does. Everything shown is real:
   previews are the actual templates rendered, counts come from the data, every button runs the real flow. */
import { renderPage, esc } from "/sites/lib/render.js";
import { CATEGORIES, catsOf } from "/sites/lib/families.js";
import { GOALS } from "/sites/lib/industry.js";
import { STYLES } from "/sites/lib/design.js";
import * as CR from "/js/wb-create.js";
import { openPalette, bindKey, track } from "/js/wb-palette.js";

const $ = (s, el) => (el || document).querySelector(s), $$ = (s, el) => [...(el || document).querySelectorAll(s)];
const ago = (iso) => { const s = Math.round((Date.now() - Date.parse(iso)) / 1000); return s < 60 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " d ago"; };
const RM = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
export const EXAMPLES = ["A modern website for a luxury dental clinic in Delhi with online appointment booking",
  "A premium restaurant website with a seasonal menu and table reservations", "A SaaS landing page with pricing and a free trial",
  "A portfolio for a filmmaker with showreel and selected work", "A gym website with class timings and a free trial offer", "An online store for handmade jewellery"];
const SHORT = ["Dental clinic", "Premium restaurant", "SaaS landing page", "Filmmaker portfolio", "Gym & fitness", "Online store"];   // same order as EXAMPLES
const PROMISES = [["✦", "AI-built, you stay in control", "FODO plans the pages, writes the first draft and you change anything visually."], ["▭", "Responsive by default", "Desktop, laptop, tablet and phone, with checks that find layout problems."], ["⌕", "SEO-ready", "Titles, descriptions, schema, sitemap and Search Console verification."], ["↗", "Built to convert", "Clear calls to action, booking and enquiry forms, WhatsApp."], ["▤", "Real analytics", "Visits, sources, button clicks and enquiries. Nothing estimated."], ["⌂", "Your domain", "Connect a domain with the DNS assistant; SSL included."]];
const INDUSTRY_TILES = [["restaurant", "Restaurants", "🍽"], ["dental", "Dental", "🦷"], ["fitness", "Fitness", "🏋"], ["realestate", "Real estate", "🏠"], ["agency", "Agencies", "◆"], ["tech", "SaaS & tech", "⌘"], ["beauty", "Salon & beauty", "✂"], ["portfolio", "Portfolios", "▣"]];

/* ---------- hero: AI creation workspace + live preview ---------- */
export function aiBox(o) {
  o = o || {};
  return '<form class="wbh-ai" id="' + (o.formId || "wbh-ai") + '" novalidate><label class="wbh-ail" for="' + (o.inputId || "wbh-pt") + '"><span class="wbh-spark" aria-hidden="true">✦</span> What do you want to build?</label>' +
    '<textarea id="' + (o.inputId || "wbh-pt") + '" rows="3" maxlength="600" placeholder="' + esc(EXAMPLES[0]) + '">' + esc(o.value || "") + "</textarea>" +
    '<div class="wbh-aio"><label><span class="sr">Main goal</span><select id="wbh-goal" aria-label="Main goal"><option value="">Goal: decide for me</option>' + GOALS.map((g) => "<option>" + esc(g) + "</option>").join("") + '</select></label><label><span class="sr">Style</span><select id="wbh-style" aria-label="Visual style"><option value="">Style: recommend one</option>' + Object.keys(STYLES).map((k) => '<option value="' + k + '">' + esc(STYLES[k].name) + "</option>").join("") + "</select></label>" +
    '<button class="wb-btn pri wbh-go" id="' + (o.buttonId || "wbh-go") + '" type="submit"><span aria-hidden="true">✦</span> ' + esc(o.buttonLabel || "Create with AI") + "</button></div></form>" +
    '<div class="wbh-ex" role="group" aria-label="Example prompts">' + SHORT.map((s, i) => '<button type="button" data-ex="' + i + '">' + esc(s) + "</button>").join("") + "</div>";
}
export function wireAi(root, onGo, o) {
  o = o || {}; const f = $("#" + (o.formId || "wbh-ai"), root), t = $("#" + (o.inputId || "wbh-pt"), root); if (!f || !t) return;
  const go = () => { const q = t.value.trim(); if (!q) { t.focus(); f.classList.add("wbh-shake"); setTimeout(() => f.classList.remove("wbh-shake"), 400); return; } track("wb_ai_generation_started", ($("#wbh-style", root) || {}).value || "prompt"); onGo({ prompt: q, goal: ($("#wbh-goal", root) || {}).value || "", style: ($("#wbh-style", root) || {}).value || "" }); };
  f.onsubmit = (e) => { e.preventDefault(); go(); }; t.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); } };
  $$("[data-ex]", root).forEach((b) => { b.onclick = () => { t.value = EXAMPLES[+b.dataset.ex]; t.focus(); track("wb_example_prompt", SHORT[+b.dataset.ex]); }; });
  f.addEventListener("pointermove", (e) => { const r = f.getBoundingClientRect(); f.style.setProperty("--mx", ((e.clientX - r.left) / r.width * 100).toFixed(1) + "%"); f.style.setProperty("--my", ((e.clientY - r.top) / r.height * 100).toFixed(1) + "%"); });
  if (!RM()) typePlaceholder(t);
}
function typePlaceholder(t) {   // types example prompts into the placeholder while the box is empty and not focused
  let i = 0, n = 0, dir = 1, wait = 0; const tick = () => { if (!t.isConnected) return; if (document.activeElement === t || t.value) { setTimeout(tick, 800); return; }
    const s = EXAMPLES[i]; if (wait > 0) { wait--; } else { n += dir; if (n >= s.length) { dir = -1; wait = 40; } else if (n <= 0) { dir = 1; i = (i + 1) % EXAMPLES.length; wait = 6; } }
    t.setAttribute("placeholder", s.slice(0, Math.max(0, n)) + (n < s.length ? "▍" : "")); setTimeout(tick, dir > 0 ? 38 : 14); };
  setTimeout(tick, 1200);
}
export function heroVisual() {
  return '<div class="wbh-vis" aria-hidden="true"><div class="wbh-glow"></div><div class="wbh-frame"><div class="wbh-chrome"><i></i><i></i><i></i><span id="wbh-url">your-business.fodo.site</span></div><div class="wbh-screen"><iframe tabindex="-1" sandbox="" class="on"></iframe><iframe tabindex="-1" sandbox=""></iframe></div></div>' +
    '<span class="wbh-tag t1">✦ AI-written first draft</span><span class="wbh-tag t2">▭ Responsive</span><span class="wbh-tag t3">⌕ SEO-ready</span><span class="wbh-tag t4">↗ Conversion-focused</span><span class="wbh-cap" id="wbh-cap"></span></div>';
}
export function wireVisual(root) {
  const L = CR.featured().slice(0, 6); if (!L.length) return; const fr = $$(".wbh-screen iframe", root), cap = $("#wbh-cap", root), url = $("#wbh-url", root); if (fr.length < 2) return;
  let k = 0, front = 0; const show = () => { const t = L[k % L.length], f = fr[1 - front]; f.srcdoc = CR.render(t, "home"); f.onload = () => { f.classList.add("on"); fr[front].classList.remove("on"); front = 1 - front; }; if (cap) cap.textContent = t.name; if (url) url.textContent = t.family ? t.family.replace(/[^a-z]/g, "") + ".fodo.site" : "your-business.fodo.site"; k++; };
  show(); if (RM()) return; const iv = setInterval(() => { if (!fr[0].isConnected) return clearInterval(iv); if (document.visibilityState === "visible") show(); }, 6500);
}

/* ---------- shared pieces ---------- */
const navBar = (j, mine) => '<header class="wbh-nav"><a class="wbh-brand" href="/" aria-label="FODO home"><b>FODO</b><span>Website Builder</span></a><nav aria-label="Builder"><a href="/workspace/">Workspace</a><a href="#" data-jump="wbh-gal">Templates</a>' + (j ? (mine ? '<a href="#" data-jump="wbh-mine">My websites</a>' : "") + '<a href="#archived=1">Archived</a>' : "") + '<a href="/help/">Help</a></nav>' +
  '<button type="button" class="wbh-search" id="wbh-search" aria-label="Search (Ctrl+K)"><span aria-hidden="true">⌕</span> Search templates, websites…<kbd>Ctrl K</kbd></button>' + (j ? '<button class="wb-btn pri" id="wb-new">+ New website</button>' : '<button class="wb-btn pri" id="wbh-login">Start free</button>') + "</header>";
function bento(list) {   // 1 large + 4 small
  return '<div class="wbh-bento">' + list.slice(0, 5).map((t, i) => '<article class="wbh-tc' + (i === 0 ? " big" : "") + '" data-id="' + esc(t.id) + '"><div class="wbh-tv"><iframe tabindex="-1" aria-hidden="true" sandbox="" loading="lazy"></iframe></div><div class="wbh-ov">' + (t.free ? '<span class="wb-tier free">Free</span>' : "") + '<b>' + esc(t.name) + "</b><small>" + esc(t.category) + " · " + esc((STYLES[t.theme.style] || {}).name || "Original") + " · " + t.pages.length + ' pages</small><span><button type="button" class="wb-btn sm" data-pv="' + esc(t.id) + '">Preview</button><button type="button" class="wb-btn sm pri" data-use="' + esc(t.id) + '">Use template</button></span></div></article>').join("") + "</div>";
}
function fillPreviews(root) {
  const io = "IntersectionObserver" in window ? new IntersectionObserver((es) => es.forEach((e) => { if (!e.isIntersecting) return; io.unobserve(e.target); fill(e.target); }), { rootMargin: "200px" }) : null;
  const fill = (el) => { const t = CR.byId(el.dataset.id); if (t) el.querySelector("iframe").srcdoc = CR.render(t, "home"); };
  $$(".wbh-tc", root).forEach((el) => (io ? io.observe(el) : fill(el)));
}
function industryTiles() {
  const all = CR.all(); return '<div class="wbh-inds">' + INDUSTRY_TILES.map((x) => '<button type="button" data-cat="' + x[0] + '"><span aria-hidden="true">' + x[2] + "</span><b>" + esc(x[1]) + "</b><small>" + all.filter((t) => catsOf(t).indexOf(x[0]) > -1).length + " templates</small></button>").join("") + "</div>";
}
const promises = () => '<div class="wbh-prom">' + PROMISES.map((p) => '<div><span aria-hidden="true">' + p[0] + "</span><b>" + esc(p[1]) + "</b><p>" + esc(p[2]) + "</p></div>").join("") + "</div>";

/* ---------- the page ---------- */
export async function home(root, opts) {
  opts = opts || {}; const X = CR.ctx(), signedIn = !!X.me(), arch = opts.tab === "archived";
  root.innerHTML = '<div class="wbh">' + navBar(signedIn) + '<div class="wb-pad"><div class="wbh-skel"><i></i><i></i><i></i></div></div></div>';
  let j = { sites: [], limits: null };
  if (signedIn) { j = await X.api("list?all=1" + (arch ? "&archived=1" : "")); if (!j.ok) return errorState(root, j, () => home(root, opts)); X.setCfg(j); }
  const sites = j.sites || [], feat = CR.featured(), total = CR.all().length;
  const live = (s) => (j.sitesHost ? "https://" + j.sitesHost + "/" + s.slug + "/" : "/api/sites/view/" + s.slug + "/");
  const RV = { ready: "In review", changes: "Changes requested", approved: "Approved" };
  const card = (s) => '<article class="wbh-pc"><div class="wbh-pthumb"><div class="wbh-chrome sm"><i></i><i></i><i></i><span>' + esc(s.domain || s.slug + ".fodo.site") + '</span></div><div class="wbh-pscreen">' + (s.thumb ? '<iframe tabindex="-1" aria-hidden="true" sandbox="" loading="lazy" data-th="' + s.id + '"></iframe>' : "") + '</div><span class="wbh-badge ' + (s.status === "live" ? "live" : "draft") + '">' + (s.status === "live" ? "● Live" : "○ Draft") + "</span></div>" +
    '<div class="wbh-pb"><h3>' + esc(s.name) + "</h3><p>" + esc(s.industry || "Website") + " · " + s.pages + " pages · edited " + ago(s.updated_at) + (s.review && RV[s.review] ? " · " + RV[s.review] : "") + (s.owner_email ? " · " + esc(s.owner_email) : "") + '</p><div class="wbh-pa">' +
    (arch ? '<button class="wb-btn sm pri" data-res="' + s.id + '">Restore</button>' : '<a class="wb-btn sm pri" href="#site=' + s.id + '">' + (s.status === "live" ? "Open editor" : "Continue") + " →</a>" + (s.status === "live" ? '<a class="wb-btn sm" href="' + esc(live(s)) + '" target="_blank" rel="noopener">View live</a>' : '<a class="wb-btn sm" href="#site=' + s.id + '&preview=1">Preview</a>') + '<button class="wb-ib sm" data-more="' + s.id + '" aria-label="More actions for ' + esc(s.name) + '">⋯</button>') + "</div></div></article>";
  const heroTitle = signedIn && sites.length && !arch ? "Pick up where you left off, or build something new." : "Build something people remember.";
  root.innerHTML = '<div class="wbh">' + navBar(signedIn, sites.length && !arch) +
    (arch ? '<section class="wb-pad wbh-sec"><div class="wbh-h"><h2>Archived websites</h2><a class="wb-btn sm" href="#">← Back</a></div>' + (sites.length ? '<div class="wbh-pgrid">' + sites.map(card).join("") + "</div>" : '<p class="wb-muted">No archived websites.</p>') + "</section>"
      : '<section class="wbh-hero"><div class="wbh-copy wbm-stagger"><p class="wb-eyebrow">' + (j.owner ? "FODO OWNER · ALL WEBSITES" : "FODO WEBSITE BUILDER") + "</p><h1>" + esc(heroTitle) + '</h1><p class="wbh-lead">Create a high-converting website with AI, start from ' + total + ' designs, or take complete creative control.</p>' + aiBox() +
        '<div class="wbh-alt"><button type="button" class="wbh-link" data-jump="wbh-gal">▦ Browse templates</button><button type="button" class="wbh-link" data-path="import">⇩ Import a website</button><button type="button" class="wbh-link" data-path="blank">□ Start blank</button><button type="button" class="wbh-link" data-path="guided">☰ Step by step</button></div></div>' + heroVisual() + "</section>" +
        (sites.length ? '<section class="wb-pad wbh-sec" id="wbh-mine"><div class="wbh-h"><h2>Continue designing <small>' + sites.length + "</small></h2></div><div class=\"wbh-pgrid\">" + sites.map(card).join("") + "</div></section>" : "") +
        '<section class="wb-pad wbh-sec"><div class="wbh-h"><h2>Featured designs</h2><button type="button" class="wb-btn sm" data-jump="wbh-gal">All ' + total + " templates →</button></div>" + bento(feat) + "</section>" +
        (!sites.length ? '<section class="wb-pad wbh-sec"><div class="wbh-h"><h2>Popular industries</h2></div>' + industryTiles() + "</section>" : "") +
        '<section class="wb-pad wbh-sec" id="wbh-gal"><div class="wbh-h"><h2>Explore templates</h2><p class="wb-muted">Every design is a complete, editable website with real pages. Reviews and numbers stay placeholders until you add real ones.</p></div><div id="wb-gal"></div></section>' +
        (!sites.length ? '<section class="wb-pad wbh-sec"><div class="wbh-h"><h2>What FODO does for you</h2></div>' + promises() + "</section>" : "") +
        (j.limits ? '<div class="wb-pad"><div class="wbh-plan"><div><small>YOUR BUILDER PLAN</small><b>' + esc(j.limits.tierName || "Builder") + "</b><span>" + (j.limits.owner ? "Everything unlocked" : j.limits.sites + " website" + (j.limits.sites === 1 ? "" : "s") + " · " + j.limits.pages + " pages each · " + (j.limits.allTemplates ? "every template" : "free templates") + " · " + j.limits.domains + " custom domain" + (j.limits.domains === 1 ? "" : "s")) + "</span></div>" + (j.limits.owner ? '<button type="button" class="wb-btn sm" id="wbh-health">Builder system health</button>' : "") + (!j.limits.owner && (j.limits.tier === "free" || j.limits.tier === "builder") ? '<a class="wb-btn sm pri" href="/plans/#builder">' + (j.limits.tier === "free" ? "Unlock every template" : "Get more websites") + "</a>" : "") + "</div></div>" : "")) + "</div>";
  // previews of your websites
  $$("[data-th]", root).forEach((f) => { const s = sites.find((x) => x.id === f.dataset.th); try { f.srcdoc = renderPage(s.thumb, (s.thumb.pages[0] || {}).slug, { base: "#", badge: false, noMotion: true }).replace(/<script(?![^>]*ld\+json)[\s\S]*?<\/script>/g, ""); } catch (e) {} });
  const start = (state) => { if (!signedIn) return X.login("Log in to build your website, it's free to start.").then(() => { try { sessionStorage.setItem("wb-start", JSON.stringify(state)); } catch (e) {} location.hash = "new=1"; }).catch(() => {}); try { sessionStorage.setItem("wb-start", JSON.stringify(state)); } catch (e) {} location.hash = "new=1"; };
  const useTpl = (t, v) => CR.guardUse(t, () => { track("wb_template_selected", t.id); start({ templateId: t.id, variant: v || null }); });
  if (!arch) { wireAi(root, (o) => start({ prompt: o.prompt, goal: o.goal, style: o.style })); wireVisual(root); fillPreviews(root);
    CR.gallery($("#wb-gal", root), { onUse: useTpl, paged: true }); }
  $$("[data-jump]", root).forEach((b) => { b.onclick = (e) => { e.preventDefault(); const el = document.getElementById(b.dataset.jump); if (el) el.scrollIntoView({ behavior: RM() ? "auto" : "smooth", block: "start" }); }; });
  $$("[data-path]", root).forEach((b) => { b.onclick = () => start({ path: b.dataset.path }); });
  $$("[data-cat]", root).forEach((b) => { b.onclick = () => { CR.gallery($("#wb-gal", root), { onUse: useTpl, paged: true, filter: { group: b.dataset.cat } }); $("#wbh-gal").scrollIntoView({ behavior: RM() ? "auto" : "smooth" }); }; });
  $$(".wbh-bento [data-pv]", root).forEach((b) => { b.onclick = () => { track("wb_template_previewed", b.dataset.pv); CR.preview(CR.byId(b.dataset.pv), useTpl); }; });
  $$(".wbh-bento [data-use]", root).forEach((b) => { b.onclick = () => useTpl(CR.byId(b.dataset.use)); });
  const full = j.limits && !j.limits.owner && !arch && sites.length >= j.limits.sites;   // v39: say so before the wizard, not after it
  if ($("#wb-new", root)) $("#wb-new", root).onclick = () => { if (full) return CR.upsell(null, "Your " + (j.limits.tierName || "plan") + " allows " + j.limits.sites + " website" + (j.limits.sites === 1 ? "" : "s") + ". Archive or delete one, or upgrade for more."); location.hash = "new=1"; };
  if ($("#wbh-login", root)) $("#wbh-login", root).onclick = () => start({});
  $$("[data-res]", root).forEach((b) => { b.onclick = async () => { const r = await X.api(b.dataset.res + "/archive", "POST", { on: false }); if (r.ok) { X.toast("Restored."); home(root, opts); } }; });
  CR.siteMenu(root, sites, () => home(root, opts));
  if ($("#wbh-health", root)) $("#wbh-health", root).onclick = healthPanel;
  // search / command palette
  const pal = () => palette({ sites, signedIn, start, useTpl, root });
  $("#wbh-search", root).onclick = pal; if (window.__wbhKey) window.__wbhKey(); window.__wbhKey = bindKey(() => { if (!document.querySelector(".wb-pal-ov") && !location.hash.match(/site=/)) pal(); });
}
function palette(c) {
  track("wb_palette_used", "home");
  openPalette([
    (q) => [["✦", "Create a website with AI", () => { const t = document.getElementById("wbh-pt"); if (t) { t.value = q || ""; t.focus(); t.scrollIntoView({ block: "center" }); } }, "describe it"], ["▦", "Browse all templates", () => document.getElementById("wbh-gal").scrollIntoView(), ""], ["⇩", "Import an existing website", () => c.start({ path: "import" }), "rebuild it in FODO"], ["□", "Start from blank", () => c.start({ path: "blank" }), ""], ["☰", "Create step by step", () => c.start({ path: "guided" }), "guided"]]
      .concat(c.signedIn ? [["🗄", "Archived websites", () => { location.hash = "archived=1"; }, ""]] : []).map((x) => ({ group: "Commands", icon: x[0], label: x[1], run: x[2], hint: x[3], always: !q })),
    (q) => c.sites.map((s) => ({ group: "Your websites", icon: s.status === "live" ? "●" : "○", label: s.name, hint: (s.industry || "") + " · " + (s.status === "live" ? "live" : "draft"), keys: s.slug + " " + (s.domain || ""), run: () => { location.hash = "site=" + s.id; } })),
    (q) => (q ? CR.all().map((t) => ({ group: "Templates", icon: "▦", label: t.name, hint: t.category + " · " + ((STYLES[t.theme.style] || {}).name || "Original"), keys: t.tags.join(" "), run: () => { track("wb_template_previewed", t.id); CR.preview(t, c.useTpl); } })) : []),
    (q) => (q ? CATEGORIES.filter((x) => x[0] !== "all").map((x) => ({ group: "Industries", icon: "◇", label: x[1] + " templates", hint: CR.all().filter((t) => catsOf(t).indexOf(x[0]) > -1).length + " designs", run: () => { CR.gallery(document.getElementById("wb-gal"), { onUse: c.useTpl, paged: true, filter: { group: x[0] } }); document.getElementById("wbh-gal").scrollIntoView(); } })) : []),
    (q) => (q ? Object.keys(STYLES).map((k) => ({ group: "Styles", icon: "◐", label: STYLES[k].name + " style", hint: STYLES[k].desc, run: () => { CR.gallery(document.getElementById("wb-gal"), { onUse: c.useTpl, paged: true, filter: { style: k } }); document.getElementById("wbh-gal").scrollIntoView(); } })) : []),
  ], { empty: "Press Enter on “Create a website with AI” to build exactly that." });
}
/* v39 Builder System Health. versionCheck: if this page or its template list is older than the deployed one (a cached page or a
   half-finished deploy), say so and offer a reload, never show a wrong template count. healthPanel: owner-only diagnostics. */
const BUILD = () => { const m = document.querySelector('meta[name="fodo-build"]'); return m ? m.content : ""; };
export async function versionCheck() {
  try {
    const [b, v] = await Promise.all([fetch("/data/build.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)), fetch("/api/sites/version", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))]);
    const staticN = CR.all().filter((t) => !t.custom && !/^ct_/.test(t.id)).length, stale = (b && BUILD() && b.build !== BUILD()) || (v && v.templates && v.templates !== staticN);
    window.__wbVersion = { page: BUILD(), deployed: b, server: v, clientTemplates: staticN, stale: !!stale };
    if (!stale || document.querySelector(".wb-stale")) return;
    const d = document.createElement("div"); d.className = "wb-stale"; d.setAttribute("role", "status");
    d.innerHTML = "<b>A newer version of the Website Builder is live.</b> <span>" + (v && v.templates ? v.templates + " templates are available" : "Reload to get the latest") + ', your work is saved on the server.</span><button type="button" class="wb-btn sm pri">Reload</button>';
    d.querySelector("button").onclick = () => { location.reload(); }; document.body.appendChild(d);
  } catch (e) {}
}
export async function healthPanel() {
  const X = CR.ctx(), j = await X.api("system-health"); const V = window.__wbVersion || {};
  const m = document.createElement("div"); m.className = "wb-modal"; m.setAttribute("role", "dialog"); m.setAttribute("aria-label", "Builder system health");
  const row = (k, v, ok) => "<li" + (ok === false ? ' class="bad"' : "") + "><span>" + esc(k) + "</span><b>" + esc(String(v == null ? "unknown" : v)) + "</b></li>";
  m.innerHTML = '<div class="wb-mc wb-health"><div class="wbh-h"><h2>Builder system health</h2><button type="button" class="wb-ib" data-x aria-label="Close">×</button></div>' + (j.ok ? '<ul class="wb-hl">' +
    row("This page's build", V.page || "unknown") + row("Deployed build", j.deploy ? j.deploy.build + " (" + j.deploy.builtAt + ")" : "unknown", j.deploy ? j.deploy.build === V.page : null) +
    row("API version", j.api) + row("Templates on the server", j.templates) + row("Templates in this page", V.clientTemplates, V.clientTemplates === j.templates) + row("Template registry", j.registry) + row("Free templates", j.freeTemplates) + row("Environment", j.environment) +
    row("Cache status", V.stale ? "STALE: reload needed" : "Fresh", !V.stale) + j.checks.map((c) => row(c.name, (c.ok ? "OK" : "Not ready") + (c.detail ? " · " + c.detail : ""), c.ok)).join("") + "</ul>" + "<h3>Errors people hit (latest 20)</h3>" + ((j.clientErrors || []).length ? '<ul class="wb-hl">' + j.clientErrors.map((x) => row(x.msg + " · " + x.src, x.n + "× · " + x.ua + " · build " + x.build + " · last " + String(x.last_at).slice(0, 16).replace("T", " "), false)).join("") + "</ul>" : '<p class="wb-muted">No errors reported.</p>') : '<p class="wb-muted">' + esc(j.reason || "Could not load.") + "</p>") + "</div>";
  document.body.appendChild(m); m.addEventListener("click", (e) => { if (e.target === m || e.target.closest("[data-x]")) m.remove(); });
}
/* premium error state: never a blank screen, never "Internal Server Error" */
export function errorState(root, r, retry) {
  root.innerHTML = '<div class="wbh-err" role="alert"><span aria-hidden="true">◌</span><h2>We hit a problem.</h2><p>' + (r && r.offline ? "You seem to be offline." : "Your work is safe, nothing was lost.") + "</p><p class=\"wb-muted\">" + esc((r && r.reason) || "The server didn't answer.") + '</p><div class="wb-row"><button class="wb-btn pri" id="wbh-retry">Try again</button><a class="wb-btn" href="/website-builder/">Go back</a><a class="wb-btn" href="/contact/">Contact support</a></div></div>';
  $("#wbh-retry", root).onclick = retry;
}
