/* FODO site search — opens from the search icon (next to the theme toggle), Ctrl/⌘ K or "/".
   Reads data/search-index.json (built by scripts/build_pages.py). Suggestions appear while typing,
   results are ranked by title > keywords > headings > description > text, with typo tolerance
   and a few Hinglish synonyms ("kitna", "google pe aana" …). No network calls beyond the index file. */
(function () {
  "use strict";
  var U = window.FODO_UTIL || { root: "./", esc: function (s) { return String(s); } };
  var esc = U.esc, root = U.root || "./";
  var IDX = null, loading = null, box, input, list, sugg, active = -1, items = [], opener = null, lastQ = "";

  var SYN = {
    kitna: "price", kitne: "price", rate: "price", rates: "price", cost: "price", charges: "price", fees: "price", paisa: "price", package: "pricing",
    ads: "advertising", ad: "advertising", meta: "advertising", facebook: "advertising", ppc: "advertising",
    google: "seo", ranking: "seo", rank: "seo", insta: "instagram", reels: "social", reel: "social",
    competitor: "competitor", competitors: "competitor", rival: "competitor", nearby: "competitor", map: "maps",
    number: "contact", phone: "contact", whatsapp: "contact", call: "contact", baat: "contact",
    website: "web", site: "web", logo: "brand", branding: "brand", gurgaon: "gurugram", delhi: "delhi"
  };
  var POPULAR = ["Competitor finder", "Pricing", "SEO", "Paid advertising", "Free growth audit", "Gurugram", "Social media", "Templates", "Growth Score", "Founder"];

  function norm(s) { return String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ऀ-ॿ ]+/g, " ").replace(/\s+/g, " ").trim(); }
  function lev1(a, b) { // true when edit distance ≤ 1
    if (Math.abs(a.length - b.length) > 1) return false; var i = 0, j = 0, e = 0;
    while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++e > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } }
    return e + (a.length - i) + (b.length - j) <= 1;
  }
  function load() {
    if (IDX) return Promise.resolve(IDX);
    if (!loading) loading = fetch(root + "data/search-index.json", { cache: "force-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) {
      IDX = j.map(function (e) { e._t = norm(e.t); e._k = norm(e.k); e._h = norm((e.h || []).join(" | ")); e._d = norm(e.d); e._x = norm(e.x); e._w = (e._t + " " + e._k + " " + e._h + " " + e._d).split(" "); return e; });
      return IDX;
    }).catch(function (err) { loading = null; throw err; });
    return loading;
  }
  function tokens(q) {
    var t = norm(q).split(" ").filter(function (w) { return w && !/^(the|a|an|in|for|of|to|and|ka|ki|ke|hai|kya|me|mein|pe|par|ko|se|how|what|do|you|i|my)$/.test(w); });
    var out = []; t.forEach(function (w) { out.push(w); if (SYN[w] && SYN[w] !== w) out.push(SYN[w]); }); return { raw: t, all: out };
  }
  function scoreField(f, w, wt) {
    if (!f) return 0; if (f.indexOf(w) === -1) return 0;
    var re = new RegExp("(^|[ |])" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")); return re.test(f) ? wt : wt * 0.5;
  }
  function search(q) {
    var tk = tokens(q); if (!tk.raw.length || !IDX) return [];
    var res = IDX.map(function (e) {
      var s = 0, hit = 0;
      tk.raw.forEach(function (w, i) {
        var group = [w].concat(SYN[w] && SYN[w] !== w ? [SYN[w]] : []), best = 0;
        group.forEach(function (g, gi) {
          var m = gi ? 0.7 : 1;
          var v = scoreField(e._t, g, 12) + scoreField(e._k, g, 8) + scoreField(e._h, g, 5) + scoreField(e._d, g, 3) + scoreField(e._x, g, 1);
          if (!v && g.length >= 4) { for (var k = 0; k < e._w.length; k++) if (e._w[k].length >= 3 && lev1(g, e._w[k])) { v = 4; break; } }
          best = Math.max(best, v * m);
        });
        if (best) hit++; s += best;
      });
      if (tk.raw.length > 1 && e._t.indexOf(norm(q)) !== -1) s += 15;
      if (e.c === "Tool") s *= 1.05;
      return { e: e, s: s, hit: hit };
    }).filter(function (r) { return r.s > 0; });
    var full = res.filter(function (r) { return r.hit === tk.raw.length; });
    return (full.length ? full : res).sort(function (a, b) { return b.s - a.s; }).slice(0, 12).map(function (r) { return r.e; });
  }
  function suggestions(q) {
    var n = norm(q); if (!n || !IDX) return POPULAR.slice(0, 8);
    var last = n.split(" ").pop(), seen = {}, out = [];
    var add = function (s) { var k = norm(s); if (!k || seen[k] || k === n) return; seen[k] = 1; out.push(s); };
    IDX.forEach(function (e) { if (e._t.indexOf(n) === 0) add(e.t); });
    IDX.forEach(function (e) { (e.h || []).forEach(function (h) { if (norm(h).indexOf(n) === 0) add(h); }); });
    IDX.forEach(function (e) { e.t.split(/[—|:,]/).forEach(function (p) { p = p.trim(); if (norm(p).split(" ").some(function (w) { return w.indexOf(last) === 0 && last.length > 1; })) add(p); }); });
    POPULAR.forEach(function (p) { if (norm(p).indexOf(last) !== -1) add(p); });
    return out.filter(function (s) { return s.length < 60; }).slice(0, 6);
  }
  function hl(text, q) {
    var t = esc(text), ws = tokens(q).all.filter(function (w) { return w.length > 1; }); if (!ws.length) return t;
    return t.replace(new RegExp("(" + ws.map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|") + ")", "gi"), "<mark>$1</mark>");
  }
  function snippet(e, q) {
    var ws = tokens(q).all, src = e.d; var x = e.x || "", lx = x.toLowerCase();
    for (var i = 0; i < ws.length; i++) { var p = lx.indexOf(ws[i]); if (p > -1 && e._d.indexOf(ws[i]) === -1) { src = (p > 40 ? "…" : "") + x.slice(Math.max(0, p - 40), p + 120).trim() + "…"; break; } }
    return hl(src, q);
  }

  function build() {
    if (box) return;
    box = document.createElement("div"); box.className = "srch"; box.id = "site-search"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", "Search FODO");
    box.innerHTML = '<div class="srch-panel"><div class="srch-top"><span class="srch-ico" aria-hidden="true">' + ((U.ico && U.ico.search) || "") + '</span>' +
      '<input class="srch-in" id="srch-in" type="search" placeholder="Search services, prices, areas, tools…" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="srch-list" aria-autocomplete="list" aria-label="Search the FODO website">' +
      '<button class="srch-x" type="button" aria-label="Close search"><kbd>Esc</kbd></button></div>' +
      '<div class="srch-sugg" id="srch-sugg" aria-label="Suggestions"></div>' +
      '<ul class="srch-list" id="srch-list" role="listbox" aria-label="Results"></ul>' +
      '<div class="srch-foot"><span><kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to open</span><span class="srch-count" aria-live="polite"></span></div></div>';
    document.body.appendChild(box);
    input = box.querySelector(".srch-in"); list = box.querySelector(".srch-list"); sugg = box.querySelector(".srch-sugg");
    box.addEventListener("click", function (e) { if (e.target === box) close(); });
    box.querySelector(".srch-x").addEventListener("click", close);
    input.addEventListener("input", function () { render(input.value); });
    input.addEventListener("keydown", onKey);
    sugg.addEventListener("click", function (e) { var b = e.target.closest("button[data-s]"); if (!b) return; input.value = b.getAttribute("data-s"); render(input.value); input.focus(); });
    list.addEventListener("mousemove", function (e) { var li = e.target.closest("[role=option]"); if (li) setActive(items.indexOf(li)); });
    list.addEventListener("click", function (e) { var b = e.target.closest("[data-ask]"); if (b) { e.preventDefault(); ask(b.getAttribute("data-ask")); } });
    box.addEventListener("keydown", function (e) { if (e.key === "Tab") { var f = [].slice.call(box.querySelectorAll("input,button,a[href]")).filter(function (x) { return x.offsetParent; }); if (!f.length) return; var a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { z.focus(); e.preventDefault(); } else if (!e.shiftKey && document.activeElement === z) { a.focus(); e.preventDefault(); } } });
  }
  function render(q) {
    lastQ = q; var s = suggestions(q);
    sugg.innerHTML = (q.trim() ? '<span class="srch-lab">Suggestions</span>' : '<span class="srch-lab">Popular</span>') + s.map(function (x) { return '<button type="button" class="chip" data-s="' + esc(x) + '">' + hl(x, q) + "</button>"; }).join("");
    sugg.hidden = !s.length;
    if (!IDX) { list.innerHTML = '<li class="srch-empty">Loading…</li>'; load().then(function () { if (lastQ === q) render(q); }, function () { list.innerHTML = '<li class="srch-empty">Search is unavailable right now. Try the menu instead.</li>'; }); return; }
    var r = q.trim() ? search(q) : IDX.filter(function (e) { return /^(pricing|competitor-finder|services|contact|growth-score|templates)\/$/.test(e.u); });
    var head = q.trim() ? "" : '<li class="srch-group" role="presentation">Start here</li>';
    list.innerHTML = head + r.map(function (e, i) {
      return '<li role="option" id="srch-o' + i + '" aria-selected="false"><a href="' + root + e.u + '"><span class="srch-c">' + esc(e.c) + '</span><b>' + hl(e.t, q) + '</b><span class="srch-d">' + (q.trim() ? snippet(e, q) : esc(e.d)) + "</span></a></li>";
    }).join("") + (q.trim() ? '<li class="srch-ask" role="presentation"><button type="button" class="btn ghost sm" data-ask="' + esc(q) + '">Ask the FODO assistant: “' + esc(q.slice(0, 50)) + '”</button></li>' : "");
    if (q.trim() && !r.length) list.insertAdjacentHTML("afterbegin", '<li class="srch-empty" role="presentation">No page matches “' + esc(q) + '”. Try one of the suggestions, or ask the assistant.</li>');
    items = [].slice.call(list.querySelectorAll("[role=option]")); active = -1;
    input.setAttribute("aria-expanded", items.length ? "true" : "false"); input.removeAttribute("aria-activedescendant");
    box.querySelector(".srch-count").textContent = q.trim() ? (r.length + (r.length === 1 ? " result" : " results")) : "";
    if (q.trim() && items.length) setActive(0);
  }
  function setActive(i) {
    items.forEach(function (li, k) { li.setAttribute("aria-selected", k === i ? "true" : "false"); });
    active = i; if (items[i]) { input.setAttribute("aria-activedescendant", items[i].id); items[i].scrollIntoView({ block: "nearest" }); }
  }
  function onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); if (items.length) setActive((active + 1) % items.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (items.length) setActive((active - 1 + items.length) % items.length); }
    else if (e.key === "Enter") { var li = items[active] || items[0]; if (li) { e.preventDefault(); location.href = li.querySelector("a").href; } }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  }
  function ask(q) {
    close(); var fab = document.querySelector(".bot-fab");
    var go = function () { var f = document.querySelector(".bot-fab"); if (!f) return false; f.click(); setTimeout(function () { var i = document.getElementById("bot-in"); if (i) { i.value = q; i.focus(); } }, 350); return true; };
    if (fab) { go(); return; }
    document.dispatchEvent(new Event("pointerdown")); window.dispatchEvent(new Event("scroll"));
    var n = 0, t = setInterval(function () { if (go() || ++n > 40) clearInterval(t); }, 150);
  }
  function open(e) {
    build(); opener = (e && e.currentTarget) || document.activeElement;
    box.classList.add("open"); document.body.classList.add("locked");
    input.value = ""; render(""); setTimeout(function () { input.focus(); }, 30);
    load().catch(function () {});
  }
  function close() {
    if (!box || !box.classList.contains("open")) return;
    box.classList.remove("open"); document.body.classList.remove("locked");
    if (opener && opener.focus) opener.focus();
  }
  window.FODO_SEARCH = { open: open, close: close, search: function (q) { return load().then(function () { return search(q); }); }, suggest: function (q) { return load().then(function () { return suggestions(q); }); } };

  function wire() {
    var b = document.getElementById("search-open"); if (b && !b._w) { b._w = 1; b.addEventListener("click", open); b.addEventListener("pointerenter", function () { load().catch(function () {}); }, { once: true }); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();
  document.addEventListener("keydown", function (e) {
    var tag = (e.target && e.target.tagName) || "", typing = /INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable);
    if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); box && box.classList.contains("open") ? close() : open(); }
    else if (e.key === "/" && !typing && !(box && box.classList.contains("open"))) { e.preventDefault(); open(); }
  });
})();
