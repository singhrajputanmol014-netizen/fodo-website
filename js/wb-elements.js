/* FODO Website Builder v41, element-level design. Click any heading, text, button, link, image or list item on the canvas to
   style just that element; Shift + click adds more (same section). Styles are stored per breakpoint (desktop / tablet / mobile)
   in section.el and rendered by sites/lib/render.js (validated there, so nothing unsafe can reach a website). Old websites
   without `el` look exactly as before. Layers: every element of the selected section, with rename, hide and lock. */
import { FONTS, EL_ANIMS, cleanEl, esc } from "/sites/lib/render.js";

let X = null; export const bind = (ctx) => { X = ctx; };
const $ = (s, el) => (el || document).querySelector(s), $$ = (s, el) => [...(el || document).querySelectorAll(s)];
const TAG = { h1: "Main heading", h2: "Heading", h3: "Sub heading", h4: "Small heading", p: "Text", a: "Link / button", button: "Button", img: "Image", li: "List item", blockquote: "Quote" };
let MAP = {}, CLIP = null;
/* canvas bridge: element hover/selection + the element list of every section */
export const BRIDGE = "<style>[data-x]{cursor:pointer}[data-x]:hover{outline:1px dashed rgba(255,181,71,.9);outline-offset:2px}[data-x].elsel{outline:2px solid #FFB547!important;outline-offset:2px}</style><script>(function(){" +
  "function list(){var L=[].map.call(document.querySelectorAll('[data-x]'),function(e){var s=e.closest('[data-sec]');return{x:e.getAttribute('data-x'),i:s?+s.dataset.sec:-1,tag:e.tagName.toLowerCase(),t:(e.getAttribute('alt')||e.textContent||'').replace(/\\s+/g,' ').trim().slice(0,40)}});parent.postMessage({fodo:'els',list:L},'*')}" +
  "document.addEventListener('click',function(e){var x=e.target.closest('[data-x]');if(!x)return;var s=x.closest('[data-sec]');if(!s)return;parent.postMessage({fodo:'el',i:+s.dataset.sec,x:x.getAttribute('data-x'),shift:e.shiftKey},'*')},true);" +
  "addEventListener('message',function(e){if(e.data&&e.data.fodo==='elmark'){document.querySelectorAll('.elsel').forEach(function(x){x.classList.remove('elsel')});(e.data.keys||[]).forEach(function(k){var x=document.querySelector('[data-x=\"'+k+'\"]');if(x){x.classList.add('elsel');if(e.data.scroll)x.scrollIntoView({block:'center',behavior:'smooth'})}})}});" +
  "document.addEventListener('keydown',function(e){if(e.target&&e.target.isContentEditable)return;var k=e.key,m=e.ctrlKey||e.metaKey;if(k==='Escape'||((k==='Delete'||k==='Backspace')&&!m)||(m&&e.altKey&&/^[cv]$/i.test(k))){e.preventDefault();parent.postMessage({fodo:'elkey',key:k,ctrl:m,alt:e.altKey},'*')}},true);" +
  "if(document.readyState==='loading')addEventListener('DOMContentLoaded',list);else list()})()</script>";

const ED = () => X.ED(), page = () => X.curPage();
const scope = () => { const d = ED().dev; return d === "tablet" ? "t" : d === "mobile" ? "m" : "st"; };
const SCOPE_NAME = { st: "Desktop (all sizes unless overridden)", t: "Tablet override", m: "Mobile override" };
const keyOf = (x) => String(x).replace(/^\d+-/, "");
function mark(scroll) { const f = document.getElementById("wb-if"), E = ED(); if (f && f.contentWindow) f.contentWindow.postMessage({ fodo: "elmark", keys: (E.elSel || []).map((k) => E.sel + "-" + k), scroll: !!scroll }, "*"); }
export function onFrame(d) {
  const E = ED(); if (!E) return false;
  if (d.fodo === "els") { MAP = {}; (d.list || []).forEach((x) => { (MAP[x.i] = MAP[x.i] || []).push(x); }); if (E.elSel && E.elSel.length) mark(false); return true; }
  if (d.fodo === "elkey") { key({ key: String(d.key || ""), ctrlKey: !!d.ctrl, metaKey: false, altKey: !!d.alt, target: document.body, preventDefault() {} }); return true; }
  if (d.fodo === "el") { const k = keyOf(d.x); if (d.shift && E.sel === d.i && E.elSel && E.elSel.length) { const j = E.elSel.indexOf(k); if (j > -1) E.elSel.splice(j, 1); else E.elSel.push(k); } else { E.sel = d.i; E.elSel = [k]; }
    X.left(); X.right(); mark(false); return true; }
  return false;
}
export const clear = () => { const E = ED(); if (E && E.elSel && E.elSel.length) { E.elSel = []; mark(false); X.right(); return true; } return false; };
const elOf = (sec, k) => { sec.el = sec.el || {}; return (sec.el[k] = sec.el[k] || {}); };
function setAll(fn) { const E = ED(), sec = page().sections[E.sel]; if (!sec) return; X.change(() => { E.elSel.forEach((k) => { const x = elOf(sec, k); fn(x, k); }); const c = cleanEl(sec.el); if (c) sec.el = c; else delete sec.el; }); }
function setProp(prop, val) { const sc = scope(); setAll((x) => { x[sc] = x[sc] || {}; if (val === "" || val == null) delete x[sc][prop]; else x[sc][prop] = val; if (!Object.keys(x[sc]).length) delete x[sc]; }); }

/* the right panel when elements are selected; returns true when it took over */
export function panel(root) {
  const E = ED(); if (!E || !E.elSel || !E.elSel.length || E.sel == null) return false; const sec = page().sections[E.sel]; if (!sec) { E.elSel = []; return false; }
  const ks = E.elSel, k0 = ks[0], x0 = (sec.el || {})[k0] || {}, sc = scope(), v = (x0[sc] || {}), base = x0.st || {}, info = (MAP[E.sel] || []).find((e) => keyOf(e.x) === k0) || { tag: k0.split("-")[0], t: "" };
  const locked = ks.some((k) => ((sec.el || {})[k] || {}).lock), name = x0.name || TAG[info.tag] || info.tag, SL = X.SECTION_LABELS[sec.type] || sec.type;
  const num = (p, label, min, max, step, unit) => '<label class="wb-lab wb-el-n"><span>' + label + (v[p] == null && sc !== "st" && base[p] != null ? ' <small>(desktop ' + base[p] + (unit || "") + ")</small>" : "") + '</span><input type="number" data-p="' + p + '" min="' + min + '" max="' + max + '" step="' + (step || 1) + '" value="' + (v[p] == null ? "" : v[p]) + '" placeholder="auto"></label>';
  const col = (p, label) => '<label class="wb-lab wb-el-c"><span>' + label + '</span><span class="wb-row" style="margin:0;gap:6px"><input type="color" data-pc="' + p + '" value="' + (v[p] || "#000000") + '"><input data-p="' + p + '" value="' + (v[p] || "") + '" placeholder="theme" maxlength="7" aria-label="' + label + ' hex"><button type="button" class="wb-ib sm" data-clr="' + p + '" aria-label="Clear ' + label + '">×</button></span></label>';
  const sel = (p, label, opts) => '<label class="wb-lab"><span>' + label + '</span><select data-p="' + p + '"><option value="">Theme default</option>' + opts.map((o) => '<option value="' + o[0] + '"' + (String(v[p] || "") === String(o[0]) ? " selected" : "") + ">" + o[1] + "</option>").join("") + "</select></label>";
  const txt = (p, label, ph) => '<label class="wb-lab"><span>' + label + '</span><input data-p="' + p + '" value="' + esc(v[p] || "") + '" placeholder="' + ph + '" maxlength="23"></label>';
  const list = (MAP[E.sel] || []).map((e) => { const kk = keyOf(e.x), xe = (sec.el || {})[kk] || {}; return '<li class="' + (ks.indexOf(kk) > -1 ? "on" : "") + '"><button type="button" class="wb-sname" data-pick="' + kk + '">' + esc(xe.name || TAG[e.tag] || e.tag) + "<small>" + esc(e.t || kk) + "</small></button>" + (xe.hide && xe.hide[sc === "st" ? "d" : sc] ? '<span title="Hidden on this device">🚫</span>' : "") + (xe.lock ? '<span title="Locked">🔒</span>' : "") + "</li>"; }).join("");
  root.innerHTML = '<div class="wb-elp"><nav class="wb-crumbs" aria-label="Selection"><button type="button" class="wb-link" data-up>' + esc(SL) + "</button> › <b>" + (ks.length > 1 ? ks.length + " elements" : esc(name)) + '</b></nav>' +
    (ks.length === 1 ? '<label class="wb-lab"><span>Layer name</span><input id="el-name" maxlength="40" value="' + esc(x0.name || "") + '" placeholder="' + esc(TAG[info.tag] || info.tag) + '"></label>' : '<p class="wb-muted">Changes apply to all ' + ks.length + " selected elements. Shift + click to add or remove.</p>") +
    '<p class="wb-el-scope">Editing: <b>' + SCOPE_NAME[sc] + "</b>" + (sc !== "st" ? " · switch device to Desktop for the base style" : "") + "</p>" +
    (locked ? '<p class="wb-banner">🔒 Locked. Unlock to change this element.</p>' : "") +
    '<fieldset class="wb-el-g"' + (locked ? " disabled" : "") + "><legend>Typography</legend>" + sel("ff", "Font", Object.keys(FONTS).map((f) => [f, f])) + '<div class="wb-g2">' + num("fs", "Size (px)", 8, 200) + num("fw", "Weight", 100, 900, 100) + num("lh", "Line height", 0.8, 3, 0.05) + num("ls", "Letter spacing", -5, 30, 0.5) + "</div>" +
    '<div class="wb-g2">' + sel("ta", "Align", [["left", "Left"], ["center", "Center"], ["right", "Right"], ["justify", "Justify"]]) + sel("tt", "Case", [["none", "Normal"], ["uppercase", "UPPERCASE"], ["lowercase", "lowercase"], ["capitalize", "Capitalize"]]) + sel("fst", "Style", [["normal", "Normal"], ["italic", "Italic"]]) + sel("deco", "Underline", [["none", "None"], ["underline", "Underline"]]) + "</div></fieldset>" +
    '<fieldset class="wb-el-g"' + (locked ? " disabled" : "") + "><legend>Colour</legend>" + col("c", "Text") + col("bg", "Background") + num("op", "Opacity (0–1)", 0, 1, 0.05) + "</fieldset>" +
    '<fieldset class="wb-el-g"' + (locked ? " disabled" : "") + '><legend>Spacing & size</legend><div class="wb-g2">' + txt("p", "Padding (px)", "e.g. 12 24") + txt("m", "Margin (px)", "e.g. 0 0 16") + "</div>" + num("w", "Max width (px)", 20, 2400) + "</fieldset>" +
    '<fieldset class="wb-el-g"' + (locked ? " disabled" : "") + '><legend>Border & effects</legend><div class="wb-g2">' + num("bw", "Border width", 0, 20) + num("br", "Radius", 0, 999) + "</div>" + col("bc", "Border colour") + sel("sh", "Shadow", [["none", "None"], ["sm", "Small"], ["md", "Medium"], ["lg", "Large"], ["glow", "Glow"]]) + '<div class="wb-g2">' + num("rot", "Rotate (°)", -180, 180) + num("sc", "Scale", 0.2, 3, 0.05) + "</div></fieldset>" +
    '<fieldset class="wb-el-g"' + (locked ? " disabled" : "") + '><legend>Visibility</legend><div class="wb-row">' + [["d", "Desktop"], ["t", "Tablet"], ["m", "Mobile"]].map((b) => '<label class="wb-ck"><input type="checkbox" data-hide="' + b[0] + '"' + (x0.hide && x0.hide[b[0]] ? " checked" : "") + "> Hide on " + b[1] + "</label>").join("") + "</div></fieldset>" +
    '<fieldset class="wb-el-g"' + (locked ? " disabled" : "") + '><legend>Motion</legend><div class="wb-g2"><label class="wb-lab"><span>Entrance (on scroll)</span><select id="el-anim"><option value="">None</option>' + EL_ANIMS.map((a) => '<option value="' + a + '"' + (x0.anim === a ? " selected" : "") + ">" + a.replace("-", " ") + "</option>").join("") + '</select></label><label class="wb-lab"><span>Hover</span><select id="el-hover"><option value="">None</option>' + [["lift", "Lift"], ["grow", "Grow"], ["glow", "Glow"]].map((o) => '<option value="' + o[0] + '"' + (x0.hover === o[0] ? " selected" : "") + ">" + o[1] + "</option>").join("") + '</select></label></div><p class="wb-muted">Visitors who prefer reduced motion see no animation.</p></fieldset>' +
    '<fieldset class="wb-el-g"' + (locked ? " disabled" : "") + '><legend>Accessibility</legend><label class="wb-lab"><span>Screen-reader label (aria-label)</span><input id="el-aria" maxlength="120" value="' + esc(x0.aria || "") + '" placeholder="Only if the visible text is not enough"></label></fieldset>' +
    '<div class="wb-row"><button type="button" class="wb-btn sm" id="el-lock">' + (locked ? "🔓 Unlock" : "🔒 Lock") + '</button><button type="button" class="wb-btn sm" id="el-copy" title="Ctrl+Alt+C">Copy style</button><button type="button" class="wb-btn sm" id="el-paste" title="Ctrl+Alt+V"' + (CLIP ? "" : " disabled") + '>Paste style</button><button type="button" class="wb-btn sm danger" id="el-reset">Reset</button></div>' +
    '<details class="wb-el-layers" open><summary>Layers in this section</summary><ul class="wb-secs">' + (list || '<li class="wb-muted">Loading…</li>') + "</ul></details>" +
    '<p class="wb-muted">Text: double-click on the canvas to type. Content like links and images is in the section panel (↑ ' + esc(SL) + ").</p></div>";
  const R = (fn) => () => { fn(); X.right(); mark(false); };
  $("[data-up]", root).onclick = () => { ED().elSel = []; mark(false); X.right(); };
  $$("[data-p]", root).forEach((i) => { i.onchange = R(() => { let val = i.value.trim(); if (i.type === "number") val = val === "" ? "" : +val; if (/^(c|bg|bc)$/.test(i.dataset.p) && val && !/^#[0-9a-f]{6}$/i.test(val)) return X.toast("Use a hex colour like #7b61ff.", true); setProp(i.dataset.p, val); }); });
  $$("[data-pc]", root).forEach((i) => { i.oninput = () => { const t = $('[data-p="' + i.dataset.pc + '"]', root); if (t) t.value = i.value; }; i.onchange = R(() => setProp(i.dataset.pc, i.value)); });
  $$("[data-clr]", root).forEach((b) => { b.onclick = R(() => setProp(b.dataset.clr, "")); });
  $$("[data-hide]", root).forEach((c) => { c.onchange = R(() => setAll((x) => { x.hide = x.hide || {}; if (c.checked) x.hide[c.dataset.hide] = true; else delete x.hide[c.dataset.hide]; })); });
  $("#el-anim", root).onchange = R(() => { const a = $("#el-anim", root).value; setAll((x) => { if (a) x.anim = a; else delete x.anim; }); });
  $("#el-hover", root).onchange = R(() => { const a = $("#el-hover", root).value; setAll((x) => { if (a) x.hover = a; else delete x.hover; }); });
  $("#el-aria", root).onchange = R(() => { const a = $("#el-aria", root).value.trim(); setAll((x) => { if (a) x.aria = a; else delete x.aria; }); });
  if ($("#el-name", root)) $("#el-name", root).onchange = R(() => { const n = $("#el-name", root).value.trim(); setAll((x) => { if (n) x.name = n; else delete x.name; }); });
  $("#el-lock", root).onclick = R(() => setAll((x) => { if (locked) delete x.lock; else x.lock = true; }));
  $("#el-copy", root).onclick = () => copyStyle(); $("#el-paste", root).onclick = R(() => pasteStyle());
  $("#el-reset", root).onclick = R(() => { if (!confirm("Remove all custom styles from the selected element(s)?")) return; const sec2 = page().sections[ED().sel]; X.change(() => { ED().elSel.forEach((k) => { if (sec2.el) delete sec2.el[k]; }); if (sec2.el && !Object.keys(sec2.el).length) delete sec2.el; }); });
  $$("[data-pick]", root).forEach((b) => { b.onclick = (e) => { const E2 = ED(), k = b.dataset.pick; if (e.shiftKey) { const j = E2.elSel.indexOf(k); if (j > -1) E2.elSel.splice(j, 1); else E2.elSel.push(k); } else E2.elSel = [k]; X.right(); mark(true); }; });
  return true;
}
/* when a whole section is selected: its layers under the section panel */
export function after(root) {
  const E = ED(); if (!E || E.sel == null || (E.elSel && E.elSel.length) || !MAP[E.sel] || !root) return; const sec = page().sections[E.sel]; if (!sec) return;
  const d = document.createElement("details"); d.className = "wb-el-layers"; d.innerHTML = "<summary>Layers in this section (" + MAP[E.sel].length + ")</summary><ul class=\"wb-secs\">" + MAP[E.sel].map((e) => { const kk = keyOf(e.x), xe = (sec.el || {})[kk] || {}; return '<li><button type="button" class="wb-sname" data-pick="' + kk + '">' + esc(xe.name || TAG[e.tag] || e.tag) + "<small>" + esc(e.t || kk) + "</small></button>" + (xe.lock ? "🔒" : "") + "</li>"; }).join("") + "</ul>";
  root.appendChild(d); $$("[data-pick]", d).forEach((b) => { b.onclick = () => { ED().elSel = [b.dataset.pick]; X.right(); mark(true); }; });
}
export function copyStyle() { const E = ED(), sec = page().sections[E.sel], x = sec && sec.el && sec.el[E.elSel[0]]; CLIP = x ? JSON.parse(JSON.stringify({ st: x.st, t: x.t, m: x.m, anim: x.anim, hover: x.hover })) : {}; X.toast("Style copied."); }
export function pasteStyle() { if (!CLIP) return; setAll((x) => { ["st", "t", "m", "anim", "hover"].forEach((k) => { if (CLIP[k]) x[k] = JSON.parse(JSON.stringify(CLIP[k])); else delete x[k]; }); }); X.toast("Style pasted."); }
/* keyboard: Esc → back to the section · Delete → hide on this device · Ctrl+Alt+C / V → copy / paste style */
export function key(e) {
  const E = ED(); if (!E || !E.elSel || !E.elSel.length || /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable) return false;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (k === "escape") { clear(); return true; }
  if ((k === "delete" || k === "backspace") && !mod) { e.preventDefault(); const b = scope() === "st" ? "d" : scope(); setAll((x) => { x.hide = x.hide || {}; x.hide[b] = true; }); X.right(); X.toast("Hidden on this device. Undo with Ctrl+Z."); return true; }
  if (mod && e.altKey && k === "c") { e.preventDefault(); copyStyle(); X.right(); return true; }
  if (mod && e.altKey && k === "v") { e.preventDefault(); pasteStyle(); X.right(); return true; }
  return false;
}
