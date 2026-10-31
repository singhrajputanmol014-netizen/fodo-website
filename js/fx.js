/* FODO fx, small, dependency-free interaction layer (Aceternity-inspired, rebuilt in vanilla JS).
   floating navbar · flip words · spotlight cards · sticky Growth System · footer wordmark glow · before/after compare · copy/print templates.
   Every effect respects prefers-reduced-motion and degrades to plain content. */
(function () {
  "use strict";
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  function safe(fn, name) { try { fn(); } catch (e) { if (window.console) console.warn("fx:" + name, e); } }
  function ready(fn) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn); else fn(); }

  ready(function () {
    /* ---- 1. floating navbar: hides while scrolling down, returns on scroll up ---- */
    safe(function () {
      var h = document.getElementById("site-header"); if (!h) return;
      var last = scrollY, ticking = false;
      addEventListener("scroll", function () {
        if (ticking) return; ticking = true;
        requestAnimationFrame(function () {
          var y = scrollY, busy = document.body.classList.contains("locked") || h.contains(document.activeElement) || (h.querySelector(".sub.open"));
          if (y > 240 && y > last + 4 && !busy) h.classList.add("nav-hide");
          else if (y < last - 4 || y < 240) h.classList.remove("nav-hide");
          last = y; ticking = false;
        });
      }, { passive: true });
    }, "navbar");

    /* ---- 2. flip words: letters blur-rise into place ---- */
    safe(function () {
      document.querySelectorAll("[data-flip]").forEach(function (el) {
        var words = el.getAttribute("data-flip").split("|"), i = 0;
        var paint = function (w) {
          el.innerHTML = "";
          w.split("").forEach(function (ch, k) { var s = document.createElement("span"); s.className = "fl"; s.textContent = ch === " " ? " " : ch; s.style.animationDelay = (k * 0.035) + "s"; el.appendChild(s); });
        };
        el.setAttribute("aria-label", words.join(", "));
        if (reduce || words.length < 2) return;   // the first word is already in the HTML
        setInterval(function () {
          el.classList.add("out");
          setTimeout(function () { i = (i + 1) % words.length; el.classList.remove("out"); paint(words[i]); }, 380);
        }, 2600);
      });
    }, "flip");

    /* ---- 3. spotlight cards: a soft light follows the pointer ---- */
    safe(function () {
      if (!fine) return;
      document.addEventListener("pointermove", function (e) {
        var c = e.target.closest && e.target.closest(".spot"); if (!c) return;
        var r = c.getBoundingClientRect();
        c.style.setProperty("--sx", (e.clientX - r.left) + "px"); c.style.setProperty("--sy", (e.clientY - r.top) + "px");
      }, { passive: true });
    }, "spot");

    /* ---- 4. sticky Growth System: the pinned panel follows the step in view ---- */
    safe(function () {
      var wrap = document.querySelector(".gs-sticky"); if (!wrap) return;
      var steps = [].slice.call(wrap.querySelectorAll(".gs-step")), panel = wrap.querySelector(".gs-panel");
      var set = function (i) {
        steps.forEach(function (s, k) { s.classList.toggle("on", k === i); s.setAttribute("aria-current", k === i ? "step" : "false"); });
        var s = steps[i]; if (!s || !panel) return;
        panel.querySelector("[data-p=n]").textContent = s.dataset.n;
        panel.querySelector("[data-p=name]").textContent = s.dataset.name;
        panel.querySelector("[data-p=fodo]").textContent = s.dataset.fodo;
        panel.querySelector("[data-p=client]").textContent = s.dataset.client;
        panel.querySelector("[data-p=measure]").textContent = s.dataset.measure;
        panel.style.setProperty("--gs", (i + 1) / steps.length);
        panel.classList.remove("swap"); void panel.offsetWidth; panel.classList.add("swap");
      };
      if ("IntersectionObserver" in window) {
        var io = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) set(steps.indexOf(x.target)); }); }, { rootMargin: "-45% 0px -45% 0px" });
        steps.forEach(function (s) { io.observe(s); });
      }
      steps.forEach(function (s, k) { var tog = function () { set(k); s.classList.toggle("open"); }; s.addEventListener("click", tog); s.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tog(); } }); });
      if (steps[0]) { steps[0].classList.add("open"); }
      set(0);
    }, "sticky");

    /* ---- 5. footer wordmark: violet outline follows the cursor ---- */
    safe(function () {
      if (!fine || reduce) return;
      var run = function () {
        var m = document.querySelector(".footer-mark"); if (!m) return false;
        m.addEventListener("pointermove", function (e) { var r = m.getBoundingClientRect(); m.style.setProperty("--mx", (e.clientX - r.left) + "px"); m.style.setProperty("--my", (e.clientY - r.top) + "px"); m.classList.add("fm-on"); });
        m.addEventListener("pointerleave", function () { m.classList.remove("fm-on"); });
        return true;
      };
      if (!run()) document.addEventListener("fodo:ready", run, { once: true });
      setTimeout(run, 1200);
    }, "wordmark");

    /* ---- 5b. moving border ring on key CTAs ---- */
    safe(function () { document.querySelectorAll(".btn.mb").forEach(function (b) { if (!b.querySelector(".mb-ring")) { var r = document.createElement("span"); r.className = "mb-ring"; r.setAttribute("aria-hidden", "true"); b.appendChild(r); } }); }, "mb");

    /* ---- 6. before / after compare ---- */
    safe(function () {
      document.querySelectorAll(".cmp").forEach(function (c) {
        var r = c.querySelector("input[type=range]"); if (!r) return;
        var upd = function () { c.style.setProperty("--pos", r.value + "%"); };
        var raf = 0, hinting = false;
        var stop = function () { if (c.classList.contains("touched")) return; c.classList.add("touched"); if (hinting) { cancelAnimationFrame(raf); hinting = false; r.value = 50; upd(); } };
        r.addEventListener("input", function () { stop(); upd(); });
        ["pointerdown", "focus", "keydown", "touchstart"].forEach(function (ev) { r.addEventListener(ev, stop, { passive: true }); });
        upd();
        // one gentle sweep the first time the slider scrolls into view, so people see it can be dragged
        if (!reduce && "IntersectionObserver" in window) {
          var io = new IntersectionObserver(function (en) {
            if (!en[0].isIntersecting) return; io.disconnect();
            setTimeout(function () {
              if (c.classList.contains("touched")) return; hinting = true; var t0 = performance.now();
              var step = function (t) { var k = Math.min(1, (t - t0) / 1800); r.value = Math.round(50 - 22 * Math.sin(k * Math.PI * 2)); upd(); if (k < 1 && hinting) raf = requestAnimationFrame(step); else hinting = false; };
              raf = requestAnimationFrame(step);
            }, 900);
          }, { threshold: 0.6 });
          io.observe(c);
        }
      });
    }, "compare");

    /* ---- 7. copy / print for templates ---- */
    safe(function () {
      document.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest("[data-copy]"); if (!b) return;
        var t = document.getElementById(b.getAttribute("data-copy")); if (!t) return;
        var txt = t.innerText.trim();
        var done = function () { var o = b.textContent; b.textContent = "Copied ✓"; setTimeout(function () { b.textContent = o; }, 1600); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () {});
        else { var ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (_) {} ta.remove(); }
      });
      document.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest("[data-print]"); if (!b) return;
        var t = document.getElementById(b.getAttribute("data-print")); if (!t) return; t.classList.add("print-me"); document.body.setAttribute("data-printing", "1"); window.print();
        setTimeout(function () { document.body.removeAttribute("data-printing"); t.classList.remove("print-me"); }, 500);
      });
    }, "templates");
  });
})();
