/* FODO Website Builder v36, shared collections (Team, Reviews, Portfolio).
   One list per site in doc.collections; any Team / Reviews / Portfolio section can show it ("Shared collection"),
   with a limit and, for the portfolio, a category. Edit the list once, every section that uses it updates.
   Reviews must be real: each one keeps where it came from (Google, email, WhatsApp…). FODO never writes reviews. */
import { modal } from "/js/wb-panels.js";
import { esc, COLLECTIONS } from "/sites/lib/render.js";

let X = null; export function bind(ctx) { X = ctx; }
const $ = (s, el) => (el || document).querySelector(s), $$ = (s, el) => [...(el || document).querySelectorAll(s)];
const doc = () => X.ED().doc;
const list = (type) => { const d = doc(); d.collections = d.collections || {}; d.collections[type] = d.collections[type] || []; return d.collections[type]; };
const count = (type) => ((doc().collections || {})[type] || []).length;
const LABEL = { name: "Name", role: "Role / company", image: "Photo", bio: "Short bio", quote: "Review text", source: "Where it came from (e.g. Google review, email)", title: "Project", category: "Category", text: "Description", link: "Link", result: "Result (only if measured)" };
const NEW = { team: { name: "", role: "", image: "" }, testimonials: { quote: "", name: "", role: "", source: "" }, portfolio: { title: "Project", category: "", text: "", image: "", link: "" } };
export const isCollType = (t) => !!COLLECTIONS[t];
/* keys the generic property editor must not show for these sections */
export const hiddenKeys = (sec, p) => (isCollType(sec.type) ? (p.from === "collection" ? ["from", "limit", "category", "items"] : ["from", "limit", "category"]) : []);

/* the "Content" box at the top of a Team / Reviews / Portfolio section */
export function sourceBox(sec, p) {
  if (!isCollType(sec.type)) return "";
  const C = COLLECTIONS[sec.type], shared = p.from === "collection", n = count(sec.type);
  const cats = sec.type === "portfolio" ? [...new Set(((doc().collections || {}).portfolio || []).map((x) => x.category).filter(Boolean))] : [];
  return '<fieldset class="wb-coll"><legend>Content</legend><label class="wb-lab">Show<select id="wb-csrc"><option value="own"' + (shared ? "" : " selected") + ">This section's own list</option><option value=\"collection\"" + (shared ? " selected" : "") + ">Shared " + esc(C.label.toLowerCase()) + " collection (" + n + ")</option></select></label>" +
    (shared ? '<div class="wb-row"><label class="wb-lab">How many<input type="number" min="0" max="' + C.max + '" id="wb-clim" value="' + esc(p.limit || "") + '" placeholder="all"></label>' +
      (sec.type === "portfolio" ? '<label class="wb-lab">Category<select id="wb-ccat"><option value="">All</option>' + cats.map((k) => "<option" + (k === p.category ? " selected" : "") + ">" + esc(k) + "</option>").join("") + "</select></label>" : "") + "</div>" +
      '<button type="button" class="wb-btn sm wb-full" id="wb-cedit">Edit the shared ' + esc(C.label.toLowerCase()) + " (" + n + ")</button><p class=\"wb-muted\">Every section showing this collection updates when you edit it.</p>" : "") + "</fieldset>";
}
export function wireSource(el, sec, p) {
  const s = $("#wb-csrc", el); if (!s) return;
  s.onchange = () => X.change(() => {
    if (s.value === "collection") { const own = Array.isArray(p.items) ? p.items : []; const L = list(sec.type);
      if (!L.length && own.length) { own.forEach((x) => L.push(pick(sec.type, x))); X.toast("Moved " + own.length + " item(s) into the shared collection."); }
      p.from = "collection"; }
    else { if ((!p.items || !p.items.length) && count(sec.type)) p.items = JSON.parse(JSON.stringify(list(sec.type))); delete p.from; delete p.limit; delete p.category; }
    X.right(); });
  const lim = $("#wb-clim", el); if (lim) lim.onchange = () => X.change(() => { const n = parseInt(lim.value, 10); if (n > 0) p.limit = n; else delete p.limit; });
  const cat = $("#wb-ccat", el); if (cat) cat.onchange = () => X.change(() => { if (cat.value) p.category = cat.value; else delete p.category; });
  const ed = $("#wb-cedit", el); if (ed) ed.onclick = () => editor(sec.type);
}
const pick = (type, x) => { const o = {}; COLLECTIONS[type].fields.forEach((f) => { if (x && x[f] != null) o[f] = x[f]; }); return o; };

/* the collection editor (modal) */
export function editor(type) {
  const C = COLLECTIONS[type]; if (!C) return;
  const m = modal('<div class="wb-cm"><h2>' + esc(C.label) + ' <small class="wb-muted" id="cm-n"></small></h2>' +
    (type === "testimonials" ? '<p class="wb-warnbox">Add only real reviews from real customers, with where each one came from. Never write or edit a review to sound better.</p>' : "") +
    '<div id="cm-list"></div><div class="wb-row"><button type="button" class="wb-btn sm pri" id="cm-add">+ Add</button><button type="button" class="wb-btn sm" data-x>Done</button></div></div>', "wb-cmw");
  const draw = () => { const L = list(type); $("#cm-n", m).textContent = L.length + " item" + (L.length === 1 ? "" : "s") + " · shown by " + users(type) + " section" + (users(type) === 1 ? "" : "s");
    $("#cm-list", m).innerHTML = L.length ? L.map((it, i) => '<div class="wb-item" data-i="' + i + '"><div class="wb-itbar"><b>' + (i + 1) + '</b><button type="button" class="wb-ib sm" data-up="' + i + '" aria-label="Move up">↑</button><button type="button" class="wb-ib sm" data-del="' + i + '" aria-label="Delete">✕</button></div>' +
      C.fields.map((f) => '<label class="wb-lab">' + esc(LABEL[f] || f) + (f === "image" ? '<div class="wb-img"><input data-f="' + f + '" value="' + esc(it[f] || "") + '"><button type="button" class="wb-ib sm" data-pick="' + i + '" aria-label="Choose image">⇪</button></div>'
        : C.long.indexOf(f) > -1 ? '<textarea rows="3" data-f="' + f + '">' + esc(it[f] || "") + "</textarea>" : '<input data-f="' + f + '" value="' + esc(it[f] || "") + '">') + "</label>").join("") + "</div>").join("")
      : '<p class="wb-muted">Nothing here yet. Add the first one.</p>';
    $$("[data-f]", m).forEach((inp) => { inp.onchange = () => { const i = +inp.closest("[data-i]").dataset.i; X.change(() => { list(type)[i][inp.dataset.f] = inp.value.trim(); }); }; });
    $$("[data-del]", m).forEach((b) => { b.onclick = () => { if (!confirm("Delete this item from every section that shows the collection?")) return; X.change(() => { list(type).splice(+b.dataset.del, 1); }); draw(); }; });
    $$("[data-up]", m).forEach((b) => { b.onclick = () => { const i = +b.dataset.up; if (!i) return; X.change(() => { const L2 = list(type), [x] = L2.splice(i, 1); L2.splice(i - 1, 0, x); }); draw(); }; });
    $$("[data-pick]", m).forEach((b) => { b.onclick = () => X.upload((url) => { X.change(() => { list(type)[+b.dataset.pick].image = url; }); draw(); }); }); };
  $("#cm-add", m).onclick = () => { if (list(type).length >= C.max) return X.toast("Up to " + C.max + " items.", true); X.change(() => { list(type).push(JSON.parse(JSON.stringify(NEW[type]))); }); draw(); const last = $$("[data-i]", m).pop(); if (last) { last.scrollIntoView({ block: "nearest" }); const f = last.querySelector("input,textarea"); if (f) f.focus(); } };
  draw(); m.addEventListener("click", (e) => { if (e.target.closest("[data-x]") || e.target === m) X.right(); });
  return m;
}
/* how many sections (all pages + reusable components) show this collection */
export function users(type) { const d = doc(); let n = 0; (d.pages || []).forEach((p) => (p.sections || []).forEach((s) => { if (s.type === type && (s.props || {}).from === "collection") n++; })); (d.components || []).forEach((k) => { if (k.type === type && (k.props || {}).from === "collection") n++; }); return n; }

/* left panel: the three collections with counts */
export function panel(el) {
  el.innerHTML = '<p class="wb-muted">Lists you keep once and show in any Team, Reviews or Portfolio section.</p><ul class="wb-colls">' + Object.keys(COLLECTIONS).map((k) => "<li><span><b>" + esc(COLLECTIONS[k].label) + "</b><small>" + count(k) + " items · " + users(k) + " sections</small></span><button type=\"button\" class=\"wb-btn sm\" data-ce=\"" + k + '">Edit</button></li>').join("") + "</ul>";
  $$("[data-ce]", el).forEach((b) => { b.onclick = () => { const m = editor(b.dataset.ce); m.addEventListener("click", (e) => { if (e.target.closest("[data-x]") || e.target === m) panel(el); }); }; });
}
