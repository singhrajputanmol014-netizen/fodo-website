/* FODO Growth Lab — shared player profile (XP, levels, badges, daily streak, best scores) + game "juice".
   Everything is stored ONLY in this browser (localStorage key "fodo-lab"); nothing is sent anywhere.
   Exposes window.FODO_LAB. Loaded on the Lab tool pages (score, quiz, game, roi). */
(function () {
  "use strict";
  if (window.FODO_LAB) return;
  var KEY = "fodo-lab";
  var LEVELS = [
    [0, "Intern"], [150, "Marketing Associate"], [400, "Growth Executive"], [800, "Performance Lead"],
    [1400, "Growth Manager"], [2200, "Head of Growth"], [3300, "CMO"], [5000, "Growth Legend"]
  ];
  var BADGES = {
    first_steps: ["First steps", "Finished your first Growth Lab activity"],
    score_done: ["Know thyself", "Completed the Growth Score"],
    quiz_done: ["Quiz taker", "Finished the marketing quiz"],
    quiz_perfect: ["Flawless", "10/10 in the marketing quiz"],
    quiz_speed: ["Quick draw", "Answered 5 quiz questions in under 5 seconds each"],
    streak5: ["On fire", "5 correct answers in a row"],
    streak10: ["Unstoppable", "10 correct answers in a row"],
    game_done: ["Challenger", "Finished the FODO Challenge"],
    game_80: ["Growth brain", "Scored 80+ in the FODO Challenge"],
    game_daily: ["Daily runner", "Played today's Daily Challenge"],
    days3: ["Habit forming", "Played the Lab 3 days in a row"],
    days7: ["Weekly ritual", "Played the Lab 7 days in a row"],
    lab_all: ["Full stack marketer", "Tried the Score, the Quiz and the Challenge"],
    level5: ["Manager material", "Reached Growth Manager"]
  };
  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function dayDiff(a, b) { return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5); }
  function load() { try { return Object.assign({ xp: 0, badges: {}, best: {}, plays: {}, lastDay: "", days: 0, history: [] }, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { return { xp: 0, badges: {}, best: {}, plays: {}, lastDay: "", days: 0, history: [] }; } }
  var P = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} }
  function level(xp) { var i = 0; for (var k = 0; k < LEVELS.length; k++) if (xp >= LEVELS[k][0]) i = k; var next = LEVELS[i + 1];
    return { n: i + 1, name: LEVELS[i][1], from: LEVELS[i][0], to: next ? next[0] : null, pct: next ? (xp - LEVELS[i][0]) / (next[0] - LEVELS[i][0]) : 1, nextName: next ? next[1] : null }; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* ---------- toasts ---------- */
  var tray;
  function toast(html, kind) {
    if (!tray) { tray = document.createElement("div"); tray.className = "lab-toasts"; tray.setAttribute("aria-live", "polite"); document.body.appendChild(tray); }
    var t = document.createElement("div"); t.className = "lab-toast " + (kind || ""); t.innerHTML = html; tray.appendChild(t);
    while (tray.children.length > 2) tray.firstChild.remove();
    setTimeout(function () { t.classList.add("out"); setTimeout(function () { t.remove(); }, 400); }, 3200);
  }
  function badge(id) {
    if (!BADGES[id] || P.badges[id]) return false;
    P.badges[id] = today(); save();
    toast('<b>Badge unlocked · ' + esc(BADGES[id][0]) + '</b><span>' + esc(BADGES[id][1]) + '</span>', "badge");
    paintBars(); return true;
  }
  function touchDay() {
    var t = today();
    if (P.lastDay === t) return;
    P.days = P.lastDay && dayDiff(P.lastDay, t) === 1 ? P.days + 1 : 1; P.lastDay = t; save();
    if (P.days >= 3) badge("days3"); if (P.days >= 7) badge("days7");
  }
  function addXP(n, why) {
    n = Math.max(0, Math.round(n)); if (!n) return;
    var before = level(P.xp); P.xp += n; var after = level(P.xp); save();
    toast('<b>+' + n + ' XP</b><span>' + esc(why || "") + '</span>', "xp");
    if (after.n > before.n) { toast('<b>Level up · ' + esc(after.name) + '</b><span>Level ' + after.n + ' of ' + LEVELS.length + '</span>', "level"); burst(); }
    if (after.n >= 5) badge("level5");
    paintBars();
  }
  function record(tool, score, extra) {
    touchDay();
    P.plays[tool] = (P.plays[tool] || 0) + 1;
    var prev = P.best[tool]; var isBest = prev == null || score > prev; if (isBest) P.best[tool] = score;
    P.history.unshift({ tool: tool, score: score, at: Date.now(), extra: extra || null }); P.history = P.history.slice(0, 30); save();
    badge("first_steps");
    if (P.plays.score && P.plays.quiz && P.plays.game) badge("lab_all");
    return { isBest: isBest && prev != null, prev: prev, first: prev == null };
  }

  /* ---------- confetti (CSS-only particles, respects reduced motion) ---------- */
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function burst(x, y, n) {
    if (reduce) return;
    var host = document.createElement("div"); host.className = "lab-burst"; host.setAttribute("aria-hidden", "true");
    host.style.left = (x == null ? innerWidth / 2 : x) + "px"; host.style.top = (y == null ? innerHeight / 3 : y) + "px";
    var cols = ["#5B3DF5", "#0B0B0C", "#1FA463", "#F5B62D", "#FF6F8E"];
    for (var i = 0; i < (n || 26); i++) { var s = document.createElement("i"); var a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 120;
      s.style.setProperty("--x", Math.cos(a) * d + "px"); s.style.setProperty("--y", Math.sin(a) * d - 40 + "px"); s.style.setProperty("--r", (Math.random() * 540 - 270) + "deg");
      s.style.background = cols[i % cols.length]; s.style.animationDelay = (Math.random() * .08) + "s"; host.appendChild(s); }
    document.body.appendChild(host); setTimeout(function () { host.remove(); }, 1100);
  }
  function floatPts(el, text, good) {
    if (!el) return; var r = el.getBoundingClientRect(), f = document.createElement("span");
    f.className = "lab-float " + (good ? "good" : "bad"); f.textContent = text; f.setAttribute("aria-hidden", "true");
    f.style.left = (r.left + r.width / 2) + "px"; f.style.top = (r.top + 8) + "px"; document.body.appendChild(f);
    setTimeout(function () { f.remove(); }, 1000);
  }
  function shake(el) { if (!el || reduce) return; el.classList.remove("lab-shake"); void el.offsetWidth; el.classList.add("lab-shake"); }

  /* ---------- profile bar ---------- */
  var bars = [];
  function barHTML() {
    var L = level(P.xp), nb = Object.keys(P.badges).length;
    return '<div class="lab-bar-in"><span class="lab-lvl" aria-label="Level ' + L.n + '">' + L.n + '</span>' +
      '<div class="lab-who"><b>' + esc(L.name) + '</b><span>' + P.xp + ' XP' + (L.to ? ' · ' + (L.to - P.xp) + ' to ' + esc(L.nextName) : ' · max level') + '</span>' +
      '<i class="lab-xp" aria-hidden="true"><b style="width:' + Math.round(L.pct * 100) + '%"></b></i></div>' +
      '<div class="lab-stats"><span title="Days in a row"><b>' + (P.days || 0) + '</b> day streak</span><span title="Badges"><b>' + nb + '</b>/' + Object.keys(BADGES).length + ' badges</span></div>' +
      '<button type="button" class="lab-badges-btn" aria-expanded="false">Badges</button></div><div class="lab-badges" hidden>' +
      Object.keys(BADGES).map(function (k) { var got = !!P.badges[k]; return '<span class="lab-badge' + (got ? " got" : "") + '" title="' + esc(BADGES[k][1]) + '"><i aria-hidden="true">' + (got ? "★" : "☆") + '</i>' + esc(BADGES[k][0]) + '<em class="sr-only">' + (got ? " (unlocked)" : " (locked)") + '</em></span>'; }).join("") + '</div>';
  }
  function mountBar(where) {
    if (!where) return; var el = document.createElement("div"); el.className = "lab-bar panel"; el.setAttribute("role", "region"); el.setAttribute("aria-label", "Your Growth Lab progress");
    el.innerHTML = barHTML(); where.parentNode.insertBefore(el, where); bars.push(el);
    el.addEventListener("click", function (ev) { var b = ev.target.closest(".lab-badges-btn"); if (!b) return; var p = el.querySelector(".lab-badges"); p.hidden = !p.hidden; b.setAttribute("aria-expanded", String(!p.hidden)); });
  }
  function paintBars() { bars.forEach(function (el) { var open = !el.querySelector(".lab-badges").hidden; el.innerHTML = barHTML(); if (open) { el.querySelector(".lab-badges").hidden = false; el.querySelector(".lab-badges-btn").setAttribute("aria-expanded", "true"); } }); }

  /* ---------- daily seed (same daily set for everyone, changes at midnight) ---------- */
  function dailySeed() { var t = today().replace(/-/g, ""); var h = 2166136261; for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { var s = seed >>> 0; return function () { s += 0x6D2B79F5; var t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function dayNo() { return dayDiff("2026-10-01", today()) + 1; }
  function msToMidnight() { var n = new Date(), m = new Date(n); m.setHours(24, 0, 0, 0); return m - n; }

  window.FODO_LAB = { get profile() { return P; }, level: function () { return level(P.xp); }, addXP: addXP, badge: badge, record: record, toast: toast,
    burst: burst, floatPts: floatPts, shake: shake, mountBar: mountBar, dailySeed: dailySeed, rng: rng, dayNo: dayNo, msToMidnight: msToMidnight, today: today, BADGES: BADGES };

  // auto-mount on Lab pages
  function ready() {
    var route = document.body.dataset.route;
    var target = { score: "#score-form", quiz: "#quiz", game: "#intro", roi: "#roi-form" }[route];
    if (target) mountBar(document.querySelector(target));
    if (route === "roi") { touchDay(); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready); else ready();
})();
