/* FODO Website Builder v38, command palette (Ctrl/Cmd + K). One searchable list of real things: templates, your websites,
   industries, sections and commands. Each item runs a real action; nothing is decorative. Keyboard: ↑ ↓ Enter, Esc closes.
   A source is a function (query) → [{ group, label, hint, icon, run }]. */
import { esc } from "/sites/lib/render.js";

let open = null;
const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^\w\s]/g, " ");
export function score(label, extra, q) {   // simple, predictable ranking: prefix > word start > anywhere; every word must match
  const L = norm(label + " " + (extra || "")), ws = norm(q).split(/\s+/).filter(Boolean); if (!ws.length) return 1;
  let s = 0; for (const w of ws) { const i = L.indexOf(w); if (i < 0) return 0; s += i === 0 ? 30 : L.charAt(i - 1) === " " ? 20 : 8; }
  return s + Math.max(0, 20 - L.length / 10);
}
export function openPalette(sources, opt) {
  opt = opt || {}; if (open) open.close();
  const m = document.createElement("div"); m.className = "wb-pal-ov"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-label", "Search and commands");
  m.innerHTML = '<div class="wb-palx"><div class="wb-palin"><span aria-hidden="true">⌕</span><input id="wbp-q" type="text" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="wbp-l" placeholder="' + esc(opt.placeholder || "Search templates, websites, sections, commands…") + '"><kbd>Esc</kbd></div><ul id="wbp-l" role="listbox"></ul><p class="wb-palf"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Ctrl</kbd><kbd>K</kbd> anywhere</span></p></div>';
  document.body.appendChild(m);
  const q = m.querySelector("#wbp-q"), ul = m.querySelector("#wbp-l"); let items = [], sel = 0;
  const draw = () => {
    const t = q.value.trim(); items = [];
    sources.forEach((src) => { try { items = items.concat(src(t) || []); } catch (e) {} });
    items = items.map((x) => Object.assign(x, { _s: x.always ? 1 : score(x.label, x.hint + " " + (x.keys || ""), t) })).filter((x) => x._s > 0);
    const G = [], by = {}; items.forEach((x) => { if (!by[x.group]) { by[x.group] = []; G.push(x.group); } by[x.group].push(x); });
    items = []; G.forEach((g) => { by[g].sort((a, b) => b._s - a._s); items = items.concat(by[g].slice(0, t ? 8 : 5)); });
    if (sel >= items.length) sel = 0; let last = "";
    ul.innerHTML = items.length ? items.map((x, i) => (x.group !== last ? '<li class="wb-palg" role="presentation">' + esc((last = x.group)) + "</li>" : "") + '<li role="option" id="wbp-' + i + '" data-i="' + i + '" aria-selected="' + (i === sel) + '"><span class="wb-pali" aria-hidden="true">' + esc(x.icon || "›") + "</span><b>" + esc(x.label) + "</b>" + (x.hint ? "<small>" + esc(x.hint) + "</small>" : "") + "</li>").join("")
      : '<li class="wb-pal0">Nothing found for “' + esc(t) + "”" + (opt.empty ? ". " + esc(opt.empty) : "") + "</li>";
    q.setAttribute("aria-activedescendant", items.length ? "wbp-" + sel : "");
  };
  const pick = (i) => { const x = items[i]; if (!x) return; close(); try { x.run(q.value.trim()); } catch (e) {} };
  const close = () => { m.remove(); document.removeEventListener("keydown", k, true); open = null; if (opt.onClose) opt.onClose(); };
  const k = (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } else if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); mark(); } else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); } else if (e.key === "Enter" && document.activeElement === q) { e.preventDefault(); pick(sel); } };
  const mark = () => { ul.querySelectorAll("[role=option]").forEach((li) => li.setAttribute("aria-selected", +li.dataset.i === sel)); const a = ul.querySelector('[aria-selected="true"]'); if (a) { a.scrollIntoView({ block: "nearest" }); q.setAttribute("aria-activedescendant", a.id); } };
  document.addEventListener("keydown", k, true); q.oninput = () => { sel = 0; draw(); };
  ul.onclick = (e) => { const li = e.target.closest("[data-i]"); if (li) pick(+li.dataset.i); };
  ul.onmousemove = (e) => { const li = e.target.closest("[data-i]"); if (li && +li.dataset.i !== sel) { sel = +li.dataset.i; mark(); } };
  m.addEventListener("mousedown", (e) => { if (e.target === m) close(); });
  if (opt.q) q.value = opt.q; draw(); q.focus();
  open = { close }; return open;
}
/* Ctrl/Cmd+K binding (one per page); returns an unbind function */
export function bindKey(fn) { const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); fn(); } }; document.addEventListener("keydown", h); return () => document.removeEventListener("keydown", h); }

/* first-party builder analytics (cookieless, same endpoint as the site's own traffic counter; respects Do Not Track) */
export function track(name, detail) {
  try { if (navigator.doNotTrack === "1") return; const b = JSON.stringify({ t: "ev", p: "/website-builder/", e: [[String(name), String(detail || "").slice(0, 60)]] });
    if (!(navigator.sendBeacon && navigator.sendBeacon("/api/t", new Blob([b], { type: "text/plain" })))) fetch("/api/t", { method: "POST", body: b, keepalive: true, headers: { "content-type": "text/plain" } }).catch(() => {}); } catch (e) {}
}
