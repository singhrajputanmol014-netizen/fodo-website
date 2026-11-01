/* FODO Website Builder v42: design tokens · desktop / tablet / mobile side by side · rulers & guides · component copy overrides.
   Pure editor helpers: they only change ED.doc through X.change (so Undo, autosave and the server validation all apply). */
import { renderPage, themeCss, SCALES, compProps } from "/sites/lib/render.js";
let X = null; export function bind(ctx) { X = ctx; }
const $ = (s, el) => (el || document).querySelector(s), $$ = (s, el) => [...(el || document).querySelectorAll(s)];
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };

/* ================= DESIGN TOKENS ================= */
export const TOKENS = [["--p", "Primary", "@p"], ["--s2", "Secondary", "@s2"], ["--a", "Accent", "@a"], ["--bg", "Background", "@bg"], ["--card", "Surface", "@card"], ["--tx", "Text", "@tx"], ["--mut", "Muted text", "@mut"], ["--line", "Border", "@line"]];
/* resolve the real colours of the current theme (colour-mix included) without touching the canvas */
export function resolveTokens(theme) {
  const css = themeCss(theme || {}), m = /^:root\{([^}]*)\}/.exec(css), d = document.createElement("div"); d.style.cssText = (m ? m[1] : "") + ";position:absolute;left:-9999px;top:0"; document.body.appendChild(d);
  const out = {}; TOKENS.forEach((t) => { d.style.color = "var(" + t[0] + ")"; out[t[0]] = getComputedStyle(d).color; }); const vars = {}; (m ? m[1] : "").split(";").forEach((x) => { const i = x.indexOf(":"); if (i > 0) vars[x.slice(0, i).trim()] = x.slice(i + 1).trim(); }); d.remove(); return { colours: out, vars };
}
export const hex = (rgb) => { const h = (a) => "#" + a.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join(""); let m = /rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/.exec(rgb || ""); if (m) return h([+m[1], +m[2], +m[3]]);
  m = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(rgb || ""); return m ? h([m[1] * 255, m[2] * 255, m[3] * 255]) : ""; };
export function tokens(el) {
  if (!el || $("#tk-box", el)) return; const t = X.ED().doc.theme || {}, R = resolveTokens(t);
  const box = document.createElement("details"); box.id = "tk-box"; box.className = "wb-tk"; box.open = ls.get("wb-tk") === "1";
  box.innerHTML = '<summary>Design tokens <small>(one change updates every section)</small></summary>' +
    '<div class="wb-tk-grid">' + TOKENS.map((k) => '<div class="wb-tk-i" title="' + esc(k[0]) + '"><i style="background:' + esc(R.colours[k[0]]) + '"></i><b>' + k[1] + "</b><code>" + esc(hex(R.colours[k[0]]) || "auto") + "</code></div>").join("") + "</div>" +
    '<div class="wb-g2"><label class="wb-lab"><span>Muted text</span><span class="wb-row" style="margin:0;gap:6px"><input type="color" data-tk="muted" value="' + esc(/^#[0-9a-f]{6}$/i.test(t.muted || "") ? t.muted : hex(R.colours["--mut"]) || "#777777") + '"><button type="button" class="wb-ib sm" data-tkc="muted" title="Back to automatic">↺</button></span></label>' +
    '<label class="wb-lab"><span>Border</span><span class="wb-row" style="margin:0;gap:6px"><input type="color" data-tk="border" value="' + esc(/^#[0-9a-f]{6}$/i.test(t.border || "") ? t.border : hex(R.colours["--line"]) || "#dddddd") + '"><button type="button" class="wb-ib sm" data-tkc="border" title="Back to automatic">↺</button></span></label></div>' +
    '<label class="wb-lab"><span>Heading scale</span><select data-tk="scale"><option value="">Normal</option><option value="tight"' + (t.scale === "tight" ? " selected" : "") + '>Tight (smaller headings)</option><option value="bold"' + (t.scale === "bold" ? " selected" : "") + ">Bold (big headings)</option></select></label>" +
    '<label class="wb-lab"><span>Body text size <small id="tk-bv">' + (t.base || 16) + 'px</small></span><input type="range" min="14" max="19" data-tk="base" value="' + (t.base || 16) + '"></label>' +
    '<p class="wb-muted">Element colours can use these tokens too (pick a swatch in an element\'s Colour panel), so they follow the theme when you change it.</p>' +
    '<div class="wb-row"><button type="button" class="wb-btn sm" id="tk-css">Copy CSS variables</button><button type="button" class="wb-btn sm" id="tk-json">Copy tokens (JSON)</button></div>';
  el.appendChild(box); box.ontoggle = () => ls.set("wb-tk", box.open ? "1" : "0");
  const set = (k, v) => { X.change(() => { const th = X.ED().doc.theme = Object.assign({}, X.ED().doc.theme); if (v === "" || v == null) delete th[k]; else th[k] = v; }); box.remove(); tokens(el); const b2 = $("#tk-box", el); if (b2) b2.open = true; };
  $$("[data-tk]", box).forEach((i) => { let tm; i.addEventListener(i.type === "range" || i.type === "color" ? "input" : "change", () => { if (i.dataset.tk === "base") $("#tk-bv", box).textContent = i.value + "px"; clearTimeout(tm); tm = setTimeout(() => set(i.dataset.tk, i.dataset.tk === "base" ? (+i.value === 16 ? "" : +i.value) : i.value), i.type === "select-one" ? 0 : 300); }); });
  $$("[data-tkc]", box).forEach((b) => { b.onclick = () => set(b.dataset.tkc, ""); });
  const copy = (txt, what) => { try { navigator.clipboard.writeText(txt).then(() => X.toast(what + " copied."), () => X.toast("Couldn't copy.", true)); } catch (e) { X.toast("Couldn't copy.", true); } };
  $("#tk-css", box).onclick = () => copy(":root{\n" + Object.keys(R.vars).map((k) => "  " + k + ": " + R.vars[k] + ";").join("\n") + "\n}", "CSS variables");
  $("#tk-json", box).onclick = () => { const th = X.ED().doc.theme || {}, o = { colour: {}, type: { body: th.font || "Inter", heading: th.headingFont || th.font || "Inter", scale: th.scale || "normal", base: (th.base || 16) + "px" }, shape: { radius: (th.radius != null ? th.radius : 14) + "px", button: th.button || "rounded", shadow: th.shadow || "soft" }, space: { density: th.density || "normal", container: th.container || "1160" } }; TOKENS.forEach((k) => { o.colour[k[1].toLowerCase().replace(/ /g, "-")] = hex(R.colours[k[0]]); }); copy(JSON.stringify(o, null, 2), "Tokens"); };
}

/* ================= SIDE BY SIDE: desktop · tablet · mobile at once, refreshed on every change ================= */
const SBS = [["Desktop", 1280], ["Tablet", 820], ["Mobile", 390]];
export const sbsOpen = () => !!$("#wb-sbs");
export function sideBySide(on) {
  const c = $(".wb-canvas"); if (!c) return; const cur = $("#wb-sbs"); if (on === false || (on == null && cur)) { if (cur) cur.remove(); window.removeEventListener("resize", fit); const b = $("#bb-sbs"); if (b) b.setAttribute("aria-pressed", "false"); return; }
  const w = document.createElement("div"); w.id = "wb-sbs"; w.className = "wb-sbs"; w.setAttribute("role", "region"); w.setAttribute("aria-label", "Desktop, tablet and mobile side by side");
  w.innerHTML = '<div class="wb-sbs-top"><b>Side by side</b><span class="wb-muted">Edit in the right panel, all three update. Click a device name to edit on it.</span><span class="wb-sp"></span><button type="button" class="wb-btn sm" id="sbs-x">Close</button></div><div class="wb-sbs-row">' +
    SBS.map((d, i) => '<figure class="wb-sbs-c" style="flex:' + [1.7, 1.1, 0.62][i] + '"><figcaption><button type="button" class="wb-link" data-sbsdev="' + d[0].toLowerCase() + '">' + d[0] + "</button> <small>" + d[1] + 'px</small></figcaption><div class="wb-sbs-v"><iframe sandbox="allow-scripts" tabindex="-1" title="' + d[0] + ' preview" data-w="' + d[1] + '"></iframe></div></figure>').join("") + "</div>";
  c.appendChild(w); const b = $("#bb-sbs"); if (b) b.setAttribute("aria-pressed", "true");
  $("#sbs-x", w).onclick = () => sideBySide(false);
  $$("[data-sbsdev]", w).forEach((x) => { x.onclick = () => { sideBySide(false); X.setDevice(x.dataset.sbsdev); }; });
  refresh(); window.addEventListener("resize", fit); requestAnimationFrame(fit);
}
function fit() { $$("#wb-sbs iframe").forEach((f) => { const v = f.parentNode, W = +f.dataset.w, s = Math.min(1, v.clientWidth / W); f.style.width = W + "px"; f.style.height = Math.round(v.clientHeight / s) + "px"; f.style.transform = "scale(" + s + ")"; }); }
let rt = null;
export function refresh() { if (!sbsOpen()) return; clearTimeout(rt); rt = setTimeout(() => { const E = X.ED(), html = renderPage(E.doc, E.page, { base: "#", badge: false, data: E.data, noMotion: true }); $$("#wb-sbs iframe").forEach((f) => { f.srcdoc = html; }); fit(); }, 120); }

/* ================= RULERS & GUIDES (per website, kept in this browser) ================= */
const gKey = () => "wb-guides-" + X.ED().id;
export function guidesGet() { try { const g = JSON.parse(ls.get(gKey()) || "null"); return g && Array.isArray(g.v) && Array.isArray(g.h) ? { v: g.v.filter((n) => n >= 0 && n < 4000).slice(0, 40), h: g.h.filter((n) => n >= 0 && n < 4000).slice(0, 40) } : { v: [], h: [] }; } catch (e) { return { v: [], h: [] }; } }
const guidesSet = (g) => ls.set(gKey(), JSON.stringify(g));
export function rulers(on) {
  const fw = $("#wb-fw"); if (!fw) return; let r = $("#wb-rul", fw);
  if (on === false || (on == null && r)) { if (r) r.remove(); fw.classList.remove("wb-rulon"); ls.set("wb-rul", "0"); return; }
  if (r) r.remove(); ls.set("wb-rul", "1"); fw.classList.add("wb-rulon");
  r = document.createElement("div"); r.id = "wb-rul"; r.className = "wb-rul";
  const lab = (n, ax) => { let h = ""; for (let i = 100; i < n; i += 100) h += '<span style="' + (ax === "x" ? "left" : "top") + ":" + i + 'px">' + i + "</span>"; return h; };
  r.innerHTML = '<div class="wb-rx" title="Drag down to add a horizontal guide">' + lab(2600, "x") + '</div><div class="wb-ry" title="Drag right to add a vertical guide">' + lab(4000, "y") + '</div><div class="wb-rc" title="Clear all guides">×</div><div class="wb-gl"></div><div class="wb-rpos" aria-live="polite"></div>';
  fw.appendChild(r); drawGuides();
  const zoom = () => X.ED().zoom || 1, pos = (e) => { const b = fw.getBoundingClientRect(), z = zoom(); return { x: Math.round((e.clientX - b.left) / z), y: Math.round((e.clientY - b.top) / z) }; };
  const drag = (kind, idx) => (e) => { e.preventDefault(); const g = guidesGet(); if (idx == null) { g[kind].push(0); idx = g[kind].length - 1; }
    const cover = document.createElement("div"); cover.className = "wb-rcover " + kind; document.body.appendChild(cover); const out = $(".wb-rpos", r);
    const mv = (ev) => { const p = pos(ev); g[kind][idx] = kind === "v" ? p.x : p.y; drawGuides(g); out.textContent = (kind === "v" ? "x " : "y ") + g[kind][idx] + "px"; out.style.display = "block"; };
    const up = (ev) => { document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up); cover.remove(); out.style.display = "none"; const p = pos(ev), v = kind === "v" ? p.x : p.y; if (v < 18) g[kind].splice(idx, 1); else g[kind][idx] = v; guidesSet(g); drawGuides(); };
    document.addEventListener("pointermove", mv); document.addEventListener("pointerup", up); mv(e); };
  $(".wb-rx", r).onpointerdown = drag("h"); $(".wb-ry", r).onpointerdown = drag("v");
  $(".wb-rc", r).onclick = () => { guidesSet({ v: [], h: [] }); drawGuides(); X.toast("Guides cleared."); };
  r._drag = drag;
}
export function drawGuides(g) {
  const r = $("#wb-rul"); if (!r) return; g = g || guidesGet(); const gl = $(".wb-gl", r);
  gl.innerHTML = g.v.map((x, i) => '<i class="gv" data-k="v" data-i="' + i + '" style="left:' + x + 'px" title="' + x + 'px · drag to move, drag onto the ruler or double-click to remove"></i>').join("") + g.h.map((y, i) => '<i class="gh" data-k="h" data-i="' + i + '" style="top:' + y + 'px" title="' + y + 'px · drag to move, drag onto the ruler or double-click to remove"></i>').join("");
  $$("i", gl).forEach((n) => { n.onpointerdown = r._drag ? r._drag(n.dataset.k, +n.dataset.i) : null; n.ondblclick = () => { const g2 = guidesGet(); g2[n.dataset.k].splice(+n.dataset.i, 1); guidesSet(g2); drawGuides(); }; });
}

/* ================= GLOBAL COMPONENTS: per-copy overrides ================= */
export const overrides = (sec) => (sec && sec.over && typeof sec.over === "object" ? Object.keys(sec.over) : []);
/* the object the panel edits: master props (all copies) or a merged working copy (this copy only) */
export function editTarget(sec, comp, copyMode) { return copyMode ? JSON.parse(JSON.stringify(compProps(comp, sec))) : comp.props; }
/* after an edit in "this copy only": keep only the top-level keys that differ from the master */
export function syncOver(sec, comp, work) {
  const empty = (v) => v == null || v === "" || v === false || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && Object.values(v).every(empty));
  const o = {}; Object.keys(work).forEach((k) => { if ((comp.props || {})[k] === undefined && empty(work[k])) return; if (JSON.stringify(work[k]) !== JSON.stringify((comp.props || {})[k])) o[k] = JSON.parse(JSON.stringify(work[k])); });
  if (Object.keys(o).length) sec.over = o; else delete sec.over;
}
export function compUses(id) { let n = 0; (X.ED().doc.pages || []).forEach((p) => (p.sections || []).forEach((s) => { if (s.ref === id) n++; })); return n; }

/* bottom bar: Side by side + Rulers (added next to Grid) */
export function barButtons() {
  const bb = $("#wb-bb"); if (!bb || $("#bb-sbs", bb)) return; const grid = $("#bb-grid", bb), at = grid ? grid.closest("label") : null;
  const html = '<label class="wb-ck sm"><input type="checkbox" id="bb-rul"' + (ls.get("wb-rul") === "1" ? " checked" : "") + '> Rulers</label><button type="button" class="wb-btn sm" id="bb-sbs" aria-pressed="false" title="Desktop, tablet and mobile side by side">⊞ Side by side</button>';
  if (at) at.insertAdjacentHTML("afterend", html); else bb.insertAdjacentHTML("beforeend", html);
  $("#bb-rul", bb).onchange = function () { rulers(this.checked); }; $("#bb-sbs", bb).onclick = () => sideBySide();
  if (ls.get("wb-rul") === "1") rulers(true);
}
