/* FODO Website Builder v34: responsive editing, Make Responsive (preview → Accept / Reject), Responsive Health, save
   conflicts, offline saving, canvas zoom / grid. Everything edits the site document through ctx.change(), so undo/redo,
   autosave and versions keep working exactly as before. Nothing here talks to the server except through ctx.api. */
import { renderPage, SECTION_LABELS, RESP, BREAKPOINTS, esc } from "/sites/lib/render.js";
import { modal } from "/js/wb-panels.js";

let X = null; export function bind(ctx) { X = ctx; }
const $ = (s, el) => (el || document).querySelector(s), $$ = (s, el) => [...(el || document).querySelectorAll(s)];
export const DEVICES = [["desktop", "▭", "Desktop", null], ["laptop", "⊟", "Laptop", 1280], ["tablet", "▯", "Tablet", 820], ["mobile", "▮", "Mobile", 390]];
/* which style layer a device edits: desktop + laptop edit the base, tablet/mobile edit their own overrides */
export const layerOf = (dev) => (dev === "tablet" ? "tablet" : dev === "mobile" ? "mobile" : "base");
const LAYER_NOTE = { base: "Desktop is the base design. Tablet and mobile start from it.", tablet: "Changes here apply to tablets and smaller. Desktop is not affected.", mobile: "Changes here apply to phones only. Desktop and tablet are not affected." };
const opt = (L, v) => L.map((x) => '<option value="' + esc(x[0]) + '"' + (String(x[0]) === String(v == null ? "" : v) ? " selected" : "") + ">" + esc(x[1]) + "</option>").join("");

/* ---------------- Style tab, tablet / mobile layer ---------------- */
export function respPanel(el, sec, onDone) {
  const ED = X.ED(), layer = layerOf(ED.dev), st = sec.style || {}, o = (st[layer] || {}), base = st, tab = st.tablet || {};
  const from = (k) => (layer === "mobile" && tab[k] != null && tab[k] !== "" ? "tablet" : "desktop");
  const inherit = (k, fmt) => { const v = layer === "mobile" && tab[k] != null && tab[k] !== "" ? tab[k] : base[k]; return "Inherits from " + from(k) + (v != null && v !== "" ? ": " + (fmt ? fmt(v) : v) : ""); };
  const row = (k, label, L, fmt) => '<label class="wb-lab">' + label + (o[k] != null && o[k] !== "" ? ' <button type="button" class="wb-reset" data-rk="' + k + '">Reset</button>' : "") + '<select data-rs="' + k + '">' + opt([["", "Same as " + from(k)]].concat(L), o[k]) + '</select><small class="wb-inh">' + esc(o[k] != null && o[k] !== "" ? "Overridden on " + layer : inherit(k, fmt)) + "</small></label>";
  el.innerHTML = '<div class="wb-bp wb-bp-' + layer + '"><b>Editing: ' + { tablet: "Tablet", mobile: "Mobile" }[layer] + "</b><span>" + LAYER_NOTE[layer] + "</span></div>" +
    row("pad", "Spacing", [["none", "None"], ["s", "Small"], ["l", "Large"], ["xl", "Extra large"]]) +
    row("fs", "Text size", RESP.fs.map((n) => [n, n + "%"]), (v) => v + "%") +
    row("cols", "Columns (cards, grids, hero)", RESP.cols.map((n) => [n, n + (n === 1 ? " column" : " columns")])) +
    row("align", "Text alignment", [["left", "Left"], ["center", "Centre"]]) +
    row("width", "Width", [["narrow", "Narrow"], ["wide", "Wide"], ["full", "Full width"]]) +
    row("gap", "Gap between cards", [["s", "Tight"], ["l", "Loose"]]) +
    '<label class="wb-ck"><input type="checkbox" data-rb="stack"' + (o.stack ? " checked" : "") + "> Stack buttons full-width</label>" +
    '<label class="wb-ck"><input type="checkbox" data-rb="hide"' + (o.hide === true ? " checked" : "") + "> Hide this section on " + layer + "</label>" +
    '<div class="wb-row" style="margin-top:10px"><button class="wb-btn sm pri" id="rs-auto">✦ Make this section responsive</button></div>';
  const set = (k, v) => X.change(() => { sec.style = sec.style || {}; const L = (sec.style[layer] = Object.assign({}, sec.style[layer] || {})); if (v === "" || v == null || v === false) delete L[k]; else L[k] = v; if (!Object.keys(L).length) delete sec.style[layer]; });
  $$("[data-rs]", el).forEach((s) => { s.onchange = () => { const k = s.dataset.rs, v = s.value; set(k, v === "" ? "" : (k === "fs" || k === "cols" ? +v : v)); respPanel(el, sec, onDone); }; });
  $$("[data-rk]", el).forEach((b) => { b.onclick = () => { set(b.dataset.rk, ""); respPanel(el, sec, onDone); }; });
  $$("[data-rb]", el).forEach((c) => { c.onchange = () => { set(c.dataset.rb, c.checked ? true : ""); respPanel(el, sec, onDone); }; });
  $("#rs-auto", el).onclick = () => makeResponsive({ only: X.ED().sel });
}

/* ---------------- measuring: the real renderer in a hidden sandboxed frame at an exact width ---------------- */
const DETECT = "<script>(function(){function go(){var vw=innerWidth,out=[],seen={};function add(i,k,px,m){var key=i+'|'+k;if(seen[key])return;seen[key]=1;out.push({i:i,kind:k,px:Math.round(px||0),msg:m})}" +
  "[].forEach.call(document.querySelectorAll('[data-sec]'),function(s){var i=+s.getAttribute('data-sec'),cs=getComputedStyle(s);if(cs.display==='none')return;" +
  "if(s.scrollWidth>vw+2)add(i,'overflow',s.scrollWidth-vw,'wider than the screen by '+(s.scrollWidth-vw)+'px');" +
  "[].forEach.call(s.querySelectorAll('img,video,iframe'),function(m){var r=m.getBoundingClientRect();if(r.width>vw+2||r.right>vw+2)add(i,'image',r.right-vw,'an image or video is wider than the screen');if(m.naturalWidth&&r.width&&r.height){var a=m.naturalWidth/m.naturalHeight,b=r.width/r.height,f=getComputedStyle(m).objectFit;if(Math.abs(a-b)/a>.2&&f!=='cover'&&f!=='contain')add(i,'aspect',0,'an image looks stretched (aspect ratio)')}});" +
  "[].forEach.call(s.querySelectorAll('.btn,button'),function(b){var r=b.getBoundingClientRect();if(r.right>vw+2)add(i,'button',r.right-vw,'a button is wider than the screen');else if(r.height>64&&r.width<vw*.9)add(i,'btnwrap',0,'button text wraps onto two lines')});" +
  "[].forEach.call(s.querySelectorAll('h1,h2,h3,p,li,a'),function(t){if(t.scrollWidth>t.clientWidth+2&&t.clientWidth>0)add(i,'text',t.scrollWidth-t.clientWidth,'text runs out of its box')});" +
  "[].forEach.call(s.querySelectorAll('.grid,.two'),function(g){var n=(getComputedStyle(g).gridTemplateColumns||'').split(' ').filter(Boolean).length;if(n>1&&g.clientWidth/n<150)add(i,'grid',0,n+' columns are too narrow at this width')});" +
  "var pt=parseFloat(cs.paddingTop)||0;if(vw<700&&pt>110)add(i,'spacing',pt,'very large spacing for a phone ('+Math.round(pt)+'px)')});" +
  "parent.postMessage({fodo:'rh',key:KEY,vw:vw,docW:document.documentElement.scrollWidth,issues:out},'*')}if(document.readyState==='complete')setTimeout(go,350);else addEventListener('load',function(){setTimeout(go,350)})})()<\/script>";
export function measure(doc, page, width) {
  return new Promise((res) => {
    const key = "k" + Math.random().toString(36).slice(2), f = document.createElement("iframe"); f.setAttribute("sandbox", "allow-scripts"); f.setAttribute("aria-hidden", "true"); f.tabIndex = -1;
    f.style.cssText = "position:fixed;left:-5000px;top:0;width:" + width + "px;height:900px;border:0;visibility:hidden"; document.body.appendChild(f);
    const done = (r) => { window.removeEventListener("message", on); clearTimeout(t); f.remove(); res(r); };
    const on = (e) => { if (e.source === f.contentWindow && e.data && e.data.fodo === "rh" && e.data.key === key) done(e.data); };
    const t = setTimeout(() => done({ vw: width, issues: [], timeout: true }), 8000); window.addEventListener("message", on);
    f.srcdoc = renderPage(doc, page, { base: "#", edit: true, badge: false, data: X.ED().data, bodyExtra: DETECT.replace("KEY", JSON.stringify(key)) });
  });
}

/* issues → override rules (only for the layer that has the problem; desktop is never touched) */
function rulesFor(layer, issues) {
  const r = {}, K = issues.map((x) => x.kind), px = Math.max(0, ...issues.map((x) => x.px || 0));
  if (K.indexOf("text") > -1 || K.indexOf("overflow") > -1) r.fs = px > 60 ? 80 : 90;
  if (K.indexOf("grid") > -1 || (K.indexOf("overflow") > -1 && layer === "mobile")) r.cols = layer === "mobile" ? 1 : 2;
  if (K.indexOf("button") > -1 || K.indexOf("btnwrap") > -1) r.stack = true;
  if (K.indexOf("spacing") > -1) r.pad = "s";
  if (K.indexOf("image") > -1 || K.indexOf("overflow") > -1) r.width = "full";
  return r;
}
const RULE_TXT = { fs: (v) => "text " + v + "%", cols: (v) => v + (v === 1 ? " column" : " columns"), stack: () => "stacked buttons", pad: () => "smaller spacing", width: () => "full width" };
const label = (sec) => SECTION_LABELS[(sec || {}).type] || "Section";

/* ---------------- Make Responsive: measure → propose → preview → Accept / Reject ---------------- */
export async function makeResponsive(scope) {
  scope = scope || {}; const ED = X.ED(), page = ED.page, P = X.curPage(), bp = BREAKPOINTS(ED.doc.theme);
  const m = modal('<h2>Make responsive</h2><p class="wb-muted" id="mr-s">Measuring this page on a tablet (' + Math.min(820, bp.tablet) + 'px) and a phone (375px)…</p><div id="mr-b"><div class="wb-spin"></div></div>', "wb-wide");
  const [tb, mb] = await Promise.all([measure(ED.doc, page, Math.min(820, bp.tablet)), measure(ED.doc, page, 375)]);
  const pick = (L) => L.issues.filter((x) => (scope.only == null || x.i === scope.only) && x.kind !== "aspect");
  const plan = []; [["tablet", pick(tb)], ["mobile", pick(mb)]].forEach(([layer, L]) => { const by = {}; L.forEach((x) => { (by[x.i] = by[x.i] || []).push(x); });
    Object.keys(by).forEach((i) => { const sec = P.sections[+i]; if (!sec || (sec.style && sec.style.lock)) return; const cur = (sec.style && sec.style[layer]) || {}, r = rulesFor(layer, by[i]), add = {};
      Object.keys(r).forEach((k) => { if (cur[k] == null || cur[k] === "") add[k] = r[k]; else if (k === "fs" && +cur[k] > r.fs) add[k] = r.fs; }); if (Object.keys(add).length) plan.push({ i: +i, layer, add, why: by[i].map((x) => x.msg) }); }); });
  const body = $("#mr-b", m);
  if (!plan.length) { $("#mr-s", m).textContent = ""; body.innerHTML = '<p class="wb-ok">✓ ' + (scope.only != null ? "This section fits" : "This page fits") + ' tablets and phones. Nothing to change.</p>' + (pick(mb).length + pick(tb).length ? '<p class="wb-muted">Some issues remain that need a manual change (e.g. a locked section or very long words). Open <b>Responsive health</b> to see them.</p>' : ""); return; }
  /* v42: preview first (phone + tablet, before / after), pick which changes to keep, then Apply or Discard */
  const build = (on) => { const next = JSON.parse(JSON.stringify(ED.doc)), NP = next.pages.find((p) => p.slug === page); plan.forEach((x, n) => { if (!on[n]) return; const s = NP.sections[x.i]; s.style = s.style || {}; s.style[x.layer] = Object.assign({}, s.style[x.layer] || {}, x.add); }); return next; };
  let on = plan.map(() => true), view = "mobile";
  $("#mr-s", m).textContent = plan.length + " change" + (plan.length > 1 ? "s" : "") + " proposed. Nothing is applied until you press Apply. Desktop stays exactly as it is.";
  body.innerHTML = '<ul class="wb-iss wb-mr-l">' + plan.map((x, n) => '<li><label class="wb-ck"><input type="checkbox" data-mr="' + n + '" checked> <span><b>' + esc(label(P.sections[x.i])) + " · " + (x.layer === "mobile" ? "phone" : x.layer) + "</b>: " + Object.keys(x.add).map((k) => esc(RULE_TXT[k](x.add[k]))).join(", ") + '<br><small class="wb-muted">' + esc([...new Set(x.why)].slice(0, 2).join("; ")) + "</small></span></label></li>").join("") + "</ul>" +
    '<div class="wb-seg" role="group" aria-label="Preview device"><button type="button" data-mrv="mobile" aria-pressed="true">Phone 375px</button><button type="button" data-mrv="tablet" aria-pressed="false">Tablet ' + Math.min(820, bp.tablet) + 'px</button></div>' +
    '<div class="wb-ba" id="mr-ba"><figure><figcaption>Now</figcaption><div class="wb-mr-v"><iframe sandbox="allow-scripts" id="mr-a" tabindex="-1"></iframe></div></figure><figure><figcaption>After (preview)</figcaption><div class="wb-mr-v"><iframe sandbox="allow-scripts" id="mr-n" tabindex="-1"></iframe></div></figure></div>' +
    '<div class="wb-row wb-nav"><button class="wb-btn" id="mr-no">Discard</button><button class="wb-btn pri" id="mr-ok">Apply ' + plan.length + " change" + (plan.length > 1 ? "s" : "") + "</button></div>";
  const go = '<script>addEventListener("load",function(){var s=document.querySelectorAll("body>header,body>section,body>footer")[' + plan[0].i + '];if(s)scrollTo(0,Math.max(0,s.offsetTop-12))})<\/script>', RO = { base: "#", badge: false, data: ED.data, noMotion: true, bodyExtra: go };   // previews open at the first changed section
  const R0 = renderPage(ED.doc, page, RO);
  const draw = () => { const W = view === "tablet" ? Math.min(820, bp.tablet) : 375; $$("#mr-ba iframe", m).forEach((f) => { const v = f.parentNode, sc = Math.min(1, v.clientWidth / W); f.style.width = W + "px"; f.style.height = Math.round(v.clientHeight / sc) + "px"; f.style.transform = "scale(" + sc + ")"; f.style.left = Math.max(0, Math.round((v.clientWidth - W * sc) / 2)) + "px"; }); };
  const upd = () => { $("#mr-a", m).srcdoc = R0; $("#mr-n", m).srcdoc = renderPage(build(on), page, RO); const n = on.filter(Boolean).length; $("#mr-ok", m).disabled = !n; $("#mr-ok", m).textContent = n ? "Apply " + n + " change" + (n > 1 ? "s" : "") : "Nothing selected"; draw(); };
  $$("[data-mr]", m).forEach((c) => { c.onchange = () => { on[+c.dataset.mr] = c.checked; upd(); }; });
  $$("[data-mrv]", m).forEach((b) => { b.onclick = () => { view = b.dataset.mrv; $$("[data-mrv]", m).forEach((x) => x.setAttribute("aria-pressed", x === b)); draw(); }; });
  upd(); requestAnimationFrame(draw);
  $("#mr-no", m).onclick = () => { m.remove(); X.toast("Discarded. Nothing changed."); };
  $("#mr-ok", m).onclick = async () => { const keep = plan.filter((x, n) => on[n]); if (!keep.length) return; X.change(() => { keep.forEach((x) => { const s = P.sections[x.i]; s.style = s.style || {}; s.style[x.layer] = Object.assign({}, s.style[x.layer] || {}, x.add); }); });
    m.remove(); const after = await measure(X.ED().doc, page, 375), left0 = pick(after).filter((x) => x.kind !== "btnwrap").length; X.toast(left0 ? "Applied. " + left0 + " smaller issue(s) still need a look: see Responsive health." : "Applied ✓ The page now fits phones. Undo (Ctrl+Z) if you prefer the old look."); X.right(); };
}

/* ---------------- Responsive Health: every breakpoint, click an issue to jump to it ---------------- */
export async function healthPanel() {
  const ED = X.ED(), page = ED.page, P = X.curPage(), bp = BREAKPOINTS(ED.doc.theme), W = [["desktop", 1440], ["laptop", 1280], ["tablet", Math.min(820, bp.tablet)], ["mobile", 375]];
  const m = modal('<h2>Responsive health · ' + esc(P.title) + '</h2><p class="wb-muted">Measured with the real page at each width, not guessed.</p><div id="rh-b"><div class="wb-spin"></div></div>', "wb-wide");
  const R = await Promise.all(W.map((w) => measure(ED.doc, page, w[1])));
  const ok = R.every((r) => !r.issues.length);
  $("#rh-b", m).innerHTML = '<ul class="wb-rh">' + W.map((w, k) => { const L = R[k].issues; return '<li class="' + (L.length ? "warn" : "ok") + '"><b>' + (L.length ? "⚠ " : "✓ ") + w[0].charAt(0).toUpperCase() + w[0].slice(1) + " <small>" + w[1] + "px</small></b>" +
    (L.length ? "<ul>" + L.map((x) => '<li><button class="wb-link" data-go="' + x.i + '" data-dev="' + w[0] + '">' + esc(label(P.sections[x.i])) + ": " + esc(x.msg) + '</button> <button class="wb-btn sm" data-fix="' + x.i + '">Fix automatically</button> <button class="wb-btn sm" data-man="' + x.i + '" data-dev="' + w[0] + '">Fix manually</button></li>').join("") + "</ul>" : "") + "</li>"; }).join("") + "</ul>" +
    (ok ? '<p class="wb-ok">Every breakpoint looks right.</p>' : '<div class="wb-row"><button class="wb-btn pri" id="rh-all">✦ Make the whole page responsive</button></div>');
  const jump = (i, dev, style) => { m.remove(); X.setDevice(dev === "laptop" ? "laptop" : dev); X.select(+i); if (style) { X.ED().rtab = "style"; X.right(); } };
  $$("[data-go]", m).forEach((b) => { b.onclick = () => jump(b.dataset.go, b.dataset.dev, false); });
  $$("[data-man]", m).forEach((b) => { b.onclick = () => jump(b.dataset.man, b.dataset.dev, true); });
  $$("[data-fix]", m).forEach((b) => { b.onclick = () => { m.remove(); makeResponsive({ only: +b.dataset.fix }); }; });
  if ($("#rh-all", m)) $("#rh-all", m).onclick = () => { m.remove(); makeResponsive({}); };
}

/* ---------------- save conflicts: never silently overwrite ---------------- */
function diff(a, b) {
  const out = [], A = {}, B = {}; (a.pages || []).forEach((p) => { A[p.slug] = p; }); (b.pages || []).forEach((p) => { B[p.slug] = p; });
  Object.keys(Object.assign({}, A, B)).forEach((k) => { const x = A[k], y = B[k]; if (!x) return out.push("Page “" + y.title + "” exists only on the server"); if (!y) return out.push("Page “" + x.title + "” exists only in your version");
    const n = Math.max(x.sections.length, y.sections.length); for (let i = 0; i < n; i++) { if (JSON.stringify(x.sections[i]) !== JSON.stringify(y.sections[i])) out.push(x.title + " → " + label(x.sections[i] || y.sections[i]) + " (section " + (i + 1) + ")"); } });
  if (JSON.stringify(a.theme) !== JSON.stringify(b.theme)) out.push("Design (colours / fonts / style)"); if (JSON.stringify(a.settings) !== JSON.stringify(b.settings)) out.push("Website settings");
  return out;
}
export function conflict(mine, server) {
  return new Promise((res) => {
    const d = diff(mine, server.doc), m = modal('<h2>This website was changed somewhere else</h2><p>Someone (or another tab) saved a newer version while you were editing. Nothing has been overwritten.</p>' +
      '<div class="wb-cf2"><div class="panel"><b>Your version</b><small>in this browser</small></div><div class="panel"><b>Server version</b><small>saved ' + esc(server.when || "just now") + "</small></div></div>" +
      '<details id="cf-rev"><summary>Review changes (' + d.length + ")</summary><ul class=\"wb-iss\">" + (d.map((x) => "<li>" + esc(x) + "</li>").join("") || "<li>No visible differences.</li>") + "</ul></details>" +
      '<div class="wb-row wb-nav"><button class="wb-btn" id="cf-srv">Keep server version</button><button class="wb-btn pri" id="cf-me">Keep mine</button></div><p class="wb-muted">Keep mine: the server version is saved in Version history first. Keep server: your version stays in Undo (Ctrl+Z).</p>');
    $("#cf-srv", m).onclick = () => { m.remove(); res("server"); }; $("#cf-me", m).onclick = () => { m.remove(); res("mine"); };
    $("[data-x]", m).onclick = () => { m.remove(); res("later"); };
  });
}

/* ---------------- save status line ---------------- */
export function saveState(kind, text) {
  const el = $("#wb-save"); if (!el) return; el.className = "wb-save s-" + kind;
  el.innerHTML = esc(text || { saving: "Saving…", saved: "Saved just now", dirty: "Unsaved changes…", offline: "Offline: changes kept on this device", failed: "Sync failed" }[kind] || "") + (kind === "failed" ? ' <button class="wb-link" id="wb-retry">Retry</button>' : "");
  if ($("#wb-retry")) $("#wb-retry").onclick = () => X.save();
}

/* ---------------- canvas bottom bar: zoom, fit, grid, breakpoint, history ---------------- */
export function bottomBar() {
  const ED = X.ED(), c = $(".wb-canvas"); if (!c || $("#wb-bb")) return;
  const b = document.createElement("div"); b.className = "wb-bb"; b.id = "wb-bb";
  b.innerHTML = '<button class="wb-ib sm" id="bb-out" title="Zoom out">−</button><span id="bb-z">100%</span><button class="wb-ib sm" id="bb-in" title="Zoom in">+</button><button class="wb-btn sm" id="bb-fit">Fit</button>' +
    '<label class="wb-ck sm"><input type="checkbox" id="bb-grid"> Grid</label><span class="wb-bpchip" id="bb-bp"></span><span class="wb-sp"></span><button class="wb-btn sm" id="bb-rh">Responsive health</button><button class="wb-btn sm" id="bb-hist">History</button>';
  c.appendChild(b);
  const z = (v) => { ED.zoom = Math.max(0.3, Math.min(1.5, Math.round(v * 100) / 100)); const fw = $("#wb-fw"); if (fw) fw.style.zoom = ED.zoom; $("#bb-z").textContent = Math.round(ED.zoom * 100) + "%"; };
  $("#bb-out").onclick = () => z((ED.zoom || 1) - 0.1); $("#bb-in").onclick = () => z((ED.zoom || 1) + 0.1);
  $("#bb-fit").onclick = () => { const fw = $("#wb-fw"); if (!fw) return; fw.style.zoom = 1; const w = fw.getBoundingClientRect().width, cw = c.clientWidth - 32; z(w > cw ? cw / w : 1); };
  $("#bb-grid").onchange = function () { $("#wb-fw").classList.toggle("wb-gridon", this.checked); };
  $("#bb-rh").onclick = healthPanel; $("#bb-hist").onclick = () => X.openHistory();
  bpChip();
}
export function bpChip() { const el = $("#bb-bp"); if (!el) return; const ED = X.ED(), d = DEVICES.find((x) => x[0] === ED.dev) || DEVICES[0], bp = BREAKPOINTS(ED.doc.theme);
  el.textContent = d[2] + " · " + (d[3] ? d[3] + "px" : "full width") + " · editing " + (layerOf(ED.dev) === "base" ? "base design" : layerOf(ED.dev) + " overrides (≤ " + bp[layerOf(ED.dev)] + "px)"); el.className = "wb-bpchip l-" + layerOf(ED.dev); }

/* friendly error text: never show undefined / [object Object] / Internal Server Error */
export function friendly(r, what) {
  const t = String((r && (r.reason || r.error)) || ""); if (!t || /undefined|null|NaN|\[object|internal server error|^server error/i.test(t)) return "Something went wrong while " + (what || "saving") + ". Your last saved version is safe.";
  return t;
}

/* ---------------- AI Edit for a whole section: preview first, nothing changes until "Apply" (and Undo still works) ---------------- */
export const AI_ACTIONS = [["improve", "Improve copy"], ["shorten", "Make shorter"], ["premium", "Make premium"], ["professional", "Make professional"], ["friendly", "Make friendly"], ["cta", "Improve conversion"], ["seo", "Rewrite for SEO"], ["hindi", "Translate to Hindi"], ["english", "Translate to English"]];
const SKIP = /^(href|url|link|image|img|src|video|logo|icon|id|email|phone|whatsapp|date|embed|map|style|bg|align|kind|type|size|value|price|currency)$/i;
function textPaths(o, base, out) { if (out.length >= 12) return out; if (Array.isArray(o)) o.forEach((v, i) => textPaths(v, base.concat(i), out));
  else if (o && typeof o === "object") Object.keys(o).forEach((k) => { if (!SKIP.test(k)) textPaths(o[k], base.concat(k), out); });
  else if (typeof o === "string" && o.trim().length > 2 && !/^(https?:|\/|#|\[)/.test(o.trim()) && base.length) out.push(base); return out; }
const getP = (o, p) => p.reduce((a, k) => (a == null ? a : a[k]), o), setP = (o, p, v) => { const last = p[p.length - 1]; p.slice(0, -1).reduce((a, k) => a[k], o)[last] = v; };
export function aiEditMenu(btn, i) {
  document.querySelectorAll(".wb-aimenu").forEach((x) => x.remove()); const r = btn.getBoundingClientRect(), m = document.createElement("div"); m.className = "wb-ctx wb-aimenu"; m.setAttribute("role", "menu");
  m.style.cssText = "position:fixed;top:" + (r.bottom + 6) + "px;left:" + Math.max(8, Math.min(innerWidth - 230, r.left - 180)) + "px";
  m.innerHTML = "<b class=\"wb-aih\">✦ AI edit this section</b>" + AI_ACTIONS.map((a) => '<button role="menuitem" data-ai="' + a[0] + '">' + a[1] + "</button>").join(""); document.body.appendChild(m);
  const off = (e) => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener("pointerdown", off, true); } }; setTimeout(() => document.addEventListener("pointerdown", off, true), 0);
  $$("[data-ai]", m).forEach((b) => { b.onclick = () => { m.remove(); aiEditSection(i, b.dataset.ai, b.textContent); }; });
}
export async function aiEditSection(i, mode, label0) {
  const ED = X.ED(), P = X.curPage(), sec = P.sections[i]; if (!sec) return; if (sec.style && sec.style.lock) return X.toast("This section is locked, unlock it first.", true);
  const comp = sec.ref ? (ED.doc.components || []).find((k) => k.id === sec.ref) : null, props = comp ? comp.props : sec.props || {}, paths = textPaths(props, [], []);
  if (!paths.length) return X.toast("This section has no text to rewrite.", true);
  const m = modal("<h2>✦ " + esc(label0) + " · " + esc(label(sec)) + '</h2><p class="wb-muted" id="ae-s">Writing ' + paths.length + " piece" + (paths.length > 1 ? "s" : "") + ' of text…</p><div id="ae-b"><div class="wb-spin"></div></div>', "wb-wide");
  const next = JSON.parse(JSON.stringify(props)), done = []; let fail = "";
  for (let k = 0; k < paths.length; k += 3) await Promise.all(paths.slice(k, k + 3).map(async (p) => { const before = getP(props, p), r = await X.api(ED.id + "/rewrite", "POST", { text: before, mode });
    if (r.ok && r.text && r.text !== before) { setP(next, p, r.text); done.push([p, before, r.text]); } else if (!r.ok) fail = friendly(r, "writing"); }));
  if (!document.body.contains(m)) return;
  if (!done.length) { $("#ae-s", m).textContent = ""; $("#ae-b", m).innerHTML = "<p>" + esc(fail || "The AI kept the text as it is.") + "</p>"; return; }
  const doc2 = JSON.parse(JSON.stringify(ED.doc)), P2 = doc2.pages.find((p) => p.slug === ED.page); if (comp) (doc2.components || []).find((k) => k.id === comp.id).props = next; else P2.sections[i].props = next;
  $("#ae-s", m).textContent = done.length + " change" + (done.length > 1 ? "s" : "") + ". Nothing is changed until you press Apply.";
  $("#ae-b", m).innerHTML = '<ul class="wb-aed">' + done.map((d) => "<li><small>" + esc(d[0].join(" › ")) + "</small><del>" + esc(d[1]) + "</del><ins>" + esc(d[2]) + "</ins></li>").join("") + "</ul>" +
    '<iframe sandbox="allow-scripts" class="wb-aepv" id="ae-pv" title="Preview"></iframe><div class="wb-row wb-nav"><button class="wb-btn" id="ae-no">Discard</button><button class="wb-btn" id="ae-again">Try again</button><button class="wb-btn pri" id="ae-ok">Apply</button></div>';
  $("#ae-pv", m).srcdoc = renderPage(doc2, ED.page, { base: "#", edit: true, badge: false, data: ED.data, bodyExtra: "<script>addEventListener('load',function(){var s=document.querySelector('[data-sec=\"" + i + "\"]');if(s)s.scrollIntoView()})<\/script>" });
  $("#ae-no", m).onclick = () => m.remove(); $("#ae-again", m).onclick = () => { m.remove(); aiEditSection(i, mode, label0); };
  $("#ae-ok", m).onclick = () => { m.remove(); X.change(() => { done.forEach((d) => setP(props, d[0], d[2])); }); X.right(); X.toast("Applied. Undo (Ctrl+Z) brings the old text back."); };
}
