/* FODO Website Builder v39, phone editor. On screens up to 760px the editor becomes: compact top bar → the website at full
   width → a bottom navigation (Add · Sections · Edit · AI · More). The left panel (add, sections, pages, design, SEO, store)
   and the right panel (edit the selected section) open as bottom sheets that close with ✕, a tap outside, Escape or a swipe
   down. Desktop is untouched: the navigation is hidden by CSS above 760px and nothing here runs a layout change there. */
const $ = (s, el) => (el || document).querySelector(s);
const MQ = "(max-width:760px)";
export const isPhone = () => { try { return matchMedia(MQ).matches; } catch (e) { return false; } };
const I = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
const ICON = {
  add: I('<path d="M12 5v14M5 12h14"/>'), sections: I('<rect x="4" y="4" width="16" height="6" rx="1.5"/><rect x="4" y="14" width="16" height="6" rx="1.5"/>'),
  edit: I('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'), ai: I('<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
  more: I('<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>'),
};
const TITLE = { left: "Build", right: "Edit section" };
let C = null, ed = null;

export function mount(ctx) {
  C = ctx; ed = $(".wb-ed"); if (!ed || $(".wb-mnav", ed)) return;
  const nav = document.createElement("nav"); nav.className = "wb-mnav"; nav.setAttribute("aria-label", "Editor");
  nav.innerHTML = [["add", "Add"], ["sections", "Sections"], ["edit", "Edit"], ["ai", "AI"], ["more", "More"]].map((x) => '<button type="button" data-m="' + x[0] + '"' + (x[0] === "ai" ? ' class="ai"' : "") + ' aria-pressed="false">' + ICON[x[0]] + "<span>" + x[1] + "</span></button>").join("");
  const shade = document.createElement("div"); shade.className = "wb-shade"; shade.setAttribute("aria-hidden", "true");
  ed.appendChild(shade); ed.appendChild(nav);
  shade.onclick = close;
  nav.onclick = (e) => { const b = e.target.closest("[data-m]"); if (!b) return; const m = b.dataset.m; menuOff();
    if (m === "add" || m === "sections") { if (ed.classList.contains("sh-left") && C.ED().tab === m) return close(); C.setTab(m); open("left", m); }
    if (m === "edit") { if (ed.classList.contains("sh-right")) return close(); open("right", "edit"); }
    if (m === "ai") { close(); C.openCmd(); }
    if (m === "more") moreMenu(b); };
  ["left", "right"].forEach((side) => { const p = $(".wb-" + side, ed); if (!p) return; bar(p, side); new MutationObserver(() => bar(p, side)).observe(p, { childList: true }); });
  document.addEventListener("keydown", onKey);
  // the left panel's own tabs keep the sheet open and the bottom nav in step
  ed.addEventListener("click", (e) => { const t = e.target.closest(".wb-left [data-tab]"); if (t) mark("left", t.dataset.tab); });
  try { matchMedia(MQ).addEventListener("change", (e) => { if (!e.matches) { close(); menuOff(); } }); } catch (e) {}
}
/* a section picked from the Sections list opens its settings; a tap on the website itself only shows an "Edit" chip, so the
   page stays visible and a double-tap can still edit text in place */
export function onSelect(fromCanvas, label) {
  if (!ed || !ed.isConnected || !isPhone()) return;
  if (!fromCanvas) return open("right", "edit");
  if (ed.classList.contains("sh-right")) return;
  let c = $(".wb-mchip", ed); if (!c) { c = document.createElement("button"); c.type = "button"; c.className = "wb-mchip"; ed.appendChild(c); c.onclick = () => { c.remove(); open("right", "edit"); }; }
  c.innerHTML = ICON.edit + "<span>Edit " + String(label || "section").replace(/[<>&"]/g, "") + "</span>"; clearTimeout(c._t); c._t = setTimeout(() => c.remove(), 6000);
}

function bar(p, side) {
  if (p.firstElementChild && p.firstElementChild.classList.contains("wb-sheetbar")) return;
  const b = document.createElement("div"); b.className = "wb-sheetbar";
  b.innerHTML = "<b>" + TITLE[side] + '</b><button type="button" class="wb-ib" aria-label="Close panel">✕</button>';
  b.querySelector("button").onclick = close; p.prepend(b); swipe(b, p);
}
function swipe(handle, sheet) {   // drag the sheet's top bar down to close it
  let y0 = null, dy = 0;
  handle.addEventListener("pointerdown", (e) => { if (e.target.closest("button")) return; y0 = e.clientY; dy = 0; sheet.style.transition = "none"; handle.setPointerCapture(e.pointerId); });
  handle.addEventListener("pointermove", (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sheet.style.transform = "translateY(" + dy + "px)"; });
  const end = () => { if (y0 == null) return; y0 = null; sheet.style.transition = ""; sheet.style.transform = ""; if (dy > 70) close(); };
  handle.addEventListener("pointerup", end); handle.addEventListener("pointercancel", end);
}
function open(side, which) {
  if (!ed || !isPhone()) return; const chip = $(".wb-mchip", ed); if (chip) chip.remove();
  ed.classList.toggle("sh-left", side === "left"); ed.classList.toggle("sh-right", side === "right");
  const p = $(".wb-" + side, ed); if (p) { const t = $(".wb-sheetbar b", p); if (t) t.textContent = side === "right" ? (C.ED().sel != null ? "Edit section" : "Edit") : ({ sections: "Sections", add: "Add to your page", pages: "Pages", design: "Design", seo: "SEO", store: "Store", more: "More" })[which] || "Build"; }
  mark(side, which);
}
export function close() { if (!ed) return; ed.classList.remove("sh-left", "sh-right"); mark(null); }
function mark(side, which) {
  if (!ed) return; const m = side === "right" ? "edit" : side === "left" ? (which === "add" || which === "sections" ? which : "more") : null;
  ed.querySelectorAll(".wb-mnav [data-m]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.m === m)));
}
function onKey(e) { if (!ed || !ed.isConnected) return document.removeEventListener("keydown", onKey); if (e.key === "Escape" && (ed.classList.contains("sh-left") || ed.classList.contains("sh-right") || $(".wb-mmenu"))) { close(); menuOff(); } }
function menuOff() { const m = $(".wb-mmenu"); if (m) m.remove(); }
function moreMenu(btn) {
  if ($(".wb-mmenu")) return menuOff();
  close(); btn.setAttribute("aria-pressed", "true");
  const items = [["pages", "▤", "Pages"], ["design", "◐", "Design"], ["seo", "⌕", "SEO"], ["store", "🛍", "Store"], ["preview", "▶", "Preview"], ["audit", "✓", "Audit"], ["share", "🔗", "Share"], ["settings", "⚙", "Settings"], ["more", "⋯", "Forms, history…"]];
  const m = document.createElement("div"); m.className = "wb-mmenu"; m.setAttribute("role", "menu");
  m.innerHTML = items.map((x) => '<button type="button" role="menuitem" data-mm="' + x[0] + '"><span aria-hidden="true">' + x[1] + "</span>" + x[2] + "</button>").join("");
  document.body.appendChild(m); const f = m.querySelector("button"); if (f) f.focus();
  setTimeout(() => document.addEventListener("click", function off(e) { if (!m.contains(e.target) && !e.target.closest('[data-m="more"]')) { menuOff(); btn.setAttribute("aria-pressed", "false"); document.removeEventListener("click", off); } }), 0);
  m.onclick = (e) => { const b = e.target.closest("[data-mm]"); if (!b) return; const k = b.dataset.mm; menuOff(); btn.setAttribute("aria-pressed", "false");
    if (["pages", "design", "seo", "store", "more"].indexOf(k) > -1) { C.setTab(k); open("left", k); }
    else if (C[k]) C[k](); };
}
